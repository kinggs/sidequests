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
  (it unpacks the `.vcvplugin` at start). **Which build Rack runs** (2026-11-25, after
  Session 39): right-click either module, and its menu's first line is `Build <commit>`. Rack's
  `log.txt` has `Pocket Instruments build <commit>` too. Compare it with `git log -1`;
  `-dirty <time>` means it was built from changes not committed.
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

## Where it stands (2026-11-25, after Session 42)

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
is only a pause against a measured beat. ABI 15, snapshot version 4, 346 Rust tests, CI on four
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

**Built on 2026-11-25, nothing to hear** (Session 39; D104 item 5): in Rack, VOICES is worked out only
while patched and TRIGGERS visits only the channels with a live pulse. The module a third cheaper
stopped by perf (`Rhythm::process` −46%), a quarter playing; every self-test line the same bytes.

**Designed on 2026-11-25, not built** (Session 37; D105): the rest of the core's cost a frame.
Antigravity's patch is not taken whole: its speed leaned on three masks being exactly right and
on §18's mix written five times. What is taken is held to four rules, and the model and the
guard grow first (Sessions 40 to 42).

**Built on 2026-11-25, nothing to hear** (Session 40; D105 items 10, 11, 13): the model and the
guard grown first. The model reads every layout and a seeded tour holds every channel of every
frame to it; `make fuzz` runs a third library with the guard on; the bench has `rack` and `rack
lp`, a frame a call. Not a line of the core outside its tests; the same bytes.

**Built on 2026-11-25, nothing to hear** (Session 41; D105 items 5 to 8, D106): Antigravity's parts
taken as written, each alone. Kept: the hats' table and the toms' flag, the tone and bass apart,
`base_inc`, the squares in integers (all 47.2 → 41.6 ns a frame, beat 14.4 → 13.9, rack 22.4 →
21.7; `pi_size` 3 672, the `.wasm` 47 961). Left out by D105 item 8's bar: the cold handlers,
`Clock::advance`, the cached volume, the grid's subtraction, the steady bus, the no-audio split
(each slower somewhere, or no gain). Effect 14 under 28 Hz no longer writes past its line (D106).
The same bytes.

**Built on 2026-11-25, nothing to hear** (Session 42; D105 items 1 to 4, 8, 9; D107): the core reads
as D105's four rules ask. One function asks a voice (`Voices::list`), the arithmetic of zeros is
one type (`Sum`), §18's mix is written once (`Bus::dry`). Beat 13.9 → 11.9 ns a frame, all 41.7 →
35.6, sliders 21.1 → 15.7, rack 21.8 → 18.5, every case faster; the `.wasm` 44 597. The same bytes.
The owner accepted the run's five rulings on 2026-11-26 (D109): efficiency work on the core stops here.

**Planned on 2026-11-26, not built** (Session 43; D110): the instrument leaves for its own
public repository, `kinggs/pocket-instruments`, before the proofs pass; the backlog becomes
issues there; patterns are the first work after the move.

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
| 39, Rack's jacks worked out only when something reads them (Opus; D104 item 5) | `rack/` only: VOICES only while patched, TRIGGERS a mask of live channels counted every frame, the self-test's pulse count in `Jacks::frame`; tests first through a test-side `Module` (`triggers`, `voices`), passing on the old code; every self-test line the same bytes at three rates; the module stopped −32% by perf, playing −24%; 13 faults caught by name, 1 no test can catch | 2026-11-25 |
| 37, Antigravity's parts designed in (Fable; D102 item 2, D104 item 4, D105) | D105: four rules a part must meet (one invariant, one place that asks a voice, the zeros' arithmetic in one type, the mix once), what is taken as written, what is not and why, how each part is judged; the three zero facts checked by brute force (4 000 000 cases); Codex read the design before it was built on (twelve findings, six taken in; D106 and O28 from it); Sessions 40 to 42's lists. Nothing built | 2026-11-25 |
| 41, Antigravity's parts taken as written (Opus; D105 items 5 to 8, D106) | D106 first (comb never under 1 frame; its test failed on the old core); kept by D105 item 8: the hats' table, the toms' flag, `Tone` and `Bass` (`pi_size` 3 656), `base_inc` (3 672), the squares in integers; left out, numbers in the Handover: the cold handlers (`.wasm` −3 903 but idle +0.2), `Clock::advance`, the cached volume (rack +0.4), the grid's subtraction, the steady bus (fx −1.0 to −1.7, loop +0.3), the no-audio split (+1 to 3 everywhere); all 47.2 → 41.6, beat 14.4 → 13.9, rack 22.4 → 21.7; the same bytes, 10 000 fuzz seeds; 2 tests from plants that passed everything; 7 faults caught by name (3 of them by part 8's guard and the tour, though 8 is out); `OLD` kept in `~/.cache/pocket-instruments/session41/` | 2026-11-25 |
| 40, the model to every layout, the guard in the fuzz, the bench as Rack calls (Opus; D105 items 10, 11, 13) | tests and harness only, the same bytes: `tests/tour.rs`, the model given layouts 1, 16, 17, 18 and 50 and a seeded tour (65 seeds at three rates, 8 at 8 kHz and 100 Hz), every short way counted and none at 0; 5 faults caught by name by the tour (`quiet.rs` caught 1); the cargo profile `guarded` and `make fuzz`'s third library (a planted guard stops seed 1, gdb names it); `--stats`' five short ways, each over a thousand frames; bench `rack` 22.4 and `rack lp` 24.1 ns a frame beside `both` 14.8 and `loop` 18.5; `OLD` kept in `~/.cache/pocket-instruments/session40/` | 2026-11-25 |
| 42, the core's cost a frame: one place asks a voice, the sums in one type, the mix once (Opus; D105 items 1 to 4, 8, 9; D107) | the cold handlers out of line (`.wasm` −4 130); `Sum` and its tests first; `Voices::list`, one place asks a voice (`ask`, `sound_active`, `sound_track` gone); the frame's `Sum` over what it emits, in the mix and the loop; `Bus::dry`, §18's mix once; the all-returned path kept (item 9); effect 1's lines by fours kept, the loop's returned sum by fours left out; beat 13.9 → 11.9, all 41.7 → 35.6, fx 1 18.9 → 16.9, sliders 21.1 → 15.7, rack 21.8 → 18.5, every case faster; the `.wasm` 44 597; the same bytes, 10 000 fuzz seeds; 10 faults and the guard caught by name; ⚠ the `Sum` step read fx 1 +0.5 alone; the two patches deleted; `OLD` in `~/.cache/pocket-instruments/session42/` | 2026-11-25 |
| 43, the order planned with the owner (Fable; D110) | each "Not planned yet" row sized from its decisions and what it waits on; the order ruled: its own public repository first, then patterns; the backlog to become issues; six new asks written as issues to open (a lane and chain editor, Pocket Operations, VCSL, install and landscape, the design refresh, an agent playing the instrument); `../GRADUATING.md`; Sessions 44 and 45. Nothing built | 2026-11-26 |

## Next, in order

Ruled by the owner on 2026-11-26 (D110). The first two need nothing from the owner but a
read of Session 44's drafts and a yes before the repository is created.

**Fast-tracked the same day, at the owner's word** ("I just want to fast-track being on the
new repo now ... full permission to create and push the repo"): Sessions 44 and 45 were run
as one, without the read of drafts between them. Where it stands:

- **Done, in `~/source/kenny/pocket-instruments`** (this folder's 275 commits carried): the
  open-source kit, two CI workflows, a landing page, the path fixes; reviewed by two
  readers, 34 of 35 findings resolved; the gate passed in a rehearsed copy.
- **Being finished from a session opened in that folder** (a hook lets a session change only
  the repository it was opened in): the documents moved to `docs/`, the push, CI, the site,
  82 issues. Its steps are `~/.cache/pocket-instruments/graduation/HANDOFF.md`; the issues
  are `issues.json` beside it.
- **Ruled after D110, to be written there as D111:** the instruments are named by role,
  **Rhythm** and **Sampler**, no numbers; the second instrument is a sampler (O30
  answered); a terminal host is a stretch part of the showpiece.
- **Left for a `sidequests` session, only once the new repository builds, passes CI and
  serves the page:** Session 45's fourth and fifth boxes below. Start it with "Read
  `GRADUATING.md` and finish Pocket Instruments' graduation".

The two lists below are kept as they were written; 44's `graduation/` folder was never
made (the drafts went straight into the new repository).

1. **Session 44 (Fable, design): the repository designed.** Below.
2. **Session 45 (Opus, build): the repository made, the code moved, the issues opened.**
   Below.
3. **Patterns** (sixteen, choosing, copy, chains), with the readable beat file designed in
   the same pass: the first design issue in the new repository, on Fable. Not a session of
   this file.
4. **Your hands, whenever** (none blocks 1 to 3): your ears on Sessions 26, 28, 30 and 32
   and the run of 2026-11-25; the takes when the PO-12 is out (16's, 14 at 120 bpm, 13's
   map); your looks and the weave (Session 14's fourth box, below). Each becomes an issue
   labelled for the owner in Session 45.

## Session 44 — the repository designed (design, Fable; D110)

Read D110, `README.md`, `RACK-RULES.md`, `../GRADUATING.md` and Session 43's Handover.
Creates no repository and moves no file: it leaves drafts in `graduation/` for the owner to
read, and a list Session 45 can follow without deciding anything.

- [ ] **The layout,** as a table from every path of today to its new one: by host at the
      top (`core/`, `rack/`, `web/`, `harness/`, `design/`), the design documents in
      `docs/`, `PLAN.md` and `PLAN-HISTORY.md` frozen in `docs/history/`. Where a second
      instrument's files would go, by name, with nothing made generic (README rule 5):
      one Rack plugin with a module an instrument and its expanders, one site with a page
      an instrument, one core crate until the second instrument says what is shared.
- [ ] **How the history comes across:** this folder's commits only, tried in a scratch
      clone, with the command written down. ⚠ What the tool needs is not checked.
- [ ] **What CI and the site need there:** the workflow now in
      `../.github/workflows/pocket-instruments-rack.yml`, the Linux image's name on the
      registry, the site served by an Action, tagged releases carrying the four plugins.
- [ ] **Every community file, drafted:** README (play it first; why it exists, in the
      owner's words of 2026-11-26; the inspirations and connected open-source projects,
      linked; Teenage Engineering's shop; why MIT, D41; not affiliated), LICENSE, CREDITS,
      CONTRIBUTING, a code of conduct, SECURITY, `AGENTS.md` (how an agent contributes; how
      an agent plays the instrument, pointing at the beat file once it exists), issue
      forms, one pull request template.
- [ ] **The issue list,** a file Session 45 opens with `gh`: every row of "Not planned
      yet", every open box of "The owner's hands", every open row of the Open table, with
      a title, a body, labels and what it waits on.
- [ ] **What needs a ruling,** each with a recommendation; `../GRADUATING.md` brought up
      to date with what designing the move taught.

## Session 45 — the repository made (build, Opus; D110)

Follows Session 44's drafts as accepted by the owner. Decides nothing. **Creating the
public repository is outward-facing: the owner says yes in the session before it runs.**

- [ ] The repository created, the history pushed, the files in their new places, the
      community files in.
- [ ] `make verify` passes there; CI green on the four Rack platforms; the site serves
      `rhythm.html` at its new address; `make install` works from the new place and the
      owner's Rack shows the new build.
- [ ] The labels, then every issue of Session 44's list, opened.
- [ ] In `sidequests`, only once the three boxes above are done: this folder replaced by
      a pointer, the workflow removed, `make verify` and `CLAUDE.md` brought into line,
      the landing page's "Graduates" with its first link.
- [ ] `../GRADUATING.md`: what the move taught, written the same day.

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

Rewritten on 2026-11-26 (Session 43; D110). Each row becomes an issue in the new
repository (Session 45); this table is the list until then. In the order ruled as far as
it was ruled: rows 1 and 2. The rest keep the order the session recommended ⚠, not ruled.
Sizes are the session's estimates ⚠: D a design pass (Fable), B a build (Opus).

| # | What | Waits on | Size | Where it is written |
|---|---|---|---|---|
| 1 | **Its own repository** (ruled first): Sessions 44 and 45 | the owner's read of Session 44's drafts | 1 D + 1 B | D110; `../GRADUATING.md` |
| 2 | **Patterns** (ruled next): sixteen patterns, choosing, copy, chains. With it, **the readable beat file**: one text form of a beat that an agent can write, a link can carry, a host can save and load (`ENGINE.md` §8 foresaw it) | nothing to start; ten minutes with the PO-12 takes the ⚠ off when a pattern change lands | 1 D + 3 B | `WORKFLOW.md`'s "later" rows; D110 items 6 and 7 |
| 3 | **A lane and chain editor, as an expander** in Rack and a panel on the page: every sound a row of sixteen steps, the chain as a strip, duplicate and copy to. Our own design and drawing | row 2 | 1 D + 2 B | D110 item 8 |
| 4 | **An agent plays the instrument:** a small command that checks a beat file, renders it and makes a link or a Rack paste; a skill that says how. Live control of a running Rack or page is its own issue, parked | row 2's beat file | 1 D + 1 B | D110 item 7 |
| 5 | **The showpiece's last mile:** a link that carries a beat, `web/` opening on the instrument, an offline shell, **install as a fullscreen app, landscape as well as portrait** | row 2 (the link carries the beat file); showing it waits on the look accepted and P8 (D22) | 1 D + 2 B | D19; D110 item 8 |
| 6 | **The look, again** (the owner runs it from Claude Design): a key can now say more than the hardware's can (chosen, written, playing, an effect playing) | the owner | the owner's, then 1 B | `design/DESIGN.md`; D110 item 8 |
| 7 | **Pocket Operations' patterns, loadable,** credited and linked to their author | the licence read or the author's yes (O29); row 2's beat file | 1 D + 1 B | D110 item 8 |
| 8 | **VCSL auditioned for the starter pack** (CC0): the candidates beside ours on the listening page | the owner's ear | half a B, then the owner | D35, D50; D110 item 8 |
| 9 | **Effects 15 and 16,** with 14's take and 13's map read in the same pass | a take: sound 15 a bar long, dry, then fx + 16, then fx + 1 (D98 item 9) | the reading, then 1 D + 1 B, or 2 + 2 if 15 does not explain itself | D67 item 4; R48; R67; R76 |
| 10 | **Each effect to its own Rack module, the rest,** and **the breakout for MixMaster** as its sounds kind: one 8 HP breakout that mirrors a pair of jacks; a trigger in for each sound | the owner's ruling on D86 items 3 to 5 (O20) | 1 D + 2 B, +1 B for "Connect" | D70; D86; D87; R61; R63 |
| 11 | **The sliders, the rest:** change one held step; record a slider's movement while write is held; live record of notes | the simple rule played; the sliders' checks 3 and 4 on the PO-12 | 1 D + 2 B | D75 item 3; `WORKFLOW.md`, "The sliders" |
| 12 | **Ours:** a player's own samples; a gesture for probability and a short length; the neighbour connection (with row 10: the same helper); the hat cut | samples and the connection: nothing. The gesture: a ruling (O10). The hat cut: a look at the PO-12 | 1 D + 2 B; 1 D + 1 B; 1 B; half a B | O10; D47; D34; D40 |
| 13 | **The step multiplier** | row 2 | 1 B | `WORKFLOW.md`'s "later" rows |
| 14 | **The gate, then the approach to Teenage Engineering:** the name and the registers searched (wait on nothing), a lawyer's view, then the ask. Until then the repository is public and quiet (D110 item 1) | the showpiece | one research pass; the rest the owner's | P9; O3, O6, O7; D11, D19 |
| 15 | **`libpo` read:** beats to and from a real PO-32 or PO-33 as sound (MIT, C99, no allocation) | its first question: do README rule 6 and D67 item 3 let us use it ⚠ | 1 D | D110 item 8 |

**If the ear asks** (not rows; each an issue that waits for the owner's ear, and the
session recommended parking all four ⚠ not ruled):

- A low-pass after effect 1's line, if its top is too bright (D98 item 10): one small B.
- The delay's tail after the key is let go, and its second echo (D91 item 5). In Rack FX
  SEND's channel 4 already rings on. "Standing still in silence" is not here: ruled no
  (D95 item 5).
- Effect 14 closer to the PO-12's: its loop inside the 8 192 line, whether it follows the
  tempo (R70, R75). Waits on the 120 bpm take first.
- A OUT back to A IN is one hit late (O18; `ENGINE.md` §19, "Found"): does it matter?

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
- [x] **Rack's jacks worked out only when something reads them** (Session 33 found them 54% of
      `Rhythm::process` stopped; ruled D104 item 5). **Done in Session 39:** VOICES only while
      patched, TRIGGERS only its live channels. perf, one module unpatched, 20 s at 48 kHz,
      pinned to core 2, unstripped builds, six runs before and three after, interleaved (samples,
      means, old → new): stopped, the module 1 636 → 1 113 (−32%; about 0.31% → 0.21% of a core ⚠
      at an assumed 5.25 GHz), `Rhythm::process` 1 183 → 640 (−46%), the jacks' lines 264 to 387 →
      17 to 31; playing the minimum beat, the module 2 292 → 1 741 (−24%), `Rhythm::process` 1 061
      → 564 (−47%). `pi_process` inside its old spread both ways. `Rhythm::process` is now flat: no
      part over 9% (the view compared for publishing 9%, the routes 7%, the two sliders 6%, the
      key scan 5%). Nothing large is left in the host; the core (`pi_process`) is now the larger
      half of the module playing.
- [x] **Antigravity's parts as written (D105 items 5 to 8; Session 41).** Each part alone against
      the commit before, then the session against Session 40's build: `make pairs`, CPU 2, ten
      rounds, medians (ranges), ns a frame, old → new: idle 3.7 (3.7–3.8) → 3.7 (3.7–3.7); beat
      14.4 (14.3–14.4) → 13.9 (13.9–14.0); all 47.2 (46.9–51.5) → 41.6 (41.0–42.2); both 14.8 →
      14.4; fx 1 19.6 → 18.9; fx 1/0 17.4 → 16.9; fx 2 18.7 → 18.2; fx 3 22.9 → 22.6; fx 4 19.7 →
      19.2; fx 5 21.1 → 20.7; fx 6 21.2 → 20.8; fx 7 20.1 → 19.7; fx 8 20.3 → 19.8; fx 14 21.5 →
      20.8; loop 18.6 → 18.2; loop fx 18.5 → 18.2; loop in 20.0 → 19.6; rack 22.4 (22.3–22.5) →
      21.7 (21.7–21.8); rack lp 24.2 (24.2–24.5) → 23.9 (23.8–24.0); repeat 22.6 (22.5–25.2) →
      22.9 (22.7–23.0) ⚠; sliders 21.2 → 21.1. `pi_size` 3 872 → 3 672; the `.wasm` 48 150 →
      47 961. Kept: the hats' table, the toms' flag and `Tone`/`Bass`; `base_inc`; the squares
      in integers (most of the gain: all −5.0). Left out, each slower somewhere outside the
      spread or with nothing to gain: the cold handlers, `Clock::advance`, the cached volume,
      the grid's subtraction, the steady bus, the no-audio split (the Handover has each
      reading). Not measured in Rack.
- [x] **One place asks a voice, the sums in one type, the mix once (D105 items 1 to 4, 8, 9; D107;
      Session 42).** Each step against the commit before, then the session against Session 41's
      build: `make pairs`, CPU 2, ten rounds, medians (ranges), ns a frame, old → new: idle 3.7
      (3.6–3.7) → 3.5 (3.5–3.5); beat 13.9 (13.8–14.0) → 11.9 (11.8–11.9); all 41.7 (41.1–46.1) →
      35.6 (35.5–36.0); both 14.4 → 12.9; repeat 22.9 → 22.2; fx 1 18.9 → 16.9; fx 1/0 16.9 → 15.2;
      fx 2 18.2 → 16.2; fx 3 22.6 → 17.9; fx 4 19.2 → 17.2; fx 5 20.7 → 17.4; fx 6 20.8 → 17.5; fx 7
      19.7 → 16.8; fx 8 19.8 → 17.1; fx 14 20.8 → 18.8; loop 18.2 → 16.9; loop fx 18.3 → 16.9; loop
      in 19.7 → 19.3; sliders 21.1 → 15.7; rack 21.8 (21.7–22.4) → 18.5 (18.5–18.7); rack lp 23.9
      (23.8–24.7) → 22.4 (22.2–22.6). The `.wasm` 47 961 → 44 597; `pi_size` 3 672. Most of it was
      the sums (beat −1.4, sliders −4.9), not the asking (beat −0.5). Not measured in Rack.
- [x] **D105 item 15, accepted by the owner 2026-11-26 (D109 item 1):** Session 42 is the last
      efficiency session on the core until a profile of a real patch or a phone says otherwise.
      What is left in a frame is single nanoseconds: the beat is 11.9 ns, 0.06% of one core at 48
      kHz; Antigravity's whole patch read 9.5. The cost of a call a frame (`rack` 18.5 against
      `both` 12.9) is left as it is (D107 item 5).

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
- [ ] **Session 38, one minute in Rack** (restart Rack first; O27): its Handover (now in `PLAN-HISTORY.md`).
- [ ] **Session 39, one minute in Rack** (restart Rack first): its Handover (now in `PLAN-HISTORY.md`).
- [ ] **Sessions 40 to 42, one minute in Rack** (restart Rack first; nothing to hear): the run's Handover
      below, "To check". The menu says `Build 5a29db8` or later; the beat with an effect held, as before.
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

- [ ] **16's take** (D98 item 9; it was in "Next, in order" and not here until
      2026-11-26): sound 15 a bar long, dry, then fx + 16, then fx + 1. It serves 15 too.
- [ ] **The note to Pocket Operations' author** (O29; drafted in Session 43's reply): sent
      by the site's own contact route. And the K.O. II page's credits, read in a browser.

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

### After the run of 2026-11-25, evening: Sessions 37, 40, 41 and 42, one note for all of it

Run while you were away, on Fable: the design, then three Opus builds, each read after. Codex
read the design before any build and the code after; a second reviewer ran the old build
against the new. Each session's own note is in `PLAN-HISTORY.md` (42's is below).

- **Built, all on `main`, `make install` run: restart Rack.** Nothing to hear: it should
  sound exactly as before.
  1. **The core costs about a sixth less a frame, and Rack's call a frame too:** beat 14.4 →
     11.9 ns, all sixteen sounds 47.2 → 35.6, the 50-channel layout 21.2 → 15.7, as Rack
     calls it 22.4 → 18.5. That is 0.07% of a core down to 0.06%: small, as D105 said
     before a line was written. About half of Antigravity's gain, without its three masks.
  2. **Less to keep in step:** one function asks a voice (two before), §18's mix is written
     once (twice before), the arithmetic of zeros is in one type. The `.wasm` 48 150 →
     44 597 bytes, the engine 3 872 → 3 672.
  3. **A model and a guard that hold every short way from now on** (Session 40): the test
     model reads all five layouts and a seeded tour drives it, 11 million frames; the fuzz
     runs a build with its assertions on. Five faults planted in the old short ways: the
     tour caught all five, the test that was there before caught one.
  4. **D106, a bug older than today:** under 28 Hz effect 14 wrote past the line the host
     lent. Codex found it reading the design; its test failed on the old core; fixed.
- **Rulings, all five accepted as recommended on 2026-11-26 (D109):**
  1. **Stop here on the core's cost (D105 item 15)?** **Yes.** Six of Antigravity's nine
     small parts measured as nothing or as a loss on today's core. What is left against its
     numbers needs the invariants D105 refused.
  2. **A zero's sign in Rack (D108 item 1)?** **Accept.** On a frame where returned sounds
     cancel to within 1e-38, the mix can read −0 V where it read +0 V. Found by reading, not
     run. The exact fix costs part of the gain.
  3. **O28, a not-a-number's bits when a sum overflows?** **Accept, and say so in §11.**
  4. **Session 40's four as-built readings** (`ENGINE.md`, ⚠ "as built, Session 40"; D107
     item 7)? **Accept:** each is what every build since Session 24 has done.
  5. **The cost of a call a frame in Rack, left alone (D107 item 5)?** **Yes.** 7 ns a call;
     1 ns of it could be had for one more thing that must be kept right.
- **Not done, and why:** perf in Rack was not run (the bench's `rack` cases stand in for it:
  one frame a call, 17 and 18 channels); D108 item 3's three small things; Antigravity was
  not run again (its patch was the subject; both patch files are deleted, git keeps them).
  Codex's first read of the code was stopped by its provider's filter and gave nothing; the
  second, told to read and not to run, gave D108.
- **To check, one minute:** restart Rack; the module's menu says `Build 5a29db8` or later.
  Play the beat with an effect held: as before. The CPU meter may read a little lower.
- **Next:** your ears on 2026-11-25's earlier run and Sessions 26,
  28 and 30; the takes; the weave.

### After Session 43: the order ruled, the repository first (2026-11-26)

A planning session with the owner, on Fable. Nothing built; no code touched.

- **Ruled (D110):** the instrument moves to its own public repository now,
  `kinggs/pocket-instruments`, quietly; then patterns (sixteen, choosing, copy, chains). The
  backlog becomes GitHub issues and work goes through pull requests. `PLAN.md` and
  `PLAN-HISTORY.md` go across frozen, as history.
- **Read for it:** every "Not planned yet" row's decisions, references and `ENGINE.md`
  sections; each row sized, with what it waits on (the first table of this session's reply
  is now "Not planned yet", above).
- **Found by research (2026-11-26, each one fetch or one search ⚠):**
  1. `kinggs/pocket-instruments` is free. No product named "Pocket Instruments" turned up;
     not a register search (O3, O6 stay open).
  2. Pocket Operations (shittyrecording.studio) is a pattern booklet by Paul Wenzel (Lulu,
     2019). A bookseller's listing says CC BY ⚠; the site refused the fetch (HTTP 403), so
     its own licence line is unread. No contact address found. `darosh/pocket-patterns`
     (MIT) holds the collection as JSON; its licence covers its code (O29).
  3. VCSL (`sgossner/VCSL`) is CC0, as our pack is. Its README names no drum-machine
     sounds; its folders were not opened. The K.O. II page that uses it draws itself with
     JavaScript and its credits are unread.
  4. `AGENTS.md` at the root is the convention agents read; `CLAUDE.md` points to it.
  5. Teenage Engineering has a page on IP rights in its products
     (`teenage.engineering/ip-rights-te-products`), found, not read.
- **Not ruled, carried as issues (⚠):** the order after patterns; O20 (the breakouts and a
  trigger in); whether the conditional rows are parked (the low-pass after effect 1, the
  delay's tail, effect 14's modelling, A OUT to A IN). The session recommended: the link
  after patterns, the takes read whenever they exist, the breakout after the link, then the
  sliders, then "Ours"; park the four conditionals until the ear asks.
- **Readings the owner may overrule (⚠):** pull requests with CI required, no required
  approval, squash merges (the owner said "normal PR cycles", no more); "Graduates" as the
  landing page's word; the second instrument left unchosen (O30).
- **For your hands:** the note to the Pocket Operations author, drafted in the session's
  reply (send it from the site's own contact route); the K.O. II page's credits read in a
  browser; the takes, as before.
- **Next:** Session 44 (Fable), the repository designed. Then 45 (Opus), built.
