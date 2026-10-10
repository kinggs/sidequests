#!/usr/bin/env node
// family-tree/tools/wikitree.mjs — Session 3 step 2b (PLAN.md): link a person to their WikiTree
// profile by id, never copy it (owner, 2026-10-10). For each surname in people.json, WikiTree's
// public searchPerson (100 a page, a second between calls), then matchProfiles: one sure match
// → people[i].wikitree = "<Surname>-<n>"; two or more, or a near miss, → data/wikitree-review.md
// for the owner, not linked. Writes data/wikitree.json ({ personId: wikitreeId }, which parse.mjs
// applies on every run), people.json, and the WikiTree part of parse-report.md. Only ids are
// kept: WikiTree's dates and names are compared in memory and dropped. Run from the repo root:
//
//   node family-tree/tools/wikitree.mjs                    # every surname in the tree
//   node family-tree/tools/wikitree.mjs --surnames INGGS   # just these (comma-separated)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { anyYear, norm, text, writeSection } from "./parse.mjs";

export const API = "https://api.wikitree.com/api.php";
export const APP_ID = "sidequests-family-tree";
const FIELDS = "Id,Name,FirstName,MiddleName,LastNameAtBirth,BirthDate,Father,Mother";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const words = s => norm(s).replace(/[.,]/g, " ").split(" ").filter(w => w && !/^[A-Z]\d+$/.test(w));   // "D1": Jon's prefix
const yearOfIso = d => { const y = Number(String(d || "").slice(0, 4)); return y > 0 ? y : null; };

// Do the given names agree? WikiTree's first name is ours, and its middle names are among ours in
// order (Jon often has more of them).
export function givenAgree(ours, first, middle){
  const o = words(ours), w = [...words(first), ...words(middle)];
  if (!o.length || !w.length || o[0] !== w[0]) return false;
  let i = 1;
  for (const m of w.slice(1)){ while (i < o.length && o[i] !== m) i++; if (i++ >= o.length) return false; }
  return true;
}

// people: people.json rows. profiles: WikiTree searchPerson matches (any surnames).
// → { links: { personId: "Inggs-14" }, ambiguous: [{ profile, people }], near: [{ profile, people, why }], unmatched: [profile] }
export function matchProfiles(people, profiles){
  const byWtId = new Map(profiles.map(p => [p.Id, p]));
  const byId = new Map(people.map(p => [p.id, p]));
  const bySurname = new Map();
  for (const p of people) bySurname.set(norm(p.surname), [...(bySurname.get(norm(p.surname)) || []), p]);
  const parentNames = p => p.parents.map(id => byId.get(id)).filter(Boolean).map(q => words(q.given)[0] + " " + norm(q.surname)).sort();
  const wtParentNames = w => [w.Father, w.Mother].map(id => byWtId.get(id)).filter(Boolean).map(q => words(q.FirstName)[0] + " " + norm(q.LastNameAtBirth)).sort();
  const out = { links: {}, ambiguous: [], near: [], unmatched: [] };
  const claims = new Map();
  for (const w of profiles){
    const pool = (bySurname.get(norm(w.LastNameAtBirth)) || []).filter(p => givenAgree(p.given, w.FirstName, w.MiddleName));
    const wy = yearOfIso(w.BirthDate);
    const hits = pool.filter(p => {
      const py = anyYear(p.birth);
      if (py && wy) return py === wy;
      if (!py && !wy){ const a = parentNames(p), b = wtParentNames(w); return a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]); }
      return false;
    });
    if (hits.length === 1) claims.set(hits[0].id, [...(claims.get(hits[0].id) || []), w]);
    else if (hits.length > 1) out.ambiguous.push({ profile: w.Name, people: hits.map(p => p.id) });
    else if (pool.length) out.near.push({ profile: w.Name, people: pool.map(p => p.id), why: wy ? "birth year differs or ours is missing" : "no birth year on WikiTree, parents don't settle it" });
    else out.unmatched.push(w.Name);
  }
  for (const [pid, ws] of claims){
    if (ws.length === 1) out.links[pid] = ws[0].Name;
    else out.ambiguous.push({ profile: ws.map(w => w.Name).join(", "), people: [pid] });
  }
  return out;
}

// Every profile WikiTree has with this surname at birth (and this first name, when given), 100 at
// a time. A search that would run past `cap` profiles stops at the first page and says so
// ({ tooMany: true }): a common surname is searched person by person instead.
export async function search(surname, { first = "", cap = Infinity, fetchImpl = fetch, wait = sleep, pause = 1100, log = console.error } = {}){
  const all = [];
  for (let start = 0; ; start += 100){
    let body, tries = 0;
    for (;;){
      const url = `${API}?appId=${APP_ID}&action=searchPerson&LastName=${encodeURIComponent(surname)}${first ? `&FirstName=${encodeURIComponent(first)}` : ""}&limit=100&start=${start}&fields=${FIELDS}`;
      const res = await fetchImpl(url, { headers: { "user-agent": `${APP_ID} (read-only, one request a second)` } });
      body = res.ok ? await res.json() : null;
      const status = body?.[0]?.status;
      if (res.ok && status !== "Limit exceeded.") break;
      if (++tries > 5) throw new Error(`WikiTree ${surname}: ${res.status} ${status || ""}`);
      log(`  WikiTree busy (${res.status} ${status || ""}), waiting ${30 * tries}s`);
      await wait(30000 * tries);
    }
    await wait(pause);
    const r = body?.[0] || {};
    if ((r.total || 0) > cap) return Object.assign([], { tooMany: true, total: r.total });
    const rows = (r.matches || []).filter(m => norm(m.LastNameAtBirth) === norm(surname));
    all.push(...rows);
    if (!r.matches?.length || start + 100 >= (r.total || 0)) break;
  }
  return all;
}

export async function run(dataDir, { surnames = null, log = console.error } = {}){
  const file = path.join(dataDir, "people.json");
  const people = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = surnames || [...new Set(people.map(p => p.surname).filter(s => s && /^[A-Z' -]+$/i.test(s)))].sort((a, b) => a === "INGGS" ? -1 : b === "INGGS" ? 1 : a < b ? -1 : 1);
  const profiles = [];
  let n = 0;
  const seen = new Set();
  const keep = rows => { for (const r of rows) if (!seen.has(r.Id)){ seen.add(r.Id); profiles.push(r); } };
  for (const s of names){
    let got = await search(s, { cap: 500, log });
    if (got.tooMany){
      // A common surname: one search per first name of ours that carries it.
      const firsts = [...new Set(people.filter(p => norm(p.surname) === norm(s)).map(p => text(p.given).split(" ").find(w => !/^[A-Z]\d+$/.test(w))).filter(Boolean))];
      got = [];
      for (const f of firsts) got.push(...await search(s, { first: f, cap: 500, log }).then(r => r.tooMany ? [] : r));
    }
    keep(got);
    if (++n % 25 === 0 || got.length) log(`  ${n}/${names.length} ${got.length ? `${s}: ${got.length}` : ""}`);
  }
  const m = matchProfiles(people, profiles);
  for (const p of people){ if (m.links[p.id]) p.wikitree = m.links[p.id]; else delete p.wikitree; }
  fs.writeFileSync(file, JSON.stringify(people, null, 1) + "\n");
  fs.writeFileSync(path.join(dataDir, "wikitree.json"), JSON.stringify(m.links, null, 1) + "\n");
  const byId = new Map(people.map(p => [p.id, p]));
  const who = id => { const p = byId.get(id); return `${p.name} (${[p.birth.date, p.death.date].filter(Boolean).join(" – ") || "no dates"}; \`${id}\`)`; };
  const link = name => `[${name}](https://www.wikitree.com/wiki/${name})`;
  fs.writeFileSync(path.join(dataDir, "wikitree-review.md"), `# WikiTree: for the owner to decide

Matches the tool wouldn't make on its own (\`wikitree.mjs\`). Our record is Jon's 2006 tree; the
WikiTree side is a link only (nothing of WikiTree's is kept here). To link one, add it to
\`wikitree.json\` by hand (\`"<person id>": "<WikiTree id>"\`) and re-run the seed.

## Several of ours fit one profile (${m.ambiguous.length})

${m.ambiguous.map(a => `- ${link(a.profile.split(", ")[0])}${a.profile.includes(",") ? ` (and ${a.profile})` : ""}: ${a.people.map(who).join("; ")}`).join("\n") || "- none"}

## Names agree, years don't settle it (${m.near.length})

${m.near.map(a => `- ${link(a.profile)}: ${a.people.map(who).join("; ")} — ${a.why}`).join("\n") || "- none"}
`);
  writeSection(path.join(dataDir, "parse-report.md"), "wikitree", `## WikiTree (\`wikitree.mjs\`, ${new Date().toISOString().slice(0, 10)})

${names.length} surnames searched, ${profiles.length} profiles. **Linked: ${Object.keys(m.links).length}.** For the owner (\`wikitree-review.md\`): ${m.ambiguous.length} ambiguous, ${m.near.length} near misses. With no match in the 2006 tree: ${m.unmatched.length} (Jon's newer work, Parked: "Also on WikiTree").`);
  return { surnames: names.length, profiles: profiles.length, linked: Object.keys(m.links).length, ambiguous: m.ambiguous.length, near: m.near.length, unmatched: m.unmatched.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data"), s = process.argv.indexOf("--surnames");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  run(dataDir, { surnames: s > 0 ? process.argv[s + 1].split(",") : null }).then(r => console.log(JSON.stringify(r)));
}
