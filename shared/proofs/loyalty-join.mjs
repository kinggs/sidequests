// Sessions Loyalty 0.4.0: joining from the staff QR, and being made staff without a reload.
//   Ann scans the owner's Sign up QR: she's connected, her card is made, the owner's phone opens it.
//   Ben was already the owner's friend: scanning the same QR still makes his card and opens it.
//   Cat opens the app with no QR and joins with the Join button.
//   The owner makes Ann staff from Add staff's list: Ann's phone changes to the staff side by itself.
//   A member can't give themselves points or a second card.
import { browser, tab, serve, ok, summary, C, tryC, store, text } from "./h.mjs";

const srv = await serve();
const { b, ctx } = await browser();
const L = srv.base + "/sessions-loyalty/";
const wait = (p, ms = 700) => p.waitForTimeout(ms);
const press = async (p, label) => { await p.locator("button", { hasText: label }).first().click(); await wait(p, 500); };

const owner = await tab(ctx, L + "?mock=reset", "owner");
await wait(owner, 900);
const code = await C(owner, c => c.account.invite());

// Ben is already a friend (met in Rack It).
const ben0 = await tab(ctx, srv.base + "/rack-it/?mock&as=ben&i=" + code, "ben-rackit");
await wait(ben0, 1200);
await ben0.close();
let st = await store(owner);
ok(!!st["friendships/mock-ben_mock-uid"], "Ben and the owner are already friends");
ok(!st["sidequests/sessions-loyalty/cards/mock-ben"], "…and Ben has no card yet");

// The owner shows Sign up's QR.
await owner.bringToFront();
await press(owner, "Sign up a new member");
ok(/My QR/i.test(await text(owner, ".cn-ov")), "Sign up shows the owner's QR");

// Ann scans it with her camera: the link opens the loyalty app.
const ann = await tab(ctx, L + "?mock&as=ann&i=" + code, "ann");
await wait(ann, 1200);
ok(/connected with/i.test(await text(ann, ".cn-ov")), "Ann's phone says she's connected");
await press(ann, "Done");
await wait(ann, 900);
st = await store(owner);
ok(!!st["sidequests/sessions-loyalty/cards/mock-ann"], "Ann has a card");
ok(/Member since/.test(await text(ann, "#main")), "Ann's phone shows her card");
await owner.bringToFront(); await wait(owner, 2200);
ok(!(await owner.locator(".cn-ov").count()), "the owner's QR closed");
ok(/Log a spend/.test(await text(owner, "#main")) && /Ann/i.test(await text(owner, "#main")), "…and the owner's phone opened Ann's page");

// Ben, already a friend, scans the same QR.
await press(owner, "Back");
await owner.locator("#tabs button", { hasText: "Scan" }).first().click(); await wait(owner, 400);
await press(owner, "Sign up a new member");
const ben = await tab(ctx, L + "?mock&as=ben&i=" + code, "ben");
await wait(ben, 1200);
ok(/already connected/i.test(await text(ben, ".cn-ov")), "Ben's phone says he's already connected");
await press(ben, "Done");
await wait(ben, 900);
st = await store(owner);
ok(!!st["sidequests/sessions-loyalty/cards/mock-ben"], "Ben has a card all the same");
await owner.bringToFront(); await wait(owner, 900);
ok(!(await owner.locator(".cn-ov").count()) && /Log a spend/.test(await text(owner, "#main")) && /Ben/i.test(await text(owner, "#main")), "…and the owner's phone opened Ben's page");

// Cat has no QR at all: Join.
const cat = await tab(ctx, L + "?mock&as=cat", "cat");
await wait(cat, 900);
ok(/Not a member yet/.test(await text(cat, "#main")), "Cat sees Not a member yet");
await press(cat, "Join ");
await wait(cat, 700);
ok(/Member since/.test(await text(cat, "#main")), "Cat joined with the button");
ok(await tryC(cat, c => c.patch("cards/mock-cat", { points: 9000 })) !== "allowed", "Cat can't give herself points");
ok(await tryC(cat, c => c.save("cards/mock-dan", { uid: "mock-dan", name: "Dan", since: 1, memberNo: "", status: "casual", points: 0, xp: 0, lastAt: 0, by: "mock-cat" })) !== "allowed", "…or make someone else's card");

// The owner logs Ann a spend, then makes her staff from the list.
await owner.bringToFront();
await press(owner, "Back");
await owner.locator("#tabs button", { hasText: "More" }).first().click(); await wait(owner, 400);
await press(owner, "Add staff");
ok(/Ann/.test(await text(owner, ".sheet, [role=dialog]")), "Add staff lists the members");
await ann.bringToFront(); await owner.bringToFront();
await owner.locator(".sheet button, [role=dialog] button", { hasText: "Ann" }).first().click();
await wait(owner, 800);
st = await store(owner);
ok(!!st["sidequests/sessions-loyalty/staff/mock-ann"], "Ann is on the staff list");
await ann.bringToFront(); await wait(ann, 1500);
ok(/Scan a member's QR/.test(await text(ann, "#main")), "Ann's phone changed to the staff side with no reload");
ok(await tryC(ann, c => c.list("cards")) === "allowed", "…and she reads the members");

// Ann, now staff, signs Dan up from her own QR.
const annCode = await C(ann, c => c.account.invite());
await press(ann, "Sign up a new member");
const dan = await tab(ctx, L + "?mock&as=dan&i=" + annCode, "dan");
await wait(dan, 1200);
await press(dan, "Done");
await wait(dan, 900);
await ann.bringToFront(); await wait(ann, 2200);
ok(/Log a spend/.test(await text(ann, "#main")) && /Dan/i.test(await text(ann, "#main")), "Ann signed Dan up from her QR and his page opened");

// Taken off the list: back to the member side.
await press(ann, "Back");
await owner.bringToFront();
await C(owner, c => c.delete("staff/mock-ann"));
await ann.bringToFront(); await wait(ann, 1500);
ok(!/Scan a member's QR/.test(await text(ann, "#main")), "taken off the staff list, Ann is a member again");

summary();
await b.close(); srv.close();
