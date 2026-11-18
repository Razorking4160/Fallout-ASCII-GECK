/* Boot menu: a short skippable intro, then Load / New game / Options over the
   game shell. The menu does not load a save until the player chooses one. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const LINES = [
    'WAR. WAR NEVER CHANGES.',
    'In 2161, the water chip that keeps Vault 13 alive begins to fail.',
    'The Overseer chooses one Vault Dweller to step outside.',
    'Beyond the vault door: rust, radiation, and the ruins of the old world.',
    'Find a replacement chip. Save the vault. Survive the wasteland.'
  ];
  const ART = [
    '       _____________',
    '      /             \\',
    '     /   ___   ___   \\',
    '    |   |   | |   |   |',
    '    |   | O | | O |   |',
    '    |   |___| |___|   |',
    '     \\               /',
    '      \\_____________/'
  ].join('\n');

  const START_DELAY = 1100, LINE_DELAY = 1600;
  let OPEN = false, SCREEN = 'menu', TIMER = null, LINE = 0;

  const el = () => U.el('menu');
  const clearTimer = () => { if (TIMER) { clearTimeout(TIMER); TIMER = null; } };

  function menuButton(action, label, cls) {
    return `<button type="button" class="menu-action${cls ? ' ' + cls : ''}" data-menu="${action}">${label}</button>`;
  }

  function showMenu() {
    clearTimer();
    SCREEN = 'menu';
    U.setHtml('menu',
      `<div class="menu-inner menu-home">` +
      `<div class="menu-kicker">VAULT 13 · 2161</div>` +
      `<div class="menu-title">WASTELAND</div>` +
      `<div class="menu-sub">A post-nuclear ASCII journey</div>` +
      `<div class="menu-actions">${menuButton('load', 'Load')}${menuButton('new', 'New game')}${menuButton('options', 'Options')}</div>` +
      `<div class="menu-foot">Build v${U.esc(WA.VERSION || '0')} · offline-ready</div></div>`);
  }

  function showIntro() {
    clearTimer();
    SCREEN = 'intro';
    LINE = 0;
    U.setHtml('menu',
      `<div class="menu-inner menu-intro">` +
      `<pre class="menu-art">${U.esc(ART)}</pre>` +
      `<div class="menu-kicker">VAULT 13 · 2161</div>` +
      `<div id="introLines" class="intro-lines" aria-live="polite"></div>` +
      `<button type="button" class="menu-skip" data-menu="skip">Skip intro</button></div>`);
    if (WA.settings && WA.settings.anim) TIMER = setTimeout(nextLine, START_DELAY);
    else {
      const box = U.el('introLines');
      if (box) box.textContent = LINES.join('\n');
      showContinue();
    }
  }

  function nextLine() {
    if (!OPEN || SCREEN !== 'intro') return;
    const box = U.el('introLines');
    if (box) box.textContent = LINES.slice(0, LINE + 1).join('\n');
    LINE++;
    if (LINE < LINES.length) TIMER = setTimeout(nextLine, LINE_DELAY);
    else {
      TIMER = null;
      showContinue();
    }
  }

  function showContinue() {
    const b = document.querySelector('#menu [data-menu="skip"]');
    if (!b) return;
    b.dataset.menu = 'continue';
    b.textContent = 'Continue';
    b.classList.remove('menu-skip');
    b.classList.add('menu-continue');
  }

  function fmtStamp(m) {
    if (!m) return 'empty';
    const d = new Date(m.at || 0);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${U.esc(m.label || 'Unknown')} · Lv ${m.lvl || 1} · ${date} ${time}`;
  }

  function showLoad() {
    clearTimer();
    SCREEN = 'load';
    const ids = ['auto'].concat((WA.save && WA.save.SLOTS) || []);
    const names = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };
    const rows = ids.map(id => {
      const m = WA.save && WA.save.meta && WA.save.meta[id];
      return `<div class="menu-save"><div class="menu-save-text"><b>${names[id] || id}</b>` +
        `<small>${fmtStamp(m)}</small></div>` +
        `<button type="button" data-save="${U.esc(id)}"${m ? '' : ' disabled'}>Load</button></div>`;
    }).join('');
    U.setHtml('menu',
      `<div class="menu-inner"><div class="menu-head"><span class="menu-kicker">VAULT ARCHIVE</span>` +
      `<button type="button" class="menu-back" data-menu="back">Back</button></div>` +
      `<div class="menu-title menu-title-small">LOAD</div>` +
      `<div class="menu-saves">${rows}</div>` +
      `<div id="menuMsg" class="menu-msg"></div>` +
      `<div class="menu-foot">Select a save file to continue.</div></div>`);
  }

  function optionRow(id, label, on) {
    return `<label class="menu-option"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;
  }

  function difficultyRow() {
    const cur = WA.settings.difficulty;
    const buttons = WA.settings.DIFFS.map(d =>
      `<button type="button" data-diff="${d.id}" style="width:62px;font-size:12px;padding:5px 2px;` +
      `${d.id === cur ? 'background:#ffb000;color:#15100a;border-color:#ffb000;' : ''}">${d.name}</button>`).join(' ');
    return `<div class="menu-option"><span>Difficulty</span><span>${buttons}</span></div>` +
      `<div class="menu-msg" style="min-height:34px">${U.esc(WA.settings.difficultyDef.desc)}</div>`;
  }

  function showOptions() {
    clearTimer();
    SCREEN = 'options';
    U.setHtml('menu',
      `<div class="menu-inner"><div class="menu-head"><span class="menu-kicker">SYSTEM</span>` +
      `<button type="button" class="menu-back" data-menu="back">Back</button></div>` +
      `<div class="menu-title menu-title-small">OPTIONS</div>` +
      `<div class="menu-options">` +
      difficultyRow() +
      optionRow('optAnim', 'Animated effects', WA.settings.anim) +
      optionRow('optCrt', 'CRT scanlines and glow', WA.settings.crt) +
      optionRow('optFog', 'Fog of war', WA.settings.fog) +
      `</div><div class="menu-foot">Changes apply immediately and are remembered on this device. Difficulty affects new damage, hit rolls, finds and shop restock.</div></div>`);
  }

  async function loadSave(id) {
    if (!WA.save) return;
    const msg = U.el('menuMsg');
    if (msg) msg.textContent = 'Loading…';
    const ok = await WA.save.load(id);
    if (!ok) {
      if (msg) msg.textContent = 'That save could not be loaded.';
      return;
    }
    close();
    if (WA.ui) WA.ui.show('play');
    if (WA.view) WA.view.draw();
  }

  function newGame() {
    close();
    if (WA.ui) WA.ui.show('play');
    WA.game.newGame('vault');
  }

  function bind() {
    const box = el();
    if (!box || box._menuBound) return;
    box._menuBound = true;
    box.addEventListener('click', e => {
      const save = e.target.closest('[data-save]');
      if (save) return loadSave(save.dataset.save);
      const diff = e.target.closest('[data-diff]');
      if (diff) {
        WA.settings.setDifficulty(diff.dataset.diff);
        return showOptions();
      }
      const b = e.target.closest('[data-menu]');
      if (!b) return;
      const action = b.dataset.menu;
      if (action === 'skip' || action === 'continue') return showMenu();
      if (action === 'load') return showLoad();
      if (action === 'new') return newGame();
      if (action === 'options') return showOptions();
      if (action === 'back') return showMenu();
    });
    box.addEventListener('change', e => {
      if (!WA.settings) return;
      if (e.target.id === 'optAnim') WA.settings.setAnim(e.target.checked);
      else if (e.target.id === 'optCrt') WA.settings.setCrt(e.target.checked);
      else if (e.target.id === 'optFog') WA.settings.setFog(e.target.checked);
    });
    addEventListener('keydown', e => {
      if (!OPEN) return;
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      if (SCREEN === 'intro' || SCREEN === 'load' || SCREEN === 'options') {
        e.preventDefault();
        showMenu();
      }
    });
  }

  function open(opts) {
    const box = el();
    if (!box) return false;
    OPEN = true;
    box.hidden = false;
    document.body.classList.add('menu-open');
    bind();
    if (opts && opts.intro) showIntro();
    else showMenu();
    return true;
  }

  function close() {
    clearTimer();
    OPEN = false;
    const box = el();
    if (box) box.hidden = true;
    document.body.classList.remove('menu-open');
  }

  WA.menu = { open, close, showMenu, isOpen: () => OPEN };
})(window.WA = window.WA || {});
