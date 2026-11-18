/* Bench tab: measures the real save/autosave/load path against synthetic
   200x200 maps. Everything uses a temporary `bench` save and is removed
   afterwards; the live game is restored from an in-memory snapshot. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const $ = id => U.el(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let BUSY = false;
  let LAST = null;

  const kb = n => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB');
  const mb = n => (n / 1048576).toFixed(1) + ' MB';
  const row = (k, v) => `<div class="prow"><span class="dim">${U.esc(k)}</span><span>${U.esc(v)}</span></div>`;

  function render() {
    const out = $('bnout');
    if (!out) return;
    if (!LAST) {
      out.innerHTML = '<div class="dim">Pick a map count and run. The benchmark keeps its data ' +
        'in a temporary save, never in autosave or slots.</div>';
      return;
    }
    const r = LAST;
    if (r.error) {
      out.innerHTML = `<div class="bad">Benchmark failed: ${U.esc(r.error)}</div>` +
        '<div class="dim">Any temporary records were removed and the game restored.</div>';
      return;
    }
    const st = r.stats;
    out.innerHTML =
      `<div class="hero">${r.count} maps · 200×200</div>` +
      row('Seed synthetic world', Math.round(r.seed) + ' ms') +
      row('First full split save', Math.round(r.first) + ' ms') +
      row('Map records created', st.mapRecords + ' · avg ' + kb(Math.round(st.worldBytes / Math.max(1, st.mapRecords)))) +
      row('Database size', mb(st.totalBytes) + ' total') +
      row('State record', kb(st.stateBytes)) +
      row('State-only save', Math.round(r.state) + ' ms') +
      row('Debounced autosave', Math.round(r.autosave) + ' ms (includes 400 ms timer)') +
      row('Leave map + save', Math.round(r.travel) + ' ms') +
      row('Load ' + r.loaded.worldCount + ' maps', Math.round(r.load) + ' ms') +
      (r.heap ? row('Page heap after load', Math.round(r.heap) + ' MB') : '') +
      '<div class="dim" style="font-size:12px;margin-top:6px">Temporary save removed; the game was restored.</div>';
  }

  async function run() {
    if (BUSY) return;
    const inp = $('bncount'), btn = $('bnrun'), out = $('bnout');
    const count = Math.max(10, Math.min(2000, parseInt(inp.value, 10) || 1000));
    inp.value = count;
    BUSY = true;
    btn.disabled = true;
    btn.textContent = 'Running…';
    out.innerHTML = '<div class="dim">Seeding ' + count + ' synthetic maps…</div>';

    const before = WA.game.snapshot();
    const ids = [];
    const rows = Array(200).fill('#'.repeat(200));
    const base = '0'.repeat(9999);
    const realFlush = WA.save.flush;
    const r = { count };

    try {
      // Settle any pending autosave before swapping in the synthetic game.
      await WA.save.flush();
      await WA.save.remove('bench');
      const tSeed = performance.now();
      for (let i = 0; i < count; i++) {
        const id = 'bench' + i;
        WA.GAME.maps[id] = { name: 'Bench ' + i, bg: '#000', amb: 0, exits: {}, start: [1, 1], rows, legend: { '#': 'wall' } };
        ids.push(id);
      }
      WA.game.start('bench0', true);
      WA.game.S.test = false;
      WA.game.WORLD = {};
      for (let i = 1; i < count; i++) {
        WA.game.WORLD['bench' + i] = {
          items: {}, seen: base + (i % 10), sw: 200, sh: 200, ents: [], loot: {}, hacked: {}
        };
      }
      r.seed = performance.now() - tSeed;

      let t = performance.now();
      await WA.save.write('bench');
      r.first = performance.now() - t;
      r.stats = await WA.save.stats('bench');

      t = performance.now();
      await WA.save.write('bench');
      r.state = performance.now() - t;

      const at0 = WA.save.meta.bench && WA.save.meta.bench.at;
      WA.game.S.caps = (WA.game.S.caps | 0) + 1;
      t = performance.now();
      WA.save.queueAutosave('bench');
      while (performance.now() - t < 5000) {
        await wait(20);
        if (WA.save.meta.bench && WA.save.meta.bench.at !== at0) break;
      }
      r.autosave = performance.now() - t;

      // Travel writes only the map just left; keep it off the real autosave.
      WA.save.flush = () => Promise.resolve(true);
      try { WA.game.travel('bench1'); } finally { WA.save.flush = realFlush; }
      t = performance.now();
      await WA.save.write('bench');
      r.travel = performance.now() - t;

      t = performance.now();
      const ok = await WA.save.load('bench');
      r.load = performance.now() - t;
      r.loaded = { ok, worldCount: Object.keys(WA.game.WORLD).length };
      r.heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
    } catch (e) {
      r.error = e && e.message ? e.message : String(e);
    } finally {
      WA.save.flush = realFlush;
      try { if (before) WA.game.restore(before); } catch (e) {}
      for (const id of ids) delete WA.GAME.maps[id];
      await WA.save.remove('bench');
      BUSY = false;
      btn.disabled = false;
      btn.textContent = 'Run benchmark';
    }

    LAST = r;
    render();
  }

  function init() {
    const btn = $('bnrun');
    if (btn) btn.onclick = run;
    render();
  }

  WA.bench = { init, run, show: render };
})(window.WA = window.WA || {});
