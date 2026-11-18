/* Merchants: stock, caps, prices and gradual restocking. A shopkeeper is an
   entity with both a `schedule` and a `merchant` block:

     merchant: { caps: 70, stock: [['stimpak', 3], ['ammo_10mm', 40]] }

   Stock, caps, the last top-up time and used-gear condition live on the save
   (S.shops), so what you buy stays sold and what you sell can be bought back.
   Instead of refilling the whole list at dawn, a stall on duty adds a few units
   and some caps every two game hours, about eight steps from empty to full, and
   catches up when you next open it. Gear keeps the condition it had when sold.
   Barter and remembered trust move both the buy and the sell price. Trading is
   free, like equipping gear — opening a shop already pauses the world.

   Every unit on a shelf belongs to the trader. Steal rolls the Steal skill
   against the owner's watchfulness; a good roll lifts the goods and marks
   those units stolen (S.hot, per item and per owner), while a bad one means
   lost trust, a wider reputation and, for a trader, a fine and a shut stall.
   The same roll serves pickpocketing and owned containers. Merchants will not
   buy back their own stolen stock. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  let NPC = '', MSG = '';
  const RESTOCK_MINUTES = 120; // one top-up every two game hours
  const RESTOCK_STEPS = 8;     // roughly eight top-ups from empty to full

  const defOf = id => WA.GAME.entities[id] || {};
  const merchant = id => defOf(id).merchant || null;
  const isFence = id => { const m = merchant(id); return !!(m && m.fence); };
  const isOpen = () => { const el = U.el('trade'); return !!el && !el.hidden; };
  const say = t => { if (WA.game && WA.game.say) WA.game.say(t); };
  const nameOf = id => defOf(id).name || id;

  /* An item's base worth. Authored `val` wins; otherwise the class gives a
     sensible spread so Forge-made gear can still be traded. */
  const TYPE_VALUE = { stim: 40, radaway: 25, repair: 30, food: 8, chem: 25, junk: 5, explosive: 30 };
  function value(id) {
    const d = WA.GAME.items[id];
    if (!d) return 0;
    if (typeof d.val === 'number' && isFinite(d.val)) return Math.max(0, d.val);
    if (d.type === 'ammo') return d.caliber === '10mm' ? 2 : 3;
    if (d.type === 'weapon') {
      const dmg = d.dmg || [0, 0];
      return Math.round(15 + ((dmg[0] + dmg[1]) / 2) * 5 + (d.range || 1) * 2);
    }
    if (d.type === 'armor') return Math.round(15 + (d.def || 0) * 8 + (d.ac || 0) * 2);
    if (d.type === 'caps' || d.type === 'key' || d.type === 'container') return 0;
    return TYPE_VALUE[d.type] || 0;
  }

  /* Standing with the trader's faction moves both sides of the counter:
     Liked and Trusted pay less and get more, Disliked and Hated the reverse.
     The fence keeps its flat sell rate; it is not a legitimate stall. */
  const factionOf = id => (WA.reputation ? WA.reputation.factionOf(id) : null);
  const standing = id => {
    const fid = factionOf(id);
    return fid && WA.reputation ? WA.reputation.rep(fid) : 0;
  };
  function standingMul(id) {
    const n = standing(id);
    if (n >= 60) return 0.85;
    if (n >= 20) return 0.92;
    if (n <= -60) return 1.3;
    if (n <= -20) return 1.15;
    return 1;
  }

  /* One line under the stall header, so the price change is never invisible. */
  function standingNote(id) {
    if (!WA.reputation) return '';
    const fid = factionOf(id);
    if (!fid) return '';
    const n = WA.reputation.rep(fid), tier = WA.reputation.repTier(n);
    const pct = Math.round((standingMul(id) - 1) * 100);
    const eff = pct < 0 ? `${-pct}% off` : pct > 0 ? `${pct}% surcharge` : 'standard prices';
    return `<div class="dim" style="font-size:12px">${U.esc(WA.reputation.factionName(fid))}: ` +
      `<span class="${tier.cls}">${tier.name} ${n}</span> · ${eff}</div>`;
  }

  /* Barter lowers what you pay and raises what you get; one point of trust is
     worth more than a silver tongue. */
  function factors(id) {
    const trust = (WA.dlg && WA.dlg.mem ? WA.dlg.mem(id).trust : 0) | 0;
    const barter = WA.skills ? WA.skills.value('barter') : 20;
    const stance = standingMul(id);
    const buy = Math.max(0.4, (1 - Math.min(0.25, Math.max(0, (barter - 20) / 200)) - (trust > 0 ? 0.15 : 0)) * stance);
    // A fence pays a flat black-market rate and asks no questions; legitimate
    // stalls still scale with Barter, trust and standing.
    const baseSell = 0.35 + Math.min(0.1, Math.max(0, (barter - 20) / 500)) + (trust > 0 ? 0.05 : 0);
    const sell = isFence(id) ? 0.55 : Math.max(0.15, Math.min(0.7, baseSell * (2 - stance)));
    return { buy, sell };
  }

  const unitPrice = (itemId, merchantId) => Math.max(1, Math.round(value(itemId) * factors(merchantId).buy));
  const salePrice = (itemId, merchantId) => Math.max(1, Math.round(value(itemId) * factors(merchantId).sell));
  const lotSize = d => (d && d.type === 'ammo' ? 10 : 1);

  /* Weapons and armour are the only stock that carries condition. One value
     per item id matches the player's per-id condition map: a bought unit hands
     its wear to the player, and a sold unit puts the player's wear on the shelf. */
  const isGear = d => !!d && (d.type === 'weapon' || d.type === 'armor');
  const condMax = () => (WA.weapons ? WA.weapons.MAX : 100);
  const clampCond = v => {
    const n = Number(v);
    return Math.max(0, Math.min(condMax(), isFinite(n) ? Math.round(n) : condMax()));
  };
  const restockStep = max => Math.max(1, Math.ceil(Math.max(1, max | 0) / RESTOCK_STEPS));
  const lootMul = () => (WA.settings ? WA.settings.lootMul() : 1);
  const scaledQty = n => Math.max(0, Math.min(999, Math.round((n | 0) * lootMul())));

  function ensureWear(st, id) {
    const d = WA.GAME.items[id], n = st.stock[id] | 0;
    if (!isGear(d) || n <= 0) {
      if (st.wear) delete st.wear[id];
      return;
    }
    st.wear = (st.wear && typeof st.wear === 'object') ? st.wear : {};
    const cur = Array.isArray(st.wear[id]) ? st.wear[id] : [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(i < cur.length ? clampCond(cur[i]) : condMax());
    st.wear[id] = out;
  }

  function addStock(st, id, n, cond) {
    const d = WA.GAME.items[id];
    if (!d || !(n > 0)) return 0;
    const before = st.stock[id] | 0;
    const after = Math.min(999, before + (n | 0));
    const added = after - before;
    if (added <= 0) return 0;
    st.stock[id] = after;
    if (!isGear(d)) return added;
    st.wear = (st.wear && typeof st.wear === 'object') ? st.wear : {};
    const cur = Array.isArray(st.wear[id]) ? st.wear[id] : [];
    const arr = [];
    for (let i = 0; i < before; i++) arr.push(i < cur.length ? clampCond(cur[i]) : condMax());
    for (let i = 0; i < added; i++) arr.push(cond === undefined ? condMax() : clampCond(cond));
    st.wear[id] = arr;
    return added;
  }

  function takeStock(st, id, n) {
    const d = WA.GAME.items[id];
    const before = st.stock[id] | 0;
    const taken = Math.min(Math.max(0, n | 0), before);
    if (!taken) return null;
    if (isGear(d)) ensureWear(st, id);
    st.stock[id] = before - taken;
    let cond = null;
    if (isGear(d)) {
      const arr = (st.wear && st.wear[id]) || [];
      if (arr.length) {
        let best = 0;
        for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
        cond = arr[best];
        arr.splice(best, 1);
        if (!arr.length) delete st.wear[id];
      }
    }
    if (!st.stock[id]) {
      delete st.stock[id];
      if (st.wear) delete st.wear[id];
    }
    return { n: taken, cond };
  }

  function stockConds(st, id) {
    const d = WA.GAME.items[id];
    if (!isGear(d)) return [];
    ensureWear(st, id);
    return (st.wear && st.wear[id]) || [];
  }

  function stockCondText(st, id) {
    const arr = stockConds(st, id);
    if (!arr.length) return '';
    const lo = Math.min(...arr), hi = Math.max(...arr);
    return `CND ${lo === hi ? lo : lo + '–' + hi}%`;
  }

  const canSell = id => {
    const d = WA.GAME.items[id];
    return !!d && d.type !== 'key' && d.type !== 'caps' && d.type !== 'container' && value(id) > 0;
  };

  /* ---------- ownership and theft ---------- */

  /* How many of an item you actually carry. Hot counts are clamped to this so
     using a stolen stimpak does not taint the next one you buy. */
  function heldOf(id, s) {
    const it = WA.GAME.items[id];
    if (!it || !s) return 0;
    if (it.type === 'ammo') return Math.max(0, (s.ammo && s.ammo[id]) | 0);
    return WA.inv ? WA.inv.owned(id) : (s.inv || []).filter(x => x === id).length;
  }

  /* Stolen units are remembered per item and per stall they came from. A save
     can outlive the goods, so stale marks are dropped as they are read. */
  function pruneHot(s) {
    if (!s || !s.hot || typeof s.hot !== 'object') return;
    for (const id in s.hot) {
      const h = s.hot[id];
      const held = heldOf(id, s);
      if (!h || typeof h !== 'object' || held <= 0) { delete s.hot[id]; continue; }
      h.by = (h.by && typeof h.by === 'object') ? h.by : {};
      let sum = 0;
      for (const k in h.by) {
        h.by[k] = Math.max(0, Math.min(9999, h.by[k] | 0));
        if (h.by[k]) sum += h.by[k]; else delete h.by[k];
      }
      if (!sum) { delete s.hot[id]; continue; }
      h.n = Math.max(0, Math.min(held, Math.min((h.n | 0) || sum, sum)));
    }
  }

  function hot(id, s) {
    s = s || S();
    pruneHot(s);
    const h = s && s.hot && s.hot[id];
    return h && h.n > 0 ? h.n | 0 : 0;
  }

  const hotFrom = (id, from, s) => {
    const rec = (s || S() || {}).hot;
    const h = rec && rec[id];
    return h && h.by && h.by[from] > 0 ? h.by[from] | 0 : 0;
  };

  function markHot(id, n, from, s) {
    s = s || S();
    if (!s || !(n > 0)) return;
    s.hot = (s.hot && typeof s.hot === 'object') ? s.hot : {};
    const h = s.hot[id] || (s.hot[id] = { n: 0, by: {} });
    h.by = (h.by && typeof h.by === 'object') ? h.by : {};
    h.n = Math.max(0, (h.n | 0) + n);
    h.by[from] = Math.max(0, (h.by[from] | 0) + n);
  }

  /* Selling clean goods clears stolen units first, so a mark wears off. */
  function cool(id, n, s) {
    s = s || S();
    const h = s && s.hot && s.hot[id];
    if (!h) return;
    let left = Math.max(0, n | 0);
    for (const k in h.by || {}) {
      if (left <= 0) break;
      const take = Math.min(h.by[k] | 0, left);
      h.by[k] = (h.by[k] | 0) - take;
      left -= take;
      if (h.by[k] <= 0) delete h.by[k];
    }
    h.n = Math.max(0, (h.n | 0) - Math.max(0, n | 0));
    if (h.n <= 0 || !Object.keys(h.by || {}).length) delete s.hot[id];
  }

  /* A trader's `merchant.watch` is their attention; anyone else can carry a
     plain `watch` value. Defaults keep Forge-made people pickable. */
  function watchOf(id) {
    const d = defOf(id);
    if (typeof d.watch === 'number' && isFinite(d.watch)) return Math.max(0, d.watch | 0);
    if (d.merchant && typeof d.merchant.watch === 'number' && isFinite(d.merchant.watch)) {
      return Math.max(0, d.merchant.watch | 0);
    }
    return 12;
  }

  /* Better goods are harder to lift; a watchful owner and a known thief make
     it worse, and keeping low while sneaking helps a little. Something in their
     hands (`held`) or a container you have to search adds to the difficulty. */
  function stealDiff(id, itemId, s, opts) {
    s = s || S();
    const o = opts || {};
    return Math.max(5, Math.min(180,
      10 + Math.round(value(itemId) * 0.8) + (watchOf(id) | 0) +
      12 * ((s && s.notoriety) | 0) - (s && s.sneak ? 8 : 0) +
      (o.held ? 25 : 0) + (o.kind === 'container' ? 8 : 0)));
  }
  const stealChance = (id, itemId, s, opts) => (WA.skills ? WA.skills.checkChance('steal', stealDiff(id, itemId, s, opts)) : 0);

  /* A catch shuts the stall for the rest of the day; the ban lapses at midnight. */
  function banNotice(id, s) {
    s = s || S();
    const st = state(id, s);
    if (!st) return '';
    return (st.ban | 0) >= WA.time.day(s)
      ? `${nameOf(id)} is watching you. The stall stays shut until tomorrow.` : '';
  }

  /* Caught: lost trust, a wider reputation and time spent shut out. A trader
     also fines you and shuts the stall; anyone else simply refuses to let you
     close again today. Used by shelves, pockets and owned containers. */
  function caughtBy(id, s, kind) {
    s = s || S();
    const st = merchant(id) ? state(id, s) : null;
    const prior = st ? st.caught | 0 : 0;
    let fine = 0;
    if (st) {
      fine = Math.min(s.caps | 0, 20 + prior * 10);
      if (fine > 0) s.caps -= fine;
      st.caught = Math.min(9, prior + 1);
      st.ban = Math.max(st.ban | 0, WA.time.day(s));
    }
    const before = s.notoriety | 0;
    s.notoriety = Math.min(3, before + 1);
    if (WA.bounty) WA.bounty.raise(s);
    // A catch is also the negative karma path: stealing from people costs
    // standing with their people.
    if (WA.reputation) {
      const fid = WA.reputation.factionOf(id);
      WA.reputation.adjust({ karma: -6, rep: fid ? { [fid]: -8 } : null, why: `caught stealing from ${nameOf(id)}` });
      // A catch can push the trader's faction over the line mid-theft.
      if (WA.reputation.hostile(id) && isOpen() && NPC === id) close();
    }
    const m = WA.dlg && WA.dlg.mem ? WA.dlg.mem(id) : null;
    if (m) {
      m.trust = Math.max(0, (m.trust | 0) - 1);
      m.flags = m.flags || {};
      m.flags.thief = 1;
      m.waryDay = Math.max(m.waryDay | 0, WA.time.day(s));
    }
    const where = kind === 'pocket' ? 'pocket' : kind === 'container' ? 'lockbox' : 'stock';
    say(`${nameOf(id)} catches your hand in the ${where}.` +
      (st ? (fine ? ` You pay ${fine} caps to keep the peace.` : ' You have no caps to settle it with.')
        : ' They keep their distance for the rest of the day.') +
      (st ? ' The stall shuts until tomorrow.' : ''));
    if (s.notoriety > before) say('Word travels. Every merchant will watch you more closely.');
    if (WA.save) WA.save.queueAutosave();
    const msg = st
      ? `CAUGHT — ${nameOf(id)} ${fine ? `fines you ${fine} caps and ` : ''}shuts the stall for the day.`
      : `CAUGHT — ${nameOf(id)} will not let you close for the rest of the day.`;
    return { fine, msg, waryDay: m ? m.waryDay | 0 : 0 };
  }

  /* One generic Steal roll. Callers hand over the goods and mark them stolen
     only on success, so a failed container take leaves the loot inside. */
  function attempt(id, itemId, opts) {
    const o = opts || {};
    const s = o.state || S();
    if (!s || s.dead || !WA.skills) return { ok: false, result: null };
    const r = WA.skills.checkResult('steal', stealDiff(id, itemId, s, o));
    if (!r.success) return { ok: false, result: r, caught: caughtBy(id, s, o.kind || 'shelf') };
    return { ok: true, result: r };
  }

  function steal(id) {
    const s = S(), st = state(NPC, s), it = WA.GAME.items[id];
    if (!s || !st || !it || s.dead || !WA.skills) return false;
    const shut = banNotice(NPC, s);
    if (shut) { MSG = shut; render(); return false; }
    if (WA.sched && !WA.sched.open(NPC)) { say(WA.sched.notice(NPC) || 'The shop is closed.'); render(); return false; }
    const n = st.stock[id] | 0;
    if (n <= 0) { MSG = `The ${it.name} is sold out.`; render(); return false; }
    const qty = Math.min(lotSize(it), n);
    if (!WA.inv.canCarry(WA.inv.itemWeight(id) * qty)) {
      MSG = `Too heavy. You can carry ${WA.inv.capacity()} lbs.`;
      render();
      return false;
    }
    const r = WA.skills.checkResult('steal', stealDiff(NPC, id, s));
    MSG = `${r.name} ${r.difficulty}: ${r.chance}% (rolled ${r.roll}) — ${r.success ? 'success' : 'failure'}.`;
    say(MSG);
    if (!r.success) {
      const caught = caughtBy(NPC, s, 'shelf');
      MSG = caught.msg;
      render();
      return false;
    }
    const got = takeStock(st, id, qty);
    if (!got) { MSG = `The ${it.name} is sold out.`; render(); return false; }
    give(id, qty);
    if (got.cond !== null && WA.weapons) WA.weapons.set(id, got.cond);
    markHot(id, qty, NPC, s);
    const what = qty > 1 ? `${qty} ${it.name.toLowerCase()}` : `a ${it.name.toLowerCase()}`;
    say(`You lift ${what} from the shelf. ${nameOf(NPC)} doesn't notice.`);
    if (WA.save) WA.save.queueAutosave();
    render();
    if (WA.view) WA.view.draw();
    return true;
  }

  function reset(st, def, s) {
    s = s || S();
    st.caps = scaledQty(def.caps | 0);
    st.stock = {};
    st.wear = {};
    for (const pair of def.stock || []) {
      if (!Array.isArray(pair) || !WA.GAME.items[pair[0]]) continue;
      const n = scaledQty(pair[1] | 0);
      st.stock[pair[0]] = n;
      if (n > 0 && isGear(WA.GAME.items[pair[0]])) st.wear[pair[0]] = Array(n).fill(condMax());
    }
    st.fill = s ? WA.time.minutes(s) : 0;
    st.day = s ? WA.time.day(s) : 0;
  }

  /* Per-merchant state, created full on first use and validated on the way in. */
  function state(id, s) {
    s = s || S();
    const def = merchant(id);
    if (!s || !def) return null;
    s.shops = (s.shops && typeof s.shops === 'object') ? s.shops : {};
    let st = s.shops[id];
    if (!st || typeof st !== 'object') {
      st = s.shops[id] = {};
      reset(st, def, s);
    }
    st.caps = Math.max(0, Math.min(999999, st.caps | 0));
    st.day = Math.max(0, st.day | 0);
    const now = WA.time.minutes(s);
    st.fill = (typeof st.fill === 'number' && isFinite(st.fill)) ? Math.max(0, Math.floor(st.fill)) : now;
    if (st.fill > now) st.fill = now;
    st.ban = Math.max(0, st.ban | 0);
    st.caught = Math.max(0, Math.min(9, st.caught | 0));
    pruneHot(s);
    const stock = {};
    if (st.stock && typeof st.stock === 'object') {
      for (const k in st.stock) {
        const n = st.stock[k] | 0;
        if (WA.GAME.items[k] && n > 0) stock[k] = Math.min(999, n);
      }
    }
    st.stock = stock;
    st.wear = (st.wear && typeof st.wear === 'object') ? st.wear : {};
    for (const k in st.wear) {
      if (!stock[k] || !isGear(WA.GAME.items[k])) delete st.wear[k];
    }
    for (const k in stock) if (isGear(WA.GAME.items[k])) ensureWear(st, k);
    return st;
  }

  /* Stock and caps recover a little at a time while the trader is on duty.
     A depleted stall takes about eight top-ups (sixteen game hours) to refill,
     and opening it after an absence catches up without a full daily reset. */
  function restock(id, s) {
    s = s || S();
    const def = merchant(id);
    if (!s || !def) return false;
    const st = state(id, s);
    if (!st) return false;
    const now = WA.time.minutes(s);
    // A shut stall does not bank up a burst for opening time. Only time spent
    // on duty counts, so a daily visit does not look like the old full reset.
    if (WA.sched && !WA.sched.open(id, s)) {
      st.fill = now;
      return false;
    }
    const due = Math.floor((now - st.fill) / RESTOCK_MINUTES);
    if (due <= 0) return false;
    const ticks = Math.min(due, 1000);
    // A long absence fills the shelf and stops; do not queue a burst later.
    st.fill = due > ticks ? now : st.fill + ticks * RESTOCK_MINUTES;
    let changed = false;
    for (let i = 0; i < ticks; i++) {
      for (const pair of def.stock || []) {
        if (!Array.isArray(pair)) continue;
        const itemId = pair[0], max = scaledQty(pair[1] | 0);
        if (!WA.GAME.items[itemId] || max <= 0) continue;
        const have = st.stock[itemId] | 0;
        if (have >= max) continue;
        if (addStock(st, itemId, Math.min(max - have, restockStep(max)))) changed = true;
      }
      const cap = scaledQty(def.caps | 0);
      if (cap > 0 && (st.caps | 0) < cap) {
        st.caps = Math.min(cap, (st.caps | 0) + restockStep(cap));
        changed = true;
      }
    }
    st.day = WA.time.day(s);
    return changed;
  }

  // Kept as an alias for older saves and callers; it no longer resets a day.
  const restockIfNewDay = restock;

  function give(id, n) {
    const s = S(), d = WA.GAME.items[id];
    if (!d) return;
    if (d.type === 'stim') s.stims = (s.stims | 0) + n;
    else if (d.type === 'radaway') s.radaways = (s.radaways | 0) + n;
    else if (d.type === 'repair') s.kits = (s.kits | 0) + n;
    else if (d.type === 'ammo') {
      s.ammo = s.ammo || {};
      s.ammo[id] = (s.ammo[id] | 0) + n;
    } else {
      for (let i = 0; i < n; i++) {
        s.inv.push(id);
        if (d.type === 'weapon' || d.type === 'armor') {
          WA.weapons.fresh(id);
          if (!s[d.type]) s[d.type] = id;
        }
      }
    }
  }

  function takeOne(id) {
    const s = S();
    if (id === 'stimpak' && (s.stims | 0) > 0) { s.stims--; return true; }
    if (id === 'radaway' && (s.radaways | 0) > 0) { s.radaways--; return true; }
    if (id === 'repair_kit' && (s.kits | 0) > 0) { s.kits--; return true; }
    const i = (s.inv || []).indexOf(id);
    if (i < 0) return false;
    s.inv.splice(i, 1);
    return true;
  }

  function buy(id) {
    const s = S(), st = state(NPC, s), it = WA.GAME.items[id];
    if (!s || !st || !it || s.dead) return false;
    const shut = banNotice(NPC, s);
    if (shut) { MSG = shut; render(); return false; }
    if (WA.sched && !WA.sched.open(NPC)) { say(WA.sched.notice(NPC) || 'The shop is closed.'); render(); return false; }
    const n = st.stock[id] | 0;
    if (n <= 0) { say(`The ${it.name} is sold out.`); render(); return false; }
    const qty = Math.min(lotSize(it), n);
    const price = Math.max(1, Math.round(value(id) * factors(NPC).buy * qty));
    if (s.caps < price) { say(`You cannot cover ${price} caps for that.`); render(); return false; }
    if (!WA.inv.canCarry(WA.inv.itemWeight(id) * qty)) {
      say(`Too heavy. You can carry ${WA.inv.capacity()} lbs; drop something first.`);
      render();
      return false;
    }
    const got = takeStock(st, id, qty);
    if (!got) { say(`The ${it.name} is sold out.`); render(); return false; }
    st.caps += price;
    s.caps -= price;
    give(id, qty);
    if (got.cond !== null && WA.weapons) WA.weapons.set(id, got.cond);
    const what = qty > 1
      ? `${qty} ${it.name.toLowerCase()}${it.type === 'ammo' ? '' : 's'}`
      : `a ${it.name.toLowerCase()}`;
    say(`You buy ${what} for ${price} caps.`);
    if (WA.save) WA.save.queueAutosave();
    render();
    if (WA.view) WA.view.draw();
    return true;
  }

  function sell(id) {
    const s = S(), st = state(NPC, s), it = WA.GAME.items[id];
    if (!s || !st || !it || s.dead || !canSell(id)) return false;
    const shut = banNotice(NPC, s);
    if (shut) { MSG = shut; render(); return false; }
    if (WA.sched && !WA.sched.open(NPC)) { say(WA.sched.notice(NPC) || 'The shop is closed.'); render(); return false; }
    if (s.weapon === id || s.armor === id) { say(`Unequip the ${it.name} before selling it.`); render(); return false; }
    if (!isFence(NPC) && hotFrom(id, NPC, s) > 0) {
      MSG = `${nameOf(NPC)} recognizes the ${it.name} as their own stock and will not buy it back.`;
      say(MSG);
      render();
      return false;
    }
    const price = salePrice(id, NPC);
    if (st.caps < price) { say(`${nameOf(NPC)} cannot cover ${price} caps.`); render(); return false; }
    const cond = isGear(it) ? clampCond(WA.weapons ? WA.weapons.condOf(id) : condMax()) : null;
    if (!takeOne(id)) { say(`You have no ${it.name} to sell.`); render(); return false; }
    st.caps -= price;
    addStock(st, id, 1, cond);
    s.caps += price;
    cool(id, 1, s);
    say(`You sell the ${it.name} for ${price} caps.`);
    if (WA.save) WA.save.queueAutosave();
    render();
    if (WA.view) WA.view.draw();
    return true;
  }

  function sellAmmo(id, n) {
    const s = S(), st = state(NPC, s), it = WA.GAME.items[id];
    if (!s || !st || !it || s.dead || !canSell(id)) return false;
    const shut = banNotice(NPC, s);
    if (shut) { MSG = shut; render(); return false; }
    const qty = Math.min(Math.max(1, n | 0 || 10), s.ammo[id] | 0);
    if (!isFence(NPC) && hotFrom(id, NPC, s) > 0) {
      MSG = `${nameOf(NPC)} recognizes the ${it.name} as their own stock and will not buy it back.`;
      say(MSG);
      render();
      return false;
    }
    if (!qty) { say(`You have no ${it.name} to sell.`); render(); return false; }
    const price = Math.max(1, Math.round(value(id) * factors(NPC).sell * qty));
    if (st.caps < price) { say(`${nameOf(NPC)} cannot cover ${price} caps.`); render(); return false; }
    s.ammo[id] -= qty;
    st.caps -= price;
    addStock(st, id, qty);
    s.caps += price;
    cool(id, qty, s);
    say(`You sell ${qty} ${it.name.toLowerCase()} for ${price} caps.`);
    if (WA.save) WA.save.queueAutosave();
    render();
    if (WA.view) WA.view.draw();
    return true;
  }

  function sellRows(s, st, f) {
    const fence = isFence(NPC);
    const counts = {};
    for (const id of s.inv || []) if (WA.GAME.items[id]) counts[id] = (counts[id] | 0) + 1;
    if (s.stims > 0) counts.stimpak = (counts.stimpak | 0) + (s.stims | 0);
    if (s.radaways > 0) counts.radaway = (counts.radaway | 0) + (s.radaways | 0);
    if (s.kits > 0) counts.repair_kit = (counts.repair_kit | 0) + (s.kits | 0);
    const rows = [];
    for (const id of Object.keys(counts)) {
      const it = WA.GAME.items[id], n = counts[id] | 0;
      if (!it || !canSell(id) || n <= 0) continue;
      const price = Math.max(1, Math.round(value(id) * f.sell));
      const equipped = s.weapon === id || s.armor === id;
      const own = !fence && hotFrom(id, NPC, s) > 0;
      const cnd = isGear(it) ? `CND ${WA.weapons ? WA.weapons.condOf(id) : condMax()}%` : '';
      rows.push(`<div class="prow"><span>${U.esc(it.name)} ` +
        `<small class="dim">×${n} · ${price} caps each · ${WA.inv.itemWeight(id)} lb` +
        `${cnd ? ' · ' + cnd : ''}</small>` +
        `${hot(id, s) ? ' <small class="bad">stolen</small>' : ''}</span>` +
        (equipped ? '<small class="dim">equipped</small>' : own ? '<small class="dim">own stock</small>' :
          `<button data-sell="${U.esc(id)}" style="width:58px;font-size:13px" ${st.caps >= price ? '' : 'disabled'}>Sell</button>`) +
        '</div>');
    }
    for (const id in s.ammo || {}) {
      const n = s.ammo[id] | 0, it = WA.GAME.items[id];
      if (n <= 0 || !it || !canSell(id)) continue;
      const qty = Math.min(10, n);
      const price = Math.max(1, Math.round(value(id) * f.sell * qty));
      const own = !fence && hotFrom(id, NPC, s) > 0;
      rows.push(`<div class="prow"><span>${U.esc(it.name)} ` +
        `<small class="dim">${qty} rounds · ${price} caps</small>` +
        `${hot(id, s) ? ' <small class="bad">stolen</small>' : ''}</span>` +
        (own ? '<small class="dim">own stock</small>' :
          `<button data-sellammo="${U.esc(id)}" style="width:58px;font-size:13px" ${st.caps >= price ? '' : 'disabled'}>Sell</button>`) +
        '</div>');
    }
    return rows.join('') || '<div class="dim">Nothing to sell.</div>';
  }

  function html() {
    const s = S(), id = NPC, d = defOf(id), st = state(id, s);
    if (!s || !st) return '';
    const f = factors(id);
    const fence = isFence(id);
    const weight = WA.inv.weight(), cap = WA.inv.capacity();
    const shut = banNotice(id, s);
    const stock = Object.keys(st.stock).map(itemId => {
      const it = WA.GAME.items[itemId];
      if (!it) return '';
      const n = st.stock[itemId] | 0;
      const qty = Math.min(lotSize(it), n);
      const price = Math.max(1, Math.round(value(itemId) * f.buy * qty));
      const add = WA.inv.itemWeight(itemId) * qty;
      const room = WA.inv.canCarry(add);
      const can = !shut && n > 0 && s.caps >= price && room;
      const lift = !shut && n > 0 && room && !!WA.skills;
      const cnd = stockCondText(st, itemId);
      return `<div class="prow"><span>${U.esc(it.name)} ` +
        `<small class="dim">×${n}${it.type === 'ammo' ? ' rounds' : ''} · ${price} caps` +
        `${it.type === 'ammo' ? ' / 10' : ''} · ${add} lb${cnd ? ' · ' + cnd : ''}</small></span>` +
        `<span class="acts"><small class="dim">${stealChance(id, itemId, s)}%</small>` +
        `<button data-steal="${U.esc(itemId)}" style="width:54px;font-size:12px" ${lift ? '' : 'disabled'}>Steal</button>` +
        `<button data-buy="${U.esc(itemId)}" style="width:52px;font-size:12px" ${can ? '' : 'disabled'}>Buy</button></span></div>`;
    }).join('');
    const heat = s.notoriety | 0;
    return `<div class="prow"><span class="hero">${U.esc(nameOf(id).toUpperCase())}</span>` +
      `<span class="acts"><small class="dim">${U.esc(d.title || 'TRADER')} · ${WA.sched ? WA.sched.hours(id) : ''}</small>` +
      `<button class="closex" data-close="trade" aria-label="Close trade">×</button></span></div>` +
      `<div class="prow"><span>STALL CAPS <b>${st.caps}</b></span>` +
        `<span class="dim">You have <b>${s.caps | 0}</b> caps · ${weight}/${cap} lbs</span></div>` +
      `<div class="dim" style="font-size:12px">Stock and caps recover slowly on duty. Used gear keeps its condition.</div>` +
      standingNote(id) +
      (fence ? `<div class="dim" style="font-size:12px">FENCE — buys stolen goods at 55% of value, no questions` +
        `${(s.bounty | 0) > 0 ? ` · your bounty is ${s.bounty | 0} caps` : ''}.</div>` : '') +
      (heat ? `<div class="dim" style="font-size:12px">Merchants watch you: notoriety ${heat}. Steal checks are harder.</div>` : '') +
      (shut ? `<div class="dlgcheck">${U.esc(shut)}</div>` : '') +
      (MSG ? `<div class="dlgcheck">${U.esc(MSG)}</div>` : '') +
      `<div class="mlegend" style="margin-top:6px">BUY / STEAL</div>` +
      (stock || '<div class="dim">Sold out.</div>') +
      `<div class="mlegend" style="margin-top:8px">SELL</div>` +
      sellRows(s, st, f) +
      `<div class="use"><button data-tx="close">Done</button></div>`;
  }

  function render() {
    const el = U.el('trade');
    if (!el || el.hidden) return;
    U.setHtml('trade', html());
  }

  function open(id) {
    const s = S();
    if (!s || s.dead || !merchant(id)) return false;
    if (WA.reputation && WA.reputation.hostile(id)) {
      say(`${nameOf(id)} wants nothing to do with you. Settle your standing first.`);
      return false;
    }
    if (WA.sched && !WA.sched.open(id)) {
      say(WA.sched.notice(id) || `${nameOf(id)} is closed.`);
      return false;
    }
    const shut = banNotice(id, s);
    if (shut) { say(shut); return false; }
    if (WA.pip && WA.pip.isOpen()) WA.pip.close();
    if (WA.dlg && WA.dlg.isOpen()) WA.dlg.close();
    if (WA.pick && WA.pick.isOpen()) WA.pick.close();
    if (WA.loot && WA.loot.isOpen()) WA.loot.close();
    if (WA.lockpick && WA.lockpick.isOpen()) WA.lockpick.close();
    if (WA.hacking && WA.hacking.isOpen()) WA.hacking.close();
    restock(id, s);
    MSG = '';
    NPC = id;
    const el = U.el('trade');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function close() {
    const el = U.el('trade');
    if (el) el.hidden = true;
    NPC = '';
    MSG = '';
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
  }

  WA.trade = { open, close, render, isOpen, buy, sell, sellAmmo, steal, value, factors, buyPrice: unitPrice, sellPrice: salePrice,
    canSell, state, restock, restockIfNewDay, stockConds, stockCondText, merchant, isFence, stealChance, stealDiff, attempt, caughtBy,
    markStolen: markHot, give, watchOf, hot, hotFrom, banNotice,
    get npc() { return NPC; } };
})(window.WA = window.WA || {});
