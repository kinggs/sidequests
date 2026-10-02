// Session 7 step 5: Around the Clock on the open rule, as zombie-dice-open.mjs.
//
//   node shared/proofs/around-the-clock-open.mjs                B and C
//   OLD=<git rev> node shared/proofs/around-the-clock-open.mjs  and A
import { ok, summary, oldBuild, ROOT, serve, browser, tab, C, tryC, text, store } from "./h.mjs";
const SEED = ROOT + "/shared/proofs/seeds/around-the-clock-old.json";
const games = async p => Object.fromEntries(Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/around-the-clock/games/")).map(([k, v]) => [k.split("/").pop(), v]));
const bare = t => t.split("\n").filter(l => !/^[✕⋯]$/.test(l.trim())).join("\n");
async function seeded(root, label){
  const srv = await serve(root, { "/__seed/ac.json": SEED });
  const { b, ctx } = await browser();
  const owner = await tab(ctx, srv.base + "/around-the-clock/?mock=reset&seed=/__seed/ac.json", label + " owner");
  await owner.waitForTimeout(1500);
  return { srv, b, ctx, owner };
}
if (process.env.OLD){
  const o = await seeded(oldBuild(process.env.OLD), "old");
  const before = bare(await text(o.owner, "#recent"));
  await o.b.close(); o.srv.close();
  const n = await seeded(ROOT, "new");
  const after = bare(await text(n.owner, "#recent"));
  ok(before === after, "Recent reads the same, old build against new\n     " + after.replace(/\n+/g, " | ") + (before === after ? "" : "\n OLD " + before.replace(/\n+/g, " | ")));
  await n.b.close(); n.srv.close();
} else console.log("SKIP A: needs OLD=<git rev>");

const { srv, b, ctx, owner } = await seeded(ROOT, "new");
const R = srv.base + "/around-the-clock/";
let gs = await games(owner);
ok(["a1", "a2", "a3"].every(id => Array.isArray(gs[id].uids) && Array.isArray(gs[id].names) && gs[id].by && !gs[id].by.includes("@")),
  "the backfill gave every old game names, uids and a uid for by");
ok(JSON.stringify(gs.a1.players) === '["mock-uid"]' && JSON.stringify(gs.a1.throws["mock-uid"]) === "[3,3,1,0,1,3]" && gs.a1.by === "mock-uid",
  "the one-player game moved to today's shape under the owner's uid");
ok(JSON.stringify(gs.a3.players) === '["mock-mel","pR"]' && JSON.stringify(gs.a3.uids) === '["mock-mel"]' && gs.a3.by === "mock-mel",
  "Mel v Rolf: Rolf keeps his person id, by is Mel from her email");

const mel = await tab(ctx, R + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
await mel.waitForTimeout(800);
const melRecent = await text(mel, "#recent");
ok(/Mel/.test(melRecent) && /Rolf/.test(melRecent) && (melRecent.match(/\n?⋯|·/g) || []).length > 0 && !/Mock · 1 → 20/.test(melRecent),
  "mel sees her two games, named, not the owner's solo: " + melRecent.replace(/\n+/g, " | "));
ok(!(await mel.locator("#household").isVisible()), "mel has no household list");
const code = await C(ann, c => c.account.invite());
await ben.goto(R + "?mock&as=ben&i=" + code); await ben.waitForTimeout(900);
await ben.locator(".cn-ov button", { hasText: "Done" }).click();
await ann.bringToFront(); await ann.reload(); await ann.waitForTimeout(1200);
await ann.locator("#whoChips button", { hasText: "Ben" }).click();
await ann.click("#guestBtn"); await ann.fill("#pk-guest", "Dan"); await ann.click('.sheet [data-k="addguest"]'); await ann.waitForTimeout(500);
await ann.click("#startBtn"); await ann.waitForTimeout(600);
await ann.locator('.pad [data-v="3"]').click(); await ann.waitForTimeout(400);
gs = await games(owner);
const mine = Object.entries(gs).find(([, x]) => x.by === "mock-ann");
ok(!!mine && JSON.stringify(mine[1].uids) === '["mock-ann","mock-ben"]' && JSON.stringify(mine[1].names) === '["Ann","Ben","Dan"]'
  && mine[1].throws["mock-ann"][0] === 3, "ann's game with a friend and a guest: names, uids, by, and her treble saved");
const annId = mine[0];
for (const [who, p, what, fn] of [
  ["ann", ann, "list every game", c => c.list("games")],
  ["ann", ann, "read Mel v Rolf", c => c.load("games/a3")],
  ["ann", ann, "write state/main", c => c.save("state/main", { direction: "down" })],
  ["mel", mel, "list every game", c => c.list("games")],
  ["mel", mel, "read ann's game", (c, id) => c.load("games/" + id)],
  ["ben", ben, "change who's in ann's game", (c, id) => c.patch("games/" + id, { players: ["mock-ben"] })],
]) ok(await tryC(p, fn, annId) === "permission-denied", `${who} refused: ${what}`);
ok(await tryC(ben, (c, id) => c.patch("games/" + id, { "throws.mock-ben": [1] }), annId) === "allowed", "ben, a player in it, throws in ann's game");
summary();
await b.close(); srv.close();
