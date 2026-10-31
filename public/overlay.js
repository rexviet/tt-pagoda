/* Temple overlay — 1080x1920 PixiJS scene driven by Socket.IO events.
 * Visuals are placeholder vector art. Drop real images into public/assets/ (see README). */
(() => {
  const W = 1080, H = 1920;
  const CENTER_X = W / 2;
  const MAX_FIGURES = 600; // a safety cap for the renderer, above the number of standing places; beyond it the oldest idle disciple is retired



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
  // Everything in the hall lives in `world`, which the camera zooms and pans; the HUD stays outside so it is never zoomed.
  const world = new PIXI.Container();
  app.stage.addChild(world);
  const layers = {};
  ['bg', 'floor', 'fx', 'figures', 'hero', 'top', 'hud'].forEach((n) => {
    layers[n] = new PIXI.Container();
    (n === 'hud' ? app.stage : world).addChild(layers[n]);
  });
  layers.figures.sortableChildren = true;

  // ---- camera: the altar shot --------------------------------------------------
  // While someone brings a gift the camera frames the altar and the Buddha with that one disciple kneeling in front, and
  // the rest of the crowd fades out so nobody else is in the shot. The framing keeps the Buddha's head and the disciple
  // inside the band TikTok leaves free (its header covers the top ~14% of the screen, its chat and buttons the bottom ~16%).
  // When no shot is active the camera eases back to the whole hall (zoom 1 is exactly the original framing).
  // Measured on the current background.png (scaled to cover the 1080x1920 frame): six cushions in a row at y~1148, the carpet
  // axis at x~548, the foot of the altar at y~1090 and the Buddha's crown at y~260. Change them if the background changes.
  const ALTAR_SPOT = { x: 548, y: 1158 }; // where a gift giver kneels: the carpet between the six cushions
  // The shot keeps the Buddha's crown (y 260) and the kneeling disciple (y 1158) inside the part of the screen TikTok
  // leaves free (from about 14% to 84% of the height): the view is 1/1.4 of the frame, centred on this world point.
  const ALTAR_VIEW = { zoom: 1.4, x: 548, y: 731 };
  const CAMERA_SETTLE_MS = 260; // smaller = snappier moves
  const CROWD_FADE_MS = 200;
  const camera = { zoom: 1, x: W / 2, y: H / 2 };
  const spotlights = [];

  function spotlight(view) {
    const sp = { view };
    spotlights.push(sp);
    return sp;
  }
  function endSpotlight(sp) {
    const i = spotlights.indexOf(sp);
    if (i >= 0) spotlights.splice(i, 1);
  }

  app.ticker.add(() => {
    const sp = spotlights[spotlights.length - 1];
    const target = sp ? sp.view : { zoom: 1, x: W / 2, y: H / 2 };
    const dt = app.ticker.deltaMS;
    const k = 1 - Math.exp(-dt / CAMERA_SETTLE_MS);
    camera.zoom += (target.zoom - camera.zoom) * k;
    camera.x += (target.x - camera.x) * k;
    camera.y += (target.y - camera.y) * k;
    if (Math.abs(camera.zoom - 1) < 0.002 && target.zoom === 1) camera.zoom = 1;
    const z = camera.zoom;
    // Keep the view inside the picture: the offset can never reveal anything outside the hall.
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    world.scale.set(z);
    world.position.set(clamp(W / 2 - camera.x * z, W - W * z, 0), clamp(H / 2 - camera.y * z, H - H * z, 0));
    // The crowd fades out while a shot is on; the disciple in the shot stands in the hero layer, which stays visible.
    const fade = 1 - Math.exp(-dt / CROWD_FADE_MS);
    layers.figures.alpha += ((sp ? 0 : 1) - layers.figures.alpha) * fade;
    if (!sp && layers.figures.alpha > 0.995) layers.figures.alpha = 1;
  });

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
  const CARPET_TOP_Y = 1100; // where the floor begins at the foot of the altar; disciples shrink towards here

  function drawScene() {
    loadBackground().then((ok) => { if (!ok) drawVectorScene(); addGlow(); });
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
  // Which cast stands in the hall: 'devotee' (realistic, from the rpc project, back view only) or 'brown' (chibi).
  // ?outfits=brown on the overlay address switches the cast without touching any file.
  const OUTFITS = (new URLSearchParams(location.search).get('outfits') || 'devotee').split(',').map((o) => o.trim()).filter(Boolean);
  // front poses face the camera; *up poses are seen from behind, facing the Buddha
  // Extra frames some casts have: walkup2 (the other foot), settle (sinking onto the knees), bowa/bowb/bowc (the steps of
  // a bow down to the floor). A cast without them just goes straight between kneelup and bowup.
  const POSES = ['kneel', 'stand', 'walk', 'bow', 'kneelup', 'walkup', 'bowup', 'walkup2', 'settle', 'bowa', 'bowb', 'bowc'];
  const POSE_HEIGHT = { kneel: 120, stand: 140, walk: 140, bow: 105 };
  const baseOf = (pose) => pose.replace(/up2?$/, '');
  // A cast whose frames all share one scale (its pose images are cut from one drawing size) is drawn at this many
  // design pixels per image pixel, instead of the per-pose heights above.
  const PIXEL_SCALE = { devotee: 1.2 };
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
    const h = PIXEL_SCALE[fig.outfit] ? tex.height * PIXEL_SCALE[fig.outfit] : POSE_HEIGHT[real ? base : 'kneel'];
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
    label.visible = false; // names stay hidden in the crowd; see showLabel
    c.addChild(shadow, body, label);
    c.position.set(x, y);
    c.zIndex = y;
    const fig = {
      c, body, label, name, userId, busy: false, phase: Math.random() * 6, baseY: y,
      outfit, jitter: 0.92 + Math.random() * 0.16, heroScale: 1, vipScale: 1, vipRank: null,
    };
    setPose(fig, 'kneelup');
    c.scale.set(perspective(y) * fig.jitter);
    figures.push(fig);
    layers.figures.addChild(c);
    trimFigures();
    return fig;
  }

  // The crowd is too dense for every name to be readable, so a name only shows while its owner is doing something.
  function showLabel(fig, ms) {
    fig.label.visible = true;
    clearTimeout(fig.labelTimer);
    if (ms > 0) fig.labelTimer = setTimeout(() => { if (!fig.c.destroyed && !fig.busy && !fig.vipRank) fig.label.visible = false; }, ms);
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
      f.c.scale.set(perspective(f.c.y) * f.jitter * f.heroScale * f.vipScale);
      f.c.zIndex = f.c.y;
      let tilt = 0, hop = 0;
      if (f.base === 'walk') {
        const set = TEX[f.outfit];
        if (f.pose === 'walkup' && set.walkup2) f.body.texture = Math.floor(now / 190 + f.phase) % 2 ? set.walkup2 : set.walkup; // alternate feet
        tilt = Math.sin(now / 130) * 0.07;
        if (f.fallback) hop = -Math.abs(Math.sin(now / 130)) * 12;
      } else if (!f.busy) {
        tilt = Math.sin(now / 900 + f.phase) * 0.025;
      }
      f.body.rotation += (tilt - f.body.rotation) * 0.25;
      f.body.y += (hop - f.body.y) * 0.4;
    }
  }

  // Standing places cover the whole floor of the hall, shoulder to shoulder: rows run from the foot of the altar to the
  // bottom of the screen, and rows and neighbours are spaced in proportion to the disciple's size at that depth, so the
  // crowd gets denser towards the back. Every other row is shifted half a step. A disciple keeps its place for good.
  const FLOOR_TOP = 1265, FLOOR_BOTTOM = 1890; // the crowd starts below the cushions, which belong to the top six
  const SLOT_MARGIN_X = 46; // keep disciples clear of the screen edges
  const SLOT_SPACING = 110, SLOT_ROW_STEP = 70; // at full size; both shrink with depth
  const slots = [];
  for (let y = FLOOR_TOP, row = 0; y <= FLOOR_BOTTOM; row++) {
    const k = perspective(y);
    const spacing = SLOT_SPACING * k;
    const perRow = Math.floor((W - 2 * SLOT_MARGIN_X) / spacing);
    const shift = row % 2 ? spacing / 2 : 0;
    for (let i = 0; i < perRow; i++) {
      const x = SLOT_MARGIN_X + spacing * (i + 0.5) + shift;
      if (x <= W - SLOT_MARGIN_X) slots.push({ x, y, owner: null });
    }
    y += SLOT_ROW_STEP * k;
  }
  // Hand the places out in a scattered (but always the same) order, so the first few arrivals spread over the whole hall.
  (function shuffleSlots() {
    let seed = 20261031;
    const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  })();

  function claimSlot(fig) {
    if (fig.slot) return fig.slot;
    let slot = slots.find((s) => !s.owner);
    if (!slot) { // the hall is full: an anonymous disciple gives up its place for a real viewer
      const extra = figures.find((f) => f.ambient && !f.busy);
      if (extra) { slot = extra.slot; removeFigure(extra); }
    }
    if (slot) slot.owner = fig;
    else slot = slots[Math.floor(Math.random() * slots.length)]; // still full: stand among the others
    fig.slot = slot;
    return slot;
  }

  function releaseSlot(fig) {
    if (fig.slot && fig.slot.owner === fig) fig.slot.owner = null; // works for crowd places and cushions alike
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

  // A cast with the bow frames goes down to the floor in steps (hands to the forehead, half bow, hands on the floor, flat)
  // and comes back up the same way; a cast without them jumps between kneeling and prostrate.
  const PROSTRATE_DOWN = ['bowa', 'bowb', 'bowc', 'bowup'];
  const PROSTRATE_UP = ['bowc', 'bowb', 'bowa', 'kneelup'];
  const hasBowFrames = (fig) => !!TEX[fig.outfit].bowa;
  async function playPoses(fig, poses, gap = 130) {
    for (const pose of poses) { setPose(fig, pose); await wait(gap); }
  }

  // deep = full prostration; otherwise upright kneeling with palms together
  async function kneel(fig, deep = false) {
    fig.body.rotation = 0;
    if (deep) {
      if (hasBowFrames(fig)) await playPoses(fig, PROSTRATE_DOWN); else setPose(fig, 'bowup');
      return;
    }
    if (TEX[fig.outfit].settle) { setPose(fig, 'settle'); await wait(160); }
    setPose(fig, 'kneelup');
  }
  async function stand(fig) { setPose(fig, 'stand'); await wait(350); }
  async function bow(fig, times = 3) {
    for (let i = 0; i < times; i++) {
      if (hasBowFrames(fig)) {
        await playPoses(fig, PROSTRATE_DOWN);
        await wait(700);
        await playPoses(fig, PROSTRATE_UP);
        await wait(450);
      } else {
        setPose(fig, 'bowup');
        await wait(900);
        setPose(fig, 'kneelup');
        await wait(600);
      }
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
    showLabel(fig, 5000);
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
  // The board lists the people who just missed a cushion (ranks 7-10); the top six are on the cushions with their rank
  // on their name. With nobody to list it is hidden rather than shown empty.
  let boardHeight = 0;
  let boardState = { visible: false, rows: [] };
  function drawBoard(rows, firstRank = 1) {
    board.removeChildren().forEach((c) => c.destroy({ children: true }));
    board.visible = rows.length > 0;
    boardHeight = board.visible ? 40 + rows.length * 44 : 0;
    boardState = { visible: board.visible, rows: rows.map((r, i) => ({ rank: firstRank + i, name: r.name, score: r.score })) };
    positionQueueBadge();
    if (!board.visible) return;
    const bg = new PIXI.Graphics().lineStyle(3, 0xd9a93a).beginFill(0x3b0f0a, 0.9).drawRoundedRect(0, 0, 250, boardHeight, 10).endFill();
    const title = new PIXI.Text('TÂM LÒNG THÀNH', { fontFamily: 'Arial', fontSize: 20, fontWeight: '700', fill: 0xffe9a8 });
    title.anchor.set(0.5, 0); title.position.set(125, 10);
    board.addChild(bg, title);
    rows.forEach((r, i) => {
      const y = 44 + i * 44;
      const place = firstRank + i;
      const medal = [0xf5c518, 0xc0c0c0, 0xcd7f32][place - 1] || 0x888888;
      const dot = new PIXI.Graphics().beginFill(medal).drawCircle(24, y + 18, 13).endFill();
      const rank = new PIXI.Text(String(place), { fontFamily: 'Arial', fontSize: 16, fontWeight: '700', fill: 0x222222 });
      rank.anchor.set(0.5); rank.position.set(24, y + 18);
      const nm = new PIXI.Text(r.name.slice(0, 12), { fontFamily: 'Arial', fontSize: 17, fill: 0xffffff });
      nm.position.set(48, y + 8);
      const sc = new PIXI.Text(String(r.score), { fontFamily: 'Arial', fontSize: 16, fontWeight: '700', fill: 0xffe9a8 });
      sc.anchor.set(1, 0); sc.position.set(238, y + 9);
      board.addChild(dot, rank, nm, sc);
    });
  }
  window.__board = () => boardState; // debug handle for tests

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

  // ---- the top six sit on the cushions ------------------------------------------------------
  // The six cushions of the background are the places of honour. Rank 1 and 2 take the two cushions next to the carpet,
  // 3 and 4 the next pair, 5 and 6 the outer pair (rank 1 on the left, 2 on the right, and so on). The server sends
  // the ranking with every change; whoever enters or leaves the top six walks to the new place or back into the crowd.
  const CUSHION_Y = 1150; // where a disciple's knees meet the cushion
  const VIP_SCALE = 1.1; // the cushions are large, so the people on them are drawn larger than the crowd at that depth
  const vipSlots = [382, 718, 214, 884, 65, 1024].map((x) => ({ x, y: CUSHION_Y, owner: null }));
  const VIP_SPEED = 380;

  // Walk to the figure's current slot (the latest one if it changed meanwhile). A cast that cannot walk towards the
  // camera fades out and in again when the way is down.
  async function moveToSlot(fig) {
    const place = fig.slot;
    if (!place || fig.c.destroyed) return;
    if (place.y < fig.c.y - 6 || TEX[fig.outfit].walk) { await walkTo(fig, place.x, place.y, VIP_SPEED); return; }
    await tween(fig.c, { alpha: 0 }, 220);
    fig.c.position.set(place.x, place.y);
    setPose(fig, 'kneelup');
    await tween(fig.c, { alpha: 1 }, 220);
  }

  function relocate(fig) {
    if (fig.busy) return; // a prayer is going on: returnHome will use the new slot
    fig.arriving = (fig.arriving || Promise.resolve()).then(() => moveToSlot(fig)).catch(() => {}).finally(() => { fig.arriving = null; });
  }

  function setRankLook(fig, rank) {
    fig.vipRank = rank;
    fig.vipScale = rank ? VIP_SCALE : 1;
    fig.label.text = rank ? `${rank}. ${fig.name}` : fig.name;
    if (rank) showLabel(fig, 0); else showLabel(fig, 2000);
  }

  function applyVipRanks(rows) {
    const top = (rows || []).slice(0, vipSlots.length).filter((r) => r.userId);
    const wanted = new Map(top.map((r, i) => [r.userId, i]));
    // 1. whoever is no longer in their place gives it up
    for (const f of figures) {
      if (f.vipRank && wanted.get(f.userId) !== f.vipRank - 1) {
        releaseSlot(f);
        setRankLook(f, null);
        if (!wanted.has(f.userId)) { claimSlot(f); relocate(f); }
      }
    }
    // 2. everyone in the top six takes their cushion
    top.forEach((row, i) => {
      let fig = figures.find((f) => f.userId === row.userId);
      const fresh = !fig;
      if (!fig) { // known to the server but not yet on this page (the page was opened later)
        fig = makeFigure(row.name, row.userId, vipSlots[i].x, vipSlots[i].y);
        fig.fresh = false;
        fig.c.alpha = 0;
        tween(fig.c, { alpha: 1 }, 500);
      }
      if (fig.vipRank === i + 1 && fig.slot === vipSlots[i]) return;
      releaseSlot(fig);
      vipSlots[i].owner = fig;
      fig.slot = vipSlots[i];
      setRankLook(fig, i + 1);
      if (!fresh) relocate(fig);
    });
  }

  window.__vips = () => vipSlots.map((s, i) => ({ rank: i + 1, owner: s.owner ? s.owner.name : null, x: s.owner ? Math.round(s.owner.c.x) : null, y: s.owner ? Math.round(s.owner.c.y) : null, slotX: s.x })); // debug handle for tests

  // ---- gift choreography ---------------------------------------------------
  // A gift giver runs straight up to the altar and prays there while the camera holds the altar shot. Only one shot can
  // be on at a time, so gifts take their turn; if more than a few are waiting the extra ones just bow where they stand.
  const HERO_SCALE = 1.15; // drawn larger in the shot, as if closer to the camera
  const RUN_SPEED = 520;
  // ---- the gift queue ------------------------------------------------------------------------
  // Only one gift can be on stage at a time, so the others wait their turn, under four simple rules:
  //  1. someone who is already waiting is not queued twice: their gifts are added up and the better tier is kept;
  //  2. bigger gifts go first, otherwise first come, first served;
  //  3. at most OFFER_QUEUE_MAX wait; whoever would be the last in line bows where they stand instead of being lost;
  //  4. nobody waits more than OFFER_MAX_WAIT_MS: after that they bow where they stand as well.
  // The banner and the spoken line start with the prayer itself, so what is said matches what is on screen.
  const OFFER_QUEUE_MAX = 5;
  const OFFER_MAX_WAIT_MS = Number(new URLSearchParams(location.search).get('queuewait')) || 25000; // ?queuewait=<ms> overrides it (for tests)
  const TIER_PRIORITY = { huong: 1, buc: 2, tambao: 3, hoadang: 4 };
  const offerQueue = [];
  let onStage = null;
  let queueBadge = null;

  const offerText = (e) => `${e.user} ${NARRATION[e.tier]} (x${e.count})`;

  function positionQueueBadge() {
    if (queueBadge) queueBadge.position.set(W - 145, board.y + (boardHeight ? boardHeight + 10 : 0));
  }

  function updateQueueBadge() {
    if (!queueBadge) {
      queueBadge = new PIXI.Text('', { fontFamily: 'Arial', fontSize: 20, fontWeight: '700', fill: 0xffe9a8, stroke: 0x000000, strokeThickness: 4 });
      queueBadge.anchor.set(0.5, 0);
      layers.hud.addChild(queueBadge);
    }
    positionQueueBadge();
    queueBadge.text = offerQueue.length ? `Đang chờ lạy: ${offerQueue.length}` : '';
  }

  function bowInPlace(entry) {
    showBanner(offerText(entry), 3500);
    enqueueSpeech(entry.speech);
    prayInPlace(entry.user, entry.userId).catch(() => {});
  }

  function queueOffer(ev) {
    const waiting = offerQueue.find((e) => e.userId === ev.userId);
    if (waiting) { // rule 1
      waiting.count += ev.count;
      if (TIER_PRIORITY[ev.tier] > TIER_PRIORITY[waiting.tier]) waiting.tier = ev.tier;
      waiting.speech = waiting.speech || ev.speech || null;
    } else {
      offerQueue.push({ user: ev.user, userId: ev.userId, tier: ev.tier, count: ev.count, speech: ev.speech || null, queuedAt: Date.now() });
    }
    offerQueue.sort((x, y) => TIER_PRIORITY[y.tier] - TIER_PRIORITY[x.tier] || x.queuedAt - y.queuedAt); // rule 2
    while (offerQueue.length > OFFER_QUEUE_MAX) bowInPlace(offerQueue.pop()); // rule 3
    updateQueueBadge();
    pumpOffers();
  }

  async function pumpOffers() {
    if (onStage) return;
    while (offerQueue.length) {
      const entry = offerQueue.shift();
      updateQueueBadge();
      if (Date.now() - entry.queuedAt > OFFER_MAX_WAIT_MS) { bowInPlace(entry); continue; } // rule 4
      onStage = entry;
      showBanner(offerText(entry), 4500);
      enqueueSpeech(entry.speech);
      try { await offer(entry.user, entry.userId, entry.tier); } catch (_) { /* the page was reset during the prayer */ }
      onStage = null;
    }
  }

  window.__queue = () => ({ onStage: onStage ? onStage.user : null, waiting: offerQueue.map((e) => ({ user: e.user, tier: e.tier, count: e.count })), hero: layers.hero.children.length }); // debug handle for tests

  async function prayInPlace(user, userId) {
    const fig = findOrCreateFigure(user, userId);
    if (fig.busy) return;
    fig.busy = true;
    showLabel(fig, 0);
    try {
      if (fig.fresh) {
        fig.fresh = false;
        const place = claimSlot(fig);
        await walkTo(fig, place.x, place.y);
      } else if (fig.arriving) {
        await fig.arriving;
      }
      await kneel(fig, true);
      sparks(fig.c.x, fig.c.y - fig.h * fig.c.scale.y * 0.9, 12);
      await wait(1800);
    } finally {
      setPose(fig, 'kneelup');
      fig.busy = false;
      showLabel(fig, 2500);
    }
  }

  async function offer(user, userId, tier) {
    const fig = findOrCreateFigure(user, userId);
    if (fig.busy) return;
    fig.busy = true;
    showLabel(fig, 0); // the name stays up for the whole prayer
    let shot = null;
    try {
      claimSlot(fig); // the place to go home to
      if (fig.fresh) fig.fresh = false; // a newcomer simply runs up from the foot of the hall
      else if (fig.arriving) await fig.arriving; // already on the way in: let them arrive first, or two walks would fight
      layers.hero.addChild(fig.c); // above the crowd, which is about to fade out
      shot = spotlight(ALTAR_VIEW);
      await walkTo(fig, ALTAR_SPOT.x + (Math.random() - 0.5) * 20, ALTAR_SPOT.y, RUN_SPEED);
      tween(fig, { heroScale: HERO_SCALE / fig.vipScale }, 350); // the same size in the shot for everyone, cushion or not
      const headY = () => fig.c.y - fig.h * fig.c.scale.y * 0.9;
      if (tier === 'huong') {
        await kneel(fig);
        for (let i = 0; i < 5; i++) { smoke(fig.c.x, headY()); await wait(350); }
        await bow(fig, 2);
      } else if (tier === 'buc') {
        await kneel(fig, true);
        sparks(fig.c.x, headY(), 16);
        await wait(3000);
      } else if (tier === 'tambao') {
        await kneel(fig, true);
        sparks(fig.c.x, headY(), 40);
        flashBuddha();
        await wait(3500);
      } else if (tier === 'hoadang') {
        await kneel(fig);
        releaseLanterns(16);
        sparks(fig.c.x, headY(), 50);
        await wait(4000);
      }
    } finally {
      if (fig.pose === 'bowup' && hasBowFrames(fig)) await playPoses(fig, PROSTRATE_UP, 110); // get up before the camera leaves
      if (shot) endSpotlight(shot); // the camera pulls back and the crowd fades in
      tween(fig, { heroScale: 1 }, 400);
      layers.figures.addChild(fig.c);
      fig.busy = false;
      await returnHome(fig);
      showLabel(fig, 3000);
    }
  }

  // Back to the standing place. A cast with a front-facing walk walks there; a back-view-only cast would look like it
  // walks backwards, so it fades out at the altar and fades in at its place instead.
  async function returnHome(fig) {
    const home = claimSlot(fig);
    if (TEX[fig.outfit].walk) return walkTo(fig, home.x, home.y, RUN_SPEED);
    await tween(fig.c, { alpha: 0 }, 250);
    fig.c.position.set(home.x, home.y);
    setPose(fig, 'kneelup');
    await tween(fig.c, { alpha: 1 }, 250);
    return undefined;
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
    offerQueue.length = 0;
    updateQueueBadge();
    spotlights.length = 0;
    figures.splice(0).forEach((f) => f.c.destroy({ children: true }));
    slots.forEach((slot) => { slot.owner = null; });
    vipSlots.forEach((slot) => { slot.owner = null; });
    layers.top.removeChildren().forEach((c) => c.destroy({ children: true }));
    layers.fx.removeChildren().forEach((c) => c.destroy({ children: true }));
    particles.length = 0;
    tweens.splice(0).forEach((t) => t.resolve());
    drawBoard([]);
    setTimeout(settleAmbient, 600); // the scene is empty again: the anonymous crowd stands back up
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

  // ---- ambient crowd ---------------------------------------------------------
  // Anonymous disciples fill the hall to the level set in the admin, so it looks full even with few viewers.
  // They only stand and kneel with everyone else; real viewers take free places among them.
  let ambientTarget = 0;
  let ambientTimer = null;

  function ambientCount() { return figures.filter((f) => f.ambient).length; }

  function settleAmbient() {
    clearTimeout(ambientTimer);
    const have = ambientCount();
    if (have < ambientTarget) {
      const fig = makeFigure('Phật tử', null, CENTER_X, H - 20);
      fig.ambient = true;
      fig.fresh = false;
      const place = claimSlot(fig);
      fig.c.position.set(place.x, place.y);
      fig.c.alpha = 0;
      tween(fig.c, { alpha: 1 }, 500);
      ambientTimer = setTimeout(settleAmbient, 40); // arrive one after another, not all in one frame
    } else if (have > ambientTarget) {
      const extra = figures.find((f) => f.ambient && !f.busy);
      if (extra) removeFigure(extra);
      ambientTimer = setTimeout(settleAmbient, 20);
    }
  }

  function setAmbientCrowd(n) {
    ambientTarget = Math.max(0, Math.min(Number(n) || 0, slots.length - 20));
    settleAmbient();
  }

  // ---- event wiring --------------------------------------------------------
  const NARRATION = {
    huong: 'dâng hương, cầu bình an',
    buc: 'lên bục đệm xám, quỳ lạy sát đất',
    tambao: 'lên bục đỏ Tam Bảo, tặng công đức',
    hoadang: 'thả đèn hoa đăng, nỗ thẻ quẻ Đại Cát',
  };

  // A newly created disciple enters from the foot of the hall and walks up to their standing place.
  function welcome(fig) {
    if (!fig.fresh || fig.busy) return;
    fig.fresh = false;
    const s = claimSlot(fig);
    showLabel(fig, 4000);
    fig.arriving = walkTo(fig, s.x, s.y).catch(() => {}).finally(() => { fig.arriving = null; });
  }

  function onOverlayEvent(ev) {
    const queued = ev.type === 'gift' && ev.tier && ev.tier !== 'phaphoi'; // a queued gift speaks when its turn comes
    if (ev.speech && !queued) enqueueSpeech(ev.speech);
    switch (ev.type) {
      case 'gift':
        if (ev.tier === 'phaphoi') { festival(ev.user).catch(() => {}); break; }
        if (ev.tier) queueOffer(ev);
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
    socket.on('leaderboard', (rows) => {
      const first = vipSlots.length; // the cushions take ranks 1-6, the board lists the next four
      drawBoard(rows.slice(first, first + 4), first + 1);
      applyVipRanks(rows);
    });
    socket.on('music', applyMusicSettings);
    socket.on('ambient', setAmbientCrowd);
  });
})();
