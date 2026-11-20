/* Display: a fixed character grid with per-cell colour and effect, updated
   incrementally. Symbols that need two columns reserve two columns. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const D = { CELLS: [], SIGS: [], NC: 0, NR: 0 };

  /* The width the board has to live in: the shell's own width, not the CSS
     font-size guess, because a wide map used to spill out of its panel. */
  function shellWidth() {
    const app = U.el('app');
    const w = (app && app.clientWidth) || document.documentElement.clientWidth || window.innerWidth || 320;
    return Math.max(220, w);
  }

  /* Fewer columns on a narrow screen instead of shrinking every cell: a phone
     shows a 20-column window of the map at a readable cell size. */
  function viewCols(availW) {
    const book = WA.game.VW || 25;
    return Math.max(13, Math.min(book, Math.floor(availW / 17)));
  }

  /* The cell size follows the space the shell actually has. */
  function fitGrid(cols, rows, availW) {
    const sc = U.el('screen');
    if (!sc) return;
    // Leave room for the log and the pad; a short landscape screen keeps a
    // floor so the map stays legible rather than collapsing.
    const availH = Math.max(150, (window.innerHeight || 640) - 320);
    const size = Math.min(availW / (cols * 0.85), availH / (rows * 0.85), 28);
    const px = Math.max(8, Math.round(size * 10) / 10) + 'px';
    if (sc.style.fontSize !== px) sc.style.fontSize = px;
  }

  function ensureCells(cols, rows) {
    if (cols === D.NC && rows === D.NR) return;
    D.NC = cols; D.NR = rows;
    const sc = U.el('screen');
    sc.style.gridTemplateColumns = `repeat(${cols}, var(--cw))`;
    sc.style.gridAutoRows = 'var(--ch)';
    sc.innerHTML = '<i></i>'.repeat(cols * rows);
    D.CELLS = Array.from(sc.children);
    D.SIGS = Array(cols * rows).fill('');
    for (let i = 0; i < D.CELLS.length; i++) {
      const el = D.CELLS[i];
      // Explicit placement, so a two-column glyph never shifts the rest of the row.
      el.style.gridColumn = String((i % cols) + 1);
      el.style.gridRow = String(((i / cols) | 0) + 1);
      el.textContent = ' ';
    }
  }

  function reset() { D.SIGS.fill('\u0000reset'); }

  function hideCell(i) {
    if (D.SIGS[i] === '\u0000hide') return;
    D.SIGS[i] = '\u0000hide';
    const el = D.CELLS[i];
    el.style.visibility = 'hidden';
    el.style.gridColumn = String((i % D.NC) + 1);
    el.textContent = '';
  }

  function drawCell(vx, vy, ch, c, d, x, y, wide, op, lit) {
    const i = vy * D.NC + vx;
    const sig = ch + '\u0001' + c + '\u0001' + (d.bg || '') + (d.glow ? 1 : '') + (d.fx || '') +
      (wide ? 'W' : '') + (lit ? 'L' : '') + '\u0001' + op.toFixed(2);
    if (D.SIGS[i] === sig) return;
    D.SIGS[i] = sig;

    const cls = [];
    let fg = '';
    const mem = (c || '').includes('mem');
    for (const k of (c || '').split(' ')) {
      if (!k) continue;
      if (k[0] === '#') fg = k;
      else cls.push(k);
    }
    if ((d.glow || d.light) && !mem) cls.push('fx-glow');
    if (lit) cls.push('lit');
    let delay = '';
    if (d.fx && !mem) {
      cls.push('fx-' + d.fx);
      delay = `-${(performance.now() / 1000 + ((x * 37 + y * 17) % 20) / 10).toFixed(2)}s`;
    }
    if (wide) cls.push('wide');

    const el = D.CELLS[i];
    el.style.visibility = '';
    el.style.gridColumn = wide ? `${vx + 1} / span 2` : String(vx + 1);
    el.style.color = fg;
    el.style.background = d.bg || '';
    el.style.animationDelay = delay;
    el.style.opacity = op >= 0.999 ? '' : op.toFixed(2);
    el.textContent = ch;
    el.className = cls.join(' ');
  }

  function hud() {
    const S = WA.game.S;
    if (!S) return;
    const hp = WA.char.maxHp();
    const fx = WA.status.tag(S.fx);
    const rads = S.rads | 0;
    const cnd = S.weapon ? WA.weapons.condOf(S.weapon) : 100;
    const acnd = S.armor ? WA.weapons.condOf(S.armor) : 100;
    const clock = WA.time ? WA.time.label(S) : '';
    const limb = WA.limbs ? WA.limbs.tag(S) : '';
    const shaken = S.shaken && S.shaken.turns > 0 ? `SHAKEN −${S.shaken.pen || 10}%` : '';
    // The waypoint lives on the Pip-Boy map, so the play HUD carries its bearing.
    const wpt = WA.quests && WA.quests.waypoint ? WA.quests.waypoint() : null;
    const off = !wpt && WA.quests && WA.quests.waypointElsewhere ? WA.quests.waypointElsewhere() : null;
    const wpHud = wpt
      ? `<span class="wp" title="Waypoint — ${U.esc(wpt.name)} — ${U.esc(wpt.text)}">◉ ${U.esc(wpt.dist ? `${wpt.dist} ${wpt.dir}` : 'here')}</span>`
      : (off ? `<span class="wp off" title="Waypoint — ${U.esc(off.name)} — objective in ${U.esc(off.mapName)}">◉ ${U.esc(off.mapName)}</span>` : '');
    U.setHtml('bar', `<span class="clock">${U.esc(clock)}</span>` +
      `<span class="dim" title="Facing ${U.esc(S.face || 's')}">${U.arrow(S.face || 's')}</span>` +
      `<span class="${S.hp <= hp * 0.3 ? 'bad' : ''}">HP ${S.hp}/${hp}</span><span>LV${S.lvl}${S.pts ? '*' : ''} ${S.lvl >= WA.scale.CAP ? 'MAX' : S.xp + '/' + WA.char.need()}</span><span>Caps ${S.caps}</span><span>Stim ${S.stims}</span>` +
      (rads ? `<span class="warn">RADS ${rads}</span>` : '') +
      (limb ? `<span class="bad">CRIPPLED ${U.esc(limb)}</span>` : '') +
      (shaken ? `<span class="warn">${U.esc(shaken)}</span>` : '') +
      (S.weapon && cnd < 25 ? `<span class="bad">CND ${cnd}%</span>` : '') +
      (S.armor && acnd < 25 ? `<span class="bad">ARM ${acnd}%</span>` : '') +
      (fx ? `<span class="bad">${U.esc(fx)}</span>` : '') + wpHud);
    U.setHtml('log', S.log.map(t => `<div>${U.esc(t)}</div>`).join(''));
    if (!U.el('pip').hidden) WA.char.pip();
    WA.vats.ui();
    U.setText('vatsbtn', 'VATS ' + S.ap);
    const wp = S.weapon && WA.GAME.items[S.weapon];
    const ammoId = wp && wp.ammo ? WA.inv.loadedAmmo(wp) : null;
    const ammoDef = ammoId ? WA.GAME.items[ammoId] : null;
    U.setText('firebtn', ammoDef
      ? 'Fire ' + WA.inv.ammoCount(ammoId) +
        (ammoDef.variant && ammoDef.variant !== 'Standard' ? ' ' + ammoDef.variant : '')
      : 'Fire');
    const boom = (S.inv || []).filter(id => (WA.GAME.items[id] || {}).type === 'explosive').length;
    U.setText('throwbtn', boom ? 'Throw ' + boom : 'Throw');

    document.body.classList.toggle('dead', S.dead);
    if (WA.death) WA.death.sync();
  }

  function draw() {
    const S = WA.game.S;
    if (!S) return;
    const availW = shellWidth() - 38;
    const VW = viewCols(availW), VH = WA.game.VH;
    const cols = Math.min(S.w, VW), rows = Math.min(S.h, VH);
    const cx = Math.max(0, Math.min(S.w - VW, S.px - (VW >> 1)));
    const cy = Math.max(0, Math.min(S.h - VH, S.py - (VH >> 1)));
    const vis = S.vis || WA.vis.compute(S);
    const light = S.light || WA.light.compute(S);
    fitGrid(cols, rows, availW);
    ensureCells(cols, rows);

    for (let vy = 0; vy < rows; vy++) {
      let covered = false;
      for (let vx = 0; vx < cols; vx++) {
        const i = vy * cols + vx;
        if (covered) { hideCell(i); covered = false; continue; }
        const x = cx + vx, y = cy + vy;
        let ch, c, d = {};
        const v = vis[y] && vis[y][x];
        const e = v && WA.game.entAt(x, y);
        const it = v && S.items[x + ',' + y];
        if (x === S.px && y === S.py) { ch = '@'; c = 'hero face face-' + (S.face || 's'); }
        else if (e) {
          d = e.d || {}; ch = d.glyph || '?';
          // Every NPC carries the same caret, dimmer, so you can read who is looking where.
          c = (d.c || 'bad') + ' face face-' + (e.face || 's');
        }
        else if (it) {
          d = WA.GAME.items[it] || {};
          ch = d.glyph || '?';
          c = d.c || 'warn';
          // Locked containers read as hostile until opened.
          if (d.lock && WA.loot && WA.loot.locked(x + ',' + y)) c = 'bad';
        }
        else if (!v && !(S.seen[y] && S.seen[y][x])) { ch = ' '; c = ''; }
        else {
          d = WA.GAME.tiles[S.grid[y] && S.grid[y][x]] || {};
          ch = d.glyph || '?';
          c = d.c || 'dim';
          if (!v) c += ' mem';
        }
        // Lit cells stay solid; dark ones fade back. The player is always clear.
        const l = (light[y] && light[y][x]) || 0;
        const onPlayer = x === S.px && y === S.py;
        let op = 1;
        if (ch !== ' ' && !onPlayer) op = WA.light.shade(l) * (v ? 1 : 0.5);
        if (op > 0.999) op = 1;
        const lit = !!v && l >= 0.72;
        const wide = U.glyphWidth(ch) > 1 && vx < cols - 1;
        drawCell(vx, vy, ch, c, d, x, y, wide, op, lit);
        if (wide) covered = true;
      }
    }

    const def = WA.GAME.maps[S.id];
    U.el('screen').style.background = (def && def.bg) || '';
    if (WA.weather) WA.weather.apply(S);
    hud();
    WA.save.queueAutosave();
  }

  // Re-fit after rotation, resize or a mobile URL-bar change. Columns are
  // recomputed, so the grid rebuilds instead of keeping the old width.
  let refitFrame = 0;
  function refit() {
    if (refitFrame) return;
    refitFrame = requestAnimationFrame(() => {
      refitFrame = 0;
      U.resetGlyphWidths();
      D.NC = D.NR = 0;
      if (WA.game.S) draw();
    });
  }
  addEventListener('resize', refit);
  addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);

  WA.view = { draw, reset, ensureCells, hud };
})(window.WA = window.WA || {});
