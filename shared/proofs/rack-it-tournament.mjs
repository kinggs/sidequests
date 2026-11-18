// Rack It 2.28.0, Tournaments Session 2 (rack-it/TOURNAMENT.md §7): a tournament the organiser
// runs. The owner starts a double elimination with Dan, a guest; changes a setting in the lobby;
// Ann and Ben join by the Tournament QR; the draw (with a redraw) and Start; the organiser enters
// every result, a walkover among them, and clears one, and is stopped changing one a later match
// depends on; the final; standings. Ann's Play has the card; Ben can't write a result; Eve, who
// connects after the draw, is told it has started; a stranger reads nothing. No page errors.
//
//   node shared/proofs/rack-it-tournament.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, hold, shot } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
const last = "body > .scrim:last-of-type .sheet";
const tours = async p => Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/rack-it/tournaments/"))
  .map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const sheetButton = (p, label) => p.locator(last + " button", { hasText: label }).first();

// Background tabs get few animation frames, so a click there waits a long time for "stable":
// whichever tab acts next comes to the front first.
const front = async p => { await p.bringToFront(); return p; };
// The owner has a guest, Dan.
await front(owner);
await C(owner, c => c.account.addGuest("Dan"));
await owner.reload(); await owner.waitForTimeout(900);

// Play → Tournaments → Start a tournament.
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(300);
ok(await owner.locator("#toursBtn").isVisible(), "Play has a Tournaments row");
await owner.click("#toursBtn"); await owner.waitForTimeout(300);
ok(await owner.locator("#scrTours").isVisible() && await owner.locator("#noTours").isVisible(), "the Tournaments page, empty");
await owner.click("#tourStartBtn"); await owner.waitForTimeout(300);
ok(await owner.locator("#scrTourNew").isVisible(), "Start a tournament");
ok(/Name.*tournament/si.test(await text(owner, "#tnSettings")) && /Single elimination/i.test(await text(owner, "#tnSettings")) && /Race to 3/i.test(await text(owner, "#tnSettings")),
  "defaults first: " + (await text(owner, "#tnSettings")).replace(/\s+/g, " "));
ok((await text(owner, "#tnCount")).trim() === "1", "you're in by default: " + await text(owner, "#tnCount"));
await owner.locator("#tnSettings button", { hasText: "Format" }).click(); await owner.waitForTimeout(250);
await sheetButton(owner, "Double elimination").click(); await owner.waitForTimeout(250);
ok(/Double elimination/.test(await text(owner, "#tnSettings")) && /Decider|One final/.test(await text(owner, "#tnSettings")), "format: double, with its Final row");
await owner.locator("#tnChips button", { hasText: "Dan" }).click(); await owner.waitForTimeout(200);
ok((await text(owner, "#tnCount")).trim() === "2", "Dan is in: " + await text(owner, "#tnCount"));
await owner.click("#tnOpen"); await owner.waitForTimeout(500);
let t = (await tours(owner))[0];
ok(t && t.status === "open" && t.format === "double" && t.players.length === 2 && t.seeds === null && t.by === "mock-uid",
  "saved, entries open: " + JSON.stringify(t && { status: t.status, players: t.players, uids: t.uids }));
ok(await owner.locator("#scrTour").isVisible() && /Who's in · 2/i.test(await text(owner, "#tBody")), "the lobby");
ok(await owner.locator("#tFoot button.primary").isDisabled(), "Draw and start waits for three");

// A setting changed in the lobby: the race.
await owner.locator("#tBody .settings button", { hasText: "Race" }).click(); await owner.waitForTimeout(250);
await owner.locator(last + " .tstep").first().locator("button", { hasText: "+" }).click();
await sheetButton(owner, "Save").click(); await owner.waitForTimeout(400);
t = (await tours(owner))[0];
ok(t.race.w === 4 && /race to 4/i.test(await text(owner, "#tBody")), "the race is now 4: " + JSON.stringify(t.race));

// The Tournament QR.
await owner.locator("#tBody button", { hasText: "Show QR" }).click(); await owner.waitForTimeout(500);
ok(/Join .*'s tournament/.test(await text(owner, ".cn-ov h2")), "Tournament QR: " + await text(owner, ".cn-ov h2"));
const link = await owner.locator(".cn-ov").getAttribute("data-link");
ok(link && link.includes("g=t_" + t.id), "its link carries t_<id>");
// A stranger can't read it before connecting.
ok(await tryC(ben, (c, id) => c.load("tournaments/" + id), t.id) === "permission-denied", "ben can't read it before he scans");
await front(ann);
await ann.goto(link.replace("?mock&", "?mock&as=ann&")); await ann.waitForTimeout(1600);
ok(await ann.locator("#scrTour").isVisible() && /You're in\. Waiting for/.test(await text(ann, "#tBody")), "ann scanned: " + (await text(ann, "#tBody")).replace(/\s+/g, " ").slice(0, 90));
await front(owner); await owner.waitForTimeout(400);
ok(/Ann joined · 3 in/.test(await text(owner, ".cn-ov")), "the QR says who joined");
await front(ben);
await ben.goto(link.replace("?mock&", "?mock&as=ben&")); await ben.waitForTimeout(1600);
ok(await ben.locator("#scrTour").isVisible(), "ben scanned and is in");
await front(owner);
await owner.locator(".cn-ov button", { hasText: "Close" }).click(); await owner.waitForTimeout(400);
t = (await tours(owner))[0];
ok(t.players.length === 4 && t.uids.includes("mock-ann") && t.uids.includes("mock-ben") && t.names.includes("Ann"), "four in: " + JSON.stringify(t.names));
ok(/Who's in · 4/i.test(await text(owner, "#tBody")), "the lobby shows four");

// Ann's Play has the card.
await front(ann);
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(300);
ok(/tournament · you're in/.test(await text(ann, "#tourCards")) && /Entries open · 4 in/.test(await text(ann, "#tourCards")), "ann's card: " + (await text(ann, "#tourCards")).replace(/\s+/g, " "));

// Ben can't change the settings or start it.
ok(await tryC(ben, (c, id) => c.patch("tournaments/" + id, { race: { w: 9 } }), t.id) === "permission-denied", "ben can't change the race");

// Draw and start: the draw first, a redraw, then Start.
await front(owner);
await owner.locator("#tFoot button.primary").click(); await owner.waitForTimeout(300);
ok(/The draw/.test(await text(owner, last + " h2")) && (await owner.locator(last + " .reclist li").count()) === 2, "the draw: " + (await text(owner, last + " .reclist")).replace(/\s+/g, " · "));
await sheetButton(owner, "Redraw").click(); await owner.waitForTimeout(300);
ok(/The draw/.test(await text(owner, last + " h2")), "Redraw shows it again");
await sheetButton(owner, "Start").click(); await owner.waitForTimeout(500);
t = (await tours(owner))[0];
ok(t.status === "live" && t.seeds.length === 4 && t.startedAt > 0, "live, drawn: " + JSON.stringify(t.seeds));
ok(/Winners' side/i.test(await text(owner, "#tBody")) && /to play · race to 4/i.test(await text(owner, "#tBody")), "the round-by-round page");
await shot(owner, "tournament-live");

// Eve connects with the owner after the draw: it has started.
const eve = await tab(ctx, R + "?mock&as=eve", "eve");
const code = await C(owner, c => c.account.invite());
await front(eve);
await eve.goto(R + `?mock&as=eve&g=t_${t.id}&i=` + code); await eve.waitForTimeout(1600);
ok(/This tournament has started/.test(await text(eve, last + " h2")), "eve: " + await text(eve, last + " h2"));
await sheetButton(eve, "OK").click();
await front(owner);

// The organiser enters results: the first match waiting to be played, each time.
async function enter(p, { wo = false, loser = 1 } = {}){
  const row = p.locator("#tBody .fx", { hasText: "to play" }).first();
  if(!(await row.count())){ await shot(p, "tournament-stuck"); throw new Error("no match to play on screen: " + (await text(p, "#tBody")).replace(/\s+/g, " ").slice(0, 400)); }
  await row.click({ timeout: 5000 }); await p.waitForTimeout(250);
  if(!(await p.locator(last + " .tstep").count())){ await shot(p, "tournament-nosheet"); throw new Error("the match's sheet didn't open: " + (await text(p, "#tBody")).replace(/\s+/g, " ").slice(0, 500)); }
  if(wo){ await sheetButton(p, "Walkover to").click(); await p.waitForTimeout(400); return; }
  const steps = p.locator(last + " .tstep");
  const sheets = await p.locator("body > .scrim").count();
  for(let i = 0; i < 4; i++) await steps.nth(0).locator("button", { hasText: "+" }).click({ timeout: 4000 }).catch(async e => {
    throw new Error(`the winner's + wouldn't click (${sheets} scrims; row: ${await row.innerText().catch(() => "?")}): ` + (await p.locator(last).evaluate(n => n.outerHTML)).slice(0, 2500));
  });
  for(let i = 0; i < loser; i++) await steps.nth(1).locator("button", { hasText: "+" }).click({ timeout: 4000 }).catch(async e => {
    throw new Error("the loser's + wouldn't click: " + (await p.locator(last).evaluate(n => n.outerHTML)).slice(0, 1500));
  });
  await sheetButton(p, "Save").click(); await p.waitForTimeout(400);
}
await enter(owner);
t = (await tours(owner))[0];
const first = Object.keys(t.results)[0];
ok(Object.keys(t.results).length === 1 && t.results[first].a === 4 && t.results[first].b === 1 && t.results[first].by === "mock-uid", "a result: " + first + " " + JSON.stringify(t.results[first]));
// Clear it again: nothing depends on it yet.
await owner.locator("#tBody .seg button", { hasText: "Winners' side" }).click(); await owner.waitForTimeout(200);
await owner.locator("#tBody .fx", { hasText: "entered by" }).first().click(); await owner.waitForTimeout(250);
await hold(owner, last + " button.hold"); await owner.waitForTimeout(500);
t = (await tours(owner))[0];
ok(!t.results[first], "cleared: " + JSON.stringify(Object.keys(t.results)));
await enter(owner, { loser: 2 });
await enter(owner, { wo: true });
t = (await tours(owner))[0];
ok(Object.keys(t.results).length === 2 && Object.values(t.results).some(r => r.wo === true && r.a === 0 && r.b === 0), "two results, one a walkover");
await enter(owner);                       // the winners' side final
t = (await tours(owner))[0];
// Round 1 can't be changed now: a later match depends on it.
await owner.locator("#tBody .seg button", { hasText: "Winners' side" }).click(); await owner.waitForTimeout(200);
await owner.locator("#tBody .seg button", { hasText: "Round 1" }).click(); await owner.waitForTimeout(200);
await owner.locator("#tBody .fx", { hasText: "entered by" }).first().click(); await owner.waitForTimeout(250);
ok(/Clear that one first/.test(await text(owner, last)), "a result a later match depends on can't change");
await sheetButton(owner, "OK").click(); await owner.waitForTimeout(200);

// Ben, an entrant, can't write a result in Session 2.
ok(await tryC(ben, (c, id) => c.patch("tournaments/" + id, { "results.L1-1": { ids: ["x", "y"], a: 4, b: 0, w: "a", by: "mock-ben", at: 1 } }), t.id) === "permission-denied",
  "ben can't enter a result yet (Session 3)");

// Play it out: losers' side, then the final (and a decider if the losers' side wins).
for(let i = 0; i < 4 && (await tours(owner))[0].status === "live"; i++){
  if(!(await owner.locator("#tBody .fx", { hasText: "to play" }).count())){
    for(const s of ["Losers' side", "Winners' side"]){
      await owner.locator("#tBody .seg button", { hasText: s }).first().click(); await owner.waitForTimeout(200);
      if(await owner.locator("#tBody .fx", { hasText: "to play" }).count()) break;
    }
  }
  await enter(owner);
}
t = (await tours(owner))[0];
ok(t.status === "done" && t.endedAt > 0, "done when the last match is in: " + t.status + ", " + Object.keys(t.results).join(" "));
ok(/ won/.test(await text(owner, "#tBody .sumwin")) && /Standings/i.test(await text(owner, "#tBody")), "the page leads with the winner: " + await text(owner, "#tBody .sumwin"));
const places = (await owner.locator("#tBody .rows .tplace").allInnerTexts()).map(s => s.trim());
ok(JSON.stringify(places) === JSON.stringify(["1st", "2nd", "3rd", "4th"]), "standings: " + places.join(", "));
await shot(owner, "tournament-done");
await front(ann); await ann.waitForTimeout(400);
ok(!/you're in/.test(await text(ann, "#tourCards")), "ann's Play card goes once it's done");
await ann.click("#toursBtn"); await ann.waitForTimeout(300);
ok(/Won by/i.test(await text(ann, "#tourList")), "ann's Tournaments page: " + (await text(ann, "#tourList")).replace(/\s+/g, " "));

// Export carries it.
const exp = await owner.evaluate(async () => {
  const { cloud } = await import("/shared/cloud.js");
  return (await cloud.list("tournaments")).length;
});
ok(exp === 1, "the owner's list has it for Export");

// A second tournament: discard it in the lobby; a friend can leave before the draw.
await front(owner);
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(200);
await owner.click("#toursBtn"); await owner.waitForTimeout(200);
await owner.click("#tourStartBtn"); await owner.waitForTimeout(200);
await owner.locator("#tnChips button", { hasText: "Ann" }).click(); await owner.waitForTimeout(150);
await owner.click("#tnOpen"); await owner.waitForTimeout(500);
let t2 = (await tours(owner)).find(x => x.status === "open");
ok(t2 && t2.uids.includes("mock-ann") && t2.players.length === 2, "a friend picked at Start goes in: " + JSON.stringify(t2 && t2.uids));
ok(await tryC(ann, (c, id) => c.patch("tournaments/" + id, { players: ["mock-uid"], names: ["Mock"], uids: ["mock-uid"] }), t2.id) === "allowed", "ann may leave before the draw");
await owner.locator("#tBody button.warnbtn").scrollIntoViewIfNeeded(); await hold(owner, "#tBody button.warnbtn"); await owner.waitForTimeout(500);
ok(!(await tours(owner)).some(x => x.id === t2.id) && await owner.locator("#scrTours").isVisible(), "Hold to discard deletes it");

await b.close(); srv.close();
summary();
