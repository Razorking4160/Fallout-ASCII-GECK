/* Croup's dice table: two capped, negative-expectation wagers.

   Lucky Seven is the steady bet. Two dice, and a seven pays 4:1; a made
   Gambling 30 check on the roll improves that to 5:1. The seven is a 1-in-6
   shot, so a failed check returns 83.3% of the stake and a made check returns
   100%. The check caps at 95%, which puts the best possible long-run return at
   99.2%: the table is never a cap printer, but a master gambler does get close.

   Boxcars is the long shot. Double sixes is 1 in 36 and pays 26:1, or 30:1 on
   a made Gambling 35 check. That returns 75.0% at base odds and 85.6% at the
   check cap, so the house keeps a much wider cut on the long shot; the 10-cap
   limit is what stops one lucky throw from dwarfing the seven's ceiling.

   Bets are 5–50 caps on the seven and 5–10 on the boxcars. Losses and winnings
   move S.caps immediately, and every roll is printed in the panel. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const HISTORY = 8;
  const ORDER = ['seven', 'boxcars'];

  const WAGERS = {
    seven: {
      id: 'seven', name: 'Lucky Seven', tag: 'SEVEN',
      min: 5, max: 50, bets: [5, 10, 25, 50],
      check: 30, base: 4, bonus: 5, ways: 6,
      odds: '1 in 6',
      hit: sum => sum === 7,
      rule: 'Roll two dice. A seven pays <b>4:1</b>; a made check pays <b>5:1</b>.'
    },
    boxcars: {
      id: 'boxcars', name: 'Boxcars', tag: 'BOXCARS',
      min: 5, max: 10, bets: [5, 10],
      check: 35, base: 26, bonus: 30, ways: 1,
      odds: '1 in 36',
      hit: (sum, d1, d2) => d1 === 6 && d2 === 6,
      rule: 'Double sixes pays <b>26:1</b>; a made check pays <b>30:1</b>.'
    }
  };

  let NPC = '';
  let LAST_S = null;
  let GAME = 'seven';
  let BETSEL = { seven: 5, boxcars: 5 };
  let MSG = '';
  let MSG_GOOD = false;
  let LOG = [];
  let TOTAL = 0;

  const W = () => WAGERS[GAME];
  const isOpen = () => { const el = U.el('gamble'); return !!el && !el.hidden; };
  const checkChance = () => (WA.skills ? WA.skills.checkChance('gambling', W().check) : 0);
  // A win pays the stake back plus the multiplier, so the return has to count
  // both: ways × (multiplier + 1), lifted by the share of made checks.
  const avgReturn = () => W().ways * (W().base + 1 + checkChance() / 100 * (W().bonus - W().base)) / 36 * 100;
  const returnPct = () => avgReturn().toFixed(1);
  const edgePct = () => (100 - avgReturn()).toFixed(1);
  const netText = n => (n > 0 ? '+' : '') + n;

  function render() {
    const s = S(), el = U.el('gamble');
    if (!s || !el) return;
    const w = W();
    const bet = BETSEL[GAME];
    const gamb = WA.skills ? WA.skills.value('gambling') : 0;
    const broke = (s.caps | 0) < w.min;
    const short = !broke && (s.caps | 0) < bet;
    const tabs = ORDER.map(id => {
      const g = WAGERS[id];
      return `<button data-gwager="${id}" class="${id === GAME ? 'sel' : ''}" ` +
        `${(s.caps | 0) < g.min ? 'disabled' : ''}>${g.name}<small>${g.odds}</small></button>`;
    }).join('');
    const wagers = w.bets.map(n =>
      `<button data-gbet="${n}" class="${n === bet ? 'sel' : ''}" ${(s.caps | 0) < n ? 'disabled' : ''}>${n}</button>`
    ).join('');
    const history = LOG.length
      ? LOG.map(row => `<div class="${row.net >= 0 ? 'good' : 'bad'}">${U.esc(row.text)}</div>`).join('')
      : '<div class="dim">No rolls yet. The house is waiting.</div>';
    const msg = MSG
      ? `<div class="gambmsg ${MSG_GOOD ? 'good' : 'bad'}">${U.esc(MSG)}</div>` : '';
    U.setHtml('gamble',
      `<div class="prow"><span class="hero">CROUP'S DICE TABLE</span>` +
      `<span class="acts"><small class="dim">LIMIT ${w.max} CAPS</small>` +
      `<button class="closex" data-close="gamble" aria-label="Leave the dice table">×</button></span></div>` +
      `<div class="prow"><span>Caps <b>${s.caps | 0}</b></span>` +
      `<span class="dim">Gambling <b>${gamb}%</b> · check ${checkChance()}%</span></div>` +
      `<div class="gamtabs">${tabs}</div>` +
      `<div class="gambletable">` +
      `<div><b>${w.name}.</b> ${w.rule}</div>` +
      `<div class="dim">Chance ${w.odds}. At this skill the long-run return is ` +
      `<b>${returnPct()}%</b> — a ${edgePct()}% house edge.</div>` +
      `</div>` +
      `<div class="prow"><span>Wager</span><span class="dim">min ${w.min} · max ${w.max}</span></div>` +
      `<div class="gambet">${wagers}</div>` +
      (broke ? `<div class="gambmsg bad">This table's minimum is ${w.min} caps. Come back with a stake.</div>` :
        short ? '<div class="gambmsg bad">Not enough caps for that wager. Pick a smaller one.</div>' : '') +
      msg +
      `<div class="use"><button data-groll="1" ${(s.caps | 0) >= bet ? '' : 'disabled'}>` +
      `Roll the dice — ${bet} caps</button></div>` +
      `<div class="gamblog">${history}</div>` +
      `<div class="prow"><span class="dim">SESSION</span>` +
      `<span class="${TOTAL >= 0 ? 'good' : 'bad'}">${netText(TOTAL)} caps</span></div>`);
  }

  function setWager(id) {
    if (ORDER.indexOf(id) < 0) return false;
    if (GAME === id) return true;
    GAME = id;
    MSG = '';
    MSG_GOOD = false;
    render();
    return true;
  }

  function setBet(n) {
    n = n | 0;
    const s = S();
    if (W().bets.indexOf(n) < 0 || !s || (s.caps | 0) < n) return false;
    BETSEL[GAME] = n;
    MSG = '';
    MSG_GOOD = false;
    render();
    return true;
  }

  function play() {
    const s = S();
    if (!s || s.dead || !isOpen()) return false;
    const w = W();
    const stake = BETSEL[GAME];
    if ((s.caps | 0) < w.min) {
      MSG = `You need at least ${w.min} caps to play ${w.name}.`;
      MSG_GOOD = false;
      render();
      return false;
    }
    if ((s.caps | 0) < stake) {
      MSG = `You only have ${s.caps | 0} caps. Pick a smaller wager.`;
      MSG_GOOD = false;
      render();
      return false;
    }

    s.caps -= stake;

    // The check is rolled first so the result log reads in the order the
    // player experienced it: read the table, then throw the dice.
    const check = WA.skills.checkResult('gambling', w.check);
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const sum = d1 + d2;
    const win = !!w.hit(sum, d1, d2);
    const multiplier = check.success ? w.bonus : w.base;
    const paid = win ? stake * (multiplier + 1) : 0;
    const net = paid - stake;
    s.caps += paid;
    TOTAL += net;

    const checkText = `Gambling ${check.chance}% (rolled ${check.roll}) ${check.success ? 'made' : 'failed'}`;
    const text = win
      ? `WIN · ${w.tag} — ${d1}+${d2}=${sum} · ${checkText} · ${multiplier}:1 · paid ${paid}, net ${netText(net)}.`
      : `LOSS · ${w.tag} — ${d1}+${d2}=${sum} · ${checkText} · lost ${stake}.`;
    LOG.unshift({ text, net });
    if (LOG.length > HISTORY) LOG.length = HISTORY;

    MSG = win
      ? `${w.tag === 'BOXCARS' ? 'Boxcars!' : 'Seven!'} The table pays ${paid} caps (net ${netText(net)}).`
      : `No ${w.tag.toLowerCase()}. The house takes ${stake} caps.`;
    MSG_GOOD = win;
    if (WA.game.say) {
      WA.game.say(win
        ? `Croup's dice: ${d1}+${d2}=${sum}. ${checkText}; the table pays ${paid} caps.`
        : `Croup's dice: ${d1}+${d2}=${sum}. No ${w.tag.toLowerCase()}; ${stake} caps lost.`);
    }
    if (WA.save) WA.save.queueAutosave();
    render();
    return true;
  }

  function open(id) {
    const s = S();
    if (!s || s.dead) return false;
    // A new run (or a loaded save) gets a fresh table log; closing and
    // reopening the panel in the same run keeps the current sitting's history.
    if (s !== LAST_S) {
      LAST_S = s;
      LOG = [];
      TOTAL = 0;
      GAME = 'seven';
      BETSEL = { seven: WAGERS.seven.min, boxcars: WAGERS.boxcars.min };
    }
    WA.ui.closeAll('gamble');
    NPC = id || 'dealer';
    MSG = '';
    MSG_GOOD = false;
    const el = U.el('gamble');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function close() {
    const el = U.el('gamble');
    if (el) el.hidden = true;
    NPC = '';
    MSG = '';
    MSG_GOOD = false;
    if (WA.view) WA.view.draw();
  }

  WA.gambling = {
    open, close, isOpen, render, setWager, setBet, play,
    WAGERS, ORDER,
    get wager() { return W(); },
    get npc() { return NPC; },
    get bet() { return BETSEL[GAME]; },
    get log() { return LOG.slice(); },
    get total() { return TOTAL; },
    // The active table's ladder and limits; the number keys read BETS.
    get BETS() { return W().bets; },
    get MIN_BET() { return W().min; },
    get MAX_BET() { return W().max; },
    get CHECK() { return W().check; },
    get BASE_PAYOUT() { return W().base; },
    get CHECK_PAYOUT() { return W().bonus; }
  };
})(window.WA = window.WA || {});
