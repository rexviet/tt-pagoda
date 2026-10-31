// Smoke test: drives the running server through simulated gifts and checks the pipeline.
// Usage: PORT=3100 node scripts/sim-smoke.js   (server must already be running)
const { io } = require('socket.io-client');
const assert = require('assert');

const port = process.env.PORT || 3000;
// Start the server with the same SPEECH_REFILL_MS (for example 300) so this test does not have to wait for the default 4 s.
const REFILL_MS = Number(process.env.SPEECH_REFILL_MS) || 4000;
const s = io(`http://localhost:${port}`);
const events = [];
let board = [];
s.on('overlay', (e) => events.push(e));
s.on('leaderboard', (l) => { board = l; });

async function checkJoin() {
  events.length = 0;
  s.emit('sim:join', { user: 'Khach Moi' });
  await new Promise((r) => setTimeout(r, 200));
  const join = events.find((e) => e.type === 'join');
  assert.ok(join && join.user === 'Khach Moi' && join.userId, 'someone entering the room reaches the overlay');
  console.log('OK: join event');
}

async function checkMusic() {
  const list = await (await fetch(`http://localhost:${port}/api/music`)).json();
  assert.ok(Array.isArray(list), '/api/music always answers with a list, empty when there is no music');
  const seen = new Promise((resolve) => s.once('music', resolve));
  s.emit('music:set', { enabled: false, volume: 7 });
  const m = await seen;
  assert.deepStrictEqual([m.enabled, m.volume], [false, 1], 'music settings are shared and the volume is clamped to 0..1');
  s.emit('music:set', { enabled: true, volume: 0.25 });
  await new Promise((r) => setTimeout(r, 100));
  console.log(`OK: music list (${list.length} tracks) and shared settings`);
}

async function checkSpeech() {
  const spoken = events.filter((e) => e.type === 'gift');
  assert.ok(spoken.every((e) => Array.isArray(e.speech) && e.speech.length === 1), 'every gift carries one spoken line');
  let bytes = 0;
  for (const id of spoken[0].speech) {
    const res = await fetch(`http://localhost:${port}/tts/${id}.mp3`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'audio/mpeg');
    const size = (await res.arrayBuffer()).byteLength;
    assert.ok(size > 1500, `audio too small: ${size} bytes`);
    bytes += size;
  }
  assert.strictEqual((await fetch(`http://localhost:${port}/tts/unknown.mp3`)).status, 404);

  // A busy room cannot have every line spoken: with a full bucket (three lines), four gifts and a share in the same
  // instant give the first three gifts a voice and the rest none.
  await new Promise((r) => setTimeout(r, REFILL_MS * 3 + 100)); // let the bucket fill up
  events.length = 0;
  for (const user of ['G1', 'G2', 'G3', 'G4']) s.emit('sim:gift', { user, tierId: 'huong' });
  s.emit('sim:share', { user: 'F' });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepStrictEqual(
    events.filter((e) => e.type === 'gift').map((e) => e.speech !== null),
    [true, true, true, false],
    'three gifts are spoken, the fourth is shown silently',
  );
  assert.ok(!events.find((e) => e.type === 'share').speech, 'a share is never spoken');

  events.length = 0;
  s.emit('sim:share', { user: 'C' });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(!events.find((e) => e.type === 'share').speech, 'a share is shown but not spoken');

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
    checkSpeech().then(checkMusic).then(checkJoin).then(() => {
      s.emit('session:reset');
      setTimeout(() => process.exit(0), 200);
    }).catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
  }, 500);
});
const connectTimer = setTimeout(() => { console.error('FAIL: no connection'); process.exit(1); }, 5000);
s.on('connect', () => clearTimeout(connectTimer));
