// shared/cloud-memory.js — a stand-in for cloud.js with no Firebase, for trying an app with
// fake data. Open any app with ?mock in the URL and cloud.init() swaps this in; no app code
// changes.
//
//   /sidequests/rack-it/?mock                      signed in as a fake member, data kept
//   /sidequests/rack-it/?mock=reset                wipe the fake data first
//   /sidequests/rack-it/?mock&seed=../x.json       start from an app's JSON export (when empty)
//
// Same surface as cloud.js, including `shared` and the members calls. The data lives in this
// browser's localStorage, so it survives a reload (resume) and another tab sees every write
// (watch). Watchers fire on every write, from this tab or another. Firestore's rules aren't
// modelled: the fake user can read and write everything.
//
// A seed is an app export: `state` becomes state/main, `people` the shared people, and every
// other top-level array of { id } or map of id → object becomes that collection.

const KEY = "cloud-memory";
const USER = { uid: "mock-uid", email: "mock.player@gmail.com", displayName: "Mock Player", photoURL: null, emailVerified: true };

let appId = null;
let currentUser = null;
let store = { docs: {}, signedOut: false };   // "sidequests/<app>/state/main" → data
const userListeners = [];
const watchers = new Set();
let counter = 0;

const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
function read(){ try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch {} store.docs = store.docs || {}; }
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

function rowsOf(col, { orderBy, desc = true, limit } = {}){
  const prefix = col + "/";
  let rows = Object.entries(store.docs)
    .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .map(([p, d]) => ({ id: p.slice(prefix.length), ...clone(d) }));
  if (orderBy) {
    rows = rows.filter(r => r[orderBy] !== undefined);   // Firestore drops docs missing the field
    rows.sort((x, y) => (x[orderBy] < y[orderBy] ? -1 : x[orderBy] > y[orderBy] ? 1 : 0) * (desc ? -1 : 1));
  }
  return limit ? rows.slice(0, limit) : rows;
}

function notify(){
  // Async, like onSnapshot: after the write has returned.
  setTimeout(() => watchers.forEach(w => { try { w(); } catch (e) { console.warn("[cloud-memory]", e); } }), 0);
}
function write(full, data){
  if (!currentUser) return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
  read();
  if (data === null) delete store.docs[full]; else store.docs[full] = data;
  persist();
  notify();
  return Promise.resolve();
}
function subscribe(fn){
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
  if (!store.docs[full]) return Promise.reject(Object.assign(new Error("No document to update: " + full), { code: "not-found" }));
  const doc = clone(store.docs[full]);
  for (const [k, v] of Object.entries({ ...fields, _updatedAt: Date.now() })) {
    const keys = k.split(".");
    let o = doc;
    for (const key of keys.slice(0, -1)) { if (!isMap(o[key])) o[key] = {}; o = o[key]; }
    o[keys[keys.length - 1]] = clone(v);
  }
  return write(full, doc);
}
const newId = () => "m" + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 8);

async function seedFrom(url){
  const data = await (await fetch(url, { cache: "no-store" })).json();
  const app = data.app || appId;
  const put = (path, doc) => { store.docs[path] = { ...clone(doc), _updatedAt: Date.now() }; };
  for (const [key, value] of Object.entries(data)) {
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
    if (q.get("mock") === "reset") { localStorage.removeItem(KEY); store = { docs: {}, signedOut: false }; url.searchParams.set("mock", ""); }
    read();
    if (q.get("seed")) {
      if (!Object.keys(store.docs).length) await seedFrom(q.get("seed")).catch(e => console.warn("[cloud-memory] seed", e));
      url.searchParams.delete("seed");
    }
    history.replaceState(null, "", url.toString().replace("mock=&", "mock&").replace(/mock=$/, "mock"));
    const members = `members/${USER.email}`;
    if (!store.docs[members]) { store.docs[members] = { addedBy: null, addedAt: Date.now() }; persist(); }
    currentUser = store.signedOut ? null : { ...USER };
    console.info("[cloud-memory] fake cloud for", id, "as", USER.email);
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
    read(); store.signedOut = false; persist();
    currentUser = { ...USER };
    userListeners.forEach(cb => cb(currentUser));
    return { user: currentUser };
  },
  async signOut(){
    read(); store.signedOut = true; persist();
    currentUser = null;
    userListeners.forEach(cb => cb(null));
  },

  async load(path){ read(); return clone(store.docs[docPath(path, appBase())]) || null; },
  save(path, data){ return saveTo(docPath(path, appBase()), data); },
  patch(path, fields){ return patchTo(docPath(path, appBase()), fields); },
  delete(path){ return write(docPath(path, appBase()), null); },
  watch(path, cb){
    const full = docPath(path, appBase());
    let last;
    return subscribe(() => {
      const doc = store.docs[full] || null, sig = JSON.stringify(doc);
      if (sig === last) return;
      last = sig;
      cb(clone(doc));
    });
  },
  async list(collectionPath, opts){ read(); return rowsOf(colPath(collectionPath, appBase()), opts); },
  watchList(collectionPath, cb, opts){
    const col = colPath(collectionPath, appBase());
    return subscribe(() => cb(rowsOf(col, opts)));
  },
  newId,

  shared: {
    save(path, data){ return saveTo(docPath(path, SHARED), data); },
    newId,
    watchList(collectionPath, cb){
      const col = colPath(collectionPath, SHARED);
      return subscribe(() => cb(rowsOf(col), { fromCache: false }));
    }
  },

  async listMembers(){ read(); return rowsOf("members").map(r => r.id).sort(); },
  addMember(email){
    const e = String(email).trim().toLowerCase();
    return write("members/" + e, { addedBy: currentUser ? currentUser.email : null, addedAt: Date.now() });
  },
  removeMember(email){ return write("members/" + String(email).trim().toLowerCase(), null); }
};
