// The ground rule (rack-it/V3-PLAN.md): an 11-Point-Nine match scores identically after every
// change. The same match, the same taps, on an older build and on this one: the saved match
// and the ratings must be the same documents, ids and times aside.
//
//   OLD=<git rev> node shared/proofs/rack-it-same-match.mjs
import { ok, summary, oldBuild, ROOT, serve, browser, tab, store, scoreLeague, RACKS, startMatch } from "./h.mjs";
if (!process.env.OLD){ console.log("Needs OLD=<git rev> to compare against."); process.exit(2); }

// Ids and times differ run to run: a guest's id becomes "GUEST", a time "T". From 2.15.0 every
// write also carries rev, log and phones (KIT-PLAN Session 8 step 3): which phone did what, not
// the score, so they're left out too.
const BOOKKEEPING = ["_updatedAt", "rev", "log", "phones"];
function mask(x, ids){
  if (Array.isArray(x)) return x.map(v => mask(v, ids));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !BOOKKEEPING.includes(k))
    .map(([k, v]) => [ids[k] || k, mask(v, ids)]).sort(([a], [b]) => a < b ? -1 : 1));
  if (typeof x === "string" && ids[x]) return ids[x];
  if (typeof x === "number" && x > 1e12) return "T";
  return x;
}
async function run(root){
  const srv = await serve(root);
  const { b, ctx } = await browser();
  const p = await tab(ctx, srv.base + "/rack-it/?mock=reset", "owner");
  await p.click('.tabbar button[data-tab="ratings"]'); await p.waitForTimeout(200);
  await p.click("#addPlayerBtn"); await p.waitForTimeout(300);
  const sheet = (await p.locator(".pk-ov").count()) ? ".pk-ov" : ".sheet";
  await p.click(`${sheet} [data-k="guest"]`); await p.fill("#pk-guest", "Dan"); await p.click(`${sheet} [data-k="addguest"]`);
  await p.waitForTimeout(400);
  if (await p.locator("#pform").isVisible()){ await p.click("#pfSave"); await p.waitForTimeout(300); }
  await startMatch(p, { b: "Dan" });
  const card = await scoreLeague(p, RACKS);
  const docs = await store(p);
  const guest = Object.keys(docs).map(k => k.split("/").pop()).find(k => k.startsWith("g_"));
  const ids = { [guest]: "GUEST" };
  const match = Object.entries(docs).filter(([k]) => k.startsWith("sidequests/rack-it/matches/")).map(([k, v]) => { ids[k.split("/").pop()] = "MATCH"; return v; });
  const ratings = Object.fromEntries(Object.entries(docs).filter(([k]) => k.startsWith("sidequests/rack-it/ratings/")).map(([k, v]) => [k.split("/").pop(), v]));
  await b.close(); srv.close();
  return { card: card.replace(/\s+/g, " "), match: JSON.stringify(mask(match, ids)), ratings: JSON.stringify(mask(ratings, ids)) };
}
const before = await run(oldBuild(process.env.OLD)), after = await run(ROOT);
ok(before.match === after.match, "the saved match is the same document\n     " + after.match.slice(0, 300) + "…" + (before.match === after.match ? "" : "\n OLD " + before.match));
ok(before.ratings === after.ratings, "the ratings are the same documents\n     " + after.ratings);
ok(before.card === after.card, "the result card reads the same: " + after.card);
summary();
