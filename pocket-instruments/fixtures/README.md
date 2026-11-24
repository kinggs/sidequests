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
- **keys-tap-and-choose, its views worked again for `ENGINE.md` §20 (Session 21, D75).**
  A view changed by an owner's decision, worked by hand from §20 and committed before any
  §20 code; not a trace edited to pass a build. The trace (`expect`) did not change, nor
  did any other fixture's line. Six view lines changed, only in `a=` and `b=`, and the
  `about` sentence that described the old rule. Why: a `PARAM` now sets that slider for
  all sixteen sounds, and choosing a sound moves no slider, so the view's bytes 20 to 23
  (the chosen sound's own A and B) are the hand's whichever sound is chosen.

  | View `at` | Was | Now | Why |
  |---|---|---|---|
  | 6 | `a=32768 b=32768` | `a=10000 b=32768` | key 8 chosen; A was moved to 10000 at step 4, for every sound |
  | 7 | `a=32768 b=65535` | `a=10000 b=65535` | key 4 chosen; its B moved to 65535, and A is still the hand's 10000 |
  | 10 | `a=32768 b=65535` | `a=10000 b=65535` | the same, key 4 still chosen |
  | 12 | `a=10000 b=32768` | `a=10000 b=65535` | key 1 chosen again; B at step 7 went to 65535 for every sound |
  | 13 | `a=10000 b=32768` | `a=10000 b=65535` | the same |
  | 15 | `a=10000 b=32768` | `a=10000 b=65535` | the same |

  Unchanged, and checked: the views at 1, 4 and 5 (before and at the only A move, key 1
  chosen). `keys-bpm-family` moves the sliders only with bpm held (swing and tempo, which
  §20 leaves as they were); `keys-write-a-beat` and both format 3 fixtures move no slider,
  so every sound's own A and B stay 32768 and their views are the same lines. No render
  scenario sends `param`: they set sliders by `SOUND` and steps by `STEP`, which keeps
  nothing, so every step still plays its sound's own values.
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

## Format 3, and `designed/` (Session 15: the effects; built in Session 16)

**Session 16:** both fixtures below were moved up out of `designed/`, unchanged (git shows
each as a rename with no change), and only then run. Both passed at the first run on all
three harnesses. `designed/` is empty until the next session that designs ahead of a core.
(Session 25 is the next: `designed/fx-repeat-holds`, below.) **Session 26** moved it up the
same way, unchanged, and it passed at the first run on all three harnesses; `designed/` is
empty again.
The Rack self-tests left format 3 out until Session 18; since then the Rhythm module plays
both format 3 fixtures on both clocks and holds its FX GATES to each view's `fx=`
(`rack/rhythm.jq`, `rack/selftest.sh`). Since Session 16,
`snapshots-v2.txt` sits beside `snapshots-v1.txt`: each of the seven older fixtures'
version 2 snapshot, written by the ABI 5 core before version 3 existed, loaded in
`core/src/tests/fixtures.rs` against the fixture's trace.

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
  core ran this.) (Session 20: still nothing lights for the effect, but with write off the
  field now shows the chosen sound's steps, so every view here says `field=0011`, sound 1's
  steps 1 and 5. Below, "The views worked again for the write-off row".)
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

### `fx-repeat-swing`, worked by hand (Session 16)

Written from `ENGINE.md` §17 and §5 with no engine and no model, before any code of §17
existed, and committed first. Every tick, draw and count was typed in. Length 8, swing 24,
so a pass is 768 ticks and odd grid steps play 24 ticks late. Numbers below are the trace's:
track and step from 0. The lane comes from four `fx` edits at step 0, so the "from a
snapshot" run holds it to snapshot version 3 as well.

- **The run's own grid.** Steps 1 to 4 hold effect 10, period 128. The run begins at the
  boundary of step 1 (tick 96, grid step 1). Hits at 96, 224 and 352: inside steps 1, 2 and
  3. Tick 480 is the next one, and step 5 arrives on it with an empty lane, so four steps
  hold three hits. Each carries the run's column, 1 (`224 trig 2 1` while the playhead is
  on 2).
- **Unswung.** Grid step 1 is odd: a plain hit there would be at 120. The run's first is at
  96. Track 1 is out of the effects and plays its own step 3 swung, at 312; after the run,
  track 2's step 5 is swung too, at 504: the beat comes back in place.
- **In the effects, its own steps are silent.** Track 0 has step 2 on; it never fires.
- **The draws.** Track 0's step 1 is at probability 70 and is the only step that draws.
  Each repeated hit draws once, in track order, before track 2 in the same tick. From seed
  1: 270369 (69, fires at 96), 67634689 (89, not at 224), 2647435461 (61, fires at 352);
  in the second pass the run begins again at 864: 307599695 (95, not), 2398689233 (33,
  fires at 992), 745495504 (4, fires at 1120). A core that drew once a step, or not at all
  for a repeat, gives other lines.
- **Counts.** Track 0: 0, 96, 352, 768, 992, 1120: 6. Track 1: 312, 1080: 2. Track 2: four
  a pass: 8. 32 lines. The view in step 2 says `fx=10` (nothing punched; the playhead's step
  holds 10) and `fxsteps=001e`; the last, on step 7, `fx=0`.

## `fx-repeat-holds`, worked by hand (Session 25: the repeat's new rule, D90 item 1, D91; in `designed/` until Session 26)

Was in `designed/`: no harness read it until Session 26 built the rule and moved it up,
unchanged (a rename with no change). It passed at the first run: Rust, C++ and Node, both
sources, three rates, three block sizes, and from a snapshot; the 300 older runs of the
report and all 408 render files stayed the same bytes. From `ENGINE.md` §17, "Designed 2026-11-24", and §5. Every tick, column and
count was typed in; the generator's ninth and tenth draws were computed (§5's three lines),
as the first eight were for `probability-seed-1`. Length 8, no swing; the lane by `fx`
edits at step 0, so the "from a snapshot" run holds it too. Numbers are the trace's: track
and step from 0. **No older fixture changes:** both older runs begin on a step that has a
note, where the new rule and the old agree.

- **Across the wrap, to a step not yet played.** Steps 0 and 1 hold effect 11 (48 ticks).
  The run begins at tick 0 on step 0, which is empty. Looking back: 0, then 7, then 6,
  where track 0 is on. So the run holds column 6 and fires at 0, 48, 96 and 144, each line
  `trig 0 6`, though step 6 itself does not arrive until tick 576.
- **A step under 100 counts, and draws at each hit.** Track 0's step 6 is at 70. Draws from
  seed 1, `% 100`: 69 fires (0), 89 not (48), 61 fires (96), 95 not (144); the step's own
  plain hit at 576 draws 33 and fires. Second pass: 4 fires (768), 82 not (816), 10 fires
  (864), 29 fires (912), and 32 fires at 1344.
- **A sound out of the effects does not count.** Steps 4 and 5 hold effect 12 (64 ticks).
  The run begins at 384 on step 4, empty. Step 3 has only track 1, which is out of the
  effects; step 2 has track 2. Column 2: `trig 2 2` at 384, 448 and 512. Tick 576 would be
  the next and step 6 arrives on it with an empty lane, so two steps hold three hits.
  Track 1 plays its own step 3 at 288 throughout.
- **Two repeats, two looks.** 11 and 12 are separate runs here with dry steps between; each
  holds what is behind its own first step (columns 6 and 2).
- **The third pass, edited as it plays.** At run step 16 track 0's step 6 goes off, on the
  frame of tick 1536 and before it (an edit lands before the clock moves). The first run
  now looks back 0, 7, 6, 5, 4, 3 (track 1 only), 2: column 2, across the wrap. Four lines
  `trig 2 2`, at 1536 to 1680, and track 2's own step at 1728. At run step 20 track 2's
  step 2 goes off the same way: the second run finds no sound in the effects on anywhere,
  holds its own step 4 and is silent. Nothing fires on step 6 at 2112.
- **Counts.** 24 `step` lines. Track 0: 0, 96, 576, 768, 864, 912, 1344: 7. Track 1: 3.
  Track 2: four a pass for two passes, then five: 13. 47 lines.
- **Views.** `fxsteps=0033` (steps 0, 1, 4, 5) and `fxsounds=fffd` throughout. At 1: `fx=11`,
  `field=0040` (sound 1 chosen, on step 7), `fires=2`. At 5: `fx=12`, `fires=2,1,4`. At 23:
  `fx=0`, `field=0000` (its step went off), `fires=7,3,13`.

**Checked, after it was written:** a scratch copy of the core with the rule in (twenty
lines of `seq.rs`, not kept) passed this fixture at the first run, on both sources, three
rates, three block sizes and from a snapshot; the core as it is failed it. That is a check
of the working, not where the trace came from.

## The views worked again for the write-off row (Session 20; D71, D72 item 3, D82)

A view changed by an owner's decision, as Session 21's were: worked by hand from
`ENGINE.md` §14's changed table and committed before any code of Session 20; not a trace
edited to pass a build. The write-off row (write off, and none of bpm, sound or pattern
held) was `field none, stitch none, bar none, sounds yes`; it is now the chosen sound's
steps in `field`, the rest the same. Every view of every fixture was checked against the
row: sixteen lines in four fixtures take it, and twelve of them change, in `field=` only.
No `expect` line changed, no `about`, and nothing else on any view line. `keys-bpm-family`
and `keeps-what-it-was-written-with` have write on in every view, and the views taken with
bpm, sound or pattern held take an earlier row, so none of those moved.

| Fixture | View `at` | Was | Now | Why |
|---|---|---|---|---|
| `fx-repeat-punch` | 4, 7, 14, 23 | `field=0000` | `field=0011` | sound 1 chosen (from `pi_init`), on steps 1 and 5 (the trace's 0 and 4) by the step-0 edits; nothing changes a step after |
| `fx-repeat-swing` | 2, 15 | `field=0000` | `field=0007` | sound 1 chosen, on steps 1, 2 and 3 by the step-0 edits; step 2's probability of 70 does not change that it is on |
| `keys-tap-and-choose` | 7, 10 | `field=0000` | `field=0004` | key 4 chosen (sound + key 4 at run step 7); track 3 has step 3 (the trace's 2) from the step-0 edit; taps with write off set nothing |
| `keys-write-a-beat` | 11, 15, 27, 31 | `field=0000` | `field=1010` | the snare (key 2) chosen since run step 7, on steps 5 and 13 (bits 4 and 12): step 6 went on at run step 8 and off at 9. View 31 is stopped and still takes the row |

Unchanged, and checked: `keys-tap-and-choose` at 1, 4, 12 and 15 take the row with sound 1
chosen, which has no step, so `field=0000` is still the working (5, 6 and 13 hold sound or
pattern and take earlier rows). The stitch stays `0000` on all sixteen, though other sounds
have steps (`keys-write-a-beat`'s kick and hat, `fx-repeat-punch`'s sounds 2 and 3): D82
item 3. `sounds=1` stays on all sixteen: the grid is still sounds, so a key still goes
white as its own sound fires.

## Format 4 (2026-11-23: the sliders, D75; built in Session 21)

Format 3, and:

| Field | Meaning |
|---|---|
| `format` | 4 |
| `commands` | also `keep` (`track`, `step`, `a`, `b`): `ENGINE.md` §20's edit |
| `views` | format 3's line with ` ea=<A> eb=<B>` on its end: the values the chosen sound was last hit with (the view's bytes 60 to 63) |

From a snapshot, a `keep` at step 0 comes from the snapshot (version 4), like every other
step-0 edit.

**Session 21:** the fixture below was moved up out of `designed/` unchanged (git shows a
pure rename) and only then run: it passed at the first run in all three harnesses, both
sources, three rates, three block sizes and from a snapshot. `designed/` is empty again.
Since Session 21, `snapshots-v3.txt` sits beside the other two: each of the nine fixtures'
version 3 snapshot, written by the ABI 7 core before version 4 existed and committed first,
loaded in `core/src/tests/fixtures.rs` against the fixture's trace (each step that is on
keeping its sound's own A and B, as D75 item 6 asks).

**From a kept snapshot (Session 21).** Every harness also runs each fixture, on both
sources at three rates, from its snapshot with every step that is on keeping its sound's
own A and B (a `KEEP` sent for each, then saved): the bytes a page or a module saves when
the same beat is entered by keys. The report labels the run `# <name> <source> <rate> kept
snapshot <hex>`, so P6's browser check (`web/play.mjs`) finds the page's bytes there. That
is 300 runs a harness, from 216 (nine fixtures, four runs a source and rate) before the
session.

### `keeps-what-it-was-written-with`, worked by hand (in `designed/` until Session 21)

From `ENGINE.md` §20 with no engine. Write is on throughout, so the grid's field is the
chosen sound's steps in every view whatever D71 does to the write-off row.

- A slider sets all sixteen sounds, so `a=` and `b=` are the hand's: 10000 then 50000 for
  A, 32768 then 20000 for B.
- Key 1 lands after A is 10000: step 1 keeps (10000, 32768). Key 5 lands after A is 50000:
  step 5 keeps (50000, 32768). B moves to 20000 after both, so neither step keeps it.
- A key in write mode makes no sound: `fires` is all zero until play, and with no hit yet
  `ea` and `eb` are the sound's own values, which are the hand's.
- The play edit lands on run step 4, so tick 384 is `step 0`. Step 1 fires there with what
  it kept: `a=50000 b=20000` beside `ea=10000 eb=32768`. Step 5 fires at tick 768:
  `ea=50000 eb=32768`. Eight lines of trace, two of them hits.

## `weave-views.txt` (Session 14: the weave, `ENGINE.md` §16)

Not a fixture of the engine: a set of 60 view blocks for `pi_weave`, which takes a view and
no engine. A line is a name, `pi_weave`'s flags (1: reduced motion) and the view's 64 bytes
in hex. Each was made by setting the fields the weave reads (the tick, flags 0 and 3, the
swing, bytes 48 to 54), not by playing. Rust's tests, `harness --weave` and the Node harness
each weave every line and write the cells as text, a digit a cell, and `make test` holds the
three files (`target/weave-rust.txt`, `-cpp.txt`, `-node.txt`) to the same bytes: natively
and from the `.wasm`, the same cells.

It holds no expected cells, on purpose. The weave is a first attempt the owner has not
accepted (D84), so there is no picture to hold to yet; when there is, three views and their
cells are committed beside this file (`PLAN.md`, Session 14's fourth box). The rules
themselves are tested in `core/src/tests/weave.rs`.

## `harness/render-loop.json` rendered again (Session 24: ABI 11, D87, D88)

Not a fixture with a trace, and no trace or view here moved. Its 18 and 50 channel renders
(24 files: both clocks, three rates, native and `.wasm`) are new bytes, on purpose: the
harnesses give every input channel numbers, channel 17 among them, and since ABI 11 channel
17 is FX RETURN, read on every frame and added to the mix, where until then it was read only
while an effect crossed over to it. Two commands were added to the scenario so the insert
is rendered too: `ROUTE` 4 for effect 4 from the start, and for the distortion in bar 2.
Every other render file, its mix-only renders included, and the report are the same bytes
as before the session. What the loop's mix must be is held by the model in
`core/src/tests/route.rs`; these files hold native and `.wasm` to the same bits.

## The effects' render files rendered again (Session 26: ABI 12, D90, D91)

No trace or view moved: the report's 300 older runs are the same bytes. 120 render files
are new bytes, on purpose, because §18's effects were retuned (`ENGINE.md`, "§18, designed
2026-11-24"):

- **The seven `render-fx-*` pairs** (84 files): each plays its effect throughout.
- **All 36 of `render-loop`'s** (its mix-only renders and its 18 and 50 channel ones): its
  lane holds effects 2, 5 and 6. ⚠ The build list named only the seven pairs; §18's "What
  must not move" says "with no effect in the lane", which this scenario's lane is not.
  Checked against a render by the old library: the first frame that differs is 30 000 at
  48 kHz, exactly step 5, where the lane's first effect 2 begins, and in the loop layouts
  only channel 16 (the mix) moves; the sixteen tracks and the send are the same bytes.

The other 288 render files are the same bytes as before the session. The old ones are not
kept: the ear and R64 to R69 are the measure of the new sound, not their bytes (§18).
