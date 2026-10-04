// Session 8 step 2: seats and the Game QR. Ann starts a match against Dan, her guest, from the
// Who's playing chips, and shows the Game QR from the live screen's ⋯. Cat, her friend, scans it
// and says "I'm Dan": the seat is hers. Ann's phone says Cat joined and, once the match is saved,
// offers That was them for Dan's other games. Ben, a stranger, scans it and joins Ann's Friends,
// but the seat is gone. A friend Ann picks at setup finds the match on Home.
//
//   node shared/proofs/rack-it-seats.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, scoreLeague, RACKS, matchesOf, hold, shot } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const cat = await tab(ctx, R + "?mock&as=cat", "cat");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
const last = "body > .scrim:last-of-type .sheet";

const code = await C(ann, c => c.account.invite());
await cat.goto(R + "?mock&as=cat&i=" + code); await cat.waitForTimeout(800);
await cat.locator(".cn-ov button", { hasText: "Done" }).click(); await cat.waitForTimeout(300);
const gid = await C(ann, c => c.account.addGuest("Dan"));
await ann.reload(); await ann.waitForTimeout(900);

// Setup: the chips.
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(300);
const chips = (await ann.locator("#whoChips button > span:last-child, #whoChips button.add").allInnerTexts()).map(t => t.trim());
ok(chips.includes("Ann (you)") && chips.includes("Cat") && chips.includes("Dan") && chips.includes("Show QR") && chips.includes("+ Add a guest"),
  "Who's playing: " + chips.join(" | "));
await ann.locator("#whoChips button", { hasText: "Dan" }).click(); await ann.waitForTimeout(250);
ok(/Ann/.test(await text(ann, "#pickA")) && /Dan/.test(await text(ann, "#pickB")), "the Dan chip filled the lilac side");
ok(await ann.locator("#whoChips button", { hasText: "Dan" }).getAttribute("aria-pressed") === "true", "…and shows chosen");
await ann.click("#startBtn"); await ann.waitForTimeout(500);
const m0 = (await matchesOf(owner)).find(x => x.playerB === gid && x.status === "live");
ok(!!m0, "ann started against Dan");

// Ben, a stranger, can't read it before he's connected.
ok(await tryC(ben, (c, id) => c.load("matches/" + id), m0.id) === "permission-denied", "ben can't read Ann's live match");

// The Game QR.
ok(await ann.locator("#liveMore").isVisible(), "the starter's live screen has ⋯");
await ann.click("#liveMore"); await ann.waitForTimeout(250);
await ann.locator(last + " button", { hasText: "Invite to this game" }).click(); await ann.waitForTimeout(500);
ok(/Join Ann's match/.test(await text(ann, ".cn-ov h2")) && /Game QR/i.test(await text(ann, ".cn-ov .cn-head .lbl")), "Game QR: " + (await text(ann, ".cn-ov h2")));
const link = await ann.locator(".cn-ov").getAttribute("data-link");
ok(link && link.includes("g=" + m0.id) && /[?&]i=/.test(link), "its link carries the match and the code");

// Cat scans it.
await cat.goto(link.replace("?mock&", "?mock&as=cat&")); await cat.waitForTimeout(1500);
ok(/Ann's match/.test(await text(cat, last + " h2")), "cat's join card: " + (await text(cat, last)).replace(/\s+/g, " ").slice(0, 120));
const seatBtn = cat.locator(last + " button", { hasText: "I'm Dan" });
ok(await seatBtn.count() === 1, "…offers I'm Dan");
await seatBtn.click(); await cat.waitForTimeout(700);
let m = (await matchesOf(owner)).find(x => x.id === m0.id);
ok(m.playerB === "mock-cat" && JSON.stringify(m.uids) === '["mock-ann","mock-cat"]' && m.names.b === "Dan" && m.rated === false,
  "cat took Dan's seat: " + JSON.stringify({ b: m.playerB, uids: m.uids, names: m.names }));
ok(await cat.locator("#scrLive").isVisible(), "cat's phone shows the match");
await ann.waitForTimeout(400);
ok(/Cat joined · lilac side/.test(await text(ann, ".cn-ov")), "ann's Game QR says: " + (await text(ann, '.cn-ov [data-k="joined"]')));
await ann.locator(".cn-ov button", { hasText: "Close" }).click(); await ann.waitForTimeout(300);

// Ben scans it too: he joins Ann's Friends, but there's no seat left.
await ben.goto(link.replace("?mock&", "?mock&as=ben&")); await ben.waitForTimeout(1500);
// No guest seat left; since Session 10 a match with no scorer offers Score this match instead of "full".
ok(!/I'm /.test(await text(ben, last)) && /Score this match/.test(await text(ben, last)), "ben: no seat, but Score this match: " + (await text(ben, last + " h2")));
await ben.locator(last + " button", { hasText: "Not now" }).click(); await ben.waitForTimeout(200);
ok(!!(await store(ben))["friendships/mock-ann_mock-ben"], "…and is in Ann's Friends");
ok(await tryC(ben, (c, id) => c.patch("matches/" + id, { playerB: "mock-ben", uids: ["mock-ann", "mock-cat", "mock-ben"] }), m0.id) === "permission-denied",
  "ben can't take a seat held by an account");

// Ann scores it out and saves; then the offer.
await ann.bringToFront();
await scoreLeague(ann, RACKS);
await ann.waitForTimeout(600);
ok(/That was Cat/.test(await text(ann, last + " h2")) && /Cat took Dan's seat/.test(await text(ann, last)), "ann's phone asks: " + (await text(ann, last + " h2")));
await hold(ann, last + " button.hold"); await ann.waitForTimeout(700);
ok((await store(owner))[`profiles/mock-ann/guests/${gid}`].claimedBy === "mock-cat", "Dan points at Cat now");

// A friend picked at setup finds the match on Home.
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(300);
await ann.locator("#whoChips button", { hasText: "Cat" }).click(); await ann.waitForTimeout(250);
await ann.click("#startBtn"); await ann.waitForTimeout(600);
await cat.goto(R + "?mock&as=cat"); await cat.waitForTimeout(1000);
ok(/Ann's match · you're in/.test(await text(cat, "#inCard")) && /lilac side/.test(await text(cat, "#inCard")), "cat's Home card: " + (await text(cat, "#inCard")).replace(/\s+/g, " "));
await cat.click("#inOpen"); await cat.waitForTimeout(500);
ok(await cat.locator("#scrLive").isVisible(), "Open shows the match");
ok(!(await cat.locator("#liveMore").isVisible()), "…with no Game QR: that's the starter's");

// A finished match can't be read that way.
const done = (await matchesOf(owner)).find(x => x.id === m0.id);
const eve = await tab(ctx, R + "?mock&as=eve", "eve");
const code2 = await C(ann, c => c.account.invite());
await eve.goto(R + "?mock&as=eve&i=" + code2); await eve.waitForTimeout(800);
ok(await tryC(eve, (c, id) => c.load("matches/" + id), done.id) === "permission-denied", "eve, Ann's new friend, can't read Ann's finished match");
await b.close(); srv.close();
summary();
