# Pocket Instruments — working doc for the sessions

The handover between sessions. Each session does its list, ticks its boxes, fills in results in
`PROOFS.md`, writes what surprised it in `LEARNINGS.md`, and leaves a Handover note at the
bottom of this file.

**Start every session with:** "Read `pocket-instruments/PLAN.md` and do Session N."
Design sessions run on Fable; build sessions on Opus, on the laptop (Arch, Omarchy). A build
session whose heading says Fable is one where a contract first meets code (2, 3, 10, 18) or is
drawn by eye (14, 18): there the session may rule on a gap, and writes each ruling into
`DECISIONS.md` as the owner's to overrule; on Opus it stops and asks.

## Read first, every session

In this order, and no more than this before starting. Why so exact: the folder's documents
are about 650 KB, and a session that reads them all has spent its attention before it builds.

1. This file, whole. It is kept short for that (below).
2. `README.md` in this folder: the doc map and the rules.
3. `ENGINE.md`: the sections your session's list names, and §3 and §8 if you have not built
   on the engine before.
4. `DECISIONS.md`: the decisions your list and those sections cite, and the **Open** table
   at its end. From D66 onwards for anything about effects, sliders or Rack's jacks. Not
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

(Tidied on 2026-11-24: the sections that had gone stale were moved to `PLAN-HISTORY.md`
whole, under "PLAN.md's sections as they stood before the tidy of 2026-11-24".)

## Ground rules

- No Teenage Engineering material in the repo: no samples, firmware, photos, traced art,
  logos, recordings of the hardware.
- No framework before a second instrument (README rule 5).
- Stable Rust only. A nightly feature would block every reproducible build (R13).
- No secrets. Commit direct to `main`, small commits, `make verify` before a push.
- **Efficient, measured (the owner, 2026-11-23: "I really want the module (and everything we
  do) to be pretty efficient").** A change on the audio path says what it costs a frame,
  before and after, measured, not guessed: `make bench` for the engine (nanoseconds a
  frame), perf for Rack's `process` (Machine state).

### Rules for every build session

They were written for Sessions 10 to 14 and held through 16 to 21 unchanged.

- **Decide nothing** on Opus. `ENGINE.md` and the decisions the list cites are the brief.
  Where they are silent or wrong, stop on that point, write the question into the
  Handover, and build round it, marking the reading ⚠.
- **Expected output before the core runs it.** A fixture's trace and views are worked out
  by hand from `ENGINE.md`, committed (in `fixtures/designed/` if no core can run them
  yet), and only then run. If the core disagrees, `ENGINE.md` decides which is wrong.
- **No trace and no pass bar is edited to pass a build.** A view changed by an owner's
  decision is worked again by hand before the code, and `fixtures/README.md` says which
  lines and why (Sessions 20 and 21 did this).
- **What exists does not move** unless the session says so. Keep `target/report-rust.txt`
  and a `sha256sum` of `target/render-*.f32` from before the first change and compare at
  the end; save the old snapshots (`fixtures/snapshots-v*.txt`) before a new version.
- **The same bits on every host:** the sound path uses only `+ − × ÷` and casts; the core
  stays `no_std`, with no allocator and no dependencies.
- **A planted fault counts only if it built and a named test failed.** Run the unplanted
  copy first.
- Each session ends by marking its sections of `ENGINE.md` built, with what turned out
  different, and by writing `LEARNINGS.md` and the Handover.

### How the pieces join

```
finger ─► host ─ KEY_DOWN / KEY_UP / PARAM ─► core: keys ─► edits, FIRE ─► sequencer ─► voices ─► bus, effects ─► mix
                                                │                              ▲
lights, caps, display, weave ◄─ host draws ◄─ view                Rack: returns, FX RETURN, A and B in
```

- **A host sends what a finger did and draws what it is told.** The core holds the
  workflow and says what to light in one 64-byte view; the page and the Rack module read
  the same block, so they cannot differ. The weave is a pure function of that view.
- **The snapshot** (version 4) holds the beat: steps, the effects lane, what each step
  keeps of the sliders, the settings. Every older version still loads.
- **In Rack** sound also comes in: a returned sound takes its own voice's place before the
  effects (`ENGINE.md` §19).

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

## Where it stands (2026-11-24)

The instrument plays on a phone (`web/rhythm.html`) and in Rack (the Rhythm module, 24 HP,
thirteen jacks). In the core: sixteen sounds, each a code voice or a sample; the workflow
of every "in" row of `WORKFLOW.md`; effects recorded as they are punched, with four
repeats and seven sound effects; sliders that are the hand's, with steps that keep what
they were written with; a display that weaves. ABI 10, snapshot version 4, 228 Rust tests,
CI on four platforms in about a minute.

**Built on 2026-11-23 and not yet seen or heard by the owner** except the effects on a
phone: everything from Session 21 onwards. Every look in it is a stand-in until the owner
rules. The effects are first guesses from the hardware's names and are not tuned.

**Designed and not built:** FX SEND and FX RETURN as sixteen channels, a channel an
effect, the return always summed (D87, D88; Session 24).

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
| 20, the grid's lights (Opus; D71, D72, D82) | with write off the grid lights the chosen sound's steps, as the hardware does: one line of the core, twelve fixture views worked again by hand; `make play` holds every key's white; `design/rack-face-writeoff-*.png` | 2026-11-23 |
| 14, the weave: a **first attempt** (Fable; D53, D84), not finished | ABI 10: the view's bytes 48 to 54, `pi_weave` (78 by 15 cells) and its rule tests, the page and the Rack display painting the same cells, `make play` holding every painting to `pi_weave`; `fixtures/weave-views.txt`; `design/rack-weave-*.png`. The owner has not watched it: its list stays below | 2026-11-23 |
| 22, the hardware's effects measured (Fable, with the owner): **two of three takes**, not finished | `harness/hardware-take.sh` and `harness/hardware-fx.py`; R64 to R68; `WORKFLOW.md`'s four effects rows answered; proposals in `ENGINE.md` §17 and §18; D87 (the owner's ruling on D86 item 1). Take c and a timing take are left: its list stays below | 2026-11-24 |

| 23, FX SEND and FX RETURN designed (Fable, with the owner; D87, D88) | D88: three settings an effect (ours, beside the dry, in place of the dry), the send's ramp in the module, the return summed in the core before the volume; `ENGINE.md`, "§19, designed 2026-11-24"; the fork measured in a scratch copy (`LEARNINGS.md`); Session 24's list. Nothing built | 2026-11-24 |

## Next, in order

1. **Session 24,** FX SEND and FX RETURN a channel an effect, built: below. Opus.
2. **Session 22's two takes left,** when the owner has fifteen minutes with the PO-12:
   below. Start it with "Read `pocket-instruments/PLAN.md` and finish Session 22".
3. **The owner's looks and rulings** on what 2026-11-23 built, and on Session 22's
   proposals: "The owner's hands", first part.
4. **The effects tuned and the repeat's rule built,** from Session 22's proposals once
   ruled: "Not planned yet", first rows.
5. **Session 14's fourth box,** the weave accepted or redrawn: below.
6. Then from "Not planned yet", as the owner chooses.

## Session 24 — FX SEND and FX RETURN: a channel an effect, built (build, Opus; D87, D88)

The brief is `ENGINE.md`, "§19, designed 2026-11-24" (at the end of the file), and D88.
Read also §18 (the ramp) and §19 as built, D80, D87, R60, `rack/src/jacks.hpp`, and
`LEARNINGS.md` for Sessions 18 and 23 (where things sit in memory; the scratch bench).
ABI 11. The page does not change; FX GATES does not change; no breakout is built (O20).

Before the first change: `make test`, then keep `target/report-rust.txt`, a `sha256sum`
of `target/render-*.f32`, two runs of `make bench`, and a perf profile of the module with
FX SEND patched (Machine state).

- [ ] **The core's tests first** (`core/src/tests/route.rs`), failing before the core
      changes: §18's model given `back` and the two masks, which the loop's mix equals bit
      for bit through every kind of change, at three rates and on edges, stopped and
      playing; and each row of the section's "Proven when built by" that names this file.
      The tests of the crossing over are replaced by the decision, not edited to pass:
      list in the Handover which, and the rule that took each one's place.
- [ ] **The core, ABI 11:** channel 17 in read on every loop frame and added last, before
      the volume, and not at all when it is exactly 0; an outside effect's `wet` is 0;
      `ROUTE` 1's new meaning and `ROUTE` 4 (`PI_ROUTE_FX_INSERT`); the header's comments
      on channel 17 and `PI_ROUTE_FX`. `Bus::mix` (no loop) still gives the bus for an
      outside effect ramping out. `make web`, since the `.wasm` is committed.
- [ ] **What does not move:** the report and every earlier render file the same bytes,
      but `harness/render-loop.json`'s, which are rendered again (channel 17 is given in
      it and now means something else). Say so in `fixtures/README.md`.
- [ ] **The cost, held.** `make bench` twice, runs interleaved with the build from before
      (keep its library): idle, beat, all and both no slower than the spread between two
      runs of one build. The scratch copy was 1 ns slower on idle and the beat with a
      fifth mask in `Bus::route`; if the build is too, keep the fifth mask somewhere else
      until it is not, and write what worked. `harness/bench.cpp`: "loop fx" becomes
      beside the dry, and a case is added for in place of the dry. Numbers to
      `LEARNINGS.md`.
- [ ] **`rack/src/jacks.hpp`, its tests first** (`rack/test/jacks.cpp`): the sixteen send
      gains with their mask (a channel at gain 0 is exactly 0 V and is not visited);
      FX RETURN as the sum of the cable's channels; the two masks from the sixteen
      settings, and 0 for both with neither jack patched. `FX_OUTSIDE_DEFAULT`, `fxMask`
      and the one-channel `send` go. A new engine (`fresh`) puts every gain to 0.
- [ ] **`rack/src/Rhythm.cpp`:** FX SEND sixteen channels; FX RETURN summed; a loop layout
      while either is patched. The menu: one submenu, "FX SEND and FX RETURN", sixteen
      rows, each showing its setting and opening the three (two for 9 to 12: D88 item 3),
      and one greyed line, "Not fully wet? In place of the dry". Saved with the patch as
      two masks; a patch from before reads `"fx"` 0 or more as in place of the dry for
      those effects, and -1 as all Ours; Initialize is all Ours. Both jacks' tooltips say
      what they now carry, FX RETURN's with "send it fully wet" (D88 item 10).
- [ ] **The self-test** (`rack/selftest.sh`, the FX SEND to FX RETURN module), each frame
      held to a second engine given what the cable carries, and the send's sixteen
      channels held to `jacks.hpp`: effect 4 as Ours; effect 2 beside the dry; effect 2
      in place of the dry. A pass still needs the loop to have been heard.
- [ ] **The panel:** FX SEND and FX RETURN drawn as sixteen-channel jacks
      (`design/make_panel.py`, the fourth field; `--check`). If their stitches do not
      clear a neighbour, stop on that point: the positions are the owner's (D76). The lit
      screenshots again; `design/DESIGN.md`'s two rows for the jacks.
- [ ] Faults planted in the core and in `jacks.hpp`, each built, each failing a named test.
- [ ] Written: `ENGINE.md` (the section marked built, with what turned out different; the
      ABI table's row 11; the note at the top), `README.md`'s status, `LEARNINGS.md`, the
      Handover with steps for the owner's hands: the kept patch with its reverb's effect
      beside the dry; a Rack distortion in place of the dry; a delay at half wet in each
      setting (O21).

Where the brief is silent, it is PLAN's rule: stop on that point, build round it, mark it
⚠. Two places it may be: what a row for effects 4 and 13 to 16 says while Ours has no
sound (today: "no sound here yet"), and whether the settings' submenu sits where FX
RETURN's ticks were.

## Session 22 — the hardware's effects, measured from a recording (with the owner, Fable; two of three takes done 2026-11-24)

No open-source project got close to the PO-12's effects and nobody has measured them (R55,
R57); ours are first guesses from the names, and mild beside the hardware ("Some of theirs
is rather intense", the owner, 2026-11-23). This session gives the tuning a target. When
the owner has ten minutes with the PO-12 and the Scarlett; best before the effects are
tuned by ear and before the delay is designed. It needs no build to have happened.

- [x] Recording on this laptop, worked out with the owner: the PO-12's output into the
      Scarlett, captured with PipeWire (`pw-record`, 48 kHz, 24-bit). Check the level
      first; the PulseAudio and ALSA note in Machine state applies if Rack is open.
- [ ] The take: at 80 bpm, one bar of kick, snare and hat; two bars dry, then each effect
      1 to 16 held for two bars, in key order, with a bar dry between. Then the same with
      only a kick on step 1, for the repeats. One long file.
      **Part done, and changed (2026-11-24):** three short takes in place of one long
      file, each checked before the next (`LEARNINGS.md`). **a** (the pattern) and **b**
      (sound 1 on step 1) are made. Left, with Rack closed:
      - [ ] **Take c:** sound 8 on steps 1 and 9, sound 15 on steps 5 and 13 (for 15, knob
            A down and B up); three passes dry, then each effect 1 to 16 held for two
            passes with one dry between. `harness/hardware-take.sh check`, then
            `harness/hardware-take.sh c`. It firms up 1, 5, 6, 8, 15 and 16.
      - [ ] **The timing take** (R68): fx + 11 held for two passes, fx alone for two,
            three times. `harness/hardware-take.sh t11`. Then read both with
            `uv run harness/hardware-fx.py`, and correct R64 to R68 and the proposals.
- [x] **The file stays out of the repo** (README rule 6), in a folder of the owner's. We
      take numbers and character from it, never audio. Measuring a device's sound is not
      reading its firmware.
- [x] Read off it, with a script kept in `harness/` and its plots outside the repo: the
      hold rate of 1; the levels of 3; the curve and drive of 2; cutoff, resonance, speed
      and direction of 5 to 8; and what 9 to 12 are (retriggered hits or looped sound, how
      many a beat, which step). A sentence each for 4 and 13 to 16.
- [x] `REFERENCES.md`: the measurements, as measured facts with the date. `WORKFLOW.md`:
      the effects' rows ticked or corrected. `ENGINE.md` §17 and §18: what changes, as
      proposals for the owner; the constants in a build session after.
- [x] **The repeats, in particular.** The owner: "I find the repeating one the weirdest
      (especially when there aren't many sounds going, since it just feels like it mutes
      things)". In ours that is designed behaviour and may be wrong: a repeat re-fires
      the step its run began on, and if no switched-in sound has a note on that step,
      those sounds are silent for the run (§17). On the hardware the owner heard no repeat
      on 9 at all. Decide from the recording what a repeat should hold when the step is
      empty (the last step that had a hit is the obvious candidate).
      **Proposed (2026-11-24):** the last step that sounded, as the hardware's 11 and 12
      do (R66; `ENGINE.md` §17, "Proposed after Session 22"). The owner rules.

## Session 14 — the weave (build, with the owner's eye; a first attempt after Session 20, D79)

Recommended on Fable: which cells each of the seven rules lights is not designed, only its
inputs and its tests. That is drawing by judgment, with the owner watching.

The next ABI number (this line said 6, from before the effects: D83). `ENGINE.md` §16,
`design/DESIGN.md` "The animation", `design/loom/frames.html`. A first attempt while the
owner is away (D79, D83): the fourth box stays open for the owner.

**Where this stands (2026-11-23): a first attempt is built and waits for the owner.** Boxes
1, 2, 3 and 5 are done (D84 has the rulings; the Handover at the bottom says what to look
at). Box 4 is open, so the session is not finished and this list stays here. Whoever takes
it up changes the drawing in `core/src/weave.rs`, once, with the owner watching.

- [x] The view's bytes 48 to 54 (§16: a u32, a u16, a u8; this line said 48 to 55), filled
      by the sequencer; fixtures' view text is unchanged (it leaves them out). Rust tests
      for the three fields. `harness/race.cpp`'s `look()` and `the_view_follows_edits…` in
      `core/src/tests/keys.rs` both hold bytes 48 to 63 to zero: change them with it.
- [x] `pi_weave`: the seven rules as cells. Tests of the rules, not of a picture: stopped,
      the cells do not depend on the tick; the beater is 1 cell wide at no firings and 4 at
      sixteen; a beat with nothing set weaves one stitch; reduced motion never draws white
      rows. Natively and from the `.wasm`, the same bytes for a set of views.
- [x] The page paints the cells (its own instance of the `.wasm`), the Rack display paints
      the same cells. Neither holds a rule. (Rack: `RhythmDisplay::draw` in
      `rack/src/Rhythm.cpp` leaves the weave's area dark; a self-test writes its name there.)
- [ ] The owner watches it move, on the phone and in Rack. What is wrong is changed in the
      core, once. When it is accepted, three views and their cells are committed as the
      picture to hold to.
- [x] `DESIGN.md`'s "Not done" list brought up to date.

## Not planned yet

In the order they are likely wanted. Each needs a design pass (Fable) before a build list.

| What | Waits on | Where it is written |
|---|---|---|
| **The repeat's rule for an empty step.** A repeat on a step with no switched-in sound mutes those sounds; the owner hears it as a mute | the owner's ruling on the proposal (measured: R66) | `ENGINE.md` §17, "Proposed after Session 22"; D67 item 1 |
| **The effects tuned:** the constants of 1, 2, 3 and 5 to 8 | the owner's ruling on the proposals (R64, R65); take c for 1 and the sweeps; then the owner's ear | `ENGINE.md` §18, "Proposed after Session 22"; `core/src/bus.rs`, "TUNING THE EFFECTS" |
| **Effects 4 and 14** (delay, feedback): how much stored sound, and whose memory | a ruling on memory; measured: R67 | D67 item 4; R57; §18's proposals |
| **Effects 13, 15, 16** | take c for 15 and 16; 13 is measured ⚠ (R67) | D67 item 4; R48 |
| **Each effect to its own Rack module, the rest:** the breakouts, a trigger in for each sound (the sixteen channels are Sessions 23 and 24) | the owner's ruling on D86 items 3 to 5 (O20) | D86; D87; R63 |
| **The sliders, the rest:** change one held step; record a slider's movement while write is held; live record of notes (write becomes a held key) | the simple rule played first | D75 item 3; `WORKFLOW.md`, "The sliders" |
| **A OUT back to A IN is one hit late** | the owner: does it matter? | O18; `ENGINE.md` §19, "Found" |
| **The clock in Rack:** the menu's "one edge a beat"; the tempo measured from the edges, with "ext" | nothing; touches `ENGINE.md` §4 and §14, so plan first | D64; D65 item 2 |
| **The breakout for MixMaster:** sixteen voice jacks and one "Connect" | after the effects (D72) | D70; R61 |
| **More of the hardware's workflow:** sixteen patterns, chains, copy, the step multiplier | P8's list of differences | `WORKFLOW.md`'s "later" rows |
| **Ours:** a gesture for probability and a short length; the hat cut; a player's own samples; the neighbour connection | each its own question | O10; D47; D34; D40 |
| **The showpiece's last mile:** a link that carries a beat, `web/` opening on the instrument, an offline shell | the look accepted | D19 |
| **The gate, then the approach to Teenage Engineering:** the name, the registers, a lawyer's view | the showpiece | P9; O3, O6, O7; D11, D19 |
| **Its own repository:** licence file, name, contribution rules | the proofs passed (`PROOFS.md`) | README |

Watch, not work: Rack's self-test failed once in 32 runs on 2026-11-23 (96 kHz, a module on
the LFO never saw its clock) and not since; if it fails again its log is kept in
`rack/build/`. Read it before changing anything (`LEARNINGS.md`, Session 13).

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

## The owner's hands

Only the owner can do these. Merged on 2026-11-24 from the lists each session left (the
originals are in `PLAN-HISTORY.md`); nothing was dropped, each thing is here once.

**What 2026-11-23 built, to see, hear and rule on:**

- [ ] **In Rack, by hand** (restart Rack first; Session 18's Handover in `PLAN-HISTORY.md`
      has the steps): the owner's own patch, a punch (fx + key) heard on the returned
      drums; the fx latch by mouse (D78); a slider moved, then any key tapped (D75; on
      2026-11-23, before D75, the owner heard no change and the cause was never found);
      FX SEND through a Rack delay to FX RETURN with effect 4 held; A OUT to A IN.
- [ ] **The panel** at 100% zoom with cables in (D76; `design/rack-face-lit-200.png`
      first): do the two rows and their groups work?
- [ ] **On the phone:** the `fx` block and the lane's ticks (D81's stand-in; madder, or the
      fx key's ecru: D82 item 1); the sheet's "through fx"; the fx latch by mouse on a
      desktop; the second mark on each slider (a stand-in: a thin line); the grid with
      write off (no stitches: D82 item 3).
- [ ] **The weave, watched** (Session 14's fourth box; O19): the pictures
      `design/rack-weave-*.png`, then the page, then Rack. The Handover below lists what to
      look at and the seven choices least sure.
- [ ] **By ear,** the seven sound effects on `web/listen.html` (`make hear`), after
      Session 22 gives them a target.
- [ ] **Rulings made while the owner was away, to accept or overrule:** D73, D77, D79,
      D80 (O18: its eighteen items; A OUT to A IN one hit late; FX RETURN's default
      effects; a marked repeat crossing to FX RETURN), D81 to D84. And the ⚠ readings in
      the Handovers of Sessions 19, 20 and 21 (`PLAN-HISTORY.md`), each ruled as built.
- [x] **D86,** each effect to its own Rack module: the recommendation, yes or no.
      Item 1 ruled yes, the return summed (D87, 2026-11-24). Items 3 to 5 are open (O20).
- [ ] **Session 23's rulings** (D88 items 4 to 12; O21), once Session 24 has built them:
      the return before the volume; the settings counting only while FX SEND or FX RETURN
      is patched; nothing guarding the comb (try a delay at half wet in each setting).
- [ ] **Session 22's proposals** (`ENGINE.md` §17 and §18, "Proposed after Session 22"):
      a repeat holds the last step that sounded; the targets for effects 1 to 8; the delay
      as one tap. Yes, no, or by ear first.

**With the PO-12 in hand:**

- [ ] Session 22's two takes left, with the Scarlett and Rack closed: take c and the
      timing take (its list above has the pattern and the commands). About fifteen minutes.
- [ ] The four effects checks left (`WORKFLOW.md`, "The effects: what to check on the
      PO-12"; nine were done on 2026-11-23): what 9 to 12 do, whether every sound repeats,
      the sweeps, effects 4 and 13 to 16. Session 22 answers most of them.
      Answered from the takes, 2026-11-24 (R64 to R67); what stays ⚠ is in each row.
- [ ] The sliders' four checks (`WORKFLOW.md`, "The sliders").
- [ ] The rest of the hour: tick or correct each row of `WORKFLOW.md` and its eleven
      questions, as mismatches turn up (D29). Measure it (width, height, key pitch, jack
      spacing) for D16.

**Older, none blocking:**

- [ ] Reply to VCV: ask for the binary submission and identity verification details (R46).
      Recommended: ask now; it costs nothing and nothing is submitted until the gate.
- [ ] P4: iOS Safari (no iPhone yet), and the tap pad filmed for latency. `PROOFS.md` P4.
- [ ] P5: the four loads in Rack, one a platform. `PROOFS.md` P5. CI has the artefacts.
- [ ] P6's last: play `web/rhythm.html` on the phone and listen for a dropout while
      editing it as it plays (`PROOFS.md`).
- [ ] By ear: which keys become samples (D35, D50).
- [ ] In Rack, left from Session 13: the computer keys, several at once (R25); a
      double-click on each slider, with and without bpm held; MIDI-Map on a slider; the
      CPU meter.
- [ ] Readings never looked at: Session 12's four on the phone (`design/DESIGN.md`, "Not
      done"); D59, Session 10's eight rulings; Session 11's two (⚠ in `ENGINE.md` §15).

---

## Handover

The latest two notes. Every earlier one is in `PLAN-HISTORY.md`.

### After Session 22: the PO-12's effects measured from two takes; D86 item 1 ruled (2026-11-24)

- **Nothing in the core changed.** Two scripts are new: `harness/hardware-take.sh` (record
  the PO-12 through the Scarlett, to a folder outside the repo) and
  `harness/hardware-fx.py` (read a take; `uv run`, `--selftest` 103 of 103).
- **Measured, in `REFERENCES.md` R64 to R68,** from takes a and b. Firm: distortion is a
  gain of 3 into a hard clip; the high pass is 1.8 kHz with Q 6; 11 and 12 retrigger 8 and
  6 times a beat through empty steps; the delay is one echo at 175 ms. Wrong in kind in
  ours: the sweeps (both ways, on their own clock), the low sample rate (not one rate),
  and 9 and 10 (not slower repeats; rule unknown ⚠).
- **Proposed, not built:** `ENGINE.md` §17 (a repeat holds the last step that sounded) and
  §18 (a table of targets). The owner rules; then a build session.
- **Session 22 is not finished.** Left: take c and the timing take, with Rack closed. The
  owner lost focus after about forty minutes of takes, and said so; that was the time to
  stop.
- ⚠ **Time went missing in both takes, in whole buffers, beside held effects** (R68). Not
  explained. The readings do not lean on it.
- ⚠ **Take a clipped at the Scarlett on effects 2 and 16;** the distortion's ceiling and
  16's level are not measured.
- **Ruled by the owner, in Rack: D87.** FX SEND and FX RETURN become sixteen channels, a
  channel an effect, with the return always summed. The owner's hand patch (D86 item 2)
  showed the menu's ticks are a trap and the insert cuts a reverb's tail; the patch the
  owner kept sends two effects out in stereo to a mixer and returns nothing.
- **Until Session 24 is built:** with FX RETURN unpatched the core plays its own effect on
  AUDIO as well as sending. Effects 4 and 13 to 16 have none, so punch those for an
  outside reverb or delay and AUDIO stays dry.
- **Machine:** the PO-12 on input 2 was linked to the headphones with `pw-link` for the
  takes. It is not saved and goes at the next restart of PipeWire.
- **Next: Session 23,** the design of D87, on Fable. Its list is above.

### After Session 23: FX SEND and FX RETURN designed; three rulings by the owner (2026-11-24)

- **Nothing was built.** `DECISIONS.md` has D88 and O21; `ENGINE.md` has "§19, designed
  2026-11-24" at its end, and a note at its top that one thing is designed and unbuilt.
- **The owner ruled three things** (D88 items 1 to 3): each effect is Ours, Rack's beside
  the dry, or Rack's in place of the dry, all starting as Ours; today's one-channel loop
  is dropped; a repeat always repeats.
- **The session ruled nine more** (D88 items 4 to 12; O21), the owner's to overrule: the
  send's sixteen ramps in the Rack module; every send channel always live; the return
  added in the core, last, before the volume, stopped or playing; an insert as an effect
  whose sound is silence; the settings counting only while one of the two jacks is
  patched; nothing guarding the comb but the setting and a line of text; FX RETURN mono.
- **Measured before designing** (`LEARNINGS.md`, Session 23): the ramps in the core would
  cost 2 to 3 ns a frame while FX SEND is patched; in the module about 0.1 ns. Beside the
  dry is 1 to 2 ns cheaper than today's crossing over.
- ⚠ **For Session 24:** a fifth mask in the bus moved idle and the beat by about 1 ns in
  the scratch copy. Its list has a box to hold them.
- ⚠ **Not looked at:** whether sixteen-channel stitches round FX SEND and FX RETURN clear
  their neighbours on the panel. Session 24 checks and stops if not.
- **Three of the list's recommendations did not stand,** each for a reason found in the
  session; the list in `PLAN-HISTORY.md` is annotated.
- **Next: Session 24,** the build, on Opus. Its list is above.

