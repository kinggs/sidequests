// node --test from the repo root. Synthetic fixtures only (tools/fixtures/, invented people in
// Gedpage's pattern): nothing here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anyYear, buildPeople, buildPhotos, decode, findPeople, imageSize, pageImages, parseFamily, parseNames, slug, splitName, validate, writeSection, yearOf } from "./parse.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = f => fs.readFileSync(path.join(FIX, f));
const families = () => new Map(["fam00001", "fam00002", "fam00003", "fam00004"].map(f => [f, parseFamily(read(`${f}.htm`))]));
const built = () => buildPeople(families(), parseNames(read("names1.htm")), fam => ({ url: `http://tree.example.org/html/${fam}.htm`, wayback: `https://web.archive.org/web/2017/${fam}`, captured: 1 }));
const named = (people, name) => people.find(p => p.name === name);

test("yearOf reads a year only from an exact date", () => {
  assert.equal(yearOf("30 DEC 1922"), 1922);
  assert.equal(yearOf("MAR 1850"), 1850);
  assert.equal(yearOf("4 JUNE 1901"), 1901);
  assert.equal(yearOf("1845"), 1845);
  assert.equal(yearOf("12 FEB 1750/51"), 1750);
  for (const d of ["ABT 1850", "BEF 1900", "Aft 1800", "22 MAR", "D. 1850", "12 MAY 18??", "", undefined]) assert.equal(yearOf(d), null, d);
  assert.equal(anyYear({ date: "ABT 1850", year: null }), 1850);
  assert.equal(anyYear({ date: "22 MAR", year: null }), null);
});

test("parseFamily reads both sides, the marriage and every child, with links and blanks", () => {
  const f = parseFamily(read("fam00001.htm"));
  assert.equal(f.build, "17 July 2006");
  assert.equal(f.husband.name, "Albert Quill FENWICK");
  assert.deepEqual(f.husband.born, { date: "3 MAR 1850", year: 1850, place: "Townsville" });
  assert.deepEqual(f.husband.died, { date: "ABT 1920", year: null, place: "" });
  assert.deepEqual(f.married, { date: "1875", year: 1875, place: "Riverton, St Example's Church" });
  assert.equal(f.husband.father, null);
  assert.deepEqual(f.husband.others, [{ name: "Ivy NASH", fam: "fam00004" }]);
  assert.deepEqual(f.wife.died, { date: "12 FEB 1930/31", year: 1930, place: "Townsville" });
  assert.equal(f.children.length, 3);
  assert.deepEqual(f.children.map(c => [c.name, c.fam]), [["Dora May FENWICK", "fam00002"], ["D1 Ernest FENWICK", null], ["Frank FENWICK", "fam00005"]]);
  assert.deepEqual(f.children[0].spouses, [{ name: "Edwin TOLLER", fam: "fam00002" }]);
  assert.deepEqual(f.children[1].born, { date: "22 MAR", year: null, place: "" });
  const crlf = parseFamily(decode(read("fam00002.htm")).replace(/\n/g, "\r\n"));
  assert.deepEqual(crlf.wife.father, { name: "Albert Quill FENWICK", fam: "fam00001" });
  const blank = parseFamily(read("fam00003.htm"));
  assert.equal(blank.wife, null);
  assert.equal(blank.husband.name, "Frank FENWICK");
  assert.equal(parseFamily("<html><body>Not a family</body></html>"), null);
});

test("parseNames splits SURNAME, Given and the dates, and decodes Latin-1", () => {
  const rows = parseNames(read("names1.htm"));
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { surname: "BEAMISH", given: "Clara", name: "Clara BEAMISH", fam: "fam00001", birth: "1852", death: "12 FEB 1930/31" });
  assert.deepEqual(rows.find(r => r.given === "Ida"), { surname: "FENWICK", given: "Ida", name: "Ida FENWICK", fam: "fam00003", birth: "", death: "" });
  const latin = parseNames(Buffer.concat([Buffer.from('<A HREF="fam00009.htm">LEBR'), Buffer.from([0xe2]), Buffer.from('N, Anne</A> (1900-)<BR>')]));
  assert.equal(latin[0].surname, "LEBRâN");
});

test("splitName takes the trailing capitals, never an initial", () => {
  assert.deepEqual(splitName("Mabel R. QUIRK"), { given: "Mabel R.", surname: "QUIRK" });
  assert.deepEqual(splitName("Owain VAN DER ESK"), { given: "Owain", surname: "VAN DER ESK" });
  assert.deepEqual(splitName("D1 Edna PLOVER"), { given: "D1 Edna", surname: "PLOVER" });
  assert.deepEqual(splitName("Anne-Marie O'NEIL-SMITH"), { given: "Anne-Marie", surname: "O'NEIL-SMITH" });
  assert.equal(slug("Zoë D'Arcy  FENWICK 1850"), "zoe-d-arcy-fenwick-1850");
});

test("buildPeople joins a person's appearances only where the linked page names them", () => {
  const { people, log } = built();
  assert.equal(people.length, 10);   // Albert once, though on two pages; nobody for fam00003's blank wife
  const albert = named(people, "Albert Quill FENWICK");
  assert.equal(albert.id, "albert-quill-fenwick-1850");
  assert.equal(albert.sex, "M");
  assert.deepEqual(albert.spouses.map(s => [s.name, s.date, s.place]), [["Clara BEAMISH", "1875", "Riverton, St Example's Church"], ["Ivy NASH", "1932", "Port Example"]]);
  assert.equal(albert.children.length, 3);
  assert.equal(albert.source.url, "http://tree.example.org/html/fam00001.htm");
  const dora = named(people, "Dora May FENWICK");
  assert.equal(dora.sex, "F");
  assert.deepEqual(dora.parents.sort(), [albert.id, named(people, "Clara BEAMISH").id].sort());
  assert.deepEqual(dora.spouses.map(s => s.id), [named(people, "Edwin TOLLER").id]);
  assert.equal(dora.source.url, "http://tree.example.org/html/fam00002.htm");   // her own page, not her parents'
  const george = named(people, "George TOLLER");
  assert.deepEqual(george.parents.sort(), [dora.id, named(people, "Edwin TOLLER").id].sort());
  assert.equal(george.sex, "U");
  // Frank's link pointed at a page that doesn't exist; the names index put him on fam00003.
  const frank = named(people, "Frank FENWICK");
  assert.deepEqual(frank.parents.sort(), [albert.id, named(people, "Clara BEAMISH").id].sort());
  assert.deepEqual(frank.children, [named(people, "Ida FENWICK").id]);
  assert.deepEqual(log.childFixedByIndex.map(x => x.name), ["Frank FENWICK"]);
  // Jon's prefix stays in the name; a date with no year keeps its text.
  const ernest = named(people, "D1 Ernest FENWICK");
  assert.deepEqual([ernest.given, ernest.surname, ernest.id, ernest.birth.date, ernest.birth.year], ["D1 Ernest", "FENWICK", "d1-ernest-fenwick", "22 MAR", null]);
  // A father whose page isn't there is a ref, not a guess.
  assert.deepEqual(named(people, "Ivy NASH").refs, [{ role: "father", name: "Jack NASH" }]);
  assert.equal(log.indexUnmatched.length, 0);
  assert.equal(log.notInIndex, 0);
  for (const p of people) assert.ok(p.source.wayback, p.name);
});

test("buildPeople gives a clash a -2 and reports a page from another build", () => {
  const fams = families();
  const odd = parseFamily(decode(read("fam00003.htm")).replace("17 July 2006", "4 July 2002").replace("Ida FENWICK", "Edwin TOLLER").replace("Born:                  at:   \nMarried", "Born: 1874             at:   \nMarried"));
  fams.set("fam00003", odd);
  const { people, log } = buildPeople(fams, parseNames(read("names1.htm")));
  assert.deepEqual(people.filter(p => p.name === "Edwin TOLLER").map(p => p.id), ["edwin-toller-1874", "edwin-toller-1874-2"]);
  assert.deepEqual(log.stale, [{ fam: "fam00003", build: "4 July 2002" }]);
});

test("buildPeople leaves a link unresolved when both sides of the page carry the name", () => {
  const fams = families();
  const same = decode(read("fam00004.htm")).replace("Ivy NASH</B>", "Albert Quill FENWICK</B>");
  fams.set("fam00004", parseFamily(same));
  const { log } = buildPeople(fams, parseNames(read("names1.htm")));
  assert.ok(log.otherUnverified.some(x => x.linked === "fam00004"));
  assert.deepEqual(log.sexConflicts, []);
});

test("findPeople matches by given, surname and the year after the name; never on a guess", () => {
  const { people } = built();
  const r = findPeople("Albert Quill Fenwick (1850-1920) and Clara Beamish (1852-1930)", people);
  assert.deepEqual(r.ids, [named(people, "Albert Quill FENWICK").id, named(people, "Clara BEAMISH").id]);
  assert.deepEqual(findPeople("Mr. Frank Fenwick stands at the door", people).ids, [named(people, "Frank FENWICK").id]);
  assert.deepEqual(findPeople("ALBERT Q. FENWICK", people).ids, [named(people, "Albert Quill FENWICK").id]);
  assert.deepEqual(findPeople("Ernest Fenwick's medal", people).ids, [named(people, "D1 Ernest FENWICK").id]);
  assert.deepEqual(findPeople("Albert Fenwick (1851-1920)", people).unmatched, ["Albert Fenwick (1851)"]);
  assert.deepEqual(findPeople("Zed Fenwick and Brother Fenwick", people).unmatched, ["Zed Fenwick"]);
  assert.deepEqual(findPeople("A letter from Mary Smith", people), { ids: [], matched: [], ambiguous: [], unmatched: [] });
  // Two Toller boys called George → ambiguous until a year says which.
  const twins = [...people, { ...named(people, "George TOLLER"), id: "george-toller-1903", birth: { date: "1903", year: 1903, place: "" } }];
  assert.deepEqual(findPeople("George Toller", twins).ambiguous, [{ name: "George Toller", count: 2 }]);
  assert.deepEqual(findPeople("George Toller (1903-80)", twins).ids, ["george-toller-1903"]);
  // The last surname in a run wins: Clara Fenwick Beamish is a Beamish (Fenwick is a surname too).
  assert.deepEqual(findPeople("Clara Fenwick Beamish", [...people, { id: "cfb", given: "Clara Fenwick", surname: "BEAMISH", birth: {} }]).ids, ["cfb"]);
});

test("pageImages finds Jon's caption for each image", () => {
  const imgs = pageImages(read("photos.htm"));
  const by = Object.fromEntries(imgs.map(i => [i.file, [i.caption, i.how]]));
  assert.deepEqual(by["albert.jpg"], ["Albert Quill Fenwick (1850-1920)", "link and dates"]);
  assert.deepEqual(by["clara.jpg"], ["Clara Beamish (1852-1930)", "link and dates"]);
  assert.deepEqual(by["fam-1900.jpg"], ["Dora Fenwick and Edwin Toller on their wedding day in 1900", "cell"]);
  assert.deepEqual(by["shop.jpg"], ["The Fenwick shop in Townsville, about 1890. Mr. Frank Fenwick stands at the door.", "next row"]);
  assert.deepEqual(by["house.jpg"], ["The house", "alt"]);
  assert.deepEqual(by["letter.gif"], ["Some early Fenwick photographs", "page title"]);
});

test("buildPhotos makes one photo per file, links the people, and marks what was recovered", () => {
  const { people } = built();
  const { photos, log } = buildPhotos([{ file: "photos.htm", html: read("photos.htm"), source: { url: "u", wayback: "w", captured: 2 } }], people, {
    exists: f => f !== "letter.gif", sizeOf: f => f === "shop.jpg" ? { w: 400, h: 300 } : null,
  });
  assert.equal(photos.length, 6);
  const shop = photos.find(p => p.id === "shop");
  assert.deepEqual([shop.file, shop.recovered, shop.w, shop.h, shop.people], ["shop.jpg", true, 400, 300, [named(people, "Frank FENWICK").id]]);
  assert.equal(photos.find(p => p.id === "letter").recovered, false);
  assert.deepEqual(photos.find(p => p.id === "fam-1900").people.sort(), [named(people, "Dora May FENWICK").id, named(people, "Edwin TOLLER").id].sort());
  assert.deepEqual(named(people, "Frank FENWICK").photos, ["shop"]);
  assert.equal(log.captions.length, 6);
  assert.deepEqual(validate(people, photos), { dangling: [], fixed: [] });
});

test("validate mirrors a one-sided link and drops an id that resolves nowhere", () => {
  const p = (id, x = {}) => ({ id, name: id, parents: [], children: [], spouses: [], photos: [], ...x });
  const people = [p("a", { children: ["b"], spouses: [{ id: "c", name: "c", date: "1900", place: "" }], photos: ["gone"] }), p("b", { parents: ["zz"] }), p("c")];
  const log = validate(people, []);
  assert.deepEqual(people[1].parents, ["a"]);
  assert.deepEqual(people[2].spouses, [{ id: "a", name: "a", date: "1900", place: "" }]);
  assert.deepEqual(people[0].photos, []);
  assert.deepEqual(log.dangling.map(d => d.id), ["gone", "zz"]);
  assert.equal(log.fixed.length, 2);
});

test("imageSize reads JPEG, GIF and PNG headers", () => {
  const gif = Buffer.alloc(30); gif.write("GIF89a"); gif.writeUInt16LE(99, 6); gif.writeUInt16LE(172, 8);
  assert.deepEqual(imageSize(gif), { w: 99, h: 172 });
  const png = Buffer.alloc(30); png[0] = 0x89; png.write("PNG", 1); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  assert.deepEqual(imageSize(png), { w: 640, h: 480 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 44, 1, 144, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg), { w: 400, h: 300 });
  assert.equal(imageSize(Buffer.from("nope")), null);
});

test("writeSection rewrites only its own part of the report", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-")), "r.md");
  writeSection(file, "a", "A one");
  writeSection(file, "b", "B one");
  writeSection(file, "a", "A two");
  const doc = fs.readFileSync(file, "utf8");
  assert.ok(doc.includes("<!-- a -->\nA two\n<!-- /a -->"));
  assert.ok(doc.includes("<!-- b -->\nB one\n<!-- /b -->"));
  assert.ok(!doc.includes("A one"));
});
