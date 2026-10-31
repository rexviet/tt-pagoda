// Spoken lines for each feature: "<name> đã dâng hương, chúc bạn <random blessing>".
//
// A line is two clips played back to back: the NAME and a fixed TAIL ("đã dâng hương, chúc bạn ...").
// The 72 possible tails are synthesized once in the background and cached on disk, so at runtime only
// the name needs synthesizing, and names are cached too (a returning supporter costs nothing).
//
// Voice providers (TTS_PROVIDER):
//   omnivoice (default)  local VoiceStudio server, cloned voice  -> OMNIVOICE_URL, OMNIVOICE_VOICE, OMNIVOICE_STEPS
//   say                  macOS "Linh" voice, offline and instant
//   edge                 Microsoft Edge neural voice (needs network, was seen dropping mid-sentence)
// If the chosen provider fails for a clip, the macOS voice reads it (that clip is not cached).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const PROVIDER = ['say', 'edge', 'omnivoice'].includes(process.env.TTS_PROVIDER) ? process.env.TTS_PROVIDER : 'omnivoice';
const OMNI_URL = process.env.OMNIVOICE_URL || 'http://127.0.0.1:3900';
const OMNI_VOICE = process.env.OMNIVOICE_VOICE || 'phat-phap';
const OMNI_STEPS = Number(process.env.OMNIVOICE_STEPS) || 8; // fewer steps = faster, rougher
const EDGE_VOICE = process.env.TTS_VOICE || 'vi-VN-HoaiMyNeural';
const CACHE_DIR = path.join(__dirname, '.cache', 'tts');
const MAX_NAME_LENGTH = 20;
const NAME_BACKLOG_LIMIT = 3; // beyond this many names waiting, new ones are read as the generic name
const GENERIC_NAME = 'Một Phật tử';

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

const tailText = (action, blessing) => `${action}, chúc bạn ${blessing}`;
const allTails = () => Object.values(ACTIONS).flatMap((a) => BLESSINGS.map((b) => tailText(a, b)));

// TikTok nicknames carry emoji and symbols that a voice would read out loud or choke on.
function speakableName(name) {
  const clean = String(name || '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return clean || GENERIC_NAME;
}

// ---- synthesis -------------------------------------------------------------

async function synthOmni(text) {
  const res = await fetch(`${OMNI_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: text, voice: OMNI_VOICE, language: 'vi', response_format: 'mp3', num_step: OMNI_STEPS,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`omnivoice ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new Error('omnivoice returned no audio');
  return audio;
}

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

const PRIMARY = { omnivoice: synthOmni, edge: synthEdge, say: synthSay }[PROVIDER];

// ---- job queue: one synthesis at a time, live requests ahead of background warm-up -----------------

const queues = { high: [], low: [] };
let running = 0;
function schedule(fn, priority) {
  return new Promise((resolve, reject) => {
    queues[priority].push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  while (running < 1) {
    const job = queues.high.shift() || queues.low.shift();
    if (!job) return;
    running++;
    job.fn().then(job.resolve, job.reject).finally(() => { running--; pump(); });
  }
}
const backlog = () => queues.high.length + running;

// ---- cache -----------------------------------------------------------------

// The key includes the voice settings, so switching voice never replays an old voice's clips.
const cacheId = (text) => crypto.createHash('sha1')
  .update(`${PROVIDER}|${PROVIDER === 'omnivoice' ? `${OMNI_VOICE}|${OMNI_STEPS}` : EDGE_VOICE}|${text}`)
  .digest('hex').slice(0, 20);
const cacheFile = (text) => path.join(CACHE_DIR, `${cacheId(text)}.mp3`);
const isReady = (text) => fs.existsSync(cacheFile(text));

const inflight = new Map();
// opts.fallback=false makes a provider failure throw instead of using the macOS voice (used by warm-up).
function audioFor(text, { priority = 'high', fallback = true } = {}) {
  const file = cacheFile(text);
  if (fs.existsSync(file)) return Promise.resolve(fs.readFileSync(file));
  const key = cacheId(text);
  if (!inflight.has(key)) {
    const job = schedule(async () => {
      try {
        const buf = await PRIMARY(text);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, buf);
        return buf;
      } catch (err) {
        if (!fallback || PROVIDER === 'say') throw err;
        console.error(`[tts] ${PROVIDER} failed, reading "${text}" with the macOS voice:`, err.message);
        return synthSay(text); // not cached: the real voice gets another chance next time
      }
    }, priority).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return inflight.get(key);
}

// ---- lines -----------------------------------------------------------------

// Returns the clips to play in order: [name, tail], or null for an unknown feature.
function buildParts(kind, name, random = Math.random) {
  const action = ACTIONS[kind];
  if (!action) return null;
  const candidates = BLESSINGS.map((b) => tailText(action, b));
  const ready = candidates.filter(isReady);
  const pool = ready.length ? ready : candidates; // prefer a blessing that is already synthesized
  const tail = pool[Math.floor(random() * pool.length)];
  let nameText = speakableName(name);
  if (!isReady(nameText) && backlog() >= NAME_BACKLOG_LIMIT) nameText = GENERIC_NAME;
  return [nameText, tail];
}

// Synthesizes every tail (and the generic name) in the background so live events find them ready.
async function prewarm() {
  if (PROVIDER !== 'omnivoice') return;
  try {
    const health = await fetch(`${OMNI_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (err) {
    console.error(`[tts] omnivoice not reachable at ${OMNI_URL}; skipping warm-up (${err.message})`);
    return;
  }
  const todo = [GENERIC_NAME, ...allTails()].filter((t) => !isReady(t));
  if (!todo.length) return console.log('[tts] all spoken clips already cached');
  console.log(`[tts] warming ${todo.length} clips in the background with voice "${OMNI_VOICE}"...`);
  let done = 0;
  for (const text of todo) {
    try {
      await audioFor(text, { priority: 'low', fallback: false });
      done++;
    } catch (err) {
      console.error('[tts] warm-up stopped:', err.message);
      return;
    }
  }
  console.log(`[tts] warm-up finished (${done} clips)`);
}

module.exports = { buildParts, audioFor, prewarm, speakableName, isReady, BLESSINGS, ACTIONS, PROVIDER };
