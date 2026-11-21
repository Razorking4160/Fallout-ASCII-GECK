/* Music: two slow pieces built from oscillators, one for the boot title and one
   for the wasteland. There are no audio files, so the offline cache gains
   nothing and a file:// copy plays them too.

   The title is a modal D-minor motif over a drone and a chord pad. The play
   piece is slower and sparser, and it is mixed well under the effects and the
   place beds: it colours a session without ever asking to be listened to.

   One whole loop is scheduled at a time and a timer only tops the schedule up,
   so both pieces run on the audio clock rather than on page timers. */
(function (WA) {
  'use strict';

  /* `pad` is one root per bar, as MIDI notes; `melody` is [beat, note, beats]
     from the top of the loop. Every note is in D natural minor. */
  const TRACKS = {
    // The boot title: eight bars, Dm Dm Bb F Dm Bb C Am.
    title: {
      bpm: 54, level: 0.7,
      drone: [[38, 0.03], [45, 0.016]],
      pad: [50, 50, 46, 53, 50, 46, 48, 45],
      melody: [
        [0, 74, 2], [2, 72, 1], [3, 69, 1],
        [4, 65, 2], [6, 69, 2],
        [8, 70, 1.5], [9.5, 69, 1], [10.5, 67, 1.5],
        [12, 65, 2], [14, 62, 2],
        [16, 74, 2], [18, 72, 1], [19, 70, 1],
        [20, 69, 2], [22, 67, 2],
        [24, 65, 1.5], [25.5, 67, 1], [26.5, 69, 1.5],
        [28, 74, 3.5]
      ]
    },
    // The wasteland: four long bars, Dm Bb C Am, mostly rests.
    play: {
      bpm: 40, level: 0.24,
      drone: [[38, 0.024], [45, 0.014]],
      pad: [50, 46, 48, 45],
      melody: [
        [0, 74, 3], [4, 69, 2.5], [7, 65, 1.5],
        [8, 70, 3], [11.5, 67, 2],
        [12, 69, 2], [14.5, 65, 1.5]
      ]
    }
  };

  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const loopOf = t => t.pad.length * 4 * (60 / t.bpm);

  let bus = null, gain = null, timer = null, next = 0, drones = [], current = '';

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

  /* The low fifth that holds a piece together, started once. */
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

  /* One loop: the pads, the drone (started once), then the melody over them. */
  function schedule(c, start, t) {
    const beat = 60 / t.bpm, bar = beat * 4;
    for (let i = 0; i < t.pad.length; i++) {
      const at = start + i * bar;
      voice(c, at, bar * 0.98, hz(t.pad[i]), 'triangle', 0.022, 0.5);
      voice(c, at, bar * 0.98, hz(t.pad[i] + 7), 'sine', 0.016, 0.5);
    }
    for (const [b, midi, beats] of t.melody) {
      voice(c, start + b * beat, Math.max(0.2, beats * beat * 0.9), hz(midi), 'triangle', 0.11, 0.04);
    }
  }

  function tick() {
    if (!bus || !current) return;
    const c = bus.c, t = TRACKS[current], loop = loopOf(t);
    while (next < c.currentTime + loop * 0.75) {
      schedule(c, next, t);
      next += loop;
    }
  }

  function start(name) {
    const t = TRACKS[name];
    const b = WA.sfx && WA.sfx.bus ? WA.sfx.bus() : null;
    if (!t || !b) return false;
    if (timer) stop();
    bus = b;
    current = name;
    const c = b.c;
    gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(t.level, c.currentTime + 2.5);
    gain.connect(b.master);
    for (const [midi, level] of t.drone) drone(c, midi, level);
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
    current = '';
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

  /* Which piece belongs right now: the title over the boot menu, the wasteland
     one in play, nothing while hidden or muted. */
  function want() {
    if (document.hidden || (WA.settings && WA.settings.sound === false)) return '';
    if (WA.menu && WA.menu.isOpen && WA.menu.isOpen()) return 'title';
    return WA.game && WA.game.S ? 'play' : '';
  }

  /* Called when the menu, Sound, tab visibility or the map changes: the same
     piece keeps playing, a different one cross-fades in. */
  function sync() {
    const name = want();
    if (name === current && timer) return;
    if (timer) stop();
    if (name) start(name);
  }

  /* Browsers keep audio asleep until a gesture. The first click resumes the
     context and restarts the piece, because notes scheduled for a clock that
     was not running are already in the past. */
  function wake() {
    if (!timer || !bus || !bus.c.resume || bus.c.state !== 'suspended') return;
    const name = current;
    bus.c.resume().then(() => { if (timer) { stop(); start(name); } }).catch(() => {});
  }
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);
  document.addEventListener('visibilitychange', sync);

  WA.music = {
    play: start, stop, sync,
    isPlaying: () => !!timer,
    track: () => current
  };
})(window.WA = window.WA || {});
