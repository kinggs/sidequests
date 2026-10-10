// Family Tree, Session 4 (family-tree/PLAN.md): invites and members on the Family tab. The owner
// shows My QR from the Family tab; Dad lands with &i=<code>, waits, and the owner approves him from
// Waiting: Dad's tab opens the people list. Ann, a member, invites her friends Eve and Fay without a
// QR (Invite a friend); she can't approve her own invitees, but Dad, now a member, approves Fay; the
// owner declines Eve. Ann suggests a correction and the owner marks it done. The owner removes Dad,
// and his tree closes.
//
//   node shared/proofs/family-tree-invites.mjs
import { ok, summary, serve, browser, tab, C, tryC, text, store, hold, shot } from "./h.mjs";

const srv = await serve();
const { b, ctx } = await browser();
const F = srv.base + "/family-tree/";
const SEED = "../shared/proofs/seeds/family-tree-mock.json";
const doc = async (p, path) => (await store(p))[`sidequests/family-tree/${path}`];
const family = async p => { await p.bringToFront(); await p.click('.tabbar button[data-tab="family"]'); await p.waitForTimeout(300); };
const sheetText = p => text(p, ".scrim .sheet");
const openRow = async (p, list, has) => { await p.locator(`${list} li`, { hasText: has }).locator(".more").click(); await p.waitForTimeout(300); };

// ---- the owner shows My QR from the Family tab; Dad scans it ----
const owner = await tab(ctx, `${F}?mock=reset&seed=${SEED}`, "owner");
await family(owner);
ok(await owner.locator("#fMembers li").count() === 3, "the Family tab lists the members: " + await owner.locator("#fMembers li").count());
ok(/invited by Ann · approved by Mock Player/.test(await text(owner, "#fMembers")), "…with invited by · approved by: " + (await text(owner, "#fMembers")).replace(/\n/g, " | "));
ok(await owner.locator("#fWaitWrap").isHidden(), "…and nobody waiting yet");
await owner.click("#showQr"); await owner.waitForTimeout(600);
const link = await owner.locator(".cn-ov").getAttribute("data-link");
ok(/family-tree\/\?(.*&)?i=/.test(link || ""), "Show my QR points into Family Tree: " + link);
const code = new URL(link).searchParams.get("i");
await owner.locator(".cn-ov button", { hasText: "Close" }).click(); await owner.waitForTimeout(200);

const dad = await tab(ctx, `${F}?mock&as=dad&i=${code}`, "dad");
await dad.waitForTimeout(1000);
await dad.locator(".cn-ov button", { hasText: "Done" }).click().catch(() => {});
await dad.waitForTimeout(800);
ok(await dad.locator("#wait").isVisible() && /Mock Player invited you/.test(await text(dad, "#waitMsg")), "Dad waits: " + await text(dad, "#waitMsg"));

// ---- the owner approves Dad from Waiting; Dad's tab opens at once ----
await family(owner);
ok(/Mock Player invited Dad|You invited Dad/.test(await text(owner, "#fWaiting")) && /dad@example\.com/.test(await text(owner, "#fWaiting")), "the owner sees Dad waiting, with his email: " + (await text(owner, "#fWaiting")).replace(/\n/g, " | "));
await openRow(owner, "#fWaiting", "Dad");
ok(/Is this them\?/.test(await sheetText(owner)), "…the ⋯ asks: " + (await text(owner, ".scrim .sheet p")));
await owner.locator(".scrim .sheet button", { hasText: "Approve" }).click(); await owner.waitForTimeout(800);
const dadMember = await doc(owner, "members/mock-dad");
ok(dadMember && dadMember.invitedBy === "mock-uid" && dadMember.approvedBy === "mock-uid", "approve wrote members/dad: " + JSON.stringify(dadMember && { invitedBy: dadMember.invitedBy, approvedBy: dadMember.approvedBy }));
ok((await doc(owner, "invites/mock-dad")).status === "approved", "…and the invite says approved");
await dad.bringToFront(); await dad.waitForTimeout(600);
ok(await dad.locator("#peopleTab").isVisible() && await dad.locator("#list .rows > li").count() === 15, "Dad's phone opens the people list");

// ---- Ann invites her friends Eve and Fay without a QR ----
const ann = await tab(ctx, `${F}?mock&as=ann`, "ann");
const eve = await tab(ctx, `${F}?mock&as=eve`, "eve");
const fay = await tab(ctx, `${F}?mock&as=fay`, "fay");
for (const friend of [eve, fay]){
  const c = await C(ann, cl => cl.account.invite());
  await C(friend, (cl, c) => cl.account.accept(c, "rack-it"), c);
}
await ann.reload(); await ann.waitForTimeout(900);
await family(ann);
await ann.click("#inviteFriend"); await ann.waitForTimeout(500);
const names = async p => (await p.locator(".scrim .sheet button:not(.cancel)").allInnerTexts()).map(t => t.split("\n").pop().trim());
const offered = await names(ann);
ok(offered.length === 2 && offered.includes("Eve") && offered.includes("Fay"), "Invite a friend offers Ann's friends who aren't in: " + offered.join(", "));
await ann.locator(".scrim .sheet button", { hasText: "Eve" }).click(); await ann.waitForTimeout(600);
await ann.click("#inviteFriend"); await ann.waitForTimeout(500);
const offered2 = await names(ann);
ok(offered2.length === 1 && offered2[0] === "Fay", "…Eve, now waiting, isn't offered again: " + offered2.join(", "));
await ann.locator(".scrim .sheet button", { hasText: "Fay" }).click(); await ann.waitForTimeout(600);
const ie = await doc(ann, "invites/mock-eve");
ok(ie && ie.invitedBy === "mock-ann" && ie.email === "" && ie.status === "pending" && ie.name === "Eve", "invites/eve: Ann's, no email, pending: " + JSON.stringify(ie && { invitedBy: ie.invitedBy, email: ie.email, status: ie.status }));
await eve.bringToFront(); await eve.waitForTimeout(500);
ok(await eve.locator("#wait").isVisible() && /Ann invited you/.test(await text(eve, "#waitMsg")), "Eve's phone waits: " + await text(eve, "#waitMsg"));

// Ann can't approve her own invitee: the ⋯ says so, and the rules refuse it anyway.
await family(ann);
ok(/You invited Eve/.test(await text(ann, "#fWaiting")), "Ann sees Eve waiting as hers");
await openRow(ann, "#fWaiting", "Eve");
ok(!(await ann.locator(".scrim .sheet button", { hasText: "Approve" }).count()) && /another member/.test(await sheetText(ann)), "…her ⋯ offers no Approve: " + (await text(ann, ".scrim .sheet p")));
await ann.keyboard.press("Escape"); await ann.waitForTimeout(200);
ok(await tryC(ann, c => c.batch([
  { patch: "invites/mock-eve", data: { status: "approved", decidedBy: "mock-ann", decidedAt: Date.now() } },
  { save: "members/mock-eve", data: { name: "Eve", since: Date.now(), invitedBy: "mock-ann", approvedBy: "mock-ann" } },
])) !== "allowed", "…and the rules refuse Ann approving her own");

// Dad, now a member, approves Fay; Fay's tab opens.
await family(dad);
await openRow(dad, "#fWaiting", "Fay");
await dad.locator(".scrim .sheet button", { hasText: "Approve" }).click(); await dad.waitForTimeout(800);
const fm = await doc(dad, "members/mock-fay");
ok(fm && fm.invitedBy === "mock-ann" && fm.approvedBy === "mock-dad", "Dad approves Fay: " + JSON.stringify(fm && { invitedBy: fm.invitedBy, approvedBy: fm.approvedBy }));
await fay.bringToFront(); await fay.waitForTimeout(600);
ok(await fay.locator("#peopleTab").isVisible(), "…and Fay's phone opens the tree");

// The owner declines Eve, on a hold.
await family(owner);
await openRow(owner, "#fWaiting", "Eve");
await hold(owner, '.scrim .sheet button:has-text("Hold to decline")'); await owner.waitForTimeout(800);
ok((await doc(owner, "invites/mock-eve")).status === "declined" && !(await doc(owner, "members/mock-eve")), "the owner declines Eve: no member document");
await eve.bringToFront(); await eve.waitForTimeout(500);
ok(/isn't you/.test(await text(eve, "#waitMsg")), "Eve's phone says so: " + await text(eve, "#waitMsg"));
ok(await owner.locator("#fWaitWrap").isHidden(), "nobody's waiting now");
ok(/Fay[\s\S]*invited by Ann · approved by Dad/.test(await text(owner, "#fMembers")), "the members list says who approved Fay");
ok(!(await ann.locator("#fSuggWrap").isVisible()), "a member doesn't see Suggestions");

// ---- a suggestion: Ann sends it from a person; the owner marks it done ----
await ann.bringToFront();
await ann.click('.tabbar button[data-tab="people"]'); await ann.waitForTimeout(300);
await ann.locator("#list li", { hasText: "Frank FENWICK" }).click(); await ann.waitForTimeout(300);
await ann.click("#suggestBtn"); await ann.waitForTimeout(300);
await ann.fill(".scrim .sheet textarea", "Frank was the eldest, not the youngest.");
await ann.locator(".scrim .sheet button", { hasText: "Send" }).click(); await ann.waitForTimeout(600);
ok(await ann.locator(".toast", { hasText: "Thanks, Mock will look at it." }).count() > 0, "Ann is thanked, by the owner's name");
await family(owner);
ok(/Frank FENWICK[\s\S]*Frank was the eldest[\s\S]*Ann ·/.test(await text(owner, "#fSugg")), "the owner sees it: the person, the text, who and when");
await openRow(owner, "#fSugg", "Frank was the eldest");
await hold(owner, '.scrim .sheet button:has-text("Hold to mark done")'); await owner.waitForTimeout(800);
const done = Object.entries(await store(owner)).filter(([k, v]) => k.startsWith("sidequests/family-tree/suggestions/") && v.person === "frank-fenwick-1878").map(([, v]) => v);
ok(done.length === 1 && done[0].status === "done" && done[0].doneBy === "mock-uid", "…Done on a hold marks it done");
ok(!/Frank was the eldest/.test(await text(owner, "#fSugg")), "…and it leaves the list");

// ---- the owner removes Dad on a hold; his tree closes ----
await owner.click('#fMembers .more[aria-label="More for Dad"]'); await owner.waitForTimeout(300);
await hold(owner, '.scrim .sheet button:has-text("Hold to remove")'); await owner.waitForTimeout(800);
ok(!(await doc(owner, "members/mock-dad")), "the owner removes Dad");
await dad.bringToFront(); await dad.waitForTimeout(600);
ok(await dad.locator("#wait").isVisible() && !(await dad.locator("#tabs").isVisible()), "…and Dad's phone closes the tree");
await shot(owner, "family-tree-family");

summary();
await b.close(); srv.close();
