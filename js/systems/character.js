/* Character progression: SPECIAL, HP, XP and the Pip-Boy panel. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const SPN = { S: 'Strength', P: 'Perception', E: 'Endurance', C: 'Charisma', I: 'Intelligence', A: 'Agility', L: 'Luck' };
  const SPD = { S: 'melee, carry weight and unarmed', P: 'sight, sequence and skill bases', E: 'max HP', C: 'speech and barter', I: 'XP and skill points', A: 'AP, armor class and skills', L: 'criticals and gambling' };

  const bonusHp = () => (S().hpBonus | 0);
  const effectiveSp = () => (WA.traits ? WA.traits.sp(S().sp)
    : (WA.addiction ? WA.addiction.sp(S().sp) : S().sp));
  const baseHp = () => WA.GAME.player.hp + (effectiveSp().E - 5) * 4 + (S().lvl - 1) * WA.scale.HP_PER_LEVEL + bonusHp() + (WA.perks ? WA.perks.hpBonus() : 0);
  const maxHp = () => Math.max(5, baseHp() - (S().rads | 0));
  const need = () => WA.scale.need(S().lvl);
  const maxAp = () => Math.max(1, 6 + effectiveSp().A + WA.scale.apBonus(S().lvl) +
    (WA.perks ? WA.perks.apBonus() : 0) + (WA.traits ? WA.traits.apMod() : 0) +
    (WA.addiction ? WA.addiction.apMod() : 0) -
    (WA.limbs ? WA.limbs.apPenalty(S()) : 0));
  const allStatsMaxed = () => Object.keys(S().sp).every(k => S().sp[k] >= 10);

  function gainXp(n) {
    const s = S();
    if (!s || !(n > 0) || s.dead) return;
    if (s.lvl >= WA.scale.CAP) { s.xp = 0; return; }
    s.xp += Math.round(n * (WA.perks ? WA.perks.xpMul() : 1));

    while (s.lvl < WA.scale.CAP && s.xp >= need()) {
      const oldMax = maxHp();
      s.xp -= need();
      s.lvl++;
      // Once every SPECIAL is maxed the point has nowhere to go, so it becomes
      // permanent health instead of being wasted.
      if (allStatsMaxed()) s.hpBonus = bonusHp() + WA.scale.HP_PER_LEVEL;
      else s.pts++;
      const beforePts = s.skillPoints | 0;
      const tsp = WA.traits ? WA.traits.sp(s.sp) : s.sp;
      const gained = 5 + 2 * (tsp.I | 0) + (WA.perks ? WA.perks.skillPointBonus() : 0) -
        (WA.traits ? WA.traits.skillPointPenalty() : 0);
      s.skillPoints = Math.min(99, beforePts + Math.max(1, gained));
      s.perks = s.perks || {};
      const every = WA.traits ? WA.traits.perkEvery() : 3;
      if (s.lvl % every === 0) s.perkPending = (s.perkPending | 0) + 1;
      s.hp = Math.min(maxHp(), s.hp + 5 + maxHp() - oldMax);
      WA.game.say(`LEVEL UP! You are now level ${s.lvl}. +${s.skillPoints - beforePts} skill points.` +
        (s.lvl % every === 0 ? ' A perk is waiting in the Pip-Boy.' : '') +
        (s.lvl >= WA.scale.CAP ? ' Maximum level reached.' : ' Tap the top bar to spend a point.'));
    }
    if (s.lvl >= WA.scale.CAP) { s.lvl = WA.scale.CAP; s.xp = 0; }
  }

  function raise(k) {
    const s = S();
    if (!s || s.pts < 1 || s.sp[k] >= 10) return;
    s.pts--;
    s.sp[k]++;
    if (k === 'E') s.hp = Math.min(maxHp(), s.hp + 4);
    WA.game.say(`${SPN[k]} is now ${s.sp[k]}.`);
    WA.view.draw();
  }

  // The Pip-Boy lives in pipboy.js; this stays as the common entry point.
  function pip() {
    if (WA.pip) WA.pip.render();
  }

  WA.char = { maxHp, baseHp, need, maxAp, gainXp, raise, pip, allStatsMaxed, SPN, SPD };
})(window.WA = window.WA || {});
