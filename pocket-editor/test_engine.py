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

    def test_vibrance_goes_easy_on_skin(self):
        def gain(colour):
            px = np.full((4, 4, 3), colour, np.float32)
            sat = lambda v: float(engine.hue_sat(v)[1][0, 0])
            return sat(engine.grade(px, {"vibrance": 0.5})) / sat(px)
        self.assertGreater(gain((0.45, 0.55, 0.75)), gain((0.75, 0.55, 0.45)) + 0.03)  # sky, then skin, equally saturated

    def test_a_face_is_lifted_and_calmed_and_the_rest_is_not(self):
        a = np.full((100, 100, 3), (0.5, 0.3, 0.25), np.float32)
        out = engine.grade(a, faces=[{"box": [0.4, 0.4, 0.6, 0.6], "lift": 0.3, "calm": 0.5}])
        self.assertGreater(out[50, 50].mean(), a[50, 50].mean() * 1.05)
        sat = lambda v: float(engine.hue_sat(v[None, None])[1][0, 0])
        self.assertLess(sat(out[50, 50]), sat(a[50, 50]) * 0.8)
        np.testing.assert_array_equal(out[5, 5], a[5, 5])

    def test_faces_follow_the_crop(self):
        got = engine.faces_in_crop([{"box": [0.5, 0.5, 0.75, 0.75], "lift": 0.2}], [0.5, 0.0, 1.0, 1.0])
        np.testing.assert_allclose(got[0]["box"], [0.0, 0.5, 0.5, 0.75])

    def test_tone_transfer_takes_the_light_and_keeps_the_detail(self):
        rng = np.random.default_rng(1)
        a = np.clip(scene(480, 320) + rng.normal(0, 0.03, (320, 480, 3)).astype(np.float32), 0, 1)
        orig = Image.fromarray((a * 255).astype(np.uint8))
        # The "generated" image: a small, blurred copy with the dark half lifted. No fine detail.
        g = a.copy(); g[:, :240] *= 2.0
        gen = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8)).resize((120, 80)).resize((240, 160))
        out = engine.tone_transfer(a, orig, gen)
        self.assertGreater(out[200:300, 60:200].mean(), a[200:300, 60:200].mean() * 1.6)   # light came across
        self.assertAlmostEqual(float(out[200:300, 300:440].mean()), float(a[200:300, 300:440].mean()), delta=0.06)
        grain = lambda v: float(np.abs(np.diff(v[200:300, 300:440, 1], axis=1)).mean())
        self.assertGreater(grain(out), grain(a) * 0.55)  # detail is the original's: the generated
        self.assertLess(grain(out), grain(a) * 1.9)      # image here is a blur and has none to give

    def test_alignment_tells_the_same_picture_from_a_reframed_one(self):
        rng = np.random.default_rng(2)
        tex = rng.random((40, 60, 3)).astype(np.float32)
        orig = Image.fromarray((tex * 255).astype(np.uint8)).resize((600, 400), Image.BICUBIC)
        same = orig.resize((300, 200)).point(lambda v: min(255, int(v * 1.2)))
        moved = orig.crop((120, 80, 600, 400)).resize((300, 200))
        self.assertGreater(engine.alignment(orig, same), 0.8)
        self.assertLess(engine.alignment(orig, moved), 0.4)

    def test_shipped_styles_run_and_stay_in_range(self):
        for name in ("style.json", "style-gentle-punch.json", "style-muted-bronze.json"):
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


class Inbox(unittest.TestCase):
    def test_a_zip_comes_in_flat_and_only_media(self):
        import zipfile
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            with zipfile.ZipFile(t / "Photos-1-001.zip", "w") as z:
                z.writestr("Photos/a.jpg", b"jpeg")
                z.writestr("Photos/clip.mp4", b"video")
                z.writestr("Photos/notes.txt", b"no")
                z.writestr("../../escape.jpg", b"jpeg")
            sys.argv = ["engine", "inbox", str(t / "Photos-1-001.zip"), str(t / "album")]
            engine.main()
            self.assertEqual(sorted(p.name for p in (t / "album" / "inbox").iterdir()), ["a.jpg", "clip.mp4", "escape.jpg"])
            self.assertFalse((t.parent / "escape.jpg").exists())
            engine.main()  # again: nothing is overwritten
            self.assertEqual((t / "album" / "inbox" / "a.jpg").read_bytes(), b"jpeg")


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
