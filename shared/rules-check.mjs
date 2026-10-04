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
    await setDoc(doc(db, "sidequests/any-app/state/main"), { n: 1 });
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

// There is no household tier (Session 9 step 4): a member who isn't the owner is an account like any
// other. /members holds the owner's role; each account may ask for its own document (cloud.role()).
describe("a member who isn't the owner", () => {
  test("gets her own /members document, and anyone signed in asks for theirs", async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), "members", MEMBER)));
    await assertSucceeds(getDoc(doc(as(STRANGER), "members", STRANGER)));
  });
  test("refused: listing /members, reading someone else's, inviting anyone", async () => {
    const db = as(MEMBER);
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(getDoc(doc(db, "members", OWNER)));
    await assertFails(setDoc(doc(db, "members", "new@example.com"), { addedBy: MEMBER }));
  });
  test("refused: reading or writing sidequests/ the household way, the shared people included", async () => {
    const db = as(MEMBER);
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(setDoc(doc(db, "sidequests/any-app/climbs/c1"), { grade: 5 }));
    await assertFails(setDoc(doc(db, "sidequests/_shared/people/p9"), { name: "Eve" }));
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
  test("reaches all of sidequests/: an old app's data and the household people", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertSucceeds(getDocs(collection(db, "sidequests/_shared/people")));
    await assertSucceeds(setDoc(doc(db, "sidequests/_shared/people/p2"), { name: "Eve" }));
    await assertSucceeds(getDocs(collection(db, "members")));
  });
});

describe("signed in, not on /members", () => {
  test("refused: reading anything under sidequests/", async () => {
    const db = as(STRANGER);
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/matches")));
  });
  test("refused: writing anything under sidequests/", async () => {
    const db = as(STRANGER);
    await assertFails(setDoc(doc(db, "sidequests/any-app/climbs/c1"), { grade: 5 }));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/matches/new1"), { status: "live" }));
  });
  test("refused: listing /members, reading someone else's entry, and adding themselves", async () => {
    const db = as(STRANGER);
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(getDoc(doc(db, "members", MEMBER)));
    await assertFails(setDoc(doc(db, "members", STRANGER), {}));
  });
  test("refused: a member's email with email_verified false", async () => {
    const db = env.authenticatedContext("fake", { email: MEMBER, email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
  });
});

describe("signed out", () => {
  test("refused: everything", async () => {
    const db = signedOut();
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertFails(getDocs(collection(db, "members")));
    await assertFails(setDoc(doc(db, "sidequests/any-app/climbs/c1"), { grade: 5 }));
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
    await assertSucceeds(updateDoc(m, { status: "done", zargoAfter: { a: 510, b: 490 }, rev: link(1, "k1", "") }));
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
    await assertSucceeds(updateDoc(doc(as(OWNER), m), { status: "pending", endedBy: "owner", rated: true, rev: link(1, "k1", "") }));
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
    await assertSucceeds(updateDoc(doc(db, M + "live"), { "racks.1": { balls: { 1: "a" } }, turn: "b", totals: { a: 1, b: 0 }, rev: link(1, "k1", "") }));
    await assertSucceeds(updateDoc(doc(db, M + "live"), { "racks.1": { balls: { 1: "a", 2: "b" } }, rev: link(2, "k2", "k1") }));
    await assertSucceeds(updateDoc(doc(db, M + "friendly"), { status: "discarded", endedAt: 3, rev: link(1, "k1", "") }));
  });
  test("saves a friendly as done, and a rated match as pending with themselves as endedBy", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "friendly"), { status: "done", rated: false, endedAt: 3, totals: { a: 5, b: 3 }, rev: link(1, "k1", "") }));
    await assertSucceeds(updateDoc(doc(user("ann"), M + "live"), { status: "pending", rated: true, endedBy: "ann", endedAt: 3, rev: link(1, "k1", "") }));
  });
  test("a rated match saved as a friendly instead", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "live"), { status: "done", rated: false, endedAt: 3, rev: link(1, "k1", "") }));
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
    // Cat is Ann's friend, so since Session 8 she may get Ann's live match by its id (a Game QR);
    // Eve, connected to nobody, may not.
    await assertFails(getDoc(doc(user("eve"), M + "live")));
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
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ uids: ["ann", "cat"] }, rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ playerB: "cat" }, rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ playerA: "cat" }, rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ by: "ben" }, rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ names: { a: "Ann", b: "Cat" } }, rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(db, M + "live"), { ...{ uids: deleteField() }, rev: link(1, "k1", "") }));
  });
  test("confirming your own result: finishing it yourself", async () => {
    await assertFails(confirmBatch("ann", "pendA"));
    await assertFails(updateDoc(doc(user("ann"), M + "pendA"), { status: "done", ratedAt: 3, confirmedBy: "ann" }));
    await assertFails(updateDoc(doc(user("ann"), M + "live"), { status: "done", rated: true, endedBy: "ann", ratedAt: 3 }));
    await assertFails(updateDoc(doc(user("ann"), M + "live"), { status: "done", ratedAt: 3 }));
    if (await ratingOf("ann") !== 500) throw new Error("a refused confirm moved a rating");
  });
  test("confirming your own result: a rated match with one account, against a guest", async () => {
    await seed(M + "pendGuest", abMatch({ playerB: "g_1", names: { a: "Ann", b: "Dan" }, uids: ["ann"], status: "pending", endedBy: "ann", endedAt: 2 }));
    await assertFails(confirmBatch("ann", "pendGuest", { ratings: ["ann"] }));
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
    await assertFails(updateDoc(doc(user("ann"), M + "friendly"), { rated: true , rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(user("ann"), M + "friendly"), { status: "pending", rated: true, endedBy: "ann" , rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(user("ann"), M + "doneAB"), { rated: true }));
  });
  test("…and a household member can't either; only the owner rewrites a match", async () => {
    await assertFails(updateDoc(doc(as(MEMBER), M + "friendly"), { rated: true , rev: link(1, "k1", "") }));
    await assertFails(updateDoc(doc(as(MEMBER), M + "friendly"), { status: "pending", rated: true, endedBy: "member" , rev: link(1, "k1", "") }));
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
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(setDoc(doc(db, "sidequests/_shared/people/p9"), { name: "Ann" }));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/starters/s1")));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/starters/g_1"), { zargo: 420 }));
    await assertFails(setDoc(doc(db, "sidequests/rack-it/state/main"), { config: {} }));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/state/other")));
    await assertFails(getDocs(collection(db, "sidequests/rack-it/state")));
    await assertFails(getDoc(doc(db, "sidequests/rack-it/elsewhere/x")));
    await assertFails(getDoc(doc(db, "members/" + OWNER)));   // her own she may ask for (cloud.role())
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
    await assertSucceeds(updateDoc(doc(db, M + "om"), { "racks.1": { balls: { 1: "a" } }, totals: { a: 1, b: 0 }, rev: link(1, "k1", "") }));
    await assertSucceeds(updateDoc(doc(db, M + "om"), { status: "pending", endedBy: "member", endedAt: 3, rev: link(2, "k2", "k1") }));
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
  test("refused: a member reaching the other apps or the household people, or inviting", async () => {
    const db = as(MEMBER);
    await assertFails(getDoc(doc(db, "sidequests/any-app/state/main")));
    await assertFails(getDocs(collection(db, "sidequests/_shared/people")));
    await assertFails(setDoc(doc(db, "sidequests/_shared/people/p2"), { name: "Eve" }));
    await assertFails(setDoc(doc(db, "members", "new@example.com"), { addedBy: MEMBER }));
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

// ---- Every app on the open rule (Session 9 step 4) ----
// Read from openApps() in the rules, so an app /sidequest adds to the list has these cases with no
// other edit: anyone keeps a record of their own in each of its collections, and nobody else reaches it.
const OPEN_LIST = (() => {
  const m = fs.readFileSync(new URL("./firestore.rules", import.meta.url), "utf8").match(/function openApps\(\)\s*\{\s*return\s*\{([\s\S]*?)\};/);
  const out = {};
  if (m) for (const [, app, list] of m[1].matchAll(/'([\w-]+)'\s*:\s*\[([^\]]*)\]/g)) out[app] = [...list.matchAll(/'([\w-]+)'/g)].map(x => x[1]);
  return out;
})();
for (const [app, colls] of Object.entries(OPEN_LIST)) describe(`Every open app: ${app}`, () => {
  const own = { players: ["ann"], names: ["Ann"], uids: ["ann"], by: "ann", at: 1 };
  for (const coll of colls){
    const path = `sidequests/${app}/${coll}/`;
    test(`${coll}: anyone signed in saves a record with themselves in it, gets it and lists theirs`, async () => {
      const db = user("ann");
      await assertSucceeds(setDoc(doc(db, path + "r1"), own));
      await assertSucceeds(getDoc(doc(db, path + "r1")));
      await assertSucceeds(getDocs(query(collection(db, `sidequests/${app}/${coll}`), where("uids", "array-contains", "ann"))));
    });
    test(`${coll}: refused: someone else getting it, anyone listing bare, a record as someone else`, async () => {
      await seed(path + "r1", own);
      await assertFails(getDoc(doc(user("ben"), path + "r1")));
      await assertFails(getDocs(collection(user("ann"), `sidequests/${app}/${coll}`)));
      await assertFails(getDocs(collection(as(MEMBER), `sidequests/${app}/${coll}`)));
      await assertFails(setDoc(doc(user("ben"), path + "r2"), own));
    });
  }
});

// ---- Around the Clock on the open rule (Session 7 step 5) ----
const AC = "sidequests/around-the-clock/games/";
const atc = (extra = {}) => ({ game: "atc180", players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"], by: "ann",
  throws: { ann: [], g_1: [] }, scores: { ann: 0, g_1: 0 }, turn: 0, log: [], direction: "up", at: 1, status: "live", ...extra });

describe("The open rule: Around the Clock", () => {
  beforeEach(async () => {
    await seed(AC + "ac", atc({ players: ["ann", "cat"], names: ["Ann", "Cat"], uids: ["ann", "cat"], throws: { ann: [], cat: [] } }));
    await seed(AC + "old", { player: "p1", darts: [3, 1, 0], at: 1 });
    await seed("sidequests/around-the-clock/state/main", { direction: "up", players: { p1: { name: "Ann" } } });
  });

  test("anyone signed in starts a game with a guest or a friend, plays it, and lists theirs", async () => {
    const db = user("ann");
    await assertSucceeds(setDoc(doc(db, AC + "g1"), atc()));
    await assertSucceeds(setDoc(doc(db, AC + "f1"), atc({ players: ["ann", "cat"], names: ["Ann", "Cat"], uids: ["ann", "cat"] })));
    await assertSucceeds(updateDoc(doc(user("cat"), AC + "ac"), { "throws.cat": [3], turn: 1, log: [1] }));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/around-the-clock/games"), where("uids", "array-contains", "ann"))));
  });
  test("the owner reads every game, backfills an old one and keeps state/main", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, "sidequests/around-the-clock/games")));
    await assertSucceeds(updateDoc(doc(db, AC + "old"), { players: ["owner"], throws: { owner: [3, 1, 0] }, names: ["Owner"], uids: ["owner"], by: "owner" }));
    await assertSucceeds(getDoc(doc(db, "sidequests/around-the-clock/state/main")));
  });
  test("refused: a stranger reading or changing a game, a member listing bare, anyone but the owner on state/main", async () => {
    await assertFails(getDoc(doc(user("ben"), AC + "ac")));
    await assertFails(updateDoc(doc(user("ben"), AC + "ac"), { "throws.ben": [3] }));
    await assertFails(getDocs(collection(as(MEMBER), "sidequests/around-the-clock/games")));
    await assertFails(getDoc(doc(as(MEMBER), AC + "old")));
    await assertFails(getDoc(doc(as(MEMBER), "sidequests/around-the-clock/state/main")));
    await assertFails(setDoc(doc(user("ann"), "sidequests/around-the-clock/state/main"), { direction: "down" }));
  });
  test("refused: a game naming someone you aren't connected to, or a player changing who's in it", async () => {
    await assertFails(setDoc(doc(user("ann"), AC + "x"), atc({ players: ["ann", "ben"], names: ["Ann", "Ben"], uids: ["ann", "ben"] })));
    await assertFails(updateDoc(doc(user("cat"), AC + "ac"), { players: ["ann", "cat", "g_2"] }));
  });
});

// ---- Bloc 11 on the open rule (Session 9 step 1) ----
// A climb's players is its one climber. You log for yourself and for your guests: a guest's climb
// has you in uids, since a guest has no account and the climb must still be yours to read.
const BC = "sidequests/bloc-11/climbs/";
const climb = (extra = {}) => ({ climber: "ann", players: ["ann"], names: ["Ann"], uids: ["ann"], by: "ann",
  grade: 5, result: "sent", note: "", at: 1, ...extra });

describe("The open rule: Bloc 11", () => {
  beforeEach(async () => {
    await seed(BC + "mine", climb());
    await seed(BC + "old", { climber: "p1", grade: 3, result: "sent", note: "", at: 1, by: OWNER });
    await seed("sidequests/bloc-11/state/main", { climbers: { p1: { name: "Ann" } } });
  });

  test("anyone signed in logs a climb for themselves or their guest, edits its note, lists theirs, deletes their own", async () => {
    const db = user("ann");
    await assertSucceeds(setDoc(doc(db, BC + "c1"), climb()));
    await assertSucceeds(setDoc(doc(db, BC + "c2"), climb({ climber: "g_1", players: ["g_1"], names: ["Dan"], uids: ["ann"] })));
    await assertSucceeds(updateDoc(doc(db, BC + "mine"), { note: "the cave one" }));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/bloc-11/climbs"), where("uids", "array-contains", "ann"))));
    await assertSucceeds(deleteDoc(doc(db, BC + "mine")));
  });
  test("the owner reads every climb, backfills an old one, logs for someone with no account, and keeps state/main", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, "sidequests/bloc-11/climbs")));
    await assertSucceeds(updateDoc(doc(db, BC + "old"), { players: ["p1"], names: ["Ann"], uids: [], by: "owner" }));
    await assertSucceeds(setDoc(doc(db, BC + "o1"), climb({ climber: "p1", players: ["p1"], names: ["Ann"], uids: ["owner"], by: "owner" })));
    await assertSucceeds(getDoc(doc(db, "sidequests/bloc-11/state/main")));
  });
  test("refused: a stranger reading, changing or deleting a climb, a member listing bare, anyone but the owner on state/main", async () => {
    await assertFails(getDoc(doc(user("ben"), BC + "mine")));
    await assertFails(updateDoc(doc(user("ben"), BC + "mine"), { note: "x" }));
    await assertFails(deleteDoc(doc(user("ben"), BC + "mine")));
    await assertFails(getDocs(collection(as(MEMBER), "sidequests/bloc-11/climbs")));
    await assertFails(getDoc(doc(as(MEMBER), BC + "old")));
    await assertFails(getDoc(doc(as(MEMBER), "sidequests/bloc-11/state/main")));
    await assertFails(setDoc(doc(user("ann"), "sidequests/bloc-11/state/main"), { climbers: {} }));
  });
  test("refused: a climb naming someone you aren't connected to, a guest's climb without you, or changing whose it is", async () => {
    const db = user("ann");
    await assertFails(setDoc(doc(db, BC + "x1"), climb({ climber: "ben", players: ["ben"], names: ["Ben"], uids: ["ann", "ben"] })));
    await assertFails(setDoc(doc(db, BC + "x2"), climb({ climber: "g_1", players: ["g_1"], names: ["Dan"], uids: [] })));
    await assertFails(setDoc(doc(db, BC + "x3"), climb({ by: "cat" })));
    await assertFails(updateDoc(doc(db, BC + "mine"), { players: ["cat"] }));
  });
});

// ---- Photo Coach on the open rule (Session 9 step 2) ----
// One person's practice log, open to anyone signed in. Its four collections are all open, and each
// document names its owner as its one player: a photo, its full-size image, a batch, a review.
const PC = "sidequests/photo-coach/";
const mineAs = (uid, extra = {}) => ({ players: [uid], names: [uid], uids: [uid], by: uid, ...extra });

describe("The open rule: Photo Coach", () => {
  beforeEach(async () => {
    await seed(PC + "photos/mine", mineAs("ann", { walk: "Sea Point", addedAt: 1, thumb: "t", critiques: [] }));
    await seed(PC + "images/mine", mineAs("ann", { data: "d" }));
    await seed(PC + "reviews/mine", mineAs("ann", { at: 1, ai: "Claude", reply: "r" }));
    await seed(PC + "photos/old", { walk: "Bo-Kaap", addedAt: 1, thumb: "t", critiques: [] });
    await seed(PC + "images/old", { data: "d" });
  });

  test("anyone signed in adds a photo and its image, saves feedback, a batch and a review, lists theirs, deletes their own", async () => {
    const db = user("ann"), mine = where("uids", "array-contains", "ann");
    await assertSucceeds(setDoc(doc(db, PC + "images/p1"), mineAs("ann", { data: "d" })));
    await assertSucceeds(setDoc(doc(db, PC + "photos/p1"), mineAs("ann", { walk: "Sea Point", addedAt: 2, thumb: "t", critiques: [] })));
    await assertSucceeds(updateDoc(doc(db, PC + "photos/mine"), { critiques: [{ id: "c1", kind: "critique", reply: "r" }] }));
    await assertSucceeds(setDoc(doc(db, PC + "batches/b1"), mineAs("ann", { at: 2, ai: "Claude", photoIds: ["mine"], reply: "r" })));
    await assertSucceeds(setDoc(doc(db, PC + "reviews/r1"), mineAs("ann", { at: 2, ai: "Claude", reply: "r" })));
    await assertSucceeds(getDoc(doc(db, PC + "images/mine")));
    for (const c of ["photos", "batches", "reviews"]) await assertSucceeds(getDocs(query(collection(db, PC + c), mine)));
    await assertSucceeds(deleteDoc(doc(db, PC + "images/mine")));
    await assertSucceeds(deleteDoc(doc(db, PC + "photos/mine")));
  });
  test("the owner reads and lists everything, and backfills an old photo and its image", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, PC + "photos")));
    await assertSucceeds(getDoc(doc(db, PC + "images/mine")));
    await assertSucceeds(updateDoc(doc(db, PC + "photos/old"), mineAs("owner")));
    await assertSucceeds(updateDoc(doc(db, PC + "images/old"), mineAs("owner")));
  });
  test("refused: a stranger reading or changing a photo, its image or a review; a member listing bare or reading an old one", async () => {
    const db = user("ben");
    await assertFails(getDoc(doc(db, PC + "photos/mine")));
    await assertFails(getDoc(doc(db, PC + "images/mine")));
    await assertFails(getDoc(doc(db, PC + "reviews/mine")));
    await assertFails(updateDoc(doc(db, PC + "photos/mine"), { note: "x" }));
    await assertFails(deleteDoc(doc(db, PC + "images/mine")));
    await assertFails(getDocs(collection(db, PC + "photos")));
    await assertFails(getDocs(collection(as(MEMBER), PC + "photos")));
    await assertFails(getDoc(doc(as(MEMBER), PC + "images/old")));
  });
  test("refused: a photo naming another account, or anything outside the four collections", async () => {
    const db = user("ann");
    await assertFails(setDoc(doc(db, PC + "photos/x1"), { ...mineAs("ann"), uids: ["ann", "cat"] }));
    await assertFails(setDoc(doc(db, PC + "other/x2"), mineAs("ann")));
  });
});

// ---- Zombie Dice on several phones: the Game QR in an open app (Session 9 step 3) ----
// As Rack It's seats (Session 8 step 2): someone connected to whoever started a live game gets it
// by id (never a list) and takes one guest's seat through openSwap(). Nothing polices whose turn it
// is: nothing rated rides on a turn.
describe("Game QR in an open app: what may be done", () => {
  beforeEach(async () => {
    await seed(ZD + "seat", zd({ players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"], seats: ["ann", "g_1"], scores: { ann: 4, g_1: 2 } }));
  });
  test("a friend of the starter gets a live game by id and takes a guest's seat, scores and all", async () => {
    const db = user("cat");
    await assertSucceeds(getDoc(doc(db, ZD + "seat")));
    await assertSucceeds(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "cat"], seats: ["ann", "cat"], scores: { ann: 4, cat: 2 }, uids: ["ann", "cat"] }));
    await assertSucceeds(updateDoc(doc(db, ZD + "seat"), { "phones.cat": { at: 1 }, turn: 1 }));
  });
});

describe("Game QR in an open app: must refuse", () => {
  beforeEach(async () => {
    await seed(ZD + "seat", zd({ players: ["ann", "g_1", "g_2"], names: ["Ann", "Dan", "Eve"], uids: ["ann"], seats: ["ann", "g_1", "g_2"] }));
    await seed(ZD + "over", zd({ players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"], seats: ["ann", "g_1"], status: "done" }));
    await seed(BC + "annc", climb());
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "zombie-dice" });
  });
  test("someone not connected to the starter getting the game or taking a seat", async () => {
    const db = user("ben");
    await assertFails(getDoc(doc(db, ZD + "seat")));
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "ben", "g_2"], uids: ["ann", "ben"] }));
  });
  test("a friend listing games, getting a finished one, or a climb", async () => {
    const db = user("cat");
    await assertFails(getDocs(collection(db, "sidequests/zombie-dice/games")));
    await assertFails(getDoc(doc(db, ZD + "over")));
    await assertFails(getDoc(doc(db, BC + "annc")));
  });
  test("taking a seat in a finished game, two seats, an account's seat, or someone else's", async () => {
    const db = user("cat");
    await assertFails(updateDoc(doc(db, ZD + "over"), { players: ["ann", "cat"], uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "cat", "cat"], uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["cat", "g_1", "g_2"], uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "ben", "g_2"], uids: ["ann", "ben"] }));
  });
  test("a seat taken with by or names changed", async () => {
    const db = user("cat");
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "cat", "g_2"], uids: ["ann", "cat"], by: "cat" }));
    await assertFails(updateDoc(doc(db, ZD + "seat"), { players: ["ann", "cat", "g_2"], uids: ["ann", "cat"], names: ["Ann", "Cat", "Eve"] }));
  });
});

// ---- Sessions Loyalty: a club's staff, and its members (sessions-loyalty/SPEC.md §6) ----
// Staff are the uids listed under staff/ (the owner writes that list) plus the owner. A member is
// any account: it reads the club's settings, rewards and ways to earn, its own card and its own
// entries (with the uid filter), and writes nothing. A household member is a plain member here:
// the generic household rule skips this app, as it skips Rack It.

const SL = "sidequests/sessions-loyalty/";
const entry = (extra = {}) => ({ kind: "spend", uid: "ann", name: "Ann", by: "bar", byName: "Bar", at: 1, rands: 90, points: 90, xp: 90, item: "", title: "", note: "", ...extra });

describe("Sessions Loyalty: staff", () => {
  beforeEach(async () => {
    await seed(SL + "staff/bar", { name: "Bar", addedAt: 1, addedBy: "owner" });
    await seed(SL + "settings/main", { name: "Sessions", pointsPerRand: 1 });
    await seed(SL + "rewards/r1", { title: "Free lager", cost: 0, active: true });
    await seed(SL + "earns/e1", { title: "Refer a friend", points: 1250, active: true });
    await seed(SL + "cards/ann", { uid: "ann", name: "Ann", points: 90, xp: 90, since: 1 });
    await seed(SL + "notes/ann", { text: "Tuesdays", by: "bar" });
    await seed(SL + "entries/x1", entry());
    await seed(SL + "entries/x2", entry({ uid: "cat", name: "Cat" }));
  });

  test("reads everything: settings, items, every card and note, and every entry", async () => {
    const db = user("bar");
    await assertSucceeds(getDoc(doc(db, SL + "settings/main")));
    await assertSucceeds(getDocs(collection(db, SL + "rewards")));
    await assertSucceeds(getDocs(collection(db, SL + "earns")));
    await assertSucceeds(getDocs(collection(db, SL + "cards")));
    await assertSucceeds(getDoc(doc(db, SL + "notes/ann")));
    await assertSucceeds(getDocs(collection(db, SL + "staff")));
    await assertSucceeds(getDocs(collection(db, SL + "entries")));
    await assertSucceeds(getDocs(query(collection(db, SL + "entries"), where("uid", "==", "ann"))));
    await assertSucceeds(getDocs(query(collection(db, SL + "entries"), orderBy("at", "desc"), limit(50))));
  });
  test("writes settings, items, a card and a note", async () => {
    const db = user("bar");
    await assertSucceeds(setDoc(doc(db, SL + "settings/main"), { pointsPerRand: 2 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, SL + "rewards/r2"), { title: "Cap", cost: 1550, active: true }));
    await assertSucceeds(deleteDoc(doc(db, SL + "earns/e1")));
    await assertSucceeds(setDoc(doc(db, SL + "cards/ben"), { uid: "ben", name: "Ben", points: 0, xp: 0, since: 2 }));
    await assertSucceeds(updateDoc(doc(db, SL + "cards/ann"), { memberNo: "7", status: "member" }));
    await assertSucceeds(setDoc(doc(db, SL + "notes/ben"), { text: "x", by: "bar" }));
  });
  test("logs an entry and the card's new figures in one batch, and voids one", async () => {
    const db = user("bar"), b = writeBatch(db);
    b.set(doc(db, SL + "entries/new1"), entry({ by: "bar" }));
    b.update(doc(db, SL + "cards/ann"), { points: 180, xp: 180, lastAt: 2 });
    await assertSucceeds(b.commit());
    await assertSucceeds(updateDoc(doc(db, SL + "entries/x1"), { voided: true, voidedBy: "bar", voidedAt: 3 }));
  });
  test("refused: an entry by someone else, rewriting an entry, deleting one, or touching the staff list", async () => {
    const db = user("bar");
    await assertFails(setDoc(doc(db, SL + "entries/new2"), entry({ by: "owner" })));
    await assertFails(setDoc(doc(db, SL + "entries/new3"), entry({ by: "" })));
    await assertFails(updateDoc(doc(db, SL + "entries/x1"), { points: 900 }));
    await assertFails(updateDoc(doc(db, SL + "entries/x1"), { voided: true, points: 900 }));
    await assertFails(deleteDoc(doc(db, SL + "entries/x1")));
    await assertFails(setDoc(doc(db, SL + "staff/ben"), { name: "Ben" }));
    await assertFails(deleteDoc(doc(db, SL + "staff/bar")));
  });
  test("refused: the owner rewriting an entry, too: an entry is only ever voided", async () => {
    await assertFails(updateDoc(doc(as(OWNER), SL + "entries/x1"), { points: 900 }));
  });
  test("the owner is staff too, appoints staff, and deletes an entry", async () => {
    const db = as(OWNER);
    await assertSucceeds(getDocs(collection(db, SL + "cards")));
    await assertSucceeds(setDoc(doc(db, SL + "entries/new4"), entry({ by: "owner" })));
    await assertSucceeds(setDoc(doc(db, SL + "entries/imported"), entry({ by: "bar" })));   // Import
    await assertSucceeds(setDoc(doc(db, SL + "staff/ben"), { name: "Ben", addedAt: 2, addedBy: "owner" }));
    await assertSucceeds(deleteDoc(doc(db, SL + "staff/bar")));
    await assertSucceeds(deleteDoc(doc(db, SL + "entries/x1")));
  });
});

describe("Sessions Loyalty: a member", () => {
  beforeEach(async () => {
    await seed(SL + "staff/bar", { name: "Bar", addedAt: 1, addedBy: "owner" });
    await seed(SL + "settings/main", { name: "Sessions", pointsPerRand: 1 });
    await seed(SL + "rewards/r1", { title: "Free lager", cost: 0, active: true });
    await seed(SL + "earns/e1", { title: "Refer a friend", points: 1250, active: true });
    await seed(SL + "cards/ann", { uid: "ann", name: "Ann", points: 90, xp: 90, since: 1 });
    await seed(SL + "cards/member", { uid: "member", name: "Mel", points: 5, xp: 5, since: 1 });
    await seed(SL + "notes/ann", { text: "Tuesdays", by: "bar" });
    await seed(SL + "entries/x1", entry());
    await seed(SL + "entries/x2", entry({ uid: "cat", name: "Cat" }));
    await seed(SL + "entries/x3", entry({ uid: "member", name: "Mel" }));
  });

  test("reads the settings and the items, their own card and their own entries with the uid filter", async () => {
    const db = user("ann");
    await assertSucceeds(getDoc(doc(db, SL + "settings/main")));
    await assertSucceeds(getDocs(collection(db, SL + "rewards")));
    await assertSucceeds(getDocs(collection(db, SL + "earns")));
    await assertSucceeds(getDoc(doc(db, SL + "cards/ann")));
    await assertSucceeds(getDoc(doc(db, SL + "entries/x1")));
    await assertSucceeds(getDocs(query(collection(db, SL + "entries"), where("uid", "==", "ann"))));
  });
  test("asks whether they are staff: their own (missing) staff document, and nobody else's list", async () => {
    const db = user("ann");
    await assertSucceeds(getDoc(doc(db, SL + "staff/ann")));
    await assertSucceeds(getDoc(doc(db, SL + "staff/bar")));
    await assertFails(getDocs(collection(db, SL + "staff")));
  });
  test("someone with no card yet reads the items and their own missing card", async () => {
    const db = user("ben");
    await assertSucceeds(getDocs(collection(db, SL + "rewards")));
    await assertSucceeds(getDoc(doc(db, SL + "cards/ben")));
    await assertSucceeds(getDocs(query(collection(db, SL + "entries"), where("uid", "==", "ben"))));
  });
  test("refused: anyone else's card or entries, the cards list, a bare entries list, and every note", async () => {
    const db = user("ann");
    await assertFails(getDoc(doc(db, SL + "cards/member")));
    await assertFails(getDocs(collection(db, SL + "cards")));
    await assertFails(getDoc(doc(db, SL + "entries/x2")));
    await assertFails(getDocs(collection(db, SL + "entries")));
    await assertFails(getDocs(query(collection(db, SL + "entries"), where("uid", "==", "cat"))));
    await assertFails(getDoc(doc(db, SL + "notes/ann")));
  });
  test("refused: writing anything, their own card and entries included", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, SL + "cards/ann"), { points: 9000 }));
    await assertFails(setDoc(doc(db, SL + "cards/ben"), { uid: "ben", name: "Ben" }));
    await assertFails(setDoc(doc(db, SL + "entries/mine"), entry({ by: "ann" })));
    await assertFails(updateDoc(doc(db, SL + "entries/x1"), { voided: true }));
    await assertFails(setDoc(doc(db, SL + "rewards/r9"), { title: "Free everything", cost: 0 }));
    await assertFails(setDoc(doc(db, SL + "settings/main"), { pointsPerRand: 100 }, { merge: true }));
    await assertFails(setDoc(doc(db, SL + "staff/ann"), { name: "Ann" }));
    await assertFails(setDoc(doc(db, SL + "notes/ann"), { text: "hi" }));
  });
  test("a household member is a plain member here: their own card, nobody else's, and no writes", async () => {
    const db = as(MEMBER);
    await assertSucceeds(getDoc(doc(db, SL + "cards/member")));
    await assertSucceeds(getDocs(query(collection(db, SL + "entries"), where("uid", "==", "member"))));
    await assertFails(getDoc(doc(db, SL + "cards/ann")));
    await assertFails(getDocs(collection(db, SL + "cards")));
    await assertFails(getDoc(doc(db, SL + "notes/ann")));
    await assertFails(getDocs(collection(db, SL + "entries")));
    await assertFails(setDoc(doc(db, SL + "entries/m1"), entry({ by: "member" })));
    await assertFails(updateDoc(doc(db, SL + "cards/member"), { points: 9000 }));
    await assertFails(setDoc(doc(db, SL + "rewards/r9"), { title: "x", cost: 0 }));
  });
  test("refused: everything signed out", async () => {
    const db = signedOut();
    await assertFails(getDoc(doc(db, SL + "settings/main")));
    await assertFails(getDocs(collection(db, SL + "rewards")));
    await assertFails(getDoc(doc(db, SL + "cards/ann")));
  });
});

// ---- Session 8 step 1: claiming a guest, "That was them" (KIT-PLAN.md) ----
// Whoever started a record (`by`) may give a guest's seat in it to a friend: exactly one player
// id that starts g_ becomes the friend's uid, and `uids` gains exactly that uid. Ann's guest
// g_1 (Dan) turns out to be Cat, her friend. In Rack It nothing else changes; in the open rule
// the score maps keyed by the guest's id may move to the friend (any player may change scores),
// but `by` and `names` stay. If Cat has no rating, Dan's starter becomes hers.

const annDan = (extra = {}) => abMatch({ playerB: "g_1", names: { a: "Ann", b: "Dan" }, uids: ["ann"], rated: false,
  status: "done", endedAt: 2, ...extra });

describe("Claiming a guest: what may be done", () => {
  beforeEach(async () => {
    await seed(M + "dan", annDan());
    await seed(M + "danA", annDan({ playerA: "g_1", playerB: "ann", names: { a: "Dan", b: "Ann" } }));
    await seed(M + "danLive", annDan({ status: "live", endedAt: null }));
    await seed(R + "g_1", { zargo: 420, robustness: 0, sessions: 0 });
    await seed(ZD + "dan", zd({ players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"], seats: ["ann", "g_1"], scores: { ann: 9, g_1: 13 } }));
    await seed(AC + "dan", atc());
  });

  test("Rack It: the starter gives the guest's seat to a friend, on either side, live or saved", async () => {
    const db = user("ann");
    await assertSucceeds(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "cat"] }));
    await assertSucceeds(updateDoc(doc(db, M + "danA"), { playerA: "cat", uids: ["ann", "cat"] }));
    await assertSucceeds(updateDoc(doc(db, M + "danLive"), { playerB: "cat", uids: ["ann", "cat"] }));
  });
  test("Rack It: once the guest is claimed, their starter becomes the friend's when she has no rating", async () => {
    await seed("profiles/ann/guests/g_1", { name: "Dan", claimedBy: "cat" });
    await assertSucceeds(setDoc(doc(user("ann"), R + "cat"), { zargo: 420, robustness: 0, sessions: 0, from: "g_1" }));
  });
  test("the open rule: the starter gives the guest's seat and scores to a friend", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), ZD + "dan"), { players: ["ann", "cat"], uids: ["ann", "cat"],
      seats: ["ann", "cat"], scores: { ann: 9, cat: 13 } }));
    await assertSucceeds(updateDoc(doc(user("ann"), AC + "dan"), { players: ["ann", "cat"], uids: ["ann", "cat"],
      throws: { ann: [], cat: [] }, scores: { ann: 0, cat: 0 } }));
  });
});

describe("Claiming a guest: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "dan", annDan());
    await seed(M + "benDan", annDan({ playerA: "ben", by: "ben", uids: ["ben"], names: { a: "Ben", b: "Dan" } }));
    await seed(M + "ab", abMatch({ status: "done", rated: false, endedAt: 2 }));
    await seed(R + "g_1", { zargo: 420, robustness: 0, sessions: 0 });
    await seed(R + "ben", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(ZD + "dan", zd({ players: ["ann", "g_1"], names: ["Ann", "Dan"], uids: ["ann"], seats: ["ann", "g_1"], scores: { ann: 9, g_1: 13 } }));
    await seed(ZD + "dan2", zd({ players: ["ann", "g_1", "g_2"], names: ["Ann", "Dan", "Eve"], uids: ["ann"], seats: ["ann", "g_1", "g_2"] }));
  });

  test("a claim by anyone but the starter", async () => {
    // Ben's match with his own guest: Ann isn't its starter, nor in it. Cat isn't the starter of Ann's.
    await assertFails(updateDoc(doc(user("ann"), M + "benDan"), { playerB: "cat", uids: ["ben", "cat"] }));
    await assertFails(updateDoc(doc(user("cat"), M + "dan"), { playerB: "cat", uids: ["ann", "cat"] }));
  });
  test("a claim for someone the starter isn't connected to", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "dan"), { playerB: "eve", uids: ["ann", "eve"] }));
    await assertFails(updateDoc(doc(user("ann"), ZD + "dan"), { players: ["ann", "eve"], uids: ["ann", "eve"] }));
  });
  test("a claim of a seat held by an account", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "ab"), { playerB: "cat", uids: ["ann", "ben", "cat"] }));
    await assertFails(updateDoc(doc(user("ann"), M + "ab"), { playerB: "cat", uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(user("ann"), M + "ab"), { playerA: "cat", uids: ["ann", "ben", "cat"] }));
  });
  test("a claim whose uids gain someone other than the new player, or two", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "ben"] }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "cat", "ben"] }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["cat"] }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "ann", uids: ["ann", "ann"] }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ben", "cat"] }));
  });
  test("a claim that changes anything else in a Rack It match", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "cat"], names: { a: "Ann", b: "Cat" } }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "cat"], rated: true }));
    await assertFails(updateDoc(doc(db, M + "dan"), { playerB: "cat", uids: ["ann", "cat"], totals: { a: 9, b: 0 } }));
  });
  test("the open rule: a claim that changes by or names, two seats, or another seat", async () => {
    const db = user("ann");
    await assertFails(updateDoc(doc(db, ZD + "dan"), { players: ["ann", "cat"], uids: ["ann", "cat"], names: ["Ann", "Cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "dan"), { players: ["ann", "cat"], uids: ["ann", "cat"], by: "cat" }));
    await assertFails(updateDoc(doc(db, ZD + "dan2"), { players: ["ann", "cat", "cat"], uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "dan2"), { players: ["cat", "g_1", "g_2"], uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(db, ZD + "dan2"), { players: ["ann", "g_2", "cat"], uids: ["ann", "cat"] }));
  });
  test("a claimed starter over a rating that exists, a different number, or a guest not claimed by her", async () => {
    await seed("profiles/ann/guests/g_1", { name: "Dan", claimedBy: "ben" });
    const db = user("ann");
    await assertFails(setDoc(doc(db, R + "ben"), { zargo: 420, robustness: 0, sessions: 0, from: "g_1" }));
    await seed("profiles/ann/guests/g_1", { name: "Dan", claimedBy: "cat" });
    await assertFails(setDoc(doc(db, R + "cat"), { zargo: 900, robustness: 0, sessions: 0, from: "g_1" }));
    await assertFails(setDoc(doc(db, R + "cat"), { zargo: 420, robustness: 50, sessions: 0, from: "g_1" }));
    await assertFails(setDoc(doc(db, R + "eve"), { zargo: 420, robustness: 0, sessions: 0, from: "g_1" }));
    await seed("friendships/ann_fay", { uids: ["ann", "fay"], since: 1, via: "x", app: "rack-it" });
    await assertFails(setDoc(doc(db, R + "fay"), { zargo: 420, robustness: 0, sessions: 0, from: "g_1" }));
    await assertFails(setDoc(doc(user("ben"), R + "cat"), { zargo: 420, robustness: 0, sessions: 0, from: "g_1" }));
  });
});

// ---- Session 8 step 2: seats and the Game QR (KIT-PLAN.md) ----
// Someone connected to a live match's starter may get that match (never list it) and take a
// guest's seat in it for themselves: seatSwap() written by the joiner. Cat is Ann's friend; Ben
// isn't. The owner's two-guest match is for taking two seats.

describe("Seats: what may be done", () => {
  beforeEach(async () => {
    await seed(M + "danLive", annDan({ status: "live", endedAt: null }));
    await seed(M + "danA", annDan({ status: "live", endedAt: null, playerA: "g_1", playerB: "ann", names: { a: "Dan", b: "Ann" } }));
  });
  test("a friend of the starter gets a live match, and takes a guest's seat on either side", async () => {
    const db = user("cat");
    await assertSucceeds(getDoc(doc(db, M + "danLive")));
    await assertSucceeds(updateDoc(doc(db, M + "danLive"), { playerB: "cat", uids: ["ann", "cat"] }));
    await assertSucceeds(updateDoc(doc(db, M + "danA"), { playerA: "cat", uids: ["ann", "cat"] }));
  });
  test("…then scores it as a player", async () => {
    await assertSucceeds(updateDoc(doc(user("cat"), M + "danLive"), { playerB: "cat", uids: ["ann", "cat"] }));
    await assertSucceeds(getDoc(doc(user("cat"), M + "danLive")));
  });
});

describe("Seats: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/cat_owner", { uids: ["cat", "owner"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "danLive", annDan({ status: "live", endedAt: null }));
    await seed(M + "danDone", annDan());
    await seed(M + "abLive", abMatch({ rated: false }));
    await seed(M + "twoGuests", abMatch({ playerA: "g_1", playerB: "g_2", names: { a: "Dan", b: "Eve" }, uids: [], by: "owner", rated: false }));
  });
  test("reading or seating yourself in a match whose starter you aren't connected to", async () => {
    await assertFails(getDoc(doc(user("ben"), M + "danLive")));
    await assertFails(updateDoc(doc(user("ben"), M + "danLive"), { playerB: "ben", uids: ["ann", "ben"] }));
  });
  test("reading a finished match that way, or taking a seat in one", async () => {
    await assertFails(getDoc(doc(user("cat"), M + "danDone")));
    await assertFails(updateDoc(doc(user("cat"), M + "danDone"), { playerB: "cat", uids: ["ann", "cat"] }));
  });
  test("listing the starter's matches that way", async () => {
    const col = collection(user("cat"), "sidequests/rack-it/matches");
    await assertFails(getDocs(query(col, where("by", "==", "ann"))));
    await assertFails(getDocs(query(col, where("status", "==", "live"))));
  });
  test("taking a seat held by an account", async () => {
    await assertFails(updateDoc(doc(user("cat"), M + "abLive"), { playerB: "cat", uids: ["ann", "cat"] }));
    await assertFails(updateDoc(doc(user("cat"), M + "abLive"), { playerB: "cat", uids: ["ann", "ben", "cat"] }));
  });
  test("taking two seats, at once or one after the other", async () => {
    const db = user("cat");
    await assertFails(updateDoc(doc(db, M + "twoGuests"), { playerA: "cat", playerB: "cat", uids: ["cat"] }));
    await assertSucceeds(updateDoc(doc(db, M + "twoGuests"), { playerA: "cat", uids: ["cat"] }));
    await assertFails(updateDoc(doc(db, M + "twoGuests"), { playerB: "cat", uids: ["cat", "cat"] }));
  });
  test("seating someone else, or changing anything else as you sit down", async () => {
    const db = user("cat");
    await assertFails(updateDoc(doc(db, M + "danLive"), { playerB: "fay", uids: ["ann", "fay"] }));
    await assertFails(updateDoc(doc(db, M + "danLive"), { playerB: "cat", uids: ["ann", "cat"], rated: true }));
    await assertFails(updateDoc(doc(db, M + "danLive"), { playerB: "cat", uids: ["ann", "cat"], "totals.a": 5 }));
  });
});

// ---- Session 8 step 3: two phones score one match (KIT-PLAN.md) ----
// Every write to a live match's score carries the next link of a chain, rev: { n, key, was }:
// n one more than the stored one, `was` the stored key, and a new key. A phone that was offline,
// or lost a race, built on a link that's gone, so its write is refused instead of rewinding the
// match (shared/proofs/rev-probe.mjs: a plain counter let 3 of 5 stale writes land). A presence
// write touches only your own phones entry and not the chain. The owner keeps to it too.

const link = (n, key, was) => ({ n, key, was, by: "x", at: 1 });
describe("Two phones: what may be done", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "fresh", abMatch());
    await seed(M + "chained", abMatch({ rev: link(4, "k4", "k3") }));
    await seed(M + "om", om({ rev: link(2, "o2", "o1") }));
  });
  test("a player scores the next link: the first on a match with no chain, then on from the stored key", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "fresh"), { "racks.1": { balls: { 1: "a" } }, rev: link(1, "a1", ""), "log.1": { by: "ann" } }));
    await assertSucceeds(updateDoc(doc(user("ben"), M + "fresh"), { "racks.1": { balls: { 1: "b" } }, rev: link(2, "b2", "a1") }));
    await assertSucceeds(updateDoc(doc(user("ben"), M + "chained"), { turn: "b", rev: link(5, "b5", "k4") }));
  });
  test("saving or discarding is a link too", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "chained"), { status: "pending", endedBy: "ann", endedAt: 3, rev: link(5, "a5", "k4") }));
  });
  test("a player stamps their own phone, with no link", async () => {
    await assertSucceeds(updateDoc(doc(user("ben"), M + "chained"), { "phones.ben": { at: 5 } }));
  });
  test("the owner scores the next link, stamps their phone, and still rewrites a saved match", async () => {
    const db = as(OWNER);
    await assertSucceeds(updateDoc(doc(db, M + "om"), { turn: "b", rev: link(3, "o3", "o2") }));
    await assertSucceeds(updateDoc(doc(db, M + "om"), { "phones.owner": { at: 5 } }));
    await assertSucceeds(updateDoc(doc(db, "sidequests/rack-it/matches/done1"), { zargoAfter: 2 }));
  });
});

describe("Two phones: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "chained", abMatch({ rev: link(4, "k4", "k3"), phones: { ann: { at: 1 } } }));
    await seed(M + "om", om({ rev: link(2, "o2", "o1") }));
  });
  test("a score write with no link", async () => {
    await assertFails(updateDoc(doc(user("ben"), M + "chained"), { "racks.1": { balls: { 1: "b" } }, turn: "b" }));
    await assertFails(updateDoc(doc(user("ben"), M + "chained"), { status: "discarded", endedAt: 3 }));
  });
  test("a stale link: built on a key that's gone, or not one more", async () => {
    const db = user("ben");
    await assertFails(updateDoc(doc(db, M + "chained"), { turn: "b", rev: link(5, "b5", "k3") }));
    await assertFails(updateDoc(doc(db, M + "chained"), { turn: "b", rev: link(6, "b6", "k4") }));
    await assertFails(updateDoc(doc(db, M + "chained"), { turn: "b", rev: link(4, "b4", "k4") }));
  });
  test("a link that keeps the stored key", async () => {
    await assertFails(updateDoc(doc(user("ben"), M + "chained"), { turn: "b", rev: link(5, "k4", "k4") }));
  });
  test("a presence write that touches someone else's phone, or the score", async () => {
    const db = user("ben");
    await assertFails(updateDoc(doc(db, M + "chained"), { "phones.ann": { at: 9 } }));
    await assertFails(updateDoc(doc(db, M + "chained"), { "phones.ben": { at: 9 }, turn: "b" }));
  });
  test("the owner's stale write", async () => {
    await assertFails(updateDoc(doc(as(OWNER), M + "om"), { turn: "b", rev: link(3, "o3", "o1") }));
    await assertFails(updateDoc(doc(as(OWNER), M + "om"), { turn: "b" }));
  });
});

// ---- Session 8 step 4: a scorer, and both sign (KIT-PLAN.md) ----
// A match may carry scorer: <uid>, someone who isn't playing: whoever starts it, connected to
// each player, and never in `uids` (the ratings rule trusts uids to be the players). The scorer
// reads and scores like a player, ends it, and may Withdraw; never confirms. A rated match is
// done only once every player who didn't end it has confirmed: each adds only their own key to
// `confirms`, and the last one's Confirm is the batch that moves both ratings. Cat scores for Ann
// and Ben (Cat is connected to Ann; Cat and Ben connect below).

const scored = (extra = {}) => abMatch({ by: "cat", scorer: "cat", ...extra });
// `who` confirms the scorer's match: their key in confirms, pending stays pending.
const confirmKey = (who, id) => updateDoc(doc(user(who), M + id), { ["confirms." + who]: 2 });

describe("A scorer: what may be done", () => {
  beforeEach(async () => {
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "sLive", scored());
    await seed(M + "sPend", scored({ status: "pending", endedBy: "cat", endedAt: 2 }));
    await seed(M + "sPendAnn", scored({ status: "pending", endedBy: "cat", endedAt: 2, confirms: { ann: 2 } }));
    await seed(R + "ann", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(R + "ben", { zargo: 500, robustness: 4, sessions: 3 });
  });
  test("whoever starts a match for two friends scores it, not playing", async () => {
    await assertSucceeds(setDoc(doc(user("cat"), M + "s1"), scored()));
    await assertSucceeds(setDoc(doc(user("cat"), M + "s2"), scored({ playerB: "g_1", names: { a: "Ann", b: "Dan" }, uids: ["ann"], rated: false })));
  });
  test("the scorer reads it, finds it with a scorer query, scores it link by link, and ends it", async () => {
    const db = user("cat");
    await assertSucceeds(getDoc(doc(db, M + "sLive")));
    await assertSucceeds(getDocs(query(collection(db, "sidequests/rack-it/matches"), where("scorer", "==", "cat"))));
    await assertSucceeds(updateDoc(doc(db, M + "sLive"), { "racks.1": { balls: { 1: "a" } }, rev: link(1, "c1", "") }));
    await assertSucceeds(updateDoc(doc(db, M + "sLive"), { status: "pending", endedBy: "cat", endedAt: 3, rev: link(2, "c2", "c1") }));
  });
  test("the players score it too", async () => {
    await assertSucceeds(updateDoc(doc(user("ben"), M + "sLive"), { "racks.1": { balls: { 1: "b" } }, rev: link(1, "b1", "") }));
  });
  test("both sign: one player's Confirm adds only their key; the other's is the batch that moves both", async () => {
    await assertSucceeds(confirmKey("ann", "sPend"));
    await assertSucceeds(confirmBatch("ben", "sPendAnn"));
    if (await ratingOf("ann") !== 510) throw new Error("the second Confirm's batch didn't land");
  });
  test("either player's Not right, or the scorer's Withdraw, makes it a friendly at once", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "sPend"), { status: "done", rated: false, declinedBy: "ann" }));
    await assertSucceeds(updateDoc(doc(user("cat"), M + "sPendAnn"), { status: "done", rated: false, withdrawnBy: "cat" }));
  });
});

describe("A scorer: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "sLive", scored());
    await seed(M + "sPend", scored({ status: "pending", endedBy: "cat", endedAt: 2 }));
    await seed(M + "sPendAnn", scored({ status: "pending", endedBy: "cat", endedAt: 2, confirms: { ann: 2 } }));
    await seed(M + "abLive", abMatch());
    await seed(R + "ann", { zargo: 500, robustness: 4, sessions: 3 });
    await seed(R + "ben", { zargo: 500, robustness: 4, sessions: 3 });
  });
  test("the scorer confirming, or writing a rating", async () => {
    await assertFails(confirmBatch("cat", "sPend"));
    await assertFails(confirmBatch("cat", "sPendAnn"));
    await assertFails(confirmKey("cat", "sPend"));
    await assertFails(updateDoc(doc(user("cat"), M + "sPend"), { status: "done", withdrawnBy: "cat" }));
    await assertFails(setDoc(doc(user("cat"), R + "ann"), { zargo: 900, match: "sPendAnn" }, { merge: true }));
    if (await ratingOf("ann") !== 500) throw new Error("a refused confirm moved a rating");
  });
  test("the scorer turning a friendly into a rated match", async () => {
    await seed(M + "sFriendly", scored({ rated: false }));
    await assertFails(updateDoc(doc(user("cat"), M + "sFriendly"), { rated: true, rev: link(1, "c1", "") }));
  });
  test("the scorer withdrawing in someone else's name", async () => {
    await assertFails(updateDoc(doc(user("cat"), M + "sPend"), { status: "done", rated: false, withdrawnBy: "ann" }));
  });
  test("adding your own confirm to a match you ended", async () => {
    await seed(M + "pendA", abMatch({ status: "pending", endedBy: "ann", endedAt: 2 }));
    await assertFails(confirmKey("ann", "pendA"));
  });
  test("a player confirming twice to stand in for the other", async () => {
    await assertFails(confirmBatch("ann", "sPendAnn"));
    await assertFails(confirmBatch("ben", "sPend"));
  });
  test("confirms naming anyone but the writer, or moving the score with it", async () => {
    await assertFails(updateDoc(doc(user("ann"), M + "sPend"), { "confirms.ben": 2 }));
    await assertFails(updateDoc(doc(user("ann"), M + "sPend"), { "confirms.ann": 2, "confirms.ben": 2 }));
    await assertFails(updateDoc(doc(user("ann"), M + "sPend"), { "confirms.ann": 2, totals: { a: 9, b: 0 } }));
    await assertFails(updateDoc(doc(user("ann"), M + "sPendAnn"), { confirms: {} }));
  });
  test("a scorer who is also in uids, or not connected to a player", async () => {
    await assertFails(setDoc(doc(user("cat"), M + "x1"), scored({ uids: ["ann", "ben", "cat"] })));
    await assertFails(setDoc(doc(user("cat"), M + "x2"), scored({ playerB: "cat", uids: ["ann", "cat"] })));
    await assertFails(setDoc(doc(user("cat"), M + "x3"), scored({ playerB: "eve", uids: ["ann", "eve"] })));
    await assertFails(setDoc(doc(user("cat"), M + "x4"), scored({ by: "ann" })));
    await assertFails(setDoc(doc(user("cat"), M + "x5"), scored({ status: "pending" })));
    await assertFails(setDoc(doc(user("cat"), M + "x6"), scored({ endedBy: "cat" })));
    await assertFails(setDoc(doc(user("cat"), M + "x7"), scored({ confirms: { ann: 1 } })));
    await assertFails(setDoc(doc(user("cat"), M + "x8"), scored({ playerA: "eve", playerB: "ann", uids: ["eve", "ann"] })));
  });
  test("a player naming a scorer, or making themselves one later", async () => {
    await assertFails(setDoc(doc(user("ann"), M + "x6"), abMatch({ playerB: "cat", names: { a: "Ann", b: "Cat" }, uids: ["ann", "cat"], scorer: "ben" })));
    await assertFails(updateDoc(doc(user("ann"), M + "abLive"), { scorer: "cat", rev: link(1, "a1", "") }));
    await assertFails(updateDoc(doc(user("cat"), M + "sLive"), { scorer: "eve", rev: link(1, "c1", "") }));
  });
  test("the scorer changing who's playing", async () => {
    await assertFails(updateDoc(doc(user("cat"), M + "sLive"), { uids: ["ann", "ben", "cat"], rev: link(1, "c1", "") }));
    await assertFails(updateDoc(doc(user("cat"), M + "sLive"), { playerB: "cat", rev: link(1, "c1", "") }));
  });
  test("a stranger reading it, scoring it, or listing by someone else's scorer", async () => {
    await assertFails(getDoc(doc(user("eve"), M + "sLive")));
    await assertFails(updateDoc(doc(user("eve"), M + "sLive"), { turn: "b", rev: link(1, "e1", "") }));
    await assertFails(getDocs(query(collection(user("eve"), "sidequests/rack-it/matches"), where("scorer", "==", "cat"))));
  });
});

// ---- Session 10 step 4: a table session (KIT-PLAN.md) ----
// Staff at the club start a Rack It match for two members from the loyalty app: the staff member
// is its scorer, and the match carries venue: "sessions", set only at create, only by a scorer
// who is on the club's staff list (or the owner). Nothing changes it later. A loyalty entry may
// carry match: <id>, the match it was logged beside, written by staff like any entry.

const clubMatch = (extra = {}) => abMatch({ by: "bar", scorer: "bar", venue: "sessions", ...extra });

describe("A table session: what may be done", () => {
  beforeEach(async () => {
    await seed(SL + "staff/bar", { name: "Bar", addedAt: 1, addedBy: "owner" });
    await seed("friendships/ann_bar", { uids: ["ann", "bar"], since: 1, via: "x", app: "sessions-loyalty" });
    await seed("friendships/bar_ben", { uids: ["bar", "ben"], since: 1, via: "x", app: "sessions-loyalty" });
    await seed(SL + "cards/ann", { uid: "ann", name: "Ann", points: 90, xp: 90, since: 1 });
    await seed(M + "club1", clubMatch());
  });
  test("staff start a match for two members they're connected to, at the club, and score it", async () => {
    await assertSucceeds(setDoc(doc(user("bar"), M + "t1"), clubMatch()));
    await assertSucceeds(updateDoc(doc(user("bar"), M + "club1"), { "racks.1": { balls: { 1: "a" } }, rev: link(1, "b1", "") }));
    await assertSucceeds(updateDoc(doc(user("ann"), M + "club1"), { "racks.1": { balls: { 1: "b" } }, rev: link(2, "a2", "b1") }));
  });
  test("the owner may start one too", async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), M + "t2"), clubMatch({ by: "owner", scorer: "owner" })));
  });
  test("staff log a spend beside the match: the entry carries match", async () => {
    const db = user("bar"), b = writeBatch(db);
    b.set(doc(db, SL + "entries/withMatch"), entry({ by: "bar", match: "club1" }));
    b.update(doc(db, SL + "cards/ann"), { points: 180, xp: 180, lastAt: 2 });
    await assertSucceeds(b.commit());
    await assertSucceeds(setDoc(doc(db, SL + "entries/earn1"), entry({ by: "bar", kind: "earn", rands: 0, points: 50, xp: 50, item: "rack-it", title: "A rated match", match: "club1" })));
  });
});

describe("A table session: must refuse", () => {
  beforeEach(async () => {
    await seed(SL + "staff/bar", { name: "Bar", addedAt: 1, addedBy: "owner" });
    await seed("friendships/ann_bar", { uids: ["ann", "bar"], since: 1, via: "x", app: "sessions-loyalty" });
    await seed("friendships/bar_ben", { uids: ["bar", "ben"], since: 1, via: "x", app: "sessions-loyalty" });
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "rack-it" });
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "club1", clubMatch());
    await seed(M + "sLive", abMatch({ by: "cat", scorer: "cat" }));
    await seed(SL + "entries/x1", entry({ by: "bar" }));
  });
  test("a scorer who isn't staff naming the club", async () => {
    await assertFails(setDoc(doc(user("cat"), M + "n1"), abMatch({ by: "cat", scorer: "cat", venue: "sessions" })));
  });
  test("a player naming the club on their own match", async () => {
    await assertSucceeds(setDoc(doc(user("ann"), M + "n2ok"), abMatch()));   // the same match, without it, is fine
    await assertFails(setDoc(doc(user("ann"), M + "n2"), abMatch({ venue: "sessions" })));
  });
  test("staff naming any other venue", async () => {
    await assertFails(setDoc(doc(user("bar"), M + "n3"), clubMatch({ venue: "elsewhere" })));
  });
  test("the venue set, changed or dropped after the start, by the scorer or a player", async () => {
    await assertFails(updateDoc(doc(user("cat"), M + "sLive"), { venue: "sessions", rev: link(1, "c1", "") }));
    await assertFails(updateDoc(doc(user("bar"), M + "club1"), { venue: "elsewhere", rev: link(1, "b1", "") }));
    await assertFails(updateDoc(doc(user("ann"), M + "club1"), { venue: deleteField(), rev: link(1, "a1", "") }));
  });
  test("an entry's match that isn't an id, or added to an entry afterwards", async () => {
    await assertFails(setDoc(doc(user("bar"), SL + "entries/bad"), entry({ by: "bar", match: 5 })));
    await assertFails(updateDoc(doc(user("bar"), SL + "entries/x1"), { match: "club1" }));
  });
});

// ---- Session 10 step 5: a pending rated match expires (KIT-PLAN.md) ----
// A week after it ended, a rated match nobody finished counts as a friendly: the first phone in
// it to open Rack It writes it so, with expired: true. Anyone in it may (a player, or the scorer
// as themselves), as they may already Withdraw or say Not right; `expired` itself is allowed only
// once endedAt is a week old, and only on a friendly.

const DAYS = d => Date.now() - d * 86400000;

describe("A pending match expires: what may be done", () => {
  beforeEach(async () => {
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "old", abMatch({ status: "pending", endedBy: "ann", endedAt: DAYS(8) }));
    await seed(M + "oldScored", scored({ status: "pending", endedBy: "cat", endedAt: DAYS(8) }));
  });
  test("a week on, either player marks it expired: a friendly", async () => {
    await assertSucceeds(updateDoc(doc(user("ben"), M + "old"), { status: "done", rated: false, expired: true }));
  });
  test("…the player who ended it too", async () => {
    await assertSucceeds(updateDoc(doc(user("ann"), M + "old"), { status: "done", rated: false, expired: true }));
  });
  test("…and the scorer, as themselves", async () => {
    await assertSucceeds(updateDoc(doc(user("cat"), M + "oldScored"), { status: "done", rated: false, withdrawnBy: "cat", expired: true }));
  });
});

describe("A pending match expires: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ben_cat", { uids: ["ben", "cat"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "young", abMatch({ status: "pending", endedBy: "ann", endedAt: DAYS(6) }));
    await seed(M + "old", abMatch({ status: "pending", endedBy: "ann", endedAt: DAYS(8) }));
    await seed(M + "youngScored", scored({ status: "pending", endedBy: "cat", endedAt: DAYS(6) }));
  });
  test("expired before the week is up, by a player or the scorer", async () => {
    await assertSucceeds(updateDoc(doc(user("ben"), M + "young"), { status: "done", rated: false, declinedBy: "ben" }));   // Not right is fine
    await assertFails(updateDoc(doc(user("ann"), M + "young"), { status: "done", rated: false, expired: true }));
    await assertFails(updateDoc(doc(user("cat"), M + "youngScored"), { status: "done", rated: false, withdrawnBy: "cat", expired: true }));
  });
  test("expired on a match that stays rated, or by someone not in it", async () => {
    await assertFails(updateDoc(doc(user("ben"), M + "old"), { status: "done", expired: true }));
    await assertFails(updateDoc(doc(user("eve"), M + "old"), { status: "done", rated: false, expired: true }));
  });
});

// ---- Session 10 step 5: a late scorer by Game QR (KIT-PLAN.md) ----
// A live match with no scorer: someone connected to its starter, who isn't playing, scans its
// Game QR and scores it. Only scorer changes, from absent to the writer. Both players then confirm
// a rated result, as for any scorer. Ann starts against Ben; Cat (Ann's friend) comes to score.

describe("A late scorer: what may be done", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "late", abMatch({ rev: { n: 3, key: "k3" } }));
  });
  test("cat, connected to the starter, becomes its scorer, then reads it and scores link by link", async () => {
    const db = user("cat");
    await assertSucceeds(getDoc(doc(db, M + "late")));   // the Game QR's get
    await assertSucceeds(updateDoc(doc(db, M + "late"), { scorer: "cat" }));
    await assertSucceeds(updateDoc(doc(db, M + "late"), { "racks.1": { balls: { 1: "a" } }, rev: link(4, "c4", "k3") }));
  });
});

describe("A late scorer: must refuse", () => {
  beforeEach(async () => {
    await seed("friendships/ann_ben", { uids: ["ann", "ben"], since: 1, via: "x", app: "rack-it" });
    await seed(M + "late", abMatch({ rev: { n: 3, key: "k3" } }));
    await seed(M + "hasOne", abMatch({ scorer: "ben", uids: ["ann"], playerB: "g_1", names: { a: "Ann", b: "Dan" } }));
    await seed(M + "over", abMatch({ status: "pending", endedBy: "ann", endedAt: 2 }));
    await seed(M + "benStarted", abMatch({ by: "ben" }));
  });
  test("someone not connected to the starter, or naming someone else", async () => {
    await assertFails(updateDoc(doc(user("eve"), M + "late"), { scorer: "eve" }));
    await assertFails(updateDoc(doc(user("cat"), M + "benStarted"), { scorer: "cat" }));   // Ben started it, and Cat knows only Ann
    await assertFails(updateDoc(doc(user("cat"), M + "late"), { scorer: "ben" }));
  });
  test("a match that has a scorer already, or isn't live", async () => {
    await assertFails(updateDoc(doc(user("cat"), M + "hasOne"), { scorer: "cat" }));
    await assertFails(updateDoc(doc(user("cat"), M + "over"), { scorer: "cat" }));
  });
  test("a player making themselves the scorer, or the scorer changing anything else on the way in", async () => {
    await assertFails(updateDoc(doc(user("ben"), M + "late"), { scorer: "ben" }));
    await assertFails(updateDoc(doc(user("cat"), M + "late"), { scorer: "cat", rated: false }));
    await assertFails(updateDoc(doc(user("cat"), M + "late"), { scorer: "cat", "racks.1": { balls: { 1: "b" } } }));
  });
});
