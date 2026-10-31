// Checks the "TÂM LÒNG THÀNH" board: hidden while there is nobody below the top six, then listing ranks 7-10 with their
// real rank numbers and scores, never more than four rows.
// Needs Google Chrome and a server already running. Usage: node scripts/overlay-board-test.js [port]  (SHOT=file.png saves a screenshot)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const port = process.argv[2] || 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9340', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9340/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  const problems = [];
  ws.onmessage = (m) => {
    const g = JSON.parse(m.data);
    if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); }
    if (g.method === 'Runtime.exceptionThrown') problems.push(g.params.exceptionDetails.exception?.description || g.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const board = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__board())', returnByValue: true })).result.result.value);
  const show = (b) => (b.visible ? b.rows.map((r) => `${r.rank}:${r.name}(${r.score})`).join(' ') : '(hidden)');
  await send('Runtime.enable');
  await sleep(4000);

  const s = io(`http://localhost:${port}`);
  await new Promise((r) => s.on('connect', r));
  s.emit('session:reset');
  await sleep(1500);
  const checks = [];
  const check = (label, ok) => { checks.push(ok); console.log(`${ok ? 'ok ' : 'BAD'}  ${label}`); };

  const give = async (user, times) => { for (let i = 0; i < times; i++) { s.emit('sim:gift', { user, tierId: 'huong' }); await sleep(25); } };

  // scores U1..U8 = 8..1
  for (let n = 1; n <= 3; n++) await give(`U${n}`, 9 - n);
  await sleep(800);
  let b = await board();
  console.log('3 people  :', show(b));
  check('hidden while nobody is below the top six', !b.visible);

  for (let n = 4; n <= 8; n++) await give(`U${n}`, 9 - n);
  await sleep(800);
  b = await board();
  console.log('8 people  :', show(b));
  // rank 6 is U6 with 3 coins, so a challenger needs 3 - score + 1 coins: equal is not enough, the earlier one stays ahead
  check('shows ranks 7 and 8 with their scores and the coins still needed for a cushion', b.visible && JSON.stringify(b.rows) === JSON.stringify([{ rank: 7, name: 'U7', score: 2, need: 2 }, { rank: 8, name: 'U8', score: 1, need: 3 }]));
  // The phone crops the 1080-wide canvas to about x 96..984 and TikTok puts its buttons on the right edge, so the board
  // has to end well inside that and be roomy enough for large text.
  check('the board sits clear of the right edge of a phone screen and away from the Buddha', b.x + b.width <= 975 && b.x >= 695);
  check('the default name size is large enough to read on a phone', b.nameSize >= 22);
  check('the board states the score of the last cushion', b.vipScore === 3);

  for (let n = 9; n <= 12; n++) await give(`U${n}`, 1);
  await sleep(800);
  b = await board();
  console.log('12 people :', show(b));
  if (process.env.SHOT) { await sleep(2500); fs.writeFileSync(process.env.SHOT, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); } // optional screenshot to look at
  check('lists exactly ranks 7 to 10 and no more', b.visible && b.rows.map((r) => r.rank).join() === '7,8,9,10');
  check('the people on the cushions are not repeated on the board', !b.rows.some((r) => ['U1', 'U2', 'U3', 'U4', 'U5', 'U6'].includes(r.name)));

  s.emit('session:reset');
  await sleep(1200);
  b = await board();
  check('hidden again after a reset', !b.visible);
  check('no page exceptions', problems.length === 0);
  if (problems.length) console.log(problems);

  const ok = checks.every(Boolean);
  console.log(ok ? 'RESULT: the board lists ranks 7-10 and hides when empty' : 'RESULT: FAIL');
  s.close(); ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
