//! §4. The clock turns frames into ticks. It is the only layer that sees a frame.

pub const TICKS_PER_STEP: u32 = 96;
pub const MBPM_MIN: u32 = 30_000;
pub const MBPM_MAX: u32 = 300_000;
pub const MBPM_DEFAULT: u32 = 120_000;

pub const SOURCE_TABLE: u8 = 0;
pub const SOURCE_EDGES: u8 = 1;

pub struct Clock {
    /// `acc`: what is left of a tick on the table clock, in units of `1 / thr` of a tick.
    acc: u64,
    /// `E`: ticks emitted since reset. Wraps.
    e: u32,
    pub mbpm: u32,
    /// Frames between the last two edges; 0 for unknown.
    period: u32,
    /// Frames since the last edge. Saturates.
    since: u32,
    source: u8,
    primed: bool,
    have_edge: bool,
}

impl Clock {
    pub const fn new() -> Self {
        Clock {
            acc: 0,
            e: 0,
            mbpm: MBPM_DEFAULT,
            period: 0,
            since: 0,
            source: SOURCE_TABLE,
            primed: false,
            have_edge: false,
        }
    }

    #[inline]
    fn tick(&mut self, sink: &mut impl FnMut(u32)) {
        let k = self.e;
        self.e = k.wrapping_add(1);
        sink(k);
    }

    /// One frame, after that frame's commands. `thr` is `625 * sample_rate`.
    #[inline]
    /// The tick most lately emitted; 0 before any.
    pub fn now(&self) -> u32 {
        self.e.saturating_sub(1)
    }

    pub fn frame(&mut self, thr: u64, sink: &mut impl FnMut(u32)) {
        if self.source == SOURCE_TABLE {
            if !self.primed {
                self.primed = true;
                self.tick(sink);
            } else {
                self.acc += self.mbpm as u64 * 4;
                while self.acc >= thr {
                    self.acc -= thr;
                    self.tick(sink);
                }
            }
        } else {
            if self.period != 0 {
                let reached = self.since as u64 * TICKS_PER_STEP as u64 / self.period as u64;
                let want = if reached > 95 { 95 } else { reached as u32 };
                while self.e.wrapping_sub(1) % TICKS_PER_STEP < want {
                    self.tick(sink);
                }
            }
            self.since = self.since.saturating_add(1);
        }
    }

    pub fn source(&self) -> u8 {
        self.source
    }

    /// `CLOCK`: one edge, one step. Finishes the old step, then emits tick 0 of the new one.
    pub fn edge(&mut self, sink: &mut impl FnMut(u32)) {
        if self.source != SOURCE_EDGES {
            return;
        }
        if self.have_edge && self.since > 0 {
            self.period = self.since;
        }
        self.have_edge = true;
        self.since = 0;
        loop {
            self.tick(sink);
            if self.e % TICKS_PER_STEP == 1 {
                break;
            }
        }
    }

    pub fn reset(&mut self) {
        self.e = 0;
        self.have_edge = false;
        self.period = 0;
        self.since = 0;
        self.acc = 0;
        self.primed = false;
    }

    /// `SOURCE`. Naming the source already in use changes nothing: only a switch clears
    /// state. (ENGINE.md says "switching"; the fixtures' harness sends SOURCE at frame 0 on
    /// every run, and a table clock that lost its first tick there would start a tick late.)
    /// A value that is neither source is ignored.
    pub fn set_source(&mut self, value: u32) {
        if value > SOURCE_EDGES as u32 || value == self.source as u32 {
            return;
        }
        self.source = value as u8;
        if self.source == SOURCE_EDGES {
            self.have_edge = false;
            self.period = 0;
        } else {
            self.acc = 0;
            self.primed = true;
        }
    }

    /// Returns whether the tempo changed.
    pub fn set_tempo(&mut self, mbpm: u32) -> bool {
        let v = mbpm.clamp(MBPM_MIN, MBPM_MAX);
        let changed = v != self.mbpm;
        self.mbpm = v;
        changed
    }

    /// Keeps the table clock's phase: `acc = acc * new / old`, rounded down. `acc` is below
    /// `625 * old`, so splitting it into `q * old + r` keeps every product inside 64 bits and
    /// the result exact.
    pub fn rescale(&mut self, old_rate: u32, new_rate: u32) {
        if old_rate == 0 {
            return;
        }
        let (old, new) = (old_rate as u64, new_rate as u64);
        self.acc = (self.acc / old) * new + (self.acc % old) * new / old;
    }
}
