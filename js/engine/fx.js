/* Combat feedback over the board: a muzzle flash, a hit, a damage number, a
   death burst. Each lasts a fraction of a second, so it lives in its own layer
   above the cell grid instead of in a cell's class, where the next redraw would
   wipe it. Nothing here touches game state -- the log stays the record of what
   happened, and this only makes the moment visible. */
(function (WA) {
  'use strict';
  const U = WA.util;
  // A blast marks a dozen cells at once; do not let a long turn pile up more.
  const MAX = 24;
  let layer = null;

  /* The same rule as the world's turn: Animate off, or a system that asks for
     less motion, means no transient effects at all. */
  function animate() {
    if (WA.settings && !WA.settings.anim) return false;
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function host() {
    if (layer && layer.parentNode) return layer;
    const crt = U.el('crt');
    if (!crt) return null;
    layer = document.createElement('div');
    layer.id = 'fx';
    layer.setAttribute('aria-hidden', 'true');
    crt.appendChild(layer);
    return layer;
  }

  /* One short-lived element over a world cell. A cell is only drawn when the
     camera covers it, so the renderer is asked where it painted that cell
     rather than this guessing a position. */
  function at(x, y, cls, text, ms, scale, vars) {
    if (!animate()) return false;
    const box = WA.view && WA.view.spot ? WA.view.spot(x, y) : null;
    const hostEl = box && host();
    if (!box || !hostEl) return false;
    while (hostEl.childElementCount >= MAX) hostEl.removeChild(hostEl.firstChild);
    const el = document.createElement('span');
    el.className = 'fxpop ' + cls;
    el.textContent = text || '';
    el.style.left = box.left + 'px';
    el.style.top = box.top + 'px';
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
    el.style.fontSize = (box.h * (scale || 1)) + 'px';
    if (vars) for (const k in vars) el.style.setProperty(k, vars[k]);
    hostEl.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 700);
    return true;
  }

  const shot = (x, y) => at(x, y, 'fx-shot', '', 200);
  const death = (x, y) => at(x, y, 'fx-death', '✳', 460);
  const miss = (x, y) => at(x, y, 'fx-miss', 'miss', 560, 0.5);

  /* A melee blow traced over the attacker. The glyph follows the direction of
     the swing, so a blow to the left reads as one instead of a generic flash. */
  function swing(x, y, dx, dy) {
    if (!dx && !dy) return at(x, y, 'fx-swing', '✦', 260, 1.1);
    const g = !dy ? '—' : !dx ? '│' : dx * dy > 0 ? '╲' : '╱';
    return at(x, y, 'fx-swing', g, 260, 1.15);
  }

  /* Dismemberment: a killing blow or a called shot into a limb throws a few
     chips out of the cell. Decoration only -- the body is already gone, or the
     limb is already counted as crippled. */
  function gore(x, y, dx, dy) {
    if (!animate()) return false;
    let shown = false;
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const gx = (dx ? Math.sign(dx) : side) * (0.35 + Math.random() * 0.85);
      const gy = (dy ? Math.sign(dy) : -1) * (0.25 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.5;
      shown = at(x, y, 'fx-chunk', i % 3 ? '·' : '*', 620, 0.75,
        { '--gx': gx.toFixed(2) + 'em', '--gy': gy.toFixed(2) + 'em' }) || shown;
    }
    return shown;
  }

  /* A hit shows its number, red over you and amber over anything else. */
  function hit(x, y, amount, onPlayer) {
    at(x, y, 'fx-hit', '', 230);
    return at(x, y, 'fx-num' + (onPlayer ? ' fx-own' : ''), '-' + (amount | 0), 700);
  }

  /* A load, a travel or a new map moves every cell: drop what is in flight
     rather than let it hang over the new board. */
  function clear() {
    if (layer) layer.textContent = '';
  }

  WA.fx = { at, swing, gore, shot, hit, death, miss, clear };
})(window.WA = window.WA || {});
