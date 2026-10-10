// node --test from the repo root. Synthetic rows only: nothing here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, canonical, describe, kindOf, parseCdx, pickBest, waybackRaw, TARGET } from "./cdx.mjs";

const FIELDS = ["timestamp", "original", "statuscode", "mimetype", "digest", "length"];
const row = (ts, url, status = "200", mime = "text/html", digest = "D" + ts + url.length, length = "1000") => [ts, url, status, mime, digest, length];
const HOME = "http://familytree.inggs.com/";
const P1 = "http://familytree.inggs.com/people/p1.htm";
const IMG = "http://familytree.inggs.com/photos/old.jpg";

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
  assert.equal(canonical("https://WWW.familytree.inggs.com/people/P1.htm"), "familytree.inggs.com/people/P1.htm");
  assert.equal(canonical("http://familytree.inggs.com/index.html"), "familytree.inggs.com/");
  assert.equal(canonical("familytree.inggs.com//people//"), "familytree.inggs.com/people/");
  assert.equal(canonical("http://familytree.inggs.com/p.php?id=3"), "familytree.inggs.com/p.php?id=3");
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
  const best = pickBest(rows);
  assert.equal(best.get("familytree.inggs.com/people/p1.htm").timestamp, "20100214230828");
  assert.equal(best.get("familytree.inggs.com/").timestamp, "20080101000000");
  assert.equal(best.get("familytree.inggs.com/photos/old.jpg").timestamp, "20090501000000");
  assert.equal(best.get("familytree.inggs.com/people/p1.htm").captures, 3);
  assert.equal(best.get("familytree.inggs.com/people/p1.htm").distance, 0);
});

test("pickBest falls back to a later 200, and keeps a URL that never returned 200", () => {
  const { rows } = parseCdx([FIELDS,
    row("20110101000000", P1), row("20120101000000", P1),
    row("20100214230828", IMG, "401"), row("20110101000000", IMG, "401"),
  ]);
  const best = pickBest(rows);
  assert.equal(best.get("familytree.inggs.com/people/p1.htm").timestamp, "20110101000000");
  const img = best.get("familytree.inggs.com/photos/old.jpg");
  assert.equal(img.status, "401");
  assert.equal(img.timestamp, "20100214230828");
});

test("a revisit counts as the status of the capture it points at", () => {
  const { rows } = parseCdx([FIELDS,
    row("20090101000000", P1, "200", "text/html", "SAME"),
    row("20100214230828", P1, "-", "warc/revisit", "SAME"),
  ]);
  const best = pickBest(rows).get("familytree.inggs.com/people/p1.htm");
  assert.equal(best.timestamp, "20100214230828");
  assert.equal(best.status, "200");
  assert.equal(best.kind, "page");   // kindOf reads the URL's .htm, not the revisit mime
});

test("analyse counts kinds, statuses, years and the URL conventions", () => {
  const { rows } = parseCdx([FIELDS,
    row("20100214230828", HOME), row("20100214230828", P1), row("20100214230828", "http://familytree.inggs.com/people/p2.htm"),
    row("20100214230828", IMG, "200", "image/jpeg"), row("20100214230828", "http://familytree.inggs.com/surnames.htm"),
    row("20100214230828", "http://familytree.inggs.com/tree.ged", "200", "application/octet-stream"),
    row("20120101000000", "http://familytree.inggs.com/photos/gone.jpg", "401", "image/jpeg"),
  ]);
  const a = analyse(rows);
  assert.equal(a.captures, 7);
  assert.equal(a.urls, 7);
  assert.equal(a.missing, 1);
  assert.deepEqual(a.kinds, { page: 4, image: 2, gedcom: 1 });
  assert.deepEqual(a.statuses, { 200: 6, 401: 1 });
  assert.deepEqual(a.years, { 2010: 6, 2012: 1 });
  assert.equal(a.prefixes["/people/"], 2);
  assert.equal(a.prefixes["/photos/"], 2);
  assert.equal(a.prefixes["/"], 3);           // the home page, surnames.htm and tree.ged sit at the root
  assert.deepEqual(a.gedcom, ["http://familytree.inggs.com/tree.ged"]);
  assert.equal(a.onTarget, 6);
  const text = describe(a);
  assert.match(text, /Captures 7 of 7 URLs, 2010-02-14 to 2012-01-01/);
  assert.match(text, /GEDCOM found/);
});

test("the raw Wayback URL carries the id_ flag", () => {
  assert.equal(waybackRaw(TARGET, HOME), "https://web.archive.org/web/20100214230828id_/http://familytree.inggs.com/");
});
