#!/usr/bin/env node
// family-tree/tools/stories.mjs — Session 3 step 1b (PLAN.md): Jon's family-history pages as
// clean Markdown, his words verbatim, images in place by their mirror path, each headed with the
// title, the Wayback source and the capture date. Writes data/stories/<id>.md, data/stories.json
// and the stories part of data/parse-report.md. Run after parse.mjs (it reads people.json and
// photos.json), from the repo root:
//
//   node family-tree/tools/stories.mjs [--data ../x]
//
// The converter (htmlToMarkdown) is pure and knows the little HTML Jon's pages use: headings,
// paragraphs, line breaks, bold and italics, links, images, definition lists (his quotations)
// and tables: a table of words becomes a Markdown table, a table that only lays out photos and
// captions becomes its cells in order. The 1916 PDF is listed with its title, not converted.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STORY_PAGES, entities, findPeople, pageImages, slug, sources, text, writeSection } from "./parse.mjs";

// The Excel-made page declares windows-1252; the rest declare nothing and are ASCII or Latin-1,
// which windows-1252 reads the same apart from its curly quotes and dashes.
export const decode1252 = buf => Buffer.isBuffer(buf) ? new TextDecoder("windows-1252").decode(buf) : String(buf);

const BLOCK = new Set(["p", "div", "center", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr", "td", "th", "li", "ul", "ol", "dl", "dt", "dd", "blockquote", "pre", "body", "form"]);

// Emphasis is written as markers while reading (B and I, open and close) and made Markdown here:
// spaces moved outside it ("**Ing **" isn't Markdown, "**Ing** " is) and empty pairs dropped.
const B1 = "\u0003", B2 = "\u0004", I1 = "\u0005", I2 = "\u0006";
const tidyInline = s => {
  for (let i = 0; i < 3; i++) s = s
    .replace(/([\u0003\u0005])(\s+)/g, "$2$1").replace(/(\s+)([\u0004\u0006])/g, "$2$1")
    .replace(/\u0003\u0004|\u0005\u0006/g, "");
  return s.replace(/[\u0003\u0004]/g, "**").replace(/[\u0005\u0006]/g, "*").replace(/[ \t]+/g, " ");
};

// HTML → Markdown. opts.link(href) → a URL for the Markdown link, or null for the words alone.
// opts.image(src, alt) → { path, caption } for an image, or null to leave it out. The caption is
// the image's own ALT text: a caption Jon wrote beside it is already in the words that follow.
export function htmlToMarkdown(html, { link = h => h, image = (src, alt) => ({ path: src, caption: alt }) } = {}){
  html = decode1252(html)
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<![^>]*>/g, "")
    .replace(/<(script|style|head|xml|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/?o:p>/gi, "");
  const root = { blocks: [], buf: "" };
  const sinks = [root], tables = [];
  let heading = 0, quote = 0, pre = 0;
  const sink = () => sinks[sinks.length - 1];
  const emit = block => { if (block) sink().blocks.push(quote ? block.split("\n").map(l => "> " + l).join("\n") : block); };
  const flush = () => {
    const s = sink();
    const raw = s.buf; s.buf = "";
    const lines = raw.split("\u0001").map(l => tidyInline(l).trim());
    const paras = [];
    let cur = [];
    for (const l of lines){ if (l) cur.push(l); else if (cur.length){ paras.push(cur); cur = []; } }
    if (cur.length) paras.push(cur);
    for (const p of paras){
      const body = p.join("  \n");
      emit(heading ? "#".repeat(heading) + " " + p.join(" ") : body);
    }
  };
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9:]*)([^>]*)>|([^<]+)/gi)){
    if (m[4] != null){
      const t = entities(m[4]);
      sink().buf += pre ? t.replace(/\r?\n/g, "\u0001") : t.replace(/\s+/g, " ");
      continue;
    }
    const close = m[1] === "/", tag = m[2].toLowerCase(), attrs = m[3];
    if (tag === "br"){ sink().buf += "\u0001"; continue; }
    if (tag === "hr"){ flush(); emit("---"); continue; }
    if (tag === "b" || tag === "strong"){ sink().buf += close ? B2 : B1; continue; }
    if (tag === "i" || tag === "em"){ sink().buf += close ? I2 : I1; continue; }
    if (tag === "a"){
      if (!close){
        const href = (attrs.match(/HREF\s*=\s*"?([^">\s]+)/i) || [])[1];
        const to = href ? link(href) : null;
        sink().buf += to ? "\u0002" : "";
        sink().pending = [...(sink().pending || []), to];
      } else {
        const to = (sink().pending || []).pop();
        if (to){
          const s = sink(), at = s.buf.lastIndexOf("\u0002");
          const words = tidyInline(s.buf.slice(at + 1)).replace(/\s+/g, " ").trim();
          s.buf = s.buf.slice(0, at) + (words ? `[${words}](${to.replace(/ /g, "%20")})` : "");
        }
      }
      continue;
    }
    if (tag === "img"){
      const src = (attrs.match(/SRC\s*=\s*"?([^">\s]+)/i) || [])[1];
      const alt = (attrs.match(/ALT\s*=\s*"([^"]*)"/i) || [])[1] || "";
      const img = src && image(src, text(alt).replace(/^\[\s*/, "").replace(/\s*\]$/, ""));
      if (img){ flush(); emit(`![${img.caption.replace(/[[\]]/g, "")}](${img.path.replace(/ /g, "%20")})`); }
      continue;
    }
    if (!BLOCK.has(tag)) continue;
    if (/^h[1-6]$/.test(tag)){ flush(); heading = close ? 0 : Math.min(6, Number(tag[1]) + 1); continue; }   // the page's own h1 sits under the story's title
    if (tag === "pre"){ flush(); pre += close ? -1 : 1; continue; }
    if (tag === "dd" || tag === "blockquote"){ flush(); quote = close ? Math.max(0, quote - 1) : quote + 1; continue; }
    if (tag === "dl" && close){ flush(); quote = 0; continue; }
    if (tag === "li" && !close){ flush(); sink().buf += "- "; continue; }
    if (tag === "table"){
      flush();
      if (!close) tables.push({ rows: [], images: false });
      else if (tables.length){
        const t = tables.pop();
        // A table of words (a register, three columns or more, or two of short entries) stays a
        // table; one that lays out photos or paragraphs becomes its cells in order. Empty rows
        // and columns go.
        const cells = t.rows.flat();
        const words = c => c.blocks.join(" ").replace(/\s+/g, " ").trim();
        let rows = t.rows.filter(r => r.some(c => words(c)));
        const width = Math.max(0, ...rows.map(r => r.length));
        rows = rows.map(r => [...r, ...Array.from({ length: width - r.length }, () => ({ blocks: [] }))]);
        const keep = [...Array(width).keys()].filter(i => rows.some(r => words(r[i])));
        const multi = cells.filter(c => c.blocks.length > 1 || c.blocks.some(b => b.includes("\n"))).length;
        const prose = cells.some(c => words(c).length > 160) || multi > cells.length / 10;
        if (!t.images && rows.length > 1 && (keep.length > 2 || (keep.length === 2 && !prose))){
          rows = rows.map(r => "| " + keep.map(i => words(r[i]).replace(/\|/g, "\\|")).join(" | ") + " |");
          rows.splice(1, 0, "|" + " --- |".repeat(keep.length));
          emit(rows.join("\n"));
        } else for (const c of cells) for (const b of c.blocks) emit(b);
      }
      continue;
    }
    if (tag === "tr" && tables.length && !close){ tables[tables.length - 1].rows.push([]); continue; }
    if ((tag === "td" || tag === "th") && tables.length){
      const t = tables[tables.length - 1];
      if (!close){
        flush();
        if (!t.rows.length) t.rows.push([]);
        const cell = { blocks: [], buf: "" };
        const span = Math.min(50, Number((attrs.match(/COLSPAN\s*=\s*"?(\d+)/i) || [])[1]) || 1);
        t.rows[t.rows.length - 1].push(cell, ...Array.from({ length: span - 1 }, () => ({ blocks: [], buf: "" })));
        sinks.push(cell);
      } else if (sinks.length > 1){
        flush();
        const cell = sinks.pop();
        if (cell.blocks.some(b => /^!\[/.test(b))) t.images = true;
      }
      continue;
    }
    flush();
  }
  while (sinks.length > 1){ flush(); sinks.pop(); }
  flush();
  return root.blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const day = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// One story: its Markdown file's text and its stories.json row.
//   file: the page's mirror path   html: its bytes   source: { url, wayback, captured }
//   photoOf(mirrorPath) → photo id or null   storyOf(mirrorPath) → story id or null   viewOf(mirrorPath) → its Wayback URL
//   linkTitle: the words of Jon's link to the page, the title when the page has none
export function story({ file, html, source }, { people, photoOf = () => null, storyOf = () => null, viewOf = () => null, linkTitle = "" }){
  const page = decode1252(html);
  const title = text((page.match(/<TITLE>([\s\S]*?)<\/TITLE>/i) || [])[1]) || linkTitle || text((page.match(/<H[12][^>]*>([\s\S]*?)<\/H[12]>/i) || [])[1]) || file;
  const id = slug(file.replace(/\.html?$/i, "").replace(/%20/g, " "));
  const dir = path.posix.dirname(file);
  const local = href => path.posix.normalize(path.posix.join(dir, decodeURIComponent(href.split("#")[0])));
  const images = [];
  const body = htmlToMarkdown(html, {
    link: href => {
      if (/^mailto:/i.test(href) || href.startsWith("#")) return null;
      if (/^[a-z]+:/i.test(href)) return href;
      const to = local(href);
      if (photoOf(to)) return `../mirror/${to}`;
      if (storyOf(to)) return `${storyOf(to)}.md`;
      return viewOf(to) || null;
    },
    image: (src, alt) => {
      const to = local(src);
      const pid = photoOf(to);
      if (pid && !images.includes(pid)) images.push(pid);
      return { path: `../mirror/${to}`, caption: alt };
    },
  });
  for (const m of body.matchAll(/\]\(\.\.\/mirror\/([^)]+)\)/g)){ const pid = photoOf(decodeURIComponent(m[1])); if (pid && !images.includes(pid)) images.push(pid); }
  // The words alone (no link targets, no Markdown), the title first: it often gives the years.
  const found = findPeople(title + ". " + body.replace(/\]\([^)]*\)/g, "]").replace(/[*_#>|]+/g, " "), people);
  const head = `# ${title}\n\n*From Jon Inggs's pages · [the Wayback Machine's copy](${source?.wayback || ""}) · captured ${source?.captured ? day(source.captured) : "unknown"}*\n\n`;
  return { id, markdown: head + body, row: { id, title, file: `stories/${id}.md`, source, images, people: found.ids }, found };
}

const list = (xs, f, max = 30) => xs.length ? xs.slice(0, max).map(x => `  - ${f(x)}`).join("\n") + (xs.length > max ? `\n  - … and ${xs.length - max} more` : "") : "  - none";

export function run(dataDir){
  const mirror = path.join(dataDir, "mirror");
  const people = JSON.parse(fs.readFileSync(path.join(dataDir, "people.json"), "utf8"));
  const photos = JSON.parse(fs.readFileSync(path.join(dataDir, "photos.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
  const source = sources(manifest);
  const photoByFile = new Map(photos.map(p => [p.file, p.id]));
  const onDisk = f => fs.existsSync(path.join(mirror, f)) ? f : fs.existsSync(path.join(mirror, decodeURIComponent(f))) ? decodeURIComponent(f) : null;
  const pages = STORY_PAGES.map(onDisk).filter(Boolean);
  const storyIds = new Map(pages.map(f => [f, slug(f.replace(/\.html?$/i, "").replace(/%20/g, " "))]));
  const viewOf = f => source(f)?.wayback || source(encodeURI(f))?.wayback || null;

  fs.mkdirSync(path.join(dataDir, "stories"), { recursive: true });
  const rows = [], report = [];
  const home = fs.existsSync(path.join(mirror, "index.html")) ? decode1252(fs.readFileSync(path.join(mirror, "index.html"))) : "";
  const homeLinks = [...home.matchAll(/<A\s+HREF="([^"]+)"[^>]*>([\s\S]*?)<\/A>/gi)].map(m => ({ to: decodeURIComponent(m[1]), words: text(m[2]) }));
  const linkTo = f => homeLinks.find(l => l.to.toLowerCase() === decodeURIComponent(f).toLowerCase())?.words || "";
  for (const f of pages){
    const s = story({ file: f, html: fs.readFileSync(path.join(mirror, f)), source: source(f) || source(encodeURI(f)) }, {
      people, viewOf, linkTitle: linkTo(f),
      photoOf: p => photoByFile.get(p) || null,
      storyOf: p => storyIds.get(p) || storyIds.get(encodeURI(p)) || null,
    });
    fs.writeFileSync(path.join(dataDir, "stories", `${s.id}.md`), s.markdown);
    rows.push(s.row);
    report.push(`- **${s.row.title}** (\`${s.id}\`): ${s.row.people.length} people linked, ${s.row.images.length} images\n` +
      `  - several people with this name, not linked:\n${list(s.found.ambiguous, a => `${a.name} (${a.count})`).replace(/^/gm, "  ")}\n` +
      `  - a tree surname, no match:\n${list(s.found.unmatched, u => u).replace(/^/gm, "  ")}`);
  }
  // The PDF beside the stories: listed, not converted. Its title is the home page's link to it.
  for (const f of fs.readdirSync(mirror).filter(f => /\.pdf$/i.test(f))){
    const plain = decodeURIComponent(f);
    const a = [...home.matchAll(/<A\s+HREF="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/A>/gi)].find(m => decodeURIComponent(m[1]) === plain || m[1] === plain);
    const title = a ? text(a[2]) : plain.replace(/\.pdf$/i, "").replace(/_/g, " ");
    rows.push({ id: slug(plain.replace(/\.pdf$/i, "")), title, file: `mirror/${f}`, pdf: true, source: source(f), images: [], people: [] });
    report.push(`- **${title}** (PDF, listed, not converted)`);
  }
  fs.writeFileSync(path.join(dataDir, "stories.json"), JSON.stringify(rows, null, 1) + "\n");
  writeSection(path.join(dataDir, "parse-report.md"), "stories", `## Jon's stories (\`stories.mjs\`)\n\n${rows.length} stories (${rows.filter(r => r.pdf).length} a PDF), in \`stories/\`. Names are linked only when they fit exactly one person; the rest are for the owner.\n\n${report.join("\n")}`);
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const rows = run(dataDir);
  console.log(`stories ${rows.length}: ${rows.map(r => `${r.id} (${r.people.length} people, ${r.images.length} images)`).join(", ")}`);
}
