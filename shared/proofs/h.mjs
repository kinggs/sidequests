// Helpers for the multi-tab ?mock proofs in this folder: one browser, a tab per fake user, and
// the fake cloud's store read straight out of localStorage.
//
//   const srv = await serve();                       // this repo (or serve(oldBuild("2.10.1")))
//   const { b, ctx } = await browser();
//   const owner = await tab(ctx, srv.base + "/rack-it/?mock=reset", "owner");
//   const ann   = await tab(ctx, srv.base + "/rack-it/?mock&as=ann", "ann");
//   await tryC(ann, c => c.list("matches"))           // "allowed", or the refusal's code
//
// Every page error, console.error, refusal warning and dialog lands in `errors`. Screenshots go
// to SHOTS (default: a folder in the system temp dir).

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, launch, serve } from "./pw.mjs";
export { ROOT, serve };

export const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "sidequests-shots");
export const errors = [];

let passed = 0, failed = 0;
export function ok(cond, msg){
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (cond) passed++; else { failed++; process.exitCode = 1; }
}
export function summary(){
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No page errors, console errors or refusal warnings.");
  if (errors.length) process.exitCode = 1;
  console.log(`${passed} passed, ${failed} failed.`);
}

// The repo as it was at a git revision, unpacked once into the temp dir: the "old build" side
// of an old-against-new proof.
export function oldBuild(rev){
  const sha = execSync(`git rev-parse --short ${rev}`, { cwd: ROOT }).toString().trim();
  const dir = path.join(os.tmpdir(), "sidequests-" + sha);
  if (!fs.existsSync(path.join(dir, "shared"))){
    fs.mkdirSync(dir, { recursive: true });
    execSync(`git archive ${sha} | tar -x -C ${dir}`, { cwd: ROOT });
  }
  return dir;
}

export async function browser(){
  const b = await launch();
  if (!b) process.exit(2);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  // The fake cloud pushes every list and watchList it runs here (cloud-memory.js, logQuery).
  await ctx.addInitScript(() => { window.__mockQueries = []; });
  return { b, ctx };
}

export async function tab(ctx, url, name){
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name} pageerror: ${e.message}`));
  p.on("console", m => {
    if (m.type() === "error") errors.push(`${name} console.error: ${m.text()}`);
    if (m.type() === "warning" && /permission|refused|denied/i.test(m.text())) errors.push(`${name} warn: ${m.text()}`);
  });
  p.on("dialog", d => { errors.push(`${name} dialog: ${d.message()}`); d.dismiss(); });
  await p.goto(url); await p.waitForTimeout(800);
  return p;
}

// Run fn(cloud, arg) in the page with the app's own cloud module (one instance per URL).
export const C = (p, fn, arg) => p.evaluate(async ([src, arg]) => {
  const { cloud } = await import("/shared/cloud.js");
  return (0, eval)(src)(cloud, arg);
}, [fn.toString(), arg]);
// The same, answering "allowed" or the refusal's code.
export const tryC = (p, fn, arg) => C(p, `async (cloud, arg) => { try { await (${fn})(cloud, arg); return "allowed"; } catch(e){ return e.code || e.message; } }`, arg);
export const store = p => p.evaluate(() => JSON.parse(localStorage.getItem("cloud-memory")).docs);
export const text = (p, sel) => p.locator(sel).innerText().catch(() => "");
export async function hold(p, sel, ms = 750){
  const b = await p.locator(sel).boundingBox();
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up();
}
export function shot(p, name){
  fs.mkdirSync(SHOTS, { recursive: true });
  return p.screenshot({ path: path.join(SHOTS, name + ".png") });
}

// ---- Rack It ----
export async function pickSlot(p, slot, name){
  await p.click(slot); await p.waitForTimeout(250);
  await p.locator(".pk-pick", { hasText: name }).first().click(); await p.waitForTimeout(250);
}
// Score an 11-Point-Nine match: racks of [side, ball] taps, then hold End and Save. Returns the
// result card's text.
export async function scoreLeague(p, racks){
  await p.bringToFront();
  const done = () => p.locator("#done").isVisible();
  for (let i = 0; i < racks.length; i++){
    for (const [side, n] of racks[i]){
      await p.click(side === "a" ? "#sideA" : "#sideB");
      await p.click(`#rack button[aria-label="Ball ${n}"]`);
    }
    await p.waitForTimeout(600);
    if (i === racks.length - 1) break;
    if (!(await done())) { await p.click("#next"); await p.waitForTimeout(200); }
    if (await done()) await p.click("#doneNext");
    await p.waitForTimeout(150);
  }
  for (let k = 0; k < 3 && await done() && !/Save match/.test(await p.locator("#doneNext").innerText()); k++){
    await p.click("#doneNext"); await p.waitForTimeout(250);
  }
  if (!(await done())) { await hold(p, "#end"); await p.waitForTimeout(300); }
  if (!(await done())) { await shot(p, "stuck"); throw new Error(`no result card; see ${SHOTS}/stuck.png`); }
  const card = await p.locator("#done").innerText();
  await p.click("#doneNext"); await p.waitForTimeout(500);
  return card;
}
export const RACKS = [[["a",1],["a",2],["a",3],["a",4],["a",5],["b",6],["b",7],["b",8],["b",9]],
                      [["b",1],["b",2],["a",3],["a",4],["a",5],["a",6],["a",7],["a",8],["a",9]]];
const under = (prefix, docs) => Object.entries(docs).filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"));
export const matchesOf = async p => under("sidequests/rack-it/matches/", await store(p)).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
export const ratingsOf = async p => Object.fromEntries(under("sidequests/rack-it/ratings/", await store(p)).map(([k, v]) => [k.split("/").pop(), v]));
// Start a match from Play; returns whether Rated was offered.
export async function startMatch(p, { a, b, rated = false }){
  await p.bringToFront();
  await p.click('.tabbar button[data-tab="play"]'); await p.waitForTimeout(250);
  if (a) await pickSlot(p, "#pickA", a);
  if (b) await pickSlot(p, "#pickB", b);
  const offered = await p.locator("#ratedBtn").isVisible();
  if (rated) await p.click("#ratedBtn");
  const label = await p.locator("#startBtn").innerText();
  await p.click("#startBtn", { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(400);
  if (!(await p.locator("#scrLive").isVisible())){
    await shot(p, "nostart");
    throw new Error(`match didn't start: Start said "${label}", A "${await text(p, "#pickA")}", B "${await text(p, "#pickB")}"`);
  }
  return offered;
}

// ---- the account sheet (ui.account): your avatar in the showing page's header ----
// Its items' labels, then closed again.
export async function accountItems(p){
  await p.bringToFront();
  await p.locator(".me:visible").first().click(); await p.waitForTimeout(300);
  const items = await p.locator(".scrim .sheet button").allInnerTexts();
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  return items.filter(t => t !== "Cancel");
}
// Open the account sheet and tap one item.
export async function account(p, label){
  await p.bringToFront();
  await p.locator(".me:visible").first().click(); await p.waitForTimeout(300);
  await p.locator(".scrim .sheet button", { hasText: label }).first().click(); await p.waitForTimeout(300);
}
