/* Talking heads, the ASCII way. Fallout 1 put an animated face beside every
   spoken line; here each shipped speaker has an 11x7 bust of plain ASCII, so
   the columns always line up whatever font the terminal ends up using.
   `#` marks an eye, which is rendered as a pair of stacked glyphs that blink
   every seven seconds on a per-speaker offset. The art is decoration: the
   dialogue panel keeps the name, title and words, and the bust is hidden from
   screen readers. A speaker with no portrait (an authored NPC, a new map's
   talker) gets the hooded settler rather than no head at all. */
(function (WA) {
  'use strict';
  const U = WA.util;

  const W = 11, H = 7;

  const HEADS = {
    // Mira: scavenger's hood and goggles.
    mira: [
      '   _____   ',
      '  /     \\  ',
      ' | #   # | ',
      ' |   |   | ',
      ' |  \\_/  | ',
      '  \\_____/  ',
      '   |||||   '
    ],
    // Keeper Ada: hair gathered on top.
    keeper: [
      '   .---.   ',
      '  /     \\  ',
      ' | #   # | ',
      ' |   .   | ',
      ' |  ---  | ',
      '  \\_____/  ',
      '   |   |   '
    ],
    // Technician Vale: headset with a boom.
    vale: [
      '  _/--\\__  ',
      ' | #   # | ',
      ' |   |   | ',
      '(|  ---  |)',
      ' |  \\_/  | ',
      '  \\_____/  ',
      '   |   |   '
    ],
    // Sable: a fence under a wide brim, scar down one cheek.
    fence: [
      '  ________ ',
      ' /________\\',
      '|  #   #  |',
      '|    /    |',
      '|   ---   |',
      ' \\_______/ ',
      '   |   |   '
    ],
    // Croup: eyeshade, and a cigar going out on one side.
    dealer: [
      '  _______  ',
      ' | _____ | ',
      ' | #   # | ',
      ' |   |   | ',
      ' |  \\_/  |=',
      '  \\_____/  ',
      '   |||||   '
    ],
    // Rook: shaved head and a heavy jaw.
    rook: [
      '  _______  ',
      ' /  ___  \\ ',
      '| #     # |',
      '|   ___   |',
      '|  /   \\  |',
      ' \\_______/ ',
      '  |     |  '
    ],
    // Vera: a braid over one shoulder.
    vera: [
      '   _____   ',
      '  /     \\  ',
      ' | #   # | ',
      ' |   |   | ',
      ' |  \\_/  | ',
      '  \\_____/  ',
      '   |  ||   '
    ],
    // Ash: bandana pulled up over the mouth.
    ash: [
      '  _______  ',
      ' | #   # | ',
      ' |  ___  | ',
      ' | /   \\ | ',
      '  \\_____/  ',
      '   |   |   ',
      '  /     \\  '
    ]
  };

  // Anyone without a bust of their own: a hooded settler.
  const SETTLER = [
    '   _____   ',
    '  /     \\  ',
    ' | #   # | ',
    ' |   __  | ',
    '  \\_____/  ',
    '   |   |   ',
    '  /     \\  '
  ];

  const reduced = () => typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The same bar as every other decorative mark: Animate off, or a system that
     asks for less motion, leaves the eyes open and the art still. */
  const moving = () => !(WA.settings && WA.settings.anim === false) && !reduced();

  const art = id => HEADS[id] || SETTLER;

  /* One bust for the dialogue panel. The blink is CSS-only, so it stops on its
     own when the panel is hidden and costs no timers. */
  function html(id) {
    const on = moving();
    // A stable offset per speaker, so two heads never blink on the same beat.
    const key = String(id || '');
    let sum = 0;
    for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
    const delay = -((sum % 9) * 0.8 + 0.4).toFixed(1);
    const body = art(id).map(row => U.esc(row).replace(/#/g,
      on ? '<span class="eye"><b>o</b><i>-</i></span>' : 'o')).join('\n');
    return `<pre class="dlgface${on ? ' blink' : ''}" style="--hb:${delay}s" aria-hidden="true">${body}</pre>`;
  }

  /* Every row must be the same width or a bust leans; `tools/check-maps.js`
     style guard for anyone adding a head later. */
  function check() {
    const bad = [];
    for (const id in HEADS) {
      const rows = HEADS[id];
      if (rows.length !== H) bad.push(`${id}: ${rows.length} rows, want ${H}`);
      if (!rows.some(r => r.indexOf('#') >= 0)) bad.push(`${id}: no eye marker`);
      rows.forEach((r, i) => {
        if (r.length !== W) bad.push(`${id} row ${i + 1}: ${r.length} cols, want ${W}`);
        if (!/^[ -~]+$/.test(r)) bad.push(`${id} row ${i + 1}: not plain ASCII`);
      });
    }
    return bad;
  }

  WA.heads = { HEADS, SETTLER, W, H, art, html, check };
})(window.WA = window.WA || {});
