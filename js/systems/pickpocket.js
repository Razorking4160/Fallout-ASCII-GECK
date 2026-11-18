/* Pickpocketing: anyone with a `carry` list can be reached for.
   Carried goods live on the save (S.pockets) so what you lift stays lifted.
   Equipped or held items (`held`) are noticed more easily and roll at a much
   harder difficulty; a catch costs trust and raises notoriety. A trader also
   fines you and shuts the stall, like a bad shelf theft. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  let NPC = '', MSG = '';

  const isOpen = () => { const el = U.el('pick'); return !!el && !el.hidden; };
  const say = t => { if (WA.game && WA.game.say) WA.game.say(t); };
  const defOf = id => WA.GAME.entities[id] || {};
  const nameOf = id => defOf(id).name || id;
  const heldOf = id => (Array.isArray(defOf(id).held) ? defOf(id).held : []);

  /* Pockets initialize from the authored carry list the first time they are
     used, then persist. An empty record means they have been emptied. */
  function pocketsOf(id, s) {
    s = s || S();
    const d = defOf(id);
    if (!s || !Array.isArray(d.carry)) return null;
    s.pockets = (s.pockets && typeof s.pockets === 'object') ? s.pockets : {};
    let p = s.pockets[id];
    if (!p || typeof p !== 'object') {
      p = s.pockets[id] = {};
      for (const pair of d.carry) {
        if (!Array.isArray(pair) || !WA.GAME.items[pair[0]]) continue;
        const n = Math.max(0, Math.min(999, pair[1] | 0));
        if (n > 0) p[pair[0]] = (p[pair[0]] | 0) + n;
      }
    }
    for (const k in p) {
      if (!WA.GAME.items[k] || !(p[k] > 0)) delete p[k];
      else p[k] = Math.max(0, Math.min(999, p[k] | 0));
    }
    return p;
  }

  function wary(id, s) {
    const m = WA.dlg && WA.dlg.mem ? WA.dlg.mem(id) : null;
    return !!m && typeof m.waryDay === 'number' && m.waryDay >= WA.time.day(s || S());
  }

  function html() {
    const s = S(), id = NPC, p = pocketsOf(id, s), d = defOf(id);
    if (!s || !p) return '';
    const inWary = wary(id, s);
    const held = heldOf(id);
    const heat = s.notoriety | 0;
    const rows = Object.keys(p).map(itemId => {
      const it = WA.GAME.items[itemId];
      const n = p[itemId] | 0;
      if (!it || n <= 0) return '';
      const qty = Math.min(it.type === 'ammo' ? 10 : 1, n);
      const inHand = held.includes(itemId);
      const chance = WA.trade.stealChance(id, itemId, s, { held: inHand });
      const room = WA.inv.canCarry(WA.inv.itemWeight(itemId) * qty);
      const can = !inWary && room && !!WA.skills;
      return `<div class="prow"><span>${U.esc(it.name)} ` +
        `<small class="dim">×${n}${it.type === 'ammo' ? ' rounds' : ''}` +
        `${inHand ? ' · in hand' : ''}</small></span>` +
        `<span class="acts"><small class="dim">${chance}%</small>` +
        `<button data-pick="${U.esc(itemId)}" style="width:54px;font-size:12px" ${can ? '' : 'disabled'}>Steal</button></span></div>`;
    }).join('');
    return `<div class="prow"><span class="hero">${U.esc(nameOf(id).toUpperCase())}</span>` +
      `<span class="acts"><small class="dim">PICKPOCKET</small>` +
      `<button class="closex" data-close="pick" aria-label="Close pickpocket panel">×</button></span></div>` +
      `<div class="prow"><span>POCKETS <b>${Object.keys(p).length}</b></span>` +
        `<span class="dim">${s.notoriety ? `Notoriety ${heat} · ` : ''}${WA.inv.weight()}/${WA.inv.capacity()} lbs</span></div>` +
      (heat ? `<div class="dim" style="font-size:12px">Notoriety ${heat}: pockets and shelves are harder to lift.</div>` : '') +
      (inWary ? `<div class="dlgcheck">${U.esc(nameOf(id))} is watching you. No pockets until tomorrow.</div>` : '') +
      (MSG ? `<div class="dlgcheck">${U.esc(MSG)}</div>` : '') +
      `<div class="mlegend" style="margin-top:6px">CARRIED</div>` +
      (rows || '<div class="dim">Their pockets are empty.</div>') +
      `<div class="use"><button data-px="1">Done</button></div>`;
  }

  function render() {
    const el = U.el('pick');
    if (!el || el.hidden) return;
    U.setHtml('pick', html());
  }

  function open(id) {
    const s = S();
    if (!s || s.dead || !Array.isArray(defOf(id).carry)) return false;
    if (WA.pip) WA.pip.close();
    if (WA.dlg && WA.dlg.isOpen()) WA.dlg.close();
    if (WA.trade && WA.trade.isOpen()) WA.trade.close();
    if (WA.loot && WA.loot.isOpen()) WA.loot.close();
    if (WA.lockpick && WA.lockpick.isOpen()) WA.lockpick.close();
    if (WA.hacking && WA.hacking.isOpen()) WA.hacking.close();
    NPC = id;
    MSG = '';
    pocketsOf(id, s);
    const el = U.el('pick');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function close() {
    const el = U.el('pick');
    if (el) el.hidden = true;
    NPC = '';
    MSG = '';
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
  }

  function steal(itemId) {
    const s = S(), p = pocketsOf(NPC, s), it = WA.GAME.items[itemId];
    if (!s || !p || !it || s.dead || !WA.skills) return false;
    if (wary(NPC, s)) {
      MSG = `${nameOf(NPC)} is watching you until tomorrow.`;
      render();
      return false;
    }
    const n = p[itemId] | 0;
    if (n <= 0) { MSG = `They have no ${it.name}.`; render(); return false; }
    const qty = Math.min(it.type === 'ammo' ? 10 : 1, n);
    if (!WA.inv.canCarry(WA.inv.itemWeight(itemId) * qty)) {
      MSG = `Too heavy. You can carry ${WA.inv.capacity()} lbs.`;
      render();
      return false;
    }
    const res = WA.trade.attempt(NPC, itemId, {
      kind: 'pocket', held: heldOf(NPC).includes(itemId), qty
    });
    if (!res.result) return false;
    const r = res.result;
    MSG = `${r.name} ${r.difficulty}: ${r.chance}% (rolled ${r.roll}) — ${r.success ? 'success' : 'failure'}.`;
    if (!res.ok) {
      MSG += ' ' + (res.caught ? res.caught.msg : 'CAUGHT.');
      render();
      return false;
    }
    p[itemId] = n - qty;
    if (p[itemId] <= 0) delete p[itemId];
    WA.trade.give(itemId, qty);
    WA.trade.markStolen(itemId, qty, NPC, s);
    const what = qty > 1 ? `${qty} ${it.name.toLowerCase()}` : `a ${it.name.toLowerCase()}`;
    say(`You lift ${what} from ${nameOf(NPC)}'s pocket. They do not notice.`);
    if (WA.save) WA.save.queueAutosave();
    render();
    if (WA.view) WA.view.draw();
    return true;
  }

  WA.pick = { open, close, render, isOpen, steal, pocketsOf, wary,
    get npc() { return NPC; } };
})(window.WA = window.WA || {});
