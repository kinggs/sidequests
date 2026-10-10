#!/usr/bin/env node
// family-tree/tools/recover.mjs — Session 2 steps 0 to 2 (PLAN.md) in one command, for a machine
// that can reach web.archive.org (the cloud can't: the archive resets its connection). From the
// sidequests folder, with the data repo cloned into family-tree/data:
//
//   node family-tree/tools/recover.mjs
//
// It runs, in order, each skipped if it's already done: the inventory of familytree.inggs.com,
// the inventories of inggs.com and *.inggs.com (looked at, not mirrored), the home page's
// captures and a copy of the latest one into data/checks/ (is April 2010 the site or a holding
// page?), the mirror, and the strays. Stopping it is safe: run it again and it carries on. Then
// commit and push family-tree/data. Needs Node 18 or later; takes about a second per file.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOST, TARGET, canonical, waybackRaw } from "./cdx.mjs";
import { politeGet } from "./mirror.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const dataDir = path.resolve(flag("--data", path.join(here, "..", "data")));
const run = (script, ...extra) => runIf(true, script, ...extra);
const runIf = (mustWork, script, ...extra) => {
  console.log(`\n=== ${script} ${extra.join(" ")}`);
  const r = spawnSync(process.execPath, [...process.execArgv, path.join(here, script), "--data", dataDir, ...extra], { stdio: "inherit" });
  if (r.status !== 0 && !mustWork) console.error(`${script} failed (exit ${r.status}); carrying on without it.`);
  else if (r.status !== 0){ console.error(`${script} stopped (exit ${r.status}). Run recover.mjs again to carry on.`); process.exit(r.status || 1); }
};

if (!fs.existsSync(dataDir)){ console.error(`No ${dataDir}: clone the data repo there first (PLAN.md, Session 2).`); process.exit(1); }

// 0. The inventories.
if (!fs.existsSync(path.join(dataDir, "cdx.json"))) run("inventory.mjs");
for (const [host, dir] of [["inggs.com", "inggs.com"], ["*.inggs.com", "all.inggs.com"]])
  if (!fs.existsSync(path.join(dataDir, "hosts", dir, "cdx.json"))) runIf(false, "inventory.mjs", "--host", host);

// 0b. The home page: every capture, and the latest 200 kept beside the target's for comparison.
const rows = JSON.parse(fs.readFileSync(path.join(dataDir, "cdx.json"), "utf8")).rows;
const home = rows.filter(r => canonical(r.url) === HOST + "/").sort((a, b) => a.timestamp.localeCompare(b.timestamp));
console.log(`\n=== The home page: ${home.length} captures`);
for (const r of home) console.log(`${r.timestamp} ${r.status} ${r.mime} ${r.length} bytes ${r.digest}`);
const latest = home.filter(r => r.status === "200").pop();
const checks = path.join(dataDir, "checks");
fs.mkdirSync(checks, { recursive: true });
for (const r of [home.find(r => r.timestamp === TARGET), latest].filter(Boolean)){
  const out = path.join(checks, `home-${r.timestamp}.html`);
  if (fs.existsSync(out)) continue;
  const got = await politeGet(waybackRaw(r.timestamp, r.url));
  if (got.status === 200) fs.writeFileSync(out, got.body);
  console.log(`home page at ${r.timestamp}: ${got.status}${got.status === 200 ? ` → checks/${path.basename(out)}` : ""}`);
  await new Promise(res => setTimeout(res, 1100));
}

// 1 and 2. The mirror and the strays (both resumable).
run("mirror.mjs");
run("strays.mjs");
console.log(`\nDone. Now: cd family-tree/data && git add -A && git commit -m "Recovery run" && git push`);
