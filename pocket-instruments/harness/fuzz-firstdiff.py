#!/usr/bin/env python3
"""First difference between two `fuzz-<lib> --dump <seed> <prefix>` runs.

    python3 -I firstdiff.py <prefix A> <prefix B>

Reads <prefix>.bin (every output, record by record) and <prefix>.log (a line a call: what went
in, what was live) and prints the first record that differs, which part and the two values,
with the log lines of the calls just before it."""
import struct, sys

TAGS = {1: "call header", 2: "audio", 3: "events", 4: "view", 5: "pi_set_delay result",
        6: "generation/dropped", 7: "snapshot saved", 8: "pi_load result", 9: "pi_set_sample result"}
VIEW = [(0, 4, "TICK"), (4, 4, "TEMPO"), (8, 4, "HELD"), (12, 2, "FIELD"), (14, 2, "STITCH"), (16, 2, "BAR"),
        (18, 2, "SAMPLED"), (20, 2, "A"), (22, 2, "B"), (24, 1, "FLAGS"), (25, 1, "STEP"), (26, 1, "SEL"),
        (27, 1, "VOLUME"), (28, 1, "LENGTH"), (29, 1, "SWING"), (30, 2, "EXT"), (32, 16, "FIRES"),
        (48, 4, "WOVEN"), (52, 2, "WOVE"), (54, 1, "ON_STEP"), (55, 1, "HEARD"), (56, 2, "FX_STEPS"),
        (58, 2, "FX_SOUNDS"), (60, 2, "HIT_A"), (62, 2, "HIT_B")]


def records(path):
    data = open(path, "rb").read()
    i = 0
    while i < len(data):
        tag, n = struct.unpack_from("<II", data, i)
        yield tag, data[i + 8:i + 8 + n]
        i += 8 + n


def fl(b):
    v = struct.unpack("<f", b)[0]
    return f"{v!r} (0x{b[::-1].hex()})"


def main(a, b):
    la = open(a + ".log").read().splitlines()
    hdr = None
    for k, (ra, rb) in enumerate(zip(records(a + ".bin"), records(b + ".bin"))):
        if ra[0] == 1:
            hdr = struct.unpack("<6I", ra[1])
        if ra == rb:
            continue
        tag, da = ra
        db = rb[1]
        call, n, ch, rate, nfl, got = hdr
        print(f"first difference: record {k}, {TAGS.get(tag, tag)}"
              + (f", in call {call} (frames {n}, layout {ch}, rate {rate})" if hdr else ""))
        if ra[0] != rb[0]:
            print(f"  record kinds differ: {ra[0]} vs {rb[0]}")
        elif tag == 1:
            print(f"  header A {struct.unpack('<6I', da)}\n  header B {struct.unpack('<6I', db)}")
        elif tag == 2:
            shown = 0
            for i in range(0, min(len(da), len(db)), 4):
                if da[i:i + 4] != db[i:i + 4]:
                    f, c = divmod(i // 4, ch)
                    name = {16: "mix" if ch in (17, 18, 50) else "track 16", 17: "bus (FX SEND)"}.get(c, f"track {c}" if c < 16 else f"slider out {c}")
                    if ch == 1:
                        name = "mix"
                    print(f"  frame {f} channel {c} ({name}): A {fl(da[i:i+4])}  B {fl(db[i:i+4])}")
                    shown += 1
                    if shown >= 6:
                        break
            nd = sum(1 for i in range(0, len(da), 4) if da[i:i + 4] != db[i:i + 4])
            print(f"  {nd} of {len(da)//4} floats differ in this call")
        elif tag == 3:
            def evs(d):
                return [struct.unpack_from("<IIBBBB", d, i) for i in range(0, len(d), 12)]
            print(f"  events A {evs(da)}\n  events B {evs(db)}")
        elif tag == 4:
            for off, w, name in VIEW:
                if da[off:off + w] != db[off:off + w]:
                    print(f"  view {name}: A {da[off:off+w].hex()}  B {db[off:off+w].hex()}")
        else:
            print(f"  A {da.hex()[:200]}\n  B {db.hex()[:200]}")
        if hdr:
            for line in la[max(0, call - 4):call + 1]:
                print("  log:", line[:700])
        return 1
    print("no difference")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
