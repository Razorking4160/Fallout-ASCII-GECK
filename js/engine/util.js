/* Shared helpers: randomness, escaping, grapheme splitting and glyph display width. */
(function (WA) {
  'use strict';
  const U = {};

  U.rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  U.lim = (a, b, v) => Math.min(b, Math.max(a, Math.round(+v) || 0));

  // Escape everything player or forge authored before it reaches innerHTML.
  U.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Split by grapheme cluster, so a symbol is never cut in half.
  U.split = s => (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(s)), x => x.segment)
    : Array.from(String(s));

  U.isEmo = ch => /\p{Extended_Pictographic}/u.test(ch) && (/[\u{1F000}-\u{1FFFF}]/u.test(ch) || ch.includes('\uFE0F'));

  /* Deep copy for definition trees. Functions (dialogue text, option checks)
     are carried by reference: JSON cloning would drop them. */
  U.copy = v => {
    if (Array.isArray(v)) return v.map(U.copy);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k in v) o[k] = U.copy(v[k]);
      return o;
    }
    return v;
  };

  U.el = id => document.getElementById(id);
  U.setHtml = (id, h) => { const el = U.el(id); if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };
  U.setText = (id, t) => { const el = U.el(id); if (el && el.textContent !== t) el.textContent = t; };

  /* ---- display width ---------------------------------------------------
     A monospace cell is one character wide. Some symbols (emoji, CJK, some
     dingbats) need two columns, so the renderer has to know the difference
     before it decides how much room to reserve. Widths are measured from the
     real font in use, then cached until the font changes. */
  let ctx = null, fontKey = '', cache = new Map();

  function fontSpec() {
    const el = U.el('screen');
    const cs = el ? getComputedStyle(el) : null;
    const size = cs ? cs.fontSize : '16px';
    const fam = cs ? cs.fontFamily : 'monospace';
    const key = size + '|' + fam;
    if (key !== fontKey) { fontKey = key; cache.clear(); }
    return size + ' ' + fam;
  }
  function measure() {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = fontSpec();
    return ctx;
  }
  let unitW = 0;
  U.unitWidth = () => { const w = measure().measureText('M').width; if (w !== unitW) { unitW = w; cache.clear(); } return unitW || 1; };

  U.glyphWidth = ch => {
    if (!ch || ch === ' ') return 1;
    if (cache.has(ch)) return cache.get(ch);
    let w = 1;
    try {
      const raw = measure().measureText(ch).width;
      if (U.isEmo(ch) || raw > U.unitWidth() * 1.35) w = 2;
    } catch (e) { w = U.isEmo(ch) ? 2 : 1; }
    cache.set(ch, w);
    return w;
  };
  // Called on resize/rotation so widths are re-measured at the new font size.
  U.resetGlyphWidths = () => { fontKey = ''; unitW = 0; cache.clear(); };

  U.cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  /* ---- facing ----------------------------------------------------------
     One compass letter per character. A character keeps the direction of its
     last step or attack, and `turnedFrom` is true when that direction does not
     point toward the given offset: side-on or back turned. */
  const FACING = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const ARROWS = { n: '▲', e: '▶', s: '▼', w: '◀' };
  U.faceTo = (dx, dy) => !dx && !dy ? null
    : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  U.arrow = face => ARROWS[face] || ARROWS.s;
  U.turnedFrom = (face, dx, dy) => {
    const f = FACING[face] || FACING.s;
    return f[0] * dx + f[1] * dy <= 0;
  };

  WA.util = U;
})(window.WA = window.WA || {});
