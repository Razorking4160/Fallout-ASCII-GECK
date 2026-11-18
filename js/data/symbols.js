/* Symbol library for the Forge: pick a glyph by category instead of typing it. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const LIST = [
    ['Walls & structures', '█ ▓ ▒ ░ ║ ═ ╔ ╗ ╚ ╝ ╬ ╠ ╣ ╦ ╩ ▄ ▀ ▌ ▐'],
    ['Terrain', '≈ ~ ░ ▒ · ° ♣ ♠ ▲ ▼ ▲ ◇ ○ ●'],
    ['Fallout objects', '☢ ☣ ⚙ ⚒ ⚡ ♨ ▣ ▤ ⌂ ☠ ⚠ ✚'],
    ['Characters & enemies', '@ & g r Z M W X ☠ ☻ ☺'],
    ['Items & equipment', '$ ! + / ? * ◉ ◆ ✚ ✦ ⚿ ⚔ ⛨'],
    ['Arrows & marks', '← ↑ → ↓ ↔ ↕ ⇄ ✥ ✕ ✓ ×']
  ];

  function collect() {
    const cats = LIST.map(([name, text]) => ({ name, chars: U.split(text).filter(c => c !== ' ') }));
    const known = new Set(cats.flatMap(c => c.chars));
    const used = new Set();
    const game = WA.GAME || {};
    for (const kind of ['tiles', 'entities', 'items']) {
      for (const d of Object.values(game[kind] || {})) {
        if (!d || typeof d.glyph !== 'string') continue;
        for (const ch of U.split(d.glyph)) {
          if (ch && ch !== ' ') used.add(ch);
        }
      }
    }
    const extra = [...used].filter(ch => !known.has(ch))
      .sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
    if (extra.length) cats.push({ name: 'Game glyphs', chars: extra });
    return cats;
  }

  WA.refreshSymbols = () => (WA.SYMBOLS = collect());
  WA.refreshSymbols();
})(window.WA = window.WA || {});
