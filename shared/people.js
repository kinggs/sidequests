// shared/people.js — the household's people, shared by every app.
//
//   import { people } from "../shared/people.js";
//   people.onChange(render);                        // once, at load
//   unsubs.push(people.start({                      // after sign-in, beside the app's watchers
//     legacy: () => oldPlayerMapOrNull,             // the app's pre-sharing list, null until loaded
//     onMe: ({ name, added }) => toast(...),        // the signed-in person was linked or added
//     onError: e => toast(...)
//   }));
//   people.active()            // [{ id, name, email, colour, createdAt }], you first
//   people.resolve(id)         // any id an app ever stored → who that is today
//   people.get(id), people.nameOf(id), people.colourOf(id), people.meId(), people.isMe(id)
//   await people.edit(null, { noun: "player" })     // the shared add sheet → new id, or null
//   people.edit(id)            // edit, merge into someone else, or remove
//   people.edit(id, { cuescore: true })             // …plus their Cuescore profile link (cue apps)
//
// Why: Melanie is one person whether she's playing pool, darts or climbing, so she's added
// once, here, at /sidequests/_shared/people/<id>. Each app keeps its own records (games,
// climbs, ratings) in its own namespace, keyed by the person's id.
//
// Ids are forever. When two entries turn out to be the same person, the spare one is kept
// as a pointer ({ mergedInto }) instead of rewriting every record that mentions it, so
// apps read stored ids back through resolve(). The same trick adopts each app's old,
// private player list the first time it runs: every old id becomes a person doc — the
// person themselves, or a pointer to the matching person another app already added.

import { cloud } from "./cloud.js";

export const PALETTE = ["#cf1b1b", "#e8730c", "#f2c204", "#0f7a3d", "#2f9e8f", "#4a8fce", "#6b2fa0", "#c2497e"];
const COL = "people";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = x => String(x || "").trim().toLowerCase();

let all = {};             // id -> person, pointers and removed people included
let seen = "";            // the last snapshot, so an unchanged one doesn't re-render the app
let confirmed = false;    // the server has answered, so "missing" really means missing
let unsub = null;
let opts = {};
let meHandled = null;
let wrote = false;
const tried = new Set();  // writes attempted this sign-in, so a refused one isn't retried in a loop
const listeners = new Set();

function report(e){
  console.warn("[people]", e);
  if (opts.onError) { try { opts.onError(e); } catch {} }
}
function notify(){
  listeners.forEach(fn => { try { fn(); } catch (e) { console.warn("[people]", e); } });
}

// Local copy first so the screen updates at once (and offline); the cloud catches up.
function write(id, fields){
  all = { ...all, [id]: { ...(all[id] || {}), ...fields } };
  wrote = true;
  return cloud.shared.save(`${COL}/${id}`, fields).catch(report);
}

// ---- reading ----
function resolve(id){
  let cur = id == null ? id : String(id);
  for (let i = 0; i < 8 && cur && all[cur] && all[cur].mergedInto && all[cur].mergedInto !== cur; i++) cur = all[cur].mergedInto;
  return cur;
}

const myEmail = () => lower(cloud.user && cloud.user.email);
const mine = p => !!p && !!myEmail() && lower(p.email) === myEmail();
const current = () => Object.entries(all)
  .filter(([, p]) => p && !p.deleted && !p.mergedInto)
  .map(([id, p]) => ({ id, ...p }));

// You first, then everyone else in the order they were added.
function active(){
  return current().sort((a, b) => (mine(b) - mine(a)) || (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
}

function get(id){
  const r = resolve(id);
  if (!r) return null;
  if (all[r]) return { id: r, ...all[r] };
  // Not adopted yet (first run, or offline on a phone that has never seen the list):
  // fall back to the app's own old entry so names still show.
  const old = opts.legacy ? (opts.legacy() || {})[r] : null;
  return old && old.name
    ? { id: r, name: String(old.name), email: old.email || "", colour: old.colour || "", createdAt: old.createdAt || 0, deleted: !!old.deleted }
    : null;
}
const nameOf = (id, fallback = "Someone") => { const p = get(id); return (p && p.name) || fallback; };
function hash(s){ let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function colourOf(id){
  const p = get(id);
  return (p && p.colour) || PALETTE[hash(p ? p.id : id) % PALETTE.length];
}
function nextColour(){
  const list = current();
  const used = new Set(list.map(p => p.colour));
  return PALETTE.find(c => !used.has(c)) || PALETTE[list.length % PALETTE.length];
}
function meId(){ const p = current().find(mine); return p ? p.id : null; }
const isMe = id => mine(get(id));

// ---- writing ----
function add({ name, email = "", colour = "" }){
  const id = cloud.shared.newId();
  write(id, { name: String(name).trim(), email: lower(email), colour: colour || nextColour(), createdAt: Date.now(), deleted: false });
  notify();
  return id;
}
function update(id, fields){
  const r = resolve(id);
  if (!r || !all[r]) return;
  const f = { ...fields };
  if ("email" in f) f.email = lower(f.email);
  if ("name" in f) f.name = String(f.name).trim();
  write(r, f);
  notify();
}
function remove(id){
  const r = resolve(id);
  if (!r || !all[r]) return;
  write(r, { deleted: true });
  notify();
}

// Fold one entry into another. The spare stays as a pointer, so every record that
// mentions it — in any app — now reads as the person it was merged into.
function merge(from, into, quiet){
  const a = resolve(from), b = resolve(into);
  if (!a || !b || a === b || !all[a] || !all[b]) return false;
  const key = `merge:${a}>${b}`;
  if (tried.has(key)) return false;
  tried.add(key);
  const fill = {};
  if (!all[b].email && all[a].email) fill.email = all[a].email;
  if (!all[b].colour && all[a].colour) fill.colour = all[a].colour;
  if (Object.keys(fill).length) write(b, fill);
  write(a, { deleted: true, mergedInto: b });
  if (!quiet) notify();
  return true;
}

// Bring a map of { id: { name, email, colour, createdAt, deleted } } into the shared list —
// an app's pre-sharing player list, or the people in an imported file. Each id becomes a
// person doc with the same id: a pointer when someone matching already exists (same email,
// or same name where the emails don't disagree), otherwise the person themselves. Reusing
// the ids means two phones adopting the same list write the same docs, not duplicates.
function adopt(map){
  if (!map || typeof map !== "object") return 0;
  const rows = Object.entries(map)
    .filter(([id, p]) => id && p && p.name && !all[id] && !tried.has("adopt:" + id))
    .sort(([, a], [, b]) => (!!a.deleted - !!b.deleted) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
  for (const [id, p] of rows){
    tried.add("adopt:" + id);
    const name = String(p.name).trim(), email = lower(p.email);
    const createdAt = Number(p.createdAt) || Date.now();
    if (p.mergedInto){ write(id, { name, createdAt, deleted: true, mergedInto: String(p.mergedInto) }); continue; }
    const live = active();
    const match = p.deleted ? null
      : (email && live.find(q => lower(q.email) === email))
        || live.find(q => lower(q.name) === lower(name) && !(email && q.email));
    if (match){
      const fill = {};
      if (email && !match.email) fill.email = email;
      if (p.colour && !match.colour) fill.colour = p.colour;
      if (Object.keys(fill).length) write(match.id, fill);
      write(id, { name, createdAt, deleted: true, mergedInto: match.id });
    } else {
      write(id, { name, email, colour: p.colour || "", createdAt, deleted: !!p.deleted });
    }
  }
  return rows.length;
}

// A Google account is one person. If two entries carry the same email (two phones adding
// someone at once), fold the newer into the older. Every phone picks the same survivor.
function dedupe(){
  const groups = new Map();
  for (const p of current()){
    const e = lower(p.email);
    if (!e) continue;
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e).push(p);
  }
  for (const list of groups.values()){
    if (list.length < 2) continue;
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
    for (const p of list.slice(1)) merge(p.id, list[0].id, true);
  }
}

// You're a person by default: linked by email, else to someone with your first name and
// no email yet (a "Rolf" added from Kenny's phone becomes Rolf's own entry the first time
// he signs in), else added under your Google first name.
function ensureMe(){
  const u = cloud.user, email = myEmail();
  if (!u || !email || meHandled === email) return;
  meHandled = email;
  if (meId()) return;
  const first = (u.displayName || email.split("@")[0]).trim().split(/\s+/)[0];
  const match = active().find(p => !p.email && (lower(p.name) === lower(first) || lower(p.name) === lower(u.displayName)));
  let id, name;
  if (match){ id = match.id; name = match.name; write(id, { email }); }
  else {
    id = cloud.shared.newId(); name = first;
    write(id, { name, email, colour: nextColour(), createdAt: Date.now(), deleted: false });
  }
  if (opts.onMe) setTimeout(() => { try { opts.onMe({ id, name, added: !match }); } catch {} }, 0);
}

// Only once the server has answered (so nobody gets added twice from a stale cache) and
// the app's own old list has loaded (so it's adopted before anyone is added fresh).
function sync(){
  if (!confirmed || !cloud.user) return;
  let legacy = null;
  if (opts.legacy){ legacy = opts.legacy(); if (legacy == null) return; }
  adopt(legacy);
  dedupe();
  ensureMe();
}

// ---- lifecycle ----
function start(o = {}){
  stop();
  opts = o; meHandled = null; tried.clear();
  if (!cloud.shared) return healStale();
  if (!cloud.configured() || !cloud.user) return stop;
  unsub = cloud.shared.watchList(COL, (rows, meta) => {
    const next = {};
    for (const { id, _updatedAt, ...p } of rows) next[id] = p;
    const sig = JSON.stringify(next);
    const was = confirmed;
    if (!meta.fromCache) confirmed = true;
    if (sig === seen && was === confirmed) return;
    seen = sig;
    all = next;
    sync();
    notify();
  }, report);
  return stop;
}
function stop(){
  if (unsub){ try { unsub(); } catch {} }
  unsub = null; all = {}; seen = ""; confirmed = false;
}
// A half-updated page: the browser's cache handed over an older cloud.js than this
// people.js. Fetch the current one past the cache and reload — once, so it can't loop.
function healStale(){
  report(new Error("This phone had an old copy of cloud.js — reloading"));
  try {
    if (!sessionStorage.getItem("people.healed")){
      sessionStorage.setItem("people.healed", "1");
      fetch(new URL("./cloud.js", import.meta.url), { cache: "reload" }).finally(() => location.reload());
    }
  } catch {}
  return stop;
}

// The app's own data changed (its old list just loaded): adopt and link again if needed.
function poke(){
  wrote = false;
  sync();
  if (wrote) notify();
}
function onChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }

// ---- taps: pointerup, not click (same as the apps) ----
function tap(node, fn){
  let down = false, sx = 0, sy = 0;
  node.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; });
  node.addEventListener("pointercancel", () => { down = false; });
  node.addEventListener("pointerup", e => {
    if (!down) return;
    down = false;
    if (Math.abs(e.clientX - sx) > 14 || Math.abs(e.clientY - sy) > 14) return;
    e.preventDefault();
    fn(e);
  });
  node.addEventListener("click", e => e.preventDefault());
}
// First tap arms it for five seconds, second tap does it.
function armed(btn, label, sure, fn){
  let timer = null;
  tap(btn, () => {
    if (!timer){
      timer = setTimeout(() => { timer = null; btn.classList.remove("pk-arm"); btn.textContent = label; }, 5000);
      btn.classList.add("pk-arm");
      btn.textContent = typeof sure === "function" ? sure() : sure;
      if (navigator.vibrate) navigator.vibrate(12);
      return;
    }
    clearTimeout(timer); timer = null;
    fn();
  });
}

// ---- the shared add / edit sheet ----
// Colours come from the app's own CSS variables where it has them (--panel, --bg, --ink,
// --ink-dim, --accent, --accent-ink, --danger); --pk-card overrides the card if --panel
// is see-through.
const CSS = `
.pk-ov{position:fixed;inset:0;z-index:25;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;
  padding:max(16px,env(safe-area-inset-top)) 14px max(16px,env(safe-area-inset-bottom));overflow-y:auto}
.pk-card{width:100%;max-width:26rem;margin:auto;background:var(--pk-card,var(--panel,#1a2027));color:var(--ink,#eef0f2);
  border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:18px 16px 16px;display:flex;flex-direction:column;gap:6px;
  font-size:18px;line-height:1.4;box-shadow:0 10px 40px rgba(0,0,0,.6);text-align:left}
.pk-card *{box-sizing:border-box;touch-action:manipulation}
.pk-card [hidden]{display:none !important}
.pk-card h2{font-size:22px;font-weight:800;margin:0 0 4px}
.pk-card label{display:block;font-size:15px;font-weight:600;color:var(--ink-dim,#aab3bd);margin:8px 0 2px}
.pk-card input,.pk-card select{width:100%;min-height:56px;padding:0 14px;font:inherit;font-size:18px;color:var(--ink,#eef0f2);
  background:var(--bg,#101418);border:1px solid rgba(255,255,255,.2);border-radius:12px;-webkit-user-select:text;user-select:text}
.pk-card button{min-height:56px;padding:0 18px;border-radius:12px;border:1px solid transparent;font:inherit;font-size:18px;font-weight:700}
.pk-card button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.pk-card .pk-go{background:var(--accent,#4a8fce);color:var(--accent-ink,#fff)}
.pk-card .pk-quiet{background:transparent;color:var(--ink-dim,#aab3bd);border-color:rgba(255,255,255,.26)}
.pk-card .pk-arm{background:var(--danger,#e2603f);color:#fff;border-color:transparent}
.pk-row{display:flex;gap:10px;margin-top:10px}
.pk-row>*{flex:1}
.pk-sw{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px}
.pk-card .pk-sw button{width:56px;height:56px;padding:0;border-radius:50%;background:var(--c);border:none;
  box-shadow:inset -4px -5px 8px rgba(0,0,0,.35)}
.pk-card .pk-sw button[aria-pressed="true"]{outline:4px solid var(--ink,#fff);outline-offset:2px}
.pk-note{font-size:15px;color:var(--ink-dim,#aab3bd);margin:4px 0 0}
.pk-warn{font-size:16px;color:#e8b04a;margin:6px 0 0}
.pk-more{border-top:1px solid rgba(255,255,255,.14);margin-top:14px;padding-top:4px;display:flex;flex-direction:column;gap:8px}
`;
function injectCss(){
  if (document.getElementById("pk-css")) return;
  const s = document.createElement("style");
  s.id = "pk-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// A Cuescore profile link ends in the player's number: cuescore.com/player/Kenny+Inggs/1234567.
// Keep just that number; a bare number is fine too. "" clears it, null means it didn't parse.
function cuescoreIdFrom(text){
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.split(/[?#]/)[0].match(/(\d+)\/*$/);
  return m ? m[1] : null;
}

function edit(id = null, { noun = "person", cuescore = false } = {}){
  injectCss();
  const p = id ? get(id) : null;
  if (id && !p) return Promise.resolve(null);
  document.querySelectorAll(".pk-ov").forEach(n => n.remove());
  return new Promise(done => {
    const ov = document.createElement("div");
    ov.className = "pk-ov";
    ov.innerHTML = `<div class="pk-card" role="dialog" aria-modal="true" aria-labelledby="pk-title">
      <h2 id="pk-title"></h2>
      <label for="pk-name">Name</label>
      <input type="text" id="pk-name" maxlength="24" autocomplete="off">
      <label>Colour</label>
      <div class="pk-sw"></div>
      <label for="pk-email">Their Gmail, so they can sign in (optional)</label>
      <input type="email" id="pk-email" inputmode="email" autocomplete="off" placeholder="name@gmail.com">
      <div data-k="cuebox" hidden>
        <label for="pk-cue">Cuescore profile link (optional)</label>
        <input type="url" id="pk-cue" inputmode="url" autocomplete="off" placeholder="https://cuescore.com/player/…">
      </div>
      <p class="pk-warn" hidden></p>
      <div class="pk-row">
        <button type="button" class="pk-quiet" data-k="cancel">Cancel</button>
        <button type="button" class="pk-go" data-k="save">Save</button>
      </div>
      <p class="pk-note">One list for every sidequests app — add someone once and they're in all of them.</p>
      <div class="pk-more" hidden>
        <div data-k="mergebox">
          <label for="pk-same">Added twice? Same person as…</label>
          <select id="pk-same"><option value="">Pick someone</option></select>
          <div class="pk-row"><button type="button" class="pk-quiet" data-k="merge">Merge</button></div>
          <p class="pk-note">Folds this entry into the one you pick. Everything logged for either, in every app, ends up under that one name.</p>
        </div>
        <div data-k="removebox">
          <div class="pk-row"><button type="button" class="pk-quiet" data-k="remove">Remove from every app</button></div>
          <p class="pk-note">Past games and climbs keep their name.</p>
        </div>
      </div>
    </div>`;
    const q = s => ov.querySelector(s);
    const nameIn = q("#pk-name"), emailIn = q("#pk-email"), cueIn = q("#pk-cue"), warn = q(".pk-warn");
    q('[data-k="cuebox"]').hidden = !cuescore;
    cueIn.value = p && p.cuescoreId ? p.cuescoreId : "";
    q("#pk-title").textContent = p ? `Edit ${p.name}` : `Add a ${noun}`;
    nameIn.value = p ? p.name : "";
    emailIn.value = p ? (p.email || "") : "";
    const say = msg => { warn.hidden = !msg; warn.textContent = msg || ""; };

    let colour = p ? colourOf(p.id) : nextColour();
    const sw = q(".pk-sw");
    for (const c of PALETTE){
      const b = document.createElement("button");
      b.type = "button";
      b.style.setProperty("--c", c);
      b.setAttribute("aria-label", "Colour");
      b.setAttribute("aria-pressed", String(c === colour));
      tap(b, () => { colour = c; sw.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
      sw.appendChild(b);
    }

    const onKey = e => { if (e.key === "Escape") close(null); };
    function close(result){
      ov.remove();
      document.removeEventListener("keydown", onKey);
      done(result);
    }
    document.addEventListener("keydown", onKey);
    tap(q('[data-k="cancel"]'), () => close(null));

    let sameNameOk = false;
    nameIn.addEventListener("input", () => { sameNameOk = false; say(""); });
    function save(){
      const name = nameIn.value.trim().replace(/\s+/g, " ");
      const email = lower(emailIn.value);
      const self = p ? p.id : null;
      if (!name){ nameIn.focus(); return; }
      if (email && !EMAIL.test(email)){ say("That email doesn't look right."); emailIn.focus(); return; }
      const cuescoreId = cuescore ? cuescoreIdFrom(cueIn.value) : undefined;
      if (cuescoreId === null){ say("That Cuescore link doesn't end in a player number."); cueIn.focus(); return; }
      const twin = email && current().find(x => x.id !== self && lower(x.email) === email);
      if (twin){ say(`${twin.name} already has that email.`); return; }
      const clash = current().find(x => x.id !== self && lower(x.name) === lower(name));
      if (clash && !sameNameOk){
        sameNameOk = true;
        say(`There's already a ${clash.name}. Tap Save again if this is someone else.`);
        return;
      }
      let out;
      const extra = cuescore ? { cuescoreId } : {};
      if (p){ update(p.id, { name, colour, email, ...extra }); out = p.id; }
      else { out = add({ name, email, colour }); if (cuescore && cuescoreId) update(out, extra); }
      // Giving a Gmail puts it on the family list, so they can sign in straight away.
      if (email && email !== lower(p && p.email)) cloud.addMember(email).catch(report);
      close(out);
    }
    tap(q('[data-k="save"]'), save);
    nameIn.addEventListener("keydown", e => { if (e.key === "Enter") emailIn.focus(); });
    emailIn.addEventListener("keydown", e => { if (e.key === "Enter") cuescore ? cueIn.focus() : save(); });
    cueIn.addEventListener("keydown", e => { if (e.key === "Enter") save(); });

    if (p){
      q(".pk-more").hidden = false;
      const others = active().filter(x => x.id !== p.id);
      const sel = q("#pk-same");
      for (const x of others){
        const o = document.createElement("option");
        o.value = x.id;
        o.textContent = x.email ? `${x.name} · ${x.email}` : x.name;
        sel.appendChild(o);
      }
      if (!others.length) q('[data-k="mergebox"]').hidden = true;
      armed(q('[data-k="merge"]'), "Merge", () => sel.value ? `Merge into ${nameOf(sel.value)}?` : "Pick someone first", () => {
        if (!sel.value){ say("Pick who they really are first."); return; }
        const into = sel.value;
        if (merge(p.id, into)) close(into);
      });
      if (isMe(p.id)) q('[data-k="removebox"]').hidden = true;   // you can't remove yourself
      else armed(q('[data-k="remove"]'), "Remove from every app", "Sure? Tap again", () => { remove(p.id); close(null); });
    }

    document.body.appendChild(ov);
    if (!p) nameIn.focus();
  });
}

export const people = {
  PALETTE,
  start, stop, poke, onChange,
  active, get, resolve, nameOf, colourOf, nextColour, meId, isMe,
  add, update, remove, merge, adopt, edit,
  all: () => ({ ...all }),
  get ready(){ return confirmed; }
};
