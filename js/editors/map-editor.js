/* Map editor: painted canvas grid plus entity, item and exit layers. Maps are
   stored one record per map, so size is limited by the tile budget rather than
   by the DOM or a single storage blob. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const $ = U.el;

  /* Hard ceiling only to keep one page responsive; 1000x1000 maps fit. */
  const TILE_BUDGET = 1000000;

  let SAVED = {}, BUILTIN = {}, ED = null, brush = 'wall', linkKey = null, painting = false, pan = null;
  let CELL = 16, zoom = 0;
  const closedGroups = new Set();
  let renaming = null, delAsk = null, delTimer = null;

  /* Which authored maps travel with the game code. Stored as the exceptions
     (maps explicitly left out), so new maps ship by default. */
  const SHIP_KEY = 'wasteland.shipOff';
  let shipOff = new Set();
  function loadShipSel() {
    try {
      const raw = localStorage.getItem(SHIP_KEY);
      shipOff = new Set(raw ? (JSON.parse(raw) || []) : []);
    } catch (e) { shipOff = new Set(); }
  }
  function saveShipSel() {
    try { localStorage.setItem(SHIP_KEY, JSON.stringify([...shipOff])); } catch (e) {}
  }
  const canShip = id => !!SAVED[id];
  const wantsShip = id => canShip(id) && !shipOff.has(id);
  const colCache = {};

  const msg = t => { const el = $('emsg'); if (el) el.textContent = t; };
  const EW = () => ED.t[0].length;

  const def = id => id === '@'
    ? { name: 'Player start', glyph: '@', c: 'hero' }
    : (WA.GAME.tiles[id] || WA.GAME.entities[id] || WA.GAME.items[id] || {});
  const colorOf = id => def(id).c || 'dim';
  const cn = id => { const c = colorOf(id); return c && c[0] === '#' ? '' : c; };
  const sty = id => (colorOf(id)[0] === '#' ? 'color:' + colorOf(id) + ';' : '') + (def(id).bg ? 'background:' + def(id).bg : '');

  function cssColor(cls) {
    if (!cls) return '#cfe8cf';
    if (colCache[cls]) return colCache[cls];
    let c = '#cfe8cf';
    try {
      const d = document.createElement('span');
      d.className = cls;
      d.style.cssText = 'position:absolute;left:-9999px;top:0';
      document.body.appendChild(d);
      c = getComputedStyle(d).color || c;
      document.body.removeChild(d);
    } catch (e) {}
    return (colCache[cls] = c);
  }
  const idColor = id => (colorOf(id)[0] === '#' ? colorOf(id) : cssColor(cn(id)));

  const store = id => (WA.mapStore ? WA.mapStore.put(id, SAVED[id]) : Promise.resolve(false));
  const bedOf = m => (m && typeof m.ambience === 'string' ? m.ambience : '');

  /* ---------- model <-> stored map ---------- */
  function toMap() {
    const things = [...Object.entries(ED.n), ...Object.entries(ED.o)].map(([k, id]) => [id, ...k.split(',').map(Number)]);
    return WA.maps.pack({ name: ED.name, bg: ED.bg, amb: ED.amb, indoor: ED.indoor, weather: ED.weather, ambience: ED.ambience, exits: ED.exits, start: ED.s, t: ED.t, things });
  }
  function persist() {
    const m = toMap();
    WA.GAME.maps[ED.id] = SAVED[ED.id] = m;
    store(ED.id).then(ok => { if (!ok) msg('Could not write this map to storage. Use Export to keep it.'); });
  }

  function fillSel() {
    const s = $('msel');
    if (!s) return;
    s.innerHTML = Object.keys(WA.GAME.maps).map(id =>
      `<option value="${U.esc(id)}">${U.esc(id)} – ${U.esc(WA.GAME.maps[id].name)}</option>`).join('');
    s.value = ED ? ED.id : '';
  }

  function setMap(id, m) {
    const RG = (m.rows || []).map(U.split);
    const w = Math.max(1, ...RG.map(r => r.length));
    const t = RG.map(r => Array.from({ length: w }, (_, x) => {
      const tid = m.legend && m.legend[r[x]];
      return WA.GAME.tiles[tid] ? tid : 'wall';
    }));

    let start = m.start ? [+m.start[0], +m.start[1]] : [1, 1];
    const bad = !Number.isInteger(start[0]) || !Number.isInteger(start[1]) ||
      start[0] < 0 || start[1] < 0 || start[0] >= w || start[1] >= t.length ||
      (WA.GAME.tiles[t[start[1]][start[0]]] || {}).solid;
    if (bad) start = [1, 1];

    ED = {
      id, name: m.name || id, bg: m.bg, amb: typeof m.amb === 'number' ? m.amb : 1,
      indoor: !!m.indoor, weather: m.weather || 'none', ambience: bedOf(m),
      exits: { ...(m.exits || {}) }, s: start, o: {}, n: {}, t
    };
    for (const [tid, x, y] of m.things || []) {
      if (x < 0 || y < 0 || x >= w || y >= t.length) continue;
      if (WA.GAME.entities[tid]) ED.n[x + ',' + y] = tid;
      else if (WA.GAME.items[tid]) ED.o[x + ',' + y] = tid;
    }

    $('ew').value = w;
    $('eh').value = t.length;
    $('ename').value = ED.name;
    $('lnk').hidden = true;
    $('mbgon').checked = !!m.bg;
    if (m.bg) $('mbg').value = m.bg;
    $('eindoor').checked = ED.indoor;
    $('eweather').value = ED.weather;
    $('esnd').innerHTML = bedOptions(ED.ambience);
    $('esnd').value = ED.ambience;
    const pc = Math.round(ED.amb * 100);
    $('eamb').value = pc;
    $('eambv').textContent = pc + '%';
  }

  /* The map's sound bed. The kinds come from the shared sound engine, so a
     place added there shows up here; a pack naming one this build does not
     have keeps its value instead of losing it on the next save. */
  const BED_NAME = { hum: 'Vault hum', rain: 'Rain', wind: 'Wind', water: 'Water' };
  function bedOptions(current) {
    const kinds = (((WA.sfx && WA.sfx.kinds) || Object.keys(BED_NAME))).slice();
    if (current && kinds.indexOf(current) < 0) kinds.push(current);
    return '<option value="">Auto (indoor / weather)</option>' + kinds
      .map(k => `<option value="${U.esc(k)}">${U.esc(BED_NAME[k] || k)}</option>`).join('');
  }

  function loadEd(id) {
    if (!WA.GAME.maps[id]) id = Object.keys(WA.GAME.maps)[0];
    if (!id) { ED = null; fillSel(); renderLib(); return; }
    setMap(id, WA.GAME.maps[id]);
    fillSel();
    renderLib();
    renderEd();
  }

  /* ---------- map library ---------- */
  const sizeText = id => {
    const m = WA.GAME.maps[id];
    if (!m) return '';
    const h = m.h || (m.rows || []).length;
    const w = m.w || ((m.rows && m.rows[0]) ? m.rows[0].length : 0);
    return w + '×' + h;
  };

  function shipCount() {
    const all = Object.keys(SAVED).length;
    const on = Object.keys(SAVED).filter(wantsShip).length;
    const el = $('libsel');
    if (el) el.textContent = all ? `${on} of ${all} authored selected` : 'No authored maps yet';
    return on;
  }

  function renderLib() {
    const el = $('liblist');
    if (!el) return;
    const q = ($('lsearch') ? $('lsearch').value : '').trim().toLowerCase();
    const ids = Object.keys(WA.GAME.maps).filter(id => {
      if (!q) return true;
      const m = WA.GAME.maps[id] || {};
      return id.toLowerCase().indexOf(q) >= 0 || String(m.name || '').toLowerCase().indexOf(q) >= 0;
    });
    const n = $('libn');
    if (n) n.textContent = `(${Object.keys(WA.GAME.maps).length})`;
    el.innerHTML = ids.length ? ids.map(id => {
      const m = WA.GAME.maps[id] || {};
      const sel = ED && ED.id === id ? ' sel' : '';
      const builtin = !SAVED[id] && !!BUILTIN[id];
      const pick = canShip(id)
        ? `<input type="checkbox" class="libship" data-id="${U.esc(id)}" ${wantsShip(id) ? 'checked' : ''} title="Include this map in Ship to code">`
        : '<span class="libpick dim" title="Part of the game code already">–</span>';
      const name = renaming === id
        ? `<input data-id="${U.esc(id)}" value="${U.esc(m.name || '')}" maxlength="60" spellcheck="false">`
        : `<span class="libname dim" title="${U.esc((m.name || id) + (builtin ? ' (built-in)' : ' (your map)'))}">${builtin ? '• ' : ''}${U.esc(m.name || id)}</span>` +
          `<span class="libdim dim" title="Size">${U.esc(sizeText(id))}</span>`;
      return `<div class="librow${sel}">` +
        pick +
        `<button class="libopen" data-id="${U.esc(id)}" title="Open this map">${U.esc(id)}</button>` +
        name +
        `<button data-act="rename" data-id="${U.esc(id)}" title="Rename">Ren</button>` +
        `<button data-act="dup" data-id="${U.esc(id)}" title="Duplicate">Dup</button>` +
        `<button data-act="del" data-id="${U.esc(id)}" title="${builtin ? 'Restore the built-in version' : 'Delete this map'}">${delAsk === id ? 'Sure?' : 'Del'}</button>` +
        `</div>`;
    }).join('') : '<div class="dim">No maps match that search.</div>';
    shipCount();
    if (renaming) {
      const inp = el.querySelector('input[data-id]');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  function commitRename(id, value) {
    const m = WA.GAME.maps[id];
    const name = String(value || '').trim().slice(0, 60);
    renaming = null;
    if (!m || !name) return renderLib();
    if (name === m.name) return renderLib();
    m.name = name;
    SAVED[id] = m; // renaming a built-in makes it an override
    store(id).then(ok => { if (!ok) msg('Could not write the new name to storage.'); });
    if (ED && ED.id === id) { ED.name = name; $('ename').value = name; }
    fillSel();
    renderLib();
    msg(`Renamed to “${name}”.`);
  }

  async function duplicateMap(id) {
    const src = WA.GAME.maps[id];
    if (!src) return;
    const nid = nextId();
    const copy = JSON.parse(JSON.stringify(src));
    copy.name = String((src.name || id) + ' copy').slice(0, 60);
    copy.exits = {}; // a copy must not inherit doorways back into the original's neighbours
    WA.GAME.maps[nid] = SAVED[nid] = copy;
    await store(nid);
    fillSel();
    loadEd(nid);
    msg(`Duplicated ${id} as ${nid} (exits cleared).`);
  }

  async function deleteMap(id, force) {
    const m = WA.GAME.maps[id];
    if (!m) return;
    if (!force) {
      delAsk = id;
      renderLib();
      clearTimeout(delTimer);
      delTimer = setTimeout(() => { if (delAsk === id) { delAsk = null; renderLib(); } }, 4000);
      return;
    }
    clearTimeout(delTimer);
    delAsk = null;
    delete SAVED[id];
    if (shipOff.has(id)) { shipOff.delete(id); saveShipSel(); }
    if (WA.mapStore) await WA.mapStore.del(id);
    if (BUILTIN[id]) WA.GAME.maps[id] = BUILTIN[id];
    else delete WA.GAME.maps[id];
    fillSel();
    if (ED && ED.id === id) loadEd(Object.keys(WA.GAME.maps)[0]);
    else renderLib();
    msg(BUILTIN[id] ? `${id} restored to its built-in version.` : `${id} deleted.`);
  }

  /* ---------- canvas rendering ---------- */
  function cellColor(id) {
    const d = def(id);
    return d.bg || '#0d2410';
  }

  function drawCell(ctx, x, y) {
    const px = x * CELL;
    const k = x + ',' + y;
    const base = ED.t[y][x];
    const over = ED.n[k] || ED.o[k];
    const isStart = ED.s[0] === x && ED.s[1] === y;
    const id = isStart ? '@' : (over || base);
    const glyph = isStart ? '@' : (def(id).glyph || '');

    ctx.fillStyle = cellColor(isStart ? base : id);
    ctx.fillRect(px, y * CELL, CELL, CELL);
    if (CELL >= 9 && glyph) {
      ctx.fillStyle = idColor(id);
      ctx.fillText(glyph, px + CELL / 2, y * CELL + CELL / 2 + 0.5);
    }
    if (ED.exits[k]) {
      ctx.strokeStyle = cssColor('hero');
      ctx.lineWidth = Math.max(1, CELL > 8 ? 2 : 1);
      ctx.strokeRect(px + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
  }

  function renderEd() {
    if (!ED || !ED.t.length) return;
    const cv = $('grid'), wrap = $('gwrap');
    if (!cv || !wrap) return;
    const w = EW(), h = ED.t.length;
    const avail = Math.max(80, (wrap.clientWidth || 320) - 8);
    const fit = Math.max(4, Math.min(28, Math.floor(avail / w)));
    let cell = zoom || fit;
    const cap = Math.max(1, Math.min(Math.floor(16000 / w), Math.floor(16000 / h)));
    CELL = Math.max(1, Math.min(cell, cap));
    const zv = $('ezoomv');
    if (zv) zv.textContent = zoom ? zoom + 'px' : 'fit';

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(w * CELL * dpr));
    cv.height = Math.max(1, Math.round(h * CELL * dpr));
    cv.style.width = w * CELL + 'px';
    cv.style.height = h * CELL + 'px';

    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w * CELL, h * CELL);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.max(6, Math.round(CELL * 0.82)) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) drawCell(ctx, x, y);
  }

  function refresh(x, y) {
    const cv = $('grid');
    if (!cv || !ED) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = Math.max(6, Math.round(CELL * 0.82)) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    drawCell(ctx, x, y);
  }

  /* ---------- painting ---------- */
  function paint(x, y) {
    const k = x + ',' + y, b = brush;
    if (b === '@') { const [ox, oy] = ED.s; ED.s = [x, y]; refresh(ox, oy); }
    else if (b === 'erase_item') delete ED.o[k];
    else if (b === 'erase_entity') delete ED.n[k];
    else if (WA.GAME.tiles[b]) {
      ED.t[y][x] = b;
      if (!WA.GAME.tiles[b].exit) delete ED.exits[k];
    }
    else if (WA.GAME.items[b]) ED.o[k] = b;
    else if (WA.GAME.entities[b]) ED.n[k] = b;
    refresh(x, y);
  }

  function cellAt(e) {
    const cv = $('grid');
    if (!cv || !ED) return null;
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / CELL);
    const y = Math.floor((e.clientY - r.top) / CELL);
    if (x < 0 || y < 0 || x >= EW() || y >= ED.t.length) return null;
    return [x, y];
  }

  /* ---------- brush palette ---------- */
  const PL = { pan: '✥', link: '⇄', erase_item: '✕i', erase_entity: '✕e' };
  const BN = {
    pan: 'Pan: drag the map to scroll it.',
    link: 'Link: tap an exit tile to choose where it leads.',
    erase_item: 'Eraser: removes the item from a cell.',
    erase_entity: 'Eraser: removes the enemy from a cell.'
  };

  function setBrush(k) {
    brush = k;
    document.querySelectorAll('#pal button').forEach(b => b.classList.toggle('sel', b.dataset.b === k));
    $('brush').textContent = BN[k] || `Brush: ${def(k).name || k}`;
    if (k !== 'link') $('lnk').hidden = true;
    $('grid').style.touchAction = k === 'pan' ? 'auto' : 'none';
    if ($('bedit')) $('bedit').open = true;
    renderBrush();
  }

  const TOOLS = ['@', 'erase_item', 'erase_entity', 'pan', 'link'];
  const TOOL_NAME = { '@': 'Player start', erase_item: 'Erase item', erase_entity: 'Erase enemy', pan: 'Pan map', link: 'Link exit' };
  const palName = id => def(id).name || TOOL_NAME[id] || id;

  // The catalog is deliberately broad, so group by what a mapper is looking for
  // instead of dropping every definition into one undifferentiated wall of buttons.
  function tileGroup(id) {
    const d = def(id);
    if (d.repair) return 'TILES · REPAIR OBJECTS';
    if (d.trap) return 'TILES · TRAPS';
    if (d.hack) return 'TILES · TERMINALS';
    if (d.exit) return 'TILES · EXITS';
    if (d.needs || d.opens) return 'TILES · DOORS';
    if (d.hurt || d.rads || d.onHit) return 'TILES · HAZARDS';
    if (d.heal) return 'TILES · RECOVERY';
    if (d.solid) return 'TILES · WALLS & BLOCKERS';
    return 'TILES · FLOORS & TERRAIN';
  }
  function entityGroup(id) {
    const d = def(id);
    if (d.talk) return 'PEOPLE';
    if (d.ai === 'turret' || /bot|protectron|sentry|turret|handy|gutsy|robobrain|eyebot|securitron|synth|assaultron|sentinel/.test(id)) return 'ENEMIES · ROBOTS & TURRETS';
    if (d.ai === 'ranged') return 'ENEMIES · GUNNERS';
    return 'ENEMIES · CREATURES';
  }
  function itemGroup(id) {
    const t = def(id).type;
    if (t === 'weapon') return 'ITEMS · WEAPONS';
    if (t === 'armor') return 'ITEMS · ARMOR';
    if (t === 'ammo') return 'ITEMS · AMMO';
    if (t === 'explosive') return 'ITEMS · EXPLOSIVES';
    if (t === 'container') return def(id).trap ? 'ITEMS · TRAPPED CONTAINERS' : 'ITEMS · CONTAINERS';
    if (t === 'key') return 'ITEMS · KEYS';
    if (t === 'junk') return 'ITEMS · JUNK & PARTS';
    if (t === 'caps') return 'ITEMS · CAPS';
    return 'ITEMS · AID & CHEMS';
  }

  function buildPal() {
    const q = ($('psearch') ? $('psearch').value : '').trim().toLowerCase();
    const matches = id => {
      if (!q) return true;
      const d = def(id);
      return id.toLowerCase().indexOf(q) >= 0 ||
        palName(id).toLowerCase().indexOf(q) >= 0 ||
        String(d.glyph || PL[id] || '').toLowerCase().indexOf(q) >= 0;
    };
    const buckets = new Map();
    const put = (group, id) => {
      // Match the group name too: searching "robot" should surface the robot
      // shelf even though no individual definition is called a robot.
      if (!matches(id) && (!q || group.toLowerCase().indexOf(q) < 0)) return;
      if (!buckets.has(group)) buckets.set(group, []);
      buckets.get(group).push(id);
    };
    Object.keys(WA.GAME.tiles).forEach(id => put(tileGroup(id), id));
    Object.keys(WA.GAME.entities).forEach(id => put(entityGroup(id), id));
    Object.keys(WA.GAME.items).filter(id => !WA.GAME.items[id].hidden).forEach(id => put(itemGroup(id), id));
    TOOLS.forEach(id => put('TOOLS', id));

    // One fixed-width glyph column plus a wrapping name column. Reused glyphs
    // are therefore distinguishable by name even when color alone is subtle.

    const order = [
      'TILES · WALLS & BLOCKERS', 'TILES · FLOORS & TERRAIN', 'TILES · DOORS', 'TILES · HAZARDS',
      'TILES · TRAPS', 'TILES · REPAIR OBJECTS', 'TILES · RECOVERY', 'TILES · TERMINALS', 'TILES · EXITS',
      'ENEMIES · CREATURES', 'ENEMIES · GUNNERS', 'ENEMIES · ROBOTS & TURRETS', 'PEOPLE',
      'ITEMS · WEAPONS', 'ITEMS · ARMOR', 'ITEMS · AMMO', 'ITEMS · AID & CHEMS', 'ITEMS · CONTAINERS',
      'ITEMS · TRAPPED CONTAINERS', 'ITEMS · EXPLOSIVES', 'ITEMS · KEYS', 'ITEMS · JUNK & PARTS', 'ITEMS · CAPS', 'TOOLS'
    ];
    const btn = k => {
      const glyph = PL[k] || def(k).glyph || '?';
      return `<button data-b="${U.esc(k)}" title="${U.esc(palName(k))}" aria-label="${U.esc(palName(k))}"` +
        ` class="palitem ${cn(k)}" style="${sty(k)}">` +
        `<span class="psym" aria-hidden="true">${U.esc(glyph)}</span>` +
        `<span class="pname">${U.esc(palName(k))}</span></button>`;
    };
    const group = (name, ids) => {
      const open = q || !closedGroups.has(name);
      return `<details class="palgroup" data-group="${U.esc(name)}"${open ? ' open' : ''}>` +
        `<summary class="palcat">${U.esc(name)} (${ids.length})</summary>` +
        `<div class="palrows">${ids.map(btn).join('')}</div></details>`;
    };
    let html = '<div class="palhead"><span>SYMBOL</span><span>BRUSH</span></div>';
    for (const name of order) {
      const ids = buckets.get(name);
      if (ids && ids.length) html += group(name, ids);
    }
    if (!html) html = '<div class="palempty dim">No palette matches that search.</div>';
    $('pal').innerHTML = html;
    $('pal').querySelectorAll('details.palgroup').forEach(d => {
      d.addEventListener('toggle', () => {
        if (d.open) closedGroups.delete(d.dataset.group);
        else closedGroups.add(d.dataset.group);
        updateGroupControls();
      });
    });
    updateGroupControls();
    const total = [...buckets.values()].reduce((n, ids) => n + ids.length, 0);
    if ($('pcount')) $('pcount').textContent = q ? `${total} match${total === 1 ? '' : 'es'}` : `${total} options`;
    setBrush(brush);
  }

  function updateGroupControls() {
    const groups = [...document.querySelectorAll('#pal details.palgroup')];
    if ($('pexpand')) $('pexpand').disabled = !groups.some(d => !d.open);
    if ($('pcollapse')) $('pcollapse').disabled = !groups.some(d => d.open);
  }

  function setAllGroups(open) {
    document.querySelectorAll('#pal details.palgroup').forEach(d => {
      d.open = open;
      if (open) closedGroups.delete(d.dataset.group);
      else closedGroups.add(d.dataset.group);
    });
    updateGroupControls();
  }

  /* ---------- brush editor ---------- */
  const BRUSH_KIND = id => WA.GAME.tiles[id] ? 'tiles' : WA.GAME.entities[id] ? 'entities' : WA.GAME.items[id] ? 'items' : '';
  const KIND_LABEL = { tiles: 'TILE', entities: 'ENTITY', items: 'ITEM' };
  const bmsg = t => { const el = $('bmsg'); if (el) el.textContent = t || ''; };

  function renderBrush() {
    const box = $('bfields');
    if (!box) return;
    const kind = BRUSH_KIND(brush), d = kind ? def(brush) : null;
    const meta = $('beditmeta');
    if (meta) meta.textContent = kind ? `${KIND_LABEL[kind]} · ${brush}` : 'Tools have no content definition to edit.';
    const save = $('bsave'), full = $('bfull'), revert = $('brevert');
    if (save) save.disabled = !kind;
    if (full) full.disabled = !kind;
    if (revert) revert.disabled = !kind;
    if (!kind) {
      box.innerHTML = '<div class="dim" style="font-size:12px">Pick a tile, enemy or item to edit its name, symbol and style.</div>';
      bmsg('');
      return;
    }
    const theme = d.c && d.c[0] === '#' ? 'custom' : (d.c || 'dim');
    const colors = [['dim', 'Dim'], ['warn', 'Warn'], ['bad', 'Bad'], ['good', 'Good'], ['hero', 'Hero'], ['custom', 'Custom']];
    const effects = [['none', 'None'], ['flicker', 'Flicker'], ['pulse', 'Pulse'], ['blink', 'Blink'], ['rainbow', 'Rainbow']];
    box.innerHTML =
      `<div class="row"><label style="flex:1">Name <input id="b_name" maxlength="40" value="${U.esc(d.name || '')}" style="width:100%;min-width:0"></label></div>` +
      `<div class="row"><label>Symbol <input id="b_glyph" maxlength="8" value="${U.esc(d.glyph || '')}" style="width:56px"></label><label>Light <input id="b_light" type="number" min="0" max="20" value="${d.light || 0}" style="width:56px"></label></div>` +
      `<div class="row"><label>Color <select id="b_color">${colors.map(([v, n]) => `<option value="${v}"${theme === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label><input id="b_colorx" type="color" value="${d.c && d.c[0] === '#' ? U.esc(d.c) : '#cfe8cf'}" style="width:48px;padding:0"${theme === 'custom' ? '' : ' hidden'}></div>` +
      `<label style="display:flex;gap:5px;align-items:center;margin:3px 0"><input id="b_bgon" type="checkbox"${d.bg ? ' checked' : ''} style="width:auto"> Background <input id="b_bg" type="color" value="${d.bg ? U.esc(d.bg) : '#14301a'}" style="width:48px;padding:0"></label>` +
      `<div class="row"><label>Effect <select id="b_effect">${effects.map(([v, n]) => `<option value="${v}"${(d.fx || 'none') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label style="display:flex;gap:4px;align-items:center"><input id="b_glow" type="checkbox"${d.glow ? ' checked' : ''} style="width:auto"> Glow</label></div>` +
      (kind === 'tiles' ? `<label style="display:flex;gap:5px;align-items:center;margin:3px 0"><input id="b_solid" type="checkbox"${d.solid ? ' checked' : ''} style="width:auto"> Solid tile</label>` +
        `<label style="display:flex;gap:5px;align-items:center;margin:3px 0"><input id="b_trap" type="checkbox"${d.trap ? ' checked' : ''} style="width:auto"> Trap (scan and disarm)</label>` : '') +
      (kind === 'items' && d.type === 'container'
        ? `<label style="display:flex;gap:5px;align-items:center;margin:3px 0"><input id="b_trap" type="checkbox"${d.trap ? ' checked' : ''} style="width:auto"> Trapped container</label>` +
          `<label style="display:flex;gap:5px;align-items:center;margin:3px 0">Owner <input id="b_owner" maxlength="40" value="${U.esc(d.owner || '')}" placeholder="npc id" style="width:100%;min-width:0"></label>`
        : '');
    bmsg('');
  }

  function saveBrush() {
    const kind = BRUSH_KIND(brush);
    if (!kind) return bmsg('Tools do not have editable definitions.');
    const name = ($('b_name') ? $('b_name').value : '').trim().slice(0, 40);
    const glyph = ($('b_glyph') ? $('b_glyph').value : '').trim();
    if (!name) return bmsg('Give this brush a name.');
    if (!glyph || glyph === '@' || U.split(glyph).length !== 1) return bmsg('Pick one symbol (not @ or a space).');
    const color = $('b_color').value;
    const patch = {
      name, glyph,
      c: color === 'custom' ? $('b_colorx').value : color,
      bg: $('b_bgon').checked ? $('b_bg').value : undefined,
      fx: $('b_effect').value === 'none' ? undefined : $('b_effect').value,
      glow: $('b_glow').checked ? 1 : undefined,
      light: +$('b_light').value || undefined
    };
    if (kind === 'tiles') {
      patch.solid = $('b_solid').checked ? 1 : undefined;
      patch.trap = $('b_trap').checked ? 1 : undefined;
    } else if (kind === 'items' && WA.GAME.items[brush] && WA.GAME.items[brush].type === 'container') {
      patch.trap = $('b_trap').checked ? 1 : undefined;
      const owner = ($('b_owner') ? $('b_owner').value : '').trim();
      if (owner && !WA.GAME.entities[owner]) return bmsg('Owner must be an existing NPC id.');
      patch.owner = owner || undefined;
    }
    if (!WA.forge || !WA.forge.update || !WA.forge.update(kind, brush, patch)) return bmsg('Could not save that brush.');
    if (ED) renderEd();
    bmsg('Saved ' + name + '.');
  }

  function openFullForge() {
    const kind = BRUSH_KIND(brush);
    if (!kind) return bmsg('Tools do not have editable definitions.');
    $('fkind').value = kind;
    WA.forge.fillForge(brush);
    WA.ui.show('forge');
  }

  /* ---------- map actions ---------- */
  function nextId() {
    let n = 1;
    while (WA.GAME.maps['map' + n]) n++;
    return 'map' + n;
  }

  function blank(w, h) {
    return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
      (y === 0 || y === h - 1 || x === 0 || x === w - 1) ? 'wall' : 'floor'));
  }

  function newMap() {
    const w = Math.max(1, Math.min(2000, +$('ew').value || 24));
    const h = Math.max(1, Math.min(2000, +$('eh').value || 14));
    if (w * h > TILE_BUDGET) return msg(`That is ${w * h} tiles; the editor allows up to ${TILE_BUDGET}.`);
    const id = nextId();
    const m = WA.maps.pack({ name: 'New map ' + id.replace('map', ''), exits: {}, start: [1, 1], t: blank(w, h), things: [] });
    WA.GAME.maps[id] = m;
    SAVED[id] = m;
    store(id).then(ok => { if (!ok) msg('Could not write this map to storage. Use Export to keep it.'); });
    setMap(id, m);
    fillSel();
    renderLib();
    renderEd();
    msg(`Created ${id} at ${w}×${h}.`);
  }

  function resize() {
    const w = Math.max(1, Math.min(2000, +$('ew').value || EW()));
    const h = Math.max(1, Math.min(2000, +$('eh').value || ED.t.length));
    if (w * h > TILE_BUDGET) {
      $('ew').value = EW(); $('eh').value = ED.t.length;
      return msg(`That is ${w * h} tiles; the editor allows up to ${TILE_BUDGET}.`);
    }
    ED.t = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (ED.t[y] && ED.t[y][x]) || 'floor'));
    for (const m of [ED.o, ED.n, ED.exits]) {
      for (const k in m) {
        const [x, y] = k.split(',').map(Number);
        if (x >= w || y >= h) delete m[k];
      }
    }
    if (ED.s[0] >= w || ED.s[1] >= h) ED.s = [1, 1];
    $('ew').value = w; $('eh').value = h;
    renderEd(); persist(); renderLib();
  }

  function wallBorder() {
    const h = ED.t.length, w = EW();
    ED.t.forEach((r, y) => r.forEach((_, x) => {
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) r[x] = 'wall';
    }));
    renderEd(); persist();
    msg('Border walled.');
  }

  function testMap() {
    const t = WA.GAME.tiles[ED.t[ED.s[1]][ED.s[0]]];
    if (t && t.solid) return msg('The player start is inside a solid tile.');
    persist();
    WA.game.newGame(ED.id, true);
    WA.ui.show('play');
  }

  /* ---------- import / export ---------- */
  function download(name, text, mime) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return true;
    } catch (e) { return false; }
  }

  function exportMap() {
    const txt = JSON.stringify(Object.assign({ id: ED.id }, toMap()));
    const io = $('io');
    if (io) { io.value = txt; io.select(); }
    try {
      navigator.clipboard.writeText(txt).then(() => msg('Copied this map.'), () => msg('Map text is in the box below.'));
    } catch (e) { msg('Map text is in the box below.'); }
  }

  function exportAll() {
    const maps = {};
    for (const id in WA.GAME.maps) maps[id] = WA.GAME.maps[id];
    const txt = JSON.stringify({ v: 2, maps });
    if (download('wasteland-maps.json', txt)) msg(`Exported ${Object.keys(maps).length} maps as a file.`);
    else msg('Could not write the file; use Export for single maps.');
  }

  /* Ship the library as real game code: a data file that index.html loads
     right after game-data.js, so authored maps stop living in this browser. */
  function shipCode() {
    const total = Object.keys(SAVED).length;
    const ids = Object.keys(SAVED).filter(wantsShip).sort();
    if (!total) return msg('No authored maps to ship yet. Maps you create or edit are kept until you ship them.');
    if (!ids.length) return msg('Nothing ticked in the library, so there is nothing to ship.');
    const body = '{\n' + ids.map(id => JSON.stringify(id) + ': ' + JSON.stringify(WA.GAME.maps[id])).join(',\n') + '\n}';
    const txt = '/* Authored maps. Generated by Edit → Ship to code; the editor rewrites\n' +
      '   this whole file, so do not hand-edit it. */\n' +
      '(function (WA) {\n  WA.AUTHORED = ' + body + ';\n})(window.WA = window.WA || {});\n';
    const ok = download('maps-authored.js', txt, 'text/javascript');
    msg(ok
      ? `Shipped ${ids.length} of ${total} authored map${total === 1 ? '' : 's'}. Replace js/data/maps-authored.js with the downloaded file.`
      : 'Could not write the file. Use Export all and keep it with the game code.');
  }

  const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

  function parseMaps(text) {
    const o = JSON.parse(text);
    if (Array.isArray(o)) return o.map(m => ({ id: m && m.id, map: m }));
    if (o && o.maps && typeof o.maps === 'object') return Object.keys(o.maps).map(id => ({ id, map: o.maps[id] }));
    if (o && Array.isArray(o.rows)) return [{ id: o.id, map: o }];
    return [];
  }

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) return null;
    const m = WA.maps.toV2(raw);
    const h = m.rows.length;
    const w = Math.max(1, ...m.rows.map(r => U.split(String(r)).length));
    if (w * h > TILE_BUDGET) return null;
    const legend = {};
    for (const k in m.legend || {}) {
      if (WA.GAME.tiles[m.legend[k]]) legend[k] = m.legend[k];
    }
    const exits = {};
    for (const k in m.exits || {}) {
      const [x, y] = String(k).split(',').map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) continue;
      exits[k] = m.exits[k];
    }
    const things = (m.things || []).filter(a => Array.isArray(a) &&
      (WA.GAME.entities[a[0]] || WA.GAME.items[a[0]]) &&
      Number.isInteger(a[1]) && Number.isInteger(a[2]) && a[1] >= 0 && a[2] >= 0 && a[1] < w && a[2] < h);
    const start = Array.isArray(m.start) && m.start.every(Number.isInteger) ? m.start : [1, 1];
    return {
      name: String(m.name || 'Map').slice(0, 60),
      bg: /^#[0-9a-f]{6}$/i.test(m.bg) ? m.bg : undefined,
      amb: typeof m.amb === 'number' ? m.amb : 1,
      indoor: !!m.indoor,
      weather: m.weather === 'rain' || m.weather === 'fog' ? m.weather : 'none',
      ambience: bedOf(m).slice(0, 20),
      w, h, rows: m.rows.map(r => String(r)), legend, exits, things, start
    };
  }

  async function importMap() {
    const io = $('io');
    let list;
    try { list = parseMaps(io.value); } catch (e) { return msg('That is not valid map JSON.'); }
    if (!list.length) return msg('No maps found in that text.');

    let added = 0, first = null, skipped = 0;
    for (const item of list) {
      const m = normalize(item.map);
      if (!m) { skipped++; continue; }
      const rawId = item.id == null ? '' : String(item.id);
      const id = ID_RE.test(rawId) ? rawId : (added === 0 && ED ? ED.id : nextId());
      WA.GAME.maps[id] = SAVED[id] = m;
      await store(id);
      if (!first) first = id;
      added++;
    }
    if (first) loadEd(first);
    else { fillSel(); renderLib(); }
    msg(`Imported ${added} map${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`);
  }

  async function revertMap() {
    const id = ED.id;
    delete SAVED[id];
    if (WA.mapStore) await WA.mapStore.del(id);
    if (BUILTIN[id]) WA.GAME.maps[id] = BUILTIN[id];
    else delete WA.GAME.maps[id];
    loadEd(BUILTIN[id] ? id : Object.keys(WA.GAME.maps)[0]);
    msg(BUILTIN[id] ? 'Reverted to the built-in map.' : 'Removed this map.');
  }

  function bindLib() {
    const list = $('liblist');
    if (!list) return;
    $('lsearch').oninput = () => renderLib();
    list.addEventListener('change', e => {
      const cb = e.target.closest && e.target.closest('input.libship');
      if (!cb) return;
      if (cb.checked) shipOff.delete(cb.dataset.id);
      else shipOff.add(cb.dataset.id);
      saveShipSel();
      shipCount();
    });
    $('liball').onclick = () => {
      shipOff.clear();
      saveShipSel();
      renderLib();
    };
    $('libnone').onclick = () => {
      for (const id of Object.keys(SAVED)) shipOff.add(id);
      saveShipSel();
      renderLib();
    };
    list.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const id = b.dataset.id;
      if (!WA.GAME.maps[id]) return;
      if (b.dataset.act === 'rename') { renaming = id; renderLib(); return; }
      if (b.dataset.act === 'dup') { duplicateMap(id); return; }
      if (b.dataset.act === 'del') { deleteMap(id, delAsk === id); return; }
      loadEd(id);
    });
    list.addEventListener('keydown', e => {
      const inp = e.target.closest && e.target.closest('input[data-id]');
      if (!inp) return;
      if (e.key === 'Enter') { e.preventDefault(); commitRename(inp.dataset.id, inp.value); }
      else if (e.key === 'Escape') { renaming = null; renderLib(); }
    });
    list.addEventListener('blur', e => {
      const inp = e.target.closest && e.target.closest('input[data-id]');
      if (inp) commitRename(inp.dataset.id, inp.value);
    }, true);
  }

  function linkAt(e) {
    const c = cellAt(e);
    if (!c) return null;
    const [x, y] = c;
    if (!(WA.GAME.tiles[ED.t[y][x]] || {}).exit) return msg('Tap an exit tile to link it.');
    const k = x + ',' + y;
    linkKey = k;
    $('lsel').innerHTML = '<option value="">Nowhere</option>' + Object.keys(WA.GAME.maps)
      .filter(id => id !== ED.id)
      .map(id => `<option value="${U.esc(id)}">${U.esc(sizeOf(id) + ' ' + WA.GAME.maps[id].name)}</option>`).join('');
    $('lsel').value = ED.exits[k] || '';
    $('lnk').hidden = false;
    msg(`Exit at ${x},${y}.`);
    return c;
  }

  const sizeOf = id => {
    const m = WA.GAME.maps[id];
    return m && m.w && m.h ? `${m.w}×${m.h}` : '';
  };

  /* ---------- wiring ---------- */
  function bind() {
    const gw = $('grid'), wrap = $('gwrap');

    gw.addEventListener('pointerdown', e => {
      if (brush === 'link') return linkAt(e);
      try { gw.setPointerCapture(e.pointerId); } catch (err) {}
      if (brush === 'pan') { pan = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop }; return; }
      painting = true;
      const c = cellAt(e);
      if (c) paint(c[0], c[1]);
    });
    gw.addEventListener('pointermove', e => {
      if (pan) {
        wrap.scrollLeft = pan.l - (e.clientX - pan.x);
        wrap.scrollTop = pan.t - (e.clientY - pan.y);
        return;
      }
      if (!painting) return;
      const c = cellAt(e);
      if (c) paint(c[0], c[1]);
    });
    const endStroke = () => {
      if (pan) pan = null;
      if (painting) { painting = false; persist(); }
    };
    addEventListener('pointerup', endStroke);
    addEventListener('pointercancel', endStroke);

    $('pal').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) setBrush(b.dataset.b);
    });
    $('psearch').oninput = buildPal;
    $('pexpand').onclick = () => setAllGroups(true);
    $('pcollapse').onclick = () => setAllGroups(false);
    $('bsave').onclick = saveBrush;
    $('brevert').onclick = renderBrush;
    $('bfull').onclick = openFullForge;
    $('bfields').addEventListener('change', e => {
      if (e.target.id === 'b_color') $('b_colorx').hidden = e.target.value !== 'custom';
    });
    $('msel').onchange = () => loadEd($('msel').value);
    $('enew').onclick = newMap;
    $('eborder').onclick = wallBorder;
    $('etest').onclick = testMap;
    $('eexp').onclick = exportMap;
    $('eexpall').onclick = exportAll;
    $('eship').onclick = shipCode;
    $('eimp').onclick = importMap;
    $('edel').onclick = revertMap;
    $('efile').onchange = async () => {
      const f = $('efile').files && $('efile').files[0];
      if (!f) return;
      try { $('io').value = await f.text(); } catch (e) { return msg('Could not read that file.'); }
      $('efile').value = '';
      await importMap();
    };
    $('ew').onchange = $('eh').onchange = resize;
    $('ename').onchange = () => { ED.name = $('ename').value || ED.id; persist(); fillSel(); };
    $('ezoom').oninput = $('ezoom').onchange = () => { zoom = +$('ezoom').value | 0; renderEd(); };
    $('mbgon').onchange = $('mbg').oninput = () => {
      ED.bg = $('mbgon').checked ? $('mbg').value : undefined;
      persist(); renderEd();
    };
    $('lsel').onchange = () => {
      if ($('lsel').value) ED.exits[linkKey] = $('lsel').value;
      else delete ED.exits[linkKey];
      persist(); renderEd();
      msg('Exit saved. Link the other map back to make a two-way door.');
    };

    let rt = null;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (document.body.classList.contains('editing')) renderEd(); }, 150);
    });

    $('animchk').checked = WA.settings.anim;
    $('animchk').onchange = () => WA.settings.setAnim($('animchk').checked);
    $('fogchk').checked = WA.settings.fog;
    $('fogchk').onchange = () => WA.settings.setFog($('fogchk').checked);
    $('crtchk').checked = WA.settings.crt;
    $('crtchk').onchange = () => WA.settings.setCrt($('crtchk').checked);

    const setAmb = (v, commit) => {
      ED.amb = Math.max(0, Math.min(1, v));
      const pc = Math.round(ED.amb * 100);
      $('eamb').value = pc;
      $('eambv').textContent = pc + '%';
      if (!commit) return;
      persist();
      if (WA.game.S && WA.game.S.id === ED.id) { WA.game.updateVis(); WA.view.draw(); }
    };
    $('eamb').oninput = () => setAmb(+$('eamb').value / 100, false);
    $('eamb').onchange = () => setAmb(+$('eamb').value / 100, true);

    $('eindoor').onchange = () => {
      ED.indoor = $('eindoor').checked;
      persist();
      if (WA.game.S && WA.game.S.id === ED.id) { WA.game.updateVis(); WA.view.draw(); }
    };
    $('eweather').onchange = () => {
      ED.weather = $('eweather').value;
      persist();
      if (WA.game.S && WA.game.S.id === ED.id) WA.view.draw();
    };
    $('esnd').onchange = () => {
      ED.ambience = $('esnd').value;
      persist();
      if (WA.game.S && WA.game.S.id === ED.id) WA.view.draw();
    };
  }

  async function init() {
    loadShipSel();
    for (const id in WA.GAME.maps) WA.GAME.maps[id] = WA.maps.toV2(WA.GAME.maps[id]);
    // Maps shipped as code from the editor join the built-ins.
    const shipped = WA.AUTHORED || {};
    for (const id in shipped) {
      if (!ID_RE.test(id)) continue;
      const m = normalize(shipped[id]);
      if (m) WA.GAME.maps[id] = m;
    }
    BUILTIN = JSON.parse(JSON.stringify(WA.GAME.maps));

    SAVED = (WA.mapStore ? await WA.mapStore.init() : {}) || {};
    for (const id in SAVED) SAVED[id] = WA.maps.toV2(SAVED[id]);
    // Older saved maps have no ambient light: inherit it from the built-in map.
    for (const id in SAVED) {
      if (typeof SAVED[id].amb !== 'number' && BUILTIN[id] && typeof BUILTIN[id].amb === 'number') SAVED[id].amb = BUILTIN[id].amb;
      // A map saved before sound beds existed keeps the built-in's bed.
      if (typeof SAVED[id].ambience !== 'string' && BUILTIN[id] && typeof BUILTIN[id].ambience === 'string') SAVED[id].ambience = BUILTIN[id].ambience;
      WA.GAME.maps[id] = SAVED[id];
    }

    bind();
    bindLib();
    buildPal();
    setBrush('wall');
    loadEd(Object.keys(WA.GAME.maps)[0]);
  }

  WA.editor = { init, loadEd, renderEd, persist, buildPal, setBrush, newMap, importMap, exportMap, exportAll, shipCode, renderLib, duplicateMap, deleteMap, TILE_BUDGET };
})(window.WA = window.WA || {});
