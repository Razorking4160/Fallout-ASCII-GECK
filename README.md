# G.E.C.K.

The Garden of Eden Creation Kit — authoring app for **Fallout ASCII**. It runs as its own static site — no build step,
no bundler, no dependencies, classic scripts on the shared `WA` namespace — and is
deployed separately from the game. The Play tab is the embedded preview used by the map
editor's **Test** button, so the studio carries the full engine as well as the editors.

```
python3 -m http.server 8081     # open http://localhost:8081/
```

Opening `index.html` from disk works too, but browsers restrict storage on `file://`;
a local server is the reliable way to keep maps and jobs.

## Tabs

- **Play** — the real game shell, used as the editor preview. Starting a new game here
  is a normal game; **Test** in the map editor starts a non-persistent game on the map
  being edited.
- **Edit** — the map editor: palette, brush editor, map library, import/export,
  **Ship to code**, and **Test**.
- **Forge** — enemies, items and tiles, the symbol library, the job/dialogue authoring
  form, the job browser with per-job and whole-content checks, and content packs.
- **Bench** — the save/load benchmark against synthetic maps.

## Where edits live

The studio keeps authoring state in this browser:

| Store | Key / database | Holds |
| --- | --- | --- |
| Map library | IndexedDB `wasteland-maps`, fallback `wasteland.map.*` | Maps created or edited in **Edit** |
| Definition overrides | localStorage `wasteland.data2` | Enemies, items and tiles saved in **Forge** |
| Authored jobs | localStorage `wasteland.authored` | Jobs and dialogue saved in the authoring form |
| Settings and saves | `wasteland.*`, IndexedDB `wasteland` | Preview-game settings and save slots |

None of this crosses to a game on another origin. That is what content packs are for.

## Content packs

**Forge → Content packs** has two jobs:

- **Export content pack** writes `wasteland-content.json` containing the whole map
  library, every Forge definition override, and every authored job and dialogue patch.
  It is validated with the same checker the game runs before the download starts.
- **Import a pack** validates the file, merges maps into the map library, definitions
  into the Forge override store, and jobs/dialogue into the authoring store, then
  reloads the studio. A shipped job always wins over an incoming copy.

Pack format:

```json
{
  "format": "wasteland-content",
  "version": 1,
  "name": "My wasteland",
  "created": "2026-11-18T00:00:00.000Z",
  "defs": { "tiles": {}, "entities": {}, "items": {} },
  "maps": { "map_id": { "name": "…", "rows": ["…"], "legend": {}, "start": [1, 1] } },
  "quests": { "job_id": { "name": "…", "giver": "npc", "goals": [], "reward": {} } },
  "dialogue": { "npc": { "nodes": {}, "add": {} } }
}
```

Rules the validator enforces: the format tag and version, map id and row shapes,
definition ids and the absence of dialogue trees inside definitions (they contain
functions), job structure through `WA.quests.checkAuthored`, and dialogue patches that
name a shipped NPC with a dialogue tree. A pack can add enemies and items, but a job
giver must already be a dialogue NPC in the game. Rejected packs are not stored.

In the game, **Menu → Content packs** imports a file or fetches a URL
(`?pack=<url>` also works once), stores it in IndexedDB and applies it at boot. Every
save records the pack fingerprint; the Load screen marks saves made under another pack.

## Shipping content into the game repo

For a release, no pack is involved. The game loads three generated files:

- **Edit → Ship to code** writes `maps-authored.js` (only ticked library maps).
- **Forge → Export authored** writes a `quests-authored.js` patch.
- **Forge → Export definitions for game** writes `defs-authored.js`, containing every
  definition that differs from the shipped data, including `null` entries that remove
  one.

Copy those into the game repo's `js/data/` and bump both apps' `js/data/version.js` plus
the service-worker comment. The game applies them in this order: shipped data → baked
definitions → shipped authored jobs → content pack.

## Two repositories

The engine, systems, data and styles are shared by duplication: the game repo is the
source of truth for runtime code, and this studio carries a copy so its preview behaves
exactly like the game. When engine or system files change in the game repo, copy the
changed files into this studio (`js/engine`, `js/systems`, `js/storage`, `js/data`, and
the shared `css/`). Studio-only code lives in `js/editors/` and never travels back.
Content travels the other way, through the generated files above or a content pack.

The studio does not load a pack from the game repo automatically: import one with
**Content packs** if you need to continue editing content that only exists in a game
save or deployment.

The **Open the game ↗** link points at the game's own deployment
(<https://wasteland-ascii-dswq78.freebuff.site/>) because the two apps now live on
separate origins. For side-by-side development from the workspace, point the `href` in
`index.html` back at `../game/index.html`.

Whenever a game change touches shared runtime code, copy the changed files here and run
the game's `tools/check-studio-sync.sh` (from the game checkout, passing this directory).
It compares every script and stylesheet the game loads, except the deliberately
different `js/main.js` and `js/systems/menu.js`, and lists anything still out of step.
Studio-only styles live in `css/studio.css`, which is why the shared stylesheets can stay
byte-identical.

## Deployment

The studio is its own repository and its own static site; the game does not serve any of
it. `tools/stage-deploy.sh` writes `dist/` with only the files the page loads
(`index.html`, `css/`, `js/`, `icons/`, `manifest.json`, `service-worker.js`) and fails if
a service-worker `APP_FILES` entry is missing from the staged tree. `deploy.json` is the
manifest for the live host: `worker.js` answers every request from `dist/` through the
static-assets binding, with no server logic. Any static host can serve `dist/` as is,
since every path is relative.

**Live:** <https://wasteland-studio-spb9hh.freebuff.site>

Content still travels between the two deployments as a content pack or as generated
`js/data/*-authored.js` files; the studio's storage stays scoped to its own origin.

## Offline

The studio registers its own service worker (`service-worker.js`) and caches its files
for offline authoring. Its cache is independent of the game's, and its manifest installs
as **G.E.C.K.**.
