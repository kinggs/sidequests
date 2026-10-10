#!/usr/bin/env node
// family-tree/tools/strays.mjs — Session 2 step 2 (PLAN.md): find what the mirror's pages link to
// that the inventory never listed, ask the CDX about each one exactly, and fetch the hits with
// mirror.mjs's code. Repeats until a pass finds nothing new. Run from the repo root after
// mirror.mjs:
//
//   node family-tree/tools/strays.mjs                  # data in family-tree/data
//   node family-tree/tools/strays.mjs --data ../x
//
// Every lookup is remembered in data/strays.json, so a stopped run doesn't ask twice. A hit is
// appended to cdx.json (its rows) and cdx-best.json (its best capture); a URL the CDX has never
// seen is a manifest row with status "never-captured". Link extraction is pure and tested
// (strays.test.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOST, canonical, onSite, parseCdx, pickBest, waybackRaw, waybackView } from "./cdx.mjs";
import { manifestRow, mirrorAll, politeGet, readManifest, sleep, summarise, writeManifest } from "./mirror.mjs";

// Every reference in a page: href, src, background, lowsrc, data and action attributes, CSS
// url(), and quoted file names inside scripts and on* handlers (window.open('p12.htm') was how
// sites of that era opened a photo). Returns the raw strings, in order, duplicates removed.
export function extractRefs(html){
  const out = new Set();
  const add = s => { s = String(s).trim().replace(/&amp;/gi, "&"); if (s) out.add(s); };
  const attr = /\b(?:href|src|background|lowsrc|data|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
  for (const m of html.matchAll(attr)) add(m[1] ?? m[2] ?? m[3]);
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) add(m[1] ?? m[2] ?? m[3]);
  const quoted = /["']([^"'\s<>()]+\.(?:html?|php|asp|jpe?g|gif|png|bmp|tiff?|pdf|ged|css|js))(?:[?#][^"'\s<>]*)?["']/gi;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1])
    .concat([...html.matchAll(/\bon[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi)].map(m => m[1].slice(1, -1)));
  for (const s of scripts) for (const m of s.matchAll(quoted)) add(m[0].slice(1, -1));
  return [...out];
}

// The references resolved against the page's own URL, canonicalised, fragments dropped, and only
// those on the given host kept (www. and http/https fold together, as in cdx.canonical).
// A scheme with too few or backward slashes is read as the host it meant (Jon wrote
// "http:\familytree.inggs.com"; a browser would take that as a path).
export function onSiteRefs(refs, pageUrl, host = HOST){
  const out = new Set();
  for (const r of refs){
    if (/^(mailto|javascript|data|tel|about|ftp|news):/i.test(r) || r.startsWith("#")) continue;
    let u;
    const fixed = r.replace(/^(https?):[\\/]*(?=[^\\/])/i, "$1://");   // http:\host, http:/host → http://host
    try { u = new URL(fixed, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    const key = canonical(u.href);
    if (onSite(key, host)) out.add(key);
  }
  return [...out];
}

// The strays of one pass: on-site references from the given pages that aren't known yet.
// pages: [{ url, html }]; known: a Set of canonical keys (cdx-best's keys plus past lookups).
export function findStrays(pages, known, host = HOST){
  const found = new Map();                       // key → the first page that linked to it
  for (const p of pages) for (const key of onSiteRefs(extractRefs(p.html), p.url, host))
    if (!known.has(key) && !found.has(key)) found.set(key, canonical(p.url));
  return found;
}

// The run.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href){
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const dataDir = path.resolve(flag("--data", path.join(here, "..", "data")));
  const pause = Number(flag("--pause", 1100));
  const file = name => path.join(dataDir, name);
  const readJson = (name, dflt) => fs.existsSync(file(name)) ? JSON.parse(fs.readFileSync(file(name), "utf8")) : dflt;
  if (!fs.existsSync(file("cdx-best.json"))){ console.error("No cdx-best.json: run inventory.mjs and mirror.mjs first."); process.exit(1); }

  const log = readJson("strays.json", { lookups: {} });     // key → { from, captures, at }
  const saveLog = () => fs.writeFileSync(file("strays.json"), JSON.stringify(log, null, 1));
  const FIELDS = "timestamp,original,statuscode,mimetype,digest,length";

  for (let pass = 1; ; pass++){
    const best = readJson("cdx-best.json", []);
    const known = new Set([...best.map(b => b.key), ...Object.keys(log.lookups)]);
    const manifest = readManifest(dataDir);
    const pages = manifest.rows.filter(r => r.path && r.kind === "page")
      .map(r => ({ url: r.url, html: fs.readFileSync(path.join(dataDir, "mirror", r.path)).toString("latin1") }));
    const strays = findStrays(pages, known);
    console.log(`Pass ${pass}: ${pages.length} pages read, ${strays.size} links not in the inventory.`);
    if (!strays.size) break;

    const hits = [];
    let n = 0;
    for (const [key, from] of strays){
      if (n++) await sleep(pause);
      const q = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(key)}&output=json&fl=${FIELDS}`;
      const got = await politeGet(q, { log: console.error });
      if (got.status !== 200){ console.error(`  ${key}: CDX ${got.status === "error" ? got.error : got.status}; next run tries again`); continue; }
      const text = got.body.toString("utf8").trim();
      const { rows } = parseCdx(text ? JSON.parse(text) : []);
      log.lookups[key] = { from, captures: rows.length, at: new Date().toISOString() };
      console.error(`  ${key}: ${rows.length} captures`);
      if (rows.length) hits.push(...rows);
      else {
        const m = readManifest(dataDir);
        if (!m.rows.some(r => canonical(r.url) === key))
          m.rows.push({ ...manifestRow({ url: "http://" + key, timestamp: null, status: "never-captured" }, {}), wayback: null, raw: null, from });
        writeManifest(dataDir, m);
      }
      saveLog();
    }
    if (!hits.length) continue;           // only misses: the next pass reads the same pages and stops

    // The hits join the inventory: their rows into cdx.json, their best capture into cdx-best.json.
    const cdx = readJson("cdx.json", { rows: [] });
    cdx.rows.push(...hits);
    cdx.strays = (cdx.strays || 0) + hits.length;
    fs.writeFileSync(file("cdx.json"), JSON.stringify(cdx, null, 1));
    const fresh = [...pickBest(hits).entries()].map(([key, b]) => ({ key, ...b, raw: waybackRaw(b.timestamp, b.url), view: waybackView(b.timestamp, b.url), stray: true }));
    const merged = best.filter(b => !fresh.some(f => f.key === b.key)).concat(fresh).sort((a, b) => a.key.localeCompare(b.key));
    fs.writeFileSync(file("cdx-best.json"), JSON.stringify(merged, null, 1));
    console.log(`  ${fresh.length} new URLs from the CDX; fetching them.`);
    await mirrorAll(fresh, { dataDir, pause });
  }
  console.log(summarise(readManifest(dataDir)));
}
