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
**2026-11-19 · proposed (the owner asked for it; the choices are not made) · would supersede "nothing is sampled" in D31** · carried out: the choices by D35, the per-key switch by D50 (2026-11-20)

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

### D43 — How a host hands snapshots, edits and loads between its threads
**2026-11-19 · proposed · built this way in Session 3 · corrects `ENGINE.md` §8; the core and the ABI do not change**

P6's ThreadSanitizer half ran the core on one thread while another edited, loaded and took
snapshots. The core's rule (one thread calls it) held. The host recipe beside it did not.

1. **Snapshots out go through three buffers and one atomic exchange,** not "two buffers and
   an atomic index". The two-buffer scheme is a data race; the sanitizer reports it.
2. **Edits go in through one queue,** single writer, single reader, in order.
3. **A load goes in through the same queue as the edits,** as a marker with its bytes
   beside it. On its own channel a load and the edit after it can swap.
4. **The audio thread publishes a count of messages taken with each snapshot** where the
   host needs to know a save holds its last edit. A save otherwise may miss one block.
5. All of it is host code, in `rack/src/handoff.hpp`, and the browser needs none of it:
   a worklet message is a copy.

Why proposed, not decided: it changes a paragraph the owner decided (D25's "saving while
playing"). Why it is cheap: no fixture, no trace, no core function and no pass bar moved.
What it rules out: a second thread calling `pi_save` or `pi_generation` "because they only
read". Evidence: `PROOFS.md` P6.

### D44 — How sound crosses the ABI
**2026-11-19 · proposed · built this way in Session 3 · ABI 2 · sharpens D17; changes no trace, record or snapshot**

Until now the ABI carried no floats and no audio. P7 needed one voice in the core.

1. **Sound leaves through a buffer the host passes to `pi_process`:** `float *audio` and
   `uint32_t channels`, two more arguments on the one call. Not a second function: sound and
   sequencing share one frame loop, and two calls could be made out of step.
2. **32-bit floats, about −1 to 1, frame by frame.** The pointer is the host's and is not
   kept. No float is an argument or a return value, so D17's "plain data only" holds.
3. **`channels` is 1 (the mix) or 16 (each track alone).** Sixteen is D33's cable and
   expander, designed in now as `VOICES.md` asked. Anything else is no sound.
4. **Null means no sound and no cost.** Events are identical either way.
5. **Voices use only `+ − × ÷`.** No maths library. That is what makes the two hosts
   bit-identical, and it is a rule on every later voice, not a property of this one.
6. **One new edit, `SOUND` (20):** a track's slider A or B, 0 to 65535. Held by the engine,
   not in snapshot version 1.
7. `PI_ABI_VERSION` is 2. A host refuses a core whose number is not its header's.

Considered and not taken: a separate `pi_render` (two calls to keep in step); the core
keeping an output pointer set once (a dangling pointer when WebAssembly memory grows);
integer samples (no gain in exactness, since the float operations used are already exact
in the same way on both hosts, and a cost in every voice).

Open inside it, for the owner or the next design session, none of which blocks a build:
whether the mix gets a limiter in the core or each host saturates (`RACK-RULES.md` says
saturate); where the sliders sit in snapshot version 2; whether a slider moves a voice that
is already sounding.

Why proposed, not decided: it is a change to the ABI the owner decided (D17, D27).
Evidence: `PROOFS.md` P7, `ENGINE.md` §11.

### D45 — A tap fires a track: the `FIRE` command
**2026-11-19 · proposed · built this way in Session 3 · ABI 2, with D44 · adds to D26, changes nothing in it**

P4's phone half measures tap-to-sound, and nothing in the ABI could make a sound from a tap:
the keys are reserved until the workflow is built (D26).

`FIRE` (21), `a` a track: the track fires on the frame the command lands on, playing or
stopped. One `TRIG` event, with the latest tick and the playhead's step, and the track's
voice. It changes no pattern, takes no random draw and does not move `pi_generation`.

Why an edit-family command and not `KEY_DOWN`: what a key does depends on the mode (D37),
and that is the workflow's to settle. Whatever it settles, "play this sound now" is one of
the things a key press will turn into inside the core, so both hosts get it now and the
workflow uses it later. Why it emits `TRIG`: a tapped sound should pulse Rack's trigger
output and light the key exactly as a sequenced one does.

Why proposed: it is the builder's reading of what a tap in play mode means (R26, R27).
No fixture sends it, so no trace moved.

### D46 — The owner's rulings on D42, D43, D44 and D45, and the macOS floor
**2026-11-19 · decided (owner), by interview after Session 3**

- **D42 accepted, all seven.** The tick counter's wrap (item 7) stays as it is.
- **D43 accepted.** Three buffers and one ordered queue are the rule for any host.
- **D44 accepted, with its rule:** sound crosses as a buffer on `pi_process`, and every
  voice uses only `+ − × ÷`, so the hosts stay bit-identical. The option to let a voice use
  a maths library inside the −80 dB bar was offered and not taken.
- **D45 accepted.** `FIRE` stays. What a key press means in each mode is still the
  workflow's.
- **The plugin needs macOS 10.12 on Intel Macs.** Rack asks for 10.9 and rustc will not go
  below 10.12 (R38). P5's bar stays as written and is recorded as not met on that line,
  with this ruling beside it. It does not count against Rust under D13. (2026-11-23: VCV says
  10.12 is fine, R46.)

D44's own open list (a limiter, the sliders in snapshot version 2, a slider moving a
sounding voice) was not part of the interview and is still open. (Annotated 2026-11-20: the
limiter is D48. A slider waits for the voice's next hit, as built in §11 and tested, but
never ruled on. Snapshot version 2 is open, and now also holds D50's switch per key.)

For P5: the owner has no Windows machine, Intel Mac or Apple Silicon Mac to load a plugin
on yet, nor a friend with one. That half waits for one.

### D47 — The hats do not cut each other off, for now; keep it a switch
**2026-11-19 · decided (owner) · answers O13 for now**

Neither hat cuts the other, as built. The owner does not know what the hardware does and
wants it easy to change later. It is: a cut is a few lines in `Voices::trigger`, one voice
silencing another on the same frame. When it is wanted it goes in as a setting (off; closed
cuts open; open cuts closed), not a rewrite, and joins the snapshot with the sliders
(version 2). Check the PO-12 when one is to hand (D29).

### D48 — A fixed level in the core; each host softens past its own ceiling
**2026-11-19 · decided (owner), provisionally: "happy with the recommendation for now" · answers O14 · settles D44's open item on limiting**

Every voice leaves the core at a fixed level of 0.5 (−6 dB), in the mix and in the sixteen
channels alike. The four drums together, sliders at their middles, then sit near 1.0; the
worst case measured (`harness/render-beat.json`, every slider swept) peaks at 1.07. The core
caps nothing. Each host bends what passes its own ceiling with tanh: the browser at 1.0, the
Rack Probe at 10 V after scaling 5 V to 1.0.

How others do it, which is why this shape:
- **Hardware drum machines** sum their voices with headroom built into the mix, so one voice
  alone is well under full scale, and let a master volume and an output stage that
  saturates or clips take the rest. Loud is a character, not an error.
- **DAWs** mix in floating point with no ceiling inside, and leave headroom to the person
  (gain staging, a limiter on the master if they want one). Only the converter clips.
- **Web Audio** is floats too, but the output hard-clips at ±1, so pages put a gain or a
  compressor last.
- **VCV Rack** works in volts: audio is about ±5 V, the rails ±12 V, and a module saturates
  its own output. Mixers there offer soft clipping as an option.

So: a fixed level in the core, so a phone and Rack sound alike (D22), and no limiter in the
core, because a limiter would have to stay bit-identical (`+ − × ÷` only) and is a
character choice better left until the instrument's own output is built. Why 0.5: a power
of two, so it is exact and cannot cost the same bits.

What would reopen it: the owner's ear at P8; a voice level per track (the hardware's
volume key); a master volume, which the instrument will need anyway.

### D49 — Slider A on the tones moves in semitones
**2026-11-20 · decided (owner): "yes on the semitones" · confirms VOICES.md's guess for keys 15 and 16**

Slider A on the tone (15) and the bass tone (16) picks one of 25 semitones, two octaves
centred on A3 and A1, as built in Session 7. Why: a tone that lands between notes is out
of tune with everything else, and the semitone table keeps every note exact on every host.
It holds for the samples too: when 15 and 16 play D35's tones, slider A tunes them by the
same semitones (D35 said slider A "will have to tune" them).

### D50 — Each key plays its code voice or its sample: a setting per key, code by default
**2026-11-20 · decided (owner: "Go", on the four points below) · carries out D32 and D35 · ABI 3**

Every track can play its starter-pack sample (D35) in place of the voice built in code, by
a setting per key; hosts offer "all code" and "all samples" too. Every key starts on code,
because the PO-12 mixes synthesised and sampled sounds without saying which keys are which
(R45): switch a key by ear when the hardware is to hand (D29).

1. **The samples, as the engine reads them:** `samples/raw/<name>.s16`, mono, 16-bit
   little-endian, at the files' own 44.1 kHz, each scaled so its loudest point is full scale.
   Made from the FLACs by `samples/make-raw.py` and committed, so every host hands the
   engine the same bytes (a browser's FLAC decoder would not). `samples/tracks.txt` gives
   the order. 479 KB. (Proposed at 48 kHz; the files are 44.1 kHz, and keeping their own rate
   avoids a resampling before the engine's own.)
2. **Slider A on a sample:** speed and pitch together, in semitones, an octave either way;
   the middle as recorded (D49's semitones, for every key).
3. **Slider B on a sample:** from the middle up, the whole sample; below the middle,
   shorter, down to that key's shortest code length at 0. Then a 10 ms fade. (Proposed as
   the code voice's whole range; changed before it shipped, on the owner's word that the
   samples sounded right whole, so the middle plays them whole.)
4. **The setting:** per key, in each host: the listening page (kept in that browser) and the
   Rack Probe's right-click menu (saved with the patch). Not in snapshot version 1, like the
   sliders: it joins them in version 2 (D44).

How it crosses: `pi_set_sample(engine, track, data, frames)` hands the engine a pointer the
host keeps alive, and command 22 (`VOICE`) switches a track. This ends "the core keeps no
pointer": it keeps one kind, a sample's, and the contract says how long it must live.

Every number that shapes a sample is a first setting and sits in one marked block in
`core/src/voice.rs` ("TUNING SAMPLES"); `VOICES.md` says how to move one.

### D51 — The core interprets the keys and says what to light: the view
**2026-11-20 · decided (owner, Session 9) · carries out D26; extends D37 to the held keys · ABI 4**

Hosts send `KEY_DOWN`, `KEY_UP` and `PARAM`. The core runs the workflow and writes a
64-byte view: which keys light and how, the sliders as they should show, tempo, write,
the playhead, a count of firings per track. A host draws it and decides nothing.
`ENGINE.md` §13 and §14.

Why: D22 wants the phone and Rack to behave alike, and a lighting table written twice, in
JavaScript and C++, can disagree. In the core the whole workflow is tested once, as
fixtures. Not chosen: the core interpreting keys while each host works out its own lights;
each host interpreting presses and sending edits.

D37's table said nothing about a held function key. Now: sound held, the grid is sounds
with a bar on the chosen one; bpm held, the fields show the volume; in either mode.

### D52 — The first build is every "in" row of the workflow
**2026-11-20 · decided (owner, Session 9) · scopes D12**

Choose a sound, play, write, set a step, tap a key to hear it, sliders A and B, the tempo
presets, fine tempo, swing, master volume, clear. The pattern and fx keys are drawn and
press; only function + pattern does anything. No gesture for probability or a short length
(O10 stays open; both survive in a snapshot), no live record, chains, effects or locks.

Why: it is the whole of what `WORKFLOW.md` promises for the tiny rhythm machine, and the bpm
family is needed for a phone to play at any tempo but 120. Not chosen: the loop alone;
adding live record, which is first in line afterwards (it needs a press placed inside a
step, and changes what a press on write does).

### D53 — A plain display first; the weave once, in the core, as cells
**2026-11-20 · decided (owner, Session 9) · carries out D36's display**

The first page and Rack module show the tempo, the write mark, the step number and the
sixteen step marks. The weave then has its own session: the core draws it as a grid of 1 mm
cells, each a palette number, and both hosts paint the cells (`ENGINE.md` §16).

Why: nobody has seen the animation move, so it will be tuned by eye, and one drawing is
tuned once. It is integers only, the same on both hosts, and testable as bytes. Not
chosen: a canvas version and a NanoVG version; holding the first playable build for it.

### D54 — The slider caps follow the chosen sound
**2026-11-20 · decided (owner, Session 9) · answers `WORKFLOW.md` question 4 for us · a deliberate difference**

Choosing a sound moves both caps to that sound's own A and B; holding bpm moves them to
swing and tempo. The view carries the value to show, and a `PARAM` equal to it changes
nothing, so a host can move a cap without sending an edit.

Why: what is seen is what is heard, and nothing jumps in sound at a touch. A knob cannot
do this; a drawn slider can. Not chosen: caps that stay where the hand left them.
⚠ In Rack the module moves its own parameter; how Rack's MIDI-Map behaves when it does is
to be tried at P8.

### D55 — Snapshot version 2
**2026-11-20 · decided (owner, Session 9) · closes D44's and D50's open item; makes room for D47**

Version 1 plus each key's sliders, each key's code-or-sample switch, master volume, the
chosen sound, and a byte for the hat cut. 388 bytes. Not saved: write mode (a shared beat
should play when tapped, not be edited), held keys, playing. The tempo presets are fixed,
not saved. Version 1 loads, with the new fields at their starting values; the core writes
version 2 only. `ENGINE.md` §15.

### D56 — A slider waits for the voice's next hit
**2026-11-20 · decided (owner, Session 9) · rules on what §11 built · closes D44's open list**

A sounding voice keeps the pitch and length it was hit with. Why: it is built, tested and
bit-identical; it is what a per-step slider lock will be; and the drums are short. To hear
again at P8: the long tones, where a moving pitch might be missed.

### D57 — What Session 9 settled without asking, for the builder
**2026-11-20 · proposed · built on from Session 10 · the owner can overrule any of it cheaply before then**

1. **Master volume scales the mix only,** by `(volume / 16)²`; the sixteen track channels
   are direct outputs, before the master. It starts at 16, so no earlier render moves.
2. **A third audio layout,** 17 channels: the sixteen tracks, then the mix. Rack needs
   VOICES and AUDIO from one call.
3. **The plainest readings, each ⚠ in `WORKFLOW.md`:** choosing a sound plays it; bpm
   changes the preset on release, and only if nothing else used it while held; a tempo
   change is at once; write flips on the press; clear empties every sound's steps and puts
   every probability back to 100.
4. **The latch in Rack (D23), made exact.** Sound, pattern, bpm, function and fx latch on a
   click and let go on a second. Play and write never latch. A grid click lets every
   latched key go when it ends. A click on a second latching key while one is latched is a
   press and release of the second, then the first lets go (function, then pattern, is
   clear). A slider drag lets nothing go. So in Rack the tempo preset is two clicks on bpm.
5. **Computer keys (D28):** `1234`, `qwer`, `asdf`, `zxcv` for the grid; `7 8 9` for
   sound, pattern, bpm; `u i o p` for function, fx, play, write. Real holds, no latch.
6. **Names for now:** the page is `web/rhythm.html` and the Rack module's slug is `Rhythm`.
   ⚠ A slug cannot change once published: O3 (the name) is settled before any release.
7. **The Probe stays** as P3's proof and keeps its own saved Sounds setting.
8. **The page's code-or-sample switch per key (D50)** is a sheet below the instrument, not
   on its face, with the credits (D7).

### D58 — The owner accepts D57
**2026-11-20 · decided (owner: "happy with all the suggestions on your side") · settles D57's proposal**

All eight items of D57 stand as written. The readings of the hardware in item 3 are still
guesses (D29): each stays a ⚠ row in `WORKFLOW.md` until the PO-12 confirms or corrects it.

### D59 — What `ENGINE.md` §13 and §14 did not say, as the core was built
**2026-11-20 · ruled in Session 10, as its brief allows (`PLAN.md`), and built on · the owner can overrule any item; each is a line or two of `core/src/keys.rs` · as D42 was for §1 to §8**

The contract held: the three fixtures worked out by hand from §13 and §14 passed at the
first run, with no trace and no view edited. These are the places it was silent. Each is
written into `ENGINE.md`, marked (D59), and held by a rule test.

1. **The generation in ABI 4 follows snapshot version 1.** A step, clear, swing and the
   tempo move it. The volume, the chosen sound and a sound's sliders do not until Session
   11 puts them in version 2. Why: §13 says "something a snapshot holds", and the only
   snapshot this core writes is version 1; a generation that moved for a volume key would
   make every host save a snapshot identical to its last.
2. **The view's flag 3** ("a step has played since play") is set by the first step after
   play, or after a reset while playing, and is clear whenever the sequencer is stopped. So
   stopped, no key carries the playhead's frame. Why: play always starts from step 1 (D57),
   so a stopped playhead points at nothing. Not chosen: leaving it lit where it stopped.
3. **"The tempo taken in whole bpm" is rounded down.** 97.5 bpm shows on slider B as 97.
   Only a `TEMPO` edit can make a tempo that is not whole; keys cannot.
4. **Field and stitch can share a key:** the stitch is every other sound's steps, including
   where the chosen sound has one too. `design/DESIGN.md` already draws that state.
5. **"Uses bpm"** is a grid key pressed or a slider moved while bpm is down, even when the
   value it sets is not new. Another function key pressed with bpm down is not a use, and a
   `PARAM` equal to the shown value is not one either: it is nothing at all, which is what
   lets a host set its cap from the view while bpm is held and still get a clean release.
6. **`fires` counts every firing,** whether or not its event found room, as a voice sounds
   whether or not it did (§11). Nothing sets a count back.
7. **A fixture's view is written for the table run;** the edges run expects `edges=1` in its
   place. Why: the flag is true information for a host and belongs in the text; it is also
   the one field that must differ between the two runs.
8. **Small totals.** A `PARAM` for a slider that is neither A nor B is ignored. Play and
   write act whatever else is held. Clear is function, then pattern: the other order is two
   keys held.

Also settled, about the harnesses and not the instrument: the Rack Probe and the P4 page
stay on the four format 1 fixtures (neither has keys; Sessions 12 and 13 run format 2 in
their own hosts), and `harness/race.cpp` hands a view between its threads as well as keys,
which Session 10's list did not ask for and Session 13 will need.

### D60 — A mouse latches by right-click, on the page and in Rack; the sheet plays what it sets
**2026-11-23 · decided (owner: "a mouse-latching pattern of right-click latching", "I would prefer to have the same behaviour in Rack"; the sheet: "the key intent here is to be able to hear the sound you are configuring") · supersedes D57 item 4 · extends D57 item 8**

1. **Left-click is a real hold, everywhere.** It works with the computer keys (hold sound
   with the mouse, press `v`) and keeps the tempo preset to one click on bpm.
2. **Right-click latches** sound, pattern, bpm, function and fx: held, its face lit in its
   own colour, until a press of any key ends (the gesture is done: right-click sound, click
   16) or it is right-clicked again. A slider move lets nothing go, so right-click bpm, set
   swing and tempo, right-click bpm to finish (used, so no preset step). Play and write
   ignore it: they stay on alone. A right-click on a grid key does nothing. Touch never
   latches (D23).
3. **Rack follows the same rule** (Session 13). ⚠ The cost there: a right-click on a Rack
   control opens its parameter menu (R47), so the five function keys lose theirs. MIDI-Map
   learns by a left-click on the control, which stays; mapping helpers that work from the
   menu (stoermelder's CTX) would not reach those five. To try in Session 13, with
   Ctrl+click (Cmd on a Mac) as the fallback latch if the menu is missed.
4. **The sounds sheet** (D57 item 8): a row a sound. Its name plays it (`FIRE`, which
   chooses nothing); its switch turns it to code or sample and plays the result, in one
   message so the switch lands first. A name goes white when its sound fires, from the
   view's counts.

Why: one pointer cannot hold two keys, and D57 item 4's left-click latch took away the
plain hold that a mouse and keyboard together can do. Right-click keeps both. Not chosen:
D57 item 4 as written; a modifier-click on the page.

### D61 — The latch is Ctrl+click, on the page and in Rack
**2026-11-23 · decided (owner: "lets go with CTRL+Click for now") · supersedes D60 items 2 and 3 (the right-click); the rest of D60 stands**

Ctrl+click (Cmd+click on a Mac, as Rack reads Ctrl) on sound, pattern, bpm, function or fx
latches it, by D60's rules: a press of any key that ends lets it go, a slider move does
not, Ctrl+click again lets it go. Ctrl+click on play, write or a grid key is a plain press.
A right-click does nothing on the page, and in Rack keeps its own parameter menu (R47).

Why: one rule on both hosts (D22) without taking Rack's menu off five controls. R47's
nearest precedent, the monome grid modules, latches with a modified click too. "For now":
to be tried by hand at P8.

### D62 — In Rack, the sounds go out and come back: a sixteen-channel RETURN
**2026-11-23 · decided (owner: "we want to be able to route individual sound triggers to modules and then route the individual sounds back. Way more so than samples. It shows off the power of Rack. And is probably the main thing we want to be able to show off to Teenage Engineering"; "Yes please" to this proposal) · extends D33 · for Session 13**

The Rack module's showpiece is routing, not samples: each sound's trigger out to any Rack
module, each sound's audio out, and each sound back into the instrument's own mix.

1. **TRIGGERS and VOICES out,** sixteen channels each, as D33 and Session 13's list say.
2. **RETURN in,** a sixth jack, sixteen channels: channel *n* (5 V is 1.0, as VOICES) takes
   sound *n*'s place in AUDIO's mix, and the master volume still applies:
   `mix = Σ (returned or own) × (volume / 16)²`, then the tanh the Probe uses. The core
   does not change: `PI_AUDIO_BOTH` already gives every track and the mix, and the view
   gives the volume, so the module rebuilds the mix only when RETURN is patched; unpatched,
   AUDIO is the core's mix as it is. VOICES and TRIGGERS are untouched by RETURN.
   Process a sound: VOICES ch 2 → a filter → RETURN ch 2. Replace one: TRIGGERS ch 1 → any
   Rack kick → RETURN ch 1.
3. **Which sounds it replaces:** by default, the channels the cable carries (channel 1 up
   to its count). The right-click menu has a tick per sound, "Sound *n* from RETURN", with
   "As the cable carries" to go back to the default; saved with the patch. Why: a cable
   carrying channel 5 also carries 1 to 4, silent, and would mute those sounds.
4. **On the panel:** an input, so on the dark body beside RESET, at x = 34.00 mm, with
   sixteen stitches round it as the other sixteen-channel jacks have, labelled RETURN.
   The wordmark moves right to clear it (it is centred at 49 mm and spans about 30 to 68);
   if `make_panel.py` shows it still touching RETURN or the output plate, it drops from
   3.5 to 3.0 mm. Redrawn by `make_panel.py`, never by hand.
5. **Samples step back:** Session 13 keeps only the starter pack and the per-key menu it
   already plans. A player's own samples (D34) stay parked.

Not chosen: D33's expander first (a jack per sound is the cleanest return, but a second
module before the first is shown); a return that replaces a sound only while it is
loud (silence between hits would bring the own voice back).

### D63 — A double-click puts a slider back to where it started
**2026-11-23 · decided (owner: "double-clicking on a slider or knob resets it to default position. Can you please do that for the sliders?")**

A double-click, or a double-tap on a phone (two presses on one slider within 300 ms), sets
it to its starting value: a sound's A or B to the middle (32768, `pi_init`'s); with bpm
held, A to swing 0 and B to 120 bpm (21845, the value the view shows for 120, §14). It is
sent as an ordinary `PARAM`, so the core decides as for any move.

In Rack (Session 13): Rack's own double-click resets a parameter to its configured
default, which with bpm held would give 150 bpm. The module sets the parameter to the same
starting values instead, from the view.

### D64 — The clock stays one edge a step, as SEQ-3's does; the menu offers one edge a beat
**2026-11-23 · decided (owner: "Lets stick to what rack does with e.g. Seq3 already, and add the right-click config") · keeps `ENGINE.md` §4 · not built yet**

1. **CLOCK in is one edge a sixteenth step by default,** as now and as VCV's SEQ-3 does. A
   clock module's ×1 output (Impromptu's Clocked) is one pulse a beat, so it needs ×4. Seen
   by the owner in Rack on 2026-11-23: Clocked at ×1 ran the beat at a quarter of the speed.
2. **The right-click menu adds "one edge a beat",** saved with the patch, so a ×1 clock plays
   at its tempo. Where it lives is for the session that builds it. In the core (four steps
   spread across each edge), the page and Rack cannot disagree; that changes §4 and
   wants fixtures for both settings.
3. **Proposed, not decided:** on an external clock the display shows the tempo measured from
   the edges, marked as not the module's own, in place of the stored tempo. The owner saw the
   display keep 116 while Clocked ran at 123. The engine already measures the period
   (§4), so this belongs in the view (§14), for both hosts.

Why: Rack's step sequencers count one edge a step, and a player who knows SEQ-3 expects it.
The menu covers the ×1 clock without moving the default. The Pocket Operator's own sync
pulse is a third convention, not yet known (R23 ⚠): a later menu entry once the hardware
hour gives its rate.

### D65 — The owner's rulings at the end of Session 13
**2026-11-23 · decided (owner, by interview) · settles D64 item 3 and Session 13's readings**

1. **Effects come next:** Session 15 (the effects design loop, O15) before Session 14 (the
   weave). Why: the effects shape the Rack showpiece, maybe its jacks, so they are settled
   before more is built.
2. **D64 item 3 is decided:** on an external clock the display shows the tempo measured from
   the edges, with a small "ext" mark. Built by the next session that changes the view.
3. **Session 13's nine readings are accepted as built** (`PLAN-HISTORY.md`, After Session 13;
   each still a line or two to change): the menu's switch plays the sound; a key saved as
   held is not a press; sliders drag at Rack's knob speed; Initialize empties the beat and
   resets RETURN; a RETURN tick starts from what the cable carries; own-return "the same
   mix" to within rounding; VOICES not bent by tanh; the self-test's green square; the
   display and key sizes measured off the picture.
4. **CI's Linux image:** a prebuilt Docker image with Ubuntu 16.04's packages in it, as a
   small first task of the next session. Why: `apt-get update` takes about 12 of the
   job's 13 minutes.

### D66 — Effects: a lane a pattern, written as it plays, on the sounds that are switched in
**2026-11-23 · proposed (Session 15, the design loop the owner asked for in O15) · built on from Session 16 · the owner can overrule any item cheaply before then**

What the PO-12 does is R48 to R54, and, the same day, the owner's own unit (`WORKFLOW.md`,
"The effects: what to check on the PO-12"): items 2 and 3 below were checked on it and two
first rulings were corrected by it (marked). What we take:

1. **One effect a step, in a lane beside the pattern.** Sixteen entries, none or an effect
   1 to 16, saved with the pattern. (R51: one a step is the likelier reading of the
   hardware ⚠.)
2. **Recorded as it is played, with write off,** as the PO-12 does (R49, and seen in both
   videos, R53): while playing, each step that arrives with fx and a key held takes that
   effect, and replays it every bar. **Held alone, fx empties each step that arrives.** The
   maker later changed this to "only with write on" (R52); we follow the PO-12, because the
   workflow is the thing kept faithful (D22).
3. **A punch is heard at once and written by the steps that arrive.** The step being
   played when the key lands is not written (checked the same day: a key pressed after
   the snare on step 5 left it clean the next bar, and the hat on step 7 was crushed):
   so what the lane replays is exactly what was heard from the sequencer. **Stopped,
   nothing:** not heard, not written, as the hardware. (First ruled: heard on taps while
   stopped. The owner's PO-12 does nothing, and D22 keeps the workflow faithful.)
   **Of two keys held, the last wins, and the first comes back when the last is let go,**
   as the hardware. (First ruled: letting go leaves none.) **No key lights for an effect;**
   the display marks a step that has one, with a mark of our own.
4. **"Per channel" is a switch a sound: through the effects, or not.** All sixteen are in
   at the start, which is the PO-12 (R50: its effects are on the whole mix; nothing found
   supports effects per sound there). Switching a sound out keeps it clean and steady
   while the rest is crushed or repeated. Set from the sounds sheet on the page and the
   Sounds menu in Rack, beside the sample switch; no key gesture, so nothing collides with
   the hardware's combinations. The common hardware shape is a send a voice (R62); a switch
   is the smallest form of it.
5. **Two kinds of effect.** Sequencer effects change which hits fire (the four repeats);
   they go out as triggers, so in Rack each sound's TRIGGERS channel carries its repeats:
   the effect triggers, per channel, that the owner's brief asks for. Sound effects change
   the bus (crush, filters, distortion).
6. **Our sixteen keep the hardware's roles on the hardware's keys** (as the sounds do,
   D31), built by us, named in our words. An effect not built yet still punches, records,
   shows and sends its gate in Rack; only the sound is unchanged.
7. **Clear (function + pattern) empties the lane too** (checked on the owner's PO-12).

Not chosen: recording only with write on (the PO-33's way: cleaner for a mouse, but not
this instrument's workflow); a lane a sound (sixteen lanes, and no evidence the hardware
has them); two lanes, one for each kind of effect, so a repeat and a filter could share a
step (attractive, and cheap to add later: the kinds are already separate in the core).
`ENGINE.md` §17.

### D67 — The first effects: four repeats in the sequencer, then seven on the bus
**2026-11-23 · proposed (Session 15) · built in Sessions 16 and 17**

1. **Repeats are sequencer effects, not a loop of stored sound.** Effects 9 to 12 re-fire
   the step the run began on, 4, 3, 8 and 6 times a beat. No memory, exactly in time, the
   same on both clocks, in the trace, and out on TRIGGERS. What it cannot do is repeat a
   tail; a drum machine that owns its sequencer does not need to (R57). ⚠ The rates are our
   reading of the names, and the hardware has not confirmed that 9 repeats at all: the
   owner held it and heard none (`WORKFLOW.md`). Ours is our own effect on that key until
   it is known.
2. **Seven sound effects on one bus,** from four small parts: a sample-and-hold (1), a
   rational soft clip (2), a truncation (3), and one state-variable filter (5 to 8, two
   fixed and two swept in musical time). `+ − × ÷` only, the same bits on every host,
   nothing computed while idle. Every constant is a first value for the owner's ear.
3. **Ported with credit, not linked:** the filter, its polynomial `tan`, the soft clip and
   the sample-rate reducer are from Émilie Gillet's stmlib and Plaits (MIT, R56), each a
   few lines, with her notice in our file and a line in the credits. The core stays one
   crate with no dependencies. Read for ideas only, never ported: `sloop-fm1` (GPL),
   `fm1-radio` (MPL), Surge's `sst-*` (GPL), DaisySP's LGPL half (R55, R56).
4. **Waiting:** 4 delay and 14 feedback (they need stored sound: how much, and whose
   memory, is a design of its own); 13, 15 and 16 (nobody describes them, R48: the hardware
   first).

`ENGINE.md` §17 and §18.

### D68 — In Rack: FX GATES out, and FX SEND and FX RETURN round the bus
**2026-11-23 · proposed (Session 15) · built in Session 18 · the panel is the owner's eye**

What stays: CLOCK, RESET, RETURN in; TRIGGERS, VOICES, AUDIO out (D62). Added, three jacks:

1. **FX GATES out, sixteen channels:** 10 V on channel *n* while effect *n* is heard,
   punched or replayed from the lane. This is how the performance drives Rack effects: a
   gate into a filter's CV, a delay's send, or stoermelder's STRIP to switch a row of
   modules on. Bidoo cOPIA's LANES output is the same idea (R59).
2. **FX SEND out and FX RETURN in, one channel each: the bus.** FX SEND always carries the
   switched-in sounds, before any effect. With FX RETURN patched, an effect marked "from FX
   RETURN" is heard from the cable in place of the core's own: the bus crosses over to
   what came back while that effect is held, and back when it ends. By default the marked
   ones are those the core has no sound for (the delay, first), so patching a delay round
   the loop gives effect 4 a sound at once. The menu has a tick an effect, as RETURN has
   a tick a sound (D62 item 3). So each sound reaches **either** the internal effects
   **or** a Rack effect, by one cable and a tick.
3. **A returned sound goes through the effects too.** TRIGGERS to a Rack kick, back in
   through RETURN, and a punch crushes or repeats it like any other. For that the returns
   move into the core (`ENGINE.md` §19); the module stops rebuilding the mix itself.
4. **Two loops, not three.** The owner wondered about three sets of sends and returns.
   TRIGGERS, VOICES and RETURN are already a loop a sound; FX SEND and FX RETURN are the
   loop for the bus; AUDIO is the master, and anything after it is a cable. A third set
   would be a second bus, which nothing yet needs (README rule 5).
5. **On the panel, not an expander** ⚠ for the owner's eye. Nine jacks fit the row at the
   inputs' 11.67 mm pitch (inputs at 10.67 to 45.67 mm, outputs at 63.00 to 109.67); the
   wordmark has to leave the row. Why not an expander: Rack 3 is to rework the expander
   interface (R60), and a module's showpiece should not need a second module.
6. **A patched channel cannot be told from a silent one** (R58), so neither new loop
   guesses from a cable's channels: FX RETURN is one channel, switched by the jack and the
   menu.

Not chosen: a send and return a sound for effects (VOICES and RETURN are that already); the
gates as triggers (a held effect is a gate; Rack's standard is 10 V while active, R34); an
FX GATES input, so another sequencer could play the punches (a good later jack, as cOPIA
has: it needs only `KEY_DOWN`s from the module).

### D69 — The page has every internal effect and no loop
**2026-11-23 · proposed (Session 15) · built in Session 19**

On the page fx and a key work as on the hardware, with real fingers; Ctrl+click latches fx
for a mouse (D61). The sounds sheet gains a switch a sound, "through fx". What the core
does not sound yet does nothing audible there, and the display still marks it. There is no
outside effect on a phone: what the page plays is the internal set, and a beat made in
Rack with outside effects plays there with those steps dry.

### D70 — Sixteen jacks for MixMaster: a breakout expander, later
**2026-11-23 · proposed, parked (the owner asked: "send all 16 of our voices straight to it") · not planned**

MixMaster cannot take one cable for sixteen tracks, and no trick with its inserts saves a
cable (R61). Today: VOICES into VCV Split, sixteen cables. One gesture needs sixteen mono
output jacks, which is D33's expander: a right-hand breakout with a jack a sound and one
menu item, "Connect to MixMaster", that makes the sixteen cables (R61: about twenty lines
on the Surge team's MIT helper, which D40 and D41 already chose). ⚠ Not built or tried; it
leans on MindMeld's module names and port order, and Rack 3 will rework expanders (R60).
After the effects.

### D71 — Seen on the PO-12: the chosen sound's steps are lit whether write is on or off
**2026-11-23 · a fact from the owner's hardware; the change was proposed here and decided in D72 · supersedes D37's write-off row**

The owner, with the PO-12 in hand: "With write off, it *still* shows the programmed steps
as active. If I switch to another sound, they are all gone. When switching back to sound
1, they all show again. When playing, they show steady, and flash when they go active. The
'play marker' still goes from step 1 through to 16 at the clock speed. When I press write
again, the screen shows write, but the steps stay *exactly* the same." R53's second video
shows the same.

So on the hardware the grid always shows the chosen sound's steps, and write changes only
what a tap does (and the mark on the display). Ours, by D37 and D38, lights no steps with
write off: the grid "is sounds" there and flashes each key as its sound fires.

Proposed, for the owner to rule: the field shows the chosen sound's steps in both modes;
write still decides what a tap does. Open inside it: with write off, whether keys still
flash as *their own* sound fires (what the owner sees flash may be the lit steps as the
playhead reaches them, or each sound's key: asked, not yet answered), and whether the
other sounds' stitches (D36) show in both modes. It changes `ENGINE.md` §14's table, the
three key fixtures' views, the page and the module, so it is a small session of its own
before the weave, not a fix in passing.

### D72 — The owner's rulings on Session 15
**2026-11-23 · decided (owner: "Accept D66 to D69, panel jacks, D71 yes, D70 later. Lets start with more jacks on panel (for now)") · settles O16**

1. **D66 to D69 stand as written,** with the three corrections the owner's PO-12 made the
   same day already in them. What is still a reading of the hardware stays ⚠ until checked
   (`WORKFLOW.md`).
2. **The three new jacks go on the panel** (D68 item 5), "for now": an expander is still
   the fallback if nine do not sit well when drawn.
3. **D71 is decided: the grid shows the chosen sound's steps whether write is on or off,**
   as the hardware does. Session 20 builds it. Its open point was answered the same day:
   while playing, every sound's key flashes as that sound fires, and the playhead's key
   as it passes. Ours already tells those two apart, which the hardware cannot: white for
   a firing, the frame for the playhead (`ENGINE.md` §14). So with write off the field is
   the chosen sound's steps, and the white and the frame stay as they are.
4. **D70, the breakout for MixMaster, waits until after the effects.**

### D73 — Session 16's three readings stand
**2026-11-23 · decided (Fable, as the design loop's author; `PLAN.md` lets a Fable session rule on a gap) · the owner can overrule**

Session 16 built `ENGINE.md` §17 on Opus, decided nothing, and marked three readings. Each
is ruled as built:

1. **A step that writes the lane moves the generation,** when it changes the entry. Why:
   the generation exists so a host knows the snapshot's bytes have changed (§8, §13), and
   they have, whoever wrote them.
2. **A repeat waits for the first step after play;** play from stopped and reset clear
   what the sequencer last read. It is §17's "play from stopped, and reset, set last = 0"
   carried to the effect itself.
3. **Bytes 402 and 403 of a version 3 snapshot are not read,** as 381 to 383 are not (§15).

Verified before ruling: the repo's `make verify` re-run by this session (143 Rust tests,
216 harness runs, 0 failed), `fx-repeat-punch.json` moved up with no change (git shows a
pure rename), CI run 45179129088 green on all four platforms.

### D74 — Sliders a step: locks, live record, and their CV in Rack
**2026-11-23 · proposed (the owner asked for the design: "The hardware modules save the position of these relative to each step. Whether in write mode or live-recording mode") · items 1 to 5 superseded the same day by D75, a simpler rule the owner chose; items 6 and 7 still proposed**

What exists: each sound has its own sliders A and B, read when the sound is hit and saved
with the beat (D54 to D56). A is pitch (filter pitch on the hats, cymbal and noise;
semitones on the two tones, D49) and B is length, each over a range of the sound's own
(`VOICES.md`); on a sample A is the playback pitch and B the length (`ENGINE.md` §12). The
owner's ear on the PO-12 agrees: "They *seem* to do pitch and release". What is missing is
a value for one step.

1. **A lock is a value of A or B on one step of one sound,** used in place of the sound's
   own slider when that step fires. A byte each: 512 in all, saved with the beat. D56
   already reads a slider at the hit "as a per-step slider lock will be".
2. **Recorded two ways, as the hardware** (R26, R28, R53; `WORKFLOW.md`'s two "later"
   rows): with write on, hold a step and move a slider, and that step alone takes the
   value; playing, hold write and move a slider, and every step that arrives takes the
   slider's value for the chosen sound. The second is the effects lane's rule (D66).
3. **Live record comes with it.** Holding write is also how notes are played in, so write
   has to turn on or off when it is let go, and only if nothing used it, as bpm does (the
   ⚠ row "Write turns on at the press" in `WORKFLOW.md` said it would be asked again).
4. **The caps follow the locks as it plays** ⚠ the owner's eye: D54 already moves a cap to
   what is heard.
5. **Clearing** ⚠ not known on the hardware: taking a step off clears its locks; clear
   empties them all.
6. **In Rack, sliders out and back:** A OUT and B OUT, sixteen channels each, hold each
   sound's value at its latest hit, 0 to 10 V; with TRIGGERS that is a sixteen-channel
   sequencer of triggers and two voltages for any Rack voice. A IN and B IN, sixteen
   channels each: a returned channel takes that slider's place at the sound's next hit,
   chosen as RETURN's channels are (D62 item 3; R58). Read only on a hit, through
   `ENGINE.md` §19's layout, so it costs next to nothing.
7. **Four more jacks do not fit a panel that is full at nine** (D68, D72). Recommended: one
   right-hand expander for these four and D70's sixteen voice jacks, which then has two
   jobs. The other way is a second row of jacks. The owner's call. ⚠ Rack 3 is to rework
   expanders (R60).

Order proposed: after Session 17, a Session 21 for items 1 to 5 in the core; Rack's part
with Session 18, so the panel and the expander are decided once.

### D75 — The sliders are where the hand left them, for every sound; a step keeps the positions it was written with
**2026-11-23 · decided (owner: "Yes to a) and b), make it Session 21"; "simplicity wins. Perhaps we just start with 'slider positions matter, and we record with where they are'") · supersedes D54 (the caps following the chosen sound) and D74 items 1 to 5 · D55's sliders a sound stay in the snapshot, with a new meaning**

How we got here: the owner dragged a slider in Rack, tapped the kick and heard no change,
then saw on the PO-12 that "the knob positions *seem* to affect everything regardless of
which sound is selected". R53's second video shows the same from the other side: the
presenter sets the pitch, enters steps, moves the knob, enters more, and each step keeps
what the knob was when it went in. D54 had each sound own its sliders and the caps jump to
the chosen sound's; that was a guess, marked as one, and it is not the hardware.

1. **Two positions, the hand's.** Moving A or B sets it for all sixteen sounds. A tap
   plays its sound at those positions. Choosing a sound no longer moves a cap.
2. **A step keeps the positions it was written with.** Turning a step on in write mode
   stores A and B as they are at that moment; the sequencer plays the step with those, and
   moving the sliders afterwards does not change it. Turning a step off forgets them;
   clear forgets them all. To change a step: take it off, set the sliders, put it back.
3. **The first build is exactly that, and no more.** Not in it: holding a step and moving
   a slider to change that step alone; holding write and moving a slider to record
   movement as it plays; live record of notes. Those are the hardware's, the owner finds
   the hardware's own behaviour here confusing ("it feels like it ignores me ... when I
   re-select the sound ... it records it in the new way"), and they come later, as their
   own design, once the simple rule has been played.
4. **Each slider shows two things:** the cap, which is the hand and never moves by itself;
   and a second, thinner mark at the value the chosen sound was last hit with. With steps
   written at different positions the mark steps along as the beat plays. The idea is the
   Surge XT Rack modules' way of showing a modulated value on a control (D40); no code or
   artwork of theirs. `design/DESIGN.md` draws it, with the owner's eye.
5. **Holding bpm is unchanged:** the sliders set swing and tempo, and the caps show them
   while it is held (the one case where a cap still moves by itself).
6. **A beat saved before this sounds as it did:** on loading an older snapshot every step
   is given its sound's own slider values, so the hand cannot change an old beat by
   moving.
7. **D74 items 6 and 7 stand as proposed:** in Rack, A and B out per sound at each hit and
   back in, on an expander shared with D70's voice jacks. Not accepted yet (O17).
   (Decided later the same day: accepted, on the panel in a second row, not an expander: D76.)

Why: one rule a player can hold in the head, the hardware's own rule for taps, and the
smallest change to the core. ⚠ The owner's PO-12 was not checked for item 2 beyond what
the video shows; if the hardware turns out to differ, the difference is listed in
`WORKFLOW.md` as deliberate. `ENGINE.md` §20.

### D76 — Two rows of jacks, grouped by what they carry; the sliders' voltages go out and come back
**2026-11-23 · decided (owner: "lets start with second Jack Row. And also carefully consider the grouping of the Jacks so that they are logically grouped (inputs and outputs for the same kinds of things close together)") · settles O17 · accepts D74 items 6 and 7, on the panel · supersedes D68 item 5's single row**

Thirteen jacks: the six there are, D68's three, and four for the sliders (A OUT, A IN, B
OUT, B IN: D74 item 6). No expander; D70's breakout for MixMaster is still later and
separate.

1. **Grouped by kind, an output beside the input that answers it.** Proposed, for the
   owner's eye once `make_panel.py` draws it (positions are arithmetic, not a drawing ⚠):

   ```
   upper row, y about 97.5 mm (voltages that steer):
     CLOCK  RESET  |  A OUT  A IN  B OUT  B IN  |  FX GATES
     10.67  22.33     40.00  51.67 63.33  75.00    86.50

   lower row, y 116.30 mm, as now (triggers and sound):
     TRIGGERS  VOICES  RETURN  |  wordmark  |  FX SEND  FX RETURN  |  AUDIO
     10.67     22.33   34.00                   80.67    92.33         109.67
   ```

   - **The sounds' loop** reads left to right as it is patched: TRIGGERS out, VOICES out,
     RETURN in.
   - **The effects** are one column group: FX GATES above FX SEND and FX RETURN.
   - **Each slider** is a pair: out, then in.
   - **The clock** keeps the top left, where a patch starts; **AUDIO** keeps the bottom
     right, where it ends.
   - The wordmark keeps a place in the lower row's gap (about the 33 mm it has now).
2. **This moves five of the six jacks that exist.** TRIGGERS, VOICES and RETURN change
   sides and CLOCK and RESET go up a row. Patches keep their cables (Rack ties a cable to
   a port's number, not its place); only the picture changes. Nothing has been released.
3. **Inputs and outputs are told apart by the socket and its plate, not by side** (the
   look's rule, `design/DESIGN.md`): with groups mixed, each output gets its own patch of
   the inverted ground (R33) in place of one plate at the right.
4. **What the slider jacks carry.** A OUT and B OUT, sixteen channels: the A and B each
   sound was last hit with by the instrument's own reckoning (what the step keeps, or the
   hand: D75), 0 to 10 V, held until its next hit. A IN and B IN, sixteen channels: for a
   sound chosen as RETURN's are (the channels the cable carries, or ticks in the menu), the
   voltage on its channel at the moment of its hit takes that slider's place. The outputs
   say the value *before* an input replaces it, so OUT, through any module, back to IN is
   a chain and not a loop that holds itself. `ENGINE.md` §19.

**Accepted for now** (owner, the same day: "Lets do that for now. Some of these things you
have to use for a while to get a real feeling of whether they work. And it affects
cable-clutter as well"). So the grouping is judged in use, with cables in, not on the
drawing: a later session may move jacks, and port numbers never change when it does.

Why two rows on the panel and not an expander: the owner's choice; one module shows
everything, and Rack 3 is to rework expanders (R60). The cost is height: the second row
takes the band between the keys (to about 86 mm) and the jack labels, which the wordmark
and stitching use now.

### D77 — Session 17's four readings stand; the plugin ships the notice of the code it ports
**2026-11-23 · decided (Fable, as the design's author; the owner can overrule) · settles Session 17's questions**

Verified first: the repo's `make verify` re-run by this session (161 Rust tests, 216
harness runs, none failed); CI run 45184004576 green on all four platforms; `bus.rs`
carries Émilie Gillet's copyright line and the MIT notice.

1. **An effect's state is cleared when it starts from idle or from another kind of
   effect;** the four filters are one kind. As built.
2. **"Damping 0.5" is stmlib's `r`, so Q is 2.** That is what §18's equations say (`r` is
   in them); the word was loose. A first value for the owner's ear like every other.
3. **A tick on the very frame a sweep begins is not counted.** At most one tick.
4. **Heard again while ramping out, the sweep starts again and the filter keeps its
   state.** It follows from "the ticks since `heard` became that effect".
5. **The plugin ships the MIT notice as a file,** beside the font's OFL, and
   `check-dist.sh` holds it there. Why: the licence asks for the notice "in all copies or
   substantial portions", and a `.vcvplugin` is a copy with no source in it. The sentence
   in the module's description stays. Session 21 does it.

Known and left for Session 18: in Rack with RETURN patched the effects are not heard,
because the module rebuilds AUDIO from the sixteen channels (D62). §19 moves that into the
core.

### D78 — The fx latch stays on, and holds fx only while a grid key is down
**2026-11-23 · decided, to try (owner: "It's frustrating that it clears it after I CTRL+CLICK on FX, then a number (which after the number de-latches)"; "Lets try your plan for the mouse FX latch, and see how it goes") · changes D61 for fx only · hosts only, the core does not change**

1. **Ctrl+click on fx latches it until it is Ctrl+clicked again.** A press of a grid key no
   longer lets it go.
2. **While latched, the host sends fx down only while a grid key is down:** the key's
   press is `KEY_DOWN` fx then `KEY_DOWN` the key; its release is `KEY_UP` the key, then
   `KEY_UP` fx once no grid key is still down. So each click punches for as long as the
   mouse holds it, and between clicks fx is not held.
3. **Why not simply hold fx while latched:** fx held with no key down empties each step
   that arrives (D66, as the hardware). A latch that held it would wipe the lane between
   clicks.
4. **To clear with a mouse,** hold fx itself with a plain click while it plays, as now.
5. **Sound, pattern, bpm and function keep D61's rule:** their gesture is over after one
   key. The fx key shows latched in its own colour, as the others do.
6. The page and the Rack module both; touch never latches (D23).

Tried and judged in use. The owner the same day, after playing the effects on a phone with
real fingers: "I LOVE the FX stuff ... It brings so much of the fun and playfulness of the
module to the front. The performative ideas."

### D79 — Session 21's readings stand; the owner hands the next sessions on
**2026-11-23 · decided (Fable, as the design's author; the owner can overrule) · and the owner's go-ahead, quoted**

Verified first: the repo's `make verify` re-run by this session (181 Rust tests, 300
harness runs, none failed); CI run 45189993571 green on all four platforms, with the MIT
notice held in each package; `keys-tap-and-choose` changed in its views and its `about`
only, no line of trace.

1. Ruled as built: ABI 8; of two firings of one sound on one frame the later decides which
   values the mark shows; `KEEP` on a step that is off keeps (an edit says what the
   pattern becomes, and the values sit beside the steps as the lane does); a load leaves
   each sound's last hit alone; with bpm let go the cap goes back to the hand, and a
   host's first view counts as after a load.
2. **Every harness also plays each fixture from a kept snapshot.** Accepted: a beat
   entered by keys now saves different bytes from the same beat entered by edits, and the
   pass bar itself did not move.
3. **Left for the owner's eye:** how the second mark looks, and whether it is drawn over
   the cap. The thin thread-coloured line stands in.

The owner, the same afternoon, going away from the desk: "Please continue and do more of
the sessions with sub-agents like you have been doing. I trust your work and progress.
Make as much progress as we can without me needing to do more of the recordings and
things"; and "I think you can even start a first prototype / attempt at a weave as well
please." So Sessions 18, 19 and 20 run in turn, each verified before the next, and then a
first attempt at Session 14. Not started without the owner: Session 22 (the recording),
any tuning by ear, the repeat's rule for an empty step, and the acceptance of the weave.

### D80 — What §19, D68, D76 and D78 did not say, as Rack's jacks were built
**2026-11-23 · decided by the builder (Fable, Session 18, which PLAN.md lets rule on a gap); each item is the owner's to overrule · nothing the owner decided (D72, D75, D76, D78) is changed · `ENGINE.md` §19 marks each ⚠**

Verified first: `make test` before the first change (181 Rust tests, 300 runs a harness),
with its report, the hashes of all 372 render files, `make bench` and a perf profile of the
module kept; at the end the report and the 372 files are the same bytes.

In the core:

1. **ABI 9,** by the rule for Sessions 16 to 19.
2. **Two loop layouts, chosen by the channel count:** `PI_AUDIO_LOOP`, 18, and
   `PI_AUDIO_LOOP_SLIDERS`, 50. §19's addition left "how it is asked" to the builder. Why a
   layout and not a `ROUTE` bit: the layout is already how a host says what it wants
   written, and a host that needs less asks for less. The Rack module asks for the smallest
   that carries what is patched, and for `PI_AUDIO_BOTH`, as before, when nothing is.
3. **`ROUTE` 1 may mark any of the sixteen effects** (bit *n* − 1 is effect *n*), one the
   core sounds and a repeat among them. §19 says the repeats "cannot go outside": the
   repeating cannot (it is the sequencer's, and goes out as triggers), but while a marked
   repeat is held the bus crosses to FX RETURN as for any other. So "repeat, with a Rack
   delay on it" is one tick.
4. **An input that is not a number is silence, in the core.** The module cleaned RETURN
   itself until now; with the returns in the bus, one NaN would stay in a filter's state.
   One guard, in one place, for every host.
5. **Channel 17 is read while an outside effect is heard and for the 2 ms it ramps out.**
   A host that leaves the loop layout meanwhile (its cables pulled) hears the bus as it is
   for those 2 ms.
6. **Changing which effects are marked while one is held** starts it again as the other
   kind, with the ramp as it is: §18's rule for one effect straight to another.
7. **A slider's input is turned to 0 to 65535 to the nearest.** §19 said "rounded down".
   Measured: rounded down, 5 116 of the 65 536 values come back one less after Rack's
   volts (× 10 out, ÷ 10 in), so A OUT patched to A IN would shift a sound; to the nearest,
   all 65 536 come back exact, plainly and through the volts (a test tries them all).
8. **A sound not yet hit shows its own on A OUT and B OUT,** following a slider or a load
   until its first hit (§19 says "shows its own"; this says it keeps following).

In the module:

9. **FX RETURN's default ticks are effects 4 and 13 to 16,** "those the core has no sound
   for" (D68 item 2), and none of the repeats. With FX RETURN unpatched no effect is heard
   from outside, whatever is ticked.
10. **FX RETURN reads one channel:** the cable's first (D68 item 6 says it is one channel).
11. **FX GATES says every effect that is heard,** the ones with no sound yet as well: 10 V
    on channel *n* while the view's `heard` is *n* (D68 item 1, `ENGINE.md` §17).
12. **A IN's and B IN's ticks, and FX RETURN's, are saved with the patch** beside RETURN's
    (`"a"`, `"b"`, `"fx"`), and Rack's Initialize puts all four back to their defaults.
13. **On one frame a function key goes down before any grid key, and comes up after them.**
    The module read its keys in number order, so fx (key number 20) and a grid key landing on one
    audio frame was a tap, not a punch. D78's latch sets both together, and so can MIDI.
14. **The Sounds menu's "through fx" is a submenu,** with All and None above the sixteen
    ticks: thirty-five lines in one menu was too long to read.
15. **The module's mix is the core's, always.** `jacks.hpp` keeps only volts in and out;
    its test holds those, and that the whole path is the core's own render.

The panel (D76's positions were arithmetic; `design/make_panel.py --check` now holds
them):

16. **The left three columns are at 12.4, 25.4 and 38.4 mm,** not 10.67, 22.33 and 34.00.
    TRIGGERS is 13.3 mm of lettering at the 2.6 mm the guide's 100% zoom needs: 11.67 mm
    apart it touched VOICES. CLOCK and RESET sit on the same two columns above.
17. **FX SEND and FX RETURN are at 84.0 and 96.0 mm with FX over the word,** not 80.67 and
    92.33 on one line, where the two labels overlapped by 1.5 mm. **FX GATES is at 90.0,**
    midway over them. The wordmark keeps 3.0 mm, 1.2 mm clear each side.
18. **Each output has its own plate,** as wide as its stitches or its label. TRIGGERS' and
    VOICES' meet, so they read as one; FX SEND's and AUDIO's are the taller, for the second
    line, and AUDIO keeps its frame.

**Left open, for the owner:**

- The look, at 100% zoom and with cables in (D76 says it is judged in use):
  `design/rack-face-*.png`.
- **A OUT through a module to A IN is one hit late** (`ENGINE.md` §19, "Found"). Is that
  the instrument wanted? The other reading: the output says the value the *coming* hit
  will use, which the core cannot know for a tap, and can for a step only a tick ahead.
- Whether a marked repeat should cross the bus (item 3), and the default ticks (item 9).

### D81 — Session 18 verified; how the display says an effect, as a stand-in for the owner's eye
**2026-11-23 · decided (Fable; the owner is away and can overrule: D79) · for Session 19 · the look is a stand-in, marked ⚠ in `design/DESIGN.md`**

Session 18 verified first: the repo's `make verify` re-run by this session (204 Rust
tests, 300 harness runs, none failed); CI run 45200249016 green on all four platforms; the
panel looked at in `design/rack-face-lit-200.png`: two rows, thirteen jacks, grouped as
D76 asks, the wordmark in the lower row's gap. D80's eighteen items wait for the owner
(O18); none blocks the page.

So that the page and the Rack display cannot draw an effect two ways, and Session 19 need
not wait:

1. **While an effect is heard, a block like the write mark:** solid, with `fx` and the
   effect's number in it (`fx 3`, `fx 11`), beside the write mark in the display's column.
   Madder, the fx key's own colour, where the write mark is ochre. Absent when none is
   heard. From the view's byte 55.
2. **The lane, on the step marks:** a step that holds an effect has a small madder tick
   above its mark. From the view's bytes 56 and 57. The step marks themselves do not
   change, so the beats still stand taller and the playhead still shows.
3. **No picture of a machine, and no spark.** The hardware's spark belongs to its sewing
   machine, which is its protected artwork (R6). A block and a tick are Loom's own parts.
4. **Both hosts,** from the same bytes. Reduced motion changes nothing: neither moves.

Why now and not with the owner: the owner asked for as much as can be built without them
(D79). Everything here is drawing in the two hosts; the core does not change, so a
different look later costs a few lines in each.

### D82 — Session 19 verified; the grid with write off, exactly, for Session 20
**2026-11-23 · decided (Fable; the owner is away and can overrule: D79) · completes D71 and D72 item 3**

Session 19 verified first: the repo's `make verify` re-run by this session (204 Rust
tests, 300 harness runs, none failed); CI run 45205345348 green on all four platforms; the
display looked at in `design/rack-face-lit-200.png`: the `fx 3` block above the write mark
and four ticks over the step marks.

1. **A mistake of D81's, left as built for the owner's eye.** D81 called madder "the fx
   key's own colour". It is the sound key's; the fx key's band is ecru. The block and the
   ticks were built madder, as D81 said twice. They stay madder until the owner looks:
   they read clearly against the ochre write mark, and an ecru block would look like a
   lit key. Session 19's other four readings stand as built.
2. **With write off, the grid's row in `ENGINE.md` §14 becomes:** field, the chosen
   sound's steps; stitch, none; bar, none; the grid is still sounds. So the chosen sound's
   steps are lit in both modes (the owner's PO-12, D71), every key still goes white as its
   own sound fires, and the frame still marks the playhead (D72 item 3).
3. **Why no stitches with write off:** the hardware shows only the chosen sound's steps;
   the stitch is ours, for seeing the other sounds' steps while editing, and with write
   off each sound already shows itself by going white as it fires. Three kinds of light
   on a grid nobody is editing is one too many.
4. **A field key that fires goes white** for its half step and comes back lit, as any key
   does: the host's rule for white already says so.
5. The other rows (bpm, sound, pattern held; write on) do not change.

## Open

| ID | Question | Needs |
|---|---|---|
| O1 | ~~What do the front-face drawings of the design patents actually claim?~~ | Answered 2026-11-18: R4, R5, R6. Led to D20 |
| O2 | Will the VCV Library build or accept a plugin with Rust in it? | Watch Phona (R16a, R16b: not submitted yet, 2026-11-19). **Asked 2026-11-19:** the owner emailed support@vcvrack.com with four questions (can the Library build a Rust part; would prebuilt static libraries do; is macOS 10.12 a problem; is self-hosting the route) and P3's results. ~~No reply yet~~ **Answered 2026-11-23: R46.** The Library will not build it; it takes binary packages from an identity-verified author, by email. 10.12 is fine. Left: whether to ask VCV for the submission details (the owner's) |
| O3 | Is the name "Pocket Instruments" free, and is it too close to POCKET OPERATOR? | A register search; a decision on a family name |
| O4 | ~~How does swing behave on an external clock?~~ | Answered 2026-11-19: D24 |
| O5 | ~~Saved state: one readable format shared by both hosts, or a versioned binary snapshot each host wraps?~~ | Answered 2026-11-19: D25 |
| O6 | EU and UK registered designs and marks | A search of EUIPO and UKIPO |
| O7 | A lawyer's view of the mockup before public release | P9 |
| O8 | ~~Answered by D23.~~ The hardware is played with two fingers: hold a function key, press a grid key or turn a knob. A mouse has one pointer. How are combinations made in Rack? Proposed: a click on a function key latches it (it glows) until the next grid press or a second click; computer keys held while hovering also work. The phone browser has real multi-touch and needs neither | Session 1, with D22 in mind; try it at P8 |
| O11 | ~~On the hardware each grid key is its own sound in play mode (R26, R27). Sixteen tracks from the start, or four and twelve dead keys?~~ | Answered 2026-11-19: D30 |
| O12 | ~~Answered 2026-11-19: the owner is content with the textile theme ("I think"). It still goes to O7 and D19 at P9.~~ The chosen look, Loom, animates a loom weaving with a shuttle and thread. The original's protected display art (R6) shows a sewing machine and thread spools. Different drawing, neighbouring subject. Is a textile theme far enough away, or should the display's subject move? | The owner, before the look is built on; then O7 and D19 at P9 |
| O10 | Probability and a short length are not on the hardware. What gesture sets them without colliding with its combinations? | `WORKFLOW.md`, after the hardware hour. Not in the first build (D52) |
| O13 | ~~Answered 2026-11-19 for now: D47.~~ Do the hats cut each other off, and which way? `VOICES.md` says the open hat (4) cuts the closed (3) "as a real hat does"; on a real hat it is the closed that cuts the open. The hardware's behaviour is not known. Built 2026-11-19 with neither cutting the other. Recommended: closed cuts open, as a kit does, then checked on the PO-12 (D29). Cost either way: a few lines in `Voices::trigger`; the sixteen-channel layout (D33) shows the cut in track 3's channel | The owner; the hardware when to hand |
| O14 | ~~Answered 2026-11-19, provisionally: D48.~~ The mix now passes 1: the four drums together peak at 2.1 (+6.6 dB, `harness/render-beat.json`). Where is it kept in bounds: a level and a limiter in the core, or each host saturating (D44's open item; `ENGINE.md` §10 put it "with the second voice")? Meanwhile the Rack Probe bends its output with tanh towards 10 V, so it can be heard; the browser page does nothing. Recommended: a fixed master level in the core (so a phone and Rack sound alike, D22) and each host saturating at its own ceiling. A limiter in the core would have to stay bit-identical (`+ − × ÷` only) | The owner, before the instrument's own output is built |
| O15 | ~~Effects (next: D65): what the PO-12's fx does (punch-in, layering, per sound), what our first fx in the core is, and how each sound reaches either the internal fx or a Rack effect, with fx triggers out per channel (one, or three, sends and returns?). The owner's brief is in `PLAN.md`, Session 15~~ | Answered 2026-11-23 by Session 15, as proposals: D66 (the lane), D67 (the first effects), D68 (Rack), D69 (the page). The owner accepts or overrules; the hardware checks are in `WORKFLOW.md` |
| O16 | ~~The owner's rulings on Session 15: D66 to D69 as proposed? In particular: effects always recorded, as the PO-12 (or only with write on); a switch a sound for "per channel"; three more jacks on the panel and the wordmark moved (or an expander); D70's breakout for MixMaster; D71, the grid's lights as the hardware has them~~ | Answered 2026-11-23: D72. (Was recommended: accept D66 to D69; D71 yes, as a small session before the weave; D70 after the effects) |
| O17 | ~~Sliders a step (D74): the design as proposed? The four CV jacks on an expander with D70's voice jacks, or a second jack row?~~ | Answered 2026-11-23: D75 (the simpler rule) and D76 (a second row on the panel) |
| O9 | ~~How do the three blocks stack on a phone, and does one instrument fill the screen or share it?~~ | Answered 2026-11-19: D36 |
| O18 | Session 18's rulings (D80): the eighteen items as built? And its three open points: the two-row panel judged with cables in; A OUT to A IN being one hit late; a marked repeat crossing the bus | The owner, in Rack. Recommended: accept the items; play the slider loop before ruling on the lateness |
