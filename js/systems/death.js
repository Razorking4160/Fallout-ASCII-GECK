/* Death screen: restore a save or start over. Autosave is deliberately
   skipped while `dead` is set, so loading the autosave returns to the last
   living state rather than reopening the death screen. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const isOpen = () => { const el = U.el('death'); return !!el && !el.hidden; };

  function render() {
    const el = U.el('death');
    if (!el) return;
    const s = S();
    const rows = WA.save && WA.save.deathHtml ? WA.save.deathHtml() : '';
    U.setHtml('death',
      `<div class="prow"><span class="hero">YOU DIED</span><small class="dim">GAME OVER</small></div>` +
      `<div class="dim" style="font-size:12px;margin:2px 0 6px">Load a save to continue, or restart at your home map.</div>` +
      rows +
      `<div class="use"><button data-death-restart="1">Restart</button></div>` +
      (s && s.test ? '<div class="dim" style="font-size:12px">Test mode never writes a save.</div>' : ''));
  }

  function open() {
    const s = S(), el = U.el('death');
    if (!s || !s.dead || !el) return false;
    render();
    el.hidden = false;
    bind();
    return true;
  }

  function close() {
    const el = U.el('death');
    if (el) el.hidden = true;
  }

  /* Called from the HUD after every draw, so death is visible even when the
     last HP loss comes from a status tick or an enemy reaction. */
  function sync() {
    const s = S();
    if (!s) return;
    if (s.dead) {
      if (!isOpen()) open();
    } else if (isOpen()) close();
  }

  async function load(id) {
    if (!WA.save) return false;
    const ok = await WA.save.load(id);
    if (ok) {
      close();
      if (WA.view) WA.view.draw();
      return true;
    }
    WA.game.say('That save could not be loaded.');
    render();
    if (WA.view) WA.view.draw();
    return false;
  }

  function restart() {
    const s = S();
    close();
    if (!s) return;
    WA.game.newGame(s.home || 'vault', !!s.test);
  }

  function bind() {
    const el = U.el('death');
    if (!el || el._dbound) return;
    el._dbound = 1;
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.deathLoad) load(b.dataset.deathLoad);
      else if (b.dataset.deathRestart) restart();
    });
  }

  WA.death = { open, close, sync, load, restart, render, isOpen, bind };
})(window.WA = window.WA || {});
