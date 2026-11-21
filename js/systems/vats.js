/* VATS: pause, pick a target, pick a body part, spend AP. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const PARTS = [
    { n: 'Head', pen: 25, mul: 2 },
    { n: 'Torso', pen: 0, mul: 1 },
    { n: 'L. arm', pen: 10, mul: 0.8, weak: 1 },
    { n: 'R. arm', pen: 10, mul: 0.8, weak: 1 },
    { n: 'L. leg', pen: 5, mul: 0.6, cripple: 4 },
    { n: 'R. leg', pen: 5, mul: 0.6, cripple: 4 }
  ];

  let VS = 0, VT = null;
  const reset = () => { VS = 0; VT = null; };
  // One source of truth: Fire, a melee bump and VATS charge the same AP.
  const cost = () => (WA.combat ? WA.combat.attackCost(WA.GAME.items[S().weapon] || {}) : 4);
  const range = () => (WA.GAME.items[S().weapon] || {}).range || 1;
  const vhit = (e, p) => {
    const wp = WA.GAME.items[S().weapon] || {};
    return WA.skills.chanceFor(WA.skills.weaponSkill(wp), U.cheb(e.x, e.y, S().px, S().py), p.pen, wp);
  };
  const targets = () => S().ents.filter(e => !(e.d && (e.d.talk || e.d.ally)) && U.cheb(e.x, e.y, S().px, S().py) <= range() && WA.vis.los(S().px, S().py, e.x, e.y));

  const btn = 'style="width:68px;font-size:14px"';
  const setBtn = 'style="width:50px;font-size:11px"';
  const wide = 'style="height:36px;width:100%;margin-top:6px;font-size:14px"';

  function ui() {
    const s = S();
    const box = U.el('vats');
    if (!s) { box.hidden = true; return; }
    if (s.dead) VS = 0;
    if (VS === 2 && (!VT || !s.ents.includes(VT))) { VS = 1; VT = null; }
    box.hidden = !VS;
    if (!VS) return;

    const wp = WA.GAME.items[s.weapon] || {};
    const ammoId = wp.ammo ? WA.inv.loadedAmmo(wp) : null;
    const ammo = ammoId && WA.GAME.items[ammoId]
      ? ` · ${U.esc(WA.GAME.items[ammoId].name)} ${WA.inv.ammoCount(ammoId)}`
      : '';
    const ammoBtn = wp.ammo && WA.inv.ammoIdsFor(wp).filter(id => WA.inv.ammoCount(id) > 0).length > 1
      ? `<button data-ammo="next" style="width:54px;font-size:11px">Ammo</button>` : '';
    const cnd = s.weapon ? WA.weapons.condOf(s.weapon) : WA.weapons.MAX;
    const wear = cnd < WA.weapons.MAX ? ` · CND ${cnd}%` : '';

    if (VS === 1) {
      const ts = targets();
      U.setHtml('vats', `<div class="prow"><span>VATS · AP ${s.ap}/${WA.char.maxAp()} · ${cost()} per shot${wear}${ammo}</span>` +
        ammoBtn + `<button class="closex" data-close="vats" aria-label="Close VATS">×</button></div>` +
        (ts.length
          ? ts.map((e, i) => {
            const tag = WA.status.tag(e.fx);
            const pick = WA.combat && WA.combat.selected && WA.combat.selected() === e;
            return `<div class="prow"><span>${pick ? '<b class="warn">TGT</b> ' : ''}${U.esc(e.d.name)} <small class="dim">HP ${e.hp}/${WA.scale.mobHp(e.d)}</small>` +
              (tag ? ` <small class="bad">${U.esc(tag)}</small>` : '') +
              `</span><button data-vf="${i}" ${setBtn}>Set</button><button data-vt="${i}" ${btn}>Aim</button></div>`;
          }).join('')
          : '<div class="dim">No targets in range.</div>') +
        `<button data-vx="1" ${wide}>Close</button>`);
    } else {
      const fast = WA.traits && WA.traits.has('fast_shot');
      const choices = fast ? [1] : PARTS.map((_, i) => i);
      U.setHtml('vats', `<div class="prow"><span>${U.esc(VT.d.name)} · HP ${VT.hp}/${WA.scale.mobHp(VT.d)} · AP ${s.ap}` +
        (fast ? ' · FAST SHOT' : '') + `</span><button class="closex" data-close="vats" aria-label="Close VATS">×</button></div>` +
        choices.map(i => {
          const p = PARTS[i];
          const note = p.mul > 1 ? 'double damage' : p.cripple ? 'slows it' : p.weak ? 'weakens it' : '';
          return `<div class="prow"><span>${p.n} <small class="dim">${vhit(VT, p)}%${note ? ' ' + note : ''}</small></span>` +
            `<button data-vp="${i}" ${s.ap < cost() ? 'disabled' : ''} ${btn}>Go</button></div>`;
        }).join('') +
        (fast ? '<div class="dim" style="font-size:12px">Fast Shot: aimed shots are unavailable.</div>' : '') +
        `<button data-vx="1" ${wide}>Back</button>`);
    }
  }

  function close() {
    VS = 0;
    VT = null;
    ui();
  }

  function toggle() {
    const s = S();
    // VATS itself may be open (v closes it), but no other panel may be.
    if (!s || s.dead || (WA.ui.anyOpen() && !WA.ui.isOpen('vats'))) return;
    VS = VS ? 0 : 1;
    VT = null;
    ui();
  }

  function shot(p) {
    const s = S();
    // The world's turn is still playing out; a shot now would spend a turn that
    // has not started yet.
    if (WA.turn && WA.turn.busy && WA.turn.busy()) return;
    if (!VT || s.ap < cost() || !s.ents.includes(VT)) { VS = 1; return ui(); }
    const wp = WA.GAME.items[s.weapon] || {};
    if (s.weapon && WA.weapons.isBroken(s.weapon)) {
      WA.game.say(`Your ${wp.name} is broken.`);
      VS = 1;
      return ui();
    }
    const ammoId = wp.ammo ? WA.inv.loadedAmmo(wp) : null;
    if (wp.ammo && !WA.inv.ammoCount(ammoId)) {
      WA.game.say('Out of ammo.');
      VS = 1;
      return ui();
    }
    if (WA.traits && WA.traits.has('fast_shot')) p = PARTS[1];
    WA.combat.initiative();
    if (s.dead || s.hp <= 0) { VS = 0; return ui(); }
    const ap = cost();
    if (s.ap < ap) { VS = 1; return ui(); }
    WA.inv.spendAmmo(ammoId);
    if (WA.weapons.use() === 'jam') {
      WA.game.say(`Your ${wp.name} jams!`);
      WA.turn.end(true, ap);
      ui();
      return;
    }
    if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
      WA.game.say(`Jinxed! Your ${wp.name || 'weapon'} slips and the shot goes wild.`);
    } else if (WA.combat && WA.combat.criticalFailure(wp, true)) {
      // The fumble still spends the AP, ammo and turn.
    } else if (Math.random() * 100 > vhit(VT, p)) {
      WA.game.say(`VATS ${p.n.toLowerCase()}: you miss.`);
    } else {
      WA.combat.playerAttack(VT, { mul: p.mul, cripple: p.cripple, weak: p.weak, ammo: ammoId, tag: `VATS ${p.n.toLowerCase()}: ` });
    }
    WA.turn.end(true, ap);
    if (s.dead) VS = 0;
    else if (!s.ents.includes(VT)) { VS = 1; VT = null; }
    ui();
  }

  function bind() {
    U.el('vats').addEventListener('click', e => {
      const b = e.target.closest('button');
      const s = S();
      if (!b || !s || s.dead) return;
      if (b.dataset.vx) { VS = VS === 2 ? 1 : 0; VT = null; }
      else if (b.dataset.ammo) { WA.inv.cycleAmmo(); }
      else if (b.dataset.vf != null) {
        // Mark a Fire target without spending AP or taking a called shot.
        const pick = targets()[+b.dataset.vf];
        if (pick) { WA.combat.select(pick); VS = 0; VT = null; }
      }
      else if (b.dataset.vt) { VT = targets()[+b.dataset.vt]; if (VT) VS = 2; }
      else if (b.dataset.vp) shot(PARTS[+b.dataset.vp]);
      ui();
    });
  }

  WA.vats = { toggle, close, ui, shot, bind, reset, PARTS };
})(window.WA = window.WA || {});
