// P6, the ThreadSanitizer half: the core on an audio thread while a second thread edits the
// pattern, presses keys and moves sliders (ABI 4), loads snapshots, and takes snapshots and
// views, through rack/src/handoff.hpp, which is the same file the Rack module uses.
//
//   race <fixtures dir> <out file> [mode] [idle]    exits 0 only if nothing went wrong
//
// `idle` is microseconds the audio thread sleeps between blocks. 0 runs it flat out, which
// crowds the most blocks against each edit. A real callback is idle most of the time, so a
// burst from the other thread lands whole inside one block: 50 runs it that way.
//
// Three checks, each independent of the other two:
//   1. ThreadSanitizer reports nothing (it exits 66 itself when it does).
//   2. Every snapshot the second thread takes is whole: a private engine loads it (the CRC).
//   3. Nothing is lost or reordered: the second thread keeps a model engine, gives it every
//      edit and load in the order it sent them, and after each round the published snapshot
//      must be the model's, byte for byte.
// Since ABI 4 the messages include keys and sliders (ENGINE.md §13), which reach the pattern
// through the workflow: the model is pressed the same keys in the same order. And the audio
// thread hands a view out after every block, the way a module's drawing thread will get it;
// the second thread reads each one and holds it to what a view can be (check 2's kind).
// At the end each fixture's pattern is entered as edits while the core plays, and the
// snapshot taken is written to <out file>. The Makefile then looks for those bytes in the
// Node report: the wasm host loaded the same snapshot and gave that fixture's trace.
//
// What the sanitizer cannot see: the core is Rust, and stable Rust cannot be built with
// ThreadSanitizer. So every call into the core goes through Core below, which touches one
// plain byte first: a write for a call that changes the engine, a read for one that does
// not. Two threads in the core at once then race on that byte, where the sanitizer looks.
//
// The modes other than `safe` are faults put in on purpose, to show each check can fail:
//   two-buffers   ENGINE.md §8 as first written: two buffers and an atomic index
//   direct-save   the second thread calls pi_save on the live engine
//   split-load    a load travels on its own channel, beside the edits rather than among them
//   drop-edit     the audio thread loses one edit in a thousand
//   torn          one published snapshot in five hundred has a bit flipped
//   torn-view     one view in five hundred is handed over with its volume byte cleared
//
// SPDX-License-Identifier: MIT
#include "fixture.hpp"

#include "../rack/src/handoff.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <thread>

enum Mode { SAFE, TWO_BUFFERS, DIRECT_SAVE, SPLIT_LOAD, DROP_EDIT, TORN, TORN_VIEW };

struct Snap {
    uint8_t b[PI_SNAPSHOT_SIZE];
};
// What the audio thread hands over: the snapshot, and how far through the second thread's
// messages it had got when it took it. Without the counts the second thread cannot know
// whether a snapshot holds its last edit.
struct Published {
    Snap snap;
    uint32_t edits, loads;
};
// ENGINE.md §14: what the drawing thread is handed.
struct Seen {
    uint8_t b[PI_VIEW_SIZE];
};
// What the second thread sends: an edit, or "load the next snapshot in `loads`", in one
// queue so that the order is the order they were sent in.
struct Msg {
    bool load;
    pi_cmd cmd;
};

// The engine. See the note above on why every call touches `mark`.
struct Core {
    std::vector<uint64_t> mem;
    pi_engine *e;
    char mark = 0;
    Core(uint32_t rate, uint32_t seed) : mem((pi_size() + 7) / 8) {
        e = pi_init(mem.data(), uint32_t(mem.size() * 8), rate, seed);
        if (!e) die("pi_init refused good memory");
    }
    void changes() { mark = char(mark + 1); }
    void reads() const {
        volatile char seen = mark;
        (void)seen;
    }
    uint32_t process(uint32_t frames, const pi_cmd *cmds, uint32_t n, pi_event *ev, uint32_t cap) {
        changes();
        return pi_process(e, frames, cmds, n, ev, cap, nullptr, PI_AUDIO_NONE);
    }
    int32_t load(const Snap &s) {
        changes();
        return pi_load(e, s.b, PI_SNAPSHOT_SIZE);
    }
    void save(Snap &s) const {
        reads();
        if (pi_save(e, s.b, PI_SNAPSHOT_SIZE) != PI_SNAPSHOT_SIZE) die("pi_save");
    }
    uint32_t generation() const {
        reads();
        return pi_generation(e);
    }
    void view(Seen &v) const {
        reads();
        if (pi_view(e, v.b, PI_VIEW_SIZE) != PI_VIEW_SIZE) die("pi_view");
    }
    uint32_t dropped() const {
        reads();
        return pi_dropped(e);
    }
};

struct Shared {
    Mode mode;
    Core core{48000, 1};
    pi::Queue<Msg, 1024> msgs;
    pi::Queue<Snap, 8> loads;     // the bytes a `load` message refers to, in the same order
    pi::Latest<Published> saved;  // the audio thread's snapshots, for the other thread
    pi::Latest<Seen> seen;        // and its views
    pi::Latest<Snap> inbox;       // split-load only
    Published two[2];             // two-buffers only
    std::atomic<int> twoIndex{0};
    std::atomic<uint32_t> edits{0}, loadsDone{0}; // direct-save only: the counts, without a snapshot
    std::atomic<bool> stop{false};
    int idle = 0;
    uint64_t blocks = 0, publishes = 0; // the audio thread's; read after join
    explicit Shared(Mode m) : mode(m) {}
};

static void audio(Shared &s) {
    Core &core = s.core;
    pi_event ev[256];
    pi_cmd play = pi_cmd{0, PI_CMD_PLAY, 0, 0, 0, 1};
    core.process(1, &play, 1, ev, 256);
    uint32_t edits = 0, loads = 0, generation = core.generation();
    bool dirty = true, held = false;
    Msg hold{};
    Snap snap;

    while (!s.stop.load(std::memory_order_acquire)) {
        // A block. A real host has room for only so many commands in one; two here, so that
        // a burst of edits spreads over several blocks and several publishes.
        if (s.idle) std::this_thread::sleep_for(std::chrono::microseconds(s.idle)); // idle, then the callback
        pi_cmd cmds[2];
        uint32_t n = 0;
        for (;;) {
            Msg m;
            if (held) {
                m = hold;
                held = false;
            } else if (n == 2 || !s.msgs.pop(m)) break;
            if (m.load) {
                // A load happens between blocks. If this block already has edits before it,
                // it waits for the next one: pi_process cannot be asked to apply them first.
                if (n > 0) {
                    hold = m;
                    held = true;
                    break;
                }
                if (!s.loads.pop(snap)) die("a load message with no bytes behind it");
                if (core.load(snap) != PI_OK) die("the audio thread was sent a bad snapshot");
                loads++;
                dirty = true;
            } else {
                edits++;
                dirty = true;
                if (s.mode == DROP_EDIT && edits % 1000 == 0) continue;
                cmds[n++] = m.cmd;
            }
        }
        core.process(64, cmds, n, ev, 256);
        s.blocks++;
        // The view, after every block: pi_view on this thread, the copy handed over.
        core.view(s.seen.write());
        if (s.mode == TORN_VIEW && s.blocks % 500 == 0) s.seen.write().b[PI_VIEW_VOLUME] = 0;
        s.seen.publish();
        if (s.mode == SPLIT_LOAD)
            if (const Snap *in = s.inbox.take()) {
                if (core.load(*in) != PI_OK) die("the audio thread was sent a bad snapshot");
                loads++;
                dirty = true;
            }

        // ENGINE.md §8: publish when what a snapshot would hold has changed. Here also when
        // a message was taken that changed nothing, so the counts reach the other thread.
        uint32_t g = core.generation();
        if (g != generation || dirty) {
            generation = g;
            dirty = false;
            s.publishes++;
            if (s.mode == TWO_BUFFERS) {
                int next = 1 - s.twoIndex.load(std::memory_order_relaxed);
                core.save(s.two[next].snap);
                s.two[next].edits = edits;
                s.two[next].loads = loads;
                s.twoIndex.store(next, std::memory_order_release);
            } else if (s.mode == DIRECT_SAVE) {
                s.edits.store(edits, std::memory_order_release);
                s.loadsDone.store(loads, std::memory_order_release);
            } else {
                Published &p = s.saved.write();
                core.save(p.snap);
                if (s.mode == TORN && s.publishes % 500 == 0) p.snap.b[40] ^= 1;
                p.edits = edits;
                p.loads = loads;
                s.saved.publish();
            }
        }
    }
    if (core.dropped() != 0) die("events were dropped");
}

// The second thread: what a UI and a saver do between them.
struct Other {
    Shared &s;
    Core model{48000, 1}, checker{48000, 1};
    uint32_t pushedEdits = 0, pushedLoads = 0, x = 2463534242u;
    uint64_t reads = 0, torn = 0, wrong = 0, rounds = 0, views = 0;
    explicit Other(Shared &shared) : s(shared) {}

    uint32_t rnd() {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        return x;
    }

    bool read(Published &out) {
        if (s.mode == TWO_BUFFERS) out = s.two[s.twoIndex.load(std::memory_order_acquire)];
        else if (s.mode == DIRECT_SAVE) {
            out.edits = s.edits.load(std::memory_order_acquire);
            out.loads = s.loadsDone.load(std::memory_order_acquire);
            s.core.save(out.snap);
        } else {
            const Published *p = s.saved.latest();
            if (!p) return false;
            out = *p;
        }
        reads++;
        if (checker.load(out.snap) != PI_OK) torn++;
        look();
        return true;
    }

    // A view has no checksum, so hold it to what any view is: a volume and a chosen sound in
    // range, no key past 22, its zero bytes zero, and the grid's rows as ENGINE.md §14 gives
    // them (a bar is one key; with bpm held the field is the volume's row). Since ABI 6 the
    // zero bytes are 48 to 54 (the weave's, §16); 55 is the effect heard, 0 to 16 (§17).
    // (Until Session 16 all of 48 to 63 were zero; until Session 21, 60 to 63, which are now
    // §20's second mark, any two u16s.)
    void look() {
        const Seen *v = s.seen.take();
        if (!v) return;
        views++;
        const uint8_t *b = v->b;
        uint32_t held = uint32_t(b[PI_VIEW_HELD]) | uint32_t(b[PI_VIEW_HELD + 1]) << 8 | uint32_t(b[PI_VIEW_HELD + 2]) << 16 | uint32_t(b[PI_VIEW_HELD + 3]) << 24;
        unsigned field = b[PI_VIEW_FIELD] | b[PI_VIEW_FIELD + 1] << 8, bar = b[PI_VIEW_BAR] | b[PI_VIEW_BAR + 1] << 8;
        unsigned volume = b[PI_VIEW_VOLUME];
        bool ok = volume >= 1 && volume <= PI_VOLUME_MAX && b[PI_VIEW_SEL] < PI_TRACKS && held >> 23 == 0 && b[30] == 0 && b[31] == 0
               && (bar & (bar - 1)) == 0 && b[PI_VIEW_LENGTH] >= 1 && b[PI_VIEW_LENGTH] <= PI_STEPS && b[PI_VIEW_SWING] <= PI_SWING_MAX;
        for (unsigned i = 48; i < PI_VIEW_HEARD; i++) ok = ok && b[i] == 0;
        ok = ok && b[PI_VIEW_HEARD] <= PI_FX_MAX;
        if (held >> PI_KEY_BPM & 1) ok = ok && field == (1u << volume) - 1 && bar == 0;
        if (!ok) torn++;
    }

    void edit(const pi_cmd &c) {
        Published scratch;
        while (!s.msgs.push(Msg{false, c})) read(scratch); // full: the audio thread will catch up
        pushedEdits++;
        pi_event ev[64];
        model.process(1, &c, 1, ev, 64);
        read(scratch); // a saver may look at any moment
    }

    void load(const Snap &snap) {
        if (s.mode == SPLIT_LOAD) {
            s.inbox.write() = snap;
            s.inbox.publish();
        } else {
            while (!s.loads.push(snap)) std::this_thread::yield();
            while (!s.msgs.push(Msg{true, pi_cmd{}})) std::this_thread::yield();
        }
        pushedLoads++;
        if (model.load(snap) != PI_OK) die("the model refused a snapshot");
    }

    // Wait until the audio thread has taken everything sent, then compare with the model.
    Published settle() {
        Published got{};
        auto give_up = std::chrono::steady_clock::now() + std::chrono::seconds(20);
        while (!read(got) || got.edits != pushedEdits || got.loads != pushedLoads)
            if (std::chrono::steady_clock::now() > give_up) die("the audio thread never caught up");
        Snap want;
        model.save(want);
        if (std::memcmp(want.b, got.snap.b, PI_SNAPSHOT_SIZE) != 0) wrong++;
        rounds++;
        return got;
    }

    void churn(int n) {
        Snap kept;
        model.save(kept);
        for (int r = 0; r < n; r++) {
            if (r % 5 == 4) {
                // Load, then edit at once: the edit must land on what was loaded.
                load(kept);
                edit(pi_cmd{0, PI_CMD_STEP, uint8_t(rnd() % 16), uint8_t(rnd() % 16), 0, 1});
            }
            for (uint32_t i = 0, count = 1 + rnd() % 8; i < count; i++) {
                uint8_t a = uint8_t(rnd() % 16), b = uint8_t(rnd() % 16);
                // Half edits, half what a finger does: any key down or up, a tap, a slider.
                // Any key but fx (ABI 6): held while playing, it lets the steps that arrive
                // write the lane (§17), and when they arrive is the audio thread's pace, which
                // the model, a frame an edit, does not keep. The lane is edited by FX instead.
                uint8_t key = uint8_t(rnd() % 22);
                if (key == PI_KEY_FX) key = PI_KEY_WRITE;
                switch (rnd() % 8) {
                case 4: edit(pi_cmd{0, PI_CMD_KEY_DOWN, key, 0, 0, 0}); break;
                case 5: edit(pi_cmd{0, PI_CMD_KEY_UP, key, 0, 0, 0}); break;
                case 6:
                    edit(pi_cmd{0, PI_CMD_KEY_DOWN, key, 0, 0, 0});
                    edit(pi_cmd{0, PI_CMD_KEY_UP, key, 0, 0, 0});
                    break;
                case 7: edit(pi_cmd{0, PI_CMD_PARAM, uint8_t(rnd() % 2), 0, 0, rnd() % 65536}); break;
                case 0: edit(pi_cmd{0, PI_CMD_STEP, a, b, 0, rnd() % 2}); break;
                case 1:
                    // A probability, or (ABI 8) what a step keeps.
                    if (rnd() % 4) edit(pi_cmd{0, PI_CMD_PROB, a, b, 0, rnd() % 101});
                    else edit(pi_cmd{0, PI_CMD_KEEP, a, b, 0, rnd()});
                    break;
                case 2:
                    // Swing, or (ABI 6) one of the effects' two edits.
                    if (rnd() % 2) edit(pi_cmd{0, PI_CMD_SWING, 0, 0, 0, rnd() % 49});
                    else if (rnd() % 2) edit(pi_cmd{0, PI_CMD_FX, a, 0, 0, rnd() % 17});
                    else edit(pi_cmd{0, PI_CMD_FXSOUND, a, 0, 0, rnd() % 2});
                    break;
                default: edit(pi_cmd{0, PI_CMD_LENGTH, 0, 0, 0, 1 + rnd() % 16}); break;
                }
            }
            Published got = settle();
            if (r % 11 == 0) kept = got.snap;
        }
    }

    // Enter a fixture's opening pattern over whatever is there, as a player would have to:
    // every step and probability, then swing, length and tempo. Since snapshot version 2
    // (§15) also what the churn left in the sliders, the switches, the volume and the chosen
    // sound: every key let go, volume 16 and key 1 by their keys, then each track's sliders
    // at their middles and back on code. (Until Session 11 the pattern alone was enough.)
    // Since version 3 (§17) also the whole lane and every sound's fx switch. Since version 4
    // (§20) what every step keeps: each step goes off first, which forgets, then on as the
    // fixture has it, then the fixture's own keeps.
    Snap enter(const Json &fx) {
        for (uint8_t k = 0; k <= PI_KEY_WRITE; k++) edit(pi_cmd{0, PI_CMD_KEY_UP, k, 0, 0, 0});
        for (uint8_t k : {PI_KEY_BPM, 15u}) edit(pi_cmd{0, PI_CMD_KEY_DOWN, k, 0, 0, 0});
        for (uint8_t k : {15u, PI_KEY_BPM}) edit(pi_cmd{0, PI_CMD_KEY_UP, k, 0, 0, 0});
        for (uint8_t k : {PI_KEY_SOUND, 0u}) edit(pi_cmd{0, PI_CMD_KEY_DOWN, k, 0, 0, 0});
        for (uint8_t k : {0u, PI_KEY_SOUND}) edit(pi_cmd{0, PI_CMD_KEY_UP, k, 0, 0, 0});
        for (uint8_t t = 0; t < 16; t++) {
            edit(pi_cmd{0, PI_CMD_SOUND, t, 0, 0, 32768});
            edit(pi_cmd{0, PI_CMD_SOUND, t, 1, 0, 32768});
            edit(pi_cmd{0, PI_CMD_VOICE, t, 0, 0, 0});
        }
        uint16_t on[16] = {};
        uint8_t prob[16][16];
        std::memset(prob, 100, sizeof prob);
        uint32_t swing = 0, length = 16;
        uint8_t lane[16] = {};
        uint16_t through = 0xFFFF;
        std::vector<pi_cmd> keeps;
        for (const Json &c : fx.at("commands").arr) {
            const std::string &name = c.at("cmd").str;
            if (c.n("at") != 0 || !is_edit(name)) continue;
            pi_cmd k = to_cmd(c);
            if (name == "step") on[k.a] = uint16_t(k.value ? on[k.a] | 1u << k.b : on[k.a] & ~(1u << k.b));
            else if (name == "prob") prob[k.a][k.b] = uint8_t(k.value);
            else if (name == "swing") swing = k.value;
            else if (name == "fx") lane[k.a] = uint8_t(k.value);
            else if (name == "fxsound") through = uint16_t(k.value ? through | 1u << k.a : through & ~(1u << k.a));
            else if (name == "length") length = k.value;
            else if (name == "keep") keeps.push_back(k);
            else die("race.cpp does not know how to enter the edit " + name);
        }
        for (uint8_t t = 0; t < 16; t++)
            for (uint8_t st = 0; st < 16; st++) {
                edit(pi_cmd{0, PI_CMD_STEP, t, st, 0, 0});
                if (on[t] >> st & 1) edit(pi_cmd{0, PI_CMD_STEP, t, st, 0, 1});
                edit(pi_cmd{0, PI_CMD_PROB, t, st, 0, prob[t][st]});
            }
        for (uint8_t i = 0; i < 16; i++) {
            edit(pi_cmd{0, PI_CMD_FX, i, 0, 0, lane[i]});
            edit(pi_cmd{0, PI_CMD_FXSOUND, i, 0, 0, uint32_t(through >> i & 1)});
        }
        for (const pi_cmd &k : keeps) edit(k);
        edit(pi_cmd{0, PI_CMD_SWING, 0, 0, 0, swing});
        edit(pi_cmd{0, PI_CMD_LENGTH, 0, 0, 0, length});
        edit(pi_cmd{0, PI_CMD_TEMPO, 0, 0, 0, uint32_t(fx.n("mbpm"))});
        return settle().snap;
    }
};

int main(int argc, char **argv) {
    if (argc < 3) die("usage: race <fixtures dir> <out file> [safe|two-buffers|direct-save|split-load|drop-edit|torn|torn-view] [idle us]");
    std::string m = argc > 3 ? argv[3] : "safe";
    Mode mode = m == "safe" ? SAFE : m == "two-buffers" ? TWO_BUFFERS : m == "direct-save" ? DIRECT_SAVE
              : m == "split-load" ? SPLIT_LOAD : m == "drop-edit" ? DROP_EDIT : m == "torn" ? TORN : m == "torn-view" ? TORN_VIEW : (die("unknown mode " + m), SAFE);

    std::vector<std::filesystem::path> files;
    for (auto &entry : std::filesystem::directory_iterator(argv[1]))
        if (entry.path().extension() == ".json") files.push_back(entry.path());
    std::sort(files.begin(), files.end());
    if (files.size() < 9) die("expected the nine fixtures");

    Shared shared(mode);
    shared.idle = argc > 4 ? std::atoi(argv[4]) : 0;
    Other other(shared);
    std::thread audio_thread(audio, std::ref(shared));

    other.churn(3000);
    std::string out;
    for (auto &path : files) {
        Json fx = read_fixture(path.string());
        if (fx.n("seed") != 1) die("race.cpp starts its engine from seed 1, as every fixture so far does");
        Snap snap = other.enter(fx);
        out += path.stem().string() + " ";
        for (uint8_t byte : snap.b) {
            char two[3];
            std::snprintf(two, sizeof two, "%02x", byte);
            out += two;
        }
        out += "\n";
        other.churn(200); // and disturb it again before the next
    }

    shared.stop.store(true, std::memory_order_release);
    audio_thread.join();
    std::ofstream(argv[2], std::ios::binary) << out;
    std::printf("race (%s, idle %d): %llu rounds, %u edits and %u loads sent, %llu blocks, %llu publishes, %llu snapshots and %llu views taken; "
                "%llu torn, %llu rounds where the snapshot was not the model's\n",
                m.c_str(), shared.idle, (unsigned long long)other.rounds, other.pushedEdits, other.pushedLoads,
                (unsigned long long)shared.blocks, (unsigned long long)shared.publishes,
                (unsigned long long)other.reads, (unsigned long long)other.views, (unsigned long long)other.torn, (unsigned long long)other.wrong);
    return other.torn == 0 && other.wrong == 0 ? 0 : 1;
}
