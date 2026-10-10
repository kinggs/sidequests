// node --test from the repo root. Synthetic rows only: nothing here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, canonical, onSite, describe, kindOf, parseCdx, pickBest, waybackRaw, TARGET } from "./cdx.mjs";

const H = "home.example.net/tree", ALIAS = { "home.example.org/tree": H };   // invented: the real site is in data/site.json
const T = "20100214230828";   // the fixtures' own target, whatever TARGET is now

const FIELDS = ["timestamp", "original", "statuscode", "mimetype", "digest", "length"];
const row = (ts, url, status = "200", mime = "text/html", digest = "D" + ts + url.length, length = "1000") => [ts, url, status, mime, digest, length];
const HOME = "http://home.example.net/tree/";
const P1 = "http://home.example.net/tree/people/p1.htm";
const IMG = "http://home.example.net/tree/photos/old.jpg";

test("parseCdx reads the header row, numbers lengths and spots a resume key", () => {
  const { rows, resumeKey } = parseCdx([FIELDS, row("20100214230828", HOME), [], ["key123"]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, HOME);
  assert.equal(rows[0].status, "200");
  assert.equal(rows[0].length, 1000);
  assert.equal(resumeKey, "key123");
  assert.deepEqual(parseCdx("[]"), { rows: [], resumeKey: null });
  assert.equal(parseCdx([FIELDS, row("20100214230828", HOME)]).resumeKey, null);
});

test("canonical folds http/https, www, a trailing index page and case of the host", () => {
  assert.equal(canonical("https://WWW.home.example.net/tree/people/P1.htm"), "home.example.net/tree/people/P1.htm");
  assert.equal(canonical("http://home.example.net/tree/index.html"), "home.example.net/tree/");
  assert.equal(canonical("home.example.net/tree//people//"), "home.example.net/tree/people/");
  assert.equal(canonical("http://home.example.net/tree/p.php?id=3"), "home.example.net/tree/p.php?id=3");
});

test("kindOf tells pages, images, GEDCOM, assets and revisits apart", () => {
  assert.equal(kindOf({ url: P1, mime: "text/html" }), "page");
  assert.equal(kindOf({ url: HOME, mime: "text/html" }), "page");
  assert.equal(kindOf({ url: IMG, mime: "image/jpeg" }), "image");
  assert.equal(kindOf({ url: "http://x/a.ged", mime: "application/octet-stream" }), "gedcom");
  assert.equal(kindOf({ url: "http://x/s.css", mime: "text/css" }), "asset");
  assert.equal(kindOf({ url: "http://x/thing", mime: "warc/revisit" }), "revisit");
});

test("pickBest takes the 200 nearest the target, preferring on or before it", () => {
  const { rows } = parseCdx([FIELDS,
    row("20090101000000", P1), row("20100214230828", P1), row("20100301000000", P1),
    row("20080101000000", HOME), row("20100601000000", HOME),            // only later than target is 200? no: both 200; nearest earlier wins
    row("20100214230828", IMG, "404"), row("20090501000000", IMG),       // 404 on the day; an earlier 200
  ]);
  const best = pickBest(rows, T);
  assert.equal(best.get("home.example.net/tree/people/p1.htm").timestamp, "20100214230828");
  assert.equal(best.get("home.example.net/tree/").timestamp, "20080101000000");
  assert.equal(best.get("home.example.net/tree/photos/old.jpg").timestamp, "20090501000000");
  assert.equal(best.get("home.example.net/tree/people/p1.htm").captures, 3);
  assert.equal(best.get("home.example.net/tree/people/p1.htm").distance, 0);
});

test("pickBest falls back to a later 200, and keeps a URL that never returned 200", () => {
  const { rows } = parseCdx([FIELDS,
    row("20110101000000", P1), row("20120101000000", P1),
    row("20100214230828", IMG, "401"), row("20110101000000", IMG, "401"),
  ]);
  const best = pickBest(rows, T);
  assert.equal(best.get("home.example.net/tree/people/p1.htm").timestamp, "20110101000000");
  const img = best.get("home.example.net/tree/photos/old.jpg");
  assert.equal(img.status, "401");
  assert.equal(img.timestamp, "20100214230828");
});

test("a revisit counts as the status of the capture it points at", () => {
  const { rows } = parseCdx([FIELDS,
    row("20090101000000", P1, "200", "text/html", "SAME"),
    row("20100214230828", P1, "-", "warc/revisit", "SAME"),
  ]);
  const best = pickBest(rows, T).get("home.example.net/tree/people/p1.htm");
  assert.equal(best.timestamp, "20100214230828");
  assert.equal(best.status, "200");
  assert.equal(best.kind, "page");   // kindOf reads the URL's .htm, not the revisit mime
});

test("analyse counts kinds, statuses, years and the URL conventions", () => {
  const { rows } = parseCdx([FIELDS,
    row("20100214230828", HOME), row("20100214230828", P1), row("20100214230828", "http://home.example.net/tree/people/p2.htm"),
    row("20100214230828", IMG, "200", "image/jpeg"), row("20100214230828", "http://home.example.net/tree/surnames.htm"),
    row("20100214230828", "http://home.example.net/tree/tree.ged", "200", "application/octet-stream"),
    row("20120101000000", "http://home.example.net/tree/photos/gone.jpg", "401", "image/jpeg"),
  ]);
  const a = analyse(rows, pickBest(rows, T), H, T);
  assert.equal(a.captures, 7);
  assert.equal(a.urls, 7);
  assert.equal(a.missing, 1);
  assert.deepEqual(a.kinds, { page: 4, image: 2, gedcom: 1 });
  assert.deepEqual(a.statuses, { 200: 6, 401: 1 });
  assert.deepEqual(a.years, { 2010: 6, 2012: 1 });
  assert.equal(a.prefixes["/people/"], 2);
  assert.equal(a.prefixes["/photos/"], 2);
  assert.equal(a.prefixes["/"], 3);           // the home page, surnames.htm and tree.ged sit at the root
  assert.deepEqual(a.gedcom, ["http://home.example.net/tree/tree.ged"]);
  assert.equal(a.onTarget, 6);
  const text = describe(a);
  assert.match(text, /Captures 7 of 7 URLs, 2010-02-14 to 2012-01-01/);
  assert.match(text, /GEDCOM found/);
  assert.match(text, /6 URLs best-captured on 2010-02-14/);
});

test("TARGET is a full Wayback timestamp", () => assert.match(TARGET, /^\d{14}$/));

test("the raw Wayback URL carries the id_ flag", () => {
  assert.equal(waybackRaw(T, HOME), "https://web.archive.org/web/20100214230828id_/http://home.example.net/tree/");
});

test("canonical folds home.example.org/tree into home.example.net/tree, and onSite stays under the prefix", () => {
  assert.equal(canonical("http://home.example.org:80/tree/html/fam00001.htm", ALIAS), "home.example.net/tree/html/fam00001.htm");
  assert.equal(canonical("http://home.example.org/tree", ALIAS), "home.example.net/tree");
  assert.equal(canonical("http://home.example.org/treex/a.htm", ALIAS), "home.example.org/treex/a.htm");
  assert.ok(onSite("home.example.net/tree", H) && onSite("home.example.net/tree/a.htm", H));
  assert.ok(!onSite("home.example.net/treex/a.htm", H) && !onSite("familytree.inggs.com/", H));
  assert.ok(onSite("familytree.inggs.com/", "familytree.inggs.com"));
});
