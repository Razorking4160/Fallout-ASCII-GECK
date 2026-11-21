/* Damage types and resistances. Definitions store percentages, so a ghoul can
   resist radiation while taking full ballistic damage. */
(function (WA) {
  'use strict';

  const TYPES = ['melee', 'ballistic', 'energy', 'explosive', 'fire', 'poison', 'radiation'];
  const BYPASS_ARMOR = { radiation: 1, poison: 1 };

  // Resistance for one type, as a fraction. Negative values are weaknesses.
  function resistance(def, type) {
    const r = def && def.res && def.res[type];
    if (typeof r !== 'number' || !isFinite(r)) return 0;
    return Math.max(-1, Math.min(0.95, r / 100));
  }

  // Damage dealt to an enemy, after its resistances.
  function against(enemy, amount, type) {
    return againstAmmo(enemy, amount, type, null);
  }

  /* Ammo modifiers are percentage points: `pen` lowers positive resistance and
     `resMod` raises it. JHP therefore excels against soft targets while AP cuts
     through armour without turning an unarmoured target into a weak point. */
  function againstAmmo(enemy, amount, type, ammo) {
    const base = resistance(enemy && enemy.d, type);
    const pen = ammo && isFinite(ammo.pen) ? ammo.pen : 0;
    const resMod = ammo && isFinite(ammo.resMod) ? ammo.resMod : 0;
    const raw = base + resMod / 100;
    const res = Math.max(-1, Math.min(0.95, raw > 0 ? Math.max(0, raw - pen / 100) : raw));
    const value = Math.max(1, Math.round(amount * (1 - res)));
    return { value, res, type };
  }

  // Damage dealt to the player. Radiation and poison ignore armour entirely.
  // Armour resistance is a fraction applied first, then flat protection.
  function toPlayer(amount, type, armorDef, armorRes) {
    if (BYPASS_ARMOR[type]) return Math.max(1, Math.round(amount));
    const r = Math.max(-0.95, Math.min(0.9, armorRes || 0));
    return Math.max(1, Math.round(amount * (1 - r) - (armorDef || 0)));
  }

  /* One path for damage dealt to the player. Armour, traits, perks, difficulty,
     resist chems, limb injury and rads all happen here, so no call site can
     forget a step; the returned limb is the one that just gave out. */
  function hurtPlayer(raw, type) {
    const s = WA.game.S;
    if (!s || s.dead) return { value: 0, limb: null };
    let value = toPlayer(raw, type, WA.weapons.armorDef(), WA.weapons.armorRes(type));
    if (WA.traits) value = Math.round(value * WA.traits.hazardMul(type));
    // Toughness adds percentage resistance after armour; buffs soak direct hits.
    if (WA.perks) value = WA.perks.reduce(value, type);
    if (WA.settings) value = Math.max(1, Math.round(value * WA.settings.incomingMul()));
    const shield = BYPASS_ARMOR[type] ? 0 : (WA.status ? WA.status.mod('resist') : 0);
    if (shield) value = Math.max(1, value - shield);
    s.hp -= value;
    if (WA.fx) WA.fx.hit(s.px, s.py, value, true);
    if (WA.sfx) WA.sfx.hit(true);
    if (!BYPASS_ARMOR[type] && raw > value) WA.weapons.wearArmor(raw - value);
    if (WA.rads) WA.rads.expose(type, value);
    const limb = WA.limbs ? WA.limbs.injure(s, value, type) : null;
    return { value, limb };
  }

  /* One path for damage dealt to an enemy: resistance, plus the ammo modifiers
     when a round is supplied. slay() then does the kill bookkeeping, so a
     caller that has more to say can finish its line first. */
  function hurtEnemy(target, amount, type, ammo) {
    const hit = ammo ? againstAmmo(target, amount, type, ammo) : against(target, amount, type);
    if (target && target.d) {
      target.hp -= hit.value;
      if (WA.fx) WA.fx.hit(target.x, target.y, hit.value, false);
      if (WA.sfx) WA.sfx.hit(false);
    }
    return hit;
  }

  function slay(e, msg) {
    const s = WA.game.S;
    if (!e || !e.d || e.hp > 0 || !s || !Array.isArray(s.ents) || !s.ents.includes(e)) return false;
    if (WA.fx) WA.fx.death(e.x, e.y);
    if (WA.sfx) WA.sfx.death();
    if (WA.combat && WA.combat.kill) WA.combat.kill(e, msg);
    return true;
  }

  WA.damage = { TYPES, BYPASS_ARMOR, resistance, against, againstAmmo, toPlayer, hurtPlayer, hurtEnemy, slay };
})(window.WA = window.WA || {});
