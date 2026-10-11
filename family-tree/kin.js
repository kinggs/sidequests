// family-tree/kin.js — the Family Tree's pure logic, no browser and no cloud: the living rule and who
// research may search, the People list's order, the tree view's layout, Jon's Markdown as HTML, the WikiTree copy beside Jon's, and Share as Markdown.
// index.html imports it; kin.test.mjs proves it (`node --test` from the repo root), on the invented
// mock seed. CLAUDE.md rule 1's one exception, as rack-it/zargo.js.

export const CREDIT = "Compiled by Jon Inggs · familytree.inggs.com · 2006";
export const WIKITREE = id => `https://www.wikitree.com/wiki/${encodeURIComponent(id)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---- the living rule (SPEC §6) ----
// No death recorded, and born within the last 100 years or with no birth year: living. Members see
// everyone's dates and places (owner, 2026-10-11); the rule is for research agents (PLAN Session 5),
// which need a living person's consent.
export const yearIn = ev => (ev && ev.year) || Number((String((ev && ev.date) || "").match(/\b(\d{4})\b/) || [])[1]) || null;
export function isLiving(p, now = new Date()){
  if (p.death && (p.death.date || p.death.place)) return false;
  const born = yearIn(p.birth);
  return !born || born > now.getFullYear() - 100;
}
// A relative's dates prove death (owner, 2026-10-11; PLAN Session 5): no birth year, but a child
// born 100+ years ago, a parent 150+ or a spouse 110+. → { by: "child" | "parent" | "spouse", id,
// year } for the relative that proves it (the oldest, children first), or null.
const PROOF = [["child", "children", 100], ["parent", "parents", 150], ["spouse", "spouses", 110]];
export function isPresumedDead(p, byId, now = new Date()){
  if (!isLiving(p, now) || yearIn(p.birth)) return null;
  const get = id => (byId instanceof Map ? byId.get(id) : byId[id]) || null;
  for (const [by, key, age] of PROOF){
    const hits = (p[key] || []).map(r => get(typeof r === "string" ? r : r.id)).filter(Boolean)
      .map(q => ({ by, id: q.id, year: yearIn(q.birth) })).filter(r => r.year && r.year <= now.getFullYear() - age);
    if (hits.length) return hits.sort((a, b) => a.year - b.year)[0];
  }
  return null;
}
// Who a research agent may search for (SPEC §6): "dead", "presumed" (dead by a relative's dates),
// "consented" (living, with consent/<id> of "genealogy" or "genealogy-shared") or "no".
// consent: a Map or object by person id of the consent document, or of its scope.
export function researchable(p, byId, consent = {}, now = new Date()){
  if (!isLiving(p, now)) return "dead";
  if (isPresumedDead(p, byId, now)) return "presumed";
  const c = consent instanceof Map ? consent.get(p.id) : consent[p.id];
  const scope = c && typeof c === "object" ? c.scope : c;
  return scope === "genealogy" || scope === "genealogy-shared" ? "consented" : "no";
}

// Softened (owner, 2026-10-11: "we all want to trace our lineage back"): for anyone living, an agent
// may research one thing without their consent, who their parents were ("lineage": parent and birth
// claims only); and the owner's own line, root and their ancestors, counts as consented, shared with
// the family. The never-list holds for both. → the status for one gap kind: researchable's, or
// "lineage" for a living person's "parents" gap.
export const LINEAGE = new Set(["parent", "birth"]);
export function researchStatus(p, kind, byId, consent = {}, now = new Date()){
  const s = researchable(p, byId, consent, now);
  return s === "no" && kind === "parents" ? "lineage" : s;
}
// The direct ancestors of root: id → generation (1 a parent, 2 a grandparent…).
export function ancestors(byId, root){
  const get = id => (byId instanceof Map ? byId.get(id) : byId[id]) || null;
  const out = new Map();
  let gen = [root], g = 0;
  while (gen.length){
    g++;
    const next = [];
    for (const id of gen) for (const q of ((get(id) || {}).parents || [])) if (!out.has(q) && q !== root){ out.set(q, g); next.push(q); }
    gen = next;
  }
  return out;
}
// The owner's own line as consent documents: root and their living ancestors, shared with the family.
export function ownLine(byId, root, now = new Date()){
  const get = id => (byId instanceof Map ? byId.get(id) : byId[id]) || null;
  const out = {};
  for (const id of [root, ...ancestors(byId, root).keys()]){
    const p = get(id);
    if (p && isLiving(p, now)) out[id] = { id, scope: "genealogy-shared", note: "The owner's own line (owner, 2026-10-11)" };
  }
  return out;
}

// ---- the People list's order (SPEC §2) ----
// A name Jon didn't know sorts after the known: a surname of only "?" goes to the end of the list
// (the app heads it "Surname not known"), a given name of only "?" last in its surname. Brackets
// and marks don't count: "Smith(?)" sorts just after "Smith", "(Ballard)" with the Bs.
const nameKey = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\s'-]/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
export const surnameKnown = p => !!nameKey(p.surname);
export function byName(a, b){
  const sa = nameKey(a.surname), sb = nameKey(b.surname), ga = nameKey(a.given), gb = nameKey(b.given);
  return (!sa - !sb) || sa.localeCompare(sb) || (sa ? String(a.surname).localeCompare(String(b.surname)) : 0)
    || (!ga - !gb) || ga.localeCompare(gb) || String(a.id).localeCompare(String(b.id));
}

// "1884–1951", "b. 1902", "d. 1950", "c. 1850–1920" (a year from an inexact date), or nothing.
export function yearsText(p){
  const y = ev => { const n = yearIn(ev); return n ? (ev.year ? String(n) : `c. ${n}`) : ""; };
  const b = y(p.birth), d = y(p.death);
  return b && d ? `${b}–${d}` : b ? `b. ${b}` : d ? `d. ${d}` : "";
}
// A date and place as Jon wrote them: "3 MAR 1850, Townsville".
export const eventText = ev => [ev && ev.date, ev && ev.place].filter(Boolean).join(", ");

// ---- WikiTree beside Jon (SPEC §2): its dates are shown only where they differ from his ----
// WikiTree writes "1863-04-11", with 00 for what it doesn't know. → "11 Apr 1863", or "" for none.
export function wtDate(s){
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "0000") return "";
  const mo = Number(m[2]), d = Number(m[3]);
  return [d && mo ? String(d) : "", mo ? MONTHS[mo - 1] : "", m[1]].filter(Boolean).join(" ");
}
// The same day? Jon's "11 APR 1863" and WikiTree's "11 Apr 1863" are; "ABT 1863" and "1863" are
// too (WikiTree has no "about", so the year is all either says).
const dateKey = s => String(s || "").toUpperCase().replace(/\b(ABT|ABOUT|CIRCA|C\.|EST|CAL)\b\.?/g, "").replace(/\s+/g, " ").trim();
export const sameDate = (jon, wt) => dateKey(jon) === dateKey(wt);
// How WikiTree's date stands to Jon's: "same", "vaguer" (it says less: "1847" against "6 JUL
// 1847"), "more" (it adds a day or month to the same year, or Jon has none) or "differ".
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function dateParts(s){
  const t = dateKey(s), y = (t.match(/\b(\d{4})\b/) || [])[1];
  if (!y) return null;
  if (/\b(BEF|AFT|BET|AND|FROM|TO|INT)\b/.test(t)) return { y, m: 0, d: 0 };
  const m = MON.findIndex(x => new RegExp(`\\b${x}`).test(t)) + 1;
  const d = m ? Number((t.match(/^(\d{1,2})\s+[A-Z]/) || [])[1]) || 0 : 0;
  return { y, m, d };
}
export function dateRelation(jon, wt){
  const a = dateParts(jon), b = dateParts(wt);
  if (!b) return "same";
  if (!a) return "more";
  if (a.y !== b.y) return "differ";
  for (const k of ["m", "d"]){
    if (a[k] && b[k] && a[k] !== b[k]) return "differ";
    if (a[k] && !b[k]) return "vaguer";
    if (!a[k] && b[k]) return "more";
  }
  return "same";
}

// ---- the WikiTree copy (SPEC §2, §4: wikitree/<id>, from tools/wikitree.mjs --cache) ----
// "11 Oct 2026", for "as of".
export const dayText = ms => { const d = new Date(ms); return ms ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ""; };
// "b. 2 Jun 1874, Riverton · d. 2 Feb 1940, Port Example", or "".
export function wtSummary(e){
  if (!e) return "";
  const part = (k, ev) => { const t = [wtDate(ev && ev.date), ev && ev.place].filter(Boolean).join(", "); return t ? `${k} ${t}` : ""; };
  return [part("b.", e.birth), part("d.", e.death)].filter(Boolean).join(" · ");
}
// WikiTree's years for a relative: "1840–1901", "b. 1840", or "".
const wtYears = r => { const b = wtDate(r.birth).slice(-4), d = wtDate(r.death).slice(-4); return b && d ? `${b}–${d}` : b ? `b. ${b}` : d ? `d. ${d}` : ""; };
// The family WikiTree names that Jon's record doesn't already show here: each { role, wikitree,
// name, years, id } with id the person in the tree linked to that profile, or null.
// people: a Map or object by id; byWikitree: WikiTree id → person id.
export function wtFamily(e, p, byWikitree){
  if (!e || !p) return [];
  const here = new Set([...(p.parents || []), ...(p.spouses || []).map(s => s.id), ...(p.children || [])]);
  const get = k => byWikitree instanceof Map ? byWikitree.get(k) : byWikitree[k];
  return (e.relatives || []).map(r => ({ role: r.role, wikitree: r.wikitree, name: r.name, years: wtYears(r), id: get(r.wikitree) || null }))
    .filter(r => !(r.id && here.has(r.id)));
}

// ---- the tree view's layout (SPEC §2) ----
// Up to `depth` generations each way from the centre: parents above (father first), children below
// (oldest first), the centre's spouses beside. Each person takes one unit across; a person sits over
// the middle of the block their own parents (above) or children (below) take, so no two cards in a
// row share a unit and every x is a whole or half unit. The app lays the units out as a CSS grid of
// half-unit columns and draws the lines from where the cards land.
//   → { cols, gens: [-3..3 present], nodes: [{ key, id, gen, x, side }], links: [{ child, parents: [key], side }] }
//   side: "up" (an ancestor), "centre", "spouse", "down" (a descendant). A link joins a child to the
//   parents shown in the row above it (below the centre, a spouse too when they're that child's parent).
export function layoutTree(byId, centreId, { depth = 3 } = {}){
  const get = id => (byId instanceof Map ? byId.get(id) : byId[id]) || null;
  const c = get(centreId);
  if (!c) return null;
  const order = (a, b) => (a.sex === "M" ? 0 : a.sex === "F" ? 1 : 2) - (b.sex === "M" ? 0 : b.sex === "F" ? 1 : 2);
  const parentsOf = p => (p.parents || []).map(get).filter(Boolean).sort(order).slice(0, 2);
  const born = p => yearIn(p.birth) || Infinity;
  const childrenOf = p => (p.children || []).map(get).filter(Boolean).sort((a, b) => born(a) - born(b));
  const build = (p, gen, step, next) => {
    const kids = Math.abs(gen) < depth ? next(p).map(q => build(q, gen + step, step, next)) : [];
    return { p, gen, kids, w: Math.max(1, kids.reduce((s, k) => s + k.w, 0)) };
  };
  const up = build(c, 0, -1, parentsOf), down = build(c, 0, 1, childrenOf);
  const X = Math.max((up.w - 1) / 2, (down.w - 1) / 2);
  const nodes = [], links = [];
  const place = (t, start, side, key) => {
    t.x = start + (t.w - 1) / 2;
    t.key = key;
    let s = start;
    t.kids.forEach((k, i) => { place(k, s, side, `${key}.${i}`); s += k.w; });
    if (t.gen) nodes.push({ key, id: t.p.id, gen: t.gen, x: t.x, side });
  };
  place(up, X - (up.w - 1) / 2, "up", "u");
  place(down, X - (down.w - 1) / 2, "down", "d");
  nodes.push({ key: "c", id: c.id, gen: 0, x: X, side: "centre" });
  const spouses = (c.spouses || []).map(s => get(s.id)).filter(Boolean);
  spouses.forEach((s, i) => nodes.push({ key: `s${i}`, id: s.id, gen: 0, x: X + 1 + i, side: "spouse" }));
  const keyOf = t => (t.gen ? t.key : "c");
  const walkUp = t => { if (t.kids.length) links.push({ child: keyOf(t), parents: t.kids.map(keyOf), side: "up" }); t.kids.forEach(walkUp); };
  const walkDown = t => t.kids.forEach(k => {
    const ps = [keyOf(t)];
    if (!t.gen) spouses.forEach((s, i) => { if ((k.p.parents || []).includes(s.id)) ps.push(`s${i}`); });
    links.push({ child: k.key, parents: ps, side: "down" });
    walkDown(k);
  });
  walkUp(up); walkDown(down);
  // Shift so the leftmost card is at 0.
  const min = Math.min(...nodes.map(n => n.x));
  for (const n of nodes) n.x -= min;
  return { cols: Math.max(...nodes.map(n => n.x)) + 1, gens: [...new Set(nodes.map(n => n.gen))].sort((a, b) => a - b), nodes, links };
}

// ---- Jon's Markdown as HTML (SPEC §2, Jon's stories) ----
// The little Markdown tools/stories.mjs writes: headings, paragraphs and line breaks, ---, quotes,
// "- " lists, bold and italics, links and images, and tables. A link or image to `photo:<id>` or
// `story:<id>` becomes a data-photo / data-story the app wires up; http(s) opens in the browser;
// anything else is its words alone. An image on its own line is a <figure data-photo> the app fills
// with the picture and its caption. A table of up to four columns stays a table; a wider one (Jon's
// register of the war dead has 21) becomes a card per row of label and value, to read on a phone.
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
function linkTo(href, inner){
  const m = /^(photo|story):(.+)$/.exec(href);
  if (m) return `<a href="#" data-${m[1]}="${esc(m[2])}">${inner}</a>`;
  if (/^https?:\/\//i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`;
  return inner;
}
export function inline(s){
  const parts = [];
  const keep = html => `\u0000${parts.push(html) - 1}\u0000`;
  let t = String(s);
  // Images and links first, held aside so emphasis never reaches into a URL.
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, href) => keep(linkTo(href, esc(alt || "a photo"))));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, words, href) => keep(linkTo(href, emph(esc(words)))));
  t = emph(esc(t));
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[i]);
}
const emph = h => h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
const cellsOf = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
const isRule = cells => cells.length && cells.every(c => /^:?-{3,}:?$/.test(c));
function table(lines){
  const rows = lines.map(cellsOf);
  const ruleAt = rows.findIndex(isRule);
  const body = rows.filter(r => !isRule(r));
  const cols = Math.max(...body.map(r => r.length));
  if (cols <= 4){
    const head = ruleAt === 1 && body[0].some(Boolean) ? body.shift() : null;
    return `<div class="ft-tablewrap"><table>${head ? `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${
      body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  // Wide: the labels are whichever of the first two rows is fullest; a row above them is a title.
  const filled = r => r.filter(Boolean).length;
  const at = body.length > 1 && filled(body[1]) > filled(body[0]) ? 1 : 0;
  const labels = body[at], above = body.slice(0, at).flat().filter(Boolean);
  return (above.length ? `<p class="note">${above.map(inline).join(" · ")}</p>` : "") + body.slice(at + 1).map(r =>
    `<dl class="ft-rec">${r.map((v, i) => v ? `<dt class="lbl">${inline(labels[i] || "")}</dt><dd>${inline(v)}</dd>` : "").join("")}</dl>`).join("");
}
export function markdownToHtml(md){
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  const endPara = () => {
    if (!para.length) return;
    const solo = para.length === 1 && /^!\[([^\]]*)\]\(photo:([^)\s]+)\)$/.exec(para[0].trim());
    if (solo) out.push(`<figure data-photo="${esc(solo[2])}"><figcaption>${esc(solo[1])}</figcaption></figure>`);
    // The lines go through together, so bold that runs across a line break still closes.
    else out.push(`<p>${inline(para.map((l, i) => l.trim() + (i < para.length - 1 ? (/ {2,}$/.test(l) ? "\u0001" : " ") : "")).join("")).replace(/\u0001/g, "<br>")}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++){
    const l = lines[i];
    let m;
    if (!l.trim()){ endPara(); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))){ endPara(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)){ endPara(); out.push("<hr>"); continue; }
    if (/^\s*>/.test(l)){
      endPara();
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      i--;
      out.push(`<blockquote>${markdownToHtml(q.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^\s*\|/.test(l)){
      endPara();
      const t = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) t.push(lines[i++]);
      i--;
      out.push(table(t));
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)){
      endPara();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      i--;
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`);
      continue;
    }
    para.push(l);
  }
  endPara();
  return out.join("\n");
}

// ---- Share as Markdown (SPEC §2, PLAN Session 4) ----
// "line": the person and every parent up to the earliest known ancestor, father then mother, each
// generation a section. "family": the person, their parents, spouses and children. Each person:
// name, dates and places verbatim, Jon's notes, the full text of every story that names them (a
// story naming several people in it is written out once, under the first, and pointed at after),
// the WikiTree link with its copy's dates, and every source at the end.
// people and stories: arrays or Maps by id. photos (optional) gives a story's pictures their
// captions; wikitree (optional, a Map or array by WikiTree id) the WikiTree copy.
export function lineageMarkdown(people, stories, id, mode = "line", { now = new Date(), photos = null, wikitree = null } = {}){
  const P = people instanceof Map ? people : new Map(people.map(p => [p.id, p]));
  const S = stories instanceof Map ? [...stories.values()] : stories || [];
  const Ph = photos instanceof Map ? photos : new Map((photos || []).map(p => [p.id, p]));
  const W = wikitree instanceof Map ? wikitree : new Map((wikitree || []).map(e => [e.id, e]));
  const me = P.get(id);
  if (!me) return "";
  const order = (a, b) => (a.sex === "M" ? 0 : a.sex === "F" ? 1 : 2) - (b.sex === "M" ? 0 : b.sex === "F" ? 1 : 2);
  const parentsOf = p => (p.parents || []).map(x => P.get(x)).filter(Boolean).sort(order);
  const sections = [];
  if (mode === "family"){
    sections.push([me.name, [me]]);
    sections.push(["Parents", parentsOf(me)]);
    sections.push(["Married", (me.spouses || []).map(s => P.get(s.id)).filter(Boolean)]);
    sections.push(["Children", (me.children || []).map(x => P.get(x)).filter(Boolean)]);
  } else {
    const seen = new Set([me.id]);
    let level = [me];
    for (let g = 0; level.length && g < 60; g++){
      sections.push([g === 0 ? me.name : generationName(g), level]);
      const next = [];
      for (const p of level) for (const q of parentsOf(p)) if (!seen.has(q.id)){ seen.add(q.id); next.push(q); }
      level = next;
    }
  }
  const told = new Map();   // story id → the name it was written out under
  const sources = new Map(); // url → [what it's the source of]
  const cite = (url, what) => { if (url){ if (!sources.has(url)) sources.set(url, []); sources.get(url).push(what); } };
  const names = ids => ids.map(x => (P.get(x) || {}).name).filter(Boolean).join(", ");
  const d = new Date(now);
  const out = [
    `# ${me.name}: ${mode === "family" ? "their family" : "their line"}`, "",
    `${CREDIT}. Shared from the Inggs Family Tree on ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}.`, "",
  ];
  for (const [title, ps] of sections){
    if (!ps.length) continue;
    out.push(`## ${title}`, "");
    for (const p of ps){
      out.push(`### ${p.name}`, "");
      const facts = [];
      if (eventText(p.birth)) facts.push(`Born: ${eventText(p.birth)}`);
      if (eventText(p.death)) facts.push(`Died: ${eventText(p.death)}`);
      if ((p.parents || []).length) facts.push(`Parents: ${names(p.parents)}`);
      const married = (p.spouses || []).map(s => {
        const sp = P.get(s.id);
        const when = [s.date, s.place].filter(Boolean).join(", ");
        return `${(sp && sp.name) || s.name}${when ? ` (${when})` : ""}`;
      }).concat((p.refs || []).filter(r => r.role === "spouse").map(r => `${r.name} (not in the tree)`));
      if (married.length) facts.push(`Married: ${married.join("; ")}`);
      if ((p.children || []).length) facts.push(`Children: ${names(p.children)}`);
      const otherRefs = (p.refs || []).filter(r => r.role !== "spouse");
      if (otherRefs.length) facts.push(`Also named: ${otherRefs.map(r => `${r.name}, ${r.role} (not in the tree)`).join("; ")}`);
      if (p.wikitree){
        const e = W.get(p.wikitree), sum = wtSummary(e);
        facts.push(`On WikiTree: ${WIKITREE(p.wikitree)}${sum ? ` (${sum}; as of ${dayText(e.fetchedAt)})` : ""}`);
      }
      out.push(...facts.map(f => `- ${f}`), "");
      if (p.notes) out.push(String(p.notes).trim(), "");
      cite(p.source && p.source.wayback, p.name);
      for (const s of S.filter(s => (s.people || []).includes(p.id))){
        if (told.has(s.id)){ out.push(`Jon's story "${s.title}" is above, under ${told.get(s.id)}.`, ""); continue; }
        told.set(s.id, p.name);
        cite(s.source && s.source.wayback, `Jon's story "${s.title}"`);
        out.push(`#### Jon wrote: ${s.title}`, "");
        out.push(s.markdown ? storyBody(s.markdown, Ph) : `A PDF on Jon's site, not converted: ${(s.source && s.source.wayback) || ""}`, "");
      }
    }
  }
  out.push("## Sources", "", `- ${CREDIT}`);
  for (const [url, what] of sources) out.push(`- ${what.join(", ")}: ${url}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
export function generationName(g){
  return g === 1 ? "Parents" : g === 2 ? "Grandparents" : g === 3 ? "Great-grandparents" : `${g - 2}× great-grandparents`;
}
// A story inside the export: its own title line dropped (the heading above says it), its headings
// moved under that one, and photo: and story: links, which mean nothing outside the app, made words.
function storyBody(md, photos){
  return String(md).replace(/^#\s+.*\n+/, "")
    .replace(/^(#{1,6})\s/gm, (_, h) => "#".repeat(Math.min(6, h.length + 4)) + " ")
    .replace(/!\[([^\]]*)\]\(photo:([^)\s]+)\)/g, (_, alt, id) => `*[Photo: ${(photos.get(id) || {}).caption || alt || id}]*`)
    .replace(/\[([^\]]+)\]\((?:photo|story):[^)\s]+\)/g, "$1")
    .trim();
}
