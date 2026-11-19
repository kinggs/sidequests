#!/bin/sh
# P5: one finished plugin, as a user downloads it, held to what Rack's toolchain builds for
# (REFERENCES.md R16). CI runs it on each of the four artefacts; it runs anywhere the
# platform's own binary tools are (objdump on Linux and MSYS2, otool and lipo on macOS).
#
#   check-dist.sh <PocketInstruments-<version>-<platform>.vcvplugin>
#
#   - the archive holds the manifest and one plugin binary of the right kind;
#   - lin-x64: needs no glibc newer than 2.23 and nothing from the system's libstdc++;
#   - win-x64: needs no MinGW runtime DLL (libstdc++, libgcc, winpthread): a user's machine
#     has none of them;
#   - mac-*: one architecture, the right one; libRack found where Rack puts it
#     (/tmp/Rack2); prints the oldest macOS it says it runs on (D46 accepts 10.12 on Intel).
#
# It cannot load the plugin in Rack: that is the bar's other half (PROOFS.md P5).
# SPDX-License-Identifier: MIT
set -eu
file=$1
name=$(basename "$file" .vcvplugin)
case $name in
*-lin-x64) platform=lin-x64 ;;
*-win-x64) platform=win-x64 ;;
*-mac-x64) platform=mac-x64 ;;
*-mac-arm64) platform=mac-arm64 ;;
*) echo "P5: '$name' does not end in a Rack platform"; exit 1 ;;
esac
fail() { echo "P5 $platform: $1"; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
zstd -dcq "$file" | tar -xf - -C "$tmp"
dir=$tmp/PocketInstruments
[ -f "$dir/plugin.json" ] || fail "no plugin.json in the archive"
case $platform in
lin-*) bin=$dir/plugin.so ;;
win-*) bin=$dir/plugin.dll ;;
mac-*) bin=$dir/plugin.dylib ;;
esac
[ -f "$bin" ] || fail "no $(basename "$bin") in the archive"

case $platform in
lin-x64)
    objdump -f "$bin" | grep -q 'file format elf64-x86-64' || fail "not an x86-64 ELF"
    syms=$(objdump -T "$bin")
    newest=$(echo "$syms" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)
    [ "$(printf '%s\n' GLIBC_2.23 "$newest" | sort -V | tail -1)" = GLIBC_2.23 ] ||
        fail "needs $newest; Rack allows GLIBC_2.23 at most"
    if echo "$syms" | grep -qE 'GLIBCXX_|CXXABI_'; then fail "needs the system's libstdc++"; fi
    needs=$(objdump -p "$bin" | awk '$1 == "NEEDED" {print $2}' | tr '\n' ' ')
    note="glibc up to ${newest#GLIBC_} (2.23 allowed); libraries: $needs"
    ;;
win-x64)
    objdump -f "$bin" | grep -q 'file format pei-x86-64' || fail "not an x86-64 PE"
    needs=$(objdump -p "$bin" | awk '/DLL Name:/ {print $3}' | tr '\n' ' ')
    for dll in $needs; do
        case $dll in libstdc++* | libgcc* | libwinpthread*) fail "needs $dll, which a user's machine does not have" ;; esac
    done
    note="libraries: $needs"
    ;;
mac-*)
    want=x86_64
    [ "$platform" = mac-arm64 ] && want=arm64
    archs=$(lipo -archs "$bin")
    [ "$archs" = "$want" ] || fail "built for '$archs', not $want"
    otool -L "$bin" | grep -q '/tmp/Rack2/libRack.dylib' || fail "does not look for libRack in /tmp/Rack2"
    min=$(otool -l "$bin" | awk '/LC_VERSION_MIN_MACOSX|LC_BUILD_VERSION/ {f=1} f && ($1 == "version" || $1 == "minos") {print $2; exit}')
    note="$archs; says it runs on macOS $min and later"
    ;;
esac
echo "P5 $platform: $(basename "$file"): $note"
