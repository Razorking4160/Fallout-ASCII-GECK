/* Weapon condition. Each weapon id has a condition from 0 to 100 that drops
   with use, weakens damage, can jam a gun and eventually breaks it. */
(function (WA) {
  'use strict';

  const MAX = 100;

  const condOf = id => {
    const s = WA.game.S;
    if (!s || !id) return MAX;
    const c = (s.cond || {})[id];
    return typeof c === 'number' ? Math.max(0, Math.min(MAX, c)) : MAX;
  };

  const isBroken = id => !!id && condOf(id) <= 0;
  // A worn weapon still works, just not as hard.
  const factor = id => 0.55 + 0.45 * (condOf(id) / MAX);

  function set(id, v) {
    const s = WA.game.S;
    if (!s || !id) return;
    if (!s.cond) s.cond = {};
    s.cond[id] = Math.max(0, Math.min(MAX, Math.round(v)));
  }

  // Give a weapon a full condition the first time it is picked up.
  function fresh(id) {
    const s = WA.game.S;
    if (!s || !id) return;
    if (!s.cond) s.cond = {};
    if (typeof s.cond[id] !== 'number') s.cond[id] = MAX;
  }

  /* Called once per attack attempt. Applies wear and reports a jam.
     Returns 'ok' or 'jam'. Fists never wear out. */
  function use() {
    const s = WA.game.S;
    if (!s || !s.weapon) return 'ok';
    const wp = WA.GAME.items[s.weapon];
    if (!wp) return 'ok';

    const before = condOf(s.weapon);
    const loss = Math.max(0, wp.wear || ((wp.range || 1) > 1 ? 2 : 1));
    const after = Math.max(0, before - loss);
    set(s.weapon, after);

    if (before > 50 && after <= 50) WA.game.say(`${wp.name} is showing wear.`);
    if (before > 25 && after <= 25) WA.game.say(`${wp.name} is in poor condition.`);
    if (before > 0 && after === 0) WA.game.say(`${wp.name} breaks!`);

    const ranged = (wp.range || 1) > 1;
    if (ranged && after < 30 && Math.random() < (30 - after) / 100) return 'jam';
    return 'ok';
  }

  /* Armour loses condition as it soaks damage, which weakens its protection. */
  function armorDef() {
    const s = WA.game.S;
    if (!s || !s.armor) return 0;
    const c = condOf(s.armor);
    if (c <= 0) return 0; // ruined armour protects nothing
    const d = WA.GAME.items[s.armor] || {};
    return Math.max(0, Math.round((d.def || 0) * (0.6 + 0.4 * c / MAX)));
  }

  /* Armour resistance for one damage type, as a fraction, weakened with wear. */
  function armorRes(type) {
    const s = WA.game.S;
    if (!s || !s.armor) return 0;
    const c = condOf(s.armor);
    if (c <= 0) return 0;
    const d = WA.GAME.items[s.armor] || {};
    const r = d.res && d.res[type];
    if (typeof r !== 'number' || !isFinite(r)) return 0;
    return (Math.max(-100, Math.min(95, r)) / 100) * (0.6 + 0.4 * c / MAX);
  }

  /* Armour Class is Agility plus the armour's AC, weakened by wear. Kamikaze
     removes the Agility contribution but not the armour itself. */
  function armorAc() {
    const s = WA.game.S;
    if (!s || !s.armor) return 0;
    const c = condOf(s.armor);
    if (c <= 0) return 0;
    const d = WA.GAME.items[s.armor] || {};
    return Math.max(0, Math.round((d.ac || 0) * (0.6 + 0.4 * c / MAX)));
  }

  function playerAc() {
    const s = WA.game.S;
    if (!s) return 0;
    const sp = WA.traits ? WA.traits.sp(s.sp)
      : (WA.addiction ? WA.addiction.sp(s.sp) : s.sp);
    const base = WA.traits && WA.traits.acZero() ? 0 : (sp.A | 0);
    return base + armorAc() + (WA.perks ? WA.perks.acBonus() : 0);
  }

  function wearArmor(absorbed) {
    const s = WA.game.S;
    if (!s || !s.armor || absorbed <= 0) return;
    const d = WA.GAME.items[s.armor] || {};
    const before = condOf(s.armor);
    const after = Math.max(0, before - Math.max(1, Math.round(absorbed / 2)));
    set(s.armor, after);
    if (before > 50 && after <= 50) WA.game.say(`${d.name} is showing wear.`);
    if (before > 25 && after <= 25) WA.game.say(`${d.name} is in poor condition.`);
    if (before > 0 && after === 0) WA.game.say(`${d.name} falls apart!`);
  }

  WA.weapons = { MAX, condOf, isBroken, factor, set, fresh, use, armorDef, armorRes, armorAc, playerAc, wearArmor };
})(window.WA = window.WA || {});
