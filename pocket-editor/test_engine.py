# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10.1", "numpy>=1.26", "pillow-heif>=0.16"]
# ///
"""The engine's tests, on synthetic images only. Run: uv run pocket-editor/test_engine.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import engine

HERE = Path(__file__).parent


def scene(w=240, h=160):
    """A dark left half, a bright right half, and a coloured patch in each quarter."""
    a = np.zeros((h, w, 3), np.float32)
    a[:, : w // 2] = 0.12
    a[:, w // 2 :] = 0.85
    a[20:60, 20:60] = (0.5, 0.2, 0.15)
    a[100:140, 150:200] = (0.3, 0.6, 0.25)
    return a


def write_jpeg(path, arr, orientation=1, date="2026:11:14 16:30:12"):
    im = Image.fromarray((arr * 255).astype(np.uint8))
    exif = Image.Exif()
    exif[0x0112] = orientation
    exif[0x0132] = date
    exif.get_ifd(0x8769)[0x9003] = date
    im.save(path, "JPEG", quality=95, exif=exif.tobytes())


class Grade(unittest.TestCase):
    def test_neutral_recipe_changes_nothing(self):
        a = scene()
        np.testing.assert_array_equal(engine.grade(a, {}, {}), a)

    def test_ev_brightens(self):
        a = scene()
        self.assertGreater(engine.grade(a, {"ev": 0.5}).mean(), a.mean())

    def test_keep_colour_leaves_white_balance_alone(self):
        a = scene()
        warm = engine.grade(a, {"temp": 0.1})
        self.assertGreater(warm[..., 0].mean(), a[..., 0].mean())
        np.testing.assert_array_equal(engine.grade(a, {"temp": 0.1}, {}, keep_colour=True), a)

    def test_shadows_lift_the_dark_side_without_a_halo(self):
        a = scene()
        out = engine.grade(a, {"shadows": 0.6})
        w = a.shape[1]
        self.assertGreater(out[80, 10].mean(), a[80, 10].mean() * 1.3)
        # The bright side stays put right up to the edge: a plain blur would brighten a band here.
        edge, far = out[80, w // 2 + 3].mean(), out[80, w - 10].mean()
        self.assertAlmostEqual(float(edge), float(far), delta=0.02)
        # And the dark side is lifted evenly up to the edge.
        self.assertAlmostEqual(float(out[80, w // 2 - 4].mean()), float(out[80, 70].mean()), delta=0.02)

    def test_identity_curve_changes_nothing(self):
        a = scene()
        out = engine.grade(a, {}, {"curves": {"rgb": [[0, 0], [128, 128], [255, 255]]}})
        np.testing.assert_allclose(out, a, atol=1e-4)

    def test_master_curve_caps_white(self):
        white = np.ones((4, 4, 3), np.float32)
        out = engine.grade(white, {}, {"curves": {"master": [[0, 0], [127, 128], [255, 238]]}})
        np.testing.assert_allclose(out, 238 / 255, atol=1e-3)

    def test_curve_never_overshoots(self):
        lut = engine.curve_lut([[0, 0], [47, 18], [80, 62], [117, 122], [179, 200], [255, 255]])
        self.assertTrue(np.all(np.diff(lut) >= -1e-6))
        self.assertTrue(lut.min() >= 0 and lut.max() <= 1)

    def test_green_band_moves_toward_yellow_and_darkens(self):
        g = np.zeros((4, 4, 3), np.float32)
        g[..., 1] = 0.8
        out = engine.grade(g, {}, {"hsl": {"green": {"hue": -21, "lum": -35}}})
        self.assertGreater(out[0, 0, 0], out[0, 0, 2])  # more red than blue: toward yellow
        self.assertLess(engine.luma(out)[0, 0], engine.luma(g)[0, 0])

    def test_bands_leave_grey_alone(self):
        grey = np.full((4, 4, 3), 0.5, np.float32)
        style = json.loads((HERE / "style-muted-bronze.json").read_text())
        out = engine.grade(grey, {}, {"hsl": style["hsl"], "calibration": style["calibration"]})
        np.testing.assert_allclose(out, grey, atol=1e-4)

    def test_night_overrides_the_day_style(self):
        style = {"adjust": {"contrast": 0.2, "clarity": 0.1}, "night": {"adjust": {"contrast": 0.0, "fade": 0.5}}}
        night = engine.for_light(style, "night")
        self.assertEqual(night["adjust"], {"contrast": 0.0, "clarity": 0.1, "fade": 0.5})
        self.assertEqual(engine.for_light(style, "day"), style)

    def test_fade_lifts_black_and_grain_repeats(self):
        black = np.zeros((8, 8, 3), np.float32)
        np.testing.assert_allclose(engine.grade(black, {"fade": 1.0}), 0.14, atol=1e-6)
        a = scene()
        g1, g2 = engine.grade(a, {"grain": 0.5}, seed=7), engine.grade(a, {"grain": 0.5}, seed=7)
        np.testing.assert_array_equal(g1, g2)
        self.assertFalse(np.array_equal(g1, a))

    def test_glow_only_brightens(self):
        a = scene()
        self.assertTrue(np.all(engine.grade(a, {"glow": 0.8}) >= a - 1e-6))

    def test_shipped_styles_run_and_stay_in_range(self):
        for name in ("style.json", "style-muted-bronze.json"):
            for light in ("day", "night"):
                out = engine.grade(scene(), {}, json.loads((HERE / name).read_text()), light=light)
                self.assertTrue(np.isfinite(out).all() and out.min() >= 0 and out.max() <= 1, name)


class Files(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.album = Path(self.tmp.name)
        (self.album / "inbox").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_crop_lands_where_the_recipe_says(self):
        a = np.zeros((100, 200, 3), np.float32)
        a[:, 100:] = 1.0
        p = self.album / "inbox" / "a.jpg"
        write_jpeg(p, a)
        im, _, _ = engine.edit(p, {"crop": [0.5, 0.0, 1.0, 0.5]}, {})
        self.assertEqual(im.size, (100, 50))
        self.assertGreater(np.asarray(im).mean(), 250)

    def test_exif_dates_survive_and_orientation_is_applied(self):
        p = self.album / "inbox" / "a.jpg"
        write_jpeg(p, scene(240, 160), orientation=6)
        before = p.read_bytes()
        im, exif, icc = engine.edit(p, {}, {})
        self.assertEqual(im.size, (160, 240))  # turned upright
        out = self.album / "out.jpg"
        engine.save_jpeg(im, out, exif, icc)
        with Image.open(out) as f:
            got = f.getexif()
        self.assertEqual(got[0x0112], 1)
        self.assertEqual(got[0x0132], "2026:11:14 16:30:12")
        self.assertEqual(got.get_ifd(0x8769)[0x9003], "2026:11:14 16:30:12")
        self.assertEqual(p.read_bytes(), before)  # the original is never modified

    def test_straighten_keeps_the_shape(self):
        im = engine.frame(Image.new("RGB", (300, 200)), None, 3)
        self.assertAlmostEqual(im.width / im.height, 1.5, delta=0.02)
        self.assertLess(im.width, 300)

    def test_render_makes_the_album(self):
        inbox = self.album / "inbox"
        for n in ("a.jpg", "b.jpg", "poster.jpg"):
            write_jpeg(inbox / n, scene())
        (inbox / "clip.mp4").write_bytes(b"not really a video")
        poster = (inbox / "poster.jpg").read_bytes()
        (self.album / "recipes.json").write_text(json.dumps({"photos": [
            {"file": "a.jpg", "verdict": "great", "share": True, "cover": True, "adjust": {"shadows": 0.3}},
            {"file": "b.jpg", "verdict": "drop", "reason": "Blurred."},
            {"file": "poster.jpg", "verdict": "as-is", "reason": "The line-up."},
        ]}))
        sys.argv = ["engine", "render", str(self.album)]
        engine.main()
        done = self.album / "done"
        self.assertEqual(sorted(p.name for p in (done / "edited").iterdir()), ["a.jpg", "poster.jpg"])
        self.assertEqual((done / "edited" / "poster.jpg").read_bytes(), poster)  # byte for byte
        self.assertEqual(sorted(p.name for p in (done / "share-these").iterdir()), ["a.jpg", "cover.jpg"])
        self.assertTrue((done / "videos" / "clip.mp4").exists())
        self.assertTrue((done / "contact-sheet.jpg").exists())
        self.assertTrue((done / "recipes.json").exists())


class Validate(unittest.TestCase):
    def test_good_and_bad(self):
        ok = {"photos": [{"file": "a.jpg", "verdict": "fine", "crop": [0, 0.1, 1, 1], "adjust": {"ev": 0.2}}]}
        self.assertEqual(engine.validate(ok), [])
        bad = {"photos": [
            {"file": "a.jpg", "verdict": "maybe"},
            {"file": "b.jpg", "verdict": "drop"},
            {"file": "c.jpg", "verdict": "fine", "crop": [0.6, 0, 0.5, 1]},
            {"file": "d.jpg", "verdict": "fine", "adjust": {"ev": 9, "sparkle": 1}},
        ]}
        self.assertEqual(len(engine.validate(bad)), 5)


if __name__ == "__main__":
    unittest.main(verbosity=1)
