// P2 from C++: the static library through pi_engine.h, the way the Rack plugin will link it.
// Every fixture on both clock sources at three sample rates and three block sizes.
// fixtures/README.md says how a harness runs one; the Rust tests and trace.test.mjs do the
// same and write the same report.
//
//   harness <fixtures dir> [report file]        exits 0 only if every trace matched
//   harness --render <scenario.json> <prefix>   P7: writes <prefix>-<source>-<rate>.f32, the mix,
//                                               and <...>-16ch.f32 / -17ch.f32 for its "layouts"
//
// SPDX-License-Identifier: MIT
#include "fixture.hpp"

#include <algorithm>
#include <cstring>
#include <iterator>
#include <filesystem>

// ---- the engine, in memory this program owns ----

struct Host {
    std::vector<uint64_t> mem;
    pi_engine *e;
    Host(uint32_t rate, uint32_t seed) : mem((pi_size() + 7) / 8) {
        e = pi_init(mem.data(), uint32_t(mem.size() * 8), rate, seed);
        if (!e) die("pi_init refused good memory");
    }
};

using Timed = std::pair<uint64_t, pi_cmd>;
// A view to read: the frame its block ends on, and the text expected there (format 2).
using View = std::pair<uint64_t, std::string>;

// What to send and when, and the frame the run ends before.
static uint64_t schedule(const Json &fx, uint32_t rate, uint32_t source, bool from_snapshot, std::vector<Timed> &cmds,
                         std::vector<View> *views = nullptr) {
    uint64_t mbpm = fx.n("mbpm"), steps = fx.n("steps");
    auto F = [&](uint64_t n) { return (n * rate * 15000 + mbpm - 1) / mbpm; };
    uint64_t anchor = 0, anchor_step = 0;
    std::vector<uint64_t> step_frames;
    if (!from_snapshot) cmds.push_back({0, cmd(PI_CMD_TEMPO, 0, 0, uint32_t(mbpm))});
    cmds.push_back({0, cmd(PI_CMD_SOURCE, 0, 0, source)});
    for (uint64_t m = 0; m < steps; m++) {
        uint64_t at = anchor + F(m - anchor_step);
        step_frames.push_back(at);
        for (const Json &c : fx.at("commands").arr) {
            if (c.n("at") != m) continue;
            const std::string &name = c.at("cmd").str;
            if (is_key(name)) continue;
            if (from_snapshot && m == 0 && is_edit(name)) continue; // the snapshot carries these
            cmds.push_back({at, to_cmd(c)});
            if (name == "reset") { anchor = at; anchor_step = m; }
        }
        if (source == PI_SOURCE_EDGES) cmds.push_back({at, cmd(PI_CMD_CLOCK)});
        // Keys and sliders: one frame on, so the step's tick 0 is behind them on both sources.
        for (const Json &c : fx.at("commands").arr)
            if (c.n("at") == m && is_key(c.at("cmd").str)) cmds.push_back({at + 1, to_cmd(c)});
    }
    uint64_t end = anchor + F(steps - anchor_step);
    // A view is read where its run step ends: on the frame the next one falls on. Written
    // for the table run; the edges run differs in that one flag.
    if (views && fx.find("views"))
        for (const Json &v : fx.at("views").arr) {
            uint64_t at = v.n("at");
            if (at >= steps) die("a view past the end of the run");
            std::string text = v.at("view").str;
            size_t flag = text.find(" edges=0 ");
            if (source == PI_SOURCE_EDGES && flag != std::string::npos) text[flag + 7] = '1';
            views->push_back({at + 1 < steps ? step_frames[at + 1] : end, text});
        }
    return end;
}

// Runs to `end` in blocks of `block`, ending a block wherever a view is to be read. Returns
// the trace; with `views`, each one read is appended to `seen` as a line, and `ok` is cleared
// if any is not the text expected.
static std::string run(Host &h, const std::vector<Timed> &cmds, uint64_t end, uint32_t block, std::vector<float> *audio = nullptr,
                       const std::vector<View> *views = nullptr, std::string *seen = nullptr, bool *ok = nullptr,
                       uint32_t channels = PI_AUDIO_MIX) {
    if (audio) audio->assign(end * channels, 0.f);
    std::string out;
    std::vector<pi_cmd> these;
    pi_event ev[256];
    size_t next = 0, view = 0;
    for (uint64_t start = 0; start < end;) {
        uint64_t stop = views && view < views->size() ? (*views)[view].first : end;
        uint32_t n = uint32_t(std::min<uint64_t>(block, stop - start));
        these.clear();
        for (; next < cmds.size() && cmds[next].first < start + n; next++) {
            pi_cmd c = cmds[next].second;
            c.frame = uint32_t(cmds[next].first - start);
            these.push_back(c);
        }
        uint32_t got = pi_process(h.e, n, these.data(), uint32_t(these.size()), ev, 256,
                                  audio ? audio->data() + start * channels : nullptr, audio ? channels : PI_AUDIO_NONE);
        for (uint32_t i = 0; i < got; i++) {
            char line[64];
            if (ev[i].type == PI_EV_STEP) std::snprintf(line, sizeof line, "%u step %u\n", ev[i].tick, ev[i].step);
            else if (ev[i].type == PI_EV_TRIG) std::snprintf(line, sizeof line, "%u trig %u %u\n", ev[i].tick, ev[i].track, ev[i].step);
            else die("unknown event type");
            out += line;
        }
        start += n;
        while (views && view < views->size() && (*views)[view].first == start) {
            uint8_t b[PI_VIEW_SIZE];
            if (pi_view(h.e, b, sizeof b) != PI_VIEW_SIZE) die("pi_view");
            std::string got = view_text(b);
            if (got != (*views)[view].second) *ok = false;
            *seen += got + "\n";
            view++;
        }
    }
    if (views && view != views->size()) die("a view was never read");
    if (pi_dropped(h.e) != 0) die("events were dropped");
    return out;
}

// D50: the starter pack as the engine reads it, in track order (samples/tracks.txt), from
// beside the harness folder the scenario is in. Little-endian on disk; every target is too.
static std::vector<std::vector<int16_t>> starter_pack(const std::string &scenario) {
    std::filesystem::path dir = std::filesystem::path(scenario).parent_path() / ".." / "samples";
    std::ifstream list(dir / "tracks.txt");
    std::vector<std::vector<int16_t>> pack;
    for (std::string name; std::getline(list, name);) {
        std::ifstream f(dir / "raw" / (name + ".s16"), std::ios::binary);
        std::vector<char> bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
        if (bytes.empty() || bytes.size() % 2) die("cannot read the sample " + name);
        pack.emplace_back(bytes.size() / 2);
        std::memcpy(pack.back().data(), bytes.data(), bytes.size());
    }
    if (pack.size() != PI_TRACKS) die("samples/tracks.txt does not name sixteen samples");
    return pack;
}

// P7: the scenario on both clock sources at three rates, as raw little-endian floats: the mix,
// and each other layout its "layouts" names (§15), with the channel count in the file's name.
// trace.test.mjs writes the same from the .wasm and compare.mjs holds the two to the bar.
static int render(const std::string &scenario, const std::string &prefix) {
    Json fx = read_fixture(scenario);
    std::vector<std::vector<int16_t>> pack;
    if (fx.n_or("samples", 0)) pack = starter_pack(scenario);
    std::vector<uint32_t> layouts{PI_AUDIO_MIX};
    if (fx.find("layouts")) {
        layouts.clear();
        for (const Json &l : fx.at("layouts").arr) layouts.push_back(uint32_t(l.num));
    }
    for (uint32_t c : layouts)
        if (c != PI_AUDIO_MIX && c != PI_AUDIO_TRACKS && c != PI_AUDIO_BOTH) die("a layout this core does not have");
    if (std::find(layouts.begin(), layouts.end(), PI_AUDIO_MIX) == layouts.end()) die("every render has the mix");
    const std::pair<const char *, uint32_t> sources[] = {{"table", PI_SOURCE_TABLE}, {"edges", PI_SOURCE_EDGES}};
    for (auto &[source_name, source] : sources)
        for (uint32_t rate : {44100u, 48000u, 96000u}) {
            std::vector<Timed> cmds;
            uint64_t end = schedule(fx, rate, source, false, cmds);
            std::vector<float> by[PI_AUDIO_BOTH + 1];
            for (uint32_t channels : layouts) {
                Host h(rate, uint32_t(fx.n("seed")));
                for (uint32_t t = 0; t < pack.size(); t++)
                    if (pi_set_sample(h.e, t, pack[t].data(), uint32_t(pack[t].size())) != 1) die("pi_set_sample refused a sample");
                std::vector<float> &audio = by[channels];
                run(h, cmds, end, 128, &audio, nullptr, nullptr, nullptr, channels);
                std::string suffix = channels == PI_AUDIO_MIX ? "" : "-" + std::to_string(channels) + "ch";
                std::ofstream out(prefix + "-" + source_name + "-" + std::to_string(rate) + suffix + ".f32", std::ios::binary);
                out.write(reinterpret_cast<const char *>(audio.data()), std::streamsize(audio.size() * sizeof(float)));
                if (!out) die("cannot write the render");
            }
            // §15: the seventeen channels are the sixteen, then the mix, bit for bit.
            if (!by[PI_AUDIO_BOTH].empty()) {
                if (by[PI_AUDIO_TRACKS].empty()) die("layout 17 is held to layout 16: render both");
                const std::vector<float> &b = by[PI_AUDIO_BOTH], &t = by[PI_AUDIO_TRACKS], &m = by[PI_AUDIO_MIX];
                for (uint64_t f = 0; f < end; f++) {
                    if (std::memcmp(&b[f * 17], &t[f * 16], 16 * sizeof(float)) != 0) die("layout 17's tracks are not layout 16's");
                    if (std::memcmp(&b[f * 17 + 16], &m[f], sizeof(float)) != 0) die("layout 17's mix is not layout 1's");
                }
            }
        }
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) die("usage: harness <fixtures dir> [report file]");
    if (pi_abi_version() != PI_ABI_VERSION) die("the library's ABI is not the header's");
    if (std::string(argv[1]) == "--render") return argc == 4 ? render(argv[2], argv[3]) : (die("usage: harness --render <scenario.json> <prefix>"), 1);

    std::vector<std::filesystem::path> files;
    for (auto &entry : std::filesystem::directory_iterator(argv[1]))
        if (entry.path().extension() == ".json") files.push_back(entry.path());
    std::sort(files.begin(), files.end());
    if (files.size() < 7) die("expected the seven fixtures");

    const uint32_t rates[] = {44100, 48000, 96000}, blocks[] = {1, 128, 512};
    const std::pair<const char *, uint32_t> sources[] = {{"table", PI_SOURCE_TABLE}, {"edges", PI_SOURCE_EDGES}};
    std::string report;
    int runs = 0, failed = 0;

    for (auto &path : files) {
        Json fx = read_fixture(path.string());
        std::string name = path.stem().string();
        uint32_t seed = uint32_t(fx.n("seed"));
        std::string want;
        for (const Json &l : fx.at("expect").arr) want += l.str + "\n";

        // The report holds each run's trace, then its views.
        auto check = [&](const std::string &label, const std::string &got, const std::string &seen, bool views_ok) {
            runs++;
            if (got != want || !views_ok) {
                failed++;
                std::fprintf(stderr, "MISMATCH %s%s\n", label.c_str(), views_ok ? "" : " (a view)");
            }
            report += "# " + label + "\n" + got + seen;
        };

        for (auto &[source_name, source] : sources) {
            for (uint32_t rate : rates) {
                std::string where = name + " " + source_name + " " + std::to_string(rate);
                for (uint32_t block : blocks) {
                    std::vector<Timed> cmds;
                    std::vector<View> views;
                    uint64_t end = schedule(fx, rate, source, false, cmds, &views);
                    Host h(rate, seed);
                    std::string seen;
                    bool ok = true;
                    std::string got = run(h, cmds, end, block, nullptr, &views, &seen, &ok);
                    check(where + " " + std::to_string(block), got, seen, ok);
                }

                // Save, load into a fresh engine with another seed, same trace.
                uint8_t snap[PI_SNAPSHOT_SIZE];
                {
                    Host a(rate, seed);
                    std::vector<Timed> edits{{0, cmd(PI_CMD_TEMPO, 0, 0, uint32_t(fx.n("mbpm")))}};
                    for (const Json &c : fx.at("commands").arr)
                        if (c.n("at") == 0 && is_edit(c.at("cmd").str)) edits.push_back({0, to_cmd(c)});
                    run(a, edits, 1, 1);
                    if (pi_save(a.e, snap, sizeof snap) != PI_SNAPSHOT_SIZE) die("pi_save");
                }
                Host b(rate, seed + 12345);
                if (pi_load(b.e, snap, sizeof snap) != PI_OK) die("pi_load refused a good snapshot");
                std::vector<Timed> cmds;
                std::vector<View> views;
                uint64_t end = schedule(fx, rate, source, true, cmds, &views);
                std::string hex;
                for (uint8_t byte : snap) {
                    char two[3];
                    std::snprintf(two, sizeof two, "%02x", byte);
                    hex += two;
                }
                std::string seen;
                bool ok = true;
                std::string got = run(b, cmds, end, 128, nullptr, &views, &seen, &ok);
                check(where + " snapshot " + hex, got, seen, ok);

                // One flipped bit is refused.
                snap[40] ^= 1;
                if (pi_load(b.e, snap, sizeof snap) != PI_ERR_CRC) die("pi_load took a corrupted snapshot");
            }
        }
    }

    if (argc > 2) std::ofstream(argv[2], std::ios::binary) << report;
    std::printf("harness: %d runs, %d failed\n", runs, failed);
    return failed == 0 && runs == int(files.size()) * 2 * 3 * 4 ? 0 : 1;
}
