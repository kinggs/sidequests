// Rack It 2.25.0: who breaks first. Start asks, with two ways to answer: the players lagged and
// say who won, or the phone flips a coin and says who starts. The Break row shows the call and
// opens the same question early, so Start then asks nothing; a new opponent starts over, a swap
// keeps the break with the person who had it; Cancel stays on setup.
//
//   node shared/proofs/rack-it-break.mjs
import { ok, summary, serve, browser, tab, C, text, pickSlot, matchesOf, startMatch, answerBreak } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const mel = await tab(ctx, R + "?mock&as=mel", "mel");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
for (const [p, n] of [[mel, "mel"], [ann, "ann"]]){
  const code = await C(owner, c => c.account.invite());
  await p.goto(R + `?mock&as=${n}&i=` + code); await p.waitForTimeout(900);
  await p.locator(".cn-ov button", { hasText: "Done" }).click(); await p.waitForTimeout(300);
}
const live = async () => (await matchesOf(owner)).find(m => m.status === "live");
// Hold End with no rack played: the match is discarded silently.
const discard = async p => { const bb = await p.locator("#end").boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(750); await p.mouse.up(); await p.waitForTimeout(500); };

// 1. Start asks; the sheet names both players; Cancel stays on setup.
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickB", "Mel");
ok(/Lag or coin, at Start/.test(await text(owner, "#breakWho")), "the Break row before Start: " + await text(owner, "#breakWho"));
await owner.click("#startBtn"); await owner.waitForTimeout(400);
const sheet = owner.locator(".sheet.brk");
ok(await sheet.isVisible() && /Who breaks first\?/i.test(await text(owner, ".sheet.brk h3")), "Start asks who breaks first");
// The overview above the question (2.26.0): the settings card's own rows, both ratings, the odds.
ok(/^Mock v Mel$/.test(await text(owner, ".sheet.brk h2")), "the sheet is headed by the two names: " + await text(owner, ".sheet.brk h2"));
// The labels are tracked caps (CSS), so innerText reads them upper-case.
const rowsOf = async () => Object.fromEntries((await sheet.locator(".ovr li").allInnerTexts()).map(r => r.split("\n").map(x => x.trim()).filter(Boolean)).map(([k, v]) => [k.toLowerCase(), v]));
const rows = await rowsOf();
ok(rows.game === "11-Point-Nine" && /^Race/.test(rows.length || "") && /^Scoring/.test(rows.handicap || ""), "Game, Length and Handicap rows: " + JSON.stringify(rows));
ok(/^Mock 500 ·\sprovisional · Mel 500 ·\sprovisional$/.test(rows.ratings || ""), "the Ratings row, provisional marked: " + rows.ratings);
ok(rows.rated === "Friendly · ratings unchanged", "the Rated row for a friendly: " + rows.rated);
ok(/even match|expects/.test(await text(owner, ".sheet.brk")), "the odds sentence is there");
const labels = await sheet.locator("button").allInnerTexts();
ok(labels.some(l => /Mock won the lag/.test(l)) && labels.some(l => /Mel won the lag/.test(l)) && labels.some(l => /Flip a coin/.test(l)) && labels.some(l => /Cancel/.test(l)),
  "two lag answers, a coin and Cancel: " + labels.join(" | "));
await sheet.locator("button.cancel").click(); await owner.waitForTimeout(400);
ok(!(await sheet.isVisible().catch(() => false)) && await owner.locator("#scrSetup, #setupHint").first().isVisible() && !(await live()), "Cancel: no match started, still on setup");

// 2. Rated on: the overview says so. Mel won the lag: Mel breaks, and shoots first.
await owner.click("#ratedBtn"); await owner.waitForTimeout(200);
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok((await rowsOf()).rated === "Rated · moves ratings once Mel confirms", "the Rated row for a rated match: " + (await rowsOf()).rated);
await answerBreak(owner, "b");
let m = await live();
ok(m && m.turn === "b", "Mel won the lag: she shoots first (turn b)");
ok(/⇄ MEL?$/i.test((await text(owner, "#breakFlip")).trim()), "the break chip: " + await text(owner, "#breakFlip"));
await discard(owner);
ok(!(await live()), "discarded");

// 3. The coin: a result is shown and taken; the breaker is whoever it said.
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickB", "Mel");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
await owner.locator('.sheet.brk [data-coin="flip"]').click(); await owner.waitForTimeout(300);
const say = await text(owner, ".sheet.brk .coinsay"), go = owner.locator(".sheet.brk button.primary"), side = await go.getAttribute("data-coin");
ok(/^(Heads|Tails) · (Mock|Mel) breaks first$/.test(say) && (side === "a" || side === "b")
  && ((side === "a") === /Heads · Mock/.test(say)), `the coin said: "${say}" (${side})`);
ok(await owner.locator(".sheet.brk .coin").isVisible() && !(await owner.locator('.sheet.brk [data-coin="flip"]').isVisible().catch(() => false)), "the coin shows once, with no second flip");
ok(await owner.locator(".sheet.brk .ovr").isVisible() && !/Lag for it/.test(await text(owner, ".sheet.brk")), "the overview stays while the coin's result shows; the how-to line went");
await go.click(); await owner.waitForTimeout(500);
m = await live();
ok(m && m.turn === side, `the match starts with the coin's breaker (turn ${m && m.turn})`);
await discard(owner);

// 4. Decided early from the Break row: Start asks nothing. A swap keeps it; a new opponent forgets it.
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickB", "Mel");
await owner.click("#breakBtn"); await owner.waitForTimeout(400);
ok(await owner.locator(".sheet.brk").isVisible(), "the Break row opens the same question");
await answerBreak(owner, "b");
ok(/Mel breaks · won the lag/.test(await text(owner, "#breakWho")), "the row shows the call: " + await text(owner, "#breakWho"));
await pickSlot(owner, "#pickA", "Mel");   // swap sides
ok(/Mel/.test(await text(owner, "#pickA")) && /Mel breaks · won the lag/.test(await text(owner, "#breakWho")), "after a swap Mel still breaks: " + await text(owner, "#breakWho"));
await pickSlot(owner, "#pickA", "Mock");   // swap back
await pickSlot(owner, "#pickB", "Ann");
ok(/Lag or coin, at Start/.test(await text(owner, "#breakWho")), "a new opponent starts over: " + await text(owner, "#breakWho"));
await owner.click("#breakBtn"); await owner.waitForTimeout(400);
await answerBreak(owner, "coin");
ok(/breaks · the coin's call/.test(await text(owner, "#breakWho")), "the coin's call shows on the row: " + await text(owner, "#breakWho"));
const breaker = /^Mock/.test(await text(owner, "#breakWho")) ? "a" : "b";
await owner.click("#startBtn"); await owner.waitForTimeout(500);
ok(!(await owner.locator(".sheet.brk").isVisible().catch(() => false)), "Start asked nothing more");
m = await live();
ok(m && m.turn === breaker && m.uids.includes("mock-ann"), `…and started against Ann with turn ${m && m.turn}`);
await discard(owner);

// 5. The helper's default still starts a match for every other proof.
ok(await startMatch(owner, { b: "Mel" }) !== undefined && !!(await live()), "startMatch helper answers the question and starts");
await b.close(); srv.close();
summary();
