// Playwright, Chromium and a static server for the repo: what shared/smoke.mjs and the browser
// tests in this folder share. Nothing here runs under a bare `node --test`.
//
// Playwright is found as an installed package, or at PLAYWRIGHT=<path to playwright or
// playwright-core's index.mjs> for a copy installed elsewhere. Chromium is found the way
// .claude/skills/sidequest/make-icons.mjs finds it.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function loadPlaywright(){
  const tries = [process.env.PLAYWRIGHT, "playwright", "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    "/usr/lib/node_modules/playwright/index.mjs"].filter(Boolean);
  for (const t of tries){ try { return await import(t); } catch {} }
  return null;
}

export function findChromium(){
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

// Launch Chromium, or null (with the reason on stderr) when there's no Playwright or no browser.
export async function launch(){
  const pw = await loadPlaywright();
  if (!pw){ console.error("Playwright isn't available here, so the browser test didn't run."); return null; }
  try { return await pw.chromium.launch({ executablePath: findChromium() }); }
  catch (e){ console.error("Couldn't start Chromium: " + e.message); return null; }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// Serve `root` (default: this repo) on a free port. `extra` maps a URL path to a file elsewhere,
// e.g. { "/__seed/seed.json": "/somewhere/export.json" }.
export async function serve(root = ROOT, extra = {}){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/favicon.ico"){ res.writeHead(204).end(); return; }   // the browser asks; no app has one
    if (p.endsWith("/")) p += "index.html";
    const file = extra[p] || path.join(root, p);
    if (!extra[p] && !file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
