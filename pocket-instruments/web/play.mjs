// The phone page's wiring (web/rhythm.html, Session 12): open it with ?auto in a real browser,
// headless, let web/play-auto.js press its keys, and judge what each phase reports.
//
//   node web/play.mjs <node report> [chromium] [firefox]     exits 0 only if every browser passed
//
// Served and launched as web/listen.mjs does: no Playwright, a throwaway profile each, a
// browser that is not installed is skipped, none at all is exit 2. The page runs three
// phases, reloading itself between them in the same profile.
//
// The bar, written before the page first ran (PLAN.md, Session 12):
//   - the first touch starts the audio thread and counts as a press (write comes on);
//   - straight-sixteenths' pattern entered by keys while stopped, then the play key: the
//     worklet's trace over the first two bars is that fixture's `expect`, line for line
//     (the play key resets, so ticks start at 0);
//   - keys-bpm-family's edits and keys pressed: the last view, as text, is the fixture's last;
//   - every drawing, read back off the face, equals the view it was drawn from (more than
//     fifty drawings, none different);
//   - two pointers held at once choose a sound: sound and key 6 both held, key 6 chosen;
//     and when both lift, nothing stays held;
//   - a reload brings the beat back: the page loads the kept snapshot (result 0) and saves
//     the same bytes;
//   - Ctrl+click latches (D60, D61; added 2026-11-23): Ctrl+click sound, click key 16:
//     sound held and lit as latched, then key 16 chosen and nothing held or lit; Ctrl+click
//     bpm, two slider moves leave it held, Ctrl+click it again: the tempo is B's 170 bpm,
//     not a preset; Ctrl+click function, click pattern: cleared; a right-click: nothing;
//     Ctrl+click on play: a plain press, it plays;
//   - the sounds sheet (D60): a name fires its sound once and switches nothing; the switch
//     turns it to its sample and fires it once more;
//   - P6's browser half: the pattern entered by keys while it plays, the snapshot the page
//     saved is byte for byte one the wasm host loaded and got straight-sixteenths' trace from
//     (a "# straight-sixteenths ... snapshot <hex>" label in the Node report), and is what
//     the browser kept.
// Each line fails once on a planted fault (PLAN.md, Session 12's Handover).
//
// SPDX-License-Identifier: MIT
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // pocket-instruments/
const [reportPath, ...asked] = process.argv.slice(2);
if (!reportPath) {
  console.error("usage: play.mjs <node report> [chromium] [firefox]");
  process.exit(2);
}
const browsers = asked.length ? asked : ["chromium", "firefox"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".s16": "application/octet-stream", ".txt": "text/plain" };
const report = readFileSync(reportPath, "utf8");
const sixteenths = JSON.parse(readFileSync(join(root, "fixtures/straight-sixteenths.json"), "utf8"));

let results = [], finished = null;
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.end("ok");
      const r = JSON.parse(body);
      results.push(r);
      if (r.done && finished) finished();
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
const url = `http://127.0.0.1:${server.address().port}/web/rhythm.html?auto=1`;

function launch(name, profile) {
  if (name === "chromium")
    return spawn("chromium", ["--headless=new", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--disable-gpu",
      `--user-data-dir=${profile}`, url], { stdio: "ignore" });
  writeFileSync(join(profile, "user.js"),
    'user_pref("media.autoplay.default", 0);\nuser_pref("media.autoplay.blocking_policy", 0);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\n');
  return spawn("firefox", ["--headless", "--no-remote", "--profile", profile, url], { stdio: "ignore" });
}

function judge(phases) {
  const bad = [];
  const p = Object.fromEntries(phases.map((r) => [r.phase, r]));
  for (const r of phases) for (const f of r.failed) bad.push(`phase ${r.phase}: ${f}`);
  for (const name of ["1", "reload", "bpm", "latch"]) if (!p[name]) bad.push(`phase ${name} never reported`);
  // Each phase reports under its own name: p.reload.reload, p.bpm.bpm. (A first draft read
  // p.bpm.last, and undefined equalled undefined: the bpm line passed with nothing checked.)
  const one = p["1"] || {}, reload = p.reload?.reload || {}, bpm = p.bpm?.bpm || {};
  if (!bpm.want) bad.push("keys-bpm-family: no view to hold");
  if (!(one.firstTouch?.state === "running" && one.firstTouch?.write)) bad.push(`first touch: ${JSON.stringify(one.firstTouch)}`);
  const want = sixteenths.expect;
  if (!one.trace || one.trace.join("\n") !== want.join("\n")) {
    const at = (one.trace || []).findIndex((l, i) => l !== want[i]);
    bad.push(`trace: ${one.trace?.length} lines, not the fixture's ${want.length}; first difference at line ${at < 0 ? Math.min(one.trace?.length ?? 0, want.length) + 1 : at + 1}: "${one.trace?.[at]}" for "${want[at]}"`);
  }
  if (bpm.last !== bpm.want) bad.push(`keys-bpm-family's last view:\n     got  ${bpm.last}\n     want ${bpm.want}`);
  const drawn = phases.reduce((n, r) => n + r.drawn.checked, 0);
  const drawnBad = phases.flatMap((r) => r.drawn.bad);
  if (drawn <= 50) bad.push(`only ${drawn} drawings checked`);
  for (const d of drawnBad) bad.push(`a drawing is not its view: ${d}`);
  if (!(one.two?.sel === 5 && (one.two.held & 0x10020) === 0x10020 && one.two.after === 0)) bad.push(`two pointers: ${JSON.stringify(one.two)}`);
  if (!(reload.loaded === 0 && reload.hex && reload.hex === reload.before)) bad.push(`reload: loaded ${reload.loaded}; saved ${reload.hex?.slice(0, 32)}…, kept ${reload.before?.slice(0, 32)}…`);
  const L = p.latch?.latch || {};
  const latchOk = L.soundHeld === 1 << 16 && L.soundLit === true && L.chosen === 15 && L.afterLit === false &&
    L.bpmStillHeld === true && L.tempo === 170000 && L.fieldAfterClear === 0 &&
    L.afterRight?.held === 0 && L.afterRight?.lit === false && L.playAfterCtrl?.playing === 1;
  if (!latchOk) bad.push(`Ctrl+click latch: ${JSON.stringify({ ...L, nameFired: undefined, nameSampled: undefined, switchFired: undefined, switchSampled: undefined, switchLabel: undefined })}`);
  if (!(L.nameFired === 1 && L.nameSampled === 0 && L.switchFired === 2 && L.switchSampled === 4 && L.switchLabel === "sample"))
    bad.push(`sounds sheet: name fired ${L.nameFired} (sampled ${L.nameSampled}); switch fired ${L.switchFired} (sampled ${L.switchSampled}, "${L.switchLabel}")`);
  const p6 = one.p6 || {};
  const label = p6.hex && new RegExp(`^# straight-sixteenths .* snapshot ${p6.hex}$`, "m").test(report);
  if (!p6.playing) bad.push("P6: it was not playing while the keys went in");
  if (!label) bad.push(`P6: the page's snapshot is not one the wasm host ran straight-sixteenths from: ${p6.hex}`);
  if (p6.stored !== p6.hex) bad.push("P6: what the browser kept is not the snapshot the page was sent");
  return { bad, drawn, p6 };
}

let ran = 0, failed = 0;
for (const name of browsers) {
  if (spawnSync("sh", ["-c", `command -v ${name}`]).status !== 0) {
    console.log(`play ${name}: not installed, skipped`);
    continue;
  }
  ran++;
  results = [];
  const profile = mkdtempSync(join(tmpdir(), `pi-play-${name}-`));
  const done = new Promise((r) => (finished = r));
  const child = launch(name, profile);
  const ok = await Promise.race([done.then(() => true), new Promise((r) => setTimeout(() => r(false), 120000))]);
  finished = null;
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(profile, { recursive: true, force: true });
  const { bad, drawn, p6 } = judge(results);
  if (!ok) bad.unshift("the page did not finish within two minutes");
  if (bad.length) failed++;
  if (process.env.PI_DEBUG) console.log(JSON.stringify(results.map((r) => ({ ...r, trace: undefined })), null, 1));
  const one = results.find((r) => r.phase === "1");
  console.log(`play ${name} at ${one?.rate} Hz: ${bad.length ? "FAILED" : "passed"}; ${results.length} phases, ${drawn} drawings checked; ` +
    `P6: ${p6.hex ? "snapshot " + p6.hex.slice(32, 48) + "…" : "no snapshot"}, audio ${p6.behindMs} ms behind the page's clock over ${p6.seconds} s`);
  for (const b of bad) console.log(`  ${b}`);
}
server.close();
if (!ran) {
  console.log("play: no browser to run in");
  process.exit(2);
}
process.exit(failed ? 1 : 0);
