// Rack It 2.28.0, Tournaments Session 2 (rack-it/TOURNAMENT.md §7): a tournament the organiser
// runs. The owner starts a double elimination with Dan, a guest; changes a setting in the lobby;
// Ann and Ben join by the Tournament QR; the draw (with a redraw) and Start; the organiser enters
// every result, a walkover among them, and clears one, and is stopped changing one a later match
// depends on; the final; standings. Ann's Play has the card; Ben can't write a result; Eve, who
// connects after the draw, is told it has started; a stranger reads nothing. No page errors.
//
// 2.29.0, Session 3 (§3.5, §3.7): a second tournament where the players enter their own results
// on their own phones. Ann enters hers; Ben says Not right; the owner lets it stand; Ann corrects
// her own; Ben, out, writes a stale result for the final, which the draw ignores and the owner
// clears; Ann enters the final; the owner's phone finishes it and rates the two matches between
// accounts (not the guest's), once; a rated result can't change.
//
// 2.30.0, Session 5 (§3.8): an entrant opens on Your path, the organiser on the whole draw once
// they aren't playing; a ready match's sheet says where the winner goes, and that row jumps the
// draw there with a pulse; the draw moves on after a save; Ann's Your match button brings her back.
//
//   node shared/proofs/rack-it-tournament.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, hold, shot, matchesOf, ratingsOf } from "./h.mjs";
import * as B from "../../rack-it/bracket.js";
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
ok(/Your path/.test(await text(owner, "#tBody .seg button[aria-pressed=true]")) && /Round 1 · now/i.test(await text(owner, "#tBody .tpath")),
  "an entrant opens on Your path: " + (await text(owner, "#tBody .tpath")).replace(/\s+/g, " ").slice(0, 120));
await shot(owner, "tournament-live");

// Eve connects with the owner after the draw: it has started.
const eve = await tab(ctx, R + "?mock&as=eve", "eve");
const code = await C(owner, c => c.account.invite());
await front(eve);
await eve.goto(R + `?mock&as=eve&g=t_${t.id}&i=` + code); await eve.waitForTimeout(1600);
ok(/This tournament has started/.test(await text(eve, last + " h2")), "eve: " + await text(eve, last + " h2"));
await sheetButton(eve, "OK").click();
await front(owner);

// The organiser enters results: the first match waiting to be played, each time, in the draw.
const toDraw = async p => { const b = p.locator("#tBody .seg button", { hasText: "Whole draw" }); if(await b.count()){ await b.click(); await p.waitForTimeout(200); } };
const curCard = (p, words) => p.locator("#tBody .tcol.cur .mc", { hasText: words });
async function enter(p, { wo = false, loser = 1 } = {}){
  await toDraw(p);
  const row = curCard(p, "to play").first();
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
await curCard(owner, "played").first().click(); await owner.waitForTimeout(250);
ok(/Entered by/.test(await text(owner, last)) && await owner.locator(last + " .twn").count() === 1, "a played match's sheet: entered by, and where next");
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
while(await owner.locator('#tBody .tround button[aria-label="The round before"]').isEnabled()){ await owner.locator('#tBody .tround button[aria-label="The round before"]').click(); await owner.waitForTimeout(200); }
await curCard(owner, "played").first().click(); await owner.waitForTimeout(250);
await sheetButton(owner, "Change").click(); await owner.waitForTimeout(250);
ok(/Clear that one first/.test(await text(owner, last)), "a result a later match depends on can't change");
await sheetButton(owner, "OK").click(); await owner.waitForTimeout(200);

// Ben, an entrant, can't write a result in Session 2.
ok(await tryC(ben, (c, id) => c.patch("tournaments/" + id, { "results.L1-1": { ids: ["x", "y"], a: 4, b: 0, w: "a", by: "mock-ben", at: 1 }, entry: "L1-1" }), t.id) === "permission-denied",
  "ben can't enter a result for a match he isn't in");

// Play it out: losers' side, then the final (and a decider if the losers' side wins).
for(let i = 0; i < 4 && (await tours(owner))[0].status === "live"; i++){
  await toDraw(owner);
  if(!(await curCard(owner, "to play").count())){
    for(const s of ["Losers' side", "Winners' side"]){
      await owner.locator("#tBody .seg button", { hasText: s }).first().click(); await owner.waitForTimeout(200);
      if(await curCard(owner, "to play").count()) break;
    }
  }
  await enter(owner);
}
t = (await tours(owner))[0];
await owner.waitForTimeout(600);
t = (await tours(owner))[0];
ok(t.status === "done" && t.endedAt > 0 && t.ratedBy === "mock-uid", "done when the last match is in, claimed by the organiser's phone: " + t.status + ", " + Object.keys(t.results).join(" "));
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

// ---- Session 3: players enter their own results ----
await front(owner);
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(200);
await owner.click("#toursBtn"); await owner.waitForTimeout(200);
await owner.click("#tourStartBtn"); await owner.waitForTimeout(200);
for(const n of ["Ann", "Ben", "Dan"]){ await owner.locator("#tnChips button", { hasText: n }).first().click(); await owner.waitForTimeout(150); }
await owner.click("#tnOpen"); await owner.waitForTimeout(600);
let t3 = (await tours(owner)).find(x => x.status === "open");
ok(t3 && t3.players.length === 4 && t3.uids.length === 3, "a third tournament, four in, three accounts: " + JSON.stringify(t3 && t3.uids));
await owner.locator("#tFoot button.primary").click(); await owner.waitForTimeout(300);
await sheetButton(owner, "Start").click(); await owner.waitForTimeout(500);
// A known draw, so Ann plays Ben first and the owner plays Dan.
const dan = t3.players.find(x => x.startsWith("g_"));
await C(owner, (c, a) => c.patch("tournaments/" + a.id, { seeds: a.seeds }), { id: t3.id, seeds: ["mock-uid", "mock-ann", "mock-ben", dan] });
await owner.waitForTimeout(400);
t3 = (await tours(owner)).find(x => x.id === t3.id);
const st3 = B.state(t3), annMatch = st3.find(f => f.a === "mock-ann" || f.b === "mock-ann");
ok(annMatch && [annMatch.a, annMatch.b].includes("mock-ben") && annMatch.status === "ready", "Ann v Ben is ready: " + (annMatch && annMatch.key));
const annIsA = annMatch.a === "mock-ann";
// The open stepper sheet: the first stepper is the match's first player.
async function fill(p, mine, theirs, iAmA){
  const steps = p.locator(last + " .tstep");
  for(let i = 0; i < mine; i++) await steps.nth(iAmA ? 0 : 1).locator("button", { hasText: "+" }).click();
  for(let i = 0; i < theirs; i++) await steps.nth(iAmA ? 1 : 0).locator("button", { hasText: "+" }).click();
  await sheetButton(p, "Save").click(); await p.waitForTimeout(500);
}
const openT3 = async p => { await front(p); await p.click('.tabbar button[data-tab="play"]'); await p.waitForTimeout(200);
  await p.locator("#tourCards button").first().click(); await p.waitForTimeout(500); };

// Ann enters her own result from Your match.
await front(ann);
await ann.goto(R + "?mock&as=ann"); await ann.waitForTimeout(900);
await openT3(ann);
ok(/Semi-final · now/i.test(await text(ann, "#tBody .tpath")) && /Ben/.test(await text(ann, "#tBody .tps.now")), "ann's path: " + (await text(ann, "#tBody .tpath")).replace(/\s+/g, " "));
await ann.locator("#tBody .tpath button", { hasText: "Enter the result" }).click(); await ann.waitForTimeout(300);
ok(!(await ann.locator(last + " button", { hasText: "Walkover" }).count()), "a player's sheet has no walkovers");
await fill(ann, 3, 1, annIsA);
t3 = (await tours(owner)).find(x => x.id === t3.id);
let r3 = t3.results[annMatch.key];
ok(r3 && r3.by === "mock-ann" && t3.entry === annMatch.key && Math.max(r3.a, r3.b) === 3, "ann's result stands at once, entered by her: " + JSON.stringify(r3));
ok(/You entered 3–1 to you/.test(await text(ann, "#tBody")), "ann's card says she entered it");

// Ben says Not right.
await front(ben);
await ben.goto(R + "?mock&as=ben"); await ben.waitForTimeout(900);
await openT3(ben);
ok(/Ann entered 3–1 to Ann/.test(await text(ben, "#tBody")), "ben's card: " + (await text(ben, "#tBody")).replace(/\s+/g, " "));
await ben.locator("#tBody .resume button", { hasText: "Not right" }).click(); await ben.waitForTimeout(250);
await sheetButton(ben, "Not right").click(); await ben.waitForTimeout(500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(t3.results[annMatch.key].wrongBy === "mock-ben", "flagged: " + JSON.stringify(t3.results[annMatch.key]));
ok(/You said not right/.test(await text(ben, "#tBody")), "ben's page shows it flagged");
await shot(ben, "tournament-not-right");
ok(await tryC(ann, (c, a) => c.patch("tournaments/" + a.id, { ["results." + a.k]: { ...a.r, a: 3, b: 0, w: a.r.w } , entry: a.k }), { id: t3.id, k: annMatch.key, r: (({ wrongBy, ...x }) => x)(t3.results[annMatch.key]) }) === "permission-denied",
  "ann can't change it while it's disputed");

// The owner lets it stand.
await openT3(owner);
ok(/Ben says not right/.test(await text(owner, "#tBody")), "the owner sees the dispute: " + (await text(owner, "#tBody .tdispute")).replace(/\s+/g, " "));
await shot(owner, "tournament-settle");
await owner.locator("#tBody .tdispute button", { hasText: "Settle" }).click(); await owner.waitForTimeout(300);
await sheetButton(owner, "It stands").click(); await owner.waitForTimeout(500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(!t3.results[annMatch.key].wrongBy && t3.results[annMatch.key].by === "mock-ann", "it stands: " + JSON.stringify(t3.results[annMatch.key]));

// Ann corrects her own: 3–2.
await front(ann); await ann.waitForTimeout(400);
await ann.locator("#tBody .resume button", { hasText: "Change" }).click(); await ann.waitForTimeout(300);
await ann.locator(last + " .tstep").nth(annIsA ? 1 : 0).locator("button", { hasText: "+" }).click();
await sheetButton(ann, "Save").click(); await ann.waitForTimeout(500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(Math.min(t3.results[annMatch.key].a, t3.results[annMatch.key].b) === 2, "ann corrected hers to 3–2: " + JSON.stringify(t3.results[annMatch.key]));

// The owner beats Dan; the final is the owner v Ann.
await front(owner); await owner.waitForTimeout(300);
await owner.locator("#tBody .seg button", { hasText: "Your path" }).click(); await owner.waitForTimeout(200);
await owner.locator("#tBody .tpath button", { hasText: "Enter the result" }).click(); await owner.waitForTimeout(300);
const ownerMatch = B.state(t3).find(f => f.a === "mock-uid" || f.b === "mock-uid");
await fill(owner, 3, 0, ownerMatch.a === "mock-uid");
t3 = (await tours(owner)).find(x => x.id === t3.id);
const FK = B.state(t3).find(f => f.name === "Final").key;
ok(B.state(t3).find(f => f.key === FK).status === "ready", "the final is ready: " + FK);

// Ben, out now, writes a stale result for the final: the rules can't tell, the draw ignores it.
ok(await tryC(ben, (c, a) => c.patch("tournaments/" + a.id, { ["results." + a.k]: { ids: ["mock-ben", "mock-uid"], a: 3, b: 0, w: "a", by: "mock-ben", at: Date.now() }, entry: a.k }), { id: t3.id, k: FK }) === "allowed",
  "ben's stale write lands (the rules can't work out the draw)");
await front(owner); await owner.waitForTimeout(500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(B.ignored(t3).includes(FK) && t3.status === "live", "the draw ignores it, and it doesn't finish");
ok(/doesn't fit the draw/.test(await text(owner, "#tBody")), "the owner is told: " + (await text(owner, "#tBody .warn >> nth=0")).replace(/\s+/g, " "));
await toDraw(owner);
await curCard(owner, "doesn't fit").first().click(); await owner.waitForTimeout(300);
await hold(owner, last + " button.hold"); await owner.waitForTimeout(500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(!t3.results[FK], "the owner cleared it");

// Ann enters the final; the owner's phone finishes it and rates it.
const before = await ratingsOf(owner);
await front(ann); await ann.waitForTimeout(400);
await ann.locator("#tBody .tpath button", { hasText: "Enter the result" }).click(); await ann.waitForTimeout(300);
const fin = B.state(t3).find(f => f.key === FK);
await fill(ann, 3, 0, fin.a === "mock-ann");
await front(owner); await owner.waitForTimeout(1500);
t3 = (await tours(owner)).find(x => x.id === t3.id);
ok(t3.status === "done" && t3.ratedBy === "mock-uid" && t3.ratedAt > 0, "finished and claimed by the owner's phone: " + t3.status);
const rated = (await matchesOf(owner)).filter(m => m.tournament === t3.id);
ok(rated.length === 2 && rated.every(m => m.rated === true && m.status === "done" && m.entered === true && m.ratedAt >= t3.ratedAt)
  && rated.some(m => m.fixture === FK) && rated.some(m => m.fixture === annMatch.key),
  "two rated matches, not the guest's: " + rated.map(m => m.id).join(", "));
ok(Object.keys(t3.rated || {}).length === 2, "the tournament notes both as rated");
const afterR = await ratingsOf(owner);
ok(afterR["mock-ann"] && afterR["mock-ann"].sessions === ((before["mock-ann"] && before["mock-ann"].sessions) || 0) + 2, "ann's rating moved twice: " + JSON.stringify(afterR["mock-ann"]));
ok(/Rated: 2 matches/.test(await text(owner, "#tBody")), "the page says it's rated");
await shot(owner, "tournament-rated");
// Not twice: seeing it again rates nothing more.
await owner.reload(); await owner.waitForTimeout(1200);
ok((await matchesOf(owner)).filter(m => m.tournament === t3.id).length === 2 && (await ratingsOf(owner))["mock-ann"].sessions === afterR["mock-ann"].sessions, "rated once only");
// A rated result can't change, even for the organiser in the rules (the owner's role aside).
ok(await tryC(ben, (c, a) => c.patch("tournaments/" + a.id, { ["results." + a.k + ".wrongBy"]: "mock-ben", entry: a.k }), { id: t3.id, k: FK }) === "permission-denied", "nobody disputes a rated result");
// Ann's summary of the final.
await front(ann); await ann.goto(R + "?mock&as=ann"); await ann.waitForTimeout(900);
await ann.click('.tabbar button[data-tab="matches"]'); await ann.waitForTimeout(400);
const rowCount = await ann.locator("#matchList button, .hrow").count();
ok(rowCount > 0, "ann's Matches list has rows");
await ann.locator(".hrow").first().click(); await ann.waitForTimeout(400);
ok(/rated as part of/.test(await text(ann, "#sumZargo")), "the summary: " + await text(ann, "#sumZargo"));

// ---- Session 5: the bracket view ----
// The owner runs one without playing: Ann has the bye; Ben plays Dan.
await front(owner);
await owner.click('.tabbar button[data-tab="play"]'); await owner.waitForTimeout(200);
await owner.click("#toursBtn"); await owner.waitForTimeout(200);
await owner.click("#tourStartBtn"); await owner.waitForTimeout(200);
await owner.locator("#tnChips button", { hasText: "(you)" }).first().click(); await owner.waitForTimeout(150);
for(const n of ["Ann", "Ben", "Dan"]){ await owner.locator("#tnChips button", { hasText: n }).first().click(); await owner.waitForTimeout(150); }
await owner.click("#tnOpen"); await owner.waitForTimeout(600);
let t4 = (await tours(owner)).find(x => x.status === "open");
ok(t4 && t4.players.length === 3 && !t4.players.includes("mock-uid"), "a fourth, run without playing: " + JSON.stringify(t4 && t4.players));
await owner.locator("#tFoot button.primary").click(); await owner.waitForTimeout(300);
await sheetButton(owner, "Start").click(); await owner.waitForTimeout(500);
const dan4 = t4.players.find(x => x.startsWith("g_"));
await C(owner, (c, a) => c.patch("tournaments/" + a.id, { seeds: a.seeds }), { id: t4.id, seeds: ["mock-ann", "mock-ben", dan4] });
await owner.waitForTimeout(500);
ok(!(await owner.locator("#tBody .seg button", { hasText: "Your path" }).count()) && await owner.locator("#tBody .tdraw").count() === 1,
  "an organiser who isn't playing opens on the whole draw");
ok(/Semi-finals · 1 of 2/i.test(await text(owner, "#tBody .tround")) && /then the final/.test(await text(owner, "#tBody .tround")), "the round row: " + (await text(owner, "#tBody .tround")).replace(/\s+/g, " "));
ok(await owner.locator("#tBody .tcol.peek .mc").count() === 1 && await owner.locator("#tBody .tl").count() >= 3, "the final peeks in, joined by lines");
ok(/bye/i.test(await text(owner, "#tBody .tcol.cur")) && /No opponent/.test(await text(owner, "#tBody .tcol.cur")), "Ann's bye card");
await shot(owner, "tournament-draw");
// A ready match: the steppers, with where the winner goes; that row jumps the draw there.
await curCard(owner, "to play").first().click(); await owner.waitForTimeout(300);
ok(await owner.locator(last + " .tstep").count() === 2 && /The winner plays\s*Ann, in the final/.test(await text(owner, last + " .twn")) && /is out, 2nd–3rd|is out, 3rd/.test(await text(owner, last + " .twn")),
  "the sheet says where next: " + (await text(owner, last + " .twn")).replace(/\s+/g, " "));
await shot(owner, "tournament-sheet");
await owner.locator(last + " .twnr.go", { hasText: "The winner plays" }).click(); await owner.waitForTimeout(400);
ok(/^Final/i.test((await text(owner, "#tBody .tround b")).trim()) && await owner.locator("#tBody .mc.pulse").count() === 1, "the jump: the draw moves to the final and pulses it");
// Back, enter Ben's win, and the draw moves on to the final.
await owner.locator('#tBody .tround button[aria-label="The round before"]').click(); await owner.waitForTimeout(250);
await curCard(owner, "to play").first().click(); await owner.waitForTimeout(300);
const semi = B.state((await tours(owner)).find(x => x.id === t4.id)).find(f => f.status === "ready");
await fill(owner, 3, 1, semi.a === "mock-ben");
ok(/^Final/i.test((await text(owner, "#tBody .tround b")).trim()) && /to play/i.test(await text(owner, "#tBody .tcol.cur")), "after a save the draw moves to the next match to play: " + (await text(owner, "#tBody .tround")).replace(/\s+/g, " ") + " / " + (await text(owner, "#tBody .tcol.cur")).replace(/\s+/g, " "));
// Ann's path: her bye, then the final now; the whole draw; the Your match button.
await front(ann); await ann.goto(R + "?mock&as=ann"); await ann.waitForTimeout(900);
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(200);
await ann.locator("#tourCards button").first().click(); await ann.waitForTimeout(600);
const annSteps = await ann.locator("#tBody .tps").allInnerTexts();
ok(annSteps.length === 2 && /bye/i.test(annSteps[0]) && /Final · now/i.test(annSteps[1]) && /to play · you/i.test(annSteps[1]),
  "ann's path: " + annSteps.map(x => x.replace(/\s+/g, " ")).join(" | "));
ok(await ann.locator("#tBody .tpath .mc.you").count() === 1, "her match to play is the one card with the accent outline");
await shot(ann, "tournament-path");
await toDraw(ann);
ok(/^Final/i.test((await text(ann, "#tBody .tround b")).trim()) && await ann.locator("#tFab.hidden").count() === 1, "the draw opens on her match; no button needed: " + (await text(ann, "#tBody .tround")).replace(/\s+/g, " ") + " fab hidden " + await ann.locator("#tFab.hidden").count());
await ann.locator('#tBody .tround button[aria-label="The round before"]').click(); await ann.waitForTimeout(300);
ok(await ann.locator("#tFab:not(.hidden)").count() === 1, "her match off screen: the Your match button shows");
await shot(ann, "tournament-your-match");
await ann.locator("#tFab").click(); await ann.waitForTimeout(400);
ok(/^Final/i.test((await text(ann, "#tBody .tround b")).trim()) && await ann.locator("#tBody .mc.pulse").count() === 1, "it brings the draw back to her match");
// Anyone can open a played match's sheet; a reader gets no buttons to change it.
await ann.locator('#tBody .tround button[aria-label="The round before"]').click(); await ann.waitForTimeout(300);
await curCard(ann, "played").first().click(); await ann.waitForTimeout(300);
ok(/beat|drawn/.test(await text(ann, last)) && !(await ann.locator(last + " button", { hasText: "Change" }).count()), "ann reads Ben v Dan's sheet: " + (await text(ann, last)).replace(/\s+/g, " ").slice(0, 160));
await ann.keyboard.press("Escape");

await b.close(); srv.close();
summary();
