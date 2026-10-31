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
    s.emit('session:reset');
    setTimeout(() => process.exit(0), 200);
  }, 500);
});
setTimeout(() => { console.error('FAIL: no connection'); process.exit(1); }, 5000);
