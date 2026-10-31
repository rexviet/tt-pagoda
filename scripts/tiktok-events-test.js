// Feeds fake TikTok events through the real handlers and checks what reaches the overlay.
// No live room, voice server or network needed. Usage: node scripts/tiktok-events-test.js
process.env.STREAK_IDLE_MS = '400'; // a short pause so the test does not wait seconds for a streak to settle
process.env.TTS_PROVIDER = 'say'; // set before the server loads, so a local .env cannot point the test at the voice server
const assert = require('assert');
const EventEmitter = require('events');
const { io: connect } = require('socket.io-client');
const { server, attachTikTokHandlers } = require('../server');

const user = (nickname) => ({ nickname, uniqueId: nickname.toLowerCase().replace(/\s/g, '') });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(0, async () => {
  const client = connect(`http://localhost:${server.address().port}`);
  const received = [];
  client.on('overlay', (e) => received.push(e));
  await new Promise((r) => client.on('connect', r));

  const conn = new EventEmitter();
  attachTikTokHandlers(conn);
  const fire = async (event, data) => { received.length = 0; conn.emit(event, data); await wait(150); return [...received]; };

  let out = await fire('share', { user: user('Xi Trum') });
  assert.deepStrictEqual(out.map((e) => [e.type, e.user]), [['share', 'Xi Trum']], 'a share event reaches the overlay');
  assert.ok(Array.isArray(out[0].speech), 'a share is spoken');

  out = await fire('social', { user: user('Ban A'), common: { displayText: { key: 'pm_mt_guidance_share' } } });
  assert.deepStrictEqual(out.map((e) => e.type), ['share'], 'a social notice whose key says share counts as a share');

  out = await fire('social', { user: user('Ban B'), common: { displayText: { key: 'something_else', defaultPattern: '{0:user} đã chia sẻ phiên LIVE' } } });
  assert.deepStrictEqual(out.map((e) => e.type), ['share'], 'a social notice whose text says "chia sẻ" counts as a share');

  out = await fire('social', { user: user('Ban C'), common: { displayText: { key: 'pm_main_like_msg' } } });
  assert.deepStrictEqual(out, [], 'other social notices do nothing');

  out = await fire('member', { user: user('Vi Khach'), action: 1 });
  assert.deepStrictEqual(out.map((e) => [e.type, e.user]), [['join', 'Vi Khach']], 'a viewer joining reaches the overlay');

  out = await fire('member', { user: user('Ai Do'), action: 3 });
  assert.deepStrictEqual(out, [], 'a subscription notice is not a join');

  out = await fire('chat', { user: user('Nguoi Chat'), comment: 'a di da phat' });
  assert.deepStrictEqual(out.map((e) => e.type), ['chat']);

  // gifts: a one-off gift counts at once; a streak counts when it ends, or when it has gone quiet
  const gift = (userName, groupId, repeatCount, repeatEnd, giftType, diamondCount) => ({
    user: user(userName), giftId: 5655, groupId, repeatCount, repeatEnd, giftDetails: { giftType, diamondCount, giftName: 'Hoa hồng' },
  });
  const summary = (events) => events.filter((e) => e.type === 'gift').map((e) => [e.coins, e.tier]);
  const settleWait = () => wait(700); // longer than STREAK_IDLE_MS, so any pending streak timer has fired

  out = await fire('gift', gift('Mot Lan', 'g0', 1, false, 2, 5));
  assert.deepStrictEqual(summary(out), [[5, 'buc']], 'a one-off gift counts at once');

  out = await fire('gift', gift('Hoa Hong', 'g1', 1, false, 1, 1));
  assert.deepStrictEqual(out, [], 'a streak is not counted while it may still grow');
  await settleWait();
  assert.deepStrictEqual(summary(received), [[1, 'huong']], 'a quiet streak is settled even if the end message never comes');
  out = await fire('gift', gift('Hoa Hong', 'g1', 1, true, 1, 1));
  assert.deepStrictEqual(out, [], 'a late end message does not count the same rose again');

  await fire('gift', gift('Tap Lien', 'g2', 1, false, 1, 1));
  await fire('gift', gift('Tap Lien', 'g2', 2, false, 1, 1));
  out = await fire('gift', gift('Tap Lien', 'g2', 3, true, 1, 1));
  assert.deepStrictEqual(summary(out), [[3, 'huong']], 'an ended streak counts once, in full');
  received.length = 0;
  await settleWait();
  assert.deepStrictEqual(summary(received), [], 'the settled streak does not fire again from its timer');

  await fire('gift', gift('Tiep Tuc', 'g3', 1, false, 1, 1));
  await settleWait(); // settled with 1 rose
  await fire('gift', gift('Tiep Tuc', 'g3', 4, false, 1, 1));
  out = await fire('gift', gift('Tiep Tuc', 'g3', 4, true, 1, 1));
  assert.deepStrictEqual(summary(out), [[3, 'huong']], 'a streak that carries on after a pause only adds the new roses');

  out = await fire('gift', { user: user('Khong Gia'), giftId: 1, groupId: 'g4', repeatCount: 1, repeatEnd: true, giftDetails: { giftType: 2, giftName: 'La' } });
  assert.deepStrictEqual(out, [], 'a gift without a coin value is ignored, not crashed on');

  console.log('OK: share (both paths), join, subscription ignored, chat, gift streaks');
  client.close();
  process.exit(0);
});
