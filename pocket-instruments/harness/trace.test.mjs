// P2 in Node: the raw .wasm, no glue, every fixture on both clock sources at three sample
// rates and three block sizes. fixtures/README.md says how a harness runs one; the Rust
// tests (core/src/tests/fixtures.rs) and harness.cpp do the same and write the same report.
//
// Skips when the .wasm has not been built, so the repo's `node --test` passes on a machine
// with no Rust. `make test` in pocket-instruments sets PI_REQUIRE_WASM so a skip is a failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const WASM = here("../target/wasm32-unknown-unknown/release/pi_core.wasm");
const FIXTURES = here("../fixtures/");
const built = existsSync(WASM);
const skip = built || process.env.PI_REQUIRE_WASM ? false : "pi_core.wasm is not built (make -C pocket-instruments build)";

const RATES = [44100, 48000, 96000];
const BLOCKS = [1, 128, 512];
const SOURCES = [["table", 0], ["edges", 1]];
const CMD = { clock: 1, reset: 2, source: 3, tempo: 4, play: 5, step: 16, prob: 17, swing: 18, length: 19 };
const EDITS = new Set(["step", "prob", "swing", "length"]);
const PAGE = 65536;
// Where things sit in the one page the host adds (ENGINE.md §8).
const SNAP = 1024, EVENTS = 2048, CAP = 256, CMDS = 8192, CMDS_MAX = (PAGE - CMDS) / 12;

function load() {
  const module = new WebAssembly.Module(readFileSync(WASM));
  const imports = WebAssembly.Module.imports(module);
  const instance = new WebAssembly.Instance(module, {});
  const pi = instance.exports;
  // The host's memory: one page past whatever the module asked for.
  const base = pi.memory.grow(1) * PAGE;
  return { pi, base, imports, view: () => new DataView(pi.memory.buffer) };
}

function engine(m, rate, seed) {
  const size = m.pi.pi_size();
  assert.ok(size <= SNAP, `pi_size ${size} fits before the snapshot buffer`);
  assert.equal(m.base % m.pi.pi_align(), 0);
  const e = m.pi.pi_init(m.base, size, rate, seed);
  assert.equal(e, m.base, "pi_init returns the memory it was given");
  return e;
}

function toCmd(c) {
  const type = CMD[c.cmd];
  assert.ok(type && c.cmd !== "clock" && c.cmd !== "source" && c.cmd !== "tempo", `fixture command ${c.cmd}`);
  return { type, a: c.track ?? 0, b: c.step ?? 0, value: c.value ?? 0 };
}

// What to send and when: [absolute frame, command] in order, and the frame the run ends before.
function schedule(fx, rate, source, fromSnapshot) {
  const F = (n) => Number((BigInt(n) * BigInt(rate) * 15000n + BigInt(fx.mbpm) - 1n) / BigInt(fx.mbpm));
  let anchor = 0, anchorStep = 0;
  const cmds = [];
  if (!fromSnapshot) cmds.push([0, { type: CMD.tempo, a: 0, b: 0, value: fx.mbpm }]);
  cmds.push([0, { type: CMD.source, a: 0, b: 0, value: source }]);
  for (let m = 0; m < fx.steps; m++) {
    const at = anchor + F(m - anchorStep);
    for (const c of fx.commands) {
      if (c.at !== m) continue;
      if (fromSnapshot && m === 0 && EDITS.has(c.cmd)) continue; // the snapshot carries these
      cmds.push([at, toCmd(c)]);
      if (c.cmd === "reset") { anchor = at; anchorStep = m; }
    }
    if (source === 1) cmds.push([at, { type: CMD.clock, a: 0, b: 0, value: 0 }]);
  }
  return { cmds, end: anchor + F(fx.steps - anchorStep) };
}

function run(m, e, cmds, end, block) {
  const lines = [];
  let next = 0;
  for (let start = 0; start < end; ) {
    const n = Math.min(block, end - start);
    const v = m.view();
    let count = 0;
    for (; next < cmds.length && cmds[next][0] < start + n; next++, count++) {
      assert.ok(count < CMDS_MAX);
      const [frame, c] = cmds[next];
      const p = m.base + CMDS + 12 * count;
      v.setUint32(p, frame - start, true);
      v.setUint8(p + 4, c.type);
      v.setUint8(p + 5, c.a);
      v.setUint8(p + 6, c.b);
      v.setUint8(p + 7, 0);
      v.setUint32(p + 8, c.value, true);
    }
    const got = m.pi.pi_process(e, n, m.base + CMDS, count, m.base + EVENTS, CAP);
    for (let i = 0; i < got; i++) {
      const p = m.base + EVENTS + 12 * i;
      const tick = v.getUint32(p + 4, true), type = v.getUint8(p + 8);
      const track = v.getUint8(p + 9), step = v.getUint8(p + 10);
      if (type === 1) lines.push(`${tick} step ${step}\n`);
      else if (type === 2) lines.push(`${tick} trig ${track} ${step}\n`);
      else assert.fail(`unknown event type ${type}`);
    }
    start += n;
  }
  assert.equal(m.pi.pi_dropped(e), 0, "no event was dropped");
  return lines.join("");
}

// A snapshot of the fixture's pattern, from an engine given the tempo and the step-0 edits only.
function snapshotOf(m, fx, rate) {
  const e = engine(m, rate, fx.seed);
  const cmds = [[0, { type: CMD.tempo, a: 0, b: 0, value: fx.mbpm }]];
  for (const c of fx.commands) if (c.at === 0 && EDITS.has(c.cmd)) cmds.push([0, toCmd(c)]);
  run(m, e, cmds, 1, 1);
  assert.equal(m.pi.pi_save(e, m.base + SNAP, 316), 316);
  return new Uint8Array(m.pi.memory.buffer, m.base + SNAP, 316).slice();
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

test("the module imports nothing and its memory grows by a page for the host", { skip }, () => {
  const m = load();
  assert.deepEqual(m.imports, [], "no imports: no glue to write");
  assert.equal(m.pi.pi_abi_version(), 1);
  assert.equal(m.pi.memory.buffer.byteLength, m.base + PAGE);
  // Memory the module was not given is refused, not written.
  assert.equal(m.pi.pi_init(0, 1024, 48000, 1), 0, "null");
  assert.equal(m.pi.pi_init(m.base + 1, 1024, 48000, 1), 0, "misaligned");
});

test("every fixture gives its trace on both sources, at every rate and block size", { skip }, () => {
  const m = load();
  const names = readdirSync(FIXTURES).filter((n) => n.endsWith(".json")).sort();
  assert.ok(names.length >= 4);
  let report = "", runs = 0;
  for (const file of names) {
    const fx = JSON.parse(readFileSync(FIXTURES + file, "utf8"));
    const name = file.replace(/\.json$/, "");
    assert.equal(fx.format, 1);
    assert.equal(fx.ticks_per_step, 96);
    const want = fx.expect.map((l) => l + "\n").join("");
    for (const [sourceName, source] of SOURCES) {
      for (const rate of RATES) {
        for (const block of BLOCKS) {
          const { cmds, end } = schedule(fx, rate, source, false);
          const got = run(m, engine(m, rate, fx.seed), cmds, end, block);
          assert.equal(got, want, `${name} ${sourceName} ${rate} ${block}`);
          report += `# ${name} ${sourceName} ${rate} ${block}\n${got}`;
          runs++;
        }
        // Save, load into a fresh engine with another seed, same trace.
        const snap = snapshotOf(m, fx, rate);
        const e = engine(m, rate, fx.seed + 12345);
        new Uint8Array(m.pi.memory.buffer, m.base + SNAP, 316).set(snap);
        assert.equal(m.pi.pi_load(e, m.base + SNAP, 316), 0);
        const { cmds, end } = schedule(fx, rate, source, true);
        const got = run(m, e, cmds, end, 128);
        assert.equal(got, want, `${name} ${sourceName} ${rate} from a snapshot`);
        report += `# ${name} ${sourceName} ${rate} snapshot ${hex(snap)}\n${got}`;
        runs++;
        // One flipped bit is refused.
        const bad = new Uint8Array(m.pi.memory.buffer, m.base + SNAP, 316);
        bad[40] ^= 1;
        assert.equal(m.pi.pi_load(e, m.base + SNAP, 316), -4);
      }
    }
  }
  assert.equal(runs, names.length * 2 * 3 * 4);
  if (process.env.PI_REPORT) writeFileSync(process.env.PI_REPORT, report);
});
