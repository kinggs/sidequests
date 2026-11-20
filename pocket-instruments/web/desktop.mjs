// P4, the desktop half: open web/ in a real browser, headless, let its AudioWorklet play the
// P2 fixtures in real time, and hold what it captured against the Node harness's report.
//
//   node web/desktop.mjs <node report> [chromium] [firefox]     exits 0 only if every browser passed
//   PI_VOICES=1 node web/desktop.mjs <node report> [...]        P7's count instead: printed, not judged
//
// No Playwright and no debugging protocol: this serves the folder, the page (opened with
// ?auto) posts its result back, and that is all. Each browser gets a throwaway profile.
// A browser that is not installed is reported and skipped; none at all is exit 2.
//
// The pass bar, written before the page first ran (PROOFS.md P4, desktop browsers):
//   - 24 runs: the four format 1 fixtures (the page has no keys; format 2 is Session 12's), both clock sources, 44.1, 48 and 96 kHz, at the rate asked for;
//   - every run's trace is byte for byte the section of the Node report with the same label
//     (the page runs in blocks of 128, so the label is "# name source rate 128");
//   - the page itself judged every run good, no event was dropped, and the fixture list the
//     page carries is the fixtures folder's.
//
// SPDX-License-Identifier: MIT
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)); // pocket-instruments/
const [reportPath, ...asked] = process.argv.slice(2);
if (!reportPath) {
  console.error("usage: desktop.mjs <node report> [chromium] [firefox]");
  process.exit(2);
}
const browsers = asked.length ? asked : ["chromium", "firefox"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };

// The Node report, by label.
const sections = new Map();
for (const part of readFileSync(reportPath, "utf8").split(/^(?=# )/m)) {
  const nl = part.indexOf("\n");
  if (nl > 0) sections.set(part.slice(0, nl), part.slice(nl + 1));
}

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
const voices = !!process.env.PI_VOICES;
const url = `http://127.0.0.1:${server.address().port}/web/index.html?auto${voices ? "=voices" : ""}`;

function launch(name, profile) {
  if (name === "chromium")
    return spawn("chromium", ["--headless=new", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--disable-gpu",
      `--user-data-dir=${profile}`, url], { stdio: "ignore" });
  // Firefox: sound may start without a tap only if the profile says so.
  writeFileSync(join(profile, "user.js"),
    'user_pref("media.autoplay.default", 0);\nuser_pref("media.autoplay.blocking_policy", 0);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\n');
  return spawn("firefox", ["--headless", "--no-remote", "--profile", profile, url], { stdio: "ignore" });
}

function judge(name, r) {
  const bad = [];
  // The page plays the format 1 fixtures: it sends edits, not keys (fixtures/README.md).
  const onDisk = readdirSync(join(root, "fixtures")).filter((f) => f.endsWith(".json"))
    .filter((f) => JSON.parse(readFileSync(join(root, "fixtures", f), "utf8")).format === 1).map((f) => f.replace(/\.json$/, "")).sort();
  const inPage = [...new Set(r.runs.map((x) => x.name))].sort();
  if (inPage.join() !== onDisk.join()) bad.push(`the page ran ${inPage.join(", ")} but the fixtures are ${onDisk.join(", ")}`);
  if (r.runs.length !== 24) bad.push(`${r.runs.length} runs, not 24`);
  if (r.failed) bad.push(`the page counted ${r.failed} failures`);
  for (const rate of [44100, 48000, 96000])
    if (r.runs.filter((x) => x.rate === rate).length !== 8) bad.push(`not eight runs at ${rate} Hz`);
  if (r.runs.some((x) => x.dropped !== 0)) bad.push("events were dropped");
  let matched = 0;
  for (const part of r.report.split(/^(?=# )/m)) {
    const nl = part.indexOf("\n");
    if (nl < 0) continue;
    const label = part.slice(0, nl);
    if (sections.get(label) === part.slice(nl + 1)) matched++;
    else bad.push(`${label}: not the Node report's trace`);
  }
  if (matched !== 24) bad.push(`${matched} of 24 traces are the Node report's`);
  const events = r.runs.reduce((n, x) => n + x.events, 0), blocks = r.runs.reduce((n, x) => n + x.blocks, 0);
  console.log(`P4 ${name}: ${matched} of 24 traces are byte for byte the Node report's; ${events} events in ${blocks} blocks, ABI ${r.runs[0]?.abi}` +
    (r.notes.length ? `; notes: ${[...new Set(r.notes)].join("; ")}` : "") + `\n   ${r.agent}`);
  for (const b of bad.slice(0, 5)) console.log(`P4 ${name} FAILED: ${b}`);
  return bad.length === 0;
}

let ran = 0, failed = 0;
for (const name of browsers) {
  if (spawnSync("sh", ["-c", `command -v ${name}`]).status !== 0) {
    console.log(`P4 ${name}: not installed, skipped`);
    continue;
  }
  ran++;
  const profile = mkdtempSync(join(tmpdir(), `pi-p4-${name}-`));
  const child = launch(name, profile);
  const result = await new Promise((done) => {
    waiting = done;
    setTimeout(() => done(null), 120000);
  });
  waiting = null;
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(profile, { recursive: true, force: true });
  if (!result) {
    console.log(`P4 ${name} FAILED: the page never reported (120 s)`);
    failed++;
  } else if (voices) {
    // A finding on a desktop, not a bar: the bar is the phone's.
    console.log(`P7 ${name}: ${result.held} copies held at ${result.rate} Hz\n` +
      result.stages.map((s) => `   ${s.ok ? "ok" : "NO"} ${s.n}: ${(s.load * 100).toFixed(1)} % of real time, ${s.behind.toFixed(0)} ms behind`).join("\n") +
      (result.notes.length ? `\n   notes: ${result.notes.join("; ")}` : ""));
  } else if (!judge(name, result)) failed++;
}
server.close();
process.exit(ran === 0 ? 2 : failed ? 1 : 0);
