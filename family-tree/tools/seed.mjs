#!/usr/bin/env node
// family-tree/tools/seed.mjs — Session 3 step 3 (PLAN.md): the files the owner imports into the
// app (account sheet → Import), data/seed/family-tree-1.json, -2.json, …, in the app's export
// format (SPEC.md §4), each under 20 MB. The first carries meta, people, photos (with ~400px
// thumbs) and stories; the rest carry images (1400px long edge) in chunks. Run after parse.mjs,
// stories.mjs and wikitree.mjs, from the repo root:
//
//   PLAYWRIGHT=…/playwright-core/index.mjs node family-tree/tools/seed.mjs [--data ../x]
//
// Images are shrunk and re-encoded as JPEG by Chromium (shared/proofs/pw.mjs, as make-icons.mjs
// does): no native dependency. Without a browser the photos go in without thumbs or images and
// the run says so.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CREDIT } from "./gedcom.mjs";

export const APP = "family-tree";
export const LIMIT = 19 * 1024 * 1024;   // under the 20 MB the spec promises, with room for JSON's overhead
const DOC_LIMIT = 900 * 1024;            // a Firestore document is at most 1 MiB

// A story as its Firestore document: its Markdown with the mirror's images as photo:<id> and
// links to other stories as story:<id>, so the app needs neither the mirror nor the files.
export function storyDoc(row, markdown, photoByFile){
  const md = String(markdown || "")
    .replace(/\]\(\.\.\/mirror\/([^)\s]+)\)/g, (m, f) => { const id = photoByFile.get(decodeURIComponent(f)); return id ? `](photo:${id})` : m; })
    .replace(/\]\(([a-z0-9-]+)\.md\)/g, "](story:$1)");
  const { file, ...rest } = row;
  return { ...rest, markdown: md, ...(row.pdf ? { pdf: true } : {}) };
}

// Split everything into files under the limit: the first with meta, people, photos and stories,
// then images, as many to a file as fit. → [{ app, seed: { part, of }, … }]
export function seedFiles({ meta, people, photos, stories, images }, limit = LIMIT){
  // meta travels as { main: … }, like every other collection, so one loader reads them all.
  const head = { app: APP, seed: { part: 1, of: 1 }, exportedAt: new Date().toISOString(), meta: { main: meta }, people, photos, stories };
  if (Buffer.byteLength(JSON.stringify(head)) > limit) throw new Error("people, photos and stories alone pass the limit");
  const files = [head];
  let cur = null, size = 0;
  for (const img of images){
    const n = Buffer.byteLength(JSON.stringify(img)) + 1;
    if (!cur || size + n > limit){ cur = { app: APP, seed: { part: 0, of: 0 }, images: [] }; files.push(cur); size = 200; }
    cur.images.push(img);
    size += n;
  }
  files.forEach((f, i) => { f.seed = { part: i + 1, of: files.length }; });
  return files;
}

// Chromium draws each image at two sizes and hands back JPEG data URLs.
async function shrinkAll(items, log){
  const { launch } = await import("../../shared/proofs/pw.mjs");
  const browser = await launch();
  if (!browser) return null;
  const page = await browser.newPage();
  const out = new Map();
  for (const it of items){
    const src = `data:${it.mime};base64,${fs.readFileSync(it.path).toString("base64")}`;
    const r = await page.evaluate(async ({ src, limit }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const draw = (edge, q) => {
        const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // a GIF's transparency on white, as the page showed it
        g.drawImage(img, 0, 0, c.width, c.height);
        return { data: c.toDataURL("image/jpeg", q), w: c.width, h: c.height };
      };
      let big, q = 0.85;
      do { big = draw(1400, q); q -= 0.1; } while (big.data.length > limit && q > 0.3);
      return { thumb: draw(400, 0.8).data, big: big.data, w: img.naturalWidth, h: img.naturalHeight };
    }, { src, limit: DOC_LIMIT });
    out.set(it.id, r);
    log(`  ${it.id}: ${r.w}×${r.h}, thumb ${Math.round(r.thumb.length / 1024)} KB, image ${Math.round(r.big.length / 1024)} KB`);
  }
  await browser.close();
  return out;
}

export async function run(dataDir, { log = console.error } = {}){
  const read = f => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  const people = read("people.json"), photos = read("photos.json"), rows = fs.existsSync(path.join(dataDir, "stories.json")) ? read("stories.json") : [];
  const manifest = read("manifest.json");
  const mirror = path.join(dataDir, "mirror");
  const onDisk = f => [f, encodeURI(f)].map(x => path.join(mirror, x)).find(x => fs.existsSync(x));
  const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", png: "image/png" };
  const items = photos.filter(p => p.recovered && onDisk(p.file)).map(p => ({ id: p.id, path: onDisk(p.file), mime: MIME[p.file.split(".").pop().toLowerCase()] || "image/jpeg" }));
  const shrunk = items.length ? await shrinkAll(items, log) : new Map();
  if (!shrunk) log("No browser here: photos go in without thumbs or images. Set PLAYWRIGHT (PLAN.md, Ground rules) and run again.");
  const photoDocs = photos.map(p => ({ ...p, thumb: shrunk?.get(p.id)?.thumb || "" }));
  const images = shrunk ? [...shrunk].map(([id, r]) => ({ id, data: r.big })) : [];
  const photoByFile = new Map(photos.map(p => [p.file, p.id]));
  const stories = rows.map(r => storyDoc(r, r.pdf ? "" : fs.readFileSync(path.join(dataDir, r.file), "utf8"), photoByFile));
  const captured = Math.max(...people.map(p => p.source?.captured || 0));
  const meta = {
    source: "familytree.inggs.com", credit: CREDIT, researcher: "Jon Inggs", captured,
    people: people.length, photos: photos.length, photosRecovered: photos.filter(p => p.recovered).length, stories: stories.length,
    version: new Date().toISOString().slice(0, 10), mirrorFiles: (manifest.rows || []).filter(r => r.path).length,
  };
  const files = seedFiles({ meta, people, photos: photoDocs, stories, images });
  const dir = path.join(dataDir, "seed");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^family-tree-\d+\.json$/.test(f)) fs.rmSync(path.join(dir, f));
  files.forEach((f, i) => fs.writeFileSync(path.join(dir, `family-tree-${i + 1}.json`), JSON.stringify(f)));
  return files.map((f, i) => ({ file: `seed/family-tree-${i + 1}.json`, bytes: Buffer.byteLength(JSON.stringify(f)), people: f.people?.length || 0, photos: f.photos?.length || 0, stories: f.stories?.length || 0, images: f.images?.length || 0 }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  run(dataDir).then(fs => { for (const f of fs) console.log(`${f.file}: ${(f.bytes / 1048576).toFixed(2)} MB — ${f.people} people, ${f.photos} photos, ${f.stories} stories, ${f.images} images`); });
}
