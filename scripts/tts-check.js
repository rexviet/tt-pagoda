// Synthesizes one sample line and reports size, so you can confirm the voice works before going live.
// Usage: node scripts/tts-check.js [kind] [name]
const fs = require('fs');
const path = require('path');
const { buildLine, audioFor, speakableName } = require('../speech');

(async () => {
  const kind = process.argv[2] || 'huong';
  const name = process.argv[3] || 'Thanh Đạt 🌸';
  const line = buildLine(kind, name);
  console.log('name  :', JSON.stringify(speakableName(name)));
  console.log('line  :', line);
  const t0 = Date.now();
  const audio = await audioFor(line);
  const out = path.join(__dirname, '..', '.cache', 'sample.mp3');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, audio);
  console.log(`audio : ${audio.length} bytes in ${Date.now() - t0} ms -> ${out}`);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
