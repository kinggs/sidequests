// sessions-loyalty/loyalty.js — the points arithmetic, pure and browser-free, so it can be
// proved with `node --test` (loyalty.test.mjs). index.html imports it; nothing here touches
// the DOM or the cloud.
//
// Words: a member earns POINTS (spendable on rewards) and XP (never spent; it sets the tier).
// An ENTRY is one line in a member's history: spend (rands at the bar), earn (a task done),
// redeem (a reward taken), adjust (a staff correction). Points on an entry are signed: a
// redeem is negative. A voided entry counts for nothing.

export const DEFAULT_SETTINGS = {
  name: "Sessions",
  pointsPerRand: 1,
  xpPerRand: 1,
  tiers: [{ name: "Bronze", xp: 0 }, { name: "Silver", xp: 5000 }, { name: "Gold", xp: 15000 }]
};

// Settings as stored, filled in where a field is missing or broken.
export function withDefaults(s){
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  out.pointsPerRand = num(out.pointsPerRand, DEFAULT_SETTINGS.pointsPerRand);
  out.xpPerRand = num(out.xpPerRand, DEFAULT_SETTINGS.xpPerRand);
  const tiers = Array.isArray(out.tiers) ? out.tiers.filter(t => t && t.name).map(t => ({ name: String(t.name), xp: Math.max(0, num(t.xp, 0)) })) : [];
  out.tiers = (tiers.length ? tiers : DEFAULT_SETTINGS.tiers.map(t => ({ ...t }))).sort((a, b) => a.xp - b.xp);
  if (out.tiers[0].xp !== 0) out.tiers.unshift({ name: "Bronze", xp: 0 });
  out.name = String(out.name || DEFAULT_SETTINGS.name);
  return out;
}
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : d;

// What a spend at the bar is worth. Rands are whole or with cents; points and XP are whole,
// rounded down, so R49.99 at 1 a rand is 49 points.
export function pointsFor(rands, settings){
  const s = withDefaults(settings);
  const r = Math.max(0, Number(rands) || 0);
  return { points: Math.floor(r * s.pointsPerRand), xp: Math.floor(r * s.xpPerRand) };
}

// The tier an XP total has reached, and the next one up (null at the top).
export function tierFor(xp, settings){
  const tiers = withDefaults(settings).tiers;
  const x = Math.max(0, Number(xp) || 0);
  let i = 0;
  while (i + 1 < tiers.length && x >= tiers[i + 1].xp) i++;
  return { name: tiers[i].name, xp: tiers[i].xp, next: tiers[i + 1] ? { name: tiers[i + 1].name, xp: tiers[i + 1].xp, away: tiers[i + 1].xp - x } : null };
}

// What a member's entries add up to. Voided entries count for nothing.
export function totals(entries){
  const t = { points: 0, xp: 0, rands: 0, earned: 0, redeemed: 0, visits: 0 };
  for (const e of entries || []){
    if (!e || e.voided) continue;
    const p = Number(e.points) || 0, x = Number(e.xp) || 0;
    t.points += p;
    t.xp += x;
    if (e.kind === "spend"){ t.rands += Number(e.rands) || 0; t.visits++; }
    if (p > 0) t.earned += p; else t.redeemed += -p;
  }
  return t;
}

// "2026-10" for an entry's time, in the phone's own zone.
export function monthKey(at){
  const d = new Date(Number(at) || 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export const inMonth = (entries, key) => (entries || []).filter(e => e && monthKey(e.at) === key);
// Midnight to midnight, by the phone's clock.
export function sameDay(a, b){
  const x = new Date(Number(a) || 0), y = new Date(Number(b) || 0);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// The cheapest reward a balance can't yet afford, for "Your next reward is N points away".
// Free rewards (cost 0) are never "away". null when everything is affordable, or nothing costs.
export function nextReward(points, rewards){
  const p = Math.max(0, Number(points) || 0);
  const costly = (rewards || []).filter(r => r && r.active !== false && (Number(r.cost) || 0) > p)
    .sort((a, b) => (Number(a.cost) || 0) - (Number(b.cost) || 0));
  return costly.length ? { reward: costly[0], away: (Number(costly[0].cost) || 0) - p } : null;
}
export const canAfford = (points, reward) => (Number(reward && reward.cost) || 0) <= (Number(points) || 0);

// One entry, shaped the same whichever side writes it. `points` is signed.
// match: the Rack It match a line was logged beside, at a table session (KIT-PLAN Session 10).
export function makeEntry({ kind, uid, name, by, byName, at, rands = 0, points = 0, xp = 0, item = "", title = "", note = "", match = "" }){
  if (!["spend", "earn", "redeem", "adjust"].includes(kind)) throw new Error("entry kind: " + kind);
  if (!uid) throw new Error("entry needs a member uid");
  return {
    kind, uid, name: String(name || ""), by: String(by || ""), byName: String(byName || ""),
    at: Number(at) || Date.now(),
    rands: round2(Math.max(0, Number(rands) || 0)),
    points: Math.trunc(Number(points) || 0),
    xp: Math.max(0, Math.trunc(Number(xp) || 0)),
    item: String(item || ""), title: String(title || "").slice(0, 80), note: String(note || "").slice(0, 200),
    ...(match ? { match: String(match) } : {})
  };
}
const round2 = n => Math.round(n * 100) / 100;

// The card's cached figures after an entry lands (or every card from scratch, in Rebuild).
export function cardAfter(card, entries){
  const t = totals(entries);
  const last = (entries || []).filter(e => e && !e.voided).reduce((m, e) => Math.max(m, Number(e.at) || 0), 0);
  return { ...(card || {}), points: t.points, xp: t.xp, lastAt: last || (card && card.lastAt) || 0 };
}

// Rands as the bar writes them: R90, R49.99.
export const rand = n => { const v = Number(n) || 0; return "R" + (Number.isInteger(v) ? String(v) : v.toFixed(2)); };
export const signed = n => (n > 0 ? "+" : "") + String(Math.trunc(Number(n) || 0));

// The club's list as it stands in the old app (2026-10-02), to start from. Staff edit it.
export function seedItems(){
  const rewards = [
    ["🍺", "Free Sessions Lager", "A free Sessions Lager with a 2-hour booking", 0, "With a 2-hour booking"],
    ["☕", "Free coffee or tea", "A free cup of coffee or tea with a 2-hour booking", 0, "With a 2-hour booking"],
    ["🪪", "Free Sessions ice-breaker", "Feel part of the community with the Sessions ice-breaker", 0, ""],
    ["🎱", "Free cue rental", "A free cue rental for your next game", 0, ""],
    ["🏹", "Upgrade to a high-end cue", "Pay for a regular cue and upgrade to one of the high-end cues", 250, ""],
    ["🧢", "50% off a Sessions cap", "Half price when you take up this reward on a Sessions cap", 1550, ""],
    ["📺", "TV table at standard price", "Hire the TV table at the normal table rate", 1625, ""],
    ["🧤", "50% off a glove", "Cue smoother, with more confidence, with 50% off a glove", 2185, ""]
  ].map(([emoji, title, blurb, cost, condition], i) => ({ emoji, title, blurb, cost, condition, active: true, order: i }));
  const earns = [
    ["📣", "Refer a friend", 1250],
    ["⭐", "Leave a review on Google", 1000],
    ["👍", "Follow us on Facebook", 200],
    ["📸", "Tag us in a post on Instagram", 200],
    ["📸", "Follow us on Instagram", 200],
    ["🎵", "Follow us on TikTok", 200],
    ["💬", "Comment on a post on Instagram", 200],
    ["❤️", "Like our post on Instagram", 5]
  ].map(([emoji, title, points], i) => ({ emoji, title, blurb: "", points, active: true, order: i }));
  return { rewards, earns };
}
