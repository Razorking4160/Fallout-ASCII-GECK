/* Terminal hacking: a word-decoding game in the Fallout style. Nine words of
   the same length hide in a screen of filler characters; one is the password.
   Each guess reports how many letters sit in the right place. Clickable
   bracket pairs are bypasses: a pair that encloses a word removes that dud,
   a pair that encloses nothing restores an attempt. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const WORDS = [
    'ACCESS', 'ATOMIC', 'BUNKER', 'CIPHER', 'COBALT', 'DECODE', 'FUSION', 'GADGET',
    'HAZARD', 'IGNITE', 'LASERS', 'MATRIX', 'MEMORY', 'MODULE', 'NEURAL', 'OUTPUT',
    'OXYGEN', 'PLASMA', 'PURGED', 'RADIUM', 'REBOOT', 'REPAIR', 'SECTOR', 'SIGNAL',
    'SILVER', 'SOCKET', 'STATIC', 'SYSTEM', 'TARGET', 'TUNNEL', 'UPLINK', 'VECTOR',
    'WIRING', 'WIZARD'
  ];
  const PICK = 9;
  const COLS = 12, ROWS = 12;
  const FILL = '!@#$%^&*-_=+|/\\;:<>?.,"\'~';
  const PAIR_MAX = 3;

  let AT = null, SET = [], SECRET = '', SECRET_INDEX = 0;
  let TRIES = 0, MAX = 4, LOG = [], FEED = '';
  let CELLS = [], SPOTS = [], PAIRS = [];
  const DUD = new Set(), USED = new Set();

  const isOpen = () => { const el = U.el('hack'); return !!el && !el.hidden; };
  const keyOf = (x, y) => x + ',' + y;

  function tileAt(x, y) {
    const s = S();
    return (s && s.grid[y] && WA.GAME.tiles[s.grid[y][x]]) || null;
  }

  /* Saved per terminal: 'open' after a success, 'fail' after a lockout. */
  function stateAt(x, y) {
    const s = S();
    return s && s.hacked ? s.hacked[keyOf(x, y)] : '';
  }

  function attempts(d) {
    let n = (d | 0) >= 3 ? 3 : (d | 0) === 2 ? 4 : 5;
    const science = WA.skills ? WA.skills.value('science') : 25;
    if (science >= 75) n++;
    if (science >= 100) n++;
    if (WA.perks && WA.perks.rank('computer_whiz')) n++;
    return n;
  }

  const likeness = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++;
    return n;
  };

  function pickWords() {
    const pool = WORDS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    SET = pool.slice(0, PICK);
    SECRET_INDEX = Math.floor(Math.random() * SET.length);
    SECRET = SET[SECRET_INDEX];
  }

  const cellAt = (r, c) => CELLS[r * COLS + c];
  const freeRun = (r, c, len) => {
    for (let i = 0; i < len; i++) if (cellAt(r, c + i).wi >= 0) return false;
    if (c > 0 && cellAt(r, c - 1).wi >= 0) return false;
    if (c + len < COLS && cellAt(r, c + len).wi >= 0) return false;
    return true;
  };

  /* Lay the words out first, then leave the rest to filler, then add bracket
     pairs that never enclose the password. */
  function layout() {
    CELLS = Array.from({ length: COLS * ROWS }, () => ({ ch: '', wi: -1, bp: -1 }));
    SPOTS = [];
    for (let wi = 0; wi < SET.length; wi++) {
      const w = SET[wi], cands = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c + w.length <= COLS; c++) if (freeRun(r, c, w.length)) cands.push([r, c]);
      }
      if (!cands.length) return false;
      const [r, c] = cands[Math.floor(Math.random() * cands.length)];
      for (let i = 0; i < w.length; i++) {
        const cell = cellAt(r, c + i);
        cell.ch = w[i];
        cell.wi = wi;
      }
      SPOTS.push({ wi, r, c });
    }
    for (const cell of CELLS) if (cell.wi < 0) cell.ch = FILL[Math.floor(Math.random() * FILL.length)];

    PAIRS = [];
    const rowsUsed = new Set();
    for (let n = 0; n < PAIR_MAX; n++) {
      const cands = [];
      for (let r = 0; r < ROWS; r++) {
        if (rowsUsed.has(r)) continue;
        for (let c = 0; c + 2 < COLS; c++) {
          for (let c2 = c + 2; c2 <= Math.min(c + 8, COLS - 1); c2++) {
            const a = cellAt(r, c), b = cellAt(r, c2);
            if (a.wi >= 0 || b.wi >= 0 || a.bp >= 0 || b.bp >= 0) continue;
            const touched = SPOTS.filter(s => s.r === r && s.c <= c2 && s.c + SET[s.wi].length - 1 >= c);
            // Never wrap the password, and never wrap half a word.
            if (touched.some(s => s.wi === SECRET_INDEX)) continue;
            if (touched.some(s => !(s.c > c && s.c + SET[s.wi].length - 1 < c2))) continue;
            cands.push({ r, c, c2, duds: touched.map(s => s.wi) });
          }
        }
      }
      if (!cands.length) break;
      // Guarantee variety when the screen allows it: one dud pair, one retry.
      let pool = cands;
      if (n === 0) {
        const dud = cands.filter(p => p.duds.length);
        if (dud.length) pool = dud;
      } else if (n === 1) {
        const clean = cands.filter(p => !p.duds.length);
        if (clean.length) pool = clean;
      }
      const p = pool[Math.floor(Math.random() * pool.length)];
      const open = '(['[Math.floor(Math.random() * 2)];
      const a = cellAt(p.r, p.c), b = cellAt(p.r, p.c2);
      a.ch = open; a.bp = PAIRS.length;
      b.ch = open === '(' ? ')' : ']'; b.bp = PAIRS.length;
      p.used = false;
      PAIRS.push(p);
      rowsUsed.add(p.r);
    }
    return true;
  }

  function render() {
    const t = AT ? tileAt(AT[0], AT[1]) : null;
    const el = U.el('hack');
    if (!el || !t) return;
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const parts = [];
      for (let c = 0; c < COLS; c++) {
        const cell = cellAt(r, c) || { ch: ' ', wi: -1, bp: -1 };
        if (cell.wi >= 0) {
          parts.push(DUD.has(cell.wi)
            ? '<span class="hcell dim">·</span>'
            : `<span class="hcell hw" role="button" tabindex="0" data-hw="${cell.wi}">${U.esc(cell.ch)}</span>`);
          continue;
        }
        if (cell.bp >= 0) {
          const used = USED.has(cell.bp);
          parts.push(used
            ? `<span class="hcell dim">${U.esc(cell.ch)}</span>`
            : `<span class="hcell hbr" role="button" tabindex="0" data-hb="${cell.bp}">${U.esc(cell.ch)}</span>`);
          continue;
        }
        parts.push(`<span class="hcell dim">${U.esc(cell.ch)}</span>`);
      }
      rows.push(`<div class="hrow">${parts.join('')}</div>`);
    }
    const lines = LOG.length
      ? LOG.map(l => `> ${l.w}   likeness ${l.n}`).join('\n')
      : '> ENTER PASSWORD';
    U.setHtml('hack',
      `<div class="prow"><span class="hero">${U.esc(String(t.name).toUpperCase())}</span>` +
      `<span class="acts"><small class="dim">ATTEMPTS ${MAX - TRIES} · SCIENCE ${WA.skills.value('science')}%</small>` +
      `<button class="closex" data-close="hack" aria-label="Close terminal">×</button></span></div>` +
      (t.msg ? `<div class="hackbanner">${U.esc(t.msg)}</div>` : '') +
      `<div class="hacklog">${U.esc(lines)}</div>` +
      `<div class="hackscreen">${rows.join('')}</div>` +
      `<div class="hackmsg">${U.esc(FEED)}</div>` +
      `<div class="use"><button data-hx="1">Disconnect</button></div>`);
  }

  function abort() {
    const el = U.el('hack');
    if (el) el.hidden = true;
    AT = null; SET = []; SECRET = ''; TRIES = 0; LOG = []; FEED = '';
    CELLS = []; SPOTS = []; PAIRS = [];
    DUD.clear(); USED.clear();
  }

  function close(msg) {
    abort();
    if (msg) WA.game.say(msg);
    if (WA.view) WA.view.draw();
    if (WA.save) WA.save.queueAutosave();
  }

  function open(x, y) {
    const s = S(), t = tileAt(x, y);
    if (!s || s.dead || !t || !t.hack) return false;
    const st = stateAt(x, y);
    if (st === 'open') { WA.game.say('The terminal is already unlocked.'); WA.view.draw(); return false; }
    if (st === 'fail') { WA.game.say('The terminal is locked out.'); WA.view.draw(); return false; }
    let laid = false;
    for (let i = 0; i < 30 && !laid; i++) {
      pickWords();
      laid = layout();
    }
    /* A screen that never laid out has no password on it, so opening the panel
       would trap the player in a terminal they cannot beat. Refuse it instead. */
    if (!laid) {
      abort();
      console.warn('[Wasteland] hacking: no usable layout at ' + x + ',' + y);
      WA.game.say('The screen rolls and will not settle. Try again later.');
      if (WA.view) WA.view.draw();
      return false;
    }
    WA.ui.closeAll('hack');
    AT = [x, y];
    MAX = attempts(t.hack);
    TRIES = 0;
    LOG = [];
    FEED = '';
    DUD.clear();
    USED.clear();
    const el = U.el('hack');
    if (el) el.hidden = false;
    render();
    return true;
  }

  function win() {
    const s = S(), t = tileAt(AT[0], AT[1]);
    s.hacked = s.hacked || {};
    s.hacked[keyOf(AT[0], AT[1])] = 'open';
    let msg = 'Terminal unlocked.';
    const key = t.unlockKey && WA.GAME.items[t.unlockKey];
    if (key) {
      s.keys = s.keys || {};
      s.keys[t.unlockKey] = 1;
      msg = `Terminal unlocked. The mag-locks release: ${key.name} locks are open.`;
    }
    close(msg);
  }

  function lose() {
    const s = S();
    s.hacked = s.hacked || {};
    s.hacked[keyOf(AT[0], AT[1])] = 'fail';
    close('Terminal locked out.');
  }

  function guess(w) {
    if (!isOpen() || TRIES >= MAX) return;
    TRIES++;
    const n = likeness(w, SECRET);
    LOG.push({ w, n });
    if (w === SECRET) { win(); return; }
    if (TRIES >= MAX) { lose(); return; }
    render();
  }

  function pick(i) {
    const n = i | 0;
    if (DUD.has(n)) return;
    const w = SET[n];
    if (w) guess(w);
  }

  /* One use per bracket pair. A pair around words clears them as duds; a pair
     around nothing gives one attempt back. */
  function useBracket(i) {
    const n = i | 0;
    const p = PAIRS[n];
    if (!isOpen() || !p || USED.has(n)) return;
    USED.add(n);
    p.used = true;
    if (p.duds.length) {
      for (const wi of p.duds) DUD.add(wi);
      FEED = 'Bypass accepted. Dud entries cleared.';
    } else if (TRIES > 0) {
      TRIES--;
      FEED = 'Bypass accepted. Attempt restored.';
    } else {
      FEED = 'Bypass accepted. No attempts to restore.';
    }
    render();
  }

  WA.hacking = { open, close, abort, guess, pick, useBracket, isOpen, attempts };
})(window.WA = window.WA || {});
