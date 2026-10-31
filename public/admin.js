(() => {
  const $ = (id) => document.getElementById(id);
  const socket = io();
  const overlayUrl = `${location.origin}/overlay`;

  $('overlayUrl').textContent = overlayUrl;
  $('frame').src = '/overlay';
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

  $('btnShare').onclick = () => socket.emit('sim:share', { user: user() });
  $('btnBubble').onclick = () => socket.emit('sim:chat', { user: user(), text: text() });
  $('btnNammo').onclick = () => socket.emit('crowd:nammo', 8);
  $('btnCrowd').onclick = () => socket.emit('crowd:spawn', 48);
  $('btnReset').onclick = () => { if (confirm('Reset BXH và xoá hết Phật tử trên màn hình?')) socket.emit('session:reset'); };
})();
