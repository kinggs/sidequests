// SPDX-License-Identifier: MIT
#include <rack.hpp>

rack::Plugin *pluginInstance;
extern rack::Model *modelProbe;

void init(rack::Plugin *p) {
    pluginInstance = p;
    p->addModel(modelProbe);
}
