// node --test from the repo root. The parser's synthetic fixtures (tools/fixtures/), nothing real.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPeople, buildPhotos, parseFamily, parseNames, validate } from "./parse.mjs";
import { families, gedDate, line, toGedcom } from "./gedcom.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = f => fs.readFileSync(path.join(FIX, f));
function tree(){
  const fams = new Map(["fam00001", "fam00002", "fam00003", "fam00004"].map(f => [f, parseFamily(read(`${f}.htm`))]));
  const { people } = buildPeople(fams, parseNames(read("names1.htm")), fam => ({ url: `http://tree.example.org/html/${fam}.htm`, wayback: `https://web.archive.org/web/2017/${fam}`, captured: 1 }));
  const { photos } = buildPhotos([{ file: "photos.htm", html: read("photos.htm"), source: null }], people, { exists: () => true });
  validate(people, photos);
  people.find(p => p.name === "Edwin TOLLER").wikitree = "Toller-7";
  return { people, photos };
}
// The records of a GEDCOM: { xref, tag, lines } for every level-0 line.
const records = ged => {
  const out = [];
  for (const l of ged.trimEnd().split("\n")){
    const m = l.match(/^0 (?:(@[^@]+@) )?(\w+)/);
    if (m) out.push({ xref: m[1] || null, tag: m[2], lines: [] });
    else out[out.length - 1].lines.push(l);
  }
  return out;
};

test("gedDate keeps a date GEDCOM reads and brackets one it doesn't", () => {
  for (const d of ["30 DEC 1922", "MAR 1850", "1845", "ABT 1850", "BEF 1900", "12 FEB 1750/51", "BET 1850 AND 1860"]) assert.equal(gedDate(d), d);
  assert.equal(gedDate("4 JUNE 1901"), "(4 JUNE 1901)");
  assert.equal(gedDate("22 MAR"), "(22 MAR)");
  assert.equal(gedDate("abt 1850"), "(abt 1850)");
  assert.equal(gedDate(""), "");
});

test("line splits long values with CONC, never at a space, and line breaks with CONT", () => {
  const long = line(1, "NOTE", "abcdefghij klmnopqrst", 8);
  assert.equal(long[0].slice(0, 7), "1 NOTE ");
  assert.ok(long.slice(1).every(l => l.startsWith("2 CONC ")));
  assert.equal(long.map(l => l.replace(/^\d \w+ /, "")).join(""), "abcdefghij klmnopqrst");
  for (const l of long) assert.ok(!/ $/.test(l) && !/^\d \w+  /.test(l), l);
  assert.deepEqual(line(1, "NOTE", "one\ntwo"), ["1 NOTE one", "2 CONT two"]);
});

test("families: a FAM per couple and per set of parents", () => {
  const { people } = tree();
  const fams = families(people);
  const id = name => people.find(p => p.name === name).id;
  const albertClara = fams.find(f => f.husb === id("Albert Quill FENWICK") && f.wife === id("Clara BEAMISH"));
  assert.equal(albertClara.children.length, 3);
  assert.deepEqual(albertClara.marr, { date: "1875", place: "Riverton, St Example's Church" });
  assert.ok(fams.some(f => f.husb === id("Albert Quill FENWICK") && f.wife === id("Ivy NASH") && !f.children.length));
  const frank = fams.find(f => f.husb === id("Frank FENWICK"));
  assert.deepEqual([frank.wife, frank.children], [null, [id("Ida FENWICK")]]);
  assert.equal(fams.length, 4);
});

test("toGedcom writes 5.5.1 whose every pointer resolves, crediting Jon", () => {
  const { people, photos } = tree();
  const ged = toGedcom(people, photos, { date: new Date(Date.UTC(2026, 9, 10)) });
  const recs = records(ged);
  assert.equal(recs[0].tag, "HEAD");
  assert.equal(recs.at(-1).tag, "TRLR");
  assert.ok(recs[0].lines.includes("2 VERS 5.5.1") && recs[0].lines.includes("1 CHAR UTF-8") && recs[0].lines.includes("1 DATE 10 OCT 2026"));
  const sour = recs.find(r => r.tag === "SOUR");
  assert.ok(sour.lines.includes("1 AUTH Jon Inggs"));
  assert.ok(sour.lines.some(l => l.includes("familytree.inggs.com, 2006")));
  // Round trip: every pointer has its record, every person is one INDI.
  const defined = new Set(recs.map(r => r.xref).filter(Boolean));
  const pointers = [...ged.matchAll(/^\d \w+ (@[^@]+@)$/gm)].map(m => m[1]);
  assert.ok(pointers.length > 20);
  for (const p of pointers) assert.ok(defined.has(p), p);
  const indis = recs.filter(r => r.tag === "INDI");
  assert.equal(indis.length, people.length);
  const names = indis.map(r => r.lines.find(l => l.startsWith("1 NAME ")).slice(7)).sort();
  assert.deepEqual(names, people.map(p => `${p.given} /${p.surname}/`).sort());
  // FAMC and CHIL agree, FAMS and HUSB/WIFE agree.
  const fam = new Map(recs.filter(r => r.tag === "FAM").map(r => [r.xref, r.lines]));
  for (const r of indis){
    for (const l of r.lines.filter(l => l.startsWith("1 FAMC "))) assert.ok(fam.get(l.slice(7)).includes(`1 CHIL ${r.xref}`));
    for (const l of r.lines.filter(l => l.startsWith("1 FAMS "))) assert.ok(fam.get(l.slice(7)).some(x => x === `1 HUSB ${r.xref}` || x === `1 WIFE ${r.xref}`));
  }
  const ivy = indis.find(r => r.lines.includes("1 NAME Ivy /NASH/"));
  assert.ok(ivy.lines.some(l => l.startsWith("1 NOTE") && l.includes("father, Jack NASH")));
  const albert = indis.find(r => r.lines.includes("1 NAME Albert Quill /FENWICK/"));
  assert.ok(albert.lines.includes("1 OBJE") && albert.lines.includes("2 FILE albert.jpg") && albert.lines.includes("3 FORM jpeg"));
  assert.ok(albert.lines.includes("2 DATE ABT 1920"));
  assert.ok(albert.lines.includes("2 PAGE https://web.archive.org/web/2017/fam00001"));
  const ernest = indis.find(r => r.lines.some(l => l.includes("D1 Ernest")));
  assert.ok(ernest.lines.includes("2 DATE (22 MAR)"));
  assert.ok(indis.some(r => r.lines.includes("1 REFN Toller-7") && r.lines.includes("2 TYPE WikiTree")));
  for (const l of ged.split("\n").filter(Boolean)) assert.match(l, /^\d+ (@[^@]+@ )?\w+( .*)?$/);
});
