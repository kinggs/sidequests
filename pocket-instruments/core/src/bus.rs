//! §18 (D67 items 2 and 3): the bus and the seven sound effects. The sounds switched into the
//! effects (`fx_sounds`, §17) are summed into the bus; an effect acts on the bus only, and is
//! mixed back in with a 2 ms ramp. While no sound effect is heard and the ramp is at 0 the mix
//! is §13's, the same bytes as before the bus existed.
//!
//! Only `+ - * /` and conversions, as in `voice.rs`: the same bits on every host (§11).
//!
//! Ported, not linked (D67 item 3; REFERENCES.md R56). Read from Emilie Gillet's stmlib
//! (`dsp/filter.h` at d18def8: the state-variable filter `Svf::Process` and the polynomial
//! `OnePole::tan<FREQUENCY_FAST>`; `dsp/dsp.h`: `SoftLimit` and `SoftClip`) and Plaits
//! (`plaits/dsp/fx/sample_rate_reducer.h` at eurorack f4cfa76: the hold on a phase
//! accumulator, here without its polyBLEP, as ENGINE.md §18 has it) and written again in Rust.
//! Their notice:
//!
//! Copyright 2014 Emilie Gillet.
//!
//! Author: Emilie Gillet (emilie.o.gillet@gmail.com)
//!
//! Permission is hereby granted, free of charge, to any person obtaining a copy
//! of this software and associated documentation files (the "Software"), to deal
//! in the Software without restriction, including without limitation the rights
//! to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//! copies of the Software, and to permit persons to whom the Software is
//! furnished to do so, subject to the following conditions:
//!
//! The above copyright notice and this permission notice shall be included in
//! all copies or substantial portions of the Software.
//!
//! THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//! IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//! FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//! AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//! LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//! OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//! THE SOFTWARE.
//!
//! (`dsp/dsp.h` carries the same notice dated 2012.) The rest of this file is ours, under
//! the crate's licence. SPDX-License-Identifier: MIT

use crate::clock::TICKS_PER_STEP;
use crate::seq::TRACKS;

// ---- TUNING THE EFFECTS: every number here is a first value for the owner's ear (§18) ----

/// Effect 1: the hold's rate in hertz, whatever the engine's rate.
pub const REDUCE_HZ: u32 = 6000;
/// Effect 2: the drive into the soft clip, and the level after it.
pub const DRIVE: f32 = 6.0;
pub const DRIVE_LEVEL: f32 = 0.7;
/// Effect 3: levels a unit.
pub const CRUSH_LEVELS: f32 = 12.0;
/// Effects 5 and 7: the fixed cutoffs, in hertz.
pub const LOWPASS_HZ: f32 = 600.0;
pub const HIPASS_HZ: f32 = 2000.0;
/// Effects 6 and 8: where a sweep starts, and the constant its cutoff is multiplied by once a
/// tick. Each constant is (end / start) to the power 1 / 1536, worked out once off the engine
/// (python3: `(200/8000)**(1/1536)`, `(4000/100)**(1/1536)`) and rounded to an f32, so no
/// exponential is computed here. After 1535 ticks the low sweep is at 200.5 Hz and the high one
/// at 3990 Hz; the 1536th starts it again.
pub const LOW_SWEEP_FROM_HZ: f32 = 8000.0;
pub const LOW_SWEEP_BY: f32 = 0.997_601_27;
pub const HIGH_SWEEP_FROM_HZ: f32 = 100.0;
pub const HIGH_SWEEP_BY: f32 = 1.002_404_5;
/// Sixteen steps of ticks: a sweep's length, then it starts again.
pub const SWEEP_TICKS: u32 = 16 * TICKS_PER_STEP;
// `Bus::swept` is a u16 (Session 24): a sweep must fit in it.
const _: () = assert!(SWEEP_TICKS <= u16::MAX as u32);
/// The filter's damping, `r` in stmlib (1 / Q), as `voice.rs` uses the word ⚠.
pub const DAMPING: f32 = 0.5;
/// The filter's `f = cutoff / rate` is held to this at most.
pub const F_MAX: f32 = 0.3;
/// The ramp: 0 to 1 in 2 ms, so `RAMP_PER_SECOND / rate` a frame.
pub const RAMP_PER_SECOND: f32 = 500.0;

// stmlib's `OnePole::tan<FREQUENCY_FAST>`: its constants are a float literal times powers of
// pi made in double, left to right as its macros expand, then rounded to a float. Rust's
// const arithmetic is IEEE's, so these are stmlib's bits.
const PI: f64 = core::f64::consts::PI;
const PI_F: f32 = PI as f32;
const TAN_A: f32 = (0.326_f32 as f64 * PI * PI * PI) as f32;
const TAN_B: f32 = (0.1823_f32 as f64 * PI * PI * PI * PI * PI) as f32;

/// tan(pi f), as stmlib's fast polynomial, fitted for 16 Hz to 16 kHz at 48 kHz.
#[inline]
fn tan(f: f32) -> f32 {
    let f2 = f * f;
    f * (PI_F + f2 * (TAN_A + TAN_B * f2))
}

/// stmlib's `SoftClip`: `SoftLimit` inside ±3, ±1 beyond.
#[inline]
fn soft_clip(x: f32) -> f32 {
    if x < -3.0 {
        -1.0
    } else if x > 3.0 {
        1.0
    } else {
        x * (27.0 + x * x) / (27.0 + 9.0 * x * x)
    }
}

/// Whether an effect is one the core sounds on the bus (§18's table). 4 and 9 to 16 are not:
/// the repeats are the sequencer's (§17), the rest wait (D67 item 4).
#[inline]
pub fn is_sound_effect(effect: u8) -> bool {
    matches!(effect, 1 | 2 | 3 | 5 | 6 | 7 | 8)
}

/// §19: set on an effect's number while it is the host's and takes the dry's place (ABI 11,
/// D88 item 8: an insert, an effect whose sound is silence). Such an effect has no state of
/// ours. (Until ABI 11 its sound was the loop's channel 17, and the bus crossed over to it.)
pub const OUTSIDE: u8 = 0x80;

/// Effects that share state: the four filters are one filter (§18), each other its own; and
/// every outside effect is one kind, with none.
#[inline]
fn family(effect: u8) -> u8 {
    match effect {
        e if e & OUTSIDE != 0 => OUTSIDE,
        5..=8 => 5,
        e => e,
    }
}

pub struct Bus {
    /// The effect running: the one heard, or the one ramping out. 0: idle, §13's mix.
    on: u8,
    /// The sound effect heard last frame, 0 for none: a change starts a sweep again.
    heard: u8,
    /// The ramp, 0 to 1.
    w: f32,
    /// The rate `step` and the filter's coefficients were made for; 0 before any.
    rate: u32,
    step: f32,
    /// Effect 1: the phase accumulator and the sample held.
    acc: u32,
    held: f32,
    /// Effects 5 to 8: the filter's two states and coefficients, its cutoff in hertz, ticks
    /// into a sweep, and whether `g` and `h` are the cutoff's. `swept` counts to 1536 at most,
    /// so a u16: the two bytes it gave up hold `route`'s fifth mask, and the bus, and so the
    /// engine around it, keep their size and layout (Session 24, measured: `LEARNINGS.md`).
    s1: f32,
    s2: f32,
    g: f32,
    h: f32,
    cutoff: f32,
    swept: u16,
    tuned: bool,
    /// §19, the engine's to set, kept here because the loop's frame is mixed here, and so
    /// that the engine's own fields stay where they were (the voices' place in memory is
    /// worth a nanosecond a frame: measured, Session 18). What `ROUTE` set, by its `a`: the
    /// sounds taken from the input; the effects that are the host's (bit n - 1: effect n); the
    /// sounds whose A, and whose B, come from the input at a hit; and (ABI 11) the effects of
    /// the host's that take the dry's place. The patch's to keep: not saved, and no generation.
    pub route: [u16; 5],
    /// §19's addition: what the thirty-two slider outputs say, A for sounds 1 to 16 then B,
    /// 0 to 1: each sound's own until it is hit, then what it was last hit with by the
    /// instrument's own reckoning, before any input took its place.
    pub outs: [f32; 2 * TRACKS],
}

/// A slider in the middle, where `pi_init` puts every one: 32768 of 65535.
const MIDDLE: f32 = 32_768.0 / 65_535.0;

impl Bus {
    pub const fn new() -> Self {
        Bus {
            on: 0,
            heard: 0,
            w: 0.0,
            rate: 0,
            step: 0.0,
            acc: 0,
            held: 0.0,
            s1: 0.0,
            s2: 0.0,
            g: 0.0,
            h: 0.0,
            cutoff: 0.0,
            swept: 0,
            tuned: false,
            route: [0; 5],
            outs: [MIDDLE; 2 * TRACKS],
        }
    }

    /// For the rule tests: the effect running, the ramp, the cutoff, the filter's two states.
    #[cfg(test)]
    pub fn probe(&self) -> (u8, f32, f32, f32, f32) {
        (self.on, self.w, self.cutoff, self.s1, self.s2)
    }

    /// No effect running and the ramp at 0: the mix is §13's.
    #[inline]
    pub fn idle(&self) -> bool {
        self.on == 0
    }

    /// An effect's state, cleared when it starts from idle or from another family ⚠ (§18
    /// says "cleared when an effect starts from idle, and kept from one filter effect to the
    /// next").
    fn clear(&mut self, effect: u8) {
        match family(effect) {
            1 => {
                self.acc = 0;
                self.held = 0.0;
            }
            5 => {
                self.s1 = 0.0;
                self.s2 = 0.0;
            }
            _ => {}
        }
    }

    /// Once a frame, after the frame's ticks and before its sound. `effect` is what is heard
    /// if the core sounds it (§18), else 0; `ticks` is how many the clock emitted this frame.
    #[inline]
    pub fn advance(&mut self, effect: u8, ticks: u32, rate: u32) {
        if effect == 0 && self.on == 0 {
            return; // idle: one comparison
        }
        self.frame(effect, ticks, rate);
    }

    // Out of line, so the idle path inlined into the frame loop is the comparison alone.
    #[inline(never)]
    fn frame(&mut self, effect: u8, ticks: u32, rate: u32) {
        if rate != self.rate {
            self.rate = rate;
            self.step = RAMP_PER_SECOND / rate.max(1) as f32;
            self.tuned = false;
        }
        if effect != 0 && effect != self.heard {
            // Heard became this effect: a sweep's place starts again (§18), on this frame,
            // after its ticks ⚠.
            if self.on == 0 || family(self.on) != family(effect) {
                self.clear(effect);
            }
            self.on = effect;
            self.swept = 0;
            self.cutoff = match effect {
                5 => LOWPASS_HZ,
                6 => LOW_SWEEP_FROM_HZ,
                7 => HIPASS_HZ,
                _ => HIGH_SWEEP_FROM_HZ, // 8; the others have no cutoff
            };
            self.tuned = false;
        } else if (self.on == 6 || self.on == 8) && ticks != 0 {
            // A sweep moves in musical time: a multiply a tick, never an exponential.
            let (from, by) = if self.on == 6 { (LOW_SWEEP_FROM_HZ, LOW_SWEEP_BY) } else { (HIGH_SWEEP_FROM_HZ, HIGH_SWEEP_BY) };
            for _ in 0..ticks {
                self.swept += 1;
                if self.swept as u32 >= SWEEP_TICKS {
                    self.swept = 0;
                    self.cutoff = from;
                } else {
                    self.cutoff *= by;
                }
            }
            self.tuned = false;
        }
        self.heard = effect;

        if effect != 0 {
            self.w += self.step;
            if self.w > 1.0 {
                self.w = 1.0;
            }
        } else {
            self.w -= self.step;
            if self.w <= 0.0 {
                // Ramped out: idle again, §13's mix from this frame.
                self.w = 0.0;
                self.on = 0;
                return;
            }
        }

        if family(self.on) == 5 && !self.tuned {
            let mut f = self.cutoff / self.rate.max(1) as f32;
            if f > F_MAX {
                f = F_MAX;
            }
            self.g = tan(f);
            self.h = 1.0 / (1.0 + DAMPING * self.g + self.g * self.g);
            self.tuned = true;
        }
    }

    /// The effect's output for one frame of the bus. `outside` is what an effect of the
    /// host's gives: silence in a loop layout (an insert, ABI 11), and the bus itself in a
    /// layout with no loop, where nothing ducks it.
    #[inline]
    fn wet(&mut self, x: f32, outside: f32) -> f32 {
        if self.on & OUTSIDE != 0 {
            return outside;
        }
        match self.on {
            1 => {
                // Plaits' sample-rate reducer, without its polyBLEP: in hertz at any rate.
                self.acc += REDUCE_HZ;
                if self.acc >= self.rate {
                    self.acc %= self.rate.max(1);
                    self.held = x;
                }
                self.held
            }
            2 => soft_clip(DRIVE * x) * DRIVE_LEVEL,
            // Towards zero, so silence stays silent. A cast saturates in Rust, natively and in
            // WebAssembly alike.
            3 => (CRUSH_LEVELS * x) as i32 as f32 / CRUSH_LEVELS,
            _ => {
                // stmlib's Svf::Process, in its order.
                let (g, s1, s2) = (self.g, self.s1, self.s2);
                let hp = (x - DAMPING * s1 - g * s1 - s2) * self.h;
                let bp = g * hp + s1;
                self.s1 = g * hp + bp;
                let lp = g * bp + s2;
                self.s2 = g * bp + lp;
                if self.on <= 6 { lp } else { hp }
            }
        }
    }

    /// §18's mix while an effect runs: `(rest + bus + w (wet - bus)) × gain`, each sum in
    /// track order. Out of line, as `frame` is.
    #[inline(never)]
    pub fn mix(&mut self, v: &[f32; TRACKS], fx_sounds: u16, gain: f32) -> f32 {
        let (mut rest, mut bus) = (0.0f32, 0.0f32);
        for (t, s) in v.iter().enumerate() {
            if fx_sounds >> t & 1 == 1 {
                bus += *s;
            } else {
                rest += *s;
            }
        }
        // No loop in this layout, so an insert still ramping out (its host's cables pulled)
        // ducks nothing: the bus as it is (§19, designed 2026-11-24).
        let wet = self.wet(bus, bus);
        (rest + bus + self.w * (wet - bus)) * gain
    }

    /// §19: one frame of a loop layout, read and written in place. In: channels 0 to 15, of
    /// which only the sounds in `returned` are read, each taking its own voice's place in the
    /// bus or the rest; and channel 17, FX RETURN, read on every frame (ABI 11) and added
    /// last, before the volume: `(dry + back) × gain`, where `dry` is §18's mix before the
    /// volume. Exactly 0 back adds nothing, so with nothing returned and nothing running the
    /// mix is §13's sum, the same bytes (a mix of −0 stays −0). What comes back is in no bus,
    /// no effect and no output channel but the mix. Out: the sixteen voices as they are, the
    /// mix, and the bus before any effect and before the volume. An input that is not a
    /// number is silence: one NaN would otherwise stay in a filter. And in the layout that has
    /// them, the thirty-two slider outputs after those.
    #[inline(never)]
    pub fn looped(&mut self, frame: &mut [f32], v: &[f32; TRACKS], fx_sounds: u16, gain: f32) {
        let returned = self.route[0];
        let Some((io, sliders)) = frame.split_first_chunk_mut::<{ TRACKS + 2 }>() else {
            return;
        };
        if sliders.len() == self.outs.len() {
            sliders.copy_from_slice(&self.outs);
        }
        let clean = |x: f32| if x.is_finite() { x } else { 0.0 };
        let mut m = *v;
        if returned != 0 {
            for (t, s) in m.iter_mut().enumerate() {
                if returned >> t & 1 == 1 {
                    *s = clean(io[t]);
                }
            }
        }
        let (mut rest, mut bus) = (0.0f32, 0.0f32);
        for (t, s) in m.iter().enumerate() {
            if fx_sounds >> t & 1 == 1 {
                bus += *s;
            } else {
                rest += *s;
            }
        }
        let dry = if self.on == 0 {
            let mut sum = m[0];
            for s in &m[1..] {
                sum += *s;
            }
            sum
        } else {
            // An insert's sound is silence: §18's ramp takes the bus out, and back in after.
            let wet = self.wet(bus, 0.0);
            rest + bus + self.w * (wet - bus)
        };
        let back = clean(io[TRACKS + 1]);
        let mix = if back == 0.0 { dry * gain } else { (dry + back) * gain };
        io[..TRACKS].copy_from_slice(v);
        io[TRACKS] = mix;
        io[TRACKS + 1] = bus;
    }
}
