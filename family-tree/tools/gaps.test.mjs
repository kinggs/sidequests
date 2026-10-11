// node --test family-tree/tools/gaps.test.mjs — research briefs from the tree's gaps, on the invented mock seed.
import test from "node:test";
import assert from "node:assert/strict";
import { gapsOf, ancestors, rank, take } from "./gaps.mjs";
import { mockSeed } from "./mock-seed.mjs";

const NOW = new Date(Date.UTC(2026, 9, 10));
const seed = mockSeed(NOW.getTime());
const byId = new Map(seed.people.map(p => [p.id, p]));
const P = id => byId.get(id);
const wikitree = Object.fromEntries(seed.wikitree.map(e => [e.id, e]));
const storyNames = [
  { story: "the-shop", title: "The Fenwick shop", people: ["albert-quill-fenwick-1850", "frank-fenwick-1878"] },
  { story: "the-shop", title: "The Fenwick shop", name: "Jack INGGS (1830)" },
  { story: "the-shop", title: "The Fenwick shop", name: "Tom FENWICK" },
];
const all = rank({ people: seed.people, storyNames, wikitree, root: "mark-toller-1960", now: NOW });

test("the gaps in a record, in order; death only for the dead and presumed dead", () => {
  assert.deepEqual(gapsOf(P("ivy-nash-1860"), byId, NOW), ["parents", "death", "refs"]);
  assert.deepEqual(gapsOf(P("walter-crane"), byId, NOW), ["parents", "birth", "death"], "presumed dead by his wife's 1912");
  assert.deepEqual(gapsOf(P("pell"), byId, NOW), ["birth"], "living for all we know: no death gap");
  assert.deepEqual(gapsOf(P("george-toller-1901"), byId, NOW), []);
});

test("the direct ancestors of root, by generation", () => {
  const up = ancestors(byId, "mark-toller-1960");
  assert.equal(up.get("james-toller-1930"), 1);
  assert.equal(up.get("helen-ward-1905"), 2);
  assert.equal(up.get("albert-quill-fenwick-1850"), 4);
  assert.equal(up.has("kate-toller-1933"), false, "an aunt isn't an ancestor");
});

test("ranked: root's line nearest first, then Inggs, then the rest; the findable first; nobody living", () => {
  const ids = all.briefs.map(b => b.id);
  assert.deepEqual(ids.slice(0, 5), ["parents.helen-ward-1905", "parents.edwin-toller-1874", "parents.albert-quill-fenwick-1850", "parents.clara-beamish-1852", "story.the-shop.jack-inggs-1830"]);
  assert.ok(ids.indexOf("death.walter-crane") < ids.indexOf("death.hattie-pell"), "Walter has a year and a place (his marriage); Hattie has neither");
  assert.ok(!ids.some(id => /lena-orme|\.pell$|\.rose$/.test(id)), "the living, without consent, aren't briefed");
  assert.equal(all.living, 3);
  assert.equal(all.skipped, 1, "a story's name with no year: can't tell they're dead");
  assert.deepEqual(all.counts.parents, { 1: 4, 3: 4 });
});

test("consent puts a living person in; a brief says why each may be searched", () => {
  const r = rank({ people: seed.people, root: "mark-toller-1960", now: NOW, consent: { "lena-orme-1934": { scope: "genealogy", note: "Lena said yes, 12 Oct" } } });
  assert.deepEqual(r.briefs.find(b => b.id === "parents.lena-orme-1934").why, { status: "consented", scope: "genealogy", note: "Lena said yes, 12 Oct" });
  assert.equal(r.briefs[0].id, "parents.lena-orme-1934", "root's mother, generation 1");
  const b = all.briefs.find(b => b.id === "death.walter-crane");
  assert.deepEqual(b.why, { status: "presumed", proof: "their spouse, Maud DUNN, was born in 1912" });
  assert.deepEqual(b.spouses[0].married, { date: "1935", place: "Port Example" });
  assert.equal(b.missing[0], "their death: date and place");
  assert.ok(b.missing.includes("their parents"), "the person's other gaps, for anything found on the way");
  assert.ok(b.sources.some(s => s.id === "wikitree" && s.use === "agent"));
  const e = all.briefs.find(b => b.id === "parents.edwin-toller-1874");
  assert.deepEqual(e.known.map(k => k.source.split(",")[0]), ["Jon Inggs's family tree", "WikiTree Toller-7"]);
  assert.equal(e.known[1].summary, "b. 2 Jun 1874, Riverton · d. 2 Feb 1940, Port Example");
  assert.deepEqual(all.briefs.find(b => b.id === "parents.albert-quill-fenwick-1850").stories, ["The Fenwick shop"]);
});

test("a run takes one brief a person, and skips the done", () => {
  const next = take(all.briefs, 7);
  assert.equal(next.length, 7);
  assert.equal(new Set(next.map(b => b.person ? b.person.id : b.id)).size, 7);
  assert.ok(!next.some(b => b.id === "birth.walter-crane"), "Walter's parents brief goes first; his birth waits");
  const later = rank({ people: seed.people, root: "mark-toller-1960", now: NOW, done: new Set(["parents.helen-ward-1905"]) });
  assert.equal(later.briefs[0].id, "parents.edwin-toller-1874");
});
