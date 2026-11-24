// The Rhythm module's jacks, held to the core: rack/src/jacks.hpp, the volts in and volts out
// the module runs, on the native core, built with the Rack SDK's own maths flags (the Makefile
// says which), so what passes here is what ships.
//
// Until Session 18 jacks.hpp rebuilt AUDIO's mix itself when RETURN was patched, and this file
// held that rebuild to the core. The returns are in the core now (ENGINE.md §19), and those
// cases are core tests (core/src/tests/route.rs). What is held here is what is still the
// module's: the scaling each way, and that the whole path, volts to volts, is the core's.
//
//   unpatched      AUDIO is the core's mix bit for bit, at volume 16 and at volume 11, from
//                  PI_AUDIO_BOTH and from both loop layouts with nothing routed.
//   own-return     RETURN carrying a sound's own VOICES channel back gives the same mix: sound 1
//                  alone, and all sixteen at once. Not bit for bit, and it cannot be: VOICES is
//                  x times 5 and RETURN divides by 5, and in floats that does not always give x
//                  back. So the mix must be within OWN_RETURN_BOUND of the core's (about
//                  -120 dB), and the largest difference seen is printed.
//   silence        a return of silence on channel 1 removes the bass drum: AUDIO is bit for bit
//                  a second engine's that never had its steps, and VOICES and TRIGGERS are as
//                  they were.
//   punch          the owner's patch: every sound returned from its own VOICES, and effect 2
//                  punched by fx and key 2. AUDIO is the core's own render of that punch, to
//                  the same bound through the distortion's gain, and is not the dry beat: the
//                  effect is heard on the returned drums (it was not, until Session 18).
//   fx-send        (ABI 11, D88 items 4 and 5) FX SEND's sixteen channels: channel n is 0 V, or
//                  5 V times the bus times a gain that moves 500 / rate a frame towards 1 while
//                  effect n is heard and towards 0 after; 2 ms at three rates; two gains cross
//                  without a step; a channel never heard is not visited; the gains and the
//                  core's ramp leave 0 on the same frame; a new engine's gains are all 0.
//   fx-loop        the three settings through the volts (D88 item 1): effect 4 Ours (the core
//                  has none), effect 2 Ours, beside the dry and in place of it, each with FX
//                  RETURN's two channels summed into AUDIO; and unpatched, every effect Ours.
//                  (Until ABI 11: AUDIO crossed over to FX RETURN's one channel.)
//   sliders        A OUT's volts, patched back into A IN, give the hit the value they said.
//   mask           which channels RETURN takes, by the cable and by the menu (D62 item 3);
//                  the two masks the sixteen settings give, and none with neither FX jack
//                  patched; an old patch's "fx"; FX RETURN as the sum of its cable's channels;
//                  which layout a frame needs.
//   not-finite     a NaN returned is silence; nothing non-finite goes out.
//
// Each check names itself when it fails. Exit 0 only if all pass.
// SPDX-License-Identifier: MIT
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

#include "../src/jacks.hpp"

static int failures = 0;
static void check(bool ok, const char *name, const std::string &why) {
    if (!ok) {
        std::printf("FAILED %s: %s\n", name, why.c_str());
        failures++;
    }
}
static uint32_t bits(float f) {
    uint32_t u;
    std::memcpy(&u, &f, 4);
    return u;
}

struct Engine {
    alignas(16) uint8_t mem[4096];
    pi_engine *e;
    explicit Engine(uint32_t rate) : e(pi_init(mem, sizeof mem, rate, 1)) {
        if (!e || pi_size() > sizeof mem) {
            std::printf("FAILED setup: no engine\n");
            std::exit(1);
        }
    }
    uint32_t run(const pi_cmd *cmds, uint32_t n, float *audio, uint32_t channels, pi_event *ev) {
        return pi_process(e, 1, cmds, n, ev, PI_EVENTS_MIN, audio, channels);
    }
    uint32_t view(uint32_t at) const {
        uint8_t v[PI_VIEW_SIZE];
        pi_view(e, v, sizeof v);
        return at == PI_VIEW_HIT_A ? uint32_t(v[at] | v[at + 1] << 8) : v[at];
    }
};

static pi_cmd cmd(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0) { return pi_cmd{0, type, a, b, 0, value}; }

// A beat that sounds every kind of voice the mix can hold: four drums on the sixteenths, a tone,
// a sample (track 6, so the sum carries one), the bass drum on every beat; and a volume.
static std::vector<pi_cmd> beat(bool bassDrum, uint32_t volume) {
    std::vector<pi_cmd> c;
    c.push_back(cmd(PI_CMD_TEMPO, 0, 0, 132000));
    for (uint8_t s = 0; s < 16; s++) {
        if (bassDrum && s % 4 == 0) c.push_back(cmd(PI_CMD_STEP, 0, s, 1));
        if (s % 8 == 4) c.push_back(cmd(PI_CMD_STEP, 1, s, 1));
        c.push_back(cmd(PI_CMD_STEP, 2, s, 1));
        if (s % 4 == 2) c.push_back(cmd(PI_CMD_STEP, 3, s, 1));
        if (s % 3 == 0) c.push_back(cmd(PI_CMD_STEP, 14, s, 1));
        if (s % 5 == 1) c.push_back(cmd(PI_CMD_STEP, 6, s, 1));
    }
    c.push_back(cmd(PI_CMD_VOICE, 6, 0, 1));
    if (volume != 16) { // the bpm key and grid key volume - 1 set it (ENGINE.md §13)
        c.push_back(cmd(PI_CMD_KEY_DOWN, PI_KEY_BPM));
        c.push_back(cmd(PI_CMD_KEY_DOWN, uint8_t(volume - 1)));
        c.push_back(cmd(PI_CMD_KEY_UP, uint8_t(volume - 1)));
        c.push_back(cmd(PI_CMD_KEY_UP, PI_KEY_BPM));
    }
    c.push_back(cmd(PI_CMD_PLAY, 0, 0, 1));
    return c;
}

static std::vector<int16_t> sample() { // a short ramp: any data, so long as both engines have it
    std::vector<int16_t> s(2000);
    for (size_t i = 0; i < s.size(); i++) s[i] = int16_t((int(i) * 37) % 20000 - 10000);
    return s;
}

static const float OWN_RETURN_BOUND = 1e-6f; // in the mix's units, where 1.0 is 5 V
static const float PUNCH_BOUND = 1e-5f;      // the same through effect 2, which drives the bus by 6
static float worstOwnReturn = 0.f, worstPunch = 0.f;
static const uint32_t RATE = 48000, FRAMES = RATE * 2; // two seconds: past a bar at 132 bpm

// Unpatched, and a sound's own channel returned through the volts: the core's mix.
static void sameMix(uint32_t volume) {
    std::vector<int16_t> smp = sample();
    Engine both(RATE), mixOnly(RATE), loop(RATE), sliders(RATE), one(RATE), all(RATE);
    for (Engine *e : {&both, &mixOnly, &loop, &sliders, &one, &all}) pi_set_sample(e->e, 6, smp.data(), uint32_t(smp.size()));
    std::vector<pi_cmd> setup = beat(true, volume), setupOne = setup, setupAll = setup;
    setupOne.insert(setupOne.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, pi::returnMask(-1, 1)));
    setupAll.insert(setupAll.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, pi::returnMask(-1, 16)));
    pi::Jacks plain, jl, js, j1, jAll;
    uint32_t sounding = 0, firstBad[5] = {}, shapeAt = 0;
    bool shapeBad = false;
    bool bad[5] = {};
    for (uint32_t f = 0; f < FRAMES; f++) {
        float a[PI_AUDIO_BOTH], m, l[PI_AUDIO_LOOP], s[PI_AUDIO_LOOP_SLIDERS], x1[PI_AUDIO_LOOP], xa[PI_AUDIO_LOOP];
        pi_event ev[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        uint32_t n = f ? 0 : uint32_t(setup.size());
        uint32_t ne = both.run(setup.data(), n, a, PI_AUDIO_BOTH, ev);
        mixOnly.run(setup.data(), n, &m, PI_AUDIO_MIX, ev2);
        // With nothing routed nothing is read: what is in the frame beforehand does not matter.
        for (float &x : l) x = std::numeric_limits<float>::quiet_NaN();
        for (float &x : s) x = 3.f;
        s[PI_LOOP_FX] = 0.f; // but FX RETURN, read on every frame since ABI 11: unpatched it carries 0 V
        loop.run(setup.data(), n, l, PI_AUDIO_LOOP, ev2);
        sliders.run(setup.data(), n, s, PI_AUDIO_LOOP_SLIDERS, ev2);
        pi::JackFrame o0, ol, os, o1, o2;
        plain.frame(a, ev, ne, 48, o0);
        jl.frame(l, ev, ne, 48, ol);
        js.frame(s, ev, ne, 48, os);
        // VOICES, as a cable carries it back, into RETURN: sound 1 alone, then all sixteen.
        std::memset(x1, 0, sizeof x1);
        std::memset(xa, 0, sizeof xa);
        pi::returnIn(x1, o0.voices, pi::returnMask(-1, 1));
        pi::returnIn(xa, o0.voices, pi::returnMask(-1, 16));
        one.run(setupOne.data(), f ? 0 : uint32_t(setupOne.size()), x1, PI_AUDIO_LOOP, ev2);
        all.run(setupAll.data(), f ? 0 : uint32_t(setupAll.size()), xa, PI_AUDIO_LOOP, ev2);
        j1.frame(x1, ev, ne, 48, o1);
        jAll.frame(xa, ev, ne, 48, o2);
        if (m != 0.f) sounding++;
        const float got[5] = {o0.mix, ol.mix, os.mix, o1.mix, o2.mix};
        for (int i = 0; i < 5; i++) {
            float d = std::fabs(got[i] - m);
            if (i >= 3) worstOwnReturn = std::max(worstOwnReturn, d);
            if (!bad[i] && (i >= 3 ? !(d <= OWN_RETURN_BOUND) : bits(got[i]) != bits(m))) {
                bad[i] = true;
                firstBad[i] = f;
            }
        }
        if (!shapeBad && bits(o0.audio) != bits(10.f * std::tanh(5.f * o0.mix / 10.f))) {
            shapeBad = true; // the 5 V and tanh, applied to the mix it was given
            shapeAt = f;
        }
    }
    char why[200];
    check(sounding > FRAMES / 4, "setup", "the beat barely sounds");
    const char *layouts[3] = {"PI_AUDIO_BOTH", "PI_AUDIO_LOOP", "PI_AUDIO_LOOP_SLIDERS"};
    for (int i = 0; i < 3; i++) {
        std::snprintf(why, sizeof why, "volume %u: the mix from %s differs from the core's at frame %u", volume, layouts[i], firstBad[i]);
        check(!bad[i], "unpatched", why);
    }
    std::snprintf(why, sizeof why, "volume %u: AUDIO is not 10 tanh(5 mix / 10) at frame %u (this test and jacks.hpp built with different maths?)", volume, shapeAt);
    check(!shapeBad, "shaping", why);
    std::snprintf(why, sizeof why, "volume %u: sound 1 returned from VOICES is off the core's mix at frame %u", volume, firstBad[3]);
    check(!bad[3], "own-return", why);
    std::snprintf(why, sizeof why, "volume %u: all sixteen returned from VOICES are off the core's mix at frame %u", volume, firstBad[4]);
    check(!bad[4], "own-return", why);
}

// A return of silence on channel 1: the bass drum leaves AUDIO and nothing else changes.
static void silence() {
    std::vector<int16_t> smp = sample();
    Engine plainE(RATE), with(RATE), without(RATE);
    for (Engine *e : {&plainE, &with, &without}) pi_set_sample(e->e, 6, smp.data(), uint32_t(smp.size()));
    std::vector<pi_cmd> a = beat(true, 13), b = beat(false, 13), ar = a;
    ar.insert(ar.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, pi::returnMask(-1, 1)));
    pi::Jacks plain, silenced, other;
    uint32_t drum = 0, trigs = 0;
    bool audioBad = false, voicesBad = false, triggersBad = false, removedNothing = true;
    for (uint32_t f = 0; f < FRAMES; f++) {
        float x[PI_AUDIO_BOTH], xs[PI_AUDIO_LOOP], y[PI_AUDIO_BOTH];
        pi_event ev[PI_EVENTS_MIN], evs[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        uint32_t ne = plainE.run(a.data(), f ? 0 : uint32_t(a.size()), x, PI_AUDIO_BOTH, ev);
        std::memset(xs, 0, sizeof xs);
        const float zeroVolts[PI_TRACKS] = {}; // channel 1 carries 0 V; the cable carries only it
        pi::returnIn(xs, zeroVolts, pi::returnMask(-1, 1));
        uint32_t nes = with.run(ar.data(), f ? 0 : uint32_t(ar.size()), xs, PI_AUDIO_LOOP, evs);
        uint32_t ne2 = without.run(b.data(), f ? 0 : uint32_t(b.size()), y, PI_AUDIO_BOTH, ev2);
        pi::JackFrame p, s, o;
        plain.frame(x, ev, ne, 48, p);
        silenced.frame(xs, evs, nes, 48, s);
        other.frame(y, ev2, ne2, 48, o);
        if (x[0] != 0.f) drum++;
        if (p.triggers[0] != 0.f) trigs++;
        if (bits(s.mix) != bits(o.mix) || bits(s.audio) != bits(o.audio)) audioBad = true;
        if (bits(s.mix) != bits(p.mix)) removedNothing = false;
        if (std::memcmp(s.voices, p.voices, sizeof p.voices)) voicesBad = true;
        if (std::memcmp(s.triggers, p.triggers, sizeof p.triggers)) triggersBad = true;
    }
    check(drum > 0 && trigs > 0, "setup", "the bass drum never sounded or never triggered");
    check(!removedNothing, "silence", "AUDIO did not change when the bass drum was returned silent");
    check(!audioBad, "silence", "AUDIO is not the mix of the same beat without the bass drum");
    check(!voicesBad, "silence", "VOICES changed when RETURN was patched");
    check(!triggersBad, "silence", "TRIGGERS changed when RETURN was patched");
}

// The owner's patch (PLAN.md, Session 18): TRIGGERS out to drums, the drums back into RETURN,
// and a punch must be heard on them. Here the drums are the module's own VOICES.
static void punch() {
    std::vector<int16_t> smp = sample();
    Engine want(RATE), dry(RATE), voices(RATE), looped(RATE);
    for (Engine *e : {&want, &dry, &voices, &looped}) pi_set_sample(e->e, 6, smp.data(), uint32_t(smp.size()));
    std::vector<pi_cmd> setup = beat(true, 16), setupLoop = setup;
    setupLoop.insert(setupLoop.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, pi::returnMask(-1, 16)));
    const uint32_t from = RATE / 2, to = RATE * 3 / 2; // fx and key 2 down for a second
    pi::Jacks jv, jl;
    bool bad = false;
    uint32_t firstBad = 0, heardFrames = 0;
    float most = 0.f;
    for (uint32_t f = 0; f < FRAMES; f++) {
        std::vector<pi_cmd> c, cl, cd;
        if (!f) c = setup, cl = setupLoop, cd = setup;
        std::vector<pi_cmd> keys;
        if (f == from) keys = {cmd(PI_CMD_KEY_DOWN, PI_KEY_FX), cmd(PI_CMD_KEY_DOWN, 1)};
        if (f == to) keys = {cmd(PI_CMD_KEY_UP, 1), cmd(PI_CMD_KEY_UP, PI_KEY_FX)};
        c.insert(c.end(), keys.begin(), keys.end());
        cl.insert(cl.end(), keys.begin(), keys.end());
        float m, d, v[PI_AUDIO_BOTH], io[PI_AUDIO_LOOP] = {};
        pi_event ev[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        want.run(c.data(), uint32_t(c.size()), &m, PI_AUDIO_MIX, ev2);
        dry.run(cd.data(), uint32_t(cd.size()), &d, PI_AUDIO_MIX, ev2);
        uint32_t ne = voices.run(c.data(), uint32_t(c.size()), v, PI_AUDIO_BOTH, ev);
        pi::JackFrame ov, ol;
        jv.frame(v, ev, ne, 48, ov);
        pi::returnIn(io, ov.voices, pi::returnMask(-1, 16));
        uint32_t nl = looped.run(cl.data(), uint32_t(cl.size()), io, PI_AUDIO_LOOP, ev2);
        jl.frame(io, ev2, nl, 48, ol);
        float off = std::fabs(ol.mix - m);
        worstPunch = std::max(worstPunch, off);
        if (!bad && !(off <= PUNCH_BOUND)) {
            bad = true;
            firstBad = f;
        }
        if (looped.view(PI_VIEW_HEARD) == 2) {
            heardFrames++;
            most = std::max(most, std::fabs(ol.mix - d));
        }
    }
    char why[200];
    check(heardFrames > RATE / 2, "setup", "effect 2 was not heard for the second it was held");
    std::snprintf(why, sizeof why, "AUDIO with every sound returned is off the core's own punched render at frame %u", firstBad);
    check(!bad, "punch", why);
    std::snprintf(why, sizeof why, "the punch changed AUDIO by %.4f at most: it is not heard on the returned sounds", double(most));
    check(most > 0.05f, "punch", why);
}

// FX SEND's sixteen channels (D88 items 4 and 5), against the rule written plainly here: a
// gain a channel, up 500 / rate a frame while its effect is heard, down after, held to 0 and 1.
static void fxSend() {
    for (uint32_t rate : {44100u, 48000u, 96000u}) {
        const float step = pi::rampStep(rate);
        const uint32_t full = rate / 500;
        pi::Jacks j;
        float volts[PI_TRACKS], loop[PI_AUDIO_LOOP] = {}, g[PI_TRACKS] = {};
        for (float &v : volts) v = 7.f; // a channel never heard must never be written
        uint32_t upAt = 0;
        bool bad = false, jumped = false, touched = false;
        char why[200] = "";
        // Nothing heard for ten frames; effect 2 for 3 * full; effect 5 straight after for 3 * full;
        // then nothing, until both are back at 0.
        const uint32_t a = 10, b = a + 3 * full, c = b + 3 * full, end = c + 2 * full + 4;
        for (uint32_t f = 0; f < end; f++) {
            uint32_t heard = f >= a && f < b ? 2 : f >= b && f < c ? 5 : 0;
            loop[PI_LOOP_FX] = float(int(f % 97) - 48) / 97.f;
            float before[PI_TRACKS];
            std::memcpy(before, g, sizeof g);
            for (uint32_t t = 0; t < PI_TRACKS; t++) {
                if (t + 1 == heard) g[t] = g[t] + step > 1.f ? 1.f : g[t] + step;
                else g[t] = g[t] - step <= 0.f ? 0.f : g[t] - step;
                if (std::fabs(g[t] - before[t]) > step * 1.0001f) jumped = true;
            }
            j.fxSend(loop, heard, step, volts);
            if (heard == 2 && g[1] == 1.f && !upAt) upAt = f - a + 1;
            for (uint32_t t = 0; t < PI_TRACKS; t++) {
                // A channel is visited from the frame its effect is first heard; before, it is untouched.
                bool visited = (t == 1 && f >= a) || (t == 4 && f >= b);
                float want = visited ? (g[t] == 0.f ? 0.f : 5.f * loop[PI_LOOP_FX] * g[t]) : 7.f;
                if (bits(volts[t]) != bits(want) || j.fxGain[t] != g[t]) {
                    if (!bad) std::snprintf(why, sizeof why, "rate %u, frame %u, channel %u: %g V, the rule gives %g V", rate, f, t + 1, double(volts[t]), double(want));
                    bad = true;
                }
            }
            if (f >= b && f < b + full && g[1] > 0.f && g[4] > 0.f) touched = true; // both on: they cross
        }
        check(!bad, "fx-send", why);
        check(!jumped, "fx-send", "a gain moved by more than 500 / rate in a frame: two gains do not cross without a step");
        check(touched, "fx-send", "from effect 2 straight to 5 the two gains did not cross");
        std::snprintf(why, sizeof why, "rate %u: full after %u frames, not 2 ms (%u)", rate, upAt, full);
        check(upAt == full || upAt == full + 1, "fx-send", why);
        check(j.fxLive == 0 && volts[1] == 0.f && volts[4] == 0.f, "fx-send", "after the effects the channels are not back at exactly 0 V and unvisited");
        j.fxSend(loop, 9, step, volts);
        j.clearSend();
        bool zero = j.fxLive == 0;
        for (float x : j.fxGain) zero = zero && x == 0.f;
        check(zero, "fx-send", "a new engine's send gains are not all 0");
    }
    // The send's ramp and the core's leave 0 on the same frame (ENGINE.md, §19 designed
    // 2026-11-24, "The ramps start together"): sound 1 returned at a steady 0.25, effect 2
    // punched on frame 300 of one engine and not of its twin. The first frame the mixes differ
    // is the first frame FX SEND's channel 2 is not 0 V.
    Engine punched(RATE), twin(RATE);
    pi::Jacks j;
    float volts[PI_TRACKS] = {};
    int32_t mixFrom = -1, sendFrom = -1;
    for (uint32_t f = 0; f < 600; f++) {
        const pi_cmd start[2] = {cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 1), cmd(PI_CMD_PLAY, 0, 0, 1)};
        const pi_cmd punch[2] = {cmd(PI_CMD_KEY_DOWN, PI_KEY_FX), cmd(PI_CMD_KEY_DOWN, 1)};
        const pi_cmd *c = !f ? start : f == 300 ? punch : nullptr, *ct = !f ? start : nullptr;
        float io[PI_AUDIO_LOOP] = {}, it[PI_AUDIO_LOOP] = {};
        io[0] = it[0] = 0.25f;
        pi_event ev[PI_EVENTS_MIN];
        punched.run(c, c ? 2 : 0, io, PI_AUDIO_LOOP, ev);
        twin.run(ct, ct ? 2 : 0, it, PI_AUDIO_LOOP, ev);
        j.fxSend(io, punched.view(PI_VIEW_HEARD), pi::rampStep(RATE), volts);
        if (mixFrom < 0 && bits(io[PI_LOOP_MIX]) != bits(it[PI_LOOP_MIX])) mixFrom = int32_t(f);
        if (sendFrom < 0 && volts[1] != 0.f) sendFrom = int32_t(f);
    }
    char why[160];
    std::snprintf(why, sizeof why, "the core's ramp left 0 on frame %d and FX SEND's on frame %d", mixFrom, sendFrom);
    check(mixFrom == 300 && sendFrom == 300, "fx-send", why);
}

// The three settings through the volts: sound 1 returned at 1.25 V (0.25, in the bus), FX
// RETURN carrying 1 V and 1.5 V on two channels (0.5 summed), the effect held for 400 frames.
static void fxLoop() {
    const float x = 1.5f, clip = x * (27.f + x * x) / (27.f + 9.f * x * x) * 0.7f;
    struct Case {
        const char *what;
        int effect;
        pi::FxSetting setting;
        bool patched;
        float mix;
    } cases[] = {
        {"effect 4 Ours (no sound of ours): the dry and the return", 4, pi::FX_OURS, true, (0.25f + 0.5f) * 1.f},
        {"effect 2 Ours: our distortion, and the return", 2, pi::FX_OURS, true, ((0.f + 0.25f + 1.f * (clip - 0.25f)) + 0.5f) * 1.f},
        {"effect 2 Rack's beside the dry: the dry and the return", 2, pi::FX_BESIDE, true, (0.25f + 0.5f) * 1.f},
        {"effect 2 Rack's in place of the dry: the return alone", 2, pi::FX_IN_PLACE, true, ((0.f + 0.25f + 1.f * (0.f - 0.25f)) + 0.5f) * 1.f},
        {"effect 2 in place of the dry, neither jack patched: Ours, nothing back", 2, pi::FX_IN_PLACE, false, (0.f + 0.25f + 1.f * (clip - 0.25f)) * 1.f},
    };
    for (const Case &k : cases) {
        pi::FxSettings fx;
        fx.set(k.effect, k.setting);
        Engine e(RATE);
        pi::Jacks j;
        float volts[PI_TRACKS] = {};
        pi::JackFrame o{};
        for (uint32_t f = 0; f < 400; f++) {
            std::vector<pi_cmd> c;
            if (!f) c = {cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 1), cmd(PI_CMD_ROUTE, PI_ROUTE_FX, 0, fx.route(k.patched)),
                         cmd(PI_CMD_ROUTE, PI_ROUTE_FX_INSERT, 0, fx.insert(k.patched)), cmd(PI_CMD_PLAY, 0, 0, 1),
                         cmd(PI_CMD_KEY_DOWN, PI_KEY_FX), cmd(PI_CMD_KEY_DOWN, uint8_t(k.effect - 1))};
            float io[PI_AUDIO_LOOP] = {};
            const float ret[PI_TRACKS] = {1.25f};
            pi::returnIn(io, ret, 1);
            const float back[2] = {1.f, 1.5f};
            pi::fxReturnIn(io, back, k.patched ? 2 : 0);
            pi_event ev[PI_EVENTS_MIN];
            uint32_t ne = e.run(c.data(), uint32_t(c.size()), io, PI_AUDIO_LOOP, ev);
            j.frame(io, ev, ne, 48, o);
            j.fxSend(io, e.view(PI_VIEW_HEARD), pi::rampStep(RATE), volts);
        }
        char why[220];
        std::snprintf(why, sizeof why, "%s: AUDIO's mix is %.7g, not %.7g", k.what, double(o.mix), double(k.mix));
        check(bits(o.mix) == bits(k.mix), "fx-loop", why);
        std::snprintf(why, sizeof why, "%s: FX SEND channel %d is %g V, not the bus (1.25 V)", k.what, k.effect, double(volts[k.effect - 1]));
        check(volts[k.effect - 1] == 1.25f, "fx-loop", why);
    }
    check(pi::gate(0, 0) == 0.f && pi::gate(4, 3) == 10.f && pi::gate(4, 4) == 0.f && pi::gate(16, 15) == 10.f, "fx-loop",
          "FX GATES is not 10 V on the heard effect's channel alone");
}

// A OUT's volts back into A IN: the hit takes the value the output said, for values across
// the slider's travel. (The core rounds to the nearest for this: D80.)
static void sliders() {
    uint32_t bad = 0, firstBad = 0;
    for (uint32_t v = 0; v <= 65535; v += (v < 65000 ? 97 : 1)) {
        Engine out(RATE), in(RATE);
        float o[PI_AUDIO_LOOP_SLIDERS] = {}, io[PI_AUDIO_LOOP_SLIDERS] = {}, volts[PI_TRACKS];
        pi_event ev[PI_EVENTS_MIN];
        const pi_cmd say[2] = {cmd(PI_CMD_SOUND, 9, 0, v), cmd(PI_CMD_FIRE, 9)};
        out.run(say, 2, o, PI_AUDIO_LOOP_SLIDERS, ev);
        pi::Jacks j;
        j.sliderOut(o, PI_LOOP_A, volts);
        pi::sliderIn(io, PI_LOOP_A, volts, pi::returnMask(-1, 16));
        const pi_cmd take[4] = {cmd(PI_CMD_ROUTE, PI_ROUTE_A, 0, 0xffff), cmd(PI_CMD_KEY_DOWN, PI_KEY_SOUND), cmd(PI_CMD_KEY_DOWN, 9), cmd(PI_CMD_KEY_UP, 9)};
        in.run(take, 4, io, PI_AUDIO_LOOP_SLIDERS, ev); // choosing sound 10 plays it: a hit, with A from the input
        if (in.view(PI_VIEW_HIT_A) != v && !bad++) firstBad = v;
        if (v == 65535) break;
    }
    char why[160];
    std::snprintf(why, sizeof why, "A OUT's volts into A IN gave another value for %u values, first at %u", bad, firstBad);
    check(!bad, "sliders", why);
    float volts[PI_TRACKS], loop[PI_AUDIO_LOOP_SLIDERS] = {};
    loop[PI_LOOP_B + 15] = 1.f;
    pi::Jacks j;
    j.sliderOut(loop, PI_LOOP_B, volts);
    check(volts[15] == 10.f && volts[0] == 0.f, "sliders", "a slider's travel is not 0 to 10 V");
}

static void masks() {
    check(pi::returnMask(-1, 0) == 0, "mask", "an unpatched RETURN takes a channel");
    check(pi::returnMask(-1, 1) == 0x1, "mask", "a mono cable does not take sound 1 alone");
    check(pi::returnMask(-1, 5) == 0x1f, "mask", "a five-channel cable does not take sounds 1 to 5");
    check(pi::returnMask(-1, 16) == 0xffff, "mask", "a sixteen-channel cable does not take all sixteen");
    check(pi::returnMask(0x10, 5) == 0x10, "mask", "the menu's tick on sound 5 alone is not kept");
    check(pi::returnMask(0x10, 0) == 0, "mask", "ticks with no cable take a channel");
    // ABI 11 (D88): the sixteen settings, as two masks. All Ours at first.
    pi::FxSettings fx;
    check(fx.route(true) == 0 && fx.insert(true) == 0, "mask", "a new module's effects are not all Ours");
    for (int n = 1; n <= 16; n++)
        for (pi::FxSetting st : {pi::FX_BESIDE, pi::FX_IN_PLACE, pi::FX_OURS}) {
            pi::FxSettings one;
            one.set(n, st);
            uint32_t bit = 1u << (n - 1);
            bool ok = one.of(n) == st && one.route(true) == (st == pi::FX_OURS ? 0 : bit) && one.insert(true) == (st == pi::FX_IN_PLACE ? bit : 0);
            for (int k = 1; k <= 16; k++) ok = ok && (k == n || one.of(k) == pi::FX_OURS);
            check(ok, "mask", "a setting does not give its masks, or reads back as another");
        }
    fx.set(2, pi::FX_BESIDE);
    fx.set(4, pi::FX_IN_PLACE);
    fx.set(11, pi::FX_IN_PLACE);
    fx.set(4, pi::FX_BESIDE); // changed again: in place of the dry no more
    check(fx.route(true) == (1u << 1 | 1u << 3 | 1u << 10) && fx.insert(true) == 1u << 10, "mask", "three settings do not give ROUTE 1 and ROUTE 4");
    check(fx.route(false) == 0 && fx.insert(false) == 0, "mask", "with neither FX jack patched an effect is not Ours");
    bool offers = true;
    for (int n = 1; n <= 16; n++) offers = offers && pi::offersBeside(n) == (n < 9 || n > 12);
    check(offers, "mask", "the repeats (9 to 12) offer beside the dry, or another effect does not (D88 item 3)");
    pi::FxSettings old = pi::FxSettings::fromOld(-1), ticked = pi::FxSettings::fromOld(0x1f008);
    check(old.route(true) == 0 && old.insert(true) == 0, "mask", "an old patch's default ticks (-1) are not all Ours");
    check(ticked.route(true) == 0xf008 && ticked.insert(true) == 0xf008, "mask", "an old patch's ticks are not in place of the dry for those effects");
    float io[PI_AUDIO_LOOP] = {};
    const float three[3] = {1.f, 2.f, -0.5f}, sixteen[16] = {0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f,
                                                           0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f, 0.3125f};
    pi::fxReturnIn(io, three, 3);
    bool sum = io[PI_LOOP_FX] == 2.5f / 5.f;
    pi::fxReturnIn(io, sixteen, 16);
    sum = sum && io[PI_LOOP_FX] == 1.f;
    io[PI_LOOP_FX] = 7.f;
    pi::fxReturnIn(io, three, 0);
    sum = sum && bits(io[PI_LOOP_FX]) == bits(0.f);
    check(sum, "mask", "FX RETURN is not the sum of its cable's channels at 5 V to 1.0, or unpatched is not 0");
    check(pi::layout(false, false) == PI_AUDIO_BOTH && pi::layout(false, true) == PI_AUDIO_LOOP &&
              pi::layout(true, false) == PI_AUDIO_LOOP_SLIDERS && pi::layout(true, true) == PI_AUDIO_LOOP_SLIDERS,
          "mask", "the layout is not the smallest that carries what is patched");
}

static void notFinite() {
    // A NaN on channel 1 and an infinity on channel 2: those two sounds are silent, the rest
    // play on. Held to the same frame with silence returned on both, bit for bit.
    Engine e(RATE), ze(RATE);
    std::vector<pi_cmd> setup = beat(true, 16);
    setup.insert(setup.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 0x3u));
    pi::Jacks j, z;
    float ret[PI_TRACKS] = {}, zero[PI_TRACKS] = {};
    ret[0] = std::numeric_limits<float>::quiet_NaN();
    ret[1] = std::numeric_limits<float>::infinity();
    bool bad = false;
    uint32_t sounding = 0;
    for (uint32_t f = 0; f < RATE / 4; f++) {
        float a[PI_AUDIO_LOOP] = {}, b[PI_AUDIO_LOOP] = {};
        pi_event ev[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        pi::returnIn(a, ret, 0x3u);
        pi::returnIn(b, zero, 0x3u);
        pi::fxReturnIn(a, ret, 1);
        uint32_t ne = e.run(setup.data(), f ? 0 : uint32_t(setup.size()), a, PI_AUDIO_LOOP, ev);
        uint32_t nz = ze.run(setup.data(), f ? 0 : uint32_t(setup.size()), b, PI_AUDIO_LOOP, ev2);
        pi::JackFrame o, oz;
        j.frame(a, ev, ne, 48, o);
        z.frame(b, ev2, nz, 48, oz);
        if (!std::isfinite(o.audio) || bits(o.mix) != bits(oz.mix) || bits(o.audio) != bits(oz.audio)) bad = true;
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!std::isfinite(o.voices[t]) || !std::isfinite(o.triggers[t])) bad = true;
        float send[PI_TRACKS] = {};
        j.fxSend(a, 1, pi::rampStep(RATE), send);
        if (!std::isfinite(send[0])) bad = true;
        if (o.audio != 0.f) sounding++;
    }
    check(sounding > 0, "setup", "nothing but the two returned sounds was playing");
    check(!bad, "not-finite", "a NaN or infinity returned was not silence for its own sound alone");
    check(j.notFinite == 0, "not-finite", "something not finite reached an output and had to be cleaned there");
    float nan[PI_AUDIO_LOOP] = {}, send[PI_TRACKS] = {};
    nan[PI_LOOP_FX] = std::numeric_limits<float>::infinity();
    j.fxSend(nan, 1, pi::rampStep(RATE), send);
    check(send[0] == 0.f && j.notFinite == 1, "not-finite", "a send that is not finite is not 0 V, counted");
}

int main() {
    if (pi_abi_version() != PI_ABI_VERSION) {
        std::printf("FAILED setup: the core is ABI %u, this test ABI %u\n", pi_abi_version(), PI_ABI_VERSION);
        return 1;
    }
    sameMix(16);
    sameMix(11);
    silence();
    punch();
    fxSend();
    fxLoop();
    sliders();
    masks();
    notFinite();
    if (failures) {
        std::printf("rack/test/jacks: %d checks FAILED\n", failures);
        return 1;
    }
    std::printf("rack/test/jacks: the jacks hold. Unpatched: the core's mix bit for bit at volumes 16 and 11, in three layouts. Own sound "
                "returned: within %.1e of it (largest %.1e). Silence on channel 1: the mix without the bass drum, bit for bit, VOICES and "
                "TRIGGERS as they were. Every sound returned and effect 2 punched: the core's own punched render within %.1e (largest "
                "%.1e), and heard. FX SEND's sixteen ramps at three rates; the three settings through FX SEND and FX RETURN; A OUT into "
                "A IN; masks; not-finite.\n",
                double(OWN_RETURN_BOUND), double(worstOwnReturn), double(PUNCH_BOUND), double(worstPunch));
    return 0;
}
