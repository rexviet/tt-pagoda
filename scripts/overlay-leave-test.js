// Checks that a disciple goes when its owner leaves the room: on an explicit leave event, and when the viewer count
// drops below the number of disciples. People on the cushions and people with a gift waiting stay until they are free.
// Needs Google Chrome. Usage: node scripts/overlay-leave-test.js
process.env.TTS_PROVIDER = 'say';
const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { server, attachTikTokHandlers } = require('../server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const user = (n) => ({ nickname: n, uniqueId: n.toLowerCase() });

server.listen(0, async () => {
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9341', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run', `http://localhost:${port}/overlay`,
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch('http://localhost:9341/json/list')).json()).find((t) => t.type === 'page' && t.url.includes('/overlay')); } catch (_) { /* not up yet */ }
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
  const crowd = async () => JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__crowd())', returnByValue: true })).result.result.value).map((f) => f.user);
  await send('Runtime.enable');
  await sleep(4000);

  const conn = new EventEmitter();
  attachTikTokHandlers(conn);
  const checks = [];
  const check = (label, ok) => { checks.push(ok); console.log(`${ok ? 'ok ' : 'BAD'}  ${label}`); };

  for (const n of ['Anh', 'Binh', 'Chi', 'Dung', 'Em']) conn.emit('member', { user: user(n), action: 1 });
  await sleep(1500);
  check('five viewers joined, five disciples', (await crowd()).length === 5);

  conn.emit('member', { user: user('Binh'), action: 2 });
  await sleep(2500);
  let c = await crowd();
  check('a leave event removes that disciple only', c.length === 4 && !c.includes('Binh'));

  conn.emit('roomUser', { viewerCount: 2 });
  await sleep(2500);
  c = await crowd();
  check('a lower viewer count retires the extra disciples', c.length === 2);

  conn.emit('member', { user: user('Binh'), action: 1 });
  await sleep(1500);
  check('someone who comes back gets a disciple again', (await crowd()).includes('Binh'));

  check('no page exceptions', problems.length === 0);
  if (problems.length) console.log(problems);
  const ok = checks.every(Boolean);
  console.log(ok ? 'RESULT: disciples go when their owners leave' : 'RESULT: FAIL');
  ws.close(); chrome.kill();
  await sleep(500);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temp dir */ }
  process.exit(ok ? 0 : 1);
});
