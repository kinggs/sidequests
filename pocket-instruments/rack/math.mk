# The maths flags the plugin is built with, in one place, so rack/test/jacks.cpp is built with
# the same ones (../Makefile's test). RACK_MATH is what the Rack SDK's compile.mk sets; OUR_MATH
# goes after it (through EXTRA_FLAGS, which compile.mk appends last) and takes back the two
# parts of -funsafe-math-optimizations that change bits: regrouping a sum, and x / 5 becoming
# x * 0.2. Without them RETURN's mix is not the core's (D62; found in Session 13).
RACK_MATH := -O3 -funsafe-math-optimizations
OUR_MATH := -fno-associative-math -fno-reciprocal-math
