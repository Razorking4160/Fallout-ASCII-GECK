/* Fallout 1 perks. A perk is offered every third level; prerequisites use
   SPECIAL, level and earlier ranks. Effects are read by the systems below. */
(function (WA) {
  'use strict';
  const S = () => WA.game.S;

  const DEFS = [
    /* Level 3 */
    { id: 'swift_learner', name: 'Swift Learner', lvl: 3, req: { I: 4 }, max: 3, desc: '+5% XP per rank.' },
    { id: 'toughness', name: 'Toughness', lvl: 3, req: { E: 6, L: 6 }, max: 3, desc: '+10% damage resistance per rank.' },
    /* Level 6 */
    { id: 'bonus_hth_damage', name: 'Bonus HtH Damage', lvl: 6, req: { S: 6, A: 6 }, max: 3, desc: '+2 melee and unarmed damage per rank.' },
    { id: 'bonus_ranged_damage', name: 'Bonus Ranged Damage', lvl: 6, req: { A: 6, L: 6 }, max: 2, desc: '+2 ranged damage per rank.' },
    { id: 'more_criticals', name: 'More Criticals', lvl: 6, req: { L: 6 }, max: 3, desc: '+5% critical chance per rank.' },
    { id: 'educated', name: 'Educated', lvl: 6, req: { I: 6 }, max: 3, desc: '+2 skill points per level per rank.' },
    { id: 'strong_back', name: 'Strong Back', lvl: 6, req: { S: 5, E: 5 }, max: 1, desc: '+25 lbs of carry weight.' },
    { id: 'fortune_finder', name: 'Fortune Finder', lvl: 6, req: { L: 6 }, max: 1, desc: '+25% caps found.' },
    { id: 'rad_resistance', name: 'Rad Resistance', lvl: 6, req: { E: 6 }, max: 2, desc: 'Radiation leaves +15% fewer rads per rank.' },
    { id: 'snakeater', name: 'Snakeater', lvl: 6, req: { E: 3 }, max: 2, desc: '+25% poison resistance per rank.' },
    { id: 'fast_metabolism', name: 'Fast Metabolism', lvl: 6, req: { E: 5 }, max: 2, desc: 'Stimpaks and First Aid heal +50% per rank.' },
    { id: 'chem_resistant', name: 'Chem Resistant', lvl: 6, req: { E: 6 }, max: 1, desc: 'Half the normal chance of chem addiction.' },
    { id: 'heave_ho', name: 'Heave Ho!', lvl: 6, req: { S: 6 }, max: 2, desc: '+2 throwing range per rank.' },
    /* Level 9 */
    { id: 'better_criticals', name: 'Better Criticals', lvl: 9, req: { P: 6, L: 6 }, max: 1, desc: 'Critical hits deal +50% damage.' },
    { id: 'bonus_rate_of_fire', name: 'Bonus Rate of Fire', lvl: 9, req: { P: 6, I: 6, A: 7 }, max: 1, desc: 'Ranged VATS shots cost 1 less AP.' },
    { id: 'scrounger', name: 'Scrounger', lvl: 9, req: { L: 6 }, max: 1, desc: 'Ammo you find is 25% more plentiful.' },
    { id: 'stonewall', name: 'Stonewall', lvl: 9, req: { E: 6 }, max: 1, desc: 'Knockdowns and knockbacks cannot move you.' },
    { id: 'dodger', name: 'Dodger', lvl: 9, req: { A: 6 }, max: 1, desc: '+5 Armour Class.' },
    { id: 'adrenaline_rush', name: 'Adrenaline Rush', lvl: 9, req: { S: 6 }, max: 1, desc: '+3 damage while below half health.' },
    { id: 'sharpshooter', name: 'Sharpshooter', lvl: 9, req: { P: 6, I: 6 }, max: 1, desc: '+10% chance to hit with ranged weapons.' },
    { id: 'pyromaniac', name: 'Pyromaniac', lvl: 9, req: {}, max: 1, desc: '+5 damage with fire weapons.' },
    { id: 'demolition_expert', name: 'Demolition Expert', lvl: 9, req: { I: 6 }, max: 2, desc: '+25% explosive damage per rank.' },
    { id: 'master_thief', name: 'Master Thief', lvl: 9, req: { A: 6 }, max: 1, desc: 'A wider lockpicking sweet spot.' },
    { id: 'computer_whiz', name: 'Computer Whiz', lvl: 9, req: { I: 6 }, max: 1, desc: '+1 attempt on every terminal.' },
    /* Level 12 */
    { id: 'action_boy', name: 'Action Boy', lvl: 12, req: { A: 5 }, max: 2, desc: '+1 action point per rank.' },
    { id: 'lifegiver', name: 'Lifegiver', lvl: 12, req: { E: 4 }, max: 3, desc: '+4 maximum HP per rank.' },
    { id: 'tag', name: 'Tag!', lvl: 12, req: {}, max: 1, desc: 'One extra tag skill.' },
    { id: 'bonus_hth_attacks', name: 'Bonus HtH Attacks', lvl: 12, req: { A: 6 }, max: 1, desc: 'Melee and unarmed VATS attacks cost 1 less AP.' },
    { id: 'sniper', name: 'Sniper', lvl: 12, req: { P: 8, A: 8 }, max: 1, desc: '+10% chance to hit with ranged weapons at 5+ tiles.' },
    /* Level 18 */
    { id: 'silent_death', name: 'Silent Death', lvl: 18, req: { A: 10 }, max: 1, desc: 'Sneak attacks deal four times damage instead of double.' }
  ];
  const BY = {};
  for (const d of DEFS) BY[d.id] = d;

  const rank = id => {
    const s = S();
    return s && s.perks ? (s.perks[id] | 0) : 0;
  };
  const pending = () => (S() && S().perkPending) | 0;

  function meets(d) {
    const s = S();
    if (!s) return false;
    if (s.lvl < d.lvl) return false;
    const sp = WA.traits ? WA.traits.sp(s.sp) : s.sp;
    for (const k in d.req) if ((sp[k] | 0) < d.req[k]) return false;
    return true;
  }

  const available = d => pending() > 0 && rank(d.id) < d.max && meets(d);
  const reqText = d => {
    const bits = [`Lvl ${d.lvl}`];
    const N = { S: 'ST', P: 'PE', E: 'EN', C: 'CH', I: 'IN', A: 'AG', L: 'LK' };
    for (const k in d.req) bits.push(N[k] + ' ' + d.req[k]);
    return bits.join(', ');
  };

  function take(id) {
    const s = S(), d = BY[id];
    if (!s || !d || !available(d)) return false;
    s.perks = s.perks || {};
    s.perks[id] = rank(id) + 1;
    s.perkPending = pending() - 1;
    WA.game.say(`Perk gained: ${d.name}${s.perks[id] > 1 ? ' ' + s.perks[id] : ''}.`);
    if (id === 'tag') WA.game.say('A fourth tag slot is available in SKILL.');
    if (WA.pip) WA.pip.render();
    return true;
  }

  /* Effects */
  const xpMul = () => 1 + 0.05 * rank('swift_learner');
  const critBonus = () => 0.05 * rank('more_criticals');
  const critMul = () => (rank('better_criticals') ? 2.5 : 2);
  const dr = () => Math.min(0.8, 0.1 * rank('toughness'));
  function reduce(d, type) {
    let r = dr();
    if (type === 'poison') r = Math.min(0.9, r + poisonRes());
    return r > 0 && d > 0 ? Math.max(1, Math.round(d * (1 - r))) : d;
  }
  function damageBonus(wp) {
    const s = S();
    let n = (wp && (wp.range || 1) > 1)
      ? 2 * rank('bonus_ranged_damage')
      : 2 * rank('bonus_hth_damage');
    if (wp && wp.dt === 'fire') n += 5 * rank('pyromaniac');
    if (s && WA.char && s.hp < WA.char.maxHp() / 2) n += 3 * rank('adrenaline_rush');
    return n;
  }
  const apBonus = () => rank('action_boy');
  const hpBonus = () => 4 * rank('lifegiver');
  const rangedApCost = base => Math.max(1, base - (rank('bonus_rate_of_fire') ? 1 : 0));
  const hthApCost = base => Math.max(1, base - (rank('bonus_hth_attacks') ? 1 : 0));
  const skillPointBonus = () => 2 * rank('educated');
  const capsMul = () => 1 + 0.25 * rank('fortune_finder');
  const ammoMul = () => 1 + 0.25 * rank('scrounger');
  const radRes = () => 0.15 * rank('rad_resistance');
  const poisonRes = () => 0.25 * rank('snakeater');
  const healMul = () => 1 + 0.5 * rank('fast_metabolism');
  const addictionMul = () => (rank('chem_resistant') ? 0.5 : 1);
  const acBonus = () => 5 * rank('dodger');
  const explosiveMul = () => 1 + 0.25 * rank('demolition_expert');
  const throwRange = () => 2 * rank('heave_ho');
  const sneakMul = base => base * (rank('silent_death') ? 2 : 1);

  function hitBonus(skillId, dist, wp) {
    const ranged = !!(wp && (wp.range || 1) > 1);
    if (!ranged) return 0;
    let n = 10 * rank('sharpshooter');
    if (rank('sniper') && (dist | 0) >= 5) n += 10;
    return n;
  }

  WA.perks = {
    DEFS, BY, rank, pending, meets, available, reqText, take,
    xpMul, critBonus, critMul, dr, reduce, damageBonus, apBonus, hpBonus, rangedApCost, hthApCost, skillPointBonus,
    capsMul, ammoMul, radRes, poisonRes, healMul, addictionMul, acBonus, explosiveMul, throwRange, sneakMul, hitBonus
  };
})(window.WA = window.WA || {});
