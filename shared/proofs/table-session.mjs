// Session 10 step 4: a table session. The owner, staff at the club, opens Ann's page in Sessions
// Loyalty, starts a match against Ben, and lands in Rack It with both picked and the owner
// scoring. A rated match at venue "sessions", with the id the loyalty app chose. Back to Sessions;
// a spend logged in the sitting carries the match. Ann and Ben confirm: ratings move once, and the
// owner's loyalty app logs one earn entry each (item rack-it). Again on a reload: still one each.
// Rebuild points and Rebuild ratings change nothing. A non-staff scorer can't name the club.
// Ann's card links to her Rack It page.
//
//   node shared/proofs/table-session.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, hold, scoreLeague, RACKS, matchesOf, ratingsOf } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/", L = srv.base + "/sessions-loyalty/";
const owner = await tab(ctx, L + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
// The owner's loyalty app scans Ann and Ben: friends with app sessions-loyalty, and their cards.
for (const p of [ann, ben]){
  const code = await C(p, c => c.account.invite());
  await C(owner, (c, code) => c.account.accept(code, "sessions-loyalty"), code);
}
for (const [uid, name] of [["mock-ann", "Ann"], ["mock-ben", "Ben"]])
  await C(owner, (c, a) => c.save("cards/" + a.uid, { uid: a.uid, name: a.name, since: 1, memberNo: "", status: "member", points: 0, xp: 0, lastAt: 0, by: "mock-uid" }), { uid, name });
const entriesOf = async () => Object.entries(await store(owner)).filter(([k]) => k.startsWith("sidequests/sessions-loyalty/entries/")).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const cardsOf = async () => Object.fromEntries(Object.entries(await store(owner)).filter(([k]) => k.startsWith("sidequests/sessions-loyalty/cards/")).map(([k, v]) => [k.split("/").pop(), v]));

// Ann's page → Start a match → Ben.
await owner.goto(L + "?mock&member=mock-ann"); await owner.waitForTimeout(1500);
ok(/Ann/.test(await text(owner, ".pagehead h2")), "?member opens Ann's page");
ok(/\?p=mock-ann/.test(await owner.locator("a.linkbtn", { hasText: "Their Rack It page" }).getAttribute("href")), "…with a link to her Rack It page");
await owner.locator("button", { hasText: "Start a match" }).click(); await owner.waitForTimeout(600);
await Promise.all([owner.waitForURL(/rack-it/, { timeout: 5000 }), owner.locator(".scrim .sheet button", { hasText: "Ben" }).click()]);
await owner.waitForTimeout(2500);
ok(!/club=|[?&]m=/.test(owner.url()), "rack-it took the link out of the address bar: " + owner.url().replace(srv.base, ""));
ok(/Ann/.test(await text(owner, "#pickA")) && /Ben/.test(await text(owner, "#pickB")), "rack-it: Ann and Ben picked: " + (await text(owner, "#pickA")) + " / " + (await text(owner, "#pickB")));
ok(/^At Sessions/.test(await text(owner, "#setupHint")), "setup says: " + (await text(owner, "#setupHint")).slice(0, 50));
ok(/Score it for Ann and Ben/.test(await text(owner, "#startBtn")), "Start: " + (await text(owner, "#startBtn")));
await owner.click("#ratedBtn"); await owner.waitForTimeout(200);
await owner.click("#startBtn"); await owner.waitForTimeout(700);
const table = (await owner.evaluate(() => JSON.parse(localStorage.getItem("sessions-loyalty.tables.mock-uid") || "[]")))[0];
let m = (await matchesOf(owner)).find(x => x.status === "live");
ok(!!m && m.id === table.m && m.venue === "sessions" && m.scorer === "mock-uid" && m.rated === true && JSON.stringify(m.uids) === '["mock-ann","mock-ben"]',
  "the match: the loyalty app's id, venue sessions, the owner scoring, rated: " + JSON.stringify(m && { id: m.id === table.m, venue: m.venue, scorer: m.scorer }));
const before = await ratingsOf(owner);
await scoreLeague(owner, RACKS);
m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.status === "pending" && m.endedBy === "mock-uid", "the owner ended it: pending");
ok(/Logged at Sessions/i.test(await text(owner, "#sumMeta")), "the summary: " + (await text(owner, "#sumMeta")));
ok(await owner.locator("#sumClub").isVisible(), "…with Back to Sessions");

// Back to Sessions: Ann's page, the sitting, a spend that carries the match.
await Promise.all([owner.waitForURL(/sessions-loyalty/), owner.click("#sumClub")]);
await owner.waitForTimeout(1500);
ok(/At the table with Ben/.test(await text(owner, "main")), "Ann's page: At the table with Ben");
await owner.locator("button", { hasText: "Log a spend" }).click(); await owner.waitForTimeout(300);
await owner.fill(".sheet input[type=number]", "120"); await owner.locator(".sheet button", { hasText: "Log it" }).click(); await owner.waitForTimeout(600);
let es = await entriesOf();
ok(es.some(e => e.kind === "spend" && e.uid === "mock-ann" && e.match === m.id && e.rands === 120), "the spend carries the match");
ok(!es.some(e => e.kind === "earn"), "no points for playing yet: nobody has confirmed");

// Ann and Ben confirm.
for (const p of [ann, ben]){ await p.reload(); await p.waitForTimeout(1000); await p.click("#pendGo"); await p.waitForTimeout(700); }
m = (await matchesOf(owner)).find(x => x.id === m.id);
const rt = await ratingsOf(owner);
ok(m.status === "done" && rt["mock-ann"] && rt["mock-ann"].match === m.id && rt["mock-ben"].match === m.id, "both confirmed: done, both ratings moved once");

// The owner's loyalty app logs the points for playing.
await owner.reload(); await owner.waitForTimeout(2000);
es = await entriesOf();
const earn = es.filter(e => e.kind === "earn" && e.item === "rack-it");
ok(earn.length === 2 && earn.every(e => e.match === m.id && e.points === 50 && e.xp === 50 && e.id === `rackit_${m.id}_${e.uid}`),
  "one earn entry each, 50 points, item rack-it, naming the match: " + earn.map(e => e.uid + " " + e.points).join(", "));
const cs = await cardsOf();
ok(cs["mock-ann"].points === 170 && cs["mock-ben"].points === 50, "cards: Ann 120 + 50, Ben 50: " + cs["mock-ann"].points + ", " + cs["mock-ben"].points);
ok(!!(await store(owner))["sidequests/sessions-loyalty/earns/rack-it"], "the club's way to earn, A rated match, was made");
await owner.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await owner.reload(); await owner.waitForTimeout(6500); await owner.reload(); await owner.waitForTimeout(2000);
ok((await entriesOf()).filter(e => e.kind === "earn").length === 2, "again after reloads: still one each");

// Rebuild points: nothing to change.
await owner.locator("#tabs button", { hasText: "More" }).click(); await owner.waitForTimeout(300);
await hold(owner, "button:has-text('Rebuild points')", 900); await owner.waitForTimeout(500);
ok(/Nothing to change/.test(await text(owner, ".toast")), "Rebuild points: " + (await text(owner, ".toast")));
// Rebuild ratings in Rack It: no rating moves, no match changes.
await owner.goto(R + "?mock"); await owner.waitForTimeout(1500);
await owner.click('.tabbar button[data-tab="more"]'); await owner.waitForTimeout(300);
await owner.click("#rebuildBtn"); await owner.waitForTimeout(1500);
const rb = { list: (await text(owner, "#rbList")).replace(/\s+/g, " "), note: await text(owner, "#rbNote") };
ok(!/→/.test(rb.list) && /\b0 match records change/.test(rb.note), "Rebuild ratings moves nothing: " + rb.note);
ok(/at Sessions/i.test(await (async () => { await owner.click("#rbCancel"); await owner.waitForTimeout(300); await owner.click('.tabbar button[data-tab="matches"]'); await owner.waitForTimeout(400); return text(owner, "#histList"); })()), "Matches says at Sessions");

// The refusals: a scorer who isn't staff naming the club; a player changing the venue.
await C(ben, c => c.account.saveMe({ name: "Ben" }));
const kim = await tab(ctx, R + "?mock&as=kim", "kim");
for (const p of [ann, ben]){ const code = await C(p, c => c.account.invite()); await C(kim, (c, code) => c.account.accept(code, "rack-it"), code); }
ok(await tryC(kim, c => c.save("matches/kimclub", { game: "league", playerA: "mock-ann", playerB: "mock-ben", names: { a: "Ann", b: "Ben" }, uids: ["mock-ann", "mock-ben"],
  by: "mock-kim", scorer: "mock-kim", venue: "sessions", rated: false, status: "live", startedAt: 1, endedAt: null, racks: {}, totals: {} })) === "permission-denied", "kim, not staff, can't name the club");
ok(await tryC(ann, (c, id) => c.patch("matches/" + id, { venue: "elsewhere" }), m.id) === "permission-denied", "ann can't change the venue");

// Ann's own card links to her Rack It page.
const annL = await tab(ctx, L + "?mock&as=ann", "ann loyalty");
await annL.waitForTimeout(1200);
const href = await annL.locator("a.linkbtn", { hasText: "Your Rack It" }).getAttribute("href");
ok(/rack-it\/\?p=mock-ann/.test(href || ""), "ann's card links to her Rack It page: " + href);
await annL.goto(new URL(href, L).toString()); await annL.waitForTimeout(2500);
ok(/Ann/.test(await text(annL, "#perHead")) && /Zargo/.test(await text(annL, "#perHead")), "…which opens her page: " + (await text(annL, "#perHead")).replace(/\s+/g, " "));

summary();
await b.close(); srv.close();
