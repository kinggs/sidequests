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
`swing` (`value`), `length` (`value`). Commands with the same `at` are sent in file order.

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

Format 1 leaves two things out, because each would need the harness to re-anchor `F`:
a `reset` or `tempo` command after step 0, and a command placed inside a step. When a fixture
needs a reset, the rule is: steps after it are counted from the frame the reset landed on.

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
