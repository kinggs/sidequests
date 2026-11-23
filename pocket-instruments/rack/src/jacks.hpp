// What the Rhythm module puts on its output jacks for one frame, and how RETURN takes a sound's
// place in AUDIO (D62). Pure: no Rack, no core calls, no allocation, so rack/test/jacks.cpp
// holds it to the core's own mix with the same compiler flags the plugin ships with.
//
//   VOICES    sixteen channels: each track alone, before the master (ENGINE.md §11, §13),
//             5 V to 1.0.
//   TRIGGERS  sixteen channels: 10 V for 1 ms from each firing (RACK-RULES.md), a tap's too.
//   AUDIO     the mix, 5 V to 1.0, bent by tanh towards 10 V as the Probe bends it.
//             RETURN unpatched (or no channel taken): the core's mix as it is, bit for bit.
//             RETURN patched: Σ (returned or own) × (volume / 16)², in the core's order
//             (core/src/voice.rs, Voices::render), then the same 5 V and tanh. Channel n of
//             RETURN is 5 V to 1.0, as VOICES is.
//
// The core's order needs the compiler to keep it: Rack builds with -funsafe-math-optimizations,
// which lets it regroup the sum (and the test caught it doing so). rack/math.mk turns the two
// parts that change bits back off for the whole plugin.
//
// Never a non-finite sample down a cable: a NaN or infinity becomes 0 and is counted, and a
// returned channel that is not finite counts as silence.
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

struct Jacks {
    uint32_t trigLeft[PI_TRACKS] = {}; // frames each trigger has still to stay high
    uint32_t notFinite = 0;            // samples that would have gone out as NaN or infinity

    float safe(float v) {
        if (std::isfinite(v)) return v;
        notFinite++;
        return 0.f;
    }

    // `both` is one frame of PI_AUDIO_BOTH: sixteen tracks, then the core's mix. `events` are
    // that frame's. `ret` is RETURN's sixteen voltages, read only for the tracks in `retMask`
    // (bit t: track t comes from RETURN); null or 0 means unpatched. `volume` is the view's
    // (ENGINE.md §14), 1 to 16. `trigFrames` is 1 ms at the rate, at least 1.
    void frame(const float *both, const pi_event *events, uint32_t nevents, uint32_t trigFrames,
               const float *ret, uint32_t retMask, uint32_t volume, JackFrame &out) {
        for (uint32_t i = 0; i < nevents; i++)
            if (events[i].type == PI_EV_TRIG && events[i].track < PI_TRACKS) trigLeft[events[i].track] = trigFrames;
        for (uint32_t t = 0; t < PI_TRACKS; t++) {
            out.voices[t] = safe(5.f * both[t]);
            out.triggers[t] = trigLeft[t] ? 10.f : 0.f;
            if (trigLeft[t]) trigLeft[t]--;
        }
        float mix = both[PI_TRACKS];
        if (ret && retMask) {
            float v[PI_TRACKS];
            for (uint32_t t = 0; t < PI_TRACKS; t++) {
                float r = (retMask >> t & 1) ? ret[t] / 5.f : both[t];
                v[t] = std::isfinite(r) ? r : 0.f;
            }
            // The core's order and the core's gain, so a sound returned unchanged gives the
            // core's mix (rack/test/jacks.cpp holds it to that).
            float sum = v[0];
            for (uint32_t t = 1; t < PI_TRACKS; t++) sum += v[t];
            mix = sum * (float(volume * volume) / 256.f);
        }
        out.mix = mix;
        float v = safe(5.f * mix);
        out.audio = v == 0.f ? v : 10.f * std::tanh(v / 10.f); // silence (±0) costs no tanh; tanh(±0) is ±0
    }
};

// Which of RETURN's channels take a sound's place (D62 item 3). `chosen` is the menu's ticks,
// or negative for "As the cable carries": channel 1 up to the cable's count.
inline uint32_t returnMask(int32_t chosen, int channels) {
    if (channels <= 0) return 0;
    if (chosen >= 0) return uint32_t(chosen) & 0xffffu;
    return channels >= int(PI_TRACKS) ? 0xffffu : (1u << channels) - 1;
}

} // namespace pi
