/* Quests: small data-driven jobs with kill or delivery goals, tracked in the
   Pip-Boy and handed in through NPC dialogue. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const DEFS = {
    sentinel: {
      name: 'Silence the Sentinel',
      giver: 'mira',
      map: 'ruins',
      text: 'A rusted machine still patrols the Wasteland Ruins, scaring off trade. Mira wants it scrap.',
      goals: [{ kind: 'kill', id: 'rust_sentinel', need: 1, text: 'Destroy the Rust Sentinel' }],
      reward: { caps: 45, stims: 2, xp: 25, karma: 10, rep: { market: 12 } }
    },
    cells: {
      name: 'Spare Cells',
      giver: 'vale',
      map: 'ruins',
      text: 'Vale needs a bundle of energy cells to keep the vault door seals running.',
      goals: [{ kind: 'ammo', id: 'ammo_ecell', need: 15, text: 'Bring 15 Energy Cells' }],
      reward: { caps: 60, kits: 2, xp: 15, karma: 5, rep: { vault: 12 } },
      alts: {
        market: {
          name: 'Sold to the market',
          reward: { caps: 50, xp: 15, karma: -5, rep: { market: 8, vault: -12 } },
          done: "You hand Vale's cells to a market buyer. The vault seals stay dry."
        }
      }
    },
    power: {
      name: 'Power in the Ruins',
      giver: 'keeper',
      map: 'ruins',
      text: 'The ruins market has gone dark. Keeper Ada needs the old generator repaired before the traders give up on the place.',
      goals: [{ kind: 'repair', id: 'generator_broken', need: 1, text: 'Repair the ruins generator' }],
      reward: { caps: 40, kits: 1, xp: 20, karma: 8, rep: { market: 10 } },
      alts: {
        cut: {
          name: 'Took a cut',
          reward: { caps: 70, xp: 20, karma: -6, rep: { market: -10 } },
          done: 'Ada pays your cut without a word. The market will remember the price.'
        }
      }
    },
    // The party gate: Ash only joins after Rivet is dead and this is turned in.
    rivet: {
      name: 'Blood on the Road',
      giver: 'ash',
      map: 'ruins',
      text: "A raider called Rivet ambushed Ash's caravan and left the guard for dead. Rivet is camped in the south-east of the ruins.",
      goals: [{ kind: 'kill', id: 'raider_rivet', need: 1, text: 'Kill Rivet' }],
      reward: { stims: 1, xp: 30, karma: 8, rep: { road: 12 } },
      alts: {
        greed: {
          name: 'Pressed Ash for caps',
          reward: { caps: 35, xp: 30, karma: -4, rep: { road: -8 } },
          done: 'Ash counts out the difference. The road will hear how you collect.'
        }
      }
    }
  };

  const GOAL_KINDS = ['kill', 'ammo', 'item', 'repair'];

  /* Authored jobs come from js/data/quests-authored.js. A definition that does
     not read structurally is skipped with a reason rather than half-loading;
     WA.authored.check() does the deeper cross-reference pass. */
  function checkAuthored(id, q) {
    const bad = [];
    if (!/^[a-z][a-z0-9_]*$/.test(id)) bad.push(`${id}: id must be lowercase letters, digits and underscores`);
    if (!q || typeof q !== 'object') return bad.concat(`${id}: definition must be an object`);
    if (!q.name || typeof q.name !== 'string') bad.push(`${id}: missing name`);
    if (!q.giver) bad.push(`${id}: missing giver`);
    if (q.req !== undefined) {
      if (typeof q.req !== 'string' || !q.req) bad.push(`${id}: unlock job must be a quest id`);
      else if (q.req === id) bad.push(`${id}: a job cannot unlock from itself`);
    }
    if (!Array.isArray(q.goals) || !q.goals.length) bad.push(`${id}: needs at least one goal`);
    for (const g of q.goals || []) {
      if (!g || !GOAL_KINDS.includes(g.kind)) bad.push(`${id}: goal kind must be ${GOAL_KINDS.join(', ')}`);
      else if (!g.id) bad.push(`${id}: ${g.kind} goal needs an id`);
      if (!(g && g.need > 0)) bad.push(`${id}: goal need must be above 0`);
      if (!(g && g.text)) bad.push(`${id}: goal needs text`);
    }
    if (!q.reward || typeof q.reward !== 'object') bad.push(`${id}: missing reward`);
    return bad;
  }

  const PROBLEMS = [];
  (function loadAuthored() {
    const src = WA.AUTHORED_QUESTS;
    if (!src || typeof src !== 'object') return;
    for (const id of Object.keys(src)) {
      if (DEFS[id]) { PROBLEMS.push(`quest ${id}: id is already used by a built-in quest`); continue; }
      const bad = checkAuthored(id, src[id]);
      if (bad.length) PROBLEMS.push(...bad);
      else DEFS[id] = src[id];
    }
  })();

  /* A validated job from a content pack. Shipped jobs and earlier packs win, so
     a pack cannot silently replace a job the game already knows. */
  function adopt(id, q) {
    if (!id || DEFS[id] || typeof id !== 'string') return false;
    if (checkAuthored(id, q).length) return false;
    DEFS[id] = q;
    return true;
  }

  const has = id => !!DEFS[id];
  const nameOf = id => (DEFS[id] ? DEFS[id].name : id);
  const state = id => { const s = S(); return s && s.quests ? s.quests[id] : null; };
  const alt = id => (state(id) || {}).alt || '';

  /* A job can wait on another job being handed in. `req` names that job; until
     it is done the follow-up is locked and no dialogue offers it. A missing
     prerequisite or a loop never unlocks, while a save that already took the
     job keeps it playable. */
  function unlocked(id) {
    const seen = new Set([id]);
    let req = DEFS[id] && DEFS[id].req;
    while (req) {
      if (seen.has(req)) return false;
      seen.add(req);
      const st = state(req);
      if (!st || st.st !== 'done') return false;
      req = (DEFS[req] || {}).req;
    }
    return true;
  }

  /* Progress lives per goal, so one job can ask for several things at once.
     Saves from before that only hold `n`, read as the first counted goal's
     progress; killing or repairing writes the per-goal map and keeps `n` as a
     copy of that first counter for older saves. */
  const goalIndex = (id, g, i) => (i != null ? i : (DEFS[id] ? DEFS[id].goals.indexOf(g) : -1));
  function prog(st, i) {
    if (!st) return 0;
    if (st.p && typeof st.p === 'object') return (st.p[i] | 0);
    return st.n | 0;
  }
  const firstCounted = id => DEFS[id].goals.findIndex(x => x.kind === 'kill' || x.kind === 'repair');

  function bump(id, i, g) {
    const st = state(id);
    if (!st) return 0;
    const first = firstCounted(id);
    if (!st.p || typeof st.p !== 'object') {
      st.p = {};
      if (first >= 0) st.p[first] = st.n | 0;
    }
    st.p[i] = Math.min(g.need, (st.p[i] | 0) + 1);
    if (first >= 0) st.n = st.p[first] | 0;
    return st.p[i];
  }

  function count(id, g, i) {
    const s = S();
    if (!s) return 0;
    if (g.kind === 'kill' || g.kind === 'repair') {
      return Math.min(g.need, prog(state(id), goalIndex(id, g, i)));
    }
    if (g.kind === 'ammo') return Math.min(g.need, (s.ammo && s.ammo[g.id]) | 0);
    if (g.kind === 'item') return Math.min(g.need, (s.inv || []).filter(x => x === g.id).length);
    return 0;
  }

  const met = id => DEFS[id].goals.every((g, i) => count(id, g, i) >= g.need);

  function status(id) {
    const st = state(id);
    if (!st) return unlocked(id) ? 'none' : 'locked';
    if (st.st === 'done') return 'done';
    return met(id) ? 'ready' : 'active';
  }

  function take(id) {
    const s = S();
    if (!s || !DEFS[id] || state(id)) return false;
    if (!unlocked(id)) { WA.game.say(`${DEFS[id].name} is not on offer yet. Finish the job before it first.`); return false; }
    if (!s.quests) s.quests = {};
    s.quests[id] = { st: 'active', n: 0, p: {} };
    WA.game.say(`New quest: ${DEFS[id].name}.`);
    return true;
  }

  /* One kill or repair can count towards several goals of the same job, each
     with its own counter. */
  function credit(kind, target) {
    const s = S();
    if (!s || !target) return;
    for (const qid in DEFS) {
      if (status(qid) !== 'active') continue;
      DEFS[qid].goals.forEach((goal, i) => {
        if (goal.kind !== kind || goal.id !== target) return;
        const n = bump(qid, i, goal);
        WA.game.say(n >= goal.need ? `${goal.text} — done.` : `${goal.text}: ${n}/${goal.need}.`);
      });
    }
  }

  const onKill = e => { if (e && e.d) credit('kill', e.id); };
  const onRepair = id => credit('repair', id);

  function rewardText(r) {
    const bits = [];
    if (r.caps) bits.push(`${r.caps} caps`);
    if (r.stims) bits.push(`${r.stims} stimpak${r.stims > 1 ? 's' : ''}`);
    if (r.kits) bits.push(`${r.kits} repair kit${r.kits > 1 ? 's' : ''}`);
    if (r.karma) bits.push(`${r.karma > 0 ? '+' : ''}${r.karma} karma`);
    if (r.rep && WA.reputation) {
      for (const id in r.rep) {
        bits.push(`${WA.reputation.factionName(id)} ${r.rep[id] > 0 ? '+' : ''}${r.rep[id]}`);
      }
    }
    if (r.xp) bits.push(`${WA.scale.questXp(r.xp, S().lvl)} XP`);
    return bits.join(', ');
  }

  function turnIn(id, altId) {
    const s = S();
    if (!s || !DEFS[id] || status(id) !== 'ready') return false;
    const q = DEFS[id];
    const altDef = altId && q.alts ? q.alts[altId] : null;
    if (altId && !altDef) return false;
    // Spend whatever the job asked for.
    for (const g of q.goals) {
      if (g.kind === 'ammo') s.ammo[g.id] = Math.max(0, (s.ammo[g.id] | 0) - g.need);
      if (g.kind === 'item') {
        for (let i = 0; i < g.need; i++) {
          const k = (s.inv || []).indexOf(g.id);
          if (k >= 0) s.inv.splice(k, 1);
        }
        if (s.weapon === g.id && !s.inv.includes(g.id)) s.weapon = null;
        if (s.armor === g.id && !s.inv.includes(g.id)) s.armor = null;
      }
    }
    const r = altDef ? altDef.reward : (q.reward || {});
    const lvl = s.lvl;
    if (r.caps) s.caps += r.caps;
    if (r.stims) s.stims = (s.stims | 0) + r.stims;
    if (r.kits) s.kits = (s.kits | 0) + r.kits;
    const st0 = state(id) || {};
    s.quests[id] = { st: 'done', n: st0.n | 0, p: Object.assign({}, st0.p || {}), alt: altId || undefined };
    // A finished job no longer has an objective to walk to.
    if (s.wp === id) s.wp = '';
    if (WA.reputation) WA.reputation.adjust({ karma: r.karma, rep: r.rep, why: q.name });
    WA.game.say(altDef
      ? `${altDef.done} ${rewardText(r)}.`
      : `Quest complete: ${q.name}. ${rewardText(r)}.`);
    // Handing this job in is what opens a follow-up from the same speaker.
    const open = Object.keys(DEFS).filter(x => DEFS[x].req === id && status(x) === 'none');
    if (open.length) {
      const who = WA.GAME.entities[q.giver];
      WA.game.say(`New job${open.length > 1 ? 's' : ''} from ${who ? who.name : q.giver}: ${open.map(nameOf).join(', ')}.`);
    }
    if (WA.party) WA.party.react();
    if (r.xp && WA.char) WA.char.gainXp(WA.scale.questXp(r.xp, lvl));
    if (id === 'sentinel' && WA.ending) WA.ending.trigger();
    return true;
  }

  /* ---------- waypoint ---------- */
  /* One live job can be the map's navigational target. The choice is saved,
     and a job that is done or no longer live simply stops producing one. */
  function waypointId() {
    const s = S();
    const id = s && s.wp;
    if (!id || !DEFS[id]) return '';
    const st = status(id);
    return st === 'active' || st === 'ready' ? id : '';
  }

  function waypoint() {
    const id = waypointId();
    if (!id) return null;
    const s = S(), q = DEFS[id], st = status(id);
    const goals = q.goals || [];
    const giver = (s.ents || []).find(e => e && e.id === q.giver && !e.dead && (e.hp === undefined || e.hp > 0));
    const deliver = goals.some(g => g.kind === 'ammo' || g.kind === 'item');
    const at = (x, y, text, kind) => {
      // Straight-line grid steps and an 8-way bearing; no path is walked.
      const dx = x - s.px, dy = y - s.py;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      const dir = d ? (dy < 0 ? 'N' : dy > 0 ? 'S' : '') + (dx > 0 ? 'E' : dx < 0 ? 'W' : '') : 'here';
      return { id, name: q.name, st, map: q.map, x, y, text, kind, dist: d, dir,
        distText: d ? `${d} tile${d === 1 ? '' : 's'} ${dir}` : 'here' };
    };
    const who = giver && giver.d ? giver.d.name : q.giver;
    // A delivery always points at its giver; so does a job that is ready to hand in.
    if (giver && (st === 'ready' || deliver)) {
      return at(giver.x, giver.y, (st === 'ready' ? 'hand in to ' : 'deliver to ') + who, 'giver');
    }
    for (const g of goals) {
      // Kill targets move, so read the live entities on this map.
      if (g.kind === 'kill') {
        const e = (s.ents || []).find(e => e && e.id === g.id && !e.dead && (e.hp === undefined || e.hp > 0));
        if (e) return at(e.x, e.y, g.text, 'kill');
      }
      // Repair objectives live on this map's grid, not on its static things list.
      if (g.kind === 'repair' && (!q.map || q.map === s.id)) {
        for (let y = 0; y < s.h; y++) {
          for (let x = 0; x < s.w; x++) {
            if (s.grid[y] && s.grid[y][x] === g.id) return at(x, y, g.text, 'repair');
          }
        }
      }
    }
    // A job whose work is on another map points there, not back at its giver.
    if (giver && (!q.map || q.map === s.id)) return at(giver.x, giver.y, 'return to ' + who, 'giver');
    return null;
  }

  /* Where a tracked job's work is when it has no target on this map: the
     job's own map first, then wherever its giver stands. */
  function waypointElsewhere() {
    const id = waypointId();
    if (!id) return null;
    const s = S(), q = DEFS[id];
    let at = q.map && q.map !== s.id ? q.map : '';
    if (!at) {
      for (const mid in WA.GAME.maps) {
        if (mid !== s.id && (WA.GAME.maps[mid].things || []).some(t => t && t[0] === q.giver)) { at = mid; break; }
      }
    }
    if (!at) return null;
    return { id, name: q.name, map: at, mapName: (WA.GAME.maps[at] || {}).name || at };
  }

  /* Toggle: choosing the job already being tracked clears the waypoint. */
  function track(id) {
    const s = S();
    if (!s || (id && !DEFS[id])) return false;
    s.wp = waypointId() === id ? '' : (id || '');
    return true;
  }

  function html() {
    const ids = Object.keys(DEFS);
    const active = ids.filter(id => status(id) === 'active' || status(id) === 'ready');
    const done = ids.filter(id => status(id) === 'done');
    const card = id => {
      const q = DEFS[id], st = status(id);
      const goals = q.goals.map(g => {
        const n = count(id, g);
        const ok = n >= g.need;
        return `<div class="prow"><span class="${ok ? 'good' : ''}">${ok ? '✓' : '·'} ${U.esc(g.text)}</span>` +
          `<small class="dim">${n}/${g.need}</small></div>`;
      }).join('');
      const tag = st === 'ready' ? '<small class="good">READY</small>' : st === 'done' ? '<small class="dim">DONE</small>' : '<small class="warn">ACTIVE</small>';
      const giver = WA.GAME.entities[q.giver] ? WA.GAME.entities[q.giver].name : '';
      const chosen = st === 'done' && q.alts ? q.alts[alt(id)] : null;
      const tracked = (S().wp || '') === id;
      const trk = st === 'active' || st === 'ready'
        ? `<button type="button" class="qtrk${tracked ? ' on' : ''}" data-track="${id}"` +
          ` title="${tracked ? 'Stop showing this job on the map' : 'Show this job on the map'}">${tracked ? '◉' : 'MAP'}</button>`
        : '';
      return `<div class="qcard"><div class="prow"><span class="hero">${U.esc(q.name)}</span>` +
        `<span class="acts" style="align-items:center">${tag}${trk}</span></div>` +
        `<div class="dim" style="font-size:12px">${U.esc(q.text)}</div>` + goals +
        `<div class="dim" style="font-size:11px">${giver ? 'From ' + U.esc(giver) : ''}${q.reward ? ' · Reward: ' + U.esc(rewardText(q.reward)) : ''}${chosen ? ' · Outcome: ' + U.esc(chosen.name) : ''}</div></div>`;
    };
    return (active.length ? active.map(card).join('') : '<div class="dim">No active jobs. Talk to people you meet.</div>') +
      (done.length ? `<div class="dim" style="font-size:12px;margin-top:8px">COMPLETED</div>` + done.map(card).join('') : '');
  }

  WA.quests = { DEFS, GOAL_KINDS, PROBLEMS, checkAuthored, has, name: nameOf, status, unlocked, take, onKill, onRepair, turnIn, html, met, count, state, alt, waypoint, waypointElsewhere, waypointId, track, adopt };
})(window.WA = window.WA || {});
