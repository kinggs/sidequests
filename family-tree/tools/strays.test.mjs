// node --test from the repo root. A synthetic page only: nothing here is from the real site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRefs, findStrays, onSiteRefs } from "./strays.mjs";

const PAGE = "http://home.intekom.com/joni/people/p1.htm";
const HTML = `<html><head><link rel="stylesheet" href="../style.css">
<style>body { background: url('img/bg.gif') } .x { background-image: url(../img/dot.png) }</style>
<script>function pic(){ window.open('../photos/ph7.htm','pic'); } var s = "thumbs/t1.JPG";</script></head>
<body background="../img/paper.jpg">
<a href="p2.htm">A parent</a> <a href='p3.htm#kids'>A child</a> <a href=p4.htm>bare</a>
<a href="/joni/surnames.htm">Index</a> <a href="http://www.home.intekom.com/joni/people/p5.htm">full</a>
<a href="https://home.intekom.com/joni/people/p2.htm">again, https</a>
<a href="http:\\home.intekom.com/joni/">Jon's backslashes</a>
<img src="../photos/a.jpg" lowsrc="../photos/a-small.gif" onclick="pic('../photos/ph8.htm')">
<frame src="frame.htm"><iframe src='inner.htm'></iframe>
<a href="mailto:someone@example.com">mail</a> <a href="javascript:void(0)">js</a> <a href="#top">top</a>
<a href="http://www.example.com/elsewhere.htm">off site</a> <a href="p.php?id=9&amp;x=1">query</a>
</body></html>`;

test("extractRefs finds attributes, CSS url() and file names in scripts and handlers", () => {
  const refs = extractRefs(HTML);
  for (const r of ["../style.css", "img/bg.gif", "../img/dot.png", "../photos/ph7.htm", "thumbs/t1.JPG", "../img/paper.jpg",
    "p2.htm", "p3.htm#kids", "p4.htm", "/joni/surnames.htm", "../photos/a.jpg", "../photos/a-small.gif", "../photos/ph8.htm",
    "frame.htm", "inner.htm", "p.php?id=9&x=1"]) assert.ok(refs.includes(r), `missing ${r}`);
  assert.equal(refs.filter(r => r === "p2.htm").length, 1);
});

test("onSiteRefs resolves against the page, folds spellings and drops off-site and non-web links", () => {
  const keys = onSiteRefs(extractRefs(HTML), PAGE);
  for (const k of ["home.intekom.com/joni/people/p2.htm", "home.intekom.com/joni/people/p3.htm", "home.intekom.com/joni/surnames.htm",
    "home.intekom.com/joni/people/p5.htm", "home.intekom.com/joni/", "home.intekom.com/joni/photos/ph7.htm",
    "home.intekom.com/joni/style.css", "home.intekom.com/joni/people/img/bg.gif", "home.intekom.com/joni/img/dot.png",
    "home.intekom.com/joni/people/p.php?id=9&x=1"]) assert.ok(keys.includes(k), `missing ${k}`);
  assert.ok(!keys.some(k => /example\.com|mailto|javascript|#/.test(k)));
  assert.ok(!keys.some(k => k === "home.intekom.com/" || k.startsWith("home.intekom.com/jonix")), "only under /joni");
  assert.equal(keys.filter(k => k.endsWith("/people/p2.htm")).length, 1);
});

test("findStrays lists only what isn't known, with the page that first linked it", () => {
  const known = new Set(["home.intekom.com/joni/people/p2.htm", "home.intekom.com/joni/"]);
  const strays = findStrays([{ url: PAGE, html: HTML }, { url: "http://home.intekom.com/joni/people/p9.htm", html: `<a href="p10.htm">x</a>` }], known);
  assert.ok(!strays.has("home.intekom.com/joni/people/p2.htm"));
  assert.equal(strays.get("home.intekom.com/joni/people/p3.htm"), "home.intekom.com/joni/people/p1.htm");
  assert.equal(strays.get("home.intekom.com/joni/people/p10.htm"), "home.intekom.com/joni/people/p9.htm");
});

test("onSiteRefs folds the old .co.za address into the site and leaves the forwarder off it", () => {
  const keys = onSiteRefs(['http://home.intekom.co.za/joni/html/fam00002.htm', 'http://familytree.inggs.com/', '/other/x.htm'], PAGE);
  assert.deepEqual(keys, ["home.intekom.com/joni/html/fam00002.htm"]);
});
