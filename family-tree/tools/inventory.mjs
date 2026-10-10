#!/usr/bin/env node
// family-tree/tools/inventory.mjs — Phase 1 steps 1 and 2 (BRIEF.md): ask the Wayback Machine's
// CDX index for every capture of familytree.inggs.com, save the answer, and print the shape of
// the site. Read-only against archive.org, about one request a second, with backoff on 429 and
// 5xx. Run from the repo root:
//
//   node family-tree/tools/inventory.mjs                 # writes family-tree/data/cdx.json and cdx-best.json
//   node family-tree/tools/inventory.mjs --data ../x     # another data folder (PLAN.md: data/ is the private repo)
//   node family-tree/tools/inventory.mjs --offline       # no fetch: re-analyse the saved cdx.json
//
// The cloud environment must allow web.archive.org (PLAN.md, Session 1 Handover); without it the
// fetch fails with a proxy 403 and this says so. The analysis is cdx.mjs, which has tests.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST, analyse, describe, parseCdx, pickBest, waybackRaw, waybackView } from "./cdx.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DATA = path.resolve(flag("--data", path.join(here, "..", "data")));
const OFFLINE = args.includes("--offline");
const PAUSE_MS = 1100;

const CDX = "https://web.archive.org/cdx/search/cdx";
const FIELDS = "timestamp,original,statuscode,mimetype,digest,length";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// One CDX page, with retries: 429 and 5xx back off 2s, 4s, 8s, 16s, 32s.
async function fetchPage(resumeKey){
  const url = new URL(CDX);
  url.searchParams.set("url", HOST + "/*");
  url.searchParams.set("output", "json");
  url.searchParams.set("fl", FIELDS);
  url.searchParams.set("showResumeKey", "true");
  url.searchParams.set("limit", "50000");
  if (resumeKey) url.searchParams.set("resumeKey", resumeKey);
  for (let attempt = 0; ; attempt++){
    let res;
    try { res = await fetch(url, { headers: { "user-agent": "sidequests-family-tree inventory (one request a second)" } }); }
    catch (e){
      if (attempt >= 5) throw e;
      console.error(`fetch failed (${e.cause && e.cause.code || e.message}); retrying`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5){
      console.error(`CDX answered ${res.status}; backing off`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`CDX answered ${res.status} ${res.statusText}` + (res.status === 403 ? " (a proxy 403 means this environment doesn't allow web.archive.org)" : ""));
  }
}

async function fetchAll(){
  const rows = [];
  let key = null, pages = 0;
  do {
    const text = await fetchPage(key);
    const parsed = parseCdx(text.trim() ? JSON.parse(text) : []);
    rows.push(...parsed.rows);
    key = parsed.resumeKey;
    pages++;
    console.error(`page ${pages}: ${parsed.rows.length} rows${key ? ", more to come" : ""}`);
    if (key) await sleep(PAUSE_MS);
  } while (key);
  return rows;
}

fs.mkdirSync(DATA, { recursive: true });
const cdxPath = path.join(DATA, "cdx.json"), bestPath = path.join(DATA, "cdx-best.json"), reportPath = path.join(DATA, "inventory.md");

let rows;
if (OFFLINE){
  if (!fs.existsSync(cdxPath)){ console.error(`No ${cdxPath} to analyse.`); process.exit(1); }
  rows = JSON.parse(fs.readFileSync(cdxPath, "utf8")).rows;
} else {
  rows = await fetchAll();
  fs.writeFileSync(cdxPath, JSON.stringify({ host: HOST, fetchedAt: new Date().toISOString(), rows }, null, 1));
  console.error(`saved ${rows.length} rows to ${cdxPath}`);
}

const best = pickBest(rows);
const list = [...best.entries()].map(([key, b]) => ({ key, ...b, raw: waybackRaw(b.timestamp, b.url), view: waybackView(b.timestamp, b.url) }))
  .sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(bestPath, JSON.stringify(list, null, 1));

const a = analyse(rows, best);
const report = [`# familytree.inggs.com — what the Wayback Machine holds`, ``, `Inventory run ${new Date().toISOString().slice(0, 10)} (\`tools/inventory.mjs\`).`, ``,
  describe(a), ``, `Best capture per URL: \`cdx-best.json\` (${list.length} URLs). Missing (no 200 anywhere):`, ``,
  ...list.filter(b => b.status !== "200").slice(0, 200).map(b => `- ${b.key} (${b.status}, ${b.captures} captures)`),
  list.filter(b => b.status !== "200").length > 200 ? `- …and more; see cdx-best.json` : ``].join("\n");
fs.writeFileSync(reportPath, report);
console.log(describe(a));
console.log(`\nWrote ${bestPath} and ${reportPath}.`);
