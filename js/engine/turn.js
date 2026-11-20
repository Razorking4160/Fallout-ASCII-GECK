/* Turn handling: one player action, then one world turn, then one redraw. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  // An open panel pauses the world: no world turn, no enemy actions.
  const paused = () => WA.ui.paused();

  function end(used) {
    const s = S();
    if (!s) return;
    if (used && !paused()) {
      s.turn++;
      s.ap = Math.min(WA.char.maxAp(), s.ap + 1);
      if (s.shaken && s.shaken.turns > 0) {
        s.shaken.turns--;
        if (s.shaken.turns <= 0) {
          delete s.shaken;
          WA.game.say('Your hands steady.');
        }
      }
      WA.status.tickPlayer(s);
      if (s.hp > 0) {
        // Enemy detection needs current light at the player, not last frame's light.
        if (s.sneak) s.stealthLight = WA.light.stealth(s);
        WA.ai.turn();
        // Companions take their turn after the enemies, once the player is safe.
        if (s.hp > 0 && WA.party) WA.party.turn();
      }
      // People follow the same clock as the daylight: shifts change at the hour.
      if (WA.sched) WA.sched.sync(s);
      s.sneakMoved = false;
      s.stealthLight = null;
    }
    if (s.hp <= 0) {
      s.hp = 0;
      s.dead = true;
      WA.game.say('You collapse in the dust. Game over.');
    }
    WA.game.updateVis();
    WA.view.draw();
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
    end(used);
    // Searching happens after the turn resolves, so enemies still get to act.
    if (search) WA.loot.open(search);
  }

  function wait() {
    const s = S();
    if (!s || s.dead || paused()) return;
    if (WA.combat) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    WA.game.say('You wait.');
    end(true);
  }

  WA.turn = { end, playerMove, wait, paused };
})(window.WA = window.WA || {});
