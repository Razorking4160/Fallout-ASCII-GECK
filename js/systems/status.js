/* Status effects. Each one ticks once per world turn, never on animation
   frames, and expires on its own. Harmful effects damage you; buffs help. */
(function (WA) {
  'use strict';

  const EFX = {
    bleed: { name: 'Bleeding', short: 'BLEED', state: 'bleeding', dmg: 'ballistic', armor: true, death: 'bleeds out' },
    burn: { name: 'Burning', short: 'BURN', state: 'burning', dmg: 'fire', armor: true, death: 'is consumed by fire' },
    rad: { name: 'Irradiated', short: 'IRRAD', state: 'irradiated', dmg: 'radiation', armor: false, death: 'succumbs to radiation' },
    poison: { name: 'Poisoned', short: 'POISON', state: 'poisoned', dmg: 'poison', armor: false, death: 'succumbs to poison' },
    /* Buffs. They never damage the player; each one has its own per-turn job. */
    resist: { name: 'Fortified', short: 'RES', state: 'fortified', buff: 1, desc: m => `-${m} damage taken` },
    apregen: { name: 'Stimulated', short: 'AP+', state: 'stimulated', buff: 1, desc: m => `+${m} AP per turn` },
    strength: { name: 'Jacked', short: 'STR', state: 'jacked', buff: 1, desc: m => `+${m} melee damage` }
  };
  const IDS = Object.keys(EFX);
  const BAD = IDS.filter(k => !EFX[k].buff);
  const GOOD = IDS.filter(k => EFX[k].buff);
  const MAX_DUR = 20, MAX_MAG = 20;

  // Returns true when the effect is newly applied (not just refreshed).
  function add(list, t, dur, mag, src) {
    if (!EFX[t]) return false;
    const d = Math.max(0, Math.min(MAX_DUR, dur | 0));
    const m = Math.max(0, Math.min(MAX_MAG, mag | 0));
    if (!d || !m) return false;
    const cur = list.find(f => f.t === t);
    if (cur) {
      cur.dur = Math.max(cur.dur, d);
      cur.mag = Math.max(cur.mag, m);
      if (src) cur.src = src;
      return false;
    }
    list.push({ t, dur: d, mag: m, src: src || undefined });
    return true;
  }

  function addPlayer(t, dur, mag, src) {
    const s = WA.game.S;
    if (!s) return false;
    if (!Array.isArray(s.fx)) s.fx = [];
    return add(s.fx, t, dur, mag, src);
  }

  function addEntity(e, t, dur, mag) {
    if (!e) return false;
    if (!Array.isArray(e.fx)) e.fx = [];
    return add(e.fx, t, dur, mag);
  }

  /* Total strength of one effect on a list (player by default). */
  function mod(t, list) {
    const fx = list || (WA.game.S && WA.game.S.fx);
    if (!Array.isArray(fx)) return 0;
    return fx.reduce((n, f) => (f && f.t === t ? n + (f.mag | 0) : n), 0);
  }
  const playerMod = t => mod(t);

  // Player effects, applied once per world turn.
  function tickPlayer(s) {
    if (!Array.isArray(s.fx) || !s.fx.length) return;
    const armor = (WA.GAME.items[s.armor] || {}).def || 0;
    const gone = [];
    for (const f of s.fx) {
      const def = EFX[f.t];
      if (!def) { f.dur = 0; continue; }
      if (def.buff) {
        if (f.t === 'apregen') {
          const max = WA.char.maxAp();
          const gain = Math.max(0, Math.min(f.mag, max - (s.ap | 0)));
          if (gain) {
            s.ap = (s.ap | 0) + gain;
            WA.game.say(`Your chem keeps you moving. +${gain} AP.`);
          }
        }
        f.dur--;
        if (f.dur <= 0) {
          gone.push(def.name.toLowerCase());
          if (WA.addiction && f.src) WA.addiction.onExpire(f.src);
        }
        continue;
      }
      let dmg = def.armor ? Math.max(1, f.mag - Math.floor(armor / 2)) : f.mag;
      if (def.dmg === 'poison' && WA.perks) dmg = WA.perks.reduce(dmg, 'poison');
      if (WA.settings) dmg = Math.max(1, Math.round(dmg * WA.settings.incomingMul()));
      s.hp -= dmg;
      WA.rads.expose(def.dmg, dmg);
      WA.game.say(`You take ${dmg} ${def.dmg} damage (${def.state}).`);
      f.dur--;
    }
    s.fx = s.fx.filter(f => f.dur > 0);
    for (const n of gone) WA.game.say(`The ${n} fades.`);
  }

  // Enemy damage-over-time, applied at the start of that enemy's turn.
  function tickEntity(e) {
    if (!Array.isArray(e.fx) || !e.fx.length) return;
    let death = 'succumbs to its wounds';
    for (const f of e.fx) {
      const def = EFX[f.t];
      if (!def) { f.dur = 0; continue; }
      if (def.buff) { f.dur--; continue; }
      const hit = WA.damage.hurtEnemy(e, f.mag, def.dmg);
      death = def.death;
      WA.game.say(`The ${e.d.name} takes ${hit.value} ${def.dmg} damage (${def.state}).`);
      f.dur--;
    }
    e.fx = e.fx.filter(f => f.dur > 0);
    WA.damage.slay(e, `The ${e.d.name} ${death}.`);
  }

  function tag(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(f => `${EFX[f.t] ? EFX[f.t].short : f.t} ${f.dur}`).join(' · ');
  }

  function html(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(f => {
      const def = EFX[f.t];
      if (!def) return '';
      const detail = def.buff ? def.desc(f.mag) : `${f.mag} ${def.dmg}`;
      return `<div class="prow"><span class="${def.buff ? 'good' : 'bad'}">${def.name}</span>` +
        `<small class="dim">${detail} · ${f.dur} turn${f.dur === 1 ? '' : 's'}</small></div>`;
    }).join('');
  }

  WA.status = { EFX, IDS, BAD, GOOD, MAX_DUR, MAX_MAG, add, addPlayer, addEntity, mod, playerMod, tickPlayer, tickEntity, tag, html };
})(window.WA = window.WA || {});
