// Family Tree, Session 3 step 5 (family-tree/PLAN.md): the gate. The owner on the invented mock
// seed sees the people list (everyone's years, the living too: owner, 2026-10-11), imports a second seed file twice without
// duplicates, and a whole tree that leaves people out removes them only on a hold; a stranger sees the waiting screen and can't read a person; signed out
// sees Sign in; Ann, a member, shows My QR and Ben, scanning it, writes invites/<ben> naming Ann,
// waits, and is let in the moment the owner approves.
//
//   node shared/proofs/family-tree-gate.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ok, summary, serve, browser, tab, C, tryC, text, store, account, accountItems, shot, hold } from "./h.mjs";

const srv = await serve();
const { b, ctx } = await browser();
const F = srv.base + "/family-tree/";
const SEED = "../shared/proofs/seeds/family-tree-mock.json";
const docs = async (p, col) => Object.keys(await store(p)).filter(k => k.startsWith(`sidequests/family-tree/${col}/`));
const rows = p => p.locator("#list .rows > li");

// ---- the owner ----
const owner = await tab(ctx, `${F}?mock=reset&seed=${SEED}`, "owner");
await owner.waitForTimeout(800);
ok(await owner.locator("#peopleTab").isVisible(), "the owner sees People");
ok(!!(await store(owner))["sidequests/family-tree/members/mock-uid"], "the owner's first open writes their own member document");
ok(await rows(owner).count() === 15, "…all 15 people: " + await rows(owner).count());
ok(/15 people/.test(await text(owner, "#count")), "…counted: " + await text(owner, "#count"));
ok((await owner.locator("#list h2.lbl").allInnerTexts()).join(",") === "BEAMISH,FENWICK,NASH,ORME,TOLLER,WARD", "…grouped by surname: " + (await owner.locator("#list h2.lbl").allInnerTexts()).join(","));
const rowOf = name => owner.locator("#list .rows > li", { hasText: name });
ok(await text(rowOf("Albert Quill FENWICK"), ".l2") === "1850–1921", "a dead person's years: " + await text(rowOf("Albert Quill FENWICK"), ".l2"));
ok(await text(rowOf("Clara BEAMISH"), ".l2") === "1852–c. 1930", "an inexact year says c.: " + await text(rowOf("Clara BEAMISH"), ".l2"));
ok(await text(rowOf("Mark TOLLER"), ".l2") === "b. 1960", "a living person's years show too: " + await text(rowOf("Mark TOLLER"), ".l2"));
ok(await text(rowOf("D1 Ernest FENWICK"), ".l2") === "", "no birth year: no years");
ok(await text(rowOf("Ivy NASH"), ".l2") === "b. 1860", "a birth and no death: " + await text(rowOf("Ivy NASH"), ".l2"));
await owner.fill("#search", "toller"); await owner.waitForTimeout(400);
ok(await rows(owner).count() === 6, "search finds the Tollers: " + await rows(owner).count());
await owner.fill("#search", "may fen"); await owner.waitForTimeout(400);
ok(await rows(owner).count() === 1 && /Dora May FENWICK/.test(await text(owner, "#list")), "…any parts of a name");
await owner.fill("#search", ""); await owner.waitForTimeout(400);

await rowOf("Mark TOLLER").click(); await owner.waitForTimeout(300);
ok(await owner.locator("#personPage").isVisible() && await text(owner, "#pName") === "Mark TOLLER", "a tap opens the person");
ok(await text(owner, "#pYears") === "b. 1960" && !(await owner.locator("#detailsBtn").count()), "…living: the years, and no Show details");
ok(/web\.archive\.org/.test(await owner.locator("#pSource").getAttribute("href")), "…the Wayback source link");
await owner.goBack(); await owner.waitForTimeout(300);
ok(await owner.locator("#peopleTab").isVisible(), "Back returns to People");
await owner.click('.tabbar button[data-tab="photos"]'); await owner.waitForTimeout(200);
ok(await owner.locator("#photoGrid .ft-ph").count() === 6, "Photos shows the six (Session 4): " + await owner.locator("#photoGrid .ft-ph").count());
await owner.click('.tabbar button[data-tab="people"]'); await owner.waitForTimeout(200);
const items = await accountItems(owner);
ok(["Profile", "My QR", "Friends", "Export", "Import"].every(i => items.includes(i)), "the owner's sheet: " + items.join(", "));

// Import a second seed file, twice: one person changed, one new, an image. No duplicates.
const two = { app: "family-tree", seed: { part: 2, of: 2 },
  people: [{ id: "nina-toller-1964", name: "Nina TOLLER", given: "Nina", surname: "TOLLER", sex: "F", birth: { date: "1964", year: 1964, place: "Port Example" }, death: { date: "", year: null, place: "" }, parents: [], spouses: [], children: [], notes: "Changed", photos: [], refs: [], source: {} },
           { id: "olive-ward-1910", name: "Olive WARD", given: "Olive", surname: "WARD", sex: "F", birth: { date: "1910", year: 1910, place: "" }, death: { date: "1990", year: 1990, place: "" }, parents: [], spouses: [], children: [], notes: "", photos: [], refs: [], source: {} }],
  images: [{ id: "house", data: "data:image/png;base64,iVBORw0KGgo=" }] };
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ft-")), "family-tree-2.json");
fs.writeFileSync(file, JSON.stringify(two));
for (let i = 0; i < 2; i++){ await owner.setInputFiles("#importFile", file); await owner.waitForTimeout(800); }
const ps = await docs(owner, "people");
ok(ps.length === 16, "two imports of a second file: 16 people, no duplicates: " + ps.length);
ok((await store(owner))["sidequests/family-tree/people/nina-toller-1964"].notes === "Changed", "…merged by id");
ok(await rows(owner).count() === 16, "…and the list shows 16");
await owner.setInputFiles("#importFile", { name: "x.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "rack-it" })) });
ok(await owner.locator(".toast", { hasText: "isn't a Family Tree file" }).first().waitFor({ timeout: 2000 }).then(() => true, () => false), "another app's file is refused");

// A whole tree again (seed part 1) without Ivy: she and Olive (only in part 2) are named, and go
// only on a hold. Keep first, then remove.
const mock = JSON.parse(fs.readFileSync(new URL("./seeds/family-tree-mock.json", import.meta.url)));
const one = { ...mock, seed: { part: 1, of: 2 }, people: mock.people.filter(p => p.id !== "ivy-nash-1860").map(({ wikitree, ...p }) => p), images: [], suggestions: [], members: [] };
const oneFile = path.join(path.dirname(file), "family-tree-1.json");
fs.writeFileSync(oneFile, JSON.stringify(one));
const sheet = owner.locator(".scrim .sheet");
await owner.setInputFiles("#importFile", oneFile); await owner.waitForTimeout(600);
ok(/2 no longer in the tree/.test(await text(owner, ".scrim .sheet")) && /Ivy NASH/.test(await text(owner, ".scrim .sheet")) && /Olive WARD/.test(await text(owner, ".scrim .sheet")), "a whole tree without two people names them first: " + (await text(owner, ".scrim .sheet h2")));
await sheet.locator("button", { hasText: "Import and keep them" }).click(); await owner.waitForTimeout(800);
ok((await docs(owner, "people")).length === 16, "…Keep imports and leaves them: " + (await docs(owner, "people")).length);
ok(!("wikitree" in (await store(owner))["sidequests/family-tree/people/edwin-toller-1874"]), "…and a field the file drops (Edwin's WikiTree link) is gone");
await owner.setInputFiles("#importFile", oneFile); await owner.waitForTimeout(600);
await hold(owner, '.scrim .sheet button:has-text("Hold to remove")'); await owner.waitForTimeout(1000);
const left = await docs(owner, "people");
ok(left.length === 14 && !left.some(k => k.endsWith("/ivy-nash-1860")), "…the hold removes them: " + left.length);
await owner.setInputFiles("#importFile", oneFile); await owner.waitForTimeout(800);
ok(!(await owner.locator(".scrim .sheet").isVisible()) && (await docs(owner, "people")).length === 14, "…and the same file again asks nothing");

// ---- a stranger: the waiting screen, and nothing else ----
const stranger = await tab(ctx, `${F}?mock&as=stranger`, "stranger");
await stranger.waitForTimeout(600);
ok(await stranger.locator("#wait").isVisible(), "a stranger sees the waiting screen");
ok(/Ask a family member to show you their QR/.test(await text(stranger, "#waitMsg")), "…with no invite: " + await text(stranger, "#waitMsg"));
ok(!(await stranger.locator("#peopleTab").isVisible()) && !(await stranger.locator("#tabs").isVisible()), "…no people, no tabs");
ok(await tryC(stranger, c => c.load("people/mark-toller-1960")) !== "allowed", "…and can't read a person");
ok(await tryC(stranger, c => c.list("people")) !== "allowed", "…or list them");
const sItems = await accountItems(stranger);
ok(!sItems.includes("Export") && !sItems.includes("Import") && !sItems.includes("My QR"), "…a sheet without Export, Import or My QR: " + sItems.join(", "));

// ---- signed out ----
const out = await tab(ctx, `${F}?mock&as=&signedout`, "signed out");
ok(await out.locator("#gate").isVisible() && /Sign in/.test(await text(out, "#gate")), "signed out sees Sign in");
ok(!(await out.locator("#peopleTab").isVisible()) && !(await out.locator("#wait").isVisible()), "…and nothing else");

// ---- Ann's QR, Ben's invite ----
const ann = await tab(ctx, `${F}?mock&as=ann`, "ann");
ok(await ann.locator("#peopleTab").isVisible(), "Ann, a member, sees People");
await account(ann, "My QR"); await ann.waitForTimeout(500);
const link = await ann.locator(".cn-ov").getAttribute("data-link");
ok(/family-tree\/\?(.*&)?i=/.test(link || ""), "Ann's My QR points into Family Tree: " + link);
const code = new URL(link).searchParams.get("i");
const ben = await tab(ctx, `${F}?mock&as=ben&i=${code}`, "ben");
await ben.waitForTimeout(1200);
await ben.locator(".cn-ov button", { hasText: "Done" }).click().catch(() => {});
await ben.waitForTimeout(800);
const inv = (await store(owner))["sidequests/family-tree/invites/mock-ben"];
ok(!!inv && inv.invitedBy === "mock-ann" && inv.status === "pending" && inv.uid === "mock-ben" && inv.email === "ben@example.com", "Ben's scan wrote invites/ben naming Ann: " + JSON.stringify(inv && { invitedBy: inv.invitedBy, status: inv.status, email: inv.email }));
ok(await ben.locator("#wait").isVisible() && /Ann invited you/.test(await text(ben, "#waitMsg")), "Ben waits: " + await text(ben, "#waitMsg"));
ok(await tryC(ben, c => c.list("people")) !== "allowed", "…and still can't read the tree");

// The owner approves (the Family tab is Session 4's; the batch is SPEC §5's): Ben's tab opens.
await C(owner, c => c.batch([
  { patch: "invites/mock-ben", data: { status: "approved", decidedBy: "mock-uid", decidedAt: Date.now() } },
  { save: "members/mock-ben", data: { name: "Ben", since: Date.now(), invitedBy: "mock-ann", approvedBy: "mock-uid" } },
]));
await ben.waitForTimeout(1000);
ok(await ben.locator("#peopleTab").isVisible() && await rows(ben).count() === 14, "approved: Ben's phone opens the tree at once");
await shot(ben, "family-tree-people");

summary();
await b.close(); srv.close();
