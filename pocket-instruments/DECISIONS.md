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

### D30 — Sixteen tracks from the start
**2026-11-19 · decided (owner) · answers O11 · supersedes the "two to four sounds" in D12 and the size in D26**

The engine has sixteen tracks, one for each grid key: key *n* plays track *n*. Voices are
filled in a few at a time; a track without a voice sequences and lights but is silent.

Why: on the hardware each key is its own sound (R26, R27, R30). Four sounds would leave
twelve dead keys and nothing to learn about which key is which drum (D22). Sequencing sixteen
tracks costs a constant and 216 bytes of snapshot; the three fixtures are unchanged. The cost
is in the voices, and those can arrive one by one.

What stays from D12: it is still a tiny rhythm machine first: one pattern, no chains, no
effects, built after the headless proofs.

### D31 — Our own sixteen sounds, in the hardware's roles
**2026-11-19 · decided (owner) · applies D22 and README rule 6**

The sixteen voices take the same roles in the same key order as the hardware (bass drum on 1,
snare on 2, and so on), and aim to be close in character. They are synthesised by us from
the recipes in `VOICES.md`. Nothing is sampled, from the hardware or from anyone's recording
of it. The judge of "close enough" is the owner's ear at P8.

Why: the role on each key is workflow, which D22 keeps faithful; a recording is material,
which rule 6 keeps out. Open-source emulations were read for behaviour and their samples
measured for rough starting values, outside the repo (R30). ⚠ Those samples' origin is not
stated; nothing of them is here but a few rounded numbers.

Reviewer's note: "close in character" is a judgment, like the look. Sound-alike synthesis of
ordinary drum types is common practice; it is still worth letting Teenage Engineering hear it
when they are shown the showpiece (D19).

### D32 — Voices may be public-domain samples, one manifest line each
**2026-11-19 · proposed (the owner asked for it; the choices are not made) · would supersede "nothing is sampled" in D31**

A voice is either a CC0 sample or a recipe, chosen per key by ear. The first source is Sonic
Pi's bundled set (R31). Each file used is listed with its origin and author. Samples are data
the host loads and hands to the core. Nothing from the hardware, and nothing whose licence or
origin is unstated (so nothing from R30). Detail and candidates: `VOICES.md`.

Why: a good known kick is better than a first-attempt synthesised one, and sample playback is
exactly repeatable across hosts. Cost: half a megabyte of assets, and a sound further from
the hardware's synthetic character.

### D33 — Individual outputs: sixteen channels on one jack first, an expander later
**2026-11-19 · proposed · extends D16 · the owner raised it**

In Rack every track has a trigger out and an audio out. First as two sixteen-channel jacks on
the main panel (TRIGGERS, VOICES); later an expander with a jack per sound, where a patched
audio jack takes that sound out of the mix. The core already emits what triggers need; for
audio, P7 must render per track. Detail: `VOICES.md`.

### D34 — Any key can take the player's own sample; browsing Freesound inside the instrument is parked
**2026-11-19 · proposed · extends D32 · the owner raised it**

Each of the sixteen keys can be given a sound file by the player: a file picker in the
browser, the module's menu in Rack. Where the file comes from is the player's business;
Freesound is one click away in another tab. The instrument ships with a good default bank
(D32) so nobody has to.

Parked, not refused: searching and auditioning Freesound from inside the interface.

Why the first is cheap: D32 already has the host loading samples and handing them to the
core. A player's file is the same path with a different source. The new work is in each
host: decoding, and remembering which file is on which key.

Why the second is parked:

- Freesound's API needs a credential for every search and preview, and a signed-in user
  (OAuth2) to download an original file (R32). A page on GitHub Pages cannot keep a
  credential secret, and this project has no server.
- It is a second product: search, audition, licence filter, attribution, rate limits, and
  what to do offline. None of it teaches the workflow (D22).
- In Rack, a module that calls the network is unusual; a file from disk is what players expect.
- Licences vary by sound. A beat shared from a link would carry sounds that need credit, or
  that may not be shared at all.

What it costs to keep the door open: nothing. If it is ever built, it is a panel in the
browser host that ends by handing a decoded sound to the same loader.

Open inside this: a shared link to a beat cannot carry the player's own samples. It would
fall back to the default bank, and say so.

### D35 — The starter pack: sixteen public-domain samples, chosen and committed
**2026-11-19 · decided (owner asked for one pack to start from) · decides D32 · amends D31**

`samples/` holds one sound for each key, all from Sonic Pi's CC0 set (R31), with a manifest
of origin and author and a page to hear them on. D31's "nothing is sampled" is withdrawn;
its other half stands: nothing from the hardware or a recording of it.

Why one pack and not a choice: the owner looked at Freesound and found too much. A default
that is good enough beats a catalogue. Any row can be swapped later by ear.

Three things about this pack that are stand-ins, said plainly: key 9 is a finger snap (the
set has no clap); keys 15 and 16 are single tones that slider A will have to tune; and the
picks were made by measurement, not by listening.

### D36 — The look is Loom: dark, high contrast, two lights to a key
**2026-11-19 · decided (owner) · carries out D21; answers O9**

The owner chose direction B, Loom, from three drawn in Claude Design to `design/PROMPT.md`,
and asked for it to be dark, high contrast and easy to read with weak eyes. The record is
`design/DESIGN.md`: the tokens, the key states, the panel in mm and the phone layout.

Each key has two lights. The field (the whole face) means something is here; the frame (a
band round the edge) means the playhead is here; white means the key is sounding. No state
depends on hue. The owner kept three grid states the prompt did not ask for: other sound,
chosen and queued.

Why Loom: the owner prefers dark designs. Why two lights: D21 put more on a glowing key than
one lamp can say, and shape survives colour blindness where a second hue does not.

It departs from the prompt in three places, each listed with its reason in `DESIGN.md`:
function keys at 10 mm pitch, labels running up tall keys, and both phone sliders on the left.

O9 is answered: the blocks stack as display, grid, then sliders beside function keys, and one
instrument fills the screen.

O12 is answered: the owner keeps weaving as the display's subject (2026-11-19). O7 and D19
still have the last word on it at P9.

Numbering: first committed as D32, with D37 as D33. Another session took those two numbers
in the same hour, and its files refer to them, so these two moved.

### D37 — The grid shows steps when write is on and sounds when it is off
**2026-11-19 · proposed (reviewer) · builds on D30; follows `WORKFLOW.md` question 3**

Write on: a lit field is a step of the chosen sound, and a corner stitch is a step of another.
Write off: the fields are dark, each key flashes white as its own sound fires, and a bar marks
the chosen sound while sound is held. The playhead frame runs in both. The table is in
`design/DESIGN.md`.

Why: it is what a search says the hardware does (R26, R27), so it serves D22. ⚠ It is a
report, not a check on the hardware. D30 gives every key a track, so every key can flash.

### D38 — The owner accepts D37
**2026-11-19 · decided (owner) · settles D37's proposal**

The grid shows steps when write is on and sounds when it is off, as D37 sets out and
`design/DESIGN.md` tabulates.

Why: it is what the hardware is reported to do (D22), and D30 gives every key a sound to show.
⚠ Still a report and not a check on the hardware (D29): a mismatch the owner meets goes in
`WORKFLOW.md`'s differences table.

### D39 — The owner's rulings on D33 and D34
**2026-11-19 · decided (owner)**

- **D33 is decided**: individual outputs in Rack, first as two sixteen-channel jacks on the
  main panel (TRIGGERS, VOICES), an expander with a jack per sound later. The panel gains two
  jacks; the brief for the design is the addendum in `design/PROMPT.md`.
- **D34 is decided**: any key can take the player's own sound file; browsing Freesound from
  inside the instrument stays parked.

Carried to P7: the core renders each track separately, or takes a mute mask (D33), and the
host can replace any track's sample (D34).

### D40 — What to take from the Surge XT Rack modules
**2026-11-19 · proposed · the owner admires them; for the Rack host, from Session 3 on**

1. **Join their neighbour connection.** `sst-rackhelpers` is MIT (R37), header-only, and made
   for other plugins to adopt. Advertising our AUDIO output through it gives a right-click
   "connect to" for neighbouring Surge, Airwindows and BaconPlugs modules and for MindMeld's
   MixMaster, with no cables dragged. Small, and it is the real integration on offer.
2. **Borrow the modulation idea, not the code.** Their knobs show a ring for the value and,
   while a CV input is armed, switch to showing how far that input will move them. If our
   sliders A and B ever take CV, they should show it the same way: where the hand left the
   slider, and where the voltage has pushed it. Our glowing keys and woven display are the
   place for it.
3. **Their habits worth copying:** a CLOCK input that accepts either a pulse or a tempo
   voltage; light, medium and dark skins chosen from the menu and applied to every module at
   once; a display that can have its animation turned off; real-value tooltips and typed
   entry on every control.

The line not to cross: `surge-rack` itself is GPL-3 (R37) and this project is MIT (D8). Its
source may be read for ideas; none of it is copied, and no panel of ours imitates theirs
(R1 applies to them as it does to Teenage Engineering).

Not yet: none of this before P3 passes (D15).

### D41 — Stay MIT; D40 decided; credit the Surge Synth Team
**2026-11-19 · decided (owner) · confirms D8 · decides D40**

- **The licence stays MIT.** GPL-3 was considered because the Surge XT Rack modules are GPL-3
  and their code could then be copied in. Not chosen: we want anyone, Teenage Engineering
  included, to be able to take this with no strings; and MIT can become GPL later, where the
  reverse is hard.
- **D40 is decided:** adopt `sst-rackhelpers` for neighbour connection, borrow how their
  modulation behaves, copy none of their code and none of their look.
- **They are credited by name** in the README as an inspiration.

The owner's reason, worth keeping in his words: "the fun thing about modular is that I never
want to lift their filters. I will just plug a cable from us into their filter." In Rack,
integration is a cable, not shared code. That is why the licence difference costs us nothing,
and why good outputs (D33) matter more than borrowed DSP.

When the helper library is adopted (after P3), tell its authors.

### D42 — What `ENGINE.md` did not say, as the core was built
**2026-11-19 · proposed · built this way in Session 2 · sharpens D24 and D25, changes neither**

Building the core found seven places where the text allowed two readings. Each was settled
the plainest way and written into `ENGINE.md`, marked (D42). No fixture and no pass bar moved.

1. `SOURCE` naming the source already in use changes nothing. Only a real switch clears state.
2. A `SOURCE` value that is neither source is ignored, like an index out of range.
3. `pi_process` with 0 frames does nothing: its commands are not applied.
4. The snapshot's seed is the one the generator last started from, after a 0 is replaced.
5. `pi_load`: the order of its checks; a version of 0 is `PI_ERR_VERSION`; bytes past 316
   are not read; values no core writes are clamped; a successful load moves `pi_generation`.
6. A tempo or sample-rate change can leave the table clock's phase up to one frame from
   where a stopwatch would put it. Not changed: it follows from "a command lands before its
   frame's ticks", which the fixtures depend on.
7. ⚠ When the tick counter wraps (26 days at 300 bpm, 65 at 120) one step is 64 ticks long.
   Left alone. The cure would be to wrap at a multiple of 192; cheap, but a change to D24.

Why proposed, not decided: these are the builder's readings. The owner can overrule any of
them cheaply now; after P3 and P4 two hosts will lean on them.

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
| O11 | ~~On the hardware each grid key is its own sound in play mode (R26, R27). Sixteen tracks from the start, or four and twelve dead keys?~~ | Answered 2026-11-19: D30 |
| O12 | ~~Answered 2026-11-19: the owner is content with the textile theme ("I think"). It still goes to O7 and D19 at P9.~~ The chosen look, Loom, animates a loom weaving with a shuttle and thread. The original's protected display art (R6) shows a sewing machine and thread spools. Different drawing, neighbouring subject. Is a textile theme far enough away, or should the display's subject move? | The owner, before the look is built on; then O7 and D19 at P9 |
| O10 | Probability and a short length are not on the hardware. What gesture sets them without colliding with its combinations? | `WORKFLOW.md`, after the hardware hour |
| O9 | ~~How do the three blocks stack on a phone, and does one instrument fill the screen or share it?~~ | Answered 2026-11-19: D36 |
