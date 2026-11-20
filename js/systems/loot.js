/* Containers: crates, lockers and the corpses enemies leave behind.
   A container is an item of type 'container' sitting on the map; the loot still
   inside it lives on the save (S.loot) so taking things sticks. Walking onto one
   opens a take panel. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  let KEY = '', PENDING = false, MSG = '';

  const isOpen = () => { const el = U.el('loot'); return !!el && !el.hidden; };
  const ownerOf = k => {
    const s = S(), id = s && s.items && s.items[k];
    const d = id && WA.GAME.items[id];
    return d && d.owner && WA.GAME.entities[d.owner] ? d.owner : '';
  };
  const ownerName = id => (WA.GAME.entities[id] || {}).name || id;

  /* The corpse definition is the fallback glyph/name for enemy remains. */
  const fallback = () => (WA.GAME.items.corpse || {});

  function itemAt(k) {
    const s = S();
    const id = s && s.items && s.items[k];
    return id && WA.GAME.items[id] ? WA.GAME.items[id] : null;
  }

  /* Loot is created from the definition the first time the container is opened,
     then kept on the save. */
  function ensure(k) {
    const s = S();
    if (!s) return null;
    const d = itemAt(k);
    if (!d) return null;
    s.loot = s.loot || {};
    if (!s.loot[k]) s.loot[k] = { n: d.name || fallback().name || 'Container', it: (d.loot || []).slice() };
    const st = s.loot[k];
    st.n = String(st.n || d.name || 'Container').slice(0, 40);
    st.it = (Array.isArray(st.it) ? st.it : []).filter(id => WA.GAME.items[id]);
    if (typeof st.lifted === 'number' && isFinite(st.lifted)) {
      st.lifted = Math.max(0, Math.min(999999, st.lifted | 0));
    }
    return st;
  }

  function trapStatus(k) {
    return WA.field && WA.field.containerTrapStatus ? WA.field.containerTrapStatus(k) : '';
  }

  function trapLine(k) {
    const status = trapStatus(k);
    if (!status) return '';
    return `<div class="loottrap ${status === 'armed' ? 'bad' : 'good'}">TRAP: ${status === 'armed' ? 'TRAPPED' : 'DISARMED'}</div>`;
  }

  function render() {
    const s = S(), el = U.el('loot');
    if (!s || !el || !isOpen()) return;
    const st = ensure(KEY);
    if (!st) return;
    const owner = ownerOf(KEY);
    const day = WA.time.day(s);
    const lifted = !!owner && typeof st.lifted === 'number' && st.lifted >= day;
    const watched = owner && WA.trade && WA.trade.watchers
      ? WA.trade.watchers(s, owner).map(w => w.e.d.name) : [];
    const head = `<div class="prow"><span class="hero">${U.esc(String(st.n).toUpperCase())}</span>` +
      `<span class="acts"><small class="dim">${PENDING ? 'UNOPENED' : `${st.it.length} item${st.it.length === 1 ? '' : 's'}`}${owner ? ' · OWNED' : ''}</small>` +
      `<button class="closex" data-close="loot" aria-label="Close container">×</button></span></div>` +
      trapLine(KEY) +
      (owner ? `<div class="dim" style="font-size:12px">Owned by ${U.esc(ownerName(owner))}. Taking anything needs a Steal check.</div>` : '') +
      (owner ? `<div class="dim" style="font-size:12px">${watched.length
        ? 'Watched by ' + U.esc(watched.join(', ')) + '.'
        : 'Nobody is watching this room.'}</div>` : '') +
      (lifted ? `<div class="dlgcheck">${U.esc(ownerName(owner))} is watching this container until tomorrow.</div>` : '') +
      (MSG ? `<div class="dlgcheck">${U.esc(MSG)}</div>` : '');
    if (PENDING) {
      U.setHtml('loot', head +
        `<div class="dim" style="font-size:13px;margin:4px 0">This container is trapped. Opening it will trigger the trap.</div>` +
        `<div class="use"><button data-lo="1">Open container</button>` +
        `<button data-lx="1">Close</button></div>`);
      return;
    }
    const rows = st.it.length
      ? st.it.map((id, i) => {
        const d = WA.GAME.items[id] || {};
        const chance = owner ? WA.trade.stealChance(owner, id, s, { kind: 'container' }) : 0;
        return `<div class="prow"><span>${U.esc(d.glyph || '?')} · ${U.esc(d.name || id)} ` +
          `<small class="dim">${WA.inv.itemWeight(id)} lb</small></span>` +
          `<span class="acts">` + (owner ? `<small class="dim">${chance}%</small>` : '') +
          `<button data-li="${i}" style="width:64px;font-size:13px" ${lifted ? 'disabled' : ''}>Take</button></span></div>`;
      }).join('')
      : '<div class="dim">Empty.</div>';
    U.setHtml('loot', head + rows +
      `<div class="use"><button data-la="1" ${st.it.length && !lifted ? '' : 'disabled'}>Take all</button>` +
      `<button data-lx="1">Close</button></div>`);
  }

  /* True while a container still needs opening: no key used, not picked yet. */
  function locked(k) {
    const s = S(), d = itemAt(k);
    if (!s || !d || !d.lock) return false;
    const st = s.loot && s.loot[k];
    if (st && st.open) return false;
    // A held key, or a terminal that released the mag-locks, counts as openable.
    if (d.needs && WA.inv.hasKey(d.needs)) return false;
    return true;
  }

  function present(k) {
    const s = S(), st = ensure(k);
    if (!s || !st) return false;
    if (!st.it.length) { cleanup(k); return false; }
    if (WA.pip) WA.pip.close();
    if (WA.dlg) WA.dlg.close();
    KEY = k;
    PENDING = false;
    const el = U.el('loot');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function confirm() {
    const s = S();
    if (!s || !PENDING || !KEY) return false;
    const k = KEY;
    PENDING = false;
    // The trap is spent once the player commits to opening the container.
    if (WA.field && WA.field.springContainer && WA.field.springContainer(k)) {
      if (s.dead || s.hp <= 0) return false;
    }
    return present(k);
  }

  function open(k) {
    const s = S();
    if (!s || s.dead) return false;
    MSG = '';
    const d = itemAt(k);
    if (!d || d.type !== 'container') return false;
    const st = ensure(k);
    if (!st) return false;
    // A key bypasses the pick; otherwise the lockpicking game takes over.
    if (d.lock && !st.open) {
      if (d.needs && WA.inv.hasKey(d.needs)) {
        const key = WA.GAME.items[d.needs];
        st.open = 1;
        const held = WA.inv.owned(d.needs) > 0;
        WA.game.say(held
          ? `You unlock the ${d.name} with the ${key ? key.name : d.needs}.`
          : `The ${d.name} unlocks. The mag-locks are down.`);
      } else if (WA.lockpick) {
        return WA.lockpick.start(k);
      } else {
        WA.game.say(`The ${d.name} is locked.`);
        return false;
      }
    }
    // Show the trap state before revealing the contents. The player must press
    // Open before the trap can fire, so scanning and disarming first matters.
    if (trapStatus(k) === 'armed') {
      if (WA.pip) WA.pip.close();
      if (WA.dlg) WA.dlg.close();
      KEY = k;
      PENDING = true;
      const el = U.el('loot');
      if (el) el.hidden = false;
      render();
      return true;
    }
    // Fallback for a loaded field module without the status helper.
    if (!WA.field || !WA.field.containerTrapStatus) {
      if (WA.field && WA.field.springContainer && WA.field.springContainer(k)) {
        if (s.dead || s.hp <= 0) return false;
      }
    }
    return present(k);
  }

  /* Hide without drawing or saving: used when the whole game state is replaced. */
  function abort() {
    const el = U.el('loot');
    if (el) el.hidden = true;
    KEY = '';
    PENDING = false;
    MSG = '';
  }

  function close() {
    abort();
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
  }

  /* An emptied container leaves the map for good, so it never reopens. */
  function cleanup(k) {
    const s = S();
    if (!s) return;
    const st = s.loot && s.loot[k];
    if (!st || st.it.length) return;
    const name = st.n;
    delete s.items[k];
    delete s.loot[k];
    if (s.trapsOff) delete s.trapsOff[s.id + '|' + k];
    WA.game.say(`The ${String(name).toLowerCase()} is empty.`);
    close();
  }

  /* Taking from an owned container is the same Steal roll as a pocket. A
     failure leaves the goods inside and shuts that box for the day. */
  function stealOne(st, n) {
    const s = S(), id = st.it[n], d = WA.GAME.items[id], owner = ownerOf(KEY);
    if (!s || !id || !d || !owner || !WA.trade) return false;
    const day = WA.time.day(s);
    if (typeof st.lifted === 'number' && st.lifted >= day) {
      MSG = `${ownerName(owner)} is watching this container until tomorrow.`;
      return false;
    }
    if (!WA.inv.canCarry(WA.inv.itemWeight(id))) {
      MSG = `Too heavy. You can carry ${WA.inv.capacity()} lbs.`;
      return false;
    }
    const res = WA.trade.attempt(owner, id, { kind: 'container' });
    if (!res.result) return false;
    const r = res.result;
    MSG = `${r.name} ${r.difficulty}: ${r.chance}% (rolled ${r.roll}) — ${r.success ? 'success' : 'failure'}.`;
    if (!res.ok) {
      // Only a witnessed fumble shuts the box for the day.
      if (res.caught && res.caught.seen) st.lifted = day;
      MSG += ' ' + (res.caught ? res.caught.msg : 'CAUGHT.');
      return false;
    }
    if (!WA.inv.collect(id)) { MSG = 'Too heavy.'; return false; }
    st.it.splice(n, 1);
    WA.trade.markStolen(id, 1, owner, s);
    WA.game.say(`You lift the ${d.name} from ${ownerName(owner)}'s ${String(st.n).toLowerCase()}. No one saw.`);
    return true;
  }

  function take(i) {
    const s = S();
    if (PENDING) return;
    const st = ensure(KEY);
    if (!s || !st) return;
    const n = i | 0;
    if (!st.it[n]) return;
    if (ownerOf(KEY)) {
      if (!stealOne(st, n)) { render(); return; }
      if (!st.it.length) { cleanup(KEY); return; }
      render();
      WA.view.draw();
      WA.save.queueAutosave();
      return;
    }
    if (!WA.inv.collect(st.it[n])) return;
    st.it.splice(n, 1);
    if (!st.it.length) { cleanup(KEY); return; }
    render();
    WA.view.draw();
    WA.save.queueAutosave();
  }

  function takeAll() {
    const s = S();
    if (PENDING) return;
    const st = ensure(KEY);
    if (!s || !st) return;
    if (ownerOf(KEY)) {
      let moved = false;
      while (st.it.length) {
        if (!stealOne(st, 0)) break;
        moved = true;
      }
      if (!st.it.length) { cleanup(KEY); return; }
      render();
      if (moved) {
        WA.view.draw();
        WA.save.queueAutosave();
      }
      return;
    }
    while (st.it.length) {
      if (!WA.inv.collect(st.it[0])) break;
      st.it.shift();
    }
    if (!st.it.length) { cleanup(KEY); return; }
    render();
    WA.view.draw();
    WA.save.queueAutosave();
  }

  WA.loot = { open, confirm, close, abort, take, takeAll, render, isOpen, ensure, locked, ownerOf,
    get key() { return KEY; }, get pending() { return PENDING; } };
})(window.WA = window.WA || {});
