// What both C++ harnesses share: just enough JSON for fixture format 1, and a fixture's
// commands as pi_cmd records. harness.cpp runs the fixtures (P2); race.cpp is P6.
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
    if (name == "sound") return cmd(PI_CMD_SOUND, track, uint8_t(c.n_or("param", 0)), value); // P7 only
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
    if (fx.n("format") != 1 || fx.n("ticks_per_step") != PI_TICKS_PER_STEP) die(path + ": not a format this harness runs");
    return fx;
}
