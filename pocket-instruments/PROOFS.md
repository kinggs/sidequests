# Proofs

What must be true for the plan to stand, and how we find out. Each proof has a pass bar written
before it runs and a kill consequence if it fails. Results are filled in by the session that
runs the proof; the story of what went wrong goes in `LEARNINGS.md`.

State: `open` · `running` · `passed` · `failed` · `dropped` (with the reason).

## The ladder

Ordered by how much of the plan dies if the proof fails, cheapest first. P1 to P4 are the
engineering gate the brief asks for (its D2). Nothing visual is built before P3 passes.

| # | Proof | State |
|---|---|---|
| P1 | One crate, two targets | passed 2026-11-19 |
| P2 | Same trace everywhere | passed 2026-11-19 |
| P3 | It runs in Rack | open |
| P4 | It runs in a phone browser | open |
| P5 | It ships to other people's machines | open |
| P6 | Editing while playing is safe | open |
| P7 | Shared sound is worth sharing | open |
| P8 | It feels like the real thing | open |
| P9 | The look is one we may publish | open |

---

### P1 — One crate, two targets

**Claim:** one Rust crate builds as a native static library and as WebAssembly, with no
allocator and no standard library in the audio path.

**Experiment:** a `no_std` core crate with a C ABI (opaque handle, plain-data buffers). Build
for `x86_64-unknown-linux-gnu` (`staticlib`) and `wasm32-unknown-unknown`.

**Pass bar:**
- one command builds both from a clean checkout;
- the core crate does not link `alloc` at all (strongest form of "no allocation in the callback");
- `panic = "abort"`; no unwinding can reach C;
- the `.wasm` is under 50 KB.

**If it fails:** nothing dies; the constraint that failed gets relaxed and recorded.

**Result: passed, 2026-11-19 (Session 2).** Rust 1.100.0 stable, no nightly feature. Every
bar is checked by `make test` on what was built (`check-p1` in the Makefile), not read off
the source.

| Bar | Measured |
|---|---|
| One command builds both from a clean checkout | `make build`, after `mise install` once. Run in a fresh clone in another folder: both built, and the `.wasm` came out the same bytes (sha256 `cde2db28…`) |
| The crate does not link `alloc` | `#![no_std]`, no dependencies (`cargo tree` is one line). The static library holds our object and `compiler_builtins`, no `alloc`, no `std` |
| `panic = "abort"`; no unwinding reaches C | Set for both profiles. Stronger than asked: our object's only undefined symbols are `memcpy` and `memset`. It does not even ask for `abort`, so no panic path survived the optimiser |
| The `.wasm` is under 50 KB | **5 076 bytes** (opt-level 3, LTO, stripped). It imports nothing and exports `memory` and the ten `pi_` functions |

Other sizes: the engine is 352 bytes, aligned to 8 (`pi_size`, `pi_align`). The static
library is 5 054 228 bytes, of which our object is 9 168; the rest is `compiler_builtins`,
which a linker takes members from only if asked. The module asks for 16 pages (1 MiB, almost
all its own stack) and the host adds one.

⚠ For P3: thirteen `compiler_builtins` members refer to `rust_eh_personality`. Nothing
pulls them in today. If a later change does (128-bit arithmetic would), the Rack link will
ask for that symbol (`LEARNINGS.md`).

### P2 — Same trace everywhere

**Claim:** the same pattern and the same clock give the same musical events on every host, at
every sample rate and block size.

**Experiment:** a language-neutral fixture (JSON): pattern, swing, probability seed, a clock
schedule, and the expected event trace. Run it through the core natively (`cargo test`), as WASM
in Node (`node --test`, no browser), and from a C++ harness linking the static library.

**Pass bar:**
- the three traces are byte-identical;
- the trace is the same at 44.1, 48 and 96 kHz and at block sizes 1, 128 and 512, compared in
  musical time, not in frames;
- event timing and randomness use integers only (no float decides when an event fires).

**If it fails:** the time base in the engine interface is wrong. Redesign it before going on;
this is the cheapest moment to find out.

**Why the fixture is language-neutral:** if Rust is later dropped (P3, P5), the fixtures carry
over unchanged and the core is re-implemented against them.

**Result: passed, 2026-11-19 (Session 2).** No trace was edited and the time base stands.

| Bar | Measured |
|---|---|
| The three traces are byte-identical | Each harness runs 96 runs and writes every trace it produced to a report. The three reports are the same 103 656 bytes (`cmp`; sha256 `07eb64b2aa545335…`), and every trace equals its fixture's `expect` |
| Same at 44.1, 48 and 96 kHz, in blocks of 1, 128 and 512 | 4 fixtures × 2 clock sources (table, edges) × 3 rates × 3 block sizes = 72 runs a harness, plus 24 that load the pattern from a snapshot into an engine with a different seed. `pi_dropped` is 0 in all |
| Integers only | No float type anywhere in the core's source. The ABI carries none |

The harnesses: `cargo test` (30 tests, through the C functions), the raw `.wasm` in Node
(`harness/trace.test.mjs`, no glue, memory grown by one page: `ENGINE.md` §8's plan works),
and C++ linking the static library (`harness/harness.cpp`).

What Session 1's model had not run, now run: block sizes (above); the snapshot (layout byte
for byte, all 316 bytes × 2 bit flips refused with nothing changed, a newer version refused);
a reset (the fourth fixture, its trace written by hand and committed before the core
existed, matched first time; and a reset inside a step); a tempo change and a sample-rate
change mid-step.

The gate can fail: three faults put into the core on purpose (swing following the pattern
step, a reset that reseeds, an edge clock that holds at tick 47) were each caught. The third
only by the rule tests: no fixture swings past tick 47, and the flush hides it from a trace.

Beyond the bar, in the Rust run: on both sources every `STEP` leaves in the exact frame
`fixtures/README.md`'s `F` gives. No drift on the table, no latency on edges.

### P3 — It runs in Rack

**Claim:** a C++ VCV Rack 2 plugin can link the Rust static library and call it once per sample
without glitches or build pain. The brief rates this the highest technical risk.

**Experiment:** a blank-panel module: CLOCK in, RESET in, GATE out, driven by the core. Built
against the Rack 2 SDK on this machine (Rack Free 2.6.6 is installed). Patch Fundamental's
clock in and a scope on the output.

**Pass bar:**
- `make install` in the plugin folder builds Rust then C++ in one step;
- the module loads in Rack 2.6.6, runs ten minutes with no audio dropout, survives a sample-rate
  change and two instances side by side (no global state);
- Rack's CPU meter shows the module under 1 %;
- the gate pattern on the scope matches the P2 fixture.

**If it fails:** Rust-in-Rack is not worth the friction. Fall back to a C++ core compiled to
WASM with Emscripten, re-implemented against the P2 fixtures.

**Result:** —

### P4 — It runs in a phone browser

**Claim:** the same `.wasm` runs inside an AudioWorklet on a phone, in time, and a tap makes a
sound fast enough to feel played.

**Experiment:** a bare page: load the `.wasm` on the main thread, hand it to the worklet,
instantiate it there with no generated glue, click on every step. Capture the trace inside the
worklet. Measure tap-to-sound latency by recording the phone with a second device.

**Pass bar:**
- trace identical to P2 on desktop Chrome, desktop Firefox, Android Chrome and iOS Safari;
- ten minutes with no dropout on a mid-range Android phone;
- tap-to-sound latency measured and written down per device. No pass bar: it is a finding that
  decides whether a live keypad is a good first instrument in the browser.

**If it fails:** on one browser, record it and decide whether that browser matters. On all, the
worklet design is wrong.

**Result:** —

### P5 — It ships to other people's machines

**Claim:** people on Windows, Intel Mac, Apple Silicon and Linux can install the Rack plugin.

**Experiment:** CI builds the plugin with its Rust library for all four Rack targets. Find out,
from VCV, whether the VCV Library will build and list a plugin with a Rust component.

**Pass bar:**
- four artefacts from CI, each loaded once in Rack on its platform;
- a written answer on the Library route: yes, no, or self-hosted releases only.

**If it fails:** if the Library will not take it and the Library matters, the core moves to C++
(see P3's fallback). Decide which before building instruments.

**Result:** —

### P6 — Editing while playing is safe

**Claim:** a pattern can be edited from the UI, and saved or loaded, while audio runs, with no
data race and no audible glitch, on both hosts.

**Experiment:** the C++ harness runs the core on one thread while a second thread edits steps
and takes snapshots, under ThreadSanitizer. Then the same in Rack (save a patch while playing)
and in the browser.

**Pass bar:** ThreadSanitizer clean; no dropout; a saved pattern reloads to the same P2 trace
on the other host.

**If it fails:** the engine interface needs an explicit command queue and snapshot scheme
before any instrument is built on it.

**Result:** —

### P7 — Shared sound is worth sharing

**Claim (the brief's D5):** synthesis written once in the core sounds the same in both hosts
and is cheap enough on a phone.

**Experiment:** one drum voice in the core. Render natively and in WASM; compare. Count how
many voices a mid-range phone runs before dropping out.

**Pass bar:** the two renders differ by less than −80 dB; at least 16 voices on the phone.

**If it fails:** share sequencing only; write sound per host.

**Result:** —

### P8 — It feels like the real thing

**Claim:** the workflow is recognisably the hardware's.

**Experiment:** the owner plays the PO-12 and the prototype side by side and lists every
difference in what a press does.

**Pass bar:** a written list of differences, each marked deliberate or to fix. Someone who
learned a task on the prototype can do it on the hardware without being told how (D22).

**Result:** —

### P9 — The look is one we may publish

**Claim:** the front panel can be shown in public and submitted to the VCV Library.

**Experiment:** a real mockup, checked against the VCV plugin ethics rule, the Teenage
Engineering design rights in `REFERENCES.md`, and whatever Teenage Engineering says if asked.

**Pass bar:** a written yes from each gate that applies, or a design changed until it gets one.

**If it fails:** the engine and the instruments survive; the skin changes.

**Result:** —
