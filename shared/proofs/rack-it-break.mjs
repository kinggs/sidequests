// Rack It 2.25.0: who breaks first. Start asks, with two ways to answer: the players lagged and
// say who won, or the phone flips a coin and says who starts. 2.35.0 (V3-PLAN Session 8): the sheet
// reads the match back in one line, then the ratings and the odds, and holds the Rated switch; the
// Break row is gone, so the sheet asks every time. Cancel stays on setup and keeps Rated for the
// same pair; a swap keeps it too, a new opponent starts over.
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
ok(await owner.locator("#breakBtn, #breakWho").count() === 0 && await owner.locator("#ratedBtn").count() === 0, "no Break row and no Rated row on the page");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
const sheet = owner.locator(".sheet.brk");
ok(await sheet.isVisible() && /Who breaks first\?/i.test(await text(owner, ".sheet.brk h3")), "Start asks who breaks first");
ok(/^Mock v Mel$/.test(await text(owner, ".sheet.brk h2")), "the sheet is headed by the two names: " + await text(owner, ".sheet.brk h2"));
// The match in one line, the settings card's own rows word for word; then the ratings line.
const rows = await owner.evaluate(() => [document.querySelector("#gameName").textContent, document.querySelector("#lenSummary").textContent, document.querySelector("#hcpSummary").textContent].join(" · "));
const line = await text(owner, ".sheet.brk .ovline");
ok(line === rows && /^11-Point-Nine · Race, about 5 racks · Scoring · Mock \d+, Mel \d+$/.test(line), "the one line: " + line);
ok(/^Mock 500 ·\sprovisional · Mel 500 ·\sprovisional$/.test(await text(owner, ".sheet.brk .ovrate")) && /prov/.test(await owner.locator(".sheet.brk .ovrate").getAttribute("class")),
  "the ratings line, provisional in amber: " + await text(owner, ".sheet.brk .ovrate"));
ok(/even match|expects/.test(await text(owner, ".sheet.brk .ovodds")), "the odds sentence is there");
ok(!/Lag for it/.test(await text(owner, ".sheet.brk")), "no how-to line: the buttons say it");
ok(await text(owner, "#ratedWho") === "Off · a friendly" && await owner.locator("#ratedBtn").getAttribute("aria-checked") === "false"
  && await owner.locator("#ratedBtn").getAttribute("role") === "switch", "the Rated switch, off: " + await text(owner, "#ratedWho"));
const labels = await sheet.locator("button").allInnerTexts();
ok(labels.some(l => /Mock won the lag/.test(l)) && labels.some(l => /Mel won the lag/.test(l)) && labels.some(l => /Flip a coin/.test(l)) && labels.some(l => /Cancel/.test(l)),
  "two lag answers, a coin and Cancel: " + labels.join(" | "));
// 2. Rated flipped on the sheet: the words change in place. Cancel and reopen: still on, and asked again.
await owner.click("#ratedBtn"); await owner.waitForTimeout(200);
ok(await text(owner, "#ratedWho") === "On · moves ratings once Mel confirms" && await owner.locator("#ratedBtn").getAttribute("aria-checked") === "true",
  "Rated on, in place: " + await text(owner, "#ratedWho"));
await sheet.locator("button.cancel").click(); await owner.waitForTimeout(400);
ok(!(await sheet.isVisible().catch(() => false)) && await owner.locator("#scrSetup").isVisible() && !(await live()), "Cancel: no match started, still on setup");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok(await sheet.isVisible() && await text(owner, "#ratedWho") === "On · moves ratings once Mel confirms", "reopened for the same pair: asked again, Rated still on");
await sheet.locator("button.cancel").click(); await owner.waitForTimeout(300);
// A swap keeps it; a new opponent starts over.
await pickSlot(owner, "#pickA", "Mel");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok(/^Mel v Mock$/.test(await text(owner, ".sheet.brk h2")) && await owner.locator("#ratedBtn").getAttribute("aria-checked") === "true", "after a swap Rated holds");
await sheet.locator("button.cancel").click(); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickA", "Mock");
await pickSlot(owner, "#pickB", "Ann");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok(await owner.locator("#ratedBtn").getAttribute("aria-checked") === "false", "a new opponent starts over: " + await text(owner, "#ratedWho"));
await sheet.locator("button.cancel").click(); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickB", "Mel");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok(await owner.locator("#ratedBtn").getAttribute("aria-checked") === "false", "…and back to Mel, it's off too: a new setup of the pair");
await owner.click("#ratedBtn"); await owner.waitForTimeout(200);
// Mel won the lag: Mel breaks, and shoots first; the match is rated.
await answerBreak(owner, "b");
let m = await live();
ok(m && m.turn === "b" && m.rated === true, "Mel won the lag: she shoots first (turn b), rated");
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

// 4. The next match asks again: nothing about the last call is kept.
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(300);
await pickSlot(owner, "#pickB", "Mel");
await owner.click("#startBtn"); await owner.waitForTimeout(400);
ok(await owner.locator(".sheet.brk").isVisible() && await owner.locator('.sheet.brk [data-coin="flip"]').isVisible(), "a new Start asks again");
ok(await owner.locator("#ratedBtn").getAttribute("aria-checked") === "false", "…with Rated off: each new setup resets it");
await owner.locator(".sheet.brk button.cancel").click(); await owner.waitForTimeout(300);

// 5. The helper's default still starts a match for every other proof.
ok(await startMatch(owner, { b: "Mel" }) !== undefined && !!(await live()), "startMatch helper answers the question and starts");
await b.close(); srv.close();
summary();
