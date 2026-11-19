# The engine interface

**Status:** decided by the owner 2026-11-19 (D17, D24, D25, D26). P2 passed on it in Session 2;
P6's ThreadSanitizer half ran on it in Session 3 and changed §8's hand-over (D43);
P7 added sound as ABI 2 (§11; D44). The owner accepted D42 to D45 the same day (D46). A failed proof reopens it. Written in Session 1. Building it found seven
places where the text did not say what happens; they are marked (D42) below.

The contract between the core and its two hosts. `core/include/pi_engine.h` is the same
contract in C; where the two disagree, this file is right and the header gets fixed.
`fixtures/` holds the traces an implementation must reproduce.

Scope of ABI 1: sequencing only. Sixteen tracks (D30) of sixteen trigger steps, swing, probability,
length, reset, the table clock and external clock edges. No sound, no keys, no patterns bank.

**ABI 2 (Session 3, D44; accepted, D46)** adds sound and changes nothing else: two arguments on
`pi_process`, one command (`SOUND`) and §11. Every trace, record and snapshot is as it was.

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
  ⚠ 2³² is not a multiple of 96, so at the wrap one step is 64 ticks long and the swing's
  odd and even start again. Once in 26 days of unbroken play at the fastest tempo; left as it
  is (D42).
- The **grid** is the clock's count of steps since reset. It runs whether or not the sequencer
  is playing. The **pattern step** (0 to 15) is the sequencer's playhead.
- Musical time is the tick number. A frame number never appears in a trace.

No float decides when anything happens. All arithmetic below is unsigned integers; the two
products that can pass 32 bits are done in 64.

## 3. One call

```
events_written = pi_process(engine, frames, cmds, ncmds, events, cap, audio, channels)
```

`audio` and `channels` are ABI 2's (§11). With `audio` null the call is ABI 1's.

For each frame `f` from 0 to `frames - 1`, in this order:

1. Apply every command whose `frame` is `f`, in array order.
2. Advance the clock by one frame (§4). Each tick it emits goes to the sequencer (§5) at once.
3. If sound was asked for: start the voice of every track that fired in 1 or 2, then write
   this frame's samples (§11).

So a command at frame `f` lands before any tick the clock produces at `f`. A `CLOCK` edge is
itself a command: its ticks are emitted when it is applied, in its place in the array.

Splitting the same frames and commands into different blocks must not change the events.

Total behaviour, no undefined cases:

- `frames` is at least 1. A call with 0 does nothing at all: its commands are not applied
  (D42). A command with `frame >= frames` is applied at the last frame.
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

- `TEMPO` changes `mbpm` (clamped to 30 000 to 300 000) and keeps `acc`. A command at frame
  `f` lands before the advance for `f`, so the new tempo already covers the stretch from
  `f - 1` to `f`: the phase can sit up to one frame from where a stopwatch would put it,
  once for each change. The same goes for `pi_set_sample_rate`. The trace cannot see it.
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
  `SOURCE` naming the source already in use is not a switch and changes nothing; a value
  that is neither source is ignored (D42). Why it matters: every fixture run sends `SOURCE`
  at frame 0, and a table clock that set `primed` there would lose tick 0's frame.

The host, not the core, turns a voltage into an edge (a Schmitt trigger) and ignores clock
edges for 1 ms after a reset, as Rack's guide asks.

### Reset

`RESET` sets `E = 0`, clears `have_edge`, `period`, `since`, `acc` and `primed`, and tells the
sequencer to start again (§5). On the table clock, tick 0 fires in the same frame. On edges,
tick 0 is the next edge. Reset does not touch the pattern, the tempo or the random generator.

## 5. The sequencer

Pattern: for each of 16 tracks, 16 steps, each `on` or off with a probability 0 to 100
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
    for track 0..15:
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
| 20 | `SOUND` | `a` track, `b` slider (0 = A, 1 = B), `value` 0 to 65535, clamped. ABI 2. Not in snapshot version 1 (§11) |
| 21 | `FIRE` | `a` track. ABI 2 (D45; accepted, D46). The track fires on this frame, playing or stopped: one `TRIG` with the latest tick and the playhead's step, and its voice. Changes no pattern, takes no draw |
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
- **The ABI is plain.** Only `uint32_t`, `int32_t` and pointers cross it: no float arguments,
  no 64-bit values, no structs by value, no callbacks. Sound crosses as a pointer to the
  host's own floats (§11); the core keeps no pointer after a call returns. In WebAssembly a pointer is an offset into the
  module's memory and the module imports nothing.
  In the browser and Node the host grows the module's memory by one page and puts the engine
  and both buffers there. Checked in Session 2: it works with no glue, the module imports
  nothing, and the engine (352 bytes), a snapshot, 256 events and 4 778 commands fit the page. With the
  drums the engine is 752 bytes; it still fits the 1 KiB the harness gives it. With all
  sixteen voices it is 1 416 bytes, and every host's fixed room for it is now 2 KiB (the
  harness, the worklet and the Rack Probe; `core/src/tests/rules.rs` holds `pi_size` to it).
  A host that can should ask `pi_size` instead.
- **One thread.** Every function on an engine is called from the audio thread only. That
  includes the ones that only read: `pi_save` on another thread while `pi_process` runs is a
  data race (P6 planted it and the sanitizer found it).

### The snapshot (answers O5)

A versioned binary block, written and read only by the core. Each host wraps it in whatever
it saves: Rack as a base64 string in the patch's JSON, the browser the same in its storage.
Why not one readable format: the core has no allocator and should not carry a JSON parser,
and one writer with one reader cannot drift. A readable export is a tool for later.

Version 1, 316 bytes, little-endian. (It was 100 bytes for four tracks until D30; nothing
had been built, so the number stays 1.)

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | magic: the bytes `P K I N` |
| 4 | 2 | version: 1 |
| 6 | 2 | kind: 1 (the rhythm instrument) |
| 8 | 4 | payload size: 300 |
| 12 | 4 | seed |
| 16 | 4 | tempo, thousandths of a bpm |
| 20 | 1 | length |
| 21 | 1 | swing |
| 22 | 2 | zero |
| 24 | 32 | steps: one u16 per track, bit `s` is step `s` |
| 56 | 256 | probability: track by track, one byte a step |
| 312 | 4 | CRC-32 (the zip one) of bytes 0 to 311 |

- **Saved:** the pattern, length, swing, tempo, seed. **Not saved:** the playhead, the tick
  count, whether it is playing, the clock source. Those belong to the moment and the host.
- **The seed** saved is the one the generator last started from: `pi_init`'s, or the last
  loaded snapshot's, after a 0 has been replaced (D42).
- **Load, in detail (D42).** The checks run in this order: under 12 bytes, `PI_ERR_SIZE`;
  magic, `PI_ERR_MAGIC`; any version but one this core has written (a newer one, or 0),
  `PI_ERR_VERSION`; under 316 bytes, `PI_ERR_SIZE`; kind, `PI_ERR_MAGIC`; payload size,
  `PI_ERR_SIZE`; CRC, `PI_ERR_CRC`. Bytes after the first 316 are the host's and are not
  read. A value no core writes but whose CRC is right (a length of 0, a probability of 200)
  is clamped, as it would be in a command. A load that succeeds moves `pi_generation`.
- **Load** checks magic, kind, size and CRC, and changes nothing if any is wrong. It replaces
  the pattern and settings, reseeds the random generator from the seed, and leaves the
  playhead and clock alone. So a snapshot loaded into a fresh engine gives the same trace as
  the engine that saved it did from its own start.
- **Versions.** Any change to the layout is a new version number. The core loads every
  version it has ever written and refuses a newer one.

### Saving while playing (what P6 tests)

`pi_generation()` returns a counter that changes whenever a command changes what a snapshot
would hold. The host's audio thread compares it after a block; when it has moved, it calls
`pi_save` into a buffer of its own and hands that buffer to the other thread. The saving
thread only ever reads a copy that was handed over; it never calls the core.

How it is handed over, and how a load comes back (D43; accepted, D46; P6 ran it under
ThreadSanitizer, `harness/race.cpp`). `rack/src/handoff.hpp` is this in C++:

- **Snapshots out: three buffers, not two.** The first draft said "two buffers and an atomic
  index". That is a data race: a reader still copying buffer A can have A written again by
  the second publish after the one it saw. ThreadSanitizer reports it at once. No torn
  snapshot was seen in ordinary runs, because the copy is 316 bytes and the reader would
  have to stall across two publishes; it is still wrong. With three buffers each thread
  owns one outright and they swap through the third with one atomic exchange.
- **Edits in: one queue, every edit, in order.** The other thread never calls `pi_process`.
  It queues commands; the audio thread gives them to its next block.
- **A load travels in that same queue,** as a marker among the edits, its bytes in a short
  queue beside it. On a channel of its own a load and an edit sent in one breath can arrive
  in the other order, and the edit is then loaded over. `pi_load` runs between blocks, so a
  load that finds edits ahead of it in the block waits for the next block: `pi_process`
  with no frames applies nothing (§3), so they cannot be flushed first.
- **A save can miss the last block's edits.** A snapshot holds what the audio thread had
  taken when it saved. A host that must know (an export, a test) publishes a count of the
  messages taken beside each snapshot and waits for it. A host whose audio thread is not
  running, such as a browser page before its first tap, has no snapshot newer than its last
  block and must not offer a save as if it had.
- In the browser the worklet posts the bytes in a message, at most a few a second. A
  message is a copy, so nothing is shared and none of the above can go wrong there.

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
| ~~Audio out~~ | ~~no voice yet~~ | Done in Session 3: §11, ABI 2, D44 |
| Eleven of the sixteen voices | P7 needed one; the minimum beat four more | each is a struct in `core/src/voice.rs` beside the others; no interface changes |
| The sliders in the snapshot | version 1 has no room and the keys that set them are not built | snapshot version 2, with the instrument |
| A master level, a limiter, a mute mask for D33's expander | nothing summed until the drums | the level is done (D48). A master volume, a level per track and the mute mask: with the instrument |
| Keys and sliders doing anything | the workflow is not confirmed on hardware | with the instrument, from `WORKFLOW.md` |
| Sixteen patterns, chains | scope to decide | snapshot version 2 |
| Parameter locks, step multiplier, effects | same | same |
| A command in the middle of a step, in a fixture | on edges, a flush is one indivisible burst, so the position cannot be matched | fixture format 2, with live recording |
| A tempo change inside a fixture | the harness would need to re-anchor its step frames, as it now does for a reset (`fixtures/README.md`) | when a fixture needs one. Until then the Rust rule tests cover it (`core/src/tests/rules.rs`) |

## 11. Sound (ABI 2; D44; accepted, D46)

Added in Session 3 for P7. The sequencer and the clock above are untouched: sound hangs off
the `TRIG` events they already make.

- **How it crosses.** `pi_process` takes `float *audio` and `uint32_t channels`. The host
  owns the buffer, `frames * channels` floats, frame by frame. The core writes it during the
  call and keeps no pointer. No float is passed as an argument or returned, so §8's rule
  stands and the WebAssembly side still needs no glue: the buffer is a `Float32Array` over
  the module's memory.
- **Layouts.** `channels` is 1 for the mix, or 16 for each track alone in its own channel
  (D33: Rack's sixteen-channel cable, and later the expander). Any other value, or a null
  buffer, is no sound: nothing is written and no voice runs.
- **Sound changes no event.** The trace, `pi_dropped`, the snapshot and `pi_generation` are
  the same with and without a buffer. A host that only sequences passes null and pays nothing.
- **Sample-accurate.** A track that fires on frame `f`, from the clock or from a flushed
  edge, sounds from frame `f` of the same call. A full event buffer does not silence it.
- **Level (D48).** Every voice leaves at a fixed 0.5 (−6 dB), so one alone is near 0.5 and
  the four drums together near 1.0 (1.07 at the worst measured). The mix is the plain sum
  of those, so it can still pass 1: a host scales (Rack: 5 V at 1.0), must not assume a
  ceiling, and bends what passes its own (tanh: the browser at 1.0, Rack towards 10 V).
- **The same bits on every host.** Voices use only `+ − × ÷` and conversions, each exactly
  rounded by IEEE 754, which WebAssembly and SSE2 both follow. There is no `sin` or `exp`
  from a maths library: the sine is a polynomial, the decay a multiply a frame, and pitch
  and length are integers until the last step. P7 measured it: the native render and the
  `.wasm` render are the same bytes. A voice that needs a library call gives this up.
- **A voice stops.** Below −80 dB its envelope is set to exactly 0 and it writes exact
  zeros: no denormals, and a silent voice costs one comparison.
- **The sliders.** `SOUND` sets slider A or B of a track, 0 to 65535 (the reserved `PARAM`
  command will become this, for the selected sound, when the keys are built: D26). A value
  is read when the voice is next triggered. A sounding voice keeps its pitch and length, in
  hertz and seconds, across `pi_set_sample_rate`.
- **Not saved yet.** Slider values are in the engine but not in snapshot version 1, and
  `SOUND` does not move `pi_generation`. They join the snapshot in version 2.
- **The first voice** is the click (key 10, track 9): a sine from 500 Hz to 2 kHz by slider
  A, falling 60 dB in 5 to 40 ms by slider B.
- **Then the minimum beat** (2026-11-19): the bass drum, snare, closed hat and open hat on
  tracks 0 to 3. What each is built as: `VOICES.md`, "As built". **Then the other eleven**
  (2026-11-19, Session 7): every track has a voice. All sixteen at once, every slider moved,
  peak at 1.7 (+4.6 dB, `harness/render-all.json`): past 1, as D48 allows. A voice keeps the slider values it was triggered with, so a rate change
  retunes it from those, never from sliders moved since.
- **Filters and noise** follow the same rule: a filter's coefficient is the polynomial sine
  and one division; noise is a generator of the voice's own, never the sequencer's.
