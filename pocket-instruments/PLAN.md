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
| 16, the lane and the repeats in the core (Opus) | ABI 6: `FX`, `FXSOUND`, the fx key, the lane, the four repeats, snapshot version 3; `make bench`; a second fixture by hand; `snapshots-v2.txt` | 2026-11-23 |
| 17, the bus and seven sound effects (Opus) | ABI 7: the bus, effects 1, 2, 3 and 5 to 8 ported with credit from stmlib and Plaits; seven render pairs; the effects on `web/listen.html`, `make hear` | 2026-11-23 |
| 21, the sliders are the hand's (Opus; D75) | ABI 8: `KEEP`, a step keeps what it was written with, the view's second mark, snapshot version 4; the caps the hand's on the page and in Rack; `snapshots-v3.txt`; fixture format 4; the plugin ships the stmlib and Plaits notice (D77 item 5) | 2026-11-23 |

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

### Session 18 — Rack: the loop, the gates, the sliders' voltages, the panel (build, Fable)

On Fable because a contract first meets code (the returns move into the core) and the
panel is drawn by eye. `ENGINE.md` §19 with its addition; D68, D76. After Session 21: the
slider jacks carry what §20 makes.

- [ ] `PI_AUDIO_LOOP` and `ROUTE` in the core; `rack/test/jacks.cpp`'s cases become core
      tests; `jacks.hpp` shrinks to volts in and out. Unpatched, AUDIO is still the mix
      bit for bit.
- [ ] FX GATES, FX SEND, FX RETURN; the menu's tick an effect, with its default (D68 item
      2); the Sounds menu's "through fx" tick a sound.
- [ ] A OUT, A IN, B OUT, B IN (D76 item 4; §19's addition): out is the value before an
      input replaces it; an input is read on the hit; the menu's ticks as RETURN's.
- [ ] The panel redrawn by `design/make_panel.py` in two rows, thirteen jacks, grouped as
      D76 item 1 proposes; each output on its own patch of inverted ground. Seen in Rack's
      screenshot mode (Machine state) and by the owner before anything else is built on
      it: D76's positions are arithmetic. The existing jacks keep their port numbers, so
      old patches keep their cables.
- [ ] The self-test plays the format 3 and 4 fixtures and holds FX GATES to each view's
      `fx`. One module plays through its own FX SEND and FX RETURN; one through A OUT to
      A IN.
- [ ] perf, before and after, as Session 13's profile (Machine state): unpatched, the new
      jacks cost nothing measurable.
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

### After Session 17: the bus and seven sound effects, in the core (2026-11-23)

- **Built, ABI 7 (`ENGINE.md` §18, now marked built):** `core/src/bus.rs`. The sounds in
  the effects are summed into a bus; effects 1 (a hold at 6 kHz), 2 (soft clip), 3 (crush),
  5 and 7 (a lowpass at 600 Hz, a hipass at 2 kHz) and 6 and 8 (the sweeps, by ticks) act on
  it and come in and out over a 2 ms ramp. The sixteen track channels are untouched. Idle,
  the mix is the old one. The filter, its tan, the soft clip and the hold are ported from
  Émilie Gillet's stmlib and Plaits, her MIT notice in the file's header; the credits on
  `web/rhythm.html` and in the Rhythm module's description in `rack/plugin.json`. No call,
  command, view byte or snapshot byte changed; the ABI is 7 by the rule for Sessions 16
  to 19. Every constant is in one marked block at the top of `bus.rs`, "TUNING THE EFFECTS".
- **Proven:** the report and all 276 render files the same bytes as before the session.
  Seven new render pairs (`harness/render-fx-*.json`: each effect punched over the
  minimum beat at step 1, let go at step 9, then replayed by the lane in bar 2; both
  clocks, three rates), 42 pairs native against `.wasm`, the same bytes. 161 Rust tests
  (17 of them §18's in `core/src/tests/bus.rs`, among them a model of §18 the mix equals bit
  for bit on every frame, at three rates and on edges; and that a sound switched out is the
  same in the mix with and without an effect). 25 faults planted in the core, the unplanted
  copy passing first: 25 caught, each by a named test (two only after a test was added for
  them, `LEARNINGS.md`); a wrong command number planted on the listening page failed `make
  listen`. `make test` (216 runs a harness, P6's race and its six plants), `make play`,
  `make p4`, `make listen`, and Rack's `make install` and `make selftest` at 44.1, 48 and
  96 kHz all passed. The core still needs no libm (`check-p1`) and the `.wasm` imports
  nothing.
- **Measured (`LEARNINGS.md`):** ns a frame, best of five, three runs each, before → after:
  idle 25.7–25.9 → 25.9–26.5 (back to back with the old build, 25.5–25.9 against
  25.6–26.4: within the bench's noise); the minimum beat 28.4–29.2 → 27.8–29.4; all sixteen
  42.0–42.6 → 42.7–44.1. Each effect on every step of the beat: 33.7 to 35.3, about 6 ns a
  frame over the dry beat. The first wiring cost idle 1.5 ns; moving the bus's working path
  out of line took it back.
- **Opus decided nothing. Four readings built on, each ⚠ in `ENGINE.md` §18, each a line or
  two to change:**
  1. What is cleared: each effect's state when it starts from idle or from another kind
     (the four filters one kind). So the hold starts at 0 and a filter after 1, 2 or 3
     starts clean. §18 names only the filter, from idle.
  2. "Damping 0.5" is stmlib's `r` (1 / Q, so Q = 2), as `voice.rs` uses the word; as a
     damping ratio it would be `r` = 1. The hipass sweep peaks about 1 dB over the dry beat.
  3. A sweep's place counts the ticks after the frame heard became the effect: a tick on
     that same frame is not counted (one tick at most).
  4. Heard again within 2 ms of ending (still ramping out) starts a sweep again, the filter
     keeping its state.
- **Questions for the owner:**
  1. The plugin's manifest has no credits field, so the credit is a sentence in the Rhythm
     module's description ⚠. Should the plugin also ship stmlib's MIT notice as a file in
     `res/`, as it ships the font's OFL? (MIT asks for the notice in copies of the
     software; the source has it, the built plugin does not.) Recommended: yes, a small
     change to `rack/Makefile` and `check-dist.sh`.
  2. The four readings above: accept as built?
- **Not done:** the bus is not heard in Rack with RETURN patched: the module then rebuilds
  AUDIO from the sixteen channels, which are before the effects (D62). Session 18 moves the
  returns into the core and fixes it. With RETURN unpatched, Rack plays the effects.
- **For the owner to try now:** `make hear` (in `pocket-instruments/`) and open the address
  it prints, or the live page `pocket-instruments/web/listen.html`: "Effects over the
  minimum beat", each of the seven beside "Dry beat"; "Dry, then wet" plays steps 1 to 8
  dry and 9 to 16 through the effect, so each bar compares them. In Rack and on
  `rhythm.html`, while playing, hold fx and press key 1, 2, 3, 5, 6, 7 or 8. The numbers to
  move are the "TUNING THE EFFECTS" block of `core/src/bus.rs`; then `make test` (a test
  that pins the old number fails and says which), `make web`, and listen.
- **Next:** Session 18 (Fable), or the owner's ear on the seven first.

### After Session 21: the sliders are the hand's; a step keeps what it was written with (2026-11-23)

- **Built, ABI 8 (`ENGINE.md` §20, now marked built; D75):** command 26 `KEEP`; `STEP` 0
  forgets what a step kept; `PARAM` sets that slider for all sixteen sounds; a write-mode
  key that turns a step on keeps the chosen sound's own A and B as they are on that frame;
  clear forgets every step's values. A step's hit and a repeated hit play what the step
  keeps, a tap or `FIRE` the sound's own (`Engine::hits`, out of line). The view's bytes 60
  to 63, the second mark. Snapshot version 4 (1464 bytes); versions 1 to 3 load with each
  step that is on keeping its sound's own (D75 item 6). Fixture format 4 in the three
  harnesses. The page and the Rack module: the cap is the hand's and moves by itself only
  with bpm held or after a load; the second mark is drawn from bytes 60 to 63. D77 item 5:
  the plugin ships `res/stmlib-plaits-MIT.txt` (from `core/stmlib-plaits-MIT.txt`) beside
  the font's OFL, and `check-dist.sh` refuses a plugin without it.
- **Proven, in the order PLAN asked:** the report, the render hashes and `make bench` kept
  first; `fixtures/snapshots-v3.txt` written by the ABI 7 core and committed (93f2583);
  `keys-tap-and-choose`'s views worked again by hand and committed before any code
  (5b09010): six lines, the views at 6, 7, 10, 12, 13 and 15, change in `a=` and `b=` only,
  because a slider now sets every sound and choosing moves no cap (`fixtures/README.md` has
  the table). No other fixture's line changed and no trace did. The designed fixture moved
  up as a pure rename (1c2cb73) and passed at its first run. At the end: every trace the
  same lines, the report different from the day's start only in those 144 view lines (six
  a run), the snapshot labels' hex and the new runs; all 360 existing render files the same
  bytes; 12 new (`render-keep`, native and `.wasm` the same bytes; the tone's step 1 and 9
  give 6 and 15 crossings in 50 ms). 181 Rust tests (19 of them §20's in
  `core/src/tests/keep.rs`). 300 runs a harness, one report. Planted: 23 faults in the core,
  the unplanted copy passing first, 23 caught by named tests (a 24th, "a value whose keep
  bit is clear is read", is not a fault: nothing can see it; `LEARNINGS.md`); two on the
  page (`make play` failed on each), one in each harness's view or command, one in Rack's
  view text (the self-test failed), one plugin without the notice (`check-dist.sh` refused
  it). `make test` (P6's race and its six plants), `make play` (five phases, both
  browsers), `make p4`, `make listen`, the repo's `make verify`; Rack's `make install` and
  `make selftest` at 44.1, 48 and 96 kHz (eight Rhythm modules, the format 4 fixture on both
  clocks). The second mark seen in Rack's screenshot mode on a face filled by hand. CI run 45189993571 (a597ff0) green on all four platforms, `check-dist.sh` holding the notice in each.
- **Measured (`LEARNINGS.md`):** ns a frame, best of five, three runs each, before → after:
  idle 26.2–27.0 → 26.2–27.4; the minimum beat 27.8–29.0 → 28.4–29.7; all sixteen
  43.4–45.1 → 41.7–42.4; repeat 31.5–32.2 → 30.5–30.8. Back to back with the old build, six
  pairs: idle 25.0–26.9 against 26.2–26.8, perhaps half a nanosecond; the rest within the
  noise. The engine is 3 568 bytes (from 2 448), the `.wasm` 36 963 (from 32 783).
- **Opus decided nothing. Readings built on, each ⚠ in `ENGINE.md` §20, each a line or two:**
  1. ABI 8: §20 names no number; the rule for Sessions 16 to 19 was followed.
  2. Two firings of one sound on one frame (a tap and its step): the later decides which
     values, read after the frame's commands, as a slider always was.
  3. `KEEP` on a step that is off keeps; `STEP` 1 later plays it so.
  4. A load leaves each sound's last hit (bytes 60 to 63) alone: the moment's, like `fires`.
  5. Hosts: with bpm let go the cap goes back to the hand; "after a load" is the first view
     that holds it, and a host's first view counts as one.
  6. Hosts: the second mark is PLAN's stand-in, a thin `loom/thread` line across the track
     over the cap, always shown (`design/DESIGN.md`, "Not done").
- **Harness changes, not readings:** every harness also plays each fixture from a "kept
  snapshot" (each step that is on keeping its sound's own, as keys save it), because P6's
  browser check looks for the page's bytes in the report and a beat entered by keys now
  keeps (`PROOFS.md` P6); the worklet's snapshot room is 1472 bytes and the Node harness's
  1536 (both were under 1464); `race.cpp` forgets every step before entering a fixture and
  its churn sends `KEEP`; Rack's self-test plays the format 4 fixture (format 3 still waits
  for Session 18). `make play` has a fifth phase, `keep`: an old beat with two sounds'
  sliders apart, the cap staying put when the other sound is chosen, and the mark stepping
  between a kept and a written value.
- **Questions for the owner:**
  1. How should the second mark look? Built as a stand-in (above); `design/DESIGN.md`
     draws it with your eye.
  2. The six readings above: accept as built?
- **Not done, and a limit:** nothing on the list is left. Rack's self-test holds each cap
  and the mark's bytes to the view, but cannot hold "the cap stays when another sound is
  chosen": under keys every sound shares the sliders, so they never differ there. `make
  play` holds it with an old beat; Rack's drawing was only seen, in screenshot mode.
- **For the owner to try now:** on `web/rhythm.html` or the Rhythm module: write on, slider
  A low, key 1; A high, key 9; write off, play: two pitches, and the thin line on A steps
  between them while the cap stays where you left it. Choose another sound: the caps do not
  move. A beat saved before today sounds as it did.
- **Next:** Session 18 (Fable): the slider jacks carry what §20 makes. Or the owner's eye on
  the second mark first.
