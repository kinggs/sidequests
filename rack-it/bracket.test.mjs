// Tests for rack-it/bracket.js. Run from the repo root:  node --test
// (`node --test rack-it/bracket.test.mjs` runs just this file.)
//
// Players are letters or p1…p32; nothing here is real data.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "./bracket.js";

// A small seeded random, so a failing property case can be replayed.
function rng(seed){
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const ids = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const tour = (n, opts = {}) => ({ format: "single", final: "one", third: false, race: { w: 3 },
  players: ids(n), seeds: ids(n), results: {}, ...opts });
const fx = (t, key) => B.state(t).find(x => x.key === key);
// A result for whichever of the fixture's two players should win.
function win(t, key, who, score = 1){
  const x = fx(t, key);
  const w = x.a === who ? "a" : "b";
  const T = x.targets, lose = side => Math.min(score, T[side] - 1);
  const r = { ids: [x.a, x.b], w, a: w === "a" ? T.a : lose("a"), b: w === "b" ? T.b : lose("b"), by: "u", at: 1 };
  t.results = { ...t.results, [key]: r };
  return r;
}
// Plays every ready fixture, the higher seed (lower number) always winning, until none is ready.
function chalk(t){
  for (;;){
    const ready = B.state(t).find(x => x.status === "ready");
    if (!ready) return t;
    const n = id => +id.slice(1);
    win(t, ready.key, n(ready.a) < n(ready.b) ? ready.a : ready.b);
  }
}

test("positions keep the top of the draw apart", () => {
  assert.deepEqual(B.positions(4), [1, 4, 2, 3]);
  assert.deepEqual(B.positions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(B.positions(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
});

test("build: sizes, keys and round names", () => {
  const s = B.build({ format: "single", n: 8 });
  assert.equal(s.length, 7);
  assert.deepEqual(s.map(f => f.key), ["W1-1", "W1-2", "W1-3", "W1-4", "W2-1", "W2-2", "W3-1"]);
  assert.deepEqual([...new Set(s.map(f => f.name))], ["Quarter-finals", "Semi-finals", "Final"]);
  assert.equal(B.build({ format: "single", n: 32 })[0].name, "Round 1");
  assert.equal(B.build({ format: "single", n: 8, third: true }).at(-1).key, "T");
  // Double: 2n-2 fixtures for a full bracket of 8 (7 W, 6 L, F), plus F2 with the decider.
  const d = B.build({ format: "double", n: 8 });
  assert.equal(d.length, 14);
  assert.equal(d.filter(f => f.side === "L").length, 6);
  assert.equal(B.build({ format: "double", n: 8, final: "reset" }).length, 15);
  assert.equal(d.find(f => f.key === "L4-1").name, "Losers' side final");
  assert.equal(d.find(f => f.key === "W3-1").name, "Winners' side final");
  assert.throws(() => B.build({ n: 1 }), RangeError);
  assert.throws(() => B.build({ n: 8, format: "swiss" }), RangeError);
});

test("byes go to the top of the draw, at 3, 5, 6, 7 and 9", () => {
  for (const [n, byes] of [[3, [1]], [5, [1, 2, 3]], [6, [1, 2]], [7, [1]], [9, [1, 2, 3, 4, 5, 6, 7]]]){
    const st = B.state(tour(n));
    const got = st.filter(x => x.status === "bye").map(x => +x.winner.slice(1)).sort((a, b) => a - b);
    assert.deepEqual(got, byes, `n=${n}`);
    // Each bye winner is already placed in round 2.
    for (const id of got.map(i => `p${i}`))
      assert.ok(st.some(x => x.round === 2 && x.side === "W" && (x.a === id || x.b === id)), `n=${n} p${id}`);
  }
});

test("a bye fixture's missing loser leaves holes the losers' side skips", () => {
  // 5 in double: three W1 byes, so L1 has at most one player in each fixture.
  const t = tour(5, { format: "double" });
  const st = B.state(t);
  assert.equal(st.filter(x => x.side === "L" && x.round === 1).length, 1, "L1-1 waits on 4v5, L1-2 is two holes");
  assert.equal(st.find(x => x.key === "L1-1").status, "waiting");
  assert.deepEqual(st.find(x => x.key === "L1-1").empty, [true, false], "the bye's side is empty for good; the other waits on 4 v 5");
  assert.ok(!st.some(x => x.key === "L1-2"), "both feeders were byes: skipped entirely");
  win(t, "W1-2", "p4");
  assert.equal(fx(t, "L1-1").status, "bye");
  assert.equal(fx(t, "L1-1").winner, "p5");
});

test("n = 3, single: one semi is a bye, the other is a match, then the final", () => {
  const t = tour(3);
  assert.equal(fx(t, "W1-1").status, "bye");
  assert.equal(fx(t, "W1-2").status, "ready");
  assert.equal(fx(t, "W2-1").status, "waiting");
  assert.equal(fx(t, "W2-1").a, "p1");
  win(t, "W1-2", "p3");
  assert.equal(fx(t, "W2-1").status, "ready");
  win(t, "W2-1", "p3");
  assert.ok(B.finished(t));
  assert.deepEqual(B.standings(t).map(s => [s.id, s.place, s.placeTo]), [["p3", 1, 1], ["p1", 2, 2], ["p2", 3, 3]]);
});

test("the race: losers' side and final overrides", () => {
  const t = tour(4, { format: "double", final: "reset", race: { w: 3, l: 2, f: 5 } });
  const st = B.state(t);
  assert.equal(st.find(x => x.key === "W1-1").race, 3);
  assert.equal(st.find(x => x.key === "L1-1").race, 2);
  assert.equal(st.find(x => x.key === "F").race, 5);
  assert.equal(B.raceFor({ race: { w: 4 } }, { key: "T", side: "F" }), 4);
  assert.equal(B.raceFor({}, { key: "W1-1", side: "W" }), 3);
});

test("validResult: the race reached by exactly one side, or a walkover", () => {
  const t = tour(4);
  const ok = (r) => B.validResult(t, "W1-1", { ids: ["p1", "p4"], ...r });
  assert.ok(ok({ w: "a", a: 3, b: 1 }));
  assert.ok(ok({ w: "b", a: 2, b: 3 }));
  assert.ok(ok({ w: "b", wo: true, a: 0, b: 0 }));
  assert.ok(!ok({ w: "a", a: 2, b: 1 }), "nobody at the race");
  assert.ok(!ok({ w: "a", a: 3, b: 3 }), "both at the race");
  assert.ok(!ok({ w: "a", a: 4, b: 1 }), "past the race");
  assert.ok(!ok({ w: "b", a: 3, b: 1 }), "w disagrees with the score");
  assert.ok(!ok({ w: "a", wo: true, a: 1, b: 0 }), "a walkover is 0–0");
  assert.ok(!B.validResult(t, "W1-1", { ids: ["p4", "p1"], w: "a", a: 3, b: 0 }), "players the wrong way round");
  assert.ok(!B.validResult(t, "W1-1", { ids: ["p1", "p2"], w: "a", a: 3, b: 0 }), "wrong players");
  assert.ok(!B.validResult(t, "W2-1", { ids: ["p1", "p2"], w: "a", a: 3, b: 0 }), "not ready yet");
  assert.ok(!B.validResult(tour(3), "W1-1", { ids: ["p1", null], w: "a", a: 3, b: 0 }), "a bye");
  assert.ok(!B.validResult(t, "X9", { ids: ["p1", "p4"], w: "a", a: 3, b: 0 }), "no such fixture");
});

test("a result that doesn't fit is ignored, and reported", () => {
  const t = tour(4);
  t.results = {
    "W1-1": { ids: ["p1", "p2"], w: "a", a: 3, b: 0 },      // wrong pair
    "W1-2": { ids: ["p2", "p3"], w: "a", a: 2, b: 1 },      // nobody at the race
    "W2-1": { ids: ["p1", "p2"], w: "a", a: 3, b: 0 }       // not ready
  };
  const st = B.state(t);
  assert.deepEqual(st.map(x => x.status), ["ready", "ready", "waiting"]);
  assert.ok(st.every(x => x.ignored));
  assert.deepEqual(B.ignored(t), ["W1-1", "W1-2", "W2-1"]);
  // A result on a bye is ignored too, and so is a decider nobody needs.
  const u = tour(3, { results: { "W1-1": { ids: ["p1", null], w: "a", wo: true, a: 0, b: 0 } } });
  assert.deepEqual(B.ignored(u), ["W1-1"]);
});

test("clearing a result re-derives who plays after it", () => {
  const t = chalk(tour(8));
  assert.equal(fx(t, "W3-1").winner, "p1");
  // Rewrite the first quarter-final the other way: its old semi and final no longer fit.
  assert.ok(!B.canClear(t, "W1-1"), "the semi it feeds has a result");
  const { "W1-1": _, ...rest } = t.results;
  t.results = rest;
  win(t, "W1-1", "p8");
  const st = B.state(t);
  assert.equal(st.find(x => x.key === "W2-1").status, "ready");
  assert.equal(st.find(x => x.key === "W2-1").a, "p8");
  assert.ok(st.find(x => x.key === "W2-1").ignored, "the old semi (p1 v p4) is ignored");
  assert.equal(st.find(x => x.key === "W3-1").status, "waiting");
  assert.ok(st.find(x => x.key === "W3-1").ignored);
});

test("canClear: only the newest results, reaching through byes", () => {
  const t = tour(4);
  assert.ok(!B.canClear(t, "W1-1"), "nothing to clear");
  win(t, "W1-1", "p1"); win(t, "W1-2", "p2");
  assert.ok(B.canClear(t, "W1-1"));
  win(t, "W2-1", "p1");
  assert.ok(!B.canClear(t, "W1-1"));
  assert.ok(B.canClear(t, "W2-1"));
});

test("canClear sees through a bye", () => {
  const d = tour(5, { format: "double" });
  win(d, "W1-2", "p4");                                      // p5 drops to L1-1, a bye
  win(d, "W2-1", "p1");                                      // p4 drops to L2 (cross-seeded)
  assert.ok(!B.canClear(d, "W1-2"), "W2-1 (p1 v p4) depends on W1-2 directly");
  const d2 = tour(5, { format: "double" });
  win(d2, "W1-2", "p4");
  win(d2, "W2-2", "p2");                                     // p3 drops; meets p5 from the bye
  const l2 = B.state(d2).find(x => x.side === "L" && x.round === 2 && x.status === "ready");
  assert.deepEqual([l2.a, l2.b].sort(), ["p3", "p5"]);
  win(d2, l2.key, "p5");
  assert.ok(!B.canClear(d2, "W1-2"), "L2 got p5 through L1-1's bye");
});

test("double, 4: the reset final both ways", () => {
  const base = () => {
    const t = tour(4, { format: "double", final: "reset" });
    win(t, "W1-1", "p1"); win(t, "W1-2", "p2"); win(t, "W2-1", "p1");
    win(t, "L1-1", "p3"); win(t, "L2-1", "p3");
    return t;
  };
  // The winners' side winner takes the final: done, no decider.
  const a = base();
  assert.equal(fx(a, "F").a, "p1"); assert.equal(fx(a, "F").b, "p3");
  assert.ok(!B.state(a).some(x => x.key === "F2"), "no decider until the final is played");
  win(a, "F", "p1");
  assert.ok(B.finished(a));
  assert.ok(!B.state(a).some(x => x.key === "F2"));
  assert.deepEqual(B.standings(a).map(s => [s.id, s.place]), [["p1", 1], ["p3", 2], ["p2", 3], ["p4", 4]]);
  // The losers' side winner takes it: a decider, then done.
  const b = base();
  win(b, "F", "p3");
  assert.ok(!B.finished(b));
  assert.equal(fx(b, "F2").status, "ready");
  assert.deepEqual(B.standings(b).filter(s => s.place == null).map(s => s.id).sort(), ["p1", "p3"]);
  win(b, "F2", "p1");
  assert.ok(B.finished(b));
  assert.deepEqual(B.standings(b).slice(0, 2).map(s => s.id), ["p1", "p3"]);
  // With one final, the losers' side winner taking it wins the tournament.
  const c = base(); c.final = "one";
  win(c, "F", "p3");
  assert.ok(B.finished(c));
  assert.deepEqual(B.standings(c).slice(0, 2).map(s => s.id), ["p3", "p1"]);
  // A decider stored before it's needed is ignored.
  const d = base();
  d.results.F2 = { ids: ["p1", "p3"], w: "a", a: 3, b: 0 };
  assert.deepEqual(B.ignored(d), ["F2"]);
});

test("single, third place: played, and shared when it isn't", () => {
  const t = chalk(tour(8, { third: true }));
  assert.ok(B.finished(t));
  assert.deepEqual(B.standings(t).map(s => [s.place, s.placeTo]),
    [[1, 1], [2, 2], [3, 3], [4, 4], [5, 8], [5, 8], [5, 8], [5, 8]]);
  const u = chalk(tour(8));
  assert.deepEqual(B.standings(u).map(s => [s.place, s.placeTo]).slice(2, 4), [[3, 4], [3, 4]]);
});

test("a running list: still in, and places as soon as they're out", () => {
  const t = tour(6);
  win(t, "W1-2", "p4");                                     // p5 out in the first round of 6
  const s = B.standings(t);
  assert.equal(s.filter(x => x.place == null).length, 5);
  assert.deepEqual(s.find(x => x.id === "p5"), { id: "p5", place: 5, placeTo: 6 });
  assert.equal(B.standings({ ...t, seeds: null }).every(x => x.place == null), true);
});

test("before the draw: the shape, nobody in it", () => {
  const st = B.state({ format: "single", players: ids(5), seeds: null, results: {} });
  assert.equal(st.filter(x => x.status === "bye").length, 0);
  assert.ok(st.every(x => x.status === "waiting"));
  assert.ok(!B.finished({ format: "single", players: ids(5), seeds: null }));
});

test("the first drop never brings back the player who just beat you (8 and up)", () => {
  for (const n of [8, 12, 16, 24, 32]){
    for (let seed = 1; seed <= 20; seed++){
      const r = rng(seed * 100 + n);
      const t = tour(n, { format: "double" });
      play(t, r);
      const met = new Set();
      for (const x of B.state(t)) if (x.side === "W" && x.round === 1 && x.status === "done") met.add([x.a, x.b].sort().join());
      for (const x of B.state(t)) if (x.side === "L" && x.round === 2 && x.status === "done")
        assert.ok(!met.has([x.a, x.b].sort().join()), `n=${n} seed=${seed} ${x.key} is a rematch`);
    }
  }
});

// Plays to the end in a random order with random results (a walkover now and then).
function play(t, r){
  for (let guard = 0; guard < 500; guard++){
    const ready = B.state(t).filter(x => x.status === "ready");
    if (!ready.length) return t;
    const x = ready[Math.floor(r() * ready.length)];
    const w = r() < 0.5 ? "a" : "b";
    const T = x.targets, l = w === "a" ? "b" : "a";
    const loserRacks = Math.floor(r() * T[l]);
    const res = r() < 0.1
      ? { ids: [x.a, x.b], w, wo: true, a: 0, b: 0 }
      : { ids: [x.a, x.b], w, a: w === "a" ? T.a : loserRacks, b: w === "b" ? T.b : loserRacks };
    assert.ok(B.validResult(t, x.key, res));
    t.results = { ...t.results, [x.key]: res };
  }
  throw new Error("never finished");
}

test("property: every size 3–32, both formats, random results, everyone placed once", () => {
  const variants = [
    { format: "single" }, { format: "single", third: true },
    { format: "double", final: "one" }, { format: "double", final: "reset" }
  ];
  for (let n = 3; n <= 32; n++){
    for (const v of variants){
      for (let seed = 1; seed <= 5; seed++){
        const r = rng(n * 1000 + seed * 7 + (v.third ? 1 : 0) + (v.final === "reset" ? 2 : 0) + (v.format === "double" ? 4 : 0));
        const players = ids(n);
        const t = { ...v, race: { w: 1 + Math.floor(r() * 5), l: r() < 0.5 ? 2 : undefined }, players,
          seeds: B.draw(players, { rand: r }), results: {} };
        const tag = `n=${n} ${JSON.stringify(v)} seed=${seed}`;
        play(t, r);
        assert.ok(B.finished(t), tag);
        assert.deepEqual(B.ignored(t), [], tag);
        const st = B.state(t);
        // Matches played: one loss each for everyone but the winner (single), two for everyone
        // but the winner (double), plus third place or a decider when played.
        const played = st.filter(x => x.status === "done");
        const losses = new Map();
        for (const x of played) losses.set(x.loser, (losses.get(x.loser) || 0) + 1);
        const extra = st.some(x => x.key === "F2") ? 1 : 0;
        if (v.format === "single"){
          const third = st.some(x => x.key === "T" && x.status === "done") ? 1 : 0;
          assert.equal(played.length, n - 1 + third, tag);
        } else {
          assert.equal(played.length, 2 * n - 2 + extra, tag);
          for (const [id, c] of losses) assert.ok(c <= 2, `${tag} ${id} lost ${c} times`);
        }
        // Everyone placed exactly once; the places tile 1..n, each shared block the right size.
        const s = B.standings(t);
        assert.equal(s.length, n, tag);
        assert.deepEqual(s.map(x => x.id).sort(), players.slice().sort(), tag);
        let next = 1;
        for (let i = 0; i < s.length;){
          const { place, placeTo } = s[i];
          assert.equal(place, next, `${tag} place`);
          const block = s.filter(x => x.place === place);
          assert.equal(block.length, placeTo - place + 1, `${tag} block at ${place}`);
          assert.ok(block.every(x => x.placeTo === placeTo), tag);
          i += block.length; next = placeTo + 1;
        }
        assert.equal(next, n + 1, tag);
        assert.equal(s[0].placeTo, 1, `${tag} one winner`);
        assert.equal(s[1].place, 2, `${tag} one runner-up`);
      }
    }
  }
});

test("draw: random with an injected random, and by rating", () => {
  const a = B.draw(ids(8), { rand: rng(1) }), b = B.draw(ids(8), { rand: rng(1) });
  assert.deepEqual(a, b, "the same random, the same draw");
  assert.deepEqual(a.slice().sort(), ids(8).sort());
  assert.notDeepEqual(a, ids(8));
  const ratings = { p1: 480, p2: 620, p3: 555, p5: 700 };      // p4, p6 unrated: 500
  const d = B.draw(ids(6), { seeding: "rating", ratings, rand: rng(3) });
  assert.deepEqual(d.slice(0, 3), ["p5", "p2", "p3"]);
  assert.deepEqual(d.slice(3, 5).sort(), ["p4", "p6"]);
  assert.equal(d[5], "p1");
  // Ties land in a fresh order on a redraw.
  const orders = new Set(Array.from({ length: 20 }, (_, i) => B.draw(ids(6), { seeding: "rating", rand: rng(i) }).join()));
  assert.ok(orders.size > 1);
  assert.deepEqual(ids(3), ["p1", "p2", "p3"], "draw doesn't touch its input");
});

test("next: where a match's winner and loser go, and the places it settles", () => {
  const s8 = tour(8);
  assert.deepEqual(B.next(s8, "W1-1"), { winner: "W2-1", loser: null, out: { place: 5, placeTo: 8 }, top: null, decider: null });
  assert.deepEqual(B.next(s8, "W2-2"), { winner: "W3-1", loser: null, out: { place: 3, placeTo: 4 }, top: null, decider: null });
  assert.deepEqual(B.next(s8, "W3-1"), { winner: null, loser: null, out: { place: 2, placeTo: 2 }, top: 1, decider: null });
  const t8 = tour(8, { third: true });
  assert.equal(B.next(t8, "W2-1").loser, "T");
  assert.equal(B.next(t8, "W2-1").out, null);
  assert.deepEqual(B.next(t8, "T"), { winner: null, loser: null, out: { place: 4, placeTo: 4 }, top: 3, decider: null });
  const d4 = tour(4, { format: "double", final: "reset" });
  assert.deepEqual(B.next(d4, "W1-1"), { winner: "W2-1", loser: "L1-1", out: null, top: null, decider: null });
  assert.deepEqual(B.next(d4, "W2-1"), { winner: "F", loser: "L2-1", out: null, top: null, decider: null });
  assert.deepEqual(B.next(d4, "L1-1"), { winner: "L2-1", loser: null, out: { place: 4, placeTo: 4 }, top: null, decider: null });
  assert.deepEqual(B.next(d4, "L2-1"), { winner: "F", loser: null, out: { place: 3, placeTo: 3 }, top: null, decider: null });
  assert.equal(B.next(d4, "F").decider, "F2");
  assert.equal(B.next({ ...d4, final: "one" }, "F").decider, null);
  assert.equal(B.next(s8, "nope"), null);
  // Its places agree with standings once the match is played.
  const p = tour(6); win(p, "W1-2", "p4");
  assert.deepEqual(B.next(p, "W1-2").out, (({ place, placeTo }) => ({ place, placeTo }))(B.standings(p).find(x => x.id === "p5")));
});

test("path: a bye first, then now, then one ahead", () => {
  const t = tour(3);                                       // p1 has the bye; p2 v p3
  const steps = f => f.map(x => x.key + ":" + x.step);
  assert.deepEqual(steps(B.path(t, "p1")), ["W1-1:played", "W2-1:now"]);
  assert.equal(B.path(t, "p1")[0].status, "bye");
  assert.deepEqual(steps(B.path(t, "p2")), ["W1-2:now", "W2-1:ahead"]);
  assert.deepEqual(B.path({ ...t, seeds: null }, "p1"), []);
  assert.deepEqual(B.path(t, "nobody"), []);
});

test("path: double elimination after a loss, out, and won", () => {
  const steps = f => f.map(x => x.key + ":" + x.step);
  const d = tour(4, { format: "double" });
  win(d, "W1-1", "p1"); win(d, "W1-2", "p2");
  assert.deepEqual(steps(B.path(d, "p4")), ["W1-1:played", "L1-1:now", "L2-1:ahead"]);
  assert.deepEqual(steps(B.path(d, "p1")), ["W1-1:played", "W2-1:now", "F:ahead"]);
  win(d, "L1-1", "p3");
  assert.deepEqual(steps(B.path(d, "p4")), ["W1-1:played", "L1-1:played"]);        // out
  const s = chalk(tour(4));
  assert.deepEqual(steps(B.path(s, "p1")), ["W1-1:played", "W2-1:played"]);        // won
  assert.deepEqual(steps(B.path(s, "p2")), ["W1-2:played", "W2-1:played"]);        // lost the final
  // The decider: the losers' side winner takes the final, so both play on.
  const r = tour(4, { format: "double", final: "reset" });
  win(r, "W1-1", "p1"); win(r, "W1-2", "p2"); win(r, "W2-1", "p1"); win(r, "L1-1", "p3"); win(r, "L2-1", "p3"); win(r, "F", "p3");
  assert.deepEqual(steps(B.path(r, "p1")), ["W1-1:played", "W2-1:played", "F:played", "F2:now"]);
  assert.deepEqual(steps(B.path(r, "p3")).slice(-2), ["F:played", "F2:now"]);
});

test("property: every player's path ends where standings says, at every size", () => {
  for (const format of ["single", "double"]) for (let n = 3; n <= 32; n++){
    const r = rng(n * 7 + (format === "double" ? 1 : 0)), t = tour(n, { format });
    for (;;){
      const ready = B.state(t).find(x => x.status === "ready");
      if (!ready) break;
      win(t, ready.key, r() < 0.5 ? ready.a : ready.b);
    }
    const places = B.standings(t);
    for (const id of t.seeds){
      const p = B.path(t, id), last = p[p.length - 1];
      assert.ok(p.length && p.every(x => x.step === "played"), `${format} ${n} ${id}: all played`);
      assert.ok(last.winner === id ? places.find(s => s.id === id).place === 1 || B.next(t, last.key).winner == null
        : B.next(t, last.key).loser == null, `${format} ${n} ${id}: the path stops where they went out`);
    }
  }
});

// ---- round robin (2.32.0) ----
const robinTour = (n, opts = {}) => tour(n, { format: "robin", ...opts });

test("robin: everyone plays everyone once, nobody twice in a round", () => {
  for (let n = 3; n <= B.ROBIN_MAX; n++){
    const st = B.state(robinTour(n));
    assert.equal(st.length, n * (n - 1) / 2, `${n}: matches`);
    const pairs = new Set(st.map(f => [f.a, f.b].sort().join("|")));
    assert.equal(pairs.size, st.length, `${n}: each pair once`);
    const rounds = new Set(st.map(f => f.round));
    assert.equal(rounds.size, n % 2 ? n : n - 1, `${n}: rounds`);
    for (const r of rounds){
      const ids = st.filter(f => f.round === r).flatMap(f => [f.a, f.b]);
      assert.equal(new Set(ids).size, ids.length, `${n} round ${r}: nobody twice`);
      assert.equal(ids.length, n % 2 ? n - 1 : n, `${n} round ${r}: everyone but one plays when odd`);
    }
    assert.ok(st.every(f => f.status === "ready" && f.side === "R" && /^R\d+-\d+$/.test(f.key)));
    if (n % 2) assert.equal(Object.keys(B.sitsOut(n)).length, n);
    else assert.deepEqual(B.sitsOut(n), {});
  }
  assert.throws(() => B.build({ format: "robin", n: 13 }), RangeError);
});

test("robin: sits out each round, once each when odd", () => {
  const out = Object.values(B.sitsOut(5));
  assert.deepEqual(out.slice().sort(), [1, 2, 3, 4, 5]);
});

test("robin: the table by wins, then rack difference, then the match between two", () => {
  const t = robinTour(4);
  const res = (a, b, wa, wb) => { const f = B.state(t).find(x => [x.a, x.b].sort().join() === [a, b].sort().join());
    const flip = f.a !== a; t.results[f.key] = { ids: [f.a, f.b], a: flip ? wb : wa, b: flip ? wa : wb, w: (flip ? wb : wa) === 3 ? "a" : "b", by: "u", at: 1 }; };
  // p1 beats everyone; p2 and p3 both 1 win, level on racks, p2 beat p3; p4 nothing.
  res("p1", "p2", 3, 1); res("p1", "p3", 3, 1); res("p1", "p4", 3, 1);
  res("p2", "p3", 3, 2); res("p3", "p4", 3, 0); res("p2", "p4", 2, 3);
  // p2: won 1 (v p3), lost 2 (v p1, v p4) → racks 1+3+2 = 6 for, 3+2+3 = 8 against: −2
  // p3: won 1 (v p4), lost 2 → 1+2+3 = 6 for, 3+3+0 = 6 against: 0
  // p4: won 1 (v p2), lost 2 → 1+0+3 = 4 for, 3+3+2 = 8 against: −4
  assert.ok(B.finished(t));
  const s = B.standings(t);
  assert.deepEqual(s.map(x => [x.id, x.place, x.won]), [["p1", 1, 3], ["p3", 2, 1], ["p2", 3, 1], ["p4", 4, 1]]);
  assert.deepEqual(s.map(x => x.rf - x.ra), [6, 0, -2, -4]);
});

test("robin: two level on wins and racks are split by their match; three share", () => {
  const t = robinTour(3);
  const st = B.state(t);
  // A cycle: each wins one 3–1. All level: they share 1st–3rd.
  const beat = (w, l) => { const f = st.find(x => [x.a, x.b].includes(w) && [x.a, x.b].includes(l));
    t.results[f.key] = { ids: [f.a, f.b], a: f.a === w ? 3 : 1, b: f.a === w ? 1 : 3, w: f.a === w ? "a" : "b", by: "u", at: 1 }; };
  beat("p1", "p2"); beat("p2", "p3"); beat("p3", "p1");
  assert.deepEqual(B.standings(t).map(x => [x.place, x.placeTo]), [[1, 3], [1, 3], [1, 3]]);
  // Two level: p1 and p2 each 1–0 so far, same racks, but they haven't met: shared.
  const u = robinTour(4), su = B.state(u);
  const win = (w, l) => { const f = su.find(x => [x.a, x.b].includes(w) && [x.a, x.b].includes(l));
    u.results[f.key] = { ids: [f.a, f.b], a: f.a === w ? 3 : 0, b: f.a === w ? 0 : 3, w: f.a === w ? "a" : "b", by: "u", at: 1 }; };
  win("p1", "p3"); win("p2", "p4");
  const top = B.standings(u).slice(0, 2);
  assert.deepEqual(top.map(x => [x.place, x.placeTo]), [[1, 2], [1, 2]]);
  win("p1", "p2");
  assert.deepEqual(B.standings(u)[0].id, "p1");
});

test("robin: a walkover is a win with no racks; next leads nowhere; anything can be cleared", () => {
  const t = robinTour(4), f = B.state(t)[0];
  t.results[f.key] = { ids: [f.a, f.b], a: 0, b: 0, w: "a", wo: true, by: "u", at: 1 };
  const row = B.standings(t).find(x => x.id === f.a);
  assert.deepEqual([row.won, row.rf, row.ra], [1, 0, 0]);
  assert.deepEqual(B.next(t, f.key), { winner: null, loser: null, out: null, top: null, decider: null });
  const g = B.state(t)[1];
  t.results[g.key] = { ids: [g.a, g.b], a: 3, b: 0, w: "a", by: "u", at: 2 };
  assert.ok(B.canClear(t, f.key) && B.canClear(t, g.key));
});

test("robin: a path is played, then now, then the next", () => {
  const t = robinTour(4);
  const mine = B.state(t).filter(f => f.a === "p1" || f.b === "p1");
  const f = mine[0];
  t.results[f.key] = { ids: [f.a, f.b], a: 3, b: 1, w: "a", by: "u", at: 1 };
  assert.deepEqual(B.path(t, "p1").map(x => x.key + ":" + x.step), [mine[0].key + ":played", mine[1].key + ":now", mine[2].key + ":ahead"]);
  assert.equal(B.path(t, "p1").length, 3);
});

// ---- groups into a knockout (2.33.0) ----
const groupsTour = (n, opts = {}) => tour(n, { format: "groups", ...opts });
// Plays every ready match, the earlier in the draw always winning, until none is ready.
function chalkAll(t){
  for (;;){
    const ready = B.state(t).find(x => x.status === "ready");
    if (!ready) return t;
    const n = id => +id.slice(1);
    win(t, ready.key, n(ready.a) < n(ready.b) ? ready.a : ready.b);
  }
}

test("groups: how many, their sizes, and a round robin each", () => {
  for (let n = 6; n <= 32; n++){
    const G = B.groupCount(n), t = groupsTour(n), gs = B.groups(t);
    assert.equal(gs.length, G, `${n}: groups`);
    const sizes = gs.map(g => g.ids.length);
    assert.ok(sizes.every(x => x >= 3 && x <= 6) && Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}: sizes ${sizes}`);
    assert.deepEqual(gs.flatMap(g => g.ids).sort(), t.seeds.slice().sort(), `${n}: everyone in one group`);
    const st = B.state(t), inGroups = st.filter(f => f.side === "G");
    assert.equal(inGroups.length, sizes.reduce((s, k) => s + k * (k - 1) / 2, 0), `${n}: group matches`);
    assert.ok(inGroups.every(f => f.status === "ready" && gs.find(g => g.group === f.group).ids.includes(f.a)));
    const ko = st.filter(f => f.side !== "G");
    assert.equal(ko.filter(f => f.round === 1).length, G, `${n}: a knockout of ${2 * G}`);
    assert.ok(ko.every(f => f.status === "waiting"), `${n}: the knockout waits for the groups`);
  }
  assert.throws(() => B.groupCount(5), RangeError);
  assert.throws(() => B.groupCount(33), RangeError);
});

test("groups: the snake spreads the top of the draw", () => {
  const gs = B.groups(groupsTour(8));
  assert.deepEqual(gs.map(g => g.ids), [["p1", "p4", "p5", "p8"], ["p2", "p3", "p6", "p7"]]);
});

test("groups: winners meet other groups' runners-up, a group's two in opposite halves", () => {
  for (const n of [8, 16, 32]){
    const t = chalkAll(groupsTour(n));
    const gs = B.groups(t), G = gs.length;
    const r1 = B.state(t).filter(f => f.side === "W" && f.round === 1);
    const groupOf = id => gs.find(g => g.ids.includes(id)).group;
    for (const f of r1) assert.notEqual(groupOf(f.a), groupOf(f.b), `${n}: ${f.key} is two groups`);
    // Halves: the first G/2 first-round matches feed one semi-final side, the rest the other.
    const top = new Set(r1.slice(0, G / 2).flatMap(f => [f.a, f.b]).map(groupOf).map(String));
    for (const g of gs){
      const [w, r] = g.rows.filter(x => x.through).map(x => x.id);
      const half = id => r1.slice(0, G / 2).some(f => f.a === id || f.b === id);
      assert.notEqual(half(w), half(r), `${n}: group ${g.group}'s two are in opposite halves`);
    }
    assert.ok(top.size >= 1);
  }
});

test("groups: qualifiers wait for their group; a tie goes to the draw; the knockout's final takes race.f", () => {
  const t = groupsTour(6, { race: { w: 3, f: 5 } });             // A: p1 p4 p5   B: p2 p3 p6
  const gA = () => B.groups(t)[0];
  const sA = B.state(t).filter(f => f.group === "A");
  const beat = (w, l) => { const f = sA.find(x => [x.a, x.b].includes(w) && [x.a, x.b].includes(l));
    t.results[f.key] = { ids: [f.a, f.b], a: f.a === w ? 3 : 1, b: f.a === w ? 1 : 3, w: f.a === w ? "a" : "b", by: "u", at: 1 }; };
  beat("p1", "p4"); beat("p4", "p5");
  assert.equal(B.state(t).find(f => f.key === "K1-1").a, null, "not through until the group is done");
  beat("p5", "p1");                                              // a cycle: all level, 1–1, +0
  assert.ok(gA().finished);
  assert.deepEqual(gA().rows.map(r => [r.id, r.place, r.placeTo, !!r.through]), [["p1", 1, 3, true], ["p4", 1, 3, true], ["p5", 1, 3, false]]);
  assert.equal(B.state(t).find(f => f.key === "K1-1").a, "p1", "group A's winner, by the draw");
  assert.equal(B.state(t).find(f => f.key === "K1-2").b, "p4", "group A's runner-up meets group B's winner");
  const fin = B.state(t).find(f => f.name === "Final");
  assert.equal(fin.race, 5);
  assert.equal(B.state({ ...tour(4), race: { w: 3, f: 5 } }).find(f => f.name === "Final").race, 5, "single elimination's final too (2.33.1)");
});

test("single elimination: the final takes race.f; a final entered at race.w before 2.33.1 still counts", () => {
  const t = tour(4, { race: { w: 3, f: 5 } });
  const semis = B.state(t).filter(f => f.name === "Semi-finals");
  for (const f of semis) t.results[f.key] = { ids: [f.a, f.b], a: 3, b: 1, w: "a", by: "u", at: 1 };
  const fin = B.state(t).find(f => f.name === "Final");
  assert.equal(fin.race, 5);
  assert.equal(B.state(t).find(f => f.name === "Semi-finals").race, 3, "earlier rounds keep race.w");
  const old = { ids: [fin.a, fin.b], a: 3, b: 2, w: "a", by: "u", at: 2 };
  assert.equal(B.validResult(t, fin.key, old), false, "a new entry plays to the Final's race");
  assert.equal(B.validResult(t, fin.key, { ...old, a: 5 }), true);
  t.results[fin.key] = old;                                      // as stored by 2.33.0 or earlier
  assert.equal(B.state(t).find(f => f.name === "Final").status, "done");
  assert.ok(B.finished(t));
  assert.equal(B.state(t).find(f => f.name === "Final").was, undefined, "was stays internal");
  t.results[fin.key] = { ...old, a: 4 };                        // fits neither race
  assert.equal(B.state(t).find(f => f.name === "Final").status, "ready");
  // The groups knockout's final never played to race.w, so it gets no such allowance.
  const g = groupsTour(6, { race: { w: 3, f: 5 } });
  chalkAll(g);
  const kf = B.state(g).find(f => f.name === "Final");
  g.results[kf.key] = { ids: [kf.a, kf.b], a: 3, b: 0, w: "a", by: "u", at: 9 };
  assert.equal(B.state(g).find(f => f.name === "Final").status, "ready");
});

test("groups: a group's result can't change once the knockout it feeds has a result", () => {
  const t = groupsTour(6);
  chalkAll(t);
  const gKey = B.state(t).find(f => f.group === "A").key;
  assert.equal(B.canClear(t, gKey), false);
  const u = groupsTour(6);
  for (const f of B.state(u).filter(x => x.side === "G")) win(u, f.key, +f.a.slice(1) < +f.b.slice(1) ? f.a : f.b);
  assert.equal(B.canClear(u, B.state(u).find(f => f.group === "A").key), true, "nothing played in the knockout yet");
  assert.deepEqual(B.next(u, gKey), { winner: null, loser: null, out: null, top: null, decider: null });
});

test("groups: a path is the group's matches, then the knockout once through", () => {
  const t = groupsTour(6);
  const steps = id => B.path(t, id).map(x => x.step + ":" + (x.side === "G" ? "G" : x.key));
  assert.deepEqual(steps("p1"), ["now:G", "ahead:G"]);
  for (const f of B.state(t).filter(x => x.side === "G")) win(t, f.key, +f.a.slice(1) < +f.b.slice(1) ? f.a : f.b);
  assert.deepEqual(steps("p1"), ["played:G", "played:G", "now:K1-1", "ahead:K2-1"]);
  assert.deepEqual(steps("p5"), ["played:G", "played:G"], "out in the groups");
});

test("property: groups at every size 6–32, random results, everyone placed once", () => {
  for (let n = 6; n <= 32; n++){
    const r = rng(n * 13), t = groupsTour(n, { third: n % 2 === 0 });
    for (;;){
      const ready = B.state(t).find(x => x.status === "ready");
      if (!ready) break;
      win(t, ready.key, r() < 0.5 ? ready.a : ready.b);
    }
    assert.ok(B.finished(t), `${n}: finished`);
    const s = B.standings(t);
    assert.ok(s.every(x => x.place != null), `${n}: everyone placed`);
    const counts = new Map();
    for (const x of s) for (let p = x.place; p <= x.placeTo; p++) counts.set(p, (counts.get(p) || 0) + 1);
    // Each place from 1 to n is held, and a shared range by exactly as many as it spans.
    const spans = new Map();
    for (const x of s) spans.set(x.place + "-" + x.placeTo, (spans.get(x.place + "-" + x.placeTo) || 0) + 1);
    for (const [k, c] of spans){ const [a, b] = k.split("-").map(Number); assert.equal(c, b - a + 1, `${n}: ${k} held by ${c}`); }
    assert.equal(Math.max(...s.map(x => x.placeTo)), n, `${n}: places run to ${n}`);
    assert.equal(s.filter(x => x.place === 1).length, 1);
  }
});

// ---- handicapped races (TOURNAMENT.md §3.11, Session 8) ----

test("handicap: each side's target from the ratings frozen at Start", () => {
  const z = { p1: 650, p2: 500, p3: 500, p4: 450 };          // W1-1 is p1 v p4, W1-2 p2 v p3
  const t = tour(4, { handicap: "racks", zargos: z });
  assert.deepEqual(fx(t, "W1-1").targets, { a: 3, b: 1 }, "the favourite races to the set race");
  assert.deepEqual(fx(t, "W1-2").targets, { a: 3, b: 3 }, "equal ratings play level");
  assert.equal(fx(t, "W2-1").targets, null, "a match still waiting has no targets");
  assert.equal(fx(t, "W1-1").race, 3, "race stays the set race");
  const swapped = tour(4, { handicap: "racks", zargos: { ...z, p1: 450, p4: 650 } });
  assert.deepEqual(fx(swapped, "W1-1").targets, { a: 1, b: 3 }, "a favourite as b");
  const missing = tour(4, { handicap: "racks", zargos: { p1: 650, p4: 450, p3: 600 } });
  assert.deepEqual(fx(missing, "W1-2").targets, { a: 2, b: 3 }, "no rating counts as 500 (500 v 600)");
  assert.deepEqual(fx(tour(4, { zargos: z }), "W1-1").targets, { a: 3, b: 3 }, "off: both race to the race");
  const big = tour(4, { handicap: "racks", zargos: z, race: { w: 5 } });
  assert.deepEqual(fx(big, "W1-1").targets, { a: 5, b: 2 });
  assert.deepEqual(B.targetsFor(big, 5, "p4", "p1"), { a: 2, b: 5 });
});

test("handicap: a result fits the two targets, not the plain race", () => {
  const t = tour(4, { handicap: "racks", zargos: { p1: 650, p4: 450 } });
  const r = (a, b, w) => ({ ids: ["p1", "p4"], a, b, w });
  assert.ok(B.validResult(t, "W1-1", r(3, 0, "a")));
  assert.ok(B.validResult(t, "W1-1", r(2, 1, "b")), "the underdog wins at their own target");
  assert.ok(!B.validResult(t, "W1-1", r(3, 1, "a")), "both at their target");
  assert.ok(!B.validResult(t, "W1-1", r(1, 3, "b")), "past the underdog's target");
  assert.ok(!B.validResult(t, "W1-1", r(2, 1, "a")), "w must be the side at its target");
  const off = tour(4, { zargos: { p1: 650, p4: 450 } });
  assert.ok(!B.validResult(off, "W1-1", r(2, 1, "b")), "off, 2–1 reaches no race");
  assert.ok(B.validResult(off, "W1-1", r(3, 1, "a")));
  t.results["W1-1"] = r(2, 1, "b");
  assert.equal(fx(t, "W1-1").status, "done");
  assert.equal(fx(t, "W2-1").a, "p4");
});

test("handicap: the 2.33.1 final allowance applies only with the handicap off", () => {
  const t = tour(4, { race: { w: 3, f: 5 }, handicap: "racks", zargos: {} });
  for (const f of B.state(t).filter(f => f.name === "Semi-finals")) t.results[f.key] = { ids: [f.a, f.b], a: 3, b: 1, w: "a", by: "u", at: 1 };
  const fin = fx(t, "W2-1");
  assert.deepEqual(fin.targets, { a: 5, b: 5 });
  t.results["W2-1"] = { ids: [fin.a, fin.b], a: 3, b: 2, w: "a", by: "u", at: 2 };
  assert.equal(fx(t, "W2-1").status, "ready", "a handicapped final at race.w doesn't count");
});

test("property: handicapped, every format and size, random ratings, played to the end", () => {
  const variants = [];
  for (let n = 3; n <= 32; n++){
    variants.push({ n, format: "single", third: n % 2 === 0 }, { n, format: "double", final: n % 2 ? "reset" : "one" });
    if (n <= B.ROBIN_MAX) variants.push({ n, format: "robin" });
    if (n >= 6) variants.push({ n, format: "groups", third: n % 3 === 0 });
  }
  for (const v of variants){
    const r = rng(v.n * 31 + v.format.length * 7 + (v.third ? 1 : 0));
    const players = ids(v.n), zargos = {};
    for (const p of players) if (r() < 0.9) zargos[p] = 300 + Math.round(r() * 500);
    const race = { w: 1 + Math.floor(r() * 7), l: r() < 0.5 ? 2 : undefined, f: r() < 0.5 ? 5 : undefined };
    const t = { format: v.format, final: v.final || "one", third: !!v.third, race, players,
      seeds: B.draw(players, { rand: r }), results: {}, handicap: "racks", zargos };
    const tag = `handicap ${JSON.stringify(v)}`;
    play(t, r);
    assert.ok(B.finished(t), tag);
    assert.deepEqual(B.ignored(t), [], tag);
    for (const x of B.state(t).filter(x => x.status === "done" || x.status === "ready")){
      const { a, b } = x.targets;
      assert.equal(Math.max(a, b), x.race, `${tag} ${x.key} the favourite races to the race`);
      assert.ok(Math.min(a, b) >= 1, `${tag} ${x.key}`);
      const za = zargos[x.a] ?? 500, zb = zargos[x.b] ?? 500;
      if (za > zb) assert.equal(a, x.race, `${tag} ${x.key} a is the favourite`);
      if (zb > za) assert.equal(b, x.race, `${tag} ${x.key} b is the favourite`);
    }
    assert.equal(B.standings(t).length, v.n, tag);
  }
});
