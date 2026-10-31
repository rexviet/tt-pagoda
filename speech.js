// Spoken lines for each feature: "<name> đã dâng hương, chúc bạn <random blessing>".
// Default voice is the local macOS "Linh" voice: offline and fast enough to start with the animation.
// TTS_PROVIDER=edge switches to the Microsoft Edge neural voice (nicer, but it needs the network and
// was seen taking 5-7 s or dropping mid-sentence), with Linh as the fallback when it fails.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const PROVIDER = process.env.TTS_PROVIDER === 'edge' ? 'edge' : 'say';
const EDGE_VOICE = process.env.TTS_VOICE || 'vi-VN-HoaiMyNeural';
const CACHE_DIR = path.join(__dirname, '.cache', 'tts');
const MAX_NAME_LENGTH = 20;

const ACTIONS = {
  huong: 'đã dâng hương',
  buc: 'đã lên bục đệm xám quỳ lạy',
  tambao: 'đã lên bục Tam Bảo tặng công đức',
  hoadang: 'đã thả đèn hoa đăng',
  phaphoi: 'đã khai Pháp Hội Vạn Phật',
  share: 'đã chia sẻ buổi lễ',
};

const BLESSINGS = [
  'bình an, vạn sự như ý',
  'sức khỏe dồi dào',
  'gặp thật nhiều may mắn',
  'tiền vào như nước',
  'sớm có người yêu',
  'công việc thuận lợi',
  'gia đình hạnh phúc',
  'tâm an, trí sáng',
  'học hành đỗ đạt',
  'phúc lộc đầy nhà',
  'mọi điều ước thành sự thật',
  'cả năm đắc lộc',
];

// TikTok nicknames carry emoji and symbols that a voice would read out loud or choke on.
function speakableName(name) {
  const clean = String(name || '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return clean || 'Một Phật tử';
}

function buildLine(kind, name, random = Math.random) {
  const action = ACTIONS[kind];
  if (!action) return null;
  const blessing = BLESSINGS[Math.floor(random() * BLESSINGS.length)];
  return `${speakableName(name)} ${action}, chúc bạn ${blessing}`;
}

// ---- synthesis -------------------------------------------------------------

async function synthEdge(text) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge tts timeout')), 8000);
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => { clearTimeout(timer); resolve(); });
      audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const audio = Buffer.concat(chunks);
    if (!audio.length) throw new Error('edge tts returned no audio');
    return audio;
  } finally {
    try { tts.close(); } catch (_) { /* already closed */ }
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
  });
}

async function synthSay(text) {
  const tmp = path.join(os.tmpdir(), `temple-say-${crypto.randomUUID()}`);
  try {
    await run('say', ['-v', 'Linh', '-o', `${tmp}.aiff`, text]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${tmp}.aiff`, '-codec:a', 'libmp3lame', '-b:a', '64k', `${tmp}.mp3`]);
    return fs.readFileSync(`${tmp}.mp3`);
  } finally {
    for (const ext of ['aiff', 'mp3']) fs.rm(`${tmp}.${ext}`, () => {});
  }
}

async function synthesize(text) {
  if (PROVIDER === 'say') return synthSay(text);
  try {
    return await synthEdge(text);
  } catch (err) {
    console.error('[tts] edge voice failed, falling back to macOS voice:', err.message);
    return synthSay(text);
  }
}

// Same line -> same file, so repeated phrases are instant and never hit the network twice.
const inflight = new Map();
function audioFor(text) {
  const id = crypto.createHash('sha1').update(text).digest('hex').slice(0, 20);
  const file = path.join(CACHE_DIR, `${id}.mp3`);
  if (fs.existsSync(file)) return Promise.resolve(fs.readFileSync(file));
  if (!inflight.has(id)) {
    const job = synthesize(text)
      .then((buf) => {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, buf);
        return buf;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, job);
  }
  return inflight.get(id);
}

module.exports = { buildLine, audioFor, speakableName, BLESSINGS, ACTIONS };
