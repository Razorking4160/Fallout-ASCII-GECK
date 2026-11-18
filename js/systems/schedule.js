/* NPC schedules and shop hours. A definition can carry a schedule:

     schedule: { open: 8, close: 18, spot: [x, y], off: [x, y], shop: true }

   `open`/`close` are hours on the game clock and may wrap midnight, `spot` is
   where the character works, `off` is where they go outside those hours, and
   `shop: true` marks a trader whose dialogue options tagged `shop: true` are
   hidden while the stall is shut. Quest options stay visible, so a job can
   still be taken or handed in after hours.

   Schedules are re-applied whenever the clock moves (a turn, rest, travel, a
   save load), so people follow the same clock as the daylight, and nobody
   needs a second timer. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const spec = id => (WA.GAME.entities[id] && WA.GAME.entities[id].schedule) || null;
  const norm = h => ((h | 0) % 24 + 24) % 24;
  const hhmm = h => String(norm(h)).padStart(2, '0') + ':00';

  /* An hour window [from, to). Equal ends mean all day. */
  function inWindow(hour, from, to) {
    from = norm(from);
    to = norm(to);
    if (from === to) return true;
    return from < to ? hour >= from && hour < to : hour >= from || hour < to;
  }

  function openFor(id, s) {
    const sch = spec(id);
    if (!sch || sch.open === undefined || sch.close === undefined) return true;
    return inWindow(WA.time.hour(s || S()), sch.open, sch.close);
  }

  const shop = id => { const sch = spec(id); return !!(sch && sch.shop); };
  const shopClosed = (id, s) => shop(id) && !openFor(id, s);

  function hours(id) {
    const sch = spec(id);
    if (!sch || sch.open === undefined || sch.close === undefined) return '';
    return `${hhmm(sch.open)}–${hhmm(sch.close)}`;
  }

  function status(id, s) {
    const sch = spec(id);
    return {
      scheduled: !!sch,
      shop: shop(id),
      open: openFor(id, s),
      hours: hours(id),
      notice: notice(id, s)
    };
  }

  /* One line for the dialogue panel, empty while the character is at work. */
  function notice(id, s) {
    const sch = spec(id);
    if (!sch || openFor(id, s)) return '';
    const at = hhmm(sch.open);
    return sch.shop ? `CLOSED — the stall opens at ${at}.` : `OFF DUTY — back at ${at}.`;
  }

  const spotFor = (sch, id, s) => {
    if (!sch) return null;
    const onDuty = openFor(id, s);
    return onDuty ? (sch.spot || null) : (sch.off || sch.spot || null);
  };

  const visible = (s, e) => U.cheb(s.px, s.py, e.x, e.y) <= 8 &&
    WA.vis && WA.vis.los(s.px, s.py, e.x, e.y);

  /* Move everyone to the spot their hours call for. Only a real on/off duty
     change is announced, so re-syncing after a load stays quiet. */
  function sync(s) {
    s = s || S();
    if (!s || !Array.isArray(s.ents)) return false;
    let moved = false;
    for (const e of s.ents) {
      if (!e || !e.d || !e.d.schedule) continue;
      if (e.hp !== undefined && e.hp <= 0) continue;
      const onDuty = openFor(e.id, s);
      // Stock and caps top up a little at a time; a shut stall only advances
      // its own clock, so it does not bank a full refill for opening time.
      const restocked = WA.trade && WA.trade.restock ? WA.trade.restock(e.id, s) : false;
      const flipped = e.duty !== undefined && e.duty !== onDuty;
      e.duty = onDuty;
      const target = spotFor(e.d.schedule, e.id, s);
      if (!Array.isArray(target)) continue;
      const [tx, ty] = target;
      if ((tx === e.x && ty === e.y) || !WA.game.free(tx, ty)) continue;
      WA.game.moveEntity(e, tx, ty);
      e.last = null;
      moved = true;
      if (flipped && visible(s, e)) {
        WA.game.say(restocked
          ? `${e.d.name} restocks the ${e.d.schedule.shop ? 'stall' : 'post'}.`
          : onDuty
            ? `${e.d.name} returns to the ${e.d.schedule.shop ? 'stall' : 'post'} for the day.`
            : `${e.d.name} ${e.d.schedule.shop ? 'closes the stall' : 'stands down'} for the night.`);
      }
    }
    if (moved && WA.game.rebuildOccupancy) WA.game.rebuildOccupancy();
    return moved;
  }

  WA.sched = { spec, open: openFor, shop, shopClosed, hours, notice, status, spotFor, sync, inWindow };
})(window.WA = window.WA || {});
