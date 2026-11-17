# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10.1", "numpy>=1.26", "pillow-heif>=0.16"]
# ///
"""Pocket Editor's engine: applies recipes to photos. No model calls, nothing built in.

    uv run pocket-editor/engine.py inbox   <zip or folder> <album>  copy photos and videos into <album>/inbox
    uv run pocket-editor/engine.py small   <album>                 downscaled copies for judging
    uv run pocket-editor/engine.py render  <album> [--style S] [--out done] [--only FILE]
    uv run pocket-editor/engine.py compare <album> --styles A.json B.json [--only FILE]
    uv run pocket-editor/engine.py generate <album> FILE [--via codex agy]   an image model's edit, kept in gen/
    uv run pocket-editor/engine.py fourway <album>                 original, engine, generated, tone transfer

Photos are edited with Pillow and numpy. Videos are tidied with ffmpeg: trimmed, steadied, given the
album style as a colour table, and their sound evened out.

An album is a folder holding `inbox/` (the originals, never written to) and `recipes.json`.
SPEC.md says what each recipe field and style field means.
"""
import argparse
import json
import math
import shutil
import textwrap
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).parent
PHOTO_EXT = {".jpg", ".jpeg", ".heic", ".heif", ".png"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".3gp"}
VERDICTS = {"great", "fine", "drop", "as-is"}
ADJUST = {  # field: (low, high)
    "ev": (-3, 3), "temp": (-0.5, 0.5), "tint": (-0.5, 0.5), "shadows": (-1, 1),
    "highlights": (-1, 1), "contrast": (-1, 1), "vibrance": (-1, 1), "clarity": (-1, 1),
    "saturation": (-1, 1), "glow": (0, 1), "fade": (0, 1), "grain": (0, 1),
}
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
# Lightroom's eight colour bands, by hue angle.
BANDS = {"red": 0, "orange": 30, "yellow": 60, "green": 120, "aqua": 180, "blue": 240,
         "purple": 270, "magenta": 300}
PRIMARIES = {"red": 0, "green": 120, "blue": 240}
HUE_DEG_PER_UNIT = 0.3  # a Lightroom hue slider at 100 moves a band about 30 degrees


# ---------- recipes ----------

def validate(recipes):
    """Return a list of problems with a recipes document; empty means valid."""
    errs = []
    photos = recipes.get("photos") if isinstance(recipes, dict) else None
    if not isinstance(photos, list):
        return ["recipes.json needs a 'photos' list"]
    seen = set()
    for i, r in enumerate(photos):
        name = r.get("file", f"#{i}")
        def bad(msg): errs.append(f"{name}: {msg}")
        if not isinstance(r.get("file"), str): bad("needs 'file'")
        if name in seen: bad("listed twice")
        seen.add(name)
        if r.get("verdict") not in VERDICTS: bad(f"verdict must be one of {sorted(VERDICTS)}")
        if r.get("verdict") == "drop" and not r.get("reason"): bad("a drop needs a reason")
        c = r.get("crop")
        if c is not None:
            ok = (isinstance(c, list) and len(c) == 4 and all(isinstance(v, (int, float)) for v in c)
                  and 0 <= c[0] < c[2] <= 1 and 0 <= c[1] < c[3] <= 1)
            if not ok: bad("crop must be [x0, y0, x1, y1] as fractions, x0<x1, y0<y1")
        s = r.get("straighten_deg", 0)
        if not isinstance(s, (int, float)) or abs(s) > 15: bad("straighten_deg must be within ±15")
        if r.get("light", "day") not in ("day", "night"): bad("light must be 'day' or 'night'")
        for f in r.get("faces") or []:
            b = f.get("box") if isinstance(f, dict) else None
            if not (isinstance(b, list) and len(b) == 4 and 0 <= b[0] < b[2] <= 1 and 0 <= b[1] < b[3] <= 1):
                bad("each face needs a box [x0, y0, x1, y1] as fractions of the whole photo")
            elif not (0 <= f.get("lift", 0) <= 1 and 0 <= f.get("calm", 0) <= 1):
                bad("face lift and calm must be within 0..1")
        g = r.get("generative")
        if g is not None and not (isinstance(g, dict) and isinstance(g.get("file"), str)):
            bad("generative must be null or {file, strength}")
        for k, v in (r.get("adjust") or {}).items():
            if k not in ADJUST: bad(f"unknown adjust field '{k}'")
            elif not isinstance(v, (int, float)) or not ADJUST[k][0] <= v <= ADJUST[k][1]:
                bad(f"adjust.{k} must be within {ADJUST[k]}")
    for i, v in enumerate(recipes.get("videos") or []):
        name = v.get("file", f"video #{i}")
        def bad(msg): errs.append(f"{name}: {msg}")
        if not isinstance(v.get("file"), str): bad("needs 'file'")
        if v.get("verdict", "keep") not in ("keep", "drop", "as-is"): bad("a video's verdict is keep, drop or as-is")
        if v.get("verdict") == "drop" and not v.get("reason"): bad("a drop needs a reason")
        if v.get("light", "auto") not in ("auto", "day", "night"): bad("light must be auto, day or night")
        for k in ("trim_start", "trim_end"):
            if not isinstance(v.get(k, 0), (int, float)) or v.get(k, 0) < 0: bad(f"{k} must be seconds, 0 or more")
        for k, val in (v.get("adjust") or {}).items():
            if k not in ADJUST: bad(f"unknown adjust field '{k}'")
            elif not isinstance(val, (int, float)) or not ADJUST[k][0] <= val <= ADJUST[k][1]:
                bad(f"adjust.{k} must be within {ADJUST[k]}")
    return errs


# ---------- building blocks ----------

def luma(rgb):
    return rgb @ LUMA


def box(a, r):
    """Mean over a (2r+1) square, edges reflected."""
    p = np.pad(a, r, mode="reflect").astype(np.float64)
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    h, w = a.shape
    s = c[k:k + h, k:k + w] - c[:h, k:k + w] - c[k:k + h, :w] + c[:h, :w]
    return (s / (k * k)).astype(np.float32)


def resize_f(a, size):
    return np.asarray(Image.fromarray(a, mode="F").resize(size, Image.BILINEAR), dtype=np.float32)


def smooth_base(lum, radius_frac=0.04, eps=0.01):
    """An edge-aware blur of luminance (a fast guided filter).

    A plain blur spills across edges, so lifting shadows by it leaves a halo round every dark
    shape against a bright one (the taste test's flaw). This keeps the edge where the photo has
    one: the mask is flat inside a region and steps at its border.
    """
    h, w = lum.shape
    sw, sh = small_size(w, h)
    small = resize_f(lum, (sw, sh))
    return np.clip(guided(lum, small, small, radius_frac, eps), 0, 1)


def small_size(w, h, long_side=480):
    f = max(1, round(max(w, h) / long_side))
    return max(8, w // f), max(8, h // f)


def guided(guide_full, guide_small, p_small, radius_frac=0.04, eps=0.01):
    """Smooth `p_small` so that it follows the edges of the guide, at the guide's full size."""
    h, w = guide_full.shape
    r = max(2, round(max(guide_small.shape) * radius_frac))
    mi, mp = box(guide_small, r), box(p_small, r)
    a = (box(guide_small * p_small, r) - mi * mp) / (box(guide_small * guide_small, r) - mi * mi + eps)
    b = mp - a * mi
    return resize_f(box(a, r), (w, h)) * guide_full + resize_f(box(b, r), (w, h))


def to_small(im, size):
    return np.asarray(im.convert("RGB").resize(size, Image.LANCZOS), dtype=np.float32) / 255


def alignment(orig_im, gen_im):
    """How well the generated picture's shapes sit on the original's: 1 is the same picture, 0 unrelated.

    Tone transfer lays the generated light over the original's detail, so a generated image that
    was reframed, stretched or redrawn would paint its light in the wrong places.
    """
    size = small_size(*orig_im.size, long_side=256)
    def detail(im):
        y = luma(to_small(im, size))
        d = y - box(y, 5)
        return d - d.mean()
    a, b = detail(orig_im), detail(gen_im)
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def tone_transfer(rgb, orig_im, gen_im, strength=1.0, reach=0.03):
    """The generated image's colour and light, on the original's own pixels.

    Per channel, how much brighter the generated image is than the original is measured on small
    copies, smoothed along the original's edges, and multiplied into the full-size original. No
    detail comes from the generated image, so faces and resolution are the original's.
    """
    size = small_size(*orig_im.size)
    o, g = to_small(orig_im, size), to_small(gen_im, size)
    guide_small, guide_full = luma(o), luma(rgb)
    out = np.empty_like(rgb)
    for i in range(3):
        ratio = np.clip((box(g[..., i], 2) + 0.03) / (box(o[..., i], 2) + 0.03), 0.4, 2.5)
        full = np.clip(guided(guide_full, guide_small, ratio, reach, 0.005), 0.4, 2.5)
        out[..., i] = rgb[..., i] * (1 + strength * (full - 1))
    out = np.clip(out, 0, 1)

    # The step above moves light region by region, which leaves the generated image's contrast and
    # richness behind (its blacks were deeper, its colour fuller). Match those across the whole
    # picture: one tone curve and one saturation factor, so again no detail changes hands.
    q = np.linspace(0, 1, 17)
    step = max(1, max(out.shape[:2]) // 600)
    mine = out[::step, ::step]
    have, want = np.quantile(luma(mine), q), np.quantile(luma(g), q)
    have = np.maximum.accumulate(have + np.arange(17) * 1e-6)  # strictly rising, for the lookup
    # A model that smoothed the picture has a narrow spread of tones; copying that exactly would
    # flatten the original's texture. So the curve may not be flatter than 0.6 or steeper than 1.8.
    rise = np.clip(np.diff(want), 0.6 * np.diff(have), 1.8 * np.diff(have))
    want = np.concatenate([[0.0], np.cumsum(rise)])
    want += np.quantile(luma(g), 0.5) - want[8]  # keep the middle where the generated image has it
    y = luma(out)
    gain = (np.interp(y, have, want).astype(np.float32) + 0.02) / (y + 0.02)
    out = out * (1 + strength * (np.clip(gain, 0.5, 2.0) - 1))[..., None]
    k = hue_sat(g)[1].mean() / max(float(hue_sat(np.clip(out[::step, ::step], 0, 1))[1].mean()), 1e-3)
    out = scale_chroma(out, 1 + strength * (float(np.clip(k, 0.8, 1.4)) - 1))
    return np.clip(out, 0, 1)


def scale_chroma(rgb, k):
    y = luma(rgb)[..., None]
    return y + (rgb - y) * (k[..., None] if isinstance(k, np.ndarray) else k)


def hue_sat(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.where(d > 1e-6, d, 1)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4))
    return np.where(d > 1e-6, h * 60.0, 0.0), d / np.maximum(mx, 1e-6)


def skin_weight(hue):
    """1 for hues between red and orange, where skin of every tone sits; fading out by 20 degrees."""
    d = np.abs((hue - 22 + 180) % 360 - 180)
    return np.clip(1 - (d - 22) / 20, 0, 1).astype(np.float32)


def face_mask(shape, faces, key):
    """A soft oval over each face box (fractions of this frame), weighted by that face's setting."""
    h, w = shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    m = np.zeros((h, w), np.float32)
    for f in faces or []:
        amount = f.get(key, 0)
        if not amount:
            continue
        x0, y0, x1, y1 = f["box"]
        cx, cy = (x0 + x1) / 2 * w, (y0 + y1) / 2 * h
        rx, ry = max((x1 - x0) * w * 0.75, 1), max((y1 - y0) * h * 0.75, 1)  # a little past the box
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        m = np.maximum(m, amount * np.clip((1 - d) / 0.45, 0, 1) ** 2 * (3 - 2 * np.clip((1 - d) / 0.45, 0, 1)))
    return m


def band_weights(hue, centres):
    """Triangular weights that sum to 1: each pixel is shared by its two nearest bands."""
    names = sorted(centres, key=centres.get)
    out = {}
    for i, n in enumerate(names):
        c = centres[n]
        left = (c - centres[names[i - 1]]) % 360
        right = (centres[names[(i + 1) % len(names)]] - c) % 360
        d = (hue - c + 180) % 360 - 180
        out[n] = np.clip(np.where(d < 0, 1 + d / left, 1 - d / right), 0, 1).astype(np.float32)
    return out


def rotate_hue(rgb, deg):
    """Turn each pixel's colour round the grey axis; positive runs red, yellow, green."""
    t = np.deg2rad(deg)[..., None]
    m = rgb.mean(-1, keepdims=True)
    c = rgb - m
    cross = np.stack([c[..., 2] - c[..., 1], c[..., 0] - c[..., 2], c[..., 1] - c[..., 0]], -1) / math.sqrt(3)
    return m + c * np.cos(t) + cross * np.sin(t)


def colour_bands(rgb, settings, centres, lum_scale=0.5):
    """Hue, saturation and luminance per band: {"green": {"hue": -21, "sat": -33, "lum": -35}}."""
    if not settings:
        return rgb
    hue, sat = hue_sat(np.clip(rgb, 0, 1))
    w = band_weights(hue, centres)
    dh = np.zeros(hue.shape, np.float32)
    ks = np.ones(hue.shape, np.float32)
    kl = np.ones(hue.shape, np.float32)
    for name, s in settings.items():
        if name not in centres:
            raise ValueError(f"unknown colour band '{name}'")
        dh += w[name] * s.get("hue", 0) * HUE_DEG_PER_UNIT
        ks += w[name] * s.get("sat", 0) / 100
        kl += w[name] * sat * s.get("lum", 0) / 100 * lum_scale  # greys have no band, so no change
    out = rotate_hue(rgb, dh) if np.any(dh) else rgb
    return scale_chroma(out, np.maximum(ks, 0)) * kl[..., None]


def curve_lut(points, n=1024):
    """A smooth curve through control points given on a 0..255 scale, with no overshoot."""
    pts = sorted((float(x) / 255, float(y) / 255) for x, y in points)
    x, y = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
    h, d = np.diff(x), np.diff(y) / np.diff(x)
    m = np.zeros_like(x)
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, len(x) - 1):  # Fritsch-Carlson: flat where the slope changes sign
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    t = np.linspace(0, 1, n)
    i = np.clip(np.searchsorted(x, t, side="right") - 1, 0, len(x) - 2)
    s = (t - x[i]) / h[i]
    out = ((2 * s**3 - 3 * s**2 + 1) * y[i] + (s**3 - 2 * s**2 + s) * h[i] * m[i]
           + (-2 * s**3 + 3 * s**2) * y[i + 1] + (s**3 - s**2) * h[i] * m[i + 1])
    out = np.where(t < x[0], y[0], np.where(t > x[-1], y[-1], out))
    return np.clip(out, 0, 1).astype(np.float32)


def apply_lut(ch, lut, strength=1.0):
    v = np.interp(ch, np.linspace(0, 1, len(lut)), lut).astype(np.float32)
    return ch + (v - ch) * strength


# ---------- the edit ----------

def for_light(style, light):
    """The style as it applies in this light: `night` in a style file overrides the day values."""
    over = (style or {}).get(light) if light != "day" else None
    if not over:
        return style or {}
    out = {k: v for k, v in style.items() if k != light}
    for k, v in over.items():
        out[k] = {**out.get(k, {}), **v} if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def grade(rgb, adjust=None, style=None, keep_colour=False, light="day", seed=0, faces=None, pointwise=False):
    """rgb is float32 0..1, sRGB. Returns the same shape. A neutral call returns its input."""
    style = for_light(style, light)
    a = {k: 0.0 for k in ADJUST}
    for src in (style.get("adjust") or {}, adjust or {}):
        for k, v in src.items():
            a[k] += v
    if keep_colour:  # coloured light is the point of the photo: leave white balance alone
        a["temp"] = a["tint"] = 0.0
    out = rgb.astype(np.float32)

    if a["ev"] or a["temp"] or a["tint"]:
        lin = np.clip(out, 0, 1) ** 2.2 * 2.0 ** a["ev"]
        lin = lin * np.array([1 + a["temp"], 1 - a["tint"], 1 - a["temp"]], np.float32)
        t = 0.8  # roll off into white, so a brightened sky fades and does not clip to a flat patch
        lin = np.where(lin > t, t + (1 - t) * np.tanh((lin - t) / (1 - t)), lin)
        out = lin ** (1 / 2.2)

    if a["shadows"] or a["highlights"]:
        # Pointwise (for video, where the edit must be a colour table): each pixel is its own
        # region, so shadows and highlights become a tone curve and lose their edge-awareness.
        base = luma(np.clip(out, 0, 1)) if pointwise else smooth_base(luma(np.clip(out, 0, 1)))
        gain = 1 + 1.5 * a["shadows"] * (1 - base) ** 3 - 0.6 * a["highlights"] * base ** 3
        out = out * gain[..., None]

    lift = face_mask(out.shape, faces, "lift")
    if lift.any():  # brighten the faces themselves, where a region-wide shadow lift cannot tell
        out = out * (1 + lift)[..., None]

    if a["contrast"]:
        x = np.clip(out, 0, 1)
        out = x + a["contrast"] * (x * x * (3 - 2 * x) - x)

    if pointwise:  # these need neighbouring pixels, which a colour table has none of
        a["clarity"] = a["glow"] = a["grain"] = 0.0
    if a["clarity"]:
        y = luma(np.clip(out, 0, 1))
        detail = y - smooth_base(y, radius_frac=0.08, eps=0.04)
        mid = 1 - np.abs(2 * y - 1) ** 2  # leave deep shadow and bright highlight alone
        out = out * ((y + a["clarity"] * detail * mid + 1e-4) / (y + 1e-4))[..., None]

    out = colour_bands(out, style.get("calibration"), PRIMARIES, lum_scale=0)
    out = colour_bands(out, style.get("hsl"), BANDS)

    if a["saturation"]:
        out = scale_chroma(out, 1 + a["saturation"])
    if a["vibrance"]:
        hue, sat = hue_sat(np.clip(out, 0, 1))
        # Boosting skin like everything else turns faces red, so it gets half the boost
        # (the owner's setting; a quarter looked too held back).
        out = scale_chroma(out, 1 + a["vibrance"] * (1 - sat) * (1 - 0.5 * skin_weight(hue)))

    calm = face_mask(out.shape, faces, "calm")
    if calm.any():  # take the red out of a flushed or sunburnt face, and nothing else
        hue, _ = hue_sat(np.clip(out, 0, 1))
        out = scale_chroma(out, 1 - calm * skin_weight(hue))

    out = np.clip(out, 0, 1)
    curves = style.get("curves") or {}
    strength = curves.get("strength", 1.0)
    for i, ch in enumerate("rgb"):
        pts = curves.get(ch) or curves.get("rgb")
        if pts:
            out[..., i] = apply_lut(out[..., i], curve_lut(pts), strength)
    if curves.get("master"):
        lut = curve_lut(curves["master"])
        for i in range(3):
            out[..., i] = apply_lut(out[..., i], lut, curves.get("master_strength", 1.0))

    if a["glow"]:  # light bleeding out of the bright parts, as haze does round stage lights
        h, w = out.shape[:2]
        f = max(1, round(max(h, w) / 320))
        sw, sh = max(8, w // f), max(8, h // f)
        r = max(2, round(max(sw, sh) * 0.05))
        for i in range(3):
            soft = resize_f(box(box(resize_f(np.ascontiguousarray(out[..., i]), (sw, sh)) ** 2, r), r), (w, h))
            out[..., i] = 1 - (1 - out[..., i]) * (1 - 0.6 * a["glow"] * soft)
    if a["fade"]:  # blacks lifted to dark grey: 1.0 puts black at about 35 of 255
        out = out + a["fade"] * 0.14 * (1 - out)
    if a["grain"]:
        y = luma(out)
        noise = np.random.default_rng(seed).normal(0, 0.05 * a["grain"], y.shape).astype(np.float32)
        out = out + (noise * (1 - np.abs(2 * y - 1) ** 2 * 0.7))[..., None]
    return np.clip(out, 0, 1)


def open_photo(path):
    """The photo upright as RGB, with its EXIF (orientation reset) and colour profile."""
    if path.suffix.lower() in {".heic", ".heif"}:
        import pillow_heif
        pillow_heif.register_heif_opener()
    im = Image.open(path)
    exif = im.getexif()
    icc = im.info.get("icc_profile")
    im = ImageOps.exif_transpose(im).convert("RGB")
    exif[0x0112] = 1
    return im, exif, icc


def frame(im, crop=None, straighten_deg=0):
    if straighten_deg:
        w, h = im.size
        im = im.rotate(straighten_deg, Image.BICUBIC)
        t = math.radians(abs(straighten_deg))
        k = 1 / (math.cos(t) + max(w / h, h / w) * math.sin(t))  # largest same-shape box inside
        cw, ch = w * k, h * k
        im = im.crop((round((w - cw) / 2), round((h - ch) / 2), round((w + cw) / 2), round((h + ch) / 2)))
    if crop:
        w, h = im.size
        im = im.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
    return im


def edit(path, recipe, style):
    """Apply one recipe to one original. Returns (image, exif, icc); the original is not touched."""
    im, exif, icc = open_photo(path)
    gen = recipe.get("generative")
    if gen:  # before the crop, because the generated image is of the whole frame
        gen_im = Image.open(path.parent.parent / gen["file"]).convert("RGB")
        rgb = tone_transfer(np.asarray(im, dtype=np.float32) / 255, im, gen_im, gen.get("strength", 1.0))
        im = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8))
        # The model's edit is a finished look. The album style on top of it would be a second
        # grade, so it is skipped unless the recipe asks; the recipe's own adjust still applies.
        if not gen.get("style"):
            style = {}
    crop = recipe.get("crop")
    im = frame(im, crop, recipe.get("straighten_deg", 0))
    rgb = np.asarray(im, dtype=np.float32) / 255
    seed = sum(path.name.encode())  # the same grain every time a photo is re-rendered
    out = grade(rgb, recipe.get("adjust"), style, recipe.get("keep_colour", False), recipe.get("light", "day"),
                seed, faces_in_crop(recipe.get("faces"), crop))
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8)), exif, icc


def faces_in_crop(faces, crop):
    """Face boxes are given on the whole upright photo; move them into the cropped frame."""
    if not faces or not crop:
        return faces
    cx0, cy0, cx1, cy1 = crop
    w, h = cx1 - cx0, cy1 - cy0
    return [{**f, "box": [(f["box"][0] - cx0) / w, (f["box"][1] - cy0) / h,
                          (f["box"][2] - cx0) / w, (f["box"][3] - cy0) / h]} for f in faces]


def save_jpeg(im, path, exif=None, icc=None, quality=93):
    kw = {"quality": quality, "subsampling": 0, "optimize": True}
    if exif is not None: kw["exif"] = exif.tobytes()
    if icc: kw["icc_profile"] = icc
    im.save(path, "JPEG", **kw)


# ---------- album commands ----------

def load_album(album):
    album = Path(album)
    inbox = album / "inbox"
    if not inbox.is_dir():
        sys.exit(f"No inbox folder in {album}")
    rp = album / "recipes.json"
    recipes = json.loads(rp.read_text()) if rp.exists() else {"photos": []}
    return album, inbox, recipes


def photos_in(inbox):
    return sorted(p for p in inbox.iterdir() if p.suffix.lower() in PHOTO_EXT)


def load_style(path):
    p = Path(path)
    if not p.exists():
        p = HERE / path
    return json.loads(p.read_text())


def font(size):
    return ImageFont.load_default(size=size)


# ---------- video ----------

VIDEO_TIDY = 2  # raise this when the tidy itself changes, so finished clips are made again

def run(cmd, cwd=None):
    import subprocess
    r = subprocess.run(cmd, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{cmd[0]} failed:\n{r.stderr[-1500:]}")
    return r


def video_info(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)])
    d = json.loads(r.stdout)
    return float(d["format"]["duration"]), any(s["codec_type"] == "audio" for s in d["streams"])


def video_frame(path, at, width=480):
    """One frame of a video, upright, as an image."""
    import io
    import subprocess
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{at:.2f}", "-i", str(path), "-frames:v", "1",
                        "-vf", f"scale={width}:-2", "-f", "image2pipe", "-c:v", "png", "-"],
                       stdin=subprocess.DEVNULL, capture_output=True)
    return Image.open(io.BytesIO(r.stdout)).convert("RGB")


def video_light(path, duration):
    """Day or night, from how dark the middle frame is. The judge's own call overrides this."""
    y = luma(np.asarray(video_frame(path, duration / 2, 160), dtype=np.float32) / 255)
    return "night" if np.median(y) < 0.2 else "day"


def write_cube(path, style, adjust, light, keep_colour, n=33):
    """The style as a colour table ffmpeg can apply to every frame (a .cube file)."""
    v = np.linspace(0, 1, n, dtype=np.float32)
    b, g, r = np.meshgrid(v, v, v, indexing="ij")  # red changes fastest, as the format wants
    lattice = np.stack([r, g, b], -1).reshape(n * n, n, 3)
    out = grade(lattice, adjust, style, keep_colour, light, pointwise=True).reshape(-1, 3)
    with open(path, "w") as f:
        f.write(f"LUT_3D_SIZE {n}\n")
        f.writelines(f"{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n" for p in out)


def tidy_video(src, dst, recipe, style, work):
    """One clip: trimmed, steadied, graded like the photos, and its sound evened out."""
    duration, has_audio = video_info(src)
    start = recipe.get("trim_start", 0)
    length = duration - start - recipe.get("trim_end", 0)
    if length <= 0.2:
        sys.exit(f"{src.name}: the trims leave nothing")
    light = recipe.get("light", "auto")
    if light == "auto":
        light = video_light(src, duration)
    keep_colour = recipe.get("keep_colour", light == "night")  # at night the coloured light is the point
    work.mkdir(parents=True, exist_ok=True)
    write_cube(work / "look.cube", style, recipe.get("adjust"), light, keep_colour)
    cut = ["-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(src.resolve())]
    filters = []
    # Steadying is for daylight. In the dark the frames are blurred and grainy, the stabiliser
    # has nothing firm to hold on to, and it makes the picture wobble instead.
    if recipe.get("stabilise", light == "day"):
        # Two passes: measure the shake, then counter it. Gentle (it smooths over 13 frames), so a
        # deliberate pan stays a pan and the picture is zoomed in only a little to hide the edges.
        # At 25 frames the first album lost about a sixth of every frame to that zoom.
        run(["ffmpeg", "-v", "error", "-y", *cut, "-vf", "format=yuv420p,vidstabdetect=shakiness=5:accuracy=15:result=shake.trf",
             "-f", "null", "-"], cwd=work)
        # vid.stab only takes plain yuv420p, and aborts on anything else.
        filters += ["format=yuv420p",
                    "vidstabtransform=input=shake.trf:smoothing=6:optzoom=1:interpol=bicubic"]
    filters += ["lut3d=file=look.cube:interp=tetrahedral", "format=yuv420p"]
    audio = ["-an"]
    if has_audio:
        # Measure the loudness first, then correct by one fixed amount, so the music does not pump.
        m = run(["ffmpeg", "-v", "info", "-y", *cut, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
                 "-f", "null", "-"], cwd=work).stderr
        j = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
        audio = ["-af", ("loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I={input_i}:measured_TP={input_tp}:"
                         "measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset},"
                         "aresample=48000").format(**j), "-c:a", "aac", "-b:a", "192k"]
    run(["ffmpeg", "-v", "error", "-y", *cut, "-vf", ",".join(filters), "-c:v", "libx264", "-crf", "21",
         "-preset", "medium", "-pix_fmt", "yuv420p", *audio, "-map_metadata", "0", "-movflags", "+faststart",
         str(dst.resolve())], cwd=work)
    return light, length


def render_videos(album, inbox, recipes, style, done, only=None):
    """Every clip in the inbox. One with no entry in recipes.json is kept and tidied with the defaults."""
    import hashlib
    entries = {v["file"]: v for v in recipes.get("videos") or []}
    out = done / "videos"
    cache_file = album / ".video-cache.json"
    cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    vids = [p for p in sorted(inbox.iterdir()) if p.suffix.lower() in VIDEO_EXT]
    if vids:
        out.mkdir(parents=True, exist_ok=True)
    kept = set()
    for v in vids:
        r = entries.get(v.name, {"file": v.name})
        dst = out / (v.stem + ".mp4")
        if r.get("verdict") == "drop":
            continue
        kept.add(dst.name)
        if only and v.name != only:
            continue
        key = hashlib.sha256(json.dumps([VIDEO_TIDY, r, style, v.stat().st_size, str(out)], sort_keys=True).encode()).hexdigest()
        if cache.get(v.name) == key and dst.exists():
            continue  # nothing about this clip changed since it was last made
        if r.get("verdict") == "as-is":
            shutil.copy2(v, dst)
            print(f"  as-is {dst.name}")
        else:
            light, length = tidy_video(v, dst, r, style, album / ".video-work" / v.stem)
            print(f"  video {dst.name}  {length:.1f}s  {light}")
        cache[v.name] = key
        cache_file.write_text(json.dumps(cache, indent=1))
    if not only and out.is_dir():  # a clip dropped since the last render must not linger
        for old in out.iterdir():
            if old.name not in kept:
                old.unlink()
    return len(kept)


def cmd_inbox(args):
    """Bring photos into a new album from a zip (a Google Photos download) or a folder. Copies only."""
    import zipfile
    src, inbox = Path(args.source).expanduser(), Path(args.album) / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    wanted = PHOTO_EXT | VIDEO_EXT
    n = skipped = 0
    def take(name, read):
        nonlocal n, skipped
        dst = inbox / Path(name).name  # flat, and never outside the inbox whatever the zip says
        if Path(name).suffix.lower() not in wanted or Path(name).name.startswith("."):
            return
        if dst.exists():
            skipped += 1
            return
        dst.write_bytes(read())
        n += 1
    if src.is_dir():
        for p in sorted(src.rglob("*")):
            if p.is_file():
                take(p.name, p.read_bytes)
                if (inbox / p.name).exists():
                    shutil.copystat(p, inbox / p.name)
    elif zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            for info in z.infolist():
                if not info.is_dir():
                    take(info.filename, lambda i=info: z.read(i))
    else:
        sys.exit(f"{src} is neither a folder nor a zip")
    print(f"{n} files into {inbox}" + (f" ({skipped} already there)" if skipped else ""))


GEN_PROMPT = """Do a professional photo edit of the attached photo, in.jpg, with your built-in image \
generation tool (not with code, ImageMagick or Python).

The look: {look}

Change light and colour only. Keep the framing exactly: same crop, same shape, nothing moved, \
added, removed or redrawn. The same people with the same faces, the same objects, the same text. \
Do not sharpen, smooth skin or invent detail.

Save the result as out.png in the current directory, and say in one line what you changed."""
GEN_LOOK = ("Leica colouring. A gentle HDR balance: shadows opened, bright skies held, nothing flat or grey. "
            "Sunsets and skies slightly richer than life. Natural skin.")
GEN_TOOLS = {
    "codex": lambda d, prompt: ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "-s", "workspace-write",
                                "-C", str(d), "-i", "in.jpg", "--", prompt],
    # Headless agy denies every tool it cannot ask about, so it is allowed this one folder, for this run only.
    "agy": lambda d, prompt: ["agy", "--print", prompt, "--print-timeout", "8m", "--settings", json.dumps(
        {"permissions": {"allow": [f"read_file({d}/**)", f"write_file({d}/**)", f"list_dir({d})", "generate_image"]}})],
}


def cmd_generate(args):
    """Ask an image model for its edit of one photo. Its picture is only ever a source of light and colour."""
    import subprocess
    import time
    album, inbox, _ = load_album(args.album)
    src = inbox / args.file
    work = album / "gen" / src.stem
    work.mkdir(parents=True, exist_ok=True)
    im, _, _ = open_photo(src)
    small = im.copy()
    small.thumbnail((1536, 1536))  # the model returns about this size whatever it is sent
    small.save(work / "in.jpg", quality=92)
    look = args.look or GEN_LOOK
    for tool in args.via:
        out, kept = work / "out.png", work / f"{tool}.png"
        out.unlink(missing_ok=True)
        t = time.time()
        r = subprocess.run(GEN_TOOLS[tool](work.resolve(), GEN_PROMPT.format(look=look)), cwd=work,
                           stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=600)
        (work / f"{tool}.log").write_text(r.stdout[-6000:] + "\n--- stderr\n" + r.stderr[-3000:])
        if not out.exists():
            print(f"  {tool}: no image after {time.time() - t:.0f}s (see {work / (tool + '.log')})")
            continue
        out.rename(kept)
        g = Image.open(kept)
        print(f"  {tool}: {g.size[0]}x{g.size[1]} in {time.time() - t:.0f}s, alignment {alignment(im, g):.2f}"
              f" (sent {small.size[0]}x{small.size[1]})")


def cmd_fourway(args):
    """Original, engine, generated, tone-transferred: one sheet per photo and tool, in <album>/fourway/."""
    album, inbox, recipes = load_album(args.album)
    style = load_style(args.style)
    out = album / "fourway"
    out.mkdir(exist_ok=True)
    for i, r in enumerate(recipes["photos"], 1):
        stem = Path(r["file"]).stem
        for gen in sorted((album / "gen" / stem).glob("*.png")) if (album / "gen" / stem).is_dir() else []:
            src = inbox / r["file"]
            crop, deg = r.get("crop"), r.get("straighten_deg", 0)
            orig = open_photo(src)[0]
            g = Image.open(gen).convert("RGB")
            score = alignment(orig, g)
            plain = {k: v for k, v in r.items() if k not in ("adjust", "generative")}
            toned = {**plain, "generative": {"file": str(gen.relative_to(album)), "strength": args.strength}}
            tiles = [("original", frame(orig, crop, deg)), ("engine", edit(src, r, style)[0]),
                     (f"{gen.stem}, as generated", frame(g.resize(orig.size, Image.LANCZOS), crop, deg)),
                     (f"{gen.stem}, tone transfer ({score:.2f})", edit(src, toned, style)[0])]
            for _, t in tiles:
                t.thumbnail((args.size, args.size))
            w, h = tiles[0][1].size
            cols = 2 if w > h * 1.3 else 4
            rows = math.ceil(4 / cols)
            sheet = Image.new("RGB", (cols * (w + 10) - 10, rows * (h + 44)), (18, 18, 20))
            d = ImageDraw.Draw(sheet)
            for k, (name, t) in enumerate(tiles):
                x, y = (k % cols) * (w + 10), (k // cols) * (h + 44)
                sheet.paste(t, (x, y + 44))
                d.text((x + 6, y + 8), name, font=font(24), fill=(230, 230, 235))
            sheet.save(out / f"{i:02d}_{stem}_{gen.stem}.jpg", quality=90)
            print(f"  {i:02d} {stem} {gen.stem}: alignment {score:.2f}")


def cmd_small(args):
    album, inbox, _ = load_album(args.album)
    out = album / "small"
    out.mkdir(exist_ok=True)
    for i, p in enumerate(photos_in(inbox), 1):
        im, _, _ = open_photo(p)
        im.thumbnail((args.size, args.size))
        im.save(out / f"{i:02d}_{p.stem}.jpg", quality=85)
    vids = [p for p in sorted(inbox.iterdir()) if p.suffix.lower() in VIDEO_EXT]
    for i, v in enumerate(vids, 1):  # five frames across each clip, so a video can be judged by reading
        duration, _ = video_info(v)
        frames = [video_frame(v, duration * f, 360) for f in (0.05, 0.275, 0.5, 0.725, 0.95)]
        w, h = frames[0].size
        strip = Image.new("RGB", (5 * (w + 4) - 4, h + 30), (18, 18, 20))
        for k, fr in enumerate(frames):
            strip.paste(fr, (k * (w + 4), 30))
        ImageDraw.Draw(strip).text((4, 4), f"v{i:02d}  {v.name}  {duration:.1f}s", font=font(18), fill=(230, 230, 235))
        strip.save(out / f"v{i:02d}_{v.stem}.jpg", quality=85)
    print(f"{len(photos_in(inbox))} small copies and {len(vids)} video strips in {out}")


def cmd_render(args):
    album, inbox, recipes = load_album(args.album)
    errs = validate(recipes)
    known = {p.name for p in photos_in(inbox)}
    errs += [f"{r['file']}: not in inbox" for r in recipes["photos"] if r.get("file") not in known]
    if errs:
        sys.exit("recipes.json has problems:\n  " + "\n  ".join(errs))
    missing = known - {r["file"] for r in recipes["photos"]}
    if missing:
        print(f"Warning: no recipe for {sorted(missing)}; left out.")
    style = load_style(args.style)
    done = album / args.out
    edited, share = done / "edited", done / "share-these"
    if not args.only:  # a full render starts clean, so an overruled drop does not linger
        for d in (edited, share):
            shutil.rmtree(d, ignore_errors=True)
    edited.mkdir(parents=True, exist_ok=True)
    share.mkdir(exist_ok=True)
    n = 0
    known_v = {p.name for p in inbox.iterdir() if p.suffix.lower() in VIDEO_EXT}
    lost = [v["file"] for v in recipes.get("videos") or [] if v.get("file") not in known_v]
    if lost:
        sys.exit(f"recipes.json names videos that are not in the inbox: {lost}")
    for r in recipes["photos"]:
        if args.only and r["file"] != args.only:
            continue
        src = inbox / r["file"]
        dst = edited / (src.stem + ".jpg")
        if r["verdict"] == "drop":
            continue
        if r["verdict"] == "as-is":  # a poster, a ticket, a screenshot: in the album, untouched
            dst = edited / src.name
            shutil.copy2(src, dst)
        else:
            im, exif, icc = edit(src, r, style)
            save_jpeg(im, dst, exif, icc)
        if r.get("share"):
            shutil.copy2(dst, share / dst.name)
        if r.get("cover"):
            shutil.copy2(dst, share / ("cover" + dst.suffix))
        n += 1
        print(f"  {r['verdict']:5} {dst.name}")
    nv = 0
    if not args.no_videos:
        nv = render_videos(album, inbox, recipes, style, done, args.only)
    if not args.only:
        shutil.copy2(album / "recipes.json", done / "recipes.json")
        if (album / "notes.md").exists():
            shutil.copy2(album / "notes.md", done / "notes.md")
    contact_sheet(album, inbox, recipes, done)
    print(f"{n} photos in {edited}, {nv} videos in {done / 'videos'}; contact sheet at {done / 'contact-sheet.jpg'}")


def contact_sheet(album, inbox, recipes, done, cols=4, cell=420):
    rows = recipes["photos"]
    pad, cap = 14, 96
    sheet = Image.new("RGB", (cols * (cell + pad) + pad, math.ceil(len(rows) / cols) * (cell + cap + pad) + pad), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    colour = {"great": (120, 220, 140), "fine": (220, 220, 225), "drop": (255, 110, 100), "as-is": (130, 180, 255)}
    for i, r in enumerate(rows):
        x, y = pad + (i % cols) * (cell + pad), pad + (i // cols) * (cell + cap + pad)
        stem = Path(r["file"]).stem
        shown = next(iter(sorted((done / "edited").glob(stem + ".*"))), None) if r["verdict"] != "drop" else None
        im = Image.open(shown).convert("RGB") if shown else open_photo(inbox / r["file"])[0]
        im.thumbnail((cell, cell))
        if r["verdict"] == "drop":
            im = Image.blend(im, Image.new("RGB", im.size, (18, 18, 20)), 0.55)
        sheet.paste(im, (x + (cell - im.width) // 2, y + cell - im.height))  # sits on its caption
        label = f"{i + 1}  {r['verdict'].upper()}" + ("  · cover" if r.get("cover") else "  · share" if r.get("share") else "")
        d.text((x, y + cell + 6), label, font=font(24), fill=colour[r["verdict"]])
        reason = r.get("reason", "")
        if reason:
            lines = textwrap.wrap(reason, 48)[:2]
            if len(textwrap.wrap(reason, 48)) > 2:
                lines[1] = lines[1][:46] + "…"
            d.text((x, y + cell + 38), "\n".join(lines), font=font(17), fill=(165, 165, 172))
    sheet.save(done / "contact-sheet.jpg", quality=88)


def cmd_compare(args):
    """One row per photo: the original, then each style. Written to <album>/compare/."""
    album, inbox, recipes = load_album(args.album)
    styles = [(Path(s).stem, load_style(s)) for s in args.styles]
    out = album / "compare"
    out.mkdir(exist_ok=True)
    for i, r in enumerate(recipes["photos"], 1):
        if r["verdict"] in ("drop", "as-is") or (args.only and r["file"] != args.only):
            continue
        src = inbox / r["file"]
        orig = frame(open_photo(src)[0], r.get("crop"), r.get("straighten_deg", 0))
        tiles = [("original", orig)] + [(n, edit(src, r, s)[0]) for n, s in styles]
        for _, t in tiles:
            t.thumbnail((args.size, args.size))
        w, h = tiles[0][1].size
        row = Image.new("RGB", (len(tiles) * (w + 10) - 10, h + 44), (18, 18, 20))
        d = ImageDraw.Draw(row)
        for k, (name, t) in enumerate(tiles):
            row.paste(t, (k * (w + 10), 44))
            d.text((k * (w + 10) + 6, 8), name, font=font(24), fill=(230, 230, 235))
        row.save(out / f"{i:02d}_{src.stem}.jpg", quality=90)
        print(f"  {i:02d} {src.name}")
    print(f"Comparisons in {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("inbox"); s.add_argument("source"); s.add_argument("album"); s.set_defaults(fn=cmd_inbox)
    s = sub.add_parser("small"); s.add_argument("album"); s.add_argument("--size", type=int, default=1400); s.set_defaults(fn=cmd_small)
    s = sub.add_parser("render"); s.add_argument("album"); s.add_argument("--style", default="style.json")
    s.add_argument("--out", default="done"); s.add_argument("--only")
    s.add_argument("--no-videos", action="store_true"); s.set_defaults(fn=cmd_render)
    s = sub.add_parser("compare"); s.add_argument("album"); s.add_argument("--styles", nargs="+", required=True)
    s.add_argument("--only"); s.add_argument("--size", type=int, default=1100); s.set_defaults(fn=cmd_compare)
    s = sub.add_parser("generate"); s.add_argument("album"); s.add_argument("file")
    s.add_argument("--via", nargs="+", default=["codex"], choices=sorted(GEN_TOOLS)); s.add_argument("--look")
    s.set_defaults(fn=cmd_generate)
    s = sub.add_parser("fourway"); s.add_argument("album"); s.add_argument("--style", default="style.json")
    s.add_argument("--strength", type=float, default=1.0); s.add_argument("--size", type=int, default=900)
    s.set_defaults(fn=cmd_fourway)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
