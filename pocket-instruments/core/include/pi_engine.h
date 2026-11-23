/* Pocket Instruments: the engine's C ABI, version 7 (1 plus sound: D44; 3 adds samples: D50;
 * 4 adds keys and the view: D51; 5 adds snapshot version 2 and PI_AUDIO_BOTH: D55, D57;
 * 6 adds the lane, the fx key, the four repeats and snapshot version 3: D66, D67;
 * 7 adds the bus and seven sound effects on the mix, with no new call or command: D67).
 *
 * The contract both hosts link. ENGINE.md beside the crate is the specification; this file is
 * the same thing in C. Where they disagree, ENGINE.md is right.
 *
 * Rules of the ABI: only uint32_t, int32_t and pointers cross it. No float arguments, no
 * 64-bit values, no structs by value, no callbacks, no globals. The caller owns all memory.
 * Sound leaves through a pointer to the caller's floats. The core keeps one kind of pointer:
 * a track's sample, given with pi_set_sample, which the caller keeps alive (D50).
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

#define PI_ABI_VERSION 7u

#define PI_TICKS_PER_STEP 96u /* a step is a sixteenth note */
#define PI_TRACKS 16u         /* one per grid key: key n plays track n (D30) */
#define PI_SAMPLE_RATE 44100u /* every sample's rate (pi_set_sample) */
#define PI_STEPS 16u
#define PI_SWING_MAX 48u      /* ticks an odd grid step is late by, at most */
#define PI_MBPM_MIN 30000u    /* tempo is in thousandths of a bpm */
#define PI_MBPM_MAX 300000u
#define PI_EVENTS_MIN 64u     /* the least room a host gives pi_process for events */
#define PI_SNAPSHOT_VERSION 3u   /* what pi_save writes; pi_load also takes versions 1 and 2 */
#define PI_SNAPSHOT_SIZE 408u    /* bytes, for PI_SNAPSHOT_VERSION */
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
                               and before any effect */
#define PI_AUDIO_BOTH 17u   /* PI_AUDIO_TRACKS's sixteen, then PI_AUDIO_MIX's one: the same bits as each */

/* Clock sources (PI_CMD_SOURCE). */
#define PI_SOURCE_TABLE 0u /* the engine counts frames at its tempo */
#define PI_SOURCE_EDGES 1u /* the engine follows PI_CMD_CLOCK; one edge is one step */

/* Command types. Unknown types are ignored. */
#define PI_CMD_CLOCK 1u     /* an edge */
#define PI_CMD_RESET 2u
#define PI_CMD_SOURCE 3u    /* value: PI_SOURCE_*. The source already in use: nothing happens */
#define PI_CMD_TEMPO 4u     /* value: thousandths of a bpm, clamped */
#define PI_CMD_PLAY 5u      /* value: 0 stop, 1 play from the next step boundary */
#define PI_CMD_STEP 16u     /* a: track, b: step, value: 0 or 1 */
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
/* What a finger did (ABI 4; ENGINE.md section 13). The core runs the workflow and turns each
 * into the edits above; a host sends these and draws pi_view. */
#define PI_CMD_KEY_DOWN 32u /* a: PI_KEY_*. A key already down, or a number past 22: ignored */
#define PI_CMD_KEY_UP 33u   /* a: PI_KEY_*. A key not down: ignored */
#define PI_CMD_PARAM 34u    /* a: 0 slider A, 1 slider B; value: 0..65535, clamped. The chosen
                               sound's slider; with bpm held, swing (A) and tempo (B). A value
                               equal to the one pi_view shows for that slider changes nothing */

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
#define PI_VIEW_A 20u       /* u16: slider A as it should show */
#define PI_VIEW_B 22u       /* u16: slider B as it should show */
#define PI_VIEW_FLAGS 24u   /* u8: PI_VIEW_FLAG_* */
#define PI_VIEW_STEP 25u    /* u8: the playhead's step; means something while PI_VIEW_FLAG_STEP */
#define PI_VIEW_SEL 26u     /* u8: the chosen sound */
#define PI_VIEW_VOLUME 27u  /* u8: 1..PI_VOLUME_MAX */
#define PI_VIEW_LENGTH 28u  /* u8 */
#define PI_VIEW_SWING 29u   /* u8 */
#define PI_VIEW_FIRES 32u   /* PI_TRACKS u8s: how often each track has fired, wrapping at 256 */
/* 48 to 54: the weave's (section 16), zero until it is built. 60 to 63: zero. */
#define PI_VIEW_HEARD 55u     /* u8: the effect heard now, 1..16, or 0 (section 17) */
#define PI_VIEW_FX_STEPS 56u  /* u16: bit s, step s of the lane holds an effect */
#define PI_VIEW_FX_SOUNDS 58u /* u16: bit t, track t goes through the effects */

#define PI_VIEW_FLAG_PLAYING 1u
#define PI_VIEW_FLAG_WRITE 2u
#define PI_VIEW_FLAG_EDGES 4u   /* the clock source is PI_SOURCE_EDGES */
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
 * voice runs: the events are the same either way. */
uint32_t pi_process(pi_engine *engine, uint32_t frames,
                    const pi_cmd *cmds, uint32_t ncmds,
                    pi_event *events, uint32_t cap,
                    float *audio, uint32_t channels);

/* Everything a host draws, as one block. Returns PI_VIEW_SIZE, or 0 if cap is too small.
 * On the audio thread, like every function on an engine. Moves nothing. */
uint32_t pi_view(const pi_engine *engine, uint8_t *buf, uint32_t cap);

/* D50: track `track`'s sample: `frames` 16-bit mono frames at PI_SAMPLE_RATE, native byte
 * order. `data` must stay readable and unchanged until this track's sample is set again, or
 * the engine is re-initialised. Null or 0 frames clears it. Returns 1 if taken, 0 if cleared
 * or refused (track >= PI_TRACKS, data not 2-byte aligned). A sample sounding stops. */
uint32_t pi_set_sample(pi_engine *engine, uint32_t track, const int16_t *data, uint32_t frames);

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
