/* Forge: create and edit enemies, items and tiles. Definitions live in GAME;
   only the player's overrides are stored. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const $ = U.el;
  // Rounded, clamped form input. The game's util keeps only U.clamp.
  const lim = (a, b, v) => Math.min(b, Math.max(a, Math.round(+v) || 0));

  const KINDS = ['tiles', 'entities', 'items'];
  const RESERVED = ['pan', 'link', 'erase_item', 'erase_entity', 'start'];
  let DSAVED = {}, FID = '';

  const taken = id => RESERVED.includes(id) || KINDS.some(k => WA.GAME[k][id]);
  const slug = s => {
    const b = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'thing';
    let id = b, n = 2;
    while (taken(id)) id = b + '_' + n++;
    return id;
  };

  const fmsg = t => { const el = $('fmsg'); if (el) el.textContent = t; };

  // Resistances are stored as { type: percent }, edited as "fire:50, energy:-30".
  function resText(res) {
    return Object.entries(res || {}).map(([k, v]) => k + ':' + v).join(', ');
  }
  function parseRes(text) {
    const out = {};
    for (const part of String(text || '').split(/[,;]+/)) {
      const bits = part.split(':');
      if (bits.length !== 2) continue;
      const key = bits[0].trim(), num = Number(bits[1].trim());
      if (!WA.damage.TYPES.includes(key) || !isFinite(num)) continue;
      out[key] = Math.max(-100, Math.min(95, Math.round(num)));
    }
    return out;
  }
  const fv = id => $('f_' + id);

  const LIM = { hp: [1, 99999], sight: [1, 30], watch: [0, 50], seq: [1, 99], acc: [0, 50], xp: [0, 999999], lvl: [1, 100], hurt: [0, 50], range: [1, 20], def: [0, 50], ac: [0, 50], wt: [0, 999], addict: [0, 100], light: [0, 20], wear: [0, 20], fix: [1, 100], heal: [0, 999], rads: [0, 99], ap: [0, 99], limb: [0, 1], dur: [1, 20], mag: [1, 20], blast: [1, 8], lock: [0, 3], hack: [0, 3], trapHurt: [0, 50], repairDiff: [1, 100], dmgMul: [0.1, 3], pen: [0, 100], resMod: [-100, 100], burst: [0, 10], spread: [0, 50] };
  const LOOK = [['c', 'Color', 'col'], ['bg', 'Background', 'bgc'], ['fx', 'Effect', 'fx'], ['glow', 'Glow', 'chk']];
  const FIELDS = {
    entities: [['name', 'Name', 'text'], ['lvl', 'Level (scales HP, damage, XP, caps)', 'num'], ['hp', 'HP', 'num'], ['dmg', 'Damage min / max', 'rng'], ['sight', 'Sight range', 'num'], ['watch', 'Watchfulness (Steal difficulty)', 'num'], ['carry', 'Pocketed goods (pickpocket)', 'loot'], ['held', 'Held items (harder to steal)', 'loot'], ['seq', 'Sequence (initiative; blank = from sight)', 'num'], ['acc', 'Accuracy bonus to hit', 'num'], ['xp', 'XP reward', 'num'], ['caps', 'Caps dropped min / max', 'rng'], ['drop', 'Drops item', 'itemid'], ['loot', 'Leaves a corpse with (items)', 'loot'], ['ai', 'Behaviour', 'ai'], ['range', 'Attack range (ranged/turret)', 'num'], ['knockback', 'Heavy hit knocks the player back (1 = yes)', 'chk'], ['dt', 'Attack damage type', 'dt'], ['onHit', 'Effect on hit', 'fxsel'], ['res', 'Resistances (fire:50, energy:-30)', 'res'], ...LOOK, ['light', 'Light emitted (radius)', 'num']],
    items: [['name', 'Name', 'text'], ['type', 'Class', 'typ'], ['wt', 'Weight (lbs)', 'num'], ['loot', 'Contents (items)', 'loot'], ['lock', 'Lock difficulty (0 = unlocked)', 'num'], ['trap', 'Trapped container (Traps action)', 'chk'], ['trapHurt', 'Trap damage when opened', 'num'], ['trapDt', 'Trap damage type', 'dt'], ['trapMsg', 'Trap message', 'text'], ['needs', 'Needs key item', 'keyitem'], ['owner', 'Owned by NPC id (taking is theft)', 'text'], ['amt', 'Caps / ammo amount min / max', 'rng'], ['heal', 'HP restored when used', 'num'], ['rads', 'Rads removed when used', 'num'], ['ap', 'AP restored when used', 'num'], ['limb', 'Sets crippled limbs (1 = yes)', 'num'], ['addict', 'Addiction chance (%)', 'num'], ['dmg', 'Weapon damage min / max', 'rng'], ['range', 'Range (melee / throw distance)', 'num'], ['skill', 'Combat skill (auto = by type/range)', 'wskill'], ['hands', 'Hands required (One Hander trait)', 'hands'], ['blast', 'Blast radius (throwables)', 'num'], ['ammo', 'Ammo type (ranged)', 'ammoitem'], ['caliber', 'Ammo family / weapon caliber', 'text'], ['variant', 'Ammo variant label', 'text'], ['dmgMul', 'Ammo damage multiplier', 'num'], ['pen', 'Ammo armour penetration (%)', 'num'], ['resMod', 'Ammo resistance modifier (%)', 'num'], ['burst', 'Burst shots (1 = single)', 'num'], ['spread', 'Burst spread penalty per extra shot', 'num'], ['knockback', 'Heavy hit knocks targets back (1 = yes)', 'chk'], ['wear', 'Condition lost per use', 'num'], ['fix', 'Repair kit restores condition', 'num'], ['def', 'Armor damage blocked', 'num'], ['ac', 'Armor Class', 'num'], ['res', 'Armor resistances (ballistic:20, fire:-10)', 'res'], ['dt', 'Weapon damage type', 'dt'], ['onHit', 'Status effect', 'fxsel'], ['dur', 'Effect lasts (turns)', 'num'], ['mag', 'Effect strength', 'num'], ...LOOK, ['light', 'Light emitted (radius)', 'num']],
    tiles: [['name', 'Name', 'text'], ...LOOK, ['light', 'Light emitted (radius)', 'num'], ['solid', 'Blocks movement', 'chk'], ['trap', 'Trap: scan and disarm with the Traps action', 'chk'], ['hack', 'Terminal hack difficulty (0 = none)', 'num'], ['unlockKey', 'Hacked terminal releases (key)', 'keyitem'], ['hurt', 'Damage when stepped on', 'num'], ['dt', 'Hazard damage type', 'dt'], ['rads', 'Rads when stepped on', 'num'], ['heal', 'HP restored when stepped on', 'num'], ['onHit', 'Status effect on step', 'fxsel'], ['dur', 'Effect lasts (turns)', 'num'], ['mag', 'Effect strength', 'num'], ['needs', 'Needs item to pass', 'itemid'], ['opens', 'Opens into', 'tid'], ['repair', 'Repair into tile', 'tid'], ['repairDiff', 'Repair difficulty', 'num'], ['repairNeed', 'Repair needs item', 'itemid'], ['repairMsg', 'Repair success message', 'text'], ['msg', 'Message shown', 'text']]
  };
  const DEF = {
    entities: { name: 'New enemy', hp: 8, dmg: [1, 3], sight: 6, xp: 5, caps: [0, 5], c: 'bad', ai: 'pursue' },
    items: { name: 'New item', type: 'caps', amt: [5, 15], c: 'warn' },
    tiles: { name: 'New tile', c: 'dim' }
  };

  /* ---------- stored overrides ---------- */
  function migrateData(old) {
    const out = {};
    for (const kind of KINDS) {
      out[kind] = {};
      for (const [sym, def] of Object.entries(old[kind] || {})) {
        let id = WA.LEG[sym];
        if (!def) { if (id) out[kind][id] = null; continue; }
        if (!id) { id = slug(def.name || 'thing'); WA.LEG[sym] = id; }
        WA.GAME[kind][id] = out[kind][id] = { ...def, glyph: sym };
      }
    }
    for (const d of Object.values(out.tiles)) if (d && d.opens && WA.LEG[d.opens]) d.opens = WA.LEG[d.opens];
    return out;
  }

  function loadData() {
    try {
      const r2 = localStorage.getItem('wasteland.data2');
      const r1 = localStorage.getItem('wasteland.data');
      if (r2) DSAVED = JSON.parse(r2) || {};
      else if (r1) {
        DSAVED = migrateData(JSON.parse(r1));
        localStorage.setItem('wasteland.data2', JSON.stringify(DSAVED));
      }
    } catch (e) { DSAVED = {}; }
    for (const k of KINDS) for (const s in DSAVED[k] || {}) {
      const d = DSAVED[k][s];
      if (d) {
        // A stored entity override keeps stats and looks, never dialogue: the
        // tree holds functions that JSON cannot round-trip, so the shipped
        // tree is always used and authored patches merge into it at boot.
        const base = k === 'entities' ? WA.BASE.entities[s] : null;
        WA.GAME[k][s] = base && base.talk ? { ...d, talk: base.talk } : d;
        if (d.glyph && !(d.glyph in WA.LEG)) WA.LEG[d.glyph] = s;
      } else delete WA.GAME[k][s];
    }
  }

  const persistData = () => {
    try { localStorage.setItem('wasteland.data2', JSON.stringify(DSAVED)); }
    catch (e) { fmsg('Could not save on this device.'); }
  };

  /* ---------- form ---------- */
  function buildForm() {
    const kind = $('fkind').value;
    const w = 'style="flex:1;width:100%;min-width:0"';
    const opt = c => `<option>${c}</option>`;
    $('ffields').innerHTML = FIELDS[kind].map(([k, label, t]) => {
      let input;
      if (t === 'rng') input = `<input id="f_${k}0" type="number" ${w}><input id="f_${k}1" type="number" ${w}>`;
      else if (t === 'col') input = `<select id="f_${k}" ${w}>${['dim', 'warn', 'bad', 'good', 'custom'].map(opt).join('')}</select><input id="f_${k}x" type="color" value="#33ff66" style="width:48px;padding:0">`;
      else if (t === 'bgc') input = `<input id="f_${k}on" type="checkbox" style="width:auto"><input id="f_${k}" type="color" value="#14301a" style="width:48px;padding:0">`;
      else if (t === 'fx') input = `<select id="f_${k}" ${w}>${['none', 'flicker', 'pulse', 'blink', 'rainbow'].map(opt).join('')}</select>`;
      else if (t === 'typ') input = `<select id="f_${k}" ${w}>${['caps', 'ammo', 'weapon', 'explosive', 'armor', 'stim', 'radaway', 'repair', 'food', 'chem', 'key', 'container', 'junk'].map(opt).join('')}</select>`;
      else if (t === 'itemid') input = `<select id="f_${k}" ${w}><option value="">none</option>${Object.keys(WA.GAME.items).filter(i => !WA.GAME.items[i].hidden).map(i => `<option value="${U.esc(i)}">${U.esc(WA.GAME.items[i].name)}</option>`).join('')}</select>`;
      else if (t === 'ammoitem') input = `<select id="f_${k}" ${w}><option value="">unlimited</option>${Object.keys(WA.GAME.items).filter(id => WA.GAME.items[id].type === 'ammo' && !WA.GAME.items[id].hidden).map(id => `<option value="${U.esc(id)}">${U.esc(WA.GAME.items[id].name)}</option>`).join('')}</select>`;
      else if (t === 'loot') input = `<input id="f_${k}" type="text" ${w} placeholder="stimpak, caps">`;
      else if (t === 'keyitem') input = `<select id="f_${k}" ${w}><option value="">none</option>${Object.keys(WA.GAME.items).filter(i => WA.GAME.items[i].type === 'key' && !WA.GAME.items[i].hidden).map(i => `<option value="${U.esc(i)}">${U.esc(WA.GAME.items[i].name)}</option>`).join('')}</select>`;
      else if (t === 'ai') input = `<select id="f_${k}" ${w}>${['wander', 'pursue', 'ranged', 'turret'].map(opt).join('')}</select>`;
      else if (t === 'dt') input = `<select id="f_${k}" ${w}>${WA.damage.TYPES.map(opt).join('')}</select>`;
      else if (t === 'wskill') input = `<select id="f_${k}" ${w}><option value="">auto</option>${WA.skills.DEFS.filter(d => ['small_guns', 'big_guns', 'energy_weapons', 'melee_weapons', 'unarmed', 'throwing'].includes(d.id)).map(d => `<option value="${d.id}">${U.esc(d.name)}</option>`).join('')}</select>`;
      else if (t === 'hands') input = `<select id="f_${k}" ${w}><option value="1">one-handed</option><option value="2">two-handed</option></select>`;
      else if (t === 'fxsel') input = `<select id="f_${k}" ${w}><option value="">none</option>` +
        WA.status.IDS.map(id => `<option value="${id}">${U.esc(WA.status.EFX[id].short)} · ${U.esc(WA.status.EFX[id].name)}</option>`).join('') + '</select>';
      else if (t === 'res') input = `<input id="f_${k}" type="text" ${w} placeholder="fire:50, energy:-30">`;
      else if (t === 'tid') input = `<select id="f_${k}" ${w}><option value="">none</option>${Object.keys(WA.GAME.tiles).map(i => `<option value="${U.esc(i)}">${U.esc(WA.GAME.tiles[i].glyph)} ${U.esc(WA.GAME.tiles[i].name)}</option>`).join('')}</select>`;
      else if (t === 'chk') input = `<input id="f_${k}" type="checkbox" style="width:auto">`;
      else input = `<input id="f_${k}" type="${t === 'num' ? 'number' : 'text'}" ${w}>`;
      return `<div class="row" data-f="${k}"><label style="flex:1">${label} ${input}</label></div>`;
    }).join('');
    const ty = $('f_type'), fx = $('f_onHit');
    if (ty) ty.onchange = syncClass;
    if (fx) fx.onchange = syncClass;
    syncClass();
  }

  /* Items only show the fields their class actually uses. */
  const ALWAYS = ['name', 'type', 'wt', 'c', 'bg', 'fx', 'glow', 'light'];
  const BY_CLASS = {
    caps: ['amt'], 
    weapon: ['dmg', 'range', 'skill', 'hands', 'ammo', 'caliber', 'burst', 'spread', 'knockback', 'wear', 'dt', 'onHit', 'dur', 'mag'],
    explosive: ['dmg', 'range', 'blast', 'dt', 'onHit', 'dur', 'mag'],
    armor: ['def', 'ac', 'res'], repair: ['fix'],
    ammo: ['amt', 'caliber', 'variant', 'dmgMul', 'pen', 'resMod'],
    food: ['heal', 'rads', 'ap', 'onHit', 'dur', 'mag'], chem: ['heal', 'rads', 'ap', 'addict', 'onHit', 'dur', 'mag'],
    container: ['loot', 'lock', 'needs', 'owner', 'trap', 'trapHurt', 'trapDt', 'trapMsg'],
    stim: [], radaway: [], key: [], junk: ['limb']
  };
  function syncClass() {
    const items = $('fkind').value === 'items';
    const t = $('f_type') ? $('f_type').value : '';
    const keep = items ? (BY_CLASS[t] || []) : null;
    const fxOn = !!($('f_onHit') && $('f_onHit').value);
    document.querySelectorAll('#ffields .row[data-f]').forEach(r => {
      const k = r.dataset.f;
      let show = !keep || ALWAYS.includes(k) || keep.includes(k);
      if (!fxOn && (k === 'dur' || k === 'mag')) show = false;
      r.style.display = show ? '' : 'none';
    });
  }

  function loadForm(id) {
    const kind = $('fkind').value, cur = WA.GAME[kind][id], o = cur || DEF[kind];
    FID = cur ? id : '';
    $('fsym').value = o.glyph || '';
    for (const [k, , t] of FIELDS[kind]) {
      if (t === 'rng') { fv(k + '0').value = o[k] ? o[k][0] : 0; fv(k + '1').value = o[k] ? o[k][1] : 0; }
      else if (t === 'col') { const hex = o[k] && o[k][0] === '#'; fv(k).value = hex ? 'custom' : (o[k] || 'dim'); if (hex) fv(k + 'x').value = o[k]; }
      else if (t === 'bgc') { fv(k + 'on').checked = !!o[k]; if (o[k]) fv(k).value = o[k]; }
      else if (t === 'fx') fv(k).value = o[k] || 'none';
      else if (t === 'ai') fv(k).value = o[k] || 'pursue';
      else if (t === 'dt') fv(k).value = o[k] || 'melee';
      else if (t === 'wskill') fv(k).value = o[k] || '';
      else if (t === 'hands') fv(k).value = String(o[k] === 2 ? 2 : 1);
      else if (t === 'ammoitem') fv(k).value = o[k] || '';
      else if (t === 'itemid') fv(k).value = o[k] || '';
      else if (t === 'keyitem') fv(k).value = o[k] || '';
      else if (t === 'fxsel') fv(k).value = o[k] || '';
      else if (t === 'res') fv(k).value = resText(o[k]);
      else if (t === 'loot') fv(k).value = (o[k] || []).map(id => (WA.GAME.items[id] || {}).name || id).join(', ');
      else if (t === 'chk') fv(k).checked = !!o[k];
      else fv(k).value = o[k] ?? '';
    }
    syncClass();
  }

  function fillForge(id) {
    buildForm();
    const kind = $('fkind').value;
    $('fsel').innerHTML = Object.keys(WA.GAME[kind]).filter(s => !WA.GAME[kind][s].hidden).map(s =>
      `<option value="${U.esc(s)}">${U.esc(WA.GAME[kind][s].glyph || '?')} – ${U.esc(WA.GAME[kind][s].name)}</option>`).join('');
    if (id !== undefined && WA.GAME[kind][id]) $('fsel').value = id;
    loadForm($('fsel').value);
  }

  function saveForge() {
    const kind = $('fkind').value, glyph = $('fsym').value.trim();
    if (!glyph || glyph === '@' || U.split(glyph).length !== 1) return fmsg('Pick one symbol (not @ or a space).');
    // Start from the existing definition so fields this form does not know
    // about (dialogue trees, quest links) survive an edit.
    const prev = FID && WA.GAME[kind][FID] ? WA.GAME[kind][FID] : null;
    const o = prev ? { ...prev, glyph } : { glyph };
    for (const [k] of FIELDS[kind]) delete o[k];
    for (const [k, , t] of FIELDS[kind]) {
      if (t === 'rng') {
        const pair = [fv(k + '0').value, fv(k + '1').value].map(v => lim(0, 999, v)).sort((a, b) => a - b);
        if (pair[0] || pair[1]) o[k] = pair;
      }
      else if (t === 'col') o[k] = fv(k).value === 'custom' ? fv(k + 'x').value : fv(k).value;
      else if (t === 'bgc') { if (fv(k + 'on').checked) o[k] = fv(k).value; }
      else if (t === 'fx') { if (fv(k).value !== 'none') o[k] = fv(k).value; }
      else if (t === 'dt') { if (fv(k).value) o[k] = fv(k).value; }
      else if (t === 'ammoitem') { if (fv(k).value) o[k] = fv(k).value; }
      else if (t === 'itemid') { if (fv(k).value) o[k] = fv(k).value; }
      else if (t === 'keyitem') { if (fv(k).value) o[k] = fv(k).value; }
      else if (t === 'fxsel') { if (fv(k).value) o[k] = fv(k).value; }
      else if (t === 'hands') o[k] = +fv(k).value === 2 ? 2 : 1;
      else if (k === 'wt') { if (fv(k).value !== '') o[k] = lim(0, 999, fv(k).value); }
      else if (t === 'res') { const r = parseRes(fv(k).value); if (Object.keys(r).length) o[k] = r; }
      else if (t === 'loot') {
        const ids = [];
        for (const part of String(fv(k).value || '').split(/[,;]+/)) {
          const q = part.trim().toLowerCase();
          if (!q) continue;
          const hit = Object.keys(WA.GAME.items).find(id => !WA.GAME.items[id].hidden &&
            (id === q || String(WA.GAME.items[id].name).toLowerCase() === q));
          if (!hit) return fmsg('Unknown item: ' + part.trim());
          ids.push(hit);
        }
        if (ids.length) o[k] = ids.slice(0, 12);
      }
      else if (t === 'chk') { if (fv(k).checked) o[k] = 1; }
      else if (t === 'num') { const l = LIM[k] || [0, 9999]; if (+fv(k).value) o[k] = lim(l[0], l[1], fv(k).value); }
      else if (fv(k).value) o[k] = fv(k).value;
    }
    o.name = String(o.name || 'Thing').slice(0, 40);
    if (o.msg) o.msg = String(o.msg).slice(0, 200);
    if (kind === 'entities') { o.hp = o.hp || 1; o.sight = o.sight || 1; }
    if (kind === 'items' && o.type === 'weapon') {
      o.range = o.range || 1;
      if (!(o.dmg && o.dmg[1] > 0)) return fmsg('Weapons need damage above 0.');
    }
    if (kind === 'items' && o.type === 'armor' && !o.def) return fmsg('Armor needs damage blocked of at least 1.');
    if (kind === 'items' && o.type === 'explosive') {
      o.range = o.range || 6;
      o.blast = o.blast || 1;
      if (!(o.dmg && o.dmg[1] > 0)) return fmsg('Explosives need damage above 0.');
    }
    if (kind === 'items' && o.type === 'container' && !(o.loot && o.loot.length)) {
      return fmsg('Containers need something inside.');
    }
    if (kind === 'items' && o.type === 'container' && o.needs &&
      !(WA.GAME.items[o.needs] && WA.GAME.items[o.needs].type === 'key')) delete o.needs;
    if (kind === 'items' && o.owner && !WA.GAME.entities[o.owner]) delete o.owner;
    if (kind === 'items' && (o.type === 'food' || o.type === 'chem') && !o.heal && !o.rads && !o.ap && !o.onHit) {
      return fmsg('Food and chems need HP, rads, AP or an effect to do something.');
    }
    if (kind === 'items' && o.ammo && !(WA.GAME.items[o.ammo] && WA.GAME.items[o.ammo].type === 'ammo')) delete o.ammo;
    // Drop fields the chosen class does not use, so definitions stay readable.
    if (kind === 'tiles' && !o.hurt) delete o.dt;
    if (kind === 'tiles' && !o.onHit) { delete o.dur; delete o.mag; }
    if (kind === 'tiles' && !o.hack) { delete o.hack; delete o.unlockKey; }
    if (kind === 'tiles' && o.repair && !WA.GAME.tiles[o.repair]) {
      return fmsg('Repair target must be an existing tile.');
    }
    if (kind === 'tiles' && !o.repair) {
      delete o.repairDiff; delete o.repairNeed; delete o.repairMsg;
    }
    if (kind === 'tiles' && o.repairNeed && !WA.GAME.items[o.repairNeed]) delete o.repairNeed;
    if (kind === 'items' && o.type !== 'container') {
      delete o.trap; delete o.trapHurt; delete o.trapDt; delete o.trapMsg;
    }
    if (kind === 'items' && o.type === 'container' && !o.trap) {
      delete o.trapHurt; delete o.trapDt; delete o.trapMsg;
    }
    if (kind === 'tiles' && o.unlockKey &&
      !(WA.GAME.items[o.unlockKey] && WA.GAME.items[o.unlockKey].type === 'key')) delete o.unlockKey;
    if (kind === 'items') {
      const t = o.type || 'caps';
      if (t !== 'caps' && t !== 'ammo') delete o.amt;
      if (t !== 'weapon' && t !== 'explosive') { delete o.dmg; delete o.range; delete o.dt; }
      if (t !== 'weapon') { delete o.ammo; delete o.wear; delete o.skill; delete o.hands; delete o.burst; delete o.spread; delete o.knockback; }
      if (t !== 'ammo' && t !== 'weapon') delete o.caliber;
      if (t !== 'ammo') { delete o.variant; delete o.dmgMul; delete o.pen; delete o.resMod; }
      if (t !== 'explosive') delete o.blast;
      if (t !== 'container') { delete o.loot; delete o.lock; delete o.needs; delete o.owner; }
      if (t !== 'armor') { delete o.def; delete o.ac; delete o.res; }
      if (t !== 'repair') delete o.fix;
      if (t !== 'food' && t !== 'chem') { delete o.heal; delete o.rads; delete o.ap; }
      if (t !== 'junk') delete o.limb;
      if (t !== 'chem') delete o.addict;
      if (t !== 'weapon' && t !== 'food' && t !== 'chem' && t !== 'explosive') delete o.onHit;
      if (!o.onHit) { delete o.dur; delete o.mag; }
    }
    const id = FID || slug(o.name);
    WA.GAME[kind][id] = o;
    // Dialogue is not part of a stored override (see loadData); drop the tree
    // from the persisted copy so a reload cannot replace it with a lossy one.
    const stored = kind === 'entities' ? { ...o } : o;
    if (kind === 'entities') delete stored.talk;
    (DSAVED[kind] || (DSAVED[kind] = {}))[id] = stored;
    persistData();
    WA.editor.buildPal();
    fillForge(id);
    buildSymlib();
    fmsg('Saved ' + o.name + '.');
  }

  function delForge() {
    const kind = $('fkind').value, id = $('fsel').value;
    if (!WA.GAME[kind][id]) return;
    if (kind === 'tiles' && (id === 'wall' || id === 'floor')) return fmsg('Wall and floor cannot be deleted.');
    delete WA.GAME[kind][id];
    if (WA.BASE[kind][id]) (DSAVED[kind] || (DSAVED[kind] = {}))[id] = null;
    else if (DSAVED[kind]) delete DSAVED[kind][id];
    persistData();
    WA.editor.buildPal();
    fillForge();
    buildSymlib();
    fmsg('Deleted.');
  }

  function resetAll() {
    DSAVED = {};
    persistData();
    for (const k in WA.BASE) {
      for (const s in WA.GAME[k]) delete WA.GAME[k][s];
      Object.assign(WA.GAME[k], WA.util.copy(WA.BASE[k]));
    }
    // Resetting to the built-in entities also drops the baked definitions and
    // authored dialogue patches, so reapply those before the merge.
    if (WA.baked) WA.baked.apply(WA.AUTHORED_DEFS);
    if (WA.authoring) WA.authoring.rebase();
    if (WA.authored) WA.authored.apply();
    WA.editor.buildPal();
    fillForge();
    buildSymlib();
    fmsg('Reset to the original things.');
  }

  /* ---------- symbol library ---------- */
  function syncSymCats() {
    const sel = $('symcat');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' +
      WA.SYMBOLS.map(cat => `<option value="${U.esc(cat.name)}">${U.esc(cat.name)}</option>`).join('');
    sel.value = WA.SYMBOLS.some(cat => cat.name === current) ? current : '';
  }

  function buildSymlib() {
    const box = $('symlib');
    if (!box) return;
    if (WA.refreshSymbols) WA.refreshSymbols();
    const q = ($('symsearch') ? $('symsearch').value : '').trim().toLowerCase();
    const only = $('symcat') ? $('symcat').value : '';
    let total = 0, shown = 0, html = '';
    for (const cat of WA.SYMBOLS) {
      total += cat.chars.length;
      if (only && cat.name !== only) continue;
      const catMatch = !!q && cat.name.toLowerCase().indexOf(q) >= 0;
      const chars = q && !catMatch ? cat.chars.filter(ch => ch.toLowerCase().indexOf(q) >= 0) : cat.chars;
      if (!chars.length) continue;
      shown += chars.length;
      html += `<div class="symcat">${U.esc(cat.name)}</div><div class="symgrid">` +
        chars.map(ch => `<button type="button" class="symbtn" data-sym="${U.esc(ch)}" title="${U.esc(ch)}">${U.esc(ch)}</button>`).join('') +
        '</div>';
    }
    box.innerHTML = html || '<div class="symempty dim">No symbols match that search.</div>';
    const count = $('symcount');
    if (count) count.textContent = `${shown} of ${total} symbol${total === 1 ? '' : 's'}${only ? ' · ' + only : ''}`;
    syncSymCats();
  }

  function bind() {
    $('fkind').onchange = () => fillForge();
    $('fsel').onchange = () => loadForm($('fsel').value);
    $('fnew').onclick = () => loadForm('');
    $('fsave').onclick = saveForge;
    $('fdel').onclick = delForge;
    $('freset').onclick = resetAll;
    if ($('fval')) $('fval').onclick = () => {
      if (!WA.authored) return fmsg('The content checker is not loaded.');
      const r = WA.authored.check();
      const io = $('fio');
      if (io) { io.value = WA.authored.report(); io.select(); }
      try { navigator.clipboard.writeText(io ? io.value : WA.authored.report()); } catch (e) {}
      fmsg(r.ok
        ? `Content OK — ${r.quests} quests, ${r.dialogues} dialogue trees, ${r.pages} pages${r.warnings.length ? `, ${r.warnings.length} warning(s)` : ''}.`
        : `Content has ${r.errors.length} error(s) — the report is in the box below.`);
    };
    $('fexp').onclick = () => {
      const t = KINDS.map(k => k + ': ' + JSON.stringify(WA.GAME[k], null, 2)).join(',\n');
      const io = $('fio');
      io.value = t;
      io.select();
      try { navigator.clipboard.writeText(t).then(() => fmsg('Copied.'), () => fmsg('Data is below. Select and copy it.')); }
      catch (e) { fmsg('Data is below. Select and copy it.'); }
    };
    $('symlib').addEventListener('click', e => {
      const b = e.target.closest('button[data-sym]');
      if (b) { $('fsym').value = b.dataset.sym; fmsg('Symbol picked. Save to apply.'); }
    });
    if ($('symsearch')) $('symsearch').oninput = buildSymlib;
    if ($('symcat')) $('symcat').onchange = buildSymlib;
  }

  function init() {
    loadData();
    buildSymlib();
    bind();
    fillForge();
  }

  /* Quick edits from the map editor use the same override store as the full
     Forge form, so a brush change survives reloads and remains editable here. */
  function update(kind, id, patch) {
    if (!KINDS.includes(kind) || !WA.GAME[kind] || !WA.GAME[kind][id] || !patch) return false;
    const next = { ...WA.GAME[kind][id], ...patch };
    WA.GAME[kind][id] = next;
    (DSAVED[kind] || (DSAVED[kind] = {}))[id] = next;
    persistData();
    if (WA.editor) WA.editor.buildPal();
    return true;
  }

  /* ---------- content packs ---------- */
  const DEF_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

  /* Every definition that differs from the pristine shipped data, including
     the nulls that remove one. Dialogue never leaves the browser. */
  function exportDefs() {
    const out = { tiles: {}, entities: {}, items: {} };
    for (const kind of KINDS) {
      const base = WA.BASE[kind] || {}, live = WA.GAME[kind] || {};
      for (const id of Object.keys(base)) {
        const cur = live[id];
        if (!cur) { out[kind][id] = null; continue; }
        const keep = { ...cur };
        delete keep.talk;
        if (JSON.stringify(keep) !== JSON.stringify(base[id])) out[kind][id] = keep;
      }
      for (const id of Object.keys(live)) {
        if (base[id]) continue;
        const keep = { ...live[id] };
        delete keep.talk;
        out[kind][id] = keep;
      }
    }
    return out;
  }

  /* Imported definitions join the browser override store and are applied on
     the next reload, exactly like a definition saved in the form. */
  function importDefs(defs) {
    if (!defs || typeof defs !== 'object') return 0;
    let n = 0;
    for (const kind of KINDS) {
      const src = defs[kind];
      if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
      for (const id of Object.keys(src)) {
        if (!DEF_ID.test(id)) continue;
        const d = src[id];
        if (d === null) {
          (DSAVED[kind] || (DSAVED[kind] = {}))[id] = null;
          delete WA.GAME[kind][id];
          n++;
        } else if (d && typeof d === 'object' && !Array.isArray(d)) {
          (DSAVED[kind] || (DSAVED[kind] = {}))[id] = d;
          WA.GAME[kind][id] = { ...d };
          if (d.glyph && !(d.glyph in WA.LEG)) WA.LEG[d.glyph] = id;
          n++;
        }
      }
    }
    persistData();
    return n;
  }

  WA.forge = { init, fillForge, saveForge, delForge, resetAll, update, exportDefs, importDefs };
})(window.WA = window.WA || {});
