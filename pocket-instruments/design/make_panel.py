# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools"]
# ///
"""Draw the static Rack panel for the Loom design as a flat SVG, in millimetres.

    uv run pocket-instruments/design/make_panel.py              writes panel.svg beside this file
    uv run pocket-instruments/design/make_panel.py --positions  prints the widget positions
    uv run pocket-instruments/design/make_panel.py --check      no label, plate or stitch touches its neighbour

The panel holds only what never changes: the body, the display's frame, the stitched
dividers, the slider threads, a pale plate under each output, the stitches round the
sixteen-channel jacks and the lettering. Keys, slider caps, the display and the jack
sockets are widgets the module draws over it (DESIGN.md, "The Rack panel").

Why a script and not a drawing: Rack's SVG reader draws no text, no dashes, no filters. So
lettering is turned into outlines here, and each stitch of a divider is its own rectangle.
Every number below is in mm from the panel's top-left corner.
"""
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# The design's cut, ExtraBold (800), kept in the repo with its licence (fonts/OFL.txt) since
# Session 13; the Rack module draws its lettering in the same file. Until then this was the
# machine's Bold (700), the only cut installed. Pass another font file as the last argument.
FONT = str(Path(__file__).with_name("fonts") / "JetBrainsMono-ExtraBold.ttf")

W, H = 121.92, 128.5

GROUND, DISPLAY, ECRU = "#14131F", "#0B0A12", "#F2E8D0"

MARGIN = 5.0
DISPLAY_BOX = (MARGIN, 7.0, W - MARGIN - 4.92, 25.0)  # x, y, w, h: ends 4.92 from the right
FRAME = 0.35

MID_Y, MID_H = 38.0, 48.0  # the band the grid, sliders and function keys share

GRID_X, PITCH, KEY = 5.0, 12.0, 11.7  # 4 x 4 at 12 mm pitch
# The sliders were 7 mm apart, at 61.5 and 68.5, with the dividers at 56 and 74. The owner
# widened them to 10 mm (2026-11-19) for the guide's thumb room (R33). The space came from the
# clearances beside the dividers, so the grid and the function keys did not move.
DIVIDERS = (55.25, 74.75)
SLIDERS = {"A": 60.0, "B": 70.0}  # centre lines
SLIDER_TOP, SLIDER_BOTTOM = 38.0, 81.0
THREAD = 0.67
LETTER_Y = 84.2  # centre of the A and B under the threads

FN_X, FN_W, FN_GAP = 77.0, 40.0, 0.6  # function keys: 10 mm pitch along the bottom row
FN_TOP = ("sound", "pattern", "bpm")
FN_BOTTOM = ("function", "fx", "play", "write")

# The jacks: two rows, thirteen jacks, grouped by what they carry (D76; drawn in Session 18).
# Until then one row of six at y 116.3: CLOCK, RESET and RETURN on the dark body at the left,
# TRIGGERS, VOICES and AUDIO on one pale plate at the right (D62).
#
# D76 proposed positions by arithmetic. What moved once it was drawn, and why (D80):
#   - The left three columns are 12.4, 25.4 and 38.4, not 10.67, 22.33 and 34.00. TRIGGERS is
#     13.2 mm of lettering: at 11.67 mm apart it touched VOICES (0.1 mm). At 13 mm there is
#     1.5 mm, and its left edge stays inside the 5 mm margin. CLOCK and RESET sit on the same
#     columns above.
#   - FX SEND and FX RETURN are at 84.0 and 96.0, not 80.67 and 92.33, with FX over the word:
#     on one line the two labels overlapped by 1.5 mm. On two lines, 12 mm apart, they clear
#     each other, AUDIO's plate and the wordmark, which keeps its 3.0 mm.
#   - FX GATES is at 90.0, not 86.5: still midway over the pair it belongs to.
ROW_UP, ROW_LOW = 97.5, 116.3
LABEL_ABOVE = 6.6   # a label's centre above its socket's
LINE = 3.1          # between the two lines of a two-line label
# name: (x, y, is an output, sixteen channels, the label's lines)
JACKS = {
    "CLOCK": (12.4, ROW_UP, False, False, ("CLOCK",)),
    "RESET": (25.4, ROW_UP, False, False, ("RESET",)),
    "A OUT": (40.00, ROW_UP, True, True, ("A OUT",)),
    "A IN": (51.67, ROW_UP, False, True, ("A IN",)),
    "B OUT": (63.33, ROW_UP, True, True, ("B OUT",)),
    "B IN": (75.00, ROW_UP, False, True, ("B IN",)),
    "FX GATES": (90.0, ROW_UP, True, True, ("FX GATES",)),
    "TRIGGERS": (12.4, ROW_LOW, True, True, ("TRIGGERS",)),
    "VOICES": (25.4, ROW_LOW, True, True, ("VOICES",)),
    "RETURN": (38.4, ROW_LOW, False, True, ("RETURN",)),
    "FX SEND": (84.0, ROW_LOW, True, False, ("FX", "SEND")),
    "FX RETURN": (96.0, ROW_LOW, False, False, ("FX", "RETURN")),
    "AUDIO": (109.67, ROW_LOW, True, False, ("AUDIO",)),
}
# Each output on its own patch of the inverted ground (D76 item 3; VCV's panel guide asks for
# an inverted background on output ports, R33). A patch is as wide as its stitches or its
# label, whichever is wider, so TRIGGERS and VOICES, 13 mm apart, share an edge and read as
# one plate. Until Session 18 one plate lay under all three outputs at the right.
PLATE_HALF = 5.6                    # the stitches reach 5.2 mm from the centre
PLATE_UP, PLATE_DOWN = 1.7, 5.7     # above the top label line's centre; below the socket's
LABEL_PAD = 0.8                     # plate past its label, each side
AUDIO_PLATE_HALF = 6.9              # AUDIO's is wider and as tall as FX SEND's, with a frame
AUDIO_FRAME_IN, AUDIO_FRAME_T = 0.6, 0.6  # 0.6 mm inside it, 0.6 mm thick: the main output
TICK_IN, TICK_OUT, TICK_W = 4.4, 5.2, 0.5

# The wordmark sat at x 63 until the outputs became three (2026-11-19), then at x 49, 3.5 mm,
# until RETURN (D62), when it dropped to 3.0 mm to fit between RETURN's stitches and the
# output plate. Since Session 18 it sits midway between RETURN's stitches and FX SEND's plate,
# still 3.0 mm. `--check` prints the clearances.
WORDMARK_SIZE = 3.0
WORDMARK_Y = 118.2

# Jack lettering was 2.17 mm. At Rack's 100% zoom (about 2.95 px per mm) that is under 5 px of
# capital height, and the guide asks for text readable at 100% (R33). 2.6 mm is about 5.6 px.
JACK_TYPE, AUDIO_TYPE, JACK_TRACKING = 2.6, 2.8, 0.04


def num(v):
    return f"{v:.3f}".rstrip("0").rstrip(".")


def rect(x, y, w, h, fill):
    return f'<rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" fill="{fill}"/>'


def outline(font, text, cx, cy, size, fill, tracking=0.0):
    """The text as one filled path, centred on (cx, cy) by its capital height."""
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight * scale
    names = [cmap[ord(c)] for c in text]
    widths = [glyphs[n].width * scale + tracking * size for n in names]
    x = cx - (sum(widths) - tracking * size) / 2
    baseline = cy + cap / 2
    parts = []
    for name, width in zip(names, widths):
        pen = SVGPathPen(glyphs, ntos=num)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        parts.append(pen.getCommands())
        x += width
    return f'<path fill="{fill}" d="{"".join(parts)}"/>'


def ticks(cx, cy, fill):
    """Sixteen stitches round a socket, as one path. No rotate(): corners are worked out here."""
    d = []
    for k in range(16):
        a = math.tau * k / 16
        rx, ry = math.sin(a), -math.cos(a)  # outward
        tx, ty = -ry, rx  # along the tick's width
        pts = [(cx + rx * r + tx * s * TICK_W / 2, cy + ry * r + ty * s * TICK_W / 2)
               for r, s in ((TICK_IN, -1), (TICK_OUT, -1), (TICK_OUT, 1), (TICK_IN, 1))]
        d.append("M" + "L".join(f"{num(x)} {num(y)}" for x, y in pts) + "Z")
    return f'<path fill="{fill}" d="{"".join(d)}"/>'


def fn_keys():
    """(label, x, y, w, h) for the seven function keys."""
    h = (MID_H - FN_GAP) / 2
    out = []
    for row, labels in enumerate((FN_TOP, FN_BOTTOM)):
        w = (FN_W - FN_GAP * (len(labels) - 1)) / len(labels)
        for i, label in enumerate(labels):
            out.append((label, FN_X + i * (w + FN_GAP), MID_Y + row * (h + FN_GAP), w, h))
    return out


def advance(font, text, size, tracking=0.0):
    """The text's width in mm, by its glyphs' advances, as outline() lays it out."""
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    return sum(glyphs[cmap[ord(c)]].width * scale + tracking * size for c in text) - tracking * size


def label_box(font, name):
    """A jack's lettering: (left, right, top, bottom) in mm, over all its lines."""
    x, y, _, _, lines = JACKS[name]
    size = AUDIO_TYPE if name == "AUDIO" else JACK_TYPE
    w = max(advance(font, line, size, JACK_TRACKING) for line in lines)
    cap = font["OS/2"].sCapHeight * size / font["head"].unitsPerEm
    top_line = y - LABEL_ABOVE - LINE * (len(lines) - 1)
    return x - w / 2, x + w / 2, top_line - cap / 2, y - LABEL_ABOVE + cap / 2


def plate(font, name):
    """An output's patch of inverted ground: (x, y, w, h)."""
    x, y, _, _, lines = JACKS[name]
    left, right, _, _ = label_box(font, name)
    half = AUDIO_PLATE_HALF if name == "AUDIO" else max(PLATE_HALF, (right - left) / 2 + LABEL_PAD)
    rows = 2 if name == "AUDIO" else len(lines)  # AUDIO's plate starts level with its neighbour's
    top = y - LABEL_ABOVE - LINE * (rows - 1) - PLATE_UP
    return x - half, top, 2 * half, y + PLATE_DOWN - top


def extent(font, name):
    """Everything a jack draws, left to right: its label, and its plate or its stitches."""
    x, _, out, multi, _ = JACKS[name]
    left, right, _, _ = label_box(font, name)
    if out:
        px, _, pw, _ = plate(font, name)
        return min(left, px), max(right, px + pw)
    reach = TICK_OUT if multi else 4.0
    return min(left, x - reach), max(right, x + reach)


def wordmark(font):
    """The wordmark's (text, centre x, y, size): midway between RETURN and FX SEND's plate."""
    gap = (extent(font, "RETURN")[1], extent(font, "FX SEND")[0])
    return "Pocket Instruments", sum(gap) / 2, WORDMARK_Y, WORDMARK_SIZE, gap


def check(font):
    """Nothing a jack draws touches its neighbour's in the same row, except two outputs'
    plates, which may share an edge; everything is inside the panel's margin; and the
    wordmark clears RETURN's stitches and FX SEND's plate (D62 item 4, D76)."""
    ok = True
    for row in (ROW_UP, ROW_LOW):
        names = sorted((n for n in JACKS if JACKS[n][1] == row), key=lambda n: JACKS[n][0])
        for a, b in zip(names, names[1:]):
            gap = extent(font, b)[0] - extent(font, a)[1]
            both_out = JACKS[a][2] and JACKS[b][2]
            letters = label_box(font, b)[0] - label_box(font, a)[1]
            good = letters >= 1.0 and (gap >= 0.5 or both_out)  # two plates may meet: one patch
            ok = ok and good
            print(f"{a} to {b}: {gap:.2f} mm between them, {letters:.2f} mm between their lettering"
                  + ("" if good else "  <-- too close"))
        edge_l, edge_r = extent(font, names[0])[0], W - extent(font, names[-1])[1]
        ok = ok and edge_l >= MARGIN - 0.01 and edge_r >= MARGIN - 0.01
        print(f"row at {row}: {edge_l:.2f} mm from the left edge, {edge_r:.2f} mm from the right")
    text, x, _, size, gap = wordmark(font)
    w = advance(font, text, size)
    left, right = x - w / 2, x + w / 2
    print(f"wordmark {size} mm: {left:.2f} to {right:.2f} mm; {left - gap[0]:.2f} mm clear of RETURN's stitches, "
          f"{gap[1] - right:.2f} mm clear of FX SEND's plate")
    up = min(plate(font, n)[1] for n in JACKS if JACKS[n][1] == ROW_UP and JACKS[n][2])
    print(f"the upper row's plates start {up - (MID_Y + MID_H):.2f} mm under the keys; "
          f"the lower row's start {plate(font, 'FX SEND')[1] - (ROW_UP + PLATE_DOWN):.2f} mm under the upper row's")
    return ok and left - gap[0] >= 1.0 and gap[1] - right >= 1.0


def positions():
    rows = ["| Widget | Centre x | Centre y | Width | Height |", "|---|---|---|---|---|"]

    def row(name, cx, cy, w, h):
        rows.append(f"| {name} | {cx:.2f} | {cy:.2f} | {w:.2f} | {h:.2f} |")

    dx, dy, dw, dh = DISPLAY_BOX
    row("display (inside the frame)", dx + dw / 2, dy + dh / 2, dw - 2 * FRAME, dh - 2 * FRAME)
    for n in range(16):
        r, c = divmod(n, 4)
        row(f"key {n + 1}", GRID_X + PITCH / 2 + c * PITCH, MID_Y + PITCH / 2 + r * PITCH, KEY, KEY)
    for name, x in SLIDERS.items():
        row(f"slider {name} (travel)", x, (SLIDER_TOP + SLIDER_BOTTOM) / 2, 5.0, SLIDER_BOTTOM - SLIDER_TOP)
    for label, x, y, w, h in fn_keys():
        row(label, x + w / 2, y + h / 2, w, h)
    for name, (x, y, out, multi, _) in JACKS.items():
        row(f"jack {name} ({'out' if out else 'in'}{', 16 channels' if multi else ''})", x, y, 8.0, 8.0)
    return "\n".join(rows)


def panel(font):
    dx, dy, dw, dh = DISPLAY_BOX
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">',
        rect(0, 0, W, H, GROUND),
        rect(dx, dy, dw, dh, ECRU),
        rect(dx + FRAME, dy + FRAME, dw - 2 * FRAME, dh - 2 * FRAME, DISPLAY),
    ]
    for x in DIVIDERS:  # a stitch every 2.5 mm
        y = MID_Y
        while y + 1.5 <= MID_Y + MID_H + 0.001:
            out.append(rect(x - 0.25, y, 0.5, 1.5, ECRU))
            y += 2.5
    for name, x in SLIDERS.items():
        out.append(rect(x - THREAD / 2, SLIDER_TOP, THREAD, SLIDER_BOTTOM - SLIDER_TOP, ECRU))
        out.append(outline(font, name, x, LETTER_Y, 3.0, ECRU))
    for name, (x, y, is_out, multi, lines) in JACKS.items():
        if is_out:
            out.append(rect(*plate(font, name), ECRU))
    px, py, pw, ph = plate(font, "AUDIO")
    fx, fy, fw, fh, ft = px + AUDIO_FRAME_IN, py + AUDIO_FRAME_IN, pw - 2 * AUDIO_FRAME_IN, ph - 2 * AUDIO_FRAME_IN, AUDIO_FRAME_T
    for r in ((fx, fy, fw, ft), (fx, fy + fh - ft, fw, ft), (fx, fy, ft, fh), (fx + fw - ft, fy, ft, fh)):
        out.append(rect(*r, GROUND))
    for name, (x, y, is_out, multi, lines) in JACKS.items():
        fill = GROUND if is_out else ECRU
        if multi:
            out.append(ticks(x, y, fill))
        size = AUDIO_TYPE if name == "AUDIO" else JACK_TYPE
        for i, line in enumerate(lines):
            out.append(outline(font, line, x, y - LABEL_ABOVE - LINE * (len(lines) - 1 - i), size, fill, tracking=JACK_TRACKING))
    text, x, y, size, _ = wordmark(font)
    out.append(outline(font, text, x, y, size, ECRU))
    out.append("</svg>")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--positions" in sys.argv:
        print(positions())
    elif "--check" in sys.argv:
        sys.exit(0 if check(TTFont(args[0] if args else FONT)) else 1)
    else:
        target = Path(__file__).with_name("panel.svg")
        target.write_text(panel(TTFont(args[0] if args else FONT)))
        print(f"wrote {target}")
