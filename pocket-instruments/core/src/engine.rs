//! §3. One engine: commands in, the clock advanced a frame at a time, events out.

use crate::abi::*;
use crate::clock::Clock;
use crate::seq::{Pattern, Rng, SWING_MAX, STEPS, Seq, TRACKS};

/// A seed of 0 would leave xorshift stuck on 0.
pub const SEED_FOR_ZERO: u32 = 0x9E37_79B9;

pub struct Engine {
    pub(crate) clock: Clock,
    pub(crate) pat: Pattern,
    pub(crate) seq: Seq,
    pub(crate) rng: Rng,
    /// The seed the generator last started from: what a snapshot saves.
    pub(crate) seed: u32,
    pub(crate) sample_rate: u32,
    pub(crate) dropped: u32,
    pub(crate) generation: u32,
}

impl Engine {
    pub fn new(sample_rate: u32, seed: u32) -> Self {
        let seed = if seed == 0 { SEED_FOR_ZERO } else { seed };
        Engine {
            clock: Clock::new(),
            pat: Pattern::new(),
            seq: Seq::new(),
            rng: Rng::new(seed),
            seed,
            sample_rate,
            dropped: 0,
            generation: 0,
        }
    }

    pub fn reseed(&mut self, seed: u32) {
        self.seed = if seed == 0 { SEED_FOR_ZERO } else { seed };
        self.rng = Rng::new(self.seed);
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        if sample_rate == 0 || sample_rate == self.sample_rate {
            return;
        }
        self.clock.rescale(self.sample_rate, sample_rate);
        self.sample_rate = sample_rate;
    }

    pub fn process(&mut self, frames: u32, cmds: &[Cmd], events: &mut [Event]) -> u32 {
        if frames == 0 {
            return 0;
        }
        let thr = 625 * self.sample_rate as u64;
        let last = frames - 1;
        let mut out = Out::new(events);
        let mut next = 0;

        for f in 0..frames {
            out.frame = f;
            // Array order is kept whatever the frames say: a frame past the block lands on
            // the last frame, and one lower than its neighbour's lands with that neighbour.
            while let Some(c) = cmds.get(next) {
                if c.frame.min(last) > f {
                    break;
                }
                self.apply(c, &mut out);
                next += 1;
            }
            let Engine { clock, seq, pat, rng, .. } = self;
            clock.frame(thr, &mut |k| seq.tick(k, pat, rng, &mut out));
        }

        self.dropped = self.dropped.saturating_add(out.dropped);
        out.len()
    }

    fn apply(&mut self, c: &Cmd, out: &mut Out) {
        let (a, b, v) = (c.a as usize, c.b as usize, c.value);
        let changed = match c.kind {
            CMD_CLOCK => {
                let Engine { clock, seq, pat, rng, .. } = self;
                clock.edge(&mut |k| seq.tick(k, pat, rng, out));
                false
            }
            CMD_RESET => {
                self.clock.reset();
                self.seq.reset();
                false
            }
            CMD_SOURCE => {
                self.clock.set_source(v);
                false
            }
            CMD_TEMPO => self.clock.set_tempo(v),
            CMD_PLAY => {
                self.seq.play(v != 0);
                false
            }
            CMD_STEP if a < TRACKS && b < STEPS => {
                let old = self.pat.on[a];
                let bit = 1u16 << b;
                self.pat.on[a] = if v != 0 { old | bit } else { old & !bit };
                self.pat.on[a] != old
            }
            CMD_PROB if a < TRACKS && b < STEPS => {
                let p = v.min(100) as u8;
                let old = core::mem::replace(&mut self.pat.prob[a][b], p);
                old != p
            }
            CMD_SWING => {
                let s = v.min(SWING_MAX) as u8;
                let old = core::mem::replace(&mut self.pat.swing, s);
                old != s
            }
            CMD_LENGTH => {
                let l = v.clamp(1, STEPS as u32) as u8;
                let old = core::mem::replace(&mut self.pat.length, l);
                old != l
            }
            // Keys and sliders are reserved (D26); anything else is unknown. All ignored.
            _ => false,
        };
        if changed {
            self.generation = self.generation.wrapping_add(1);
        }
    }
}
