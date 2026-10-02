// shared/cloud-memory.js — a stand-in for cloud.js with no Firebase, for trying an app with
// fake data. Open any app with ?mock in the URL and cloud.init() swaps this in; no app code
// changes.
//
//   /sidequests/rack-it/?mock                      signed in as a fake member, data kept
//   /sidequests/rack-it/?mock=reset                wipe the fake data first
//   /sidequests/rack-it/?mock&seed=../x.json       start from an app's JSON export (when empty)
//   /sidequests/rack-it/?mock&role=member          the fake user as a plain member (default: owner)
//   /sidequests/rack-it/?mock&as=ann               this tab is another fake user, not on /members
//   /sidequests/rack-it/?mock&as=ann&role=member   …who is a household member after all
//   /sidequests/rack-it/?mock&as=                  this tab goes back to the default owner
//
// Same surface as cloud.js, including `shared`, the members calls and `account` (guests too). The data lives in this
// browser's localStorage, so it survives a reload (resume) and another tab sees every write
// (watch). Watchers fire on every write, from this tab or another.
//
// Users. Without &as= the fake user is mock.player@gmail.com, the owner. &as=<name> makes this
// tab uid mock-<name>, <name>@example.com, held in sessionStorage so a reload keeps it while
// other tabs stay who they are. Each user signs out on their own; the data is shared.
//
// Permissions model the tiers, not the field rules (ACCESS below): a signed-in user on
// /members reaches what the household reaches, anyone else gets permission-denied, as in
// production. Owner-only and field-level rules aren't modelled, except on Rack It's matches
// (below); elsewhere role only changes what an app shows, so check those against
// shared/firestore.rules (and shared/rules-check.mjs).
// The account paths are modelled more closely, since outsiders live there: your own
// private/friends/guests only, a pair only by one of its two, and a friendship only with
// the other side's live code. So is Rack It's outsider block (Session 6): a match read,
// started and scored by the players in its `uids`, a list only with the uids filter, a rating
// got by id and moved only in the batch that confirms, as in shared/firestore.rules.
//
// Two tabs test a whole QR scan: rack-it/?mock on My QR, then
// rack-it/?mock&as=waiter&i=<code> in another tab. Times are milliseconds here.
//
// A seed is an app export: `state` becomes state/main, `people` the shared people, and every
// other top-level array of { id } or map of id → object becomes that collection.

const KEY = "cloud-memory";
const AS_KEY = "cloud-memory.as";
const OWNER = { uid: "mock-uid", email: "mock.player@gmail.com", displayName: "Mock Player", photoURL: null, emailVerified: true };
let USER = OWNER;
function userCalled(name){
  if (!name) return OWNER;
  const n = String(name).trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "someone";
  return { uid: "mock-" + n, email: n + "@example.com", displayName: n[0].toUpperCase() + n.slice(1), photoURL: null, emailVerified: true };
}

// Who reaches what: the tiers in shared/firestore.rules, one row per path, first match wins.
// "household" = signed in with an email on /members; "account" = anyone signed in. A path
// no row matches is refused, like the rules' catch-all. A rules change that opens a path to
// a wider tier adds its row here, above the row it narrows.
// A row's read or write is a tier, "anyone" (signed out too), or a check (match, user, data)
// for the account paths. `data` is the document being written, or null for a delete.
const ACCESS = [
  { path: /^members(\/|$)/,    read: "household", write: "household" },
  // Rack It for outsiders (Session 6). The household's own field rules aren't modelled here.
  { path: /^sidequests\/rack-it\/state\/main$/, read: "account", write: "household" },
  { path: /^sidequests\/rack-it\/matches$/, read: (m, u, d, was, ctx) => isHousehold(u) || uidsFilter(ctx, u) },
  { path: /^sidequests\/rack-it\/matches\/([^/]+)$/,
    read: (m, u, d, was) => isHousehold(u) || inUids(was, u),
    write: (m, u, d, was) => !was ? !!d && (isHousehold(u) || outsiderStarts(u, d))
      : (!!d && inUids(was, u) && playerScores(u, d, was)) || householdScores(u, d, was) },
  { path: /^sidequests\/rack-it\/ratings\/([^/]+)$/, read: "account",
    write: (m, u, d, was, ctx) => isHousehold(u) || (!!d && (confirming(m[1], d, ctx.after) || (!was && !!store.docs[`profiles/${u.uid}/guests/${m[1]}`]))) },
  { path: /^sidequests(\/|$)/, read: "household", write: "household" },
  // Accounts (Session 1). Yours alone: private, friends, guests, as documents or as a list.
  { path: /^profiles\/([^/]+)\/(private|friends|guests)(\/[^/]+)?$/, read: (m, u) => m[1] === u.uid, write: (m, u) => m[1] === u.uid },
  // A profile is read one at a time (the bare "profiles" list matches no row, so it's refused).
  // Its name and photo are capped, as in the rules: the photo's limit is what sizes the JPEG.
  { path: /^profiles\/([^/]+)$/, read: "account",
    write: (m, u, d) => m[1] === u.uid && (!d || (String(d.name || "").length <= 60 && String(d.photo || "").length <= 60000)) },
  { path: /^invites\/([^/]+)$/, read: "anyone",
    write: (m, u, d, was) => d ? (!was && d.uid === u.uid && d.expires <= Date.now() + 25 * HOUR) : !!was && was.uid === u.uid },
  { path: /^friendships\/([^/]+)$/,
    read: (m, u, d, was) => was ? was.uids.includes(u.uid) : m[1].split("_").includes(u.uid),
    write: (m, u, d, was) => d ? !was && pairOk(m[1], u, d) : !!was && was.uids.includes(u.uid) },
];
// Rack It's outsider rules, as in shared/firestore.rules (Session 6). A match with no `rated`
// field is rated.
const isHousehold = u => tierOf(u) === "household";
const inUids = (doc, u) => !!doc && Array.isArray(doc.uids) && doc.uids.includes(u.uid);
const rated = doc => (doc.rated === undefined ? true : doc.rated) === true;
const uidsFilter = (ctx, u) => !!ctx.where && ctx.where[0] === "uids" && ctx.where[1] === "array-contains" && ctx.where[2] === u.uid;
function same(a, b){
  if (isMap(a) && isMap(b)) return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => same(a[k], b[k]));
  return JSON.stringify(a) === JSON.stringify(b);
}
const changed = (was, now) => [...new Set([...Object.keys(was), ...Object.keys(now)])].filter(k => !same(was[k], now[k]));
function outsiderStarts(u, d){
  const uids = Array.isArray(d.uids) ? d.uids : [];
  return d.by === u.uid && uids.includes(u.uid) && d.status === "live"
    && !["endedBy", "confirmedBy", "ratedAt", "declinedBy", "withdrawnBy"].some(k => k in d)
    && (uids.length === 1 || (uids.length === 2 && !!store.docs["friendships/" + [...uids].sort().join("_")]));
}
const CONFIRM_KEYS = ["status", "rated", "zargoBefore", "zargoAfter", "ratedAt", "confirmedBy", "declinedBy", "withdrawnBy", "_updatedAt"];
function playerScores(u, now, was){
  const keys = changed(was, now);
  if (["uids", "by", "playerA", "playerB", "names"].some(k => keys.includes(k))) return false;
  if (rated(now) && !rated(was)) return false;
  if (was.status === "live"){
    const by = now.endedBy ?? null;
    return ["live", "pending", "done", "discarded"].includes(now.status)
      && (now.status === "pending" ? by === u.uid : by === (was.endedBy ?? null))
      && !(now.status === "done" && rated(now));
  }
  return was.status === "pending" && now.status === "done" && keys.every(k => CONFIRM_KEYS.includes(k))
    && (!rated(now) || u.uid !== (was.endedBy ?? u.uid));
}
// The household's own match rule: the owner rewrites or deletes any match; a member changes
// one that isn't finished, and never turns a friendly into a rated match.
function householdScores(u, d, was){
  if (!isHousehold(u)) return false;
  if ((store.docs["members/" + String(u.email || "").toLowerCase()] || {}).role === "owner") return true;
  return !!d && was.status !== "done" && (!rated(d) || rated(was));
}
// A rating moves only in the batch that confirms a rated match: pending before, done and
// rated after (`after` is the store as the whole batch leaves it), the rating a player in it.
function confirming(pid, d, after){
  const path = "sidequests/rack-it/matches/" + d.match, was = store.docs[path], now = after && after[path];
  return !!d.match && !!was && !!now && was.status === "pending" && now.status === "done" && rated(now)
    && Array.isArray(now.uids) && now.uids.includes(pid);
}

// The friendship create rule: one of the two, carrying the other's live code.
function pairOk(pair, u, d){
  const inv = store.docs["invites/" + d.via];
  return Array.isArray(d.uids) && d.uids.length === 2 && d.uids[0] < d.uids[1]
    && pair === d.uids.join("_") && d.uids.includes(u.uid)
    && !!inv && d.uids.includes(inv.uid) && inv.uid !== u.uid && inv.expires > Date.now();
}

let appId = null;
let currentUser = null;
let store = { docs: {}, signedOut: {} };   // docs: "sidequests/<app>/state/main" → data; signedOut: uid → true
const userListeners = [];
const watchers = new Set();
let counter = 0;

const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
function read(){
  try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch {}
  store.docs = store.docs || {};
  // Before &as=, signed-out was one flag, for the one fake user.
  if (!isMap(store.signedOut)) store.signedOut = store.signedOut === true ? { [OWNER.uid]: true } : {};
}
function persist(){ try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { console.warn("[cloud-memory]", e); } }

// Firestore refuses undefined anywhere in a document; so does this, so a bug shows here first.
function noUndefined(x, path){
  if (x === undefined) throw new Error(`[cloud-memory] undefined at ${path} (Firestore refuses it)`);
  if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) noUndefined(v, path + "." + k);
}
const isMap = x => x && typeof x === "object" && !Array.isArray(x);
function deepMerge(into, from){
  const out = isMap(into) ? { ...into } : {};
  for (const [k, v] of Object.entries(from)) out[k] = isMap(v) && isMap(out[k]) ? deepMerge(out[k], v) : clone(v);
  return out;
}

function docPath(path, base){
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 0) throw new Error("Document paths need an even number of segments: " + path);
  return [...base, ...parts].join("/");
}
function colPath(path, base){
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 1) throw new Error("Collection paths need an odd number of segments: " + path);
  return [...base, ...parts].join("/");
}
const appBase = () => { if (!appId) throw new Error("cloud.init(appId) must be called first"); return ["sidequests", appId]; };
const SHARED = ["sidequests", "_shared"];

// where: [field, op, value], op "==" or "array-contains". Like cloud.js, never with orderBy.
// A test that sets window.__mockQueries = [] before the app loads gets every list and
// watchList pushed onto it as { col, opts }.
function logQuery(col, opts){ try { if (globalThis.__mockQueries) globalThis.__mockQueries.push({ col, opts: clone(opts || {}) }); } catch {} }
function rowsOf(col, { where, orderBy, desc = true, limit } = {}){
  if (where && orderBy) throw new Error("cloud.list: where with orderBy needs a composite index; sort on the phone");
  const prefix = col + "/";
  let rows = Object.entries(store.docs)
    .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .map(([p, d]) => ({ id: p.slice(prefix.length), ...clone(d) }));
  if (where) {
    const [f, op, v] = where;
    if (op !== "==" && op !== "array-contains") throw new Error("cloud-memory: where supports == and array-contains, not " + op);
    rows = rows.filter(r => op === "==" ? same(r[f], v) : Array.isArray(r[f]) && r[f].some(x => same(x, v)));
  }
  if (orderBy) {
    rows = rows.filter(r => r[orderBy] !== undefined);   // Firestore drops docs missing the field
    rows.sort((x, y) => (x[orderBy] < y[orderBy] ? -1 : x[orderBy] > y[orderBy] ? 1 : 0) * (desc ? -1 : 1));
  }
  return limit ? rows.slice(0, limit) : rows;
}

// The tier check. Rejects like Firestore: an Error with code "permission-denied".
const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
function tierOf(user){
  if (!user) return null;
  return store.docs["members/" + String(user.email || "").toLowerCase()] ? "household" : "account";
}
// ctx: { where } for a list, { after } for a write: the store as the write (or the whole batch)
// leaves it, which is what the rules' getAfter() reads.
function allowed(op, full, data = null, ctx = {}){
  const row = ACCESS.find(r => r.path.test(full));
  const need = row && row[op];
  if (need === "anyone") return true;
  const tier = tierOf(currentUser);
  if (!tier || !need) return false;
  if (typeof need === "function") return !!need(full.match(row.path), currentUser, data, store.docs[full] || null, ctx);
  return need === "account" || (need === "household" && tier === "household");
}
function check(op, full, ctx){ read(); if (!allowed(op, full, null, ctx)) throw denied(); }

function notify(){
  // Async, like onSnapshot: after the write has returned.
  setTimeout(() => watchers.forEach(w => { try { w(); } catch (e) { console.warn("[cloud-memory]", e); } }), 0);
}
function write(full, data){
  read();
  if (!allowed("write", full, data, { after: { ...store.docs, [full]: data } })) return Promise.reject(denied());
  if (data === null) delete store.docs[full]; else store.docs[full] = data;
  persist();
  notify();
  return Promise.resolve();
}
// A listener the rules refuse never fires: Firestore reports it once and ends it, to the
// onError the app passed, or (like cloud.js) as a warning.
function subscribe(fn, full, onError, ctx){
  read();
  if (full && !allowed("read", full, null, ctx)) {
    setTimeout(() => {
      const e = denied();
      if (onError) onError(e);
      else console.warn("[cloud] listener stopped:", full, e.code, e);
    }, 0);
    return () => {};
  }
  const w = () => fn();
  watchers.add(w);
  setTimeout(w, 0);
  return () => watchers.delete(w);
}

// Another tab wrote: re-read and tell this tab's watchers.
if (typeof window !== "undefined") window.addEventListener("storage", e => {
  if (e.key !== KEY) return;
  read();
  watchers.forEach(w => { try { w(); } catch {} });
});

function saveTo(full, data){
  noUndefined(data, full);
  read();
  return write(full, deepMerge(store.docs[full], { ...data, _updatedAt: Date.now() }));
}
function patchTo(full, fields){
  noUndefined(fields, full);
  read();
  // The rules see the patched document (write() checks it); a missing one is refused to anyone
  // who couldn't read it, as Firestore does, and is not-found to anyone who could.
  if (!store.docs[full]) return Promise.reject(allowed("read", full) ? Object.assign(new Error("No document to update: " + full), { code: "not-found" }) : denied());
  const doc = clone(store.docs[full]);
  for (const [k, v] of Object.entries({ ...fields, _updatedAt: Date.now() })) {
    const keys = k.split(".");
    let o = doc;
    for (const key of keys.slice(0, -1)) { if (!isMap(o[key])) o[key] = {}; o = o[key]; }
    o[keys[keys.length - 1]] = clone(v);
  }
  return write(full, doc);
}
// ---- accounts (cloud.js has the real ones) ----
const DAY = 24 * 3600 * 1000, HOUR = 3600 * 1000;
const CODE = /^[A-Za-z0-9]{8,40}$/;
const needUser = () => {
  if (!currentUser) throw Object.assign(new Error("Sign in first"), { code: "unauthenticated" });
  return currentUser;
};
const googleName = u => String(u.displayName || (u.email || "").split("@")[0] || "Someone").trim().slice(0, 60);
const asProfile = (uid, p) => p ? { uid, name: p.name || "", photo: p.photo || p.googlePhoto || "", googlePhoto: p.googlePhoto || "" } : null;
function getDoc(full){ read(); if (!allowed("read", full)) return Promise.reject(denied()); return Promise.resolve(clone(store.docs[full]) || null); }
function newCode(){
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), x => abc[x % 62]).join("");
}
function ensureProfile(u){
  read();
  const full = "profiles/" + u.uid;
  if (!store.docs[full]) { store.docs[full] = { name: googleName(u), googlePhoto: u.photoURL || "", createdAt: Date.now() }; persist(); notify(); }
}
// Watch whatever fn reads, refused like Firestore when `full` is refused.
function watchRead(full, fn, cb, onError){
  let last;
  return subscribe(() => {
    const v = fn(), sig = JSON.stringify(v);
    if (sig === last) return;
    last = sig;
    cb(v);
  }, full, onError);
}

const account = {
  async me(){
    if (!currentUser) return null;
    return asProfile(currentUser.uid, await getDoc("profiles/" + currentUser.uid));
  },
  watchMe(cb, onError){
    const u = needUser(), full = "profiles/" + u.uid;
    return watchRead(full, () => asProfile(u.uid, clone(store.docs[full])), cb, onError);
  },
  async saveMe({ name, photo } = {}){
    const u = needUser(), f = {};
    if (name !== undefined) f.name = String(name).trim().slice(0, 60);
    if (photo !== undefined) f.photo = photo || "";
    return saveTo("profiles/" + u.uid, f);
  },
  async profile(uid){
    if (!uid) return null;
    try { return asProfile(uid, await getDoc("profiles/" + uid)); }
    catch (e) { console.warn("[cloud.account] profile", uid, e); return null; }
  },
  async invite(){
    const u = needUser();
    const privPath = `profiles/${u.uid}/private/main`;
    const priv = (await getDoc(privPath)) || {};
    if (priv.invite && priv.expires > Date.now() + HOUR) return priv.invite;
    const me = await this.me();
    const code = newCode(), expires = Date.now() + DAY;
    await write("invites/" + code, { uid: u.uid, name: (me && me.name) || googleName(u), expires });
    await write(privPath, { invite: code, expires });
    if (priv.invite) write("invites/" + priv.invite, null).catch(() => {});
    return code;
  },
  async lookupInvite(code){
    if (!CODE.test(String(code || ""))) return null;
    const d = await getDoc("invites/" + code);
    return d && d.expires > Date.now() ? { uid: d.uid, name: d.name } : null;
  },
  async accept(code, app){
    const u = needUser();
    const inv = await this.lookupInvite(code);
    if (!inv) return null;
    if (inv.uid === u.uid) return { self: true };
    const uids = [u.uid, inv.uid].sort(), pair = "friendships/" + uids.join("_");
    if (await getDoc(pair)) return { ...inv, already: true };
    await write(pair, { uids, since: Date.now(), via: code, app: String(app || "") });
    await saveTo(`profiles/${u.uid}/friends/${inv.uid}`, { metAt: Date.now() }).catch(e => console.warn("[cloud.account] card", e));
    return inv;
  },
  watchFriends(cb, onError){
    const u = needUser(), cards = `profiles/${u.uid}/friends`;
    return watchRead(cards, () => rowsOf("friendships")
      .filter(p => Array.isArray(p.uids) && p.uids.includes(u.uid))   // the array-contains query
      .map(p => {
        const uid = p.uids.find(x => x !== u.uid) || "", c = store.docs[`${cards}/${uid}`] || {};
        return { uid, since: p.since || null, app: p.app || "", note: c.note || "", tags: c.tags || [],
          metAt: c.metAt || p.since || null, metPlace: c.metPlace || "" };
      })
      .sort((a, b) => (b.since || 0) - (a.since || 0)), cb, onError);
  },
  saveFriend(uid, fields){ const u = needUser(); return saveTo(`profiles/${u.uid}/friends/${uid}`, { ...fields }); },
  async unfriend(uid){
    const u = needUser();
    await write("friendships/" + [u.uid, uid].sort().join("_"), null);
    await write(`profiles/${u.uid}/friends/${uid}`, null).catch(() => {});
  },
  watchGuests(cb, onError){
    const u = needUser(), col = `profiles/${u.uid}/guests`;
    return watchRead(col, () => rowsOf(col).map(({ _updatedAt, ...g }) => g), cb, onError);
  },
  async addGuest(name){
    const u = needUser(), id = "g_" + newId();
    saveTo(`profiles/${u.uid}/guests/${id}`, { name: String(name).trim().slice(0, 60), createdAt: Date.now() })
      .catch(e => console.warn("[cloud.account] guest", e));
    return id;
  },
  async exportMe(){
    const u = needUser(), base = "profiles/" + u.uid;
    const rows = sub => { check("read", `${base}/${sub}`); return Object.fromEntries(rowsOf(`${base}/${sub}`).map(({ id, _updatedAt, ...d }) => [id, d])); };
    const me = (await getDoc(base)) || {};
    return { uid: u.uid, profile: { name: me.name || "", photo: me.photo || "" }, friends: rows("friends"), guests: rows("guests") };
  },
  async importMe(data){
    const u = needUser();
    if (!data || data.uid !== u.uid) throw Object.assign(new Error("That export belongs to another account"), { code: "wrong-account" });
    const p = data.profile || {};
    if (p.name) await this.saveMe({ name: p.name, photo: p.photo || "" });
    let n = 0;
    for (const [sub, map] of [["friends", data.friends], ["guests", data.guests]])
      for (const [id, doc] of Object.entries(map || {})) { await saveTo(`profiles/${u.uid}/${sub}/${id}`, doc); n++; }
    return n;
  },
  async deleteMe(){
    const u = needUser(), base = "profiles/" + u.uid;
    const gone = full => write(full, null).catch(e => console.warn("[cloud.account] delete", full, e));
    read();
    for (const p of rowsOf("friendships").filter(p => Array.isArray(p.uids) && p.uids.includes(u.uid))) await gone("friendships/" + p.id);
    for (const sub of ["friends", "guests"]) for (const r of rowsOf(`${base}/${sub}`)) await gone(`${base}/${sub}/${r.id}`);
    const priv = (await getDoc(base + "/private/main")) || {};
    if (priv.invite) await gone("invites/" + priv.invite);
    await gone(base + "/private/main");
    await write(base, null);
    await memory.signOut();
  }
};

const newId = () => "m" + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 8);

async function seedFrom(url){
  const data = await (await fetch(url, { cache: "no-store" })).json();
  const app = data.app || appId;
  const put = (path, doc) => { store.docs[path] = { ...clone(doc), _updatedAt: Date.now() }; };
  for (const [key, value] of Object.entries(data)) {
    if (key === "account") continue;   // the exporter's account (cloud.account.exportMe), not app data
    if (key === "state" && isMap(value)) put(`sidequests/${app}/state/main`, value);
    else if (key === "people" && isMap(value)) for (const [id, p] of Object.entries(value)) put(`sidequests/_shared/people/${id}`, p);
    else if (Array.isArray(value) && value.every(r => isMap(r) && r.id))
      for (const { id, ...doc } of value) put(`sidequests/${app}/${key}/${id}`, doc);
    else if (isMap(value) && Object.keys(value).length && Object.values(value).every(isMap))
      for (const [id, doc] of Object.entries(value)) put(`sidequests/${app}/${key}/${id}`, doc);
  }
  persist();
}

export const memory = {
  mock: true,
  configured(){ return true; },

  async init(id){
    appId = id;
    const q = new URLSearchParams(location.search);
    const url = new URL(location.href);
    if (q.get("mock") === "reset") { localStorage.removeItem(KEY); store = { docs: {}, signedOut: {} }; url.searchParams.set("mock", ""); }
    read();
    if (q.get("seed")) {
      if (!Object.keys(store.docs).length) await seedFrom(q.get("seed")).catch(e => console.warn("[cloud-memory] seed", e));
      url.searchParams.delete("seed");
    }
    const role = q.get("role");
    url.searchParams.delete("role");
    try {
      if (q.has("as")) q.get("as") ? sessionStorage.setItem(AS_KEY, q.get("as")) : sessionStorage.removeItem(AS_KEY);
      USER = userCalled(sessionStorage.getItem(AS_KEY));
    } catch { USER = userCalled(q.get("as")); }
    url.searchParams.delete("as");
    history.replaceState(null, "", url.toString().replace("mock=&", "mock&").replace(/mock=$/, "mock"));
    // The default user is always on /members (the owner unless &role= says otherwise). An
    // &as= user is on it only once &role= puts them there.
    const members = `members/${USER.email}`;
    if (USER === OWNER && !store.docs[members]) { store.docs[members] = { addedBy: null, addedAt: Date.now(), role: "owner" }; persist(); }
    if (role === "owner" || role === "member") { store.docs[members] = { addedBy: null, addedAt: Date.now(), ...store.docs[members], role }; persist(); }
    currentUser = store.signedOut[USER.uid] ? null : { ...USER };
    if (currentUser) ensureProfile(currentUser);
    console.info("[cloud-memory] fake cloud for", id, "as", USER.email, tierOf(USER) === "household" ? "(household)" : "(not on /members)");
    await new Promise(r => setTimeout(r, 0));
    userListeners.forEach(cb => cb(currentUser));
    return currentUser;
  },

  get user(){ return currentUser; },
  onUser(cb){
    userListeners.push(cb);
    if (currentUser !== null) cb(currentUser);
  },
  async signIn(){
    read(); delete store.signedOut[USER.uid]; persist();
    currentUser = { ...USER };
    ensureProfile(currentUser);
    userListeners.forEach(cb => cb(currentUser));
    return { user: currentUser };
  },
  async signOut(){
    read(); store.signedOut[USER.uid] = true; persist();
    currentUser = null;
    userListeners.forEach(cb => cb(null));
  },

  async load(path){ const full = docPath(path, appBase()); check("read", full); return clone(store.docs[full]) || null; },
  save(path, data){ return saveTo(docPath(path, appBase()), data); },
  patch(path, fields){ return patchTo(docPath(path, appBase()), fields); },
  deleteFields(path, fields){
    const full = docPath(path, appBase());
    read();
    if (!allowed("write", full)) return Promise.reject(denied());
    if (!store.docs[full]) return Promise.reject(Object.assign(new Error("No document to update: " + full), { code: "not-found" }));
    const doc = clone(store.docs[full]);
    for (const k of fields){
      const keys = k.split(".");
      let o = doc;
      for (const key of keys.slice(0, -1)) o = isMap(o) ? o[key] : undefined;
      if (isMap(o)) delete o[keys[keys.length - 1]];
    }
    doc._updatedAt = Date.now();
    return write(full, doc);
  },
  delete(path){ return write(docPath(path, appBase()), null); },
  // All or nothing, like a Firestore batch: the patches' documents are checked first, then every
  // write against the rules, then all land in one write, so another tab sees one change.
  batch(ops){
    read();
    const next = clone(store.docs), at = Date.now(), touched = [];
    for (const op of ops){
      const path = op.save || op.patch || op.delete;
      if (!path) return Promise.reject(new Error("cloud.batch: an op needs save, patch or delete"));
      const full = docPath(path, appBase());
      touched.push(full);
      if (op.delete){
        delete next[full];
        continue;
      }
      noUndefined(op.data, full);
      if (op.patch && !next[full]) return Promise.reject(Object.assign(new Error("No document to update: " + full), { code: "not-found" }));
      let doc;
      if (op.save) doc = deepMerge(next[full], { ...op.data, _updatedAt: at });
      else {
        doc = clone(next[full]);
        for (const [k, v] of Object.entries({ ...op.data, _updatedAt: at })){
          const keys = k.split(".");
          let o = doc;
          for (const key of keys.slice(0, -1)){ if (!isMap(o[key])) o[key] = {}; o = o[key]; }
          o[keys[keys.length - 1]] = clone(v);
        }
      }
      next[full] = doc;
    }
    // Each write against the store as it was and as the whole batch leaves it (getAfter).
    for (const full of touched) if (!allowed("write", full, next[full] || null, { after: next })) return Promise.reject(denied());
    store.docs = next;
    persist();
    notify();
    return Promise.resolve();
  },
  watch(path, cb, onError){
    const full = docPath(path, appBase());
    let last;
    return subscribe(() => {
      const doc = store.docs[full] || null, sig = JSON.stringify(doc);
      if (sig === last) return;
      last = sig;
      cb(clone(doc));
    }, full, onError);
  },
  async list(collectionPath, opts = {}){ const col = colPath(collectionPath, appBase()); logQuery(col, opts); check("read", col, { where: opts.where }); return rowsOf(col, opts); },
  watchList(collectionPath, cb, opts, onError){
    const col = colPath(collectionPath, appBase());
    opts = opts || {};
    logQuery(col, opts);
    rowsOf(col, opts);   // a bad query throws here, as Firestore's does
    return subscribe(() => cb(rowsOf(col, opts)), col, onError, { where: opts.where });
  },
  newId,

  shared: {
    save(path, data){ return saveTo(docPath(path, SHARED), data); },
    newId,
    watchList(collectionPath, cb, onError){
      const col = colPath(collectionPath, SHARED);
      return subscribe(() => cb(rowsOf(col), { fromCache: false }), col, e => { console.warn("[cloud.shared]", e); if (onError) onError(e); });
    }
  },

  async listMembers(){ check("read", "members"); return rowsOf("members").map(r => r.id).sort(); },
  // Like cloud.js: null when signed out, and null when the read itself is refused (the rules
  // let only the household read /members, so that's anyone not on it).
  async role(){
    read();
    if (!currentUser) return null;
    if (!allowed("read", "members/" + currentUser.email)) return null;
    const m = store.docs["members/" + currentUser.email];
    return m ? (m.role === "owner" ? "owner" : "member") : null;
  },
  addMember(email){
    const e = String(email).trim().toLowerCase();
    read();
    return write("members/" + e, { ...store.docs["members/" + e], addedBy: currentUser ? currentUser.email : null, addedAt: Date.now() });
  },
  removeMember(email){ return write("members/" + String(email).trim().toLowerCase(), null); },

  account
};
