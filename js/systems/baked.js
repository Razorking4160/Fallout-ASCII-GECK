/* Baked definitions. The studio's "Export definitions" writes
   js/data/defs-authored.js, which this module applies after game-data.js.
   Entity dialogue trees hold functions and never travel through a pack or
   export, so an entity override always keeps the shipped tree. */
(function (WA) {
  'use strict';

  const KINDS = ['tiles', 'entities', 'items'];

  function apply(defs) {
    if (!defs || typeof defs !== 'object') return 0;
    let n = 0;
    for (const kind of KINDS) {
      const src = defs[kind];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for (const id of Object.keys(src)) {
        const d = src[id];
        if (d === null) {
          if (WA.GAME[kind][id]) { delete WA.GAME[kind][id]; n++; }
          continue;
        }
        if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
        const base = WA.BASE && WA.BASE[kind] && WA.BASE[kind][id];
        WA.GAME[kind][id] = kind === 'entities' && base && base.talk ? { ...d, talk: base.talk } : d;
        if (d.glyph && !(d.glyph in WA.LEG)) WA.LEG[d.glyph] = id;
        n++;
      }
    }
    return n;
  }

  /* Maps shipped in js/data/maps-authored.js join the built-ins. The studio's
     editor already does this for its own preview; the game needs it too. */
  function applyMaps(maps) {
    const src = maps && typeof maps === 'object' ? maps : (WA.AUTHORED || {});
    let n = 0;
    for (const id of Object.keys(src)) {
      if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(id) || !src[id] || typeof src[id] !== 'object') continue;
      WA.GAME.maps[id] = src[id];
      n++;
    }
    return n;
  }

  WA.baked = { apply, applyMaps, KINDS };
})(window.WA = window.WA || {});
