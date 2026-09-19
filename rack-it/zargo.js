// rack-it/zargo.js — the Zargo rating engine, pure: no DOM, no cloud, no app state.
//
//   import * as Z from "./zargo.js";
//   Z.expectedShareA(za, zb)                     // chance A wins one rack
//   Z.matchPoints(matchDoc, cfg)                 // the racks that counted, as banked points
//   Z.rackResults(game, points, cfg)             // [{ r, w }] per rack
//   Z.zargoOutcome(before, results, cfg)         // { a: { from, to }, b: { from, to }, cal }
//   Z.raceWin(p, x, y), Z.raceChart(pA, n)       // the Racks lever's race chart
//   Z.groupsOf(rack), Z.loserBalls(rack)         // 8-ball: whose group is whose, and the loser's balls down
//   Z.expectedEightPoints(pA, cfg)               // Ten-Point-Eight's expected points a rack
//   Z.replay(matches, starters, cfg)             // every rating rebuilt from the match history
//
// index.html imports it; zargo.test.mjs proves it with `node --test` from the repo root. The reasoning
// is in ZARGO.md. `cfg` is always a config that has been through withGames().

// Each game's points and rating weight w (ZARGO.md). Tuning either is one edit here or in
// state/main.config.games, with no migration.
// eightOnBreak: "spot" is WPA and CSI (spot the 8 and play on, so there is no win button for it);
// "win" is APA, TAP and most bar play, and brings the button back.
// tenpoint.points: the winner takes `winner` plus `left` for each of the loser's balls still up, the
// loser `ball` each for theirs that are down. 10/1/0 is VNEA and CSI's 10-point; left 1 is CSI's
// 17-point; winner 14 is USAPL's. meanLoserBalls is the average L the handicap's quotas assume.
export const DEFAULT_GAMES = {
  league:   { points: { low: 1, nine: 3 }, w: 1 },
  golden:   { points: { big: 10, small: 7, win: 4, foul: [1, 1, 2], intentional: 10 }, w: 0.5 },
  standard: { w: 0.5 },
  eight:    { w: 0.5, eightOnBreak: "spot" },
  tenpoint: { points: { winner: 10, ball: 1, left: 0 }, meanLoserBalls: 3.5, w: 0.5, eightOnBreak: "spot" }
};
export const DEFAULT_CONFIG = { games: DEFAULT_GAMES, K: 8, provisionalRacks: 30, startZargo: 500 };

// Configs from before v3 kept the league points at config.points; still read there.
export function withGames(c){
  const out = Object.assign({}, DEFAULT_CONFIG, c || {});
  const g = (c && c.games) || {};
  const games = {};
  for(const k of Object.keys(DEFAULT_GAMES)) games[k] = Object.assign({}, DEFAULT_GAMES[k], g[k]);
  if(!(g.league && g.league.points) && c && c.points) games.league.points = c.points;
  out.games = games;
  return out;
}

// A match document without a game predates v3: it was 11-Point-Nine.
export const gameOf = doc => (doc && doc.game) || "league";
export const other = side => side === "a" ? "b" : "a";

export function expectedShareA(za, zb){ return 1 / (1 + Math.pow(2, (zb - za) / 100)); }

// Ten-Point-Eight's scoring handicap can't share the rack's points the way Golden-Nine's does:
// the loser keeps their balls, so they have a floor. Expected points a rack are linear in pA
// instead, from the winner's points and the average loser's balls (ZARGO.md, V3-PLAN §7.3):
//   eA = win × pA + lose × (1 − pA)      win = winner + left × (7 − L̄),  lose = ball × L̄
export function expectedEightPoints(pA, cfg){
  const g = cfg.games.tenpoint, L = g.meanLoserBalls;
  const win = g.points.winner + (g.points.left || 0) * (7 - L), lose = g.points.ball * L;
  return { a: win * pA + lose * (1 - pA), b: win * (1 - pA) + lose * pA };
}

// ---------- what a rack is worth ----------
export const livePoints = cfg => 8 * cfg.games.league.points.low + cfg.games.league.points.nine;

// balls and pottedAt are the ball drop: who potted which ball, and when, for a replay. They
// never enter the score.
// groups.a is side A's group in an 8-ball rack, set by hand on the drop's label; null means
// "work it out from what's been potted" (groupsOf).
export const newRack = () => ({ winner: null, kind: null, fouls: { a: 0, b: 0 }, balls: {}, pottedAt: {}, groups: { a: null } });
export function rackOf(rec){
  const balls = {}, pottedAt = {};
  for(let n = 1; n <= 15; n++){
    const by = rec && rec.balls && rec.balls[n];
    if(by !== "a" && by !== "b") continue;
    balls[n] = by;
    pottedAt[n] = (rec.pottedAt && rec.pottedAt[n]) || 0;
  }
  const g = rec && rec.groups && rec.groups.a;
  return { winner: (rec && rec.winner) || null, kind: (rec && rec.kind) || null,
    fouls: { a: (rec && rec.fouls && rec.fouls.a) || 0, b: (rec && rec.fouls && rec.fouls.b) || 0 },
    balls, pottedAt, groups: { a: g === "solids" || g === "stripes" ? g : null } };
}

// ---------- 8-ball: the two groups ----------
export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];
export const otherGroup = g => g === "solids" ? "stripes" : "solids";
export const ballsOf = g => g === "stripes" ? STRIPES : SOLIDS;
// Which group each side owns. Set by hand on the rack (groups.a) it's certain; otherwise it's
// guessed from the drop: a player who has only potted from one group owns it, and the other
// player gets the rest. Unknown until somebody pots.
export function groupsOf(rack){
  const set = rack && rack.groups && rack.groups.a;
  if(set === "solids" || set === "stripes") return { a: set, b: otherGroup(set), set: true };
  const n = { a: { solids: 0, stripes: 0 }, b: { solids: 0, stripes: 0 } };
  for(const k in (rack && rack.balls) || {}){
    const by = rack.balls[k];
    if(by !== "a" && by !== "b") continue;
    if(SOLIDS.includes(+k)) n[by].solids++;
    else if(STRIPES.includes(+k)) n[by].stripes++;
  }
  const only = s => n[s].solids && !n[s].stripes ? "solids" : n[s].stripes && !n[s].solids ? "stripes" : null;
  const a = only("a") || (only("b") ? otherGroup(only("b")) : null);
  return { a, b: a ? otherGroup(a) : null, set: false };
}
// Ten-Point-Eight's one input beyond the winner: how many of the loser's own balls are down,
// 0 to 7. Whoever potted them; a ball down on the opponent's foul still counts.
export function loserBalls(rack){
  if(!rack || !rack.winner) return 0;
  const loser = other(rack.winner), g = groupsOf(rack)[loser];
  if(!g) return 0;
  let n = 0;
  for(const k of ballsOf(g)) if(rack.balls && rack.balls[k]) n++;
  return Math.min(7, n);
}

// Golden-Nine points from a player's fouls: 1, 1, then 2 (the third also loses the rack).
export function foulPoints(n, cfg){
  const f = cfg.games.golden.points.foul;
  let s = 0;
  for(let i = 0; i < n; i++) s += f[Math.min(i, f.length - 1)];
  return s;
}
// What one rack of a non-league game is worth to each side. Trad-Nine and Trad-Eight: one rack
// is one rack; fouls never score. Ten-Point-Eight: 10 to the winner, a point a ball to the
// loser. Golden-Nine: the opponent's fouls plus the win (a three-foul rack's 1 + 1 + 2 is the
// win, so it adds nothing more).
export function gameRackPoints(game, rack, cfg){
  const p = { a: 0, b: 0, dead: 0 };
  if(game === "standard" || game === "eight"){ if(rack.winner) p[rack.winner] = 1; return p; }
  // Ten-Point-Eight: the winner's points, plus the loser's balls down at a point each. Fouls
  // never score, and the kind of win never changes the total.
  if(game === "tenpoint"){
    if(rack.winner){
      const pts = cfg.games.tenpoint.points, L = loserBalls(rack);
      p[rack.winner] = pts.winner + (pts.left || 0) * (7 - L);
      p[other(rack.winner)] = pts.ball * L;
    }
    return p;
  }
  const pts = cfg.games.golden.points;
  p.a += foulPoints(rack.fouls.b, cfg);
  p.b += foulPoints(rack.fouls.a, cfg);
  if(rack.winner) p[rack.winner] += ({ big: pts.big, small: pts.small, win: pts.win,
    intentional: pts.intentional })[rack.kind] || 0;
  return p;
}
export function leagueRackPoints(balls, cfg){
  const pts = cfg.games.league.points;
  const p = { a: 0, b: 0, dead: 0 };
  for(const k in (balls || {})) p[balls[k]] += +k === 9 ? pts.nine : pts.low;
  return p;
}

// Banked racks: running points and racks, and each rack's { a, b, winner, kind }, which is
// all the rating reads. An 11-Point-Nine rack's winner is whoever took more live points.
export const newBanked = () => ({ a: 0, b: 0, dead: 0, racks: 0, racksA: 0, racksB: 0, points: [] });
export function bankInto(banked, game, p, rack){
  const winner = game === "league" ? (p.a > p.b ? "a" : p.b > p.a ? "b" : null) : rack.winner;
  banked.a += p.a; banked.b += p.b; banked.dead += p.dead;
  if(winner === "a") banked.racksA++;
  if(winner === "b") banked.racksB++;
  banked.racks++;
  banked.points.push({ a: p.a, b: p.b, winner, kind: rack ? rack.kind : null });
}

// The racks of a stored match that counted. Every game but 11-Point-Nine: every rack with a
// winner. 11-Point-Nine: every rack, except a last one that End dropped — it has no balls at
// all (End after "Start rack N"), or its points aren't in the saved totals.
export function countedRacks(match, cfg){
  const racks = (match && match.racks) || {}, t = (match && match.totals) || {};
  let rows = Object.keys(racks).map(Number).filter(n => n > 0).sort((x, y) => x - y).map(n => ({ n, rec: racks[n] }));
  if(gameOf(match) !== "league") return rows.filter(r => r.rec && r.rec.winner);
  if(!rows.length) return rows;
  const last = rows[rows.length - 1].rec;
  const sum = rows.reduce((acc, r) => {
    const p = leagueRackPoints(r.rec && r.rec.balls, cfg);
    return { a: acc.a + p.a, b: acc.b + p.b, dead: acc.dead + p.dead };
  }, { a: 0, b: 0, dead: 0 });
  const empty = !last || !Object.keys(last.balls || {}).length;
  const offTotals = sum.a !== (t.a || 0) || sum.b !== (t.b || 0) ||
    (Number.isFinite(t.dead) && sum.dead !== t.dead);
  if(empty || offTotals) rows = rows.slice(0, -1);
  return rows;
}
export function matchPoints(match, cfg){
  const game = gameOf(match), banked = newBanked();
  for(const { rec } of countedRacks(match, cfg)){
    if(game === "league") bankInto(banked, game, leagueRackPoints(rec && rec.balls, cfg), null);
    else { const rack = rackOf(rec); bankInto(banked, game, gameRackPoints(game, rack, cfg), rack); }
  }
  return banked;
}

// ---------- the update ----------
// Zargo is odds on a rack (ZARGO.md). Every complete rack gives A a result r in 0..1 and a
// weight w for how much that rack tells us:
//   11-Point-Nine: r is A's share of the rack's live points. The game's w is spread over the
//           racks in proportion to the live points each carried, so a rack full of dead balls
//           counts for less. The weights still sum to w × racks, which makes the update
//           exactly K × racks × (pooled share − expected).
//   every other game: r is 1 if A won the rack, else 0, with the game's w per rack. Points,
//           fouls, the loser's balls and the kind of win don't enter it — Fargo's way, which
//           is why one Zargo covers 8-ball and 9-ball alike (ZARGO.md).
export function rackResults(game, points, cfg){
  const w = cfg.games[game].w;
  if(game !== "league") return points.map(p => ({ r: p.winner ? (p.winner === "a" ? 1 : 0) : null, w }));
  const livePts = points.reduce((sum, p) => sum + p.a + p.b, 0);
  if(!livePts) return points.map(() => ({ r: null, w }));   // nothing to learn, still racks played
  const mean = livePts / points.length;
  return points.map(p => {
    const l = p.a + p.b;
    return { r: l ? p.a / l : 0, w: w * l / mean };
  });
}
// Robustness grows by the total weight. Rounded so league racks stay whole numbers.
export const weightOf = results => Math.round(results.reduce((sum, x) => sum + x.w, 0) * 1e6) / 1e6;

// Ratings move in three regimes:
//
// 1. CALIBRATION — a new player (under SETTLE matches) against a known one: solve the
//    Zargo the observed mean r implies, anchor on the known rating, and jump most of the
//    way there (all the way on match 1, half on 2, a third on 3). Wild first, settled by
//    the time they're known. The known player's rating doesn't move — they're the
//    measuring stick.
// 2. SETTLING — both players new: the standard formula, but boosted 4×/3×/2× while each
//    is under SETTLE matches, with a wider clamp.
// 3. KNOWN — K × Σ w × (r − pA) over the racks, clamped ±40, trust-weighted by the other
//    player's robustness.
//
// before: { za, zb, sessionsA, sessionsB, robustnessA, robustnessB } — the ratings when the
// match started, and each player's matches and robustness when it ended.
export const SETTLE = 3;
export function zargoOutcome(before, results, cfg){
  const { za, zb } = before;
  const sA = before.sessionsA || 0, sB = before.sessionsB || 0;
  const rated = results.filter(x => x.r !== null && x.w > 0);
  const W = rated.reduce((sum, x) => sum + x.w, 0);
  if(!W) return { a: { from: za, to: za }, b: { from: zb, to: zb }, cal: null };
  const R = rated.reduce((sum, x) => sum + x.w * x.r, 0);
  const s = Math.min(.97, Math.max(.03, R / W));   // observed mean r

  const calA = sA < SETTLE && sB >= SETTLE;
  const calB = sB < SETTLE && sA >= SETTLE;
  if(calA || calB){
    // mean r of s implies a gap of 100·log2(s/(1−s)) in A's favour; cap one match at ±250
    const gap = Math.max(-250, Math.min(250, 100 * Math.log2(s / (1 - s))));
    if(calA){
      const w = 1 / (1 + sA);
      return { a: { from: za, to: za + (zb + gap - za) * w }, b: { from: zb, to: zb }, cal: "a" };
    }
    const w = 1 / (1 + sB);
    return { a: { from: za, to: za }, b: { from: zb, to: zb + (za - gap - zb) * w }, cal: "b" };
  }

  const pA = expectedShareA(za, zb);
  let d = cfg.K * (R - W * pA);   // K × Σ w_i × (r_i − pA)
  d = Math.max(-40, Math.min(40, d));
  const rA = before.robustnessA || 0, rB = before.robustnessB || 0, tot = rA + rB;
  const boost = n => n < SETTLE ? SETTLE + 1 - n : 1;          // 4x, 3x, 2x, then 1x
  const cap = n => n < SETTLE ? 120 : 40;
  const dA = Math.max(-cap(sA), Math.min(cap(sA),  d * (tot ? 2 * rB / tot : 1) * boost(sA)));
  const dB = Math.max(-cap(sB), Math.min(cap(sB), -d * (tot ? 2 * rA / tot : 1) * boost(sB)));
  return { a: { from: za, to: za + dA }, b: { from: zb, to: zb + dB }, cal: null };
}

// ---------- the race chart (ZARGO.md "Handicap levers") ----------
// The chance that a player who wins each rack with probability p gets x racks before the
// opponent gets y: a small dynamic programme.
export function raceWin(p, x, y){
  const f = [];
  for(let i = 0; i <= x; i++){
    f[i] = [];
    for(let j = 0; j <= y; j++)
      f[i][j] = i === 0 ? (j === 0 ? 0 : 1) : j === 0 ? 0 : p * f[i - 1][j] + (1 - p) * f[i][j - 1];
  }
  return f[x][y];
}
// The favourite races to n; the underdog's target (1 to n) is whichever makes the race
// nearest to even. Ties go to the longer race.
export function raceChart(pA, n){
  const favA = pA >= 0.5, p = favA ? pA : 1 - pA;
  let k = n, gap = Infinity;
  for(let j = n; j >= 1; j--){
    const g = Math.abs(raceWin(p, n, j) - 0.5);
    if(g < gap - 1e-9){ gap = g; k = j; }
  }
  return favA ? { a: n, b: k } : { a: k, b: n };
}

// ---------- rebuilding every rating ----------
// Replays the saved matches in the order they ended, from each player's starter rating (else
// cfg.startZargo), with the running matches and robustness, exactly as saving them did.
//   matches:  match documents with id, and playerA/playerB already resolved to today's ids
//   starters: { personId: zargo } or { personId: { zargo } }
// Returns every player's end state and each replayed match's ratings before and after.
// Live and discarded matches, a player against themselves, and a match with no counted
// racks are skipped: saving never moved a rating for any of those.
export function replay(matches, starters = {}, cfg = DEFAULT_CONFIG){
  const startOf = id => {
    const s = starters[id];
    const z = typeof s === "number" ? s : s && s.zargo;
    return Number.isFinite(z) ? z : cfg.startZargo;
  };
  const players = {};
  const who = id => players[id] || (players[id] = { zargo: startOf(id), robustness: 0, sessions: 0 });
  Object.keys(starters).forEach(who);

  const done = (matches || [])
    .filter(m => m && m.status === "done" && m.playerA && m.playerB && m.playerA !== m.playerB)
    .slice()
    .sort((x, y) => (x.endedAt || 0) - (y.endedAt || 0) || (x.startedAt || 0) - (y.startedAt || 0) ||
      String(x.id).localeCompare(String(y.id)));

  const out = [];
  for(const m of done){
    const banked = matchPoints(m, cfg);
    if(!banked.racks) continue;
    const a = who(m.playerA), b = who(m.playerB);
    const results = rackResults(gameOf(m), banked.points, cfg);
    const z = zargoOutcome({ za: a.zargo, zb: b.zargo, sessionsA: a.sessions, sessionsB: b.sessions,
      robustnessA: a.robustness, robustnessB: b.robustness }, results, cfg);
    const w = weightOf(results);
    out.push({ id: m.id, playerA: m.playerA, playerB: m.playerB,
      before: { a: a.zargo, b: b.zargo }, after: { a: z.a.to, b: z.b.to }, cal: z.cal });
    a.zargo = z.a.to; a.robustness += w; a.sessions++;
    b.zargo = z.b.to; b.robustness += w; b.sessions++;
  }
  return { players, matches: out };
}
