// Smoke test: drives the running server through simulated gifts and checks the pipeline.
// Usage: PORT=3100 node scripts/sim-smoke.js   (server must already be running)
const { io } = require('socket.io-client');
const assert = require('assert');

const port = process.env.PORT || 3000;
const s = io(`http://localhost:${port}`);
const events = [];
let board = [];
s.on('overlay', (e) => events.push(e));
s.on('leaderboard', (l) => { board = l; });

async function checkSpeech() {
  const spoken = events.filter((e) => e.type === 'gift');
  assert.ok(spoken.every((e) => typeof e.speech === 'string' && e.speech.length), 'every gift carries a speech id');
  const res = await fetch(`http://localhost:${port}/tts/${spoken[0].speech}.mp3`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'audio/mpeg');
  const bytes = (await res.arrayBuffer()).byteLength;
  assert.ok(bytes > 2000, `audio too small: ${bytes} bytes`);
  assert.strictEqual((await fetch(`http://localhost:${port}/tts/unknown.mp3`)).status, 404);

  events.length = 0;
  s.emit('sim:share', { user: 'C' });
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(events.find((e) => e.type === 'share').speech.length > 0, true, 'share is spoken');

  s.emit('voice:set', false);
  await new Promise((r) => setTimeout(r, 100));
  events.length = 0;
  s.emit('sim:gift', { user: 'D', tierId: 'huong' });
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(events.find((e) => e.type === 'gift').speech, null, 'voice off means no speech');
  s.emit('voice:set', true);
  console.log(`OK: speech ids, audio (${bytes} bytes), share line and voice toggle`);
}

s.on('connect', () => {
  s.emit('session:reset');
  s.emit('sim:gift', { user: 'A', tierId: 'huong', text: 'hi' });
  s.emit('sim:gift', { user: 'B', tierId: 'phaphoi' });
  s.emit('sim:gift', { user: 'A', tierId: 'hoadang' });
  setTimeout(() => {
    const gifts = events.filter((e) => e.type === 'gift').map((e) => `${e.user}:${e.tier}`);
    assert.deepStrictEqual(gifts, ['A:huong', 'B:phaphoi', 'A:hoadang']);
    assert.strictEqual(events.filter((e) => e.type === 'chat').length, 1);
    assert.deepStrictEqual(board.map((r) => [r.name, r.score]), [['B', 100], ['A', 51]]);
    console.log('OK: gifts, chat and leaderboard behave as expected');
    checkSpeech().then(() => {
      s.emit('session:reset');
      setTimeout(() => process.exit(0), 200);
    }).catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
  }, 500);
});
setTimeout(() => { console.error('FAIL: no connection'); process.exit(1); }, 5000);
