#!/usr/bin/env python3
"""The starter pack as the engine reads it (D50): each FLAC in this folder becomes
raw/<name>.s16, mono, 16-bit little-endian, at the file's own 44.1 kHz, its loudest point
at full scale (32767). Committed, so every host hands the engine the same bytes.

    python3 samples/make-raw.py        needs ffmpeg; standard library otherwise

FLAC decodes exactly, and everything after the decode is integer arithmetic here, so the
output depends only on the FLAC files. Stereo is the sum of both sides, then scaled.
SPDX-License-Identifier: MIT
"""
import json
import pathlib
import subprocess
import sys
from array import array

RATE = 44100  # SAMPLE_RATE in core/src/voice.rs
here = pathlib.Path(__file__).resolve().parent
out_dir = here / "raw"
out_dir.mkdir(exist_ok=True)


def decode(path):
    info = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels,sample_fmt", "-of", "json", str(path)],
        check=True, capture_output=True).stdout)["streams"][0]
    if int(info["sample_rate"]) != RATE or info["sample_fmt"] != "s16":
        sys.exit(f"{path.name}: {info['sample_rate']} Hz {info['sample_fmt']}, not {RATE} Hz s16")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-acodec", "pcm_s16le", "-"],
                         check=True, capture_output=True).stdout
    pcm = array("h", raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    ch = int(info["channels"])
    return [sum(pcm[i:i + ch]) for i in range(0, len(pcm), ch)]


for flac in sorted(here.glob("*.flac")):
    mono = decode(flac)
    peak = max(abs(s) for s in mono) or 1
    # round(s * 32767 / peak), half away from zero, in integers.
    scaled = array("h", ((2 * abs(s) * 32767 + peak) // (2 * peak) * (1 if s >= 0 else -1) for s in mono))
    if sys.byteorder != "little":
        scaled.byteswap()
    (out_dir / (flac.stem + ".s16")).write_bytes(scaled.tobytes())
    print(f"{flac.stem}: {len(scaled)} frames, {len(scaled) / RATE * 1000:.0f} ms")
