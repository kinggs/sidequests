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
const CMD = { clock: 1, reset: 2, source: 3, tempo: 4, play: 5, step: 16, prob: 17, swing: 18, length: 19, sound: 20, voice: 22, fx: 23, fxsound: 24, route: 25, keep: 26, key_down: 32, key_up: 33, param: 34 };
// Format 2: what a finger did. These land a frame after their step's boundary.
const KEYS = new Set(["key_down", "key_up", "param"]);
const EDITS = new Set(["step", "prob", "swing", "length", "fx", "fxsound", "keep"]);
const PAGE = 65536;
// Where things sit in the one page the host adds (ENGINE.md §8).
// The engine gets the first 4 KiB (core/src/tests/rules.rs holds pi_size to it). The snapshot
// has 1536 bytes (version 4 is 1464: §20; it had 512 until then, for version 3's 408). The
// audio has room for a 128-frame block at 17 channels (PI_AUDIO_BOTH); it had 768 floats, and
// the commands began at 11264, until then. Session 21 moved the view, the events and the audio
// up to make the snapshot's room.
const SNAP = 4096, SNAP_SIZE = 1464, VIEW = 5632, EVENTS = 5760, CAP = 256, AUDIO = 9216, AUDIO_MAX = 128 * 50;
const CMDS = AUDIO + 4 * AUDIO_MAX, CMDS_MAX = Math.floor((PAGE - CMDS) / 12);

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

// D50: the starter pack, in track order, copied once into pages of its own after the host's.
// Returns [address, frames] a track.
function starterPack(m) {
  const dir = here("../samples");
  const names = readFileSync(`${dir}/tracks.txt`, "utf8").trim().split("\n");
  assert.equal(names.length, 16);
  const files = names.map((n) => readFileSync(`${dir}/raw/${n}.s16`));
  const total = files.reduce((a, f) => a + f.length, 0);
  let at = m.pi.memory.grow(Math.ceil(total / PAGE)) * PAGE;
  return files.map((f) => {
    new Uint8Array(m.pi.memory.buffer, at, f.length).set(f);
    const placed = [at, f.length / 2];
    at += f.length;
    return placed;
  });
}

function toCmd(c) {
  const type = CMD[c.cmd];
  assert.ok(type && c.cmd !== "clock" && c.cmd !== "source" && c.cmd !== "tempo", `fixture command ${c.cmd}`);
  // Format 3's fx names a step and nothing else: the step goes in `a` (ENGINE.md §17).
  if (c.cmd === "fx") return { type, a: c.step ?? 0, b: 0, value: c.value ?? 0 };
  if (c.cmd === "route") return { type, a: c.what, b: 0, value: c.value ?? 0 }; // P7 only (§19)
  // Format 4's keep: A in the high sixteen bits of the value, B in the low (ENGINE.md §20).
  if (c.cmd === "keep") return { type, a: c.track, b: c.step, value: ((c.a << 16) | c.b) >>> 0 };
  return { type, a: c.track ?? c.key ?? c.slider ?? 0, b: c.step ?? c.param ?? 0, value: c.value ?? 0 };
}

// What to send and when: [absolute frame, command] in order, the frame the run ends before,
// and (format 2) each view to read: [the frame its block ends on, the text expected there].
function schedule(fx, rate, source, fromSnapshot) {
  const F = (n) => Number((BigInt(n) * BigInt(rate) * 15000n + BigInt(fx.mbpm) - 1n) / BigInt(fx.mbpm));
  let anchor = 0, anchorStep = 0;
  const cmds = [], stepFrames = [];
  if (!fromSnapshot) cmds.push([0, { type: CMD.tempo, a: 0, b: 0, value: fx.mbpm }]);
  cmds.push([0, { type: CMD.source, a: 0, b: 0, value: source }]);
  for (let m = 0; m < fx.steps; m++) {
    const at = anchor + F(m - anchorStep);
    stepFrames.push(at);
    for (const c of fx.commands) {
      if (c.at !== m || KEYS.has(c.cmd)) continue;
      if (fromSnapshot && m === 0 && EDITS.has(c.cmd)) continue; // the snapshot carries these
      cmds.push([at, toCmd(c)]);
      if (c.cmd === "reset") { anchor = at; anchorStep = m; }
    }
    if (source === 1) cmds.push([at, { type: CMD.clock, a: 0, b: 0, value: 0 }]);
    // Keys and sliders: one frame on, so the step's tick 0 is behind them on both sources.
    for (const c of fx.commands) if (c.at === m && KEYS.has(c.cmd)) cmds.push([at + 1, toCmd(c)]);
  }
  const end = anchor + F(fx.steps - anchorStep);
  // A view is read where its run step ends: on the frame the next one falls on. Written for
  // the table run; the edges run differs in that one flag.
  const views = (fx.views ?? []).map((v) => {
    assert.ok(v.at < fx.steps, "a view past the end of the run");
    return [stepFrames[v.at + 1] ?? end, source === 1 ? v.view.replace(" edges=0 ", " edges=1 ") : v.view];
  });
  return { cmds, end, views };
}

// ENGINE.md §14's text line for the view block at `p`: what a format 2 fixture holds. For
// format 3, §17's three fields on its end; for format 4, then §20's two.
function viewText(v, p, format = 2) {
  const flags = v.getUint8(p + 24), flag = (bit) => (flags >> bit) & 1;
  const hex = (n, width) => n.toString(16).padStart(width, "0");
  const fires = Array.from({ length: 16 }, (_, t) => v.getUint8(p + 32 + t)).join(",");
  return `view play=${flag(0)} write=${flag(1)} edges=${flag(2)} sounds=${flag(4)} step=${flag(3) ? v.getUint8(p + 25) : "-"}` +
    ` sel=${v.getUint8(p + 26)} vol=${v.getUint8(p + 27)} tempo=${v.getUint32(p + 4, true)} len=${v.getUint8(p + 28)} swing=${v.getUint8(p + 29)}` +
    ` held=${hex(v.getUint32(p + 8, true), 6)} field=${hex(v.getUint16(p + 12, true), 4)} stitch=${hex(v.getUint16(p + 14, true), 4)}` +
    ` bar=${hex(v.getUint16(p + 16, true), 4)} sampled=${hex(v.getUint16(p + 18, true), 4)} a=${v.getUint16(p + 20, true)} b=${v.getUint16(p + 22, true)} fires=${fires}` +
    (format >= 3 ? ` fx=${v.getUint8(p + 55)} fxsteps=${hex(v.getUint16(p + 56, true), 4)} fxsounds=${hex(v.getUint16(p + 58, true), 4)}` : "") +
    (format >= 4 ? ` ea=${v.getUint16(p + 60, true)} eb=${v.getUint16(p + 62, true)}` : "");
}

// With `audio` (a Float32Array of `end * channels` samples) sound is rendered into it as well,
// in that layout (1 the mix, 16 the tracks, 17 both).
// With `views` a block ends wherever one is to be read; each is held to its text, labelled
// `label`, and added to the lines after the trace, as the report has it.
function run(m, e, cmds, end, block, audio, views = [], label = "", channels = 1, format = 2) {
  const lines = [], seen = [];
  assert.ok(!audio || block * channels <= AUDIO_MAX);
  let next = 0, view = 0;
  for (let start = 0; start < end; ) {
    const n = Math.min(block, (view < views.length ? views[view][0] : end) - start);
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
    // §19: a loop layout is read as well as written. The same numbers harness.cpp gives it.
    if (audio && channels >= 18) {
      const io = new Float32Array(m.pi.memory.buffer, m.base + AUDIO, n * channels);
      for (let f = 0; f < n; f++) for (let c = 0; c < channels; c++) io[f * channels + c] = (((start + f) * 31 + c * 17) % 256) / 256 - 0.25;
    }
    const got = m.pi.pi_process(e, n, m.base + CMDS, count, m.base + EVENTS, CAP, audio ? m.base + AUDIO : 0, audio ? channels : 0);
    if (audio) audio.set(new Float32Array(m.pi.memory.buffer, m.base + AUDIO, n * channels), start * channels);
    for (let i = 0; i < got; i++) {
      const p = m.base + EVENTS + 12 * i;
      const tick = v.getUint32(p + 4, true), type = v.getUint8(p + 8);
      const track = v.getUint8(p + 9), step = v.getUint8(p + 10);
      if (type === 1) lines.push(`${tick} step ${step}\n`);
      else if (type === 2) lines.push(`${tick} trig ${track} ${step}\n`);
      else assert.fail(`unknown event type ${type}`);
    }
    start += n;
    for (; view < views.length && views[view][0] === start; view++) {
      assert.equal(m.pi.pi_view(e, m.base + VIEW, 64), 64);
      const got = viewText(m.view(), m.base + VIEW, format);
      assert.equal(got, views[view][1], `${label}: the view at frame ${start}`);
      seen.push(got + "\n");
    }
  }
  assert.equal(view, views.length, "every view was read");
  assert.equal(m.pi.pi_dropped(e), 0, "no event was dropped");
  return lines.join("") + seen.join("");
}

// A snapshot of the fixture's pattern, from an engine given the tempo and the step-0 edits only.
function snapshotOf(m, fx, rate) {
  const e = engine(m, rate, fx.seed);
  const cmds = [[0, { type: CMD.tempo, a: 0, b: 0, value: fx.mbpm }]];
  for (const c of fx.commands) if (c.at === 0 && EDITS.has(c.cmd)) cmds.push([0, toCmd(c)]);
  run(m, e, cmds, 1, 1);
  assert.equal(m.pi.pi_save(e, m.base + SNAP, SNAP_SIZE), SNAP_SIZE);
  return new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE).slice();
}

// §20: the fixture's snapshot with every step that is on keeping its sound's own A and B.
function keptSnapshotOf(m, fx, rate, snap) {
  const e = engine(m, rate, fx.seed);
  new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE).set(snap);
  assert.equal(m.pi.pi_load(e, m.base + SNAP, SNAP_SIZE), 0);
  const u16 = (i) => snap[i] | (snap[i + 1] << 8);
  const cmds = [];
  for (let t = 0; t < 16; t++) {
    const on = u16(24 + 2 * t), has = u16(404 + 2 * t), ab = ((u16(312 + 4 * t) << 16) | u16(314 + 4 * t)) >>> 0;
    for (let st = 0; st < 16; st++) if ((on >> st) & 1 && !((has >> st) & 1)) cmds.push([0, { type: CMD.keep, a: t, b: st, value: ab }]);
  }
  run(m, e, cmds, 1, 1);
  assert.equal(m.pi.pi_save(e, m.base + SNAP, SNAP_SIZE), SNAP_SIZE);
  return new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE).slice();
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

test("the module imports nothing and its memory grows by a page for the host", { skip }, () => {
  const m = load();
  assert.deepEqual(m.imports, [], "no imports: no glue to write");
  assert.equal(m.pi.pi_abi_version(), 12);
  assert.equal(m.pi.memory.buffer.byteLength, m.base + PAGE);
  // Memory the module was not given is refused, not written.
  assert.equal(m.pi.pi_init(0, m.pi.pi_size(), 48000, 1), 0, "null");
  assert.equal(m.pi.pi_init(m.base + 1, m.pi.pi_size(), 48000, 1), 0, "misaligned");
});

test("every fixture gives its trace on both sources, at every rate and block size", { skip }, () => {
  const m = load();
  const names = readdirSync(FIXTURES).filter((n) => n.endsWith(".json")).sort();
  assert.ok(names.length >= 10);
  let report = "", runs = 0;
  for (const file of names) {
    const fx = JSON.parse(readFileSync(FIXTURES + file, "utf8"));
    const name = file.replace(/\.json$/, "");
    assert.ok([1, 2, 3, 4].includes(fx.format));
    assert.ok(fx.format >= 2 || !fx.views, "views are format 2's to 4's");
    const format = fx.format; // format 3's views carry §17's fields, format 4's §20's too
    assert.equal(fx.ticks_per_step, 96);
    // A run's text is its trace, then its views: run() holds each view to its own line.
    const trace = fx.expect.map((l) => l + "\n").join("");
    const wanted = (views) => trace + views.map((v) => v[1] + "\n").join("");
    for (const [sourceName, source] of SOURCES) {
      for (const rate of RATES) {
        for (const block of BLOCKS) {
          const label = `${name} ${sourceName} ${rate} ${block}`;
          const { cmds, end, views } = schedule(fx, rate, source, false);
          const got = run(m, engine(m, rate, fx.seed), cmds, end, block, null, views, label, 1, format);
          assert.equal(got, wanted(views), label);
          report += `# ${name} ${sourceName} ${rate} ${block}\n${got}`;
          runs++;
        }
        // Save, load into a fresh engine with another seed, same trace.
        const snap = snapshotOf(m, fx, rate);
        const e = engine(m, rate, fx.seed + 12345);
        new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE).set(snap);
        assert.equal(m.pi.pi_load(e, m.base + SNAP, SNAP_SIZE), 0);
        const { cmds, end, views } = schedule(fx, rate, source, true);
        const got = run(m, e, cmds, end, 128, null, views, `${name} ${sourceName} ${rate} from a snapshot`, 1, format);
        assert.equal(got, wanted(views), `${name} ${sourceName} ${rate} from a snapshot`);
        report += `# ${name} ${sourceName} ${rate} snapshot ${hex(snap)}\n${got}`;
        runs++;
        // §20 (Session 21): and from the snapshot a beat entered by keys saves, every step that
        // is on keeping its sound's own A and B (core/src/tests/fixtures.rs says why).
        const kept = keptSnapshotOf(m, fx, rate, snap);
        const k = engine(m, rate, fx.seed + 12345);
        new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE).set(kept);
        assert.equal(m.pi.pi_load(k, m.base + SNAP, SNAP_SIZE), 0);
        const gotKept = run(m, k, cmds, end, 128, null, views, `${name} ${sourceName} ${rate} from a kept snapshot`, 1, format);
        assert.equal(gotKept, wanted(views), `${name} ${sourceName} ${rate} from a kept snapshot`);
        report += `# ${name} ${sourceName} ${rate} kept snapshot ${hex(kept)}\n${gotKept}`;
        runs++;
        // One flipped bit is refused.
        const bad = new Uint8Array(m.pi.memory.buffer, m.base + SNAP, SNAP_SIZE);
        bad[40] ^= 1;
        assert.equal(m.pi.pi_load(e, m.base + SNAP, SNAP_SIZE), -4);
      }
    }
  }
  assert.equal(runs, names.length * 2 * 3 * 5);
  if (process.env.PI_REPORT) writeFileSync(process.env.PI_REPORT, report);
});

// §16: the weave from the .wasm, for the set of views in fixtures/weave-views.txt, as text: a
// digit a cell. The Rust tests and harness.cpp write the same file natively, and `make test`
// holds the three to the same bytes. It needs no engine: the view and the cells sit in the
// host's page.
test("the set of views weaves, from the .wasm", { skip }, () => {
  const m = load();
  const W = 78, H = 15, CELLS = W * H;
  const lines = readFileSync(here("../fixtures/weave-views.txt"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length >= 40, `the set is ${lines.length} views`);
  let report = "";
  for (const l of lines) {
    const [name, flags, hex] = l.split(" ");
    assert.equal(hex.length, 128, name);
    const mem = new Uint8Array(m.pi.memory.buffer);
    for (let i = 0; i < 64; i++) mem[m.base + i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    mem.fill(0xee, m.base + 64, m.base + 64 + CELLS + 1);
    // Refused, and nothing written: a short view, too little room.
    assert.equal(m.pi.pi_weave(m.base, 63, +flags, m.base + 64, CELLS), 0);
    assert.equal(m.pi.pi_weave(m.base, 64, +flags, m.base + 64, CELLS - 1), 0);
    assert.ok(mem.subarray(m.base + 64, m.base + 64 + CELLS).every((b) => b === 0xee));
    assert.equal(m.pi.pi_weave(m.base, 64, +flags, m.base + 64, CELLS), CELLS);
    assert.equal(mem[m.base + 64 + CELLS], 0xee, "nothing past the cells");
    report += `# ${name} ${flags}\n`;
    for (let y = 0; y < H; y++) report += Array.from(mem.subarray(m.base + 64 + y * W, m.base + 64 + (y + 1) * W), (c) => String(c)).join("") + "\n";
  }
  if (process.env.PI_WEAVE) writeFileSync(process.env.PI_WEAVE, report);
});

// P7: the same scenarios harness.cpp renders (every harness/render-*.json), from the .wasm.
// Written only when asked (`make test` sets PI_RENDER); compare.mjs then holds each pair to
// the same bytes.
const SCENARIOS = readdirSync(here(".")).filter((n) => /^render-.*\.json$/.test(n)).sort();
for (const file of SCENARIOS) {
  const name = file.replace(/^render-|\.json$/g, "");
  test(`P7: ${name} renders from the .wasm`, { skip }, () => {
    const m = load();
    const fx = JSON.parse(readFileSync(here(file), "utf8"));
    const pack = fx.samples ? starterPack(m) : [];
    // "delay": 1 lends effect 4 its line (ABI 12, §18): pages of its own after the samples',
    // room for the highest rate, pi_delay_frames(rate) floats of it lent to each engine.
    const line = fx.delay ? m.pi.memory.grow(Math.ceil((4 * m.pi.pi_delay_frames(Math.max(...RATES))) / PAGE)) * PAGE : 0;
    const withPack = (e, rate) => {
      pack.forEach(([at, frames], t) => assert.equal(m.pi.pi_set_sample(e, t, at, frames), 1));
      if (line) assert.equal(m.pi.pi_set_delay(e, line, m.pi.pi_delay_frames(rate)), 1);
      return e;
    };
    // "layouts": the mix alone unless the scenario asks for more. A layout but the mix is
    // written with its channel count in the name (harness.cpp does the same).
    // "loops": the loop layouts (§19), each rendered with its inputs given (run() says how).
    const layouts = [...(fx.layouts ?? [1]), ...(fx.loops ?? [])];
    assert.ok(layouts.includes(1) && (fx.layouts ?? [1]).every((c) => [1, 16, 17].includes(c)) && (fx.loops ?? []).every((c) => [18, 50].includes(c)));
    for (const [sourceName, source] of SOURCES) {
      for (const rate of RATES) {
        const { cmds, end } = schedule(fx, rate, source, false);
        const quiet = run(m, withPack(engine(m, rate, fx.seed), rate), cmds, end, 128);
        const out = {};
        for (const channels of layouts) {
          const audio = new Float32Array(end * channels);
          const loud = run(m, withPack(engine(m, rate, fx.seed), rate), cmds, end, 128, audio, [], "", channels);
          assert.equal(loud, quiet, "sound changes no event");
          assert.ok(audio.some((s) => s !== 0) && audio.every(Number.isFinite), "it made a sound");
          out[channels] = new Uint32Array(audio.buffer);
          const suffix = channels === 1 ? "" : `-${channels}ch`;
          if (process.env.PI_RENDER) writeFileSync(`${process.env.PI_RENDER}-${name}-${sourceName}-${rate}${suffix}.f32`, new Uint8Array(audio.buffer));
        }
        // §15: the seventeen channels are the sixteen, then the mix, bit for bit.
        if (out[17]) {
          assert.ok(out[16], "layout 17 is held to layout 16");
          for (let f = 0; f < end; f++) {
            for (let t = 0; t < 16; t++) if (out[17][f * 17 + t] !== out[16][f * 16 + t]) assert.fail(`${sourceName} ${rate}: frame ${f} track ${t}`);
            if (out[17][f * 17 + 16] !== out[1][f]) assert.fail(`${sourceName} ${rate}: frame ${f}, the mix`);
          }
        }
      }
    }
  });
}
