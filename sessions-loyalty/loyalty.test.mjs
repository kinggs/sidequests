// Tests for sessions-loyalty/loyalty.js. Run from the repo root:  node --test
// Every number here is worked by hand in the comments, not computed with the code under test.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./loyalty.js";

test("a spend is worth whole points and XP, rounded down, at the club's rates", () => {
  assert.deepEqual(L.pointsFor(90, {}), { points: 90, xp: 90 });
  assert.deepEqual(L.pointsFor(49.99, {}), { points: 49, xp: 49 });
  // 2 points a rand, half an XP a rand: R45 → 90 points, 22 XP.
  assert.deepEqual(L.pointsFor(45, { pointsPerRand: 2, xpPerRand: 0.5 }), { points: 90, xp: 22 });
  assert.deepEqual(L.pointsFor(-5, {}), { points: 0, xp: 0 });
  assert.deepEqual(L.pointsFor("abc", {}), { points: 0, xp: 0 });
});

test("settings fill in and sort the tiers, with Bronze at 0 always", () => {
  const s = L.withDefaults({ tiers: [{ name: "Gold", xp: 100 }, { name: "Silver", xp: 50 }] });
  assert.deepEqual(s.tiers.map(t => t.name), ["Bronze", "Silver", "Gold"]);
  assert.equal(L.withDefaults({ pointsPerRand: -1 }).pointsPerRand, 1);
  assert.equal(L.withDefaults(null).name, "Sessions");
  assert.equal(L.withDefaults({ tiers: "nope" }).tiers.length, 3);
});

test("the tier for an XP total, and how far the next one is", () => {
  const s = { tiers: [{ name: "Bronze", xp: 0 }, { name: "Silver", xp: 5000 }, { name: "Gold", xp: 15000 }] };
  assert.deepEqual(L.tierFor(0, s), { name: "Bronze", xp: 0, next: { name: "Silver", xp: 5000, away: 5000 } });
  assert.deepEqual(L.tierFor(4999, s), { name: "Bronze", xp: 0, next: { name: "Silver", xp: 5000, away: 1 } });
  assert.deepEqual(L.tierFor(5000, s).name, "Silver");
  assert.deepEqual(L.tierFor(20000, s), { name: "Gold", xp: 15000, next: null });
});

const e = (kind, points, extra = {}) => ({ kind, points, xp: points > 0 ? points : 0, at: 1, ...extra });

test("totals: points are signed, XP never falls, voided lines count for nothing", () => {
  const t = L.totals([
    e("spend", 90, { rands: 90 }),            // +90 points, 90 XP, one visit
    e("earn", 200),                           // +200
    e("redeem", -250, { xp: 0 }),             // −250
    e("adjust", 10, { xp: 0 }),               // +10, no XP
    e("spend", 50, { rands: 50, voided: true }) // nothing
  ]);
  // points 90 + 200 − 250 + 10 = 50; xp 90 + 200 = 290; earned 300; redeemed 250.
  assert.deepEqual(t, { points: 50, xp: 290, rands: 90, earned: 300, redeemed: 250, visits: 1 });
  assert.deepEqual(L.totals([]), { points: 0, xp: 0, rands: 0, earned: 0, redeemed: 0, visits: 0 });
});

test("the next reward is the cheapest one the balance can't buy; free ones are never away", () => {
  const rewards = [
    { title: "Lager", cost: 0, active: true },
    { title: "Cue", cost: 250, active: true },
    { title: "Cap", cost: 1550, active: true },
    { title: "Hidden", cost: 100, active: false }
  ];
  assert.deepEqual(L.nextReward(0, rewards), { reward: rewards[1], away: 250 });
  assert.deepEqual(L.nextReward(250, rewards), { reward: rewards[2], away: 1300 });
  assert.equal(L.nextReward(2000, rewards), null);
  assert.equal(L.canAfford(250, rewards[1]), true);
  assert.equal(L.canAfford(249, rewards[1]), false);
  assert.equal(L.canAfford(0, rewards[0]), true);
});

test("an entry is shaped the same whoever writes it", () => {
  const x = L.makeEntry({ kind: "spend", uid: "u1", name: "Ann", by: "s1", byName: "Bar", at: 5, rands: 49.999, points: 49.9, xp: 49, note: "x" });
  assert.deepEqual(x, { kind: "spend", uid: "u1", name: "Ann", by: "s1", byName: "Bar", at: 5, rands: 50, points: 49, xp: 49, item: "", title: "", note: "x" });
  assert.equal(L.makeEntry({ kind: "redeem", uid: "u1", points: -250, xp: -5 }).xp, 0);
  assert.throws(() => L.makeEntry({ kind: "gift", uid: "u1" }));
  assert.throws(() => L.makeEntry({ kind: "spend" }));
});

test("a card's cached figures come from its entries, and lastAt is the newest live line", () => {
  const card = L.cardAfter({ name: "Ann", memberNo: "7" }, [e("spend", 90, { at: 10, rands: 90 }), e("redeem", -40, { at: 20 }), e("spend", 5, { at: 30, voided: true })]);
  assert.deepEqual(card, { name: "Ann", memberNo: "7", points: 50, xp: 90, lastAt: 20 });
});

test("months and days go by the phone's clock", () => {
  const t = new Date(2026, 9, 2, 14, 25).getTime();   // 2 Oct 2026
  assert.equal(L.monthKey(t), "2026-10");
  assert.equal(L.inMonth([{ at: t }, { at: new Date(2026, 8, 30).getTime() }], "2026-10").length, 1);
  assert.equal(L.sameDay(t, new Date(2026, 9, 2, 1).getTime()), true);
  assert.equal(L.sameDay(t, new Date(2026, 9, 3, 1).getTime()), false);
});

test("rands read as the bar writes them", () => {
  assert.equal(L.rand(90), "R90");
  assert.equal(L.rand(49.99), "R49.99");
  assert.equal(L.signed(250), "+250");
  assert.equal(L.signed(-250), "-250");
});

test("the starting list is the team's 2026-11 one: 13 rewards, 9 ways to earn, free ones first", () => {
  const { rewards, earns } = L.seedItems();
  // The team's list, 2026-11-25: five free, eight bought; nine ways to earn.
  assert.equal(rewards.length, 13);
  assert.equal(earns.length, 9);
  assert.equal(rewards.filter(r => r.cost === 0).length, 5);
  assert.deepEqual(rewards.filter(r => r.cost > 0).map(r => r.cost), [700, 1000, 1500, 1625, 1800, 3000, 4000, 10000]);
  assert.deepEqual(rewards.filter(r => r.limit === "once").map(r => r.id), ["cue", "sticker", "cap"]);
  assert.equal(earns[0].points, 1250);
  assert.equal(earns.find(e => e.id === "survey").points, 200);
  assert.ok(rewards.every(r => r.active && r.title && r.emoji));
  const ids = [...rewards, ...earns].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("an entry logged beside a Rack It match names it, and one that isn't has no match at all", () => {
  const base = { kind: "earn", uid: "ann", name: "Ann", by: "bar", byName: "Bar", at: 5, points: 50, xp: 50, item: "rack-it", title: "A rated match" };
  assert.equal(L.makeEntry({ ...base, match: "m123" }).match, "m123");
  assert.equal("match" in L.makeEntry(base), false);
});

// ---- limits and the birthday week (0.5.0) ----
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();   // local time, months 1-12
const redeemOf = (item, when, extra = {}) => ({ kind: "redeem", item, at: when, points: -1, ...extra });

test("a birthday is MM-DD, a real day of the year, 29 February included", () => {
  assert.equal(L.validBirthday("02-29"), true);
  assert.equal(L.validBirthday("12-31"), true);
  assert.equal(L.validBirthday("02-30"), false);
  assert.equal(L.validBirthday("13-01"), false);
  assert.equal(L.validBirthday("00-10"), false);
  assert.equal(L.validBirthday("1-5"), false);
  assert.equal(L.validBirthday(""), false);
});

test("the birthday week is Monday to Sunday around the birthday", () => {
  // 25 Nov 2026 is a Wednesday: the week is Mon 23 Nov to Sun 29 Nov.
  const w = L.birthdayWeek("11-25", at(2026, 11, 25));
  assert.deepEqual(w, { start: new Date(2026, 10, 23).getTime(), end: new Date(2026, 10, 30).getTime() });
  assert.ok(L.birthdayWeek("11-25", at(2026, 11, 23, 0)));
  assert.ok(L.birthdayWeek("11-25", at(2026, 11, 29, 23)));
  assert.equal(L.birthdayWeek("11-25", at(2026, 11, 22, 23)), null);
  assert.equal(L.birthdayWeek("11-25", at(2026, 11, 30, 0)), null);
  assert.equal(L.birthdayWeek("", at(2026, 11, 25)), null);
});

test("a birthday week crosses New Year, and 29 February falls on the 28th in other years", () => {
  // 1 Jan 2027 is a Friday: the week is Mon 28 Dec 2026 to Sun 3 Jan 2027.
  assert.equal(L.birthdayWeek("01-01", at(2026, 12, 29)).start, new Date(2026, 11, 28).getTime());
  assert.ok(L.birthdayWeek("01-01", at(2027, 1, 3)));
  // 2027 isn't a leap year: 28 Feb 2027 is a Sunday, so the week is Mon 22 to Sun 28 Feb.
  assert.ok(L.birthdayWeek("02-29", at(2027, 2, 22)));
  assert.ok(L.birthdayWeek("02-29", at(2027, 2, 28)));
  assert.equal(L.birthdayWeek("02-29", at(2027, 3, 1)), null);
});

test("a once reward is taken after one redeem; a voided redeem gives it back", () => {
  const cue = { id: "cue", limit: "once", cost: 0 };
  assert.equal(L.taken(cue, []), false);
  assert.equal(L.taken(cue, [redeemOf("cue", at(2025, 1, 1))], at(2026, 11, 25)), true);
  assert.equal(L.taken(cue, [redeemOf("cue", at(2025, 1, 1), { voided: true })], at(2026, 11, 25)), false);
  assert.equal(L.taken(cue, [redeemOf("cap", at(2025, 1, 1))], at(2026, 11, 25)), false);
  assert.equal(L.taken({ id: "lager", cost: 0 }, [redeemOf("lager", 1), redeemOf("lager", 2)]), false);
});

test("a yearly reward comes back each calendar year; a birthday one each birthday week", () => {
  const yearly = { id: "y", limit: "year" };
  assert.equal(L.taken(yearly, [redeemOf("y", at(2025, 12, 31))], at(2026, 1, 1)), false);
  assert.equal(L.taken(yearly, [redeemOf("y", at(2026, 1, 1))], at(2026, 11, 25)), true);
  const bday = { id: "birthday", limit: "year", window: "birthday" };
  // Taken last year: free again this week.
  assert.equal(L.taken(bday, [redeemOf("birthday", at(2025, 11, 25))], at(2026, 11, 25), "11-25"), false);
  // Taken on Tuesday this week: taken on Wednesday.
  assert.equal(L.taken(bday, [redeemOf("birthday", at(2026, 11, 24))], at(2026, 11, 25), "11-25"), true);
  // Across New Year: taken Tue 29 Dec 2026, still the same week on Sat 2 Jan 2027.
  assert.equal(L.taken(bday, [redeemOf("birthday", at(2026, 12, 29))], at(2027, 1, 2), "01-01"), true);
});

test("redeemable says why not: the birthday first, then the limit, then the points", () => {
  const { rewards } = L.seedItems();
  const r = id => rewards.find(x => x.id === id);
  const now = at(2026, 11, 25);
  assert.deepEqual(L.redeemable(r("birthday"), { at: now }), { ok: false, why: "nobirthday" });
  assert.deepEqual(L.redeemable(r("birthday"), { birthday: "06-01", at: now }), { ok: false, why: "birthday" });
  assert.deepEqual(L.redeemable(r("birthday"), { birthday: "11-27", at: now }), { ok: true, why: "" });
  assert.deepEqual(L.redeemable(r("cap"), { points: 5000, entries: [redeemOf("cap", 1)], at: now }), { ok: false, why: "taken" });
  assert.deepEqual(L.redeemable(r("cap"), { points: 2999, at: now }), { ok: false, why: "points" });
  assert.deepEqual(L.redeemable(r("cap"), { points: 3000, at: now }), { ok: true, why: "" });
  assert.deepEqual(L.redeemable(r("lager"), { at: now }), { ok: true, why: "" });
});

test("moving a club to the new list adds what's missing and hides only the old app's items", () => {
  const old = [
    { id: "a1", title: "Free cue rental", active: true },
    { id: "a2", title: "50% off a glove", active: true },
    { id: "a3", title: "Upgrade to a high-end cue", active: false },   // already hidden
    { id: "a4", title: "Darts night", active: true }                    // staff made it
  ];
  const m = L.listMove(old, [{ id: "e1", title: "Refer a friend", points: 1250 }]);
  assert.equal(m.rewards.add.length, 13);
  assert.deepEqual(m.rewards.hide, ["a1", "a2"]);
  assert.equal(m.earns.add.length, 9);
  assert.deepEqual(m.earns.hide, ["e1"]);   // the old app's "Refer a friend", replaced by the fixed-id one
  // Once moved, nothing more to do, even with a new item edited by staff.
  const { rewards, earns } = L.seedItems();
  const again = L.listMove([...old.map(x => ({ ...x, active: x.id === "a4" })), ...rewards.map(x => ({ ...x, cost: x.cost + 1 }))], earns);
  assert.deepEqual(again, { rewards: { add: [], hide: [] }, earns: { add: [], hide: [] } });
});
