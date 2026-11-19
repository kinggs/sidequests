# The engine interface

**Status:** decided by the owner 2026-11-19 (D17, D24, D25, D26). P2 and P6 test it; a failed
proof reopens it. Written in Session 1.

The contract between the core and its two hosts. `core/include/pi_engine.h` is the same
contract in C; where the two disagree, this file is right and the header gets fixed.
`fixtures/` holds the traces an implementation must reproduce.

Scope of ABI 1: sequencing only. Four tracks of sixteen trigger steps, swing, probability,
length, reset, the table clock and external clock edges. No sound, no keys, no patterns bank.

## 1. The shape

One engine is one clock feeding one sequencer, in memory the host provides.

```
host commands ──► clock ──ticks──► sequencer ──► events
                  (table or edges)  (pure in musical time)
```

- The **clock** turns host time (frames) into **ticks**. It has two sources: the table clock,
  which counts frames at a tempo, and external edges, which it follows.
- The **sequencer** never sees a frame. Its output depends only on the order of ticks and
  commands. That is why one trace holds at every sample rate, block size and clock source.

Why two layers: every difference between the hosts is in how time arrives. Keeping that in
one small layer leaves nothing below it for the hosts to disagree about.

## 2. Time

- A **step** is a sixteenth note. A step is **96 ticks** (`PI_TICKS_PER_STEP`), so 384 per
  quarter note. Why 96: it divides by 2, 3, 4, 6, 8 and 12, and at 300 bpm a tick is still
  longer than a frame at 44.1 kHz.
- Ticks are numbered from 0 at reset, in a `uint32_t` that wraps (about 26 days at 300 bpm).
  Tick `k` is tick `k % 96` of **grid step** `k / 96`.
- The **grid** is the clock's count of steps since reset. It runs whether or not the sequencer
  is playing. The **pattern step** (0 to 15) is the sequencer's playhead.
- Musical time is the tick number. A frame number never appears in a trace.

No float decides when anything happens. All arithmetic below is unsigned integers; the two
products that can pass 32 bits are done in 64.

## 3. One call

```
events_written = pi_process(engine, frames, cmds, ncmds, events, cap)
```

For each frame `f` from 0 to `frames - 1`, in this order:

1. Apply every command whose `frame` is `f`, in array order.
2. Advance the clock by one frame (§4). Each tick it emits goes to the sequencer (§5) at once.

So a command at frame `f` lands before any tick the clock produces at `f`. A `CLOCK` edge is
itself a command: its ticks are emitted when it is applied, in its place in the array.

Splitting the same frames and commands into different blocks must not change the events.

Total behaviour, no undefined cases:

- `frames` is at least 1. A command with `frame >= frames` is applied at the last frame.
- A command whose `frame` is lower than the one before it is applied at that earlier
  command's frame.
- An unknown command type is ignored. An index out of range (track, step) makes the command
  ignored. A magnitude out of range (swing, length, tempo) is clamped.
- When `events` is full, further events are dropped and counted (`pi_dropped`). A host passes
  room for at least `PI_EVENTS_MIN` (64). Fixture runs must end with the count at zero.

## 4. The clock

State: `E` (ticks emitted since reset), `source`, and per source:

- table: `mbpm` (tempo in thousandths of a bpm), `acc`, `primed`;
- edges: `have_edge`, `period` (frames between the last two edges, 0 for unknown), `since`
  (frames since the last edge).

### The table clock (`source = PI_SOURCE_TABLE`)

```
inc = mbpm * 4            thr = 625 * sample_rate

each frame:
  if not primed:  primed = true; tick()
  else:           acc += inc
                  while acc >= thr:  acc -= thr; tick()
```

Tick `k` after a reset at frame 0 falls on frame `ceil(k * thr / inc)`. Grid step `n` falls on
frame `ceil(n * sample_rate * 15000 / mbpm)`. There is no drift: the remainder stays in `acc`.

`primed` exists because of a bug the first draft had: it started `acc` at `thr - inc`, so
setting the tempo after a reset left the phase wrong by the difference. Tick 0 now fires on
the first frame whatever the tempo is.

- `TEMPO` changes `mbpm` (clamped to 30 000 to 300 000) and keeps `acc`.
- `pi_set_sample_rate` rescales: `acc = acc * new_rate / old_rate`, rounded down.

### External edges (`source = PI_SOURCE_EDGES`)

One edge is one step. This is what Rack sequencers expect of a clock. The hardware's own sync
pulse is a different convention and is not followed here (⚠ its rate is not in the guide, R23).

```
on CLOCK:
  if have_edge and since > 0:  period = since
  have_edge = true;  since = 0
  do tick() while E % 96 != 1          # finish the old step, then tick 0 of the new one

each frame, after the commands:
  if period != 0:
    want = min(95, since * 96 / period)
    while (E - 1) % 96 < want:  tick()
  since += 1                            # saturates
```

What this means (it answers O4):

- **Tick 0 of a step is the edge itself.** An unswung trigger leaves in the same frame as the
  edge arrives: no latency.
- **Between edges the clock interpolates**, using the period between the last two edges, as
  hardware does. Tick `t` falls `ceil(t * period / 96)` frames after the edge.
- **An early edge flushes.** Ticks not yet reached are emitted at once, in order, before the
  new step begins. A swung trigger that had not fired yet fires together with the next step.
- **A late or stopped clock holds** at tick 95. Nothing fires until the next edge.
- **Every tick is emitted exactly once, in order,** whatever the edges do. Frames decide only
  when. This is the property that makes the trace the same on both hosts.
- **The first step after a reset has no period yet.** Its ticks 1 to 95 are flushed by the
  second edge. Step 0 is never swung, so the first swung trigger (grid step 1) is on time.
- `CLOCK` is ignored while the source is the table. Switching source keeps `E`; switching to
  edges clears `have_edge` and `period`; switching to the table clears `acc` and sets `primed`.

The host, not the core, turns a voltage into an edge (a Schmitt trigger) and ignores clock
edges for 1 ms after a reset, as Rack's guide asks.

### Reset

`RESET` sets `E = 0`, clears `have_edge`, `period`, `since`, `acc` and `primed`, and tells the
sequencer to start again (§5). On the table clock, tick 0 fires in the same frame. On edges,
tick 0 is the next edge. Reset does not touch the pattern, the tempo or the random generator.

## 5. The sequencer

Pattern: for each of 4 tracks, 16 steps, each `on` or off with a probability 0 to 100
(default 100). Plus `length` (1 to 16, default 16) and `swing` (0 to 48 ticks, default 0).

State: `playing`, `fresh`, `cur` (pattern step), `pending`, `offset`.

```
tick k:   g = k / 96;  t = k % 96

  if t == 0 and playing:
    if fresh:  cur = 0; fresh = false
    else:      cur = (cur + 1 >= length) ? 0 : cur + 1
    emit STEP(cur)
    offset  = (g is odd) ? swing : 0
    pending = true

  if playing and pending and t == offset:
    pending = false
    for track 0..3:
      if on[track][cur]:
        p = prob[track][cur]
        if p >= 100 or draw() % 100 < p:  emit TRIG(track, cur)
```

- **Play.** `PLAY 1` while stopped sets `playing` and `fresh`: the pattern starts from step 0
  at the next step boundary. `PLAY 1` while playing does nothing. `PLAY 0` stops at once and
  cancels a pending trigger. The engine starts stopped; the host sends `PLAY`.
  To start at once on the table clock, send `RESET` then `PLAY` in the same frame.
- **Reset** sets `fresh` and clears `pending`. Playing stays as it was.
- **Swing follows the grid, not the pattern.** Odd grid steps are late by `swing` ticks. With
  an odd length the pattern drifts across the grid and the swing stays on the beat. `swing` is
  read at the step boundary; the step's contents are read when it fires.
- **Length** is read at each step boundary. Shortening it below the playhead sends the next
  step to 0.
- **Probability.** A step that is on with a probability under 100 takes exactly one draw, in
  track order, when it fires. A probability of 0 takes its draw and never fires. One rule, so
  the draw sequence is easy to follow by hand.
- **The random generator** is xorshift32: `x ^= x << 13; x ^= x >> 17; x ^= x << 5` on 32
  bits. The draw is the new `x`. The seed comes from `pi_init`; a seed of 0 becomes
  `0x9E3779B9`. From seed 1 the first draws are 270369, 67634689, 2647435461, 307599695.

## 6. Commands

One fixed record, 12 bytes, little-endian, no padding:

| Field | Type | Meaning |
|---|---|---|
| `frame` | u32 | offset in this block |
| `type` | u8 | below |
| `a`, `b` | u8, u8 | small arguments |
| `slot` | u8 | which instrument on the table. Always 0 in ABI 1 (§9) |
| `value` | u32 | the value |

| Type | Name | Arguments |
|---|---|---|
| 1 | `CLOCK` | none. One edge, one step |
| 2 | `RESET` | none |
| 3 | `SOURCE` | `value`: 0 table, 1 edges |
| 4 | `TEMPO` | `value`: thousandths of a bpm |
| 5 | `PLAY` | `value`: 0 stop, 1 play |
| 16 | `STEP` | `a` track, `b` step, `value` 0 or 1 |
| 17 | `PROB` | `a` track, `b` step, `value` 0 to 100 |
| 18 | `SWING` | `value` 0 to 48 |
| 19 | `LENGTH` | `value` 1 to 16 |
| 32 | `KEY_DOWN` | `a` key. Reserved: ignored in ABI 1 |
| 33 | `KEY_UP` | `a` key. Reserved |
| 34 | `PARAM` | `a` slider (0 = A, 1 = B), `value` 0 to 65535. Reserved |

Two families, on purpose (D26). **Edits** (16 to 19) say what the pattern becomes. **Keys**
(32 to 34) say what a finger did; the workflow in `WORKFLOW.md` will turn them into edits
inside the core, so both hosts get the same behaviour (D22, D23). The proofs use edits only:
the sequencer's fixtures then stay true however the workflow is settled.

Key numbers, fixed now so hosts can map to them: 0 to 15 the grid, 16 sound, 17 pattern,
18 bpm, 19 function, 20 fx, 21 play, 22 write (D21's names).

## 7. Events

One fixed record, 12 bytes:

| Field | Type | Meaning |
|---|---|---|
| `frame` | u32 | offset in this block. For the host's timing only |
| `tick` | u32 | ticks since reset. The musical time |
| `type` | u8 | 1 `STEP`, 2 `TRIG` |
| `track` | u8 | `TRIG`: the track. `STEP`: 0 |
| `step` | u8 | the pattern step |
| `slot` | u8 | always 0 in ABI 1 |

`STEP` is the playhead arriving on a step, at the step boundary, never swung: it is for the
display. `TRIG` is a sound firing; a host makes a pulse or starts a voice from it. Within one
tick: `STEP` first, then `TRIG` by rising track.

**The trace** is the events as text, one per line, `\n` after each, frames left out:

```
<tick> step <step>
<tick> trig <track> <step>
```

Two runs agree when their traces are the same bytes.

## 8. Memory, threads and the snapshot

- **The caller owns the memory.** `pi_size()` and `pi_align()` say what to provide;
  `pi_init` builds an engine in it. No allocator, no globals, any number of engines.
- **The ABI is plain.** Only `uint32_t`, `int32_t` and pointers cross it: no floats, no 64-bit
  values, no structs by value, no callbacks. In WebAssembly a pointer is an offset into the
  module's memory and the module imports nothing.
  ⚠ Proposed for the browser and Node: the host grows the module's memory by one page and
  puts the engine and both buffers there. Session 2 checks this works with no glue (P1, P2).
- **One thread.** Every function on an engine is called from the audio thread only.

### The snapshot (answers O5)

A versioned binary block, written and read only by the core. Each host wraps it in whatever
it saves: Rack as a base64 string in the patch's JSON, the browser the same in its storage.
Why not one readable format: the core has no allocator and should not carry a JSON parser,
and one writer with one reader cannot drift. A readable export is a tool for later.

Version 1, 100 bytes, little-endian:

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | magic: the bytes `P K I N` |
| 4 | 2 | version: 1 |
| 6 | 2 | kind: 1 (the rhythm instrument) |
| 8 | 4 | payload size: 84 |
| 12 | 4 | seed |
| 16 | 4 | tempo, thousandths of a bpm |
| 20 | 1 | length |
| 21 | 1 | swing |
| 22 | 2 | zero |
| 24 | 8 | steps: one u16 per track, bit `s` is step `s` |
| 32 | 64 | probability: track by track, one byte a step |
| 96 | 4 | CRC-32 (the zip one) of bytes 0 to 95 |

- **Saved:** the pattern, length, swing, tempo, seed. **Not saved:** the playhead, the tick
  count, whether it is playing, the clock source. Those belong to the moment and the host.
- **Load** checks magic, kind, size and CRC, and changes nothing if any is wrong. It replaces
  the pattern and settings, reseeds the random generator from the seed, and leaves the
  playhead and clock alone. So a snapshot loaded into a fresh engine gives the same trace as
  the engine that saved it did from its own start.
- **Versions.** Any change to the layout is a new version number. The core loads every
  version it has ever written and refuses a newer one.

### Saving while playing (what P6 tests)

`pi_generation()` returns a counter that changes whenever a command changes what a snapshot
would hold. The host's audio thread compares it after a block; when it has moved, it calls
`pi_save` into a spare buffer and publishes that buffer to the other thread (in Rack: two
buffers and an atomic index; in the browser: a message from the worklet, at most a few a
second). The saving thread only ever reads a published copy. Loading goes the other way: the
bytes are queued to the audio thread, which calls `pi_load` between blocks.

## 9. The table, in the browser

The table is the clock in §4 on its table source. It owns the tempo, the grid and reset.
Every instrument on it gets the same ticks, so they are in time by construction, and their
swing agrees because swing follows the grid. An instrument owns its pattern, its swing and
whether it is playing.

Host policy, not the core's: when nothing on the table is playing, pressing play sends
`RESET` and `PLAY` together, so the first instrument starts at once.

ABI 1 is a table of one: one engine, one instrument. That is all the first instrument needs
(README rule 5). The `slot` byte is in both records so that a table of several instruments
adds a slot count to `pi_size` and `pi_init` and changes neither record.

In Rack each module is its own table: on edges when CLOCK is patched, on its own tempo when
it is not, as the hardware runs alone.

## 10. What is left out, and where it goes

| Not here | Because | When |
|---|---|---|
| Audio out | no voice yet | P7 adds a `float *` to `pi_process`; ABI 2 |
| Keys and sliders doing anything | the workflow is not confirmed on hardware | with the instrument, from `WORKFLOW.md` |
| Sixteen sounds, sixteen patterns, chains | D12 says two to four sounds; the rest is scope to decide | snapshot version 2 |
| Parameter locks, step multiplier, effects | same | same |
| A command in the middle of a step, in a fixture | on edges, a flush is one indivisible burst, so the position cannot be matched | fixture format 2, with live recording |
| Tempo changes and resets inside a fixture | the harness would need to re-anchor its step frames | a fourth fixture in Session 2, rule in `fixtures/README.md` |
