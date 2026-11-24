#!/usr/bin/env bash
# Session 22: record the PO-12 through the Scarlett, for measuring (PLAN.md).
#
#   harness/hardware-take.sh check      five seconds, then the level on inputs 1 and 2
#   harness/hardware-take.sh a          record pass "a" until Ctrl-C
#
# The file goes OUTSIDE the repo (README rule 6: no recording of the hardware enters it), to
# $PI_TAKES, by default ~/Music/pocket-instruments-hardware. 48 kHz, 24-bit, inputs 1 and 2.
# It records through PipeWire, so Rack can stay open on its PulseAudio driver (PLAN.md,
# Machine state).
set -euo pipefail

dir="${PI_TAKES:-$HOME/Music/pocket-instruments-hardware}"
case "$dir/" in "$(cd "$(dirname "$0")/../.." && pwd)"/*) echo "PI_TAKES is inside the repo: refused" >&2; exit 1 ;; esac
mkdir -p "$dir"

# The Scarlett's source, by name, so the webcam's microphone is never the one recorded.
target="$(pw-cli ls Node 2>/dev/null | grep -o 'alsa_input[^"]*Scarlett[^"]*' | head -1)"
[ -n "$target" ] || { echo "no Scarlett input found (wpctl status)" >&2; exit 1; }
rec=(pw-record --target "$target" --rate 48000 --channels 2 --channel-map FL,FR --format s24)

levels() {
  python3 - "$1" <<'EOF'
import math, sys, wave
w = wave.open(sys.argv[1]); n, c, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
b = w.readframes(n); full = float(1 << (8 * sw - 1))
print(f"{n / w.getframerate():.1f} s")
for ch in range(c):
    peak = max((abs(int.from_bytes(b[(i * c + ch) * sw:(i * c + ch + 1) * sw], "little", signed=True))
                for i in range(n)), default=0) / full
    db = 20 * math.log10(peak) if peak > 0 else -240.0
    note = "  CLIPPED: turn the input down" if db > -0.5 else "  hot: under -6 is safer" if db > -6 else ""
    print(f"input {ch + 1}: peak {db:6.1f} dBFS{note}")
EOF
}

case "${1:-}" in
  check)
    f="$(mktemp --suffix=.wav)"; trap 'rm -f "$f"' EXIT
    echo "listening for five seconds..."
    timeout 5 "${rec[@]}" "$f" || true
    levels "$f" ;;
  ""|-*) sed -n '2,10p' "$0"; exit 1 ;;
  *)
    f="$dir/po12-$1-$(date +%Y%m%d-%H%M%S).wav"
    echo "recording to $f"; echo "Ctrl-C when the pass is done."
    trap : INT
    "${rec[@]}" "$f" || true
    trap - INT
    levels "$f"; echo "$f" ;;
esac
