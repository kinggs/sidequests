//! §5. The sequencer never sees a frame: its output depends only on the order of ticks and
//! commands. Since ABI 6 (§17) it also writes the lane as steps arrive and plays the four
//! repeats.

use crate::abi::{EV_STEP, EV_TRIG, Out};
use crate::clock::TICKS_PER_STEP;

pub const TRACKS: usize = 16;
pub const STEPS: usize = 16;
pub const SWING_MAX: u32 = 48;
/// §17: a lane entry is 0 (none) or the effect on key 1 to 16.
pub const FX_MAX: u8 = 16;
/// §17: what the sequencer is told about the fx key each tick: fx is not held, so nothing is
/// written. Otherwise the value is what an arriving step takes: the punch, or 0.
pub const NO_WRITE: u8 = 0xFF;

/// §17's table: effects 9 to 12 re-fire a step every this many ticks. 0: not a repeat.
#[inline]
pub const fn repeat_period(effect: u8) -> u32 {
    match effect {
        9 => 96,
        10 => 128,
        11 => 48,
        12 => 64,
        _ => 0,
    }
}

/// What a snapshot holds of the sequencer.
pub struct Pattern {
    /// One word per track; bit `s` is step `s`.
    pub on: [u16; TRACKS],
    pub prob: [[u8; STEPS]; TRACKS],
    pub length: u8,
    pub swing: u8,
    /// §17: the lane, one effect a step, 0 for none.
    pub fx: [u8; STEPS],
    /// §17: bit `t`, track `t` goes through the effects. All sixteen at `pi_init`.
    pub fx_sounds: u16,
}

impl Pattern {
    pub const fn new() -> Self {
        Pattern {
            on: [0; TRACKS],
            prob: [[100; STEPS]; TRACKS],
            length: STEPS as u8,
            swing: 0,
            fx: [0; STEPS],
            fx_sounds: 0xFFFF,
        }
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
    /// §17: the effect read at the last step boundary, and the one before it (`last`).
    eff: u8,
    last: u8,
    /// §17: the repeat in force, as its period in ticks (0: none), and the run it belongs to:
    /// the step it began on and the tick.
    period: u32,
    run_step: u8,
    run_tick: u32,
}

impl Seq {
    pub const fn new() -> Self {
        Seq { playing: false, fresh: false, pending: false, cur: 0, offset: 0, eff: 0, last: 0, period: 0, run_step: 0, run_tick: 0 }
    }

    /// §17: a new run begins at the next step that holds a repeat. And until a step has
    /// arrived there is no effect read since play: a repeat waits for that step ⚠, as a
    /// plain firing does (`pending`).
    fn end_run(&mut self) {
        self.last = 0;
        self.eff = 0;
        self.period = 0;
    }

    pub fn play(&mut self, on: bool) {
        if on {
            if !self.playing {
                self.playing = true;
                self.fresh = true;
                self.end_run();
            }
        } else {
            self.playing = false;
            self.pending = false;
        }
    }

    pub fn playing(&self) -> bool {
        self.playing
    }

    /// A step has arrived since play, or since a reset: the playhead's step means something.
    pub fn started(&self) -> bool {
        self.playing && !self.fresh
    }

    /// The pattern step the playhead is on.
    pub fn step(&self) -> u8 {
        self.cur
    }

    pub fn reset(&mut self) {
        self.fresh = true;
        self.pending = false;
        self.end_run();
    }

    /// One tick. `write` is what an arriving step takes into the lane (`NO_WRITE` while fx
    /// is up). Returns whether the lane changed, which moves the generation.
    #[inline]
    pub fn tick(&mut self, k: u32, pat: &mut Pattern, rng: &mut Rng, out: &mut Out, write: u8) -> bool {
        if !self.playing {
            return false;
        }
        let mut lane_changed = false;
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

            // §17: the lane is written by the steps that arrive, then read.
            let cur = (self.cur & 15) as usize;
            if write != NO_WRITE && pat.fx[cur] != write {
                pat.fx[cur] = write;
                lane_changed = true;
            }
            self.eff = pat.fx[cur];
            if self.eff != self.last {
                self.period = repeat_period(self.eff);
                if self.period != 0 {
                    self.run_step = self.cur;
                    self.run_tick = k;
                }
                self.last = self.eff;
            }
        }

        if self.period == 0 {
            // §5, as it was before ABI 6: an empty lane costs the one comparison above.
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
        } else {
            self.repeat(k, t, pat, rng, out);
        }
        lane_changed
    }

    /// §17's four repeats. A sound in the effects fires from the run's column on the run's
    /// own grid, unswung; one outside plays its own step as §5 says. Rising track order, one
    /// draw a firing at under 100, repeats and plain firings together.
    fn repeat(&mut self, k: u32, t: u8, pat: &Pattern, rng: &mut Rng, out: &mut Out) {
        let hit = k.wrapping_sub(self.run_tick) % self.period == 0;
        let plain = self.pending && t == self.offset;
        if plain {
            self.pending = false;
        }
        if !hit && !plain {
            return;
        }
        let (cur, run) = ((self.cur & 15) as usize, (self.run_step & 15) as usize);
        for track in 0..TRACKS {
            let column = if pat.fx_sounds >> track & 1 == 1 {
                if !hit {
                    continue;
                }
                run
            } else {
                if !plain {
                    continue;
                }
                cur
            };
            if pat.on[track] >> column & 1 == 1 {
                let p = pat.prob[track][column] as u32;
                if p >= 100 || rng.draw() % 100 < p {
                    out.push(k, EV_TRIG, track as u8, column as u8);
                }
            }
        }
    }
}
