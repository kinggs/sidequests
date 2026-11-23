# Pocket Instruments. `make build` is P1's one command; `make test` is P2.
# The repo's `make verify` runs `make test` here when cargo is on the PATH.

NATIVE := target/release/libpi_core.a
WASM   := target/wasm32-unknown-unknown/release/pi_core.wasm
REPORT := $(CURDIR)/target/report
CXX    ?= c++
# rack/test/jacks.cpp is built with the plugin's own maths flags (rack/math.mk) and Rack's CPU.
include rack/math.mk
RACK_ARCH := $(if $(filter x86_64,$(shell uname -m)),-march=nehalem,-march=armv8-a+fp+simd)

.PHONY: build test check-toolchain check-p1 clean rack-lib race targets web p4 listen play bench

# Both targets from one crate, one crate type each: a static library for Rack and the C++
# harness, a bare module for the browser and Node.
build: check-toolchain
	cargo rustc -p pi-core --release --locked --crate-type staticlib
	cargo rustc -p pi-core --release --locked --target wasm32-unknown-unknown --crate-type cdylib

# The static library for one Rack target, with Rack's own CPU flags (R16; the SDK's
# compile.mk: -march=nehalem on x64, plain armv8-a on arm64, macOS 10.9 as the floor).
# `make rack-lib T=<rust triple>`. rack/Makefile calls this before it links. It lands in
# target/<triple>/release, apart from the host build above, so the two never rebuild each other.
T ?= x86_64-unknown-linux-gnu
RACK_RUSTFLAGS_x86_64  := -C target-cpu=nehalem
RACK_RUSTFLAGS_aarch64 := -C target-cpu=generic
rack-lib: check-toolchain
	@rustup target list --installed | grep -qx $(T) || rustup target add $(T)
	RUSTFLAGS="$(RACK_RUSTFLAGS_$(firstword $(subst -, ,$(T))))" MACOSX_DEPLOYMENT_TARGET=10.9 \
	  cargo rustc -p pi-core --release --locked --target $(T) --crate-type staticlib

# P5, the local half: the library for all four Rack targets from this machine, each checked
# against R16 (harness/targets.sh). A staticlib needs no linker and no SDK, only rustup's
# copy of each target's core library, so this runs anywhere `make build` does. Not part of
# `make test`: the first run downloads three targets.
RACK_TARGETS := x86_64-unknown-linux-gnu x86_64-pc-windows-gnu x86_64-apple-darwin aarch64-apple-darwin
targets:
	@for t in $(RACK_TARGETS); do \
	  $(MAKE) --no-print-directory rack-lib T=$$t >/dev/null 2>&1 || { echo "P5 $$t: did not build"; exit 1; }; \
	  sh harness/targets.sh $$t $(CURDIR)/target/$$t/release/libpi_core.a || exit 1; \
	done

# The same fixtures through the core three ways. Each harness also writes every trace it
# produced to a report; the three reports must be the same bytes.
# Then every voice: each harness/render-*.json scenario rendered by the C++ harness on the
# static library and by Node on the .wasm, each pair held to the same bytes by
# harness/compare.mjs (--same: the rule D44 and D46 set, stricter than P7's -80 dB bar).
SCENARIOS := $(patsubst harness/render-%.json,%,$(wildcard harness/render-*.json))
# A scenario that names "layouts" (render-both.json, §15) is also rendered at 16 and 17
# channels, each harness holding the three to each other; here each is held to its pair.
LAYOUTS := $(patsubst harness/render-%.json,%,$(shell grep -l '"layouts"' harness/render-*.json))
test: build check-p1
	PI_REPORT=$(REPORT)-rust.txt cargo test -p pi-core --locked -q
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/harness.cpp $(NATIVE) -o target/harness
	target/harness fixtures $(REPORT)-cpp.txt
	PI_REQUIRE_WASM=1 PI_REPORT=$(REPORT)-node.txt PI_RENDER=$(CURDIR)/target/render-node node --test harness/
	$(CXX) -std=c++11 $(RACK_MATH) $(OUR_MATH) $(RACK_ARCH) -Wall -Wextra -Werror -Icore/include rack/test/jacks.cpp $(NATIVE) -o target/jacks
	target/jacks
	cmp $(REPORT)-rust.txt $(REPORT)-cpp.txt
	cmp $(REPORT)-rust.txt $(REPORT)-node.txt
	@echo "Pocket Instruments: three harnesses, $$(grep -c '^#' $(REPORT)-rust.txt) runs each, one report ($$(sha256sum < $(REPORT)-rust.txt | cut -c1-16))."
	@for s in $(SCENARIOS); do target/harness --render harness/render-$$s.json target/render-cpp-$$s || exit 1; done
	node harness/compare.mjs --same $(foreach n,$(SCENARIOS),$(foreach s,table edges,$(foreach r,44100 48000 96000,target/render-cpp-$(n)-$(s)-$(r).f32 target/render-node-$(n)-$(s)-$(r).f32))) \
	  $(foreach n,$(LAYOUTS),$(foreach s,table edges,$(foreach r,44100 48000 96000,$(foreach c,16ch 17ch,target/render-cpp-$(n)-$(s)-$(r)-$(c).f32 target/render-node-$(n)-$(s)-$(r)-$(c).f32))))
	@cmp -s $(WASM) web/pi_core.wasm || { echo "web/pi_core.wasm is not the .wasm just built: run 'make web' and commit it"; exit 1; }
	@if command -v clang++ >/dev/null; then $(MAKE) --no-print-directory race; else echo "P6's ThreadSanitizer run skipped: no clang++."; fi

# P6, the ThreadSanitizer half: the core on one thread while another edits, loads and takes
# snapshots. harness/race.cpp says what is checked and harness/race.sh what must come out.
# Needs `make test` first, for the Node report.
race:
	clang++ -std=c++17 -O1 -g -fsanitize=thread -Wall -Wextra -Werror -Icore/include harness/race.cpp $(NATIVE) -o target/race
	sh harness/race.sh target/race fixtures $(REPORT)-node.txt

# What a frame of pi_process costs, in nanoseconds, on the release library: idle, the minimum
# beat, all sixteen sounds (harness/bench.cpp says how). Not part of `make test`: a number, not
# a pass or fail. A change on the audio path records it before and after (PLAN.md).
bench: build
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/bench.cpp $(NATIVE) -o target/bench
	target/bench

# rust-toolchain.toml is the pin. mise.toml must name the same version, and so must the
# compiler that actually runs: mise sets RUSTUP_TOOLCHAIN, which wins over the file. For the
# same reason rustup does not fetch the file's targets by itself, so the wasm one is added
# here the first time.
check-toolchain:
	@pin="$$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml)"; \
	mise_pin="$$(sed -n 's/^rust = "\(.*\)"/\1/p' mise.toml)"; \
	run="$$(rustc --version | cut -d' ' -f2)"; \
	[ -n "$$pin" ] || { echo "no channel in rust-toolchain.toml"; exit 1; }; \
	[ "$$pin" = "$$mise_pin" ] || { echo "rust-toolchain.toml pins $$pin but mise.toml says $$mise_pin"; exit 1; }; \
	[ "$$pin" = "$$run" ] || { echo "rust-toolchain.toml pins $$pin but rustc is $$run (run: mise install)"; exit 1; }; \
	rustup target list --installed | grep -qx wasm32-unknown-unknown || rustup target add wasm32-unknown-unknown

# P1's pass bar, checked on what was built rather than on what the source says.
# The static library is our one object plus Rust's precompiled compiler_builtins, which a
# linker takes only the members it needs from. So the test is what OUR object asks for:
# libc's memory routines and, if a panic path ever survives, abort. Nothing else.
check-p1:
	@size=$$(stat -c %s $(WASM)); \
	[ $$size -lt 50000 ] || { echo "P1: the .wasm is $$size bytes, over 50 KB"; exit 1; }; \
	if ar t $(NATIVE) | grep -qE '^(alloc|std)-'; then echo "P1: the static library holds alloc or std"; exit 1; fi; \
	wants="$$(nm -A --undefined-only $(NATIVE) 2>/dev/null | grep ':pi_core-' | awk '{print $$NF}' | sort -u | tr '\n' ' ')"; \
	for sym in $$wants; do case $$sym in memcpy|memset|memmove|memcmp|bcmp|abort) ;; \
	  *) echo "P1: the core's object needs $$sym"; exit 1;; esac; done; \
	if cargo tree -p pi-core --locked --edges normal --prefix none | tail -n +2 | grep -q .; then echo "P1: the core has a dependency"; exit 1; fi; \
	echo "P1: pi_core.wasm is $$size bytes. The core's object needs only: $$wants"

clean:
	cargo clean

# The browser page is served as plain files (GitHub Pages builds nothing), so the .wasm it
# loads is committed beside it. The build is reproducible, and `make test` fails if the
# committed copy is not the one just built.
web: build
	cp $(WASM) web/pi_core.wasm

# P4, the desktop half: web/ in headless Chromium and Firefox, its worklet's traces held
# against the Node report (web/desktop.mjs). Real time, about twenty seconds a browser, so
# it is not part of `make test`. Needs `make test` first.
p4:
	node web/desktop.mjs $(REPORT)-node.txt

# The listening page (web/listen.html) in the same two browsers: every key reaches its own
# voice, slider B reaches the engine, the sixteen samples load. About ten seconds a browser.
listen:
	node web/listen.mjs

# The phone page (web/rhythm.html) in the same two browsers: keys entered by pointer events,
# the worklet's trace and views held to the format 2 fixtures, every drawing held to its
# view, a reload, and P6's browser half (web/play.mjs says the bar). About twenty seconds a
# browser. Needs `make test` first, for the Node report.
play:
	node web/play.mjs $(REPORT)-node.txt
