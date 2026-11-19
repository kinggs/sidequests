# The Rack plugin. `make install` builds the Rust core, then the C++, then puts the plugin in
# Rack's user folder: P3's one step. The Rack SDK lives outside the repo (PLAN.md, Machine state).
RACK_DIR ?= $(HOME)/.local/opt/Rack-SDK-2.6.6

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

include $(RACK_DIR)/plugin.mk

# cargo decides for itself whether anything changed, so always ask it.
.PHONY: FORCE
$(PI_LIB): FORCE
	$(MAKE) --no-print-directory -C .. rack-lib T=$(RUST_TARGET)

# The fixtures and their traces, as C++ initialisers. Never retyped by hand.
build/fixtures.inc: fixtures.jq $(wildcard ../fixtures/*.json)
	@mkdir -p build
	jq -r -f fixtures.jq ../fixtures/*.json > $@
build/src/Probe.cpp.o: build/fixtures.inc

# P3 ⚠ (PROOFS.md P1): the plugin must not need Rust's unwinder, and the core must be inside it.
all: check-link
.PHONY: check-link
check-link: $(TARGET)
	@if nm -D --undefined-only $(TARGET) | grep -E 'rust_eh_personality|_Unwind_Resume.*rust|__rust' ; then echo "P3: the plugin needs a Rust runtime symbol"; exit 1; fi
	@nm -D --defined-only $(TARGET) | grep -q ' T pi_process$$' || { echo "P3: pi_process is not in the plugin"; exit 1; }
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
