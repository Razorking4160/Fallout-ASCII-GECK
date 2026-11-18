/* Visual weather: a pointer-transparent canvas over the ASCII grid.
   Rain uses moving particles; fog uses drifting translucent banks. This layer
   never changes visibility, collision, turns, or any game state. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const OPTIONS = ['none', 'rain', 'fog'];
  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let EL = null, CTX = null;
  let kind = '';
  let W = 0, H = 0, DPR = 1;
  let raf = 0;
  let last = 0;
  let fade = 0;
  let drops = [];
  let blobs = [];

  function current(S) {
    const m = S && WA.GAME.maps[S.id];
    if (!m || m.indoor) return 'none';
    return OPTIONS.indexOf(m.weather) >= 0 ? m.weather : 'none';
  }

  function canAnimate() {
    if (!WA.settings || !WA.settings.anim || REDUCED) return false;
    if (!EL || kind === 'none') return false;
    if (document.hidden) return false;
    const menu = U.el('menu');
    if (menu && !menu.hidden) return false;
    if (WA.turn && WA.turn.paused && WA.turn.paused()) return false;
    return true;
  }

  function clear() {
    if (!CTX) return;
    CTX.clearRect(0, 0, W, H);
  }

  function ensure() {
    if (!EL) EL = U.el('weather');
    if (!EL) return false;
    EL.className = kind === 'none' ? '' : kind;
    EL.dataset.weather = kind;
    if (!CTX) {
      CTX = EL.getContext && EL.getContext('2d');
      if (!CTX) return false;
    }
    const rect = EL.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (w === W && h === H && dpr === DPR) return true;
    W = w; H = h; DPR = dpr;
    EL.width = Math.round(W * DPR);
    EL.height = Math.round(H * DPR);
    CTX.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed();
    return true;
  }

  function seed() {
    if (kind === 'rain') {
      const count = Math.min(190, Math.max(50, Math.round(W / 5)));
      drops = Array.from({ length: count }, () => makeDrop(true));
      blobs = [];
    } else if (kind === 'fog') {
      const count = Math.min(9, Math.max(4, Math.round(W / 85)));
      blobs = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * W,
        y: H * (0.16 + Math.random() * 0.72),
        r: W * (0.16 + Math.random() * 0.18),
        vx: (4 + Math.random() * 8) * (i % 2 ? -1 : 1),
        vy: (1 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1),
        a: 0.06 + Math.random() * 0.06
      }));
      drops = [];
    } else {
      drops = [];
      blobs = [];
    }
  }

  function makeDrop(fromTop) {
    const len = 8 + Math.random() * 18;
    return {
      x: Math.random() * W,
      y: fromTop ? -Math.random() * H : -len,
      len,
      speed: 260 + Math.random() * 360,
      drift: 18 + Math.random() * 36,
      alpha: 0.16 + Math.random() * 0.24
    };
  }

  function drawRain(dt) {
    const wind = Math.sin(performance.now() / 1800) * 10;
    CTX.lineCap = 'round';
    CTX.lineWidth = 1;
    for (const d of drops) {
      d.x += (d.drift + wind) * dt;
      d.y += d.speed * dt;
      if (d.y - d.len > H + 8 || d.x > W + 20) {
        d.x = Math.random() * W - 20;
        d.y = -d.len - Math.random() * 24;
        d.len = 8 + Math.random() * 18;
        d.speed = 260 + Math.random() * 360;
        d.drift = 18 + Math.random() * 36;
        d.alpha = 0.16 + Math.random() * 0.24;
      }
      CTX.globalAlpha = d.alpha;
      CTX.strokeStyle = '#b8d8ff';
      CTX.beginPath();
      CTX.moveTo(d.x, d.y);
      CTX.lineTo(d.x - d.len * 0.18, d.y - d.len);
      CTX.stroke();
    }
    // A few low-opacity splashes at the bottom keep the rain grounded.
    CTX.globalAlpha = 0.12;
    CTX.strokeStyle = '#cfe6ff';
    for (let i = 0; i < Math.min(8, drops.length); i++) {
      const d = drops[i];
      if (d.y < H - 4 || d.y > H + 8) continue;
      CTX.beginPath();
      CTX.ellipse(d.x, H - 2, 2.4, 0.8, 0, 0, Math.PI * 2);
      CTX.stroke();
    }
  }

  function drawFog(dt) {
    for (const b of blobs) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -b.r) b.x = W + b.r;
      if (b.x > W + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = H + b.r;
      if (b.y > H + b.r) b.y = -b.r;
      const g = CTX.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(205,225,210,${b.a})`);
      g.addColorStop(1, 'rgba(205,225,210,0)');
      CTX.fillStyle = g;
      CTX.beginPath();
      CTX.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      CTX.fill();
    }
  }

  function draw(dt) {
    clear();
    if (!dropFrame()) return;
    CTX.save();
    CTX.globalAlpha = Math.min(1, fade);
    if (kind === 'rain') drawRain(dt);
    else if (kind === 'fog') drawFog(dt);
    CTX.restore();
  }

  // A tiny helper keeps the guard and the fade ramp in one place.
  function dropFrame() {
    return W > 1 && H > 1 && kind !== 'none';
  }

  function frame(ts) {
    raf = 0;
    if (!canAnimate()) return;
    if (!ensure()) return;
    const dt = Math.min(0.05, Math.max(0.008, (ts - (last || ts)) / 1000));
    last = ts;
    fade = Math.min(1, fade + dt * 2.6);
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!canAnimate()) {
      drawStatic();
      return;
    }
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function drawStatic() {
    if (!ensure()) return;
    fade = 1;
    draw(0);
  }

  function setKind(next) {
    if (kind === next) return;
    kind = next;
    fade = 0;
    if (EL) {
      EL.className = kind === 'none' ? '' : kind;
      EL.dataset.weather = kind;
    }
    if (kind === 'none') {
      stop();
      clear();
      return;
    }
    ensure();
    seed();
    start();
  }

  function apply(S) {
    const next = current(S);
    if (next !== kind) setKind(next);
    else if (kind !== 'none' && !raf) start();
  }

  function refresh() {
    const S = WA.game && WA.game.S;
    if (!S) { stop(); return; }
    const next = current(S);
    if (next !== kind) { setKind(next); return; }
    if (!canAnimate()) { stop(); drawStatic(); }
    else start();
  }

  function stopAll() {
    stop();
    clear();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else {
      const S = WA.game && WA.game.S;
      if (S) apply(S);
    }
  });

  WA.weather = { current, apply, refresh, stop: stopAll, OPTIONS };
})(window.WA = window.WA || {});
