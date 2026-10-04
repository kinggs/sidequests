// Session 10 step 5: a chain for turn games. The owner and Ann play Zombie Dice on two phones.
// On Ann's turn her phone goes offline and she rolls; meanwhile the owner's phone (the starter's,
// also live on her turn) plays her turn out. Ann's phone comes back: its queued roll was built on
// a link that's gone, so it's refused, and the phone takes the game as it stands instead of
// rewinding it. It says so. Without the chain (before Session 10) the late roll would have landed.
//
//   node shared/proofs/zombie-dice-chain.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const Z = srv.base + "/zombie-dice/";
const gamesOf = async p => Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/zombie-dice/games/")).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
const owner = await tab(ctx, Z + "?mock=reset", "owner");
const ann = await tab(ctx, Z + "?mock&as=ann", "ann");
const forgetHere = p => p.evaluate(() => localStorage.removeItem("zombie-dice.game"));
const goHome = async p => { await forgetHere(p); await p.reload(); await p.waitForTimeout(900); };
const code = await C(owner, c => c.account.invite());
await ann.goto(Z + "?mock&as=ann&i=" + code); await ann.waitForTimeout(800);
await ann.locator(".cn-ov button", { hasText: "Done" }).click(); await ann.waitForTimeout(300);
await goHome(owner);
await owner.locator("#pickChips button", { hasText: "Ann" }).click();
await owner.click("#startBtn"); await owner.waitForTimeout(500);
const gameId = (await gamesOf(owner)).find(x => x.status === "live").id;
const game = async () => (await gamesOf(owner)).find(x => x.id === gameId);
// A turn's card ("Your turn", "Ann's turn: pass the phone") sits over the dice until it's tapped.
const dismiss = async p => { const c = p.locator(".done .moment > button.primary"); if (await c.count()) { await c.first().click(); await p.waitForTimeout(200); } };
await owner.locator(".done .moment > button.primary").click(); await owner.waitForTimeout(200);
await goHome(ann);
await ann.locator("#resume .resume button").click(); await ann.waitForTimeout(600);

// The owner's turn: one roll, then stop (or shot).
await owner.bringToFront(); await dismiss(owner);
await owner.click("#rollBtn"); await owner.waitForTimeout(700);
for (let k = 0; k < 3; k++){ const d = owner.locator(".tray .die.tapme").first(); if (!(await d.count())) break; await d.click(); await owner.waitForTimeout(120); }
if ((await game()).seats[(await game()).turn] === "mock-uid") { await owner.click("#stopBtn"); await owner.waitForTimeout(400); }
let x = await game();
ok(x.seats[x.turn] === "mock-ann" && x.rev && typeof x.rev.was === "string", "Ann's turn now; every write names the link it built on (rev.was)");
const n0 = x.rev.n;

// Ann's phone goes offline and rolls.
await ann.bringToFront(); await ann.waitForTimeout(300);
await dismiss(ann);
await C(ann, c => c.network(false));
await ann.click("#rollBtn"); await ann.waitForTimeout(700);
ok((await game()).rev.n === n0, "ann's roll waits in her phone's queue");

// The owner's phone plays Ann's turn out.
await owner.bringToFront(); await owner.waitForTimeout(300);
await dismiss(owner);
await owner.click("#rollBtn"); await owner.waitForTimeout(700);
for (let k = 0; k < 3; k++){ const d = owner.locator(".tray .die.tapme").first(); if (!(await d.count())) break; await d.click(); await owner.waitForTimeout(120); }
if ((await game()).seats[(await game()).turn] === "mock-ann") { await owner.click("#stopBtn"); await owner.waitForTimeout(400); }
const played = await game();
ok(played.seats[played.turn] === "mock-uid" && (played.turns || []).length === 2, "the owner's phone played Ann's turn: back to the owner, two turns done");

// Ann comes back.
await ann.bringToFront();
await C(ann, c => c.network(true)); await ann.waitForTimeout(1500);
const after = await game();
ok(after.rev.key === played.rev.key && JSON.stringify(after.scores) === JSON.stringify(played.scores) && (after.turns || []).length === 2,
  "ann's late roll was refused: nothing rewound (" + JSON.stringify(after.scores) + ")");
ok(/didn't count/.test(await text(ann, ".toast")), "ann's phone says: " + (await text(ann, ".toast")));
await ann.waitForTimeout(500);
ok((await text(ann, "#whose")).replace(/\s+/g, " ") === (await text(owner, "#whose")).replace(/\s+/g, " "),
  "both phones show the same game: " + (await text(ann, "#whose")).replace(/\s+/g, " "));
// Ann plays on from there: her next write is a link again.
ok(await tryC(ann, (c, a) => c.save("games/" + a.id, { rev: { n: a.n, key: "zz", was: "gone", by: "mock-ann", at: 1, say: "x" } }), { id: gameId, n: after.rev.n + 1 }) === "permission-denied",
  "a write built on a link that's gone is refused");

summary();
await b.close(); srv.close();
