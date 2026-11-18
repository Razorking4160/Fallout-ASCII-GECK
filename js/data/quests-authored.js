/* Authored quests and dialogue. This is the hand-editable content file: it
   loads after game-data.js and the systems merge it, so a new job can be added
   without touching engine code. WA.authored.check() validates every definition
   (missing nodes, unknown items/enemies/skills/factions, rewards) and the Forge
   tab has a Validate button for the same report.

   Quest shape:
     id: { name, giver (entity id), map (map id), text,
           goals: [{ kind: 'kill'|'ammo'|'item'|'repair', id, need, text }],
           reward: { caps, stims, kits, radaways, xp, karma, rep: { faction: n } },
           alts: { outcome: { name, reward, done } },
           req: 'anotherJobFromTheSameSpeaker' }
   `req` holds the job that must be handed in first; the follow-up stays locked
   until then, and the checker rejects a missing, cross-speaker or looping link.

   Dialogue patch shape, keyed by an existing talking entity:
     entityId: { quest (optional quest id this NPC tracks), root (optional new
                 root), nodes: { name: node }, add: { nodeName: [option] } }
   `nodes` adds or replaces pages; `add` inserts options before the closing
   Leave-style buttons so the way out stays last. */
(function (WA) {
  'use strict';

  WA.AUTHORED_QUESTS = {
    ears: {
      name: 'Ears to the Ground',
      giver: 'fence',
      map: 'ruins',
      text: 'Ghouls have been pulling traders off the west road. Sable pays for the ears and does not ask how you got them.',
      goals: [{ kind: 'kill', id: 'feral_ghoul', need: 2, text: 'Kill 2 feral ghouls' }],
      reward: { caps: 55, xp: 20, rep: { market: 6 } },
      alts: {
        skim: {
          name: 'Skimmed the payment',
          reward: { caps: 80, xp: 20, karma: -5, rep: { market: -8 } },
          done: 'Sable counts the caps twice and lets it go. The market will hear how you collect.'
        }
      }
    },
    wolves: {
      name: 'Wolves at the Door',
      giver: 'vera',
      map: 'ruins',
      text: 'A yao guai has been pacing the east road. Vera cannot leave her post, so she pays for the thing to be put down.',
      goals: [{ kind: 'kill', id: 'yao_guai', need: 1, text: 'Kill the yao guai' }],
      reward: { caps: 60, stims: 1, xp: 30, karma: 6, rep: { road: 8 } }
    },
    table: {
      name: 'Lighting the Table',
      giver: 'dealer',
      map: 'ruins',
      text: "Croup's dice table runs on a bank of scavenged energy cells, and the bank is dry.",
      goals: [{ kind: 'ammo', id: 'ammo_ecell', need: 10, text: 'Bring 10 Energy Cells' }],
      reward: { caps: 65, xp: 15, rep: { market: 4 } }
    },
    walls: {
      name: 'Something in the Walls',
      giver: 'rook',
      map: 'vault',
      text: 'Rook swears the scratching behind the vault wall is louder every night. He wants the nest cleared.',
      goals: [{ kind: 'kill', id: 'radroach', need: 3, text: 'Kill 3 radroaches' }],
      reward: { caps: 25, stims: 1, xp: 15, karma: 5 }
    },
    // A chain: Rook only offers this once the roach job is handed in.
    nest: {
      name: 'The Thing in the Walls',
      giver: 'rook',
      map: 'ruins',
      req: 'walls',
      text: 'The roach nest was dug by something bigger. Rook traced the tunnel south and wants the radscorpion matriarch put down before it breeds.',
      goals: [{ kind: 'kill', id: 'radscorpion_matriarch', need: 1, text: 'Kill the radscorpion matriarch' }],
      reward: { caps: 70, kits: 1, xp: 35, karma: 6, rep: { market: 6 } }
    }
  };

  WA.AUTHORED_DIALOGUE = {
    fence: {
      quest: 'ears',
      nodes: {
        work: {
          text: c => c.quest === 'done'
            ? 'Ears are in. The road is quieter, and I am not asking where they came from.'
            : c.quest === 'ready'
              ? 'Those are ghoul ears in your pack. Set them on the counter and we will talk caps.'
              : c.quest === 'active'
                ? 'Two ghouls, west side of the ruins where the wall came down. They follow the traders home.'
                : 'Two ghouls have been pulling traders off the west road. Bring me their ears and I will pay for the quiet.',
          opts: [
            { t: 'Two sets of ears. I will bring them.', fx: { quest: ['take', 'ears'] }, to: 'work', if: c => c.quest === 'none' },
            { t: 'Here are the ears.', fx: { quest: ['turnin', 'ears'], trust: 1 }, to: 'work', if: c => c.quest === 'ready' },
            { t: 'The ears were worth more than that.', fx: { quest: ['turnin', 'ears', 'skim'] }, to: 'work', if: c => c.quest === 'ready' },
            { t: 'Later.', to: '@' }
          ]
        }
      },
      add: { greet: [{ t: 'Got work?', to: 'work' }] }
    },
    vera: {
      quest: 'wolves',
      nodes: {
        work: {
          text: c => c.quest === 'done'
            ? 'The road is quieter. That is all I ask from anyone.'
            : c.quest === 'ready'
              ? 'You smell like yao guai. Good. Is it dead?'
              : c.quest === 'active'
                ? 'The yao guai is still out there. East road, past the ruins wall. Follow the tracks.'
                : 'Something big has been pacing the east road — a yao guai, by the tracks. I cannot leave the post, so it stays alive and the traders stay home.',
          opts: [
            { t: 'I will put it down.', fx: { quest: ['take', 'wolves'] }, to: 'work', if: c => c.quest === 'none' },
            { t: 'It is dead.', fx: { quest: ['turnin', 'wolves'], trust: 1 }, to: 'work', if: c => c.quest === 'ready' },
            { t: 'Later.', to: '@' }
          ]
        }
      },
      add: {
        greet: [{ t: 'Anything else out here?', to: 'work' }],
        why: [{ t: 'Anything else out here?', to: 'work' }]
      }
    },
    dealer: {
      quest: 'table',
      nodes: {
        work: {
          text: c => c.quest === 'done'
            ? 'The table is lit and the house is up. It remembers a favour.'
            : c.quest === 'ready'
              ? 'Ten cells. The table will be lit tonight.'
              : c.quest === 'active'
                ? 'Still ten cells short. The machines out in the ruins carry them.'
                : 'The table lights run on energy cells and the bank is dry. Ten cells and I will keep dealing until dawn — and cut you a share of the take.',
          opts: [
            { t: 'Ten cells, coming up.', fx: { quest: ['take', 'table'] }, to: 'work', if: c => c.quest === 'none' },
            { t: 'Here are the cells.', fx: { quest: ['turnin', 'table'], trust: 1 }, to: 'work', if: c => c.quest === 'ready' },
            { t: 'Back', to: '@' }
          ]
        }
      },
      add: {
        greet: [{ t: 'Need a hand with the table?', to: 'work' }],
        broke: [{ t: 'Need a hand with the table?', to: 'work' }]
      }
    },
    rook: {
      quest: 'walls',
      nodes: {
        work: {
          text: c => c.quest === 'done'
            ? 'Quiet walls. Best payment I have had in a month.'
            : c.quest === 'ready'
              ? 'That is three. The scratching stopped.'
              : c.quest === 'active'
                ? 'Three roaches. They come out of the wall at the far end of the vault corridor.'
                : 'You hear that? Scratching, behind the wall. Radroaches, a nest of them, and I am not sleeping next to it. Clear three out and the caps are yours.',
          opts: [
            { t: 'I will clear the nest.', fx: { quest: ['take', 'walls'] }, to: 'work', if: c => c.quest === 'none' },
            { t: 'The nest is cleared.', fx: { quest: ['turnin', 'walls'], trust: 1 }, to: 'work', if: c => c.quest === 'ready' },
            { t: 'Later.', to: '@' }
          ]
        },
        // The follow-up page. Its link appears on greet once `walls` is done.
        nest: {
          text: c => c.q('nest') === 'done'
            ? 'The big one is dead. Whatever digs in that vault next will have to start small.'
            : c.q('nest') === 'ready'
              ? 'That is its head. I will sleep with the light off tonight.'
              : 'The roach nest did not dig itself. Something bigger made that tunnel, and I traced it south — a radscorpion matriarch. Put it down before it lays a hundred more.',
          opts: [
            { t: 'Point me at it.', fx: { quest: ['take', 'nest'] }, to: 'nest', if: c => c.q('nest') === 'none' },
            { t: 'It is dead.', fx: { quest: ['turnin', 'nest'], trust: 1 }, to: 'nest', if: c => c.q('nest') === 'ready' },
            { t: 'Later.', to: '@' }
          ]
        }
      },
      add: {
        greet: [
          { t: 'About that scratching...', to: 'work' },
          { t: 'What dug the roach nest?', to: 'nest', if: c => c.q('nest') !== 'locked' }
        ]
      }
    }
  };
})(window.WA = window.WA || {});
