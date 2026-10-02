// shared/people.js — Players: everyone an app can name, from three sources (KIT.md, Players).
//
//   import { people } from "../shared/people.js";
//   people.onChange(render);                        // once, at load
//   unsubs.push(people.start({                      // after sign-in, beside the app's watchers
//     legacy: () => oldPlayerMapOrNull,             // the app's pre-sharing list, null until loaded
//     onMe: ({ name, added }) => toast(...),        // the signed-in person was linked or added
//     onError: e => toast(...),
//     household: false                              // optional: skip the household list (Rack It, bar the owner)
//   }));
//   people.active()            // the household: [{ id, name, email, colour, createdAt, uid, photoURL }], you first
//   people.players()           // the household, your friends and your guests: [{ id, name, kind, … }]
//   people.resolve(id)         // any id an app ever stored → who that is today
//   people.get(id)             // { id, name, photo, colour, kind, … } | null; kind "household" | "account" | "guest"
//   people.nameOf(id), people.colourOf(id), people.meId(), people.isMe(id)
//   people.avatar(id, 36)      // <span>: their photo in a ring of their colour, or their initial
//   await people.pick({ title, recent, exclude, app })  // the picker sheet → an id, or null
//   await people.addPlayer({ app })                     // just Scan a new player or Add a guest → an id, or null
//   await people.addGuest(), await people.scan(app)     // straight to a guest's name, or to My QR → an id, or null
//   people.names(ids), people.uidsOf(ids)  // what a record stores beside its player ids: names, and the accounts
//   await people.claim(gid, { app, rewrite })   // That was them: pick the friend, hold; rewrite(gid, uid) → the uid, or null
//   people.showGuests({ app, rewrite })     // the account sheet's Your guests, each one claimable
//   people.guests(), people.claimedGuests() // your unclaimed guests; the claimed ones, [{ id, claimedBy }]
//   people.swapId(doc, from, to)            // one id swapped for another everywhere in a record, deep
//   await people.edit(null, { noun: "player" })     // add a household person (household only) → new id, or null
//   people.edit(id)            // edit, merge into someone else, or remove
//   people.edit(id, { cuescore: true })             // …plus the Cuescore profile link (cue apps; yours only)
//
// The sources, merged by resolved id:
// - household: /sidequests/_shared/people, the list every app shares. Watched only when
//   cloud.role() isn't null: nobody outside the household can read it. An app that has no
//   household tier passes household: false, and a member is then a player like anyone else
//   (Rack It for everyone but the owner, KIT-PLAN.md Session 6b).
// - friends: your Connect friends (cloud.account.watchFriends), named and pictured by their
//   profile. An account's id is its uid.
// - guests: someone with no phone, a typed name private to you (profiles/<you>/guests/g_<id>).
// - you, when you aren't household: your own account, named and pictured by your profile, so
//   an outsider can pick themselves (KIT-PLAN.md Session 6). meId() is then your uid.
// A household person who has claimed is also an account: the household's name and colour win.
// Anyone with no colour gets one hashed from their id.
//
// A household person may carry a Gmail. On sign-in the account is linked to the person with
// its email; failing that, a "Which player are you?" card lists the unclaimed people. A claimed
// person carries uid, claimedAt and the Google photoURL, refreshed on every sign-in. A claim is
// for good: a wrong one is fixed by the owner editing the person document in the Firebase
// console (KIT-PLAN.md, Parked). Adding a person never puts them on /members: Invites does that.
//
// Ids. A claimed person's id is their account's uid: active(), meId() and resolve() return
// it, and every call here accepts it. Anyone unclaimed keeps their person document's id.
// Records stored under the old document id still read through resolve(), so nothing is
// rewritten. (Every call also still accepts the document id.)
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
import { ui } from "./ui.js";
const tap = ui.tap;

export const PALETTE = ["#cf1b1b", "#e8730c", "#f2c204", "#0f7a3d", "#2f9e8f", "#4a8fce", "#6b2fa0", "#c2497e"];
const COL = "people";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = x => String(x || "").trim().toLowerCase();

let all = {};             // id -> person, pointers and removed people included
let friends = {};         // uid -> { name, photo, since, named }: your Connect friends
let guests = {};          // g_<id> -> { name, createdAt, claimedBy }: yours
let self = null;          // { name, photo }: you, from your profile, when you aren't household
let household = true;     // false once cloud.role() says this account isn't on /members
let offs = [];            // the friends and guests listeners
let runs = 0;             // bumped by stop(), so a late role() answer can't start a stale watch
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
// The person document an id names: a document id, or a claimed person's uid, followed
// through merges. null when nobody has that id (yet).
let byUid = new Map(), indexed = null;
function docOf(id){
  if (id == null || id === "") return null;
  if (indexed !== all){
    indexed = all;
    byUid = new Map();
    // One account, one person; if a merged pointer still carries the uid, the live one wins.
    for (const [d, p] of Object.entries(all)) if (p && p.uid && (!byUid.has(p.uid) || all[byUid.get(p.uid)].mergedInto)) byUid.set(p.uid, d);
  }
  let cur = all[String(id)] ? String(id) : byUid.get(String(id));
  if (!cur) return null;
  for (let i = 0; i < 8 && all[cur] && all[cur].mergedInto && all[cur].mergedInto !== cur; i++) cur = all[cur].mergedInto;
  return cur;
}
// Any id an app ever stored → the id that person has today: their uid once claimed.
function resolve(id){
  if (id == null) return id;
  // A guest you've claimed (That was them) is the account it pointed at.
  const g = guests[String(id)];
  if (g && g.claimedBy && g.claimedBy !== String(id)) return resolve(g.claimedBy);
  const d = docOf(id);
  if (!d) return String(id);
  return (all[d] && all[d].uid) || d;
}

const myEmail = () => lower(cloud.user && cloud.user.email);
const myUid = () => (cloud.user && cloud.user.uid) || "";
const mine = p => !!p && ((!!p.uid && p.uid === myUid()) || (!!myEmail() && lower(p.email) === myEmail()));
// Internal: keyed by document id, which is what writes need.
const current = () => Object.entries(all)
  .filter(([, p]) => p && !p.deleted && !p.mergedInto)
  .map(([id, p]) => ({ id, ...p }));
const byAdded = list => list.sort((a, b) => (mine(b) - mine(a)) || (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));

// You first, then everyone else in the order they were added. Ids as resolve() gives them.
function active(){
  return byAdded(current()).map(p => ({ ...p, id: p.uid || p.id, docId: p.id }));
}

function get(id){
  const d = docOf(id);
  if (d && all[d]){
    const p = all[d], f = p.uid && friends[p.uid];
    return { ...p, id: p.uid || d, docId: d, kind: "household", photo: p.photoURL || (f && f.photo) || "" };
  }
  const r = resolve(id);
  if (!r) return null;
  if (self && r === myUid()) return { id: r, uid: r, name: self.name, photo: self.photo, photoURL: self.photo, colour: "", createdAt: 0, kind: "account" };
  const f = friends[r];
  if (f) return { id: r, uid: r, name: f.name, photo: f.photo, photoURL: f.photo, colour: "", createdAt: f.since || 0, kind: "account" };
  const g = guests[r];
  if (g) return { id: r, name: g.name, photo: "", colour: "", createdAt: g.createdAt || 0, claimedBy: g.claimedBy || "", kind: "guest" };
  // Not adopted yet (first run, or offline on a phone that has never seen the list):
  // fall back to the app's own old entry so names still show.
  const old = opts.legacy ? (opts.legacy() || {})[r] : null;
  return old && old.name
    ? { id: r, name: String(old.name), email: old.email || "", colour: old.colour || "", createdAt: old.createdAt || 0, deleted: !!old.deleted, kind: "household", photo: "" }
    : null;
}
const nameOf = (id, fallback = "Someone") => { const p = get(id); return (p && p.name) || fallback; };

// Everyone a picker offers: the household (not removed), then friends and guests who aren't
// already in it. Ids as resolve() gives them.
function players(){
  const out = active().map(p => ({ ...p, kind: "household", photo: p.photoURL || "" }));
  const seen = new Set(out.map(p => p.id));
  for (const id of [...(self ? [myUid()] : []), ...Object.keys(friends), ...Object.keys(guests)]){
    const r = resolve(id), p = get(r);
    if (seen.has(r) || !p || p.deleted || p.claimedBy) continue;
    seen.add(r);
    out.push(p);
  }
  return out;
}
// What a record keeps beside its player ids, so it reads without this list: the names as they
// are now, and the accounts in it (what the rules check). A guest or an unclaimed household
// person has no account.
const names = ids => ids.map(id => nameOf(id, ""));
const uidsOf = ids => [...new Set(ids.map(get).filter(p => p && p.uid).map(p => p.uid))];
function hash(s){ let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function colourOf(id){
  const p = get(id);
  // Hashed from the document id, so claiming doesn't change an uncoloured person's colour.
  return (p && p.colour) || PALETTE[hash(p ? (p.docId || p.id) : id) % PALETTE.length];
}
function nextColour(){
  const list = current();
  const used = new Set(list.map(p => p.colour));
  return PALETTE.find(c => !used.has(c)) || PALETTE[list.length % PALETTE.length];
}
function meDoc(){
  const list = current();
  const p = list.find(q => q.uid && q.uid === myUid()) || list.find(mine);
  return p ? p.id : null;
}
const meId = () => { const d = meDoc(); return d ? resolve(d) : self ? myUid() : null; };
const isMe = id => mine(get(id));

// ---- writing ----
function add({ name, email = "", colour = "" }){
  const id = cloud.shared.newId();
  write(id, { name: String(name).trim(), email: lower(email), colour: colour || nextColour(), createdAt: Date.now(), deleted: false });
  notify();
  return id;
}
function update(id, fields){
  const r = docOf(id);
  if (!r || !all[r]) return;
  const f = { ...fields };
  if ("email" in f) f.email = lower(f.email);
  if ("name" in f) f.name = String(f.name).trim();
  write(r, f);
  notify();
}
function remove(id){
  const r = docOf(id);
  if (!r || !all[r]) return;
  write(r, { deleted: true });
  notify();
}

// Fold one entry into another. The spare stays as a pointer, so every record that
// mentions it — in any app — now reads as the person it was merged into.
// A claimed spare hands its account to an unclaimed survivor, so the uid keeps its records.
function merge(from, into, quiet){
  const a = docOf(from), b = docOf(into);
  if (!a || !b || a === b || !all[a] || !all[b]) return false;
  const key = `merge:${a}>${b}`;
  if (tried.has(key)) return false;
  tried.add(key);
  const fill = {};
  if (!all[b].email && all[a].email) fill.email = all[a].email;
  if (!all[b].colour && all[a].colour) fill.colour = all[a].colour;
  if (!all[b].uid && all[a].uid) Object.assign(fill, { uid: all[a].uid, claimedAt: all[a].claimedAt || Date.now(), photoURL: all[a].photoURL || "" });
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
    const live = byAdded(current());   // document ids: a pointer must name a document
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

// You're a person by default. Linked to the person with your email (or already claimed by
// this account), and stamped with your uid and latest Google photo. Otherwise one card asks
// "Which player are you?" from the unclaimed people, since guessing by first name links the
// wrong Rolf on a club-sized list. With nobody unclaimed, you're added under your Google name.
function ensureMe(){
  const u = cloud.user, email = myEmail();
  if (!u || !email || meHandled === email) return;
  meHandled = email;
  const id = meDoc();
  if (id){ stamp(id); return; }
  const free = unclaimed();
  if (!free.length) return addMe();
  askWhoIAm();
}
const unclaimed = () => current().filter(p => !p.uid && !mine(p))
  .sort((a, b) => (!!a.email - !!b.email) || String(a.name).localeCompare(String(b.name)));
function stamp(id, extra = {}){
  const u = cloud.user, p = all[id];
  if (!u || !p) return;
  const f = { ...extra };
  if (p.uid !== u.uid){ f.uid = u.uid; f.claimedAt = Date.now(); }
  if (!lower(p.email) && !f.email) f.email = myEmail();
  if (u.photoURL && p.photoURL !== u.photoURL) f.photoURL = u.photoURL;
  if (Object.keys(f).length) write(id, f);
}
function linked(id, added){
  notify();
  if (opts.onMe) setTimeout(() => { try { opts.onMe({ id: resolve(id), name: nameOf(id), added }); } catch {} }, 0);
}
const googleFirst = u => String((u && (u.displayName || String(u.email || "").split("@")[0])) || "You").trim();
function addMe(){
  const u = cloud.user;
  const name = (u.displayName || myEmail().split("@")[0]).trim().split(/\s+/)[0].slice(0, 24);
  const id = cloud.shared.newId();
  write(id, { name, email: myEmail(), colour: nextColour(), createdAt: Date.now(), deleted: false });
  stamp(id);
  linked(id, true);
}

function askWhoIAm(){
  injectCss();
  let unwatch = () => {};
  ui.sheet({ title: "Which player are you?", cancel: false, dismiss: false, className: "pk-sheet", body: close => {
    const box = document.createElement("div");
    box.className = "pk-body";
    box.innerHTML = `<p class="pk-note"></p>
      <div class="pk-list"></div>
      <p class="pk-warn" hidden></p>
      <button type="button" class="quiet" data-k="none">I'm not on the list</button>`;
    const q = sel => box.querySelector(sel);
    q(".pk-note").textContent = `Signed in as ${myEmail()}. Pick yourself once and your games, climbs and photo follow you in every app.`;
    unwatch = onChange(() => {
      if (!box.isConnected) return;
      if (meDoc() || !cloud.user) return close(null);   // claimed from another phone, or signed out
      paint();
    });
    let painted = "";
    function paint(){
      // Only when the list itself changed, so a repaint never swallows a tap mid-press.
      const list = unclaimed();
      const sig = JSON.stringify(list.map(p => [p.id, p.name, p.colour, p.photoURL]));
      if (sig === painted) return;
      painted = sig;
      const list_ = q(".pk-list");
      list_.innerHTML = "";
      for (const p of list){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pk-pick";
        b.append(avatar(p.id, 36));
        const n = document.createElement("span");
        n.textContent = p.name;
        b.append(n);
        tap(b, () => {
          const cur = all[p.id];
          if (!cur || cur.uid || cur.deleted || cur.mergedInto){ say("Someone else just took that one."); painted = ""; paint(); return; }
          close(null);
          stamp(p.id, { email: myEmail() });
          linked(p.id, false);
        });
        list_.append(b);
      }
    }
    const say = msg => { const w = q(".pk-warn"); w.hidden = !msg; w.textContent = msg || ""; };
    tap(q('[data-k="none"]'), () => { close(null); addMe(); });
    paint();
    return box;
  } }).then(() => unwatch());
}

// Only once the server has answered (so nobody gets added twice from a stale cache) and
// the app's own old list has loaded (so it's adopted before anyone is added fresh).
function sync(){
  if (!confirmed || !cloud.user || !household) return;   // an outsider never joins the household list
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
  const run = runs;
  // The household list only for the household, and only when the app wants it. A role that
  // can't be read (offline on a first run) tries the list anyway, as before.
  const role = o.household === false ? Promise.resolve(null)
    : cloud.role().catch(e => { console.warn("[people] role", e); return "unknown"; });
  role.then(role => {
    if (run !== runs) return;
    if (role === null){
      household = false; confirmed = true;
      const u = cloud.user, fallback = googleFirst(u);
      self = { name: fallback, photo: (u && u.photoURL) || "" };
      if (cloud.account && cloud.account.watchMe)
        offs.push(cloud.account.watchMe(p => { self = { name: (p && p.name) || fallback, photo: (p && p.photo) || "" }; notify(); },
          e => console.warn("[people] me", e)));
      notify();
      return;
    }
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
  });
  const acc = cloud.account;
  if (acc && acc.watchFriends && acc.watchGuests){
    offs.push(acc.watchFriends(onFriends, e => console.warn("[people] friends", e)));
    offs.push(acc.watchGuests(onGuests, e => console.warn("[people] guests", e)));
  } else console.warn("[people] this cloud.js has no friends or guests; reload for them");
  return stop;
}
function stop(){
  runs++;
  if (unsub){ try { unsub(); } catch {} }
  for (const off of offs){ try { off(); } catch {} }
  unsub = null; offs = []; all = {}; seen = ""; confirmed = false;
  friends = {}; guests = {}; household = true; self = null;
}
// Friends come as uids; each one's name and photo are read once from their profile.
function onFriends(list){
  const next = {};
  for (const f of list){
    const was = friends[f.uid];
    next[f.uid] = was ? { ...was, since: f.since || 0 } : { name: "", photo: "", since: f.since || 0, named: false };
    if (!was) named(f.uid);
  }
  friends = next;
  notify();
}
function named(uid){
  return cloud.account.profile(uid).then(p => {
    if (!friends[uid]) return;
    friends = { ...friends, [uid]: { ...friends[uid], name: (p && p.name) || "", photo: (p && p.photo) || "", named: true } };
    notify();
  });
}
function onGuests(rows){
  const next = {};
  for (const { id, name, createdAt, claimedBy } of rows) next[id] = { name: name || "", createdAt: createdAt || 0, claimedBy: claimedBy || "" };
  guests = next;
  notify();
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

// ---- the shared add / edit sheet, the picker and "Which player are you?" ----
// Bottom sheets (ui.sheet) on shared/theme.css. Here only what's this file's own: the list of
// people, the colour swatches and the avatar.
const CSS = `
.pk-sheet button{justify-content:center}
.pk-sheet .pk-pick{justify-content:flex-start;gap:12px;padding:0 12px;background:var(--ink-2);color:var(--text);font-weight:600}
.pk-body{display:flex;flex-direction:column;gap:8px}
.pk-body [hidden]{display:none !important}
.pk-body label{margin:6px 0 0}
.pk-body input[type=search],.pk-body input[type=url]{font:inherit;color:var(--text);background:var(--ink-2);border:1px solid var(--line);
  border-radius:var(--r-chip);padding:13px 14px;width:100%;min-height:var(--tap);-webkit-user-select:text;user-select:text}
.pk-row{display:flex;gap:10px;margin-top:6px}
.pk-row>*{flex:1;min-width:0}
.pk-sw{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px}
.pk-sheet .pk-sw button{flex:none;width:56px;height:56px;min-height:56px;padding:0;border-radius:50%;background:var(--c);
  box-shadow:inset -4px -5px 8px rgba(0,0,0,.35)}
.pk-sheet .pk-sw button[aria-pressed="true"]{outline:4px solid var(--text);outline-offset:2px}
.pk-note{font-size:.8333rem;color:var(--dim);line-height:1.45}
.pk-warn{font-size:.8889rem;color:var(--warn)}
.pk-more{border-top:1px solid var(--line);margin-top:10px;padding-top:6px;display:flex;flex-direction:column;gap:8px}
.pk-more>div{display:flex;flex-direction:column;gap:8px}
.pk-fixed{min-height:56px;display:flex;align-items:center;font-weight:600;word-break:break-all}
.pk-list{display:flex;flex-direction:column;gap:8px}
.pk-av{display:inline-flex;align-items:center;justify-content:center;flex:none;box-sizing:border-box;width:var(--s);height:var(--s);
  border-radius:50%;background:var(--c);padding:3px;overflow:hidden;font-family:var(--grot,inherit);font-weight:700;line-height:1;font-size:calc(var(--s) * .45)}
.pk-av img{display:block;width:100%;height:100%;box-sizing:border-box;border-radius:50%;object-fit:cover;border:2px solid var(--ink-0);background:var(--ink-0)}
.pk-av.pk-init{padding:0}
.pk-pick>span:last-child{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.pk-pick small{font-size:.8333rem;font-weight:600;color:var(--dim);margin-left:8px}
.pk-new{display:flex;flex-direction:column;gap:8px;margin-top:8px}
`;
function injectCss(){
  if (document.getElementById("pk-css")) return;
  const s = document.createElement("style");
  s.id = "pk-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

// White or near-black on a colour, whichever reads better.
function inkOn(hex){
  const m = String(hex).match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#fff";
  const lin = h => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#14110f" : "#fff";
}

// How a person looks everywhere: their Google photo in a circle, inside a 3px ring of their
// colour with a 2px dark gap; with no photo, or one that won't load, a circle of their colour
// with their initial. Decorative — the name always sits beside it.
function avatar(id, size = 36){
  injectCss();
  const p = get(id), colour = colourOf(id);
  const node = document.createElement("span");
  node.className = "pk-av";
  node.setAttribute("aria-hidden", "true");
  node.style.setProperty("--s", size + "px");
  node.style.setProperty("--c", colour);
  const initial = () => {
    node.classList.add("pk-init");
    node.style.color = inkOn(colour);
    node.textContent = ([...String((p && p.name) || "?").trim()][0] || "?").toUpperCase();
  };
  const photo = p && (p.photo || p.photoURL);
  if (photo){
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";   // Google's photo links refuse some referrers
    img.decoding = "async";
    img.addEventListener("error", () => { img.remove(); initial(); });
    img.src = photo;
    node.append(img);
  } else initial();
  return node;
}

// A Cuescore profile link ends in the player's number: cuescore.com/player/Kenny+Inggs/1234567.
// Keep just that number; a bare number is fine too. "" clears it, null means it didn't parse.
function cuescoreIdFrom(text){
  const t = String(text || "").trim();
  if (!t) return "";
  const m = t.split(/[?#]/)[0].match(/(\d+)\/*$/);
  return m ? m[1] : null;
}

// The household's sheet: a new household person (household members only), or one already on
// the list. A friend's name is their own and a guest's is yours, so neither is edited here.
// Merge and Remove are holds: they reach every app.
function edit(id = null, { noun = "person", cuescore = false } = {}){
  injectCss();
  const p = id ? get(id) : null;
  if (id && (!p || p.kind !== "household")) return Promise.resolve(null);
  if (!id && !household) return Promise.resolve(null);
  let focusName = null;
  const shown = ui.sheet({ title: p ? `Edit ${p.name}` : `Add a ${noun}`, cancel: false, className: "pk-sheet", body: close => {
    const box = document.createElement("div");
    box.className = "pk-body";
    box.innerHTML = `
      <label for="pk-name">Name</label>
      <input type="text" id="pk-name" maxlength="24" autocomplete="off">
      <label>Colour</label>
      <div class="pk-sw"></div>
      <div data-k="emailbox">
        <label for="pk-email" data-k="emaillabel">Their Gmail (optional)</label>
        <input type="email" id="pk-email" inputmode="email" autocomplete="off" placeholder="name@gmail.com">
        <p class="pk-fixed" data-k="claimed" hidden></p>
        <p class="pk-note" data-k="emailwhy">If they ever sign in with it, this is them.</p>
      </div>
      <div data-k="cuebox" hidden>
        <label for="pk-cue">Cuescore profile link (optional)</label>
        <input type="url" id="pk-cue" inputmode="url" autocomplete="off" placeholder="https://cuescore.com/player/…">
      </div>
      <div data-k="cueshow" hidden>
        <label>Cuescore profile</label>
        <p class="pk-fixed"></p>
      </div>
      <p class="pk-warn" hidden></p>
      <div class="pk-row">
        <button type="button" class="quiet" data-k="cancel">Cancel</button>
        <button type="button" class="primary" data-k="save">Save</button>
      </div>
      <p class="pk-note">One list for every sidequests app — add someone once and they're in all of them.</p>
      <div class="pk-more" hidden>
        <div data-k="mergebox">
          <label for="pk-same">Added twice? Same person as…</label>
          <select id="pk-same"><option value="">Pick someone</option></select>
          <button type="button" class="quiet warnbtn" data-k="merge">Hold to merge</button>
          <p class="pk-note">Folds this entry into the one you pick. Everything logged for either, in every app, ends up under that one name.</p>
        </div>
        <div data-k="removebox">
          <button type="button" class="quiet warnbtn" data-k="remove">Hold to remove from every app</button>
          <p class="pk-note">Past games and climbs keep their name.</p>
        </div>
      </div>`;
    const q = sel => box.querySelector(sel);
    const nameIn = q("#pk-name"), emailIn = q("#pk-email"), cueIn = q("#pk-cue"), warn = q(".pk-warn");
    const saveBtn = q('[data-k="save"]');
    focusName = nameIn;
    const self = !!p && isMe(p.id);
    // Only you set your own Cuescore link, and never while adding someone. Anyone else's reads only.
    const cueEdit = cuescore && self;
    q('[data-k="cuebox"]').hidden = !cueEdit;
    q('[data-k="cueshow"]').hidden = !(cuescore && p && !self);
    cueIn.value = p && p.cuescoreId ? p.cuescoreId : "";
    if (cuescore && p && !self)
      q('[data-k="cueshow"] .pk-fixed').textContent = p.cuescoreId ? `cuescore.com/player/${p.cuescoreId}` : "Not added";
    nameIn.value = p ? p.name : "";
    emailIn.value = p ? (p.email || "") : "";
    // A claimed person's Gmail is their Google account's, for good (Unclaim went in Session 3:
    // records stored under the uid would be orphaned by it).
    const claimed = !!(p && p.uid);
    emailIn.hidden = claimed;
    q('[data-k="claimed"]').hidden = !claimed;
    if (claimed) q('[data-k="claimed"]').textContent = `Claimed by ${p.email || "a Google account"}`;
    q('[data-k="emaillabel"]').textContent = self ? "Your Gmail" : "Their Gmail (optional)";
    q('[data-k="emailwhy"]').hidden = claimed;
    // Adding asks only for a name: a Gmail no longer invites anyone (Invites does that), and
    // someone with an account joins as a friend instead.
    q('[data-k="emailbox"]').hidden = !p;
    const say = msg => { warn.hidden = !msg; warn.textContent = msg || ""; };
    const emailOk = () => !lower(emailIn.value) || EMAIL.test(lower(emailIn.value));
    const ready = () => { saveBtn.disabled = !nameIn.value.trim() || !emailOk(); };

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
    tap(q('[data-k="cancel"]'), () => close(null));

    let sameNameOk = false;
    nameIn.addEventListener("input", () => { sameNameOk = false; say(""); ready(); });
    emailIn.addEventListener("input", () => { say(""); ready(); });
    ready();
    function save(){
      const name = nameIn.value.trim().replace(/\s+/g, " ");
      const email = lower(emailIn.value);
      const selfId = p ? p.docId : null;
      if (!name){ nameIn.focus(); return; }
      if (!emailOk()){ say("That doesn't look like an email address."); emailIn.focus(); return; }
      const cuescoreId = cueEdit ? cuescoreIdFrom(cueIn.value) : undefined;
      if (cuescoreId === null){ say("That Cuescore link doesn't end in a player number."); cueIn.focus(); return; }
      const twin = email && current().find(x => x.id !== selfId && lower(x.email) === email);
      if (twin){ say(`${twin.name} already has that email.`); return; }
      const clash = current().find(x => x.id !== selfId && lower(x.name) === lower(name));
      if (clash && !sameNameOk){
        sameNameOk = true;
        say(`There's already a ${clash.name}. Tap Save again if this is someone else.`);
        return;
      }
      let out;
      const extra = cueEdit ? { cuescoreId } : {};
      if (p){ update(p.id, { name, colour, ...(claimed ? {} : { email }), ...extra }); out = p.id; }
      else out = resolve(add({ name, colour }));
      close(out);
    }
    tap(saveBtn, save);
    nameIn.addEventListener("keydown", e => { if (e.key === "Enter") p ? emailIn.focus() : save(); });
    emailIn.addEventListener("keydown", e => { if (e.key === "Enter") cueEdit ? cueIn.focus() : save(); });
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
      const mergeBtn = q('[data-k="merge"]');
      sel.addEventListener("change", () => { mergeBtn.textContent = sel.value ? `Hold to merge into ${nameOf(sel.value)}` : "Hold to merge"; });
      ui.hold(mergeBtn, () => {
        if (!sel.value){ say("Pick who they really are first."); return; }
        const into = sel.value;
        if (merge(p.id, into)) close(into);
      });
      if (isMe(p.id)) q('[data-k="removebox"]').hidden = true;   // you can't remove yourself
      else ui.hold(q('[data-k="remove"]'), () => { remove(p.id); close(null); });
    }
    return box;
  } });
  if (!p && focusName) focusName.focus();
  return shown;
}

// ---- picking a player ----
// The sheet an app opens for each player slot: recent first (the app passes the ids, newest
// first), then everyone by name, a search box once there are more than eight, then two ways to
// add someone there and then. Resolves to the id picked, or null.
const appOfPage = () => location.pathname.split("/").filter(Boolean).filter(x => !/\.html$/.test(x)).pop() || "";
function pick({ title = "Pick a player", recent = [], exclude = [], app = "", fresh = false, guest = false, friends: onlyFriends = false } = {}){
  injectCss();
  let unwatch = () => {};
  return ui.sheet({ title: fresh ? (title === "Pick a player" ? "Add a player" : title) : title, cancel: false,
    className: "pk-sheet", body: close => {
    const box = document.createElement("div");
    box.className = "pk-body";
    box.innerHTML = `
      <div class="pk-body" data-k="choose">
        <input type="search" data-k="find" placeholder="Search" autocomplete="off" aria-label="Search players" hidden>
        <div class="pk-list" data-k="list"></div>
        <p class="pk-note" data-k="none" hidden>Nobody here yet. Scan someone's phone, or add a guest.</p>
        <div class="pk-new">
          <button type="button" class="primary" data-k="scan">Scan a new player</button>
          <button type="button" class="quiet" data-k="guest">Add a guest</button>
          <p class="pk-note">A guest is someone with no phone: just a name, kept on your account.</p>
          <button type="button" class="cancel" data-k="cancel">Cancel</button>
        </div>
      </div>
      <div class="pk-body" data-k="guestform" hidden>
        <label for="pk-guest">Guest's name</label>
        <input type="text" id="pk-guest" maxlength="24" autocomplete="off">
        <p class="pk-warn" hidden></p>
        <div class="pk-row">
          <button type="button" class="quiet" data-k="back">Back</button>
          <button type="button" class="primary" data-k="addguest" disabled>Add</button>
        </div>
      </div>`;
    const q = k => box.querySelector(`[data-k="${k}"]`);
    if (fresh){ q("list").hidden = true; }
    if (onlyFriends){ q("guest").hidden = true; q("guest").nextElementSibling.hidden = true; q("none").textContent = "No friends yet. Scan their phone."; }
    const skip = new Set(exclude.filter(Boolean).map(resolve));

    let painted = "";
    function paint(){
      if (fresh) return;
      const list = players().filter(p => !skip.has(p.id) && (!onlyFriends || (p.uid && !mine(p))));
      const order = [...new Set(recent.filter(Boolean).map(resolve))];
      const rank = id => { const i = order.indexOf(id); return i < 0 ? Infinity : i; };
      list.sort((a, b) => rank(a.id) - rank(b.id) || String(a.name).localeCompare(String(b.name)));
      const find = q("find");
      find.hidden = list.length <= 8;
      const term = find.hidden ? "" : find.value.trim().toLowerCase();
      const shown = term ? list.filter(p => String(p.name).toLowerCase().includes(term)) : list;
      const sig = JSON.stringify([term, shown.map(p => [p.id, p.name, p.photo, colourOf(p.id)])]);
      if (sig === painted) return;
      painted = sig;
      const list_ = q("list");
      list_.innerHTML = "";
      q("none").hidden = list.length > 0;
      for (const p of shown){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pk-pick";
        b.append(avatar(p.id, 36));
        const n = document.createElement("span");
        n.textContent = p.name || "…";
        const tag = mine(p) ? "you" : p.kind === "guest" ? "guest" : p.kind === "account" ? "friend" : "";
        if (tag){ const t = document.createElement("small"); t.textContent = tag; n.append(t); }
        b.append(n);
        tap(b, () => close(p.id));
        list_.append(b);
      }
    }
    q("find").addEventListener("input", paint);
    unwatch = onChange(() => { if (box.isConnected) paint(); });

    tap(q("cancel"), () => close(null));
    tap(q("scan"), async () => {
      const scrim = box.closest(".scrim");
      if (scrim) scrim.hidden = true;
      const id = await scan(app || appOfPage());
      if (id) return close(id);
      if (scrim) scrim.hidden = false;
    });

    // A guest: a name, private to you. A name already in the list asks once.
    const nameIn = box.querySelector("#pk-guest"), warn = q("guestform").querySelector(".pk-warn");
    const say = msg => { warn.hidden = !msg; warn.textContent = msg || ""; };
    let sameOk = false;
    tap(q("guest"), () => { q("choose").hidden = true; q("guestform").hidden = false; nameIn.value = ""; say(""); nameIn.focus(); });
    tap(q("back"), () => { if (guest) return close(null); q("guestform").hidden = true; q("choose").hidden = false; });
    if (guest){ q("choose").hidden = true; q("guestform").hidden = false; setTimeout(() => nameIn.focus(), 0); }
    nameIn.addEventListener("input", () => { sameOk = false; say(""); q("addguest").disabled = !nameIn.value.trim(); });
    async function addGuest(){
      const name = nameIn.value.trim().replace(/\s+/g, " ");
      if (!name) return;
      const twin = players().find(x => String(x.name).trim().toLowerCase() === name.toLowerCase());
      if (twin && !sameOk){ sameOk = true; say(`There's already a ${twin.name}. Tap Add again if this is someone else.`); return; }
      q("addguest").disabled = true;
      try {
        const id = await cloud.account.addGuest(name);
        guests = { ...guests, [id]: { name, createdAt: Date.now(), claimedBy: "" } };
        notify();
        close(id);
      } catch (e){ report(e); say("Couldn't add the guest: " + ((e && e.message) || e)); q("addguest").disabled = false; }
    }
    tap(q("addguest"), addGuest);
    nameIn.addEventListener("keydown", e => { if (e.key === "Enter") addGuest(); });

    paint();
    return box;
  } }).then(id => { unwatch(); return id || null; });
}
const addPlayer = (o = {}) => pick({ ...o, fresh: true });
// Straight to the guest's name (setup's Add a guest), and straight to My QR (its Show QR).
const addGuest = (o = {}) => pick({ title: "Add a guest", ...o, guest: true });

// My QR, there and then: whoever scans it is a friend, and is the one picked. The Connect part
// loads only now, so an app that never scans never fetches it.
async function scan(app){
  let connect;
  try { ({ connect } = await import("./connect.js")); }
  catch (e){ report(e); return null; }
  const uid = await new Promise(res => {
    let got = null;
    connect.showQR({ app, onFriend: u => { got = u; }, onClose: () => res(got) });
  });
  if (!uid) return null;
  if (!friends[uid]){
    friends = { ...friends, [uid]: { name: "", photo: "", since: Date.now(), named: false } };
    await named(uid).catch(() => {});
  }
  return uid;
}

// ---- That was them: a guest turns out to be an account (KIT-PLAN.md Session 8) ----
// Your guests, not yet claimed: the ones That was them is offered for.
const myGuests = () => Object.entries(guests).filter(([, g]) => !g.claimedBy)
  .map(([id, g]) => ({ id, name: g.name, createdAt: g.createdAt || 0 })).sort((a, b) => String(a.name).localeCompare(String(b.name)));

// Pick the friend a guest was, then a hold, then: the guest points at them (claimedBy), and the
// app rewrites its records, the ones you started with that guest in them (rewrite(gid, uid)).
// Resolves the uid, or null. `uid` skips the picker (a Game QR seat already said who it was).
async function claim(gid, { app = "", rewrite = null, uid = null } = {}){
  const g = guests[gid];
  if (!g || g.claimedBy) return null;
  const who = uid || await pick({ title: `Who was ${g.name}?`, app, friends: true, exclude: [gid] });
  if (!who || who === gid || isGuest(who)) return null;
  const them = nameOf(who, "them");
  const ok = await ui.sheet({ title: `That was ${them}?`,
    text: `${g.name}'s games that you started become ${them}'s, in every app, and ${g.name} leaves your guests. This can't be undone.`,
    items: [{ label: `Give ${g.name}'s games to ${them}`, value: true, hold: true }] });
  if (!ok) return null;
  guests = { ...guests, [gid]: { ...g, claimedBy: who } };
  notify();
  try {
    await cloud.account.claimGuest(gid, who);
    if (rewrite) await rewrite(gid, who);
    ui.toast(`${g.name}'s games are ${them}'s now`);
  } catch (e){ report(e); ui.toast("Couldn't finish: " + ((e && e.message) || e)); }
  return who;
}
const isGuest = id => String(id || "").startsWith("g_");
// Your guests who have been claimed: [{ id, claimedBy }]. Each app rewrites any record of its own
// still naming one (the claim happened in another app, or on another phone).
const claimedGuests = () => Object.entries(guests).filter(([, g]) => g.claimedBy).map(([id, g]) => ({ id, claimedBy: g.claimedBy }));
// The account sheet's Your guests: each one, and That was them.
async function showGuests({ app = "", rewrite = null } = {}){
  const list = myGuests();
  const gid = await ui.sheet({ title: "Your guests",
    text: list.length ? "Someone with no phone, kept on your account. Tap one who has since joined, to give them their games."
      : "No guests yet. Add one when you pick a player.",
    items: list.map(g => ({ label: g.name, value: g.id })) });
  if (gid) return claim(gid, { app, rewrite });
  return null;
}
// One id swapped for another everywhere in a record: values and map keys, deep. What an app's
// rewrite uses for score maps keyed by player id. `names` is names, not ids, so it never matches.
function swapId(x, from, to){
  if (x === from) return to;
  if (Array.isArray(x)) return x.map(v => swapId(v, from, to));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k === from ? to : k, swapId(v, from, to)]));
  return x;
}

export const people = {
  PALETTE,
  start, stop, poke, onChange,
  active, players, get, resolve, nameOf, colourOf, nextColour, meId, isMe, avatar,
  names, uidsOf, pick, addPlayer, addGuest, scan: (app = "") => scan(app || appOfPage()),
  guests: myGuests, claimedGuests, claim, showGuests, swapId,
  add, update, remove, merge, adopt, edit,
  all: () => ({ ...all }),
  get ready(){ return confirmed; }
};
