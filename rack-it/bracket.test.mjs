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
  const r = { ids: [x.a, x.b], w, a: w === "a" ? x.race : score, b: w === "b" ? x.race : score, by: "u", at: 1 };
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
    const loserRacks = Math.floor(r() * x.race);
    const res = r() < 0.1
      ? { ids: [x.a, x.b], w, wo: true, a: 0, b: 0 }
      : { ids: [x.a, x.b], w, a: w === "a" ? x.race : loserRacks, b: w === "b" ? x.race : loserRacks };
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
