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
import { deleteDoc, deleteField, doc, getDoc, getDocs, collection, query, where, orderBy, limit, setDoc, setLogLevel, updateDoc, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";

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
  // Since Session 6b a member who isn't the owner plays Rack It as a player (below), not through
  // the household rule.
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
  test("starts and scores a Rack It match with no uids, and writes state/main", async () => {
    const db = as(OWNER);
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/matches/new1"), { status: "live" }));
    await assertSucceeds(updateDoc(doc(db, "sidequests/rack-it/matches/live1"), { status: "done" }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/state/main"), { config: {} }));
  });
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
  test("the owner lists them, and saving a match writes two", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, "sidequests/rack-it/ratings")));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 510, robustness: 3, sessions: 2 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/r2"), { zargo: 490, robustness: 1, sessions: 1 }));
  });
  test("the migration moves state/main.players out, and Replace deletes a rating", async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), "sidequests/rack-it/state/main"), { players: deleteField() }));
    await assertSucceeds(deleteDoc(doc(as(OWNER), "sidequests/rack-it/ratings/r1")));
  });
  test("refused: listing or writing a rating when not on /members, or anything signed out", async () => {
    // Since Session 6 anyone signed in gets one rating by its id (below); listing stays the household's.
    await assertFails(getDoc(doc(signedOut(), "sidequests/rack-it/ratings/r1")));
    for (const db of [as(STRANGER), user("ann"), signedOut()]){
      await assertFails(getDocs(collection(db, "sidequests/rack-it/ratings")));
      await assertFails(setDoc(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 900 }));
      await assertFails(deleteDoc(doc(db, "sidequests/rack-it/ratings/r1")));
    }
  });
});

// ---- Session 4: Players (KIT-PLAN.md) ----
// Neither needs a new rule: a guest is a document under profiles/<you>/guests (Session 1), and
// the household already writes any match field. These record that, and what stays shut until
// Session 6 opens Rack It to outsiders.

describe("Players: guests and a match's names and uids", () => {
  test("you add a guest and list your own", async () => {
    const db = user("ann");
    await assertSucceeds(setDoc(doc(db, "profiles/ann/guests/g_new"), { name: "Dan's brother", createdAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(db, "profiles/ann/guests")));
  });
  test("the owner starts and saves a match against a friend or a guest, with names, uids and by", async () => {
    const db = as(OWNER);
    const m = doc(db, "sidequests/rack-it/matches/m4");
    await assertSucceeds(setDoc(m, { status: "live", playerA: "owner", playerB: "ann",
      names: { a: "Owner", b: "Ann" }, uids: ["owner", "ann"], by: "owner" }));
    await assertSucceeds(updateDoc(m, { status: "done", zargoAfter: { a: 510, b: 490 } }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/matches/m5"), { status: "live", playerA: "owner", playerB: "g_1",
      names: { a: "Owner", b: "Dan" }, uids: ["owner"], by: "owner" }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/ann"), { zargo: 490, robustness: 1, sessions: 1 }));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/ratings/g_1"), { zargo: 450, robustness: 0, sessions: 0 }));
  });
  test("refused: anyone else's guests, the household included", async () => {
    await assertFails(getDoc(doc(as(OWNER), "profiles/ann/guests/g_1")));
    await assertFails(setDoc(doc(as(MEMBER), "profiles/ann/guests/g_9"), { name: "x" }));
  });
  test("refused: an outsider reading a match they aren't in, or starting one as someone else", async () => {
    // Session 6 lets an outsider read and start matches they're in (below); these stay shut.
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "sidequests/rack-it/matches/m6"),
      { status: "done", uids: ["ann"], names: { a: "Ann", b: "Dan" } }));
    const db = user("ben");
    await assertFails(getDoc(doc(db, "sidequests/rack-it/matches/m6")));
    await assertFails(getDocs(query(collection(db, "sidequests/rack-it/matches"), where("uids", "array-contains", "ann"))));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/matches/m7"), { status: "live", uids: ["ann"], by: "ann" }));
  });
});

// ---- Session 5: rated matches and confirming (KIT-PLAN.md) ----
// No new rule, household only: a member already writes any field of a match that isn't done,
// and any rating. These record the confirm path Session 6 narrows for outsiders, and that a
// batch holding one refused write lands nothing.

describe("Rated matches: pending, confirm, Not right, Withdraw", () => {
  test("a member saves a rated match as pending; the other confirms it in one batch with both ratings", async () => {
    const m = "sidequests/rack-it/matches/r5";
    await assertSucceeds(setDoc(doc(as(OWNER), m), { status: "live", rated: true, playerA: "owner", playerB: "member",
      uids: ["owner", "member"], by: "owner" }));
    await assertSucceeds(updateDoc(doc(as(OWNER), m), { status: "pending", endedBy: "owner", rated: true }));
    const db = as(MEMBER), b = writeBatch(db);
    b.set(doc(db, "sidequests/rack-it/ratings/owner"), { zargo: 501, robustness: 1, sessions: 1, match: "r5" }, { merge: true });
    b.set(doc(db, "sidequests/rack-it/ratings/member"), { zargo: 499, robustness: 1, sessions: 1, match: "r5" }, { merge: true });
    b.update(doc(db, m), { status: "done", zargoBefore: { a: 500, b: 500 }, zargoAfter: { a: 501, b: 499 }, ratedAt: 1, confirmedBy: "member" });
    await assertSucceeds(b.commit());
  });
  test("Not right and Withdraw: a pending match stands as a friendly", async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), "sidequests/rack-it/matches/p1"), { status: "pending", rated: true, endedBy: "owner", uids: ["owner", "member"] });
      await setDoc(doc(ctx.firestore(), "sidequests/rack-it/matches/p2"), { status: "pending", rated: true, endedBy: "member", uids: ["owner", "member"] });
    });
    await assertSucceeds(updateDoc(doc(as(MEMBER), "sidequests/rack-it/matches/p1"), { status: "done", rated: false, declinedBy: "member" }));
    await assertSucceeds(updateDoc(doc(as(MEMBER), "sidequests/rack-it/matches/p2"), { status: "done", rated: false, withdrawnBy: "member" }));
  });
  test("refused: a member turning a saved friendly into a rated match, and the whole batch with it", async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "sidequests/rack-it/matches/f1"), { status: "done", rated: false }));
    const db = as(MEMBER), b = writeBatch(db);
    b.set(doc(db, "sidequests/rack-it/ratings/r1"), { zargo: 900 }, { merge: true });
    b.update(doc(db, "sidequests/rack-it/matches/f1"), { rated: true, ratedAt: 1 });
    await assertFails(b.commit());
    let zargo;
    await env.withSecurityRulesDisabled(async ctx => { zargo = (await getDoc(doc(ctx.firestore(), "sidequests/rack-it/ratings/r1"))).data().zargo; });
    if (zargo !== 500) throw new Error("a refused batch moved a rating");
  });
});

// ---- Session 6: outsiders play in Rack It (KIT-PLAN.md) ----
// Ann, Ben and Cat are accounts, none of them household. Ann and Ben are connected; Ann and Cat
// too (above); Ben and Cat aren't. A player reads, starts and scores matches they're in, and a
// rated match moves ratings only in the batch where the other player confirms it.

const M = "sidequests/rack-it/matches/", R = "sidequests/rack-it/ratings/";
const abMatch = (extra = {}) => ({ game: "league", playerA: "ann", playerB: "ben", names: { a: "Ann", b: "Ben" },
  uids: ["ann", "ben"], by: "ann", rated: true, status: "live", startedAt: 1, endedAt: null,
  zargoBefore: { a: 500, b: 500 }, zargoAfter: null, racks: {}, totals: { a: 0, b: 0 }, ...extra });
// Ben confirms (or `who` tries to): both ratings and the match, in one batch.
function confirmBatch(who, id, { ratings = ["ann", "ben"], match = true } = {}){
  const db = user(who), b = writeBatch(db);
  for (const pid of ratings) b.set(doc(db, R + pid), { zargo: 510, robustness: 5, sessions: 1, match: id }, { merge: true });
  if (match) b.update(doc(db, M + id), { status: "done", zargoBefore: { a: 500, b: 500 }, zargoAfter: { a: 510, b: 490 },
    ratedAt: 2, confirmedBy: who, _updatedAt: serverTimestamp() });
  return b.commit();
}
const seed = (path, data) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data));
async function ratingOf(pid){
  let z;
  await env.withSecurityRulesDisabled(async ctx => { const d = await getDoc(doc(ctx.firestore(), R + pid)); z = d.exists() ? d.data().zargo : null; });
  return z;
}

describe("Outsiders in Rack It: what a player may do", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "live", abMatch());
    await seed(M + "friendly", abMatch({ rated: false }));
    await seed(M + "pendA", abMatch({ status: "pending", endedBy: "ann", endedAt: 2 }));
    await seed(M + "pendB", abMatch({ status: "pending", endedBy: "ben", endedAt: 2 }));
    await seed(M + "doneAB", abMatch({ status: "done", rated: false, endedAt: 2 }));
    await seed(M + "household", abMatch({ playerA: "owner", playerB: "ben", uids: ["owner", "ben"], by: "owner",
      status: "pending", endedBy: "owner" }));
    await seed(R + "ann", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(R + "ben", { zargo: 500, robustness: 4, sessions: 3 });
  });

  test("gets a match they're in, and lists theirs with the uids filter and no orderBy", async () => {
    const db = user("ben");
    await assertSucceeds(getDoc(doc(db, M + "live")));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/rack-it/matches"), where("uids", "array-contains", "ben"))));
  });
  test("gets anyone's rating by id, and state/main", async () => {
    await assertSucceeds(getDoc(doc(user("cat"), R + "ann")));
    await assertSucceeds(getDoc(doc(user("cat"), R + "nobody-yet")));
    await assertSucceeds(getDoc(doc(user("ben"), "sidequests/rack-it/state/main")));
  });
  test("starts a match alone with a guest, or against a friend", async () => {
    const db = user("ann");
    await assertSucceeds(setDoc(doc(db, M + "g1"), abMatch({ playerB: "g_1", names: { a: "Ann", b: "Dan" }, uids: ["ann"], rated: false })));
    await assertSucceeds(setDoc(doc(db, M + "f1"), abMatch()));
    await assertSucceeds(setDoc(doc(user("ben"), M + "f2"), abMatch({ by: "ben", playerA: "ben", playerB: "ann", uids: ["ben", "ann"] })));
  });
  test("scores a live match rack by rack, and discards one", async () => {
    const db = user("ben");
    await assertSucceeds(updateDoc(doc(db, M + "live"), { "racks.1": { balls: { 1: "a" } }, turn: "b", totals: { a: 1, b: 0 } }));
    await assertSucceeds(updateDoc(doc(db, M + "friendly"), { status: "discarded", endedAt: 3 }));
  });
  test("saves a friendly as done, and a rated match as pending with themselves as endedBy", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "friendly"), { status: "done", rated: false, endedAt: 3, totals: { a: 5, b: 3 } }));
    await assertSucceeds(updateDoc(doc(user("ann"), M + "live"), { status: "pending", rated: true, endedBy: "ann", endedAt: 3 }));
  });
  test("a rated match saved as a friendly instead", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "live"), { status: "done", rated: false, endedAt: 3 }));
  });
  test("Confirm: the other player writes both ratings and the match in one batch", async () => {
    await assertSucceeds(confirmBatch("ben", "pendA"));
    if (await ratingOf("ann") !== 510) throw new Error("the confirm batch didn't land");
  });
  test("Confirm a match a household member scored", async () => {
    await seed(R + "owner", { zargo: 500, robustness: 4, sessions: 3 });
    await assertSucceeds(confirmBatch("ben", "household", { ratings: ["owner", "ben"] }));
  });
  test("Not right (the other player) and Withdraw (the scorer): it stands as a friendly", async () => {
    await assertSucceeds(updateDoc(doc(user("ben"), M + "pendA"), { status: "done", rated: false, declinedBy: "ben" }));
    await assertSucceeds(updateDoc(doc(user("ben"), M + "pendB"), { status: "done", rated: false, withdrawnBy: "ben" }));
  });
  test("writes their own guest's starter rating, once", async () => {
    await assertSucceeds(setDoc(doc(user("ann"), R + "g_1"), { zargo: 420, robustness: 0, sessions: 0 }));
  });
});

describe("Outsiders in Rack It: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "live", abMatch());
    await seed(M + "friendly", abMatch({ rated: false }));
    await seed(M + "pendA", abMatch({ status: "pending", endedBy: "ann", endedAt: 2 }));
    await seed(M + "pendNone", abMatch({ status: "pending", endedAt: 2 }));
    await seed(M + "doneAB", abMatch({ status: "done", rated: false, endedAt: 2 }));
    await seed(M + "ratedDone", abMatch({ status: "done", endedBy: "ann", ratedAt: 2, confirmedBy: "ben" }));
    await seed(R + "ann", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(R + "ben", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(R + "g_1", { zargo: 420, robustness: 0, sessions: 0 });
  });

  test("a match against someone you aren't connected to", async () => {
    await assertFails(setDoc(doc(user("ben"), M + "x"), abMatch({ by: "ben", playerA: "ben", playerB: "cat", uids: ["ben", "cat"] })));
    await assertFails(setDoc(doc(user("ben"), M + "x"), abMatch({ by: "ben", playerA: "ben", playerB: "ben", uids: ["ben", "ben"] })));
  });
  test("a match you aren't in: starting one, reading one, or listing someone else's", async () => {
    await assertFails(setDoc(doc(user("cat"), M + "x"), abMatch({ by: "cat" })));
    await assertFails(setDoc(doc(user("ann"), M + "x"), abMatch({ by: "ann", uids: ["ben"] })));
    await assertFails(setDoc(doc(user("ann"), M + "x"), abMatch({ by: "ben" })));
    await assertFails(getDoc(doc(user("cat"), M + "live")));
    await assertFails(getDoc(doc(user("cat"), M + "nothing-here")));
    await assertFails(getDocs(query(collection(user("cat"), "sidequests/rack-it/matches"), where("uids", "array-contains", "ann"))));
    await assertFails(updateDoc(doc(user("cat"), M + "live"), { turn: "b" }));
  });
  test("starting a match as anything but live, or already ended or confirmed", async () => {
    const db = user("ann");
    await assertFails(setDoc(doc(db, M + "x"), abMatch({ status: "pending", endedBy: "ann" })));
    await assertFails(setDoc(doc(db, M + "x"), abMatch({ status: "done" })));
    await assertFails(setDoc(doc(db, M + "x"), abMatch({ endedBy: "ben" })));
    await assertFails(setDoc(doc(db, M + "x"), abMatch({ confirmedBy: "ben", ratedAt: 2 })));
    await assertFails(updateDoc(doc(db, M + "live"), { status: "void" }));
  });
  test("changing uids or the players", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, M + "live"), { uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, M + "live"), { playerB: "cat" }));
    await assertFails(updateDoc(doc(db, M + "live"), { playerA: "cat" }));
    await assertFails(updateDoc(doc(db, M + "live"), { by: "ben" }));
    await assertFails(updateDoc(doc(db, M + "live"), { names: { a: "Ann", b: "Cat" } }));
    await assertFails(updateDoc(doc(db, M + "live"), { uids: deleteField() }));
  });
  test("confirming your own result: finishing it yourself", async () => {
    await assertFails(confirmBatch("ann", "pendA"));
    await assertFails(updateDoc(doc(user("ann"), M + "pendA"), { status: "done", ratedAt: 3, confirmedBy: "ann" }));
    await assertFails(updateDoc(doc(user("ann"), M + "live"), { status: "done", rated: true, endedBy: "ann", ratedAt: 3 }));
    await assertFails(updateDoc(doc(user("ann"), M + "live"), { status: "done", ratedAt: 3 }));
    if (await ratingOf("ann") !== 500) throw new Error("a refused confirm moved a rating");
  });
  test("confirming your own result: rewriting endedBy", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, M + "pendA"), { endedBy: "ben" }));
    await assertFails(updateDoc(doc(db, M + "pendA"), { endedBy: deleteField() }));
    await assertFails(updateDoc(doc(db, M + "live"), { status: "pending", endedBy: "ben" }));
    await assertFails(updateDoc(doc(db, M + "live"), { endedBy: "ben" }));
    await assertFails(updateDoc(doc(db, M + "live"), { status: "pending" }));
  });
  test("confirming your own result: reopening a pending match, or one nobody ended", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "pendA"), { status: "live" }));
    await assertFails(updateDoc(doc(user("ben"), M + "pendA"), { status: "live" }));
    await assertFails(updateDoc(doc(user("ann"), M + "pendA"), { status: "live", rated: false }));
    await assertFails(confirmBatch("ann", "pendNone"));
    await assertFails(confirmBatch("ben", "pendNone"));
  });
  test("rewriting the score of a pending match", async () => {
    await assertFails(updateDoc(doc(user("ben"), M + "pendA"), { totals: { a: 0, b: 9 } }));
    await assertFails(updateDoc(doc(user("ben"), M + "pendA"), { status: "done", rated: false, "racks.1": { balls: {} } }));
  });
  test("turning a friendly into a rated match", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "friendly"), { rated: true }));
    await assertFails(updateDoc(doc(user("ann"), M + "friendly"), { status: "pending", rated: true, endedBy: "ann" }));
    await assertFails(updateDoc(doc(user("ann"), M + "doneAB"), { rated: true }));
  });
  test("…and a household member can't either; only the owner rewrites a match", async () => {
    await assertFails(updateDoc(doc(as(MEMBER), M + "friendly"), { rated: true }));
    await assertFails(updateDoc(doc(as(MEMBER), M + "friendly"), { status: "pending", rated: true, endedBy: "member" }));
    await assertSucceeds(updateDoc(doc(as(OWNER), M + "doneAB"), { rated: true }));
  });
  test("changing or deleting a finished match", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "doneAB"), { totals: { a: 9, b: 0 } }));
    await assertFails(updateDoc(doc(user("ben"), M + "ratedDone"), { zargoAfter: { a: 1, b: 999 } }));
    await assertFails(deleteDoc(doc(user("ann"), M + "doneAB")));
    await assertFails(deleteDoc(doc(user("ann"), M + "live")));
  });
  test("a rating written outside a confirmation", async () => {
    await assertFails(setDoc(doc(user("ann"), R + "ann"), { zargo: 900 }, { merge: true }));
    await assertFails(setDoc(doc(user("ann"), R + "ben"), { zargo: 100 }, { merge: true }));
    await assertFails(setDoc(doc(user("ben"), R + "ben"), { zargo: 900, match: "pendA" }, { merge: true }));
    await assertFails(confirmBatch("ben", "pendA", { match: false }));
    await assertFails(setDoc(doc(user("ben"), R + "ben"), { zargo: 900, match: "ratedDone" }, { merge: true }));
    await assertFails(deleteDoc(doc(user("ann"), R + "ann")));
  });
  test("a rating written in a Withdraw or Not right batch", async () => {
    for (const [who, field] of [["ann", "withdrawnBy"], ["ben", "declinedBy"]]){
      const db = user(who), b = writeBatch(db);
      b.set(doc(db, R + who), { zargo: 900, match: "pendA" }, { merge: true });
      b.update(doc(db, M + "pendA"), { status: "done", rated: false, [field]: who });
      await assertFails(b.commit());
    }
  });
  test("a rating for a player who isn't in that match", async () => {
    await assertFails(confirmBatch("ben", "pendA", { ratings: ["ann", "ben", "cat"] }));
    if (await ratingOf("ann") !== 500) throw new Error("a refused batch moved a rating");
  });
  test("a guest starter over one that exists, or for someone else's guest", async () => {
    await assertFails(setDoc(doc(user("ann"), R + "g_1"), { zargo: 900 }));
    await assertFails(setDoc(doc(user("ben"), R + "g_2"), { zargo: 900 }));
  });
  test("listing ratings or matches without the uids filter", async () => {
    const db = user("ann");
    await assertFails(getDocs(collection(db, "sidequests/rack-it/ratings")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/matches")));
    await assertFails(getDocs(query(collection(db, "sidequests/rack-it/matches"), where("status", "==", "live"))));
  });
  test("anything else under /sidequests/", async () => {
    const db = user("ann");
    await assertFails(getDoc(doc(db, "sidequests/bloc-11/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(setDoc(doc(db, "sidequests/_shared/people/p9"), { name: "Ann" }));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/starters/s1")));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/starters/g_1"), { zargo: 420 }));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/state/main"), { config: {} }));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/state/other")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/state")));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/elsewhere/x")));
    await assertFails(getDoc(doc(db, "members/ann@gmail.com")));
  });
});

// ---- Session 6b: one admin, everyone else a player (KIT-PLAN.md) ----
// In Rack It the owner is the one admin and sees every match. A member who isn't the owner
// (MEMBER: Melanie) is a player like Ann or Ben: her own matches, read with the uids filter, and
// nothing of the household's. Other apps keep the household (the first block above).

const om = (extra = {}) => abMatch({ playerA: "owner", playerB: "member", names: { a: "Owner", b: "Member" },
  uids: ["owner", "member"], by: "owner", ...extra });

describe("One admin: a member who isn't the owner must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/member_owner", { uids: ["member", "owner"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "om", om());
    await seed(M + "omDone", om({ status: "done", rated: false, endedAt: 2 }));
    await seed(M + "omRated", om({ status: "done", endedBy: "owner", ratedAt: 2, confirmedBy: "member" }));
    await seed(M + "oa", abMatch({ playerA: "owner", playerB: "ann", uids: ["owner", "ann"], by: "owner", status: "done", rated: false }));
    await seed(R + "member", { zargo: 330, robustness: 40, sessions: 20 });
  });

  test("reading or listing a match she isn't in", async () => {
    const db = as(MEMBER), col = collection(db, "sidequests/rack-it/matches");
    await assertFails(getDoc(doc(db, M + "oa")));
    await assertFails(getDoc(doc(db, M + "done1")));     // from before 2.8.0: no uids
    await assertFails(getDocs(col));
    await assertFails(getDocs(query(col, orderBy("startedAt", "desc"), limit(300))));
    await assertFails(getDocs(query(col, where("uids", "array-contains", "ann"))));
  });
  test("starting or scoring a match the household way: no uids, or one she isn't in", async () => {
    const db = as(MEMBER);
    await assertFails(setDoc(doc(db, M + "new1"), { status: "live" }));
    await assertFails(setDoc(doc(db, M + "new2"), om({ by: "member", uids: ["owner"] })));
    await assertFails(updateDoc(doc(db, M + "live1"), { status: "done" }));
    await assertFails(updateDoc(doc(db, M + "oa"), { totals: { a: 0, b: 9 } }));
  });
  test("listing ratings or starters, or reading a starter", async () => {
    const db = as(MEMBER);
    await assertFails(getDocs(collection(db, "sidequests/rack-it/ratings")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/starters")));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/starters/s1")));
  });
  test("writing state/main, a starter, or any rating outside a confirmation", async () => {
    const db = as(MEMBER);
    await assertFails(setDoc(doc(db, "sidequests/rack-it/state/main"), { config: {} }));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/starters/s2"), { zargo: 420 }));
    await assertFails(updateDoc(doc(db, "sidequests/rack-it/starters/s1"), { zargo: 900 }));
    await assertFails(setDoc(doc(db, R + "member"), { zargo: 900 }, { merge: true }));
    await assertFails(setDoc(doc(db, R + "r1"), { zargo: 900 }, { merge: true }));
    await assertFails(setDoc(doc(db, R + "new"), { zargo: 900, robustness: 0, sessions: 0 }));
    await assertFails(deleteDoc(doc(db, R + "r1")));
  });
  test("changing a saved match, even one she's in", async () => {
    const db = as(MEMBER);
    await assertFails(updateDoc(doc(db, M + "omDone"), { totals: { a: 0, b: 9 } }));
    await assertFails(updateDoc(doc(db, M + "omDone"), { status: "live" }));
    await assertFails(updateDoc(doc(db, M + "omRated"), { zargoAfter: { a: 1, b: 999 } }));
    await assertFails(updateDoc(doc(db, M + "done1"), { uids: ["member"] }));
    await assertFails(deleteDoc(doc(db, M + "omDone")));
  });
});

describe("One admin: what the owner and a member may do", () => {
  beforeEach(async () => {
    await seed("friendships/member_owner", { uids: ["member", "owner"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "om", om());
    await seed(M + "omPendO", om({ status: "pending", endedBy: "owner", endedAt: 2 }));
    await seed(M + "omPendM", om({ status: "pending", endedBy: "member", endedAt: 2 }));
    await seed(M + "oa", abMatch({ playerA: "owner", playerB: "ann", uids: ["owner", "ann"], by: "owner", status: "done", rated: false }));
    await seed(R + "owner", { zargo: 505, robustness: 90, sessions: 30 });
    await seed(R + "member", { zargo: 330, robustness: 40, sessions: 20 });
  });

  test("the owner reads, lists and rewrites every match, and lists ratings and starters", async () => {
    const db = as(OWNER), col = collection(db, "sidequests/rack-it/matches");
    await assertSucceeds(getDoc(doc(db, M + "oa")));
    await assertSucceeds(getDoc(doc(db, M + "done1")));
    await assertSucceeds(getDocs(col));
    await assertSucceeds(getDocs(query(col, orderBy("startedAt", "desc"), limit(300))));
    await assertSucceeds(updateDoc(doc(db, M + "oa"), { zargoAfter: { a: 1, b: 2 } }));
    await assertSucceeds(getDocs(collection(db, "sidequests/rack-it/ratings")));
    await assertSucceeds(getDocs(collection(db, "sidequests/rack-it/starters")));
    await assertSucceeds(setDoc(doc(db, "sidequests/rack-it/starters/s2"), { zargo: 420 }));
    await assertSucceeds(setDoc(doc(db, R + "member"), { zargo: 332 }, { merge: true }));
    await assertSucceeds(deleteDoc(doc(db, M + "oa")));
  });
  test("the owner's backfill gives a match from before 2.8.0 its uids, names and resolved players", async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), M + "done1"), { uids: ["owner", "member"], names: { a: "Owner", b: "Member" },
      playerA: "owner", playerB: "member" }));
    await assertSucceeds(getDoc(doc(as(MEMBER), M + "done1")));
  });
  test("a member reads and lists her own matches with the uids filter", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDoc(doc(db, M + "om")));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/rack-it/matches"), where("uids", "array-contains", "member"))));
    await assertSucceeds(getDoc(doc(db, R + "owner")));
    await assertSucceeds(getDoc(doc(db, "sidequests/rack-it/state/main")));
  });
  test("a member plays as an outsider does: starts, scores, saves rated as pending", async () => {
    const db = as(MEMBER);
    await assertSucceeds(setDoc(doc(db, M + "m1"), om({ by: "member", playerA: "member", playerB: "owner", uids: ["member", "owner"] })));
    await assertSucceeds(setDoc(doc(db, M + "m2"), om({ by: "member", playerA: "member", playerB: "g_1", uids: ["member"], rated: false })));
    await assertSucceeds(updateDoc(doc(db, M + "om"), { "racks.1": { balls: { 1: "a" } }, totals: { a: 1, b: 0 } }));
    await assertSucceeds(updateDoc(doc(db, M + "om"), { status: "pending", endedBy: "member", endedAt: 3 }));
  });
  test("a member confirms the owner's rated match, both ratings in the batch", async () => {
    const db = as(MEMBER), b = writeBatch(db);
    for (const pid of ["owner", "member"]) b.set(doc(db, R + pid), { zargo: 400, match: "omPendO" }, { merge: true });
    b.update(doc(db, M + "omPendO"), { status: "done", zargoBefore: { a: 505, b: 330 }, zargoAfter: { a: 500, b: 335 }, ratedAt: 3, confirmedBy: "member" });
    await assertSucceeds(b.commit());
  });
  test("a member declines and withdraws: it stands as a friendly", async () => {
    await assertSucceeds(updateDoc(doc(as(MEMBER), M + "omPendO"), { status: "done", rated: false, declinedBy: "member" }));
    await assertSucceeds(updateDoc(doc(as(MEMBER), M + "omPendM"), { status: "done", rated: false, withdrawnBy: "member" }));
  });
  test("a member still reads and writes the other apps, and invites", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDoc(doc(db, "sidequests/bloc-11/state/main")));
    await assertSucceeds(getDocs(collection(db, "sidequests/_shared/people")));
    await assertSucceeds(setDoc(doc(db, "sidequests/_shared/people/p2"), { name: "Eve" }));
    await assertSucceeds(setDoc(doc(db, "members", "new@example.com"), { addedBy: MEMBER }));
  });
});

// ---- The open rule (KIT-PLAN Session 7 step 4): Zombie Dice, then every app named in OPEN ----
// Anyone signed in uses the app; each record names its players, and only they (and the owner)
// reach it. A record carries players (ids, at most 8), names, uids (the accounts in it) and by.
const ZD = "sidequests/zombie-dice/games/";
const zd = (extra = {}) => ({ game: "zombie-dice", players: ["ann", "cat"], names: ["Ann", "Cat"], uids: ["ann", "cat"],
  by: "ann", scores: { ann: 0, cat: 0 }, status: "live", seats: ["ann", "cat"], turn: 0, ...extra });

describe("The open rule: what anyone signed in may do (Zombie Dice)", () => {
  beforeEach(async () => {
    await seed(ZD + "ac", zd());                                        // Ann and Cat are connected (ann_cat)
    await seed(ZD + "old", { players: ["p1"], scores: { p1: 3 } });     // from before the open rule: no uids
  });

  test("starts a game alone with a guest, or with a friend", async () => {
    const db = user("ann");
    await assertSucceeds(setDoc(doc(db, ZD + "g1"), zd({ players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"] })));
    await assertSucceeds(setDoc(doc(db, ZD + "f1"), zd()));
  });
  test("starts an eight-player game with seven friends", async () => {
    const seven = ["f1", "f2", "f3", "f4", "f5", "f6", "f7"];
    for (const f of seven) await seed(`friendships/${["ann", f].sort().join("_")}`, { uids: ["ann", f].sort(), since: 1, via: "x", app: "zombie-dice" });
    const all = ["ann", ...seven];
    await assertSucceeds(setDoc(doc(user("ann"), ZD + "eight"), zd({ players: all, names: all, uids: all, seats: all })));
  });
  test("gets a game they're in, and lists theirs with the uids filter", async () => {
    const db = user("cat");
    await assertSucceeds(getDoc(doc(db, ZD + "ac")));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/zombie-dice/games"), where("uids", "array-contains", "cat"))));
  });
  test("any player in it plays on: scores, turns, the finish", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), ZD + "ac"), { "scores.ann": 5, turn: 1 }));
    await assertSucceeds(updateDoc(doc(user("cat"), ZD + "ac"), { "scores.cat": 13, status: "done", winner: "cat" }));
  });
  test("whoever started it deletes it", async () => {
    await assertSucceeds(deleteDoc(doc(user("ann"), ZD + "ac")));
  });
  test("the owner reads, lists bare, backfills and deletes every game", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDoc(doc(db, ZD + "ac")));
    await assertSucceeds(getDocs(collection(db, "sidequests/zombie-dice/games")));
    await assertSucceeds(updateDoc(doc(db, ZD + "old"), { players: ["owner"], names: ["Owner"], uids: ["owner"], by: "owner" }));
    await assertSucceeds(setDoc(doc(db, ZD + "om"), zd({ players: ["owner", "member"], names: ["O", "M"], uids: ["owner", "member"], by: "owner" })));
    await assertSucceeds(deleteDoc(doc(db, ZD + "ac")));
  });
  test("a household member who isn't the owner plays like anyone: her own games only", async () => {
    await seed(ZD + "om", zd({ players: ["owner", "member"], names: ["O", "M"], uids: ["owner", "member"], by: "owner" }));
    const db = as(MEMBER);
    await assertSucceeds(getDoc(doc(db, ZD + "om")));
    await assertSucceeds(setDoc(doc(db, ZD + "m1"), zd({ players: ["member", "g_2"], names: ["M", "G"], uids: ["member"], by: "member" })));
  });
});

describe("The open rule: must refuse", () => {
  beforeEach(async () => {
    await seed(ZD + "ac", zd());
    await seed(ZD + "old", { players: ["p1"], scores: { p1: 3 } });
  });

  test("a stranger reading, listing or changing a game they aren't in", async () => {
    const db = user("ben"), col = collection(db, "sidequests/zombie-dice/games");
    await assertFails(getDoc(doc(db, ZD + "ac")));
    await assertFails(getDoc(doc(db, ZD + "old")));
    await assertFails(getDocs(col));
    await assertFails(getDocs(query(col, where("uids", "array-contains", "ann"))));
    await assertFails(updateDoc(doc(db, ZD + "ac"), { "scores.ben": 1 }));
    await assertFails(deleteDoc(doc(db, ZD + "ac")));
  });
  test("starting a game that names an account you aren't connected to", async () => {
    await assertFails(setDoc(doc(user("ann"), ZD + "x"), zd({ players: ["ann", "ben"], names: ["Ann", "Ben"], uids: ["ann", "ben"] })));
  });
  test("starting a game as someone else, without yourself, or with an account that isn't playing", async () => {
    const db = user("ann");
    await assertFails(setDoc(doc(db, ZD + "x1"), zd({ by: "cat" })));
    await assertFails(setDoc(doc(db, ZD + "x2"), zd({ players: ["cat", "g_1"], uids: ["cat"] })));
    await assertFails(setDoc(doc(db, ZD + "x3"), zd({ players: ["ann", "g_1"], uids: ["ann", "cat"] })));
  });
  test("starting a game with no names, or with more than eight players", async () => {
    const db = user("ann"), nine = ["ann", "g_1", "g_2", "g_3", "g_4", "g_5", "g_6", "g_7", "g_8"];
    const { names, ...noNames } = zd();
    await assertFails(setDoc(doc(db, ZD + "x4"), noNames));
    await assertFails(setDoc(doc(db, ZD + "x5"), zd({ players: nine, names: nine, uids: ["ann"] })));
  });
  test("a player changing who's in it: uids, players or by", async () => {
    const db = user("cat");
    await assertFails(updateDoc(doc(db, ZD + "ac"), { uids: ["ann", "cat", "ben"] }));
    await assertFails(updateDoc(doc(db, ZD + "ac"), { players: ["ann", "cat", "g_9"] }));
    await assertFails(updateDoc(doc(db, ZD + "ac"), { by: "cat" }));
  });
  test("a player who didn't start it deleting it", async () => {
    await assertFails(deleteDoc(doc(user("cat"), ZD + "ac")));
  });
  test("a household member who isn't the owner listing bare, or reading a game she isn't in", async () => {
    const db = as(MEMBER);
    await assertFails(getDocs(collection(db, "sidequests/zombie-dice/games")));
    await assertFails(getDoc(doc(db, ZD + "ac")));
    await assertFails(getDoc(doc(db, ZD + "old")));
    await assertFails(setDoc(doc(db, ZD + "old"), { players: ["member"] }, { merge: true }));
  });
  test("anything under an open app but its records", async () => {
    await assertFails(setDoc(doc(user("ann"), "sidequests/zombie-dice/state/main"), { players: ["ann"], names: ["Ann"], uids: ["ann"], by: "ann" }));
    await assertFails(getDoc(doc(as(MEMBER), "sidequests/zombie-dice/state/main")));
  });
});
