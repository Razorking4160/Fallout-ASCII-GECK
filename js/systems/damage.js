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

  WA.damage = { TYPES, BYPASS_ARMOR, resistance, against, againstAmmo, toPlayer };
})(window.WA = window.WA || {});
