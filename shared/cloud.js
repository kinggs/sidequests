// shared/cloud.js — the only file that talks to Firebase.
//
// Every app calls:
//   import { cloud } from "../shared/cloud.js";
//   await cloud.init("fair-nine");          // appId = the app's folder name
//   cloud.onUser(user => ...);            // null when signed out
//   cloud.signIn(); cloud.signOut();
//   await cloud.save("state/main", {...}); // path is relative to sidequests/<appId>/
//   await cloud.load("state/main");
//   cloud.watch("sessions/abc", doc => ...);
//   await cloud.patch("sessions/abc", { "racks.3": {...} }); // dotted field paths
//   await cloud.list("sessions");
//   cloud.watchList("sessions", rows => ..., { orderBy: "at" });
//
// All data for an app lives under /sidequests/<appId>/ in Firestore. Apps never read or
// write outside their own namespace, so one Firebase project serves the whole repo.

import { firebaseConfig, FIREBASE_VERSION } from "./firebase-config.js";

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

let app, auth, db, fs, authMod;
let appId = null;
const userListeners = [];
let currentUser = null;

async function loadSdk() {
  const [appMod, a, f] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`)
  ]);
  authMod = a;
  fs = f;
  app = appMod.initializeApp(firebaseConfig);
  auth = a.getAuth(app);
  // Offline-first: reads and writes work without signal and sync when it returns.
  db = f.initializeFirestore(app, {
    localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() })
  });
}

function ref(path) {
  if (!appId) throw new Error("cloud.init(appId) must be called first");
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 0) throw new Error("Document paths need an even number of segments: " + path);
  return fs.doc(db, "sidequests", appId, ...parts);
}

function colRef(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 1) throw new Error("Collection paths need an odd number of segments: " + path);
  return fs.collection(db, "sidequests", appId, ...parts);
}

export const cloud = {
  configured() {
    return firebaseConfig.projectId && firebaseConfig.projectId !== "PASTE_ME";
  },

  async init(id) {
    appId = id;
    if (!this.configured()) {
      console.warn("[cloud] firebase-config.js not filled in; running without cloud");
      return null;
    }
    await loadSdk();
    return new Promise(resolve => {
      authMod.onAuthStateChanged(auth, u => {
        currentUser = u;
        userListeners.forEach(cb => cb(u));
        resolve(u);
      });
    });
  },

  get user() { return currentUser; },

  onUser(cb) {
    userListeners.push(cb);
    if (currentUser !== null) cb(currentUser);
  },

  async signIn() {
    const provider = new authMod.GoogleAuthProvider();
    try {
      return await authMod.signInWithPopup(auth, provider);
    } catch (e) {
      // Popups can be blocked in home-screen (standalone) mode on iOS; fall back to redirect.
      if (e && /popup/i.test(e.code || "")) return authMod.signInWithRedirect(auth, provider);
      throw e;
    }
  },

  signOut() { return authMod.signOut(auth); },

  async load(path) {
    const snap = await fs.getDoc(ref(path));
    return snap.exists() ? snap.data() : null;
  },

  // Merge-write. Safe to call often; only the fields you pass are touched.
  save(path, data) {
    return fs.setDoc(ref(path), { ...data, _updatedAt: fs.serverTimestamp() }, { merge: true });
  },

  // Update specific fields, including nested ones via dotted paths ("racks.3").
  // Use this for concurrent edits from two phones so they don't clobber each other.
  patch(path, fields) {
    return fs.updateDoc(ref(path), { ...fields, _updatedAt: fs.serverTimestamp() });
  },

  delete(path) { return fs.deleteDoc(ref(path)); },

  // Live updates. Returns an unsubscribe function.
  watch(path, cb) {
    return fs.onSnapshot(ref(path), snap => cb(snap.exists() ? snap.data() : null));
  },

  async list(collectionPath, { orderBy, desc = true, limit } = {}) {
    let q = colRef(collectionPath);
    const clauses = [];
    if (orderBy) clauses.push(fs.orderBy(orderBy, desc ? "desc" : "asc"));
    if (limit) clauses.push(fs.limit(limit));
    if (clauses.length) q = fs.query(q, ...clauses);
    const snap = await fs.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  // Live updates for a whole collection. Same options as list(). Returns an unsubscribe function.
  watchList(collectionPath, cb, { orderBy, desc = true, limit } = {}) {
    let q = colRef(collectionPath);
    const clauses = [];
    if (orderBy) clauses.push(fs.orderBy(orderBy, desc ? "desc" : "asc"));
    if (limit) clauses.push(fs.limit(limit));
    if (clauses.length) q = fs.query(q, ...clauses);
    return fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  },

  newId() {
    return fs.doc(colRef("_ids")).id;
  },

  // ---- family allowlist ----
  // Lives in /members (one doc per email, doc id = the address, lowercased).
  // Firestore rules check membership there, so changes take effect instantly.
  async listMembers() {
    const snap = await fs.getDocs(fs.collection(db, "members"));
    return snap.docs.map(d => d.id).sort();
  },
  addMember(email) {
    const e = String(email).trim().toLowerCase();
    return fs.setDoc(fs.doc(db, "members", e), {
      addedBy: currentUser ? currentUser.email : null,
      addedAt: fs.serverTimestamp()
    });
  },
  removeMember(email) {
    return fs.deleteDoc(fs.doc(db, "members", String(email).trim().toLowerCase()));
  }
};
