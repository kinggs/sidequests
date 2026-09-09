// Turn an app's icon.svg into the PNGs Chrome needs to install it as a real app.
//
//   node .claude/skills/sidequest/make-icons.mjs <app-id>
//
// Writes icon-192.png, icon-512.png and icon-maskable-512.png next to the app's icon.svg.
// The PNGs are committed like any other file — this is a one-off drawing tool, not a build
// step, and nothing at runtime depends on it.
//
// It renders the SVG in headless Chromium (already installed in cloud sessions). If neither
// Playwright nor Chromium is around, it says so and exits 2: the app still works, it just
// installs as a shortcut with a URL bar until someone runs this.
//
// The maskable icon is the same artwork on a solid square, scaled into the middle 80% so
// Android can crop it to a circle, a squircle or anything else without clipping the design.

import fs from "node:fs";
import path from "node:path";

const appId = process.argv[2];
if (!appId){ console.error("usage: node make-icons.mjs <app-id>"); process.exit(1); }

const dir = path.resolve(appId);
const svgPath = path.join(dir, "icon.svg");
if (!fs.existsSync(svgPath)){ console.error("No icon.svg in " + dir); process.exit(1); }
const svg = fs.readFileSync(svgPath, "utf8");

// The background the maskable icon bleeds to the edges — the app's panel colour if the
// SVG opens with a filled rect, else the manifest's background_color.
let bg = "#101418";
const manifestPath = path.join(dir, "manifest.json");
if (fs.existsSync(manifestPath)){
  try { bg = JSON.parse(fs.readFileSync(manifestPath, "utf8")).background_color || bg; } catch {}
}
const rectFill = svg.match(/<rect[^>]*fill="([^"]+)"/);
if (rectFill) bg = rectFill[1];

async function loadPlaywright(){
  const tries = ["playwright", "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    "/usr/lib/node_modules/playwright/index.mjs"];
  for (const t of tries){ try { return await import(t); } catch {} }
  return null;
}

function findChromium(){
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers",
    path.join(process.env.HOME || "", ".cache/ms-playwright")].filter(Boolean);
  for (const root of roots){
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)){
      if (!name.startsWith("chromium")) continue;
      for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]){
        const p = path.join(root, name, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // let Playwright find its own
}

const pw = await loadPlaywright();
if (!pw){
  console.error("Playwright isn't available here, so the PNGs weren't made.");
  console.error("The app still runs; it just installs as a shortcut until someone runs this.");
  process.exit(2);
}

let browser;
try {
  browser = await pw.chromium.launch({ executablePath: findChromium() });
} catch (e){
  console.error("Couldn't start Chromium: " + e.message);
  process.exit(2);
}

async function shot(file, size, html){
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}
    .wrap{display:block;width:${size}px;height:${size}px}</style>${html}`);
  await page.screenshot({ path: path.join(dir, file), omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log("wrote " + path.join(appId, file));
}

const sized = n => svg.replace("<svg ", `<svg class="wrap" style="display:block;width:${n}px;height:${n}px" `);
await shot("icon-192.png", 192, sized(192));
await shot("icon-512.png", 512, sized(512));

// 410 of 512 is the 80% safe zone every maskable shape is guaranteed to keep.
const artwork = svg.replace(/<rect[^>]*\/>/, "")
  .replace("<svg ", `<svg style="display:block;width:410px;height:410px" `);
await shot("icon-maskable-512.png", 512,
  `<div class="wrap" style="background:${bg};display:flex;align-items:center;justify-content:center">
     <div style="width:410px;height:410px">${artwork}</div></div>`);

await browser.close();
