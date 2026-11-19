# Decisions

Append only. A decision is never edited away: it is superseded by a later one that says why.
States: `decided` (the owner chose it) · `proposed` (the reviewer's assumption, not yet put to
the owner) · `open` · `superseded by Dn`.

Evidence lives in `REVIEW.md` (F-numbers) and `REFERENCES.md` (R-numbers).

## From the brief (v0.1), and where each stands

| ID | Decision in the brief | State after Review 1 |
|---|---|---|
| D1 | Near-replica form factor and UI philosophy | **Superseded by D11.** The interaction philosophy survives; the replica look does not |
| D2 | Prove one shared Rust engine early | Stands. Sharpened by D13 and D15 |
| D3 | Start with a simple sequencer or controller; original synthesis later | **Superseded by D12.** A sequencer with original sound first; no controller |
| D4 | Visually PO-like from the first prototype | **Superseded by D11 and D15.** Nothing visual before P3; the look is our own |
| D5 | Share DSP selectively | Stands as a hypothesis. P7 tests it |
| D6 | Browser is a virtual tabletop, not a modular rack | Stands |
| D7 | Explicit credit to Teenage Engineering, genuine purchase links, no affiliate links | Stands |
| D8 | Free and permissively licensed, ideally MIT | Stands. MIT is allowed for a free Rack plugin (R1) |
| D9 | Optional Rack expanders | Deferred. See D16 |
| D10 | First instrument and top-jack roles | **Resolved by D12** |

## Decisions since

### D11 — Our own look, in the calculator format; ask Teenage Engineering once there is a mockup
**2026-11-18 · decided (owner) · supersedes D1, D4**

The instruments get an original visual identity in the same format: a small portrait board, a
grid of keys, two knobs, a lively display. The inspiration is credited in words (D7). Once a
real mockup exists, it is shown to Teenage Engineering with a request for their view; a yes
could move the design closer to the original.

Why: VCV's Library forbids cloning a panel design or component layout without the owner's
permission (F1, R1, R2); Teenage Engineering holds live design patents and the POCKET OPERATOR
mark (F2, R4 to R7); every Rack precedent the brief cited had permission (F3).

Not chosen: a near-replica shipped outside the Library (carries the full risk and loses the
Library); asking before any mockup (stalls visual work on an answer that may never come);
never asking (gives up a possible blessing).

### D12 — The first instrument is a tiny rhythm machine
**2026-11-18 · decided (owner) · supersedes D3, resolves D10**

Sixteen steps, two to four synthesised drum sounds, hold a sound and tap steps. In Rack: CLOCK
in on the left jack, AUDIO out on the right. It is built after the headless proofs (D15).

Why: it makes sound on its own in both hosts, fits the two-jack shape, and exercises clocking,
editing while playing, saved state and shared sound. Pocket Keys tested none of those (F6, F9).

Not chosen: a clocked melodic sequencer (four jacks, no shared sound); Pocket Keys.

### D13 — Rust, with kill criteria
**2026-11-18 · decided (owner) · sharpens D2**

The core starts in Rust. Fixtures stay language-neutral. If P3 (it runs in Rack) or P5 (it
ships) fails, the core is re-implemented in C++ against the same fixtures and compiled to
WebAssembly with Emscripten. A third trigger: two build sessions spent on P1 to P3 without a
pass.

Why: Rust fits the core best, and all its risk is in distribution, which is unproven (F5,
R12 to R16a).

### D14 — Incubate in public
**2026-11-18 · decided (owner)**

The folder is committed and pushed to the public sidequests repo, brief and review included.

Why: the project is meant to be open, nothing infringing is being built, and the record shows
the brief's "near-replica" intent being corrected (F4). The alternative was a private repo now.

### D15 — Headless proofs before anything visual
**2026-11-18 · decided (owner, with D12) · sharpens D2**

P1 to P4 run with no panel and no artwork. The first instrument's look starts after P3.

Why: the engine's risks do not depend on the look, and the look has its own gate (P9).

### D16 — Rack jacks under the instrument before any expander
**2026-11-18 · proposed · defers D9**

If a Pocket Operator is about 60 by 104 mm ⚠ (measure it), a 12 HP panel holds one near
life-size with about 24 mm spare. Extra Rack jacks go in a row there. An expander waits until
an instrument needs more than that row.

Why: expanders need adjacency and add a sample of latency per hop (F9, R18).

### D17 — Engine interface principles
**2026-11-18 · proposed · to be tested by P2 and P6**

The seven principles in `REVIEW.md` F7: the instrument never owns the transport; time is
integers; inputs are timestamped commands; outputs are a fixed event buffer; the caller owns
the memory; one C ABI for both hosts; state leaves as a versioned snapshot.

### D18 — Browser build: plain web code, raw WebAssembly, one worklet
**2026-11-18 · proposed · changes the brief's §9 (React, Vite)**

No React or Vite. Raw `wasm32-unknown-unknown` exports with no generated glue. Message passing
between UI and audio, no shared memory. One AudioWorklet and one WASM instance for the whole
table. Phone and touch first.

Why: F10, R19 to R21. Fewer dependencies for contributors; no cross-origin isolation needed on
GitHub Pages.

### D19 — Open about the intent; ask permission; never commercial
**2026-11-18 · decided (owner) · confirms D7, D8, D14**

The project says plainly what it is: an homage to instruments we admire. Nothing about the
inspiration is hidden, permission is asked for, and nothing is ever sold. The owner was told
that naming the patents in a public repo is evidence of knowing about them, and accepts that.

Before asking Teenage Engineering, there must be something good to show them: the tiny rhythm
machine (D12), playable from a link, with its own look (D11, D20). "The worst they can say is
no."

Reviewer's note: being free and credited shapes how a rights holder responds; it does not
remove patent or trademark exposure. The realistic worst case for an open, non-commercial
project that asks first is a request to change or stop.

### D20 — What "our own look" must avoid, from the patent drawings
**2026-11-18 · proposed (the reviewer's reading of the drawings, not a lawyer's) · narrows D11**

The drawings (R4, R5, R6) claim three things. Our design stays clear of each:

1. **The board and key arrangement** (R5, the broad one: display and hanger are not part of
   it). A rounded portrait board carrying a top row of three keys and two knobs above a
   five-by-four grid of exposed tact switches. So: not that arrangement, not that outline, not
   bare tact switches as the key style.
2. **The whole object** (R4): add the hanger, the pin-row display and the side battery clips.
   No hanger tab, no pin rows, no clips, not even as decoration.
3. **The display artwork** (R6 and its continuations): the cartoon scenes. All animation is
   our own, in a style of our own.

What stays free, because it is function and not appearance: sixteen steps as a four-by-four
grid, two knobs, a small animated display, sound and pattern keys, the workflow.

Consequence for D11: "the same format" was too loose. The design brief for the look is "a
sixteen-step pocket instrument that could not be mistaken for the original at a glance". The
Rack panel helps: it is a 128.5 mm strip with its own proportions, not a hanging card.

Why proposed: a design patent is judged on the overall impression to an ordinary observer.
Where that line falls for a real mockup is the lawyer's question in O7 and Teenage
Engineering's in D19.

### D21 — The layout: three blocks, left to right
**2026-11-18 · decided (owner) · applies D20, realises D11**

A wider module, read left to right:

1. **The grid.** Four by four keys, one to sixteen. The keys themselves glow; there is no
   separate little LED beside a key.
2. A divider.
3. **Two sliders**, in place of the two knobs.
4. A divider.
5. **The function keys**, in two rows: sound, pattern, bpm above; function, fx, play, write
   below. The first three in clearly different colours.

The owner designs the look in Claude Design. The export goes in `pocket-instruments/design/`.
Design work may run alongside the engine proofs; D15 still holds for building anything.

Why: it keeps the flow of the original (the same keys, the same names, the same combinations)
and gives up its appearance: a different outline, a different arrangement, sliders for knobs,
lit keys for tact switches. Each of those is a point on D20's avoid list.

Reviewer's notes, for the design:

- **Width.** At a 12 mm key pitch the three blocks come to roughly 120 mm, about 24 HP ⚠
  (estimate). The panel is 128.5 mm tall and the grid uses under half of it, so the display
  can run across the top and the Rack jacks along the bottom (D16).
- **The same three blocks should stack on a phone.** Side by side they do not fit a portrait
  screen. Design them as blocks that sit in a row in Rack and in a column in the browser (O9).
- **Sliders are better than knobs on a touch screen**, and Rack has lit sliders. They are
  absolute controls, as the hardware's knobs are ⚠ (check on the PO-12).
- **Glowing keys can carry more than the hardware's LEDs:** the playing step, the steps set
  for the selected sound, a held or latched modifier. That last one matters for O8.

### D22 — It teaches the workflow, so the workflow is the thing kept faithful
**2026-11-18 · decided (owner) · promotes the brief's education goal; sharpens D11, D19**

The instruments are *inspired by* the originals and meant to let someone *learn* how they are
played. The look is ours; the workflow stays really close: the same key names, the same
combinations, the same order of doing things, so that what is learned here carries over to
the hardware.

Why: it is the honest description of the project, it is what makes it worth showing Teenage
Engineering (it sends people towards the real thing), and workflow is function, which is free
to follow (D20).

Consequence: P8 (it feels like the real thing) becomes a gate for the showpiece, not a
nicety. Every deliberate difference from the hardware is listed and explained.

### D23 — Combinations with one pointer: function keys latch
**2026-11-19 · decided (owner) · answers O8**

In Rack, a click on a function key latches it and it glows, until the next grid press or a
second click. The phone browser uses real multi-touch and does not latch.

Proposed alongside, not yet decided: the keys can also be driven from a computer keyboard and
from MIDI, so combinations can be held for real.

- Every key and slider is an ordinary Rack parameter, so Rack's own MIDI mapping reaches them
  with no code of ours ⚠ (check what it maps: controllers only, or notes too).
- Computer keys while the pointer is over the module: a four-by-four block of the keyboard
  for the grid, a row for the function keys. Keyboards report several held keys at once.
- In the browser: the same keyboard block; Web MIDI where the browser has it ⚠ (not on every
  phone browser).
- None of this touches the core. It only ever sees key-down and key-up commands (D17), so
  mapping is each host's own business.

### D24 — The time base, and swing on an external clock
**2026-11-19 · decided (owner) · answers O4 · applies D17**

A step is a sixteenth note of 96 ticks. In Rack one clock edge is one step. The clock layer
turns frames into ticks; the sequencer sees only ticks. On an external clock, tick 0 is the
edge and the rest are interpolated from the gap between the last two edges; an early edge
flushes the ticks not yet reached, a late one holds. Swing delays odd steps of the grid, not
of the pattern. The full rules are `ENGINE.md` §2 to §5.

Why: every tick is emitted once and in order whatever the host does, so the trace cannot
differ between hosts, sample rates or block sizes. A model of the rules gave one trace across
both clock sources at three sample rates before any engine existed (`fixtures/README.md`).

Not chosen: following the hardware's sync pulse (its rate is not published, R23, and Rack
clocks send one edge a step); dropping unreached ticks (a clock that speeds up would lose
notes); swing by pattern step (it would leave the beat when the length is odd).

### D25 — Saved state is a versioned binary snapshot each host wraps
**2026-11-19 · decided (owner) · answers O5 · applies D17**

The core writes and reads a 100-byte block with a version, a kind and a checksum. Rack stores
it as text inside the patch; the browser the same in its storage. It holds the pattern,
length, swing, tempo and seed, and not the playhead. Layout: `ENGINE.md` §8.

Why: one writer and one reader cannot drift, and the core stays free of an allocator and a
JSON parser. Not chosen: a readable format both hosts write (two writers, and a parser in the
audio code). A readable export can be a tool later.

### D26 — Two families of command: edits now, keys with the instrument
**2026-11-19 · decided (owner) · applies D17, D22, D23**

The core takes edits (set a step, a probability, the swing, the length) and, later, keys
(key down, key up, slider). The workflow inside the core will turn keys into edits. The proofs
P1 to P4 use edits only. Key numbers are fixed now; they do nothing in ABI 1.

Why: the workflow is not confirmed on the hardware (`WORKFLOW.md`), and the sequencer's
fixtures should not move when it is. ABI 1 is sized for the tiny rhythm machine: four tracks,
sixteen steps, one pattern. More is a new snapshot version, not a redesign.

### D27 — The owner's rulings on D17, D18 and D20
**2026-11-19 · decided (owner)**

- **D17 is decided**, as written out in `ENGINE.md`. P2 and P6 still test it; a failed proof
  reopens it.
- **D18 is decided**: plain web code, raw WebAssembly, one worklet, messages, phone first.
- **D20 is decided** as the brief for the look. It remains the reviewer's reading of the
  drawings; O7 and D19 still have the last word at P9.
- **D16 stays proposed.** It waits for the measurements (`WORKFLOW.md`, question 11). D21
  already puts the Rack jacks along the bottom of a wider panel, so no expander is planned.

### D28 — Computer keys in both hosts; no MIDI code of ours
**2026-11-19 · decided (owner) · settles D23's proposal**

Beside the latch, the keys answer to the computer keyboard: a four-by-four block for the grid
and a row for the function keys, in Rack while the pointer is over the module and in the
browser. MIDI is whatever Rack's own mapping gives: controllers reach every key and slider,
notes do not (R24). No MIDI input of our own and no Web MIDI until someone asks.

Why: it lets combinations be held for real at no cost to the core, which only sees key-down
and key-up. ⚠ Rack reports key presses and releases under the pointer (R25); whether it
reports several held at once is to be tried at P8. The key positions wait on `WORKFLOW.md`,
question 10.

### D29 — The workflow is confirmed as we go, not up front
**2026-11-19 · decided (owner) · changes how D22 is reached**

The hour with the PO-12 is not happening before the build. `WORKFLOW.md` is built from as it
stands, from the published guide (R23). Each mismatch the owner notices against the hardware
goes into its differences table, marked deliberate or to fix. P8 still gates the showpiece.

Why: the owner's time. D26 makes it cheap: the proofs and the sequencer use edits only, so a
wrong guess about a key press costs a change in the workflow layer and no fixture.

The cost, stated: the eleven questions in `WORKFLOW.md` are now guesses until someone trips
on them. Where the instrument must pick one before then, it picks the plainest reading and
marks it ⚠ in the table.

Consequence for D16: the panel is taken as 24 HP with the jacks along the bottom (D21), as
the design prompt says (`design/PROMPT.md`). It no longer waits on a measurement.

## Open

| ID | Question | Needs |
|---|---|---|
| O1 | ~~What do the front-face drawings of the design patents actually claim?~~ | Answered 2026-11-18: R4, R5, R6. Led to D20 |
| O2 | Will the VCV Library build or accept a plugin with Rust in it? | Watch Phona (R16a, R16b: not submitted yet, 2026-11-19); ask VCV at P5 |
| O3 | Is the name "Pocket Instruments" free, and is it too close to POCKET OPERATOR? | A register search; a decision on a family name |
| O4 | ~~How does swing behave on an external clock?~~ | Answered 2026-11-19: D24 |
| O5 | ~~Saved state: one readable format shared by both hosts, or a versioned binary snapshot each host wraps?~~ | Answered 2026-11-19: D25 |
| O6 | EU and UK registered designs and marks | A search of EUIPO and UKIPO |
| O7 | A lawyer's view of the mockup before public release | P9 |
| O8 | ~~Answered by D23.~~ The hardware is played with two fingers: hold a function key, press a grid key or turn a knob. A mouse has one pointer. How are combinations made in Rack? Proposed: a click on a function key latches it (it glows) until the next grid press or a second click; computer keys held while hovering also work. The phone browser has real multi-touch and needs neither | Session 1, with D22 in mind; try it at P8 |
| O10 | Probability and a short length are not on the hardware. What gesture sets them without colliding with its combinations? | `WORKFLOW.md`, after the hardware hour |
| O9 | How do the three blocks stack on a phone, and does one instrument fill the screen or share it? | The Claude Design work; D18 |
