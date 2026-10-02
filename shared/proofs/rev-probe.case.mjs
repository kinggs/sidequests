// Run through shared/proofs/rev-probe.mjs, which copies this next to the emulator packages.
// Session 8 step 3 probe: can a phone's queued offline score writes be refused cleanly?
// Two rule shapes for a live match's score writes:
//   counter: rev.n must be the stored rev.n + 1
//   chain:   …and rev.was must be the stored rev.key (each write names the one it built on)
// Ann goes offline and taps 5 times; Ben, online, taps twice; Ann comes back.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, disableNetwork, enableNetwork, setLogLevel } from "firebase/firestore";
setLogLevel("silent");
const SHAPES = {
  counter: "request.resource.data.rev.n == resource.data.rev.n + 1",
  chain: "request.resource.data.rev.n == resource.data.rev.n + 1 && request.resource.data.rev.was == resource.data.rev.key && request.resource.data.rev.key != resource.data.rev.key",
};
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
for (const [shape, cond] of Object.entries(SHAPES)){
  const rules = `rules_version = '2';
service cloud.firestore { match /databases/{d}/documents { match /m/{id} {
  allow read: if request.auth != null;
  allow update: if request.auth != null && ${cond};
} } }`;
  const env = await initializeTestEnvironment({ projectId: "demo-probe-" + shape, firestore: { rules, host, port: +port } });
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "m/x"), { rev: { n: 0, key: "k0", was: "" }, score: 0, log: {} }));
  const A = env.authenticatedContext("ann").firestore(), B = env.authenticatedContext("ben").firestore();
  let seenA = null;
  const off = onSnapshot(doc(A, "m/x"), s => { seenA = s.data(); });
  await getDoc(doc(A, "m/x"));
  await disableNetwork(A);
  // Ann's five taps, offline, each built on her own last write.
  let base = { n: 0, key: "k0" }; const ap = [];
  for (let i = 1; i <= 5; i++){
    const rev = { n: base.n + 1, key: "a" + i, was: base.key };
    ap.push(updateDoc(doc(A, "m/x"), { rev, score: 100 + i, ["log." + rev.n]: "ann" }).then(() => "landed", e => e.code));
    base = rev;
  }
  // Ben's two taps, online.
  let bb = { n: 0, key: "k0" };
  for (let i = 1; i <= 2; i++){
    const rev = { n: bb.n + 1, key: "b" + i, was: bb.key };
    await updateDoc(doc(B, "m/x"), { rev, score: 200 + i, ["log." + rev.n]: "ben" });
    bb = rev;
  }
  await enableNetwork(A);
  const outcomes = await Promise.all(ap);
  await new Promise(r => setTimeout(r, 1500));
  let server;
  await env.withSecurityRulesDisabled(async c => { server = (await getDoc(doc(c.firestore(), "m/x"))).data(); });
  console.log(`${shape}: Ann's 5 queued writes → ${outcomes.join(", ")}`);
  console.log(`${shape}: server ends at rev ${server.rev.n} (${server.rev.key}), score ${server.score}; Ann's phone shows rev ${seenA.rev.n} (${seenA.rev.key}), score ${seenA.score}`);
  off(); await env.cleanup();
}
process.exit(0);
