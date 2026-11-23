// RETURN (D62), held to the core: rack/src/jacks.hpp, the code the Rhythm module runs for its
// output jacks, on the native core, built with the Rack SDK's own maths flags (the Makefile
// says which), so what passes here is what ships.
//
//   unpatched      AUDIO is the core's mix bit for bit, at volume 16 and at volume 11.
//   own-return     RETURN carrying a sound's own VOICES channel back gives the same mix: sound 1
//                  alone, and all sixteen at once. Not bit for bit, and it cannot be: VOICES is
//                  x times 5 and RETURN divides by 5, and in floats that does not always give x
//                  back. So the mix must be within OWN_RETURN_BOUND of the core's (about
//                  -120 dB), and the largest difference seen is printed.
//   silence        a return of silence on channel 1 removes the bass drum: AUDIO is bit for bit
//                  a second engine's that never had its steps, and VOICES and TRIGGERS are as
//                  they were.
//   mask           which channels RETURN takes, by the cable and by the menu (D62 item 3).
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
    uint32_t run(pi_cmd *cmds, uint32_t n, float *audio, uint32_t channels, pi_event *ev) {
        return pi_process(e, 1, cmds, n, ev, PI_EVENTS_MIN, audio, channels);
    }
    uint32_t volume() const {
        uint8_t v[PI_VIEW_SIZE];
        pi_view(e, v, sizeof v);
        return v[PI_VIEW_VOLUME];
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
static float worstOwnReturn = 0.f;
static const uint32_t RATE = 48000, FRAMES = RATE * 2; // two seconds: past a bar at 132 bpm

// Unpatched, and a sound's own channel returned: the core's mix, bit for bit.
static void sameMix(uint32_t volume) {
    std::vector<int16_t> smp = sample();
    Engine both(RATE), mixOnly(RATE);
    pi_set_sample(both.e, 6, smp.data(), uint32_t(smp.size()));
    pi_set_sample(mixOnly.e, 6, smp.data(), uint32_t(smp.size()));
    std::vector<pi_cmd> setup = beat(true, volume);
    pi::Jacks plain, own1, ownAll;
    uint32_t sounding = 0, firstBad[3] = {0, 0, 0}, shapeAt = 0;
    bool shapeBad = false;
    bool bad[3] = {false, false, false};
    for (uint32_t f = 0; f < FRAMES; f++) {
        float a[PI_AUDIO_BOTH], m;
        pi_event ev[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        uint32_t n = f ? 0 : uint32_t(setup.size());
        uint32_t ne = both.run(setup.data(), n, a, PI_AUDIO_BOTH, ev);
        mixOnly.run(setup.data(), n, &m, PI_AUDIO_MIX, ev2);
        uint32_t vol = both.volume();
        pi::JackFrame o0, o1, o2;
        plain.frame(a, ev, ne, 48, nullptr, 0, vol, o0);
        float ret[PI_TRACKS];
        for (uint32_t t = 0; t < PI_TRACKS; t++) ret[t] = o0.voices[t]; // VOICES, as a cable carries it back
        own1.frame(a, ev, ne, 48, ret, 1u, vol, o1);
        ownAll.frame(a, ev, ne, 48, ret, 0xffffu, vol, o2);
        if (m != 0.f) sounding++;
        const float got[3] = {o0.mix, o1.mix, o2.mix};
        for (int i = 0; i < 3; i++) {
            float d = std::fabs(got[i] - m);
            if (i) worstOwnReturn = std::max(worstOwnReturn, d);
            if (!bad[i] && (i ? !(d <= OWN_RETURN_BOUND) : bits(got[i]) != bits(m))) {
                bad[i] = true;
                firstBad[i] = f;
            }
        }
        if (!shapeBad && bits(o0.audio) != bits(10.f * std::tanh(5.f * o0.mix / 10.f))) {
            shapeBad = true; // the 5 V and tanh, applied to the mix it was given
            shapeAt = f;
        }
    }
    char why[160];
    check(sounding > FRAMES / 4, "setup", "the beat barely sounds");
    std::snprintf(why, sizeof why, "volume %u: the mix differs from the core's at frame %u", volume, firstBad[0]);
    check(!bad[0], "unpatched", why);
    std::snprintf(why, sizeof why, "volume %u: AUDIO is not 10 tanh(5 mix / 10) at frame %u (this test and jacks.hpp built with different maths?)", volume, shapeAt);
    check(!shapeBad, "shaping", why);
    std::snprintf(why, sizeof why, "volume %u: sound 1 returned from VOICES is off the core's mix at frame %u", volume, firstBad[1]);
    check(!bad[1], "own-return", why);
    std::snprintf(why, sizeof why, "volume %u: all sixteen returned from VOICES are off the core's mix at frame %u", volume, firstBad[2]);
    check(!bad[2], "own-return", why);
}

// A return of silence on channel 1: the bass drum leaves AUDIO and nothing else changes.
static void silence() {
    std::vector<int16_t> smp = sample();
    Engine with(RATE), without(RATE);
    pi_set_sample(with.e, 6, smp.data(), uint32_t(smp.size()));
    pi_set_sample(without.e, 6, smp.data(), uint32_t(smp.size()));
    std::vector<pi_cmd> a = beat(true, 13), b = beat(false, 13);
    pi::Jacks plain, silenced, other;
    uint32_t drum = 0, trigs = 0;
    bool audioBad = false, voicesBad = false, triggersBad = false, removedNothing = true;
    for (uint32_t f = 0; f < FRAMES; f++) {
        float x[PI_AUDIO_BOTH], y[PI_AUDIO_BOTH];
        pi_event ev[PI_EVENTS_MIN], ev2[PI_EVENTS_MIN];
        uint32_t ne = with.run(a.data(), f ? 0 : uint32_t(a.size()), x, PI_AUDIO_BOTH, ev);
        uint32_t ne2 = without.run(b.data(), f ? 0 : uint32_t(b.size()), y, PI_AUDIO_BOTH, ev2);
        pi::JackFrame p, s, o;
        float ret[PI_TRACKS] = {}; // channel 1 carries 0 V; the cable carries only it
        plain.frame(x, ev, ne, 48, nullptr, 0, with.volume(), p);
        silenced.frame(x, ev, ne, 48, ret, pi::returnMask(-1, 1), with.volume(), s);
        other.frame(y, ev2, ne2, 48, nullptr, 0, without.volume(), o);
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

static void masks() {
    check(pi::returnMask(-1, 0) == 0, "mask", "an unpatched RETURN takes a channel");
    check(pi::returnMask(-1, 1) == 0x1, "mask", "a mono cable does not take sound 1 alone");
    check(pi::returnMask(-1, 5) == 0x1f, "mask", "a five-channel cable does not take sounds 1 to 5");
    check(pi::returnMask(-1, 16) == 0xffff, "mask", "a sixteen-channel cable does not take all sixteen");
    check(pi::returnMask(0x10, 5) == 0x10, "mask", "the menu's tick on sound 5 alone is not kept");
    check(pi::returnMask(0x10, 0) == 0, "mask", "ticks with no cable take a channel");
}

static void notFinite() {
    // A NaN on channel 1 and an infinity on channel 2: those two sounds are silent, the rest
    // play on. Held to the same frame with silence returned on both, bit for bit.
    Engine e(RATE);
    std::vector<pi_cmd> setup = beat(true, 16);
    pi::Jacks j, z;
    float ret[PI_TRACKS] = {}, zero[PI_TRACKS] = {};
    ret[0] = std::numeric_limits<float>::quiet_NaN();
    ret[1] = std::numeric_limits<float>::infinity();
    bool bad = false;
    uint32_t sounding = 0;
    for (uint32_t f = 0; f < RATE / 4; f++) {
        float a[PI_AUDIO_BOTH];
        pi_event ev[PI_EVENTS_MIN];
        uint32_t ne = e.run(setup.data(), f ? 0 : uint32_t(setup.size()), a, PI_AUDIO_BOTH, ev);
        pi::JackFrame o, oz;
        j.frame(a, ev, ne, 48, ret, 0x3u, 16, o);
        z.frame(a, ev, ne, 48, zero, 0x3u, 16, oz);
        if (!std::isfinite(o.audio) || bits(o.mix) != bits(oz.mix) || bits(o.audio) != bits(oz.audio)) bad = true;
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!std::isfinite(o.voices[t]) || !std::isfinite(o.triggers[t])) bad = true;
        if (o.audio != 0.f) sounding++;
    }
    check(sounding > 0, "setup", "nothing but the two returned sounds was playing");
    check(!bad, "not-finite", "a NaN or infinity returned was not silence for its own sound alone");
}

int main() {
    if (pi_abi_version() != PI_ABI_VERSION) {
        std::printf("FAILED setup: the core is ABI %u, this test ABI %u\n", pi_abi_version(), PI_ABI_VERSION);
        return 1;
    }
    sameMix(16);
    sameMix(11);
    silence();
    masks();
    notFinite();
    if (failures) {
        std::printf("rack/test/jacks: %d checks FAILED\n", failures);
        return 1;
    }
    std::printf("rack/test/jacks: RETURN holds. Unpatched: the core's mix bit for bit at volumes 16 and 11. Own sound returned: "
                "within %.1e of it (largest %.1e). Silence on channel 1: the mix without the bass drum, bit for bit, VOICES and "
                "TRIGGERS as they were. Masks; not-finite.\n", double(OWN_RETURN_BOUND), double(worstOwnReturn));
    return 0;
}
