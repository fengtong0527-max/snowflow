'use strict';

/**
 * Snow Flow V0.2 — Canvas-only procedural ski game.
 * No DOM, HTML, CSS, network access, CDN, image or audio assets.
 * The host provides Canvas and the wrapped platform contract.
 */
function start(canvas, platform) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D Canvas context is required');
  ctx.imageSmoothingEnabled = true;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const W = () => canvas.width || 1;
  const H = () => canvas.height || 1;
  const rnd = (min, max) => min + random() * (max - min);

  let seed = 928371;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const game = {
    state: 'menu',
    paused: false,
    time: 0,
    distance: 0,
    score: 0,
    bonus: 0,
    best: Number(platform.load() || 0),
    speed: 24,
    playerX: 0,
    playerV: 0,
    steer: 0,
    pointerDown: false,
    pointerStartY: 0,
    air: 0,
    combo: 0,
    spawnAt: 18,
    decorAt: 0,
    objects: [],
    trees: [],
    trail: [],
    spray: [],
    snow: [],
    lastFrame: 0,
    lastTrail: 0,
    cameraShake: 0,
    message: '',
    messageTime: 0,
    wind: 0
  };

  function reset() {
    seed = (Math.floor(game.time * 100000) + 928371) >>> 0;
    game.state = 'run';
    game.paused = false;
    game.time = 0;
    game.distance = 0;
    game.score = 0;
    game.bonus = 0;
    game.speed = 24;
    game.playerX = 0;
    game.playerV = 0;
    game.steer = 0;
    game.pointerDown = false;
    game.air = 0;
    game.combo = 0;
    game.spawnAt = 16;
    game.decorAt = 0;
    game.objects = [];
    game.trees = [];
    game.trail = [];
    game.spray = [];
    game.cameraShake = 0;
    game.message = '出发！';
    game.messageTime = 1.1;
    for (let i = 0; i < 26; i++) addTree(280 + i * 13);
  }

  function addTree(z) {
    const side = random() < 0.5 ? -1 : 1;
    game.trees.push({
      z,
      x: side * rnd(3.35, 6.2),
      size: rnd(0.78, 1.28),
      tint: random()
    });
  }

  function addObstacleRow() {
    const z = 340 + rnd(0, 45);
    const lane = rnd(-2.0, 2.0);
    const r = random();
    if (r < 0.52) {
      game.objects.push({ type: 'gate', z, x: lane, passed: false, hit: false });
    } else if (r < 0.79) {
      game.objects.push({ type: 'rock', z, x: lane, passed: false, hit: false });
    } else {
      game.objects.push({ type: 'ramp', z, x: lane, passed: false, hit: false });
    }
    if (random() < 0.3) {
      const other = clamp(lane + (random() < 0.5 ? -1 : 1) * rnd(1.2, 2.1), -2.35, 2.35);
      game.objects.push({ type: 'rock', z: z + rnd(-9, 9), x: other, passed: false, hit: false });
    }
  }

  function curveAt(z) {
    const d = game.distance + z;
    return Math.sin(d * 0.0021) * 0.66 + Math.sin(d * 0.00083 + 1.4) * 0.3;
  }

  function elevationAt(x, z) {
    const d = game.distance + z;
    const side = Math.max(0, Math.abs(x) - 2.7);
    return Math.sin(d * 0.014 + x * 0.65) * 0.13
      + Math.sin(d * 0.006 + x * 1.1) * 0.11
      + Math.sin(x * 1.7 + d * 0.003) * 0.07
      + side * side * 0.018;
  }

  function project(x, z, elevation) {
    const w = W(), h = H();
    const p = 1 / (1 + z / 112);
    const curve = curveAt(z) - curveAt(0);
    const lateral = x + curve - game.playerX;
    const sx = w * 0.5 + lateral * w * 0.17 * p;
    const sy = h * 0.305 + h * 0.635 * p - (elevation || 0) * h * 0.11 * p;
    return { x: sx, y: sy, p };
  }

  function polygon(points, fill, stroke, lineWidth) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.stroke();
  }

  function roundedRect(x, y, w, h, r, fill, stroke) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function text(str, x, y, size, color, align, weight) {
    ctx.font = `${weight || 600} ${Math.round(size)}px sans-serif`;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
  }

  function colorMix(a, b, t) {
    const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
    const rr = Math.round(lerp(ar, br, t)), rg = Math.round(lerp(ag, bg, t)), rb = Math.round(lerp(ab, bb, t));
    return `rgb(${rr},${rg},${rb})`;
  }

  function drawSky() {
    const w = W(), h = H();
    const phase = (game.time / 95) % 1;
    const night = clamp((Math.sin(phase * TAU - 1.1) + 0.1) * 0.62, 0, 0.78);
    const top = colorMix('#527fa4', '#101e3a', night);
    const bottom = colorMix('#f5c6a8', '#455e80', night);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.66);

    const sunX = w * (0.74 - phase * 0.25);
    const sunY = h * (0.17 + Math.sin(phase * TAU) * 0.025);
    const sunR = Math.min(w, h) * 0.047;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = night > 0.42 ? '#b9d7ff' : '#fff1c5';
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 2.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = night > 0.42 ? '#dceaff' : '#fff0c8';
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();

    if (night > 0.35) {
      for (let i = 0; i < 34; i++) {
        const sx = ((i * 173.7) % w);
        const sy = ((i * 71.3) % (h * 0.28));
        ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(game.time * 1.3 + i));
        ctx.fillStyle = '#f2f7ff';
        ctx.beginPath(); ctx.arc(sx, sy, 1 + (i % 3) * 0.35, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.globalAlpha = night * 0.38;
      ctx.strokeStyle = '#8be3d5';
      ctx.lineWidth = h * 0.018;
      ctx.shadowColor = '#8be3d5';
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.17);
      ctx.bezierCurveTo(w * 0.28, h * 0.06, w * 0.46, h * 0.25, w * 0.66, h * 0.13);
      ctx.bezierCurveTo(w * 0.8, h * 0.05, w * 0.9, h * 0.12, w * 1.04, h * 0.08);
      ctx.stroke();
      ctx.restore();
    }

    drawMountainLayer(0.36, '#647f9d', '#d5e0e8', 0.7, 1.3);
    drawMountainLayer(0.43, '#9aafc1', '#e8eff3', 1.4, 2.1);
    drawMountainLayer(0.49, '#c1d0d9', '#f6f9fb', 2.5, 3.2);
  }

  function drawMountainLayer(base, color, cap, seedOffset, amplitude) {
    const w = W(), h = H();
    const points = [[0, h * (base + 0.08)]];
    const count = 22;
    for (let i = 0; i <= count; i++) {
      const x = (i / count) * w;
      const wave = Math.abs(Math.sin(i * 1.73 + seedOffset) * Math.cos(i * 0.47 + seedOffset * 2));
      const y = h * (base - wave * 0.115 * (amplitude / 2.2));
      points.push([x, y]);
    }
    points.push([w, h * (base + 0.1)]);
    polygon(points, color);
    for (let i = 2; i < points.length - 2; i += 3) {
      const p = points[i];
      const peak = h * 0.024;
      polygon([[p[0] - peak * 1.4, p[1] + peak * 1.8], [p[0], p[1] - peak], [p[0] + peak * 1.5, p[1] + peak * 1.8]], cap);
    }
  }

  function terrainShade(x, z, index) {
    const noise = Math.sin(z * 0.061 + x * 1.7) * 0.5 + Math.sin(z * 0.023 - x * 2.1) * 0.5;
    if (Math.abs(x) < 2.78) {
      return noise > 0.35 ? '#f8fcff' : (noise < -0.45 ? '#e5f0f6' : (index % 2 ? '#eef6fa' : '#f3f8fb'));
    }
    return noise > 0 ? '#cbdce7' : '#d7e4ec';
  }

  function drawTerrain() {
    const w = W(), h = H();
    const columns = [];
    for (let x = -7; x <= 7.001; x += 1) columns.push(x);
    const rows = [];
    for (let z = 420; z >= 0; z -= 20) rows.push(z);
    for (let r = 0; r < rows.length - 1; r++) {
      const zFar = rows[r], zNear = rows[r + 1];
      for (let col = 0; col < columns.length - 1; col++) {
        const x1 = columns[col], x2 = columns[col + 1];
        const a = project(x1, zFar, elevationAt(x1, zFar));
        const b = project(x2, zFar, elevationAt(x2, zFar));
        const c = project(x2, zNear, elevationAt(x2, zNear));
        const d = project(x1, zNear, elevationAt(x1, zNear));
        const mid = (x1 + x2) * 0.5;
        polygon([[a.x,a.y],[b.x,b.y],[c.x,c.y]], terrainShade(mid, zFar, col + r));
        polygon([[a.x,a.y],[c.x,c.y],[d.x,d.y]], terrainShade(mid, zNear, col + r + 1));
      }
    }

    // Subtle groomed-snow grooves, converging toward the vanishing point.
    for (let z = 350 - (game.distance % 26); z > 5; z -= 26) {
      const left = project(-2.7, z, elevationAt(-2.7, z));
      const right = project(2.7, z, elevationAt(2.7, z));
      ctx.globalAlpha = 0.12 + left.p * 0.08;
      line(left.x, left.y, right.x, right.y, '#88a8bc', Math.max(0.6, left.p * 1.5));
    }
    ctx.globalAlpha = 1;

    // Soft piste boundary markers.
    for (const side of [-1, 1]) {
      for (let z = 360 - (game.distance % 34); z > 8; z -= 34) {
        const p = project(side * 2.82, z, elevationAt(side * 2.82, z));
        const r = Math.max(1, p.p * 3.5);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
    }
  }

  function drawFir(x, y, scale, tint) {
    const s = scale;
    ctx.fillStyle = '#6a7880';
    ctx.fillRect(x - s * 0.045, y - s * 0.34, s * 0.09, s * 0.38);
    const base = tint > 0.5 ? '#355d70' : '#294f63';
    for (let i = 0; i < 3; i++) {
      const top = y - s * (0.56 + i * 0.2);
      const half = s * (0.31 - i * 0.055);
      polygon([[x, top - s * 0.32], [x - half, top + s * 0.13], [x + half, top + s * 0.13]], base);
      polygon([[x, top - s * 0.32], [x - half * 0.62, top + s * 0.02], [x + half * 0.08, top - s * 0.02]], '#eaf3f7');
    }
  }

  function drawDecor() {
    const ordered = game.trees.slice().sort((a, b) => b.z - a.z);
    for (const tree of ordered) {
      if (tree.z < 0) continue;
      const p = project(tree.x, tree.z, elevationAt(tree.x, tree.z));
      const size = H() * 0.23 * p.p * tree.size;
      if (size < 2) continue;
      drawFir(p.x, p.y, size, tree.tint);
    }
  }

  function drawGate(o, p) {
    const h = H(), w = W();
    const postH = h * 0.12 * p.p;
    const half = w * 0.052 * p.p;
    const width = Math.max(2, p.p * 5);
    line(p.x - half, p.y, p.x - half, p.y - postH, '#e56d62', width);
    line(p.x + half, p.y, p.x + half, p.y - postH, '#e56d62', width);
    line(p.x - half, p.y - postH, p.x + half, p.y - postH, '#f5f7f8', Math.max(2, width * 1.5));
    polygon([[p.x - half * 0.98,p.y - postH],[p.x - half * 0.45,p.y - postH],[p.x - half * 0.45,p.y - postH * 0.56],[p.x - half * 0.98,p.y - postH * 0.56]], '#e56d62');
    if (p.p > 0.36) text('S', p.x, p.y - postH * 0.78, Math.max(7, h * 0.015 * p.p / 0.5), '#fff', 'center', 700);
  }

  function drawRock(o, p) {
    const r = H() * 0.043 * p.p;
    ctx.save();
    ctx.translate(p.x, p.y - r * 0.28);
    polygon([[-r,-r*0.1],[-r*0.55,-r*0.78],[r*0.12,-r],[r*0.82,-r*0.48],[r,r*0.18],[r*0.45,r*0.56],[-r*0.62,r*0.42]], '#778b98', '#e5eef2', Math.max(0.5,p.p));
    polygon([[-r*0.55,-r*0.78],[r*0.12,-r],[r*0.32,-r*0.36],[-r*0.18,-r*0.25]], '#dce8ee');
    ctx.restore();
  }

  function drawRamp(o, p) {
    const w = W(), h = H(), s = p.p;
    const half = w * 0.09 * s;
    const rise = h * 0.045 * s;
    polygon([[p.x-half,p.y],[p.x+half,p.y],[p.x+half*0.62,p.y-rise],[p.x-half*0.62,p.y-rise]], '#8ba9bb', '#eaf4f8', Math.max(1,s*2));
    line(p.x-half*0.55,p.y-rise*0.85,p.x+half*0.55,p.y-rise*0.85,'#f8fbfd',Math.max(1,s*2));
  }

  function drawObjects() {
    const ordered = game.objects.slice().sort((a, b) => b.z - a.z);
    for (const o of ordered) {
      if (o.z < 0) continue;
      const p = project(o.x, o.z, elevationAt(o.x, o.z));
      if (o.type === 'gate') drawGate(o, p);
      else if (o.type === 'rock') drawRock(o, p);
      else drawRamp(o, p);
    }
  }

  function addSpray() {
    for (let i = 0; i < 3; i++) {
      game.spray.push({
        x: rnd(-8, 8), y: rnd(-4, 5),
        vx: rnd(-38, 38) - game.playerV * 5,
        vy: rnd(-42, -8), life: rnd(0.22, 0.62), max: 0.62,
        size: rnd(1.2, 3.6)
      });
    }
  }

  function drawTrail() {
    const h = H();
    if (game.trail.length < 2) return;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let started = false;
      for (const t of game.trail) {
        const p = project(t.x + side * 0.14, t.z, elevationAt(t.x + side * 0.14, t.z));
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(123,157,178,0.48)';
      ctx.lineWidth = Math.max(1, h * 0.0022);
      ctx.stroke();
    }
  }

  function drawSpray() {
    const w = W(), h = H();
    const baseX = w * 0.5 + game.playerX * w * 0.035;
    const baseY = h * 0.88 - Math.sin(game.air * Math.PI / 1.2) * h * 0.14;
    for (const p of game.spray) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.75;
      ctx.fillStyle = '#f8fcff';
      ctx.beginPath(); ctx.arc(baseX + p.x, baseY + p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSkier() {
    const w = W(), h = H();
    const lift = Math.sin(clamp(game.air / 1.15, 0, 1) * Math.PI) * h * 0.15;
    const x = w * 0.5;
    const y = h * 0.885 - lift;
    const s = Math.min(w, h) * 0.105;
    const lean = clamp(game.playerV * 0.075, -0.34, 0.34);

    // Ground shadow remains on the piste while the skier is airborne.
    ctx.globalAlpha = game.air > 0 ? 0.16 : 0.28;
    ctx.fillStyle = '#536d80';
    ctx.beginPath(); ctx.ellipse(x, h * 0.91, s * (0.68 + game.air * 0.16), s * 0.14, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);

    // Skis.
    polygon([[-s*0.48,s*0.37],[-s*0.34,s*0.34],[-s*0.16,s*1.02],[-s*0.31,s*1.04]], '#203f58');
    polygon([[s*0.34,s*0.34],[s*0.48,s*0.37],[s*0.31,s*1.04],[s*0.16,s*1.02]], '#203f58');
    line(-s*0.40,s*0.46,-s*0.25,s*0.93,'#8fd2e5',Math.max(1,s*0.035));
    line(s*0.40,s*0.46,s*0.25,s*0.93,'#8fd2e5',Math.max(1,s*0.035));

    // Legs and boots.
    line(-s*0.2,s*0.04,-s*0.29,s*0.42,'#263e56',s*0.16);
    line(s*0.2,s*0.04,s*0.29,s*0.42,'#263e56',s*0.16);
    roundedRect(-s*0.39,s*0.25,s*0.22,s*0.22,s*0.055,'#e9f2f6');
    roundedRect(s*0.17,s*0.25,s*0.22,s*0.22,s*0.055,'#e9f2f6');

    // Jacket and arms.
    polygon([[-s*0.35,-s*0.62],[s*0.35,-s*0.62],[s*0.43,s*0.12],[0,s*0.27],[-s*0.43,s*0.12]], '#ed795d');
    polygon([[-s*0.35,-s*0.55],[-s*0.68,-s*0.18],[-s*0.55,s*0.02],[-s*0.18,-s*0.32]], '#e9f2f6');
    polygon([[s*0.35,-s*0.55],[s*0.68,-s*0.18],[s*0.55,s*0.02],[s*0.18,-s*0.32]], '#e9f2f6');
    ctx.fillStyle = '#263e56';
    ctx.beginPath(); ctx.arc(-s*0.58,s*0.02,s*0.085,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.58,s*0.02,s*0.085,0,TAU); ctx.fill();

    // Neck, helmet and goggles.
    roundedRect(-s*0.12,-s*0.76,s*0.24,s*0.2,s*0.05,'#efc7a6');
    ctx.fillStyle = '#efc7a6';
    ctx.beginPath(); ctx.arc(0,-s*0.91,s*0.29,0,TAU); ctx.fill();
    ctx.fillStyle = '#24445d';
    ctx.beginPath(); ctx.arc(0,-s*0.99,s*0.31,Math.PI,TAU); ctx.lineTo(s*0.3,-s*0.9); ctx.quadraticCurveTo(0,-s*0.72,-s*0.3,-s*0.9); ctx.fill();
    roundedRect(-s*0.22,-s*0.94,s*0.44,s*0.11,s*0.04,'#80d5e7');
    line(-s*0.16,-s*0.88,s*0.16,-s*0.88,'#eafaff',Math.max(1,s*0.025));
    ctx.restore();
  }

  function drawSnowfall(dt) {
    const w = W(), h = H();
    if (!game.snow.length) {
      for (let i = 0; i < 72; i++) game.snow.push({ x: random() * w, y: random() * h, r: rnd(0.6, 2.0), v: rnd(16, 58), drift: rnd(-10, 10) });
    }
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    for (const flake of game.snow) {
      flake.y += (flake.v + game.speed * 0.12) * dt;
      flake.x += (flake.drift + game.wind) * dt;
      if (flake.y > h + 4) { flake.y = -4; flake.x = random() * w; }
      if (flake.x < -4) flake.x = w + 4;
      if (flake.x > w + 4) flake.x = -4;
      ctx.globalAlpha = 0.25 + flake.r * 0.2;
      ctx.beginPath(); ctx.arc(flake.x, flake.y, flake.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const w = W(), h = H();
    const pad = Math.max(12, w * 0.025);
    roundedRect(pad, pad, w * 0.31, h * 0.105, 12, 'rgba(18,43,62,0.38)');
    text(`${Math.floor(game.distance)} m`, pad + w * 0.022, pad + h * 0.034, h * 0.041, '#fff', 'left', 700);
    text(`${Math.floor(game.distance + game.bonus)} 分`, pad + w * 0.022, pad + h * 0.076, h * 0.027, '#d9edf5', 'left', 600);

    if (game.combo > 1) {
      roundedRect(w * 0.39, pad, w * 0.22, h * 0.065, 12, 'rgba(235,129,91,0.88)');
      text(`${game.combo} 连击`, w * 0.5, pad + h * 0.033, h * 0.03, '#fff', 'center', 700);
    }

    ctx.fillStyle = 'rgba(18,43,62,0.38)';
    ctx.beginPath(); ctx.arc(w - pad - h * 0.043, pad + h * 0.043, h * 0.043, 0, TAU); ctx.fill();
    text('Ⅱ', w - pad - h * 0.043, pad + h * 0.043, h * 0.043, '#fff', 'center', 700);

    const jumpX = w - pad - h * 0.085;
    const jumpY = h - pad - h * 0.105;
    ctx.fillStyle = 'rgba(31,76,101,0.64)';
    ctx.beginPath(); ctx.arc(jumpX, jumpY, h * 0.067, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(jumpX, jumpY, h * 0.067, 0, TAU); ctx.stroke();
    text('跳', jumpX, jumpY, h * 0.043, '#fff', 'center', 700);

    if (game.messageTime > 0 && game.message) {
      ctx.globalAlpha = clamp(game.messageTime, 0, 1);
      text(game.message, w * 0.5, h * 0.29, h * 0.045, '#fff', 'center', 700);
      ctx.globalAlpha = 1;
    }
  }

  function drawOverlay(title, subtitle, action) {
    const w = W(), h = H();
    ctx.fillStyle = 'rgba(12,31,49,0.38)';
    ctx.fillRect(0, 0, w, h);
    roundedRect(w * 0.12, h * 0.25, w * 0.76, h * 0.48, 22, 'rgba(17,43,62,0.66)', 'rgba(255,255,255,0.28)');
    text('SNOW FLOW', w * 0.5, h * 0.34, h * 0.027, '#b9dce9', 'center', 700);
    text(title, w * 0.5, h * 0.44, h * 0.085, '#fff', 'center', 800);
    text(subtitle, w * 0.5, h * 0.54, h * 0.033, '#e1edf3', 'center', 500);
    roundedRect(w * 0.29, h * 0.61, w * 0.42, h * 0.075, 14, '#ed805f');
    text(action, w * 0.5, h * 0.648, h * 0.034, '#fff', 'center', 700);
    if (game.state === 'menu') {
      text('左右拖动转向 · 点击右下角跳跃', w * 0.5, h * 0.79, h * 0.025, '#e5f0f5', 'center', 500);
      text('穿过旗门，躲开岩石，寻找完美滑行线', w * 0.5, h * 0.83, h * 0.022, '#d3e3eb', 'center', 500);
    }
  }

  function drawPause() {
    const w = W(), h = H();
    ctx.fillStyle = 'rgba(10,27,43,0.48)'; ctx.fillRect(0, 0, w, h);
    roundedRect(w * 0.25, h * 0.37, w * 0.5, h * 0.25, 18, 'rgba(20,48,67,0.86)');
    text('暂停中', w * 0.5, h * 0.45, h * 0.06, '#fff');
    text('点击屏幕继续', w * 0.5, h * 0.54, h * 0.03, '#dceaf1', 'center', 500);
  }

  function finishRun() {
    if (game.state !== 'run') return;
    game.state = 'over';
    game.score = Math.floor(game.distance + game.bonus);
    if (game.score > game.best) {
      game.best = game.score;
      platform.save(game.best);
    }
  }

  function update(dt) {
    if (game.state !== 'run' || game.paused) return;
    game.time += dt;
    game.speed = Math.min(48, 24 + game.time * 0.42 + Math.sin(game.distance * 0.012) * 1.8);
    game.wind = Math.sin(game.time * 0.22) * 7;

    const targetV = game.pointerDown ? game.steer * 4.5 : 0;
    game.playerV += (targetV - game.playerV) * Math.min(1, dt * 3.8);
    game.playerX = clamp(game.playerX + game.playerV * dt, -3.25, 3.25);
    game.air = Math.max(0, game.air - dt);
    game.distance += game.speed * dt;
    game.score = Math.floor(game.distance + game.bonus);
    game.messageTime = Math.max(0, game.messageTime - dt);
    game.cameraShake = Math.max(0, game.cameraShake - dt * 2.5);

    game.spawnAt -= game.speed * dt;
    if (game.spawnAt <= 0) {
      addObstacleRow();
      game.spawnAt = rnd(38, 53);
    }
    game.decorAt -= game.speed * dt;
    if (game.decorAt <= 0) {
      addTree(390);
      addTree(390);
      game.decorAt = rnd(13, 21);
    }

    for (const obj of game.objects) {
      obj.z -= game.speed * dt;
      if (!obj.passed && obj.z < 7) {
        obj.passed = true;
        const delta = Math.abs(game.playerX - obj.x);
        if (obj.type === 'gate') {
          if (delta < 0.62) {
            game.combo += 1;
            game.bonus += 30 + Math.min(game.combo, 12) * 7;
            game.message = game.combo > 1 ? `${game.combo} 连击！` : '漂亮过门！';
            game.messageTime = 0.75;
          } else game.combo = 0;
        } else if (obj.type === 'ramp' && delta < 0.72) {
          game.air = 1.15;
          game.combo += 1;
          game.bonus += 65;
          game.message = '腾空！';
          game.messageTime = 0.9;
          addSpray();
        } else if (obj.type === 'rock' && delta < 0.48 && game.air <= 0) {
          game.cameraShake = 0.8;
          finishRun();
          break;
        }
      }
    }
    game.objects = game.objects.filter(o => o.z > -22);
    for (const tree of game.trees) tree.z -= game.speed * dt;
    game.trees = game.trees.filter(t => t.z > -24);

    game.lastTrail += dt;
    if (game.lastTrail > 0.055) {
      game.lastTrail = 0;
      game.trail.push({ x: game.playerX, z: 0 });
    }
    for (const t of game.trail) t.z += game.speed * dt;
    game.trail = game.trail.filter(t => t.z < 95).slice(-90);

    if (Math.abs(game.playerV) > 0.8) addSpray();
    for (const p of game.spray) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vy += 26 * dt;
    }
    game.spray = game.spray.filter(p => p.life > 0).slice(-120);

    if (Math.abs(game.playerX) > 2.95 && game.air <= 0) {
      game.speed = Math.max(17, game.speed - dt * 8);
      game.combo = 0;
    }
  }

  function draw(dt) {
    const w = W(), h = H();
    ctx.save();
    if (game.cameraShake > 0) ctx.translate(rnd(-1, 1) * game.cameraShake * 8, rnd(-1, 1) * game.cameraShake * 6);
    drawSky();
    drawTerrain();
    drawTrail();
    drawDecor();
    drawObjects();
    drawSpray();
    drawSkier();
    drawSnowfall(dt);
    ctx.restore();

    if (game.state === 'run') {
      drawHud();
      if (game.paused) drawPause();
    } else if (game.state === 'menu') {
      drawOverlay('雪境', '沿着山脊，滑向远方', '开始滑雪');
    } else {
      drawOverlay('滑行结束', `本局 ${game.score} 分  ·  最高 ${game.best} 分`, '再滑一次');
    }
  }

  function jump() {
    if (game.state !== 'run' || game.paused || game.air > 0.15) return;
    game.air = 0.82;
    game.bonus += 12;
    game.message = '起跳！';
    game.messageTime = 0.55;
  }

  function down(x, y) {
    const w = W(), h = H();
    if (game.state !== 'run') { reset(); return; }
    if (game.paused) { game.paused = false; return; }
    if (x > w * 0.88 && y < h * 0.17) { game.paused = true; game.pointerDown = false; return; }
    if (x > w * 0.76 && y > h * 0.72) { jump(); return; }
    game.pointerDown = true;
    game.pointerStartY = y;
    game.steer = clamp((x / w - 0.5) * 2.4, -1, 1);
  }

  function move(x, y) {
    if (!game.pointerDown) return;
    if (game.pointerStartY - y > H() * 0.075) {
      jump();
      game.pointerStartY = y;
    }
    game.steer = clamp((x / W() - 0.5) * 2.4, -1, 1);
  }

  function up() {
    game.pointerDown = false;
    game.steer = 0;
  }

  function pause() {
    if (game.state === 'run') {
      game.paused = true;
      game.pointerDown = false;
    }
  }

  function frame(timestamp) {
    const dt = game.lastFrame ? clamp((timestamp - game.lastFrame) / 1000, 0, 0.05) : 1 / 60;
    game.lastFrame = timestamp;
    update(dt);
    draw(dt);
    platform.raf(frame);
  }

  platform.bind(down, move, up, pause);
  platform.raf(frame);
  return {
    down,
    move,
    up,
    pause,
    reset,
    getState: () => ({ state: game.state, distance: game.distance, score: game.score, best: game.best })
  };
};

window.SnowFlowCore = start;
