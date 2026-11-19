//! Sound (ENGINE.md §11, D44). The first voice, for P7: the click, key 10 in VOICES.md.
//! A short sine with an exponential decay.
//!
//! Floats live here and nowhere else. They decide what a sample is, never when anything
//! happens: pitch and time are integers until the last step.
//!
//! Only `+ - * /` and conversions are used, each one exactly rounded by IEEE 754, so a
//! native build and the WebAssembly build give the same bits. There is no `sin` or `exp`
//! from a maths library anywhere: those are where two platforms part company.

use crate::seq::TRACKS;

/// The track with a voice so far. Every other track is silent (VOICES.md, "Order of building").
pub const CLICK_TRACK: usize = 9;

/// A slider's middle.
pub const PARAM_DEFAULT: u16 = 32768;

/// Below this (-80 dB) a voice stops. It also keeps the decay away from denormals.
const SILENT: f32 = 0.0001;

/// sin(pi * x) for a phase that wraps: `phase` over the whole u32 is one turn.
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

#[derive(Clone, Copy)]
pub struct Click {
    phase: u32,
    inc: u32,
    env: f32,
    k: f32,
}

impl Click {
    pub const fn new() -> Self {
        Click { phase: 0, inc: 0, env: 0.0, k: 0.0 }
    }

    /// Slider A is pitch, 500 Hz to 2 kHz. Slider B is length, 5 to 40 ms, the time the
    /// click takes to fall 60 dB.
    fn tune(&mut self, a: u16, b: u16, rate: u32) {
        let rate = rate.max(1) as u64;
        let millihertz = 500_000 + a as u64 * 1_500_000 / 65_535;
        self.inc = ((millihertz << 32) / (1000 * rate)) as u32;
        let microseconds = 5_000 + b as u64 * 35_000 / 65_535;
        let frames = (microseconds * rate / 1_000_000).max(1);
        // 60 dB is ln(1000) = 6.9078 time constants. exp(-1/tau) as (2 tau - 1) / (2 tau + 1):
        // the same curve to within 1 part in 12 tau^2, from one division.
        let two_tau = 2.0 * (frames as u32 as f32) / 6.907_755_4;
        self.k = if two_tau > 1.0 { (two_tau - 1.0) / (two_tau + 1.0) } else { 0.0 };
    }

    fn trigger(&mut self, a: u16, b: u16, rate: u32) {
        self.tune(a, b, rate);
        self.phase = 0;
        self.env = 1.0;
    }

    #[inline]
    fn next(&mut self) -> f32 {
        if self.env == 0.0 {
            return 0.0;
        }
        let s = sine(self.phase) * self.env;
        self.phase = self.phase.wrapping_add(self.inc);
        self.env *= self.k;
        if self.env < SILENT {
            self.env = 0.0;
        }
        s
    }
}

pub struct Voices {
    click: Click,
    /// The two sliders of each track, 0 to 65535. Kept for all sixteen now, so the command
    /// and the memory do not change when the other voices arrive.
    pub params: [[u16; 2]; TRACKS],
}

impl Voices {
    pub const fn new() -> Self {
        Voices { click: Click::new(), params: [[PARAM_DEFAULT; 2]; TRACKS] }
    }

    /// The tracks that fired on this frame start their voices on this frame.
    #[inline]
    pub fn trigger(&mut self, fired: u16, rate: u32) {
        if fired >> CLICK_TRACK & 1 == 1 {
            let [a, b] = self.params[CLICK_TRACK];
            self.click.trigger(a, b, rate);
        }
    }

    /// A voice that is sounding keeps its pitch and length in seconds across a rate change.
    pub fn set_sample_rate(&mut self, rate: u32) {
        let [a, b] = self.params[CLICK_TRACK];
        self.click.tune(a, b, rate);
    }

    /// One frame. `frame` is `channels` floats: 1 is the mix, 16 is each track on its own.
    #[inline]
    pub fn render(&mut self, frame: &mut [f32]) {
        let click = self.click.next();
        match frame {
            [mix] => *mix = click,
            tracks => {
                for (t, out) in tracks.iter_mut().enumerate() {
                    *out = if t == CLICK_TRACK { click } else { 0.0 };
                }
            }
        }
    }
}
