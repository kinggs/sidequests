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

## Next, in order

1. **Session 22,** the recording: below. It unblocks the tuning, the repeat's fix and the
   five effects not designed.
2. **The owner's looks and rulings** on what 2026-11-23 built: "The owner's hands", first
   part. Each may send a session back (the weave and the panel most likely).
3. **Session 14's fourth box,** the weave accepted or redrawn: below.
4. Then from "Not planned yet", as the owner chooses.

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
| **The repeat's rule for an empty step.** A repeat on a step with no switched-in sound mutes those sounds; the owner hears it as a mute | Session 22: what 9 to 12 do on the hardware | Session 22's last box; `ENGINE.md` §17; D67 item 1 |
| **The effects tuned:** the constants of 1, 2, 3 and 5 to 8 | Session 22's measurements, then the owner's ear | `core/src/bus.rs`, "TUNING THE EFFECTS"; `ENGINE.md` §18 |
| **Effects 4 and 14** (delay, feedback): how much stored sound, and whose memory | a ruling; Session 22 for what they sound like | D67 item 4; R57 |
| **Effects 13, 15, 16** | Session 22: nobody describes them | D67 item 4; R48 |
| **Each effect to its own Rack module** (the owner, 2026-11-24): FX SEND and FX RETURN a channel an effect, and breakouts | the owner's ruling on D86 | D86; R63 |
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
- [ ] **D86,** each effect to its own Rack module: the recommendation, yes or no.

**With the PO-12 in hand:**

- [ ] Session 22's recording, with the Scarlett.
- [ ] The four effects checks left (`WORKFLOW.md`, "The effects: what to check on the
      PO-12"; nine were done on 2026-11-23): what 9 to 12 do, whether every sound repeats,
      the sweeps, effects 4 and 13 to 16. Session 22 answers most of them.
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

### After Session 14's first attempt: the display weaves; the owner has not watched it (2026-11-23)

- **What this is:** a first attempt, made while the owner was away (D79, D83). Boxes 1, 2, 3
  and 5 of the list are done. **Box 4 is open:** nothing is accepted, and no view is kept as
  the picture to hold to. Session 14 is not finished.
- **Built (ABI 10; D84):** the sequencer fills the view's bytes 48 to 54 (steps woven since
  play, which of the last sixteen had a sound set, tracks fired on this step);
  `pi_weave(view, len, flags, out, cap)` in `core/src/weave.rs`, a pure function from a view
  to 78 by 15 cells of seven palette numbers, integers only, no engine. The page paints the
  cells on a canvas, only when they change, with `prefers-reduced-motion` as the flag; the
  Rack display paints the same cells, with "Display: reduced motion" in its menu. Neither
  host holds a rule. `ENGINE.md` §16 is marked built as a first attempt, with a table of
  what turned out different; `design/DESIGN.md` has "How each rule is drawn" and its "Not
  done"; `web/pi_core.wasm` rebuilt and committed (41 170 bytes, from 39 832).
- **How each rule is drawn** (the table in `design/DESIGN.md`): a beat is 16 columns of
  cloth with a diamond in it, 4 columns a step; four beats show and the cloth jumps left a
  beat at a time; the diamond reaches 0, 2, 4, 6 or 7 cells by how many of the beat's steps
  had a sound set (ecru, then ochre, then madder); the beater is an ochre bar 1 to 4 cells
  wide at the cloth's edge; the shuttle is a 3 by 4 ecru block crossing the warp once a
  step, down then back, with a thread behind; two sounds together turn the three newest
  columns white for a quarter of a step; stopped, nothing reads the clock and the shuttle
  rests at the top.
- **Proven:** before the first change, `make test` (205 Rust tests, 300 runs a harness), its
  report and the sha256 of all 408 render files kept, and `make bench`. At the end: 228 Rust
  tests (23 new, in `core/src/tests/weave.rs`: 8 for the three fields, 15 for `pi_weave`,
  one or more a rule); the report and all 408 render files the same bytes as before; the
  three harnesses weave `fixtures/weave-views.txt`'s 60 views to the same bytes (Rust's
  tests, C++ on the static library, Node on the `.wasm`). `make play` in Chromium and
  Firefox: 9 phases (one new, `still`), about 1 040 drawings each, every one's cells read
  back off the canvas by colour and held to `pi_weave` in the checker's own instance of the
  `.wasm`, and painted if and only if the cells changed; played with two sounds a step, 37
  drawings with a flash and 7 drawings inside one step; with reduced motion asked for, 0 and
  1; stopped, 0 paints. The same with both browsers launched asking for reduced motion
  themselves (`PI_REDUCED=1 node web/play.mjs target/report-node.txt`): 0 flashes, 1 drawing
  a step, in every phase. `make p4` (24 of 24, both browsers, ABI 10). Rack: `make install`,
  `make selftest` at 44.1, 48 and 96 kHz, all clean (12 Rhythm modules on the six fixtures,
  three through their own cables, D78's latch; the self-test's name still shows where the
  weave is). Planted, the unplanted copy passing first: 22 faults in the core, 22 caught by
  named tests; one each in the C++ and Node harnesses' weave (the comparison failed); 7 on
  the page (`make play` failed on each, by a named line). The repo's `make verify`. CI: see
  the last line of this note.
- **Measured:** `pi_process`, old and new back to back, twice: idle 25.6 and 26.2 ns a frame
  old, 25.0 and 25.3 new; the minimum beat 27.8 and 28.2 old, 27.8 and 27.6 new; all sixteen
  42.2 and 44.1 old, 41.2 and 41.4 new. No difference to see. ⚠ One build in between
  measured 3.5 ns a frame slower in every case, idle too, from the weave's code changing
  where the compiler put `pi_process`; keeping the weave out of line brought it back
  (`LEARNINGS.md`). One `pi_weave` call: about 1.9 µs natively, on the drawing side, called
  only when the view changes (sixty times a second at most). The engine is 3 712 bytes
  (from 3 704).
- **Rulings (D84, sixteen items; Fable's, a first attempt, each the owner's to overrule):**
  ABI 10; a reset while playing starts a new cloth; "set" is set, not fired; byte 54 counts
  tracks and is 0 unless a step has arrived; 78 by 15 cells; palette 5 tile and 6 madder;
  the beat's and the diamond's sizes; the beat on the loom drawn from its steps so far; the
  jump a beat; the beater's four widths; **the flash a quarter of a step, not a sixteenth**
  (a sixteenth is 7.8 ms at 120 bpm, under a frame); five warp threads; the shuttle's size,
  place and direction; a cell painted as a square five sixths of its place; reduced motion
  in Rack's menu; no weave during a self-test.
- **For the owner to look at** (O19), in this order:
  1. `design/rack-weave-bare-200.png`, `-step07-200.png`, `-step13-200.png`,
     `-busy-200.png`, `-stopped-200.png`, then the `-100.png` ones at the size Rack shows;
     `design/phone-weave-step13.png`. `DESIGN.md`'s file table says what each shows.
  2. On the phone, `web/rhythm.html`: write a kick on 1, 5, 9, 13 and a hat between, and
     play. Does it read as a cloth being woven? Then add a snare on 5 and 13 and watch
     those steps flash. Then fill a beat's four steps and watch its diamond grow.
  3. In Rack (`make install`), the same beat. Right-click, "Display: reduced motion".
  4. On the phone with the system's reduced motion on: no flash, the shuttle jumping.
- **The choices least sure, most first:**
  1. A diamond grows after its first columns are woven (D84 item 8). With steps set late
     in a beat, cloth already woven changes. Honest to the inputs, odd for a cloth.
  2. Every cell is a square with a gap, the beater, warp and shuttle too (item 14). The
     picture has the grid on the cloth only and thin warp lines.
  3. The flash's quarter step (item 11), and whether a flash on every step of a busy beat
     is too much.
  4. The cloth jumping a whole beat every beat (item 9), not creeping.
  5. The half diamond's ochre running into the ochre beater (`rack-weave-busy-200.png`).
  6. Whether the shuttle and its thread could be read as a needle and thread (R6, D20): it
     is a block crossing bare warp, but it is the part nearest the original's subject.
  7. On the phone the weave is 42 px tall in a place 72 px tall.
- **Not done, and why:** box 4 (the owner's). The Rack drawing has no checker and was seen
  only in screenshot mode, from scratch builds that fill the face by hand (kept out of the
  tree; `grep SCRATCH rack/src` is clean); its drawing cost in Rack was not measured.
  Nothing was seen on a real phone or a real Rack window, so nothing was seen moving except
  by `make play`'s counts. `harness/race.cpp`'s `look()` holds the three new fields to what
  any view is, and no fault was planted for that. D64 (the clock menu), which PLAN once
  tied to this session's ABI number, was not touched.
- **Next:** the owner watches it. What is wrong is changed in `core/src/weave.rs`, once
  (each number is a constant under "THE DRAWING"), then `make web`, `make test`, `make
  play`. When it is accepted: three views and their cells committed beside
  `fixtures/weave-views.txt`, box 4 ticked, the list moved to `PLAN-HISTORY.md`.
- **CI:** run 45217909351 (a24f85b, the push with the core and `rack/` changes) green on win-x64, lin-x64, mac-x64 and mac-arm64.

### After the tidy: the docs brought up to date (2026-11-24)

- **No code changed.** This file was made compact: stale sections moved to
  `PLAN-HISTORY.md` word for word; the owner's lists merged into one; the rules of the
  build sessions written once; "Not planned yet" is the backlog, each row with where it is
  written down.
- **Checked against the repo:** every session in "Done so far" has its list and Handover in
  `PLAN-HISTORY.md`; every open question is in `DECISIONS.md`'s Open table (O3, O6, O7,
  O10, O18, O19, and O20 for D86); `README.md`'s status and map say what is built.
- **New, from the owner on 2026-11-24:** each effect to its own Rack module. Researched
  (R63) and recommended as D86, not decided.
- **Next: Session 22,** the recording, in a new session with the owner, the PO-12 and the
  Scarlett. Its list is above. It is a Fable session: it measures, writes facts into
  `REFERENCES.md`, and proposes; it builds nothing in the core.
