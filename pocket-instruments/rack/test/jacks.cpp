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
//   fx-loop        FX SEND is the bus at 5 V to 1.0; with effect 4 punched and FX RETURN
//                  patched, AUDIO crosses to what FX RETURN carries; unpatched it does not.
//   sliders        A OUT's volts, patched back into A IN, give the hit the value they said.
//   mask           which channels RETURN takes, by the cable and by the menu (D62 item 3);
//                  which effects FX RETURN takes; which layout a frame needs.
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

// FX SEND and FX RETURN: the scaling, and that an effect the core has no sound for (4) crosses
// to the cable only while FX RETURN is patched.
static void fxLoop() {
    for (int patched = 0; patched < 2; patched++) {
        Engine e(RATE);
        pi::Jacks j;
        float last = -1.f, send = -1.f;
        for (uint32_t f = 0; f < 400; f++) {
            std::vector<pi_cmd> c;
            if (!f) c = {cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 1), cmd(PI_CMD_ROUTE, PI_ROUTE_FX, 0, pi::fxMask(-1, patched)),
                         cmd(PI_CMD_PLAY, 0, 0, 1), cmd(PI_CMD_KEY_DOWN, PI_KEY_FX), cmd(PI_CMD_KEY_DOWN, 3)};
            float io[PI_AUDIO_LOOP] = {};
            const float volts[PI_TRACKS] = {1.25f}; // sound 1 returned at 1.25 V: 0.25
            pi::returnIn(io, volts, 1);
            pi::fxReturnIn(io, 2.5f);               // FX RETURN at 2.5 V: 0.5
            pi_event ev[PI_EVENTS_MIN];
            uint32_t ne = e.run(c.data(), uint32_t(c.size()), io, PI_AUDIO_LOOP, ev);
            pi::JackFrame o;
            j.frame(io, ev, ne, 48, o);
            last = o.mix;
            send = j.send(io);
        }
        check(send == 1.25f, "fx-loop", "FX SEND is not the bus at 5 V to 1.0");
        if (patched) check(last == 0.5f, "fx-loop", "with FX RETURN patched, effect 4 held does not cross to what FX RETURN carries");
        else check(last == 0.25f, "fx-loop", "with FX RETURN unpatched, effect 4 held changed the mix");
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
    check(pi::fxMask(-1, false) == 0 && pi::fxMask(0xffff, false) == 0, "mask", "an unpatched FX RETURN takes an effect");
    check(pi::fxMask(-1, true) == 0xf008, "mask", "by default FX RETURN does not take effects 4 and 13 to 16 alone");
    check(pi::fxMask(0x2, true) == 0x2 && pi::fxMask(0, true) == 0, "mask", "the menu's ticks for FX RETURN are not kept");
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
        pi::fxReturnIn(a, ret[0]);
        uint32_t ne = e.run(setup.data(), f ? 0 : uint32_t(setup.size()), a, PI_AUDIO_LOOP, ev);
        uint32_t nz = ze.run(setup.data(), f ? 0 : uint32_t(setup.size()), b, PI_AUDIO_LOOP, ev2);
        pi::JackFrame o, oz;
        j.frame(a, ev, ne, 48, o);
        z.frame(b, ev2, nz, 48, oz);
        if (!std::isfinite(o.audio) || bits(o.mix) != bits(oz.mix) || bits(o.audio) != bits(oz.audio)) bad = true;
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!std::isfinite(o.voices[t]) || !std::isfinite(o.triggers[t])) bad = true;
        if (!std::isfinite(j.send(a))) bad = true;
        if (o.audio != 0.f) sounding++;
    }
    check(sounding > 0, "setup", "nothing but the two returned sounds was playing");
    check(!bad, "not-finite", "a NaN or infinity returned was not silence for its own sound alone");
    check(j.notFinite == 0, "not-finite", "something not finite reached an output and had to be cleaned there");
    float nan[PI_AUDIO_LOOP] = {};
    nan[PI_LOOP_FX] = std::numeric_limits<float>::infinity();
    check(j.send(nan) == 0.f && j.notFinite == 1, "not-finite", "a send that is not finite is not 0 V, counted");
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
                "%.1e), and heard. FX SEND and FX RETURN; A OUT into A IN; masks; not-finite.\n",
                double(OWN_RETURN_BOUND), double(worstOwnReturn), double(PUNCH_BOUND), double(worstPunch));
    return 0;
}
