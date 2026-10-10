#!/usr/bin/env node
// family-tree/tools/mirror.mjs — Session 2 step 1 (PLAN.md): download every 200 in cdx-best.json
// with the id_ flag (the original bytes, no toolbar) into data/mirror/<path as on the site>, and
// record each file in data/manifest.json. Read-only against archive.org, about one request a
// second, with backoff on 429 and 5xx. Run from the repo root after inventory.mjs:
//
//   node family-tree/tools/mirror.mjs                  # data in family-tree/data
//   node family-tree/tools/mirror.mjs --data ../x      # another data folder
//
// The mirror is immutable: a file already there is never overwritten, so a stopped run just
// starts again where it left off. A URL with no 200 gets a manifest row with path null (the gaps
// log); a 200 that turns out to be the Wayback Machine's own error page is "soft-404" and not
// kept; a download that fails after its retries is "fetch-<code>" and is tried again next run.
// The functions are exported for strays.mjs and mirror.test.mjs; the run is at the bottom.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOST, canonical, onSite, kindOf, waybackRaw, waybackView } from "./cdx.mjs";

export const USER_AGENT = "sidequests-family-tree mirror (read-only, one request a second)";
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Where a URL lives in the mirror, relative to data/mirror/: the path as on the site.
//   familytree.inggs.com/people/p12.htm → people/p12.htm
//   familytree.inggs.com/               → index.html   (and a folder → <folder>/index.html)
//   familytree.inggs.com/p.php?id=3     → p.php%3Fid%3D3
// Another host keeps to _hosts/<host>/. Characters a laptop's file system refuses are
// percent-encoded, so the same mirror works on a Mac, Windows or Linux.
export function localPath(url, host = HOST){
  const key = canonical(url);
  const mine = onSite(key, host);
  const slash = key.indexOf("/");
  const h = slash < 0 ? key : key.slice(0, slash);
  let rest = mine ? key.slice(host.length) || "/" : slash < 0 ? "/" : key.slice(slash);
  if (!rest.startsWith("/")) rest = "/" + rest;
  let query = "";
  const q = rest.indexOf("?");
  if (q >= 0){ query = rest.slice(q); rest = rest.slice(0, q); }
  if (rest.endsWith("/")) rest += "index.html";
  const safe = s => s.replace(/[<>:"\\|?*\x00-\x1f]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
  const segs = rest.split("/").filter(s => s && s !== "." && s !== "..").map(safe);
  if (query) segs[segs.length - 1] += encodeURIComponent(query);
  return (mine ? "" : `_hosts/${safe(h)}/`) + segs.join("/");
}

// Two URLs that differ only in case would share one file on a Mac's disk. The second one to
// claim a path gets "~2" (then "~3") before its extension. taken: Map of lower-cased path → key.
export function claimPath(p, key, taken){
  for (let n = 1; ; n++){
    const candidate = n === 1 ? p : p.replace(/(\.[^./]*)?$/, m => `~${n}${m}`);
    const owner = taken.get(candidate.toLowerCase());
    if (!owner || owner === key){ taken.set(candidate.toLowerCase(), key); return candidate; }
  }
}

// Is this "200" really the Wayback Machine apologising? An image URL that answers with HTML, or
// an HTML body that names the Wayback Machine alongside one of its error phrases (the site's
// own pages from 2010 have no reason to say either).
export function isSoft404(body, { url = "", mime = "", contentType = "" } = {}){
  const head = Buffer.from(body.subarray ? body.subarray(0, 4096) : body).toString("latin1");
  const looksHtml = /^\s*(<!doctype html|<html|<head|<body|<\?xml)/i.test(head) || /<html[\s>]/i.test(head);
  const wantImage = kindOf({ url, mime }) === "image" || /^image\//i.test(mime);
  if (wantImage) return looksHtml || /text\/html/i.test(contentType);
  const text = Buffer.from(body).toString("latin1");
  if (!/Wayback Machine/i.test(text)) return false;
  return /<title>[^<]*Wayback Machine[^<]*<\/title>/i.test(text) ||
    /(Hrm\.|has not archived that URL|This URL has been excluded|Got an HTTP \d{3} response at crawl time|Page cannot be (displayed|crawled)|snapshot cannot be displayed|is not available on the Wayback Machine)/i.test(text);
}

export const sha256 = buf => crypto.createHash("sha256").update(buf).digest("hex");

// One manifest row (PLAN.md, Session 2 step 1).
export function manifestRow(item, extra){
  return {
    path: null, url: item.url, timestamp: item.timestamp, status: item.status, mime: item.mime || null,
    bytes: null, sha256: null, wayback: waybackView(item.timestamp, item.url), raw: waybackRaw(item.timestamp, item.url),
    fetchedAt: null, kind: item.kind || kindOf(item), ...extra,
  };
}

// A GET with the inventory's manners: retries 429, 5xx and network errors, backing off 2s, 4s,
// 8s, 16s, 32s, 64s. Returns { status, body, contentType, finalUrl } or { status: "error", error }.
export async function politeGet(url, { fetchImpl = fetch, wait = sleep, log = () => {}, tries = 6 } = {}){
  for (let attempt = 0; ; attempt++){
    let res;
    try { res = await fetchImpl(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow" }); }
    catch (e){
      const code = e.cause && e.cause.code || e.message;
      if (attempt + 1 >= tries) return { status: "error", error: String(code) };
      log(`  network: ${code}; waiting ${2 * 2 ** attempt}s`);
      await wait(2000 * 2 ** attempt);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt + 1 < tries){
      log(`  ${res.status}; waiting ${2 * 2 ** attempt}s`);
      await wait(2000 * 2 ** attempt);
      continue;
    }
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body, contentType: res.headers.get("content-type") || "", finalUrl: res.url || url };
  }
}

export function readManifest(dataDir){
  const p = path.join(dataDir, "manifest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { rows: [] };
}
export function writeManifest(dataDir, manifest){
  manifest.rows.sort((a, b) => canonical(a.url).localeCompare(canonical(b.url)));
  manifest.updatedAt = new Date().toISOString();
  const p = path.join(dataDir, "manifest.json");
  fs.writeFileSync(p + ".part", JSON.stringify(manifest, null, 1));
  fs.renameSync(p + ".part", p);
}

// Bring the mirror up to date with a list of chosen captures (cdx-best.json's rows). Every item
// ends with exactly one manifest row. Skips what's already done; writes each file via a .part
// file so a stopped run never leaves half a file that would then be skipped for ever.
export async function mirrorAll(list, { dataDir, fetchImpl = fetch, wait = sleep, pause = 1100, log = console.error } = {}){
  const mirror = path.join(dataDir, "mirror");
  fs.mkdirSync(mirror, { recursive: true });
  const manifest = readManifest(dataDir);
  const byKey = new Map(manifest.rows.map(r => [canonical(r.url), r]));
  const taken = new Map();
  for (const r of manifest.rows) if (r.path) taken.set(r.path.toLowerCase(), canonical(r.url));
  const counts = { kept: 0, skipped: 0, gaps: 0, soft404: 0, failed: 0 };
  let fetched = 0, sinceSave = 0;
  const save = () => { writeManifest(dataDir, manifest); sinceSave = 0; };
  const put = row => {
    const key = canonical(row.url), old = byKey.get(key);
    if (old) Object.assign(old, row); else { manifest.rows.push(row); byKey.set(key, row); }
    if (++sinceSave >= 25) save();
  };

  for (const item of list){
    const key = canonical(item.url), old = byKey.get(key);
    if (item.status !== "200"){
      if (!old || !old.path) put(manifestRow(item, {}));
      counts.gaps++;
      continue;
    }
    // Done before: a file on disk, or a soft-404 (that answer won't change). A failed fetch is retried.
    if (old && old.path && fs.existsSync(path.join(mirror, old.path))){ counts.skipped++; continue; }
    if (old && old.status === "soft-404"){ counts.soft404++; continue; }
    const rel = claimPath(localPath(item.url), key, taken);
    const file = path.join(mirror, rel);
    if (fs.existsSync(file)){
      // On disk with no row (a run stopped between the file and the manifest): record it, never refetch.
      const buf = fs.readFileSync(file);
      put(manifestRow(item, { path: rel, bytes: buf.length, sha256: sha256(buf), fetchedAt: fs.statSync(file).mtime.toISOString() }));
      counts.skipped++;
      continue;
    }
    if (fetched++) await wait(pause);
    log(`${String(fetched).padStart(5)} ${key}`);
    const raw = waybackRaw(item.timestamp, item.url);
    const got = await politeGet(raw, { fetchImpl, wait, log });
    const at = new Date().toISOString();
    if (got.status !== 200){
      put(manifestRow(item, { status: `fetch-${got.status === "error" ? got.error : got.status}`, fetchedAt: at }));
      counts.failed++;
      continue;
    }
    if (isSoft404(got.body, { url: item.url, mime: item.mime, contentType: got.contentType })){
      put(manifestRow(item, { status: "soft-404", fetchedAt: at, bytes: got.body.length }));
      counts.soft404++;
      continue;
    }
    // A redirect inside the archive lands on a neighbouring capture: record the one we got.
    const ts = (String(got.finalUrl).match(/\/web\/(\d{14})id_\//) || [])[1] || item.timestamp;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".part", got.body);
    fs.renameSync(file + ".part", file);
    put(manifestRow({ ...item, timestamp: ts }, { path: rel, bytes: got.body.length, sha256: sha256(got.body), fetchedAt: at,
      mime: item.mime || got.contentType.split(";")[0] || null }));
    counts.kept++;
  }
  save();
  return { counts, manifest };
}

// The manifest in one line per measure (the recovery report's numbers).
export function summarise(manifest){
  const rows = manifest.rows, kept = rows.filter(r => r.path);
  const by = (list, f) => list.reduce((o, r) => (o[f(r)] = (o[f(r)] || 0) + 1, o), {});
  const fmt = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  const stamps = kept.map(r => r.timestamp).sort();
  const day = s => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "none";
  return [
    `Manifest: ${rows.length} URLs; ${kept.length} files kept, ${(kept.reduce((n, r) => n + (r.bytes || 0), 0) / 1048576).toFixed(1)} MB.`,
    `Kept by kind: ${fmt(by(kept, r => r.kind))}.`,
    `Not kept, by status: ${fmt(by(rows.filter(r => !r.path), r => r.status))}.`,
    `Kept captures from ${day(stamps[0])} to ${day(stamps[stamps.length - 1])}.`,
  ].join("\n");
}

// The run.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href){
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);
  const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const dataDir = path.resolve(flag("--data", path.join(here, "..", "data")));
  const bestPath = path.join(dataDir, "cdx-best.json");
  if (!fs.existsSync(bestPath)){ console.error(`No ${bestPath}: run inventory.mjs first.`); process.exit(1); }
  const list = JSON.parse(fs.readFileSync(bestPath, "utf8"));
  const { counts, manifest } = await mirrorAll(list, { dataDir, pause: Number(flag("--pause", 1100)) });
  console.log(`This run: ${counts.kept} downloaded, ${counts.skipped} already there, ${counts.gaps} with no 200, ${counts.soft404} soft-404, ${counts.failed} failed (run again to retry).`);
  console.log(summarise(manifest));
}
