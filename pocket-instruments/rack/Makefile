# The Rack plugin. `make install` builds the Rust core, then the C++, then puts the plugin in
# Rack's user folder: P3's one step. The Rack SDK lives outside the repo (PLAN.md, Machine state).
RACK_DIR ?= $(HOME)/.local/opt/Rack-SDK-2.6.6

# The maths flags, shared with rack/test/jacks.cpp (math.mk says why). compile.mk appends
# EXTRA_FLAGS after its own, so ours win.
include math.mk
EXTRA_FLAGS += $(OUR_MATH)

# Which Rust target goes with the Rack target the SDK is about to pick (its arch.mk).
include $(RACK_DIR)/arch.mk
RUST_TARGET_lin-x64   := x86_64-unknown-linux-gnu
RUST_TARGET_win-x64   := x86_64-pc-windows-gnu
RUST_TARGET_mac-x64   := x86_64-apple-darwin
RUST_TARGET_mac-arm64 := aarch64-apple-darwin
RUST_TARGET := $(RUST_TARGET_$(ARCH_NAME))
ifeq ($(RUST_TARGET),)
$(error No Rust target for Rack's $(ARCH_NAME))
endif
PI_LIB := ../target/$(RUST_TARGET)/release/libpi_core.a

FLAGS += -I../core/include -Ibuild
SOURCES += $(wildcard src/*.cpp)
# After our objects, so the linker takes from the archive only what they ask for.
OBJECTS += $(PI_LIB)

# D50: the starter pack ships inside the plugin, as the engine reads it (samples/raw/),
# copied in at build time so the repo holds one copy.
PACK := $(patsubst ../samples/raw/%,res/samples/%,$(wildcard ../samples/raw/*.s16)) res/samples/tracks.txt
# The Rhythm module's panel (design/make_panel.py draws it) and its typeface with the licence.
PACK += res/panel.svg res/fonts/JetBrainsMono-ExtraBold.ttf res/fonts/OFL.txt
# D77 item 5: the MIT notice of the stmlib and Plaits code the effects port, beside the OFL.
PACK += res/stmlib-plaits-MIT.txt
DISTRIBUTABLES += res

include $(RACK_DIR)/plugin.mk

all: $(PACK)
dist: $(PACK)
res/samples/%: ../samples/raw/%
	@mkdir -p res/samples
	cp $< $@
res/samples/tracks.txt: ../samples/tracks.txt
	@mkdir -p res/samples
	cp $< $@
res/panel.svg: ../design/panel.svg
	@mkdir -p res
	cp $< $@
res/fonts/%: ../design/fonts/%
	@mkdir -p res/fonts
	cp $< $@
res/stmlib-plaits-MIT.txt: ../core/stmlib-plaits-MIT.txt
	@mkdir -p res
	cp $< $@

# cargo decides for itself whether anything changed, so always ask it.
.PHONY: FORCE
$(PI_LIB): FORCE
	$(MAKE) --no-print-directory -C .. rack-lib T=$(RUST_TARGET)

# The fixtures and their traces, as C++ initialisers. Never retyped by hand.
# One jq a file: given them all at once, jq's exit status is the last file's alone, so a
# fixture it refused in the middle of the list was dropped and the build went on (found in
# Session 10, when CI built happily past three "not fixture format 1" errors).
build/fixtures.inc: fixtures.jq $(wildcard ../fixtures/*.json)
	@mkdir -p build
	@rm -f $@
	for f in ../fixtures/*.json; do jq -r -f fixtures.jq "$$f" || exit 1; done > $@.tmp
	mv $@.tmp $@
build/src/Probe.cpp.o: build/fixtures.inc

# The same for the Rhythm module's self-test: the format 2 fixtures, with their views.
build/rhythm-fixtures.inc: rhythm.jq $(wildcard ../fixtures/*.json)
	@mkdir -p build
	@rm -f $@
	for f in ../fixtures/*.json; do jq -r -f rhythm.jq "$$f" || exit 1; done > $@.tmp
	mv $@.tmp $@
build/src/Rhythm.cpp.o: build/rhythm-fixtures.inc

# The build stamp: the commit, and when pocket-instruments/ holds changes not committed,
# "-dirty" and the minute it was built. Rack's log says it at load and each module's menu
# shows it, so a restarted Rack can be checked against `git log`. stamp.inc is replaced only
# when the stamp changes, so a clean tree does not rebuild; outside git it says "unknown".
STAMP := $(shell git rev-parse --short=7 HEAD 2>/dev/null || echo unknown)$(shell test -n "$$(git status --porcelain -- .. 2>/dev/null)" && date '+-dirty %Y-%m-%d %H:%M')
build/stamp.inc: FORCE
	@mkdir -p build
	@echo '#define PI_BUILD "$(STAMP)"' > build/stamp.new
	@cmp -s build/stamp.new $@ || cp build/stamp.new $@
build/src/plugin.cpp.o: build/stamp.inc

# P3 ⚠ (PROOFS.md P1): the plugin must not need Rust's unwinder, and the core must be inside it.
# On every target CI links (P5). Linux asks the dynamic table. A DLL has none to ask, but the
# linked file keeps its COFF symbols until `dist` strips its copy. On macOS the plugin links
# with -undefined dynamic_lookup, so a missing symbol links anyway and only this check sees
# it; Mach-O names carry a leading underscore.
ifdef ARCH_LIN
PI_NM := nm -D
else
PI_NM := nm
endif
all: check-link
.PHONY: check-link
check-link: $(TARGET)
	@if $(PI_NM) --undefined-only $(TARGET) | grep -E 'rust_eh_personality|_Unwind_Resume.*rust|__rust' ; then echo "P3: the plugin needs a Rust runtime symbol"; exit 1; fi
	@$(PI_NM) --defined-only $(TARGET) | grep -qE ' T _?pi_process$$' || { echo "P3: pi_process is not in the plugin"; exit 1; }
	@echo "P3: $(TARGET) holds the core and needs no Rust runtime symbol."

# Rack itself, headless, on four probes at three sample rates. See selftest.sh.
.PHONY: selftest
selftest:
	./selftest.sh 12 44100
	./selftest.sh 12 48000
	./selftest.sh 12 96000

# The patch the owner opens for P3: a Fundamental LFO's square as the clock into one probe
# (swing-length-change, track 2) and a second probe on its own clock (straight-sixteenths,
# track 0), both into a Scope; and a quiet sine to the audio module, so a dropout is heard.
.PHONY: patch
patch: build/P3.vcv
build/P3.vcv: patch/patch.json
	@mkdir -p build
	tar -C patch -c patch.json | zstd -q -f -o $@

# The patch for hearing the drums: one probe on its own clock playing straight-sixteenths
# (bass drum on the beat, snare on two and four, closed hats on every sixteenth), its AUDIO
# into both sides of the audio module. Choose the PulseAudio driver there (PLAN.md).
.PHONY: sound
sound: build/Sound.vcv
build/Sound.vcv: patch/sound.json
	@mkdir -p build
	tar -C patch --transform 's/^sound.json$$/patch.json/' -c sound.json | zstd -q -f -o $@
