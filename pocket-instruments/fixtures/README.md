# Fixtures

Test vectors for the engine, in JSON, with the trace each must produce. They are
language-neutral on purpose: if the core is ever rewritten (D13), these carry over unchanged.
The behaviour they pin down is specified in `../ENGINE.md`.

## Format 1

Only objects, arrays, strings and whole numbers.

| Field | Meaning |
|---|---|
| `format` | 1 |
| `name`, `about` | what it is and what it is for |
| `ticks_per_step` | 96. A harness refuses a fixture whose value differs from the core's |
| `seed` | passed to `pi_init` |
| `mbpm` | the tempo for the whole run, in thousandths of a bpm |
| `steps` | how many grid steps to run |
| `commands` | what to send, each with `at`: the grid step it lands on |
| `expect` | the trace, one string per line, in order (`ENGINE.md` §7) |

A command is `{"at": n, "cmd": name, ...}` with the arguments its type takes:
`play` (`value`), `step` (`track`, `step`, `value`), `prob` (`track`, `step`, `value`),
`swing` (`value`), `length` (`value`), `reset` (none). Commands with the same `at` are sent
in file order.

`at` and `steps` count **run steps**: grid steps since the run began, not since the last
reset. Only a `reset` makes the two differ (below).

## How a harness runs one

For a sample rate `R`, let `F(n) = ceil(n * R * 15000 / mbpm)`, in whole numbers. That is the
frame grid step `n` falls on.

1. `pi_init` with `R` and the seed. At frame 0, before anything else, send `TEMPO mbpm` and
   `SOURCE`.
2. Send each command at frame `F(at)`.
3. **Table run:** `SOURCE` is the table. Send no clock.
   **Edges run:** `SOURCE` is edges. Send `CLOCK` at `F(n)` for `n` from 0 to `steps - 1`,
   after that frame's other commands.
4. Process frames 0 to `F(steps) - 1`, in blocks of the size under test.
5. Write the events as a trace and compare it with `expect`, byte for byte.

P2's pass bar is every fixture, on both runs, at 44 100, 48 000 and 96 000, in blocks of 1,
128 and 512, through all three harnesses: the same bytes each time, and `pi_dropped` at zero.

### A reset (added in Session 2, for `reset-mid-bar`)

Steps after a reset are counted from the frame the reset landed on. The harness keeps an
anchor: a frame `A` and a run step `a`, both 0 at the start. Run step `m` falls on frame
`A + F(m - a)`. A `reset` at run step `m` is sent at that frame, and then `A` becomes that
frame and `a` becomes `m`. On the edges run the `CLOCK` for run step `m` follows the `RESET`
in the same frame, as it follows every other command. In the trace, ticks start again from 0.

Format 1 still leaves two things out: a `tempo` command after step 0 (the harness would have
to re-anchor `F` in the same way; no fixture needs it yet) and a command placed inside a step.

## Format 2 (Session 10: keys, sliders and views)

Format 1, and:

| Field | Meaning |
|---|---|
| `format` | 2 |
| `commands` | also `key_down` and `key_up` (`key`, 0 to 22: `ENGINE.md` §6) and `param` (`slider` 0 = A or 1 = B, `value`) |
| `views` | what the core must say to draw: `{"at": n, "view": "…"}`, the view as text (`ENGINE.md` §14), in rising `at` |

How a harness runs one, beyond format 1:

- **A key or a slider lands one frame after its step's boundary:** at `F(at) + 1`, counted
  from the anchor as every step is. Why: a command lands before the clock moves on its
  frame (`ENGINE.md` §3), and on the edges run the `CLOCK` follows that frame's other
  commands. So on either source a key in the step's own frame meets the step before: a
  tap there carries tick 95, not 96 (Session 10 planted it and saw exactly that). One frame
  later, the latest tick is that step's tick 0 on both sources and at every rate, and
  anything the key fires carries it.
- So within one `at`: the format 1 commands in file order, then the `CLOCK` (edges run),
  then, a frame later, the keys and sliders in file order. An edit lands before a key of
  the same `at` wherever it sits in the file.
- **A view is read where run step `at` ends:** the harness ends a block on the frame run
  step `at + 1` falls on (the end of the run, for the last step), calls `pi_view` and
  writes the block as text. The extra block boundary changes no event (§3).
- **The view's text is written for the table run** (`edges=0`). On the edges run the
  harness expects the same line with `edges=1`. Nothing else in a view may differ between
  the two runs: the tick, which does, is not in the text.
- **The report** holds each run's trace and then its views, one line each.
- **From a snapshot** (below), as format 1: only the step-0 edits are left out. Every key
  and slider is sent again, so the trace and the views are the same.
- **A fixture that changes the tempo fires nothing and is not played:** its trace is empty,
  and `F` stays true to `mbpm` while the engine's tempo moves.
- **A fixture starts and stops with the `play` edit, never the play key.** The key resets
  the table clock and cannot reset an external one (§13), so the two runs would rightly
  give two traces. The play key is a rule test on each source instead
  (`core/src/tests/keys.rs`).

The Rack Probe and the P4 page play the format 1 fixtures only; neither has keys.

## Where the expected traces came from

Session 1 had no engine. The traces were produced by a throwaway model of `ENGINE.md`
(Python, about ninety lines, not kept) and checked two ways: the model gave the same trace on
both runs at all three sample rates, and the entries below were worked by hand.

That model already found one fault in the specification (the table clock's starting phase;
`ENGINE.md` §4). If a core disagrees with a trace, the specification decides, and either the
core or the trace gets fixed, with a note in `LEARNINGS.md`. A trace is never edited just to
make a build pass.

Session 2 built the core from `ENGINE.md` and it reproduced all three, and the fourth
(written by hand that session, before the core), with no trace edited (`PROOFS.md` P2).

The harnesses also run each fixture **from a snapshot**: one engine takes the tempo and the
step-0 edits and saves; a fresh engine with a different seed loads that and is sent
everything else. The trace must be the same.

### Checks by hand

- **straight-sixteenths.** Grid step `n` is tick `96 n`. 32 `step` lines, 32 for track 2,
  8 for track 0, 4 for track 1: 76 lines.
- **swing-length-change.** Odd grid steps fire at `96 n + 32`: grid step 1 at tick 128.
  The playhead runs 0 to 15, then 0 to 9; the length command lands on grid step 26, so tick
  2496 is `step 0`. Seven steps later, grid step 33 is `step 0` again and is swung, though
  pattern step 0 was unswung the time before: swing follows the grid.
- **probability-seed-1.** A draw fires when `draw % 100 < 50`. The first bar's draws:

  | Grid step | Track | Draw | `% 100` | Fires |
  |---|---|---|---|---|
  | 0 | 0 | 270369 | 69 | no |
  | 1 | 0 | 67634689 | 89 | no |
  | 2 | 0 | 2647435461 | 61 | no |
  | 3 | 0 | 307599695 | 95 | no |
  | 4 | 0 | 2398689233 | 33 | yes |
  | 4 | 2 | 745495504 | 4 | no: its probability is 0 |
  | 5 | 0 | 632435482 | 82 | no |
  | 6 | 0 | 435756210 | 10 | yes |

  Track 2 takes a draw on step 4 in each bar, so each bar uses 17 draws.
- **reset-mid-bar.** Written by hand in Session 2 before any engine ran it. A draw fires when
  `draw % 100 < 70`. Track 5 draws on pattern steps 1, 2 and 5. Before the reset: 69 fires
  (tick 120, swung), 89 does not, 61 fires (tick 504). The reset lands on run step 7; ticks
  restart at 0 and that step is grid step 0, so track 3 fires on time. After it the draws
  carry on from the table above: 95 does not fire, 33 fires (tick 192), 4 fires (tick 504).
  Had the reset reseeded the generator, the second half would repeat the first. 18 lines
  before the reset, 21 after (nine steps): 39 lines.

### The format 2 fixtures (Session 10)

Written before `core/src/keys.rs` existed, from `ENGINE.md` §13 and §14, and committed
before any core ran them. Each fixture's `about` says what it holds. A script laid the JSON
out; every tick, mask and count in it was typed in by hand.

- **keys-write-a-beat.** A key lands a frame after its step's tick 0. So a step set on the
  playhead's own step waits a bar, and one set a step ahead (track 2, step 6, at run step
  5) fires. Choosing a sound fires it at once: `384 trig 2 4` follows the sequencer's
  `384 trig 0 4` in the same tick, a frame later. Track 0 fires at ticks 384, 768 and 1152
  in the first bar (its step 0 was set after tick 0) and at 1536, 1920 and 2304 in the
  second: six. Track 2: once chosen, then 576, 960, 1344, 1728, 2112, 2496: seven. Track 1:
  once chosen, then 1152 and 1920: three. The stop lands on run step 28 before its tick, so
  the last line is `2592 step 11`.
- **keys-tap-and-choose.** Stopped, the clock still counts, so each tap's tick is 96 times
  its run step, and its step is the playhead's, 0. The play edit lands on run step 8: tick
  768 is `step 0`, and the step set by an edit (track 3, step 2) fires at run step 10,
  tick 960, where a tap of the same key adds the same line a frame later.
- **keys-bpm-family.** Swing from slider A: `(20000 × 48 + 32767) / 65535 = 15`, shown as
  `15 × 65535 / 48 = 20479`. Tempo from B: `60 + (40000 × 180 + 32767) / 65535 = 170`,
  shown as `110 × 65535 / 180 = 40049`. At 120 bpm B shows `60 × 65535 / 180 = 21845`.
  Presets: above 120 is 140; above 140 is none, so 80; above 80 is 120; above 170 is none,
  so 80.

## `snapshots-v1.txt` (Session 11)

Each fixture's version 1 snapshot (`ENGINE.md` §8), as the harnesses' "from a snapshot" run
saved it on the ABI 4 core, the day before version 2 (§15) was built: one line a fixture,
name then lowercase hex. Never regenerated. It is the proof that a snapshot written by an
old core still loads: `core/src/tests/fixtures.rs` loads each one and holds it to its
fixture's trace, and `rack/selftest.sh` gives one to a Probe as an old patch would.
A future version adds its own file beside this one, written before its change.

## Format 3, and `designed/` (Session 15: the effects; not built yet)

`designed/` holds fixtures written for a core that does not exist yet. No harness reads
the folder: each looks only at the `.json` files beside this one. The session that builds
what a fixture needs moves it up, unchanged, and only then runs it. If the core then
disagrees, `ENGINE.md` decides, as ever.

Format 3 is format 2, and:

| Field | Meaning |
|---|---|
| `format` | 3 |
| `commands` | also `fx` (`step`, `value` 0 to 16) and `fxsound` (`track`, `value` 0 or 1): `ENGINE.md` §17's two edits, sent where format 1's edits are |
| `views` | format 2's line with ` fx=<heard> fxsteps=<four hex digits> fxsounds=<four hex digits>` on its end (the view's bytes 55 to 59) |

From a snapshot, the lane and the sounds' switches set at step 0 come from the snapshot
(version 3), like every other step-0 edit.

### `fx-repeat-punch`, worked by hand

Written from `ENGINE.md` §17 with no engine and no model: every tick, mask and count was
typed in. Length 8, so a pass is 768 ticks. A key lands a frame after its step's tick 0.

- **The punch lands late for its own step.** fx and key 11 go down in run step 4, after
  tick 384. The lane is written only by steps that arrive, so pattern step 4 stays empty and
  plays its one hit. `heard` is 11 from that frame: the first view says `fx=11` with
  `fxsteps=0000`. No key lights for it: with write off the grid is still sounds, and
  `held=100400` is the only sign on the keys. (The first working had `bar=0400` and
  `sounds=0`; the owner's PO-12 lights nothing for an effect, and §17 changed before any
  core ran this.)
- **The run.** Ticks 480, 576 and 672 arrive with the punch held: steps 5, 6 and 7 take
  effect 11 (`fxsteps=00e0`). The run begins at 480 on step 5, so sound 3's hit there
  fires at 480, 528, 576, 624, 672 and 720: six lines `trig 2 5`. Sound 1 is in the effects
  and has nothing on step 5, so it is silent through the run.
- **A sound outside the effects plays on.** Sound 2's own step 6 fires at 576 as usual,
  and comes before sound 3 in that tick: rising track order.
- **Letting go.** Both keys go up after tick 672: step 7 already holds the effect and
  finishes its hit at 720. The view at 7 still says `fx=11`: nothing is punched, and the
  playhead's step holds 11.
- **The replay is the performance.** The second pass gives the same lines 768 ticks later,
  until fx alone goes down in run step 13 (after tick 1248). Ticks 1344 and 1440 arrive
  with fx held and nothing punched: steps 6 and 7 are emptied, one at a time (`00a0` at the
  view in between, `0020` at the end). The run is cut to step 5: two hits, then sound 2
  alone at 1344.
- **Counts.** Sound 1 fires twice a pass: 6. Sound 2 once a pass: 3. Sound 3: 6, 2 and 2:
  10. 43 lines.
