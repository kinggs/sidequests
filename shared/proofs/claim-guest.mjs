// Session 8 step 1: That was them. Ann plays Dan, her guest, in Rack It and Zombie Dice; Dan turns
// out to be Cat, Ann's friend. Ann claims him on his Rack It page: the match becomes Cat's, his
// starter becomes hers, and Zombie Dice follows on its next open. The rules' seatSwap holds.
//
//   node shared/proofs/claim-guest.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, scoreLeague, RACKS, matchesOf, ratingsOf, startMatch, hold } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/", Z = srv.base + "/zombie-dice/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const cat = await tab(ctx, R + "?mock&as=cat", "cat");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");

// Ann and Cat connect.
const code = await C(ann, c => c.account.invite());
await cat.goto(R + "?mock&as=cat&i=" + code); await cat.waitForTimeout(800);
await cat.locator(".cn-ov button", { hasText: "Done" }).click(); await cat.waitForTimeout(300);
ok(!!(await store(ann))["friendships/mock-ann_mock-cat"], "Ann and Cat are connected");

// Dan, Ann's guest, with a starter rating.
const gid = await C(ann, async c => { const id = await c.account.addGuest("Dan"); await c.save("ratings/" + id, { zargo: 420, robustness: 0, sessions: 0 }); return id; });
await ann.reload(); await ann.waitForTimeout(800);
await startMatch(ann, { b: "Dan" });
await scoreLeague(ann, RACKS);
let m = (await matchesOf(owner)).find(x => x.playerB === gid);
ok(m && m.status === "done" && JSON.stringify(m.uids) === '["mock-ann"]', "ann played Dan, a friendly");
const before = JSON.stringify({ ...m, _updatedAt: 0 });

// A Zombie Dice game with Dan, written straight to the store as Ann's phone would.
const zann = await tab(ctx, Z + "?mock&as=ann", "ann-zd");
await C(zann, (c, gid) => c.save("games/z1", { game: "zombie-dice", players: ["mock-ann", gid], seats: ["mock-ann", gid], names: ["Ann", "Dan"],
  uids: ["mock-ann"], by: "mock-ann", scores: { "mock-ann": 9, [gid]: 13 }, winner: gid, status: "done", at: Date.now(), turn: 0, round: 3 }), gid);
await zann.close();
const aann = await tab(ctx, srv.base + "/around-the-clock/?mock&as=ann", "ann-atc");
await C(aann, (c, gid) => c.save("games/a1", { game: "atc180", players: ["mock-ann", gid], names: ["Ann", "Dan"], uids: ["mock-ann"], by: "mock-ann",
  throws: { "mock-ann": [3, 1], [gid]: [1, 1] }, scores: { "mock-ann": 4, [gid]: 2 }, turn: 0, log: [], direction: "up", at: Date.now(), status: "done" }), gid);
await aann.close();

// Cat can't do it for Ann; Ben, not connected to Ann, can't be the one it was.
ok(await tryC(cat, (c, a) => c.patch("matches/" + a.id, { playerB: "mock-cat", uids: ["mock-ann", "mock-cat"] }), m) === "permission-denied",
  "cat can't claim Ann's guest seat");
ok(await tryC(ann, (c, a) => c.patch("matches/" + a.id, { playerB: "mock-ben", uids: ["mock-ann", "mock-ben"] }), m) === "permission-denied",
  "ann can't give it to Ben, who isn't her friend");

// Ann: Ratings → Dan → That was them → Cat → hold.
await ann.bringToFront();
await ann.click('.tabbar button[data-tab="ratings"]'); await ann.waitForTimeout(300);
await ann.locator("#playerList li", { hasText: "Dan" }).first().click(); await ann.waitForTimeout(300);
ok(await ann.locator("#perClaim").isVisible(), "Dan's page offers That was them");
await ann.click("#perClaim"); await ann.waitForTimeout(300);
ok(/Who was Dan/.test(await text(ann, "body > .scrim:last-of-type .sheet h2")), "the picker asks who Dan was");
ok(!(await ann.locator('body > .scrim:last-of-type [data-k="guest"]').isVisible()), "…with no Add a guest");
await ann.locator(".pk-pick", { hasText: "Cat" }).first().click(); await ann.waitForTimeout(300);
ok(/That was Cat/.test(await text(ann, "body > .scrim:last-of-type .sheet h2")), "then asks: " + (await text(ann, "body > .scrim:last-of-type .sheet h2")));
await hold(ann, "body > .scrim:last-of-type .sheet button.hold"); await ann.waitForTimeout(800);

m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.playerB === "mock-cat" && JSON.stringify(m.uids) === '["mock-ann","mock-cat"]', "the match is Cat's: " + m.playerB + " " + JSON.stringify(m.uids));
const after = JSON.stringify({ ...m, _updatedAt: 0, playerB: gid, uids: ["mock-ann"] });
ok(after === before, "nothing else in the match changed (names still say Dan)");
const docs = await store(owner);
ok(docs[`profiles/mock-ann/guests/${gid}`].claimedBy === "mock-cat", "Dan points at Cat");
const rt = await ratingsOf(owner);
ok(rt["mock-cat"] && rt["mock-cat"].zargo === 420 && rt["mock-cat"].from === gid, "Dan's starter became Cat's");
ok(/Cat/.test(await text(ann, "#scrPerson h1")), "Ann's page now shows Cat");

// Cat sees the match; her page counts it.
await cat.reload(); await cat.waitForTimeout(800);
await cat.click('.tabbar button[data-tab="matches"]'); await cat.waitForTimeout(300);
ok(/Ann/.test(await text(cat, "#histList")), "cat's Matches lists it: " + (await text(cat, "#histList")).slice(0, 60));

// Zombie Dice on Ann's next open: the game follows, seats and scores re-keyed, names kept.
const zann2 = await tab(ctx, Z + "?mock&as=ann", "ann-zd");
await zann2.waitForTimeout(800);
const z = (await store(zann2))["sidequests/zombie-dice/games/z1"];
ok(JSON.stringify(z.players) === '["mock-ann","mock-cat"]' && JSON.stringify(z.uids) === '["mock-ann","mock-cat"]'
  && z.scores["mock-cat"] === 13 && !(gid in z.scores) && z.winner === "mock-cat" && JSON.stringify(z.names) === '["Ann","Dan"]',
  "zombie dice followed: " + JSON.stringify({ players: z.players, uids: z.uids, scores: z.scores, winner: z.winner }));
const aann2 = await tab(ctx, srv.base + "/around-the-clock/?mock&as=ann", "ann-atc");
await aann2.waitForTimeout(800);
const a = (await store(aann2))["sidequests/around-the-clock/games/a1"];
ok(JSON.stringify(a.players) === '["mock-ann","mock-cat"]' && JSON.stringify(a.uids) === '["mock-ann","mock-cat"]'
  && JSON.stringify(a.throws["mock-cat"]) === "[1,1]" && !(gid in a.throws) && JSON.stringify(a.names) === '["Ann","Dan"]',
  "around the clock followed: " + JSON.stringify({ players: a.players, throws: a.throws }));
const zcat = await tab(ctx, Z + "?mock&as=cat", "cat-zd");
ok(await C(zcat, c => c.list("games", { where: ["uids", "array-contains", "mock-cat"] }).then(r => r.length)) === 1, "cat reads it in Zombie Dice");

// Ann's guests list is empty now; another app's account sheet doesn't offer Your guests.
ok(!(await zann2.locator("body").innerText()).includes("Your guests"), "no Your guests left to claim");
await b.close(); srv.close();
summary();
