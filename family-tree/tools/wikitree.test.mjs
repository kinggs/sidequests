// node --test from the repo root. Invented rows on both sides: nothing from WikiTree or the site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmLinks, corroborate, givenAgree, isoDate, matchProfiles, search } from "./wikitree.mjs";

const person = (id, given, surname, birth = "", parents = []) => ({ id, given, surname, birth: { date: birth, year: /^\d{4}$/.test(birth.slice(-4)) && !/ABT/.test(birth) ? Number(birth.slice(-4)) : null }, parents });
const profile = (Id, Name, FirstName, MiddleName, LastNameAtBirth, BirthDate = "0000-00-00", Father = 0, Mother = 0) => ({ Id, Name, FirstName, MiddleName, LastNameAtBirth, BirthDate, Father, Mother });

test("givenAgree: the first name ours, WikiTree's middle names among ours in order", () => {
  assert.equal(givenAgree("Albert Quill", "Albert", ""), true);
  assert.equal(givenAgree("Albert Quill John", "Albert", "John"), true);
  assert.equal(givenAgree("D1 Albert Quill", "Albert", "Quill"), true);   // Jon's prefix ignored
  assert.equal(givenAgree("Albert", "Albert", "Quill"), false);
  assert.equal(givenAgree("Quill Albert", "Albert", ""), false);
  assert.equal(givenAgree("Albert John Quill", "Albert", "Quill John"), false);
  assert.equal(givenAgree("", "Albert", ""), false);
});

test("matchProfiles links one sure match and sends the rest to the owner", () => {
  const people = [
    person("albert-fenwick-1850", "Albert Quill", "FENWICK", "3 MAR 1850"),
    person("clara-beamish-1852", "Clara", "BEAMISH", "1852"),
    person("dora-fenwick-1876", "Dora May", "FENWICK", "4 APR 1876", ["albert-fenwick-1850", "clara-beamish-1852"]),
    person("dora-fenwick", "Dora", "FENWICK", "", ["albert-fenwick-1850", "clara-beamish-1852"]),
    person("frank-fenwick-1878", "Frank", "FENWICK", "1878"),
    person("frank-fenwick-1878-2", "Frank", "FENWICK", "ABT 1878"),
    person("ivy-nash-1860", "Ivy", "NASH", "1860"),
  ];
  const profiles = [
    profile(1, "Fenwick-1", "Albert", "", "Fenwick", "1850-03-03"),
    profile(2, "Beamish-4", "Clara", "", "Beamish", "1852-00-00"),
    profile(3, "Fenwick-2", "Dora", "", "Fenwick", "0000-00-00", 1, 2),     // no year on either side: the parents settle it
    profile(4, "Fenwick-3", "Frank", "", "Fenwick", "1878-01-01"),          // two Franks born 1878 ("ABT 1878" counts)
    profile(5, "Nash-9", "Ivy", "", "Nash", "1861-00-00"),                  // a year out: near miss
    profile(6, "Fenwick-8", "Zed", "", "Fenwick", "1990-00-00"),            // Jon's newer work
    profile(7, "Nash-12", "Ivy", "", "Nash", "1920-00-00"),                 // a namesake sixty years on: not worth a look
  ];
  const m = matchProfiles(people, profiles);
  assert.deepEqual(m.links, { "albert-fenwick-1850": "Fenwick-1", "clara-beamish-1852": "Beamish-4", "dora-fenwick": "Fenwick-2" });
  assert.deepEqual(m.ambiguous, [{ profile: "Fenwick-3", people: ["frank-fenwick-1878", "frank-fenwick-1878-2"] }]);
  assert.deepEqual(m.near.map(n => n.profile), ["Nash-9"]);
  assert.deepEqual(m.unmatched, ["Fenwick-8", "Nash-12"]);
});

test("matchProfiles: no year on either side, the parents' names agree → linked", () => {
  const people = [
    person("albert-fenwick-1850", "Albert", "FENWICK", "1850"),
    person("clara-beamish-1852", "Clara", "BEAMISH", "1852"),
    person("ida-fenwick", "Ida", "FENWICK", "", ["albert-fenwick-1850", "clara-beamish-1852"]),
    person("ida-fenwick-2", "Ida", "FENWICK", "", []),
  ];
  const m = matchProfiles(people, [profile(1, "Fenwick-1", "Albert", "", "Fenwick", "1850-00-00"), profile(2, "Beamish-1", "Clara", "", "Beamish"), profile(3, "Fenwick-5", "Ida", "", "Fenwick", "0000-00-00", 1, 2)]);
  assert.equal(m.links["ida-fenwick"], "Fenwick-5");
  assert.equal(m.links["ida-fenwick-2"], undefined);
});

test("matchProfiles: two profiles claiming one person link neither", () => {
  const m = matchProfiles([person("a", "Albert", "FENWICK", "1850")], [profile(1, "Fenwick-1", "Albert", "", "Fenwick", "1850-01-01"), profile(2, "Fenwick-9", "Albert", "", "Fenwick", "1850-05-05")]);
  assert.deepEqual(m.links, {});
  assert.deepEqual(m.ambiguous, [{ profile: "Fenwick-1, Fenwick-9", people: ["a"] }]);
});

test("search pages through, keeps only that surname at birth, and waits when WikiTree is busy", async () => {
  const calls = [], waits = [];
  const answers = [
    [{ status: "Limit exceeded." }],
    [{ status: 0, total: 150, matches: Array.from({ length: 100 }, (_, i) => profile(i, `Fenwick-${i}`, "A", "", i % 10 ? "Fenwick" : "Smith")) }],
    [{ status: 0, total: 150, matches: Array.from({ length: 50 }, (_, i) => profile(100 + i, `Fenwick-${100 + i}`, "A", "", "Fenwick")) }],
  ];
  const fetchImpl = async url => { calls.push(url); return { ok: true, status: 200, json: async () => answers.shift() }; };
  const got = await search("FENWICK", { fetchImpl, wait: async ms => waits.push(ms), log: () => {} });
  assert.equal(got.length, 90 + 50);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(u => u.includes("appId=sidequests-family-tree") && u.includes("LastName=FENWICK")));
  assert.ok(calls[2].includes("start=100"));
  assert.deepEqual(waits, [30000, 1100, 1100]);
});

test("search stops at the first page when a surname is too common, and can add a first name", async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return { ok: true, status: 200, json: async () => [{ status: 0, total: 15000, matches: [profile(1, "Smith-1", "A", "", "Smith")] }] }; };
  const got = await search("SMITH", { cap: 500, fetchImpl, wait: async () => {}, log: () => {} });
  assert.equal(got.tooMany, true);
  assert.equal(got.length, 0);
  assert.equal(calls.length, 1);
  await search("SMITH", { first: "Albert", fetchImpl: async url => { calls.push(url); return { ok: true, status: 200, json: async () => [{ status: 0, total: 1, matches: [] }] }; }, wait: async () => {} });
  assert.ok(calls[1].includes("&FirstName=Albert"));
});

test("isoDate reads only a date with its day and month", () => {
  assert.equal(isoDate("11 APR 1863"), "1863-04-11");
  assert.equal(isoDate("4 JUNE 1901"), "1901-06-04");
  for (const d of ["APR 1863", "1863", "ABT 1863", "22 MAR", ""]) assert.equal(isoDate(d), null, d);
});

test("corroborate wants a second fact: the full birth date, or a parent's or spouse's name", () => {
  const people = [
    { id: "albert", given: "Albert Quill", surname: "FENWICK", birth: { date: "3 MAR 1850" }, parents: [], spouses: [{ id: "clara" }] },
    { id: "clara", given: "Clara", surname: "BEAMISH", birth: { date: "1852" }, parents: ["jack"], spouses: [{ id: "albert" }] },
    { id: "jack", given: "Jack", surname: "BEAMISH", birth: { date: "" }, parents: [], spouses: [] },
  ];
  const byId = new Map(people.map(p => [p.id, p]));
  assert.equal(corroborate(people[0], byId, { BirthDate: "1850-03-03" }), "date");
  assert.equal(corroborate(people[0], byId, { BirthDate: "1850-07-01", Spouses: { 9: { FirstName: "Clara", LastNameAtBirth: "Beamish" } } }), "relative");
  assert.equal(corroborate(people[1], byId, { BirthDate: "1852-00-00", Parents: { 7: { FirstName: "Jack", LastNameAtBirth: "Beamish" } } }), "relative");
  assert.equal(corroborate(people[1], byId, { BirthDate: "1852-00-00", Parents: { 7: { FirstName: "John", LastNameAtBirth: "Beamish" } } }), null);   // a namesake
  assert.equal(corroborate(people[0], byId, { BirthDate: "1850-00-00" }), null);
  assert.equal(corroborate(people[2], byId, { BirthDate: "0000-00-00", Parents: { 1: { FirstName: "", LastNameAtBirth: "" } } }), null);
});

test("confirmLinks keeps the backed links and lists the rest, 25 profiles a request", async () => {
  const people = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, given: "Ann", surname: "FENWICK", birth: { date: `${i + 1} JAN 1900` }, parents: [], spouses: [] }));
  const links = Object.fromEntries(people.map((p, i) => [p.id, `Fenwick-${i}`]));
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const keys = new URL(url).searchParams.get("keys").split(",");
    return { ok: true, json: async () => [{ status: 0, items: keys.map(k => ({ key: k, person: { BirthDate: Number(k.split("-")[1]) % 2 ? "1899-12-31" : `1900-01-${String(Number(k.split("-")[1]) + 1).padStart(2, "0")}` } })) }] };
  };
  const c = await confirmLinks(people, links, { fetchImpl, wait: async () => {} });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(u => u.includes("action=getRelatives") && u.includes("appId=sidequests-family-tree")));
  assert.equal(Object.keys(c.links).length, 15);           // the even ones: their full birth date agrees
  assert.equal(c.links.p0, "Fenwick-0");
  assert.equal(c.links.p1, undefined);
  assert.deepEqual(c.unconfirmed[0], { id: "p1", wikitree: "Fenwick-1" });
  assert.ok(Object.values(c.how).every(h => h === "date"));
});
