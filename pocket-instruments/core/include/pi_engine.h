/* Pocket Instruments: the engine's C ABI, version 1.
 *
 * The contract both hosts link. ENGINE.md beside the crate is the specification; this file is
 * the same thing in C. Where they disagree, ENGINE.md is right.
 *
 * Rules of the ABI: only uint32_t, int32_t and pointers cross it. No floats, no 64-bit
 * values, no structs by value, no callbacks, no globals. The caller owns all memory.
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

#define PI_ABI_VERSION 1u

#define PI_TICKS_PER_STEP 96u /* a step is a sixteenth note */
#define PI_TRACKS 16u         /* one per grid key: key n plays track n (D30) */
#define PI_STEPS 16u
#define PI_SWING_MAX 48u      /* ticks an odd grid step is late by, at most */
#define PI_MBPM_MIN 30000u    /* tempo is in thousandths of a bpm */
#define PI_MBPM_MAX 300000u
#define PI_EVENTS_MIN 64u     /* the least room a host gives pi_process for events */
#define PI_SNAPSHOT_VERSION 1u
#define PI_SNAPSHOT_SIZE 316u /* bytes, for PI_SNAPSHOT_VERSION */

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
#define PI_CMD_KEY_DOWN 32u /* a: PI_KEY_*. Reserved: ignored by ABI 1 */
#define PI_CMD_KEY_UP 33u   /* a: PI_KEY_*. Reserved */
#define PI_CMD_PARAM 34u    /* a: 0 slider A, 1 slider B; value: 0..65535. Reserved */

/* Keys. 0..15 are the grid, left to right, top to bottom. */
#define PI_KEY_SOUND 16u
#define PI_KEY_PATTERN 17u
#define PI_KEY_BPM 18u
#define PI_KEY_FUNCTION 19u
#define PI_KEY_FX 20u
#define PI_KEY_PLAY 21u
#define PI_KEY_WRITE 22u

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
 * fit are dropped and counted. Never allocates, never blocks. */
uint32_t pi_process(pi_engine *engine, uint32_t frames,
                    const pi_cmd *cmds, uint32_t ncmds,
                    pi_event *events, uint32_t cap);

/* Events dropped since pi_init, saturating. Zero in any correct host. */
uint32_t pi_dropped(const pi_engine *engine);

/* Changes whenever a command changes what a snapshot would hold. */
uint32_t pi_generation(const pi_engine *engine);

/* Write a snapshot. Returns PI_SNAPSHOT_SIZE, or 0 if cap is too small. */
uint32_t pi_save(const pi_engine *engine, uint8_t *buf, uint32_t cap);

/* Read a snapshot of this or any older version. On any error nothing changes. Replaces the
 * pattern and settings and reseeds the random generator; leaves the playhead and clock.
 * Bytes past PI_SNAPSHOT_SIZE are not read. Moves pi_generation. */
int32_t pi_load(pi_engine *engine, const uint8_t *buf, uint32_t len);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* PI_ENGINE_H */
