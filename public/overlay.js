/* Temple overlay — 1080x1920 PixiJS scene driven by Socket.IO events.
 * Visuals are placeholder vector art. Drop real images into public/assets/ (see README). */
(() => {
  const W = 1080, H = 1920;
  const CENTER_X = W / 2;
  // ?lite=1 is for streaming through TikTok LIVE Studio or a weak machine: no antialiasing, 30 frames a second, a smaller
  // background and far fewer disciples on screen, so the page stays smooth and the encoder spends its bits on what matters.
  const LITE = new URLSearchParams(location.search).get('lite') === '1';
  const MAX_FIGURES = LITE ? 60 : 600; // a safety cap for the renderer, above the number of standing places; beyond it the oldest idle disciple is retired
  const LITE_AMBIENT_MAX = 30; // ambient crowd cap in lite mode

  const app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: !LITE });
  if (LITE) app.ticker.maxFPS = 30;
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
  const CAMERA_SETTLE_MS = 150; // smaller = snappier moves
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
      const tex = await PIXI.Assets.load(LITE ? '/assets/background-lite.jpg' : '/assets/background.png');
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
  // Which outfits are loaded: 'devotee' (grey), 'devotee-white' and 'brown' are what the crowd wears (one picked at random per
  // disciple); 'pink' is
  // worn only by the top six on the cushions, and a disciple changes into or out of it as the ranking moves them.
  // ?outfits=brown on the overlay address restricts the cast without touching any file.
  const VIP_OUTFIT = 'pink';
  let chatWalkSpeed = 420;
  let OUTFITS = [];
  async function chooseOutfits() {
    const asked = new URLSearchParams(location.search).get('outfits');
    let list = asked || 'devotee,devotee-white,brown,pink';
    try {
      const config = await (await fetch('/api/config')).json();
      if (!asked && config.colorOutfits === false) list = 'devotee';
      if (Number.isFinite(config.chatWalkSpeed) && config.chatWalkSpeed > 0) chatWalkSpeed = config.chatWalkSpeed;
    } catch (_) { /* keep the defaults */ }
    OUTFITS = list.split(',').map((o) => o.trim()).filter(Boolean);
  }
  // front poses face the camera; *up poses are seen from behind, facing the Buddha
  // Extra frames some casts have: walkup2 (the other foot), settle (sinking onto the knees), bowa/bowb/bowc (the steps of
  // a bow down to the floor). A cast without them just goes straight between kneelup and bowup.
  const POSES = ['kneel', 'stand', 'walk', 'bow', 'kneelup', 'walkup', 'bowup', 'walkup2', 'settle', 'bowa', 'bowb', 'bowc'];
  const POSE_HEIGHT = { kneel: 120, stand: 140, walk: 140, bow: 105 };
  const baseOf = (pose) => pose.replace(/up2?$/, '');
  // A cast whose frames all share one scale (its pose images are cut from one drawing size) is drawn at this many
  // design pixels per image pixel, instead of the per-pose heights above.
  const PIXEL_SCALE = { devotee: 1.2, 'devotee-white': 0.55, brown: 0.55, pink: 0.55 }; // white, brown and pink are cut ~2x larger than devotee (scripts/cut-white-bg.py, cut-green-bg.py)
  const TEX = {}; // TEX[outfit][pose]
  const FIGURE_NEAR = 1.0, FIGURE_FAR = 0.62; // size at the bottom / top of the carpet

  async function loadSprites() {
    await chooseOutfits();
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

  // On-screen height of one frame. A cast cut at one scale is drawn at its image height times its scale, except that the
  // frames of the bow are never drawn taller than the kneeling frame and at most BOW_MAX_WIDER times as wide. The pink and
  // brown bow frames were drawn much bulkier than their slim kneel (up to 17% taller and 49% wider for pink), so the
  // disciple visibly swelled the moment it bowed; the grey cast, whose bow and kneel match, is unaffected.
  const BOW_MAX_WIDER = 1.15; // a bow may spread its arms a little
  function drawHeight(outfit, pose, tex, real) {
    if (!PIXEL_SCALE[outfit]) return POSE_HEIGHT[real ? baseOf(pose) : 'kneel'];
    const k = PIXEL_SCALE[outfit];
    let h = tex.height * k;
    const kneeling = TEX[outfit].kneelup || TEX[outfit].kneel;
    if (/^bow/.test(pose) && kneeling) {
      h = Math.min(h, kneeling.height * k);
      const maxW = kneeling.width * k * BOW_MAX_WIDER;
      if (tex.width / tex.height * h > maxW) h = maxW * tex.height / tex.width;
    }
    return h;
  }
  window.__poseSize = (outfit, pose) => { // debug handle for tests: on-screen size of one frame
    const tex = TEX[outfit] && TEX[outfit][pose];
    if (!tex) return null;
    const h = drawHeight(outfit, pose, tex, true);
    return { h, w: h * tex.width / tex.height };
  };

  function setPose(fig, pose) {
    const set = TEX[fig.outfit];
    const base = baseOf(pose);
    // Missing pose: reuse the kneel sprite that faces the same way (back view for *up poses).
    const real = !!(set[pose] || set[base]);
    const tex = set[pose] || set[base] || (pose.endsWith('up') && set.kneelup) || set.kneel;
    const h = drawHeight(fig.outfit, pose, tex, real);
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

  // ?names=1 keeps every name on screen, to see how a full hall reads. The simulated crowd gets made-up names for it.
  const NAMES_ALWAYS = new URLSearchParams(location.search).get('names') === '1';
  let nameFontSize = 16; // NAME_FONT_SIZE in the server's .env
  let namePlateOpacity = 0.78; // NAME_PLATE_OPACITY in the server's .env: the black box behind a name
  let nameShowMs = 0; // NAME_SHOW_SECONDS in the server's .env; 0 = each moment keeps its own time (see showLabel)
  const FAKE_NAMES = ['Minh Anh', 'Thanh Dat', 'Ngọc Huyền', 'Quá Nguyễn', 'din', 'Little Duck Trades', 'Hoàng Long', 'Bảo Châu', 'Nguyễn Thị Thanh Hương',
    'An Nhiên', 'Tâm An', 'Lan Phương', 'Đức Anh', 'Thu Hà', 'Phúc', 'Mai', 'Gia Bảo', 'Cô Ba Sài Gòn', 'Trần Văn Hiếu', 'Kim Ngân',
    'Hạnh Phúc', 'Quang Vinh', 'Diệu Linh', 'Tuấn Kiệt', 'Hồng Nhung', 'Bình An', 'Thiện Tâm', 'Như Ý', 'Khánh Vy', 'Sen Vàng'];
  const fakeName = () => FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];

  function makeFigure(name, userId, x, y) {
    const c = new PIXI.Container();
    const shadow = new PIXI.Graphics().beginFill(0x000000, 0.35).drawEllipse(0, 2, 40, 10).endFill();
    const outfits = Object.keys(TEX);
    const crowdOutfits = outfits.filter((o) => o !== VIP_OUTFIT);
    const pool = crowdOutfits.length ? crowdOutfits : outfits;
    const outfit = pool[Math.floor(Math.random() * pool.length)];
    const body = new PIXI.Sprite(TEX[outfit].kneel);
    body.anchor.set(0.5, 1);
    const label = new PIXI.Text(name, { fontFamily: 'Arial', fontSize: nameFontSize, fontWeight: '700', fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 });
    label.anchor.set(0.5, 1);
    label.visible = NAMES_ALWAYS; // names stay hidden in the crowd; see showLabel
    // a black rounded plate behind the name so it reads against any background; it follows the label (see stepIdle)
    const labelBg = new PIXI.Graphics();
    labelBg.visible = false;
    c.addChild(shadow, body, labelBg, label);
    c.position.set(x, y);
    c.zIndex = y;
    const fig = {
      c, body, label, labelBg, name, userId, busy: false, phase: Math.random() * 6, baseY: y,
      outfit, crowdOutfit: outfit, jitter: 0.92 + Math.random() * 0.16, heroScale: 1, vipScale: 1, vipRank: null,
    };
    setPose(fig, 'kneelup');
    c.scale.set(perspective(y) * fig.jitter);
    figures.push(fig);
    layers.figures.addChild(c);
    trimFigures();
    return fig;
  }

  // The crowd is too dense for every name to be readable, so a name only shows while its owner is doing something.
  // ms = 0 means the name stays (a whole prayer, a cushion). A timed name uses NAME_SHOW_SECONDS when it is set.
  function showLabel(fig, ms) {
    fig.label.visible = true;
    clearTimeout(fig.labelTimer);
    const hideAfter = ms > 0 && nameShowMs > 0 ? nameShowMs : ms;
    if (hideAfter > 0 && !NAMES_ALWAYS) fig.labelTimer = setTimeout(() => { if (!fig.c.destroyed && !fig.busy && !fig.vipRank) fig.label.visible = false; }, hideAfter);
  }

  function setLabelConfig(cfg) {
    nameFontSize = Math.min(48, Math.max(10, Math.round(Number(cfg && cfg.fontSize)) || 16));
    nameShowMs = Math.max(0, Number(cfg && cfg.showSeconds) || 0) * 1000;
    const op = Number(cfg && cfg.plateOpacity);
    namePlateOpacity = Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : 0.78;
    figures.forEach((f) => { f.label.style.fontSize = nameFontSize; f.plateText = null; }); // the plate behind the name is redrawn at the new width
  }

  function trimFigures() {
    while (figures.length > MAX_FIGURES) {
      const idx = figures.findIndex((f) => !f.busy && !f.vipRank);
      if (idx < 0) return;
      removeFigure(figures[idx]);
    }
  }

  function removeFigure(fig) {
    stopRoaming(fig);
    fig.chatUntil = 0;
    const i = figures.indexOf(fig);
    if (i >= 0) figures.splice(i, 1);
    releaseSlot(fig);
    tween(fig.c, { alpha: 0 }, 500).then(() => fig.c.destroy({ children: true }));
  }

  const LABEL_PAD_X = 9, LABEL_PAD_Y = 3, LABEL_RADIUS = 9;
  function syncLabelPlate(f) {
    const plate = f.labelBg;
    plate.visible = f.label.visible;
    if (!plate.visible) return;
    if (f.plateText !== f.label.text) { // redraw only when the name changed
      f.plateText = f.label.text;
      const w = f.label.width + LABEL_PAD_X * 2, h = f.label.height + LABEL_PAD_Y * 2;
      plate.clear().beginFill(0x000000, namePlateOpacity).drawRoundedRect(-w / 2, -h + LABEL_PAD_Y, w, h, LABEL_RADIUS).endFill();
    }
    plate.y = f.label.y;
  }

  function stepIdle() {
    const now = performance.now();
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      f.c.scale.set(perspective(f.c.y) * f.jitter * f.heroScale * f.vipScale);
      f.c.zIndex = f.c.y;
      syncLabelPlate(f);
      let tilt = 0, hop = 0;
      if (f.base === 'walk') {
        const set = TEX[f.outfit];
        const step = (now - f.walkStartedAt) / 170;
        const pose = set.walkup2 && Math.floor(step) % 2 ? 'walkup2' : 'walkup';
        if (f.pose !== pose) setPose(f, pose);
        tilt = Math.sin(step * Math.PI) * 0.025;
        hop = -Math.abs(Math.sin(step * Math.PI)) * (f.fallback ? 12 : 2);
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
  const AISLE_LEFT = 420, AISLE_RIGHT = 690;
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
      // Leave room for the whole sprite, not just its anchor, on either side of the aisle.
      const halfWidth = SLOT_SPACING * k / 2;
      if (x <= W - SLOT_MARGIN_X && (x + halfWidth <= AISLE_LEFT || x - halfWidth >= AISLE_RIGHT)) slots.push({ x, y, owner: null });
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
    if (fig) { fig.leaving = false; fig.lastSeen = performance.now(); return fig; }
    const fig2 = makeFigure(name, userId, CENTER_X + (Math.random() - 0.5) * 160, H - 20);
    fig2.fresh = true;
    fig2.lastSeen = performance.now();
    return fig2;
  }

  // ---- fortune sticks (xin xăm / gieo quẻ) ----------------------------------------------------------
  // Fortune gifts shake the jar before revealing their card. Each draw, including its animation, takes its turn.
  // The jar belongs to the hall so it follows the camera; the HTML card scales with the overlay frame.
  const FORTUNE_CARD_MS = 5000, FORTUNE_MAX_WAITING = 5, FORTUNE_SHAKE_MS = 1800;
  const FORTUNE_JAR = { x: 978, y: 895, height: 230 * 1.5, tilt: 0.14, sway: 9, lift: 6, cycleMs: 220 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fortuneQueue = [];
  let fortuneBusy = false, fortuneGeneration = 0, fortuneShaking = false, fortuneShakeStarted = 0;
  let fortuneJar = null;
  const fortuneRattle = new Audio('/assets/fortune-rattle.mp3');
  fortuneRattle.preload = 'auto';
  fortuneRattle.loop = true;
  fortuneRattle.volume = 0.55;

  function stopFortuneRattle() {
    fortuneRattle.pause();
    fortuneRattle.currentTime = 0;
  }

  function playFortuneRattle() {
    if (MUTED || !fortuneShaking) return;
    // An autoplay unlock during a shake joins the current beat instead of replaying the beginning.
    fortuneRattle.currentTime = Math.min((performance.now() - fortuneShakeStarted) / 1000, FORTUNE_SHAKE_MS / 1000);
    fortuneRattle.play().then(() => {
      if (!fortuneShaking) stopFortuneRattle();
    }).catch((error) => {
      if (error.name === 'NotAllowedError') showUnlockHint();
      else if (error.name !== 'AbortError') console.warn('[fortune] Không phát được tiếng lắc xăm:', error.message);
    });
  }
  const fortuneJarReady = PIXI.Assets.load('/assets/xam-transparent.png').then((texture) => {
    fortuneJar = new PIXI.Sprite(texture);
    fortuneJar.anchor.set(0.5, 1);
    fortuneJar.scale.set(FORTUNE_JAR.height / texture.height);
    fortuneJar.position.set(FORTUNE_JAR.x, FORTUNE_JAR.y);
    layers.floor.addChild(fortuneJar);
  }).catch((error) => console.warn('Không tải được hình hũ xăm:', error));

  function settleFortuneJar() {
    fortuneShaking = false;
    stopFortuneRattle();
    if (!fortuneJar) return;
    fortuneJar.rotation = 0;
    fortuneJar.position.set(FORTUNE_JAR.x, FORTUNE_JAR.y);
  }

  app.ticker.add(() => {
    if (!fortuneJar || !fortuneShaking || reducedMotion.matches) return;
    const elapsed = performance.now() - fortuneShakeStarted;
    const progress = Math.min(1, elapsed / FORTUNE_SHAKE_MS);
    const strength = Math.sin(progress * Math.PI);
    const wave = Math.sin(elapsed / FORTUNE_JAR.cycleMs * Math.PI * 2);
    fortuneJar.rotation = wave * strength * FORTUNE_JAR.tilt;
    fortuneJar.x = FORTUNE_JAR.x + wave * strength * FORTUNE_JAR.sway;
    fortuneJar.y = FORTUNE_JAR.y - Math.abs(wave) * strength * FORTUNE_JAR.lift;
  });
  const fortuneCard = document.createElement('div');
  fortuneCard.style.cssText = 'position:absolute;left:90px;width:900px;top:690px;box-sizing:border-box;padding:34px 44px;text-align:center;' +
    'background:linear-gradient(180deg,#fff5dc,#f5deb3);color:#3b0d09;border:6px solid #8c1812;outline:3px solid #d9a93a;border-radius:24px;' +
    'font-family:"Noto Serif",Georgia,serif;opacity:0;transform:scale(0.92);transition:opacity .35s ease,transform .35s ease;pointer-events:none;z-index:30';
  stageEl.appendChild(fortuneCard);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderFortune(ev) {
    const f = ev.fortune;
    fortuneCard.innerHTML =
      `<div style="display:inline-block;background:#8c1812;color:#ffe08a;font-weight:800;font-size:26px;padding:6px 26px;border-radius:999px;letter-spacing:2px;margin-bottom:14px">${esc(f.rank.toUpperCase())}</div>` +
      `<div style="font-size:38px;font-weight:900;color:#6b0f0a;margin-bottom:8px">Quẻ số ${esc(f.number)} — ${esc(f.title)}</div>` +
      `<div style="font-size:24px;font-weight:700;color:#8c2d19;margin-bottom:18px">Thí chủ cầu quẻ: ${esc(ev.user)}</div>` +
      `<div style="font-size:28px;font-weight:700;line-height:1.55;background:rgba(140,24,18,.08);border-top:2px dashed rgba(140,24,18,.35);border-bottom:2px dashed rgba(140,24,18,.35);padding:18px 20px;white-space:pre-line;margin-bottom:18px">${esc(f.poem)}</div>` +
      `<div style="font-size:23px;line-height:1.45;font-weight:600">Lời bàn: ${esc(f.meaning)}</div>`;
  }

  async function pumpFortune() {
    if (fortuneBusy) return;
    fortuneBusy = true;
    const generation = fortuneGeneration;
    await fortuneJarReady;
    if (generation !== fortuneGeneration) return;
    while (fortuneQueue.length && generation === fortuneGeneration) {
      const ev = fortuneQueue.shift();
      // Let the preceding ceremony finish and the camera return to the whole hall.
      while (onStage || spotlights.length || camera.zoom > 1.01) {
        await wait(50);
        if (generation !== fortuneGeneration) return;
      }
      fortuneShaking = true;
      fortuneShakeStarted = performance.now();
      playFortuneRattle();
      await wait(FORTUNE_SHAKE_MS);
      if (generation !== fortuneGeneration) return;
      settleFortuneJar();
      // Announce the result only once the jar has finished shaking.
      if (ev.speech) enqueueSpeech(ev.speech);
      showBanner(`${ev.user} đã xin được quẻ xăm ${ev.fortune.rank} 🎋`, 2800);
      renderFortune(ev);
      fortuneCard.style.opacity = '1';
      fortuneCard.style.transform = 'scale(1)';
      await wait(FORTUNE_CARD_MS);
      if (generation !== fortuneGeneration) return;
      fortuneCard.style.opacity = '0';
      fortuneCard.style.transform = 'scale(0.92)';
      await wait(400);
      if (generation !== fortuneGeneration) return;
      // The matching gift stays queued until its complete fortune reveal has finished.
      const index = offerQueue.findIndex((entry) => entry.userId === ev.userId && entry.fortunePending);
      if (index >= 0) {
        const entry = offerQueue.splice(index, 1)[0];
        updateQueueBadge();
        await playOffer(entry);
        if (generation !== fortuneGeneration) return;
      }
    }
    fortuneBusy = false;
    pumpOffers();
  }

  function resetFortunes() {
    fortuneGeneration++;
    fortuneQueue.length = 0;
    fortuneBusy = false;
    settleFortuneJar();
    fortuneCard.style.opacity = '0';
    fortuneCard.style.transform = 'scale(0.92)';
  }

  function offerFortune(ev) {
    if (!ev.fortune) return;
    if (fortuneQueue.length >= FORTUNE_MAX_WAITING) {
      // A full card queue must not strand the associated gift's prayer.
      const entry = offerQueue.find((entry) => entry.userId === ev.userId);
      if (entry) entry.fortunePending = false;
      pumpOffers();
      return;
    }
    fortuneQueue.push(ev);
    pumpFortune().catch(() => { fortuneBusy = false; });
  }
  window.__fortune = () => ({ waiting: fortuneQueue.length, busy: fortuneBusy, shaking: fortuneShaking,
    jar: fortuneJar && { x: fortuneJar.x, y: fortuneJar.y, rotation: fortuneJar.rotation, height: fortuneJar.height },
    rattle: { paused: fortuneRattle.paused, time: fortuneRattle.currentTime, ready: fortuneRattle.readyState },
    shown: fortuneCard.style.opacity === '1', title: fortuneCard.textContent.slice(0, 60) }); // debug handle for tests

  // ---- people leaving ---------------------------------------------------------------------------
  // A viewer who leaves the room loses their disciple. The top six on the cushions stay (they are on the ranking), and so
  // does anyone with a prayer on stage or waiting in the queue; those go once they are free. Ambient figures are not people.
  const isReal = (f) => !f.ambient && f.userId;
  const inPrayer = (f) => f.busy || (onStage && onStage.userId === f.userId) || offerQueue.some((e) => e.userId === f.userId);

  function markLeaving(userId) {
    const fig = figures.find((f) => f.userId === userId);
    if (fig && isReal(fig)) fig.leaving = true;
  }

  // TikTok seldom announces departures, but it does report how many people are in the room. If more of our disciples
  // stand in the hall than there are viewers, the ones who have been silent the longest are taken to have left.
  function reconcileViewers(count) {
    if (!(count >= 0)) return;
    const real = figures.filter((f) => isReal(f) && !f.leaving);
    const excess = real.length - count;
    if (excess <= 0) return;
    real.filter((f) => !f.vipRank).sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0)).slice(0, excess).forEach((f) => { f.leaving = true; });
  }

  window.__names = () => figures.filter(isReal).map((f) => { // debug handle for tests
    const drawn = f.labelBg.geometry.graphicsData; // what the plate is really filled with
    return { user: f.name, visible: f.label.visible, size: f.label.style.fontSize, plateAlpha: drawn.length ? drawn[0].fillStyle.alpha : null };
  });
  window.__bubbles = () => figures.filter((f) => f.bubble && !f.bubble.destroyed).map((f) => { // debug handle for tests
    const p = f.labelBg.getBounds(), b = f.bubbleBox;
    return { user: f.name, plateVisible: f.labelBg.visible, plate: { x: p.x, y: p.y, w: p.width, h: p.height }, bubble: { x: f.bubble.x - b.w / 2, y: f.bubble.y - b.h / 2, w: b.w, h: b.h } };
  });
  window.__crowd =() => figures.filter(isReal).map((f) => ({ user: f.name, leaving: !!f.leaving, vip: f.vipRank || 0 })); // debug handle for tests

  setInterval(() => {
    for (const f of figures.slice()) {
      if (f.leaving && !f.vipRank && !inPrayer(f)) removeFigure(f);
    }
  }, 1000);

  function cancelWalk(fig) {
    fig.walkVersion = (fig.walkVersion || 0) + 1;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.target === fig.c && ('x' in tw.props || 'y' in tw.props)) {
        tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }

  async function walkTo(fig, x, y, speed = 260, maxMs = Infinity) {
    cancelWalk(fig);
    const version = fig.walkVersion;
    const dx = x - fig.c.x, dy = y - fig.c.y;
    if (Math.hypot(dx, dy) < 1) { setPose(fig, 'kneelup'); return; }
    const ms = Math.min(maxMs, Math.max(600, (Math.hypot(dx, dy) / speed) * 1000));
    // All bundled outfits have these two back-view steps. Reuse them for every direction,
    // including sideways and the trip home, instead of falling back to a kneeling sprite.
    fig.walkStartedAt = performance.now();
    setPose(fig, 'walkup');
    await tween(fig.c, { x, y }, ms, ease.inOut);
    if (fig.c.destroyed || version !== fig.walkVersion) return;
    fig.baseY = y;
    setPose(fig, 'kneelup');
  }

  function stopRoaming(fig) {
    fig.roamVersion = (fig.roamVersion || 0) + 1;
    if (fig.roaming) cancelWalk(fig);
    fig.roaming = false;
  }

  // A new message extends the wandering window. Gifts take priority over wandering.
  function roamOnChat(fig, newMessage = false) {
    if (fig.busy) { if (newMessage) fig.pendingChat = true; return; }
    if (newMessage) fig.chatUntil = performance.now() + 5000;
    if (fig.roaming || fig.c.destroyed || !(fig.chatUntil > performance.now())) return;
    if (fig.fresh) { fig.fresh = false; claimSlot(fig); }
    const version = fig.roamVersion = (fig.roamVersion || 0) + 1;
    fig.roaming = true;
    cancelWalk(fig);
    const active = () => !fig.c.destroyed && fig.roamVersion === version && !fig.busy;
    (async () => {
      if (fig.arriving) await fig.arriving;
      if (!active()) return;
      while (active() && performance.now() < fig.chatUntil - 1000) {
        const home = claimSlot(fig);
        const returnMs = Math.hypot(home.x - fig.c.x, home.y - fig.c.y) * 1000 / chatWalkSpeed;
        const legMs = Math.min(1000, (fig.chatUntil - performance.now() - returnMs - 100) / 2);
        if (legMs < 600) break; // leave enough time to walk home at the configured speed
        const x = 100 + Math.random() * (W - 200);
        const y = Math.min(FLOOR_BOTTOM - 40, Math.max(FLOOR_TOP + 30, (fig.slot?.y || fig.c.y) + (Math.random() - 0.5) * 200));
        const dx = x - fig.c.x, dy = y - fig.c.y;
        const ratio = Math.min(1, chatWalkSpeed * legMs / (1000 * Math.max(1, Math.hypot(dx, dy))));
        await walkTo(fig, fig.c.x + dx * ratio, fig.c.y + dy * ratio, chatWalkSpeed);
        await wait(16); // very small speeds can produce a sub-pixel trip; still yield to the renderer
      }
      if (!active()) return;
      // The final destination always belongs to the two sides (or the user's VIP cushion).
      const home = claimSlot(fig);
      const remaining = Math.max(1, fig.chatUntil - performance.now());
      const distance = Math.hypot(home.x - fig.c.x, home.y - fig.c.y);
      if (distance < 1) await wait(remaining);
      else await walkTo(fig, home.x, home.y, distance * 1000 / remaining, remaining);
      if (active()) {
        fig.roaming = false;
        if (fig.chatUntil > performance.now() + 1000) roamOnChat(fig);
      }
    })().catch(() => { if (fig.roamVersion === version) fig.roaming = false; });
  }

  // A cast with the bow frames goes down to the floor in steps (hands to the forehead, half bow, hands on the floor, flat)
  // and comes back up the same way; a cast without them jumps between kneeling and prostrate.
  const PROSTRATE_DOWN = ['bowa', 'bowb', 'bowc', 'bowup'];
  const PROSTRATE_UP = ['bowc', 'bowb', 'bowa', 'kneelup'];
  const hasBowFrames = (fig) => !!TEX[fig.outfit].bowa;
  async function playPoses(fig, poses, gap = 80) {
    for (const pose of poses) { setPose(fig, pose); await wait(gap); }
  }

  // deep = full prostration; otherwise upright kneeling with palms together
  async function kneel(fig, deep = false) {
    fig.body.rotation = 0;
    if (deep) {
      if (hasBowFrames(fig)) await playPoses(fig, PROSTRATE_DOWN); else setPose(fig, 'bowup');
      return;
    }
    if (TEX[fig.outfit].settle) { setPose(fig, 'settle'); await wait(100); }
    setPose(fig, 'kneelup');
  }
  async function stand(fig) { setPose(fig, 'stand'); await wait(350); }
  async function bow(fig, times = 3) {
    for (let i = 0; i < times; i++) {
      if (hasBowFrames(fig)) {
        await playPoses(fig, PROSTRATE_DOWN);
        await wait(350);
        await playPoses(fig, PROSTRATE_UP);
        await wait(200);
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
    // The bubble takes the place of the black name plate: it is as wide as the plate (or wider) and its bottom edge is level
    // with the plate's, so the plate is hidden behind it and the tail points at the head. The bubble is not scaled with the
    // disciple, so the plate's size on screen is worked out here.
    const plateW = (fig.label.width + LABEL_PAD_X * 2) * Math.abs(fig.c.scale.x) + 8;
    const plateH = (fig.label.height + LABEL_PAD_Y * 2) * Math.abs(fig.c.scale.y) + 6;
    const w = Math.max(t.width + 24, plateW), h = Math.max(t.height + 16, plateH);
    const bubble = new PIXI.Container();
    const bg = new PIXI.Graphics().lineStyle(2, 0x999999).beginFill(0xffffff, 0.96).drawRoundedRect(-w / 2, -h / 2, w, h, 12).endFill();
    bg.beginFill(0xffffff, 0.96).drawPolygon([-8, h / 2 - 1, 8, h / 2 - 1, 0, h / 2 + 12]).endFill();
    bubble.addChild(bg, t);
    const place = () => {
      bubble.x = fig.c.x;
      bubble.y = fig.c.y + (fig.label.y + LABEL_PAD_Y) * fig.c.scale.y + 3 - h / 2; // 3 px below the plate's bottom edge
    };
    place();
    bubble.zIndex = 99999;
    layers.top.addChild(bubble);
    fig.bubble = bubble;
    fig.bubbleBox = { w, h };
    const follow = () => {
      if (bubble.destroyed) return app.ticker.remove(follow);
      place();
    };
    app.ticker.add(follow);
    setTimeout(() => { if (!bubble.destroyed) tween(bubble, { alpha: 0 }, 400).then(() => bubble.destroy({ children: true })); }, 5000);
  }

  // ---- leaderboard ---------------------------------------------------------
  // The phone crops the 1080-wide canvas to roughly x 96..984 and TikTok's own buttons sit on the right edge, so the board
  // ends at x 970, inside that. Everything on the board scales with the size of the names.
  const BOARD_W = 270;
  const BOARD_NAME_SIZE = 24;
  const board = new PIXI.Container();
  board.position.set(W - BOARD_W - 110, 330); // right edge at x 970, leaving the Buddha's halo clear on the left
  layers.hud.addChild(board);
  // The board lists the people who just missed a cushion (ranks 7-10); the top six are on the cushions with their rank
  // on their name. With nobody to list it is hidden rather than shown empty.
  let boardHeight = 0;
  let boardState = { visible: false, rows: [] };
  const ROWS_TOP = 72;
  // vipScore is the score of the last cushion (rank 6). Equal scores rank by who got there first, so a challenger needs one
  // coin more than the gap: "need" is what it takes to move onto a cushion.
  function drawBoard(rows, firstRank = 1, vipScore = null) {
    board.removeChildren().forEach((c) => c.destroy({ children: true }));
    const N = BOARD_NAME_SIZE;
    const hintSize = Math.round(N * 0.78);
    const rowH = N + hintSize + 18;
    const shown = rows.length > 0;
    board.visible = shown;
    boardHeight = shown ? ROWS_TOP + rows.length * rowH + 6 : 0;
    const needOf = (r) => (vipScore == null ? null : Math.max(1, vipScore - r.score + 1));
    boardState = {
      visible: shown, vipScore, x: board.x, width: BOARD_W, nameSize: N,
      rows: rows.map((r, i) => ({ rank: firstRank + i, name: r.name, score: r.score, need: needOf(r) })),
    };
    positionQueueBadge();
    if (!shown) return;
    const bg = new PIXI.Graphics().lineStyle(3, 0xd9a93a).beginFill(0x3b0f0a, 0.9).drawRoundedRect(0, 0, BOARD_W, boardHeight, 10).endFill();
    const title = new PIXI.Text('TÂM LÒNG THÀNH', { fontFamily: 'Arial', fontSize: 25, fontWeight: '700', fill: 0xffe9a8 });
    title.anchor.set(0.5, 0); title.position.set(BOARD_W / 2, 10);
    board.addChild(bg, title);
    if (vipScore != null) {
      const mark = new PIXI.Text(`Đệm cuối (hạng ${firstRank - 1}) có ${vipScore} xu`, { fontFamily: 'Arial', fontSize: 17, fontWeight: '700', fill: 0xf5c518 });
      mark.anchor.set(0.5, 0); mark.position.set(BOARD_W / 2, 43);
      board.addChild(mark);
    }
    const dotR = Math.round(N * 0.62);
    const dotX = 14 + dotR;
    const nameX = dotX + dotR + 10;
    rows.forEach((r, i) => {
      const y = ROWS_TOP + i * rowH;
      const place = firstRank + i;
      const medal = [0xf5c518, 0xc0c0c0, 0xcd7f32][place - 1] || 0x888888;
      const midY = y + rowH / 2 - 2;
      const dot = new PIXI.Graphics().beginFill(medal).drawCircle(dotX, midY, dotR).endFill();
      const rank = new PIXI.Text(String(place), { fontFamily: 'Arial', fontSize: Math.round(N * 0.72), fontWeight: '700', fill: 0x222222 });
      rank.anchor.set(0.5); rank.position.set(dotX, midY);
      const sc = new PIXI.Text(String(r.score), { fontFamily: 'Arial', fontSize: Math.round(N * 0.92), fontWeight: '700', fill: 0xffe9a8 });
      sc.anchor.set(1, 0); sc.position.set(BOARD_W - 14, y + 6);
      const nm = new PIXI.Text(Array.from(r.name).slice(0, 14).join(''), { fontFamily: 'Arial', fontSize: N, fontWeight: '700', fill: 0xffffff });
      nm.position.set(nameX, y + 6);
      const room = BOARD_W - 14 - sc.width - 8 - nameX; // a long name is squeezed rather than running into the score
      if (nm.width > room) nm.scale.set(room / nm.width);
      board.addChild(dot, rank, nm, sc);
      const need = needOf(r);
      if (need != null) {
        const close = need <= 2; // one or two coins away: say so loudly
        const hint = new PIXI.Text(need === 1 ? 'Chỉ còn 1 xu là lên đệm!' : `còn ${need} xu để lên đệm`, { fontFamily: 'Arial', fontSize: hintSize, fontWeight: close ? '700' : '400', fill: close ? 0xffa24a : 0xd9c58a });
        hint.position.set(nameX, y + 6 + N + 3);
        const hintRoom = BOARD_W - 12 - nameX;
        if (hint.width > hintRoom) hint.scale.set(hintRoom / hint.width); // the longest sentence is squeezed to stay inside the frame
        board.addChild(hint);
      }
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

  // Walk visibly to the current slot, including downward and sideways moves.
  async function moveToSlot(fig) {
    const place = fig.slot;
    if (!place || fig.c.destroyed) return;
    await walkTo(fig, place.x, place.y, VIP_SPEED);
  }

  function relocate(fig) {
    if (fig.busy) return; // a prayer is going on: returnHome will use the new slot
    stopRoaming(fig);
    fig.arriving = (fig.arriving || Promise.resolve()).then(() => moveToSlot(fig)).catch(() => {}).finally(() => { fig.arriving = null; });
  }

  function setRankLook(fig, rank) {
    fig.vipRank = rank;
    const wear = rank && TEX[VIP_OUTFIT] ? VIP_OUTFIT : fig.crowdOutfit;
    if (fig.outfit !== wear) { fig.outfit = wear; setPose(fig, fig.pose); }
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

  window.__vips = () => vipSlots.map((s, i) => ({ rank: i + 1, owner: s.owner ? s.owner.name : null, outfit: s.owner ? s.owner.outfit : null, x: s.owner ? Math.round(s.owner.c.x) : null, y: s.owner ? Math.round(s.owner.c.y) : null, slotX: s.x })); // debug handle for tests

  // ---- gift choreography ---------------------------------------------------
  // A gift giver runs straight up to the altar and prays there while the camera holds the altar shot. Only one shot can
  // be on at a time, so gifts take their turn; if more than a few are waiting the extra ones just bow where they stand.
  const HERO_SCALE = 1.15; // drawn larger in the shot, as if closer to the camera
  const RUN_SPEED = 420; // design pixels per second; leave enough time to see the alternating footsteps
  // ---- the gift queue ------------------------------------------------------------------------
  // Only one gift can be on stage at a time, so the others wait their turn, under four simple rules:
  //  1. someone who is already waiting is not queued twice: their gifts are added up and the better tier is kept;
  //  2. bigger gifts go first, otherwise first come, first served;
  //  3. overflow ordinary prayers move into the aisle; milestone prayers retain their altar shot;
  //  4. ordinary prayers waiting too long also move into the aisle.
  // The banner and the spoken line start with the prayer itself, so what is said matches what is on screen.
  const OFFER_QUEUE_MAX = 5;
  const OFFER_MAX_WAIT_MS = Number(new URLSearchParams(location.search).get('queuewait')) || 25000; // ?queuewait=<ms> overrides it (for tests)
  const TIER_PRIORITY = { huong: 1, que: 2, buc: 3, tambao: 4, hoadang: 5, phaphoi: 6 };
  const offerQueue = [];
  let onStage = null;
  let queueBadge = null;

  const offerText = (e) => `${e.user} ${NARRATION[e.tier]} (x${e.count})`;

  function positionQueueBadge() {
    if (queueBadge) queueBadge.position.set(board.x + BOARD_W / 2, board.y + (boardHeight ? boardHeight + 10 : 0));
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
      waiting.altar = waiting.altar || ev.altar;
      waiting.fortunePending = waiting.fortunePending || ev.tier === 'que';
    } else {
      offerQueue.push({ user: ev.user, userId: ev.userId, tier: ev.tier, count: ev.count, altar: ev.altar, speech: ev.speech || null,
        fortunePending: ev.tier === 'que', queuedAt: Date.now() });
    }
    offerQueue.sort((x, y) => TIER_PRIORITY[y.tier] - TIER_PRIORITY[x.tier] || x.queuedAt - y.queuedAt); // rule 2
    trimOfferQueue();
    updateQueueBadge();
    pumpOffers();
  }

  function trimOfferQueue() {
    // Overflow prayers must wait too, or a promoted viewer could start a zoom during the draw.
    while (!fortuneBusy && offerQueue.length > OFFER_QUEUE_MAX) {
      const extra = offerQueue.findLastIndex((entry) => !entry.altar && !entry.fortunePending);
      if (extra < 0) break; // never discard an earned altar visit
      bowInPlace(offerQueue.splice(extra, 1)[0]);
    }
  }

  async function pumpOffers() {
    if (onStage || fortuneBusy) return;
    trimOfferQueue();
    while (offerQueue.length && !fortuneBusy) {
      if (offerQueue[0].fortunePending) return;
      const entry = offerQueue.shift();
      // Use the current cushion assignment too: ranks may change while a prayer waits.
      if (figures.some((f) => f.userId === entry.userId && f.vipRank)) entry.altar = true;
      updateQueueBadge();
      if (!entry.altar && Date.now() - entry.queuedAt > OFFER_MAX_WAIT_MS) { bowInPlace(entry); continue; }
      await playOffer(entry);
    }
  }

  async function playOffer(entry) {
    if (figures.some((f) => f.userId === entry.userId && f.vipRank)) entry.altar = true;
    onStage = entry;
    showBanner(offerText(entry), 4500);
    enqueueSpeech(entry.speech);
    try { await offer(entry.user, entry.userId, entry.tier, entry.altar); } catch (_) { /* the page was reset during the prayer */ }
    if (onStage === entry) onStage = null;
  }

  window.__queue = () => ({ onStage: onStage ? onStage.user : null, waiting: offerQueue.map((e) => ({ user: e.user, tier: e.tier, count: e.count })), hero: layers.hero.children.length }); // debug handle for tests
  window.__movement = () => ({
    aisle: { left: AISLE_LEFT, right: AISLE_RIGHT }, zoom: camera.zoom, chatWalkSpeed,
    bell: { paused: templeBell.paused, time: templeBell.currentTime, ready: templeBell.readyState },
    onStage: onStage && { user: onStage.user, altar: onStage.altar },
    figures: figures.map((f) => ({ user: f.name, userId: f.userId, x: f.c.x, y: f.c.y,
      home: f.slot && { x: f.slot.x, y: f.slot.y }, busy: f.busy, roaming: !!f.roaming, vip: f.vipRank,
      pose: f.pose, alpha: f.c.worldAlpha, outfit: f.outfit })),
  });

  async function prayInPlace(user, userId) {
    return offer(user, userId, 'huong', false);
  }

  async function offer(user, userId, tier, altar = true) {
    const fig = findOrCreateFigure(user, userId);
    if (fig.busy) return;
    altar = altar || !!fig.vipRank;
    stopRoaming(fig);
    fig.busy = true;
    showLabel(fig, 0); // the name stays up for the whole prayer
    let shot = null;
    try {
      claimSlot(fig); // the place to go home to
      if (fig.fresh) fig.fresh = false; // a newcomer simply runs up from the foot of the hall
      else if (fig.arriving) await fig.arriving; // already on the way in: let them arrive first, or two walks would fight
      if (altar) {
        layers.hero.addChild(fig.c);
        shot = spotlight(ALTAR_VIEW);
        await walkTo(fig, ALTAR_SPOT.x + (Math.random() - 0.5) * 20, ALTAR_SPOT.y, RUN_SPEED);
        tween(fig, { heroScale: HERO_SCALE / fig.vipScale }, 350);
      } else {
        const y = Math.min(1770, Math.max(1350, fig.c.y));
        await walkTo(fig, (AISLE_LEFT + AISLE_RIGHT) / 2, y, RUN_SPEED);
      }
      const headY = () => fig.c.y - fig.h * fig.c.scale.y * 0.9;
      const kneeling = kneel(fig, altar && (tier === 'buc' || tier === 'tambao'));
      if (altar) playTempleBell();
      await kneeling;
      if (!altar) {
        smoke(fig.c.x, headY());
        await bow(fig, 1);
      } else if (tier === 'huong' || tier === 'que' || tier === 'phaphoi') {
        for (let i = 0; i < 3; i++) { smoke(fig.c.x, headY()); await wait(250); }
        await bow(fig, 2);
        if (tier === 'phaphoi') festival(user).catch(() => {});
      } else if (tier === 'buc') {
        sparks(fig.c.x, headY(), 16);
        await wait(3000);
      } else if (tier === 'tambao') {
        sparks(fig.c.x, headY(), 40);
        flashBuddha();
        await wait(3500);
      } else if (tier === 'hoadang') {
        releaseLanterns(16);
        sparks(fig.c.x, headY(), 50);
        await wait(4000);
      }
    } finally {
      if (fig.pose === 'bowup' && hasBowFrames(fig)) await playPoses(fig, PROSTRATE_UP, 70); // get up before the camera leaves
      if (shot) endSpotlight(shot); // the camera pulls back and the crowd fades in
      tween(fig, { heroScale: 1 }, 400);
      await returnHome(fig);
      layers.figures.addChild(fig.c);
      fig.busy = false;
      showLabel(fig, 3000);
      resumeChat(fig);
    }
  }

  // Keep the figure visible throughout the return trip, even while the crowd fades back in.
  async function returnHome(fig) {
    const home = claimSlot(fig);
    await walkTo(fig, home.x, home.y, RUN_SPEED);
  }

  function flashBuddha() {
    const g = window.__buddhaGlow;
    tween(g.scale, { x: 1.5, y: 1.5 }, 500, ease.out).then(() => tween(g.scale, { x: 1, y: 1 }, 1200));
  }

  function resumeChat(fig) {
    const pending = fig.pendingChat;
    fig.pendingChat = false;
    if (pending || fig.chatUntil > performance.now()) roamOnChat(fig, pending);
  }

  async function festival(user) {
    showBanner(`🙏 ${user} khai Pháp Hội Vạn Phật — cả chùa đồng loạt quỳ lạy!`, 6000);
    flashBuddha();
    releaseLanterns(20);
    const crowd = figures.filter((f) => !f.busy);
    await Promise.all(crowd.map(async (f, i) => {
      stopRoaming(f);
      f.busy = true;
      await wait(i * 40);
      await kneel(f);
      await bow(f, 2);
      await wait(1500);
      setPose(f, 'kneelup');
      if (f.slot) await moveToSlot(f);
      f.busy = false;
      resumeChat(f);
    }));
  }

  function spawnCrowd(n) {
    for (let i = 0; i < n; i++) {
      const fig = makeFigure(fakeName(), null, CENTER_X, H - 20);
      const s = claimSlot(fig);
      fig.c.position.set(s.x, s.y);
    }
  }

  const NAMMO = ['nam mô a di đà phật', 'nam mô', 'a di đà phật', 'cầu bình an', '🙏🙏🙏'];
  async function nammo(n) {
    const pool = figures.filter((f) => !f.busy).sort(() => Math.random() - 0.5).slice(0, n);
    pool.forEach((f, i) => setTimeout(() => showBubble(f, NAMMO[Math.floor(Math.random() * NAMMO.length)]), i * 250));
    for (const f of pool) { stopRoaming(f); f.busy = true; kneel(f, true); }
    await wait(4500);
    for (const f of pool) { setPose(f, 'kneelup'); f.busy = false; if (f.slot) relocate(f); resumeChat(f); }
  }

  function resetScene() {
    stopTempleBell();
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
  const templeBell = new Audio('/assets/temple-bell.mp3');
  templeBell.preload = 'auto';
  templeBell.volume = 0.55;
  let templeBellBlocked = false;

  function stopTempleBell() {
    templeBellBlocked = false;
    templeBell.pause();
    templeBell.currentTime = 0;
  }

  function playTempleBell() {
    if (MUTED || !spotlights.length) return;
    templeBellBlocked = false;
    // Strike once when kneeling starts; let its resonance finish naturally without stacking clips.
    templeBell.currentTime = 0;
    templeBell.play().catch((error) => {
      if (error.name === 'NotAllowedError') { templeBellBlocked = true; showUnlockHint(); }
      else if (error.name !== 'AbortError') console.warn('[bell] Không phát được tiếng chuông chùa:', error.message);
    });
  }
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
    unlockHint.onclick = () => {
      unlockHint.remove(); unlockHint = null;
      pumpSpeech(); startMusic(); playFortuneRattle();
      if (templeBellBlocked) playTempleBell();
    };
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
      const fig = makeFigure(fakeName(), null, CENTER_X, H - 20);
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
    ambientTarget = Math.max(0, Math.min(Number(n) || 0, slots.length - 20, LITE ? LITE_AMBIENT_MAX : Infinity));
    settleAmbient();
  }

  // ---- event wiring --------------------------------------------------------
  const NARRATION = {
    huong: 'dâng hương, cầu bình an',
    que: 'xin xăm, cầu bình an',
    buc: 'lên bục đệm xám, quỳ lạy sát đất',
    tambao: 'lên bục đỏ Tam Bảo, tặng công đức',
    hoadang: 'thả đèn hoa đăng, nỗ thẻ quẻ Đại Cát',
    phaphoi: 'khai Pháp Hội Vạn Phật',
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
    const queued = (ev.type === 'gift' && ev.tier) || ev.type === 'fortune';
    if (ev.speech && !queued) enqueueSpeech(ev.speech);
    switch (ev.type) {
      case 'gift':
        if (ev.tier) queueOffer(ev);
        break;
      case 'chat': {
        const fig = findOrCreateFigure(ev.user, ev.userId);
        showBubble(fig, ev.text);
        roamOnChat(fig, true);
        break;
      }
      case 'join':
        welcome(findOrCreateFigure(ev.user, ev.userId));
        break;
      case 'fortune': offerFortune(ev); break;
      case 'leave': markLeaving(ev.userId); break;
      case 'viewers': reconcileViewers(ev.count); break;
      case 'share':
        showBanner(`${ev.user} đã chia sẻ buổi lễ 🙏`, 3500);
        break;
      case 'nammo': nammo(ev.count).catch(() => {}); break;
      case 'crowd': spawnCrowd(ev.count); break;
      case 'reset': speechQueue.length = 0; resetFortunes(); resetScene(); break;
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
      drawBoard(rows.slice(first, first + 4), first + 1, rows[first - 1] ? rows[first - 1].score : null);
      applyVipRanks(rows);
    });
    socket.on('label:config', setLabelConfig);
    socket.on('music', applyMusicSettings);
    socket.on('ambient', setAmbientCrowd);
  });
})();
