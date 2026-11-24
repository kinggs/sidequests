#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy", "matplotlib"]
# ///
"""Session 22 (PLAN.md): read the PO-12's effects off a recording, as numbers and pictures.

    uv run harness/hardware-fx.py <take.wav> --pass a --out <folder outside the repo>
    uv run harness/hardware-fx.py --selftest            # synthetic takes with known effects

The takes are made by harness/hardware-take.sh (48 kHz, 24-bit, the PO-12 on one input), at
80 bpm, one pass a file:

    a   kick on steps 1 and 9, snare on 5 and 13, closed hat on 3, 7, 11, 15
    b   a kick on step 1 only
    c   noise (key 8) on 1 and 9, tone (key 15) on 5 and 13; effects 1 to 8 only

Each pass: two or more bars dry, then every effect in key order held two bars with a bar
dry between. The hand is never on the bar line and miscounts, so the script prints every bar
with a dry or wet guess, guesses the layout from the wet runs, and takes --bars
"1:2-3,2:5-6" (effect:first-last bar) when the guess is wrong.

What the first real takes taught it (2026-11-24). A take opens on silence and then play is
pressed, so its first sound is step 1 of bar 0 (a file cut mid-pattern is still read, by the
older way). Time goes missing from a file part-way through, in whole buffers of 1024
samples: the grid is laid on every sighting of the drums that sound the same each time, and
each loss is reported with the bars it falls in. A take that clips says which effects.

README rule 6: no recording of the hardware and nothing made from one enters the repo. The
take is read from outside it, the plots are written outside it (--out inside the repo is
refused), and this script writes no audio at all. We take numbers and character, never sound.

What it reads is listed by --help and printed as a report: for every effect the level, the
onsets, the response against the dry bar, a hold rate and a quantiser step if there is one;
then what each effect's name asks for (the curve of 2, the filters of 5 to 8, the repeats of
9 to 12, an echo, pitch and decay of each hit, a pitch wobble).
"""
import argparse
import io
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import optimize, signal

PRE = 0.005  # a bar starts this long before its step 1 onset, so the attack is inside it
STEPS = 16
PATTERNS = {
    "a": {1: "K", 9: "K", 5: "S", 13: "S", 3: "H", 7: "H", 11: "H", 15: "H"},
    "b": {1: "K"},
    "c": {1: "N", 9: "N", 5: "T", 13: "T"},
}
HALF_BAR = {"a": True, "b": False, "c": True}  # the pattern repeats every half bar
EFFECTS = {"a": list(range(1, 17)), "b": list(range(1, 17)), "c": list(range(1, 9))}
NAMES = {1: "low sample rate", 2: "distortion", 3: "bit crush", 4: "delay", 5: "lowpass filter",
         6: "lowpass sweep", 7: "hipass filter", 8: "hipass sweep", 9: "stutter (9)",
         10: "stutter (10)", 11: "repeat 8", 12: "repeat 6", 13: "note shuffle", 14: "feedback",
         15: "parameter lfo", 16: "vibrato"}
SOUND = {"K": "kick", "S": "snare", "H": "hat", "N": "noise", "T": "tone"}


def db(p):
    return 10 * np.log10(np.maximum(p, 1e-30))


def adb(a):
    return 20 * np.log10(np.maximum(np.abs(a), 1e-15))


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def parabolic(y, k):
    if 0 < k < len(y) - 1:
        a, b, c = y[k - 1], y[k], y[k + 1]
        d = a - 2 * b + c
        return float(0.5 * (a - c) / d) if d != 0 else 0.0
    return 0.0


def read_wav(src):
    """Mono float samples of the louder channel, the rate, and a note about the file."""
    with wave.open(src) as w:
        n, c, sw, fs = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, c, 3)
        v = (b[..., 0].astype(np.int32) | (b[..., 1].astype(np.int32) << 8)
             | (b[..., 2].astype(np.int8).astype(np.int32) << 16)) / 8388608.0
    elif sw == 2:
        v = np.frombuffer(raw, dtype="<i2").reshape(-1, c) / 32768.0
    elif sw == 4:
        v = np.frombuffer(raw, dtype="<i4").reshape(-1, c) / 2147483648.0
    else:
        raise SystemExit(f"{sw * 8}-bit samples are not read")
    levels = [rms(v[:, ch]) for ch in range(c)]
    ch = int(np.argmax(levels))
    x = v[:, ch].astype(np.float64)
    peak = float(np.abs(x).max()) if len(x) else 0.0
    note = (f"{n / fs:.1f} s, {fs} Hz, {sw * 8}-bit, {c} channels; input {ch + 1} read "
            f"(peak {adb(peak):.1f} dBFS)")
    if peak >= 0.999:
        note += "  ⚠ clips: see which effects below"
    elif peak > 0.94:
        note += "  ⚠ close to full scale"
    return x - x.mean(), fs, note


# ---- small tools ----

def acf(x, nmax):
    """Autocorrelation, unbiased, lags 0..nmax-1, not normalised."""
    n = len(x)
    m = 1 << int(np.ceil(np.log2(2 * n)))
    r = np.fft.irfft(np.abs(np.fft.rfft(x, m)) ** 2)[:nmax]
    return r * n / np.maximum(n - np.arange(len(r)), 1)


def ncc_lag(a, b, maxlag):
    """Best normalised correlation of b against a within ±maxlag: (ncc, lag), a[n+lag] ~ b[n]."""
    n = min(len(a), len(b))
    if n < 8:
        return 0.0, 0
    a, b = a[:n], b[:n]
    c = signal.correlate(a, b, "full", method="fft")
    mid = n - 1
    lo, hi = max(mid - maxlag, 0), min(mid + maxlag + 1, len(c))
    k = lo + int(np.argmax(c[lo:hi]))
    top = c[k]
    if 16 <= k < len(c) - 17:  # the peak between samples: a hat a third of a sample off reads low
        top = max(top, signal.resample(c[k - 16:k + 17], 33 * 8)[15 * 8:18 * 8].max())
    return float(top / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-30)), k - mid


def sliding_ncc(seg, tpl):
    """Normalised correlation of tpl at every offset in seg ('valid')."""
    t = tpl - tpl.mean()
    n = len(t)
    num = signal.correlate(seg, t, "valid", method="fft")
    c1 = np.concatenate([[0.0], np.cumsum(seg)])
    c2 = np.concatenate([[0.0], np.cumsum(seg * seg)])
    s1 = c1[n:] - c1[:-n]
    s2 = c2[n:] - c2[:-n]
    return num / np.sqrt(np.maximum(s2 - s1 * s1 / n, 1e-30) * np.sum(t * t) + 1e-30)


def env_dec(x, q=8):
    n = len(x) // q * q
    e = np.abs(x[:n]).reshape(-1, q).mean(1)
    k = np.hanning(13)
    return np.convolve(e, k / k.sum(), "same")


def bands(per_oct, lo=40.0, hi=20000.0):
    n = int(np.floor(np.log2(hi / lo) * per_oct)) + 1
    return lo * 2.0 ** (np.arange(n) / per_oct)


def band_density(f, p, centres, per_oct):
    """The mean power density in each band; a band narrower than a bin is read between bins."""
    out = np.empty(len(centres))
    h = 2.0 ** (0.5 / per_oct)
    for i, c in enumerate(centres):
        m = (f >= c / h) & (f < c * h)
        out[i] = p[m].mean() if m.any() else np.interp(c, f, p)
    return out


def flux_of(x, fs, eps):
    """Spectral flux every 2 ms: where a new sound starts, even on top of one still ringing."""
    f, t, z = signal.stft(x, fs, window="hann", nperseg=384, noverlap=288, nfft=512,
                          boundary=None, padded=False)
    mag = np.abs(z)
    if eps is None:
        eps = 1e-2 * mag.max()
    c = np.log1p(mag / eps)
    c = np.maximum(c, np.maximum(np.roll(c, 1, 0), np.roll(c, -1, 0)))
    # against the loudest of the frames 6 to 14 ms before: a sound still ringing, or noise
    # flickering, is not a new sound (frames 4 apart share no samples)
    ref = np.max([np.roll(c, k, 1) for k in range(3, 8)], 0)
    fl = np.maximum(c - ref, 0).sum(0)
    fl[:8] = 0
    return t, fl, eps


def pick(fl, thr, sep):
    """Indices of local maxima of fl at or over thr, none within sep of a bigger one."""
    idx, _ = signal.find_peaks(fl, height=thr, distance=sep)
    return idx


def softlimit(x):
    y = x * (27 + x * x) / (27 + 9 * x * x)
    return np.where(x < -3, -1.0, np.where(x > 3, 1.0, y))


SHAPES = {"softlimit": softlimit, "tanh": np.tanh, "hard clip": lambda x: np.clip(x, -1, 1)}


def fit_shape(x, y, shape):
    """level × shape(g x) by least squares: (g, level, rms residual)."""
    best = (np.nan, np.nan, np.inf)
    for g in np.logspace(-1, 2, 601):
        s = shape(g * x)
        lv = float(np.dot(y, s) / (np.dot(s, s) + 1e-30))
        r = rms(y - lv * s)
        if r < best[2]:
            best = (float(g), lv, r)
    return best


def filter_model(p, f, kind):
    u = f / 2.0 ** p[0]
    den = (1 - u * u) ** 2 + (u / p[1]) ** 2
    return p[2] + db((u ** 4 if kind == "hp" else 1.0) / den)


def fit_filter(f, h, kind, cens=None, floor=-45.0):
    """A two-pole filter laid on a response in dB: cutoff, Q, gain, rms residual, or None.
    Where cens is set the wet sound was under the noise, so h is only a ceiling there."""
    ok = np.isfinite(h)
    if ok.sum() < 6:
        return None
    cens = np.zeros(len(f), bool) if cens is None else cens
    f, h, cens = f[ok], np.maximum(h[ok], floor), cens[ok]
    if h.max() - h.min() < 6 or (~cens).sum() < 4:
        return None

    def res(p):
        d = np.maximum(filter_model(p, f, kind), floor) - h
        return np.where(cens, np.maximum(d, 0), d)

    best = None
    for fc in np.geomspace(f.min(), f.max(), 9):
        for q in (0.7, 2.0, 6.0):
            try:
                s = optimize.least_squares(res, [np.log2(fc), q, float(np.median(h))],
                                           bounds=([np.log2(20), 0.3, -40], [np.log2(22000), 40, 40]))
            except ValueError:
                continue
            if best is None or s.cost < best.cost:
                best = s
    if best is None:
        return None
    fc = float(2.0 ** best.x[0])
    lo, hi = (f < fc / 1.25), (f > fc * 1.25)
    passed, stopped = (lo, hi) if kind == "lp" else (hi, lo)
    return dict(fc=fc, q=float(best.x[1]), gain=float(best.x[2]),
                rms=float(np.sqrt(np.mean(best.fun ** 2))), fmin=float(f.min()), fmax=float(f.max()),
                pass_n=int((passed & ~cens).sum()), stop_n=int(stopped.sum()))


def response_shape(f, h, fit, kind, cens=None):
    """Read off the response itself, not the model: the -3 dB point, the peak, the slope."""
    ok = np.isfinite(h) if cens is None else np.isfinite(h) & ~cens
    f, h = f[ok], h[ok]
    g0 = fit["gain"]
    k = int(np.argmax(h))
    out = dict(peak_db=float(h[k] - g0), peak_hz=float(f[k]), f3=np.nan, slope=np.nan)
    order = range(k, len(f)) if kind == "lp" else range(k, -1, -1)
    prev = None
    for i in order:
        if h[i] < g0 - 3 and prev is not None:
            a, b = np.log2(f[prev]), np.log2(f[i])
            out["f3"] = float(2.0 ** (a + (b - a) * (h[prev] - (g0 - 3)) / (h[prev] - h[i] + 1e-12)))
            break
        prev = i
    stop = (f > f[k]) if kind == "lp" else (f < f[k])
    m = stop & (h < g0 - 6) & (h > g0 - 30)
    if m.sum() >= 3:
        out["slope"] = float(np.polyfit(np.log2(f[m]), h[m], 1)[0])
    return out


def hold_comb(x, fs):
    """The comb in the autocorrelation of the edges: lags (samples) and the score at each."""
    d = np.abs(np.diff(x))
    e = np.maximum(d - signal.medfilt(d, 9), 0)
    e = e - e.mean()
    r = acf(e, 2600)
    r = r / (r[0] + 1e-30)
    lags = np.arange(3.0, 1200.0, 0.05)
    idx = np.arange(len(r), dtype=float)
    score = np.zeros(len(lags))
    count = np.zeros(len(lags))
    for k in range(1, 7):
        m = lags * k < 2590
        score[m] += np.interp(lags[m] * k, idx, r)
        count[m] += 1
    return lags, score / count, r


def hold_rate(x, fs, dry=None):
    """A sample-and-hold's rate from the spacing of its edges. The dry sound's own comb is taken
    off first: a square wave has edges of its own, and they are not a hold."""
    lags, sc, r = hold_comb(x, fs)
    own = sc.copy()
    control = np.zeros(len(sc))
    if dry is not None:
        control = np.maximum(hold_comb(dry, fs)[1], 0)
        sc = sc - control
    j = int(np.argmax(sc))
    top = float(sc[j])
    for m in range(40, 1, -1):  # a hold scores at every multiple of its lag: take the lag itself
        q = lags[j] / m
        if q >= lags[0]:
            i = int(round((q - lags[0]) / 0.05))
            i = max(i - 3, 0) + int(np.argmax(sc[max(i - 3, 0):i + 4]))
            if sc[i] >= 0.5 * top:
                j = i
                break
    lag = float(lags[j])
    idx = np.arange(len(r), dtype=float)
    kmax = max(1, min(40, int(2590 // lag)))
    fine = np.arange(lag - 0.06, lag + 0.06, 0.0005)
    f = sum(np.interp(fine * k, idx, r) for k in range(1, kmax + 1)) / kmax
    lag = float(fine[int(np.argmax(f))])
    rate = fs / lag
    return dict(rate=rate, lag=lag, strength=float(sc[j]), own=float(own[j]), control=float(control[j]),
                divisor=int(round(48000.0 / rate)), found=bool(sc[j] >= 0.2))


def crush_step(x, dpeak):
    """A quantiser's step from the heights of the jumps between flat stretches."""
    d = np.diff(x)
    a = np.abs(d)
    c = np.where((a[1:-1] > dpeak / 100) & (a[1:-1] >= a[:-2]) & (a[1:-1] >= a[2:]))[0] + 1
    c = c[(c > 8) & (c < len(x) - 9)]
    out = dict(found=False, edges=0, step=np.nan, per_peak=np.nan, levels=np.nan, tight=np.nan,
               on_grid=np.nan, heights=np.array([]))
    if len(c) < 40:
        return out
    pre = x[c[:, None] + np.arange(-5, -1)]
    post = x[c[:, None] + np.arange(3, 7)]
    h = np.median(post, 1) - np.median(pre, 1)
    flat = (np.ptp(pre, 1) < 0.25 * np.abs(h)) & (np.ptp(post, 1) < 0.25 * np.abs(h))
    h = np.abs(h[flat])
    h = h[h > dpeak / 200]
    out["edges"] = int(len(h))
    out["heights"] = h
    if len(h) < 40:
        return out
    top = np.percentile(h, 99) * 1.05
    cnt, edg = np.histogram(h, bins=240, range=(0, top))
    cnt = np.convolve(cnt, [0.25, 0.5, 0.25], "same")
    k = int(np.argmax(cnt >= 0.3 * cnt.max()))
    k = k + int(np.argmax(cnt[k:k + 6]))
    s0 = 0.5 * (edg[k] + edg[k + 1])
    near = h[(h > 0.8 * s0) & (h < 1.2 * s0)]
    if len(near) < 20:
        return out
    step = float(np.median(near))
    q = h / step
    out.update(step=step, per_peak=float(dpeak / step),
               tight=float((np.percentile(near, 75) - np.percentile(near, 25)) / step),
               on_grid=float(np.mean(np.abs(q - np.round(q)) < 0.15)),
               levels=int(round((x.max() - x.min()) / step)) + 1)
    out["found"] = bool(out["tight"] < 0.12 and out["on_grid"] > 0.7)
    return out


def sinc_at(c, lag):
    """The value of a sampled sequence between samples, taken with a sinc over 17 points."""
    k = int(round(lag))
    if k - 8 < 0 or k + 9 > len(c):
        return np.nan
    i = np.arange(-8, 9)
    return float(np.sum(c[k + i] * np.sinc(i - (lag - k))))


def cepstrum_echo(wet, dry, fs, noise_power=0.0, lo_ms=1.0):
    """An echo read blind: the log spectrum of wet less that of dry is the log of the effect's
    own response, and an echo of gain a at lag D puts a at D in its cepstrum (and
    a (2 g - a) / 2 at 2 D when each next echo is g times the last)."""
    n = min(len(wet), len(dry))
    nfft = 1 << int(np.ceil(np.log2(n)))
    win = np.hanning(n)
    pw = np.abs(np.fft.rfft(wet[:n] * win, nfft)) ** 2
    pd = np.abs(np.fft.rfft(dry[:n] * win, nfft)) ** 2
    # only the bins where the dry sound stands clear of the noise say anything about the effect;
    # the rest are set to "no change" and the reading is scaled up by the share that spoke
    floor = noise_power * np.sum(win * win)
    mask = (pd > 100 * floor) & (pw > 4 * floor)
    share = float(mask.mean())
    d = np.where(mask, np.log(pw + 1e-300) - np.log(pd + 1e-300), 0.0)
    c = np.fft.irfft(d) / max(share, 1e-6)
    lo, hi = int(lo_ms * fs / 1000), int(0.45 * n)
    k = lo + int(np.argmax(c[lo:hi]))
    fr = np.linspace(-0.5, 0.5, 41)
    v = [sinc_at(c, k + q) for q in fr]
    lag = k + float(fr[int(np.nanargmax(v))])
    a = sinc_at(c, lag)
    a2 = sinc_at(c, 2 * lag)
    g = a2 / a + a / 2 if a > 0 and np.isfinite(a2) else np.nan
    noise = float(np.std(c[lo:hi]))
    return dict(lag=lag, lag_ms=1000 * lag / fs, gain=a, feedback=g, noise=noise, c=c[:hi], share=share)


def hit_pitch(w, fs):
    """A window's pitch by autocorrelation: (hertz, how periodic 0..1)."""
    if len(w) < int(0.03 * fs):
        return np.nan, 0.0
    w = w - w.mean()
    r = acf(w * np.hanning(len(w)), min(len(w) - 1, int(fs / 30)))
    r = r / (r[0] + 1e-30)
    lo = int(fs / 2000)
    if len(r) <= lo + 3:
        return np.nan, 0.0
    pk, _ = signal.find_peaks(r[lo:])
    if not len(pk):
        return np.nan, 0.0
    pk = pk + lo
    k = int(pk[np.argmax(r[pk] >= 0.85 * r[pk].max())])
    return float(fs / (k + parabolic(r, k))), float(r[k])


def zc_track(w, fs, f0):
    """Frequency a cycle, from the rising zero crossings of the band round f0."""
    sos = signal.butter(2, [0.6 * f0, min(1.7 * f0, fs * 0.45)], "band", fs=fs, output="sos")
    y = signal.sosfiltfilt(sos, w)
    up = np.where((y[:-1] < 0) & (y[1:] >= 0))[0]
    if len(up) < 3:
        return np.array([]), np.array([])
    tz = up + (-y[up]) / (y[up + 1] - y[up])
    return 0.5 * (tz[:-1] + tz[1:]) / fs, fs / np.diff(tz)


# ---- the take ----

class Take:
    def __init__(self, x, fs, pas, bpm=80.0, effects=None, onset_k=1.0, say=print):
        self.x, self.fs, self.pas, self.say = x, fs, pas, say
        self.clip_at = 0.9985 - abs(float(getattr(x, "dc", 0.0)))  # full scale, less the mean taken off
        self.pattern = PATTERNS[pas]
        self.effects = list(effects or EFFECTS[pas])
        self.onset_k = onset_k
        self.b3 = bands(3)
        self.b6 = bands(6)
        self.bw3 = self.b3 * (2 ** (1 / 6) - 2 ** (-1 / 6))
        self._grid(bpm)
        self._template()
        self._classify()

    # -- the grid --

    def _feature(self, at):
        fs, x = self.fs, self.x
        if self.pas == "c":  # noise is on step 1: flat spectrum
            w = x[at:at + int(0.06 * fs)]
            p = np.abs(np.fft.rfft(w * np.hanning(len(w)))) ** 2
            f = np.fft.rfftfreq(len(w), 1 / fs)
            p = p[(f > 300) & (f < 6000)] + 1e-30
            return float(np.exp(np.mean(np.log(p))) / np.mean(p))
        w = self._low[at:at + int(0.08 * fs)]  # the kick is on step 1: energy under 150 Hz
        return float(np.sum(w * w))

    def _anchor(self, t0, bar):
        """Bar starts in seconds. The grid is the device's clock, which no hand moves: so every
        bar that looks like the first is found within 30 ms of where the bars so far put it,
        and one straight line is drawn through them. (The first version looked 150 ms either
        way and joined the pins up; on the first real take one bar pinned 126 ms out, on the
        tail of a crushed bar, and bent every bar after it.)"""
        e, fe = self._env, self.fs / 8
        le = int(round(bar * fe))
        i0 = int(round(t0 * fe))
        tpl = e[i0:i0 + le]
        w = int(0.03 * fe)
        nb = int((len(self.x) / self.fs - t0) / bar)
        pinned = {0: t0}
        est = bar
        for k in range(1, nb):
            i = int(round((t0 + k * est) * fe))
            if i - w < 0 or i + le + w > len(e):
                continue
            c = sliding_ncc(e[i - w:i + le + w], tpl)
            j = int(np.argmax(c))
            if c[j] >= 0.9 and 0 < j < 2 * w:
                pinned[k] = (i - w + j + parabolic(c, j)) / fe
                if k >= 2:
                    ks = np.array(sorted(pinned))
                    est = float(np.polyfit(ks, [pinned[q] for q in ks], 1)[0])
        # To the sample, and across breaks. Found on the first real take (2026-11-24): the
        # pattern sits EARLIER in the file after some moments, by whole multiples of 21.33 ms
        # (1024 samples, PipeWire's buffer here), 363 ms in all over 150 s. Either the capture
        # lost buffers or the PO-12 skipped; the file cannot say which. So the grid is not one
        # line: every drum that is the same each time it plays (a kick, a snare) is looked for
        # through the whole file, each sighting says how much has gone missing so far, and
        # the bars are laid on that. A sound repeated quickly (the repeats) is left out.
        fs, x = self.fs, self.x
        a0 = int(round(t0 * fs))
        ls = est / STEPS
        sights = []  # (file time, step offset in seconds, period in seconds)
        for name in dict.fromkeys(self.pattern.values()):
            at = sorted(st for st, nm in self.pattern.items() if nm == name)
            per = min([(q - r) % STEPS or STEPS for q in at for r in at if q != r] or [STEPS]) * ls
            i = a0 + int(round((at[0] - 1) * ls * fs))
            tpl2 = x[i:i + int(0.05 * fs)]
            if len(tpl2) < int(0.05 * fs) or rms(tpl2) < 1e-4:
                continue
            c = sliding_ncc(x, tpl2)
            pk, _ = signal.find_peaks(c, height=0.85, distance=int(0.02 * fs))
            tt = pk / fs
            keep = [q for j, q in enumerate(tt)
                    if (j == 0 or q - tt[j - 1] > 0.4) and (j == len(tt) - 1 or tt[j + 1] - q > 0.4)]
            if len(keep) >= 3:
                sights += [(q, (at[0] - 1) * ls, per) for q in keep]
        sights.sort()
        self.gaps = []
        if len(sights) >= 6:
            # Each sighting says how much is missing so far, as a remainder of its sound's
            # period. What is missing never comes back, so the loss at a sighting is the least
            # any later one says; and a value counts only if three sightings agree on it (a
            # shuffle moves a kick for two bars and then puts it back: that is not a loss).
            # Twice: first with the rough bar, then with the bar the sightings give.
            # The bar first, from pairs of sightings of one sound with no loss between them: a
            # loss shortens one pair and leaves the rest, where a line through everything
            # would tilt and hide it (pass b, 2026-11-24: three losses read as a faster tempo).
            bar2 = est
            q = np.array([w[0] for w in sights])
            pers = np.array([w[2] for w in sights])
            for _ in range(3):
                num = den = 0.0
                for per in np.unique(pers):
                    qq = q[pers == per]
                    d = np.diff(qq)
                    n = np.round(d / (per * bar2 / est))
                    ok = (n >= 1) & (np.abs(d - n * per * bar2 / est) < 0.004)
                    num += float(np.sum(d[ok]))
                    den += float(np.sum(n[ok] * per / est))
                if den > 0:
                    bar2 = num / den
            per2 = pers * bar2 / est
            off2 = np.array([w[1] for w in sights]) * bar2 / est
            lost = (-(q - t0 - off2)) % per2
            late = lost > per2 / 2  # a sound that comes late is not time lost: a moved note, or jitter
            lost[late] -= per2[late]
            near = lambda j: np.sum(np.abs(lost[max(j - 4, 0):j + 5] - lost[j]) < 0.003) >= 3
            agree = np.array([near(j) for j in range(len(lost))]) & (lost > -0.004)
            qs, ls_ = q[agree], lost[agree]
            true = np.maximum(np.minimum.accumulate(ls_[::-1])[::-1], 0.0)
            tc = qs + true - t0
            gaps, rows = [], []
            for j in range(len(qs)):
                if j and true[j] - true[j - 1] > 0.004:
                    gaps.append((float(qs[j - 1]), float(qs[j]), float(true[j] - true[j - 1])))
                rows.append((float(qs[j]), float(true[j]), float(tc[j])))
            self.gaps = gaps
            allk = np.arange(nb + 1)
            # where a loss lies between two sightings is not known: it is put half way
            cuts = [((ga + gb) / 2, size) for ga, gb, size in gaps]
            starts = np.empty(len(allk))
            for k in allk:
                d = 0.0
                for cut, size in cuts:  # file time of the bar start, less what was lost before it
                    if t0 + k * bar2 - d - size >= cut:
                        d += size
                starts[k] = t0 + k * bar2 - d
            nb2 = int(np.searchsorted(starts, len(x) / fs - 1e-6))
            starts = starts[:max(nb2, 2)]
            return starts, {i: float(v) for i, v in enumerate(starts[:1])} | {
                int(round(w[2] / bar2)): w[0] for w in rows if abs(w[2] / bar2 - round(w[2] / bar2)) < 0.01}, bar2
        ks = np.array(sorted(pinned))
        ts = np.array([pinned[k] for k in ks])
        allk = np.arange(nb + 1)
        if len(ks) >= 3:
            fit, c0 = (float(v) for v in np.polyfit(ks, ts, 1))
            starts = c0 + allk * fit
        else:
            fit, starts = bar, t0 + allk * bar
        return starts, pinned, fit

    def _grid(self, bpm):
        fs, x = self.fs, self.x
        self._env = env_dec(x)
        fe = fs / 8
        z = self._env - self._env.mean()
        r = acf(z, min(len(z), int(240 / bpm * 1.1 * fe) + 2))
        lo, hi = int(240 / bpm * 0.93 * fe), int(240 / bpm * 1.07 * fe)
        if hi >= len(r):
            raise SystemExit("the take is shorter than two bars")
        k = lo + int(np.argmax(r[lo:hi]))
        bar = (k + parabolic(r, k)) / fe
        # A real take opens on silence and then play is pressed (found on the first real file,
        # 2026-11-24: the script had assumed the pattern was already looping and took a bar
        # that was half silence as its dry one). Then the first sound IS step 1 of bar 0, and
        # the half-bar question below does not arise.
        loud = float(np.percentile(np.abs(x), 99.9))
        over = np.flatnonzero(np.abs(x) > 0.1 * loud)
        cross = int(over[0]) if len(over) else 0
        quiet = x[:max(cross - int(0.02 * fs), 0)]
        # 0.75 s: longer than any rest inside pattern a or c, so a file cut mid-pattern is not
        # taken for one. (Pass b has one note a bar: its first sound is step 1 either way.)
        self.silent_start = bool(cross > int(0.75 * fs) and rms(quiet) < 0.003 * loud)
        self.lead = cross / fs if self.silent_start else 0.0
        n0 = max(cross - int(0.1 * fs), 0) if self.silent_start else 0
        n1 = int(min(len(x), n0 + 2.2 * bar * fs))
        self._low = np.zeros(len(x))
        self._low[n0:n1] = signal.sosfiltfilt(signal.butter(4, 150, "low", fs=fs, output="sos"), x[n0:n1])
        t, fl, _ = flux_of(x[n0:n1], fs, None)
        t = t + n0 / fs
        pk = pick(fl, 0.2 * fl.max(), 12)
        if self.silent_start:
            near = [t[i] for i in pk if abs(t[i] - cross / fs) < 0.03]
            t0 = (near[0] if near else cross / fs) - PRE
            options = [t0]
        else:
            feats = np.array([self._feature(int(t[i] * fs)) for i in pk])
            first = [t[i] for i, f in zip(pk, feats) if f >= 0.6 * feats.max() and PRE <= t[i] < bar + PRE]
            if not first:
                raise SystemExit("no step 1 found in the first bar: is this the right --pass?")
            t0 = first[0] - PRE
            options = [t0]
            if HALF_BAR[self.pas]:  # which of the two half bars is step 1? the one the punches fit
                options.append(t0 - bar / 2 if t0 - bar / 2 >= 0 else t0 + bar / 2)
        best = None
        for o in options:
            self.starts, self.pinned, self.bar = self._anchor(o, bar)
            self._template(light=True)
            self._classify()
            half = STEPS // 2
            score = -float(sum(abs(b["marks"][:half].count("#") - b["marks"][half:].count("#"))
                               for b in self.bars))
            if best is None or score > best[0]:
                best = (score, o, len(options) > 1)
        self.starts, self.pinned, self.bar = self._anchor(best[1], bar)
        self.bpm = 240.0 / self.bar

    @property
    def nbars(self):
        return len(self.starts) - 1

    def at(self, k, step=0.0):
        """The sample where bar k's step (0-based, may be a fraction or past 16) begins."""
        k2 = min(max(k, 0), self.nbars - 1)
        ls = (self.starts[k2 + 1] - self.starts[k2]) / STEPS
        return int(round((self.starts[k2] + (k - k2) * ls * STEPS + step * ls) * self.fs))

    def bar_samples(self, k):
        return self.x[self.at(k):self.at(k + 1)]

    def dry_like(self, n):
        """The dry bar cut or padded to n samples."""
        d = self.dry
        return d[:n] if len(d) >= n else np.concatenate([d, np.zeros(n - len(d))])

    def sub_power(self, seg, nsub):
        """Third-octave band power a step: what the dry-or-wet guess compares."""
        return self.sub_density(seg, nsub, self.b3, 3, 2048) * self.bw3

    def sub_density(self, seg, nsub, cent, per_oct, nperseg):
        out = np.empty((nsub, len(cent)))
        ln = len(seg) / nsub
        for i in range(nsub):
            w = seg[int(i * ln):int((i + 1) * ln)]
            f, p = signal.welch(w, self.fs, nperseg=min(nperseg, len(w)), noverlap=min(nperseg, len(w)) // 2)
            out[i] = band_density(f, p, cent, per_oct)
        return out

    # -- the dry bar everything is held against --

    def _template(self, light=False):
        fs = self.fs
        self.dry = self.bar_samples(0).copy()
        self.dpeak = float(np.abs(self.dry).max())
        self.tpl3 = self.sub_power(self.dry, STEPS)
        self.floor3 = self.tpl3.max() * 10 ** -5.5
        if light:
            return
        # the noise: the quietest tenth of a second in the file
        n = int(0.1 * fs)
        e = np.square(self.x[:len(self.x) // n * n]).reshape(-1, n).mean(1)
        q = int(np.argmin(e))
        f, p = signal.welch(self.x[q * n:(q + 1) * n], fs, nperseg=1024)
        self.noise6 = band_density(f, p, self.b6, 6)
        self.noise_db = float(db(e[q]))
        # the dry hits
        a = self.at(0)
        lead = int(0.05 * fs)
        t, fl, self.eps = flux_of(self.x[max(a - lead, 0):self.at(1)], fs, None)
        t = t - (a - max(a - lead, 0)) / fs
        ls = self.bar / STEPS
        self.dry_hits, stray = [], []
        for i in pick(fl, 0.12 * fl.max(), 12):
            tt = t[i] + parabolic(fl, i) * 0.002
            pos = (tt - PRE) / ls
            if tt < 0 or pos > STEPS - 0.5:
                continue
            step = int(round(pos)) + 1
            if step in self.pattern and abs(pos - round(pos)) < 0.1:
                old = next((h for h in self.dry_hits if h["step"] == step), None)
                if old is None:
                    self.dry_hits.append(dict(step=step, name=self.pattern[step], t=tt, flux=float(fl[i])))
                elif fl[i] > old["flux"]:
                    old.update(t=tt, flux=float(fl[i]))
            else:
                stray.append(pos + 1)
        self.stray = stray
        self.missing = sorted(set(self.pattern) - {h["step"] for h in self.dry_hits})
        base = min((h["flux"] for h in self.dry_hits), default=float(fl.max()))
        self.thr = self.onset_k * 0.2 * base
        self.tpl_hit, self.determinism = {}, {}
        for h in self.dry_hits:
            if h["name"] in self.tpl_hit:
                continue
            i = a + int(h["t"] * fs)
            self.tpl_hit[h["name"]] = dict(w=self.x[i - int(0.004 * fs):i + int(0.026 * fs)].copy(),
                                           v=self._vec(i), t=h["t"])
            if self.nbars > 1:
                j = self.at(1) + int(h["t"] * fs)
                n60 = int(0.06 * fs)
                self.determinism[h["name"]] = ncc_lag(self.x[j - 96:j + n60], self.x[i - 96:i + n60], 96)[0]
        for h in self.dry_hits:
            i = a + int(h["t"] * fs)
            nxt = min([g["t"] for g in self.dry_hits if g["t"] > h["t"]] + [self.bar])
            h.update(self._hit_numbers(i, int((nxt - h["t"]) * fs)))

    def _vec(self, i):
        fs = self.fs
        w = self.x[i - int(0.004 * fs):i + int(0.026 * fs)]
        if len(w) < 64:
            return np.zeros(len(self.b3))
        p = np.abs(np.fft.rfft(w * np.hanning(len(w)), 4096)) ** 2
        v = np.sqrt(band_density(np.fft.rfftfreq(4096, 1 / fs), p, self.b3, 3) * self.bw3)
        return v / (np.linalg.norm(v) + 1e-30)

    def _hit_numbers(self, i, room):
        """Pitch, how periodic, the peak and the time to fall 20 dB, for the hit at sample i."""
        fs, x = self.fs, self.x
        room = max(min(room, int(0.6 * fs)), 0)
        f0, per = hit_pitch(x[i + int(0.04 * fs):i + min(room, int(0.14 * fs))], fs)
        blk = int(0.005 * fs)
        seg = x[i - int(0.004 * fs):i + room]
        nb = len(seg) // blk
        t20 = np.nan
        peak = float(np.abs(x[i - int(0.004 * fs):i + int(0.03 * fs)]).max()) if i + 8 < len(x) else 0.0
        if nb >= 3:
            e = np.sqrt(np.square(seg[:nb * blk]).reshape(nb, blk).mean(1))
            k = int(np.argmax(e))
            below = np.where(e[k:] < e[k] * 0.1)[0]
            if len(below):
                t20 = float(below[0] * 5.0)
        return dict(f0=f0, periodic=per, t20=t20, peak=peak)

    # -- which bars are wet --

    def _bar_scores(self, k):
        """(correlation with the dry bar, level re dry in dB, a dry/wet/silent letter a step)."""
        seg = self.bar_samples(k)
        b = self.sub_power(seg, STEPS)
        fl = self.floor3
        a_db, b_db = db(np.maximum(self.tpl3, fl)), db(np.maximum(b, fl))
        corr = float(np.corrcoef((a_db - db(fl)).ravel(), (b_db - db(fl)).ravel())[0, 1])
        lvl = float(adb(rms(seg)) - adb(rms(self.dry)))
        dist = np.full(STEPS, np.nan)
        for s in range(STEPS):
            m = np.maximum(self.tpl3[s], b[s]) > fl * 3
            if m.sum() >= 2:
                dist[s] = float(np.mean(np.minimum(np.abs(a_db[s][m] - b_db[s][m]), 20)))
        return corr, lvl, dist

    def _classify(self):
        base = self._bar_scores(1)[2] if self.nbars > 1 else np.zeros(STEPS)
        base = base[np.isfinite(base)]
        # 1.5 times the worst step of a dry bar (2.5 at first: on the real take that came to
        # 13.9 dB and hid the distortion, a delay and both high-pass filters)
        self.wet_thr = float(max(3.0, 1.5 * (base.max() if len(base) else 0)))
        self.bars = []
        for k in range(self.nbars):
            corr, lvl, dist = self._bar_scores(k)
            info = np.isfinite(dist)
            wet = dist > self.wet_thr
            frac = float(wet[info].mean()) if info.any() else 0.0
            marks = "".join(" " if not i else "#" if w else "." for i, w in zip(info, wet))
            self.bars.append(dict(k=k, corr=corr, level=lvl, marks=marks, frac=frac,
                                  wet=bool(frac >= 0.5 or wet[info].sum() >= 4 or abs(lvl) > 1.5),
                                  pinned=k in self.pinned))
        runs, k = [], 0
        while k < self.nbars:
            if self.bars[k]["wet"]:
                j = k
                while j + 1 < self.nbars and self.bars[j + 1]["wet"]:
                    j += 1
                runs.append((k, j))
                k = j + 1
            else:
                k += 1
        self.runs = runs

    def _walk(self, first):
        """Give each effect a wet run near where it is due; where none is, the plan's two bars."""
        runs = [list(r) for r in self.runs]
        p, due, lay, unseen, stray, pending = 0, first, {}, [], 0, 0
        for n in self.effects:
            while p < len(runs) and runs[p][1] < due - 1:
                p, stray = p + 1, stray + 1
            if p < len(runs) and due - 1 <= runs[p][0] <= due + 1:
                a, b = runs[p]
                if b - a >= 4:  # two effects and no dry bar seen between them
                    b, runs[p][0] = a + 1, a + 3
                else:
                    p += 1
                off = a - due
                if a == b:  # seen in one bar only: the plan's two bars, with that bar in them
                    a, off = min(a, due), 0
                    b = a + 1
                lay[n] = (a, b)
                # a run one bar off the plan is a punch that missed a bar's notes, unless the
                # next one is off the same way: then the hand is a bar out and the plan moves
                if b - a >= 2:
                    due, pending = b + 2, 0
                elif off and off == pending:
                    due, pending = a + 3, 0
                else:
                    due, pending = due + 3, off
            else:
                lay[n] = (due, due + 1)
                unseen.append(n)
                due += 3
        stray += len(runs) - p
        return dict(first=first, lay=lay, unseen=unseen, stray=stray,
                    fits=lay[self.effects[-1]][1] <= self.nbars - 1)

    def layout(self, how="auto", bars=None):
        """effect -> (first bar, last bar), and a sentence on where it came from."""
        literal = {n: (2 + 3 * i, 3 + 3 * i) for i, n in enumerate(self.effects)}
        if bars:
            return bars, "from --bars"
        if how == "default":
            return literal, "the plan's layout (effect n from bar 2 + 3(n-1)), as asked"
        if not self.runs:
            return literal, "⚠ no wet bar found at all: the plan's layout, unchecked"
        # the first wet run is the first effect, or a later one if the first ones cannot be heard
        r0 = self.runs[0][0]
        walks = [self._walk(r0 - 3 * j) for j in range(6) if r0 - 3 * j >= 1]
        key = lambda w: (w["fits"], -len(w["unseen"]) - w["stray"], -abs(w["first"] - 2))
        best = max(walks, key=key)
        lay = best["lay"]
        note = f"from the wet runs: {len(self.effects) - len(best['unseen'])} of {len(self.effects)} effects seen"
        odd = [f"{n}: bars {lay[n][0]}-{lay[n][1]}" for n in self.effects if lay[n][1] - lay[n][0] != 1]
        if lay[self.effects[0]][0] != 2:
            note += f"; the first effect is in bar {lay[self.effects[0]][0]} (the plan says 2)"
        if odd:
            note += "; not two bars: " + ", ".join(odd)
        warn = []
        if best["unseen"]:
            warn.append(f"effects {best['unseen']} were not seen as wet and are put where the plan has them")
        if best["stray"]:
            warn.append(f"{best['stray']} wet run(s) belong to no effect")
        rivals = [w["first"] for w in walks if w is not best and w["fits"]
                  and len(w["unseen"]) + w["stray"] <= len(best["unseen"]) + best["stray"]]
        if rivals:
            warn.append(f"the first effect could as well be in bar {rivals}")
        if not best["fits"]:
            warn.append("the last effect runs past the end of the take")
        if warn:
            note += ". ⚠ " + "; ".join(warn) + ". Check against the table above; --bars overrides"
        return lay, note

    # -- onsets --

    def onsets(self, sa, sb):
        """Every new sound between two samples: its time, what it most looks like, how loud."""
        fs, x = self.fs, self.x
        lead = int(0.1 * fs)
        a0 = max(sa - lead, 0)
        t, fl, _ = flux_of(x[a0:min(sb + int(0.03 * fs), len(x))], fs, self.eps)
        out = []
        for i in pick(fl, self.thr, 12):
            s = a0 + int(round((t[i] + parabolic(fl, i) * 0.002) * fs))
            if not (sa <= s - int(PRE * fs) + int(0.01 * fs) and s < sb):
                continue
            v = self._vec(s)
            sims = {n: float(np.dot(v, h["v"])) for n, h in self.tpl_hit.items()}
            w = x[s - int(0.004 * fs):s + int(0.026 * fs)]
            wave_c = {n: ncc_lag(w, h["w"], 96)[0] for n, h in self.tpl_hit.items()}
            name = max(sims, key=sims.get) if sims else "?"
            out.append(dict(s=s, flux=float(fl[i]), name=name, sim=sims.get(name, 0.0), sims=sims,
                            wave=wave_c, peak=float(np.abs(w).max()) if len(w) else 0.0))
        return out

    def position(self, s):
        """(bar, step 1-based with fraction) of a sample found by the onset detector."""
        t = s / self.fs - PRE
        k = int(np.clip(np.searchsorted(self.starts, t + 1e-9, "right") - 1, 0, self.nbars - 1))
        ls = (self.starts[k + 1] - self.starts[k]) / STEPS
        pos = (t - self.starts[k]) / ls
        if pos > STEPS - 0.25 and k + 1 < self.nbars:
            return k + 1, pos - STEPS + 1
        return k, pos + 1

    # -- one effect --

    def analyse(self, n, b1, b2):
        fs, x = self.fs, self.x
        b2 = min(b2, self.nbars - 1)
        R = dict(effect=n, bars=(b1, b2), lines=[])
        say = R["lines"].append
        nb = b2 - b1 + 1
        sa, sb = self.at(b1), self.at(b2 + 1)
        wet = x[sa:sb]
        dry = np.concatenate([self.dry_like(self.at(k + 1) - self.at(k)) for k in range(b1, b2 + 1)])
        ls = (sb - sa) / (nb * STEPS)
        trim = slice(int(2 * ls), len(wet) - int(2 * ls))
        R["wet"], R["dryref"], R["ls"] = wet, dry, ls
        wt, dt = wet[trim], dry[trim]

        # level, peak, centroid
        def centroid(s):
            f, p = signal.welch(s, fs, nperseg=4096)
            return float(np.sum(f * p) / (np.sum(p) + 1e-30))
        R["clipped"] = int(np.sum(np.abs(wet) >= self.clip_at))
        if R["clipped"]:
            say(f"⚠ CLIPPED: {R['clipped']} samples at full scale in these bars (the recording, not the "
                f"PO-12): its level, peak, curve and harmonics are suspect")
        R["level"] = float(adb(rms(wt)) - adb(rms(dt)))
        R["peak"] = float(adb(np.abs(wt).max()) - adb(np.abs(dt).max()))
        R["centroid"] = (centroid(wt), centroid(dt))
        say(f"level {R['level']:+.1f} dB re dry, peak {R['peak']:+.1f} dB; centroid "
            f"{R['centroid'][0]:.0f} Hz (dry {R['centroid'][1]:.0f} Hz)")

        # level a step
        def steps_db(seg, bars_n):
            ln = len(seg) / (bars_n * STEPS)
            return [adb(rms(seg[int(i * ln):int((i + 1) * ln)])) - adb(self.dpeak)
                    for i in range(bars_n * STEPS)]
        R["step_db"] = steps_db(wet, nb)
        dstep = steps_db(self.dry, 1)
        row = lambda v: " ".join(f"{max(int(round(q)), -99):4d}" for q in v)
        say("rms a step, dB re the dry peak:")
        say("  dry    " + row(dstep))
        for j in range(nb):
            say(f"  bar {b1 + j:<3d}" + row(R["step_db"][j * STEPS:(j + 1) * STEPS]))

        # onsets
        ons = self.onsets(sa, sb)
        for o in ons:
            o["bar"], o["pos"] = self.position(o["s"])
        R["onsets"] = ons
        dry_row = "".join(self.pattern.get(s, ".") for s in range(1, STEPS + 1))
        say(f"onsets by step (lower case: under -6 dB re that dry hit; ?: unlike any dry hit; "
            f"+: off the grid).  dry: {dry_row}")
        R["rows"] = {}
        for k in range(b1, b2 + 1):
            cells = ["."] * STEPS
            for o in ons:
                if o["bar"] != k:
                    continue
                st = int(round(o["pos"]))
                if not 1 <= st <= STEPS:
                    continue
                ref = next((h["peak"] for h in self.dry_hits if h["name"] == o["name"]), self.dpeak)
                c = o["name"] if o["sim"] >= 0.6 else "?"
                if o["peak"] < 0.5 * ref and c != "?":
                    c = c.lower()
                cells[st - 1] = "+" if abs(o["pos"] - st) > 0.12 or cells[st - 1] != "." else c
            R["rows"][k] = "".join(cells)
            say(f"  bar {k:<3d} {R['rows'][k]}   " + " ".join(
                f"{o['pos']:.2f}{o['name'] if o['sim'] >= 0.6 else '?'}" for o in ons if o["bar"] == k))
        if ons:
            say("  each onset: step, peak dB re dry peak, likeness to each dry hit as spectrum/waveform")
            for o in ons[:48]:
                say(f"    bar {o['bar']} step {o['pos']:5.2f}  {adb(o['peak']) - adb(self.dpeak):+6.1f} dB  "
                    + "  ".join(f"{SOUND[m]} {o['sims'][m]:.2f}/{o['wave'][m]:.2f}" for m in o["sims"]))
            if len(ons) > 48:
                say(f"    ... and {len(ons) - 48} more")
        if len(ons) >= 2:
            ioi = np.diff([o["s"] for o in ons]) / ls
            R["ioi"] = ioi
            med = float(np.median(ioi))
            R["hits_per_beat"] = 4.0 / med
            say(f"between onsets: median {med:.3f} steps = {4 / med:.2f} hits a beat "
                f"(quartiles {np.percentile(ioi, 25):.3f} to {np.percentile(ioi, 75):.3f}; {len(ons)} onsets)")
        else:
            R["hits_per_beat"] = 0.0

        # the response against dry, a step and pooled
        nsub = 2 * STEPS
        pw = np.stack([self.sub_density(x[self.at(k):self.at(k + 1)], nsub, self.b6, 6, 1024)
                       for k in range(b1, b2 + 1)])
        pd = self.sub_density(self.dry, nsub, self.b6, 6, 1024)
        valid = pd > 10 * self.noise6
        pwc = np.maximum(pw, self.noise6)
        csub = pw <= 2 * self.noise6
        hsub = np.where(valid[None], db(pwc) - db(pd)[None], np.nan)
        keep = np.ones((nb, nsub), bool)
        keep[0, :4] = False
        keep[-1, -4:] = False
        num = np.where(valid[None] & keep[:, :, None], pwc, 0).sum((0, 1))
        den = np.where(valid[None] & keep[:, :, None], pd[None], 0).sum((0, 1))
        cnt = (valid[None] & keep[:, :, None]).sum((0, 1))
        hpool = np.where(cnt >= 2, db(num) - db(np.maximum(den, 1e-30)), np.nan)
        cpool = num <= 2 * cnt * self.noise6
        R["hsub"], R["hpool"], R["csub"], R["cpool"] = hsub, hpool, csub, cpool
        say("response re dry, dB, pooled over the run (a third of an octave; -- where dry has nothing; "
            "< where the wet sound is under the noise, so it is at most this):")
        cells = [f"{c:.0f}:{'--' if not np.isfinite(h) else ('<' if cn else '') + f'{h:+.0f}'}"
                 for c, h, cn in zip(self.b6[::2], hpool[::2], cpool[::2])]
        say("  " + "  ".join(cells[:14]))
        say("  " + "  ".join(cells[14:]))

        # a hold and a quantiser, looked for in every effect
        R["hold"] = hold_rate(wt, fs, dt)
        R["crush"] = crush_step(wt, self.dpeak)
        h, c = R["hold"], R["crush"]
        say(f"hold: {'FOUND' if h['found'] else 'none'}: {h['rate']:.1f} Hz (edges every {h['lag']:.3f} samples, "
            f"48000/{h['divisor']} = {48000 / max(h['divisor'], 1):.1f}), comb {h['own']:.2f} less dry's "
            f"{h['control']:.2f} at that lag = {h['strength']:.2f} (0.2 or more is a hold)")
        if c["edges"] >= 40 and np.isfinite(c["step"]):
            say(f"quantiser: {'FOUND' if c['found'] else 'none'}: step {c['step']:.5f} = the dry peak / "
                f"{c['per_peak']:.2f}, {c['levels']} levels across the wet range; {c['edges']} jumps, spread "
                f"{c['tight']:.2f} of a step, {100 * c['on_grid']:.0f}% on whole steps")
        else:
            say(f"quantiser: none ({c['edges']} flat-to-flat jumps)")

        if n == 2:
            self._distortion(R, b1, b2, say)
        if n in (5, 6, 7, 8):
            self._filter(R, n, b1, b2, say)
        if n in (9, 10, 11, 12):
            self._repeat(R, say)
        if n in (4, 13, 14, 15, 16):
            self._echo(R, b1, b2, say)  # (pass c stops at 8, so 4 is the only one it reaches)
        if n in (13, 14, 15, 16) or self.pas == "b":
            self._pitches(R, b1, b2, say)
        if n in (15, 16):
            self._wobble(R, b1, b2, say)
        if self.pas == "c" and "T" in self.tpl_hit:
            self._harmonics(R, b1, b2, say)
        return R

    def _aligned_hits(self, b1, b2, length=0.18, sure=0.8):
        """(dry window, wet window) for each hit that is the same every time, edges left out."""
        fs = self.fs
        out = []
        for k in range(b1, b2 + 1):
            for h in self.dry_hits:
                if self.determinism.get(h["name"], 0) < sure:
                    continue
                if (k == b1 and h["step"] <= 2) or (k == b2 and h["step"] >= 15):
                    continue
                nxt = min([g["t"] for g in self.dry_hits if g["t"] > h["t"]] + [self.bar])
                ln = int(min(length, nxt - h["t"] - 0.005) * fs)
                i, j = self.at(0) + int(h["t"] * fs), self.at(k) + int(h["t"] * fs)
                a0 = int(0.002 * fs)
                d = self.x[i - a0:i + ln]
                c, lag = ncc_lag(self.x[j - a0:j + ln], d, int(0.003 * fs))
                w = self.x[j - a0 + lag:j + ln + lag]
                if len(w) == len(d):
                    out.append(dict(dry=d, wet=w, ncc=c, name=h["name"], bar=k, step=h["step"]))
        return out

    def _distortion(self, R, b1, b2, say):
        hits = [h for h in self._aligned_hits(b1, b2) if h["ncc"] >= 0.5]
        if not hits:
            say("curve: no hit that repeats sample for sample was found wet, so no curve")
            return
        d = np.concatenate([h["dry"] for h in hits]) / self.dpeak
        w = np.concatenate([h["wet"] for h in hits]) / self.dpeak
        edges = np.linspace(-1.05, 1.05, 62)
        which = np.digitize(d, edges)
        cx, cy = [], []
        for b in range(1, len(edges)):
            m = which == b
            if m.sum() >= 20:
                cx.append(0.5 * (edges[b - 1] + edges[b]))
                cy.append(float(np.median(w[m])))
        blk = int(0.005 * self.fs)
        ed = np.concatenate([np.abs(h["dry"][:len(h["dry"]) // blk * blk]).reshape(-1, blk).max(1) for h in hits])
        ew = np.concatenate([np.abs(h["wet"][:len(h["wet"]) // blk * blk]).reshape(-1, blk).max(1) for h in hits])
        ed, ew = ed / self.dpeak, ew / self.dpeak
        ee = np.linspace(0, 1.05, 31)
        wh = np.digitize(ed, ee)
        ex, ey = [], []
        for b in range(1, len(ee)):
            m = wh == b
            if m.sum() >= 3:
                ex.append(0.5 * (ee[b - 1] + ee[b]))
                ey.append(float(np.median(ew[m])))
        R["curve"] = (np.array(cx), np.array(cy))
        R["env_curve"] = (np.array(ex), np.array(ey))
        R["fits"], R["env_fits"] = {}, {}
        say(f"curve, from {len(hits)} hits ({', '.join(sorted({SOUND[h['name']] for h in hits}))}), x and y "
            f"in units of the dry peak ({self.dpeak:.4f} of full scale):")
        say("  wet sample against dry sample: " + " ".join(f"{a:+.2f}>{b:+.2f}" for a, b in
                                                             list(zip(cx, cy))[::5]))
        for name, fn in SHAPES.items():
            R["fits"][name] = fit_shape(R["curve"][0], R["curve"][1], fn)
            R["env_fits"][name] = fit_shape(R["env_curve"][0], R["env_curve"][1], fn) if len(ex) >= 4 else (np.nan,) * 3
            g, lv, r = R["fits"][name]
            g2, lv2, r2 = R["env_fits"][name]
            say(f"  level × {name}(g x): samples g {g:.2f}, level {lv:.3f}, residual {r:.4f};  "
                f"envelopes g {g2:.2f}, level {lv2:.3f}, residual {r2:.4f}")
        R["best_shape"] = min(R["fits"], key=lambda k: R["fits"][k][2])
        say(f"  closest: {R['best_shape']}. (g is per dry peak: ours is per unit, so scale by our mix's peak.)")

    def _filter(self, R, n, b1, b2, say):
        kind = "lp" if n in (5, 6) else "hp"
        fit = fit_filter(self.b6, R["hpool"], kind, R["cpool"])
        other = fit_filter(self.b6, R["hpool"], "hp" if kind == "lp" else "lp", R["cpool"])
        R["filter"] = fit
        if fit is None:
            say("filter: the pooled response is too flat or too sparse to lay a filter on")
        else:
            sh = response_shape(self.b6, R["hpool"], fit, kind, R["cpool"])
            R["filter_shape"] = sh
            if n in (6, 8):
                say("(pooled over a sweep this is an average, not a setting; the track below is the reading)")
            say(f"filter, pooled, as a two-pole {'low' if kind == 'lp' else 'high'}-pass: cutoff {fit['fc']:.0f} Hz, "
                f"Q {fit['q']:.2f}, gain {fit['gain']:+.1f} dB, residual {fit['rms']:.1f} dB "
                f"(the other kind: {'none' if other is None else format(other['rms'], '.1f') + ' dB'})")
            say(f"  off the response itself: -3 dB at {sh['f3']:.0f} Hz, peak {sh['peak_db']:+.1f} dB at "
                f"{sh['peak_hz']:.0f} Hz, slope {sh['slope']:+.1f} dB an octave")
        # the cutoff every half step
        nb = b2 - b1 + 1
        track = np.full(nb * 2 * STEPS, np.nan)
        for j in range(nb):
            for i in range(2 * STEPS):
                f = fit_filter(self.b6, R["hsub"][j, i], kind, R["csub"][j, i])
                if f and f["rms"] < 3.0 and f["pass_n"] >= 3 and f["stop_n"] >= 3:
                    track[j * 2 * STEPS + i] = f["fc"]
        R["track"] = track
        say("cutoff every half step, Hz (- where the dry sound has nothing on both sides of it):")
        for j in range(nb):
            say(f"  bar {b1 + j:<3d}" + " ".join("    -" if not np.isfinite(v) else f"{v:5.0f}"
                                                 for v in track[j * 2 * STEPS:(j + 1) * 2 * STEPS]))
        ok = np.isfinite(track)
        if ok.sum() < 6:
            say("  too few points for a sweep")
            return
        t = np.arange(len(track))[ok] / 2.0  # steps from the run's first bar line
        g = np.log2(track[ok])
        span = float(g.max() - g.min())
        mid = float(np.percentile(g, 75) - np.percentile(g, 25))
        R["sweep"] = dict(span=span)
        if mid < 0.5:
            say(f"  it stays put: median {2 ** np.median(g):.0f} Hz, the middle half of the points within "
                f"{mid:.2f} octaves ({int(np.sum(np.abs(g - np.median(g)) > 0.5))} of {len(g)} stray)")
            R["sweep"].update(kind="fixed", median=float(2 ** np.median(g)))
            return
        dg = np.diff(g) / np.maximum(np.diff(t), 0.5)
        trend = float(np.median(dg))
        jumps = [i for i in range(len(dg)) if np.sign(g[i + 1] - g[i]) == -np.sign(trend)
                 and abs(g[i + 1] - g[i]) > 0.5 * span]
        segs = np.split(np.arange(len(g)), [i + 1 for i in jumps])
        seg = max(segs, key=len)
        slope, icpt = np.polyfit(t[seg], g[seg], 1) if len(seg) >= 3 else (trend, g[seg[0]] - trend * t[seg[0]])
        info = dict(kind="sweep", slope=float(slope), direction="down" if slope < 0 else "up",
                    jumps=[float(t[i + 1]) for i in jumps], first=float(2 ** g[seg[0]]),
                    last=float(2 ** g[seg[-1]]), t_first=float(t[seg[0]]), t_last=float(t[seg[-1]]))
        if len(jumps) >= 1:
            t_restart = info["jumps"][0]
            period = float(np.median(np.diff(info["jumps"]))) if len(jumps) >= 2 else np.nan
            info["restart"] = t_restart
            info["period"] = period
            start = 2 ** (icpt + slope * (t_restart if t[seg[0]] >= t_restart else t[seg[0]]))
            info["start_hz"] = float(start)
            info["over16"] = float(start * 2 ** (slope * 16))
        R["sweep"].update(info)
        say(f"  sweep: {info['direction']}, {slope:+.3f} octaves a step ({slope * 16:+.2f} over sixteen steps); "
            f"longest unbroken stretch from {info['first']:.0f} Hz at step {info['t_first'] + 1:.1f} to "
            f"{info['last']:.0f} Hz at step {info['t_last'] + 1:.1f} (steps counted from the run's first bar line)")
        if jumps:
            where = ", ".join(f"{q + 1:.1f}" for q in info["jumps"])
            say(f"  it starts again at step {where}"
                + (f", every {info['period']:.1f} steps" if np.isfinite(info["period"]) else "")
                + f"; from about {info['start_hz']:.0f} Hz, which sixteen steps on would be {info['over16']:.0f} Hz")
            gaps = np.diff(info["jumps"])
            if len(gaps) and np.median(gaps) < 2.5:
                say("  so it restarts every step or two: a sweep a step, not a sweep a bar")
        else:
            say("  no restart seen in the run: it runs on across the bar line (or the points that would show "
                "one are missing)")

    def _repeat(self, R, say):
        ons, fs, x = R["onsets"], self.fs, self.x
        if len(ons) < 3:
            say(f"repeats: {len(ons)} onsets in the run, so nothing repeats")
            R["repeat"] = dict(verdict="nothing repeats")
            return
        ioi = np.diff([o["s"] for o in ons])
        p = float(np.median(ioi))
        rows = []
        for i in range(len(ons) - 1):
            if abs(ioi[i] - p) > 0.05 * p:
                continue
            a, b = ons[i]["s"], ons[i + 1]["s"]
            n = int(p)
            if b + n + 48 > len(x):
                continue
            c, _ = ncc_lag(x[b - 240:b + n + 240], x[a - 240:a + n + 240], 240)
            rows.append((ons[i]["name"], c))
        noisy = [c for nm, c in rows if self.determinism.get(nm, 1.0) < 0.5]
        allc = [c for _, c in rows]
        det = ", ".join(f"{SOUND[k]} {v:.2f}" for k, v in self.determinism.items())
        if len(noisy) >= 2:
            m = float(np.median(noisy))
            verdict = "a looped slice" if m > 0.8 else "fresh hits" if m < 0.5 else "unclear"
            say(f"repeats: one slice against the next at {p / R['ls']:.3f} steps: {m:.2f} on sounds that are "
                f"never the same twice dry, {np.median(allc):.2f} on all ({len(rows)} pairs) → {verdict}")
        elif rows:
            verdict = "cannot tell"
            say(f"repeats: one slice against the next at {p / R['ls']:.3f} steps: {np.median(allc):.2f} "
                f"({len(rows)} pairs), but every repeated sound is the same each time dry, so a loop and a "
                f"retrigger look alike here")
        else:
            verdict = "no even spacing"
            say("repeats: the onsets are not evenly spaced")
        say(f"  (how alike a dry hit is to itself a bar later: {det})")
        R["repeat"] = dict(verdict=verdict, period_steps=p / R["ls"],
                           slice_noisy=float(np.median(noisy)) if noisy else np.nan,
                           slice_all=float(np.median(allc)) if allc else np.nan)

    def _echo(self, R, b1, b2, say):
        fs = self.fs
        wet, dry, ls = R["wet"], R["dryref"], R["ls"]
        trim = slice(int(2 * ls), len(wet) - int(2 * ls))
        wt, dt = wet[trim], dry[trim]
        nmax = int(0.45 * len(wt))
        lo = int(0.001 * fs)
        e = cepstrum_echo(wt, dt, fs, 10 ** (self.noise_db / 10))
        R["echo_cep"] = e
        clear = e["gain"] > 6 * e["noise"] and e["gain"] > 0.03
        say(f"echo, blind (cepstrum of wet less dry): strongest at {e['lag_ms']:.2f} ms ({e['lag'] / ls:.3f} steps), "
            f"gain {e['gain']:.3f}, each next one × {e['feedback']:.2f}; the floor of this reading is "
            f"{e['noise']:.3f}; {100 * e['share']:.1f}% of the spectrum spoke" + ("" if clear else "  → no echo to speak of"))
        if e["share"] < 0.05:
            say("  (so little of the spectrum carries sound that the blind reading's gain is rough; a comb "
                "finer than the sound is wide cannot be seen at all. Trust the next line on a kick alone.)")
        say("  (a lag that is a whole number of steps can be the pattern itself moved, as a shuffle does, "
            "not an echo)")
        # the residual way: sample-aligned dry taken off, what is left held against dry
        parts = []
        for j, kbar in enumerate(range(b1, b2 + 1)):
            a, b = self.at(kbar), self.at(kbar + 1)
            d = self.dry_like(b - a)
            _, lag = ncc_lag(self.x[a:b], d, int(0.002 * fs))
            w = self.x[a + lag:b + lag]
            parts.append(w - d[:len(w)] if len(w) == len(d) else np.zeros(len(d)))
        resid = np.concatenate(parts)[trim]
        n = min(len(resid), len(dt))
        c = signal.correlate(resid[:n], dt[:n], "full", method="fft")[n - 1:] / (np.dot(dt[:n], dt[:n]) + 1e-30)
        c = c[:nmax]
        k2 = lo + int(np.argmax(c[lo:]))
        ratio = float(c[2 * k2] / c[k2]) if 2 * k2 < len(c) and c[k2] > 0 else np.nan
        R["echo_res"] = dict(lag_ms=1000 * k2 / fs, gain=float(c[k2]), feedback=ratio)
        R["echo_curve"] = (np.arange(len(e["c"])) / fs * 1000, e["c"])
        say(f"echo, from (wet − dry) against dry: strongest at {1000 * k2 / fs:.2f} ms ({k2 / ls:.3f} steps), gain "
            f"{c[k2]:.2f}, the one after × {ratio:.2f}.  (This way undercounts sounds that are never the same "
            f"twice; it is exact on a kick alone.)")

    def _pitches(self, R, b1, b2, say):
        fs = self.fs
        say("each hit: step, pitch 40 to 140 ms in (how periodic), time to fall 20 dB, peak re dry peak")
        say("  dry: " + "; ".join(
            f"{h['step']}{h['name']} {h['f0']:.1f} Hz ({h['periodic']:.2f}) {h['t20']:.0f} ms" for h in self.dry_hits))
        ons = R["onsets"]
        R["hits"] = []
        for i, o in enumerate(ons):
            room = (ons[i + 1]["s"] - o["s"]) if i + 1 < len(ons) else int(0.6 * fs)
            o.update(self._hit_numbers(o["s"], room))
            R["hits"].append(o)
        for o in ons[:40]:
            say(f"  bar {o['bar']} step {o['pos']:5.2f} {o['name']}: {o['f0']:7.1f} Hz ({o['periodic']:.2f})  "
                f"{o['t20']:5.0f} ms  {adb(o['peak']) - adb(self.dpeak):+5.1f} dB")
        tonal = [o for o in ons if o["periodic"] >= 0.6 and np.isfinite(o["f0"])
                 and self.determinism.get(o["name"], 0) >= 0.8]
        for nm in sorted({o["name"] for o in tonal}):
            f = np.array([o["f0"] for o in tonal if o["name"] == nm])
            d = [h["f0"] for h in self.dry_hits if h["name"] == nm and np.isfinite(h["f0"])]
            if len(f) >= 2 and d:
                say(f"  {SOUND[nm]} pitch across the run: {f.min():.1f} to {f.max():.1f} Hz (× {f.max() / f.min():.3f}); "
                    f"dry {np.mean(d):.1f} Hz")
                R.setdefault("pitch_range", {})[nm] = (float(f.min()), float(f.max()))
        for nm in sorted({o["name"] for o in ons}):
            v = np.array([o["t20"] for o in ons if o["name"] == nm and np.isfinite(o["t20"])])
            d = [h["t20"] for h in self.dry_hits if h["name"] == nm and np.isfinite(h["t20"])]
            if len(v) >= 2 and d:
                say(f"  {SOUND[nm]} decay across the run: {v.min():.0f} to {v.max():.0f} ms; dry {np.mean(d):.0f} ms")

    def _wobble_series(self, b1, b2):
        fs, x = self.fs, self.x
        ts, cs = [], []
        for k in range(b1, b2 + 1):
            for h in self.dry_hits:
                if h["periodic"] < 0.8 or not np.isfinite(h["f0"]) or self.determinism.get(h["name"], 0) < 0.8:
                    continue
                nxt = min([g["t"] for g in self.dry_hits if g["t"] > h["t"]] + [self.bar])
                ln = int(min(0.35, nxt - h["t"] - 0.01) * fs)
                if ln < int(0.12 * fs):
                    continue
                i, j = self.at(0) + int(h["t"] * fs), self.at(k) + int(h["t"] * fs)
                if j + ln > len(x):
                    continue
                td, fd = zc_track(x[i:i + ln], fs, h["f0"])
                tw, fw = zc_track(x[j:j + ln], fs, h["f0"])
                if len(td) < 4 or len(tw) < 4:
                    continue
                env = np.abs(signal.hilbert(x[j:j + ln]))
                m = (tw > 0.06) & (tw < ln / fs - 0.02) & (tw > td[0]) & (tw < td[-1])
                m &= env[np.clip((tw * fs).astype(int), 0, ln - 1)] > 0.1 * env.max()
                cents = 1200 * np.log2(fw[m] / np.interp(tw[m], td, fd))
                good = np.abs(cents) < 300
                ts.extend((j / fs + tw[m])[good])
                cs.extend(cents[good])
        return np.array(ts), np.array(cs)

    def _wobble(self, R, b1, b2, say):
        t, c = self._wobble_series(b1, b2)
        if len(t) < 12:
            say("pitch wobble: no pitched hit long enough to follow")
            return
        ctl = self._wobble_series(1, 1)[1] if self.nbars > 1 else np.array([0.0])
        fr = np.arange(1.0, 20.0, 0.05)
        p = signal.lombscargle(t, c - c.mean(), 2 * np.pi * fr)
        k = int(np.argmax(p))
        amp = float(np.sqrt(4 * p[k] / len(t)))
        R["wobble"] = dict(rate=float(fr[k]), cents=amp, rms=float(np.std(c)), mean=float(c.mean()),
                           control=float(np.std(ctl)) if len(ctl) else 0.0, n=len(t))
        say(f"pitch wobble, wet cycles against dry cycles of the pitched hits ({len(t)} cycles): mean "
            f"{c.mean():+.1f} cents, spread {np.std(c):.1f} cents (a dry bar against the dry bar: "
            f"{R['wobble']['control']:.1f}); strongest rate {fr[k]:.2f} Hz at ±{amp:.1f} cents"
            + ("  (the spread is no more than dry's: no wobble)" if np.std(c) < 2 * R["wobble"]["control"] + 1 else ""))

    def _harmonics(self, R, b1, b2, say):
        fs, x = self.fs, self.x
        h = next(g for g in self.dry_hits if g["name"] == "T")
        n = int(0.15 * fs)

        def harm(i):
            w = x[i + int(0.01 * fs):i + int(0.01 * fs) + n]
            if len(w) < n:
                return None
            p = np.abs(np.fft.rfft(w * np.hanning(n), 1 << 16))
            f = np.fft.rfftfreq(1 << 16, 1 / fs)
            m = (f > 80) & (f < 2500)
            f0 = f[m][int(np.argmax(p[m]))]
            lv = []
            for k in range(1, 10):
                mm = (f > k * f0 * 0.97) & (f < k * f0 * 1.03)
                lv.append(float(adb(p[mm].max()) if mm.any() else -200.0))
            return f0, [v - lv[0] for v in lv]
        d = harm(self.at(0) + int(h["t"] * fs))
        w = harm(self.at(b2) + int(h["t"] * fs))
        if d and w:
            R["harmonics"] = dict(dry=d, wet=w)
            say(f"the tone's harmonics 1 to 9, dB re its first: dry ({d[0]:.1f} Hz) "
                + " ".join(f"{v:+.0f}" for v in d[1]) + f";  wet ({w[0]:.1f} Hz) " + " ".join(f"{v:+.0f}" for v in w[1]))


# ---- the report and the pictures ----

def report(t, lay, note, only=None, out=None, say=print):
    say(f"pass {t.pas}: bar {t.bar:.5f} s = {t.bpm:.3f} bpm; {t.nbars} whole bars; the first begins "
        f"{t.starts[0]:.3f} s in; {len(t.pinned)} bars pinned by their likeness to the first")
    say(f"dry bar: peak {adb(t.dpeak):.1f} dBFS; noise {t.noise_db:.1f} dBFS in the quietest tenth of a second; "
        f"hits found on steps {', '.join(str(h['step']) + h['name'] for h in t.dry_hits)}")
    if t.missing:
        say(f"⚠ no dry onset found on step(s) {t.missing}: is the pattern the pass's, and --pass right?")
    if t.stray:
        say(f"⚠ dry onsets where the pattern has none, at steps {', '.join(f'{s:.2f}' for s in t.stray)}")
    if t.silent_start:
        say(f"the take opens on {t.lead:.3f} s of silence: its first sound is taken as step 1 of bar 0")
    elif HALF_BAR[t.pas]:
        say("(this pattern is the same in both halves of a bar, so step 1 was told from step 9 by which "
            "makes the dry bars whole. If every wet run below starts or ends mid-bar, it chose wrong.)")
    say(f"a step is wet when its third-octave levels differ from dry by over {t.wet_thr:.1f} dB on average")
    say("bar  corr  level   steps 1 to 16 (. dry  # wet  blank: silent both)   guess")
    marks = {}
    for n, (a, b) in lay.items():
        for k in range(a, b + 1):
            marks[k] = n
    for b in t.bars:
        tag = f"  ← effect {marks[b['k']]}" if b["k"] in marks else ""
        say(f"{b['k']:3d}  {b['corr']:.3f} {b['level']:+6.1f}  {b['marks']}  {'WET' if b['wet'] else 'dry'}"
            f"{'' if b['pinned'] else ' (grid carried)'}{tag}")
    say(f"layout: {note}")
    ext = {}
    for a, b in t.runs:  # where the hand came down and went up, by the first and last wet step
        first = t.bars[a]["marks"].find("#") + 1
        last = t.bars[b]["marks"].rfind("#") + 1
        if first == 0 or last == 0:
            say(f"  wet run{'' if (n0 := next((n for n, (la, lb) in lay.items() if la <= b and a <= lb), None)) is None else f' (effect {n0})'}: "
                f"bars {a} to {b}, by level only: no step differs enough to say where the hand came down")
            continue
        n = next((n for n, (la, lb) in lay.items() if la <= b and a <= lb), None)
        ext[(a, b)] = (first, last)
        say(f"  wet run{'' if n is None else f' (effect {n})'}: first step heard changed bar {a} step {first}, "
            f"last bar {b} step {last} (a step the effect leaves alone does not show)")
    for ga, gb, size in getattr(t, "gaps", []):
        ka = int(np.clip(np.searchsorted(t.starts, ga, "right") - 1, 0, t.nbars - 1))
        kb = int(np.clip(np.searchsorted(t.starts, gb, "right") - 1, 0, t.nbars - 1))
        say(f"⚠ {size * 1000:.1f} ms is missing from the file between {ga:.2f} s and {gb:.2f} s (bars {ka} to {kb}): "
            f"{size * t.fs / 1024:.2f} buffers of 1024 samples. The capture dropped it or the PO-12 "
            f"skipped; steps in those bars are placed to within that much")
    clip = np.abs(t.x) >= t.clip_at
    if clip.any():
        say(f"⚠ {int(clip.sum())} samples at full scale. Only the effects named below as clipped have "
            f"suspect levels and curves")
    hd = hold_rate(t.dry, t.fs)
    cd = crush_step(t.dry, t.dpeak)
    say(f"control, the dry bar: its own edge comb is {hd['strength']:.2f} at most, at {hd['rate']:.0f} Hz"
        f"{' (the dry sound has regular edges of its own, a square wave likely)' if hd['strength'] >= 0.35 else ''}"
        f"; each effect's hold is read less this. Quantiser on dry: "
        f"{'⚠ found' if cd['found'] else 'none'} ({cd['edges']} jumps)")
    results = {"dry_hold": hd, "dry_crush": cd}
    for n, (a, b) in lay.items():
        if only and n not in only:
            continue
        if a >= t.nbars:
            say(f"\n== effect {n} ({NAMES.get(n, '?')}): bars {a}-{b} are past the end of the take")
            continue
        r = t.analyse(n, a, b)
        results[n] = r
        say(f"\n== effect {n} ({NAMES.get(n, '?')}), bars {r['bars'][0]}-{r['bars'][1]}")
        for line in r["lines"]:
            say("   " + line)
        if out:
            plot_effect(t, r, out)
    if out:
        plot_overview(t, lay, out)
        say(f"\nplots in {out}")
    return results


def log_spec(seg, fs, rows=220):
    f, tt, s = signal.spectrogram(seg, fs, nperseg=2048, noverlap=2048 - 256)
    fl = np.geomspace(40, 20000, rows)
    pos = np.interp(fl, f, np.arange(len(f)))
    i0 = np.floor(pos).astype(int).clip(0, len(f) - 2)
    w = (pos - i0)[:, None]
    return db(s[i0] * (1 - w) + s[i0 + 1] * w), tt


def plot_effect(t, r, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    n, (b1, b2) = r["effect"], r["bars"]
    wet, dry, ls, fs = r["wet"], r["dryref"], r["ls"], t.fs
    nst = (b2 - b1 + 1) * STEPS
    fig = plt.figure(figsize=(16, 11), dpi=100)
    gs = fig.add_gridspec(4, 2, height_ratios=[1.15, 1.15, 0.8, 1.0], hspace=0.32, wspace=0.14)
    sd, _ = log_spec(dry, fs)
    sw, _ = log_spec(wet, fs)
    top = max(sd.max(), sw.max())

    def lines(ax):
        for s in range(nst + 1):
            ax.axvline(s, color="w" if s % STEPS else "k", lw=0.4 if s % 4 else 0.9 if s % STEPS else 1.6, alpha=0.6)
        ax.set_xlim(0, nst)
        ax.set_xticks(range(0, nst + 1, 4))
        ax.set_xticklabels([str(s % STEPS + 1) for s in range(0, nst + 1, 4)])

    for row, (sp, name) in enumerate(((sd, "dry bar, repeated"), (sw, f"effect {n}: {NAMES.get(n, '')}"))):
        ax = fig.add_subplot(gs[row, :])
        ax.imshow(sp, origin="lower", aspect="auto", extent=(0, nst, 0, 1), vmin=top - 75, vmax=top, cmap="magma")
        ticks = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
        ax.set_yticks([np.log(f / 40) / np.log(500) for f in ticks])
        ax.set_yticklabels([f"{f}" if f < 1000 else f"{f // 1000}k" for f in ticks])
        ax.set_ylabel("Hz")
        ax.set_title(f"pass {t.pas} · {name} · bars {b1}-{b2} · x: steps", fontsize=11, loc="left")
        lines(ax)
    ax = fig.add_subplot(gs[2, :])
    xs = np.arange(len(wet)) / ls
    ax.plot(xs, dry / t.dpeak, color="0.6", lw=0.5, label="dry")
    ax.plot(xs, wet / t.dpeak, color="C3", lw=0.5, alpha=0.85, label="wet")
    for o in r["onsets"]:
        ax.axvline((o["s"] - t.at(b1)) / ls, color="C0", lw=0.6, ymin=0.9)
    ax.set_ylabel("re dry peak")
    ax.legend(loc="upper right", fontsize=8, ncol=2)
    lines(ax)
    for s in range(nst + 1):
        ax.axvline(s, color="k", lw=0.2, alpha=0.3)
    ax = fig.add_subplot(gs[3, 0])
    ax.semilogx(t.b6, r["hpool"], "o-", ms=3, color="C3")
    if r.get("filter"):
        f = r["filter"]
        kind = "lp" if n in (5, 6) else "hp"
        ax.semilogx(t.b6, np.maximum(filter_model([np.log2(f["fc"]), f["q"], f["gain"]], t.b6, kind), -60),
                    "k--", lw=0.8, label=f"two-pole fit {f['fc']:.0f} Hz Q {f['q']:.1f}")
        ax.legend(fontsize=8)
    ax.axhline(0, color="0.5", lw=0.6)
    ax.set_ylim(-50, 25)
    ax.set_xlim(40, 20000)
    ax.grid(True, which="both", alpha=0.25)
    ax.set_title("response re dry, dB, pooled", fontsize=10, loc="left")
    ax = fig.add_subplot(gs[3, 1])
    if n == 2 and "curve" in r:
        ax.plot(*r["curve"], "o", ms=3, color="C3", label="wet sample v dry sample")
        ax.plot(*r["env_curve"], "s", ms=3, color="C0", label="envelopes")
        xx = np.linspace(-1.05, 1.05, 200)
        for nm, fn in SHAPES.items():
            g, lv, _ = r["fits"][nm]
            ax.plot(xx, lv * fn(g * xx), lw=0.8, label=f"{nm} g {g:.1f}")
        ax.legend(fontsize=7)
        ax.grid(True, alpha=0.25)
        ax.set_title("the curve, in dry peaks", fontsize=10, loc="left")
    elif "track" in r:
        tr = r["track"]
        ax.semilogy(np.arange(len(tr)) / 2 + 1, tr, "o-", ms=3, color="C3")
        ax.set_ylim(40, 20000)
        ax.grid(True, which="both", alpha=0.25)
        ax.set_title("cutoff every half step, Hz", fontsize=10, loc="left")
    elif "echo_curve" in r:
        ms, d = r["echo_curve"]
        ax.plot(ms, d, lw=0.6, color="C3")
        ax.set_xlim(0, min(ms[-1], 1600))
        ax.grid(True, alpha=0.25)
        ax.set_ylim(-0.3, 1.0)
        ax.set_title("cepstrum of wet less dry (an echo's gain at its lag), by lag in ms", fontsize=10, loc="left")
    elif n == 3 and len(r["crush"]["heights"]):
        ax.hist(r["crush"]["heights"] / t.dpeak, bins=200, color="C3")
        ax.set_title("jump heights, in dry peaks", fontsize=10, loc="left")
    elif n == 1:
        lg, sc, _ = hold_comb(wet, fs)
        ax.plot(lg, sc, lw=0.6, color="C3")
        ax.set_xlim(0, 200)
        ax.set_title("edge comb score by lag in samples", fontsize=10, loc="left")
        ax.grid(True, alpha=0.25)
    else:
        sdb = np.array(r["step_db"])
        ax.bar(np.arange(len(sdb)) + 1, sdb + 80, bottom=-80, color="C3", width=0.8)
        ax.set_ylim(-80, 0)
        ax.set_title("rms a step, dB re dry peak", fontsize=10, loc="left")
        ax.grid(True, alpha=0.25)
    Path(out).mkdir(parents=True, exist_ok=True)
    fig.savefig(Path(out) / f"pass-{t.pas}-fx{n:02d}.png", bbox_inches="tight")
    plt.close(fig)


def plot_overview(t, lay, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fs = t.fs
    blk = int(0.01 * fs)
    e = np.abs(t.x[:len(t.x) // blk * blk]).reshape(-1, blk).max(1)
    fig, ax = plt.subplots(figsize=(18, 4.5), dpi=100)
    ax.plot(np.arange(len(e)) * 0.01, adb(e), lw=0.5, color="0.2")
    for b in t.bars:
        ax.axvspan(t.starts[b["k"]], t.starts[b["k"] + 1], color="C3" if b["wet"] else "C2", alpha=0.18, lw=0)
        ax.axvline(t.starts[b["k"]], color="k", lw=0.3)
        ax.text(t.starts[b["k"]] + 0.05, -3, str(b["k"]), fontsize=6, va="top")
    for n, (a, b) in lay.items():
        if a < t.nbars:
            ax.text(t.starts[a], 2, f"fx {n}", fontsize=8, color="C3")
    ax.set_ylim(-80, 6)
    ax.set_xlim(0, len(t.x) / fs)
    ax.set_xlabel("seconds   (red: bars read as wet, green: dry; small numbers: bars)")
    ax.set_ylabel("dBFS")
    ax.set_title(f"pass {t.pas}: {t.bpm:.2f} bpm", loc="left")
    Path(out).mkdir(parents=True, exist_ok=True)
    fig.savefig(Path(out) / f"pass-{t.pas}-overview.png", bbox_inches="tight")
    plt.close(fig)


# ---- the selftest: synthetic takes with known effects, made hard the way the real path is ----

SY = dict(bar=2.9871, ratio=1.00013, hold=8, crush=0.25 / 7.3, drive=11.0, drive_level=0.2,
          lp=(600.0, 2.0), hp=(2000.0, 2.0), lsweep=(8000.0, 200.0), hsweep=(100.0, 4000.0),
          echo=(1.5, 0.5, 0.4), comb=(0.005, 0.6, 0.6), vib=(6.0, 25.0), lfo=(0.37, 0.25))


def _sound(kind, rng, fs, mul=1.0):
    if kind == "K":
        t = np.arange(int(0.6 * fs)) / fs
        f = 55.0 * mul * (1 + 2 * np.exp(-t / 0.02))
        y = 0.22 * np.sin(2 * np.pi * np.cumsum(f) / fs) * np.exp(-t / 0.12)
        y[:int(0.003 * fs)] += 0.02 * rng.standard_normal(int(0.003 * fs))
        return y
    if kind == "S":
        t = np.arange(int(0.4 * fs)) / fs
        nz = signal.sosfilt(signal.butter(2, 1000, "high", fs=fs, output="sos"), rng.standard_normal(len(t)))
        return 0.05 * nz * np.exp(-t / 0.06) + 0.06 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.03)
    if kind == "H":
        t = np.arange(int(0.15 * fs)) / fs
        nz = signal.sosfilt(signal.butter(2, 7000, "high", fs=fs, output="sos"), rng.standard_normal(len(t)))
        return 0.05 * nz * np.exp(-t / 0.02)
    if kind == "N":
        t = np.arange(int(1.4 * fs)) / fs
        nz = signal.sosfilt(signal.butter(2, 9000, "low", fs=fs, output="sos"), rng.standard_normal(len(t)))
        return 0.07 * nz * np.exp(-t / 0.25)
    t = np.arange(int(0.9 * fs)) / fs  # T: a band-limited square
    y = sum(np.sin(2 * np.pi * 440 * k * t) / k for k in range(1, 52, 2))
    return 0.09 * y * np.exp(-t / 0.2)


def _svf_sweep(x, fs, f_from, f_to, period, kind, q=2.0):
    """A zero-delay state-variable filter whose cutoff runs from f_from to f_to and starts again."""
    out = np.empty(len(x))
    s1 = s2 = 0.0
    r = 1.0 / q
    k = (f_to / f_from) ** (1.0 / period)
    fc = f_from
    for i in range(len(x)):
        if i % period == 0:
            fc = f_from
        g = np.tan(np.pi * min(fc, 0.45 * fs) / fs) if i % 16 == 0 else g  # noqa: F821
        h = 1.0 / (1.0 + r * g + g * g)
        hp = (x[i] - r * s1 - g * s1 - s2) * h
        bp = g * hp + s1
        s1 = g * hp + bp
        lp = g * bp + s2
        s2 = g * bp + lp
        out[i] = lp if kind == "lp" else hp
        fc *= k
    return out


def _biquad(kind, fc, q, fs):
    w = 2 * np.pi * fc / fs
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]) if kind == "lp" else np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2])
    a = np.array([1 + al, -2 * c, 1 - al])
    return b / a[0], a / a[0]


def synth_pass(pas, seed, lead=3, hold3=None, silent=None, start="mid", drop=()):
    """A take of the pass with every effect known: (samples as recorded, fs, the truth)."""
    fs = 48000
    rng = np.random.default_rng(seed)
    bar, step = SY["bar"], SY["bar"] / STEPS
    pattern = PATTERNS[pas]
    runs, cur = {}, lead
    for n in EFFECTS[pas]:
        ln = 3 if n == hold3 else 2
        runs[n] = (cur, cur + ln - 1)
        cur += ln + 1
    total = cur + 1
    span = {n: (runs[n][0] * bar + rng.uniform(-0.2, 0.2), (runs[n][1] + 1) * bar + rng.uniform(-0.2, 0.2))
            for n in runs}
    if silent:
        span.pop(silent)

    def active(t):
        return next((n for n, (a, b) in span.items() if a <= t < b), 0)

    shuffle = {1: 1, 9: 7, 5: 3, 13: 13, 3: 5, 7: 9, 11: 11, 15: 15} if pas == "a" else {1: 4}
    events, truth = [], dict(runs=runs, lfo_mul=[])
    for b in range(total):
        for st, kind in pattern.items():
            t = b * bar + (st - 1) * step
            n = active(t)
            if n in (9, 11, 12) and pas != "c":
                continue
            if n == 13 and pas != "c":
                t = b * bar + (shuffle[st] - 1) * step
            mul = 1.0
            if n == 15 and pas != "c":
                mul = 1 + SY["lfo"][1] * np.sin(2 * np.pi * SY["lfo"][0] * t)
                if kind == "K" and span[15][0] + 2 * step < t < span[15][1] - 2 * step:
                    truth["lfo_mul"].append(mul)
            events.append((t, kind, mul))
    if pas != "c":
        retrig = {9: ("K", 1.0), 11: ("H" if pas == "a" else "K", 0.5), 12: ("S" if pas == "a" else None, 2 / 3)}
        for n, (kind, every) in retrig.items():
            if n not in span or kind is None:
                continue
            t = np.ceil(span[n][0] / step) * step
            while t < span[n][1]:
                events.append((t, kind, 1.0))
                t += every * step
    m = np.zeros(int((total * bar + 2) * fs))
    for kind in set(k for _, k, _ in events):
        track = np.zeros(len(m))
        for t, _, mul in sorted(e for e in events if e[1] == kind):
            y = _sound(kind, rng, fs, mul)
            i = int(round(t * fs))
            track[i:i + len(y)] = y[:len(track) - i]
        m += track
    out = m.copy()
    for n, (a, b) in span.items():
        i0, i1 = int(a * fs), int(b * fs)
        x = m[i0:i1]
        if n == 1:
            out[i0:i1] = m[(np.arange(i0, i1) // SY["hold"]) * SY["hold"]]
        elif n == 2:
            out[i0:i1] = SY["drive_level"] * softlimit(SY["drive"] * x)
        elif n == 3:
            out[i0:i1] = np.trunc(x / SY["crush"]) * SY["crush"]
        elif n == 4 or (n == 14 and pas != "c"):
            d, g1, g2 = SY["echo"] if n == 4 else SY["comb"]
            dn = int(round((d * step if n == 4 else d) * fs))
            y = x.copy()
            for k in range(1, 12):
                if k * dn < len(x):
                    y[k * dn:] += g1 * g2 ** (k - 1) * x[:-k * dn]
            out[i0:i1] = y
            truth["echo_ms" if n == 4 else "comb_ms"] = 1000 * dn / fs
        elif n == 5:
            out[i0:i1] = signal.lfilter(*_biquad("lp", *SY["lp"], fs), x)
        elif n == 7:
            out[i0:i1] = signal.lfilter(*_biquad("hp", *SY["hp"], fs), x)
        elif n == 6:
            out[i0:i1] = _svf_sweep(x, fs, *SY["lsweep"], int(bar * fs), "lp")
        elif n == 8:
            out[i0:i1] = _svf_sweep(x, fs, *SY["hsweep"], int(bar * fs), "hp")
        elif n == 10 and pas != "c":
            p = int(round(4 / 3 * step * fs))
            want = (3, 7, 11, 15) if pas == "a" else (1,)
            s = int(np.ceil(a / step))
            while (s % STEPS) + 1 not in want:
                s += 1
            ia = int(round(s * step * fs))
            reps = int(np.ceil((i1 - ia) / p))
            out[ia:i1] = np.tile(m[ia:ia + p], reps)[:i1 - ia]
        elif n == 16 and pas != "c":
            rate, cents = SY["vib"]
            amp = (2 ** (cents / 1200) - 1) / (2 * np.pi * rate)  # seconds of delay swing
            idx = np.arange(i0, i1)
            pos = idx - (amp * (1 + np.sin(2 * np.pi * rate * idx / fs))) * fs
            out[i0:i1] = np.interp(pos, np.arange(len(m)), m)
    # the path: start mid-bar, a second clock, a 5 Hz high-pass, noise at -70 dBFS
    cut = 1.234
    y = out[int(cut * fs):]
    if start == "silent":  # as a real take is: the recorder runs, then play is pressed
        y = np.concatenate([np.zeros(int(1.7 * fs)), out])
    y = signal.resample_poly(y, 100013, 100000, window=("kaiser", 8.0))
    y = signal.sosfilt(signal.butter(1, 5, "high", fs=fs, output="sos"), y)
    y = y + 10 ** (-70 / 20) * rng.standard_normal(len(y))
    truth["bar_rec"] = bar * SY["ratio"]
    truth["first_bar"] = 1  # bar 0 of the script is bar 1 of the synthesis (the cut is inside bar 0)
    truth["runs_rec"] = {n: (a - 1, b - 1) for n, (a, b) in runs.items()}
    if start == "silent":
        truth["first_bar"] = 0
        truth["runs_rec"] = dict(runs)
    for at_s, bufs in sorted(drop, reverse=True):  # buffers the capture lost, as on the real take
        i = int(at_s * fs)
        y = np.concatenate([y[:i], y[i + bufs * 1024:]])
    truth["dropped"] = sum(b for _, b in drop) * 1024 / fs
    return y, fs, truth


def selftest(out=None):
    rows, fails = [], []

    def check(name, known, got, tol, rel=True):
        if isinstance(known, str) or isinstance(known, bool) or known is None:
            ok = known == got
            rows.append((name, str(known), str(got), "exact", ok))
        else:
            err = abs(got - known) / abs(known) if rel else abs(got - known)
            ok = bool(np.isfinite(got)) and err <= tol
            rows.append((name, f"{known:.4g}", f"{got:.4g}", f"±{100 * tol:.1f}%" if rel else f"±{tol:g}", ok))
        if not ok:
            fails.append(name)

    # the reader: a 24-bit file in memory
    buf = io.BytesIO()
    v = (np.sin(np.arange(4800) / 20) * 0.5 * 8388607).astype(np.int32)
    q = np.zeros((4800, 2, 3), np.uint8)
    for i in range(3):
        q[:, 1, i] = (v >> (8 * i)) & 255
    with wave.open(buf, "wb") as w:
        w.setnchannels(2), w.setsampwidth(3), w.setframerate(48000)
        w.writeframes(q.tobytes())
    buf.seek(0)
    xr, fsr, _ = read_wav(buf)
    check("reader: 24-bit peak, louder channel", 0.5, float(np.abs(xr).max()), 0.01)

    quiet = lambda *a, **k: None
    # as the real takes turned out to be (2026-11-24): the recorder running before play is
    # pressed, and buffers missing from the file part-way through
    print("\n######## synthetic pass a, opening on silence, 6 buffers lost at 40 s and 1 at 95.3 s", flush=True)
    y, fs, truth = synth_pass("a", seed=7, start="silent", drop=((40.0, 6), (95.3, 1)))
    t = Take(y, fs, "a", say=quiet)
    lay, note = t.layout()
    report(t, lay, note, only=[], say=lambda line: print(line) if line.startswith(("⚠", "layout", "the take")) else None)
    check("silent start: seen as one", True, t.silent_start, 0)
    check("silent start: bpm", 240 / truth["bar_rec"], t.bpm, 0.0005)
    wrong = {n: tuple(int(v) for v in lay[n]) for n in lay if tuple(int(v) for v in lay[n]) != truth["runs_rec"][n]}
    check("silent start: layout, effects put in the wrong bars", "{}", str(wrong), 0)
    check("silent start: time missing from the file, ms", truth["dropped"] * 1000,
          sum(g[2] for g in t.gaps) * 1000, 3.0, rel=False)
    check("silent start: places where time is missing", 2, len(t.gaps), 0, rel=False)

    for pas, kw in (("a", dict(lead=4, hold3=5)), ("b", dict()), ("c", dict(silent=7))):
        print(f"\n######## synthetic pass {pas} {kw}", flush=True)
        y, fs, truth = synth_pass(pas, seed=22 + ord(pas), **kw)
        t = Take(y, fs, pas, say=quiet)
        lay, note = t.layout()
        R = report(t, lay, note, out=out)
        P = f"{pas}: "
        dp = t.dpeak
        check(P + "bpm", 240 / truth["bar_rec"], t.bpm, 0.0005)
        got = {n: tuple(int(v) for v in lay[n]) for n in lay}
        wrong = {n: got[n] for n in got if got[n] != truth["runs_rec"][n]}
        if pas == "b":
            # one note a bar: a punch that lands after step 1 is heard a bar late, and the wet
            # bars are then the ones to read. So on this pass a bar late is not a miss
            late = {n: v for n, v in wrong.items() if v[0] - truth["runs_rec"][n][0] == 1}
            print(f"(pass b: read a bar after the punch, the punch having missed step 1: {late})")
            wrong = {n: v for n, v in wrong.items() if n not in late}
        check(P + "layout: effects put in the wrong bars", "{}", str(wrong), 0)
        if pas == "a":
            check(P + "the three-bar hold of effect 5 said", True, "5: bars" in note, 0)
        if pas == "c":
            check(P + "the effect that was not punched is warned of", True, "[7]" in note and "⚠" in note, 0)
            check(P + "fx4 echo lag ms (cepstrum)", truth["echo_ms"] * SY["ratio"], R[4]["echo_cep"]["lag_ms"], 0.05, rel=False)
            check(P + "fx4 echo gain (cepstrum)", SY["echo"][1], R[4]["echo_cep"]["gain"], 0.10)
        check(P + "dry: no quantiser", False, R["dry_crush"]["found"], 0)
        check(P + "fx1 hold found", True, R[1]["hold"]["found"], 0)
        check(P + "fx1 hold rate Hz", 48000 / SY["hold"] / SY["ratio"], R[1]["hold"]["rate"], 0.002)
        check(P + "fx1 divisor of 48000", SY["hold"], R[1]["hold"]["divisor"], 0, rel=False)
        check(P + "fx3 quantiser found", True, R[3]["crush"]["found"], 0)
        if pas == "c":
            # a square wave jumps several levels at once and noise never rests on one, so on
            # this pass the step is only known to a whole multiple; passes a and b give it
            mult = R[3]["crush"]["step"] / SY["crush"]
            check(P + "fx3 step, as a whole multiple of the true one", round(mult), mult, 0.05)
        else:
            check(P + "fx3 steps across the dry peak", dp / SY["crush"], R[3]["crush"]["per_peak"], 0.05)
        for n in (2, 5, 7):
            check(P + f"fx{n} no hold", False, R[n]["hold"]["found"], 0)
            check(P + f"fx{n} no quantiser", False, R[n]["crush"]["found"], 0)
        if pas in ("a", "b"):
            g, lv, _ = R[2]["fits"]["softlimit"]
            check(P + "fx2 softlimit g (per dry peak)", SY["drive"] * dp, g, 0.15)
            check(P + "fx2 softlimit level (dry peaks)", SY["drive_level"] / dp, lv, 0.10)
            check(P + "fx2 closest shape", "softlimit", R[2]["best_shape"], 0)
        if pas != "b":  # a kick alone has nothing near 600 Hz or 2 kHz to show a filter with
            check(P + "fx5 lowpass cutoff Hz", SY["lp"][0], R[5]["filter"]["fc"], 0.10)
            check(P + "fx5 lowpass Q", SY["lp"][1], R[5]["filter"]["q"], 0.30)
            check(P + "fx5 does not sweep", "fixed", R[5].get("sweep", {}).get("kind"), 0)
        if pas == "a":
            check(P + "fx7 hipass cutoff Hz", SY["hp"][0], R[7]["filter"]["fc"], 0.10)
            check(P + "fx7 hipass Q", SY["hp"][1], R[7]["filter"]["q"], 0.30)
        if pas == "c":
            check(P + "fx7 (nothing punched) level re dry dB", 0.0, R[7]["level"], 0.5, rel=False)
            for n, (f0, f1) in ((6, SY["lsweep"]), (8, SY["hsweep"])):
                sw = R[n].get("sweep", {})
                check(P + f"fx{n} sweep direction", "down" if f1 < f0 else "up", sw.get("direction"), 0)
                check(P + f"fx{n} sweep octaves a step", np.log2(f1 / f0) / 16, sw.get("slope", np.nan), 0.20)
                check(P + f"fx{n} sweep restarts (a jump seen)", True, len(sw.get("jumps", [])) >= 1, 0)
                check(P + f"fx{n} sweep start Hz", f0, sw.get("start_hz", np.nan), 0.35)
        if pas == "b":  # a kick alone, 2% of the spectrum: a 5 ms comb cannot be seen in it at all
            for k in ("fx14 comb gain", "fx14 comb feedback", "fx14 comb lag ms"):
                print(f"(not asserted on pass b: {k}; read {R[14]['echo_cep']['lag_ms']:.2f} ms, "
                      f"gain {R[14]['echo_cep']['gain']:.2f})")
        if pas in ("a", "b"):
            check(P + "fx9 hits a beat", 4.0, R[9]["hits_per_beat"], 0.03)
            check(P + "fx10 hits a beat", 3.0, R[10]["hits_per_beat"], 0.03)
            check(P + "fx11 hits a beat", 8.0, R[11]["hits_per_beat"], 0.03)
            check(P + "fx4 echo lag ms (cepstrum)", truth["echo_ms"] * SY["ratio"], R[4]["echo_cep"]["lag_ms"], 0.05, rel=False)
            check(P + "fx4 echo gain (cepstrum)", SY["echo"][1], R[4]["echo_cep"]["gain"], 0.10)
            check(P + "fx4 echo feedback (cepstrum)", SY["echo"][2], R[4]["echo_cep"]["feedback"], 0.15)
            if pas == "a":
                check(P + "fx14 comb gain", SY["comb"][1], R[14]["echo_cep"]["gain"], 0.10)
                check(P + "fx14 comb feedback", SY["comb"][2], R[14]["echo_cep"]["feedback"], 0.15)
                check(P + "fx14 comb lag ms", truth["comb_ms"] * SY["ratio"], R[14]["echo_cep"]["lag_ms"], 0.05, rel=False)
            check(P + "fx4 echo lag ms (residual)", truth["echo_ms"] * SY["ratio"], R[4]["echo_res"]["lag_ms"], 0.5, rel=False)
        if pas == "a":
            check(P + "fx10 is a loop", "a looped slice", R[10]["repeat"]["verdict"], 0)
            check(P + "fx11 is fresh hits", "fresh hits", R[11]["repeat"]["verdict"], 0)
            check(P + "fx12 hits a beat", 6.0, R[12]["hits_per_beat"], 0.03)
            check(P + "fx13 second bar's onsets", "K.S.H.K.H.H.S.H.", R[13]["rows"][lay[13][1]], 0)
            lo, hi = R[15].get("pitch_range", {}).get("K", (np.nan, np.nan))
            check(P + "fx15 kick pitch, highest over lowest", max(truth["lfo_mul"]) / min(truth["lfo_mul"]), hi / lo, 0.10)
            check(P + "fx16 wobble rate Hz", SY["vib"][0] / SY["ratio"], R[16]["wobble"]["rate"], 0.5, rel=False)
            check(P + "fx16 wobble depth cents", SY["vib"][1], R[16]["wobble"]["cents"], 0.35)
        if pas == "b":
            check(P + "fx4 echo gain (residual, kick alone)", SY["echo"][1], R[4]["echo_res"]["gain"], 0.15)
            check(P + "fx4 echo feedback (residual)", SY["echo"][2], R[4]["echo_res"]["feedback"], 0.20)
            check(P + "fx12 (mutes): onsets in the run", 0, len(R[12]["onsets"]), 0, rel=False)
            check(P + "fx13 second bar's onsets", "...K............", R[13]["rows"][lay[13][1]], 0)
    print("\n######## selftest: known against measured")
    wid = max(len(r[0]) for r in rows)
    for name, known, got, tol, ok in rows:
        print(f"{'ok  ' if ok else 'MISS'} {name:<{wid}}  known {known:<14} measured {got:<14} {tol}")
    print(f"\n{len(rows) - len(fails)} of {len(rows)} readings within tolerance")
    return 1 if fails else 0


# ---- the command line ----

def repo_root():
    return Path(__file__).resolve().parents[2]


def inside_repo(p):
    try:
        Path(p).resolve().relative_to(repo_root())
        return True
    except ValueError:
        return False


def parse_ranges(s):
    out = []
    for part in s.split(","):
        a, _, b = part.partition("-")
        out.extend(range(int(a), int(b or a) + 1))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("take", nargs="?", help="the WAV, kept outside the repo")
    ap.add_argument("--pass", dest="pas", choices="abc", help="which pattern the take plays")
    ap.add_argument("--out", help="a folder outside the repo for the plots; without it, no plots")
    ap.add_argument("--bpm", type=float, default=80.0, help="nominal tempo (the real one is measured)")
    ap.add_argument("--bars", help='the layout by hand: "1:2-3,2:5-6" (effect:first-last bar)')
    ap.add_argument("--layout", choices=("auto", "guess", "default"), default="auto")
    ap.add_argument("--effects", help='the effects punched, in order, if not the pass\'s: "1-8" or "1,2,9-12"')
    ap.add_argument("--only", help='analyse only these effects: "9-12"')
    ap.add_argument("--onset-thr", type=float, default=1.0, help="onset threshold, times the default")
    ap.add_argument("--selftest", action="store_true", help="synthetic takes with known effects")
    a = ap.parse_args()
    if a.out and inside_repo(a.out):
        raise SystemExit("--out is inside the repo: refused (README rule 6). Give a folder outside it.")
    if a.selftest:
        sys.exit(selftest(a.out))
    if not a.take or not a.pas:
        ap.error("a take and --pass are needed (or --selftest)")
    if inside_repo(a.take):
        raise SystemExit("the take is inside the repo: refused (README rule 6). Move it out.")
    x, fs, note = read_wav(a.take)
    print(f"{a.take}: {note}")
    t = Take(x, fs, a.pas, bpm=a.bpm, effects=parse_ranges(a.effects) if a.effects else None,
             onset_k=a.onset_thr)
    bars = None
    if a.bars:
        bars = {}
        for part in a.bars.split(","):
            n, _, r = part.partition(":")
            lo, _, hi = r.partition("-")
            bars[int(n)] = (int(lo), int(hi or lo))
    lay, note = t.layout(a.layout, bars)
    report(t, lay, note, only=parse_ranges(a.only) if a.only else None, out=a.out)


if __name__ == "__main__":
    main()
