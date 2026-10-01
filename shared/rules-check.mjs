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
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, setLogLevel, updateDoc } from "firebase/firestore";

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
  });
});

const as = email => env.authenticatedContext(email.split("@")[0], { email, email_verified: true }).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

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
