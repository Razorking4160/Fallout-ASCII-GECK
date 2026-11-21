/* Game boot and input. The studio is a separate app; this page loads only the
   play view and the optional content pack it was handed. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const $ = U.el;

  function bindPlay() {
    // The world's turn plays out a beat at a time. Input waits for it, exactly
    // as it waits for an open panel.
    const busy = () => !!(WA.turn && WA.turn.busy && WA.turn.busy());
    const whenIdle = fn => (...a) => { if (!busy()) fn(...a); };

    // D-pad: one step on touch, repeat while held.
    document.querySelectorAll('button[data-d]').forEach(b => {
      const step = () => {
        if (busy()) return;
        const parts = b.dataset.d.split(',').map(Number);
        WA.turn.playerMove(parts[0], parts[1]);
      };
      let hold = null, repeat = null;
      const stop = () => {
        clearTimeout(hold); clearInterval(repeat);
        hold = repeat = null;
        b.classList.remove('held');
      };
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        step();
        b.classList.add('held');
        hold = setTimeout(() => { repeat = setInterval(step, 140); }, 340);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });

    document.querySelector('[data-k="pip"]').addEventListener('click', whenIdle(() => WA.pip.toggle()));
    document.querySelector('[data-k="fire"]').addEventListener('click', whenIdle(() => WA.combat.fire()));
    document.querySelector('[data-k="throw"]').addEventListener('click', whenIdle(() => WA.combat.throwItem()));
    document.querySelector('[data-k="vats"]').addEventListener('click', whenIdle(() => WA.vats.toggle()));
    document.querySelector('[data-k="wait"]').addEventListener('click', whenIdle(() => WA.turn.wait()));

    // Every panel is a fixed modal over the map on small screens. WA.ui owns the
    // panel list, the backdrop and the dismissal order, so nothing is copied here.
    const back = $('modalback');
    WA.ui.watch();
    // A panel can open during the D-pad's pointerdown. The click that follows
    // is then retargeted to the new backdrop, which would dismiss the panel
    // instantly. Only dismiss a click that actually began on the backdrop.
    let backHit = false;
    if (back) {
      back.addEventListener('pointerdown', () => { backHit = true; });
      back.addEventListener('pointercancel', () => { backHit = false; });
      back.addEventListener('click', ev => {
        if (!backHit) return;
        backHit = false;
        ev.preventDefault();
        ev.stopPropagation();
        WA.ui.escape();
      });
    }

    $('bar').onclick = whenIdle(() => WA.pip.toggle());

    $('pip').addEventListener('click', e => {
      if (busy()) return;
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) WA.pip.setTab(b.dataset.tab);
      else if (b.dataset.diff) { WA.settings.setDifficulty(b.dataset.diff); WA.pip.render(); }
      else if (b.dataset.speed) { WA.settings.setTurnSpeed(b.dataset.speed); WA.pip.render(); }
      else if (b.dataset.travel) WA.pip.travelTo(b.dataset.travel);
      else if (b.dataset.track) { WA.quests.track(b.dataset.track); WA.pip.render(); }
      else if (b.dataset.eq) WA.inv.equip(b.dataset.eq);
      else if (b.dataset.dropammo) WA.inv.dropAmmo(b.dataset.dropammo, 10);
      else if (b.dataset.drop) WA.inv.drop(b.dataset.drop);
      else if (b.dataset.end) WA.ending.open();
      else if (b.dataset.sp) WA.char.raise(b.dataset.sp);
      else if (b.dataset.sk) WA.skills.spend(b.dataset.sk);
      else if (b.dataset.tag) WA.skills.tag(b.dataset.tag);
      else if (b.dataset.perk) WA.perks.take(b.dataset.perk);
      else if (b.dataset.use) WA.inv.use(b.dataset.use, b.dataset.slot);
      else if (b.dataset.ammo) WA.inv.cycleAmmo();
      else if (b.dataset.field) WA.field.act(b.dataset.field, b.dataset.x, b.dataset.y, b.dataset.slot);
      else if (b.dataset.rest) WA.rest.act(b.dataset.rest);
      else if (b.dataset.pcmd) WA.party.act('cmd:' + b.dataset.pcmd);
      else if (b.dataset.pstim) WA.party.act('stim:' + b.dataset.pstim);
      else if (b.dataset.pdis) WA.party.act('dis:' + b.dataset.pdis);
      else if (b.dataset.pgive) WA.party.act('give:' + b.dataset.pgive);
      else if (b.dataset.ptake) WA.party.act('take:' + b.dataset.ptake);
      else if (b.dataset.pmed) WA.party.act('med:' + b.dataset.pmed);
      else if (b.dataset.g) WA.save.act(b.dataset.g);
    });

    $('dlg').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.dataset.i != null) WA.dlg.pick(/^\d+$/.test(b.dataset.i) ? +b.dataset.i : b.dataset.i);
    });

    $('trade').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.steal) WA.trade.steal(b.dataset.steal);
      else if (b.dataset.buy) WA.trade.buy(b.dataset.buy);
      else if (b.dataset.sell) WA.trade.sell(b.dataset.sell);
      else if (b.dataset.sellammo) WA.trade.sellAmmo(b.dataset.sellammo, 10);
      else if (b.dataset.tx) WA.trade.close();
    });

    $('pick').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pick) WA.pick.steal(b.dataset.pick);
      else if (b.dataset.px) WA.pick.close();
    });

    $('loot').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.li != null) WA.loot.take(+b.dataset.li);
      else if (b.dataset.la) WA.loot.takeAll();
      else if (b.dataset.lo) WA.loot.confirm();
      else if (b.dataset.lx) WA.loot.close();
    });

    $('lock').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lp != null) WA.lockpick.move(+b.dataset.lp);
      else if (b.dataset.pt) WA.lockpick.tryPick();
      else if (b.dataset.lx) WA.lockpick.close();
    });

    $('hack').addEventListener('click', e => {
      // Words and brackets are single characters, not buttons.
      const b = e.target.closest('button, [data-hw], [data-hb]');
      if (!b) return;
      if (b.dataset.hw != null) WA.hacking.pick(+b.dataset.hw);
      else if (b.dataset.hb != null) WA.hacking.useBracket(+b.dataset.hb);
      else if (b.dataset.hx) WA.hacking.close();
    });

    $('gamble').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.gwager != null) WA.gambling.setWager(b.dataset.gwager);
      else if (b.dataset.gbet != null) WA.gambling.setBet(+b.dataset.gbet);
      else if (b.dataset.groll != null) WA.gambling.play();
    });

    // One close control for every dismissible panel. Character creation and
    // death do not use it because they require an explicit choice.
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-close]');
      if (!b) return;
      if (!WA.ui.close(b.dataset.close)) return;
      e.preventDefault();
      e.stopPropagation();
    });

    const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
    addEventListener('keydown', ev => {
      if (/editing|forging|benching/.test(document.body.className)) return;
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if (!WA.game.S) return;
      // The world's turn can take seconds; one press finishes the rest of it.
      if (busy()) {
        if (ev.key === '.') { ev.preventDefault(); WA.turn.skip(); }
        return;
      }
      if (WA.ui.isOpen('chargen')) return;
      if (WA.ui.isOpen('ending')) {
        if (ev.key === 'Escape') { ev.preventDefault(); WA.ui.close('ending'); }
        return;
      }
      // While a lock is open the arrows work the pin, not the player.
      if (WA.ui.isOpen('lock')) {
        if (ev.key === 'ArrowLeft' || ev.key === 'a') { ev.preventDefault(); WA.lockpick.move(-1); }
        else if (ev.key === 'ArrowRight' || ev.key === 'd') { ev.preventDefault(); WA.lockpick.move(1); }
        else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); WA.lockpick.tryPick(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); WA.ui.close('lock'); }
        return;
      }
      if (WA.ui.isOpen('hack')) {
        if (/^[1-9]$/.test(ev.key)) { ev.preventDefault(); WA.hacking.pick(+ev.key - 1); }
        else if (ev.key === 'Escape') { ev.preventDefault(); WA.ui.close('hack'); }
        return;
      }
      if (WA.ui.isOpen('gamble')) {
        if (/^[1-4]$/.test(ev.key)) {
          ev.preventDefault();
          const bet = WA.gambling.BETS[+ev.key - 1];
          if (bet != null) WA.gambling.setBet(bet);
        } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          ev.preventDefault();
          const side = ev.key === 'ArrowRight' ? 1 : -1;
          const ids = WA.gambling.ORDER;
          const at = ids.indexOf(WA.gambling.wager.id);
          WA.gambling.setWager(ids[(at + side + ids.length) % ids.length]);
        } else if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          WA.gambling.play();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          WA.ui.close('gamble');
        }
        return;
      }
      if (WA.ui.isOpen('pick')) {
        if (ev.key === 'Escape') { ev.preventDefault(); WA.ui.close('pick'); }
        return;
      }
      if (WA.ui.isOpen('trade')) {
        if (ev.key === 'Escape') { ev.preventDefault(); WA.ui.close('trade'); }
        return;
      }
      if (KEYS[ev.key]) { ev.preventDefault(); WA.turn.playerMove(KEYS[ev.key][0], KEYS[ev.key][1]); }
      else if (ev.key === ' ') { ev.preventDefault(); WA.turn.wait(); }
      else if (ev.key === 'h') WA.inv.stim();
      else if (ev.key === 'r') WA.inv.use('radaway');
      else if (ev.key === 'f') WA.combat.fire();
      else if (ev.key === 'g') WA.combat.throwItem();
      else if (ev.key === 'v') WA.vats.toggle();
      else if (ev.key === 'p') { ev.preventDefault(); WA.pip.toggle(); }
      else if (ev.key === 'Escape') {
        WA.ui.escape();
        WA.view.draw();
      }
    });
  }

  /* Offline support plus the update banner. Service workers need http(s);
     opening index.html from disk still plays, it just has no cache. */
  let swapping = false;

  function askVersion(worker) {
    return new Promise(resolve => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(''), 1500);
      ch.port1.onmessage = e => { clearTimeout(timer); resolve((e.data && e.data.version) || ''); };
      try { worker.postMessage({ type: 'VERSION' }, [ch.port2]); }
      catch (err) { clearTimeout(timer); resolve(''); }
    });
  }

  /* A freshly installed worker waits until the player agrees to reload. */
  function offerUpdate(worker) {
    if (!worker || !navigator.serviceWorker.controller) return;
    askVersion(worker).then(version => {
      const bar = $('updatebar');
      if (!bar) return;
      $('updatetext').textContent = version && version !== WA.VERSION
        ? `Build v${version} is ready — you are playing v${WA.VERSION}.`
        : 'A new build is ready.';
      bar.hidden = false;
      $('updatebtn').onclick = () => {
        swapping = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
        // Safety net in case controllerchange never arrives.
        setTimeout(() => { if (swapping) location.reload(); }, 1500);
      };
    });
  }

  function offline() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swapping) location.reload();
    });

    // updateViaCache 'none' so a bump to js/data/version.js is noticed too,
    // not just a change to the worker script itself.
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then(reg => {
      // A worker from an earlier visit may already be waiting.
      if (reg.waiting) offerUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener('statechange', () => {
          if (fresh.state === 'installed') offerUpdate(reg.waiting || fresh);
        });
      });

      // Look for updates on load and whenever the player returns to the tab.
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => {});
  }

  async function boot() {
    offline();
    WA.settings.init();
    // Baked definitions, then hand-written jobs and dialogue, then the optional
    // content pack exported by the studio. A pack never replaces shipped quests.
    if (WA.baked) {
      WA.baked.apply(WA.AUTHORED_DEFS);
      WA.baked.applyMaps(WA.AUTHORED);
    }
    // Pack the hand-written text maps once, before any system reads them.
    if (WA.maps && WA.maps.normalize) WA.maps.normalize();
    WA.authored.apply();

    if (WA.pack) {
      const src = new URLSearchParams(location.search).get('pack');
      if (src) {
        const r = await WA.pack.importUrl(src);
        if (r.ok) {
          // Drop the parameter so a reload does not import the same file again.
          const clean = new URL(location.href);
          clean.searchParams.delete('pack');
          location.replace(clean.toString());
          return;
        }
        WA.pack.bootError = r.errors.join(' ');
      }
      try {
        const stored = await WA.pack.load();
        if (stored && stored.ok) WA.pack.bootError = '';
        else if (stored && stored.errors && stored.errors.length) {
          WA.pack.bootError = 'Stored pack rejected: ' + stored.errors.slice(0, 2).join(' ');
        }
      } catch (e) { WA.pack.bootError = 'The stored content pack could not be loaded.'; }
    }

    WA.authored.log();
    WA.vats.bind();
    bindPlay();

    const opening = WA.save.init();
    // Keep a neutral game shell behind the boot menu. New Game replaces this
    // with a real (non-test) character; Load replaces it from a save record.
    WA.game.newGame('vault', true);
    await opening;
    if (WA.menu) WA.menu.open({ intro: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.WA = window.WA || {});
