// Checks that a disciple does not grow when it bows: in every outfit, the frames of the bow are drawn no taller than the
// kneeling frame of the same outfit and not much wider (the pink and brown bow frames were drawn far bulkier than their
// slim kneel), and the kneeling frame itself keeps its size.
// Needs Google Chrome and a server already running. Usage: node scripts/overlay-pose-size-test.js [port]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const port = process.argv[2] || 3195;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BOWS = ['bowa', 'bowb', 'bowc', 'bowup'];
const MAX_WIDER = 1.15; // a bow may spread its arms a little: up to 15% wider than kneeling

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9344', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9344/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => { const g = JSON.parse(m.data); if (g.id && pend.has(g.id)) { pend.get(g.id)(g); pend.delete(g.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await sleep(4000);
  const sizes = JSON.parse((await send('Runtime.evaluate', {
    expression: `JSON.stringify(Object.fromEntries(['devotee','brown','pink'].map((o) => [o, Object.fromEntries(['kneelup', ${BOWS.map((b) => `'${b}'`).join(',')}].map((p) => [p, window.__poseSize ? window.__poseSize(o, p) : null]))])))`,
    returnByValue: true,
  })).result.result.value);

  const checks = [];
  const check = (label, ok) => { checks.push(ok); console.log(`${ok ? 'ok ' : 'BAD'}  ${label}`); };
  for (const [outfit, sz] of Object.entries(sizes)) {
    console.log(outfit.padEnd(8), Object.entries(sz).map(([p, v]) => `${p}=${v && v.w.toFixed(0)}x${v && v.h.toFixed(0)}`).join('  '));
    const k = sz.kneelup;
    check(`${outfit}: kneeling keeps its size (about 107 to 228 px tall)`, k.h > 100 && k.h < 240);
    for (const b of BOWS) check(`${outfit}: ${b} is no taller than kneeling`, sz[b] != null && sz[b].h <= k.h + 0.01);
    for (const b of BOWS) check(`${outfit}: ${b} is at most ${Math.round((MAX_WIDER - 1) * 100)}% wider than kneeling`, sz[b] != null && sz[b].w <= k.w * MAX_WIDER + 0.01);
    for (const b of BOWS) check(`${outfit}: ${b} is not shrunk below 70% of kneeling height`, sz[b] != null && sz[b].h >= k.h * 0.7);
  }
  const ok = checks.every(Boolean);
  console.log(ok ? 'RESULT: bowing never makes a disciple bigger' : 'RESULT: FAIL');
  ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
