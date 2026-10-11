// node --test from the repo root. Invented rows only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedFiles, storyDoc } from "./seed.mjs";
import { mockSeed, png } from "./mock-seed.mjs";

test("storyDoc points images at photo ids and links at story ids, and drops the file path", () => {
  const row = { id: "shop", title: "The shop", file: "stories/shop.md", source: { url: "u" }, images: ["shop"], people: ["a"] };
  const doc = storyDoc(row, "![The shop](../mirror/shop.jpg)\n\nSee [the photos](j-stone.md) and [elsewhere](https://example.org/x.md).\n\n![](../mirror/not%20a%20photo.jpg)", new Map([["shop.jpg", "shop"]]));
  assert.deepEqual(doc, { id: "shop", title: "The shop", source: { url: "u" }, images: ["shop"], people: ["a"],
    markdown: "![The shop](photo:shop)\n\nSee [the photos](story:j-stone) and [elsewhere](https://example.org/x.md).\n\n![](../mirror/not%20a%20photo.jpg)" });
  assert.equal(storyDoc({ id: "pdf", title: "A memoir", file: "mirror/a.pdf", pdf: true, images: [], people: [] }, "", new Map()).pdf, true);
});

test("seedFiles keeps the tree in the first file and spreads the images under the limit", () => {
  const images = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, data: "x".repeat(400) }));
  const files = seedFiles({ meta: { people: 1 }, people: [{ id: "a" }], photos: [{ id: "p0" }], stories: [], wikitree: [{ id: "A-1", person: "a" }], images }, 1100);
  assert.deepEqual(files.map(f => f.seed), [{ part: 1, of: 4 }, { part: 2, of: 4 }, { part: 3, of: 4 }, { part: 4, of: 4 }]);
  assert.deepEqual(files[0].meta, { main: { people: 1 } });
  assert.equal(files[0].app, "family-tree");
  assert.deepEqual(files[0].wikitree, [{ id: "A-1", person: "a" }], "the WikiTree copy goes with the tree");
  assert.deepEqual(files.slice(1).map(f => f.images.length), [2, 2, 1]);
  for (const f of files) assert.ok(JSON.stringify(f).length <= 1100);
  assert.throws(() => seedFiles({ meta: {}, people: [{ id: "x".repeat(2000) }], photos: [], stories: [], images: [] }, 1000));
});

test("the mock seed is invented, consistent, and has what the proofs need", () => {
  const s = mockSeed();
  const ids = new Set(s.people.map(p => p.id));
  assert.equal(s.people.length, 15);
  for (const p of s.people){
    for (const id of [...p.parents, ...p.children, ...p.spouses.map(x => x.id)]) assert.ok(ids.has(id), `${p.id} → ${id}`);
    for (const c of p.children) assert.ok(s.people.find(q => q.id === c).parents.includes(p.id));
    for (const sp of p.spouses) assert.ok(s.people.find(q => q.id === sp.id).spouses.some(x => x.id === p.id));
  }
  const living = s.people.filter(p => !p.death.date && (!p.birth.year || p.birth.year > 1926));
  assert.ok(living.length >= 2);
  assert.ok(s.people.some(p => !p.birth.year));
  assert.ok(s.people.some(p => p.refs.length));
  assert.equal(s.photos.length, 6);
  assert.ok(s.photos.some(p => !p.recovered));
  assert.deepEqual(new Set(s.images.map(i => i.id)), new Set(s.photos.filter(p => p.recovered).map(p => p.id)));
  assert.match(png(4, 3, [1, 2, 3]), /^data:image\/png;base64,iVBORw0KGgo/);
  assert.deepEqual(Object.keys(s.meta), ["main"]);
  assert.equal(s.suggestions.length, 1);
});
