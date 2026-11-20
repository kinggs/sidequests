// rack-it/bracket.js — tournament brackets, pure: no DOM, no cloud, no app state.
//
//   import * as B from "./bracket.js";
//   B.build({ format, n, final, third })    // the fixtures for n entrants: [{ key, side, round, slot, name, from, when? }]
//   B.state(t)                              // those fixtures with players: [{ …, race, targets, a, b, empty, result, status, winner, loser }]
//   B.standings(t)                          // [{ id, place, placeTo }]; place null while still in
//   B.finished(t)                           // every match played (or a bye)
//   B.canClear(t, key)                      // false while a fixture fed by it has a result
//   B.validResult(t, key, result)           // fits that fixture: its pair, the race reached by exactly one side, or a walkover
//   B.ignored(t)                            // keys whose stored result doesn't fit and is being ignored
//   B.draw(ids, { seeding, ratings, rand }) // → seeds
//   B.raceFor(t, fixture)                   // racks needed in that fixture (the favourite's, when handicapped)
//   B.targetsFor(t, race, a, b)             // each side's own target: { a, b }; the race chart when t.handicap is "racks"
//   B.next(t, key)                          // where its players go: { winner, loser, out, top, decider }
//   B.ROBIN_MAX                             // the most players a round robin takes (12)
//   B.groupCount(n), B.groups(t)            // groups into a knockout: how many groups; each group's table
//   B.path(t, id)                           // one player's matches in order: played, now, one ahead
//
// `t` is a tournament document (rack-it/TOURNAMENT.md §5): format, final, third, race, players,
// seeds and results. The bracket is DERIVED, never stored: who plays in every later fixture comes
// from the draw and the results, the same way on every phone. A stored result that doesn't fit the
// derived fixture is ignored, not trusted; that is the safety net behind the rules, which can't
// work the bracket out. bracket.test.mjs proves it with `node --test` from the repo root.
//
// Written to be lifted into the Sessions app (SESSIONS-MIGRATION.md): nothing here knows about pool,
// except the race chart a handicapped tournament borrows from zargo.js (TOURNAMENT.md §3.11).

import { raceChart, expectedShareA } from "./zargo.js";

const PENDING = Symbol("pending");   // not known yet: an earlier fixture is still to be played
const EMPTY = null;                  // nobody, ever: a bye's missing player, or what a bye leaves behind

// Seed numbers by bracket position, so 1 meets 2 only in the final and the byes (seeds above n)
// fall against 1, 2, 3… in order: 4 → [1,4,2,3], 8 → [1,8,4,5,2,7,3,6].
export function positions(size){
  let p = [1];
  while (p.length < size){ const m = p.length * 2; p = p.flatMap(s => [s, m + 1 - s]); }
  return p;
}

// The order the winners' side round r's losers drop in, so a rematch comes as late as possible:
// reversed, then halves swapped, then as they are, repeating. The first drop reversed is what keeps
// a losers' side survivor from meeting, at once, the player who just beat them.
function dropOrder(m, r){
  let idx = Array.from({ length: m }, (_, i) => i + 1);
  const v = (r - 2) % 4;
  if (v === 0 || v === 3) idx.reverse();
  if ((v === 1 || v === 3) && m >= 2) idx = idx.slice(m / 2).concat(idx.slice(0, m / 2));
  return idx;
}

function singleName(round, k){
  const fromEnd = k - round;
  return fromEnd === 0 ? "Final" : fromEnd === 1 ? "Semi-finals" : fromEnd === 2 ? "Quarter-finals" : `Round ${round}`;
}

// Round robin (2.32.0, TOURNAMENT.md §3.9): everyone plays everyone once. The circle method
// fixes the schedule from the draw: the first in the draw stays put and the rest turn one place
// a round, so nobody plays twice in a round. An odd number gets an empty seat, so one player
// sits out each round; there are no bye fixtures. Keys R<round>-<slot>, side "R".
export const ROBIN_MAX = 12;
function robin(n){
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  if (n % 2) seats.push(null);
  const m = seats.length, fx = [];
  for (let r = 1; r < m; r++){
    let slot = 0;
    for (let i = 0; i < m / 2; i++){
      const a = seats[i], b = seats[m - 1 - i];
      if (a === null || b === null) continue;
      slot++;
      fx.push({ key: `R${r}-${slot}`, side: "R", round: r, slot, name: `Round ${r}`, from: [{ seed: Math.min(a, b) }, { seed: Math.max(a, b) }] });
    }
    seats.splice(1, 0, seats.pop());
  }
  return fx;
}
// Who sits out each round of an odd round robin: { round: seed }. Empty for an even number.
export function sitsOut(n){
  const out = {};
  if (n % 2 === 0) return out;
  const fx = robin(n);
  for (let r = 1; r <= n; r++){
    const playing = new Set(fx.filter(f => f.round === r).flatMap(f => f.from.map(x => x.seed)));
    out[r] = Array.from({ length: n }, (_, i) => i + 1).find(x => !playing.has(x));
  }
  return out;
}

// Groups into a knockout (2.33.0, TOURNAMENT.md §3.10): 6 to 32 players in 2, 4 or 8 groups of
// 3 to 6, each a round robin; the top two of each go into a single elimination knockout. The
// draw fills the groups in a snake (A B C D D C B A …), so the top of the draw is spread out.
// Keys G<group><round>-<slot> for the groups (side "G"), K<round>-<slot> and T for the knockout.
// The knockout's first round puts each group's winner against another group's runner-up, and a
// group's two in opposite halves, so they can meet only in the final.
export const GROUPS_MIN = 6, GROUPS_MAX = 32;
const LETTERS = "ABCDEFGH";
export function groupCount(n){
  if (!Number.isInteger(n) || n < GROUPS_MIN || n > GROUPS_MAX) throw new RangeError(`groups take ${GROUPS_MIN} to ${GROUPS_MAX} players, not ${n}`);
  return n <= 12 ? 2 : n <= 24 ? 4 : 8;
}
// The draw places (1-based) in each group: { A: [1, 4, 5], B: [2, 3, 6] }.
function groupSeeds(n){
  const G = groupCount(n), out = {};
  for (let g = 0; g < G; g++) out[LETTERS[g]] = [];
  for (let i = 0; i < n; i++){
    const row = Math.floor(i / G), col = i % G;
    out[LETTERS[row % 2 ? G - 1 - col : col]].push(i + 1);
  }
  return out;
}
function groupsBuild(n, third){
  const gs = groupSeeds(n), G = Object.keys(gs).length, fx = [];
  for (const [L, seedsOf] of Object.entries(gs))
    for (const f of robin(seedsOf.length))
      fx.push({ key: `G${L}${f.round}-${f.slot}`, side: "G", group: L, round: f.round, slot: f.slot,
        name: `Group ${L} · Round ${f.round}`, from: f.from.map(src => ({ seed: seedsOf[src.seed - 1] })) });
  // Knockout place s: winners 1…G, group A's first. Each group is paired with one whose winner
  // sits in the other half of the knockout; a group's runner-up takes the place that meets its
  // partner's winner. So no first-round match is one group's two, and they're in opposite halves.
  const pos = positions(2 * G), half = (from, to) => pos.slice(from, to).filter(x => x <= G).sort((x, y) => x - y);
  const top = half(0, G), bottom = half(G, 2 * G), partner = new Map();
  top.forEach((w, i) => { partner.set(w, bottom[i]); partner.set(bottom[i], w); });
  const qual = s => s <= G ? { qual: { group: LETTERS[s - 1], place: 1 } }
    : { qual: { group: LETTERS[partner.get(2 * G + 1 - s) - 1], place: 2 } };
  const ren = k => k.replace(/^W/, "K");
  for (const f of build({ format: "single", n: 2 * G, third }))
    fx.push({ ...f, key: ren(f.key), from: f.from.map(src => "seed" in src ? qual(src.seed) : src.winner ? { winner: ren(src.winner) } : { loser: ren(src.loser) }) });
  return fx;
}

export function build({ format = "single", n, final = "one", third = false } = {}){
  if (format === "groups") return groupsBuild(n, third);
  if (format === "robin"){
    if (!Number.isInteger(n) || n < 2 || n > ROBIN_MAX) throw new RangeError(`a round robin takes 2 to ${ROBIN_MAX} players, not ${n}`);
    return robin(n);
  }
  if (!Number.isInteger(n) || n < 2 || n > 64) throw new RangeError(`a bracket needs 2 to 64 players, not ${n}`);
  if (format !== "single" && format !== "double") throw new RangeError(`unknown format ${format}`);
  const double = format === "double";
  const k = Math.max(double ? 2 : 1, Math.ceil(Math.log2(n)));
  const size = 2 ** k;
  const order = positions(size);
  const fx = [];
  const add = (key, side, round, slot, name, from, extra) => fx.push({ key, side, round, slot, name, from, ...extra });
  const W = (r, s) => `W${r}-${s}`, L = (r, s) => `L${r}-${s}`;
  const wName = r => double ? (r === k ? "Winners' side final" : `Round ${r}`) : singleName(r, k);

  for (let s = 1; s <= size / 2; s++)
    add(W(1, s), "W", 1, s, wName(1), [{ seed: order[2 * s - 2] }, { seed: order[2 * s - 1] }]);
  for (let r = 2; r <= k; r++)
    for (let s = 1; s <= size / 2 ** r; s++)
      add(W(r, s), "W", r, s, wName(r), [{ winner: W(r - 1, 2 * s - 1) }, { winner: W(r - 1, 2 * s) }]);

  if (!double){
    if (third && k >= 2) add("T", "F", k, 1, "Third place", [{ loser: W(k - 1, 1) }, { loser: W(k - 1, 2) }]);
    return fx;
  }

  // The losers' side: 2(k-1) rounds. Round 1 is the winners' side round 1 losers playing each other;
  // then rounds alternate: survivors against the newest drops (even), survivors against each other (odd).
  const last = 2 * k - 2;
  const lName = r => r === last ? "Losers' side final" : `Round ${r}`;
  for (let s = 1; s <= size / 4; s++)
    add(L(1, s), "L", 1, s, lName(1), [{ loser: W(1, 2 * s - 1) }, { loser: W(1, 2 * s) }]);
  for (let r = 2; r <= k; r++){
    const m = size / 2 ** r, drop = dropOrder(m, r), lr = 2 * r - 2;
    for (let s = 1; s <= m; s++)
      add(L(lr, s), "L", lr, s, lName(lr), [{ winner: L(lr - 1, s) }, { loser: W(r, drop[s - 1]) }]);
    if (r < k)
      for (let s = 1; s <= m / 2; s++)
        add(L(lr + 1, s), "L", lr + 1, s, lName(lr + 1), [{ winner: L(lr, 2 * s - 1) }, { winner: L(lr, 2 * s) }]);
  }
  const fFrom = [{ winner: W(k, 1) }, { winner: L(last, 1) }];
  add("F", "F", 1, 1, "Final", fFrom);
  // The decider exists only if the losers' side winner (b) takes the final.
  if (final === "reset") add("F2", "F", 2, 1, "Decider", fFrom, { when: { key: "F", w: "b" } });
  return fx;
}

export function raceFor(t, f){
  const r = (t && t.race) || {};
  const w = r.w || 3;
  if (f.key === "F" || f.key === "F2" || f.key === "T") return r.f || w;
  // The last match of an elimination: single elimination's W<k>-1, the groups knockout's K<k>-1.
  // (Before 2.33.1 single elimination's final ignored r.f; oldRace keeps those results.)
  if (f.name === "Final") return r.f || w;
  if (f.side === "L") return r.l || w;
  return w;
}

// Each side's own target in a match between a and b to `race` (TOURNAMENT.md §3.11). Off, both
// race to it. Handicapped, Rack It's race chart from the ratings frozen at Start (t.zargos, 500
// for anyone without one): the favourite races to `race`, the other to the chart's target.
export const NO_RATING = 500;
export function targetsFor(t, race, a, b){
  if (!t || t.handicap !== "racks") return { a: race, b: race };
  const z = id => { const v = t.zargos && t.zargos[id]; return Number.isFinite(v) ? v : NO_RATING; };
  return raceChart(expectedShareA(z(a), z(b)), race);
}

// The race a single elimination final was played to before 2.33.1 (r.w), when it differs from
// today's: a result entered then still counts. Undefined for every other fixture, and with the
// handicap on (no handicapped tournament predates 2.33.1).
function oldRace(t, f){
  const r = (t && t.race) || {};
  if (t && t.handicap === "racks") return;
  if (f.key[0] === "W" && f.name === "Final" && r.f && r.f !== (r.w || 3)) return r.w || 3;
}

// Does a stored result fit a fixture whose derived players are a and b, racing to ta and tb?
// (Level, ta = tb = the race: the check every result before Session 8 was made against.)
function fits(r, a, b, ta, tb){
  if (!r || !Array.isArray(r.ids) || r.ids[0] !== a || r.ids[1] !== b) return false;
  if (r.w !== "a" && r.w !== "b") return false;
  if (r.wo) return (r.a || 0) === 0 && (r.b || 0) === 0;
  const ok = (x, top) => Number.isInteger(x) && x >= 0 && x <= top;
  if (!ok(r.a, ta) || !ok(r.b, tb)) return false;
  if ((r.a === ta) === (r.b === tb)) return false;         // nobody at their target, or both
  return (r.a === ta ? "a" : "b") === r.w;
}

// A stored result against a derived match: its targets, or 2.33.1's old final race.
const fitsHere = (x, r, a, b) => fits(r, a, b, x.targets.a, x.targets.b) || (!!x.was && fits(r, a, b, x.was, x.was));

function entrants(t){ return (t && (t.seeds || t.players)) || []; }

// Works out every fixture. `all` keeps the internal view (skipped fixtures, real or not) for
// standings and canClear; `list` is what state() hands out.
function derive(t){
  const seeds = t.seeds || null;
  const n = entrants(t).length;
  const results = t.results || {};
  const fixtures = build({ format: t.format, n, final: t.final, third: t.third });
  const byKey = new Map(), all = [], list = [], ignoredKeys = [];
  const gseeds = t.format === "groups" ? groupSeeds(n) : null;
  // A group's qualifier: known once every match in the group is played; its table in strict
  // order (a tie the table can't split goes to whoever is higher in the draw).
  const qualified = ({ group, place }) => {
    if (!seeds) return PENDING;
    const games = all.filter(x => x.group === group);
    if (games.some(x => x.status !== "done")) return PENDING;
    const row = rank(gseeds[group].map(s => seeds[s - 1]), games, seeds)[place - 1];
    return row ? row.id : EMPTY;
  };
  const resolve = src => {
    if ("qual" in src) return qualified(src.qual);
    if ("seed" in src) return src.seed > n ? EMPTY : seeds ? seeds[src.seed - 1] : PENDING;
    const g = byKey.get(src.winner || src.loser);
    return src.winner ? g._w : g._l;
  };
  const show = v => (v === EMPTY || v === PENDING) ? null : v;
  for (const f of fixtures){
    const x = { ...f, race: raceFor(t, f), was: oldRace(t, f), targets: null, _w: EMPTY, _l: EMPTY, real: false, absent: false };
    byKey.set(f.key, x); all.push(x);
    const r = results[f.key];
    if (f.when){
      const g = byKey.get(f.when.key);
      if (!(g.status === "done" && g.result.w === f.when.w)){
        x.absent = true;
        if (r) ignoredKeys.push(f.key);
        continue;
      }
    }
    const [a, b] = f.from.map(resolve);
    if (a !== EMPTY && b !== EMPTY && a !== PENDING && b !== PENDING) x.targets = targetsFor(t, x.race, a, b);
    x.a = show(a); x.b = show(b); x.result = null; x.winner = null; x.loser = null;
    x.real = a !== EMPTY && b !== EMPTY;
    x.empty = [a === EMPTY, b === EMPTY];        // nobody will ever come from that side (a bye's hole)
    if (a === EMPTY && b === EMPTY){
      x.status = "skip";
    } else if (a === EMPTY || b === EMPTY){
      const other = a === EMPTY ? b : a;
      if (other === PENDING){ x.status = "waiting"; x._w = PENDING; }
      else { x.status = "bye"; x._w = other; x.winner = other; }
      // _l stays EMPTY: whatever happens, a bye leaves nobody to drop.
    } else if (a === PENDING || b === PENDING){
      x.status = "waiting"; x._w = PENDING; x._l = PENDING;
    } else if (r && fitsHere(x, r, a, b)){
      x.status = "done"; x.result = r;
      x._w = x.winner = r.w === "a" ? a : b;
      x._l = x.loser = r.w === "a" ? b : a;
    } else {
      x.status = "ready"; x._w = PENDING; x._l = PENDING;
    }
    if (r && x.status !== "done"){ x.ignored = r; ignoredKeys.push(f.key); }
    if (x.status !== "skip") list.push(x);
  }
  return { all, list, byKey, ignoredKeys, n, fixtures, gseeds };
}

const tidy = x => {
  const { _w, _l, real, absent, was, ...out } = x;
  return out;
};

export function state(t){ return derive(t).list.map(tidy); }

export function ignored(t){ return derive(t).ignoredKeys; }

export function finished(t){
  if (!t.seeds) return false;
  return derive(t).list.every(x => x.status === "done" || x.status === "bye");
}

export function validResult(t, key, result){
  const { byKey } = derive(t);
  const x = byKey.get(key);
  if (!x || x.absent || !(x.status === "ready" || x.status === "done")) return false;
  return !!x.targets && fits(result, x.a, x.b, x.targets.a, x.targets.b);
}

export function canClear(t, key){
  if (!(t.results && t.results[key])) return false;
  const { all, byKey } = derive(t);
  const own = byKey.get(key);
  if (!own || own.status !== "done") return true;          // an ignored result can always go
  const feeds = new Map();
  for (const x of all){
    for (const src of x.from) {
      const k = src.winner || src.loser;
      if (k) (feeds.get(k) || feeds.set(k, []).get(k)).push(x);
      // Every result in a group decides who comes out of it.
      if (src.qual) for (const g of all) if (g.group === src.qual.group) (feeds.get(g.key) || feeds.set(g.key, []).get(g.key)).push(x);
    }
    if (x.when) (feeds.get(x.when.key) || feeds.set(x.when.key, []).get(x.when.key)).push(x);
  }
  // Walk everything downstream: a bye passes a player straight on, so a result two steps away can
  // still depend on this one.
  const seen = new Set(), queue = [...(feeds.get(key) || [])];
  while (queue.length){
    const x = queue.shift();
    if (seen.has(x.key)) continue;
    seen.add(x.key);
    if (x.status === "done") return false;
    queue.push(...(feeds.get(x.key) || []));
  }
  return true;
}

// How many real matches (two players, ever) each elimination stage has, and the places a stage's
// losers share: place = n − (everyone out in that stage or earlier) + 1. Depends only on n.
const stageOf = (t, x) => t.format === "double" ? (x.side === "L" ? x.round : null) : (x.side === "W" ? x.round : null);
function stagePlaces(t, d){
  const realIn = new Map();
  for (const x of d.all){ const s = stageOf(t, x); if (s != null && x.real) realIn.set(s, (realIn.get(s) || 0) + 1); }
  const through = s => { let c = 0; for (const [k, v] of realIn) if (k <= s) c += v; return c; };
  const N = t.format === "groups" ? 2 * groupCount(d.n) : d.n;   // after groups, only the knockout's places
  return s => { const p = N - through(s) + 1; return { place: p, placeTo: p + (realIn.get(s) || 1) - 1 }; };
}

// Where a match's players go next, read from the fixtures' `from`: `winner` and `loser` are the
// keys they play next, or null. A loser with nowhere to go is out, in `out`'s places; a winner
// with nowhere to go has finished `top` (1st from a final, 3rd from the third-place match). In
// double elimination with a decider, the final's `decider` is "F2": played only if the losers'
// side winner takes the final, so `loser` stays null there and the sheet says so.
export function next(t, key){
  const d = derive(t);
  const x = d.byKey.get(key);
  if (!x) return null;
  // A round robin's matches lead nowhere: every one counts in the table.
  if (t.format === "robin" || x.side === "G") return { winner: null, loser: null, out: null, top: null, decider: null };
  const fed = (kind) => (d.all.find(y => !y.when && y.from.some(src => src[kind] === key)) || {}).key || null;
  const out = { winner: fed("winner"), loser: fed("loser"), out: null, top: null, decider: null };
  if (key === "T"){ out.top = 3; out.out = { place: 4, placeTo: 4 }; return out; }
  if (key === "F" || key === "F2"){
    out.winner = out.loser = null; out.top = 1; out.out = { place: 2, placeTo: 2 };
    if (key === "F" && t.final === "reset") out.decider = "F2";
    return out;
  }
  if (!out.winner) out.top = 1;
  if (!out.loser){ const s = stageOf(t, x); if (s != null) out.out = stagePlaces(t, d)(s); }
  return out;
}

// One player's matches, in the order they play them: each played one (a bye counts), then the
// one they're in now (ready, or waiting for an opponent), then the one a win leads to. The walk
// follows next(): the winner's way after a win, the loser's after a loss, and stops when they're
// out or have won. Before the draw, and for someone not in it, it's empty.
export function path(t, id){
  if (!t.seeds || !id) return [];
  // A round robin: played first, then the first still to play is now and the next is ahead.
  if (t.format === "robin"){
    const mine = state(t).filter(f => f.a === id || f.b === id), out = [];
    for (const f of mine) if (f.status === "done") out.push({ ...f, step: "played" });
    const left = mine.filter(f => f.status !== "done");
    if (left[0]) out.push({ ...left[0], step: "now" });
    if (left[1]) out.push({ ...left[1], step: "ahead" });
    return out;
  }
  const st = state(t), out = [];
  // Groups first, as a round robin; then, once through, the knockout.
  if (t.format === "groups"){
    const mine = st.filter(f => f.side === "G" && (f.a === id || f.b === id));
    for (const f of mine) if (f.status === "done") out.push({ ...f, step: "played" });
    const left = mine.filter(f => f.status !== "done");
    if (left.length){
      out.push({ ...left[0], step: "now" });
      if (left[1]) out.push({ ...left[1], step: "ahead" });
      return out;
    }
  }
  return walk(t, st, id, out);
}
function walk(t, st, id, out){
  const by = new Map(st.map(f => [f.key, f])), seen = new Set();
  let cur = st.find(f => f.side === "W" && f.round === 1 && (f.a === id || f.b === id));
  while (cur && !seen.has(cur.key)){
    seen.add(cur.key);
    if (cur.status !== "done" && cur.status !== "bye"){
      out.push({ ...cur, step: "now" });
      const ahead = next(t, cur.key).winner;
      if (ahead && by.has(ahead)) out.push({ ...by.get(ahead), step: "ahead" });
      break;
    }
    out.push({ ...cur, step: "played" });
    const nx = next(t, cur.key);
    let k = cur.winner === id ? nx.winner : nx.loser;
    if (!k && cur.key === "F" && by.has("F2")) k = "F2";
    cur = k ? by.get(k) : null;
  }
  return out;
}

// A table: those players ranked from those played matches, by wins, then rack difference (a
// walkover is a win with no racks), then, between exactly two still level, the match they
// played. Anyone still level shares the place ("3rd–4th"); the list puts them in draw order.
// Each row carries played, won, lost, racks for and against.
function rank(ids, games, seeds){
  const row = new Map(ids.map(id => [id, { id, place: null, placeTo: null, played: 0, won: 0, lost: 0, rf: 0, ra: 0 }]));
  const done = games.filter(f => f.status === "done" && row.has(f.a) && row.has(f.b));
  for (const f of done){
    const r = f.result, A = row.get(f.a), Bz = row.get(f.b);
    A.played++; Bz.played++;
    row.get(f.winner).won++; row.get(f.loser).lost++;
    if (!r.wo){ A.rf += r.a; A.ra += r.b; Bz.rf += r.b; Bz.ra += r.a; }
  }
  const diff = x => x.rf - x.ra, at = id => (seeds || []).indexOf(id);
  const list = [...row.values()].sort((x, y) => y.won - x.won || diff(y) - diff(x) || at(x.id) - at(y.id));
  const out = [];
  for (let i = 0; i < list.length;){
    let j = i + 1;
    while (j < list.length && list[j].won === list[i].won && diff(list[j]) === diff(list[i])) j++;
    const level = list.slice(i, j);
    if (level.length === 2){
      const h2h = done.find(f => (f.a === level[0].id && f.b === level[1].id) || (f.a === level[1].id && f.b === level[0].id));
      if (h2h){
        const [w, l] = h2h.winner === level[0].id ? level : [level[1], level[0]];
        w.place = w.placeTo = i + 1; l.place = l.placeTo = i + 2;
        out.push(w, l); i = j; continue;
      }
    }
    for (const g of level){ g.place = i + 1; g.placeTo = j; }
    out.push(...level);
    i = j;
  }
  return out;
}
// A round robin's table (2.32.0, §3.9).
function table(t){
  const ids = entrants(t);
  if (!t.seeds) return ids.map(id => ({ id, place: null, placeTo: null, played: 0, won: 0, lost: 0, rf: 0, ra: 0 }));
  return rank(ids, state(t), t.seeds);
}
// Each group's table (§3.10): [{ group, ids, rows, finished }]. Once a group is finished its top
// two rows carry `through`: the draw's order settles a tie the table can't.
export function groups(t){
  if (t.format !== "groups") return [];
  const d = derive(t), seeds = t.seeds;
  return Object.entries(d.gseeds).map(([group, places]) => {
    const ids = seeds ? places.map(s => seeds[s - 1]) : [];
    const games = d.all.filter(x => x.group === group);
    const finished = !!seeds && games.every(x => x.status === "done");
    const rows = seeds ? rank(ids, games, seeds) : [];
    if (finished) rows.forEach((r, i) => { r.through = i < 2; });
    return { group, ids, rows, finished };
  });
}

// Places by the round a player went out in. Who is in which round's real matches depends only on
// n (byes are fixed by the draw's size), so a player's place is known the moment they're out:
// place = n − (everyone out in that round or earlier) + 1, shared with the rest of that round.
// After groups: the knockout's places first (n is its 2G), then everyone out in the groups,
// all the groups' 3rds sharing the next places, then their 4ths, and so on.
export function standings(t){
  if (t.format === "robin") return table(t);
  const ids = entrants(t);
  const place = new Map(ids.map(id => [id, { id, place: null, placeTo: null }]));
  if (!t.seeds) return [...place.values()];
  const d = derive(t), { all, byKey } = d;
  const n = t.format === "groups" ? 2 * groupCount(d.n) : d.n;
  const set = (id, p, to = p) => { const e = place.get(id); if (e){ e.place = p; e.placeTo = to; } };
  const placesOf = stagePlaces(t, d);
  for (const x of all){
    const s = stageOf(t, x);
    if (s == null || x.status !== "done") continue;
    const { place: p, placeTo } = placesOf(s);
    set(x.loser, p, placeTo);
  }
  const done = key => { const x = byKey.get(key); return x && !x.absent && x.status === "done" ? x : null; };
  if (t.format === "double"){
    const f = done("F");
    if (f){
      if (f.result.w === "a" || t.final !== "reset"){ set(f.winner, 1); set(f.loser, 2); }
      else { const f2 = done("F2"); if (f2){ set(f2.winner, 1); set(f2.loser, 2); } }
    }
  } else {
    const k = Math.max(1, Math.ceil(Math.log2(n)));
    const f = done(`${t.format === "groups" ? "K" : "W"}${k}-1`);
    if (f) set(f.winner, 1);                               // the loser is placed 2nd above
    const third = done("T");
    if (third){ set(third.winner, 3); set(third.loser, 4); }
  }
  if (t.format === "groups"){
    // Out in the groups: by the place they finished in their group, once it's finished.
    const tables = groups(t), tier = new Map();
    for (const g of Object.values(d.gseeds)) for (let p = 3; p <= g.length; p++) tier.set(p, (tier.get(p) || 0) + 1);
    let from = n + 1;
    const startOf = new Map();
    for (const p of [...tier.keys()].sort((x, y) => x - y)){ startOf.set(p, from); from += tier.get(p); }
    for (const g of tables) if (g.finished) g.rows.forEach((r, i) => { if (i >= 2) set(r.id, startOf.get(i + 1), startOf.get(i + 1) + tier.get(i + 1) - 1); });
  }
  return [...place.values()].sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
}

// The draw: "random" shuffles; "rating" puts the highest first (guests and the unrated count as
// 500), shuffling first so equal ratings land in a fresh order on each Redraw.
export function draw(ids, { seeding = "random", ratings = {}, rand = Math.random } = {}){
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (seeding === "rating"){
    const z = id => typeof ratings[id] === "number" ? ratings[id] : 500;
    out.sort((a, b) => z(b) - z(a));                       // stable: ties keep the shuffle
  }
  return out;
}
