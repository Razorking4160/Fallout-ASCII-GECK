/* Chem addiction. A chem can carry an `addict` chance (percent). When its
   buff expires the chance is rolled; failure leaves a withdrawal that lasts
   until the player is cured with the Doctor skill. Chem Reliant doubles the
   chance, Chem Resistant halves it. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  /* Withdrawal by the buff the chem gave. A custom chem without `addict`
     never causes addiction; one with `addict` uses the closest mapping. */
  const WITHDRAW = {
    strength: { sp: { S: -2, E: -1 }, ap: 0, text: '-2 ST, -1 EN' },
    apregen: { sp: {}, ap: -2, text: '-2 max AP' },
    resist: { sp: { A: -1, E: -1 }, ap: 0, text: '-1 AG, -1 EN' }
  };
  const FALLBACK = { sp: { E: -1 }, ap: 0, text: '-1 EN' };
  const BASE = { buffout: 40, jet: 40, medx: 20 };
  const MAX = 8;

  const list = () => {
    const s = S();
    if (!s) return [];
    if (!Array.isArray(s.addictions)) s.addictions = [];
    return s.addictions;
  };
  const has = id => list().includes(id);
  const defOf = id => {
    const d = WA.GAME.items[id] || {};
    return WITHDRAW[d.onHit] || FALLBACK;
  };

  /* Withdrawal penalties are live, like Night Person: base SPECIAL is not
     rewritten, so curing an addiction restores the derived stats at once. */
  function sp(base) {
    const o = Object.assign({}, base);
    for (const id of list()) {
      const w = defOf(id);
      for (const k in w.sp) o[k] = Math.max(1, Math.min(10, (o[k] | 0) + w.sp[k]));
    }
    return o;
  }

  function apMod() {
    let n = 0;
    for (const id of list()) n += defOf(id).ap | 0;
    return n;
  }

  function chance(id) {
    const d = WA.GAME.items[id];
    if (!d || d.type !== 'chem') return 0;
    const raw = typeof d.addict === 'number' ? d.addict : (BASE[id] || 0);
    return Math.max(0, Math.min(100, raw));
  }

  function traitMul() {
    return WA.traits && WA.traits.addictionMul ? WA.traits.addictionMul() : 1;
  }

  /* Rolled when a chem buff runs out. `src` is stored on the status effect. */
  function onExpire(id) {
    const s = S();
    if (!s || !id || has(id)) return false;
    const base = chance(id);
    if (!base) return false;
    if (Math.random() * 100 >= base * traitMul() *
      (WA.perks ? WA.perks.addictionMul() : 1)) return false;
    return add(id);
  }

  function add(id) {
    const s = S();
    if (!s || !WA.GAME.items[id] || WA.GAME.items[id].type !== 'chem' || has(id)) return false;
    const arr = list();
    if (arr.length >= MAX) return false;
    arr.push(id);
    const d = WA.GAME.items[id];
    WA.game.say(`You are addicted to ${d.name}. Withdrawal: ${defOf(id).text}.`);
    // Withdrawal can lower Endurance or Agility; do not leave the bars above
    // their new ceilings.
    if (s.hp > WA.char.maxHp()) s.hp = WA.char.maxHp();
    if (s.ap > WA.char.maxAp()) s.ap = WA.char.maxAp();
    return true;
  }

  function remove(id) {
    const arr = list();
    const i = arr.indexOf(id);
    if (i < 0) return false;
    arr.splice(i, 1);
    return true;
  }

  function html() {
    const arr = list();
    if (!arr.length) return '';
    return arr.map(id => {
      const d = WA.GAME.items[id] || { name: id };
      return `<div class="prow"><span class="bad">ADDICTED · ${U.esc(d.name)}</span>` +
        `<small class="dim">${U.esc(defOf(id).text)}</small></div>`;
    }).join('');
  }

  WA.addiction = { WITHDRAW, FALLBACK, BASE, MAX, list, has, sp, apMod, chance, onExpire, add, remove, html, defOf };
})(window.WA = window.WA || {});
