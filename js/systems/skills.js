/* Fallout 1 skills: the 18-skill sheet, tag skills and skill checks.
   Values are derived from SPECIAL in real time, plus points invested. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const half = n => Math.floor(n / 2);
  const f = n => Math.max(0, Math.round(n));

  const DEFS = [
    { id: 'small_guns', name: 'Small Guns', base: sp => 35 + sp.A, desc: 'Pistols, SMGs and rifles' },
    { id: 'big_guns', name: 'Big Guns', base: sp => 10 + sp.A, desc: 'Miniguns, launchers and flamers' },
    { id: 'energy_weapons', name: 'Energy Weapons', base: sp => 10 + sp.A, desc: 'Laser and plasma weapons' },
    { id: 'unarmed', name: 'Unarmed', base: sp => 65 + half(sp.A + sp.S), desc: 'Fists and martial arts' },
    { id: 'melee_weapons', name: 'Melee Weapons', base: sp => 55 + half(sp.A + sp.S), desc: 'Knives, clubs and hammers' },
    { id: 'throwing', name: 'Throwing', base: sp => 40 + sp.A, desc: 'Grenades and thrown weapons' },
    { id: 'first_aid', name: 'First Aid', base: sp => 30 + half(sp.P + sp.I), desc: 'Minor wounds and cuts' },
    { id: 'doctor', name: 'Doctor', base: sp => 15 + half(sp.P + sp.I), desc: 'Major wounds and crippled limbs' },
    { id: 'sneak', name: 'Sneak', base: sp => 25 + sp.A, desc: 'Moving unnoticed' },
    { id: 'lockpick', name: 'Lockpick', base: sp => 20 + half(sp.P + sp.A), desc: 'Opening locks without keys' },
    { id: 'steal', name: 'Steal', base: sp => 20 + sp.A, desc: 'Taking what is not yours' },
    { id: 'traps', name: 'Traps', base: sp => 20 + half(sp.P + sp.A), desc: 'Finding and disarming traps' },
    { id: 'science', name: 'Science', base: sp => 25 + 2 * sp.I, desc: 'Computers and technology' },
    { id: 'repair', name: 'Repair', base: sp => 20 + sp.I, desc: 'Fixing machines and gear' },
    { id: 'speech', name: 'Speech', base: sp => 25 + 2 * sp.C, desc: 'Convincing and lying' },
    { id: 'barter', name: 'Barter', base: sp => 20 + 2 * sp.C, desc: 'Better prices' },
    { id: 'gambling', name: 'Gambling', base: sp => 20 + 3 * sp.L, desc: 'Cards, dice and wagers' },
    { id: 'outdoorsman', name: 'Outdoorsman', base: sp => 5 + half(sp.I + sp.E), desc: 'Living off the land' }
  ];
  const BY = {};
  for (const d of DEFS) BY[d.id] = d;

  const initialPoints = sp => 5 + 2 * (sp ? sp.I : 5);
  const tagSlots = () => 3 + (WA.perks && WA.perks.rank('tag') ? 1 : 0);
  const tags = () => (S() && Array.isArray(S().tags) ? S().tags : []);
  const tagged = id => tags().includes(id);

  /* Base + invested points. SPECIAL changes apply immediately. */
  function value(id, s) {
    const st = s || S(), def = BY[id];
    if (!st || !def || !st.sp) return 0;
    const invested = (st.skillPts && st.skillPts[id]) | 0;
    const base = def.base(WA.traits ? WA.traits.sp(st.sp, st.traits) : st.sp);
    const mod = WA.traits ? WA.traits.skillMod(id, st.traits) : 0;
    return clamp(Math.round(base + mod + invested), 0, 200);
  }

  const points = () => (S() && S().skillPoints) | 0;

  function canTag(id) {
    const s = S();
    return !!s && !!BY[id] && !tagged(id) && tags().length < tagSlots();
  }

  function tag(id) {
    const s = S();
    if (!s || !canTag(id)) return false;
    if (!Array.isArray(s.tags)) s.tags = [];
    if (!s.skillPts) s.skillPts = {};
    s.tags.push(id);
    s.skillPts[id] = (s.skillPts[id] | 0) + 20;
    WA.game.say(`${BY[id].name} tagged: +20% and double skill-point growth.`);
    if (WA.pip) WA.pip.render();
    return true;
  }

  function spend(id) {
    const s = S();
    if (!s || !BY[id] || points() < 1) return false;
    if (value(id) >= 200) return false;
    if (!s.skillPts) s.skillPts = {};
    const gain = tagged(id) ? 2 : 1;
    s.skillPoints--;
    s.skillPts[id] = (s.skillPts[id] | 0) + gain;
    WA.game.say(`${BY[id].name} is now ${value(id)}%.`);
    if (WA.pip) WA.pip.render();
    return true;
  }

  /* Which Fallout 1 combat skill a weapon uses. Explicit `skill` wins. */
  function weaponSkill(wp) {
    if (!wp || wp.type !== 'weapon') return 'unarmed';
    if (wp.skill && BY[wp.skill]) return wp.skill;
    if (wp.dt === 'energy') return 'energy_weapons';
    if ((wp.range || 1) > 1) return 'small_guns';
    return 'melee_weapons';
  }

  /* Fallout-style to-hit: skill, distance and called-shot penalty. */
  function chanceFor(skillId, dist, pen, wp) {
    const skill = value(BY[skillId] ? skillId : 'unarmed');
    const d = Math.max(0, (dist | 0) - 1);
    const mod = WA.traits ? WA.traits.hitMod(wp) : 0;
    const limb = WA.limbs ? WA.limbs.aimPenalty() : 0;
    const shaken = S() && S().shaken && S().shaken.turns > 0 ? (S().shaken.pen | 0) : 0;
    const perk = WA.perks ? WA.perks.hitBonus(skillId, dist, wp) : 0;
    return clamp(Math.round(skill + 30 - d * 5 - (pen | 0) + mod - limb - shaken + perk), 5, 95);
  }

  /* A check has a 50% baseline when skill and difficulty match. Every +1 of
     skill is +1% and every +1 of difficulty is -1%, clamped to 5–95%. */
  function checkChance(id, difficulty) {
    if (!BY[id]) return 0;
    return clamp(Math.round(value(id) - (difficulty | 0) + 50), 5, 95);
  }

  function checkResult(id, difficulty) {
    const def = BY[id];
    const skill = def ? value(id) : 0;
    const diff = clamp(difficulty | 0, 0, 200);
    const chance = checkChance(id, diff);
    const roll = U.rnd(1, 100);
    return {
      id, name: def ? def.name : id, skill, difficulty: diff,
      chance, roll, success: roll <= chance
    };
  }

  function check(id, difficulty) {
    return checkResult(id, difficulty).success;
  }

  WA.skills = {
    DEFS, BY, initialPoints, tagSlots, tags, tagged, value, points,
    canTag, tag, spend, weaponSkill, chanceFor, check, checkChance, checkResult
  };
})(window.WA = window.WA || {});
