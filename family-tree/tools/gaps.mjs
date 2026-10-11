#!/usr/bin/env node
// family-tree/tools/gaps.mjs — Session 6 (PLAN.md, Session 5's design): what's missing from the tree,
// as research briefs, ranked. A brief is one gap in one person's record, for one agent to research
// (tools/research/AGENT.md); its id, `<kind>.<person id>`, never changes. Nobody living is briefed
// without their consent (kin.js researchable). A brief is done once a finding names it.
// Run from the repo root:
//
//   node family-tree/tools/gaps.mjs            # rank everything, write the next 10 briefs
//   node family-tree/tools/gaps.mjs --take 3   # …or the next 3

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isLiving, isPresumedDead, researchable, yearIn, wtSummary, dayText } from "../kin.js";
import { findPeople, slug } from "./parse.mjs";
import { SOURCES, consentFrom } from "./research.mjs";

// The gap kinds, in the order they rank within a tier.
export const KINDS = ["parents", "birth", "death", "refs", "story"];
export const MISSING = {
  parents: "their parents",
  birth: "their birth: date and place",
  death: "their death: date and place",
  refs: "a parent, spouse or child Jon named who isn't in the tree",
  story: "who this person in Jon's story was",
};
const blank = ev => !(ev && (ev.date || ev.place));

// The gaps in one person's record, in KINDS order. Death only when they are dead or presumed so.
export function gapsOf(p, byId, now = new Date()){
  const out = [];
  if (!(p.parents || []).length) out.push("parents");
  if (!yearIn(p.birth)) out.push("birth");
  if (blank(p.death) && (!isLiving(p, now) || isPresumedDead(p, byId, now))) out.push("death");
  if ((p.refs || []).length) out.push("refs");
  return out;
}

// The direct ancestors of root: id → generation (1 a parent, 2 a grandparent…), nearest first.
export function ancestors(byId, root){
  const out = new Map();
  let gen = [root], g = 0;
  while (gen.length){
    g++;
    const next = [];
    for (const id of gen) for (const q of ((byId.get(id) || {}).parents || [])) if (!out.has(q) && q !== root){ out.set(q, g); next.push(q); }
    gen = next;
  }
  return out;
}

// A person an agent can find: a year and a place in any event of theirs.
const findable = p => [p.birth, p.death, ...(p.spouses || [])].some(ev => ev && yearIn(ev) && ev.place);
const kin = (q, extra = {}) => q ? { id: q.id, name: q.name, birth: q.birth, death: q.death, ...extra } : null;

// One brief, everything the agent needs (PLAN Session 5, "A brief").
export function brief(p, kind, { byId, tier, generation = null, why, wikitree = null, stories = [] }){
  const get = id => byId.get(id);
  const known = [{ source: "Jon Inggs's family tree, 2006 (recovered from the Wayback Machine)", url: p.source && p.source.wayback || "" }];
  if (wikitree) known.push({ source: `WikiTree ${wikitree.id}, as of ${dayText(wikitree.fetchedAt)}`, url: `https://www.wikitree.com/wiki/${wikitree.id}`, summary: wtSummary(wikitree) });
  return {
    id: `${kind}.${p.id}`, kind, tier, generation,
    person: { id: p.id, name: p.name, sex: p.sex, birth: p.birth, death: p.death, notes: p.notes || "" },
    parents: (p.parents || []).map(get).filter(Boolean).map(q => kin(q)),
    spouses: (p.spouses || []).map(s => kin(get(s.id), { married: { date: s.date || "", place: s.place || "" } }) || { name: s.name, married: { date: s.date || "", place: s.place || "" } }),
    children: (p.children || []).map(get).filter(Boolean).map(q => kin(q)),
    refs: p.refs || [],
    known, stories,
    missing: [MISSING[kind], ...gapsOf(p, byId).filter(k => k !== kind).map(k => MISSING[k])],
    why,
    sources: SOURCES,
    guide: "family-tree/tools/research/AGENT.md",
  };
}

// Why a person may be researched, for the brief: { status, proof? }, or null for nobody.
export function whyOf(p, byId, consent, now){
  const status = researchable(p, byId, consent, now);
  if (status === "no") return null;
  if (status === "presumed"){
    const r = isPresumedDead(p, byId, now), q = byId.get(r.id);
    return { status, proof: `their ${r.by}, ${q.name}, was born in ${r.year}` };
  }
  if (status === "consented"){ const c = consent[p.id]; return { status, scope: c.scope || c, note: c.note || "" }; }
  return { status };
}

// Everyone's gaps as ranked briefs. → { briefs (ranked), counts: { kind: { tier: n } }, living, skipped }
// people: people.json; storyNames: [{ story, title, name }] (a name a story gives that isn't in the
// tree); wikitree: { wikitreeId: entry }; root: the owner's own id; consent: by person id.
export function rank({ people, storyNames = [], wikitree = {}, root = null, consent = {}, now = new Date(), done = new Set() }){
  const byId = new Map(people.map(p => [p.id, p]));
  const up = root ? ancestors(byId, root) : new Map();
  const wtOf = new Map(Object.values(wikitree).map(e => [e.person, e]));
  const storiesOf = new Map();
  for (const s of storyNames.filter(s => s.people)) for (const id of s.people) storiesOf.set(id, [...(storiesOf.get(id) || []), s.title]);
  const tierOf = p => up.has(p.id) ? 1 : /^INGGS$/i.test(String(p.surname).trim()) ? 2 : 3;
  const out = [], counts = {};
  let living = 0, skipped = 0;
  for (const p of people){
    const gaps = gapsOf(p, byId, now);
    if (!gaps.length) continue;
    const why = whyOf(p, byId, consent, now);
    if (!why){ living++; continue; }
    const tier = tierOf(p);
    for (const kind of gaps){
      counts[kind] = counts[kind] || {}; counts[kind][tier] = (counts[kind][tier] || 0) + 1;
      out.push({ b: brief(p, kind, { byId, tier, generation: up.get(p.id) || null, why, wikitree: wtOf.get(p.id), stories: storiesOf.get(p.id) || [] }), findable: findable(p) });
    }
  }
  // Someone a story names who isn't in the tree: only with a year that says they are long dead.
  for (const s of storyNames.filter(s => s.name)){
    const year = Number((s.name.match(/\((\d{4})\)/) || [])[1]) || null;
    if (!year || year > now.getFullYear() - 100){ skipped++; continue; }
    const tier = /\bINGGS\b/i.test(s.name) ? 2 : 3;
    counts.story = counts.story || {}; counts.story[tier] = (counts.story[tier] || 0) + 1;
    out.push({ findable: false, b: {
      id: `story.${s.story}.${slug(s.name)}`, kind: "story", tier, generation: null, person: null,
      story: { id: s.story, title: s.title, name: s.name, year },
      known: [{ source: `Jon Inggs's story "${s.title}"`, url: s.url || "" }],
      missing: [MISSING.story], why: { status: "dead" }, sources: SOURCES, guide: "family-tree/tools/research/AGENT.md",
    } });
  }
  out.sort((a, c) => a.b.tier - c.b.tier || (a.b.generation || 0) - (c.b.generation || 0) || c.findable - a.findable
    || KINDS.indexOf(a.b.kind) - KINDS.indexOf(c.b.kind) || a.b.id.localeCompare(c.b.id));
  return { briefs: out.map(x => x.b).filter(b => !done.has(b.id)), counts, living, skipped, done: done.size };
}

// The next n briefs for a run: one per person, so two agents never search for the same someone.
export function take(briefs, n = 10){
  const seen = new Set(), out = [];
  for (const b of briefs){
    const who = b.person ? b.person.id : b.id;
    if (seen.has(who)) continue;
    seen.add(who); out.push(b);
    if (out.length === n) break;
  }
  return out;
}

// ---- the CLI ----
const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d;

export function run(dataDir, { n = 10, now = new Date() } = {}){
  const people = readJson(path.join(dataDir, "people.json"), []);
  const R = path.join(dataDir, "research");
  const config = readJson(path.join(R, "config.json"), {});
  if (!config.root || !people.some(p => p.id === config.root)) throw new Error(`Set "root", the owner's own id in the tree, in ${path.join(R, "config.json")}`);
  const stories = readJson(path.join(dataDir, "stories.json"), []);
  const storyNames = [];
  for (const s of stories){
    const md = path.join(dataDir, "stories", `${s.id}.md`);
    storyNames.push({ story: s.id, title: s.title, people: s.people || [] });
    if (!fs.existsSync(md)) continue;
    for (const name of findPeople(fs.readFileSync(md, "utf8"), people).unmatched) storyNames.push({ story: s.id, title: s.title, name, url: s.source && s.source.wayback });
  }
  const fdir = path.join(R, "findings");
  const done = new Set(fs.existsSync(fdir) ? fs.readdirSync(fdir).filter(f => f.endsWith(".json")).map(f => readJson(path.join(fdir, f)).brief) : []);
  const r = rank({ people, storyNames, wikitree: readJson(path.join(dataDir, "wikitree-cache.json"), {}), root: config.root, consent: consentFrom(readJson(path.join(R, "export.json"), null)), now, done });
  const next = take(r.briefs, n);
  const bdir = path.join(R, "briefs");
  fs.mkdirSync(bdir, { recursive: true });
  for (const b of next) fs.writeFileSync(path.join(bdir, `${b.id}.json`), JSON.stringify(b, null, 1) + "\n");
  fs.writeFileSync(path.join(R, "briefs.json"), JSON.stringify(r.briefs.map(b => [b.id, b.tier, b.person ? b.person.name : b.story.name]), null, 0).replace(/\],\[/g, "],\n[") + "\n");
  return { open: r.briefs.length, done: r.done, counts: r.counts, livingSkipped: r.living, storyNamesSkipped: r.skipped, written: next.map(b => b.id) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data"), t = process.argv.indexOf("--take");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  console.log(JSON.stringify(run(dataDir, { n: t > 0 ? Number(process.argv[t + 1]) : 10 }), null, 1));
}
