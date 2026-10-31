const path = require('path');

// Local settings (voice server address and PIN) live in .env, which git ignores. Load it before the modules that read env.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (_) { /* no .env: defaults apply */ }

const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { tierForCoins, GIFT_TIERS } = require('./gift-tiers');
const { buildParts, audioFor, checkVoiceServer } = require('./speech');

const PORT = Number(process.env.PORT) || 3000;
// A thank-you line takes about 2 s to make and 4 s to say, so a busy room cannot have every gift and share spoken.
// A token bucket decides which ones get a voice: a short burst, then one line every SPEECH_REFILL_MS. A share only
// speaks while at least two tokens are left, so gifts always win. The others still show on the overlay, just silently.
const SPEECH_BURST = 3;
const SPEECH_REFILL_MS = Number(process.env.SPEECH_REFILL_MS) || 4000;
let speechTokens = SPEECH_BURST;
let speechTokensAt = Date.now();
function takeSpeechToken(kind) {
  const now = Date.now();
  speechTokens = Math.min(SPEECH_BURST, speechTokens + (now - speechTokensAt) / SPEECH_REFILL_MS);
  speechTokensAt = now;
  if (speechTokens < (kind === 'share' ? 2 : 1)) return false;
  speechTokens -= 1;
  return true;
}
const STREAK_IDLE_MS = Number(process.env.STREAK_IDLE_MS) || 3000;
const LEADERBOARD_SIZE = 10; // the overlay seats ranks 1-6 on the cushions before the altar and lists 7-10 on the board

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pixiDist = path.join(path.dirname(require.resolve('pixi.js')), '..', 'dist');
app.use('/lib',express.static(pixiDist));
// no-cache = the browser may keep a copy but must ask the server whether it changed, so edits to the overlay, admin and
// images show up on the next reload instead of an old copy being reused (304 when nothing changed).
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/overlay', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/api/tiers', (_req, res) => res.json(GIFT_TIERS));

// Background music: every audio file dropped into public/assets/music is played in a loop by the overlay.
// No files (or no folder) simply means no music.
const MUSIC_DIR = path.join(__dirname, 'public', 'assets', 'music');
const MUSIC_EXT = /\.(mp3|ogg|m4a|wav|webm|opus)$/i;
app.get('/api/music', (_req, res) => {
  let files = [];
  try { files = fs.readdirSync(MUSIC_DIR).filter((f) => MUSIC_EXT.test(f)).sort(); } catch (_) { /* no music folder */ }
  res.json(files.map((f) => `/assets/music/${encodeURIComponent(f)}`));
});

// Spoken lines: the overlay asks for /tts/<id>.mp3, the id maps back to the text announced in the overlay event.
const lines = new Map(); // id -> text, oldest dropped first
const MAX_LINES = 200;
app.get('/tts/:id.mp3', async (req, res) => {
  const text = lines.get(req.params.id);
  if (!text) return res.sendStatus(404);
  try {
    const audio = await audioFor(text);
    res.type('audio/mpeg').send(audio);
  } catch (err) {
    if (err.stale) return res.sendStatus(410); // dropped on purpose (too late to be worth saying)
    console.error('[tts] failed:', err.message);
    res.sendStatus(502);
  }
});

// ---- session state ---------------------------------------------------------

const scores = new Map(); // uniqueId -> { name, score }
let voiceEnabled = true;
const DEFAULT_AMBIENT_CROWD = 50;
const MAX_AMBIENT_CROWD = 350;
const DEFAULT_MUSIC_VOLUME = 0.25;
// Anonymous disciples that stand in the hall so it looks full even with few viewers; real viewers stand among them.
const crowd = { ambient: Math.min(MAX_AMBIENT_CROWD, Math.max(0, Math.round(Number(process.env.AMBIENT_CROWD ?? DEFAULT_AMBIENT_CROWD)) || 0)) };
const music = { enabled: true, volume: Math.min(1, Math.max(0, Number(process.env.MUSIC_VOLUME) || DEFAULT_MUSIC_VOLUME)) };
let connection = null;
let status = { state: 'idle', message: 'Chưa kết nối', uniqueId: null, roomId: null };

function leaderboard() {
  return [...scores.entries()]
    .map(([userId, entry]) => ({ userId, name: entry.name, score: entry.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE);
}

function setStatus(next) {
  status = { ...status, ...next };
  io.emit('status', status);
}

// Registers the clips of a spoken line (name, then fixed tail) and starts synthesizing them so they are
// ready when the overlay asks. Returns the clip ids in play order.
function speechFor(kind, name) {
  if (!voiceEnabled || !takeSpeechToken(kind)) return null;
  const parts = buildParts(kind, name);
  if (!parts) return null;
  return parts.map((text) => {
    const id = require('crypto').createHash('sha1').update(text).digest('hex').slice(0, 20);
    lines.delete(id);
    lines.set(id, text);
    if (lines.size > MAX_LINES) lines.delete(lines.keys().next().value);
    audioFor(text).catch(() => {}); // failure is reported when the overlay requests the audio
    return id;
  });
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
  if (!(coins > 0)) {
    console.warn(`[tiktok] gift from ${name} (${giftName}) carries no coin value, so it is ignored`);
    return;
  }
  const tier = tierForCoins(coins);
  addScore(userId, name, coins);
  io.emit('overlay', {
    type: 'gift', user: name, userId, coins, giftName, count,
    tier: tier ? tier.id : null,
    speech: tier ? speechFor(tier.id, name) : null,
  });
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
  // Gifts that can be sent in a streak (like a rose) arrive as a run of messages, normally closed by one marked
  // repeatEnd. That closing message can arrive late or not at all, so a streak is also settled once it has been
  // quiet for STREAK_IDLE_MS. Units already announced are remembered, so a late end or a streak that carries on
  // after the pause never counts the same units twice.
  const streaks = new Map(); // key -> { count, timer }
  const announced = new Map(); // key -> units of that streak already paid out
  const settle = (key, gift, total) => {
    const units = total - (announced.get(key) || 0);
    if (units <= 0) return;
    announced.set(key, total);
    setTimeout(() => { if (announced.get(key) === total) announced.delete(key); }, 60000).unref();
    handleGift({ ...gift, coins: gift.perUnit * units, count: units });
  };

  conn.on(WebcastEvent.GIFT, (data) => {
    // Gift info is `data.gift` in the v3 message schema (`giftDetails` in the older one, kept as a fallback).
    const info = data.gift || data.giftDetails || {};
    const giftType = info.type ?? info.giftType;
    const count = Math.max(1, Number(data.repeatCount) || 1);
    const ended = !!data.repeatEnd;
    const gift = { ...userOf(data), perUnit: Number(info.diamondCount) || 0, giftName: info.name || info.giftName || 'Quà' };
    console.log(`[tiktok] gift from ${gift.name}: ${gift.giftName} x${count} (${gift.perUnit} coin each, type ${giftType}, repeatEnd=${ended})`);

    const key = `${gift.userId}:${data.groupId ?? data.giftId}`;
    if (giftType !== 1) return settle(`${key}:${Date.now()}`, gift, count); // one-off gift: count it now

    const streak = streaks.get(key) || { count: 0 };
    clearTimeout(streak.timer);
    streak.count = Math.max(streak.count, count);
    if (ended) {
      streaks.delete(key);
      return settle(key, gift, streak.count);
    }
    streak.timer = setTimeout(() => { streaks.delete(key); settle(key, gift, streak.count); }, STREAK_IDLE_MS);
    streaks.set(key, streak);
  });

  // TikTok reports a share either as a "share" event or as a generic "social" one, depending on the display key it
  // carries, so both paths end here. Unknown social notices are logged once per key to show what TikTok really sends.
  const announceShare = (data) => {
    const { name } = userOf(data);
    console.log(`[tiktok] share from ${name}`);
    io.emit('overlay', { type: 'share', user: name }); // a share only shows the banner: no spoken line, no voice budget used
  };
  const looksLikeShare = (data) => {
    const text = `${data?.common?.displayText?.key || ''} ${data?.common?.displayText?.defaultPattern || ''}`;
    return /share|chia s[ẻe]/i.test(text);
  };
  const seenSocialKeys = new Set();

  conn.on(WebcastEvent.SHARE, announceShare);
  conn.on(WebcastEvent.SOCIAL, (data) => {
    if (looksLikeShare(data)) return announceShare(data);
    const key = data?.common?.displayText?.key || '(no key)';
    if (seenSocialKeys.has(key)) return;
    seenSocialKeys.add(key);
    console.log(`[tiktok] social notice with display key "${key}" from ${userOf(data).name}; not treated as a share`);
  });

  conn.on(WebcastEvent.MEMBER, (data) => {
    if (data.action === 3) return; // a subscription notice, not someone walking in
    const { userId, name } = userOf(data);
    io.emit('overlay', { type: 'join', user: name, userId });
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
  let conn;
  try {
    // The second argument is required by this version of the library, even when empty.
    conn = new TikTokLiveConnection(uniqueId, {});
    attachTikTokHandlers(conn);
    connection = conn;
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
  socket.emit('voice', voiceEnabled);
  socket.emit('music', music);
  socket.emit('ambient', crowd.ambient);

  socket.on('live:connect', (uniqueId) => {
    connectLive(uniqueId).catch((err) => {
      console.error('[tiktok] connect failed:', err);
      setStatus({ state: 'error', message: `Không kết nối được: ${err && err.message ? err.message : err}`, roomId: null });
    });
  });
  socket.on('live:disconnect', () => disconnectLive());
  socket.on('ambient:set', (n) => {
    const value = Math.round(Number(n));
    if (Number.isFinite(value)) crowd.ambient = Math.min(MAX_AMBIENT_CROWD, Math.max(0, value));
    io.emit('ambient', crowd.ambient);
  });
  socket.on('music:set', (next) => {
    if (typeof next?.enabled === 'boolean') music.enabled = next.enabled;
    const volume = Number(next?.volume);
    if (Number.isFinite(volume)) music.volume = Math.min(1, Math.max(0, volume));
    io.emit('music', music);
  });
  socket.on('voice:set', (on) => { voiceEnabled = !!on; io.emit('voice', voiceEnabled); });

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

  socket.on('sim:join', ({ user }) => {
    const name = String(user || 'Khách').slice(0, 30);
    io.emit('overlay', { type: 'join', user: name, userId: `sim:${name}` });
  });

  socket.on('sim:share', ({ user }) => {
    const name = String(user || 'Khách').slice(0, 30);
    io.emit('overlay', { type: 'share', user: name }); // a share only shows the banner: no spoken line, no voice budget used
  });

  socket.on('crowd:nammo', (n) => io.emit('overlay', { type: 'nammo', count: Math.min(Number(n) || 8, 20) }));
  socket.on('crowd:spawn', (n) => io.emit('overlay', { type: 'crowd', count: Math.min(Number(n) || 48, 80) }));

  socket.on('session:reset', () => {
    scores.clear();
    emitLeaderboard();
    io.emit('overlay', { type: 'reset' });
  });
});

if (require.main === module) server.listen(PORT, () => {
  console.log(`Admin:   http://localhost:${PORT}/admin`);
  console.log(`Overlay: http://localhost:${PORT}/overlay  (OBS Browser Source 1080x1920)`);
  checkVoiceServer();
});

module.exports = { server, io, attachTikTokHandlers };

// A stray error in one handler must not take the whole show down in the middle of a live.
process.on('uncaughtException', (err) => console.error('[server] uncaught exception:', err));
process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));

// Closing the server must also stop the voice worker (its exit hook only runs on a normal exit).
process.on('SIGTERM', () => process.exit(0));

process.on('SIGINT', async () => {
  await disconnectLive();
  process.exit(0);
});
