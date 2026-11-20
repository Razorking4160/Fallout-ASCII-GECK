/* The Pip-Boy menu: STAT, INV, MAP and DATA screens over one panel. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const TABS = [['stat', 'STAT'], ['skills', 'SKILL'], ['perks', 'PERKS'], ['inv', 'INV'], ['party', 'PARTY'], ['map', 'MAP'], ['quest', 'QUEST'], ['data', 'DATA']];
  let TAB = 'stat';
  let DEST = [];

  const isOpen = () => { const p = U.el('pip'); return !!p && !p.hidden; };

  function blurText() {
    const a = document.activeElement;
    if (a && a.id === 'gio') a.blur();
  }

  /* ---------- screens ---------- */
  function statHtml() {
    const s = S();
    const rows = Object.keys(WA.char.SPN).map(k =>
      `<div class="prow"><span>${WA.char.SPN[k]} <b>${s.sp[k]}</b> <small class="dim">${WA.char.SPD[k]}</small></span>` +
      (s.pts > 0 && s.sp[k] < 10 ? `<button data-sp="${k}">+</button>` : '<span></span>') +
      '</div>'
    ).join('');
    const fx = WA.status.html(s.fx);
    const shaken = s.shaken && s.shaken.turns > 0
      ? `<div class="prow"><span class="warn">SHAKEN <small class="dim">−${s.shaken.pen || 10}% to hit · ${s.shaken.turns} turns</small></span></div>` : '';
    const rads = s.rads | 0;
    const pen = WA.char.baseHp() - WA.char.maxHp();
    const capped = s.lvl >= WA.scale.CAP;
    const dep = WA.addiction.html();
    return `<div class="prow"><span>${U.esc(s.name || 'Vault Dweller')} <small class="dim">${s.gender || 'male'} · age ${s.age || 25}</small></span></div>` +
      `<div class="prow"><span>Level <b>${s.lvl}</b><small class="dim">/${WA.scale.CAP}</small> · XP ${capped ? 'MAX' : s.xp + '/' + WA.char.need()}</span>` +
        `<span>Points <b>${s.pts}</b></span></div>` +
      `<div class="prow"><span>HP ${s.hp}/${WA.char.maxHp()} · AP ${s.ap}/${WA.char.maxAp()}</span></div>` +
      shaken +
      (WA.limbs ? WA.limbs.html(s) : '') +
      `<div class="prow"><span>AC <b>${WA.weapons.playerAc()}</b> · Sequence <b>${WA.combat.sequence()}</b></span>` +
      `<small class="dim">armour + Agility</small></div>` +
      `<div class="prow"><span>Skill points <b>${s.skillPoints | 0}</b> · Perks <b>${s.perkPending | 0}</b></span>` +
      `<span class="dim">${(s.tags || []).length}/${WA.skills.tagSlots()} tagged</span></div>` +
      `<div class="prow"><span>TRAITS <small class="dim">${WA.traits.names().length ? U.esc(WA.traits.names().join(' + ')) : 'None'}</small></span></div>` +
      (WA.traits.has('night_person')
        ? `<div class="dim" style="font-size:12px">Night Person: IN/PE ${WA.traits.night() ? '+1 (night)' : '−1 (day)'}</div>` : '') +
      (dep ? `<div class="dim" style="font-size:12px;margin-top:4px">DEPENDENCE</div>` + dep : '') +
      `<div class="prow" style="gap:12px"><span class="dim">Veteran bonus</span><span>+${WA.scale.dmgBonus(s.lvl)} dmg · +${WA.scale.apBonus(s.lvl)} AP</span></div>` +
      `<div class="prow"><span class="${rads ? 'warn' : 'dim'}">RADS <b>${rads}</b> ` +
        `<small class="dim">${pen ? 'max HP -' + pen : 'clean'}</small></span></div>` +
      (WA.reputation
        ? `<div class="dim" style="font-size:12px;margin-top:4px">REPUTATION</div>` + WA.reputation.html()
        : '') +
      (fx ? `<div class="dim" style="font-size:12px;margin-top:4px">STATUS</div>` + fx : '') +
      `<div class="dim" style="font-size:12px;margin-top:6px">SPECIAL</div>` + rows;
  }

  function skillsHtml() {
    const s = S();
    const slots = WA.skills.tagSlots();
    const tagged = WA.skills.tags();
    const rows = WA.skills.DEFS.map(d => {
      const v = WA.skills.value(d.id), isTag = tagged.includes(d.id);
      return `<div class="prow"><span title="${U.esc(d.desc)}">${isTag ? '<b class="good">*</b> ' : ''}${U.esc(d.name)} ` +
          `<small class="dim">${v}%</small></span><span class="acts">` +
        (WA.skills.canTag(d.id)
          ? `<button data-tag="${d.id}" title="Tag: +20% now and double growth">Tag</button>`
          : '') +
        (s.skillPoints > 0 && v < 200 ? `<button data-sk="${d.id}" title="Spend 1 point">+</button>` : '') +
        '</span></div>';
    }).join('');
    return `<div class="prow"><span>SKILL POINTS <b>${s.skillPoints | 0}</b></span>` +
      `<span class="dim">${tagged.length}/${slots} tags</span></div>` +
      `<div class="dim" style="font-size:12px;margin:2px 0 4px">1 point = +1% (+2% tagged), to 200%. Tag up to ${slots} skills: +20% and double growth. Base values follow SPECIAL.</div>` +
      (WA.field ? WA.field.html() : '') +
      (WA.rest ? WA.rest.html() : '') + rows;
  }

  function perksHtml() {
    const s = S();
    const pending = s.perkPending | 0;
    const avail = WA.perks.DEFS.filter(d => WA.perks.available(d));
    const owned = WA.perks.DEFS.filter(d => WA.perks.rank(d.id) > 0);
    const head = `<div class="prow"><span>PERK CHOICES <b>${pending}</b></span>` +
      `<span class="dim">every ${WA.traits.perkEvery() === 4 ? '4th' : '3rd'} level</span></div>`;
    const choices = pending > 0
      ? (avail.length
        ? avail.map(d => `<div class="prow"><span><b>${U.esc(d.name)}</b> <small class="dim">${U.esc(WA.perks.reqText(d))} · rank ${WA.perks.rank(d.id)}/${d.max}</small><br>` +
          `<small class="dim">${U.esc(d.desc)}</small></span><button data-perk="${d.id}" style="width:58px">Take</button></div>`).join('')
        : '<div class="dim">No perk meets your level and SPECIAL yet.</div>')
      : `<div class="dim">No perk choices waiting. Every ${WA.traits.perkEvery() === 4 ? 'fourth' : 'third'} level grants one.</div>`;
    const have = owned.length
      ? `<div class="dim" style="font-size:12px;margin-top:6px">OWNED</div>` +
        owned.map(d => `<div class="prow" style="align-items:flex-start"><span>${U.esc(d.name)} ` +
          `<small class="dim">rank ${WA.perks.rank(d.id)}/${d.max}</small><br>` +
          `<small class="dim">${U.esc(d.desc)}</small></span></div>`).join('')
      : '';
    return head + choices + have;
  }

  function invHtml() {
    const s = S();
    // Supplies live in their own counters, so they need the stolen mark too.
    const stolen = k => (WA.trade && WA.trade.hot && WA.trade.hot(k) > 0 ? ' <small class="bad">stolen</small>' : '');
    const ammo = Object.keys(s.ammo || {})
      .filter(id => WA.GAME.items[id] && (s.ammo[id] | 0) > 0)
      .map(id => `${U.esc(WA.GAME.items[id].name)} <b>${s.ammo[id] | 0}</b>${stolen(id)}` +
        `<button data-dropammo="${U.esc(id)}" style="width:42px;height:24px;font-size:10px" title="Drop 10">−10</button>`);
    const pouch = `<div class="pouch dim">` +
      `<span>AMMO ${ammo.length ? ammo.join(' · ') : 'none'}</span>` +
      `<span>KITS <b>${s.kits | 0}</b>${stolen('repair_kit')} <button data-drop="repair_kit" style="width:42px;height:24px;font-size:10px" title="Drop one kit">−1</button></span></div>`;
    const use = `<div class="use">` +
      `<button data-use="stim" ${s.stims ? '' : 'disabled'}>Stimpak ${s.stims | 0}${stolen('stimpak')}</button>` +
      `<button data-drop="stimpak" ${s.stims ? '' : 'disabled'} style="flex:0 0 54px;font-size:11px">Drop</button>` +
      `<button data-use="radaway" ${s.radaways ? '' : 'disabled'}>RadAway ${s.radaways | 0}${stolen('radaway')}</button>` +
      `<button data-drop="radaway" ${s.radaways ? '' : 'disabled'} style="flex:0 0 54px;font-size:11px">Drop</button>` +
      `</div>`;
    return pouch + use + WA.inv.html();
  }

  const MARK_PRIORITY = { giver: 1, deliver: 2, kill: 2, repair: 3 };

  function questMarks() {
    const s = S();
    const marks = {};
    if (!s || !WA.quests) return marks;
    const setMark = (x, y, glyph, label, kind) => {
      const key = x + ',' + y;
      const old = marks[key];
      if (!old || (MARK_PRIORITY[kind] || 0) >= (MARK_PRIORITY[old.kind] || 0)) marks[key] = { glyph, label, kind };
    };
    for (const id in WA.quests.DEFS) {
      const st = WA.quests.status(id);
      if (st !== 'active' && st !== 'ready') continue;
      const q = WA.quests.DEFS[id];
      const goals = q.goals || [];
      // The giver is wherever that NPC stands, even when the job points at another map.
      const giver = (s.ents || []).find(e => e && e.id === q.giver && (e.hp === undefined || e.hp > 0));
      if (giver) {
        const deliver = goals.some(g => g.kind === 'ammo' || g.kind === 'item');
        setMark(giver.x, giver.y,
          deliver ? '◆' : '?',
          q.name + ' — ' + (deliver ? 'deliver to ' : '') + (giver.d ? giver.d.name : 'quest giver'),
          deliver ? 'deliver' : 'giver');
      }
      for (const goal of goals) {
        // Kill targets can move, so read the live entities rather than map things.
        if (goal.kind === 'kill') {
          for (const e of s.ents || []) {
            if (e && e.id === goal.id && (e.hp === undefined || e.hp > 0)) {
              setMark(e.x, e.y, '×', q.name + ' — ' + goal.text, 'kill');
            }
          }
        }
        // Repair objectives live on this map's grid, not in the map's static things list.
        if (goal.kind === 'repair' && (!q.map || q.map === s.id)) {
          for (let y = 0; y < s.h; y++) {
            for (let x = 0; x < s.w; x++) {
              if (s.grid[y] && s.grid[y][x] === goal.id) setMark(x, y, '!', q.name + ' — ' + goal.text, 'repair');
            }
          }
        }
      }
    }
    return marks;
  }

  function waypointRow() {
    const id = WA.quests && WA.quests.waypointId ? WA.quests.waypointId() : '';
    const q = id && WA.quests.DEFS[id];
    if (!q) return '';
    const wp = WA.quests.waypoint();
    const clear = `<button type="button" class="wpclear" data-track="${id}" title="Stop showing this job on the map">Clear</button>`;
    if (wp) {
      return `<div class="prow wprow"><span><b class="wp">◉</b> <b>${U.esc(q.name)}</b> ` +
        `<small class="dim">${U.esc(wp.text)}</small></span>` +
        `<span class="acts"><small class="dim">${U.esc(wp.distText)}</small>${clear}</span></div>`;
    }
    const off = WA.quests.waypointElsewhere ? WA.quests.waypointElsewhere() : null;
    return `<div class="prow wprow"><span><b class="wp">◉</b> <b>${U.esc(q.name)}</b> ` +
      `<small class="dim">${U.esc(off ? 'objective in ' + off.mapName : 'objective not in sight')}</small></span>` +
      `<span class="acts">${clear}</span></div>`;
  }

  function mapHtml() {
    const s = S();
    const map = WA.GAME.maps[s.id] || {};
    const exits = Object.keys(map.exits || {});
    const loot = [], terms = [];
    const lines = [];
    const marks = questMarks();
    const wp = WA.quests && WA.quests.waypoint ? WA.quests.waypoint() : null;
    let known = 0;

    for (let y = 0; y < s.h; y++) {
      let line = '';
      for (let x = 0; x < s.w; x++) {
        if (x === s.px && y === s.py) { line += '<b class="me">@</b>'; known++; continue; }
        const mark = marks[x + ',' + y];
        const onWp = !!wp && wp.x === x && wp.y === y;
        if (mark || onWp) {
          const label = onWp ? `Waypoint — ${wp.name} — ${wp.text}` : mark.label;
          line += `<b class="quest q${mark ? mark.kind : 'giver'}${onWp ? ' wp' : ''}" title="${U.esc(label)}">` +
            `${U.esc(onWp ? '◉' : mark.glyph)}</b>`;
          known++;
          continue;
        }
        const seen = s.seen && s.seen[y] && s.seen[y][x];
        if (!seen) { line += ' '; continue; }
        known++;
        const itemId = s.items[x + ',' + y];
        if (itemId) {
          const d = WA.GAME.items[itemId] || {};
          const shut = d.lock && WA.loot && WA.loot.locked(x + ',' + y);
          loot.push({ x, y, name: (d.name || itemId) + (shut ? ' (locked)' : '') });
          line += `<b class="loot">${U.esc(d.glyph || '?')}</b>`;
          continue;
        }
        const e = s.vis && s.vis[y] && s.vis[y][x] ? WA.game.entAt(x, y) : null;
        if (e && e.d) { line += U.esc(e.d.glyph); continue; }
        const tid = s.grid[y][x];
        const t = WA.GAME.tiles[tid] || {};
        if (t.exit || tid === 'terminal') {
          if (tid === 'terminal') terms.push(x + ',' + y);
          line += `<b class="lm">${U.esc(t.glyph || '?')}</b>`;
          continue;
        }
        line += U.esc(t.glyph || '?');
      }
      lines.push(line);
    }

    // Fast travel: only to exits you have seen that lead somewhere you have been.
    const dests = [];
    Object.entries(map.exits || {}).forEach(([k, to]) => {
      const [ex, ey] = k.split(',').map(Number);
      if (!WA.GAME.maps[to] || dests.some(d => d.to === to)) return;
      const exitSeen = s.seen && s.seen[ey] && s.seen[ey][ex];
      const visited = s.seenMaps && s.seenMaps[to];
      if (exitSeen && visited) dests.push({ to, name: WA.GAME.maps[to].name });
    });
    DEST = dests.map(d => d.to);

    const total = Math.max(1, s.w * s.h);
    const pct = Math.round((known / total) * 100);
    const lootTxt = loot.length
      ? `Loot ${loot.length}: ` + loot.slice(0, 5).map(l => `${U.esc(l.name)} ${l.x},${l.y}`).join(' · ') +
        (loot.length > 5 ? ` +${loot.length - 5}` : '')
      : 'Loot: none in sight';
    const places = [
      exits.length ? `Exits ${exits.join(' · ')}` : '',
      terms.length ? `Terminals ${terms.join(' · ')}` : ''
    ].filter(Boolean).join(' · ');

    return `<div class="prow"><span>${U.esc(map.name || s.id)}</span>` +
        `<span class="dim">${s.px},${s.py} · ${pct}%</span></div>` +
      waypointRow() +
      `<div class="pmap">${lines.join('\n')}</div>` +
      `<div class="mlegend">@ you · <b class="loot">loot</b> · <b class="lm">landmark</b> · ` +
        `<b class="quest qgiver">? giver</b> · <b class="quest qdeliver">◆ deliver</b> · ` +
        `<b class="quest qkill">× kill</b> · <b class="quest qrepair">! repair</b> · ` +
        `<b class="quest wp">◉ waypoint</b></div>` +
      `<div class="mlist">${lootTxt}</div>` +
      (places ? `<div class="mlist">${places}</div>` : '') +
      (WA.overworld ? WA.overworld.html() : '');
  }

  function difficultyHtml() {
    if (!WA.settings || !WA.settings.DIFFS) return '';
    const def = WA.settings.difficultyDef;
    const buttons = WA.settings.DIFFS.map(d =>
      `<button data-diff="${d.id}" style="width:52px;font-size:11px;padding:4px 1px;` +
      `${d.id === def.id ? 'background:#ffb000;color:#15100a;border-color:#ffb000;' : ''}">${d.name}</button>`).join(' ');
    return `<div class="prow"><span>DIFFICULTY <b>${U.esc(def.name)}</b><br>` +
      `<small class="dim">${U.esc(def.desc)}</small></span><span class="acts">${buttons}</span></div>`;
  }

  function dataHtml() {
    const s = S();
    const bounty = s && (s.bounty | 0) > 0
      ? `<div class="prow"><span>BOUNTY <b class="bad">${s.bounty | 0} caps</b></span>` +
        `<span class="dim">notoriety ${s.notoriety | 0} · hunters may find you</span></div>`
      : '';
    const ending = s && s.ending
      ? `<div class="prow"><span>ENDING <small class="dim">${s.ending.bloody ? 'Bloody Mess' : 'The road east'}` +
        `${typeof s.ending.karma === 'number' && WA.reputation ? ' · ' + WA.reputation.karmaTier(s.ending.karma).name : ''}</small></span>` +
        `<button data-end="open" style="width:64px;font-size:13px">Read</button></div>`
      : '';
    return difficultyHtml() + bounty + WA.save.panelHtml() + ending;
  }

  function render() {
    const s = S();
    const p = U.el('pip');
    if (!s || !p) return;
    if (document.activeElement && document.activeElement.id === 'gio') return;
    const body = TAB === 'stat' ? statHtml()
      : TAB === 'skills' ? skillsHtml()
        : TAB === 'perks' ? perksHtml()
          : TAB === 'inv' ? invHtml()
            : TAB === 'party' ? WA.party.html()
            : TAB === 'map' ? mapHtml()
              : TAB === 'quest' ? WA.quests.html()
                : dataHtml();
    const tabs = `<div class="piptabs">${TABS.map(([id, name]) =>
      `<button data-tab="${id}" class="${TAB === id ? 'sel' : ''}">${name}</button>`).join('')}` +
      `<span class="pausetag">PAUSED</span>` +
      `<button class="pipclose" data-close="pip" aria-label="Close Pip-Boy">×</button></div>`;
    U.setHtml('pip', tabs + `<div class="pipbody">${body}</div>`);
  }

  function travelTo(id) {
    const s = S();
    if (!s || s.dead) return;
    if (WA.overworld) { WA.overworld.travelTo(id); render(); return; }
    if (!DEST.includes(id)) return;
    if (WA.game.travel(id)) render();
  }

  function setTab(id) {
    if (!TABS.some(t => t[0] === id)) return;
    TAB = id;
    blurText();
    render();
  }

  function open(id) {
    const p = U.el('pip');
    if (!p || WA.ui.isOpen('chargen') || WA.ui.isOpen('ending') || WA.ui.isOpen('death')) return;
    WA.ui.closeAll('pip');
    p.hidden = false;
    if (id) TAB = id;
    render();
  }

  function close() {
    const p = U.el('pip');
    if (!p || p.hidden) return;
    p.hidden = true;
    blurText();
    if (WA.save) WA.save.queueAutosave();
    if (WA.view) WA.view.draw();
  }

  function toggle(id) {
    if (isOpen()) close();
    else open(id);
  }

  WA.pip = { render, open, close, toggle, setTab, travelTo, isOpen, TABS, get tab() { return TAB; }, get dests() { return DEST.slice(); } };
})(window.WA = window.WA || {});
