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

## Giọng nói

Mỗi quà và mỗi lượt chia sẻ được đọc thành một câu: "<tên> đã dâng hương, chúc bạn <lời chúc ngẫu nhiên>".
Lời chúc sửa trong `speech.js` (`BLESSINGS`). Tick "Control audio via OBS" trong Browser Source để giọng lên stream.
Chỉ trang overlay trong **OBS** phát tiếng, để không bị đọc đôi khi còn tab Chrome mở. Muốn nghe thử trong Chrome thì mở `/overlay?sound=1`.
Nếu OBS của bạn im lặng, thêm `?sound=1` vào URL của Browser Source.

Giọng đọc cấu hình bằng file `.env` (git bỏ qua). Copy `.env.example` thành `.env` rồi điền:

- `TTS_PROVIDER=omnivoice`, `OMNIVOICE_URL`, `OMNIVOICE_VOICE`, `OMNIVOICE_PIN`: giọng clone trên server VoiceStudio có GPU.
  Server trên Mac (device mps) từng tạo ra tiếng ồn thay vì tiếng người, nên dùng server GPU.
- Không có `.env`: dùng giọng macOS Linh. Server GPU lỗi hoặc chậm quá 10 giây thì câu đó tự đọc bằng giọng Linh.
- Khởi động sẽ in dòng `[tts] voice: ...` cho biết server giọng có dùng được và có voice không (sai PIN báo ngay).

Kiểm tra một câu: `node scripts/tts-check.js`. Mỗi quà gọi một lần API (khoảng 1 giây), câu đã đọc được cache trong `.cache/tts`.

## Chẩn đoán âm thanh

Thêm `&debug=1` vào link overlay (ví dụ `/overlay?sound=1&debug=1`): trang in lên màn hình việc âm thanh có được phép không, nhạc đang phát hay bị chặn, và trạng thái giọng đọc.

## Đám đông

Phật tử đứng khắp nền điện, mỗi người một chỗ cố định (khoảng 400 chỗ). "Đám đông nền" ở trang admin (mặc định 150, biến `AMBIENT_CROWD` trong `.env`) là những Phật tử vô danh đứng sẵn để điện luôn đông; người xem thật đứng xen vào, kéo về 0 nếu chỉ muốn thấy người xem thật.
Khi có quà, nhân vật chạy thẳng lên sát bàn thờ, máy quay lấy khung bàn thờ và tượng Phật (`ALTAR_VIEW` trong `public/overlay.js`) còn đám đông mờ đi để chỉ thấy người đó. Mỗi lần chỉ một người; quà đến dồn thì xếp hàng, quá 3 người chờ thì người thừa chỉ cúi lạy tại chỗ. Tên chỉ hiện với người đang vào phòng, chat hoặc tặng quà.
