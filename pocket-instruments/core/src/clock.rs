//! §4. The clock turns frames into ticks. It is the only layer that sees a frame.

pub const TICKS_PER_STEP: u32 = 96;
pub const MBPM_MIN: u32 = 30_000;
pub const MBPM_MAX: u32 = 300_000;
pub const MBPM_DEFAULT: u32 = 120_000;

pub const SOURCE_TABLE: u8 = 0;
pub const SOURCE_EDGES: u8 = 1;
/// §4, designed 2026-11-25 (ABI 15; D100): one edge a beat, four steps.
pub const SOURCE_BEATS: u8 = 2;
/// The ticks an edge stands for, `span`, by the source: a step, or a beat.
pub const TICKS_PER_BEAT: u32 = 4 * TICKS_PER_STEP;

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
    /// §4, designed 2026-11-25 (ABI 15): the last period measured since this source was
    /// chosen, with one edge a beat; 0 for none. The first beat after a reset runs at it.
    guess: u32,
    source: u8,
    primed: bool,
    have_edge: bool,
    /// §14, designed 2026-11-25: `period` was measured between two edges, not guessed.
    measured: bool,
}

impl Clock {
    pub const fn new() -> Self {
        Clock {
            acc: 0,
            e: 0,
            mbpm: MBPM_DEFAULT,
            period: 0,
            since: 0,
            guess: 0,
            source: SOURCE_TABLE,
            primed: false,
            have_edge: false,
            measured: false,
        }
    }

    #[inline]
    fn tick(&mut self, sink: &mut impl FnMut(u32)) {
        let k = self.e;
        self.e = k.wrapping_add(1);
        sink(k);
    }

    /// The tick most lately emitted; 0 before any.
    #[inline]
    pub fn now(&self) -> u32 {
        self.e.saturating_sub(1)
    }

    /// One frame, after that frame's commands. `thr` is `625 * sample_rate`.
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
                // §4, designed 2026-11-25: one rule for both edge sources, `span` the ticks an
                // edge stands for. One edge a step keeps its own path, the old one, so it does
                // not move by a bit nor by a division.
                if self.source == SOURCE_EDGES {
                    let reached = self.since as u64 * TICKS_PER_STEP as u64 / self.period as u64;
                    let want = if reached > 95 { 95 } else { reached as u32 };
                    while self.e.wrapping_sub(1) % TICKS_PER_STEP < want {
                        self.tick(sink);
                    }
                } else {
                    let reached = self.since as u64 * TICKS_PER_BEAT as u64 / self.period as u64;
                    let want = if reached > 383 { 383 } else { reached as u32 };
                    while self.e.wrapping_sub(1) % TICKS_PER_BEAT < want {
                        self.tick(sink);
                    }
                }
            }
            self.since = self.since.saturating_add(1);
        }
    }

    /// §14, designed 2026-11-25 (ABI 15): `ext`, the tempo the edges are playing in tenths of
    /// a bpm, 0 for none: on the table, before a period is measured, and once an edge is a
    /// whole period late. `K × rate` is 150 (a step) or 600 (a beat) times the rate, in 64 bits.
    pub fn ext(&self, rate: u32) -> u16 {
        if self.source == SOURCE_TABLE || !self.measured || self.since as u64 > 2 * self.period as u64 {
            return 0;
        }
        let k: u64 = if self.source == SOURCE_BEATS { 600 } else { 150 };
        let p = self.period as u64;
        let x = (k * rate as u64 + p / 2) / p;
        if x > 65_535 { 65_535 } else { x as u16 }
    }

    pub fn source(&self) -> u8 {
        self.source
    }

    /// `span`, the ticks an edge stands for: 384 on one edge a beat, else 96. The sequencer
    /// starts a pattern on a multiple of it (§4, ruled 2026-11-25, D101 item 1).
    #[inline]
    pub fn span(&self) -> u32 {
        if self.source == SOURCE_BEATS { TICKS_PER_BEAT } else { TICKS_PER_STEP }
    }

    /// The period a beat runs at when no edge has measured it: the guess, or if the guess is
    /// 0 the stored tempo's beat, in 64 bits (at most twice the rate: 30 bpm).
    fn guessed(&self, rate: u32) -> u32 {
        if self.guess != 0 {
            self.guess
        } else {
            let beat = rate as u64 * 60_000 / self.mbpm as u64;
            if beat < 1 { 1 } else { beat as u32 }
        }
    }

    /// `CLOCK`: one edge, one step (`SOURCE` 1) or one beat (`SOURCE` 2, ABI 15). Finishes
    /// the old step or beat, then emits tick 0 of the new one. `rate` is the engine's, for the
    /// first beat's guess when nothing has been measured (§4, designed 2026-11-25).
    #[inline(never)]
    pub fn edge(&mut self, rate: u32, sink: &mut impl FnMut(u32)) {
        if self.source == SOURCE_TABLE {
            return;
        }
        let beats = self.source == SOURCE_BEATS;
        if self.have_edge && self.since > 0 {
            if beats && self.measured && self.since as u64 > 2 * self.period as u64 {
                // §4, ruled 2026-11-25 (D101 item 2): on one edge a beat, an edge after a pause
                // (the bar `ext` calls stopped) is a first edge: it does not measure, its beat
                // runs at the guess, and the guess is left. One edge a step measures it, as ever.
                // §4, ruled after Session 35's review (D103): a pause only against a measured
                // period. Against a guess (after a first edge or a pause) every edge measures,
                // or a clock under half the guessed tempo would never be measured again. With
                // `measured` set on beats `guess` is never 0, so `guessed` here is the guess.
                self.period = self.guessed(rate);
                self.measured = false;
            } else {
                self.period = self.since;
                self.measured = true;
                if beats {
                    self.guess = self.since;
                }
            }
        } else if !self.have_edge && beats {
            self.period = self.guessed(rate);
        }
        self.have_edge = true;
        self.since = 0;
        let span = if beats { TICKS_PER_BEAT } else { TICKS_PER_STEP };
        loop {
            self.tick(sink);
            if self.e % span == 1 {
                break;
            }
        }
    }

    /// `RESET`. Since ABI 15 it clears `measured` too, and keeps `guess` (§4, designed
    /// 2026-11-25): the first beat after a reset runs at the last beat measured.
    pub fn reset(&mut self) {
        self.e = 0;
        self.have_edge = false;
        self.period = 0;
        self.since = 0;
        self.acc = 0;
        self.primed = false;
        self.measured = false;
    }

    /// `SOURCE`. Naming the source already in use changes nothing: only a switch clears
    /// state. (ENGINE.md says "switching"; the fixtures' harness sends SOURCE at frame 0 on
    /// every run, and a table clock that lost its first tick there would start a tick late.)
    /// A value that is none of the three sources is ignored. A switch (any two that differ,
    /// ABI 15) keeps E and clears `have_edge`, `period`, `measured` and `guess`; to the table
    /// it also clears `acc` and sets `primed`. (Until ABI 15 a switch to the table left
    /// `have_edge` and `period` as they were: nothing on the table reads them, and a switch back
    /// to edges cleared them, so nothing heard or shown differs.)
    pub fn set_source(&mut self, value: u32) {
        if value > SOURCE_BEATS as u32 || value == self.source as u32 {
            return;
        }
        self.source = value as u8;
        self.have_edge = false;
        self.period = 0;
        self.measured = false;
        self.guess = 0;
        if self.source == SOURCE_TABLE {
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
    ///
    /// §4, ruled 2026-11-25 (D101 item 3): on one edge a beat the beat is carried too: `guess`,
    /// `period` and `since` are `× new / old`, rounded down, in 64 bits, a `period` or `guess`
    /// that was not 0 held to at least 1. ⚠ A result past a u32 is held there (`since`
    /// saturates, §4; the ruling does not say). One edge a step and the table rescale nothing
    /// else, as before.
    pub fn rescale(&mut self, old_rate: u32, new_rate: u32) {
        if old_rate == 0 {
            return;
        }
        let (old, new) = (old_rate as u64, new_rate as u64);
        self.acc = (self.acc / old) * new + (self.acc % old) * new / old;
        if self.source == SOURCE_BEATS {
            let scale = |x: u32, least: u64| -> u32 {
                if x == 0 {
                    return 0;
                }
                let y = x as u64 * new / old;
                if y < least { least as u32 } else if y > u32::MAX as u64 { u32::MAX } else { y as u32 }
            };
            self.guess = scale(self.guess, 1);
            self.period = scale(self.period, 1);
            self.since = scale(self.since, 0);
        }
    }
}
