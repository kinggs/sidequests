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

use crate::bus::{Bus, SLOW_RATE};
use crate::seq::TRACKS;

/// §19: the loop layouts' channel counts: the sixteen sounds, the mix and the bus; and the
/// same with the thirty-two slider channels after them.
pub const LOOP: usize = TRACKS + 2;
pub const LOOP_SLIDERS: usize = LOOP + 2 * TRACKS;

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

/// `N` squares summed, each +1 while its phase's top bit is 0 and -1 once it is 1, at the
/// phases as they are; then each phase advanced once. Counted in integers (Session 41, D105
/// item 5, Antigravity's): the sum is `N - 2 × (top bits set)`, one of `-N ..= N` in twos,
/// exact in an f32, and never -0, as the float sum from +0 it replaces never was (x + -x is +0).
/// The hats' six and the cow bell's two.
#[inline]
fn squares<const N: usize>(phase: &mut [u32; N], inc: &[u32; N]) -> f32 {
    let mut high = 0u32;
    for p in phase.iter() {
        high += *p >> 31;
    }
    for (p, i) in phase.iter_mut().zip(inc) {
        *p = p.wrapping_add(*i);
    }
    (N as i32 - 2 * high as i32) as f32
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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
    /// `base as u32`, made with it in `tune`: the step once the sweep is 0, where `base ×
    /// (1 + 2 × 0)` is `base` (Session 41, D105 item 5, Antigravity's).
    base_inc: u32,
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
            base_inc: 0,
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
        self.base_inc = self.base as u32;
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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
        // The frame that takes the sweep to 0 still steps by its old value; from the next the
        // step is `base_inc`, what `base × (1 + 2 × 0)` cast gives.
        let step = if self.sweep != 0.0 {
            (self.base * (1.0 + 2.0 * step_env(&mut self.sweep, self.k_sweep))) as u32
        } else {
            self.base_inc
        };
        self.phase = self.phase.wrapping_add(step);
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.body == 0.0 && self.wires == 0.0
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

/// What each of the three is, apart from its slider values: a table, not fields of each voice
/// (Session 41, D105 item 5, Antigravity's: the engine 120 bytes smaller). `Hat::kind` names
/// its row.
struct HatSpec {
    /// Slider B's range, 60 dB in this many microseconds.
    length_us: (u64, u64),
    /// Slider A's range: the high-pass's corner, in thousandths of a hertz.
    corner: (u64, u64),
    /// The filter's damping, 1 / Q.
    filter_k: f32,
    /// The squares summed run to +-6; this brings the filtered hat near full scale.
    level: f32,
}

const HAT_SPECS: [HatSpec; 3] = [
    // Key 3, the closed hat: 10 to 60 ms; the hats' corner, 5 to 10 kHz (7.5 at the middle);
    // a little resonance at the corner (Q 1.4) for a ring.
    HatSpec { length_us: (10_000, 60_000), corner: (5_000_000, 10_000_000), filter_k: 0.7, level: 0.4 },
    // Key 4, the open hat: 100 to 500 ms, the same corner and ring.
    HatSpec { length_us: (100_000, 500_000), corner: (5_000_000, 10_000_000), filter_k: 0.7, level: 0.4 },
    // Key 7, the cymbal: 200 to 1200 ms; the corner lower, 3 to 7 kHz, and no ring (Q 0.7), so
    // more of the squares' body comes through: a wider band. Quieter, since more passes.
    HatSpec { length_us: (200_000, 1_200_000), corner: (3_000_000, 7_000_000), filter_k: 1.4, level: 0.3 },
];

/// Six detuned squares through a high-pass (VOICES.md: one source for both hats, and the
/// cymbal's). The two hats are two of these, apart: each sounds on its own and neither cuts
/// the other off. The cymbal (key 7) is a third, with a lower, wider band and a long tail.
#[derive(Clone, Copy)]
pub struct Hat {
    ab: [u16; 2],
    /// Its row of `HAT_SPECS`: 0 closed, 1 open, 2 the cymbal.
    kind: u8,
    phase: [u32; 6],
    inc: [u32; 6],
    env: f32,
    k: f32,
    filter: Svf,
}

impl Hat {
    /// The six squares, in thousandths of a hertz: our own uneven set, none a simple ratio
    /// of another, so they beat against each other like metal.
    const PITCHES: [u64; 6] = [263_000, 333_000, 401_000, 487_000, 571_000, 827_000];
    /// Half the squares start low, so their sum starts at 0: a sum starting at 6 is a step
    /// the high-pass passes whole, a loud tick louder than the hat.
    const START: [u32; 6] = [0, 1 << 31, 0, 1 << 31, 0, 1 << 31];

    const fn new(kind: u8) -> Self {
        Hat { ab: [PARAM_DEFAULT; 2], kind, phase: [0; 6], inc: [0; 6], env: 0.0, k: 0.0, filter: Svf::new() }
    }

    /// Key 3: 10 to 60 ms.
    pub const fn closed() -> Self {
        Hat::new(0)
    }

    /// Key 4: 100 to 500 ms.
    pub const fn open() -> Self {
        Hat::new(1)
    }

    /// Key 7: 200 to 1200 ms, a lower, wider band, quieter (`HAT_SPECS`).
    pub const fn cymbal() -> Self {
        Hat::new(2)
    }

    /// Its row of the table (`% 3`: no bounds check, and `kind` is only ever 0 to 2).
    #[inline]
    fn spec(&self) -> &'static HatSpec {
        &HAT_SPECS[self.kind as usize % 3]
    }

    /// Slider A is the filter's corner. Slider B is the length, to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let spec = self.spec();
        for (i, p) in Self::PITCHES.iter().enumerate() {
            self.inc[i] = inc(*p, rate);
        }
        self.k = fall_60db(span(spec.length_us.0, spec.length_us.1, b), rate);
        self.filter.tune(span(spec.corner.0, spec.corner.1, a), spec.filter_k, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = Self::START;
        self.env = self.spec().level;
        self.filter.clear();
    }

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let sum = squares(&mut self.phase, &self.inc);
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
    /// `base as u32`, the step once the sweep is 0 (Session 41, as the kick's).
    base_inc: u32,
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
        SynthSnare { ab: [PARAM_DEFAULT; 2], phase: 0, base: 0.0, base_inc: 0, sweep: 0.0, k_sweep: 0.0, env: 0.0, k: 0.0, hiss: 0.0, k_hiss: 0.0, noise: Noise(Noise::SEED), filter: Svf::new() }
    }

    /// Slider A is the pitch, 200 to 460 Hz (330 at the middle). Slider B is the length, 20 to
    /// 150 ms for the body to fall 60 dB; the noise takes a third of that.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let length = span(20_000, 150_000, b);
        self.base = inc(span(200_000, 460_000, a), rate) as f32;
        self.base_inc = self.base as u32;
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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
        // As the kick's: the sweep's last frame at its old value, `base_inc` from the next.
        let step = if self.sweep != 0.0 {
            (self.base * (1.0 + step_env(&mut self.sweep, self.k_sweep))) as u32
        } else {
            self.base_inc
        };
        self.phase = self.phase.wrapping_add(step);
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.t == u32::MAX
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
    /// `base as u32`, the step once the sweep is 0 (Session 41, as the kick's).
    base_inc: u32,
    env: f32,
    k: f32,
    sweep: f32,
    k_sweep: f32,
    /// The high tom (key 12), else the low (key 11): which ranges `tune` reads (Session 41,
    /// D105 item 5, Antigravity's: a flag, not two ranges in each tom).
    high: bool,
}

impl Tom {
    /// The fall: pitch is base * (1 + 0.5 sweep), the sweep falling by e in 40 ms.
    const SWEEP_US: u64 = 40_000;
    const DEPTH: f32 = 0.5;
    const LEVEL: f32 = 0.9;

    const fn new(high: bool) -> Self {
        Tom { ab: [PARAM_DEFAULT; 2], phase: 0, base: 0.0, base_inc: 0, env: 0.0, k: 0.0, sweep: 0.0, k_sweep: 0.0, high }
    }

    /// Key 11: 60 to 120 Hz, 150 to 600 ms.
    pub const fn low() -> Self {
        Tom::new(false)
    }

    /// Key 12: 120 to 250 Hz, 100 to 400 ms.
    pub const fn high() -> Self {
        Tom::new(true)
    }

    /// Slider A is the base pitch. Slider B is the length, to fall 60 dB. The ranges, in
    /// thousandths of a hertz and in microseconds, are `low`'s and `high`'s.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let (pitch, length_us) = if self.high {
            ((120_000, 250_000), (100_000, 400_000))
        } else {
            ((60_000, 120_000), (150_000, 600_000))
        };
        self.base = inc(span(pitch.0, pitch.1, a), rate) as f32;
        self.base_inc = self.base as u32;
        self.k = fall_60db(span(length_us.0, length_us.1, b), rate);
        self.k_sweep = fall(frames(Self::SWEEP_US, rate) as f32);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::LEVEL;
        self.sweep = 1.0;
    }

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = sine(self.phase) * step_env(&mut self.env, self.k);
        // As the kick's: the sweep's last frame at its old value, `base_inc` from the next.
        let step = if self.sweep != 0.0 {
            (self.base * (1.0 + Self::DEPTH * step_env(&mut self.sweep, self.k_sweep))) as u32
        } else {
            self.base_inc
        };
        self.phase = self.phase.wrapping_add(step);
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let sum = squares(&mut self.phase, &self.inc);
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

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
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
/// the middle). Until Session 41 (D105 item 5, Antigravity's) it was one type with the bass,
/// told apart by a flag; each now carries only its own fields and branch.
#[derive(Clone, Copy)]
pub struct Tone {
    ab: [u16; 2],
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
}

impl Tone {
    const LEVEL: f32 = 0.8;

    pub const fn new() -> Self {
        Tone { ab: [PARAM_DEFAULT; 2], phase: 0, inc: 0, env: 0.0, k: 0.0 }
    }

    /// Slider A is the note. Slider B is the length, 50 to 500 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        self.inc = inc(note(a, 0), rate);
        self.k = fall_60db(span(50_000, 500_000, b), rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        // The triangle starts a quarter turn in, where it is 0 and rising: no step.
        self.phase = 1 << 30;
        self.env = Self::LEVEL;
    }

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        // -1 ..< 1 over the turn; the triangle is 2|x| - 1.
        let x = (self.phase as i32) as f32 * (1.0 / 2_147_483_648.0);
        let raw = 2.0 * if x < 0.0 { -x } else { x } - 1.0;
        let s = raw * step_env(&mut self.env, self.k);
        self.phase = self.phase.wrapping_add(self.inc);
        s
    }
}

/// Key 16: a square two octaves below the tone's note, low-passed two octaves above its pitch.
#[derive(Clone, Copy)]
pub struct Bass {
    ab: [u16; 2],
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
    filter: Svf,
}

impl Bass {
    const LEVEL: f32 = 0.7;
    /// The low-pass, Q 0.7.
    const K: f32 = 1.4;

    pub const fn new() -> Self {
        Bass { ab: [PARAM_DEFAULT; 2], phase: 0, inc: 0, env: 0.0, k: 0.0, filter: Svf::new() }
    }

    /// Slider A is the note. Slider B is the length, 50 to 500 ms to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        let pitch = note(a, 2);
        self.inc = inc(pitch, rate);
        self.k = fall_60db(span(50_000, 500_000, b), rate);
        self.filter.tune(4 * pitch, Self::K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = 0;
        self.env = Self::LEVEL;
        self.filter.clear();
    }

    /// Silent: `next` returns 0 and changes nothing, its first test word for word.
    #[inline]
    fn silent(&self) -> bool {
        self.env == 0.0
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let square = if self.phase < 1 << 31 { 1.0 } else { -1.0 };
        let raw = self.filter.next(square, Pass::Low);
        let s = raw * step_env(&mut self.env, self.k);
        self.phase = self.phase.wrapping_add(self.inc);
        if self.env == 0.0 {
            self.filter.clear();
        }
        s
    }
}

// ---- a sample, in place of a track's code voice (D50) ----

/// The rate every sample is stored at: the starter pack's own (samples/make-raw.py).
pub const SAMPLE_RATE: u32 = 44_100;

/// 2^(n/12) for n = -12 ..= 12, in 1/65536ths, rounded: slider A's 25 semitones.
const RATIOS: [u32; 25] = [
    32768, 34716, 36781, 38968, 41285, 43740, 46341, 49097, 52016, 55109, 58386, 61858, 65536, 69433, 73562,
    77936, 82570, 87480, 92682, 98193, 104032, 110218, 116772, 123715, 131072,
];

// TUNING SAMPLES. The numbers below are first settings, to move by ear (VOICES.md,
// "Tuning a sample"). Changing one changes how a sample sounds and nothing else.

/// Slider B on a sample, from the middle up: the whole sample. Below the middle it plays
/// for less, down to this many microseconds at 0: each track's shortest code length
/// (VOICES.md, "As built"). A sample shorter than this plays whole at every setting.
const SHORTEST_US: [u64; TRACKS] = [
    100_000, 50_000, 10_000, 100_000, 20_000, 10_000, 200_000, 50_000,
    50_000, 5_000, 150_000, 100_000, 30_000, 20_000, 50_000, 50_000,
];

/// Where on slider B the whole sample is reached: its middle.
const WHOLE_FROM: u16 = PARAM_DEFAULT;

/// The fade once it has played as long as slider B says: 60 dB in this many microseconds.
const FADE_US: u64 = 10_000;

/// A track's sample: 16-bit mono at `SAMPLE_RATE`, in memory the host owns (`pi_set_sample`).
/// Slider A moves it in semitones, an octave either way, by playing it faster or slower;
/// the middle is as recorded. Slider B is how long it plays before a 10 ms fade: the whole
/// sample from the middle up, shorter below (`SHORTEST_US`). It is read
/// between stored frames by a straight line: `+ - * /` only, as everywhere in this file.
#[derive(Clone, Copy)]
pub struct Sample {
    data: *const i16,
    len: u32,
    track: u8,
    active: bool,
    ab: [u16; 2],
    /// Where in the data, in 1/2^32ths of a stored frame, and how far a frame moves it.
    pos: u64,
    step: u64,
    /// Frames since the trigger; the frame the fade starts; the rate those are counted at.
    t: u32,
    hold: u32,
    rate: u32,
    env: f32,
    k: f32,
}

impl Sample {
    pub const fn new(track: u8) -> Self {
        Sample {
            data: core::ptr::null(), len: 0, track, active: false, ab: [PARAM_DEFAULT; 2],
            pos: 0, step: 0, t: 0, hold: 0, rate: 0, env: 0.0, k: 0.0,
        }
    }

    /// Stops it first: the host may free the old data as soon as this returns.
    pub fn set(&mut self, data: *const i16, len: u32) {
        self.active = false;
        self.env = 0.0;
        (self.data, self.len) = if data.is_null() || len == 0 { (core::ptr::null(), 0) } else { (data, len) };
    }

    pub fn loaded(&self) -> bool {
        self.len != 0
    }

    pub fn sounding(&self) -> bool {
        self.active
    }

    fn tune(&mut self, rate: u32) {
        let rate = rate.max(1);
        let [a, b] = self.ab;
        let ratio = RATIOS[span(0, 24, a) as usize] as u64;
        self.step = ((SAMPLE_RATE as u64 * ratio) << 16) / rate as u64;
        // The whole sample at this rate, as recorded (slider A changes how fast it is read,
        // and it stops at its end whatever the hold).
        let whole = (self.len as u64 * rate as u64).div_ceil(SAMPLE_RATE as u64);
        let shortest = frames(SHORTEST_US[self.track as usize % TRACKS], rate) as u64;
        self.hold = if b >= WHOLE_FROM || shortest >= whole {
            u32::MAX
        } else {
            (shortest + b as u64 * (whole - shortest) / WHOLE_FROM as u64) as u32
        };
        self.k = fall_60db(FADE_US, rate);
        // Mid-sound, the time already played stays the same in seconds.
        if self.rate != 0 && self.rate != rate {
            self.t = (self.t as u64 * rate as u64 / self.rate as u64) as u32;
        }
        self.rate = rate;
    }

    pub fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        if !self.loaded() {
            return;
        }
        self.ab = ab;
        self.rate = 0;
        self.tune(rate);
        self.pos = 0;
        self.t = 0;
        self.env = 1.0;
        self.active = true;
    }

    #[inline]
    pub fn next(&mut self) -> f32 {
        if !self.active {
            return 0.0;
        }
        let i = (self.pos >> 32) as usize;
        if i >= self.len as usize {
            self.active = false;
            return 0.0;
        }
        // SAFETY: i < len, and `pi_set_sample`'s contract keeps `len` frames readable at `data`.
        let a = (unsafe { *self.data.add(i) }) as f32;
        let b = if i + 1 < self.len as usize { (unsafe { *self.data.add(i + 1) }) as f32 } else { 0.0 };
        let frac = (self.pos as u32) as f32 * (1.0 / 4_294_967_296.0);
        let raw = (a + (b - a) * frac) * (1.0 / 32_768.0);
        let gain = if self.t < self.hold { self.env } else { step_env(&mut self.env, self.k) };
        self.t = self.t.saturating_add(1);
        self.pos = self.pos.wrapping_add(self.step);
        if self.env == 0.0 {
            self.active = false;
        }
        raw * gain
    }
}

// ---- all of them ----

#[cfg_attr(test, derive(Clone, Copy))]
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
    bass: Bass,
    /// The two sliders of each track, 0 to 65535: the sound's own. Since §20 a `PARAM` sets
    /// all sixteen alike (the hand's); `SOUND` still sets one.
    pub params: [[u16; 2]; TRACKS],
    /// Each track's sample, if the host gave one (D50). A sample is only ever started by
    /// `Voices::trigger`, which marks its track in `active_tracks` (Session 36): start one
    /// anywhere else and the short way round never asks it. `pi_set_sample` only stops one.
    pub samples: [Sample; TRACKS],
    /// Bit t: track t plays its sample when it fires, if it has one; otherwise its code
    /// voice. All code to start with (D50).
    pub sampled: u16,
    /// Every voice and every sample silent, so each `next` would return +0 and change nothing:
    /// `render` skips them (Session 29, the idle cost). Only ever true when that holds: a
    /// trigger clears it, and `render` sets it again only once every track is known silent
    /// (Session 36: `active_tracks` empty; before, after asking every voice). False when they
    /// are silent costs the long way round and nothing else. Not saved: the moment's.
    pub quiet: bool,
    /// The sounds that may be sounding, a bit a track (Session 36, Codex's patch; D102): only
    /// these are asked, and every other is given the +0 a silent voice would give. A hit sets
    /// its track's bit (`trigger`); the frame a track gives +0 and says silent, code voice and
    /// sample, clears it (`sound_track`). Nothing else may start a sound: a retune keeps a
    /// silent voice silent, and `pi_set_sample` only stops one. That rule is the mask's whole
    /// footing, so `render` checks it on every frame of every test run (`debug_assert!`).
    /// Not saved: the moment's, as `quiet` is. Before it, every voice was asked on every frame
    /// that was not quiet: the beat 36.4 ns a frame, now 14.4 (`make pairs`, CPU 2, Session 36).
    active_tracks: u16,
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
            tone: Tone::new(),
            bass: Bass::new(),
            params: [[PARAM_DEFAULT; 2]; TRACKS],
            samples: [
                Sample::new(0), Sample::new(1), Sample::new(2), Sample::new(3),
                Sample::new(4), Sample::new(5), Sample::new(6), Sample::new(7),
                Sample::new(8), Sample::new(9), Sample::new(10), Sample::new(11),
                Sample::new(12), Sample::new(13), Sample::new(14), Sample::new(15),
            ],
            sampled: 0,
            quiet: true,
            active_tracks: 0,
        }
    }

    /// Every code voice and every sample silent: `quiet` may be set.
    pub(crate) fn silent(&self) -> bool {
        (0..TRACKS).all(|t| self.track_silent(t))
    }

    /// Track `t`'s code voice and its sample both silent: its bit may be cleared. Out of line:
    /// it is asked only on a frame the track gives +0.
    #[inline(never)]
    fn track_silent(&self, t: usize) -> bool {
        on_voice!(self, t, silent()) && !self.samples[t].sounding()
    }

    /// The tracks that fired on this frame start their voices on this frame, each with the
    /// A and B it was hit with (§20: `hit`, the engine's reckoning of step or tap). A sound in
    /// `slowed` is tuned for `SLOW_RATE` (§18, designed 2026-11-25: effect 1), any other for
    /// the host's `rate`.
    /// Out of line since Session 36 (Codex's): it runs only on a frame something fires, and
    /// inlined it lengthens the frame loop every frame pays for. Inlined again, idle reads 4.1
    /// ns a frame against 3.7, and every playing case 0.1 to 0.4 more (`make pairs`, CPU 2).
    #[inline(never)]
    pub fn trigger(&mut self, fired: u16, hit: &[[u16; 2]; TRACKS], rate: u32, slowed: u16) {
        if fired != 0 {
            self.active_tracks |= fired;
            self.quiet = false;
        }
        for t in 0..TRACKS {
            if fired >> t & 1 == 1 {
                let p = hit[t];
                let rate = if slowed >> t & 1 == 1 { SLOW_RATE } else { rate };
                // A track switched to its sample with none given plays its code voice.
                if self.sampled >> t & 1 == 1 && self.samples[t].loaded() {
                    self.samples[t].trigger(p, rate);
                } else {
                    on_voice!(self, t, trigger(p, rate));
                }
            }
        }
    }

    /// A voice that is sounding keeps its pitch and length in seconds across a rate change.
    /// A slowed one (§18, designed 2026-11-25) stays tuned for `SLOW_RATE`, whatever the host's.
    pub fn set_sample_rate(&mut self, rate: u32, slowed: u16) {
        for t in 0..TRACKS {
            if slowed >> t & 1 == 0 {
                self.retune(t, rate);
            }
        }
    }

    /// Track `t`'s code voice retuned, and its sample too if it is sounding.
    #[inline(never)]
    fn retune(&mut self, t: usize, rate: u32) {
        on_voice!(self, t, tune(rate));
        if self.samples[t].sounding() {
            self.samples[t].tune(rate);
        }
    }

    /// One sound's next value, as `sound` gives it: its code voice's, and its sample's if that
    /// is sounding, times the level.
    #[inline(never)]
    fn ask(&mut self, t: usize) -> f32 {
        let code = on_voice!(self, t, next());
        // Both can sound at once after a switch: the old one's tail plays out. Only
        // added when a sample is sounding, so the code voices alone keep their bits.
        let s = &mut self.samples[t];
        (if s.sounding() { code + s.next() } else { code }) * LEVEL
    }

    /// §18, designed 2026-11-25 (effect 1): what is slowed is now `now`, read where what is
    /// heard is read, before the frame's hits. Each sound whose bit changed is retuned, for
    /// `SLOW_RATE` if it is now slowed, for the host's `rate` if not; each that became slowed
    /// is asked once, there, `from = to =` that value; and if any became slowed the grid
    /// starts again, so this frame is fresh for all with `mu` 0. Out of line: it runs only on
    /// a frame where what is slowed changes.
    #[inline(never)]
    pub fn slow(&mut self, now: u16, bus: &mut Bus, rate: u32) {
        // Each set bit in turn, lowest first: a loop the compiler does not unroll sixteen
        // times, which kept the `.wasm` under P1's 50 KB (Session 32, measured).
        let was = bus.slowed;
        let mut changed = now ^ was;
        while changed != 0 {
            let t = changed.trailing_zeros() as usize;
            changed &= changed - 1;
            self.retune(t, if now >> t & 1 == 1 { SLOW_RATE } else { rate });
        }
        let became = now & !was;
        if became != 0 {
            let mut left = became;
            while left != 0 {
                let t = left.trailing_zeros() as usize;
                left &= left - 1;
                let x = self.ask(t);
                bus.from[t] = x;
                bus.to[t] = x;
            }
            bus.restart();
        }
        bus.slowed = now;
    }

    /// One frame. `frame` is `channels` floats: 1 is the mix, 16 is each track on its own,
    /// 17 is both, the sixteen then the mix (§15). The mix is the plain sum, in track order,
    /// from track 0, times `gain`: the master volume (§13), which is exactly 1 at volume 16.
    /// The sixteen tracks are not scaled: they are the direct outputs, before the master
    /// (D57). Each layout's channels are the same bits whichever layout carries them.
    /// §18: while the bus runs an effect the mix is the bus's; idle, it is exactly the sum
    /// above. The sixteen tracks are never touched by an effect.
    ///
    /// §19: a loop layout (18 or 50 channels) is also read: the bus does that mix, out of
    /// line, so the three layouts above cost what they did.
    ///
    /// Quiet (every voice silent), the sixteen are +0, the bits each silent voice gives
    /// (0 × LEVEL), and no voice is asked: the same frame for less (Session 29).
    #[inline]
    pub fn render(&mut self, frame: &mut [f32], gain: f32, bus: &mut Bus, fx_sounds: u16) {
        // The mask's one rule, which nothing else states (Session 36, the review of D102): a
        // track left out of `active_tracks` is silent, code voice and sample, so the +0 it is
        // given is the +0 asking it would give. Checked on every frame of every test run.
        debug_assert!(
            (0..TRACKS).all(|t| self.active_tracks >> t & 1 == 1 || self.track_silent(t)),
            "a track left out of active_tracks is sounding: {:#06x}",
            self.active_tracks
        );
        let mut v = [0.0f32; TRACKS];
        let quiet = self.quiet;
        if !quiet {
            // §18, designed 2026-11-25: one test of `slowed` on a frame that asks the voices.
            if bus.slowed != 0 {
                self.sound_slow(&mut v, bus);
            } else {
                self.sound(&mut v);
            }
        }
        let mut mix = |v: &[f32; TRACKS]| {
            if !bus.idle() {
                return bus.mix(v, fx_sounds, gain);
            }
            if quiet {
                // Quiet, the sixteen are +0, and their plain sum from track 0 is +0: the same
                // bits as `0.0 * gain`, without the fifteen additions. Idle 5.0 ns a frame
                // with the sum, 3.7 without (Session 36, `make pairs`, CPU 2).
                return 0.0 * gain;
            }
            let mut sum = v[0];
            for s in &v[1..] {
                sum += *s;
            }
            sum * gain
        };
        match frame {
            [out] => *out = mix(&v),
            [tracks @ .., out] if tracks.len() == TRACKS => {
                tracks.copy_from_slice(&v);
                *out = mix(&v);
            }
            tracks if tracks.len() == TRACKS => tracks.copy_from_slice(&v),
            looped => bus.looped(looped, &v, fx_sounds, gain),
        }
    }

    /// The sixteen, in track order as before Session 29: only the tracks in `active_tracks`
    /// are asked (Session 36), the rest stay the +0 `render` gave them. A track is asked
    /// whether it is silent only on a frame it gives +0 (each bit 0; a −0 does not count),
    /// which is next to nothing while it sounds; quiet is then every bit cleared, the same
    /// moment Session 29's frame of sixteen +0s and every voice silent was.
    #[inline]
    fn sound(&mut self, v: &mut [f32; TRACKS]) {
        self.sound_active(v);
        self.quiet = self.active_tracks == 0;
    }

    /// The tracks in `active_tracks` asked into a frame of +0s, lowest first, each set bit in
    /// turn. Session 36, against Session 34's build that asked all sixteen (`make pairs`, CPU
    /// 2, ten rounds): beat 36.4 → 14.4 ns a frame, all sixteen sounds 55.7 → 47.1, idle 6.0
    /// → 3.7. The walk itself is no saving: with every bit kept set it read beat 74.2, twice
    /// the old loop, since each track then goes through the out-of-line `ask`. It pays because
    /// most bits are clear: four drums on a beat, at most a few ringing at once.
    #[inline]
    fn sound_active(&mut self, v: &mut [f32; TRACKS]) {
        let mut remaining = self.active_tracks;
        while remaining != 0 {
            let t = remaining.trailing_zeros() as usize;
            remaining &= remaining - 1;
            v[t] = self.sound_track(t, 1 << t);
        }
    }

    /// One track asked, and let go (its bit cleared) on the frame it gives +0 and says silent.
    #[inline]
    fn sound_track(&mut self, t: usize, bit: u16) -> f32 {
        let out = self.ask(t);
        if out.to_bits() == 0 && self.track_silent(t) {
            self.active_tracks &= !bit;
        }
        out
    }

    /// The sixteen while effect 1 slows some (§18, designed 2026-11-25): a slowed sound is
    /// asked only on a fresh frame of the grid (`from = to`, `to =` its next value) and is the
    /// straight line `from + (to − from) × mu` on every frame, so it runs one grid step behind
    /// its voice; any other is asked as in `sound`. Quiet may be set only on a frame where
    /// every channel is +0 and every slowed sound's `from` and `to` are +0: a line can cross
    /// zero between two values that are not. Out of line, so `sound` is as small as it can be.
    /// Since Session 36 a sound not in `active_tracks` is not asked here either: a slowed one's
    /// `to` is the +0 it would give, a plain one's channel the +0 `render` gave.
    #[inline(never)]
    fn sound_slow(&mut self, v: &mut [f32; TRACKS], bus: &mut Bus) {
        let (slowed, fresh, mu) = (bus.slowed, bus.fresh, bus.mu);
        let mut bits = 0u32;
        if slowed == u16::MAX {
            // Every sound slowed, which is what effect 1 on a whole beat is: on a fresh frame
            // each `from` takes its `to` and `to` is the active sounds asked (the rest +0),
            // then every line drawn with no test of a bit. Session 36, `make pairs`, CPU 2:
            // without this way, fx 1 26.5 ns a frame and fx 1/0 21.1; with it 19.8 and 17.4.
            if fresh {
                bus.from = bus.to;
                bus.to = [0.0; TRACKS];
                self.sound_active(&mut bus.to);
            }
            for ((out, &a), &b) in v.iter_mut().zip(&bus.from).zip(&bus.to) {
                *out = a + (b - a) * mu;
                bits |= out.to_bits() | a.to_bits() | b.to_bits();
            }
        } else {
            // Some sounds slowed: a silent one is not asked, but its line still runs out from
            // `from` to the +0 it is given. No bench case slows only some, so what this buys
            // is not measured (every `fx 1` case slows all sixteen; Session 36). Kept from the
            // patch's own comment, which Session 36's rewrite dropped: before the all-slowed
            // case above was split off, the mask in this general loop took `fx 1` from 31.1
            // to 26.9 ns a frame (Codex, on a busy machine's CPU 4: its reading, not ours).
            for (t, out) in v.iter_mut().enumerate() {
                let bit = 1 << t;
                let active = self.active_tracks & bit != 0;
                if slowed & bit != 0 {
                    if fresh {
                        bus.from[t] = bus.to[t];
                        bus.to[t] = if active { self.sound_track(t, bit) } else { 0.0 };
                    }
                    let (a, b) = (bus.from[t], bus.to[t]);
                    *out = a + (b - a) * mu;
                    bits |= out.to_bits() | a.to_bits() | b.to_bits();
                } else if active {
                    *out = self.sound_track(t, bit);
                    bits |= out.to_bits();
                }
            }
        }
        if bits == 0 {
            self.quiet = self.silent();
        }
    }
}

/// For the rule tests' model of §18's effect 1 (`tests/bus.rs`, `Voicing`): one track's code
/// voice asked, retuned or hit alone, and a sample retuned, the way the model reads them. Not
/// the engine's own paths, so a slip in those shows as a difference. (But `ask_every_voice`
/// below: it only sets every bit of the mask, and the engine it makes still runs the engine's
/// own `ask`, `sound_slow`, mix and loop. Tests built on it hold the mask and nothing else:
/// Session 36's review.)
#[cfg(test)]
impl Voices {
    pub fn code_next(&mut self, t: usize) -> f32 {
        on_voice!(self, t, next())
    }

    pub fn code_tune(&mut self, t: usize, rate: u32) {
        on_voice!(self, t, tune(rate))
    }

    pub fn code_trigger(&mut self, t: usize, ab: [u16; 2], rate: u32) {
        on_voice!(self, t, trigger(ab, rate))
    }

    /// For the rule tests' model of the short ways round (`tests/quiet.rs`): on its next frame
    /// this engine asks every voice, as it did before Session 29.
    /// Since Session 36 that is every bit of `active_tracks` set as well: each track is asked,
    /// and the one that gives +0 and says silent is let go again, as the short way does.
    pub fn ask_every_voice(&mut self) {
        self.quiet = false;
        self.active_tracks = u16::MAX;
    }
}

#[cfg(test)]
impl Sample {
    pub fn retune(&mut self, rate: u32) {
        self.tune(rate)
    }
}
