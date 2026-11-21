/* Content packs: the file the studio hands to a game that lives on another
   origin. A pack carries authored maps plus tile, item and enemy overrides,
   authored jobs and dialogue patches. The game validates a pack before it is
   stored (IndexedDB, with a localStorage fallback) and applies it at boot
   after the shipped content, so a bad pack cannot leave the game half-merged.

   Format:
   { format: "wasteland-content", version: 1, name, created,
     defs: { tiles, entities, items }, maps: { id: map }, quests: { id: def },
     dialogue: { npc: patch } } */
(function (WA) {
  'use strict';

  const DB = 'wasteland-content', STORE = 'packs', REC = 'active';
  const LS = 'wasteland.contentPack';
  const KINDS = ['tiles', 'entities', 'items'];
  const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
  const QUEST_RE = /^[a-z][a-z0-9_]*$/;
  const MAX_TEXT = 16 * 1024 * 1024;
  const MAX_MAPS = 200, MAX_QUESTS = 500, MAX_DEFS = 5000;

  let ACTIVE = null, DBH = null, OPENED = false, FP = '';

  /* ---------- storage ---------- */
  function openDB() {
    if (OPENED) return Promise.resolve(DBH);
    OPENED = true;
    return new Promise(resolve => {
      if (typeof indexedDB === 'undefined') { DBH = null; return resolve(null); }
      let settled = false;
      const done = d => { if (!settled) { settled = true; DBH = d; resolve(d); } };
      try {
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        };
        rq.onsuccess = () => done(rq.result);
        rq.onerror = () => done(null);
        rq.onblocked = () => done(null);
        setTimeout(() => done(null), 2500);
      } catch (e) { done(null); }
    });
  }

  function localRead() {
    try {
      const raw = localStorage.getItem(LS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function readStored() {
    const db = await openDB();
    if (!db) return localRead();
    return new Promise(resolve => {
      try {
        const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(REC);
        rq.onsuccess = () => resolve((rq.result && rq.result.pack) || localRead());
        rq.onerror = () => resolve(localRead());
      } catch (e) { resolve(localRead()); }
    });
  }

  async function writeStored(pack) {
    let ok = false;
    const db = await openDB();
    if (db) {
      ok = await new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put({ id: REC, at: Date.now(), pack });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    }
    if (!ok) {
      try { localStorage.setItem(LS, JSON.stringify(pack)); ok = true; }
      catch (e) { ok = false; }
    }
    return ok;
  }

  async function eraseStored() {
    const db = await openDB();
    if (db) {
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).delete(REC);
      } catch (e) {}
    }
    try { localStorage.removeItem(LS); } catch (e) {}
  }

  /* ---------- fingerprint ---------- */
  /* Stable stringify so the same pack imported from a file and fetched from a
     URL produces the same fingerprint regardless of key order. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function digest(pack) {
    const s = stable(pack || null);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  /* Fingerprinting walks the whole pack, and every autosave asks for the active
     one, so the applied pack is hashed once instead of on each snapshot. */
  function fingerprint(pack) {
    const p = pack || ACTIVE || null;
    if (p && p === ACTIVE && FP) return FP;
    return digest(p);
  }

  function counts(pack) {
    const p = pack || ACTIVE;
    if (!p) return { maps: 0, quests: 0, dialogue: 0, defs: 0 };
    let defs = 0;
    for (const k of KINDS) defs += Object.keys(p.defs && p.defs[k] || {}).length;
    return {
      maps: Object.keys(p.maps || {}).length,
      quests: Object.keys(p.quests || {}).length,
      dialogue: Object.keys(p.dialogue || {}).length,
      defs
    };
  }

  function summary() {
    if (!ACTIVE) return null;
    return { name: ACTIVE.name, created: ACTIVE.created || '', fp: fingerprint(ACTIVE), counts: counts(ACTIVE) };
  }

  /* ---------- validation ---------- */
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* Every tile, entity, item and map a pack map may name: the shipped content
     plus this pack's own definitions. A def set to null removes a shipped one. */
  function knownNames(pack, mapIds) {
    const defs = kind => {
      const out = {};
      for (const id of Object.keys(WA.GAME[kind] || {})) out[id] = 1;
      for (const id of Object.keys(pack.defs[kind] || {})) if (pack.defs[kind][id]) out[id] = 1;
      return out;
    };
    const maps = {};
    for (const id of Object.keys(WA.GAME.maps || {})) maps[id] = 1;
    for (const id of mapIds) if (ID_RE.test(id)) maps[id] = 1;
    return { tiles: defs('tiles'), entities: defs('entities'), items: defs('items'), maps };
  }

  /* world.start() walks things as [id, x, y], resolves every legend symbol to a
     tile and follows exits by map id, so a map that names anything it does not
     have throws part-way through loading. Reject it here instead. */
  function checkMap(id, m, errors, known) {
    const at = `map ${id}`;
    if (!ID_RE.test(id)) { errors.push(`${at}: id must be letters, digits, _ or -`); return; }
    if (!isObj(m)) { errors.push(`${at}: map must be an object`); return; }
    if (!Array.isArray(m.rows) || !m.rows.length) { errors.push(`${at}: needs rows`); return; }
    if (m.rows.length > 400) { errors.push(`${at}: too many rows`); return; }
    for (let y = 0; y < m.rows.length; y++) {
      const row = m.rows[y];
      if (typeof row !== 'string') { errors.push(`${at}: row ${y} is not text`); return; }
      if (row.length > 512) { errors.push(`${at}: row ${y} is too wide`); return; }
    }
    const w = Math.max(1, ...m.rows.map(r => WA.util.split(r).length));
    const h = m.rows.length;
    if (m.legend !== undefined) {
      if (!isObj(m.legend)) errors.push(`${at}: legend must be an object`);
      else for (const ch of Object.keys(m.legend)) {
        const tid = m.legend[ch];
        if (WA.util.split(ch).length !== 1) { errors.push(`${at}: legend key "${ch}" is not one symbol`); continue; }
        if (typeof tid !== 'string' || !known.tiles[tid]) errors.push(`${at}: legend "${ch}" names unknown tile "${tid}"`);
      }
    }
    if (m.start !== undefined && (!Array.isArray(m.start) || m.start.length !== 2 ||
      !isFinite(+m.start[0]) || !isFinite(+m.start[1]))) errors.push(`${at}: start must be [x, y]`);
    if (m.things !== undefined) {
      if (!Array.isArray(m.things)) errors.push(`${at}: things must be a list`);
      else if (m.things.length > 4000) errors.push(`${at}: too many things`);
      else for (let i = 0; i < m.things.length; i++) {
        const t = m.things[i];
        if (!Array.isArray(t) || t.length !== 3) { errors.push(`${at}: thing ${i} must be [id, x, y]`); continue; }
        const tid = t[0], x = t[1], y = t[2];
        if (typeof tid !== 'string' || !(known.entities[tid] || known.items[tid])) {
          errors.push(`${at}: thing ${i} names unknown entity or item "${tid}"`);
          continue;
        }
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) {
          errors.push(`${at}: thing ${i} (${tid}) is outside the map`);
        }
      }
    }
    if (m.ambience !== undefined && (typeof m.ambience !== 'string' || m.ambience.length > 20)) {
      errors.push(`${at}: ambience must be a short bed name`);
    }
    if (m.exits !== undefined) {
      if (!isObj(m.exits)) errors.push(`${at}: exits must be an object`);
      else for (const key of Object.keys(m.exits)) {
        const pair = String(key).split(',').map(Number);
        const to = m.exits[key];
        if (pair.length !== 2 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1]) ||
          pair[0] < 0 || pair[1] < 0 || pair[0] >= w || pair[1] >= h) {
          errors.push(`${at}: exit ${key} is outside the map`);
          continue;
        }
        if (typeof to !== 'string' || !known.maps[to]) errors.push(`${at}: exit ${key} leads to unknown map "${to}"`);
      }
    }
  }

  function validate(raw) {
    const errors = [];
    if (!isObj(raw)) return { ok: false, errors: ['That file is not a content pack.'] };
    if (raw.format !== 'wasteland-content') errors.push('Missing "wasteland-content" format tag.');
    if (raw.version !== 1) errors.push(`Unsupported pack version: ${raw.version}.`);
    if (raw.name !== undefined && typeof raw.name !== 'string') errors.push('Pack name must be text.');

    const pack = {
      format: 'wasteland-content', version: 1,
      name: String(raw.name || 'Unnamed pack').slice(0, 60),
      created: typeof raw.created === 'string' ? raw.created : '',
      defs: { tiles: {}, entities: {}, items: {} },
      maps: {}, quests: {}, dialogue: {}
    };

    const defs = raw.defs;
    if (defs !== undefined && !isObj(defs)) errors.push('defs must be an object.');
    for (const kind of KINDS) {
      const src = isObj(defs) ? defs[kind] : null;
      if (src === undefined || src === null) continue;
      if (!isObj(src)) { errors.push(`defs.${kind} must be an object.`); continue; }
      const ids = Object.keys(src);
      if (ids.length > MAX_DEFS) { errors.push(`defs.${kind} has too many entries.`); continue; }
      for (const id of ids) {
        const d = src[id];
        if (!ID_RE.test(id)) { errors.push(`defs.${kind}: bad id "${id}"`); continue; }
        if (d === null) { pack.defs[kind][id] = null; continue; }
        if (!isObj(d)) { errors.push(`defs.${kind}.${id} must be an object or null`); continue; }
        if (d.talk !== undefined) { errors.push(`defs.${kind}.${id}: dialogue cannot travel in a pack`); continue; }
        pack.defs[kind][id] = d;
      }
    }

    if (raw.maps !== undefined && !isObj(raw.maps)) errors.push('maps must be an object.');
    const mapIds = isObj(raw.maps) ? Object.keys(raw.maps) : [];
    if (mapIds.length > MAX_MAPS) errors.push('Too many maps in one pack.');
    const known = knownNames(pack, mapIds);
    for (const id of mapIds.slice(0, MAX_MAPS)) checkMap(id, raw.maps[id], errors, known);
    if (!errors.length) for (const id of mapIds) pack.maps[id] = raw.maps[id];

    if (raw.quests !== undefined && !isObj(raw.quests)) errors.push('quests must be an object.');
    const questIds = isObj(raw.quests) ? Object.keys(raw.quests) : [];
    if (questIds.length > MAX_QUESTS) errors.push('Too many jobs in one pack.');
    for (const id of questIds.slice(0, MAX_QUESTS)) {
      const q = raw.quests[id];
      if (!QUEST_RE.test(id)) { errors.push(`job "${id}": id must be lowercase letters, digits and underscores`); continue; }
      if (typeof WA.quests === 'undefined' || !WA.quests.checkAuthored) { errors.push('Quest checker is not loaded.'); break; }
      const bad = WA.quests.checkAuthored(id, q);
      const giver = q && WA.GAME.entities[q.giver];
      if (!bad.length && (!giver || !giver.talk)) bad.push(`job ${id}: giver "${q.giver}" has no dialogue tree in the game`);
      for (const msg of bad) errors.push(msg);
      if (!bad.length) pack.quests[id] = q;
    }

    if (raw.dialogue !== undefined && !isObj(raw.dialogue)) errors.push('dialogue must be an object.');
    if (isObj(raw.dialogue)) {
      for (const npc of Object.keys(raw.dialogue)) {
        const patch = raw.dialogue[npc];
        const ent = WA.GAME.entities[npc];
        if (!ID_RE.test(npc)) { errors.push(`dialogue "${npc}": bad NPC id`); continue; }
        if (!ent || !ent.talk) { errors.push(`dialogue "${npc}": the game has no dialogue tree for that NPC`); continue; }
        if (!isObj(patch)) { errors.push(`dialogue ${npc}: patch must be an object`); continue; }
        for (const k of Object.keys(patch)) {
          if (!['quest', 'root', 'nodes', 'add'].includes(k)) { errors.push(`dialogue ${npc}: unknown key "${k}"`); continue; }
          if (k === 'root' && typeof patch.root !== 'string') { errors.push(`dialogue ${npc}: root must be a page name`); continue; }
          if ((k === 'nodes' || k === 'add') && !isObj(patch[k])) errors.push(`dialogue ${npc}: ${k} must be an object`);
        }
        pack.dialogue[npc] = patch;
      }
    }

    if (errors.length) return { ok: false, errors: errors.slice(0, 40), more: Math.max(0, errors.length - 40) };
    return { ok: true, errors: [], pack };
  }

  /* ---------- runtime ---------- */
  function applyPack(pack) {
    if (!pack) return;
    if (WA.baked) WA.baked.apply(pack.defs);
    for (const id of Object.keys(pack.maps || {})) {
      if (ID_RE.test(id) && isObj(pack.maps[id])) WA.GAME.maps[id] = pack.maps[id];
    }
    const skipped = [];
    if (WA.quests && WA.quests.adopt) {
      for (const id of Object.keys(pack.quests || {})) {
        if (!WA.quests.adopt(id, pack.quests[id])) skipped.push('job ' + id);
      }
    }
    if (WA.authored && WA.authored.mergePatch) {
      for (const npc of Object.keys(pack.dialogue || {})) {
        if (WA.authored.mergePatch(npc, pack.dialogue[npc])) {
          const d = WA.GAME.entities[npc];
          if (d && d.talk) d.talk._authored = 1;
        } else skipped.push('dialogue ' + npc);
      }
    }
    ACTIVE = pack;
    FP = digest(pack);
    if (skipped.length) console.warn('[Wasteland] Content pack skipped: ' + skipped.join(', '));
  }

  async function load() {
    const raw = await readStored();
    if (!raw) return { ok: false, errors: [] };
    const v = validate(raw);
    if (!v.ok) {
      console.warn('[Wasteland] Stored content pack is invalid: ' + v.errors.join('; '));
      return { ok: false, errors: v.errors };
    }
    applyPack(v.pack);
    return { ok: true, errors: [], pack: v.pack };
  }

  async function importText(text) {
    if (typeof text !== 'string' || !text.length) return { ok: false, errors: ['That file is empty.'] };
    if (text.length > MAX_TEXT) return { ok: false, errors: ['That pack is too large.'] };
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, errors: ['That file is not valid JSON.'] }; }
    const v = validate(raw);
    if (!v.ok) return v;
    const stored = await writeStored(v.pack);
    applyPack(v.pack);
    return { ok: true, errors: [], pack: v.pack, stored };
  }

  async function importFile(file) {
    if (!file) return { ok: false, errors: ['No file chosen.'] };
    let text;
    try { text = await file.text(); }
    catch (e) { return { ok: false, errors: ['That file could not be read.'] }; }
    return importText(text);
  }

  async function importUrl(url) {
    let res;
    try { res = await fetch(url, { cache: 'no-store' }); }
    catch (e) { return { ok: false, errors: ['That URL could not be reached.'] }; }
    if (!res || !res.ok) return { ok: false, errors: [`That URL returned ${res ? res.status : 'no response'}.`] };
    let text;
    try { text = await res.text(); }
    catch (e) { return { ok: false, errors: ['That URL could not be read.'] }; }
    return importText(text);
  }

  async function clear() {
    ACTIVE = null;
    FP = '';
    await eraseStored();
  }

  WA.pack = {
    load, importText, importFile, importUrl, clear, validate, apply: applyPack,
    summary, fingerprint, counts,
    current: () => ACTIVE
  };
})(window.WA = window.WA || {});
