// Checks the gift queue rules (merge, tier priority, cap of five, one on stage) in the real overlay page.
// Needs Google Chrome and a server already running (start it with SPEECH_REFILL_MS=300 so gifts are not rationed).
// Usage: node scripts/overlay-queue-test.js [port] [screenshot prefix] ["?queuewait=600000"|"?queuewait=1500"]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const port = process.argv[2] || 3190;
const prefix = process.argv[3] || path.join(os.tmpdir(), 'temple-test');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const s = io(`http://localhost:${port}`);
  await new Promise((r) => s.on('connect', r));
  s.emit('session:reset');
  // Fill the six cushions before the overlay connects; these queue donors are ordinary viewers.
  for (let i = 0; i < 6; i++) s.emit('sim:gift', { user: `QueueLeader${i}`, tierId: 'phaphoi' });
  await sleep(250);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9339', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run',
    `http://localhost:${port}/overlay${process.argv[4] || ''}`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9339/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
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
  const queue = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__queue())', returnByValue: true })).result.result.value);
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 1, mobile: false });
  await sleep(4000);

  await sleep(1500);

  // A goes on stage at once. R gives twice (merged), C twice (merged); then more people than the queue holds.
  const gifts = [['A', 'huong'], ['R', 'huong'], ['R', 'huong'], ['B', 'hoadang'], ['C', 'buc'], ['C', 'buc'], ['D', 'tambao'], ['E', 'huong'], ['F', 'huong'], ['G', 'tambao']];
  for (const [user, tierId] of gifts) { s.emit('sim:gift', { user, tierId }); await sleep(80); }
  await sleep(700);
  const start = await queue();
  console.log('on stage :', start.onStage);
  console.log('waiting  :', start.waiting.map((w) => `${w.user}(${w.tier}${w.count > 1 ? ' x' + w.count : ''})`).join(' '));
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${prefix}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
  await shot('queue-badge');

  // Follow the stage until everything has been played: one at a time, in the expected order.
  const seen = [];
  let maxHero = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const q = await queue();
    maxHero = Math.max(maxHero, q.hero);
    if (q.onStage && seen[seen.length - 1] !== q.onStage) seen.push(q.onStage);
    if (!q.onStage && !q.waiting.length && seen.length >= 1 && Date.now() - t0 > 4000) break;
    await sleep(200);
  }
  const end = await queue();
  console.log('played in order:', seen.join(' '));
  console.log('most people on stage at once:', maxHero);
  console.log('left in queue  :', end.waiting.length, ' on stage:', end.onStage);
  console.log('page exceptions:', problems.length ? problems : 'none');

  const impatient = (process.argv[4] || '').includes('queuewait=1500');
  const wantWaiting = ['B', 'D', 'G', 'C', 'R'];
  const okStart = start.onStage === 'A' && JSON.stringify(start.waiting.map((w) => w.user)) === JSON.stringify(wantWaiting)
    && start.waiting.find((w) => w.user === 'C').count === 2 && start.waiting.find((w) => w.user === 'R').count === 2;
  const okOrder = impatient ? JSON.stringify(seen) === JSON.stringify(['A', 'B', 'D', 'G', 'C']) : JSON.stringify(seen) === JSON.stringify(['A', ...wantWaiting]);
  const ok = okStart && okOrder && maxHero <= 1 && !end.waiting.length && !end.onStage && !problems.length;
  const good = impatient
    ? 'RESULT: expired ordinary prayers use the aisle; earned altar visits are retained'
    : 'RESULT: merged, ordered by tier, capped at five, one on stage at a time; E and F bowed in place';
  console.log(ok ? good : `RESULT: FAIL (start ok: ${okStart}, order ok: ${okOrder})`);
  s.close(); ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
})();
