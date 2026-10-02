// Proves each guard in shared/firestore.rules has a case: loosen one guard at a time (the
// entries in guards.mjs) and check that its own case in shared/rules-check.mjs goes red.
// A guard whose case stays green isn't tested; write the case, then the guard.
//
//   node shared/proofs/mutate.mjs              every guard
//   node shared/proofs/mutate.mjs "open rule"  just the guards whose name contains that
//
// Same needs as shared/proofs/rules.mjs: Java 21 and npx. One emulator for the whole run.

import fs from "node:fs";
import { RULES, startEmulator, check } from "./rules.mjs";
import { GUARDS } from "./guards.mjs";

const only = process.argv[2] || "";
const rules = fs.readFileSync(RULES, "utf8");
const emu = await startEmulator();
let bad = 0;
try {
  const base = await check(emu.host, rules);
  if (base.fail){
    console.log(`The rules as they stand already fail ${base.fail}: ${base.failed.join(" | ")}`);
    process.exit(1);
  }
  console.log(`As they stand: ${base.pass} pass.`);
  for (const g of GUARDS.filter(g => g.guard.includes(only))){
    const n = rules.split(g.from).length - 1;
    if (n !== 1){ console.log(`STALE ${g.guard}: its text is in the rules ${n} times, not once`); bad++; continue; }
    const r = await check(emu.host, rules.replace(g.from, g.to));
    const red = r.failed.filter(f => g.red.test(f));
    if (red.length) console.log(`RED   ${g.guard}\n      ${red.join(" | ")}`);
    else { console.log(`GREEN ${g.guard}: no case went red${r.failed.length ? " of its own (others did: " + r.failed.join(" | ") + ")" : ""}`); bad++; }
  }
} finally { emu.stop(); }
console.log(bad ? `\n${bad} guard(s) not proved.` : "\nEvery guard has a case that goes red without it.");
process.exitCode = bad ? 1 : 0;
