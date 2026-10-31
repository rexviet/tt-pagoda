// Gift tiers by total coins (diamondCount x repeatCount) of one gift event.
// Highest minCoins that the amount reaches wins. Edit here to retune the milestones.
const GIFT_TIERS = [
  { id: 'huong', minCoins: 1, label: '1 Xu — Dâng Hương', narration: 'dâng hương' },
  { id: 'buc', minCoins: 5, label: '5 Xu — Lên Bục Đệm Xám', narration: 'lên bục lạy sát đất' },
  { id: 'tambao', minCoins: 10, label: '10 Xu — Lên Bục Đỏ Tam Bảo', narration: 'lên bục đỏ Tam Bảo' },
  { id: 'hoadang', minCoins: 50, label: '50 Xu — Thả Đèn Hoa Đăng', narration: 'thả đèn hoa đăng, xin quẻ Đại Cát' },
  { id: 'phaphoi', minCoins: 100, label: '100 Xu — Pháp Hội Vạn Phật', narration: 'khai Pháp Hội Vạn Phật' },
];

function tierForCoins(coins) {
  let found = null;
  for (const t of GIFT_TIERS) if (coins >= t.minCoins) found = t;
  return found;
}

module.exports = { GIFT_TIERS, tierForCoins };
