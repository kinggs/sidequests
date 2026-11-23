# Pocket Instruments — working doc for the sessions

The handover between sessions. Each session does its list, ticks its boxes, fills in results in
`PROOFS.md`, writes what surprised it in `LEARNINGS.md`, and leaves a Handover note at the
bottom of this file.

**Start every session with:** "Read `pocket-instruments/PLAN.md` and do Session N."
Design sessions run on Fable; build sessions on Opus, on the laptop (Arch, Omarchy). A build
session whose heading says Fable is one where a contract first meets code (2, 3, 10, 18) or is
drawn by eye (14, 18): there the session may rule on a gap; on Opus it stops and asks.

## Read first, every session

In this order, and no more than this before starting. Why so exact: the folder's documents
are about 300 KB, and a session that reads them all has spent its attention before it builds.

1. This file, whole. It is kept short for that (below).
2. `README.md` in this folder: the doc map and the rules.
3. `ENGINE.md`: the sections your session's list names, and §3 and §8 if you have not built
   on the engine before.
4. `DECISIONS.md`: the decisions your list and those sections cite, and the **Open** table
   at its end. For Sessions 12 to 15 that is D51 onwards; for 16 to 20, D62 onwards. Not
   the whole log.
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
- **Efficient, measured (the owner, 2026-11-23: "I really want the module (and everything we
  do) to be pretty efficient").** A change on the audio path says what it costs a frame,
  before and after, measured, not guessed: cycles in Rack's `process`, nanoseconds in the
  engine. How it was measured in Session 13 is under "Found in Rack after Session 13".

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
  hand shows the lit states. (Session 18: `-t 1` is 100% zoom, `-t 2` 200%; it does not
  write over a screenshot that is there, so delete `screenshots/` first.)
- Since Session 13: `perf` 7.2 is installed. `perf_event_paranoid` is 2: `perf record -e
  cycles:u -c 200000` works, call graphs (`-g`) do not. To profile the module, build it with
  whatever presses play, copy the unstripped `rack/plugin.so`, `plugin.json` and `res/` into
  a scratch user folder's `plugins-lin-x64/PocketInstruments/`, give it a patch, and run
  `perf record ... ./Rack -h -u <folder>`; then `perf report --sort sym -n` and `perf
  annotate`. Compare runs by sample counts over the same seconds and patch.
- Since Session 15: CI's Linux build runs in our own image on GitHub's container registry
  (`rack/ci-linux.Dockerfile`). A change to it, to `rack/ci-linux-setup.sh` or to
  `rust-toolchain.toml` makes a new tag, and the next push builds it once (about 12
  minutes, in apt). It cannot be built here: Docker is installed but the user is not in
  its group. `yt-dlp` is present: `yt-dlp --skip-download --write-auto-subs --sub-langs en
  --sub-format vtt <url>` fetches a video's captions (how R53 was read).
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
| 15, the effects researched and designed (Fable) | CI's Linux image (28 s, from 78 s or worse); R48 to R62; `ENGINE.md` §17 to §19; D66 to D71; a fixture by hand; Sessions 16 to 20 | 2026-11-23 |
| 16, the lane and the repeats in the core (Opus) | ABI 6: `FX`, `FXSOUND`, the fx key, the lane, the four repeats, snapshot version 3; `make bench`; a second fixture by hand; `snapshots-v2.txt` | 2026-11-23 |
| 17, the bus and seven sound effects (Opus) | ABI 7: the bus, effects 1, 2, 3 and 5 to 8 ported with credit from stmlib and Plaits; seven render pairs; the effects on `web/listen.html`, `make hear` | 2026-11-23 |
| 21, the sliders are the hand's (Opus; D75) | ABI 8: `KEEP`, a step keeps what it was written with, the view's second mark, snapshot version 4; the caps the hand's on the page and in Rack; `snapshots-v3.txt`; fixture format 4; the plugin ships the stmlib and Plaits notice (D77 item 5) | 2026-11-23 |
| 18, Rack's jacks (Fable; D68, D76, D78, D80) | ABI 9: sound in (`PI_AUDIO_LOOP`, `ROUTE`), so a returned sound goes through the effects; FX GATES, FX SEND, FX RETURN, A and B out and in; the fx latch that stays; the panel in two rows of thirteen jacks; self-tests through the module's own cables; `make bench`'s loop cases | 2026-11-23 |
| 19, the page's effects (Opus; D69, D78, D81) | fx and a key on the page by touch, mouse and keys; the display's effect block and lane ticks on the page and in Rack (D81's stand-in); the sheet's "through fx"; D78's latch on the page; `make play`'s three new phases, format 3 and 4 fixtures played on the page; the lit Rack screenshots again | 2026-11-23 |

## Still the owner's hands

Unticked in the finished lists. None blocks a build session.

- [ ] In Rack, by hand: the sliders by mouse. The owner heard no change dragging A or B and
      tapping key 1 (2026-11-23). The engine does change the kick (tested the same day:
      44, 67 and 90 zero crossings in half a second for A low, middle and high; 131 ms
      against over 500 for B). ⚠ Not found yet: the likeliest cause is that key 1 was not
      the chosen sound (hold sound and see which key has the bar); if it was, the drag
      path has a bug the self-test cannot see, because it sets the sliders directly.
      (Later the same day: D75 makes the sliders the hand's for every sound, so the trap
      of tuning a sound that is not the one being tapped goes away with Session 21.)
      (Session 21 built it: try it again by mouse; a slider now moves every sound.)
- [ ] Session 21's second mark on each slider, on the phone and in Rack: a stand-in (a thin
      thread-coloured line), to be drawn with the owner's eye (`design/DESIGN.md`, "Not
      done"); and Session 21's readings (its Handover).
- [ ] Session 18 in Rack, by hand (its Handover has the steps): the two rows at 100% zoom
      and with cables in (`design/rack-face-*.png` first); the owner's patch, a punch heard
      on the returned drums; the fx latch by mouse (D78); FX SEND through a Rack delay to FX
      RETURN with effect 4 held; A OUT and A IN. And D80's eighteen items and three open
      points (O18).
- [ ] Session 19's look, on the phone and in Rack (`design/DESIGN.md`, "The effects on the
      display" and "Not done"): the madder `fx` block and the lane's ticks, D81's stand-in;
      whether madder or the fx key's ecru (Session 19's Handover); the sheet's "through fx"
      switch; D78 on the page by mouse (Ctrl+click fx, then click and hold keys while it plays).
- [ ] Session 22's recording: ten minutes with the PO-12 and the Scarlett, when it suits.
- [ ] The four effects checks left on the PO-12 (`WORKFLOW.md`, "The effects: what to check
      on the PO-12"; nine were done on 2026-11-23): what 9 to 12 do (9 gave no repeat the
      owner could hear), whether every sound repeats, the sweeps, and effects 4 and 13 to
      16. ~~And D71's open point~~ (answered): with write off, do keys flash for their own
      sound as it fires?
- [ ] By ear, the seven sound effects (Session 17) on `web/listen.html` (`make hear`):
      every number in `core/src/bus.rs`'s "TUNING THE EFFECTS" is a first value. And
      Session 17's two questions (its Handover).
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
      CPU meter. (Played by the owner 2026-11-23: the face, clock and reset, RETURN with
      Rack drums, clear. Session 13's nine readings accepted, D65.)

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

## Found in Rack after Session 13 (2026-11-23), for a session to take

- [ ] D64: the menu's "one edge a beat" for CLOCK, and (D65 item 2, decided) the tempo
      measured from the edges, with "ext", on an external clock. Both touch `ENGINE.md` §4
      and §14, so plan them first; Session 14 opens the view for ABI 6 anyway.
- [x] Room to trim in the module: done the same day, measured with perf (`LEARNINGS.md`,
      Session 13, "Profiled with perf"). The module's time fell 31%: the big one was an
      atomic store, a full memory barrier, every frame. The engine is now about half of it.
- [x] CI's Linux job is slow in `apt-get update` (12.5 of 13 minutes): a prebuilt image is
      Session 15's small first task (D65 item 4). Done in Session 15: the job is 28 s.
- [ ] The self-test failed once in 32 runs (96 kHz: a module on the LFO never saw its clock).
      Not reproduced in 14 more. If it fails again, its log is kept in `rack/build/`
      (`LEARNINGS.md`, Session 13). Read it before changing anything.

## Later: efficiency (measured first, PLAN's ground rules)

None blocks anything; each is done when wanted, profiled before and after (Machine state).

- [ ] **Idle cost:** the module shows about 0.6% in Rack with nothing playing (owner,
      2026-11-23), where SEQ-3 shows 0.2% and many modules 0.0%. (Session 16's `make bench`:
      a stopped engine is 26 ns a frame, as much as the minimum beat playing.) ⚠ Not profiled yet; the
      likely cause is that the engine runs every frame while stopped (the clock keeps
      counting, so a tap lands on the right tick, §4). A cheap idle path (stopped, every voice
      silent, nothing patched moving) has to keep that rule; profile it first.
- [ ] Still a question for the owner: read the parameters every 16 or 32 frames (under 1 ms
      late) rather than on the frame the brief asks for, as VCV's own modules do. Measured
      cost of reading them every frame now: a small part of `Rhythm::process`, no longer the
      biggest.
- [ ] Next for efficiency, when wanted: the core itself (`pi_process` is about half the
      module now). That one speeds up the phone too. Profile first (Machine state).

## Session 14 — the weave (build, with the owner's eye; a first attempt after Session 20, D79)

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

## Sessions 16 to 19 — the effects, built (designed in Session 15: D66 to D69)

`ENGINE.md` §17 to §19 are the brief, with D66 to D69 and `REFERENCES.md` R48 to R62 behind
them. The rules for Sessions 10 to 14 above hold for these four: decide nothing on Opus;
expected output before the core runs it; what exists does not move; a planted fault counts
only if it built and a named test failed. And the ground rule: each says what it costs a
frame, measured before and after. Each takes the next `PI_ABI_VERSION`, whatever the weave
has done by then. In order; the weave (Session 14) and the lights (Session 20) fit anywhere
the owner says.

**Ruled 2026-11-23 (D72):** D66 to D69 accepted; the jacks on the panel; D71 yes; D70
after the effects.

## Session 22 — the hardware's effects, measured from a recording (with the owner, Fable)

No open-source project got close to the PO-12's effects and nobody has measured them (R55,
R57); ours are first guesses from the names, and mild beside the hardware ("Some of theirs
is rather intense", the owner, 2026-11-23). This session gives the tuning a target. When
the owner has ten minutes with the PO-12 and the Scarlett; best before the effects are
tuned by ear and before the delay is designed. It needs no build to have happened.

- [ ] Recording on this laptop, worked out with the owner: the PO-12's output into the
      Scarlett, captured with PipeWire (`pw-record`, 48 kHz, 24-bit). Check the level
      first; the PulseAudio and ALSA note in Machine state applies if Rack is open.
- [ ] The take: at 80 bpm, one bar of kick, snare and hat; two bars dry, then each effect
      1 to 16 held for two bars, in key order, with a bar dry between. Then the same with
      only a kick on step 1, for the repeats. One long file.
- [ ] **The file stays out of the repo** (README rule 6), in a folder of the owner's. We
      take numbers and character from it, never audio. Measuring a device's sound is not
      reading its firmware.
- [ ] Read off it, with a script kept in `harness/` and its plots outside the repo: the
      hold rate of 1; the levels of 3; the curve and drive of 2; cutoff, resonance, speed
      and direction of 5 to 8; and what 9 to 12 are (retriggered hits or looped sound, how
      many a beat, which step). A sentence each for 4 and 13 to 16.
- [ ] `REFERENCES.md`: the measurements, as measured facts with the date. `WORKFLOW.md`:
      the effects' rows ticked or corrected. `ENGINE.md` §17 and §18: what changes, as
      proposals for the owner; the constants in a build session after.
- [ ] **The repeats, in particular.** The owner: "I find the repeating one the weirdest
      (especially when there aren't many sounds going, since it just feels like it mutes
      things)". In ours that is designed behaviour and may be wrong: a repeat re-fires
      the step its run began on, and if no switched-in sound has a note on that step,
      those sounds are silent for the run (§17). On the hardware the owner heard no repeat
      on 9 at all. Decide from the recording what a repeat should hold when the step is
      empty (the last step that had a hit is the obvious candidate).

## Session 20 — the grid's lights, as the hardware has them (D71; decided, D72)

Small, and before the weave if the owner says yes: the weave's rules read the same view.

- [x] D71's open point, answered by the owner's PO-12: every sound's key flashes as it
      fires and the playhead's as it passes. So the field becomes the chosen sound's steps
      in both modes, and the white and the frame stay (D72 item 3).
- [ ] `ENGINE.md` §14's table changed first; the three key fixtures' views worked again by
      hand from it and their change explained in `fixtures/README.md` (a trace is not
      edited to pass a build; a view changed by a decision is).
- [ ] The core, the page and the module follow; `make play` and the self-test.

## After Session 14

In the order they are likely wanted; none is planned in detail yet.

- **P8,** the owner's: the list of differences against the PO-12, and which keys become
  samples. It starts after Session 12.
- **The showpiece's last mile (D19):** a link that carries a beat (the snapshot in the URL),
  `web/` opening on the instrument, an offline shell. Then P9 and the approach to Teenage
  Engineering.
- **Live record,** the first "later" row: fixture format 3 for a press inside a step.
- **The sliders, the rest (D75 item 3; was under Session 21's list):** holding a step and
  moving a slider; holding write to record a slider's movement; live record of notes.
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

### After Session 18: Rack's jacks, sound in, the panel in two rows (2026-11-23)

- **Built, ABI 9 (`ENGINE.md` §19, now marked built; D68, D76, D78; the builder's rulings
  are D80):** in the core, two layouts that are read as well as written (`PI_AUDIO_LOOP`,
  18 channels: the sixteen sounds, the mix, the bus; `PI_AUDIO_LOOP_SLIDERS`, 50: those and
  A and B for each sound) and command 25 `ROUTE` (which sounds come back, which effects are
  heard from outside, which sounds take A and B from an input). A returned sound takes its
  own voice's place in the bus or the rest, so a punch reaches it. In the module: FX GATES,
  FX SEND, FX RETURN, A OUT, A IN, B OUT, B IN (new ports after the old ones in each enum, so
  an old patch keeps its cables); the menu's ticks for FX RETURN (default: effects 4 and 13
  to 16), A IN, B IN, and Sounds, "Through fx"; D78's latch; the module no longer rebuilds
  the mix, and `rack/src/jacks.hpp` is volts in and out. The panel: `design/make_panel.py`
  draws two rows of thirteen jacks, each output on its own plate, and `--check` holds every
  label, plate and stitch clear of its neighbour's.
- **Proven:** kept first: the report, the hashes of the 372 render files, `make bench` and
  a perf profile. At the end the report and all 372 files are the same bytes; unpatched,
  the loop's channel 16 is layout 17's mix bit for bit (core test and `rack/test/jacks.cpp`,
  volumes 16 and 11). 204 Rust tests (23 of them §19's in `core/src/tests/route.rs`: the
  four cases `rack/test/jacks.cpp` held, as core tests; a test a rule; and §18's model given
  what came back, bit for bit on every frame at three rates and on edges). 36 new render
  files (`harness/render-loop.json`, 18 and 50 channels), native and `.wasm` the same
  bytes. `rack/test/jacks.cpp`: the owner's patch as volts (every sound returned from its
  own VOICES, effect 2 punched: the core's own punched render within 1e-5, largest 1.8e-7,
  and heard). Planted, the unplanted copy passing first: 30 faults in the core, 30 caught by
  named tests; 18 in the module and its jacks, 17 caught at once and one (FX SEND carrying
  the mix) after a check was added. `make test` (300 runs a harness; P6's race and its six
  plants), `make play`, `make p4`, `make listen`, the repo's `make verify`. Rack's `make
  selftest` at 44.1, 48 and 96 kHz: 12 Rhythm modules on the six fixtures of formats 2, 3
  and 4, both clocks, FX GATES held to each view's `fx`; three modules through their own
  cables, every frame held to a second engine given what those cables should carry
  (VOICES to RETURN with effect 2 punched, which is the owner's patch with the module's
  voices as the drums; FX SEND to FX RETURN with effect 4; A OUT and B OUT to A IN and B
  IN); and D78's latch, eight checks a pass. The face seen in Rack's screenshot mode at 100%
  and 200%, unlit and lit: `design/rack-face-*.png`. CI run 45200249016 (19d3af0, the last
  push that changed code) green on all four platforms.
- **Measured (`LEARNINGS.md`):** ns a frame, back to back with the old build, ten pairs,
  lowest and middle: idle 25.2 and 26.1 → 24.9 and 25.6; the minimum beat 27.7 and 28.6 →
  27.3 and 28.3; all sixteen 42.4 and 42.7 → 41.3 and 41.8; repeat 31.2 and 32.3 → 30.2 and
  30.8. New: every sound returned, about 9 ns a frame over the unpatched 28; the slider
  jacks about 4. perf, four modules playing unpatched, samples over 20 s: `pi_process`
  3 272 and 3 320 before, 3 144 to 3 518 after; `Rhythm::process` 2 726 and 2 806 before,
  2 516 to 2 655 after. Unpatched, the new jacks cost nothing measurable. The engine is
  3 704 bytes (from 3 568), the `.wasm` 39 836 (from 36 963).
- **Rulings (D80, each the owner's to overrule; `DECISIONS.md` has all eighteen).** The
  ones that change what is heard or seen: `ROUTE` may mark any effect, a repeat too (item
  3); a slider's input is turned to a number to the nearest, not down (item 7: through
  Rack's volts 5 116 values of 65 536 came back one less); FX RETURN's default ticks are 4
  and 13 to 16 (item 9); on one frame a function key goes down before a grid key (item
  13); the left three columns moved to 12.4, 25.4 and 38.4 mm, FX SEND and FX RETURN to 84
  and 96 with FX on its own line, FX GATES to 90 (items 16 and 17): the lettering did not
  fit D76's arithmetic.
- **Questions for the owner:**
  1. The panel, at 100% zoom and with cables in: do the two rows and their groups work?
     `design/DESIGN.md`, "Not done", lists what to look at.
  2. A OUT through a module to A IN is one hit late (`ENGINE.md` §19, "Found"). Is that
     the instrument wanted?
  3. Should a marked repeat cross the bus to FX RETURN (D80 item 3), and are 4 and 13 to
     16 the right default ticks (item 9)?
  4. D80's other items: accept as built?
- **Not done:** nothing on the list is left. Limits: the face was seen only in screenshot
  mode, never with a cable in or a mouse on it; the menus and D78 by a real Ctrl+click were
  not tried by hand (the self-test calls the functions the mouse calls); in Rack the display
  shows nothing of the effects yet (Session 19 decides the mark for the page first). The
  loop's mix costs 9 ns with all sixteen returned and has not been tuned. No ear has heard
  any of it.
- **For the owner to try now** (`make install` in `rack/`, then Rack; PulseAudio in the
  Audio module): your patch: Clocked to CLOCK and RESET, TRIGGERS to Split to the drums,
  Merge to RETURN, AUDIO to a mixer. While it plays, hold fx and press 2 (or Ctrl+click fx,
  then click and hold 2): the distortion is on the returned drums. Then FX SEND to a delay,
  the delay to FX RETURN, and hold fx and 4. Right-click: FX RETURN, A IN, B IN, and
  Sounds, Through fx.
- **Next:** Session 19 (Opus), the page; or the owner's eye on the panel first.

### After Session 19: the page's effects; the display says the effect and the lane (2026-11-23)

- **Built (D69, D78, D81; no change to the core):** on `web/rhythm.html`, fx and a key
  punch by touch, by mouse and by the computer keys (`i` and the grid's letters), as the
  core already allowed; the display's effect block (madder, `fx 3`, just above the write
  mark's place, from byte 55) and a madder tick over the step mark of each step in the lane
  (bytes 56 and 57); the sounds sheet's third switch a row, "through fx" (`FXSOUND`, drawn
  from bytes 58 and 59); D78's latch: Ctrl+click fx stays until Ctrl+clicked again, fx goes
  down before a grid key and up after the last, and the other four keys' latches still go
  after one key. The Rack display draws the same block and ticks from the same bytes
  (`RhythmDisplay::draw`). `design/DESIGN.md` has the look, "The effects on the display",
  marked ⚠, and its "Not done".
- **Proven:** before the first change, `make test` (204 Rust tests, 300 runs a harness),
  its report and the sha256 of all 408 render files kept; at the end the report and all 408
  files the same bytes, and `web/pi_core.wasm` unchanged (not rebuilt, not recommitted).
  `make play` in Chromium and Firefox: eight phases (three new), about 730 drawings checked
  in each, every one also held to bytes 55 to 59 (the block's text, the ticks read with
  their colour, the switches); `fx-repeat-punch` (format 3) played on the page, the first
  pass by touch, the second by the computer key: its four views as text and its 43-line
  trace are the fixture's; `keeps-what-it-was-written-with` (format 4) by touch: its five
  views; fx + key 11 by the computer keys; D78 by mouse, eight checks, each held to the
  commands the page sent (`rhythm.onPost`). Planted on the page, the unplanted copy passing
  first: 15 faults, 15 caught by named checks (`LEARNINGS.md`). `make p4` (24 of 24 traces,
  both browsers), `make listen` (both), `make test`, the repo's `make verify`. Rack: `make
  install` and `make selftest` at 44.1, 48 and 96 kHz (12 Rhythm modules on the six
  fixtures, both clocks; three through their own cables; D78's latch), all clean. The Rack
  drawing seen in screenshot mode from a scratch build that fills the face by hand:
  `design/rack-face-lit-100.png` and `-200.png` now show `fx 3` heard and the lane on steps
  6, 7, 8 and 13. CI run 45205345348 (b22d4bf) green on all four platforms.
- **Measured:** nothing on an audio path changed (the page's main thread and Rack's drawing
  thread only), so there is no frame cost to give.
- **Opus decided nothing. Readings built on, each ⚠ in `design/DESIGN.md`:**
  1. "Beside the write mark in the display's column": the block sits just above the write
     mark's place and keeps it whether write is on or not; Rack 11 by 3.6 mm, 0.8 mm above;
     the page the write mark's width, directly above.
  2. The ticks sit on one line clear of the tallest mark (Rack 0.67 mm tall, 0.6 mm above;
     the page 4 px, 4 px above), the mark's width, not on each mark's own top.
  3. The switch always reads `through fx`, lit (ecru) while the sound goes through, and a
     tap plays nothing (D60 item 4's "plays the result" is the sample switch's).
  4. With fx latched, any holder of a grid key (finger, mouse, computer key) brings fx down,
     as Rack's module does (D80's build).
- **Questions for the owner:**
  1. **Madder or ecru?** D81 says madder, "the fx key's own colour", but the fx key's band
     and latched face are ecru here; madder is the sound key's. Built madder, as D81 names
     it twice. Which did you mean?
  2. The look of the block and the ticks (a stand-in, D81): keep, or draw it with your eye?
  3. The four readings above: accept as built?
- **Not done, and limits:** nothing on the list is left. The Rack display has no checker:
  its two drawings were only seen in screenshot mode, so no fault could be planted in them.
  The page was seen in a headless screenshot, never on a phone. Nothing was heard.
- **For the owner to try now:** on `web/rhythm.html` (a phone, or a desktop with `i` for fx):
  play, hold fx and tap 2: `fx 2` shows above `write`, the steps that pass get a red tick,
  and the next bar replays them. With a mouse, Ctrl+click fx, then click and hold 3 as it
  plays; Ctrl+click fx again to end. In the sheet, tap a sound's `through fx` to keep it
  clean. In Rack (`make install`), the same block and ticks on the display.
- **Next:** Session 20 (the grid's lights), then a first weave (Session 14, D79); or the
  owner's eye on the block, the ticks and the madder question first.
