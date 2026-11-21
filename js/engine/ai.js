/* Enemy turns. Behaviour comes from the entity definition's `ai` field. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  /* Enemies carry an AP pool of their own, the way the player carries 6 +
     Agility, so a chase is not a one-tile crawl. A step costs 1 and an attack
     4. Sequence is the existing lever: a rat (2) gets 3 AP, an average raider
     (6) gets 5, and the quickest (10+) reaches the cap of 8. */
  const STEP = 1, ATTACK = 4, AP_MIN = 3, AP_MAX = 8;
  /* A gunner would rather shoot from two tiles than swing at one, so it treats
     that as the nearest distance worth holding. */
  const KEEP_AWAY = 2;

  function maxAp(e) {
    const seq = WA.combat ? WA.combat.enemySequence(e) : 4;
    return Math.max(AP_MIN, Math.min(AP_MAX, Math.round(seq / 2) + 2));
  }

  function stepTo(e, nx, ny) {
    e.face = U.faceTo(nx - e.x, ny - e.y) || e.face;
    WA.game.moveEntity(e, nx, ny);
  }

  /* Free neighbouring tiles that still hold a firing line on the target,
     roomiest first. Empty when every step would be out of its own range or
     shooting into a wall. */
  function firingSpots(e, tx, ty) {
    const reach = (e.d && e.d.range) || 5;
    const spots = [];
    for (const [dx, dy] of WA.path.DIRS) {
      const nx = e.x + dx, ny = e.y + dy;
      if (!WA.game.free(nx, ny)) continue;
      const d = U.cheb(nx, ny, tx, ty);
      if (d < KEEP_AWAY || d > reach) continue;
      if (!WA.vis.los(nx, ny, tx, ty)) continue;
      spots.push({ x: nx, y: ny, d });
    }
    return spots.sort((a, b) => b.d - a.d);
  }

  function stepToward(e, tx, ty) {
    const path = WA.path.find(e.x, e.y, tx, ty, {
      maxNodes: 500,
      block: (x, y) => { const o = WA.game.entAt(x, y); return !!o && o !== e; }
    });
    if (path && path.length > 1) {
      const [nx, ny] = path[1];
      if (WA.game.free(nx, ny)) {
        e.face = U.faceTo(nx - e.x, ny - e.y) || e.face;
        WA.game.moveEntity(e, nx, ny);
        return true;
      }
    }
    // No route: fall back to the old greedy step so it never stands still.
    const dx = Math.sign(tx - e.x), dy = Math.sign(ty - e.y);
    const tries = Math.abs(tx - e.x) >= Math.abs(ty - e.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      if (WA.game.free(e.x + mx, e.y + my)) {
        e.face = U.faceTo(mx, my) || e.face;
        WA.game.moveEntity(e, e.x + mx, e.y + my);
        return true;
      }
    }
    return false;
  }

  function wander(e) {
    const dirs = WA.path.DIRS.slice();
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      if (WA.game.free(e.x + dx, e.y + dy)) {
        e.face = U.faceTo(dx, dy) || e.face;
        WA.game.moveEntity(e, e.x + dx, e.y + dy);
        return true;
      }
    }
    return false;
  }

  /* Enemies go for whoever is closest and reachable: the player or a standing
     companion. A downed companion is left on the floor. */
  function pickTarget(e) {
    const s = S();
    let best = { x: s.px, y: s.py, ally: null };
    let bd = U.cheb(e.x, e.y, s.px, s.py);
    for (const a of s.ents) {
      if (!a.d || !a.d.ally || a.hp <= 0) continue;
      const dd = U.cheb(e.x, e.y, a.x, a.y);
      if (dd < bd) { bd = dd; best = { x: a.x, y: a.y, ally: a }; }
    }
    return best;
  }

  /* One enemy action, paid for out of the pool. Shared by the normal enemy
     phase and by a sequence reaction. Returns false when nothing was possible,
     which is also what ends that enemy's pool for the turn. */
  function act(e) {
    const s = S();
    if (!s || !s.ents.includes(e) || s.dead) return false;
    // A knockdown and a rate-of-fire cooldown both cost the whole action.
    if (e.slow > 0) return false;
    if (e.cd > 0) return false;
    const d = e.d || {};
    if (d.talk || d.ally) return false; // people and companions do not take enemy turns
    e.preActed = 1;
    const tgt = pickTarget(e);
    const dist = U.cheb(e.x, e.y, tgt.x, tgt.y);
    const ai = d.ai || 'pursue';
    // An attack is paid for up front and happens once per turn: leftover AP
    // buys movement, never a second hit before the player acts again.
    const canHit = !e.attacked && (e.ap | 0) >= ATTACK;

    // A gunner with the AP for a step and a shot backs out of arm's reach to
    // the roomiest firing line it can find, then fires from there on the next
    // pass of the pool. Too spent to do both, or cornered, it swings instead.
    if (ai === 'ranged' && dist === 1 && (e.ap | 0) >= STEP + ATTACK) {
      const spot = firingSpots(e, tgt.x, tgt.y)[0];
      if (spot) {
        stepTo(e, spot.x, spot.y);
        e.ap = Math.max(0, (e.ap | 0) - STEP);
        return true;
      }
    }

    if (dist === 1) {
      if (!canHit) return false;
      e.face = U.faceTo(tgt.x - e.x, tgt.y - e.y) || e.face;
      e.ap = Math.max(0, (e.ap | 0) - ATTACK);
      e.attacked = 1;
      WA.combat.enemyHit(e, false, tgt.ally);
      e.cd = Math.max(0, (d.rate || 1) - 1);
      return true;
    }

    const inSight = dist <= (d.sight || 6) && WA.vis.los(e.x, e.y, tgt.x, tgt.y);
    // Sneak gives a skill check to stay unnoticed at more than arm's reach,
    // but it only hides the player: a companion is plainly visible.
    const hidden = !tgt.ally && inSight && dist > 1 && s.sneak && WA.field && WA.field.staysHidden(e, dist);
    const sees = inSight && !hidden;
    if (sees) {
      e.last = [tgt.x, tgt.y];
      if (!tgt.ally && s.sneak && WA.field) WA.field.spotted(e);
    }

    // Losing the line is not blindness: a gunner shifts to a tile that can
    // see the target before it advances on the sound of it.
    if (ai === 'ranged' && !inSight && dist <= (d.sight || 6) && (e.ap | 0) >= STEP) {
      const spot = firingSpots(e, tgt.x, tgt.y)[0];
      if (spot) {
        stepTo(e, spot.x, spot.y);
        e.ap = Math.max(0, (e.ap | 0) - STEP);
        return true;
      }
    }

    if (ai === 'turret') {
      if (sees && canHit && dist <= (d.range || 5)) {
        e.face = U.faceTo(tgt.x - e.x, tgt.y - e.y) || e.face;
        e.ap = Math.max(0, (e.ap | 0) - ATTACK);
        e.attacked = 1;
        WA.combat.enemyHit(e, true, tgt.ally);
        e.cd = Math.max(0, (d.rate || 2) - 1);
        return true;
      }
      return false;
    }

    if (ai === 'ranged' && sees && canHit && dist <= (d.range || 5)) {
      e.face = U.faceTo(tgt.x - e.x, tgt.y - e.y) || e.face;
      e.ap = Math.max(0, (e.ap | 0) - ATTACK);
      e.attacked = 1;
      WA.combat.enemyHit(e, true, tgt.ally);
      e.cd = Math.max(0, (d.rate || 2) - 1);
      return true;
    }

    if ((e.ap | 0) < STEP) return false;
    let moved = false;
    if (sees) {
      // A gunner that has already fired holds that ground; leftover AP must
      // not walk it back into the reach it just left.
      if (ai === 'ranged' && e.attacked) return false;
      moved = stepToward(e, tgt.x, tgt.y);
    } else if (e.last && ai !== 'wander') {
      moved = stepToward(e, e.last[0], e.last[1]);
      if (e.x === e.last[0] && e.y === e.last[1]) e.last = null;
    } else if (ai === 'wander' && Math.random() < 0.5) moved = wander(e);
    if (moved) e.ap = Math.max(0, (e.ap | 0) - STEP);
    return moved;
  }

  /* A sequence reaction is its own one-action turn: a fresh pool, one action. */
  function react(e) {
    if (!e) return false;
    e.ap = maxAp(e);
    e.attacked = 0;
    return act(e);
  }

  function turn() {
    const s = S();
    if (!s) return;

    // Enemies act in sequence order, highest first. The player's own action is
    // resolved separately; this order matters for who reaches whom first.
    const order = [...s.ents].filter(e => !(e.d && e.d.ally)).sort((a, b) => {
      if (!WA.combat) return 0;
      return WA.combat.enemySequence(b) - WA.combat.enemySequence(a);
    });
    for (const e of order) {
      if (!s.ents.includes(e)) continue;
      // Status effects tick once per action in turn.end(), so a reaction does
      // not double-tick them by acting here.
      // A reaction already spent this phase replaces the normal action.
      if (e.reacted) { e.reacted = 0; continue; }
      // A knockdown costs the phase; so does a rate-of-fire cooldown, which is
      // counted in turns rather than actions.
      if (e.slow > 0) { e.slow--; continue; }
      if (e.cd > 0) { e.cd--; continue; }
      // Refresh the pool, then spend it: steps until the AP runs out, with at
      // most one attack in between.
      e.ap = maxAp(e);
      e.attacked = 0;
      for (let guard = e.ap + 1; e.ap > 0 && guard > 0; guard--) {
        if (!s.ents.includes(e) || s.dead || s.hp <= 0) break;
        const before = e.ap;
        if (!act(e)) break;
        // An action that spent nothing would loop forever.
        if (e.ap >= before) break;
      }
    }
  }

  WA.ai = { turn, act, react, stepToward, wander, pickTarget };
})(window.WA = window.WA || {});
