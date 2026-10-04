// Session 10 step 5: a pending rated match expires a week after it ended. Ann has three: one
// she ended eight days ago, one Ben ended three days ago, and one Cat scored for her and Ben
// eight days ago. Ann's phone makes the old ones friendlies (expired) and counts the young one's
// days down on the strip; Cat's phone, the scorer's, does it as themselves for a match only they
// open. No rating moves. The summary says why.
//
//   node shared/proofs/rack-it-expiry.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, matchesOf, ratingsOf } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const DAY = 86400000;
const base = { game: "league", playerA: "mock-ann", playerB: "mock-ben", names: { a: "Ann", b: "Ben" }, uids: ["mock-ann", "mock-ben"],
  rated: true, mode: "race", targets: { a: 5, b: 5 }, racksPlanned: null, startedAt: Date.now() - 9 * DAY,
  zargoBefore: { a: 500, b: 500 }, zargoAfter: null, racks: { 1: { balls: { 1: "a", 9: "a" }, breaker: "a", at: 1 } },
  totals: { a: 4, b: 0, racksA: 1, racksB: 0, dead: 0, lead: -4, winner: "a" } };
const seedMatch = (id, extra) => C(owner, (c, a) => c.save("matches/" + a.id, a.doc), { id, doc: { ...base, ...extra } });
await seedMatch("old", { by: "mock-ann", status: "pending", endedBy: "mock-ann", endedAt: Date.now() - 8 * DAY });
await seedMatch("young", { by: "mock-ben", status: "pending", endedBy: "mock-ben", endedAt: Date.now() - 3 * DAY - 3600000 });
await seedMatch("scored", { by: "mock-cat", scorer: "mock-cat", status: "pending", endedBy: "mock-cat", endedAt: Date.now() - 8 * DAY,
  playerA: "mock-dan", playerB: "mock-eve", names: { a: "Dan", b: "Eve" }, uids: ["mock-dan", "mock-eve"] });
const before = JSON.stringify(await ratingsOf(owner));

const ann = await tab(ctx, R + "?mock&as=ann", "ann");
await ann.waitForTimeout(1500);
let ms = Object.fromEntries((await matchesOf(owner)).map(m => [m.id, m]));
ok(ms.old.status === "done" && ms.old.rated === false && ms.old.expired === true, "ann's phone: the eight-day-old match is an expired friendly");
ok(ms.young.status === "pending", "the three-day-old one still waits");
ok(ms.scored.status === "pending", "a match ann isn't in is left alone");
ok(/Ben 0|You 4|· rated/.test(await text(ann, "#pendWho")) && /4 days left/.test(await text(ann, "#pendWho")), "ann's strip: " + (await text(ann, "#pendWho")));

const ben = await tab(ctx, R + "?mock&as=ben", "ben");
await ben.waitForTimeout(1200);
ok(/Waiting for Ann to confirm · 4 days left/.test(await text(ben, "#pendWho")), "ben's strip: " + (await text(ben, "#pendWho")));

const cat = await tab(ctx, R + "?mock&as=cat", "cat");
await cat.waitForTimeout(1500);
ms = Object.fromEntries((await matchesOf(owner)).map(m => [m.id, m]));
ok(ms.scored.status === "done" && ms.scored.rated === false && ms.scored.expired === true && ms.scored.withdrawnBy === "mock-cat",
  "the scorer's phone expires the match it scored, as themselves");
ok(JSON.stringify(await ratingsOf(owner)) === before, "no rating moved");

// The summary.
await ann.bringToFront();
await ann.click('.tabbar button[data-tab="matches"]'); await ann.waitForTimeout(400);
await ann.locator("#histList button", { hasText: "Ben" }).first().click(); await ann.waitForTimeout(400);
const z = await text(ann, "#sumZargo");
ok(/Nobody confirmed in a week, so it counts as a friendly/.test(z), "the expired one's summary: " + z);
// The refusals: too early, or kept rated.
ok(await tryC(ann, c => c.patch("matches/young", { status: "done", rated: false, expired: true })) === "permission-denied", "too early to expire: refused");

summary();
await b.close(); srv.close();
