// P2 from C++: the static library through pi_engine.h, the way the Rack plugin will link it.
// Every fixture on both clock sources at three sample rates and three block sizes.
// fixtures/README.md says how a harness runs one; the Rust tests and trace.test.mjs do the
// same and write the same report.
//
//   harness <fixtures dir> [report file]        exits 0 only if every trace matched
//
// SPDX-License-Identifier: MIT
#include "pi_engine.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

static_assert(sizeof(pi_cmd) == 12, "pi_cmd is 12 bytes");
static_assert(sizeof(pi_event) == 12, "pi_event is 12 bytes");

[[noreturn]] static void die(const std::string &why) {
    std::fprintf(stderr, "harness: %s\n", why.c_str());
    std::exit(1);
}

// ---- just enough JSON for fixture format 1: objects, arrays, strings, whole numbers ----

struct Json {
    enum Kind { Num, Str, Arr, Obj } kind = Num;
    uint64_t num = 0;
    std::string str;
    std::vector<Json> arr;
    std::vector<std::pair<std::string, Json>> obj;

    const Json *find(const std::string &key) const {
        for (auto &f : obj)
            if (f.first == key) return &f.second;
        return nullptr;
    }
    const Json &at(const std::string &key) const {
        const Json *j = find(key);
        if (!j) die("missing field " + key);
        return *j;
    }
    uint64_t n(const std::string &key) const { return at(key).num; }
    uint64_t n_or(const std::string &key, uint64_t d) const { return find(key) ? find(key)->num : d; }
};

struct Parser {
    const std::string &s;
    size_t i = 0;
    void space() { while (i < s.size() && std::strchr(" \t\r\n", s[i])) i++; }
    char peek() { space(); if (i >= s.size()) die("JSON ends early"); return s[i]; }
    void eat(char c) { if (peek() != c) die(std::string("JSON: expected ") + c); i++; }
    std::string string() {
        eat('"');
        std::string out;
        while (i < s.size() && s[i] != '"') {
            if (s[i] == '\\') {
                char e = s.at(++i);
                if (e == 'n') out += '\n';
                else if (e == 't') out += '\t';
                else if (e == '"' || e == '\\' || e == '/') out += e;
                else die("JSON: an escape that is not in format 1");
            } else out += s[i];
            i++;
        }
        i++;
        return out;
    }
    Json value() {
        Json j;
        char c = peek();
        if (c == '{') {
            j.kind = Json::Obj;
            eat('{');
            if (peek() != '}')
                for (;;) {
                    std::string k = string();
                    eat(':');
                    j.obj.emplace_back(k, value());
                    if (peek() != ',') break;
                    eat(',');
                }
            eat('}');
        } else if (c == '[') {
            j.kind = Json::Arr;
            eat('[');
            if (peek() != ']')
                for (;;) {
                    j.arr.push_back(value());
                    if (peek() != ',') break;
                    eat(',');
                }
            eat(']');
        } else if (c == '"') {
            j.kind = Json::Str;
            j.str = string();
        } else if (c >= '0' && c <= '9') {
            while (i < s.size() && s[i] >= '0' && s[i] <= '9') j.num = j.num * 10 + uint64_t(s[i++] - '0');
        } else die("JSON: unexpected character");
        return j;
    }
};

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

static pi_cmd cmd(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0) {
    return pi_cmd{0, type, a, b, 0, value};
}

static bool is_edit(const std::string &name) {
    return name == "step" || name == "prob" || name == "swing" || name == "length";
}

static pi_cmd to_cmd(const Json &c) {
    const std::string &name = c.at("cmd").str;
    uint8_t track = uint8_t(c.n_or("track", 0)), step = uint8_t(c.n_or("step", 0));
    uint32_t value = uint32_t(c.n_or("value", 0));
    if (name == "play") return cmd(PI_CMD_PLAY, 0, 0, value);
    if (name == "reset") return cmd(PI_CMD_RESET);
    if (name == "step") return cmd(PI_CMD_STEP, track, step, value);
    if (name == "prob") return cmd(PI_CMD_PROB, track, step, value);
    if (name == "swing") return cmd(PI_CMD_SWING, 0, 0, value);
    if (name == "length") return cmd(PI_CMD_LENGTH, 0, 0, value);
    die("unknown fixture command " + name);
}

// What to send and when, and the frame the run ends before.
static uint64_t schedule(const Json &fx, uint32_t rate, uint32_t source, bool from_snapshot, std::vector<Timed> &cmds) {
    uint64_t mbpm = fx.n("mbpm"), steps = fx.n("steps");
    auto F = [&](uint64_t n) { return (n * rate * 15000 + mbpm - 1) / mbpm; };
    uint64_t anchor = 0, anchor_step = 0;
    if (!from_snapshot) cmds.push_back({0, cmd(PI_CMD_TEMPO, 0, 0, uint32_t(mbpm))});
    cmds.push_back({0, cmd(PI_CMD_SOURCE, 0, 0, source)});
    for (uint64_t m = 0; m < steps; m++) {
        uint64_t at = anchor + F(m - anchor_step);
        for (const Json &c : fx.at("commands").arr) {
            if (c.n("at") != m) continue;
            const std::string &name = c.at("cmd").str;
            if (from_snapshot && m == 0 && is_edit(name)) continue; // the snapshot carries these
            cmds.push_back({at, to_cmd(c)});
            if (name == "reset") { anchor = at; anchor_step = m; }
        }
        if (source == PI_SOURCE_EDGES) cmds.push_back({at, cmd(PI_CMD_CLOCK)});
    }
    return anchor + F(steps - anchor_step);
}

static std::string run(Host &h, const std::vector<Timed> &cmds, uint64_t end, uint32_t block) {
    std::string out;
    std::vector<pi_cmd> these;
    pi_event ev[256];
    size_t next = 0;
    for (uint64_t start = 0; start < end;) {
        uint32_t n = uint32_t(std::min<uint64_t>(block, end - start));
        these.clear();
        for (; next < cmds.size() && cmds[next].first < start + n; next++) {
            pi_cmd c = cmds[next].second;
            c.frame = uint32_t(cmds[next].first - start);
            these.push_back(c);
        }
        uint32_t got = pi_process(h.e, n, these.data(), uint32_t(these.size()), ev, 256);
        for (uint32_t i = 0; i < got; i++) {
            char line[64];
            if (ev[i].type == PI_EV_STEP) std::snprintf(line, sizeof line, "%u step %u\n", ev[i].tick, ev[i].step);
            else if (ev[i].type == PI_EV_TRIG) std::snprintf(line, sizeof line, "%u trig %u %u\n", ev[i].tick, ev[i].track, ev[i].step);
            else die("unknown event type");
            out += line;
        }
        start += n;
    }
    if (pi_dropped(h.e) != 0) die("events were dropped");
    return out;
}

int main(int argc, char **argv) {
    if (argc < 2) die("usage: harness <fixtures dir> [report file]");
    if (pi_abi_version() != PI_ABI_VERSION) die("the library's ABI is not the header's");

    std::vector<std::filesystem::path> files;
    for (auto &entry : std::filesystem::directory_iterator(argv[1]))
        if (entry.path().extension() == ".json") files.push_back(entry.path());
    std::sort(files.begin(), files.end());
    if (files.size() < 4) die("expected the four fixtures");

    const uint32_t rates[] = {44100, 48000, 96000}, blocks[] = {1, 128, 512};
    const std::pair<const char *, uint32_t> sources[] = {{"table", PI_SOURCE_TABLE}, {"edges", PI_SOURCE_EDGES}};
    std::string report;
    int runs = 0, failed = 0;

    for (auto &path : files) {
        std::stringstream text;
        text << std::ifstream(path).rdbuf();
        std::string s = text.str();
        Parser p{s};
        Json fx = p.value();
        std::string name = path.stem().string();
        if (fx.n("format") != 1 || fx.n("ticks_per_step") != PI_TICKS_PER_STEP) die(name + ": not a format this harness runs");
        uint32_t seed = uint32_t(fx.n("seed"));
        std::string want;
        for (const Json &l : fx.at("expect").arr) want += l.str + "\n";

        auto check = [&](const std::string &label, const std::string &got) {
            runs++;
            if (got != want) {
                failed++;
                std::fprintf(stderr, "MISMATCH %s\n", label.c_str());
            }
            report += "# " + label + "\n" + got;
        };

        for (auto &[source_name, source] : sources) {
            for (uint32_t rate : rates) {
                std::string where = name + " " + source_name + " " + std::to_string(rate);
                for (uint32_t block : blocks) {
                    std::vector<Timed> cmds;
                    uint64_t end = schedule(fx, rate, source, false, cmds);
                    Host h(rate, seed);
                    check(where + " " + std::to_string(block), run(h, cmds, end, block));
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
                uint64_t end = schedule(fx, rate, source, true, cmds);
                std::string hex;
                for (uint8_t byte : snap) {
                    char two[3];
                    std::snprintf(two, sizeof two, "%02x", byte);
                    hex += two;
                }
                check(where + " snapshot " + hex, run(b, cmds, end, 128));

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
