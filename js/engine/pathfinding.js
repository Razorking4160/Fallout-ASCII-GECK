/* A* pathfinding over the tile grid, with pluggable entity blocking. */
(function (WA) {
  'use strict';

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function passable(S, x, y) {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return false;
    const t = WA.GAME.tiles[S.grid[y][x]];
    return !!t && !t.solid;
  }

  /* Returns a list of [x, y] steps from the start (inclusive) to the target,
     or null when there is no route. opts.maxNodes bounds the search,
     opts.block(x, y) marks tiles occupied by entities. */
  function find(sx, sy, tx, ty, opts) {
    const S = WA.game.S;
    if (!S) return null;
    const o = opts || {};
    const cap = o.maxNodes || 600;
    const W = S.w;
    const key = (x, y) => y * W + x;
    if (sx === tx && sy === ty) return [[sx, sy]];

    const open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy) }];
    const cost = new Map([[key(sx, sy), 0]]);
    const from = new Map();
    let nodes = 0;

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];

      if (cur.x === tx && cur.y === ty) {
        const path = [[cur.x, cur.y]];
        let k = key(cur.x, cur.y), prev;
        while ((prev = from.get(k))) {
          path.push(prev);
          k = key(prev[0], prev[1]);
        }
        path.reverse();
        return path;
      }
      if (++nodes > cap) break;

      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!passable(S, nx, ny)) continue;
        if (o.block && o.block(nx, ny)) continue;
        const g = cur.g + 1, k = key(nx, ny);
        if (cost.has(k) && cost.get(k) <= g) continue;
        cost.set(k, g);
        from.set(k, [cur.x, cur.y]);
        open.push({ x: nx, y: ny, g, f: g + Math.abs(nx - tx) + Math.abs(ny - ty) });
      }
    }
    return null;
  }

  WA.path = { find, passable, DIRS };
})(window.WA = window.WA || {});
