// Session 8 step 4: a scorer, and both sign. Mel, a household member, scores a rated match for
// the owner and Ann without playing in it. Ratings don't move after one Confirm, and move after
// the second, in one write. Rebuild then proposes no change. Mel can't confirm, nor stand in.
//
//   node shared/proofs/rack-it-scorer.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, scoreLeague, RACKS, matchesOf, ratingsOf } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const mel = await tab(ctx, R + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");

// The owner and Ann each scan Mel's QR.
const code = await C(mel, c => c.account.invite());
for (const [p, as] of [[owner, ""], [ann, "ann"]]){
  await p.goto(R + "?mock" + (as ? "&as=" + as : "&as=") + "&i=" + code); await p.waitForTimeout(900);
  await p.locator(".cn-ov button", { hasText: "Done" }).click(); await p.waitForTimeout(300);
}
await mel.reload(); await mel.waitForTimeout(900);

// Mel's setup: the owner and Ann, not herself.
await mel.click('.tabbar button[data-tab="play"]'); await mel.waitForTimeout(300);
await mel.locator("#whoChips button", { hasText: "Mel (you)" }).click(); await mel.waitForTimeout(200);   // step out
await mel.locator("#whoChips button", { hasText: "Mock" }).click(); await mel.waitForTimeout(200);
await mel.locator("#whoChips button", { hasText: "Ann" }).click(); await mel.waitForTimeout(200);
ok(/Mock/.test(await text(mel, "#pickA")) && /Ann/.test(await text(mel, "#pickB")), "mel picked the owner and Ann: " + (await text(mel, "#pickA")) + " / " + (await text(mel, "#pickB")));
ok(await mel.locator("#ratedBtn").isVisible(), "Rated is offered");
await mel.click("#ratedBtn"); await mel.waitForTimeout(200);
ok(/once Mock Player and Ann confirm/.test(await text(mel, "#ratedWho")), "rated says both confirm: " + (await text(mel, "#ratedWho")));
ok(/Score it for Mock Player and Ann/.test(await text(mel, "#startBtn")), "Start: " + (await text(mel, "#startBtn")));
await mel.click("#startBtn"); await mel.waitForTimeout(600);
let m = (await matchesOf(owner)).find(x => x.status === "live");
ok(m && m.scorer === "mock-mel" && m.by === "mock-mel" && JSON.stringify(m.uids) === '["mock-uid","mock-ann"]' && m.rated === true,
  "the match: scorer Mel, uids the players only: " + JSON.stringify({ scorer: m && m.scorer, uids: m && m.uids }));
ok(/Scoring for Mock and Ann/.test(await text(mel, "#scoringFor")), "mel's banner: " + (await text(mel, "#scoringFor")));

// The players find it on Home; Ann opens it and may tap too.
await ann.reload(); await ann.waitForTimeout(900);
ok(/Mel's match · you're in/.test(await text(ann, "#inCard")), "ann's Home card: " + (await text(ann, "#inCard")).replace(/\s+/g, " "));
ok(!(await ann.locator("#scoringFor").isVisible()), "…and no Scoring for banner on a player's phone");

const before = await ratingsOf(owner);
await scoreLeague(mel, RACKS);
m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.status === "pending" && m.endedBy === "mock-mel", "mel ended it: pending, endedBy Mel");
await mel.waitForTimeout(500);
ok(/Waiting for Mock Player and Ann to confirm/.test(await text(mel, "#pendWho")) && /Withdraw/.test(await text(mel, "#pendNo")),
  "mel's strip: " + (await text(mel, "#pendWho")));
ok(await mel.locator("#pendGo").isHidden(), "…with no Confirm");
ok(await tryC(mel, (c, id) => c.patch("matches/" + id, { "confirms.mock-mel": 1 }), m.id) === "permission-denied", "mel can't add a confirm");
ok(await tryC(mel, (c, id) => c.batch([{ save: "ratings/mock-ann", data: { zargo: 900, match: id } },
  { patch: "matches/" + id, data: { status: "done", confirmedBy: "mock-mel", ratedAt: 1 } }]), m.id) === "permission-denied", "mel can't confirm or write a rating");

// Ann confirms first: her key, and nothing moves.
await ann.reload(); await ann.waitForTimeout(900);
ok(/scored by Mel/.test(await text(ann, "#pendWho")), "ann's strip: " + (await text(ann, "#pendWho")));
await ann.click("#pendGo"); await ann.waitForTimeout(600);
m = (await matchesOf(owner)).find(x => x.id === m.id);
ok(m.status === "pending" && m.confirms && m.confirms["mock-ann"] && !m.confirms["mock-uid"], "after Ann's Confirm: still pending, her key in confirms");
ok(JSON.stringify(await ratingsOf(owner)) === JSON.stringify(before), "no rating moved after one Confirm");
ok(/Waiting for Mock Player to confirm/.test(await text(ann, "#pendWho")), "ann now waits: " + (await text(ann, "#pendWho")));
ok(await tryC(ann, (c, id) => c.batch([{ save: "ratings/mock-ann", data: { zargo: 900, match: id } }, { save: "ratings/mock-uid", data: { zargo: 100, match: id } },
  { patch: "matches/" + id, data: { status: "done", confirmedBy: "mock-ann", ratedAt: 1 } }]), m.id) === "permission-denied", "ann can't confirm again to stand in for the owner");
await mel.reload(); await mel.waitForTimeout(900);
ok(/Waiting for Mock Player to confirm/.test(await text(mel, "#pendWho")), "mel now waits for one: " + (await text(mel, "#pendWho")));

// The owner confirms: both ratings and the match, in one write.
await owner.reload(); await owner.waitForTimeout(900);
let writes = 0;
await owner.evaluate(() => { window.__w = 0; const set = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === "cloud-memory") window.__w++; return set.call(this, k, v); }; });
await owner.click("#pendGo"); await owner.waitForTimeout(700);
writes = await owner.evaluate(() => window.__w);
m = (await matchesOf(owner)).find(x => x.id === m.id);
const rt = await ratingsOf(owner);
ok(m.status === "done" && m.confirmedBy === "mock-uid" && m.zargoAfter, "the owner's Confirm finished it");
ok(rt["mock-uid"] && rt["mock-uid"].match === m.id && rt["mock-ann"] && rt["mock-ann"].match === m.id, "both ratings moved, naming the match");
ok(!rt["mock-mel"], "the scorer's rating didn't");
ok(writes === 1, `in one write (${writes})`);

// Rebuild proposes no change.
await owner.click('.tabbar button[data-tab="more"]'); await owner.waitForTimeout(300);
await owner.click("#rebuildBtn"); await owner.waitForTimeout(1500);
const rb = { list: (await text(owner, "#rbList")).replace(/\s+/g, " "), note: await text(owner, "#rbNote") };
// A first Rebuild on fresh data also offers to record starter ratings it took from the first
// match; that's not a change to any rating or match.
ok(!/→/.test(rb.list) && /\b0 match records change/.test(rb.note), "Rebuild moves no rating and changes no match: " + rb.list + " · " + rb.note);

// Mel's Matches lists what she scored.
await mel.click('.tabbar button[data-tab="matches"]'); await mel.waitForTimeout(400);
ok(/Ann/.test(await text(mel, "#histList")) && /Mock/.test(await text(mel, "#histList")), "mel's Matches lists the match she scored");
await b.close(); srv.close();
summary();
