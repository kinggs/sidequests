# Pocket Instruments. `make build` is P1's one command; `make test` is P2.
# The repo's `make verify` runs `make test` here when cargo is on the PATH.

NATIVE := target/release/libpi_core.a
WASM   := target/wasm32-unknown-unknown/release/pi_core.wasm
REPORT := $(CURDIR)/target/report
CXX    ?= c++

.PHONY: build test check-toolchain check-p1 clean rack-lib

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
RACK_RUSTFLAGS_aarch64 :=
rack-lib: check-toolchain
	@rustup target list --installed | grep -qx $(T) || rustup target add $(T)
	RUSTFLAGS="$(RACK_RUSTFLAGS_$(firstword $(subst -, ,$(T))))" MACOSX_DEPLOYMENT_TARGET=10.9 \
	  cargo rustc -p pi-core --release --locked --target $(T) --crate-type staticlib

# The same fixtures through the core three ways. Each harness also writes every trace it
# produced to a report; the three reports must be the same bytes.
test: build check-p1
	PI_REPORT=$(REPORT)-rust.txt cargo test -p pi-core --locked -q
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Werror -Icore/include harness/harness.cpp $(NATIVE) -o target/harness
	target/harness fixtures $(REPORT)-cpp.txt
	PI_REQUIRE_WASM=1 PI_REPORT=$(REPORT)-node.txt node --test harness/
	cmp $(REPORT)-rust.txt $(REPORT)-cpp.txt
	cmp $(REPORT)-rust.txt $(REPORT)-node.txt
	@echo "Pocket Instruments: three harnesses, $$(grep -c '^#' $(REPORT)-rust.txt) runs each, one report ($$(sha256sum < $(REPORT)-rust.txt | cut -c1-16))."

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
