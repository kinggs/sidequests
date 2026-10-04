// Session 9 step 3: Zombie Dice on several phones.
//
//   node shared/proofs/zombie-dice-phones.mjs
//
// A. One phone alone reads as before: "Pass the phone to", no mirror, no presence.
// B. Three tabs (the owner, Mel and Ann, connected) play one whole game with Dan, the owner's guest.
//    Each plays its own turns on its own tab; the owner's tab plays Dan's. The others are mirrors;
//    a turn coming round says "Your turn"; the echo strip and presence show the other phones; every
//    tab ends on the same finish.
// C. The Game QR: Ben scans the owner's, says "I'm Eve" and takes the guest's seat; the owner's
//    phone says he joined.
import { ok, summary, serve, browser, tab, C, text, store, shot } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const Z = srv.base + "/zombie-dice/";
const gamesOf = async p => Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/zombie-dice/games/")).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const last = "body > .scrim:last-of-type .sheet";
const owner = await tab(ctx, Z + "?mock=reset", "owner");
const mel = await tab(ctx, Z + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, Z + "?mock&as=ann", "ann");
// Every ?mock tab shares one localStorage (KIT-HISTORY Session 7 note 9): this phone's game too.
const forgetHere = p => p.evaluate(() => localStorage.removeItem("zombie-dice.game"));
const goHome = async p => { await forgetHere(p); await p.reload(); await p.waitForTimeout(900); };

// Plays one turn on tab p: roll, turn the dice over, roll again while it's safe, then stop.
async function playTurn(p){
  await p.bringToFront();
  const card = p.locator(".done .moment > button.primary");
  if (await card.count()) { await card.click(); await p.waitForTimeout(150); }
  const before = (await gamesOf(owner)).find(x => x.id === gameId);
  const turnsBefore = (before.turns || []).length;
  for (let r = 0; r < 4; r++){
    await p.waitForFunction(() => !document.querySelector("#rollBtn").disabled, null, { timeout: 5000 });
    await p.click("#rollBtn"); await p.waitForTimeout(700);
    for (let k = 0; k < 3; k++){
      const d = p.locator(".tray .die.tapme").first();
      if (!(await d.count())) break;
      await d.click(); await p.waitForTimeout(120);
    }
    await p.waitForTimeout(150);
    const x = (await gamesOf(owner)).find(y => y.id === gameId);
    if ((x.turns || []).length > turnsBefore) { await p.waitForTimeout(calmShot); return x; }   // shot
    if (x.t.shots >= 2 || x.t.brains >= 3 || r === 3) break;
  }
  await p.click("#stopBtn"); await p.waitForTimeout(300);
  return (await gamesOf(owner)).find(y => y.id === gameId);
}
const calmShot = 1400;
let gameId = null;

// ---- A. one phone alone ----
await owner.bringToFront();
await owner.click("#guestBtn"); await owner.fill("#pk-guest", "Dan"); await owner.click('.sheet [data-k="addguest"]'); await owner.waitForTimeout(400);
await owner.click("#startBtn"); await owner.waitForTimeout(500);
const startCard = (await text(owner, ".done")).replace(/\s+/g, " ");
ok(/Pass the phone to/i.test(startCard) && /I'm Mock Player — go/.test(startCard), "one phone: the start card passes the phone, as before: " + startCard);
gameId = (await gamesOf(owner)).find(x => x.status === "live").id;
await playTurn(owner);
const turnCard = (await text(owner, ".done")).replace(/\s+/g, " ");
ok(/D Pass the phone to Dan/i.test(turnCard) && /I'm Dan — go/.test(turnCard), "…and after a turn, to the guest: " + turnCard);
ok(!(await owner.locator(".mirror").count()) && !(await owner.locator("#presence:visible").count()), "no mirror and no presence on one phone");
const solo = (await gamesOf(owner)).find(x => x.id === gameId);
ok(solo.rev && solo.rev.by === "mock-uid" && /banked|got shot/.test(solo.rev.say) && solo.phones && solo.phones["mock-uid"], "each write carries rev (say: \"" + solo.rev.say + "\") and the phone's presence");
await C(owner, (c, id) => c.delete("games/" + id), gameId);
await goHome(owner);

// ---- B. three phones ----
for (const [p, as] of [[mel, "mel&role=member"], [ann, "ann"]]){
  const code = await C(owner, c => c.account.invite());
  await p.goto(Z + "?mock&as=" + as + "&i=" + code); await p.waitForTimeout(800);
  await p.locator(".cn-ov button", { hasText: "Done" }).click(); await p.waitForTimeout(300);
}
await goHome(owner);
for (const name of ["Mel", "Ann", "Dan"]) await owner.locator("#pickChips button", { hasText: name }).click();
ok(/Mock.*Mel.*Ann.*Dan/s.test(await text(owner, "#order")), "the owner picks Mel, Ann and Dan: " + (await text(owner, "#order")));
await owner.click("#startBtn"); await owner.waitForTimeout(500);
gameId = (await gamesOf(owner)).find(x => x.status === "live").id;
const g0 = (await gamesOf(owner)).find(x => x.id === gameId);
ok(JSON.stringify(g0.uids) === '["mock-uid","mock-mel","mock-ann"]' && g0.players[3].startsWith("g_"), "the game: three accounts and a guest");
await owner.locator(".done .moment > button.primary").click(); await owner.waitForTimeout(200);

for (const p of [mel, ann]){
  await goHome(p);
  const card = await text(p, "#resume .resume");
  ok(/Mock's game · you're in/.test(card), `${p === mel ? "mel" : "ann"}'s Home card: ${card.replace(/\s+/g, " ")}`);
  await p.locator("#resume .resume button").click(); await p.waitForTimeout(600);
}
ok(await mel.locator(".acts.mirror").count() === 1 && await mel.locator(".tray.mirror").count() === 1, "mel's phone is a mirror on the owner's turn");
ok(/Mock's/.test(await text(mel, "#tray")) || /Mock to roll/.test(await text(mel, "#tray")), "…its tray says whose dice they are: " + (await text(mel, "#tray")).replace(/\s+/g, " "));
await owner.bringToFront(); await owner.waitForTimeout(300);
ok(await owner.locator("#presence .ph").count() === 2, "the owner sees two other phones: " + (await text(owner, "#presence")));

const holderTab = id => id === "mock-mel" ? mel : id === "mock-ann" ? ann : owner;
let sawYourTurn = false, sawEcho = "", playedForDan = false, mirrorsHeld = true, n = 0;
for (; n < 160; n++){
  const x = (await gamesOf(owner)).find(y => y.id === gameId);
  if (x.status === "done") break;
  const who = x.seats[x.turn], p = holderTab(who);
  if (who === "mock-mel" || who === "mock-ann"){
    await p.waitForTimeout(250);
    if (/Your turn/i.test(await text(p, ".done"))) sawYourTurn = true;
    // The other one can't play: a mirror, or (just after its own shot, under its card) every control off.
    for (const q of [owner, mel, ann].filter(q => q !== p && q !== owner))
      if (!(await q.locator(".acts.mirror").count()) && !(await q.locator("#rollBtn:disabled").count())) mirrorsHeld = false;
  }
  if (who.startsWith("g_")) playedForDan = true;
  await playTurn(p);
  if (who === "mock-mel" && !sawEcho){ await owner.waitForTimeout(100); sawEcho = await text(owner, "#echo:not(.hidden)"); }
}
const end = (await gamesOf(owner)).find(y => y.id === gameId);
ok(end.status === "done" && !!end.winner, `the game finished after ${end.turns.length} turns: ${end.names[end.players.indexOf(end.winner)]} won with ${end.scores[end.winner]}`);
ok(sawYourTurn, "a turn coming round to mel or ann said \"Your turn\"");
ok(mirrorsHeld, "while mel or ann played, the other one's phone couldn't play");
ok(playedForDan && end.turns.some(t => t.p.startsWith("g_")), "the owner's phone played Dan's turns");
ok(/Mel ·/.test(sawEcho), "the owner's echo strip said what Mel did: " + sawEcho);
for (const [name, p] of [["owner", owner], ["mel", mel], ["ann", ann]]){
  await p.bringToFront(); await p.waitForTimeout(400);
  ok(await p.locator(".done .crown").count() === 1 && /wins!/.test(await text(p, ".done .head")), `${name}'s phone ends on the finish: ${await text(p, ".done .head")}`);
}
const writers = new Set(Object.values(end.phones || {}).length ? Object.keys(end.phones) : []);
ok(["mock-uid", "mock-mel", "mock-ann"].every(u => writers.has(u)), "presence: all three phones are in phones");

// ---- C. the Game QR ----
for (const p of [owner, mel, ann]){ await p.bringToFront(); const d = p.locator('.done button[data-k="done"]'); if (await d.count()) await d.click(); }
await goHome(owner);
const ben = await tab(ctx, Z + "?mock&as=ben", "ben");
await owner.bringToFront();
await owner.click("#guestBtn"); await owner.fill("#pk-guest", "Eve"); await owner.click('.sheet [data-k="addguest"]'); await owner.waitForTimeout(400);
for (const name of ["Ann", "Dan"]) if ((await owner.locator("#pickChips button", { hasText: name }).getAttribute("aria-pressed")) === "true") await owner.locator("#pickChips button", { hasText: name }).click();
await owner.click("#startBtn"); await owner.waitForTimeout(500);
const q0 = (await gamesOf(owner)).find(x => x.status === "live");
ok(!!q0 && q0.players.length === 2 && q0.names[1] === "Eve", "the owner starts a game with Eve, a guest: " + (q0 && q0.names.join(", ")));
await owner.locator(".done .moment > button.primary").click(); await owner.waitForTimeout(200);
await owner.click("#menuBtn"); await owner.waitForTimeout(250);
await owner.locator(last + " button", { hasText: "Invite to this game" }).click(); await owner.waitForTimeout(500);
ok(/Join Mock's game/.test(await text(owner, ".cn-ov h2")), "Game QR: " + (await text(owner, ".cn-ov h2")));
const link = await owner.locator(".cn-ov").getAttribute("data-link");
await ben.goto(link.replace("?mock&", "?mock&as=ben&")); await ben.waitForTimeout(1500);
const done = ben.locator(".cn-ov button", { hasText: "Done" });
if (await done.count()) { await done.click(); await ben.waitForTimeout(800); }
ok(/Mock's game/.test(await text(ben, last + " h2")), "ben's join card: " + (await text(ben, last)).replace(/\s+/g, " ").slice(0, 120));
await ben.locator(last + " button", { hasText: "I'm Eve" }).click(); await ben.waitForTimeout(900);
const q1 = (await gamesOf(owner)).find(x => x.id === q0.id);
ok(q1.players[1] === "mock-ben" && JSON.stringify(q1.uids) === '["mock-uid","mock-ben"]' && q1.names[1] === "Eve" && "mock-ben" in q1.scores,
  "ben took Eve's seat, her score with it: " + JSON.stringify({ players: q1.players, uids: q1.uids }));
ok(await ben.locator("#game:not(.hidden)").count() === 1, "ben's phone shows the game");
await owner.bringToFront(); await owner.waitForTimeout(400);
ok(/Ben joined/.test(await text(owner, ".cn-ov")), "the owner's Game QR says: " + (await text(owner, '.cn-ov [data-k="joined"]')));
if (process.exitCode) await shot(owner, "zd-phones-owner");
summary();
await b.close(); srv.close();
