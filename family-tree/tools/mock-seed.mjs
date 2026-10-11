#!/usr/bin/env node
// family-tree/tools/mock-seed.mjs — Session 3 step 3 (PLAN.md): an invented family for ?mock, in
// the seed's format, committed (nothing in it is real). Four generations of Fenwicks and Tollers:
// two born within the last 100 years, one with no birth year, one unresolved ref, six photos as
// small generated images, captions, a story, two WikiTree copies (one adds to Jon's dates, one
// disagrees), a suggestion, two members besides the mock owner.
//
//   node family-tree/tools/mock-seed.mjs     → shared/proofs/seeds/family-tree-mock.json
//
// Open with: family-tree/?mock&seed=../shared/proofs/seeds/family-tree-mock.json

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CREDIT } from "./gedcom.mjs";
import { yearOf } from "./parse.mjs";

// A small PNG of one colour with a darker band, as a data URL: enough to see a photo is there.
export function png(w, h, [r, g, b]){
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++){
    const dark = y > h * 0.62 && y < h * 0.78 ? 0.6 : 1;
    for (let x = 0; x < w; x++){ const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r * dark; raw[o + 1] = g * dark; raw[o + 2] = b * dark; }
  }
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + file.toString("base64");
}

const SRC = page => ({ url: `http://tree.example.org/html/${page}.htm`, wayback: `https://web.archive.org/web/20170702000000/http://tree.example.org/html/${page}.htm`, captured: Date.UTC(2017, 6, 2) });
const ev = (date = "", place = "") => ({ date, year: yearOf(date), place });

export function mockSeed(now = Date.UTC(2026, 9, 10)){
  // [id, name, given, surname, sex, birth, death, page]
  const rows = [
    ["albert-quill-fenwick-1850", "Albert Quill FENWICK", "Albert Quill", "FENWICK", "M", ev("3 MAR 1850", "Townsville"), ev("14 JUN 1921", "Townsville"), "fam00001"],
    ["clara-beamish-1852", "Clara BEAMISH", "Clara", "BEAMISH", "F", ev("1852", "Riverton"), ev("ABT 1930", ""), "fam00001"],
    ["dora-may-fenwick-1876", "Dora May FENWICK", "Dora May", "FENWICK", "F", ev("4 APR 1876", "Townsville"), ev("1950", "Port Example"), "fam00002"],
    ["edwin-toller-1874", "Edwin TOLLER", "Edwin", "TOLLER", "M", ev("1874", ""), ev("2 FEB 1940", "Port Example"), "fam00002"],
    ["frank-fenwick-1878", "Frank FENWICK", "Frank", "FENWICK", "M", ev("1878", "Townsville"), ev("1940", ""), "fam00003"],
    ["d1-ernest-fenwick", "D1 Ernest FENWICK", "D1 Ernest", "FENWICK", "U", ev("22 MAR", ""), ev(), "fam00001"],
    ["ivy-nash-1860", "Ivy NASH", "Ivy", "NASH", "F", ev("1860", ""), ev(), "fam00004"],
    ["george-toller-1901", "George TOLLER", "George", "TOLLER", "M", ev("12 JAN 1901", "Riverton"), ev("1978", "Riverton"), "fam00005"],
    ["helen-ward-1905", "Helen WARD", "Helen", "WARD", "F", ev("1905", "Port Example"), ev("1999", "Riverton"), "fam00005"],
    ["ida-fenwick-1905", "Ida FENWICK", "Ida", "FENWICK", "F", ev("1905", ""), ev("1988", ""), "fam00003"],
    ["james-toller-1930", "James TOLLER", "James", "TOLLER", "M", ev("8 AUG 1930", "Riverton"), ev("2001", "Port Example"), "fam00006"],
    ["kate-toller-1933", "Kate TOLLER", "Kate", "TOLLER", "F", ev("1933", "Riverton"), ev("2010", ""), "fam00005"],
    ["lena-orme-1934", "Lena ORME", "Lena", "ORME", "F", ev("1934", ""), ev(), "fam00006"],
    ["mark-toller-1960", "Mark TOLLER", "Mark", "TOLLER", "M", ev("14 MAY 1960", "Port Example"), ev(), "fam00006"],
    ["nina-toller-1964", "Nina TOLLER", "Nina", "TOLLER", "F", ev("1964", "Port Example"), ev(), "fam00006"],
  ];
  const people = rows.map(([id, name, given, surname, sex, birth, death, page]) => ({ id, name, given, surname, sex, birth, death, parents: [], spouses: [], children: [], notes: "", photos: [], refs: [], source: SRC(page) }));
  const P = new Map(people.map(p => [p.id, p]));
  const marry = (a, b, date = "", place = "") => { P.get(a).spouses.push({ id: b, name: P.get(b).name, date, place }); P.get(b).spouses.push({ id: a, name: P.get(a).name, date, place }); };
  const kids = (ps, cs) => { for (const c of cs){ P.get(c).parents.push(...ps); for (const p of ps) P.get(p).children.push(c); } };
  marry("albert-quill-fenwick-1850", "clara-beamish-1852", "1875", "Riverton, St Example's Church");
  marry("albert-quill-fenwick-1850", "ivy-nash-1860", "1932", "Port Example");
  marry("dora-may-fenwick-1876", "edwin-toller-1874", "1900", "Riverton");
  marry("george-toller-1901", "helen-ward-1905", "1928", "Riverton");
  marry("james-toller-1930", "lena-orme-1934", "1958", "Port Example");
  kids(["albert-quill-fenwick-1850", "clara-beamish-1852"], ["dora-may-fenwick-1876", "d1-ernest-fenwick", "frank-fenwick-1878"]);
  kids(["frank-fenwick-1878"], ["ida-fenwick-1905"]);
  kids(["dora-may-fenwick-1876", "edwin-toller-1874"], ["george-toller-1901"]);
  kids(["george-toller-1901", "helen-ward-1905"], ["james-toller-1930", "kate-toller-1933"]);
  kids(["james-toller-1930", "lena-orme-1934"], ["mark-toller-1960", "nina-toller-1964"]);
  P.get("ivy-nash-1860").refs.push({ role: "father", name: "Jack NASH" });
  P.get("albert-quill-fenwick-1850").notes = "Kept the shop on Main Street for forty years.";
  P.get("edwin-toller-1874").wikitree = "Toller-7";
  P.get("dora-may-fenwick-1876").wikitree = "Fenwick-3";
  // The WikiTree copy (wikitree.mjs --cache): Edwin's adds a day and place to Jon's 1874, and
  // names a father Jon didn't have; Dora's birth is a day off Jon's.
  const fetchedAt = Date.UTC(2026, 9, 11);
  const wikitree = [
    { id: "Toller-7", person: "edwin-toller-1874", fetchedAt, name: "Edwin Toller", gender: "Male", manager: "Jon Inggs", touched: "20250301120000",
      birth: { date: "1874-06-02", place: "Riverton" }, death: { date: "1940-02-02", place: "Port Example" },
      relatives: [
        { role: "father", wikitree: "Toller-2", name: "Silas Toller", birth: "1840-00-00", death: "1901-00-00" },
        { role: "spouse", wikitree: "Fenwick-3", name: "Dora May Fenwick", birth: "1876-04-05", death: "1950-00-00", date: "1900-00-00", place: "Riverton" },
      ] },
    { id: "Fenwick-3", person: "dora-may-fenwick-1876", fetchedAt, name: "Dora May Fenwick", lastNameCurrent: "Toller", gender: "Female", manager: "Jon Inggs",
      birth: { date: "1876-04-05", place: "Townsville" }, death: { date: "1950-00-00", place: "Port Example" },
      relatives: [{ role: "spouse", wikitree: "Toller-7", name: "Edwin Toller", birth: "1874-06-02", death: "1940-02-02", date: "1900-00-00", place: "Riverton" }] },
  ];

  const COLOURS = [[176, 150, 210], [210, 140, 120], [150, 170, 140], [190, 175, 130], [130, 160, 190], [170, 150, 150]];
  const photoRows = [
    ["albert", "Albert Quill Fenwick (1850-1921)", ["albert-quill-fenwick-1850"], 3, 4],
    ["clara", "Clara Beamish (1852-1930)", ["clara-beamish-1852"], 3, 4],
    ["wedding-1900", "Dora Fenwick and Edwin Toller on their wedding day in 1900", ["dora-may-fenwick-1876", "edwin-toller-1874"], 4, 3],
    ["shop", "The Fenwick shop in Townsville, about 1890. Frank Fenwick stands at the door.", ["frank-fenwick-1878"], 4, 3],
    ["house", "The house", [], 4, 3],
    ["letter", "A letter from the shop, 1895", [], 3, 4],
  ];
  const photos = photoRows.map(([id, caption, ids, w, h], i) => ({
    id, caption, people: ids, names: ids.map(x => P.get(x).name), file: `${id}.jpg`, recovered: id !== "letter",
    thumb: id === "letter" ? "" : png(w * 20, h * 20, COLOURS[i]), w: w * 100, h: h * 100, source: SRC("photos"),
  }));
  for (const ph of photos) for (const id of ph.people) P.get(id).photos.push(ph.id);
  const images = photos.filter(p => p.recovered).map((p, i) => ({ id: p.id, data: png(p.w / 5, p.h / 5, COLOURS[i]) }));
  const stories = [{
    id: "the-shop", title: "The Fenwick shop", source: SRC("shop"), images: ["shop"], people: ["albert-quill-fenwick-1850", "frank-fenwick-1878"],
    markdown: `# The Fenwick shop\n\n*From Jon Inggs's pages · [the Wayback Machine's copy](${SRC("shop").wayback}) · captured 2 July 2017*\n\n![The shop](photo:shop)\n\n*The Fenwick shop in Townsville, about 1890.*\n\nAlbert Quill Fenwick (1850-1921) opened the shop in 1880. His son **Frank Fenwick** ran it from 1910.\n\nSee [the photographs](story:photos).\n`,
  }];
  const meta = { source: "familytree.example.org", credit: CREDIT, researcher: "Jon Inggs", captured: Date.UTC(2017, 6, 2), people: people.length, photos: photos.length, photosRecovered: images.length, stories: stories.length, wikitree: wikitree.length, wikitreeFetched: fetchedAt, version: "mock" };
  return {
    app: "family-tree", seed: { part: 1, of: 1 }, exportedAt: new Date(now).toISOString(),
    meta: { main: meta }, people, photos, images, stories, wikitree,
    suggestions: [{ id: "s1", person: "ida-fenwick-1905", personName: "Ida FENWICK", text: "Ida was born in Townsville, not Riverton.", by: "mock-ann", byName: "Ann", at: now - 86400000, status: "open" }],
    members: [
      { id: "mock-ann", name: "Ann", since: now - 7 * 86400000, invitedBy: "mock-uid", approvedBy: "mock-uid" },
      { id: "mock-dee", name: "Dee", since: now - 6 * 86400000, invitedBy: "mock-ann", approvedBy: "mock-uid" },
    ],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "shared", "proofs", "seeds", "family-tree-mock.json");
  const seed = mockSeed();
  fs.writeFileSync(out, JSON.stringify(seed, null, 1) + "\n");
  console.log(`${path.relative(process.cwd(), out)}: ${seed.people.length} people, ${seed.photos.length} photos, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
