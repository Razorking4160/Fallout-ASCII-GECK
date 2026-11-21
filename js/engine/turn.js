/* Turn handling: actions spend AP, then the world takes one turn. A player
   phase lasts until the pool is empty, so two shots or a few steps happen
   before the enemies move. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  // An open panel pauses the world: no world turn, no enemy actions. A world
  // turn that is still playing out holds the player the same way.
  const paused = () => WA.ui.paused() || busy;

  // A step is one point. Attacks pass their own cost (see combat.attackCost),
  // so a round is about two rifle shots or a handful of steps.
  const STEP = 1;

  /* ---------- the world's turn -----------------------------------------
     The enemy phase is played out one action per beat and the board is redrawn
     between them, so a step reads as a step instead of a jump. The logic is
     still turn-based: the beat only paces presentation, and nothing in the
     rules reads a frame clock. */
  // How fast the world acts is a device setting (Options → World turn); the
  // rules never read it, only the beat between actions does.
  const beatMs = () => (WA.settings && WA.settings.turnBeat ? WA.settings.turnBeat() : 300);
  let busy = false, timer = 0, again = false;
  // The pending beat, so a skip can resolve the rest of the phase on the spot.
  let resume = null, skipNow = false;

  /* Animation off, or a system asked for less motion: run the phase at once. */
  function animate() {
    if (WA.settings && !WA.settings.anim) return false;
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* The one place a player death is declared, so a hit taken during the paced
     phase ends the run the same way a hit taken during an action does. */
  function collapse(s) {
    if (!s || s.hp > 0 || s.dead) return false;
    s.hp = 0;
    s.dead = true;
    WA.game.say('You collapse in the dust. Game over.');
    return true;
  }

  function finish(s) {
    timer = 0;
    busy = false;
    resume = null;
    skipNow = false;
    // A load can replace the state mid-phase; then only the board is redrawn.
    const live = WA.game.S === s;
    if (live) {
      s.sneakMoved = false;
      s.stealthLight = null;
      collapse(s);
    }
    WA.game.updateVis();
    WA.view.draw();
    // Anything that spent the last AP while the phase was running gets its own
    // turn now, rather than a free round.
    if (live && again && !s.dead) { again = false; round(s); }
  }

  /* Both world phases run through the same beat: one action, one redraw. A
     skip (skipNow) instead runs the rest of the phase in this tick and lets
     finish() paint the board once. */
  function beats(s, src, done) {
    const beat = () => {
      timer = 0;
      resume = beat;
      if (WA.game.S !== s || s.dead || s.hp <= 0 || !src.next()) {
        resume = null;
        return done();
      }
      if (skipNow) return beat();
      WA.game.updateVis();
      WA.view.draw();
      timer = setTimeout(beat, beatMs());
    };
    resume = beat;
    // The first action waits a beat as well, so the player's own move is painted
    // on its own before the world starts moving around it.
    if (skipNow) return beat();
    timer = setTimeout(beat, beatMs());
  }

  /* Finish the rest of the world's turn now: the remaining enemy actions, then
     the companions, resolve in one tick and the board is painted once. The
     world's turn is long enough to watch, and sometimes you would rather not. */
  function skip() {
    if (!busy || !resume) return false;
    if (timer) clearTimeout(timer);
    timer = 0;
    skipNow = true;
    const beat = resume;
    resume = null;
    beat();
    return true;
  }

  /* Companions take their turn after the enemies, once the player is safe, and
     at the same pace: a follower crossing a corridor walks it. */
  function allies(s) {
    if (s.hp <= 0 || !WA.party) return finish(s);
    if (!animate() || !WA.party.begin || !WA.party.next) {
      WA.party.turn();
      return finish(s);
    }
    if (!WA.party.begin()) return finish(s);
    beats(s, WA.party, () => finish(s));
  }

  function phase(s) {
    if (!WA.ai || !WA.ai.begin || !animate()) {
      WA.ai.turn();
      return allies(s);
    }
    busy = true;
    if (!WA.ai.begin()) return allies(s);
    beats(s, WA.ai, () => allies(s));
  }

  /* A load or a new game replaces the world mid-phase: drop the pending beat,
     the queued turn and both phase queues so nothing from the old state keeps
     acting on the new one. */
  function cancel() {
    if (timer) clearTimeout(timer);
    timer = 0;
    busy = false;
    again = false;
    resume = null;
    skipNow = false;
    if (WA.ai && WA.ai.cancel) WA.ai.cancel();
    if (WA.party && WA.party.cancel) WA.party.cancel();
  }

  /* The world's turn. It runs once the player's AP is spent and refills the
     pool for the next player phase. */
  function round(s) {
    if (busy) { again = true; return; }
    s.ap = WA.char.maxAp();
    s.round = (s.round | 0) + 1;
    if (s.hp <= 0) return;
    // Enemy detection needs current light at the player, not last frame's light.
    if (s.sneak) s.stealthLight = WA.light.stealth(s);
    phase(s);
  }

  /* `force` pays AP even while a panel is open. A panel only stops the world
     from acting between actions; taking a Stimpak, a chem, RadAway or a
     Doctor's check from the Pip-Boy is still an action and costs its AP. */
  function end(used, apCost, force) {
    const s = S();
    if (!s) return;
    if (used && (force || !paused())) {
      s.turn++;
      // The action pays for itself; the world only acts when the pool is empty.
      const cost = Math.max(0, apCost == null ? STEP : apCost | 0);
      s.ap = Math.max(0, (s.ap | 0) - cost);
      if (s.shaken && s.shaken.turns > 0) {
        s.shaken.turns--;
        if (s.shaken.turns <= 0) {
          delete s.shaken;
          WA.game.say('Your hands steady.');
        }
      }
      WA.status.tickPlayer(s);
      // Damage over time follows the clock, so enemy effects tick once per
      // action exactly as the player's own do.
      if (Array.isArray(s.ents)) {
        for (const e of [...s.ents]) {
          if (e && Array.isArray(e.fx) && e.fx.length) WA.status.tickEntity(e);
        }
      }
      // People follow the same clock as the daylight: shifts change at the hour.
      if (WA.sched) WA.sched.sync(s);
      if (s.hp > 0 && s.ap <= 0) round(s);
    }
    collapse(s);
    WA.game.updateVis();
    WA.view.draw();
    // A forced action can spend AP, empty the pool and refill it, so the open
    // Pip-Boy needs the new HP and AP rather than the numbers it was built with.
    if (force && WA.pip && WA.pip.isOpen() && WA.pip.render) WA.pip.render();
  }

  function playerMove(dx, dy, tgt) {
    const s = S();
    if (!s || s.dead || paused()) return;
    if (WA.combat) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;

    // You turn the way you push, even when the move itself is refused.
    s.face = U.faceTo(dx, dy) || s.face || 's';
    const nx = s.px + dx, ny = s.py + dy;
    const e = tgt || WA.game.entAt(nx, ny);
    let used = true, search = '';
    // A step costs one point; walking into an enemy pays the weapon's cost.
    let cost = STEP;

    if (e) {
      if (e.d && e.d.ally) {
        // Step past a companion instead of swinging at them, so a follower can
        // never block a one-tile corridor.
        const ax = e.x, ay = e.y, bx = s.px, by = s.py;
        WA.game.moveEntity(e, bx, by);
        s.px = ax; s.py = ay;
        if (s.sneak) s.sneakMoved = true;
        WA.game.say(`${e.d.name} makes room.`);
        end(true);
        return;
      }
      if (e.d && e.d.talk) { if (WA.dlg) WA.dlg.open(e.id); return; }
      if (s.weapon && WA.weapons.isBroken(s.weapon)) {
        used = false;
        WA.game.say(`Your ${WA.GAME.items[s.weapon].name} is broken.`);
      } else {
        const sneak = WA.field ? WA.field.sneakAttack(e) : false;
        WA.weapons.use();
        const wp = s.weapon ? WA.GAME.items[s.weapon] : null;
        cost = WA.combat ? WA.combat.attackCost(wp) : 3;
        const skill = WA.skills.weaponSkill(wp);
        if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
          WA.game.say(`Jinxed! You fumble the attack on the ${e.d.name}.`);
        } else if (WA.combat && WA.combat.criticalFailure(wp, false)) {
          // A critical failure uses the action; the fumble effect was logged.
        } else if (Math.random() * 100 > WA.skills.chanceFor(skill, 1, 0, wp)) {
          WA.game.say(`You miss the ${e.d.name} (${WA.skills.BY[skill].name} ${WA.skills.value(skill)}%).`);
        } else WA.combat.playerAttack(e, sneak
          ? { mul: WA.perks ? WA.perks.sneakMul(2) : 2, tag: 'Sneak attack! ' }
          : {});
        if (sneak) WA.field.breakSneak();
      }
    } else {
      const t = WA.GAME.tiles[s.grid[ny] && s.grid[ny][nx]] || WA.GAME.tiles.wall;
      // Locked things list the item they need; anything you own opens them.
      if (t.needs && !WA.inv.hasKey(t.needs)) {
        used = false;
        const need = WA.GAME.items[t.needs];
        WA.game.say(t.msg || `It needs the ${need ? need.name : t.needs}.`);
      } else if (t.opens) {
        s.grid[ny][nx] = t.opens;
        WA.game.say('You pry the door open.');
      } else if (t.solid) {
        used = false;
        // A hackable terminal opens its password panel instead of just a sign.
        if (t.hack && WA.hacking) WA.hacking.open(nx, ny);
        else if (t.msg) WA.game.say(t.msg);
      } else {
        s.px = nx; s.py = ny;
        if (s.sneak) s.sneakMoved = true;
        const k = nx + ',' + ny;
        const here = s.items[k] && WA.GAME.items[s.items[k]];
        if (here && here.type === 'container' && WA.loot) search = k;
        else if (s.items[k]) WA.inv.pickup(k);
        if (t.hurt) {
          const res = WA.damage.hurtPlayer(t.hurt, t.dt || 'melee');
          if (res.limb && res.limb.newlyCrippled) WA.game.say(`The ${t.name.toLowerCase()} cripples your ${res.limb.def.name}!`);
        }
        // A tile can apply an effect with or without damage: hazards poison,
        // med bays and chem pools hand out buffs.
        if (t.onHit && WA.status.EFX[t.onHit]) {
          WA.status.addPlayer(t.onHit, t.dur || 2, t.mag || 1);
          WA.game.say(`You are ${WA.status.EFX[t.onHit].state}.`);
        }
        if (t.rads) {
          const added = WA.rads.add(t.rads);
          if (added) WA.game.say(`You absorb ${added} rads.`);
        }
        if (t.heal) {
          const before = s.hp;
          const heal = t.heal + (WA.traits ? WA.traits.healBonus() : 0);
          s.hp = Math.min(WA.char.maxHp(), s.hp + heal);
          if (s.hp > before) WA.game.say(`You recover ${s.hp - before} HP.`);
        }
        if (t.msg) WA.game.say(t.msg);
        const to = t.exit && ((WA.GAME.maps[s.id].exits || {})[nx + ',' + ny]);
        if (to && WA.GAME.maps[to]) return WA.game.travel(to);
        if (t.exit) WA.game.say(t.exit);
      }
    }
    end(used, cost);
    // Searching happens after the turn resolves, so enemies still get to act.
    if (search) WA.loot.open(search);
  }

  function wait() {
    const s = S();
    if (!s || s.dead || paused()) return;
    if (WA.combat) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    WA.game.say('You wait.');
    // Waiting gives up whatever AP is left, so the world takes its turn now.
    s.ap = 0;
    end(true, 0);
  }

  WA.turn = { end, playerMove, wait, paused, cancel, skip, busy: () => busy };
})(window.WA = window.WA || {});
