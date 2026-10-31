const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { tierForCoins, GIFT_TIERS } = require('./gift-tiers');

const PORT = Number(process.env.PORT) || 3000;
const LEADERBOARD_SIZE = 3;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pixiDist = path.join(path.dirname(require.resolve('pixi.js')), '..', 'dist');
app.use('/lib',express.static(pixiDist));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/overlay', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/api/tiers', (_req, res) => res.json(GIFT_TIERS));

// ---- session state ---------------------------------------------------------

const scores = new Map(); // uniqueId -> { name, score }
let connection = null;
let status = { state: 'idle', message: 'Chưa kết nối', uniqueId: null, roomId: null };

function leaderboard() {
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE);
}

function setStatus(next) {
  status = { ...status, ...next };
  io.emit('status', status);
}

function emitLeaderboard() {
  io.emit('leaderboard', leaderboard());
}

function addScore(userId, name, coins) {
  const entry = scores.get(userId) || { name, score: 0 };
  entry.name = name;
  entry.score += coins;
  scores.set(userId, entry);
  emitLeaderboard();
}

// ---- event pipeline (shared by real TikTok events and admin simulation) ----

function handleGift({ userId, name, coins, giftName, count }) {
  if (!(coins > 0)) return;
  const tier = tierForCoins(coins);
  addScore(userId, name, coins);
  io.emit('overlay', { type: 'gift', user: name, userId, coins, giftName, count, tier: tier ? tier.id : null });
}

function handleChat({ userId, name, text }) {
  if (!text) return;
  io.emit('overlay', { type: 'chat', user: name, userId, text: String(text).slice(0, 120) });
}

// ---- TikTok connection -----------------------------------------------------

function userOf(data) {
  const u = (data && data.user) || {};
  const userId = u.uniqueId || u.userId || u.nickname || 'khach';
  const name = u.nickname || u.uniqueId || 'Khách';
  return { userId: String(userId), name };
}

function attachTikTokHandlers(conn) {
  conn.on(WebcastEvent.GIFT, (data) => {
    const streakable = data.giftDetails && data.giftDetails.giftType === 1;
    // A streakable gift fires repeatedly while the streak runs; count it once, when it ends.
    if (streakable && !data.repeatEnd) return;
    const perUnit = Number((data.giftDetails && data.giftDetails.diamondCount) || 0);
    const count = Math.max(1, Number(data.repeatCount) || 1);
    handleGift({
      ...userOf(data),
      coins: perUnit * count,
      giftName: (data.giftDetails && data.giftDetails.giftName) || 'Quà',
      count,
    });
  });

  conn.on(WebcastEvent.CHAT, (data) => handleChat({ ...userOf(data), text: data.comment }));

  conn.on(WebcastEvent.STREAM_END, () => {
    setStatus({ state: 'idle', message: 'Phiên live đã kết thúc', roomId: null });
    connection = null;
  });

  conn.on(ControlEvent.DISCONNECTED, () => {
    if (connection === conn) {
      setStatus({ state: 'idle', message: 'Mất kết nối với TikTok', roomId: null });
      connection = null;
    }
  });

  conn.on(ControlEvent.ERROR, (err) => {
    console.error('[tiktok] error:', err && err.message ? err.message : err);
  });
}

async function connectLive(rawId) {
  const uniqueId = String(rawId || '').trim().replace(/^@/, '');
  if (!uniqueId) {
    setStatus({ state: 'error', message: 'Chưa nhập ID TikTok' });
    return;
  }
  if (connection) await disconnectLive();

  setStatus({ state: 'connecting', message: `Đang kết nối @${uniqueId}...`, uniqueId });
  const conn = new TikTokLiveConnection(uniqueId);
  attachTikTokHandlers(conn);
  connection = conn;
  try {
    const state = await conn.connect();
    if (connection !== conn) return;
    setStatus({
      state: 'connected',
      message: `Đã kết nối phòng Live @${uniqueId} (Room ID: ${state.roomId})`,
      uniqueId,
      roomId: String(state.roomId),
    });
  } catch (err) {
    if (connection === conn) connection = null;
    const msg = err && err.message ? err.message : String(err);
    setStatus({ state: 'error', message: `Không kết nối được @${uniqueId}: ${msg}`, roomId: null });
  }
}

async function disconnectLive() {
  const conn = connection;
  connection = null;
  if (conn) {
    try { conn.disconnect(); } catch (_) { /* already closed */ }
  }
  setStatus({ state: 'idle', message: 'Đã ngắt kết nối', roomId: null });
}

// ---- sockets ---------------------------------------------------------------

io.on('connection', (socket) => {
  socket.emit('status', status);
  socket.emit('leaderboard', leaderboard());

  socket.on('live:connect', (uniqueId) => connectLive(uniqueId));
  socket.on('live:disconnect', () => disconnectLive());

  socket.on('sim:gift', ({ user, tierId, text }) => {
    const tier = GIFT_TIERS.find((t) => t.id === tierId);
    if (!tier) return;
    const name = String(user || 'Khách').slice(0, 30);
    handleGift({ userId: `sim:${name}`, name, coins: tier.minCoins, giftName: tier.label, count: 1 });
    if (text) handleChat({ userId: `sim:${name}`, name, text });
  });

  socket.on('sim:chat', ({ user, text }) => {
    const name = String(user || 'Khách').slice(0, 30);
    handleChat({ userId: `sim:${name}`, name, text });
  });

  socket.on('sim:share', ({ user }) => {
    const name = String(user || 'Khách').slice(0, 30);
    io.emit('overlay', { type: 'share', user: name });
  });

  socket.on('crowd:nammo', (n) => io.emit('overlay', { type: 'nammo', count: Math.min(Number(n) || 8, 20) }));
  socket.on('crowd:spawn', (n) => io.emit('overlay', { type: 'crowd', count: Math.min(Number(n) || 48, 80) }));

  socket.on('session:reset', () => {
    scores.clear();
    emitLeaderboard();
    io.emit('overlay', { type: 'reset' });
  });
});

server.listen(PORT, () => {
  console.log(`Admin:   http://localhost:${PORT}/admin`);
  console.log(`Overlay: http://localhost:${PORT}/overlay  (OBS Browser Source 1080x1920)`);
});

process.on('SIGINT', async () => {
  await disconnectLive();
  process.exit(0);
});
