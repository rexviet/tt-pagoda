// Feeds fake TikTok events through the real handlers and checks what reaches the overlay.
// No live room, voice server or network needed. Usage: node scripts/tiktok-events-test.js
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

  console.log('OK: share (both paths), join, subscription ignored, chat');
  client.close();
  process.exit(0);
});
