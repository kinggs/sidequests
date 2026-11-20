// Rack It 2.35.0, V3-PLAN Session 8: Play, the match on one screen. At 360×640 and 390×844, at
// the normal text size and the largest, with two players picked and every fold closed: the slots,
// the chip row and the whole settings card are on screen with no scroll at 360×640 (the
// Tournaments row the only thing below), and nothing scrolls at 390×844. On the Start sheet both
// lag buttons and Flip a coin sit inside the sheet without a scroll, Rated offered or not. No
// sideways scroll; every target 60px or more and Start 76; with ten friends the chip row is still
// one line. A friendly in three taps and a rated match in four, counted. A drill and a locked
// fixture render without a hidden-but-reachable Rated switch or chip row. Screenshots go to SHOTS.
//
//   node shared/proofs/rack-it-setup.mjs
import { ok, summary, serve, browser, tab, C, text, shot, matchesOf, hold } from "./h.mjs";
import * as B from "../../rack-it/bracket.js";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const p = await tab(ctx, R + "?mock=reset", "owner");
const mel = await tab(ctx, R + "?mock&as=mel", "mel");
const code = await C(p, c => c.account.invite());
await mel.goto(R + "?mock&as=mel&i=" + code); await mel.waitForTimeout(900);
await mel.locator(".cn-ov button", { hasText: "Done" }).click(); await mel.waitForTimeout(300);
await mel.close();
// Ten friends and guests: Mel, and nine guests with names of every length.
const GUESTS = ["Ann", "Bartholomew", "Cat", "Nia", "Oto", "Florentyna", "Quin", "Ray", "Sol"];
for (const n of GUESTS) await C(p, (c, n) => c.account.addGuest(n), n);
await p.bringToFront(); await p.reload(); await p.waitForTimeout(900);

let taps = 0;
const tapOn = async (sel, opts) => { taps++; await p.locator(sel, opts).first().click(); await p.waitForTimeout(250); };
const play = async () => { await p.click('.tabbar button[data-tab="play"]'); await p.waitForTimeout(300); };
const live = async () => (await matchesOf(p)).find(m => m.status === "live");
const discard = async () => { await hold(p, "#end"); await p.waitForTimeout(500); };
const size = async (w, h, big) => {
  await p.setViewportSize({ width: w, height: h });
  await p.evaluate(on => { document.documentElement.style.fontSize = on ? "26px" : ""; }, big);
  await p.waitForTimeout(250);
};

// The page as it stands: where the slots, the chips and the card end against the page's bottom.
const measure = () => p.evaluate(() => {
  const body = document.querySelector("#scrSetup .setupbody"), box = body.getBoundingClientRect();
  const bot = s => Math.round(document.querySelector(s).getBoundingClientRect().bottom);
  const vis = n => !!n.offsetParent;
  const small = [...document.querySelectorAll("#scrSetup .setupbody button, #scrSetup .setupfoot button")].filter(vis).filter(n => {
    const r = n.getBoundingClientRect();
    // A button the row scrolls past is still a target: measure its height, not what shows.
    return r.height < 59.5;
  }).map(n => (n.id || n.textContent.trim().slice(0, 20)) + "@" + Math.round(n.getBoundingClientRect().height));
  const chips = [...document.querySelectorAll("#whoChips button")];
  const tops = new Set(chips.map(n => Math.round(n.getBoundingClientRect().top)));
  return {
    page: Math.round(box.bottom), scrollTop: body.scrollTop, scrolls: body.scrollHeight > body.clientHeight + 1,
    pick: bot("#scrSetup .pick"), chips: bot("#whoChips"), card: bot("#matchSettings"), tours: bot("#toursBtn"),
    sideways: document.scrollingElement.scrollWidth > innerWidth || body.scrollWidth > body.clientWidth + 1,
    small, start: Math.round(document.querySelector("#startBtn").getBoundingClientRect().height),
    chipCount: chips.length, chipLines: tops.size, chipText: chips.map(n => n.textContent.trim()),
    // Siblings in the column never overlap.
    overlap: [...body.children].filter(vis).some((n, i, a) => i && a[i - 1].getBoundingClientRect().bottom > n.getBoundingClientRect().top + 1),
    hint: document.querySelector("#setupHint").offsetParent ? document.querySelector("#setupHint").textContent : "",
  };
});
// The Start sheet: the three break buttons' bottoms against the sheet's.
const sheetFit = () => p.evaluate(() => {
  const s = document.querySelector(".sheet.brk"), sb = s.getBoundingClientRect();
  const bots = [...s.querySelectorAll("[data-lag], [data-coin]")].map(n => n.getBoundingClientRect());
  return { scrollTop: s.scrollTop, bottom: Math.round(sb.bottom), within: bots.length === 3 && bots.every(r => r.bottom <= sb.bottom + 0.5 && r.bottom <= innerHeight + 0.5),
    lowest: Math.round(Math.max(...bots.map(r => r.bottom))), rated: !!s.querySelector("#ratedBtn"),
    small: [...s.querySelectorAll("button")].filter(n => n.getBoundingClientRect().height < 59.5).map(n => n.textContent.trim()),
    sideways: s.scrollWidth > s.clientWidth + 1 };
});

// ---- 1. A friendly in three taps, from a fresh Play: Mel's chip, Start, Mel won the lag. ----
await play();
let m0 = await measure();
ok(m0.chipText.some(t => /Mel$/.test(t)) && !m0.chipText.some(t => /(Ray|Sol)$/.test(t)), "by name, eight at most: " + m0.chipText.join(" | "));
ok(!m0.chipText.some(t => /\(you\)/.test(t)) && m0.chipText[m0.chipText.length - 1] === "Someone else",
  "you're on teal, so not a chip; the row ends in Someone else");
ok(m0.chipCount === 9 && m0.chipLines === 1, `ten friends and guests: eight chips and Someone else, one line (${m0.chipCount} chips, ${m0.chipLines} lines)`);
taps = 0;
await tapOn("#whoChips button", { hasText: "Mel" });
await tapOn("#startBtn");
await tapOn('.sheet.brk [data-lag="b"]');
let m = await live();
ok(m && m.turn === "b" && m.rated === false && taps === 3, `a friendly in ${taps} taps, Mel breaking`);
await discard();

// ---- 2. A rated match in four: the chip, Start, Rated, the lag. ----
await play();
taps = 0;
await tapOn("#whoChips button", { hasText: "Mel" });
await tapOn("#startBtn");
await tapOn("#ratedBtn");
ok(/^On · moves ratings once Mel confirms$/.test(await text(p, "#ratedWho")) && await p.locator("#ratedBtn").getAttribute("aria-checked") === "true",
  "Rated flipped on the sheet, in place: " + await text(p, "#ratedWho"));
await tapOn('.sheet.brk [data-lag="a"]');
m = await live();
ok(m && m.rated === true && m.turn === "a" && taps === 4, `a rated match in ${taps} taps`);
await discard();

// ---- 3. The budget, at both sizes and both text sizes. ----
await play();
await p.locator("#whoChips button", { hasText: "Mel" }).click(); await p.waitForTimeout(250);
for (const [w, h] of [[360, 640], [390, 844]]){
  for (const big of [false, true]){
    await size(w, h, big);
    const k = `${w}×${h}${big ? " largest" : ""}`;
    const r = await measure();
    await shot(p, `setup-${w}x${h}${big ? "-big" : ""}`);
    ok(!r.sideways && !r.overlap, `${k}: no sideways scroll, nothing overlaps`);
    ok(r.small.length === 0 && r.start >= 76, `${k}: every target 60px or more (${r.small.join(", ") || "none under"}), Start ${r.start}`);
    ok(r.chipLines === 1, `${k}: the chip row is one line`);
    if (!big){
      ok(r.scrollTop === 0 && r.pick <= r.page && r.chips <= r.page && r.card <= r.page,
        `${k}: slots, chips and the settings card on screen with no scroll (ends ${r.pick}, ${r.chips}, ${r.card} in ${r.page})`);
      ok(r.hint === "", `${k}: the foot is Start alone`);
      if (h === 640) ok(r.tours > r.page, `${k}: the Tournaments row is the only thing below the fold (${r.tours})`);
      else ok(!r.scrolls, `${k}: nothing scrolls`);
    }
    // The sheet: three break buttons inside it, Rated offered (Mel has an account).
    await p.click("#startBtn"); await p.waitForTimeout(400);
    const s = await sheetFit();
    await shot(p, `setup-sheet-${w}x${h}${big ? "-big" : ""}`);
    if (!big) ok(s.rated && s.scrollTop === 0 && s.within, `${k}: the sheet's lag buttons and coin fit, Rated offered (lowest ${s.lowest}, sheet ${s.bottom})`);
    ok(!s.sideways && s.small.length === 0, `${k}: the sheet has no sideways scroll and no small target (${s.small.join(", ") || "none"})`);
    await p.locator(".sheet.brk button.cancel").click(); await p.waitForTimeout(300);
  }
}
await size(360, 640, false);
// Every fold opened at 360×640 scrolls into view.
for (const f of ["#foldGame", "#foldLen", "#foldHcp"]){
  await p.locator(f + " .foldhead").click(); await p.waitForTimeout(500);
  const seen = await p.evaluate(f => { const n = document.querySelector(f), r = n.getBoundingClientRect(), b = document.querySelector("#scrSetup .setupbody").getBoundingClientRect();
    return Math.round(r.bottom) <= Math.round(b.bottom) + 1 || Math.round(r.top) <= Math.round(b.top) + 1; }, f);
  ok(seen, `${f} opened scrolls into view`);
  await p.locator(f + " .foldhead").click(); await p.waitForTimeout(200);
}
// The blurb is inside the open Game fold, under the chosen game; the odds inside the open Handicap fold.
await p.click("#gameHead"); await p.waitForTimeout(200);
ok(await p.locator("#games .gopt.sel .gblurb").isVisible() && await p.locator(".gblurb").count() === 1, "the blurb sits in the chosen game's line, once");
await p.click("#gameHead"); await p.waitForTimeout(200);
ok(!(await p.locator(".gblurb").isVisible()), "…and leaves the page with the fold closed");
await p.click("#hcpHead"); await p.waitForTimeout(300);
ok(/even match|expected|expects/.test(await text(p, "#hcpOdds")) && await p.locator("#hcpOdds").isVisible(), "the odds sit in the open Handicap fold: " + await text(p, "#hcpOdds"));
await p.click("#hcpHead"); await p.waitForTimeout(200);

// ---- 4. Rated not offered (a guest): the sheet still fits, with no switch. ----
await p.locator("#whoChips button", { hasText: "Ann" }).click(); await p.waitForTimeout(250);
ok(/Ann/.test(await text(p, "#pickB")) && await p.locator("#whoChips button", { hasText: "Ann" }).getAttribute("aria-pressed") === "true",
  "a chip takes lilac's place and shows chosen");
await p.click("#startBtn"); await p.waitForTimeout(400);
let s = await sheetFit();
ok(!s.rated && s.within && s.scrollTop === 0, `360×640, a guest: no Rated switch, the break buttons fit (lowest ${s.lowest}, sheet ${s.bottom})`);
await p.locator(".sheet.brk button.cancel").click(); await p.waitForTimeout(300);
// The chosen chip, tapped, steps out; Someone else opens the picker for the empty side.
await p.locator("#whoChips button", { hasText: "Ann" }).click(); await p.waitForTimeout(250);
ok(/Pick a player/.test(await text(p, "#pickB")), "the chosen chip, tapped, steps out");
await p.locator("#whoChips button", { hasText: "Someone else" }).click(); await p.waitForTimeout(300);
ok(/Lilac side/.test(await text(p, "body > .scrim:last-of-type h2")) && await p.locator('body > .scrim:last-of-type [data-k="scan"]').isVisible()
  && await p.locator('body > .scrim:last-of-type [data-k="guest"]').isVisible(), "Someone else: the lilac picker, with Scan a new player and Add a guest");
await p.keyboard.press("Escape"); await p.waitForTimeout(300);

// ---- 5. A drill: one slot and the chips, no Length, Handicap or Rated anywhere. ----
await p.click("#gameHead"); await p.waitForTimeout(200);
await p.locator("#games .gopt", { hasText: "Spot 9" }).click(); await p.waitForTimeout(300);
const d = await p.evaluate(() => ({ rated: document.querySelectorAll("#ratedBtn").length, len: !!document.querySelector("#foldLen").offsetParent,
  hcp: !!document.querySelector("#foldHcp").offsetParent, b: !!document.querySelector("#pickB").offsetParent, chips: !!document.querySelector("#whoChips").offsetParent,
  game: !!document.querySelector("#foldGame").offsetParent, hint: document.querySelector("#setupHint").textContent }));
ok(!d.rated && !d.len && !d.hcp && !d.b && d.chips && d.game && /Spot 9|drilling/.test(d.hint),
  "a drill: one slot, the chips, the Game row and the foot's line; no Length, Handicap or Rated: " + JSON.stringify(d));
await p.click("#gameHead"); await p.waitForTimeout(200);
await p.locator("#games .gopt", { hasText: "11-Point-Nine" }).click(); await p.waitForTimeout(300);

// ---- 6. A locked fixture: slots fixed, no chips, no settings card, no Rated on its sheet. ----
const ids = ["mock-uid", "mock-mel", "g_x1", "g_x2"];
const t = { name: "Fixture cup", game: "league", format: "single", final: "one", third: false, race: { w: 3 }, seeding: "random",
  by: "mock-uid", byName: "Mock", status: "live", createdAt: Date.now(), startedAt: Date.now(),
  players: ids, names: ["Mock", "Mel", "Xan", "Yul"], uids: ["mock-uid", "mock-mel"], seeds: ids.slice(), results: {} };
await C(p, (c, t) => c.save("tournaments/fixcup", t), t);
await play();
await p.click("#toursBtn"); await p.waitForTimeout(300);
await p.locator("#tourList button", { hasText: "Fixture cup" }).first().click(); await p.waitForTimeout(500);
await p.locator("#tBody .seg button", { hasText: "Your path" }).click(); await p.waitForTimeout(200);
await p.locator("#tBody .tpath button", { hasText: "Score it in Rack It" }).first().click(); await p.waitForTimeout(900);
const fx = await p.evaluate(() => ({ card: !!document.querySelector("#setupTour").offsetParent, chips: !!document.querySelector("#whoChips").offsetParent,
  settings: !!document.querySelector("#matchSettings").offsetParent, rated: document.querySelectorAll("#ratedBtn").length,
  hint: document.querySelector("#setupHint").offsetParent ? document.querySelector("#setupHint").textContent : "" }));
ok(fx.card && !fx.chips && !fx.settings && !fx.rated && /Fixture cup/.test(fx.hint), "a fixture: its card and the slots, no chips or settings card, the line over Start: " + JSON.stringify(fx));
await p.click("#startBtn"); await p.waitForTimeout(400);
s = await sheetFit();
ok(!s.rated && s.within, "the fixture's sheet: no Rated switch, the break buttons fit");
await p.locator(".sheet.brk button.cancel").click(); await p.waitForTimeout(300);
await shot(p, "setup-fixture");

await b.close(); srv.close();
summary();
