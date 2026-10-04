// Session 10 step 2: connect.scan(), and My QR's "Or scan theirs". Ann shows My QR; Ben, at Rack
// It's setup, taps Show QR, then Or scan theirs, and the scanner is fed Ann's link (the paste
// fallback: headless Chromium has no BarcodeDetector). They're connected, the pair says rack-it,
// Ann's My QR says so too, and Ben's setup has Ann picked. Cat does the same from people.pick's
// Scan a new player in Bloc 11. Your own QR and a dead code are turned away. Sessions Loyalty's
// Scan a member's QR still makes a card.
//
//   node shared/proofs/connect-scan.mjs
import { ok, summary, serve, browser, tab, C, text, store, account } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
const feed = async (p, link) => {
  await p.locator(".cn-ov.cn-scan, .cn-scan").first().waitFor({ timeout: 3000 }).catch(() => {});
  await p.fill('.cn-scan [data-k="paste"]', link);
  await p.locator('.cn-scan [data-k="use"]').click();
  await p.waitForTimeout(1200);
};
const theirs = p => p.locator(".cn-ov:not(:has(.cn-scan)) [data-k=\"theirs\"]");

// Ann's My QR.
await account(ann, "My QR"); await ann.waitForTimeout(500);
const link = await ann.locator(".cn-ov").getAttribute("data-link");
ok(/[?&]i=/.test(link || ""), "ann's My QR has a link");

// Ben: setup → Show QR → Or scan theirs.
await ben.bringToFront();
await ben.click('.tabbar button[data-tab="play"]'); await ben.waitForTimeout(300);
await ben.locator("#whoChips button", { hasText: "Show QR" }).click(); await ben.waitForTimeout(500);
ok(await theirs(ben).isVisible(), "Show QR offers Or scan theirs");
await theirs(ben).click(); await ben.waitForTimeout(300);
ok(/Scan their QR/i.test(await text(ben, ".cn-scan")) || /Scan their QR/i.test(await text(ben, ".cn-ov:last-of-type .lbl")), "the scanner opens");
ok(/can't scan in the app|camera isn't available/.test(await text(ben, '.cn-scan [data-k="msg"]')), "no camera here: it says so and takes a paste");
await feed(ben, "hello");
ok(/isn't a sidequests QR/.test(await text(ben, '.cn-scan [data-k="msg"]')), "something that isn't a code is refused");
await feed(ben, link);
await ben.waitForTimeout(1500);
const pair = (await store(owner))["friendships/mock-ann_mock-ben"];
ok(!!pair && pair.app === "rack-it", "ann and ben are connected, from Ann's code: " + JSON.stringify(pair && { app: pair.app, via: !!pair.via }));
ok(!!(await store(owner))["profiles/mock-ben/friends/mock-ann"], "ben's card for Ann is stamped");
ok(/Ann/.test(await text(ben, "#pickA") + await text(ben, "#pickB")), "ben's setup has Ann picked: " + (await text(ben, "#pickA")) + " / " + (await text(ben, "#pickB")));
await ann.waitForTimeout(300);
ok(/Connected with Ben/.test(await text(ann, ".cn-ov")), "ann's My QR says Connected with Ben");

// Your own QR.
await account(ben, "My QR"); await ben.waitForTimeout(500);
const own = await ben.locator(".cn-ov").getAttribute("data-link");
await theirs(ben).click(); await feed(ben, own);
ok(/your own QR/.test(await text(ben, '.cn-ov [data-k="msg"]')), "ben's own QR: " + (await text(ben, '.cn-ov [data-k="msg"]')));
// A dead code.
await theirs(ben).click(); await feed(ben, "ZZZZZZZZZZZZ");
ok(/expired/.test(await text(ben, '.cn-ov [data-k="msg"]')), "a dead code: " + (await text(ben, '.cn-ov [data-k="msg"]')));
await ben.locator(".cn-ov button", { hasText: "Close" }).click();

// Cat, in Bloc 11: people.pick's Scan a new player, then Or scan theirs.
const B = srv.base + "/bloc-11/";
const cat = await tab(ctx, B + "?mock&as=cat", "cat");
await account(ann, "My QR").catch(() => {});
await ann.locator(".cn-ov button", { hasText: "Close" }).first().click().catch(() => {});
await account(ann, "My QR"); await ann.waitForTimeout(500);
const link2 = await ann.locator(".cn-ov").last().getAttribute("data-link");
await cat.bringToFront();
const pickP = C(cat, async () => { const { people } = await import("../shared/people.js"); return people.addPlayer({ title: "Add player", app: "bloc-11" }); });
await cat.waitForTimeout(500);
await cat.locator(".scrim .sheet button", { hasText: "Scan a new player" }).click(); await cat.waitForTimeout(500);
await theirs(cat).click(); await feed(cat, link2);
const picked = await Promise.race([pickP, new Promise(r => setTimeout(() => r("timeout"), 5000))]);
ok(picked === "mock-ann", "people.pick → Scan a new player → Or scan theirs picks Ann: " + picked);
ok(((await store(owner))["friendships/mock-ann_mock-cat"] || {}).app === "bloc-11", "…and the pair says bloc-11");

// Sessions Loyalty: Scan a member's QR, on connect.scan now.
const L = srv.base + "/sessions-loyalty/";
const staff = await tab(ctx, L + "?mock", "staff");
await staff.waitForTimeout(800);
const dan = await tab(ctx, L + "?mock&as=dan", "dan");
const danCode = await C(dan, c => c.account.invite());
await staff.bringToFront();
await staff.locator("button", { hasText: "Scan a member's QR" }).first().click(); await staff.waitForTimeout(400);
ok(/Scan a member's QR/i.test(await text(staff, ".cn-scan") + await text(staff, ".cn-ov .lbl")), "the loyalty app's scanner is connect.scan");
await feed(staff, danCode);
await staff.waitForTimeout(800);
const st = await store(owner);
ok(((st["friendships/mock-dan_mock-uid"] || {}).app) === "sessions-loyalty", "staff scanned Dan: connected, app sessions-loyalty");
ok(Object.keys(st).some(k => k.startsWith("sidequests/sessions-loyalty/cards/mock-dan")), "…and Dan has a card");

summary();
await b.close(); srv.close();
