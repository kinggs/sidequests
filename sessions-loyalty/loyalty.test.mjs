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

test("the starting list is the club's old one: 8 rewards, 8 ways to earn, free ones first", () => {
  const { rewards, earns } = L.seedItems();
  assert.equal(rewards.length, 8);
  assert.equal(earns.length, 8);
  assert.equal(rewards.filter(r => r.cost === 0).length, 4);
  assert.equal(earns[0].points, 1250);
  assert.ok(rewards.every(r => r.active && r.title && r.emoji));
});
