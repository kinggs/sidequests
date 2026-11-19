//! §5. The sequencer never sees a frame: its output depends only on the order of ticks and
//! commands.

use crate::abi::{EV_STEP, EV_TRIG, Out};
use crate::clock::TICKS_PER_STEP;

pub const TRACKS: usize = 16;
pub const STEPS: usize = 16;
pub const SWING_MAX: u32 = 48;

/// What a snapshot holds of the sequencer.
pub struct Pattern {
    /// One word per track; bit `s` is step `s`.
    pub on: [u16; TRACKS],
    pub prob: [[u8; STEPS]; TRACKS],
    pub length: u8,
    pub swing: u8,
}

impl Pattern {
    pub const fn new() -> Self {
        Pattern { on: [0; TRACKS], prob: [[100; STEPS]; TRACKS], length: STEPS as u8, swing: 0 }
    }
}

/// xorshift32. The draw is the new state.
pub struct Rng(u32);

impl Rng {
    pub const fn new(seed: u32) -> Self {
        Rng(seed)
    }

    #[inline]
    pub fn draw(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
}

pub struct Seq {
    playing: bool,
    fresh: bool,
    pending: bool,
    cur: u8,
    offset: u8,
}

impl Seq {
    pub const fn new() -> Self {
        Seq { playing: false, fresh: false, pending: false, cur: 0, offset: 0 }
    }

    pub fn play(&mut self, on: bool) {
        if on {
            if !self.playing {
                self.playing = true;
                self.fresh = true;
            }
        } else {
            self.playing = false;
            self.pending = false;
        }
    }

    pub fn reset(&mut self) {
        self.fresh = true;
        self.pending = false;
    }

    #[inline]
    pub fn tick(&mut self, k: u32, pat: &Pattern, rng: &mut Rng, out: &mut Out) {
        if !self.playing {
            return;
        }
        let g = k / TICKS_PER_STEP;
        let t = (k % TICKS_PER_STEP) as u8;

        if t == 0 {
            if self.fresh {
                self.cur = 0;
                self.fresh = false;
            } else {
                self.cur = if self.cur + 1 >= pat.length { 0 } else { self.cur + 1 };
            }
            out.push(k, EV_STEP, 0, self.cur);
            self.offset = if g & 1 == 1 { pat.swing } else { 0 };
            self.pending = true;
        }

        if self.pending && t == self.offset {
            self.pending = false;
            let cur = (self.cur & 15) as usize;
            for track in 0..TRACKS {
                if pat.on[track] >> cur & 1 == 1 {
                    let p = pat.prob[track][cur] as u32;
                    if p >= 100 || rng.draw() % 100 < p {
                        out.push(k, EV_TRIG, track as u8, cur as u8);
                    }
                }
            }
        }
    }
}
