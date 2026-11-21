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
  function at(x, y, cls, text, ms, scale) {
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
    hostEl.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 700);
    return true;
  }

  const shot = (x, y) => at(x, y, 'fx-shot', '', 200);
  const death = (x, y) => at(x, y, 'fx-death', '✳', 460);
  const miss = (x, y) => at(x, y, 'fx-miss', 'miss', 560, 0.5);

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

  WA.fx = { at, shot, hit, death, miss, clear };
})(window.WA = window.WA || {});
