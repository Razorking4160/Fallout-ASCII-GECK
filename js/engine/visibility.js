/* Field of view: recursive shadowcasting in eight octants, cached per turn. */
(function (WA) {
  'use strict';

  // xx, xy, yx, yy multipliers for the eight octants.
  const MULT = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]];

  const solid = (S, x, y) => {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return true;
    const t = WA.GAME.tiles[S.grid[y] && S.grid[y][x]];
    return !t || !!t.solid;
  };

  const radius = S => {
    const p = WA.traits ? WA.traits.sp(S.sp).P : S.sp.P;
    return Math.max(1, (WA.GAME.player.sight || 8) + ((p || 5) - 5));
  };

  function mark(S, vis, x, y) {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
    vis[y][x] = true;
    S.seen[y][x] = 1;
  }

  function cast(S, vis, row, start, end, R, m) {
    if (start < end) return;
    const xx = m[0], xy = m[1], yx = m[2], yy = m[3];
    let newStart = start;
    for (let j = row; j <= R; j++) {
      let dx = -j - 1, dy = -j, blocked = false;
      while (dx <= 0) {
        dx++;
        const X = S.px + dx * xx + dy * xy;
        const Y = S.py + dx * yx + dy * yy;
        // Slopes of the square's right and left extremes.
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        if (dx * dx + dy * dy <= R * R) mark(S, vis, X, Y);
        if (blocked) {
          if (solid(S, X, Y)) { newStart = rSlope; continue; }
          blocked = false;
          start = newStart;
        } else if (solid(S, X, Y) && j < R) {
          blocked = true;
          cast(S, vis, j + 1, start, lSlope, R, m);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  }

  /* Recompute what the player can see. Called on movement and on world
     changes, not from the draw path, so rendering never walks the map twice. */
  function compute(S) {
    const R = radius(S);
    const fog = WA.settings.fog;
    const vis = Array.from({ length: S.h }, () => Array(S.w).fill(!fog));
    if (!fog) {
      S.seen.forEach(r => r.fill(1));
      return vis;
    }
    mark(S, vis, S.px, S.py);
    for (let o = 0; o < 8; o++) cast(S, vis, 1, 1.0, 0.0, R, MULT[o]);
    return vis;
  }

  /* Straight line check used by firing and VATS, where a clear ray matters
     more than a view cone. */
  function los(x0, y0, x1, y1) {
    const S = WA.game.S;
    if (!S) return false;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (x0 !== x1 || y0 !== y1) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      if (x0 === x1 && y0 === y1) break;
      if (solid(S, x0, y0)) return false;
    }
    return true;
  }

  WA.vis = { compute, los, radius };
})(window.WA = window.WA || {});
