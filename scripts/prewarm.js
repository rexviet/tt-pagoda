// Synthesizes every fixed phrase ("đã dâng hương, chúc bạn ...") and the generic name into .cache/tts,
// so the first live events find them ready. Already cached clips are skipped, so it is safe to re-run.
// Usage: node scripts/prewarm.js   (OmniVoice must be running)
const { prewarm, PROVIDER } = require('../speech');

if (PROVIDER !== 'omnivoice') {
  console.log(`TTS_PROVIDER is "${PROVIDER}", nothing to warm up.`);
  process.exit(0);
}
prewarm().then(() => process.exit(0));
