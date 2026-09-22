// Tests for rack-it/zargo.js. Run from the repo root:  node --test
// (Node 26 won't take a folder; `node --test rack-it/zargo.test.mjs` runs just this file.)
//
// Every fixture here is synthetic. No export of real data goes in the repo (it holds emails).
// Expected numbers are worked by hand in the comments, not computed with the code under test.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Z from "./zargo.js";

const cfg = Z.withGames({});
const near = (actual, expected, eps = 1e-9, msg) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg || ""} expected ${expected}, got ${actual}`);
// Trad-Nine or Golden-Nine banked points from a string of rack winners, e.g. "aab".
const wins = s => [...s].map(w => ({ a: 0, b: 0, winner: w, kind: "win" }));
const known = (za, zb, rA = 50, rB = 50) => ({ za, zb, sessionsA: 10, sessionsB: 10, robustnessA: rA, robustnessB: rB });

test("expected share: 100 apart wins two racks for every one", () => {
  near(Z.expectedShareA(600, 500), 2 / 3);
  near(Z.expectedShareA(500, 600), 1 / 3);
  near(Z.expectedShareA(500, 500), 0.5);
});

test("old configs keep their league points at config.points", () => {
  const c = Z.withGames({ points: { low: 1, nine: 2 } });
  assert.deepEqual(c.games.league.points, { low: 1, nine: 2 });
  assert.equal(Z.livePoints(c), 10);
  assert.equal(Z.livePoints(cfg), 11);
  assert.equal(c.games.golden.w, 0.5);
});

test("Trad-Nine 5–2: Kenny 597.3 → 598.3, Mel 508 → 505.4 (V3-PLAN Session 2)", () => {
  // pA = 1 / (1 + 2^(−89.3/100)) = 0.6501. Σ w(r − pA) = 0.5 × (5 − 7 × 0.6501) = 0.2247.
  // d = 8 × 0.2247 = 1.797. Robustness 65 and 25 (tot 90): Kenny +1.797 × 50/90 = +1.0,
  // Mel −1.797 × 130/90 = −2.6.
  const results = Z.rackResults("standard", wins("aaaaabb"), cfg);
  assert.equal(Z.weightOf(results), 3.5);
  const z = Z.zargoOutcome(known(597.3, 508, 65, 25), results, cfg);
  assert.equal(z.a.to.toFixed(1), "598.3");
  assert.equal(z.b.to.toFixed(1), "505.4");
  assert.equal(z.cal, null);
});

test("11-Point-Nine, one rack 5–6 at level ratings: −0.364 (8 × (5/11 − 0.5))", () => {
  const points = [{ a: 5, b: 6, winner: "b", kind: null }];
  const results = Z.rackResults("league", points, cfg);
  assert.deepEqual(results, [{ r: 5 / 11, w: 1 }]);
  const z = Z.zargoOutcome(known(500, 500), results, cfg);
  near(z.a.to - 500, -4 / 11);
  assert.equal((z.a.to - 500).toFixed(3), "-0.364");
  near(z.b.to - 500, 4 / 11);
});

test("11-Point-Nine with dead balls: weights follow live points and equal the pooled formula (SPEC)", () => {
  // Rack 1: A 6, B 4, one dead ball (10 live). Rack 2: A 3, B 8 (11 live). Mean 10.5.
  // w = 10/10.5 and 11/10.5, summing to 2 racks. Σ w·r = (6 + 3)/10.5 = 6/7.
  // Pooled: K × racks × (9/21 − 0.5) = 16 × (−1/14) = −8/7. Equal robustness, so no tilt.
  const balls1 = { 9: "a", 1: "a", 2: "a", 3: "a", 4: "b", 5: "b", 6: "b", 7: "b", 8: "dead" };
  const balls2 = { 1: "a", 2: "a", 3: "a", 9: "b", 4: "b", 5: "b", 6: "b", 7: "b", 8: "b" };
  assert.deepEqual(Z.leagueRackPoints(balls1, cfg), { a: 6, b: 4, dead: 1 });
  assert.deepEqual(Z.leagueRackPoints(balls2, cfg), { a: 3, b: 8, dead: 0 });
  const points = [{ a: 6, b: 4 }, { a: 3, b: 8 }];
  const results = Z.rackResults("league", points, cfg);
  near(results[0].w, 10 / 10.5);
  near(results[1].w, 11 / 10.5);
  assert.equal(Z.weightOf(results), 2);
  const z = Z.zargoOutcome(known(500, 500), results, cfg);
  near(z.a.to - 500, -8 / 7);
  near(z.b.to - 500, 8 / 7);
});

test("11-Point-Nine rack with no live points still counts as a rack played", () => {
  const results = Z.rackResults("league", [{ a: 0, b: 0 }], cfg);
  assert.equal(Z.weightOf(results), 1);
  const z = Z.zargoOutcome(known(520, 480), results, cfg);
  assert.equal(z.a.to, 520);
  assert.equal(z.b.to, 480);
});

test("Golden-Nine rack points: wins, fouls, three fouls, intentional", () => {
  const rack = (winner, kind, fa = 0, fb = 0) => ({ winner, kind, fouls: { a: fa, b: fb }, balls: {}, pottedAt: {} });
  assert.deepEqual(Z.gameRackPoints("golden", rack("a", "big"), cfg), { a: 10, b: 0, dead: 0 });
  assert.deepEqual(Z.gameRackPoints("golden", rack("b", "small", 1, 0), cfg), { a: 0, b: 8, dead: 0 });
  // Three fouls by A: 1 + 1 + 2 to B, and that is the win.
  assert.deepEqual(Z.gameRackPoints("golden", rack("b", "fouls", 3, 1), cfg), { a: 1, b: 4, dead: 0 });
  assert.deepEqual(Z.gameRackPoints("golden", rack("a", "intentional"), cfg), { a: 10, b: 0, dead: 0 });
  // Trad-Nine: one rack is one rack, fouls never score.
  assert.deepEqual(Z.gameRackPoints("standard", rack("a", "run", 2, 2), cfg), { a: 1, b: 0, dead: 0 });
  // The rating reads only who won, at w = 0.5.
  assert.deepEqual(Z.rackResults("golden", wins("ab"), cfg), [{ r: 1, w: 0.5 }, { r: 0, w: 0.5 }]);
});

test("calibration: a new player jumps to what the result implies, the known one holds", () => {
  // A new (500) v B known (600). Trad-Nine, A wins 1 of 5: mean r 0.2, gap 100 × log2(0.25) = −200.
  // Match 1: all the way, 600 − 200 = 400. Match 2: half the way, 500 + (400 − 500) / 2 = 450.
  const results = Z.rackResults("standard", wins("abbbb"), cfg);
  const first = Z.zargoOutcome({ za: 500, zb: 600, sessionsA: 0, sessionsB: 3, robustnessA: 0, robustnessB: 40 }, results, cfg);
  near(first.a.to, 400);
  assert.equal(first.b.to, 600);
  assert.equal(first.cal, "a");
  const second = Z.zargoOutcome({ za: 500, zb: 600, sessionsA: 1, sessionsB: 3, robustnessA: 2.5, robustnessB: 40 }, results, cfg);
  near(second.a.to, 450);
  // The same from B's side: B new at 500, A known at 600, A wins 4 of 5 → B to 600 − 200.
  const flipped = Z.zargoOutcome({ za: 600, zb: 500, sessionsA: 7, sessionsB: 0, robustnessA: 40, robustnessB: 0 },
    Z.rackResults("standard", wins("baaaa"), cfg), cfg);
  near(flipped.b.to, 400);
  assert.equal(flipped.cal, "b");
});

test("calibration caps one match at a 250 gap", () => {
  // A whitewash clamps mean r to 0.97: 100 × log2(0.97/0.03) = 501, capped to 250.
  const z = Z.zargoOutcome({ za: 500, zb: 500, sessionsA: 0, sessionsB: 5, robustnessA: 0, robustnessB: 30 },
    Z.rackResults("standard", wins("aaaaa"), cfg), cfg);
  near(z.a.to, 750);
});

test("settling: two new players move 4× with no robustness to tilt it", () => {
  // Level, A wins 2 of 3 Trad-Nine racks: d = 8 × (1 − 1.5 × 0.5) = 2, boosted 4× to ±8.
  const z = Z.zargoOutcome({ za: 500, zb: 500, sessionsA: 0, sessionsB: 0, robustnessA: 0, robustnessB: 0 },
    Z.rackResults("standard", wins("aab"), cfg), cfg);
  near(z.a.to, 508);
  near(z.b.to, 492);
});

test("known players: one match moves a rating 40 at most", () => {
  // B 200 above wins nothing in 20 Golden-Nine racks: d = 8 × 10 × (1 − 0.2) = 64, clamped to 40.
  const z = Z.zargoOutcome(known(500, 700), Z.rackResults("golden", wins("a".repeat(20)), cfg), cfg);
  near(z.a.to, 540);
  near(z.b.to, 660);
});

test("counted racks: an 11-Point-Nine part-rack dropped at End doesn't count", () => {
  const full = { 1: "a", 2: "a", 3: "a", 4: "a", 5: "a", 6: "b", 7: "b", 8: "b", 9: "b" };   // 5–6
  const doc = extra => ({ game: "league", totals: { a: 5, b: 6, dead: 0 }, racks: { 1: { balls: full }, ...extra } });
  // End straight after "Start rack 2": the empty record isn't a rack.
  assert.deepEqual(Z.countedRacks(doc({ 2: { balls: {} } }), cfg).map(r => r.n), [1]);
  // End mid-rack, dropped: its points aren't in the totals.
  assert.deepEqual(Z.countedRacks(doc({ 2: { balls: { 1: "a", 2: "b" } } }), cfg).map(r => r.n), [1]);
  // A dropped rack of only dead balls shows up in the dead count.
  assert.deepEqual(Z.countedRacks(doc({ 2: { balls: { 3: "dead" } } }), cfg).map(r => r.n), [1]);
  // Counted at End: its points are in the totals.
  const counted = { game: "league", totals: { a: 6, b: 7, dead: 0 }, racks: { 1: { balls: full }, 2: { balls: { 1: "a", 2: "b" } } } };
  assert.deepEqual(Z.countedRacks(counted, cfg).map(r => r.n), [1, 2]);
  const banked = Z.matchPoints(counted, cfg);
  assert.equal(banked.racks, 2);
  assert.deepEqual(banked.points.map(p => p.winner), ["b", null]);
  // Golden-Nine and Trad-Nine: racks with a winner.
  const gold = { game: "golden", racks: { 1: { winner: "a", kind: "big" }, 2: { winner: null, fouls: { a: 1, b: 0 } } } };
  assert.deepEqual(Z.countedRacks(gold, cfg).map(r => r.n), [1]);
  // A document with no game is 11-Point-Nine.
  assert.equal(Z.gameOf({}), "league");
});

test("race chart: at pA 0.65 a race to 7 becomes 7 v 4, and 5 becomes 5 v 3 (ZARGO.md)", () => {
  const pA = 0.65;   // a gap of about 90
  assert.deepEqual(Z.raceChart(Z.expectedShareA(590, 500), 7), { a: 7, b: 4 });
  assert.deepEqual(Z.raceChart(pA, 7), { a: 7, b: 4 });
  assert.equal(Math.round(Z.raceWin(pA, 7, 4) * 100), 51);
  assert.deepEqual(Z.raceChart(pA, 5), { a: 5, b: 3 });
  assert.equal(Math.round(Z.raceWin(pA, 5, 3) * 100), 53);
  // The underdog on the blue side gets the short target.
  assert.deepEqual(Z.raceChart(1 - pA, 7), { a: 4, b: 7 });
  // Level players: level race. A race to 1 is a single rack.
  assert.deepEqual(Z.raceChart(0.5, 5), { a: 5, b: 5 });
  near(Z.raceWin(0.7, 1, 1), 0.7);
});

test("8-ball rack points: the 10-point, 17-point and 14-point systems are one config edit", () => {
  const down = n => Object.fromEntries(Z.STRIPES.slice(0, n).map(b => [b, "b"]));
  // A owns solids; the stripes that are down are B's own balls.
  const rack = (winner, n) => ({ winner, kind: "win", fouls: { a: 0, b: 0 },
    balls: down(n), pottedAt: {}, groups: { a: "solids" } });
  // VNEA and CSI's 10-point: the winner always 10, the loser a point a ball. Rack total 10 to 17.
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("a", 4), cfg), { a: 10, b: 4, dead: 0 });
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("a", 0), cfg), { a: 10, b: 0, dead: 0 });
  // CSI's 17-point "ball count": the winner also takes a point for each ball still up, so 17 always.
  const seventeen = Z.withGames({ games: { tenpoint: { points: { winner: 10, ball: 1, left: 1 } } } });
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("a", 4), seventeen), { a: 13, b: 4, dead: 0 });
  assert.equal(seventeen.games.tenpoint.meanLoserBalls, 3.5);   // the rest of the game survives the edit
  // USAPL's 14-point: seven balls and seven for the 8.
  const usapl = Z.withGames({ games: { tenpoint: { points: { winner: 14, ball: 1, left: 0 } } } });
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("b", 0), usapl), { a: 0, b: 14, dead: 0 });
  // Trad-Eight: one rack is one rack, whatever is left on the table.
  assert.deepEqual(Z.gameRackPoints("eight", rack("a", 6), cfg), { a: 1, b: 0, dead: 0 });
  assert.equal(cfg.games.eight.eightOnBreak, "spot");
});

test("8-ball: the loser's balls are counted off the table at the end of the rack", () => {
  const rack = (winner, left) => ({ winner, kind: "win", fouls: { a: 0, b: 0 }, balls: {},
    pottedAt: {}, groups: { a: null }, left });
  // The count is the balls still up; the points are the ones down, so the two add to seven.
  assert.equal(Z.ballsLeft(rack("a", 4)), 4);
  assert.equal(Z.loserBalls(rack("a", 4)), 3);
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("a", 4), cfg), { a: 10, b: 3, dead: 0 });
  // Both ends: a break and run leaves all seven up, a loser who cleared has none.
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("b", 7), cfg), { a: 0, b: 10, dead: 0 });
  assert.deepEqual(Z.gameRackPoints("tenpoint", rack("a", 0), cfg), { a: 10, b: 7, dead: 0 });
  // Not answered yet, or answered with something that isn't a count: no count at all.
  for(const bad of [null, undefined, -1, 8, 3.5, "3"]) assert.equal(Z.ballsLeft(rack("a", bad)), null);
  assert.equal(Z.loserBalls(rack("a", null)), 0);
  assert.equal(Z.loserBalls(rack(null, 4)), 0);   // no winner, so no loser
  // A rack scored before 2.4.0 has no count, so it's still read off the ball drop it was
  // entered on: three of B's own stripes down, whoever potted them.
  const old = { winner: "a", kind: "win", fouls: { a: 0, b: 0 },
    balls: { 1: "a", 9: "b", 10: "b", 11: "a" }, pottedAt: {}, groups: { a: "solids" } };
  assert.equal(Z.ballsLeft(old), null);
  assert.equal(Z.loserBalls(old), 3);
  // rackOf reads the count off a stored record, and a new rack starts without one.
  assert.equal(Z.rackOf({ winner: "a", left: 6 }).left, 6);
  assert.equal(Z.rackOf({ winner: "a", left: 9 }).left, null);
  assert.equal(Z.rackOf(old).left, null);
  assert.equal(Z.newRack().left, null);
});

test("8-ball groups: guessed from the drop, or set by hand on the label", () => {
  const r = (balls, set) => ({ winner: "a", kind: "win", fouls: { a: 0, b: 0 }, balls,
    pottedAt: {}, groups: { a: set || null } });
  // Nothing potted: nobody's group is known.
  assert.deepEqual(Z.groupsOf(r({})), { a: null, b: null, set: false });
  // B has only potted stripes, so B is stripes and A gets the rest.
  assert.deepEqual(Z.groupsOf(r({ 11: "b", 14: "b" })), { a: "solids", b: "stripes", set: false });
  // A has one of each (a ball down on a foul), so the guess waits for B.
  assert.deepEqual(Z.groupsOf(r({ 3: "a", 12: "a" })), { a: null, b: null, set: false });
  assert.deepEqual(Z.groupsOf(r({ 3: "a", 12: "a", 13: "b" })), { a: "solids", b: "stripes", set: false });
  // Set by hand beats the guess, and says so.
  assert.deepEqual(Z.groupsOf(r({ 11: "b" }, "stripes")), { a: "stripes", b: "solids", set: true });
  // The loser's balls down, whoever potted them.
  assert.equal(Z.loserBalls(r({ 1: "a", 9: "b", 10: "b", 11: "b" })), 3);
  assert.equal(Z.loserBalls(r({ 1: "a", 9: "b", 10: "b", 11: "b", 12: "b", 13: "b", 14: "b", 15: "b" })), 7);
  // No winner yet, so no loser. An unknown group scores nothing.
  assert.equal(Z.loserBalls(Object.assign(r({ 1: "a", 9: "b" }), { winner: null })), 0);
  assert.equal(Z.loserBalls(r({})), 0);
  // rackOf reads all fifteen balls and the group off a stored record. The 8 stays a ball like
  // any other (it is one in 11-Point-Nine); the 8-ball drop simply has no slot for it.
  const read = Z.rackOf({ winner: "b", kind: "foul8", balls: { 14: "a", 8: "a" }, groups: { a: "stripes" } });
  assert.deepEqual(read.balls, { 8: "a", 14: "a" });
  assert.equal(read.groups.a, "stripes");
  assert.equal(Z.groupsOf({ balls: { 8: "a" } }).a, null);   // the 8 belongs to neither group
  assert.equal(Z.rackOf({ groups: { a: "nonsense" } }).groups.a, null);
});

test("Ten-Point-Eight rates exactly as Trad-Nine does: the rack winners, at w = 0.5", () => {
  const down = n => Object.fromEntries(Z.STRIPES.slice(0, n).map(b => [b, "b"]));
  const rack = (winner, n, kind) => ({ winner, kind: kind || "win", fouls: { a: 0, b: 0 },
    balls: Object.assign({ 1: "a" }, down(n)), pottedAt: {}, groups: { a: null } });
  // A wins with 6 of B's stripes down (10–6), A breaks and runs (10–0), B wins on A's foul on
  // the 8 with one solid down (1–10). A takes 2 racks of 3.
  const doc = game => ({ game, status: "done", endedAt: 1, playerA: "A", playerB: "B",
    racks: { 1: rack("a", 6), 2: rack("a", 0, "run"), 3: rack("b", 7, "foul8") } });
  const ten = Z.matchPoints(doc("tenpoint"), cfg);
  assert.deepEqual(ten.points.map(p => [p.a, p.b, p.winner]), [[10, 6, "a"], [10, 0, "a"], [1, 10, "b"]]);
  assert.equal(ten.a, 21);
  assert.equal(ten.b, 16);
  assert.equal(ten.racksA, 2);
  const eight = Z.matchPoints(doc("eight"), cfg);
  assert.equal(eight.a, 2);
  assert.equal(eight.b, 1);
  // Points, the loser's balls and the kind of win never reach the rating.
  const want = Z.rackResults("standard", wins("aab"), cfg);
  assert.deepEqual(Z.rackResults("tenpoint", ten.points, cfg), want);
  assert.deepEqual(Z.rackResults("eight", eight.points, cfg), want);
  assert.equal(Z.weightOf(want), 1.5);
  assert.deepEqual(Z.zargoOutcome(known(597.3, 508, 65, 25), Z.rackResults("tenpoint", ten.points, cfg), cfg),
    Z.zargoOutcome(known(597.3, 508, 65, 25), want, cfg));
});

test("8-ball: a rack lost on the 8 is a rack won, and one with no winner never counts", () => {
  const m = { game: "eight", racks: {
    1: { winner: "b", kind: "foul8", fouls: { a: 1, b: 0 } },
    2: { winner: null, fouls: { a: 0, b: 2 } } } };
  assert.deepEqual(Z.countedRacks(m, cfg).map(r => r.n), [1]);
  const banked = Z.matchPoints(m, cfg);
  assert.deepEqual(banked.points, [{ a: 0, b: 1, winner: "b", kind: "foul8" }]);
  assert.equal(banked.racks, 1);
  assert.deepEqual(Z.rackResults("eight", banked.points, cfg), [{ r: 0, w: 0.5 }]);
  // Ten-Point-Eight: the same rack, with nothing of A's down, is 10–0.
  assert.deepEqual(Z.matchPoints({ ...m, game: "tenpoint" }, cfg).points,
    [{ a: 0, b: 10, winner: "b", kind: "foul8" }]);
});

test("Ten-Point-Eight quotas: a 160-point gap is 8.4 points a rack to 5.1 (V3-PLAN §7.3)", () => {
  // pA = 1 / (1 + 2^−1.6) = 0.75195. eA = 10 × 0.75195 + 3.5 × 0.24805 = 8.388,
  // eB = 10 × 0.24805 + 3.5 × 0.75195 = 5.112, and the two always sum to 10 + L̄.
  const pA = Z.expectedShareA(660, 500);
  near(pA, 0.7519493, 1e-6);
  const e = Z.expectedEightPoints(pA, cfg);
  assert.equal(e.a.toFixed(1), "8.4");
  assert.equal(e.b.toFixed(1), "5.1");
  near(e.a + e.b, 13.5);
  // Five fixed racks: quotas round(5 × e). (V3-PLAN says 42 and 25; its own rule gives 25.56 → 26.)
  assert.equal(Math.round(5 * e.a), 42);
  assert.equal(Math.round(5 * e.b), 26);
  // A race to 50 for the favourite puts the underdog on round(50 × eB / eA).
  assert.equal(Math.round(50 * e.b / e.a), 30);
  // Level ratings split every rack down the middle.
  const level = Z.expectedEightPoints(0.5, cfg);
  near(level.a, 6.75);
  near(level.b, 6.75);
  // The 17-point system's racks are always worth 17, so the quotas still sum to the racks played.
  const seventeen = Z.withGames({ games: { tenpoint: { points: { winner: 10, ball: 1, left: 1 } } } });
  near(Z.expectedEightPoints(pA, seventeen).a + Z.expectedEightPoints(pA, seventeen).b, 17);
});

test("Ten-Point-Eight's quota covers the racks PLAYED, not the racks planned", () => {
  // The owner's match, 2026-09-19: Kenny 506 v Melanie 332 over 5 fixed racks. They played one
  // rack — Kenny won it 10–5 — and ended the match. The 5-rack quotas are 43 and 25.
  const pA = Z.expectedShareA(506, 332);
  const planned = Z.eightQuota(pA, 5, cfg);
  assert.deepEqual(planned, { a: 43, b: 25 });

  const t1 = { a: 10, b: 5 };                       // one rack: Kenny 10, Melanie 5 balls down
  // Against the PLANNED quota the match inverts: both fall short, Kenny's bigger quota falls
  // short by more, so it hands the match to the player who won no racks. This is the bug.
  assert.ok(Z.eightLead(t1, planned) > 0, "the planned quota wrongly favours B");

  // Against the quota for the one rack actually played, the player who won the rack wins.
  const played = Z.eightQuota(pA, 1, cfg);
  assert.deepEqual(played, { a: 9, b: 5 });
  assert.ok(Z.eightLead(t1, played) < 0, "Kenny won the only rack, so Kenny wins");
  assert.equal(Z.eightLead(t1, played), -1);
});

test("Ten-Point-Eight: the quota spot still decides a match that runs its full length", () => {
  const pA = Z.expectedShareA(660, 500);
  const q = Z.eightQuota(pA, 5, cfg);
  assert.deepEqual(q, { a: 42, b: 26 });
  // The handover's five-rack match: 35-29 to Melanie on the spot, because Kenny needed 42.
  assert.ok(Z.eightLead({ a: 35, b: 29 }, q) > 0, "B finishes further past her own quota");
  // Hitting your own quota exactly is a tie, whatever the raw points say.
  assert.equal(Z.eightLead({ a: 42, b: 26 }, q), 0);
  // The favourite's raw points can lead while the spot says otherwise — that is the handicap.
  assert.ok(Z.eightLead({ a: 40, b: 27 }, q) > 0);
});

test("Ten-Point-Eight: a quota is never zero, so an early lead is always readable", () => {
  const pA = Z.expectedShareA(700, 300);
  const q = Z.eightQuota(pA, 1, cfg);
  assert.ok(q.a >= 1 && q.b >= 1);
  // Over the racks played, the two quotas sum to about the racks times a rack's total.
  for(const racks of [1, 2, 5, 9]){
    const s = Z.eightQuota(pA, racks, cfg);
    near(s.a + s.b, racks * 13.5, 1.01, "racks " + racks);
  }
});

// ---------- replay ----------
// Four players. C has a starter of 508; the others start at the default 500.
//
//  #  ended  match (blue v amber)       racks                       regime        result
//  1  100    A v B  Trad-Nine            A, A, B                     settling      d = 8 × (1 − 0.75) = 2, ×4:
//                                                                                  A 508, B 492. w 1.5
//  2  200    A v C  Trad-Nine            A, C                        settling      level, r = pA: no move. w 1
//  3  300    A v C  Trad-Nine            A, C                        settling      no move. A now has 3 matches
//  4  400    A v D  Trad-Nine            A, A, D, A, A               calibrate D   mean r 0.8, gap 200:
//                                                                                  D 508 − 200 = 308. w 2.5
//  5  500    C v A  Trad-Nine            C, A                        calibrate C   gap 0: C stays 508. w 1
//  6  600    A v C  11-Point-Nine        6–4 (1 dead), 3–8, empty    known         Σw·r = 6/7, d = −8/7;
//                                                                                  A robustness 7, C 3 (tot 10):
//                                                                                  A −8/7 × 0.6 = −24/35,
//                                                                                  C +8/7 × 1.4 = +1.6. w 2
// End state:
//   A  508 − 24/35   robustness 1.5 + 1 + 1 + 2.5 + 1 + 2 = 9   matches 6
//   B  492           1.5                                         1
//   C  509.6         1 + 1 + 1 + 2 = 5                           4
//   D  308           2.5                                         1
test("replay rebuilds a six-match history worked by hand", () => {
  const trad = (id, endedAt, playerA, playerB, winners) => ({
    id, endedAt, startedAt: endedAt - 50, status: "done", game: "standard", handicap: "off", playerA, playerB,
    racks: Object.fromEntries([...winners].map((w, i) => [String(i + 1), { winner: w, kind: "win", fouls: { a: 0, b: 0 } }])),
    zargoBefore: { a: 1, b: 1 }, zargoAfter: { a: 1, b: 1 }   // stale on purpose: replay ignores them
  });
  const m6 = {
    id: "m6", endedAt: 600, startedAt: 550, status: "done", game: "league", handicap: "scoring", mode: "open",
    playerA: "A", playerB: "C", totals: { a: 9, b: 12, dead: 1 },
    racks: {
      1: { balls: { 9: "a", 1: "a", 2: "a", 3: "a", 4: "b", 5: "b", 6: "b", 7: "b", 8: "dead" } },
      2: { balls: { 1: "a", 2: "a", 3: "a", 9: "b", 4: "b", 5: "b", 6: "b", 7: "b", 8: "b" } },
      3: { balls: {} }
    }
  };
  const matches = [
    m6,
    trad("m3", 300, "A", "C", "ab"),
    trad("m1", 100, "A", "B", "aab"),
    trad("m5", 500, "C", "A", "ab"),
    trad("m4", 400, "A", "D", "aabaa"),
    trad("m2", 200, "A", "C", "ab"),
    // Never rated: still live, and discarded.
    { ...trad("live", 50, "A", "B", "aaaaa"), status: "live", endedAt: null },
    { ...trad("binned", 450, "B", "D", "bbbbb"), status: "discarded" }
  ];
  const { players, matches: out } = Z.replay(matches, { C: { zargo: 508, setAt: 1, setBy: "x" } }, cfg);

  assert.deepEqual(out.map(m => m.id), ["m1", "m2", "m3", "m4", "m5", "m6"]);
  near(players.A.zargo, 508 - 24 / 35);
  near(players.A.robustness, 9);
  assert.equal(players.A.sessions, 6);
  near(players.B.zargo, 492);
  near(players.B.robustness, 1.5);
  assert.equal(players.B.sessions, 1);
  near(players.C.zargo, 509.6);
  near(players.C.robustness, 5);
  assert.equal(players.C.sessions, 4);
  near(players.D.zargo, 308);
  near(players.D.robustness, 2.5);
  assert.equal(players.D.sessions, 1);

  const m4 = out.find(m => m.id === "m4");
  assert.deepEqual(m4.before, { a: 508, b: 500 });
  near(m4.after.b, 308);
  assert.equal(m4.cal, "b");
  assert.equal(out.find(m => m.id === "m5").cal, "a");
  assert.deepEqual(out.find(m => m.id === "m1").after, { a: 508, b: 492 });
});

test("replay: starters as plain numbers, the default otherwise, and nothing to replay", () => {
  const empty = Z.replay([], { X: 640 }, cfg);
  assert.deepEqual(empty.players, { X: { zargo: 640, robustness: 0, sessions: 0 } });
  assert.deepEqual(empty.matches, []);
  const one = Z.replay([{ id: "m", status: "done", endedAt: 1, game: "standard", playerA: "X", playerB: "Y",
    racks: { 1: { winner: "b", kind: "win" } } }], { X: 640 }, cfg);
  assert.deepEqual(one.matches[0].before, { a: 640, b: 500 });
  // A player against themselves (two entries merged since) and a match with no counted racks are skipped.
  const skipped = Z.replay([
    { id: "self", status: "done", endedAt: 1, game: "standard", playerA: "X", playerB: "X", racks: { 1: { winner: "a" } } },
    { id: "none", status: "done", endedAt: 2, game: "standard", playerA: "X", playerB: "Y", racks: { 1: { winner: null } } }
  ], {}, cfg);
  assert.deepEqual(skipped.matches, []);
});

test("replay: an 8-ball match moves ratings like a nine-ball one with the same winners", () => {
  const down = n => Object.fromEntries(Z.STRIPES.slice(0, n).map(b => [b, "b"]));
  const rack = (winner, n) => ({ winner, kind: "win", fouls: { a: 0, b: 0 },
    balls: Object.assign({ 1: "a" }, down(n)) });
  const m = game => ({ id: "m1", endedAt: 100, startedAt: 90, status: "done", game, handicap: "scoring",
    mode: "fixed", racksPlanned: 3, playerA: "A", playerB: "B",
    racks: { 1: rack("a", 5), 2: rack("a", 2), 3: rack("b", 7) } });
  // Both players new and level, so settling: d = 8 × 0.5 × (2 − 3 × 0.5) = 2, boosted 4× to ±8.
  for(const game of ["tenpoint", "eight", "standard"]){
    const { players } = Z.replay([m(game)], {}, cfg);
    near(players.A.zargo, 508, 1e-9, game);
    near(players.B.zargo, 492, 1e-9, game);
    near(players.A.robustness, 1.5, 1e-9, game);
    assert.equal(players.A.sessions, 1);
  }
});
