// Rack It 2.30.0, Tournaments Session 5 (rack-it/TOURNAMENT.md §3.8): the bracket view at every
// size it promises. For 3, 8, 13 and 32 players, single and double elimination, half played, at
// 360×640 and 390×844, at the normal text size and the largest, it opens the whole draw on every
// round of both sides and checks the geometry: each line meets a card's middle, no two cards in a
// column overlap, and no card is cut off. Also: Your path at each size, two long names that
// ellipsise instead of wrapping, and reduced motion (no pulse animation). Screenshots go to SHOTS.
//
//   node shared/proofs/rack-it-bracket-sizes.mjs
import { ok, summary, serve, browser, tab, C, shot } from "./h.mjs";
import * as B from "../../rack-it/bracket.js";
const srv = await serve();
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const p = await tab(ctx, R + "?mock=reset", "owner");
await p.waitForTimeout(600);

const LONG = "Bartholomew Featherstonehaugh-Cholmondeley";
// A tournament written straight to the mock store: the owner plus guests, half the matches played.
async function make(n, format){
  const ids = ["mock-uid", ...Array.from({ length: n - 1 }, (_, i) => "g_t" + i)];
  const names = ["Mock", ...ids.slice(1).map((_, i) => i === 0 ? LONG : "Player " + (i + 2))];
  const t = { name: `${n} ${format}`, game: "eight", format, final: format === "double" ? "reset" : "one", third: false,
    race: { w: 3 }, seeding: "random", by: "mock-uid", byName: "Mock", status: "live", createdAt: Date.now(), startedAt: Date.now(),
    players: ids, names, uids: ["mock-uid"], seeds: ids.slice(), results: {} };
  const total = B.state(t).filter(f => f.status !== "bye").length;
  for(let i = 0; i < total / 2; i++){
    const f = B.state(t).find(x => x.status === "ready" && x.a !== "mock-uid" && x.b !== "mock-uid") || B.state(t).find(x => x.status === "ready");
    if(!f) break;
    t.results[f.key] = { ids: [f.a, f.b], a: 3, b: i % 3, w: "a", by: "mock-uid", at: i + 1 };
  }
  const id = "size" + n + format;
  await C(p, (c, a) => c.save("tournaments/" + a.id, a.t), { id, t });
  return id;
}
const open = async id => {
  await p.click('.tabbar button[data-tab="play"]'); await p.waitForTimeout(150);
  await p.click("#toursBtn"); await p.waitForTimeout(200);
  await p.locator("#tourList button", { hasText: id.replace("size", "").replace(/(single|double)/, " $1") }).first().click();
  await p.waitForTimeout(400);
};
// Geometry of the draw as it stands: lines against card middles, overlaps, cards cut off.
const geometry = () => p.evaluate(() => {
  const d = document.querySelector("#tBody .tdraw");
  if(!d) return { err: "no draw" };
  const box = d.getBoundingClientRect();
  const cards = col => [...d.querySelectorAll(`.tcol.${col} .mc`)].map(n => n.getBoundingClientRect());
  const cur = cards("cur"), peek = cards("peek");
  const mids = r => r.top + r.height / 2;
  const near = (y, list) => list.some(r => Math.abs(mids(r) - y) < 2.5);
  const lines = kind => [...d.querySelectorAll(".tl.h." + kind)].map(n => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; });
  const bad = [...lines("a").filter(y => !near(y, cur)).map(y => "a@" + Math.round(y)), ...lines("b").filter(y => !near(y, peek)).map(y => "b@" + Math.round(y))];
  const overlap = list => list.some((r, i) => list.some((q, j) => j > i && r.top < q.bottom - 1 && q.top < r.bottom - 1));
  const cut = [...cur, ...peek].some(r => r.bottom > box.bottom + 1);
  // A card's own text fits its fixed height: nothing inside spills below the card.
  const spill = [...d.querySelectorAll(".mc")].some(c => { const r = c.getBoundingClientRect(); return [...c.children].some(k => k.getBoundingClientRect().bottom > r.bottom + 1); });
  return { bad, overlap: overlap(cur) || overlap(peek), cut, spill, cur: cur.length, peek: peek.length };
});

const SIZES = [[360, 640], [390, 844]];
for(const [w, h] of SIZES) for(const big of [false, true]){
  await p.setViewportSize({ width: w, height: h });
  await p.evaluate(on => { document.documentElement.style.fontSize = on ? "26px" : ""; }, big);
  for(const n of [3, 8, 13, 32]) for(const format of ["single", "double"]){
    const id = await make(n, format);
    await open(id);
    const tag = `${n} ${format} ${w}×${h}${big ? " big text" : ""}`;
    // Your path first (the owner is playing).
    const steps = await p.locator("#tBody .tps").count();
    ok(steps >= 1 && await p.locator("#tBody .tps.now").count() <= 1, `${tag}: Your path, ${steps} steps`);
    if(n === 13 && !big) await shot(p, `sizes-path-${n}-${format}-${w}`);
    await p.locator("#tBody .seg button", { hasText: "Whole draw" }).click(); await p.waitForTimeout(150);
    const sides = format === "double" ? ["Winners' side", "Losers' side"] : [null];
    let rounds = 0, problems = [];
    for(const side of sides){
      if(side){ await p.locator("#tBody .seg button", { hasText: side }).first().click(); await p.waitForTimeout(120); }
      const back = p.locator('#tBody .tround button[aria-label="The round before"]');
      while(await back.isEnabled()){ await back.click(); await p.waitForTimeout(60); }
      for(;;){
        const g = await geometry();
        rounds++;
        if(g.err || g.bad.length || g.overlap || g.cut || g.spill) problems.push(`${side || ""} round ${rounds}: ${JSON.stringify(g)}`);
        const fwd = p.locator('#tBody .tround button[aria-label="The next round"]');
        if(!(await fwd.isEnabled())) break;
        await fwd.click(); await p.waitForTimeout(60);
      }
    }
    ok(!problems.length, `${tag}: ${rounds} rounds, lines meet cards, nothing overlaps or spills` + (problems.length ? " — " + problems.slice(0, 2).join("; ") : ""));
    if((n === 32 || n === 8) && w === 360) { await p.locator("#tBody .seg button", { hasText: "Whole draw" }).click(); await shot(p, `sizes-draw-${n}-${format}-${w}${big ? "-big" : ""}`); }
    // Page never scrolls sideways.
    ok(await p.evaluate(() => document.querySelector("#tBody").scrollWidth <= document.querySelector("#tBody").clientWidth + 1), `${tag}: no sideways scroll`);
  }
}
// A long name ellipsises on one line.
await p.setViewportSize({ width: 360, height: 640 });
await p.evaluate(() => { document.documentElement.style.fontSize = ""; });
await open("size8single");
await p.locator("#tBody .seg button", { hasText: "Whole draw" }).click(); await p.waitForTimeout(150);
const back = p.locator('#tBody .tround button[aria-label="The round before"]');
while(await back.isEnabled()){ await back.click(); await p.waitForTimeout(60); }
const longNm = p.locator("#tBody .tcol.cur .mc .nm", { hasText: "Bartholomew" }).first();
ok(await longNm.evaluate(n => n.scrollWidth > n.clientWidth && getComputedStyle(n).textOverflow === "ellipsis" && n.getBoundingClientRect().height < 40),
  "a long name stays on one line, with an ellipsis");
// Reduced motion: the pulse is there as a class, with no animation.
await p.emulateMedia({ reducedMotion: "reduce" });
await p.locator("#tBody .tcol.cur .mc", { hasText: "to play" }).first().click(); await p.waitForTimeout(250);
await p.locator("body > .scrim:last-of-type .sheet .twnr.go").first().click(); await p.waitForTimeout(300);
ok(await p.evaluate(() => { const c = document.querySelector("#tBody .mc.pulse"); return !!c && getComputedStyle(c).animationName === "none"; }),
  "reduced motion: the jump pulses without animation");

await b.close(); srv.close();
summary();
