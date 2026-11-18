/* Rest and wait: pass whole hours on the same clock travel uses. The world is
   not frozen while you sleep — every hour gives each enemy one action, so a
   hostile that closes to within three tiles breaks camp. Rest recovers HP;
   wait only passes the time. Both refill AP and report the new day and time. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  const RADIUS = 3;

  const maxHp = () => (WA.char ? WA.char.maxHp() : 1);
  const maxAp = () => (WA.char ? WA.char.maxAp() : 0);
  const say = t => { if (WA.game && WA.game.say) WA.game.say(t); };

  function refresh() {
    const s = S();
    if (!s) return;
    if (WA.pip && WA.pip.isOpen()) WA.pip.render();
    if (WA.view) WA.view.draw();
    if (WA.save && !s.dead) WA.save.queueAutosave();
  }

  /* The nearest hostile inside the interruption radius, if any. */
  function threat(s) {
    s = s || S();
    if (!s) return null;
    let best = null, bd = Infinity;
    for (const e of s.ents || []) {
      if (!e || !e.d || e.hp <= 0 || e.d.talk || e.d.c === 'good') continue;
      const d = U.cheb(e.x, e.y, s.px, s.py);
      if (d <= RADIUS && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function die(s) {
    if (!s || s.hp > 0) return false;
    s.hp = 0;
    s.dead = true;
    say('You collapse in the dust. Game over.');
    if (WA.pip) WA.pip.close();
    if (WA.view) WA.view.draw();
    return true;
  }

  function run(hours, heal) {
    const s = S();
    if (!s || s.dead) return;
    hours = Math.max(1, Math.min(12, hours | 0));
    const near = threat(s);
    if (near) {
      say(`You cannot rest with a ${near.d.name.toLowerCase()} this close.`);
      return refresh();
    }

    let spent = 0, healed = 0, broken = null;
    for (let i = 0; i < hours; i++) {
      WA.time.advance(s, 60);
      spent++;
      if (WA.status) WA.status.tickPlayer(s);
      if (die(s)) return;
      if (WA.game.updateVis) WA.game.updateVis();
      if (WA.ai) WA.ai.turn();
      if (die(s)) return;
      if (WA.sched) WA.sched.sync(s);
      if (heal) {
        const max = maxHp();
        const gain = Math.min(Math.max(0, max - s.hp), Math.max(1, Math.round(max * 0.08)));
        if (gain > 0) { s.hp += gain; healed += gain; }
      }
      const now = threat(s);
      if (now) { broken = now; break; }
    }

    s.ap = maxAp();
    const label = WA.time.label(s);
    const gainTxt = heal && healed > 0 ? ` (+${healed} HP)` : '';
    if (broken) {
      say(`A ${broken.d.name.toLowerCase()} gets too close — you break camp after ` +
        `${spent} hour${spent === 1 ? '' : 's'}${gainTxt}. It is ${label}.`);
    } else {
      say(`You ${heal ? 'rest' : 'wait'} for ${spent} hour${spent === 1 ? '' : 's'}${gainTxt}. It is ${label}.`);
    }
    if (WA.bounty) WA.bounty.arrive(s);
    refresh();
  }

  function html() {
    const s = S();
    if (!s) return '';
    const near = threat(s);
    const dis = near ? ' disabled' : '';
    return `<div class="fieldpanel"><div class="fieldhead">REST <small class="dim">${WA.time.label(s)}</small></div>` +
      `<div class="fieldrow"><span>Wait <small class="dim">1 hour · no recovery</small></span>` +
        `<button data-rest="wait1"${dis}>1h</button></div>` +
      `<div class="fieldrow"><span>Rest <small class="dim">recovers HP · 8% an hour</small></span>` +
        `<button data-rest="rest4"${dis}>4h</button><button data-rest="rest8"${dis}>8h</button></div>` +
      (near
        ? `<div class="dim" style="font-size:12px;color:var(--bad)">A ${U.esc(near.d.name.toLowerCase())} is within ${RADIUS} tiles.</div>`
        : `<div class="dim" style="font-size:12px">A hostile within ${RADIUS} tiles interrupts a rest.</div>`) +
      `</div>`;
  }

  function act(action) {
    if (action === 'wait1') return run(1, false);
    if (action === 'rest4') return run(4, true);
    if (action === 'rest8') return run(8, true);
  }

  WA.rest = { act, html, run, threat, RADIUS };
})(window.WA = window.WA || {});
