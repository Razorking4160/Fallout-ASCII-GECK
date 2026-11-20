/* Authored content. Merges the hand-written quests and dialogue from
   js/data/quests-authored.js, then checks the whole quest and dialogue corpus
   for broken links, unknown content ids, missing skills and factions, and jobs
   nobody actually offers. WA.authored.check() powers the Forge Validate button
   and the boot-time console report; invalid authored quests are skipped by the
   quest loader itself (see WA.quests.PROBLEMS). */
(function (WA) {
  'use strict';

  const MERGE = [];
  const FX_KEYS = [
    'caps', 'stims', 'kits', 'radaways', 'xp', 'trust', 'mark', 'flag', 'once',
    'quest', 'trade', 'pick', 'gamble', 'karma', 'karmaWhy', 'rep', 'repWhy',
    'recruit', 'partyCmd', 'clearBounty', 'log'
  ];
  const NUM_FX = ['caps', 'stims', 'kits', 'radaways', 'xp', 'trust', 'karma'];
  const REWARD_NUM = ['caps', 'stims', 'kits', 'radaways', 'xp', 'karma'];

  const isFn = v => typeof v === 'function';
  const str = v => typeof v === 'string';
  const G = () => WA.GAME;
  const quests = () => (WA.quests && WA.quests.DEFS) || {};
  const kinds = () => (WA.quests && WA.quests.GOAL_KINDS) || ['kill', 'ammo', 'item', 'repair'];
  const isFaction = id => !!(WA.reputation && WA.reputation.FACTIONS[id]);

  /* ---------- merge ---------- */
  function note(msg) { MERGE.push(msg); }

  /* Merge one patch into a live tree. Merging is idempotent: pages are replaced
     by name, and added options carry an `_auth` key so a copy of the tree that
     survived in a Forge override does not collect duplicates. */
  function mergePatch(id, patch) {
    const d = G().entities[id];
    if (!d) { note(`dialogue ${id}: no entity with that id`); return false; }
    if (!d.talk || typeof d.talk !== 'object') { note(`dialogue ${id}: entity has no dialogue tree to patch`); return false; }
    if (!patch || typeof patch !== 'object') { note(`dialogue ${id}: patch must be an object`); return false; }
    if (!d.talk.nodes) d.talk.nodes = {};
    if (patch.quest) d.quest = patch.quest;
    if (patch.root) d.talk.root = patch.root;
    for (const n of Object.keys(patch.nodes || {})) d.talk.nodes[n] = patch.nodes[n];
    for (const n of Object.keys(patch.add || {})) {
      const node = d.talk.nodes[n];
      if (!node) { note(`dialogue ${id}: cannot add options to missing page "${n}"`); continue; }
      const opts = Array.isArray(node.opts) ? node.opts : (node.opts = []);
      const extra = [];
      (patch.add[n] || []).forEach((o, i) => {
        if (!o) return;
        if (!o._auth) o._auth = `${id}:${n}:${i}`;
        if (opts.some(x => x === o || (x && x._auth === o._auth))) return;
        extra.push(o);
      });
      // Insert before the closing buttons so Leave stays the last way out.
      let at = opts.length;
      while (at > 0 && opts[at - 1] && opts[at - 1].close) at--;
      opts.splice(at, 0, ...extra);
    }
    return true;
  }

  /* Hand-written patches, then the jobs the Forge authoring form stored in this
     browser (WA.AUTHORED_STORED_DIALOGUE, set by js/editors/authoring.js). */
  function apply() {
    const base = WA.AUTHORED_DIALOGUE && typeof WA.AUTHORED_DIALOGUE === 'object' ? WA.AUTHORED_DIALOGUE : {};
    const extra = WA.AUTHORED_STORED_DIALOGUE && typeof WA.AUTHORED_STORED_DIALOGUE === 'object' ? WA.AUTHORED_STORED_DIALOGUE : {};
    const ids = Object.keys(base);
    for (const id of Object.keys(extra)) if (!ids.includes(id)) ids.push(id);
    for (const id of ids) {
      let ok = false;
      if (base[id]) ok = mergePatch(id, base[id]) || ok;
      if (extra[id]) ok = mergePatch(id, extra[id]) || ok;
      const d = G().entities[id];
      if (ok && d && d.talk) d.talk._authored = 1;
    }
  }

  /* ---------- dialogue ---------- */
  /* A context stand-in for root functions; loops/typos throw and are reported
     as warnings instead of breaking the check. */
  function stub(id) {
    const d = G().entities[id] || {};
    return {
      name: 'Tester', gender: 'male', age: 25, caps: 100, karma: 0, trust: 0, bounty: 0,
      quest: d.quest && WA.quests ? WA.quests.status(d.quest) : 'none',
      q: id => (WA.quests ? WA.quests.status(id) : 'none'),
      rep: () => 0, alt: () => '', has: () => false,
      open: true, hours: '', price: n => n
    };
  }

  function checkFx(fx, where, npc, errors, warnings) {
    if (!fx || typeof fx !== 'object' || Array.isArray(fx)) { errors.push(`${where}: fx must be an object`); return; }
    const d = G().entities[npc] || {};
    for (const k of Object.keys(fx)) if (!FX_KEYS.includes(k)) warnings.push(`${where}: unknown effect "${k}"`);
    for (const k of NUM_FX) {
      if (fx[k] !== undefined && !isFn(fx[k]) && !isFinite(+fx[k])) errors.push(`${where}: ${k} must be a number or function`);
    }
    if (fx.caps !== undefined && !isFn(fx.caps) && +fx.caps < 0) {
      warnings.push(`${where}: negative caps effect can only empty the purse; add an "if" so the option is offered only when it is affordable`);
    }
    if (fx.mark !== undefined && !G().maps[fx.mark]) errors.push(`${where}: mark "${fx.mark}" is not a map`);
    if (fx.quest !== undefined) {
      if (!Array.isArray(fx.quest) || fx.quest.length < 2) errors.push(`${where}: quest effect must be [take|turnin, id, outcome?]`);
      else {
        const [op, qid, alt] = fx.quest;
        const q = quests()[qid];
        if (op !== 'take' && op !== 'turnin') errors.push(`${where}: quest effect op "${op}" must be take or turnin`);
        if (!q) errors.push(`${where}: quest "${qid}" does not exist`);
        else {
          if (q.giver !== npc) warnings.push(`${where}: ${npc} handles "${qid}", but its giver is "${q.giver}"`);
          if (alt && !(q.alts && q.alts[alt])) errors.push(`${where}: quest "${qid}" has no outcome "${alt}"`);
          if (!alt && op === 'turnin' && q.alts && Object.keys(q.alts).length) {
            // A plain turn-in is legal even with outcomes; no complaint.
          }
        }
      }
    }
    if (fx.recruit !== undefined) {
      const a = G().entities[fx.recruit];
      if (!a || !a.ally) errors.push(`${where}: recruit "${fx.recruit}" is not an ally entity`);
      else if (a.from && a.from !== npc) warnings.push(`${where}: "${fx.recruit}" is recruited through "${a.from}"`);
    }
    if (fx.rep !== undefined) {
      if (!fx.rep || typeof fx.rep !== 'object') errors.push(`${where}: rep must be an object of faction changes`);
      else for (const f of Object.keys(fx.rep)) {
        if (!isFaction(f)) errors.push(`${where}: faction "${f}" does not exist`);
        else if (!isFinite(+fx.rep[f])) errors.push(`${where}: rep.${f} must be a number`);
      }
    }
    if (fx.trade !== undefined && !d.merchant) errors.push(`${where}: trade effect needs a merchant`);
    if (fx.pick !== undefined && !(d.carry && d.carry.length)) warnings.push(`${where}: pick effect needs pockets to reach into`);
  }

  function checkTree(id, errors, warnings) {
    const t = G().entities[id].talk;
    const nodes = t.nodes;
    const at = m => `${id}: ${m}`;
    if (!nodes || typeof nodes !== 'object' || !Object.keys(nodes).length) {
      errors.push(at('dialogue tree has no pages'));
      return 0;
    }
    if (t.root !== undefined) {
      if (str(t.root)) {
        if (!nodes[t.root]) errors.push(at(`root "${t.root}" is not a page`));
      } else if (isFn(t.root)) {
        try {
          const r = t.root(stub(id));
          if (!str(r) || !nodes[r]) errors.push(at(`root returned ${JSON.stringify(r)}, which is not a page`));
        } catch (e) {
          warnings.push(at(`root function threw: ${e.message}`));
        }
      } else errors.push(at('root must be a page id or a function'));
    }

    const nodeRef = (v, where, what) => {
      if (!str(v) || (v !== '@' && !nodes[v])) errors.push(`${where}: ${what} "${v}" is not a page`);
    };
    let pages = 0;
    for (const name of Object.keys(nodes)) {
      const n = nodes[name];
      const where = `${id}.${name}`;
      pages++;
      if (!n || typeof n !== 'object') { errors.push(`${where}: page must be an object`); continue; }
      if (!str(n.text) && !isFn(n.text)) errors.push(`${where}: text must be a string or function`);
      if (n.mark !== undefined && !G().maps[n.mark]) errors.push(`${where}: mark "${n.mark}" is not a map`);
      if (n.log !== undefined && !str(n.log)) warnings.push(`${where}: log should be a string`);
      if (n.once !== undefined && !str(n.once)) errors.push(`${where}: once must be a flag name`);
      if (!Array.isArray(n.opts) || !n.opts.length) {
        warnings.push(`${where}: no options, so the page falls back to Leave`);
        continue;
      }
      n.opts.forEach((o, i) => {
        const label = `${where} option ${i + 1}`;
        if (!o || typeof o !== 'object') { errors.push(`${label}: option must be an object`); return; }
        if (!str(o.t) && !isFn(o.t)) errors.push(`${label}: needs a label (t)`);
        if (o.to !== undefined) {
          nodeRef(o.to, label, 'destination');
          if (o.close) warnings.push(`${label}: close ignores its destination`);
        }
        if (o.if !== undefined && !isFn(o.if)) errors.push(`${label}: if must be a function`);
        if (o.cost !== undefined && !isFn(o.cost) && !isFinite(+o.cost)) errors.push(`${label}: cost must be a number or function`);
        if (o.shop && !(G().entities[id] && G().entities[id].merchant)) errors.push(`${label}: shop option needs a merchant`);

        if (o.check !== undefined) {
          const skill = Array.isArray(o.check) ? o.check[0] : (o.check && o.check.skill);
          const diff = Array.isArray(o.check) ? o.check[1] : (o.check && o.check.difficulty);
          if (!WA.skills || !WA.skills.BY[skill]) errors.push(`${label}: check skill "${skill}" does not exist`);
          if (!isFn(diff) && !(typeof diff === 'number' && diff >= 0)) errors.push(`${label}: check difficulty must be a number`);
        }
        for (const key of ['pass', 'fail']) {
          const br = o[key];
          if (br === undefined) continue;
          if (o.check === undefined) warnings.push(`${label}: ${key} branch has no check to branch from`);
          if (str(br)) nodeRef(br, label, `${key} branch`);
          else if (br && typeof br === 'object') {
            if (br.to !== undefined) nodeRef(br.to, label, `${key} destination`);
            if (br.fx !== undefined) checkFx(br.fx, `${label} ${key}`, id, errors, warnings);
          } else errors.push(`${label}: ${key} branch must be a page id or object`);
        }
        if (o.fx !== undefined) checkFx(o.fx, label, id, errors, warnings);
      });
    }
    return pages;
  }

  /* Does the speaker's tree take or turn in this job (including outcomes)? */
  function eachOption(npc, fn) {
    const d = G().entities[npc];
    if (!d || !d.talk || !d.talk.nodes) return;
    for (const name of Object.keys(d.talk.nodes)) {
      const n = d.talk.nodes[name] || {};
      for (const o of n.opts || []) {
        fn(o);
        for (const b of [o.pass, o.fail]) if (b && typeof b === 'object') fn(b);
      }
    }
  }
  function offers(npc, qid) {
    let hit = false;
    eachOption(npc, o => {
      const f = o.fx;
      if (f && Array.isArray(f.quest) && f.quest[0] === 'take' && f.quest[1] === qid) hit = true;
    });
    return hit;
  }
  function turnedInWith(npc, qid, altId) {
    let hit = false;
    eachOption(npc, o => {
      const f = o.fx;
      if (f && Array.isArray(f.quest) && f.quest[0] === 'turnin' && f.quest[1] === qid && f.quest[2] === altId) hit = true;
    });
    return hit;
  }

  /* ---------- quests ---------- */
  function checkReward(r, at, errors, warnings) {
    if (!r || typeof r !== 'object') { errors.push(`${at}: reward must be an object`); return; }
    for (const k of Object.keys(r)) {
      if (k === 'rep') {
        if (!r.rep || typeof r.rep !== 'object') { errors.push(`${at}: reward rep must be an object`); continue; }
        for (const f of Object.keys(r.rep)) {
          if (!isFaction(f)) errors.push(`${at}: reward faction "${f}" does not exist`);
          else if (!isFinite(+r.rep[f])) errors.push(`${at}: reward rep.${f} must be a number`);
        }
      } else if (!REWARD_NUM.includes(k)) {
        warnings.push(`${at}: unknown reward "${k}"`);
      } else if (!isFn(r[k]) && !isFinite(+r[k])) {
        errors.push(`${at}: reward ${k} must be a number`);
      }
    }
    if (!REWARD_NUM.some(k => r[k]) && !r.rep) warnings.push(`${at}: reward is empty`);
  }

  function checkQuest(id, q, errors, warnings) {
    const at = m => `quest ${id}: ${m}`;
    if (!q || typeof q !== 'object') { errors.push(at('definition must be an object')); return; }
    if (!str(q.name)) errors.push(at('needs a name'));
    if (!str(q.text)) errors.push(at('needs text'));
    const giver = G().entities[q.giver];
    if (!giver) errors.push(at(`giver "${q.giver}" does not exist`));
    else if (!giver.talk) errors.push(at(`giver "${q.giver}" has no dialogue tree`));
    else if (!offers(q.giver, id)) errors.push(at(`no take or turn-in option in ${q.giver}'s dialogue`));
    if (q.map === undefined) warnings.push(at('no map set, so Pip-Boy markers have nowhere to point'));
    else if (!G().maps[q.map]) errors.push(at(`map "${q.map}" does not exist`));
    if (q.req !== undefined) {
      if (!str(q.req)) errors.push(at('unlock job must be a quest id'));
      else if (q.req === id) errors.push(at('a job cannot unlock from itself'));
      else {
        const rq = quests()[q.req];
        if (!rq) errors.push(at(`unlock job "${q.req}" does not exist`));
        else if (rq.giver !== q.giver) errors.push(at(`unlock job "${q.req}" is given by "${rq.giver}", so it cannot open work from "${q.giver}"`));
        // Walk the chain: a loop would leave the job locked forever.
        const seen = new Set([id]);
        let cur = q.req;
        while (cur && quests()[cur] && !seen.has(cur)) { seen.add(cur); cur = quests()[cur].req; }
        if (cur && seen.has(cur)) errors.push(at('unlock chain loops back to this job'));
      }
    }
    if (!Array.isArray(q.goals) || !q.goals.length) errors.push(at('needs at least one goal'));
    for (const g of q.goals || []) {
      if (!g || typeof g !== 'object') { errors.push(at('goal must be an object')); continue; }
      const label = g.text || g.id || 'goal';
      if (!kinds().includes(g.kind)) { errors.push(at(`goal "${label}" kind must be ${kinds().join(', ')}`)); continue; }
      if (!(g.need > 0)) errors.push(at(`goal "${label}" needs a need above 0`));
      if (!str(g.text)) errors.push(at(`goal "${label}" needs text`));
      if (g.kind === 'kill') {
        const e = G().entities[g.id];
        if (!e) errors.push(at(`kill target "${g.id}" is not an entity`));
        else if (e.ally) errors.push(at(`kill target "${g.id}" is an ally, not a foe`));
      } else if (g.kind === 'ammo') {
        if (!G().items[g.id] || G().items[g.id].type !== 'ammo') errors.push(at(`ammo goal "${g.id}" is not ammo`));
      } else if (g.kind === 'item') {
        if (!G().items[g.id]) errors.push(at(`item goal "${g.id}" is not an item`));
      } else if (g.kind === 'repair') {
        const t = G().tiles[g.id];
        if (!t) errors.push(at(`repair goal "${g.id}" is not a tile`));
        else if (!t.repair) warnings.push(at(`repair goal "${g.id}" does not repair into another tile`));
      }
    }
    checkReward(q.reward, `quest ${id}`, errors, warnings);
    for (const aId of Object.keys(q.alts || {})) {
      const a = q.alts[aId] || {};
      if (!str(a.name)) errors.push(at(`outcome "${aId}" needs a name`));
      if (!str(a.done)) errors.push(at(`outcome "${aId}" needs done text`));
      if (a.reward !== undefined) checkReward(a.reward, `quest ${id}/${aId}`, errors, warnings);
      if (!turnedInWith(q.giver, id, aId)) warnings.push(at(`outcome "${aId}" is never offered in dialogue`));
    }
  }

  /* ---------- report ---------- */
  const uniq = list => Array.from(new Set(list));

  function check() {
    const errors = MERGE.slice();
    const warnings = [];
    const defs = quests();
    const ids = Object.keys(defs);
    if (WA.quests && WA.quests.PROBLEMS) errors.push(...WA.quests.PROBLEMS);
    for (const id of ids) checkQuest(id, defs[id], errors, warnings);
    let dialogues = 0, pages = 0;
    for (const id of Object.keys(G().entities)) {
      const d = G().entities[id];
      if (!d || !d.talk) continue;
      dialogues++;
      pages += checkTree(id, errors, warnings);
    }
    return {
      ok: !errors.length,
      errors: uniq(errors),
      warnings: uniq(warnings),
      quests: ids.length,
      dialogues,
      pages
    };
  }

  function report() {
    const r = check();
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const head = r.ok
      ? `Content check OK — ${plural(r.quests, 'quest')}, ${plural(r.dialogues, 'dialogue tree')}, ${plural(r.pages, 'page')}, ${plural(r.warnings.length, 'warning')}.`
      : `Content check FAILED — ${plural(r.errors.length, 'error')}, ${plural(r.warnings.length, 'warning')}.`;
    const lines = [head];
    for (const e of r.errors) lines.push('ERROR ' + e);
    for (const w of r.warnings.slice(0, 30)) lines.push('WARN  ' + w);
    if (r.warnings.length > 30) lines.push(`… and ${r.warnings.length - 30} more warnings.`);
    return lines.join('\n');
  }

  function summary() {
    const r = check();
    if (r.ok) return `OK — ${r.quests} quests, ${r.dialogues} dialogue trees${r.warnings.length ? `, ${r.warnings.length} warnings` : ''}`;
    return `${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`;
  }

  function log() {
    const r = check();
    if (!r.ok) {
      console.error(`[Wasteland] content check: ${r.errors.length} error(s)`);
      for (const e of r.errors) console.error('  ' + e);
    } else if (r.warnings.length) {
      console.warn(`[Wasteland] content check OK with ${r.warnings.length} warning(s)`);
      for (const w of r.warnings) console.warn('  ' + w);
    } else {
      console.log(`[Wasteland] content check OK — ${r.quests} quests, ${r.dialogues} dialogue trees`);
    }
  }

  WA.authored = { apply, mergePatch, MERGE, check, report, summary, log };
})(window.WA = window.WA || {});
