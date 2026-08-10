# Map reference images

Top-down reference images for every map in the game, for marking up "move
this box spot" / "the fence here is wrong" type feedback without relying on
in-game landmarks. Two sets per map, both in `output/`:

- `gridmap_<mapId>.png` - a clean top-down shot with an A1-F6 lettered/
  numbered grid overlaid, so a specific spot can be called out as e.g. "the
  crate near D4" instead of describing it.
- `annotated_<mapId>.png` - the grid version plus pins for mystery box
  spots (BOX), Pack-a-Punch (PAP), perk machines (letter), and wall buys
  (weapon code), with a legend in the bottom-left corner.

Current maps: `town`, `wayside`, `blacksire`, `laststop`, `crossroads`, `crossroads_night`, `overpass`, `overpass_night`.

## Regenerating

Two steps. Step 1 needs a browser; step 2 is pure Python and reads
`public/index.html` directly.

```bash
# 1. Start the dev server in one terminal
npm run dev   # -> http://localhost:8787

# 2. In another terminal, from the repo root:
npm install -D playwright && npx playwright install chromium   # one-time
node tools/minimaps/capture_topdown.mjs
python3 tools/minimaps/build_reference_maps.py
```

`capture_topdown.mjs` writes raw top-down screenshots to `raw/<mapId>.png`
(1600x1600, one per map, gitignored-free - these ARE committed since they're
the source of truth for the annotated builds and there's no other way to
regenerate them without a live browser). `build_reference_maps.py` reads
those plus map data straight out of `public/index.html` and writes the
lettered/annotated versions to `output/`.

Both scripts auto-discover maps - see "Adding a new map" below.

## If you only changed prop placement (box/PAP/perk/wall buy spots)

You don't need to recapture screenshots. Just rerun:

```bash
python3 tools/minimaps/build_reference_maps.py
```

It re-reads `public/index.html` and re-draws pins over the existing
`raw/<mapId>.png`. Only rerun `capture_topdown.mjs` if the map's actual
geometry (buildings, roads, terrain) changed.

## Adding a new map

Both scripts read the map list from the game itself, so a new map that
follows the existing conventions needs **no changes to this tooling** -
just rerun the two commands above. Specifically, for a new map to be
picked up automatically:

1. It must be registered in `const MAPS={...}` in `public/index.html`,
   e.g. `newmap:{ ..., build:buildNewMap }` - `capture_topdown.mjs`
   discovers map IDs from `window.__MAP_TOOLS__.MAPS` (this is the same
   object), and `build_reference_maps.py` parses this literal directly.
2. Its build function (`function buildNewMap(){...}`) must set a `BND`
   constant (`const BND=NN` or `let BND=NN`) somewhere in its body - this
   is the world half-extent used both for the top-down camera's frustum
   and for converting box/PAP/perk/wall-buy world coordinates into pixel
   positions. Get this wrong and the pins will be off (see "Coordinate
   transform" below).
3. Mystery box spots should be in a `BOX_SPOTS=[[x,z],...]` array; Pack-a-
   Punch, perk machines, and wall buys should use the existing
   `addPackAPunch(x,y,z,...)`, `addPerkMachine('key',x,y,z,...)`, and
   `addWallBuy('defId',x,y,z,...)` calls respectively. `build_reference_maps.py`
   finds these by regex against the function body text, not by running the
   game, so as long as the call sites look like the existing ones for other
   maps, a new map's pins show up with no code changes here.

If a new map doesn't fit those conventions (e.g. computed BND, box spots
built programmatically instead of a literal array), `build_reference_maps.py`
will skip it and print a `skip <mapId>: ...` message explaining why -
either loosen its regex for that one field, or add a small map-specific
branch; don't rewrite the general approach for a one-off.

## The `window.__MAP_TOOLS__` hook

`public/index.html`'s module script isn't accessible from `window` by
default - `scene`, `worldRoot`, `BND`, `renderer`, etc. are all
module-scoped `let`/`const` bindings, and several of them (`worldRoot`,
`BND`, `scene`) get *reassigned* by `loadMap()`, so a plain captured
reference goes stale after a map switch. Near the bottom of the module
script (after `loop();`) there's a small permanent hook:

```js
window.__MAP_TOOLS__={
  get scene(){return scene;}, get worldRoot(){return worldRoot;},
  get BND(){return BND;}, get SPAWN_AT(){return SPAWN_AT;},
  renderer, THREE, MAPS, startGame,
};
```

The getters matter - they re-read the current binding on every access
instead of freezing a value at hook-creation time. This is what lets
`capture_topdown.mjs` call `startGame(mapId)` for each map in turn and
still see the right `scene`/`worldRoot`/`BND` afterwards.

This hook is intentionally left in the shipped game (unlike the various
throwaway `window.__DEBUG` hooks used during development) because it's
small, read-only, and this tooling depends on it. If it's ever removed or
renamed, `capture_topdown.mjs` will fail fast with an error pointing back
here.

### If capture_topdown.mjs breaks

- **"Could not find window.__MAP_TOOLS__.MAPS"**: the hook above got
  removed or renamed in `public/index.html`. Re-add it (see previous
  section) or update the script to match the new name.
- **`locator.screenshot()` hangs on "waiting for element to be stable"**:
  happened when Playwright resolved a Chromium build other than the one
  pinned in the script's `executablePath` - the fix that's currently
  checked in pins `chromium-1194`. If that revision stops existing under
  `PLAYWRIGHT_BROWSERS_PATH`, find whatever `npx playwright install
  chromium` pulled down and update the pinned path.
- **Crossroads (or any async-loading map) renders with buildings
  missing**: Crossroads streams ~70 individual `.glb` files in over the
  network instead of building geometry synchronously like the other maps
  (see `placeTownAsset` in `public/index.html`). The script waits a flat
  3 seconds after `startGame()` before capturing, which is enough today -
  if a future map's async load is heavier, increase that wait.
- **`canvas.toDataURL()`**: an earlier version of this script used
  `renderer.domElement.toDataURL('image/png')` instead of
  `canvas.screenshot()`. That reliably produced an empty/near-empty
  Crossroads capture even once the scene graph had all its children
  loaded (confirmed via polling `worldRoot.children.length`) - suspected
  a headless-Chrome WebGL drawing-buffer timing quirk specific to
  `toDataURL`. `canvas.screenshot()` (Playwright's element screenshot,
  called only after the render loop is frozen so it doesn't hang waiting
  for "stability") does not have this problem and is what's checked in
  now. Don't switch back without re-verifying Crossroads specifically.

## Coordinate transform

The capture camera (`capture_topdown.mjs`) is a straight-down orthographic
camera:

```js
new THREE.OrthographicCamera(-BND-4, BND+4, BND+4, -BND-4, 1, 500)
camera.position.set(0, 300, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
```

With `up=(0,0,-1)` looking straight down the Y axis, world +X maps to
screen +X, and world +Z maps to screen +Y (down) - not the more intuitive
"+Z is up" you'd get with a different `up` vector. `build_reference_maps.py`'s
`world_to_px()` mirrors this exactly:

```python
half = bnd + 4
px = (x + half) / (2 * half) * img_size
py = (z + half) / (2 * half) * img_size
```

If a pin lands in the wrong spot on a new/edited map, check `BND` first
(see "Adding a new map" above) - a wrong `BND` scales and mis-centers
every pin on that map uniformly, which is usually what a "close but
offset" pin means.

## Files here

- `capture_topdown.mjs` - Playwright script, browser -> `raw/<mapId>.png`
- `build_reference_maps.py` - Pillow script, `raw/` + `public/index.html` -> `output/`
- `raw/` - committed raw top-down captures (source of truth for `output/`)
- `output/` - committed `gridmap_*.png` / `annotated_*.png`, what you'd
  actually open to mark something up
