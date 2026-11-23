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
- Found in Session 13: Rack's screenshot mode works on this desktop and draws a module's face,
  which `-h` never makes: `cd ~/.local/opt/Rack2Free-2.6.6 && ./Rack -u <a user folder with
  the plugin installed> -t 3` writes `screenshots/PocketInstruments/*.png` and exits. The
  module is null there, so nothing is lit; a scratch build that fills the face's view by
  hand shows the lit states.
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
| 12, the page on a phone (Opus) | `web/rhythm.html`, playable; `make play`; P6's browser snapshot passed | 2026-11-23 |
| 13, the Rack module (Opus) | the Rhythm module, RETURN (D62) and its test, the panel's sixth jack, a format 2 self-test in Rack | 2026-11-23 |

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
- [ ] Play `web/rhythm.html` on the phone (P8's start), and listen for a dropout while
      editing it as it plays: the last of P6 (`PROOFS.md`).
- [ ] A look at Session 12's four ⚠ readings on the phone (`design/DESIGN.md`, "Not done").
- [ ] Try D61 by mouse on the desktop: Ctrl+click sound, click a key; the sheet's names and switches.
- [ ] A look at D59, Session 10's eight rulings.
- [ ] Two readings Session 11 built on (⚠ in `ENGINE.md` §15): a loaded chosen sound past
      15 becomes 15; snapshot bytes 381 to 383 are not read.
- [ ] The Rhythm module in Rack, by hand (Session 13): the look at 100% zoom (the ⚠ rows of
      `design/DESIGN.md`'s table and its "Not done"; the wordmark at 3.0 mm, 0.5 mm from
      RETURN and the plate); the latch (Ctrl+click); the computer keys, several at once (R25);
      a double-click on each slider, with and without bpm held; MIDI-Map on a slider (D54's
      ⚠); the round trip by ear: TRIGGERS ch 1 to any kick, back into RETURN ch 1 (D62); the
      CPU meter. Session 13's nine readings (its Handover) are for the same sitting.
- [ ] CI on all four platforms after Session 13's push (its Handover says what was seen).

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

## Session 14 — the weave (build, with the owner's eye; next)

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
      the same cells. Neither holds a rule. (Rack: `RhythmDisplay::draw` in
      `rack/src/Rhythm.cpp` leaves the weave's area dark; a self-test writes its name there.)
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

### After Session 12: the page on a phone (2026-11-23)

- **Built: `web/rhythm.html`, the first thing the owner can play.** Live, after the push,
  at `https://kinggs.github.io/sidequests/pocket-instruments/web/rhythm.html`. The Loom face,
  lit only from the core's view; several fingers at once; computer keys; the beat kept in
  the browser; the sounds sheet and the credits below it. The core did not change: ABI 5.
- **Proven:** `make play` passed in Chromium and Firefox: the worklet's trace is
  `straight-sixteenths`' after its pattern went in by keys and play was pressed;
  `keys-bpm-family`'s last view is the fixture's; about 250 drawings a browser read back
  off the face, each equal to its view; two fingers choose a sound and nothing stays held;
  a reload brings the beat back; the first touch starts sound and counts. `make p4` (24 of
  24, both) and `make listen` (both) still pass on the changed worklet. The repo's
  `make verify` passes. The report and all 276 render files: the same bytes as before.
- **P6's browser half passed its saved-pattern bar:** the snapshot saved while it played
  is bytes the wasm host ran `straight-sixteenths` from. P6 stays running for one thing,
  a dropout by ear on a phone while editing (below).
- **Every check failed once on purpose:** eight planted faults. One judge bug was found
  that way first: the keys-bpm-family line compared two missing values and passed
  (`LEARNINGS.md`).
- **Opus decided nothing; four readings were built on and marked ⚠** in `design/DESIGN.md`'s
  "Not done": a slider drags from where its cap shows (a touch alone moves nothing); the
  bar is ochre with pattern held, madder otherwise; a firing key stays white with reduced
  motion asked for; the sheet lights a sampled key as a step is lit. Each is a line or
  two of `web/rhythm.html`. Also: the font comes from Google Fonts, so offline it falls
  back to the system monospace, which belongs with the offline shell.
- **For the owner, blocking nothing:** play it on the phone (P8's start), with the PO-12
  beside it if it is to hand. While it plays, enter steps and move sliders for a few
  minutes and listen for a dropout: that closes P6. Then the readings above, and D59's
  (stopped, no key shows the playhead).
- **For Session 13 (Opus), what will bite:**
  - The page's checks press keys and read views through the core, so most of what Rack
    needs is already proven once; what is Rack's own is the latch (D57 item 4) and the
    parameters. Keep the Probe's `handoff.hpp` scheme: the page's equivalent, a count of
    queue entries taken beside each view and snapshot, was what made its checks exact
    rather than timed.
  - The view's white needs a host-side "last fires seen" per track, not a flag; the page
    keeps one array and a timer for when the next white goes out.
  - `rack/fixtures.jq` still leaves format 2 out; Session 13's own filter is in its list.
- **Later the same day, with the owner (D60, D61):** a mouse latches by **Ctrl+click** (Cmd
  on a Mac) on sound, pattern, bpm, function and fx; a plain click is a real hold; the next
  press of any key lets a latch go, a slider move does not. Session 13 builds the same in
  Rack, which keeps right-click for its own parameter menu (R47). The sounds sheet now
  plays what it sets: a name plays its sound, the switch changes it and plays it. `make
  play` has a fourth phase for both; three more planted faults, each caught.
- **Next: Session 13,** on Opus.

### After Session 13: the Rack module (2026-11-23)

- **Built: the Rhythm module,** `rack/src/Rhythm.cpp`, 24 HP, on the redrawn panel. Every
  key and both sliders are Rack parameters; the face is drawn from the core's view; CLOCK,
  RESET and the table clock; TRIGGERS, VOICES and AUDIO; the starter pack; the snapshot
  saved and loaded as the Probe does. The latch (Ctrl+click), the computer keys, D63's
  double-click, and the menu: Sounds, RETURN, and Self-test. The core did not change: ABI 5.
- **RETURN (D62),** `rack/src/jacks.hpp`, held by `rack/test/jacks.cpp`, which `make test`
  now runs. Unpatched, AUDIO is the core's mix bit for bit. A return of silence on channel
  1 gives the mix of the same beat with no bass drum, bit for bit, with VOICES and TRIGGERS
  unchanged. A sound's own VOICES channel returned gives the same mix **to within 1.2e-7,
  not bit for bit**: `5x / 5` is not always `x` in floats. To hold the core's order, the
  plugin is now built with `-fno-associative-math -fno-reciprocal-math` after Rack's
  `-funsafe-math-optimizations` (`rack/math.mk`). clang, which builds the macOS plugin,
  regrouped the sum without them.
- **The panel's sixth jack:** `design/make_panel.py` draws RETURN at 34 mm with ecru
  stitches. The wordmark moved right and, by D62 item 4, dropped to 3.0 mm: at 3.5 mm it
  is 37.8 mm wide and the room is 33.4 mm. It is outlined from ExtraBold now
  (`design/fonts/`, with the OFL), which closes DESIGN.md's old ⚠ about the Bold cut.
- **Proven:** `make test` (the report and all 276 render files the same bytes as before
  the session); `make -C rack selftest` at 44.1, 48 and 96 kHz: the four probes as before,
  and six Rhythm modules, the three format 2 fixtures each on the table and on an 8 Hz LFO.
  Each pressed its own parameters, one a frame from the frame after each boundary
  (`LEARNINGS.md` says why one a frame and why 8 Hz). Every pass matched its trace, every
  view its text, and both slider caps the view. One played through its own RETURN; a
  Rhythm instrument loaded an old patch's version 1 snapshot. Nine faults planted in the
  module and nine in `jacks.hpp`, each caught by a named check (two only after the test
  was tightened; `LEARNINGS.md`). The repo's `make verify`: see below.
- **Seen, not only counted:** Rack's screenshot mode draws the face on this desktop (Machine
  state). It found one bug no headless run could: the sliders were placed by centring a
  widget whose size Rack starts at infinity, so their position was NaN and they were never
  drawn. A scratch build with a hand-made view showed every lit state as DESIGN.md has it.
  Nothing has been pressed by hand.
- **Opus decided nothing. Nine readings built on, each ⚠, each a line or two:**
  1. The menu's per-key sample switch also plays the sound, as the page's sheet does (D60
     item 4 carried to Rack's menu).
  2. A key that a patch saved as held starts held, and is not a press. Rack saves parameter
     values; the module reads the first frame's as where things start.
  3. A slider drags at Rack's own knob speed (its settings apply), not one to one with the
     43 mm travel. One line: `speed` in `RhythmSlider`.
  4. Rack's Initialize empties the beat (a fresh engine) and sets RETURN back to "As the
     cable carries".
  5. Ticking one sound in RETURN's menu while on "As the cable carries" starts from the
     sounds the cable carries now.
  6. "RETURN carrying sound 1's own VOICES channel back gives the same mix" read as to within
     rounding (above).
  7. VOICES is not bent by tanh: one voice peaks near 2.5 V. Only AUDIO is.
  8. In a self-test the weave's area shows the fixture, its count and a green or madder
     square. Green is not a Loom token; it marks a test, not the instrument.
  9. The display's and keys' sizes measured off `loom/rack.html` and the page (DESIGN.md,
     "Not done").
- **CI and `make verify`:** filled in after the push below.
- **For Session 14:** the Rack display's weave area is `RhythmDisplay::draw`; the view
  reaches it through `Face` every frame, so painting cells is a loop there. `harness/race.cpp`
  and `keys.rs` still hold bytes 48 to 63 to zero (Session 14's list). The screenshot route
  (Machine state) is how to see the weave in Rack without a person.
- **Next: Session 14,** with the owner's eye.
