/* Enemy turns. Behaviour comes from the entity definition's `ai` field. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  function stepToward(e, tx, ty) {
    const path = WA.path.find(e.x, e.y, tx, ty, {
      maxNodes: 500,
      block: (x, y) => { const o = WA.game.entAt(x, y); return !!o && o !== e; }
    });
    if (path && path.length > 1) {
      const [nx, ny] = path[1];
      if (WA.game.free(nx, ny)) { WA.game.moveEntity(e, nx, ny); return true; }
    }
    // No route: fall back to the old greedy step so it never stands still.
    const dx = Math.sign(tx - e.x), dy = Math.sign(ty - e.y);
    const tries = Math.abs(tx - e.x) >= Math.abs(ty - e.y) ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      if (WA.game.free(e.x + mx, e.y + my)) { WA.game.moveEntity(e, e.x + mx, e.y + my); return true; }
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
      if (WA.game.free(e.x + dx, e.y + dy)) { WA.game.moveEntity(e, e.x + dx, e.y + dy); return true; }
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

  /* One enemy action. Shared by the normal enemy phase and by a
     sequence reaction before the player's action. */
  function act(e) {
    const s = S();
    if (!s || !s.ents.includes(e) || s.dead) return false;
    if (e.slow > 0) { e.slow--; return false; }
    if (e.cd > 0) { e.cd--; return false; }
    const d = e.d || {};
    if (d.talk || d.ally) return false; // people and companions do not take enemy turns
    e.preActed = 1;
    const tgt = pickTarget(e);
    const dist = U.cheb(e.x, e.y, tgt.x, tgt.y);
    const ai = d.ai || 'pursue';

    if (dist === 1) {
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

    if (ai === 'turret') {
      if (sees && dist <= (d.range || 5)) {
        WA.combat.enemyHit(e, true, tgt.ally);
        e.cd = Math.max(0, (d.rate || 2) - 1);
        return true;
      }
      return false;
    }

    if (ai === 'ranged' && sees && dist <= (d.range || 5)) {
      WA.combat.enemyHit(e, true, tgt.ally);
      e.cd = Math.max(0, (d.rate || 2) - 1);
      return true;
    }

    if (sees) return stepToward(e, tgt.x, tgt.y);
    if (e.last && ai !== 'wander') {
      stepToward(e, e.last[0], e.last[1]);
      if (e.x === e.last[0] && e.y === e.last[1]) e.last = null;
      return true;
    }
    if (ai === 'wander' && Math.random() < 0.5) return wander(e);
    return false;
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
      if (Array.isArray(e.fx) && e.fx.length) {
        WA.status.tickEntity(e);
        if (!s.ents.includes(e)) continue;
      }
      // A reaction already spent this round replaces the normal action.
      if (e.skipTurn === s.turn) { e.skipTurn = 0; continue; }
      act(e);
    }
  }

  WA.ai = { turn, act, stepToward, wander, pickTarget };
})(window.WA = window.WA || {});
