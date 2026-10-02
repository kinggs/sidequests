// Session 6's proof (KIT-HISTORY.md): four tabs in ?mock, the owner and three accounts outside
// the household (Ann, Ben, Cat). Ann and Ben connect and play rated matches and friendlies; Cat
// and Ben are refused every route to what isn't theirs.
//
//   node shared/proofs/rack-it-outsiders.mjs
import fs from "node:fs";
import { ok, summary, accountItems, account, serve, browser, tab, C, tryC, text, store, scoreLeague, RACKS, matchesOf, ratingsOf, startMatch } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const out = {};
for (const n of ["ann", "ben", "cat"]){
  out[n] = await tab(ctx, R + "?mock&as=" + n, n);
  ok(await out[n].locator("#hhNote").count() === 0 && !/Before you play/.test(await out[n].locator("body").innerText()), `${n}: no "Before you play" note`);
}
const { ann, ben, cat } = out;
const code = await C(ann, cloud => cloud.account.invite());
await ben.goto(R + "?mock&as=ben&i=" + code); await ben.waitForTimeout(800);
ok(/connected with Ann/.test(await text(ben, ".cn-ov")), "ben: " + (await text(ben, ".cn-ov h2")));
await ben.locator(".cn-ov button", { hasText: "Done" }).click(); await ben.waitForTimeout(300);
ok(!!(await store(ann))["friendships/mock-ann_mock-ben"], "Ann and Ben are connected");

ok(await startMatch(ann, { b: "Ben", rated: true }), "ann: Rated is offered against a friend");
const before = await ratingsOf(owner);
await scoreLeague(ann, RACKS);
let m = (await matchesOf(owner)).find(x => x.status === "pending");
ok(m && m.endedBy === "mock-ann" && m.rated === true && JSON.stringify(m.uids) === '["mock-ann","mock-ben"]' && m.by === "mock-ann", "ann saved a rated match as pending");
ok(JSON.stringify(await ratingsOf(owner)) === JSON.stringify(before), "no rating moved while pending");
await ann.waitForTimeout(400); await ben.waitForTimeout(400);
ok(/Waiting for Ben to confirm/.test(await text(ann, "#pendBar")), "ann's strip: " + (await text(ann, "#pendWho")));
ok(/rated/.test(await text(ben, "#pendWho")) && await ben.locator("#pendGo").isVisible(), "ben's strip: " + (await text(ben, "#pendWho")));
await ben.bringToFront(); await ben.click("#pendGo"); await ben.waitForTimeout(600);
m = (await matchesOf(owner)).find(x => x.id === m.id);
const rt = await ratingsOf(owner);
ok(m.status === "done" && m.confirmedBy === "mock-ben" && m.ratedAt && m.zargoAfter, "ben confirmed");
ok(rt["mock-ann"] && rt["mock-ann"].match === m.id && rt["mock-ben"] && rt["mock-ben"].match === m.id, "both ratings moved, naming the match");
const rated1 = m.id;
await owner.bringToFront(); await owner.click('.tabbar button[data-tab="matches"]'); await owner.waitForTimeout(300);
ok(/Ann/.test(await text(owner, "#histList")) && /Ben/.test(await text(owner, "#histList")), "owner's Matches lists Ann v Ben");
await cat.bringToFront(); await cat.click('.tabbar button[data-tab="matches"]'); await cat.waitForTimeout(300);
ok(/No matches yet/.test(await text(cat, "#histList")), "cat's Matches: " + (await text(cat, "#histList")));
await cat.evaluate(() => { window.__appQueries = window.__mockQueries; window.__mockQueries = null; });
ok(await tryC(cat, (c, id) => c.load("matches/" + id), rated1) === "permission-denied", "cat can't read Ann and Ben's match");
ok(await tryC(cat, c => c.list("matches")) === "permission-denied", "cat can't list matches bare");
ok(await tryC(cat, c => c.list("matches", { where: ["uids", "array-contains", "mock-ann"] })) === "permission-denied", "cat can't list Ann's matches");
ok(await tryC(cat, c => c.list("ratings")) === "permission-denied", "cat can't list ratings");
ok(await C(cat, (c, id) => c.load("ratings/" + id).then(d => !!d), "mock-ann"), "cat can get one rating by id");
await cat.evaluate(() => { window.__mockQueries = window.__appQueries; });

await startMatch(ben, { b: "Ann", rated: true });
await scoreLeague(ben, RACKS);
m = (await matchesOf(owner)).find(x => x.status === "pending");
ok(m && m.endedBy === "mock-ben", "ben saved a rated match as pending");
await ben.waitForTimeout(400);
ok(!(await ben.locator("#pendGo").isVisible()) && /Withdraw/.test(await text(ben, "#pendNo")), "ben's strip offers Withdraw, not Confirm");
const rb = JSON.stringify(await ratingsOf(owner));
const own = m.id;
const routes = {
  "confirm batch": (c, own) => c.batch([{ save: "ratings/mock-ben", data: { zargo: 900, match: own } }, { save: "ratings/mock-ann", data: { zargo: 100, match: own } },
                                 { patch: "matches/" + own, data: { status: "done", ratedAt: 1, confirmedBy: "mock-ben" } }]),
  "finish it": (c, own) => c.patch("matches/" + own, { status: "done", ratedAt: 1, confirmedBy: "mock-ben" }),
  "endedBy to Ann": (c, own) => c.patch("matches/" + own, { endedBy: "mock-ann" }),
  "reopen it": (c, own) => c.patch("matches/" + own, { status: "live" }),
  "rating alone": (c, own) => c.save("ratings/mock-ben", { zargo: 900, match: own }),
  "rewrite the score": (c, own) => c.patch("matches/" + own, { totals: { a: 99, b: 0 } }),
};
for (const [name, fn] of Object.entries(routes))
  ok(await tryC(ben, fn, own) === "permission-denied", "ben refused: " + name);
ok(JSON.stringify(await ratingsOf(owner)) === rb, "no rating moved by any of those");
await ann.waitForTimeout(300);
ok(await ann.locator("#pendGo").isVisible() && /Not right/.test(await text(ann, "#pendNo")), "ann's strip offers Confirm and Not right");
await ann.bringToFront(); await ann.click("#pendNo"); await ann.waitForTimeout(500);
m = (await matchesOf(owner)).find(x => x.id === own);
ok(m.status === "done" && m.rated === false && m.declinedBy === "mock-ann", "Not right: done, rated false, declinedBy ann");
await startMatch(ann, { b: "Ben", rated: true }); await scoreLeague(ann, RACKS); await ann.waitForTimeout(400);
const wid = (await matchesOf(owner)).find(x => x.status === "pending").id;
await ann.bringToFront(); await ann.click("#pendNo"); await ann.waitForTimeout(500);
m = (await matchesOf(owner)).find(x => x.id === wid);
ok(m.status === "done" && m.rated === false && m.withdrawnBy === "mock-ann", "Withdraw: done, rated false, withdrawnBy ann");
ok(JSON.stringify(await ratingsOf(owner)) === rb, "Not right and Withdraw moved no rating");

ok(await startMatch(ann, { b: "Ben" }), "ann: friendly started");
const fl = (await matchesOf(owner)).find(x => x.status === "live");
const mel = await tab(ctx, R + "?mock&as=mel&role=member", "mel");
for (const [who, p] of [["ann", ann], ["ben", ben], ["mel (household member)", mel]])
  ok(await tryC(p, (c, id) => c.patch("matches/" + id, { rated: true }), fl.id) === "permission-denied", `${who} can't turn a live friendly into a rated match`);
await scoreLeague(ann, RACKS);
m = (await matchesOf(owner)).find(x => x.id === fl.id);
ok(m.status === "done" && m.rated === false, "the friendly saved as done, rated false");
for (const [who, p] of [["ann", ann], ["ben", ben], ["mel", mel]])
  ok(await tryC(p, (c, id) => c.patch("matches/" + id, { rated: true, status: "pending" }), fl.id) === "permission-denied", `${who} can't turn the saved friendly into a rated match`);
ok(JSON.stringify(await ratingsOf(owner)) === rb, "the friendly moved no rating");

await ann.bringToFront(); await ann.click('.tabbar button[data-tab="ratings"]'); await ann.waitForTimeout(300);
await ann.bringToFront(); await ann.click("#addPlayerBtn"); await ann.waitForTimeout(300);
await ann.bringToFront(); await ann.click('.sheet [data-k="guest"]'); await ann.fill("#pk-guest", "Dan"); await ann.bringToFront(); await ann.click('.sheet [data-k="addguest"]'); await ann.waitForTimeout(400);
ok(await ann.locator("#pform").isVisible(), "ann: the guest's starter form opens");
await ann.bringToFront(); await ann.click("#pfSave"); await ann.waitForTimeout(400);
const g = Object.keys(await ratingsOf(owner)).find(k => k.startsWith("g_"));
ok(!!g, "ann wrote her guest's starter rating: ratings/" + g);
ok(!Object.keys(await store(owner)).some(k => k.startsWith("sidequests/rack-it/starters/")), "and no starters/ document");
ok(!(await startMatch(ann, { b: "Dan" })), "Rated isn't offered against a guest");
await scoreLeague(ann, RACKS);
m = (await matchesOf(owner)).filter(x => x.playerB === g)[0];
ok(m && JSON.stringify(m.uids) === '["mock-ann"]' && m.status === "done", "the guest match: uids [ann], done");
await cat.evaluate(() => { window.__appQueries = window.__mockQueries; window.__mockQueries = null; });
ok(await tryC(ben, c => c.save("matches/x1", { by: "mock-ben", uids: ["mock-ben", "mock-cat"], status: "live", playerA: "mock-ben", playerB: "mock-cat" })) === "permission-denied", "ben can't start a match against cat (not connected)");
ok(await tryC(cat, c => c.save("matches/x2", { by: "mock-cat", uids: ["mock-ann", "mock-ben"], status: "live" })) === "permission-denied", "cat can't start a match she isn't in");
await cat.evaluate(() => { window.__mockQueries = window.__appQueries; });
await ann.bringToFront(); await ann.click('.tabbar button[data-tab="more"]'); await ann.waitForTimeout(300);
const annItems = await accountItems(ann);
ok(!(await ann.locator("#familyBtn").isVisible()) && !annItems.includes("Import") && !(await ann.locator("#rebuildBtn").isVisible()), "ann has no Invites, Import or Rebuild: " + annItems.join(", "));
const [dl] = await Promise.all([ann.waitForEvent("download"), account(ann, "Export")]);
const exp = JSON.parse(await fs.promises.readFile(await dl.path(), "utf8"));
ok(exp.matches.length >= 4 && exp.matches.every(x => x.uids.includes("mock-ann")), `ann's export: ${exp.matches.length} matches, all hers`);
for (const [n, p] of Object.entries(out)){
  const qs = await p.evaluate(() => window.__mockQueries);
  const ms = qs.filter(q => q.col === "sidequests/rack-it/matches");
  // Since 2.16.0 friend mode also lists the matches it scored for others: scorer == her uid.
  const mine = w => JSON.stringify(w) === JSON.stringify(["uids", "array-contains", "mock-" + n]) || JSON.stringify(w) === JSON.stringify(["scorer", "==", "mock-" + n]);
  ok(ms.length > 0 && ms.every(q => mine(q.opts.where) && !q.opts.orderBy), `${n}: every matches query filtered by her uid, no orderBy`);
  ok(!qs.some(q => q.col === "sidequests/rack-it/ratings" || q.col.startsWith("sidequests/rack-it/starters")), `${n}: never lists ratings or starters`);
}
summary();
await b.close(); srv.close();
