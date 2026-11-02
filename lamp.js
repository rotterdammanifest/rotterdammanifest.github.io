// lava lamp: a few blobs of wax drawn as metaballs, heated from below
(() => {
  const canvas = document.getElementById('lamp');
  const toggle = document.querySelector('.lamp-switch');
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { toggle.hidden = true; return; }

  // numbers worth playing with
  const COUNT = 7;
  const BUOYANCY = 0.35;
  const PULL = 2.2;       // how hard the cursor drags the wax
  const WARM_UP = 6;      // seconds for the heater to come up
  const COOL_DOWN = 14;   // seconds for it to go cold
  const FLOOR = 0.03, CEILING = 1.45;

  const vert = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
  const frag = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 u_res;
    uniform float u_heat, u_time;
    uniform vec4 u_b[${COUNT}];
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 p = gl_FragCoord.xy / u_res.y;
      vec3 violet = vec3(0.416, 0.298, 1.0), teal = vec3(0.07, 0.84, 0.77), rose = vec3(1.0, 0.36, 0.62);
      float f = 0.0, hot = 0.0;
      vec3 tint = vec3(0.0);
      for (int i = 0; i < ${COUNT}; i++) {
        vec4 b = u_b[i];
        vec2 d = p - b.xy;
        float w = b.z * b.z / (dot(d, d) + 0.0008);
        float m = mod(float(i), 3.0);
        vec3 c = mix(mix(violet, teal, step(0.5, m)), rose, step(1.5, m));
        f += w; tint += c * w; hot += b.w * w;
      }
      tint /= max(f, 0.0001);
      hot /= max(f, 0.0001);
      tint = mix(tint, vec3(1.0, 0.78, 0.6), hot * 0.2);
      vec3 col = vec3(0.039, 0.043, 0.078);
      col += vec3(0.28, 0.12, 0.4) * pow(1.0 - clamp(p.y, 0.0, 1.0), 2.0) * u_heat * 0.35;
      col += tint * smoothstep(0.05, 1.0, f) * 0.3;                         // soft halo
      float body = smoothstep(0.7, 1.3, f);
      col = mix(col, tint * (0.65 + 0.35 * smoothstep(1.0, 3.0, f)), body);
      col *= mix(0.35, 1.0, u_heat);
      col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 1.5 / 255.0;    // grain, hides banding
      gl_FragColor = vec4(col, 1.0);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { toggle.hidden = true; return; }
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uHeat = gl.getUniformLocation(prog, 'u_heat');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uBlobs = gl.getUniformLocation(prog, 'u_b');

  let aspect = 1, scale = 1, quality = 1;
  let heat = 0, shown = -1;
  let target = 1;
  try { if (localStorage.getItem('lamp') === 'off') target = 0; } catch (e) {}

  const pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false, t: 0 };
  const blobs = Array.from({ length: COUNT }, () => ({
    x: 0, y: FLOOR, vx: 0, vy: 0,
    r: 0.09 + Math.random() * 0.07,
    t: 0,
    bias: 0.38 + Math.random() * 0.18   // how warm it has to be before it floats
  }));

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5) * quality;
    canvas.width = Math.max(1, innerWidth * dpr | 0);
    canvas.height = Math.max(1, innerHeight * dpr | 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    aspect = innerWidth / innerHeight;
    scale = Math.max(0.6, Math.min(1, aspect));
    blobs.forEach((b, i) => { if (b.y <= FLOOR + 0.001) b.x = (i + 0.5) / COUNT * aspect; });
  }

  function step(dt, now) {
    heat += (target - heat) * (1 - Math.exp(-dt / (target > heat ? WARM_UP : COOL_DOWN)));
    const grip = 0.2 + 0.8 * heat;                      // cold wax barely moves
    blobs.forEach((b, i) => {
      const R = b.r * scale;
      if (b.y < 0.2) b.t += (heat - b.t) * dt / 2;       // heated down low
      else if (b.y > 1.1) b.t -= b.t * dt / 2;           // cools off past the top
      else b.t -= b.t * dt / 25;                         // slowly leaks heat in between
      b.vy += (b.t - b.bias) * BUOYANCY * dt;
      b.vx += Math.sin(now * 0.00031 + i * 2.1) * 0.02 * dt;

      if (pointer.on) {
        const dx = pointer.x - b.x, dy = pointer.y - b.y;
        const k = Math.exp(-(dx * dx + dy * dy) / 0.12) * grip;
        b.vx += (dx * PULL + pointer.vx * 0.5) * k * dt;
        b.vy += (dy * PULL + pointer.vy * 0.5) * k * dt;
      }
      for (const o of blobs) {
        if (o === b) continue;
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
        if (d < 0.1 && d > 0.0001) b.vx += dx / d * 0.15 * dt;   // don't stack in one spot
      }

      const drag = Math.exp(-dt * (1.6 + 2 * (1 - heat)));
      b.vx *= drag; b.vy *= drag;
      b.x += b.vx * dt; b.y += b.vy * dt;

      if (b.x < R) { b.x = R; b.vx *= -0.3; }
      if (b.x > aspect - R) { b.x = aspect - R; b.vx *= -0.3; }
      if (b.y < FLOOR) { b.y = FLOOR; b.vy = Math.max(0, b.vy); }
      if (b.y > CEILING) { b.y = CEILING; b.vy *= -0.2; }
    });
    pointer.vx *= 0.9; pointer.vy *= 0.9;

    if (Math.abs(heat - shown) > 0.01) {
      shown = heat;
      root.style.setProperty('--heat', heat.toFixed(2));
    }
  }

  const data = new Float32Array(COUNT * 4);
  function draw(now) {
    blobs.forEach((b, i) => {
      data.set([b.x, b.y, b.r * scale, b.t], i * 4);
    });
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uHeat, heat);
    gl.uniform1f(uTime, (now * 0.001) % 100);
    gl.uniform4fv(uBlobs, data);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setSwitch() {
    toggle.setAttribute('aria-checked', target ? 'true' : 'false');
  }
  toggle.addEventListener('click', () => {
    target = target ? 0 : 1;
    setSwitch();
    try { localStorage.setItem('lamp', target ? 'on' : 'off'); } catch (e) {}
  });
  setSwitch();

  addEventListener('pointermove', e => {
    const x = e.clientX / innerHeight, y = 1 - e.clientY / innerHeight;
    const dt = Math.max(e.timeStamp - pointer.t, 8) / 1000;
    if (pointer.on) {
      pointer.vx += ((x - pointer.x) / dt - pointer.vx) * 0.3;
      pointer.vy += ((y - pointer.y) / dt - pointer.vy) * 0.3;
    }
    pointer.x = x; pointer.y = y; pointer.t = e.timeStamp; pointer.on = true;
  });
  document.addEventListener('pointerleave', () => { pointer.on = false; });
  addEventListener('resize', () => { resize(); if (still) draw(0); });

  resize();

  if (still) {
    // no movement: warm it up once and leave a single frame
    toggle.hidden = true;
    heat = 1; target = 1;
    for (let i = 0; i < 900; i++) step(1 / 30, i * 33);
    draw(0);
    return;
  }

  let last = performance.now(), slow = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt, now);
    draw(now);
    slow = dt > 0.034 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 90 && quality > 0.5) { quality -= 0.25; slow = 0; resize(); }   // lower the resolution if it struggles
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
