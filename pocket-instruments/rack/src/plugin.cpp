// SPDX-License-Identifier: MIT
#include <rack.hpp>
#include "stamp.inc" // build/, from the Makefile: the commit this plugin was built from

rack::Plugin *pluginInstance;
extern rack::Model *modelProbe;
extern rack::Model *modelRhythm;
extern const char *const pi_build = PI_BUILD; // each module's menu shows it

void init(rack::Plugin *p) {
    pluginInstance = p;
    INFO("Pocket Instruments build %s", pi_build);
    p->addModel(modelProbe);
    p->addModel(modelRhythm);
}
