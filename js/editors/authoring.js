/* In-game authoring for quests and their dialogue. The Forge form writes a
   quest definition plus a matching talk page for its giver, runs
   WA.authored.check(), and only keeps the job when the check gains no new
   errors. Jobs are stored in this browser (localStorage "wasteland.authored")
   and merged into WA.quests.DEFS and the giver's tree at boot; deleting one
   rebuilds that NPC's tree from a pristine snapshot so no generated page or
   option is left behind. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const $ = U.el;
  const KEY = 'wasteland.authored';
  const G = () => WA.GAME;
  const defs = () => WA.quests.DEFS;
  const SNAP = {};            // pristine talk trees, taken before the authored merge
  let STORE = { quests: {}, dialogue: {} };
  let SEL = '';               // authored quest currently loaded in the form
  const MAX_GOALS = 4;        // a job can ask for up to this many things
  const MAX_ALTS = 4;         // a job can offer up to this many alternate hand-ins
  const MAX_REPS = 4;         // a reward can change up to this many factions by hand

  /* Older saved jobs carried one `alt`; newer ones keep an `alts` array. */
  const entryAlts = e => (e && Array.isArray(e.alts) && e.alts.length)
    ? e.alts
    : (e && e.alt && e.alt.id ? [e.alt] : []);

  /* Trees hold functions (root/text/if), which JSON cannot clone; copying
     arrays and objects while keeping function references is enough here. */
  const clone = v => {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k in v) o[k] = clone(v[k]);
      return o;
    }
    return v;
  };
  const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const str = v => String(v == null ? '' : v).trim();
  const PAGE = qid => 'job_' + qid;
  const msg = t => { const el = $('aqmsg'); if (el) el.textContent = t; };
  const report = t => { const io = $('fio'); if (io) io.value = t; };

  /* ---------- store ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const got = raw ? JSON.parse(raw) : null;
      if (got && typeof got === 'object') {
        STORE = { quests: got.quests || {}, dialogue: got.dialogue || {} };
      }
    } catch (e) { STORE = { quests: {}, dialogue: {} }; }
  }

  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(STORE)); }
    catch (e) { msg('This browser would not store the job.'); }
  }

  function applyQuests() {
    const shipped = [];
    for (const id of Object.keys(STORE.quests)) {
      const q = STORE.quests[id];
      if (defs()[id]) {
        // The file already ships this job (usually an export pasted in). The
        // file wins, so the browser copy and its dialogue are dropped.
        delete STORE.quests[id];
        delete STORE.dialogue[id];
        shipped.push(id);
        continue;
      }
      const bad = WA.quests.checkAuthored(id, q);
      if (bad.length) { console.warn('[Wasteland] ' + bad.join('; ')); continue; }
      defs()[id] = q;
    }
    if (shipped.length) {
      saveStore();
      console.log(`[Wasteland] ${shipped.length} authored job${shipped.length === 1 ? '' : 's'} now ship from js/data/quests-authored.js and left the browser store: ${shipped.join(', ')}`);
    }
  }

  /* ---------- live trees ---------- */
  function snap(id) {
    const d = G().entities[id];
    if (!d || !d.talk || SNAP[id]) return;
    SNAP[id] = { talk: clone(d.talk), quest: d.quest };
  }

  function snapAll() {
    for (const k in SNAP) delete SNAP[k];
    for (const id in G().entities) snap(id);
  }

  /* Generated pages and options carry `_qid`. A copy saved inside a Forge
     override outlives a deleted job, so drop anything whose job is gone. */
  function prune(id) {
    const d = G().entities[id];
    const t = d && d.talk;
    if (!t || !t.nodes) return;
    for (const n of Object.keys(t.nodes)) {
      const node = t.nodes[n] || {};
      if (node._qid && !STORE.quests[node._qid]) { delete t.nodes[n]; continue; }
      if (Array.isArray(node.opts)) node.opts = node.opts.filter(o => !(o && o._qid && !STORE.quests[o._qid]));
    }
    if (d.quest && !defs()[d.quest]) delete d.quest;
  }

  function pageOpts(qid, e, page) {
    const opts = [];
    if (e.take) opts.push({ t: e.take, fx: { quest: ['take', qid] }, to: page, if: c => c.q(qid) === 'none', _auth: 'q:' + qid + ':take', _qid: qid });
    if (e.turnin) opts.push({ t: e.turnin, fx: { quest: ['turnin', qid] }, to: page, if: c => c.q(qid) === 'ready', _auth: 'q:' + qid + ':turnin', _qid: qid });
    for (const a of entryAlts(e)) {
      if (!a || !a.id || !a.label) continue;
      opts.push({ t: a.label, fx: { quest: ['turnin', qid, a.id] }, to: page, if: c => c.q(qid) === 'ready', _auth: 'q:' + qid + ':alt:' + a.id, _qid: qid });
    }
    opts.push({ t: 'Back', to: '@', _qid: qid });
    return opts;
  }

  /* Turn every stored job's dialogue entry into a patch keyed by its giver. */
  function syncExtra() {
    const out = {};
    for (const qid of Object.keys(STORE.dialogue)) {
      const e = STORE.dialogue[qid];
      if (!e || !e.npc) continue;
      const p = out[e.npc] || (out[e.npc] = { nodes: {}, add: {} });
      const page = e.node || PAGE(qid);
      p.nodes[page] = { text: e.text || 'Work is work.', opts: pageOpts(qid, e, page), _qid: qid };
      if (e.hook && e.label) {
        (p.add[e.hook] || (p.add[e.hook] = [])).push({ t: e.label, to: page, if: c => c.q(qid) !== 'locked', _auth: 'q:' + qid + ':link', _qid: qid });
      }
    }
    WA.AUTHORED_STORED_DIALOGUE = out;
  }

  /* Restore one NPC from its pristine tree, then re-merge the hand-written
     patch and every stored job that uses this speaker. */
  function rebuild(id) {
    const d = G().entities[id];
    const s = SNAP[id];
    if (!d || !d.talk || !s || !WA.authored) return false;
    d.talk = clone(s.talk);
    if (s.quest === undefined) delete d.quest; else d.quest = s.quest;
    const base = WA.AUTHORED_DIALOGUE && WA.AUTHORED_DIALOGUE[id];
    if (base) WA.authored.mergePatch(id, base);
    const extra = (WA.AUTHORED_STORED_DIALOGUE || {})[id];
    if (extra) WA.authored.mergePatch(id, extra);
    prune(id);
    d.talk._authored = 1;
    return true;
  }

  /* ---------- form data ---------- */
  const option = (id, label) => `<option value="${U.esc(id)}">${U.esc(label)}</option>`;
  const targetName = (kind, id) => {
    const d = kind === 'kill' ? G().entities[id] : kind === 'repair' ? G().tiles[id] : G().items[id];
    return d ? (d.name || id) : id;
  };

  function autoGoalText(kind, id, need) {
    const n = targetName(kind, id);
    const verb = kind === 'kill' ? 'Kill' : kind === 'repair' ? 'Repair' : 'Bring';
    const many = need > 1 ? `${need} ` : '';
    const plural = kind === 'kill' && need > 1 ? (/[sxz]$|ch$|sh$/i.test(n) ? 'es' : 's') : '';
    return `${verb} ${many}${n}${plural}`;
  }

  /* ---------- goal rows ---------- */
  const goalRows = () => Array.from(document.querySelectorAll('#aqgoals .aqgoal'));
  const rowParts = row => ({
    kind: row.querySelector('.aqgkind'),
    target: row.querySelector('.aqgtarget'),
    need: row.querySelector('.aqgneed'),
    text: row.querySelector('.aqgtext')
  });

  function kindOptions() {
    const LABEL = { kill: 'Kill a foe', ammo: 'Deliver ammo', item: 'Deliver an item', repair: 'Repair something' };
    const kinds = (WA.quests && WA.quests.GOAL_KINDS) || ['kill', 'ammo', 'item', 'repair'];
    return kinds.map(k => option(k, LABEL[k] || k)).join('');
  }

  function targetIds(kind) {
    if (kind === 'kill') return Object.keys(G().entities).filter(id => !(G().entities[id] || {}).ally);
    if (kind === 'ammo') return Object.keys(G().items).filter(id => (G().items[id] || {}).type === 'ammo' && !G().items[id].hidden);
    if (kind === 'item') return Object.keys(G().items).filter(id => !(G().items[id] || {}).hidden);
    return Object.keys(G().tiles).filter(id => (G().tiles[id] || {}).repair);
  }

  function fillRowTargets(row, keep) {
    const p = rowParts(row);
    const kind = p.kind.value;
    const ids = targetIds(kind);
    const cur = keep ? p.target.value : '';
    p.target.innerHTML = ids.length ? ids.map(id => option(id, targetName(kind, id))).join('') : '<option value="">nothing to pick</option>';
    p.target.value = ids.includes(cur) ? cur : (ids[0] || '');
  }

  /* The suggested text follows the row until the author types their own. */
  function suggestRow(row, force) {
    const p = rowParts(row);
    const next = autoGoalText(p.kind.value, p.target.value, int(p.need.value, 1, 999));
    if (force || !p.text.value || p.text.value === row.dataset.auto) p.text.value = next;
    row.dataset.auto = next;
  }

  function pruneRemove() {
    const rows = goalRows();
    for (const row of rows) {
      const b = row.querySelector('.aqgdel');
      if (b) b.style.display = rows.length > 1 ? '' : 'none';
    }
  }

  /* ---------- standing-change rows ---------- */
  const repRows = wrap => (wrap ? Array.from(wrap.querySelectorAll('.aqrep')) : []);
  const repParts = row => ({
    faction: row.querySelector('.aqrepfaction'),
    change: row.querySelector('.aqrepchange'),
    remove: row.querySelector('.aqrepdel')
  });

  function fillRepFaction(sel, cur) {
    const F = (WA.reputation && WA.reputation.FACTIONS) || {};
    const ids = Object.keys(F);
    sel.innerHTML = ids.map(id => option(id, F[id].name)).join('');
    sel.value = cur && F[cur] ? cur : (ids[0] || '');
  }

  function addRep(wrap, faction, change) {
    if (!wrap) return null;
    // Manual adds stop at the cap; loading and cloning keep every change.
    if (faction === undefined && repRows(wrap).length >= MAX_REPS) {
      msg(`A reward can change up to ${MAX_REPS} factions.`);
      return null;
    }
    const F = (WA.reputation && WA.reputation.FACTIONS) || {};
    let pick = faction || '';
    if (!pick) {
      const used = new Set(repRows(wrap).map(r => repParts(r).faction.value));
      pick = Object.keys(F).find(id => !used.has(id)) || Object.keys(F)[0] || '';
    }
    const row = document.createElement('div');
    row.className = 'aqrep';
    row.innerHTML =
      '<div class="row"><label>Standing <select class="aqrepfaction"></select></label></div>' +
      '<div class="row"><label class="narrow">Change <input class="aqrepchange" type="number" min="-99" max="99"></label>' +
      '<button class="aqrepdel" type="button">Remove</button></div>';
    wrap.appendChild(row);
    const p = repParts(row);
    fillRepFaction(p.faction, pick);
    p.change.value = change || 0;
    p.remove.onclick = () => row.remove();
    return row;
  }

  /* Filled rows become one faction change each; duplicate factions are an error. */
  function collectReps(wrap) {
    const rep = {};
    for (const row of repRows(wrap)) {
      const p = repParts(row);
      const f = p.faction.value, n = int(p.change.value, -99, 99);
      if (!f || !n) continue;
      if (rep[f] !== undefined) {
        const name = WA.reputation ? WA.reputation.factionName(f) : f;
        return { error: `Two standing changes use ${name}.` };
      }
      rep[f] = n;
    }
    return { rep };
  }

  /* ---------- alternate outcome rows ---------- */
  const altRows = () => Array.from(document.querySelectorAll('#aqalts .aqalt'));
  const altParts = row => ({
    label: row.querySelector('.aqaltlabel'),
    id: row.querySelector('.aqaltid'),
    name: row.querySelector('.aqaltname'),
    done: row.querySelector('.aqaltdone'),
    caps: row.querySelector('.aqaltcaps'),
    xp: row.querySelector('.aqaltxp'),
    karma: row.querySelector('.aqaltkarma'),
    reps: row.querySelector('.aqaltreps'),
    remove: row.querySelector('.aqaltdel')
  });

  function altCount() {
    const n = altRows().length, el = $('aqaltn');
    if (el) el.textContent = n ? `${n} outcome${n === 1 ? '' : 's'}` : '';
  }

  function nextAltId() {
    const used = new Set(altRows().map(r => str(altParts(r).id.value)));
    let id = 'alt', n = 2;
    while (used.has(id)) id = 'alt_' + n++;
    return id;
  }

  /* Flat shape for a row, so load, clone and save all read one structure. */
  function flatAlt(id, a, label) {
    const r = (a && a.reward) || {};
    return {
      id, label: label || '', name: (a && a.name) || '', done: (a && a.done) || '',
      caps: r.caps || 0, xp: r.xp || 0, karma: r.karma || 0,
      reps: Object.keys(r.rep || {}).map(f => ({ faction: f, change: r.rep[f] }))
    };
  }

  function addAlt(a) {
    const wrap = $('aqalts');
    if (!wrap) return null;
    // Loading or cloning may exceed the cap; only manual Adds stop at it.
    if (!a && altRows().length >= MAX_ALTS) { msg(`A job can offer up to ${MAX_ALTS} alternate outcomes.`); return null; }
    const row = document.createElement('div');
    row.className = 'aqalt';
    row.innerHTML =
      '<div class="row"><label>Hand-in label <input class="aqaltlabel" maxlength="60"></label></div>' +
      '<div class="row"><label>Outcome name <input class="aqaltname" maxlength="40"></label></div>' +
      '<div class="row aqidrow"><label>Outcome id <input class="aqaltid" maxlength="24"></label></div>' +
      '<label>Done line <input class="aqaltdone" maxlength="240"></label>' +
      '<div class="row"><label>Caps <input class="aqaltcaps" type="number" min="0" max="99999"></label>' +
      '<label>XP <input class="aqaltxp" type="number" min="0" max="99999"></label>' +
      '<label>Karma <input class="aqaltkarma" type="number" min="-99" max="99"></label></div>' +
      '<div class="aqaltreps"></div>' +
      '<div class="row"><button class="aqaddrep" type="button">Add standing change</button></div>' +
      '<div class="row"><button class="aqaltdel" type="button">Remove outcome</button></div>';
    wrap.appendChild(row);
    const p = altParts(row);
    p.label.value = a && a.label ? a.label : '';
    p.id.value = a && a.id ? a.id : nextAltId();
    p.name.value = a && a.name ? a.name : '';
    p.done.value = a && a.done ? a.done : '';
    p.caps.value = a ? a.caps || 0 : 0;
    p.xp.value = a ? a.xp || 0 : 0;
    p.karma.value = a ? a.karma || 0 : 0;
    for (const rep of (a && Array.isArray(a.reps) ? a.reps : [])) addRep(p.reps, rep.faction, rep.change);
    row.querySelector('.aqaddrep').onclick = () => addRep(p.reps);
    p.remove.onclick = () => { row.remove(); altCount(); };
    altCount();
    return row;
  }

  function addGoal(g, n) {
    const wrap = $('aqgoals');
    if (!wrap) return null;
    if (goalRows().length >= MAX_GOALS) { msg(`A job can ask for up to ${MAX_GOALS} things.`); return null; }
    const row = document.createElement('div');
    row.className = 'aqgoal';
    row.innerHTML =
      '<div class="row"><label>Goal <select class="aqgkind"></select></label>' +
      '<label>Target <select class="aqgtarget"></select></label>' +
      '<label class="narrow">Need <input class="aqgneed" type="number" inputmode="numeric" min="1" max="999" value="1"></label></div>' +
      '<div class="row"><label>Goal text <input class="aqgtext" maxlength="80"></label>' +
      '<button class="aqgdel" type="button" title="Remove this goal">Remove</button></div>';
    wrap.appendChild(row);
    const p = rowParts(row);
    p.kind.innerHTML = kindOptions();
    p.kind.value = g && g.kind && (WA.quests.GOAL_KINDS || []).includes(g.kind) ? g.kind : 'kill';
    fillRowTargets(row, false);
    if (g && g.id && targetIds(p.kind.value).includes(g.id)) p.target.value = g.id;
    p.need.value = g && g.need ? g.need : 1;
    if (g && g.text) { p.text.value = g.text; row.dataset.auto = ''; }
    else suggestRow(row, true);
    p.kind.onchange = () => { fillRowTargets(row, false); suggestRow(row, true); };
    p.target.onchange = () => suggestRow(row, true);
    p.need.oninput = () => suggestRow(row, false);
    row.querySelector('.aqgdel').onclick = () => {
      if (goalRows().length < 2) { msg('A job needs at least one goal.'); return; }
      row.remove();
      pruneRemove();
    };
    pruneRemove();
    return row;
  }

  function talkingIds() {
    return Object.keys(G().entities).filter(id => {
      const d = G().entities[id];
      return d && d.talk && typeof d.talk === 'object';
    });
  }

  function defaultGiver() {
    const ids = talkingIds();
    return ids.find(id => !G().entities[id].quest) || ids[0] || '';
  }

  function fillGivers() {
    const sel = $('aqgiver');
    if (!sel) return;
    const cur = sel.value;
    const ids = talkingIds();
    sel.innerHTML = ids.map(id => option(id, G().entities[id].name || id)).join('');
    sel.value = ids.includes(cur) ? cur : (ids[0] || '');
  }

  /* A chain stays with one speaker, so only that speaker's jobs are offered as
     the prerequisite. The edited job itself is never a candidate. */
  function fillReqs(keep) {
    const sel = $('aqreq');
    if (!sel) return;
    const giver = $('aqgiver').value;
    const cur = keep ? sel.value : '';
    const ids = Object.keys(defs()).filter(id => id !== SEL && defs()[id].giver === giver);
    sel.innerHTML = '<option value="">Available from the start</option>' +
      ids.map(id => option(id, defs()[id].name || id)).join('');
    sel.value = ids.includes(cur) ? cur : '';
  }

  function fillMaps() {
    const sel = $('aqmap');
    if (!sel) return;
    const cur = sel.value;
    const ids = Object.keys(G().maps);
    sel.innerHTML = ids.map(id => option(id, G().maps[id].name || id)).join('');
    sel.value = ids.includes(cur) ? cur : (ids[0] || '');
  }

  function fillHooks(keep) {
    const sel = $('aqhook');
    if (!sel) return;
    const npc = $('aqgiver').value;
    const s = SNAP[npc];
    const nodes = (s && s.talk && s.talk.nodes) || {};
    const cur = keep ? sel.value : '';
    const names = Object.keys(nodes).filter(n => !(nodes[n] && nodes[n]._qid));
    sel.innerHTML = names.length ? names.map(n => option(n, n)).join('') : '<option value="">no pages</option>';
    sel.value = names.includes(cur) ? cur : (names.includes('greet') ? 'greet' : (names[0] || ''));
  }

  function fill() {
    const ids = Object.keys(STORE.quests);
    const sel = $('aqsel');
    if (sel) {
      sel.innerHTML = '<option value="">New job (unsaved)</option>' +
        ids.map(id => option(id, STORE.quests[id].name || id)).join('');
      sel.value = ids.includes(SEL) ? SEL : '';
    }
    const n = $('authn');
    if (n) n.textContent = ids.length ? `${ids.length} saved` : '';
  }

  function loadForm(id) {
    if (!$('aqsave')) return;
    SEL = id && STORE.quests[id] ? id : '';
    const q = SEL ? STORE.quests[SEL] : null;
    const e = SEL ? (STORE.dialogue[SEL] || {}) : {};
    const set = (k, v) => { const el = $('aq' + k); if (el) el.value = v; };
    const giver = q ? q.giver : defaultGiver();

    $('aqid').disabled = !!SEL;
    set('id', SEL);
    set('name', q ? q.name : '');
    set('text', q ? q.text : '');
    fillGivers();
    set('giver', giver);
    fillReqs(false);
    if (q && q.req) set('req', q.req);
    fillMaps();
    set('map', q && q.map ? q.map : ((WA.game.S && WA.game.S.map) || (G().maps.ruins ? 'ruins' : $('aqmap').value)));
    // One row per goal, so a job can ask for several things at once.
    for (const row of goalRows()) row.remove();
    const goals = q && Array.isArray(q.goals) && q.goals.length ? q.goals : [{ kind: 'kill', need: 1 }];
    for (const g of goals.slice(0, MAX_GOALS)) addGoal(g);
    const r = (q && q.reward) || {};
    set('caps', r.caps || (q ? 0 : 25));
    set('stims', r.stims || 0);
    set('kits', r.kits || 0);
    set('xp', r.xp || (q ? 0 : 15));
    set('karma', r.karma || 0);
    for (const row of repRows($('aqreps'))) row.remove();
    for (const f in (r.rep || {})) addRep($('aqreps'), f, r.rep[f]);
    set('ptext', e.text || '');
    set('take', q ? (e.take || '') : 'I will do it.');
    set('turn', q ? (e.turnin || '') : 'About that job...');
    set('label', e.label || (q ? '' : 'Got any work?'));
    // Alternate turn-ins: one row per outcome, so a job can keep several.
    for (const row of altRows()) row.remove();
    const labels = {};
    for (const a of entryAlts(e)) if (a && a.id) labels[a.id] = a.label || '';
    const qalts = (q && q.alts) || {};
    for (const aid of Object.keys(qalts)) addAlt(flatAlt(aid, qalts[aid], labels[aid]));
    altCount();
    fillHooks(true);
    if (e.hook) set('hook', e.hook);
    msg(SEL ? `Editing "${q.name}".` : 'New job. Save runs the content check before keeping it.');
  }

  /* ---------- save and delete ---------- */
  function save() {
    if (!WA.authored) return msg('The content checker is not loaded.');
    if (!$('aqsave')) return false;
    const name = str($('aqname').value);
    if (!name) { msg('Give the job a name.'); return false; }
    const editing = !!SEL;
    let id = editing ? SEL : str($('aqid').value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) id = slug(name);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) { msg('The id must start with a letter and use only a-z, 0-9 and _.'); return false; }
    if (!editing && defs()[id]) { msg(`"${id}" is already used by "${defs()[id].name}".`); return false; }
    const giver = $('aqgiver').value;
    const gd = G().entities[giver];
    if (!gd) { msg('Pick a giver.'); return false; }
    if (!gd.talk || typeof gd.talk !== 'object') { msg(`${gd.name} has no dialogue tree to hang a job on.`); return false; }
    const goals = [];
    const seenGoals = new Set();
    for (const row of goalRows()) {
      const p = rowParts(row);
      if (!p.target.value) { msg('Pick a target for every goal.'); return false; }
      const kind = p.kind.value, target = p.target.value, need = int(p.need.value, 1, 999);
      const key = kind + ':' + target;
      if (seenGoals.has(key)) { msg('Two goals ask for the same thing. Pick a different target.'); return false; }
      seenGoals.add(key);
      goals.push({
        kind,
        id: target,
        need,
        text: (str(p.text.value) || autoGoalText(kind, target, need)).slice(0, 80)
      });
    }
    if (!goals.length) { msg('A job needs at least one goal.'); return false; }
    const brief = str($('aqtext').value) || `Work for ${gd.name}.`;
    const reward = {};
    const addNum = (k, lo, hi, fallback) => {
      const v = int($('aq' + k).value, lo, hi);
      if (v || fallback) reward[k] = v || fallback;
    };
    addNum('caps', 0, 99999, 0);
    addNum('stims', 0, 99, 0);
    addNum('kits', 0, 99, 0);
    addNum('xp', 0, 99999, 0);
    addNum('karma', -99, 99, 0);
    const reps = collectReps($('aqreps'));
    if (reps.error) { msg(reps.error); return false; }
    if (Object.keys(reps.rep).length) reward.rep = reps.rep;
    if (!Object.keys(reward).length) { msg('A job needs a reward: caps, supplies, XP, karma or standing.'); return false; }
    const q = {
      name: name.slice(0, 40),
      giver,
      map: $('aqmap').value || 'ruins',
      text: brief.slice(0, 240),
      goals,
      reward
    };
    const req = $('aqreq').value;
    if (req) {
      if (req === id) { msg('A job cannot unlock from itself.'); return false; }
      if (!defs()[req]) { msg(`"${req}" is not a job.`); return false; }
      if (defs()[req].giver !== giver) { msg('A job can only unlock work from its own giver.'); return false; }
      q.req = req;
    }
    const bad = WA.quests.checkAuthored(id, q);
    if (bad.length) {
      msg(bad.join('; ').replace(new RegExp('^quest ' + id + ': '), ''));
      return false;
    }
    const take = str($('aqtake').value).slice(0, 60);
    const turnin = str($('aqturn').value).slice(0, 60);
    if (!take && !turnin) { msg('The talk page needs an accept option, a hand-in option, or both.'); return false; }
    const hook = $('aqhook').value;
    if (hook && !(gd.talk.nodes || {})[hook]) { msg(`"${hook}" is not a page on ${gd.name}.`); return false; }
    // Alternate hand-ins: every row becomes a quest outcome and a page option.
    const alts = Object.assign({}, (SEL && STORE.quests[SEL] && STORE.quests[SEL].alts) || {});
    const oldIds = new Set(Object.keys(alts));
    const altDefs = [];
    const usedAlt = new Set();
    for (const row of altRows()) {
      const p = altParts(row);
      const altLabel = str(p.label.value).slice(0, 60);
      const altName = str(p.name.value).slice(0, 40);
      const altDone = str(p.done.value).slice(0, 240);
      const altId = str(p.id.value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'alt';
      if (!/^[a-z][a-z0-9_]*$/.test(altId)) { msg('An outcome id must start with a letter and use only a-z, 0-9 and _.'); return false; }
      if (usedAlt.has(altId)) { msg(`Two alternate outcomes use the id "${altId}".`); return false; }
      if (!altLabel) { msg('Give every alternate outcome a hand-in label.'); return false; }
      if (!altName) { msg('Give every alternate outcome a name for the Pip-Boy card.'); return false; }
      if (!altDone) { msg('Give every alternate outcome a line to show when it is chosen.'); return false; }
      if (!turnin) { msg('Alternate outcomes need the normal hand-in option too.'); return false; }
      usedAlt.add(altId);
      const r = {};
      const ac = int(p.caps.value, 0, 99999); if (ac) r.caps = ac;
      const ax = int(p.xp.value, 0, 99999); if (ax) r.xp = ax;
      const ak = int(p.karma.value, -99, 99); if (ak) r.karma = ak;
      const reps = collectReps(p.reps);
      if (reps.error) { msg(reps.error); return false; }
      if (Object.keys(reps.rep).length) r.rep = reps.rep;
      alts[altId] = { name: altName, reward: r, done: altDone };
      altDefs.push({ id: altId, label: altLabel });
    }
    for (const aid of oldIds) if (!usedAlt.has(aid)) delete alts[aid];
    if (Object.keys(alts).length) q.alts = alts;
    const entry = {
      npc: giver,
      node: PAGE(id),
      hook: hook || '',
      text: (str($('aqptext').value) || brief).slice(0, 240),
      take,
      turnin,
      label: str($('aqlabel').value).slice(0, 60) || 'Got any work?'
    };
    if (altDefs.length) { entry.alts = altDefs; entry.alt = altDefs[0]; }

    // Apply, run the corpus check, and keep the job only if nothing new broke.
    const before = new Set(WA.authored.check().errors);
    const notesAt = WA.authored.MERGE.length;
    const oldQ = STORE.quests[id], oldD = STORE.dialogue[id], oldDef = defs()[id];
    const oldNpc = oldD && oldD.npc;
    snap(giver);
    if (oldNpc) snap(oldNpc);
    STORE.quests[id] = q;
    STORE.dialogue[id] = entry;
    defs()[id] = q;
    syncExtra();
    rebuild(giver);
    if (oldNpc && oldNpc !== giver) rebuild(oldNpc);
    const r = WA.authored.check();
    const fresh = r.errors.filter(x => !before.has(x));
    if (fresh.length) {
      if (oldQ) STORE.quests[id] = oldQ; else delete STORE.quests[id];
      if (oldD) STORE.dialogue[id] = oldD; else delete STORE.dialogue[id];
      if (oldDef) defs()[id] = oldDef; else delete defs()[id];
      WA.authored.MERGE.length = notesAt;
      syncExtra();
      rebuild(giver);
      if (oldNpc && oldNpc !== giver) rebuild(oldNpc);
      report(WA.authored.report());
      msg(`Not saved — ${fresh.length} content error${fresh.length === 1 ? '' : 's'}: ${fresh[0]}`);
      return false;
    }
    saveStore();
    SEL = id;
    fill();
    loadForm(id);
    browse();
    report(WA.authored.report());
    msg(`Saved "${q.name}" — ${WA.authored.summary()}.`);
    return true;
  }

  function remove() {
    if (!SEL) { msg('Pick a saved job to delete.'); return false; }
    const id = SEL, q = STORE.quests[id], e = STORE.dialogue[id] || {};
    const npc = e.npc || (q && q.giver);
    delete STORE.quests[id];
    delete STORE.dialogue[id];
    delete defs()[id];
    syncExtra();
    if (npc) { snap(npc); rebuild(npc); }
    saveStore();
    const left = Object.keys(STORE.quests);
    SEL = left[0] || '';
    fill();
    loadForm(SEL);
    report(WA.authored.report());
    browse();
    msg(`Deleted "${q ? q.name : id}".`);
    return true;
  }

  /* ---------- export ---------- */
  const ident = k => /^[a-zA-Z_$][\w$]*$/.test(k);
  // Single-quoted literals, matching the hand-written content file.
  const lit = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";

  function jsValue(v, ind) {
    const pad = '  '.repeat(ind);
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return lit(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (!v.some(x => x && typeof x === 'object')) {
        const one = '[' + v.map(x => jsValue(x, 0)).join(', ') + ']';
        if (pad.length + one.length <= 78) return one;
      }
      return '[\n' + v.map(x => pad + '  ' + jsValue(x, ind + 1)).join(',\n') + '\n' + pad + ']';
    }
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    if (!keys.some(k => v[k] && typeof v[k] === 'object')) {
      const one = '{ ' + keys.map(k => (ident(k) ? k : lit(k)) + ': ' + jsValue(v[k], 0)).join(', ') + ' }';
      if (pad.length + one.length <= 78) return one;
    }
    return '{\n' + keys.map(k => pad + '  ' + (ident(k) ? k : lit(k)) + ': ' + jsValue(v[k], ind + 1)).join(',\n') + '\n' + pad + '}';
  }

  /* Generated pages as real source: the `if` predicates are c.q(id) checks,
     which the runtime patch would otherwise have to rebuild from the store. */
  function dialogueSource() {
    const npcs = {};
    for (const qid of Object.keys(STORE.dialogue)) {
      if (!STORE.quests[qid]) continue;
      const e = STORE.dialogue[qid];
      if (!e || !e.npc) continue;
      const g = npcs[e.npc] || (npcs[e.npc] = { nodes: {}, add: {} });
      const page = e.node || PAGE(qid);
      const opts = [];
      if (e.take) opts.push(`{ t: ${lit(e.take)}, fx: { quest: ['take', ${lit(qid)}] }, to: ${lit(page)}, if: c => c.q(${lit(qid)}) === 'none' }`);
      if (e.turnin) opts.push(`{ t: ${lit(e.turnin)}, fx: { quest: ['turnin', ${lit(qid)}] }, to: ${lit(page)}, if: c => c.q(${lit(qid)}) === 'ready' }`);
      for (const a of entryAlts(e)) {
        if (!a || !a.id || !a.label) continue;
        opts.push(`{ t: ${lit(a.label)}, fx: { quest: ['turnin', ${lit(qid)}, ${lit(a.id)}] }, to: ${lit(page)}, if: c => c.q(${lit(qid)}) === 'ready' }`);
      }
      opts.push("{ t: 'Back', to: '@' }");
      g.nodes[page] = [
        '{',
        `        text: ${lit(e.text || 'Work is work.')},`,
        '        opts: [',
        opts.map(o => '          ' + o).join(',\n'),
        '        ]',
        '      }'
      ].join('\n');
      if (e.hook && e.label) {
        (g.add[e.hook] || (g.add[e.hook] = [])).push(`{ t: ${lit(e.label)}, to: ${lit(page)}, if: c => c.q(${lit(qid)}) !== 'locked' }`);
      }
    }
    const out = [];
    for (const npc of Object.keys(npcs)) {
      const g = npcs[npc];
      const nodes = Object.keys(g.nodes).map(n => `      ${ident(n) ? n : lit(n)}: ${g.nodes[n]}`).join(',\n');
      const add = Object.keys(g.add)
        .map(k => `      ${ident(k) ? k : lit(k)}: [\n        ${g.add[k].join(',\n        ')}\n      ]`)
        .join(',\n');
      out.push(`  ${ident(npc) ? npc : lit(npc)}: {\n    nodes: {\n${nodes}\n    }` +
        (add ? `,\n    add: {\n${add}\n    }` : '') + '\n  }');
    }
    return out.join(',\n');
  }

  function exportText() {
    const ids = Object.keys(STORE.quests);
    if (!ids.length) return '';
    const quests = {};
    for (const id of ids) quests[id] = STORE.quests[id];
    const stamp = new Date().toISOString().slice(0, 10);
    const lines = [
      `/* Forge export — ${ids.length} job${ids.length === 1 ? '' : 's'}, ${stamp}.`,
      '   Paste at the end of js/data/quests-authored.js, after the existing',
      '   WA.AUTHORED_QUESTS and WA.AUTHORED_DIALOGUE objects, then reload. A job',
      '   that ships from the file drops out of the browser store on the next boot. */',
      `Object.assign(WA.AUTHORED_QUESTS, ${jsValue(quests, 0)});`,
      ''
    ];
    const dl = dialogueSource();
    if (dl) {
      lines.push(
        '/* Merge talk pages per speaker, so a hand-written patch keeps its own. */',
        '(function (D) {',
        '  WA.AUTHORED_DIALOGUE = WA.AUTHORED_DIALOGUE || {};',
        '  for (const npc in D) {',
        '    const p = WA.AUTHORED_DIALOGUE[npc] || (WA.AUTHORED_DIALOGUE[npc] = { nodes: {}, add: {} });',
        '    p.nodes = Object.assign(p.nodes || {}, D[npc].nodes);',
        '    p.add = p.add || {};',
        '    for (const page in D[npc].add) p.add[page] = (p.add[page] || []).concat(D[npc].add[page]);',
        '  }',
        '})({',
        dl,
        '});'
      );
    }
    return lines.join('\n');
  }

  function exportAuthored() {
    const text = exportText();
    const n = Object.keys(STORE.quests).length;
    if (!text) { msg('No saved jobs to export yet.'); return false; }
    if ($('fio')) { $('fio').value = text; $('fio').select(); }
    const done = () => msg(`Exported ${n} job${n === 1 ? '' : 's'} — paste at the end of js/data/quests-authored.js.`);
    try {
      navigator.clipboard.writeText(text).then(done, () => msg(`Exported ${n} job${n === 1 ? '' : 's'} below; select and copy it.`));
    } catch (e) {
      msg(`Exported ${n} job${n === 1 ? '' : 's'} below; select and copy it.`);
    }
    return true;
  }

  /* ---------- read-only browser ----------
     Every job in the live content, grouped by speaker, with the talk pages that
     take or hand it in. Nothing here writes: conditions and conditional text
     are shown as source, because a read-only view cannot pick a quest state. */

  /* Strip the block indentation a function keeps from the content file. */
  function dedent(text) {
    const lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n');
    if (lines.length < 2) return (lines[0] || '').trim();
    const indents = lines.slice(1).filter(l => l.trim()).map(l => (l.match(/^\s*/) || [''])[0].length);
    const drop = indents.length ? Math.min.apply(null, indents) : 0;
    return [lines[0].trim()].concat(lines.slice(1).map(l => l.slice(drop))).join('\n').trim();
  }

  const srcText = v => (typeof v === 'function' ? dedent(String(v)) : String(v == null ? '' : v));
  const flat = v => srcText(v).replace(/\s+/g, ' ');

  const giverName = id => {
    const d = G().entities[id];
    return d ? (d.name || id) : (id || 'no giver');
  };

  function jobSource(id) {
    if (STORE.quests[id]) return 'this browser';
    if (WA.AUTHORED_QUESTS && WA.AUTHORED_QUESTS[id]) return 'quests-authored.js';
    return 'built in';
  }

  function rewardLine(r) {
    if (!r) return 'none';
    const bits = [];
    if (r.caps) bits.push(`${r.caps} caps`);
    if (r.stims) bits.push(`${r.stims} stimpak${r.stims === 1 ? '' : 's'}`);
    if (r.kits) bits.push(`${r.kits} repair kit${r.kits === 1 ? '' : 's'}`);
    if (r.radaways) bits.push(`${r.radaways} RadAway`);
    if (r.karma) bits.push(`${r.karma > 0 ? '+' : ''}${r.karma} karma`);
    if (r.rep) for (const f in r.rep) bits.push(`${WA.reputation ? WA.reputation.factionName(f) : f} ${r.rep[f] > 0 ? '+' : ''}${r.rep[f]}`);
    if (r.xp) bits.push(`${r.xp} base XP`);
    return bits.length ? bits.join(' · ') : 'none';
  }

  function fxLine(fx) {
    if (!fx || typeof fx !== 'object') return '';
    const bits = [];
    for (const k of Object.keys(fx)) {
      const v = fx[k];
      if (Array.isArray(v)) bits.push(`${k}: ${v.join(' ')}`);
      else if (v && typeof v === 'object') bits.push(`${k}: ${Object.keys(v).map(x => `${x}${v[x] > 0 ? '+' : ''}${v[x]}`).join(' ')}`);
      else if (v !== null && v !== false) bits.push(`${k}: ${v}`);
    }
    return bits.join(' · ');
  }

  /* The TAKE / HAND IN badge only marks options that act on the browsed job. */
  function questTag(o, id) {
    const fx = o && o.fx;
    if (!fx || !Array.isArray(fx.quest) || fx.quest[1] !== id) return '';
    return fx.quest[0] === 'take' ? 'TAKE' : 'HAND IN';
  }

  /* Only the messages that belong to this job: its quest entries, the pages it
     renders, and tree-level notes for its speaker. Everything else is counted
     in the corpus line so the panel never hides unrelated problems. */
  function problemsFor(id, giver, pages) {
    if (!WA.authored || !WA.authored.check) return { errors: [], warnings: [], total: 0 };
    const r = WA.authored.check();
    // Page messages read `rook.nest: …`, option messages `rook.nest option 2: …`.
    const pageHit = m => pages.some(p => p &&
      (m.indexOf(giver + '.' + p + ':') === 0 || m.indexOf(giver + '.' + p + ' option ') === 0));
    const keep = m => m.indexOf('quest ' + id + ':') === 0 || m.indexOf('quest ' + id + '/') === 0 ||
      pageHit(m) || m.indexOf('dialogue ' + giver + ':') === 0 || m.indexOf(giver + ': ') === 0;
    return { errors: r.errors.filter(keep), warnings: r.warnings.filter(keep), total: r.errors.length + r.warnings.length };
  }

  /* Labels and page text the job's existing options use, so a clone starts
     from the same wording. Conditional page text stays behind: the form needs
     a plain string, and the save falls back to the brief. */
  function jobDialogue(id) {
    const q = defs()[id] || {};
    const d = G().entities[q.giver];
    const nodes = (d && d.talk && d.talk.nodes) || {};
    const out = { take: '', turnin: '', alts: {}, page: '', hook: '', label: '' };
    const direct = {};
    for (const n of Object.keys(nodes)) {
      const node = nodes[n] || {};
      for (const o of node.opts || []) {
        const f = o && o.fx;
        if (!f || !Array.isArray(f.quest) || f.quest[1] !== id) continue;
        const op = f.quest[0], altId = f.quest[2];
        direct[n] = true;
        if (op === 'take' && !out.take) out.take = str(o.t);
        if (op === 'turnin' && altId) {
          if (!out.alts[altId]) out.alts[altId] = str(o.t);
        } else if (op === 'turnin' && !out.turnin) out.turnin = str(o.t);
        if (!out.page && typeof node.text === 'string') out.page = node.text;
      }
    }
    // Where the job page is reached from: a hook on greet is preferred.
    for (const n of Object.keys(nodes)) {
      for (const o of (nodes[n] || {}).opts || []) {
        if (!o || typeof o.to !== 'string' || !direct[o.to] || n === o.to) continue;
        if (!out.hook || n === 'greet') { out.hook = n; out.label = str(o.t); }
      }
    }
    return out;
  }

  /* A copy is always unsaved: fields are loaded into an empty form, the id is
     left blank so Save generates one, and the shipped job is never touched. */
  function cloneJob(id) {
    const q = defs()[id];
    if (!q) { msg('Pick a job to clone.'); return false; }
    const gd = G().entities[q.giver];
    if (!gd || !gd.talk) { msg('That job\'s giver has no dialogue tree to hang a copy on.'); return false; }
    const dlg = jobDialogue(id);
    const set = (k, v) => { const el = $('aq' + k); if (el) el.value = v; };

    loadForm('');
    set('name', ((q.name || id) + ' copy').slice(0, 40));
    fillGivers();
    set('giver', q.giver);
    fillHooks(); fillReqs(false);
    set('map', q.map || '');
    set('text', q.text || '');
    for (const row of goalRows()) row.remove();
    (q.goals || []).forEach(g => addGoal({ kind: g.kind, id: g.id, need: g.need, text: g.text }));

    const r = q.reward || {};
    set('caps', r.caps || 0);
    set('stims', r.stims || 0);
    set('kits', r.kits || 0);
    set('xp', r.xp || 0);
    set('karma', r.karma || 0);
    for (const row of repRows($('aqreps'))) row.remove();
    for (const f in (r.rep || {})) addRep($('aqreps'), f, r.rep[f]);
    if (q.req) set('req', q.req);

    set('ptext', dlg.page || '');
    set('take', dlg.take || '');
    set('turn', dlg.turnin || '');
    if (dlg.hook) { set('hook', dlg.hook); set('label', dlg.label || ''); }

    // Every alternate outcome gets a row, labelled the way its option is.
    for (const row of altRows()) row.remove();
    for (const aid of Object.keys(q.alts || {})) addAlt(flatAlt(aid, q.alts[aid], dlg.alts[aid] || ''));
    altCount();

    SEL = '';
    fill();
    const notes = [];
    if (!dlg.page) notes.push('the page text starts from the brief');
    msg(`Cloned "${q.name || id}" into a new unsaved job. Save to keep it.` + (notes.length ? ` Note: ${notes.join('; ')}.` : ''));
    $('authwrap').open = true;
    $('authwrap').scrollIntoView({ block: 'start' });
    return true;
  }

  function checkBlock(p) {
    const count = p.errors.length + p.warnings.length;
    let html = '<div class="bqsub">CHECK' + (count ? ` · ${p.errors.length} error${p.errors.length === 1 ? '' : 's'}, ${p.warnings.length} warning${p.warnings.length === 1 ? '' : 's'}` : '') + '</div>';
    if (!count) html += '<div class="bqok">No problems for this job.</div>';
    for (const e of p.errors) html += `<div class="bqerr">ERROR ${U.esc(e)}</div>`;
    for (const w of p.warnings) html += `<div class="bqwarn">WARN ${U.esc(w)}</div>`;
    if (count && p.total) html += `<div class="bqmeta">${p.total} problem${p.total === 1 ? '' : 's'} in the whole content — Validate content shows every one.</div>`;
    return html;
  }

  function textBlock(v) {
    if (typeof v === 'function') {
      return '<div class="bqcond">text is conditional</div>' +
        `<div class="bqsrc">${U.esc(srcText(v))}</div>`;
    }
    return `<div class="bqtext">${U.esc(srcText(v))}</div>`;
  }

  /* Pages generated for this job, or that take or hand it in. */
  function pagesFor(id, giver) {
    const tree = (G().entities[giver] || {}).talk;
    const nodes = (tree && tree.nodes) || {};
    return Object.keys(nodes).filter(n => {
      const node = nodes[n] || {};
      if (n === PAGE(id) || node._qid === id) return true;
      return (node.opts || []).some(o => o && o.fx && Array.isArray(o.fx.quest) && o.fx.quest[1] === id);
    });
  }

  function renderBrowse() {
    const box = $('bqout'), sel = $('bqsel');
    if (!box || !sel) return;
    const id = sel.value, q = defs()[id];
    if (!q) { box.innerHTML = '<div class="dim">No jobs to browse.</div>'; return; }
    const giver = q.giver || '';
    const tree = (G().entities[giver] || {}).talk;
    const nodes = (tree && tree.nodes) || {};
    const names = Object.keys(nodes);
    const pages = pagesFor(id, giver);

    // Incoming links, so a chained hook shows where the page is reached from.
    const inbound = {};
    for (const n of names) {
      for (const o of (nodes[n] || {}).opts || []) {
        if (!o || typeof o.to !== 'string' || o.to === '@' || o.to === n) continue;
        (inbound[o.to] || (inbound[o.to] = [])).push({ from: n, label: flat(o.t) });
      }
    }

    const goals = (q.goals || []).map(g =>
      `<div class="bqgoal"><span>${U.esc(g.text || '')}</span>` +
      `<small class="dim">${U.esc(g.kind)} ${U.esc(g.id)}${g.need > 1 ? ' ×' + g.need : ''}</small></div>`).join('');
    const alts = q.alts ? '<div class="bqsub">ALTERNATE OUTCOMES</div>' + Object.keys(q.alts).map(k => {
      const a = q.alts[k] || {};
      return `<div class="bqalt"><span class="hero">${U.esc(a.name || k)}</span>` +
        `<small class="dim">${U.esc(k)}</small>` +
        `<div class="dim">${U.esc(rewardLine(a.reward))}</div>` +
        (a.done ? `<div class="bqtext">${U.esc(a.done)}</div>` : '') + '</div>';
    }).join('') : '';

    const head = '<div class="bqjob">' +
      `<div class="hero">${U.esc(q.name || id)}</div>` +
      `<div class="bqmeta">${U.esc(id)} · ${U.esc(jobSource(id))}</div>` +
      `<div class="bqmeta">${U.esc(giverName(giver))}${q.map ? ' · ' + U.esc(q.map) : ''}` +
      `${q.req ? ' · after ' + U.esc(WA.quests.name(q.req)) + ' (' + U.esc(q.req) + ')' : ' · available from the start'}</div>` +
      `<div class="bqtext">${U.esc(q.text || '')}</div>` +
      '<div class="bqsub">GOALS</div>' + (goals || '<div class="dim">none</div>') +
      '<div class="bqsub">REWARD</div>' + `<div>${U.esc(rewardLine(q.reward))}</div>` + alts +
      checkBlock(problemsFor(id, giver, pages)) +
      '<div class="bqrow"><button type="button" data-bqclone="1">Clone into form</button></div>' +
      '</div>';

    const body = pages.map(n => {
      const node = nodes[n] || {};
      const opts = (node.opts || []).map(o => {
        if (!o) return '';
        const tag = questTag(o, id);
        const to = o.to === '@' ? 'leave' : (o.to || (o.close ? 'close' : ''));
        const extra = [];
        if (o.check) extra.push(Array.isArray(o.check) ? `check ${o.check[0]} ${o.check[1]}` : `check ${o.check.skill || '?'} ${o.check.difficulty || '?'}`);
        if (o.pass && o.pass.to) extra.push(`pass → ${o.pass.to}`);
        if (o.fail && o.fail.to) extra.push(`fail → ${o.fail.to}`);
        const fx = fxLine(o.fx), cond = o.if ? flat(o.if) : '';
        return '<div class="bqopt">' +
          (tag ? `<span class="bqtag">${tag}</span>` : '') +
          `<span>${U.esc(flat(o.t) || '(no label)')}</span>` +
          (to ? `<span class="dim">→ ${U.esc(to)}</span>` : '') +
          (fx ? `<span class="bqfx">${U.esc(fx)}</span>` : '') +
          (extra.length ? `<span class="bqcond">${U.esc(extra.join(' · '))}</span>` : '') +
          (cond ? `<span class="bqcond">if ${U.esc(cond)}</span>` : '') +
          '</div>';
      }).join('');
      const note = [node._qid === id ? 'job page' : '', node.once ? `once: ${node.once}` : '',
        node.log ? `log: ${node.log}` : ''].filter(Boolean).join(' · ');
      const from = (inbound[n] || []).map(x => `${x.from}${x.label ? ` ("${x.label}")` : ''}`).join(', ');
      return '<div class="bqpage">' +
        `<div class="hero">${U.esc(n)}</div>` +
        (note ? `<div class="bqmeta">${U.esc(note)}</div>` : '') +
        textBlock(node.text) +
        (opts || '<div class="dim">No options.</div>') +
        (from ? `<div class="bqfrom">Reached from ${U.esc(from)}</div>` : '') +
        '</div>';
    }).join('') || `<div class="dim" style="font-size:12px;margin-top:6px">No page on ${U.esc(giverName(giver))} takes or hands in this job.</div>`;

    const root = tree && tree.root;
    const dialogue = '<div class="bqsub">DIALOGUE · ' + U.esc(giverName(giver)) +
      (tree ? ` · ${names.length} page${names.length === 1 ? '' : 's'}` : '') + '</div>' +
      (tree
        ? `<div class="bqfrom">Root: ${root ? U.esc(flat(root)) : 'greet'}</div>` + body
        : '<div class="dim">This speaker has no dialogue tree.</div>');

    box.innerHTML = head + dialogue;
  }

  function fillBrowse(keep) {
    const sel = $('bqsel');
    if (!sel) return;
    const cur = keep !== undefined ? keep : sel.value;
    const groups = {}, order = [];
    for (const id of Object.keys(defs())) {
      const g = defs()[id].giver || '';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(id);
    }
    order.sort((a, b) => giverName(a).localeCompare(giverName(b)));
    sel.innerHTML = order.map(g => `<optgroup label="${U.esc(giverName(g))}">` +
      groups[g].map(id => option(id, defs()[id].name || id)).join('') + '</optgroup>').join('');
    if (defs()[cur]) sel.value = cur;
    else if (sel.options.length) sel.value = sel.options[0].value;
    const n = $('bqn');
    if (n) n.textContent = `${Object.keys(defs()).length} jobs`;
  }

  /* Page → job map, so a message like `rook.nest option 3: …` can point at
     the job whose page it names instead of at the speaker's whole tree. */
  function problemIndex() {
    const map = {};
    for (const id of Object.keys(defs())) {
      const giver = defs()[id].giver || '';
      for (const pg of pagesFor(id, giver)) {
        const key = giver + '.' + pg;
        (map[key] || (map[key] = [])).push(id);
      }
    }
    return map;
  }

  /* The job a message names: `quest walls: …` names one directly,
     `rook.nest: …` names one through the giver's page. */
  function problemTarget(m, index) {
    let hit = /^quest ([^:\/ ]+)(?:\/[^: ]+)?:/.exec(m);
    if (hit) return defs()[hit[1]] ? hit[1] : '';
    hit = /^(?:dialogue )?([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)(?: option \d+)?:/.exec(m);
    if (!hit) return '';
    const ids = index[hit[1] + '.' + hit[2]] || [];
    if (ids.length === 1) return ids[0];
    // A page two jobs share only points at one of them when it is its own page.
    const own = ids.filter(id => hit[2] === PAGE(id));
    return own.length === 1 ? own[0] : '';
  }

  /* Navigable lines are buttons so they work from the keyboard too; messages
     that name no job stay plain text. */
  function problemLine(cls, tag, m, index) {
    const id = problemTarget(m, index);
    const text = `${tag} ${U.esc(m)}`;
    if (!id) return `<div class="${cls}">${text}</div>`;
    return `<div class="${cls}"><button type="button" class="bqjump" data-bqjump="${U.esc(id)}"` +
      ` title="Show ${U.esc(defs()[id].name || id)} in the browser">${text}</button></div>`;
  }

  /* The whole corpus, not just the selected job. Lives outside #bqout so
     choosing another job does not collapse it. */
  function renderAllProblems() {
    const box = $('bqall'), n = $('bqalln');
    if (!box) return;
    if (!WA.authored) { box.innerHTML = '<div class="dim">The content checker is not loaded.</div>'; return; }
    const r = WA.authored.check();
    const index = problemIndex();
    const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`;
    const head = r.ok
      ? `Content check OK — ${plural(r.quests, 'quest')}, ${plural(r.dialogues, 'dialogue tree')}, ${plural(r.pages, 'page')}, ${plural(r.warnings.length, 'warning')}.`
      : `Content check FAILED — ${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')}.`;
    box.innerHTML = `<div class="bqallhead ${r.ok ? 'good' : 'bad'}">${U.esc(head)}</div>` +
      r.errors.map(e => problemLine('bqerr', 'ERROR', e, index)).join('') +
      r.warnings.map(w => problemLine('bqwarn', 'WARN', w, index)).join('');
    if (n) n.textContent = (r.errors.length + r.warnings.length)
      ? `${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`
      : 'none';
  }

  /* Clicking a problem shows the job it names, so the report doubles as
     navigation. Read-only: nothing is edited or saved. */
  function jumpTo(id) {
    if (!defs()[id]) return;
    fillBrowse(id);
    renderBrowse();
    const out = $('bqout');
    if (out) out.scrollIntoView({ block: 'start' });
  }

  /* Called when the Forge tab opens, after the authored patches are merged. */
  function browse() {
    const sel = $('bqsel');
    fillBrowse(sel ? sel.value : '');
    renderBrowse();
    renderAllProblems();
  }

  function slug(name) {
    const base = str(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'job';
    let id = base, n = 2;
    while (defs()[id] || STORE.quests[id]) id = base + '_' + n++;
    return id;
  }

  /* ---------- wiring ---------- */
  function bind() {
    if (!$('aqsave')) return;
    $('aqsel').onchange = () => { SEL = $('aqsel').value; loadForm(SEL); };
    $('aqnew').onclick = () => { SEL = ''; fill(); loadForm(''); };
    $('aqgiver').onchange = () => { fillHooks(); fillReqs(false); };
    if ($('aqgoaladd')) $('aqgoaladd').onclick = () => addGoal(null);
    if ($('aqrepadd')) $('aqrepadd').onclick = () => addRep($('aqreps'));
    if ($('aqaltadd')) $('aqaltadd').onclick = () => addAlt(null);
    if ($('bqsel')) $('bqsel').onchange = renderBrowse;
    if ($('bqallwrap')) $('bqallwrap').addEventListener('toggle', () => {
      if ($('bqallwrap').open) renderAllProblems();
    });
    if ($('bqout')) $('bqout').addEventListener('click', e => {
      if (e.target && e.target.closest && e.target.closest('[data-bqclone]')) cloneJob($('bqsel').value);
    });
    if ($('bqall')) $('bqall').addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-bqjump]') : null;
      if (b) jumpTo(b.getAttribute('data-bqjump'));
    });
    $('aqsave').onclick = save;
    $('aqdel').onclick = remove;
    if ($('aqexp')) $('aqexp').onclick = exportAuthored;
  }

  function init() {
    load();
    snapAll();
    applyQuests();
    syncExtra();
    for (const id of Object.keys(G().entities)) prune(id);
    bind();
    if (!$('aqsave')) return;
    fillGivers();
    fillMaps();
    SEL = Object.keys(STORE.quests)[0] || '';
    fill();
    loadForm(SEL);
  }

  /* The Forge's Reset all restores fresh trees, so the pristine snapshots and
     the stored dialogue must be taken again before the authored merge runs. */
  function rebase() {
    snapAll();
    syncExtra();
  }

  /* ---------- content packs ---------- */
  /* Browser-authored jobs and dialogue, ready to add to a pack. */
  function exportStore() {
    return { quests: clone(STORE.quests), dialogue: clone(STORE.dialogue) };
  }

  /* Pack content joins the browser store and is applied on the next reload.
     A shipped job wins over the incoming copy, as it does on every boot. */
  function importStore(quests, dialogue) {
    let n = 0;
    for (const id of Object.keys(quests || {})) {
      const q = quests[id];
      if (!/^[a-z][a-z0-9_]*$/.test(id) || STORE.quests[id] || defs()[id]) continue;
      if (WA.quests.checkAuthored(id, q).length) continue;
      STORE.quests[id] = q;
      n++;
    }
    for (const npc of Object.keys(dialogue || {})) {
      const patch = dialogue[npc];
      if (!npc || STORE.dialogue[npc] || !patch || typeof patch !== 'object') continue;
      STORE.dialogue[npc] = patch;
      n++;
    }
    saveStore();
    return n;
  }

  WA.authoring = { init, rebase, save, remove, loadForm, fill, exportText, browse, cloneJob,
    exportStore, importStore, store: () => STORE, SNAP };
})(window.WA = window.WA || {});
