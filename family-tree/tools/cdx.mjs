// family-tree/tools/cdx.mjs — the Wayback Machine's CDX index, as pure functions (PLAN.md,
// Session 2). No network here: inventory.mjs fetches, this file reads what it fetched, and
// cdx.test.mjs proves it on synthetic rows. Everything below works on plain objects:
//
//   { timestamp: "20100214230828", url: "http://familytree.inggs.com/people/p12.htm",
//     status: "200", mime: "text/html", digest: "ABC…", length: 4312 }
//
// A row whose status is "-" and mime "warc/revisit" is a *revisit*: the Wayback Machine saw the
// same bytes as an earlier capture with that digest and stored only a pointer. Fetching it with
// the id_ flag still serves the content, so for choosing a capture it counts as that digest's
// status.

export const TARGET = "20100214230828";   // the last known good capture (BRIEF.md): 14 Feb 2010
export const HOST = "familytree.inggs.com";

// The CDX API's JSON output: the first row names the fields, the rest are rows. With
// showResumeKey=true a blank row and then the resume key may end the list; both are dropped and
// the key is returned beside the rows.
export function parseCdx(json){
  const rows = typeof json === "string" ? JSON.parse(json) : json;
  if (!Array.isArray(rows) || !rows.length) return { rows: [], resumeKey: null };
  const fields = rows[0];
  let resumeKey = null, body = rows.slice(1);
  if (body.length >= 2 && Array.isArray(body[body.length - 2]) && body[body.length - 2].length === 0){
    resumeKey = String(body[body.length - 1][0] || "") || null;
    body = body.slice(0, -2);
  }
  const names = { timestamp: "timestamp", original: "url", statuscode: "status", mimetype: "mime", digest: "digest", length: "length" };
  const out = [];
  for (const r of body){
    if (!Array.isArray(r) || r.length !== fields.length) continue;
    const o = {};
    fields.forEach((f, i) => { o[names[f] || f] = r[i]; });
    o.length = Number(o.length) || 0;
    out.push(o);
  }
  return { rows: out, resumeKey };
}

// One canonical spelling for a URL, so http/https, a port, a trailing index page and the host's
// case all count as one page: "familytree.inggs.com/people/p12.htm". The path keeps its case
// (the site may have been on a case-sensitive server) and its query string.
export function canonical(url){
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(url) ? url : "http://" + url); } catch { return String(url); }
  let path = (u.pathname || "/").replace(/\/+/g, "/");
  path = path.replace(/\/(index|default)\.(html?|php|asp)$/i, "/");
  return u.hostname.toLowerCase().replace(/^www\./, "") + path + (u.search || "");
}

// What kind of thing a URL is, by its mime type first and its extension second.
export function kindOf(row){
  const mime = String(row.mime || "").toLowerCase(), url = String(row.url || "").toLowerCase().split(/[?#]/)[0];
  if (/^image\//.test(mime) || /\.(jpe?g|gif|png|bmp|tiff?|webp|ico)$/.test(url)) return "image";
  if (/html|xhtml/.test(mime) || /\.(html?|php|asp|aspx|shtml)$/.test(url) || /\/$/.test(url)) return "page";
  if (/\.ged$/.test(url) || /x-gedcom/.test(mime)) return "gedcom";
  if (/css|javascript|ecmascript/.test(mime) || /\.(css|js)$/.test(url)) return "asset";
  if (/pdf|msword|zip|octet/.test(mime) || /\.(pdf|docx?|zip)$/.test(url)) return "file";
  if (mime === "warc/revisit" || mime === "-") return "revisit";
  return "other";
}

// A row's effective status: its own, or for a revisit the status of the capture it points at.
function effectiveStatus(row, byDigest){
  if (row.status && row.status !== "-") return row.status;
  const twin = (byDigest.get(row.digest) || []).find(r => r.status && r.status !== "-");
  return twin ? twin.status : "-";
}

// The best capture of each URL: the 200 closest to TARGET, preferring one on or before it, else
// the nearest earlier 200, else the nearest later 200. Returns a Map of canonical URL →
// { url, timestamp, status, mime, digest, kind, captures, distance } where captures is how many
// rows the URL had. A URL with no 200 anywhere comes back with status of its nearest row, so a
// 401-only page is still listed (and reported as missing) rather than dropped.
export function pickBest(rows, target = TARGET){
  const byDigest = new Map();
  for (const r of rows) if (r.digest){ if (!byDigest.has(r.digest)) byDigest.set(r.digest, []); byDigest.get(r.digest).push(r); }
  const byUrl = new Map();
  for (const r of rows){
    const key = canonical(r.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push({ ...r, status: effectiveStatus(r, byDigest) });
  }
  const t = Number(target);
  const score = r => {
    const d = Number(r.timestamp) - t;            // negative: before the target
    const ok = r.status === "200";
    // Rank: a 200 on/before the target (nearest first), then a 200 after (nearest first), then anything (nearest).
    return [ok ? 0 : 1, ok ? (d <= 0 ? 0 : 1) : 0, Math.abs(d)];
  };
  const less = (a, b) => { const sa = score(a), sb = score(b); for (let i = 0; i < 3; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i]; return 0; };
  const out = new Map();
  for (const [key, list] of byUrl){
    const best = [...list].sort(less)[0];
    out.set(key, { url: best.url, timestamp: best.timestamp, status: best.status, mime: best.mime, digest: best.digest,
      kind: kindOf(best), captures: list.length, distance: Number(best.timestamp) - t });
  }
  return out;
}

// The Wayback URLs for a capture: id_ serves the original bytes, with no toolbar and no
// rewritten links (BRIEF.md, Phase 1 step 4); the plain one is for a person to open.
export const waybackRaw = (timestamp, url) => `https://web.archive.org/web/${timestamp}id_/${url}`;
export const waybackView = (timestamp, url) => `https://web.archive.org/web/${timestamp}/${url}`;

// The shape of the site, read off the inventory (BRIEF.md, Phase 1 step 2): counts by kind and
// status, the date range, the URL conventions (the first path segment of every page) and how
// many URLs have no 200 at all. Pure, so the report is the same wherever it's printed.
export function analyse(rows, best = pickBest(rows), host = HOST){
  const stamps = rows.map(r => r.timestamp).filter(Boolean).sort();
  const years = {};
  for (const s of stamps) years[s.slice(0, 4)] = (years[s.slice(0, 4)] || 0) + 1;
  const kinds = {}, statuses = {}, prefixes = {}, extensions = {};
  let missing = 0;
  for (const b of best.values()){
    kinds[b.kind] = (kinds[b.kind] || 0) + 1;
    statuses[b.status] = (statuses[b.status] || 0) + 1;
    if (b.status !== "200") missing++;
    const key = canonical(b.url), path = key.startsWith(host) ? key.slice(host.length) : "/" + key;
    const seg = path.split("/")[1] || "";
    const prefix = path.endsWith("/") && !seg ? "/" : "/" + (path.split("/").length > 2 ? seg + "/" : "");
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    const ext = (path.match(/\.([a-z0-9]+)$/i) || [, "(none)"])[1].toLowerCase();
    extensions[ext] = (extensions[ext] || 0) + 1;
  }
  const sortDesc = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  return {
    captures: rows.length, urls: best.size, missing,
    first: stamps[0] || null, last: stamps[stamps.length - 1] || null, years,
    kinds: sortDesc(kinds), statuses: sortDesc(statuses), prefixes: sortDesc(prefixes), extensions: sortDesc(extensions),
    gedcom: [...best.values()].filter(b => b.kind === "gedcom").map(b => b.url),
    onTarget: [...best.values()].filter(b => b.timestamp.startsWith(TARGET.slice(0, 8))).length,
  };
}

// The analysis as the lines PLAN.md records (Session 2 pastes them in).
export function describe(a){
  const line = (k, o) => `${k}: ` + Object.entries(o).map(([x, n]) => `${x} ${n}`).join(", ");
  const day = s => s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "none";
  return [
    `Captures ${a.captures} of ${a.urls} URLs, ${day(a.first)} to ${day(a.last)}; ${a.onTarget} URLs best-captured on 2010-02-14; ${a.missing} with no 200 at all.`,
    line("By kind", a.kinds), line("Best status", a.statuses), line("Years", a.years), line("Paths", a.prefixes), line("Extensions", a.extensions),
    a.gedcom.length ? `GEDCOM found: ${a.gedcom.join(", ")}` : "No GEDCOM file in the index.",
  ].join("\n");
}
