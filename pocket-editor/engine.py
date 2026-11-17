# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10.1", "numpy>=1.26", "pillow-heif>=0.16"]
# ///
"""Pocket Editor's engine: applies recipes to photos. No model calls, nothing built in.

    uv run pocket-editor/engine.py small   <album>                 downscaled copies for judging
    uv run pocket-editor/engine.py render  <album> [--style S] [--out done] [--only FILE]
    uv run pocket-editor/engine.py compare <album> --styles A.json B.json [--only FILE]

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
        for k, v in (r.get("adjust") or {}).items():
            if k not in ADJUST: bad(f"unknown adjust field '{k}'")
            elif not isinstance(v, (int, float)) or not ADJUST[k][0] <= v <= ADJUST[k][1]:
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
    f = max(1, round(max(h, w) / 480))
    sw, sh = max(8, w // f), max(8, h // f)
    small = resize_f(lum, (sw, sh))
    r = max(2, round(max(sw, sh) * radius_frac))
    m = box(small, r)
    var = box(small * small, r) - m * m
    a = var / (var + eps)
    b = m - a * m
    a_full, b_full = resize_f(box(a, r), (w, h)), resize_f(box(b, r), (w, h))
    return np.clip(a_full * lum + b_full, 0, 1)


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


def grade(rgb, adjust=None, style=None, keep_colour=False, light="day", seed=0):
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
        base = smooth_base(luma(np.clip(out, 0, 1)))
        gain = 1 + 1.5 * a["shadows"] * (1 - base) ** 3 - 0.6 * a["highlights"] * base ** 3
        out = out * gain[..., None]

    if a["contrast"]:
        x = np.clip(out, 0, 1)
        out = x + a["contrast"] * (x * x * (3 - 2 * x) - x)

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
        # Skin sits between red and orange. Boosting it like everything else turns faces red,
        # so those hues get a quarter of the boost (Lightroom's vibrance protects skin the same way).
        d = np.abs((hue - 22 + 180) % 360 - 180)
        skin = np.clip(1 - (d - 22) / 20, 0, 1)
        out = scale_chroma(out, 1 + a["vibrance"] * (1 - sat) * (1 - 0.75 * skin))

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
    im = frame(im, recipe.get("crop"), recipe.get("straighten_deg", 0))
    rgb = np.asarray(im, dtype=np.float32) / 255
    seed = sum(path.name.encode())  # the same grain every time a photo is re-rendered
    out = grade(rgb, recipe.get("adjust"), style, recipe.get("keep_colour", False), recipe.get("light", "day"), seed)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8)), exif, icc


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


def cmd_small(args):
    album, inbox, _ = load_album(args.album)
    out = album / "small"
    out.mkdir(exist_ok=True)
    for i, p in enumerate(photos_in(inbox), 1):
        im, _, _ = open_photo(p)
        im.thumbnail((args.size, args.size))
        im.save(out / f"{i:02d}_{p.stem}.jpg", quality=85)
    print(f"{len(photos_in(inbox))} small copies in {out}")


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
    if not args.only:
        vids = [p for p in sorted(inbox.iterdir()) if p.suffix.lower() in VIDEO_EXT]
        if vids:
            (done / "videos").mkdir(exist_ok=True)
            for v in vids:
                if not (done / "videos" / v.name).exists():
                    shutil.copy2(v, done / "videos" / v.name)
        shutil.copy2(album / "recipes.json", done / "recipes.json")
    contact_sheet(album, inbox, recipes, done)
    print(f"{n} photos in {edited}; contact sheet at {done / 'contact-sheet.jpg'}")


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
    s = sub.add_parser("small"); s.add_argument("album"); s.add_argument("--size", type=int, default=1400); s.set_defaults(fn=cmd_small)
    s = sub.add_parser("render"); s.add_argument("album"); s.add_argument("--style", default="style.json")
    s.add_argument("--out", default="done"); s.add_argument("--only"); s.set_defaults(fn=cmd_render)
    s = sub.add_parser("compare"); s.add_argument("album"); s.add_argument("--styles", nargs="+", required=True)
    s.add_argument("--only"); s.add_argument("--size", type=int, default=1100); s.set_defaults(fn=cmd_compare)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
