// rack-it/bracket.js — tournament brackets, pure: no DOM, no cloud, no app state.
//
//   import * as B from "./bracket.js";
//   B.build({ format, n, final, third })    // the fixtures for n entrants: [{ key, side, round, slot, name, from, when? }]
//   B.state(t)                              // those fixtures with players: [{ …, race, a, b, empty, result, status, winner, loser }]
//   B.standings(t)                          // [{ id, place, placeTo }]; place null while still in
//   B.finished(t)                           // every match played (or a bye)
//   B.canClear(t, key)                      // false while a fixture fed by it has a result
//   B.validResult(t, key, result)           // fits that fixture: its pair, the race reached by exactly one side, or a walkover
//   B.ignored(t)                            // keys whose stored result doesn't fit and is being ignored
//   B.draw(ids, { seeding, ratings, rand }) // → seeds
//   B.raceFor(t, fixture)                   // racks needed in that fixture
//   B.next(t, key)                          // where its players go: { winner, loser, out, top, decider }
//   B.path(t, id)                           // one player's matches in order: played, now, one ahead
//
// `t` is a tournament document (rack-it/TOURNAMENT.md §5): format, final, third, race, players,
// seeds and results. The bracket is DERIVED, never stored: who plays in every later fixture comes
// from the draw and the results, the same way on every phone. A stored result that doesn't fit the
// derived fixture is ignored, not trusted; that is the safety net behind the rules, which can't
// work the bracket out. bracket.test.mjs proves it with `node --test` from the repo root.
//
// Written to be lifted into the Sessions app (SESSIONS-MIGRATION.md): nothing here knows about pool.

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

export function build({ format = "single", n, final = "one", third = false } = {}){
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
  if (f.side === "L") return r.l || w;
  return w;
}

// Does a stored result fit a fixture whose derived players are a and b?
function fits(r, a, b, race){
  if (!r || !Array.isArray(r.ids) || r.ids[0] !== a || r.ids[1] !== b) return false;
  if (r.w !== "a" && r.w !== "b") return false;
  if (r.wo) return (r.a || 0) === 0 && (r.b || 0) === 0;
  const ok = x => Number.isInteger(x) && x >= 0 && x <= race;
  if (!ok(r.a) || !ok(r.b)) return false;
  if ((r.a === race) === (r.b === race)) return false;      // nobody at the race, or both
  return (r.a === race ? "a" : "b") === r.w;
}

function entrants(t){ return (t && (t.seeds || t.players)) || []; }

// Works out every fixture. `all` keeps the internal view (skipped fixtures, real or not) for
// standings and canClear; `list` is what state() hands out.
function derive(t){
  const seeds = t.seeds || null;
  const n = entrants(t).length;
  const results = t.results || {};
  const fixtures = build({ format: t.format, n, final: t.final, third: t.third });
  const byKey = new Map(), all = [], list = [], ignoredKeys = [];
  const resolve = src => {
    if ("seed" in src) return src.seed > n ? EMPTY : seeds ? seeds[src.seed - 1] : PENDING;
    const g = byKey.get(src.winner || src.loser);
    return src.winner ? g._w : g._l;
  };
  const show = v => (v === EMPTY || v === PENDING) ? null : v;
  for (const f of fixtures){
    const x = { ...f, race: raceFor(t, f), _w: EMPTY, _l: EMPTY, real: false, absent: false };
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
    } else if (r && fits(r, a, b, x.race)){
      x.status = "done"; x.result = r;
      x._w = x.winner = r.w === "a" ? a : b;
      x._l = x.loser = r.w === "a" ? b : a;
    } else {
      x.status = "ready"; x._w = PENDING; x._l = PENDING;
    }
    if (r && x.status !== "done"){ x.ignored = r; ignoredKeys.push(f.key); }
    if (x.status !== "skip") list.push(x);
  }
  return { all, list, byKey, ignoredKeys, n, fixtures };
}

const tidy = x => {
  const { _w, _l, real, absent, ...out } = x;
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
  return fits(result, x.a, x.b, x.race);
}

export function canClear(t, key){
  if (!(t.results && t.results[key])) return false;
  const { all, byKey } = derive(t);
  const own = byKey.get(key);
  if (!own || own.status !== "done") return true;          // an ignored result can always go
  const feeds = new Map();
  for (const x of all){
    for (const src of x.from) { const k = src.winner || src.loser; if (k) (feeds.get(k) || feeds.set(k, []).get(k)).push(x); }
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
  return s => { const p = d.n - through(s) + 1; return { place: p, placeTo: p + (realIn.get(s) || 1) - 1 }; };
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
  const st = state(t), by = new Map(st.map(f => [f.key, f])), out = [], seen = new Set();
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

// Places by the round a player went out in. Who is in which round's real matches depends only on
// n (byes are fixed by the draw's size), so a player's place is known the moment they're out:
// place = n − (everyone out in that round or earlier) + 1, shared with the rest of that round.
export function standings(t){
  const ids = entrants(t);
  const place = new Map(ids.map(id => [id, { id, place: null, placeTo: null }]));
  if (!t.seeds) return [...place.values()];
  const d = derive(t), { all, byKey, n } = d;
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
    const f = done(`W${k}-1`);
    if (f) set(f.winner, 1);                               // the loser is placed 2nd above
    const third = done("T");
    if (third){ set(third.winner, 3); set(third.loser, 4); }
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
