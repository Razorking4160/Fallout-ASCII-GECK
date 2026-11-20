/* One registry for every modal panel. The list, the visibility test, the pause
   check, the backdrop and Escape/backdrop dismissal all read from here, so a
   new panel is one entry instead of edits in main.js, turn.js, combat.js,
   vats.js and every open(). Order is dismissal priority: the first open panel
   listed is the one Escape and a backdrop tap close. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const PANELS = [
    // Character creation and death need an explicit choice, so nothing dismisses them.
    { id: 'chargen', mod: 'traits', dismiss: false },
    { id: 'death', mod: 'death', dismiss: false },
    { id: 'ending', mod: 'ending' },
    { id: 'trade', mod: 'trade' },
    { id: 'pick', mod: 'pick' },
    { id: 'loot', mod: 'loot' },
    { id: 'lock', mod: 'lockpick' },
    { id: 'hack', mod: 'hacking' },
    { id: 'gamble', mod: 'gambling' },
    { id: 'dlg', mod: 'dlg', redraw: true },
    { id: 'pip', mod: 'pip' },
    // VATS is the one panel that does not freeze the world: it resolves its own
    // turn while the panel stays up, so turn.end must still advance the clock.
    { id: 'vats', mod: 'vats', pause: false }
  ];

  const byId = {};
  PANELS.forEach(p => { byId[p.id] = p; });

  const node = id => U.el(id);
  const isOpen = id => { const el = node(id); return !!el && !el.hidden; };

  /* Panels stop the world turn, except the one that finishes its own turn. */
  const paused = () => PANELS.some(p => p.pause !== false && isOpen(p.id));

  /* Anything visible at all: the backdrop, and the actions a panel must block. */
  const anyOpen = () => PANELS.some(p => isOpen(p.id));

  function close(id) {
    const p = byId[id];
    if (!p || !isOpen(id)) return false;
    const mod = WA[p.mod];
    if (!mod || !mod.close) return false;
    mod.close();
    if (p.redraw && WA.view) WA.view.draw();
    return true;
  }

  /* Panels open over each other, so an opener clears the rest first. The one
     being opened is skipped, since it may be up already and about to re-render;
     the panels that need an explicit choice are never cleared for it. */
  function closeAll(except) {
    for (const p of PANELS) if (p.id !== except && p.dismiss !== false) close(p.id);
  }

  function escape() {
    for (const p of PANELS) {
      if (p.dismiss !== false && isOpen(p.id)) return close(p.id);
    }
    return false;
  }

  function backdrop() {
    const open = anyOpen();
    const back = U.el('modalback');
    if (back) back.hidden = !open;
    document.body.classList.toggle('modal-open', open);
  }

  /* Panels show and hide by toggling `hidden`, so one observer covers them all. */
  let watching = false;
  function watch() {
    backdrop();
    if (watching || typeof MutationObserver === 'undefined') return;
    watching = true;
    const obs = new MutationObserver(backdrop);
    PANELS.forEach(p => { const el = node(p.id); if (el) obs.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
  }

  /* Called by shared systems after a save loads or a game starts. The game has
     one screen; the studio's main.js replaces this with its tab switch. */
  function show() {}

  WA.ui = { PANELS, isOpen, paused, anyOpen, close, closeAll, escape, backdrop, watch, show };
})(window.WA = window.WA || {});
