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

**ABI 3 (Session 8, D50)** adds samples and changes nothing else: one function
(`pi_set_sample`), one command (`VOICE`) and §12. Every trace, record, snapshot and code
voice's render is as it was (108 of 108 renders from ABI 2's core, the same bytes).

**ABI 4 (Session 10, D51)** adds keys and the view and changes nothing else: commands 32 to
34 do what §13 says, one function (`pi_view`, §14), and the master volume on the mix. Every
trace and snapshot is as it was, and every render (volume starts at 16, which is × 1): the
four older fixtures and the 114 render pairs, the same bytes. Building it found eight places
where §13 and §14 did not say what happens; they are marked (D59) below.

**ABI 5 (Session 11, D55)** adds snapshot version 2 and a third audio layout and changes
nothing else: `pi_save` writes §15's 388 bytes, `pi_load` takes them and version 1's 316,
`SOUND`, `VOICE`, the volume and the chosen sound move the generation, and
`PI_AUDIO_BOTH` gives the tracks and the mix from one call. Every trace and every earlier
render is as it was (the 114 render pairs and the seven fixtures' traces and views, the
same bytes); only the snapshots' bytes differ, by the new fields at their starting values.

**ABI 6 (Session 16, D66, D67 item 1)** adds §17, the lane, the fx key and the four
repeats, and snapshot version 3, and changes nothing else: commands 23 `FX` and 24
`FXSOUND`, the view's bytes 55 to 59, `pi_save` writes 408 bytes and `pi_load` takes all
three versions. Every trace and view of the seven older fixtures and all 276 render files
are as they were; only the snapshots' bytes differ, by the new fields at their starting
values.

~~**Designed, not built (Session 15, D66 to D68):** §18 and §19 are the rest of the effects:
the bus and the first sound effects (§18), and sound coming in from Rack (§19). Sessions
17 and 18 build them (`PLAN.md`), each moving `PI_ABI_VERSION` by one, as the weave will
whenever it is built. (§17 was in this list until Session 16.)~~ Both are built: §18 in
Session 17 (ABI 7), §19 in Session 18 (ABI 9).

**ABI 9 (Session 18, D68, D76, D80)** adds §19, sound in, and changes nothing else: two
audio layouts that are read as well as written (`PI_AUDIO_LOOP`, 18 channels, and
`PI_AUDIO_LOOP_SLIDERS`, 50) and command 25 `ROUTE`. Every trace, view and snapshot and
every earlier render file is as it was (the report and all 372 render files, the same
bytes); in the three older layouts nothing is read in and `ROUTE` changes nothing heard.

**ABI 8 (Session 21, D75)** adds §20: the sliders are the hand's, for every sound, and a
step keeps what it was written with. Command 26 `KEEP`, `STEP` 0 forgets, `PARAM` sets all
sixteen sounds, the view's bytes 60 to 63, snapshot version 4 (1464 bytes; versions 1 to 3
still load). Every trace and every earlier render file is as it was. By the decision, six
view lines of `keys-tap-and-choose` changed (`fixtures/README.md`). (ABI 7, Session 17,
added §18's bus with no new call or command.) (§20 was "designed, not built" until then.)

**Designed, not built (Session 9, D51 to D57):** §16 is the rest of the instrument: the
weave. Session 14 builds it (`PLAN.md`) and moves `PI_ABI_VERSION` by one. Until then the
code does not do it. (§13 and §14 were in this list until Session 10 built them, §15 until
Session 11.)

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
| 22 | `VOICE` | `a` track, `value` 0 its code voice, 1 its sample. ABI 3 (D50). Taken at the track's next hit; a track with no sample plays its code voice. Not in snapshot version 1 (§12) |
| 32 | `KEY_DOWN` | `a` key. ABI 4: §13. (Reserved and ignored until then) |
| 33 | `KEY_UP` | `a` key. ABI 4: §13 |
| 34 | `PARAM` | `a` slider (0 = A, 1 = B), `value` 0 to 65535, clamped. ABI 4: §13. Since ABI 8, every sound's slider (§20) |

Two families, on purpose (D26). **Edits** (16 to 19) say what the pattern becomes. **Keys**
(32 to 34) say what a finger did; the workflow in `WORKFLOW.md` turns them into edits
inside the core (§13, since ABI 4), so both hosts get the same behaviour (D22, D23). The proofs use edits only:
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
  host's own floats (§11); the core keeps no pointer after a call returns, except a track's
  sample (§12, from ABI 3), which the host keeps alive. In WebAssembly a pointer is an offset into the
  module's memory and the module imports nothing.
  In the browser and Node the host grows the module's memory by one page and puts the engine
  and both buffers there. Checked in Session 2: it works with no glue, the module imports
  nothing, and the engine (352 bytes), a snapshot, 256 events and 4 778 commands fit the page. With the
  drums the engine is 752 bytes; it still fits the 1 KiB the harness gives it. With all
  sixteen voices it is 1 416 bytes, and every host's fixed room for it is now 2 KiB (the
  harness, the worklet and the Rack Probe; `core/src/tests/rules.rs` holds `pi_size` to it).
  With a sample beside each voice (§12) it is 2 328 bytes, natively and in WebAssembly, and
  the room is 4 KiB. With the keys (§13) it is 2 352 bytes, in the same room, and snapshot
  version 2 (§15) added nothing to it. With the lane and the repeats (§17) it is 2 400; with the bus (§18), 2 448; with what each step keeps (§20), 3 568, natively and in WebAssembly, still inside every host's 4 KiB (Session 21); with the routes and the slider outputs (§19), 3 704 (Session 18); with the weave's three fields (§16), 3 712 (Session 14). The samples
  themselves are in pages of their own after the host's.
  A host that can should ask `pi_size` instead.
- **One thread.** Every function on an engine is called from the audio thread only (`pi_weave`, §16, takes no engine, so any thread may call it). That
  includes the ones that only read: `pi_save` on another thread while `pi_process` runs is a
  data race (P6 planted it and the sanitizer found it).

### The snapshot (answers O5)

A versioned binary block, written and read only by the core. Each host wraps it in whatever
it saves: Rack as a base64 string in the patch's JSON, the browser the same in its storage.
Why not one readable format: the core has no allocator and should not carry a JSON parser,
and one writer with one reader cannot drift. A readable export is a tool for later.

Version 1, 316 bytes, little-endian. (It was 100 bytes for four tracks until D30; nothing
had been built, so the number stays 1.) Since ABI 5 the core writes version 2 (§15), which is
this table with more after it, and still loads this one.

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
  `PI_ERR_VERSION`; under 316 bytes (since §15: under that version's size), `PI_ERR_SIZE`;
  kind, `PI_ERR_MAGIC`; payload size,
  `PI_ERR_SIZE`; CRC, `PI_ERR_CRC`. Bytes after the first 316 (that version's size) are the host's and are not
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
  **Built (Session 12):** `web/worklet.js` with `instrument`: a snapshot when the
  generation has moved, at most four a second; a load as a marker in the queue with the
  keys, run between blocks; and beside each snapshot and view a count of queue entries
  taken, the count this section asks for. `make play` holds a snapshot saved while
  playing to the bytes the wasm host ran a fixture from (`PROOFS.md` P6).
  **Built in Rack (Session 13):** `rack/src/Rhythm.cpp` keeps the Probe's scheme: a
  snapshot out through `pi::Latest` when the generation moves, a load in through another,
  taken between frames. Its edits are not a queue: every key and slider is a Rack
  parameter, read by the audio thread each frame, so there is no queue to put a load in
  order with; the menu's edits do go through a `pi::Queue`. One addition: each saved
  snapshot carries the count of loads the audio thread had taken, and a save made before a
  load was taken writes the loaded bytes instead, so a patch saved straight after it was
  opened keeps its beat.

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
| ~~Keys and sliders doing anything~~ | ~~the workflow is not confirmed on hardware~~ | Done in Session 10: §13, ABI 4. Built from `WORKFLOW.md` as it stands (D29) |
| Sixteen patterns, chains | scope to decide | snapshot version 2 |
| Parameter locks, step multiplier, ~~effects~~ | same | same. Effects: designed in Session 15, §17 to §19 |
| A command in the middle of a step, in a fixture | on edges, a flush is one indivisible burst, so the position cannot be matched | with live recording: fixture format 3. (Format 2, Session 10, puts a key one frame after its step's boundary, no further) |
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
  (D33: Rack's sixteen-channel cable, and later the expander). Since ABI 5 also 17, both
  (`PI_AUDIO_BOTH`, §15). Since ABI 9 also 18 and 50, the loops, which are read as well
  (§19). Any other value, or a null
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
- **Not saved yet.** ~~Slider values are in the engine but not in snapshot version 1, and
  `SOUND` does not move `pi_generation`. They join the snapshot in version 2.~~ Overtaken in
  Session 11 (ABI 5): they are in version 2, and `SOUND` moves the generation when a value
  changes (§15).
- **The first voice** is the click (key 10, track 9): a sine from 500 Hz to 2 kHz by slider
  A, falling 60 dB in 5 to 40 ms by slider B.
- **Then the minimum beat** (2026-11-19): the bass drum, snare, closed hat and open hat on
  tracks 0 to 3. What each is built as: `VOICES.md`, "As built". **Then the other eleven**
  (2026-11-19, Session 7): every track has a voice. All sixteen at once, every slider moved,
  peak at 1.7 (+4.6 dB, `harness/render-all.json`): past 1, as D48 allows. A voice keeps the slider values it was triggered with, so a rate change
  retunes it from those, never from sliders moved since.
- **Filters and noise** follow the same rule: a filter's coefficient is the polynomial sine
  and one division; noise is a generator of the voice's own, never the sequencer's.

## 12. Samples (ABI 3; D50)

Added in Session 8. Each track can play a sample in place of its code voice.

- **How it crosses.** `pi_set_sample(engine, track, data, frames)`: `frames` 16-bit mono
  frames at 44.1 kHz (`PI_SAMPLE_RATE`), native byte order. The core keeps the pointer: the
  host keeps the data readable and unchanged until it sets that track's sample again or
  re-initialises the engine. Null or 0 frames clears it. It returns 1 if taken, 0 if cleared
  or refused (a track past 15, data not 2-byte aligned). A sample sounding stops at once,
  because the host may free the old data as soon as the call returns. `pi_init` starts with
  none.
- **Which plays.** Command 22, `VOICE`: per track, 0 code, 1 sample. All code at `pi_init`.
  Read when the track fires, like the sliders; a track switched to a sample it does not have
  plays its code voice. After a switch the old sound's tail plays out under the new one.
- **How it plays.** Read at 44.1 kHz times slider A's ratio (25 semitones, an octave either
  way, from an integer table), with a straight line between stored frames: `+ − × ÷` only,
  so the same bits everywhere, as §11 requires. Slider B: the whole sample from its middle
  up; less below, to the track's shortest code length at 0; then 60 dB in 10 ms. A rate
  change mid-sound keeps its pitch and its time in seconds. Level: the same fixed 0.5 as
  every voice (D48); a pack sample peaks at full scale, so near 0.5.
- **Not in the snapshot.** ~~Neither the samples nor the switch are in version 1. The switch
  joins the sliders in version 2;~~ the samples are the host's to load. Since Session 11
  (ABI 5) the switch is in version 2 (§15); the samples still are not.
- **Proven:** `core/src/tests/samples.rs`, and `harness/render-samples.json` (every track on
  its sample, half switched back mid-way) to the same bytes natively and from the `.wasm`.


## 13. Keys (ABI 4; designed in Session 9: D51, D52, D54; built in Session 10)

The reserved commands 32 to 34 come alive. The core holds the workflow (`WORKFLOW.md`), so a
press means the same on both hosts, and tells them what to light (§14). A host sends what a
finger did and draws what it is told. Edits (16 to 22) still work beside keys and show in
the view like any other change.

State, all in the engine: `held` (one bit a key, 0 to 22), `write` (off at `pi_init`), the
chosen sound (track 0 at `pi_init`), `volume` (1 to 16; 16 at `pi_init`), and whether
anything has used the bpm key since it went down.

Total behaviour: a key number past 22 is ignored; `KEY_DOWN` on a key already held and
`KEY_UP` on one not held are ignored (a keyboard repeats). A `PARAM` for a slider that is
neither A nor B is ignored (D59).

**Using bpm (D59).** "Uses bpm" below means: a grid key pressed, or a slider moved, while
bpm is down, whether or not the value it sets is a new one. Not a use: another function
key pressed while bpm is down, and a `PARAM` equal to the shown value (it is nothing at
all). A new press of bpm starts unused.

**`KEY_DOWN` on grid key *n*.** The first row that applies, in this order:

| When | It does |
|---|---|
| bpm is held | `volume` becomes *n* + 1. Uses bpm |
| sound is held | the chosen sound becomes track *n*, and it fires as `FIRE` does ⚠ |
| pattern, fx or function is held | nothing (later rows of `WORKFLOW.md`). Designed, not built: fx held punches an effect (§17) |
| write is on | step *n* of the chosen sound flips, as `STEP` would. No sound |
| otherwise | track *n* fires, as `FIRE` does. The chosen sound does not change |

**`KEY_DOWN` on a function key.**

| Key | It does |
|---|---|
| play | Stopped: on the table clock, `RESET` then `PLAY 1` (it starts on this frame, from step 1; §9's host policy moves here); on edges, `PLAY 1` alone (step 1 at the next edge). Playing: `PLAY 0` |
| write | flips `write`, on the press |
| pattern | with function held: clears the pattern. Every track's steps go off and every probability back to 100. Length, swing, tempo, sliders and volume stay. Otherwise only held |
| sound, bpm, function, fx | only held |

Play and write act whatever else is held. Clear is function, then pattern, in that order:
pattern first and then function is two keys held (D59).

**`KEY_UP`.** The key is no longer held. If it is bpm and nothing used it while it was down,
the tempo moves to the next preset: the lowest of 80, 120 and 140 bpm above the tempo now,
or 80 if there is none. At once ⚠.

**`PARAM`** (`a` 0 = slider A, 1 = B; `value` 0 to 65535, clamped):

| When | It does |
|---|---|
| its value is the one the view shows for that slider now (§14) | nothing. This is what lets a host move a cap to follow the view without an echo |
| bpm is held | A: swing = `(value × 48 + 32767) / 65535`. B: tempo = 60 + `(value × 180 + 32767) / 65535` whole bpm. Uses bpm |
| otherwise | ~~`SOUND` on the chosen sound: that slider, that value~~ Since ABI 8 (§20, D75): `SOUND` on all sixteen sounds, that slider, that value |

A slider is read when its voice is next hit and never moves one that is sounding (§11;
ruled in D56).

**Volume.** The mix is multiplied by `(volume / 16)²` after the sum. At 16 that is × 1, so
every render made before ABI 4 is the same bytes. The sixteen track channels are not
scaled: they are the direct outputs, before the master, as on a drum machine (D57).

**Generation.** A key or slider moves `pi_generation` when it changes something a snapshot
holds (§15), and not otherwise: a tap, a hold, play and write do not.
~~**In ABI 4 that is snapshot version 1 (D59):** a step, clear, swing and the tempo move it;
the volume, the chosen sound and a sound's sliders do not until Session 11 puts them in
version 2.~~ Overtaken in Session 11 (ABI 5): version 2 holds those three, so they move it
too, each only when its value changes. A rule test holds it to exactly that: over 20 000
random presses the generation moves on the ones that change the snapshot's bytes and on no
others. It passed unchanged on version 2.

⚠ marks the plainest reading where the guide and the search are silent (D29): whether
choosing a sound plays it, whether bpm acts on release, whether a tempo change is at once.
Each is one line in `core/src/keys.rs` and one row in `WORKFLOW.md`.

**Built (Session 10):** `core/src/keys.rs`. Every press goes through the same function as
a host's edit, so "as `STEP` would" and "as `FIRE` does" are literally that. Proven by
`fixtures/keys-*.json` (worked by hand before the code; all three passed at the first run,
on all three harnesses) and `core/src/tests/keys.rs`, a test for each row above.

## 14. The view (ABI 4; designed in Session 9: D51; built in Session 10; the write-off row changed in Session 20, D82)

```
bytes = pi_view(engine, buf, cap)        /* PI_VIEW_SIZE (64), or 0 if cap is too small */
```

Everything a host draws, as one fixed block. Called on the audio thread like every other
function on an engine (§8). It moves nothing: not the generation, not a counter.

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | tick: the latest tick emitted, 0 before any |
| 4 | 4 | tempo, thousandths of a bpm |
| 8 | 4 | held: bit *k* is key *k* down |
| 12 | 2 | field: bit *n* lights key *n*'s face |
| 14 | 2 | stitch: bit *n* puts the corner stitch on key *n* |
| 16 | 2 | bar: bit *n* puts the bar on key *n* |
| 18 | 2 | sampled: bit *t*, track *t* plays its sample (D50) |
| 20 | 2 | slider A as it should show, 0 to 65535 |
| 22 | 2 | slider B as it should show |
| 24 | 1 | flags: bit 0 playing; 1 write; 2 the source is edges; 3 a step has played since play (the next byte means something; exactly when, below); 4 the grid is sounds |
| 25 | 1 | the playhead's step, 0 to 15 |
| 26 | 1 | the chosen sound |
| 27 | 1 | volume, 1 to 16 |
| 28 | 1 | length |
| 29 | 1 | swing |
| 30 | 2 | zero |
| 32 | 16 | fires: for each track, how many times it has fired, wrapping at 256 |
| 48 | 16 | zero until §16 (since ABI 6, 55 to 59 are §17's; since ABI 8, 60 to 63 are §20's; since ABI 10, 48 to 54 are §16's: steps woven, a u32; which of the last sixteen had a sound set, a u16; tracks fired on this step, a u8) |

**What the grid shows** (`design/DESIGN.md`; D37, extended by D51 to the held keys). The
first row that applies:

| When | field | stitch | bar | grid is sounds |
|---|---|---|---|---|
| bpm held | keys 1 to `volume` | none | none | no |
| sound held | none | none | the chosen sound | yes |
| pattern held | none | none | key 1 (the one pattern) | no |
| write on | the chosen sound's steps | steps of any other sound | none | no |
| write off | the chosen sound's steps (D82; was none) | none | none | yes |

**The write-off row, changed 2026-11-23 (D71, D72 item 3, D82; built in Session 20).** It
was `none | none | none | yes`: D37 guessed from a search that the hardware's fields are dark
with write off. The owner's PO-12 lights the chosen sound's steps in both modes (D71), so the
field is now the chosen sound's steps whether write is on or off. Still no stitch and no bar
(D82 item 3: the stitch is ours, for editing), and the grid is still sounds, so every key
goes white as its own sound fires and the frame marks the playhead, as before. A field key
that fires goes white for its half step and comes back lit (D82 item 4): the host's rule for
white below already says so. The other four rows did not change.

**Flag 3, exactly (D59):** set when the first step arrives after play, or after a reset
while playing; clear from play or reset until that step, and clear whenever the sequencer
is stopped. On the table clock the step arrives in the frame of the play or the reset, so
only an external clock ever shows the gap. Stopped, there is no playhead: play always
starts from step 1 (`WORKFLOW.md`), so there is no place to show.

**Field and stitch can share a key (D59):** the stitch is every other sound's steps,
whether or not the chosen sound has that step too (`design/DESIGN.md`: "dark on ecru").

**`fires` (D59):** every firing counts, the sequencer's and a tap's, whether or not its
event found room in the buffer. Nothing ever sets a count back: not reset, not play.

**The sliders as shown:** with bpm held, A is `swing × 65535 / 48` and B is
`(bpm − 60) × 65535 / 180`, the tempo taken in whole bpm and held to 60 to 240.
"Whole bpm" is rounded down (D59): 97.5 bpm shows as 97. Every division here rounds down. Otherwise
the chosen sound's own A and B. `PARAM` with a shown value changes nothing (§13), so the
two directions cannot drift.

**What a host does with it, and nothing more:**

- Lights each grid key from the three masks. Frame: on the playhead's key while flags 0 and
  3 are set. White: the key is in `held`; or, while the grid is sounds, track *n*'s `fires`
  has moved since the host last looked (it holds the white for half a step at the view's
  tempo, between 40 and 120 ms).
- Function keys: pressed while in `held`; play lit while playing, write while write is on.
- Moves a slider's cap to its shown value unless a finger is on it.
- Hands it on when anything past the first four bytes has changed, and at least sixty
  times a second while playing. Rack: `pi::Latest` (§8). The worklet: a message.
- Counters, not flags, for firing: a host that misses a view loses nothing, and reading
  one clears nothing.

**As text**, for fixtures: one line, the tick and bytes 48 to 63 left out, masks (four
digits) and `held` (six) in lowercase hex, `step` (0 to 15) a dash when flag 3 is clear,
`sel` 0 to 15, `fires` as sixteen numbers:

```
view play=1 write=1 edges=0 sounds=0 step=4 sel=0 vol=16 tempo=120000 len=16 swing=0 held=000000 field=1111 stitch=0404 bar=0000 sampled=0000 a=32768 b=32768 fires=2,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0
```

`edges` is the one field that differs between a fixture's two runs: a fixture's text is the
table run's, and the edges run expects `edges=1` in its place (D59; `fixtures/README.md`).

**Drawn (Session 12):** `web/rhythm.html` lights everything from the view, as the list
above says, and posts it from the worklet when bytes 4 to 63 change and at least sixty
times a second while playing. `make play` reads every drawing back off the page and holds
it to the view it came from. Nothing in this section changed.

**Drawn in Rack (Session 13):** `rack/src/Rhythm.cpp` calls `pi_view` after any frame
where a command, an event or a load could have moved it, on every self-test frame, and
otherwise every 16th (a trim measured with perf: it had been 9% of the module). It hands
the view to the drawing thread through `pi::Latest` by the same rule. The slider
parameters are the caps: the audio thread moves each to its shown value unless the pointer
is on it, and the self-test holds both to every fixture view. Nothing in this section
changed.

**Built (Session 20, 2026-11-23; D82):** the write-off row, in `Engine::view`
(`core/src/keys.rs`), one line. No byte moved and the ABI did not change: the field's bits
mean what they always meant, and only which row fills them changed. Twelve view lines in
four fixtures were worked again by hand first (`fixtures/README.md`, "The views worked again
for the write-off row") and the core gave them at the first run; every trace and every
render file stayed the same bytes. `core/src/tests/keys.rs` holds the row
(`write_off_the_field_is_…`) and holds write off to the field write on lights
(`the_field_is_the_same_with_write_off_as_with_write_on`). Neither host changed: the page and
the Rack module already lit every key from the field and drew a firing's white over it, so
a lit key goes white and comes back lit. `make play` now holds every drawn key's white to
the host rule above, and sees it happen on a lit key with write off.

**Built (Session 10):** `pi_view` and `Engine::view` in `core/src/keys.rs`;
`PI_VIEW_SIZE` and each field's offset (`PI_VIEW_*`) in the header. Proven by the views in
`fixtures/keys-*.json` on all three harnesses, and a test for each row of the grid's table
in `core/src/tests/keys.rs`. `harness/race.cpp` hands a view from the audio thread to the
other through `pi::Latest` after every block, as a module's drawing thread will get it.

## 15. Snapshot version 2 (ABI 5; designed in Session 9; D55; built in Session 11)

388 bytes. Bytes 0 to 311 are version 1's (§8) with version 2 and payload size 372. Then:

| Offset | Size | Field |
|---|---|---|
| 312 | 64 | sliders: track by track, A then B, a u16 each |
| 376 | 2 | sampled: bit *t*, track *t* plays its sample (D50) |
| 378 | 1 | volume, 1 to 16 |
| 379 | 1 | the chosen sound, 0 to 15 |
| 380 | 1 | hat cut: 0. Room for D47's setting; no core writes anything else yet |
| 381 | 3 | zero |
| 384 | 4 | CRC-32 of bytes 0 to 383 |

- **Not saved:** write mode, held keys, playing, the playhead, the clock source (the
  moment's and the host's, as in §8); the samples themselves (the host's, §12); the tempo
  presets (fixed).
- **The core writes version 2 only.** `PI_SNAPSHOT_SIZE` is 388; `PI_SNAPSHOT_SIZE_V1` 316.
- **It loads both.** §8's checks in §8's order, with the size and the CRC's place taken
  from the version. A version 1 load sets what it does not hold to `pi_init`'s values:
  sliders at their middles, every key on code, volume 16, key 1 chosen. Values no core
  writes are clamped (a volume of 0 is 1); a hat cut that is not 0 loads as 0.
- **Generation** now also moves on `SOUND`, `VOICE`, a volume or chosen-sound change, each
  only when the value changes.

Also Session 11's, because the Rack module needs the voices and the mix from one call: a
third layout, `PI_AUDIO_BOTH` (17 channels): tracks 0 to 15 as layout 16 gives them, then
the mix as layout 1 gives it, volume and all. Each must be the same bytes as its own layout.
Used since Session 13 by the Rhythm module: VOICES from the sixteen, AUDIO from the mix, or,
with RETURN patched (D62), the mix rebuilt in the core's order with the core's gain
(`rack/src/jacks.hpp`; `rack/test/jacks.cpp` holds it to the core's own mix).

**Built (Session 11):** `core/src/snapshot.rs`; the generation in `Engine::apply` (`SOUND`,
`VOICE`) and `keys.rs` (the volume and the chosen sound, which no edit sets); the layout in
`Voices::render`. The design held. Each point below is held by a test in
`core/src/tests/snapshot.rs`:

- ⚠ Two readings where §15 is silent, built on and not ruled (Session 11 ran on Opus;
  `PLAN.md`'s Handover asks the owner): a chosen sound past 15 loads as 15, as a volume
  past 16 loads as 16; and bytes 381 to 383 are not read, like the bytes after a snapshot.
- Following from §8's order, not a reading: a version 2 whose version field says 1 is read
  as version 1 and refused by its payload size (`PI_ERR_SIZE`), before its CRC is looked at.
- The payload size counts the bytes between the header and the CRC (300, 372), as version
  1's did; §15's 372 says so, and a first draft of the code counted the CRC too.

Proven: each fixture's version 1 snapshot, saved by the ABI 4 core before any change
(`fixtures/snapshots-v1.txt`), loads into an engine whose new fields were all moved, sets
them back to `pi_init`'s values, saves as today's snapshot of that fixture, and gives the
fixture's trace on both sources at three rates. `harness/render-both.json` holds the three
layouts to each other in each harness and each layout's native render to its `.wasm` one.
The Rack Probe loads a patch with a version 1 snapshot (`rack/selftest.sh`).

## 16. The weave (ABI 10; designed in Session 9; D53; built in Session 14 as a first attempt, not yet accepted: D84)

The display's animation is drawn once, in the core, as cells: both hosts paint the same
grid and neither holds a drawing rule.

```
cells = pi_weave(view, len, flags, out, cap)    /* PI_WEAVE_W × PI_WEAVE_H, or 0 */
```

- **A pure function of a view block.** No engine, no state, no floats. Because it takes no
  engine, §8's one-thread rule does not reach it: Rack's drawing thread calls it; the page
  calls it in its own instance of the same `.wasm`.
- **Cells** are 1 mm squares, row by row from the top left, one byte each, a palette number:
  0 display, 1 thread, 2 ecru, 3 white, 4 ochre (`design/DESIGN.md`'s tokens). The size is
  the weave's area on the display in whole mm, read off `design/loom/frames.html`.
- **`flags`** bit 0: reduced motion (the shuttle jumps; rule 6's flash is off).
- **What it needs, in the view's bytes 48 to 63:** 48, a u32, steps woven since play began
  (0 at play; held when stopped); 52, a u16, bit *i* set if the step woven *i* steps ago had
  any sound set when it was woven; 54, a u8, how many tracks have fired on the playhead's
  step so far, taps included. With the tick (shuttle and flash position), flags and tempo
  already there, `DESIGN.md`'s seven rules are a function of the block.
- The host draws the rest of the display itself, from the view: the tempo, `bpm`, the write
  mark, the step number, the sixteen step marks.

**Built (Session 14, 2026-11-23; a first attempt, D84).** The owner has not watched it move
and nothing here is accepted (`PLAN.md`, Session 14's fourth box; O19). As built:

```
cells = pi_weave(view, len, flags, out, cap)    /* PI_WEAVE_CELLS (78 × 15 = 1170), or 0 */
```

- `core/src/weave.rs`, one pass over the cells, integers only, `#[inline(never)]`. It reads
  the view's tick (bytes 0 to 3), flags 0 and 3 (byte 24), the swing (29) and bytes 48 to
  54, and nothing else; a test holds that. `len` under 64, `cap` under 1170 or a null
  pointer: 0, and nothing written. Only bit 0 of `flags` is read.
- The three fields are the sequencer's (`core/src/seq.rs`, `Seq::cloth`; `Out::on_step` in
  `core/src/abi.rs`), filled in `Engine::view`. `PI_VIEW_WOVEN` 48, `PI_VIEW_WOVE` 52,
  `PI_VIEW_ON_STEP` 54. None is in a snapshot: they belong to the moment.
- The engine is 3 712 bytes (from 3 704). `pi_process` costs what it did (`make bench`,
  old and new back to back). One `pi_weave` call is about 1.9 µs natively (1 170 cells),
  on the drawing side; a host calls it only when the view has changed.
- **The same bytes natively and from the `.wasm`:** `fixtures/weave-views.txt` is a set of
  60 views; Rust's tests, the C++ harness (`harness --weave`) and the Node harness each
  write the cells as text (`target/weave-*.txt`) and `make test` compares the three.
- **Tests of the rules, not of a picture** (`core/src/tests/weave.rs`): one or more for each
  of the seven rules, for reduced motion, for the three fields, and for what the function
  reads. No test says which cell a diamond lights.

**What turned out different from the design above (each ruled in D84, the owner's to overrule):**

| The design said | Built |
|---|---|
| Palette 0 to 4 | Also 5 tile and 6 madder: the designed picture's cloth is tile and its diamonds madder, ochre and ecru (D84 item 6) |
| 48: "0 at play; held when stopped" | Also 0 at a reset while playing; a reset while stopped leaves it (item 2) |
| 52: "had any sound set when it was woven" | Set, not fired: a probability or a repeat does not change it, and a later edit does not unpick it (item 3) |
| 54: "how many tracks have fired on the playhead's step so far" | Tracks, not firings; and 0 unless a step has arrived since play, so stopped it is 0 (item 4) |
| Rule 6's flash "for a sixteenth of a step" (`DESIGN.md`) | A quarter of a step: a sixteenth is 7.8 ms at 120 bpm, under one frame of a 60 Hz screen (item 11). It starts on the tick a swung step's sounds fire |
| Rule 3: the diamond's size is the beat's density | True of a finished beat. The beat being woven is drawn at the size its steps so far give, so it can grow (item 8) |
| "ABI 6" (PLAN's list, from before the effects) | ABI 10 (D83) |

Both hosts paint a cell as a flat square five sixths of its place and paint nothing for 0
(D84 item 14): `web/rhythm.html` on a canvas, only when the cells change, with
`prefers-reduced-motion` as bit 0; `rack/src/Rhythm.cpp` (`RhythmDisplay::drawWeave`) in
NanoVG, weaving again only when the view changes, with the menu's "Display: reduced motion"
as bit 0 (item 15). `make play` reads every drawing's cells back off the page by colour and
holds them to `pi_weave` for the view they came from. The Rack drawing has no checker; it
was seen in screenshot mode (`design/rack-weave-*.png`).

## 17. Effects: the lane, the keys and the repeats (ABI 6; designed in Session 15; D66, D67; built in Session 16)

The fx key comes alive. What the PO-12 does is in `REFERENCES.md` R48 to R54; what we take
from it is D66. One more thing a pattern holds: **the lane**, one effect number for each of
the sixteen steps, 0 for none, 1 to 16 for the effect on key 1 to 16. And one setting:
**which sounds go through the effects**, a bit a sound, all sixteen at `pi_init`.

State. Saved (§17's snapshot, below): `fx[16]`, `fx_sounds`. The moment's: the grid keys
punched, in the order they went down, of which `punch` is the last still held (0 if none),
and in the sequencer `eff` (the effect it read at the last step boundary), `run_step` and
`run_tick`.

**Checked on the owner's PO-12, 2026-11-23** (`WORKFLOW.md`): recorded with write off;
heard at once; cleared a step at a time by fx alone; of two keys held the last wins and
the first comes back when it is let go; nothing happens while stopped; no key lights for
an effect; the step being played when a key lands is not recorded and the next ones are;
clear empties the lane; an effect stays on its step whatever notes are later put there or
taken off. Each is marked "(hardware)" below where it is a rule. **Not checked: the
repeats.** With effect 9 held the owner heard no repeat at all, so what 9 to 12 do on the
hardware is unknown and ours are our own design under its names.

### Commands

| Type | Name | Arguments |
|---|---|---|
| 23 | `FX` | `a` step, `value` 0 to 16: the lane's entry for that step. A value past 16 is ignored, as an index is |
| 24 | `FXSOUND` | `a` track, `value` 0 or 1: whether that sound goes through the effects (built: any value but 0 is 1, as `STEP`'s) |

Both are edits (§6): a host's sheet or menu sends them, and a fixture can. Each moves
`pi_generation` when it changes a value.

### Keys (§13's tables, changed)

`KEY_DOWN` on grid key *n*: the row "pattern, fx or function is held: nothing" loses fx,
and this row goes in after "sound is held":

| When | It does |
|---|---|
| fx is held | key *n* is punched: `punch` becomes *n* + 1. No sound, no step, whether write is on or off |

`KEY_UP` on a punched grid key: it is no longer punched, and `punch` becomes the key
punched last among those still down, or 0. So the last key held wins, and letting it go
brings the one before back (hardware). `KEY_UP` on fx: nothing is punched any more, and a
grid key still down is not a press. `KEY_DOWN` on fx: only held.
(Session 15's first draft had "letting the second go leaves none"; the hardware says
otherwise.)

Function + pattern (clear) also empties the lane. `fx_sounds` stays, as the sliders do.

### The lane is written by the steps that arrive

At every step boundary while playing, after the playhead has moved (§5):

```
if fx is held:  fx[cur] = punch          # a punched effect is written; fx alone writes 0
eff = fx[cur]
```

That is the whole of recording and clearing: hold fx with a key and each step that arrives
takes that effect; hold fx alone and each step that arrives is emptied. Nothing is written
between boundaries, and nothing while stopped. Write mode plays no part (hardware; R49).

**What is heard** (it is also what Rack's FX GATES say, D68):

```
heard = 0, unless a step has played since play (the view's flag 3)
        punch, if punch is not 0
        fx[cur], otherwise
```

Stopped, nothing is heard and nothing is written (hardware; the first draft let a punch
sound on taps while stopped). Playing, a punch is heard from the frame its key lands
(hardware), and to the end of the step it is let go on (that step holds it by then). The sequencer reads `eff` at a boundary only: a repeat
punched in the middle of a step begins with the next step. One rule each: the sound path
reads `heard` every frame; the sequencer reads the lane at a boundary. Why the split: a
trace then depends only on ticks and commands (§1), and what the lane replays next bar is
exactly what the sequencer did this bar.

### The four repeats (effects 9 to 12)

A repeat re-fires one step's sounds on a grid of its own. It is a sequencer effect: no
audio is stored, every repeat is a fresh hit, and each goes out as a `TRIG` like any other,
so in Rack the TRIGGERS cable carries it (R57 on why not a buffer).

| Effect | Period | In a beat |
|---|---|---|
| 9 | 96 ticks | 4 |
| 10 | 128 | 3 |
| 11 | 48 | 8 |
| 12 | 64 | 6 |

⚠ The numbers are our reading of the names "stutter 4, stutter 3, repeat 8, repeat 6" as
hits in a beat (R48: the guide gives 9 and 10 two ways and explains none).

```
at a step boundary, after eff is read:
  if eff is 9..12 and eff != last:  run_step = cur;  run_tick = k
  last = eff                           # play from stopped, and reset, set last = 0

at tick k, playing, for track 0..15 in order:
  if eff is 9..12 and track is in fx_sounds:
    fires when (k - run_tick) % period == 0, from column run_step
  else:
    fires as §5 says (pending, at the swing offset), from column cur
```

- **A run** is consecutive steps holding the same repeat. It keeps the step it began on and
  its own grid of ticks across those steps, so effect 10 over four steps is three even hits
  a beat, not one a step.
- A sound in `fx_sounds` does not play its own steps while a repeat is on; a sound outside
  it plays on as if nothing were held.
- A repeated hit is not swung. It takes its draw like any firing (§5): once, in track
  order, when it fires, from column `run_step`'s probability.
- `TRIG`'s step is the column that fired: `run_step` for a repeated hit. Within a tick the
  order is still `STEP`, then `TRIG` by rising track, repeats and plain firings together.
- The playhead and `STEP` are untouched: the pattern runs on underneath and the beat comes
  back in place when the run ends.

**Effects the core does nothing for yet** (4, 13, 14, 15, 16 after the first build, and 1
to 8 until §18 is built): the key still punches, the lane still records it, `heard` and the
view still say it, and Rack's FX GATES still send it. Only the sound is unchanged. So all
sixteen are usable in Rack from the first build, through D68's loop.

### The view (§14, changed)

| Offset | Size | Field |
|---|---|---|
| 55 | 1 | `heard`: 0, or the effect sounding now, 1 to 16 |
| 56 | 2 | fx steps: bit *s*, step *s* of the lane holds an effect |
| 58 | 2 | fx sounds: bit *t*, sound *t* goes through the effects |

Bytes 48 to 54 stay the weave's (§16) and 60 to 63 stay zero (until ABI 8: §20's second mark). **The grid's table does not
change:** holding fx lights nothing and hides nothing, as on the hardware, where no key
lights for an effect. (The first draft put the bar on the heard effect's key.) The fx key
itself shows pressed while held, like any function key.

The display says it instead: a host draws a mark while `heard` is not 0, and may draw the
lane on its step marks from the fx steps. `design/DESIGN.md` decides both. The hardware
flashes a spark on its sewing machine there; that picture is its own (R6), so ours is a
mark of Loom's.

**Drawn (Session 19; D81, a stand-in ⚠):** `web/rhythm.html` and the Rack display both draw a
madder `fx` block with the number while `heard` is not 0, and a madder tick over the step
mark of each step the fx steps name; the page's sounds sheet draws fx sounds as a "through
fx" switch a sound, which sends `FXSOUND`. `make play` reads each back off the page and
holds it to the view it came from, and plays `fx-repeat-punch` on the page. Nothing in this
section changed.

**As text:** fixture format 3 (`fixtures/README.md`) is format 2's line with
` fx=<heard> fxsteps=<four hex digits> fxsounds=<four hex digits>` on its end. Formats 1
and 2 are unchanged, so every existing fixture's views stay the same bytes.

### Snapshot version 3

408 bytes. Bytes 0 to 383 are version 2's (§15) with version 3 and payload size 392. Then:

| Offset | Size | Field |
|---|---|---|
| 384 | 16 | the lane: a byte a step, 0 to 16 |
| 400 | 2 | fx sounds |
| 402 | 2 | zero |
| 404 | 4 | CRC-32 of bytes 0 to 403 |

The core writes version 3 and loads all three. A version 1 or 2 load empties the lane and
sets `fx_sounds` to all sixteen. A lane byte past 16 loads as 0. `punch` is the moment's
and is not saved.

### What must not move, and what it costs

- With an empty lane and nothing punched, every trace and every render is the same bytes
  as before: the seven fixtures, their views, the 276 render files.
- The sequencer's cost with an empty lane: one comparison at each step boundary and one at
  each tick that fires. The build measures `pi_process` before and after (PLAN's ground
  rule).

**Proven when built by:** `fixtures/designed/fx-repeat-punch.json`, worked by hand in
Session 15 before any code (`fixtures/README.md`), on both sources; a rule test for each
row and bullet above; a version 2 snapshot file kept from before the change, as
`snapshots-v1.txt` was.

**Built (Session 16):** the lane, `eff`, the runs and the repeats in `core/src/seq.rs`
(`Seq::tick` is handed one byte, what an arriving step takes, and says whether the lane
changed); the punches in `core/src/keys.rs`, kept in the order they went down, and `heard`
and bytes 55 to 59 in `Engine::view`; `FX` and `FXSOUND` in `core/src/engine.rs`; version 3
in `core/src/snapshot.rs`; the header. Proven by the two format 3 fixtures, worked by hand
before the code (`fx-repeat-punch`, Session 15, and `fx-repeat-swing`, Session 16: effect
10 over four steps with swing and a probability), moved up unchanged: both passed at the
first run on all three harnesses, both sources, three rates, three block sizes and from a
version 3 snapshot; 30 rule tests in `core/src/tests/fx.rs`, among them the 20 000-press
generation test with fx in it; `fixtures/snapshots-v2.txt`, saved before the change and
loaded against every fixture's trace; 24 faults planted in the core, each caught by a
named test. Cost, measured (`make bench`, `LEARNINGS.md`): none that the bench can see
with an empty lane. The design held. What it did not say, built on and marked:

- (Ruled as built, D73.) **A step that writes the lane moves the generation.** §8 says the generation moves
  when "a command" changes what a snapshot holds; a lane written by an arriving step is a
  tick, not a command. Built: it moves, so a host saves a performance as it does an edit.
  `pi_generation`'s line in the header says so.
- (Ruled as built, D73.) **A repeat waits for the first step after play.** Play from stopped and reset clear
  `eff` with `last`: between a play and the first boundary after it nothing has been read
  since play, so no repeat fires there, as no plain firing does (`pending`). Only the
  `PLAY` edit in the middle of a step, or the play key on edges, can reach that stretch.
- (Ruled as built, D73.) Bytes 402 and 403 of a version 3 snapshot are not read, as 381 to 383 are not (§15).
- Not a reading: a punch made while stopped is kept, unheard and unwritten, and is heard
  and written from the first step once play starts (the keys' row applies whether playing
  or not; "stopped, nothing" is what `heard` and the lane say).
- Rack and the page: nothing is drawn yet (Sessions 18 and 19), but both carry ABI 6, so fx
  plus a key already repeats there. Rack's self-tests leave the format 3 fixtures out until
  Session 18 gives the module FX GATES. `harness/race.cpp`'s churn no longer presses fx:
  held while playing, it lets steps write the lane at the audio thread's pace, which its
  model (a frame an edit) cannot keep; the lane goes in by `FX` instead.

## 18. The bus and the first sound effects (ABI 7; designed in Session 15; D67; built in Session 17)

- **The bus** is the sum of the sounds in `fx_sounds`, in track order; **the rest** is the
  sum of the others. The effects act on the bus only. That one switch a sound is what "per
  channel" means here (D66 item 4).
- **Idle is today's path.** While `heard` is not an effect the core sounds and the ramp
  below is at 0, the mix is §13's: every track summed in order, times the volume. The same
  bytes as before, at the cost of one comparison a frame.
- **Otherwise** `mix = (rest + bus + w × (wet − bus)) × volume gain`, where `wet` is the
  effect's output for this frame's bus, and `w` runs from 0 to 1 in 2 ms (`500 / rate` a
  frame) when such an effect starts, and back when it ends; the effect keeps running until
  `w` is 0. From one effect straight to another, the new one starts at once with `w` as it
  is. Why a ramp: every engine read does this and nothing else (R55, R57).
- **The sixteen track channels are not touched** by any effect: direct outputs, before the
  effects and the master, as with the volume (D57).
- **Musical time moves the sweeps.** A sweep's place is the ticks since `heard` became that
  effect, so it restarts with each run and is the same on both clocks. Its cutoff is
  multiplied by a constant once a tick, never computed from an exponential.
- **The same bits on every host** (§11): `+ − × ÷` and casts only. The filter's `tan` is a
  polynomial (R56).

The first set. Every number is a first value for the owner's ear (⚠), as the voices' were:

| Effect | Role (R48) | Built as |
|---|---|---|
| 1 | low sample rate | sample and hold at 6 kHz on a phase accumulator (`acc += 6000`; at `acc ≥ rate` take a new sample), so it is 6 kHz at every rate |
| 2 | distortion | `SoftLimit(6 × bus) × 0.7`, where `SoftLimit(x) = x (27 + x²) / (27 + 9 x²)`, held to ±1 beyond ±3 |
| 3 | bit crush | twelve levels a unit, towards zero: `trunc(12 × bus) / 12`. Silent on silence |
| 5 | lowpass filter | the state-variable filter's low output at 600 Hz |
| 6 | lowpass sweep | the same, from 8 kHz down to 200 Hz over sixteen steps, then again |
| 7 | hipass filter | its high output at 2 kHz |
| 8 | hipass sweep | the same, from 100 Hz up to 4 kHz over sixteen steps, then again |

The filter is one zero-delay-feedback state-variable filter, damping 0.5, serving all four:
`h = 1 / (1 + r g + g²)`, `hp = (in − r s1 − g s1 − s2) h`, `bp = g hp + s1`,
`s1 = g hp + bp`, `lp = g bp + s2`, `s2 = g bp + lp`, with
`g = f (π + f² (0.3260 π³ + 0.1823 π⁵ f²))`, `f = cutoff / rate`, held to 0.3 at most.
Ported from stmlib (MIT, © Émilie Gillet; R56) with its notice in the file's header, as the
sample-rate reducer and `SoftLimit` are; the credits on the page and in the plugin gain a
line. Its state is cleared when an effect starts from idle, and kept from one filter effect
to the next.

Not in the first set, and why: 4 delay and 14 feedback need a stretch of stored sound, and
the engine's memory is the host's and fixed (§8): how long, at what rate, and whether the
host lends the room as it lends samples (§12) is its own design. 13 note shuffle, 15
parameter lfo and 16 vibrato wait for the hardware to say what they are (R48: nobody
describes them).

**Proven when built by:** render pairs (native and `.wasm`, the same bytes) for each
effect punched over the minimum beat at three rates; the 276 existing render files
unchanged; a rule test that a sound outside `fx_sounds` is the same in the mix with and
without an effect; the cost of a frame measured idle and with each effect on.

**Built (Session 17, ABI 7):** `core/src/bus.rs`, with Émilie Gillet's notice in its
header; the credits on `web/rhythm.html` and in the Rhythm module's line of
`rack/plugin.json`. `Engine::process` reads what is heard and hands the bus the frame's
ticks; `Voices::render` takes the bus's mix when it runs. No call, command, view byte or
snapshot byte changed; the ABI moved to 7 by PLAN's rule for Sessions 16 to 19. Proven: the
report and all 276 render files the same bytes as before the session; seven render pairs,
`harness/render-fx-{1,2,3,5,6,7,8}.json` (each effect punched over the minimum beat, then
replayed by the lane, both clocks, three rates), native and `.wasm` the same bytes; 17 rule
tests in `core/src/tests/bus.rs`, among them a model of this section written from its words
that the mix equals bit for bit on every frame of two bars that pass through every kind of
change, at three rates and on edges; 25 faults planted, each caught by a named test. Cost
(`make bench`, `LEARNINGS.md`): idle within the bench's noise; an effect about 6 ns a frame
over the dry beat. What it did not say, built on and marked:

- (Ruled as built, D77.) **What is cleared, and when.** The text says the filter's state "is cleared when an
  effect starts from idle, and kept from one filter effect to the next". Built: each
  effect's state is cleared when it starts from idle or from another kind of effect (the
  four filters are one kind; 1, 2 and 3 each their own). So the hold starts with its
  accumulator and sample at 0 (its first new sample comes 8 frames in at 48 kHz, under a
  ramp at 0.08), and a filter effect after 1, 2 or 3 starts clean.
- (Ruled as built, D77.) **"Damping 0.5"** is built as stmlib's `r`, 1 / Q, so Q = 2, as `voice.rs` uses the
  word. Read as a damping ratio it would be `r` = 1.
- (Ruled as built, D77.) **A sweep's first tick.** What is heard is read once a frame, after that frame's ticks
  (§3's order), so a tick on the very frame heard becomes a sweep is not counted: at most
  one tick, only when a punch lands on a frame that also has a tick.
- (Ruled as built, D77.) **Heard again while ramping out** (6, then none, then 6 again within 2 ms): heard
  became 6, so the sweep starts again; the filter keeps its state, since the bus never went
  idle.
- Not readings: with no mix in the layout (16 channels) the ramp and the sweeps move and the
  effect itself does not run; `bus + w (wet − bus)` at `w` = 1 is the effect's output to
  within a rounding, not bit for bit; Plaits' polyBLEP is not ported (the table says a
  plain hold); the hold's accumulator wraps by `acc % rate`, the same as `acc − rate` at
  any rate above 6 kHz, and total below it. Idle costs, as built, a comparison in `advance`
  and one in the mix; what is heard is read again only on a frame with a command or a tick,
  which gives the same value as reading it every frame.
- Not yet heard in Rack with RETURN patched: the module rebuilds AUDIO from the sixteen
  channels (`rack/src/jacks.hpp`, D62), which are before the effects. Session 18 moves the
  returns into the core (§19).

## 19. Sound in: the returns and the effects loop (ABI 9; designed in Session 15; D68; built in Session 18)

For Rack. Until now a host only took sound from the core, and the Rhythm module rebuilt
the mix itself when RETURN was patched (D62, `rack/src/jacks.hpp`). The effects have to
reach a returned sound too (TRIGGERS to a Rack kick, back in through RETURN, then a punch
on it), so the returns move into the core, and one more pair of channels makes a loop for
the bus.

- **A fourth layout, `PI_AUDIO_LOOP`, 18 channels,** read and written in place. Before the
  call the host fills, for each frame, channels 0 to 15 with what its RETURN cable carries
  and channel 17 with its FX RETURN. After it: 0 to 15 are the sixteen sounds as layout 16
  gives them, 16 is the mix, 17 is the bus before any effect and before the volume (FX
  SEND). Channel 16's input is not read.
- **Command 25, `ROUTE`.** `a` 0: `value` is a mask of sounds taken from the input: that
  sound's input channel takes its own voice's place in the bus or the rest, and so in the
  mix. Its output channel is still its own voice. `a` 1: `value` is a mask of effects whose
  sound comes from outside: while `heard` is one of them, `wet` is input channel 17, with
  §18's ramp, whether or not the core has a sound for that effect. Neither is saved or
  moves the generation: which cables are in is the patch's to keep. In the other three
  layouts nothing is read in and `ROUTE` changes nothing heard.
- **Nothing routed, nothing punched:** channel 16 is layout 17's mix, the same bytes.
- **The loop is an insert, not a second copy.** When an outside effect is heard the bus
  crosses over to what came back; it is never summed with itself, so the two samples a
  cable loop costs in Rack 2 (R60) cannot comb, and no rule here depends on that number.
- The repeats (§17) are not sound and cannot go outside: they go out as triggers.

**Proven when built by:** `rack/test/jacks.cpp`'s cases as core tests (unpatched is the
mix bit for bit; a silent return takes the sound out bit for bit); a returned sound in
`fx_sounds` is in the bus and one outside it is not; an outside effect's `wet` is the
input, ramped.

**Built (Session 18, on Fable, ABI 9):** the loop's frame is mixed in `Bus::looped`
(`core/src/bus.rs`), out of line, which also holds what `ROUTE` set and what the slider
outputs say; `Engine::process` decides whether what is heard comes from outside, and
`Engine::hits` reads a slider's input (`core/src/engine.rs`); the two layouts in
`core/src/abi.rs`; the header's `PI_AUDIO_LOOP`, `PI_AUDIO_LOOP_SLIDERS`, `PI_CMD_ROUTE`,
`PI_ROUTE_*` and `PI_LOOP_*`. Proven: the report and all 372 earlier render files the same
bytes as before the session; 23 rule tests in `core/src/tests/route.rs`, among them
`rack/test/jacks.cpp`'s four cases, and §18's model given what came back, which the loop's
mix and send equal bit for bit on every frame of a tour through every kind of change, at
three rates and on edges; `harness/render-loop.json`, the 18 and 50 channel layouts with
every input given, native and `.wasm` the same bytes (36 new render files); 30 faults
planted in the core, each caught by a named test. Cost (`make bench`, `LEARNINGS.md`):
nothing in the three older layouts (the bench reads a shade faster than before); with every
sound returned, about 9 ns a frame over the unpatched 28; the fifty channels about 4. The
design held. What it did not say, or said wrongly, ruled in D80 and marked:

- ⚠ (D80 item 1) **ABI 9**, by the rule for Sessions 16 to 19.
- ⚠ (D80 item 2) **Two layouts, chosen by the channel count:** 18, and 50 with the sliders
  (the addition below left the choice to the builder). A host asks for the smallest that
  carries what is patched; Rack's module asks for `PI_AUDIO_BOTH` when nothing is.
- ⚠ (D80 item 3) **`ROUTE` 1's mask: bit *n* − 1 is effect *n*, and any of the sixteen may
  be marked,** an effect the core sounds and a repeat too. A marked repeat still repeats
  (that is the sequencer's, and cannot go outside); the bus crosses over as well.
- ⚠ (D80 item 4) **An input that is not a number is silence,** in the core: a NaN let into a
  filter would stay. (The Rack module did this for RETURN until now.)
- ⚠ (D80 item 5) **When channel 17 is read:** while an outside effect is heard and for the
  2 ms it ramps out after, even if `ROUTE` has unmarked it by then. A host that goes back
  to a layout with no input while one is ramping out hears the bus as it is for those 2 ms.
- ⚠ (D80 item 6) **Changing what `ROUTE` marks while an effect is held** starts it again as
  the other kind (a sweep from its start, a filter's state cleared), with the ramp as it is:
  §18's rule for one effect straight to another.
- Not readings: a returned sound's output channel is still its own voice, so VOICES and
  TRIGGERS do not change when RETURN is patched; channels 0 to 15 are read only for the
  sounds `ROUTE` names, and what else is in the buffer does not matter; `ROUTE` with `a`
  past 3 is ignored, and bits past the sixteenth are not sounds; a load leaves the routes
  and `pi_init` clears them. The routes and the slider outputs are kept inside the bus's
  own memory and not beside the engine's other fields: where the sixteen voices sit in
  memory is worth over a nanosecond a frame (`LEARNINGS.md`, Session 18).
- Rack (`rack/src/Rhythm.cpp`, `rack/src/jacks.hpp`): the module no longer rebuilds the mix;
  it turns volts to the loop's inputs and back. Its self-test holds a module with VOICES
  patched into RETURN and effect 2 punched, one with FX SEND into FX RETURN, and one with A
  OUT and B OUT into A IN and B IN, each frame to a second engine given what those cables
  should carry.

## 20. The sliders are the hand's; a step keeps what it was written with (ABI 8; designed 2026-11-23; D75; built in Session 21)

Until now each sound owned its sliders and a `PARAM` moved the chosen sound's (§13, D54).
D75 changes what a `PARAM` means and gives a step a memory. The edits (16 to 22) do not
change: `SOUND` still sets one sound's own A or B, and a step with nothing kept still plays
with its sound's own values, so every existing trace and render is the same bytes.

State, saved: for each sound and step, whether the step **keeps** values, and the A and B
it keeps (a u16 each).

### Commands and keys

| Type | Name | Arguments |
|---|---|---|
| 26 | `KEEP` | `a` track, `b` step, `value`: A in the high sixteen bits, B in the low. That step keeps those values from now on. An edit; it moves the generation when it changes something |

- **`STEP` with value 0 forgets** what the step kept. `STEP` with value 1 keeps nothing by
  itself: a host's edit is not a hand.
- **`PARAM`** with bpm not held: `SOUND` on **all sixteen** sounds, that slider, that
  value. (With bpm held, and "a value the view already shows is nothing", as §13.)
- **A grid key in write mode that turns a step on** also sends `KEEP` for it, with the
  chosen sound's own A and B as they are on that frame. Turning it off is `STEP` 0, which
  forgets.
- **Clear** (function + pattern) forgets every step's values.
- Choosing a sound sets nothing and moves nothing.

### Which values a hit uses

| The hit | A and B |
|---|---|
| a tap, or `FIRE` | the sound's own (which are the hand's, unless an edit set them apart) |
| a step from the sequencer | what the step keeps, or the sound's own if it keeps nothing |
| a repeated hit (§17) | as a step: column `run_step`'s |

Read at the hit and never moving a voice that is sounding (D56 stands).

### The view

| Offset | Size | Field |
|---|---|---|
| 60 | 2 | A as the chosen sound was last hit with; its own A until it has been hit |
| 62 | 2 | B, the same |

Bytes 20 to 23 are unchanged in code and changed in meaning: the chosen sound's own A and
B are now the hand's. A host draws the cap from 20 to 23 and the second mark from 60 to
63, and moves a cap by itself only while bpm is held or after a load. Choosing a sound
resets 60 to 63 to that sound's last hit.

**As text:** fixture format 4 is format 3's line with ` ea=<A> eb=<B>` on its end.

### Snapshot version 4

1464 bytes. Bytes 0 to 403 are version 3's (§17) with version 4 and payload size 1448. Then:

| Offset | Size | Field |
|---|---|---|
| 404 | 32 | keeps: one u16 a track, bit *s* is step *s* |
| 436 | 1024 | the values: track by track, step by step, A then B, a u16 each; zero where nothing is kept |
| 1460 | 4 | CRC-32 of bytes 0 to 1459 |

The core writes version 4 and loads all four. **An older version's load keeps, for every
step that is on, its sound's own A and B** (D75 item 6). A version 4 load keeps what it
says, no more. Values where the keep bit is clear are not read.

### What must not move

Every existing trace, and all the render files: no fixture or render scenario uses a key
in write mode with a slider moved apart from its sound's own. **What does move, by this
decision:** `keys-tap-and-choose`'s views, where a slider moved while one sound was chosen
shows again when another is (the lines with `a=` and `b=` after a new sound is chosen), and
any view text that showed a chosen sound's own sliders. They are worked again by hand from
this section before the code, and `fixtures/README.md` says which lines and why.

**Proven when built by:** `fixtures/designed/keeps-what-it-was-written-with.json`, worked
by hand on 2026-11-23; a render pair in which two steps of one sound, written at two slider
positions, sound at two pitches, native and `.wasm` the same bytes; a rule test for each
row above; `fixtures/snapshots-v3.txt` written before the change.

**Built (Session 21, on Opus):** command 26 `KEEP` and `STEP` 0's forgetting in
`core/src/engine.rs`, where `Engine::hits` reckons what each firing is hit with (the step's
column comes from the sequencer through `Out::trig`); `PARAM` on all sixteen, the write-mode
key's `KEEP` and clear's forgetting in `core/src/keys.rs`, with bytes 60 to 63 in
`Engine::view`; what a step keeps in the pattern (`core/src/seq.rs`); version 4 in
`core/src/snapshot.rs`; `PI_CMD_KEEP`, `PI_VIEW_HIT_A`, `PI_VIEW_HIT_B` and
`PI_SNAPSHOT_SIZE_V3` in the header. ABI 8. Proven: `fixtures/snapshots-v3.txt` written and
committed first; `keys-tap-and-choose`'s six changed view lines worked by hand and
committed before any code (`fixtures/README.md` says which and why); the designed fixture
moved up unchanged (a pure rename) and passed at the first run in all three harnesses;
every existing trace the same lines, every existing render file the same bytes;
`harness/render-keep.json`, native and `.wasm` the same bytes; 19 rule tests in
`core/src/tests/keep.rs`, among them a 20 000-edit generation test with `KEEP` in it; every
version 1, 2 and 3 snapshot ever written loads to its fixture's trace with each step that is
on keeping its sound's own. Each fixture also plays from a "kept snapshot" (its pattern with
every step that is on keeping its sound's own, as keys save it) in every harness: the bytes
the page saves after a beat entered by keys, which P6's browser check looks for. 23 faults
planted, each caught by a named test. The design held. What it did not say, built on and
marked:

- ⚠ **ABI 8.** §20 names no number; the rule for Sessions 16 to 19 (each takes the next) was
  followed, since a host must know the snapshot's new size.
- ⚠ **Two firings of one sound on one frame** (a tap and its own step, or an edge's burst):
  the later one in the frame decides which values are used (commands come before the
  clock's ticks, §3), and the values are read after the frame's commands, as a slider
  always was (§11). One voice starts, as before.
- ⚠ **`KEEP` on a step that is off keeps:** §20 says nothing of the step's state. `STEP` 1
  later plays it with what it keeps; `STEP` 0 or clear forgets it.
- ⚠ **A load leaves the last hits alone.** Bytes 60 to 63 remember each sound's last hit;
  that is the moment's, like `fires` (§14), and a load does not reset it. A sound never hit
  shows its own, the loaded value.
- Not a reading: since a slider is `SOUND` on all sixteen, one move can move the generation
  sixteen times (once a sound whose value changed). And since choosing a sound plays it (§13
  ⚠), the mark right after choosing by the keys is always that sound's own: "choosing resets
  60 to 63 to that sound's last hit" is that hit.
- Hosts (`web/rhythm.html`, `rack/src/Rhythm.cpp`): the cap is the hand's. ⚠ "Moves by
  itself only while bpm is held or after a load" is read as: it shows swing and tempo while
  bpm is held and goes back to the hand when bpm is let go; "after a load" is the first view
  that holds the load (the page counts queue entries; Rack takes it on the frame the load is
  taken), and a page's or module's first view counts as one. ⚠ The second mark is a thin
  thread-coloured line across the track at the value, drawn over the cap, always (with bpm
  held too): `design/DESIGN.md` does not draw it yet (its "Not done").

### §19, added 2026-11-23: the sliders out and in (D76 item 4; built in Session 18)

`PI_AUDIO_LOOP` is 50 channels, not 18. After the eighteen above: 18 to 33 are A for
sounds 1 to 16, and 34 to 49 are B.

- **Out:** each holds the value its sound was last hit with by §20's table, as 0 to 1
  (the slider's 0 to 65535 divided by 65535), written on every frame; a sound not yet hit
  shows its own. A host scales it (Rack: 10 V at 1).
- **In:** read only on the frame a sound is hit, and only for a sound `ROUTE` names:
  `a` 2, `value` a mask of sounds whose A comes from the input; `a` 3, the same for B. The
  input, held to 0 to 1 and turned to 0 to 65535 (rounded down), takes that slider's place
  for that hit, whatever the step keeps. A tap is a hit like any other.
- **The output is the value before the input replaces it,** so out, through a module, and
  back in cannot latch on itself.
- The view's bytes 60 to 63 (§20) show what was used, input and all: what is seen is what
  was heard.
- A host that patches none of the four passes the first eighteen channels' worth of
  attention: the core writes the thirty-two outputs only when asked. How it is asked (a
  fifth layout of 18 beside this one of 50, or a `ROUTE` bit) is the builder's, measured.

**Built (Session 18):** as above, with these marked:

- ⚠ (D80 item 2) Asked by the layout: `PI_AUDIO_LOOP` is the 18 and `PI_AUDIO_LOOP_SLIDERS`
  the 50.
- ⚠ (D80 item 7) **The input is turned to 0 to 65535 to the nearest, not rounded down.**
  Rounded down, an output read straight back in is exact, but through Rack's volts (times
  10, divided by 10) 5 116 of the 65 536 values come back one less, so a cable from A OUT to
  A IN would move the sound. To the nearest, every value comes back as it went, both ways
  (a test tries all 65 536).
- ⚠ (D80 item 8) **A sound not yet hit** shows its own on its outputs, and they follow
  whatever sets its own until its first hit: `SOUND` (and so a slider), and a load.
- Not readings: with the 18-channel layout, or any older one, `ROUTE` 2 and 3 change
  nothing: there is no input to read. An input past 1 is 65535 and one below 0, or not a
  number, is 0. The outputs are written on every frame, including the frame of the hit that
  changes them.
- ⚠ **Found, for the owner (D80, "Left open"):** out, through a module, and back in is one
  hit late. The output says what the sound was last hit with, and the input is read on the
  next hit, so a step played through A OUT to A IN sounds with the values of the hit before
  it. With steps that all keep the same values nothing is heard of it; with steps written
  at different positions the sequence of values is shifted by one hit. It follows from the
  two rules above and is built as designed.

