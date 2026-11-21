/* Sound effects, synthesised on the spot with Web Audio. There are no audio
   files: a shot is a noise burst, a hit is a falling tone, and the rest are a
   handful of short notes. That keeps the offline cache small and the whole
   game working from a file:// copy with nothing to fetch.

   Sound is presentation only, like the turn pace and the fx layer: the rules
   never read it, and a missing AudioContext just means silence. */
(function (WA) {
  'use strict';
  const MAX_VOICES = 6;
  let ctx = null, master = null, noise = null, live = 0, armed = false;

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
    if (live >= MAX_VOICES) return false;
    live++;
    setTimeout(() => { live = Math.max(0, live - 1); }, 700);
    return true;
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
    if (!noise) {
      const n = Math.ceil(c.sampleRate);
      noise = c.createBuffer(1, n, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
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

  WA.sfx = { shot, hit, death, pickup, levelUp, confirm, unlock, on };
  unlock();
})(window.WA = window.WA || {});
