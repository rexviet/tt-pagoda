(() => {
  const $ = (id) => document.getElementById(id);
  const socket = io();
  const overlayUrl = `${location.origin}/overlay`;

  $('overlayUrl').textContent = overlayUrl;
  $('frame').src = '/overlay?mute=1';
  $('openOverlay').onclick = () => window.open(overlayUrl, '_blank');

  try { $('uniqueId').value = localStorage.getItem('tiktokUniqueId') || ''; } catch (_) { /* storage blocked */ }

  const connect = () => {
    const id = $('uniqueId').value.trim();
    try { localStorage.setItem('tiktokUniqueId', id); } catch (_) { /* storage blocked */ }
    socket.emit('live:connect', id);
  };
  $('btnConnect').onclick = connect;
  $('uniqueId').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  $('btnDisconnect').onclick = () => socket.emit('live:disconnect');

  socket.on('status', (s) => {
    const el = $('status');
    el.textContent = s.message;
    el.className = `pill ${s.state}`;
  });

  const user = () => $('simUser').value.trim() || 'Khách';
  const text = () => $('simText').value.trim();

  fetch('/api/tiers').then((r) => r.json()).then((tiers) => {
    const colors = ['orange', 'orange', 'green', 'purple', 'red'];
    const icons = ['🌹', '🟫', '🔔', '🏮', '✨'];
    tiers.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = colors[i % colors.length];
      b.textContent = `${icons[i % icons.length]} ${t.label}`;
      b.onclick = () => socket.emit('sim:gift', { user: user(), tierId: t.id, text: text() });
      $('tierButtons').appendChild(b);
    });
  });

  $('voiceOn').onchange = (e) => socket.emit('voice:set', e.target.checked);
  socket.on('voice', (on) => { $('voiceOn').checked = on; });

  // Background music: the overlay plays it; here only on/off and the level are set.
  let volumeTimer = null;
  const sendMusic = () => socket.emit('music:set', { enabled: $('musicOn').checked, volume: $('musicVol').value / 100 });
  $('musicOn').onchange = sendMusic;
  $('musicVol').oninput = () => {
    $('musicVolLabel').textContent = `${$('musicVol').value}%`;
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(sendMusic, 120); // while dragging, send only when the slider settles
  };
  socket.on('music', (m) => {
    $('musicOn').checked = m.enabled;
    $('musicVol').value = Math.round(m.volume * 100);
    $('musicVolLabel').textContent = `${Math.round(m.volume * 100)}%`;
  });
  fetch('/api/music').then((r) => r.json()).then((list) => {
    $('musicHint').textContent = list.length
      ? `Đang có ${list.length} bài trong public/assets/music, phát lặp lại và tự nhỏ lại khi có giọng đọc.`
      : 'Chưa có file nhạc. Thả file mp3 vào public/assets/music rồi tải lại trang overlay; không có file thì không phát nhạc.';
  }).catch(() => { $('musicHint').textContent = ''; });

  $('btnJoin').onclick = () => socket.emit('sim:join', { user: user() });
  $('btnShare').onclick = () => socket.emit('sim:share', { user: user() });
  $('btnBubble').onclick = () => socket.emit('sim:chat', { user: user(), text: text() });
  $('btnNammo').onclick = () => socket.emit('crowd:nammo', 8);
  $('btnCrowd').onclick = () => socket.emit('crowd:spawn', 48);
  $('btnReset').onclick = () => { if (confirm('Reset BXH và xoá hết Phật tử trên màn hình?')) socket.emit('session:reset'); };
})();
