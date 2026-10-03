// Session 9 step 1: Bloc 11 on the open rule, as around-the-clock-open.mjs.
//
//   node shared/proofs/bloc-11-open.mjs                B and C
//   OLD=<git rev> node shared/proofs/bloc-11-open.mjs  and A, against that build
//
// A. A seed of old climbs (seeds/bloc-11-old.json: household ids, `by` as an email; Mock and Mel
//    claimed, Rolf not), opened by the owner on the old build and on this one: Recent reads the same.
// B. The backfill gives every climb players, names, uids and by, and tells the owner how many are
//    for people with no account. Mel (a member) sees only hers; Ann logs for herself and a guest,
//    edits a note and deletes behind a hold; That was them hands the guest's climb to Ben.
// C. The refusals, through each tab's own cloud.
import { ok, summary, oldBuild, ROOT, serve, browser, tab, C, tryC, text, store, hold } from "./h.mjs";
const SEED = ROOT + "/shared/proofs/seeds/bloc-11-old.json";
const climbs = async p => Object.fromEntries(Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/bloc-11/climbs/")).map(([k, v]) => [k.split("/").pop(), v]));
// A row's one action was ✕ and is ⋯ (DESIGN §4): the rows are compared without it.
const bare = t => t.split("\n").filter(l => !/^[✕⋯]$/.test(l.trim())).join("\n");
async function seeded(root, label){
  const srv = await serve(root, { "/__seed/b11.json": SEED });
  const { b, ctx } = await browser();
  const owner = await tab(ctx, srv.base + "/bloc-11/?mock=reset&seed=/__seed/b11.json", label + " owner");
  await owner.waitForTimeout(1500);
  return { srv, b, ctx, owner };
}

// ---- A ----
if (process.env.OLD){
  const o = await seeded(oldBuild(process.env.OLD), "old");
  const before = bare(await text(o.owner, "#recent"));
  await o.b.close(); o.srv.close();
  const n = await seeded(ROOT, "new");
  const after = bare(await text(n.owner, "#recent"));
  ok(before === after, "Recent reads the same, old build against new\n     " + after.replace(/\n+/g, " | ") + (before === after ? "" : "\n OLD " + before.replace(/\n+/g, " | ")));
  await n.b.close(); n.srv.close();
} else console.log("SKIP A: needs OLD=<git rev>");

// ---- B ----
const { srv, b, ctx, owner } = await seeded(ROOT, "new");
const B = srv.base + "/bloc-11/";
let cs = await climbs(owner);
ok(["b1", "b2", "b3", "b4"].every(id => Array.isArray(cs[id].uids) && Array.isArray(cs[id].names) && Array.isArray(cs[id].players) && cs[id].by && !cs[id].by.includes("@")),
  "the backfill gave every old climb players, names, uids and a uid for by");
ok(JSON.stringify(cs.b1.players) === '["mock-uid"]' && JSON.stringify(cs.b1.uids) === '["mock-uid"]' && cs.b1.climber === "mock-uid",
  "Mock's climb: the climber is now the owner's uid");
ok(JSON.stringify(cs.b4.players) === '["pR"]' && JSON.stringify(cs.b4.uids) === "[]" && JSON.stringify(cs.b4.names) === '["Rolf"]' && cs.b4.by === "mock-mel",
  "Rolf's climb that Mel logged: no account, so no uids; named Rolf; by is Mel");
const told = await text(owner, ".scrim .sheet");
ok(/^2 climbs for people with no account/.test(told) && /Rolf/.test(told), "the owner is told: " + told.split("\n")[0]);
await owner.keyboard.press("Escape");
ok(await owner.locator("#household").isVisible(), "the owner keeps the household list");

const mel = await tab(ctx, B + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, B + "?mock&as=ann", "ann");
const ben = await tab(ctx, B + "?mock&as=ben", "ben");
await mel.waitForTimeout(800);
const melRecent = bare(await text(mel, "#recent"));
ok(/Mel · projecting a 6/.test(melRecent) && !/Rolf|Mock/.test(melRecent), "mel sees her climb only: " + melRecent.replace(/\n+/g, " | "));
ok(!(await mel.locator("#household").isVisible()), "mel has no household list");

// Ann: herself, then Dan, her guest.
await ann.bringToFront();
const annChips = (await text(ann, "#whoChips")).trim();
ok(annChips.split("\n").pop() === "Ann (you)" && annChips.split("\n").length === 2, "ann logs for herself only, until she adds a guest: " + JSON.stringify(annChips));
await ann.locator('#grades button[aria-label="Grade 4"]').click();
await ann.click("#sentBtn"); await ann.waitForTimeout(300);
await ann.click("#guestBtn"); await ann.fill("#pk-guest", "Dan"); await ann.click('.sheet [data-k="addguest"]'); await ann.waitForTimeout(500);
ok(/Dan/.test(await text(ann, '#whoChips button[aria-pressed="true"]')), "the new guest is chosen");
await ann.locator('#grades button[aria-label="Chilli"]').click();
await ann.click("#projBtn"); await ann.waitForTimeout(400);
cs = await climbs(owner);
const annOwn = Object.entries(cs).find(([, x]) => x.by === "mock-ann" && x.climber === "mock-ann");
const danC = Object.entries(cs).find(([, x]) => x.by === "mock-ann" && x.climber !== "mock-ann");
ok(!!annOwn && JSON.stringify(annOwn[1].uids) === '["mock-ann"]' && annOwn[1].grade === 4 && annOwn[1].result === "sent", "ann's own climb: players, uids and a 4 sent");
ok(!!danC && danC[1].climber.startsWith("g_") && JSON.stringify(danC[1].uids) === '["mock-ann"]' && JSON.stringify(danC[1].names) === '["Dan"]'
  && danC[1].grade === 7, "Dan's climb: the guest is the climber, Ann is in uids, named Dan");
const annRecent = bare(await text(ann, "#recent"));
ok(/Dan · projecting a chilli/.test(annRecent) && /Ann · sent a 4/.test(annRecent) && !/Mel|Rolf|Mock/.test(annRecent), "ann sees her two climbs only");
ok(/Dan/.test(await text(ann, "#progChips")), "Progress offers Dan");

// ⋯ → Add a note; ⋯ → hold to delete.
await ann.locator("#recent li", { hasText: "sent a 4" }).locator(".more").click(); await ann.waitForTimeout(250);
await ann.locator(".scrim .sheet button", { hasText: "Add a note" }).click(); await ann.waitForTimeout(250);
await ann.fill(".scrim .sheet input", "the arete"); await ann.locator(".scrim .sheet button", { hasText: "Save" }).click(); await ann.waitForTimeout(400);
ok((await climbs(owner))[annOwn[0]].note === "the arete", "ann adds a note from the row's sheet");
await ann.locator("#recent li", { hasText: "sent a 4" }).locator(".more").click(); await ann.waitForTimeout(250);
await hold(ann, ".scrim .sheet button.hold"); await ann.waitForTimeout(400);
ok(!(await climbs(owner))[annOwn[0]], "ann deletes her climb behind a hold");

// C. The refusals.
for (const [who, p, what, fn, arg] of [
  ["ann", ann, "list every climb", c => c.list("climbs")],
  ["ann", ann, "read Mock's climb", c => c.load("climbs/b1")],
  ["ann", ann, "write state/main", c => c.save("state/main", { climbers: {} })],
  ["mel", mel, "list every climb", c => c.list("climbs")],
  ["mel", mel, "read Rolf's climb she logged", c => c.load("climbs/b4")],
  ["mel", mel, "read Dan's climb", (c, id) => c.load("climbs/" + id), danC[0]],
  ["ben", ben, "change Dan's climb", (c, id) => c.patch("climbs/" + id, { note: "x" }), danC[0]],
  ["ann", ann, "log a climb for Ben, not a friend", c => c.save("climbs/x1", { climber: "mock-ben", players: ["mock-ben"], names: ["Ben"],
    uids: ["mock-ann", "mock-ben"], by: "mock-ann", grade: 5, result: "sent", note: "", at: 1 })],
]) ok(await tryC(p, fn, arg) === "permission-denied", `${who} refused: ${what}`);

// That was them: Ann and Ben connect, and Dan turns out to be Ben. His climb follows.
const code = await C(ann, c => c.account.invite());
await ben.goto(B + "?mock&as=ben&i=" + code); await ben.waitForTimeout(900);
await ben.locator(".cn-ov button", { hasText: "Done" }).click(); await ben.waitForTimeout(300);
await C(ann, (c, gid) => c.account.claimGuest(gid, "mock-ben"), danC[1].climber);
await ann.reload(); await ann.waitForTimeout(1500);
const danNow = (await climbs(owner))[danC[0]];
ok(JSON.stringify(danNow.players) === '["mock-ben"]' && danNow.climber === "mock-ben" && JSON.stringify(danNow.uids) === '["mock-ann","mock-ben"]'
  && JSON.stringify(danNow.names) === '["Dan"]', "the claim: Dan's climb is Ben's, uids gains him, names stays");
await ben.reload(); await ben.waitForTimeout(1200);
ok(/Ben · projecting a chilli/.test(bare(await text(ben, "#recent"))), "ben sees the climb that was Dan's, as his own");
summary();
await b.close(); srv.close();
