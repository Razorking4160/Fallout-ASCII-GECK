/* Combat: player attacks, enemy damage, kills and the Fire action. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  // Knockdowns are deliberately less frequent than a hit, or heavy weapons
  // would stun-lock every melee target.
  const KNOCK_WEAPON = 0.35, KNOCK_HEAVY = 0.2;
  const KNOCK_ENEMY = 0.3, KNOCK_ENEMY_HEAVY = 0.15;

  function kill(e, msg) {
    const s = S();
    if (WA.quests) WA.quests.onKill(e);
    WA.game.removeEntity(e);
    const c = e.d.caps ? Math.round(U.rnd(...WA.scale.mobCaps(e.d)) *
      (WA.perks ? WA.perks.capsMul() : 1) * (WA.settings ? WA.settings.lootMul() : 1)) : 0;
    s.caps += c;
    const intel = WA.traits ? WA.traits.sp(s.sp).I : s.sp.I;
    const xp = Math.round(WA.scale.mobXp(e.d) * (1 + (intel - 5) * 0.1));
    const death = msg || `You kill the ${e.d.name}!`;
    WA.game.say(WA.traits && WA.traits.has('bloody_mess')
      ? `${death} Blood and bone spray across the ground.` : death);
    if (c) WA.game.say(`You collect ${c} caps. +${xp} XP.`);
    else WA.game.say(`+${xp} XP.`);
    // Enemies with loot leave a searchable corpse; their dropped item goes inside.
    const k = e.x + ',' + e.y;
    const loot = (e.d.loot || []).filter(id => WA.GAME.items[id]);
    if (loot.length) {
      s.items[k] = 'corpse';
      s.loot = s.loot || {};
      s.loot[k] = { n: e.d.name + ' corpse', it: loot.slice() };
      WA.game.say(`The ${e.d.name} leaves a corpse you can search.`);
    }
    if (e.d.drop && WA.GAME.items[e.d.drop]) {
      if (s.loot[k]) s.loot[k].it.push(e.d.drop);
      else if (!s.items[k]) { s.items[k] = e.d.drop; WA.game.say(`It drops ${WA.GAME.items[e.d.drop].name}.`); }
    }
    WA.char.gainXp(xp);
  }

  /* ---------- knockback and critical failures ---------- */
  function knockEnemy(e, fromX, fromY) {
    const s = S();
    if (!s || !e || !e.d) return false;
    let dx = Math.sign(e.x - fromX), dy = Math.sign(e.y - fromY);
    // A blast centered on the target still pushes it away from the player.
    if (!dx && !dy) { dx = Math.sign(e.x - s.px); dy = Math.sign(e.y - s.py); }
    if (!dx && !dy) dx = 1;
    const tries = [[dx, dy], [dx, 0], [0, dy], [-dx, 0], [0, -dy]];
    let moved = false;
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      const nx = e.x + mx, ny = e.y + my;
      if (WA.game.free(nx, ny)) {
        WA.game.moveEntity(e, nx, ny);
        moved = true;
        break;
      }
    }
    // A knockdown costs the target its next action even if the push is blocked.
    e.slow = Math.max(e.slow | 0, 1);
    WA.game.say(`${e.d.name} ${moved ? 'is knocked back' : 'is knocked down'}.`);
    return moved;
  }

  function knockPlayer(fromX, fromY) {
    const s = S();
    if (!s || s.dead) return false;
    if (WA.perks && WA.perks.rank('stonewall')) {
      WA.game.say('You plant your feet and refuse to be moved.');
      return false;
    }
    const dx = Math.sign(s.px - fromX), dy = Math.sign(s.py - fromY);
    const tries = [[dx, dy], [dx, 0], [0, dy], [-dx, 0], [0, -dy]];
    let moved = false;
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      const nx = s.px + mx, ny = s.py + my;
      if (WA.game.free(nx, ny)) {
        s.px = nx;
        s.py = ny;
        moved = true;
        break;
      }
    }
    s.ap = Math.max(0, (s.ap | 0) - 2);
    if (WA.game.updateVis) WA.game.updateVis();
    WA.game.say(moved ? 'The blow knocks you back.' : 'The blow staggers you.');
    return moved;
  }

  function dropEquipped() {
    const s = S();
    if (!s || !s.weapon) return false;
    const id = s.weapon;
    if (!s.inv || !s.inv.includes(id)) return false;
    const spots = [[s.px, s.py]];
    for (let y = s.py - 1; y <= s.py + 1; y++) {
      for (let x = s.px - 1; x <= s.px + 1; x++) {
        if (x !== s.px || y !== s.py) spots.push([x, y]);
      }
    }
    for (const [x, y] of spots) {
      const k = x + ',' + y;
      if (s.items[k]) continue;
      if ((x !== s.px || y !== s.py) && !WA.game.free(x, y)) continue;
      s.inv.splice(s.inv.indexOf(id), 1);
      s.items[k] = id;
      s.weapon = null;
      WA.game.say(`Critical failure! Your ${WA.GAME.items[id].name} slips from your hands.`);
      return true;
    }
    return false;
  }

  function selfHit(wp, ranged) {
    const raw = U.rnd(...(wp && wp.dmg ? wp.dmg : WA.GAME.player.dmg));
    const type = (wp && wp.dt) || (ranged ? 'ballistic' : 'melee');
    const res = WA.damage.hurtPlayer(raw, type);
    WA.game.say(`Critical failure! You hit yourself for ${res.value}.`);
    if (res.limb && res.limb.newlyCrippled) WA.game.say(`Your ${res.limb.def.name} is crippled!`);
    return res.value;
  }

  /* Three percent chance on an attack. Effects are deliberately non-lethal to
     the attack itself, but the self-hit can still kill a badly wounded player. */
  function criticalFailure(wp, ranged) {
    const s = S();
    if (!s || s.dead || Math.random() >= 0.03) return false;
    const effects = [];
    if (s.weapon && s.inv && s.inv.includes(s.weapon) && wp && wp.type === 'weapon') {
      effects.push('drop');
    }
    const ammoId = wp && wp.ammo ? WA.inv.loadedAmmo(wp) : null;
    if (ammoId && WA.inv.ammoCount(ammoId) > 0) effects.push('ammo', 'ammo');
    effects.push('self', 'shaken');
    const kind = effects[Math.floor(Math.random() * effects.length)];
    if (kind === 'drop' && dropEquipped()) return true;
    if (kind === 'ammo') {
      const n = Math.min(WA.inv.ammoCount(ammoId), U.rnd(1, 3));
      s.ammo[ammoId] -= n;
      const d = WA.GAME.items[ammoId] || { name: 'ammo' };
      WA.game.say(`Critical failure! ${n} ${d.name.toLowerCase()} spill from your weapon.`);
      return true;
    }
    if (kind === 'shaken') {
      s.shaken = { turns: Math.max(3, (s.shaken && s.shaken.turns) | 0), pen: 10 };
      WA.game.say('Critical failure! Your hands shake (−10% to hit for 3 turns).');
      return true;
    }
    selfHit(wp, ranged);
    return true;
  }

  /* One player hit. opts carries VATS modifiers: mul, cripple, weak, tag. */
  function playerAttack(e, opts) {
    const s = S(), o = opts || {};
    // Aiming at someone turns you toward them, whether it is a bump or VATS.
    if (e) s.face = WA.util.faceTo(e.x - s.px, e.y - s.py) || s.face || 's';
    const wp = WA.GAME.items[s.weapon] || {};
    const esp = WA.traits ? WA.traits.sp(s.sp) : s.sp;
    const crit = Math.random() < Math.min(0.95, esp.L * 0.02 +
      (WA.perks ? WA.perks.critBonus() : 0) + (WA.traits ? WA.traits.critBonus() : 0));
    let d = U.rnd(...(wp.dmg || WA.GAME.player.dmg)) + (wp.range > 1 ? 0 : Math.floor((esp.S - 1) / 3));
    // Strength buffs only add to melee hits.
    if ((wp.range || 1) <= 1) d += WA.status.mod('strength');
    // Experience counts: every third level adds a point of damage.
    d += WA.scale.dmgBonus(s.lvl) + (WA.perks ? WA.perks.damageBonus(wp) : 0) +
      (WA.traits ? WA.traits.meleeBonus(wp) : 0);
    if (crit) d *= (WA.traits ? WA.traits.critMul(WA.perks ? WA.perks.critMul() : 2) : 2);
    if (WA.traits) d *= WA.traits.damageMul(crit);
    d = Math.max(1, Math.round(d * (o.mul || 1) * (s.weapon ? WA.weapons.factor(s.weapon) : 1)));
    const ammo = o.ammo ? (typeof o.ammo === 'string' ? WA.GAME.items[o.ammo] : o.ammo) : null;
    if (ammo && isFinite(ammo.dmgMul)) d = Math.max(1, Math.round(d * ammo.dmgMul));
    if (WA.settings) d = Math.max(1, Math.round(d * WA.settings.outgoingMul()));

    const type = wp.dt || (wp.range > 1 ? 'ballistic' : 'melee');
    if (o.cripple) e.slow = (e.slow || 0) + o.cripple;
    if (o.weak) e.weak = 1;
    const hit = WA.damage.hurtEnemy(e, d, type, ammo);

    if (WA.damage.slay(e)) return true;

    const notes = [];
    if (hit.res >= 0.25) notes.push('resisted');
    else if (hit.res <= -0.25) notes.push('weak point');
    if (o.cripple) notes.push('slowed');
    if (o.weak) notes.push('fumbles');
    if (wp.onHit && WA.status.addEntity(e, wp.onHit, 3, 1)) notes.push(WA.status.EFX[wp.onHit].state);
    if (crit && WA.status.addEntity(e, 'bleed', 2, 1)) notes.push('bleeding');

    WA.game.say(`${o.tag || ''}${crit ? 'Critical hit! ' : ''}You hit the ${e.d.name} for ${hit.value}` +
      (notes.length ? ' (' + notes.join(', ') + ')' : '') + '.');
    if (s.hp > 0) {
      const chance = wp.knockback ? KNOCK_WEAPON : d >= 9 ? KNOCK_HEAVY : 0;
      if (chance && Math.random() < chance) knockEnemy(e, s.px, s.py);
    }
    return true;
  }

  /* Sequence: 2 × effective Perception, plus Kamikaze's +5. Enemies use an
     authored `seq` or derive one from their sight. */
  function sequence() {
    const s = S();
    if (!s) return 0;
    const sp = WA.traits ? WA.traits.sp(s.sp)
      : (WA.addiction ? WA.addiction.sp(s.sp) : s.sp);
    return (sp.P | 0) * 2 + (WA.traits ? WA.traits.sequenceBonus() : 0);
  }

  function enemySequence(e) {
    const d = e && e.d ? e.d : {};
    if (typeof d.seq === 'number' && d.seq > 0) return d.seq;
    return Math.max(1, Math.round((d.sight || 4) / 2) * 2);
  }

  /* Enemy to-hit roll. Armour Class replaces the old flat dodge: Agility and
     worn armour make the attacker's roll harder. */
  function enemyChance(e, ranged) {
    const ac = WA.weapons.playerAc();
    const base = 75 + ((e && e.d && e.d.acc) | 0) + (ranged ? 5 : 0) +
      (WA.settings ? WA.settings.enemyAcc() : 0);
    return { chance: U.clamp(base - ac - (e && e.weak ? 30 : 0), 5, 95), ac };
  }

  /* A high-sequence enemy that is already in attack range gets one reaction
     before the player's action. It then skips its normal action that round. */
  function initiative() {
    const s = S();
    if (!s || s.dead) return 0;
    const pseq = sequence();
    const ready = s.ents.filter(e => {
      if (!e.d || e.d.talk || e.d.ally || e.preActed) return false;
      const dist = U.cheb(e.x, e.y, s.px, s.py);
      const reach = (e.d.ai === 'ranged' || e.d.ai === 'turret') ? (e.d.range || 5) : 1;
      return dist <= reach && WA.vis.los(e.x, e.y, s.px, s.py) && enemySequence(e) > pseq;
    }).sort((a, b) => enemySequence(b) - enemySequence(a));
    let n = 0;
    for (const e of ready) {
      e.preActed = 1;
      e.skipTurn = s.turn + 1;
      WA.game.say(`${e.d.name} reacts before you (sequence ${enemySequence(e)} vs ${pseq}).`);
      if (WA.ai && WA.ai.act) WA.ai.act(e);
      n++;
      if (s.dead || s.hp <= 0) break;
    }
    if (!s.dead && s.hp <= 0) {
      s.hp = 0;
      s.dead = true;
      WA.game.say('You collapse in the dust. Game over.');
      WA.game.updateVis();
      WA.view.draw();
    }
    return n;
  }

  /* A companion takes the hit instead of the player. Companions use their own
     AC and resistances, and go down through the party roster. */
  function allyHit(e, ranged, ally) {
    const d = ally.d || {};
    if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
      WA.game.say(`Jinxed! The ${e.d.name} fumbles and misses ${d.name}.`);
      return;
    }
    // A companion's armour adds AC and flat protection on top of the body's base AC.
    const g = WA.party && WA.party.gearStats ? WA.party.gearStats(ally.id) : null;
    const ac = g ? g.ac : ((d.ac | 0) || 14);
    const chance = U.clamp(75 + ((e.d.acc | 0)) + (ranged ? 5 : 0) - ac, 5, 95);
    if (Math.random() * 100 > chance) {
      WA.game.say(`${e.d.name} misses ${d.name} (AC ${ac}).`);
      return;
    }
    const type = e.d.dt || 'melee';
    const raw = U.rnd(...WA.scale.mobDmg(e.d));
    let value = g
      ? WA.damage.toPlayer(raw, type, g.def, g.res(type))
      : WA.damage.against(ally, raw, type).value;
    // Fortified chems soak direct hits, like the player's resist buff.
    const shield = WA.damage.BYPASS_ARMOR[type] || !WA.party || !WA.party.buffMod
      ? 0 : WA.party.buffMod(ally.id, 'resist');
    if (shield) value = Math.max(1, value - shield);
    WA.game.say(`${e.d.name} ${ranged ? 'shoots' : 'hits'} ${d.name} for ${value}.`);
    if (WA.party) WA.party.hurtById(ally.id, value, e);
  }

  /* Enemy hit on the player. Ranged attacks come from a distance. */
  function enemyHit(e, ranged, ally) {
    const s = S();
    if (ally) return allyHit(e, ranged, ally);
    if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
      WA.game.say(`Jinxed! The ${e.d.name} fumbles and misses.`);
      return;
    }
    const roll = enemyChance(e, ranged);
    if (Math.random() * 100 > roll.chance) {
      WA.game.say(`${e.d.name} misses you (AC ${roll.ac}).`);
      return;
    }
    const type = e.d.dt || 'melee';
    const raw = U.rnd(...WA.scale.mobDmg(e.d));
    const res = WA.damage.hurtPlayer(raw, type);
    const d = res.value, limb = res.limb;

    let msg = `${e.d.name} ${ranged ? 'shoots' : 'hits'} you for ${d}`;
    if (type !== 'melee') msg += ` (${type})`;
    if (e.d.onHit && WA.status.addPlayer(e.d.onHit, 3, 1)) msg += `. You are ${WA.status.EFX[e.d.onHit].state}`;
    WA.game.say(msg + '.');
    if (limb && limb.newlyCrippled) WA.game.say(`Your ${limb.def.name} is crippled!`);
    if (!ranged && s.hp > 0) {
      const chance = e.d.knockback ? KNOCK_ENEMY : raw >= 8 ? KNOCK_ENEMY_HEAVY : 0;
      if (chance && Math.random() < chance) knockPlayer(e.x, e.y);
    }
  }

  /* ---------- throwables ---------- */
  /* Explosives in the pack, in pack order. Throwing spends the first one. */
  function explosives() {
    const s = S();
    return (s.inv || []).filter(id => {
      const d = WA.GAME.items[id];
      return d && d.type === 'explosive';
    });
  }

  /* Nearest visible enemy within the item's throw range. */
  function throwTarget(d) {
    const s = S();
    const range = (d.range || 6) + (WA.perks ? WA.perks.throwRange() : 0);
    let best = null, bd = 999;
    for (const e of s.ents) {
      if (!e.d || e.d.talk || e.d.ally) continue;
      const dd = U.cheb(e.x, e.y, s.px, s.py);
      if (dd <= range && dd < bd && WA.vis.los(s.px, s.py, e.x, e.y)) { best = e; bd = dd; }
    }
    return best;
  }

  /* Everything within the blast radius takes damage, you included. */
  function blast(x, y, d) {
    const s = S();
    const r = Math.max(1, d.blast || 1);
    const type = d.dt || 'explosive';
    const roll = () => Math.max(1, Math.round(U.rnd(...(d.dmg || [3, 6]))));
    const fall = dd => (dd <= 0 ? 1 : dd === 1 ? 0.75 : 0.5);
    const caught = [];

    for (const e of [...s.ents]) {
      if (!e.d || e.d.talk || e.d.ally) continue;
      const dd = U.cheb(e.x, e.y, x, y);
      if (dd > r) continue;
      const base = Math.max(1, Math.round((roll() * fall(dd) + WA.scale.dmgBonus(s.lvl)) *
        (WA.perks ? WA.perks.explosiveMul() : 1) *
        (WA.settings ? WA.settings.outgoingMul() : 1)));
      const dmg = Math.max(1, Math.round(base * (WA.traits ? WA.traits.damageMul(false) : 1)));
      const hit = WA.damage.hurtEnemy(e, dmg, type);
      caught.push(e);
      WA.game.say(`The blast hits the ${e.d.name} for ${hit.value}.`);
      if (e.hp > 0) knockEnemy(e, x, y);
      if (d.onHit) WA.status.addEntity(e, d.onHit, d.dur || 3, d.mag || 1);
    }

    const pd = U.cheb(s.px, s.py, x, y);
    if (pd <= r) {
      const amount = Math.max(1, Math.round(roll() * fall(pd)));
      const res = WA.damage.hurtPlayer(amount, type);
      WA.game.say(`You are caught in the blast for ${res.value}.`);
      if (res.limb && res.limb.newlyCrippled) WA.game.say(`Your ${res.limb.def.name} is crippled!`);
      if (s.hp > 0 && pd > 0) knockPlayer(x, y);
      if (d.onHit) WA.status.addPlayer(d.onHit, d.dur || 3, d.mag || 1);
    }

    for (const e of caught) WA.damage.slay(e, `The ${e.d.name} is blown apart.`);
  }

  function throwItem() {
    const s = S();
    if (!s || s.dead || WA.ui.anyOpen()) return;
    const list = explosives();
    if (!list.length) { WA.game.say('You have nothing to throw.'); return WA.view.draw(); }
    const id = list[0], d = WA.GAME.items[id];
    const e = throwTarget(d);
    if (!e) {
      const reach = (d.range || 6) + (WA.perks ? WA.perks.throwRange() : 0);
      WA.game.say(`No target within ${reach} tiles.`); return WA.view.draw();
    }
    const dist = U.cheb(e.x, e.y, s.px, s.py);
    initiative();
    if (s.dead || s.hp <= 0) return;
    s.inv.splice(s.inv.indexOf(id), 1);
    const chance = WA.skills.chanceFor('throwing', dist);
    if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
      WA.game.say(`Jinxed! The ${d.name} slips from your hand and lands at your feet.`);
      blast(s.px, s.py, d);
    } else if (criticalFailure(d, false)) {
      // The fumble consumes the throw and the turn.
    } else if (Math.random() * 100 > chance) {
      // A missed throw lands beside the target, where the blast can still catch it.
      const bx = U.clamp(e.x + U.rnd(-1, 1), 0, s.w - 1);
      const by = U.clamp(e.y + U.rnd(-1, 1), 0, s.h - 1);
      WA.game.say(`Your throw goes wide (Throwing ${WA.skills.value('throwing')}%).`);
      blast(bx, by, d);
    } else {
      WA.game.say(`You throw the ${d.name} at the ${e.d.name}.`);
      blast(e.x, e.y, d);
    }
    WA.turn.end(true);
  }

  function fire() {
    const s = S();
    if (!s || s.dead || WA.ui.anyOpen()) return;
    const wp = WA.GAME.items[s.weapon] || {};
    const rng = wp.range || 1;
    if (rng < 2) { WA.game.say('Equip a ranged weapon first. For melee, walk into enemies.'); return WA.view.draw(); }
    if (s.weapon && WA.weapons.isBroken(s.weapon)) { WA.game.say(`Your ${wp.name} is broken.`); return WA.view.draw(); }
    const ammoId = wp.ammo ? WA.inv.loadedAmmo(wp) : null;
    if (wp.ammo && !WA.inv.ammoCount(ammoId)) {
      const a = WA.GAME.items[ammoId];
      WA.game.say(`Out of ${a ? a.name.toLowerCase() : 'ammo'}.`);
      return WA.view.draw();
    }

    let best = null, bd = 99;
    for (const e of s.ents) {
      if (e.d && (e.d.talk || e.d.ally)) continue;
      const dd = U.cheb(e.x, e.y, s.px, s.py);
      if (dd <= rng && dd < bd && WA.vis.los(s.px, s.py, e.x, e.y)) { best = e; bd = dd; }
    }
    if (!best) { WA.game.say('No target in range.'); return WA.view.draw(); }

    initiative();
    if (s.dead || s.hp <= 0) return;
    const burst = Math.max(1, wp.burst | 0);
    const shots = wp.ammo ? Math.min(burst, WA.inv.ammoCount(ammoId)) : burst;
    for (let i = 0; i < shots; i++) WA.inv.spendAmmo(ammoId);
    if (WA.weapons.use() === 'jam') {
      WA.game.say(`Your ${wp.name} jams!`);
      return WA.turn.end(true);
    }
    if (WA.traits && WA.traits.jinxed() && Math.random() < 0.05) {
      WA.game.say(`Jinxed! Your ${wp.name || 'weapon'} slips and the burst goes wild.`);
      return WA.turn.end(true);
    }
    if (criticalFailure(wp, true)) return WA.turn.end(true);
    if (shots > 1) WA.game.say(`The ${wp.name} fires ${shots} rounds.`);
    const spread = Math.max(0, wp.spread | 0);
    for (let i = 0; i < shots; i++) {
      if (!s.ents.includes(best)) break;
      const chance = WA.skills.chanceFor(WA.skills.weaponSkill(wp), bd, i * spread, wp);
      if (Math.random() * 100 > chance) {
        WA.game.say(shots > 1 ? `${wp.name} burst ${i + 1}/${shots}: miss.` : `You miss the ${best.d.name}.`);
        continue;
      }
      playerAttack(best, { ammo: ammoId, tag: shots > 1 ? `Burst ${i + 1}/${shots}: ` : '' });
    }
    if (WA.field) WA.field.breakSneak();
    WA.turn.end(true);
  }

  WA.combat = { playerAttack, enemyHit, enemyChance, sequence, enemySequence, initiative, fire, throwItem, explosives, throwTarget, blast, kill, knockPlayer, criticalFailure };
})(window.WA = window.WA || {});
