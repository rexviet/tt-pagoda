// Self-contained regression check. No live room or TTS provider required.
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { io: connect } = require('socket.io-client');
const speech = require('../speech');
const spoken = [];
speech.audioFor = async (text) => { spoken.push(text); return Buffer.from('test'); };
process.env.STREAK_IDLE_MS = '400';
const { server, io, attachTikTokHandlers } = require('../server');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const user = (name) => ({ uniqueId: name, nickname: name });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const config = await (await fetch(`http://localhost:${server.address().port}/api/config`)).json();
  const configuredSpeed = Number(process.env.CHAT_WALK_SPEED);
  assert.equal(config.chatWalkSpeed, Number.isFinite(configuredSpeed) && configuredSpeed > 0 ? configuredSpeed : 420);
  const client = connect(`http://localhost:${server.address().port}`);
  try {
    const events = [];
    let board = [];
    client.on('leaderboard', (rows) => { board = rows; });
    client.on('overlay', (e) => events.push(e));
    await new Promise((r) => client.on('connect', r));
    const conn = new EventEmitter();
    attachTikTokHandlers(conn);
    const join = async (name) => {
      conn.emit('member', { user: user(name), action: 1 });
      await wait(50);
      return events.filter((e) => e.type === 'join').at(-1);
    };
    const first = await join('Thanh Đạt 🌸');
    assert.ok(first.speech?.length, 'an idle room greets new arrivals');
    assert.match(spoken.at(-1), /^(Thí chủ Thanh Đạt đến rồi, hoan hỷ quá!|Mừng thí chủ Thanh Đạt về chùa!)$/);

    for (let i = 0; i < 6; i++) {
      conn.emit('gift', { user: user(`Leader${i}`), giftId: `leader${i}`, gift: { type: 2, diamondCount: 100 }, repeatCount: 1 });
    }

    for (const [coins, total, altar] of [[1, 1, false], [3, 4, false], [1, 5, true], [1, 6, false], [4, 10, true], [5, 15, true]]) {
      conn.emit('gift', { user: user('Donor'), giftId: total, gift: { type: 2, diamondCount: 1 }, repeatCount: coins });
      await wait(40);
      const ev = events.filter((e) => e.type === 'gift').at(-1);
      assert.deepEqual([ev.totalCoins, ev.altar], [total, altar]);
    }
    for (const [perUnit, count, total, altar] of [[1, 1, 1, false], [5, 1, 6, true], [1, 1, 7, false], [10, 1, 17, true], [5, 2, 27, true], [1, 5, 32, false]]) {
      conn.emit('gift', { user: user('Outside'), giftId: `outside${total}`, gift: { type: 2, diamondCount: perUnit }, repeatCount: count });
      await wait(40);
      const ev = events.filter((e) => e.type === 'gift').at(-1);
      assert.deepEqual([ev.perUnit, ev.totalCoins, ev.altar], [perUnit, total, altar], 'routing uses gift unit price, not the combined gift amount');
    }
    for (const [coins, total] of [[101, 101], [1, 102]]) {
      conn.emit('gift', { user: user('VIP'), giftId: `vip${total}`, gift: { type: 2, diamondCount: coins }, repeatCount: 1 });
      await wait(40);
      const ev = events.filter((e) => e.type === 'gift').at(-1);
      assert.deepEqual([ev.totalCoins, ev.altar], [total, true], 'top six always receives an altar visit, including promotion');
    }
    assert.equal((await join('Recent')).speech, null, 'a recent gift suppresses the greeting');
    await wait(2050);
    assert.ok((await join('AfterPause')).speech?.length, 'greetings resume after two seconds');

    conn.emit('gift', { user: user('Streak'), groupId: 'streak', gift: { type: 1, diamondCount: 1 }, repeatCount: 1 });
    assert.equal((await join('DuringStreak')).speech, null, 'even an unsettled streak suppresses greetings');
    client.emit('voice:set', false);
    await wait(2100);
    assert.equal((await join('Muted')).speech, null);
    client.emit('session:reset');
    client.emit('voice:set', true);
    await wait(50);
    client.emit('sim:join', { user: 'SimArrival' });
    await wait(50);
    assert.ok(events.filter((e) => e.type === 'join').at(-1).speech?.length, 'simulation uses the same greeting pipeline');
    client.emit('sim:gift', { user: 'SimDonor', tierId: 'huong' });
    await wait(50);
    const sim = events.filter((e) => e.type === 'gift').at(-1);
    assert.deepEqual([sim.totalCoins, sim.altar], [1, true], 'first donor after reset occupies a VIP cushion');
    const topSix = Array.from({ length: 6 }, (_, i) => ({ userId: `sim:Top ${i + 1}`, name: `Top ${i + 1}`, score: 100 }));
    const beforeSeed = events.length;
    client.emit('sim:top6');
    await wait(50);
    assert.deepEqual(board, topSix, 'the preset replaces the ranking with six stable users at exactly 100 points');
    assert.deepEqual(events.slice(beforeSeed).map((e) => e.type), ['reset'], 'seeding does not trigger gift animations or a festival');
    client.emit('sim:gift', { user: 'Top 1', tierId: 'huong' });
    await wait(50);
    assert.equal(board[0].score, 101, 'normal gift simulation continues the seeded user');
    client.emit('sim:top6');
    await wait(50);
    assert.deepEqual(board, topSix, 'repeating the preset resets each score to 100');
    console.log('OK: top-six preset, exact scores, stable identities, gifts after seeding and repeated clicks');
    console.log('OK: cumulative milestones, greeting text, 2-second cooldown, streaks, mute, reset and simulation');
  } finally {
    client.close();
    await new Promise((r) => io.close(r));
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
