// SPDX-License-Identifier: MIT
#include <rack.hpp>

rack::Plugin *pluginInstance;
extern rack::Model *modelProbe;
extern rack::Model *modelRhythm;

void init(rack::Plugin *p) {
    pluginInstance = p;
    p->addModel(modelProbe);
    p->addModel(modelRhythm);
}
