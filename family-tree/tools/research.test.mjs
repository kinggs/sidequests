// node --test family-tree/tools/research.test.mjs — checking and packing the research agents'
// findings, on invented findings about the invented mock seed: one per rejection reason, and one that passes.
import test from "node:test";
import assert from "node:assert/strict";
import { check, pack, alreadyKnown, lookupsPage } from "./research.mjs";
import { rank } from "./gaps.mjs";
import { mockSeed } from "./mock-seed.mjs";

const NOW = new Date(Date.UTC(2026, 9, 10));
const seed = mockSeed(NOW.getTime());
const byId = new Map(seed.people.map(p => [p.id, p]));
const consent = { "lena-orme-1934": { scope: "genealogy", note: "Lena said yes" }, "mark-toller-1960": "genealogy-shared" };
const briefs = new Map(rank({ people: seed.people, root: "mark-toller-1960", now: NOW, consent }).briefs.map(b => [b.id, b]));
const ctx = { briefs, byId, consent, now: NOW };

const cite = (o = {}) => ({ source: "Papers Past", title: "Riverton Herald, 3 May 1912", url: "https://paperspast.natlib.govt.nz/newspapers/RH19120503.2.4", accessed: "2026-10-11", quote: "TOLLER—NASH. On the 2nd, Silas Toller to Ivy Nash.", reference: "", ...o });
const claim = (o = {}) => ({ field: "marriage", value: { date: "2 May 1912", place: "Riverton" }, citations: [cite()], confidence: "secondary", reasoning: "Ivy Nash, Riverton, the right years.", ...o });
const finding = (o = {}) => ({ id: "parents.ivy-nash-1860", brief: "parents.ivy-nash-1860", person: "ivy-nash-1860", ranAt: NOW.getTime(), model: "claude-opus-5-5",
  claims: [claim()], lookups: [{ site: "FreeBMD", query: "Nash, 1860", url: "https://www.freebmd.org.uk/cgi/search.pl", why: "her birth" }], searched: [{ source: "archive", query: "Ivy Nash", result: "nothing" }], notFound: "Her parents.", ...o });
const reasons = f => check(f, ctx).reasons;

test("a good finding passes, whole", () => {
  const r = check(finding(), ctx);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.ok, true);
  assert.equal(r.finding.claims.length, 1);
});

test("rejected: no citation, no URL, no quote", () => {
  assert.match(reasons(finding({ claims: [claim({ citations: [] })] })).join(), /no citation/);
  assert.match(reasons(finding({ claims: [claim({ citations: [cite({ url: "" })] })] })).join(), /no URL/);
  assert.match(reasons(finding({ claims: [claim({ citations: [cite({ quote: " " })] })] })).join(), /no quote/);
});

test("rejected: a source agents may not use", () => {
  assert.match(reasons(finding({ claims: [claim({ citations: [cite({ url: "https://www.freebmd.org.uk/cgi/information.pl?r=1" })] })] })).join(), /freebmd\.org\.uk isn't a source/);
  assert.match(reasons(finding({ claims: [claim({ citations: [cite({ url: "https://paperspast.natlib.govt.nz.evil.example/x" })] })] })).join(), /isn't a source/);
  assert.deepEqual(reasons(finding({ claims: [claim({ citations: [cite({ url: "https://archive.org/details/riverton1900" })] })] })), []);
  for (const url of ["https://www.eggsa.org/cgi-bin/dosearchBurials.pl?what_surname=Nash", "https://discovery.nationalarchives.gov.uk/details/r/C123", "https://www.wikidata.org/wiki/Q1"])
    assert.deepEqual(reasons(finding({ claims: [claim({ citations: [cite({ url })] })] })), [], url);
  assert.match(reasons(finding({ claims: [claim({ citations: [cite({ url: "https://graves.eggsa.org/x" })] })] })).join(), /isn't a source/, "eGGSA's gravestones: by hand");
});

test("rejected: a brief or person that doesn't exist, or doesn't match", () => {
  assert.match(reasons(finding({ brief: "parents.nobody" })).join(), /no brief/);
  assert.match(reasons(finding({ person: "nobody-1900" })).join(), /no person/);
  assert.match(reasons(finding({ person: "albert-quill-fenwick-1850" })).join(), /the brief is about ivy-nash-1860/);
});

test("rejected: a person no longer researchable", () => {
  const f = finding({ id: "parents.lena-orme-1934", brief: "parents.lena-orme-1934", person: "lena-orme-1934" });
  assert.deepEqual(reasons(f), [], "with consent");
  const b = new Map([...briefs, ["birth.pell", { id: "birth.pell", kind: "birth", person: { id: "pell" } }]]);
  assert.match(check(finding({ id: "birth.pell", brief: "birth.pell", person: "pell" }), { ...ctx, briefs: b }).reasons.join(), /living and has no research consent/);
});

test("a living person without consent: their parents only, parent and birth claims", () => {
  const f = c => finding({ id: "parents.lena-orme-1934", brief: "parents.lena-orme-1934", person: "lena-orme-1934", claims: [claim(c)] });
  const none = { ...ctx, consent: {} };
  assert.deepEqual(check(f({ field: "parent", value: { name: "Arthur ORME", birth: "1901" } }), none).reasons, []);
  assert.deepEqual(check(f({ field: "birth", value: { date: "4 JUN 1934", place: "Riverton" } }), none).reasons, []);
  assert.match(check(f({}), none).reasons.join(), /only parent and birth/, "a marriage: no");
  assert.match(check(f({ field: "parent", value: { name: "Arthur ORME" }, reasoning: "Her mother wrote from lena@example.com" }), none).reasons.join(), /an email/, "the never-list holds");
});

test("rejected: for a consented living person, anything outside genealogy or on the never-list", () => {
  const f = c => finding({ id: "parents.lena-orme-1934", brief: "parents.lena-orme-1934", person: "lena-orme-1934", claims: [claim(c)] });
  assert.match(reasons(f({ field: "residence", value: "Port Example" })).join(), /outside the genealogy/);
  assert.match(reasons(f({ field: "occupation", value: "Teacher" })).join(), /outside the genealogy/);
  for (const [text, what] of [["lena@example.com", "an email"], ["+27 21 555 0100", "a phone"], ["021 555 0100", "a phone"], ["12 Harbour Road, Port Example", "a street address"],
    ["8001015009087", "an ID number"], ["https://facebook.com/lena", "a social-media"], ["She now works at the Port Example clinic", "an employer today"]])
    assert.match(reasons(f({ field: "note", value: text })).join(), new RegExp(what), text);
  assert.deepEqual(reasons(f({ field: "note", value: "Married 1958; children born 1960 1964 1966" })), [], "years are not a phone number");
  assert.deepEqual(reasons(finding({ claims: [claim({ field: "residence", value: "12 Harbour Road, Port Example" })] })), [], "the dead: anything in public records");
});

test("rejected: a family tree alone never makes a parent; bad fields and confidence", () => {
  const wt = cite({ source: "WikiTree", url: "https://www.wikitree.com/wiki/Nash-1", quote: "Father: Jack Nash" });
  assert.match(reasons(finding({ claims: [claim({ field: "parent", value: { name: "Jack NASH" }, citations: [wt] })] })).join(), /never a parent's only source/);
  assert.deepEqual(reasons(finding({ claims: [claim({ field: "parent", value: { name: "Jack NASH" }, citations: [wt, cite()] })] })), []);
  assert.match(reasons(finding({ claims: [claim({ field: "salary" })] })).join(), /not a field/);
  assert.match(reasons(finding({ claims: [claim({ confidence: "sure" })] })).join(), /confidence/);
  assert.match(reasons({ brief: "x" }).join(), /not a finding/);
});

test("a claim that only repeats Jon is dropped, not rejected", () => {
  const albert = byId.get("albert-quill-fenwick-1850");
  assert.equal(alreadyKnown({ field: "birth", value: { date: "3 Mar 1850", place: "Townsville" } }, albert, byId), true);
  assert.equal(alreadyKnown({ field: "birth", value: { date: "1850" } }, albert, byId), true, "a vaguer date adds nothing");
  assert.equal(alreadyKnown({ field: "birth", value: { date: "1851" } }, albert, byId), false);
  assert.equal(alreadyKnown({ field: "child", value: { name: "Frank Fenwick" } }, albert, byId), true);
  assert.equal(alreadyKnown({ field: "child", value: { name: "Rose Fenwick" } }, albert, byId), false);
  const r = check(finding({ id: "parents.albert-quill-fenwick-1850", brief: "parents.albert-quill-fenwick-1850", person: "albert-quill-fenwick-1850",
    claims: [claim({ field: "birth", value: { date: "3 MAR 1850", place: "Townsville" } }), claim()] }), ctx);
  assert.equal(r.ok, true);
  assert.deepEqual(r.dropped, ["birth"]);
  assert.equal(r.finding.claims.length, 1);
});

test("pack: each finding with its person's name and scope", () => {
  const f = (id, person) => finding({ id: `parents.${person}`, brief: `parents.${person}`, person });
  const p = pack([f(0, "ivy-nash-1860"), f(0, "lena-orme-1934"), f(0, "walter-crane")], { byId, briefs, consent, now: NOW, version: "1" });
  assert.deepEqual(p.seed, { kind: "research" });
  assert.equal(p.app, "family-tree");
  assert.deepEqual(p.findings.map(x => [x.personName, x.scope]), [["Ivy NASH", "family"], ["Lena ORME", "person"], ["Walter CRANE", "family"]]);
  const shared = pack([finding({ id: "x", brief: "x", person: "mark-toller-1960" })], { byId, briefs, consent, now: NOW });
  assert.equal(shared.findings[0].scope, "family", "genealogy-shared goes to the family");
});

test("lookups: one page of links by site, escaped", () => {
  const html = lookupsPage([finding(), finding({ person: "walter-crane", lookups: [{ site: "FamilySearch", query: "Walter <Crane>", url: "https://www.familysearch.org/search?q=a&b=c", why: "" }] })], { byId, now: NOW });
  assert.match(html, /2 searches on 2 sites, 2026-10-10/);
  assert.ok(html.indexOf("<h2>FamilySearch</h2>") < html.indexOf("<h2>FreeBMD</h2>"));
  assert.match(html, /href="https:\/\/www\.familysearch\.org\/search\?q=a&amp;b=c"[^>]*>Walter CRANE</);
  assert.match(html, /Walter &lt;Crane&gt;/);
});
