#!/usr/bin/env node
// Captures a clean, straight-down orthographic render of every map registered
// in the game's MAPS object (public/index.html) - see ../README.md for the
// full pipeline this feeds into and why each step here exists.
//
// Requires: a local dev server already running (npm run dev -> localhost:8787
// by default) and Playwright with a Chromium build available. This repo
// doesn't declare Playwright as a dependency (it's a one-off dev tool, not
// something the game itself needs), so install it yourself first:
//   npm install -D playwright && npx playwright install chromium
//
// Usage:
//   node tools/minimaps/capture_topdown.mjs [baseUrl] [outDir]
//   node tools/minimaps/capture_topdown.mjs http://localhost:8787 tools/minimaps/raw

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] || 'http://localhost:8787';
const outDir = path.resolve(process.argv[3] || path.join(__dirname, 'raw'));
mkdirSync(outDir, { recursive: true });

// Explicit executablePath: the bare PLAYWRIGHT_BROWSERS_PATH lookup can
// resolve to a Chromium build where canvas.screenshot()'s "wait for
// stable" check on a live WebGL canvas hangs indefinitely; this pinned
// build (chromium-1194) is confirmed to resolve it immediately instead.
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1600 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(baseUrl, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('[data-act="new"]');
await page.waitForTimeout(300);
await page.click('[data-act="map:town"]'); // any real map id gets a script context started
await page.waitForTimeout(1500);

// public/index.html exposes window.__MAP_TOOLS__ (a small read-only hook,
// search for it near the bottom of the module script) specifically so this
// script can reach scene/renderer/etc. without them being on window itself -
// see ../README.md for why that hook exists and what's in it.
const mapIds = await page.evaluate(() => Object.keys(window.__MAP_TOOLS__?.MAPS || {}));
if (!mapIds.length) {
  console.error('Could not find window.__MAP_TOOLS__.MAPS - did that hook get removed from public/index.html?');
  console.error('See ../README.md "If capture_topdown.mjs breaks" for how to restore/patch it.');
  process.exit(1);
}

const results = [];

const canvas = page.locator('canvas').first();

for (const mapId of mapIds) {
  await page.evaluate((id) => window.__MAP_TOOLS__.startGame(id), mapId);
  // Most maps build their geometry synchronously inside startGame() and are
  // ready next frame, but Crossroads/Overpass stream 67-70 individual glTF
  // files in over the network (see placeTownAsset/placeFps2Asset in
  // public/index.html). Overpass alone (all 67 files, no shared atlas) needs
  // longer than a shared 3s budget reliably covers when it's one of several
  // maps captured back to back in the same session - bump per-map here if a
  // future map's async loading is heavier still and captures come up short.
  await page.waitForTimeout(mapId === 'overpass' ? 8000 : 3000);

  await page.evaluate(() => {
    window.__savedRAF = window.__savedRAF || window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0; // freeze the game's own render loop
    const hud = document.getElementById('hud');
    if (hud) { window.__hudDisplay = hud.style.display; hud.style.display = 'none'; }
    // Every map now shows a mandatory-minimum loading screen (public/index.html's
    // #loading overlay), which sits on top of the canvas and would otherwise get
    // captured instead of the map - it's driven by requestAnimationFrame too, so
    // freezing RAF above would leave it stuck on-screen forever rather than
    // hiding itself once loading finishes. Just force it hidden directly.
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('gone');
    document.querySelectorAll('#touch, #banner, #toast, #netbadge, #fps').forEach(el => {
      el.dataset.__prevDisplay = el.style.display; el.style.display = 'none';
    });
  });
  await page.waitForTimeout(150);

  // Render synchronously, then grab pixels via Playwright's element
  // screenshot on the canvas (NOT canvas.toDataURL() - that reliably came
  // back with Crossroads' streamed-in glTF buildings missing even though
  // the scene graph had all ~631 children by this point; suspected a
  // headless-Chrome WebGL buffer-timing quirk with toDataURL specifically).
  // With the render loop already frozen via requestAnimationFrame above,
  // the canvas isn't mutating anymore, so locator.screenshot()'s "wait for
  // stable" check resolves immediately instead of hanging.
  const { bnd } = await page.evaluate(() => {
    const T = window.__MAP_TOOLS__;
    const savedFog = T.scene.fog;
    T.scene.fog = null; // a straight-down shot from high above sits past the fog's far plane otherwise
    const boosted = [];
    T.scene.traverse(o => {
      if (o.isHemisphereLight || o.isDirectionalLight || o.isAmbientLight) {
        boosted.push([o, o.intensity]);
        o.intensity = Math.min(o.intensity * 2.2, 4);
      }
    });
    const cam = new T.THREE.OrthographicCamera(-T.BND - 4, T.BND + 4, T.BND + 4, -T.BND - 4, 1, 500);
    cam.position.set(0, 300, 0);
    cam.up.set(0, 0, -1); // world +X -> screen +X, world +Z -> screen +Y (down); see README's coordinate section
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    T.renderer.setClearColor(0x2a2a2a, 1);
    T.renderer.setViewport(0, 0, 1600, 1600);
    T.renderer.setScissorTest(false);
    T.renderer.clear();
    T.renderer.render(T.scene, cam);
    T.scene.fog = savedFog;
    for (const [o, v] of boosted) o.intensity = v;
    return { bnd: T.BND };
  });

  const outPath = path.join(outDir, `${mapId}.png`);
  await canvas.screenshot({ path: outPath });
  results.push({ mapId, bnd, outPath });
  console.log('captured', mapId, 'BND=', bnd, '->', outPath);

  await page.evaluate(() => {
    window.requestAnimationFrame = window.__savedRAF;
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = window.__hudDisplay || '';
    document.querySelectorAll('#touch, #banner, #toast, #netbadge, #fps').forEach(el => {
      el.style.display = el.dataset.__prevDisplay || '';
    });
  });
  await page.waitForTimeout(100);
}

if (errors.length) console.error('page errors during capture:', errors);
await browser.close();

console.log('\nWrote', results.length, 'raw captures to', outDir);
console.log('Next: python3 tools/minimaps/build_reference_maps.py');
