// Session 8 step 3's probe: can a phone's queued offline score writes be refused cleanly? It
// starts the emulator (rules.mjs) and runs rev-probe.case.mjs, which tries two rule shapes:
// a plain counter, and the chain the rules use (each write names the write it built on).
//
//   node shared/proofs/rev-probe.mjs
//
// 2026-10-02: counter → writes 3 to 5 of 5 landed and rewound the other phone; chain → all 5
// refused, and the stale phone came back showing the other phone's score (KIT-HISTORY Session 8).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startEmulator } from "./rules.mjs";

const DIR = process.env.RULES_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "sidequests-rules");
const emu = await startEmulator();   // installs the packages into DIR on first use
try {
  fs.mkdirSync(path.join(DIR, "probe"), { recursive: true });
  fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "rev-probe.case.mjs"), path.join(DIR, "probe/rev-probe.case.mjs"));
  const r = spawnSync("node", ["probe/rev-probe.case.mjs"], { cwd: DIR, env: { ...process.env, FIRESTORE_EMULATOR_HOST: emu.host }, encoding: "utf8", timeout: 120000 });
  process.stdout.write(r.stdout);
  if (r.status) { process.stderr.write(r.stderr.slice(-2000)); process.exitCode = 1; }
} finally { emu.stop(); }
