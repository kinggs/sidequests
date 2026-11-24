#!/bin/sh
# `make pairs OLD=<bench>`: two or more bench programs, ten rounds interleaved (each round runs
# every one once, the order turned by one each round), one CPU, then each case's median and
# range. How a session says what a change costs (PLAN.md's ground rules): only builds read in
# the same minute on the same core compare (LEARNINGS.md, Session 29).
#
#   sh harness/pairs.sh CPU BENCH...
#
# SPDX-License-Identifier: MIT
set -eu
cpu=$1; shift
pin=""
command -v taskset >/dev/null && pin="taskset -c $cpu"
out=$(mktemp)
trap 'rm -f "$out"' EXIT
n=$#
r=0
while [ $r -lt 10 ]; do
    j=0
    while [ $j -lt $n ]; do
        k=$(( (j + r) % n + 1 ))
        eval "b=\${$k}"
        $pin "$b" | sed -E "s|^bench (.{7}) +([0-9.]+).*|$k	\1	\2|" >> "$out"
        j=$((j + 1))
    done
    r=$((r + 1))
done
[ -n "$pin" ] || echo "(no taskset: not pinned to one CPU, so expect two modes on a two-die CPU)"
printf '%-8s' case
i=1
for b in "$@"; do printf '%22s' "$(basename "$(dirname "$b")")/$(basename "$b")" | cut -c1-22 | tr -d '\n'; i=$((i + 1)); done
echo
sort -t'	' -k2,2 -k1,1n -k3,3g "$out" | awk -F'\t' -v n="$n" '
    { c = $2; sub(/ +$/, "", c); k = c SUBSEP $1; v[k, ++m[k]] = $3
      if (!(c in seen)) { seen[c] = 1; order[++cases] = c } }
    END {
        for (i = 1; i <= cases; i++) {
            c = order[i]; line = sprintf("%-8s", c)
            for (b = 1; b <= n; b++) {
                k = c SUBSEP b; t = m[k]
                if (!t) { line = line sprintf("%22s", "-"); continue }
                med = (t % 2) ? v[k, (t + 1) / 2] : (v[k, t / 2] + v[k, t / 2 + 1]) / 2
                line = line sprintf("%22s", sprintf("%.1f (%.1f-%.1f)", med, v[k, 1], v[k, t]))
            }
            print line
        }
    }'
