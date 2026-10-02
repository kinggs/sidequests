// Proves shared/firestore.rules against the Firestore emulator. The deploy-rules Action runs
// it before every rules deploy, and a failing case stops the deploy.
//
//   npm i --no-save @firebase/rules-unit-testing firebase
//   npx firebase-tools emulators:exec --only firestore --project demo-sidequests \
//     "node --test shared/rules-check.mjs"
//
// Needs Java 21 for the emulator. Not named *.test.mjs on purpose: a bare `node --test`
// would pick it up and fail without the emulator.
//
// Each rule's cases are written before the rule (KIT-PLAN.md, Decisions). A case that must
// pass uses assertSucceeds; one in a rule's "Must refuse" list uses assertFails.

import fs from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, query, where, setDoc, setLogLevel, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";

// Every refused write would otherwise log a PERMISSION_DENIED stack; the test names say it.
setLogLevel("silent");

const OWNER = "owner@example.com", MEMBER = "member@example.com", STRANGER = "stranger@example.com";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sidequests",
    firestore: { rules: fs.readFileSync(new URL("./firestore.rules", import.meta.url), "utf8") }
  });
});
after(() => env && env.cleanup());

// The household and a little data, written past the rules.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "members", OWNER), { role: "owner" });
    await setDoc(doc(db, "members", MEMBER), {});
    await setDoc(doc(db, "sidequests/bloc-11/state/main"), { n: 1 });
    await setDoc(doc(db, "sidequests/_shared/people/p1"), { name: "Ann" });
    await setDoc(doc(db, "sidequests/rack-it/matches/done1"), { status: "done" });
    await setDoc(doc(db, "sidequests/rack-it/matches/live1"), { status: "live" });
    await setDoc(doc(db, "sidequests/rack-it/starters/s1"), { zargo: 400 });
    await setDoc(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 500, robustness: 2, sessions: 1 });
    await setDoc(doc(db, "sidequests/rack-it/state/main"), { players: { r1: { zargo: 500 } }, config: {} });
    // Accounts: Ann, Ben and Cat, none of them household. Ann's code is live; Cat's too.
    await setDoc(doc(db, "profiles/ann"), { name: "Ann" });
    await setDoc(doc(db, "profiles/ann/private/main"), { invite: "ANNLIVE", expires: inHours(24) });
    await setDoc(doc(db, "profiles/ann/friends/cat"), { note: "x" });
    await setDoc(doc(db, "profiles/ann/guests/g_1"), { name: "Dan" });
    await setDoc(doc(db, "invites/ANNLIVE"), { uid: "ann", name: "Ann", expires: inHours(24) });
    await setDoc(doc(db, "invites/ANNOLD"), { uid: "ann", name: "Ann", expires: inHours(-1) });
    await setDoc(doc(db, "invites/BENLIVE"), { uid: "ben", name: "Ben", expires: inHours(24) });
    await setDoc(doc(db, "invites/CATLIVE"), { uid: "cat", name: "Cat", expires: inHours(24) });
    await setDoc(doc(db, "friendships/ann_cat"), { uids: ["ann", "cat"], since: 1, via: "x", app: "rack-it" });
  });
});

const as = email => env.authenticatedContext(email.split("@")[0], { email, email_verified: true }).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();
// An account that isn't household: a uid and a Google email that's not on /members.
const user = uid => env.authenticatedContext(uid, { email: uid + "@gmail.com", email_verified: true }).firestore();
function inHours(h){ return Timestamp.fromMillis(Date.now() + h * 3600 * 1000); }
const pairDoc = (via, extra = {}) => ({ uids: ["ann", "ben"], since: serverTimestamp(), via, app: "rack-it", ...extra });

describe("household member", () => {
  test("reads an app's data and the shared people", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDoc(doc(db, "sidequests/bloc-11/state/main")));
    await assertSucceeds(getDocs(collection(db, "sidequests/_shared/people")));
  });
  test("writes an app's data", async () => {
    await assertSucceeds(setDoc(doc(as(MEMBER), "sidequests/bloc-11/climbs/c1"), { grade: 5 }));
  });
  test("starts and scores a Rack It match", async () => {
    const db = as(MEMBER);
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/matches/new1"), { status: "live" }));
    await assertSucceeds(updateDoc(doc(db, "sidequests/rack-it/matches/live1"), { status: "done" }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/state/main"), { config: {} }));
  });
  test("reads the members list and invites someone", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDocs(collection(db, "members")));
    await assertSucceeds(setDoc(doc(db, "members", "new@example.com"), { addedBy: MEMBER }));
  });
  test("refused: deleting or changing a saved match", async () => {
    const db = as(MEMBER);
    await assertFails(deleteDoc(doc(db, "sidequests/rack-it/matches/done1")));
    await assertFails(updateDoc(doc(db, "sidequests/rack-it/matches/done1"), { status: "live" }));
  });
  test("refused: changing a starter rating, removing a member, setting a role", async () => {
    const db = as(MEMBER);
    await assertFails(updateDoc(doc(db, "sidequests/rack-it/starters/s1"), { zargo: 900 }));
    await assertFails(deleteDoc(doc(db, "members", OWNER)));
    await assertFails(setDoc(doc(db, "members", "new@example.com"), { role: "owner" }));
  });
});

describe("owner", () => {
  test("deletes and rewrites a saved Rack It match", async () => {
    const db = as(OWNER);
    await assertSucceeds(updateDoc(doc(db, "sidequests/rack-it/matches/done1"), { zargoAfter: 1 }));
    await assertSucceeds(deleteDoc(doc(db, "sidequests/rack-it/matches/done1")));
  });
  test("removes a member", async () => {
    await assertSucceeds(deleteDoc(doc(as(OWNER), "members", MEMBER)));
  });
});

describe("signed in, not on /members", () => {
  test("refused: reading anything under sidequests/", async () => {
    const db = as(STRANGER);
    await assertFails(getDoc(doc(db, "sidequests/bloc-11/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/matches")));
  });
  test("refused: writing anything under sidequests/", async () => {
    const db = as(STRANGER);
    await assertFails(setDoc(doc(db, "sidequests/bloc-11/climbs/c1"), { grade: 5 }));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/matches/new1"), { status: "live" }));
  });
  test("refused: reading /members, even their own entry, and adding themselves", async () => {
    const db = as(STRANGER);
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(getDoc(doc(db, "members", STRANGER)));
    await assertFails(setDoc(doc(db, "members", STRANGER), {}));
  });
  test("refused: a member's email with email_verified false", async () => {
    const db = env.authenticatedContext("fake", { email: MEMBER, email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, "sidequests/bloc-11/state/main")));
  });
});

describe("signed out", () => {
  test("refused: everything", async () => {
    const db = signedOut();
    await assertFails(getDoc(doc(db, "sidequests/bloc-11/state/main")));
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(setDoc(doc(db, "sidequests/bloc-11/climbs/c1"), { grade: 5 }));
  });
});

describe("outside sidequests/ and members/", () => {
  test("refused: any other top-level path, even for the owner", async () => {
    await assertFails(getDoc(doc(as(OWNER), "elsewhere/x")));
    await assertFails(setDoc(doc(as(OWNER), "elsewhere/x"), { a: 1 }));
  });
});

// ---- Session 1: accounts, invites and friendships (KIT-PLAN.md) ----

describe("profiles", () => {
  test("anyone signed in gets a profile by uid", async () => {
    await assertSucceeds(getDoc(doc(user("ben"), "profiles/ann")));
  });
  test("you create and update your own", async () => {
    const db = user("ben");
    await assertSucceeds(setDoc(doc(db, "profiles/ben"), { name: "Ben", googlePhoto: "https://x", createdAt: serverTimestamp(), _updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, "profiles/ben"), { name: "Benjamin", photo: "data:image/jpeg;base64,AAAA" }, { merge: true }));
  });
  test("you read and write your own private, friends and guests", async () => {
    const db = user("ann");
    await assertSucceeds(getDoc(doc(db, "profiles/ann/private/main")));
    await assertSucceeds(getDocs(collection(db, "profiles/ann/friends")));
    await assertSucceeds(setDoc(doc(db, "profiles/ann/friends/ben"), { metAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, "profiles/ann/guests/g_2"), { name: "Eve" }));
  });
  test("refused: listing /profiles", async () => {
    await assertFails(getDocs(collection(user("ben"), "profiles")));
    await assertFails(getDocs(collection(as(OWNER), "profiles")));
  });
  test("refused: a profile signed out, or someone else's", async () => {
    await assertFails(getDoc(doc(signedOut(), "profiles/ann")));
    await assertFails(setDoc(doc(user("ben"), "profiles/ann"), { name: "Not Ann" }));
  });
  test("refused: a profile with an extra key, a long name or a big photo", async () => {
    const db = user("ben");
    await assertFails(setDoc(doc(db, "profiles/ben"), { name: "Ben", email: "ben@gmail.com" }));
    await assertFails(setDoc(doc(db, "profiles/ben"), { name: "B".repeat(61) }));
    await assertFails(setDoc(doc(db, "profiles/ben"), { name: "Ben", photo: "x".repeat(60001) }));
  });
  test("refused: reading anyone else's private, friends or guests", async () => {
    const db = user("ben");
    await assertFails(getDoc(doc(db, "profiles/ann/private/main")));
    await assertFails(getDocs(collection(db, "profiles/ann/friends")));
    await assertFails(getDoc(doc(db, "profiles/ann/friends/cat")));
    await assertFails(getDocs(collection(db, "profiles/ann/guests")));
    await assertFails(getDocs(collection(as(OWNER), "profiles/ann/friends")));
  });
  test("refused: writing anyone else's private, friends or guests, or any other subcollection", async () => {
    await assertFails(setDoc(doc(user("ben"), "profiles/ann/friends/ben"), { note: "hi" }));
    await assertFails(setDoc(doc(user("ann"), "profiles/ann/other/x"), { a: 1 }));
  });
});

describe("invites", () => {
  test("anyone, signed in or not, gets one by its code", async () => {
    await assertSucceeds(getDoc(doc(signedOut(), "invites/ANNLIVE")));
    await assertSucceeds(getDoc(doc(user("ben"), "invites/ANNLIVE")));
  });
  test("you make your own code for up to 25 hours, and delete it", async () => {
    const db = user("ben");
    await assertSucceeds(setDoc(doc(db, "invites/BENNEW"), { uid: "ben", name: "Ben", expires: inHours(24), _updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db, "invites/BENLIVE")));
  });
  test("refused: listing invites", async () => {
    await assertFails(getDocs(collection(user("ben"), "invites")));
  });
  test("refused: an invite for another uid, or one that lasts over 25 hours", async () => {
    const db = user("ben");
    await assertFails(setDoc(doc(db, "invites/FAKE"), { uid: "ann", name: "Ann", expires: inHours(24) }));
    await assertFails(setDoc(doc(db, "invites/LONG"), { uid: "ben", name: "Ben", expires: inHours(26) }));
    await assertFails(setDoc(doc(db, "invites/EXTRA"), { uid: "ben", name: "Ben", expires: inHours(1), forever: true }));
  });
  test("refused: changing a code, or deleting someone else's", async () => {
    await assertFails(updateDoc(doc(user("ann"), "invites/ANNLIVE"), { expires: inHours(25) }));
    await assertFails(deleteDoc(doc(user("ben"), "invites/ANNLIVE")));
  });
});

describe("friendships", () => {
  test("you connect with someone's live code", async () => {
    await assertSucceeds(setDoc(doc(user("ben"), "friendships/ann_ben"), pairDoc("ANNLIVE")));
  });
  test("either of the two reads it, and finds it in a list of their own", async () => {
    await assertSucceeds(getDoc(doc(user("ann"), "friendships/ann_cat")));
    await assertSucceeds(getDoc(doc(user("cat"), "friendships/ann_cat")));
    await assertSucceeds(getDocs(query(collection(user("cat"), "friendships"), where("uids", "array-contains", "cat"))));
  });
  test("one of the two checks a pair that doesn't exist yet", async () => {
    await assertSucceeds(getDoc(doc(user("ben"), "friendships/ann_ben")));
  });
  test("either of the two ends it", async () => {
    await assertSucceeds(deleteDoc(doc(user("cat"), "friendships/ann_cat")));
  });
  test("refused: a friendship with no code, an expired code or a deleted one", async () => {
    const db = user("ben");
    const { via, ...noCode } = pairDoc("x");
    await assertFails(setDoc(doc(db, "friendships/ann_ben"), noCode));
    await assertFails(setDoc(doc(db, "friendships/ann_ben"), pairDoc("ANNOLD")));
    await assertFails(setDoc(doc(db, "friendships/ann_ben"), pairDoc("GONE")));
  });
  test("refused: your own code, or a third person's", async () => {
    const db = user("ben");
    await assertFails(setDoc(doc(db, "friendships/ann_ben"), pairDoc("BENLIVE")));
    await assertFails(setDoc(doc(db, "friendships/ann_ben"), pairDoc("CATLIVE")));
  });
  test("refused: a pair you aren't in, a pair id that doesn't match, or an extra key", async () => {
    await assertFails(setDoc(doc(user("cat"), "friendships/ann_ben"), pairDoc("ANNLIVE")));
    await assertFails(setDoc(doc(user("ben"), "friendships/ben_ann"), pairDoc("ANNLIVE")));
    await assertFails(setDoc(doc(user("ben"), "friendships/ben_ann"), { ...pairDoc("ANNLIVE"), uids: ["ben", "ann"] }));
    await assertFails(setDoc(doc(user("ben"), "friendships/ann_ben"), pairDoc("ANNLIVE", { note: "x" })));
  });
  test("refused: reading a friendship you aren't in, or one that doesn't exist and isn't yours", async () => {
    await assertFails(getDoc(doc(user("ben"), "friendships/ann_cat")));
    await assertFails(getDoc(doc(as(OWNER), "friendships/ann_cat")));
    await assertFails(getDoc(doc(user("ben"), "friendships/ann_dan")));
    await assertFails(getDocs(collection(user("ann"), "friendships")));
  });
  test("refused: editing a friendship, or ending one you aren't in", async () => {
    await assertFails(updateDoc(doc(user("ann"), "friendships/ann_cat"), { app: "bloc-11" }));
    await assertFails(deleteDoc(doc(user("ben"), "friendships/ann_cat")));
  });
});

// ---- Session 2: your profile and photo, leaving (KIT-PLAN.md) ----

describe("your profile and leaving", () => {
  test("a photo up to 60,000 characters fits", async () => {
    await assertSucceeds(setDoc(doc(user("ann"), "profiles/ann"), { name: "Ann", photo: "x".repeat(60000) }, { merge: true }));
  });
  test("Delete my account removes each of your documents, one by one", async () => {
    const db = user("ann");
    await assertSucceeds(deleteDoc(doc(db, "friendships/ann_cat")));
    await assertSucceeds(deleteDoc(doc(db, "profiles/ann/friends/cat")));
    await assertSucceeds(deleteDoc(doc(db, "profiles/ann/guests/g_1")));
    await assertSucceeds(deleteDoc(doc(db, "invites/ANNLIVE")));
    await assertSucceeds(deleteDoc(doc(db, "invites/ANNOLD")));
    await assertSucceeds(deleteDoc(doc(db, "profiles/ann/private/main")));
    await assertSucceeds(deleteDoc(doc(db, "profiles/ann")));
  });
  test("refused: deleting someone else's profile, card, guest or code", async () => {
    const db = user("ben");
    await assertFails(deleteDoc(doc(db, "profiles/ann")));
    await assertFails(deleteDoc(doc(db, "profiles/ann/friends/cat")));
    await assertFails(deleteDoc(doc(db, "profiles/ann/guests/g_1")));
    await assertFails(deleteDoc(doc(db, "invites/ANNLIVE")));
  });
});

// ---- Session 3: Rack It's ratings in their own documents (KIT-PLAN.md) ----

describe("Rack It ratings", () => {
  test("a member lists them, and saving a match writes two", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDocs(collection(db, "sidequests/rack-it/ratings")));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 510, robustness: 3, sessions: 2 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/r2"), { zargo: 490, robustness: 1, sessions: 1 }));
  });
  test("the migration moves state/main.players out, and Replace deletes a rating", async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), "sidequests/rack-it/state/main"), { players: deleteField() }));
    await assertSucceeds(deleteDoc(doc(as(MEMBER), "sidequests/rack-it/ratings/r1")));
  });
  test("refused: reading or writing a rating when not on /members, or signed out", async () => {
    for (const db of [as(STRANGER), user("ann"), signedOut()]){
      await assertFails(getDoc(doc(db, "sidequests/rack-it/ratings/r1")));
      await assertFails(getDocs(collection(db, "sidequests/rack-it/ratings")));
      await assertFails(setDoc(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 900 }));
      await assertFails(deleteDoc(doc(db, "sidequests/rack-it/ratings/r1")));
    }
  });
});
