// What both C++ harnesses share: just enough JSON for the fixture formats, a fixture's
// commands as pi_cmd records, and a view block as text (formats 2 to 4). harness.cpp runs the fixtures (P2); race.cpp is P6.
//
// SPDX-License-Identifier: MIT
#pragma once
#include "pi_engine.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

static_assert(sizeof(pi_cmd) == 12, "pi_cmd is 12 bytes");
static_assert(sizeof(pi_event) == 12, "pi_event is 12 bytes");

[[noreturn]] static void die(const std::string &why) {
    std::fprintf(stderr, "%s\n", why.c_str());
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

static pi_cmd cmd(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0) {
    return pi_cmd{0, type, a, b, 0, value};
}

// Format 2: what a finger did. These land a frame after their step's boundary.
[[maybe_unused]] static bool is_key(const std::string &name) {
    return name == "key_down" || name == "key_up" || name == "param";
}

static bool is_edit(const std::string &name) {
    return name == "step" || name == "prob" || name == "swing" || name == "length" || name == "fx" || name == "fxsound" ||
           name == "keep";
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
    if (name == "fx") return cmd(PI_CMD_FX, step, 0, value);         // format 3
    if (name == "fxsound") return cmd(PI_CMD_FXSOUND, track, 0, value); // format 3
    if (name == "keep") return cmd(PI_CMD_KEEP, track, step, uint32_t(c.n("a")) << 16 | uint32_t(c.n("b"))); // format 4
    if (name == "key_down") return cmd(PI_CMD_KEY_DOWN, uint8_t(c.n("key")));
    if (name == "key_up") return cmd(PI_CMD_KEY_UP, uint8_t(c.n("key")));
    if (name == "param") return cmd(PI_CMD_PARAM, uint8_t(c.n("slider")), 0, value);
    if (name == "sound") return cmd(PI_CMD_SOUND, track, uint8_t(c.n_or("param", 0)), value); // P7 only
    if (name == "route") return cmd(PI_CMD_ROUTE, uint8_t(c.n("what")), 0, value);              // P7 only (§19)
    if (name == "voice") return cmd(PI_CMD_VOICE, track, 0, value); // D50, render scenarios only
    die("unknown fixture command " + name);
}

static Json read_fixture(const std::string &path) {
    std::stringstream text;
    text << std::ifstream(path).rdbuf();
    std::string s = text.str();
    if (s.empty()) die("cannot read " + path);
    Parser p{s};
    Json fx = p.value();
    uint64_t format = fx.n("format");
    if (format < 1 || format > 4 || fx.n("ticks_per_step") != PI_TICKS_PER_STEP) die(path + ": not a format this harness runs");
    if (format == 1 && fx.find("views")) die(path + ": views are format 2's to 4's");
    return fx;
}

// ENGINE.md section 14's text line for a view block: what a format 2 fixture holds. For
// format 3, section 17's three fields on its end; for format 4, then section 20's two.
[[maybe_unused]] static std::string view_text(const uint8_t *b, uint64_t format = 2) {
    auto u16 = [&](unsigned i) { return unsigned(b[i] | b[i + 1] << 8); };
    auto u32 = [&](unsigned i) { return uint32_t(b[i]) | uint32_t(b[i + 1]) << 8 | uint32_t(b[i + 2]) << 16 | uint32_t(b[i + 3]) << 24; };
    unsigned flags = b[PI_VIEW_FLAGS];
    auto flag = [&](unsigned bit) { return flags & bit ? 1 : 0; };
    std::string step = flags & PI_VIEW_FLAG_STEP ? std::to_string(b[PI_VIEW_STEP]) : "-";
    char line[320];
    std::snprintf(line, sizeof line,
                  "view play=%d write=%d edges=%d sounds=%d step=%s sel=%u vol=%u tempo=%u len=%u swing=%u held=%06x field=%04x stitch=%04x bar=%04x sampled=%04x a=%u b=%u fires=",
                  flag(PI_VIEW_FLAG_PLAYING), flag(PI_VIEW_FLAG_WRITE), flag(PI_VIEW_FLAG_EDGES), flag(PI_VIEW_FLAG_SOUNDS), step.c_str(),
                  unsigned(b[PI_VIEW_SEL]), unsigned(b[PI_VIEW_VOLUME]), u32(PI_VIEW_TEMPO), unsigned(b[PI_VIEW_LENGTH]), unsigned(b[PI_VIEW_SWING]),
                  u32(PI_VIEW_HELD), u16(PI_VIEW_FIELD), u16(PI_VIEW_STITCH), u16(PI_VIEW_BAR), u16(PI_VIEW_SAMPLED), u16(PI_VIEW_A), u16(PI_VIEW_B));
    std::string out = line;
    for (unsigned t = 0; t < PI_TRACKS; t++) out += (t ? "," : "") + std::to_string(b[PI_VIEW_FIRES + t]);
    if (format >= 3) {
        char fx[64];
        std::snprintf(fx, sizeof fx, " fx=%u fxsteps=%04x fxsounds=%04x", unsigned(b[PI_VIEW_HEARD]), u16(PI_VIEW_FX_STEPS), u16(PI_VIEW_FX_SOUNDS));
        out += fx;
    }
    if (format >= 4) {
        char keep[32];
        std::snprintf(keep, sizeof keep, " ea=%u eb=%u", u16(PI_VIEW_HIT_A), u16(PI_VIEW_HIT_B));
        out += keep;
    }
    return out;
}
