#!/bin/sh
# P5, the half that needs no VCV and no second machine: the static library for one Rack
# target, checked against what VCV's toolchain builds for (REFERENCES.md R16).
#
#   targets.sh <rust triple> <libpi_core.a>
#
# It looks only at OUR object in the archive. The rest is Rust's precompiled
# compiler_builtins, which a linker takes members from only if asked (PROOFS.md P1).
#   - the object is the right kind for the target (ELF, COFF for MinGW, Mach-O);
#   - it asks the platform for nothing but libc's memory routines, which every glibc since
#     2.2.5, every msvcrt and every libSystem has (the list is below, by platform);
#   - on x64, no instruction newer than Nehalem (Rack's -march=nehalem);
#   - on macOS, the version the object says it needs. Rack asks for 10.9. rustc will not go
#     below 10.12 (11.0 on Apple Silicon), so this prints the gap and fails only if the
#     number moves: the gap is a finding (PROOFS.md P5), not something this script can close.
#
# It cannot link a plugin for another platform or load one in Rack: that is the other half.
# SPDX-License-Identifier: MIT
set -eu
triple=$1
lib=$2
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "P5 $triple: $1"; exit 1; }

member=$(llvm-ar t "$lib" | grep '^pi_core-' || true)
[ "$(echo "$member" | grep -c .)" = 1 ] || fail "expected one object of ours in the archive"
(cd "$tmp" && llvm-ar x "$lib" "$member")
obj="$tmp/$member"

kind=$(file -b "$obj")
case $triple in
x86_64-unknown-linux-gnu) want='ELF 64-bit LSB relocatable, x86-64' ;;
x86_64-pc-windows-gnu) want='x86-64 COFF object' ;;
x86_64-apple-darwin) want='Mach-O 64-bit x86_64 object' ;;
aarch64-apple-darwin) want='Mach-O 64-bit arm64 object' ;;
*) fail "not a Rack target" ;;
esac
case $kind in "$want"*) ;; *) fail "the object is '$kind', not $want" ;; esac

needs=$(llvm-nm --undefined-only "$obj" | awk '{print $NF}' | sed 's/^_//' | sort -u | tr '\n' ' ')
for sym in $needs; do
    case $triple:$sym in
    *:memcpy | *:memset | *:memmove | *:memcmp | *:bcmp | *:abort) ;;
    # macOS only: the compiler's own spellings of memset. Both are in libSystem on every
    # macOS Rack runs on (memset_pattern16 since 10.5). First met when the core got its
    # voice parameters, which are filled with a 16-bit pattern (Session 3).
    *-apple-darwin:__bzero | *-apple-darwin:memset_pattern16) ;;
    *) fail "the core's object needs $sym" ;;
    esac
done

note=""
case $triple in
x86_64-*)
    # Everything after Nehalem that a compiler reaches for: AVX and later (v-prefixed, wide
    # registers), BMI1/2, LZCNT, MOVBE, ADX, FMA, and the Westmere AES and CLMUL sets.
    newer=$(llvm-objdump -d --no-show-raw-insn "$obj" | awk '$1 ~ /:$/ && NF >= 2' |
        grep -E '[[:space:]](v[a-z0-9]+|andn|bextr|blsi|blsmsk|blsr|bzhi|mulx|pdep|pext|rorx|sarx|shlx|shrx|tzcnt|lzcnt|movbe|adcx|adox|aes[a-z]+|pclmul[a-z]+)[a-z]?[[:space:]]|%[yz]mm' | head -3 || true)
    [ -z "$newer" ] || fail "an instruction newer than Nehalem: $newer"
    note="no instruction newer than Nehalem"
    ;;
esac
case $triple in
*-apple-darwin)
    min=$(llvm-otool -l "$obj" | awk '/LC_VERSION_MIN_MACOSX/ {f=1} /LC_BUILD_VERSION/ {f=1} f && ($1 == "version" || $1 == "minos") {print $2; exit}')
    case $triple in x86_64-*) floor=10.12 ;; *) floor=11.0 ;; esac
    [ "$min" = "$floor" ] || fail "the object needs macOS $min; rustc's floor was $floor when this was written"
    case $triple in
    x86_64-*) note="$note; needs macOS $min, Rack asks for 10.9: NOT MET, by rustc's own floor" ;;
    *) note="needs macOS $min, the first macOS there was for Apple Silicon" ;;
    esac
    ;;
esac
echo "P5 $triple: $(echo "$kind" | cut -d, -f1-2 | cut -c1-40); needs only: $needs${note:+; $note}"
