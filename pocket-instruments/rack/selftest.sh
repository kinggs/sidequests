#!/bin/sh
# P3 without the screen: Rack itself, headless, on a patch of four probes (one a fixture each;
# three on a Fundamental LFO's square as the clock, one on its own table clock), in a throwaway
# user folder so the owner's Rack is not touched. Passes only if every probe matched at least
# one pass of its fixture, none mismatched, no event was dropped, and its AUDIO output carried
# sound (every fixture fires the bass drum on track 0): a peak above 0 V and under 10 V, with
# no sample NaN or infinite. One probe is given a saved snapshot of version 1 (§15: an old
# patch), which it must load: "1 loaded, 0 refused".
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
trap 'rm -rf "$user"' EXIT
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
# The LFO's FREQ is param 2; 8 is 256 Hz, so a 48-step fixture goes round five times a second.
cat > "$user/autosave/patch.json" <<JSON
{"version":"2.6.6","modules":[
 {"id":1,"plugin":"Fundamental","model":"LFO","version":"2.6.4","params":[{"id":2,"value":8.0}],"pos":[0,0]},
 $(probe 2 swing-length-change),$(probe 3 reset-mid-bar),$(probe 4 probability-seed-1),$(probe 5 straight-sixteenths 65535 "$old")],
 "cables":[$(cable 2),$(cable 3),$(cable 4)]}
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
echo "selftest: 4 probes clean in Rack at $rate Hz, each sounding; one on the sixteen samples, from a version 1 snapshot."
