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
- Found on 2026-11-25: **Codex and Antigravity are installed and logged in** (mise; `codex`
  0.172, model `gpt-6.2-sol`; `agy` 1.5, `agy models` lists them). Each ran one brief alone
  in a scratch `git worktree` (`mise trust` in its `pocket-instruments/` first):
  `codex exec --sandbox workspace-write -c model_reasoning_effort='"high"' -` with the brief
  on stdin, and `agy -p "<brief>" --sandbox --model gemini-4-neon-xhigh`. ⚠ `agy` was run
  with `--dangerously-skip-permissions`; what its `--sandbox` blocks was not checked. The
  owner (2026-11-25): fine while its work only reaches `main` as a commit we read. Judge
  such attempts together, afterwards, on a quiet machine (`harness/pairs.sh` takes several
  benches) and with `make fuzz`.
- Found in Session 10: `cargo` only works with this folder as the working directory. From
  anywhere else the mise shim fails with "No version is set". To build a scratch copy, stay
  here and pass `--manifest-path` and `CARGO_TARGET_DIR`. `jq` (1.8) is present; the Rack
  build needs it.
- Found in Session 33: **`./Rack -h` exits at once if its stdin is at end of file** ("Press
  enter to exit."), and perf then holds a handful of samples. Hold stdin open and time the run:
  `sleep 25 | perf record -e cycles:u -c 200000 -o <out> -- taskset -c 2 timeout -s INT 20
  ./Rack -h -u <folder>`. Read the sample count before the profile.

---

## Where it stands (2026-11-25, after Session 38)

The instrument plays on a phone (`web/rhythm.html`) and in Rack (the Rhythm module, 24 HP,
thirteen jacks). In the core: sixteen sounds, each a code voice or a sample; the workflow
of every "in" row of `WORKFLOW.md`; effects recorded as they are punched, with four
repeats that hold the nearest note behind them and eight sound effects, tuned to the
PO-12's measurements; sliders that are the hand's, with steps that keep what they were
written with; a display that weaves; in Rack, each effect its own channel on FX SEND and
FX RETURN; since Session 28 effects 13 (a note plays as the sound twelve keys on) and 14 (the
bus fed back); since Session 32 effect 1 plays the sounds in the effects at a quarter of the
rate; since Session 34 CLOCK in can count one edge a beat, and the display shows the tempo
the edges play; since Session 35 play on a beat clock waits for the next edge, an edge after a
pause runs at the last beat measured, and a rate change carries the beat; since Session 38 a pause
is only a pause against a measured beat. ABI 15, snapshot version 4, 333 Rust tests, CI on four
platforms in about a minute.

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
with new ends and Q 4.5; 5 at 210 Hz and Q 3.

**Built on 2026-11-25 and not yet heard by the owner** (Session 32; D98): effect 1, the sounds
in the effects retuned for 46 875 Hz and asked on a grid a quarter of it, a straight line
between, on the track channels too. ⚠ Every playing case without effect 1 costs 3 to 5 ns a
frame more than before (placement, not work, as far as measured); the `.wasm` was 802 bytes
under P1's 50 KB (311 since Session 34).

**Built on 2026-11-25 and not yet played by the owner** (Session 33; D99): in Rack the keys and
sliders are read every 16th frame (0.36 ms at 44.1 kHz), the clock, reset and jacks on every
frame. The module stopped costs about a fifth less by perf.

**Built on 2026-11-25 and not yet played by the owner** (Session 34; D100): the menu's "CLOCK:
one edge a beat" (a clock module's ×1 output plays at its tempo, the first beat at a guess);
on an external clock the display reads `ext` and the tempo the edges play, `--` when they
stop. With it, Session 32's two rulings: effect 1's grid wrapped at a rate change, the credits
naming stmlib's filter alone. ⚠ The `.wasm` is 311 bytes under P1's 50 KB.

**Built on 2026-11-25, nothing to hear** (Session 36; D102): the core asks only the sounds
that may be sounding, Codex's patch adopted. The beat 36.4 → 14.4 ns a frame, idle 6.0 → 3.7,
the same bytes out; the `.wasm` 47 861 bytes, 2 139 under P1's bar. Antigravity's faster parts
wait for Session 37's design pass.

**Built on 2026-11-25 and not yet played by the owner** (Session 35; D101): on "CLOCK: one edge
a beat" play starts the pattern on the next edge; an edge more than two beats late runs its beat
at the last beat measured (no three steps at once after a pause); a rate change keeps the beat.
The table and one edge a step the same bytes; nothing else costs more; the `.wasm` 48 141.

**Built on 2026-11-25 and not yet played by the owner** (Session 38; D103): on "CLOCK: one edge a
beat" an edge is a pause only against a measured beat, so a clock that slows to under half its
tempo is measured again on its second slow edge (it never was). The table and one edge a step the
same bytes; nothing costs more; the `.wasm` 48 150.

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
| 32, effect 1 built (Opus; D98) | ABI 14: the voices in the effects slowed to a quarter (`slow`, `sound_slow`, the grid in `Bus::frame`); the models and ten rule tests first, bit for bit at the first run; the report the same, only `render-fx-1` moved; ours beside the PO-12 on take c (220 → 55 Hz, ×3.85, +0.1 dB), nothing to move; 22 faults caught by name, 2 no test can catch; bench case fx 1/0. ⚠ every playing case 3 to 5 ns a frame over the old build, left as designed | 2026-11-25 |
| 33, Rack reads the keys and sliders every 16 frames (Opus; D99) | `pi::scans` in `jacks.hpp` with its cases; a fixture self-test scans every frame, the loop self-tests on the 16-frame scan; the latch test moves a slider (a plant asked for it); the module stopped −19% by perf, `Rhythm::process` −32%, the scan 28% → a sixteenth of it; 10 faults caught by name, 1 no test can catch. ⚠ `pi_process` reads +43% in every after build, not found | 2026-11-25 |
| 34, the clock in Rack: one edge a beat, the measured tempo (Opus; D64, D65 item 2, D100) | ABI 15: `SOURCE` 2 (`guess`, `measured`, the edge given the rate), `ext` in the view's bytes 30 and 31; Rack's "CLOCK: one edge a beat" (`clockBeat`), `ext` in place of `bpm`, the white at `ext`; `design/rack-face-ext-200.png`; the bus's grid wrapped at a rate change and the credits reworded (Session 32's two rulings); 22 tests, 18 of them first (16 failing on the old core), Session 32's review's three among them; `SOURCE` 1 the same bytes, `make pairs` inside the old spread; 31 faults caught by name, 3 no test can catch. ⚠ the play key on a beat clock read as edges | 2026-11-25 |
| 36, the core's cost a frame: Codex's patch adopted (Opus; D102) | only the sounds that may be sounding are asked (`active_tracks`), three all-sounds paths; beat 36.4 → 14.4 ns a frame, idle 6.0 → 3.7, every case under the build before Session 32; the same bytes (report, renders, 10 000 fuzz seeds); the `.wasm` 47 861; a guard on the mask's rule; `make fuzz`; 8 tests; 9 faults caught by name, 2 no test can catch. ⚠ sliders 2 ns dearer than without the all-returned path | 2026-11-25 |
| 35, the beat clock's three gaps (Opus; D101) | play on a beat clock waits for the next edge (`Seq` told the span once a `SOURCE`; given it every frame cost 0.3 ns), a pause is a first edge, a rate change rescales the beat; the notice names the filter alone; 14 new tests (11 first; with Session 34's play-key test reworked, 9 failing on the old core); the same bytes, 6 184 of 10 000 fuzz seeds differ, all sending `SOURCE` 2; `make pairs` inside the old spread; `pi_size` 3 872; the `.wasm` 48 141; 24 faults caught by name, 2 no test can catch | 2026-11-25 |
| 38, the beat clock: a pause only against a measured period (Opus; D103) | one condition in `Clock::edge`; 8 new tests by hand first (the two worked cases and the review's six) and Session 35's two no-guess pause tests worked again by the ruling, 4 failing on the old core; the same bytes, 3 036 of 10 000 fuzz seeds differ, all sending `SOURCE` 2; `make pairs` inside the old spread; the `.wasm` 48 150; 12 faults caught by name, 1 no test can catch | 2026-11-25 |

## Next, in order

The owner ruled the run of 2026-11-25's seven as recommended (D104), before hearing it.

1. **Session 39** (build, Opus), below: Rack's jacks worked out only when something reads
   them. Nothing waits on the owner.
2. **Session 37** (design, Fable), below: Antigravity's parts designed in. Nothing waits on
   the owner; it ends in a build list.
3. **Your ears** (restart Rack first): the run of 2026-11-25's three checks, thirteen
   minutes, in its Handover below (effect 1, the clock, the scan and the cost); then
   Sessions 26, 28 and 30, still unheard (`PLAN-HISTORY.md`; O23, O25).
4. **Takes, when the PO-12 is out** ("The owner's hands"): 16's (sound 15 a bar long, dry,
   then fx + 16, then fx + 1; it serves 15 too), 14 at 120 bpm, and 13's map. Read them
   with "Read `pocket-instruments/PLAN.md` and read the takes asked for".
5. **Your looks and rulings** on what 2026-11-23 built: "The owner's hands", first part.
   **Session 14's fourth box,** the weave accepted or redrawn: below.
6. Then from "Not planned yet", as you choose.

## Session 39 — Rack's jacks worked out only when something reads them (build, Opus; D104 item 5)

`rack/` only: nothing in `core/` changes. Read Session 33's Handover (`PLAN-HISTORY.md`:
`jacks.frame` is 54% of `Rhythm::process` stopped); `rack/src/jacks.hpp` (`Jacks::frame`,
and `fxSend`, whose mask of live gains is the pattern); `rack/src/Rhythm.cpp`, `process`
from "The jacks, out"; Machine state (perf, pinned to CPU 2; Rack's stdin). The rules for
every build session hold. **No volt on any patched jack may change.**

- [ ] **Before any change:** perf on the installed build, stopped and unpatched, and again
      playing the minimum beat, pinned, by Machine state's recipe: the module's samples,
      `Rhythm::process`'s and `jacks.frame`'s, written down.
- [ ] **Tests first,** in `rack/test/jacks.cpp`, written to today's volts and passing on
      today's code where today's code can run them: a trigger is 10 V for 1 ms at 44.1, 48
      and 96 kHz and 0 V after; a hit again inside a pulse starts the millisecond again;
      **TRIGGERS patched in the middle of a pulse carries the rest of it** (the timers
      count whether or not anything reads them); a channel is written 0 V on the frame its
      pulse ends; VOICES is `safe(5 V × the track)` on every channel.
- [ ] **VOICES:** the sixteen `safe(5 × track)` are worked out only on a frame VOICES is
      patched.
- [ ] **TRIGGERS:** a mask of the tracks whose pulse is live (`trigLeft[t] != 0`), as
      `fxLive` is for the send. An event sets the timer and the bit; each frame only the
      live tracks count down, patched or not; patched (or in a fixture self-test, which
      writes TRIGGERS anyway) each live track is 10 V, and a track whose pulse ends is
      written 0 V once and its bit cleared, so the output's voltages must start at 0 and
      a cable patched in later reads 0 on every channel not live. `process`'s own loop
      over the sixteen for `before` (the self-test's count of pulses) uses the mask.
- [ ] AUDIO, FX GATES and FX SEND do not change.
- [ ] Faults planted and caught by name (the timers not counted while unpatched; the 0 V
      not written at a pulse's end; the bit not set by a second hit). `make selftest` in
      `rack/`: every fixture's TRIGGERS count and the loop tests as before.
- [ ] **Measured:** perf again, the same patches and seconds: stopped, and playing, before
      and after, and what is now `Rhythm::process`'s largest part.
- [ ] **The end:** `make verify`, `make selftest` in `rack/`, `make install` in `rack/`;
      "Later: efficiency" gains the numbers; `LEARNINGS.md`; the Handover; this list to
      `PLAN-HISTORY.md`.

## Session 37 — the core's cost a frame, the rest: Antigravity's parts designed in (design, Fable; D102 item 2)

Not started. `harness/efficiency-candidates/README.md`, `antigravity.patch`, `opus.patch`.
Design only: which parts are taken as written (its review names them: `Clock::advance`,
`clear`, the cold handlers out of line, the Hat and Tom tables, the Tone and bass split,
the steady path in `Bus::advance`, `process_silent`), and for the rest (a voice's second
copy, the paths for tracks 0 to 3, the loop's chunk skip) either one general form or a
test that holds each fast path to the general one on tracks 4 to 15 and samples. Then a
build list. The bar: `make fuzz`, and no rule written in two places.

Two findings from Session 36's review to design for: `quiet.rs`'s "engine that asks every
voice" shares the engine's own code and holds only the mask, so a fast path needs a model
written apart from it (as `Voicing` in `tests/bus.rs` is); and the mask's guard is a
`debug_assert!` that the fuzz never meets, because the fuzz builds in release: a debug
build of the fuzz would close that.

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
| **The effects tuned, the rest:** effect 1 as the sounds at a quarter rate (built, Session 32; a low-pass after the line if the ear asks, D98 item 10); the sweeps' cycle (9 → 6 steps), their ends and peaks, 5's cutoff (R73: constants; built, Session 30) | the owner's ear | `ENGINE.md` §18, "proposed 2026-11-25"; `core/src/bus.rs`, "TUNING THE EFFECTS" |
| **The delay, if the ear asks:** a tail after the key is let go; the second echo; the line standing still in silence, as the PO-12's does (R75; ruled no, D95 item 5) | the owner, after Session 26 | D91 item 5; `ENGINE.md` §18, "proposed 2026-11-25" |
| **Effects 15 and 16** (13 and 14 are Sessions 27 and 28, built) | 16: effect 1 designed first (it reads as 1 with the rate wobbling, R76). 15: a take that explains it (sound 15 a bar long under fx + 15) | D67 item 4; R48; R67; R76 |
| **Effect 14, the rest:** the PO-12's loop inside its 8 192 line, the echo in it, whether it follows the tempo; ours read on take c's pattern beside R75 | the 120 bpm take again (the first held 13); then the owner's ear | R70; R75; `ENGINE.md` §18, "effect 14", "Not modelled" |
| **Each effect to its own Rack module, the rest:** the breakouts, a trigger in for each sound (the sixteen channels are Sessions 23 and 24) | the owner's ruling on D86 items 3 to 5 (O20) | D86; D87; R63 |
| **The sliders, the rest:** change one held step; record a slider's movement while write is held; live record of notes (write becomes a held key) | the simple rule played first | D75 item 3; `WORKFLOW.md`, "The sliders" |
| **A OUT back to A IN is one hit late** | the owner: does it matter? | O18; `ENGINE.md` §19, "Found" |
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
- [x] Still a question for the owner: read the parameters every 16 or 32 frames (under 1 ms
      late) rather than on the frame the brief asks for, as VCV's own modules do. Measured
      cost of reading them every frame now: a small part of `Rhythm::process`, no longer the
      biggest. **Session 29:** with the core's idle cost gone it is the biggest again: the 23
      key parameters' scan is 29% of `Rhythm::process`'s samples stopped, and `Rhythm::process`
      is now about three quarters of the module's idle cost.
      **Ruled every 16 (D99) and done in Session 33:** perf, one module stopped and unpatched,
      20 s at 48 kHz, pinned to core 2, six runs each way: the scan 479 to 534 samples (28 to
      29% of `Rhythm::process`) → 32 to 43; `Rhythm::process` 1 807 → 1 227 (−32%); the module
      2 237 → 1 801 (−19%), about 0.43% → 0.34% ⚠ (an assumed 5.25 GHz). ⚠ `pi_process` read
      319 → 456 in every after build (the same library, the same inputs; not placement by two
      scratch layouts; not found). The largest part now: `jacks.frame`, VOICES' and TRIGGERS'
      sixteen channels worked out every frame, patched or not (54% of `Rhythm::process`).
- [x] **The bench reads where code lands** (Session 26, `LEARNINGS.md`): `pi_process`'s
      place in a 64-byte line moved idle by up to 3 ns a frame between builds that differ
      only in code that never runs while stopped. Before chasing a nanosecond, pin the hot
      loop's alignment (or bench several layouts), and measure in Rack with perf.
      **Done in Session 29:** functions pinned to 64 bytes, and the bench pinned to one CPU
      (`make pairs`); three such builds now read within 0.5 ns.
- [x] Next for efficiency, when wanted: the core itself (`pi_process` is about half the
      module now). That one speeds up the phone too. Profile first (Machine state). **Session 32:** every
      playing case without effect 1 now reads 3 to 5 ns a frame over Session 30's build, from
      where code lands, not from work (`LEARNINGS.md`, Session 32, has the scratch builds):
      pinning the frame loop's layout is the first thing to try.
      **Done in Session 36 (D102, Codex's patch):** only the sounds that may be sounding are
      asked. `make pairs` against Session 34's build, CPU 2, ten rounds, medians (ranges), ns a
      frame, old → new: idle 6.0 (6.0–6.1) → 3.7 (3.7–3.9); beat 36.4 (36.3–41.5) → 14.4
      (14.3–17.4); all 55.7 (54.7–58.2) → 47.1 (46.9–52.2); both 38.0 → 15.0; repeat 42.1 →
      22.7; fx 1 34.2 → 19.6; fx 1/0 37.7 → 17.6; fx 2 43.8 → 18.8; fx 3 44.9 → 22.9; fx 4
      44.8 → 19.7; fx 5 44.2 → 21.1; fx 6 44.5 → 21.4; fx 7 44.2 → 20.3; fx 8 44.5 → 20.4;
      fx 14 45.7 → 21.4; loop 45.4 → 18.7; loop fx 45.4 → 18.6; loop in 47.5 → 19.9; sliders
      40.3 → 21.2. Every case under the build before Session 32. The `.wasm` 49 689 → 47 861.
      The rest (Antigravity's, beat 9.5) is Session 37's design pass; not measured in Rack.

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
- [ ] **Session 33, two minutes in Rack** (restart Rack first): its Handover (now in `PLAN-HISTORY.md`).
- [ ] **Session 34, three minutes in Rack** (restart Rack first; O27): its Handover (now in `PLAN-HISTORY.md`).
- [ ] **Session 35, two minutes in Rack** (restart Rack first; O27): its Handover (now in `PLAN-HISTORY.md`).
- [ ] **Session 36, one minute in Rack** (restart Rack first): its Handover (now in `PLAN-HISTORY.md`); above all
      ⚠ 1, the sliders case's 2 ns.
- [ ] **Session 38, one minute in Rack** (restart Rack first; O27): its Handover below.
- [ ] **Session 32, by ear and to rule on** (O26): its Handover (now in `PLAN-HISTORY.md`) has
      the steps (five minutes) and four readings (⚠), above all the cost on every playing case.
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

### After Session 38: the beat clock, a pause only against a measured period (2026-11-25)

- **Built as D103 rules, not yet played.** On "CLOCK: one edge a beat" an edge is a pause only
  when the period was measured (`measured` set and `since > 2 × period`); any other edge after
  the first measures. A clock that slows to under half its tempo (120 to 55 bpm) is a pause on
  its first slow edge and measured on its second (`ext` 550, steps 13 091 frames apart); from
  `pi_init` at 300 with an edge every half second, the second edge measures. One condition in
  `Clock::edge`. ABI 15, `pi_size` 3 872. `make install` ran: **restart Rack.** The page did not
  change but for its `.wasm`.
- **Where the build differs from the list:** two of Session 35's tests asserted what D103
  overturns (`ruling_2_with_no_guess_the_beat_after_a_pause_is_the_stored_tempo_s` and
  `..._a_pause_takes_the_stored_tempo_as_it_is_then`). They were worked again by hand by the
  ruling, before the code and in the tests' commit, and renamed for what they now hold (one edge
  then a long wait measured as a beat, the next beat bunching once: the ruling's own ⚠ Left; the
  second edge measuring whatever the stored tempo says); each comment keeps Session 35's reasoning
  and says why it changed. No pass bar was edited after the code.
- **What you must decide or know (⚠):**
  1. **The pause's fall-back to the stored tempo's beat can no longer run.** On beats `measured`
     is set only where `guess` is set to a non-zero `since`; a reset keeps `guess`, a switch
     clears both, a rescale holds it to at least 1. So a pause always finds a guess. Built as the
     ruling reads (it keeps D101's "or the stored tempo's beat"); planted out, no test moved. One
     line to simplify if you want it gone; nothing heard differs.
  2. **D103's own ⚠ stands:** one edge, a long stop, then the clock again: the wait is measured as
     a beat and the next beat's steps bunch once. A test now holds it.
- **Cost:** `make pairs` against this session's own old build, CPU 2, two runs, medians, ns a
  frame (old → new): idle 3.7 → 3.7; beat 14.4 → 14.4; all 47.2 → 47.2; both 14.9 → 14.9;
  repeat 22.7/22.6 → 22.8/22.7; fx 1 19.8 → 19.8; fx 1/0 17.4/17.3 → 17.3; fx 2 to 8 and 14
  within 0.1 either way; loop 18.6, loop fx 18.6/18.5, loop in 19.9/19.8, the same; sliders
  21.3/21.4 → 21.3. Every case inside the old spread in both runs. Not measured in Rack by perf:
  the change is on the edge path, which runs once a beat. The `.wasm` 48 141 → 48 150, 1 850
  under P1's bar.
- **Proven:** 333 Rust tests (8 new: the two worked cases and the review's six, written by hand
  first; with Session 35's two worked again, committed with the old core failing 4: the two worked
  cases and the two reworked; the six pass on both). `SOURCE` 1 and the table: the report's 360
  runs and all 432 render files the same bytes. `make fuzz` against the old library, 10 000 seeds:
  3 036 differ; a scratch copy of the fuzz that flags `SOURCE` 2 at the `pi_process` call (its
  hashes the real fuzz's) shows every one sent it inside a block, and none without it differs.
  13 faults planted, the unplanted copy first, each built: 12 caught by name (the old rule, 4
  tests; a pause only when not measured, 8; a pause against any guess, 1; a pause leaving
  `measured` set, 2; one edge a step pausing, 1; the bar inclusive, 1; a measured beat not setting
  the guess, 5; a rescale holding a period of 0 to 1, 1, the review's rate-change case; the span
  taken from `SOURCE`'s value, 1, the invalid source case; the span told only on a switch to
  beats, 1, the 2-to-1 case; a reset keeping `have_edge`, 5, the reset-while-waiting case among
  them; stop forgetting the wait, 1, the stop-then-play case); 1 no test can catch (⚠ 1). `make
  test`, `make fuzz`, `make web`, `make selftest` at three rates, `make play` (both browsers),
  `make listen`, `make verify`, `make install`.
- **To check, one minute in Rack** (restart Rack first): Clocked at ×1 into CLOCK, "CLOCK: one
  edge a beat" on, at 120 bpm. Turn Clocked down to 55: the display reads `ext --` for about a
  beat, then `55` (before this session it stayed `--`), and the four steps of each beat fall
  evenly.
- **Next:** Session 37 (design); your ear on Sessions 26, 28, 30 and 32; your checks of 33 to 38.

### After the run of 2026-11-25: Sessions 31 to 38, one note for all of it

Run while you were away, on Fable, with Opus agents building and a second agent reviewing
each build. Each session's own note is in `PLAN-HISTORY.md` (38's is above).

- **Built, all on `main`, `make install` run: restart Rack.**
  1. **Effect 1 is the PO-12's** (Sessions 31, 32; D98): the sounds at a quarter of the
     rate, two octaves down, four times as long, no louder. A model read beside take c
     changed the design before the build: no hold, straight lines (R77).
  2. **Rack reads the keys and sliders every 16 frames** (Session 33; your ruling, D99):
     the module's idle cost 0.43% → 0.34% of a core.
  3. **The clock in Rack** (Sessions 34, 35, 38; D100, D101, D103): the menu's "CLOCK: one
     edge a beat"; the display shows the tempo measured from the edges, `ext` in place of
     `bpm`, `--` when the clock stops. Two reviews each found a gap in my design, both
     closed and built: play waits for the beat; a pause is not measured as a beat; a slow
     clock is still measured.
  4. **The core costs under half what it did** (Session 36; D102): the beat 36.4 → 14.4 ns
     a frame, idle 6.0 → 3.7, the phone too. Session 32 had made every playing case 4 ns
     slower; three attempts were run on one brief (Codex, Opus, Antigravity), all three
     held to the same bytes by a new fuzz over 10 000 seeds, and Codex's adopted.
     `harness/efficiency-candidates/README.md` has the table.
  5. ABI 15, 333 Rust tests, `make fuzz`, the `.wasm` 48 150 bytes.
- **To hear and check, restart Rack first:**
  1. **Effect 1, five minutes** (Rack or the phone). The tone (key 15), slider B up, on
     step 1. Punch fx + 1 while it rings: it drops two octaves at once and rings on slow;
     let go: it jumps back up. Hold fx + 1 over a beat: everything slow and dark, nothing
     louder. Switch one sound out of the effects: it stays as it was. Listen to how bright
     it is on top (ours is about 12 dB brighter above 10 kHz than the PO-12).
  2. **The clock, five minutes** (Rack). Clocked at ×1 into CLOCK, the menu's "CLOCK: one
     edge a beat" on, play: the beat at Clocked's tempo, the display `ext` and Clocked's
     number. Change Clocked's tempo: the number follows. Drop it from 120 to 55: the number
     follows after two beats. Stop the beat and press play mid-beat: it starts on the next
     beat. Stop Clocked a few seconds and start it: the next beat's four steps are even.
  3. **The scan and the cost, three minutes** (Rack). Stopped, Engine → CPU meter: about a
     fifth under what it read; playing, lower again. Tap keys, hold bpm and move a slider,
     Ctrl+click fx and punch a key: nothing missed, nothing different.
- **Ruled by the owner the same day, all seven as recommended (D104).** As they were put:
- **Rulings waiting for you (recommended answer first):**
  1. **Effect 1 as designed (O26)?** **Accept.** Its points: a ringing note changes speed
     the moment 1 comes on or goes off; a sound returned from Rack is left as it came;
     VOICES carries the slowed sound (so does a mixer fed from it; switch a sound out of the
     effects, or set effect 1 to Rack's, to keep it clean). If the top is too bright, say
     so: a low-pass after it is a small build.
  2. **The clock as designed (O27)?** **Accept.** `ext` in place of `bpm` is a stand-in
     for your eye.
  3. **The `.wasm` is 1 850 bytes under P1's 50 KB bar.** **Raise the bar to 64 KB.** It
     was set when the file was 5 KB; the next feature will pass it, and no builder may
     move a pass bar.
  4. **Go further on the core's cost (Session 37)?** **Yes, when wanted, as a design
     session first.** Antigravity's attempt reads 9.5 ns for the beat with no byte moved,
     but it writes the mix five times and each hot voice twice. The session picks its
     clean parts and says what tests hold the rest.
  5. **Rack's next idle cost.** **Yes: a small build.** The module works out all sixteen
     VOICES and TRIGGERS channels every frame, patched or not: now 54% of its idle cost.
  6. **Session 33's edge:** two mapped parameters changed inside one 16-frame window lose
     their order (a mapped slider, then bpm 5 frames later, reads as swing). **Accept:** a
     hand cannot do it.
  7. **Session 36's trade:** the path for every sound returned costs the 50-channel layout
     2.2 ns (it still reads 21.2, from 40.3). **Keep.**
- **Needs the PO-12:** 16 waits for one take (sound 15 a bar long, dry, then fx + 16, then
  fx + 1; the same take serves 15). The two short takes from before still stand (14 at
  120 bpm; 13's map).
- **Not done, and why:** no Rack self-test runs a beat clock (the core's tests hold the
  rule; your Clocked check above is the test). perf in Rack was not run for the playing
  cases. Antigravity ran once with its permission prompts off inside its own sandbox and a
  scratch copy; it made no commit, and its patch is in the tree unapplied.
- **Next:** your ears and the rulings above; then Session 37 if wanted, the weave
  (Session 14's fourth box), and the takes.

