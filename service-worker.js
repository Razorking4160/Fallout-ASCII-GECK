/* Offline cache for Fallout ASCII.
   WHENEVER THE GAME CHANGES: add or remove entries in APP_FILES and bump the
   version in js/data/version.js, otherwise installed copies keep serving the
   old files. The cache name is built from that file so the Pip-Boy build
   stamp and the cache version always match. Touch this script on a version
   bump so installed workers also reinstall the new cache. */
/* 0.17.1: backdrop ignores clicks retargeted from the D-pad press. */
/* 0.17.2: visible close control on every dismissible overlay. */
/* 0.18.0: expanded map-editor catalog with grouped, searchable palette. */
/* 0.18.1: unique palette glyphs for packed-map legends. */
/* 0.18.2: autosave load dismisses the stale creation overlay. */
/* 0.19.0: duplicate-glyph map legends, palette labels, and the first safe-symbol pack. */
/* 0.19.1: fixed-size symbol table with wrapping palette names. */
/* 0.19.2: keep glowing creatures out of the robot shelf. */
/* 0.20.0: quick brush editor and collapsible palette groups. */
/* 0.20.1: repaint the map immediately after a brush edit. */
/* 0.20.2: correct the brush-editor kind label. */
/* 0.20.3: expand/collapse controls for palette groups. */
/* 0.21.0: Fallout 1 character creation: identity, SPECIAL, traits and tags. */
/* 0.21.1: tag previews show their +20 immediately. */
/* 0.21.2: Fallout 1's three premade characters on the identity step. */
/* 0.21.3: character identity is available to dialogue and the Pip-Boy. */
/* 0.22.0: cinematic boot intro and Load / New game / Options menu. */
/* 0.22.1: slower intro pacing and a higher-contrast menu in both themes. */
/* 0.22.2: brighter secondary text across the game and a longer static intro hold. */
/* 0.22.3: the intro waits for a Continue button instead of auto-opening the menu. */
/* 0.22.4: the Forge symbol picker includes every glyph used by game content. */
/* 0.22.5: refresh the game-glyph shelf after Forge deletes and resets. */
/* 0.22.6: search and category filtering for the Forge symbol library. */
/* 0.22.7: reusable skill checks and Speech-gated dialogue branches. */
/* 0.22.8: show the checked skill and roll result inside the dialogue panel. */
/* 0.23.0: First Aid, Doctor, Repair, Traps and Sneak field actions. */
/* 0.23.1: trap authoring in the Forge, brush editor and map palette. */
/* 0.23.2: trapped containers can be authored, detected and disarmed. */
/* 0.23.3: loot and lockpicking panels show trap status before opening. */
/* 0.23.4: world-object repair targets, kit use and Forge authoring. */
/* 0.23.5: ruins generator content and the Power in the Ruins quest. */
/* 0.23.6: Pip-Boy quest markers for active givers and repair objectives. */
/* 0.23.7: kill and delivery objective markers with distinct glyphs. */
/* 0.23.8: Sneak detection responds to environmental light and recent movement. */
/* 0.24.0: game clock, indoor/outdoor daylight lighting, and weather overlays. */
/* 0.24.1: canvas rain and fog particles with pause and reduced-motion handling. */
/* 0.24.2: crippled limbs, arm/leg penalties, and Doctor's Bag treatment. */
/* 0.25.2: combat balance pass for knockdown, critical failures and burst ammo. */
/* 0.25.3: a knockback-capable Yao guai encounter in the Wasteland Ruins. */
/* 0.25.4: a heavy non-knockback Radscorpion matriarch in the ruins east chamber. */
/* 0.25.5: overworld map, road travel time, road encounters and Outdoorsman. */
/* 0.25.6: hour-step rest and wait, with interruptions from nearby hostiles. */
/* 0.25.7: NPC schedules and shop hours driven by the game clock. */
/* 0.25.8: merchant trade screen with stock, stall caps and daily restocking. */
/* 0.25.9: shop theft with stolen-goods marks and caught consequences. */
/* 0.26.0: pickpocketing, owned containers, and harder held-item theft. */
/* 0.27.0: night fence, notoriety bounties, hunters and bounty clearing. */
/* 0.28.0: trickle restock, gradual caps and condition-bearing used gear. */
/* 0.29.0: Croup's Lucky Seven dice table, capped bets and Gambling-check odds. */
/* 0.30.0: Croup's Boxcars long shot, its own odds and a smaller table limit. */
/* 0.31.0: companions, the PARTY roster, orders and follower turns. */
/* 0.35.0: quest-gated recruitment — Ash joins after Blood on the Road. */
/* 0.36.0: karma, faction standing and the Pip-Boy reputation summary. */
/* 0.37.0: standing-aware dialogue greetings and faction-adjusted shop prices. */
/* 0.38.0: karma and lead-faction ending paragraphs, snapshotted with the ending. */
/* 0.39.0: alternate turn-ins for Spare Cells, Power in the Ruins and Blood on the Road. */
/* 0.40.0: Hated factions refuse trade and services until reparations are paid. */
/* 0.41.0: companion stance lines react to karma and faction standing. */
/* 0.42.0: six skill books and the permanent Endurance Module. */
/* 0.43.0: perk catalog expanded to thirty implemented perks. */
/* 0.44.0: persistent Easy / Normal / Hard difficulty settings. */
/* 0.45.0: authored quest/dialogue validation, the content checker, and four new jobs. */
/* 0.46.0: in-game quest/dialogue authoring form with rollback on check errors. */
/* 0.47.0: export browser-authored jobs as a pasteable quests-authored.js patch. */
/* 0.48.0: alternate turn-in outcomes in the authoring form. */
/* 0.49.0: multi-goal jobs in the authoring form, tracked per goal. */
/* 0.50.0: quest chains, so handing in one job unlocks the next from the same speaker. */
/* 0.51.0: read-only Forge browser for the live jobs and their dialogue pages. */
/* 0.52.0: per-job content-check errors and warnings in the Forge browser. */
/* 0.53.0: clone a browsed job into the authoring form as a new unsaved job. */
/* 0.54.0: several alternate turn-ins per job in the authoring form and its clones. */
/* 0.55.0: several faction standing changes on each job reward and alternate outcome. */
/* 0.56.0: collapsible whole-content problem report in the Forge browser. */
/* 0.57.0: click a content problem to show the job it names. */
/* 0.58.0: selectable quest waypoint on the Pip-Boy map. */
/* 0.59.0: the play HUD shows the tracked waypoint's bearing and distance. */
/* 0.60.0: the HUD names the map when the tracked objective is elsewhere. */
/* 0.61.0: the game and studio are separate apps; content packs and baked definitions. */
/* 0.61.1: game boot applies shipped authored maps; pack checks need shipped dialogue NPCs. */
/* 0.61.2: separate repository and deployment; the studio links to the deployed game. */
/* 0.61.3: production deployment; the game link uses the game's canonical URL. */
/* 0.61.4: Route 9 and pumphouse maps, two repair jobs, studio-only styles, and text maps packed at boot. */
/* 0.61.5: synced Route 9 and pumphouse encounter and loot balance pass. */
/* 0.61.6: follows the game's Fallout ASCII rename and icon set. */
/* 0.61.7: the authoring app is G.E.C.K., with its own G.E.C.K. icon set. */
/* 0.62.0: terrain encounter tables synced from the game. */
/* 0.63.0: witness-gated theft and the simplified encounter tables synced from the game. */
/* 0.64.0: witness reactions, fumble cooldowns and facing synced from the game. */
/* 0.64.1: even cell spacing and NPC facings synced from the game. */
/* 0.64.2: fitted grid and arrow facings synced from the game. */
importScripts("./js/data/version.js");

const CACHE_NAME = "wasteland-ascii-v" + self.WA_VERSION;

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",

  // Icons
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",

  // Stylesheets
  "./css/main.css",
  "./css/mobile.css",
  "./css/studio.css",
  "./css/terminal.css",

  // Scripts
  "./js/data/defs-authored.js",
  "./js/data/game-data.js",
  "./js/data/maps-authored.js",
  "./js/data/quests-authored.js",
  "./js/data/symbols.js",
  "./js/data/version.js",
  "./js/editors/authoring.js",
  "./js/editors/benchmark.js",
  "./js/editors/forge.js",
  "./js/editors/map-editor.js",
  "./js/editors/pack-ui.js",
  "./js/engine/ai.js",
  "./js/engine/lighting.js",
  "./js/engine/pathfinding.js",
  "./js/engine/renderer.js",
  "./js/engine/turn.js",
  "./js/engine/util.js",
  "./js/engine/visibility.js",
  "./js/engine/weather.js",
  "./js/engine/world.js",
  "./js/main.js",
  "./js/storage/content-pack.js",
  "./js/storage/map-store.js",
  "./js/storage/save-manager.js",
  "./js/storage/settings.js",
  "./js/systems/addiction.js",
  "./js/systems/authored.js",
  "./js/systems/baked.js",
  "./js/systems/bounty.js",
  "./js/systems/character.js",
  "./js/systems/combat.js",
  "./js/systems/damage.js",
  "./js/systems/death.js",
  "./js/systems/dialogue.js",
  "./js/systems/ending.js",
  "./js/systems/field.js",
  "./js/systems/gambling.js",
  "./js/systems/hacking.js",
  "./js/systems/inventory.js",
  "./js/systems/limbs.js",
  "./js/systems/lockpick.js",
  "./js/systems/loot.js",
  "./js/systems/menu.js",
  "./js/systems/overworld.js",
  "./js/systems/party.js",
  "./js/systems/perks.js",
  "./js/systems/pickpocket.js",
  "./js/systems/pipboy.js",
  "./js/systems/quests.js",
  "./js/systems/rads.js",
  "./js/systems/reputation.js",
  "./js/systems/rest.js",
  "./js/systems/scale.js",
  "./js/systems/schedule.js",
  "./js/systems/skills.js",
  "./js/systems/status.js",
  "./js/systems/time.js",
  "./js/systems/trade.js",
  "./js/systems/traits.js",
  "./js/systems/vats.js",
  "./js/systems/weapons.js",

];

// Install: cache each available application file. One missing file must not
// abort the install, so failures are logged per file.
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const file of APP_FILES) {
      try {
        const response = await fetch(file, { cache: "reload" });

        if (response.ok) await cache.put(file, response);
        else console.error("Could not cache:", file, response.status);
      } catch (error) {
        console.error("Cache failed:", file, error);
      }
    }

    // Deliberately no skipWaiting: the new worker waits so the page can offer
    // a reload banner instead of swapping code underneath a running game.
  })());
});

// The page asks the waiting worker for its version, then tells it to activate.
self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  else if (data.type === "VERSION") {
    const msg = { type: "VERSION", version: self.WA_VERSION };
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(msg);
    else if (event.source) event.source.postMessage(msg);
  }
});

// Activate: remove previous Wasteland caches only.
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key.startsWith("wasteland-ascii-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

/* Fetch: network first so edits show up straight away, cached copy as the
   offline fallback. Navigations fall back to index.html. */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request, { cache: "no-store" });
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone());
      }
      return fresh;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }

      return new Response("Resource unavailable offline", { status: 503 });
    }
  })());
});
