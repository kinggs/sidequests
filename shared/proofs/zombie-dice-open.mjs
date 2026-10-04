// Session 7 step 4: Zombie Dice on the open rule.
//
//   node shared/proofs/zombie-dice-open.mjs                B and C
//   OLD=<git rev> node shared/proofs/zombie-dice-open.mjs  and A, against that build
//
// A. A seed of old games (seeds/zombie-dice-backfilled.json: the old seed `zombie-dice-old.json` as the
//    owner's one-time backfill left it, which went in Session 10; household ids, `by` as an email; Mock and
//    Mel claimed, Rolf not), opened by the owner on the old build and on this one: the backfill
//    gives every game names, uids and by, and Recent and the Leaderboard read the same.
// B. Three tabs on that seed: the owner sees every game, Mel (a member) only hers, and Ann starts
//    a game with a friend and a guest and sees only that.
// C. The refusals, through each tab's own cloud.
import { ok, summary, oldBuild, ROOT, serve, browser, tab, C, tryC, text, store } from "./h.mjs";
const SEED = ROOT + "/shared/proofs/seeds/zombie-dice-backfilled.json";
const games = async p => Object.fromEntries(Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/zombie-dice/games/")).map(([k, v]) => [k.split("/").pop(), v]));
// A row's one action was ✕ and is ⋯ (DESIGN §4): the rows are compared without it.
const bare = t => t.split("\n").filter(l => !/^[✕⋯]$/.test(l.trim())).join("\n");
const lists = async p => ({ recent: bare(await text(p, "#recent")), leaders: bare(await text(p, "#leaders")) });

async function seeded(root, label){
  const srv = await serve(root, { "/__seed/zd.json": SEED });
  const { b, ctx } = await browser();
  const owner = await tab(ctx, srv.base + "/zombie-dice/?mock=reset&seed=/__seed/zd.json", label + " owner");
  await owner.waitForTimeout(1500);
  return { srv, b, ctx, owner };
}

// ---- A ----
let after;
if (process.env.OLD){
  const o = await seeded(oldBuild(process.env.OLD), "old");
  const before = await lists(o.owner);
  await o.b.close(); o.srv.close();
  const n = await seeded(ROOT, "new");
  after = await lists(n.owner);
  ok(before.recent === after.recent, "Recent reads the same, old build against new\n     " + after.recent.replace(/\n+/g, " | "));
  ok(before.leaders === after.leaders, "the Leaderboard reads the same\n     " + after.leaders.replace(/\n+/g, " | "));
  await n.b.close(); n.srv.close();
} else console.log("SKIP A: needs OLD=<git rev>");

// ---- B ----
const { srv, b, ctx, owner } = await seeded(ROOT, "new");
const R = srv.base + "/zombie-dice/";
let gs = await games(owner);
ok(["g1", "g2", "g3"].every(id => Array.isArray(gs[id].uids) && Array.isArray(gs[id].names) && gs[id].by && !gs[id].by.includes("@")),
  "the backfill gave every old game names, uids and a uid for by");
ok(JSON.stringify(gs.g1.players) === '["mock-uid","mock-mel"]' && JSON.stringify(gs.g1.uids) === '["mock-uid","mock-mel"]'
  && gs.g1.winner === "mock-mel" && gs.g1.scores["mock-mel"] === 14 && !("pM" in gs.g1.scores) && JSON.stringify(gs.g1.names) === '["Mock","Mel"]',
  "Mock v Mel: ids resolved to uids, scores and winner with them, names kept: " + JSON.stringify(gs.g1.names));
ok(JSON.stringify(gs.g2.players) === '["mock-uid","pR"]' && JSON.stringify(gs.g2.uids) === '["mock-uid"]' && gs.g2.by === "mock-uid",
  "Mock v Rolf: Rolf keeps his person id, uids is the owner alone");
ok(gs.g3.by === "mock-mel" && JSON.stringify(gs.g3.uids) === '["mock-mel"]', "Mel's solo game: by is Mel, from her email");

const mel = await tab(ctx, R + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
await mel.waitForTimeout(800);
const melRecent = await text(mel, "#recent");
ok(/Mel 14/.test(melRecent) && /Mel 13/.test(melRecent) && !/Rolf/.test(melRecent), "mel sees her two games, named, and not Mock v Rolf: " + melRecent.replace(/\n+/g, " | "));
ok(!(await mel.locator("#household").isVisible()), "mel has no household list");
ok(/No finished games|Nothing played/.test(await text(ann, "#recent")), "ann starts with an empty app");

// Ann and Ben connect, then Ann starts a game with Ben and a guest.
const code = await C(ann, c => c.account.invite());
await ben.goto(R + "?mock&as=ben&i=" + code); await ben.waitForTimeout(900);
ok(/connected with Ann/i.test(await text(ben, ".cn-ov")), "ben: " + await text(ben, ".cn-ov h2"));
await ben.locator(".cn-ov button", { hasText: "Done" }).click();
await ann.bringToFront(); await ann.reload(); await ann.waitForTimeout(1200);
await ann.locator("#pickChips button", { hasText: "Ben" }).click();
await ann.click("#guestBtn"); await ann.fill("#pk-guest", "Dan"); await ann.click('.sheet [data-k="addguest"]'); await ann.waitForTimeout(500);
ok(/Ann.*Ben.*Dan/.test(await text(ann, "#order")), "ann's lineup: " + await text(ann, "#order"));
await ann.click("#startBtn"); await ann.waitForTimeout(600);
gs = await games(owner);
const mine = Object.entries(gs).find(([, x]) => x.by === "mock-ann");
ok(!!mine && JSON.stringify(mine[1].uids) === '["mock-ann","mock-ben"]' && mine[1].players.length === 3 && mine[1].players[2].startsWith("g_")
  && JSON.stringify(mine[1].names) === '["Ann","Ben","Dan"]', "ann's game: players, names, uids and by " + JSON.stringify(mine && mine[1].names));
const annId = mine[0];
await ann.locator(".done button").click(); await ann.waitForTimeout(300);
await ann.click("#rollBtn"); await ann.waitForTimeout(800);
for (const d of await ann.locator("#tray .die.tapme").all()) { await d.click().catch(() => {}); await ann.waitForTimeout(300); }
ok(((await games(owner))[annId].t || {}).rolls >= 1, "ann rolled, and the game saved");
await ann.click("#menuBtn"); await ann.locator(".sheet button", { hasText: "Home" }).click(); await ann.waitForTimeout(400);
ok(/Ann/.test(await text(ann, "#resume")) && !/Mel|Rolf/.test(await text(ann, "#recent") + await text(ann, "#resume")), "ann sees only her game: " + (await text(ann, "#resume")).replace(/\n+/g, " | "));
ok(/Ann/.test(await text(ben, "#resume")) || (await ben.reload(), await ben.waitForTimeout(900), /Ann/.test(await text(ben, "#resume"))), "ben sees the game he's in");

// Every mock tab shares one localStorage, so "this phone's game" is Ann's here; a phone has its own.
await owner.evaluate(() => localStorage.removeItem("zombie-dice.game"));
await owner.bringToFront(); await owner.reload(); await owner.waitForTimeout(1200);
const ownerAll = (await text(owner, "#recent")) + (await text(owner, "#resume"));
ok(/Rolf/.test(ownerAll) && /Mel 13/.test(ownerAll) && /Ann/.test(ownerAll), "the owner sees every game, Ann's too: " + ownerAll.replace(/\n+/g, " | "));

// ---- C ----
for (const p of [ann, mel]) await p.evaluate(() => { window.__appQueries = window.__mockQueries; window.__mockQueries = null; });
const refused = [
  ["ann", ann, "list every game", c => c.list("games")],
  ["ann", ann, "list Mel's games", c => c.list("games", { where: ["uids", "array-contains", "mock-mel"] })],
  ["ann", ann, "read Mock v Mel", c => c.load("games/g1")],
  ["ann", ann, "start a game naming Mel, not a friend", c => c.save("games/x1", { players: ["mock-ann", "mock-mel"], names: ["Ann", "Mel"], uids: ["mock-ann", "mock-mel"], by: "mock-ann" })],
  ["ann", ann, "write state/main", c => c.save("state/main", { x: 1 })],
  ["mel", mel, "list every game", c => c.list("games")],
  ["mel", mel, "read ann's game", (c, id) => c.load("games/" + id)],
  ["mel", mel, "read Mock v Rolf", c => c.load("games/g2")],
  ["ben", ben, "delete ann's game", (c, id) => c.delete("games/" + id)],
  ["ben", ben, "add himself to uids", (c, id) => c.patch("games/" + id, { uids: ["mock-ann", "mock-ben", "mock-cat"] })],
];
for (const [who, p, what, fn] of refused) ok(await tryC(p, fn, annId) === "permission-denied", `${who} refused: ${what}`);
ok(await tryC(ben, (c, id) => c.patch("games/" + id, { "scores.mock-ben": 3 }), annId) === "allowed", "ben, a player in it, scores in ann's game");
summary();
await b.close(); srv.close();
