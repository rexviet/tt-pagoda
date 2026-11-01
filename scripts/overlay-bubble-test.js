// Checks that a chat bubble sits over the black name plate of the disciple who spoke, so the plate does not show around it.
// Needs Google Chrome and a server already running. Usage: node scripts/overlay-bubble-test.js [port]
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
    '--headless=new', '--remote-debugging-port=9343', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9343/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
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
  const bubbles = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__bubbles ? window.__bubbles() : [])', returnByValue: true })).result.result.value);
  await send('Runtime.enable');
  await sleep(4000);

  const s = io(`http://localhost:${port}`);
  await new Promise((r) => s.on('connect', r));
  s.emit('session:reset');
  await sleep(1200);
  const checks = [];
  const check = (label, ok) => { checks.push(ok); console.log(`${ok ? 'ok ' : 'BAD'}  ${label}`); };

  // a short line is the hard case: the bubble would be narrower than the name plate
  for (const [user, text] of [['Nguyen Van Khach Moi', 'ok'], ['An', 'a di da phat, chuc moi nguoi binh an va nhieu suc khoe trong nam moi']]) {
    s.emit('sim:chat', { user, text });
    let b;
    for (let i = 0; i < 40 && !b; i++) { await sleep(100); b = (await bubbles()).find((x) => x.user === user); }
    await sleep(1500); // the figure may still be walking in: the bubble has to follow it
    b = (await bubbles()).find((x) => x.user === user);
    check(`${user}: the bubble and the name plate are both up`, !!b && b.plateVisible);
    if (!b) continue;
    const slack = 0.5;
    check(`${user}: the bubble is at least as wide as the plate and centred on it`, b.bubble.x <= b.plate.x + slack && b.bubble.x + b.bubble.w >= b.plate.x + b.plate.w - slack);
    check(`${user}: the bubble covers the plate from top to bottom`, b.bubble.y <= b.plate.y + slack && b.bubble.y + b.bubble.h >= b.plate.y + b.plate.h - slack);
  }
  check('no page exceptions', problems.length === 0);
  if (problems.length) console.log(problems);

  s.emit('session:reset');
  const ok = checks.every(Boolean);
  console.log(ok ? 'RESULT: a chat bubble covers the name plate' : 'RESULT: FAIL');
  s.close(); ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
