/* Fallout 1 traits. A new character may choose up to two, or none.
   Traits are permanent; their stat changes are applied once when the
   character is created, while their other effects are read live. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const SOCIAL = ['first_aid', 'doctor', 'speech', 'barter'];
  const COMBAT = ['small_guns', 'big_guns', 'energy_weapons', 'throwing', 'melee_weapons', 'unarmed'];

  const DEFS = [
    {
      id: 'bloody_mess', name: 'Bloody Mess',
      benefit: '+5% damage, every death is violent',
      penalty: 'Changes the ending',
      desc: 'People around you die in the worst possible way. All damage rises 5%, every kill gets a grisly description, and the Sentinel epilogue uses its Bloody Mess variant.'
    },
    {
      id: 'bruiser', name: 'Bruiser',
      benefit: '+2 Strength',
      penalty: '−2 Action Points',
      desc: 'A big, slow hitter. Strength rises by two and your maximum AP drops by two.'
    },
    {
      id: 'chem_reliant', name: 'Chem Reliant',
      benefit: 'Chems last 50% longer',
      penalty: 'Addiction chance ×2',
      desc: 'Your body holds chem effects longer, and holds onto the habit harder. Chem buffs last 1.5× as long and addiction rolls are doubled.'
    },
    {
      id: 'chem_resistant', name: 'Chem Resistant',
      benefit: 'Addiction chance halved',
      penalty: 'Chems last half as long',
      desc: 'Your body rejects chems quickly. Effects last half as long, but the addiction roll is halved.'
    },
    {
      id: 'fast_metabolism', name: 'Fast Metabolism',
      benefit: '+2 HP from healing',
      penalty: '+25% poison and radiation damage',
      desc: 'You heal faster but burn through toxins. Healing items and healing tiles restore 2 more HP.'
    },
    {
      id: 'fast_shot', name: 'Fast Shot',
      benefit: '−1 AP on weapon attacks',
      penalty: 'No aimed shots',
      desc: 'You fire before aiming. VATS costs one less AP, but only a torso shot is available.'
    },
    {
      id: 'finesse', name: 'Finesse',
      benefit: '+10% critical chance',
      penalty: '−30% non-critical damage',
      desc: 'Precise, not brutal. Critical hits land more often, but ordinary hits do 30% less damage.'
    },
    {
      id: 'gifted', name: 'Gifted',
      benefit: '+1 to all SPECIAL',
      penalty: '−10% to all skills, −5 skill points per level',
      desc: 'Born better than everyone else, and you know it. Every stat rises by one, but skills and skill-point growth suffer.'
    },
    {
      id: 'good_natured', name: 'Good Natured',
      benefit: '+15 First Aid, Doctor, Speech, Barter',
      penalty: '−10 to combat skills',
      desc: 'You would rather talk than fight. Social skills improve; all six combat skills drop by ten.'
    },
    {
      id: 'heavy_handed', name: 'Heavy Handed',
      benefit: '+4 melee and unarmed damage',
      penalty: '−30% critical damage',
      desc: 'You swing harder, not smarter. Melee and unarmed hits gain 4 damage, but criticals are weaker.'
    },
    {
      id: 'jinxed', name: 'Jinxed',
      benefit: 'Enemies fumble more',
      penalty: 'You fumble too',
      desc: 'Bad luck follows everyone. You and your enemies each have a 5% chance of a critical failure on an attack.'
    },
    {
      id: 'kamikaze', name: 'Kamikaze',
      benefit: 'Sequence +5',
      penalty: 'Armor Class 0',
      desc: 'You act before others and leave defence to chance. Sequence rises by 5; your Agility contribution to Armor Class is reduced to 0. Worn armour still protects.'
    },
    {
      id: 'night_person', name: 'Night Person',
      benefit: '+1 IN and PE at night',
      penalty: '−1 IN and PE by day',
      desc: 'Your Intelligence and Perception rise between 6 PM and 6 AM and fall during the day. Uses the in-game clock.'
    },
    {
      id: 'one_hander', name: 'One Hander',
      benefit: '+20% hit with one-handed weapons',
      penalty: '−40% hit with two-handed weapons',
      desc: 'You are comfortable with a pistol or knife, and awkward with a rifle or heavy melee weapon.'
    },
    {
      id: 'skilled', name: 'Skilled',
      benefit: '+10 to all skills',
      penalty: 'A perk every four levels',
      desc: 'You spent more time practising and less time adventuring. All skills gain ten, but perks come more slowly.'
    },
    {
      id: 'small_frame', name: 'Small Frame',
      benefit: '+1 Agility',
      penalty: '−25 lbs carry weight',
      desc: 'Quick and compact. Agility rises by one, but your carry capacity is 25 lbs lower.'
    }
  ];
  const BY = {};
  for (const d of DEFS) BY[d.id] = d;

  /* The three pre-made Vault Dwellers from Fallout 1. Their SPECIAL here is the
     pre-trait base; permanent trait bonuses are applied on Begin. */
  const PRESETS = {
    albert: { name: 'Albert Cole', age: 27, gender: 'male',
      sp: { S: 5, P: 6, E: 4, C: 9, I: 6, A: 4, L: 6 },
      traits: ['skilled', 'good_natured'], tags: ['small_guns', 'speech', 'barter'] },
    max: { name: 'Max Stone', age: 23, gender: 'male',
      sp: { S: 8, P: 4, E: 9, C: 4, I: 4, A: 7, L: 4 },
      traits: ['bruiser', 'heavy_handed'], tags: ['small_guns', 'big_guns', 'unarmed'] },
    natalia: { name: 'Natalia Dubrovhsky', age: 17, gender: 'female',
      sp: { S: 3, P: 4, E: 5, C: 6, I: 6, A: 9, L: 5 },
      traits: ['night_person', 'gifted'], tags: ['sneak', 'steal', 'unarmed'] }
  };

  let PICK = [], TAGS = [], STEP = 0, OPEN = false;
  let NAME = 'Vault Dweller', GENDER = 'male', AGE = 25, MSG = '', PRESET = '';
  const STEPS = ['IDENTITY', 'SPECIAL', 'TRAITS', 'TAG SKILLS'];
  const TAG_TARGET = 3;

  function has(id, picks) {
    if (Array.isArray(picks)) return picks.includes(id);
    const s = S();
    return !!(s && Array.isArray(s.traits) && s.traits.includes(id));
  }

  const night = () => {
    const s = WA.game && WA.game.S;
    return !!(s && s.traitsDone && WA.time && WA.time.isNight(s));
  };

  /* Night Person changes the stats used for skills and perk checks without
     touching the permanent SPECIAL scores. */
  function sp(base, picks) {
    const o = Object.assign({}, base);
    if (has('night_person', picks)) {
      const d = night() ? 1 : -1;
      o.I = clamp((o.I | 0) + d, 1, 10);
      o.P = clamp((o.P | 0) + d, 1, 10);
    }
    // Withdrawal is applied after Night Person so both modifiers stack.
    return WA.addiction ? WA.addiction.sp(o) : o;
  }

  /* Permanent trait bonuses are applied to the allocated SPECIAL once. */
  function statSp(base, picks) {
    const o = Object.assign({}, base);
    if (picks.includes('gifted')) {
      for (const k of Object.keys(o)) if (o[k] < 10) o[k]++;
    }
    if (picks.includes('bruiser')) o.S = Math.min(10, o.S + 2);
    if (picks.includes('small_frame')) o.A = Math.min(10, o.A + 1);
    return o;
  }

  function skillMod(id, picks) {
    let n = 0;
    if (has('gifted', picks)) n -= 10;
    if (has('skilled', picks)) n += 10;
    if (has('good_natured', picks)) {
      if (SOCIAL.includes(id)) n += 15;
      else if (COMBAT.includes(id)) n -= 10;
    }
    return n;
  }

  /* Combat effects */
  const critBonus = () => (has('finesse') ? 0.10 : 0);
  const critMul = base => (has('heavy_handed') ? base * 0.7 : base);
  function damageMul(crit) {
    let m = 1;
    if (has('finesse') && !crit) m *= 0.7;
    if (has('bloody_mess')) m *= 1.05;
    return m;
  }
  const meleeBonus = wp => (has('heavy_handed') && (!wp || (wp.range || 1) <= 1) ? 4 : 0);
  const attackAp = base => (has('fast_shot') ? Math.max(1, base - 1) : base);
  const jinxed = () => has('jinxed');

  function hitMod(wp) {
    if (!has('one_hander') || !wp || !wp.hands) return 0;
    return wp.hands === 1 ? 20 : -40;
  }

  /* Background effects */
  const apMod = () => (has('bruiser') ? -2 : 0);
  const sequenceBonus = () => (has('kamikaze') ? 5 : 0);
  const acZero = () => has('kamikaze');
  function addictionMul() {
    let m = 1;
    if (has('chem_reliant')) m *= 2;
    if (has('chem_resistant')) m *= 0.5;
    return m;
  }
  const skillPointPenalty = () => (has('gifted') ? 5 : 0);
  const perkEvery = () => (has('skilled') ? 4 : 3);
  const healBonus = () => (has('fast_metabolism') ? 2 : 0);
  function hazardMul(type) {
    return has('fast_metabolism') && (type === 'poison' || type === 'radiation') ? 1.25 : 1;
  }
  function chemDuration(dur) {
    if (has('chem_reliant')) return Math.max(1, Math.round(dur * 1.5));
    if (has('chem_resistant')) return Math.max(1, Math.round(dur * 0.5));
    return dur;
  }

  /* Stat changes happen once, when the player confirms the character. */
  function apply(s, picks) {
    if (!s || !Array.isArray(picks)) return;
    const beforeMax = WA.char.maxHp();
    s.sp = statSp(s.sp, picks);
    const afterMax = WA.char.maxHp();
    if (afterMax > beforeMax) s.hp = Math.min(afterMax, s.hp + (afterMax - beforeMax));
    s.ap = Math.min(s.ap, WA.char.maxAp());
  }

  function head() {
    return `<div class="cghead"><span class="hero">CHARACTER CREATION</span>` +
      `<span class="dim">${STEP + 1}/${STEPS.length} · ${STEPS[STEP]}</span></div>`;
  }

  function nav(back, label, disabled, action) {
    return `<div class="cgfoot">` +
      (back ? '<button type="button" data-cg="back">Back</button>' : '') +
      `<button type="button" data-cg="${action || 'next'}"${disabled ? ' disabled' : ''}>${label}</button></div>`;
  }

  function message() {
    return MSG ? `<div class="cgmsg">${U.esc(MSG)}</div>` : '';
  }

  function renderIdentity() {
    return head() +
      `<div class="cgintro">Name your Vault Dweller. Age is cosmetic in Fallout 1; gender changes how some people address you.</div>` +
      `<div class="cgpresets"><span class="dim">Premade</span><button type="button" data-preset="albert" class="${PRESET === 'albert' ? 'sel' : ''}">Albert</button><button type="button" data-preset="max" class="${PRESET === 'max' ? 'sel' : ''}">Max</button><button type="button" data-preset="natalia" class="${PRESET === 'natalia' ? 'sel' : ''}">Natalia</button><button type="button" data-preset="custom">Custom</button></div>` +
      `<div class="cgform"><label class="cgfield">Name <input id="cg_name" maxlength="20" value="${U.esc(NAME)}" autocomplete="off"></label>` +
      `<div class="cgrow"><label class="cgfield">Age <input id="cg_age" type="number" inputmode="numeric" min="16" max="35" value="${AGE}"></label>` +
      `<div class="cgfield">Gender <div class="cggender"><button type="button" data-gender="male" class="${GENDER === 'male' ? 'sel' : ''}">Male</button><button type="button" data-gender="female" class="${GENDER === 'female' ? 'sel' : ''}">Female</button></div></div></div></div>` +
      message() + nav(false, 'Next: SPECIAL');
  }

  function renderSpecial() {
    const s = S();
    const rows = Object.keys(WA.char.SPN).map(k => {
      const v = s.sp[k] | 0;
      return `<div class="cgstat"><div class="cgstattext"><b>${WA.char.SPN[k]}</b> <span>${v}</span><small>${WA.char.SPD[k]}</small></div>` +
        `<div class="cgstepper"><button type="button" data-sp="${k}" data-dir="-1"${v <= 1 ? ' disabled' : ''} aria-label="Lower ${WA.char.SPN[k]}">−</button>` +
        `<button type="button" data-sp="${k}" data-dir="1"${v >= 10 || (s.pts | 0) < 1 ? ' disabled' : ''} aria-label="Raise ${WA.char.SPN[k]}">+</button></div></div>`;
    }).join('');
    return head() +
      `<div class="cgintro">Distribute all <b>five</b> SPECIAL points. Every attribute starts at 5 and can be adjusted between 1 and 10.</div>` +
      `<div class="cgpoints"><span>Points left: <b>${s.pts | 0}</b></span><button type="button" data-cg="reset">Reset to 5s</button></div>` +
      `<div class="cgstats">${rows}</div>` +
      `<div class="cgderived">HP ${WA.char.maxHp()} · AP ${WA.char.maxAp()} · Carry ${25 + 25 * (s.sp.S | 0)} lbs</div>` +
      message() + nav(true, 'Next: Traits', (s.pts | 0) !== 0);
  }

  function renderTraits() {
    const cards = DEFS.map(d => {
      const sel = PICK.includes(d.id);
      const full = PICK.length >= 2 && !sel;
      return `<button type="button" class="cgcard${sel ? ' sel' : ''}" data-trait="${d.id}" aria-pressed="${sel}"${full ? ' disabled' : ''}>` +
        `<span class="cgname">${U.esc(d.name)}</span>` +
        `<span class="cgb">${U.esc(d.benefit)}</span>` +
        `<span class="cgp">${U.esc(d.penalty)}</span></button>`;
    }).join('');
    return head() +
      `<div class="cgintro">Choose up to two traits, or none. Traits are permanent; both the benefit and the cost are active in this build.</div>` +
      `<div class="cggrid">${cards}</div>` +
      message() + `<div class="cgfoot"><button type="button" data-cg="back">Back</button><button type="button" data-cg="none">None</button><button type="button" data-cg="next">Next: Tag skills</button></div>`;
  }

  function renderTags() {
    const s = S();
    const draftPts = Object.assign({}, s.skillPts || {});
    for (const id of TAGS) draftPts[id] = (draftPts[id] | 0) + 20;
    const draft = Object.assign({}, s, { sp: statSp(s.sp, PICK), traits: PICK.slice(), skillPts: draftPts });
    const rows = WA.skills.DEFS.map(d => {
      const sel = TAGS.includes(d.id);
      const v = WA.skills.value(d.id, draft);
      return `<button type="button" class="cgskill${sel ? ' sel' : ''}" data-tagpick="${d.id}" aria-pressed="${sel}"${!sel && TAGS.length >= TAG_TARGET ? ' disabled' : ''}>` +
        `<span>${U.esc(d.name)}</span><small>${v}%</small></button>`;
    }).join('');
    const traits = PICK.length ? PICK.map(id => BY[id].name).join(' + ') : 'None';
    return head() +
      `<div class="cgintro">Tag exactly <b>three</b> skills. A tag gives +20% immediately and doubles future point growth.</div>` +
      `<div class="cgpoints"><span>Tagged: <b>${TAGS.length}/${TAG_TARGET}</b></span><span class="dim">${U.esc(NAME)} · ${GENDER} · age ${AGE}</span></div>` +
      `<div class="cgskills">${rows}</div>` +
      `<div class="cgsummary">${traits}${traits === 'None' ? '' : ' · '}SPECIAL ${Object.keys(WA.char.SPN).map(k => WA.char.SPN[k][0] + draft.sp[k]).join(' ')}</div>` +
      message() + nav(true, 'Begin', TAGS.length !== TAG_TARGET, 'begin');
  }

  function render() {
    const el = U.el('chargen');
    if (!el || !OPEN) return;
    const body = STEP === 0 ? renderIdentity()
      : STEP === 1 ? renderSpecial()
        : STEP === 2 ? renderTraits()
          : renderTags();
    U.setHtml('chargen', body);
  }

  function cmsg(t) { MSG = t || ''; render(); }

  function toggle(id) {
    if (!OPEN || !BY[id]) return;
    const i = PICK.indexOf(id);
    if (i >= 0) PICK.splice(i, 1);
    else if (PICK.length < 2) PICK.push(id);
    else return cmsg('Choose at most two traits.');
    MSG = '';
    render();
  }

  function validIdentity() {
    const name = String(NAME || '').trim();
    const age = +AGE;
    return name.length > 0 && Number.isInteger(age) && age >= 16 && age <= 35;
  }

  function next() {
    const s = S();
    if (!s) return;
    if (STEP === 0) {
      if (!validIdentity()) return cmsg('Enter a name and an age from 16 to 35.');
      STEP = 1; MSG = ''; render(); return;
    }
    if (STEP === 1) {
      if ((s.pts | 0) !== 0) return cmsg('Spend all five SPECIAL points before continuing.');
      STEP = 2; MSG = ''; render(); return;
    }
    if (STEP === 2) { STEP = 3; MSG = ''; render(); return; }
    if (STEP === 3) confirm(false);
  }

  function open() {
    const s = S();
    if (!s || s.test || s.traitsDone) return false;
    if (OPEN) return true;
    if (WA.pip && WA.pip.isOpen()) WA.pip.close();
    if (WA.dlg && WA.dlg.isOpen()) WA.dlg.close();
    PICK = Array.isArray(s.traits) ? s.traits.slice(0, 2) : [];
    TAGS = Array.isArray(s.tags) ? s.tags.filter(id => WA.skills && WA.skills.BY[id]).slice(0, TAG_TARGET) : [];
    NAME = String(s.name || 'Vault Dweller').slice(0, 20);
    GENDER = s.gender === 'female' ? 'female' : 'male';
    AGE = Math.max(16, Math.min(35, s.age | 0 || 25));
    PRESET = '';
    if (typeof s.pts !== 'number') s.pts = 5;
    STEP = 0; MSG = '';
    OPEN = true;
    const el = U.el('chargen');
    if (el) el.hidden = false;
    document.body.classList.add('creating');
    bind();
    render();
    return true;
  }

  function close() {
    OPEN = false;
    PICK = []; TAGS = []; STEP = 0; MSG = '';
    const el = U.el('chargen');
    if (el) el.hidden = true;
    document.body.classList.remove('creating');
  }

  const isOpen = () => {
    const el = U.el('chargen');
    return OPEN || (!!el && !el.hidden);
  };

  function confirm(noTraits) {
    const s = S();
    if (!s || s.traitsDone) return false;
    if (noTraits) PICK = [];
    if (!validIdentity()) { STEP = 0; return cmsg('Enter a name and an age from 16 to 35.'); }
    if ((s.pts | 0) !== 0) { STEP = 1; return cmsg('Spend all five SPECIAL points before beginning.'); }
    if (TAGS.length !== TAG_TARGET) { STEP = 3; return cmsg(`Tag exactly ${TAG_TARGET} skills before beginning.`); }
    const picks = PICK.slice(0, 2);
    s.name = String(NAME).trim().slice(0, 20);
    s.gender = GENDER === 'female' ? 'female' : 'male';
    s.age = Math.max(16, Math.min(35, AGE | 0 || 25));
    s.traits = picks;
    s.traitsDone = true;
    apply(s, picks);
    if (!Array.isArray(s.tags)) s.tags = [];
    if (!s.skillPts) s.skillPts = {};
    const oldTags = new Set(s.tags);
    s.tags = TAGS.slice();
    for (const id of TAGS) if (!oldTags.has(id)) s.skillPts[id] = (s.skillPts[id] | 0) + 20;
    // Gifted lowers the starting and per-level allotment. Recompute the opening
    // bank now that SPECIAL and traits are fixed.
    const i = sp(s.sp).I | 0;
    s.skillPoints = Math.max(0, (5 + 2 * i) - (picks.includes('gifted') ? 5 : 0));
    s.pts = 0;
    s.hp = WA.char.maxHp();
    s.ap = WA.char.maxAp();
    WA.game.say(`${s.name}, ${s.gender}, age ${s.age}. ` +
      (picks.length ? `Traits: ${picks.map(id => BY[id].name).join(' + ')}. ` : 'No traits. ') +
      `Tagged: ${TAGS.map(id => WA.skills.BY[id].name).join(', ')}. ${s.skillPoints} skill points.`);
    close();
    if (WA.save) WA.save.queueAutosave();
    WA.view.draw();
    return true;
  }

  function bind() {
    const el = U.el('chargen');
    if (!el || el._tbound) return;
    el._tbound = 1;
    el.addEventListener('input', e => {
      if (e.target.id === 'cg_name') { NAME = e.target.value.slice(0, 20); PRESET = ''; }
      else if (e.target.id === 'cg_age') { AGE = +e.target.value; PRESET = ''; }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.trait) return toggle(b.dataset.trait);
      if (b.dataset.gender) { GENDER = b.dataset.gender; PRESET = ''; MSG = ''; render(); return; }
      if (b.dataset.preset) {
        const s = S(), p = PRESETS[b.dataset.preset];
        if (p) {
          NAME = p.name; AGE = p.age; GENDER = p.gender; PRESET = b.dataset.preset;
          s.sp = Object.assign({}, p.sp); s.pts = 0; PICK = p.traits.slice(); TAGS = p.tags.slice();
        } else {
          NAME = 'Vault Dweller'; AGE = 25; GENDER = 'male'; PRESET = '';
          for (const k in s.sp) s.sp[k] = 5;
          s.pts = 5; PICK = []; TAGS = [];
        }
        MSG = ''; render(); return;
      }
      if (b.dataset.sp) {
        const s = S(), k = b.dataset.sp, dir = +b.dataset.dir;
        if (dir > 0 && (s.pts | 0) > 0 && s.sp[k] < 10) { s.sp[k]++; s.pts--; }
        else if (dir < 0 && s.sp[k] > 1) { s.sp[k]--; s.pts++; }
        MSG = ''; render(); return;
      }
      if (b.dataset.tagpick) {
        const id = b.dataset.tagpick, i = TAGS.indexOf(id);
        if (i >= 0) TAGS.splice(i, 1);
        else if (TAGS.length < TAG_TARGET) TAGS.push(id);
        MSG = ''; render(); return;
      }
      const act = b.dataset.cg;
      if (act === 'next' || act === 'begin') return next();
      if (act === 'back') { if (STEP > 0) { STEP--; MSG = ''; render(); } return; }
      if (act === 'none') { PICK = []; MSG = ''; render(); return; }
      if (act === 'reset') {
        const s = S();
        for (const k in s.sp) s.sp[k] = 5;
        s.pts = 5; MSG = ''; render(); return;
      }
    });
  }

  const names = () => {
    const s = S();
    return s && Array.isArray(s.traits) ? s.traits.map(id => (BY[id] || {}).name).filter(Boolean) : [];
  };

  WA.traits = {
    DEFS, BY, has, night, sp, statSp, skillMod, names,
    critBonus, critMul, damageMul, meleeBonus, attackAp, hitMod, jinxed,
    apMod, sequenceBonus, acZero, addictionMul, skillPointPenalty, perkEvery, healBonus, hazardMul, chemDuration,
    apply, open, close, isOpen, toggle, confirm, bind, render
  };
})(window.WA = window.WA || {});
