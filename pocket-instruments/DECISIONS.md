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

## Open

| ID | Question | Needs |
|---|---|---|
| O1 | ~~What do the front-face drawings of the design patents actually claim?~~ | Answered 2026-11-18: R4, R5, R6. Led to D20 |
| O2 | Will the VCV Library build or accept a plugin with Rust in it? | Watch Phona (R16a); ask VCV at P5 |
| O3 | Is the name "Pocket Instruments" free, and is it too close to POCKET OPERATOR? | A register search; a decision on a family name |
| O4 | How does swing behave on an external clock? | The engine interface session (PLAN Session 1) |
| O5 | Saved state: one readable format shared by both hosts, or a versioned binary snapshot each host wraps? | The engine interface session |
| O6 | EU and UK registered designs and marks | A search of EUIPO and UKIPO |
| O7 | A lawyer's view of the mockup before public release | P9 |
