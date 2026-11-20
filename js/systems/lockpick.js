/* Lockpicking: a hidden sweet spot on a nine-notch dial. Nudge the pin, try
   it, listen to the mechanism. A probe that is close only slips; a probe that
   is forced far from the spot snaps a bobby pin. Luck widens the spot. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const SLOTS = 9;

  let KEY = '', POS = 4, TARGET = 4, FEED = '';

  const isOpen = () => { const el = U.el('lock'); return !!el && !el.hidden; };
  const defAt = k => {
    const s = S();
    const id = s && s.items && s.items[k];
    return id && WA.GAME.items[id];
  };
  const pins = () => WA.inv.owned('bobby_pin');

  /* The Lockpick skill widens the sweet spot; harder locks narrow it. */
  function slack(d) {
    const s = S();
    if (!s) return 1;
    let w = (d.lock | 0) >= 3 ? 0 : (d.lock | 0) === 2 ? 1 : 2;
    const skill = WA.skills ? WA.skills.value('lockpick') : 20;
    if (skill < 25) w--;
    if (skill >= 50) w++;
    if (skill >= 75) w++;
    if (skill >= 100) w++;
    if (s.sp.L >= 8) w++;
    if (WA.perks && WA.perks.rank('master_thief')) w++;
    return U.clamp(w, 0, 4);
  }

  function render() {
    const d = defAt(KEY), el = U.el('lock');
    if (!d || !el) return;
    const slots = Array.from({ length: SLOTS }, (_, i) => (i === POS ? '^' : '·')).join(' ');
    const nums = Array.from({ length: SLOTS }, (_, i) => String(i)).join(' ');
    const diff = ['', 'EASY', 'AVERAGE', 'HARD'][d.lock | 0] || 'LOCKED';
    const trap = WA.field && WA.field.containerTrapStatus ? WA.field.containerTrapStatus(KEY) : '';
    const trapLine = trap ? `<div class="loottrap ${trap === 'armed' ? 'bad' : 'good'}">TRAP: ${trap === 'armed' ? 'TRAPPED' : 'DISARMED'}</div>` : '';
    U.setHtml('lock',
      `<div class="prow"><span class="hero">${U.esc(String(d.name).toUpperCase())}</span>` +
      `<span class="acts"><small class="dim">${diff} LOCK</small>` +
      `<button class="closex" data-close="lock" aria-label="Close lockpicking">×</button></span></div>` +
      trapLine +
      `<div class="lockdial">${nums}\n${slots}</div>` +
      `<div class="prow"><span class="dim">BOBBY PINS</span><span>${pins()}</span></div>` +
      `<div class="prow"><span class="dim">LOCKPICK</span><span>${WA.skills.value('lockpick')}%</span></div>` +
      `<div class="lockmsg">${U.esc(FEED)}</div>` +
      `<div class="use"><button data-lp="-1">◀</button><button data-pt="1">Try</button>` +
      `<button data-lp="1">▶</button><button data-lx="1">Give up</button></div>`);
  }

  function start(k) {
    const s = S(), d = defAt(k);
    if (!s || s.dead || !d || !d.lock) return false;
    if (pins() < 1) { WA.game.say(`The ${d.name} is locked. You have no bobby pins.`); WA.view.draw(); return false; }
    if (WA.pip) WA.pip.close();
    if (WA.dlg) WA.dlg.close();
    if (WA.loot) WA.loot.abort();
    KEY = k;
    // You turn to the lock you are working on.
    const [kx, ky] = String(k).split(',').map(Number);
    if (Number.isFinite(kx) && Number.isFinite(ky)) {
      s.face = WA.util.faceTo(kx - s.px, ky - s.py) || s.face || 's';
    }
    POS = 4;
    TARGET = Math.floor(Math.random() * SLOTS);
    FEED = 'The lock is stiff.';
    const el = U.el('lock');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function abort() {
    const el = U.el('lock');
    if (el) el.hidden = true;
    KEY = ''; POS = 4; FEED = '';
  }

  function close(msg) {
    const name = defAt(KEY) ? defAt(KEY).name : '';
    abort();
    if (msg) WA.game.say(msg);
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
    return name;
  }

  function move(dir) {
    if (!isOpen()) return false;
    POS = U.clamp(POS + (dir | 0), 0, SLOTS - 1);
    render();
    return true;
  }

  function unlock() {
    const key = KEY, d = defAt(key);
    const st = WA.loot.ensure(key);
    if (st) st.open = 1;
    const name = d ? d.name : 'lock';
    close(`The ${name} clicks open.`);
    WA.loot.open(key);
  }

  function tryPick() {
    const s = S(), d = defAt(KEY);
    if (!s || !d || !isOpen()) return;
    const dist = Math.abs(POS - TARGET);
    if (dist === 0) { unlock(); return; }
    if (dist <= slack(d)) { FEED = 'The pin almost turns.'; render(); return; }
    if (pins() < 1) { close('You have no bobby pins left.'); return; }
    s.inv.splice(s.inv.indexOf('bobby_pin'), 1);
    FEED = POS < TARGET
      ? 'The pin snaps. The mechanism wants it further right.'
      : 'The pin snaps. The mechanism wants it further left.';
    if (pins() < 1) { close('Your last bobby pin snaps.'); return; }
    render();
  }

  WA.lockpick = {
    start, abort, close, move, tryPick, isOpen, slack,
    get target() { return TARGET; },
    get pos() { return POS; }
  };
})(window.WA = window.WA || {});
