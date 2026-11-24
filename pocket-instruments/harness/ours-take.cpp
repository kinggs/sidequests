// Session 26 (PLAN.md; D91 item 9): our instrument played as the PO-12's takes a and b were,
// for harness/hardware-fx.py to read the same way it read the hardware.
//
//   c++ -std=c++17 -O2 -Icore/include harness/ours-take.cpp target/release/libpi_core.a -o target/ours-take
//   target/ours-take a target/ours/a.wav      then: uv run harness/hardware-fx.py target/ours/a.wav --pass a
//   target/ours-take b target/ours/b.wav
//
// At 80 bpm and 48 kHz (9 000 frames a step). Pass a: sounds 1, 2 and 3 (bass drum, snare,
// closed hat) on take a's steps: kick 1 and 9, snare 5 and 13, closed hat 3, 7, 11 and 15.
// Pass b: sound 1 on step 1 alone. Half a second of silence, then play; three bars dry; then fx
// held from there to the end, with each key 1 to 16 down for two bars and up for one (fx alone
// plays dry and clears the lane; the step a key goes up on still holds its effect). Keys land a
// frame after a bar's first step, as the fixtures' keys do. Effect 4 is lent a line.
//
// The mix is written at half its level (so no effect of ours clips the file: the script reads
// every level against the dry bar's, so one gain changes no reading), on both channels, as
// 24-bit stereo, the format hardware-take.sh records. target/ is never committed.
//
// SPDX-License-Identifier: MIT
#include "pi_engine.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

static pi_cmd cmd(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0) { return pi_cmd{0, type, a, b, 0, value}; }

int main(int argc, char **argv) {
    if (argc != 3 || (std::string(argv[1]) != "a" && std::string(argv[1]) != "b")) {
        std::fprintf(stderr, "usage: ours-take a|b <out.wav>\n");
        return 1;
    }
    const bool a = std::string(argv[1]) == "a";
    const uint32_t rate = 48000, step = 9000, bar = 16 * step, lead = rate / 2;
    const uint32_t FX_KEY = PI_KEY_FX;
    std::vector<uint64_t> mem((pi_size() + 7) / 8);
    pi_engine *e = pi_init(mem.data(), uint32_t(mem.size() * 8), rate, 1);
    std::vector<float> line(pi_delay_frames(rate));
    if (!e || pi_set_delay(e, line.data(), uint32_t(line.size())) != 1) {
        std::fprintf(stderr, "the engine or its line was refused\n");
        return 1;
    }
    // (frame, command), in order.
    std::vector<std::pair<uint64_t, pi_cmd>> at;
    at.push_back({0, cmd(PI_CMD_TEMPO, 0, 0, 80000)});
    at.push_back({0, cmd(PI_CMD_STEP, 0, 0, 1)});
    if (a) {
        at.push_back({0, cmd(PI_CMD_STEP, 0, 8, 1)});
        for (uint8_t s : {4, 12}) at.push_back({0, cmd(PI_CMD_STEP, 1, s, 1)});
        for (uint8_t s : {2, 6, 10, 14}) at.push_back({0, cmd(PI_CMD_STEP, 2, s, 1)});
    }
    at.push_back({lead, cmd(PI_CMD_PLAY, 0, 0, 1)});
    uint64_t b0 = lead + 3 * uint64_t(bar); // after three bars dry
    at.push_back({b0 + 1, cmd(PI_CMD_KEY_DOWN, uint8_t(FX_KEY))});
    for (uint8_t k = 0; k < 16; k++) {
        uint64_t down = b0 + uint64_t(3 * k) * bar + 1;
        at.push_back({down, cmd(PI_CMD_KEY_DOWN, k)});
        at.push_back({down + 2 * uint64_t(bar), cmd(PI_CMD_KEY_UP, k)});
    }
    const uint64_t end = b0 + 48 * uint64_t(bar);

    std::vector<uint8_t> wav;
    auto u32 = [&](uint32_t v) { for (int i = 0; i < 4; i++) wav.push_back(uint8_t(v >> (8 * i))); };
    auto u16 = [&](uint16_t v) { for (int i = 0; i < 2; i++) wav.push_back(uint8_t(v >> (8 * i))); };
    const uint32_t data = uint32_t(end * 2 * 3);
    wav.insert(wav.end(), {'R', 'I', 'F', 'F'});
    u32(36 + data);
    wav.insert(wav.end(), {'W', 'A', 'V', 'E', 'f', 'm', 't', ' '});
    u32(16), u16(1), u16(2), u32(rate), u32(rate * 6), u16(6), u16(24);
    wav.insert(wav.end(), {'d', 'a', 't', 'a'});
    u32(data);

    pi_event ev[256];
    float audio[128];
    size_t next = 0;
    float peak = 0;
    for (uint64_t f = 0; f < end; f += 128) {
        uint32_t n = uint32_t(std::min<uint64_t>(128, end - f));
        std::vector<pi_cmd> these;
        while (next < at.size() && at[next].first < f + n) {
            pi_cmd c = at[next].second;
            c.frame = uint32_t(at[next].first - f);
            these.push_back(c);
            next++;
        }
        pi_process(e, n, these.data(), uint32_t(these.size()), ev, 256, audio, PI_AUDIO_MIX);
        for (uint32_t i = 0; i < n; i++) {
            float x = 0.5f * audio[i];
            peak = std::max(peak, std::abs(x));
            if (x > 0.9999999f) x = 0.9999999f;
            if (x < -1.f) x = -1.f;
            int32_t s = int32_t(x * 8388608.f);
            for (int ch = 0; ch < 2; ch++)
                for (int b = 0; b < 3; b++) wav.push_back(uint8_t(uint32_t(s) >> (8 * b)));
        }
    }
    FILE *out = std::fopen(argv[2], "wb");
    if (!out || std::fwrite(wav.data(), 1, wav.size(), out) != wav.size() || std::fclose(out) != 0) {
        std::fprintf(stderr, "cannot write %s\n", argv[2]);
        return 1;
    }
    std::printf("ours-take %s: %.1f s, written at half level, peak %.3f of full scale%s\n", argv[1], double(end) / rate, peak,
                peak >= 1.f ? " (clipped)" : "");
    return 0;
}
