// Session 6b's proof (KIT-HISTORY.md): one admin in Rack It.
//
//   node shared/proofs/rack-it-one-admin.mjs                      B and C below
//   OLD=<git rev> node shared/proofs/rack-it-one-admin.mjs        and D, against that build
//   OLD=<git rev> SEED=<export.json> node shared/proofs/…         and A
//
// A. The backfill on a seed, old build against new. The seed is a Rack It export whose claimed
//    household people carry a mock uid (`uid: "mock-uid"`, `"mock-mel"`), so the tabs below are
//    them. The owner's real export is never committed: the repo is public.
// B. Three tabs: the owner, Melanie as a household member who isn't the owner, Ann.
// C. Rack It signed out.
// D. The other apps as a member, old build against new: page text must match, so it only
//    holds across builds that didn't change those apps.
import fs from "node:fs";
import { ok, summary, errors, ROOT, oldBuild, serve, browser, tab, C, tryC, text, store, scoreLeague, RACKS, matchesOf, ratingsOf, startMatch } from "./h.mjs";
const NEW = ROOT, OLD = process.env.OLD ? oldBuild(process.env.OLD) : null;
const SEEDFILE = process.env.SEED || null;
const tabTo = async (p, t) => { await p.bringToFront(); await p.click(`.tabbar button[data-tab="${t}"]`); await p.waitForTimeout(400); };
const rows = async p => (await p.locator("#histList > li").allInnerTexts()).map(t => t.replace(/\n+/g, " · "));
const section = (t, from, to) => { const s = t.indexOf(from), e = t.indexOf(to, s + 1); return s < 0 ? "" : t.slice(s, e < 0 ? undefined : e).replace(/\n+/g, " | "); };

// ---- A. The seed: old build against new ----
async function seedRun(root, label){
  const srv = await serve(root, { "/__seed/seed.json": SEEDFILE });
  const { b, ctx } = await browser();
  const logs = [];
  ctx.on("console", m => logs.push(m.text()));
  const R = srv.base + "/rack-it/";
  const owner = await tab(ctx, R + "?mock=reset&seed=/__seed/seed.json", label + " owner");
  await owner.waitForTimeout(2500);
  const out = { label, logs };
  out.matchesAfterLoad = Object.fromEntries((await matchesOf(owner)).map(({ id, ...m }) => [id, m]));
  await tabTo(owner, "ratings"); out.ratings = await text(owner, "#playerList");
  await tabTo(owner, "matches"); out.ownerRows = await rows(owner);
  // Melanie, a household member, before Rebuild is touched: her Matches and her own page.
  const mel = await tab(ctx, R + "?mock&as=mel&role=member", label + " mel");
  await mel.waitForTimeout(1200);
  await tabTo(mel, "matches"); out.melRows = await rows(mel);
  await tabTo(mel, "ratings");
  await mel.locator("#playerList button", { hasText: /Mel/ }).filter({ hasText: "you" }).first().click(); await mel.waitForTimeout(500);
  const page = await text(mel, "#scrPerson");
  out.melRecord = section(page, "RECORD", "MATCHES");
  out.melPageMatches = await mel.locator("#scrPerson li").count();
  await tabTo(owner, "more"); await owner.click("#rebuildBtn"); await owner.waitForTimeout(1500);
  out.rebuild = await text(owner, "#rebuild .card");
  await owner.click("#rbApply"); await owner.waitForTimeout(2500);
  await owner.click("#rebuildBtn").catch(() => {}); await owner.waitForTimeout(1500);
  out.rebuildAgain = await text(owner, "#rebuild .card");
  await owner.click("#rbCancel").catch(() => {});
  await tabTo(owner, "ratings"); out.ratingsAfter = await text(owner, "#playerList");
  out.ratingDocs = await ratingsOf(owner);
  await b.close(); srv.close();
  return out;
}
if (OLD && SEEDFILE){
const seed = JSON.parse(fs.readFileSync(SEEDFILE, "utf8"));
const seedMatches = Object.fromEntries(seed.matches.map(({ id, ...m }) => [id, m]));
const oldRun = await seedRun(OLD, "old");
const newRun = await seedRun(NEW, "new");

// A match between two claimed people (Kenny v Melanie in the owner's export).
const uidOf = id => ((seed.people || {})[id] || {}).uid;
const KM = id => { const m = seedMatches[id]; return [m.playerA, m.playerB].every(uidOf); };
const nm = newRun.matchesAfterLoad;
const touched = Object.entries(nm).filter(([id, m]) => !Array.isArray(seedMatches[id].uids) && Array.isArray(m.uids));
ok(touched.length === seed.matches.length, `the backfill gave all ${seed.matches.length} seed matches uids (${touched.length})`);
ok(newRun.logs.some(l => l === `[backfill] gave ${seed.matches.length} matches their uids`), "the owner's phone logged: " + (newRun.logs.find(l => /\[backfill\]/.test(l)) || "nothing"));
const extraKeys = new Set();
for (const [id, m] of Object.entries(nm)){
  const was = seedMatches[id];
  for (const k of new Set([...Object.keys(was), ...Object.keys(m)]))
    if (JSON.stringify(was[k]) !== JSON.stringify(m[k])) extraKeys.add(k);
}
ok([...extraKeys].sort().join(",") === "_updatedAt,names,playerA,playerB,uids", "nothing else in a match changed: " + [...extraKeys].sort().join(", "));
const km = Object.entries(nm).filter(([id]) => KM(id));
ok(km.every(([, m]) => JSON.stringify([...m.uids].sort()) === '["mock-mel","mock-uid"]'), `${km.length} Kenny v Melanie matches: uids [mock-uid, mock-mel]`);
ok(km.every(([, m]) => ["mock-uid", "mock-mel"].includes(m.playerA) && ["mock-uid", "mock-mel"].includes(m.playerB) && m.playerA !== m.playerB), "and their players rewritten to the two uids, sides kept");
ok(km.every(([id, m]) => uidOf(seedMatches[id].playerA) === m.playerA && uidOf(seedMatches[id].playerB) === m.playerB), "every side kept: each claimed person's old id became their uid");
const other = Object.entries(nm).filter(([id]) => !KM(id));
ok(other.every(([id, m]) => { const was = seedMatches[id], acct = [was.playerA, was.playerB].map(uidOf).filter(Boolean);
    return JSON.stringify(m.uids) === JSON.stringify(acct) && [["playerA", "a"], ["playerB", "b"]].every(([k]) => uidOf(was[k]) ? m[k] === uidOf(was[k]) : m[k] === was[k]); }),
  `${other.length} match(es) with one account: uids is that account, and the other player keeps their person id`);
const done = id => seedMatches[id].status === "done";
const melDone = Object.keys(seedMatches).filter(id => done(id) && KM(id)).length;
ok(newRun.melRows.length === melDone && newRun.melRows.every(r => /Kenny/.test(r) && /Mel/.test(r)), `new build: Melanie's Matches lists her ${melDone} pre-2.8.0 matches with Kenny (${newRun.melRows.length} rows)`);
const otherDone = other.filter(([id]) => done(id)).length;
ok(newRun.ownerRows.length === melDone + otherDone, `the owner's Matches lists all ${newRun.ownerRows.length}`);
ok(newRun.melRecord && newRun.melRecord === oldRun.melRecord, `Melanie's own page, new against old: the same record\n     ${newRun.melRecord}\n     (old: ${oldRun.melRecord})`);
ok(newRun.melPageMatches === oldRun.melPageMatches && newRun.melPageMatches >= melDone, `and the same ${newRun.melPageMatches} matches on it (old: ${oldRun.melPageMatches})`);
ok(oldRun.ratings === newRun.ratings, "Ratings, old against new, before Rebuild: identical\n     " + newRun.ratings.replace(/\n+/g, " | "));
ok(oldRun.rebuild === newRun.rebuild, "Rebuild's proposal, old against new: identical\n     " + newRun.rebuild.replace(/\n+/g, " | "));
ok(oldRun.ratingsAfter === newRun.ratingsAfter && JSON.stringify(Object.keys(oldRun.ratingDocs).sort()) === JSON.stringify(Object.keys(newRun.ratingDocs).sort())
  && Object.keys(newRun.ratingDocs).every(k => ["zargo", "robustness", "sessions"].every(f => oldRun.ratingDocs[k][f] === newRun.ratingDocs[k][f])),
  "after Apply: the same Ratings page and the same ratings/ documents, to full precision");
ok(/Nothing to change/.test(newRun.rebuildAgain) && oldRun.rebuildAgain === newRun.rebuildAgain, "Rebuild again: " + newRun.rebuildAgain.replace(/\n+/g, " | "));
} else console.log("SKIP A: needs OLD=<git rev> and SEED=<export.json>");

// ---- B. Three tabs: the owner, Melanie (a member), Ann ----
const srv = await serve(NEW);
const { b, ctx } = await browser();
const R = srv.base + "/rack-it/";
const owner = await tab(ctx, R + "?mock=reset", "owner");
const mel = await tab(ctx, R + "?mock&as=mel&role=member", "mel");
const ann = await tab(ctx, R + "?mock&as=ann", "ann");
for (const [n, p] of [["mel", mel], ["ann", ann]])
  ok(!/Before you play/.test(await p.locator("body").innerText()) && await p.locator("#hhNote").count() === 0, `${n}: no "Before you play" note`);
ok(await C(mel, c => c.role()) === "member", "mel is a household member (role member)");
for (const [n, p] of [["mel", mel], ["ann", ann]]){
  const code = await C(owner, c => c.account.invite());
  await p.goto(R + `?mock&as=${n}&i=` + code); await p.waitForTimeout(900);
  ok(/connected with Mock Player/i.test(await text(p, ".cn-ov")), `${n}: ${await text(p, ".cn-ov h2")}`);
  await p.locator(".cn-ov button", { hasText: "Done" }).click(); await p.waitForTimeout(300);
}
const docs0 = await store(owner);
ok(!Object.entries(docs0).some(([k, v]) => k.startsWith("sidequests/_shared/people/") && v.uid === "mock-mel"), "Rack It didn't put Melanie on the household list");
await tabTo(mel, "more");
ok(!(await mel.locator("#familyBtn").isVisible()) && !(await mel.locator("#importBtn").isVisible()) && !(await mel.locator("#rebuildBtn").isVisible())
  && await mel.locator("#qrBtn").isVisible() && await mel.locator("#exportBtn").isVisible(), "mel's More: My QR and Export, no Invites, Import or Rebuild");
await tabTo(owner, "more");
ok(await owner.locator("#familyBtn").isVisible() && await owner.locator("#rebuildBtn").isVisible() && await owner.locator("#importBtn").isVisible(), "the owner's More keeps Invites, Import and Rebuild");
ok(await startMatch(owner, { b: "Mel", rated: true }), "owner: Rated offered against Melanie");
await scoreLeague(owner, RACKS);
let pend = (await matchesOf(owner)).find(m => m.status === "pending");
ok(pend && JSON.stringify(pend.uids) === '["mock-uid","mock-mel"]', "owner v mel saved as pending, uids " + (pend && pend.uids));
await mel.waitForTimeout(500);
ok(/rated/.test(await text(mel, "#pendWho")) && await mel.locator("#pendGo").isVisible(), "mel's strip: " + await text(mel, "#pendWho"));
await mel.bringToFront(); await mel.click("#pendGo"); await mel.waitForTimeout(700);
const rt = await ratingsOf(owner);
pend = (await matchesOf(owner)).find(m => m.id === pend.id);
ok(pend.status === "done" && pend.confirmedBy === "mock-mel" && rt["mock-uid"].match === pend.id && rt["mock-mel"].match === pend.id, "mel confirmed: both ratings moved, naming the match");
await startMatch(owner, { b: "Ann" }); await scoreLeague(owner, RACKS);
await tabTo(mel, "play");
const melPicker = await (async () => { await mel.click("#pickB"); await mel.waitForTimeout(300); const t = await text(mel, ".pk-ov .pk-list"); await mel.locator('.pk-ov [data-k="cancel"]').click(); return t; })();
ok(/Mel/.test(melPicker) && /Mock Player/.test(melPicker) && !/Ann/.test(melPicker), "mel's picker: herself and her friends only: " + melPicker.replace(/\n+/g, " | "));
await startMatch(mel, { b: "Mock Player" }); await scoreLeague(mel, RACKS);
const all = await matchesOf(owner);
ok(all.length === 3, "three matches saved");
await tabTo(owner, "matches"); await tabTo(mel, "matches"); await tabTo(ann, "matches");
const [or, mr, ar] = [await rows(owner), await rows(mel), await rows(ann)];
ok(or.length === 3 && or.filter(r => /Ann/.test(r)).length === 1 && or.filter(r => /Mel/.test(r)).length === 2, "the owner sees all three: " + or.join(" / "));
ok(mr.length === 2 && !mr.some(r => /Ann/.test(r)), "mel sees her two with the owner, not Ann's: " + mr.join(" / "));
ok(ar.length === 1 && /Ann/.test(ar[0]), "ann sees only hers: " + ar.join(" / "));
await mel.evaluate(() => { window.__appQueries = window.__mockQueries; window.__mockQueries = null; });
const annMatch = all.find(m => m.uids.includes("mock-ann")).id;
const refused = {
  "list ratings": c => c.list("ratings"),
  "list starters": c => c.list("starters"),
  "list matches bare": c => c.list("matches"),
  "list matches newest first, as the household did": c => c.list("matches", { orderBy: "startedAt", desc: true, limit: 300 }),
  "read Ann's match with the owner": (c, a) => c.load("matches/" + a.annMatch),
  "write state/main": c => c.save("state/main", { config: { K: 99 } }),
  "write a starter": c => c.save("starters/g_x", { zargo: 420 }),
  "write a rating outside a confirmation": c => c.save("ratings/mock-mel", { zargo: 900 }),
  "change a saved match she's in": (c, a) => c.patch("matches/" + a.rated, { zargoAfter: { a: 1, b: 999 } }),
  "delete a saved match she's in": (c, a) => c.delete("matches/" + a.rated),
  "change Ann's match": (c, a) => c.patch("matches/" + a.annMatch, { totals: { a: 0, b: 9 } }),
};
for (const [name, fn] of Object.entries(refused))
  ok(await tryC(mel, fn, { annMatch, rated: pend.id }) === "permission-denied", "mel refused: " + name);
ok(await C(mel, c => c.list("matches", { where: ["uids", "array-contains", "mock-mel"] }).then(r => r.length)) === 2, "mel lists her own two with the uids filter");
await mel.evaluate(() => { window.__mockQueries = window.__appQueries; });
const qs = (await mel.evaluate(() => window.__mockQueries)).filter(q => q.col === "sidequests/rack-it/matches");
ok(qs.length > 0 && qs.every(q => JSON.stringify(q.opts.where) === '["uids","array-contains","mock-mel"]' && !q.opts.orderBy), `mel's phone ran ${qs.length} matches queries, every one filtered by her uid`);

// ---- C. Rack It signed out ----
await C(owner, c => c.signOut());
await owner.goto(R + "?mock"); await owner.waitForTimeout(900);
ok(await owner.locator("#signInBig").isVisible(), "signed out: Sign in shows");
await b.close(); srv.close();

// ---- D. The other apps, as a household member: old build against new ----
async function appRun(root, app){
  const srv = await serve(root);
  const { b, ctx } = await browser();
  const before = errors.length;
  const p = await tab(ctx, `${srv.base}/${app}/?mock=reset`, app + " owner");
  await p.waitForTimeout(600);
  const m = await tab(ctx, `${srv.base}/${app}/?mock&as=mel&role=member`, app + " mel");
  await m.waitForTimeout(1200);
  const out = {
    text: (await m.locator("body").innerText()).replace(/v\d+\.\d+\.\d+/g, "v…"),
    role: await C(m, c => c.role()),
    read: await tryC(m, c => c.load("state/main")),
    people: await m.evaluate(async () => (await import("/shared/people.js")).people.active().map(x => x.name)),
    errs: errors.length - before,
  };
  await b.close(); srv.close();
  return out;
}
if (OLD) for (const app of ["bloc-11", "around-the-clock", "zombie-dice", "photo-coach"]){
  const o = await appRun(OLD, app), n = await appRun(NEW, app);
  ok(n.role === "member" && n.read === "allowed" && n.errs === 0 && o.text === n.text && JSON.stringify(o.people) === JSON.stringify(n.people),
    `${app} as a member: role ${n.role}, reads its data (${n.read}), household list [${n.people}], page text identical to the old build (${n.text.length} chars)`);
}
else console.log("SKIP D: needs OLD=<git rev>");
summary();
