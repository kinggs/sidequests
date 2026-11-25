# Pocket Instruments. `make build` is P1's one command; `make test` is P2.
# The repo's `make verify` runs `make test` here when cargo is on the PATH.

NATIVE := target/release/libpi_core.a
WASM   := target/wasm32-unknown-unknown/release/pi_core.wasm
REPORT := $(CURDIR)/target/report
# The weave's cells for fixtures/weave-views.txt, written by each harness and compared (§16).
WEAVE  := $(CURDIR)/target/weave
CXX    ?= c++
# rack/test/jacks.cpp is built with the plugin's own maths flags (rack/math.mk) and Rack's CPU.
include rack/math.mk
RACK_ARCH := $(if $(filter x86_64,$(shell uname -m)),-march=nehalem,-march=armv8-a+fp+simd)

.PHONY: build test check-toolchain check-p1 clean rack-lib race targets web p4 listen hear play bench pairs fuzz

# Every native library starts each function on a 64-byte line (Session 29, LEARNINGS.md).
# Unpinned, where pi_process happened to land moved the bench by up to 3 ns a frame between
# builds whose differences never ran; pinned, three such builds read within 0.5 ns, and the
# pin cost nothing measured. Given after `--`, so it reaches our crate alone and survives
# rack-lib's RUSTFLAGS. Not the .wasm: WebAssembly has no addresses to align.
ALIGN := -C llvm-args=-align-all-functions=6

# Both targets from one crate, one crate type each: a static library for Rack and the C++
# harness, a bare module for the browser and Node.
build: check-toolchain
	cargo rustc -p pi-core --release --locked --crate-type staticlib -- $(ALIGN)
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
	  cargo rustc -p pi-core --release --locked --target $(T) --crate-type staticlib -- $(ALIGN)

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
# A scenario that names "loops" (render-loop.json, §19) is also rendered in the loop layouts,
# 18 and 50 channels, which are read as well as written: each harness gives them the same inputs.
LOOPS := $(patsubst harness/render-%.json,%,$(shell grep -l '"loops"' harness/render-*.json))
test: build check-p1
	PI_REPORT=$(REPORT)-rust.txt PI_WEAVE=$(WEAVE)-rust.txt cargo test -p pi-core --locked -q
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/harness.cpp $(NATIVE) -o target/harness
	target/harness fixtures $(REPORT)-cpp.txt
	target/harness --weave fixtures/weave-views.txt $(WEAVE)-cpp.txt
	PI_REQUIRE_WASM=1 PI_REPORT=$(REPORT)-node.txt PI_WEAVE=$(WEAVE)-node.txt PI_RENDER=$(CURDIR)/target/render-node node --test harness/
	$(CXX) -std=c++11 $(RACK_MATH) $(OUR_MATH) $(RACK_ARCH) -Wall -Wextra -Werror -Icore/include rack/test/jacks.cpp $(NATIVE) -o target/jacks
	target/jacks
	cmp $(REPORT)-rust.txt $(REPORT)-cpp.txt
	cmp $(REPORT)-rust.txt $(REPORT)-node.txt
	@echo "Pocket Instruments: three harnesses, $$(grep -c '^#' $(REPORT)-rust.txt) runs each, one report ($$(sha256sum < $(REPORT)-rust.txt | cut -c1-16))."
	cmp $(WEAVE)-rust.txt $(WEAVE)-cpp.txt
	cmp $(WEAVE)-rust.txt $(WEAVE)-node.txt
	@echo "The weave (ENGINE.md section 16): $$(grep -c '^#' $(WEAVE)-rust.txt) views, the same cells natively (Rust's tests, C++) and from the .wasm ($$(sha256sum < $(WEAVE)-rust.txt | cut -c1-16))."
	@for s in $(SCENARIOS); do target/harness --render harness/render-$$s.json target/render-cpp-$$s || exit 1; done
	node harness/compare.mjs --same $(foreach n,$(SCENARIOS),$(foreach s,table edges,$(foreach r,44100 48000 96000,target/render-cpp-$(n)-$(s)-$(r).f32 target/render-node-$(n)-$(s)-$(r).f32))) \
	  $(foreach n,$(LAYOUTS),$(foreach s,table edges,$(foreach r,44100 48000 96000,$(foreach c,16ch 17ch,target/render-cpp-$(n)-$(s)-$(r)-$(c).f32 target/render-node-$(n)-$(s)-$(r)-$(c).f32)))) \
	  $(foreach n,$(LOOPS),$(foreach s,table edges,$(foreach r,44100 48000 96000,$(foreach c,18ch 50ch,target/render-cpp-$(n)-$(s)-$(r)-$(c).f32 target/render-node-$(n)-$(s)-$(r)-$(c).f32))))
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
# Pinned to one CPU (BENCH_CPU): on a CPU of two dies, as this laptop's 7950X3D is, a run
# lands on either and reads ~2 ns apart (Session 29). `make pairs OLD=<another bench>` reads
# this build beside another, ten rounds interleaved, medians (harness/pairs.sh).
BENCH_CPU ?= 2
BENCH_PIN := $(if $(shell command -v taskset),taskset -c $(BENCH_CPU))
bench: build
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/bench.cpp $(NATIVE) -o target/bench
	$(BENCH_PIN) target/bench

OLD ?= target/old/bench
pairs: build
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/bench.cpp $(NATIVE) -o target/bench
	sh harness/pairs.sh $(BENCH_CPU) $(OLD) target/bench

# The differential fuzz (D102 item 4; harness/fuzz.cpp says what it covers and does not):
# `make fuzz OLD=<an older libpi_core.a>` builds it on that library and on this build's, runs
# seeds 1 to SEEDS on each, a chunk a CPU, and fails on any seed whose hash differs, naming it
# and how to find its first difference. The only check here that an efficiency change moves no
# byte on inputs no test was written for. Not in `make test`: it needs an older build. The
# harness must not call fmod, which the library carries as a weak symbol (fuzz.cpp's header).
# Session 40 (D105 item 11): a third library, this build with its debug assertions on (the cargo
# profile `guarded`, in its own target folder), runs the same seeds: every seed must finish and
# give fuzz-new's line. A guard that fires aborts its seed (the core's panic is an abort, and it
# has no way to print); the failure names the seed and the command whose backtrace names the guard.
SEEDS ?= 400
FUZZ_JOBS ?= $(shell nproc 2>/dev/null || echo 4)
GUARDED := target/guarded/guarded/libpi_core.a
# The core's panic handler reads nothing, so the guard's message is dropped and every panic in
# `pi_process` shares one call: a backtrace named the ABI's bounds check, not the guard. With
# tail merging off each keeps its own call, and gdb names the line (Session 40, planted).
GUARD_NAMES := -C llvm-args=-enable-tail-merge=false
fuzz: build
	@case "$(OLD)" in *.a) ;; *) echo "make fuzz OLD=<an older libpi_core.a> (OLD is $(OLD))"; exit 1;; esac
	@[ -f "$(OLD)" ] || { echo "make fuzz: no library at $(OLD)"; exit 1; }
	@! cmp -s "$(OLD)" $(NATIVE) || { echo "make fuzz: $(OLD) is this build's own library: nothing to compare (Session 36's review)"; exit 1; }
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/fuzz.cpp $(OLD) -o target/fuzz-old
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/fuzz.cpp $(NATIVE) -o target/fuzz-new
	cargo rustc -p pi-core --profile guarded --locked --target-dir target/guarded --crate-type staticlib -- $(ALIGN) $(GUARD_NAMES)
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/fuzz.cpp $(GUARDED) -o target/fuzz-guarded
	@for b in target/fuzz-old target/fuzz-new target/fuzz-guarded; do \
	  if nm "$$b" | grep -qE ' [TtWw] fmodf?$$'; then echo "make fuzz: $$b defines fmod (fuzz.cpp's header says why it must not)"; exit 1; fi; done
	@mkdir -p target/fuzz-runs
	@for b in old new; do \
	  seq 0 $$(( $(FUZZ_JOBS) - 1 )) | xargs -P $(FUZZ_JOBS) -I{} sh -c \
	    'n=$(SEEDS); j=$(FUZZ_JOBS); a=$$(( 1 + {} * n / j )); z=$$(( 1 + ({} + 1) * n / j )); if [ $$z -gt $$a ]; then target/fuzz-'$$b' $$a $$(( z - a )); fi > target/fuzz-runs/'$$b'-{}.txt' || exit 1; \
	  cat $$(seq -f "target/fuzz-runs/$$b-%g.txt" 0 $$(( $(FUZZ_JOBS) - 1 ))) | sort -n > target/fuzz-$$b.txt; done
	@[ $$(wc -l < target/fuzz-old.txt) -eq $(SEEDS) ] && [ $$(wc -l < target/fuzz-new.txt) -eq $(SEEDS) ] || { echo "make fuzz: a run did not give $(SEEDS) seeds"; exit 1; }
	@seq 0 $$(( $(FUZZ_JOBS) - 1 )) | xargs -P $(FUZZ_JOBS) -I{} sh -c \
	  'n=$(SEEDS); j=$(FUZZ_JOBS); a=$$(( 1 + {} * n / j )); z=$$(( 1 + ({} + 1) * n / j )); if [ $$z -gt $$a ]; then target/fuzz-guarded $$a $$(( z - a )); fi > target/fuzz-runs/guarded-{}.txt' 2>/dev/null || true
	@cat $$(seq -f "target/fuzz-runs/guarded-%g.txt" 0 $$(( $(FUZZ_JOBS) - 1 ))) | sort -n > target/fuzz-guarded.txt
	@if [ $$(wc -l < target/fuzz-guarded.txt) -ne $(SEEDS) ]; then \
	  cut -d' ' -f1 target/fuzz-guarded.txt > target/fuzz-runs/guarded-done.txt; \
	  s=$$(seq 1 $(SEEDS) | grep -vxF -f target/fuzz-runs/guarded-done.txt | head -1); \
	  echo "make fuzz: the guarded build (debug assertions on) did not finish seed $$s: a guard fired. To name it: gdb -batch -ex run -ex bt --args target/fuzz-guarded $$s 1"; \
	  exit 1; \
	fi
	@cmp -s target/fuzz-new.txt target/fuzz-guarded.txt || { echo "make fuzz: the guarded build finished every seed, but these lines are not this build's: $$(paste target/fuzz-new.txt target/fuzz-guarded.txt | awk '$$2 != $$4 { print $$1 }' | head -20 | tr '\n' ' ')"; exit 1; }
	@echo "make fuzz: the guarded build (debug assertions on) finished seeds 1 to $(SEEDS), every line this build's."
	@if cmp -s target/fuzz-old.txt target/fuzz-new.txt; then \
	  echo "make fuzz: seeds 1 to $(SEEDS), the same bytes as $(OLD) on every one."; \
	else \
	  d=$$(paste target/fuzz-old.txt target/fuzz-new.txt | awk '$$1 != $$3 || $$2 != $$4 {print $$1}'); \
	  echo "make fuzz: $$(echo "$$d" | wc -l) of $(SEEDS) seeds differ from $(OLD): $$(echo $$d | cut -c1-200)"; \
	  s=$$(echo "$$d" | head -1); \
	  echo "  the first difference: target/fuzz-old --dump $$s target/fuzz-a && target/fuzz-new --dump $$s target/fuzz-b && python3 -I harness/fuzz-firstdiff.py target/fuzz-a target/fuzz-b"; \
	  exit 1; \
	fi

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
	[ $$size -lt 64000 ] || { echo "P1: the .wasm is $$size bytes, over 64 KB (the bar was 50 KB until D104)"; exit 1; }; \
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

# The same server, left running, to listen by ear in a desktop browser (the voices, the samples,
# and the nine sound effects over the minimum beat): open the address it prints. Ctrl+C to stop.
hear:
	node web/listen.mjs --serve

# The phone page (web/rhythm.html) in the same two browsers: keys entered by pointer events,
# the worklet's trace and views held to the format 2 fixtures, every drawing held to its
# view, a reload, and P6's browser half (web/play.mjs says the bar). About twenty seconds a
# browser. Needs `make test` first, for the Node report.
play:
	node web/play.mjs $(REPORT)-node.txt
