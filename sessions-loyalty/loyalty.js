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

// ---- limits and the birthday week (0.5.0) ----
// A reward may be limited: "once" (once per member, ever: the free cue rental, the cap) or
// "year" (once a year). A reward with window "birthday" is offered only in the member's
// birthday week, and its "year" limit means once per birthday week.
export const LIMITS = [["", "Any number of times"], ["once", "Once per member"], ["year", "Once a year"]];

// A birthday is "MM-DD", no year: the club needs the week, not the age.
export function validBirthday(s){
  const m = /^(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const mo = Number(m[1]), d = Number(m[2]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
}
export const birthdayText = s => validBirthday(s)
  ? new Date(2000, Number(s.slice(0, 2)) - 1, Number(s.slice(3))).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";

// The birthday week: Monday to Sunday, the week the birthday falls in, by the phone's clock.
// 29 February is kept on the 28th in other years. Returns { start, end } (end exclusive) for the
// birthday week that contains `at`, or null when `at` is in nobody's birthday week.
export function birthdayWeek(birthday, at){
  if (!validBirthday(birthday)) return null;
  const t = Number(at) || 0, y = new Date(t).getFullYear();
  const mo = Number(birthday.slice(0, 2)) - 1, d = Number(birthday.slice(3));
  for (const yr of [y - 1, y, y + 1]){
    const leap = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
    const day = new Date(yr, mo, mo === 1 && d === 29 && !leap ? 28 : d);
    const start = new Date(yr, mo, day.getDate() - ((day.getDay() + 6) % 7));   // back to Monday
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    if (t >= start.getTime() && t < end.getTime()) return { start: start.getTime(), end: end.getTime() };
  }
  return null;
}

// Has this member already used up a limited reward? Voided redeems don't count. A birthday
// reward's "year" is the birthday week that contains `at`.
export function taken(reward, entries, at = Date.now(), birthday = ""){
  const limit = reward && reward.limit;
  if (!limit) return false;
  const mine = (entries || []).filter(e => e && !e.voided && e.kind === "redeem" && e.item === reward.id).map(e => Number(e.at) || 0);
  if (limit === "once") return mine.length > 0;
  const t = Number(at) || 0;
  if (reward.window === "birthday"){
    const w = birthdayWeek(birthday, t);
    return !!w && mine.some(x => x >= w.start && x < w.end);
  }
  const y = new Date(t).getFullYear();
  return mine.some(x => new Date(x).getFullYear() === y);
}

// Can this member take this reward now? why: "" | "birthday" (not their birthday week) |
// "nobirthday" (no birthday on the card) | "taken" (limit used) | "points" (can't afford it).
export function redeemable(reward, { points = 0, birthday = "", entries = [], at = Date.now() } = {}){
  if (!reward) return { ok: false, why: "points" };
  if (reward.window === "birthday"){
    if (!validBirthday(birthday)) return { ok: false, why: "nobirthday" };
    if (!birthdayWeek(birthday, at)) return { ok: false, why: "birthday" };
  }
  if (taken(reward, entries, at, birthday)) return { ok: false, why: "taken" };
  if (!canAfford(points, reward)) return { ok: false, why: "points" };
  return { ok: true, why: "" };
}

// ---- the club's list ----
// LIST is the version of the list below. The staff side brings a club up to it once (settings
// itemsList): it adds the items it lacks, at these fixed ids, and hides the old app's items
// (OLD_TITLES) so history keeps them. Items staff added themselves are left alone.
export const LIST = "2026-11";

// The club's list as the team described it on 2026-11-25. Staff edit it.
export function seedItems(){
  const rewards = [
    // Free from the day you join (the old app's "auto on download").
    ["cue", "🎱", "Free cue rental", "A free cue rental, on the house", 0, "", "once", ""],
    ["sticker", "🏷️", "Free Sessions Icon sticker", "The Sessions Icon sticker, yours to keep", 0, "", "once", ""],
    ["lager", "🍺", "Free Sessions Lager", "A free Sessions Lager with a 2-hour table booking", 0, "With a 2-hour booking", "", ""],
    ["coffee", "☕", "Free coffee or tea", "A free coffee or tea with a 2-hour table booking, in office hours or on a Sunday", 0, "2-hour booking · office hours or Sundays", "", ""],
    ["birthday", "🎂", "Happy birthday", "Two hours of free table time and a free drink, in your birthday week", 0, "In your birthday week", "year", "birthday"],
    // Bought with points.
    ["drink", "🥤", "Free drink", "Any drink from the bar", 700, "", "", ""],
    ["hour", "⏱️", "1 hour of table time", "An hour on a table, free", 1000, "", "", ""],
    ["meal", "🍔", "A meal", "A meal from the kitchen", 1500, "", "", ""],
    ["tv", "📺", "TV table at standard rate", "Hire the TV table at the normal table rate", 1625, "", "", ""],
    ["ct", "🏆", "Competition table at standard rate", "Hire the competition table at the normal table rate", 1800, "", "", ""],
    ["cap", "🧢", "Sessions branded cap", "A Sessions cap", 3000, "", "once", ""],
    ["glove", "🧤", "PNS glove", "A PNS pool glove", 4000, "", "", ""],
    ["shirt", "👕", "Custom club shirt", "Your own Sessions club shirt", 10000, "", "", ""]
  ].map(([id, emoji, title, blurb, cost, condition, limit, window], i) => ({ id, emoji, title, blurb, cost, condition, limit, window, active: true, order: i }));
  const earns = [
    ["refer", "📣", "Refer a friend", 1250],
    ["google", "⭐", "Leave a review on Google", 1000],
    ["survey", "📝", "Fill in our survey", 200],
    ["fb-follow", "👍", "Follow us on Facebook", 200],
    ["ig-tag", "📸", "Tag us in a post on Instagram", 200],
    ["ig-follow", "📸", "Follow us on Instagram", 200],
    ["tiktok-follow", "🎵", "Follow us on TikTok", 200],
    ["ig-comment", "💬", "Comment on a post on Instagram", 200],
    ["ig-like", "❤️", "Like our post on Instagram", 5]
  ].map(([id, emoji, title, points], i) => ({ id, emoji, title, blurb: "", points, active: true, order: i }));
  return { rewards, earns };
}

// The old app's items (the list as it was on 2026-10-02), hidden when a club moves to LIST.
export const OLD_TITLES = {
  rewards: ["Free Sessions Lager", "Free coffee or tea", "Free Sessions ice-breaker", "Free cue rental",
    "Upgrade to a high-end cue", "50% off a Sessions cap", "TV table at standard price", "50% off a glove"],
  earns: ["Refer a friend", "Leave a review on Google", "Follow us on Facebook", "Tag us in a post on Instagram",
    "Follow us on Instagram", "Follow us on TikTok", "Comment on a post on Instagram", "Like our post on Instagram"]
};

// What moving a club to LIST takes: the items to add (missing fixed ids) and the ids to hide
// (old items by title, not already hidden, not one of the new ids).
export function listMove(rewards, earns){
  const { rewards: nr, earns: ne } = seedItems();
  const plan = (have, fresh, oldTitles) => {
    const ids = new Set((have || []).map(x => x.id)), newIds = new Set(fresh.map(x => x.id));
    return {
      add: fresh.filter(x => !ids.has(x.id)),
      hide: (have || []).filter(x => !newIds.has(x.id) && x.active !== false && oldTitles.includes(x.title)).map(x => x.id)
    };
  };
  return { rewards: plan(rewards, nr, OLD_TITLES.rewards), earns: plan(earns, ne, OLD_TITLES.earns) };
}
