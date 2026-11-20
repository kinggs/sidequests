// The listening page's wiring: open web/listen.html?auto in a real browser, headless, let it
// fire every key through the engine, and judge what it reports. The voices are proven in
// core/src/tests/sound.rs; this proves the page reaches all sixteen, and the samples load.
//
//   node web/listen.mjs [chromium] [firefox]     exits 0 only if every browser passed
//
// Served and launched as web/desktop.mjs does: no Playwright, a throwaway profile each, a
// browser that is not installed is skipped, none at all is exit 2.
//
// The bar, written before the page first ran:
//   - all sixteen starter samples load (samples/raw/, in samples/tracks.txt's order);
//   - every key, tapped once, sounds (its loudest sample over 0.05) and falls silent again;
//   - the keys reach sixteen different voices: at least 14 different loudest samples (two
//     voices could match by chance; one voice behind every key gives one);
//   - "All samples" reaches the engine (D50): every key then peaks near the level a sample
//     at full scale gets, 0.5 (between 0.4 and 0.55), and differently from its code voice
//     on every key (a key whose sample was never given falls back to code: Session 8 planted
//     one, and the first wording, 14 keys and 0.3, let it through);
//   - "All code" brings the code voices back: keys 1, 10 and 16 peak as they first did;
//   - slider B reaches the engine: the bass drum at B = 100 % lasts over twice B = 0 %.
// (Added in Session 8 with the samples: the three lines on samples and code.)
//
// SPDX-License-Identifier: MIT
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // pocket-instruments/
const asked = process.argv.slice(2);
const browsers = asked.length ? asked : ["chromium", "firefox"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".s16": "application/octet-stream", ".txt": "text/plain" };

let waiting = null;
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.end("ok");
      if (waiting) waiting(JSON.parse(body));
    });
    return;
  }
  const path = normalize(join(root, decodeURIComponent(req.url.split("?")[0])));
  if (!path.startsWith(root) || !existsSync(path) || !TYPES[extname(path)]) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(path)], "cache-control": "no-store" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/web/listen.html?auto`;

function launch(name, profile) {
  if (name === "chromium")
    return spawn("chromium", ["--headless=new", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--disable-gpu",
      `--user-data-dir=${profile}`, url], { stdio: "ignore" });
  writeFileSync(join(profile, "user.js"),
    'user_pref("media.autoplay.default", 0);\nuser_pref("media.autoplay.blocking_policy", 0);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\n');
  return spawn("firefox", ["--headless", "--no-remote", "--profile", profile, url], { stdio: "ignore" });
}

function judge(r) {
  const bad = [];
  if (r.samples !== 16) bad.push(`${r.samples} of 16 samples loaded`);
  if (r.failed.length) bad.push(...r.failed);
  r.peaks.forEach((p, i) => {
    if (p === -1) bad.push(`key ${i + 1}: the engine never fell silent before it`);
    else if (!(p > 0.05)) bad.push(`key ${i + 1}: no sound (loudest ${p})`);
  });
  if (r.peaks.length !== 16) bad.push(`${r.peaks.length} keys tried, not 16`);
  if (r.samplePeaks.length !== 16) bad.push(`${r.samplePeaks.length} keys tried as samples, not 16`);
  r.samplePeaks.forEach((p, i) => { if (!(p >= 0.4 && p <= 0.55)) bad.push(`key ${i + 1} as a sample: loudest ${p}, not near 0.5`); });
  const changed = r.samplePeaks.filter((p, i) => p.toFixed(4) !== r.peaks[i]?.toFixed(4)).length;
  if (changed < 16) bad.push(`only ${changed} keys sounded different as samples`);
  [0, 9, 15].forEach((k, j) => { if (r.back[j] !== r.peaks[k]) bad.push(`key ${k + 1} after "All code": ${r.back[j]}, first ${r.peaks[k]}`); });
  const distinct = new Set(r.peaks.map((p) => p.toFixed(4))).size;
  if (distinct < 14) bad.push(`only ${distinct} different voices behind the sixteen keys`);
  if (!(r.kick.short > 0 && r.kick.long > 2 * r.kick.short)) bad.push(`slider B: the bass drum lasted ${r.kick.short} reports at 0 % and ${r.kick.long} at 100 %`);
  return bad;
}

let ran = 0, failed = 0;
for (const name of browsers) {
  if (spawnSync("which", [name]).status !== 0) {
    console.log(`listen ${name}: not installed, skipped`);
    continue;
  }
  ran++;
  const profile = mkdtempSync(join(tmpdir(), `pi-listen-${name}-`));
  const got = new Promise((r) => (waiting = r));
  const child = launch(name, profile);
  const result = await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 180000))]);
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(profile, { recursive: true, force: true });
  if (!result) {
    failed++;
    console.log(`listen ${name}: FAILED: no result within three minutes`);
    continue;
  }
  const bad = judge(result);
  if (bad.length) failed++;
  console.log(`listen ${name} at ${result.rate} Hz: ${bad.length ? "FAILED" : "passed"}`);
  console.log(`  loudest per key: ${result.peaks.map((p) => p.toFixed(3)).join(" ")}`);
  console.log(`  as samples:      ${result.samplePeaks.map((p) => p.toFixed(3)).join(" ")}`);
  console.log(`  bass drum: ${result.kick.short} reports at B 0 %, ${result.kick.long} at 100 %; ${result.samples} samples`);
  for (const b of bad) console.log(`  ${b}`);
}
server.close();
if (!ran) {
  console.log("listen: no browser to run in");
  process.exit(2);
}
process.exit(failed ? 1 : 0);
