/* Player limb condition. Physical hits can cripple an arm or leg; crippled
   arms reduce accuracy and crippled legs reduce the AP ceiling. */
(function (WA) {
  'use strict';

  const MAX = 100;
  const DEFS = {
    l_arm: { name: 'left arm', short: 'L.ARM', kind: 'arm' },
    r_arm: { name: 'right arm', short: 'R.ARM', kind: 'arm' },
    l_leg: { name: 'left leg', short: 'L.LEG', kind: 'leg' },
    r_leg: { name: 'right leg', short: 'R.LEG', kind: 'leg' }
  };
  const IDS = Object.keys(DEFS);

  function fresh() {
    const out = {};
    for (const id of IDS) out[id] = MAX;
    return out;
  }

  // Old saves and imported worlds predate limbs, so missing or malformed
  // values become healthy limbs instead of breaking combat.
  function ensure(s) {
    if (!s) return null;
    if (!s.limbs || typeof s.limbs !== 'object') s.limbs = {};
    for (const id of IDS) {
      const v = s.limbs[id];
      s.limbs[id] = typeof v === 'number' && isFinite(v)
        ? Math.max(0, Math.min(MAX, Math.round(v))) : MAX;
    }
    return s.limbs;
  }

  function condition(s, id) {
    if (!s || !DEFS[id]) return MAX;
    ensure(s);
    return s.limbs[id];
  }

  function list(s) {
    ensure(s);
    return IDS.map(id => ({
      id, ...DEFS[id], condition: s ? s.limbs[id] : MAX,
      crippled: !!s && s.limbs[id] <= 0
    }));
  }

  function crippled(s) {
    return list(s).filter(l => l.crippled);
  }

  /* Called after physical damage reaches the player. Torso hits are common,
     and a limb only gives out when its condition reaches zero. */
  function injure(s, dmg, type) {
    if (!s || !(dmg > 0) || type === 'radiation' || type === 'poison') return null;
    ensure(s);
    const healthy = IDS.filter(id => s.limbs[id] > 0);
    if (!healthy.length) return null;
    if (Math.random() > 0.5) return null;
    const id = healthy[Math.floor(Math.random() * healthy.length)];
    const before = s.limbs[id];
    const loss = Math.max(20, Math.round(dmg * (type === 'explosive' ? 7 : 5)));
    const after = Math.max(0, before - loss);
    s.limbs[id] = after;
    if (after === 0) s.ap = Math.min(s.ap | 0, WA.char ? WA.char.maxAp() : s.ap | 0);
    return { id, def: DEFS[id], before, condition: after, newlyCrippled: after === 0 };
  }

  const current = s => s || (WA.game && WA.game.S);

  function aimPenalty(s) {
    return crippled(current(s)).filter(l => l.kind === 'arm').length * 20;
  }

  function apPenalty(s) {
    return crippled(current(s)).filter(l => l.kind === 'leg').length;
  }

  function healAll(s) {
    ensure(s);
    let n = 0;
    for (const id of IDS) {
      if (s.limbs[id] < MAX) { s.limbs[id] = MAX; n++; }
    }
    if (n && WA.char) s.ap = Math.min(s.ap | 0, WA.char.maxAp());
    return n;
  }

  function tag(s) {
    const broken = crippled(current(s));
    return broken.length ? broken.map(l => l.short).join(' · ') : '';
  }

  function line(s) {
    return list(current(s)).map(l => `${l.short} ${l.condition}`).join(' · ');
  }

  function html(s) {
    const parts = list(current(s)).map(l => {
      const cls = l.crippled ? 'bad' : l.condition < 50 ? 'warn' : '';
      return `<span class="${cls}">${l.short} ${l.condition}</span>`;
    });
    return `<div class="prow"><span>LIMBS <small class="dim">${parts.join(' · ')}</small></span></div>`;
  }

  WA.limbs = { MAX, DEFS, IDS, fresh, ensure, condition, list, crippled, injure,
    aimPenalty, apPenalty, healAll, tag, line, html };
})(window.WA = window.WA || {});
