// Open every app in a headless browser and fail on any page error or console.error.
//
//   node shared/smoke.mjs              every app
//   node shared/smoke.mjs rack-it      just these
//
// Each app is opened four times in a fresh browser profile, served from this repo:
//   ?mock=reset             wipe the fake data
//   ?mock                   the default fake user, the owner
//   ?mock&as=stranger       signed in but not on /members, which is what an outsider is
//   ?mock&signedout         nobody signed in: an app with cloud.js must show Sign in
// One line an app. Exits 0 when all pass, 1 when one fails, 2 when there's no Playwright
// (found by shared/proofs/pw.mjs; set PLAYWRIGHT=<path to playwright or playwright-core's
// index.mjs> to point at one elsewhere).

import fs from "node:fs";
import path from "node:path";
import { ROOT, launch, serve } from "./proofs/pw.mjs";

const SETTLE_MS = 1500;   // after load: cloud.init, people and the first watchers

// Every top-level folder with an index.html, except shared/ and _template/.
const apps = (process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(ROOT))
  .filter(d => !d.startsWith(".") && !d.startsWith("_") && d !== "shared")
  .filter(d => fs.existsSync(path.join(ROOT, d, "index.html")))
  .sort();

const browser = await launch();
if (!browser) process.exit(2);
const server = await serve();
const base = server.base;

const RUNS = [["reset", "?mock=reset"], ["owner", "?mock"], ["stranger", "?mock&as=stranger"], ["signed out", "?mock&as=&signedout"]];
let failed = 0;
const width = Math.max(...apps.map(a => a.length));

const usesCloud = app => fs.readFileSync(path.join(ROOT, app, "index.html"), "utf8").includes("shared/cloud.js");

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
      if (name === "signed out" && usesCloud(app) && !(await page.locator("button:visible", { hasText: /sign in/i }).count()))
        problems.push(`${run}: no Sign in on screen`);
    } catch (e){
      problems.push(`${run}: ${e.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
  if (problems.length) failed++;
  const unique = [...new Set(problems)];
  console.log(`${unique.length ? "FAIL" : "ok  "}  ${app.padEnd(width)}  ${unique.length ? unique.join(" | ") : "owner, stranger, signed out"}`);
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} of ${apps.length} apps failed.` : `\nAll ${apps.length} apps passed.`);
process.exit(failed ? 1 : 0);
