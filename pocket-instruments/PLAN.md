# Pocket Instruments — working doc for the sessions

The handover between sessions. Each session does its list, ticks its boxes, fills in results in
`PROOFS.md`, writes what surprised it in `LEARNINGS.md`, and leaves a Handover note at the
bottom of this file.

**Start every session with:** "Read `pocket-instruments/PLAN.md` and do Session N."
Design sessions run on Fable; build sessions on Opus, on the laptop (Arch, Omarchy). A build
session whose heading says Fable is one where a contract first meets code (2, 3, 10) or is
drawn by eye (14): there the session may rule on a gap; on Opus it stops and asks.

## Read first, every session

In this order, and no more than this before starting. Why so exact: the folder's documents
are about 300 KB, and a session that reads them all has spent its attention before it builds.

1. This file, whole. It is kept short for that (below).
2. `README.md` in this folder: the doc map and the rules.
3. `ENGINE.md`: the sections your session's list names, and §3 and §8 if you have not built
   on the engine before.
4. `DECISIONS.md`: the decisions your list and those sections cite, and the **Open** table
   at its end. For Sessions 12 to 14 that is D51 onwards. Not the whole log.
5. `PROOFS.md`: the ladder table at its top, and the proof your session runs, if it runs
   one. Do not change a pass bar to make it pass; record the failure.

Open the rest when a line sends you there: `LEARNINGS.md` before repeating a kind of work
it names (planting faults, moving a size bound), `PLAN-HISTORY.md` for how a past session
went, `WORKFLOW.md`, `VOICES.md` and `design/DESIGN.md` when your list touches them.

## Keeping this file short

`PLAN.md` holds what the next session needs: the rules, the machine, the lists not yet
done, and the latest two Handover notes. A session that finishes:

1. ticks its list and writes its Handover note at the bottom;
2. adds its line to "Done so far";
3. moves its own ticked list, and the Handover note before the last one, into
   `PLAN-HISTORY.md`, word for word. Annotate there if something needs saying; do not
   reword what was written.

## Ground rules

- No Teenage Engineering material in the repo: no samples, firmware, photos, traced art, logos.
- ~~Nothing visual before P3 passes (D15).~~ P3 passed on 2026-11-19; the look is Sessions 12
  to 14. No framework before a second instrument (README rule 5).
- Stable Rust only. A nightly feature would block every reproducible build (R13).
- No secrets. Commit direct to `main`, small commits, `make verify` before a push.

## Machine state (checked 2026-11-18)

- Present: g++ 16, clang 23, make, node 26, mise, VCV Rack Free 2.6.6
  (`~/.local/opt/Rack2Free-2.6.6`, user folder `~/.local/share/Rack2`).
- Since Session 2 (2026-11-19): Rust 1.100.0 through mise, with `wasm32-unknown-unknown`.
  It resolves only inside this folder (`mise.toml`); there is no global Rust.
- Since 2026-11-19, after Session 2: the Rack SDK 2.6.6 for Linux, at
  `~/.local/opt/Rack-SDK-2.6.6` (from vcvrack.com; the zip's sha256 began `420da245`). A blank
  plugin built against it with g++ in one `make`. `RACK_DIR` is not set in any shell file:
  give the plugin's Makefile that path as its default. clang's ThreadSanitizer reports a
  planted race, so P6's harness can run here.
- Missing: cmake (the SDK does not need it), Playwright, MinGW, lld, any macOS SDK, `xxd`,
  `/usr/bin/time`. Chromium 155 is present, and Firefox 158 (found at the start of Session 3;
  this line used to say it was missing).
- Since Session 3: rustup also holds `x86_64-pc-windows-gnu`, `x86_64-apple-darwin` and
  `aarch64-apple-darwin` (for `make targets`). The plugin is installed in
  `~/.local/share/Rack2/plugins-lin-x64/`. Rack runs headless: `rack/selftest.sh` (R40).
- ⚠ In Rack's Audio module use the PulseAudio driver, not ALSA. On ALSA Rack takes the
  Scarlett whole and the desktop loses it until its profile is switched off and on again
  (it happened during P3's ten minutes; the fix is in `~/.dotfiles/docs/kenny-archy.md`).
  `rack/patch/patch.json` names no driver, so Rack picks; choose by hand.
- Found in Session 6: Docker is installed but the user is not in the `docker` group, so
  `rack/ci-linux.sh` cannot be rehearsed here. CI runs it; nothing local needs it.
- Found in Session 10: `cargo` only works with this folder as the working directory. From
  anywhere else the mise shim fails with "No version is set". To build a scratch copy, stay
  here and pass `--manifest-path` and `CARGO_TARGET_DIR`. `jq` (1.8) is present; the Rack
  build needs it.

---

## Done so far

Each line's list and Handover note are in `PLAN-HISTORY.md` under the same name.

| Session | What it left | When |
|---|---|---|
| 0, review and plan | `REVIEW.md`, `DECISIONS.md`, `PROOFS.md`; D11 to D15 | 2026-11-18 |
| 1, the engine interface (Fable) | `ENGINE.md` §1 to §10, the C header, three fixtures, `WORKFLOW.md` as a draft; the look, Loom (D36) | 2026-11-19 |
| 2, P1 and P2 (Fable) | `core/`, the three harnesses, a fourth fixture. **P1 and P2 passed** | 2026-11-19 |
| 3, the proofs that could change the architecture (Fable) | `rack/` (the Probe, `handoff.hpp`), `harness/race.cpp`, `web/`, the click voice. **P3 passed**; D43 to D45 | 2026-11-19 |
| 4, the owner's hands | **P7 passed** on a phone; P4 on Android. Not finished: see below | 2026-11-19 |
| 5, the minimum beat (Opus) | bass drum, snare, two hats; the Probe plays the mix; D47, D48 | 2026-11-19 |
| 6, CI (Opus) | four Rack platforms built and checked on every push | 2026-11-19 |
| 7, the other eleven voices (Opus) | all sixteen code voices | 2026-11-19 |
| The listening page (Opus) | `web/listen.html`, `make listen` | 2026-11-20 |
| 8, samples (Opus) | a sample beside each voice, ABI 3 (D50) | 2026-11-20 |
| 9, the instrument planned (Fable) | `ENGINE.md` §13 to §16, D51 to D58, Sessions 10 to 14 | 2026-11-20 |
| 10, the workflow in the core (Fable) | keys, sliders, the view, the volume: ABI 4; fixture format 2 and three key fixtures; D59 | 2026-11-20 |
| 11, snapshot version 2 (Opus) | ABI 5: the snapshot holds the sliders, switches, volume and choice; version 1 still loads, in the core and the Probe; `PI_AUDIO_BOTH` | 2026-11-20 |

## Still the owner's hands

Unticked in the finished lists. None blocks a build session.

- [ ] P4: iOS Safari (no iPhone yet), and the tap pad filmed for latency. `PROOFS.md` P4.
- [ ] P5: the four loads in Rack, one a platform. `PROOFS.md` P5, "What the full proof
      still needs". CI has the four artefacts. ~~And VCV's answer (O2).~~ Answered
      2026-11-23 (R46): binary packages from an identity-verified author, by email.
- [ ] Reply to VCV: ask for the binary submission and identity verification details (R46).
      Recommended: ask now; it costs nothing and nothing is submitted until the gate.
- [ ] The hour with the PO-12: tick or correct each row of `WORKFLOW.md` and answer its
      eleven questions. By D29 this is done as mismatches turn up, not in one sitting.
- [ ] Measure the PO-12 (width, height, key pitch, jack spacing) for D16.
- [ ] By ear, on the listening page or in Rack: which keys become samples (D35, D50).
- [ ] A look at D59, Session 10's eight rulings.
- [ ] Two readings Session 11 built on (⚠ in `ENGINE.md` §15): a loaded chosen sound past
      15 becomes 15; snapshot bytes 381 to 383 are not read.

## The instrument's build: Sessions 10 to 14

Designed in Session 9. These two parts were written under its list and are in force.

### How the pieces join

```
finger ─► host ─ KEY_DOWN / KEY_UP / PARAM ─► core: keys ─► edits, FIRE ─► sequencer ─► voices ─► sound
                                                │
lights, caps, display ◄─ host draws ◄─ view ◄───┘        saved beat ◄─► snapshot version 2
```

- **A host sends what a finger did and draws what it is told.** The core holds the
  workflow (which key is held, write, the chosen sound, volume) and turns presses into the
  edits and `FIRE` that already exist. Nothing below the keys changes.
- **The view** is one 64-byte block the core fills: three masks for the grid's lights, the
  sliders as they should show, the playhead, and a count of firings per track. The page
  and the Rack module read the same block, so they cannot light differently.
- **The snapshot** grows to hold what the keys can now change (sliders, the code-or-sample
  switch, volume, the chosen sound). An old one still loads.
- **The page** is the worklet that exists plus a face: keys and sliders send three message
  kinds; the view comes back as a message. Multi-touch is real, so nothing latches.
- **The Rack module** is the Probe's plumbing (`handoff.hpp`, the clock, reset, the saving
  scheme) plus a face: every key and slider a Rack parameter, the view handed to the
  drawing thread through `pi::Latest`. A click latches (D23, D57).
- **The weave** is a pure function from a view to a grid of cells, in the core. Each host
  paints cells.

### Rules for Sessions 10 to 14

The standing ones: stable Rust; voices use only `+ − × ÷`; no trace and no pass bar is
edited; every new check fails once on a fault put in on purpose; `make verify` before a
push; no Teenage Engineering material. And for these five:

- **Decide nothing** (on Opus; see the top of this file). `ENGINE.md` §13 to §16 and D51 to
  D59 are the brief. Where they are
  silent or wrong, stop, write the question into the Handover, and build round it.
- **Expected output before the core runs it:** a fixture's trace and views are worked out by
  hand from `ENGINE.md`, committed, and only then run (as `reset-mid-bar` was).
- **What exists does not move** unless the session says so: the four fixtures' traces and
  the 114 render pairs stay the same bytes. Since Session 10 that is seven fixtures, with
  the three key fixtures' views. To prove it, keep `target/report-rust.txt` and a
  `sha256sum` of `target/render-*.f32` from before the first change and compare at the end.
  (Session 11 changes one thing in the report on purpose: the snapshot's hex in each
  "snapshot" label. The lines under every label stay. Done: they stayed, and the 114 render
  pairs are the same bytes. Session 11 added 18 pairs: `render-both`.)
- **A planted fault counts only if it built and a named test failed.** Run the unplanted
  copy first (`LEARNINGS.md`, Session 10).
- Each session ends by moving its sections of `ENGINE.md` from "designed" to built, with
  what turned out different marked, and by writing `LEARNINGS.md` and the Handover.

## Session 12 — the page: playable on a phone (build, Opus; next)

`web/rhythm.html`, in the Loom look (`design/DESIGN.md`, "The phone"; `design/loom/phone.html`
is the picture). Finishes P6. This is the first build the owner can play.

- [ ] The worklet: `KEY_DOWN`, `KEY_UP`, `PARAM` by message; the view posted back (§14's
      rule for when); the snapshot posted when the generation moves, a few times a second
      at most; a load by message, between blocks.
- [ ] The face: the plain display (tempo, `bpm`, the write mark, the step number, sixteen
      step marks; the weave's area left as bare display), sixteen keys, seven function
      keys, two sliders. Everything lit from the view; the page keeps no copy of the
      workflow. Pointer events with capture, several at once; nothing latches.
- [ ] Sound starts on the first touch, and that touch counts as a press.
- [ ] Computer keys (D57 item 5).
- [ ] The beat is kept in the browser (the snapshot, base64) and is there after a reload.
- [ ] Below the instrument: the sixteen code-or-sample switches with All code and All
      samples (from `listen.html`), and the credits (D7, and the README's second paragraph).
- [ ] Reduced motion respected; nothing under 16 px; every state without hue, as
      `loom/states.html` shows.
- [ ] `make play` (`web/play.mjs`, both desktop browsers, as `listen.mjs` does): enter
      `straight-sixteenths`' pattern by keys while stopped, press play, and the worklet's
      trace is that fixture's (the play key resets, so ticks start at 0); press
      `keys-bpm-family`'s keys and the last view, as text, is the fixture's last; every
      key's drawn state equals the view it was drawn from; two pointers held at once choose
      a sound; a reload brings the beat back. Each fails once on a planted fault.
- [ ] **P6's browser half:** enter a P2 fixture's pattern by keys while it plays, take the
      saved snapshot from the page, load it in `target/harness`: that fixture's trace.
      Fill in `PROOFS.md` P6.
      (Noted 2026-11-20: `target/harness` has no such mode yet. Either add one, or do as
      `harness/race.sh` does and look for the page's bytes among the report's "snapshot"
      labels. Keys cannot set a probability or a length, so the fixture is
      `straight-sixteenths`; the page's seed must be 1 and its tempo 120.)
- [ ] Not built: a link that carries a beat, an offline shell, the weave.
- [ ] For the owner after it: play it on the phone beside the PO-12 and start P8's list;
      tick or correct `WORKFLOW.md`'s readings, and D59's (stopped, no key shows the
      playhead).

## Session 13 — the Rack module (build, Opus)

`rack/src/Rhythm.cpp`, 24 HP, on `design/panel.svg`, at `design/DESIGN.md`'s positions. The
Probe is its template and stays as it is.

- [ ] The module: every key and both sliders are Rack parameters; `process` turns a
      parameter's change into `KEY_DOWN`, `KEY_UP` or `PARAM` on that frame. CLOCK patched:
      edges; unpatched: the table clock. RESET, with CLOCK ignored for 1 ms after.
      `PI_AUDIO_BOTH`: VOICES sixteen channels at 5 V to 1.0; AUDIO the mix, bent by tanh
      towards 10 V as the Probe does; TRIGGERS 10 V for 1 ms a firing, sixteen channels.
      Never a non-finite sample (`RACK-RULES.md`).
- [ ] The view to the drawing thread through `pi::Latest`; the snapshot saved and loaded as
      the Probe does (D43). The starter pack loaded as the Probe does.
- [ ] The widgets, drawn from the view: keys with field, frame, white, stitch and bar;
      function keys idle, pressed, latched; slider caps that follow the shown value unless
      held; sockets; the plain display. JetBrains Mono ExtraBold in `res/`, with its
      licence (OFL).
- [ ] The latch (D57 item 4) and the computer keys while the pointer is over the module
      (item 5). ⚠ R25: whether Rack reports several keys held at once is found out here.
- [ ] The menu: each key's code or sample, All code, All samples.
- [ ] **A self-test in Rack itself:** a patch that names a format 2 fixture makes the module
      press its own parameters (and send the fixture's `play` edit) and hold its events and
      views to the fixture, with a light, as the Probe does. `rack/selftest.sh` runs it
      headless at three rates. (Noted 2026-11-20: `rack/fixtures.jq` leaves format 2 out
      on purpose, for the Probe. This needs its own filter and its own `.inc`, built one
      `jq` a file as the Probe's now is.)
- [ ] `rack/check-dist.sh` and CI still green on all four platforms.
- [ ] Not built: sliders under CV, the neighbour connection (D40), the tempo-voltage clock,
      a player's own samples (D34), the expander.
- [ ] For the owner after it: the look in Rack at 100% (the ⚠ rows of `DESIGN.md`'s table);
      the latch by hand; MIDI-Map on a slider (D54's ⚠).

## Session 14 — the weave (build, with the owner's eye)

Recommended on Fable: which cells each of the seven rules lights is not designed, only its
inputs and its tests. That is drawing by judgment, with the owner watching.

ABI 6. `ENGINE.md` §16, `design/DESIGN.md` "The animation", `design/loom/frames.html`.

- [ ] The view's bytes 48 to 54 (§16: a u32, a u16, a u8; this line said 48 to 55), filled
      by the sequencer; fixtures' view text is unchanged (it leaves them out). Rust tests
      for the three fields. `harness/race.cpp`'s `look()` and `the_view_follows_edits…` in
      `core/src/tests/keys.rs` both hold bytes 48 to 63 to zero: change them with it.
- [ ] `pi_weave`: the seven rules as cells. Tests of the rules, not of a picture: stopped,
      the cells do not depend on the tick; the beater is 1 cell wide at no firings and 4 at
      sixteen; a beat with nothing set weaves one stitch; reduced motion never draws white
      rows. Natively and from the `.wasm`, the same bytes for a set of views.
- [ ] The page paints the cells (its own instance of the `.wasm`), the Rack display paints
      the same cells. Neither holds a rule.
- [ ] The owner watches it move, on the phone and in Rack. What is wrong is changed in the
      core, once. When it is accepted, three views and their cells are committed as the
      picture to hold to.
- [ ] `DESIGN.md`'s "Not done" list brought up to date.

## After Session 14

In the order they are likely wanted; none is planned in detail yet.

- **P8,** the owner's: the list of differences against the PO-12, and which keys become
  samples. It starts after Session 12.
- **The showpiece's last mile (D19):** a link that carries a beat (the snapshot in the URL),
  `web/` opening on the instrument, an offline shell. Then P9 and the approach to Teenage
  Engineering.
- **Live record,** the first "later" row: fixture format 3 for a press inside a step.
- A gesture for probability and a short length (O10). The hat cut (D47). A player's own
  samples (D34). The neighbour connection (D40). The expander (D33).
- Still the owner's hands: P4 on an iPhone and the tap film; P5's loads ~~and VCV's reply~~
  (VCV replied 2026-11-23, R46: the submission details are the owner's to ask for).

## After the gate

(Where this stands, 2026-11-20: the first two lines became Sessions 5 to 14 once P1 to P3 and
P7 passed. The last three still wait; "After Session 14" above orders them.)

Decided when P1 to P4 are in, not before:

- The tiny rhythm machine (D12): one voice in the core first (P7), then the instrument.
- **The showpiece (D19):** the tiny rhythm machine, playable from a link on a phone, with its
  own look inside D20's limits and its own display animation. This is what Teenage Engineering
  is shown, with a Rack module beside it. It has to be good enough to be worth their time.
- The look's gate (P9), then the approach to Teenage Engineering.
- P5 (shipping) and P6 (editing while playing) before a second instrument.
- Extraction to a standalone repository: licence file, name (O3), contribution rules.

---

## Handover

The latest two notes. Every earlier one is in `PLAN-HISTORY.md`.

### After Session 10: the workflow in the core (2026-11-20)

- **Built: ABI 4.** `KEY_DOWN`, `KEY_UP` and `PARAM` do what `ENGINE.md` §13 says, `pi_view`
  writes §14's 64 bytes, and the master volume is on the mix. No host has a face: nothing
  can be pressed or seen yet. That is Session 12 (the phone) and Session 13 (Rack).
- **The contract held.** The three fixtures were worked out by hand, committed, and only
  then run: all three passed at the first run on all three harnesses, no trace and no view
  edited. Where §13 and §14 were silent is **D59: eight rulings, built on, for the owner to
  overrule cheaply.** The one a player would see: stopped, no key shows the playhead.
- **Proven:** `make test` (103 Rust tests; seven fixtures, 168 runs a harness, one report;
  114 render pairs; the race harness with keys and views, six planted faults caught),
  `make p4` (24 of 24 in Chromium and Firefox, ABI 4), `make listen` (both), `make -C rack
  selftest` (three rates). Nothing older moved: the four fixtures' 96 report sections and
  every render file are the same bytes as before the session.
- **Every new check failed once on purpose:** 83 faults planted in the core, each failing a
  named test (one by aborting the run); 4 in the fixtures and 4 in each harness, each
  caught by the harness it was in. Two things that taught something are in `LEARNINGS.md`:
  a plant script that reported every fault caught when cargo had never run, and a rule
  missing from the rule tests that only a fixture caught.
- **Fixed beside it:** `rack/Makefile` built the Probe's fixtures with one `jq` over every
  file, whose exit status is the last file's alone. A fixture it refused was dropped and
  the build went on. Found when CI went green past three such errors; now one `jq` a file.
- **Sizes:** the engine is 2 352 bytes (was 2 328), inside the hosts' 4 KiB. The `.wasm` is
  26 998 bytes (was 23 692).
- **For Session 11 (Opus), what will bite:**
  - `the_generation_moves_exactly_when…` in `core/src/tests/keys.rs` has two halves. The
    random half holds "the generation moves exactly when the snapshot's bytes change" and
    should pass unchanged on version 2. The first half lists presses that leave the
    generation alone: the volume, sound + key and `param` lines there become movers
    (§15), so move them out of that list and say so.
  - The view's volume row is `(1 << volume) - 1`: a volume past 16 from a loaded snapshot
    would overflow it. §15's clamp (1 to 16) is what keeps it true; test the clamp.
  - `Host::save` in `core/src/tests/mod.rs` is a fixed 316, with the rest the plan lists.
  - `rack/fixtures.jq` leaves format 2 out, and `web/desktop.mjs` counts format 1 only.
    A new format 1 fixture still reaches both; a format 2 one reaches neither.
- **Not done, on purpose:** a view in the worklet or the Probe (Sessions 12 and 13); the
  weave's three fields, which stay zero (Session 14).
- **Waits for the owner, blocking nothing:** a look at D59. Still open from before: P4 on
  an iPhone, P5's loads ~~and VCV's reply~~ (answered 2026-11-23, R46), which keys become samples.
- **Next: Session 11,** on Opus.

### After Session 11: snapshot version 2 (2026-11-20)

- **Built: ABI 5.** `pi_save` writes §15's 388 bytes: version 1 plus each track's sliders,
  the code-or-sample switches, the volume and the chosen sound. `pi_load` takes both
  versions. Those four now move the generation, each only when its value changes.
  `PI_AUDIO_BOTH` (17 channels) gives the sixteen tracks and the mix from one call, for
  Session 13. Nothing a player can touch yet; that is still Session 12.
- **An old beat still loads, proven three ways.** The seven fixtures' version 1 snapshots
  were saved from the ABI 4 core before any change (`fixtures/snapshots-v1.txt`). Each
  loads into an engine whose new fields were all moved, sets them back to `pi_init`'s
  values, and gives its fixture's trace. In Rack, a patch carrying one is loaded by the
  Probe ("1 loaded"); it failed first with the old fixed-size copy, as planned.
- **Nothing older moved:** the report is the same line for line apart from the 42 snapshot
  hex labels, and all 240 earlier render files are the same bytes. 132 render pairs now
  (18 new, `render-both`), every one the same bytes natively and from the `.wasm`.
- **Proven:** `make test` (112 Rust tests; seven fixtures, 168 runs a harness, one
  report; 132 render pairs; the race harness, six planted faults caught), `make p4` (24 of
  24 in Chromium and Firefox, ABI 5), `make listen` (both), `make -C rack selftest` (three
  rates), the repo's `make verify` (its smoke test skips: no Playwright).
- **Every new check failed once on purpose:** 25 faults planted in the core, each built and
  failed a named test (one by aborting inside that test). One core fault caught by both
  harnesses' own layout check; one flipped sample caught by `compare.mjs`. What that
  taught (a copy's old file times fooled cargo; a plant aimed at the wrong line) is in
  `LEARNINGS.md`.
- **Found beside the list:** `harness/race.cpp`'s `enter()` built its "known" snapshot by
  setting only what version 1 held; it now sets every field version 2 holds.
- **Sizes:** the engine is 2 352 bytes (unchanged). The `.wasm` is 28 216 bytes (was 26 998).
- **For the owner, blocking nothing (Opus decided nothing):** two readings where §15 is
  silent, built on and marked ⚠: a loaded chosen sound past 15 becomes 15; bytes 381 to 383
  are not read. Either is one line in `core/src/snapshot.rs`.
- **For Session 12 (Opus), what will bite:**
  - The worklet holds no snapshot yet. Give it 388 bytes, and always pass `pi_load` the
    length read, not `PI_SNAPSHOT_SIZE`: a beat saved in the browser before ABI 5 does not
    exist, but a version 1 can come from anywhere a link carries one later.
  - `pi_generation` now moves on a slider, a switch, the volume and a chosen sound, so the
    page will post snapshots more often than Session 10's core would have. §8's "a few a
    second at most" still holds the rate.
  - P6's browser half: `straight-sixteenths`' saved snapshot now also holds the starting
    sliders, volume and choice. Entering its pattern by keys from a fresh page gives those,
    so the bytes should match the report's label. A page that moved a slider first will not.
- **Next: Session 12,** on Opus.
