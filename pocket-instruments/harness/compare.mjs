// P7's bar, written before any voice existed: two renders of the same thing must differ by
// less than -80 dB.
//
//   node compare.mjs <a.f32> <b.f32> [...more pairs]      exits 0 only if every pair passes
//
// A file is raw 32-bit little-endian floats. For each pair:
//   - the lengths must match, and no sample may be NaN or infinite;
//   - the render must not be silence (two silences agree and prove nothing): its peak must
//     be at least -20 dB of full scale;
//   - the difference, at its worst sample, measured against the render's own peak, must be
//     under -80 dB. Worst sample against peak is stricter than RMS against RMS, so a render
//     that passes here passes the bar however it is read.
// It also says whether the two are the same bytes, which is the stronger result.
//
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BAR_DB = -80, LOUD_ENOUGH_DB = -20;
const db = (x) => (x === 0 ? -Infinity : 20 * Math.log10(x));
const floats = (path) => {
  const b = readFileSync(path);
  if (b.length % 4) throw new Error(`${path}: not a whole number of floats`);
  return { bytes: b, f: new Float32Array(b.buffer, b.byteOffset, b.length / 4) };
};

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error("usage: compare.mjs <a.f32> <b.f32> [...]");
  process.exit(2);
}
let failed = 0;
for (let i = 0; i < args.length; i += 2) {
  const [pa, pb] = [args[i], args[i + 1]];
  const a = floats(pa), b = floats(pb);
  const fail = (why) => {
    failed++;
    console.log(`P7 FAIL ${pa} against ${pb}: ${why}`);
  };
  if (a.f.length !== b.f.length || a.f.length === 0) {
    fail(`${a.f.length} samples against ${b.f.length}`);
    continue;
  }
  let peak = 0, worst = 0, bad = false;
  for (let n = 0; n < a.f.length; n++) {
    if (!Number.isFinite(a.f[n]) || !Number.isFinite(b.f[n])) bad = true;
    peak = Math.max(peak, Math.abs(a.f[n]), Math.abs(b.f[n]));
    worst = Math.max(worst, Math.abs(a.f[n] - b.f[n]));
  }
  if (bad) {
    fail("a sample is NaN or infinite");
    continue;
  }
  if (db(peak) < LOUD_ENOUGH_DB) {
    fail(`the render peaks at ${db(peak).toFixed(1)} dB: too quiet to prove anything`);
    continue;
  }
  const diff = db(worst / peak);
  const same = a.bytes.equals(b.bytes);
  const sha = createHash("sha256").update(a.bytes).digest("hex").slice(0, 16);
  if (!(diff < BAR_DB)) {
    fail(`they differ by ${diff.toFixed(1)} dB, and the bar is ${BAR_DB}`);
    continue;
  }
  console.log(
    `P7 ${pa}: ${a.f.length} samples, peak ${db(peak).toFixed(1)} dB; differs from ${pb} by ` +
      `${diff === -Infinity ? "nothing" : diff.toFixed(1) + " dB"}` + (same ? ` (the same bytes, ${sha})` : " (not the same bytes)"),
  );
}
process.exit(failed ? 1 : 0);
