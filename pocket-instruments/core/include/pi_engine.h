/* Pocket Instruments: the engine's C ABI, version 15 (1 plus sound: D44; 3 adds samples: D50;
 * 4 adds keys and the view: D51; 5 adds snapshot version 2 and PI_AUDIO_BOTH: D55, D57;
 * 6 adds the lane, the fx key, the four repeats and snapshot version 3: D66, D67;
 * 7 adds the bus and seven sound effects on the mix, with no new call or command: D67;
 * 8 makes the sliders the hand's and lets a step keep them: KEEP, view bytes 60 to 63 and
 * snapshot version 4: D75;
 * 9 adds sound in: the loop layouts and ROUTE, for Rack's returns, effects loop and slider
 * jacks: D68, D76, D80;
 * 10 adds the weave: view bytes 48 to 54 and pi_weave, a first attempt: D53, D84;
 * 11 makes channel 17 in FX RETURN, summed, and PI_ROUTE_FX the host's effects, with
 * PI_ROUTE_FX_INSERT for those in place of the dry: D87, D88;
 * 12 makes a repeat hold the nearest note behind it, retunes effects 1, 2, 3 and 5 to 8,
 * and gives effect 4 a delay in a line the host lends, pi_set_delay: D90, D91;
 * 13 gives effects 13 and 14 their sound, with no new call or command: a note plays as the
 * sound twelve keys on, and the bus fed back in the first tenth of effect 4's line: D93;
 * 14 makes effect 1 the sounds in the effects at a quarter of the rate, the voices tuned for
 * 46 875 Hz and asked on a grid a quarter of it, a line between, on the track channels too,
 * with no new call or command: D98;
 * 15 adds one edge a beat, PI_SOURCE_BEATS, and the tempo the edges play in the view's bytes 30
 * and 31, PI_VIEW_EXT: D64, D65, D100).
 *
 * The contract both hosts link. ENGINE.md beside the crate is the specification; this file is
 * the same thing in C. Where they disagree, ENGINE.md is right.
 *
 * Rules of the ABI: only uint32_t, int32_t and pointers cross it. No float arguments, no
 * 64-bit values, no structs by value, no callbacks, no globals. The caller owns all memory.
 * Sound leaves through a pointer to the caller's floats, and since ABI 9 comes in through the
 * same one. The core keeps two kinds of pointer, each the caller's to keep alive: a track's
 * sample, given with pi_set_sample, which it only reads (D50); and since ABI 12 effect 4's
 * line, given with pi_set_delay, which it writes inside pi_process (D91 item 4).
 * Every function on an engine is called from one thread, the audio thread.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef PI_ENGINE_H
#define PI_ENGINE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PI_ABI_VERSION 15u

#define PI_TICKS_PER_STEP 96u /* a step is a sixteenth note */
#define PI_TRACKS 16u         /* one per grid key: key n plays track n (D30) */
#define PI_SAMPLE_RATE 44100u /* every sample's rate (pi_set_sample) */
#define PI_STEPS 16u
#define PI_SWING_MAX 48u      /* ticks an odd grid step is late by, at most */
#define PI_MBPM_MIN 30000u    /* tempo is in thousandths of a bpm */
#define PI_MBPM_MAX 300000u
#define PI_EVENTS_MIN 64u     /* the least room a host gives pi_process for events */
#define PI_SNAPSHOT_VERSION 4u   /* what pi_save writes; pi_load also takes versions 1 to 3 */
#define PI_SNAPSHOT_SIZE 1464u   /* bytes, for PI_SNAPSHOT_VERSION */
#define PI_SNAPSHOT_SIZE_V3 408u /* version 3 */
#define PI_SNAPSHOT_SIZE_V2 388u /* version 2 */
#define PI_SNAPSHOT_SIZE_V1 316u /* version 1: the least a host should keep and pass to pi_load */
#define PI_FX_MAX 16u            /* a lane entry: 0 none, or the effect on key 1..16 */
#define PI_VIEW_SIZE 64u      /* bytes pi_view writes */
#define PI_VOLUME_MAX 16u     /* master volume, 1..16; the mix is times (volume / 16) squared */

/* What pi_process writes to `audio`, by its `channels` argument. Any other value: no sound. */
#define PI_AUDIO_NONE 0u    /* the voices do not run at all */
#define PI_AUDIO_MIX 1u     /* one float a frame: every voice, summed, times the master volume.
                               While a sound effect is heard (ABI 7; ENGINE.md section 18) the
                               sounds through the effects are a bus, the effect acts on it, and the
                               mix is the rest plus the bus, ramped to the effect's output in 2 ms */
#define PI_AUDIO_TRACKS 16u /* PI_TRACKS floats a frame: track n alone in channel n, before the master
                               and before any effect but effect 1, which slows the voices
                               themselves (ABI 14, D98 item 7) */
#define PI_AUDIO_BOTH 17u   /* PI_AUDIO_TRACKS's sixteen, then PI_AUDIO_MIX's one: the same bits as each */
/* Sound in (ABI 9; ENGINE.md section 19). A loop layout is read and written in place: the
 * host fills each frame's input channels before the call and reads its outputs after.
 *   channel   in (before the call)                       out (after it)
 *   0..15     sound n as it comes back; read only for    sound n's own voice, as PI_AUDIO_TRACKS
 *             the sounds PI_CMD_ROUTE 0 names
 *   16        not read                                   the mix. With nothing routed, nothing
 *                                                        back and no effect heard: PI_AUDIO_BOTH's,
 *                                                        the same bits
 *   17        FX RETURN (ABI 11): read on every frame    the bus: the sounds through the effects,
 *             and added to the mix last, before the      returned ones included, before any effect
 *             volume; exactly 0 adds nothing. It is in   and before the volume
 *             no bus, no effect and no other channel
 * and with the sliders, 1 is the slider's full travel (65535):
 *   18..33    slider A for sound n; read only on the     the A sound n was last hit with by the
 *             frame it is hit, for the sounds             instrument's own reckoning (its own until
 *             PI_CMD_ROUTE 2 names                        it is hit), before any input replaced it
 *   34..49    the same for slider B (PI_CMD_ROUTE 3)     the same for B
 * A returned sound takes its own voice's place in the bus or the rest, so the effects reach
 * it. An input that is not a number is silence; a slider input is held to 0..1. */
#define PI_AUDIO_LOOP 18u
#define PI_AUDIO_LOOP_SLIDERS 50u
#define PI_LOOP_MIX 16u    /* where each is in a loop layout's frame */
#define PI_LOOP_FX 17u
#define PI_LOOP_A 18u
#define PI_LOOP_B 34u

/* Clock sources (PI_CMD_SOURCE). */
#define PI_SOURCE_TABLE 0u /* the engine counts frames at its tempo */
#define PI_SOURCE_EDGES 1u /* the engine follows PI_CMD_CLOCK; one edge is one step */
#define PI_SOURCE_BEATS 2u /* ABI 15: the engine follows PI_CMD_CLOCK; one edge is one beat, four
                              steps; the first beat runs at a guess (ENGINE.md section 4) */

/* Command types. Unknown types are ignored. */
#define PI_CMD_CLOCK 1u     /* an edge */
#define PI_CMD_RESET 2u
#define PI_CMD_SOURCE 3u    /* value: PI_SOURCE_*. The source already in use: nothing happens */
#define PI_CMD_TEMPO 4u     /* value: thousandths of a bpm, clamped */
#define PI_CMD_PLAY 5u      /* value: 0 stop, 1 play from the next step boundary */
#define PI_CMD_STEP 16u     /* a: track, b: step, value: 0 or 1. 0 also forgets what the step
                               kept (PI_CMD_KEEP); 1 keeps nothing by itself */
#define PI_CMD_PROB 17u     /* a: track, b: step, value: 0..100 */
#define PI_CMD_SWING 18u    /* value: 0..PI_SWING_MAX, clamped */
#define PI_CMD_LENGTH 19u   /* value: 1..PI_STEPS, clamped */
#define PI_CMD_SOUND 20u    /* a: track, b: 0 slider A, 1 slider B; value: 0..65535, clamped.
                               In snapshot version 2, not 1 */
#define PI_CMD_FIRE 21u     /* a: track. It fires on this frame, playing or stopped: one PI_EV_TRIG,
                               and its voice. The pattern is untouched */
#define PI_CMD_VOICE 22u    /* a: track; value: 0 its voice built in code, 1 its sample (pi_set_sample).
                               Taken at the track's next hit; a track with no sample plays its code
                               voice. All code at pi_init. In snapshot version 2, not 1 */
/* The effects (ABI 6; ENGINE.md section 17). Both are edits; in snapshot version 3. */
#define PI_CMD_FX 23u       /* a: step, value: 0..PI_FX_MAX, the lane's entry for that step.
                               A value past PI_FX_MAX is ignored */
#define PI_CMD_FXSOUND 24u  /* a: track, value: 0 or 1, whether it goes through the effects.
                               All sixteen at pi_init */
/* Sound in (ABI 9; ENGINE.md section 19): what a loop layout reads. The patch's to keep: in no
 * snapshot, moves no generation, untouched by pi_load, nothing at pi_init. In the layouts
 * that read nothing it changes nothing heard. */
#define PI_CMD_ROUTE 25u    /* a: PI_ROUTE_*; value: a mask of sixteen. An a past 4: ignored */
#define PI_ROUTE_SOUNDS 0u  /* bit t: sound t is taken from input channel t */
#define PI_ROUTE_FX 1u      /* bit n - 1: effect n is the host's (ABI 11): the core does not sound
                               it, and the dry stays. A repeat named still repeats */
#define PI_ROUTE_A 2u       /* bit t: sound t's slider A comes from its input at each hit */
#define PI_ROUTE_B 3u       /* the same for slider B */
#define PI_ROUTE_FX_INSERT 4u /* bit n - 1 (ABI 11): while effect n is heard, and PI_ROUTE_FX names it
                               too, the bus leaves the mix, with the 2 ms ramp, and comes back 2 ms
                               after. A bit PI_ROUTE_FX does not name changes nothing */
/* A step's own sliders (ABI 8; ENGINE.md section 20). An edit; in snapshot version 4. */
#define PI_CMD_KEEP 26u     /* a: track, b: step, value: A in the high 16 bits, B in the low. That
                               step plays with these from now on. PI_CMD_STEP 0 forgets them */
/* What a finger did (ABI 4; ENGINE.md section 13). The core runs the workflow and turns each
 * into the edits above; a host sends these and draws pi_view. */
#define PI_CMD_KEY_DOWN 32u /* a: PI_KEY_*. A key already down, or a number past 22: ignored */
#define PI_CMD_KEY_UP 33u   /* a: PI_KEY_*. A key not down: ignored */
#define PI_CMD_PARAM 34u    /* a: 0 slider A, 1 slider B; value: 0..65535, clamped. That slider
                               of every sound (ABI 8: the hand's); with bpm held, swing (A) and
                               tempo (B). A value equal to the one pi_view shows for that slider
                               changes nothing. A grid key in write mode that turns a step on
                               also keeps the chosen sound's A and B for it */

/* Keys. 0..15 are the grid, left to right, top to bottom. */
#define PI_KEY_SOUND 16u
#define PI_KEY_PATTERN 17u
#define PI_KEY_BPM 18u
#define PI_KEY_FUNCTION 19u
#define PI_KEY_FX 20u
#define PI_KEY_PLAY 21u
#define PI_KEY_WRITE 22u

/* The view: where each field is in pi_view's block (ENGINE.md section 14). Little-endian. */
#define PI_VIEW_TICK 0u     /* u32: the latest tick emitted */
#define PI_VIEW_TEMPO 4u    /* u32: thousandths of a bpm */
#define PI_VIEW_HELD 8u     /* u32: bit k, key k is down */
#define PI_VIEW_FIELD 12u   /* u16: bit n lights grid key n's face */
#define PI_VIEW_STITCH 14u  /* u16: bit n puts the corner stitch on key n */
#define PI_VIEW_BAR 16u     /* u16: bit n puts the bar on key n */
#define PI_VIEW_SAMPLED 18u /* u16: bit t, track t plays its sample */
#define PI_VIEW_A 20u       /* u16: slider A's cap: the hand's (ABI 8), or swing with bpm held */
#define PI_VIEW_B 22u       /* u16: slider B's cap: the hand's, or the tempo with bpm held */
#define PI_VIEW_FLAGS 24u   /* u8: PI_VIEW_FLAG_* */
#define PI_VIEW_STEP 25u    /* u8: the playhead's step; means something while PI_VIEW_FLAG_STEP */
#define PI_VIEW_SEL 26u     /* u8: the chosen sound */
#define PI_VIEW_VOLUME 27u  /* u8: 1..PI_VOLUME_MAX */
#define PI_VIEW_LENGTH 28u  /* u8 */
#define PI_VIEW_SWING 29u   /* u8 */
#define PI_VIEW_EXT 30u     /* u16, ABI 15: the tempo the edges are playing, tenths of a bpm; 0 for
                               none (on the table, before two edges, an edge a period late) */
#define PI_VIEW_FIRES 32u   /* PI_TRACKS u8s: how often each track has fired, wrapping at 256 */
/* 48 to 54: the weave's (ABI 10, section 16). */
#define PI_VIEW_WOVEN 48u     /* u32: steps woven since play began, or since a reset while playing;
                                 held when stopped */
#define PI_VIEW_WOVE 52u      /* u16: bit i, the step woven i steps ago had a sound set as it arrived */
#define PI_VIEW_ON_STEP 54u   /* u8: how many tracks have fired on the playhead's step so far, taps
                                 included; 0 unless PI_VIEW_FLAG_STEP */
#define PI_VIEW_HEARD 55u     /* u8: the effect heard now, 1..16, or 0 (section 17) */
#define PI_VIEW_FX_STEPS 56u  /* u16: bit s, step s of the lane holds an effect */
#define PI_VIEW_FX_SOUNDS 58u /* u16: bit t, track t goes through the effects */
#define PI_VIEW_HIT_A 60u     /* u16: the A the chosen sound was last hit with, its own until then
                                 (ABI 8, section 20): a slider's second mark */
#define PI_VIEW_HIT_B 62u     /* u16: the same for B */

#define PI_VIEW_FLAG_PLAYING 1u
#define PI_VIEW_FLAG_WRITE 2u
#define PI_VIEW_FLAG_EDGES 4u   /* the clock source is PI_SOURCE_EDGES or (ABI 15) PI_SOURCE_BEATS */
#define PI_VIEW_FLAG_STEP 8u    /* a step has arrived since play or reset; clear when stopped */
#define PI_VIEW_FLAG_SOUNDS 16u /* the grid is sixteen sounds, not sixteen steps */

/* Event types. */
#define PI_EV_STEP 1u /* the playhead arrived on a step; never swung */
#define PI_EV_TRIG 2u /* a track fired */

/* pi_load results. */
#define PI_OK 0
#define PI_ERR_SIZE (-1)    /* too short, or the size field is wrong */
#define PI_ERR_MAGIC (-2)   /* not a snapshot, or another instrument's */
#define PI_ERR_VERSION (-3) /* a version this core never wrote: a newer one, or 0 */
#define PI_ERR_CRC (-4)

/* An input, timestamped inside the block. 12 bytes, little-endian, no padding. */
typedef struct pi_cmd {
    uint32_t frame; /* offset in this block; must not decrease along the array */
    uint8_t type;   /* PI_CMD_* */
    uint8_t a;
    uint8_t b;
    uint8_t slot;   /* which instrument on the table; 0 in ABI 1 */
    uint32_t value;
} pi_cmd;

/* An output. 12 bytes. The trace is (tick, type, track, step); frame is for the host only. */
typedef struct pi_event {
    uint32_t frame; /* offset in this block */
    uint32_t tick;  /* ticks since reset; wraps */
    uint8_t type;   /* PI_EV_* */
    uint8_t track;  /* PI_EV_TRIG: the track; otherwise 0 */
    uint8_t step;   /* the pattern step, 0..PI_STEPS-1 */
    uint8_t slot;   /* 0 in ABI 1 */
} pi_event;

typedef struct pi_engine pi_engine; /* opaque */

/* PI_ABI_VERSION as built. A host refuses a core whose number differs from its header's. */
uint32_t pi_abi_version(void);

/* The memory one engine needs. */
uint32_t pi_size(void);
uint32_t pi_align(void);

/* Build an engine in the caller's memory: stopped, on the table clock at 120 bpm, pattern
 * empty. Returns 0 if mem is null, too small or misaligned, or sample_rate is 0.
 * A seed of 0 is replaced by a fixed non-zero value. */
pi_engine *pi_init(void *mem, uint32_t size, uint32_t sample_rate, uint32_t seed);

/* Between blocks only. Keeps the table clock's phase. */
void pi_set_sample_rate(pi_engine *engine, uint32_t sample_rate);

/* Run `frames` frames (at least 1; 0 does nothing). Applies each command at its frame, then advances the
 * clock by that frame. Writes at most `cap` events and returns how many. Events that do not
 * fit are dropped and counted. Never allocates, never blocks.
 *
 * Sound: `audio` has room for frames * channels floats, frame by frame, about -1 to 1 (it is
 * a sum, so a host must not assume it stays inside). A track that fires on a frame sounds
 * from that frame. With `audio` null or `channels` PI_AUDIO_NONE nothing is written and no
 * voice runs: the events are the same either way. In a loop layout (PI_AUDIO_LOOP and
 * PI_AUDIO_LOOP_SLIDERS) `audio` is read as well, frame by frame, before it is written. */
uint32_t pi_process(pi_engine *engine, uint32_t frames,
                    const pi_cmd *cmds, uint32_t ncmds,
                    pi_event *events, uint32_t cap,
                    float *audio, uint32_t channels);

/* Everything a host draws, as one block. Returns PI_VIEW_SIZE, or 0 if cap is too small.
 * On the audio thread, like every function on an engine. Moves nothing. */
uint32_t pi_view(const pi_engine *engine, uint8_t *buf, uint32_t cap);

/* The display's animation (ABI 10; ENGINE.md section 16): a cloth being woven, as cells of
 * 1 mm, row by row from the top left, one byte each, a palette number. A host paints the cells
 * and holds no drawing rule. */
#define PI_WEAVE_W 78u
#define PI_WEAVE_H 15u
#define PI_WEAVE_CELLS (PI_WEAVE_W * PI_WEAVE_H)
#define PI_WEAVE_REDUCED 1u /* pi_weave's flags: reduced motion. The shuttle jumps; nothing flashes */
/* The palette: design/DESIGN.md's tokens. A host paints nothing for 0. */
#define PI_WEAVE_DISPLAY 0u
#define PI_WEAVE_THREAD 1u
#define PI_WEAVE_ECRU 2u
#define PI_WEAVE_WHITE 3u
#define PI_WEAVE_OCHRE 4u
#define PI_WEAVE_TILE 5u
#define PI_WEAVE_MADDER 6u
#define PI_WEAVE_COLOURS 7u

/* The weave for a view: PI_WEAVE_CELLS palette numbers to `out`. A pure function of the view's
 * bytes: it takes no engine, so any thread may call it (a drawing thread; the page, in its own
 * instance of the .wasm). `len` is the view's length, at least PI_VIEW_SIZE. Returns
 * PI_WEAVE_CELLS, or 0 with nothing written if a pointer is null, `len` is short or `cap` is
 * too small. */
uint32_t pi_weave(const uint8_t *view, uint32_t len, uint32_t flags, uint8_t *out, uint32_t cap);

/* D50: track `track`'s sample: `frames` 16-bit mono frames at PI_SAMPLE_RATE, native byte
 * order. `data` must stay readable and unchanged until this track's sample is set again, or
 * the engine is re-initialised. Null or 0 frames clears it. Returns 1 if taken, 0 if cleared
 * or refused (track >= PI_TRACKS, data not 2-byte aligned). A sample sounding stops. */
uint32_t pi_set_sample(pi_engine *engine, uint32_t track, const int16_t *data, uint32_t frames);

/* ABI 12 (ENGINE.md section 18, designed 2026-11-24): effect 4's delay line, lent by the host.
 * pi_delay_frames: how many floats the line needs at that rate, (rate * 8192 + 23437) / 46875,
 * the nearest frame to 174.76 ms (7707 at 44.1 kHz, 8389 at 48 kHz, 16777 at 96 kHz). No
 * engine: any thread may call it.
 * pi_set_delay: lends `frames` floats. Returns 1 if taken: `line` not null, 4-byte aligned and
 * `frames` at least pi_delay_frames of the engine's rate now. Otherwise the engine holds no
 * line and 0 is returned. The core writes there, inside pi_process only, never past
 * pi_delay_frames of its rate; what the line holds when lent is never heard. The caller keeps
 * it alive and does not touch it until it lends again or re-initialises the engine. pi_init
 * starts with none, and pi_set_sample_rate, when it changes the rate, forgets it: lend again.
 * Not in any snapshot. With no line, effect 4 has no sound of the core's, as before ABI 12.
 * Since ABI 13 effect 14 uses the same line, its first (rate * 858 + 23437) / 46875 floats
 * (18.30 ms): with no line, 14 has no sound of the core's either. */
uint32_t pi_delay_frames(uint32_t sample_rate);
uint32_t pi_set_delay(pi_engine *engine, float *line, uint32_t frames);

/* Events dropped since pi_init, saturating. Zero in any correct host. */
uint32_t pi_dropped(const pi_engine *engine);

/* Changes whenever a command changes what a snapshot would hold, and (ABI 6) whenever a step
 * arriving with fx held changes the lane. */
uint32_t pi_generation(const pi_engine *engine);

/* Write a snapshot. Returns PI_SNAPSHOT_SIZE, or 0 if cap is too small. */
uint32_t pi_save(const pi_engine *engine, uint8_t *buf, uint32_t cap);

/* Read a snapshot of this or any older version. On any error nothing changes. Replaces the
 * pattern and settings and reseeds the random generator; leaves the playhead and clock.
 * An older version sets what it does not hold to pi_init's values. Bytes past that
 * version's size are not read: pass the length read, not a fixed size. Moves pi_generation. */
int32_t pi_load(pi_engine *engine, const uint8_t *buf, uint32_t len);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* PI_ENGINE_H */
