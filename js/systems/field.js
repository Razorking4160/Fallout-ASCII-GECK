/* Field actions: First Aid, Doctor, Repair, Traps and Sneak.
   Everything here spends AP while the Pip-Boy is open, so the world stays
   paused exactly as it does for Stimpaks and other inventory actions. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const AID_AP = 1, DOC_AP = 2, REPAIR_AP = 2, SCAN_AP = 1, DISARM_AP = 2;
  let FOUND = [];
  let FOUND_MAP = '';

  const ap = () => (S() ? S().ap | 0 : 0);
  const maxAp = () => (WA.char ? WA.char.maxAp() : 0);
  const maxHp = () => (WA.char ? WA.char.maxHp() : 0);

  function say(text) {
    if (WA.game && WA.game.say) WA.game.say(text);
  }

  function refresh() {
    const s = S();
    if (!s) return;
    if (WA.pip && WA.pip.isOpen()) WA.pip.render();
    if (WA.view) WA.view.draw();
    if (WA.save && !s.dead) WA.save.queueAutosave();
  }

  function spend(n) {
    const s = S();
    if (!s) return false;
    if (ap() < n) {
      say(`Not enough AP. ${n} AP needed (you have ${ap()}).`);
      return false;
    }
    s.ap = ap() - n;
    return true;
  }

  /* ---------- First Aid ---------- */
  function firstAidHeal() {
    return Math.round((4 + Math.floor((WA.skills.value('first_aid') | 0) / 10)) *
      (WA.perks ? WA.perks.healMul() : 1));
  }

  function firstAid() {
    const s = S();
    if (!s || s.dead) return;
    if (s.hp >= maxHp()) { say('You are already at full health.'); return refresh(); }
    if (!spend(AID_AP)) return refresh();
    const r = WA.skills.checkResult('first_aid', 20);
    if (r.success) {
      const heal = Math.min(maxHp() - s.hp, firstAidHeal());
      s.hp += heal;
      say(`First Aid (${r.chance}%): you bandage yourself. +${heal} HP.`);
    } else {
      say(`First Aid failed (${r.chance}%): the bandage slips and buys you nothing.`);
    }
    refresh();
  }

  /* ---------- Doctor ---------- */
  function doctorHeal() {
    return 6 + Math.floor((WA.skills.value('doctor') | 0) / 6);
  }

  function brokenLimbs() {
    return WA.limbs ? WA.limbs.crippled(S()) : [];
  }

  function doctorDifficulty(limbs) {
    return 25 + Math.max(0, (limbs | 0) - 1) * 5;
  }

  function doctor() {
    const s = S();
    if (!s || s.dead) return;
    const poison = (s.fx || []).find(f => f && f.t === 'poison');
    const hurt = s.hp < maxHp();
    const broken = brokenLimbs();
    const bag = WA.inv.owned('doctor_bag');
    const other = hurt || poison || (s.rads | 0);
    if (!other && !broken.length) {
      say('You have no wounds, poison, radiation or crippled limbs for a doctor to treat.');
      return refresh();
    }
    if (broken.length && !bag && !other) {
      say("You need a Doctor's Bag to set a crippled limb.");
      return refresh();
    }
    if (!spend(DOC_AP)) return refresh();
    if (broken.length && bag) consume('doctor_bag');
    const r = WA.skills.checkResult('doctor', doctorDifficulty(broken.length && bag ? broken.length : 0));
    if (r.success) {
      const notes = [];
      if (broken.length && bag) {
        const set = WA.limbs.healAll(s);
        if (set) notes.push(`${set} limb${set === 1 ? '' : 's'} set`);
      } else if (broken.length) {
        notes.push("limb still needs a Doctor's Bag");
      }
      if (hurt) {
        const heal = Math.min(maxHp() - s.hp, doctorHeal());
        s.hp += heal;
        notes.push(`+${heal} HP`);
      }
      if (poison) {
        s.fx = s.fx.filter(f => f !== poison);
        notes.push('poison treated');
      }
      if ((s.rads | 0) > 0) {
        const flushed = WA.rads.flush(Math.max(2, Math.floor(WA.skills.value('doctor') / 4)));
        if (flushed) notes.push(`-${flushed} rads`);
      }
      say(`Doctor (${r.chance}%): ${notes.join(', ') || 'treatment complete'}.`);
    } else {
      say(`Doctor failed (${r.chance}%): the treatment does more harm than good.` +
        (broken.length && bag ? " The bag is spent; your limbs stay crippled." : ''));
    }
    refresh();
  }

  /* ---------- Repair ---------- */
  function repairChance(slot) {
    const s = S();
    const id = s && s[slot];
    if (!id) return 0;
    const c = WA.weapons.condOf(id);
    if (c >= WA.weapons.MAX) return 0;
    return WA.skills.checkChance('repair', 25 + Math.round((WA.weapons.MAX - c) * 0.4));
  }

  function repair(slot) {
    const s = S();
    if (!s || s.dead || (slot !== 'weapon' && slot !== 'armor')) return;
    const id = s[slot];
    if (!id) { say(`No ${slot} equipped.`); return refresh(); }
    const c = WA.weapons.condOf(id);
    if (c >= WA.weapons.MAX) { say(`Your ${WA.GAME.items[id].name} needs no repair.`); return refresh(); }
    if (!spend(REPAIR_AP)) return refresh();
    const r = WA.skills.checkResult('repair', 25 + Math.round((WA.weapons.MAX - c) * 0.4));
    if (r.success) {
      const gain = Math.min(WA.weapons.MAX - c, 5 + Math.floor(WA.skills.value('repair') / 8));
      WA.weapons.set(id, c + gain);
      say(`Repair (${r.chance}%): you restore ${gain}% condition to the ${WA.GAME.items[id].name}.`);
    } else {
      say(`Repair failed (${r.chance}%): you cannot find the fault in the ${WA.GAME.items[id].name}.`);
    }
    refresh();
  }

  /* ---------- World repair ---------- */
  function nearbyRepairs() {
    const s = S();
    if (!s) return [];
    const out = [];
    for (let y = Math.max(0, s.py - 2); y <= Math.min(s.h - 1, s.py + 2); y++) {
      for (let x = Math.max(0, s.px - 2); x <= Math.min(s.w - 1, s.px + 2); x++) {
        if (x === s.px && y === s.py) continue;
        if (WA.settings && WA.settings.fog && !(s.seen[y] && s.seen[y][x])) continue;
        const id = s.grid[y] && s.grid[y][x];
        const d = id && WA.GAME.tiles[id];
        if (!d || !d.repair || !WA.GAME.tiles[d.repair]) continue;
        out.push({ x, y, id, d, target: d.repair, need: d.repairNeed || '', diff: d.repairDiff || 30 });
      }
    }
    return out;
  }

  function consume(id) {
    const s = S();
    if (!s || !id) return true;
    if (id === 'repair_kit' && (s.kits | 0) > 0) { s.kits--; return true; }
    if (id === 'stimpak' && (s.stims | 0) > 0) { s.stims--; return true; }
    if (id === 'radaway' && (s.radaways | 0) > 0) { s.radaways--; return true; }
    const i = (s.inv || []).indexOf(id);
    if (i < 0) return false;
    s.inv.splice(i, 1);
    return true;
  }

  function repairObject(x, y) {
    const s = S();
    if (!s || s.dead) return;
    x = x | 0; y = y | 0;
    const id = s.grid[y] && s.grid[y][x];
    const d = id && WA.GAME.tiles[id];
    if (!d || !d.repair || !WA.GAME.tiles[d.repair]) { say('There is nothing to repair there.'); return refresh(); }
    if (U.cheb(s.px, s.py, x, y) > 2) { say('That is out of reach.'); return refresh(); }
    const need = d.repairNeed || '';
    if (need && WA.inv.owned(need) < 1) {
      const item = WA.GAME.items[need];
      say(`You need ${item ? item.name : need} to repair the ${d.name.toLowerCase()}.`);
      return refresh();
    }
    if (!spend(REPAIR_AP)) return refresh();
    const diff = Math.max(5, Math.min(95, d.repairDiff || 30));
    const r = WA.skills.checkResult('repair', diff);
    if (r.success) {
      if (need) consume(need);
      s.grid[y][x] = d.repair;
      if (WA.quests && WA.quests.onRepair) WA.quests.onRepair(id);
      say(d.repairMsg || `Repair (${r.chance}%): you restore the ${d.name.toLowerCase()}.`);
      if (WA.game.updateVis) WA.game.updateVis();
    } else {
      say(`Repair failed (${r.chance}%): you cannot restore the ${d.name.toLowerCase()}.`);
    }
    refresh();
  }

  /* ---------- Traps ---------- */
  const TRAP_IDS = { spike_trap: 1, landmine: 1, fire_vent: 1, electric_arc: 1 };
  function isTrap(id) {
    const d = WA.GAME.tiles[id];
    return !!(d && (d.trap || TRAP_IDS[id]));
  }

  const trapKey = k => { const s = S(); return (s ? s.id : '') + '|' + k; };

  function containerTrapStatus(cell) {
    const s = S();
    if (!s) return '';
    const id = s.items && s.items[cell];
    const d = id && WA.GAME.items[id];
    if (!d || d.type !== 'container' || !d.trap) return '';
    return s.trapsOff && s.trapsOff[trapKey(cell)] ? 'disarmed' : 'armed';
  }

  function containerTrapAt(x, y) {
    const s = S();
    if (!s) return null;
    const cell = x + ',' + y, key = trapKey(cell);
    const id = s.items && s.items[cell];
    const d = id && WA.GAME.items[id];
    if (!d || d.type !== 'container' || !d.trap) return null;
    if (s.trapsOff && s.trapsOff[key]) return null;
    return { kind: 'container', x, y, id, key, cell, name: d.name || 'Container', d, lock: d.lock | 0 };
  }

  function nearbyTraps() {
    const s = S();
    if (!s) return [];
    const out = [];
    for (let y = Math.max(0, s.py - 2); y <= Math.min(s.h - 1, s.py + 2); y++) {
      for (let x = Math.max(0, s.px - 2); x <= Math.min(s.w - 1, s.px + 2); x++) {
        if (x === s.px && y === s.py) continue;
        if (WA.settings && WA.settings.fog && !(s.seen[y] && s.seen[y][x])) continue;
        const id = s.grid[y] && s.grid[y][x];
        if (isTrap(id)) out.push({ kind: 'tile', x, y, id, name: WA.GAME.tiles[id].name });
        const container = containerTrapAt(x, y);
        if (container) out.push(container);
      }
    }
    return out;
  }

  function currentFound() {
    const s = S();
    if (!s || FOUND_MAP !== s.id) { FOUND = []; FOUND_MAP = s.id; }
    return FOUND;
  }

  function scanTraps() {
    const s = S();
    if (!s || s.dead) return;
    if (!spend(SCAN_AP)) return refresh();
    const r = WA.skills.checkResult('traps', 20);
    FOUND = r.success ? nearbyTraps() : [];
    FOUND_MAP = s.id;
    if (!r.success) say(`Traps scan failed (${r.chance}%): you find nothing you trust.`);
    else if (!FOUND.length) say(`Traps scan (${r.chance}%): no traps within two tiles.`);
    else say(`Traps scan (${r.chance}%): ${FOUND.length} trap${FOUND.length === 1 ? '' : 's'} found nearby.`);
    refresh();
  }

  function trapHazard(t) {
    const res = WA.damage.hurtPlayer(t.hurt || 1, t.dt || 'melee');
    if (t.onHit && WA.status.EFX[t.onHit]) WA.status.addPlayer(t.onHit, t.dur || 2, t.mag || 1);
    if (t.rads) WA.rads.add(t.rads);
    say(`${t.msg || 'The trap goes off!'} You take ${res.value} damage.`);
  }

  function springContainer(cell) {
    const s = S();
    if (!s) return false;
    const id = s.items && s.items[cell];
    const d = id && WA.GAME.items[id];
    if (!d || d.type !== 'container' || !d.trap) return false;
    const key = trapKey(cell);
    if (s.trapsOff && s.trapsOff[key]) return false;
    s.trapsOff = s.trapsOff || {};
    s.trapsOff[key] = 1;
    FOUND = currentFound().filter(f => f.key !== key);
    trapHazard({
      hurt: d.trapHurt || 5,
      dt: d.trapDt || 'explosive',
      msg: d.trapMsg || `A hidden charge on the ${d.name.toLowerCase()} detonates!`
    });
    if (s.hp <= 0) {
      s.hp = 0;
      s.dead = true;
      if (WA.pip) WA.pip.close();
      if (WA.view) WA.view.draw();
    }
    return true;
  }

  function disarmContainer(found) {
    const s = S();
    const cell = found.cell, key = found.key;
    const id = s.items && s.items[cell];
    const d = id && WA.GAME.items[id];
    if (!d || d.type !== 'container' || !d.trap || (s.trapsOff && s.trapsOff[key])) {
      say('That trap is already gone.');
      return refresh();
    }
    if (U.cheb(s.px, s.py, found.x, found.y) > 2) { say('That trap is out of reach.'); return refresh(); }
    if (!spend(DISARM_AP)) return refresh();
    const diff = 20 + Math.min(40, (d.lock | 0) * 8);
    const r = WA.skills.checkResult('traps', diff);
    if (r.success) {
      s.trapsOff = s.trapsOff || {};
      s.trapsOff[key] = 1;
      FOUND = currentFound().filter(f => f.key !== key);
      say(`Traps (${r.chance}%): you disarm the ${d.name.toLowerCase()}.`);
    } else {
      say(`Traps failed (${r.chance}%): the ${d.name.toLowerCase()}'s trap goes off!`);
      springContainer(cell);
      if (s.dead) return;
    }
    refresh();
  }

  function disarmTrap(x, y) {
    const s = S();
    if (!s || s.dead) return;
    x = x | 0; y = y | 0;
    const found = currentFound().find(f => f.x === x && f.y === y);
    if (!found) { say('Scan for that trap before trying to disarm it.'); return refresh(); }
    if (found.kind === 'container') return disarmContainer(found);
    const id = s.grid[y] && s.grid[y][x];
    if (!isTrap(id)) { say('That trap is already gone.'); return refresh(); }
    if (U.cheb(s.px, s.py, x, y) > 2) { say('That trap is out of reach.'); return refresh(); }
    if (!spend(DISARM_AP)) return refresh();
    const t = WA.GAME.tiles[id];
    const diff = 20 + Math.min(40, (t.hurt || 1) * 3);
    const r = WA.skills.checkResult('traps', diff);
    if (r.success) {
      s.grid[y][x] = 'floor';
      FOUND = currentFound().filter(f => f.x !== x || f.y !== y);
      say(`Traps (${r.chance}%): you disarm the ${t.name.toLowerCase()}.`);
      if (WA.game.updateVis) WA.game.updateVis();
    } else {
      say(`Traps failed (${r.chance}%): the ${t.name.toLowerCase()} triggers!`);
      trapHazard(t);
      if (s.hp <= 0) {
        s.hp = 0;
        s.dead = true;
        if (WA.pip) WA.pip.close();
        if (WA.view) WA.view.draw();
        return;
      }
    }
    refresh();
  }

  /* ---------- Sneak ---------- */
  function sneakStatus() {
    const s = S();
    if (!s || !s.sneak) return 'VISIBLE';
    return s.sneakSpotted ? 'DETECTED' : 'HIDDEN';
  }

  function sneakLight() {
    const s = S();
    if (!s) return 0.5;
    const v = typeof s.stealthLight === 'number'
      ? s.stealthLight
      : (WA.light && WA.light.stealth ? WA.light.stealth(s) : 0.5);
    return v < 0.3 ? 'DARK' : v < 0.7 ? 'DIM' : 'LIT';
  }

  function toggleSneak() {
    const s = S();
    if (!s || s.dead) return;
    s.sneak = !s.sneak;
    s.sneakSpotted = false;
    s.sneakMoved = false;
    s.sneakRun = false;
    s.stealthLight = null;
    say(s.sneak
      ? `You crouch low and move quietly (Sneak ${WA.skills.value('sneak')}%).`
      : 'You stand up and move normally.');
    refresh();
  }

  function spotted(e) {
    const s = S();
    if (!s || !s.sneak || s.sneakSpotted) return;
    s.sneakSpotted = true;
    say(`${e && e.d ? e.d.name : 'Something'} spots you!`);
  }

  function breakSneak() {
    const s = S();
    if (!s || !s.sneak) return;
    s.sneak = false;
    s.sneakSpotted = false;
    s.sneakMoved = false;
    s.sneakRun = false;
    s.stealthLight = null;
    say('You break cover.');
  }

  /* Running is a separate pace, not a second stance: it sets the cost of a free
     step and, under cover, the noise the next detection roll has to beat. */
  function toggleRun() {
    const s = S();
    if (!s || s.dead) return;
    s.run = !s.run;
    say(s.run
      ? 'You move at a run — 2 AP a step, and loud.'
      : 'You slow to a walk — 1 AP a step.');
    refresh();
  }

  // A sneak attack only lands on an enemy that has not noticed you.
  function sneakAttack(e) {
    const s = S();
    if (!s || !s.sneak || s.sneakSpotted) return false;
    if (e && e.last) return false;
    return true;
  }

  // Detection chance for one enemy. Light and recent movement make noise;
  // distance gives a small bonus. Adjacent enemies always notice. Turning your
  // back on an enemy hides your face and Pip-Boy lamp, so it is easier to stay
  // unseen; facing it is easier for them.
  function sneakChance(e, dist) {
    const s = S();
    if (!s || !s.sneak) return 0;
    const sight = (e && e.d && e.d.sight) || 6;
    const d = dist === undefined ? U.cheb(e ? e.x : s.px, e ? e.y : s.py, s.px, s.py) : Math.max(0, dist | 0);
    if (d <= 1) return 0;
    const light = typeof s.stealthLight === 'number' ? s.stealthLight :
      (WA.light && WA.light.stealth ? WA.light.stealth(s) : 0.5);
    const turned = e ? U.turnedFrom(s.face || 's', e.x - s.px, e.y - s.py) : false;
    const difficulty = 25 + sight * 2
      // A run is heard before a walk is; a still crouch is quietest.
      + (s.sneakRun ? 35 : s.sneakMoved ? 15 : 0)
      + Math.round((light - 0.5) * 40)
      - Math.max(0, d - 2) * 3
      // A higher difficulty is harder to beat, so a turned back lowers it.
      - (turned ? 12 : -8);
    return WA.skills.checkChance('sneak', Math.max(5, difficulty));
  }

  function staysHidden(e, dist) {
    const s = S();
    if (!s || !s.sneak) return false;
    return Math.random() * 100 < sneakChance(e, dist);
  }

  /* ---------- Pip-Boy panel ---------- */
  function button(label, action, extra) {
    return `<button data-field="${action}"${extra || ''}>${label}</button>`;
  }

  function html() {
    const s = S();
    if (!s) return '';
    const aid = WA.skills.checkChance('first_aid', 20);
    const broken = brokenLimbs();
    const bags = WA.inv.owned('doctor_bag');
    const doc = WA.skills.checkChance('doctor', doctorDifficulty(broken.length && bags ? broken.length : 0));
    const lines = [];

    lines.push(`<div class="fieldhead">FIELD KIT <small class="dim">AP ${ap()}/${maxAp()}</small></div>`);
    lines.push(`<div class="fieldrow"><span>First Aid <small class="dim">${aid}% · ${firstAidHeal()} HP</small></span>` +
      button(`1 AP`, 'firstaid') + '</div>');
    lines.push(`<div class="fieldrow"><span>Doctor <small class="dim">${doc}% · HP, poison, rads${broken.length ? ' · ' + WA.limbs.tag(s) : ''}</small>` +
      (broken.length ? `<small class="${bags ? 'dim' : 'bad'}"> · bag ${bags}</small>` : '') + '</span>' +
      button(`2 AP`, 'doctor') + '</div>');

    const gear = [];
    for (const slot of ['weapon', 'armor']) {
      const id = s[slot];
      if (!id) continue;
      const c = WA.weapons.condOf(id);
      if (c >= WA.weapons.MAX) continue;
      gear.push(`<div class="fieldrow"><span>${U.esc(WA.GAME.items[id].name)} <small class="dim">CND ${c}% · Repair ${repairChance(slot)}%</small></span>` +
        button('2 AP', 'repair', ` data-slot="${slot}"`) + '</div>');
    }
    if (gear.length) lines.push(`<div class="fieldsub">REPAIR</div>${gear.join('')}`);

    const fixes = nearbyRepairs();
    if (fixes.length) {
      lines.push(`<div class="fieldsub">WORLD REPAIR <small class="dim">2 AP</small></div>`);
      for (const f of fixes) {
        const need = f.need ? WA.GAME.items[f.need] : null;
        const ready = !f.need || WA.inv.owned(f.need) > 0;
        const detail = `${WA.skills.checkChance('repair', f.diff)}%` +
          (need ? ` · ${ready ? '' : 'need '}${U.esc(need.name)}` : '');
        lines.push(`<div class="fieldrow"><span>${U.esc(f.d.name)} <small class="dim">${detail}</small></span>` +
          button('2 AP', 'fixobj', ` data-x="${f.x}" data-y="${f.y}"${ready ? '' : ' disabled'}`) + '</div>');
      }
    }

    const found = currentFound();
    lines.push(`<div class="fieldsub">TRAPS <small class="dim">scan 1 AP · disarm 2 AP</small></div>`);
    lines.push(`<div class="fieldrow"><span>Nearby traps <small class="dim">${found.length} marked</small></span>` +
      button('Scan', 'scan') + '</div>');
    for (const f of found) {
      lines.push(`<div class="fieldrow"><span>${U.esc(f.name)} <small class="dim">${f.kind === 'container' ? 'container' : 'tile'} · ${f.x},${f.y}</small></span>` +
        button('Disarm', 'disarm', ` data-x="${f.x}" data-y="${f.y}"`) + '</div>');
    }

    lines.push(`<div class="fieldrow"><span>Sneak <small class="dim">${sneakStatus()} · ${WA.skills.value('sneak')}% · ${sneakLight()}</small></span>` +
      button(s.sneak ? 'Stand' : 'Sneak', 'sneak') + '</div>');
    lines.push(`<div class="fieldrow"><span>Pace <small class="dim">${s.run ? 'RUN · 2 AP a step' : 'WALK · 1 AP a step'}</small></span>` +
      button(s.run ? 'Walk' : 'Run', 'run') + '</div>');
    return `<div class="fieldpanel">${lines.join('')}</div>`;
  }

  function act(action, x, y, slot) {
    if (action === 'firstaid') return firstAid();
    if (action === 'doctor') return doctor();
    if (action === 'repair') return repair(slot);
    if (action === 'fixobj') return repairObject(x, y);
    if (action === 'scan') return scanTraps();
    if (action === 'disarm') return disarmTrap(x, y);
    if (action === 'sneak') return toggleSneak();
    if (action === 'run') return toggleRun();
  }

  WA.field = { act, html, firstAid, doctor, repair, repairObject, nearbyRepairs, scanTraps, disarmTrap, toggleSneak, toggleRun,
    sneakAttack, breakSneak, spotted, staysHidden, sneakChance, sneakLight, isTrap, nearbyTraps, sneakStatus,
    containerTrapAt, containerTrapStatus, springContainer,
    reset: () => { FOUND = []; FOUND_MAP = ''; } };
})(window.WA = window.WA || {});
