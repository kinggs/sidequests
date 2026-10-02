// Session 8 step 3: two phones score one match. Ann starts an 11-Point-Nine friendly against Cat,
// her friend; Cat opens it from her Home card and they score it alternately, tap by tap. The
// saved match must equal the same taps on one phone. Then Cat is held offline while Ann makes five
// changes, and taps twice herself: she comes back without rewinding anything. A race lost by one
// tap puts that tap back. The echo strip's Undo undoes the other phone's change. Presence shows.
//
//   node shared/proofs/rack-it-two-phones.mjs
import { ok, summary, serve, browser, tab, C, text, store, matchesOf, RACKS, hold } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const BOOK = ["_updatedAt", "rev", "log", "phones", "startedAt", "endedAt", "at"];
const mask = x => Array.isArray(x) ? x.map(mask) : x && typeof x === "object"
  ? Object.fromEntries(Object.entries(x).filter(([k]) => !BOOK.includes(k)).map(([k, v]) => [k, mask(v)]).sort(([p], [q]) => p < q ? -1 : 1)) : x;

async function tapBall(p, side, n){
  await p.bringToFront();
  await p.click(side === "a" ? "#sideA" : "#sideB");
  await p.click(`#rack button[aria-label="Ball ${n}"]`);
  await p.waitForTimeout(350);
}
const live = async p => (await matchesOf(p)).find(x => x.status === "live");
const doneCard = p => p.locator("#done").isVisible();
async function startRack2(p){ await p.waitForTimeout(500); if (await doneCard(p)) await p.click("#doneNext"); await p.waitForTimeout(500); }
async function saveMatch(p){
  await p.waitForTimeout(500);
  for (let k = 0; k < 3 && await doneCard(p) && !/Save match/.test(await p.locator("#doneNext").innerText()); k++){ await p.click("#doneNext"); await p.waitForTimeout(300); }
  if (!(await doneCard(p))) { await hold(p, "#end"); await p.waitForTimeout(400); }
  await p.click("#doneNext"); await p.waitForTimeout(800);
}

// ---- one phone: the taps, to compare against ----
const solo = await tab(ctx, R + "?mock=reset&as=ann", "ann-solo");
async function connectAnnCat(ann, cat){
  const code = await C(ann, c => c.account.invite());
  await cat.goto(R + "?mock&as=cat&i=" + code); await cat.waitForTimeout(800);
  await cat.locator(".cn-ov button", { hasText: "Done" }).click(); await cat.waitForTimeout(300);
}
const solocat = await tab(ctx, R + "?mock&as=cat", "cat-solo");
await connectAnnCat(solo, solocat);
await solocat.close();
async function start(ann){
  await ann.bringToFront();
  await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(300);
  await ann.locator("#whoChips button", { hasText: "Cat" }).click(); await ann.waitForTimeout(250);
  await ann.click("#startBtn"); await ann.waitForTimeout(600);
}
await start(solo);
for (const [side, n] of RACKS[0]) await tapBall(solo, side, n);
await startRack2(solo);
for (const [side, n] of RACKS[1]) await tapBall(solo, side, n);
await saveMatch(solo);
const one = mask((await matchesOf(solo)).find(x => x.status === "done"));
await solo.close();

// ---- two phones, alternately ----
const ann = await tab(ctx, R + "?mock=reset&as=ann", "ann");
const cat = await tab(ctx, R + "?mock&as=cat", "cat");
await connectAnnCat(ann, cat);
await start(ann);
await cat.goto(R + "?mock&as=cat"); await cat.waitForTimeout(1000);
ok(/Ann's match · you're in/.test(await text(cat, "#inCard")), "cat's Home card is up");
await cat.click("#inOpen"); await cat.waitForTimeout(700);
ok(await cat.locator("#scrLive").isVisible() && !(await cat.locator("#controls").getAttribute("class")).includes("watching"), "Open puts cat on the live screen, scoring");
await ann.waitForTimeout(400);
ok(await ann.locator("#presence").isVisible() && /Cat/.test(await ann.locator("#presence").innerText()), "ann sees Cat's phone: " + (await text(ann, "#presence")));
ok(await cat.locator("#presence").isVisible() && /Ann/.test(await cat.locator("#presence").innerText()), "cat sees Ann's phone: " + (await text(cat, "#presence")));

let turn = 0;
const phone = () => (turn++ % 2 ? cat : ann);
for (const [side, n] of RACKS[0]) await tapBall(phone(), side, n);
await ann.waitForTimeout(500);
await startRack2(phone());
await (turn % 2 ? cat : ann).waitForTimeout(300);
// The other phone's rack-end card goes when the next rack starts.
ok(!(await doneCard(ann)) && !(await doneCard(cat)), "neither phone is left on Rack 1's card");
for (const [side, n] of RACKS[1].slice(0, 3)) await tapBall(phone(), side, n);

// The echo strip: Ann's last tap shows on Cat's phone, with Undo.
await cat.waitForTimeout(200);
ok(await cat.locator("#echo").isVisible() && /Ann/.test(await text(cat, "#echo")), "cat's echo strip: " + (await text(cat, "#echo")));

// Offline: Cat is held offline; Ann makes five changes; Cat taps twice, stale.
await C(cat, c => c.network(false));
const annTaps = RACKS[1].slice(3, 8);   // five changes; ball 9 stays on the table for now
for (const [side, n] of annTaps) await tapBall(ann, side, n);
const atAnn = await live(ann);
await cat.bringToFront();
await cat.click("#sideA"); await cat.click('#rack button[aria-label="Ball 1"]'); await cat.waitForTimeout(150);
await cat.click('#rack button[aria-label="Ball 2"]'); await cat.waitForTimeout(150);
await C(cat, c => c.network(true)); await cat.waitForTimeout(1200);
const atServer = await live(ann);
ok(JSON.stringify(mask(atServer)) === JSON.stringify(mask(atAnn)), "nothing was rewound: the server is as Ann left it");
ok(/5 changes while you were away/.test(await text(cat, "#echo")), "cat's echo: " + (await text(cat, "#echo")));
ok(/didn't count/.test(await cat.locator(".toast").last().innerText().catch(() => "")), "cat is told her taps didn't count");
const catBalls = await cat.evaluate(() => [...document.querySelectorAll("#rack .ball")].map(b => b.className).join("|"));
const annBalls = await ann.evaluate(() => [...document.querySelectorAll("#rack .ball")].map(b => b.className).join("|"));
ok(catBalls === annBalls, "cat's rack now shows what Ann's does");

// Undo from the echo strip: Ann's last change undone by Cat, as a normal write.
await ann.bringToFront(); await ann.click('#rack button[aria-label="Ball 1"]'); await ann.waitForTimeout(400);
const b1 = (await live(ann)).racks[2].balls["1"];
ok(!!(await cat.locator("#echo button", { hasText: "Undo" }).count()), "cat's echo offers Undo: " + (await text(cat, "#echo")));
await cat.bringToFront(); await cat.locator("#echo button", { hasText: "Undo" }).click(); await cat.waitForTimeout(500);
const b1after = (await live(ann)).racks[2].balls["1"];
ok(b1after !== b1, `Undo put ball 1 back (${b1} → ${b1after})`);
await ann.waitForTimeout(300);

// A race: both phones tap at once, on different balls. Cat's loses and is put back.
await C(cat, c => c.network(false));
await cat.click('#rack button[aria-label="Ball 1"]'); await cat.waitForTimeout(150);
const catWanted = await cat.evaluate(() => document.querySelector('#rack button[aria-label="Ball 1"]').className);
await ann.bringToFront(); await ann.click("#sideB"); await ann.waitForTimeout(400);
await C(cat, c => c.network(true)); await cat.waitForTimeout(1200);
const raced = await live(ann);
ok(raced.turn === "b" && raced.racks[2].balls["1"] === "a", "both taps stand: Ann's turn change, and Cat's ball 1 put back after it");
ok(catWanted.includes("claimed"), "…which is what Cat tapped");

// The match is saved on one phone; the other says so.
const soloRack2 = RACKS[1];
// Bring rack 2 to the same balls as the solo run (the offline and race taps left it there anyway).
const want = Object.fromEntries(soloRack2.map(([side, n]) => [String(n), side]));
const have = (await live(ann)).racks[2].balls;
for (const [n, side] of Object.entries(want)) if (have[n] !== side){
  await ann.bringToFront();
  for (let k = 0; k < 3 && (await live(ann)).racks[2].balls[n] !== side; k++){
    await ann.click(side === "a" ? "#sideA" : "#sideB"); await ann.click(`#rack button[aria-label="Ball ${n}"]`); await ann.waitForTimeout(300);
  }
}
await saveMatch(ann);
await cat.waitForTimeout(800);
ok(/saved it/.test(await text(cat, "#done")), "cat's phone says Ann saved it: " + (await text(cat, "#doneBody")).slice(0, 80));
const two = mask((await matchesOf(ann)).find(x => x.status === "done"));
const pick = m => JSON.stringify({ racks: Object.fromEntries(Object.entries(m.racks).map(([k, r]) => [k, r.balls])), totals: m.totals, status: m.status, rated: m.rated });
ok(pick(two) === pick(one), "the two-phone match equals the one-phone match\n     " + pick(two) + (pick(two) === pick(one) ? "" : "\n ONE " + pick(one)));
const log = Object.values((await matchesOf(ann)).find(x => x.status === "done").log);
ok(log.some(e => e.by === "mock-cat") && log.some(e => e.by === "mock-ann") && log.every(e => e.by), `the log names who made each of its ${log.length} changes`);
await b.close(); srv.close();
summary();
