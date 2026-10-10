#!/usr/bin/env node
// family-tree/tools/parse.mjs — Session 3 step 1 (PLAN.md): read the recovered Gedpage site in
// data/mirror/ and write data/people.json, data/photos.json and the parser's part of
// data/parse-report.md. Reads the mirror only, never the network. Run from the repo root:
//
//   node family-tree/tools/parse.mjs                  # data in family-tree/data
//   node family-tree/tools/parse.mjs --data ../x      # another data folder
//
// The pages are regular enough for a small hand parser (PLAN.md, The site's pattern): one <PRE>
// of labelled lines per family, a names index with "SURNAME, Given". There are no person ids, so
// a person is the set of places they appear (a spouse on their own family pages, a child on
// their parents'), joined only when the linked page carries the same name. Nothing is guessed:
// a date keeps Jon's text, a year is read only from an exact date, and a link that doesn't check
// out becomes a ref or a line in the report. The functions are exported for the other tools and
// parse.test.mjs; the run is at the bottom.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------- text ----------

// No charset is declared; the names index is ISO-8859-1 and the rest ASCII, so Latin-1 reads all of it.
export const decode = buf => Buffer.isBuffer(buf) ? buf.toString("latin1") : String(buf);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", pound: "£", deg: "°",
  sect: "§", para: "¶", middot: "·", times: "×", frac12: "½", frac14: "¼", frac34: "¾", shy: "", laquo: "«", raquo: "»",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", szlig: "ß" };
const ACCENT = { acute: "\u0301", grave: "\u0300", circ: "\u0302", uml: "\u0308", tilde: "\u0303", cedil: "\u0327", ring: "\u030a" };
export const entities = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  if (ENTITIES[e] ?? ENTITIES[e.toLowerCase()]) return ENTITIES[e] ?? ENTITIES[e.toLowerCase()];
  const acc = e.match(/^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i);   // &eacute; &Ouml; …
  return acc ? (acc[1] + ACCENT[acc[2].toLowerCase()]).normalize("NFC") : e === "shy" ? "" : m;
});

// The words a reader sees: tags out, entities decoded, whitespace collapsed.
export const text = html => entities(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// The same person written the same way, whatever the spacing or case.
export const norm = name => text(name).toUpperCase();

export const slug = s => text(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- dates ----------

const MONTH = "(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)";
const EXACT = new RegExp(`^(?:\\d{1,2} )?(?:${MONTH} )?(\\d{4})(?:/\\d{1,2})?$`, "i");

// The year, only when the date is exact: "30 DEC 1922", "MAR 1850", "1845", "12 FEB 1750/51"
// (a dual date: the first year). "ABT 1850", "BEF 1900", "22 MAR" and the odd ones give null.
export function yearOf(date){
  const m = String(date || "").trim().match(EXACT);
  return m ? Number(m[1]) : null;
}

// Any four digits in the date, exact or not: what the living rule and a caption's "(1815-69)"
// are checked against. Never stored as a year.
export function anyYear(ev){
  if (ev?.year) return ev.year;
  const m = String(ev?.date || "").match(/\b(\d{4})\b/);
  return m ? Number(m[1]) : null;
}

const event = (date = "", place = "") => ({ date, year: yearOf(date), place });

// ---------- one family page ----------

const famOf = href => (String(href).match(/(fam\d+)\.htm/i) || [])[1]?.toLowerCase() || null;
const links = s => [...String(s).matchAll(/<A\s+HREF="?([^">\s]+)"?\s*>([\s\S]*?)<\/A>/gi)]
  .map(m => ({ name: text(m[2]), fam: famOf(m[1]) })).filter(l => l.name);

// A Father:, Mother: or Other Spouses: value: the linked names, or the plain text if Jon wrote one
// without a page.
const named = s => { const l = links(s); if (l.length) return l; const t = text(s); return t ? [{ name: t, fam: null }] : []; };

// Gedpage's family page → { title, build, husband, wife, married, children }. A side is
// { name, born, died, father, mother, others } or null when the page leaves it blank; a child is
// { name, fam (their own page, or null), born, married, died, spouses }. Returns null for a page
// that isn't a family page.
export function parseFamily(html){
  html = decode(html);
  const pre = (html.match(/<PRE>([\s\S]*?)<\/PRE>/i) || [])[1];
  if (pre == null || !/Husband:/.test(pre)) return null;
  const fam = {
    title: text((html.match(/<TITLE>([\s\S]*?)<\/TITLE>/i) || [])[1]),
    build: text((html.match(/Gedpage Version [\d.]+(?:<\/A>)?\s*(?:&copy;|©)\s*\d+ on ([^<]+)/i) || [])[1]),
    husband: null, wife: null, married: event(), children: [],
  };
  let mode = "", side = null, child = null;
  for (const raw of pre.split(/\r?\n/)){
    const line = raw.replace(/<HR[^>]*>/gi, "");
    let m;
    if ((m = line.match(/^\s*(Husband|Wife):(.*)$/))){
      mode = m[1].toLowerCase();
      const name = text(m[2]);
      side = name ? { name, born: event(), died: event(), father: null, mother: null, others: [] } : null;
      fam[mode] = side;
    } else if (/<B>\s*CHILDREN\s*<\/B>/i.test(line)){
      mode = "children"; side = null;
    } else if (mode === "children" && (m = line.match(/^\s*Name:(.*)$/))){
      child = { name: text(m[1]), fam: links(m[1])[0]?.fam || null, born: event(), married: event(), died: event(), spouses: [] };
      fam.children.push(child);
    } else if ((m = line.match(/^\s*(Born|Married|Died):(.*?)\bat:(.*)$/))){
      const ev = event(text(m[2]), text(m[3]));
      const key = m[1].toLowerCase();
      if (mode === "children"){ if (child) child[key] = ev; }
      else if (key === "married"){ if (!fam.married.date && !fam.married.place) fam.married = ev; }
      else if (side) side[key] = ev;
    } else if ((m = line.match(/^\s*(Father|Mother):(.*)$/))){
      if (side) side[m[1].toLowerCase()] = named(m[2])[0] || null;
    } else if ((m = line.match(/^\s*Other Spouses:(.*)$/))){
      if (side) side.others = named(m[1]);
    } else if ((m = line.match(/^\s*Spouses:(.*)$/))){
      if (child) child.spouses = named(m[1]);
    }
  }
  return fam;
}

// ---------- the names index ----------

// namesN.htm → [{ surname, given, name, fam, birth, death }], one per row, in order. The closest
// thing the site has to a person list: Gedpage writes "SURNAME, Given" and the dates as on the
// family page, either side blank.
export function parseNames(html){
  html = decode(html);
  const rows = [];
  for (const m of html.matchAll(/<A\s+HREF="?(fam\d+)\.htm"?\s*>([^<]*)<\/A>\s*(?:\(([^)]*)\))?/gi)){
    const full = text(m[2]);
    const comma = full.indexOf(",");
    const surname = comma < 0 ? full : full.slice(0, comma).trim();
    const given = comma < 0 ? "" : full.slice(comma + 1).trim();
    const dates = text(m[3] || "");
    const dash = dates.indexOf("-");
    rows.push({
      surname, given, name: [given, surname].filter(Boolean).join(" "), fam: m[1].toLowerCase(),
      birth: (dash < 0 ? dates : dates.slice(0, dash)).trim(), death: dash < 0 ? "" : dates.slice(dash + 1).trim(),
    });
  }
  return rows;
}

// Given and surname when the index doesn't say: Gedpage writes the surname in capitals at the end,
// so the trailing words in capitals (two letters or more, no full stop: "M." is an initial).
export function splitName(name){
  const words = text(name).split(" ").filter(Boolean);
  let i = words.length;
  while (i > 0 && /^[A-Z][A-Z'’-]+$/.test(words[i - 1]) && (i > 1 || words.length === 1)) i--;
  if (i === words.length) i = Math.max(0, words.length - 1);
  return { given: words.slice(0, i).join(" "), surname: words.slice(i).join(" ") };
}

// ---------- people ----------

// Every family page → the people, their relationships, and a log of what didn't check out.
//   families: Map<famId, parseFamily()>   index: parseNames() rows   sourceOf: famId → { url, wayback, captured }
export function buildPeople(families, index = [], sourceOf = () => null){
  const log = { childFixedByIndex: [], childUnresolved: [], otherUnverified: [], parentMirrored: [], parentOneSided: [],
    conflicts: [], sexConflicts: [], indexUnmatched: [], notInIndex: 0, stale: [] };
  const famIds = [...families.keys()].sort();

  // The build most pages carry; a page from another one is reported, and its links still have to check out.
  const builds = new Map();
  for (const f of families.values()) builds.set(f.build, (builds.get(f.build) || 0) + 1);
  const mainBuild = [...builds].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  for (const id of famIds) if (families.get(id).build !== mainBuild) log.stale.push({ fam: id, build: families.get(id).build });

  // Slots: every place a person appears. Keys "fam00012/husband", "fam00012/wife", "fam00012/c0".
  const slots = new Map();
  for (const id of famIds){
    const f = families.get(id);
    for (const role of ["husband", "wife"]) if (f[role]) slots.set(`${id}/${role}`, { ...f[role], key: `${id}/${role}`, fam: id, role });
    f.children.forEach((c, i) => slots.set(`${id}/c${i}`, { ...c, key: `${id}/c${i}`, fam: id, own: c.fam, role: "child" }));
  }
  const parent = new Map([...slots.keys()].map(k => [k, k]));
  const find = k => { while (parent.get(k) !== k){ parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); };

  // The spouse slot on that page with this name, or null: the check every link has to pass.
  const spouseOn = (famId, name) => {
    const f = families.get(famId);
    if (!f) return null;
    const hits = ["husband", "wife"].filter(role => f[role] && norm(f[role].name) === norm(name));
    return hits.length === 1 ? `${famId}/${hits[0]}` : null;   // both sides with one name: can't tell which
  };
  const byName = new Map();
  for (const r of index) byName.set(norm(r.name), [...(byName.get(norm(r.name)) || []), r]);

  // A child's own page.
  for (const s of slots.values()){
    if (s.role !== "child" || !s.own) continue;
    let target = spouseOn(s.own, s.name);
    if (!target){
      const viaIndex = [...new Set((byName.get(norm(s.name)) || []).map(r => spouseOn(r.fam, s.name)).filter(Boolean))];
      if (viaIndex.length === 1){ target = viaIndex[0]; log.childFixedByIndex.push({ on: s.key, name: s.name, linked: s.own, used: target }); }
      else log.childUnresolved.push({ on: s.key, name: s.name, linked: s.own });
    }
    if (target) union(s.key, target);
  }
  // A spouse's other marriages.
  for (const s of slots.values()){
    if (s.role === "child") continue;
    for (const o of s.others){
      if (!o.fam) continue;
      const target = spouseOn(o.fam, s.name);
      if (target) union(s.key, target);
      else log.otherUnverified.push({ on: s.key, name: s.name, linked: o.fam });
    }
  }
  // Father and Mother point at the parents' page: the person should be a child there. If the
  // child slot is there under the same name, join it (the children list said nothing linking
  // back); if it isn't, the parentage is one-sided and gets added, and logged.
  const extraParents = [];
  for (const s of slots.values()){
    if (s.role === "child") continue;
    const pf = s.father?.fam || s.mother?.fam;
    if (!pf || !families.has(pf)) continue;
    const kids = families.get(pf).children.map((c, i) => ({ c, key: `${pf}/c${i}` })).filter(x => norm(x.c.name) === norm(s.name));
    if (kids.length === 1){
      if (find(kids[0].key) !== find(s.key)){ log.parentMirrored.push({ on: s.key, name: s.name, parents: pf }); union(kids[0].key, s.key); }
    } else if (!kids.length){
      extraParents.push({ slot: s.key, fam: pf });
      log.parentOneSided.push({ on: s.key, name: s.name, parents: pf });
    }
  }

  // Clusters → people.
  const clusters = new Map();
  for (const k of slots.keys()){ const r = find(k); clusters.set(r, [...(clusters.get(r) || []), slots.get(k)]); }
  const famNo = k => Number(k.match(/fam(\d+)/)[1]);
  const order = [...clusters.values()].sort((a, b) => Math.min(...a.map(s => famNo(s.key))) - Math.min(...b.map(s => famNo(s.key))) || (a[0].key < b[0].key ? -1 : 1));
  const people = [], idOf = new Map(), used = new Map();
  const indexKey = new Map(index.map(r => [norm(r.name), r]));

  for (const group of order){
    const spouses = group.filter(s => s.role !== "child"), kids = group.filter(s => s.role === "child");
    const first = spouses[0] || kids[0];
    const pick = key => {
      const values = [...spouses, ...kids].map(s => s[key]).filter(e => e && (e.date || e.place));
      const distinct = [...new Set(values.map(e => `${e.date}|${e.place}`))];
      if (distinct.length > 1) log.conflicts.push({ name: first.name, field: key, values: distinct, kept: distinct[0] });
      return values[0] ? { ...values[0] } : event();
    };
    const roles = new Set(spouses.map(s => s.role));
    if (roles.size > 1) log.sexConflicts.push({ name: first.name, on: spouses.map(s => s.key) });
    const sex = roles.size === 1 ? (roles.has("husband") ? "M" : "F") : "U";
    const fromIndex = indexKey.get(norm(first.name));
    const { given, surname } = fromIndex ? { given: fromIndex.given, surname: fromIndex.surname } : splitName(first.name);
    const birth = pick("born"), death = pick("died");
    let id = slug([given, surname, birth.year].filter(Boolean).join(" ")) || "person";
    const n = (used.get(id) || 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    const home = spouses[0]?.fam || kids[0].fam;
    const person = {
      id, name: first.name, given, surname, sex, birth, death,
      parents: [], spouses: [], children: [], notes: "", photos: [], refs: [],
      source: sourceOf(home) || { url: "", wayback: "", captured: null },
      _slots: group.map(s => s.key), _fams: [...new Set(group.map(s => s.fam))],
    };
    for (const s of group) idOf.set(s.key, id);
    people.push(person);
  }
  // A child slot whose own page didn't check out is a separate person (it may be a duplicate of
  // someone on another page: the report lists them).
  const byId = new Map(people.map(p => [p.id, p]));
  const add = (list, v) => { if (!list.includes(v)) list.push(v); };
  const relate = (parentId, childId) => { add(byId.get(parentId).children, childId); add(byId.get(childId).parents, parentId); };

  for (const id of famIds){
    const f = families.get(id);
    const h = f.husband && idOf.get(`${id}/husband`), w = f.wife && idOf.get(`${id}/wife`);
    if (h && w && h !== w){
      byId.get(h).spouses.push({ id: w, name: f.wife.name, date: f.married.date, place: f.married.place });
      byId.get(w).spouses.push({ id: h, name: f.husband.name, date: f.married.date, place: f.married.place });
    }
    f.children.forEach((c, i) => { const cid = idOf.get(`${id}/c${i}`); for (const p of [h, w]) if (p) relate(p, cid); });
  }
  for (const x of extraParents){
    const f = families.get(x.fam), cid = idOf.get(x.slot);
    for (const role of ["husband", "wife"]) if (f[role]) relate(idOf.get(`${x.fam}/${role}`), cid);
  }
  // refs: a named parent or spouse whose page didn't give us them.
  for (const s of slots.values()){
    if (s.role === "child") continue;
    const p = byId.get(idOf.get(s.key));
    for (const role of ["father", "mother"]){
      const named = s[role];
      if (!named) continue;
      const found = p.parents.some(pid => norm(byId.get(pid).name) === norm(named.name));
      if (!found && !p.refs.some(r => r.role === role && norm(r.name) === norm(named.name))) p.refs.push({ role, name: named.name });
    }
    for (const o of s.others){
      const found = p.spouses.some(sp => norm(sp.name) === norm(o.name));
      if (!found && !p.refs.some(r => r.role === "spouse" && norm(r.name) === norm(o.name))) p.refs.push({ role: "spouse", name: o.name });
    }
  }
  for (const s of slots.values()){
    if (s.role !== "child") continue;
    const p = byId.get(idOf.get(s.key));
    for (const sp of s.spouses){
      const found = p.spouses.some(x => norm(x.name) === norm(sp.name));
      if (!found && !p.refs.some(r => r.role === "spouse" && norm(r.name) === norm(sp.name))) p.refs.push({ role: "spouse", name: sp.name });
    }
  }

  // The names index against what was built: a row is matched when someone of that name appears
  // on the row's page.
  const seen = new Set();
  for (const r of index){
    const hit = people.find(p => norm(p.name) === norm(r.name) && p._fams.includes(r.fam));
    if (hit) seen.add(hit.id); else log.indexUnmatched.push(r);
  }
  log.notInIndex = people.filter(p => !seen.has(p.id)).length;
  return { people, log };
}

// ---------- names in free text (captions, stories) ----------

const TITLES = new Set(["MR", "MRS", "MISS", "MS", "DR", "REV", "SIR", "LADY", "BRO", "BROTHER", "CAPT", "CAPTAIN", "MAJOR", "COL", "LT", "SGT", "PTE", "THE", "AND", "OF", "OLD", "LORD", "PROF", "ST"]);
const word = w => w.replace(/['’]s$/i, "").replace(/[.,;:!?)"]+$/, "").replace(/^[("]+/, "");

// The people a caption or a story names: "<Given…> <Surname>" with the surname one the tree has,
// the given names the start of the person's (an initial matches a name), and a "(1815-69)" right
// after it narrowing by birth year. One person → matched; several → ambiguous; none → unmatched.
// Nothing is linked on a guess: the ambiguous and unmatched go to the report for the owner.
export function findPeople(str, people){
  const bySurname = new Map();
  for (const p of people){ const k = norm(p.surname); if (k) bySurname.set(k, [...(bySurname.get(k) || []), p]); }
  const out = { ids: [], matched: [], ambiguous: [], unmatched: [] };
  const plain = text(str);
  const re = /[A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*)*/g;
  let m;
  while ((m = re.exec(plain))){
    const words = m[0].split(/\s+/);
    // The last word that is a surname first: "Clara Fenwick Beamish" is a Beamish, though
    // Fenwick is a surname in the tree too. A shorter reading is tried only if that one fits nobody.
    let fallback = null;
    for (let j = words.length - 1; j >= 1; j--){
      const sur = word(words[j]).toUpperCase();
      const pool = bySurname.get(sur);
      if (!pool) continue;
      let i = 0;
      while (i < j && TITLES.has(word(words[i]).toUpperCase())) i++;
      if (i >= j) continue;
      for (let k = j - 1; k >= i; k--) if (words[k].endsWith(",")) { i = k + 1; break; }
      if (i >= j) continue;
      const given = words.slice(i, j).map(word);
      const after = plain.slice(m.index + m[0].indexOf(words[j]) + words[j].length);
      const yr = (after.match(/^\s*\(([^)]*?)\b(\d{4})\b/) || [])[2];
      const fits = p => {
        const pg = text(p.given).toUpperCase().split(" ").filter(w => !/^[A-Z]\d+$/.test(w));   // "D1": Jon's prefix
        if (pg.length < given.length) return false;
        return given.every((g, n) => { const G = g.toUpperCase().replace(/\.$/, ""); return n === 0 ? pg[0] === G : (G.length === 1 ? pg[n].startsWith(G) : pg[n] === G); });
      };
      let hits = pool.filter(fits);
      const name = [...given, word(words[j])].join(" ") + (yr ? ` (${yr})` : "");
      if (!hits.length){ fallback ??= name; continue; }
      if (yr) hits = hits.filter(p => anyYear(p.birth) === Number(yr));
      if (hits.length === 1){ if (!out.ids.includes(hits[0].id)){ out.ids.push(hits[0].id); out.matched.push({ name, id: hits[0].id }); } }
      else if (hits.length > 1){ if (!out.ambiguous.some(a => a.name === name)) out.ambiguous.push({ name, count: hits.length }); }
      else if (!out.unmatched.includes(name)) out.unmatched.push(name);
      fallback = null;
      break;
    }
    if (fallback && !out.unmatched.includes(fallback)) out.unmatched.push(fallback);
  }
  return out;
}

// ---------- photos ----------

const IMAGE = /\.(jpe?g|gif|png)$/i;

// The pixel size of a JPEG, GIF or PNG from its header, or null.
export function imageSize(buf){
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString("latin1", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf[0] === 0xff && buf[1] === 0xd8){
    let i = 2;
    while (i + 9 < buf.length){
      if (buf[i] !== 0xff){ i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Every image a page shows or links, with Jon's caption for it, in page order:
//   an <img> alone in a table row with words in the next row → those words (a captioned figure);
//   a link to an image in a table cell → the cell's words, or, when the cell links several
//     images, the link's words and the "(dates)" after them;
//   otherwise the ALT text without the brackets Jon put round it, the link's words, or the page's title.
// → [{ file, caption, how }]. file is as written (resolved against the page by the caller).
export function pageImages(html){
  html = decode(html);
  const title = text((html.match(/<TITLE>([\s\S]*?)<\/TITLE>/i) || [])[1]);
  const out = [];
  const cellAt = i => {
    const open = html.lastIndexOf("<TD", i) >= 0 ? Math.max(html.toUpperCase().lastIndexOf("<TD", i)) : -1;
    if (open < 0) return null;
    const close = html.toUpperCase().indexOf("</TD", i);
    const lastClose = html.toUpperCase().lastIndexOf("</TD", i);
    if (close < 0 || lastClose > open) return null;
    return { start: open, end: close, html: html.slice(open, close) };
  };
  const U = html.toUpperCase();
  for (const m of html.matchAll(/<IMG\b[^>]*>/gi)){
    const src = (m[0].match(/SRC\s*=\s*"?([^">\s]+)/i) || [])[1];
    if (!src || !IMAGE.test(src)) continue;
    const alt = (m[0].match(/ALT\s*=\s*"([^"]*)"/i) || [])[1];
    let caption = "", how = "";
    const cell = cellAt(m.index);
    if (cell && !text(cell.html.replace(/<IMG\b[^>]*>/gi, ""))){
      const rowEnd = U.indexOf("</TR", m.index);
      const nextRow = rowEnd >= 0 ? html.slice(rowEnd).match(/^<\/TR>\s*<TR[^>]*>([\s\S]*?)<\/TR>/i) : null;
      if (nextRow && text(nextRow[1])){ caption = text(nextRow[1]); how = "next row"; }
    }
    if (!caption && alt != null && text(alt)){ caption = text(alt).replace(/^\[\s*/, "").replace(/\s*\]$/, ""); how = "alt"; }
    if (!caption){ caption = title; how = "page title"; }
    out.push({ file: src, caption, how });
  }
  for (const m of html.matchAll(/<A\s+HREF\s*=\s*"?([^">\s]+)"?[^>]*>([\s\S]*?)<\/A>/gi)){
    if (!IMAGE.test(m[1])) continue;
    let caption = "", how = "";
    const cell = cellAt(m.index);
    if (cell){
      const files = new Set([...cell.html.matchAll(/HREF\s*=\s*"?([^">\s]+)/gi)].map(x => x[1]).filter(f => IMAGE.test(f)));
      if (files.size > 1){
        const after = html.slice(m.index + m[0].length, cell.end);
        const dates = (text(after).match(/^\(([^)]*)\)/) || [])[0] || "";
        caption = [text(m[2]), dates].filter(Boolean).join(" "); how = "link and dates";
      } else { caption = text(cell.html); how = "cell"; }
    }
    if (!caption && text(m[2])){ caption = text(m[2]); how = "link"; }
    if (!caption){ caption = title; how = "page title"; }
    out.push({ file: m[1], caption, how });
  }
  return out.sort((a, b) => html.indexOf(a.file) - html.indexOf(b.file));
}

// The photos: one per image file, its caption from the first page (in the order given) that
// shows it, the people the caption names. pages: [{ file (mirror path), html, source }].
//   exists(mirrorPath) → bool    sizeOf(mirrorPath) → { w, h } | null
export function buildPhotos(pages, people, { exists = () => false, sizeOf = () => null, sourceOf = () => null } = {}){
  const photos = new Map(), log = { ambiguous: [], unmatched: [], captions: [] };
  for (const page of pages){
    for (const img of pageImages(page.html)){
      const file = path.posix.normalize(path.posix.join(path.posix.dirname(page.file), decodeURIComponent(img.file)));
      if (file.startsWith("..")) continue;
      const id = slug(path.posix.basename(file).replace(IMAGE, "")) || "photo";
      if (photos.has(id)) continue;
      const found = findPeople(img.caption, people);
      for (const a of found.ambiguous) log.ambiguous.push({ photo: id, ...a });
      for (const u of found.unmatched) log.unmatched.push({ photo: id, name: u });
      log.captions.push({ photo: id, page: page.file, how: img.how });
      const size = sizeOf(file);
      photos.set(id, {
        id, caption: img.caption, people: found.ids, names: found.matched.map(x => x.name.replace(/ \(\d{4}\)$/, "")),
        file, recovered: !!exists(file), thumb: "", w: size?.w || 0, h: size?.h || 0,
        source: sourceOf(file) || page.source || { url: "", wayback: "", captured: null }, page: page.file,
      });
    }
  }
  const list = [...photos.values()];
  const byId = new Map(people.map(p => [p.id, p]));
  for (const ph of list) for (const pid of ph.people){ const p = byId.get(pid); if (p && !p.photos.includes(ph.id)) p.photos.push(ph.id); }
  return { photos: list, log };
}

// ---------- validation ----------

// Every id resolves, spouses point both ways, parents and children mirror each other. A missing
// side is added and logged; an id that resolves nowhere is dropped and logged.
export function validate(people, photos = []){
  const byId = new Map(people.map(p => [p.id, p]));
  const photoIds = new Set(photos.map(p => p.id));
  const log = { dangling: [], fixed: [] };
  for (const p of people){
    for (const key of ["parents", "children"]){
      p[key] = p[key].filter(id => byId.has(id) || (log.dangling.push({ person: p.id, field: key, id }), false));
    }
    p.spouses = p.spouses.filter(s => byId.has(s.id) || (log.dangling.push({ person: p.id, field: "spouses", id: s.id }), false));
    p.photos = p.photos.filter(id => photoIds.has(id) || (log.dangling.push({ person: p.id, field: "photos", id }), false));
  }
  for (const ph of photos) ph.people = ph.people.filter(id => byId.has(id) || (log.dangling.push({ photo: ph.id, field: "people", id }), false));
  for (const p of people){
    for (const c of p.children){ const k = byId.get(c); if (!k.parents.includes(p.id)){ k.parents.push(p.id); log.fixed.push({ added: "parent", to: c, id: p.id }); } }
    for (const q of p.parents){ const k = byId.get(q); if (!k.children.includes(p.id)){ k.children.push(p.id); log.fixed.push({ added: "child", to: q, id: p.id }); } }
    for (const s of p.spouses){
      const k = byId.get(s.id);
      if (!k.spouses.some(x => x.id === p.id)){ k.spouses.push({ id: p.id, name: p.name, date: s.date, place: s.place }); log.fixed.push({ added: "spouse", to: s.id, id: p.id }); }
    }
  }
  for (const ph of photos){
    if (ph.recovered == null) ph.recovered = false;
    for (const pid of ph.people){ const p = byId.get(pid); if (!p.photos.includes(ph.id)){ p.photos.push(ph.id); log.fixed.push({ added: "photo", to: pid, id: ph.id }); } }
  }
  return log;
}

// ---------- the report ----------

// Each tool owns one section of data/parse-report.md, between its markers, and rewrites only that.
export function writeSection(file, key, markdown){
  const begin = `<!-- ${key} -->`, end = `<!-- /${key} -->`;
  let doc = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "# Parse report (Session 3)\n\nWritten by the tools in `family-tree/tools/`; private, it names people.\n";
  const block = `${begin}\n${markdown.trim()}\n${end}`;
  const at = doc.indexOf(begin), to = doc.indexOf(end);
  doc = at >= 0 && to > at ? doc.slice(0, at) + block + doc.slice(to + end.length) : doc.trimEnd() + "\n\n" + block + "\n";
  fs.writeFileSync(file, doc);
}

// ---------- the run ----------

// The manifest's row for a mirror path → the record's source: { url, wayback, captured (ms) }.
export function sources(manifest){
  const byPath = new Map((manifest.rows || []).filter(r => r.path).map(r => [r.path, r]));
  const ms = ts => ts ? Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10) || 0, +ts.slice(10, 12) || 0, +ts.slice(12, 14) || 0) : null;
  return p => { const r = byPath.get(p); return r ? { url: r.url.replace(/:80\//, "/"), wayback: r.wayback, captured: ms(r.timestamp) } : null; };
}

// Jon's family-history pages, in the order a photo's caption is looked for (the photographs page first).
export const STORY_PAGES = ["j_stone.htm", "ing_orig.htm", "jon150th.htm", "oldsmbl.htm", "leonard.htm", "1930obit.htm", "04rudd.htm", "OAs%20killed.htm", "stats.htm", "new.htm"];

const list = (xs, f, max = 40) => xs.length ? xs.slice(0, max).map(x => `- ${f(x)}`).join("\n") + (xs.length > max ? `\n- … and ${xs.length - max} more` : "") : "- none";

export function run(dataDir){
  const mirror = path.join(dataDir, "mirror");
  const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "manifest.json"), "utf8"));
  const source = sources(manifest);
  const htmlDir = path.join(mirror, "html");
  const families = new Map(), failed = [];
  for (const f of fs.readdirSync(htmlDir).filter(f => /^fam\d+\.htm$/i.test(f)).sort()){
    const fam = parseFamily(fs.readFileSync(path.join(htmlDir, f)));
    if (fam) families.set(f.replace(/\.htm$/i, "").toLowerCase(), fam); else failed.push(f);
  }
  const index = fs.readdirSync(htmlDir).filter(f => /^names\d+\.htm$/i.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)))
    .flatMap(f => parseNames(fs.readFileSync(path.join(htmlDir, f))));
  const { people, log } = buildPeople(families, index, fam => source(`html/${fam}.htm`));

  const pages = STORY_PAGES.filter(f => fs.existsSync(path.join(mirror, decodeURIComponent(f))) || fs.existsSync(path.join(mirror, f)))
    .map(f => { const p = fs.existsSync(path.join(mirror, f)) ? f : decodeURIComponent(f); return { file: p, html: fs.readFileSync(path.join(mirror, p)), source: source(p) }; });
  const mirrorFile = f => [f, encodeURI(f), f.replace(/ /g, "%20")].map(x => path.join(mirror, x)).find(x => fs.existsSync(x));
  const { photos, log: plog } = buildPhotos(pages, people, {
    exists: f => !!mirrorFile(f),
    sizeOf: f => { const p = mirrorFile(f); return p ? imageSize(fs.readFileSync(p)) : null; },
    sourceOf: f => source(f),
  });
  const vlog = validate(people, photos);

  // WikiTree ids from wikitree.mjs, kept across re-runs (ids only: SPEC §4).
  const wt = path.join(dataDir, "wikitree.json");
  const links = fs.existsSync(wt) ? JSON.parse(fs.readFileSync(wt, "utf8")) : {};
  const out = people.map(({ _slots, _fams, ...p }) => links[p.id] ? { ...p, wikitree: links[p.id] } : p);
  fs.writeFileSync(path.join(dataDir, "people.json"), JSON.stringify(out, null, 1) + "\n");
  fs.writeFileSync(path.join(dataDir, "photos.json"), JSON.stringify(photos.map(({ page, ...p }) => p), null, 1) + "\n");

  const refs = out.reduce((n, p) => n + p.refs.length, 0);
  const md = `## People and photos (\`parse.mjs\`)

| | |
|---|---|
| Family pages read | ${families.size} (failed to parse: ${failed.length ? failed.join(", ") : "none"}) |
| From another build | ${log.stale.length ? log.stale.map(s => `${s.fam} (${s.build})`).join(", ") + ": read like the rest; every link from it had to check out by name" : "none"} |
| Names index rows | ${index.length} (matched to a person on that row's page: ${index.length - log.indexUnmatched.length}) |
| People | **${out.length}** (the home page said 2,332; ${log.notInIndex} not in the names index) |
| With a birth year / a death year | ${out.filter(p => p.birth.year).length} / ${out.filter(p => p.death.year).length} |
| Unresolved refs | ${refs} on ${out.filter(p => p.refs.length).length} people |
| Photos | **${photos.length}**, recovered ${photos.filter(p => p.recovered).length}, missing ${photos.filter(p => !p.recovered).length}; naming ${photos.reduce((n, p) => n + p.people.length, 0)} people |
| One-sided links fixed | ${log.parentMirrored.length + log.parentOneSided.length + vlog.fixed.length} (parent line joined to the child: ${log.parentMirrored.length}; parentage added from a Father/Mother line the parents' page didn't list: ${log.parentOneSided.length}; mirrored in validation: ${vlog.fixed.length}) |
| Dangling ids dropped | ${vlog.dangling.length} |

**A child's page that didn't carry their name** (kept as a person on the parents' page only; may duplicate someone):
${list(log.childUnresolved, x => `${x.name}, on ${x.on}, linked ${x.linked}`)}

**A child's link put right by the names index:**
${list(log.childFixedByIndex, x => `${x.name}: ${x.linked} → ${x.used}`)}

**"Other Spouses" links that didn't check out** (kept as a ref):
${list(log.otherUnverified, x => `${x.name} on ${x.on} → ${x.linked}`)}

**Parentage added from a Father/Mother line** (the parents' page didn't list them as a child):
${list(log.parentOneSided, x => `${x.name} (${x.on}) → ${x.parents}`)}

**Names index rows with no person on their page:**
${list(log.indexUnmatched, x => `${x.name} (${x.fam})`)}

**Different values for the same person** (the first, from their own page, kept):
${list(log.conflicts, x => `${x.name}, ${x.field}: ${x.values.join(" / ")}`)}

**Both husband and wife somewhere** (sex left U):
${list(log.sexConflicts, x => `${x.name}: ${x.on.join(", ")}`)}

**Photo captions:** ${plog.captions.map(c => `${c.photo} (${c.how})`).join(", ")}.

**Names in a caption that matched several people** (not linked; for the owner):
${list(plog.ambiguous, x => `${x.photo}: ${x.name}, ${x.count} people`)}

**Names in a caption with the tree's surname and no match:**
${list(plog.unmatched, x => `${x.photo}: ${x.name}`)}
`;
  writeSection(path.join(dataDir, "parse-report.md"), "parse", md);
  return { people: out, photos, log, plog, vlog, index, families, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const r = run(dataDir);
  console.log(`people ${r.people.length}, photos ${r.photos.length} (recovered ${r.photos.filter(p => p.recovered).length}), refs ${r.people.reduce((n, p) => n + p.refs.length, 0)}, index rows unmatched ${r.log.indexUnmatched.length}, failed ${r.failed.length}`);
}
