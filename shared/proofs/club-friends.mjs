// Session 10 step 3: club connections and the staff badge. Sam (on the club's staff list) and Kim
// (not) connect with Ann through Sessions Loyalty; Ben through Rack It. In Rack It, Ann's phone
// stamps `staff` on her card for Sam, not Kim; Friends and the picker fold Sam and Kim under
// "Sessions" below Ben, Sam's row saying staff; setup's chips leave them out. The check runs once
// a day; when Sam leaves the list the tag it stamped goes, and a staff tag Ann typed herself stays.
//
//   node shared/proofs/club-friends.mjs
import { ok, summary, serve, browser, tab, C, text, store, account } from "./h.mjs";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/", L = srv.base + "/sessions-loyalty/";
const owner = await tab(ctx, L + "?mock=reset", "owner");
await C(owner, c => c.save("staff/mock-sam", { name: "Sam", addedAt: Date.now(), addedBy: "mock-uid" }));
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
const sam = await tab(ctx, L + "?mock&as=sam", "sam");
const kim = await tab(ctx, L + "?mock&as=kim", "kim");
const ben = await tab(ctx, R + "?mock&as=ben", "ben");
for (const [p, app] of [[sam, "sessions-loyalty"], [kim, "sessions-loyalty"], [ben, "rack-it"]]){
  const code = await C(ann, c => c.account.invite());
  await C(p, (c, a) => c.account.accept(a.code, a.app), { code, app });
}
// Ann typed "staff" on Ben herself.
await C(ann, c => c.account.saveFriend("mock-ben", { tags: ["staff"] }));
const card = async uid => (await store(owner))[`profiles/mock-ann/friends/${uid}`] || {};
ok((await store(owner))["friendships/mock-ann_mock-sam"].app === "sessions-loyalty", "sam's pair says sessions-loyalty");

await ann.reload(); await ann.waitForTimeout(1500);
ok(JSON.stringify((await card("mock-sam")).tags) === '["staff"]' && (await card("mock-sam")).staffAt > 0, "ann's card for Sam: tagged staff");
ok(!((await card("mock-kim")).tags || []).includes("staff"), "…for Kim: not");
ok(await ann.evaluate(() => !!localStorage.getItem("people.staff.mock-ann.mock-sam")), "the check is remembered for a day");

// Friends.
await account(ann, "Friends"); await ann.waitForTimeout(600);
let rows = (await ann.locator(".cn-ov .rows>li").allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim());
ok(/^B?\s*Ben/.test(rows[0]) && rows.some(r => /^Sessions 2 · Show/i.test(r)) && !rows.some(r => /Sam|Kim/.test(r)), "Friends: Ben, then Sessions folded: " + rows.join(" | "));
await ann.locator(".cn-ov .cn-fold").click(); await ann.waitForTimeout(300);
rows = (await ann.locator(".cn-ov .rows>li").allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim());
ok(rows.some(r => /Sam ?staff/.test(r)) && rows.some(r => /Kim/.test(r) && !/staff/.test(r)), "…unfolded, Sam says staff: " + rows.join(" | "));
await ann.locator(".cn-ov button", { hasText: "Close" }).click(); await ann.waitForTimeout(200);

// Setup's chips and the picker.
await ann.click('.tabbar button[data-tab="play"]'); await ann.waitForTimeout(400);
const chips = (await ann.locator("#whoChips button").allInnerTexts()).map(t => t.trim());
ok(chips.some(c => /Ben/.test(c)) && !chips.some(c => /Sam|Kim/.test(c)), "Who's playing leaves the club out: " + chips.join(" | "));
const pickP = C(ann, async () => { const { people } = await import("../shared/people.js"); return people.pick({ title: "Pick", app: "rack-it" }); });
await ann.waitForTimeout(500);
let picks = (await ann.locator(".pk-sheet .pk-list > button").allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim());
ok(picks.some(t => /Ben/.test(t)) && picks.some(t => /^Sessions 2 · Show/i.test(t)) && !picks.some(t => /Sam|Kim/.test(t)), "the picker: Ben, then Sessions folded: " + picks.join(" | "));
await ann.locator(".pk-sheet .pk-fold").click(); await ann.waitForTimeout(300);
picks = (await ann.locator(".pk-sheet .pk-list > button").allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim());
ok(picks.some(t => /Sam ?staff/.test(t)) && picks.some(t => /Kim ?friend/.test(t)), "…unfolded: " + picks.join(" | "));
await ann.locator(".pk-sheet .pk-pick", { hasText: "Sam" }).click();
ok(await pickP === "mock-sam", "Sam can be picked from the fold");

// Sam leaves the list; a day on, the stamped tag goes; Ben's typed one stays.
await C(owner, c => c.delete("staff/mock-sam"));
await ann.evaluate(() => localStorage.removeItem("people.staff.mock-ann.mock-sam"));
await ann.reload(); await ann.waitForTimeout(1500);
ok(!((await card("mock-sam")).tags || []).includes("staff"), "sam left the staff list: the tag goes");
ok(JSON.stringify((await card("mock-ben")).tags) === '["staff"]', "ben's tag, typed by Ann, stays");

summary();
await b.close(); srv.close();
