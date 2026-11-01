// Real Chrome regression check for the aisle, chat movement and cumulative gift routing.
// Usage: node scripts/overlay-movement-test.js
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const EventEmitter = require('node:events');
require('../speech').audioFor = async () => Buffer.from('test');
const { server, io, attachTikTokHandlers } = require('../server');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  // Populate all cushions before the page connects so ordinary donors stay outside the top six.
  const conn = new EventEmitter();
  attachTikTokHandlers(conn);
  for (let i = 0; i < 6; i++) {
    conn.emit('gift', { user: { uniqueId: `Leader${i}`, nickname: `Leader${i}` }, giftId: i,
      gift: { type: 2, diamondCount: 100 }, repeatCount: 1 });
  }
  const base = `http://localhost:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'temple-movement-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--window-size=540,960', '--no-first-run', `${base}/overlay?mute=1&queuewait=1500&outfits=devotee,devotee-white,brown,pink`,
  ], { stdio: 'ignore' });
  const client = connect(base);
  let ws;
  try {
    await new Promise((r) => client.on('connect', r));
    client.emit('voice:set', false);
    client.emit('ambient:set', 25);
    const portFile = path.join(dir, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !fs.existsSync(portFile); i++) await wait(100);
    const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://localhost:${debugPort}/json/list`)).json();
    ws = new WebSocket(targets.find((t) => t.url.includes('/overlay')).webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0;
    const pending = new Map(), errors = [];
    ws.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    };
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async (expression) => {
      const msg = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (msg.result.exceptionDetails) throw new Error(msg.result.exceptionDetails.text);
      return msg.result.result.value;
    };
    const state = () => evaluate('window.__movement && window.__movement()');
    const until = async (predicate, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const s = await state(); if (s && predicate(s)) return s; await wait(100); }
      throw new Error(`Timed out: ${predicate}`);
    };
    const observeWalk = async (user) => {
      let s = await until((s) => s.onStage?.user === user);
      const outward = [], homeward = [];
      let prayed = false, maxZoom = 1;
      const deadline = Date.now() + 20000;
      while (s.onStage?.user === user) {
        assert.ok(Date.now() < deadline, 'the prayer and return finish');
        maxZoom = Math.max(maxZoom, s.zoom);
        const f = s.figures.find((f) => f.user === user);
        if (f.pose.startsWith('walk')) (prayed ? homeward : outward).push(f);
        else if (outward.length) prayed = true;
        await wait(40);
        s = await state();
      }
      for (const [leg, samples] of [['outward', outward], ['homeward', homeward]]) {
        assert.deepEqual([...new Set(samples.map((f) => f.pose))].sort(), ['walkup', 'walkup2'], `${leg}: both walking frames appear`);
        assert.ok(samples.every((f) => f.alpha > 0.95), `${leg}: the figure stays visible throughout the walk`);
        assert.ok(samples.some((f) => Math.hypot(f.x - samples[0].x, f.y - samples[0].y) > 15), `${leg}: the figure actually travels`);
        for (let i = 1; i < samples.length; i++) {
          assert.ok(Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y) < 100, `${leg}: no teleport between samples`);
        }
      }
      return { s, maxZoom };
    };
    await send('Runtime.enable');
    const outside = (x, s) => x < s.aisle.left || x > s.aisle.right;
    let s = await until((s) => s.figures.filter((f) => !f.userId).length === 25);
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(s.chatWalkSpeed, config.chatWalkSpeed, 'chat speed reaches the renderer even with custom outfits');
    assert.ok(s.figures.every((f) => outside(f.home.x, s)), 'ambient homes leave the aisle clear');
    console.log('OK: ambient disciples are seated on both sides');

    client.emit('sim:join', { user: 'Walker' });
    await until((s) => s.figures.some((f) => f.user === 'Walker' && f.home && Math.abs(f.x - f.home.x) < 1));
    client.emit('sim:chat', { user: 'Walker', text: 'Nam mô' });
    const chatStarted = Date.now();
    s = await until((s) => s.figures.some((f) => f.user === 'Walker' && f.roaming));
    const x1 = s.figures.find((f) => f.user === 'Walker').x;
    await wait(700);
    s = await state();
    assert.ok(Math.abs(s.figures.find((f) => f.user === 'Walker').x - x1) > 1, 'chat causes actual movement');
    s = await until((s) => s.figures.some((f) => f.user === 'Walker' && !f.roaming));
    const walker = s.figures.find((f) => f.user === 'Walker');
    assert.ok(outside(walker.x, s) && Math.abs(walker.x - walker.home.x) < 1);
    assert.ok(Date.now() - chatStarted >= 4800, 'movement lasts approximately five seconds');
    console.log('OK: chat wanders for five seconds and returns to a side');
    client.emit('sim:chat', { user: 'Walker', text: 'Tin thứ nhất' });
    await wait(3500);
    client.emit('sim:chat', { user: 'Walker', text: 'Tin tiếp theo' });
    await wait(2500);
    s = await state();
    assert.ok(s.figures.find((f) => f.user === 'Walker').roaming, 'another chat extends movement');
    await until((s) => s.figures.some((f) => f.user === 'Walker' && !f.roaming));
    console.log('OK: repeated chat extends the movement window');

    client.emit('sim:gift', { user: 'Donor', tierId: 'huong' });
    s = await until((s) => s.figures.some((f) => f.user === 'Donor' && f.busy && f.x > s.aisle.left && f.x < s.aisle.right && f.y >= 1350));
    assert.equal(s.onStage.altar, false);
    assert.ok(s.zoom < 1.01, 'non-milestones do not zoom');
    await until((s) => !s.onStage);
    console.log('OK: total 1 prays in the aisle without zoom');
    for (let i = 0; i < 4; i++) { client.emit('sim:gift', { user: 'Donor', tierId: 'huong' }); await wait(30); }
    s = await until((s) => s.onStage?.altar && s.zoom > 1.3);
    assert.equal(s.onStage.user, 'Donor');
    await until((s) => !s.onStage);
    client.emit('sim:gift', { user: 'Donor', tierId: 'huong' });
    await until((s) => s.onStage?.user === 'Donor');
    s = await until((s) => !s.onStage);
    assert.ok(s.zoom < 1.01);
    assert.ok(s.figures.every((f) => !f.home || outside(f.home.x, s)));
    console.log('OK: accumulated total 5 visits the altar; total 6 returns to aisle routing');
    client.emit('sim:gift', { user: 'Donor', tierId: 'hoadang' });
    s = await until((s) => s.onStage?.user === 'Donor' && s.onStage.altar && s.zoom > 1.3);
    assert.ok(!s.figures.find((f) => f.user === 'Donor').vip, 'a 50-coin gift zooms at cumulative total 56 even outside top six');
    await until((s) => !s.onStage);
    console.log('OK: a larger gift zooms for a non-VIP even when its cumulative total is not divisible by five');
    client.emit('sim:gift', { user: 'Donor', tierId: 'hoadang' });
    s = await until((s) => s.onStage?.user === 'Donor' && s.onStage.altar && s.zoom > 1.3);
    assert.ok(s.figures.find((f) => f.user === 'Donor').vip, 'promotion into the top six enables zoom at total 106');
    await until((s) => !s.onStage);
    client.emit('sim:gift', { user: 'Donor', tierId: 'huong' });
    const observed = await observeWalk('Donor');
    s = observed.s;
    assert.ok(observed.maxZoom > 1.3);
    const vip = s.figures.find((f) => f.user === 'Donor');
    assert.ok(vip.vip && Math.abs(vip.x - vip.home.x) < 1 && Math.abs(vip.y - vip.home.y) < 1);
    console.log('OK: top six visits the altar and returns to its cushion at totals 106 and 107');
    console.log('OK: both walking frames animate in both directions, with continuous position and full visibility');
    client.emit('sim:chat', { user: 'Donor', text: 'Di chuyển rồi tặng tiếp' });
    await until((s) => s.figures.some((f) => f.user === 'Donor' && f.roaming));
    client.emit('sim:gift', { user: 'Donor', tierId: 'huong' });
    await until((s) => s.onStage?.user === 'Donor');
    client.emit('sim:chat', { user: 'Donor', text: 'Chat trong lúc hành lễ' });
    await until((s) => !s.onStage && s.figures.some((f) => f.user === 'Donor' && f.roaming));
    await until((s) => !s.onStage && s.figures.every((f) => !f.roaming));
    client.emit('sim:chat', { user: 'Walker', text: 'Reset khi đang đi' });
    await until((s) => s.figures.some((f) => f.user === 'Walker' && f.roaming));
    client.emit('session:reset');
    s = await until((s) => s.figures.length === 25 && s.figures.every((f) => !f.userId));
    assert.ok(s.figures.every((f) => outside(f.home.x, s)), 'reset rebuilds the crowd on the sides');
    for (let i = 0; i < 7; i++) { client.emit('sim:gift', { user: `Milestone${i}`, tierId: 'que' }); await wait(30); }
    await until((s) => s.onStage?.altar);
    const queue = await evaluate('window.__queue()');
    assert.equal(queue.waiting.length, 6, 'earned altar visits survive the queue capacity limit');
    client.emit('session:reset');
    await until((s) => !s.onStage && s.figures.every((f) => !f.userId));
    console.log('OK: altar milestones survive queue limits and reset cancels active ceremonies');
    assert.deepEqual(errors, [], 'no browser exceptions');
    if (process.env.SHOT) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(process.env.SHOT, Buffer.from(shot.result.data, 'base64'));
    }
    console.log('OK: gifts interrupt chat movement safely; no browser exceptions');
  } finally {
    client.close();
    ws?.close();
    chrome.kill();
    await new Promise((r) => io.close(r));
    await wait(500);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
