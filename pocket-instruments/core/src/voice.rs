//! Sound (ENGINE.md §11, D44). All sixteen voices, one a track, from VOICES.md. Key n plays
//! track n - 1.
//!
//! Floats live here and nowhere else. They decide what a sample is, never when anything
//! happens: pitch and time are integers until the last step.
//!
//! Only `+ - * /` and conversions are used, each one exactly rounded by IEEE 754, so a
//! native build and the WebAssembly build give the same bits. There is no `sin`, `exp` or
//! `tan` from a maths library anywhere: those are where two platforms part company. The
//! sine is a polynomial, a decay is a multiply a frame, and a filter's coefficient comes
//! from that same polynomial and one division.
//!
//! Every voice keeps the slider values it was triggered with, so a rate change retunes it to
//! the same pitch and length in hertz and seconds, whatever the sliders say since (§11).

use crate::seq::TRACKS;

pub const KICK_TRACK: usize = 0;
pub const SNARE_TRACK: usize = 1;
pub const CLOSED_HAT_TRACK: usize = 2;
pub const OPEN_HAT_TRACK: usize = 3;
pub const SYNTH_SNARE_TRACK: usize = 4;
pub const STICKS_TRACK: usize = 5;
pub const CYMBAL_TRACK: usize = 6;
pub const NOISE_TRACK: usize = 7;
pub const CLAP_TRACK: usize = 8;
pub const CLICK_TRACK: usize = 9;
pub const LOW_TOM_TRACK: usize = 10;
pub const HIGH_TOM_TRACK: usize = 11;
pub const COWBELL_TRACK: usize = 12;
pub const BLIP_TRACK: usize = 13;
pub const TONE_TRACK: usize = 14;
#[allow(dead_code)] // the dispatch's last arm, `_`
pub const BASS_TRACK: usize = 15;

/// A slider's middle.
pub const PARAM_DEFAULT: u16 = 32768;

/// The core's fixed level on every voice, in both layouts (D48): -6 dB, so the four drums
/// together sit near 1.0 and one alone near 0.5. A host softens anything past its own
/// ceiling. A power of two, so it is exact: it cannot cost the same bits.
pub const LEVEL: f32 = 0.5;

/// Below this (-80 dB) an envelope stops. It also keeps the decay away from denormals.
const SILENT: f32 = 0.0001;

/// 60 dB is ln(1000) time constants.
const LN_1000: f32 = 6.907_755_4;

/// sin(2 pi * phase / 2^32): `phase` over the whole u32 is one turn.
/// The odd Taylor series to x^9 on the folded quarter turn; its error is under 4e-6.
#[inline]
fn sine(phase: u32) -> f32 {
    // -1.0 ..< 1.0, standing for -pi ..< pi.
    let mut x = (phase as i32) as f32 * (1.0 / 2_147_483_648.0);
    if x > 0.5 {
        x = 1.0 - x;
    } else if x < -0.5 {
        x = -1.0 - x;
    }
    let x2 = x * x;
    x * (3.141_592_7 + x2 * (-5.167_712_8 + x2 * (2.550_164 + x2 * (-0.599_264_5 + x2 * 0.082_145_89))))
}

/// A slider, 0 to 65535, across `lo ..= hi` in whole units.
#[inline]
fn span(lo: u64, hi: u64, slider: u16) -> u64 {
    lo + slider as u64 * (hi - lo) / 65_535
}

/// The phase step for a pitch in thousandths of a hertz.
#[inline]
fn inc(millihertz: u64, rate: u32) -> u32 {
    ((millihertz << 32) / (1000 * rate.max(1) as u64)) as u32
}

/// A time in microseconds as frames, at least one.
#[inline]
fn frames(microseconds: u64, rate: u32) -> u32 {
    (microseconds * rate.max(1) as u64 / 1_000_000).max(1) as u32
}

/// The per-frame multiplier that falls by e in `tau` frames: exp(-1/tau) as
/// (2 tau - 1) / (2 tau + 1), the same curve to within 1 part in 12 tau^2, from one division.
#[inline]
fn fall(tau: f32) -> f32 {
    let two_tau = 2.0 * tau;
    if two_tau > 1.0 { (two_tau - 1.0) / (two_tau + 1.0) } else { 0.0 }
}

/// The per-frame multiplier that falls 60 dB in `microseconds`.
#[inline]
fn fall_60db(microseconds: u64, rate: u32) -> f32 {
    fall(frames(microseconds, rate) as f32 / LN_1000)
}

/// One frame of an envelope: its value now, then the next one, cut to exactly 0 at -80 dB.
#[inline]
fn step_env(env: &mut f32, k: f32) -> f32 {
    let now = *env;
    *env *= k;
    if *env < SILENT {
        *env = 0.0;
    }
    now
}

/// White noise: xorshift32, as floats of -1 ..< 1. Restarted on every trigger, so a hit
/// depends only on its sliders and the sample rate. Its own generator, never the
/// sequencer's: a sound takes no draw (§11, "sound changes no event").
#[derive(Clone, Copy)]
struct Noise(u32);

impl Noise {
    const SEED: u32 = 0x2545_F491;
    #[inline]
    fn next(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x as i32) as f32 * (1.0 / 2_147_483_648.0)
    }
}

/// A two-pole state-variable filter, in the trapezoidal form that stays stable up to the
/// top of the band. Its coefficient is tan(pi fc / rate), made from `sine` and one division.
#[derive(Clone, Copy)]
struct Svf {
    a1: f32,
    a2: f32,
    a3: f32,
    k: f32,
    ic1: f32,
    ic2: f32,
}

/// What a filter gives back for one sample.
#[derive(Clone, Copy)]
enum Pass {
    Low,
    High,
    Band,
}

impl Svf {
    const fn new() -> Self {
        Svf { a1: 0.0, a2: 0.0, a3: 0.0, k: 0.0, ic1: 0.0, ic2: 0.0 }
    }

    /// `millihertz` is held below 0.45 of the rate, where the tangent stays finite. `k` is
    /// the damping, 1 / Q.
    fn tune(&mut self, millihertz: u64, k: f32, rate: u32) {
        let top = rate.max(1) as u64 * 450;
        // Half the phase step is a turn's fraction for pi fc / rate. A quarter turn on is
        // its cosine.
        let half = inc(millihertz.min(top), rate) / 2;
        let g = sine(half) / sine(half.wrapping_add(1 << 30));
        self.k = k;
        self.a1 = 1.0 / (1.0 + g * (g + k));
        self.a2 = g * self.a1;
        self.a3 = g * self.a2;
    }

    fn clear(&mut self) {
        self.ic1 = 0.0;
        self.ic2 = 0.0;
    }

    #[inline]
    fn next(&mut self, x: f32, pass: Pass) -> f32 {
        let v3 = x - self.ic2;
        let v1 = self.a1 * self.ic1 + self.a2 * v3;
        let v2 = self.ic2 + self.a2 * self.ic1 + self.a3 * v3;
        self.ic1 = 2.0 * v1 - self.ic1;
        self.ic2 = 2.0 * v2 - self.ic2;
        match pass {
            Pass::Low => v2,
            Pass::High => x - self.k * v1 - v2,
            Pass::Band => v1,
        }
    }
}

// ---- key 10: the click ----

#[derive(Clone, Copy)]
pub struct Click {
    ab: [u16; 2],
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
}

impl Click {
    pub const fn new() -> Self {
        Click { ab: [PARAM_DEFAULT; 2], phase: 0, inc: 0, env: 0.0, k: 0.0 }
    }

    /// Slider A is pitch, 500 Hz to 2 kHz. Slider B is length, 5 to 40 ms, the time the
    /// click takes to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.inc = inc(span(500_000, 2_000_000, a), rate);
        self.k = fall_60db(span(5_000, 40_000, b), rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = 1.0;
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = sine(self.phase) * step_env(&mut self.env, self.k);
        self.phase = self.phase.wrapping_add(self.inc);
        s
    }
}

// ---- key 1: the bass drum ----

/// A sine whose pitch falls fast from three times its base, and a click of noise at the start.
#[derive(Clone, Copy)]
pub struct Kick {
    ab: [u16; 2],
    phase: u32,
    /// The base pitch's phase step, as a float: the sweep multiplies it.
    base: f32,
    env: f32,
    k: f32,
    /// The sweep: 1 at the trigger, falling to 0. The pitch is base * (1 + 2 sweep).
    sweep: f32,
    k_sweep: f32,
    click: f32,
    k_click: f32,
    noise: Noise,
}

impl Kick {
    /// How fast the pitch falls: by e in 20 ms.
    const SWEEP_US: u64 = 20_000;
    /// The click at the start: noise, 60 dB down in 3 ms.
    const CLICK_US: u64 = 3_000;
    const CLICK_LEVEL: f32 = 0.2;
    /// The body's level: room for the click on top.
    const LEVEL: f32 = 0.85;

    pub const fn new() -> Self {
        Kick {
            ab: [PARAM_DEFAULT; 2],
            phase: 0,
            base: 0.0,
            env: 0.0,
            k: 0.0,
            sweep: 0.0,
            k_sweep: 0.0,
            click: 0.0,
            k_click: 0.0,
            noise: Noise(Noise::SEED),
        }
    }

    /// Slider A is the base pitch, 40 to 90 Hz. Slider B is length, 100 to 600 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.base = inc(span(40_000, 90_000, a), rate) as f32;
        self.k = fall_60db(span(100_000, 600_000, b), rate);
        self.k_sweep = fall(frames(Self::SWEEP_US, rate) as f32);
        self.k_click = fall_60db(Self::CLICK_US, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::LEVEL;
        self.sweep = 1.0;
        self.click = Self::CLICK_LEVEL;
        self.noise = Noise(Noise::SEED);
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let mut s = sine(self.phase) * step_env(&mut self.env, self.k);
        if self.click != 0.0 {
            s += self.noise.next() * step_env(&mut self.click, self.k_click);
        }
        // Float to integer is exact truncation on both hosts; the step is well inside a u32.
        let step = self.base * (1.0 + 2.0 * step_env(&mut self.sweep, self.k_sweep));
        self.phase = self.phase.wrapping_add(step as u32);
        if self.env == 0.0 {
            self.click = 0.0;
            self.sweep = 0.0;
        }
        s
    }
}

// ---- key 2: the snare ----

/// Two sines a little under an octave apart for the body, and band-passed noise for the wires.
#[derive(Clone, Copy)]
pub struct Snare {
    ab: [u16; 2],
    phase: [u32; 2],
    inc: [u32; 2],
    body: f32,
    k_body: f32,
    wires: f32,
    k_wires: f32,
    noise: Noise,
    filter: Svf,
}

impl Snare {
    /// The upper sine is 330 / 180 of the lower, 11 / 6 (VOICES.md's 180 and 330 Hz).
    const UPPER: (u64, u64) = (11, 6);
    /// The body falls 60 dB in 120 ms whatever slider B says: B is the wires' length.
    const BODY_US: u64 = 120_000;
    /// The band the noise is passed through: 4.5 kHz, a wide band (Q 1).
    const BAND_MHZ: u64 = 4_500_000;
    const BAND_K: f32 = 1.0;
    const BODY_LEVEL: f32 = 0.35;
    const WIRES_LEVEL: f32 = 0.8;

    pub const fn new() -> Self {
        Snare {
            ab: [PARAM_DEFAULT; 2],
            phase: [0; 2],
            inc: [0; 2],
            body: 0.0,
            k_body: 0.0,
            wires: 0.0,
            k_wires: 0.0,
            noise: Noise(Noise::SEED),
            filter: Svf::new(),
        }
    }

    /// Slider A is the body's pitch, its lower sine from 130 to 230 Hz (180 at the middle).
    /// Slider B is the noise's length, 50 to 250 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let low = span(130_000, 230_000, a);
        self.inc = [inc(low, rate), inc(low * Self::UPPER.0 / Self::UPPER.1, rate)];
        self.k_body = fall_60db(Self::BODY_US, rate);
        self.k_wires = fall_60db(span(50_000, 250_000, b), rate);
        self.filter.tune(Self::BAND_MHZ, Self::BAND_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = [0; 2];
        self.body = Self::BODY_LEVEL;
        self.wires = Self::WIRES_LEVEL;
        self.noise = Noise(Noise::SEED);
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.body == 0.0 && self.wires == 0.0 {
            return 0.0;
        }
        let mut s = 0.0;
        if self.body != 0.0 {
            s = (sine(self.phase[0]) + sine(self.phase[1])) * step_env(&mut self.body, self.k_body);
            self.phase[0] = self.phase[0].wrapping_add(self.inc[0]);
            self.phase[1] = self.phase[1].wrapping_add(self.inc[1]);
        }
        if self.wires != 0.0 {
            s += self.filter.next(self.noise.next(), Pass::Band) * step_env(&mut self.wires, self.k_wires);
            if self.wires == 0.0 {
                self.filter.clear();
            }
        }
        s
    }
}

// ---- keys 3 and 4: the hats ----

/// Six detuned squares through a high-pass (VOICES.md: one source for both hats, and the
/// cymbal's). The two hats are two of these, apart: each sounds on its own and neither cuts
/// the other off. The cymbal (key 7) is a third, with a lower, wider band and a long tail.
#[derive(Clone, Copy)]
pub struct Hat {
    ab: [u16; 2],
    phase: [u32; 6],
    inc: [u32; 6],
    env: f32,
    k: f32,
    filter: Svf,
    /// Slider B's range, 60 dB in this many microseconds.
    length_us: (u64, u64),
    /// Slider A's range: the high-pass's corner, in thousandths of a hertz.
    corner: (u64, u64),
    /// The filter's damping, 1 / Q.
    filter_k: f32,
    level: f32,
}

impl Hat {
    /// The six squares, in thousandths of a hertz: our own uneven set, none a simple ratio
    /// of another, so they beat against each other like metal.
    const PITCHES: [u64; 6] = [263_000, 333_000, 401_000, 487_000, 571_000, 827_000];
    /// Half the squares start low, so their sum starts at 0: a sum starting at 6 is a step
    /// the high-pass passes whole, a loud tick louder than the hat.
    const START: [u32; 6] = [0, 1 << 31, 0, 1 << 31, 0, 1 << 31];
    /// The hats' corner, 5 to 10 kHz (7.5 at the middle).
    const HAT_CORNER: (u64, u64) = (5_000_000, 10_000_000);
    /// The squares summed run to +-6; this brings the filtered hat near full scale.
    const HAT_LEVEL: f32 = 0.4;
    /// A little resonance at the corner (Q 1.4) for a ring.
    const HAT_K: f32 = 0.7;

    const fn new(length_us: (u64, u64), corner: (u64, u64), filter_k: f32, level: f32) -> Self {
        Hat { ab: [PARAM_DEFAULT; 2], phase: [0; 6], inc: [0; 6], env: 0.0, k: 0.0, filter: Svf::new(), length_us, corner, filter_k, level }
    }

    /// Key 3: 10 to 60 ms.
    pub const fn closed() -> Self {
        Hat::new((10_000, 60_000), Self::HAT_CORNER, Self::HAT_K, Self::HAT_LEVEL)
    }

    /// Key 4: 100 to 500 ms.
    pub const fn open() -> Self {
        Hat::new((100_000, 500_000), Self::HAT_CORNER, Self::HAT_K, Self::HAT_LEVEL)
    }

    /// Key 7: 200 to 1200 ms; the corner lower, 3 to 7 kHz, and no ring (Q 0.7), so more of
    /// the squares' body comes through: a wider band. Quieter, since more passes.
    pub const fn cymbal() -> Self {
        Hat::new((200_000, 1_200_000), (3_000_000, 7_000_000), 1.4, 0.3)
    }

    /// Slider A is the filter's corner. Slider B is the length, to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        for (i, p) in Self::PITCHES.iter().enumerate() {
            self.inc[i] = inc(*p, rate);
        }
        self.k = fall_60db(span(self.length_us.0, self.length_us.1, b), rate);
        self.filter.tune(span(self.corner.0, self.corner.1, a), self.filter_k, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = Self::START;
        self.env = self.level;
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let mut sum = 0.0;
        for i in 0..6 {
            sum += if self.phase[i] < 1 << 31 { 1.0 } else { -1.0 };
            self.phase[i] = self.phase[i].wrapping_add(self.inc[i]);
        }
        let s = self.filter.next(sum, Pass::High) * step_env(&mut self.env, self.k);
        if self.env == 0.0 {
            self.filter.clear();
        }
        s
    }
}

// ---- key 5: the synth snare ----

/// One sine falling fast from twice its pitch, and a short burst of noise through a
/// high-pass on its front: a drum machine's snare rather than a kit's.
#[derive(Clone, Copy)]
pub struct SynthSnare {
    ab: [u16; 2],
    phase: u32,
    base: f32,
    sweep: f32,
    k_sweep: f32,
    env: f32,
    k: f32,
    /// The noise's own envelope: it falls 60 dB in a third of the body's length.
    hiss: f32,
    k_hiss: f32,
    noise: Noise,
    filter: Svf,
}

impl SynthSnare {
    /// The pitch falls by e in 8 ms, from twice the base.
    const SWEEP_US: u64 = 8_000;
    /// The noise is high-passed at 2 kHz, no ring.
    const NOISE_CORNER_MHZ: u64 = 2_000_000;
    const NOISE_K: f32 = 1.4;
    const BODY: f32 = 0.6;
    const NOISE: f32 = 0.5;

    pub const fn new() -> Self {
        SynthSnare { ab: [PARAM_DEFAULT; 2], phase: 0, base: 0.0, sweep: 0.0, k_sweep: 0.0, env: 0.0, k: 0.0, hiss: 0.0, k_hiss: 0.0, noise: Noise(Noise::SEED), filter: Svf::new() }
    }

    /// Slider A is the pitch, 200 to 460 Hz (330 at the middle). Slider B is the length, 20 to
    /// 150 ms for the body to fall 60 dB; the noise takes a third of that.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let length = span(20_000, 150_000, b);
        self.base = inc(span(200_000, 460_000, a), rate) as f32;
        self.k = fall_60db(length, rate);
        self.k_hiss = fall_60db(length / 3, rate);
        self.k_sweep = fall(frames(Self::SWEEP_US, rate) as f32);
        self.filter.tune(Self::NOISE_CORNER_MHZ, Self::NOISE_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::BODY;
        self.hiss = Self::NOISE;
        self.sweep = 1.0;
        self.noise = Noise(Noise::SEED);
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let mut s = sine(self.phase) * step_env(&mut self.env, self.k);
        if self.hiss != 0.0 {
            s += self.filter.next(self.noise.next(), Pass::High) * step_env(&mut self.hiss, self.k_hiss);
            if self.hiss == 0.0 {
                self.filter.clear();
            }
        }
        let step = self.base * (1.0 + step_env(&mut self.sweep, self.k_sweep));
        self.phase = self.phase.wrapping_add(step as u32);
        if self.env == 0.0 {
            self.sweep = 0.0;
            self.hiss = 0.0;
            self.filter.clear();
        }
        s
    }
}

// ---- key 6: sticks ----

/// A very short sine with a click of noise on its front: two sticks struck together.
#[derive(Clone, Copy)]
pub struct Sticks {
    ab: [u16; 2],
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
    click: f32,
    k_click: f32,
    noise: Noise,
}

impl Sticks {
    /// The click: noise, 60 dB down in 2 ms.
    const CLICK_US: u64 = 2_000;
    const CLICK_LEVEL: f32 = 0.25;
    const LEVEL: f32 = 0.75;

    pub const fn new() -> Self {
        Sticks { ab: [PARAM_DEFAULT; 2], phase: 0, inc: 0, env: 0.0, k: 0.0, click: 0.0, k_click: 0.0, noise: Noise(Noise::SEED) }
    }

    /// Slider A is the pitch, 500 Hz to 1 kHz (750 at the middle). Slider B is the length, 10
    /// to 40 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.inc = inc(span(500_000, 1_000_000, a), rate);
        self.k = fall_60db(span(10_000, 40_000, b), rate);
        self.k_click = fall_60db(Self::CLICK_US, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::LEVEL;
        self.click = Self::CLICK_LEVEL;
        self.noise = Noise(Noise::SEED);
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let mut s = sine(self.phase) * step_env(&mut self.env, self.k);
        if self.click != 0.0 {
            s += self.noise.next() * step_env(&mut self.click, self.k_click);
        }
        self.phase = self.phase.wrapping_add(self.inc);
        if self.env == 0.0 {
            self.click = 0.0;
        }
        s
    }
}

// ---- key 8: noise ----

/// White noise through a low-pass.
#[derive(Clone, Copy)]
pub struct Wash {
    ab: [u16; 2],
    env: f32,
    k: f32,
    noise: Noise,
    filter: Svf,
}

impl Wash {
    /// Q 0.7: no ring.
    const FILTER_K: f32 = 1.4;
    const LEVEL: f32 = 0.9;

    pub const fn new() -> Self {
        Wash { ab: [PARAM_DEFAULT; 2], env: 0.0, k: 0.0, noise: Noise(Noise::SEED), filter: Svf::new() }
    }

    /// Slider A is the low-pass's corner, 500 Hz to 8.5 kHz (4.5 kHz at the middle). Slider B
    /// is the length, 50 to 600 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.k = fall_60db(span(50_000, 600_000, b), rate);
        self.filter.tune(span(500_000, 8_500_000, a), Self::FILTER_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.env = Self::LEVEL;
        self.noise = Noise(Noise::SEED);
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = self.filter.next(self.noise.next(), Pass::Low) * step_env(&mut self.env, self.k);
        if self.env == 0.0 {
            self.filter.clear();
        }
        s
    }
}

// ---- key 9: the hand clap ----

/// Band-passed noise: three quick bursts, then a tail from the third.
#[derive(Clone, Copy)]
pub struct Clap {
    ab: [u16; 2],
    /// Frames since the trigger, at `rate`; `u32::MAX` when idle.
    t: u32,
    rate: u32,
    /// Frames between bursts.
    gap: u32,
    burst: f32,
    k_burst: f32,
    tail: f32,
    k_tail: f32,
    noise: Noise,
    filter: Svf,
}

impl Clap {
    /// The bursts are 10 ms apart, each 60 dB down in 10 ms.
    const GAP_US: u64 = 10_000;
    const BURST_US: u64 = 10_000;
    const TAIL_LEVEL: f32 = 0.6;
    /// Q 1.5 at the band.
    const FILTER_K: f32 = 0.67;
    /// A burst and the tail overlap at the third burst, so the envelope reaches 1.6, and noise
    /// through a narrow band peaks differently at each rate: this keeps a hit under 1.
    const GAIN: f32 = 1.2;

    pub const fn new() -> Self {
        Clap { ab: [PARAM_DEFAULT; 2], t: u32::MAX, rate: 1, gap: 1, burst: 0.0, k_burst: 0.0, tail: 0.0, k_tail: 0.0, noise: Noise(Noise::SEED), filter: Svf::new() }
    }

    /// Slider A is the band, 1 to 3 kHz (2 kHz at the middle). Slider B is the tail, 50 to
    /// 300 ms to fall 60 dB. The time since the trigger keeps its length in seconds across a
    /// rate change, so the bursts stay 10 ms apart.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        if self.t != u32::MAX {
            self.t = (self.t as u64 * rate.max(1) as u64 / self.rate as u64) as u32;
        }
        self.rate = rate.max(1);
        self.gap = frames(Self::GAP_US, rate);
        self.k_burst = fall_60db(Self::BURST_US, rate);
        self.k_tail = fall_60db(span(50_000, 300_000, b), rate);
        self.filter.tune(span(1_000_000, 3_000_000, a), Self::FILTER_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.t = 0;
        self.tune(rate);
        self.burst = 0.0;
        self.tail = 0.0;
        self.noise = Noise(Noise::SEED);
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.t == u32::MAX {
            return 0.0;
        }
        let t = self.t;
        if t == 0 || t == self.gap || t == 2 * self.gap {
            self.burst = 1.0;
        }
        if t == 2 * self.gap {
            self.tail = Self::TAIL_LEVEL;
        }
        let env = step_env(&mut self.burst, self.k_burst) + step_env(&mut self.tail, self.k_tail);
        let s = self.filter.next(self.noise.next(), Pass::Band) * env * Self::GAIN;
        self.t = t + 1;
        if t > 2 * self.gap && self.burst == 0.0 && self.tail == 0.0 {
            self.t = u32::MAX;
            self.filter.clear();
        }
        s
    }
}

// ---- keys 11 and 12: the toms ----

/// A sine with a small fall in pitch: from half as high again to its base.
#[derive(Clone, Copy)]
pub struct Tom {
    ab: [u16; 2],
    phase: u32,
    base: f32,
    env: f32,
    k: f32,
    sweep: f32,
    k_sweep: f32,
    /// Slider A's range: the base pitch, in thousandths of a hertz.
    pitch: (u64, u64),
    /// Slider B's range, 60 dB in this many microseconds.
    length_us: (u64, u64),
}

impl Tom {
    /// The fall: pitch is base * (1 + 0.5 sweep), the sweep falling by e in 40 ms.
    const SWEEP_US: u64 = 40_000;
    const DEPTH: f32 = 0.5;
    const LEVEL: f32 = 0.9;

    const fn new(pitch: (u64, u64), length_us: (u64, u64)) -> Self {
        Tom { ab: [PARAM_DEFAULT; 2], phase: 0, base: 0.0, env: 0.0, k: 0.0, sweep: 0.0, k_sweep: 0.0, pitch, length_us }
    }

    /// Key 11: 60 to 120 Hz, 150 to 600 ms.
    pub const fn low() -> Self {
        Tom::new((60_000, 120_000), (150_000, 600_000))
    }

    /// Key 12: 120 to 250 Hz, 100 to 400 ms.
    pub const fn high() -> Self {
        Tom::new((120_000, 250_000), (100_000, 400_000))
    }

    /// Slider A is the base pitch. Slider B is the length, to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.base = inc(span(self.pitch.0, self.pitch.1, a), rate) as f32;
        self.k = fall_60db(span(self.length_us.0, self.length_us.1, b), rate);
        self.k_sweep = fall(frames(Self::SWEEP_US, rate) as f32);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::LEVEL;
        self.sweep = 1.0;
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = sine(self.phase) * step_env(&mut self.env, self.k);
        let step = self.base * (1.0 + Self::DEPTH * step_env(&mut self.sweep, self.k_sweep));
        self.phase = self.phase.wrapping_add(step as u32);
        if self.env == 0.0 {
            self.sweep = 0.0;
        }
        s
    }
}

// ---- key 13: the cow bell ----

/// Two squares, the upper 40 / 27 of the lower (540 and 800 Hz at the middle), through a
/// band-pass an octave above the lower.
#[derive(Clone, Copy)]
pub struct Cowbell {
    ab: [u16; 2],
    phase: [u32; 2],
    inc: [u32; 2],
    env: f32,
    k: f32,
    filter: Svf,
}

impl Cowbell {
    const UPPER: (u64, u64) = (40, 27);
    /// Q 1 at the band.
    const FILTER_K: f32 = 1.0;
    /// The band rings past the squares' own +-2: this keeps a hit under 1.
    const LEVEL: f32 = 0.45;

    pub const fn new() -> Self {
        Cowbell { ab: [PARAM_DEFAULT; 2], phase: [0; 2], inc: [0; 2], env: 0.0, k: 0.0, filter: Svf::new() }
    }

    /// Slider A is the pitch of both, the lower 400 to 680 Hz (540 at the middle). Slider B is
    /// the length, 30 to 300 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let low = span(400_000, 680_000, a);
        self.inc = [inc(low, rate), inc(low * Self::UPPER.0 / Self::UPPER.1, rate)];
        self.k = fall_60db(span(30_000, 300_000, b), rate);
        self.filter.tune(2 * low, Self::FILTER_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        // One starts high and one low, so the sum starts at 0, not at a step.
        self.phase = [0, 1 << 31];
        self.env = Self::LEVEL;
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let mut sum = 0.0;
        for i in 0..2 {
            sum += if self.phase[i] < 1 << 31 { 1.0 } else { -1.0 };
            self.phase[i] = self.phase[i].wrapping_add(self.inc[i]);
        }
        let s = self.filter.next(sum, Pass::Band) * step_env(&mut self.env, self.k);
        if self.env == 0.0 {
            self.filter.clear();
        }
        s
    }
}

// ---- key 14: the blip ----

/// A short high sine whose pitch rises fast to an octave above where it starts.
#[derive(Clone, Copy)]
pub struct Blip {
    ab: [u16; 2],
    phase: u32,
    base: f32,
    /// 1 at the trigger, falling to 0; the pitch is base * (2 - rise).
    rise: f32,
    k_rise: f32,
    env: f32,
    k: f32,
}

impl Blip {
    /// The rise: by e in 10 ms.
    const RISE_US: u64 = 10_000;
    const LEVEL: f32 = 0.8;

    pub const fn new() -> Self {
        Blip { ab: [PARAM_DEFAULT; 2], phase: 0, base: 0.0, rise: 0.0, k_rise: 0.0, env: 0.0, k: 0.0 }
    }

    /// Slider A is the starting pitch, 1 to 3 kHz (2 kHz at the middle). Slider B is the
    /// length, 20 to 100 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.base = inc(span(1_000_000, 3_000_000, a), rate) as f32;
        self.k = fall_60db(span(20_000, 100_000, b), rate);
        self.k_rise = fall(frames(Self::RISE_US, rate) as f32);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.rise = 1.0;
        self.env = Self::LEVEL;
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = sine(self.phase) * step_env(&mut self.env, self.k);
        let step = self.base * (2.0 - step_env(&mut self.rise, self.k_rise));
        self.phase = self.phase.wrapping_add(step as u32);
        if self.env == 0.0 {
            self.rise = 0.0;
        }
        s
    }
}

// ---- keys 15 and 16: the tones ----

/// A2 to G#3 in thousandths of a hertz, equal temperament from A = 110 Hz, rounded. A note's
/// pitch is one of these shifted by octaves: integers to the last step, like every pitch here.
const SEMITONES: [u64; 12] = [110_000, 116_541, 123_471, 130_813, 138_591, 146_832, 155_563, 164_814, 174_614, 184_997, 195_998, 207_652];

/// Slider A as a note: 0 to 24 semitones above the bottom, the middle 12 (an octave up).
/// `octaves_down` moves the whole range down from A2.
#[inline]
fn note(slider: u16, octaves_down: u32) -> u64 {
    let n = span(0, 24, slider) as usize;
    (SEMITONES[n % 12] << (n / 12)) >> octaves_down
}

/// Key 15: a triangle held at one pitch, A2 to A4 by slider A in semitones (A3, 220 Hz, at
/// the middle). Key 16: a square two octaves down, low-passed two octaves above its pitch.
#[derive(Clone, Copy)]
pub struct Tone {
    ab: [u16; 2],
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
    filter: Svf,
    /// The bass: a low-passed square, two octaves down. Otherwise a triangle.
    bass: bool,
}

impl Tone {
    const LEVEL: f32 = 0.8;
    const BASS_LEVEL: f32 = 0.7;
    /// The bass's low-pass, Q 0.7.
    const BASS_K: f32 = 1.4;

    pub const fn tone() -> Self {
        Tone { ab: [PARAM_DEFAULT; 2], phase: 0, inc: 0, env: 0.0, k: 0.0, filter: Svf::new(), bass: false }
    }

    pub const fn bass() -> Self {
        Tone { bass: true, ..Tone::tone() }
    }

    /// Slider A is the note. Slider B is the length, 50 to 500 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let pitch = note(a, if self.bass { 2 } else { 0 });
        self.inc = inc(pitch, rate);
        self.k = fall_60db(span(50_000, 500_000, b), rate);
        if self.bass {
            self.filter.tune(4 * pitch, Self::BASS_K, rate);
        }
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        // The triangle starts a quarter turn in, where it is 0 and rising: no step.
        self.phase = if self.bass { 0 } else { 1 << 30 };
        self.env = if self.bass { Self::BASS_LEVEL } else { Self::LEVEL };
        self.filter.clear();
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let raw = if self.bass {
            let square = if self.phase < 1 << 31 { 1.0 } else { -1.0 };
            self.filter.next(square, Pass::Low)
        } else {
            // -1 ..< 1 over the turn; the triangle is 2|x| - 1.
            let x = (self.phase as i32) as f32 * (1.0 / 2_147_483_648.0);
            2.0 * if x < 0.0 { -x } else { x } - 1.0
        };
        let s = raw * step_env(&mut self.env, self.k);
        self.phase = self.phase.wrapping_add(self.inc);
        if self.env == 0.0 {
            self.filter.clear();
        }
        s
    }
}

// ---- all of them ----

pub struct Voices {
    kick: Kick,
    snare: Snare,
    closed_hat: Hat,
    open_hat: Hat,
    synth_snare: SynthSnare,
    sticks: Sticks,
    cymbal: Hat,
    wash: Wash,
    clap: Clap,
    click: Click,
    low_tom: Tom,
    high_tom: Tom,
    cowbell: Cowbell,
    blip: Blip,
    tone: Tone,
    bass: Tone,
    /// The two sliders of each track, 0 to 65535.
    pub params: [[u16; 2]; TRACKS],
}

/// Calls `$f` on track `$t`'s voice with the remaining arguments. One line a track, in
/// track order: key n is track n - 1 (VOICES.md).
macro_rules! on_voice {
    ($v:expr, $t:expr, $f:ident ( $($arg:expr),* )) => {
        match $t {
            KICK_TRACK => $v.kick.$f($($arg),*),
            SNARE_TRACK => $v.snare.$f($($arg),*),
            CLOSED_HAT_TRACK => $v.closed_hat.$f($($arg),*),
            OPEN_HAT_TRACK => $v.open_hat.$f($($arg),*),
            SYNTH_SNARE_TRACK => $v.synth_snare.$f($($arg),*),
            STICKS_TRACK => $v.sticks.$f($($arg),*),
            CYMBAL_TRACK => $v.cymbal.$f($($arg),*),
            NOISE_TRACK => $v.wash.$f($($arg),*),
            CLAP_TRACK => $v.clap.$f($($arg),*),
            CLICK_TRACK => $v.click.$f($($arg),*),
            LOW_TOM_TRACK => $v.low_tom.$f($($arg),*),
            HIGH_TOM_TRACK => $v.high_tom.$f($($arg),*),
            COWBELL_TRACK => $v.cowbell.$f($($arg),*),
            BLIP_TRACK => $v.blip.$f($($arg),*),
            TONE_TRACK => $v.tone.$f($($arg),*),
            _ => $v.bass.$f($($arg),*), // BASS_TRACK
        }
    };
}

impl Voices {
    pub const fn new() -> Self {
        Voices {
            kick: Kick::new(),
            snare: Snare::new(),
            closed_hat: Hat::closed(),
            open_hat: Hat::open(),
            synth_snare: SynthSnare::new(),
            sticks: Sticks::new(),
            cymbal: Hat::cymbal(),
            wash: Wash::new(),
            clap: Clap::new(),
            click: Click::new(),
            low_tom: Tom::low(),
            high_tom: Tom::high(),
            cowbell: Cowbell::new(),
            blip: Blip::new(),
            tone: Tone::tone(),
            bass: Tone::bass(),
            params: [[PARAM_DEFAULT; 2]; TRACKS],
        }
    }

    /// The tracks that fired on this frame start their voices on this frame.
    #[inline]
    pub fn trigger(&mut self, fired: u16, rate: u32) {
        if fired == 0 {
            return;
        }
        for t in 0..TRACKS {
            if fired >> t & 1 == 1 {
                let p = self.params[t];
                on_voice!(self, t, trigger(p, rate));
            }
        }
    }

    /// A voice that is sounding keeps its pitch and length in seconds across a rate change.
    pub fn set_sample_rate(&mut self, rate: u32) {
        for t in 0..TRACKS {
            on_voice!(self, t, tune(rate));
        }
    }

    /// One frame. `frame` is `channels` floats: 1 is the mix, 16 is each track on its own.
    /// The mix is the plain sum, in track order, from track 0.
    #[inline]
    pub fn render(&mut self, frame: &mut [f32]) {
        let mut v = [0.0f32; TRACKS];
        for (t, out) in v.iter_mut().enumerate() {
            *out = on_voice!(self, t, next()) * LEVEL;
        }
        match frame {
            [mix] => {
                let mut sum = v[0];
                for s in &v[1..] {
                    sum += *s;
                }
                *mix = sum;
            }
            tracks => tracks.copy_from_slice(&v),
        }
    }
}
