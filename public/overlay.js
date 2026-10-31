/* Temple overlay — 1080x1920 PixiJS scene driven by Socket.IO events.
 * Visuals are placeholder vector art. Drop real images into public/assets/ (see README). */
(() => {
  const W = 1080, H = 1920;
  const CENTER_X = W / 2;
  const MAX_FIGURES = 90;
  const IDLE_LIFETIME_MS = 45000;

  const STATIONS = {
    huong: { x: 340, y: 1560, label: '1 xu', sub: 'dâng hương' },
    buc: { x: 540, y: 1560, label: '5 xu', sub: 'lên bục' },
    tambao: { x: 740, y: 1560, label: '10+ xu', sub: 'tặng công đức' },
  };

  const app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true });
  const stageEl = document.getElementById('stage');
  stageEl.appendChild(app.view);

  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stageEl.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- layers --------------------------------------------------------------
  const layers = {};
  ['bg', 'floor', 'fx', 'figures', 'top', 'hud'].forEach((n) => {
    layers[n] = new PIXI.Container();
    app.stage.addChild(layers[n]);
  });
  layers.figures.sortableChildren = true;

  // ---- tiny tween helper ---------------------------------------------------
  const tweens = [];
  const ease = {
    linear: (t) => t,
    out: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  };
  function tween(target, props, ms, easing = ease.inOut) {
    return new Promise((resolve) => {
      const from = {};
      for (const k in props) from[k] = target[k];
      tweens.push({ target, props, from, ms, easing, t: 0, resolve });
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  app.ticker.add(() => {
    const dt = app.ticker.deltaMS;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.target.destroyed) { tweens.splice(i, 1); tw.resolve(); continue; }
      tw.t = Math.min(1, tw.t + dt / tw.ms);
      const e = tw.easing(tw.t);
      for (const k in tw.props) tw.target[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
      if (tw.t >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    stepParticles(dt);
    stepIdle(dt);
  });

  // ---- scene (placeholder art) --------------------------------------------
  // Background art is a 1212x1298 image: scaled to cover 1080x1920 and centre-cropped.
  // Carpet in the scaled image: vanishing point y~1161, centre x=540, half-width ~77 -> ~784 at the bottom.
  const CARPET_TOP_Y = 1161, CARPET_TOP_HALF = 77, CARPET_BOTTOM_HALF = 784;
  const carpetHalfAt = (y) => CARPET_TOP_HALF + ((y - CARPET_TOP_Y) / (H - CARPET_TOP_Y)) * (CARPET_BOTTOM_HALF - CARPET_TOP_HALF);

  function drawScene() {
    loadBackground().then((ok) => { if (!ok) drawVectorScene(); addGlow(); });
    drawStations();
  }

  async function loadBackground() {
    try {
      const tex = await PIXI.Assets.load('/assets/background.png');
      const sp = new PIXI.Sprite(tex);
      const s = Math.max(W / tex.width, H / tex.height);
      sp.scale.set(s);
      sp.position.set((W - tex.width * s) / 2, (H - tex.height * s) / 2);
      layers.bg.addChild(sp);
      return true;
    } catch (_) { return false; }
  }

  function addGlow() {
    const glow = new PIXI.Graphics();
    for (let r = 300; r > 0; r -= 30) glow.beginFill(0xffc83a, 0.05).drawCircle(0, 0, r).endFill();
    glow.position.set(CENTER_X, 600);
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    layers.bg.addChild(glow);
    app.ticker.add(() => { glow.alpha = 0.7 + Math.sin(performance.now() / 700) * 0.3; });
    window.__buddhaGlow = glow;
  }

  function drawVectorScene() {
    const g = new PIXI.Graphics();
    // hall walls
    g.beginFill(0x2a1608).drawRect(0, 0, W, H).endFill();
    g.beginFill(0x3a1f0b).drawRect(0, 0, W, 760).endFill();
    // columns
    for (const x of [60, 220, 860, 1020]) {
      g.beginFill(0x5a2a10).drawRect(x - 28, 80, 56, 700).endFill();
      g.beginFill(0x8a5a1c).drawRect(x - 36, 70, 72, 24).endFill();
    }
    // floor
    g.beginFill(0x4a2e18).drawRect(0, 760, W, H - 760).endFill();
    // carpet (trapezoid)
    g.beginFill(0x9c1414)
      .drawPolygon([CENTER_X - 110, 780, CENTER_X + 110, 780, CENTER_X + 250, H, CENTER_X - 250, H])
      .endFill();
    g.lineStyle(6, 0xd9a93a, 1)
      .moveTo(CENTER_X - 110, 780).lineTo(CENTER_X - 250, H)
      .moveTo(CENTER_X + 110, 780).lineTo(CENTER_X + 250, H);
    layers.bg.addChild(g);

    const buddha = new PIXI.Graphics();
    buddha.beginFill(0xe8b832).drawEllipse(0, 60, 90, 120).endFill();
    buddha.beginFill(0xf6d56a).drawCircle(0, -90, 55).endFill();
    buddha.beginFill(0xb8872a).drawRect(-130, 150, 260, 30).endFill();
    buddha.position.set(CENTER_X, 560);
    layers.bg.addChild(buddha);
  }

  function drawStations() {
    for (const s of Object.values(STATIONS)) {
      const mat = new PIXI.Graphics().beginFill(s === STATIONS.tambao ? 0xb32020 : 0x777777, 0.9).drawRoundedRect(-62, -16, 124, 30, 8).endFill();
      mat.position.set(s.x, s.y);
      const box = new PIXI.Graphics();
      box.lineStyle(3, 0xd9a93a).beginFill(0x4a1a0a, 0.85).drawRoundedRect(-85, 40, 170, 70, 8).endFill();
      box.position.set(s.x, s.y);
      const a = new PIXI.Text(s.label, { fontFamily: 'Arial', fontSize: 24, fontWeight: '700', fill: 0xffe9a8 });
      const b = new PIXI.Text(s.sub, { fontFamily: 'Arial', fontSize: 18, fill: 0xf4cf7a });
      a.anchor.set(0.5); b.anchor.set(0.5);
      a.position.set(s.x, s.y + 65); b.position.set(s.x, s.y + 91);
      layers.floor.addChild(mat, box, a, b);
    }
  }

  // ---- particles -----------------------------------------------------------
  const particles = [];
  function emit(x, y, { n = 10, color = 0xffd35a, speed = 3, life = 900, size = 4, gravity = 0, up = false, spread = Math.PI * 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 0.6 : Math.random() * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      const gfx = new PIXI.Graphics().beginFill(color).drawCircle(0, 0, size * (0.6 + Math.random() * 0.8)).endFill();
      gfx.position.set(x, y);
      layers.fx.addChild(gfx);
      particles.push({ gfx, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity, life, age: 0 });
    }
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.vy += p.gravity;
      p.gfx.x += p.vx; p.gfx.y += p.vy;
      p.gfx.alpha = Math.max(0, 1 - p.age / p.life);
      if (p.age >= p.life) { p.gfx.destroy(); particles.splice(i, 1); }
    }
  }
  const smoke = (x, y) => emit(x, y, { n: 6, color: 0xdddddd, speed: 1.2, life: 2200, size: 6, up: true });
  const sparks = (x, y, n = 30) => emit(x, y, { n, color: 0xffd35a, speed: 7, life: 1100, size: 4, gravity: 0.12 });

  // ---- figures (disciples) -------------------------------------------------
  const figures = [];
  // Sprites live in public/assets/disciples/ as <pose>-<outfit>.png (poses: kneel, stand, walk, bow).
  // A disciple only ever uses sprites of its own outfit. An outfit needs kneel-<outfit>.png; any missing
  // pose falls back to the kneel sprite with a code-driven motion (bow = tilt and squash, walk = hop).
  const OUTFITS = ['brown'];
  // front poses face the camera; *up poses are seen from behind, facing the Buddha
  const POSES = ['kneel', 'stand', 'walk', 'bow', 'kneelup', 'walkup', 'bowup'];
  const POSE_HEIGHT = { kneel: 120, stand: 140, walk: 140, bow: 105 };
  const baseOf = (pose) => pose.replace(/up$/, '');
  const TEX = {}; // TEX[outfit][pose]
  const FIGURE_NEAR = 1.0, FIGURE_FAR = 0.62; // size at the bottom / top of the carpet

  async function loadSprites() {
    for (const outfit of OUTFITS) {
      const set = {};
      for (const pose of POSES) {
        const url = `/assets/disciples/${pose}-${outfit}.png`;
        try {
          const head = await fetch(url, { method: 'HEAD' });
          if (head.ok) set[pose] = await PIXI.Assets.load(url);
        } catch (_) { /* pose not provided */ }
      }
      if (set.kneel) TEX[outfit] = set;
    }
    if (!Object.keys(TEX).length) throw new Error('no disciple sprites found in /assets/disciples');
  }

  function setPose(fig, pose) {
    const set = TEX[fig.outfit];
    const base = baseOf(pose);
    // Missing pose: reuse the kneel sprite that faces the same way (back view for *up poses).
    const real = !!(set[pose] || set[base]);
    const tex = set[pose] || set[base] || (pose.endsWith('up') && set.kneelup) || set.kneel;
    const h = POSE_HEIGHT[real ? base : 'kneel'];
    const sx = h / tex.height;
    const squash = !real && base === 'bow';
    fig.pose = pose;
    fig.base = base;
    fig.fallback = !real;
    fig.body.texture = tex;
    fig.body.scale.set(squash ? sx * 1.1 : sx, squash ? sx * 0.7 : sx);
    fig.label.y = -h - 4;
    fig.h = h;
  }

  function perspective(y) {
    const t = Math.min(1, Math.max(0, (y - CARPET_TOP_Y) / (H - CARPET_TOP_Y)));
    return FIGURE_FAR + (FIGURE_NEAR - FIGURE_FAR) * t;
  }

  function makeFigure(name, userId, x, y) {
    const c = new PIXI.Container();
    const shadow = new PIXI.Graphics().beginFill(0x000000, 0.35).drawEllipse(0, 2, 40, 10).endFill();
    const outfits = Object.keys(TEX);
    const outfit = outfits[Math.floor(Math.random() * outfits.length)];
    const body = new PIXI.Sprite(TEX[outfit].kneel);
    body.anchor.set(0.5, 1);
    const label = new PIXI.Text(name, { fontFamily: 'Arial', fontSize: 16, fontWeight: '700', fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 });
    label.anchor.set(0.5, 1);
    c.addChild(shadow, body, label);
    c.position.set(x, y);
    c.zIndex = y;
    const fig = {
      c, body, label, name, userId, busy: false, bornAt: performance.now(), phase: Math.random() * 6, baseY: y,
      outfit, jitter: 0.92 + Math.random() * 0.16,
    };
    setPose(fig, 'kneelup');
    c.scale.set(perspective(y) * fig.jitter);
    figures.push(fig);
    layers.figures.addChild(c);
    trimFigures();
    return fig;
  }

  function trimFigures() {
    while (figures.length > MAX_FIGURES) {
      const idx = figures.findIndex((f) => !f.busy);
      if (idx < 0) return;
      removeFigure(figures[idx]);
    }
  }

  function removeFigure(fig) {
    const i = figures.indexOf(fig);
    if (i >= 0) figures.splice(i, 1);
    tween(fig.c, { alpha: 0 }, 500).then(() => fig.c.destroy({ children: true }));
  }

  function stepIdle() {
    const now = performance.now();
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      f.c.scale.set(perspective(f.c.y) * f.jitter);
      f.c.zIndex = f.c.y;
      let tilt = 0, hop = 0;
      if (f.base === 'walk') {
        tilt = Math.sin(now / 130) * 0.07;
        if (f.fallback) hop = -Math.abs(Math.sin(now / 130)) * 12;
      } else if (!f.busy) {
        tilt = Math.sin(now / 900 + f.phase) * 0.025;
      }
      f.body.rotation += (tilt - f.body.rotation) * 0.25;
      f.body.y += (hop - f.body.y) * 0.4;
      if (!f.busy && now - f.bornAt > IDLE_LIFETIME_MS && f.userId && !f.keep) removeFigure(f);
    }
  }

  function carpetSpot() {
    const left = Math.random() < 0.5;
    const y = 1250 + Math.random() * 250;
    const half = carpetHalfAt(y);
    const x = CENTER_X + (left ? -1 : 1) * half * (0.3 + Math.random() * 0.9);
    return { x, y };
  }

  function findOrCreateFigure(name, userId) {
    let fig = figures.find((f) => f.userId === userId);
    if (fig) return fig;
    return makeFigure(name, userId, CENTER_X + (Math.random() - 0.5) * 120, CARPET_TOP_Y + 20);
  }

  async function walkTo(fig, x, y, speed = 260) {
    const dx = x - fig.c.x, dy = y - fig.c.y;
    const ms = Math.max(400, (Math.hypot(dx, dy) / speed) * 1000);
    setPose(fig, dy < 0 ? 'walkup' : 'walk');
    await tween(fig.c, { x, y }, ms, ease.inOut);
    fig.baseY = y;
    setPose(fig, 'kneelup');
  }

  // deep = full prostration; otherwise upright kneeling with palms together
  async function kneel(fig, deep = false) { setPose(fig, (deep ? 'bow' : 'kneel') + 'up'); }
  async function stand(fig) { setPose(fig, 'stand'); await wait(350); }
  async function bow(fig, times = 3) {
    for (let i = 0; i < times; i++) {
      setPose(fig, 'bowup');
      await wait(900);
      setPose(fig, 'kneelup');
      await wait(600);
    }
  }

  // ---- banner (narration box) ---------------------------------------------
  const bannerQueue = [];
  let bannerBusy = false;
  const banner = new PIXI.Container();
  const bannerBg = new PIXI.Graphics();
  const bannerText = new PIXI.Text('', { fontFamily: 'Arial', fontSize: 28, fontWeight: '700', fill: 0xffe9a8, align: 'center', wordWrap: true, wordWrapWidth: 860 });
  bannerText.anchor.set(0.5);
  banner.addChild(bannerBg, bannerText);
  banner.position.set(CENTER_X, 250);
  banner.alpha = 0;
  layers.hud.addChild(banner);

  function showBanner(text, ms = 5000) {
    bannerQueue.push({ text, ms });
    pumpBanner();
  }
  async function pumpBanner() {
    if (bannerBusy) return;
    bannerBusy = true;
    while (bannerQueue.length) {
      const { text, ms } = bannerQueue.shift();
      bannerText.text = text;
      const w = bannerText.width + 60, h = bannerText.height + 36;
      bannerBg.clear().lineStyle(3, 0xd9a93a).beginFill(0x3b0f0a, 0.92).drawRoundedRect(-w / 2, -h / 2, w, h, 10).endFill();
      await tween(banner, { alpha: 1 }, 250);
      await wait(ms);
      await tween(banner, { alpha: 0 }, 250);
    }
    bannerBusy = false;
  }

  // ---- chat bubbles --------------------------------------------------------
  function showBubble(fig, text) {
    if (fig.bubble && !fig.bubble.destroyed) fig.bubble.destroy({ children: true });
    const t = new PIXI.Text(text, { fontFamily: 'Arial', fontSize: 20, fill: 0x111111, wordWrap: true, wordWrapWidth: 230 });
    t.anchor.set(0.5);
    const w = t.width + 24, h = t.height + 16;
    const bubble = new PIXI.Container();
    const bg = new PIXI.Graphics().lineStyle(2, 0x999999).beginFill(0xffffff, 0.96).drawRoundedRect(-w / 2, -h / 2, w, h, 12).endFill();
    bg.beginFill(0xffffff, 0.96).drawPolygon([-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12]).endFill();
    bubble.addChild(bg, t);
    bubble.position.set(fig.c.x, fig.c.y - (fig.h + 26) * fig.c.scale.y - h / 2);
    bubble.zIndex = 99999;
    layers.top.addChild(bubble);
    fig.bubble = bubble;
    const follow = () => {
      if (bubble.destroyed) return app.ticker.remove(follow);
      bubble.x = fig.c.x;
      bubble.y = fig.c.y - (fig.h + 26) * fig.c.scale.y - h / 2;
    };
    app.ticker.add(follow);
    setTimeout(() => { if (!bubble.destroyed) tween(bubble, { alpha: 0 }, 400).then(() => bubble.destroy({ children: true })); }, 5000);
  }

  // ---- leaderboard ---------------------------------------------------------
  const board = new PIXI.Container();
  board.position.set(W - 270, 330);
  layers.hud.addChild(board);
  const boardRows = [];
  function drawBoard(rows) {
    board.removeChildren().forEach((c) => c.destroy({ children: true }));
    const bg = new PIXI.Graphics().lineStyle(3, 0xd9a93a).beginFill(0x3b0f0a, 0.9).drawRoundedRect(0, 0, 250, 40 + Math.max(rows.length, 1) * 44, 10).endFill();
    const title = new PIXI.Text('TÂM LÒNG THÀNH', { fontFamily: 'Arial', fontSize: 20, fontWeight: '700', fill: 0xffe9a8 });
    title.anchor.set(0.5, 0); title.position.set(125, 10);
    board.addChild(bg, title);
    rows.forEach((r, i) => {
      const y = 44 + i * 44;
      const medal = [0xf5c518, 0xc0c0c0, 0xcd7f32][i] || 0x888888;
      const dot = new PIXI.Graphics().beginFill(medal).drawCircle(24, y + 18, 13).endFill();
      const rank = new PIXI.Text(String(i + 1), { fontFamily: 'Arial', fontSize: 16, fontWeight: '700', fill: 0x222222 });
      rank.anchor.set(0.5); rank.position.set(24, y + 18);
      const nm = new PIXI.Text(r.name.slice(0, 12), { fontFamily: 'Arial', fontSize: 17, fill: 0xffffff });
      nm.position.set(48, y + 8);
      const sc = new PIXI.Text(String(r.score), { fontFamily: 'Arial', fontSize: 16, fontWeight: '700', fill: 0xffe9a8 });
      sc.anchor.set(1, 0); sc.position.set(238, y + 9);
      board.addChild(dot, rank, nm, sc);
    });
  }

  // ---- lanterns ------------------------------------------------------------
  function releaseLanterns(n = 14) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const l = new PIXI.Container();
        for (let r = 34; r > 0; r -= 10) l.addChild(new PIXI.Graphics().beginFill(0xff9a2a, 0.12).drawCircle(0, 0, r).endFill());
        l.addChild(new PIXI.Graphics().lineStyle(2, 0xffe08a).beginFill(0xff7a18).drawRoundedRect(-14, -20, 28, 40, 8).endFill());
        l.position.set(260 + Math.random() * 560, H + 40);
        layers.fx.addChild(l);
        const driftX = (Math.random() - 0.5) * 160;
        tween(l, { y: 700 + Math.random() * 300, x: l.x + driftX }, 9000 + Math.random() * 3000, ease.out)
          .then(() => tween(l, { alpha: 0 }, 1500))
          .then(() => l.destroy({ children: true }));
      }, i * 220);
    }
  }

  // ---- gift choreography ---------------------------------------------------
  async function offer(user, userId, tier) {
    const fig = findOrCreateFigure(user, userId);
    fig.busy = true; fig.keep = true;
    try {
      if (tier === 'huong') {
        const s = STATIONS.huong;
        await walkTo(fig, s.x + (Math.random() - 0.5) * 60, s.y);
        await kneel(fig);
        for (let i = 0; i < 6; i++) { smoke(fig.c.x, fig.c.y - 60); await wait(350); }
        await bow(fig, 3);
      } else if (tier === 'buc') {
        const s = STATIONS.buc;
        await walkTo(fig, s.x, s.y);
        await kneel(fig, true);
        sparks(fig.c.x, fig.c.y - 40, 16);
        await wait(2500);
      } else if (tier === 'tambao') {
        const s = STATIONS.tambao;
        await walkTo(fig, s.x, s.y);
        await kneel(fig, true);
        sparks(fig.c.x, fig.c.y - 40, 40);
        flashBuddha();
        await wait(3500);
      } else if (tier === 'hoadang') {
        await walkTo(fig, CENTER_X, 1440);
        await kneel(fig);
        releaseLanterns(16);
        sparks(CENTER_X, 1400, 50);
        await wait(4000);
      }
    } finally {
      await stand(fig);
      fig.busy = false; fig.keep = false; fig.bornAt = performance.now();
      const spot = carpetSpot();
      await walkTo(fig, spot.x, spot.y);
    }
  }

  function flashBuddha() {
    const g = window.__buddhaGlow;
    tween(g.scale, { x: 1.5, y: 1.5 }, 500, ease.out).then(() => tween(g.scale, { x: 1, y: 1 }, 1200));
  }

  async function festival(user) {
    showBanner(`🙏 ${user} khai Pháp Hội Vạn Phật — cả chùa đồng loạt quỳ lạy!`, 6000);
    flashBuddha();
    releaseLanterns(20);
    const crowd = figures.filter((f) => !f.busy);
    await Promise.all(crowd.map(async (f, i) => {
      f.busy = true;
      await wait(i * 40);
      await kneel(f);
      await bow(f, 2);
      await wait(1500);
      setPose(f, 'kneelup');
      f.busy = false;
    }));
  }

  function spawnCrowd(n) {
    for (let i = 0; i < n; i++) {
      const s = carpetSpot();
      makeFigure(`Phật tử ${i + 1}`, null, s.x, s.y);
    }
  }

  const NAMMO = ['nam mô a di đà phật', 'nam mô', 'a di đà phật', 'cầu bình an', '🙏🙏🙏'];
  async function nammo(n) {
    const pool = figures.filter((f) => !f.busy).sort(() => Math.random() - 0.5).slice(0, n);
    pool.forEach((f, i) => setTimeout(() => showBubble(f, NAMMO[Math.floor(Math.random() * NAMMO.length)]), i * 250));
    for (const f of pool) { f.busy = true; kneel(f, true); }
    await wait(4500);
    for (const f of pool) { setPose(f, 'kneelup'); f.busy = false; }
  }

  function resetScene() {
    bannerQueue.length = 0;
    figures.splice(0).forEach((f) => f.c.destroy({ children: true }));
    layers.top.removeChildren().forEach((c) => c.destroy({ children: true }));
    layers.fx.removeChildren().forEach((c) => c.destroy({ children: true }));
    particles.length = 0;
    tweens.splice(0).forEach((t) => t.resolve());
    drawBoard([]);
  }

  // ---- event wiring --------------------------------------------------------
  const NARRATION = {
    huong: 'dâng hương, cầu bình an',
    buc: 'lên bục đệm xám, quỳ lạy sát đất',
    tambao: 'lên bục đỏ Tam Bảo, tặng công đức',
    hoadang: 'thả đèn hoa đăng, nỗ thẻ quẻ Đại Cát',
  };

  function onOverlayEvent(ev) {
    switch (ev.type) {
      case 'gift':
        if (ev.tier === 'phaphoi') { festival(ev.user).catch(() => {}); break; }
        if (ev.tier) {
          showBanner(`${ev.user} ${NARRATION[ev.tier]} (x${ev.count})`, 4500);
          offer(ev.user, ev.userId, ev.tier).catch(() => {});
        }
        break;
      case 'chat': {
        const fig = findOrCreateFigure(ev.user, ev.userId);
        showBubble(fig, ev.text);
        if (!fig.busy && fig.c.y < 1250) {
          const s = carpetSpot();
          walkTo(fig, s.x, s.y);
        }
        break;
      }
      case 'share':
        showBanner(`${ev.user} đã chia sẻ buổi lễ 🙏`, 3500);
        break;
      case 'nammo': nammo(ev.count).catch(() => {}); break;
      case 'crowd': spawnCrowd(ev.count); break;
      case 'reset': resetScene(); break;
      default: break;
    }
  }

  loadSprites().then(() => {
    drawScene();
    drawBoard([]);
    const socket = io();
    socket.on('overlay', onOverlayEvent);
    socket.on('leaderboard', drawBoard);
  });
})();
