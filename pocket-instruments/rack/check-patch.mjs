// P6 in Rack: read a patch that was saved while the probes played, and hold what each probe
// saved against the other host.
//
//   node rack/check-patch.mjs <saved.vcv> <node report>      exits 0 only if every probe is good
//
// For each Probe module in the patch:
//   - its snapshot must be whole: the .wasm core loads it (magic, version, size, CRC);
//   - its counts must be clean: at least one pass matched, none mismatched, none dropped;
//   - if the snapshot is its fixture's opening pattern, those exact bytes must be in the Node
//     report as a snapshot the wasm host loaded and got that fixture's trace from. That is
//     P6's bar: "a saved pattern reloads to the same P2 trace on the other host".
//     A fixture that edits itself as it plays (swing-length-change shortens its length at
//     step 26) can be caught after its edit. That snapshot is whole but is not the pattern
//     any report ran, so it is said so and does not count towards the bar.
// At least one probe must meet the bar.
//
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [patchPath, reportPath] = process.argv.slice(2);
if (!patchPath || !reportPath) {
  console.error("usage: check-patch.mjs <saved.vcv> <node report>");
  process.exit(2);
}
const raw = readFileSync(patchPath);
// Rack 2 saves a zstd-compressed tar holding patch.json; older and hand-made patches are the JSON itself.
const text = raw[0] === 0x7b ? raw.toString("utf8")
  : execFileSync("sh", ["-c", 'zstd -dc "$1" | tar -xO patch.json', "sh", patchPath], { maxBuffer: 1 << 26 }).toString("utf8");
const patch = JSON.parse(text);
const report = readFileSync(reportPath, "utf8");

const wasm = fileURLToPath(new URL("../target/wasm32-unknown-unknown/release/pi_core.wasm", import.meta.url));
const pi = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(wasm)), {}).exports;
const base = pi.memory.grow(1) * 65536;
const engine = pi.pi_init(base, pi.pi_size(), 48000, 1);

const probes = patch.modules.filter((m) => m.plugin === "PocketInstruments" && m.model === "Probe");
let failed = probes.length === 0 ? 1 : 0, met = 0;
if (!probes.length) console.log("P6 in Rack: no probe in this patch");
for (const m of probes) {
  const d = m.data || {}, c = d.p3 || {};
  const say = (s) => console.log(`P6 in Rack, probe ${m.id} (${d.fixture}): ${s}`);
  if (!d.snapshot) {
    say("FAILED: saved no snapshot");
    failed++;
    continue;
  }
  const bytes = Buffer.from(d.snapshot, "base64");
  new Uint8Array(pi.memory.buffer, base + 1024, bytes.length).set(bytes);
  const rc = pi.pi_load(engine, base + 1024, bytes.length);
  if (rc !== 0) {
    say(`FAILED: the wasm core refused the snapshot (${rc})`);
    failed++;
    continue;
  }
  if (!(c.passed > 0) || c.failed !== 0 || c.dropped !== 0) {
    say(`FAILED: its counts are not clean: ${JSON.stringify(c)}`);
    failed++;
    continue;
  }
  const counts = `${c.passed} passes matched, 0 did not, ${c.cutShort} cut short, ${c.rateChanges} rate changes, at ${c.rate} Hz, ${c.published} snapshots published`;
  const hex = bytes.toString("hex");
  if (new RegExp(`^# ${d.fixture} \\S+ \\d+ snapshot ${hex}$`, "m").test(report)) {
    met++;
    say(`whole, and the wasm host gave this fixture's trace from the same ${bytes.length} bytes. ${counts}`);
  } else {
    say(`whole, but caught after the fixture's own edit, so no report ran this pattern. ${counts}`);
  }
}
if (!failed && !met) {
  console.log("P6 in Rack: FAILED: no probe was saved on its fixture's opening pattern; save again");
  failed++;
}
process.exit(failed ? 1 : 0);
