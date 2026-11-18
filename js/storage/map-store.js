/* The map library. One IndexedDB record per map, so the editor can hold many
   large maps without a single-blob size limit; falls back to one localStorage
   key per map when IndexedDB is unavailable. */
(function (WA) {
  'use strict';
  const DB = 'wasteland-maps', STORE = 'maps', VERSION = 1;
  const LS = 'wasteland.map.';
  const LEGACY = 'wasteland.maps2';
  const LEGACY2 = 'wasteland.maps';
  const LEGACY_DONE = 'wasteland.maps2.moved';

  let db = null;

  function open() {
    return new Promise(resolve => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let settled = false;
      const done = d => { if (!settled) { settled = true; resolve(d); } };
      try {
        const rq = indexedDB.open(DB, VERSION);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        };
        rq.onsuccess = () => done(rq.result);
        rq.onerror = () => done(null);
        rq.onblocked = () => done(null);
        setTimeout(() => done(null), 4000);
      } catch (e) { done(null); }
    });
  }

  function lsAll() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(LS) !== 0) continue;
        try { out[k.slice(LS.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  function all() {
    if (!db) return Promise.resolve(lsAll());
    return new Promise(resolve => {
      const out = {};
      try {
        const rq = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (!c) return resolve(out);
          if (c.value && c.value.id) out[c.value.id] = c.value.map;
          c.continue();
        };
        rq.onerror = () => resolve(lsAll());
      } catch (e) { resolve(lsAll()); }
    });
  }

  function put(id, map) {
    if (!db) {
      try { localStorage.setItem(LS + id, JSON.stringify(map)); return Promise.resolve(true); }
      catch (e) { return Promise.resolve(false); }
    }
    return new Promise(resolve => {
      try {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put({ id, map });
        t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(false);
        t.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function del(id) {
    if (!db) {
      try { localStorage.removeItem(LS + id); } catch (e) {}
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      try {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(id);
        t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  /* Load every stored map and move the old single-blob library across once. */
  async function init() {
    db = await open();
    const maps = await all();
    let moved = true;
    try {
      if (!localStorage.getItem(LEGACY_DONE)) {
        for (const key of [LEGACY, LEGACY2]) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          let o = {};
          try { o = JSON.parse(raw) || {}; } catch (e) { o = {}; }
          for (const id in o) {
            if (maps[id]) continue;
            maps[id] = o[id];
            if (!(await put(id, o[id]))) moved = false;
          }
        }
        if (moved) {
          try {
            localStorage.removeItem(LEGACY);
            localStorage.removeItem(LEGACY2);
            localStorage.setItem(LEGACY_DONE, '1');
          } catch (e) {}
        }
      }
    } catch (e) {}
    return maps;
  }

  WA.mapStore = {
    init, all, put, del,
    get persistent() { return !!db; }
  };
})(window.WA = window.WA || {});
