#!/usr/bin/env node
// family-tree/tools/gedcom.mjs — Session 3 step 2 (PLAN.md): people.json and photos.json as a
// GEDCOM 5.5.1 file, UTF-8, data/inggs.ged, so the recovered tree opens in any genealogy program
// (and could go back to Jon). Run after parse.mjs, from the repo root:
//
//   node family-tree/tools/gedcom.mjs [--data ../x]
//
// Every person is an INDI, every couple or single parent with children a FAM; dates are Jon's
// text (a date GEDCOM's grammar can't read goes in as a date phrase, in brackets, rather than
// being rewritten); every record cites the source record that names Jon Inggs as compiler, with
// the Wayback page it came from; a ref that didn't resolve is a NOTE. toGedcom is pure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CREDIT = "Compiled by Jon Inggs · familytree.inggs.com · 2006";

const MON = "(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";
const DATE = `(?:(?:\\d{1,2} )?${MON} )?\\d{3,4}(?:/\\d{2})?`;
const VALID = new RegExp(`^(?:(?:ABT|CAL|EST|BEF|AFT|FROM|TO|INT) )?${DATE}$|^BET ${DATE} AND ${DATE}$|^FROM ${DATE} TO ${DATE}$`);

// Jon's date as GEDCOM: as written when the grammar reads it, else a date phrase "(…)".
export function gedDate(date){
  const d = String(date || "").trim().replace(/\s+/g, " ");
  if (!d) return "";
  return VALID.test(d) ? d : `(${d.replace(/[()]/g, "")})`;
}

// One tag and its value as lines, long values split with CONC and line breaks with CONT.
export function line(level, tag, value = "", max = 200){
  const out = [];
  String(value).split(/\r?\n/).forEach((part, i) => {
    let rest = part, first = true;
    do {
      let take = rest.slice(0, max);
      // Never split before or after a space: some readers trim CONC values.
      if (rest.length > max) while (take.length > 1 && (take.endsWith(" ") || rest[take.length] === " ")) take = take.slice(0, -1);
      const t = i === 0 && first ? tag : first ? "CONT" : "CONC";
      const lv = i === 0 && first ? level : level + 1;
      out.push(`${lv} ${t}${take ? " " + take : ""}`);
      rest = rest.slice(take.length);
      first = false;
    } while (rest.length);
  });
  return out;
}

// Families from the people: every set of parents a child has, and every couple without children.
export function families(people){
  const byId = new Map(people.map(p => [p.id, p]));
  const fams = new Map();
  const key = ids => [...ids].sort().join("+");
  const fam = ids => {
    const k = key(ids);
    if (!fams.has(k)){
      const ps = ids.map(id => byId.get(id));
      const husb = ps.find(p => p.sex === "M") || ps.find(p => p.sex !== "F") || null;
      const wife = ps.find(p => p !== husb) || null;
      const marr = husb && wife ? husb.spouses.find(s => s.id === wife.id) : null;
      fams.set(k, { husb: husb?.id || null, wife: wife?.id || null, children: [], marr: marr ? { date: marr.date, place: marr.place } : null });
    }
    return fams.get(k);
  };
  for (const p of people) for (const s of p.spouses) if (p.id < s.id) fam([p.id, s.id]);
  for (const p of people) if (p.parents.length) fam(p.parents.slice(0, 2)).children.push(p.id);
  return [...fams.values()];
}

// people, photos, meta → the whole file as a string.
export function toGedcom(people, photos = [], { date = new Date(), source = {} } = {}){
  const xi = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const photoById = new Map(photos.map(p => [p.id, p]));
  const fams = families(people).map((f, i) => ({ ...f, x: `@F${i + 1}@` }));
  const famc = new Map(), fams_ = new Map();
  for (const f of fams){
    for (const c of f.children) famc.set(c, [...(famc.get(c) || []), f.x]);
    for (const s of [f.husb, f.wife]) if (s) fams_.set(s, [...(fams_.get(s) || []), f.x]);
  }
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const today = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const L = [
    "0 HEAD",
    "1 SOUR sidequests-family-tree", "2 NAME sidequests family-tree",
    `1 DATE ${today}`,
    "1 SUBM @U1@",
    "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    ...line(1, "NOTE", `${CREDIT}. Recovered from the Wayback Machine's copies of Jon's pages (Gedpage 2.00, built 17 July 2006). Dates and places are as Jon wrote them; a date in brackets is one GEDCOM's grammar doesn't read.`),
    "0 @U1@ SUBM", "1 NAME sidequests family-tree",
    "0 @S1@ SOUR",
    "1 AUTH Jon Inggs",
    "1 TITL Inggs family tree",
    ...line(1, "PUBL", `familytree.inggs.com, 2006${source.url ? ` (${source.url})` : ""}`),
    ...line(1, "NOTE", CREDIT),
  ];
  const ev = (tag, e) => {
    if (!e || !(e.date || e.place)) return [];
    return [`1 ${tag}`, ...(e.date ? line(2, "DATE", gedDate(e.date)) : []), ...(e.place ? line(2, "PLAC", e.place) : [])];
  };
  for (const p of people){
    L.push(`0 ${xi.get(p.id)} INDI`);
    L.push(...line(1, "NAME", `${p.given || ""} /${p.surname || ""}/`.trim()));
    if (p.given) L.push(...line(2, "GIVN", p.given));
    if (p.surname) L.push(...line(2, "SURN", p.surname));
    L.push(`1 SEX ${["M", "F"].includes(p.sex) ? p.sex : "U"}`);
    L.push(...ev("BIRT", p.birth), ...ev("DEAT", p.death));
    if (p.notes) L.push(...line(1, "NOTE", p.notes));
    for (const r of p.refs || []) L.push(...line(1, "NOTE", `Jon names a ${r.role}, ${r.name}, whose page couldn't be matched (not in this file).`));
    for (const id of p.photos || []){
      const ph = photoById.get(id);
      if (!ph) continue;
      L.push("1 OBJE", ...line(2, "FILE", ph.file), `3 FORM ${(ph.file.match(/\.(\w+)$/) || [])[1]?.toLowerCase().replace("jpg", "jpeg") || "jpeg"}`, ...(ph.caption ? line(2, "TITL", ph.caption) : []));
    }
    if (p.wikitree) L.push(`1 REFN ${p.wikitree}`, "2 TYPE WikiTree");
    for (const f of famc.get(p.id) || []) L.push(`1 FAMC ${f}`);
    for (const f of fams_.get(p.id) || []) L.push(`1 FAMS ${f}`);
    L.push("1 SOUR @S1@");
    if (p.source?.wayback) L.push(...line(2, "PAGE", p.source.wayback));
  }
  for (const f of fams){
    L.push(`0 ${f.x} FAM`);
    if (f.husb) L.push(`1 HUSB ${xi.get(f.husb)}`);
    if (f.wife) L.push(`1 WIFE ${xi.get(f.wife)}`);
    for (const c of f.children) L.push(`1 CHIL ${xi.get(c)}`);
    L.push(...ev("MARR", f.marr));
  }
  L.push("0 TRLR");
  return L.join("\n") + "\n";
}

export function run(dataDir){
  const people = JSON.parse(fs.readFileSync(path.join(dataDir, "people.json"), "utf8"));
  const photos = fs.existsSync(path.join(dataDir, "photos.json")) ? JSON.parse(fs.readFileSync(path.join(dataDir, "photos.json"), "utf8")) : [];
  const ged = toGedcom(people, photos);
  fs.writeFileSync(path.join(dataDir, "inggs.ged"), ged);
  return { people: people.length, families: (ged.match(/^0 @F\d+@ FAM$/gm) || []).length, bytes: Buffer.byteLength(ged), phrases: (ged.match(/^2 DATE \(/gm) || []).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const r = run(dataDir);
  console.log(`inggs.ged: ${r.people} people, ${r.families} families, ${r.phrases} dates as phrases, ${r.bytes} bytes`);
}
