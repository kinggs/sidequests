# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools"]
# ///
"""Draw the static Rack panel for the Loom design as a flat SVG, in millimetres.

    uv run pocket-instruments/design/make_panel.py              writes panel.svg beside this file
    uv run pocket-instruments/design/make_panel.py --positions  prints the widget positions

The panel holds only what never changes: the body, the display's frame, the stitched
dividers, the slider threads, the marks round the outputs and the lettering. Keys, slider caps, the display and the jack
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

# Only the Bold cut is installed on the machine this was first run on. The design asks for
# ExtraBold (800). Pass another font file as the last argument to change it.
FONT = "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Bold.ttf"

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

JACK_Y = 116.3
JACKS = {"CLOCK": 10.67, "RESET": 22.33, "TRIGGERS": 80.67, "VOICES": 95.17, "AUDIO": 109.67}
OUTPUTS = ("TRIGGERS", "VOICES", "AUDIO")
JACK_LABEL_Y = 109.7
# One pale plate under all three outputs: VCV's panel guide asks for an inverted background
# on output ports (R33). A first draft had a stitched box round them and a plate under AUDIO
# only; that left two outputs on the dark ground, so it went.
PLATE = (72.6, 106.4, 43.4, 15.6)
AUDIO_FRAME = (103.0, 107.0, 12.6, 14.6, 0.6)  # x, y, w, h, thickness: marks the main output
MULTI = ("TRIGGERS", "VOICES")  # sixteen channels on one cable: sixteen stitches round the socket
TICK_IN, TICK_OUT, TICK_W = 4.4, 5.2, 0.5

# It sat at x 63 until the outputs became three (2026-11-19); it moved left to clear them.
WORDMARK = ("Pocket Instruments", 49.0, 118.2, 3.5)

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
    for name, x in JACKS.items():
        row(f"jack {name}", x, JACK_Y, 8.0, 8.0)
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
    out.append(rect(*PLATE, ECRU))
    fx, fy, fw, fh, ft = AUDIO_FRAME
    for r in ((fx, fy, fw, ft), (fx, fy + fh - ft, fw, ft), (fx, fy, ft, fh), (fx + fw - ft, fy, ft, fh)):
        out.append(rect(*r, GROUND))
    for name in MULTI:
        out.append(ticks(JACKS[name], JACK_Y, GROUND))
    for name, x in JACKS.items():
        fill = GROUND if name in OUTPUTS else ECRU
        size = AUDIO_TYPE if name == "AUDIO" else JACK_TYPE
        out.append(outline(font, name, x, JACK_LABEL_Y, size, fill, tracking=JACK_TRACKING))
    text, x, y, size = WORDMARK
    out.append(outline(font, text, x, y, size, ECRU))
    out.append("</svg>")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--positions" in sys.argv:
        print(positions())
    else:
        target = Path(__file__).with_name("panel.svg")
        target.write_text(panel(TTFont(args[0] if args else FONT)))
        print(f"wrote {target}")
