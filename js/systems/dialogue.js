/* Talking to people. Each NPC carries a small conversation tree; choices can
   spend caps, give items, reveal places, earn trust and take or close quests,
   and the NPC's replies change with what you have already said and done. */
(function (WA) {
  'use strict';
  const U = WA.util;
  const S = () => WA.game.S;

  let NPC = null, NODE = '', OPTS = [], CHECK_MSG = '';

  const isOpen = () => { const el = U.el('dlg'); return !!el && !el.hidden; };
  const def = () => (NPC ? WA.GAME.entities[NPC] : null);

  /* A hostile faction still talks, but only about the mark on you and the
     price of lifting it. This replaces the NPC's own tree while Hated, so no
     shop, quest or service option can slip through. */
  function hostileTree(d, fid) {
    const fname = WA.reputation.factionName(fid);
    return {
      root: () => 'hostile',
      nodes: {
        hostile: {
          text: `${d.name} does not step back. "${fname} has marked you. No trade, no jobs, no favours."`,
          opts: [
            { t: 'I want to make this right. (100 caps)', to: 'reparations' },
            { t: 'Leave', close: true }
          ]
        },
        reparations: {
          text: c => c.caps >= 100
            ? 'A hundred caps of restitution might buy the mark off. It will not buy an apology.'
            : 'A hundred caps of restitution might buy the mark off. You do not have a hundred caps.',
          opts: [
            { t: 'Pay 100 caps.', fx: { caps: -100, rep: { [fid]: 60 }, repWhy: `reparations to ${fname}` }, to: 'repaired', if: c => c.caps >= 100 },
            { t: 'Not now.', close: true }
          ]
        },
        repaired: {
          text: 'The mark is lifted, for now. Do not make it worse.',
          opts: [{ t: 'Leave', close: true }]
        }
      }
    };
  }

  const tree = () => {
    const d = def();
    if (!d) return null;
    // Keep the hostile pages alive long enough to show the payment confirmation
    // even though that payment just lifted the mark.
    if ((WA.reputation && WA.reputation.hostile(NPC)) ||
      NODE === 'hostile' || NODE === 'reparations' || NODE === 'repaired') {
      return hostileTree(d, WA.reputation.factionOf(NPC));
    }
    return d.talk || null;
  };
  const val = (v, c) => (typeof v === 'function' ? v(c) : v);

  function checkOf(o, c) {
    const raw = o && o.check;
    if (!raw) return null;
    const skill = Array.isArray(raw) ? raw[0] : raw.skill;
    const difficulty = val(Array.isArray(raw) ? raw[1] : raw.difficulty, c);
    if (!WA.skills || !WA.skills.BY[skill]) return null;
    return { skill, difficulty: Math.max(0, Math.min(200, difficulty | 0)) };
  }

  /* What this NPC remembers about you: trust and things you have said. */
  function mem(id) {
    const s = S();
    if (!s) return { trust: 0, flags: {} };
    if (!s.talk) s.talk = {};
    const m = s.talk[id] || (s.talk[id] = { trust: 0, flags: {} });
    if (!m.flags) m.flags = {};
    m.trust = m.trust | 0;
    return m;
  }

  function ctx() {
    const d = def(), m = mem(NPC);
    const barter = WA.skills ? WA.skills.value('barter') : 20;
    // Trust is the bigger discount; Barter adds up to 25% off on its own.
    const trade = Math.min(m.trust >= 1 ? 0.6 : 1, 1 - Math.min(0.25, Math.max(0, (barter - 20) / 200)));
    return {
      quest: d.quest && WA.quests ? WA.quests.status(d.quest) : 'none',
      // Any job's state, by id: one NPC can hand out more than one job.
      q: id => (WA.quests ? WA.quests.status(id) : 'none'),
      trust: m.trust | 0,
      name: S().name || 'Vault Dweller',
      gender: S().gender || 'male',
      age: S().age || 25,
      caps: S().caps | 0,
      bounty: S().bounty | 0,
      // M7 content can require standing, and adjust it with fx.karma / fx.rep.
      karma: WA.reputation ? WA.reputation.value() : 0,
      rep: id => (WA.reputation ? WA.reputation.rep(id) : 0),
      alt: id => (WA.quests && WA.quests.alt ? WA.quests.alt(id) : ''),
      open: WA.sched ? WA.sched.open(NPC) : true,
      hours: WA.sched ? WA.sched.hours(NPC) : '',
      has: f => !!m.flags[f],
      price: base => Math.max(5, Math.round((base * trade) / 5) * 5)
    };
  }

  function rootId() {
    const t = tree();
    return t ? (t.root ? t.root(ctx()) : 'greet') : '';
  }

  function node() {
    const t = tree();
    return (t && t.nodes && t.nodes[NODE]) || null;
  }

  function render() {
    const d = def(), s = S(), el = U.el('dlg');
    if (!d || !el || !s || !tree()) return;
    if (!node()) NODE = rootId();
    const n = node();
    if (!n) return;
    const c = ctx();
    // The confirmation pages outlive the mark, so treat them as hostile pages
    // for the reach, job and shop extras too.
    const hostile = !!(WA.reputation && WA.reputation.hostile(NPC)) ||
      NODE === 'hostile' || NODE === 'reparations' || NODE === 'repaired';
    const shut = WA.sched ? WA.sched.shopClosed(NPC) : false;
    // A closed stall hides its trade options, but quest options stay so a job
    // can still be taken or handed in after hours.
    OPTS = (n.opts || []).filter(o => (!o.if || o.if(c)) && !(shut && o.shop));
    // Anyone carrying something can be reached for, from any conversation page.
    if (d.carry && WA.pick && !hostile) {
      const reach = { t: `Reach for ${d.name}'s pockets.`, fx: { pick: 1 }, close: true };
      const last = OPTS[OPTS.length - 1];
      OPTS = OPTS.slice();
      if (last && last.close) OPTS.splice(OPTS.length - 1, 0, reach);
      else OPTS.push(reach);
    }
    const job = !hostile && d.quest && c.quest === 'active'
      ? `<div class="dim" style="font-size:12px">${U.esc(WA.quests.name(d.quest))}</div>` : '';
    const closed = !hostile && WA.sched ? WA.sched.notice(NPC) : '';
    const closedHtml = closed ? `<div class="dlgcheck">${U.esc(closed)}</div>` : '';
    const checkMsg = CHECK_MSG ? `<div class="dlgcheck">${U.esc(CHECK_MSG)}</div>` : '';
    const buttons = OPTS.length
      ? OPTS.map((o, i) => {
        const chk = checkOf(o, c);
        const req = chk ? ` <span class="checkreq">[${U.esc(WA.skills.BY[chk.skill].name)} ${chk.difficulty}]</span>` : '';
        return `<button data-i="${i}">${U.esc(val(o.t, c))}${req}</button>`;
      }).join('')
      : '<button data-i="x">Leave</button>';
    U.setHtml('dlg',
      `<div class="prow"><span class="hero">${U.esc(d.name)}</span>` +
      `<span class="acts"><small class="dim">${U.esc(d.title || '')}${c.hours ? ' · ' + c.hours : ''}</small>` +
      `<button class="closex" data-close="dlg" aria-label="Close dialogue">×</button></span></div>` +
      `<div class="dlgtext">${U.esc(val(n.text, c) || '')}</div>` + job + closedHtml + checkMsg +
      `<div class="use">${buttons}</div>`);

    // A node's once-only effects land after it has been read, so the first
    // visit still gets the first-visit wording.
    if (n.once && !mem(NPC).flags[n.once]) {
      mem(NPC).flags[n.once] = 1;
      if (n.mark) { s.seenMaps = s.seenMaps || {}; s.seenMaps[n.mark] = 1; }
      if (n.log) WA.game.say(n.log);
    }
  }

  function apply(fx, cost) {
    const s = S(), m = mem(NPC);
    if (fx.once && m.flags[fx.once]) return;
    if (cost) s.caps -= cost;
    if (fx.caps) s.caps += fx.caps;
    if (fx.stims) s.stims = (s.stims | 0) + fx.stims;
    if (fx.kits) s.kits = (s.kits | 0) + fx.kits;
    if (fx.radaways) s.radaways = (s.radaways | 0) + fx.radaways;
    if (fx.trust) m.trust = (m.trust | 0) + fx.trust;
    if (fx.mark) {
      s.seenMaps = s.seenMaps || {};
      s.seenMaps[fx.mark] = 1;
    }
    if (fx.flag) m.flags[fx.flag] = 1;
    if (fx.once) m.flags[fx.once] = 1;
    if (fx.quest) {
      const [op, id] = fx.quest;
      if (op === 'take') WA.quests.take(id);
      else if (op === 'turnin') WA.quests.turnIn(id, fx.quest[2] || null);
    }
    if (fx.xp) WA.char.gainXp(fx.xp);
    if (fx.trade && WA.trade) WA.trade.open(NPC);
    if (fx.pick && WA.pick) WA.pick.open(NPC);
    if (fx.gamble && WA.gambling) WA.gambling.open(NPC);
    if (fx.karma && WA.reputation) WA.reputation.addKarma(fx.karma, fx.karmaWhy);
    if (fx.rep && WA.reputation) WA.reputation.adjust({ rep: fx.rep, why: fx.repWhy });
    if (fx.recruit && WA.party) WA.party.recruit(fx.recruit);
    if (fx.partyCmd && WA.party) WA.party.command(fx.partyCmd[0], fx.partyCmd[1]);
    if (fx.clearBounty && WA.bounty) WA.bounty.clear(s);
    if (fx.log) WA.game.say(fx.log);
  }

  function pick(i) {
    if (i === 'x') { close(); WA.view.draw(); return; }
    const opt = OPTS[i | 0];
    if (!opt) return;
    const s = S(), c = ctx();
    CHECK_MSG = '';
    if (opt.shop && WA.sched && WA.sched.shopClosed(NPC)) {
      WA.game.say(WA.sched.notice(NPC) || 'The shop is closed.');
      render();
      return;
    }
    const cost = (val(opt.cost, c) | 0);
    if (cost && s.caps < cost) {
      WA.game.say(`You need ${cost} caps for that.`);
      render();
      return;
    }

    const chk = checkOf(opt, c);
    if (chk) {
      const result = WA.skills.checkResult(chk.skill, chk.difficulty);
      const branch = result.success ? opt.pass : opt.fail;
      const out = typeof branch === 'string' ? { to: branch } : (branch || {});
      apply(opt.fx || {}, cost);
      if (out.fx) apply(out.fx, 0);
      CHECK_MSG = `${result.name} ${result.difficulty}: ${result.chance}% (rolled ${result.roll}) — ${result.success ? 'success' : 'failure'}.`;
      WA.game.say(CHECK_MSG);
      const next = out.to !== undefined ? out.to : opt.to;
      const closeNow = out.close !== undefined ? out.close : opt.close;
      if (closeNow) { close(); WA.save.queueAutosave(); WA.view.draw(); return; }
      if (next) NODE = next === '@' ? rootId() : next;
      render();
      WA.save.queueAutosave();
      return;
    }

    apply(opt.fx || {}, cost);
    if (opt.close) { close(); WA.save.queueAutosave(); WA.view.draw(); return; }
    NODE = opt.to === '@' ? rootId() : (opt.to || NODE);
    render();
    WA.save.queueAutosave();
  }

  function open(id) {
    const d = WA.GAME.entities[id];
    if (!d || !d.talk) return false;
    if (WA.pip) WA.pip.close();
    NPC = id;
    NODE = '';
    CHECK_MSG = '';
    const el = U.el('dlg');
    if (el) el.hidden = false;
    NODE = rootId();
    render();
    return true;
  }

  function close() {
    const el = U.el('dlg');
    if (el) el.hidden = true;
    NPC = null;
    NODE = '';
    OPTS = [];
    CHECK_MSG = '';
  }

  WA.dlg = { open, close, pick, isOpen, render, mem };
})(window.WA = window.WA || {});
