/* The overworld: discovered places joined by roads. A trip costs hours on the
   game clock (two minutes a turn), and the road can produce an encounter.
   Every place sits in a terrain, and the terrain's weighted table decides what
   trouble a road can throw at you; the place's own road list stays as the local
   regulars. Outdoorsman shortens a trip, lowers the chance of trouble and can
   slip you past an ambush. Routes only run through places you have already
   visited, so travel never skips unexplored ground. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const DATA = () => (WA.GAME && WA.GAME.world) || { nodes: {}, routes: [] };
  const nodes = () => DATA().nodes || {};
  const routes = () => (Array.isArray(DATA().routes) ? DATA().routes : []);
  const terrains = () => DATA().terrains || {};
  const known = (s, id) => !!(s && s.seenMaps && s.seenMaps[id] && WA.GAME.maps[id]);
  const label = id => {
    const n = nodes()[id] || {};
    return n.label || (WA.GAME.maps[id] && WA.GAME.maps[id].name) || id;
  };

  /* The ground a destination sits in, or null when the world data names none. */
  function terrain(id) {
    const n = nodes()[id] || {};
    return (n.terrain && terrains()[n.terrain]) || null;
  }

  /* Weighted trouble for a destination: the place's own regulars carry weight 2
     each and its terrain adds the rest, so a route keeps the character of both.
     Older world data with no terrains falls back to the plain road list. */
  function weights(id) {
    const n = nodes()[id] || {};
    const out = {};
    const add = (e, w) => { if (e && WA.GAME.entities[e]) out[e] = (out[e] || 0) + w; };
    for (const e of (Array.isArray(n.road) ? n.road : [])) add(e, 2);
    const t = terrain(id);
    for (const row of (t && Array.isArray(t.pool) ? t.pool : [])) {
      if (Array.isArray(row)) add(row[0], Math.max(1, Math.round(+row[1]) || 1));
      else add(row, 1);
    }
    return out;
  }

  /* A destination's whole table, ready to draw from. */
  function table(id) {
    const w = weights(id);
    const ids = Object.keys(w);
    return { w, ids, total: ids.reduce((n, e) => n + w[e], 0) };
  }

  /* One weighted draw from a destination's table, or null when it is empty. */
  function pick(id) {
    const t = table(id);
    if (!t.total) return null;
    let roll = Math.random() * t.total;
    for (const e of t.ids) {
      roll -= t.w[e];
      if (roll < 0) return e;
    }
    return t.ids[t.ids.length - 1];
  }

  /* Roads in both directions, with their travel time in hours. */
  function roads() {
    const out = {};
    for (const id in nodes()) if (WA.GAME.maps[id]) out[id] = [];
    for (const r of routes()) {
      if (!Array.isArray(r) || r.length < 3) continue;
      const a = r[0], b = r[1], hours = Math.max(1, Math.round(+r[2]) || 1);
      if (!out[a] || !out[b]) continue;
      out[a].push({ to: b, hours });
      out[b].push({ to: a, hours });
    }
    return out;
  }

  /* Shortest route that only crosses places the player has visited. */
  function plan(s, to) {
    if (!s || !s.id || s.id === to || !known(s, to)) return null;
    const map = roads();
    if (!map[s.id] || !map[to]) return null;
    const dist = {}, prev = {}, done = {};
    for (const id in map) dist[id] = Infinity;
    dist[s.id] = 0;
    for (;;) {
      let cur = null, best = Infinity;
      for (const id in map) if (!done[id] && dist[id] < best) { best = dist[id]; cur = id; }
      if (!cur || cur === to) break;
      done[cur] = 1;
      for (const road of map[cur]) {
        if (!known(s, road.to)) continue;
        const d = dist[cur] + road.hours;
        if (d < dist[road.to]) { dist[road.to] = d; prev[road.to] = cur; }
      }
    }
    if (!isFinite(dist[to])) return null;
    const ids = [to];
    while (prev[ids[0]]) ids.unshift(prev[ids[0]]);
    return { ids, hours: dist[to] };
  }

  /* Trouble on a leg, in percent, before Outdoorsman's help. The destination's
     terrain scales it: the ruins and the flooded ground are worse than road. */
  function encounterChance(hours, outdoors, id) {
    const t = terrain(id);
    const danger = t && +t.danger > 0 ? +t.danger : 1;
    const base = (6 * hours + 8 - Math.max(0, outdoors - 20) * 0.5) * danger;
    return Math.max(3, Math.min(70, Math.round(base)));
  }

  /* A short read, straight from the data, on which ground is the worst. */
  function dangerLine() {
    const list = Object.keys(terrains())
      .map(id => terrains()[id])
      .filter(t => t && +t.danger > 1)
      .sort((a, b) => (+b.danger) - (+a.danger))
      .slice(0, 2)
      .map(t => t.name);
    if (!list.length) return '';
    return list.length === 2
      ? `Trouble weighs heavier in ${list[0]} and ${list[1]}.`
      : `Trouble weighs heavier in ${list[0]}.`;
  }

  function danger(s) {
    return (s.ents || []).some(e => e && e.d && e.hp > 0 && !e.d.talk && e.d.c !== 'good' &&
      U.cheb(e.x, e.y, s.px, s.py) <= 3);
  }

  function spawnNear(s, id) {
    const d = WA.GAME.entities[id];
    if (!d) return null;
    const spots = [];
    for (let r = 1; r <= 5 && !spots.length; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (WA.game.free(s.px + dx, s.py + dy)) spots.push([s.px + dx, s.py + dy]);
        }
      }
    }
    if (!spots.length) return null;
    const [x, y] = spots[U.rnd(0, spots.length - 1)];
    const e = { x, y, id, hp: WA.scale.mobHp(d), d, slow: 0, cd: 0, weak: 0, last: null, fx: [] };
    s.ents.push(e);
    if (WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
    return e;
  }

  /* The roads you know, drawn on a small character chart. */
  const CW = 22, CH = 8;
  function chart(s) {
    if (!s) return '';
    const g = Array.from({ length: CH }, () => Array(CW).fill(' '));
    const nd = nodes();
    const hint = new Set();
    for (const r of routes()) {
      if (!Array.isArray(r) || r.length < 3) continue;
      const a = r[0], b = r[1], A = nd[a], B = nd[b];
      const ka = known(s, a), kb = known(s, b);
      if (!ka && !kb) continue;
      if (!ka) hint.add(a);
      if (!kb) hint.add(b);
      if (!ka || !kb || !A || !B) continue;
      for (let x = Math.min(A.x, B.x); x <= Math.max(A.x, B.x); x++) {
        if (g[A.y] && g[A.y][x] === ' ') g[A.y][x] = '·';
      }
      for (let y = Math.min(A.y, B.y); y <= Math.max(A.y, B.y); y++) {
        if (g[y] && g[y][B.x] === ' ') g[y][B.x] = '·';
      }
    }
    for (const id in nd) {
      const n = nd[id];
      if (!n || !WA.GAME.maps[id] || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      const y = n.y | 0, x = n.x | 0;
      if (y < 0 || y >= CH || x < 0 || x >= CW) continue;
      const mark = id === s.id ? '@' : known(s, id) ? (n.glyph || label(id).slice(0, 1))
        : hint.has(id) ? '?' : null;
      if (mark) g[y][x] = mark;
    }
    return g.map(row => row.join('').replace(/\s+$/, '')).join('\n');
  }

  function html() {
    const s = S();
    if (!s) return '';
    const nd = nodes();
    const rows = Object.keys(nd)
      .filter(id => WA.GAME.maps[id] && id !== s.id && known(s, id))
      .map(id => {
        const p = plan(s, id);
        if (!p) return `<div class="prow"><span class="dim">${U.esc(label(id))} <small>no known road</small></span></div>`;
        const legs = p.ids.length - 1;
        const t = terrain(id);
        const ground = t ? ` · ${U.esc(t.name)}` : '';
        return `<div class="prow"><span>${U.esc(label(id))} ` +
          `<small class="dim">${p.hours}h · ${legs} leg${legs === 1 ? '' : 's'}${ground}</small></span>` +
          `<button data-travel="${U.esc(id)}" style="width:84px">Travel</button></div>`;
      }).join('');
    return `<div class="mlegend" style="margin-top:6px">OVERWORLD</div>` +
      `<div class="pmap">${chart(s)}</div>` +
      `<div class="mlegend">@ you · letter visited · ? rumour · · road</div>` +
      `<div class="mlist" style="margin-top:3px">Outdoorsman ${WA.skills.value('outdoorsman')}%: ` +
        `shorter trips, fewer road encounters, and a chance to slip past one. ${dangerLine()}</div>` +
      (rows || '<div class="mlist">No other known places yet. Walk the exits to find them.</div>');
  }

  function travelTo(to) {
    const s = S();
    if (!s || s.dead || !WA.GAME.maps[to]) return false;
    const p = plan(s, to);
    if (!p) {
      WA.game.say(known(s, to) ? 'No known road leads there.' : 'You have not been there yet.');
      return false;
    }
    if (danger(s)) {
      WA.game.say('Enemies are too close to travel.');
      return false;
    }

    const out = WA.skills.value('outdoorsman');
    let hours = p.hours;
    const short = WA.skills.checkResult('outdoorsman', 28 + hours * 4);
    if (short.success) {
      hours = Math.max(1, hours - 1);
      WA.game.say(`Outdoorsman ${short.skill}% (rolled ${short.roll}): a shorter road — ${hours}h instead of ${p.hours}h.`);
    }

    // Trouble is rolled once for the whole trip and arrives with you, drawn from
    // the destination's terrain table mixed with that place's own regulars.
    const t = terrain(to);
    const ground = t ? t.name : 'the road';
    let ambush = null;
    if (table(to).total && Math.random() * 100 < encounterChance(hours, out, to)) {
      const dodge = WA.skills.checkResult('outdoorsman', 35);
      if (dodge.success) {
        WA.game.say(`Outdoorsman ${dodge.skill}% (rolled ${dodge.roll}): you spot trouble on ${ground} and slip past it.`);
      } else ambush = pick(to);
    }

    WA.time.advance(s, hours * 60);
    WA.game.say(`You travel for ${hours} hour${hours === 1 ? '' : 's'}.`);
    if (!WA.game.travel(to)) return false;

    const ns = S();
    if (WA.sched) WA.sched.sync(ns);
    if (ambush) {
      const e = spawnNear(ns, ambush);
      if (e) WA.game.say(`A ${e.d.name.toLowerCase()} followed you in from ${ground}.`);
    }
    WA.game.say(`It is ${WA.time.label(ns)}.`);
    if (WA.game.updateVis) WA.game.updateVis();
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
    if (WA.pip) WA.pip.render();
    return true;
  }

  WA.overworld = {
    nodes, terrains, terrain, weights, table, pick, roads, plan, chart, html,
    travelTo, encounterChance
  };
})(window.WA = window.WA || {});
