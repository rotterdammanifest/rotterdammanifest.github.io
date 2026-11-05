// bloodstream: soft red cells drifting past a bouncing emblem
(() => {
  const back = document.getElementById('cells');
  const front = document.getElementById('fore');
  const card = document.getElementById('card');
  const root = document.documentElement;
  const bg = back.getContext('2d');
  const fg = front.getContext('2d');
  if (!bg || !fg) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // numbers worth playing with
  const BEAT_EVERY = 6.5;      // seconds between heartbeats
  const SPEED = 0.07;          // emblem speed, in screen widths per second
  const MIN_CELLS = 12, MAX_CELLS = 220;
  const LAYERS = [             // far, middle, close-up (drawn over the card)
    { size: [0.010, 0.018], flow: 0.010, alpha: 0.55, sprite: 1 },
    { size: [0.022, 0.036], flow: 0.022, alpha: 0.95, sprite: 0 },
    { size: [0.070, 0.120], flow: 0.045, alpha: 0.22, sprite: 2 }
  ];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const canvasOf = (cw, ch) => Object.assign(document.createElement('canvas'), { width: cw, height: ch });

  let w = 0, h = 0, S = 0, dpr = 1, quality = 1;
  let haze, shade, cardBox = null;
  let cells = [], pulses = [];
  let lastBeat = -BEAT_EVERY + 0.6, dubAt = 0, env = 0, shownBeat = -1;
  let tX = -9, tY = -9;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false, t: 0 };
  const mark = { x: 0, y: 0, vx: 0, vy: 0, ew: 0, eh: 0, a: 0, under: 1, ratio: 1, body: null, glow: null, placed: false };

  // cells are shaded from a real red blood cell profile (a biconcave disc),
  // drawn once at load at a few tilt angles so tumbling looks solid
  const FRAMES = 13, N = 96, DISC = N * 0.38, PAD = N / 2 / DISC;
  const C0 = 0.2072, C1 = 2.0026, C2 = -1.1228;
  const half = p => 0.5 * Math.sqrt(1 - p * p) * (C0 + C1 * p * p + C2 * p ** 4);
  const slope = p => 0.5 * (-p / Math.sqrt(1 - p * p) * (C0 + C1 * p * p + C2 * p ** 4) + Math.sqrt(1 - p * p) * (2 * C1 * p + 4 * C2 * p ** 3));

  function makeSheets() {
    const sheet = canvasOf(N * FRAMES, N);
    const ln = Math.hypot(-0.45, -0.55, 0.7), lx = -0.45 / ln, ly = -0.55 / ln, lz = 0.7 / ln;   // light from the upper left
    const hx = lx, hy = ly, hz = lz + 1, hn = Math.hypot(hx, hy, hz);
    const RS = 140, AS = 300;
    const cosA = Array.from({ length: AS }, (_, j) => Math.cos(j / AS * 6.2832));
    const sinA = Array.from({ length: AS }, (_, j) => Math.sin(j / AS * 6.2832));

    for (let f = 0; f < FRAMES; f++) {
      const theta = f / (FRAMES - 1) * Math.PI / 2, ct = Math.cos(theta), st = Math.sin(theta);
      const px = new Uint8ClampedArray(N * N * 4), zb = new Float32Array(N * N).fill(-9);
      for (let i = 0; i < N * N; i++) px.set([150, 20, 26, 0], i * 4);

      for (let s = -1; s <= 1; s += 2) {                  // top and bottom face
        for (let i = 0; i < RS; i++) {
          const p = Math.sin((i + 0.5) / RS * Math.PI / 2), hh = half(p), hp = slope(p);
          const t = Math.min(1, hh / 0.33) ** 0.8;        // thick parts are darker
          for (let j = 0; j < AS; j++) {
            const cx = cosA[j], sy = sinA[j], y = p * sy, z = s * hh;
            let nx = -hp * cx, ny = -hp * sy, nz = s;
            const nl = Math.hypot(nx, ny, nz);
            nx /= nl; ny /= nl; nz /= nl;
            const NZ = ny * st + nz * ct;
            if (NZ <= 0) continue;                        // facing away
            const NY = ny * ct - nz * st, Z = y * st + z * ct;
            const k = ((N / 2 + (y * ct - z * st) * DISC) | 0) * N + ((N / 2 + p * cx * DISC) | 0);
            if (Z <= zb[k]) continue;
            zb[k] = Z;
            const diff = clamp((nx * lx + NY * ly + NZ * lz) * 0.5 + 0.5, 0, 1);
            const spec = Math.max(0, (nx * hx + NY * hy + NZ * hz) / hn) ** 40 * 0.8;
            const rim = (1 - NZ) ** 2.2 * 0.35, m = 0.28 + 0.9 * diff;
            px[k * 4] = (236 - 118 * t) * m + 255 * spec + 255 * rim;
            px[k * 4 + 1] = (76 - 66 * t) * m + 200 * spec + 60 * rim;
            px[k * 4 + 2] = (66 - 44 * t) * m + 190 * spec + 40 * rim;
            px[k * 4 + 3] = 255;
          }
        }
      }
      sheet.getContext('2d').putImageData(new ImageData(px, N, N), f * N, 0);
    }

    const soft = canvasOf(N * FRAMES, N), g = soft.getContext('2d');
    g.filter = 'blur(4px)';          // browsers without canvas blur just get a sharp copy
    g.drawImage(sheet, 0, 0);
    return [sheet, soft];
  }
  const [sharp, soft] = makeSheets();

  function tint(img, color) {
    const c = canvasOf(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  const img = new Image();
  img.onload = () => {
    mark.ratio = img.height / img.width;
    mark.body = tint(img, '#f7ece8');
    const red = tint(img, '#ff2630');
    const gl = canvasOf(img.width * 1.9, img.height * 1.9), g = gl.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.08;
    for (let k = 0; k < 12; k++) {
      const s = 1 + k * 0.05;
      g.drawImage(red, (gl.width - img.width * s) / 2, (gl.height - img.height * s) / 2, img.width * s, img.height * s);
    }
    mark.glow = gl;
    sizeMark();
    if (still) { mark.a = 1; draw(5); }
  };
  img.src = 'emblem.png';

  function sizeMark() {
    mark.ew = clamp(w * 0.2, 150, 300);
    mark.eh = mark.ew * mark.ratio;
    if (!mark.placed) {
      mark.placed = true;
      mark.x = w * rand(0.3, 0.7);
      mark.y = h * rand(0.3, 0.7);
      const v = SPEED * w;
      mark.vx = v * (Math.random() < 0.5 ? -1 : 1);
      mark.vy = v * 0.618 * (Math.random() < 0.5 ? -1 : 1);
    }
    mark.x = clamp(mark.x, mark.ew / 2, Math.max(mark.ew / 2, w - mark.ew / 2));
    mark.y = clamp(mark.y, mark.eh / 2, Math.max(mark.eh / 2, h - mark.eh / 2));
  }

  function spawn(layer, fresh) {
    const L = LAYERS[layer];
    return {
      layer, k: rand(L.size[0], L.size[1]),
      x: rand(0, w), y: rand(0, h), vx: 0, vy: 0, lit: 0,
      a: rand(0, 6.28), spin: rand(-0.6, 0.6), tilt: rand(0, 6.28), tspin: rand(0.3, 1.1),
      age: fresh ? 0 : 1, dying: 0
    };
  }

  function populate() {
    const n = clamp(Math.round(w * h / 15000), 36, 110);
    cells = [];
    for (let i = 0; i < n; i++) cells.push(spawn(i % 9 < 5 ? 0 : 1, false));
    for (let i = 0; i < 4; i++) cells.push(spawn(2, false));
  }

  function makeHaze() {
    const c = canvasOf(Math.ceil(w * 0.6), Math.ceil(h * 0.6)), g = c.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const x = rand(0, c.width), y = rand(0, c.height), r = S * 0.3 * rand(0.8, 1.6);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(150,14,24,${rand(0.14, 0.3)})`);
      grd.addColorStop(1, 'rgba(150,14,24,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  function makeShade() {
    const c = canvasOf(Math.ceil(w / 4), Math.ceil(h / 4)), g = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2;
    const grd = g.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.3, cx, cy, Math.hypot(cx, cy));
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.55, 'rgba(8,0,2,0.35)');
    grd.addColorStop(1, 'rgba(2,0,1,0.95)');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  const measureCard = () => { cardBox = card.getBoundingClientRect(); };

  function resize() {
    const ow = w, oh = h;
    w = innerWidth; h = innerHeight; S = Math.min(w, h);
    dpr = Math.min(devicePixelRatio || 1, 1.5) * quality;
    for (const cv of [back, front]) {
      cv.width = Math.max(1, w * dpr | 0);
      cv.height = Math.max(1, h * dpr | 0);
    }
    if (ow) cells.forEach(c => { c.x *= w / ow; c.y *= h / oh; });
    haze = makeHaze();
    shade = makeShade();
    sizeMark();
    measureCard();
    if (still && ow) draw(5);
  }

  function beat(t) {
    lastBeat = t;
    dubAt = t + 0.32;
    pulses.push({ x: mark.x || w / 2, y: mark.y || h / 2, t: 0, pow: 0.55, flare: false });
  }

  function update(dt, t) {
    // heartbeat: a quick double thump every few seconds
    if (t - lastBeat > BEAT_EVERY) beat(t);
    if (dubAt && t >= dubAt) { dubAt = 0; pulses.push({ x: mark.x, y: mark.y, t: 0, pow: 0.35, flare: false }); }
    const since = t - lastBeat;
    env = clamp(Math.exp(-((since / 0.09) ** 2)) + 0.65 * Math.exp(-(((since - 0.32) / 0.1) ** 2)), 0, 1);
    const e = Math.round(env * 50) / 50;
    if (e !== shownBeat) { shownBeat = e; root.style.setProperty('--beat', e); }

    // the emblem bounces like a dvd logo
    if (mark.body) {
      if (t > 1.2) mark.a = Math.min(1, mark.a + dt / 1.4);
      mark.x += mark.vx * dt; mark.y += mark.vy * dt;
      const hx = mark.ew / 2, hy = mark.eh / 2;
      let hitX = false, hitY = false;
      if (mark.x < hx) { mark.x = hx; mark.vx = Math.abs(mark.vx); hitX = true; }
      else if (mark.x > w - hx) { mark.x = w - hx; mark.vx = -Math.abs(mark.vx); hitX = true; }
      if (mark.y < hy) { mark.y = hy; mark.vy = Math.abs(mark.vy); hitY = true; }
      else if (mark.y > h - hy) { mark.y = h - hy; mark.vy = -Math.abs(mark.vy); hitY = true; }
      if (hitX) tX = t;
      if (hitY) tY = t;
      if (hitX || hitY) {
        const corner = Math.abs(tX - tY) < 0.12;
        pulses.push({ x: hitX ? (mark.vx > 0 ? 0 : w) : mark.x, y: hitY ? (mark.vy > 0 ? 0 : h) : mark.y, t: 0, pow: corner ? 1.4 : 0.35, flare: corner });
        if (corner) beat(t);
      }
      // dim it a little while it passes behind the text
      const over = cardBox && mark.x + hx * 0.75 > cardBox.left && mark.x - hx * 0.75 < cardBox.right && mark.y + hy * 0.75 > cardBox.top && mark.y - hy * 0.75 < cardBox.bottom;
      mark.under += ((over ? 0.4 : 1) - mark.under) * Math.min(1, dt * 3);
    }

    pulses = pulses.filter(p => (p.t += dt) < 2.2);

    const R = S * 0.1;
    const er = Math.max(mark.ew, mark.eh) * 0.45;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i], L = LAYERS[c.layer], r = c.k * S;
      c.age += dt;
      if (c.dying) { c.dying += dt; if (c.dying > 0.6) { cells.splice(i, 1); continue; } }
      const f = S * L.flow, react = c.layer === 2 ? 0.25 : 1;
      c.vx += (f * (1 + 0.3 * Math.sin(t * 0.2 + c.y / 200)) - c.vx) * Math.min(1, dt * 1.2);
      c.vy += (f * 0.25 * Math.sin(t * 0.3 + c.x / 260) - c.vy) * Math.min(1, dt * 1.2);

      if (pointer.on) {                                   // the cursor parts them
        const dx = c.x - pointer.x, dy = c.y - pointer.y, rr = R + r, d = Math.hypot(dx, dy);
        if (d < rr && d > 0.01) {
          const k = (1 - d / rr) ** 2 * react;
          c.vx += dx / d * k * S * 5 * dt + pointer.vx * k * dt * 3;
          c.vy += dy / d * k * S * 5 * dt + pointer.vy * k * dt * 3;
        }
      }
      c.lit = 0;
      if (mark.body && mark.a > 0) {                      // the emblem pushes them aside and lights them
        const dx = c.x - mark.x, dy = c.y - mark.y, rr = (er + r) * 1.5, d = Math.hypot(dx, dy);
        c.lit = clamp(1 - d / (er * 2.4), 0, 1) * mark.a;
        if (d < rr && d > 0.01) {
          const k = (1 - d / rr) ** 2 * react;
          c.vx += dx / d * k * S * 8 * dt + mark.vx * k * dt * 2.5;
          c.vy += dy / d * k * S * 8 * dt + mark.vy * k * dt * 2.5;
        }
      }
      for (const p of pulses) {                           // rings from beats and bounces
        const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy) || 1;
        const off = Math.abs(d - p.t * S * 0.9), band = S * 0.07;
        if (off < band) {
          const k = (1 - off / band) * p.pow * clamp(1 - p.t / 2.2, 0, 1) * react;
          c.vx += dx / d * k * S * 6 * dt;
          c.vy += dy / d * k * S * 6 * dt;
        }
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.a += c.spin * dt; c.tilt += c.tspin * dt;
      const m = r * 2;
      if (c.x > w + m) { c.x = -m; c.y = rand(0, h); } else if (c.x < -m) c.x = w + m;
      if (c.y > h + m) c.y = -m; else if (c.y < -m) c.y = h + m;
    }
    pointer.vx *= 0.9; pointer.vy *= 0.9;
  }

  function drawCell(ctx, c) {
    const L = LAYERS[c.layer], r = c.k * S * PAD;
    const fade = Math.min(1, c.age) * (c.dying ? Math.max(0, 1 - c.dying / 0.6) : 1);
    const sheet = L.sprite === 0 ? sharp : soft;
    const f = Math.round(Math.acos(Math.abs(Math.cos(c.tilt))) / 1.5708 * (FRAMES - 1));   // face-on to edge-on
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    ctx.setTransform(dpr * cs, dpr * sn, -dpr * sn, dpr * cs, dpr * c.x, dpr * c.y);
    ctx.globalAlpha = L.alpha * fade;
    ctx.drawImage(sheet, f * N, 0, N, N, -r, -r, r * 2, r * 2);
    if (c.lit > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * c.lit * fade;
      ctx.drawImage(sheet, f * N, 0, N, N, -r, -r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function draw(t) {
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg.globalAlpha = 1;
    bg.fillStyle = '#0b0204';
    bg.fillRect(0, 0, w, h);
    bg.drawImage(haze, -w * 0.1 + Math.sin(t * 0.05) * S * 0.04, -h * 0.1 + Math.cos(t * 0.04) * S * 0.03, w * 1.2, h * 1.2);

    for (const c of cells) if (c.layer < 2) drawCell(bg, c);
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);

    bg.globalCompositeOperation = 'lighter';
    for (const p of pulses) {
      if (!p.flare) continue;
      bg.globalAlpha = clamp(1 - p.t / 2.2, 0, 1) * 0.6;
      bg.strokeStyle = '#ff5a50';
      bg.lineWidth = 2 + S * 0.01;
      bg.beginPath();
      bg.arc(p.x, p.y, p.t * S * 0.9, 0, 6.28);
      bg.stroke();
    }
    bg.globalCompositeOperation = 'source-over';
    bg.globalAlpha = 0.92 - 0.12 * env;
    bg.drawImage(shade, 0, 0, w, h);
    bg.globalAlpha = 1;

    // the emblem goes on after the shading so it stays the brightest thing
    if (mark.body && mark.a > 0) {
      bg.globalCompositeOperation = 'lighter';
      bg.globalAlpha = (0.35 + 0.4 * env) * mark.a * mark.under;
      bg.drawImage(mark.glow, mark.x - mark.ew * 0.95, mark.y - mark.eh * 0.95, mark.ew * 1.9, mark.eh * 1.9);
      bg.globalCompositeOperation = 'source-over';
      bg.globalAlpha = mark.a * mark.under;
      bg.drawImage(mark.body, mark.x - mark.ew / 2, mark.y - mark.eh / 2, mark.ew, mark.eh);
    }


    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.clearRect(0, 0, front.width, front.height);
    for (const c of cells) if (c.layer === 2) drawCell(fg, c);
  }

  addEventListener('pointermove', e => {
    const dt = Math.max(e.timeStamp - pointer.t, 8) / 1000;
    if (pointer.on) {
      pointer.vx += ((e.clientX - pointer.x) / dt - pointer.vx) * 0.3;
      pointer.vy += ((e.clientY - pointer.y) / dt - pointer.vy) * 0.3;
    }
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = e.timeStamp; pointer.on = true;
  });
  document.addEventListener('pointerleave', () => { pointer.on = false; });
  addEventListener('resize', resize);

  resize();
  populate();

  if (still) {
    // no movement: let it settle once and leave a single frame
    mark.a = 1;
    for (let i = 0; i < 120; i++) update(1 / 30, 1.3 + i / 30);
    draw(5);
    return;
  }

  setTimeout(measureCard, 3000);

  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const mid = cells.filter(c => c.layer === 1 && !c.dying);
    if ((e.key === '+' || e.key === '=') && cells.length < MAX_CELLS) cells.push(spawn(1, true));
    else if ((e.key === '-' || e.key === '_') && mid.length > MIN_CELLS) mid[mid.length - 1].dying = 0.001;
    else if (e.key === 'h' || e.key === 'H') beat(performance.now() / 1000 - t0);
  });
  console.info('%cTimeless', 'font: italic 18px Georgia', '\n+ adds a cell, - takes the newest one away, h gives it a heartbeat.');

  let last = performance.now(), t0 = last, slow = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = (now - t0) / 1000;
    update(dt, t);
    draw(t);
    slow = dt > 0.034 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 90 && quality > 0.5) {            // struggling: fewer pixels, fewer far cells
      quality -= 0.25; slow = 0;
      cells = cells.filter((c, i) => c.layer !== 0 || i % 7);
      resize();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
