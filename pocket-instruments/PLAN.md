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
- ⚠ A recording through PipeWire loses a few hundredths of a second about every 30 s on
  this laptop, Rack open or closed (R71: whole 512s of samples, 3 to 5 at a time). Not
  found why. `harness/hardware-fx.py` lays its grid across a loss; anything read by hand
  from a take must do the same.
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
- Found after Session 24: **the owner's Rack only gets a build when someone runs `make
  install` in `rack/`.** `make selftest` installs into a throwaway folder, so a session can
  pass every check while the owner's Rack still runs the morning's plugin (it did: FX SEND
  looked one-channel). A build session ends with `make install`, and the owner restarts Rack
  (it unpacks the `.vcvplugin` at start).
- Found in Session 29: **the CPU is a Ryzen 9 7950X3D, two dies.** One has the stacked cache
  and a lower clock (core 2 is on it), the other is faster (core 10). A run lands on either,
  so every bench case is bimodal by about 2 ns. `make bench` and `make pairs` pin to
  `BENCH_CPU` (2); pin perf's Rack too: `perf record ... taskset -c 2 ./Rack -h -u <folder>`.
- Found in Session 10: `cargo` only works with this folder as the working directory. From
  anywhere else the mise shim fails with "No version is set". To build a scratch copy, stay
  here and pass `--manifest-path` and `CARGO_TARGET_DIR`. `jq` (1.8) is present; the Rack
  build needs it.

---

## Where it stands (2026-11-25)

The instrument plays on a phone (`web/rhythm.html`) and in Rack (the Rhythm module, 24 HP,
thirteen jacks). In the core: sixteen sounds, each a code voice or a sample; the workflow
of every "in" row of `WORKFLOW.md`; effects recorded as they are punched, with four
repeats that hold the nearest note behind them and eight sound effects, tuned to the
PO-12's measurements; sliders that are the hand's, with steps that keep what they were
written with; a display that weaves; in Rack, each effect its own channel on FX SEND and
FX RETURN; since Session 28 effects 13 (a note plays as the sound twelve keys on) and 14 (the
bus fed back). ABI 13, snapshot version 4, 276 Rust tests, CI on four platforms in about a
minute.

**Built on 2026-11-23 and not yet seen or heard by the owner** except the effects on a
phone: everything from Session 21 onwards. Every look in it is a stand-in until the owner
rules. The effects are first guesses from the hardware's names and are not tuned.

**Built on 2026-11-24 and not yet played by the owner:** FX SEND and FX RETURN as sixteen
channels, a channel an effect, the return always summed, each effect Ours, Rack's beside
the dry or Rack's in place of it (D87, D88; Session 24).

**Built on 2026-11-24 and not yet heard by the owner** (Session 26; D90, D91): a repeat that
holds the nearest note behind it; effects 1, 2, 3 and 5 to 8 retuned, then three of them
moved after ours was read beside the PO-12 by the same script; effect 4, one echo in a line
each host lends.

**Built on 2026-11-24 and not yet heard by the owner** (Session 28; D93): effect 13, a note
plays as the sound twelve keys on, and effect 14, the bus fed back in the line effect 4 is
lent, its gain moved to 2.05 after ours was read beside the PO-12.

**Measured on 2026-11-25, ruled the same day (D95), not built** (Session 22's last takes; R71 to R76):
the PO-12's effect 1 is its sounds at a quarter of the rate, where ours holds the bus; its
sweeps go round in 6 steps, where ours take 9; its repeats fall silent on an empty step, and
ours go back to that (Session 30); its 9 and 10 are mutes; 13's map is not settled.

**Built on 2026-11-25 and not yet heard by the owner** (Session 30; D95, D96): the repeat holds
the step the key came down on and is silent on an empty one; the sweeps go round in six steps
with new ends and Q 4.5; 5 at 210 Hz and Q 3. Effect 1 as the slowed sounds is designed (Session 31, D98) and is Session 32's to build.

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
| 22, the hardware's effects measured (Fable, with the owner; takes 2026-11-24 and 2026-11-25) | `harness/hardware-take.sh` and `harness/hardware-fx.py` (`--first`); R64 to R76; `WORKFLOW.md`'s effects rows answered and three corrected; proposals in `ENGINE.md` §17 and §18 (2026-11-24, ruled D90; 2026-11-25, open: O24); D87. Seven takes read; two short ones asked for after (14 at 120 bpm, 13's map) | 2026-11-25 |

| 23, FX SEND and FX RETURN designed (Fable, with the owner; D87, D88) | D88: three settings an effect (ours, beside the dry, in place of the dry), the send's ramp in the module, the return summed in the core before the volume; `ENGINE.md`, "§19, designed 2026-11-24"; the fork measured in a scratch copy (`LEARNINGS.md`); Session 24's list. Nothing built | 2026-11-24 |
| 24, FX SEND and FX RETURN built (Opus; D87, D88) | ABI 11: FX RETURN summed before the volume, `ROUTE` 1 the host's effects, `ROUTE` 4 an insert; FX SEND's sixteen ramps, FX RETURN summed, the three settings in the menu and the patch; the self-test's three FX modules; the two jacks with stitches; `render-loop`'s loop files rendered again; 30 faults caught by name | 2026-11-24 |
| 25, the repeat's rule, the retune and the delay designed (Fable; D90, D91) | `ENGINE.md` §17 and §18, "Designed 2026-11-24"; D91 and O22; R69, the reports read again; `fixtures/designed/fx-repeat-holds.json` by hand; the delay's memory measured in scratch copies (`LEARNINGS.md`); Session 26's list. Nothing built | 2026-11-24 |
| 26, the repeat's rule, the retune and the delay built and compared (Opus; D90, D91) | ABI 12: the repeat holds the nearest note behind it, the retune, effect 4's echo in a lent line (`pi_delay_frames`, `pi_set_delay`); the hosts lend; `harness/ours-take.cpp` and ours read beside the PO-12, three constants moved; 30 faults caught by name. ⚠ The beat and all 1 to 3 ns a frame over the old build (placement) | 2026-11-24 |
| 27, effects 13 and 14 designed (Fable; D93) | `ENGINE.md` §17 and §18, "designed 2026-11-24: effect 13" and "effect 14"; D93 and O23; R70, takes a and b read again; `fixtures/designed/fx-shuffle.json` by hand; a model of 14 off the engine (`LEARNINGS.md`); Session 28's list. Nothing built but the sliders' second mark, now madder | 2026-11-24 |
| 28, effects 13 and 14 built and compared (Opus; D93) | ABI 13: `shuffle` in `seq.rs`, `feedback` in `bus.rs`; `fx-shuffle` moved up and passing everywhere (Rack and the page too, with `fx-repeat-holds` in Rack); `render-fx-14`; Rack's menu names; 14 on the listen page; 27 faults caught by name; ours read beside the PO-12, 14's gain 2.24 → 2.05 | 2026-11-24 |
| 29, efficiency (Opus) | every native library's functions on a 64-byte line; `make bench` pinned to one CPU, `make pairs`; a quiet engine does not ask its voices: idle 29.5 → 6.1 ns a frame, no case slower, the same bytes; in Rack the module's idle −26% | 2026-11-24 |
| 30, the repeat to the hardware's rule; the sweeps and 5 retuned (Opus; D95, D96) | a run repeats the step the key came down on, silent on an empty one (`held_step` gone); `fx-repeat-holds` and `fx-repeat-punch` worked again by hand; the sweeps six steps round, new ends, Q 4.5; 5 at 210 Hz, Q 3; ours read on take c's pattern, nothing moved; `ours-take.cpp`'s keys a third of a step early since Session 26, fixed; 17 faults caught by name | 2026-11-25 |
| 31, effect 1 designed (Fable; D95 item 3, D98) | `ENGINE.md` §18, "designed 2026-11-25: effect 1": the voices retuned to 46 875 Hz and asked on a grid a quarter of it, straight lines between; D98 and O26; R77, a model off the engine read beside take c (it changed the design: no hold); 16 waits for a take; Session 32's list. With it, while Session 32 built: D99 (the owner: keys and sliders every 16 frames) and Session 33's list; the clock in Rack designed (§4, §14, D100, O27) and Session 34's list. Nothing built | 2026-11-25 |

## Next, in order

1. **The owner's ear on Sessions 26 and 28** (restart Rack first):
   Session 26's and Session 28's steps are in their Handovers in `PLAN-HISTORY.md`. D92's
   and D93's rulings are cheap to change if they sound wrong; so is 14's gain (⚠ below).
2. **Your ear on Session 30** (restart Rack first: `make install` ran): its Handover's steps,
   the rest of O25. Then **Sessions 32, 33 and 34** (build, Opus), below, in that order. **Two short takes, when the PO-12 is out** ("The owner's hands"): 14 at
   120 bpm, and 13's map. Read them with "Read `pocket-instruments/PLAN.md` and read
   Session 22's two last takes".
3. **The owner's looks and rulings** on what 2026-11-23 built: "The owner's hands", first
   part.
4. **Session 14's fourth box,** the weave accepted or redrawn: below.
5. **The host's idle cost, when wanted** ("Later: efficiency"): the owner's answer to reading
   the parameters less often decides the next step (Session 29's Handover).
6. Then from "Not planned yet", as the owner chooses.

## Session 32 — effect 1 as the sounds at a quarter of the rate (build, Opus; D95 item 3, D98)

Read `ENGINE.md` §18, "designed 2026-11-25: effect 1" (the brief), §11, §18's first part
and "Built (Session 17)"; D98; R72; `LEARNINGS.md` for Sessions 26 (the retune's method,
the bench) and 29 (`quiet`, `make pairs`). The rules for every build session hold.

- [ ] **Before any change:** the report, a `sha256sum` of every render file, the old
      library and a bench built on it (`target/old/bench`), as Session 29 did.
- [ ] **The models first.** §18's model in `core/src/tests/bus.rs` and the loop's in
      `route.rs` written again from the section's words (the grid and `mu`, `slowed`, the retune,
      the line between grid values), and the rule tests of its "Proven when built by" table, among
      them the grid's fresh frames as the section lists them by hand and a slowed voice's grid
      values held to an engine at 46 875 Hz played dry. Committed failing on the old code, before the
      code.
- [ ] **The core.** In `core/src/bus.rs`: `REDUCE_HZ` goes; `SLOW_RATE` 46 875 and the
      quarter; `fresh`, `mu`, `inv`, `slowed`, `from` and `to` (`[f32; TRACKS]` each) as the
      bus's last fields; the grid in `Bus::frame` while `on == 1`; effect 1's `wet` the
      bus itself. In
      `core/src/voice.rs`: a retune of the sounds whose bit changed; `trigger` given the
      mask; `set_sample_rate` leaving the slowed; `sound_slow`, out of line, chosen in
      `render` by one test of `slowed` inside `!quiet`; `sound` itself untouched. In
      `core/src/engine.rs`: `effect` and `slowed` read before the frame's hits sound.
      `PI_ABI_VERSION` 14 in the header and `abi.rs`; `pi_size` reported.
- [ ] **What must not move:** the report; every render file but `render-fx-1`'s (and
      `render-loop`'s only if its lane holds 1: say which). Name each file that moved.
- [ ] **The bench:** a new case "fx 1/0" (the beat, effect 1 on every other step) in
      `harness/bench.cpp`. `make pairs` against the old build, alone on the machine: idle,
      beat, all, repeat, both, the loops and every other effect inside the old spread;
      "fx 1" and "fx 1/0" written down. If a listed case is slower, stop on that: write
      the numbers into the Handover and leave the layout as designed ⚠.
- [ ] **Ours beside the PO-12:** take c's pattern through `harness/ours-take.cpp`, read
      with `hardware-fx.py --pass c --effects 1` beside R72 (the tone at a quarter of its
      dry pitch, four times as long, no louder; above 10 kHz beside the model's table in §18). Nothing here has a
      constant to move; a reading that disagrees is written into §18 and the Handover.
- [ ] Faults planted and caught by name (`LEARNINGS.md` says how); the hosts: `make web`
      (the `.wasm`), the listen page's effect 1, the Rack plugin rebuilt.
- [ ] **The end:** `make verify`, `make selftest` in `rack/`, `make play`, `make listen`,
      `make install` in `rack/`; §18's section marked built, with what turned out
      different; `WORKFLOW.md`'s effect 1 row; `bus.rs`'s tuning comment; `LEARNINGS.md`;
      the Handover; this list to `PLAN-HISTORY.md`.

## Session 33 — Rack reads the keys and sliders every 16 frames (build, Opus; D99)

`rack/` only: nothing in `core/` changes. Read D99; Session 29's Handover
(`PLAN-HISTORY.md`); Machine state (perf, pinned to CPU 2); `rack/src/Rhythm.cpp`,
`process`. The rules for every build session hold.

- [ ] **Before any change:** perf on the installed build, stopped and idle, by Machine
      state's recipe, pinned: the module's samples and `Rhythm::process`'s share, written
      down.
- [ ] **The scan.** The 23 key parameters and the two sliders are read on every 16th frame
      (a counter of the module's own, stepped every frame; the view's `frames` is stepped
      only on some), and on the first frame as now. A change is sent as today, in today's
      order, on the frame it is read. CLOCK, RESET, the menu's queue, the routes and the
      jacks stay on every frame.
- [ ] **A fixture self-test scans every frame** (`fixture >= 0`): its views are held to the
      frame. **The loop self-tests run on the 16-frame scan,** as a player's module does:
      the shadow engine is given the module's commands on the frame the module sends them.
      If a loop test depends on the frame a key lands, stop on it: make that test scan
      every frame, say which in the Handover ⚠, and build on.
- [ ] **Tested:** whether a frame scans, as a pure function in `rack/src/jacks.hpp` with
      cases in `rack/test/jacks.cpp` (every 16th, the first frame, every frame in a fixture
      self-test); a fault planted in it and caught by name. ⚠ A press shorter than 16
      frames is not seen; no hand can make one. Say so in `RACK-RULES.md`.
- [ ] **Measured:** perf again, the same patch and seconds: the module's idle cost before
      and after, and what is now `Rhythm::process`'s largest part.
- [ ] **The end:** `make verify`, `make selftest` in `rack/`, `make install` in `rack/`;
      "Later: efficiency", second box ticked with the numbers; `LEARNINGS.md`; the
      Handover; this list to `PLAN-HISTORY.md`.

## Session 34 — the clock in Rack: one edge a beat, and the measured tempo (build, Opus; D64, D65 item 2, D100)

Read `ENGINE.md` §4 whole and "designed 2026-11-25: one edge a beat", §14 and "designed
2026-11-25: the tempo measured from the edges"; D64, D65 item 2, D100. The rules for every
build session hold. ABI 15.

- [ ] **Before any change:** the report, a `sha256sum` of every render file, the old
      library and a bench built on it.
- [ ] **By hand first:** §4's three rows and §14's numbers as rule tests, committed
      failing before the code.
- [ ] **The core:** `core/src/clock.rs` (`span`, `measured`, `guess`; `edge` given the
      rate), `SOURCE` 2 in `engine.rs`, `ext` in `Engine::view` (`core/src/keys.rs`), the
      header (`PI_SOURCE_BEATS`, `PI_VIEW_EXT`, `PI_ABI_VERSION` 15). The two places that
      hold bytes 30 and 31 to zero. `SOURCE` 1: the report and every render file the same
      bytes. `make pairs`: every case inside the old spread (the table clock's frame must
      not change).
- [ ] **Rack:** the menu's "CLOCK: one edge a beat", saved as `"clockBeat"`, cleared by
      Initialize; which source is sent, as a pure function in `jacks.hpp` with cases in
      `rack/test/jacks.cpp`; the display's label and number by §14's rule; the white's hold
      at `ext`. `design/rack-face-ext-200.png`. The page: the header and `.wasm` only.
- [ ] Faults planted and caught by name.
- [ ] **The end:** `make verify`, `make selftest` in `rack/`, `make play`, `make listen`,
      `make install` in `rack/`; both sections marked built; "Not planned yet"'s clock row
      removed; `LEARNINGS.md`; the Handover; this list to `PLAN-HISTORY.md`.

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
| **The effects tuned, the rest:** effect 1 as the sounds at a quarter rate (R72: a design pass, it reaches into the voices); the sweeps' cycle (9 → 6 steps), their ends and peaks, 5's cutoff (R73: constants) | Sessions 30 and 31 (D95); then the owner's ear | `ENGINE.md` §18, "proposed 2026-11-25"; `core/src/bus.rs`, "TUNING THE EFFECTS" |
| **The delay, if the ear asks:** a tail after the key is let go; the second echo; the line standing still in silence, as the PO-12's does (R75; ruled no, D95 item 5) | the owner, after Session 26 | D91 item 5; `ENGINE.md` §18, "proposed 2026-11-25" |
| **Effects 15 and 16** (13 and 14 are Sessions 27 and 28, built) | 16: effect 1 designed first (it reads as 1 with the rate wobbling, R76). 15: a take that explains it (sound 15 a bar long under fx + 15) | D67 item 4; R48; R67; R76 |
| **Effect 14, the rest:** the PO-12's loop inside its 8 192 line, the echo in it, whether it follows the tempo; ours read on take c's pattern beside R75 | the 120 bpm take again (the first held 13); then the owner's ear | R70; R75; `ENGINE.md` §18, "effect 14", "Not modelled" |
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

- [x] **Idle cost:** the module shows about 0.6% in Rack with nothing playing (owner,
      2026-11-23), where SEQ-3 shows 0.2% and many modules 0.0%. (Session 16's `make bench`:
      a stopped engine is 26 ns a frame, as much as the minimum beat playing.) ⚠ Not profiled yet; the
      likely cause is that the engine runs every frame while stopped (the clock keeps
      counting, so a tap lands on the right tick, §4). A cheap idle path (stopped, every voice
      silent, nothing patched moving) has to keep that rule; profile it first.
      **Done in Session 29, the core's part:** most of it was the sixteen voices asked every
      frame; a quiet engine no longer asks them (idle 29.5 → 6.1 ns a frame, the same bits).
      The module in Rack −26%, about 0.45% by perf ⚠. The rest is the host's: the box below.
- [ ] Still a question for the owner: read the parameters every 16 or 32 frames (under 1 ms
      late) rather than on the frame the brief asks for, as VCV's own modules do. Measured
      cost of reading them every frame now: a small part of `Rhythm::process`, no longer the
      biggest. **Session 29:** with the core's idle cost gone it is the biggest again: the 23
      key parameters' scan is 29% of `Rhythm::process`'s samples stopped, and `Rhythm::process`
      is now about three quarters of the module's idle cost.
- [x] **The bench reads where code lands** (Session 26, `LEARNINGS.md`): `pi_process`'s
      place in a 64-byte line moved idle by up to 3 ns a frame between builds that differ
      only in code that never runs while stopped. Before chasing a nanosecond, pin the hot
      loop's alignment (or bench several layouts), and measure in Rack with perf.
      **Done in Session 29:** functions pinned to 64 bytes, and the bench pinned to one CPU
      (`make pairs`); three such builds now read within 0.5 ns.
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
- [x] **Session 23's rulings** (D88 items 4 to 12; O21), built in Session 24, ruled yes
      2026-11-24 (D89): the return
      before the volume; the settings counting only while FX SEND or FX RETURN is patched;
      nothing guarding the comb (try a delay at half wet in each setting). The steps are in
      Session 24's Handover below, with its five readings (⚠).
- [x] **Session 25's rulings** (D91; O22): a second repeat looking back for itself; no
      tail on our delay; effect 3 resting off zero, so it thumps softly on silence.
      Accepted 2026-11-24, before the build (D92). Listen for all three once Session 26
      has built them; each is cheap to change.
- [ ] **Session 27's rulings** (D93; O23), built in Session 28: a note plays as the sound
      twelve keys on; a shuffled note takes the sounding sound's sliders; the feedback stands
      still while nothing sounds (or rings on, or fades).
- [ ] **Session 28, by ear and to rule on:** its Handover (now in `PLAN-HISTORY.md`) has the steps (about ten
      minutes) and its readings (⚠), above all 14's gain.
- [ ] **Session 26, by ear and to rule on:** its Handover (now in `PLAN-HISTORY.md`) has the steps (about ten
      minutes) and its five readings (⚠).
- [x] **Session 22's proposals** (`ENGINE.md` §17 and §18, "Proposed after Session 22"):
      a repeat holds the last step that sounded; the targets for effects 1 to 8; the delay
      as one tap. Ruled yes on all three, 2026-11-24 (D90).

- [x] **Session 22's proposals of 2026-11-25** (O24; `ENGINE.md` §17 and §18, "proposed
      2026-11-25"): keep our repeat's rule though the PO-12's is the mute; 9 and 10 stay
      ours; effect 1 designed as the sounds at a quarter rate; the sweeps at 6 steps round
      with new ends and peaks, 5 at 210 Hz; the delay not standing still.
      **Ruled 2026-11-25 (D95):** the repeat back to the hardware's rule; the rest as
      recommended.
- [x] **In Rack, a steady voltage on AUDIO while stopped** (the owner, 2026-11-25: 1.650 V
      on MixMaster's input, a level on its meter, nothing heard). It is DC, not sound. ⚠ Not
      found: the core's only resting level is effect 3's half step, 0.54 V at full volume
      (D91 item 7), so 1.65 V is more than the core makes alone; FX RETURN is summed before
      the volume, so a module in the return chain resting off zero would show here. To tell:
      stopped, pull FX RETURN's cable, then RETURN's, and watch the voltage; then fx alone
      to clear the lane. If it stays with both out and no effect on, it is ours: a bug for
      a build session, with the patch saved beside it.
      **Not ours (the owner, 2026-11-25):** "Looks like it's the nozori_68_crush module",
      in the return chain.

**With the PO-12 in hand:**

- [ ] **Two short takes, asked for by Session 22's reading (2026-11-25).** Knobs untouched.
      **14 at 120 bpm:** sound 1 on step 1, two passes dry, fx + **14** for two, one dry
      (`harness/hardware-take.sh b14`; the first try held 13). **13's map:** a pattern with
      sound *n* on step *n* for all sixteen, at 80 bpm, two passes dry, fx + 13 for two, one
      dry (`harness/hardware-take.sh map13`).

- [x] Session 22's takes left, with the Scarlett and Rack closed: take c, effect 4 at
      120 bpm and the timing take. All recorded 2026-11-25 (with a dry map of sounds 4,
      11, 13 to 16); reading them is Fable's.
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

### After Session 30: the repeat back to the hardware's rule; the sweeps and 5 retuned (2026-11-25)

- **Built, and nothing you haven't ruled.** A repeat (11, 12, and 9 and 10 as ours) now holds
  the step the key came down on, and an empty step repeats as silence, as the PO-12 does. The
  sweeps (6, 8) go round in 6 steps, not 9, with 6 from 2 700 to 165 Hz, 8 from 220 to
  3 300 Hz, both at Q 4.5; 5 sits at 210 Hz, Q 3. `make install` ran: **restart Rack.**
- **Your ruling mid-session (D96 item 1)** settled the open point the plan carried: our runs
  start one step after the press, so "the step the run begins on" would have repeated the
  step after the kick. Ours now repeats the step the key came down on. The grid still starts
  at the next step ⚠.
- **What I read for you (O25, each cheap to change):**
  1. **A replayed lane repeats its own first step,** not the step you pressed on. Punch 11 on
     the kick's step and you hear the kick repeat; on the next pass the lane (which starts a
     step later) repeats the step after it, usually silence. ⚠ What the PO-12 replays is
     unmeasured. Recommended: accept until a take says otherwise.
  2. **A second repeat inside a run takes its own key's step,** nothing carried over.
  3. `r` exactly 1/3 and 1/4.5 (the plan had 0.33 and 0.22).
- **Ours beside the PO-12 on take c's pattern** (`ENGINE.md` §18, "Built (Session 30)", has
  the table): 5 reads 206 Hz against its 209; the sweeps' points sit on a 6-step triangle;
  11 and 12 at 8.00 and 6.00 a beat. No constant moved. ⚠ **14 rings near 1 kHz on this
  pattern, the PO-12 at 1.31 kHz**: written beside R75, nothing moved (D95 item 6).
- **Found and fixed:** `harness/ours-take.cpp` had played every key a third of a step early
  since Session 26. Held effects were barely touched; Sessions 26 and 28's readings stand ⚠.
- **To check, five minutes, in Rack or on the phone:** a beat with a kick on step 1 only.
  Punch fx + 11 while step 1 plays: the kick repeats 8 a beat. Punch it while step 2 plays:
  silence until you let go. Hold 6 and 8 for two bars: one sweep round every 6 steps. 5
  sounds darker than before.
- **Proven:** 275 Rust tests; 17 faults planted, all caught by name (one after a test was
  added); the report's 300 other runs the same bytes, the two re-worked fixtures moved by
  decision; 72 render files moved by decision (fx 5, 6, 8 and the loop), the other 360 the
  same; `make pairs` every case inside the old build's spread; `make test`, `make play` (both
  browsers), `make listen`, `make selftest` in `rack/` (both fixtures on both clocks), `make
  verify`; `make install`.
- **Next:** your ears on Sessions 26, 28 and 30; O25; then Session 31 (effect 1, Fable).
- **Added the same day, after you played it (D97):** punched on step 1 the kick repeated, but
  the replay did not. Now a repeat punched mid-step is also recorded on the step being played,
  so the replay repeats the kick too (its run starts a step earlier: one more step of repeats
  at the front). Sound effects unchanged. O25 item 1 is answered. 276 tests; four faults
  caught by name; only `fx-repeat-punch` moved (worked again by hand first), no render file;
  `make test`, `make play`, `make selftest`, `make pairs` (inside the old spread), `make
  verify`; `make install` ran: **restart Rack.** **Heard by the owner the same day: consistent**
  (a press that repeats live repeats on every playback; a mistimed press mutes, as the
  PO-12's rule does).

### After Session 31: effect 1 designed; the Rack clock designed; three build lists (2026-11-25)

- **Designed, nothing built.** Effect 1 as the PO-12 does it: each sound in the effects is
  retuned for 46 875 Hz and asked for a value 11 718.75 times a second, with a straight
  line between values. A quarter speed at every host rate (`ENGINE.md` §18, D98).
- **The model changed the design.** Holding each value, as R72 read the PO-12, measured
  29 dB too bright above 10 kHz beside take c (R77). Lines read 12 dB too bright ⚠; a
  low-pass is the next step if your ear asks.
- **Rulings made for you (O26; D98):** a sounding note changes speed on the frame 1 comes
  on and goes off (item 3); a sound returned from Rack is left as it came (item 6); VOICES
  carries the slowed sound (item 7, reasoned at your request); 16 waits for a take
  (item 9: sound 15 a bar long, dry, then fx + 16, then fx + 1).
- **Your ruling recorded (D99):** Rack reads the keys and sliders every 16 frames, never
  the clock or reset. Session 33.
- **The clock in Rack designed (D100, O27):** "one edge a beat" as `SOURCE` 2 in the core,
  the first beat run at a guess; the measured tempo in the view's bytes 30 and 31, shown
  with `ext` in place of `bpm`, `--` on a stopped clock. Session 34.
- **Next:** Sessions 32, 33 and 34, in order, each on Opus with its list as the brief.

