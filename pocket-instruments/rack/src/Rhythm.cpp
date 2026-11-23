// The tiny rhythm machine in Rack (Session 13): the Probe's plumbing and a face in the Loom look,
// 24 HP, on design/panel.svg at design/DESIGN.md's positions.
//
// The module keeps no copy of the workflow. Every key and both sliders are Rack parameters;
// process() turns a parameter's change into KEY_DOWN, KEY_UP or PARAM on that frame (ENGINE.md
// §13), and everything on the face is drawn from the core's view (§14), handed to the drawing
// thread through pi::Latest. The page (web/rhythm.html) does the same with messages.
//
//   CLOCK     patched: the core follows its edges, one edge a step. Unpatched: the table clock.
//   RESET     starts from step 1. CLOCK is ignored for 1 ms after it (RACK-RULES.md).
//   RETURN    sixteen channels; channel n takes sound n's place in AUDIO's mix (D62; jacks.hpp).
//   TRIGGERS  sixteen channels, 10 V for 1 ms a firing. VOICES: sixteen channels, 5 V to 1.0.
//   AUDIO     the mix, 5 V to 1.0, bent by tanh towards 10 V.
//
// A mouse holds a key while the button is down; Ctrl+click (Cmd on a Mac) latches sound,
// pattern, bpm, function or fx until the next press of any key ends, or a second Ctrl+click
// (D60, D61). Right-click keeps Rack's own parameter menu (R47). The computer keys of D57 item 5
// play while the pointer is over the module. A double-click on a slider puts it back where it
// started, from the view (D63).
//
// The self-test (PLAN.md, Session 13): a patch whose module data names a format 2 fixture makes
// the module press its own parameters and send the fixture's edits, and hold its events and
// views to the fixture, pass after pass, as the Probe does with format 1. rack/selftest.sh.
//
// Nothing on the audio thread allocates, locks or logs.
// SPDX-License-Identifier: MIT
#include <rack.hpp>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "handoff.hpp"
#include "jacks.hpp"
#include "pi_engine.h"

using namespace rack;
extern Plugin *pluginInstance;

namespace {

// ---- The self-test's fixtures, made from ../fixtures/*.json by rhythm.jq. Never retyped. ----

struct FixCmd {
    uint32_t at;
    uint8_t type, a, b;
    uint32_t value;
};
struct FixView {
    uint32_t at;
    const char *text; // ENGINE.md §14's text, written for the table run (edges=0)
};
struct RhythmFixture {
    const char *name;
    uint32_t seed, mbpm, steps;
    std::vector<FixCmd> cmds;
    std::vector<pi_event> expect;
    std::vector<FixView> views;
};
const std::vector<RhythmFixture> FIXTURES = {
#include "rhythm-fixtures.inc"
};

const char *const SOUND_NAMES[PI_TRACKS] = {"Bass drum", "Snare", "Closed hat", "Open hat", "Synth snare", "Sticks",
    "Cymbal", "Noise", "Clap", "Click", "Low tom", "High tom", "Cow bell", "Blip", "Tone", "Bass tone"};
const char *const FN_NAMES[7] = {"sound", "pattern", "bpm", "function", "fx", "play", "write"};
const uint32_t LATCHING = 1u << PI_KEY_SOUND | 1u << PI_KEY_PATTERN | 1u << PI_KEY_BPM | 1u << PI_KEY_FUNCTION | 1u << PI_KEY_FX;
const uint32_t SEED = 1; // keys cannot set a probability, so no draw depends on it (as the page)

// D57 item 5, by the key's place on a US keyboard (GLFW's key codes are positions).
const int KEYS[23] = {GLFW_KEY_1, GLFW_KEY_2, GLFW_KEY_3, GLFW_KEY_4, GLFW_KEY_Q, GLFW_KEY_W, GLFW_KEY_E, GLFW_KEY_R,
    GLFW_KEY_A, GLFW_KEY_S, GLFW_KEY_D, GLFW_KEY_F, GLFW_KEY_Z, GLFW_KEY_X, GLFW_KEY_C, GLFW_KEY_V,
    GLFW_KEY_7, GLFW_KEY_8, GLFW_KEY_9, GLFW_KEY_U, GLFW_KEY_I, GLFW_KEY_O, GLFW_KEY_P};

uint32_t u16(const uint8_t *v, unsigned i) { return uint32_t(v[i] | v[i + 1] << 8); }
uint32_t u32(const uint8_t *v, unsigned i) {
    return uint32_t(v[i]) | uint32_t(v[i + 1]) << 8 | uint32_t(v[i + 2]) << 16 | uint32_t(v[i + 3]) << 24;
}

// ENGINE.md §14's text line for a view, the edges flag written as 0 (the fixtures' table text);
// the caller checks the flag itself. The same line as harness/fixture.hpp's view_text.
void viewText(const uint8_t *b, char *out, size_t cap) {
    unsigned flags = b[PI_VIEW_FLAGS];
    char step[4] = "-";
    if (flags & PI_VIEW_FLAG_STEP) std::snprintf(step, sizeof step, "%u", unsigned(b[PI_VIEW_STEP]));
    int n = std::snprintf(out, cap,
                          "view play=%d write=%d edges=0 sounds=%d step=%s sel=%u vol=%u tempo=%u len=%u swing=%u held=%06x "
                          "field=%04x stitch=%04x bar=%04x sampled=%04x a=%u b=%u fires=",
                          flags & PI_VIEW_FLAG_PLAYING ? 1 : 0, flags & PI_VIEW_FLAG_WRITE ? 1 : 0, flags & PI_VIEW_FLAG_SOUNDS ? 1 : 0, step,
                          unsigned(b[PI_VIEW_SEL]), unsigned(b[PI_VIEW_VOLUME]), unsigned(u32(b, PI_VIEW_TEMPO)), unsigned(b[PI_VIEW_LENGTH]),
                          unsigned(b[PI_VIEW_SWING]), unsigned(u32(b, PI_VIEW_HELD)), unsigned(u16(b, PI_VIEW_FIELD)), unsigned(u16(b, PI_VIEW_STITCH)),
                          unsigned(u16(b, PI_VIEW_BAR)), unsigned(u16(b, PI_VIEW_SAMPLED)), unsigned(u16(b, PI_VIEW_A)), unsigned(u16(b, PI_VIEW_B)));
    for (unsigned t = 0; t < PI_TRACKS && n > 0 && size_t(n) < cap; t++)
        n += std::snprintf(out + n, cap - size_t(n), t ? ",%u" : "%u", unsigned(b[PI_VIEW_FIRES + t]));
}

// A snapshot, how many of its bytes are real, and how many loads the audio thread had taken
// when it was saved (so a save can tell whether it holds the last load asked for).
struct Snap {
    uint8_t b[PI_SNAPSHOT_SIZE];
    uint32_t len = 0, loads = 0;
};
struct View {
    uint8_t b[PI_VIEW_SIZE];
};

} // namespace

struct Rhythm : Module {
    enum ParamId { KEY_PARAMS = 0, SLIDER_A = 23, SLIDER_B = 24, PARAMS_LEN };
    enum InputId { CLOCK_INPUT, RESET_INPUT, RETURN_INPUT, INPUTS_LEN };
    enum OutputId { TRIGGERS_OUTPUT, VOICES_OUTPUT, AUDIO_OUTPUT, OUTPUTS_LEN };
    enum LightId { LIGHTS_LEN };
    enum Holder : uint8_t { MOUSE = 1, KEYBOARD = 2, LATCH = 4 };

    // ---- Shared between threads: atomics, and the handoff.hpp schemes. ----
    std::atomic<int> fixtureWanted{-1};  // -1: the instrument; otherwise the self-test's fixture
    std::atomic<int32_t> returnChosen{-1}; // D62 item 3: -1 "As the cable carries", else a mask
    std::atomic<bool> sliderHeld[2];     // a pointer is on the slider: its cap does not follow
    std::atomic<bool> freshWanted{false}; // Rack's Initialize: an empty beat
    std::atomic<uint32_t> passed{0}, failed{0}, aborted{0}, viewsHeld{0}, viewsNot{0}, dropped{0}, published{0},
        loadsOk{0}, loadsRefused{0}, lastRate{0}, peakMillivolts{0}, notFinite{0}, pulses{0}, returnFrames{0},
        loadsTaken{0};
    std::atomic<int> testedFixture{-1}, testedEdges{0};
    char firstMismatch[900] = {}; // written once by the audio thread, read when the module goes
    std::atomic<bool> haveMismatch{false};
    pi::Latest<Snap> saved;      // audio thread writes; Rack's saving thread reads
    pi::Latest<Snap> inbox;      // Rack's loading thread writes; audio thread reads
    pi::Latest<View> viewOut;    // audio thread writes; the drawing thread reads
    pi::Queue<pi_cmd, 64> menu;  // the menu's edits (VOICE, FIRE), in order, to the audio thread

    // ---- Rack's other threads only. ----
    uint8_t holders[23] = {};    // who holds each key down (Holder bits)
    uint32_t latched = 0;        // keys held by a Ctrl+click (D61)
    std::vector<uint8_t> pendingLoad; // the last snapshot a patch gave, until a save holds it
    uint32_t loadsAsked = 0;

    // ---- The audio thread's own. ----
    alignas(16) uint8_t mem[4096]; // the engine is 2 352 bytes (ENGINE.md §8)
    std::vector<int16_t> pack[PI_TRACKS]; // read once, before any audio; never changed (pi_set_sample)
    int packLoaded = 0;
    pi_engine *e = nullptr;
    pi::Jacks jacks;
    dsp::SchmittTrigger clockTrig, resetTrig;
    uint32_t rate = 0, sinceReset = 0xffffffffu, generation = 0, sincePublish = 0;
    int sourceSent = -1;         // the clock source last sent; -1 sends it on the next frame
    bool keyDown[23] = {};       // what the core was last told of each key
    uint32_t sliderSent[2] = {32768, 32768}; // the value each slider parameter last had
    float sliderSeen[2] = {32768.f, 32768.f}; // the same, as the float last read: rounded only on a change
    float rateSeen = 0.f;
    uint32_t msFrames = 48;      // 1 ms at the rate: a trigger's length, and RESET's mask on CLOCK
    uint32_t viewFrames = 800;   // a sixtieth of a second at the rate: the view's longest gap while playing
    uint32_t frames = 0, droppedSeen = 0, notFiniteSeen = 0, returnFramesSeen = 0;
    bool viewNow = true;         // something may have moved the view: read it this frame
    bool firstFrame = true, mustPublish = true;
    uint8_t view[PI_VIEW_SIZE] = {}, shownView[PI_VIEW_SIZE] = {};
    bool viewEverShown = false;
    // The self-test's place in its fixture (the Probe's scheme; fixtures/README.md).
    int fixture = -1;
    bool running = false, edgesRun = false, mismatch = false;
    uint32_t m = 0, got = 0, viewAt = 0;
    uint64_t frameInRun = 0, nextStep = 0, anchor = 0, anchorStep = 0, stepStart = 0;
    struct Press { uint32_t param; float value; };
    Press presses[64];
    uint32_t npresses = 0, pressed = 0;

    Rhythm() {
        config(PARAMS_LEN, INPUTS_LEN, OUTPUTS_LEN, LIGHTS_LEN);
        for (int k = 0; k < 16; k++) configButton(KEY_PARAMS + k, string::f("Key %d", k + 1));
        for (int k = 0; k < 7; k++) configButton(KEY_PARAMS + 16 + k, FN_NAMES[k]);
        // 0 to 65535, the core's own units, so a value goes in and comes back exactly; shown in %.
        for (int s = 0; s < 2; s++) {
            ParamQuantity *q = configParam(SLIDER_A + s, 0.f, 65535.f, 32768.f, s ? "Slider B" : "Slider A", "%", 0.f, 100.f / 65535.f);
            q->snapEnabled = true;
            q->randomizeEnabled = false; // the core decides what a slider sets; a random one would edit the beat
            q->smoothEnabled = false;
            sliderHeld[s] = false;
        }
        configInput(CLOCK_INPUT, "Clock");
        configInput(RESET_INPUT, "Reset");
        configInput(RETURN_INPUT, "Return (sixteen channels: each takes its sound's place in the mix)");
        configOutput(TRIGGERS_OUTPUT, "Triggers (sixteen channels, one a sound)");
        configOutput(VOICES_OUTPUT, "Voices (sixteen channels, one a sound, before the volume)");
        configOutput(AUDIO_OUTPUT, "Audio");
        if (pi_abi_version() != PI_ABI_VERSION || pi_size() > sizeof mem) {
            WARN("Pocket Instruments: the core is not the one this plugin was built for");
            return;
        }
        loadPack();
        e = pi_init(mem, sizeof mem, 48000, SEED);
        givePack();
    }

    ~Rhythm() { report("removed"); }

    // As the Probe: res/samples/ in the plugin, in tracks.txt's order (D50).
    void loadPack() {
        std::ifstream list(asset::plugin(pluginInstance, "res/samples/tracks.txt"));
        std::string name;
        for (uint32_t t = 0; t < PI_TRACKS && std::getline(list, name); t++) {
            std::ifstream f(asset::plugin(pluginInstance, "res/samples/" + name + ".s16"), std::ios::binary);
            std::vector<char> bytes((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
            pack[t].resize(bytes.size() / 2);
            std::memcpy(pack[t].data(), bytes.data(), pack[t].size() * 2);
            if (!pack[t].empty()) packLoaded++;
        }
        if (packLoaded != int(PI_TRACKS))
            WARN("Pocket Instruments: %d of 16 samples found; the rest play their code voices", packLoaded);
    }
    void givePack() {
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!pack[t].empty()) pi_set_sample(e, t, pack[t].data(), uint32_t(pack[t].size()));
    }

    void report(const char *when) {
        int fx = testedFixture.load();
        INFO("Pocket Instruments rhythm (%s): fixture %s%s: %u passes matched, %u did not, %u cut short, %u views held, %u not; "
             "rate %u Hz, %u events dropped, %u snapshots published, %u loaded, %u refused; audio peak %.2f V, %u samples not finite, "
             "%u trigger pulses, %u frames with RETURN; %d of 16 samples found",
             when, fx >= 0 ? FIXTURES[fx].name : "none", fx >= 0 ? (testedEdges.load() ? " on edges" : " on the table") : "",
             passed.load(), failed.load(), aborted.load(), viewsHeld.load(), viewsNot.load(), lastRate.load(), dropped.load(),
             published.load(), loadsOk.load(), loadsRefused.load(), peakMillivolts.load() / 1000.0, notFinite.load(), pulses.load(),
             returnFrames.load(), packLoaded);
        if (haveMismatch.load()) INFO("Pocket Instruments rhythm: first mismatch: %s", firstMismatch);
    }

    void noteMismatch(const char *fmt, const char *a, const char *b) {
        if (haveMismatch.load(std::memory_order_relaxed)) return;
        std::snprintf(firstMismatch, sizeof firstMismatch, fmt, a, b);
        haveMismatch = true;
    }

    // ---- Holding keys: Rack's other threads. A key is down while anything holds it. ----
    void hold(int k, uint8_t who, bool on) {
        uint8_t before = holders[k];
        holders[k] = on ? uint8_t(before | who) : uint8_t(before & ~who);
        params[KEY_PARAMS + k].setValue(holders[k] ? 1.f : 0.f);
        // D60: a press that ends finishes the gesture, and every latched key lets go.
        if (!on && (before & who) && who != LATCH && latched)
            for (int j = 0; j < 23; j++)
                if (latched >> j & 1) unlatch(j);
    }
    void unlatch(int k) {
        latched &= ~(1u << k);
        hold(k, LATCH, false);
    }
    void toggleLatch(int k) {
        if (latched >> k & 1) unlatch(k);
        else {
            latched |= 1u << k;
            hold(k, LATCH, true);
        }
    }

    // ---- The audio thread. ----

    // A fresh engine: Initialize, or a self-test pass. Every key up, the sliders at pi_init's.
    void fresh(uint32_t seed) {
        e = pi_init(mem, sizeof mem, rate ? rate : 48000, seed);
        givePack();
        for (int k = 0; k < 23; k++) {
            params[KEY_PARAMS + k].setValue(0.f);
            keyDown[k] = false;
        }
        for (int s = 0; s < 2; s++) {
            params[SLIDER_A + s].setValue(32768.f);
            sliderSent[s] = 32768;
            sliderSeen[s] = 32768.f;
        }
        sourceSent = -1;
        viewNow = true;
        mustPublish = true;
    }

    static uint64_t stepFrame(uint64_t n, uint32_t rate, uint32_t mbpm) {
        return (n * rate * 15000 + mbpm - 1) / mbpm; // F(n), fixtures/README.md
    }

    void checkView(const RhythmFixture &fx, uint32_t at) {
        for (; viewAt < fx.views.size() && fx.views[viewAt].at <= at; viewAt++) {
            if (fx.views[viewAt].at != at) continue;
            uint8_t v[PI_VIEW_SIZE];
            char text[480];
            pi_view(e, v, sizeof v);
            viewText(v, text, sizeof text);
            bool edgesOk = ((v[PI_VIEW_FLAGS] & PI_VIEW_FLAG_EDGES) != 0) == edgesRun;
            // D54: the slider parameters, which are the caps, show what the view says.
            bool capsOk = params[SLIDER_A].getValue() == float(u16(v, PI_VIEW_A)) && params[SLIDER_B].getValue() == float(u16(v, PI_VIEW_B));
            if (!capsOk) {
                char caps[64];
                std::snprintf(caps, sizeof caps, "caps at %.0f and %.0f", double(params[SLIDER_A].getValue()), double(params[SLIDER_B].getValue()));
                std::strncat(text, ", but ", sizeof text - std::strlen(text) - 1);
                std::strncat(text, caps, sizeof text - std::strlen(text) - 1);
            }
            if (edgesOk && capsOk && std::strcmp(text, fx.views[viewAt].text) == 0) viewsHeld++;
            else {
                viewsNot++;
                mismatch = true;
                noteMismatch("view, expected \"%s\", got \"%s\"", fx.views[viewAt].text, text);
            }
        }
    }

    void verdict() {
        const RhythmFixture &fx = FIXTURES[fixture];
        checkView(fx, fx.steps - 1);
        if (mismatch || got != fx.expect.size() || pressed != npresses) {
            if (!mismatch) noteMismatch("%s%s", "a pass ended short of its trace or its presses", "");
            failed++;
        } else passed++;
    }

    // The self-test's frame: the fixture's edits at each step's boundary, its keys and sliders
    // pressed on the module's own parameters from the frame after, one a frame (a key and its
    // release in one `at` are two changes of one parameter, so they cannot share a frame).
    void selfTest(pi_cmd *cmds, uint32_t &n, bool clockIn) {
        bool boundary = edgesRun ? clockIn : (!running || frameInRun == nextStep);
        if (boundary) {
            if (running && pressed != npresses) {
                mismatch = true; // a step too short for its presses: the clock is too fast for the test
                noteMismatch("%s%s", "the next step came before the last step's presses were made", "");
            }
            if (running) checkView(FIXTURES[fixture], m - 1);
            if (running && m == FIXTURES[fixture].steps) {
                verdict();
                running = false;
            }
            if (!running) {
                fixture = clamp(fixtureWanted.load(std::memory_order_relaxed), 0, int(FIXTURES.size()) - 1);
                testedFixture = fixture;
                testedEdges = edgesRun ? 1 : 0;
                const RhythmFixture &fx = FIXTURES[fixture];
                fresh(fx.seed);
                cmds[n++] = pi_cmd{0, PI_CMD_TEMPO, 0, 0, 0, fx.mbpm};
                cmds[n++] = pi_cmd{0, PI_CMD_SOURCE, 0, 0, 0, edgesRun ? PI_SOURCE_EDGES : PI_SOURCE_TABLE};
                sourceSent = edgesRun ? 1 : 0;
                running = true;
                mismatch = false;
                m = got = viewAt = 0;
                frameInRun = anchor = anchorStep = 0;
            }
            const RhythmFixture &fx = FIXTURES[fixture];
            npresses = pressed = 0;
            stepStart = frameInRun;
            for (const FixCmd &c : fx.cmds) {
                if (c.at != m) continue;
                if (c.type == PI_CMD_KEY_DOWN || c.type == PI_CMD_KEY_UP) {
                    if (npresses < 64) presses[npresses++] = Press{uint32_t(KEY_PARAMS + c.a), c.type == PI_CMD_KEY_DOWN ? 1.f : 0.f};
                } else if (c.type == PI_CMD_PARAM) {
                    if (npresses < 64) presses[npresses++] = Press{uint32_t(SLIDER_A + c.a), float(c.value)};
                } else if (n < 60) {
                    cmds[n++] = pi_cmd{0, c.type, c.a, c.b, 0, c.value};
                    if (c.type == PI_CMD_RESET) {
                        anchor = frameInRun;
                        anchorStep = m;
                    }
                }
            }
            if (edgesRun) cmds[n++] = pi_cmd{0, PI_CMD_CLOCK, 0, 0, 0, 0};
            m++;
            nextStep = anchor + stepFrame(m - anchorStep, rate, fx.mbpm);
        }
        // fixtures/README.md: a key lands a frame after its step's boundary. Then one a frame.
        if (pressed < npresses && frameInRun == stepStart + 1 + pressed) {
            params[presses[pressed].param].setValue(presses[pressed].value);
            pressed++;
        }
    }

    void process(const ProcessArgs &args) override {
        if (!e) return;
        // Efficiency (PLAN.md's ground rules; measured with perf in Session 13): nothing below
        // calls libm, takes a lock or makes a full memory barrier on a frame where nothing moved.
        uint32_t r = rate;
        if (args.sampleRate != rateSeen) {
            rateSeen = args.sampleRate;
            r = uint32_t(std::lround(rateSeen));
        }
        if (r != rate) {
            pi_set_sample_rate(e, r);
            if (rate != 0 && fixture >= 0 && running && !edgesRun) { // the table's frames start again
                aborted++;
                running = false;
            }
            rate = r;
            lastRate = r;
            msFrames = std::max<uint32_t>(1, r / 1000);
            viewFrames = r / 60;
        }
        if (freshWanted.load(std::memory_order_relaxed) && freshWanted.exchange(false)) fresh(SEED);
        if (const Snap *s = inbox.take()) {
            (pi_load(e, s->b, s->len) == PI_OK ? loadsOk : loadsRefused)++;
            loadsTaken++;
            mustPublish = true;
            viewNow = true;
        }

        bool edges = inputs[CLOCK_INPUT].isConnected();
        bool resetIn = resetTrig.process(inputs[RESET_INPUT].getVoltage(), 0.1f, 2.f);
        bool clockIn = clockTrig.process(inputs[CLOCK_INPUT].getVoltage(), 0.1f, 2.f);
        if (resetIn) sinceReset = 0;
        else if (sinceReset < 0xffffffffu) sinceReset++;
        if (sinceReset < msFrames) clockIn = false;

        pi_cmd cmds[PI_EVENTS_MIN + 32];
        uint32_t n = 0;
        int wanted = fixtureWanted.load(std::memory_order_relaxed);
        if (wanted >= int(FIXTURES.size())) wanted = -1;
        if (wanted >= 0) {
            if (fixture != wanted || edgesRun != edges) {
                if (running) aborted++;
                running = false;
                fixture = wanted;
                edgesRun = edges;
            }
            selfTest(cmds, n, clockIn);
            pi_cmd drop;
            while (menu.pop(drop)) {
            } // the self-test plays alone
        } else {
            if (fixture >= 0) { // the self-test was left: the instrument, empty
                fixture = -1;
                running = false;
                testedFixture = -1;
                fresh(SEED);
            }
            if (int(edges) != sourceSent) {
                cmds[n++] = pi_cmd{0, PI_CMD_SOURCE, 0, 0, 0, edges ? PI_SOURCE_EDGES : PI_SOURCE_TABLE};
                sourceSent = edges;
            }
            if (resetIn) cmds[n++] = pi_cmd{0, PI_CMD_RESET, 0, 0, 0, 0};
            if (edges && clockIn) cmds[n++] = pi_cmd{0, PI_CMD_CLOCK, 0, 0, 0, 0};
            pi_cmd c;
            while (n < 40 && menu.pop(c)) cmds[n++] = c;
        }

        // A parameter's change is what a finger did (ENGINE.md §13), in key order.
        if (firstFrame) { // what a patch saved is where the parameters start, not a press
            firstFrame = false;
            for (int k = 0; k < 23; k++) keyDown[k] = params[KEY_PARAMS + k].getValue() > 0.5f;
            for (int s = 0; s < 2; s++) {
                sliderSeen[s] = params[SLIDER_A + s].getValue();
                sliderSent[s] = uint32_t(clamp(int(std::lround(sliderSeen[s])), 0, 65535));
            }
        }
        for (int k = 0; k < 23; k++) {
            bool down = params[KEY_PARAMS + k].getValue() > 0.5f;
            if (down != keyDown[k] && n < PI_EVENTS_MIN + 30) {
                cmds[n++] = pi_cmd{0, uint8_t(down ? PI_CMD_KEY_DOWN : PI_CMD_KEY_UP), uint8_t(k), 0, 0, 0};
                keyDown[k] = down;
            }
        }
        for (int s = 0; s < 2; s++) {
            float pv = params[SLIDER_A + s].getValue();
            if (pv == sliderSeen[s]) continue;
            sliderSeen[s] = pv;
            uint32_t v = uint32_t(clamp(int(std::lround(pv)), 0, 65535));
            if (v != sliderSent[s] && n < PI_EVENTS_MIN + 32) {
                cmds[n++] = pi_cmd{0, PI_CMD_PARAM, uint8_t(s), 0, 0, v};
                sliderSent[s] = v;
            }
        }

        float both[PI_AUDIO_BOTH];
        pi_event ev[PI_EVENTS_MIN];
        uint32_t count = pi_process(e, 1, cmds, n, ev, PI_EVENTS_MIN, both, PI_AUDIO_BOTH);
        // The view: on any frame a command or a load could have moved it, so the volume and the
        // caps below are exact, and every self-test frame; else every 16th, for the drawing
        // (the playhead and the counts move with the clock, and 16 frames is under 0.4 ms).
        if (viewNow || n || count || fixture >= 0 || (++frames & 15) == 0) pi_view(e, view, sizeof view);
        viewNow = false;

        if (fixture >= 0 && running) {
            const RhythmFixture &fx = FIXTURES[fixture];
            for (uint32_t i = 0; i < count; i++, got++) {
                if (mismatch) continue;
                const pi_event &x = ev[i];
                bool ok = got < fx.expect.size();
                if (ok) {
                    const pi_event &w = fx.expect[got];
                    ok = x.tick == w.tick && x.type == w.type && x.track == w.track && x.step == w.step;
                }
                if (!ok) {
                    mismatch = true;
                    char a[80], b[80];
                    std::snprintf(b, sizeof b, "%u %s %u %u", x.tick, x.type == PI_EV_TRIG ? "trig" : "step", x.track, x.step);
                    if (got < fx.expect.size()) {
                        const pi_event &w = fx.expect[got];
                        std::snprintf(a, sizeof a, "line %u: %u %s %u %u", got + 1, w.tick, w.type == PI_EV_TRIG ? "trig" : "step", w.track, w.step);
                    } else std::snprintf(a, sizeof a, "line %u: the end of the trace", got + 1);
                    noteMismatch("trace, expected %s, got %s", a, b);
                }
            }
            frameInRun++;
        }

        // D54: a cap follows the slider as the view shows it, unless a pointer is on it. The
        // parameter moves, and the frame's scan above will not hear it as a press.
        for (int s = 0; s < 2; s++) {
            uint32_t shown = u16(view, PI_VIEW_A + 2 * s);
            if (!sliderHeld[s].load(std::memory_order_relaxed) && shown != sliderSent[s]) {
                params[SLIDER_A + s].setValue(float(shown));
                sliderSent[s] = shown;
                sliderSeen[s] = float(shown);
            }
        }

        // The jacks (jacks.hpp): RETURN rebuilds the mix only where it takes a sound.
        Input &ret = inputs[RETURN_INPUT];
        int channels = ret.isConnected() ? ret.getChannels() : 0;
        uint32_t mask = pi::returnMask(returnChosen.load(std::memory_order_relaxed), channels);
        float rv[PI_TRACKS] = {};
        for (int c = 0; c < channels && c < int(PI_TRACKS); c++) rv[c] = ret.getVoltage(c);
        if (mask) returnFrames.store(++returnFramesSeen, std::memory_order_relaxed);
        uint32_t before = 0;
        for (uint32_t t = 0; t < PI_TRACKS; t++) before |= (jacks.trigLeft[t] ? 1u : 0u) << t;
        pi::JackFrame out;
        jacks.frame(both, ev, count, msFrames, mask ? rv : nullptr, mask, view[PI_VIEW_VOLUME], out);
        // An unpatched output is left alone; the self-test writes TRIGGERS anyway, to count it.
        if (outputs[TRIGGERS_OUTPUT].isConnected() || fixture >= 0) {
            outputs[TRIGGERS_OUTPUT].setChannels(PI_TRACKS);
            for (uint32_t t = 0; t < PI_TRACKS; t++) {
                outputs[TRIGGERS_OUTPUT].setVoltage(out.triggers[t], t);
                if (outputs[TRIGGERS_OUTPUT].getVoltage(t) != 0.f && !(before >> t & 1)) pulses++; // what left, counted
            }
        }
        if (outputs[VOICES_OUTPUT].isConnected()) {
            outputs[VOICES_OUTPUT].setChannels(PI_TRACKS);
            for (uint32_t t = 0; t < PI_TRACKS; t++) outputs[VOICES_OUTPUT].setVoltage(out.voices[t], t);
        }
        outputs[AUDIO_OUTPUT].setVoltage(out.audio);
        if (jacks.notFinite != notFiniteSeen) notFinite.store(notFiniteSeen = jacks.notFinite, std::memory_order_relaxed);
        uint32_t mv = uint32_t(std::fabs(outputs[AUDIO_OUTPUT].getVoltage()) * 1000.f);
        if (mv > peakMillivolts.load(std::memory_order_relaxed)) peakMillivolts.store(mv, std::memory_order_relaxed);

        // ENGINE.md §14: hand the view on when anything past the tick has changed, and at least
        // sixty times a second while playing.
        sincePublish++;
        bool playing = view[PI_VIEW_FLAGS] & PI_VIEW_FLAG_PLAYING;
        if (!viewEverShown || std::memcmp(view + 4, shownView + 4, PI_VIEW_SIZE - 4) || (playing && sincePublish >= viewFrames)) {
            std::memcpy(viewOut.write().b, view, PI_VIEW_SIZE);
            viewOut.publish();
            std::memcpy(shownView, view, PI_VIEW_SIZE);
            viewEverShown = true;
            sincePublish = 0;
        }

        // ENGINE.md §8: when what a snapshot would hold has changed, save into our own buffer and
        // hand it over. The saving thread never touches the engine.
        uint32_t g = pi_generation(e);
        if (g != generation || mustPublish) {
            generation = g;
            mustPublish = false;
            Snap &s = saved.write();
            s.len = pi_save(e, s.b, PI_SNAPSHOT_SIZE);
            s.loads = loadsTaken.load(std::memory_order_relaxed);
            if (s.len == PI_SNAPSHOT_SIZE) {
                saved.publish();
                published++;
            }
        }
        uint32_t d = pi_dropped(e);
        if (d != droppedSeen) dropped.store(droppedSeen = d, std::memory_order_relaxed);
    }

    void onReset(const ResetEvent &ev) override {
        Module::onReset(ev);
        for (int k = 0; k < 23; k++) holders[k] = 0;
        latched = 0;
        returnChosen = -1;
        freshWanted = true;
    }

    // Rack calls these on its own thread while process() runs on the audio thread.
    json_t *dataToJson() override {
        json_t *root = json_object();
        const Snap *s = saved.latest();
        // A load asked for and not yet taken by the audio thread is still the beat to keep.
        if (s && s->loads >= loadsAsked)
            json_object_set_new(root, "snapshot", json_string(string::toBase64(s->b, s->len).c_str()));
        else if (!pendingLoad.empty())
            json_object_set_new(root, "snapshot", json_string(string::toBase64(pendingLoad.data(), pendingLoad.size()).c_str()));
        json_object_set_new(root, "return", json_integer(returnChosen.load()));
        int fx = fixtureWanted.load();
        if (fx >= 0 && fx < int(FIXTURES.size())) json_object_set_new(root, "fixture", json_string(FIXTURES[fx].name));
        return root;
    }

    void dataFromJson(json_t *root) override {
        if (json_t *j = json_object_get(root, "return")) returnChosen = int32_t(clamp(int(json_integer_value(j)), -1, 0xffff));
        if (json_t *j = json_object_get(root, "fixture"))
            for (size_t i = 0; i < FIXTURES.size(); i++)
                if (json_is_string(j) && FIXTURES[i].name == std::string(json_string_value(j))) fixtureWanted = int(i);
        if (json_t *j = json_object_get(root, "snapshot")) {
            std::vector<uint8_t> bytes;
            try {
                bytes = string::fromBase64(json_string_value(j) ? json_string_value(j) : "");
            } catch (const std::exception &) {
            }
            // Any version the core has written; the core checks which, and refuses the rest.
            if (bytes.size() >= PI_SNAPSHOT_SIZE_V1) {
                Snap &in = inbox.write();
                in.len = uint32_t(std::min<size_t>(bytes.size(), PI_SNAPSHOT_SIZE));
                std::copy(bytes.begin(), bytes.begin() + in.len, in.b);
                pendingLoad.assign(bytes.begin(), bytes.begin() + in.len);
                loadsAsked++;
                inbox.publish();
            }
        }
    }
};

// ---- The face. Everything below runs on Rack's drawing thread. ----

namespace {

const NVGcolor GROUND = nvgRGB(0x14, 0x13, 0x1F), TILE = nvgRGB(0x2B, 0x29, 0x42), DISPLAY = nvgRGB(0x0B, 0x0A, 0x12),
               TABLE = nvgRGB(0x07, 0x06, 0x0C), ECRU = nvgRGB(0xF2, 0xE8, 0xD0), WHITE = nvgRGB(0xFF, 0xFF, 0xFF),
               OCHRE = nvgRGB(0xF0, 0xB4, 0x29), MADDER = nvgRGB(0xF0, 0x65, 0x4A), SKY = nvgRGB(0x8F, 0xAA, 0xF7),
               LILAC = nvgRGB(0xC9, 0xC2, 0xDD), THREAD = nvgRGB(0x6E, 0x6A, 0x92);
// design/DESIGN.md, "Function key": the band, and latched, the face.
const NVGcolor FN_COLOUR[7] = {MADDER, OCHRE, SKY, ECRU, ECRU, ECRU, ECRU};

void fillRect(NVGcontext *vg, float x, float y, float w, float h, NVGcolor c) {
    nvgBeginPath(vg);
    nvgRect(vg, x, y, w, h);
    nvgFillColor(vg, c);
    nvgFill(vg);
}
// A band of width t inside the rectangle (the frame, the rim).
void band(NVGcontext *vg, float x, float y, float w, float h, float t, NVGcolor c) {
    nvgBeginPath(vg);
    nvgRect(vg, x, y, w, h);
    nvgPathWinding(vg, NVG_SOLID);
    nvgRect(vg, x + t, y + t, w - 2 * t, h - 2 * t);
    nvgPathWinding(vg, NVG_HOLE);
    nvgFillColor(vg, c);
    nvgFill(vg);
}
std::shared_ptr<window::Font> font() { return APP->window->loadFont(asset::plugin(pluginInstance, "res/fonts/JetBrainsMono-ExtraBold.ttf")); }
bool text(NVGcontext *vg, float x, float y, float sizeMm, NVGcolor c, int align, const char *s) {
    std::shared_ptr<window::Font> f = font();
    if (!f || f->handle < 0) return false;
    nvgFontFaceId(vg, f->handle);
    nvgFontSize(vg, mm2px(sizeMm));
    nvgFillColor(vg, c);
    nvgTextAlign(vg, align);
    nvgText(vg, x, y, s, nullptr);
    return true;
}

} // namespace

// What the drawing thread knows: the latest view, and the whites it is holding (§14).
struct Face {
    uint8_t v[PI_VIEW_SIZE] = {};
    bool have = false;
    uint8_t lastFires[PI_TRACKS] = {};
    double whiteUntil[PI_TRACKS] = {};

    void take(Rhythm *m) {
        const View *nv = m ? m->viewOut.take() : nullptr;
        if (!nv) return;
        double now = system::getTime();
        uint32_t mbpm = std::max<uint32_t>(1, u32(nv->b, PI_VIEW_TEMPO));
        // A firing holds the white for half a step at the view's tempo, 40 to 120 ms.
        double hold = std::min(0.120, std::max(0.040, 7500.0 / mbpm));
        bool sounds = nv->b[PI_VIEW_FLAGS] & PI_VIEW_FLAG_SOUNDS;
        for (uint32_t t = 0; t < PI_TRACKS; t++) {
            uint8_t f = nv->b[PI_VIEW_FIRES + t];
            if (have && f != lastFires[t] && sounds) whiteUntil[t] = now + hold;
            lastFires[t] = f;
        }
        std::memcpy(v, nv->b, PI_VIEW_SIZE);
        have = true;
    }
    bool held(int k) const { return have && (u32(v, PI_VIEW_HELD) >> k & 1); }
    bool flag(uint32_t f) const { return have && (v[PI_VIEW_FLAGS] & f); }
};

struct RhythmKey : app::ParamWidget {
    Rhythm *rm = nullptr;
    const Face *face = nullptr;
    int k = 0;
    bool latchClick = false;

    void onButton(const ButtonEvent &e) override {
        // D61: Ctrl+click (Cmd on a Mac; Rack reads both as RACK_MOD_CTRL) latches the five.
        if (rm && e.button == GLFW_MOUSE_BUTTON_LEFT && e.action == GLFW_PRESS && (e.mods & RACK_MOD_MASK) == RACK_MOD_CTRL &&
            (LATCHING >> k & 1)) {
            rm->toggleLatch(k);
            latchClick = true;
            e.consume(this);
            return;
        }
        ParamWidget::onButton(e); // a left press for MIDI-Map's learning; a right-click, Rack's menu
    }
    void onDragStart(const DragStartEvent &e) override {
        if (e.button != GLFW_MOUSE_BUTTON_LEFT || latchClick || !rm) return;
        rm->hold(k, Rhythm::MOUSE, true);
    }
    void onDragEnd(const DragEndEvent &e) override {
        if (e.button != GLFW_MOUSE_BUTTON_LEFT || !rm) return;
        if (latchClick) {
            latchClick = false;
            return;
        }
        rm->hold(k, Rhythm::MOUSE, false);
    }
    void onDoubleClick(const DoubleClickEvent &e) override {} // a key has no default to go back to

    void draw(const DrawArgs &args) override {
        NVGcontext *vg = args.vg;
        float w = box.size.x, h = box.size.y;
        bool pressed = face && face->held(k);
        if (k < 16) drawGrid(vg, w, h, pressed);
        else drawFunction(vg, w, h, pressed);
    }

    // design/DESIGN.md, "Key states": field, frame, white, stitch and bar.
    void drawGrid(NVGcontext *vg, float w, float h, bool pressed) {
        const uint8_t *v = face ? face->v : nullptr;
        bool have = face && face->have;
        bool field = have && (u16(v, PI_VIEW_FIELD) >> k & 1);
        bool stitch = have && (u16(v, PI_VIEW_STITCH) >> k & 1);
        bool bar = have && (u16(v, PI_VIEW_BAR) >> k & 1);
        bool sounds = face && face->flag(PI_VIEW_FLAG_SOUNDS);
        bool fired = sounds && system::getTime() < face->whiteUntil[k];
        bool play = face && face->flag(PI_VIEW_FLAG_PLAYING) && face->flag(PI_VIEW_FLAG_STEP) && v[PI_VIEW_STEP] == k;
        float frame = w / 8.f; // an eighth of the key
        bool lit = field || fired || pressed;
        if (pressed) { // white pulled in by the frame
            fillRect(vg, 0, 0, w, h, GROUND);
            fillRect(vg, frame, frame, w - 2 * frame, h - 2 * frame, WHITE);
        } else fillRect(vg, 0, 0, w, h, fired ? WHITE : field ? ECRU : TILE);
        if (play && !pressed) {
            band(vg, 0, 0, w, h, frame, OCHRE);
            if (field && !fired) band(vg, frame, frame, w - 2 * frame, h - 2 * frame, mm2px(0.66f), GROUND);
        }
        if (stitch) {
            float s = mm2px(1.83f), in = mm2px(1.33f);
            fillRect(vg, w - in - s, in, s, s, lit ? GROUND : ECRU);
        }
        if (bar) fillRect(vg, 0, h - mm2px(1.6f), w, mm2px(1.6f), face->held(PI_KEY_PATTERN) ? OCHRE : MADDER);
        char num[12];
        std::snprintf(num, sizeof num, "%d", k + 1);
        text(vg, w / 2, h / 2, 3.8f, lit ? GROUND : ECRU, NVG_ALIGN_CENTER | NVG_ALIGN_MIDDLE, num);
    }

    // "Function key": idle, a band across the top; pressed, white pulled in; latched, the face lit.
    void drawFunction(NVGcontext *vg, float w, float h, bool pressed) {
        int i = k - 16;
        bool ctrlLatched = rm && (rm->latched >> k & 1);
        bool on = (k == int(PI_KEY_PLAY) && face && face->flag(PI_VIEW_FLAG_PLAYING)) ||
                  (k == int(PI_KEY_WRITE) && face && face->flag(PI_VIEW_FLAG_WRITE));
        float frame = mm2px(11.7f) / 8.f, bandH = mm2px(1.67f);
        NVGcolor label = GROUND;
        if (ctrlLatched) {
            fillRect(vg, 0, 0, w, h, FN_COLOUR[i]);
        } else if (pressed) {
            fillRect(vg, 0, 0, w, h, GROUND);
            fillRect(vg, frame, frame, w - 2 * frame, h - 2 * frame, WHITE);
        } else if (on) {
            fillRect(vg, 0, 0, w, h, FN_COLOUR[i]);
        } else {
            fillRect(vg, 0, 0, w, h, TILE);
            fillRect(vg, 0, 0, w, bandH, FN_COLOUR[i]);
            label = ECRU;
        }
        // The word runs up the key, read from the right.
        nvgSave(vg);
        nvgTranslate(vg, w / 2, h / 2 + (ctrlLatched || on || pressed ? 0 : bandH / 2)); // below the band
        nvgRotate(vg, -M_PI / 2);
        text(vg, 0, 0, 2.8f, label, NVG_ALIGN_CENTER | NVG_ALIGN_MIDDLE, FN_NAMES[i]);
        nvgRestore(vg);
    }
};

// A slider: Rack's own vertical drag (so Rack's knob settings apply), a cap drawn from the
// parameter, which the module moves to the view's value unless the pointer is on it (D54).
struct RhythmSlider : app::SliderKnob {
    Rhythm *rm = nullptr;
    const Face *face = nullptr;
    int which = 0;
    RhythmSlider() { smooth = false; } // every value a drag passes through is a PARAM; no ramp

    void onDragStart(const DragStartEvent &e) override {
        if (rm && e.button == GLFW_MOUSE_BUTTON_LEFT) rm->sliderHeld[which] = true;
        SliderKnob::onDragStart(e);
    }
    void onDragEnd(const DragEndEvent &e) override {
        SliderKnob::onDragEnd(e);
        if (rm && e.button == GLFW_MOUSE_BUTTON_LEFT) rm->sliderHeld[which] = false;
    }
    // D63: back to where it started: a sound's middle, or with bpm held swing 0 and 120 bpm
    // (21845, the value the view shows for 120: ENGINE.md §14). Not Rack's fixed default.
    void onDoubleClick(const DoubleClickEvent &e) override {
        ParamQuantity *q = getParamQuantity();
        if (!q) return;
        bool bpm = face && face->held(PI_KEY_BPM);
        q->setValue(bpm ? (which ? 21845.f : 0.f) : 32768.f);
        e.consume(this);
    }
    void draw(const DrawArgs &args) override {
        ParamQuantity *q = getParamQuantity();
        float v = q ? q->getValue() / 65535.f : 0.5f;
        float capH = mm2px(3.f), capW = mm2px(5.f);
        float y = (1.f - v) * (box.size.y - capH);
        bool held = rm && rm->sliderHeld[which].load();
        NVGcolor c = held ? WHITE : ECRU;
        float x = (box.size.x - capW) / 2;
        fillRect(args.vg, x, y, capW, capH, c);
        fillRect(args.vg, x, y + capH * 0.385f, capW, capH * 0.23f, GROUND); // the slot across the middle
    }
};

// design/DESIGN.md, "Socket": an ecru ring round a dark hole for an input, a dark ring round a
// pale hole for an output.
template <bool OUT>
struct RhythmPort : app::PortWidget {
    RhythmPort() { box.size = mm2px(Vec(8.f, 8.f)); }
    void draw(const DrawArgs &args) override {
        NVGcontext *vg = args.vg;
        Vec c = box.size.div(2);
        nvgBeginPath(vg);
        nvgCircle(vg, c.x, c.y, mm2px(4.f));
        nvgFillColor(vg, OUT ? GROUND : ECRU);
        nvgFill(vg);
        nvgBeginPath(vg);
        nvgCircle(vg, c.x, c.y, mm2px(1.75f));
        nvgFillColor(vg, OUT ? ECRU : TABLE);
        nvgFill(vg);
        PortWidget::draw(args);
    }
};

// The plain display (D53): the tempo, bpm, the write mark, the step number and the sixteen step
// marks. The weave's area is left dark for Session 14. In a self-test it says how it is going.
struct RhythmDisplay : widget::Widget {
    Rhythm *rm = nullptr;
    const Face *face = nullptr;

    void draw(const DrawArgs &args) override {
        NVGcontext *vg = args.vg;
        float W = box.size.x, H = box.size.y, px = mm2px(2.67f), py = mm2px(2.f);
        float right = mm2px(25.f), gap = mm2px(3.f);
        float leftW = W - 2 * px - right - gap, rx = W - px; // the right column's right edge
        bool have = face && face->have;
        const uint8_t *v = face ? face->v : nullptr;
        bool playing = have && face->flag(PI_VIEW_FLAG_PLAYING), stepped = have && face->flag(PI_VIEW_FLAG_STEP);
        // The sixteen step marks under the weave: beats taller, the playing step tallest, ochre.
        float markGap = mm2px(0.83f), mw = (leftW - 15 * markGap) / 16, base = H - py;
        for (int n = 0; n < 16; n++) {
            bool now = playing && stepped && v[PI_VIEW_STEP] == n;
            float mh = mm2px(now ? 2.67f : n % 4 == 0 ? 1.67f : 1.f);
            fillRect(vg, px + n * (mw + markGap), base - mh, mw, mh, now ? OCHRE : THREAD);
        }
        // The right column: tempo and bpm on top; the write mark and the step number below.
        char s[32];
        std::snprintf(s, sizeof s, "%u", have ? u32(v, PI_VIEW_TEMPO) / 1000 : 120u);
        float top = py + mm2px(7.6f);
        text(vg, rx - right, top, 10.f, ECRU, NVG_ALIGN_LEFT | NVG_ALIGN_BASELINE, s);
        text(vg, rx, top, 2.5f, LILAC, NVG_ALIGN_RIGHT | NVG_ALIGN_BASELINE, "bpm");
        if (stepped) std::snprintf(s, sizeof s, "step %02u", unsigned(v[PI_VIEW_STEP]) + 1);
        else std::snprintf(s, sizeof s, "step --");
        float low = H - py - mm2px(0.9f);
        text(vg, rx, low, 2.67f, ECRU, NVG_ALIGN_RIGHT | NVG_ALIGN_BASELINE, s);
        if (have && face->flag(PI_VIEW_FLAG_WRITE)) {
            float bw = mm2px(11.f), bh = mm2px(3.6f);
            fillRect(vg, rx - right, low - bh + mm2px(0.9f), bw, bh, OCHRE);
            text(vg, rx - right + bw / 2, low, 2.67f, GROUND, NVG_ALIGN_CENTER | NVG_ALIGN_BASELINE, "write");
        }
        // A self-test: its name and its count where the weave will be, and a light.
        int fx = rm ? rm->fixtureWanted.load() : -1;
        if (rm && fx >= 0 && fx < int(FIXTURES.size())) {
            bool bad = rm->failed.load() != 0, good = !bad && rm->passed.load() != 0;
            fillRect(vg, px, py, mm2px(3.f), mm2px(3.f), bad ? MADDER : good ? nvgRGB(0x4C, 0xC2, 0x6E) : THREAD);
            text(vg, px + mm2px(4.5f), py + mm2px(2.6f), 2.67f, LILAC, NVG_ALIGN_LEFT | NVG_ALIGN_BASELINE, FIXTURES[fx].name);
            std::snprintf(s, sizeof s, "%u passed, %u not", rm->passed.load(), rm->failed.load());
            text(vg, px, py + mm2px(7.f), 2.67f, LILAC, NVG_ALIGN_LEFT | NVG_ALIGN_BASELINE, s);
        }
    }
};

struct RhythmWidget : ModuleWidget {
    Face face;
    std::vector<RhythmKey *> keys;

    RhythmWidget(Rhythm *module) {
        setModule(module);
        setPanel(createPanel(asset::plugin(pluginInstance, "res/panel.svg")));
        addChild(createWidget<ThemedScrew>(Vec(RACK_GRID_WIDTH, 0)));
        addChild(createWidget<ThemedScrew>(Vec(box.size.x - 2 * RACK_GRID_WIDTH, 0)));
        addChild(createWidget<ThemedScrew>(Vec(RACK_GRID_WIDTH, RACK_GRID_HEIGHT - RACK_GRID_WIDTH)));
        addChild(createWidget<ThemedScrew>(Vec(box.size.x - 2 * RACK_GRID_WIDTH, RACK_GRID_HEIGHT - RACK_GRID_WIDTH)));

        // design/DESIGN.md's positions table, in mm from the top left.
        RhythmDisplay *d = createWidget<RhythmDisplay>(mm2px(Vec(61.f - 111.3f / 2, 19.5f - 24.3f / 2)));
        d->box.size = mm2px(Vec(111.3f, 24.3f));
        d->rm = module;
        d->face = &face;
        addChild(d);
        for (int k = 0; k < 16; k++) addKey(k, 11.f + 12.f * (k % 4), 44.f + 12.f * (k / 4), 11.7f, 11.7f);
        const float fx[7] = {83.47f, 97.f, 110.53f, 81.78f, 91.93f, 102.08f, 112.23f};
        for (int i = 0; i < 7; i++) addKey(16 + i, fx[i], i < 3 ? 49.85f : 74.15f, i < 3 ? 12.93f : 9.55f, 23.7f);
        for (int s = 0; s < 2; s++) {
            // By its corner: a new widget's size is infinite, so centring it first gives NaN.
            RhythmSlider *sl = createParam<RhythmSlider>(mm2px(Vec((s ? 70.f : 60.f) - 2.5f, 59.5f - 21.5f)), module, Rhythm::SLIDER_A + s);
            sl->box.size = mm2px(Vec(5.f, 43.f));
            sl->rm = module;
            sl->face = &face;
            sl->which = s;
            addParam(sl);
        }
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(10.67f, 116.3f)), module, Rhythm::CLOCK_INPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(22.33f, 116.3f)), module, Rhythm::RESET_INPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(34.f, 116.3f)), module, Rhythm::RETURN_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(80.67f, 116.3f)), module, Rhythm::TRIGGERS_OUTPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(95.17f, 116.3f)), module, Rhythm::VOICES_OUTPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(109.67f, 116.3f)), module, Rhythm::AUDIO_OUTPUT));
    }

    void addKey(int k, float cx, float cy, float w, float h) {
        RhythmKey *key = createParam<RhythmKey>(mm2px(Vec(cx - w / 2, cy - h / 2)), getModule<Rhythm>(), Rhythm::KEY_PARAMS + k);
        key->box.size = mm2px(Vec(w, h));
        key->rm = getModule<Rhythm>();
        key->face = &face;
        key->k = k;
        keys.push_back(key);
        addParam(key);
    }

    void step() override {
        Rhythm *m = getModule<Rhythm>();
        face.take(m);
        // A computer key let go while the pointer was elsewhere: its release never came here.
        if (m)
            for (int k = 0; k < 23; k++)
                if ((m->holders[k] & Rhythm::KEYBOARD) && glfwGetKey(APP->window->win, KEYS[k]) != GLFW_PRESS)
                    m->hold(k, Rhythm::KEYBOARD, false);
        ModuleWidget::step();
    }

    // D57 item 5: the computer keys, while the pointer is over the module. Real holds, no latch.
    void onHoverKey(const HoverKeyEvent &e) override {
        Rhythm *m = getModule<Rhythm>();
        int k = -1;
        for (int i = 0; m && i < 23; i++)
            if (KEYS[i] == e.key) k = i;
        if (k >= 0 && (e.action == GLFW_RELEASE || (e.mods & RACK_MOD_MASK) == 0)) {
            if (e.action == GLFW_PRESS) m->hold(k, Rhythm::KEYBOARD, true);
            else if (e.action == GLFW_RELEASE) m->hold(k, Rhythm::KEYBOARD, false);
            e.consume(this); // a repeat is consumed and does nothing
            return;
        }
        ModuleWidget::onHoverKey(e);
    }

    void appendContextMenu(Menu *menu) override {
        Rhythm *m = getModule<Rhythm>();
        if (!m) return;
        menu->addChild(new MenuSeparator);
        // Each key's code or sample (D50). The switch, then the sound as it now is, in one frame
        // (VOICE first), as the page's sheet does (D60 item 4) ⚠.
        menu->addChild(createSubmenuItem("Sounds", "", [=](Menu *sub) {
            sub->addChild(createMenuItem("All code", "", [=]() {
                for (uint8_t t = 0; t < PI_TRACKS; t++) m->menu.push(pi_cmd{0, PI_CMD_VOICE, t, 0, 0, 0});
            }));
            sub->addChild(createMenuItem("All samples", "", [=]() {
                for (uint8_t t = 0; t < PI_TRACKS; t++) m->menu.push(pi_cmd{0, PI_CMD_VOICE, t, 0, 0, 1});
            }));
            sub->addChild(new MenuSeparator);
            for (int t = 0; t < int(PI_TRACKS); t++)
                sub->addChild(createCheckMenuItem(string::f("%d %s: sample", t + 1, SOUND_NAMES[t]), "",
                                                  [=]() { return face.have && (u16(face.v, PI_VIEW_SAMPLED) >> t & 1); },
                                                  [=]() {
                                                      uint32_t on = face.have ? u16(face.v, PI_VIEW_SAMPLED) >> t & 1 : 0;
                                                      m->menu.push(pi_cmd{0, PI_CMD_VOICE, uint8_t(t), 0, 0, on ? 0u : 1u});
                                                      m->menu.push(pi_cmd{0, PI_CMD_FIRE, uint8_t(t), 0, 0, 0});
                                                  }));
        }));
        // D62 item 3: which sounds RETURN replaces.
        menu->addChild(createSubmenuItem("RETURN", "", [=](Menu *sub) {
            sub->addChild(createCheckMenuItem("As the cable carries", "", [=]() { return m->returnChosen.load() < 0; },
                                              [=]() { m->returnChosen = -1; }));
            sub->addChild(new MenuSeparator);
            for (int t = 0; t < int(PI_TRACKS); t++)
                sub->addChild(createCheckMenuItem(string::f("Sound %d from RETURN", t + 1), SOUND_NAMES[t],
                                                  [=]() {
                                                      int ch = m->inputs[Rhythm::RETURN_INPUT].isConnected() ? m->inputs[Rhythm::RETURN_INPUT].getChannels() : 0;
                                                      int32_t c = m->returnChosen.load();
                                                      return ((c < 0 ? pi::returnMask(-1, ch) : uint32_t(c)) >> t & 1) != 0;
                                                  },
                                                  [=]() {
                                                      int ch = m->inputs[Rhythm::RETURN_INPUT].isConnected() ? m->inputs[Rhythm::RETURN_INPUT].getChannels() : 0;
                                                      int32_t c = m->returnChosen.load();
                                                      uint32_t now = c < 0 ? pi::returnMask(-1, ch) : uint32_t(c);
                                                      m->returnChosen = int32_t((now ^ (1u << t)) & 0xffffu);
                                                  }));
        }));
        // The self-test (rack/selftest.sh runs it headless): choose a fixture, or play.
        int fx = m->fixtureWanted.load();
        menu->addChild(createSubmenuItem("Self-test", fx >= 0 ? FIXTURES[fx].name : "off", [=](Menu *sub) {
            sub->addChild(createCheckMenuItem("Off: play it", "", [=]() { return m->fixtureWanted.load() < 0; },
                                              [=]() { m->fixtureWanted = -1; }));
            for (int i = 0; i < int(FIXTURES.size()); i++)
                sub->addChild(createCheckMenuItem(FIXTURES[i].name, "", [=]() { return m->fixtureWanted.load() == i; },
                                                  [=]() { m->fixtureWanted = i; }));
        }));
        if (fx >= 0) menu->addChild(createMenuLabel(string::f("%u passes matched, %u did not", m->passed.load(), m->failed.load())));
    }
};

Model *modelRhythm = createModel<Rhythm, RhythmWidget>("Rhythm");
