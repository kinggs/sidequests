// Rack It 2.24.0: counting a friendly as rated, later. The owner and Mel play a friendly (Rated is
// off by default); the owner opens its summary and holds "Count it as rated". Both ratings move,
// the match records the movement and who counted it, Mel's summary shows it, and Rebuild then has
// nothing to change. The hold isn't there for Mel, nor on a guest's friendly, nor on a match
// already rated; Mel can't do the same write herself.
//
//   node shared/proofs/rack-it-count-rated.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, hold, scoreLeague, RACKS, matchesOf, ratingsOf, startMatch } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const mel = await tab(ctx, R + "?mock&as=mel", "mel");
const tabTo = async (p, t) => { await p.bringToFront(); await p.click(`.tabbar button[data-tab="${t}"]`); await p.waitForTimeout(400); };
const openRow = async (p, re) => { await tabTo(p, "matches"); await p.locator("#histList button", { hasText: re }).first().click(); await p.waitForTimeout(500); };

// Mel scans the owner's QR, so they're connected and Mel is pickable.
const code = await C(owner, c => c.account.invite());
await mel.goto(R + "?mock&as=mel&i=" + code); await mel.waitForTimeout(900);
await mel.locator(".cn-ov button", { hasText: "Done" }).click(); await mel.waitForTimeout(300);

// A friendly: Rated offered, left off.
ok(await startMatch(owner, { b: "Mel" }), "owner v Mel: Rated offered, left off");
const card = await scoreLeague(owner, RACKS);
ok(/Friendly · ratings unchanged/.test(card), "the result card says friendly");
let m = (await matchesOf(owner)).find(x => x.status === "done");
ok(m && m.rated === false && m.zargoAfter === null, "saved as a friendly: rated false, no movement");
const before = await ratingsOf(owner);
ok(!before["mock-mel"] && !(before["mock-uid"] && before["mock-uid"].sessions), "no rating moved: " + JSON.stringify(before));

// The owner's summary offers the hold; Mel's doesn't.
await openRow(owner, /Mel/);
ok(/Friendly · ratings unchanged/.test(await text(owner, "#sumZargo")), "owner's summary: " + await text(owner, "#sumZargo"));
ok(await owner.locator("#sumRate").isVisible() && /count it as rated/.test(await text(owner, "#sumRate")), "the owner sees Hold to count it as rated");
await openRow(mel, /Mock/);
ok(await mel.locator("#sumRate").isHidden(), "mel's summary has no such hold");
ok(await tryC(mel, (c, id) => c.patch("matches/" + id, { rated: true, ratedBy: "mock-mel" }), m.id) === "permission-denied", "mel can't make it rated herself");

// Hold: the match is rated, both ratings move, and the record says who counted it.
await owner.bringToFront();
await hold(owner, "#sumRate"); await owner.waitForTimeout(1500);
m = (await matchesOf(owner)).find(x => x.id === m.id);
const rt = await ratingsOf(owner);
ok(m.rated === true && m.ratedBy === "mock-uid" && m.status === "done" && !m.ratedAt, "the match: rated, ratedBy the owner, no ratedAt (replays where it was played): " + JSON.stringify({ rated: m.rated, ratedBy: m.ratedBy, ratedAt: m.ratedAt }));
ok(m.zargoBefore && m.zargoAfter && m.zargoAfter.a !== m.zargoBefore.a && m.zargoAfter.b !== m.zargoBefore.b, "the match records the movement: " + JSON.stringify({ before: m.zargoBefore, after: m.zargoAfter }));
ok(rt["mock-uid"] && rt["mock-uid"].sessions === 1 && rt["mock-mel"] && rt["mock-mel"].sessions === 1
  && Math.abs(rt["mock-uid"].zargo - m.zargoAfter.a) < 1e-9 && Math.abs(rt["mock-mel"].zargo - m.zargoAfter.b) < 1e-9, "both ratings moved to the match's zargoAfter: " + JSON.stringify(rt));
const sz = await text(owner, "#sumZargo");
ok(/Zargo: .*→.*→/.test(sz) && /counted as rated by Mock/.test(sz), "owner's summary now: " + sz);
ok(await owner.locator("#sumRate").isHidden(), "…and the hold is gone");
await tabTo(owner, "matches");
ok(!/friendly/.test(await text(owner, "#histList")), "the Matches row no longer says friendly");

// Mel sees the movement too.
await mel.reload(); await mel.waitForTimeout(900);
await openRow(mel, /Mock/);
ok(/Zargo: .*→/.test(await text(mel, "#sumZargo")) && /counted as rated by Mock/.test(await text(mel, "#sumZargo")), "mel's summary: " + await text(mel, "#sumZargo"));
await tabTo(mel, "ratings");
ok(/Mel/.test(await text(mel, "#playerList")) || /Mel/.test(await text(mel, "body")), "mel's Ratings show her");

// Rebuild has nothing to change.
await tabTo(owner, "more"); await owner.click("#rebuildBtn"); await owner.waitForTimeout(1500);
const rb = { list: (await text(owner, "#rbList")).replace(/\s+/g, " "), note: await text(owner, "#rbNote"), apply: await text(owner, "#rbApply") };
ok(!/→/.test(rb.list) && /\b0 match records change/.test(rb.note), "Rebuild moves no rating and changes no match: " + rb.list + " · " + rb.note + " · " + rb.apply);
await owner.click("#rbCancel"); await owner.waitForTimeout(300);

// A friendly with a guest, and a rated match, offer no hold.
await C(owner, c => c.account.addGuest("Guesty"));
await owner.reload(); await owner.waitForTimeout(900);
ok(!(await startMatch(owner, { b: "Guesty" })), "Rated isn't offered against a guest");
await scoreLeague(owner, RACKS);
await openRow(owner, /Guesty/);
ok(await owner.locator("#sumRate").isHidden(), "a guest's friendly offers no hold");
await openRow(owner, /Mel/);
ok(await owner.locator("#sumRate").isHidden() && /→/.test(await text(owner, "#sumZargo")), "the counted match offers it no more");
await b.close(); srv.close();
summary();
