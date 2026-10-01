// Open every app in a headless browser and fail on any page error or console.error.
//
//   node shared/smoke.mjs              every app
//   node shared/smoke.mjs rack-it      just these
//
// Each app is opened three times in a fresh browser profile, served from this repo:
//   ?mock=reset             wipe the fake data
//   ?mock                   the default fake user, the owner
//   ?mock&as=stranger       signed in but not on /members, which is what an outsider is
// One line an app. Exits 0 when all pass, 1 when one fails, 2 when there's no Playwright
// (Chromium is found the way .claude/skills/sidequest/make-icons.mjs finds it; set
// PLAYWRIGHT=<path to playwright or playwright-core's index.mjs> to point at one elsewhere).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTLE_MS = 1500;   // after load: cloud.init, people and the first watchers

async function loadPlaywright(){
  const tries = [process.env.PLAYWRIGHT, "playwright", "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    "/usr/lib/node_modules/playwright/index.mjs"].filter(Boolean);
  for (const t of tries){ try { return await import(t); } catch {} }
  return null;
}

function findChromium(){
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers",
    path.join(process.env.HOME || "", ".cache/ms-playwright")].filter(Boolean);
  for (const root of roots){
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).sort().reverse()){
      if (!/^chromium-\d/.test(name)) continue;
      for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]){
        const p = path.join(root, name, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // let Playwright find its own
}

// Every top-level folder with an index.html, except shared/ and _template/.
const apps = (process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(ROOT))
  .filter(d => !d.startsWith(".") && !d.startsWith("_") && d !== "shared")
  .filter(d => fs.existsSync(path.join(ROOT, d, "index.html")))
  .sort();

const pw = await loadPlaywright();
if (!pw){
  console.error("Playwright isn't available here, so the smoke test didn't run.");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/favicon.ico"){ res.writeHead(204).end(); return; }   // the browser asks; no app has one
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await pw.chromium.launch({ executablePath: findChromium() });
} catch (e){
  console.error("Couldn't start Chromium: " + e.message);
  server.close();
  process.exit(2);
}

const RUNS = [["reset", "?mock=reset"], ["owner", "?mock"], ["stranger", "?mock&as=stranger"]];
let failed = 0;
const width = Math.max(...apps.map(a => a.length));

for (const app of apps){
  // One profile per app: the fake cloud lives in localStorage, so apps can't leak into each other.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const problems = [];
  let run = "";
  page.on("pageerror", e => problems.push(`${run}: ${e.message.split("\n")[0]}`));
  page.on("console", m => {
    if (m.type() !== "error") return;
    const where = /^Failed to load resource/.test(m.text()) ? " " + m.location().url.replace(base, "") : "";
    problems.push(`${run}: console.error ${m.text().split("\n")[0]}${where}`);
  });
  for (const [name, query] of RUNS){
    run = name;
    try {
      await page.goto(`${base}/${app}/${query}`, { waitUntil: "load", timeout: 15000 });
      await page.waitForTimeout(SETTLE_MS);
    } catch (e){
      problems.push(`${run}: ${e.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
  if (problems.length) failed++;
  const unique = [...new Set(problems)];
  console.log(`${unique.length ? "FAIL" : "ok  "}  ${app.padEnd(width)}  ${unique.length ? unique.join(" | ") : "owner, stranger"}`);
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} of ${apps.length} apps failed.` : `\nAll ${apps.length} apps passed.`);
process.exit(failed ? 1 : 0);
