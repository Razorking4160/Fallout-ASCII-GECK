/* The in-game clock. One world turn is two minutes, starting at Day 1, 08:00.
   Time is derived from the existing turn counter, so saves and paused panels
   need no second clock or timer. */
(function (WA) {
  'use strict';

  const START = 8 * 60;
  const PER_ACTION = 2;
  const DAY = 24 * 60;

  const minutes = s => START + Math.max(0, (s && s.turn) | 0) * PER_ACTION;
  const minuteOfDay = s => ((minutes(s) % DAY) + DAY) % DAY;
  const hour = s => Math.floor(minuteOfDay(s) / 60);
  const day = s => Math.floor(minutes(s) / DAY) + 1;

  function clock(s) {
    const m = minuteOfDay(s);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  const label = s => `DAY ${day(s)} ${clock(s)}`;
  const isNight = s => { const h = hour(s); return h >= 18 || h < 6; };

  /* Outdoor light multiplier: dark at night, bright through the day, with
     short dawn and dusk ramps. Indoor maps keep their authored ambient level. */
  function ambientFactor(s, map) {
    if (!map || map.indoor) return 1;
    const m = minuteOfDay(s);
    const t = Math.floor(m / 60) + (m % 60) / 60;
    if (t < 5) return 0.16;
    if (t < 6.5) return 0.16 + ((t - 5) / 1.5) * 0.49;
    if (t < 8) return 0.65 + ((t - 6.5) / 1.5) * 0.35;
    if (t < 17) return 1;
    if (t < 20) return 1 - ((t - 17) / 3) * 0.65;
    if (t < 21.5) return 0.35 - ((t - 20) / 1.5) * 0.19;
    return 0.16;
  }

  /* Spend time in bulk: travel and rest advance the same turn counter the
     clock is derived from, so there is still only one source of time. */
  function advance(s, mins) {
    if (!s) return 0;
    const turns = Math.max(1, Math.round((mins | 0) / PER_ACTION));
    s.turn = ((s.turn | 0) + turns) | 0;
    return turns * PER_ACTION;
  }

  WA.time = { START, PER_ACTION, minutes, minuteOfDay, hour, day, clock, label, isNight, ambientFactor, advance };
})(window.WA = window.WA || {});
