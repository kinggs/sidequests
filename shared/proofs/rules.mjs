// The rules check on a local Firestore emulator, as the deploy-rules Action runs it, and the
// pieces shared/proofs/mutate.mjs reuses.
//
//   node shared/proofs/rules.mjs                   shared/firestore.rules against shared/rules-check.mjs
//   node shared/proofs/rules.mjs other.rules       another rules file against the same cases
//
// Needs Java 21 (found on PATH, else through `mise exec java@temurin-21`) and npx. The npm
// packages live in a cache folder outside the repo (RULES_DIR, default ~/.cache/sidequests-rules),
// installed there on first use, so nothing lands in the repo.

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RULES = path.join(ROOT, "shared/firestore.rules");
const DIR = process.env.RULES_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "sidequests-rules");

function java21(){
  try { if (/version "2[1-9]/.test(execSync("java -version 2>&1").toString())) return []; } catch {}
  return ["mise", "exec", "java@temurin-21", "--"];
}

function prepare(){
  fs.mkdirSync(path.join(DIR, "shared"), { recursive: true });
  if (!fs.existsSync(path.join(DIR, "node_modules/@firebase/rules-unit-testing"))){
    console.error(`Installing the rules-check packages into ${DIR} (once)…`);
    fs.writeFileSync(path.join(DIR, "package.json"), JSON.stringify({ name: "sidequests-rules", private: true }));
    execSync("npm i --no-save --no-audit --no-fund @firebase/rules-unit-testing firebase firebase-tools", { cwd: DIR, stdio: "inherit" });
  }
  fs.copyFileSync(path.join(ROOT, "shared/rules-check.mjs"), path.join(DIR, "shared/rules-check.mjs"));
}

const portFree = port => new Promise(r => { const s = net.createServer().once("error", () => r(false)).once("listening", () => s.close(() => r(true))).listen(port, "127.0.0.1"); });
const portOpen = port => new Promise(r => { const s = net.connect(port, "127.0.0.1").once("connect", () => { s.end(); r(true); }).once("error", () => r(false)); });

// Start the emulator once; resolves { host, stop }. Each check pushes its own rules to it.
export async function startEmulator(){
  prepare();
  let port = 8181;
  while (!(await portFree(port))) port++;
  fs.writeFileSync(path.join(DIR, "firebase.json"), JSON.stringify({ firestore: { rules: "shared/firestore.rules" }, emulators: { firestore: { host: "127.0.0.1", port }, ui: { enabled: false } } }));
  fs.copyFileSync(RULES, path.join(DIR, "shared/firestore.rules"));
  const [cmd, ...args] = [...java21(), "npx", "firebase-tools", "emulators:start", "--only", "firestore", "--project", "demo-sidequests"];
  const child = spawn(cmd, args, { cwd: DIR, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  child.stdout.on("data", d => log += d); child.stderr.on("data", d => log += d);
  for (let i = 0; i < 120 && !(await portOpen(port)); i++){
    if (child.exitCode !== null) throw new Error("The emulator stopped:\n" + log.slice(-2000));
    await new Promise(r => setTimeout(r, 500));
  }
  if (!(await portOpen(port))) { process.kill(-child.pid); throw new Error("The emulator didn't start:\n" + log.slice(-2000)); }
  return { host: `127.0.0.1:${port}`, stop: () => { try { process.kill(-child.pid, "SIGTERM"); } catch {} } };
}

// Run the cases against `rulesText`. Resolves { pass, fail, failed: [test names] }.
export function check(host, rulesText){
  fs.writeFileSync(path.join(DIR, "shared/firestore.rules"), rulesText);
  return new Promise(resolve => {
    const child = spawn("node", ["--test", "--test-reporter=tap", "shared/rules-check.mjs"], { cwd: DIR, env: { ...process.env, FIRESTORE_EMULATOR_HOST: host } });
    let out = "";
    child.stdout.on("data", d => out += d); child.stderr.on("data", d => out += d);
    child.on("close", () => {
      // Only the tests: a describe is a result too, marked type: 'suite' in its YAML block.
      const lines = out.split("\n"), tests = [];
      lines.forEach((l, i) => {
        const m = l.match(/^ *(ok|not ok) \d+ - (.*)$/);
        if (!m) return;
        let j = i + 1, suite = false;
        if (/^ *---$/.test(lines[j] || "")) for (; j < lines.length && !/^ *\.\.\.$/.test(lines[j]); j++) if (/type: 'suite'/.test(lines[j])) suite = true;
        if (!suite) tests.push({ ok: m[1] === "ok", name: m[2] });
      });
      const failed = tests.filter(t => !t.ok).map(t => t.name);
      resolve({ pass: tests.length - failed.length, fail: failed.length, failed, out });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const file = process.argv[2] ? path.resolve(process.argv[2]) : RULES;
  const emu = await startEmulator();
  try {
    const r = await check(emu.host, fs.readFileSync(file, "utf8"));
    for (const f of r.failed) console.log("FAIL " + f);
    console.log(`${r.pass} pass, ${r.fail} fail (${path.relative(process.cwd(), file)})`);
    process.exitCode = r.fail ? 1 : 0;
  } finally { emu.stop(); }
}
