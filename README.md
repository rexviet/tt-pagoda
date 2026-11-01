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
| `COLOR_OUTFITS` | `0` = ai cũng mặc áo xám, không có áo hồng (top 6), áo nâu và áo trắng (đám đông) | 1 |
| `MUSIC_VOLUME` | âm lượng nhạc nền (0 đến 1) | 0.25 |
| `NAME_FONT_SIZE` | cỡ chữ của tên trên đầu nhân vật, đơn vị px (10 đến 48) | 16 |
| `NAME_SHOW_SECONDS` | tên trên đầu nhân vật hiện bao nhiêu giây khi có người vào, chat hoặc vừa lạy xong; `0` = giữ thời gian có sẵn (2 đến 5 giây tuỳ lúc). Tên của người đang lạy và của top 6 trên đệm luôn hiện | 0 |
| `NAME_PLATE_OPACITY` | độ đậm của hộp đen phía sau tên nhân vật, từ `0` (không có hộp) đến `1` (đen đặc) | 0.78 |
| `CHAT_WALK_SPEED` | tốc độ di chuyển khi chat, tính bằng pixel/giây trên khung 1080×1920; số dương, ví dụ `200` để đi chậm hơn, `600` để đi nhanh hơn. Thời gian vẫn là 5 giây | 420 |
| `SPEECH_REFILL_MS` | cứ bao lâu được thêm một câu đọc khi phòng đông | 4000 |
| `STREAK_IDLE_MS` | quà bấm liên tục được chốt sau khi im lặng bao lâu | 3000 |

Lưu ý: file mẫu đặt `TTS_PROVIDER=zerotts`, cần làm mục 4 cách B trước; nếu chưa cài ZeroTTS, đổi thành `say`. Nếu cổng 3000 đang bị chương trình khác dùng (ví dụ Docker), đặt `PORT` sang số khác.

## 4. Chọn giọng đọc

Tên có từ thô tục không được đọc nguyên văn: tên chứa chữ "lồn" được đọc là "Chị L", chứa chữ "cặc" được đọc là "Anh C" (chỉ áp dụng cho giọng đọc, tên trên màn hình giữ nguyên). Danh sách nằm ở `RUDE_NAMES` trong `speech.js`.

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

Nút **Giả Lập Top 6 — Mỗi Người 100 Điểm** làm mới phiên và tạo sáu người `Top 1` đến `Top 6`, mỗi người đúng 100 điểm, ngồi trên sáu đệm. Ô tên tự chuyển sang `Top 1`; bấm quà để thử hành lễ của người này hoặc đổi tên sang `Top 2` đến `Top 6`. Bấm lại nút Top 6 sẽ đưa cả sáu về 100 điểm.

Mốc quà tính theo tổng xu của một lượt tặng, sửa ở `gift-tiers.js`:

| Xu | Hiệu ứng |
|---|---|
| 1 | dâng hương |
| 5 | xin xăm: rút một quẻ; vị trí hành lễ theo đơn giá, tổng xu và top 6 |
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

Khi nhân vật đã đi đến vị trí hành lễ ở bàn thờ và bắt đầu quỳ, overlay mới phát một tiếng chuông chùa từ `public/assets/temple-bell.mp3` (file gốc `mot_tieng_chuong_chua-www_tiengdong_com.mp3`). Chuông ngân hết tự nhiên; lượt quỳ mới ở bàn thờ phát lại từ đầu, không chồng nhiều bản. Làm mới phiên dừng tiếng chuông. Lượt hành lễ không zoom không phát chuông.

### Tham số trên địa chỉ overlay

Thêm vào sau `/overlay`, nối nhiều tham số bằng `&`. Ví dụ: `http://localhost:3000/overlay?sound=1&lite=1`.

| Tham số | Tác dụng |
|---|---|
| `sound=1` | bật tiếng ở nơi không phải OBS (tab Chrome, LIVE Studio, điện thoại). Chỉ cần có tham số này là đủ |
| `mute=1` | tắt hẳn tiếng, kể cả trong OBS. Trang xem trước ở admin dùng tham số này |
| `lite=1` | chế độ nhẹ cho lúc live: tắt khử răng cưa, 30 khung hình/giây, ảnh nền nhỏ hơn, tối đa khoảng 60 phật tử (đám đông nền tối đa 30; top 6 luôn giữ) |
| `names=1` | hiện tên của mọi nhân vật liên tục (đám đông giả lập có tên bịa), để xem cảnh đông người. Phòng đông thì các nền tên đè lên nhau, chỉ dùng để thử |
| `outfits=devotee,devotee-white,brown,pink` | chọn bộ áo được nạp, cách nhau bằng dấu phẩy. Có `pink` thì top 6 mặc hồng; thiếu `pink` thì top 6 giữ áo của đám đông. Tham số này được ưu tiên hơn `COLOR_OUTFITS` trong `.env` |
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

**Gieo quẻ:** quà thuộc mốc xin xăm (từ 5 đến dưới 10 xu mỗi lượt) rút thêm một quẻ; vị trí hành lễ theo quy tắc đơn giá quà, tổng xu tích lũy và top 6. Chat chữ `xin xăm` không rút quẻ. Hũ xăm treo trên cột bên phải, phía dưới bảng xếp hạng, có kích thước gấp 1,5 lần ban đầu và lắc trong 1,8 giây kèm tiếng lắc từ file `dragon-studio-dry-grass-rustling-478361.mp3` (lưu tại `public/assets/fortune-rattle.mp3`, lặp trong thời gian hũ lắc) trước khi overlay hiện tờ giải quẻ (hạng quẻ, bài thơ, lời bàn) trong 5 giây; nếu trình duyệt bật giảm chuyển động thì hũ đứng yên trong thời gian chờ. Ảnh dùng trong cảnh là `public/assets/xam-transparent.png`, được tách nền từ `public/assets/xam.png`. Các lượt xin xăm và hành lễ được đồng bộ: chờ lượt hành lễ trước kết thúc và camera về toàn cảnh → lắc hũ → hiện quẻ đủ 5 giây → đóng quẻ → nhân vật mới chạy lên hành lễ và camera mới zoom. Quà nhận trong lúc lắc hoặc xem quẻ chờ trong hàng đợi. Tiếng lắc dừng trước khi mở quẻ và khi làm mới phiên; tuân theo `sound=1` / `mute=1` như âm thanh overlay, trên trình duyệt cần bấm bật tiếng nếu bị chặn tự phát. Sau khi hũ lắc xong, giọng đọc nói tên người gieo cùng hạng và vế đầu tên quẻ; tối đa 5 tờ chờ lượt. Đổi mốc xu ở `gift-tiers.js`. Bộ quẻ nằm trong `fortunes.js`, thêm quẻ mới ở đó. Trên trang admin có nút giả lập quà 5 xu và nút **Giả Lập Xin Xăm / Gieo Quẻ** để thử.

**Chào người vào:** nếu đã ít nhất 2 giây từ sự kiện tặng xu gần nhất, người vào được chào ngẫu nhiên bằng một trong hai câu: "Thí chủ <tên> đến rồi, hoan hỷ quá!" hoặc "Mừng thí chủ <tên> về chùa!". Giọng chào dùng chung thiết lập bật/tắt giọng và hàng đợi âm thanh. Thời điểm quà được ghi ngay khi nhận, kể cả chuỗi quà đang chờ chốt. Làm mới phiên xóa mốc thời gian này.

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
- **Đám đông:** Phật tử có chỗ cố định ở hai bên; lối giữa từ x=420 đến x=690 trên khung 1080px được để trống. Thanh "Đám đông nền" ở admin (hoặc `AMBIENT_CROWD`) quyết định số người vô danh đứng sẵn.
- **Tặng quà:** người thuộc top 6 luôn ra giữa các đệm, lên vị trí hành lễ và camera zoom, bất kể tổng xu; hành lễ xong quay về đệm của mình. Người ngoài top 6 tặng quà có đơn giá lớn hơn 1 xu luôn lên bàn thờ và zoom. Riêng quà có đơn giá 1 xu mới xét tổng xu tích lũy sau lượt quà: chia hết cho 5 (5, 10, 15, ...) thì lên bàn thờ và zoom, còn lại hành lễ trong lối giữa rồi về chỗ. Quy tắc xét theo đơn giá, nên combo nhiều quà 1 xu vẫn phải kiểm tra tổng tích lũy. Top 6 được xác định sau khi cộng điểm và kiểm tra lại khi đến lượt hành lễ. Quà vẫn xếp hàng, gộp cùng người và ưu tiên mốc quà cao; một lượt đang chờ đã đạt mốc lên bàn thờ thì giữ hiệu ứng đó khi nhận thêm quà. Khi hàng đợi vượt 5 người hoặc chờ quá 25 giây, lượt thường chuyển sang hành lễ trong lối giữa; lượt đã đạt mốc lên bàn thờ được giữ lại đến khi tới lượt. Điểm tích lũy đặt lại khi làm mới phiên hoặc restart server.
- **Chat:** nhân vật đi ngẫu nhiên trong 5 giây tính từ tin chat mới nhất, rồi về chỗ hai bên hoặc đệm VIP của mình. Tốc độ chỉnh bằng `CHAT_WALK_SPEED` trong `.env` (mặc định `420` pixel/giây); đặt `200` để chậm hơn hoặc `600` để nhanh hơn, rồi restart server và tải lại overlay. Giá trị không hợp lệ hoặc không dương dùng mặc định. Hành lễ được ưu tiên; chat gửi trong lúc hành lễ được thực hiện sau khi nhân vật trở về.

### Nhân vật

Nhân vật dùng luân phiên hai khung `walkup` và `walkup2` cho cả lượt đi ra hành lễ và lượt trở về. Việc đổi chỗ giữa đám đông và đệm VIP cũng dùng bước đi liên tục. Các bộ ảnh hiện có đều nhìn từ phía sau; cùng hai khung này được dùng cho mọi hướng di chuyển. Nhân vật hành lễ vẫn hiện khi camera thu lại và đi về chỗ.
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
node scripts/movement-events-test.js              # tổng xu, mốc lên bàn thờ, chào sau 2 giây (tự chạy, stub TTS)
node scripts/overlay-movement-test.js              # lối giữa, chat 5 giây, hành lễ và zoom (tự chạy, cần Chrome)
SOUND=1 node scripts/overlay-fortune-test.js       # thêm kiểm tra phát tiếng lắc (tự chạy, cần Chrome)
node scripts/overlay-fortune-test.js               # hũ xăm lắc trước khi hiện quẻ, hàng đợi và làm mới phiên (tự chạy, cần Chrome)
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
