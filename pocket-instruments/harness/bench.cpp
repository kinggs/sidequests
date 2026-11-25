// `make bench`: what a frame of pi_process costs, in nanoseconds, on the release static
// library (PLAN.md's ground rule: a change on the audio path says what it costs, measured).
//
// Each case is ten seconds of sound at 48 kHz, the mix (PI_AUDIO_MIX), in blocks of 128, on
// the table clock at 120 bpm. Each runs five times; the best is reported, because anything
// else the machine does only ever makes a run slower.
//
//   idle    a fresh engine, stopped: the clock counts and every voice is silent
//   beat    the minimum beat playing: bass drum, snare and the two hats (tracks 0 to 3)
//   all     all sixteen sounds playing, each on four steps of its own
//   repeat  "all" with effect 11 (eight a beat) on every step of the lane (ABI 6 on)
//   fx N    "beat" with sound effect N on every step of the lane, all four drums through it
//           (ABI 7 on: ENGINE.md section 18; N is 1, 2, 3, 5, 6, 7, 8)
//   both    "beat" in PI_AUDIO_BOTH, 17 channels: what the Rack module asks for with none of
//           RETURN and the seven jacks of Session 18 in use (ABI 9 on: section 19)
//   loop    "beat" in PI_AUDIO_LOOP, 18 channels, every sound taken from the input: RETURN patched
//   loop fx the same with effect 4 on every step, Rack's beside the dry: FX SEND and FX RETURN
//           patched (ABI 11: the bus stays idle and channel 17 is summed; until ABI 11 the bus
//           crossed over to channel 17)
//   loop in the same with effect 4 Rack's in place of the dry (ABI 11: an insert)
//   sliders "beat" in PI_AUDIO_LOOP_SLIDERS, 50 channels, every sound's A and B from the input
//   fx 4    "beat" with effect 4 on every step and a line lent (ABI 12: section 18, designed
//           2026-11-24: one echo 174.76 ms behind)
//   fx 14   "beat" with effect 14 on every step and a line lent (ABI 13: section 18, designed
//           2026-11-24: the bus fed back, one loop 18.30 ms round)
//   fx 1/0  "beat" with effect 1 on every other step of the lane, none between (ABI 14: section
//           18, designed 2026-11-25: what is slowed changes on every step, each change up to
//           sixteen retunes on one frame). Built on any ABI from 7, so an older library reads it
//
// Numbers move between machines and between runs by a few percent: compare runs made on the
// same machine, one after the other. LEARNINGS.md keeps the ones a session measured.
//
// SPDX-License-Identifier: MIT
#include "pi_engine.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <vector>

static pi_cmd cmd(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0) { return pi_cmd{0, type, a, b, 0, value}; }

static double run(const std::vector<pi_cmd> &setup, uint32_t channels = PI_AUDIO_MIX, bool lend = false) {
    const uint32_t rate = 48000, block = 128, blocks = rate * 10 / block;
    std::vector<uint64_t> mem((pi_size() + 7) / 8);
    pi_engine *e = pi_init(mem.data(), uint32_t(mem.size() * 8), rate, 1);
    if (!e) {
        std::fprintf(stderr, "pi_init refused\n");
        std::exit(1);
    }
#if PI_ABI_VERSION >= 12
    std::vector<float> line(lend ? pi_delay_frames(rate) : 0);
    if (lend && pi_set_delay(e, line.data(), uint32_t(line.size())) != 1) {
        std::fprintf(stderr, "pi_set_delay refused\n");
        std::exit(1);
    }
#else
    (void)lend;
#endif
    pi_event ev[256];
    static float audio[block * 50]; // a loop layout is read too: silence comes back
    std::memset(audio, 0, sizeof audio);
    pi_process(e, 1, setup.data(), uint32_t(setup.size()), ev, 256, audio, channels);
    float sink = 0;
    auto t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < blocks; i++) {
        pi_process(e, block, nullptr, 0, ev, 256, audio, channels);
        sink += audio[(i % block) * channels + (channels > 1 ? 16 : 0)];
    }
    auto t1 = std::chrono::steady_clock::now();
    if (sink != sink) std::printf("(a NaN)\n"); // keeps the sound from being optimised away
    return std::chrono::duration<double, std::nano>(t1 - t0).count() / (double(blocks) * block);
}

static void report(const char *name, const std::vector<pi_cmd> &setup, uint32_t channels = PI_AUDIO_MIX, bool lend = false) {
    double best = 1e30;
    for (int i = 0; i < 5; i++) best = std::min(best, run(setup, channels, lend));
    char what[32] = "the mix";
    if (channels != PI_AUDIO_MIX) std::snprintf(what, sizeof what, "%u channels", channels);
    std::printf("bench %-7s %7.1f ns a frame (best of five, 10 s at 48 kHz, %s)\n", name, best, what);
}

int main() {
    if (pi_abi_version() != PI_ABI_VERSION) {
        std::fprintf(stderr, "the library's ABI is not the header's\n");
        return 1;
    }
    std::vector<pi_cmd> idle{cmd(PI_CMD_TEMPO, 0, 0, 120000)};

    std::vector<pi_cmd> beat = idle;
    for (uint8_t s : {0, 4, 8, 12}) beat.push_back(cmd(PI_CMD_STEP, 0, s, 1));
    for (uint8_t s : {4, 12}) beat.push_back(cmd(PI_CMD_STEP, 1, s, 1));
    for (uint8_t s : {0, 2, 4, 8, 10, 12}) beat.push_back(cmd(PI_CMD_STEP, 2, s, 1));
    for (uint8_t s : {6, 14}) beat.push_back(cmd(PI_CMD_STEP, 3, s, 1));
    beat.push_back(cmd(PI_CMD_RESET));
    beat.push_back(cmd(PI_CMD_PLAY, 0, 0, 1));

    std::vector<pi_cmd> all = idle;
    for (uint8_t t = 0; t < PI_TRACKS; t++)
        for (uint8_t i = 0; i < 4; i++) all.push_back(cmd(PI_CMD_STEP, t, uint8_t((t + 4 * i) % 16), 1));
    all.push_back(cmd(PI_CMD_RESET));
    all.push_back(cmd(PI_CMD_PLAY, 0, 0, 1));

    report("idle", idle);
    report("beat", beat);
    report("all", all);
#ifdef PI_CMD_FX
    std::vector<pi_cmd> repeat = all;
    repeat.insert(repeat.end() - 2, 16, cmd(PI_CMD_FX));
    for (uint8_t s = 0; s < PI_STEPS; s++) repeat[repeat.size() - 18 + s] = cmd(PI_CMD_FX, s, 0, 11);
    report("repeat", repeat);
#endif
#if PI_ABI_VERSION >= 7
    for (uint32_t effect : {1u, 2u, 3u, 5u, 6u, 7u, 8u}) {
        std::vector<pi_cmd> lane = beat;
        lane.insert(lane.end() - 2, 16, cmd(PI_CMD_FX));
        for (uint8_t s = 0; s < PI_STEPS; s++) lane[lane.size() - 18 + s] = cmd(PI_CMD_FX, s, 0, effect);
        char name[8];
        std::snprintf(name, sizeof name, "fx %u", effect);
        report(name, lane);
    }
#endif
#if PI_ABI_VERSION >= 7
    {
        std::vector<pi_cmd> lane = beat;
        lane.insert(lane.end() - 2, 16, cmd(PI_CMD_FX));
        for (uint8_t s = 0; s < PI_STEPS; s++) lane[lane.size() - 18 + s] = cmd(PI_CMD_FX, s, 0, s % 2 == 0 ? 1 : 0);
        report("fx 1/0", lane);
    }
#endif
#if PI_ABI_VERSION >= 9
    report("both", beat, PI_AUDIO_BOTH);
    std::vector<pi_cmd> loop = beat;
    loop.insert(loop.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 0xffff));
    report("loop", loop, PI_AUDIO_LOOP);
    std::vector<pi_cmd> loopfx = loop;
    loopfx.insert(loopfx.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_FX, 0, 1u << 3));
    for (uint8_t s = 0; s < PI_STEPS; s++) loopfx.insert(loopfx.begin(), cmd(PI_CMD_FX, s, 0, 4));
    report("loop fx", loopfx, PI_AUDIO_LOOP);
#if PI_ABI_VERSION >= 11
    std::vector<pi_cmd> loopin = loopfx;
    loopin.insert(loopin.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_FX_INSERT, 0, 1u << 3));
    report("loop in", loopin, PI_AUDIO_LOOP);
#endif
    std::vector<pi_cmd> sliders = beat;
    sliders.insert(sliders.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_A, 0, 0xffff));
    sliders.insert(sliders.begin(), cmd(PI_CMD_ROUTE, PI_ROUTE_B, 0, 0xffff));
    report("sliders", sliders, PI_AUDIO_LOOP_SLIDERS);
#endif
#if PI_ABI_VERSION >= 12
    std::vector<pi_cmd> echo = beat;
    echo.insert(echo.end() - 2, 16, cmd(PI_CMD_FX));
    for (uint8_t s = 0; s < PI_STEPS; s++) echo[echo.size() - 18 + s] = cmd(PI_CMD_FX, s, 0, 4);
    report("fx 4", echo, PI_AUDIO_MIX, true);
#endif
#if PI_ABI_VERSION >= 13
    std::vector<pi_cmd> feedback = beat;
    feedback.insert(feedback.end() - 2, 16, cmd(PI_CMD_FX));
    for (uint8_t s = 0; s < PI_STEPS; s++) feedback[feedback.size() - 18 + s] = cmd(PI_CMD_FX, s, 0, 14);
    report("fx 14", feedback, PI_AUDIO_MIX, true);
#endif
    return 0;
}
