# Cài đặt trên Windows

Hướng dẫn cài và chạy TikTok Live Temple (tt-pagoda) trên **Windows 10 hoặc 11**. Phần giới thiệu, cấu hình overlay, nhạc, nhân vật và xử lý sự cố chung nằm trong [README.md](README.md); file này chỉ nói những gì khác trên Windows.

> **Trạng thái kiểm chứng:** dự án được phát triển và thử trên macOS. Hướng dẫn này viết cho Windows nhưng **chưa được chạy thử trên máy Windows thật**. Code đã được sửa để không còn phụ thuộc macOS (đường dẫn Python, giọng mặc định), nhưng nếu gặp lỗi ở bước nào, hãy gửi nguyên dòng lỗi để xử lý.

Dùng **PowerShell** cho mọi lệnh bên dưới (nhấn Start, gõ `PowerShell`).

## 1. Cài công cụ

Cài bằng `winget` (có sẵn trên Windows 10 bản mới và Windows 11). Sau khi cài xong, **đóng và mở lại PowerShell** để nhận lệnh mới.

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
winget install astral-sh.uv
```

| Công cụ | Dùng để |
|---|---|
| Git | tải mã nguồn |
| Node.js 22 trở lên | chạy server (cần bản 22 để dùng `process.loadEnvFile`) |
| ffmpeg | đổi âm thanh ZeroTTS sang MP3 cho trình duyệt (chỉ cần khi dùng ZeroTTS) |
| uv | tạo môi trường Python cho ZeroTTS (chỉ cần khi dùng ZeroTTS) |

Kiểm tra:

```powershell
node -v      # v22 trở lên
ffmpeg -version
uv --version
```

## 2. Tải mã nguồn và cài thư viện

Nên đặt dự án ở thư mục có đường dẫn ngắn (ví dụ `C:\tt-pagoda`) để tránh lỗi đường dẫn quá dài của Windows.

```powershell
cd C:\
git clone https://github.com/rexviet/tt-pagoda.git
cd tt-pagoda
npm install
copy .env.example .env
```

Khi chạy lần đầu, Windows có thể hỏi cho phép Node.js qua tường lửa: chọn **Private networks** (mạng riêng).

## 3. Chọn giọng đọc

Trên Windows **không có giọng macOS (`say`)**, nên dự án tự dùng giọng Microsoft Edge khi bạn không đặt `TTS_PROVIDER`. Có hai lựa chọn.

### Cách A: giọng Microsoft Edge (đơn giản, không cài gì thêm)
Không cần làm gì, hoặc đặt trong `.env`:

```
TTS_PROVIDER=edge
```

Cần có mạng. Giọng mặc định `vi-VN-HoaiMyNeural`, đổi bằng `TTS_VOICE=vi-VN-NamMinhNeural` (giọng nam). Lưu ý: trong lúc thử trên macOS, dịch vụ này từng cho độ trễ 5 đến 7 giây và thỉnh thoảng ngắt giữa câu; nếu bị vậy, dùng cách B.

### Cách B: ZeroTTS (giọng tiếng Việt chạy trên máy, khuyên dùng)
Chạy offline, mỗi câu khoảng 2 giây, hỗ trợ giọng riêng của bạn.

1. Tạo môi trường Python **3.12** (dùng 3.12, không dùng 3.13) và cài ZeroTTS:
   ```powershell
   uv venv --python 3.12 tts-env
   uv pip install --python tts-env\Scripts\python.exe zerotts
   ```
2. Tải model (khoảng 1 GB) vào `models\zerotts`. Model phải là thư mục chứa **file thật**; tải thẳng bằng lệnh sau là đúng:
   ```powershell
   tts-env\Scripts\python.exe -c "from huggingface_hub import snapshot_download as d; d('zeroweight-ai/ZeroTTS', local_dir='models/zerotts')"
   ```
   > Lệnh tải này chưa được chạy thử từ máy sạch. Trên Windows, nếu báo lỗi liên quan tới liên kết tượng trưng (symlink), hãy bật **Developer Mode** (Settings, Privacy & security, For developers) rồi chạy lại, hoặc chép một bản model đã có file thật vào `models\zerotts`.
3. Mở `.env` bằng Notepad và sửa:
   ```
   TTS_PROVIDER=zerotts
   ZEROTTS_VOICE=maichi
   ```
   Có 8 giọng sẵn: `maichi`, `baotrang`, `giahuy`, `hamy`, `huuduc`, `kimoanh`, `quangminh`, `tiendat`.

Server tự tìm Python ở `tts-env\Scripts\python.exe`. Nếu bạn đặt môi trường ở chỗ khác, thêm vào `.env`: `ZEROTTS_PYTHON=C:\duong\dan\python.exe`.

#### Dùng giọng riêng (file zip) với ZeroTTS
1. Vào https://platform.zeroweight.ai/audio, tải lên đoạn thu mẫu (3 đến 30 giây, tiếng Việt), tải về file zip của giọng. Đoạn thu được tải lên dịch vụ bên thứ ba, nên chỉ dùng giọng của chính bạn hoặc giọng bạn được phép dùng.
2. Cài giọng, làm một lần (dùng dấu `/` trong đường dẫn cho khỏi lỗi dấu `\`):
   ```powershell
   tts-env\Scripts\python.exe -c "from zerotts import install_voice_zip; print(install_voice_zip('C:/Users/ten-ban/Downloads/ten-giong.zip'))"
   ```
   Kết quả in ra có **mã giọng** (chuỗi trước dấu hai chấm). Giọng được lưu trong `%USERPROFILE%\.zerotts\voices`, các lần sau không cần cài lại.
3. Xem lại các giọng đã cài: `tts-env\Scripts\python.exe -c "from zerotts import installed_voices; print(list(installed_voices()))"`
4. Trong `.env` đặt `ZEROTTS_VOICE` bằng mã giọng hoặc tên hiển thị (không phân biệt hoa thường), rồi chạy lại server.

## 4. Chạy

```powershell
npm start
```

Mặc định server nghe ở cổng 3000 (hoặc cổng bạn đặt bằng `PORT` trong `.env`). Mở:

- Admin: `http://localhost:3000/admin`
- Overlay: `http://localhost:3000/overlay?sound=1`

Dòng log đầu cho biết giọng đã sẵn sàng chưa, ví dụ `[tts] voice: zerotts "maichi" ready in 3.2s`. Nếu ZeroTTS lỗi, câu sẽ được đọc bằng giọng Edge (cần mạng) thay vì im lặng.

Muốn đặt cổng hoặc biến tạm thời mà không sửa `.env`:

```powershell
$env:PORT = 3150; npm start          # PowerShell
```
```bat
set PORT=3150 && npm start           :: cmd
```

Cách thử bằng nút giả lập, mốc quà, kết nối phòng live thật và nhạc nền: xem mục 5, 7, 8 trong [README.md](README.md).

## 5. Đưa overlay vào OBS hoặc LIVE Studio

Giống macOS, khung hình là **dọc 1080×1920**.

- **OBS Studio:** Settings, Video: Base và Output đều 1080×1920. Thêm nguồn **Browser**, URL `http://localhost:3000/overlay`, Width 1080, Height 1920, tick **Control audio via OBS**.
- **TikTok LIVE Studio** (có bản chính thức cho Windows): thêm nguồn **Link** với địa chỉ overlay **có đuôi `?sound=1`**, kích thước 1080×1920. Windows không dính giới hạn camera ảo của macOS, nhưng TikTok vẫn có thể hạn chế phát từ máy tính tùy tài khoản.

Quy tắc âm thanh, cảnh báo ngrok mở cả trang admin ra Internet, và cách kết nối phòng live: xem mục 6 và 7 trong [README.md](README.md).

## 6. Kiểm thử trên Windows

Hai script kiểm thử chạy được vì không cần trình duyệt:

```powershell
$env:PORT = 3190; $env:SPEECH_REFILL_MS = 300; npm start     # cửa sổ PowerShell thứ nhất
$env:PORT = 3190; $env:SPEECH_REFILL_MS = 300; node scripts/sim-smoke.js   # cửa sổ thứ hai
node scripts/tiktok-events-test.js
```

Các script `overlay-*-test.js` đang trỏ tới đường dẫn Chrome của macOS nên **chỉ chạy trên Mac**.

## 7. Sự cố thường gặp trên Windows

| Hiện tượng | Cách xử lý |
|---|---|
| `npm`, `node` hoặc `uv` không được nhận | Đóng và mở lại PowerShell sau khi cài. |
| PowerShell chặn script (`running scripts is disabled`) | Chạy `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` một lần. |
| Cổng 3000 đã bị dùng | Xem ai dùng: `netstat -ano \| findstr :3000`. Đổi `PORT` trong `.env` thay vì tắt chương trình lạ. |
| Không thấy tiếng | Quên `?sound=1` ở nơi không phải OBS; xem thêm mục sự cố trong [README.md](README.md). |
| ZeroTTS: `cannot start ...python.exe` | Chưa tạo `tts-env`, hoặc nó nằm chỗ khác: đặt `ZEROTTS_PYTHON`. |
| Giọng Edge im lặng | Thiếu mạng, hoặc ffmpeg chưa cài (chỉ cần cho ZeroTTS; Edge không cần). |
| Tải model báo lỗi symlink | Bật Developer Mode rồi tải lại (xem mục 3, cách B). |
