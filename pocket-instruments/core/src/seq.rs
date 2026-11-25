//! §5. The sequencer never sees a frame: its output depends only on the order of ticks and
//! commands. Since ABI 6 (§17) it also writes the lane as steps arrive and plays the four
//! repeats.

use crate::abi::{EV_STEP, Out};
use crate::clock::TICKS_PER_STEP;

pub const TRACKS: usize = 16;
pub const STEPS: usize = 16;
pub const SWING_MAX: u32 = 48;
/// §17: a lane entry is 0 (none) or the effect on key 1 to 16.
pub const FX_MAX: u8 = 16;
/// §17: what the sequencer is told about the fx key each tick: fx is not held, so nothing is
/// written. Otherwise the value is what an arriving step takes: the punch, or 0.
pub const NO_WRITE: u8 = 0xFF;
/// `Seq::down` while no step is being played (Session 30).
const NO_DOWN: u8 = 0xFF;

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

/// §17, designed 2026-11-24 (ABI 13; D93): effect 13, "note shuffle".
pub const SHUFFLE: u8 = 13;

/// §17's draw: at 100 or over it passes with no draw; under, one draw, passing when
/// `draw % 100 < p`.
#[inline]
fn draw(p: u8, rng: &mut Rng) -> bool {
    let p = p as u32;
    p >= 100 || rng.draw() % 100 < p
}

/// §17, designed 2026-11-24 (ABI 13; D93): the step's firing while effect 13 is read. A note
/// of a sound in the effects plays as the sound twelve keys on, round the sixteen; a sound out
/// of the effects plays its own notes too. By rising track of the sound that sounds; each note
/// takes its own draw (its own first), and one `TRIG` says either passed. ⚠ The map is a
/// reading of three sounds (R70): `(m + 4) & 15` is the one line to change. Out of line: the
/// plain firing pays one comparison for it.
#[inline(never)]
fn shuffle(k: u32, cur: usize, pat: &Pattern, rng: &mut Rng, out: &mut Out) {
    for m in 0..TRACKS {
        let mut fire = false;
        if pat.fx_sounds >> m & 1 == 0 && pat.on[m] >> cur & 1 == 1 {
            fire |= draw(pat.prob[m][cur], rng);
        }
        let s = (m + 4) & 15; // the sound whose note m plays: s + 12 is m
        if pat.fx_sounds >> s & 1 == 1 && pat.on[s] >> cur & 1 == 1 {
            // Both draws are taken, whatever the first gave.
            let d = draw(pat.prob[s][cur], rng);
            fire |= d;
        }
        if fire {
            out.trig(k, m as u8, cur as u8, true);
        }
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
    /// §20: bit `s` of track `t`, step `s` keeps the A and B it was written with,
    /// `kept[t][s]`. Zero where nothing is kept, so two patterns that play alike are equal.
    pub keep: [u16; TRACKS],
    pub kept: [[[u16; 2]; STEPS]; TRACKS],
}

impl Pattern {
    /// §20: step `s` of track `t` forgets what it kept. Says whether it kept anything.
    pub fn forget(&mut self, t: usize, s: usize) -> bool {
        let bit = 1u16 << (s & 15);
        let had = self.keep[t & 15] & bit != 0;
        self.keep[t & 15] &= !bit;
        self.kept[t & 15][s & 15] = [0; 2];
        had
    }

    pub const fn new() -> Self {
        Pattern {
            on: [0; TRACKS],
            prob: [[100; STEPS]; TRACKS],
            length: STEPS as u8,
            swing: 0,
            fx: [0; STEPS],
            fx_sounds: 0xFFFF,
            keep: [0; TRACKS],
            kept: [[[0; 2]; STEPS]; TRACKS],
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
    /// §17, Session 30 (D95 item 1, the owner: "as close as possible to the PO"): the last
    /// `write` seen, and the step that was playing when it changed, `NO_DOWN` until a step has
    /// arrived since play or reset. A run begun by a punch still held repeats `down`: the
    /// step the key came down on, not the step after it, which the lane takes.
    wrote: u8,
    down: u8,
    run_tick: u32,
    /// §16: steps woven since play began, or since a reset while playing (D84). Held when
    /// stopped. The view's bytes 48 to 51. Not saved: the moment's.
    woven: u32,
    /// §16: bit `i`, the step woven `i` steps ago had a sound set as it arrived. Bytes 52, 53.
    wove: u16,
}

impl Seq {
    pub const fn new() -> Self {
        Seq { playing: false, fresh: false, pending: false, cur: 0, offset: 0, eff: 0, last: 0, period: 0, run_step: 0, run_tick: 0, wrote: NO_WRITE, down: NO_DOWN, woven: 0, wove: 0 }
    }

    /// §16: how many steps the cloth holds, and which of the last sixteen had a sound set.
    pub fn cloth(&self) -> (u32, u16) {
        (self.woven, self.wove)
    }

    /// §17: a new run begins at the next step that holds a repeat. And until a step has
    /// arrived there is no effect read since play: a repeat waits for that step ⚠, as a
    /// plain firing does (`pending`).
    fn end_run(&mut self) {
        self.last = 0;
        self.eff = 0;
        self.period = 0;
        self.wrote = NO_WRITE;
        self.down = NO_DOWN;
    }

    pub fn play(&mut self, on: bool) {
        if on {
            if !self.playing {
                self.playing = true;
                self.fresh = true;
                self.end_run();
                // §16: play starts a new cloth; stop leaves the old one as it is.
                self.woven = 0;
                self.wove = 0;
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
        // §16 (D84): a reset while playing starts a new cloth, as play does, so a diamond
        // still begins on step 1. Stopped, the cloth holds still: play will start the new one.
        if self.playing {
            self.woven = 0;
            self.wove = 0;
        }
    }

    /// One tick. `write` is what an arriving step takes into the lane (`NO_WRITE` while fx
    /// is up). `span` is the ticks an edge stands for (`Clock::span`): 96, or 384 on one edge a
    /// beat. Returns whether the lane changed, which moves the generation.
    #[inline]
    pub fn tick(&mut self, k: u32, pat: &mut Pattern, rng: &mut Rng, out: &mut Out, write: u8, span: u32) -> bool {
        if !self.playing {
            return false;
        }
        let mut lane_changed = false;
        let g = k / TICKS_PER_STEP;
        let t = (k % TICKS_PER_STEP) as u8;
        // §4, ruled 2026-11-25 (D101 item 1): a pattern not yet started begins on a tick that is
        // a multiple of `span`, so on one edge a beat play waits for the next edge. Until then a
        // step's tick 0 is any other tick of a pattern not started. With `span` 96 this is
        // `t == 0`, as it always was; a reset sets tick 0, a multiple of both.
        let boundary = t == 0 && !(self.fresh && k % span != 0);

        // §17, Session 30: where a punch came down. Before a step has arrived since play or
        // reset no step is being played, and a run there begins on its own step.
        if !boundary && write != self.wrote {
            self.wrote = write;
            self.down = if self.fresh { NO_DOWN } else { self.cur };
            // D97 (the owner: the replay must match the push): a repeat punched mid-step is
            // recorded on the step being played too, so a replay's run begins there and
            // repeats what the hand heard. Sound effects keep §17's rule (D66 item 3): the
            // step being played is not recorded.
            let at = (self.cur & 15) as usize;
            if !self.fresh && repeat_period(write) != 0 && pat.fx[at] != write {
                pat.fx[at] = write;
                lane_changed = true;
            }
        }

        if boundary {
            if self.fresh {
                self.cur = 0;
                self.fresh = false;
            } else {
                self.cur = if self.cur + 1 >= pat.length { 0 } else { self.cur + 1 };
            }
            out.push(k, EV_STEP, 0, self.cur);
            self.offset = if g & 1 == 1 { pat.swing } else { 0 };
            self.pending = true;

            // §16: the step is woven as it arrives, with whether any sound is set on it now.
            // Set, not fired: a probability or a repeat does not change the cloth. Once a step.
            let mut set = 0u16;
            for on in &pat.on {
                set |= *on;
            }
            self.woven = self.woven.wrapping_add(1);
            self.wove = self.wove << 1 | (set >> (self.cur & 15) & 1);

            // A punch landing on this boundary's frame came down on the step arriving.
            if write != self.wrote {
                self.wrote = write;
                self.down = self.cur;
            }

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
                    // §17, Session 30 (D95 item 1, the hardware's rule): a run repeats the step
                    // the key came down on, so an empty step repeats as silence. Begun from the
                    // lane, with no punch held, it repeats its own first step, as built in
                    // Session 16. A new repeat is a new run, from its own key's step.
                    self.run_step = if write == self.eff && self.down != NO_DOWN { self.down } else { self.cur };
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
                if self.eff == SHUFFLE {
                    // §17, designed 2026-11-24: effect 13 takes the plain firing's place.
                    shuffle(k, cur, pat, rng, out);
                    return lane_changed;
                }
                for track in 0..TRACKS {
                    if pat.on[track] >> cur & 1 == 1 {
                        let p = pat.prob[track][cur] as u32;
                        if p >= 100 || rng.draw() % 100 < p {
                            out.trig(k, track as u8, cur as u8, true);
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
                    out.trig(k, track as u8, column as u8, true);
                }
            }
        }
    }
}
