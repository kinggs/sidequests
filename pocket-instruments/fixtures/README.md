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

## Where the expected traces came from

Session 1 had no engine. The traces were produced by a throwaway model of `ENGINE.md`
(Python, about ninety lines, not kept) and checked two ways: the model gave the same trace on
both runs at all three sample rates, and the entries below were worked by hand.

That model already found one fault in the specification (the table clock's starting phase;
`ENGINE.md` §4). If Session 2's core disagrees with a trace, the specification decides, and
either the core or the trace gets fixed, with a note in `LEARNINGS.md`. A trace is never
edited just to make a build pass.

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
