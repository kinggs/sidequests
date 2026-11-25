// Differential fuzz harness for the pocket-instruments engine (pi_engine.h, ABI 15).
//
//   fuzz-<lib> <first seed> <count>        one line a seed: "<seed> <fnv1a-64 of everything>"
//   fuzz-<lib> --stats <first seed> <count> the same, plus how much sound and which effects
//   fuzz-<lib> --dump <seed> <prefix>       every output of every call, to <prefix>.bin, and a
//                                           log line a call (what went in, what was live) to <prefix>.log
//
// Every choice comes from a PRNG seeded by the seed and never from anything the engine returns,
// so every build gets exactly the same calls.
//
// Why it is kept (D102 item 4): it is the only check here that an efficiency change moves no
// byte on inputs nobody thought to write a test for. Written by the agent that fuzzed the three
// attempts of 2026-11-25 (harness/efficiency-candidates/README.md); kept as it left it but this
// comment. `make fuzz OLD=<an older libpi_core.a>` builds it on that library and on this build's,
// runs seeds 1 to 400 on each (`SEEDS=` for more) and compares the lines; on a difference, `--dump`
// both and `python3 -I harness/fuzz-firstdiff.py <prefix A> <prefix B>` names the first record
// that differs. Not in `make test`: it needs an older build. A seed is about 0.04 s of one CPU
// (Session 36: 400 seeds each way in 5 s on this laptop's 32 threads, 10 000 in 32 s).
//
// What it covers, each a choice of the PRNG: every command, out-of-range values and unknown
// kinds included, on slot 0 and others, out of order and past the block; held keys (fx and a
// key, effects switched, effect 1 on and off within a millisecond with sounds ringing); the
// three rates, changed mid-sound and while an effect is held; every layout (1, 16, 17, 18, 50),
// no buffer, a null buffer and layouts the core refuses; loop inputs of zeros, -0, denormals,
// NaN, infinities, large values, and what the last call wrote; blocks of 0 to 512 frames and
// event buffers too small; the table clock, one edge a step and one edge a beat, regular,
// irregular, with gaps and double edges; snapshots saved (to short buffers too) and loaded
// (version 1's length, truncated, a bit flipped); samples set, replaced and cleared while
// sounding, of 1 to 44 100 frames, misaligned and on tracks past 15; effect 4's line lent,
// too short, null, after a rate change. It hashes every output: the audio a block writes, the
// events, the view, the generation, `pi_dropped`, every snapshot byte and every return value.
//
// What it does not: the .wasm (native only; `make test` holds the two to each other); `pi_weave`;
// threads (harness/race.cpp); more than one engine, or `pi_init` given bad memory; a sample's
// data changed while the core holds it (the contract forbids it); rates other than the three;
// whether anything sounds right. It proves the same bytes as the older build, nothing more: a
// change meant to move bytes fails it by design.
//
// It must not call `fmod`: libpi_core.a carries compiler_builtins' `fmod` as a weak symbol, so
// the link would take it from whichever library it is linked with, and the two builds would no
// longer run the same harness. `make fuzz` checks that neither binary defines it.
#include "pi_engine.h"

#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <string>
#include <vector>
#include <algorithm>

// ---- PRNG (splitmix64) ----
struct Rng {
    uint64_t s;
    explicit Rng(uint64_t seed) : s(seed * 0x9E3779B97F4A7C15ull + 0x1234567ull) {}
    uint64_t next() {
        uint64_t z = (s += 0x9E3779B97F4A7C15ull);
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ull;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBull;
        return z ^ (z >> 31);
    }
    uint32_t u(uint32_t n) { return n ? uint32_t(next() % n) : 0; }          // 0..n-1
    uint32_t r(uint32_t lo, uint32_t hi) { return lo + u(hi - lo + 1); }     // lo..hi
    bool p(double prob) { return double(next() >> 11) * (1.0 / 9007199254740992.0) < prob; }
    double f() { return double(next() >> 11) * (1.0 / 9007199254740992.0); }
};

// ---- FNV-1a 64 ----
struct Fnv {
    uint64_t h = 0xcbf29ce484222325ull;
    void add(const void *p, size_t n) {
        const uint8_t *b = static_cast<const uint8_t *>(p);
        for (size_t i = 0; i < n; i++) { h ^= b[i]; h *= 0x100000001b3ull; }
    }
    void u32(uint32_t v) { add(&v, 4); }
};

static pi_cmd C(uint8_t type, uint8_t a = 0, uint8_t b = 0, uint32_t value = 0, uint32_t frame = 0) {
    return pi_cmd{frame, type, a, b, 0, value};
}

static const uint32_t RATES[3] = {44100, 48000, 96000};
static const uint32_t MAXBLOCK = 512, MAXCH = 64;

enum Mode { HASH, STATS, DUMP };

struct Timed { uint32_t at; int kind; pi_cmd c; };  // kind 0: a command; >0: an action between blocks
enum Action { A_RATE = 1, A_SAVE, A_LOAD, A_SAMPLE, A_LEND, A_PROBE };

struct Session {
    Rng R;
    Mode mode;
    FILE *bin = nullptr, *log = nullptr;
    Fnv H;
    std::vector<uint64_t> mem;
    pi_engine *e = nullptr;
    uint32_t rate;
    std::deque<std::vector<int16_t>> samples;   // kept alive for the whole session (D50)
    std::deque<std::vector<float>> lines;       // every line ever lent, kept alive (D91)
    std::vector<std::vector<uint8_t>> snaps;
    std::vector<float> audio;
    pi_event ev[512];
    uint32_t layout = PI_AUDIO_MIX;
    bool nulbuf = false;
    bool zero_in = false;       // a quiet segment: the loop inputs are exact zeros
    uint32_t held = 0;          // our model of keys down (only for choosing sensible presses)
    bool lend_ever, lend_after_rate;
    double density;
    int all16;
    uint32_t call = 0;
    // stats
    uint64_t nz = 0, tot = 0, mixnz = 0, mixtot = 0, mixloud = 0, quietruns = 0, run0 = 0;
    uint64_t heard_frames[17] = {0};
    uint64_t frames_total = 0;
    std::string pending;
    int last_silent = -1;       // the last block's output: 1 all +0, 0 not, -1 nothing written
    uint64_t probes = 0, probes_silent = 0, probes_null = 0;        // what went in since the last call (for the log)

    explicit Session(uint64_t seed, Mode m) : R(seed), mode(m) {}

    void logf(const char *fmt, ...) __attribute__((format(printf, 2, 3))) {
        if (!log) return;
        char buf[512];
        va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
        pending += buf;
    }
    void rec(uint32_t tag, const void *p, uint32_t n) {
        if (!bin) return;
        fwrite(&tag, 4, 1, bin); fwrite(&n, 4, 1, bin); if (n) fwrite(p, 1, n, bin);
    }

    // ---- samples ----
    const int16_t *make_sample(uint32_t &frames) {
        uint32_t k = R.u(6);
        frames = k == 0 ? R.r(1, 8) : k == 1 ? R.r(9, 200) : k == 2 ? R.r(200, 4000) : R.r(4000, 44100);
        samples.emplace_back(frames + 1);
        std::vector<int16_t> &s = samples.back();
        uint32_t shape = R.u(5);
        double fr = 30 + R.f() * 3000, amp = R.p(0.2) ? 32767 : 2000 + R.f() * 30000;
        for (uint32_t i = 0; i < frames; i++) {
            double t = double(i) / 44100.0, env = std::exp(-t * (1 + R.f() * 0.0 + 5.0 * (shape & 1)));
            double v;
            switch (shape) {
            case 0: v = std::sin(2 * M_PI * fr * t); break;
            case 1: v = (R.f() * 2 - 1); break;
            case 2: v = (fr * t - double((long long)(fr * t))) < 0.5 ? 1 : -1; break;
            case 3: v = (i & 1) ? 1 : -1; break;
            default: v = std::sin(2 * M_PI * fr * t * (1 + 3 * env)) * env; break;
            }
            double x = v * amp * (shape == 4 ? 1 : env);
            s[i] = int16_t(std::max(-32768.0, std::min(32767.0, x)));
        }
        if (R.p(0.05)) s[0] = -32768;
        return s.data();
    }

    // ---- the delay line ----
    void lend() {
        uint32_t need = pi_delay_frames(rate), k = R.u(20), n;
        float *p;
        if (k == 0) { p = nullptr; n = need; }
        else if (k == 1) { lines.emplace_back(need); p = lines.back().data(); n = need - 1; }       // too short: refused
        else { n = k < 4 ? need + R.r(1, 5000) : need; lines.emplace_back(n);
               std::vector<float> &l = lines.back();
               for (auto &x : l) x = R.p(0.5) ? float(R.f() * 2 - 1) : (R.p(0.01) ? NAN : 0.f);   // never heard (D91)
               p = l.data(); }
        uint32_t got = pi_set_delay(e, p, n);
        H.u32(0xde1a0000 | got);
        rec(5, &got, 4);
        logf("lend(%u/%u)=%u ", n, need, got);
    }

    // ---- one random command ----
    pi_cmd rcmd() {
        uint32_t k = R.u(100);
        if (k < 10) {                                            // STEP
            uint8_t t = R.p(0.02) ? uint8_t(R.r(16, 255)) : uint8_t(R.u(16));
            uint8_t s = R.p(0.02) ? uint8_t(R.r(16, 255)) : uint8_t(R.u(16));
            return C(PI_CMD_STEP, t, s, R.p(0.6) ? 1 : (R.p(0.1) ? R.r(2, 1000) : 0));
        }
        if (k < 18) {                                            // FIRE
            return C(PI_CMD_FIRE, R.p(0.02) ? uint8_t(R.r(16, 255)) : uint8_t(R.u(16)));
        }
        if (k < 22) return C(PI_CMD_KEEP, uint8_t(R.u(17)), uint8_t(R.u(17)), uint32_t(R.next()));
        if (k < 25) return C(PI_CMD_PROB, uint8_t(R.u(17)), uint8_t(R.u(17)), R.p(0.1) ? R.r(101, 100000) : R.r(0, 100));
        if (k < 27) return C(PI_CMD_SWING, 0, 0, R.p(0.1) ? uint32_t(R.next()) : R.r(0, 48));
        if (k < 29) return C(PI_CMD_LENGTH, 0, 0, R.p(0.1) ? uint32_t(R.next() % 1000) : R.r(1, 16));
        if (k < 32) {
            uint32_t v = R.u(10) == 0 ? uint32_t(R.next()) : R.u(10) == 0 ? (R.p(0.5) ? PI_MBPM_MIN : PI_MBPM_MAX) : R.r(PI_MBPM_MIN, PI_MBPM_MAX);
            return C(PI_CMD_TEMPO, 0, 0, v);
        }
        if (k < 35) return C(PI_CMD_PLAY, 0, 0, R.p(0.75) ? 1 : (R.p(0.9) ? 0 : R.r(2, 9)));
        if (k < 36) return C(PI_CMD_RESET);
        if (k < 42) {
            uint32_t v = R.u(4);
            uint32_t val = R.p(0.15) ? 0 : R.p(0.15) ? 65535 : R.p(0.05) ? R.r(65536, 1000000) : R.u(65536);
            return C(PI_CMD_SOUND, uint8_t(R.u(17)), uint8_t(v < 3 ? v % 2 : R.u(5)), val);
        }
        if (k < 46) return C(PI_CMD_VOICE, uint8_t(R.u(17)), 0, R.p(0.9) ? R.u(2) : R.r(2, 9));
        if (k < 51) return C(PI_CMD_FX, uint8_t(R.p(0.05) ? R.r(16, 255) : R.u(16)), 0, R.p(0.05) ? R.r(17, 300) : R.r(0, 16));
        if (k < 54) return C(PI_CMD_FXSOUND, uint8_t(R.u(17)), 0, R.p(0.7) ? 1 : (R.p(0.8) ? 0 : R.r(2, 9)));
        if (k < 58) {                                            // ROUTE
            uint8_t a = R.p(0.05) ? uint8_t(R.r(5, 255)) : uint8_t(R.u(5));
            uint32_t m = R.p(0.3) ? 0 : R.p(0.2) ? 0xffff : uint32_t(R.next() & (R.p(0.1) ? 0xffffffff : 0xffff));
            if (a == 1 && R.p(0.6)) m &= uint32_t(R.next()) & uint32_t(R.next());   // keep most effects the core's
            return C(PI_CMD_ROUTE, a, 0, m);
        }
        if (k < 80) {                                            // keys
            if (held && R.p(0.45)) {
                uint32_t bits[23], n = 0;
                for (uint32_t i = 0; i < 23; i++) if (held >> i & 1) bits[n++] = i;
                uint32_t key = bits[R.u(n)];
                held &= ~(1u << key);
                return C(PI_CMD_KEY_UP, uint8_t(key));
            }
            uint32_t key = R.p(0.03) ? R.r(23, 255) : R.p(0.5) ? R.u(16) : R.r(16, 22);
            if (key == PI_KEY_PLAY && R.p(0.5)) key = R.u(16);
            if (key < 23) held |= 1u << key;
            return C(R.p(0.03) ? PI_CMD_KEY_UP : PI_CMD_KEY_DOWN, uint8_t(key));
        }
        if (k < 86) {
            uint32_t val = R.p(0.15) ? 0 : R.p(0.15) ? 65535 : R.p(0.05) ? R.r(65536, 1000000) : R.u(65536);
            return C(PI_CMD_PARAM, uint8_t(R.p(0.95) ? R.u(2) : R.r(2, 255)), 0, val);
        }
        if (k < 89) return C(PI_CMD_SOURCE, 0, 0, R.p(0.95) ? R.u(3) : R.r(3, 9));
        if (k < 94) return C(PI_CMD_CLOCK);
        if (k < 96) { pi_cmd c = C(uint8_t(R.p(0.5) ? R.r(6, 15) : R.r(35, 255)), uint8_t(R.u(256)), uint8_t(R.u(256)), uint32_t(R.next())); return c; }
        pi_cmd c = rcmd2();
        return c;
    }
    pi_cmd rcmd2() {   // a command on another slot (nonzero), or a FIRE
        pi_cmd c = C(PI_CMD_FIRE, uint8_t(R.u(16)));
        if (R.p(0.3)) c.slot = uint8_t(R.r(1, 255));
        return c;
    }

    // ---- input fill for the loop layouts ----
    float rin(uint32_t style) {
        switch (style) {
        case 0: return 0.f;
        case 1: return R.p(0.1) ? float((R.f() * 2 - 1) * 1e-38) : float((R.f() * 2 - 1) * 1e-3);
        case 2: return float((R.f() * 2 - 1) * (R.p(0.5) ? 10 : 1e5));
        case 3: {
            uint32_t k = R.u(100);
            if (k < 30) return 0.f;
            if (k < 45) return -0.f;
            if (k < 60) return float((R.f() * 2 - 1) * 1e-4);
            if (k < 75) return float((R.f() * 2 - 1) * 50);
            if (k < 78) return R.p(0.5) ? NAN : (R.p(0.5) ? INFINITY : -INFINITY);
            return float(R.f() * 2 - 1);
        }
        default: return float(R.f() * 2 - 1);
        }
    }

    // ---- one pi_process ----
    void process(uint32_t n, std::vector<pi_cmd> &cmds) {
        // the layout: sticky, switched now and then
        if (R.p(0.04)) {
            uint32_t k = R.u(100);
            layout = k < 35 ? PI_AUDIO_MIX : k < 47 ? PI_AUDIO_TRACKS : k < 62 ? PI_AUDIO_BOTH : k < 77 ? PI_AUDIO_LOOP
                   : k < 90 ? PI_AUDIO_LOOP_SLIDERS : k < 94 ? PI_AUDIO_NONE : R.p(0.5) ? 2 : (R.p(0.5) ? 19 : 49);
            nulbuf = R.p(0.06);
        }
        uint32_t ch = layout;
        bool loop = ch == PI_AUDIO_LOOP || ch == PI_AUDIO_LOOP_SLIDERS;
        float *buf = nulbuf ? nullptr : audio.data();
        uint32_t hashch = ch == 0 ? 0 : ch;   // floats a frame we hash (other values: whatever is there)
        if (buf) {
            if (loop) {
                uint32_t style = R.u(6);
                if (zero_in) style = 0;
                if (style != 5) {   // 5: leave what the last call wrote (a feedback patch)
                    for (uint32_t i = 0; i < n * ch; i++) audio[i] = rin(style == 4 && R.p(0.5) ? 3 : style);
                }
            } else if (R.p(0.3)) {
                for (uint32_t i = 0; i < n * MAXCH; i++) audio[i] = 0.25f;   // stale garbage the engine must overwrite
            }
        }
        uint32_t cap = R.p(0.97) ? 512 : R.p(0.5) ? PI_EVENTS_MIN : R.r(0, 8);
        uint32_t got = pi_process(e, n, cmds.data(), uint32_t(cmds.size()), ev, cap, buf, ch);
        uint8_t view[PI_VIEW_SIZE];
        uint32_t vs = pi_view(e, view, sizeof view);
        uint32_t gen = pi_generation(e), drop = pi_dropped(e);
        uint32_t nfl = buf ? n * hashch : 0;
        H.u32(got);
        if (nfl) H.add(buf, nfl * 4);
        H.add(ev, got * sizeof(pi_event));
        H.u32(vs); H.add(view, PI_VIEW_SIZE);
        H.u32(gen); H.u32(drop);
        frames_total += n;
        if (nfl && n) { bool z = true; for (uint32_t i = 0; i < nfl; i++) { uint32_t b; memcpy(&b, &buf[i], 4); if (b) { z = false; break; } } last_silent = z; } else last_silent = -1;
        uint32_t heard = view[PI_VIEW_HEARD];
        if (heard <= 16) heard_frames[heard] += n;
        if (mode == STATS && buf && (ch == 1 || ch == 17 || loop)) {
            uint32_t mixc = ch == 1 ? 0 : 16;
            for (uint32_t f = 0; f < n; f++) { mixtot++; float x = buf[f * ch + mixc]; if (x != 0.f) { mixnz++; run0 = 0; } else if (++run0 == 4410) quietruns++; if (std::fabs(x) > 1e-3f) mixloud++; }
        }
        if (mode == DUMP) {
            uint32_t hdr[6] = {call, n, ch, rate, nfl, got};
            rec(1, hdr, sizeof hdr);
            rec(2, buf, nfl * 4);
            rec(3, ev, got * sizeof(pi_event));
            rec(4, view, PI_VIEW_SIZE);
            uint32_t gd[2] = {gen, drop};
            rec(6, gd, 8);
            // what was sounding: per-track peak (layouts with track channels), and the trigs
            std::string tr;
            if (buf && ch >= 16 && ch != 19 && ch != 49) {
                for (uint32_t t = 0; t < 16; t++) {
                    float pk = 0; for (uint32_t f = 0; f < n; f++) pk = std::max(pk, std::fabs(buf[f * ch + t]));
                    if (pk > 1e-6f) { char b[32]; snprintf(b, sizeof b, "%u:%.3g ", t, pk); tr += b; }
                }
            }
            std::string trig;
            for (uint32_t i = 0; i < got; i++) if (ev[i].type == PI_EV_TRIG) { char b[16]; snprintf(b, sizeof b, "%u@%u ", ev[i].track, ev[i].frame); trig += b; }
            fprintf(log, "call %u frames %u layout %u%s rate %u heard %u flags %u held %06x | %s| sounding %s| trigs %s\n",
                    call, n, ch, buf ? "" : "(null)", rate, view[PI_VIEW_HEARD], view[PI_VIEW_FLAGS], held, pending.c_str(), tr.c_str(), trig.c_str());
            pending.clear();
        }
        call++;
    }

    void act(const Timed &t) {
        switch (t.kind) {
        case A_RATE: {
            uint32_t nr = RATES[t.c.value % 3];
            pi_set_sample_rate(e, nr);
            logf("rate %u->%u ", rate, nr);
            bool changed = nr != rate;
            rate = nr;
            H.u32(0x5a7e0000 ^ nr);
            if (lend_ever && lend_after_rate && (changed || R.p(0.2))) lend();
            break;
        }
        case A_SAVE: {
            std::vector<uint8_t> s(PI_SNAPSHOT_SIZE + 8, 0xee);
            uint32_t cap = R.p(0.95) ? uint32_t(s.size()) : R.r(0, PI_SNAPSHOT_SIZE - 1);
            uint32_t n = pi_save(e, s.data(), cap);
            H.u32(n); H.add(s.data(), s.size());
            rec(7, s.data(), uint32_t(s.size()));
            logf("save=%u ", n);
            if (n == PI_SNAPSHOT_SIZE) { s.resize(n); snaps.push_back(s); }
            break;
        }
        case A_LOAD: {
            if (snaps.empty()) break;
            std::vector<uint8_t> s = snaps[R.u(uint32_t(snaps.size()))];
            uint32_t len = uint32_t(s.size()), k = R.u(20);
            if (k == 0) len = PI_SNAPSHOT_SIZE_V1;
            else if (k == 1) len = R.u(len);
            else if (k == 2) s[R.u(len)] ^= uint8_t(1u << R.u(8));
            int32_t r = pi_load(e, s.data(), len);
            H.u32(uint32_t(r));
            rec(8, &r, 4);
            logf("load(%u)=%d ", len, r);
            break;
        }
        case A_SAMPLE: {
            uint32_t track = t.c.a, frames = 0;
            const int16_t *p = nullptr;
            uint32_t k = R.u(10);
            if (k == 0) { p = nullptr; frames = 0; }
            else if (k == 1) { uint32_t f; p = make_sample(f); frames = 0; }
            else if (k == 2) { uint32_t f; const int16_t *q = make_sample(f); p = reinterpret_cast<const int16_t *>(reinterpret_cast<const char *>(q) + 1); frames = f > 1 ? f - 1 : 1; }  // misaligned: refused
            else p = make_sample(frames);
            if (R.p(0.02)) track = R.r(16, 300);
            uint32_t got = pi_set_sample(e, track, p, frames);
            H.u32(0x5a000000 | got);
            rec(9, &got, 4);
            logf("sample(t%u,%u)=%u ", track, frames, got);
            break;
        }
        case A_LEND: lend(); break;
        case A_PROBE: logf("PROBE silent=%d ", last_silent); probes++; if (last_silent == 1) probes_silent++; else if (last_silent < 0) probes_null++; break;
        }
    }

    // ---- run a segment: a timeline of commands and actions, cut into random blocks ----
    void run(std::vector<Timed> &tl, uint32_t len, uint32_t blockstyle, double noise) {
        std::stable_sort(tl.begin(), tl.end(), [](const Timed &a, const Timed &b) { return a.at < b.at; });
        size_t ti = 0;
        uint32_t pos = 0;
        std::vector<pi_cmd> cmds;
        while (pos < len) {
            // actions due here, between blocks
            while (ti < tl.size() && tl[ti].at <= pos && tl[ti].kind != 0) { act(tl[ti]); ti++; }
            uint32_t n;
            switch (blockstyle) {
            case 0: n = R.r(1, 16); break;
            case 1: n = R.p(0.5) ? 128 : R.r(64, 256); break;
            case 2: n = R.r(1, 512); break;
            default: n = R.p(0.5) ? 512 : R.r(256, 512); break;
            }
            if (R.p(0.003)) n = 0;
            n = std::min(n, len - pos);
            // stop the block at the next action
            for (size_t j = ti; j < tl.size(); j++) if (tl[j].kind != 0) { if (tl[j].at > pos && tl[j].at < pos + n) n = tl[j].at - pos; break; }
            cmds.clear();
            while (ti < tl.size() && tl[ti].kind == 0 && tl[ti].at < pos + std::max(n, 1u)) {
                pi_cmd c = tl[ti].c; c.frame = tl[ti].at - pos; cmds.push_back(c); logf("%u:%u/%u/%u/%u ", c.frame, c.type, c.a, c.b, c.value); ti++;
            }
            if (n && R.p(noise)) {
                uint32_t k = R.r(1, 4);
                for (uint32_t i = 0; i < k; i++) { pi_cmd c = rcmd(); c.frame = R.u(n); cmds.push_back(c); }
                std::stable_sort(cmds.begin(), cmds.end(), [](const pi_cmd &a, const pi_cmd &b) { return a.frame < b.frame; });
                for (uint32_t i = cmds.size() - k; i < cmds.size(); i++) logf("~%u:%u/%u/%u/%u ", cmds[i].frame, cmds[i].type, cmds[i].a, cmds[i].b, cmds[i].value);
            }
            if (noise > 0 && cmds.size() >= 2 && R.p(0.02)) { std::swap(cmds[R.u(cmds.size())], cmds[R.u(cmds.size())]); logf("SWAPPED "); }
            if (noise > 0 && n && R.p(0.01)) { pi_cmd c = rcmd(); c.frame = n + R.u(1000); cmds.push_back(c); logf("PAST:%u/%u ", c.frame, c.type); }
            process(n, cmds);
            pos += n;
            if (n == 0 && pos >= len) break;
            if (n == 0) continue;
        }
        while (ti < tl.size()) { if (tl[ti].kind) act(tl[ti]); ti++; }
    }

    uint32_t steplen() const { return 0; }

    void cmd_at(std::vector<Timed> &tl, uint32_t at, pi_cmd c) { tl.push_back({at, 0, c}); }
    void act_at(std::vector<Timed> &tl, uint32_t at, int kind, uint32_t a = 0, uint32_t v = 0) { tl.push_back({at, kind, C(0, uint8_t(a), 0, v)}); }

    void ensure_play(std::vector<Timed> &tl) {
        if (R.p(0.85)) { cmd_at(tl, 0, C(PI_CMD_SOURCE, 0, 0, 0)); cmd_at(tl, 0, C(PI_CMD_PLAY, 0, 0, 1)); }
        if (R.p(0.8)) release_all(tl, 0);
    }
    void taps(std::vector<Timed> &tl, uint32_t len, uint32_t n) {
        for (uint32_t i = 0; i < n; i++) cmd_at(tl, R.u(len), C(PI_CMD_FIRE, uint8_t(R.u(16))));
    }
    void key(std::vector<Timed> &tl, uint32_t at, uint32_t k, bool down) {
        cmd_at(tl, at, C(down ? PI_CMD_KEY_DOWN : PI_CMD_KEY_UP, uint8_t(k)));
        if (down) held |= 1u << k; else held &= ~(1u << k);
    }
    void release_all(std::vector<Timed> &tl, uint32_t at) {
        for (uint32_t k = 0; k < 23; k++) if (held >> k & 1) key(tl, at, k, false);
    }

    void go(uint64_t seed) {
        rate = RATES[R.u(3)];
        uint32_t sz = pi_size(), al = pi_align();
        mem.assign((sz + 63) / 8 + 8, 0);
        uintptr_t base = reinterpret_cast<uintptr_t>(mem.data());
        uintptr_t aligned = (base + (al > 8 ? al : 8) - 1) & ~uintptr_t((al > 8 ? al : 8) - 1);
        e = pi_init(reinterpret_cast<void *>(aligned), sz, rate, uint32_t(R.next()));
        if (!e) { fprintf(stderr, "pi_init failed\n"); exit(1); }
        audio.assign(size_t(MAXBLOCK) * MAXCH + 64, 0.f);
        lend_ever = R.p(0.85);
        lend_after_rate = R.p(0.85);
        density = R.p(0.3) ? 0.5 : R.p(0.5) ? 0.2 : 0.06;
        all16 = R.p(0.3);
        uint32_t lay = R.u(6);
        layout = lay == 0 ? PI_AUDIO_MIX : lay == 1 ? PI_AUDIO_BOTH : lay == 2 ? PI_AUDIO_LOOP : lay == 3 ? PI_AUDIO_LOOP_SLIDERS : lay == 4 ? PI_AUDIO_TRACKS : PI_AUDIO_MIX;
        logf("seed %llu rate %u density %.2f all16 %d lend %d/%d ", (unsigned long long)seed, rate, density, all16, lend_ever, lend_after_rate);
        if (lend_ever) lend();
        for (uint32_t t = 0; t < 16; t++) if (R.p(0.35)) { Timed x{0, A_SAMPLE, C(0, uint8_t(t))}; act(x); }

        // set-up: pattern, voices, routes, tempo, play
        {
            std::vector<Timed> tl;
            uint32_t ntracks = all16 ? 16 : R.r(2, 8);
            for (uint32_t t = 0; t < ntracks; t++) {
                uint32_t tr = all16 ? t : R.u(16);
                for (uint32_t s = 0; s < 16; s++) if (R.p(density)) cmd_at(tl, 0, C(PI_CMD_STEP, uint8_t(tr), uint8_t(s), 1));
                if (R.p(0.4)) cmd_at(tl, 0, C(PI_CMD_VOICE, uint8_t(tr), 0, 1));
            }
            for (uint32_t i = 0; i < 5; i++) {
                uint32_t m = R.p(0.5) ? 0 : uint32_t(R.next() & 0xffff);
                if (i == 1 || i == 4) m &= uint32_t(R.next()) & uint32_t(R.next());
                cmd_at(tl, 0, C(PI_CMD_ROUTE, uint8_t(i), 0, m));
            }
            cmd_at(tl, 0, C(PI_CMD_TEMPO, 0, 0, R.r(60000, 200000)));
            if (R.p(0.3)) cmd_at(tl, 0, C(PI_CMD_SWING, 0, 0, R.r(0, 48)));
            cmd_at(tl, 0, C(PI_CMD_RESET));
            cmd_at(tl, 0, C(PI_CMD_PLAY, 0, 0, 1));
            run(tl, R.r(1000, 5000), 1, 0.0);
        }

        uint32_t target = R.r(150000, 300000), done = 0;
        while (done < target) {
            uint32_t k = R.u(100), len;
            std::vector<Timed> tl;
            uint32_t bs = R.u(100) < 15 ? 0 : R.u(3) + 1;
            double noise = 0.15;
            if (k < 30) {                                   // play with random edits and taps
                len = R.r(3000, 15000);
                ensure_play(tl);
                taps(tl, len, R.r(0, 20));
                uint32_t n = R.r(0, 30);
                for (uint32_t i = 0; i < n; i++) cmd_at(tl, R.u(len), rcmd());
                if (R.p(0.1)) act_at(tl, R.u(len), A_RATE, 0, R.u(3));
                if (R.p(0.08)) act_at(tl, R.u(len), A_SAMPLE, R.u(16));
                logf("[seg play %u] ", len);
            } else if (k < 55) {                            // hold an effect, maybe switch, maybe rate change
                len = R.r(3000, 25000);
                ensure_play(tl);
                release_all(tl, 0);
                if (R.p(0.3)) for (uint32_t t = 0; t < 16; t++) if (R.p(0.4)) cmd_at(tl, 0, C(PI_CMD_FXSOUND, uint8_t(t), 0, R.p(0.8)));
                uint32_t eff = R.u(16);
                uint32_t start = R.u(std::min(len / 4, 3000u));
                key(tl, start, PI_KEY_FX, true);
                key(tl, start + R.u(3), eff, true);
                taps(tl, len, R.r(2, 30));
                uint32_t sw = R.p(0.5) ? R.r(1, 4) : 0, t = start + 10;
                for (uint32_t i = 0; i < sw; i++) {      // a quick change to another effect, and back
                    t += R.r(1, len / 3);
                    if (t >= len) break;
                    uint32_t e2 = R.u(16);
                    if (e2 == eff) continue;
                    key(tl, t, e2, true);
                    uint32_t up = t + (R.p(0.5) ? R.r(1, 200) : R.r(200, 10000));
                    key(tl, std::min(up, len - 1), e2, false);
                }
                if (R.p(0.12)) act_at(tl, R.r(start + 1, len - 1), A_RATE, 0, R.u(3));
                if (R.p(0.08)) act_at(tl, R.r(start + 1, len - 1), A_SAMPLE, R.u(16));
                if (R.p(0.1)) act_at(tl, R.r(start + 1, len - 1), A_LEND);
                uint32_t end = R.r(len * 2 / 3, len - 1);
                key(tl, end, eff, false);
                key(tl, end + R.u(5) < len ? end + R.u(5) : end, PI_KEY_FX, false);
                noise = 0.05;
                logf("[seg fx %u eff %u] ", len, eff + 1);
            } else if (k < 62) {                            // effect 1 on, off, on again within a ms, sounds ringing
                len = R.r(3000, 20000);
                ensure_play(tl);
                release_all(tl, 0);
                for (uint32_t t = 0; t < 16; t++) if (R.p(0.5)) cmd_at(tl, R.u(200), C(PI_CMD_FIRE, uint8_t(t)));
                uint32_t a = R.r(100, 2000), ms = rate / 1000;
                key(tl, a, PI_KEY_FX, true);
                key(tl, a + R.u(3), 0, true);
                uint32_t b = a + R.r(1, ms), c = b + R.r(0, ms);
                key(tl, b, 0, false);
                key(tl, c, 0, true);
                if (R.p(0.5)) { uint32_t d = c + R.r(1, ms); key(tl, d, 0, false); key(tl, d + R.r(0, ms), 0, true); }
                if (R.p(0.2)) act_at(tl, c + R.r(1, 1000), A_RATE, 0, R.u(3));
                if (R.p(0.2)) { uint32_t f = c + R.r(1, 500); key(tl, f, R.r(1, 15), true); }   // and on to another effect
                uint32_t end = R.r(c + 10, len - 2);
                release_all(tl, end);
                noise = 0.03;
                logf("[seg fx1flip %u] ", len);
            } else if (k < 70) {                            // a burst, a long quiet, a single tap
                uint32_t burst = R.r(1000, 6000), quiet = uint32_t(rate * (1.2 + R.f() * 2.3));
                len = burst + quiet + R.r(2000, 10000);
                for (uint32_t i = 0; i < 12; i++) cmd_at(tl, R.u(burst), C(PI_CMD_FIRE, uint8_t(R.u(16))));
                release_all(tl, burst);
                if (R.p(0.95)) cmd_at(tl, burst, C(PI_CMD_PLAY, 0, 0, 0));
                act_at(tl, burst + quiet, A_PROBE);
                cmd_at(tl, burst + quiet, C(PI_CMD_FIRE, uint8_t(R.u(16))));
                if (R.p(0.3)) cmd_at(tl, burst + quiet + R.r(1, 2000), C(PI_CMD_PLAY, 0, 0, 1));
                bs = R.p(0.5) ? 3 : bs;
                noise = 0.0;
                zero_in = R.p(0.9);
                if (R.p(0.8)) for (uint32_t i = 0; i < 5; i++) cmd_at(tl, burst, C(PI_CMD_ROUTE, uint8_t(i), 0, 0));
                logf("[seg quiet %u+%u] ", burst, quiet);
            } else if (k < 80) {                            // the external clock: edges or beats
                len = R.r(8000, 30000);
                uint32_t src = R.r(1, 2);
                cmd_at(tl, 0, C(PI_CMD_SOURCE, 0, 0, src));
                if (R.p(0.7)) cmd_at(tl, 0, C(PI_CMD_PLAY, 0, 0, 1));
                double bpm = 60 + R.f() * 160;
                uint32_t period = uint32_t(rate * 60.0 / bpm / (src == 1 ? 4 : 1));
                bool irregular = R.p(0.4);
                uint32_t t = R.u(period);
                while (t < len) {
                    cmd_at(tl, t, C(PI_CMD_CLOCK));
                    uint32_t step = period;
                    if (irregular) step = uint32_t(period * (0.3 + R.f() * 1.7)) + 1;
                    if (R.p(0.03)) step = period * R.r(2, 6);   // a gap
                    if (R.p(0.02)) step = R.r(1, 30);           // a double edge
                    t += step;
                }
                taps(tl, len, R.r(0, 10));
                if (R.p(0.3)) cmd_at(tl, R.u(len), C(PI_CMD_SOURCE, 0, 0, R.u(3)));
                if (R.p(0.3)) cmd_at(tl, R.u(len), C(PI_CMD_RESET));
                if (R.p(0.3)) { uint32_t s = R.u(len / 2); key(tl, s, PI_KEY_FX, true); uint32_t e2 = R.u(16); key(tl, s + 1, e2, true); key(tl, s + R.r(100, len / 2), e2, false); key(tl, len - 1, PI_KEY_FX, false); }
                if (R.p(0.15)) act_at(tl, R.u(len), A_RATE, 0, R.u(3));
                if (R.p(0.7)) cmd_at(tl, len - 1, C(PI_CMD_SOURCE, 0, 0, 0));
                noise = 0.05;
                logf("[seg clock src %u period %u irr %d] ", src, period, irregular);
            } else if (k < 86) {                            // snapshots
                len = R.r(3000, 20000);
                ensure_play(tl);
                act_at(tl, R.u(len), A_SAVE);
                if (R.p(0.7)) act_at(tl, R.u(len), A_LOAD);
                taps(tl, len, R.r(1, 10));
                logf("[seg snap %u] ", len);
            } else if (k < 93) {                            // samples replaced or removed while sounding
                len = R.r(3000, 20000);
                ensure_play(tl);
                uint32_t t = R.u(16);
                cmd_at(tl, 0, C(PI_CMD_VOICE, uint8_t(t), 0, 1));
                cmd_at(tl, R.u(50), C(PI_CMD_FIRE, uint8_t(t)));
                act_at(tl, R.r(1, 3000), A_SAMPLE, t);
                cmd_at(tl, R.r(3000, len - 1), C(PI_CMD_FIRE, uint8_t(t)));
                if (R.p(0.5)) act_at(tl, R.r(3001, len - 1), A_SAMPLE, t);
                taps(tl, len, R.r(0, 8));
                logf("[seg sample t%u] ", t);
            } else {                                        // rate changes while ringing and while an effect is held
                len = R.r(4000, 15000);
                ensure_play(tl);
                for (uint32_t t = 0; t < 16; t++) if (R.p(0.4)) cmd_at(tl, R.u(100), C(PI_CMD_FIRE, uint8_t(t)));
                if (R.p(0.6)) { release_all(tl, 0); key(tl, 50, PI_KEY_FX, true); key(tl, 51, R.u(16), true); }
                uint32_t n = R.r(1, 3);
                for (uint32_t i = 0; i < n; i++) act_at(tl, R.r(60, len - 1), A_RATE, 0, R.u(3));
                release_all(tl, len - 1);
                logf("[seg rate] ");
            }
            run(tl, len, bs, noise);
            zero_in = false;
            done += len;
        }
        if (mode == STATS) {
            fprintf(stdout, "  stats: frames %llu, mix non-zero %.3f, |mix|>1e-3 %.3f (of %llu mix frames), exact-silence stretches >=4410 frames: %llu; heard:",
                    (unsigned long long)frames_total, mixtot ? double(mixnz) / mixtot : 0.0, mixtot ? double(mixloud) / mixtot : 0.0, (unsigned long long)mixtot, (unsigned long long)quietruns);
            for (int i = 0; i <= 16; i++) fprintf(stdout, " %d:%llu", i, (unsigned long long)heard_frames[i]);
            fprintf(stdout, "; quiet probes %llu: all +0 %llu, no buffer %llu\n", (unsigned long long)probes, (unsigned long long)probes_silent, (unsigned long long)probes_null);
        }
    }
};

int main(int argc, char **argv) {
#ifndef NO_ABI_CHECK  // only for the sensitivity check against an older build
    if (pi_abi_version() != PI_ABI_VERSION) { fprintf(stderr, "ABI mismatch\n"); return 1; }
#endif
    Mode mode = HASH;
    int ai = 1;
    if (argc > 1 && !strcmp(argv[1], "--stats")) { mode = STATS; ai = 2; }
    if (argc > 1 && !strcmp(argv[1], "--dump")) {
        if (argc != 4) { fprintf(stderr, "usage: --dump <seed> <prefix>\n"); return 1; }
        uint64_t seed = strtoull(argv[2], nullptr, 10);
        Session s(seed, DUMP);
        std::string p = argv[3];
        s.bin = fopen((p + ".bin").c_str(), "wb");
        s.log = fopen((p + ".log").c_str(), "w");
        s.go(seed);
        fclose(s.bin); fclose(s.log);
        printf("%llu %016llx\n", (unsigned long long)seed, (unsigned long long)s.H.h);
        return 0;
    }
    if (argc - ai != 2) { fprintf(stderr, "usage: fuzz [--stats] <first seed> <count>\n"); return 1; }
    uint64_t first = strtoull(argv[ai], nullptr, 10), count = strtoull(argv[ai + 1], nullptr, 10);
    for (uint64_t seed = first; seed < first + count; seed++) {
        Session s(seed, mode);
        s.go(seed);
        printf("%llu %016llx\n", (unsigned long long)seed, (unsigned long long)s.H.h);
        fflush(stdout);
    }
    return 0;
}
