# Review of the brief

## Review 1 — 2026-11-18, of `BRIEF-v0.1.md`

Reviewer: Claude (Fable), with two research agents and independent searches. Sources and the
date each was checked are in `REFERENCES.md`; R-numbers below point there. ⚠ marks what is not
verified. Nothing here is legal advice.

### Verdict

The idea is sound and worth building. Three things in the brief do not survive checking:

1. **The near-replica look (D1, D4) cannot ship in the VCV Library without Teenage
   Engineering's permission.** That is VCV's own rule, separate from the law (F1).
2. **Rust in a Rack plugin is proven to build, not proven to ship.** No plugin with a Rust
   component is known to be in the Library, and VCV's build toolchain has no Rust (F5).
3. **The first milestone does not test the architecture.** A keypad that maps a key to a pitch
   is a pure function; it would pass while every hard question stays open (F6, F7).

What to change, in one line each:

- Design an original look in the calculator format; credit the inspiration in words.
- Keep Rust as the hypothesis, with written kill criteria and a fallback that costs little.
- Prove the engine headless first (`PROOFS.md` P1 to P4), then build one small rhythm
  instrument, not a CV keypad.

### What the brief gets right

- Proving the shared engine before investing in sound and UI (D2).
- Browser as a tabletop, not a second Rack (D6).
- Original sounds and artwork, no factory samples (non-goals).
- Naming "framework before one fun instrument" as a top risk.
- Asking for this review, and saying its reuse estimates are judgments, not measurements.

---

### Findings

#### F1 — VCV's ethics rule blocks a near-replica (high)

The VCV plugin ethics guidelines say (R1):

> You may not clone the brand name, model name, logo, panel design, or layout of components
> (knobs, ports, switches, etc) of an existing hardware or software product without permission
> from its owner, regardless of whether these are covered under trademark/copyright law.

Following it is a requirement for the VCV Library. The brief cites this page for licensing and
misses this section. VCV enforces it: a plugin whose panels resembled Serge and Buchla modules
was refused in 2023 (R2), and VCV asked another developer for proof of permission (R3).

Consequence: D1 as written means either Teenage Engineering says yes, or the plugin lives
outside the Library. D4 (PO-like from the first prototype) puts the riskiest element first.

#### F2 — Registered rights exist, and the brief names none (high)

- Two US design patents titled "Synthesizer", both filed 21 October 2014 by Teenage Engineering
  AB: D738,348 (issued 8 September 2015) and D741,282 (issued 20 October 2015) (R4, R5).
  Design patents filed before 13 May 2015 run 14 years from grant ⚠ (reviewer's knowledge of US
  law; one database lists October 2029 for D741,282). So both run into late 2029.
  ⚠ Nobody here has viewed the front-face drawings. One rear figure shows the bare board with
  the hanger notch in solid lines. What the patents claim on the front is the open question.
- A design-patent family on a "display screen with graphical user interface", filed May 2015
  (R6). ⚠ Not inspected; it may or may not be the LCD artwork.
- POCKET OPERATOR is a live US trademark, registration 6647101, with "POCKET" disclaimed. Its
  goods description is "Integrated circuit cards with LCD screen featuring cartoon animation,
  audio input, audio output, and speaker" (R7).
- ⚠ EU and UK registered designs and marks were not searched. Absence is not established.
- Teenage Engineering makes its own software Pocket Operator (Pocket Operator for Pixel, with
  Google, 2022) (R8). A free software lookalike overlaps with a product of theirs.
- Their IP page protects samples and "image data" and discourages reverse engineering of
  firmware. It says nothing about lookalikes: no permission, no prohibition (R9).

#### F3 — The cited precedents prove the opposite (medium)

The brief offers Audible Instruments, Befaco and Erica Synths as precedent for recognisable
hardware ports. All three had the owner's permission or were made by the owner (R10). The brief
does add a caveat, but the honest reading is stronger: in Rack, recognisable ports are normal
*when the owner agrees*.

The browser clones are weak precedent too (R11): one ships the Teenage Engineering and Cheap
Monday logos in its artwork, two have no LICENSE file, one has no licence at all, and none
states where its samples came from. They show what has been tolerated, not what is allowed.
No Teenage Engineering action against any fan project was found ⚠ (absence of evidence).

#### F4 — "Near-replica" in writing (low, cheap to fix)

The frozen brief says "near-replica" and this repo is public. Intent to copy, in writing, is
the kind of sentence that reads badly later. The fix is not to hide it: it is to decide
otherwise, in `DECISIONS.md`, and let the record show the correction.

#### F5 — Rust: feasible in Rack, unproven to ship (high)

Verified (R12 to R16):

- Two public Rack plugins link a Rust static library; neither is in the Library. One needs
  nightly Rust.
- Two forum authors failed or struggled to link on Windows. The known fix is to pass Rust's
  native static libs to the linker.
- VCV's plugin toolchain, which builds every open-source Library plugin from a commit hash,
  contains no Rust or cargo.
- VCV's founder said in 2020 that calling Rust through a C interface works, and nothing since
  on Library builds.
- One live test: Phona, MIT, a Rust static library behind a C header, was submitted to the
  Library on 2026-11-17. ⚠ Outcome unknown. Watching it is free.
- Rust's minimum macOS (10.12, and 11.0 on Apple Silicon) is above Rack's stated 10.9.

The three options the brief asks to compare:

| | Rust core, C ABI | C++ core, Emscripten to WASM | Two implementations (C++ and TypeScript) |
|---|---|---|---|
| Rack side | Static library; link friction on Windows; Library route unknown | Native, zero friction, Library builds it | Native, zero friction |
| Browser side | Small raw `.wasm`, no runtime | Works; larger output and a runtime to tame in a worklet | No WASM at all |
| Safety in the audio path | `no_std` with no allocator makes allocation impossible, not just avoided | By discipline and review | By discipline, twice |
| Drift between hosts | None: one binary logic | None | Real; held only by shared fixtures |
| Contributors | Rust and C++ both needed | C++ only | Either half alone |
| Proof | P1, P2, P3, P5 | Same fixtures, re-implemented | Same fixtures, twice |

Judgment: Rust is the better engineering fit for the core if it ships. The risk is all in
distribution. So proceed with Rust and make the fallback cheap: P2's fixtures are
language-neutral, and the core for one instrument is small. If P3 or P5 fails, the core is
re-implemented in C++ against the same fixtures and nothing else moves.

Not chosen: two implementations. A step sequencer with swing, probability and locks has enough
edge cases that two copies will drift.

Considered and set aside: Cardinal, the GPL build of Rack that also targets the web. A module
written once in C++ could run in a browser inside it. It would force GPLv3 (against D8) and
puts a whole rack in the browser (against D6). ⚠ Checked lightly (R17).

#### F6 — The first milestone tests the toolchain, not the design (high)

"Pocket Keys" maps a key to a quantised pitch. Sharing a pure function across hosts proves the
build works and nothing else. The places where two hosts actually diverge are untouched:

- who owns time (Rack's external clock edge against the browser's own tempo);
- per-sample calls against 128-frame blocks;
- editing a pattern while audio runs;
- saving and loading state from another thread.

It is also a weak instrument. Clicking sixteen buttons with a mouse is not playing, Rack has
many quantisers, and in a phone browser a live keypad depends on tap-to-sound latency nobody
has measured (P4).

#### F7 — The engine interface is the real design problem, and the brief skips it (high)

The brief lists what the core owns but not how time enters it. Proposed principles, to be
tested by P2 and P6:

1. **An instrument never owns the transport.** It is told about time. In Rack the clock arrives
   on a cable; in the browser a "table" object, also in the core, generates it for every
   instrument at once. Sync between browser instruments is then free, and both hosts drive the
   instrument the same way.
2. **Time is integers.** Musical position is counted in ticks. Swing, ratchets and probability
   are integer arithmetic with an integer random generator. No float decides when an event
   fires. Traces are compared in musical time, never in frames.
3. **Inputs are timestamped commands.** Clock edge, reset, key down, key up, parameter set:
   each a small fixed-size record with a frame offset inside the block. The host queues them;
   the core is single-threaded and lock-free by construction.
4. **Outputs are a fixed-capacity event buffer** and, for sound, audio frames.
5. **The caller owns the memory.** The core reports its size and is initialised into memory
   the host provides. No allocator anywhere, no global state, any number of instances.
6. **One C ABI for both hosts.** The browser loads raw exports, with no generated glue
   (F10). Rack links the same symbols.
7. **State leaves as a versioned snapshot** taken at a block boundary into a caller's buffer.

Open inside this: with an external clock there is no tempo, only edges. Swing then needs the
period measured from the last two edges, as hardware does. That behaviour must be specified,
or the two hosts will swing differently.

#### F8 — The indicative data shape is wrong twice (medium)

- `locks: Record<string, number>` is a string-keyed map. In a real-time core it becomes a fixed
  array indexed by parameter id.
- The shape is a generic melodic step (note, velocity, gate). A PO-12 pattern is sixteen sounds
  by sixteen steps, each step carrying two locked parameter values and a step effect ⚠ (from
  memory; the owner has the hardware to check, P8). The 0.1 model should be shaped for the
  instrument planned at 0.4, or be declared throwaway.

#### F9 — The two-jack silhouette suits a sound-maker, not a controller (medium)

The hardware's two jacks are "in" on the left and "out" on the right. A rhythm instrument maps
onto that directly: CLOCK in, AUDIO out, useful in Rack with nothing else. A CV keypad needs
at least PITCH and GATE out and has no use for the "in". The brief's unresolved question in §6
comes from choosing a controller as the first instrument.

A Rack panel is 128.5 mm tall and a multiple of 5.08 mm wide (R18). ⚠ A Pocket Operator is
about 60 by 104 mm (from memory; measure it). At 12 HP it would be near life-size with roughly
24 mm of panel to spare, enough for a row of ordinary Rack jacks under the instrument. That
may make the expander unnecessary for a long time. Expanders add one sample of latency per hop
and need adjacency (R18); the brief is right to keep them optional.

#### F10 — Browser constraints the brief does not mention (medium)

- Generated wasm-bindgen glue is fragile inside an AudioWorklet: the scope has no
  TextDecoder, and behaviour changed between versions in late 2025 (R19). Two working
  projects avoid it by fetching the bytes on the main thread and handing them to the worklet;
  one of them uses raw exports with zero imports (R20). That is principle 6 above.
- A lock-free shared buffer between UI and audio needs cross-origin isolation, which GitHub
  Pages cannot set; the service-worker workaround conflicts with an app's own service worker
  (R21). Message passing is enough for a sequencer. Decide this before, not after.
- One worklet should host every instrument on the table, in one WASM instance. Separate nodes
  per instrument invite the drift the brief wants to avoid.
- ⚠ No credible figure for Web Audio output latency on Android was found. P4 measures it.
- React and Vite are not needed for sixteen buttons and a display. Every dependency is a
  barrier to the contributors the brief wants. Plain TypeScript or JavaScript with SVG is
  enough until proven otherwise.

#### F11 — Rack constraints the brief does not mention (medium)

- A Rack parameter is one float. Pattern edits (sixteen steps with locks) have no built-in
  channel from the widget to the audio thread; Rack's ring buffer is safe for one producer and
  one consumer only (R18). This is P6.
- Saving a patch calls into the module from another thread while audio runs.
- Build flags must match Rack's (`nehalem`), never the build machine's CPU (R16).
- Panels are SVG with no text and only simple gradients (R18); an animated display is custom
  drawing code. Display code will not be shared between hosts. A shared description of *what*
  to show could be, later, if a second instrument asks for it.

#### F12 — Determinism needs a rule about floats (low)

Add, multiply and square root give the same answer on every target. Sine, exponent and power
come from a maths library and can differ between native and WASM. So: event logic in integers
(F7), and sound compared within a tolerance (P7), not byte for byte. The brief already accepts
the second half.

#### F13 — Process weight (low)

The brief warns against building a framework, then lists RFCs, architecture decision records
and provenance declarations for contributors. Those belong to the standalone repository, after
there is something to contribute to. Here: one decision log, one proof register, one notebook.
The education goal has no milestone; it is parked, not dropped.

---

### First instrument: three options, ranked

| Rank | Instrument | Rack ports | Musical use | What it teaches |
|---|---|---|---|---|
| 1 | **Tiny rhythm.** Sixteen steps, two to four synthesised drum sounds, hold-a-sound-tap-steps entry | CLOCK in (left), AUDIO out (right); RESET as a third small jack or menu | High in both hosts: it makes sound on its own | Clocking, editing while playing, state, and shared sound (P7). It is the first quarter of the PO-12 homage |
| 2 | Clocked melodic sequencer | CLOCK, RESET in; PITCH, GATE out | High in Rack, needs a preview synth in the browser | Clocking, editing, state. No shared sound |
| 3 | Pocket Keys, as in the brief | PITCH, GATE out | Low | The build only |

### What would falsify the plan

1. Teenage Engineering objects to the project as a whole, not just the look.
2. The front-face drawings of the design patents cover a 4-by-4 grid with two knobs and a
   display generally, so even an original design in that format reads on them. ⚠ Unlikely for a
   design patent, which protects a specific appearance, but nobody has looked.
3. VCV will not build or list a plugin with Rust in it, and binaries are refused too.
4. Windows or macOS linking stays fragile after P5.
5. Tap-to-sound latency on Android makes the browser instruments feel dead.
6. The integer time base cannot express external-clock swing the same way on both hosts.
7. Two sessions go into P1 to P3 without a pass. That is the friction the brief feared.

### Not yet reviewed

- The brief's §13 item 7 (creative extensions beyond the hardware): deferred until one
  instrument exists.
- A lawyer's view. Before any public release with a panel design, someone qualified looks at
  the mockup against R4 to R7.

### Addendum, 2026-11-18 — the patent drawings, read

Falsifier 2 above asked what the front-face drawings claim. They have now been read (R4, R5,
R6). The answer is narrower than "any grid with knobs" and wider than F2 assumed:

- D741,282 leaves out the display and the hanger and claims the board outline with its exact
  key and knob arrangement. An instrument with a different display but that arrangement would
  still be inside it.
- D738,348 claims the complete object.
- D789,955 claims the display artwork on its own, with the device unclaimed.

F2's "an original look in the calculator format" therefore needs a sharper brief. It is in
`DECISIONS.md` D20. F1 is unchanged: VCV's rule on "layout of components" points the same way.
