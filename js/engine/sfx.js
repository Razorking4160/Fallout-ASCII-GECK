/* Sound effects and ambience, synthesised on the spot with Web Audio. There are
   no audio files: a shot is a noise burst, a hit is a falling tone, and a place
   is a looping bed of filtered noise with a slow wobble. That keeps the offline
   cache small and the whole game working from a file:// copy with nothing to
   fetch.

   Sound is presentation only, like the turn pace and the fx layer: the rules
   never read it, and a missing AudioContext just means silence. Ambience runs
   under its own gain, outside the voice cap, so a firefight never starves it
   and it never eats one of the short sounds. */
(function (WA) {
  'use strict';
  const MAX_VOICES = 6;
  const AMB_LEVEL = 0.5;
  let ctx = null, master = null, noise = null, loopNoise = null, armed = false;
  // Each voice holds its slot until its release time. Checking that list is
  // better than a setTimeout: a backgrounded tab throttles timers, which would
  // leave the cap stuck shut long after the tab comes back.
  const voices = [];
  let ambKind = '', ambGain = null, ambNodes = [], ambTimers = [];

  function on() {
    return !WA.settings || WA.settings.sound !== false;
  }

  /* The context is created on first use and resumed on the first press. A
     browser that has not seen a gesture yet starts it suspended, and the
     scheduled notes play once it wakes. */
  function audio() {
    if (!on()) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.3;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    return ctx;
  }

  function unlock() {
    if (armed) return;
    armed = true;
    const wake = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
  }

  function voice() {
    const now = Date.now();
    while (voices.length && voices[0] <= now) voices.shift();
    if (voices.length >= MAX_VOICES) return false;
    voices.push(now + 700);
    return true;
  }

  function noiseBuffer(c, seconds) {
    const n = Math.ceil(c.sampleRate * seconds);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* One oscillator with a short attack and an exponential tail. */
  function tone(c, o) {
    const t0 = c.currentTime + (o.delay || 0);
    const end = t0 + o.dur;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, end);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.15, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(end + 0.02);
  }

  /* A burst of white noise through a sweeping lowpass: the body of a shot or
     the air of a death. */
  function hiss(c, o) {
    if (!noise) noise = noiseBuffer(c, 1);
    const t0 = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.cut || 2400, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, 0, o.dur + 0.02);
  }

  function play(fn) {
    const c = audio();
    if (!c || !voice()) return false;
    try { fn(c); return true; }
    catch (e) { return false; }
  }

  const shot = () => play(c => {
    hiss(c, { dur: 0.13, cut: 3200, to: 420, gain: 0.26 });
    tone(c, { type: 'square', from: 190, to: 62, dur: 0.09, gain: 0.12 });
  });

  /* Your own hit is lower and harder; a hit on anything else is a flatter
     thud, so the two are told apart without looking at the log. */
  function hit(onPlayer) {
    return play(c => {
      tone(c, { type: 'sine', from: onPlayer ? 150 : 210, to: 58, dur: 0.16, gain: onPlayer ? 0.3 : 0.2 });
      hiss(c, { dur: 0.06, cut: 900, gain: 0.06 });
    });
  }

  const death = () => play(c => {
    tone(c, { type: 'sawtooth', from: 170, to: 40, dur: 0.42, gain: 0.14 });
    hiss(c, { dur: 0.34, cut: 1800, to: 150, gain: 0.14 });
  });

  const pickup = () => play(c => {
    tone(c, { type: 'triangle', from: 660, to: 660, dur: 0.08, gain: 0.16 });
    tone(c, { type: 'triangle', from: 990, to: 990, dur: 0.1, gain: 0.16, delay: 0.07 });
  });

  const levelUp = () => play(c => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(c, { type: 'triangle', from: f, to: f, dur: 0.16, gain: 0.16, delay: i * 0.09 }));
  });

  /* Turning sound on in Options should prove itself immediately. */
  const confirm = () => pickup();

  /* An ambience bed: looping filtered noise. `wobble` is a slow sine on the
     filter's cutoff, which is what turns flat hiss into wind, rain or moving
     water. Everything hangs off ambGain so a place change can fade it as one. */
  function bed(c, o) {
    if (!loopNoise) loopNoise = noiseBuffer(c, 2);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = loopNoise;
    src.loop = true;
    f.type = o.type || 'bandpass';
    f.frequency.value = o.cut;
    f.Q.value = o.q || 0.7;
    g.gain.value = o.gain;
    src.connect(f);
    f.connect(g);
    g.connect(ambGain);
    // A random start offset keeps two beds of the same noise out of phase.
    src.start(c.currentTime + 0.02, Math.random() * 1.5);
    ambNodes.push(src, f, g);
    if (o.wobble) {
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = o.wobble.rate;
      depth.gain.value = o.wobble.amount;
      lfo.connect(depth);
      depth.connect(f.frequency);
      lfo.start(c.currentTime + 0.02);
      ambNodes.push(lfo, depth);
    }
  }

  function drone(c, hz, gain, type) {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = hz;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ambGain);
    osc.start(c.currentTime + 0.02);
    ambNodes.push(osc, g);
  }

  /* A water drop: a short sine falling in pitch, quiet enough to sit under the
     pump noise rather than read as an event. */
  function drip(c) {
    const t0 = c.currentTime + 0.01, hz = 620 + Math.random() * 980;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, t0);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.55, t0 + 0.13);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
    osc.connect(g);
    g.connect(ambGain);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  }

  function dripLoop(c) {
    ambTimers.push(setTimeout(() => {
      if (!ambGain) return;
      drip(c);
      dripLoop(c);
    }, 700 + Math.random() * 2400));
  }

  /* One builder per kind of place. A map names its kind with `ambience`; a map
     without one falls back to its indoor flag and weather, so authored maps
     from a content pack get something sensible. */
  const PLACES = {
    // A vault's air plant: low electrical hum with a breath of moving air.
    hum(c) {
      drone(c, 55, 0.05);
      drone(c, 110, 0.022, 'triangle');
      bed(c, { cut: 240, gain: 0.03, wobble: { rate: 0.06, amount: 90 } });
    },
    // Rain on open ground: a steady hiss over a low wind.
    rain(c) {
      bed(c, { type: 'highpass', cut: 900, gain: 0.05 });
      bed(c, { cut: 1500, gain: 0.055, q: 0.5, wobble: { rate: 0.11, amount: 400 } });
      bed(c, { cut: 320, gain: 0.05, wobble: { rate: 0.05, amount: 120 } });
      drone(c, 48, 0.025);
    },
    // Ruins in fog: wind that rises and falls, with nothing else in it.
    wind(c) {
      bed(c, { cut: 430, gain: 0.09, q: 0.8, wobble: { rate: 0.07, amount: 230 } });
      bed(c, { cut: 170, gain: 0.04, wobble: { rate: 0.03, amount: 60 } });
    },
    // Standing water and a dead pump: a wet bed with the odd drip.
    water(c) {
      bed(c, { cut: 520, gain: 0.055, q: 0.6, wobble: { rate: 0.09, amount: 180 } });
      drone(c, 62, 0.03);
      dripLoop(c);
    }
  };

  function place(S) {
    const m = S && WA.GAME && WA.GAME.maps && WA.GAME.maps[S.id];
    if (!m) return '';
    if (m.ambience) return PLACES[m.ambience] ? m.ambience : '';
    if (m.indoor) return 'hum';
    return m.weather === 'rain' ? 'rain' : 'wind';
  }

  function startAmbient(kind) {
    const c = audio();
    if (!c) return false;
    ambKind = kind;
    ambGain = c.createGain();
    const t = c.currentTime;
    ambGain.gain.setValueAtTime(0.0001, t);
    ambGain.gain.exponentialRampToValueAtTime(AMB_LEVEL, t + 1.4);
    ambGain.connect(master);
    try { PLACES[kind](c); }
    catch (e) { stopAmbient(); return false; }
    return true;
  }

  function stopAmbient() {
    ambKind = '';
    const c = ctx, g = ambGain, nodes = ambNodes, timers = ambTimers;
    ambGain = null;
    ambNodes = [];
    ambTimers = [];
    timers.forEach(clearTimeout);
    if (!g || !c) return;
    try {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
    } catch (e) {}
    // Old and new beds cross-fade: the caller can start the next kind at once.
    setTimeout(() => {
      for (const n of nodes) {
        try { if (n.stop) n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      }
      try { g.disconnect(); } catch (e) {}
    }, 560);
  }

  /* Called by the renderer with the state it is drawing. The same kind returns
     at once, so a redraw never rebuilds the bed. */
  function ambient(S) {
    if (!on() || (WA.menu && WA.menu.isOpen && WA.menu.isOpen())) {
      if (ambGain) stopAmbient();
      return false;
    }
    const kind = place(S);
    if (!kind) {
      if (ambGain) stopAmbient();
      return false;
    }
    if (kind === ambKind && ambGain) return true;
    if (ambGain) stopAmbient();
    return startAmbient(kind);
  }

  /* Sound off must silence what is already ringing, not just stop new sounds. */
  function setMuted(muted) {
    if (muted && ambGain) stopAmbient();
    if (!master || !ctx) return;
    const t = ctx.currentTime, g = master.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(muted ? 0.0001 : 0.3, t + 0.12);
    } catch (e) { g.value = muted ? 0.0001 : 0.3; }
  }

  // Coming back to the tab brings the place back up; leaving it hushes it.
  document.addEventListener('visibilitychange', () => {
    if (!ambGain || !ctx) return;
    const t = ctx.currentTime, g = ambGain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(document.hidden ? 0.0001 : AMB_LEVEL, t + 0.3);
    } catch (e) {}
  });

  WA.sfx = { shot, hit, death, pickup, levelUp, confirm, unlock, on, ambient, setMuted };
  unlock();
})(window.WA = window.WA || {});
