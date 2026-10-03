// Session 9 step 2: Photo Coach on the open rule.
//
//   node shared/proofs/photo-coach-open.mjs
//
// A seed of the owner's old log (seeds/photo-coach-old.json: no uids anywhere) opened by the owner:
// the backfill makes every photo, image, batch and review the owner's. Ann, a stranger, gets an empty
// log of her own, adds a full-size photo (its stored size is printed: the App Check trigger in
// KIT-PLAN Parked wants the number), and deletes it behind a hold. The refusals hold.
import { ok, summary, ROOT, serve, browser, tab, tryC, text, store, hold, accountItems } from "./h.mjs";
const SEED = ROOT + "/shared/proofs/seeds/photo-coach-old.json";
const under = (docs, coll) => Object.fromEntries(Object.entries(docs).filter(([k]) => k.startsWith(`sidequests/photo-coach/${coll}/`)).map(([k, v]) => [k.split("/").pop(), v]));
const srv = await serve(ROOT, { "/__seed/pc.json": SEED });
const { b, ctx } = await browser();
const P = srv.base + "/photo-coach/";
const owner = await tab(ctx, P + "?mock=reset&seed=/__seed/pc.json", "owner");
await owner.waitForTimeout(1500);

let docs = await store(owner);
const mineOwner = r => !!r && JSON.stringify(r.uids) === '["mock-uid"]' && JSON.stringify(r.players) === '["mock-uid"]' && r.by === "mock-uid";
ok(["photos", "batches", "reviews"].every(c => Object.values(under(docs, c)).every(mineOwner)), "the backfill made every old photo, batch and review the owner's");
ok(["p1", "p2", "a1"].every(id => mineOwner(under(docs, "images")[id])) && under(docs, "images").p1.data.startsWith("data:"),
  "…and every image, the alt's too, its data kept");
ok((await owner.locator(".thumbs button").count()) === 2, "the owner sees both old photos");
ok((await owner.locator("#tabs button").allInnerTexts()).join(",") === "Library,Coach", "two tabs: More went into the account sheet");
const items = await accountItems(owner);
ok(["Profile", "Export everything (JSON, with photos)", "Export all feedback (markdown)", "Import a JSON export"].every(x => items.includes(x)),
  "the account sheet: " + items.join(", "));

// Ann: an empty log, then a full-size photo.
const ann = await tab(ctx, P + "?mock&as=ann", "ann");
await ann.waitForTimeout(800);
ok((await ann.locator(".thumbs button").count()) === 0 && /No photos yet/.test(await text(ann, "#library")), "ann starts with an empty log");
const png = await ann.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
  const g = c.getContext("2d"), img = g.createImageData(3000, 2000);
  for (let i = 0; i < img.data.length; i++) img.data[i] = (i & 3) === 3 ? 255 : Math.random() * 256;
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png").split(",")[1];
});
await ann.fill("#walkName", "Bo-Kaap");
await ann.setInputFiles("#addFile", { name: "noise.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
await ann.waitForTimeout(4000);
docs = await store(owner);
const annPhoto = Object.entries(under(docs, "photos")).find(([, r]) => r.by === "mock-ann");
const annImage = annPhoto && under(docs, "images")[annPhoto[0]];
ok(!!annPhoto && JSON.stringify(annPhoto[1].uids) === '["mock-ann"]' && !!annImage && JSON.stringify(annImage.uids) === '["mock-ann"]',
  "ann's photo and its image are hers: players, uids, by");
if (annPhoto) console.log(`     stored per photo (3000×2000 of noise, the worst case): image ${annImage.data.length} chars, thumb ${annPhoto[1].thumb.length} chars, ` +
  `${Math.round((annImage.data.length + annPhoto[1].thumb.length) / 1024)} KiB in all`);
ok((await ann.locator(".thumbs button").count()) === 1, "ann sees her one photo, not the owner's");

for (const [who, p, what, fn] of [
  ["ann", ann, "list every photo", c => c.list("photos")],
  ["ann", ann, "read the owner's photo", c => c.load("photos/p1")],
  ["ann", ann, "read the owner's image", c => c.load("images/p1")],
  ["ann", ann, "change the owner's review", c => c.patch("reviews/r1", { reply: "x" })],
  ["ann", ann, "write outside the four collections", c => c.save("state/main", { x: 1 })],
]) ok(await tryC(p, fn) === "permission-denied", `${who} refused: ${what}`);
const mel = await tab(ctx, P + "?mock&as=mel&role=member", "mel");
await mel.waitForTimeout(800);
ok((await mel.locator(".thumbs button").count()) === 0, "mel, a household member, sees none of the owner's photos");
ok(await tryC(mel, c => c.load("images/a1")) === "permission-denied", "mel refused: the owner's image");

// Delete, behind a hold, at the bottom of the photo's page.
await ann.bringToFront();
await ann.locator(".thumbs button").first().click(); await ann.waitForTimeout(500);
await ann.locator("#delPhoto").scrollIntoViewIfNeeded(); await hold(ann, "#delPhoto"); await ann.waitForTimeout(600);
docs = await store(owner);
ok(!under(docs, "photos")[annPhoto[0]] && !under(docs, "images")[annPhoto[0]], "ann deletes her photo and its image, behind a hold");
summary();
await b.close(); srv.close();
