/* Game content. Everything here is keyed by a unique ID; maps reference IDs, never glyphs. */
(function (WA) {
  'use strict';

  const GAME = {
    player: { hp: 20, dmg: [2, 4], stims: 1, radaways: 1, kits: 1, caps: 0, sight: 8, inv: ['bobby_pin', 'bobby_pin', 'bobby_pin', 'bobby_pin', 'doctor_bag'], ammo: { ammo_10mm: 18, ammo_10mm_ap: 6, ammo_10mm_jhp: 6, ammo_ecell: 10 }, special: { S: 5, P: 5, E: 5, C: 5, I: 5, A: 5, L: 5 } },
    // glyph = the symbol drawn. c = color. solid = blocks movement. opens = tile ID this becomes when walked into.
    tiles: {
      wall: { glyph: '#', name: 'Wall', solid: 1, c: 'dim' },
      floor: { glyph: '.', name: 'Floor', c: 'dim' },
      door: { glyph: '+', name: 'Door', solid: 1, opens: 'door_open', c: 'warn' },
      door_open: { glyph: '/', name: 'Open door', c: 'warn' },
      // hack = word-game difficulty; unlockKey = locks this terminal releases when cracked.
      terminal: { glyph: 'T', name: 'Terminal', solid: 1, c: 'good', light: 5, hack: 2, unlockKey: 'vault_key', msg: 'VAULT 42 EVACUATED. SOUTH DOORS SEALED.' },
      secure_door: { glyph: 'D', name: 'Security door', solid: 1, opens: 'door_open', needs: 'vault_key', msg: 'The security door needs the Vault Keycard.', c: 'warn' },
      rad_puddle: { glyph: '~', name: 'Rad puddle', c: 'good', light: 2, hurt: 1, dt: 'radiation', onHit: 'rad', msg: 'Rad puddle! You take 1 damage.' },
      exit: { glyph: '>', name: 'Exit', c: 'warn', exit: 'This exit is not linked to anything yet.' },
      // A healing tile: restores HP each time you step on it.
      clean_water: { glyph: 'w', name: 'Clean water', c: 'good', heal: 2, msg: 'You drink from the clean water. +2 HP.' },
      // A combined hazard: damage plus lingering rads and poison.
      toxic_waste: { glyph: 'x', name: 'Toxic waste', c: 'bad', hurt: 1, dt: 'poison', rads: 2, onHit: 'poison', msg: 'Toxic waste burns your skin!' },
      wall_metal: { glyph: '▓', name: 'Metal wall', solid: 1, c: 'dim' },
      wall_concrete: { glyph: '▒', name: 'Concrete wall', solid: 1, c: 'dim' },
      wall_wood: { glyph: '≡', name: 'Wooden wall', solid: 1, c: 'warn' },
      wall_brick: { glyph: '▦', name: 'Brick wall', solid: 1, c: 'warn' },
      wall_window: { glyph: '▥', name: 'Armoured window', solid: 1, c: 'good' },
      floor_tile: { glyph: '▫', name: 'Tile floor', c: 'dim' },
      floor_dirt: { glyph: '·', name: 'Dirt floor', c: 'dim' },
      floor_grass: { glyph: '♣', name: 'Grass', c: 'good' },
      floor_metal: { glyph: '▬', name: 'Metal floor', c: 'dim' },
      floor_gravel: { glyph: '∴', name: 'Gravel', c: 'dim' },
      rubble: { glyph: '▨', name: 'Rubble', solid: 1, c: 'dim' },
      water_shallow: { glyph: '≈', name: 'Shallow water', c: 'good', heal: 1, msg: 'You wade through clean water. +1 HP.' },
      acid_pool: { glyph: '◌', name: 'Acid pool', c: 'bad', hurt: 2, dt: 'poison', onHit: 'poison', dur: 2, mag: 2, msg: 'Acid eats through your boots!' },
      fire_vent: { glyph: '♨', name: 'Fire vent', c: 'bad', hurt: 2, dt: 'fire', onHit: 'burn', dur: 2, mag: 2, trap: 1, msg: 'A jet of flame roars out of the floor!' },
      electric_arc: { glyph: '⚡', name: 'Electric arc', c: 'warn', hurt: 3, dt: 'energy', trap: 1, msg: 'An electric arc snaps across the room!' },
      spike_trap: { glyph: '▲', name: 'Spike trap', c: 'bad', hurt: 3, dt: 'melee', trap: 1, msg: 'Hidden spikes punch up through the floor!' },
      landmine: { glyph: '☼', name: 'Landmine', c: 'bad', hurt: 5, dt: 'explosive', trap: 1, msg: 'A landmine detonates under your feet!' },
      healing_pool: { glyph: '✚', name: 'Healing pool', c: 'good', heal: 3, msg: 'The water closes your wounds. +3 HP.' },
      med_bay: { glyph: '℞', name: 'Medical bay', c: 'good', heal: 2, msg: 'You patch yourself up at the medical station. +2 HP.' },
      metal_door: { glyph: ']', name: 'Metal door', solid: 1, opens: 'door_open', c: 'warn' },
      maintenance_door: { glyph: '}', name: 'Maintenance door', solid: 1, opens: 'door_open', needs: 'maintenance_key', msg: 'The maintenance door needs a maintenance key.', c: 'warn' },
      keycard_door: { glyph: ')', name: 'Red keycard door', solid: 1, opens: 'door_open', needs: 'red_keycard', msg: 'The red keycard reader blinks red. You need the card.', c: 'warn' },
      reactor_door: { glyph: '⌸', name: 'Reactor door', solid: 1, opens: 'door_open', needs: 'reactor_key', msg: 'The reactor door is sealed. A reactor key would open it.', c: 'bad' },
      terminal_engineering: { glyph: '⌨', name: 'Engineering terminal', solid: 1, c: 'good', light: 5, hack: 3, unlockKey: 'maintenance_key', msg: 'ENGINEERING ACCESS: MAINTENANCE LOCK RELEASED.' },
      terminal_security: { glyph: '⎔', name: 'Security terminal', solid: 1, c: 'warn', light: 5, hack: 3, unlockKey: 'red_keycard', msg: 'SECURITY GRID: RED KEYCARD PRINTING...' },
      terminal_reactor: { glyph: '☢', name: 'Reactor terminal', solid: 1, c: 'bad', light: 5, hack: 3, unlockKey: 'reactor_key', msg: 'REACTOR CONTROL: MANUAL OVERRIDE AVAILABLE.' },
      elevator: { glyph: 'E', name: 'Elevator', c: 'good', exit: 'The elevator is not linked to another map.' },
      stairs_up: { glyph: '<', name: 'Stairs up', c: 'warn', exit: 'The stairs are not linked to another map.' },
      stairs_down: { glyph: '↓', name: 'Stairs down', c: 'warn', exit: 'The stairs are not linked to another map.' },
      vault_wall: { glyph: '#', name: 'Vault wall', solid: 1, c: '#2f6cff', bg: '#101a2e' },
      rust_wall: { glyph: '#', name: 'Rusted wall', solid: 1, c: '#c1541e', bg: '#2a1a0a' },
      steel_wall: { glyph: '#', name: 'Steel wall', solid: 1, c: '#9aa7a0', bg: '#1c1c1c' },
      sand_floor: { glyph: '░', name: 'Sand', c: '#c9a45c', bg: '#2b2410' },
      dry_grass: { glyph: ',', name: 'Dry grass', c: '#c9a45c', bg: '#2a1a0a' },
      ash_floor: { glyph: '`', name: 'Ash', c: '#9aa7a0', bg: '#1c1c1c' },
      metal_plate: { glyph: '-', name: 'Metal plate', c: '#9aa7a0', bg: '#1c1c1c' },
      vault_floor: { glyph: '·', name: 'Vault floor', c: '#7dff9a', bg: '#14301a' },
      tile_floor: { glyph: '┼', name: 'Tiled floor', c: '#9aa7a0', bg: '#14301a' },
      vault_door: { glyph: '◉', name: 'Vault door', solid: 1, opens: 'door_open', needs: 'vault_key', c: '#ffd400', bg: '#101a2e', msg: 'The Vault door needs the Vault Keycard.' },
      blast_door: { glyph: '▣', name: 'Blast door', solid: 1, opens: 'door_open', needs: 'command_key', c: '#ff5a4a', bg: '#331414', msg: 'The blast door is sealed. The command key would open it.' },
      bridge: { glyph: '═', name: 'Bridge deck', c: '#9aa7a0', bg: '#1c1c1c' },
      bridge_broken: { glyph: '═', name: 'Broken bridge', solid: 1, c: 'warn', bg: '#1c1c1c',
        msg: 'The bridge is out. A repair kit and a steady hand could fix it.',
        repair: 'bridge', repairDiff: 30, repairNeed: 'repair_kit',
        repairMsg: 'You brace the broken span and make it crossable again.' },
      generator_broken: { glyph: '⚙', name: 'Broken generator', solid: 1, c: 'warn',
        msg: 'The generator is dead. Its housing could be repaired with a kit.',
        repair: 'generator_on', repairDiff: 35, repairNeed: 'repair_kit',
        repairMsg: 'The generator coughs, catches, and floods the room with light.' },
      generator_on: { glyph: '⚙', name: 'Generator', solid: 1, c: 'good', light: 4,
        msg: 'The repaired generator hums steadily.' },
      pump_broken: { glyph: '≈', name: 'Seized pump', solid: 1, c: 'warn',
        msg: 'The intake pump is seized. A repair kit and a steady hand could free it.',
        repair: 'pump_on', repairDiff: 30, repairNeed: 'repair_kit',
        repairMsg: 'The pump shudders, catches, and starts pulling water again.' },
      pump_on: { glyph: '≈', name: 'Intake pump', solid: 1, c: 'good', light: 2,
        msg: 'The intake pump pulls clean water out of the sump.' },
      rail: { glyph: '╪', name: 'Railway', c: '#9aa7a0', bg: '#1c1c1c' },
      pit: { glyph: '◌', name: 'Pit', c: 'dim', bg: '#101010', hurt: 2, dt: 'melee', msg: 'You stumble into a pit!' },
      crater: { glyph: '○', name: 'Crater', c: 'dim', bg: '#1a1612', hurt: 1, dt: 'melee', msg: 'Loose rubble slides underfoot.' },
      mutated_tree: { glyph: '♣', name: 'Mutated tree', solid: 1, c: '#7dff9a', bg: '#102014', light: 1, glow: 1 },
      dead_tree: { glyph: '†', name: 'Dead tree', solid: 1, c: '#8a5a2b', bg: '#1a1612' },
      campfire: { glyph: '♨', name: 'Campfire', c: '#ffb000', bg: '#2a1a0a', light: 5, hurt: 1, dt: 'fire', onHit: 'burn', dur: 2, mag: 1, msg: 'The campfire scorches you!' },
      road: { glyph: '=', name: 'Road', c: 'dim', bg: '#1c1c1c' },
      wrecked_car: { glyph: '▬', name: 'Wrecked car', solid: 1, c: '#c1541e', bg: '#1a1612' },
      glowing_fungus: { glyph: '◍', name: 'Glowing fungus', c: '#7dff9a', bg: '#0f2a12', light: 3, heal: 1, fx: 'pulse', msg: 'The fungus glows softly. +1 HP.' },
      barbed_wire: { glyph: '※', name: 'Barbed wire', c: '#9aa7a0', bg: '#1a1612', hurt: 1, dt: 'melee', msg: 'Barbed wire tears at you.' }
    },
    // ai: wander (drifts until it sees you), pursue (hunts you), ranged (keeps its distance and shoots), turret (never moves).
    entities: {
      radroach: { glyph: 'r', name: 'Radroach', hp: 6, dmg: [1, 2], sight: 6, xp: 5, c: 'bad', caps: [0, 3], ai: 'wander', dt: 'melee', res: { radiation: 50 } },
      // Armoured robot: shrugs off bullets and radiation, but energy burns through it.
      protectron: { glyph: 'P', name: 'Protectron', hp: 16, dmg: [2, 5], sight: 7, xp: 25, c: 'bad', caps: [6, 14], ai: 'ranged', range: 5, dt: 'energy', loot: ['ammo_ecell', 'caps'], res: { ballistic: 50, energy: -50, radiation: 90 } },
      rust_sentinel: { glyph: 'S', name: 'Rust Sentinel', hp: 28, dmg: [3, 6], sight: 8, xp: 60, c: 'bad', caps: [20, 35], ai: 'ranged', range: 5, dt: 'energy', loot: ['ammo_ecell', 'caps', 'repair_kit'], res: { ballistic: 40, energy: -25, radiation: 90 }, fx: 'pulse', light: 1 },
      mira: {
        glyph: 'N', name: 'Mira', title: 'Scavenger', hp: 10, dmg: [1, 2], sight: 5, xp: 0, c: 'good', ai: 'idle', talk: true, quest: 'sentinel',
        schedule: { open: 8, close: 18, spot: [3, 3], off: [8, 6], shop: true },
        merchant: { caps: 70, watch: 10, stock: [['stimpak', 3], ['radaway', 2], ['ammo_10mm', 40], ['cram', 2], ['nuka_cola', 1], ['book_guns', 1]] },
        carry: [['bobby_pin', 4], ['stimpak', 1], ['ammo_10mm', 12], ['switchblade', 1]],
        held: ['switchblade'],
        talk: {
          root: c => (c.quest === 'done' ? 'done' : c.quest === 'ready' ? 'ready' : c.quest === 'active' ? 'active' : 'greet'),
          nodes: {
            greet: {
              text: c => (c.rep('market') >= 20 || c.karma >= 20)
                ? 'Mira. You have been good for this market — the traders talk. Same shelf, better manners.'
                : (c.rep('market') <= -20 || c.karma <= -20)
                  ? 'Mira. Word is you take what is not offered. Keep your hands where I can see them.'
                  : "Vault dweller, huh? You've got that just-got-out look. Mira. I pick over what the machines leave behind.",
              opts: [
                { t: 'What needs doing?', to: 'offer' },
                { t: 'You look like you could use a hand.', check: ['speech', 30], pass: { to: 'speech_ok', fx: { trust: 1, once: 'mira_speech' } }, fail: { to: 'speech_no', fx: { once: 'mira_speech' } }, if: c => !c.has('mira_speech') },
                { t: 'Tell me about the ruins.', to: 'machine' },
                { t: 'Got anything to trade?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            speech_ok: {
              text: "Huh. Most vault dwellers start with a demand. You might last out here. The sentinel is the work, and I pay in caps.",
              opts: [
                { t: 'Tell me about the job.', to: 'offer' },
                { t: 'Back', to: '@' }
              ]
            },
            speech_no: {
              text: 'Easy words. Everyone out here has a story. The sentinel is what needs doing, not the talking.',
              opts: [
                { t: 'Tell me about the job.', to: 'offer' },
                { t: 'Back', to: '@' }
              ]
            },
            offer: {
              text: "Something big and rusted is stomping around the ruins east of here. It scares off every trader that comes through. Put it down and I'll make it worth your while.",
              opts: [
                { t: "I'll take care of it.", fx: { quest: ['take', 'sentinel'] }, to: 'active' },
                { t: 'Not now.', to: '@' }
              ]
            },
            machine: {
              once: 'mira_warn',
              log: 'WARNING: the Rust Sentinel shrugs off bullets. Energy is what hurts it.',
              text: c => c.has('mira_warn')
                ? 'Same as before: lead sparks off its plating. Bring something that burns.'
                : 'Pre-war security unit that never got the stand-down call. My slugs sparked off its plating. Something hot is what hurts it.',
              opts: [
                { t: 'Where do I find it?', to: 'map' },
                { t: 'Back', to: '@' }
              ]
            },
            map: {
              once: 'mira_map',
              mark: 'ruins',
              log: 'Mira marks the Wasteland Ruins on your Pip-Boy map.',
              text: c => c.has('mira_map')
                ? "East side of the outskirts, through the gap in the wall. It's already on your Pip-Boy."
                : "East side of the outskirts, through the gap in the wall. I'll put it on your map.",
              opts: [{ t: 'Back', to: '@' }]
            },
            trade: {
              text: c => c.trust >= 1
                ? "For you? The good shelf, and a fair price. Don't make me regret it."
                : 'Stimpaks, RadAway, rounds and something to eat. Everything on the shelf has a price.',
              opts: [
                { t: 'Let me see the stock.', fx: { trade: 1 }, close: true, shop: true },
                { t: 'The road has been rough. Can you do better?', check: ['speech', 45], pass: { to: 'deal', fx: { trust: 1, once: 'mira_deal' } }, fail: { to: 'no_deal', fx: { once: 'mira_deal' } }, shop: true, if: c => !c.has('mira_deal') },
                { t: 'Back', to: '@' }
              ]
            },
            deal: {
              text: "All right, one-time discount. Don't spread it around, or every scavenger in the ruins will want one.",
              opts: [
                { t: 'Show me.', fx: { trade: 1 }, close: true, shop: true },
                { t: 'Back', to: '@' }
              ]
            },
            no_deal: {
              text: "That is the price out here. Caps buy medicine; stories buy drinks.",
              opts: [{ t: 'Back', to: '@' }]
            },
            active: {
              text: 'That sentinel is still humming away out east. I can hear it from here.',
              opts: [
                { t: 'Tell me about it again.', to: 'machine' },
                { t: 'Where is it?', to: 'map' },
                { t: 'Got anything to trade?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            ready: {
              text: 'I heard it go quiet. You actually did it, did you not?',
              opts: [
                { t: 'Hand it over.', fx: { quest: ['turnin', 'sentinel'], trust: 2 }, to: 'thanks' },
                { t: 'Later.', close: true }
              ]
            },
            thanks: {
              text: 'Caps, and a couple of stims. You earned them. Anything else, just ask.',
              opts: [
                { t: 'Got anything to trade?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            done: {
              text: 'Ruins are quiet now. That is all I wanted.',
              opts: [
                { t: 'Got anything to trade?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            }
          }
        }
      },
      keeper: {
        glyph: 'K', name: 'Keeper Ada', title: 'Ruins Keeper', hp: 10, dmg: [1, 2], sight: 5, xp: 0, c: 'good', ai: 'idle', talk: true, quest: 'power',
        schedule: { open: 7, close: 21, spot: [6, 7], off: [9, 6], shop: true },
        merchant: { caps: 55, watch: 20, stock: [['stimpak', 2], ['repair_kit', 1], ['ammo_ecell', 30], ['trail_mix', 2], ['book_science', 1]] },
        carry: [['bobby_pin', 2], ['repair_kit', 1], ['ammo_ecell', 15], ['wrench', 1]],
        held: ['wrench'],
        talk: {
          root: c => (c.quest === 'done' ? 'done' : c.quest === 'ready' ? 'ready' : c.quest === 'active' ? 'active' : 'greet'),
          nodes: {
            greet: {
              text: c => c.rep('market') >= 20
                ? 'The market remembers who fixed its lights, and so do I. The generator is still holding. What do you need?'
                : c.karma <= -20 || c.rep('market') <= -20
                  ? 'I know your name, and not for the right reasons. Say what you came to say and keep it civil.'
                  : 'The market lights have been out for three nights. The old generator finally gave up, and the traders are talking about leaving.',
              opts: [
                { t: 'What needs doing?', to: 'offer' },
                { t: 'Where is the generator?', to: 'where' },
                { t: 'What is for sale?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            offer: {
              text: 'The generator is in the east hall, behind the fallen shelves. I have a spare kit, but my hands are too shaky for the wiring. Get it running and the market will pay.',
              opts: [
                { t: "I'll fix it.", fx: { quest: ['take', 'power'], kits: 1, log: 'Keeper Ada hands you a repair kit.' }, to: 'active' },
                { t: 'Not now.', to: '@' }
              ]
            },
            where: {
              text: 'East hall, past the counters. You will see it against the far wall. A repair kit should be enough to coax it back.',
              opts: [
                { t: 'I can do that.', to: 'offer' },
                { t: 'Back', to: '@' }
              ]
            },
            active: {
              text: 'The generator is still dead. East hall, behind the fallen shelves. The market is counting on you.',
              opts: [
                { t: 'Where was it again?', to: 'where' },
                { t: 'What is for sale?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            ready: {
              text: 'I can hear it humming from here. The lights are back, and the traders are staying.',
              opts: [
                { t: 'Take the reward.', fx: { quest: ['turnin', 'power'], trust: 1 }, to: 'thanks' },
                { t: 'The lights are on. I want a cut of the stall takings.', fx: { quest: ['turnin', 'power', 'cut'] }, to: 'shake' },
                { t: 'Later.', close: true }
              ]
            },
            thanks: {
              text: 'Caps and a spare kit. The market owes you more than that, but it is what we have.',
              opts: [
                { t: 'What is for sale?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            },
            shake: {
              text: 'You want a cut. Fine. Take it, and remember the market paid you twice for one repair.',
              opts: [{ t: 'Leave', close: true }]
            },
            trade: {
              text: c => c.trust >= 1
                ? 'For you, the good shelf. The market remembers who fixed its lights.'
                : 'Stims, cells and a repair kit. Market prices, no haggling.',
              opts: [
                { t: 'Let me see the goods.', fx: { trade: 1 }, close: true, shop: true },
                { t: 'Back', to: '@' }
              ]
            },
            done: {
              text: c => c.alt('power') === 'cut'
                ? 'Lights are on. You took your cut. Do not come back for another.'
                : 'Lights are holding. Trade is coming back. That is all I wanted.',
              opts: [
                { t: 'What is for sale?', to: 'trade', shop: true },
                { t: 'Leave', close: true }
              ]
            }
          }
        }
      },
      vale: {
        glyph: 'V', name: 'Technician Vale', title: 'Vault Technician', hp: 10, dmg: [1, 2], sight: 5, xp: 0, c: 'good', ai: 'idle', talk: true, quest: 'cells',
        watch: 15,
        carry: [['bobby_pin', 3], ['ammo_ecell', 8], ['mentats', 1]],
        schedule: { open: 6, close: 22, spot: [11, 3], off: [8, 1] },
        talk: {
          root: c => (c.quest === 'done' ? 'done' : c.quest === 'ready' ? 'ready' : c.quest === 'active' ? 'active' : 'greet'),
          nodes: {
            greet: {
              text: c => c.rep('vault') >= 20
                ? 'Careful near the terminal — but you have earned a little carelessness around here. What do you need?'
                : c.karma <= -20
                  ? 'Careful near the terminal. I have heard what you do outside this vault, and I do not want it in here.'
                  : 'Careful near the terminal. The wiring is older than both of us.',
              opts: [
                { t: 'What do you need?', to: 'offer' },
                { t: 'Something in your corridor wants a word.', to: 'roach' },
                { t: 'Leave', close: true }
              ]
            },
            offer: {
              text: 'The door seals are running dry. I need fifteen energy cells to top them up. The sentry machines out in the ruins carry them in bundles.',
              opts: [
                { t: "I'll get them.", fx: { quest: ['take', 'cells'] }, to: 'active' },
                { t: 'Fifteen cells is a lot. What is in it for me?', check: ['speech', 35], pass: { to: 'bonus', fx: { kits: 1, once: 'vale_bonus' } }, fail: { to: 'no_bonus', fx: { once: 'vale_bonus' } }, if: c => !c.has('vale_bonus') },
                { t: 'Not now.', to: '@' }
              ]
            },
            bonus: {
              text: 'Fine. One repair kit now, the rest when the cells are in. Do not make me regret it.',
              opts: [
                { t: "I'll get them.", fx: { quest: ['take', 'cells'] }, to: 'active' },
                { t: 'Not now.', to: '@' }
              ]
            },
            no_bonus: {
              text: 'The cells are the payment. Take the job or leave it; the seals will not fix themselves.',
              opts: [
                { t: "I'll get them.", fx: { quest: ['take', 'cells'] }, to: 'active' },
                { t: 'Not now.', to: '@' }
              ]
            },
            roach: {
              text: c => c.has('vale_warn')
                ? 'Door stays shut, like I said. Thanks again for the warning.'
                : "A radroach, in the corridor? If it gets through the seal I'm finished. Take this, and keep it off me.",
              opts: [
                { t: 'Consider it handled.', fx: { once: 'vale_warn', kits: 1, log: 'Vale hands you a repair kit. "For the warning."' }, to: 'roach', if: c => !c.has('vale_warn') },
                { t: 'Back', to: '@' }
              ]
            },
            active: {
              text: 'Still short on cells. The machines out east carry them, and so do the crates.',
              opts: [
                { t: 'About that radroach...', to: 'roach' },
                { t: 'Leave', close: true }
              ]
            },
            ready: {
              text: 'Fifteen cells? Hand them over and I will get the seals running.',
              opts: [
                { t: 'Hand them over.', fx: { quest: ['turnin', 'cells'], trust: 1 }, to: 'thanks' },
                { t: 'The market pays better for cells. I am taking them there.', fx: { quest: ['turnin', 'cells', 'market'] }, to: 'sold' },
                { t: 'Later.', close: true }
              ]
            },
            thanks: {
              text: "That'll do it. Caps, and a pair of repair kits. Straight trade.",
              opts: [{ t: 'Leave', close: true }]
            },
            sold: {
              text: 'Then we are done. The seals stay dry, and I will remember who had the cells last.',
              opts: [{ t: 'Leave', close: true }]
            },
            done: {
              text: c => c.alt('cells') === 'market'
                ? 'The seals are still dry. Do not come back asking for vault work.'
                : 'Doors are holding. Thanks for the cells.',
              opts: [
                { t: 'About that radroach...', to: 'roach' },
                { t: 'Leave', close: true }
              ]
            }
          }
        }
      },
      // The night fence: buys anything, including goods stolen from this shelf,
      // and burns a bounty for its face value. Off duty by day.
      fence: {
        glyph: 'ƒ', name: 'Sable', title: 'Fence', hp: 10, dmg: [1, 2], sight: 5, xp: 0, c: 'warn', ai: 'idle', talk: true,
        schedule: { open: 20, close: 4, spot: [14, 8], off: [14, 7], shop: true },
        merchant: { caps: 120, watch: 15, fence: 1, stock: [['stimpak', 1], ['ammo_10mm', 20], ['bobby_pin', 5], ['radaway', 1], ['book_lockpick', 1]] },
        carry: [['bobby_pin', 2], ['ammo_10mm', 10], ['switchblade', 1]],
        held: ['switchblade'],
        talk: {
          nodes: {
            greet: {
              text: c => c.karma <= -20
                ? 'You carry things that were not yours this morning. I like that. No names, no paper.'
                : c.karma >= 20
                  ? 'You carry a reputation for giving things back. I can work with that, for a price.'
                  : 'You carry things that were not yours this morning. I buy those. No names, no paper.',
              opts: [
                { t: 'What do you buy?', to: 'trade' },
                { t: 'I need a name burned.', to: 'clean', if: c => c.bounty > 0 },
                { t: 'Leave', close: true }
              ]
            },
            trade: {
              text: 'Anything with a price. Stolen is not a word I use.',
              opts: [
                { t: 'Show me the shelf.', fx: { trade: 1 }, close: true, shop: true },
                { t: 'About that paper...', to: 'clean', if: c => c.bounty > 0 },
                { t: 'Back', to: '@' }
              ]
            },
            clean: {
              text: c => `The sheet says ${c.bounty} caps. Pay it and I burn the page; your notoriety goes with it.`,
              opts: [
                { t: c => `Pay ${c.bounty} caps.`, cost: c => c.bounty, fx: { clearBounty: 1 }, to: 'clean_done', if: c => c.bounty > 0 },
                { t: 'Back', to: '@' }
              ]
            },
            clean_done: {
              text: 'Done. The hunters will not get a new sheet. Do not make me write another.',
              opts: [{ t: 'Leave', close: true }]
            }
          }
        }
      },
      // Croup runs a two-dice table in the ruins market: a seven and a boxcars
      // bet. The house edge is the point: a made Gambling check only reaches
      // fair odds, and the check caps below certainty, so neither wager can be
      // farmed for free caps.
      dealer: {
        glyph: '♦', name: 'Croup', title: 'Dice Dealer', hp: 12, dmg: [2, 4], sight: 6, xp: 0, c: 'warn', ai: 'idle', talk: true,
        watch: 18,
        carry: [['stimpak', 1], ['ammo_10mm', 18], ['switchblade', 1]],
        held: ['switchblade'],
        talk: {
          root: c => (c.caps < 5 ? 'broke' : 'greet'),
          nodes: {
            greet: {
              text: "Two dice, one seven, and a table that pays. Five caps gets you a roll; fifty is the ceiling. Boxcars for the brave, ten caps.",
              opts: [
                { t: 'How does the table work?', to: 'rules' },
                { t: 'Deal me in.', fx: { gamble: 1 }, close: true },
                { t: 'Not tonight.', close: true }
              ]
            },
            broke: {
              text: 'The table minimum is five caps. Come back when your pockets are heavier.',
              opts: [
                { t: 'How does the table work?', to: 'rules' },
                { t: 'I will find some caps.', close: true }
              ]
            },
            rules: {
              text: 'Roll two dice. A seven pays four to one; make a Gambling 30 check and it pays five to one. A seven comes up once in six, so the house keeps the difference, and the limit is fifty caps. Boxcars is double sixes: one in thirty-six, paying twenty-six to one, or thirty to one on a Gambling 35 check. Ten caps is the limit on that one, or I would be a poor man.',
              opts: [
                { t: 'Deal me in.', fx: { gamble: 1 }, close: true, if: c => c.caps >= 5 },
                { t: 'Back', to: '@' }
              ]
            }
          }
        }
      },
      // Recruitable companions. The recruiter keeps the conversation; `from` on
      // the ally ties the two together so the recruiter steps out of the market
      // once their companion has joined.
      rook: {
        glyph: 'Ω', name: 'Rook', title: 'Ruins Scavenger', hp: 12, dmg: [2, 4], sight: 5, xp: 0, c: 'good', ai: 'idle', talk: true,
        talk: {
          nodes: {
            greet: {
              text: "Rook. I pull scrap out of this market and I am still hungry. You look like you are heading somewhere worth going.",
              opts: [
                { t: 'Walk with me. I could use the muscle.', fx: { recruit: 'rook_ally' }, close: true },
                { t: 'What can you do?', to: 'useful' },
                { t: 'Not now.', close: true }
              ]
            },
            useful: {
              text: 'I swing a length of rebar better than most. Put me in front and I will keep the dogs off you.',
              opts: [
                { t: 'Then walk with me.', fx: { recruit: 'rook_ally' }, close: true },
                { t: 'Later.', close: true }
              ]
            }
          }
        }
      },
      vera: {
        glyph: 'λ', name: 'Vera', title: 'Road Warden', hp: 12, dmg: [2, 4], sight: 6, xp: 0, c: 'good', ai: 'idle', talk: true,
        talk: {
          nodes: {
            greet: {
              text: c => c.rep('road') >= 20
                ? 'Vera. The wardens speak well of you, and they do not speak well of anyone. Fifteen caps for the day — or call it a favour.'
                : c.karma <= -20
                  ? 'Vera. I watch this road. People like you are why I have to. Fifteen caps, paid up front.'
                  : 'Vera. I watch this road for the traders, and the traders have stopped paying. Fifteen caps for the day and my rifle is yours.',
              opts: [
                { t: 'Fifteen caps. Welcome aboard.', cost: 15, fx: { recruit: 'vera_ally' }, close: true },
                { t: 'Why did they stop paying?', to: 'why' },
                { t: 'I will come back.', close: true }
              ]
            },
            why: {
              text: 'Because the road eats them. I would rather be paid by someone who is still walking. Fifteen caps.',
              opts: [
                { t: 'Fifteen caps. Welcome aboard.', cost: 15, fx: { recruit: 'vera_ally' }, close: true },
                { t: 'Not today.', close: true }
              ]
            }
          }
        }
      },
      // A quest-gated recruit: Ash only offers to join once Rivet is dead and
      // the job has been turned in. She takes any weapon, unlike Rook and Vera.
      ash: {
        glyph: 'ʘ', name: 'Ash', title: 'Caravan Guard', hp: 12, dmg: [2, 4], sight: 6, xp: 0, c: 'good', ai: 'idle', talk: true, quest: 'rivet',
        watch: 20,
        carry: [['stimpak', 1], ['ammo_10mm', 12], ['machete', 1]],
        held: ['machete'],
        talk: {
          root: c => (c.quest === 'done' ? 'done' : c.quest === 'ready' ? 'ready' : c.quest === 'active' ? 'active' : 'greet'),
          nodes: {
            greet: {
              text: c => c.rep('road') >= 20
                ? 'Ash. The road already knows your name, and it says you keep your word. Sit down; I owe you a story.'
                : c.karma <= -20
                  ? 'Ash. I guard caravans. Word says you are the reason some of them need guarding.'
                  : 'Ash. I was guarding a caravan until Rivet and his crew took it and left me in the ditch. Now I guard nothing.',
              opts: [
                { t: 'Who is Rivet?', to: 'offer' },
                { t: 'You look like you need a hand.', to: 'offer' },
                { t: 'Not my problem.', close: true }
              ]
            },
            offer: {
              text: "Raider with a scattergun and a good coat. He camps in the south-east corner of the ruins, counting other people's caps. Put him down and I will guard you instead.",
              opts: [
                { t: "I'll deal with Rivet.", fx: { quest: ['take', 'rivet'] }, to: 'active' },
                { t: 'What can you do?', to: 'useful' },
                { t: 'Not now.', to: '@' }
              ]
            },
            useful: {
              text: 'Machete work, mostly. I can use a gun if there is one going spare, and I do not freeze when it gets close.',
              opts: [
                { t: "Then I'll deal with Rivet.", fx: { quest: ['take', 'rivet'] }, to: 'active' },
                { t: 'Back', to: '@' }
              ]
            },
            active: {
              text: 'South-east corner of the ruins, past the old wall. He will see you before you see him, so do not give him the first shot.',
              opts: [
                { t: 'I will find him.', close: true },
                { t: 'What can you do?', to: 'useful' }
              ]
            },
            ready: {
              text: 'Word travels fast out here. Rivet is dead and the road feels lighter already. Take what the caravan would have paid me.',
              opts: [
                { t: 'Turn in the job.', fx: { quest: ['turnin', 'rivet'], trust: 1 }, to: 'reward' },
                { t: 'The caravan owes more than stims. Pay me the difference.', fx: { quest: ['turnin', 'rivet', 'greed'] }, to: 'greed' },
                { t: 'Later.', close: true }
              ]
            },
            greed: {
              text: 'That is how you want it? Fine. Take the caps. The road will hear how you collect.',
              opts: [{ t: 'Leave', close: true }]
            },
            reward: {
              text: c => WA.party.members.length >= WA.party.MAX
                ? 'Stims and the thanks of a dead caravan. You already have two at your back; come back when there is room for another blade.'
                : 'Stims and the thanks of a dead caravan. I meant what I said: I will guard you, if you will have me.',
              opts: [
                { t: 'Walk with me.', fx: { recruit: 'ash_ally' }, close: true, if: c => WA.party.members.length < WA.party.MAX },
                { t: 'Leave', close: true }
              ]
            },
            done: {
              text: c => c.alt('rivet') === 'greed'
                ? 'You got your caps. We are done.'
                : WA.party.members.length >= WA.party.MAX
                  ? 'Rivet is dead. That is enough. You have two at your back already; come find me when one of them is gone.'
                  : 'Rivet is dead. A deal is a deal: my machete is yours.',
              opts: [
                { t: 'Walk with me.', fx: { recruit: 'ash_ally' }, close: true, if: c => c.alt('rivet') !== 'greed' && WA.party.members.length < WA.party.MAX },
                { t: 'Leave', close: true }
              ]
            }
          }
        }
      },
      // The boss behind Blood on the Road. A named raider rather than a new mob
      // type, so the quest marker can follow a living entity on the map.
      raider_rivet: {
        glyph: 'Ʀ', name: 'Rivet', hp: 26, dmg: [4, 8], sight: 8, xp: 55, c: 'bad', caps: [18, 35],
        ai: 'ranged', range: 5, dt: 'ballistic', res: { ballistic: 25 },
        drop: 'ammo_shell', loot: ['ammo_shell', 'stimpak', 'caps', 'double_barrel']
      },
      // Ally bodies. These are never saved as map entities; the party roster
      // respawns them beside the player so a cached map cannot duplicate them.
      rook_ally: {
        glyph: 'Ω', name: 'Rook', title: 'Brawler', hp: 34, dmg: [4, 7], sight: 6, xp: 0, c: 'good',
        ai: 'melee', ally: true, from: 'rook', dt: 'melee', ac: 18,
        gear: { weapon: 'melee' }, startWeapon: 'rebar_club',
        startStims: 1, startMeds: ['cram', 'buffout'],
        desc: 'Rebar and bad temper. Holds a doorway.'
      },
      vera_ally: {
        glyph: 'λ', name: 'Vera', title: 'Marksman', hp: 20, dmg: [3, 6], sight: 8, xp: 0, c: 'good',
        ai: 'ranged', range: 5, ally: true, from: 'vera', dt: 'ballistic', ac: 16,
        gear: { weapon: 'ranged' }, startWeapon: 'worn_rifle',
        startStims: 2, startMeds: ['trail_mix', 'jet'],
        desc: 'Rifle at range. Fragile up close.'
      },
      ash_ally: {
        glyph: 'ʘ', name: 'Ash', title: 'Caravan Guard', hp: 26, dmg: [3, 5], sight: 7, xp: 0, c: 'good',
        ai: 'melee', ally: true, from: 'ash', dt: 'melee', ac: 17,
        gear: { weapon: 'any' }, startWeapon: 'machete',
        startStims: 2, startMeds: ['cram', 'psycho'],
        desc: 'Blade and nerve. Fights with whatever you hand her.'
      },
      // A contract hunter sent by the bounty in S.bounty; stats are scaled on spawn.
      bounty_hunter: { glyph: 'H', name: 'Bounty Hunter', hp: 20, dmg: [3, 6], sight: 8, xp: 30, c: 'bad', caps: [10, 25], ai: 'ranged', range: 5, dt: 'ballistic', res: { ballistic: 10 }, loot: ['ammo_10mm'], drop: 'ammo_10mm' },
      feral_ghoul: { glyph: 'g', name: 'Feral Ghoul', hp: 12, dmg: [2, 4], sight: 8, xp: 15, c: 'bad', caps: [3, 9], ai: 'pursue', dt: 'melee', onHit: 'rad', res: { radiation: 90, ballistic: 25 } },
      // drop = item left behind where it falls.
      raider: { glyph: 'R', name: 'Raider', hp: 14, dmg: [2, 5], sight: 7, xp: 20, c: 'bad', caps: [4, 12], ai: 'pursue', dt: 'melee', drop: 'ammo_10mm', loot: ['caps', 'ammo_10mm', 'smg'], res: { ballistic: 10 } },
      rad_scorpion: { glyph: 's', name: 'Radscorpion', hp: 12, dmg: [2, 4], sight: 6, xp: 12, c: 'bad', caps: [0, 4], ai: 'pursue', dt: 'poison', onHit: 'poison', res: { ballistic: 20, radiation: 60 }, loot: ['caps', 'bobby_pin'] },
      giant_ant: { glyph: 'a', name: 'Giant ant', hp: 7, dmg: [1, 3], sight: 5, xp: 6, c: 'bad', caps: [0, 2], ai: 'wander', dt: 'melee', res: { radiation: 40 }, loot: ['caps', 'cram'] },
      mole_rat: { glyph: 'm', name: 'Mole rat', hp: 5, dmg: [1, 2], sight: 4, xp: 4, c: 'bad', caps: [0, 1], ai: 'wander', dt: 'melee', res: { radiation: 20 }, loot: ['caps', 'scrap_metal'] },
      feral_dog: { glyph: 'd', name: 'Feral dog', hp: 9, dmg: [2, 3], sight: 7, xp: 8, c: 'bad', caps: [0, 2], ai: 'pursue', dt: 'melee', loot: ['caps', 'irradiated_meat'] },
      mutant_hound: { glyph: 'h', name: 'Mutant hound', hp: 16, dmg: [3, 5], sight: 8, xp: 18, c: 'bad', caps: [1, 5], ai: 'pursue', dt: 'melee', onHit: 'bleed', res: { ballistic: 10 }, loot: ['caps', 'leather_armor'] },
      super_mutant: { glyph: 'M', name: 'Super mutant', hp: 30, dmg: [4, 8], sight: 8, xp: 40, c: 'bad', caps: [5, 15], ai: 'pursue', dt: 'melee', knockback: 1, res: { ballistic: 20, radiation: 50 }, drop: 'ammo_556', loot: ['ammo_556', 'caps', 'mutfruit'] },
      nightkin: { glyph: 'K', name: 'Nightkin', hp: 24, dmg: [4, 7], sight: 9, xp: 35, c: 'bad', caps: [4, 12], ai: 'pursue', dt: 'melee', res: { energy: 10 }, drop: 'psycho', loot: ['caps', 'psycho'] },
      ghoul_reaver: { glyph: 'G', name: 'Ghoul reaver', hp: 20, dmg: [3, 6], sight: 8, xp: 25, c: 'bad', caps: [2, 8], ai: 'pursue', dt: 'melee', onHit: 'rad', res: { radiation: 90, ballistic: 15 }, loot: ['caps', 'radaway'] },
      raider_gunner: { glyph: 'q', name: 'Raider gunner', hp: 15, dmg: [3, 6], sight: 7, xp: 22, c: 'bad', caps: [5, 12], ai: 'ranged', range: 5, dt: 'ballistic', res: { ballistic: 10 }, drop: 'ammo_556', loot: ['ammo_556', 'caps'] },
      raider_brute: { glyph: 'B', name: 'Raider brute', hp: 22, dmg: [4, 7], sight: 6, xp: 28, c: 'bad', caps: [3, 10], ai: 'pursue', dt: 'melee', drop: 'baseball_bat', loot: ['caps', 'baseball_bat'] },
      raider_sniper: { glyph: 'Z', name: 'Raider sniper', hp: 12, dmg: [5, 8], sight: 9, xp: 28, c: 'bad', caps: [6, 15], ai: 'ranged', range: 8, dt: 'ballistic', res: { ballistic: 5 }, drop: 'ammo_556', loot: ['ammo_556', 'caps'] },
      sentry_bot: { glyph: 'Y', name: 'Sentry bot', hp: 40, dmg: [5, 9], sight: 9, xp: 55, c: 'bad', caps: [15, 30], ai: 'ranged', range: 6, dt: 'energy', res: { ballistic: 40, energy: -25, radiation: 90 }, light: 1, fx: 'pulse', loot: ['ammo_microfusion', 'caps', 'scrap_metal'] },
      mr_handy: { glyph: 'H', name: 'Mister Handy', hp: 22, dmg: [3, 6], sight: 7, xp: 30, c: 'bad', caps: [4, 10], ai: 'ranged', range: 5, dt: 'energy', res: { energy: -25, radiation: 90 }, light: 1, fx: 'blink', loot: ['ammo_fuel', 'caps', 'electronics'] },
      eyebot: { glyph: 'e', name: 'Eyebot', hp: 8, dmg: [1, 3], sight: 8, xp: 10, c: 'bad', caps: [0, 3], ai: 'ranged', range: 4, dt: 'energy', res: { energy: 10, radiation: 90 }, light: 1, fx: 'blink', loot: ['ammo_ecell', 'scrap_metal'] },
      turret: { glyph: 't', name: 'Security turret', hp: 18, dmg: [3, 6], sight: 7, xp: 20, c: 'bad', caps: [0, 0], ai: 'turret', range: 6, dt: 'ballistic', res: { ballistic: 30, energy: -20, radiation: 90 }, light: 1, loot: ['ammo_556', 'scrap_metal'] },
      robobrain: { glyph: 'O', name: 'Robobrain', hp: 30, dmg: [4, 7], sight: 8, xp: 45, c: 'bad', caps: [8, 18], ai: 'ranged', range: 6, dt: 'energy', res: { energy: -20, radiation: 90 }, light: 1, fx: 'pulse', loot: ['ammo_ecell', 'electronics', 'caps'] },
      deathclaw: { glyph: 'D', name: 'Deathclaw', hp: 45, dmg: [7, 12], sight: 9, xp: 70, c: 'bad', caps: [10, 25], ai: 'pursue', dt: 'melee', knockback: 1, res: { ballistic: 30, radiation: 30 }, drop: 'grenade', loot: ['caps', 'irradiated_meat'] },
      yao_guai: { glyph: 'U', name: 'Yao guai', hp: 28, dmg: [4, 8], sight: 7, xp: 38, c: 'bad', caps: [2, 8], ai: 'pursue', dt: 'melee', knockback: 1, res: { ballistic: 15 }, loot: ['irradiated_meat', 'caps'] },
      // Heavy but planted: its claws pin and sting instead of throwing you, so it
      // never carries the knockback flag and heavy hits use the 15% branch.
      radscorpion_matriarch: { glyph: 'ς', name: 'Radscorpion matriarch', hp: 30, dmg: [8, 10], sight: 6, xp: 55, c: 'bad', caps: [6, 14], ai: 'pursue', dt: 'poison', onHit: 'poison', res: { ballistic: 25, radiation: 60 }, loot: ['caps', 'irradiated_meat'] },
      radstag: { glyph: 'W', name: 'Radstag', hp: 12, dmg: [1, 3], sight: 6, xp: 8, c: 'good', caps: [0, 1], ai: 'wander', dt: 'melee', res: { radiation: 40 }, loot: ['irradiated_meat'] },
      alien: { glyph: 'A', name: 'Alien', hp: 20, dmg: [4, 7], sight: 8, xp: 30, c: 'bad', caps: [4, 10], ai: 'ranged', range: 6, dt: 'energy', res: { energy: 50, radiation: 90 }, light: 1, fx: 'blink', loot: ['ammo_ecell', 'electronics'] },
      bloatfly: { glyph: 'b', name: 'Bloatfly', hp: 6, dmg: [1, 2], sight: 5, xp: 6, c: 'bad', caps: [0, 2], ai: 'wander', dt: 'poison', onHit: 'poison', res: { radiation: 40 }, loot: ['irradiated_meat'] },
      stingwing: { glyph: 'w', name: 'Stingwing', hp: 8, dmg: [2, 3], sight: 6, xp: 9, c: 'bad', caps: [0, 2], ai: 'pursue', dt: 'poison', onHit: 'poison', res: { radiation: 30 }, loot: ['irradiated_meat'] },
      bloodbug: { glyph: 'v', name: 'Bloodbug', hp: 7, dmg: [1, 3], sight: 5, xp: 7, c: 'bad', caps: [0, 2], ai: 'wander', dt: 'melee', onHit: 'bleed', res: { radiation: 30 }, loot: ['irradiated_meat'] },
      cazador: { glyph: 'z', name: 'Cazador', hp: 12, dmg: [3, 5], sight: 8, xp: 16, c: 'bad', caps: [1, 4], ai: 'pursue', dt: 'poison', onHit: 'poison', res: { ballistic: 10 }, loot: ['irradiated_meat'] },
      radtoad: { glyph: 't', name: 'Radtoad', hp: 10, dmg: [2, 4], sight: 6, xp: 10, c: 'bad', caps: [0, 3], ai: 'wander', dt: 'poison', onHit: 'poison', res: { radiation: 50 }, loot: ['irradiated_meat'] },
      mirelurk: { glyph: 'l', name: 'Mirelurk', hp: 18, dmg: [3, 5], sight: 6, xp: 20, c: 'bad', caps: [1, 5], ai: 'pursue', dt: 'melee', res: { ballistic: 15 }, loot: ['caps', 'irradiated_meat'] },
      mirelurk_hunter: { glyph: 'M', name: 'Mirelurk hunter', hp: 26, dmg: [4, 7], sight: 7, xp: 32, c: 'bad', caps: [3, 9], ai: 'pursue', dt: 'melee', res: { ballistic: 25 }, loot: ['caps', 'irradiated_meat'] },
      mirelurk_queen: { glyph: 'Q', name: 'Mirelurk queen', hp: 40, dmg: [5, 9], sight: 7, xp: 55, c: 'bad', caps: [8, 18], ai: 'pursue', dt: 'melee', knockback: 1, res: { ballistic: 30, radiation: 40 }, loot: ['caps', 'irradiated_meat'] },
      assaultron: { glyph: 'A', name: 'Assaultron', hp: 24, dmg: [4, 7], sight: 8, xp: 35, c: 'bad', caps: [6, 14], ai: 'ranged', range: 6, dt: 'energy', res: { ballistic: 20, energy: -20 }, light: 1, fx: 'blink', loot: ['ammo_ecell', 'circuit_board', 'caps'] },
      securitron: { glyph: 'Σ', name: 'Securitron', hp: 30, dmg: [4, 7], sight: 8, xp: 45, c: 'bad', caps: [10, 20], ai: 'ranged', range: 6, dt: 'energy', res: { ballistic: 35, energy: -15 }, light: 1, fx: 'pulse', loot: ['ammo_microfusion', 'circuit_board', 'caps'] },
      synth: { glyph: '⌬', name: 'Synth', hp: 18, dmg: [3, 5], sight: 8, xp: 28, c: 'bad', caps: [3, 8], ai: 'ranged', range: 5, dt: 'energy', res: { energy: 15, ballistic: 10 }, light: 1, fx: 'blink', loot: ['ammo_ecell', 'circuit_board'] },
      mister_gutsy: { glyph: 'Ħ', name: 'Mister Gutsy', hp: 20, dmg: [3, 6], sight: 7, xp: 30, c: 'bad', caps: [4, 10], ai: 'ranged', range: 5, dt: 'energy', res: { energy: -20, radiation: 90 }, light: 1, fx: 'blink', loot: ['ammo_fuel', 'circuit_board'] },
      glowing_one: { glyph: 'G', name: 'Glowing One', hp: 26, dmg: [3, 6], sight: 8, xp: 32, c: 'good', caps: [2, 8], ai: 'pursue', dt: 'melee', onHit: 'rad', res: { radiation: 90, ballistic: 10 }, light: 2, glow: 1, fx: 'pulse', loot: ['caps', 'radaway'] },
      centaur: { glyph: 'C', name: 'Centaur', hp: 18, dmg: [2, 5], sight: 7, xp: 24, c: 'bad', caps: [1, 5], ai: 'ranged', range: 4, dt: 'poison', onHit: 'poison', res: { radiation: 50 }, loot: ['caps', 'irradiated_meat'] },
      behemoth: { glyph: 'Ω', name: 'Behemoth', hp: 55, dmg: [8, 14], sight: 8, xp: 90, c: 'bad', caps: [20, 40], ai: 'pursue', dt: 'melee', knockback: 1, res: { ballistic: 30, radiation: 50 }, loot: ['caps', 'mutfruit'] }
    },
    items: {
      caps: { glyph: '$', name: 'Caps', type: 'caps', amt: [3, 12], wt: 0, c: 'warn' },
      stimpak: { glyph: '!', name: 'Stimpak', type: 'stim', wt: 0.5, c: 'warn' },
      doctor_bag: { val: 35, glyph: '✚', name: "Doctor's Bag", type: 'junk', limb: 1, wt: 2, c: 'good' },
      // Reading a skill book is permanent: it adds directly to the saved skill
      // points and consumes the copy. The implant is the one-shot SPECIAL reward.
      book_guns: { val: 60, glyph: '¶', name: 'Guns and Bullets', type: 'book', skill: 'small_guns', gain: 5, wt: 1, c: 'good' },
      book_science: { val: 70, glyph: '§', name: 'Big Book of Science', type: 'book', skill: 'science', gain: 5, wt: 1, c: 'good' },
      book_repair: { val: 65, glyph: '†', name: "Dean's Electronics", type: 'book', skill: 'repair', gain: 5, wt: 1, c: 'good' },
      book_lockpick: { val: 55, glyph: '‡', name: 'Tumblers Today', type: 'book', skill: 'lockpick', gain: 5, wt: 1, c: 'good' },
      book_outdoors: { val: 75, glyph: 'Δ', name: 'Wasteland Survival Guide', type: 'book', skill: 'outdoorsman', gain: 5, wt: 1, c: 'good' },
      book_firstaid: { val: 50, glyph: '✜', name: 'First Aid Manual', type: 'book', skill: 'first_aid', gain: 5, wt: 1, c: 'good' },
      endurance_module: { val: 200, glyph: 'ε', name: 'Endurance Module', type: 'junk', special: 'E', wt: 0.5, c: 'good' },
      radaway: { glyph: '%', name: 'RadAway', type: 'radaway', wt: 1, c: 'warn' },
      repair_kit: { glyph: '&', name: 'Repair Kit', type: 'repair', fix: 40, wt: 2, c: 'warn' },
      // Ammo items are counted in the player's ammo pouch, not carried as gear.
      ammo_10mm: { glyph: '=', name: '10mm Rounds', type: 'ammo', caliber: '10mm', variant: 'Standard', amt: [8, 16], wt: 0.1, c: 'warn' },
      ammo_10mm_ap: { glyph: '=', name: '10mm AP Rounds', type: 'ammo', caliber: '10mm', variant: 'AP', dmgMul: 0.8, pen: 30, amt: [6, 12], wt: 0.1, c: 'good' },
      ammo_10mm_jhp: { glyph: '=', name: '10mm JHP Rounds', type: 'ammo', caliber: '10mm', variant: 'JHP', dmgMul: 1.3, resMod: 15, amt: [6, 12], wt: 0.1, c: 'warn' },
      ammo_ecell: { glyph: '^', name: 'Energy Cells', type: 'ammo', amt: [6, 12], wt: 0.1, c: 'good' },
      baseball_bat: { glyph: 'b', name: 'Baseball Bat', type: 'weapon', dmg: [3, 6], range: 1, hands: 2, wt: 6, dt: 'melee', skill: 'melee_weapons', c: 'warn' },
      pistol_10mm: { glyph: 'p', name: '10mm Pistol', type: 'weapon', dmg: [2, 5], range: 6, hands: 1, wt: 3, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_10mm', caliber: '10mm', c: 'warn' },
      laser_pistol: { glyph: 'l', name: 'Laser Pistol', type: 'weapon', dmg: [4, 7], range: 7, hands: 1, wt: 3, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_ecell', c: 'good' },
      leather_armor: { glyph: 'a', name: 'Leather Armor', type: 'armor', def: 2, ac: 5, wt: 10, res: { ballistic: 10, fire: -10 }, c: 'warn' },
      combat_armor: { glyph: 'A', name: 'Combat Armor', type: 'armor', def: 4, ac: 10, wt: 20, res: { ballistic: 30, energy: 15, fire: -25 }, c: 'good' },
      // Food and chems carry effects instead of stats and are used from the pack.
      nuka_cola: { glyph: 'o', name: 'Nuka-Cola', type: 'food', heal: 6, ap: 2, wt: 1, c: 'warn' },
      cram: { glyph: 'f', name: 'Cram', type: 'food', heal: 10, wt: 1, c: 'warn' },
      irradiated_meat: { glyph: 'm', name: 'Irradiated Meat', type: 'food', heal: 4, wt: 1, onHit: 'rad', c: 'warn' },
      // A key item: carried, never used up by combat, checked by locked tiles.
      vault_key: { glyph: 'k', name: 'Vault Keycard', type: 'key', wt: 0, c: 'good' },
      // Lockpicking: spent one at a time when a probe is forced too far.
      bobby_pin: { glyph: 'n', name: 'Bobby Pin', type: 'junk', wt: 0.1, val: 2, c: 'warn' },
      // Throwables: used with Throw, land on the nearest visible target and hit a radius.
      grenade: { glyph: '*', name: 'Frag Grenade', type: 'explosive', dmg: [5, 9], blast: 2, range: 6, wt: 1, dt: 'explosive', c: 'warn' },
      molotov: { glyph: 'i', name: 'Molotov', type: 'explosive', dmg: [3, 6], blast: 2, range: 5, wt: 1, dt: 'fire', onHit: 'burn', dur: 3, mag: 2, c: 'warn' },
      // Containers hold items until searched; loot lives on the save, not here.
      crate: { glyph: 'c', name: 'Crate', type: 'container', wt: 0, loot: ['ammo_10mm', 'caps', 'cram', 'bobby_pin'], c: 'warn' },
      // lock = pick difficulty 1-3; needs = a key item that skips the pick.
      footlocker: { glyph: 'F', name: 'Footlocker', type: 'container', wt: 0, lock: 2, loot: ['stimpak', 'doctor_bag', 'ammo_ecell', 'ammo_10mm_ap', 'radaway', 'bobby_pin', 'book_outdoors'], c: 'warn' },
      strongbox: { glyph: 'G', name: 'Strongbox', type: 'container', wt: 0, lock: 3, loot: ['caps', 'ammo_10mm', 'bobby_pin'], c: 'warn' },
      safe: { glyph: 'H', name: 'Vault Safe', type: 'container', wt: 0, lock: 2, needs: 'vault_key', loot: ['caps', 'stimpak', 'grenade', 'endurance_module'], c: 'warn' },
      // Owned containers: taking anything is a Steal check against their owner.
      mira_cache: { glyph: 'C', name: "Mira's Cache", type: 'container', owner: 'mira', wt: 0, loot: ['stimpak', 'ammo_10mm', 'bobby_pin', 'cram'], c: 'warn' },
      market_lockbox: { glyph: 'L', name: 'Market Lockbox', type: 'container', owner: 'keeper', wt: 0, lock: 1, loot: ['repair_kit', 'trail_mix', 'ammo_ecell', 'book_repair'], c: 'warn' },
      // Engine-made remains. Hidden from the editors: enemies with loot leave one.
      corpse: { glyph: 'X', name: 'Corpse', type: 'container', wt: 0, hidden: 1, c: 'dim' },
      // Chems carry a buff and an addiction chance. Withdrawal is per buff type.
      buffout: { glyph: 'B', name: 'Buffout', type: 'chem', onHit: 'strength', mag: 3, dur: 8, addict: 40, wt: 0.1, c: 'good' },
      jet: { glyph: 'j', name: 'Jet', type: 'chem', onHit: 'apregen', mag: 2, dur: 6, addict: 40, wt: 0.1, c: 'good' },
      medx: { glyph: 'M', name: 'Med-X', type: 'chem', onHit: 'resist', mag: 4, dur: 8, addict: 20, wt: 0.1, c: 'good' },
      pipe_pistol: { glyph: 'P', name: 'Pipe Pistol', type: 'weapon', dmg: [2, 4], range: 5, hands: 1, wt: 2, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_10mm', caliber: '10mm', c: 'warn' },
      pipe_rifle: { glyph: 'R', name: 'Pipe Rifle', type: 'weapon', dmg: [3, 6], range: 8, hands: 2, wt: 5, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: 'warn' },
      hunting_rifle: { glyph: 'H', name: 'Hunting Rifle', type: 'weapon', dmg: [5, 8], range: 10, hands: 2, wt: 8, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: 'good' },
      assault_rifle: { glyph: 'A', name: 'Assault Rifle', type: 'weapon', dmg: [4, 7], range: 9, hands: 2, wt: 7, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: 'good' },
      smg: { glyph: 'S', name: 'SMG', type: 'weapon', dmg: [3, 6], range: 6, hands: 1, wt: 5, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_10mm', caliber: '10mm', burst: 4, spread: 10, c: 'warn' },
      shotgun: { glyph: 'G', name: 'Shotgun', type: 'weapon', dmg: [5, 9], range: 4, hands: 2, wt: 6, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_shell', c: 'warn' },
      combat_shotgun: { glyph: 'C', name: 'Combat Shotgun', type: 'weapon', dmg: [7, 11], range: 5, hands: 2, wt: 8, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_shell', c: 'good' },
      sniper_rifle: { glyph: 'Z', name: 'Sniper Rifle', type: 'weapon', dmg: [7, 12], range: 12, hands: 2, wt: 9, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: 'good' },
      plasma_pistol: { glyph: 'Q', name: 'Plasma Pistol', type: 'weapon', dmg: [5, 8], range: 6, hands: 1, wt: 4, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_ecell', c: 'good' },
      plasma_rifle: { glyph: 'V', name: 'Plasma Rifle', type: 'weapon', dmg: [7, 11], range: 8, hands: 2, wt: 8, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_microfusion', c: 'good' },
      gauss_rifle: { glyph: 'U', name: 'Gauss Rifle', type: 'weapon', dmg: [8, 13], range: 12, hands: 2, wt: 10, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_microfusion', c: 'good' },
      rocket_launcher: { glyph: 'L', name: 'Rocket Launcher', type: 'weapon', dmg: [8, 14], range: 8, hands: 2, wt: 14, dt: 'explosive', skill: 'big_guns', ammo: 'ammo_rocket', knockback: 1, c: 'warn' },
      flamer: { glyph: 'F', name: 'Flamer', type: 'weapon', dmg: [4, 7], range: 3, hands: 2, wt: 12, dt: 'fire', skill: 'big_guns', ammo: 'ammo_fuel', onHit: 'burn', c: 'warn' },
      sledgehammer: { glyph: 'T', name: 'Sledgehammer', type: 'weapon', dmg: [6, 10], range: 1, hands: 2, wt: 10, dt: 'melee', skill: 'melee_weapons', knockback: 1, c: 'warn' },
      ripper: { glyph: 'r', name: 'Ripper', type: 'weapon', dmg: [5, 8], range: 1, hands: 1, wt: 5, dt: 'melee', skill: 'melee_weapons', c: 'good' },
      power_fist: { glyph: 'f', name: 'Power Fist', type: 'weapon', dmg: [5, 8], range: 1, hands: 1, wt: 4, dt: 'melee', skill: 'unarmed', knockback: 1, c: 'good' },
      switchblade: { glyph: 's', name: 'Switchblade', type: 'weapon', dmg: [2, 4], range: 1, hands: 1, wt: 1, dt: 'melee', skill: 'melee_weapons', c: 'warn' },
      spear: { glyph: 'i', name: 'Spear', type: 'weapon', dmg: [3, 5], range: 1, hands: 2, wt: 3, dt: 'melee', skill: 'melee_weapons', c: 'warn' },
      vault_suit: { glyph: 'v', name: 'Vault Suit', type: 'armor', def: 1, ac: 4, wt: 4, res: { radiation: 10 }, c: 'dim' },
      raider_armor: { glyph: 'y', name: 'Raider Armor', type: 'armor', def: 3, ac: 7, wt: 12, res: { ballistic: 15, fire: -10 }, c: 'warn' },
      metal_armor: { glyph: 'W', name: 'Metal Armor', type: 'armor', def: 5, ac: 8, wt: 18, res: { ballistic: 25, energy: -15 }, c: 'good' },
      power_armor: { glyph: 'Y', name: 'Power Armor', type: 'armor', def: 8, ac: 15, wt: 30, res: { ballistic: 40, energy: 30, radiation: 60 }, c: 'good' },
      ammo_556: { glyph: "'", name: '5.56mm Rounds', type: 'ammo', amt: [8, 20], wt: 0.1, c: 'warn' },
      ammo_shell: { glyph: ',', name: 'Shotgun Shells', type: 'ammo', amt: [4, 10], wt: 0.1, c: 'warn' },
      ammo_44: { glyph: '.', name: '.44 Rounds', type: 'ammo', amt: [6, 12], wt: 0.1, c: 'warn' },
      ammo_rocket: { glyph: '»', name: 'Rockets', type: 'ammo', amt: [1, 3], wt: 1, c: 'warn' },
      ammo_fuel: { glyph: '~', name: 'Flamer Fuel', type: 'ammo', amt: [8, 20], wt: 0.2, c: 'warn' },
      ammo_microfusion: { glyph: '¤', name: 'Microfusion Cells', type: 'ammo', amt: [4, 10], wt: 0.1, c: 'good' },
      trail_mix: { glyph: 't', name: 'Trail Mix', type: 'food', heal: 5, wt: 0.5, c: 'warn' },
      mutfruit: { glyph: 'u', name: 'Mutfruit', type: 'food', heal: 3, wt: 0.5, c: 'good' },
      purified_water: { glyph: 'q', name: 'Purified Water', type: 'food', heal: 4, rads: 3, wt: 1, c: 'good' },
      nuka_quantum: { glyph: 'Q', name: 'Nuka-Cola Quantum', type: 'food', heal: 10, ap: 5, wt: 1, c: 'good' },
      super_stimpak: { glyph: '+', name: 'Super Stimpak', type: 'food', heal: 20, wt: 1, c: 'good' },
      rad_x: { glyph: 'χ', name: 'Rad-X', type: 'food', rads: 20, wt: 0.5, c: 'good' },
      psycho: { glyph: 'ψ', name: 'Psycho', type: 'chem', onHit: 'strength', mag: 3, dur: 8, addict: 40, wt: 0.1, c: 'good' },
      mentats: { glyph: 'μ', name: 'Mentats', type: 'chem', onHit: 'apregen', mag: 2, dur: 8, addict: 20, wt: 0.1, c: 'good' },
      maintenance_key: { glyph: '⚿', name: 'Maintenance Key', type: 'key', wt: 0, c: 'good' },
      red_keycard: { glyph: '▣', name: 'Red Keycard', type: 'key', wt: 0, c: 'warn' },
      reactor_key: { glyph: '⌘', name: 'Reactor Key', type: 'key', wt: 0, c: 'good' },
      command_key: { glyph: '⌂', name: 'Command Key', type: 'key', wt: 0, c: 'warn' },
      scrap_metal: { glyph: '▤', name: 'Scrap Metal', type: 'junk', wt: 1, c: 'dim' },
      electronics: { glyph: '⌁', name: 'Electronics', type: 'junk', wt: 0.5, c: 'good' },
      rope: { glyph: '⌇', name: 'Rope', type: 'junk', wt: 1, c: 'warn' },
      toolbox: { glyph: '▤', name: 'Toolbox', type: 'container', wt: 0, lock: 1, loot: ['repair_kit', 'bobby_pin', 'scrap_metal'], c: 'warn' },
      medical_box: { glyph: '▥', name: 'Medical Box', type: 'container', wt: 0, loot: ['stimpak', 'doctor_bag', 'radaway', 'rad_x', 'buffout', 'book_firstaid'], c: 'good' },
      ammo_crate: { glyph: '▦', name: 'Ammo Crate', type: 'container', wt: 0, lock: 1, loot: ['ammo_556', 'ammo_shell', 'ammo_10mm', 'ammo_10mm_ap', 'ammo_10mm_jhp'], c: 'warn' },
      duffel_bag: { glyph: '▧', name: 'Duffel Bag', type: 'container', wt: 0, loot: ['caps', 'ammo_44', 'raider_armor', 'smg'], c: 'warn' },
      plasma_grenade: { glyph: '◉', name: 'Plasma Grenade', type: 'explosive', dmg: [7, 12], blast: 2, range: 6, wt: 1, dt: 'energy', c: 'good' },
      dynamite: { glyph: '!', name: 'Dynamite', type: 'explosive', dmg: [6, 10], blast: 1, range: 5, wt: 1, dt: 'explosive', c: 'warn' },
      pulse_grenade: { glyph: '◈', name: 'Pulse Grenade', type: 'explosive', dmg: [6, 10], blast: 2, range: 6, wt: 1, dt: 'energy', c: 'good' },
      incendiary_grenade: { glyph: '✹', name: 'Incendiary Grenade', type: 'explosive', dmg: [4, 7], blast: 2, range: 6, wt: 1, dt: 'fire', onHit: 'burn', dur: 3, mag: 2, c: 'warn' },
      lead_pipe: { glyph: '/', name: 'Lead Pipe', type: 'weapon', dmg: [3, 5], range: 1, hands: 2, wt: 4, dt: 'melee', skill: 'melee_weapons', c: '#9aa7a0' },
      // Companion kit. Both are ordinary gear once they leave a companion's hands.
      rebar_club: { glyph: '|', name: 'Rebar Club', type: 'weapon', dmg: [4, 7], range: 1, hands: 1, wt: 3, dt: 'melee', skill: 'melee_weapons', c: '#9aa7a0' },
      worn_rifle: { glyph: 'R', name: 'Worn Rifle', type: 'weapon', dmg: [3, 6], range: 6, hands: 2, wt: 4, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: '#8a5a2b' },
      machete: { glyph: '╱', name: 'Machete', type: 'weapon', dmg: [4, 6], range: 1, hands: 1, wt: 3, dt: 'melee', skill: 'melee_weapons', c: '#9aa7a0' },
      combat_knife: { glyph: '†', name: 'Combat Knife', type: 'weapon', dmg: [3, 5], range: 1, hands: 1, wt: 1, dt: 'melee', skill: 'melee_weapons', c: '#e6dcc3' },
      wrench: { glyph: '¶', name: 'Pipe Wrench', type: 'weapon', dmg: [3, 6], range: 1, hands: 1, wt: 3, dt: 'melee', skill: 'melee_weapons', c: '#c1541e' },
      police_baton: { glyph: '│', name: 'Police Baton', type: 'weapon', dmg: [4, 6], range: 1, hands: 1, wt: 2, dt: 'melee', skill: 'melee_weapons', c: '#9aa7a0' },
      brass_knuckles: { glyph: '⌐', name: 'Brass Knuckles', type: 'weapon', dmg: [3, 5], range: 1, hands: 1, wt: 1, dt: 'melee', skill: 'unarmed', c: '#c1541e' },
      revolver: { glyph: '⌐', name: 'Revolver', type: 'weapon', dmg: [5, 8], range: 5, hands: 1, wt: 2, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_44', c: '#ffb000' },
      combat_rifle: { glyph: '╾', name: 'Combat Rifle', type: 'weapon', dmg: [5, 8], range: 9, hands: 2, wt: 7, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_556', c: '#9aa7a0' },
      double_barrel: { glyph: '≡', name: 'Double-Barrel Shotgun', type: 'weapon', dmg: [6, 10], range: 4, hands: 2, wt: 6, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_shell', c: '#c1541e' },
      crossbow: { glyph: '⊃', name: 'Crossbow', type: 'weapon', dmg: [5, 8], range: 7, hands: 2, wt: 5, dt: 'ballistic', skill: 'small_guns', ammo: 'ammo_bolt', c: '#8a5a2b' },
      flare_gun: { glyph: '⁝', name: 'Flare Gun', type: 'weapon', dmg: [2, 4], range: 5, hands: 1, wt: 2, dt: 'fire', skill: 'small_guns', ammo: 'ammo_flare', onHit: 'burn', c: '#ffb000' },
      laser_rifle: { glyph: '⌁', name: 'Laser Rifle', type: 'weapon', dmg: [5, 8], range: 8, hands: 2, wt: 6, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_ecell', c: '#33ff66' },
      plasma_caster: { glyph: '◍', name: 'Plasma Caster', type: 'weapon', dmg: [6, 10], range: 7, hands: 2, wt: 8, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_microfusion', c: '#4dffcf' },
      tesla_cannon: { glyph: '✦', name: 'Tesla Cannon', type: 'weapon', dmg: [7, 11], range: 8, hands: 2, wt: 9, dt: 'energy', skill: 'energy_weapons', ammo: 'ammo_microfusion', c: '#4dd2ff' },
      fat_man: { glyph: '◉', name: 'Fat Man', type: 'weapon', dmg: [15, 25], range: 8, hands: 2, wt: 20, dt: 'explosive', skill: 'big_guns', ammo: 'ammo_mininuke', knockback: 1, c: '#7dff9a' },
      frag_mine: { glyph: '⊕', name: 'Frag Mine', type: 'explosive', dmg: [6, 10], blast: 2, range: 1, wt: 1, dt: 'explosive', c: '#ff5a4a' },
      pulse_mine: { glyph: '⊛', name: 'Pulse Mine', type: 'explosive', dmg: [6, 10], blast: 2, range: 1, wt: 1, dt: 'energy', c: '#4dd2ff' },
      bomb: { glyph: '⊗', name: 'Bomb', type: 'explosive', dmg: [8, 12], blast: 2, range: 1, wt: 2, dt: 'explosive', c: '#ff5a4a' },
      metal_helmet: { glyph: '∩', name: 'Metal Helmet', type: 'armor', def: 2, ac: 2, wt: 3, c: '#9aa7a0' },
      combat_helmet: { glyph: '⌒', name: 'Combat Helmet', type: 'armor', def: 3, ac: 4, wt: 4, c: '#7dff9a' },
      hazmat_suit: { glyph: 'Ω', name: 'Hazmat Suit', type: 'armor', def: 2, ac: 2, wt: 8, res: { radiation: 90, energy: 10 }, c: '#7dff9a' },
      first_aid_kit: { glyph: '✚', name: 'First Aid Kit', type: 'food', heal: 8, wt: 2, c: '#ff5a4a' },
      prewar_money: { glyph: '¢', name: 'Pre-War Money', type: 'caps', amt: [2, 12], wt: 0, c: '#c9a45c' },
      gear: { glyph: '⊙', name: 'Gear', type: 'junk', wt: 0.5, c: '#9aa7a0' },
      circuit_board: { glyph: '⌬', name: 'Circuit Board', type: 'junk', wt: 0.3, c: '#4dd2ff' },
      bottle_cap: { glyph: '⊚', name: 'Bottle Cap', type: 'junk', wt: 0.1, c: '#c9a45c' },
      duct_tape: { glyph: '⟐', name: 'Duct Tape', type: 'junk', wt: 0.2, c: '#9aa7a0' },
      key: { glyph: '⚷', name: 'Key', type: 'key', wt: 0, c: '#ffd400' },
      data_chip: { glyph: '⌑', name: 'Data Chip', type: 'key', wt: 0, c: '#4dd2ff' },
      ammo_bolt: { glyph: '➤', name: 'Crossbow Bolts', type: 'ammo', amt: [4, 8], wt: 0.1, c: '#8a5a2b' },
      ammo_flare: { glyph: '⁝', name: 'Flares', type: 'ammo', amt: [2, 4], wt: 0.2, c: '#ffb000' },
      ammo_mininuke: { glyph: '◎', name: 'Mini Nukes', type: 'ammo', amt: [1, 2], wt: 5, c: '#7dff9a' }
    },
    // Maps below are in the older text format (one character per tile). They are converted on load.
    // @ = player start. Any tile, entity or item symbol above can be drawn right into the map.
    maps: {
      // amb = ambient light, 0 is pitch dark and 1 is fully lit. Indoor maps
      // ignore the game clock's daylight multiplier; weather is visual only.
      vault: { name: 'Vault 42 Entrance', amb: 0.22, indoor: true, weather: 'none', rows: [
        "##############################",
        "#@...#.........#.............#",
        "#....#.....r...#....$....g...#",
        "#....+.....V...+.....P..A....#",
        "#.b..#....T....#.l^&*..~~....#",
        "###+######+#####+#############",
        "#....c.......................#",
        "#..r.......##.......$.....g..#",
        "#..........#~~~............!.#",
        "#.....$....................r.#",
        "#............................#",
        "#....##..................##..#",
        "#....H....D..................#",
        "#..........................>.#",
        "##############################"
      ], exits: { '27,13': 'outskirts' } },
      outskirts: { name: 'Wasteland Outskirts', amb: 0.9, indoor: false, weather: 'rain', rows: [
        "####################",
        "#..................#",
        "#.>...r.......$...>#",
        "#..N.&c.C..##......#",
        "#....~~.....a...g..#",
        "#..p=......λr..ʘ!..#",
        "#.....G...%........#",
        "####################"
      ], exits: { '2,2': 'vault', '18,2': 'ruins' } },
      ruins: { name: 'Wasteland Ruins', amb: 0.42, indoor: false, weather: 'fog', rows: [
        "########################",
        "#@..*...>..##....##....#",
        "#..........##....##.=$.#",
        "#..###...........#..>..#",
        "#..#.....##..%g......ς~#",
        "#..#....F##.......##...#",
        "#....!...♦..#...^.##...#",
        "#####.KL..⚙.#..........#",
        "#......~~...#.ƒ..P.....#",
        "#..##.......#....###...#",
        "#..##....r..#....#l.S..#",
        "#.Ω........+#....###...#",
        "#.....$.U...........Ʀ.&#",
        "########################"
      ], exits: { '8,1': 'outskirts', '20,3': 'bypass' } },
      // Route 9 is the long road east: a three-lane bypass with a broken span in
      // the middle. The span blocks carts but not people, so the crossing is a
      // repair job rather than a wall.
      bypass: { name: 'Route 9 Bypass', amb: 0.6, indoor: false, weather: 'rain', rows: [
        "##########################",
        "#........................#",
        "#..▬.....♨........!......#",
        "#·········≡······R·······#",
        "#>@·······≡·············>#",
        "#·········≡·······c······#",
        "#........................#",
        "#..~~....g..........c....#",
        "#..~~.......▬..........r.#",
        "#........................#",
        "#..$.....!......%........#",
        "#........................#",
        "##########################"
      ], exits: { '1,4': 'ruins', '24,4': 'pumphouse' } },
      // The market's water works: dark, wet, and guarded by whatever crawled in
      // when the pumps stopped.
      pumphouse: { name: 'Flooded Pumphouse', amb: 0.14, indoor: true, weather: 'none', rows: [
        "####################",
        "#..................#",
        "#..~~..............#",
        "#...≈≈...c.........#",
        "#..................#",
        ">.........◍........#",
        "#..............F...#",
        "#.....r......r.....#",
        "#..$...............#",
        "#..................#",
        "####################"
      ], exits: { '0,5': 'bypass' } }
    },
    // The overworld: places on the road map and the hours each road takes.
    // A node's `road` list is the pool of things that can follow you in there.
    world: {
      nodes: {
        vault: { x: 2, y: 2, glyph: 'V', label: 'VAULT 42', road: [] },
        outskirts: { x: 9, y: 4, glyph: 'O', label: 'OUTSKIRTS', road: ['raider', 'feral_dog'] },
        ruins: { x: 16, y: 2, glyph: 'R', label: 'RUINS', road: ['raider', 'feral_ghoul'] },
        bypass: { x: 12, y: 7, glyph: 'B', label: 'ROUTE 9', road: ['feral_dog', 'raider'] },
        pumphouse: { x: 18, y: 6, glyph: 'P', label: 'PUMPHOUSE', road: ['feral_ghoul'] }
      },
      routes: [['vault', 'outskirts', 2], ['outskirts', 'ruins', 3],
        ['ruins', 'bypass', 2], ['bypass', 'pumphouse', 1]]
    }
  };

  // Legacy symbol -> ID table. Kept so old text maps and old saved Forge data still load.
  const LEG = { '#': 'wall', '.': 'floor', '+': 'door', '/': 'door_open', T: 'terminal', '~': 'rad_puddle', '>': 'exit', r: 'radroach', g: 'feral_ghoul', P: 'protectron', $: 'caps', '!': 'stimpak', '%': 'radaway', '&': 'repair_kit', '=': 'ammo_10mm', '^': 'ammo_ecell', b: 'baseball_bat', p: 'pistol_10mm', l: 'laser_pistol', a: 'leather_armor', A: 'combat_armor', S: 'rust_sentinel', U: 'yao_guai', 'ς': 'radscorpion_matriarch', N: 'mira', V: 'vale', K: 'keeper', 'ƒ': 'fence', '⚙': 'generator_broken', R: 'raider', w: 'clean_water', x: 'toxic_waste', o: 'nuka_cola', f: 'cram', m: 'irradiated_meat', k: 'vault_key', B: 'buffout', j: 'jet', M: 'medx', '*': 'grenade', i: 'molotov', c: 'crate', C: 'mira_cache', F: 'footlocker', n: 'bobby_pin', G: 'strongbox', L: 'market_lockbox', H: 'safe', D: 'secure_door', '♦': 'dealer', 'Ω': 'rook', 'λ': 'vera', 'ʘ': 'ash', 'Ʀ': 'raider_rivet', '·': 'road', '≡': 'bridge_broken', '≈': 'pump_broken', '▬': 'wrecked_car', '♨': 'campfire', '◍': 'glowing_fungus' };

  WA.GAME = GAME;
  WA.LEG = LEG;
  // Pristine copy of the built-in definitions, used by the Forge to revert and
  // delete. A JSON clone would drop the function-valued dialogue lines, so copy
  // through the helper that keeps functions by reference.
  WA.BASE = WA.util.copy({ entities: GAME.entities, items: GAME.items, tiles: GAME.tiles });
})(window.WA = window.WA || {});
