/* World state: maps, the live game state, occupancy, travel and save snapshots. */
(function (WA) {
  'use strict';
  const U = WA.util;

  /* ---------- map format ------------------------------------------------
     A map stores layer data, not a picture: one tile ID grid plus a list of
     entities and items placed on top. Glyphs come from the definitions only. */
  /* Legend characters are internal storage keys, never display glyphs. ASCII
     keeps small exports readable; the private-use ranges give duplicate-glyph
     catalogs room to grow without collisions. */
  const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
    Array.from({ length: 6400 }, (_, i) => String.fromCharCode(0xE000 + i)).join('');
  function fallbackChar(n) {
    if (n < POOL.length) return POOL[n];
    let i = n - POOL.length;
    if (i < 0xFFFE) return String.fromCodePoint(0xF0000 + i);
    i -= 0xFFFE;
    return String.fromCodePoint(0x100000 + Math.min(i, 0xFFFD));
  }

  function packMap(o) {
    const legend = {}, rev = {};
    let pi = 0;
    for (const id of new Set(o.t.flat())) {
      let c = WA.GAME.tiles[id] && WA.GAME.tiles[id].glyph;
      if (!c || U.split(c).length !== 1 || legend[c]) {
        do { c = fallbackChar(pi++); } while (legend[c]);
      }
      legend[c] = id;
      rev[id] = c;
    }
    return {
      name: o.name, bg: o.bg, amb: o.amb, indoor: !!o.indoor, weather: o.weather || 'none',
      exits: o.exits || {}, start: o.start,
      w: o.t[0].length, h: o.t.length,
      rows: o.t.map(r => r.map(id => rev[id]).join('')),
      legend, things: o.things || []
    };
  }

  // Convert the old one-character-per-tile map text into the layered format.
  function toV2(m) {
    if (m && m.legend) return m;
    const RG = (m.rows || []).map(U.split);
    const w = Math.max(1, ...RG.map(r => r.length));
    const t = [], things = [];
    let start = [1, 1];
    RG.forEach((r, y) => {
      t[y] = [];
      for (let x = 0; x < w; x++) {
        const ch = r[x] ?? '#', id = WA.LEG[ch];
        if (ch === '@') { start = [x, y]; t[y][x] = 'floor'; }
        else if (id && (WA.GAME.entities[id] || WA.GAME.items[id])) { things.push([id, x, y]); t[y][x] = 'floor'; }
        else t[y][x] = id && WA.GAME.tiles[id] ? id : 'wall';
      }
    });
    return packMap({ name: m.name, bg: m.bg, amb: m.amb, indoor: !!m.indoor, weather: m.weather || 'none', exits: m.exits, start, t, things });
  }

  /* ---------- live state ---------- */
  const G = { VW: 25, VH: 13, S: null, WORLD: {} };

  function rebuild(S) {
    S.occ = new Map();
    for (const e of S.ents) {
      const d = WA.GAME.entities[e.id];
      if (d) e.d = d;
      S.occ.set(e.x + ',' + e.y, e);
    }
  }

  const entAt = (x, y) => (G.S && G.S.occ ? G.S.occ.get(x + ',' + y) : undefined);

  function moveEntity(e, nx, ny) {
    const S = G.S;
    S.occ.delete(e.x + ',' + e.y);
    e.x = nx; e.y = ny;
    S.occ.set(nx + ',' + ny, e);
  }

  function removeEntity(e) {
    const S = G.S;
    const i = S.ents.indexOf(e);
    if (i >= 0) S.ents.splice(i, 1);
    S.occ.delete(e.x + ',' + e.y);
  }

  function free(x, y) {
    const S = G.S;
    if (!S) return false;
    const t = WA.GAME.tiles[S.grid[y] && S.grid[y][x]];
    return !!t && !t.solid && !entAt(x, y) && !(x === S.px && y === S.py);
  }

  const say = t => {
    const S = G.S;
    if (!S) return;
    S.log.push(t);
    if (S.log.length > 4) S.log.shift();
  };

  function updateVis() {
    const S = G.S;
    if (!S) return;
    if (!Array.isArray(S.ents)) S.ents = [];
    if (!S.occ) rebuild(S);
    S.vis = WA.vis.compute(S);
    S.light = WA.light.compute(S);
  }

  const draw = () => WA.view.draw();

  /* Hand-written maps in game-data.js still use the old one-character rows.
     Convert one to the packed format start() reads, once: a packed map is
     returned untouched, so conversion is safe to call on every entry path. */
  function normalizeMap(id) {
    const m = WA.GAME.maps[id];
    if (!m || m.legend) return m;
    const packed = toV2(m);
    WA.GAME.maps[id] = packed;
    return packed;
  }

  /* Convert every shipped map at boot, so the Pip-Boy, the map editor and the
     waypoint search see placements and exits before a map is ever entered. */
  function normalize() {
    let n = 0;
    for (const id in WA.GAME.maps) if (normalizeMap(id)) n++;
    return n;
  }

  function start(id, test) {
    const GAME = WA.GAME, m = normalizeMap(id);
    if (!m) return false;
    if (WA.dlg) WA.dlg.close();
    if (WA.loot) WA.loot.abort();
    if (WA.lockpick) WA.lockpick.abort();
    const RG = m.rows.map(U.split);
    const w = Math.max(1, ...RG.map(r => r.length));
    const grid = RG.map(r => Array.from({ length: w }, (_, x) => (m.legend && m.legend[r[x]]) || 'wall'));
    const ents = [], items = {};
    for (const [tid, x, y] of m.things || []) {
      if (GAME.entities[tid]) ents.push({ x, y, id: tid, hp: WA.scale.mobHp(GAME.entities[tid]), d: GAME.entities[tid], slow: 0, cd: 0, weak: 0, last: null, fx: [] });
      else if (GAME.items[tid] && x < w && y < RG.length) items[x + ',' + y] = tid;
    }
    const [sx, sy] = m.start || [1, 1];
    const px = U.clamp(sx | 0, 0, w - 1), py = U.clamp(sy | 0, 0, RG.length - 1);
    const p = GAME.player;
    G.S = {
      id, w, h: RG.length, grid, ents, items, px, py,
      hp: p.hp, stims: p.stims, caps: p.caps, turn: 0, dead: false, log: [],
      name: 'Vault Dweller', gender: 'male', age: 25,
      seen: RG.map(() => Array(w).fill(0)),
      sp: { ...p.special }, lvl: 1, xp: 0, pts: test ? 0 : 5, hpBonus: 0, inv: (p.inv || []).slice(), weapon: null, armor: null,
      ap: 6 + p.special.A, vis: null, fx: [], addictions: [], ending: null,
      limbs: WA.limbs ? WA.limbs.fresh() : { l_arm: 100, r_arm: 100, l_leg: 100, r_leg: 100 },
      shaken: null,
      sneak: false, sneakSpotted: false, sneakMoved: false, stealthLight: null,
      trapsOff: {},
      rads: 0, radaways: p.radaways || 0, ammo: { ...p.ammo }, ammoPick: {}, cond: {}, kits: p.kits || 0,
      seenMaps: { [id]: 1 }, quests: {}, wp: '', talk: {}, loot: {}, hacked: {}, keys: {},
      skillPts: {}, skillPoints: 5 + 2 * p.special.I, tags: [], perks: {}, perkPending: 0,
      traits: [], traitsDone: !!test,
      home: id, test: !!test,       pockets: {}, bounty: 0, hunterDay: 0,
      karma: 0, rep: {},
      party: [], gone: {}
    };
    rebuild(G.S);
    // The roster decides who is standing beside the player on a fresh map.
    if (WA.party) WA.party.sync(G.S);
    if (WA.reputation) WA.reputation.sync(G.S);
    if (WA.field) WA.field.reset();
    // Establish who is on duty now, so the first shift change can be announced.
    if (WA.sched) WA.sched.sync(G.S);
    say('Tap the arrows to move. Tap the top bar or Pip-Boy for your menu.');
    say(G.S.traitsDone
      ? `You have ${G.S.skillPoints} skill points. Open SKILL to spend them.`
      : `You have ${G.S.skillPoints} skill points. Finish character creation first.`);
    updateVis();
    draw();
    return true;
  }

  function newGame(id, test) {
    G.WORLD = {};
    if (WA.vats) WA.vats.reset();
    if (!start(id, test)) return false;
    if (!test && WA.traits) WA.traits.open();
    if (!test) WA.save.queueAutosave();
    return true;
  }

  function travel(to) {
    const prev = G.S;
    const from = prev.id;
    const firstVisit = !(prev.seenMaps && prev.seenMaps[to]);
    const keep = {
      hp: prev.hp, stims: prev.stims, caps: prev.caps, turn: prev.turn, log: prev.log, home: prev.home, test: prev.test, dead: prev.dead,
      sp: prev.sp, lvl: prev.lvl, xp: prev.xp, pts: prev.pts, hpBonus: prev.hpBonus, inv: prev.inv, weapon: prev.weapon, armor: prev.armor, ap: prev.ap,
      name: prev.name, gender: prev.gender, age: prev.age,
      fx: prev.fx, addictions: prev.addictions || [], ending: prev.ending || null,
      limbs: prev.limbs, shaken: prev.shaken || null,
      sneak: !!prev.sneak, sneakSpotted: !!prev.sneakSpotted,
      trapsOff: prev.trapsOff || {},
      rads: prev.rads, radaways: prev.radaways, ammo: prev.ammo, ammoPick: prev.ammoPick || {}, cond: prev.cond, kits: prev.kits,
      skillPts: prev.skillPts || {}, skillPoints: prev.skillPoints | 0, tags: prev.tags || [],
      perks: prev.perks || {}, perkPending: prev.perkPending | 0,
      traits: prev.traits || [], traitsDone: !!prev.traitsDone,
      seenMaps: Object.assign({}, prev.seenMaps, { [to]: 1 }), quests: prev.quests, wp: prev.wp || '', talk: prev.talk,
      keys: prev.keys || {}, shops: prev.shops || {}, hot: prev.hot || {}, notoriety: prev.notoriety | 0,
      karma: prev.karma | 0, rep: { ...(prev.rep || {}) },
      pockets: prev.pockets || {}, bounty: prev.bounty | 0, hunterDay: prev.hunterDay | 0,
      party: (prev.party || []).map(m => ({ ...m,
        meds: Array.isArray(m.meds) ? m.meds.slice() : m.meds,
        fx: Array.isArray(m.fx) ? m.fx.map(f => ({ ...f })) : m.fx })),
      gone: { ...(prev.gone || {}) }
    };
    // Grids come from the map definition, so a cached map only needs what play changed.
    // Fog is packed on the way out, so a long session never keeps 1000 full arrays.
    G.WORLD[from] = {
      // Companion bodies travel with the player, not with the map.
      ents: prev.ents.filter(e => !(e.d && e.d.ally)), items: prev.items, seen: packSeen(prev.seen, prev.w, prev.h),
      sw: prev.w, sh: prev.h, loot: prev.loot || {}, hacked: prev.hacked || {}
    };
    start(to, prev.test);

    // start() builds a fresh state object, so pick it up instead of the old one.
    const S = G.S;
    const w = G.WORLD[to];
    if (w) {
      S.items = w.items || {};
      S.loot = w.loot || {};
      S.hacked = w.hacked || {};
      S.ents = w.ents || [];
      // Left maps are kept with packed fog; unpack only the one being entered.
      // A map resized in the editor since the cache was made needs fresh fog.
      let seen = w.seen;
      if (typeof seen === 'string') seen = w.sw === S.w && w.sh === S.h ? unpackSeen(seen, S.w, S.h) : null;
      if (Array.isArray(seen) && seen.length === S.h && (seen[0] || []).length === S.w) S.seen = seen;
      // The live map state is authoritative now, so it leaves the cache.
      delete G.WORLD[to];
    }
    Object.assign(S, keep);
    rebuild(S);
    // The map you enter has its own people, at the hour you arrive.
    if (WA.sched) WA.sched.sync(S);
    // Arrive beside the exit that leads back where you came from.
    const back = Object.entries(WA.GAME.maps[to].exits || {}).find(([, v]) => v === from);
    if (back) {
      const [ex, ey] = back[0].split(',').map(Number);
      const n = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([dx, dy]) => free(ex + dx, ey + dy));
      if (n) { S.px = ex + n[0]; S.py = ey + n[1]; }
    }
    // Companions arrive beside the player, so this runs after the arrival tile
    // is chosen rather than at the map's default start.
    if (WA.party) WA.party.sync(S);
    updateVis();
    say('You arrive at ' + WA.GAME.maps[to].name + '.');
    if (firstVisit) {
      say(`New territory. +${WA.scale.DISCOVER_XP} XP.`);
      WA.char.gainXp(WA.scale.DISCOVER_XP);
    }
    if (WA.bounty) WA.bounty.arrive(S);
    draw();
    WA.save.flush();
    return true;
  }

  /* ---------- snapshots ---------- */
  const stripEnt = e => ({
    x: e.x, y: e.y, id: e.id, hp: e.hp, slow: e.slow || 0, cd: e.cd || 0, weak: e.weak || 0,
    last: e.last || null, fx: (e.fx || []).map(f => ({ t: f.t, dur: f.dur, mag: f.mag }))
  });

  /* Fog of war packs one hex nibble per four cells, so a visited map costs a
     fraction of the array it came from in a save. */
  function packSeen(seen, w, h) {
    let out = '', nib = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        nib = (nib << 1) | (seen[y] && seen[y][x] ? 1 : 0);
        if (++n === 4) { out += nib.toString(16); nib = 0; n = 0; }
      }
    }
    if (n) out += (nib << (4 - n)).toString(16);
    return out;
  }

  function unpackSeen(bits, w, h) {
    const rows = Array.from({ length: h }, () => Array(w).fill(0));
    if (typeof bits !== 'string') return rows;
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        rows[y][x] = (parseInt(bits[i >> 2] || '0', 16) >> (3 - (i & 3))) & 1;
      }
    }
    return rows;
  }

  // Only keep effects the game still knows about.
  function cleanFx(list) {
    const out = [];
    for (const f of Array.isArray(list) ? list : []) {
      if (!f || !WA.status || !WA.status.EFX[f.t]) continue;
      const dur = Math.max(0, Math.min(20, f.dur | 0));
      const mag = Math.max(0, Math.min(20, f.mag | 0));
      if (dur > 0 && mag > 0) {
        const o = { t: f.t, dur, mag };
        if (typeof f.src === 'string') o.src = f.src;
        out.push(o);
      }
    }
    return out;
  }

  function relink(list) {
    const out = [];
    for (const e of Array.isArray(list) ? list : []) {
      const d = e && WA.GAME.entities[e.id];
      if (!d || typeof e.x !== 'number' || typeof e.y !== 'number') continue;
      out.push({
        x: e.x | 0, y: e.y | 0, id: e.id,
        hp: Math.max(1, (e.hp | 0) || WA.scale.mobHp(d)), d,
        slow: e.slow | 0, cd: e.cd | 0, weak: e.weak || 0,
        last: Array.isArray(e.last) ? e.last : null, fx: cleanFx(e.fx)
      });
    }
    return out;
  }

  // The player's own state, without the map cache. Saves store this in one record.
  function snapshotState() {
    const S = G.S;
    if (!S) return null;
    const s = {};
    for (const k in S) if (k !== 'occ' && k !== 'vis' && k !== 'light' && k !== 'ents' &&
      k !== 'sneakMoved' && k !== 'stealthLight') s[k] = S[k];
    // Allies are rebuilt from the roster, so they never belong in a save.
    s.ents = S.ents.filter(e => !(e.d && e.d.ally)).map(stripEnt);
    // Merchant stock is mutable between a snapshot and a restore; keep the
    // snapshot independent of the live shop records.
    s.shops = JSON.parse(JSON.stringify(S.shops || {}));
    // Stolen-goods marks are mutable too; a snapshot must not share them.
    s.hot = JSON.parse(JSON.stringify(S.hot || {}));
    // Pocket contents are mutable between a snapshot and a restore as well.
    s.pockets = JSON.parse(JSON.stringify(S.pockets || {}));
    // Companion HP and orders change every turn, so the snapshot needs its own
    // records rather than the live roster array.
    s.party = (S.party || []).map(m => ({ ...m,
      meds: Array.isArray(m.meds) ? m.meds.slice() : m.meds,
      fx: Array.isArray(m.fx) ? m.fx.map(f => ({ ...f })) : m.fx }));
    s.gone = { ...(S.gone || {}) };
    // Which content pack this run was saved under; the load menu warns when it
    // is not the pack currently loaded.
    s.pack = WA.pack && WA.pack.fingerprint ? WA.pack.fingerprint() : '';
    // Standing is mutable between a snapshot and a restore, so copy it.
    s.karma = S.karma | 0;
    s.rep = { ...(S.rep || {}) };
    return s;
  }

  // One cached (already left) map, fog packed. Saves store each of these alone.
  function snapshotMap(k) {
    const w = G.WORLD[k];
    if (!w) return null;
    let seen = w.seen;
    if (typeof seen !== 'string') {
      const rows = seen || [];
      const h = rows.length, ww = h ? rows[0].length : 0;
      seen = packSeen(rows, ww, h);
    }
    return {
      items: w.items || {}, seen, ents: (w.ents || []).filter(e => !(e.d && e.d.ally)).map(stripEnt),
      loot: w.loot || {}, hacked: w.hacked || {}
    };
  }

  // Full portable snapshot: used by export/import and the legacy save path.
  function snapshot() {
    const s = snapshotState();
    if (!s) return null;
    const WORLD = {};
    for (const k in G.WORLD) {
      const w = snapshotMap(k);
      if (w) WORLD[k] = w;
    }
    return { v: 3, at: Date.now(), S: s, WORLD };
  }

  function restore(o) {
    const s = o && o.S;
    if (!s || !WA.GAME.maps[s.id]) throw new Error('unknown map');
    if (!Array.isArray(s.grid) || !s.grid.length) throw new Error('no grid');
    if (!s.sp || typeof s.sp !== 'object') throw new Error('no SPECIAL');

    s.h = s.grid.length;
    s.w = Math.max(1, ...s.grid.map(r => (Array.isArray(r) ? r.length : 0)));
    s.grid = s.grid.map(r => {
      const row = Array.isArray(r) ? r.slice(0, s.w) : [];
      while (row.length < s.w) row.push('wall');
      return row;
    });
    const seen = Array.isArray(s.seen) ? s.seen : [];
    s.seen = Array.from({ length: s.h }, (_, y) => {
      const row = Array.isArray(seen[y]) ? seen[y].slice(0, s.w) : [];
      while (row.length < s.w) row.push(0);
      return row.map(v => (v ? 1 : 0));
    });
    s.ents = relink(s.ents);
    // Companions arrived after the first saves. Older saves simply have none,
    // and the roster only keeps ally definitions this build still ships.
    s.party = Array.isArray(s.party) ? s.party.filter(m => m && WA.GAME.entities[m.id] && WA.GAME.entities[m.id].ally).map(m => {
      const def = WA.GAME.entities[m.id];
      const modes = (WA.party && WA.party.MODES) || { follow: 1 };
      const bleedMax = WA.party ? WA.party.BLEED : 3;
      const hp = Math.max(0, Math.min(def.hp | 0 || 1, m.hp | 0));
      const kept = {
        id: m.id, hp, mode: modes[m.mode] ? m.mode : 'follow',
        down: !!m.down || hp <= 0,
        bleed: Math.max(0, Math.min(bleedMax, m.bleed | 0))
      };
      // The stance is part of the roster so a load does not re-log an old line.
      if (m.mood === 'good' || m.mood === 'neutral' || m.mood === 'bad' || m.mood === 'hostile') {
        kept.mood = m.mood;
      }
      // Gear slots arrived after the first party build, so only carry through
      // values the save actually has; sync() gives the rest their starting kit.
      for (const slot of ['weapon', 'armor']) {
        if (m[slot] === undefined) continue;
        const it = WA.GAME.items[m[slot]];
        kept[slot] = it && it.type === slot ? m[slot] : null;
      }
      // Supplies came after the gear slots. Keep what the save holds; sync()
      // gives an older save its starting kit and enforces the caps.
      if (m.stims !== undefined) {
        kept.stims = Math.max(0, Math.min((WA.party && WA.party.STIM_MAX) || 5, m.stims | 0));
      }
      if (Array.isArray(m.meds)) {
        kept.meds = m.meds.filter(x => typeof x === 'string')
          .slice(0, (WA.party && WA.party.MED_MAX) || 3);
      }
      // Active chem buffs persist with them; sync() clamps and drops dead ones.
      if (Array.isArray(m.fx)) {
        kept.fx = m.fx.filter(f => f && typeof f.t === 'string')
          .map(f => ({ t: f.t, dur: f.dur | 0, mag: f.mag | 0 })).slice(0, 4);
      }
      return kept;
    }) : [];
    // One record per companion, even if an imported save lists them twice.
    s.party = [...new Map(s.party.map(m => [m.id, m])).values()].slice(0, (WA.party && WA.party.MAX) || 2);
    // Dead companions stay dead; drop marks for anything this build no longer ships.
    s.gone = (s.gone && typeof s.gone === 'object') ? s.gone : {};
    for (const id in s.gone) {
      if (!WA.GAME.entities[id] || !WA.GAME.entities[id].ally) delete s.gone[id];
    }
    if (!s.items || typeof s.items !== 'object') s.items = {};
    // Containers keep their remaining loot on the save, not in the definition.
    s.loot = (s.loot && typeof s.loot === 'object') ? s.loot : {};
    for (const k in s.loot) {
      const st = s.loot[k];
      if (!st || !Array.isArray(st.it) || !s.items[k]) { delete s.loot[k]; continue; }
      st.it = st.it.filter(id => WA.GAME.items[id]).slice(0, 12);
      st.n = String(st.n || 'Container').slice(0, 40);
      if (!st.it.length) delete s.loot[k];
    }
    if (!Array.isArray(s.inv)) s.inv = [];
    s.log = Array.isArray(s.log) ? s.log.slice(-4) : [];
    s.fx = cleanFx(s.fx);
    s.px = U.clamp(s.px | 0, 0, s.w - 1);
    s.py = U.clamp(s.py | 0, 0, s.h - 1);
    s.lvl = Math.max(1, Math.min(WA.scale.CAP, s.lvl | 0 || 1));
    s.xp = Math.max(0, Math.min(9999999, s.xp | 0));
    s.pts = Math.max(0, Math.min(999, s.pts | 0));
    s.hpBonus = Math.max(0, Math.min(9999, s.hpBonus | 0));
    s.sp = Object.assign({ S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 }, s.sp);
    s.name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 20) : 'Vault Dweller';
    s.gender = s.gender === 'female' ? 'female' : 'male';
    s.age = Math.max(16, Math.min(35, s.age | 0 || 25));
    // Older saves predate skills and perks. Grant the points those levels would
    // have earned (the bank caps at 99) and bank their perk choices.
    const freshSkills = !s.skillPts || typeof s.skillPts !== 'object';
    s.skillPts = freshSkills ? {} : s.skillPts;
    for (const k in s.skillPts) {
      const id = String(k);
      if (!WA.skills || !WA.skills.BY[id]) { delete s.skillPts[k]; continue; }
      s.skillPts[k] = Math.max(0, Math.min(400, Math.round(+s.skillPts[k]) || 0));
    }
    s.perks = (s.perks && typeof s.perks === 'object') ? s.perks : {};
    for (const k in s.perks) {
      if (!WA.perks || !WA.perks.BY[k]) { delete s.perks[k]; continue; }
      s.perks[k] = Math.max(0, Math.min(WA.perks.BY[k].max, s.perks[k] | 0));
    }
    const slots = 3 + (s.perks.tag ? 1 : 0);
    s.tags = Array.isArray(s.tags) ? s.tags.filter(id => WA.skills && WA.skills.BY[id]).slice(0, slots) : [];
    s.tags = [...new Set(s.tags)];
    // Traits arrived after the first saves. Missing fields mean an old save
    // that was created before traits, so it is already past character creation.
    s.traits = Array.isArray(s.traits)
      ? s.traits.filter(id => WA.traits && WA.traits.BY[id]).slice(0, 2) : [];
    s.traits = [...new Set(s.traits)];
    s.traitsDone = s.traitsDone !== false;
    s.addictions = Array.isArray(s.addictions)
      ? s.addictions.filter(id => WA.GAME.items[id] && WA.GAME.items[id].type === 'chem').slice(0, WA.addiction ? WA.addiction.MAX : 8)
      : [];
    s.addictions = [...new Set(s.addictions)];
    s.ending = s.ending && s.ending.id === 'sentinel'
      ? {
        id: 'sentinel', bloody: !!s.ending.bloody,
        karma: Math.max(-100, Math.min(100, s.ending.karma | 0)),
        faction: (WA.reputation && WA.reputation.FACTIONS[s.ending.faction]) ? s.ending.faction : null,
        standing: Math.max(-100, Math.min(100, s.ending.standing | 0))
      } : null;
    const earned = 5 + 2 * (s.sp.I | 0) + Math.max(0, s.lvl - 1) * (5 + 2 * (s.sp.I | 0));
    s.skillPoints = Math.max(0, Math.min(99, s.skillPoints === undefined ? earned : (s.skillPoints | 0)));
    s.perkPending = Math.max(0, Math.min(99, s.perkPending === undefined
      ? Math.floor(s.lvl / 3) : (s.perkPending | 0)));
    s.rads = Math.max(0, Math.min(999, s.rads | 0));
    s.bounty = Math.max(0, Math.min(999999, s.bounty | 0));
    s.hunterDay = Math.max(0, Math.min(999999, s.hunterDay | 0));
    s.sneak = !!s.sneak;
    s.sneakSpotted = !!s.sneakSpotted;
    s.sneakMoved = false;
    s.stealthLight = null;
    s.trapsOff = (s.trapsOff && typeof s.trapsOff === 'object') ? s.trapsOff : {};
    for (const k in s.trapsOff) if (s.trapsOff[k] !== 1) delete s.trapsOff[k];
    s.radaways = Math.max(0, Math.min(99, s.radaways | 0));
    if (!s.ammo || typeof s.ammo !== 'object') s.ammo = { ...WA.GAME.player.ammo };
    for (const k in s.ammo) s.ammo[k] = Math.max(0, Math.min(9999, s.ammo[k] | 0));
    if (s.shaken && (typeof s.shaken !== 'object' || !(s.shaken.turns > 0))) delete s.shaken;
    if (s.shaken) {
      s.shaken.turns = Math.max(0, Math.min(20, s.shaken.turns | 0));
      s.shaken.pen = Math.max(0, Math.min(50, s.shaken.pen | 0));
      if (!s.shaken.turns) delete s.shaken;
    }
    s.ammoPick = (s.ammoPick && typeof s.ammoPick === 'object') ? s.ammoPick : {};
    for (const k in s.ammoPick) {
      const id = s.ammoPick[k];
      if (!WA.GAME.items[id] || WA.GAME.items[id].type !== 'ammo') delete s.ammoPick[k];
    }
    s.cond = (s.cond && typeof s.cond === 'object') ? s.cond : {};
    for (const k in s.cond) s.cond[k] = Math.max(0, Math.min(100, s.cond[k] | 0));
    s.kits = Math.max(0, Math.min(99, s.kits | 0));
    s.quests = (s.quests && typeof s.quests === 'object') ? s.quests : {};
    for (const k in s.quests) {
      const q = s.quests[k];
      if (!WA.quests || !WA.quests.has(k) || !q || (q.st !== 'active' && q.st !== 'done')) { delete s.quests[k]; continue; }
      q.n = Math.max(0, Math.min(99, q.n | 0));
    }
    s.talk = (s.talk && typeof s.talk === 'object') ? s.talk : {};
    for (const k in s.talk) {
      const m = s.talk[k], npc = WA.GAME.entities[k];
      if (!npc || !npc.talk || !m || typeof m !== 'object') { delete s.talk[k]; continue; }
      m.trust = Math.max(0, Math.min(9, m.trust | 0));
      m.flags = (m.flags && typeof m.flags === 'object') ? m.flags : {};
      if (typeof m.waryDay === 'number' && isFinite(m.waryDay)) {
        m.waryDay = Math.max(0, Math.min(999999, m.waryDay | 0));
      } else delete m.waryDay;
    }
    // Pockets are per-person counters; drop people or items this build lost.
    s.pockets = (s.pockets && typeof s.pockets === 'object') ? s.pockets : {};
    for (const k in s.pockets) {
      const npc = WA.GAME.entities[k], p = s.pockets[k];
      if (!npc || !Array.isArray(npc.carry) || !p || typeof p !== 'object') { delete s.pockets[k]; continue; }
      for (const id in p) {
        const n = p[id] | 0;
        if (!WA.GAME.items[id] || n <= 0) delete p[id];
        else p[id] = Math.min(999, n);
      }
    }
    s.seenMaps = (s.seenMaps && typeof s.seenMaps === 'object') ? s.seenMaps : {};
    s.seenMaps[s.id] = 1;
    for (const k in s.seenMaps) if (!WA.GAME.maps[k]) delete s.seenMaps[k];
    s.hacked = (s.hacked && typeof s.hacked === 'object') ? s.hacked : {};
    for (const k in s.hacked) if (s.hacked[k] !== 'open' && s.hacked[k] !== 'fail') delete s.hacked[k];
    s.keys = (s.keys && typeof s.keys === 'object') ? s.keys : {};
    for (const k in s.keys) if (!WA.GAME.items[k] || WA.GAME.items[k].type !== 'key' || !s.keys[k]) delete s.keys[k];
    // Merchants keep their sold stock, caps, last top-up time and used-gear wear.
    s.shops = (s.shops && typeof s.shops === 'object') ? s.shops : {};
    for (const k in s.shops) {
      const def = WA.GAME.entities[k] && WA.GAME.entities[k].merchant;
      const st = s.shops[k];
      if (!def || !st || typeof st !== 'object') { delete s.shops[k]; continue; }
      st.caps = Math.max(0, Math.min(999999, st.caps | 0));
      st.day = Math.max(0, st.day | 0);
      st.ban = Math.max(0, st.ban | 0);
      st.caught = Math.max(0, Math.min(9, st.caught | 0));
      const stock = {};
      if (st.stock && typeof st.stock === 'object') {
        for (const id in st.stock) {
          const n = st.stock[id] | 0;
          if (WA.GAME.items[id] && n > 0) stock[id] = Math.min(999, n);
        }
      }
      st.stock = stock;
    }
    if (WA.limbs) WA.limbs.ensure(s);
    s.vis = null;
    s.light = null;

    const WORLD = {};
    const w = o.WORLD || {};
    for (const k in w) {
      const e = w[k], map = WA.GAME.maps[k];
      // The live state is authoritative for its own map.
      if (k === s.id) continue;
      if (!e || !map || !Array.isArray(map.rows) || !map.rows.length) continue;
      const mh = map.rows.length, mw = map.rows[0].length;
      // Keep fog packed in memory; travel unpacks just the entered map.
      let seen;
      if (typeof e.seen === 'string') seen = e.seen;
      else if (Array.isArray(e.seen)) {
        const rows = Array.from({ length: mh }, (_, y) => {
          const row = Array.isArray(e.seen[y]) ? e.seen[y] : [];
          return Array.from({ length: mw }, (_, x) => (row[x] ? 1 : 0));
        });
        seen = packSeen(rows, mw, mh);
      } else seen = '';
      WORLD[k] = { items: e.items || {}, seen, sw: mw, sh: mh, ents: relink(e.ents), loot: (e.loot && typeof e.loot === 'object') ? e.loot : {}, hacked: (e.hacked && typeof e.hacked === 'object') ? e.hacked : {} };
    }

    if (WA.loot) WA.loot.abort();
    if (WA.lockpick) WA.lockpick.abort();
    G.S = s;
    G.WORLD = WORLD;
    rebuild(s);
    if (WA.party) WA.party.sync(s);
    if (WA.reputation) WA.reputation.sync(s);
    if (WA.field) WA.field.reset();
    // Saved positions are a snapshot; the clock decides where people belong now.
    if (WA.sched) WA.sched.sync(s);
    // Radiation, withdrawal and missing Lifegiver ranks can lower the ceilings.
    s.hp = Math.max(1, Math.min(s.hp, WA.char.maxHp()));
    s.ap = Math.max(0, Math.min(s.ap | 0, WA.char.maxAp()));
    updateVis();
    WA.view.reset();
    if (WA.vats) WA.vats.reset();
    draw();
    if (WA.traits) {
      if (!s.test && s.traitsDone === false) WA.traits.open();
      else WA.traits.close();
    }
    return true;
  }

  WA.maps = { POOL, pack: packMap, toV2, normalize };
  WA.game = {
    VW: G.VW, VH: G.VH,
    get S() { return G.S; },
    get WORLD() { return G.WORLD; },
    set WORLD(v) { G.WORLD = v; },
    start, newGame, travel, free, entAt, moveEntity, removeEntity, say, updateVis, snapshot, snapshotState, snapshotMap, restore,
    rebuildOccupancy: () => G.S && rebuild(G.S)
  };
})(window.WA = window.WA || {});
