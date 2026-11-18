/* Small settings that belong in localStorage. Saves and maps do not live here. */
(function (WA) {
  'use strict';
  const S = { fog: true, anim: true, crt: true };

  /* Difficulty is a device setting, not part of a save. Each preset feeds the
     systems directly, so changing it applies to the next hit or find. */
  const DIFFS = [
    { id: 'easy', name: 'Easy', incoming: 0.75, outgoing: 1.25, enemyAcc: -10, loot: 1.25,
      desc: 'Enemy hits hurt 25% less, your attacks deal 25% more, enemies aim 10% worse, and finds and shop stock are 25% richer.' },
    { id: 'normal', name: 'Normal', incoming: 1, outgoing: 1, enemyAcc: 0, loot: 1,
      desc: 'The intended balance. Enemy damage, your damage, accuracy and resources all use their standard values.' },
    { id: 'hard', name: 'Hard', incoming: 1.25, outgoing: 0.9, enemyAcc: 10, loot: 0.75,
      desc: 'Enemy hits hurt 25% more, your attacks deal 10% less, enemies aim 10% better, and finds and shop stock are 25% scarcer.' }
  ];
  const DIFF_BY = {};
  for (const d of DIFFS) DIFF_BY[d.id] = d;
  let D = 'normal';

  const diff = () => DIFF_BY[D] || DIFF_BY.normal;

  function read(key, fallback) {
    try {
      const v = localStorage.getItem('wasteland.' + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem('wasteland.' + key, value); return true; }
    catch (e) { return false; }
  }

  WA.settings = {
    DIFFS,
    get fog() { return S.fog; },
    get anim() { return S.anim; },
    get crt() { return S.crt; },
    get difficulty() { return D; },
    get difficultyDef() { return diff(); },
    incomingMul() { return diff().incoming; },
    outgoingMul() { return diff().outgoing; },
    enemyAcc() { return diff().enemyAcc; },
    lootMul() { return diff().loot; },
    init() {
      S.fog = read('fog', 'on') !== 'off';
      S.anim = read('anim', 'on') !== 'off';
      S.crt = read('crt', 'on') !== 'off';
      const stored = read('difficulty', 'normal');
      D = DIFF_BY[stored] ? stored : 'normal';
      this.applyAnim();
      this.applyCrt();
    },
    setDifficulty(id) {
      if (!DIFF_BY[id]) return false;
      D = id;
      write('difficulty', id);
      if (WA.pip && WA.pip.isOpen()) WA.pip.render();
      return true;
    },
    setCrt(v) {
      S.crt = !!v;
      write('crt', S.crt ? 'on' : 'off');
      this.applyCrt();
    },
    applyCrt() {
      const b = document.body;
      if (!b) return;
      b.classList.toggle('crt', S.crt);
      b.classList.toggle('no-crt', !S.crt);
    },
    setFog(v) {
      S.fog = !!v;
      write('fog', S.fog ? 'on' : 'off');
      if (WA.game && WA.game.S) { WA.game.updateVis(); WA.view.draw(); }
    },
    setAnim(v) {
      S.anim = !!v;
      write('anim', S.anim ? 'on' : 'off');
      this.applyAnim();
      if (WA.weather && WA.weather.refresh) WA.weather.refresh();
    },
    applyAnim() {
      const b = document.body;
      if (b) b.classList.toggle('noanim', !S.anim);
    }
  };
})(window.WA = window.WA || {});
