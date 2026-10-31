/* Temple overlay — 1080x1920 PixiJS scene driven by Socket.IO events.
 * Visuals are placeholder vector art. Drop real images into public/assets/ (see README). */
(() => {
  const W = 1080, H = 1920;
  const CENTER_X = W / 2;
  const MAX_FIGURES = 150; // a safety cap for the renderer; beyond it the oldest idle disciple is retired

  // Kneeling mats run up the carpet towards the altar: the bigger the gift, the closer to the Buddha.
  const STATIONS = {
    tambao: { x: 540, y: 1225 },
    buc: { x: 540, y: 1325 },
    huong: { x: 540, y: 1425 },
  };
  // Legend plates at the foot of the screen (labels only, nobody kneels here).
  const LEGEND = [
    { x: 340, y: 1810, label: '1 xu', sub: 'dâng hương' },
    { x: 540, y: 1810, label: '5 xu', sub: 'lên bục' },
    { x: 740, y: 1810, label: '10+ xu', sub: 'tặng công đức' },
  ];


  const app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true });
  const stageEl = document.getElementById('stage');
  stageEl.appendChild(app.view);

  // OBS gives the page a transparent canvas of the right size. In any other browser (a phone, a test tab) the page
  // is centred on a black background, so it is not stuck in a corner on white.
  const IN_OBS = !!window.obsstudio;
  if (!IN_OBS) document.body.style.background = '#000';
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stageEl.style.transform = `scale(${s})`;
    stageEl.style.left = IN_OBS ? '0px' : `${(window.innerWidth - W * s) / 2}px`;
    stageEl.style.top = IN_OBS ? '0px' : `${(window.innerHeight - H * s) / 2}px`;
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
      const k = perspective(s.y);
      const mat = new PIXI.Graphics()
        .beginFill(s === STATIONS.tambao ? 0xb32020 : 0x8a8a8a, 0.92)
        .lineStyle(2, 0xd9a93a)
        .drawRoundedRect(-80 * k, -14 * k, 160 * k, 30 * k, 8)
        .endFill();
      mat.position.set(s.x, s.y);
      layers.floor.addChild(mat);
    }
    for (const l of LEGEND) {
      const box = new PIXI.Graphics();
      box.lineStyle(3, 0xd9a93a).beginFill(0x4a1a0a, 0.85).drawRoundedRect(-85, 0, 170, 70, 8).endFill();
      box.position.set(l.x, l.y);
      const a = new PIXI.Text(l.label, { fontFamily: 'Arial', fontSize: 24, fontWeight: '700', fill: 0xffe9a8 });
      const b = new PIXI.Text(l.sub, { fontFamily: 'Arial', fontSize: 18, fill: 0xf4cf7a });
      a.anchor.set(0.5); b.anchor.set(0.5);
      a.position.set(l.x, l.y + 25); b.position.set(l.x, l.y + 51);
      layers.floor.addChild(box, a, b);
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
      c, body, label, name, userId, busy: false, phase: Math.random() * 6, baseY: y,
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
    releaseSlot(fig);
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
    }
  }

  // Waiting places: fixed rows across the hall, filled from the altar end outwards, left and right in turn.
  // A disciple keeps its place until it is retired; after bringing a gift it walks back to the same place.
  const SLOT_ROW_START = 1290, SLOT_ROW_STEP = 60, SLOT_ROWS = 10;
  const SLOT_COLUMNS = [-0.4, 0.4, -0.65, 0.65, -0.9, 0.9]; // as a share of the carpet's half-width at that row
  const slots = [];
  for (let r = 0; r < SLOT_ROWS; r++) {
    const y = SLOT_ROW_START + r * SLOT_ROW_STEP;
    for (const c of SLOT_COLUMNS) slots.push({ x: CENTER_X + c * carpetHalfAt(y), y, owner: null });
  }

  function claimSlot(fig) {
    if (fig.slot) return fig.slot;
    let slot = slots.find((s) => !s.owner);
    if (slot) slot.owner = fig;
    else slot = slots[Math.floor(Math.random() * slots.length)]; // hall is full: stand among the others
    fig.slot = slot;
    return slot;
  }

  function releaseSlot(fig) {
    if (fig.slot && fig.slot.owner === fig) fig.slot.owner = null;
    fig.slot = null;
  }

  function findOrCreateFigure(name, userId) {
    let fig = figures.find((f) => f.userId === userId);
    if (fig) return fig;
    const fig2 = makeFigure(name, userId, CENTER_X + (Math.random() - 0.5) * 160, H - 20);
    fig2.fresh = true;
    return fig2;
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
    fig.busy = true; fig.fresh = false;
    try {
      if (tier === 'huong') {
        const s = STATIONS.huong;
        await walkTo(fig, s.x + (Math.random() - 0.5) * 70, s.y);
        await kneel(fig);
        for (let i = 0; i < 6; i++) { smoke(fig.c.x, fig.c.y - 60); await wait(350); }
        await bow(fig, 3);
      } else if (tier === 'buc') {
        const s = STATIONS.buc;
        await walkTo(fig, s.x + (Math.random() - 0.5) * 70, s.y);
        await kneel(fig, true);
        sparks(fig.c.x, fig.c.y - 40, 16);
        await wait(2500);
      } else if (tier === 'tambao') {
        const s = STATIONS.tambao;
        await walkTo(fig, s.x + (Math.random() - 0.5) * 70, s.y);
        await kneel(fig, true);
        sparks(fig.c.x, fig.c.y - 40, 40);
        flashBuddha();
        await wait(3500);
      } else if (tier === 'hoadang') {
        await walkTo(fig, CENTER_X, 1510);
        await kneel(fig);
        releaseLanterns(16);
        sparks(CENTER_X, 1470, 50);
        await wait(4000);
      }
    } finally {
      fig.busy = false;
      const spot = claimSlot(fig);
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
      const fig = makeFigure(`Phật tử ${i + 1}`, null, CENTER_X, H - 20);
      const s = claimSlot(fig);
      fig.c.position.set(s.x, s.y);
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
    slots.forEach((slot) => { slot.owner = null; });
    layers.top.removeChildren().forEach((c) => c.destroy({ children: true }));
    layers.fx.removeChildren().forEach((c) => c.destroy({ children: true }));
    particles.length = 0;
    tweens.splice(0).forEach((t) => t.resolve());
    drawBoard([]);
  }

  // ---- spoken lines (one at a time, so overlapping gifts never talk over each other) ----
  // Several pages can be open at once (OBS, a test tab, the admin preview) and each one receives every event,
  // so only OBS speaks by default; any other browser needs ?sound=1, and ?mute=1 silences even OBS.
  const params = new URLSearchParams(location.search);
  const MUTED = params.has('mute') || !(window.obsstudio || params.has('sound'));
  const MAX_PENDING_SPEECH = 4;
  const speechQueue = [];
  let speaking = false;

  // A spoken line is a list of clip ids (name, then the fixed tail) played back to back.
  function enqueueSpeech(ids) {
    if (MUTED || !Array.isArray(ids) || !ids.length || speechQueue.length >= MAX_PENDING_SPEECH) return;
    speechQueue.push([...ids]);
    pumpSpeech();
  }

  // A normal browser tab refuses to play sound until the page has been clicked once; OBS does not.
  // When that happens, keep the line and show a button instead of staying silent.
  let unlockHint = null;
  function showUnlockHint() {
    if (unlockHint) return;
    unlockHint = document.createElement('button');
    unlockHint.textContent = '🔊 Bấm vào đây để bật tiếng';
    Object.assign(unlockHint.style, {
      position: 'fixed', left: '50%', top: '40%', transform: 'translateX(-50%)', zIndex: 10,
      padding: '18px 28px', font: '700 28px Arial', color: '#3b0f0a', background: '#ffd77a',
      border: '3px solid #b8872a', borderRadius: '12px', cursor: 'pointer',
    });
    unlockHint.onclick = () => { unlockHint.remove(); unlockHint = null; pumpSpeech(); startMusic(); };
    document.body.appendChild(unlockHint);
  }

  // Resolves 'ok', 'error' or 'blocked' (autoplay refused). The server may still be synthesizing, so allow a long wait.
  function playClip(id) {
    return new Promise((resolve) => {
      const audio = new Audio(`/tts/${id}.mp3`);
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(result);
      };
      const guard = setTimeout(() => finish('error'), 60000); // a stuck clip must not silence everything after it
      audio.addEventListener('ended', () => finish('ok'));
      audio.addEventListener('error', () => { console.warn('[speech] clip failed to load', id); finish('error'); });
      audio.play().catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          console.warn('[speech] browser blocked autoplay; click the page to enable sound');
          finish('blocked');
        } else {
          console.warn('[speech] play failed:', err && err.message);
          finish('error');
        }
      });
    });
  }

  async function playLine(ids) {
    for (let i = 0; i < ids.length; i++) {
      if ((await playClip(ids[i])) === 'blocked') {
        speechQueue.unshift(ids.slice(i));
        showUnlockHint();
        return;
      }
    }
  }

  function pumpSpeech() {
    if (speaking || !speechQueue.length || unlockHint) return;
    speaking = true;
    playLine(speechQueue.shift()).finally(() => { speaking = false; pumpSpeech(); });
  }

  // ---- background music ----------------------------------------------------
  // Plays every file the server lists (public/assets/music) in a loop. No files means no music and no errors.
  // The level follows the admin setting and drops while a line is being spoken, so the voice stays clear.
  const DUCK_RATIO = 0.3; // music level while speaking, relative to the normal level
  const MUSIC_STEP_MS = 50;
  const music = { tracks: [], index: 0, errors: 0, enabled: true, volume: 0.25, audio: null, level: 0 };
  window.__bgm = music; // debug handle for tests

  function musicTarget() {
    if (!music.enabled) return 0;
    return (speaking || speechQueue.length) ? music.volume * DUCK_RATIO : music.volume;
  }

  function loadTrack() {
    music.audio.src = music.tracks[music.index % music.tracks.length];
  }

  function onMusicBlocked(err) {
    if (err && err.name === 'NotAllowedError') showUnlockHint();
    else skipTrack();
  }

  function skipTrack() {
    music.errors++;
    if (music.errors > music.tracks.length) {
      console.warn('[music] no track could be played; giving up');
      return;
    }
    music.index = (music.index + 1) % music.tracks.length;
    loadTrack();
    music.audio.play().catch(onMusicBlocked);
  }

  function startMusic() {
    if (MUTED || !music.enabled || !music.tracks.length) return;
    if (!music.audio) {
      music.audio = new Audio();
      music.audio.volume = 0; // fades in from silence
      music.audio.addEventListener('ended', () => {
        music.index = (music.index + 1) % music.tracks.length;
        loadTrack();
        music.audio.play().catch(onMusicBlocked);
      });
      music.audio.addEventListener('error', () => { console.warn('[music] track failed to load'); skipTrack(); });
      music.audio.addEventListener('playing', () => { music.errors = 0; });
      loadTrack();
    }
    if (music.audio.paused) music.audio.play().catch(onMusicBlocked);
  }

  setInterval(() => {
    if (!music.audio) return;
    const target = musicTarget();
    music.level += (target - music.level) * 0.2;
    if (Math.abs(target - music.level) < 0.002) music.level = target;
    music.audio.volume = Math.min(1, Math.max(0, music.level));
  }, MUSIC_STEP_MS);

  function applyMusicSettings(next) {
    music.enabled = !!next.enabled;
    if (Number.isFinite(next.volume)) music.volume = Math.min(1, Math.max(0, next.volume));
    if (!music.enabled && music.audio) music.audio.pause();
    else startMusic();
  }

  // ?debug=1 prints the sound state on the overlay, for finding out why a host (LIVE Studio, OBS) is silent.
  if (params.has('debug')) {
    const panel = document.createElement('pre');
    Object.assign(panel.style, {
      position: 'fixed', left: '8px', top: '8px', zIndex: 20, margin: 0, padding: '10px 12px', maxWidth: '96vw',
      font: '600 22px/1.35 monospace', color: '#0f0', background: 'rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap',
    });
    document.body.appendChild(panel);
    setInterval(() => {
      const a = music.audio;
      panel.textContent = [
        `sound allowed : ${!MUTED}  (obs=${!!window.obsstudio}, sound=1: ${params.has('sound')}, mute=1: ${params.has('mute')})`,
        `music tracks  : ${music.tracks.length}  enabled=${music.enabled}  volume=${music.volume}`,
        a ? `music audio   : ${a.paused ? 'PAUSED' : 'playing'}  t=${a.currentTime.toFixed(1)}s  vol=${a.volume.toFixed(2)}  ready=${a.readyState} net=${a.networkState}${a.error ? `  ERROR code ${a.error.code}` : ''}` : 'music audio   : not created',
        `autoplay block: ${unlockHint ? 'YES (waiting for a click)' : 'no'}`,
        `speech        : queue=${speechQueue.length} speaking=${speaking}`,
      ].join('\n');
    }, 500);
  }

  fetch('/api/music')
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => { music.tracks = Array.isArray(list) ? list : []; startMusic(); })
    .catch(() => { /* no music available */ });

  // ---- event wiring --------------------------------------------------------
  const NARRATION = {
    huong: 'dâng hương, cầu bình an',
    buc: 'lên bục đệm xám, quỳ lạy sát đất',
    tambao: 'lên bục đỏ Tam Bảo, tặng công đức',
    hoadang: 'thả đèn hoa đăng, nỗ thẻ quẻ Đại Cát',
  };

  // A newly created disciple enters from the foot of the hall and walks up to a waiting place on the carpet.
  function welcome(fig) {
    if (!fig.fresh || fig.busy) return;
    fig.fresh = false;
    const s = claimSlot(fig);
    walkTo(fig, s.x, s.y).catch(() => {});
  }

  function onOverlayEvent(ev) {
    if (ev.speech) enqueueSpeech(ev.speech);
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
        welcome(fig);
        break;
      }
      case 'join':
        welcome(findOrCreateFigure(ev.user, ev.userId));
        break;
      case 'share':
        showBanner(`${ev.user} đã chia sẻ buổi lễ 🙏`, 3500);
        break;
      case 'nammo': nammo(ev.count).catch(() => {}); break;
      case 'crowd': spawnCrowd(ev.count); break;
      case 'reset': speechQueue.length = 0; resetScene(); break;
      default: break;
    }
  }

  loadSprites().then(() => {
    drawScene();
    drawBoard([]);
    const socket = io();
    socket.on('overlay', onOverlayEvent);
    socket.on('leaderboard', drawBoard);
    socket.on('music', applyMusicSettings);
  });
})();
