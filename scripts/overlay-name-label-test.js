// Checks the settings of the name above a disciple's head: NAME_FONT_SIZE (px), NAME_SHOW_SECONDS (how long the name stays
// up when someone arrives; the names that stay for a whole prayer or on a cushion are not timed) and NAME_PLATE_OPACITY
// (the black box behind the name).
// Needs Google Chrome and a server already running with the settings below:
//   NAME_FONT_SIZE=30 NAME_SHOW_SECONDS=2 NAME_PLATE_OPACITY=0.4 PORT=3195 node server.js
// Usage: node scripts/overlay-name-label-test.js [port]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const port = process.argv[2] || 3195;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9342', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9342/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
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
  const names = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__names ? window.__names() : [])', returnByValue: true })).result.result.value);
  const mine = async () => (await names()).find((n) => n.user === 'Khach Moi');
  await send('Runtime.enable');
  await sleep(4000);

  const s = io(`http://localhost:${port}`);
  await new Promise((r) => s.on('connect', r));
  const checks = [];
  const check = (label, ok) => { checks.push(ok); console.log(`${ok ? 'ok ' : 'BAD'}  ${label}`); };

  s.emit('session:reset');
  await sleep(1200);
  s.emit('sim:join', { user: 'Khach Moi' });
  let n = await mine();
  for (let i = 0; i < 40 && !(n && n.visible); i++) { await sleep(100); n = await mine(); }
  check('the name shows when someone arrives', !!(n && n.visible));
  check('its font size comes from NAME_FONT_SIZE', !!n && Number(n.size) === 30);
  for (let i = 0; i < 20 && !(n && n.plateAlpha != null); i++) { await sleep(100); n = await mine(); } // the plate is drawn on the next frame
  check('the black box behind it is drawn with NAME_PLATE_OPACITY', !!n && n.plateAlpha != null && Math.abs(n.plateAlpha - 0.4) < 0.001);

  await sleep(1000);
  n = await mine();
  check('it is still up a second later (the show time is 2 s, not instant)', !!(n && n.visible));
  await sleep(2500); // 3.5 s after it appeared: gone with 2 s, still up with the built-in 4 s
  n = await mine();
  check('it is gone after NAME_SHOW_SECONDS', !!n && !n.visible);
  check('no page exceptions', problems.length === 0);
  if (problems.length) console.log(problems);

  s.emit('session:reset');
  const ok = checks.every(Boolean);
  console.log(ok ? 'RESULT: name size and show time follow the settings' : 'RESULT: FAIL');
  s.close(); ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
