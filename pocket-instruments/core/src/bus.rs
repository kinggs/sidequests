//! §18 (D67 items 2 and 3): the bus and the seven sound effects. The sounds switched into the
//! effects (`fx_sounds`, §17) are summed into the bus; an effect acts on the bus only, and is
//! mixed back in with a 2 ms ramp. While no sound effect is heard and the ramp is at 0 the mix
//! is §13's, the same bytes as before the bus existed. Since ABI 12 effect 4 echoes in a line
//! the host lends, and since ABI 13 effect 14 feeds the bus back in the first tenth of it.
//!
//! Only `+ - * /` and conversions, as in `voice.rs`: the same bits on every host (§11).
//!
//! Ported, not linked (D67 item 3; REFERENCES.md R56). Read from Emilie Gillet's stmlib
//! (`dsp/filter.h` at d18def8: the state-variable filter `Svf::Process` and the polynomial
//! `OnePole::tan<FREQUENCY_FAST>`) and written again in Rust. (Until ABI 14 effect 1 was also
//! read from Plaits, `plaits/dsp/fx/sample_rate_reducer.h` at eurorack f4cfa76: the hold on a
//! phase accumulator, without its polyBLEP. Effect 1 is now the voices slowed, §18, designed
//! 2026-11-25, and ours; its grid keeps the accumulator's idea.) Their notice:
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
//! (Until ABI 12 effect 2 also used `SoftLimit` and `SoftClip` from `dsp/dsp.h`, under the
//! same notice dated 2012; §18, designed 2026-11-24, replaced them with a plain clip.) The
//! rest of this file is ours, under the crate's licence. SPDX-License-Identifier: MIT

use crate::clock::TICKS_PER_STEP;
use crate::seq::TRACKS;

// ---- TUNING THE EFFECTS: every number here is a first value for the owner's ear (§18) ----

// §18, designed 2026-11-24 (ABI 12; D90, D91): retuned to the PO-12's measurements
// (REFERENCES.md R64 to R69). Each was, before: 6 000 Hz; SoftLimit(6 × bus) × 0.7; twelve
// levels a unit, towards zero; 600 Hz and 2 kHz at `r` 0.5; sweeps of 1 536 ticks, one way.
// Then Session 26 read ours with harness/hardware-fx.py as the PO-12 was read, and moved three
// (ENGINE.md §18's table says was, now and both readings): the ceiling 1 → 0.88, the crush
// 4 → 4.6 levels a unit, effect 6's top 2 500 → 3 240 Hz. Session 30 (D95 item 4, R73, take
// c): the sweeps six steps round, not nine; 6 from 2 700 (3 240) to 165 Hz (190); 8 up to
// 3 300 Hz (2 900); both sweeps at Q 4.5; 5 at 210 Hz (300) and Q 3 (2). Session 32 (ABI 14,
// D98): effect 1 is no longer a hold here and has no constant for the ear: the voices slowed to
// a quarter (`SLOW_RATE`, below; voice.rs). Read beside the PO-12 on take c, nothing to move
// (ENGINE.md §18, "Built (Session 32)"). If the ear asks for less above 10 kHz, a low-pass
// after the line is the next step (D98 item 10).

/// Effect 1 (ABI 14; §18, designed 2026-11-25: D98, R72, R77): the voices in the effects are
/// tuned for this rate and asked for a value on a grid a quarter of it, with a straight line
/// between values: a quarter speed at every host rate, the same values at every host rate. Was
/// a hold at `REDUCE_HZ` (6 000 Hz, then 1 000 from ABI 12), on the bus. Not a tuning: R69's
/// reading of the PO-12's rate (46 875 Hz) and R72's quarter. Nothing here is for the ear.
pub const SLOW_RATE: u32 = 46_875;
/// The grid: a value every `QUARTER` of the slow rate's samples.
pub const QUARTER: u64 = 4;
/// Effect 2: the gain into the clip at ±`CEILING` (2.12 times our kick's peak, as the PO-12's
/// is its kick's: Session 26).
pub const DRIVE: f32 = 3.0;
pub const CEILING: f32 = 0.88;
/// Effect 3: levels a unit, `(floor(CRUSH_LEVELS × bus) + 0.5) / CRUSH_LEVELS`: a step of
/// the kick's peak / 1.9 and about a quarter of the ceiling, resting half a step off zero.
pub const CRUSH_LEVELS: f32 = 4.6;
/// Effects 5 and 7: the fixed cutoffs, in hertz.
pub const LOWPASS_HZ: f32 = 210.0;
pub const HIPASS_HZ: f32 = 1800.0;
/// The filter's `r` (stmlib's 1 / Q, as `voice.rs` uses "damping"), by the effect: 5 at Q 3,
/// 7 at Q 6, the two sweeps at Q 4.5 (Session 30; was 0.5 for 5 and 6, 1/6 for 7 and 8).
pub const LOWPASS_R: f32 = 1.0 / 3.0;
pub const HIPASS_R: f32 = 1.0 / 6.0;
pub const SWEEP_R: f32 = 1.0 / 4.5;
/// Effects 6 and 8: a sweep's two ends, out from `*_FROM_HZ` to `*_TO_HZ` over `SWEEP_HALF`
/// ticks and back over as many, then again. Each constant is (end / start) to the power
/// 1 / 288, worked out once off the engine (Session 30, Python) and rounded to an f32, so no
/// exponential is computed here; both ends are set exactly, so no rounding builds up.
pub const LOW_SWEEP_FROM_HZ: f32 = 2700.0;
pub const LOW_SWEEP_TO_HZ: f32 = 165.0;
pub const LOW_SWEEP_OUT: f32 = 0.990_341_84;
pub const LOW_SWEEP_BACK: f32 = 1.009_752_3;
pub const HIGH_SWEEP_FROM_HZ: f32 = 220.0;
pub const HIGH_SWEEP_TO_HZ: f32 = 3300.0;
pub const HIGH_SWEEP_OUT: f32 = 1.009_447_3;
pub const HIGH_SWEEP_BACK: f32 = 0.990_641_1;
/// Effect 4: one echo of the bus, `ECHO_FRAMES_NUM / ECHO_FRAMES_DEN` seconds ago (8 192
/// samples at 46 875 Hz, 174.76 ms: a buffer's length, not a note's, D91 item 5), at this
/// level, no feedback. The line is the host's (`pi_set_delay`).
pub const ECHO_LEVEL: f32 = 0.15;
pub const ECHO_FRAMES_NUM: u64 = 8192;
pub const ECHO_FRAMES_DEN: u64 = 46_875;

/// Effect 14 (ABI 13; §18, designed 2026-11-24: D93, R70): "feedback", one loop on the bus
/// `FEEDBACK_FRAMES_NUM / ECHO_FRAMES_DEN` seconds round (858 samples at 46 875 Hz, 18.30 ms),
/// in the first `comb` floats of effect 4's line; through the bus's filter, its band output at
/// `FEEDBACK_HZ` and `FEEDBACK_R`; `FEEDBACK_GAIN` into it (1.12 a round at the centre), what
/// goes round held to ±`FEEDBACK_CEILING`; standing still after a thousandth of a second of
/// exact zero on the bus (`STILL_PER_SECOND`). The ceiling is a model's first value; the rest
/// is measured (R70). Session 28 read ours with harness/hardware-fx.py as the PO-12 was read
/// and moved the gain 2.24 → 2.05 (1.025 a round at the centre): at 2.24 the ring read +47 and
/// +40 dB at 1 kHz on takes a and b against the PO-12's +29 and +18; at 2.05, +30 and +22
/// (ENGINE.md §18's table has every reading).
pub const FEEDBACK: u8 = 14;
pub const FEEDBACK_FRAMES_NUM: u64 = 858;
pub const FEEDBACK_HZ: f32 = 1093.0;
pub const FEEDBACK_R: f32 = 2.0;
pub const FEEDBACK_GAIN: f32 = 2.05;
pub const FEEDBACK_CEILING: f32 = 0.25;
pub const STILL_PER_SECOND: u32 = 1000;

/// Effect 14's loop in frames at `rate`, the nearest to 18.30 ms, in 64 bits: 807 at 44.1 kHz,
/// 879 at 48 kHz, 1 757 at 96 kHz. A tenth of `delay_frames` at every rate, so it fits the line.
#[inline]
pub const fn comb_frames(rate: u32) -> u32 {
    ((rate as u64 * FEEDBACK_FRAMES_NUM + ECHO_FRAMES_DEN / 2) / ECHO_FRAMES_DEN) as u32
}

/// `pi_delay_frames`: the nearest frame to 174.76 ms at `rate`, in 64 bits. 7 707 at 44.1 kHz,
/// 8 389 at 48 kHz, 16 777 at 96 kHz. Fits a u32 for any u32 rate.
#[inline]
pub const fn delay_frames(rate: u32) -> u32 {
    ((rate as u64 * ECHO_FRAMES_NUM + ECHO_FRAMES_DEN / 2) / ECHO_FRAMES_DEN) as u32
}

/// Three steps of ticks out, as many back: a cycle of six steps (R73; nine before Session 30).
pub const SWEEP_HALF: u16 = (6 * TICKS_PER_STEP / 2) as u16;
// `Bus::swept` is a u16 (Session 24): a sweep's cycle must fit in it.
const _: () = assert!(2 * SWEEP_HALF as u32 == 6 * TICKS_PER_STEP);
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

/// Whether an effect is one the core sounds on the bus (§18's table). 4 and 14 only while a
/// line is lent (`lent`: `Bus::lent`, ABI 12 and 13); 9 to 13 are the sequencer's (§17), and
/// 15 and 16 wait (D67 item 4).
#[inline]
pub fn is_sound_effect(effect: u8, lent: bool) -> bool {
    match effect {
        1 | 2 | 3 | 5 | 6 | 7 | 8 => true,
        4 | FEEDBACK => lent,
        _ => false,
    }
}

/// §19: set on an effect's number while it is the host's and takes the dry's place (ABI 11,
/// D88 item 8: an insert, an effect whose sound is silence). Such an effect has no state of
/// ours. (Until ABI 11 its sound was the loop's channel 17, and the bus crossed over to it.)
pub const OUTSIDE: u8 = 0x80;

/// Effects that share state: the four filters are one filter (§18), each other its own (14
/// too: it uses the filter's fields and 4's line, but is a kind of its own, D77); and every
/// outside effect is one kind, with none.
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
    /// Effect 1: the phase accumulator, the grid's since ABI 14 (`held` is not used since then:
    /// kept so the fields after it stay where they were). Effect 14 (ABI 13): `acc` holds
    /// `comb`, the loop's length in frames, made with `g` and `h`; and `swept` holds `still`,
    /// frames of exact zero on the bus, counted to a millisecond's and held there. Both are
    /// free while 14 runs, so the bus keeps its size and layout (§18 asked for no new field).
    acc: u32,
    #[allow(dead_code)]
    held: f32,
    /// Effects 5 to 8: the filter's two states and coefficients, its cutoff in hertz, ticks
    /// into a sweep, and whether `g` and `h` are the cutoff's. `swept` counts to 864 at most,
    /// so a u16: the two bytes it gave up hold `route`'s fifth mask, and the bus, and so the
    /// engine around it, keep their size and layout (Session 24, measured: `LEARNINGS.md`).
    s1: f32,
    s2: f32,
    g: f32,
    h: f32,
    cutoff: f32,
    swept: u16,
    tuned: bool,
    /// Effect 4 (ABI 12): the host's line and how much of it is used, `delay_frames` of the
    /// rate it was lent at (0 and null: none lent); where the next frame is written, and
    /// whether the line has gone round once, so nothing is read that this run did not write.
    line: *mut f32,
    delay: u32,
    head: u32,
    full: bool,
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
    /// Effect 1 (ABI 14; §18, designed 2026-11-25), the bus's last fields: what the grid said
    /// this frame, `fresh` (a slowed sound is asked for its next value) and `mu` (how far the
    /// frame is past the grid's last point, 0 to 1); `inv`, 1 / (4 × rate), made with the rate;
    /// `slowed`, the sounds slowed (`fx_sounds` while the effect the core sounds is 1, else 0:
    /// the engine's to set, with `Voices::slow`); and each slowed sound's last two grid values.
    pub fresh: bool,
    pub mu: f32,
    inv: f32,
    pub slowed: u16,
    pub from: [f32; TRACKS],
    pub to: [f32; TRACKS],
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
            line: core::ptr::null_mut(),
            delay: 0,
            head: 0,
            full: false,
            route: [0; 5],
            outs: [MIDDLE; 2 * TRACKS],
            fresh: false,
            mu: 0.0,
            inv: 0.0,
            slowed: 0,
            from: [0.0; TRACKS],
            to: [0.0; TRACKS],
        }
    }

    /// For the rule tests: the effect running, the ramp, the cutoff, the filter's two states.
    #[cfg(test)]
    pub fn probe(&self) -> (u8, f32, f32, f32, f32) {
        (self.on, self.w, self.cutoff, self.s1, self.s2)
    }

    /// For the rule tests: effect 4's head and whether the line has gone round.
    #[cfg(test)]
    pub fn echo_state(&self) -> (u32, bool) {
        (self.head, self.full)
    }

    /// For the rule tests: the filter's `g` and `h`.
    #[cfg(test)]
    pub fn tuning(&self) -> (f32, f32) {
        (self.g, self.h)
    }

    /// The filter's `r`, by the effect running (Session 30, D95 item 4): and 14's band output
    /// (ABI 13). Asked for only when the filter is made again, never a frame.
    #[inline]
    fn r(&self) -> f32 {
        match self.on {
            5 => LOWPASS_R,
            7 => HIPASS_R,
            FEEDBACK => FEEDBACK_R,
            _ => SWEEP_R, // 6 and 8
        }
    }

    /// Effect 4's line (ABI 12), `delay` floats of the host's: kept, and written inside
    /// `pi_process` only. Lending clears where the echo is, so junk in it is never heard.
    pub fn lend(&mut self, line: *mut f32, delay: u32) {
        self.line = line;
        self.delay = delay;
        self.head = 0;
        self.full = false;
    }

    /// No line: refused, or the rate changed (the host lends again for the new one).
    pub fn forget(&mut self) {
        self.lend(core::ptr::null_mut(), 0);
    }

    /// Whether a line is lent, so effect 4 is one the core sounds.
    #[inline]
    pub fn lent(&self) -> bool {
        self.delay != 0
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
            1 => self.acc = 0, // the grid, from its point 0
            4 => {
                self.head = 0;
                self.full = false;
            }
            FEEDBACK => {
                self.head = 0;
                self.full = false;
                self.s1 = 0.0;
                self.s2 = 0.0;
                self.swept = 0; // `still`
            }
            5 => {
                self.s1 = 0.0;
                self.s2 = 0.0;
            }
            _ => {}
        }
    }

    /// Effect 1 (§18, designed 2026-11-25): a sound became slowed, so the grid starts again:
    /// this frame is fresh for every slowed sound, with `mu` 0.
    #[inline]
    pub fn restart(&mut self) {
        self.acc = 0;
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
            self.inv = 1.0 / (QUARTER * rate.max(1) as u64) as f32;
            self.tuned = false;
        }
        if effect != 0 && effect != self.heard {
            // Heard became this effect: a sweep's place starts again (§18), on this frame,
            // after its ticks ⚠.
            if self.on == 0 || family(self.on) != family(effect) {
                self.clear(effect);
            }
            self.on = effect;
            if effect != FEEDBACK {
                // 14 keeps `still` here when heard again inside its ramp; `clear` empties it.
                self.swept = 0;
            }
            self.cutoff = match effect {
                5 => LOWPASS_HZ,
                6 => LOW_SWEEP_FROM_HZ,
                7 => HIPASS_HZ,
                FEEDBACK => FEEDBACK_HZ,
                _ => HIGH_SWEEP_FROM_HZ, // 8; the others have no cutoff
            };
            self.tuned = false;
        } else if (self.on == 6 || self.on == 8) && ticks != 0 {
            // A sweep moves in musical time: a multiply a tick, never an exponential. Out to
            // the far end, back, and again; each end set exactly (§18, designed 2026-11-24).
            let (from, to, out, back) = if self.on == 6 {
                (LOW_SWEEP_FROM_HZ, LOW_SWEEP_TO_HZ, LOW_SWEEP_OUT, LOW_SWEEP_BACK)
            } else {
                (HIGH_SWEEP_FROM_HZ, HIGH_SWEEP_TO_HZ, HIGH_SWEEP_OUT, HIGH_SWEEP_BACK)
            };
            for _ in 0..ticks {
                self.swept += 1;
                if self.swept == 2 * SWEEP_HALF {
                    self.swept = 0;
                    self.cutoff = from;
                } else if self.swept == SWEEP_HALF {
                    self.cutoff = to;
                } else if self.swept < SWEEP_HALF {
                    self.cutoff *= out;
                } else {
                    self.cutoff *= back;
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

        if self.on == 1 {
            // Effect 1's grid (§18, designed 2026-11-25), once a frame while the bus runs it,
            // through its ramp out too. In 64 bits, kept as a u32: below 4 × rate.
            self.fresh = self.acc < SLOW_RATE;
            self.mu = self.acc as f32 * self.inv;
            self.acc = ((self.acc as u64 + SLOW_RATE as u64) % (QUARTER * self.rate.max(1) as u64)) as u32;
        }

        if (family(self.on) == 5 || self.on == FEEDBACK) && !self.tuned {
            let mut f = self.cutoff / self.rate.max(1) as f32;
            if f > F_MAX {
                f = F_MAX;
            }
            self.g = tan(f);
            self.h = 1.0 / (1.0 + self.r() * self.g + self.g * self.g);
            if self.on == FEEDBACK {
                self.acc = comb_frames(self.rate); // `comb`, never worked out in the frame
            }
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
            // Effect 4, out of line (Session 26's bench chose this place: `ENGINE.md` §18).
            4 => self.echo(x),
            // Effect 1 is in the voices (§18, designed 2026-11-25): the bus runs it only to keep
            // the grid, so its wet is the bus itself and the ramp adds `w × 0`.
            1 => x,
            2 => {
                let y = DRIVE * x;
                if y > CEILING {
                    CEILING
                } else if y < -CEILING {
                    -CEILING
                } else {
                    y
                }
            }
            3 => {
                // The floor by a cast and a compare: a cast saturates, natively and in
                // WebAssembly alike, and nothing here is a NaN (D80 item 4). Silence is +1/8.
                let y = CRUSH_LEVELS * x;
                let mut t = y as i32 as f32;
                if t > y {
                    t -= 1.0;
                }
                (t + 0.5) / CRUSH_LEVELS
            }
            _ => {
                // stmlib's Svf::Process, in its order.
                let (g, s1, s2, r) = (self.g, self.s1, self.s2, self.r());
                let hp = (x - r * s1 - g * s1 - s2) * self.h;
                let bp = g * hp + s1;
                self.s1 = g * hp + bp;
                let lp = g * bp + s2;
                self.s2 = g * bp + lp;
                if self.on <= 6 { lp } else { hp }
            }
        }
    }

    /// Effect 4's output for one frame of the bus: the bus and the echo of it from the line
    /// (§18, designed 2026-11-24). Out of line, called from `wet`: inlined there, the loop
    /// layouts cost 20 ns a frame more with no effect running (Session 25); asked for before
    /// `wet` in `mix` and `looped`, as designed, every case read 1 to 2 ns more than this
    /// (Session 26, measured: `LEARNINGS.md`).
    #[inline(never)]
    fn echo(&mut self, x: f32) -> f32 {
        if self.delay == 0 {
            // ⚠ The line was forgotten (a rate change) while 4 ramps out: no echo, nothing
            // read or written; the ramp finishes on the plain bus.
            return x;
        }
        // SAFETY: `lend` was given at least `delay` floats (`pi_set_delay` checks), which the
        // host keeps alive and does not touch until it lends again; `head < delay`.
        let slot = unsafe { &mut *self.line.add(self.head as usize) };
        let echo = if self.full { *slot } else { 0.0 };
        *slot = x;
        self.head += 1;
        if self.head == self.delay {
            self.head = 0;
            self.full = true;
        }
        x + ECHO_LEVEL * echo
    }

    /// Effect 14's output for one frame of the bus (§18, designed 2026-11-24: ABI 13; D93):
    /// the bus and what came round the loop. Out of line, and asked for before `wet` in `mix`
    /// and `looped`, not from inside it as `echo` is: called from `wet`, `wet` stopped being
    /// inlined and the four loop layouts cost 13 to 19 ns a frame more with no effect running;
    /// asked for before it, every case is the old build's (Session 28, measured: `LEARNINGS.md`).
    #[inline(never)]
    fn feedback(&mut self, x: f32) -> f32 {
        if self.delay == 0 {
            // A rate change while 14 ramps out forgot the line: the bus, as built for 4.
            return x;
        }
        // `still`: exact zero counts, anything else starts again; held at a millisecond's, so
        // it cannot wrap. While it is there nothing is read, written or filtered.
        if x == 0.0 {
            if (self.swept as u32) * STILL_PER_SECOND < self.rate {
                self.swept += 1;
            }
        } else {
            self.swept = 0;
        }
        if (self.swept as u32) * STILL_PER_SECOND >= self.rate {
            return x;
        }
        // SAFETY: as `echo`'s: the line holds `delay` floats and `head < comb <= delay`.
        let slot = unsafe { &mut *self.line.add(self.head as usize) };
        let back = if self.full { *slot } else { 0.0 };
        // stmlib's Svf::Process, in its order, fed what came round; its band output.
        let (g, s1, s2) = (self.g, self.s1, self.s2);
        let hp = (back - FEEDBACK_R * s1 - g * s1 - s2) * self.h;
        let bp = g * hp + s1;
        self.s1 = g * hp + bp;
        let lp = g * bp + s2;
        self.s2 = g * bp + lp;
        let mut fb = FEEDBACK_GAIN * bp;
        if fb > FEEDBACK_CEILING {
            fb = FEEDBACK_CEILING;
        } else if fb < -FEEDBACK_CEILING {
            fb = -FEEDBACK_CEILING;
        }
        *slot = x + fb;
        self.head += 1;
        if self.head == self.acc {
            self.head = 0;
            self.full = true;
        }
        x + fb
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
        let wet = if self.on == FEEDBACK { self.feedback(bus) } else { self.wet(bus, bus) };
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
            let wet = if self.on == FEEDBACK { self.feedback(bus) } else { self.wet(bus, 0.0) };
            rest + bus + self.w * (wet - bus)
        };
        let back = clean(io[TRACKS + 1]);
        let mix = if back == 0.0 { dry * gain } else { (dry + back) * gain };
        io[..TRACKS].copy_from_slice(v);
        io[TRACKS] = mix;
        io[TRACKS + 1] = bus;
    }
}
