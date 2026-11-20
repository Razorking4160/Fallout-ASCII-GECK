/* Inventory: pickups, equipping, Stimpaks and the inventory rows. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  const s_ammo = id => { const a = (S().ammo || {})[id]; return typeof a === 'number' ? Math.max(0, a) : 0; };
  const ammoCount = id => (id ? s_ammo(id) : 0);

  /* Weight is authored per item (`wt`) but every class has a sensible default,
     so old saves and unedited Forge items still encumber correctly. */
  const DEFAULT_WT = {
    caps: 0, ammo: 0.1, stim: 0.5, radaway: 1, repair: 2, weapon: 3, armor: 10,
    food: 1, chem: 0.1, key: 0, junk: 0.1, explosive: 1, container: 0, book: 1
  };
  function itemWeight(id) {
    const d = WA.GAME.items[id];
    if (!d) return 0;
    if (typeof d.wt === 'number' && isFinite(d.wt)) return Math.max(0, d.wt);
    return DEFAULT_WT[d.type] || 0;
  }

  function capacity() {
    const s = S();
    if (!s) return 0;
    const sp = WA.traits ? WA.traits.sp(s.sp)
      : (WA.addiction ? WA.addiction.sp(s.sp) : s.sp);
    const frame = WA.traits && WA.traits.has('small_frame') ? 25 : 0;
    const back = WA.perks ? 25 * WA.perks.rank('strong_back') : 0;
    return Math.max(1, 25 + 25 * (sp.S | 0) - frame + back);
  }

  function weight() {
    const s = S();
    if (!s) return 0;
    let n = 0;
    for (const id of s.inv || []) n += itemWeight(id);
    n += (s.stims | 0) * itemWeight('stimpak');
    n += (s.radaways | 0) * itemWeight('radaway');
    n += (s.kits | 0) * itemWeight('repair_kit');
    for (const id in s.ammo || {}) n += Math.max(0, s.ammo[id] | 0) * itemWeight(id);
    return Math.round(n * 10) / 10;
  }

  const canCarry = extra => weight() + Math.max(0, extra || 0) <= capacity() + 0.001;

  /* Ammo is per type, stored by the ammo item's id. */
  function spendAmmo(id) {
    if (!id) return true;
    const s = S();
    if (!s.ammo) s.ammo = {};
    if (!(s.ammo[id] > 0)) return false;
    s.ammo[id]--;
    return true;
  }

  function ammoLine(id) {
    const d = WA.GAME.items[id];
    return d ? `${d.name} ${s_ammo(id)}` : '';
  }

  /* A weapon's `ammo` is still the fallback ID. `caliber` groups compatible
     variants so a 10mm pistol can feed standard, AP or JHP rounds. */
  function ammoIdsFor(wp) {
    if (!wp || !wp.ammo) return [];
    if (Array.isArray(wp.ammo)) return wp.ammo.filter(id => WA.GAME.items[id]);
    if (!wp.caliber) return WA.GAME.items[wp.ammo] ? [wp.ammo] : [];
    const ids = Object.keys(WA.GAME.items).filter(id => {
      const d = WA.GAME.items[id];
      return d && d.type === 'ammo' && d.caliber === wp.caliber;
    });
    return ids.length ? ids : (WA.GAME.items[wp.ammo] ? [wp.ammo] : []);
  }

  function loadedAmmo(wp) {
    const ids = ammoIdsFor(wp);
    if (!ids.length) return null;
    const s = S();
    const key = wp.caliber || wp.ammo;
    const chosen = s && s.ammoPick && s.ammoPick[key];
    if (chosen && ids.includes(chosen) && s_ammo(chosen) > 0) return chosen;
    const stocked = ids.find(id => s_ammo(id) > 0);
    return stocked || (ids.includes(chosen) ? chosen : ids[0]);
  }

  /* Swapping ammunition is free, like equipping gear. Empty variants are
     skipped so the button never selects a round that cannot fire. */
  function cycleAmmo() {
    const s = S();
    if (!s) return false;
    const wp = WA.GAME.items[s.weapon] || {};
    if (!wp.ammo) {
      WA.game.say('Equip a weapon with ammunition first.');
      return false;
    }
    const ids = ammoIdsFor(wp);
    if (ids.length < 2) {
      WA.game.say('This weapon has only one ammo type.');
      return false;
    }
    const cur = loadedAmmo(wp);
    const at = Math.max(0, ids.indexOf(cur));
    let next = null;
    for (let i = 1; i <= ids.length; i++) {
      const id = ids[(at + i) % ids.length];
      if (s_ammo(id) > 0) { next = id; break; }
    }
    if (!next) { WA.game.say('No compatible ammo left.'); return false; }
    s.ammoPick = s.ammoPick || {};
    s.ammoPick[wp.caliber || wp.ammo] = next;
    const d = WA.GAME.items[next] || { name: next };
    WA.game.say(`Loaded ${d.name} (${s_ammo(next)}).`);
    WA.view.draw();
    return true;
  }

  // Food, chems and anything else with an effect can be used from the pack.
  const usesItem = d => !!(d && (d.heal || d.rads || d.ap || d.onHit || d.limb || d.skill || d.special));

  /* How many of an item you hold, including the counters that live on the
     player (stimpaks, RadAway, repair kits) rather than in the pack. */
  function owned(id) {
    const s = S();
    if (!s || !id) return 0;
    let n = (s.inv || []).filter(x => x === id).length;
    if (id === 'stimpak') n += s.stims | 0;
    if (id === 'radaway') n += s.radaways | 0;
    if (id === 'repair_kit') n += s.kits | 0;
    return n;
  }

  /* Spend owned copies, drawing on the player counters before the pack. The
     weapon or armour slot is cleared when its last copy goes. Returns how
     many were actually removed, so a caller can never overdraw. */
  function spend(id, n) {
    const s = S();
    let left = Math.max(0, n | 0);
    if (!s || !id || !left) return 0;
    let took = 0;
    const counter = key => {
      const k = Math.min(left, s[key] | 0);
      if (k > 0) { s[key] -= k; left -= k; took += k; }
    };
    if (id === 'stimpak') counter('stims');
    else if (id === 'radaway') counter('radaways');
    else if (id === 'repair_kit') counter('kits');
    while (left > 0) {
      const i = (s.inv || []).indexOf(id);
      if (i < 0) break;
      s.inv.splice(i, 1);
      left--;
      took++;
    }
    if (took && !(s.inv || []).includes(id)) {
      if (s.weapon === id) s.weapon = null;
      if (s.armor === id) s.armor = null;
    }
    return took;
  }

  /* Keys open locks, and a hacked terminal can release the same locks without
     the key item in hand. */
  function hasKey(id) {
    const s = S();
    if (!s || !id) return false;
    return owned(id) > 0 || !!(s.keys && s.keys[id]);
  }

  function html() {
    const s = S();
    const cap = capacity(), wt = weight();
    const stolen = k => (WA.trade && WA.trade.hot && WA.trade.hot(k) > 0 ? '<small class="bad">stolen</small>' : '');
    const carry = `<div class="prow"><span class="${wt > cap ? 'bad' : ''}">WEIGHT ${wt}/${cap} lbs</span>` +
      `<small class="dim">${wt > cap ? 'overloaded — drop something' : 'carry limit'}</small></div>`;
    const add = WA.addiction ? WA.addiction.html() : '';
    const addiction = add
      ? `<div class="dim" style="font-size:12px;margin-top:4px">DEPENDENCE</div>` + add +
        `<div class="use"><button data-use="cure">Doctor: cure addiction</button></div>`
      : '';
    const count = {};
    for (const k of s.inv) count[k] = (count[k] | 0) + 1;
    const gear = [], usable = [], other = [];
    for (const k of Object.keys(count)) {
      const d = WA.GAME.items[k];
      if (!d) continue;
      if (d.type === 'weapon' || d.type === 'armor') {
        const on = s.weapon === k || s.armor === k;
        const sk = d.type === 'weapon' && WA.skills ? WA.skills.BY[WA.skills.weaponSkill(d)] : null;
        const info = d.type === 'weapon'
          ? (d.dmg || [0, 0]).join('-') + ' dmg' + (d.range > 1 ? ', range ' + d.range : ', melee') +
            (sk ? ', ' + sk.name : '') + ' · CND ' + WA.weapons.condOf(k) + '%'
          : 'blocks ' + (d.def || 0) + ' · CND ' + WA.weapons.condOf(k) + '%';
        gear.push(`<div class="prow"><span>${U.esc(d.name)} ${stolen(k)} <small class="dim">${U.esc(info)} · ${itemWeight(k)} lb</small></span>` +
          `<span class="acts">` + (on ? '<small>equipped</small>' : `<button data-eq="${U.esc(k)}" style="width:64px;font-size:13px">Equip</button>`) +
          `<button data-drop="${U.esc(k)}" style="width:58px;font-size:13px">Drop</button></span></div>`);
        continue;
      }
      const bits = [];
      if (d.heal) bits.push(`+${d.heal} HP`);
      if (d.rads) bits.push(`-${d.rads} rads`);
      if (d.ap) bits.push(`+${d.ap} AP`);
      if (d.type === 'explosive') bits.push(`${(d.dmg || [0, 0]).join('-')} dmg, ${d.blast || 1} blast`);
      if (d.onHit && WA.status.EFX[d.onHit]) {
        const fx = WA.status.EFX[d.onHit];
        bits.push(fx.name.toLowerCase() + (fx.buff ? ' ' + (d.mag || 1) : ''));
      }
      if (d.limb) bits.push('sets crippled limbs');
      if (d.skill && WA.skills && WA.skills.BY[d.skill]) bits.push(`${WA.skills.BY[d.skill].name} +${d.gain || 5}%`);
      if (d.special && WA.char && WA.char.SPN[d.special]) bits.push(`${WA.char.SPN[d.special]} +1`);
      const line = `<div class="prow"><span>${U.esc(d.name)} ${stolen(k)} <small class="dim">×${count[k]} · ${itemWeight(k)} lb each${bits.length ? ' · ' + U.esc(bits.join(', ')) : ''}</small></span>` +
        `<span class="acts">` + (usesItem(d) ? `<button data-use="item" data-slot="${U.esc(k)}" style="width:58px;font-size:13px">Use</button>` : '') +
        `<button data-drop="${U.esc(k)}" style="width:54px;font-size:13px">Drop</button></span></div>`;
      if (usesItem(d)) usable.push(line);
      else other.push(line);
    }
    const wp = WA.GAME.items[s.weapon] || {};
    const cnd = s.weapon ? WA.weapons.condOf(s.weapon) : null;
    const cndCls = cnd === null ? 'dim' : cnd >= 60 ? 'good' : cnd >= 30 ? 'warn' : 'bad';
    const cndTxt = cnd === null ? '' : ` · <span class="${cndCls}">CND ${cnd}%</span>`;
    const ammoId = wp.ammo ? loadedAmmo(wp) : null;
    const ammo = ammoId ? ` · ${U.esc(ammoLine(ammoId))}` : '';
    const ammoBtn = wp.ammo && ammoIdsFor(wp).filter(id => ammoCount(id) > 0).length > 1
      ? `<button data-ammo="next" style="width:58px;font-size:12px">Ammo</button>` : '';
    const repairBtn = cnd !== null && cnd < WA.weapons.MAX
      ? `<button data-use="repair" data-slot="weapon" style="width:92px;font-size:12px" ${s.kits ? '' : 'disabled'}>Repair ${s.kits | 0}</button>`
      : '';
    const arm = WA.GAME.items[s.armor] || {};
    const acnd = s.armor ? WA.weapons.condOf(s.armor) : null;
    const acndCls = acnd === null ? 'dim' : acnd >= 60 ? 'good' : acnd >= 30 ? 'warn' : 'bad';
    const acndTxt = acnd === null ? '' : ` · def ${WA.weapons.armorDef()} · AC ${WA.weapons.armorAc()} · <span class="${acndCls}">CND ${acnd}%</span>`;
    const armorBtn = acnd !== null && acnd < WA.weapons.MAX
      ? `<button data-use="repair" data-slot="armor" style="width:92px;font-size:12px" ${s.kits ? '' : 'disabled'}>Repair ${s.kits | 0}</button>`
      : '';
    const resPairs = Object.entries(arm.res || {})
      .filter(([, v]) => typeof v === 'number' && v)
      .map(([k]) => `${U.esc(k)} ${Math.round(WA.weapons.armorRes(k) * 100)}%`);
    const resLine = resPairs.length
      ? `<div class="dim" style="font-size:12px">Resist: ${resPairs.join(' · ')}</div>`
      : '';
    return carry + addiction +
      `<hr style="border:0;border-top:1px solid var(--dim)">` +
      `<div class="prow"><span>Weapon: ${U.esc(wp.name || 'Fists')}${cndTxt}${ammo}</span>${ammoBtn}${repairBtn}</div>` +
      `<div class="prow"><span>Armor: ${U.esc(arm.name || 'None')}${acndTxt}</span>${armorBtn}</div>` +
      resLine +
      other.join('') + gear.join('') + usable.join('');
  }

  function equip(k) {
    const d = WA.GAME.items[k];
    if (!d) return;
    S()[d.type] = k;
    WA.game.say(`You equip the ${d.name}.`);
    WA.view.draw();
  }

  /* Dropping is free and does not pass a turn; it is the escape hatch when an
     addiction lowers Strength or a heavy find pushes you over the limit. */
  function drop(id) {
    const s = S();
    if (!s) return false;
    const d = WA.GAME.items[id] || { name: id };
    const k = s.px + ',' + s.py;
    // Counter-backed supplies and ammo are discarded; loose items go on the
    // floor where you stand so they can be picked up again.
    if (id === 'stimpak' && s.stims > 0) s.stims--;
    else if (id === 'radaway' && s.radaways > 0) s.radaways--;
    else if (id === 'repair_kit' && s.kits > 0) s.kits--;
    else {
      const i = (s.inv || []).indexOf(id);
      if (i < 0) return false;
      if (s.items[k]) { WA.game.say('There is no room to drop that here.'); return false; }
      s.inv.splice(i, 1);
      s.items[k] = id;
      if (s.weapon === id && !s.inv.includes(id)) s.weapon = null;
      if (s.armor === id && !s.inv.includes(id)) s.armor = null;
    }
    WA.game.say(`You drop the ${d.name}.`);
    if (WA.save) WA.save.queueAutosave();
    WA.view.draw();
    return true;
  }

  function dropAmmo(id, n) {
    const s = S();
    if (!s || !s.ammo || !(s.ammo[id] > 0)) return false;
    const k = Math.min(s.ammo[id] | 0, Math.max(1, n | 0 || 10));
    s.ammo[id] -= k;
    const d = WA.GAME.items[id] || { name: id };
    WA.game.say(`You drop ${k} ${d.name.toLowerCase()}.`);
    if (WA.save) WA.save.queueAutosave();
    WA.view.draw();
    return true;
  }

  /* The Doctor skill is the in-game cure path. It costs a turn and can fail;
     each success removes one dependence. */
  function cureAddiction() {
    const s = S();
    if (!s || s.dead) return;
    const arr = WA.addiction ? WA.addiction.list() : [];
    if (!arr.length) { WA.game.say('You are not addicted to anything.'); return WA.view.draw(); }
    if (WA.combat && !WA.turn.paused()) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    const doctor = WA.skills.value('doctor');
    const chance = Math.max(5, Math.min(90, 30 + doctor));
    const id = arr[0];
    if (Math.random() * 100 < chance) {
      WA.addiction.remove(id);
      WA.game.say(`Doctor ${chance}%: you break the ${(WA.GAME.items[id] || {}).name || id} habit.`);
    } else {
      WA.game.say(`Doctor ${chance}%: the withdrawal holds. Try again.`);
    }
    WA.turn.end(true);
  }

  /* One copy of an item, straight into the player's pockets. Shared by floor
     pickups and by containers, which hand items over one at a time. */
  function collect(it) {
    const s = S();
    const d = WA.GAME.items[it];
    if (!d) return false;
    const deny = () => {
      WA.game.say(`Too heavy. You can carry ${capacity()} lbs; drop something first.`);
      return false;
    };
    if (d.type === 'caps') {
      const a = Math.round(U.rnd(...d.amt) * (WA.perks ? WA.perks.capsMul() : 1) *
        (WA.settings ? WA.settings.lootMul() : 1));
      s.caps += a; WA.game.say(`You find ${a} caps.`);
    }
    else if (d.type === 'stim') {
      if (!canCarry(itemWeight(it))) return deny();
      s.stims++; WA.game.say('You pick up a Stimpak.');
    }
    else if (d.type === 'radaway') {
      if (!canCarry(itemWeight(it))) return deny();
      s.radaways = (s.radaways | 0) + 1; WA.game.say('You pick up RadAway.');
    }
    else if (d.type === 'repair') {
      if (!canCarry(itemWeight(it))) return deny();
      s.kits = (s.kits | 0) + 1; WA.game.say('You pick up a repair kit.');
    }
    else if (d.type === 'ammo') {
      const a = Math.max(1, Math.round(U.rnd(...(d.amt || [6, 12])) *
        (WA.perks ? WA.perks.ammoMul() : 1) * (WA.settings ? WA.settings.lootMul() : 1)));
      if (!canCarry(a * itemWeight(it))) return deny();
      s.ammo = s.ammo || {};
      s.ammo[it] = (s.ammo[it] | 0) + a;
      WA.game.say(`You find ${a} ${d.name.toLowerCase()}.`);
    }
    else if (d.type === 'food' || d.type === 'chem' || d.type === 'key' || d.type === 'junk' || d.type === 'explosive' || d.type === 'book') {
      if (!canCarry(itemWeight(it))) return deny();
      s.inv.push(it);
      WA.game.say(`You pick up the ${d.name}.`);
    }
    else if (d.type === 'weapon' || d.type === 'armor') {
      if (!canCarry(itemWeight(it))) return deny();
      s.inv.push(it);
      WA.weapons.fresh(it);
      const equipped = !s[d.type];
      if (equipped) s[d.type] = it;
      WA.game.say(`You find the ${d.name}` + (equipped ? ' and equip it.' : '. Tap the top bar to equip.'));
    } else WA.game.say(`You pick up the ${d.name}.`);
    return true;
  }

  function pickup(k) {
    const s = S();
    const it = s.items[k];
    if (!it) return;
    const d = WA.GAME.items[it];
    // Containers are searched, not picked up.
    if (d && d.type === 'container') {
      if (WA.loot) WA.loot.open(k);
      return;
    }
    if (!d) return;
    // Keep the item on the floor if the carry check refuses it.
    if (collect(it)) delete s.items[k];
  }

  function stim() {
    const s = S();
    if (!s || s.dead) return;
    if (s.stims < 1) { WA.game.say('No Stimpaks left.'); return WA.view.draw(); }
    if (s.hp >= WA.char.maxHp()) { WA.game.say('Already at full health.'); return WA.view.draw(); }
    if (WA.combat && !WA.turn.paused()) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    s.stims--;
    const heal = Math.round((10 + (WA.traits ? WA.traits.healBonus() : 0)) *
      (WA.perks ? WA.perks.healMul() : 1));
    s.hp = Math.min(WA.char.maxHp(), s.hp + heal);
    WA.game.say(`You use a Stimpak. +${heal} HP.`);
    WA.turn.end(true);
  }

  function radaway() {
    const s = S();
    if (!s || s.dead) return;
    if (!s.radaways) { WA.game.say('No RadAway left.'); return WA.view.draw(); }
    if (!(s.rads > 0)) { WA.game.say('You are not irradiated.'); return WA.view.draw(); }
    if (WA.combat && !WA.turn.paused()) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    s.radaways--;
    const removed = WA.rads.flush();
    WA.game.say(`You use RadAway. ${removed} rads flushed.`);
    WA.turn.end(true);
  }

  function repair(what) {
    const s = S();
    if (!s || s.dead) return;
    const slot = what === 'armor' ? 'armor' : 'weapon';
    const item = WA.GAME.items[s[slot]];
    if (!item) { WA.game.say(`Nothing equipped to repair.`); return WA.view.draw(); }
    const c = WA.weapons.condOf(s[slot]);
    if (c >= WA.weapons.MAX) { WA.game.say(`Your ${item.name} is in good condition.`); return WA.view.draw(); }
    if (!s.kits) { WA.game.say('No repair kits left.'); return WA.view.draw(); }
    const kit = WA.GAME.items.repair_kit;
    s.kits--;
    WA.weapons.set(s[slot], c + ((kit && kit.fix) || 40));
    WA.game.say(`You repair the ${item.name}. Condition ${WA.weapons.condOf(s[slot])}%.`);
    WA.view.draw();
  }

  /* Eat or use a carried item: every effect the definition carries is applied,
     then one copy leaves the pack and a turn passes. */
  function useItem(id) {
    const s = S(), d = WA.GAME.items[id];
    if (!s || s.dead || !d) return;
    if ((s.inv || []).indexOf(id) < 0) { WA.game.say(`You have no ${d.name}.`); return WA.view.draw(); }
    if (!usesItem(d)) { WA.game.say(`You cannot use the ${d.name}.`); return WA.view.draw(); }
    if (d.limb && WA.limbs && !WA.limbs.crippled(s).length) {
      WA.game.say('Your limbs are already sound.');
      return WA.view.draw();
    }
    if (d.skill && WA.skills && WA.skills.BY[d.skill] && WA.skills.value(d.skill) >= 200) {
      WA.game.say(`You already know everything ${d.name} can teach.`);
      return WA.view.draw();
    }
    if (d.special && (!s.sp || (s.sp[d.special] | 0) >= 10)) {
      WA.game.say(`${WA.char.SPN[d.special] || d.special} is already at 10.`);
      return WA.view.draw();
    }
    if (WA.combat && !WA.turn.paused()) WA.combat.initiative();
    if (s.dead || s.hp <= 0) return;
    s.inv.splice(s.inv.indexOf(id), 1);
    const bits = [];
    if (d.heal) {
      const before = s.hp;
      const heal = d.heal + (WA.traits ? WA.traits.healBonus() : 0);
      s.hp = Math.min(WA.char.maxHp(), s.hp + heal);
      if (s.hp > before) bits.push(`+${s.hp - before} HP`);
    }
    if (d.rads) {
      const removed = Math.abs(WA.rads.add(-Math.abs(d.rads)));
      if (removed) bits.push(`-${removed} rads`);
    }
    if (d.ap) {
      const before = s.ap;
      s.ap = Math.min(WA.char.maxAp(), s.ap + d.ap);
      if (s.ap > before) bits.push(`+${s.ap - before} AP`);
    }
    if (d.onHit && WA.status.EFX[d.onHit]) {
      const fx = WA.status.EFX[d.onHit];
      const dur = d.type === 'chem' && WA.traits ? WA.traits.chemDuration(d.dur || 3) : (d.dur || 3);
      const mag = d.mag || 1;
      WA.status.addPlayer(d.onHit, dur, mag, d.type === 'chem' ? id : null);
      bits.push(fx.buff ? `${fx.name} ${mag} for ${dur} turns` : fx.state);
    }
    if (d.limb && WA.limbs) {
      const n = WA.limbs.healAll(s);
      if (n) bits.push(`${n} limb${n === 1 ? '' : 's'} set`);
    }
    if (d.skill && WA.skills && WA.skills.BY[d.skill]) {
      const gain = Math.min(d.gain || 5, 200 - WA.skills.value(d.skill));
      s.skillPts = s.skillPts || {};
      s.skillPts[d.skill] = (s.skillPts[d.skill] | 0) + gain;
      bits.push(`${WA.skills.BY[d.skill].name} +${gain}%`);
    }
    if (d.special && WA.char && WA.char.SPN[d.special]) {
      const beforeMax = WA.char.maxHp();
      s.sp[d.special] = (s.sp[d.special] | 0) + 1;
      if (d.special === 'E') {
        const gain = Math.max(0, WA.char.maxHp() - beforeMax);
        s.hp = Math.min(WA.char.maxHp(), (s.hp | 0) + Math.max(4, gain));
      }
      if (d.special === 'A') s.ap = Math.max(s.ap | 0, WA.char.maxAp());
      bits.push(`${WA.char.SPN[d.special]} ${s.sp[d.special]}`);
    }
    const verb = d.type === 'food' ? 'eat' : d.type === 'book' ? 'read' : 'use';
    WA.game.say(`You ${verb} the ${d.name}` + (bits.length ? `: ${bits.join(', ')}.` : '.'));
    WA.turn.end(true);
  }

  function use(kind, slot) {
    if (kind === 'stim') stim();
    else if (kind === 'radaway') radaway();
    else if (kind === 'repair') repair(slot);
    else if (kind === 'item') useItem(slot);
    else if (kind === 'cure') cureAddiction();
  }

  WA.inv = { html, equip, drop, dropAmmo, pickup, collect, stim, radaway, repair, cureAddiction, use, useItem,
    owned, spend, hasKey, ammoCount, ammoIdsFor, loadedAmmo, cycleAmmo, spendAmmo, itemWeight, weight, capacity, canCarry };
})(window.WA = window.WA || {});
