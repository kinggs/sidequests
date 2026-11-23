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
  hand shows the lit states.
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

## Still the owner's hands

Unticked in the finished lists. None blocks a build session.

- [ ] The four effects checks left on the PO-12 (`WORKFLOW.md`, "The effects: what to check
      on the PO-12"; nine were done on 2026-11-23): what 9 to 12 do (9 gave no repeat the
      owner could hear), whether every sound repeats, the sweeps, and effects 4 and 13 to
      16. ~~And D71's open point~~ (answered): with write off, do keys flash for their own
      sound as it fires?
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
      2026-11-23), where SEQ-3 shows 0.2% and many modules 0.0%. ⚠ Not measured yet; the
      likely cause is that the engine runs every frame while stopped (the clock keeps
      counting, so a tap lands on the right tick, §4). A cheap idle path (stopped, every voice
      silent, nothing patched moving) has to keep that rule; profile it first.
- [ ] Still a question for the owner: read the parameters every 16 or 32 frames (under 1 ms
      late) rather than on the frame the brief asks for, as VCV's own modules do. Measured
      cost of reading them every frame now: a small part of `Rhythm::process`, no longer the
      biggest.
- [ ] Next for efficiency, when wanted: the core itself (`pi_process` is about half the
      module now). That one speeds up the phone too. Profile first (Machine state).

## Session 14 — the weave (build, with the owner's eye; when the owner says, D65)

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

### Session 16 — the lane and the repeats, in the core (build, Opus)

`ENGINE.md` §17; D66; D67 item 1. No sound path changes: this session is the sequencer.

- [ ] Before any change: `target/report-rust.txt` and a `sha256sum` of `target/render-*.f32`
      kept; `fixtures/snapshots-v2.txt` written by today's core (each fixture's version 2
      snapshot, as `snapshots-v1.txt` was in Session 11) and committed.
- [ ] `make bench`, new: nanoseconds a frame of `pi_process` for an idle engine, the minimum
      beat and all sixteen sounds, a release build, the best of five. Run it before the
      change; the number goes in `LEARNINGS.md`.
- [ ] A second fixture by hand, before code, into `fixtures/designed/`: effect 10 (128
      ticks) over four steps with swing on and one step at a probability under 100, so the
      run's own grid, the unswung repeats and the draw order are each in a trace.
- [ ] Commands 23 `FX` and 24 `FXSOUND`; the lane and `fx_sounds` in the pattern; clear
      empties the lane.
- [ ] The keys: fx + key punches; the last key held wins and the one before comes back;
      fx let go ends them all; stopped, nothing (§17).
- [ ] The sequencer: the lane written by arriving steps; `eff`; the four repeats.
- [ ] The view's bytes 55 to 59 (the grid's table does not change). `harness/race.cpp`'s `look()` and
      `the_view_follows_edits…` in `core/src/tests/keys.rs` hold bytes 48 to 63 to zero:
      now 48 to 54 and 60 to 63.
- [ ] Snapshot version 3; versions 1 and 2 still load (the two files of old snapshots).
- [ ] Fixture format 3 in the three harnesses; both designed fixtures moved up unchanged
      and run. A disagreement is settled in `ENGINE.md`, not in the trace.
- [ ] A rule test for each row and bullet of §17; the 20 000-press generation test with fx
      in it. Planted faults.
- [ ] `core/include/pi_engine.h`; the page's worklet and the Rack module still build and
      pass their checks. Nothing is drawn yet, but fx + 9 to 12 already repeats on both,
      because the keys reach the core: say so in the Handover so the owner can try it.
- [ ] `make bench` again: an empty lane costs nothing measurable, or the Handover says what.

### Session 17 — the bus and seven sound effects (build, Opus, then the owner's ear)

`ENGINE.md` §18; D67 items 2 and 3.

- [ ] Before: the report, the render hashes, `make bench`.
- [ ] The bus and the rest; idle is today's path, the same bytes (all 276 render files).
- [ ] The ramp; effects 1, 2, 3; the filter and effects 5 to 8, the sweeps in ticks.
      The stmlib and Plaits notices in the file's header; a credits line on the page and in
      the plugin's manifest (D67 item 3).
- [ ] Render pairs, native and `.wasm` the same bytes: each effect punched over the minimum
      beat, at three rates. A sound switched out of the effects is the same in the mix with
      and without one.
- [ ] `web/listen.html` gains the seven, each over the beat, so the owner can hear them
      beside the dry beat. Every constant in §18's table is a first value: the owner's ear
      moves them, as it did the voices.
- [ ] `make bench`: idle, and each effect on. Planted faults.

### Session 18 — Rack: the loop, the gates, the panel (build, Fable)

On Fable because a contract first meets code (the returns move into the core) and the
panel is drawn by eye. `ENGINE.md` §19; D68.

- [ ] `PI_AUDIO_LOOP` and `ROUTE` in the core; `rack/test/jacks.cpp`'s cases become core
      tests; `jacks.hpp` shrinks to volts in and out. Unpatched, AUDIO is still the mix
      bit for bit.
- [ ] FX GATES, FX SEND, FX RETURN; the menu's tick an effect, with its default (D68 item
      2); the Sounds menu's "through fx" tick a sound.
- [ ] The panel redrawn by `design/make_panel.py` with nine jacks and the wordmark moved;
      seen in Rack's screenshot mode (Machine state) and by the owner. If nine do not sit
      well, stop and ask: the fallback is D68 item 5's expander.
- [ ] The self-test plays the format 3 fixtures and holds FX GATES to each view's `fx`.
      One module plays through its own FX SEND and FX RETURN.
- [ ] perf, before and after, as Session 13's profile (Machine state).
- [ ] `RACK-RULES.md` and `design/DESIGN.md`'s jack table brought up to date.

### Session 19 — the page (build, Opus)

D69.

- [ ] fx + key by touch and by keys; the display's mark while an effect is heard, and the
      lane on its step marks (`design/DESIGN.md` says how: decide it with the owner
      first). No key lights for an effect.
- [ ] The sounds sheet's "through fx" switch.
- [ ] `make play` holds every drawing to its view, format 3 included; planted faults.

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
- **CI and `make verify`:** the repo's `make verify` passed before the push (the smoke test
  and the Rack It proofs skip: no Playwright). CI run 45153314152: all four platforms built
  and passed `check-dist.sh`, which now also wants the panel, the font and its licence. So
  `glfwGetKey` links on Windows and macOS too. ⚠ The first Linux attempt hung for 11
  minutes before compiling anything: Ubuntu 16.04's archive was slow, and `ci-linux.sh`
  hides apt's output and the job has no `timeout-minutes`, so a stall is silent for up to six
  hours. Cancelled and re-run; the re-run passed in 14 minutes (usually 1.5). Recommended: a
  timeout on the job and apt's progress shown. Not done; it is the owner's call.
- **For Session 14:** the Rack display's weave area is `RhythmDisplay::draw`; the view
  reaches it through `Face` every frame, so painting cells is a loop there. `harness/race.cpp`
  and `keys.rs` still hold bytes 48 to 63 to zero (Session 14's list). The screenshot route
  (Machine state) is how to see the weave in Rack without a person.
- **Later the same day, with the owner in Rack.** The owner played the module and is happy
  with the Rack side. Two findings: a Clocked ×1 clock runs the beat at a quarter of the
  speed, and the tempo readout keeps the stored tempo on an external clock. Both inputs
  were tested and work (a scratch build, headless: 95 edges gave 95 steps; 8 resets gave
  8 returns to step 1). The owner ruled D64: one edge a step stays, as SEQ-3's, and the menu
  will offer one edge a beat. The readout from the edges is proposed in D64 item 3. Then
  perf: the module's time fell 31% (above, and `LEARNINGS.md`), and efficiency, measured,
  is a ground rule. CI's Linux job now has a 30-minute limit and says which setup step it
  is in. Questions still open: the nine readings above, the parameter reading rate, and how
  the fx key should reach Rack modules: now Session 15, a design loop on Fable 5.2 with the
  owner's whole brief in it (O15). Session 14 or Session 15 first is the owner's call.
- **Then the owner's rulings, D65:** effects first (Session 15); D64's measured tempo with
  "ext" decided; the nine readings accepted; CI's Linux image as Session 15's first small
  task. The idle CPU (0.6% stopped) is in "Later: efficiency".
- **Next: Session 15, on Fable 5.2:** the effects design loop, research first, with CI's
  image as its small first task. Then Session 14 (the weave), which should also plan D64.

### After Session 15: the effects, researched and designed (2026-11-23)

- **CI's Linux image is in, measured.** `rack/ci-linux.Dockerfile` (Ubuntu 16.04 by digest)
  and `rack/ci-linux-setup.sh`; the workflow pulls
  `ghcr.io/kinggs/sidequests/pi-rack-linux:<hash of the three files it is made from>`, or
  builds and pushes it once if that tag is not there. The Linux job: 78 s on a good day and
  14 min 35 s that morning before; 12 min 18 s the one run that built the image (727 s of
  it apt); **28 s after** (pull 11 s, build 11 s; run 45170623935). `ci-linux.sh` now
  refuses any gcc but 5.4 and any glibc but 2.23, and still works in a bare `ubuntu:16.04`.
  `check-dist.sh` passed on all four as before.
- **Researched, with sources, in `REFERENCES.md` R48 to R62:** the PO-12's effects (the
  maker's two sentences; reviews; the sibling guides; two videos read from their captions);
  open-source effects engines and what may be ported; Rack's conventions for sends,
  returns and gates; MixMaster.
- **What the research changed in the brief:** the PO-12's effects are on the whole mix,
  not a channel (R50), and they are always recorded, a step at a time, with write off
  (R49, R53). No open-source clone implements them (R55).
- **Designed, as proposals for the owner (O16):** D66, a lane a pattern, written by the
  steps that arrive, and a switch a sound for "per channel"; D67, four repeats in the
  sequencer (they go out on TRIGGERS) and seven sound effects on one bus, the filter and
  two more ported from stmlib and Plaits (MIT) with credit; D68, Rack: FX GATES out and FX
  SEND and FX RETURN round the bus, with the returns moved into the core so a returned
  sound takes the effects too; D69, the page. `ENGINE.md` §17 to §19.
- **A fixture worked by hand before any code:** `fixtures/designed/fx-repeat-punch.json`,
  format 3 (`fixtures/README.md`). No harness reads `designed/`. `make verify` passes with
  it there.
- **From the owner's PO-12, the same day (D71):** the chosen sound's steps are lit whether
  write is on or off. Ours lights none with write off (D37). A fact; the change is
  proposed, as Session 20.
- **MixMaster (D70, parked):** one cable cannot reach sixteen tracks. Today VCV Split and
  sixteen cables; one gesture needs a breakout expander with sixteen jacks.
- **Not done, and why:** nothing was built in the core (a design session). The delay and
  feedback (4, 14) and effects 13, 15 and 16 are not designed: the first two need a ruling
  on stored sound, the rest need the hardware (`WORKFLOW.md`, "The effects: what to check
  on the PO-12"). The panel with nine jacks is a claim from arithmetic (D68 item 5 ⚠), not
  drawn.
- **Checked on the owner's PO-12 the same day,** six of the thirteen rows in
  `WORKFLOW.md`: recorded with write off, heard at once, cleared by the steps that pass,
  the last of two keys wins and the first comes back, stopped does nothing, no key lights
  and the display marks it. The last three corrected the design before anything was built
  (`ENGINE.md` §17 says where; `LEARNINGS.md`). Then three more held: the pressed step is
  not recorded, clear wipes the lane, an effect outlives its note. **Not confirmed: the
  repeats.** Effect 9 gave no repeat the owner could hear, so Session 16's four repeats
  are ours, under the hardware's names, until that is known.
- **For the owner:** the four checks left in `WORKFLOW.md`.
- **For Session 16 (Opus), what will bite:**
  - The fixture's keys land a frame after a boundary, so a punch never writes its own
    step: read `fixtures/README.md`'s notes on it before the code.
  - `seq.tick` needs to know whether fx is held and what is punched: pass them in, do not
    reach into the keys from the sequencer.
  - The punched keys are kept in the order they went down (the last still held wins, and
    the one before comes back): sixteen keys at most, so a small fixed array.
  - A repeat fires on ticks that are not a step's tick 0. On an external clock those ticks
    come in a burst when an edge is early (§4): the trace is the same, the frames are not.
  - There is no bench yet; the list starts by making one.
- **Ruled the same day: D72.** All accepted; the jacks on the panel; D71 yes; D70 later.
- **Next: Session 16,** on Opus.
