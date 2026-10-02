// shared/cloud.js — the only file that talks to Firebase.
//
// Every app calls:
//   import { cloud } from "../shared/cloud.js";
//   await cloud.init("rack-it");            // appId = the app's folder name
//   cloud.onUser(user => ...);            // null when signed out
//   cloud.signIn(); cloud.signOut();
//   await cloud.save("state/main", {...}); // path is relative to sidequests/<appId>/
//   await cloud.load("state/main");
//   cloud.watch("sessions/abc", doc => ..., onError);  // onError optional
//   await cloud.patch("sessions/abc", { "racks.3": {...} }); // dotted field paths
//   await cloud.list("sessions");
//   cloud.watchList("sessions", rows => ..., { orderBy: "at" }, onError);
//   A refused or broken listener calls onError(e) once and stops; without one it warns.
//
// Add ?mock to an app's URL to run it against shared/cloud-memory.js instead: no Firebase,
// a fake signed-in member, data kept in this browser. That's how sessions test an app.
//   cloud.role()                          // "owner" | "member" | null
//
// Accounts (anyone signed in, keyed by uid; KIT.md). Outside /sidequests/ on purpose, so a
// household member can't read someone's friends. shared/connect.js is built on these.
//   await cloud.account.me()              // your profile { uid, name, photo, googlePhoto }, or null
//   cloud.account.watchMe(cb)             // the same, live
//   await cloud.account.saveMe({ name, photo })
//   await cloud.account.profile(uid)      // anyone's { name, photo }, or null; cached
//   await cloud.account.invite()          // your live code, renewed when under an hour is left
//   await cloud.account.lookupInvite(code)  // { uid, name }, or null if gone or expired; works signed out
//   await cloud.account.accept(code, app)   // { uid, name } | { …, already: true } | { self: true } | null (dead)
//   cloud.account.watchFriends(cb, onError) // [{ uid, since, app, note, tags, metAt, metPlace }], newest first
//   await cloud.account.saveFriend(uid, { note, tags, metPlace })  // your private card only
//   await cloud.account.unfriend(uid)
//   await cloud.account.exportMe()        // { uid, profile, friends: { uid: card }, guests: { id: guest } }
//   await cloud.account.importMe(json)    // your own export only: name, photo, cards, guests; never a friendship
//   await cloud.account.deleteMe()        // every document of yours, one by one, then signs out
// Times come back as milliseconds. Signing in creates your profile from your Google name and
// photo the first time, and refreshes the Google photo after that.
//
// All data for an app lives under /sidequests/<appId>/ in Firestore. Apps never read or
// write outside their own namespace, so one Firebase project serves the whole repo.
// The one exception is the household's list of people, at /sidequests/_shared/people/,
// which every app reaches through shared/people.js (built on cloud.shared below).

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

// Household-wide data that belongs to no single app — so far, the list of people. It sits
// beside the apps at /sidequests/_shared/, so the family rule already covers it.
const SHARED = "_shared";
function sharedRef(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 0) throw new Error("Document paths need an even number of segments: " + path);
  return fs.doc(db, "sidequests", SHARED, ...parts);
}
function sharedColRef(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 1) throw new Error("Collection paths need an odd number of segments: " + path);
  return fs.collection(db, "sidequests", SHARED, ...parts);
}

// ---- accounts ----
const DAY = 24 * 3600 * 1000, HOUR = 3600 * 1000;
const CODE = /^[A-Za-z0-9]{8,40}$/;
const ms = t => (t && typeof t.toMillis === "function") ? t.toMillis() : (typeof t === "number" ? t : null);
const profiles = new Map();   // uid -> Promise<{ name, photo } | null>
const needUser = () => {
  if (!currentUser) throw Object.assign(new Error("Sign in first"), { code: "unauthenticated" });
  return currentUser;
};
const googleName = u => String(u.displayName || (u.email || "").split("@")[0] || "Someone").trim().slice(0, 60);
// Timestamps to milliseconds, so an export is plain JSON.
const plain = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ms(v) ?? v]));
const asProfile = (uid, p) => p ? { uid, name: p.name || "", photo: p.photo || p.googlePhoto || "", googlePhoto: p.googlePhoto || "" } : null;
// 12 characters from a 62-letter alphabet: about 71 bits, so a code can't be guessed.
function newCode() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const out = [];
  while (out.length < 12) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    for (const x of b) if (x < 248 && out.length < 12) out.push(abc[x % 62]);
  }
  return out.join("");
}
// First sign-in makes the profile; later ones keep the Google photo current.
async function ensureProfile(u) {
  try {
    const r = fs.doc(db, "profiles", u.uid);
    const snap = await fs.getDoc(r);
    if (!snap.exists()) await fs.setDoc(r, { name: googleName(u), googlePhoto: u.photoURL || "", createdAt: fs.serverTimestamp() });
    else if (u.photoURL && snap.data().googlePhoto !== u.photoURL) await fs.updateDoc(r, { googlePhoto: u.photoURL });
    profiles.delete(u.uid);
  } catch (e) { console.warn("[cloud.account] profile", e); }
}

// A listener's error: the app's onError, or a warning naming the path.
function listenError(path, onError) {
  return e => onError ? onError(e) : console.warn("[cloud] listener stopped:", path, e && e.code, e);
}

export const cloud = {
  configured() {
    return firebaseConfig.projectId && firebaseConfig.projectId !== "PASTE_ME";
  },

  async init(id) {
    // ?mock in the URL: swap in the in-memory stand-in (shared/cloud-memory.js) — a fake
    // signed-in member and fake data, for trying any app without touching Firestore.
    if (!this.mock && typeof location !== "undefined" && new URLSearchParams(location.search).has("mock")) {
      const { memory } = await import("./cloud-memory.js");
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(memory));
      return this.init(id);
    }
    appId = id;
    if (!this.configured()) {
      console.warn("[cloud] firebase-config.js not filled in; running without cloud");
      return null;
    }
    await loadSdk();
    return new Promise(resolve => {
      authMod.onAuthStateChanged(auth, u => {
        currentUser = u;
        if (u) ensureProfile(u);
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

  // Live updates. Returns an unsubscribe function. A listener the rules refuse ends with
  // onError(e); without one it warns, since Firestore would otherwise log console.error.
  watch(path, cb, onError) {
    return fs.onSnapshot(ref(path), snap => cb(snap.exists() ? snap.data() : null), listenError(path, onError));
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

  // Live updates for a whole collection. Same options as list(), onError as watch().
  // Returns an unsubscribe function.
  watchList(collectionPath, cb, { orderBy, desc = true, limit } = {}, onError) {
    let q = colRef(collectionPath);
    const clauses = [];
    if (orderBy) clauses.push(fs.orderBy(orderBy, desc ? "desc" : "asc"));
    if (limit) clauses.push(fs.limit(limit));
    if (clauses.length) q = fs.query(q, ...clauses);
    return fs.onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), listenError(collectionPath, onError));
  },

  newId() {
    return fs.doc(colRef("_ids")).id;
  },

  // ---- shared by every app ----
  // Apps don't call these directly; shared/people.js does.
  shared: {
    save(path, data) {
      return fs.setDoc(sharedRef(path), { ...data, _updatedAt: fs.serverTimestamp() }, { merge: true });
    },
    newId() {
      return fs.doc(sharedColRef("_ids")).id;
    },
    // cb(rows, { fromCache }). fromCache stays true until the server has answered, so a
    // caller can tell "not in the list" from "the list hasn't arrived on this phone yet".
    watchList(collectionPath, cb, onError) {
      return fs.onSnapshot(sharedColRef(collectionPath), { includeMetadataChanges: true },
        snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })), { fromCache: snap.metadata.fromCache }),
        e => { console.warn("[cloud.shared]", e); if (onError) onError(e); });
    }
  },

  // ---- family allowlist ----
  // Lives in /members (one doc per email, doc id = the address, lowercased).
  // Firestore rules check membership there, so changes take effect instantly.
  // One member carries role: "owner", set by hand in the Firebase console. The rules keep
  // removing a member, and each app's undo-proof actions, to the owner (firestore.rules).
  async listMembers() {
    const snap = await fs.getDocs(fs.collection(db, "members"));
    return snap.docs.map(d => d.id).sort();
  },
  // "owner", "member", or null when signed out or not invited. Apps hide owner-only
  // actions from everyone else; the rules refuse them anyway. Only the household may read
  // /members, so for anyone else the read is refused: that's null too, not an error.
  async role() {
    if (!currentUser || !currentUser.email) return null;
    try {
      const snap = await fs.getDoc(fs.doc(db, "members", currentUser.email.toLowerCase()));
      return snap.exists() ? (snap.data().role === "owner" ? "owner" : "member") : null;
    } catch (e) {
      if (e && e.code === "permission-denied") return null;
      throw e;
    }
  },
  // Merged, so inviting someone again never wipes their role.
  addMember(email) {
    const e = String(email).trim().toLowerCase();
    return fs.setDoc(fs.doc(db, "members", e), {
      addedBy: currentUser ? currentUser.email : null,
      addedAt: fs.serverTimestamp()
    }, { merge: true });
  },
  removeMember(email) {
    return fs.deleteDoc(fs.doc(db, "members", String(email).trim().toLowerCase()));
  },

  // ---- accounts: anyone signed in, keyed by uid (header; rules in firestore.rules) ----
  account: {
    async me() {
      if (!currentUser) return null;
      const snap = await fs.getDoc(fs.doc(db, "profiles", currentUser.uid));
      return asProfile(currentUser.uid, snap.exists() ? snap.data() : null);
    },
    watchMe(cb, onError) {
      const u = needUser();
      return fs.onSnapshot(fs.doc(db, "profiles", u.uid),
        snap => cb(asProfile(u.uid, snap.exists() ? snap.data() : null)), listenError("profiles/me", onError));
    },
    async saveMe({ name, photo } = {}) {
      const u = needUser(), f = {};
      if (name !== undefined) f.name = String(name).trim().slice(0, 60);
      if (photo !== undefined) f.photo = photo || "";
      profiles.delete(u.uid);
      return fs.setDoc(fs.doc(db, "profiles", u.uid), f, { merge: true });
    },
    profile(uid) {
      if (!uid) return Promise.resolve(null);
      if (!profiles.has(uid)) {
        const p = fs.getDoc(fs.doc(db, "profiles", uid))
          .then(snap => { const v = asProfile(uid, snap.exists() ? snap.data() : null); if (!v) profiles.delete(uid); return v; })
          .catch(e => { profiles.delete(uid); console.warn("[cloud.account] profile", uid, e); return null; });
        profiles.set(uid, p);
      }
      return profiles.get(uid);
    },
    // Your code lives in private/main, never in the profile, so having your uid isn't enough
    // to friend you. Renewed when it has under an hour left; the one it replaces is deleted.
    async invite() {
      const u = needUser();
      const privRef = fs.doc(db, "profiles", u.uid, "private", "main");
      const priv = (await fs.getDoc(privRef)).data() || {};
      if (priv.invite && ms(priv.expires) > Date.now() + HOUR) return priv.invite;
      const me = await this.me();
      const code = newCode(), expires = fs.Timestamp.fromMillis(Date.now() + DAY);
      await fs.setDoc(fs.doc(db, "invites", code), { uid: u.uid, name: (me && me.name) || googleName(u), expires });
      await fs.setDoc(privRef, { invite: code, expires });
      if (priv.invite) fs.deleteDoc(fs.doc(db, "invites", priv.invite)).catch(() => {});
      return code;
    },
    async lookupInvite(code) {
      if (!CODE.test(String(code || ""))) return null;
      const snap = await fs.getDoc(fs.doc(db, "invites", code));
      if (!snap.exists()) return null;
      const d = snap.data();
      return ms(d.expires) > Date.now() ? { uid: d.uid, name: d.name } : null;
    },
    // The QR is the consent: one document for the pair, made with their live code.
    async accept(code, app) {
      const u = needUser();
      const inv = await this.lookupInvite(code);
      if (!inv) return null;
      if (inv.uid === u.uid) return { self: true };
      const uids = [u.uid, inv.uid].sort();
      const pairRef = fs.doc(db, "friendships", uids.join("_"));
      if ((await fs.getDoc(pairRef)).exists()) return { ...inv, already: true };
      await fs.setDoc(pairRef, { uids, since: fs.serverTimestamp(), via: code, app: String(app || "") });
      await fs.setDoc(fs.doc(db, "profiles", u.uid, "friends", inv.uid), { metAt: fs.serverTimestamp() }, { merge: true })
        .catch(e => console.warn("[cloud.account] card", e));
      return inv;
    },
    // Your pairs joined to your private cards. Two listeners; cb fires when either changes.
    watchFriends(cb, onError) {
      const u = needUser();
      let pairs = null, cards = {};
      const emit = () => {
        if (!pairs) return;
        cb(pairs.map(p => {
          const uid = p.uids.find(x => x !== u.uid) || "", c = cards[uid] || {};
          return { uid, since: ms(p.since), app: p.app || "", note: c.note || "", tags: c.tags || [],
            metAt: ms(c.metAt) ?? ms(p.since), metPlace: c.metPlace || "" };
        }).sort((a, b) => (b.since || 0) - (a.since || 0)));
      };
      const est = { serverTimestamps: "estimate" };
      const offA = fs.onSnapshot(fs.query(fs.collection(db, "friendships"), fs.where("uids", "array-contains", u.uid)),
        snap => { pairs = snap.docs.map(d => d.data(est)); emit(); }, listenError("friendships", onError));
      const offB = fs.onSnapshot(fs.collection(db, "profiles", u.uid, "friends"),
        snap => { cards = Object.fromEntries(snap.docs.map(d => [d.id, d.data(est)])); emit(); }, listenError("friends", onError));
      return () => { offA(); offB(); };
    },
    saveFriend(uid, fields) {
      const u = needUser();
      return fs.setDoc(fs.doc(db, "profiles", u.uid, "friends", uid), { ...fields }, { merge: true });
    },
    async unfriend(uid) {
      const u = needUser();
      await fs.deleteDoc(fs.doc(db, "friendships", [u.uid, uid].sort().join("_")));
      await fs.deleteDoc(fs.doc(db, "profiles", u.uid, "friends", uid)).catch(() => {});
    },
    async exportMe() {
      const u = needUser();
      const rows = async sub => Object.fromEntries((await fs.getDocs(fs.collection(db, "profiles", u.uid, sub)))
        .docs.map(d => [d.id, plain(d.data())]));
      const me = (await fs.getDoc(fs.doc(db, "profiles", u.uid))).data() || {};
      return { uid: u.uid, profile: { name: me.name || "", photo: me.photo || "" },
        friends: await rows("friends"), guests: await rows("guests") };
    },
    // A friendship needs the other side's live code, so import restores only what's yours:
    // your name and photo, your cards and your guests. Someone else's file is refused.
    async importMe(data) {
      const u = needUser();
      if (!data || data.uid !== u.uid) throw Object.assign(new Error("That export belongs to another account"), { code: "wrong-account" });
      const p = data.profile || {};
      if (p.name) await this.saveMe({ name: p.name, photo: p.photo || "" });
      let n = 0;
      for (const [sub, map] of [["friends", data.friends], ["guests", data.guests]])
        for (const [id, doc] of Object.entries(map || {})) { await fs.setDoc(fs.doc(db, "profiles", u.uid, sub, id), doc, { merge: true }); n++; }
      return n;
    },
    // Firestore doesn't cascade, so each document goes on its own: your pairs, cards, guests,
    // live code, private/main, then the profile. Records in apps keep your name (Session 6).
    async deleteMe() {
      const u = needUser();
      const gone = r => fs.deleteDoc(r).catch(e => console.warn("[cloud.account] delete", r.path, e));
      const pairs = await fs.getDocs(fs.query(fs.collection(db, "friendships"), fs.where("uids", "array-contains", u.uid)));
      for (const d of pairs.docs) await gone(d.ref);
      for (const sub of ["friends", "guests"])
        for (const d of (await fs.getDocs(fs.collection(db, "profiles", u.uid, sub))).docs) await gone(d.ref);
      const privRef = fs.doc(db, "profiles", u.uid, "private", "main");
      const priv = (await fs.getDoc(privRef)).data() || {};
      if (priv.invite) await gone(fs.doc(db, "invites", priv.invite));
      await gone(privRef);
      await fs.deleteDoc(fs.doc(db, "profiles", u.uid));
      profiles.delete(u.uid);
      await authMod.signOut(auth);
    }
  }
};
