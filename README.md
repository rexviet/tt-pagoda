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

## ZeroTTS (giọng đọc chạy trên máy)

`TTS_PROVIDER=zerotts` dùng ZeroTTS: giọng tiếng Việt chạy ngay trên máy, không cần mạng. Một tiến trình Python (`tts_worker.py`) giữ model trong bộ nhớ; mỗi câu mất khoảng 2 giây, model nạp trong khoảng 3 giây lúc server khởi động.
Cài một lần:

```
uv venv --python 3.13 tts-env
uv pip install --python tts-env/bin/python zerotts
# model (1 GB) phải là thư mục file thật, KHÔNG phải cache Hugging Face toàn symlink (onnxruntime từ chối symlink):
uv run --python tts-env/bin/python python -c "from huggingface_hub import snapshot_download as d; d('zeroweight-ai/ZeroTTS', local_dir='models/zerotts')"
```

Đổi giọng bằng `ZEROTTS_VOICE` (maichi, baotrang, giahuy, hamy, huuduc, kimoanh, quangminh, tiendat). Worker hỏng hoặc quá 20 giây thì câu đó tự đọc bằng giọng Linh.

### Giọng riêng (đã nhân bản)

ZeroTTS không tự tạo giọng từ file thu: bạn tải đoạn thu mẫu lên platform.zeroweight.ai/audio rồi tải về một file zip. Cài một lần bằng `install_voice_zip` của thư viện (giọng nằm trong `~/.zerotts/voices`), sau đó đặt `ZEROTTS_VOICE` bằng **tên hiển thị** hoặc mã của giọng, không phân biệt hoa thường. Ví dụ giọng đã cài là `phat-phap` (mã `sf1hi6y17fPu8tAg8FaJ`). Tên sai thì worker báo trong log và dùng giọng đầu tiên trong danh sách.

### Phòng đông, quà đến dồn dập

Một câu lời chúc mất khoảng 2 giây để tạo (nhanh hơn khi máy rảnh) và 4 giây để đọc, nên không thể đọc hết mọi quà và chia sẻ khi phòng đông. Tool dùng một "xô suất": tối đa 3 câu liên tiếp, sau đó mỗi `SPEECH_REFILL_MS` (mặc định 4000 ms) được thêm một câu. Chia sẻ chỉ được đọc khi còn ít nhất 2 suất, nên quà luôn được ưu tiên. Sự kiện không có giọng vẫn hiện hình trên overlay, chỉ là im lặng.
Câu chờ quá 8 giây thì bị bỏ (không đọc muộn bằng giọng khác), worker bỏ qua câu đã quá hạn thay vì xử lý, và tối đa 4 câu chờ worker cùng lúc. Tắt server thì worker cũng tắt.

## Bộ nhân vật

Có hai bộ trong `public/assets/disciples/`, đặt tên `<tư thế>-<bộ>.png`:
- `devotee` (mặc định): lấy từ repo `tiktok-live-temple-rpc`, người thật nhìn từ sau lưng. Bộ này có thêm khung bước chân thứ hai (`walkup2`), khung quỳ xuống (`settle`) và ba bước cúi lạy (`bowa`, `bowb`, `bowc`), nên bước đi đổi chân và cúi lạy đi từng bước xuống sàn. Vì chỉ có góc nhìn sau lưng, nhân vật về chỗ bằng cách mờ đi ở bàn thờ rồi hiện lại ở chỗ đứng, thay vì đi lùi xuống.
- `brown`: nhân vật chibi.
Đổi bộ bằng đuôi địa chỉ overlay: `/overlay?outfits=brown` (không cần sửa file). Thêm bộ mới: bỏ ảnh `kneelup-<tên>.png` và `kneel-<tên>.png` (bắt buộc) cùng các tư thế khác nếu có, rồi dùng `?outfits=<tên>`.

## Cảnh điện: 6 đệm, điểm lạy và hàng đợi quà

- **Nền:** các vị trí (`ALTAR_SPOT`, `ALTAR_VIEW`, `CUSHION_Y`, các đệm, `CARPET_TOP_Y`, `FLOOR_TOP`) trong `public/overlay.js` được đo trên `public/assets/background.png` hiện tại (1792×2400, phủ khung 1080×1920). Đổi nền thì đo và chỉnh lại các số này.
- **Top 6 bảng xếp hạng** ngồi sẵn trên 6 đệm: hạng 1 và 2 ở hai đệm trong cùng (hạng 1 bên trái, hạng 2 bên phải), 3 và 4 ở cặp tiếp theo, 5 và 6 ở cặp ngoài cùng. Có người vượt lên thì mọi người dịch chỗ, người rớt khỏi top 6 trở về đám đông. Người ngồi đệm hiện tên kèm thứ hạng và được vẽ lớn hơn.
- **Tặng quà:** người tặng đi lên lạy ở giữa 6 đệm, máy quay lấy khung bàn thờ và tượng Phật, đám đông mờ đi.
- **Hàng đợi quà** (mỗi lần một người trên sân khấu): người đang chờ mà tặng thêm thì cộng dồn vào lượt chờ; quà lớn đi trước, còn lại ai đến trước đi trước; tối đa 5 người chờ (người thứ 6 trở đi chỉ cúi lạy tại chỗ); chờ quá 25 giây cũng chỉ cúi lạy tại chỗ. Banner và giọng nói bắt đầu cùng lượt lạy. Góc phải hiện "Đang chờ lạy: N". Kiểm thử: `scripts/overlay-queue-test.js`, `scripts/overlay-vip-test.js` (chạy server với `SPEECH_REFILL_MS=300`).
