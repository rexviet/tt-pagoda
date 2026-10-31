// Synthesizes one sample line and reports size, so you can confirm the voice works before going live.
// Usage: node scripts/tts-check.js [kind] [name]
const fs = require('fs');
const path = require('path');
const { buildParts, audioFor, speakableName, PROVIDER } = require('../speech');

(async () => {
  const kind = process.argv[2] || 'huong';
  const name = process.argv[3] || 'Thanh Đạt 🌸';
  console.log('provider:', PROVIDER, '| name:', JSON.stringify(speakableName(name)));
  const parts = buildParts(kind, name);
  console.log('line   :', parts.join(' '));
  const outDir = path.join(__dirname, '..', '.cache', 'sample');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [i, text] of parts.entries()) {
    const t0 = Date.now();
    const audio = await audioFor(text);
    const out = path.join(outDir, `line-${i}.mp3`);
    fs.writeFileSync(out, audio);
    console.log(`clip ${i}: ${audio.length} bytes in ${Date.now() - t0} ms -> ${out}`);
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
