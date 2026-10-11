#!/usr/bin/env node
// family-tree/tools/research.mjs — Session 6 (PLAN.md, Session 5's design): check what the research
// agents found, and pack it for the app. A finding (data/research/findings/<finding id>.json) is one
// agent's answer to one brief; `check` rejects one that breaks a rule to findings/rejected/ with the
// reasons, and drops a claim that only repeats what Jon has; `pack` writes every checked finding to
// data/seed/family-tree-research.json, which the owner Imports (Session 7). The app skips a finding
// it already has, so a pack carries them all and is safe to Import twice.
// Run from the repo root:
//
//   node family-tree/tools/research.mjs check
//   node family-tree/tools/research.mjs pack
//   node family-tree/tools/research.mjs lookups   # the searches to do by hand, one page of links

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { researchable, researchStatus, ownLine, LINEAGE, yearIn } from "../kin.js";

// The sources (AGENT.md's table says the same, with each verdict's reason; checked 2026-10-11).
// "agent": the agent may search it, the way `how` says. "lookup": the owner searches by hand; the
// agent writes the search, ready to tap. A citation must come from an agent source's host.
export const SOURCES = [
  { id: "wikitree", name: "WikiTree", use: "agent", hosts: ["api.wikitree.com", "www.wikitree.com"],
    how: "API only, never the web pages (a bot check): https://api.wikitree.com/api.php?action=getProfile&key=<Id>&appId=sidequests-family-tree; searchPerson for a name. Cite the profile, https://www.wikitree.com/wiki/<Id>. A tree: secondary." },
  { id: "paperspast", name: "Papers Past (New Zealand newspapers)", use: "agent", hosts: ["api.digitalnz.org", "paperspast.natlib.govt.nz"],
    how: "Through DigitalNZ's API, never the site (a bot check): https://api.digitalnz.org/v3/records.json?text=<words>&and[primary_collection][]=Papers+Past&per_page=20. Cite the record's landing_url." },
  { id: "archive", name: "Internet Archive texts", use: "agent", hosts: ["archive.org"],
    how: "https://archive.org/advancedsearch.php?q=<words>+AND+mediatype:texts&fl[]=identifier&fl[]=title&rows=20&output=json, then https://archive.org/details/<identifier>. It searches titles and descriptions, not the text inside." },
  { id: "eggsa", name: "eGGSA registers (South African burials, baptisms, marriages)", use: "agent", hosts: ["www.eggsa.org"],
    how: "A GET to the register's search: https://www.eggsa.org/cgi-bin/dosearchBurials.pl?Which_Town=0&Result_order=by_Year&what_surname=<Surname>&surname_mode=4&what_firstname=<Given>&firstname_mode=2&fromBurials=done; baptisms: dosearchBaptisms.pl with Person_one_surname, Person_one_first_name, Role_of_Person_One=Child|Father|Mother, fromBap=certainly; marriages: dosearchMarriages.pl with the same names, Role_of_Person_One=Groom|Bride, fromMarr=included. Cite the search URL and quote the entry with its Source line. A transcription: index." },
  { id: "discovery", name: "The National Archives (UK) catalogue", use: "agent", hosts: ["discovery.nationalarchives.gov.uk"],
    how: "The API only (robots.txt bars the web search): https://discovery.nationalarchives.gov.uk/API/search/records?sps.searchQuery=<words>&sps.resultsPageSize=20. Cite https://discovery.nationalarchives.gov.uk/details/r/<id> with its reference (e.g. a will, a service record). A catalogue entry: index." },
  { id: "wikidata", name: "Wikidata", use: "agent", hosts: ["www.wikidata.org", "query.wikidata.org"],
    how: "For the notable only: https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<name>&language=en&format=json&limit=5, then https://www.wikidata.org/wiki/<Q id>. Secondary." },
  { id: "familysearch", name: "FamilySearch", use: "lookup", lookup: "https://www.familysearch.org/search/record/results?q.givenName=<given>&q.surname=<surname>&q.birthLikeDate.from=<year>&q.birthLikeDate.to=<year>" },
  { id: "freebmd", name: "FreeBMD (England and Wales births, marriages, deaths)", use: "lookup", lookup: "https://www.freebmd.org.uk/cgi/search.pl" },
  { id: "freereg", name: "FreeREG (parish registers)", use: "lookup", lookup: "https://www.freereg.org.uk/search_queries/new" },
  { id: "freecen", name: "FreeCEN (censuses)", use: "lookup", lookup: "https://www.freecen.org.uk/search_queries/new" },
  { id: "eggsagraves", name: "eGGSA gravestones", use: "lookup", lookup: "https://graves.eggsa.org/" },
  { id: "chronam", name: "Chronicling America (US newspapers)", use: "lookup", lookup: "https://www.loc.gov/collections/chronicling-america/?q=<words>" },
  { id: "naairs", name: "NAAIRS (South African National Archives)", use: "lookup", lookup: "http://www.national.archsrch.gov.za/" },
  { id: "trove", name: "Trove (Australian newspapers)", use: "lookup", lookup: "https://trove.nla.gov.au/search/category/newspapers?keyword=<words>&date.from=<year>-01-01&date.to=<year>-12-31" },
  { id: "welsh", name: "Welsh Newspapers", use: "lookup", lookup: "https://newspapers.library.wales/search?query=<words>&range[min]=<year>&range[max]=<year>" },
  { id: "googlebooks", name: "Google Books", use: "lookup", lookup: "https://www.google.com/search?tbm=bks&q=%22<given>+<surname>%22" },
  { id: "ancestry", name: "Ancestry (paid)", use: "lookup", lookup: "https://www.ancestry.com/search/?name=<given>_<surname>&birth=<year>" },
  { id: "findmypast", name: "Findmypast (paid)", use: "lookup", lookup: "https://www.findmypast.co.uk/search/results?firstname=<given>&lastname=<surname>&yearofbirth=<year>" },
  { id: "bna", name: "British Newspaper Archive (paid)", use: "lookup", lookup: "https://www.britishnewspaperarchive.co.uk/search/results?basicsearch=%22<given>%20<surname>%22" },
];
export const CITABLE = new Set(SOURCES.filter(s => s.use === "agent").flatMap(s => s.hosts));

export const FIELDS = ["birth", "death", "marriage", "parent", "spouse", "child", "baptism", "burial", "residence", "occupation", "note"];
// What consent to genealogy covers (PLAN Session 5's hard lines): published events and family, never
// where someone lives or works.
export const GENEALOGY = new Set(["birth", "death", "marriage", "parent", "spouse", "child", "baptism", "burial", "note"]);
const CONFIDENCE = new Set(["record", "index", "secondary"]);

// Never, for anyone living, even with consent: what each looks like in a claim's text.
export const NEVER = [
  ["an email address", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["a phone number", /\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d|\b0\d{2,3}[\s-]?\d{3}[\s-]?\d{3,4}\b/],
  ["a street address", /\b\d+[a-z]?\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Crescent|Close|Way|Place|Court|Boulevard)\b/],
  ["an ID number", /\b\d{13}\b/],
  ["a social-media profile", /\b(?:facebook|instagram|twitter|x|linkedin|tiktok|youtube|threads)\.com\b/i],
  ["an employer today", /\b(?:currently|now)\s+(?:works?|working|employed)\b|\bworks\s+(?:at|for)\b/i],
];

const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const citable = u => { const h = hostOf(u); return !!h && [...CITABLE].some(c => h === c || h.endsWith("." + c)); };
const claimText = c => JSON.stringify([c.value, c.reasoning, ...(c.citations || []).map(x => [x.title, x.quote, x.reference])]);

// Does a claim only say what Jon (or the person's record) already has?
export function alreadyKnown(claim, p, byId){
  if (!p) return false;
  const v = claim.value || {}, ev = p[claim.field];
  const same = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
  if ((claim.field === "birth" || claim.field === "death") && ev)
    return !!yearIn(ev) && (same(v.date, ev.date) || (!/\d{1,2}\s+[A-Za-z]{3}/.test(v.date || "") && yearIn({ date: v.date }) === yearIn(ev))) && (!v.place || same(v.place, ev.place));
  const rel = { parent: p.parents, child: p.children, spouse: (p.spouses || []).map(s => s.id) }[claim.field];
  if (rel){
    const n = String(v.name || "").toUpperCase().replace(/\s+/g, " ").trim();
    return rel.map(id => byId.get(id)).filter(Boolean).some(q => String(q.name).toUpperCase().replace(/\s+/g, " ").trim() === n);
  }
  return false;
}

// One finding against the rules. ctx: { briefs: Map(brief id → brief), byId: Map, consent, now }.
// → { ok, reasons: [why it's rejected], finding: the finding less the claims that only repeat Jon, dropped: [field] }
export function check(f, { briefs, byId, consent = {}, now = new Date() }){
  const reasons = [];
  const brief = briefs.get(f && f.brief);
  if (!f || !f.id || !Array.isArray(f.claims)) return { ok: false, reasons: ["not a finding: it needs an id, a brief and claims"], finding: f, dropped: [] };
  if (!brief) reasons.push(`no brief ${f.brief}`);
  const p = f.person ? byId.get(f.person) : null;
  if (f.person && !p) reasons.push(`no person ${f.person}`);
  const about = brief ? (brief.person ? brief.person.id : null) : f.person;
  if ((f.person || null) !== about) reasons.push(`the brief is about ${about || "a story's name"}, not ${f.person || "nobody"}`);
  const kind = brief ? brief.kind : String(f.brief || "").split(".")[0];
  const status = p ? researchStatus(p, kind, byId, consent, now) : brief && brief.story ? "dead" : "no";
  if (p && status === "no") reasons.push(`${f.person} is living and has no research consent`);
  const living = status === "consented" || status === "lineage";
  for (const [i, c] of f.claims.entries()){
    const at = `claim ${i + 1} (${c.field})`;
    if (!FIELDS.includes(c.field)) reasons.push(`${at}: not a field a finding may carry`);
    if (!CONFIDENCE.has(c.confidence)) reasons.push(`${at}: confidence must be record, index or secondary`);
    const cites = c.citations || [];
    if (!cites.length) reasons.push(`${at}: no citation`);
    for (const x of cites){
      if (!x.url) reasons.push(`${at}: a citation with no URL`);
      else if (!citable(x.url)) reasons.push(`${at}: ${hostOf(x.url) || x.url} isn't a source agents may use`);
      if (!String(x.quote || "").trim()) reasons.push(`${at}: a citation with no quote`);
    }
    if (c.field === "parent" && cites.length && cites.every(x => /wikitree\.com$/.test(hostOf(x.url))))
      reasons.push(`${at}: a family tree is never a parent's only source`);
    if (living){
      if (status === "lineage" && !LINEAGE.has(c.field)) reasons.push(`${at}: for a living person without consent, only parent and birth`);
      else if (!GENEALOGY.has(c.field)) reasons.push(`${at}: outside the genealogy a living person consented to`);
      for (const [what, re] of NEVER) if (re.test(claimText(c))) reasons.push(`${at}: carries ${what}, never kept for anyone living`);
    }
  }
  const keep = f.claims.filter(c => !alreadyKnown(c, p, byId));
  const dropped = f.claims.filter(c => !keep.includes(c)).map(c => c.field);
  return { ok: !reasons.length, reasons, finding: { ...f, claims: keep }, dropped };
}

// The pack the owner Imports. findings: checked findings; byId: people; briefs: Map.
// scope: "family" for the dead, presumed dead and "genealogy-shared"; "person" for "genealogy".
export function pack(findings, { byId, briefs, consent = {}, now = new Date(), version = "" }){
  const scopeOf = p => {
    if (!p) return "family";
    const c = consent instanceof Map ? consent.get(p.id) : consent[p.id];
    const s = c && typeof c === "object" ? c.scope : c;
    return researchable(p, byId, consent, now) === "consented" && s === "genealogy" ? "person" : "family";
  };
  return {
    app: "family-tree", version, exportedAt: now.toISOString(), seed: { kind: "research" },
    findings: findings.map(f => {
      const p = f.person ? byId.get(f.person) : null, b = briefs.get(f.brief);
      return { ...f, personName: p ? p.name : (b && b.story && b.story.name) || "", scope: scopeOf(p) };
    }),
  };
}

// The searches the owner does by hand (owner, 2026-10-11: one-tap batches): every finding's
// lookups as one page of links, grouped by site, so a site's searches are done in one sitting. The
// owner presses Search on each site: the Free* sites allow only manual use. → HTML.
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function lookupsPage(findings, { byId = new Map(), now = new Date() } = {}){
  const bySite = new Map();
  for (const f of findings) for (const l of f.lookups || []){
    if (!l.url) continue;
    const who = (byId.get(f.person) || {}).name || f.personName || f.brief;
    bySite.set(l.site, [...(bySite.get(l.site) || []), { ...l, who }]);
  }
  const sites = [...bySite.keys()].sort();
  const n = sites.reduce((t, s) => t + bySite.get(s).length, 0);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lookups</title>
<style>body{font:18px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:0 auto;max-width:720px;padding:16px}a{color:#9cf}
li{margin:0 0 14px}.q{color:#bbb;font-size:15px}h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#aaa;margin-top:28px}</style>
<h1>Lookups by hand</h1>
<p>${n} searches on ${sites.length} sites, ${esc(now.toISOString().slice(0, 10))}. Each link opens the site's search; you press Search.
What you find goes back in through the app (Session 7: Add what you found).</p>
${sites.map(s => `<h2>${esc(s)}</h2>\n<ol>\n${bySite.get(s).map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.who)}</a><div class="q">${esc(l.query)}${l.why ? ` · ${esc(l.why)}` : ""}</div></li>`).join("\n")}\n</ol>`).join("\n")}
`;
}

// ---- the CLI ----
const readJson = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d;
const jsonIn = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => path.join(dir, f)) : [];
// Consent: the owner's own line (kin.js ownLine), then the owner's latest Export's consent/ (Session
// 7), which wins: a relative on the line who says None is never researched.
export function consentFrom(exp, { byId = new Map(), root = null, now = new Date() } = {}){
  const out = root ? ownLine(byId, root, now) : {};
  for (const c of (exp && exp.consent) || []) if (c && c.id) out[c.id] = c;
  return out;
}
function context(dataDir){
  const people = readJson(path.join(dataDir, "people.json"), []);
  const R = path.join(dataDir, "research");
  const briefs = new Map(jsonIn(path.join(R, "briefs")).map(f => readJson(f)).map(b => [b.id, b]));
  const byId = new Map(people.map(p => [p.id, p])), now = new Date(), root = readJson(path.join(R, "config.json"), {}).root;
  return { R, byId, briefs, consent: consentFrom(readJson(path.join(R, "export.json"), null), { byId, root, now }), now };
}

export function runCheck(dataDir){
  const ctx = context(dataDir), dir = path.join(ctx.R, "findings"), rej = path.join(dir, "rejected");
  const out = { passed: [], rejected: [], dropped: [] };
  for (const file of jsonIn(dir)){
    const f = readJson(file);
    if (f.checkedAt) { out.passed.push(f.id); continue; }
    const r = check(f, ctx);
    if (!r.ok){
      fs.mkdirSync(rej, { recursive: true });
      fs.writeFileSync(path.join(rej, path.basename(file)), JSON.stringify({ ...f, rejected: r.reasons }, null, 1) + "\n");
      fs.rmSync(file);
      out.rejected.push({ id: f.id, reasons: r.reasons });
      continue;
    }
    fs.writeFileSync(file, JSON.stringify({ ...r.finding, checkedAt: ctx.now.getTime(), ...(r.dropped.length ? { alreadyKnown: r.dropped } : {}) }, null, 1) + "\n");
    out.passed.push(f.id);
    if (r.dropped.length) out.dropped.push({ id: f.id, fields: r.dropped });
  }
  return out;
}

export function runPack(dataDir){
  const ctx = context(dataDir);
  const findings = jsonIn(path.join(ctx.R, "findings")).map(f => readJson(f)).filter(f => f.checkedAt);
  const seed = pack(findings, ctx);
  fs.mkdirSync(path.join(dataDir, "seed"), { recursive: true });
  const out = path.join(dataDir, "seed", "family-tree-research.json");
  fs.writeFileSync(out, JSON.stringify(seed));
  return { file: path.relative(process.cwd(), out), findings: seed.findings.length, claims: seed.findings.reduce((n, f) => n + f.claims.length, 0) };
}

export function runLookups(dataDir){
  const ctx = context(dataDir);
  const findings = jsonIn(path.join(ctx.R, "findings")).map(f => readJson(f)).filter(f => f.checkedAt);
  const out = path.join(ctx.R, "lookups.html");
  fs.writeFileSync(out, lookupsPage(findings, ctx));
  return { file: path.relative(process.cwd(), out), lookups: findings.reduce((n, f) => n + (f.lookups || []).length, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href){
  const at = process.argv.indexOf("--data");
  const dataDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const cmd = process.argv[2];
  if (cmd === "check") console.log(JSON.stringify(runCheck(dataDir), null, 1));
  else if (cmd === "pack") console.log(JSON.stringify(runPack(dataDir)));
  else if (cmd === "lookups") console.log(JSON.stringify(runLookups(dataDir)));
  else { console.error("Usage: node family-tree/tools/research.mjs check | pack | lookups"); process.exit(1); }
}
