#!/bin/sh
# P3 without the screen: Rack itself, headless, on a patch of four probes (one a fixture each;
# three on a Fundamental LFO's square as the clock, one on its own table clock), in a throwaway
# user folder so the owner's Rack is not touched. Passes only if every probe matched at least
# one pass of its fixture, none mismatched, no event was dropped, and its AUDIO output carried
# sound (every fixture fires the bass drum on track 0): a peak above 0 V and under 10 V, with
# no sample NaN or infinite. One probe is given a saved snapshot of version 1 (§15: an old
# patch), which it must load: "1 loaded, 0 refused".
#
# Then the Rhythm module's own self-test (Session 13): each format 2 fixture, and since Session
# 21 the format 4 one (§20: a step keeps what it was written with, the second mark), on a Rhythm module
# twice, once on its table clock and once on a second LFO's square at 8 Hz (slow enough for a
# step's presses, one a frame, to land inside its first tick). Each module presses its own
# parameters and holds its events and views to its fixture; each must match at least one pass
# and every view, and mismatch none. The two that fire must sound. One plays write-a-beat
# with its VOICES patched back into its own RETURN, so AUDIO is rebuilt from RETURN (D62). A
# last Rhythm module is the instrument, given an old patch's version 1 snapshot, which it must
# load, with RETURN patched from its own VOICES as well.
#
# Since Session 18: the two format 3 fixtures (the lane, the punches, the repeats) on both
# clocks too, and every fixture whose views say `fx=` has the module's FX GATES held to it.
# Then four modules on the module's own cables (Rhythm.cpp, "The loop self-tests"): one with
# VOICES into RETURN and effect 2 punched on what comes back (the owner's patch: TRIGGERS out
# to drums, the drums back in, a punch heard on them), one with FX SEND into FX RETURN and
# effect 4 punched, one with A OUT into A IN and B OUT into B IN, each held frame by frame to a
# second engine given what its cables should carry; and one playing D78's fx latch.
# Since Session 24 (ABI 11; D88) FX SEND is sixteen channels and FX RETURN sums them: three
# modules loop them, effect 4 Ours, effect 2 Rack's beside the dry and effect 2 Rack's in place
# of the dry (the settings given in each module's data), and FX SEND's sixteen channels are
# held to jacks.hpp given the second engine's frame.
#
#   selftest.sh [seconds] [sample rate]
#
# It does not replace the owner's ten minutes: there is no audio device here, so "no dropout"
# and the CPU meter are not measured. SPDX-License-Identifier: MIT
set -eu
here=$(cd "$(dirname "$0")" && pwd)
secs=${1:-20}
rate=${2:-44100}
app=${RACK_APP:-$HOME/.local/opt/Rack2Free-2.6.6}
fundamental=${FUNDAMENTAL:-$HOME/.local/share/Rack2/plugins-lin-x64/Fundamental}
[ -x "$app/Rack" ] || { echo "selftest: no Rack at $app (set RACK_APP)"; exit 2; }
[ -d "$fundamental" ] || { echo "selftest: no Fundamental at $fundamental"; exit 2; }
user=$(mktemp -d)
# On a failure Rack's log is kept as build/selftest-<rate>.log: one run in 32 at 96 kHz once
# failed with a Rhythm module that never saw its CLOCK cable (2026-11-23), and the log was gone.
trap 's=$?; [ $s -ne 0 ] && mkdir -p "$here/build" && cp "$user/log.txt" "$here/build/selftest-$rate.log" 2>/dev/null && echo "selftest: Rack'"'"'s log kept: rack/build/selftest-$rate.log"; rm -rf "$user"' EXIT
mkdir -p "$user/plugins-lin-x64" "$user/autosave"
ln -s "$fundamental" "$user/plugins-lin-x64/Fundamental"
make --no-print-directory -C "$here" install RACK_USER_DIR="$user" >/dev/null
printf '{"sampleRate": %s.0, "autoCheckUpdates": false}\n' "$rate" > "$user/settings.json"
# The third argument is the Sounds menu's mask: 65535 puts every track on its sample (D50).
# The fourth, if any, is a saved snapshot, as base64, the way Rack keeps it in a patch.
probe() { printf '{"id":%s,"plugin":"PocketInstruments","model":"Probe","version":"2.0.0","params":[],"pos":[%s,0],"data":{"fixture":"%s","track":0,"samples":%s%s}}' "$1" "$(($1 * 4 + 6))" "$2" "${3:-0}" "${4:+,\"snapshot\":\"$4\"}"; }
# straight-sixteenths' version 1 snapshot, written by the ABI 4 core (fixtures/snapshots-v1.txt).
old=$(sed -n 's/^straight-sixteenths //p' "$here/../fixtures/snapshots-v1.txt" | tr a-f A-F | basenc --base16 -d | base64 -w0)
[ -n "$old" ] || { echo "selftest: no version 1 snapshot for straight-sixteenths"; exit 2; }
cable() { printf '{"id":%s,"outputModuleId":1,"outputId":3,"inputModuleId":%s,"inputId":0,"color":"#ffffff"}' "$1" "$1"; }
# The Rhythm modules: id, fixture (or none), and x. Their CLOCK is input 0, RETURN input 2; VOICES output 1.
rhythm() { printf '{"id":%s,"plugin":"PocketInstruments","model":"Rhythm","version":"2.0.0","params":[],"pos":[%s,1],"data":{%s}}' "$1" "$(($1 * 24))" "$2"; }
edge() { printf '{"id":%s,"outputModuleId":6,"outputId":3,"inputModuleId":%s,"inputId":0,"color":"#ffffff"}' "$1" "$2"; }
loop() { printf '{"id":%s,"outputModuleId":%s,"outputId":1,"inputModuleId":%s,"inputId":2,"color":"#ffffff"}' "$1" "$2" "$2"; }
# A module's own output into its own input: cable id, module, output, input. Outputs: FX SEND 4,
# A OUT 5, B OUT 6. Inputs: FX RETURN 3, A IN 4, B IN 5 (the enums in Rhythm.cpp).
self() { printf '{"id":%s,"outputModuleId":%s,"outputId":%s,"inputModuleId":%s,"inputId":%s,"color":"#ffffff"}' "$1" "$2" "$3" "$2" "$4"; }
# The LFO's FREQ is param 2; 8 is 256 Hz, so a 48-step fixture goes round five times a second.
cat > "$user/autosave/patch.json" <<JSON
{"version":"2.6.6","modules":[
 {"id":1,"plugin":"Fundamental","model":"LFO","version":"2.6.4","params":[{"id":2,"value":8.0}],"pos":[0,0]},
 $(probe 2 swing-length-change),$(probe 3 reset-mid-bar),$(probe 4 probability-seed-1),$(probe 5 straight-sixteenths 65535 "$old"),
 {"id":6,"plugin":"Fundamental","model":"LFO","version":"2.6.4","params":[{"id":2,"value":3.0}],"pos":[0,2]},
 $(rhythm 7 '"fixture":"keys-bpm-family"'),$(rhythm 8 '"fixture":"keys-tap-and-choose"'),$(rhythm 9 '"fixture":"keys-write-a-beat"'),
 $(rhythm 10 '"fixture":"keys-bpm-family"'),$(rhythm 11 '"fixture":"keys-tap-and-choose"'),$(rhythm 12 '"fixture":"keys-write-a-beat"'),
 $(rhythm 13 "\"snapshot\":\"$old\""),
 $(rhythm 14 '"fixture":"keeps-what-it-was-written-with"'),$(rhythm 15 '"fixture":"keeps-what-it-was-written-with"'),
 $(rhythm 16 '"fixture":"fx-repeat-punch"'),$(rhythm 17 '"fixture":"fx-repeat-swing"'),
 $(rhythm 18 '"fixture":"fx-repeat-punch"'),$(rhythm 19 '"fixture":"fx-repeat-swing"'),
 $(rhythm 20 '"loop":"return"'),$(rhythm 21 '"loop":"fx"'),$(rhythm 22 '"loop":"sliders"'),$(rhythm 23 '"loop":"latch"'),
 $(rhythm 24 '"loop":"fx","fxRack":2,"fxInPlace":0'),$(rhythm 25 '"loop":"fx","fxRack":2,"fxInPlace":2')],
 "cables":[$(cable 2),$(cable 3),$(cable 4),$(edge 10 10),$(edge 11 11),$(edge 12 12),$(edge 15 15),$(loop 20 9),$(loop 21 13),
  $(edge 18 18),$(edge 19 19),$(loop 30 20),$(self 31 21 4 3),$(self 32 22 5 4),$(self 33 22 6 5),$(self 34 24 4 3),$(self 35 25 4 3)]}
JSON
(cd "$app" && (sleep "$secs"; echo) | ./Rack -h -u "$user" >/dev/null 2>&1) || { echo "selftest: Rack exited badly"; tail -5 "$user/log.txt"; exit 1; }
lines=$(grep 'Pocket Instruments probe' "$user/log.txt" || true)
echo "$lines" | sed 's/^.*report\] //'
n=$(echo "$lines" | grep -c '(removed)' || true)
quiet=$(echo "$lines" | grep -c '(removed).*audio peak 0\.00 V' || true)
good=$(echo "$lines" | grep -E '\(removed\): [1-9][0-9]* passes matched, 0 did not, .* rate '"$rate"' Hz, .* 0 events dropped, .*; audio peak [0-9]\.[0-9]{2} V, 0 samples not finite' | grep -vc 'audio peak 0\.00 V' || true)
[ "$n" = 4 ] && [ "$good" = 4 ] || { echo "selftest: FAILED ($good of $n probes clean at $rate Hz; $quiet silent)"; exit 1; }
# D50: every probe found the pack in the installed plugin, and the last plays it.
[ "$(echo "$lines" | grep '(removed)' | grep -c '16 of 16 samples found')" = 4 ] || { echo "selftest: FAILED (a probe did not find the sixteen samples)"; exit 1; }
[ "$(echo "$lines" | grep '(removed)' | grep -c '16 tracks on samples')" = 1 ] || { echo "selftest: FAILED (the probe set to samples did not keep the setting)"; exit 1; }
# §15: the probe given an old patch's snapshot loaded it, and the others had none to load.
[ "$(echo "$lines" | grep '(removed)' | grep -c ' 1 loaded, 0 refused')" = 1 ] || { echo "selftest: FAILED (the version 1 snapshot was not loaded)"; exit 1; }
[ "$(echo "$lines" | grep '(removed)' | grep -c ' 0 loaded, 0 refused')" = 3 ] || { echo "selftest: FAILED (a probe loaded or refused a snapshot it was not given)"; exit 1; }
# The Rhythm modules (Session 13).
rl=$(grep 'Pocket Instruments rhythm' "$user/log.txt" || true)
echo "$rl" | sed 's/^.*report\] //'
rgood() { # fixture, where: one clean module
    echo "$rl" | grep -E "\(removed\): fixture $1 $2: [1-9][0-9]* passes matched, 0 did not, [0-9]+ cut short, [1-9][0-9]* views held, 0 not; rate $rate Hz, 0 events dropped, .* 0 samples not finite, .* 16 of 16 samples found" | grep -c . || true
}
for f in keys-bpm-family keys-tap-and-choose keys-write-a-beat keeps-what-it-was-written-with fx-repeat-punch fx-repeat-swing; do
    for w in "on the table" "on edges"; do
        [ "$(rgood $f "$w")" = 1 ] || { echo "selftest: FAILED (Rhythm on $f $w at $rate Hz)"; exit 1; }
    done
    if [ $f != keys-bpm-family ]; then
        [ "$(echo "$rl" | grep "fixture $f " | grep -vc 'audio peak 0\.00 V')" = 2 ] || { echo "selftest: FAILED (Rhythm on $f did not sound)"; exit 1; }
        [ "$(echo "$rl" | grep "fixture $f " | grep -c ' 0 trigger pulses')" = 0 ] || { echo "selftest: FAILED (Rhythm on $f sent no trigger)"; exit 1; }
    fi
done
# D62 in Rack: write-a-beat on the table with RETURN from its own VOICES still sounds.
echo "$rl" | grep 'fixture keys-write-a-beat on the table' | grep -qE ' [1-9][0-9]* frames with RETURN' || { echo "selftest: FAILED (RETURN was not taken)"; exit 1; }
# §15 on the instrument: the old patch's beat loaded.
echo "$rl" | grep -E '\(removed\): fixture none: .* 1 loaded, 0 refused; .* 0 samples not finite, .* [1-9][0-9]* frames with RETURN' | grep -q . || { echo "selftest: FAILED (the Rhythm instrument did not load the version 1 snapshot, or RETURN was not taken)"; exit 1; }
# Session 18. FX GATES held to every view that says fx= (the format 3 and 4 fixtures), none not.
for f in keeps-what-it-was-written-with fx-repeat-punch fx-repeat-swing; do
    [ "$(echo "$rl" | grep "fixture $f " | grep -cE ' [1-9][0-9]* gates held, 0 not;')" = 2 ] || { echo "selftest: FAILED (FX GATES on $f at $rate Hz)"; exit 1; }
done
[ "$(echo "$rl" | grep -c ' gates held, [1-9]')" = 0 ] || { echo "selftest: FAILED (FX GATES were not a view's fx)"; exit 1; }
# The loops: every pass and every frame the second engine's, and the loop heard.
for l in return "fx effect 4 ours" "fx effect 2 beside the dry" "fx effect 2 in place of the dry" sliders; do
    echo "$rl" | grep -E "\(removed\): fixture none: .* rate $rate Hz, 0 events dropped, .* 0 samples not finite, .*; loop $l: [1-9][0-9]* passes held to the core, 0 not, [1-9][0-9]* frames the same, 0 not, [1-9][0-9]* where the loop was heard; 16 of 16" | grep -q . || { echo "selftest: FAILED (the $l loop at $rate Hz)"; exit 1; }
done
echo "$rl" | grep 'loop return:' | grep -vq 'audio peak 0\.00 V' || { echo "selftest: FAILED (the return loop was silent)"; exit 1; }
echo "$rl" | grep 'loop return:' | grep -qE ' [1-9][0-9]* frames with RETURN' || { echo "selftest: FAILED (the return loop took nothing from RETURN)"; exit 1; }
# D78: the fx latch, every pass.
echo "$rl" | grep -E "loop latch: [1-9][0-9]* passes held to the core, 0 not, [1-9][0-9]* frames the same, 0 not" | grep -q . || { echo "selftest: FAILED (the fx latch at $rate Hz)"; exit 1; }
echo "selftest: 4 probes clean in Rack at $rate Hz, each sounding; one on the sixteen samples, from a version 1 snapshot."
echo "selftest: 12 Rhythm modules held to the three format 2 fixtures, the two format 3 and the format 4 one on both clocks at $rate Hz, by their own parameters, FX GATES to each view's fx; one through RETURN; the instrument loaded a version 1 snapshot."
echo "selftest: 5 Rhythm modules through their own cables (VOICES to RETURN with effect 2 punched; FX SEND's sixteen channels to FX RETURN with effect 4 Ours, effect 2 beside the dry and effect 2 in place of the dry, FX SEND held to jacks.hpp; A OUT and B OUT to A IN and B IN), each frame the core's own; the fx latch (D78)."
