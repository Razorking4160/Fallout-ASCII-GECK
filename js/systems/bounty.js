/* Bounties. Every catch raises notoriety, and notoriety puts a price on your
   head (S.bounty): 60 caps at 1, 150 at 2 and 300 at 3. A new day can send a
   bounty hunter after you when you arrive on a map or finish a rest. Sable the
   fence can burn the paper for its face value, which also clears notoriety.
   The hunter scales with the tier; the bounty itself does not fade on its own. */
(function (WA) {
  'use strict';
  const S = () => WA.game.S;
  const TIERS = [0, 60, 150, 300];

  const say = t => { if (WA.game && WA.game.say) WA.game.say(t); };
  const tier = n => TIERS[Math.max(0, Math.min(TIERS.length - 1, n | 0))] || 0;

  function raise(s) {
    s = s || S();
    if (!s) return 0;
    const value = tier(s.notoriety | 0);
    const before = s.bounty | 0;
    if (value > before) {
      s.bounty = value;
      say(`A ${value}-cap bounty is now on your head. Hunters will come looking.`);
      if (WA.save) WA.save.queueAutosave();
    }
    return s.bounty | 0;
  }

  function clear(s) {
    s = s || S();
    if (!s) return false;
    const had = s.bounty | 0;
    s.bounty = 0;
    s.notoriety = 0;
    // The contract is void, so hunters on this map and on maps left behind
    // stand down rather than waiting for the paper to be cancelled.
    const hunters = (s.ents || []).filter(e => e && e.id === 'bounty_hunter');
    for (const e of hunters) {
      if (WA.game.removeEntity) WA.game.removeEntity(e);
    }
    if (hunters.length && WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
    const world = WA.game.WORLD;
    for (const k in world || {}) {
      const w = world[k];
      if (w && Array.isArray(w.ents)) w.ents = w.ents.filter(e => e && e.id !== 'bounty_hunter');
    }
    say(had ? 'The paper burns. No one is looking for you now.' : 'There is no bounty on you.');
    if (hunters.length) say('The hunter lowers their weapon and walks away.');
    if (WA.save) WA.save.queueAutosave();
    return had > 0;
  }

  /* A free tile a few steps away, so the hunter arrives in sight but not on
     top of the player. Rings are tried outward; any direction is fine. */
  function spawnSpot(s) {
    const px = s.px | 0, py = s.py | 0;
    for (let r = 3; r <= 7; r++) {
      const spots = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
          if (WA.game.free(x, y)) spots.push([x, y]);
        }
      }
      if (spots.length) return spots[Math.floor(Math.random() * spots.length)];
    }
    return null;
  }

  /* Once per day, on a new map or after a rest, a hunter may find you. */
  function arrive(s) {
    s = s || S();
    if (!s || s.dead || (s.bounty | 0) <= 0) return false;
    const day = WA.time.day(s);
    if ((s.hunterDay | 0) >= day) return false;
    if ((s.ents || []).some(e => e && e.id === 'bounty_hunter' && e.hp > 0)) return false;
    const base = WA.GAME.entities.bounty_hunter;
    if (!base) return false;
    const spot = spawnSpot(s);
    if (!spot) return false;
    const n = Math.min(3, Math.max(0, s.notoriety | 0));
    // A single definition keeps saves and map relinking simple; the price
    // raises the hunter's staying power rather than swapping definitions.
    s.ents.push({
      x: spot[0], y: spot[1], id: 'bounty_hunter',
      hp: WA.scale.mobHp(base) + 8 * n, d: base,
      slow: 0, cd: 0, weak: 0, last: null, fx: []
    });
    s.hunterDay = day;
    if (WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
    if (WA.game.updateVis) WA.game.updateVis();
    say(`A bounty hunter steps out of the rubble. They are here for the ${s.bounty | 0}-cap price on your head.`);
    if (WA.save) WA.save.queueAutosave();
    return true;
  }

  WA.bounty = { TIERS, tier, raise, clear, arrive };
})(window.WA = window.WA || {});
