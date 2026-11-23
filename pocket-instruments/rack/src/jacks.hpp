// Volts in and volts out: what the Rhythm module's jacks carry, against the core's loop frame
// (ENGINE.md §19; pi_engine.h, PI_AUDIO_LOOP). Pure: no Rack, no core calls, no allocation, so
// rack/test/jacks.cpp holds it to the core with the same compiler flags the plugin ships with.
//
// Until Session 18 this file also rebuilt AUDIO's mix when RETURN was patched (D62). The
// returns are in the core now (§19), so that the effects reach a returned sound, and what is
// left here is the scaling, the trigger pulses and the masks.
//
//   in    RETURN     sixteen channels, 5 V to 1.0, as VOICES: the core's channels 0 to 15
//         FX RETURN  one channel, 5 V to 1.0: the core's channel 17
//         A IN, B IN sixteen channels each, 0 to 10 V for a slider's travel: channels 18 to 49
//   out   VOICES     sixteen channels: each track alone, before the master, 5 V to 1.0
//         TRIGGERS   sixteen channels: 10 V for 1 ms from each firing (RACK-RULES.md), a tap's too
//         AUDIO      the core's mix, 5 V to 1.0, bent by tanh towards 10 V as the Probe bends it
//         FX SEND    the bus before any effect and before the volume, 5 V to 1.0
//         FX GATES   sixteen channels: 10 V on channel n while effect n is heard (D68)
//         A OUT, B OUT  sixteen channels each: 0 to 10 V, what each sound was last hit with
//
// Dividing by 5 and by 10 needs the compiler to keep them divisions: Rack builds with
// -funsafe-math-optimizations, which would make them multiplications by a rounded 0.2 and 0.1.
// rack/math.mk turns that off for the whole plugin, and the test is built with the same.
//
// Never a non-finite sample down a cable: a NaN or infinity becomes 0 and is counted. Coming
// in, the core takes what is not a number as silence (§19), so nothing is cleaned here twice.
//
// SPDX-License-Identifier: MIT
#pragma once

#include <cmath>
#include <cstdint>

#include "pi_engine.h"

namespace pi {

struct JackFrame {
    float voices[PI_TRACKS];
    float triggers[PI_TRACKS];
    float mix;   // AUDIO before the 5 V and the tanh: what the tests hold to the core's
    float audio;
    float send;  // FX SEND; written only from a loop frame
};

// ---- Volts in: the host fills the core's loop frame before pi_process. ----

// RETURN: `volts` is the cable's sixteen channels; only the sounds in `mask` are written (the
// core reads no others).
inline void returnIn(float *io, const float *volts, uint32_t mask) {
    for (uint32_t t = 0; t < PI_TRACKS; t++)
        if (mask >> t & 1) io[t] = volts[t] / 5.f;
}
inline void fxReturnIn(float *io, float volts) { io[PI_LOOP_FX] = volts / 5.f; }
// A IN (`first` PI_LOOP_A) or B IN (PI_LOOP_B): the core holds each to 0 to 1.
inline void sliderIn(float *io, uint32_t first, const float *volts, uint32_t mask) {
    for (uint32_t t = 0; t < PI_TRACKS; t++)
        if (mask >> t & 1) io[first + t] = volts[t] / 10.f;
}

// Which of a sixteen-channel input's channels are taken (D62 item 3; A IN and B IN the same,
// D76 item 4). `chosen` is the menu's ticks, or negative for "As the cable carries": channel 1
// up to the cable's count.
inline uint32_t returnMask(int32_t chosen, int channels) {
    if (channels <= 0) return 0;
    if (chosen >= 0) return uint32_t(chosen) & 0xffffu;
    return channels >= int(PI_TRACKS) ? 0xffffu : (1u << channels) - 1;
}

// Which effects are heard from FX RETURN (D68 item 2): none while it is unpatched; else the
// menu's ticks, or (negative) the ones the core has no sound for: 4 and 13 to 16 (D80).
const uint32_t FX_OUTSIDE_DEFAULT = 1u << 3 | 0xf000u;
inline uint32_t fxMask(int32_t chosen, bool patched) {
    if (!patched) return 0;
    return chosen >= 0 ? uint32_t(chosen) & 0xffffu : FX_OUTSIDE_DEFAULT;
}

// ---- Volts out. ----

struct Jacks {
    uint32_t trigLeft[PI_TRACKS] = {}; // frames each trigger has still to stay high
    uint32_t notFinite = 0;            // samples that would have gone out as NaN or infinity

    float safe(float v) {
        if (std::isfinite(v)) return v;
        notFinite++;
        return 0.f;
    }

    // `frame` is one frame from pi_process, PI_AUDIO_BOTH or either loop layout: sixteen
    // tracks, then the core's mix. `events` are that frame's. `trigFrames` is 1 ms at the
    // rate, at least 1.
    void frame(const float *frame, const pi_event *events, uint32_t nevents, uint32_t trigFrames, JackFrame &out) {
        for (uint32_t i = 0; i < nevents; i++)
            if (events[i].type == PI_EV_TRIG && events[i].track < PI_TRACKS) trigLeft[events[i].track] = trigFrames;
        for (uint32_t t = 0; t < PI_TRACKS; t++) {
            out.voices[t] = safe(5.f * frame[t]);
            out.triggers[t] = trigLeft[t] ? 10.f : 0.f;
            if (trigLeft[t]) trigLeft[t]--;
        }
        out.mix = frame[PI_LOOP_MIX];
        float v = safe(5.f * out.mix);
        out.audio = v == 0.f ? v : 10.f * std::tanh(v / 10.f); // silence (±0) costs no tanh; tanh(±0) is ±0
    }

    // FX SEND, from a loop frame.
    float send(const float *loop) { return safe(5.f * loop[PI_LOOP_FX]); }

    // A OUT (`first` PI_LOOP_A) or B OUT (PI_LOOP_B), from a PI_AUDIO_LOOP_SLIDERS frame.
    void sliderOut(const float *loop, uint32_t first, float *volts) {
        for (uint32_t t = 0; t < PI_TRACKS; t++) volts[t] = safe(10.f * loop[first + t]);
    }
};

// FX GATES: 10 V on channel n while effect n is heard (the view's PI_VIEW_HEARD), 0 otherwise.
inline float gate(uint32_t heard, uint32_t channel) { return heard == channel + 1 ? 10.f : 0.f; }

// The layout a frame needs (§19): the sliders' fifty channels only when one of the four
// slider jacks is in use, the loop's eighteen only when something comes back or FX SEND goes
// out, and otherwise PI_AUDIO_BOTH, exactly as before the loops existed.
inline uint32_t layout(bool sliders, bool loop) { return sliders ? PI_AUDIO_LOOP_SLIDERS : loop ? PI_AUDIO_LOOP : PI_AUDIO_BOTH; }

} // namespace pi
