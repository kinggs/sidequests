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
