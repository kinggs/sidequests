#!/bin/sh
# P6, the ThreadSanitizer half. harness/race.cpp says what it checks; this runs it.
# Needs `make test` to have written the Node report first.
#
#   race.sh <race program> <fixtures dir> <node report>
#
# 1. The safe scheme must come out clean twice: flat out, and with an idle audio thread.
# 2. Every fault put in on purpose must still be caught, and caught the way it should be:
#    66 is the sanitizer's own exit code, 1 is the harness's.
# 3. Each snapshot taken while playing must be one the wasm host loaded in `make test` and
#    got that fixture's trace from.
#
# SPDX-License-Identifier: MIT
set -eu
race=$1
fixtures=$2
report=$3
export TSAN_OPTIONS=halt_on_error=1

"$race" "$fixtures" "$race-snapshots.txt" safe 0
"$race" "$fixtures" "$race-snapshots-idle.txt" safe 50
cmp "$race-snapshots.txt" "$race-snapshots-idle.txt"

for fault in two-buffers:66 direct-save:66 split-load:1 drop-edit:1 torn:1 torn-view:1; do
    mode=$(echo "$fault" | cut -d: -f1)
    want=$(echo "$fault" | cut -d: -f2)
    got=0
    "$race" "$fixtures" "$race-fault.txt" "$mode" 50 > "$race-fault.log" 2>&1 || got=$?
    if [ "$got" != "$want" ]; then
        echo "P6: the planted fault '$mode' exited $got, not $want: a check has gone blind"
        exit 1
    fi
done
echo "P6: all six planted faults were caught."

n=0
while read -r name hex; do
    if ! grep -q "^# $name .* snapshot $hex\$" "$report"; then
        echo "P6: the snapshot taken while playing $name is not one the wasm host ran"
        exit 1
    fi
    n=$((n + 1))
done < "$race-snapshots.txt"
if [ "$n" -lt 7 ]; then
    echo "P6: expected seven snapshots, got $n"
    exit 1
fi
echo "P6: $n snapshots taken while playing; the wasm host gave each fixture's trace from the same bytes."
