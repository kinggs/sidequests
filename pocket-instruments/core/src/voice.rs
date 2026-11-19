//! Sound (ENGINE.md §11, D44). Five voices so far, from VOICES.md: the bass drum (key 1),
//! the snare (key 2), the closed and open hats (keys 3 and 4) and the click (key 10).
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
pub const CLICK_TRACK: usize = 9;

/// A slider's middle.
pub const PARAM_DEFAULT: u16 = 32768;

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

/// Six detuned squares through a high-pass (VOICES.md: one source for both hats). The two
/// hats are two of these, apart: each sounds on its own and neither cuts the other off.
#[derive(Clone, Copy)]
pub struct Hat {
    ab: [u16; 2],
    phase: [u32; 6],
    inc: [u32; 6],
    env: f32,
    k: f32,
    filter: Svf,
    /// Slider B's range, 60 dB in this many microseconds: one for each hat.
    length_us: (u64, u64),
}

impl Hat {
    /// The six squares, in thousandths of a hertz: our own uneven set, none a simple ratio
    /// of another, so they beat against each other like metal.
    const PITCHES: [u64; 6] = [263_000, 333_000, 401_000, 487_000, 571_000, 827_000];
    /// Half the squares start low, so their sum starts at 0: a sum starting at 6 is a step
    /// the high-pass passes whole, a loud tick louder than the hat.
    const START: [u32; 6] = [0, 1 << 31, 0, 1 << 31, 0, 1 << 31];
    /// The squares summed run to +-6; this brings the filtered hat near full scale.
    const LEVEL: f32 = 0.4;
    /// A little resonance at the corner (Q 1.4) for a ring.
    const FILTER_K: f32 = 0.7;

    pub const fn new(length_us: (u64, u64)) -> Self {
        Hat { ab: [PARAM_DEFAULT; 2], phase: [0; 6], inc: [0; 6], env: 0.0, k: 0.0, filter: Svf::new(), length_us }
    }

    pub const fn closed() -> Self {
        Hat::new((10_000, 60_000))
    }

    pub const fn open() -> Self {
        Hat::new((100_000, 500_000))
    }

    /// Slider A is the filter's corner, 5 to 10 kHz (7.5 at the middle). Slider B is length:
    /// 10 to 60 ms closed, 100 to 500 ms open, to fall 60 dB.
    fn tune(&mut self, rate: u32) {
        let [a, b] = self.ab;
        for (i, p) in Self::PITCHES.iter().enumerate() {
            self.inc[i] = inc(*p, rate);
        }
        self.k = fall_60db(span(self.length_us.0, self.length_us.1, b), rate);
        self.filter.tune(span(5_000_000, 10_000_000, a), Self::FILTER_K, rate);
    }

    fn trigger(&mut self, ab: [u16; 2], rate: u32) {
        self.ab = ab;
        self.tune(rate);
        self.phase = Self::START;
        self.env = Self::LEVEL;
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

// ---- all of them ----

pub struct Voices {
    kick: Kick,
    snare: Snare,
    closed_hat: Hat,
    open_hat: Hat,
    click: Click,
    /// The two sliders of each track, 0 to 65535. Kept for all sixteen, so the command and
    /// the memory do not change as the other voices arrive.
    pub params: [[u16; 2]; TRACKS],
}

impl Voices {
    pub const fn new() -> Self {
        Voices {
            kick: Kick::new(),
            snare: Snare::new(),
            closed_hat: Hat::closed(),
            open_hat: Hat::open(),
            click: Click::new(),
            params: [[PARAM_DEFAULT; 2]; TRACKS],
        }
    }

    /// The tracks that fired on this frame start their voices on this frame.
    #[inline]
    pub fn trigger(&mut self, fired: u16, rate: u32) {
        if fired == 0 {
            return;
        }
        let on = |t: usize| fired >> t & 1 == 1;
        let p = self.params;
        if on(KICK_TRACK) {
            self.kick.trigger(p[KICK_TRACK], rate);
        }
        if on(SNARE_TRACK) {
            self.snare.trigger(p[SNARE_TRACK], rate);
        }
        if on(CLOSED_HAT_TRACK) {
            self.closed_hat.trigger(p[CLOSED_HAT_TRACK], rate);
        }
        if on(OPEN_HAT_TRACK) {
            self.open_hat.trigger(p[OPEN_HAT_TRACK], rate);
        }
        if on(CLICK_TRACK) {
            self.click.trigger(p[CLICK_TRACK], rate);
        }
    }

    /// A voice that is sounding keeps its pitch and length in seconds across a rate change.
    pub fn set_sample_rate(&mut self, rate: u32) {
        self.kick.tune(rate);
        self.snare.tune(rate);
        self.closed_hat.tune(rate);
        self.open_hat.tune(rate);
        self.click.tune(rate);
    }

    /// One frame. `frame` is `channels` floats: 1 is the mix, 16 is each track on its own.
    /// The mix is the plain sum, in track order.
    #[inline]
    pub fn render(&mut self, frame: &mut [f32]) {
        let kick = self.kick.next();
        let snare = self.snare.next();
        let closed = self.closed_hat.next();
        let open = self.open_hat.next();
        let click = self.click.next();
        match frame {
            [mix] => *mix = kick + snare + closed + open + click,
            tracks => {
                for (t, out) in tracks.iter_mut().enumerate() {
                    *out = match t {
                        KICK_TRACK => kick,
                        SNARE_TRACK => snare,
                        CLOSED_HAT_TRACK => closed,
                        OPEN_HAT_TRACK => open,
                        CLICK_TRACK => click,
                        _ => 0.0,
                    };
                }
            }
        }
    }
}
