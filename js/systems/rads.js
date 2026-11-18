/* RADS: radiation the player has absorbed. It stays until flushed with
   RadAway and lowers maximum HP. Radiation damage is the source. */
(function (WA) {
  'use strict';

  const FLUSH = 30;   // rads removed by one RadAway
  const CAP = 999;

  function add(n) {
    const s = WA.game.S;
    if (!s || !(n > 0)) return 0;
    const before = s.rads | 0;
    const res = WA.perks ? WA.perks.radRes() : 0;
    const gain = Math.round(n * (1 - res));
    if (!(gain > 0)) return 0;
    s.rads = Math.max(0, Math.min(CAP, before + gain));
    // Losing max HP also caps current health.
    const max = WA.char.maxHp();
    if (s.hp > max) s.hp = max;
    return s.rads - before;
  }

  /* Any radiation damage leaves rads behind, so pools, irradiated enemies
     and the Irradiated status all feed the same meter. */
  function expose(type, dmg) {
    if (type !== 'radiation') return 0;
    return add(dmg);
  }

  function flush(amount) {
    const s = WA.game.S;
    if (!s) return 0;
    const before = s.rads | 0;
    s.rads = Math.max(0, before - (amount || FLUSH));
    return before - s.rads;
  }

  const count = () => (WA.game.S ? (WA.game.S.rads | 0) : 0);
  const penalty = () => (WA.game.S ? WA.char.baseHp() - WA.char.maxHp() : 0);

  WA.rads = { add, expose, flush, count, penalty, FLUSH, CAP };
})(window.WA = window.WA || {});
