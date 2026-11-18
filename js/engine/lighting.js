/* Lighting: map ambient light plus light sources, recomputed once per action.
   Nothing here runs on a timer, so light never advances the turn. */
(function (WA) {
  'use strict';

  const LAMP = { r: 3.6, i: 0.9 };   // the Pip-Boy lamp the player always carries
  const MAX = 1.4;

  function ambient(S) {
    const m = WA.GAME.maps[S.id];
    const a = m && typeof m.amb === 'number' ? m.amb : 1;
    const daylight = WA.time && WA.time.ambientFactor ? WA.time.ambientFactor(S, m) : 1;
    return Math.max(0, Math.min(1, a * daylight));
  }

  // Add one source's light, blocked by walls so rooms stay separate.
  function cast(S, light, sx, sy, radius, power) {
    const r = Math.max(1, radius);
    const y0 = Math.max(0, sy - r), y1 = Math.min(S.h - 1, sy + r);
    const x0 = Math.max(0, sx - r), x1 = Math.min(S.w - 1, sx + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - sx, dy = y - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        if (d > 0 && !WA.vis.los(sx, sy, x, y)) continue;
        const v = power * (1 - d / r);
        if (v <= 0) continue;
        light[y][x] = Math.min(MAX, light[y][x] + v);
      }
    }
  }

  function compute(S, noLamp) {
    const amb = ambient(S);
    const light = Array.from({ length: S.h }, () => {
      const row = new Array(S.w);
      for (let x = 0; x < S.w; x++) row[x] = amb;
      return row;
    });
    if (!S.grid || !S.grid[0]) return light;

    for (let y = 0; y < S.h; y++) {
      for (let x = 0; x < S.w; x++) {
        const t = WA.GAME.tiles[S.grid[y][x]];
        if (t && t.light) cast(S, light, x, y, t.light, 0.95);
      }
    }
    for (const k in S.items) {
      const d = WA.GAME.items[S.items[k]];
      if (!d || !d.light) continue;
      const [x, y] = k.split(',').map(Number);
      cast(S, light, x, y, d.light, 0.9);
    }
    for (const e of S.ents) {
      const d = e.d || WA.GAME.entities[e.id];
      if (d && d.light) cast(S, light, e.x, e.y, d.light, 0.9);
    }
    if (!noLamp) cast(S, light, S.px, S.py, LAMP.r, LAMP.i);
    return light;
  }

  // Environmental light at the player, without the Pip-Boy lamp. 0 is dark
  // and 1 is fully lit; the lamp must not make every tile equally bright.
  function stealth(S) {
    if (!S) return 0.5;
    const l = compute(S, true);
    const row = l[S.py];
    const v = row ? row[S.px] : ambient(S);
    return Math.max(0, Math.min(1, (v || 0) / 0.9));
  }

  // Cell brightness to opacity. Dark cells fade, lit cells stay solid.
  function shade(l) {
    if (l >= 0.72) return 1;
    if (l >= 0.46) return 0.84;
    if (l >= 0.26) return 0.62;
    return 0.42;
  }

  WA.light = { compute, stealth, shade, ambient, LAMP };
})(window.WA = window.WA || {});
