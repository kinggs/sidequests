// Session 10 step 5: a scorer who joins a match under way, by Game QR. Ann starts a rated match
// against Ben, her friend, and shows its Game QR. Cat scans it: there's no guest seat, so the card
// offers Score this match. Cat scores it on her phone ("Scoring for Ann and Ben") and ends it;
// Ann's QR said "Cat is scoring". Both players confirm; the ratings move once. Eve scans it after:
// it's full. Ben's own scan just opens it.
//
//   node shared/proofs/rack-it-late-scorer.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, scoreLeague, RACKS, matchesOf, ratingsOf } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const last = "body > .scrim:last-of-type .sheet";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
const cat = await tab(ctx, R + "?mock&as=cat", "cat");
const eve = await tab(ctx, R + "?mock&as=eve", "eve");
const code = await C(ann, c => c.account.invite());
await C(ben, (c, code) => c.account.accept(code, "rack-it"), code);
await ann.reload(); await ann.waitForTimeout(1000);

// Ann against Ben, rated.
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(300);
await ann.locator("#whoChips button", { hasText: "Ben" }).click(); await ann.waitForTimeout(250);
await ann.click("#ratedBtn"); await ann.waitForTimeout(150);
await ann.click("#startBtn"); await ann.waitForTimeout(500);
let m = (await matchesOf(owner)).find(x => x.status === "live");
ok(!!m && m.rated === true && !m.scorer, "ann started a rated match against Ben, no scorer");
await ann.click("#liveMore"); await ann.waitForTimeout(250);
await ann.locator(last + " button", { hasText: "Invite to this game" }).click(); await ann.waitForTimeout(500);
const link = await ann.locator(".cn-ov").getAttribute("data-link");

// Cat scans it.
await cat.goto(link.replace("?mock&", "?mock&as=cat&")); await cat.waitForTimeout(1500);
const card = await text(cat, last);
ok(/Ann's match/.test(card) && /Score this match/.test(card) && !/I'm /.test(card), "cat's card: no seat, Score this match: " + card.replace(/\s+/g, " ").slice(0, 140));
await cat.locator(last + " button", { hasText: "Score this match" }).click(); await cat.waitForTimeout(900);
m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.scorer === "mock-cat" && JSON.stringify(m.uids) === '["mock-ann","mock-ben"]', "cat is its scorer; uids still the players");
ok(await cat.locator("#scrLive").isVisible() && /Scoring for Ann and Ben/.test(await text(cat, "#scoringFor")), "cat's phone: " + (await text(cat, "#scoringFor")));
await ann.waitForTimeout(400);
ok(/Cat is scoring/.test(await text(ann, '.cn-ov [data-k="joined"]')), "ann's Game QR says: " + (await text(ann, '.cn-ov [data-k="joined"]')));
await ann.locator(".cn-ov button", { hasText: "Close" }).click(); await ann.waitForTimeout(200);

// Eve scans it now: full. Ben's scan opens it.
await eve.goto(link.replace("?mock&", "?mock&as=eve&")); await eve.waitForTimeout(1500);
ok(/full/.test(await text(eve, last + " h2")), "eve: " + (await text(eve, last + " h2")));
ok(await tryC(eve, (c, id) => c.patch("matches/" + id, { scorer: "mock-eve" }), m.id) === "permission-denied", "eve can't take over the scoring");

// Cat scores it out; both players confirm.
const before = JSON.stringify(await ratingsOf(owner));
await scoreLeague(cat, RACKS);
m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.status === "pending" && m.endedBy === "mock-cat", "cat ended it: pending");
for (const p of [ann, ben]){ await p.reload(); await p.waitForTimeout(1000); await p.click("#pendGo"); await p.waitForTimeout(700); }
m = (await matchesOf(owner)).find(x => x.id === m.id);
const rt = await ratingsOf(owner);
ok(m.status === "done" && rt["mock-ann"].match === m.id && rt["mock-ben"].match === m.id && JSON.stringify(rt) !== before, "both confirmed: done, both ratings moved");
ok(!rt["mock-cat"], "the scorer's rating didn't");

summary();
await b.close(); srv.close();
