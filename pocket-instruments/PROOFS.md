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
| P1 | One crate, two targets | open |
| P2 | Same trace everywhere | open |
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

**Result:** —

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

**Result:** —

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

**Pass bar:** a written list of differences, each marked deliberate or to fix.

**Result:** —

### P9 — The look is one we may publish

**Claim:** the front panel can be shown in public and submitted to the VCV Library.

**Experiment:** a real mockup, checked against the VCV plugin ethics rule, the Teenage
Engineering design rights in `REFERENCES.md`, and whatever Teenage Engineering says if asked.

**Pass bar:** a written yes from each gate that applies, or a design changed until it gets one.

**If it fails:** the engine and the instruments survive; the skin changes.

**Result:** —
