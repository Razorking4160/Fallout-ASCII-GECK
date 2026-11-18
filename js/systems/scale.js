/* Progression scaling for a long campaign: one level cap and XP curve for the
   player, level bonuses, scaling for levelled enemies and quest rewards, and a
   small award for reaching a map for the first time. */
(function (WA) {
  'use strict';

  const CAP = 100;
  const HP_PER_LEVEL = 3;
  const DISCOVER_XP = 12;

  const clampLvl = v => Math.max(1, Math.min(CAP, v | 0));

  /* XP needed to go from `lvl` to lvl+1. Early levels are quick; by the cap a
     level costs about 20k XP, so a 1000-map campaign keeps earning them. */
  function need(lvl) {
    const l = clampLvl(lvl);
    return Math.round(20 + 14 * l + 6 * Math.pow(l, 1.75));
  }

  /* Player level bonuses: a flat damage bonus and extra AP from experience. */
  const dmgBonus = lvl => Math.floor((clampLvl(lvl) - 1) / 3);
  const apBonus = lvl => Math.floor((clampLvl(lvl) - 1) / 5);

  /* Enemy `lvl` (1-100) scales the authored stats, so one template can carry a
     whole region: HP +7%, damage +5%, XP +8% and caps +4% per level. */
  const mobLvl = d => clampLvl((d && d.lvl) || 1);
  const mobHp = d => Math.max(1, Math.round(((d && d.hp) || 1) * (1 + 0.07 * (mobLvl(d) - 1))));
  function mobDmg(d) {
    const range = (d && d.dmg) || [1, 2];
    const f = 1 + 0.05 * (mobLvl(d) - 1);
    return [Math.max(1, Math.round(range[0] * f)), Math.max(1, Math.round(range[1] * f))];
  }
  const mobXp = d => Math.round(((d && (d.xp ?? d.hp)) || 1) * (1 + 0.08 * (mobLvl(d) - 1)));
  const mobCaps = d => ((d && d.caps) || [0, 0]).map(v => Math.round(v * (1 + 0.04 * (mobLvl(d) - 1))));

  /* Quest rewards keep pace with the player instead of ageing out. */
  const questXp = (base, lvl) => Math.round((base || 0) * (1 + 0.25 * (clampLvl(lvl) - 1)));

  WA.scale = {
    CAP, HP_PER_LEVEL, DISCOVER_XP, need, dmgBonus, apBonus,
    mobLvl, mobHp, mobDmg, mobXp, mobCaps, questXp
  };
})(window.WA = window.WA || {});
