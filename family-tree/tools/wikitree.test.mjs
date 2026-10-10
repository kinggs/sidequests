// node --test from the repo root. Invented rows on both sides: nothing from WikiTree or the site.
import { test } from "node:test";
import assert from "node:assert/strict";
import { givenAgree, matchProfiles, search } from "./wikitree.mjs";

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
  ];
  const m = matchProfiles(people, profiles);
  assert.deepEqual(m.links, { "albert-fenwick-1850": "Fenwick-1", "clara-beamish-1852": "Beamish-4", "dora-fenwick": "Fenwick-2" });
  assert.deepEqual(m.ambiguous, [{ profile: "Fenwick-3", people: ["frank-fenwick-1878", "frank-fenwick-1878-2"] }]);
  assert.deepEqual(m.near.map(n => n.profile), ["Nash-9"]);
  assert.deepEqual(m.unmatched, ["Fenwick-8"]);
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
