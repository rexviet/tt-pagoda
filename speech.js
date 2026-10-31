// Spoken line for each feature: "<name> đã dâng hương, chúc bạn <random blessing>".
//
// Voice providers (TTS_PROVIDER):
//   omnivoice  VoiceStudio server with a cloned voice (the GPU box on the LAN, ~1 s per line).
//              OMNIVOICE_URL, OMNIVOICE_VOICE, OMNIVOICE_STEPS, OMNIVOICE_PIN or OMNIVOICE_API_KEY.
//              The local VoiceStudio on the Mac (device mps) produced noise instead of speech, so point this at the GPU box.
//   say        macOS "Linh" voice, offline and instant (default when nothing is configured)
//   edge       Microsoft Edge neural voice (needs network, was seen dropping mid-sentence)
// If the chosen provider fails for a line, the macOS voice reads it (that line is not cached).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const PROVIDER = ['say', 'edge', 'omnivoice'].includes(process.env.TTS_PROVIDER) ? process.env.TTS_PROVIDER : 'say';
const OMNI_URL = (process.env.OMNIVOICE_URL || 'http://127.0.0.1:3900').replace(/\/$/, '');
const OMNI_VOICE = process.env.OMNIVOICE_VOICE || 'default';
const OMNI_STEPS = Number(process.env.OMNIVOICE_STEPS) || 16; // fewer steps = faster, rougher
const OMNI_TIMEOUT_MS = 10000; // a live line that takes longer is not worth waiting for
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

// Returns the clips to play in order (one line), or null for an unknown feature.
function buildParts(kind, name, random = Math.random) {
  const action = ACTIONS[kind];
  if (!action) return null;
  const blessing = BLESSINGS[Math.floor(random() * BLESSINGS.length)];
  return [`${speakableName(name)} ${action}, chúc bạn ${blessing}`];
}

// ---- synthesis -------------------------------------------------------------

function omniHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OMNIVOICE_PIN) headers['X-OmniVoice-Pin'] = process.env.OMNIVOICE_PIN;
  if (process.env.OMNIVOICE_API_KEY) headers.Authorization = `Bearer ${process.env.OMNIVOICE_API_KEY}`;
  return headers;
}

// The GPU box has one worker and a one-deep queue, and answers 429 ("safe to retry") beyond that. A burst of gifts would
// otherwise hit it all at once, so lines go out one at a time and a 429 waits briefly and tries again.
let omniTurn = Promise.resolve();
let omniQueued = 0;
const MAX_QUEUED_LINES = 6; // beyond this a line is not worth waiting for: it falls back to the macOS voice
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestOmni(text) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${OMNI_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: omniHeaders(),
      body: JSON.stringify({
        input: text, voice: OMNI_VOICE, language: 'vi', response_format: 'mp3', num_step: OMNI_STEPS,
      }),
      signal: AbortSignal.timeout(OMNI_TIMEOUT_MS),
    });
    if (res.status === 429 && attempt < 5) { await sleep(400 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`omnivoice ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new Error('omnivoice returned no audio');
    return audio;
  }
}

function synthOmni(text) {
  if (omniQueued >= MAX_QUEUED_LINES) return Promise.reject(new Error(`${omniQueued} lines already waiting for the voice server`));
  omniQueued++;
  const result = omniTurn.then(() => requestOmni(text));
  omniTurn = result.catch(() => {}).finally(() => { omniQueued--; });
  return result;
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

// ---- cache -----------------------------------------------------------------

// The key includes the voice settings, so switching voice never replays an old voice's lines.
const cacheKey = (text) => crypto.createHash('sha1')
  .update(`${PROVIDER}|${PROVIDER === 'omnivoice' ? `${OMNI_VOICE}|${OMNI_STEPS}` : EDGE_VOICE}|${text}`)
  .digest('hex').slice(0, 20);

const inflight = new Map();
function audioFor(text) {
  const key = cacheKey(text);
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  if (fs.existsSync(file)) return Promise.resolve(fs.readFileSync(file));
  if (!inflight.has(key)) {
    const job = (async () => {
      try {
        const buf = await PRIMARY(text);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, buf);
        return buf;
      } catch (err) {
        if (PROVIDER === 'say') throw err;
        console.error(`[tts] ${PROVIDER} failed, reading the line with the macOS voice:`, err.message);
        return synthSay(text); // not cached: the real voice gets another chance next time
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return inflight.get(key);
}

// Logs at startup whether the configured voice server answers and has the voice, so a wrong PIN or
// address shows up before the first gift instead of as a silent fallback to the macOS voice.
async function checkVoiceServer() {
  if (PROVIDER !== 'omnivoice') return console.log(`[tts] voice: ${PROVIDER}`);
  try {
    const res = await fetch(`${OMNI_URL}/v1/audio/voices`, { headers: omniHeaders(), signal: AbortSignal.timeout(4000) });
    if (res.status === 401) throw new Error('rejected the PIN / key (401)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const voices = (await res.json()).voices || [];
    const found = voices.some((v) => [v.id, v.voice_id, v.name].some((x) => String(x).toLowerCase() === OMNI_VOICE.toLowerCase()));
    if (!found && OMNI_VOICE !== 'default') {
      console.error(`[tts] ${OMNI_URL} has no voice "${OMNI_VOICE}"; available: ${voices.map((v) => v.name).join(', ')}`);
    } else {
      console.log(`[tts] voice: omnivoice "${OMNI_VOICE}" at ${OMNI_URL} (${OMNI_STEPS} steps)`);
    }
  } catch (err) {
    console.error(`[tts] voice server ${OMNI_URL} is not usable (${err.message}); lines will fall back to the macOS voice`);
  }
}

module.exports = { buildParts, audioFor, checkVoiceServer, speakableName, BLESSINGS, ACTIONS, PROVIDER };
