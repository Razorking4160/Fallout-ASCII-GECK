/* The campaign epilogue. The Rust Sentinel job is the game's final arc:
   handing it in closes the road story. Bloody Mess changes the epilogue, which
   is its original Fallout 1 consequence. Karma and the faction you stood with
   add two closing paragraphs, snapshotted with the ending so replaying it later
   shows what you had earned at the time. The ending can be re-read from the
   Pip-Boy DATA screen. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const TITLE = 'THE ROAD EAST';
  const CLEAN = [
    'The Rust Sentinel goes dark. Its last light fades out across the ruins, and for the first time in years the road east is quiet.',
    'Mira pays what she promised and immediately starts talking about the next caravan. Vale seals the vault doors. The wasteland is still cruel, but one machine no longer owns the horizon.',
    'You walk on. Somewhere ahead, another settlement is waiting for someone who can survive the trip.'
  ];
  const BLOODY = [
    'The Rust Sentinel comes apart in a shower of sparks, hot oil and torn plating. Its last light paints the ruins red, then goes out.',
    'Mira pays what she promised and does not ask about the mess. By the time the next caravan arrives, the story has already grown: the vault dweller who left a machine painted across the concrete.',
    'You walk on. The wasteland remembers the noise.'
  ];

  const KARMA_LINES = {
    'Very Good': 'By the time you leave, the story has grown kinder than the truth. Settlements you never reached speak of the vault dweller who stopped for strangers.',
    'Good': 'You did not save the wastes, but you left more of it standing than you found. People remember that.',
    'Neutral': 'You took the job, did it clean and asked nothing extra. The road does not judge; it only continues.',
    'Bad': 'The job is done, but the stories follow you. Some doors are already closing, and some hands are already on weapons.',
    'Very Bad': 'The wastes will tell your name as a warning for years. There is no settlement left that would open its gate to you.'
  };

  const FACTION_LINES = {
    market: {
      friend: "Mira's market keeps your credit good. There is always a light on, a shelf with your name on it, and a drink you do not have to pay for.",
      neutral: 'The market takes your caps and gives you what you paid for. Nothing more, nothing less.',
      enemy: 'The market remembers what your hands took. Stalls fall quiet when you pass, and the guards watch your pockets.'
    },
    vault: {
      friend: 'Vault 42 logs you as a friend of the vault. When the doors cycle open, someone inside is always glad to see you.',
      neutral: 'Vault 42 seals itself behind you. You were useful, and now you are outside again.',
      enemy: 'Vault 42 has your face on a warning board. The doors will not cycle for you again.'
    },
    road: {
      friend: 'The road wardens pass your name along with the caravans. Out here, that is worth more than caps.',
      neutral: 'The road keeps its distance. You are another traveler with a gun and somewhere to be.',
      enemy: 'The road wardens have your description. Campfires go quiet when you come close.'
    },
    none: 'No camp claims you at the end. You walk out of the ruins owing nothing and owed nothing.'
  };

  const isOpen = () => { const el = U.el('ending'); return !!el && !el.hidden; };

  const karmaLine = n => (WA.reputation
    ? KARMA_LINES[WA.reputation.karmaTier(n).name] || KARMA_LINES.Neutral
    : KARMA_LINES.Neutral);

  function factionLine(id, standing) {
    const set = id && FACTION_LINES[id];
    if (!set) return FACTION_LINES.none;
    if (standing >= 20) return set.friend;
    if (standing <= -20) return set.enemy;
    return set.neutral;
  }

  /* The faction that ended up owing you the most; null when nobody does. */
  function leadFaction() {
    if (!WA.reputation) return null;
    let best = null;
    for (const id in WA.reputation.FACTIONS) {
      const n = WA.reputation.rep(id);
      if (!best || n > best.standing) best = { id, standing: n };
    }
    return best && best.standing > 0 ? best : null;
  }

  function render() {
    const s = S(), el = U.el('ending');
    if (!s || !el || !s.ending) return false;
    const e = s.ending;
    const karma = typeof e.karma === 'number' ? e.karma : 0;
    const lead = e.faction && WA.reputation && WA.reputation.FACTIONS[e.faction] ? e.faction : null;
    const standing = e.standing | 0;
    const lines = (e.bloody ? BLOODY : CLEAN).concat([karmaLine(karma), factionLine(lead, standing)]);
    const kt = WA.reputation ? WA.reputation.karmaTier(karma) : null;
    const tag = kt
      ? `Karma ${kt.name} ${karma}` +
        (lead ? ` · ${WA.reputation.factionName(lead)} ${WA.reputation.repTier(standing).name} ${standing}` : '')
      : '';
    U.setHtml('ending',
      `<div class="prow"><span class="hero">${TITLE}</span>` +
      `<span class="acts"><small class="dim">ENDING</small>` +
      `<button class="closex" data-close="ending" aria-label="Close ending">×</button></span></div>` +
      `<div class="endtext">${lines.map(p => `<p>${p}</p>`).join('')}</div>` +
      `<div class="dim" style="font-size:12px">The Sentinel is silent. You reached level ${s.lvl}.` +
        `${tag ? ' · ' + U.esc(tag) : ''}</div>` +
      `<div class="use"><button data-end="close">Continue wandering</button></div>`);
    return true;
  }

  function open() {
    const s = S(), el = U.el('ending');
    if (!s || !s.ending || !el) return false;
    WA.ui.closeAll('ending');
    el.hidden = false;
    document.body.classList.add('ending-open');
    bind();
    render();
    WA.view.draw();
    return true;
  }

  function close() {
    const el = U.el('ending');
    if (el) el.hidden = true;
    document.body.classList.remove('ending-open');
    if (WA.save) WA.save.queueAutosave();
    WA.view.draw();
  }

  function trigger() {
    const s = S();
    if (!s || s.test || s.ending) return false;
    const lead = leadFaction();
    s.ending = {
      id: 'sentinel',
      bloody: !!(WA.traits && WA.traits.has('bloody_mess')),
      karma: WA.reputation ? WA.reputation.value() : 0,
      faction: lead ? lead.id : null,
      standing: lead ? lead.standing : 0
    };
    if (WA.save) WA.save.queueAutosave();
    return open();
  }

  function bind() {
    const el = U.el('ending');
    if (!el || el._ebound) return;
    el._ebound = 1;
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (b && b.dataset.end === 'close') close();
    });
  }

  WA.ending = { TITLE, open, close, trigger, render, isOpen, bind, leadFaction };
})(window.WA = window.WA || {});
