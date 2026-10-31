# TikTok Live Temple

Overlay TikTok Live chủ đề chùa: quà → hoạt ảnh Phật tử, bảng xếp hạng, bong bóng chat.

## Chạy

```
npm install
npm start            # mặc định cổng 3000; đổi bằng PORT=3100 npm start
```

- Admin: `http://localhost:3000/admin`
- OBS Browser Source: `http://localhost:3000/overlay`, Width 1080, Height 1920

## Mốc quà

Chỉnh ở `gift-tiers.js` (1 / 5 / 10 / 50 / 100 xu, tính theo đơn giá × số lượng của một lượt tặng).
Quà liên tục (streak) chỉ được tính một lần khi chuỗi kết thúc.

## Thay hình thật

Hiện là hình vector tạm. Thả `public/assets/background.png` (1080×1920) để thay nền.

## Kiểm tra nhanh

Với server đang chạy: `PORT=3000 node scripts/sim-smoke.js`
