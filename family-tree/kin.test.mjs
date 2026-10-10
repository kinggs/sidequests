// node --test family-tree/kin.test.mjs — the Family Tree's pure logic, on the invented mock seed.
import test from "node:test";
import assert from "node:assert/strict";
import { isLiving, yearsText, wtDate, sameDate, layoutTree, markdownToHtml, inline, lineageMarkdown, generationName } from "./kin.js";
import { mockSeed } from "./tools/mock-seed.mjs";

const NOW = new Date(Date.UTC(2026, 9, 10));
const seed = mockSeed(NOW.getTime());
const byId = new Map(seed.people.map(p => [p.id, p]));
const P = id => byId.get(id);

test("the living rule and the years line", () => {
  assert.equal(isLiving(P("mark-toller-1960"), NOW), true);
  assert.equal(isLiving(P("ivy-nash-1860"), NOW), false, "born over 100 years ago");
  assert.equal(isLiving(P("d1-ernest-fenwick"), NOW), true, "no birth year");
  assert.equal(yearsText(P("mark-toller-1960"), { now: NOW }), "");
  assert.equal(yearsText(P("mark-toller-1960"), { now: NOW, details: true }), "b. 1960");
  assert.equal(yearsText(P("clara-beamish-1852"), { now: NOW }), "1852–c. 1930");
});

test("WikiTree's dates beside Jon's", () => {
  assert.equal(wtDate("1863-04-11"), "11 Apr 1863");
  assert.equal(wtDate("1863-04-00"), "Apr 1863");
  assert.equal(wtDate("1863-00-00"), "1863");
  assert.equal(wtDate("0000-00-00"), "");
  assert.equal(wtDate(""), "");
  assert.ok(sameDate("11 APR 1863", "11 Apr 1863"));
  assert.ok(sameDate("ABT 1850", "1850"));
  assert.ok(!sameDate("12 APR 1863", "11 Apr 1863"));
});

// No two cards in a row may share a unit: |x1 − x2| ≥ 1.
const overlaps = t => {
  const bad = [];
  for (const g of t.gens){
    const xs = t.nodes.filter(n => n.gen === g).map(n => n.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 1) bad.push([g, xs[i - 1], xs[i]]);
  }
  return bad;
};

test("the tree: four generations around George, no overlap", () => {
  const t = layoutTree(byId, "george-toller-1901");
  assert.deepEqual(t.gens, [-2, -1, 0, 1, 2]);
  assert.deepEqual(overlaps(t), []);
  const at = id => t.nodes.find(n => n.id === id);
  assert.equal(at("george-toller-1901").side, "centre");
  assert.equal(at("helen-ward-1905").side, "spouse");
  assert.equal(at("edwin-toller-1874").gen, -1, "father");
  assert.ok(at("edwin-toller-1874").x < at("dora-may-fenwick-1876").x, "father first");
  assert.equal(at("clara-beamish-1852").gen, -2);
  assert.equal(at("mark-toller-1960").gen, 2);
  assert.equal(at("mark-toller-1960").side, "down");
  assert.ok(t.nodes.every(n => n.x >= 0 && n.x < t.cols && Number.isInteger(n.x * 2)), "whole or half units, inside the width");
  // Below the centre, a child is joined to both parents shown: George and Helen.
  const james = t.nodes.find(n => n.id === "james-toller-1930");
  assert.deepEqual(t.links.find(l => l.child === james.key).parents.sort(), ["c", "s0"]);
  // Above, George to his two parents.
  assert.equal(t.links.find(l => l.child === "c").parents.length, 2);
});

test("the tree: depth 3 from the youngest reaches the great-grandparents and stops", () => {
  const t = layoutTree(byId, "mark-toller-1960");
  assert.deepEqual(t.gens, [-3, -2, -1, 0]);
  assert.ok(!t.nodes.some(n => n.id === "albert-quill-fenwick-1850"), "four up is past the view");
  assert.deepEqual(overlaps(t), []);
});

test("the tree: nobody above or below", () => {
  const t = layoutTree(byId, "ivy-nash-1860");
  assert.deepEqual(t.gens, [0]);
  assert.deepEqual(t.nodes.map(n => n.side), ["centre", "spouse"]);
  assert.deepEqual(t.links, []);
  assert.equal(layoutTree(byId, "nobody"), null);
});

test("the tree: a wide family never overlaps", () => {
  // Fourteen children, each with three, each with two: and two parents each way up.
  const m = new Map();
  const add = (id, extra = {}) => m.set(id, { id, name: id, sex: "U", parents: [], children: [], spouses: [], birth: {}, death: {}, ...extra });
  add("c");
  for (let i = 0; i < 14; i++){
    add(`k${i}`, { parents: ["c"] }); m.get("c").children.push(`k${i}`);
    for (let j = 0; j < (i % 4); j++){
      add(`k${i}g${j}`, { parents: [`k${i}`] }); m.get(`k${i}`).children.push(`k${i}g${j}`);
      for (let h = 0; h < 2; h++){ add(`k${i}g${j}h${h}`, { parents: [`k${i}g${j}`] }); m.get(`k${i}g${j}`).children.push(`k${i}g${j}h${h}`); }
    }
  }
  add("f", { sex: "M" }); add("mo", { sex: "F" }); m.get("c").parents = ["mo", "f"];
  const t = layoutTree(m, "c");
  assert.deepEqual(overlaps(t), []);
  assert.ok(t.nodes.find(n => n.id === "f").x < t.nodes.find(n => n.id === "mo").x, "father first, whatever the stored order");
});

test("Markdown: the mock story", () => {
  const html = markdownToHtml(seed.stories[0].markdown);
  assert.match(html, /^<h1>The Fenwick shop<\/h1>/);
  assert.match(html, /<figure data-photo="shop"><figcaption>The shop<\/figcaption><\/figure>/);
  assert.match(html, /<strong>Frank Fenwick<\/strong>/);
  assert.match(html, /<a href="#" data-story="photos">the photographs<\/a>/);
  assert.match(html, /<a href="https:\/\/web\.archive\.org\/[^"]+" target="_blank" rel="noopener">the Wayback Machine&#39;s copy<\/a>/);
  assert.match(html, /<em>From Jon Inggs&#39;s pages · <a /);
});

test("Markdown: what Jon's pages use", () => {
  const md = "### A heading\n\n---\n\nLine one  \nline two\nline three\n\n**Bold across  \na break**\n\n> *A quote*\n> on two lines\n\n- one\n- two\n\n[Charles](photo:charles) and [a story](story:x), <b>not html</b>, [bad](javascript:alert(1))\n";
  const html = markdownToHtml(md);
  assert.match(html, /<h3>A heading<\/h3>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<p>Line one<br>line two line three<\/p>/);
  assert.match(html, /<p><strong>Bold across<br>a break<\/strong><\/p>/);
  assert.match(html, /<blockquote><p><em>A quote<\/em> on two lines<\/p><\/blockquote>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<a href="#" data-photo="charles">Charles<\/a>/);
  assert.match(html, /&lt;b&gt;not html&lt;\/b&gt;/);
  assert.ok(!/javascript:/.test(html.replace(/&[a-z]+;/g, "")) || !/href="javascript/.test(html), "no javascript: link");
  assert.equal(inline("[bad](javascript:x)"), "bad");
});

test("Markdown: a narrow table stays a table, a wide one becomes cards", () => {
  const narrow = markdownToHtml("| Year | What |\n| --- | --- |\n| 1880 | The shop |\n");
  assert.match(narrow, /<table><thead><tr><th>Year<\/th><th>What<\/th><\/tr><\/thead><tbody><tr><td>1880<\/td><td>The shop<\/td><\/tr><\/tbody><\/table>/);
  const cols = 6;
  const row = (xs) => "| " + xs.join(" | ") + " |";
  const wide = markdownToHtml([
    row(["Register", "", "", "Graves", "", ""]),
    row(Array(cols).fill("---")),
    row(["No", "Name", "Entered", "Died", "Rank", "Unit"]),
    row(["1", "SMITH, A", "1911", "1916", "", "1st"]),
    row(["2", "JONES, B", "1912", "1917", "Pte", ""]),
  ].join("\n"));
  assert.match(wide, /^<p class="note">Register · Graves<\/p>/);
  assert.equal((wide.match(/<dl class="ft-rec">/g) || []).length, 2);
  assert.match(wide, /<dt class="lbl">Name<\/dt><dd>SMITH, A<\/dd>/);
  assert.ok(!/<dt class="lbl">Rank<\/dt><dd>SMITH/.test(wide));
  assert.equal((wide.match(/<dt class="lbl">Rank<\/dt>/g) || []).length, 1, "an empty value is left out");
});

test("Share as Markdown: their line", () => {
  const md = lineageMarkdown(seed.people, seed.stories, "james-toller-1930", "line", { now: NOW, photos: seed.photos });
  assert.match(md, /^# James TOLLER: their line\n/);
  assert.match(md, /Compiled by Jon Inggs · familytree\.inggs\.com · 2006\. Shared from the Inggs Family Tree on 10 October 2026\./);
  const heads = md.match(/^## .*$/gm);
  assert.deepEqual(heads, ["## James TOLLER", "## Parents", "## Grandparents", "## Great-grandparents", "## Sources"]);
  // Father then mother, each generation.
  const order = md.match(/^### .*$/gm).map(h => h.slice(4));
  assert.deepEqual(order, ["James TOLLER", "George TOLLER", "Helen WARD", "Edwin TOLLER", "Dora May FENWICK", "Albert Quill FENWICK", "Clara BEAMISH"]);
  assert.match(md, /- Born: 8 AUG 1930, Riverton/);
  assert.match(md, /- Married: Lena ORME/);
  assert.ok(!/Lena ORME \(1958/.test(md), "a living spouse's marriage date is left out");
  assert.match(md, /- On WikiTree: https:\/\/www\.wikitree\.com\/wiki\/Toller-7/);
  assert.match(md, /Kept the shop on Main Street for forty years\./, "Jon's notes, verbatim");
  // The story names Albert and Frank: written out under Albert, once.
  assert.equal((md.match(/#### Jon wrote: The Fenwick shop/g) || []).length, 1);
  assert.match(md, /\*\[Photo: The Fenwick shop in Townsville, about 1890\. Frank Fenwick stands at the door\.\]\*/);
  assert.ok(!/photo:|story:/.test(md), "no app-only links");
  assert.match(md, /## Sources\n\n- Compiled by Jon Inggs/);
  assert.match(md, /- James TOLLER: https:\/\/web\.archive\.org\/web\/20170702000000\/http:\/\/tree\.example\.org\/html\/fam00006\.htm/);
  assert.match(md, /- Jon's story "The Fenwick shop": https:\/\/web\.archive\.org/);
});

test("Share as Markdown: the living rule, and their family", () => {
  const hidden = lineageMarkdown(seed.people, seed.stories, "mark-toller-1960", "family", { now: NOW });
  assert.match(hidden, /^# Mark TOLLER: their family/);
  assert.match(hidden, /### Mark TOLLER\n\n- Living: dates and places left out/);
  assert.ok(!/14 MAY 1960/.test(hidden));
  assert.deepEqual(hidden.match(/^## .*$/gm), ["## Mark TOLLER", "## Parents", "## Sources"]);
  const shown = lineageMarkdown(seed.people, seed.stories, "mark-toller-1960", "family", { now: NOW, details: true });
  assert.match(shown, /- Born: 14 MAY 1960, Port Example/);
  const albert = lineageMarkdown(seed.people, seed.stories, "albert-quill-fenwick-1850", "family", { now: NOW });
  assert.deepEqual(albert.match(/^## .*$/gm), ["## Albert Quill FENWICK", "## Married", "## Children", "## Sources"]);
  assert.match(albert, /Married: Clara BEAMISH \(1875, Riverton, St Example's Church\); Ivy NASH \(1932, Port Example\)/);
  // The story names Albert and Frank: once, under Albert; Frank points back to it.
  assert.match(albert, /Jon's story "The Fenwick shop" is above, under Albert Quill FENWICK\./);
  const ivy = lineageMarkdown(seed.people, seed.stories, "ivy-nash-1860", "line", { now: NOW });
  assert.match(ivy, /Also named: Jack NASH, father \(not in the tree\)/);
  assert.equal(lineageMarkdown(seed.people, seed.stories, "nobody"), "");
  assert.equal(generationName(5), "3× great-grandparents");
});
