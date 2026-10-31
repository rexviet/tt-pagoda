// Seats the top six on the cushions and checks it against the ranking, including an overtake.
// Needs Google Chrome and a server already running (start it with SPEECH_REFILL_MS=300 so gifts are not rationed).
// Usage: node scripts/overlay-vip-test.js [port] [screenshot prefix]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const port = process.argv[2] || 3190;
const prefix = process.argv[3] || path.join(os.tmpdir(), 'temple-test');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9338', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9338/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
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
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${prefix}-${name}.png`, Buffer.from(s.result.data, 'base64')); };
  const vips = async () => (await ev('JSON.stringify(window.__vips())').then(JSON.parse)).map((v) => `${v.rank}:${v.owner}@${v.x}`).join('  ');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 1, mobile: false });
  await sleep(4000);

  const s = io(`http://localhost:${port}`);
  await new Promise((r) => s.on('connect', r));
  s.emit('session:reset');
  await sleep(1500);
  // scores: U1 50, U2 10, U3 10, U4 5, U5 5, U6 1, U7 1
  const gifts = [['U1', 'hoadang'], ['U2', 'tambao'], ['U3', 'tambao'], ['U4', 'buc'], ['U5', 'buc'], ['U6', 'huong'], ['U7', 'huong']];
  for (const [user, tierId] of gifts) { s.emit('sim:gift', { user, tierId }); await sleep(120); }
  await sleep(45000); // all the prayers (one shot at a time) finish
  console.log('after 7 gifts  :', await vips());
  await shot('seated');

  s.emit('sim:gift', { user: 'U7', tierId: 'hoadang' }); // U7 jumps to rank 1 and pushes U6 out of the top six
  await sleep(40000);
  console.log('after U7 gifts :', await vips());
  await shot('after-overtake');

  const expected = ['U7', 'U1', 'U2', 'U3', 'U4', 'U5'];
  const now = JSON.parse(await ev('JSON.stringify(window.__vips())'));
  const names = now.map((v) => v.owner);
  const placed = now.every((v) => v.owner && Math.abs(v.x - v.slotX) < 6);
  console.log('expected order :', expected.join(' '));
  console.log('page exceptions:', problems.length ? problems : 'none');
  const ok = JSON.stringify(names) === JSON.stringify(expected) && placed && !problems.length;
  console.log(ok ? 'RESULT: the top six sit on their cushions in rank order, and an overtake moves everyone correctly' : `RESULT: FAIL (got ${names.join(' ')}, all standing on their cushion: ${placed})`);
  s.close(); ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
