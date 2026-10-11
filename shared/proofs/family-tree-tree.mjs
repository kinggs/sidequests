// Family Tree, Session 4 (family-tree/PLAN.md): the person page, the tree view, photos, Jon's
// stories, the WikiTree copy and Share as Markdown, on the invented mock seed at 390×844. The tree renders four
// generations with no card overlapping another and nothing under 15px; a tap re-centres and Back
// goes back; someone with no parents and no children still gets a tree. A screenshot of the tree
// goes to SHOTS.
//
//   node shared/proofs/family-tree-tree.mjs
import fs from "node:fs";
import { ok, summary, serve, browser, tab, text, store, shot } from "./h.mjs";

const srv = await serve();
const { b, ctx } = await browser();
const F = srv.base + "/family-tree/";
const p = await tab(ctx, `${F}?mock=reset&seed=../shared/proofs/seeds/family-tree-mock.json`, "owner");
const open = async name => { await p.click('.tabbar button[data-tab="people"]'); await p.waitForTimeout(200); await p.locator("#list li", { hasText: name }).click(); await p.waitForTimeout(300); };
const cards = () => p.locator("#tree .tc").evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return { name: n.querySelector(".tn").textContent, side: [...n.classList].find(c => c !== "tc"), x: r.left, y: r.top, w: r.width, h: r.height,
  sizes: [...n.querySelectorAll(".tn,.ty")].map(e => parseFloat(getComputedStyle(e).fontSize)) }; }));
const overlap = cs => { const bad = []; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++){ const a = cs[i], c = cs[j];
  if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) bad.push(`${a.name} × ${c.name}`); } return bad; };
const rowsOf = cs => new Set(cs.map(c => Math.round(c.y))).size;

// ---- the person page ----
await open("George TOLLER");
ok(await text(p, "#pName") === "George TOLLER" && await text(p, "#pYears") === "1901–1978", "George's page: the name and years");
ok(/Born\s*12 JAN 1901, Riverton/i.test(await text(p, "#pBody")) && /Died\s*1978, Riverton/i.test(await text(p, "#pBody")), "…Born and Died as Jon wrote them");
const body = await text(p, "#pBody");
ok(/PARENTS[\s\S]*Dora May FENWICK[\s\S]*Edwin TOLLER/i.test(body), "…Parents");
ok(/MARRIED[\s\S]*Helen WARD[\s\S]*m\. 1928, Riverton/i.test(body), "…Married, with the date and place");
ok(/CHILDREN[\s\S]*James TOLLER[\s\S]*Kate TOLLER/i.test(body), "…Children");
ok(await p.locator("#treeBtn").evaluate(n => n.getBoundingClientRect().height) >= 76, "…and Tree is the 76px button");
await open("Ivy NASH");
ok(/Jack NASH[\s\S]*not in the tree/i.test(await text(p, "#pBody")), "a ref that didn't resolve says not in the tree");
await open("Albert Quill FENWICK");
ok(/Kept the shop on Main Street for forty years\./.test(await text(p, "#pBody")), "Jon's notes, verbatim");
ok(await p.locator("#pPhotos img").count() === 1, "…a strip of his photos");
ok(/JON WROTE ABOUT THEM[\s\S]*The Fenwick shop/i.test(await text(p, "#pBody")), "…and Jon wrote about them");
// The WikiTree copy (wikitree/): Edwin's adds a day and place to Jon's 1874, Dora's birth is a day off.
await open("Edwin TOLLER");
const ed = await text(p, "#pBody");
ok(/Born\s*1874\s*WikiTree: 2 Jun 1874, Riverton/i.test(ed), "WikiTree's date beside Jon's where it adds to it: " + ed.slice(0, 120).replace(/\n/g, " | "));
ok(/Died\s*2 FEB 1940, Port Example\s*(PARENTS|MARRIED)/i.test(ed), "…and not where it says the same");
ok(/WikiTree · Toller-7\s*b\. 2 Jun 1874, Riverton · d\. 2 Feb 1940, Port Example · kept by Jon Inggs · as of 11 Oct 2026/.test(ed), "…the On WikiTree row: its dates, who keeps it, as of when");
ok(/WIKITREE ALSO NAMES\s*S?\s*Silas Toller\s*Father on WikiTree · 1840–1901/i.test(ed) && !/WIKITREE ALSO NAMES[\s\S]*Dora May Fenwick/i.test(ed), "…the father Jon didn't have, and not the wife he did: " + (ed.split(/WikiTree also names/i)[1] || "").slice(0, 80).replace(/\n/g, " | "));
await open("Dora May FENWICK");
ok(/Born\s*4 APR 1876, Townsville\s*WikiTree: 5 Apr 1876, Townsville/i.test(await text(p, "#pBody")), "a date WikiTree has otherwise sits beside Jon's");
await open("Mark TOLLER");
ok(/Born\s*14 MAY 1960, Port Example/i.test(await text(p, "#pBody")) && !(await p.locator("#detailsBtn").count()), "a living person's dates show to members (owner, 2026-10-11)");

// ---- the tree view: four generations up from Mark ----
await p.click("#treeBtn"); await p.waitForTimeout(500);
let cs = await cards();
ok(await p.locator("#treePage").isVisible() && cs.find(c => c.side === "centre").name === "Mark TOLLER", "Tree centres on Mark");
ok(rowsOf(cs) === 4, "…four generations: " + rowsOf(cs));
ok(cs.length === 7, "…Mark, his parents, grandparents and great-grandparents (his mother's and grandmother's parents aren't in the seed): " + cs.map(c => c.name).join(", "));
ok(overlap(cs).length === 0, "…no card overlaps another: " + overlap(cs).join("; "));
ok(cs.every(c => c.sizes.every(s => s >= 15)), "…nothing under 15px: " + [...new Set(cs.flatMap(c => c.sizes))].join(", "));
ok(await p.locator("#tree svg path").count() >= 1, "…lines join them");

// From George: two up, two down, his wife beside, the descendants' lines in coral.
await open("George TOLLER");
await p.click("#treeBtn"); await p.waitForTimeout(500);
cs = await cards();
ok(rowsOf(cs) === 5 && overlap(cs).length === 0, "George's tree: five rows, no overlap: " + rowsOf(cs));
ok(cs.find(c => c.name === "Helen WARD").side === "spouse" && Math.abs(cs.find(c => c.name === "Helen WARD").y - cs.find(c => c.side === "centre").y) < 2, "…his wife beside him");
ok(cs.filter(c => c.side === "down").length === 4, "…four descendants");
ok(await p.locator("#tree path.down").evaluate(n => getComputedStyle(n).stroke) === "rgb(255, 140, 107)", "…their lines in coral");
const centre = cs.find(c => c.side === "centre");
ok(centre.x + centre.w / 2 > 100 && centre.x + centre.w / 2 < 290, "…the centre on screen: " + Math.round(centre.x + centre.w / 2));
await shot(p, "family-tree-tree");
// A tap re-centres; Back goes back to George; the centre opens the person.
await p.locator("#tree .tc", { hasText: "Albert Quill FENWICK" }).click(); await p.waitForTimeout(600);
cs = await cards();
ok(cs.find(c => c.side === "centre").name === "Albert Quill FENWICK" && overlap(cs).length === 0, "a tap moves the centre to Albert");
ok(cs.filter(c => c.side === "spouse").length === 2, "…both his wives beside him");
await p.goBack(); await p.waitForTimeout(500);
ok((await cards()).find(c => c.side === "centre").name === "George TOLLER", "Back returns to George");
await p.locator("#tree .tc.centre").click(); await p.waitForTimeout(300);
ok(await p.locator("#personPage").isVisible() && await text(p, "#pName") === "George TOLLER", "the centre opens his page");

// Nobody above or below: Ivy, with only a husband.
await open("Ivy NASH");
await p.click("#treeBtn"); await p.waitForTimeout(400);
cs = await cards();
ok(cs.length === 2 && cs.some(c => c.side === "centre") && cs.some(c => c.side === "spouse"), "Ivy's tree: her and her husband: " + cs.map(c => c.name).join(", "));
ok(await p.locator("#tree path.down").count() === 0, "…no lines down");

// ---- photos ----
await p.click('.tabbar button[data-tab="photos"]'); await p.waitForTimeout(300);
ok(await p.locator("#photoGrid .ft-ph").count() === 6, "Photos: all six");
ok(await p.locator("#photoGrid .ft-missing", { hasText: "Not recovered" }).count() === 1, "…the one not recovered is a placeholder");
await p.locator("#photoGrid .ft-ph", { hasText: "wedding day" }).click(); await p.waitForTimeout(600);
const img = await p.locator("#phBox img").getAttribute("src");
const seed = JSON.parse(fs.readFileSync(new URL("./seeds/family-tree-mock.json", import.meta.url)));
ok(img === seed.images.find(i => i.id === "wedding-1900").data, "the photo page loads the full image on demand");
ok(/Dora Fenwick and Edwin Toller on their wedding day in 1900/.test(await text(p, "#phCap")), "…the caption verbatim");
ok((await p.locator("#phPeople button").allInnerTexts()).map(t => t.split("\n").pop()).join(",") === "Dora May FENWICK,Edwin TOLLER", "…the people as chips");
await p.locator("#phPeople button", { hasText: "Edwin" }).click(); await p.waitForTimeout(300);
ok(await text(p, "#pName") === "Edwin TOLLER", "…a chip opens the person");

// ---- Jon's stories ----
await p.click('.tabbar button[data-tab="stories"]'); await p.waitForTimeout(300);
ok(await p.locator("#storyList li").count() === 1 && /The Fenwick shop/.test(await text(p, "#storyList")), "Stories lists Jon's pages");
await p.locator("#storyList li").first().click(); await p.waitForTimeout(500);
ok(await text(p, "#storyBody h1") === "The Fenwick shop", "the reading view: the title");
ok(await p.locator("#storyBody figure img").getAttribute("src") === seed.images.find(i => i.id === "shop").data, "…the image, full");
ok(await p.locator("#storyBody strong", { hasText: "Frank Fenwick" }).count() === 1, "…emphasis");
ok(await p.locator("#storyBody h1").evaluate(n => getComputedStyle(n).fontFamily).then(f => /Space Grotesk/.test(f)), "…the title in Grotesk");
ok(await p.locator("#storyBody p").first().evaluate(n => parseFloat(getComputedStyle(n).fontSize)) === 18, "…the body at 18px");
await p.locator('#storyBody a[data-story="photos"]').click(); await p.waitForTimeout(300);
ok(await p.locator(".toast", { hasText: "wasn't recovered" }).count() > 0 && await p.locator("#storyPage").isVisible(), "a link to a page that wasn't recovered says so");
ok(/Albert Quill FENWICK/.test(await text(p, "#stPeople")), "…and the people in it");

// ---- Share as Markdown: their line, logged first ----
await open("James TOLLER");
await p.click("#pMore"); await p.waitForTimeout(300);
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.locator(".scrim .sheet button", { hasText: "Their line" }).click()]);
const md = fs.readFileSync(await dl.path(), "utf8");
ok(dl.suggestedFilename() === "james-toller-line.md", "Share their line downloads where share isn't offered: " + dl.suggestedFilename());
ok(/^# James TOLLER: their line/.test(md) && /## Great-grandparents/.test(md) && /#### Jon wrote: The Fenwick shop/.test(md), "…the line, a section each generation, Jon's story");
ok(/Toller-7 \(b\. 2 Jun 1874, Riverton · d\. 2 Feb 1940, Port Example; as of 11 Oct 2026\)/.test(md), "…with the WikiTree copy's dates");
const logs = Object.entries(await store(p)).filter(([k]) => k.startsWith("sidequests/family-tree/exports/")).map(([, v]) => v);
ok(logs.some(l => l.kind === "markdown" && l.person === "james-toller-1930" && l.mode === "line" && l.by === "mock-uid" && l.people === 7), "…logged in exports/: " + JSON.stringify(logs.map(l => [l.kind, l.people])));

summary();
await b.close(); srv.close();
