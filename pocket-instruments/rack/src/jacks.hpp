// Volts in and volts out: what the Rhythm module's jacks carry, against the core's loop frame
// (ENGINE.md §19; pi_engine.h, PI_AUDIO_LOOP). Pure: no Rack, no core calls, no allocation, so
// rack/test/jacks.cpp holds it to the core with the same compiler flags the plugin ships with.
//
// Until Session 18 this file also rebuilt AUDIO's mix when RETURN was patched (D62). The
// returns are in the core now (§19), so that the effects reach a returned sound, and what is
// left here is the scaling, the trigger pulses and the masks.
//
//   in    RETURN     sixteen channels, 5 V to 1.0, as VOICES: the core's channels 0 to 15
//         FX RETURN  every channel its cable carries, summed, 5 V to 1.0: the core's channel 17,
//                    added to the mix before the volume (ABI 11; D87, D88 item 11)
//         A IN, B IN sixteen channels each, 0 to 10 V for a slider's travel: channels 18 to 49
//   out   VOICES     sixteen channels: each track alone, before the master, 5 V to 1.0
//         TRIGGERS   sixteen channels: 10 V for 1 ms from each firing (RACK-RULES.md), a tap's too
//         AUDIO      the core's mix, 5 V to 1.0, bent by tanh towards 10 V as the Probe bends it
//         FX SEND    sixteen channels, a channel an effect: the bus before any effect and before
//                    the volume, 5 V to 1.0, times a gain that ramps in 2 ms while that effect is
//                    heard and out after (D88 items 4 and 5)
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
};

// ---- Volts in: the host fills the core's loop frame before pi_process. ----

// RETURN: `volts` is the cable's sixteen channels; only the sounds in `mask` are written (the
// core reads no others).
inline void returnIn(float *io, const float *volts, uint32_t mask) {
    for (uint32_t t = 0; t < PI_TRACKS; t++)
        if (mask >> t & 1) io[t] = volts[t] / 5.f;
}
// FX RETURN (D88 item 11): every channel the cable carries, summed in channel order as Rack's
// getVoltageSum does, then divided by 5. Unpatched (0 channels) it is 0, which the core adds
// as nothing.
inline void fxReturnIn(float *io, const float *volts, int channels) {
    float sum = 0.f;
    for (int c = 0; c < channels; c++) sum += volts[c];
    io[PI_LOOP_FX] = sum / 5.f;
}
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

// Each effect's setting (D88 item 1), in the menu and saved with the patch. All Ours at first.
//   Ours         the core's own effect plays, as on the phone
//   beside       Rack's, beside the dry: ours is silent and the dry stays (a send)
//   in place     Rack's, in place of the dry: ours is silent and the bus leaves the mix while
//                the effect is held, with the 2 ms ramp (an insert)
// Kept as two masks, bit n - 1 for effect n: the effects that are Rack's, and of those the ones
// in place of the dry. They become ROUTE 1 and ROUTE 4, and count only while FX SEND or FX
// RETURN is patched (D88 item 9): with neither, every effect is Ours, as on the phone.
enum FxSetting { FX_OURS, FX_BESIDE, FX_IN_PLACE };
// The repeats (9 to 12) offer Ours and in place of the dry only: a repeat always repeats, so
// "Rack's beside the dry" would be Ours (D88 item 3).
inline bool offersBeside(int effect) { return effect < 9 || effect > 12; }
struct FxSettings {
    uint32_t rack = 0, inPlace = 0;
    FxSetting of(int effect) const {
        uint32_t bit = 1u << (effect - 1);
        return !(rack & bit) ? FX_OURS : (inPlace & bit) ? FX_IN_PLACE : FX_BESIDE;
    }
    void set(int effect, FxSetting s) {
        uint32_t bit = 1u << (effect - 1);
        rack = s == FX_OURS ? rack & ~bit : rack | bit;
        inPlace = s == FX_IN_PLACE ? inPlace | bit : inPlace & ~bit;
    }
    uint32_t route(bool patched) const { return patched ? rack & 0xffffu : 0; }            // ROUTE 1
    uint32_t insert(bool patched) const { return patched ? rack & inPlace & 0xffffu : 0; } // ROUTE 4
    // A patch saved before ABI 11 kept FX RETURN's ticks as "fx": -1 for the defaults (which,
    // with every send live and the return summed, change nothing: all Ours), else a mask of the
    // effects that crossed over to FX RETURN, which is in place of the dry now (D88 item 2).
    static FxSettings fromOld(int32_t fx) {
        FxSettings s;
        if (fx >= 0) s.rack = s.inPlace = uint32_t(fx) & 0xffffu;
        return s;
    }
};

// The send's ramp, a frame: 2 ms, as the core's (ENGINE.md §18): 500 / rate, in the same float.
inline float rampStep(uint32_t rate) { return 500.f / float(rate ? rate : 1); }

// ---- Volts out. ----

struct Jacks {
    uint32_t trigLeft[PI_TRACKS] = {}; // frames each trigger has still to stay high
    uint32_t notFinite = 0;            // samples that would have gone out as NaN or infinity
    float fxGain[PI_TRACKS] = {};      // FX SEND: each effect's gain, 0 to 1
    uint32_t fxLive = 0;               // bit n - 1: effect n's gain is not 0

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

    // FX SEND, from a loop frame (D88 items 4 and 5): channel n is 5 V times the bus times
    // fxGain[n], which moves `step` (rampStep) a frame towards 1 while the view's `heard` is
    // effect n + 1 and towards 0 otherwise, whatever that effect's setting. Only the channels
    // whose gain is not 0 are visited: one that reaches 0 is written exactly 0 V once, and then
    // left, so `volts` (the output's own voltages) must start at 0. Every channel always live:
    // a send with nothing returned is the owner's kept patch (D87).
    void fxSend(const float *loop, uint32_t heard, float step, float *volts) {
        if (heard - 1 < PI_TRACKS) fxLive |= 1u << (heard - 1);
        if (!fxLive) return;
        float v = safe(5.f * loop[PI_LOOP_FX]);
        for (uint32_t m = fxLive; m; m &= m - 1) {
            uint32_t t = uint32_t(__builtin_ctz(m));
            float g = fxGain[t];
            if (t + 1 == heard) {
                g += step;
                if (g > 1.f) g = 1.f;
            } else {
                g -= step;
                if (g <= 0.f) {
                    g = 0.f;
                    fxLive &= ~(1u << t);
                }
            }
            fxGain[t] = g;
            volts[t] = g == 0.f ? 0.f : v * g;
        }
    }
    // A new engine: every gain at 0. The caller zeroes the output's voltages.
    void clearSend() {
        for (float &g : fxGain) g = 0.f;
        fxLive = 0;
    }

    // A OUT (`first` PI_LOOP_A) or B OUT (PI_LOOP_B), from a PI_AUDIO_LOOP_SLIDERS frame.
    void sliderOut(const float *loop, uint32_t first, float *volts) {
        for (uint32_t t = 0; t < PI_TRACKS; t++) volts[t] = safe(10.f * loop[first + t]);
    }
};

// FX GATES: 10 V on channel n while effect n is heard (the view's PI_VIEW_HEARD), 0 otherwise.
inline float gate(uint32_t heard, uint32_t channel) { return heard == channel + 1 ? 10.f : 0.f; }

// The layout a frame needs (§19): the sliders' fifty channels only when one of the four
// slider jacks is in use, the loop's eighteen only when RETURN takes a sound or FX SEND or FX
// RETURN is patched, and otherwise PI_AUDIO_BOTH, exactly as before the loops existed.
inline uint32_t layout(bool sliders, bool loop) { return sliders ? PI_AUDIO_LOOP_SLIDERS : loop ? PI_AUDIO_LOOP : PI_AUDIO_BOTH; }

// Whether this frame reads the keys and sliders (D99, Session 33): every 16th frame, as VCV's
// own modules read their parameters, under 0.4 ms late at 44.1 kHz; and every frame in a
// fixture self-test, whose views are held to the frame. `frame` is the module's own count,
// stepped every frame and 0 on the first, so the first frame scans; 2^32 is a multiple of 16,
// so the count wrapping keeps the gap. CLOCK, RESET, the menu's queue, the routes and the
// jacks are read on every frame, never through this. A press shorter than 16 frames can fall
// between two scans and is not seen (RACK-RULES.md); no hand can make one.
constexpr uint32_t SCAN_FRAMES = 16;
inline bool scans(uint32_t frame, bool fixtureTest) { return fixtureTest || frame % SCAN_FRAMES == 0; }

} // namespace pi
