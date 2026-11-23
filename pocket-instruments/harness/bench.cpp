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

static double run(const std::vector<pi_cmd> &setup) {
    const uint32_t rate = 48000, block = 128, blocks = rate * 10 / block;
    std::vector<uint64_t> mem((pi_size() + 7) / 8);
    pi_engine *e = pi_init(mem.data(), uint32_t(mem.size() * 8), rate, 1);
    if (!e) {
        std::fprintf(stderr, "pi_init refused\n");
        std::exit(1);
    }
    pi_event ev[256];
    float audio[block];
    pi_process(e, 1, setup.data(), uint32_t(setup.size()), ev, 256, audio, PI_AUDIO_MIX);
    float sink = 0;
    auto t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < blocks; i++) {
        pi_process(e, block, nullptr, 0, ev, 256, audio, PI_AUDIO_MIX);
        sink += audio[i % block];
    }
    auto t1 = std::chrono::steady_clock::now();
    if (sink != sink) std::printf("(a NaN)\n"); // keeps the sound from being optimised away
    return std::chrono::duration<double, std::nano>(t1 - t0).count() / (double(blocks) * block);
}

static void report(const char *name, const std::vector<pi_cmd> &setup) {
    double best = 1e30;
    for (int i = 0; i < 5; i++) best = std::min(best, run(setup));
    std::printf("bench %-7s %7.1f ns a frame (best of five, 10 s at 48 kHz, the mix)\n", name, best);
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
    return 0;
}
