// Real Chrome check: fortune gifts shake the jar before revealing queued cards.
// Usage: node scripts/overlay-fortune-test.js
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
require('../speech').audioFor = async () => Buffer.from('test');
const { server, io } = require('../server');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const soundEnabled = process.env.SOUND === '1';

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'temple-fortune-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--window-size=540,960', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
    `${base}/overlay?${soundEnabled ? 'sound=1' : 'mute=1'}&outfits=devotee`,
  ], { stdio: 'ignore' });
  const client = connect(base);
  let ws;
  try {
    await new Promise((r) => client.on('connect', r));
    client.emit('voice:set', false);
    client.emit('ambient:set', 0);
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
    const send = (method, params = {}) => new Promise((r) => {
      const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params }));
    });
    const evaluate = async (expression) => {
      const msg = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (msg.result.exceptionDetails) throw new Error(msg.result.exceptionDetails.text);
      return msg.result.result.value;
    };
    const state = () => evaluate('window.__fortune && ({ ...window.__fortune(), movement: window.__movement?.() })');
    const until = async (predicate, timeout = 12000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const s = await state();
        if (s && predicate(s)) return s;
        await wait(40);
      }
      throw new Error(`Timed out: ${predicate}`);
    };
    const shot = async (name) => {
      const result = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync('.cache/fortune-check', { recursive: true });
      fs.writeFileSync(`.cache/fortune-check/${name}.png`, Buffer.from(result.result.data, 'base64'));
    };
    await send('Runtime.enable');
    await until((s) => s.jar && !s.busy);
    assert.equal((await state()).jar.height, 345, 'jar is scaled to 1.5 times its original height');
    await evaluate('document.querySelector("canvas").getBoundingClientRect().width');
    await wait(1500); // Background and disciple textures finish loading after the jar.
    // Asset loading precedes the socket: wait until the overlay has joined too.
    for (let i = 0; i < 100 && io.engine.clientsCount < 2; i++) await wait(50);
    assert.equal(io.engine.clientsCount, 2);
    await shot('idle');
    for (const [width, height] of [[375, 812], [768, 1024], [1440, 900]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await wait(100);
      const bounds = await evaluate(`(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      })()`);
      assert.ok(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= width + 1 && bounds.bottom <= height + 1,
        `overlay stays inside ${width}x${height}`);
      await shot(`viewport-${width}`);
    }
    await send('Emulation.clearDeviceMetricsOverride');
    client.emit('sim:gift', { user: 'Một xu', tierId: 'huong' });
    await wait(300);
    assert.equal((await state()).busy, false, 'one-coin gifts do not draw fortunes');
    const started = Date.now();
    client.emit('sim:gift', { user: 'Năm xu', tierId: 'que' });
    await wait(300);
    assert.ok((await state()).movement.onStage, 'the preceding gift is still being honored');
    assert.equal((await state()).shaking, false, 'the draw waits for the preceding prayer');
    await until((s) => s.shaking);
    assert.equal((await state()).shown, false, 'card is hidden while shaking');
    await until((s) => Math.abs(s.jar.rotation) > 0.03);
    if (soundEnabled) {
      await until((s) => !s.rattle.paused && s.rattle.time > 0);
    } else {
      assert.equal((await state()).rattle.paused, true, 'mute=1 silences the shake effect');
    }
    assert.equal(await evaluate('window.__movement().onStage'), null, 'no prayer starts while the jar shakes');
    assert.ok(await evaluate('window.__movement().zoom <= 1.01'), 'the full hall and jar stay visible while shaking');
    await shot('shaking');
    client.emit('sim:fortune', { user: 'Lượt tiếp' });
    await until((s) => s.waiting === 1);
    let s = await until((s) => s.shown);
    assert.ok(Date.now() - started >= 1700, 'the reveal waits for the shake');
    assert.equal(s.shaking, false);
    assert.equal(s.jar.rotation, 0, 'jar settles after shaking');
    assert.equal(s.rattle.paused, true, 'rattle stops before the card appears');
    await wait(400);
    await shot('card');
    client.emit('sim:gift', { user: 'Quà trong lúc xem quẻ', tierId: 'huong' });
    await wait(4000);
    s = await state();
    assert.equal(s.shown, true, 'the card remains visible for its full reading time');
    assert.equal(s.movement.onStage, null, 'other gifts also wait while the card is visible');
    assert.ok(s.movement.zoom <= 1.01, 'camera stays wide throughout the reveal');
    s = await until((s) => s.movement.onStage?.user === 'Năm xu');
    assert.equal(s.shown, false, 'the matching prayer begins after the card closes');
    assert.equal(s.shaking, false);
    if (soundEnabled) {
      s = await until((s) => s.movement.figures.some((f) => f.user === 'Năm xu' && f.pose.startsWith('walk')));
      assert.equal(s.movement.bell.paused, true, 'the bell stays silent while the disciple walks to the altar');
      s = await until((s) => s.movement.zoom > 1.01 && !s.movement.bell.paused && s.movement.bell.time > 0);
      const disciple = s.movement.figures.find((f) => f.user === 'Năm xu');
      assert.ok(!disciple.pose.startsWith('walk'), 'the bell starts after walking ends');
      assert.equal(disciple.y, 1158, 'the disciple has reached the kneeling spot when the bell strikes');
      assert.ok(s.movement.bell.time < 1, 'a fresh bell starts as the disciple begins kneeling');
    } else {
      assert.equal(s.movement.bell.paused, true, 'mute=1 silences the temple bell');
    }
    await until((s) => s.shaking && s.waiting === 0);
    assert.equal((await state()).shown, false, 'queued draw shakes before revealing its card');
    assert.equal((await state()).movement.onStage, null, 'the next draw waits for the preceding prayer to finish');
    assert.ok((await state()).movement.zoom <= 1.01, 'the next shake begins after the camera returns');
    console.log('OK: preceding prayer → wide camera → shake → complete card → matching prayer; other gifts wait');

    client.emit('session:reset');
    await until((s) => !s.busy && !s.shaking && !s.shown && s.waiting === 0);
    assert.equal((await state()).rattle.paused, true, 'reset stops the shake sound immediately');
    assert.equal((await state()).movement.bell.paused, true, 'reset stops the temple bell');
    assert.equal((await state()).movement.bell.time, 0, 'reset rewinds the temple bell');
    client.emit('sim:fortune', { user: 'Phiên mới' });
    await until((s) => s.shaking);
    await until((s) => s.shown);
    const text = await evaluate('document.getElementById("stage").textContent');
    assert.ok(text.includes('Phiên mới') && !text.includes('Lượt tiếp'), 'reset cancels the old draw');
    client.emit('session:reset');
    await until((s) => !s.busy && !s.shown);
    await wait(5500);
    assert.equal((await state()).shown, false, 'reset during a visible card stays cleared');

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    client.emit('sim:fortune', { user: 'Giảm chuyển động' });
    await until((s) => s.shaking);
    await wait(700);
    s = await state();
    assert.equal(s.jar.rotation, 0, 'reduced motion keeps the jar still');
    assert.equal(s.shown, false);
    await until((s) => s.shown);
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('OK: reset cancels draws; reduced motion preserves reveal timing without shaking');
    console.log(`OK: jar scale 1.5; shake audio ${soundEnabled ? 'plays in sync and stops on reveal/reset' : 'stays silent with mute=1'}`);
    console.log(`OK: temple bell ${soundEnabled ? 'waits for arrival, starts with kneeling and stops on reset' : 'stays silent with mute=1'}`);
  } finally {
    client.close();
    ws?.close();
    const chromeExited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await chromeExited;
    await new Promise((r) => io.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
