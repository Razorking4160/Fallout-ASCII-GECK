/* Karma and faction standing. Karma is one number; each faction keeps its own
   standing. Both live on the save so dialogue, prices and endings can read them
   later. Jobs and theft are the two sources: quest turn-ins raise them, and a
   caught theft lowers karma and the owner's faction standing.

   Values run -100..100. Karma labels are Good/Bad; faction labels are
   Liked/Hated. The thresholds match so a +40 job feels the same in both. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const MIN = -100, MAX = 100;
  // At or below this, a faction refuses trade, jobs and services until paid off.
  const HOSTILE = -60;

  const FACTIONS = {
    market: { name: 'Ruins Market', desc: 'Traders and keepers of the ruins market.' },
    vault: { name: 'Vault 42', desc: 'The vault crew and its technicians.' },
    road: { name: 'The Road', desc: 'Caravan guards, wardens and travellers.' }
  };

  // People are counted against a faction even though the entity keeps no
  // faction field of its own; this keeps old content untouched.
  const NPC_FACTION = {
    mira: 'market', keeper: 'market', dealer: 'market', fence: 'market',
    vale: 'vault',
    vera: 'road', ash: 'road'
  };

  const KARMA_TIERS = [
    { min: 60, name: 'Very Good', cls: 'good' },
    { min: 20, name: 'Good', cls: 'good' },
    { min: -19, name: 'Neutral', cls: 'dim' },
    { min: -59, name: 'Bad', cls: 'warn' },
    { min: -100, name: 'Very Bad', cls: 'bad' }
  ];
  const REP_TIERS = [
    { min: 60, name: 'Trusted', cls: 'good' },
    { min: 20, name: 'Liked', cls: 'good' },
    { min: -19, name: 'Neutral', cls: 'dim' },
    { min: -59, name: 'Disliked', cls: 'warn' },
    { min: -100, name: 'Hated', cls: 'bad' }
  ];

  const clamp = n => Math.max(MIN, Math.min(MAX, n | 0));
  const tierFor = (list, n) => list.find(t => n >= t.min) || list[list.length - 1];
  const karmaTier = n => tierFor(KARMA_TIERS, n | 0);
  const repTier = n => tierFor(REP_TIERS, n | 0);
  const factionOf = id => NPC_FACTION[id] || null;

  const value = () => {
    const s = S();
    return s ? clamp(s.karma | 0) : 0;
  };
  const rep = id => {
    const s = S();
    if (!s || !FACTIONS[id]) return 0;
    return clamp((s.rep || {})[id] | 0);
  };
  const factionName = id => (FACTIONS[id] ? FACTIONS[id].name : id);
  const hostileFaction = id => !!FACTIONS[id] && rep(id) <= HOSTILE;
  const hostile = id => hostileFaction(factionOf(id));

  // A `why` is for the log; without one the change is silent, which is what
  // dialogue effects normally want.
  function addKarma(n, why) {
    const s = S();
    if (!s || !n) return value();
    const before = clamp(s.karma | 0);
    s.karma = clamp(before + (n | 0));
    const delta = s.karma - before;
    if (delta && why) WA.game.say(`Karma ${delta > 0 ? '+' : ''}${delta} — ${why}.`);
    return s.karma;
  }

  function addRep(id, n, why) {
    const s = S();
    if (!s || !FACTIONS[id] || !n) return 0;
    if (!s.rep || typeof s.rep !== 'object') s.rep = {};
    const before = clamp(s.rep[id] | 0);
    s.rep[id] = clamp(before + (n | 0));
    const delta = s.rep[id] - before;
    if (delta && why) WA.game.say(`${FACTIONS[id].name} ${delta > 0 ? '+' : ''}${delta} — ${why}.`);
    return s.rep[id];
  }

  /* One call for a job or a conversation branch: { karma, rep, why }. */
  function adjust(delta) {
    if (!delta) return false;
    const why = delta.why || '';
    if (delta.karma) addKarma(delta.karma, why);
    if (delta.rep) {
      for (const id in delta.rep) addRep(id, delta.rep[id], why);
    }
    return true;
  }

  /* Called on start, travel, restore and any other state hand-off: fills in
     fields older saves do not have and clamps anything out of range. */
  function sync(s) {
    if (!s) return;
    s.karma = clamp(s.karma | 0);
    if (!s.rep || typeof s.rep !== 'object') s.rep = {};
    for (const id in s.rep) {
      if (!FACTIONS[id]) { delete s.rep[id]; continue; }
      s.rep[id] = clamp(s.rep[id] | 0);
    }
    for (const id in FACTIONS) {
      if (s.rep[id] === undefined) s.rep[id] = 0;
    }
  }

  function html() {
    const s = S();
    if (!s) return '';
    const v = value(), kt = karmaTier(v);
    const head = `<div class="prow"><span>Karma</span>` +
      `<span class="${kt.cls}">${kt.name} <b>${v}</b></span></div>`;
    const rows = Object.keys(FACTIONS).map(id => {
      const n = rep(id), rt = repTier(n);
      const h = n <= HOSTILE ? ' <small class="bad">hostile</small>' : '';
      return `<div class="prow"><span title="${U.esc(FACTIONS[id].desc)}">${U.esc(FACTIONS[id].name)}</span>` +
        `<span class="${rt.cls}">${rt.name} <small class="dim">${n}</small>${h}</span></div>`;
    }).join('');
    return head + rows;
  }

  WA.reputation = {
    MIN, MAX, HOSTILE, FACTIONS, NPC_FACTION, KARMA_TIERS, REP_TIERS,
    value, rep, karmaTier, repTier, factionOf, factionName, hostile, hostileFaction,
    addKarma, addRep, adjust, sync, html
  };
})(window.WA = window.WA || {});
