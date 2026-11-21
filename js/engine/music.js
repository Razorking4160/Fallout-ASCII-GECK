/* Music: the title theme, built from oscillators like every other sound here.
   There is no audio file, so the offline cache gains nothing and a file:// copy
   plays it too. It is a slow D-minor motif over a drone and a soft chord pad,
   and it belongs to the boot title: it stops the moment play starts, so a
   place's ambience is never competing with it.

   One whole loop is scheduled at a time and a timer only tops the schedule up,
   so the piece runs on the audio clock rather than on page timers. */
(function (WA) {
  'use strict';
  const BEAT = 60 / 54;          // a slow walk
  const BAR = BEAT * 4;
  const LOOP = BAR * 8;
  const LEVEL = 0.7;             // the piece's own bus, under the shared master

  /* The pad's root per bar, as MIDI notes: Dm Dm Bb F Dm Bb C Am. */
  const PAD = [50, 50, 46, 53, 50, 46, 48, 45];
  /* Melody as [beat from the top of the loop, note, length in beats]. Every
     note is in D natural minor, so the eight bars repeat without a key change. */
  const MELODY = [
    [0, 74, 2], [2, 72, 1], [3, 69, 1],
    [4, 65, 2], [6, 69, 2],
    [8, 70, 1.5], [9.5, 69, 1], [10.5, 67, 1.5],
    [12, 65, 2], [14, 62, 2],
    [16, 74, 2], [18, 72, 1], [19, 70, 1],
    [20, 69, 2], [22, 67, 2],
    [24, 65, 1.5], [25.5, 67, 1], [26.5, 69, 1.5],
    [28, 74, 3.5]
  ];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  let bus = null, gain = null, timer = null, next = 0, drones = [];

  /* One note: a short swell, a long tail, then silence. */
  function voice(c, at, dur, freq, type, level, attack) {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + (attack || 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(gain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /* The low fifth that holds the whole piece together, started once. */
  function drone(c, midi, level) {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz(midi);
    g.gain.value = level;
    osc.connect(g);
    g.connect(gain);
    osc.start(c.currentTime + 0.05);
    drones.push(g, osc);
  }

  /* One bar of pad: the root and its fifth under a slow swell. */
  function pad(c, at, midi) {
    voice(c, at, BAR * 0.98, hz(midi), 'triangle', 0.022, 0.5);
    voice(c, at, BAR * 0.98, hz(midi + 7), 'sine', 0.016, 0.5);
  }

  function schedule(c, start) {
    for (let i = 0; i < PAD.length; i++) pad(c, start + i * BAR, PAD[i]);
    for (const [beat, midi, beats] of MELODY) {
      voice(c, start + beat * BEAT, Math.max(0.2, beats * BEAT * 0.9), hz(midi), 'triangle', 0.11, 0.04);
    }
  }

  function tick() {
    if (!bus) return;
    const c = bus.c;
    while (next < c.currentTime + LOOP * 0.75) {
      schedule(c, next);
      next += LOOP;
    }
  }

  function play() {
    if (timer) return true;
    const b = WA.sfx && WA.sfx.bus ? WA.sfx.bus() : null;
    if (!b) return false;
    bus = b;
    const c = b.c;
    gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(LEVEL, c.currentTime + 2.5);
    gain.connect(b.master);
    drone(c, 38, 0.03);   // D2 under everything
    drone(c, 45, 0.016);  // A2, the fifth
    next = c.currentTime + 0.25;
    tick();
    timer = setInterval(tick, 1000);
    return true;
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    const g = gain, b = bus, list = drones;
    gain = null;
    bus = null;
    drones = [];
    if (!g || !b) return;
    const t = b.c.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    } catch (e) {}
    // Notes already scheduled stop on their own; the drones need telling, and
    // the last one to end disconnects the bus so nothing is left connected.
    let last = null;
    for (const n of list) {
      try { if (n.stop) { n.stop(t + 0.85); last = n; } } catch (e) {}
    }
    if (last) last.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  /* The theme should play exactly while the boot menu is up, the tab is visible
     and sound is on. The menu, Sound and tab visibility all call this. */
  function want() {
    return !document.hidden &&
      !!(WA.menu && WA.menu.isOpen && WA.menu.isOpen()) &&
      (!WA.settings || WA.settings.sound !== false);
  }
  function sync() { if (want()) play(); else stop(); }

  /* Browsers keep audio asleep until a gesture. The first click on the title
     resumes the context and restarts the piece, because notes scheduled for a
     clock that was not running are already in the past. */
  function wake() {
    if (!timer || !bus || !bus.c.resume || bus.c.state !== 'suspended') return;
    bus.c.resume().then(() => { if (timer) { stop(); play(); } }).catch(() => {});
  }
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);
  document.addEventListener('visibilitychange', sync);

  WA.music = { play, stop, sync, isPlaying: () => !!timer };
})(window.WA = window.WA || {});
