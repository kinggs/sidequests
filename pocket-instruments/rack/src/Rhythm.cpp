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
//   TRIGGERS  sixteen channels, 10 V for 1 ms a firing. VOICES: sixteen channels, 5 V to 1.0.
//   RETURN    sixteen channels; channel n takes sound n's place in the mix, and in the effects'
//             bus if that sound is switched into them (D62, D68 item 3).
//   A OUT, B OUT  sixteen channels, 0 to 10 V: the slider each sound was last hit with.
//   A IN, B IN    sixteen channels: channel n's voltage at sound n's hit is that slider (D76).
//   FX GATES  sixteen channels: 10 V on channel n while effect n is heard (D68).
//   FX SEND   the sounds switched into the effects, before any effect. FX RETURN: what an
//             effect ticked in the menu is heard from while it is held (by default the ones
//             the core has no sound for, the delay first).
//   AUDIO     the mix, 5 V to 1.0, bent by tanh towards 10 V.
//
// Since Session 18 the mix is the core's whatever is patched (ENGINE.md §19): the module
// hands it the inputs and scales what comes out (jacks.hpp), and asks for the loop's
// eighteen or fifty channels only while a jack that needs them is in use.
//
// A mouse holds a key while the button is down; Ctrl+click (Cmd on a Mac) latches sound,
// pattern, bpm or function until the next press of any key ends, or a second Ctrl+click
// (D60, D61). Ctrl+click on fx latches it until it is Ctrl+clicked again, and while latched
// fx is down only while a grid key is (D78). Right-click keeps Rack's own parameter menu (R47). The computer keys of D57 item 5
// play while the pointer is over the module. A double-click on a slider puts it back where it
// started, from the view (D63). The sliders are the hand's (ENGINE.md §20, D75): a cap moves
// by itself only while bpm is held or after a load, and a thin second mark on each slider
// shows what the chosen sound was last hit with (the view's bytes 60 to 63).
//
// The self-test (PLAN.md, Session 13): a patch whose module data names a format 2, 3 or 4 fixture
// makes the module press its own parameters and send the fixture's edits, and hold its events,
// its views and (Session 18) its FX GATES to the fixture, pass after pass, as the Probe does
// with format 1. A patch whose data names a loop ("return", "fx", "sliders") plays a short
// performance through the module's own cables and holds every frame to a second engine given
// what those cables should carry; "latch" plays D78's gestures. rack/selftest.sh.
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
    uint32_t format, seed, mbpm, steps;
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
// What each effect key is, in our words (ENGINE.md §17 and §18; 4 and 13 to 16 have no sound in
// the core yet, so they are the ones FX RETURN takes by default).
const char *const FX_NAMES[PI_TRACKS] = {"low sample rate", "distortion", "bit crush", "delay (no sound here yet)", "lowpass", "lowpass sweep",
    "hipass", "hipass sweep", "repeat, 4 a beat", "repeat, 3 a beat", "repeat, 8 a beat", "repeat, 6 a beat", "13 (no sound here yet)",
    "14 (no sound here yet)", "15 (no sound here yet)", "16 (no sound here yet)"};
// The loop self-tests (selftest.sh): which of the module's own cables a patch has looped.
const char *const LOOP_NAMES[5] = {"none", "return", "fx", "sliders", "latch"};
enum Loop { LOOP_NONE, LOOP_RETURN, LOOP_FX, LOOP_SLIDERS, LOOP_LATCH };
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
// the caller checks the flag itself. The same line as harness/fixture.hpp's view_text: for a
// format 3 fixture with §17's three fields on its end, and for format 4 (§20) two more.
void viewText(const uint8_t *b, char *out, size_t cap, uint32_t format = 2) {
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
    if (format >= 3 && n > 0 && size_t(n) < cap)
        n += std::snprintf(out + n, cap - size_t(n), " fx=%u fxsteps=%04x fxsounds=%04x", unsigned(b[PI_VIEW_HEARD]),
                           unsigned(u16(b, PI_VIEW_FX_STEPS)), unsigned(u16(b, PI_VIEW_FX_SOUNDS)));
    if (format >= 4 && n > 0 && size_t(n) < cap)
        std::snprintf(out + n, cap - size_t(n), " ea=%u eb=%u", unsigned(u16(b, PI_VIEW_HIT_A)), unsigned(u16(b, PI_VIEW_HIT_B)));
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
    // Rack ties a cable to a port's number: new ports go after the old ones, always (D76 item 2).
    enum InputId { CLOCK_INPUT, RESET_INPUT, RETURN_INPUT, FX_RETURN_INPUT, A_INPUT, B_INPUT, INPUTS_LEN };
    enum OutputId { TRIGGERS_OUTPUT, VOICES_OUTPUT, AUDIO_OUTPUT, FX_GATES_OUTPUT, FX_SEND_OUTPUT, A_OUTPUT, B_OUTPUT, OUTPUTS_LEN };
    enum LightId { LIGHTS_LEN };
    enum Holder : uint8_t { MOUSE = 1, KEYBOARD = 2, LATCH = 4 };

    // ---- Shared between threads: atomics, and the handoff.hpp schemes. ----
    std::atomic<int> fixtureWanted{-1};  // -1: the instrument; otherwise the self-test's fixture
    std::atomic<int32_t> returnChosen{-1}; // D62 item 3: -1 "As the cable carries", else a mask
    // §16 (D84): the menu's "Reduced motion" for the display's weave: the shuttle jumps and
    // nothing flashes. Rack has no setting of its own to follow, as a browser has. In the patch.
    std::atomic<bool> stillWeave{false};
    std::atomic<int32_t> aChosen{-1}, bChosen{-1}; // the same for A IN and B IN (D76 item 4)
    std::atomic<int32_t> fxChosen{-1};   // D68 item 2: -1 the effects the core has no sound for, else a mask
    std::atomic<int> loopWanted{LOOP_NONE}; // a loop self-test (selftest.sh), or none
    std::atomic<bool> sliderHeld[2];     // a pointer is on the slider: its cap does not follow
    std::atomic<bool> freshWanted{false}; // Rack's Initialize: an empty beat
    std::atomic<uint32_t> passed{0}, failed{0}, aborted{0}, viewsHeld{0}, viewsNot{0}, dropped{0}, published{0},
        loadsOk{0}, loadsRefused{0}, lastRate{0}, peakMillivolts{0}, notFinite{0}, pulses{0}, returnFrames{0},
        loadsTaken{0}, gatesHeld{0}, gatesNot{0}, loopPassed{0}, loopFailed{0}, loopHeld{0}, loopNot{0}, loopActed{0};
    std::atomic<int> testedFixture{-1}, testedEdges{0};
    char firstMismatch[900] = {}; // written once by the audio thread, read when the module goes
    std::atomic<bool> haveMismatch{false};
    pi::Latest<Snap> saved;      // audio thread writes; Rack's saving thread reads
    pi::Latest<Snap> inbox;      // Rack's loading thread writes; audio thread reads
    pi::Latest<View> viewOut;    // audio thread writes; the drawing thread reads
    pi::Queue<pi_cmd, 64> menu;  // the menu's edits (VOICE, FIRE), in order, to the audio thread

    // ---- Rack's other threads only. ----
    uint8_t holders[23] = {};    // who holds each key down (Holder bits)
    uint32_t latched = 0;        // keys latched by a Ctrl+click (D61); fx stays until the next one (D78)
    std::vector<uint8_t> pendingLoad; // the last snapshot a patch gave, until a save holds it
    uint32_t loadsAsked = 0;

    // ---- The audio thread's own. ----
    alignas(16) uint8_t mem[4096]; // the engine is 3 568 bytes (ENGINE.md §8; 2 352 until §20)
    std::vector<int16_t> pack[PI_TRACKS]; // read once, before any audio; never changed (pi_set_sample)
    int packLoaded = 0;
    pi_engine *e = nullptr;
    pi::Jacks jacks;
    uint32_t routeSent[4] = {};  // the masks ROUTE last gave the core (§19): sounds, effects, A, B
    // The loop self-tests: a second engine, given what the module's own cables should carry.
    alignas(16) uint8_t mem2[4096];
    pi_engine *shadow = nullptr;
    int loop = LOOP_NONE;
    bool loopRunning = false, loopBad = false;
    uint64_t loopFrame = 0;
    uint32_t loopStep = 0, loopActedPass = 0, fires1 = 0;
    float prevVoices[PI_TRACKS] = {}, prevSend = 0.f, prevA[PI_TRACKS] = {}, prevB[PI_TRACKS] = {};
    float shadowIo[PI_AUDIO_LOOP_SLIDERS] = {}; // the shadow's frame, kept until the outputs are written
    dsp::SchmittTrigger clockTrig, resetTrig;
    uint32_t rate = 0, sinceReset = 0xffffffffu, generation = 0, sincePublish = 0;
    int sourceSent = -1;         // the clock source last sent; -1 sends it on the next frame
    bool keyDown[23] = {};       // what the core was last told of each key
    uint32_t sliderSent[2] = {32768, 32768}; // the value each slider parameter last had
    float sliderSeen[2] = {32768.f, 32768.f}; // the same, as the float last read: rounded only on a change
    uint32_t hand[2] = {32768, 32768}; // §20: where the hand left each slider; the cap unless bpm is held
    bool reseat = true;          // after a load or a fresh engine: the hand is what the next view shows
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
        configInput(FX_RETURN_INPUT, "FX return (heard in place of the effects ticked in the menu)");
        configInput(A_INPUT, "Slider A (sixteen channels, 0 to 10 V: read as each sound is hit)");
        configInput(B_INPUT, "Slider B (sixteen channels, 0 to 10 V: read as each sound is hit)");
        configOutput(TRIGGERS_OUTPUT, "Triggers (sixteen channels, one a sound)");
        configOutput(VOICES_OUTPUT, "Voices (sixteen channels, one a sound, before the volume)");
        configOutput(AUDIO_OUTPUT, "Audio");
        configOutput(FX_GATES_OUTPUT, "FX gates (sixteen channels: 10 V while that effect is heard)");
        configOutput(FX_SEND_OUTPUT, "FX send (the sounds through the effects, before any effect)");
        configOutput(A_OUTPUT, "Slider A (sixteen channels, 0 to 10 V: what each sound was last hit with)");
        configOutput(B_OUTPUT, "Slider B (sixteen channels, 0 to 10 V: what each sound was last hit with)");
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
    void givePack() { givePack(e); }
    void givePack(pi_engine *to) {
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!pack[t].empty()) pi_set_sample(to, t, pack[t].data(), uint32_t(pack[t].size()));
    }

    void report(const char *when) {
        int fx = testedFixture.load();
        INFO("Pocket Instruments rhythm (%s): fixture %s%s: %u passes matched, %u did not, %u cut short, %u views held, %u not; "
             "rate %u Hz, %u events dropped, %u snapshots published, %u loaded, %u refused; audio peak %.2f V, %u samples not finite, "
             "%u trigger pulses, %u frames with RETURN; %u gates held, %u not; loop %s: %u passes held to the core, %u not, %u frames "
             "the same, %u not, %u where the loop was heard; %d of 16 samples found",
             when, fx >= 0 ? FIXTURES[fx].name : "none", fx >= 0 ? (testedEdges.load() ? " on edges" : " on the table") : "",
             passed.load(), failed.load(), aborted.load(), viewsHeld.load(), viewsNot.load(), lastRate.load(), dropped.load(),
             published.load(), loadsOk.load(), loadsRefused.load(), peakMillivolts.load() / 1000.0, notFinite.load(), pulses.load(),
             returnFrames.load(), gatesHeld.load(), gatesNot.load(), LOOP_NAMES[clamp(loopWanted.load(), 0, 4)], loopPassed.load(),
             loopFailed.load(), loopHeld.load(), loopNot.load(), loopActed.load(), packLoaded);
        if (haveMismatch.load()) INFO("Pocket Instruments rhythm: first mismatch: %s", firstMismatch);
    }

    void noteMismatch(const char *fmt, const char *a, const char *b) {
        if (haveMismatch.load(std::memory_order_relaxed)) return;
        std::snprintf(firstMismatch, sizeof firstMismatch, fmt, a, b);
        haveMismatch = true;
    }

    // ---- Holding keys: Rack's other threads. A key is down while anything holds it. ----
    bool gridHeld() const {
        for (int j = 0; j < 16; j++)
            if (holders[j]) return true;
        return false;
    }
    void set(int k, uint8_t who, bool on) {
        holders[k] = on ? uint8_t(holders[k] | who) : uint8_t(holders[k] & ~who);
        params[KEY_PARAMS + k].setValue(holders[k] ? 1.f : 0.f);
    }
    void hold(int k, uint8_t who, bool on) {
        uint8_t before = holders[k];
        bool fxLatched = latched >> PI_KEY_FX & 1;
        // D78: while fx is latched it is down only while a grid key is. It goes down before the
        // first grid key and comes up after the last, so each click punches for as long as it
        // is held and, between clicks, no arriving step is emptied. (process() sends a frame's
        // changes in that order too, should both land on one frame.)
        if (on && k < 16 && fxLatched) set(PI_KEY_FX, LATCH, true);
        set(k, who, on);
        if (!on && k < 16 && fxLatched && !gridHeld()) set(PI_KEY_FX, LATCH, false);
        // D60: a press that ends finishes the gesture, and every latched key lets go. But fx:
        // its latch stays until it is Ctrl+clicked again (D78).
        if (!on && (before & who) && who != LATCH && (latched & ~(1u << PI_KEY_FX)))
            for (int j = 0; j < 23; j++)
                if ((latched >> j & 1) && j != int(PI_KEY_FX)) unlatch(j);
    }
    void unlatch(int k) {
        latched &= ~(1u << k);
        set(k, LATCH, false);
    }
    void toggleLatch(int k) {
        if (latched >> k & 1) unlatch(k);
        else {
            latched |= 1u << k;
            // D78: fx latched holds nothing by itself; a grid key already down brings it down.
            if (k != int(PI_KEY_FX) || gridHeld()) set(k, LATCH, true);
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
            hand[s] = 32768;
        }
        reseat = true;
        sourceSent = -1;
        viewNow = true;
        mustPublish = true;
        for (uint32_t &r : routeSent) r = 0; // a new engine routes nothing (§19): say it again
    }

    static uint64_t stepFrame(uint64_t n, uint32_t rate, uint32_t mbpm) {
        return (n * rate * 15000 + mbpm - 1) / mbpm; // F(n), fixtures/README.md
    }

    void checkView(const RhythmFixture &fx, uint32_t at) {
        for (; viewAt < fx.views.size() && fx.views[viewAt].at <= at; viewAt++) {
            if (fx.views[viewAt].at != at) continue;
            uint8_t v[PI_VIEW_SIZE];
            char text[560];
            pi_view(e, v, sizeof v);
            viewText(v, text, sizeof text, fx.format);
            bool edgesOk = ((v[PI_VIEW_FLAGS] & PI_VIEW_FLAG_EDGES) != 0) == edgesRun;
            // The slider parameters, which are the caps, show what the view says: since §20 the
            // hand's, which a slider sets for every sound, or swing and tempo with bpm held.
            bool capsOk = params[SLIDER_A].getValue() == float(u16(v, PI_VIEW_A)) && params[SLIDER_B].getValue() == float(u16(v, PI_VIEW_B));
            if (!capsOk) {
                char caps[64];
                std::snprintf(caps, sizeof caps, "caps at %.0f and %.0f", double(params[SLIDER_A].getValue()), double(params[SLIDER_B].getValue()));
                std::strncat(text, ", but ", sizeof text - std::strlen(text) - 1);
                std::strncat(text, caps, sizeof text - std::strlen(text) - 1);
            }
            // Session 18: FX GATES, as the jack carries it, held to the fixture's own `fx=`: 10 V on
            // that effect's channel and 0 V on the other fifteen.
            if (const char *want = std::strstr(fx.views[viewAt].text, " fx=")) {
                uint32_t heard = uint32_t(std::atoi(want + 4));
                bool ok = true; // (an unpatched output keeps no channel count in Rack: the volts are what is held)
                for (uint32_t t = 0; t < PI_TRACKS; t++) ok = ok && outputs[FX_GATES_OUTPUT].getVoltage(t) == (heard == t + 1 ? 10.f : 0.f);
                if (ok) gatesHeld++;
                else {
                    gatesNot++;
                    mismatch = true;
                    noteMismatch("FX GATES is not 10 V on the heard effect's channel alone, at the view \"%s\"%s", fx.views[viewAt].text, "");
                }
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

    // ---- The loop self-tests (Session 18; rack/selftest.sh patches the cables). ----
    //
    // "return", "fx" and "sliders": the minimum beat at 120 bpm on the table clock, sixteen
    // steps a pass, with fx and a grid key pressed on the module's own parameters at step 5
    // and let go at step 9 ("return": effect 2, the distortion, on drums that come back through
    // RETURN from the module's own VOICES, which is the owner's patch with the module's own
    // voices for the drums; "fx": effect 4, heard from FX RETURN, patched from FX SEND;
    // "sliders": no effect, the bass drum's steps keeping four pairs of values, A OUT into A IN
    // and B OUT into B IN). Every frame, a second engine (`shadow`) is given the same commands
    // and, for its inputs, what the module wrote to its own outputs the frame before, which is
    // what a Rack cable carries; its layout and its routes are what the patch should give, not
    // what process() worked out. The module's frame and view must be the shadow's, bit for bit.
    // A pass also needs the loop to have been heard: frames where an effect changed a mix made
    // of returned sound, or a hit that took its slider from the input.
    //
    // "latch": D78's gestures, by the same functions a mouse calls (no widget exists in a
    // headless Rack, so the audio thread calls them here and nothing else does), each checked
    // against the core's view at a step's boundary.
    static bool loopHasShadow(int kind) { return kind == LOOP_RETURN || kind == LOOP_FX || kind == LOOP_SLIDERS; }

    void loopFail(const char *what) {
        loopBad = true;
        loopNot++;
        noteMismatch("loop: %s%s", what, "");
    }
    void loopExpect(bool ok, const char *what) {
        if (ok) {
            loopHeld++;
            loopActedPass++;
        } else loopFail(what);
    }

    void loopTest(pi_cmd *cmds, uint32_t &n) {
        const uint32_t MBPM = 120000, STEPS = loop == LOOP_LATCH ? 32 : 16;
        if (!loopRunning) {
            // A pass starts once the looped inputs carry what the outputs sent.
            bool ready = loop == LOOP_RETURN ? inputs[RETURN_INPUT].getChannels() == int(PI_TRACKS)
                         : loop == LOOP_FX ? inputs[FX_RETURN_INPUT].isConnected()
                         : loop == LOOP_SLIDERS ? inputs[A_INPUT].getChannels() == int(PI_TRACKS) && inputs[B_INPUT].getChannels() == int(PI_TRACKS)
                         : true;
            if (!ready || !rate) return;
            fresh(SEED);
            shadow = pi_init(mem2, sizeof mem2, rate, SEED);
            if (shadow) givePack(shadow);
            for (int k = 0; k < 23; k++) holders[k] = 0;
            latched = 0;
            cmds[n++] = pi_cmd{0, PI_CMD_TEMPO, 0, 0, 0, MBPM};
            cmds[n++] = pi_cmd{0, PI_CMD_SOURCE, 0, 0, 0, PI_SOURCE_TABLE};
            sourceSent = 0;
            for (uint8_t st = 0; st < 16; st++) {
                if (st % 4 == 0) cmds[n++] = pi_cmd{0, PI_CMD_STEP, 0, st, 0, 1};
                if (st % 8 == 4) cmds[n++] = pi_cmd{0, PI_CMD_STEP, 1, st, 0, 1};
                if (st % 2 == 0 && st % 8 != 6) cmds[n++] = pi_cmd{0, PI_CMD_STEP, 2, st, 0, 1};
                if (st % 8 == 6) cmds[n++] = pi_cmd{0, PI_CMD_STEP, 3, st, 0, 1};
            }
            if (loop == LOOP_SLIDERS) {
                const uint32_t kept[4][2] = {{10000, 20000}, {30000, 40000}, {50000, 60000}, {60000, 10000}};
                for (uint8_t i = 0; i < 4; i++) cmds[n++] = pi_cmd{0, PI_CMD_KEEP, 0, uint8_t(4 * i), 0, kept[i][0] << 16 | kept[i][1]};
            }
            cmds[n++] = pi_cmd{0, PI_CMD_PLAY, 0, 0, 0, 1};
            loopRunning = true;
            loopBad = false;
            loopFrame = 0;
            loopStep = 0;
            loopActedPass = 0;
            return;
        }
        loopFrame++;
        uint8_t v[PI_VIEW_SIZE];
        bool boundary = loopFrame == stepFrame(loopStep + 1, rate, MBPM);
        if (boundary) loopStep++; // the step whose boundary this frame is; its ticks come in this frame's pi_process
        bool after = loopFrame == stepFrame(loopStep, rate, MBPM) + 1; // a frame after it, where a fixture's keys land
        if (boundary) pi_view(e, v, sizeof v); // as the step before left it
        uint32_t held = boundary ? u32(v, PI_VIEW_HELD) : 0, fxBit = 1u << PI_KEY_FX;
        if (loop == LOOP_LATCH) {
            bool fxLatched = latched >> PI_KEY_FX & 1;
            if (after) switch (loopStep) {
                case 2: toggleLatch(PI_KEY_FX); break;        // Ctrl+click fx
                case 4: hold(1, MOUSE, true); break;          // a click on key 2, held for two steps
                case 6: hold(1, MOUSE, false); break;
                case 26: hold(2, MOUSE, true); break;         // a second click, on key 3: no Ctrl+click between
                case 27: hold(2, MOUSE, false); break;
                case 28: toggleLatch(PI_KEY_FX); break;       // Ctrl+click fx again: off
                case 29: hold(1, MOUSE, true); break;         // now key 2 is a tap
                case 30: hold(1, MOUSE, false); break;
            }
            if (boundary) switch (loopStep) {
                case 3: loopExpect(fxLatched && !(held & fxBit), "fx latched sent fx down with no grid key down"); break;
                case 5: loopExpect(held == (fxBit | 1u << 1) && v[PI_VIEW_HEARD] == 2, "a click with fx latched did not punch effect 2"); break;
                case 7: loopExpect(fxLatched && held == 0 && u16(v, PI_VIEW_FX_STEPS) == 0x0060, "after the click fx was not let go, or the latch went, or the lane is not steps 6 and 7"); break;
                case 22: loopExpect(fxLatched && v[PI_VIEW_HEARD] == 2 && u16(v, PI_VIEW_FX_STEPS) == 0x0060, "the lane did not replay under the latch: the latch emptied it"); break;
                case 24: loopExpect(u16(v, PI_VIEW_FX_STEPS) == 0x0060 && v[PI_VIEW_HEARD] == 0, "the latch changed the lane between clicks"); break;
                case 27: loopExpect(held == (fxBit | 1u << 2) && v[PI_VIEW_HEARD] == 3, "the second click did not punch: the latch let go after the first"); break;
                case 28: loopExpect(fxLatched && held == 0 && u16(v, PI_VIEW_FX_STEPS) == 0x0860, "the second click did not write step 12 alone"); break;
                case 29: fires1 = v[PI_VIEW_FIRES + 1]; break;
                case 30: loopExpect(!fxLatched && held == 1u << 1 && v[PI_VIEW_HEARD] == 0 && v[PI_VIEW_FIRES + 1] == uint8_t(fires1 + 1), "with the latch off key 2 was not a plain tap"); break;
            }
        } else if (loop != LOOP_SLIDERS && after && (loopStep == 4 || loopStep == 8)) {
            // fx and the key on one frame: process() sends fx down first and up last (D78's order).
            float to = loopStep == 4 ? 1.f : 0.f;
            params[KEY_PARAMS + PI_KEY_FX].setValue(to);
            params[KEY_PARAMS + (loop == LOOP_RETURN ? 1 : 3)].setValue(to);
        }
        if (boundary && loopStep == STEPS) {
            uint32_t need = loop == LOOP_LATCH ? 8u : 1u;
            if (!loopBad && loopActedPass >= need) loopPassed++;
            else {
                if (!loopBad) noteMismatch("loop: %s%s", "the pass ended without the loop being heard", "");
                loopFailed++;
            }
            loopRunning = false; // the next frame starts again, fresh
        }
    }

    // The shadow's frame, and the module's held to it. `in` is what the module gave the core,
    // `io` what came back, `channels` the layout it asked for.
    void loopShadow(const pi_cmd *cmds, uint32_t n, const float *in, const float *io, uint32_t channels) {
        if (!shadow) return;
        pi_cmd sc[PI_EVENTS_MIN + 48];
        uint32_t sn = 0;
        if (loopFrame == 0) { // the routes this patch should give
            if (loop == LOOP_RETURN) sc[sn++] = pi_cmd{0, PI_CMD_ROUTE, PI_ROUTE_SOUNDS, 0, 0, 0xffffu};
            if (loop == LOOP_FX) sc[sn++] = pi_cmd{0, PI_CMD_ROUTE, PI_ROUTE_FX, 0, 0, pi::FX_OUTSIDE_DEFAULT};
            if (loop == LOOP_SLIDERS) {
                sc[sn++] = pi_cmd{0, PI_CMD_ROUTE, PI_ROUTE_A, 0, 0, 0xffffu};
                sc[sn++] = pi_cmd{0, PI_CMD_ROUTE, PI_ROUTE_B, 0, 0, 0xffffu};
            }
        }
        for (uint32_t i = 0; i < n; i++)
            if (cmds[i].type != PI_CMD_ROUTE) sc[sn++] = cmds[i];
        float sio[PI_AUDIO_LOOP_SLIDERS] = {};
        uint32_t want = loop == LOOP_SLIDERS ? PI_AUDIO_LOOP_SLIDERS : PI_AUDIO_LOOP;
        if (loop == LOOP_RETURN) pi::returnIn(sio, prevVoices, 0xffffu);
        if (loop == LOOP_FX) pi::fxReturnIn(sio, prevSend);
        if (loop == LOOP_SLIDERS) {
            pi::sliderIn(sio, PI_LOOP_A, prevA, 0xffffu);
            pi::sliderIn(sio, PI_LOOP_B, prevB, 0xffffu);
        }
        pi_event sev[PI_EVENTS_MIN];
        pi_process(shadow, 1, sc, sn, sev, PI_EVENTS_MIN, sio, want);
        uint8_t a[PI_VIEW_SIZE], b[PI_VIEW_SIZE];
        pi_view(e, a, sizeof a);
        pi_view(shadow, b, sizeof b);
        if (channels != want) loopFail("the module asked the core for another layout than its cables need");
        else if (std::memcmp(io, sio, want * sizeof(float))) loopFail("a frame is not the core's own, given what the cables carry");
        else if (std::memcmp(a, b, PI_VIEW_SIZE)) loopFail("the view is not the core's own, given what the cables carry");
        else loopHeld++;
        std::memcpy(shadowIo, sio, sizeof shadowIo);
        // Was the loop heard? An effect on returned sound moves the mix off the plain sum of what
        // came back; a slider input shows as a last hit that is not what the output says.
        bool acted = false;
        if (loop == LOOP_SLIDERS) acted = u16(a, PI_VIEW_HIT_A) != uint32_t(std::lround(io[PI_LOOP_A + a[PI_VIEW_SEL]] * 65535.f));
        else if (a[PI_VIEW_HEARD]) {
            float sum = 0.f;
            for (uint32_t t = 0; t < PI_TRACKS; t++) sum += loop == LOOP_RETURN ? in[t] : io[t];
            acted = std::fabs(io[PI_LOOP_MIX] - sum) > 1e-3f;
        }
        if (acted) {
            loopActedPass++;
            loopActed++;
        }
    }

    // And what the looped output itself carries, once it is written: the shadow's own channel,
    // in volts. (Without this a wrong signal on FX SEND came back, was taken, and matched: the
    // shadow is given the module's own outputs. Found by planting it.)
    void loopOutputs() {
        bool ok = true;
        if (loop == LOOP_FX) ok = outputs[FX_SEND_OUTPUT].getVoltage() == 5.f * shadowIo[PI_LOOP_FX];
        for (uint32_t t = 0; t < PI_TRACKS; t++) {
            if (loop == LOOP_RETURN) ok = ok && outputs[VOICES_OUTPUT].getVoltage(t) == 5.f * shadowIo[t];
            if (loop == LOOP_SLIDERS)
                ok = ok && outputs[A_OUTPUT].getVoltage(t) == 10.f * shadowIo[PI_LOOP_A + t] && outputs[B_OUTPUT].getVoltage(t) == 10.f * shadowIo[PI_LOOP_B + t];
        }
        if (!ok) loopFail("a looped output does not carry the core's own channel, in volts");
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
            if (rate != 0 && loopRunning) { // and a loop pass
                aborted++;
                loopRunning = false;
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
            reseat = true; // §20: a load is the one time a cap moves to what the beat holds
            mustPublish = true;
            viewNow = true;
        }

        bool edges = inputs[CLOCK_INPUT].isConnected();
        bool resetIn = resetTrig.process(inputs[RESET_INPUT].getVoltage(), 0.1f, 2.f);
        bool clockIn = clockTrig.process(inputs[CLOCK_INPUT].getVoltage(), 0.1f, 2.f);
        if (resetIn) sinceReset = 0;
        else if (sinceReset < 0xffffffffu) sinceReset++;
        if (sinceReset < msFrames) clockIn = false;

        pi_cmd cmds[PI_EVENTS_MIN + 40];
        uint32_t n = 0;
        int wanted = fixtureWanted.load(std::memory_order_relaxed);
        if (wanted >= int(FIXTURES.size())) wanted = -1;
        int loopNow = wanted >= 0 ? int(LOOP_NONE) : loopWanted.load(std::memory_order_relaxed);
        if (loopNow != loop) {
            if (loopRunning) aborted++;
            loopRunning = false;
            loop = loopNow;
        }
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
        } else if (loop != LOOP_NONE) {
            fixture = -1;
            loopTest(cmds, n);
            pi_cmd drop;
            while (menu.pop(drop)) {
            } // a loop self-test plays alone too
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
                hand[s] = sliderSent[s];
            }
        }
        uint32_t changed = 0;
        for (int k = 0; k < 23; k++) changed |= uint32_t((params[KEY_PARAMS + k].getValue() > 0.5f) != keyDown[k]) << k;
        if (changed) {
            // In key order, but for this: on one frame a function key goes down before any grid
            // key and comes up after them, as a hand holds one (and as D78's latch needs: fx down,
            // then the key; the key up, then fx).
            for (int pass = 0; pass < 3; pass++)
                for (int k = pass == 1 ? 0 : 16; k < (pass == 1 ? 16 : 23); k++) {
                    bool down = !keyDown[k];
                    if (!(changed >> k & 1) || (pass == 0 && !down) || (pass == 2 && down) || n >= PI_EVENTS_MIN + 30) continue;
                    cmds[n++] = pi_cmd{0, uint8_t(down ? PI_CMD_KEY_DOWN : PI_CMD_KEY_UP), uint8_t(k), 0, 0, 0};
                    keyDown[k] = down;
                    changed &= ~(1u << k); // sent: the last pass must not send it back up
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
                if (!keyDown[PI_KEY_BPM]) hand[s] = v; // with bpm held it is swing or tempo (§13)
            }
        }

        // Sound in (ENGINE.md §19; jacks.hpp). Which inputs are taken is ROUTE's, sent when it
        // changes; and the layout is the smallest that carries what is patched: with none of the
        // seven new jacks or RETURN in use it is PI_AUDIO_BOTH, the frame this module always asked for.
        uint32_t route[4];
        route[PI_ROUTE_SOUNDS] = pi::returnMask(returnChosen.load(std::memory_order_relaxed), inputs[RETURN_INPUT].getChannels());
        route[PI_ROUTE_FX] = pi::fxMask(fxChosen.load(std::memory_order_relaxed), inputs[FX_RETURN_INPUT].isConnected());
        route[PI_ROUTE_A] = pi::returnMask(aChosen.load(std::memory_order_relaxed), inputs[A_INPUT].getChannels());
        route[PI_ROUTE_B] = pi::returnMask(bChosen.load(std::memory_order_relaxed), inputs[B_INPUT].getChannels());
        bool slidersOn = route[PI_ROUTE_A] || route[PI_ROUTE_B] || outputs[A_OUTPUT].isConnected() || outputs[B_OUTPUT].isConnected();
        bool loopOn = route[PI_ROUTE_SOUNDS] || route[PI_ROUTE_FX] || outputs[FX_SEND_OUTPUT].isConnected();
        uint32_t channels = pi::layout(slidersOn, loopOn);
        for (uint8_t a = 0; a < 4; a++)
            if (route[a] != routeSent[a] && n < PI_EVENTS_MIN + 36) {
                cmds[n++] = pi_cmd{0, PI_CMD_ROUTE, a, 0, 0, route[a]};
                routeSent[a] = route[a];
            }
        float io[PI_AUDIO_LOOP_SLIDERS];
        if (channels != PI_AUDIO_BOTH) {
            if (route[PI_ROUTE_SOUNDS]) pi::returnIn(io, inputs[RETURN_INPUT].getVoltages(), route[PI_ROUTE_SOUNDS]);
            // Always given: the core reads it while an outside effect is heard and for the 2 ms
            // it ramps out, which can outlast its tick in the menu. Unpatched it is 0 V.
            pi::fxReturnIn(io, inputs[FX_RETURN_INPUT].getVoltage()); // one channel (D68 item 6)
            if (route[PI_ROUTE_A]) pi::sliderIn(io, PI_LOOP_A, inputs[A_INPUT].getVoltages(), route[PI_ROUTE_A]);
            if (route[PI_ROUTE_B]) pi::sliderIn(io, PI_LOOP_B, inputs[B_INPUT].getVoltages(), route[PI_ROUTE_B]);
        }
        float given[PI_TRACKS];
        bool shadowed = loopRunning && loopHasShadow(loop);
        if (shadowed) std::memcpy(given, io, sizeof given);
        pi_event ev[PI_EVENTS_MIN];
        uint32_t count = pi_process(e, 1, cmds, n, ev, PI_EVENTS_MIN, io, channels);
        if (shadowed) loopShadow(cmds, n, given, io, channels);
        // The view: on any frame a command or a load could have moved it, so the volume and the
        // caps below are exact, and every self-test frame; else every 16th, for the drawing
        // (the playhead and the counts move with the clock, and 16 frames is under 0.4 ms).
        bool viewRead = viewNow || n || count || fixture >= 0 || loop != LOOP_NONE || (++frames & 15) == 0;
        if (viewRead) pi_view(e, view, sizeof view);
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

        // §20 (D75; until Session 21, D54's caps that followed the chosen sound): a cap is the
        // hand. It moves by itself only while bpm is held, to show swing and tempo, and after a
        // load, to what was loaded; then back to the hand when bpm is let go. Never while a
        // pointer is on it. The parameter moves, and the frame's scan above will not hear it
        // as a press.
        bool bpmHeld = u32(view, PI_VIEW_HELD) >> PI_KEY_BPM & 1;
        for (int s = 0; s < 2; s++) {
            uint32_t shown = u16(view, PI_VIEW_A + 2 * s);
            if (reseat && viewRead) hand[s] = shown;
            uint32_t want = bpmHeld ? shown : hand[s];
            if (!sliderHeld[s].load(std::memory_order_relaxed) && want != sliderSent[s]) {
                params[SLIDER_A + s].setValue(float(want));
                sliderSent[s] = want;
                sliderSeen[s] = float(want);
            }
        }
        if (viewRead) reseat = false;

        // The jacks, out (jacks.hpp). An unpatched output is left alone.
        if (route[PI_ROUTE_SOUNDS]) returnFrames.store(++returnFramesSeen, std::memory_order_relaxed);
        uint32_t before = 0;
        for (uint32_t t = 0; t < PI_TRACKS; t++) before |= (jacks.trigLeft[t] ? 1u : 0u) << t;
        pi::JackFrame out;
        jacks.frame(io, ev, count, msFrames, out);
        // The self-test writes TRIGGERS and FX GATES anyway, to count and to hold them.
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
        // FX GATES (D68 item 1): what is heard is the view's, which is read on every frame a
        // command or a step could have changed it.
        if (outputs[FX_GATES_OUTPUT].isConnected() || fixture >= 0) {
            outputs[FX_GATES_OUTPUT].setChannels(PI_TRACKS);
            for (uint32_t t = 0; t < PI_TRACKS; t++) outputs[FX_GATES_OUTPUT].setVoltage(pi::gate(view[PI_VIEW_HEARD], t), t);
        }
        if (outputs[FX_SEND_OUTPUT].isConnected()) outputs[FX_SEND_OUTPUT].setVoltage(jacks.send(io));
        if (outputs[A_OUTPUT].isConnected()) {
            outputs[A_OUTPUT].setChannels(PI_TRACKS);
            jacks.sliderOut(io, PI_LOOP_A, outputs[A_OUTPUT].getVoltages());
        }
        if (outputs[B_OUTPUT].isConnected()) {
            outputs[B_OUTPUT].setChannels(PI_TRACKS);
            jacks.sliderOut(io, PI_LOOP_B, outputs[B_OUTPUT].getVoltages());
        }
        if (shadowed) loopOutputs();
        if (loop != LOOP_NONE) { // what a cable from each output carries to the next frame's input
            std::memcpy(prevVoices, outputs[VOICES_OUTPUT].getVoltages(), sizeof prevVoices);
            prevSend = outputs[FX_SEND_OUTPUT].getVoltage();
            std::memcpy(prevA, outputs[A_OUTPUT].getVoltages(), sizeof prevA);
            std::memcpy(prevB, outputs[B_OUTPUT].getVoltages(), sizeof prevB);
        }
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
        aChosen = -1;
        bChosen = -1;
        fxChosen = -1;
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
        json_object_set_new(root, "a", json_integer(aChosen.load()));
        json_object_set_new(root, "b", json_integer(bChosen.load()));
        json_object_set_new(root, "fx", json_integer(fxChosen.load()));
        if (stillWeave.load()) json_object_set_new(root, "reducedMotion", json_true());
        int lp = loopWanted.load();
        if (lp > LOOP_NONE && lp <= LOOP_LATCH) json_object_set_new(root, "loop", json_string(LOOP_NAMES[lp]));
        int fx = fixtureWanted.load();
        if (fx >= 0 && fx < int(FIXTURES.size())) json_object_set_new(root, "fixture", json_string(FIXTURES[fx].name));
        return root;
    }

    void dataFromJson(json_t *root) override {
        stillWeave = json_is_true(json_object_get(root, "reducedMotion"));
        if (json_t *j = json_object_get(root, "return")) returnChosen = int32_t(clamp(int(json_integer_value(j)), -1, 0xffff));
        if (json_t *j = json_object_get(root, "a")) aChosen = int32_t(clamp(int(json_integer_value(j)), -1, 0xffff));
        if (json_t *j = json_object_get(root, "b")) bChosen = int32_t(clamp(int(json_integer_value(j)), -1, 0xffff));
        if (json_t *j = json_object_get(root, "fx")) fxChosen = int32_t(clamp(int(json_integer_value(j)), -1, 0xffff));
        if (json_t *j = json_object_get(root, "loop"))
            for (int i = LOOP_RETURN; i <= LOOP_LATCH; i++)
                if (json_is_string(j) && std::string(LOOP_NAMES[i]) == json_string_value(j)) loopWanted = i;
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
// parameter, which is the hand's (§20: the module moves it only with bpm held or after a
// load), and a second mark from the view's bytes 60 to 63.
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
        // §20: the second mark, what the chosen sound was last hit with: a thin line across the
        // track at that value, where the cap's middle would be. ⚠ design/DESIGN.md does not
        // draw it yet; a thread-coloured line is PLAN.md's stand-in (Session 21).
        if (face && face->have) {
            float h = u16(face->v, PI_VIEW_HIT_A + 2 * which) / 65535.f, th = mm2px(0.35f);
            float ym = (1.f - h) * (box.size.y - capH) + capH / 2;
            fillRect(args.vg, x - mm2px(0.5f), ym - th / 2, capW + mm2px(1.f), th, THREAD);
        }
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

// The display (D53): the tempo, bpm, the write mark, the step number and the sixteen step
// marks; since Session 19 (D81) the effect heard and the lane, from the same bytes the page
// draws them from; and since Session 14 the weave: the core's cells for the view (pi_weave,
// ENGINE.md §16; a first attempt, D84), painted and nothing more. Which cells are lit is the
// core's (core/src/weave.rs); this holds a palette and a square, as the page does. pi_weave
// takes no engine, so this thread may call it (§8). In a self-test the weave's area says how
// the test is going instead.
struct RhythmDisplay : widget::Widget {
    Rhythm *rm = nullptr;
    const Face *face = nullptr;
    uint8_t wove[PI_VIEW_SIZE] = {}; // the view the cells below were woven from
    uint32_t woveFlags = ~0u;
    uint8_t cells[PI_WEAVE_CELLS] = {};

    // The cells, 1 mm each from the area's top left, each a flat square five sixths of its
    // place (design/DESIGN.md, "The animation"). One path a colour. Woven again only when the
    // view or the menu's choice has changed; Rack draws every frame whatever we do.
    void drawWeave(NVGcontext *vg, float x0, float y0, float areaW) {
        const NVGcolor palette[PI_WEAVE_COLOURS] = {DISPLAY, THREAD, ECRU, WHITE, OCHRE, TILE, MADDER};
        uint32_t flags = rm && rm->stillWeave.load() ? PI_WEAVE_REDUCED : 0;
        if (flags != woveFlags || std::memcmp(wove, face->v, PI_VIEW_SIZE) != 0) {
            if (pi_weave(face->v, PI_VIEW_SIZE, flags, cells, sizeof cells) != PI_WEAVE_CELLS) return;
            std::memcpy(wove, face->v, PI_VIEW_SIZE);
            woveFlags = flags;
        }
        float cell = areaW / PI_WEAVE_W, side = cell * 5.f / 6.f;
        for (uint32_t c = 1; c < PI_WEAVE_COLOURS; c++) {
            bool any = false;
            nvgBeginPath(vg);
            for (uint32_t i = 0; i < PI_WEAVE_CELLS; i++)
                if (cells[i] == c) {
                    nvgRect(vg, x0 + (i % PI_WEAVE_W) * cell, y0 + (i / PI_WEAVE_W) * cell, side, side);
                    any = true;
                }
            if (!any) continue;
            nvgFillColor(vg, palette[c]);
            nvgFill(vg);
        }
    }

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
        // D81 item 2: the lane (the view's bytes 56 and 57). A step that holds an effect has a
        // small madder tick above its mark, on one line clear of the tallest mark, so the marks
        // themselves do not change. ⚠ The tick's size and line are a stand-in (design/DESIGN.md).
        uint16_t lane = have ? u16(v, PI_VIEW_FX_STEPS) : 0;
        float tickH = mm2px(0.67f), tickY = base - mm2px(2.67f) - mm2px(0.6f) - tickH;
        for (int n = 0; n < 16; n++)
            if (lane >> n & 1) fillRect(vg, px + n * (mw + markGap), tickY, mw, tickH, MADDER);
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
        float bw = mm2px(11.f), bh = mm2px(3.6f);
        if (have && face->flag(PI_VIEW_FLAG_WRITE)) {
            fillRect(vg, rx - right, low - bh + mm2px(0.9f), bw, bh, OCHRE);
            text(vg, rx - right + bw / 2, low, 2.67f, GROUND, NVG_ALIGN_CENTER | NVG_ALIGN_BASELINE, "write");
        }
        // D81 item 1: while an effect is heard (the view's byte 55), a block like the write mark
        // with fx and its number, in madder, just above the write mark's place in the column
        // (whether or not write is on). ⚠ Its place, and madder, are a stand-in (design/DESIGN.md).
        if (have && v[PI_VIEW_HEARD]) {
            float fxLow = low - bh - mm2px(0.8f);
            fillRect(vg, rx - right, fxLow - bh + mm2px(0.9f), bw, bh, MADDER);
            std::snprintf(s, sizeof s, "fx %u", unsigned(v[PI_VIEW_HEARD]));
            text(vg, rx - right + bw / 2, fxLow, 2.67f, GROUND, NVG_ALIGN_CENTER | NVG_ALIGN_BASELINE, s);
        }
        // A self-test: its name and its count where the weave is, and a light. Otherwise the weave.
        int fx = rm ? rm->fixtureWanted.load() : -1;
        // (With no view yet, or in Rack's module browser, the view is all zeros: a bare loom.)
        if (face && !(rm && fx >= 0)) drawWeave(vg, px, py, leftW);
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
        // Two rows, grouped by what they carry (D76; design/make_panel.py --positions).
        const float UP = 97.5f, LOW = 116.3f;
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(12.4f, UP)), module, Rhythm::CLOCK_INPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(25.4f, UP)), module, Rhythm::RESET_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(40.f, UP)), module, Rhythm::A_OUTPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(51.67f, UP)), module, Rhythm::A_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(63.33f, UP)), module, Rhythm::B_OUTPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(75.f, UP)), module, Rhythm::B_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(90.f, UP)), module, Rhythm::FX_GATES_OUTPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(12.4f, LOW)), module, Rhythm::TRIGGERS_OUTPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(25.4f, LOW)), module, Rhythm::VOICES_OUTPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(38.4f, LOW)), module, Rhythm::RETURN_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(84.f, LOW)), module, Rhythm::FX_SEND_OUTPUT));
        addInput(createInputCentered<RhythmPort<false>>(mm2px(Vec(96.f, LOW)), module, Rhythm::FX_RETURN_INPUT));
        addOutput(createOutputCentered<RhythmPort<true>>(mm2px(Vec(109.67f, LOW)), module, Rhythm::AUDIO_OUTPUT));
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
            // D66 item 4, D68: which sounds go through the effects (and so to FX SEND). The
            // page's sheet has the same switch.
            sub->addChild(new MenuSeparator);
            sub->addChild(createSubmenuItem("Through fx", "", [=](Menu *fxs) {
                fxs->addChild(createMenuItem("All", "", [=]() {
                    for (uint8_t t = 0; t < PI_TRACKS; t++) m->menu.push(pi_cmd{0, PI_CMD_FXSOUND, t, 0, 0, 1});
                }));
                fxs->addChild(createMenuItem("None", "", [=]() {
                    for (uint8_t t = 0; t < PI_TRACKS; t++) m->menu.push(pi_cmd{0, PI_CMD_FXSOUND, t, 0, 0, 0});
                }));
                fxs->addChild(new MenuSeparator);
                for (int t = 0; t < int(PI_TRACKS); t++)
                    fxs->addChild(createCheckMenuItem(string::f("%d %s: through fx", t + 1, SOUND_NAMES[t]), "",
                                                      [=]() { return !face.have || (u16(face.v, PI_VIEW_FX_SOUNDS) >> t & 1); },
                                                      [=]() {
                                                          uint32_t on = face.have ? u16(face.v, PI_VIEW_FX_SOUNDS) >> t & 1 : 1;
                                                          m->menu.push(pi_cmd{0, PI_CMD_FXSOUND, uint8_t(t), 0, 0, on ? 0u : 1u});
                                                      }));
            }));
        }));
        // §16 (D84): the display's weave with reduced motion: the shuttle jumps, nothing flashes.
        menu->addChild(createCheckMenuItem("Display: reduced motion", "", [=]() { return m->stillWeave.load(); },
                                           [=]() { m->stillWeave = !m->stillWeave.load(); }));
        // D62 item 3: which sounds RETURN replaces; and the same for A IN and B IN (D76 item 4).
        auto channelsMenu = [=](const char *name, const char *what, int input, std::atomic<int32_t> Rhythm::*chosen) {
            menu->addChild(createSubmenuItem(name, "", [=](Menu *sub) {
                sub->addChild(createCheckMenuItem("As the cable carries", "", [=]() { return (m->*chosen).load() < 0; }, [=]() { (m->*chosen) = -1; }));
                sub->addChild(new MenuSeparator);
                for (int t = 0; t < int(PI_TRACKS); t++)
                    sub->addChild(createCheckMenuItem(string::f("Sound %d %s", t + 1, what), SOUND_NAMES[t],
                                                      [=]() {
                                                          int32_t c = (m->*chosen).load();
                                                          return ((c < 0 ? pi::returnMask(-1, m->inputs[input].getChannels()) : uint32_t(c)) >> t & 1) != 0;
                                                      },
                                                      [=]() {
                                                          int32_t c = (m->*chosen).load();
                                                          uint32_t now = c < 0 ? pi::returnMask(-1, m->inputs[input].getChannels()) : uint32_t(c);
                                                          (m->*chosen) = int32_t((now ^ (1u << t)) & 0xffffu);
                                                      }));
            }));
        };
        channelsMenu("RETURN", "from RETURN", Rhythm::RETURN_INPUT, &Rhythm::returnChosen);
        channelsMenu("A IN", "takes slider A from A IN", Rhythm::A_INPUT, &Rhythm::aChosen);
        channelsMenu("B IN", "takes slider B from B IN", Rhythm::B_INPUT, &Rhythm::bChosen);
        // D68 item 2: which effects are heard from FX RETURN while they are held, in place of
        // the core's own. By default the ones the core has no sound for.
        menu->addChild(createSubmenuItem("FX RETURN", "", [=](Menu *sub) {
            sub->addChild(createCheckMenuItem("The effects with no sound here yet", "4, 13 to 16", [=]() { return m->fxChosen.load() < 0; },
                                              [=]() { m->fxChosen = -1; }));
            sub->addChild(new MenuSeparator);
            for (int t = 0; t < int(PI_TRACKS); t++)
                sub->addChild(createCheckMenuItem(string::f("Effect %d from FX RETURN", t + 1), FX_NAMES[t],
                                                  [=]() {
                                                      int32_t c = m->fxChosen.load();
                                                      return ((c < 0 ? pi::FX_OUTSIDE_DEFAULT : uint32_t(c)) >> t & 1) != 0;
                                                  },
                                                  [=]() {
                                                      int32_t c = m->fxChosen.load();
                                                      uint32_t now = c < 0 ? pi::FX_OUTSIDE_DEFAULT : uint32_t(c);
                                                      m->fxChosen = int32_t((now ^ (1u << t)) & 0xffffu);
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
