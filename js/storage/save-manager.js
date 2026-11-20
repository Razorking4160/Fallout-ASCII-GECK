/* Saves: IndexedDB with three manual slots plus autosave, and a localStorage
   fallback for browsers that refuse IndexedDB (some file:// setups).

   A save is split across records: the player state lives in `saves`, and every
   map the player has left lives in `world`, keyed by save + map. Autosave only
   rewrites the map that just changed, so a 1000-map campaign does not rewrite
   the whole world on every save. Export still produces one portable snapshot
   with the world embedded. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const DB_NAME = 'wasteland', STORE = 'saves', WORLD_STORE = 'world', DB_VERSION = 2;
  const SLOTS = ['slot1', 'slot2', 'slot3'];
  const LS_PREFIX = 'wasteland.slot.';
  const LS_WORLD = LS_PREFIX + 'world.';
  const LEGACY = 'wasteland.save';
  const LEGACY_DONE = LEGACY + '.migrated';

  const M = {
    db: null, meta: {}, timer: null, ready: false, confirmNew: false, warned: false,
    // Per-save bookkeeping: which maps have a record, where the player was last
    // time, and whether the next write must store every visited map.
    known: {}, lastMap: {}, forceAll: {}, chain: Promise.resolve()
  };

  const labelOf = id => (id === 'auto' ? 'autosave' : 'slot ' + id.replace('slot', ''));
  const mapName = id => (WA.GAME.maps[id] ? WA.GAME.maps[id].name : id);
  const worldId = (saveId, mapId) => saveId + '|' + mapId;

  function warn() {
    if (M.warned) return;
    M.warned = true;
    WA.game.say('Could not save progress on this device.');
  }

  /* ---------- storage ---------- */
  function openDB() {
    return new Promise(resolve => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let settled = false;
      const done = db => { if (!settled) { settled = true; resolve(db); } };
      try {
        const rq = indexedDB.open(DB_NAME, DB_VERSION);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
          if (!d.objectStoreNames.contains(WORLD_STORE)) {
            const world = d.createObjectStore(WORLD_STORE, { keyPath: 'id' });
            world.createIndex('save', 'save', { unique: false });
          }
        };
        rq.onsuccess = () => done(rq.result);
        rq.onerror = () => done(null);
        rq.onblocked = () => done(null);
        setTimeout(() => done(null), 2500);
      } catch (e) { done(null); }
    });
  }

  function localPut(rec) {
    try { localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify(rec)); return true; }
    catch (e) { return false; }
  }
  function localGet(id) {
    try { const t = localStorage.getItem(LS_PREFIX + id); return t ? JSON.parse(t) : null; }
    catch (e) { return null; }
  }

  function put(rec) {
    if (!M.db) return Promise.resolve(localPut(rec));
    return new Promise(resolve => {
      try {
        const tx = M.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(localPut(rec));
        tx.onabort = () => resolve(localPut(rec));
      } catch (e) { resolve(localPut(rec)); }
    });
  }

  function getRec(id) {
    if (!M.db) return Promise.resolve(localGet(id));
    return new Promise(resolve => {
      try {
        const rq = M.db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        rq.onsuccess = () => resolve(rq.result || localGet(id));
        rq.onerror = () => resolve(localGet(id));
      } catch (e) { resolve(localGet(id)); }
    });
  }

  function localWorldPut(rec) {
    try { localStorage.setItem(LS_WORLD + rec.save + '.' + rec.map, JSON.stringify(rec)); return true; }
    catch (e) { return false; }
  }

  function localWorldAll(saveId) {
    const prefix = LS_WORLD + saveId + '.';
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        try { const r = JSON.parse(localStorage.getItem(k)); if (r) out.push(r); } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  function localWorldPrune(saveId, keep) {
    const prefix = LS_WORLD + saveId + '.';
    const drop = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        const map = k.slice(prefix.length);
        if (!keep.has(map)) drop.push(k);
      }
      for (const k of drop) localStorage.removeItem(k);
    } catch (e) {}
  }

  function worldPutMany(saveId, entries) {
    const recs = entries.map(([map, data]) => ({ id: worldId(saveId, map), save: saveId, map, at: Date.now(), data }));
    if (!M.db) return Promise.resolve(recs.every(localWorldPut));
    return new Promise(resolve => {
      try {
        const tx = M.db.transaction(WORLD_STORE, 'readwrite');
        const os = tx.objectStore(WORLD_STORE);
        for (const r of recs) os.put(r);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    }).then(ok => {
      if (ok) return true;
      let fallback = true;
      for (const r of recs) fallback = localWorldPut(r) && fallback;
      return fallback;
    });
  }

  function worldAll(saveId) {
    if (!M.db) return Promise.resolve(localWorldAll(saveId));
    return new Promise(resolve => {
      try {
        const rq = M.db.transaction(WORLD_STORE, 'readonly').objectStore(WORLD_STORE).index('save').getAll(saveId);
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => resolve(localWorldAll(saveId));
      } catch (e) { resolve(localWorldAll(saveId)); }
    });
  }

  function worldPrune(saveId, keep) {
    if (!M.db) { localWorldPrune(saveId, keep); return Promise.resolve(); }
    return new Promise(resolve => {
      try {
        const tx = M.db.transaction(WORLD_STORE, 'readwrite');
        const rq = tx.objectStore(WORLD_STORE).index('save').openCursor(saveId);
        rq.onsuccess = () => {
          const cur = rq.result;
          if (!cur) return;
          if (!keep.has(cur.value.map)) cur.delete();
          cur.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  /* ---------- lifecycle ---------- */
  async function migrate() {
    try { if (localStorage.getItem(LEGACY_DONE)) return; } catch (e) { return; }
    let raw = null;
    try { raw = localStorage.getItem(LEGACY); } catch (e) {}
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && o.S) {
          const existing = await getRec('auto');
          if (!existing) {
            await put({
              id: 'auto', at: Date.now(), label: mapName(o.S.id), lvl: o.S.lvl || 1,
              maps: [o.S.id, ...Object.keys(o.WORLD || {})], snap: o
            });
          }
        }
      } catch (e) {}
    }
    // Nothing left to move (or the move is done): never scan the legacy key again.
    try { localStorage.setItem(LEGACY_DONE, '1'); } catch (e) {}
  }

  async function refreshMeta() {
    M.meta = {};
    for (const id of ['auto', ...SLOTS]) {
      const r = await getRec(id);
      if (r && r.snap) M.meta[id] = { at: r.at || 0, label: r.label || '', lvl: r.lvl || 1,
        pack: (r.snap.S && r.snap.S.pack) || '' };
    }
  }

  async function init() {
    M.db = await openDB();
    await migrate();
    await refreshMeta();
    M.ready = true;
  }

  /* ---------- reading and writing ---------- */
  async function doWrite(id) {
    const s = WA.game.S;
    // A death must not overwrite the last living autosave: that save is what
    // the death screen offers to load.
    if (!s || s.test || s.dead) return false;
    const state = WA.game.snapshotState();
    if (!state) return false;

    // Only left maps need their own records; the current map is inside `state`.
    // Do not serialise every visited map just to decide what changed.
    const worldKeys = Object.keys(WA.game.WORLD);
    const maps = worldKeys.slice();
    if (maps.indexOf(s.id) < 0) maps.push(s.id);
    const now = Date.now();

    let known = M.known[id];
    if (!known) {
      known = new Set();
      const old = await getRec(id);
      if (old) {
        if (Array.isArray(old.maps)) old.maps.forEach(m => known.add(m));
        // An old full snapshot still has its maps inside snap.WORLD; split it.
        if (old.snap && old.snap.WORLD) {
          Object.keys(old.snap.WORLD).forEach(m => known.add(m));
          M.forceAll[id] = true;
        }
      }
    }

    const need = new Set();
    if (M.forceAll[id]) {
      for (const m of worldKeys) need.add(m);
    } else {
      for (const m of worldKeys) if (!known.has(m)) need.add(m);
      // The map the player was on last save has just been left; its cached copy
      // is newer than its record.
      const prev = M.lastMap[id];
      if (prev && prev !== s.id && WA.game.WORLD[prev]) need.add(prev);
    }

    let ok = true;
    if (need.size) {
      const entries = [];
      for (const m of need) {
        const data = WA.game.snapshotMap(m);
        if (data) entries.push([m, data]);
      }
      ok = await worldPutMany(id, entries);
    }

    const rec = {
      id, at: now, label: mapName(s.id), lvl: s.lvl || 1, maps,
      snap: { v: 4, at: now, S: state }
    };
    if (!(await put(rec))) ok = false;

    if (ok) {
      M.meta[id] = { at: rec.at, label: rec.label, lvl: rec.lvl, pack: state.pack || '' };
      M.known[id] = new Set(maps);
      M.forceAll[id] = false;
      M.lastMap[id] = s.id;
      // A new game or a smaller run in the same slot drops its old map records.
      if (known.size > maps.length) await worldPrune(id, new Set(maps));
    } else {
      warn();
    }
    return ok;
  }

  // Writes are serialised: travel triggers several saves and they must not
  // interleave map records and state from different moments.
  function write(id) {
    M.chain = M.chain.then(() => doWrite(id)).catch(() => false);
    return M.chain;
  }

  function flush(id) {
    const saveId = id || 'auto';
    clearTimeout(M.timer);
    M.timer = null;
    return write(saveId);
  }

  function queueAutosave(id) {
    if (!M.ready) return;
    const s = WA.game.S;
    if (!s || s.test || s.dead) return;
    const saveId = id || 'auto';
    clearTimeout(M.timer);
    M.timer = setTimeout(() => flush(saveId), 400);
  }

  async function remove(id) {
    clearTimeout(M.timer);
    M.timer = null;
    delete M.known[id]; delete M.lastMap[id]; delete M.forceAll[id]; delete M.meta[id];
    if (!M.db) {
      try { localStorage.removeItem(LS_PREFIX + id); } catch (e) {}
      localWorldPrune(id, new Set());
      return true;
    }
    await worldPrune(id, new Set());
    return new Promise(resolve => {
      try {
        const tx = M.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  // Sizes for the benchmark page; not used by normal saves.
  async function stats(id) {
    const rec = await getRec(id);
    if (!rec) return null;
    const recs = await worldAll(id);
    let worldBytes = 0;
    for (const r of recs) worldBytes += JSON.stringify(r).length;
    const stateBytes = JSON.stringify(rec).length;
    return {
      maps: Array.isArray(rec.maps) ? rec.maps.length : 0,
      mapRecords: recs.length, stateBytes, worldBytes, totalBytes: stateBytes + worldBytes
    };
  }

  async function load(id) {
    clearTimeout(M.timer);
    const rec = await getRec(id);
    if (!rec || !rec.snap) return false;

    let known;
    try {
      const recs = await worldAll(id);
      if (recs.length) {
        const allow = Array.isArray(rec.maps) ? new Set(rec.maps) : null;
        const WORLD = {}, kept = new Set();
        for (const r of recs) {
          if (!r || !r.map || !r.data || !WA.GAME.maps[r.map]) continue;
          if (allow && !allow.has(r.map)) continue;
          WORLD[r.map] = r.data;
          kept.add(r.map);
        }
        known = new Set(Array.isArray(rec.maps) ? rec.maps : []);
        for (const k of kept) known.add(k);
        M.forceAll[id] = false;
        WA.game.restore({ v: 4, at: rec.at, S: rec.snap.S, WORLD });
      } else {
        // Legacy save or a run with no left maps: the snapshot may carry WORLD.
        known = new Set(Array.isArray(rec.maps) ? rec.maps : Object.keys((rec.snap && rec.snap.WORLD) || {}));
        M.forceAll[id] = !!(rec.snap && rec.snap.WORLD);
        WA.game.restore(rec.snap);
      }
      M.known[id] = known;
      M.lastMap[id] = WA.game.S.id;
      WA.game.say('Loaded ' + labelOf(id) + '.');
      WA.view.draw();
      return true;
    } catch (e) { return false; }
  }

  async function loadAutosave() { return load('auto'); }

  /* ---------- panel ---------- */
  function stamp(id) {
    const m = M.meta[id];
    if (!m) return 'empty';
    const d = new Date(m.at);
    return `${m.label} · Lv ${m.lvl} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function row(id, name, canSave) {
    const has = !!M.meta[id];
    return `<div class="prow"><span>${name} <small class="dim">${U.esc(stamp(id))}</small></span>` +
      `<span class="acts">` +
      (canSave ? `<button data-g="save:${id}" title="Save here">Save</button>` : '') +
      `<button data-g="load:${id}" ${has ? '' : 'disabled'} title="Load">Load</button>` +
      `</span></div>`;
  }

  /* Load rows for the death screen. It deliberately omits Save, New game and
     import/export: the player should get back into the game or start over. */
  function deathHtml() {
    const line = (id, name) => {
      const m = M.meta[id];
      return `<div class="prow" style="margin:2px 0"><span>${name} <small class="dim">${m ? U.esc(stamp(id)) : 'empty'}</small></span>` +
        `<button data-death-load="${id}" ${m ? '' : 'disabled'} style="width:64px;height:30px;font-size:13px">Load</button></div>`;
    };
    return `<div class="dim" style="font-size:12px;margin-top:4px">AUTOSAVE</div>` + line('auto', 'Auto') +
      `<div class="dim" style="font-size:12px;margin-top:4px">SLOTS</div>` +
      SLOTS.map((id, i) => line(id, 'Slot ' + (i + 1))).join('');
  }

  function panelHtml() {
    const b = (id, t) => `<button data-g="${id}" style="flex:1;height:36px;font-size:14px">${t}</button>`;
    return `<hr style="border:0;border-top:1px solid var(--dim)">` +
      `<div class="dim" style="font-size:12px">AUTOSAVE</div>` + row('auto', 'Auto', false) +
      `<div class="dim" style="font-size:12px;margin-top:4px">SLOTS</div>` +
      SLOTS.map((id, i) => row(id, 'Slot ' + (i + 1), true)).join('') +
      `<div class="row" style="margin-top:6px">${b('new', M.confirmNew ? 'Sure?' : 'New game')}${b('exp', 'Export')}${b('imp', 'Import')}</div>` +
      `<textarea id="gio" rows="3" spellcheck="false" placeholder="Export puts your save here. Paste a save here and tap Import." style="margin-top:6px"></textarea>` +
      `<div class="prow" style="margin-top:6px"><span class="dim">BUILD <b>v${U.esc(WA.VERSION || '0')}</b></span>` +
      `<small class="dim">offline cache v${U.esc(WA.VERSION || '0')}</small></div>`;
  }

  /* ---------- commands from the Pip-Boy ---------- */
  async function act(cmd) {
    const s = WA.game.S;
    const parts = String(cmd).split(':');
    const a = parts[0], id = parts[1];

    if (a === 'new') {
      if (!M.confirmNew) { M.confirmNew = true; WA.char.pip(); return; }
      M.confirmNew = false;
      await WA.game.newGame((s && s.home) || 'vault');
      return;
    }
    M.confirmNew = false;

    if (a === 'save') {
      const ok = await write(id);
      WA.game.say(ok ? 'Saved to ' + labelOf(id) + '.' : 'That slot could not be written.');
      WA.char.pip();
      return;
    }
    if (a === 'load') {
      const ok = await load(id);
      if (!ok) { WA.game.say('Nothing saved in ' + labelOf(id) + ' yet.'); WA.view.draw(); }
      return;
    }
    if (a === 'exp') {
      const el = U.el('gio');
      if (!el || !s) return;
      const t = JSON.stringify(WA.game.snapshot());
      el.value = t;
      el.select();
      try { navigator.clipboard.writeText(t).catch(() => {}); } catch (e) {}
      return;
    }
    if (a === 'imp') {
      const el = U.el('gio');
      if (!el) return;
      if (!el.value.trim()) { WA.game.say('Paste a save into the box first.'); return WA.view.draw(); }
      try {
        const o = JSON.parse(el.value.trim());
        const snap = o && o.S ? o : (o && o.snap);
        if (!snap) throw new Error('no state');
        WA.game.restore(snap);
        // The next autosave must write every imported map into its own record.
        delete M.known.auto;
        M.forceAll.auto = true;
        delete M.lastMap.auto;
        WA.game.say('Save loaded.');
        WA.view.draw();
      } catch (e) {
        WA.game.say('That save could not be read.');
        WA.view.draw();
      }
    }
  }

  WA.save = {
    SLOTS,
    init, loadAutosave, flush, queueAutosave, panelHtml, deathHtml, act, write, load, remove, stats,
    get meta() { return M.meta; },
    get ready() { return M.ready; }
  };
})(window.WA = window.WA || {});
