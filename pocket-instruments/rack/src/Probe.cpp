// P3's module: a blank panel, CLOCK in, RESET in, GATE out, AUDIO out, the Rust core called
// once a sample.
// Not an instrument. It plays one of the P2 fixtures round and round and checks every pass
// against that fixture's trace, so "the gate matches the fixture" is counted as well as seen.
//
//   CLOCK patched: the core follows the edges (one edge, one step), as fixtures/README.md's
//                  edges run does. Unpatched: its own table clock at the fixture's tempo.
//   RESET:         starts the fixture again. CLOCK is ignored for 1 ms after it (R34).
//   GATE:          10 V from each firing of one track, for half a step.
//   AUDIO:         the core's mix (ENGINE.md §11; its level, D48): 5 V to 1.0, bent by tanh
//                  towards 10 V so it never passes it (RACK-RULES.md).
//                  The fixtures fire tracks 0 to 3, so it plays the bass drum, snare and hats.
//                  Each track plays its code voice or its starter-pack sample (D50): the
//                  right-click menu's Sounds, saved with the patch. All code to start.
//                  ⚠ Each pass starts a fresh engine, so a drum still sounding is cut there.
//   The light:     green while every pass so far has matched, red once one has not.
//
// The module also keeps a snapshot ready for Rack to save while it plays (P6), by the scheme
// in handoff.hpp. Nothing on the audio thread allocates, locks or logs.
//
// SPDX-License-Identifier: MIT
#include <rack.hpp>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>

#include "handoff.hpp"
#include "pi_engine.h"

using namespace rack;
extern Plugin *pluginInstance;

struct FixtureCmd {
    uint32_t at;
    uint8_t type, a, b;
    uint32_t value;
};
struct Fixture {
    const char *name;
    uint32_t seed, mbpm, steps;
    std::vector<FixtureCmd> cmds;
    std::vector<pi_event> expect;
};
// Made from ../fixtures/*.json by the Makefile. The traces are not retyped anywhere.
static const std::vector<Fixture> FIXTURES = {
#include "fixtures.inc"
};

// The starter pack's names, in track order, for the menu (samples/tracks.txt has the files).
static const char *const KEY_NAMES[PI_TRACKS] = {"Bass drum", "Snare", "Closed hat", "Open hat", "Synth snare", "Sticks",
    "Cymbal", "Noise", "Clap", "Click", "Low tom", "High tom", "Cow bell", "Blip", "Tone", "Bass tone"};

// A snapshot and how many of its bytes are real. A patch saved before ABI 5 holds version 1,
// 316 bytes (PI_SNAPSHOT_SIZE_V1): pi_load takes it if it is passed the length read. Until
// Session 11 this was a fixed PI_SNAPSHOT_SIZE, which dropped such a patch's beat unread.
struct Snap {
    uint8_t b[PI_SNAPSHOT_SIZE];
    uint32_t len = 0;
};

struct Probe : Module {
    enum ParamId { PARAMS_LEN };
    enum InputId { CLOCK_INPUT, RESET_INPUT, INPUTS_LEN };
    enum OutputId { GATE_OUTPUT, AUDIO_OUTPUT, OUTPUTS_LEN };
    enum LightId { PASS_LIGHT, FAIL_LIGHT, LIGHTS_LEN };

    // The other thread's side. Read or written there; the audio thread only loads or stores.
    std::atomic<int> fixtureWanted{3}, track{2};
    std::atomic<uint32_t> sampledWanted{0}; // bit t: track t plays its sample (D50)
    std::atomic<uint32_t> passed{0}, failed{0}, aborted{0}, rateChanges{0}, loadsOk{0}, loadsRefused{0},
        dropped{0}, published{0}, failRun{0}, failIndex{0}, failGot{0}, lastRate{0},
        peakMillivolts{0}, notFinite{0};
    pi::Latest<Snap> saved; // audio thread writes, Rack's saving thread reads
    pi::Latest<Snap> inbox; // Rack's loading thread writes, audio thread reads

    // The audio thread's own.
    alignas(16) uint8_t mem[4096]; // the engine is 3 568 bytes since §20 (2 328 with a sample beside each voice)
    // The starter pack, read once when the module is made, before any audio. The engine reads
    // these for as long as the module lives (pi_set_sample's contract); nothing changes them.
    std::vector<int16_t> pack[PI_TRACKS];
    uint32_t sampledSent = 0;
    int packLoaded = 0;
    pi_engine *e = nullptr;
    dsp::SchmittTrigger clockTrig, resetTrig;
    int fixture = -1;
    uint32_t rate = 0, sinceReset = 0, generation = 0;
    bool running = false, edges = false, mismatch = false, mustPublish = false;
    uint32_t m = 0, got = 0;                  // the next run step; events seen this pass
    uint64_t frameInRun = 0, nextStep = 0;    // table clock: where the next step falls
    uint64_t anchor = 0, anchorStep = 0;      // fixtures/README.md, "A reset"
    uint64_t lastStepAt = 0, stepLen = 0;
    uint32_t gate = 0;
    float audio = 0.f; // the last frame's mix, held between passes

    Probe() {
        config(PARAMS_LEN, INPUTS_LEN, OUTPUTS_LEN, LIGHTS_LEN);
        configInput(CLOCK_INPUT, "Clock");
        configInput(RESET_INPUT, "Reset");
        configOutput(GATE_OUTPUT, "Gate");
        configOutput(AUDIO_OUTPUT, "Audio");
        if (pi_abi_version() != PI_ABI_VERSION || pi_size() > sizeof mem) {
            WARN("Pocket Instruments: the core is not the one this plugin was built for");
            return;
        }
        loadPack();
        e = pi_init(mem, sizeof mem, 48000, 1);
        givePack();
    }

    // res/samples/ in the plugin: samples/raw/ as the Makefile copied it, in tracks.txt's order.
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

    // Every pi_init starts the engine with no samples and every track on code.
    void givePack() {
        for (uint32_t t = 0; t < PI_TRACKS; t++)
            if (!pack[t].empty()) pi_set_sample(e, t, pack[t].data(), uint32_t(pack[t].size()));
        sampledSent = 0;
    }

    ~Probe() { report("removed"); }

    void report(const char *when) {
        INFO("Pocket Instruments probe (%s): %u passes matched, %u did not, %u cut short; rate %u Hz, "
             "%u rate changes, %u events dropped, %u snapshots published, %u loaded, %u refused; "
             "audio peak %.2f V, %u samples not finite; %d of 16 samples found, %d tracks on samples",
             when, passed.load(), failed.load(), aborted.load(), lastRate.load(), rateChanges.load(),
             dropped.load(), published.load(), loadsOk.load(), loadsRefused.load(),
             peakMillivolts.load() / 1000.0, notFinite.load(), packLoaded, __builtin_popcount(sampledWanted.load()));
        if (failed.load())
            INFO("Pocket Instruments probe: first mismatch in pass %u at event %u (got tick<<8|type|track: %u)",
                 failRun.load(), failIndex.load(), failGot.load());
    }

    static uint64_t stepFrame(uint64_t n, uint32_t rate, uint32_t mbpm) {
        return (n * rate * 15000 + mbpm - 1) / mbpm; // F(n), fixtures/README.md
    }

    void verdict() {
        const Fixture &fx = FIXTURES[fixture];
        if (mismatch || got != fx.expect.size()) {
            if (!mismatch && failed == 0) {
                failRun = passed + 1;
                failIndex = got;
                failGot = 0xffffffffu; // the pass ended short
            }
            failed++;
        } else passed++;
    }

    void process(const ProcessArgs &args) override {
        if (!e) return;
        uint32_t r = uint32_t(std::lround(args.sampleRate));
        bool nowEdges = inputs[CLOCK_INPUT].isConnected();
        bool resetIn = resetTrig.process(inputs[RESET_INPUT].getVoltage(), 0.1f, 2.f);
        bool clockIn = clockTrig.process(inputs[CLOCK_INPUT].getVoltage(), 0.1f, 2.f);
        if (resetIn) sinceReset = 0;
        else if (sinceReset < 0xffffffffu) sinceReset++;
        if (sinceReset < r / 1000) clockIn = false;

        // Between blocks: whatever ends the pass in hand without a verdict.
        bool cut = resetIn;
        if (r != rate) {
            // On edges the trace must survive a rate change, so the pass carries on.
            // On the table the fixture's frames are worked out from the rate: start again.
            if (rate != 0) {
                pi_set_sample_rate(e, r);
                rateChanges++;
                if (!edges) cut = true;
            }
            rate = r;
            lastRate = r;
        }
        if (const Snap *s = inbox.take()) {
            (pi_load(e, s->b, s->len) == PI_OK ? loadsOk : loadsRefused)++;
            mustPublish = true;
            cut = true;
        }
        if (nowEdges != edges) {
            edges = nowEdges;
            cut = true;
        }
        if (fixtureWanted.load(std::memory_order_relaxed) != fixture) cut = true;
        if (cut && running) {
            aborted++;
            running = false;
        }

        // Does a step begin on this frame? On edges, when the clock says so.
        pi_cmd cmds[64];
        uint32_t n = 0;
        bool boundary = edges ? clockIn : (!running || frameInRun == nextStep);
        if (boundary) {
            if (running && m == FIXTURES[fixture].steps) {
                verdict();
                running = false;
            }
            if (!running) { // a fresh engine, as a harness makes one for every run
                fixture = clamp(fixtureWanted.load(std::memory_order_relaxed), 0, int(FIXTURES.size()) - 1);
                fixtureWanted = fixture;
                const Fixture &fx = FIXTURES[fixture];
                e = pi_init(mem, sizeof mem, rate, fx.seed);
                givePack();
                cmds[n++] = pi_cmd{0, PI_CMD_TEMPO, 0, 0, 0, fx.mbpm};
                cmds[n++] = pi_cmd{0, PI_CMD_SOURCE, 0, 0, 0, edges ? PI_SOURCE_EDGES : PI_SOURCE_TABLE};
                running = true;
                mismatch = false;
                mustPublish = true;
                m = got = 0;
                frameInRun = anchor = anchorStep = 0;
                stepLen = 0;
            }
            const Fixture &fx = FIXTURES[fixture];
            for (const FixtureCmd &c : fx.cmds) {
                if (c.at != m || n >= 63) continue;
                cmds[n++] = pi_cmd{0, c.type, c.a, c.b, 0, c.value};
                if (c.type == PI_CMD_RESET) {
                    anchor = frameInRun;
                    anchorStep = m;
                }
            }
            if (edges) cmds[n++] = pi_cmd{0, PI_CMD_CLOCK, 0, 0, 0, 0};
            m++;
            nextStep = anchor + stepFrame(m - anchorStep, rate, fx.mbpm);
        }

        // Sounds from the menu: a switch is taken at the track's next hit (PI_CMD_VOICE).
        uint32_t want = sampledWanted.load(std::memory_order_relaxed);
        if (running && want != sampledSent) {
            // Only what fits is marked sent; the rest goes on the next frame.
            for (uint32_t t = 0; t < PI_TRACKS && n < 64; t++)
                if ((want ^ sampledSent) >> t & 1) {
                    cmds[n++] = pi_cmd{0, PI_CMD_VOICE, uint8_t(t), 0, 0, want >> t & 1};
                    sampledSent ^= 1u << t;
                }
        }

        if (running) {
            const Fixture &fx = FIXTURES[fixture];
            pi_event ev[PI_EVENTS_MIN];
            uint32_t count = pi_process(e, 1, cmds, n, ev, PI_EVENTS_MIN, &audio, PI_AUDIO_MIX);
            int gateTrack = track.load(std::memory_order_relaxed);
            for (uint32_t i = 0; i < count; i++) {
                const pi_event &x = ev[i];
                if (!mismatch) {
                    bool ok = got < fx.expect.size();
                    if (ok) {
                        const pi_event &w = fx.expect[got];
                        ok = x.tick == w.tick && x.type == w.type && x.track == w.track && x.step == w.step;
                    }
                    if (!ok) {
                        mismatch = true;
                        if (failed == 0) { // keep the first one
                            failRun = passed + 1;
                            failIndex = got;
                            failGot = x.tick << 8 | uint32_t(x.type) << 4 | x.track;
                        }
                    }
                }
                got++;
                if (x.type == PI_EV_STEP) {
                    if (frameInRun > lastStepAt) stepLen = frameInRun - lastStepAt;
                    lastStepAt = frameInRun;
                } else if (x.type == PI_EV_TRIG && x.track == gateTrack) {
                    uint64_t len = stepLen ? stepLen / 2 : rate / 100;
                    gate = uint32_t(std::max<uint64_t>(len, rate / 1000));
                }
            }
            frameInRun++;

            // ENGINE.md §8: when what a snapshot would hold has changed, save into our own
            // buffer and hand it over. The saving thread never touches the engine.
            uint32_t g = pi_generation(e);
            if (g != generation || mustPublish) {
                generation = g;
                mustPublish = false;
                Snap &out = saved.write();
                out.len = pi_save(e, out.b, PI_SNAPSHOT_SIZE);
                if (out.len == PI_SNAPSHOT_SIZE) {
                    saved.publish();
                    published++;
                }
            }
            dropped = pi_dropped(e);
        }

        outputs[GATE_OUTPUT].setVoltage(gate ? 10.f : 0.f);
        if (gate) gate--;

        // The core's level puts the whole beat near 1.0 but sets no ceiling (D48). 5 V to 1.0,
        // Rack's audio level, then bent by tanh towards 10 V, so nothing passes it (RACK-RULES).
        float v = 5.f * audio;
        if (!std::isfinite(v)) {
            v = 0.f; // never NaN or infinity down a cable (RACK-RULES.md)
            notFinite++;
        }
        v = 10.f * std::tanh(v / 10.f);
        outputs[AUDIO_OUTPUT].setVoltage(running ? v : 0.f);
        uint32_t mv = uint32_t(std::fabs(v) * 1000.f);
        if (running && mv > peakMillivolts.load(std::memory_order_relaxed)) peakMillivolts.store(mv, std::memory_order_relaxed);
        bool bad = failed.load(std::memory_order_relaxed) != 0;
        lights[PASS_LIGHT].setBrightness(!bad && passed.load(std::memory_order_relaxed) ? 1.f : 0.f);
        lights[FAIL_LIGHT].setBrightness(bad ? 1.f : 0.f);
    }

    // Rack calls these on its own thread while process() runs on the audio thread.
    json_t *dataToJson() override {
        json_t *root = json_object();
        json_object_set_new(root, "fixture", json_string(FIXTURES[clamp(fixtureWanted.load(), 0, int(FIXTURES.size()) - 1)].name));
        json_object_set_new(root, "track", json_integer(track.load()));
        json_object_set_new(root, "samples", json_integer(sampledWanted.load()));
        if (const Snap *s = saved.latest())
            json_object_set_new(root, "snapshot", json_string(string::toBase64(s->b, s->len).c_str()));
        json_t *p3 = json_object();
        json_object_set_new(p3, "passed", json_integer(passed.load()));
        json_object_set_new(p3, "failed", json_integer(failed.load()));
        json_object_set_new(p3, "cutShort", json_integer(aborted.load()));
        json_object_set_new(p3, "rate", json_integer(lastRate.load()));
        json_object_set_new(p3, "rateChanges", json_integer(rateChanges.load()));
        json_object_set_new(p3, "dropped", json_integer(dropped.load()));
        json_object_set_new(p3, "published", json_integer(published.load()));
        json_object_set_new(p3, "loaded", json_integer(loadsOk.load()));
        json_object_set_new(p3, "refused", json_integer(loadsRefused.load()));
        json_object_set_new(p3, "audioPeakMillivolts", json_integer(peakMillivolts.load()));
        json_object_set_new(p3, "audioNotFinite", json_integer(notFinite.load()));
        json_object_set_new(root, "p3", p3);
        return root;
    }

    void dataFromJson(json_t *root) override {
        if (json_t *j = json_object_get(root, "fixture"))
            for (size_t i = 0; i < FIXTURES.size(); i++)
                if (json_is_string(j) && FIXTURES[i].name == std::string(json_string_value(j))) fixtureWanted = int(i);
        if (json_t *j = json_object_get(root, "track")) track = clamp(int(json_integer_value(j)), 0, int(PI_TRACKS) - 1);
        if (json_t *j = json_object_get(root, "samples")) sampledWanted = uint32_t(json_integer_value(j)) & 0xffffu;
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
                inbox.publish();
            }
        }
    }
};

struct ProbeWidget : ModuleWidget {
    uint32_t seenPassed = 0, seenFailed = 0;

    ProbeWidget(Probe *module) {
        setModule(module);
        box.size = Vec(RACK_GRID_WIDTH * 4, RACK_GRID_HEIGHT);
        float x = box.size.x / 2;
        addChild(createLightCentered<MediumLight<GreenRedLight>>(Vec(x, 60), module, Probe::PASS_LIGHT));
        addInput(createInputCentered<PJ301MPort>(Vec(x, 140), module, Probe::CLOCK_INPUT));
        addInput(createInputCentered<PJ301MPort>(Vec(x, 200), module, Probe::RESET_INPUT));
        addOutput(createOutputCentered<PJ301MPort>(Vec(x, 280), module, Probe::GATE_OUTPUT));
        addOutput(createOutputCentered<PJ301MPort>(Vec(x, 330), module, Probe::AUDIO_OUTPUT));
    }

    // The blank panel: one flat fill. The look is design/'s and is not built yet (D15).
    void draw(const DrawArgs &args) override {
        nvgBeginPath(args.vg);
        nvgRect(args.vg, 0, 0, box.size.x, box.size.y);
        nvgFillColor(args.vg, nvgRGB(0x26, 0x26, 0x26));
        nvgFill(args.vg);
        ModuleWidget::draw(args);
    }

    // The log is written here, on Rack's thread, never on the audio thread.
    void step() override {
        if (Probe *p = getModule<Probe>()) {
            uint32_t ok = p->passed.load(), bad = p->failed.load();
            if (bad != seenFailed || ok >= seenPassed + 16) {
                seenPassed = ok;
                seenFailed = bad;
                p->report("playing");
            }
        }
        ModuleWidget::step();
    }

    void appendContextMenu(Menu *menu) override {
        Probe *p = getModule<Probe>();
        if (!p) return;
        menu->addChild(new MenuSeparator);
        menu->addChild(createMenuLabel(string::f("%u passes matched, %u did not", p->passed.load(), p->failed.load())));
        menu->addChild(createSubmenuItem("Fixture", FIXTURES[p->fixtureWanted.load()].name, [=](Menu *sub) {
            for (size_t i = 0; i < FIXTURES.size(); i++)
                sub->addChild(createCheckMenuItem(FIXTURES[i].name, "", [=]() { return p->fixtureWanted.load() == int(i); },
                                                  [=]() { p->fixtureWanted = int(i); }));
        }));
        menu->addChild(createSubmenuItem("Sounds", "", [=](Menu *sub) {
            sub->addChild(createMenuItem("All code", "", [=]() { p->sampledWanted = 0; }));
            sub->addChild(createMenuItem("All samples", "", [=]() { p->sampledWanted = 0xffffu; }));
            sub->addChild(new MenuSeparator);
            for (int i = 0; i < int(PI_TRACKS); i++)
                sub->addChild(createCheckMenuItem(string::f("%d %s: sample", i + 1, KEY_NAMES[i]), "",
                                                  [=]() { return (p->sampledWanted.load() >> i & 1) != 0; },
                                                  [=]() { p->sampledWanted ^= 1u << i; }));
        }));
        menu->addChild(createSubmenuItem("Gate follows track", string::f("%d", p->track.load()), [=](Menu *sub) {
            for (int i = 0; i < int(PI_TRACKS); i++)
                sub->addChild(createCheckMenuItem(string::f("%d", i), "", [=]() { return p->track.load() == i; },
                                                  [=]() { p->track = i; }));
        }));
    }
};

Model *modelProbe = createModel<Probe, ProbeWidget>("Probe");
