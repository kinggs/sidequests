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
| P3 | It runs in Rack | passed 2026-11-19 |
| P4 | It runs in a phone browser | running: both desktop browsers, Android Chrome and the ten minutes passed 2026-11-19; iOS Safari and the tap latency are left |
| P5 | It ships to other people's machines | running: CI builds and checks all four plugins (2026-11-19, Session 6); none loaded in Rack off this laptop yet; VCV answered 2026-11-23 (R46: binaries from a verified author, not built by the Library); macOS 10.9 not met (the owner accepts 10.12, D46) |
| P6 | Editing while playing is safe | running: ThreadSanitizer half and the save in Rack passed 2026-11-19, with a finding (D43); the browser's saved pattern passed 2026-11-23 (Session 12); left: listening for a dropout on a phone while editing |
| P7 | Shared sound is worth sharing | passed 2026-11-19 |
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

**Tried in Session 3, and the warning was wrong for Linux.** A 128-bit division was put
into the core on purpose. The plugin linked, took `__udivti3` and nothing else, and asked
for no Rust runtime symbol. `rack/Makefile`'s `check-link` now fails the build if one ever
appears (shown to fail on a planted reference). ⚠ Not tried on the other three linkers.

**Since Session 3 (ABI 2, sound):** the `.wasm` is 6 362 bytes with 11 exports, the engine
is 432 bytes, and our object still asks only for `memcpy` and `memset`. `make test` still
checks all four bars on every run.

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

Since Session 10 (2026-11-20, ABI 4): seven fixtures, 168 runs a harness, still one report.
The three new ones (fixture format 2: keys, sliders and views) were worked out by hand and
committed before the code that runs them, and passed at the first run. The four above did
not move: their 96 report sections are the same bytes as before the session.

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

**Result: passed, 2026-11-19 (Session 3).** D13's kill criterion is not met: Rust links
into a Rack plugin and runs there. The machine's half ran first and is the table below as
first written; the owner's half ran the same afternoon and is the table after it.

What was built: `rack/`, a plugin with one module, the Probe. It plays a P2 fixture round
and round on the core, one `pi_process` call a sample, and checks every pass against that
fixture's trace, compiled in from `fixtures/*.json`. CLOCK patched: the core follows the
edges. Unpatched: its own table clock. So "the gate matches the fixture" is counted as well
as seen.

| Bar | Measured |
|---|---|
| `make install` builds Rust then C++ in one step | Yes. From `make clean` and with the Rust target folder removed: exit 0 in 1.9 s, one `cargo rustc` and three `g++` commands, and `PocketInstruments-2.0.0-lin-x64.vcvplugin` in Rack's plugin folder. `RACK_DIR` defaults to `~/.local/opt/Rack-SDK-2.6.6` |
| Loads in Rack 2.6.6 | Yes: Rack Free 2.6.6 itself, headless (`rack/selftest.sh`), "Loaded plugin PocketInstruments 2.0.0" |
| Two instances side by side | Four, in one patch, a fixture each: three clocked by a Fundamental LFO's square at 256 Hz, one on its own clock. In 12 s at each of 44.1, 48 and 96 kHz: 63, 190, 95 and 2 passes matched; 0 mismatched; 0 events dropped. No global state: each engine is in its module's own memory |
| The gate pattern matches the P2 fixture | By count, yes: every pass above is the fixture's trace, event for event. ⚠ By eye on the scope: **left for the owner** |
| Ten minutes with no audio dropout | **Left for the owner.** No audio device in a headless run |
| Survives a sample-rate change | Half. It runs clean when started at each of the three rates. ⚠ A change while playing is **left for the owner**: on edges the pass in hand must still match; on the table clock the probe starts its pass again and counts it as cut short |
| CPU meter under 1 % | **Left for the owner.** Headless Rack has no meter |

The link: `plugin.so` is 1 016 912 bytes before stripping. It holds `pi_process` and asks
for no Rust runtime symbol (`check-link`, every build). The Rust library is built with
Rack's own CPU flag (`-C target-cpu=nehalem`).

The checks can fail: swing made to follow the pattern step in the core gave "0 passes
matched, 42 did not" on the swing fixture and a failed self-test; a planted reference to
`rust_eh_personality` failed `check-link`.

**The owner's half, the same afternoon.** Rack Free 2.6.6 with its window and a sound card
(a Scarlett), on `rack/build/P3.vcv`: two probes, a Scope, and a quiet sine to the output
so that a dropout would be heard. It ran about fifteen minutes. The counts were read from
Rack's log and its autosave while it was still playing.

| Bar left above | Measured |
|---|---|
| Ten minutes with no audio dropout | The owner listened for ten minutes and heard no click. The log runs to 897 s with no warning in it |
| Survives a sample-rate change | Changed from 96 kHz to 48 kHz while playing, at about 650 s. The probe on the LFO's clock was mid-pass and that pass still matched: 0 cut short, 0 mismatched. The probe on its own clock started its pass again, as built: 1 cut short. Both went on matching at 48 kHz |
| Two instances side by side | Clocked probe (swing-length-change): 39 passes matched. Own-clock probe (straight-sixteenths): 232 matched. 0 mismatched and 0 events dropped in either |
| CPU meter under 1 % | 0.1 % for each probe, on Rack's meter (the owner's screenshot) |
| The gate pattern on the scope matches the P2 fixture | By count: every one of the 271 passes above is its fixture's trace, event for event. By eye: the owner saw both gates firing with the clock, 0 to 10 V on both Scope inputs, both lights green. ⚠ Nobody measured the swing on the Scope's screen; the count is the evidence that it is right |

Rack was also closed and started again at 96 kHz before this run: each probe loaded the
snapshot Rack had saved for it ("1 loaded, 0 refused").

**Since Session 13 (2026-11-23): the instrument in the same run.** `rack/selftest.sh` also
runs the Rhythm module on the three format 2 fixtures, each on its table clock and on a
second LFO at 8 Hz. Each module presses its own parameters, one a frame from the frame
after each step's boundary, and holds its events, its views and its slider caps to the
fixture. Every run matched, at each of 44.1, 48 and 96 kHz: at 48 kHz, 7, 5 and 2 passes
on each clock, with 95, 53 and 26 views held and none missed. The two fixtures that fire
sounded and sent triggers. One ran with its VOICES patched into its own RETURN. A Rhythm
module given an old patch's version 1 snapshot loaded it. Nine planted faults in the module,
each caught, and nine in `rack/src/jacks.hpp` caught by `rack/test/jacks.cpp` (`PLAN.md`,
Session 13's Handover). Not seen headless: anything drawn or pressed by
hand. A screenshot from Rack's `-t` mode shows the panel and widgets drawn.

The patch's wiring, which had never been seen on a screen when it was written, was right.

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

**Result: running. Both desktop browsers passed, 2026-11-19 (Session 3).** The phones
are left, and with them the two bars that are about phones.

What was built: `web/index.html` and `web/worklet.js`, bare on purpose. The page fetches
the raw `.wasm` and sends its bytes to the worklet, which compiles them there, grows the
module's memory by one page and puts the engine and buffers in it. No generated glue; the
module imports nothing. `web/desktop.mjs` opens the page in a headless browser, which plays
all four fixtures in real time on both clocks at 44.1, 48 and 96 kHz, ticking on every
step, and posts back what its worklet captured.

| Bar | Measured |
|---|---|
| Trace identical to P2 on desktop Chrome | Chromium 155 (headless): 24 of 24 runs are byte for byte the section of the Node harness's report with the same label. 1 662 events in 46 682 blocks of 128; none dropped; each context ran at the rate asked for |
| … on desktop Firefox | Firefox 158 (headless): the same 24 of 24, the same counts |
| … on Android Chrome and iOS Safari | **Left for the owner** |
| Ten minutes with no dropout on a mid-range Android phone | **Left for the owner.** The page's Play button runs the engine's own click on every step and shows how far audio has fallen behind the clock ⚠ an untested stand-in for hearing a dropout |
| Tap-to-sound latency per device | **Left for the owner.** The page's Tap pad fires the click through the new `FIRE` command (D45) on `pointerdown` |

⚠ Chromium here is the Arch build, not Google Chrome, and both browsers ran headless.

**The owner's phone, the same day: a Samsung Galaxy S25 FE.** As the owner reported it;
no screenshot was kept, so the page's own figures are not here.

| Bar | Reported |
|---|---|
| Trace identical to P2 on Android Chrome | Run the proof said PASSED, on the first page and again on the changed one: 24 of 24 runs gave their fixture's trace, by the page's own comparison with each fixture's `expect` |
| … on iOS Safari | **Left.** No iPhone has run it |
| Ten minutes with no dropout | **Met: 700 s.** A first run was stopped at 400 s (18 ms behind at 163 s and at 400 s). The owner then let one run on: 18 ms at 520 s, 19 ms at 600 s, 20 ms at 700 s, at 44.1 kHz, and reported no failure. That is 2 ms in nine minutes, about four parts in a million: the phone's two clocks running at slightly different speeds, not a stall, which would jump by a block or more at a time. ⚠ The phone locked or went idle now and then during the run and the figure did not jump. ⚠ Which browser was not established (the owner read out "Mozilla 5.0", which every browser says) |
| Tap-to-sound latency | **Left**, with one figure to start from: during that run the page showed base latency 0.0 ms and **output latency 268.1 ms**, as the browser reports it. ⚠ If that is true of the wired speaker it is too slow to feel played; it may be Bluetooth, which was connected for some of the day's runs. Tap "behaves as expected" to the finger. Not measured with a second device |

Also run by the owner, with the page's result text pasted back:

- **Firefox 160 for Android, the same phone:** PASSED, 24 of 24, each context at the rate
  asked for (44.1, 48 and 96 kHz). The bar does not name this browser; it is a fourth.
- **Chromium 155 on the desktop with its window, not headless:** PASSED, 24 of 24. Play
  there: 48 kHz, base latency 10.7 ms, output latency 32.0 ms, audio at most 5 ms behind
  the clock after 10 s. A soak, not the bar's ten minutes: the bar is the phone's.

Block counts were the same on the phone and the desktop, run for run (1 379 blocks for
straight-sixteenths at 44.1 kHz on both): the worklet saw 128-frame blocks everywhere.

**A first run on the owner's phone** (2026-11-19, before the page was changed) crackled
during Run the proof, "like vinyl", with and without Bluetooth, while Play and Tap were
clean. ⚠ Not yet explained for certain. The likely cause was the page's own doing: all
eight runs ticked at once, at four tempos. Now only one run ticks, so anything else heard
is a fault. That run passed, the owner said afterwards. On the changed page the crackle was
gone (the owner, the same day), so it was the eight tick trains and not a dropout.

The check can fail: a worklet made to skip the swing command gave 12 of 24 and a failed
run; a stale `web/pi_core.wasm` fails `make test`.

**To finish it:** `web/` is served by GitHub Pages as it stands (the `.wasm` is committed
beside the page, and `make test` fails if it is not the one just built). On each phone open
`…/sidequests/pocket-instruments/web/`, press Run the proof, then Play for ten minutes, then
film the Tap pad with a second device.

### P5 — It ships to other people's machines

**Claim:** people on Windows, Intel Mac, Apple Silicon and Linux can install the Rack plugin.

**Experiment:** CI builds the plugin with its Rust library for all four Rack targets. Find out,
from VCV, whether the VCV Library will build and list a plugin with a Rust component.

**Pass bar:**
- four artefacts from CI, each loaded once in Rack on its platform;
- a written answer on the Library route: yes, no, or self-hosted releases only.

**If it fails:** if the Library will not take it and the Library matters, the core moves to C++
(see P3's fallback). Decide which before building instruments.

**Result: running. The half that needs no VCV and no second machine, 2026-11-19
(Session 3).** Not passed: nothing here is one of the bar's four artefacts, and there is no
answer from VCV.

`make targets` cross-compiles the static library for all four Rack targets from this
laptop and checks each against R16 (`harness/targets.sh`). A `staticlib` of a `no_std`
crate needs no linker and no SDK, only rustup's copy of each target's core library.

| Target | Built | Our object | Needs from the platform | R16 |
|---|---|---|---|---|
| Linux x64 (`x86_64-unknown-linux-gnu`) | yes | ELF x86-64 | `memcpy`, `memset` | glibc 2.23: **met** (both symbols predate it). No instruction newer than Nehalem: **met** |
| Windows x64 (`x86_64-pc-windows-gnu`) | yes | COFF x86-64, the MinGW kind | `memcpy`, `memset` | MinGW: **met as far as an object can show**. Nehalem: **met** |
| macOS x64 (`x86_64-apple-darwin`) | yes | Mach-O x86-64 | `memcpy`, `__bzero`, `memset_pattern16` | Nehalem: **met**. macOS 10.9: **NOT MET**: the object is stamped 10.12, rustc's floor (R38) |
| macOS arm64 (`aarch64-apple-darwin`) | yes | Mach-O arm64, built for a generic armv8 | `memcpy`, `memset_pattern16` | Stamped macOS 11.0, the first there was for Apple Silicon: **met** |

The macOS 10.9 finding, plainly: Rack's SDK builds plugins for 10.9 and stable Rust will
not stamp an object below 10.12. ⚠ Unverified, but likely harmless: the core calls three
memory routines that every macOS has, so nothing in it can need 10.12. A real macOS linker
will probably warn and link. Nobody has seen it do so.

**The owner's ruling (D46):** the plugin needs macOS 10.12 on Intel Macs. The bar above is
not changed and is not met on this line; the ruling is why that does not stop the work.

The Linux plugin built on this laptop is not an artefact for other people: it asks for
glibc 2.35 through the statically linked C++ runtime (R42). VCV's toolchain exists to
avoid exactly that.

The check can fail: a library built for Haswell failed on `shlxl` and `vmovups`; the Linux
library offered as the Windows one failed on its format; 128-bit arithmetic failed on
`_udivti3`.

**What the full proof still needs:**

1. ~~A plugin linked for each of the four targets by a real toolchain.~~ Done by CI on
   native runners, Session 6 (below).
2. ~~On the macOS link: what the linker says about the 10.12 stamp.~~ It warns and links
   (below).
3. Each of the four artefacts loaded once in Rack on its platform. The Probe's light going
   green is the test: it is in the plugin already. ⚠ The owner has no Windows machine or
   Mac to do this on yet (D46).
4. A written answer from VCV on the Library: will its build server take a plugin with a
   Rust part, or a prebuilt static library, or neither (O2). **Asked 2026-11-19** by the
   owner, by email to support@vcvrack.com, the one address VCV's support page gives for
   Library questions. ~~No reply yet. The forum's Development category is the fallback.~~
   **Answered 2026-11-23 (R46):** neither is built by the Library. Its toolchain has no Rust,
   so the plugin goes in as binary packages (CI's four artefacts are that), sent by email by
   an author VCV has identity-verified. macOS 10.12 is fine. What the submission needs is
   not known until the owner asks VCV for the details.

**Session 6, 2026-11-19: four artefacts from CI.** Item 1 above is done; item 2 is
answered. Still not passed: none of the four has been loaded in Rack on its platform, and
~~VCV has not answered~~ (VCV answered 2026-11-23: item 4).

`.github/workflows/pocket-instruments-rack.yml` links the plugin on each platform's own
toolchain, checks the finished `.vcvplugin` with `rack/check-dist.sh`, and uploads it. It
runs on every push that touches the core, the fixtures or `rack/`, and by hand from the
Actions tab. First green run:
[44540561514](https://github.com/kinggs/sidequests/actions/runs/44540561514) (commit
`d16ee89`); its artefacts expire 2027-02-17.

| Platform | Built on | What the check found | Size | sha256 (first 16) |
|---|---|---|---|---|
| lin-x64 | Ubuntu 16.04 in Docker: gcc 5.4, glibc 2.23, rustc 1.100.0 | glibc symbols up to 2.14 (2.23 allowed); needs `libRack.so`, `libm`, `libc` only | 43 717 | `67ad4376c3a8a488` |
| win-x64 | MSYS2 MINGW64 on `windows-latest` | needs `libRack.dll`, `KERNEL32`, `msvcrt`, `libgcc_s_seh-1`, `libwinpthread-1`: the last two ship beside `Rack.exe` (R44) | 101 802 | `b725ceb5e30a03e1` |
| mac-x64 | Apple clang on `macos-latest` (Apple Silicon), cross to x86_64 | x86_64 only; finds libRack in `/tmp/Rack2`; stamped macOS 10.9 | 31 538 | `625d6251fa99a02a` |
| mac-arm64 | Apple clang on `macos-latest` | arm64 only; finds libRack in `/tmp/Rack2`; stamped macOS 11.0 | 28 716 | `232ddc336d18f6af` |

On every platform the plugin holds `pi_process` and needs no Rust runtime symbol
(`check-link` in `rack/Makefile`, now per platform).

**Item 2, the macOS link:** the linker warns and links. `ld: warning: object file
(…libpi_core.a…) was built for newer 'macOS' version (10.12) than being linked (10.9)`.
The plugin is stamped 10.9 because the SDK links it for 10.9, but its core was built for
10.12. ⚠ Whether it runs on 10.9 to 10.11 is unknown and, under D46, does not matter.

The check can fail: the laptop's own Linux plugin failed on `GLIBC_2.35` (R42); the first
Windows run failed on `libgcc_s_seh-1.dll`, before R44 showed Rack ships it; each artefact
renamed as another platform failed, and so did a DLL renamed as a `.so` and the reverse.

⚠ Not checked: whether macOS lets Rack load a plugin that was downloaded from GitHub. The
dylibs are signed ad hoc, as the SDK's `dist` does, not with a developer identity. Phona's
author signs his Mac build (R16b).

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

**Result: running. The ThreadSanitizer half passed, 2026-11-19 (Session 3), and
changed `ENGINE.md`.** The "if it fails" clause is half met: the core's interface held, but
the host recipe in §8 was unsafe as written and is corrected (D43, proposed).

`harness/race.cpp` (`make race`, part of `make test`): the core on an audio thread; a
second thread sending edits and loads and taking snapshots, through
`rack/src/handoff.hpp`, the file the Rack module uses. Three independent checks: the
sanitizer; every snapshot taken is whole (a private engine loads it); nothing is lost or
reordered (a model engine given the same messages must end each round with the same bytes).

| Bar | Measured |
|---|---|
| ThreadSanitizer clean | Clean, twice: flat out (about 100 000 blocks, 19 000 publishes, 28 000 snapshots taken) and with an idle audio thread (10 884 blocks, 1.1 million snapshots taken). 3 804 rounds, 19 862 edits and 760 loads each time; 0 torn, 0 rounds where the snapshot was not the model's; 0 events dropped |
| No dropout | In Rack: none heard in ten minutes, while Rack autosaved the patch every 15 s and the probes published 313 snapshots between them. In the browser (Session 12): headless on the laptop, the audio clock stayed within 1 ms of the page's over 4.3 s of play with keys going in, in Chromium and Firefox. Not heard. **Left**: on a phone, by ear, editing while it plays |
| A saved pattern reloads to the same P2 trace on the other host | From the harness, yes: each fixture's pattern was entered as edits while the core played, the snapshot taken, and those exact 316 bytes are ones the wasm host loaded in `make test` and got that fixture's trace from (four of four). From a patch saved in Rack while it played: yes. `rack/check-patch.mjs` on Rack's own autosave, taken at 14:37 with Rack still playing: both probes' snapshots are whole, and each is byte for byte one the wasm host loaded and got that fixture's trace from. ⚠ It was Rack's autosave, not File › Save As; both call the module's same `dataToJson` on Rack's thread |

**The findings** (`ENGINE.md` §8 now says all of this):

1. "Two buffers and an atomic index" is a data race. The sanitizer reports it at once. It
   never produced a torn snapshot in ordinary runs here, and would need a reader stalled
   across two publishes to do so. Three buffers and one atomic exchange are clean.
2. A second thread may not call even the reading functions: `pi_save` beside `pi_process`
   is a race.
3. A load must travel in the same queue as the edits. On its own channel a load and the
   edit sent straight after it can swap; that left the snapshot wrong in 3 116 of 3 804 rounds.
4. A save can miss the last block's edits unless the audio thread publishes how far it has
   got; and when no audio is running there is nothing newer to save.

⚠ What the sanitizer cannot see: the core is Rust, and stable Rust cannot be built with
ThreadSanitizer. Every call into the core goes through a wrapper that touches one plain
byte, so two threads in the core at once race where the sanitizer looks. It also caught the
two-buffer race from inside the core's own `memset`, which it does intercept.

Five faults were put in on purpose and each is still run by `make race` on every build:
two buffers and direct save (sanitizer, exit 66), a load on its own channel, a dropped edit
and a flipped bit (the harness, exit 1). A sixth: the snapshot comparison fails against an
empty report.

In Rack so far: the Probe publishes a snapshot whenever the pattern changes and Rack's own
thread saves the latest. Headless Rack loaded a good snapshot from a patch ("1 loaded") and
refused one with a flipped bit ("1 refused").

Since Session 10 (2026-11-20): the second thread's messages are half edits and half keys
and sliders (`ENGINE.md` §13), the model is pressed the same keys, and the audio thread
hands a view out through `pi::Latest` after every block. Clean, twice: 4 407 rounds, 26 803
messages and 880 loads each time; about 33 000 views read flat out and 14 500 with an idle
audio thread, none torn. A sixth planted fault, a view handed over with its volume byte
cleared, is caught (exit 1). Seven snapshots taken while playing, one a fixture.

**Since Session 12 (2026-11-23): the browser's half.** `web/rhythm.html`'s worklet posts
a copy of the snapshot when the generation moves (at most four a second), so there is no
shared memory to race on; a load travels in the same queue as the keys (§8). `make play`
(`web/play.mjs`), in headless Chromium 155 and Firefox 158 at 48 kHz: with the page
playing, the pattern is cleared and `straight-sixteenths`' pattern entered again by pointer
events on the drawn keys; the snapshot the page then saved and kept in the browser is byte
for byte a `# straight-sixteenths … snapshot` label in the Node report, so the wasm host
loaded those bytes and gave that fixture's trace (as `harness/race.sh` checks Rack's).
Both browsers passed. A page whose seed was 2 was caught (the bytes are in no label), and
so was one that kept only its first snapshot.

**To finish it:** listen on a phone while editing: play a beat, enter steps, move sliders,
for a few minutes, and hear no dropout. The owner's, with P8's first sitting. (To repeat the Rack row:
`node rack/check-patch.mjs ~/.local/share/Rack2/autosave/patch.json target/report-node.txt`
while Rack plays.)

### P7 — Shared sound is worth sharing

**Claim (the brief's D5):** synthesis written once in the core sounds the same in both hosts
and is cheap enough on a phone.

**Experiment:** one drum voice in the core. Render natively and in WASM; compare. Count how
many voices a mid-range phone runs before dropping out.

**Pass bar:** the two renders differ by less than −80 dB; at least 16 voices on the phone.

**If it fails:** share sequencing only; write sound per host.

**Result: passed, 2026-11-19.** The render half in Session 3; the phone's voice count the
same day, by the owner. The account below is as first written, with the count at its end.

One voice in the core: the click (key 10, track 9), a sine with an exponential decay, the
simplest recipe in `VOICES.md` that still has both things two platforms could disagree
about. Sound crosses the ABI as a buffer on `pi_process` (ABI 2; D44, proposed).

| Bar | Measured |
|---|---|
| The two renders differ by less than −80 dB | **They do not differ.** The C++ harness on the native static library and Node on the `.wasm` render `harness/render-click.json` (64 steps at 300 bpm, sliders moved six times, clicks cut off by the next) to the same bytes: 141 120 samples at 44.1 kHz (sha256 `8edac8757c455952`), 153 600 at 48 kHz (`0a70450dc7aa5170`), 307 200 at 96 kHz (`1df3dc10a21b2b7c`), on the table clock and on edges. Peak −0.2 dB |
| At least 16 voices on the phone | **1 024**, on a Samsung Galaxy S25 FE, in Chrome and again in Firefox: every stage of Count voices held, up to the most the page tries. Each is a whole engine, sequencing and sounding. See the end of this section |

Why they are the same bits: the voice uses only add, subtract, multiply, divide and
conversions, which IEEE 754 rounds one way everywhere. There is no library `sin` or `exp`:
the sine is a polynomial and the decay a multiply a frame. That is a rule for every later
voice (D44), not luck.

`harness/compare.mjs` was written before the voice. It can fail: a `.wasm`-only error of
one part in a thousand measured −64.9 dB and failed; silence against silence failed as too
quiet to prove anything; a render one sample short failed. An error of one part in 20 000
measured −90.9 dB and passed, as the bar says it should, reported as "not the same bytes".

Also checked, in `cargo test`: the block size changes no sample; a voice starts on its
trigger's frame; it decays to exact zeros; sound changes no event and no snapshot; a full
event buffer does not silence a voice.

**To finish it:** the page now has it (added after Session 3, the same day): **Count
voices** runs 1, 2, 4 … up to 1 024 whole engines in one worklet, each sequencing and
sounding a long click on every step at 300 bpm, four seconds a stage. A stage holds if
rendering took under 70 % of real time and audio fell no more than 50 ms behind. A copy
costs more than a voice alone (it also runs a clock and a sequencer), so the count errs
low. Press it on the phone and write the number here.

On this laptop, headless, as a check that the measure moves (a finding, not the bar):
Chromium 155 and Firefox 158 both held all 1 024 copies at 48 kHz, spending 27 % of real
time; the cost rose in step with the count (512 copies: 15 %).

**On the phone** (the owner's report): 1 024 copies held in Chrome for Android and in
Firefox for Android on a Samsung Galaxy S25 FE. The bar is 16, so it is met sixty-four
times over, and since cost rises in step with the count, sixteen copies are about one
sixtieth of whatever 1 024 cost.

What this does not show, said plainly:
- ⚠ The phone's "% of real time" figures were not recorded. If its worklet clock is coarse
  the page's first guard (under 70 %) is weak there, and only the second (audio no more
  than 50 ms behind) was really judging.
- ⚠ The phone reached the page's ceiling, not its own limit. No stage has been seen to
  fail on any device, so the "did not hold" branch has never run on a real overload.
- ⚠ An S25 FE is the top of mid-range. A cheaper phone has not been tried.
- These are sixteen-fold copies of the cheapest voice. A bass drum or a hat costs more;
  the margin is what makes that safe to say, not a measurement of those voices.

**Later, 2026-11-19: the minimum beat.** Four more voices (`VOICES.md`, "As built") are each
in a render scenario beside the click's, and `make test` now holds every pair to the same
bytes (`compare.mjs --same`), stricter than this bar, which does not change. All six
scenarios, at three rates on both clocks, came out the same bytes natively and from the
`.wasm`. Annotations to the record above, which stands as measured:
- **The click's hashes above no longer reproduce from `render-click.json`,** because the
  scenario also steps track 2, which was silent then and is the closed hat now. Rendered
  without that step, the click is still `8edac8757c455952`, `0a70450dc7aa5170` and
  `1df3dc10a21b2b7c`: the voice did not change.
- **Cost, natively, as a pointer and not a bar:** the whole beat (four drums and the click,
  sequenced) renders at about 13 ns a frame on this laptop, the click scenario at about
  9 ns, both including the file write. The phone count above still runs click copies; the
  drums have not been counted on a phone.
- The engine grew from 352 to 752 bytes. The page's Count voices packed copies 512 bytes
  apart and would have had every copy refused; it now steps by `pi_size` and still held
  1 024 copies headless in Chromium and in Firefox.

**Samples, 2026-11-20 (Session 8, D50).** `harness/render-samples.json`: every track on its
starter-pack sample, sliders swept, tracks 0 to 7 back on code mid-way: the same bytes
natively and from the `.wasm` at three rates on both clocks. With it, 19 scenarios and 114
pairs, all the same bytes. The 108 renders from before match the previous commit's core
byte for byte, so ABI 3 left every code voice alone. All sixteen samples at once peak at
+6.2 dB (each host softens it, D48).

**All sixteen voices, 2026-11-19 (Session 7).** The other eleven, each in its own scenario,
and `harness/render-all.json` with all sixteen together: 18 scenarios, 108 pairs at three
rates on both clocks, every one the same bytes natively and from the `.wasm`. Annotations:
- **The five voices already built did not change.** The previous commit's core renders the
  click, kick, snare, both hats and the beat to the same bytes as this one: 36 of 36 files.
- **Cost, natively, as a pointer:** all sixteen sequenced at about 47 ns a frame on this
  laptop, the beat at about 29 ns measured the same way the same afternoon (Session 5's
  13 ns was another day's load; compare within a row, not across). Not counted on a phone.
- The engine is 1 416 bytes and the `.wasm` 19 478 (P1's bar is 50 KB). Every host's fixed
  room moved from 1 to 2 KiB together.

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
