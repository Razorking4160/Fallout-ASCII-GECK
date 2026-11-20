/* Companions: two recruits, a small party roster, and follower turns.

   A companion is a roster record on S.party plus one ally entity on the
   current map. The record owns HP, mode and bleed-out; the entity only marks
   where they are standing. Ally entities are never written to a save: they are
   respawned beside the player on load, travel and map start, so a companion
   cannot be duplicated by a stale map record.

   Modes: follow trails the player and hits anything adjacent, hold stays put,
   attack closes on the nearest hostile it can see, and fall back widens the
   distance and never swings. A companion at 0 HP goes down and bleeds out over
   three world turns unless a Stimpak is spent on them from the PARTY screen.

   Companions also carry their own supplies: a small Stimpak count and a few
   healing items. They spend one on themselves when badly hurt, spending that
   turn's action, and the PARTY screen moves supplies in either direction. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const MAX = 2;
  const BLEED = 3;
  const MODES = {
    follow: 'Follow',
    wait: 'Hold',
    attack: 'Attack',
    retreat: 'Fall back'
  };

  /* What each companion thinks of the way you have been behaving. Karma moves
     all three; Rook also watches the market and the road pair watch the road. */
  const ALLY_FACTION = { rook_ally: 'market', vera_ally: 'road', ash_ally: 'road' };
  const REACTIONS = {
    rook_ally: {
      good: 'You keep the market fed and your hands clean. I picked the right vault dweller.',
      neutral: "Long as there's scrap to pull and someone watching the door, I'm still here.",
      bad: "The market talks about you, and not the good way. I'm still here — for now.",
      hostile: "The market has marked you. I'm not walking back there beside you."
    },
    vera_ally: {
      good: "The wardens are saying your name without spitting. That's rare.",
      neutral: "Road's still long, rifle's still oiled. That's enough.",
      bad: "I watch the road. Lately I'm watching you too.",
      hostile: "The wardens have your description. I won't be standing next to you when they collect."
    },
    ash_ally: {
      good: "You gave the road something back. I don't forget that.",
      neutral: "Rivet's dead. Everything after that is extra.",
      bad: "I guard caravans. You're starting to look like the reason they need guards.",
      hostile: "The road has marked you. My machete is yours, but my name isn't."
    }
  };

  function stanceOf(id) {
    const table = REACTIONS[id];
    const fid = ALLY_FACTION[id];
    const rep = fid && WA.reputation ? WA.reputation.rep(fid) : 0;
    const karma = WA.reputation ? WA.reputation.value() : 0;
    if (table && fid && WA.reputation && rep <= WA.reputation.HOSTILE) {
      return { key: 'hostile', cls: 'bad', text: table.hostile };
    }
    if (table && (karma <= -20 || (fid && rep <= -20))) {
      return { key: 'bad', cls: 'warn', text: table.bad };
    }
    if (table && karma >= 20 && (!fid || rep >= 20)) {
      return { key: 'good', cls: 'good', text: table.good };
    }
    return {
      key: 'neutral', cls: 'dim',
      text: table ? table.neutral : 'They are still deciding what to make of you.'
    };
  }

  /* Speak only when a stance actually changes, so a long quest chain does not
     repeat the same line after every turn-in. */
  function react() {
    const s = S();
    if (!s) return false;
    let spoke = false;
    for (const m of roster(s)) {
      if (m.down || !REACTIONS[m.id]) continue;
      const now = stanceOf(m.id);
      if (m.mood === now.key) continue;
      m.mood = now.key;
      WA.game.say(`${nameOf(m)}: "${now.text}"`);
      spoke = true;
    }
    if (spoke) refresh();
    return spoke;
  }

  const roster = s => ((s || S()) && Array.isArray((s || S()).party) ? (s || S()).party : []);
  const defOf = id => WA.GAME.entities[id] || null;
  const memberIn = (s, id) => roster(s).find(m => m.id === id) || null;
  const member = id => memberIn(S(), id);

  const maxHp = m => {
    const d = defOf(m.id);
    return Math.max(1, (d && d.hp) | 0 || 1);
  };
  const nameOf = m => {
    const d = defOf(m.id);
    return d ? d.name : m.id;
  };
  const entOf = (s, m) => (s.ents || []).find(e => e.d && e.d.ally && e.id === m.id) || null;

  /* ---------- gear ---------- */
  const SLOTS = ['weapon', 'armor'];
  const gearRule = d => (d && d.gear && d.gear.weapon) || 'any';
  const isRanged = it => !!it && it.type === 'weapon' && (it.range || 1) > 1;

  /* What a companion will accept. Training is part of the character: Rook only
     swings melee weapons, Vera only fires ranged ones. Both wear armour. */
  function allows(id, it) {
    const d = defOf(id);
    if (!d || !it) return false;
    if (it.type === 'armor') return !(d.gear && d.gear.armor === false);
    if (it.type !== 'weapon') return false;
    const rule = gearRule(d);
    if (rule === 'any') return true;
    return rule === 'ranged' ? isRanged(it) : !isRanged(it);
  }

  const startGear = (id, slot) => {
    const d = defOf(id), key = slot === 'armor' ? 'startArmor' : 'startWeapon';
    return d && d[key] && allows(id, WA.GAME.items[d[key]]) ? d[key] : null;
  };

  /* Effective combat numbers for a companion's kit. Gear keeps the condition it
     arrived with but does not wear in a companion's hands; armour scales the
     same way the player's does. Unarmed companions fight with their fists. */
  function gearOf(m) {
    const d = defOf(m && m.id) || {};
    const w = WA.GAME.items[m && m.weapon] || null;
    const a = WA.GAME.items[m && m.armor] || null;
    const wc = w ? (WA.weapons ? WA.weapons.condOf(m.weapon) : 100) : null;
    const acnd = a ? (WA.weapons ? WA.weapons.condOf(m.armor) : 100) : null;
    const wf = w ? (WA.weapons ? WA.weapons.factor(m.weapon) : 1) : 1;
    const af = acnd === null || acnd <= 0 ? 0 : 0.6 + 0.4 * (acnd / 100);
    const range = w ? Math.max(1, w.range | 0) : 1;
    return {
      w, a, wc, acnd, af, wf,
      ac: ((d.ac | 0) || 14) + Math.round(((a && a.ac) | 0) * af),
      def: Math.round(((a && a.def) | 0) * af),
      res: type => (a ? WA.damage.resistance(a, type) * af : 0),
      dmg: w && Array.isArray(w.dmg) ? w.dmg : [1, 2],
      dt: (w && w.dt) || (range > 1 ? 'ballistic' : 'melee'),
      range, ranged: range > 1
    };
  }

  function gearStats(id) {
    const s = S(), m = memberIn(s, id);
    return m ? gearOf(m) : null;
  }

  /* ---------- supplies ---------- */
  const STIM_MAX = 5;
  const MED_MAX = 3;
  const STIM_HEAL = 10;
  const HEAL_AT = 0.4;

  const medsOf = m => (Array.isArray(m && m.meds) ? m.meds : []);
  const fxOf = m => (Array.isArray(m && m.fx) ? m.fx : []);
  const fxMod = (m, t) => fxOf(m).reduce((n, f) => (f && f.t === t ? n + (f.mag | 0) : n), 0);

  /* Things that mend a person: Stimpaks and healing food. */
  const canMed = it => !!it && (it.type === 'stim' || it.type === 'food') && (it.heal | 0) > 0;
  /* Chems a companion can use: a timed buff rather than a hazard or a habit. */
  const canChem = it => !!it && it.type === 'chem' && !!it.onHit &&
    !!(WA.status && WA.status.EFX[it.onHit] && WA.status.EFX[it.onHit].buff);
  const canSupply = it => canMed(it) || canChem(it);
  const startStims = id => Math.max(0, ((defOf(id) || {}).startStims | 0));
  const startMeds = id => {
    const d = defOf(id) || {};
    return (Array.isArray(d.startMeds) ? d.startMeds : [])
      .filter(x => canSupply(WA.GAME.items[x])).slice(0, MED_MAX);
  };

  /* ---------- spawning ---------- */
  function spawnNear(s, m) {
    const def = defOf(m.id);
    if (!def || !s.ents) return null;
    const spots = [];
    for (let r = 1; r <= 4 && !spots.length; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = s.px + dx, y = s.py + dy;
          if (WA.game.free(x, y)) spots.push([x, y]);
        }
      }
    }
    if (!spots.length) return null;
    const [x, y] = spots[0];
    const e = {
      x, y, id: m.id, hp: Math.max(0, m.hp | 0), d: def, ally: true,
      slow: 0, cd: 0, weak: 0, last: null, fx: []
    };
    s.ents.push(e);
    if (s.occ) s.occ.set(x + ',' + y, e);
    return e;
  }

  // Bring the map in line with the roster: no duplicate bodies, no leftover
  // recruiters, and a body beside the player for every companion still standing.
  function sync(s) {
    if (!s || !Array.isArray(s.ents)) return;
    if (!Array.isArray(s.party)) s.party = [];
    for (const m of s.party) {
      // Companions from older saves (and fresh recruits) start with their own kit.
      if (m.weapon === undefined) m.weapon = startGear(m.id, 'weapon');
      if (m.armor === undefined) m.armor = startGear(m.id, 'armor');
      if (m.weapon && !(WA.GAME.items[m.weapon] && allows(m.id, WA.GAME.items[m.weapon]))) m.weapon = null;
      if (m.armor && !(WA.GAME.items[m.armor] && allows(m.id, WA.GAME.items[m.armor]))) m.armor = null;
      // Supplies arrived after the first party build; an old save gets a kit.
      if (m.stims === undefined) m.stims = startStims(m.id);
      m.stims = Math.max(0, Math.min(STIM_MAX, m.stims | 0));
      if (!Array.isArray(m.meds)) m.meds = startMeds(m.id);
      m.meds = m.meds.filter(x => canSupply(WA.GAME.items[x])).slice(0, MED_MAX);
      if (!Array.isArray(m.fx)) m.fx = [];
      m.fx = m.fx.filter(f => f && WA.status && WA.status.EFX[f.t] && WA.status.EFX[f.t].buff &&
          (f.dur | 0) > 0 && (f.mag | 0) > 0)
        .map(f => ({
          t: f.t, dur: Math.min(WA.status.MAX_DUR, f.dur | 0), mag: Math.min(WA.status.MAX_MAG, f.mag | 0)
        })).slice(0, 4);
      m.hp = Math.max(0, Math.min(maxHp(m), m.hp | 0));
      if (!MODES[m.mode]) m.mode = 'follow';
      if (typeof m.mood !== 'string') m.mood = stanceOf(m.id).key;
      m.down = !!m.down || m.hp <= 0;
      m.bleed = m.down ? Math.max(0, Math.min(BLEED, m.bleed | 0) || BLEED) : 0;
    }

    // A recruiter leaves the map for good when their companion has joined or
    // has died, so a revisit cannot hand out the same person twice.
    const recruiters = new Set(s.party.map(m => (defOf(m.id) || {}).from).filter(Boolean));
    for (const id in (s.gone || {})) {
      const from = (defOf(id) || {}).from;
      if (from) recruiters.add(from);
    }
    let changed = false;
    const seen = new Set();
    s.ents = s.ents.filter(e => {
      if (e.d && recruiters.has(e.id)) { changed = true; return false; }
      if (!e.d || !e.d.ally) return true;
      if (seen.has(e.id) || !memberIn(s, e.id)) { changed = true; return false; }
      seen.add(e.id);
      return true;
    });

    for (const m of s.party) {
      if (m.down || seen.has(m.id)) continue;
      if (spawnNear(s, m)) seen.add(m.id);
    }

    if (changed && WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
  }

  /* ---------- roster changes ---------- */
  function recruit(id) {
    const s = S();
    const d = defOf(id);
    if (!s || !d || !d.ally) return false;
    if (memberIn(s, id)) return false;
    if (roster(s).length >= MAX) {
      WA.game.say(`You cannot lead more than ${MAX} people.`);
      return false;
    }
    const m = { id, hp: maxHp({ id }), mode: 'follow', down: false, bleed: 0,
      weapon: startGear(id, 'weapon'), armor: startGear(id, 'armor'),
      stims: startStims(id), meds: startMeds(id), fx: [], mood: stanceOf(id).key };
    s.party.push(m);
    sync(s);
    WA.game.say(`${d.name} joins you. Open the Pip-Boy's PARTY screen to give orders.`);
    if (WA.save) WA.save.queueAutosave();
    if (WA.pip) WA.pip.render();
    WA.view.draw();
    return true;
  }

  /* Gear moves between the player's pack and the companion's hands. Nothing
     is created or destroyed: the item leaves one inventory and enters the other. */
  function equip(id, itemId) {
    const s = S(), m = memberIn(s, id), it = WA.GAME.items[itemId];
    if (!s || !m || !it) return false;
    const d = defOf(id) || {};
    if (m.down) { WA.game.say(`${nameOf(m)} is down and cannot take gear.`); return false; }
    if (!allows(id, it)) {
      WA.game.say(gearRule(d) === 'ranged'
        ? `${nameOf(m)} only carries ranged weapons.`
        : `${nameOf(m)} only carries melee weapons.`);
      return false;
    }
    if (!(s.inv || []).includes(itemId)) { WA.game.say(`You are not carrying the ${it.name}.`); return false; }
    const slot = it.type === 'armor' ? 'armor' : 'weapon';
    const old = m[slot];
    if (old === itemId) { WA.game.say(`${nameOf(m)} already carries the ${it.name}.`); return false; }
    s.inv.splice(s.inv.indexOf(itemId), 1);
    // Losing your last copy of an equipped item also unequips it.
    if (s[slot] === itemId && !s.inv.includes(itemId)) s[slot] = null;
    if (old) s.inv.push(old);
    m[slot] = itemId;
    const oldName = old && WA.GAME.items[old] ? WA.GAME.items[old].name : null;
    WA.game.say(`You give ${nameOf(m)} the ${it.name}` + (oldName ? ` and take back the ${oldName}.` : '.'));
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function unequip(id, slot) {
    const s = S(), m = memberIn(s, id);
    if (!s || !m || SLOTS.indexOf(slot) < 0 || !m[slot]) return false;
    if (m.down) { WA.game.say(`${nameOf(m)} is down and cannot hand gear back.`); return false; }
    const it = WA.GAME.items[m[slot]] || { name: slot };
    s.inv.push(m[slot]);
    m[slot] = null;
    WA.game.say(`${nameOf(m)} hands you the ${it.name}.`);
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function dismiss(id) {
    const s = S();
    const m = memberIn(s, id);
    if (!m) return false;
    const d = defOf(id);
    const e = entOf(s, m);
    // Whatever they were carrying goes back into the pack rather than vanishing.
    const gear = SLOTS.map(k => m[k]).filter(Boolean);
    for (const g of gear) s.inv.push(g);
    m.weapon = m.armor = null;
    const stims = m.stims | 0;
    const meds = medsOf(m).slice();
    s.stims = (s.stims | 0) + stims;
    for (const id of meds) s.inv.push(id);
    m.stims = 0;
    m.meds = [];
    s.party = s.party.filter(x => x !== m);
    if (e) {
      WA.game.removeEntity(e);
      changed();
    }
    WA.game.say(`${d ? d.name : 'They'} leaves the party.` +
      (gear.length || stims || meds.length ? ' What they carried goes back in your pack.' : ''));
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function command(id, mode) {
    const s = S(), m = memberIn(s, id);
    if (!m || !MODES[mode] || m.down) return false;
    m.mode = mode;
    WA.game.say(`${nameOf(m)}: ${MODES[mode].toLowerCase()}.`);
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function stabilize(id) {
    const s = S(), m = memberIn(s, id);
    if (!s || !m) return false;
    if (!m.down) return false;
    // Their own kit goes first; yours is the fallback.
    const own = (m.stims | 0) > 0;
    if (!own && !(s.stims | 0)) {
      WA.game.say(`${nameOf(m)} has no Stimpak, and neither do you.`);
      return false;
    }
    if (own) m.stims = (m.stims | 0) - 1;
    else s.stims = (s.stims | 0) - 1;
    m.hp = Math.max(1, Math.round(maxHp(m) * 0.3));
    m.down = false;
    m.bleed = 0;
    const e = entOf(s, m);
    if (e) e.hp = m.hp;
    WA.game.say(`${nameOf(m)} comes round, shaky but standing. (${own ? 'their' : 'your'} Stimpak)`);
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  /* A badly hurt companion patches themselves up on their own turn, spending
     the item and that turn's action. They pick the strongest item the wound
     can use without much waste; food wins ties against a Stimpak, so Stims are
     saved for wounds nothing else can cover. */
  function selfCare(m) {
    const missing = maxHp(m) - (m.hp | 0);
    if (missing < 4) return false;
    const opts = medsOf(m)
      .map((id, i) => ({ id, i, heal: (WA.GAME.items[id] || {}).heal | 0 }))
      .filter(x => x.heal > 0);
    if ((m.stims | 0) > 0) opts.push({ stim: true, i: -1, heal: STIM_HEAL });
    if (!opts.length) return false;
    const fits = opts.filter(x => x.heal <= missing).sort((a, b) => b.heal - a.heal);
    const pick = fits[0] || opts.slice().sort((a, b) => a.heal - b.heal)[0];
    return pick.stim ? useStim(m) : useMed(m, pick.i, pick.heal);
  }

  function mend(m, gain) {
    const s = S();
    m.hp = Math.max(0, Math.min(maxHp(m), (m.hp | 0) + gain));
    const e = entOf(s, m);
    if (e) e.hp = m.hp;
    if (WA.save) WA.save.queueAutosave();
    refresh();
  }

  function useStim(m) {
    const gain = Math.min(STIM_HEAL, maxHp(m) - (m.hp | 0));
    m.stims = (m.stims | 0) - 1;
    mend(m, gain);
    WA.game.say(`${nameOf(m)} jabs a Stimpak. +${gain} HP (${m.stims} left).`);
    return true;
  }

  function useMed(m, at, heal) {
    const meds = medsOf(m).slice();
    const id = meds[at];
    if (!id) return false;
    const it = WA.GAME.items[id] || { name: id };
    meds.splice(at, 1);
    m.meds = meds;
    const gain = Math.min(heal, maxHp(m) - (m.hp | 0));
    mend(m, gain);
    WA.game.say(`${nameOf(m)} uses the ${it.name}. +${gain} HP.`);
    return true;
  }

  /* A companion with a hostile in sight and no matching buff spends the turn
     on a chem. The buff then ticks down once per world turn like yours does. */
  function wantsChem(s, m) {
    if (m.down) return false;
    const e = entOf(s, m);
    if (!e) return false;
    const d = e.d || {};
    const foe = nearestFoe(s, e, (d.sight || 6) + 1);
    return !!foe && U.cheb(e.x, e.y, foe.x, foe.y) <= (d.sight || 6);
  }

  function takeChem(m) {
    const chem = medsOf(m).find(id => {
      const it = WA.GAME.items[id];
      return canChem(it) && fxMod(m, it.onHit) <= 0;
    });
    if (!chem) return false;
    const it = WA.GAME.items[chem];
    const meds = medsOf(m).slice();
    meds.splice(meds.indexOf(chem), 1);
    m.meds = meds;
    const dur = Math.max(1, it.dur | 0 || 3), mag = Math.max(1, it.mag | 0 || 1);
    if (!Array.isArray(m.fx)) m.fx = [];
    WA.status.add(m.fx, it.onHit, dur, mag);
    const fx = WA.status.EFX[it.onHit];
    WA.game.say(`${nameOf(m)} takes a ${it.name}. ${fx.name} ${mag} for ${dur} turns.`);
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function tickFx(m) {
    if (!fxOf(m).length) return;
    const gone = [];
    for (const f of m.fx) {
      const def = WA.status && WA.status.EFX[f.t];
      if (!def) { f.dur = 0; continue; }
      f.dur = (f.dur | 0) - 1;
      if (f.dur <= 0) gone.push(def.name.toLowerCase());
    }
    m.fx = m.fx.filter(f => (f.dur | 0) > 0);
    for (const n of gone) WA.game.say(`${nameOf(m)}'s ${n} fades.`);
  }

  /* Supplies move like gear, one item at a time. A downed companion can still
     be searched, so their Stimpaks and food remain reachable. */
  function giveSupply(id, itemId) {
    const s = S(), m = memberIn(s, id), it = WA.GAME.items[itemId];
    if (!s || !m || !it) return false;
    if (m.down) { WA.game.say(`${nameOf(m)} is out cold and cannot take supplies.`); return false; }
    if (itemId === 'stimpak') {
      if (!(s.stims | 0)) { WA.game.say('You have no Stimpaks to give.'); return false; }
      if ((m.stims | 0) >= STIM_MAX) { WA.game.say(`${nameOf(m)} already carries ${STIM_MAX} Stimpaks.`); return false; }
      s.stims = (s.stims | 0) - 1;
      m.stims = (m.stims | 0) + 1;
      WA.game.say(`You give ${nameOf(m)} a Stimpak. (${m.stims}/${STIM_MAX})`);
    } else {
      if (!canSupply(it)) { WA.game.say(`${nameOf(m)} has no use for the ${it.name}.`); return false; }
      if (medsOf(m).length >= MED_MAX) { WA.game.say(`${nameOf(m)} is carrying all the supplies they can.`); return false; }
      const at = (s.inv || []).indexOf(itemId);
      if (at < 0) { WA.game.say(`You are not carrying the ${it.name}.`); return false; }
      s.inv.splice(at, 1);
      m.meds = medsOf(m).concat(itemId);
      WA.game.say(`You give ${nameOf(m)} the ${it.name}.`);
    }
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function takeSupply(id, itemId) {
    const s = S(), m = memberIn(s, id);
    if (!s || !m) return false;
    if (itemId === 'stimpak') {
      if (!(m.stims | 0)) { WA.game.say(`${nameOf(m)} has no Stimpaks.`); return false; }
      m.stims = (m.stims | 0) - 1;
      s.stims = (s.stims | 0) + 1;
      WA.game.say(`${nameOf(m)} hands you a Stimpak. (${m.stims} left with them)`);
    } else {
      const meds = medsOf(m).slice();
      const at = meds.indexOf(itemId);
      if (at < 0) return false;
      const it = WA.GAME.items[itemId] || { name: itemId };
      meds.splice(at, 1);
      m.meds = meds;
      s.inv.push(itemId);
      WA.game.say(`${nameOf(m)} hands you the ${it.name}.`);
    }
    if (WA.save) WA.save.queueAutosave();
    refresh();
    return true;
  }

  function changed() {
    if (WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
  }

  function refresh() {
    if (WA.pip) WA.pip.render();
    if (WA.view) WA.view.draw();
  }

  /* ---------- damage, death ---------- */
  function hurtById(id, amount, src) {
    const s = S(), m = memberIn(s, id);
    if (!m || m.down) return;
    m.hp = Math.max(0, (m.hp | 0) - Math.max(0, amount | 0));
    const e = entOf(s, m);
    if (e) e.hp = m.hp;
    if (m.hp > 0) return;
    m.down = true;
    m.bleed = BLEED;
    m.mode = 'wait';
    WA.game.say(`${nameOf(m)} goes down! Use a Stimpak from PARTY — ${BLEED} turns before they bleed out.`);
    if (src && src.d) WA.game.say(`${src.d.name} stands over ${nameOf(m)}.`);
    refresh();
  }

  function die(m) {
    const s = S();
    const nm = nameOf(m);
    const gear = SLOTS.map(k => m[k]).filter(Boolean);
    s.gone = s.gone || {};
    s.gone[m.id] = 1;
    s.party = s.party.filter(x => x !== m);
    const e = entOf(s, m);
    if (e) {
      WA.game.removeEntity(e);
      changed();
    }
    const supplies = (m.stims | 0) + medsOf(m).length;
    WA.game.say(`${nm} is dead. The wasteland does not give people back.` +
      (gear.length || supplies ? ' Everything they carried is lost with them.' : ''));
    if (WA.save) WA.save.queueAutosave();
    refresh();
  }

  /* ---------- follower turns ---------- */
  function nearestFoe(s, e, maxDist) {
    let best = null, bd = (maxDist | 0) || 99;
    for (const o of s.ents) {
      if (!o.d || o.d.talk || o.d.ally || o.hp <= 0) continue;
      const d = U.cheb(e.x, e.y, o.x, o.y);
      if (d < bd) { best = o; bd = d; }
    }
    return best;
  }

  function strike(e, target, m) {
    const s = S(), d = e.d, g = gearOf(m);
    const chance = U.clamp(80 + ((d.acc | 0) || 0), 5, 95);
    if (Math.random() * 100 > chance) {
      WA.game.say(`${d.name} misses the ${target.d.name}.`);
      return false;
    }
    const bonus = Math.floor(WA.scale.dmgBonus(s.lvl) / 2) + fxMod(m, 'strength');
    let amount = Math.max(1, Math.round(U.rnd(...g.dmg) * g.wf) + bonus);
    // A companion swings on the same difficulty dial as the player.
    if (WA.settings) amount = Math.max(1, Math.round(amount * WA.settings.outgoingMul()));
    const hit = WA.damage.hurtEnemy(target, amount, g.dt);
    WA.game.say(`${d.name} ${g.ranged ? 'shoots' : 'hits'} the ${target.d.name} for ${hit.value}.`);
    WA.damage.slay(target, `${d.name} kills the ${target.d.name}.`);
    return true;
  }

  /* Stimulated companions get a second swing while the chem lasts. */
  function attack(e, foe, m) {
    strike(e, foe, m);
    if (foe.hp > 0 && S().ents.includes(foe) && fxMod(m, 'apregen') > 0) strike(e, foe, m);
  }

  function fallBack(e, foe) {
    let best = null, bd = U.cheb(e.x, e.y, foe.x, foe.y);
    for (const [dx, dy] of WA.path.DIRS) {
      const x = e.x + dx, y = e.y + dy;
      if (!WA.game.free(x, y)) continue;
      const d = U.cheb(x, y, foe.x, foe.y);
      if (d > bd) { best = [x, y]; bd = d; }
    }
    if (best) WA.game.moveEntity(e, best[0], best[1]);
  }

  function act(s, e, m) {
    const d = e.d, g = gearOf(m);
    const foe = nearestFoe(s, e, (d.sight || 6) + 1);
    const dist = foe ? U.cheb(e.x, e.y, foe.x, foe.y) : 99;
    const canShoot = foe && g.ranged && dist <= g.range && WA.vis.los(e.x, e.y, foe.x, foe.y);

    if (m.mode === 'retreat') {
      if (foe && dist <= 4) fallBack(e, foe);
      return;
    }
    if (m.mode === 'wait') {
      if (foe && (dist === 1 || canShoot)) attack(e, foe, m);
      return;
    }
    if (m.mode === 'attack') {
      if (!foe) return;
      if (canShoot) { attack(e, foe, m); return; }
      if (dist === 1) { attack(e, foe, m); return; }
      if (dist <= (d.sight || 6) && WA.vis.los(e.x, e.y, foe.x, foe.y)) WA.ai.stepToward(e, foe.x, foe.y);
      return;
    }

    // Follow: stay at the player's heel, and hit what is already in reach.
    const toPlayer = U.cheb(e.x, e.y, s.px, s.py);
    if (toPlayer > 1) {
      WA.ai.stepToward(e, s.px, s.py);
      return;
    }
    if (foe && (dist === 1 || canShoot)) attack(e, foe, m);
  }

  function turn() {
    const s = S();
    if (!s || s.dead) return;
    for (const m of roster(s).slice()) {
      if (!memberIn(s, m.id)) continue;
      if (m.down) {
        m.bleed = (m.bleed | 0) - 1;
        if (m.bleed <= 0) die(m);
        continue;
      }
      tickFx(m);
      const e = entOf(s, m);
      if (!e) { if (!spawnNear(s, m)) continue; continue; }
      if (selfCare(m)) continue;
      if (wantsChem(s, m) && takeChem(m)) continue;
      act(s, e, m);
      if (s.dead) return;
    }
  }

  /* ---------- PARTY screen ---------- */
  function html() {
    const s = S();
    if (!s) return '';
    const list = roster(s);
    const head = `<div class="prow"><span>COMPANIONS <b>${list.length}</b><small class="dim">/${MAX}</small></span>` +
      `<span class="dim">${list.length ? 'orders apply on their turn' : 'nobody travelling with you'}</span></div>`;
    if (!list.length) {
      const gone = s.gone || {};
      const who = [
        gone.rook_ally ? 'Rook is dead.' : 'Rook works the ruins market and swings a length of rebar.',
        gone.vera_ally ? 'Vera is dead.' : 'Vera walks the outskirts road with a rifle.',
        gone.ash_ally ? 'Ash is dead.' : 'Ash guards the outskirts road and wants Rivet dead.'
      ].join(' ');
      return head +
        `<div class="dim" style="font-size:12px;line-height:1.5;margin-top:4px">` +
        `${who} Talk to whoever is left to ask them along.</div>`;
    }
    const rows = list.map(m => {
      const d = defOf(m.id) || {};
      const hp = m.hp | 0, max = maxHp(m);
      const pct = Math.round((hp / max) * 100);
      /* Gear rows: what they hold now, and the compatible pieces in your pack. */
      const gear = () => {
        const g = gearOf(m);
        const packFor = slot => {
          const seen = new Set(), out = [];
          for (const id of s.inv || []) {
            const it = WA.GAME.items[id];
            if (!it || it.type !== slot || !allows(m.id, it) || seen.has(id)) continue;
            seen.add(id);
            out.push({ id, it, n: (s.inv || []).filter(x => x === id).length });
          }
          return out;
        };
        const row = (slot, label) => {
          const it = WA.GAME.items[m[slot]] || null;
          const cnd = it && WA.weapons ? WA.weapons.condOf(m[slot]) : null;
          const info = !it ? ''
            : slot === 'weapon'
              ? `${(it.dmg || [1, 2]).join('-')} dmg, ${(it.range || 1) > 1 ? 'range ' + it.range : 'melee'} · CND ${cnd}%`
              : `def ${Math.round((it.def || 0) * g.af)} · AC ${Math.round((it.ac || 0) * g.af)} · CND ${cnd}%`;
          const choices = packFor(slot);
          const give = choices.length
            ? choices.map(c => `<button data-pgive="${m.id}:${c.id}" title="Give ${U.esc(c.it.name)}">${U.esc(c.it.name)}${c.n > 1 ? ' ×' + c.n : ''}</button>`).join('')
            : `<span class="dim">${slot === 'weapon'
              ? (gearRule(d) === 'ranged' ? 'no ranged weapon' : gearRule(d) === 'melee' ? 'no melee weapon' : 'no weapon')
              : 'no armour'} in your pack</span>`;
          return `<div class="prow" style="margin-top:3px"><span>${label}: ${it ? U.esc(it.name) : '<small class="dim">none</small>'}` +
            (info ? ` <small class="dim">${U.esc(info)}</small>` : '') + '</span>' +
            (it ? `<button data-ptake="${m.id}:${slot}" style="width:52px;font-size:11px">Take</button>` : '') +
            `</div><div class="pgive"><span class="dim">${it ? 'Swap' : 'Give'}</span>${give}</div>`;
        };
        return row('weapon', 'Weapon') + row('armor', 'Armor');
      };
      /* Supplies: their own Stimpaks and healing items, one at a time. */
      const supplies = () => {
        const stims = m.stims | 0;
        const meds = medsOf(m);
        const counts = {};
        for (const id of meds) counts[id] = (counts[id] | 0) + 1;
        const medBtns = Object.keys(counts).map(id => {
          const it = WA.GAME.items[id] || { name: id };
          return `<button data-pmed="${m.id}:take:${id}" title="Take it back">Take ${U.esc(it.name)}` +
            (counts[id] > 1 ? ' ×' + counts[id] : '') + '</button>';
        }).join('');
        const give = [];
        const seen = new Set();
        for (const id of s.inv || []) {
          const it = WA.GAME.items[id];
          if (!canSupply(it) || seen.has(id)) continue;
          seen.add(id);
          give.push({ id, it, n: (s.inv || []).filter(x => x === id).length });
        }
        const giveBtns = m.down ? '' : ((s.stims | 0) > 0 && stims < STIM_MAX
          ? `<button data-pmed="${m.id}:give:stimpak" title="Give one of your Stimpaks">Stimpak` +
            ((s.stims | 0) > 1 ? ' ×' + (s.stims | 0) : '') + '</button>'
          : '') +
          (meds.length < MED_MAX
            ? give.map(c => `<button data-pmed="${m.id}:give:${c.id}" title="Give the ${U.esc(c.it.name)}">` +
              U.esc(c.it.name) + (c.n > 1 ? ' ×' + c.n : '') + '</button>').join('')
            : '');
        return `<div class="prow" style="margin-top:3px"><span>Stims <b>${stims}</b>` +
            `<small class="dim">/${STIM_MAX} · patches up below ${Math.round(HEAL_AT * 100)}% HP</small></span>` +
            (stims ? `<button data-pmed="${m.id}:take:stimpak" style="width:52px;font-size:11px">Take</button>` : '') +
          `</div>` +
          (fxOf(m).length ? `<div class="prow"><span class="dim">Buffs</span>` +
            `<span class="good" style="font-size:12px">${U.esc(WA.status.tag(m.fx))}</span></div>` : '') +
          `<div class="pgive"><span class="dim">Kit</span>` +
          (medBtns || '<span class="dim">none</span>') + `</div>` +
          (m.down ? '' : `<div class="pgive"><span class="dim">Give</span>` +
            (giveBtns || '<span class="dim">nothing to give</span>') + `</div>`);
      };
      const state = m.down
        ? `<span class="bad">DOWN · bleeds out in ${Math.max(0, m.bleed | 0)}</span>`
        : `<span class="${pct <= 30 ? 'warn' : 'good'}">${hp}/${max} HP</span>`;
      const stance = stanceOf(m.id);
      const orders = m.down ? '' : Object.keys(MODES).map(k =>
        `<button data-pcmd="${m.id}:${k}" class="${m.mode === k ? 'sel' : ''}" title="${MODES[k]}">${MODES[k]}</button>`
      ).join('');
      return `<div class="partyrow">` +
        `<div class="prow"><span><b>${U.esc(d.name || m.id)}</b> <small class="dim">${U.esc(d.title || '')}</small></span>` +
        `<span class="acts">${state}</span></div>` +
        `<div class="partybar"><i style="width:${pct}%"></i></div>` +
        `<div class="prow" style="margin-top:3px"><span class="${stance.cls}" style="font-size:12px;font-style:italic">“${U.esc(stance.text)}”</span></div>` +
        (m.down
          ? supplies() +
            `<div class="use" style="margin-top:4px"><button data-pstim="${m.id}" ${(m.stims | 0) || (s.stims | 0) ? '' : 'disabled'} title="Their own Stimpak is spent first">Stimpak (${(m.stims | 0) || (s.stims | 0)})</button>` +
            `<button data-pdis="${m.id}" style="flex:0 0 76px">Leave them</button></div>`
          : `<div class="partycmd">${orders}</div>` + gear() + supplies() +
            `<div class="prow" style="margin-top:4px"><span class="dim" style="font-size:12px">${U.esc(d.desc || '')}</span>` +
            `<button data-pdis="${m.id}" style="width:70px">Dismiss</button></div>`) +
        `</div>`;
    }).join('');
    return head + rows +
      `<div class="dim" style="font-size:12px;margin-top:6px">A downed companion keeps bleeding on every world turn; their own Stimpak is spent first to bring them back at 30% HP. ` +
      `A wounded companion patches themselves up on their turn with a Stimpak or food, which costs that turn's action. ` +
      `A companion who sees a hostile and carries a chem takes it, spending that turn; Jacked adds damage, Fortified soaks hits and Stimulated adds a second strike. ` +
      `Gear and supplies move between your pack and theirs, and do not count against your carry weight.</div>`;
  }

  function actFromPanel(cmd) {
    const parts = String(cmd || '').split(':');
    const a = parts[0], id = parts[1];
    if (a === 'cmd') return command(id, parts[2]);
    if (a === 'stim') return stabilize(id);
    if (a === 'dis') return dismiss(id);
    if (a === 'give') return equip(id, parts[2]);
    if (a === 'take') return unequip(id, parts[2]);
    if (a === 'med') return parts[2] === 'give' ? giveSupply(id, parts[3]) : takeSupply(id, parts[3]);
    return false;
  }

  WA.party = {
    MAX, BLEED, MODES, SLOTS, STIM_MAX, MED_MAX, HEAL_AT,
    recruit, dismiss, command, stabilize, sync, turn, html, act: actFromPanel,
    react, stance: stanceOf,
    equip, unequip, gearStats, allows,
    giveSupply, takeSupply, canMed, canChem, canSupply, selfCare, takeChem, tickFx,
    buffMod: (id, t) => {
      const m = memberIn(S(), id);
      return m ? fxMod(m, t) : 0;
    },
    supplies: id => {
      const s = S(), m = memberIn(s, id);
      return m ? { stims: m.stims | 0, meds: medsOf(m).slice(),
        fx: fxOf(m).map(f => ({ ...f })) } : null;
    },
    hurtById,
    get members() { return roster().slice(); },
    has: id => !!member(id),
    entOf: id => { const s = S(); const m = s && memberIn(s, id); return s && m ? entOf(s, m) : null; }
  };
})(window.WA = window.WA || {});
