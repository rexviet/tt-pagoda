// Checks how a name is read out: rude words become "Chị L" / "Anh C" instead of being spoken in full.
// No server needed. Usage: node scripts/speech-name-test.js
const { speakableName, buildParts } = require('../speech');

const cases = [
  ['Thanh Đạt 🌸', 'Thanh Đạt'], // an ordinary name is untouched
  ['Lan Lồn', 'Chị L'],
  ['lồn', 'Chị L'],
  ['LỒN con', 'Chị L'],
  ['Bé Cặc 123', 'Anh C'],
  ['cặc_to', 'Anh C'],
  ['Lồng Đèn', 'Lồng Đèn'], // "lồng" only starts with the same letters
  ['Cặp Đôi', 'Cặp Đôi'],
  ['lồn cặc', 'Chị L'], // both: the first one found wins
  ['Lồn'.normalize('NFD'), 'Chị L'], // a decomposed accent still counts
];
let bad = 0;
for (const [input, want] of cases) {
  const got = speakableName(input);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? '' : ` (wanted ${JSON.stringify(want)})`}`);
}
const line = buildParts('huong', 'Lan Lồn', () => 0).join(' ');
const lineOk = line.startsWith('Chị L đã dâng hương') && !/lồn/i.test(line);
if (!lineOk) bad++;
console.log(`${lineOk ? 'ok ' : 'BAD'}  the spoken line uses the replacement: ${line}`);
console.log(bad ? 'RESULT: FAIL' : 'RESULT: rude names are read as Chị L / Anh C');
process.exit(bad ? 1 : 0);
