# TikTok Live Temple (tt-pagoda)

Overlay cho TikTok Live chủ đề chùa. Người xem tặng quà, chat, chia sẻ, vào phòng thì nhân vật Phật tử xuất hiện trong chánh điện: người tặng quà chạy lên bàn thờ lạy dưới máy quay zoom vào tượng Phật, top 6 bảng xếp hạng ngồi sẵn trên 6 đệm, lời chúc được đọc bằng giọng tiếng Việt.

> **Dùng Windows?** Xem [README-windows.md](README-windows.md). README này viết theo macOS.

Cách hoạt động: một server Node nhận sự kiện từ phòng live (thư viện `tiktok-live-connector`), phát cho trang **overlay** (Pixi.js, khung 1080×1920) mà OBS hoặc TikTok LIVE Studio nhúng vào làm nguồn hình. Trang **admin** để kết nối phòng, thử giả lập và chỉnh nhạc, giọng, đám đông.

## Mục lục

1. [Yêu cầu](#1-yêu-cầu)
2. [Cài đặt](#2-cài-đặt)
3. [Cấu hình `.env`](#3-cấu-hình-env)
4. [Chọn giọng đọc](#4-chọn-giọng-đọc)
5. [Chạy và thử bằng giả lập](#5-chạy-và-thử-bằng-giả-lập)
6. [Đưa overlay vào OBS hoặc LIVE Studio](#6-đưa-overlay-vào-obs-hoặc-live-studio)
7. [Kết nối phòng live thật](#7-kết-nối-phòng-live-thật)
8. [Nhạc nền](#8-nhạc-nền)
9. [Tùy chỉnh](#9-tùy-chỉnh)
10. [Kiểm thử](#10-kiểm-thử)
11. [Xử lý sự cố](#11-xử-lý-sự-cố)

## 1. Yêu cầu

| Cần | Ghi chú |
|---|---|
| Node.js 22 trở lên | server dùng `process.loadEnvFile` |
| ffmpeg | đổi âm thanh sang MP3 cho trình duyệt (`brew install ffmpeg`) |
| macOS (khuyên dùng) | giọng dự phòng dùng lệnh `say` của macOS; các phần khác chạy được trên máy khác |
| `uv` + Python 3.12 | chỉ cần nếu dùng giọng ZeroTTS (`brew install uv`); dùng 3.12 chứ không phải 3.13 (xem mục sự cố) |
| Google Chrome | chỉ cần để chạy các script kiểm thử |

## 2. Cài đặt

```bash
git clone https://github.com/rexviet/tt-pagoda.git
cd tt-pagoda
npm install
cp .env.example .env
```

Ảnh nền (`public/assets/background.png`) và nhân vật (`public/assets/disciples/`) đã nằm trong repo, không cần tải thêm.

## 3. Cấu hình `.env`

`.env` không được đưa lên git. Mở file vừa copy và chỉnh các dòng sau:

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `PORT` | cổng server | 3000 (file mẫu đặt 3150) |
| `TTS_PROVIDER` | giọng đọc: `zerotts`, `omnivoice`, `edge`, `say` | `say` khi không đặt |
| `ZEROTTS_VOICE` | tên hoặc mã giọng ZeroTTS | `maichi` |
| `OMNIVOICE_URL`, `OMNIVOICE_VOICE`, `OMNIVOICE_PIN` | server VoiceStudio (nếu dùng) | xem file mẫu |
| `AMBIENT_CROWD` | số Phật tử vô danh đứng sẵn (0 đến 350) | 50 |
| `COLOR_OUTFITS` | `0` = ai cũng mặc áo xám, không có áo hồng (top 6) và áo nâu (đám đông) | 1 |
| `MUSIC_VOLUME` | âm lượng nhạc nền (0 đến 1) | 0.25 |
| `NAME_FONT_SIZE` | cỡ chữ của tên trên đầu nhân vật, đơn vị px (10 đến 48) | 16 |
| `NAME_SHOW_SECONDS` | tên trên đầu nhân vật hiện bao nhiêu giây khi có người vào, chat hoặc vừa lạy xong; `0` = giữ thời gian có sẵn (2 đến 5 giây tuỳ lúc). Tên của người đang lạy và của top 6 trên đệm luôn hiện | 0 |
| `NAME_PLATE_OPACITY` | độ đậm của hộp đen phía sau tên nhân vật, từ `0` (không có hộp) đến `1` (đen đặc) | 0.78 |
| `SPEECH_REFILL_MS` | cứ bao lâu được thêm một câu đọc khi phòng đông | 4000 |
| `STREAK_IDLE_MS` | quà bấm liên tục được chốt sau khi im lặng bao lâu | 3000 |

Lưu ý: file mẫu đặt `TTS_PROVIDER=zerotts`, cần làm mục 4 cách B trước; nếu chưa cài ZeroTTS, đổi thành `say`. Nếu cổng 3000 đang bị chương trình khác dùng (ví dụ Docker), đặt `PORT` sang số khác.

## 4. Chọn giọng đọc

Mỗi quà được đọc thành một câu: "<tên> đã dâng hương, chúc bạn <lời chúc ngẫu nhiên>". Chia sẻ chỉ hiện chữ, không đọc. Chọn một trong các cách sau.

### Cách A: giọng macOS, không cần cài gì thêm
Đặt `TTS_PROVIDER=say`. Dùng giọng Linh của macOS, nghe hơi máy nhưng chạy ngay.

### Cách B: ZeroTTS (giọng tiếng Việt chạy trên máy, khuyên dùng)
Một tiến trình Python giữ model trong bộ nhớ, mỗi câu mất khoảng 2 giây, không cần mạng.

```bash
uv venv --python 3.12 tts-env
uv pip install --python tts-env/bin/python zerotts
```

Model (khoảng 1 GB) phải nằm trong thư mục toàn **file thật**, không phải cache Hugging Face vì cache đó toàn liên kết tượng trưng (symlink) mà onnxruntime từ chối nạp. Tải thẳng vào `models/zerotts`:

```bash
tts-env/bin/python -c "from huggingface_hub import snapshot_download as d; d('zeroweight-ai/ZeroTTS', local_dir='models/zerotts')"
```

> Lệnh tải model này chưa được chạy thử từ đầu trên máy sạch. Nếu trục trặc, cách chắc chắn là chép một bản model đã có file thật vào `models/zerotts`.

Rồi đặt trong `.env`: `TTS_PROVIDER=zerotts`. Có 8 giọng sẵn: `maichi`, `baotrang`, `giahuy`, `hamy`, `huuduc`, `kimoanh`, `quangminh`, `tiendat`; đổi bằng `ZEROTTS_VOICE`.

#### Dùng giọng riêng (file zip) với ZeroTTS: từng bước

ZeroTTS không tự tạo giọng từ file thu âm; giọng riêng được tạo trên nền tảng của họ rồi tải về dưới dạng file zip.

1. **Lấy file zip.** Vào https://platform.zeroweight.ai/audio, tải lên đoạn thu mẫu (3 đến 30 giây, tiếng Việt), rồi tải về file zip của giọng (tên dạng `ten-giong-xxxxxxxx.zip`). Đoạn thu được tải lên dịch vụ bên thứ ba, nên chỉ dùng giọng của chính bạn hoặc giọng bạn được phép dùng.
2. **Cài giọng vào máy (làm một lần).** Chạy trong thư mục dự án, thay đường dẫn bằng file zip của bạn:
   ```bash
   tts-env/bin/python -c "from zerotts import install_voice_zip; print(install_voice_zip('/duong/dan/ten-giong.zip'))"
   ```
   Kết quả in ra dạng `{'sf1hi6y17fPu8tAg8FaJ': PosixPath('.../.zerotts/voices/sf1hi6y17fPu8tAg8FaJ')}`: chuỗi trước dấu hai chấm là **mã giọng**. Giọng được lưu trong `~/.zerotts/voices`, nên các lần chạy sau không cần cài lại và không cần giữ file zip. Cài lại một zip cùng mã thì giọng cũ bị thay bằng bản mới.
3. **Xem lại các giọng đã cài** (nếu quên mã):
   ```bash
   tts-env/bin/python -c "from zerotts import installed_voices; print(list(installed_voices()))"
   ```
   Tên hiển thị bạn đặt trên nền tảng (ví dụ `phat-phap`) nằm trong file `meta.json` trong thư mục của giọng đó.
4. **Chọn giọng trong `.env`.** Đặt một trong hai dòng, dùng mã giọng hoặc tên hiển thị, không phân biệt hoa thường:
   ```
   TTS_PROVIDER=zerotts
   ZEROTTS_VOICE=phat-phap
   ```
5. **Chạy server:** `npm start`. Server nạp model và giọng khi khởi động. Dòng log đầu phải có tên giọng của bạn, ví dụ:
   ```
   [tts] voice: zerotts "sf1hi6y17fPu8tAg8FaJ" ready in 3.2s (9 voices, 48000 Hz)
   ```
   `9 voices` là 8 giọng có sẵn cộng giọng của bạn. Nếu `ZEROTTS_VOICE` sai tên, log báo `voice "..." not found, using "..."` kèm danh sách giọng có sẵn, và server dùng giọng đầu tiên trong danh sách.
6. **Nghe thử một câu** (không cần mở overlay): `node scripts/tts-check.js`. File âm thanh nằm ở `.cache/sample/line-0.mp3`.
7. **Đổi giọng sau này:** sửa `ZEROTTS_VOICE` rồi restart server. Câu đã đọc được lưu cache theo từng giọng nên đổi giọng không phát lại giọng cũ.

### Cách C: server VoiceStudio/OmniVoice
Đặt `TTS_PROVIDER=omnivoice` cùng `OMNIVOICE_URL`, `OMNIVOICE_VOICE`, `OMNIVOICE_PIN`. Tốc độ chỉnh bằng `OMNIVOICE_SPEED` (khuyên không quá 1.25).

### Nếu giọng lỗi
Câu đó tự đọc bằng giọng macOS. Khi khởi động, server in dòng `[tts] voice: ...` cho biết giọng đã sẵn sàng hay chưa. Kiểm tra riêng một câu: `node scripts/tts-check.js`.

### Phòng đông
Một câu mất khoảng 2 giây để tạo và 4 giây để đọc, nên không đọc hết mọi quà. Tool cho tối đa 3 câu liên tiếp, sau đó mỗi `SPEECH_REFILL_MS` thêm một câu. Sự kiện không có giọng vẫn hiện hình, chỉ là im lặng. Câu chờ quá 8 giây bị bỏ, không đọc muộn.

## 5. Chạy và thử bằng giả lập

```bash
npm start
```

Terminal in địa chỉ trang admin và overlay. Mở:

- **Admin:** `http://localhost:3000/admin` (đổi cổng theo `PORT`)
- **Overlay:** `http://localhost:3000/overlay?sound=1`

Để thử không cần phòng live thật, ở trang admin bấm các nút giả lập: quà theo từng mốc, người vào phòng, chia sẻ, đám đông. Khung "Xem trước Overlay" luôn im lặng; muốn nghe giọng thì mở `/overlay?sound=1` ở một tab riêng và chạm vào trang một lần (trình duyệt chỉ cho phát tiếng sau khi bạn bấm vào trang).

Mốc quà tính theo tổng xu của một lượt tặng, sửa ở `gift-tiers.js`:

| Xu | Hiệu ứng |
|---|---|
| 1 | dâng hương |
| 5 | xin xăm: rút một quẻ, không lên lạy |
| 10 | lạy sát đất |
| 20 | lạy, hào quang tượng Phật sáng lên |
| 50 | thả đèn hoa đăng |
| 100 trở lên | Pháp Hội Vạn Phật: cả chùa cùng lạy |

Quà bấm liên tục (như hoa hồng) được chốt sau `STREAK_IDLE_MS` khi người xem ngừng bấm.

## 6. Đưa overlay vào OBS hoặc LIVE Studio

Khung hình là **dọc 1080×1920**.

### OBS
1. Settings → Video: Base và Output đều **1080×1920**.
2. Thêm nguồn **Browser**: URL `http://localhost:3000/overlay`, Width **1080**, Height **1920**. Không cần `?sound=1` vì OBS tự phát tiếng.
3. Tick **Control audio via OBS** để giọng và nhạc đi vào stream. Bỏ tick "Shutdown source when not visible".

### TikTok LIVE Studio
Thêm nguồn **Link** với địa chỉ overlay **có đuôi `?sound=1&lite=1`**, kích thước tùy chỉnh 1080×1920. Nếu Studio không truy cập được máy chạy server, dùng ngrok.

`lite=1` là **chế độ nhẹ** cho lúc live: tắt khử răng cưa, giới hạn 30 khung hình/giây, dùng ảnh nền nhỏ hơn và chỉ vẽ tối đa khoảng 60 phật tử (đám đông nền tối đa 30; top 6 trên đệm luôn được giữ). Dùng khi hình bị giật. Nếu hình bị mờ thì thường do TikTok nén lại luồng: đặt độ phân giải và bitrate cao nhất trong Studio và xem thử trên Wi-Fi trước khi kết luận. Sau khi cập nhật code, tắt nguồn rồi thêm lại để Studio bỏ bản cũ trong bộ nhớ đệm.

> **Cảnh báo ngrok:** ngrok đưa **toàn bộ server** ra Internet, kể cả `/admin` (không có mật khẩu). Ai có link đều điều khiển được. Không chia sẻ link ngrok công khai, và tắt ngrok khi không live.

### Quy tắc âm thanh
Chỉ trang trong OBS tự phát tiếng. Mọi nơi khác (tab Chrome, LIVE Studio, điện thoại) cần `?sound=1`. Thêm `&debug=1` để hiện khung chẩn đoán trên màn hình (âm thanh có được phép không, nhạc có đang phát không). Thêm `?mute=1` để tắt tiếng trang đó.

### Tham số trên địa chỉ overlay

Thêm vào sau `/overlay`, nối nhiều tham số bằng `&`. Ví dụ: `http://localhost:3000/overlay?sound=1&lite=1`.

| Tham số | Tác dụng |
|---|---|
| `sound=1` | bật tiếng ở nơi không phải OBS (tab Chrome, LIVE Studio, điện thoại). Chỉ cần có tham số này là đủ |
| `mute=1` | tắt hẳn tiếng, kể cả trong OBS. Trang xem trước ở admin dùng tham số này |
| `lite=1` | chế độ nhẹ cho lúc live: tắt khử răng cưa, 30 khung hình/giây, ảnh nền nhỏ hơn, tối đa khoảng 60 phật tử (đám đông nền tối đa 30; top 6 luôn giữ) |
| `names=1` | hiện tên của mọi nhân vật liên tục (đám đông giả lập có tên bịa), để xem cảnh đông người. Phòng đông thì các nền tên đè lên nhau, chỉ dùng để thử |
| `outfits=devotee,brown,pink` | chọn bộ áo được nạp, cách nhau bằng dấu phẩy. Có `pink` thì top 6 mặc hồng; thiếu `pink` thì top 6 giữ áo của đám đông. Tham số này được ưu tiên hơn `COLOR_OUTFITS` trong `.env` |
| `debug=1` | hiện khung chẩn đoán (âm thanh có được phép không, nhạc, hàng đợi giọng đọc, ...) |
| `queuewait=<ms>` | thời gian tối đa một quà chờ tới lượt lên lạy (mặc định 25000). Dùng khi kiểm thử |

`sound`, `mute` và `debug` chỉ cần xuất hiện trên địa chỉ, còn `lite` và `names` phải đúng `=1`.

## 7. Kết nối phòng live thật

1. **Bắt đầu live trước.** Tool chỉ nối được vào phòng đang phát.
2. Mở trang admin ở `localhost` (không mở qua ngrok), nhập **tên tài khoản TikTok** đang live (phần sau dấu `@`, không phải tên hiển thị, không phải Room ID).
3. Bấm **Kết nối Live**, chờ nhãn xanh "Đã kết nối phòng Live @… (Room ID …)". Room ID tool tự tìm.
4. Người đã vào phòng từ trước khi kết nối thì tool không biết; nhờ họ thoát rồi vào lại.

Mỗi lần restart server phải bấm **Kết nối Live** lại. Mỗi quà nhận được in một dòng log ở terminal (`[tiktok] gift from ...`), giúp biết sự kiện có tới không.

Trước khi lên sóng thật, bấm **Làm Mới Phiên Live** để xóa bảng xếp hạng thử.

**Gieo quẻ:** quà 5 xu là quà xin xăm: người tặng rút một quẻ, không lên lạy. Chat chữ `xin xăm` không rút quẻ. Overlay hiện tờ giải quẻ (hạng quẻ, bài thơ, lời bàn) trong 5 giây, giọng đọc nói tên người gieo cùng hạng và vế đầu tên quẻ; tối đa 5 tờ chờ lượt. Đổi mốc xu ở `gift-tiers.js`. Bộ quẻ nằm trong `fortunes.js`, thêm quẻ mới ở đó. Trên trang admin có nút giả lập quà 5 xu và nút **Giả Lập Xin Xăm / Gieo Quẻ** để thử.

**Người rời phòng:** khi ai đó thoát, nhân vật của họ biến mất. Nếu TikTok không báo ai vừa thoát (thường là vậy), overlay dựa vào số người xem của phòng: khi số nhân vật nhiều hơn số người xem, những người im lặng lâu nhất bị coi là đã rời. Top 6 trên đệm và người đang chờ lạy được giữ lại; ai quay lại hoặc tặng quà sẽ có nhân vật mới. Cách này là ước lượng, chưa được thử trên phòng live thật.

### Phát từ điện thoại (nếu tài khoản chưa dùng được LIVE Studio)
TikTok hạn chế phát từ máy tính với một số tài khoản. Khi đó có thể mở overlay trên điện thoại cùng Wi-Fi (`http://<IP máy>:3000/overlay?sound=1`) rồi phát màn hình. Cách này chưa được kiểm chứng đầy đủ, nhất là phần âm thanh.

## 8. Nhạc nền

Thả file `.mp3`, `.ogg`, `.m4a`, `.wav`, `.webm` hoặc `.opus` vào `public/assets/music/`. Overlay phát lần lượt và lặp lại, **tự nhỏ lại khi có giọng đọc**. Không có file thì không phát gì và không báo lỗi. Bật, tắt và chỉnh âm lượng ở trang admin.

Chỉ tải lại trang overlay là đủ, không cần restart server. File nhạc không được đưa lên git (xem `.gitignore`). Dùng nhạc miễn phí bản quyền hoặc nhạc bạn có quyền dùng, vì nhạc có bản quyền có thể khiến TikTok tắt tiếng buổi live.

## 9. Tùy chỉnh

### Cảnh điện
- **Ảnh nền:** `public/assets/background.png`, nên 2160×3840 (tỉ lệ 9:16, mỗi cạnh không quá 4096). Các vị trí trong `public/overlay.js` (`ALTAR_SPOT`, `ALTAR_VIEW`, `CUSHION_Y`, vị trí 6 đệm, `CARPET_TOP_Y`, `FLOOR_TOP`) được **đo trên ảnh nền hiện tại**; đổi ảnh thì phải đo và chỉnh lại các số này.
- **Top 6 bảng xếp hạng** ngồi sẵn trên 6 đệm: hạng 1 và 2 ở hai đệm trong cùng, rồi 3 và 4, rồi 5 và 6. Ai vượt lên thì mọi người dịch chỗ. Bảng "TÂM LÒNG THÀNH" hiện hạng 7 đến 10, ẩn khi chưa có ai. Đầu bảng ghi số xu của hạng 6 (mức người ngoài đệm cần vượt). Mỗi dòng cho biết còn bao nhiêu xu để lên đệm (còn 1 hoặc 2 xu thì chữ cam). Điểm bằng nhau thì ai đạt mức điểm đó trước xếp trên, nên người chỉ đuổi kịp vẫn xếp sau và phải hơn hạng 6 một xu.
- **Đám đông:** Phật tử đứng khắp nền điện, mỗi người một chỗ cố định. Thanh "Đám đông nền" ở admin (hoặc `AMBIENT_CROWD`) quyết định số người vô danh đứng sẵn cho điện luôn đông.
- **Tặng quà:** người tặng chạy lên lạy ở giữa 6 đệm, máy quay lấy khung bàn thờ và tượng Phật, đám đông mờ đi. Mỗi lần chỉ một người; quà đến dồn thì xếp hàng: người đang chờ tặng thêm thì cộng dồn, quà lớn đi trước, tối đa 5 người chờ (người thừa chỉ cúi lạy tại chỗ), chờ quá 25 giây cũng chỉ cúi lạy tại chỗ.

### Nhân vật
Có hai bộ trong `public/assets/disciples/`, đặt tên `<tư thế>-<bộ>.png`:
- `devotee` (mặc định): người thật nhìn từ sau lưng, lấy từ dự án `tiktok-live-temple-rpc`. Có thêm khung bước chân thứ hai, khung quỳ xuống và ba bước cúi lạy.
- `brown`: nhân vật chibi.

Đổi bộ bằng đuôi địa chỉ: `/overlay?outfits=brown`. Thêm bộ mới: bỏ ảnh `kneelup-<tên>.png` và `kneel-<tên>.png` (bắt buộc) cùng các tư thế khác nếu có, rồi dùng `?outfits=<tên>`. Script `scripts/cut-sprites.py` tách nền xanh lá của ảnh sinh bằng AI thành PNG trong suốt.

### Lời chúc và câu nói
Sửa `BLESSINGS` và `ACTIONS` trong `speech.js`.

## 10. Kiểm thử

Các script chạy với server đang mở. Cho server `SPEECH_REFILL_MS=300` để quà không bị phân suất khi thử:

```bash
SPEECH_REFILL_MS=300 PORT=3190 npm start          # terminal 1
PORT=3190 node scripts/sim-smoke.js               # quà, chat, bảng xếp hạng, giọng, nhạc, vào phòng
node scripts/tiktok-events-test.js                # sự kiện TikTok giả: chia sẻ, vào phòng, quà liên tục (tự chạy, không cần server)
node scripts/overlay-queue-test.js 3190           # hàng đợi quà (cần Chrome)
node scripts/overlay-vip-test.js 3190             # top 6 trên đệm (cần Chrome)
node scripts/overlay-board-test.js 3190           # bảng hạng 7 đến 10 (cần Chrome)
```

## 11. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp và cách xử lý |
|---|---|
| Không nghe tiếng | Quên `?sound=1` ở nơi không phải OBS; trang chưa được bấm vào; ô "Đọc lời chúc bằng giọng nói" ở admin chưa tick. Thêm `&debug=1` để xem. |
| Bị đọc đôi | Hai trang overlay cùng phát (ví dụ Chrome và OBS). Chỉ để một nơi có tiếng. |
| Tải lại trang vẫn thấy bản cũ | Server đã đặt `no-cache`; nếu vẫn cũ, tải lại cứng (Cmd+Shift+R) và restart server. |
| Cổng bị chiếm (`EADDRINUSE`) | Đặt `PORT` khác trong `.env`. Không tắt tiến trình lạ khi chưa biết nó là gì. |
| `Kết nối Live` báo lỗi | Phòng chưa lên sóng, gõ sai tên tài khoản, hoặc máy chủ ký của thư viện bị giới hạn. Xem dòng lỗi trên nhãn trạng thái. |
| Quà hiện `0 coin each` ở log | Dữ liệu quà không đúng dạng thư viện mong đợi; gửi nguyên dòng log để kiểm tra. |
| ZeroTTS báo `External data path escapes model directory` | Model đang là cache Hugging Face toàn symlink. Dùng thư mục file thật (mục 4, cách B). |
| Cài ZeroTTS báo `No solution found ... onnxruntime has no wheels` | Dùng Python 3.12 (`uv venv --python 3.12 tts-env`), không dùng 3.13. Gốc lỗi: bản `onnxruntime` mới nhất chỉ có cho macOS 14 trở lên, còn bản cũ hơn không có cho Python 3.13. Chạy `uname -m`: nếu ra `x86_64` trên máy chip Apple thì terminal đang chạy dưới Rosetta (Get Info, bỏ tick "Open using Rosetta"), việc này cũng làm ZeroTTS chậm. |
| ZeroTTS lỗi hoặc chậm | Câu đó tự đọc bằng giọng macOS. Kiểm tra `ZEROTTS_VOICE` có đúng tên không (log in danh sách giọng có sẵn). |
| Nhân vật nhỏ, lệch so với nền | Đổi nền thì các hằng số vị trí cần đo lại (mục 9). |
| Phòng đông, ít quà được đọc | Đúng thiết kế; giảm `SPEECH_REFILL_MS` nếu muốn đọc nhiều hơn. |
