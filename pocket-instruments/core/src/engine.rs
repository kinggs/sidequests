//! §3. One engine: commands in, the clock advanced a frame at a time, events out.

use crate::abi::*;
use crate::bus::{Bus, is_sound_effect};
use crate::clock::Clock;
use crate::keys::Keys;
use crate::seq::{FX_MAX, Pattern, Rng, SWING_MAX, STEPS, Seq, TRACKS};
use crate::voice::Voices;

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
    pub(crate) voices: Voices,
    /// §13: what the keys hold. The volume and the chosen sound are in snapshot version 2.
    pub(crate) keys: Keys,
    /// §14: firings per track since `pi_init`, wrapping.
    pub(crate) fires: [u8; TRACKS],
    /// §18: the bus and its seven sound effects. Not saved: the moment's.
    pub(crate) bus: Bus,
    /// §20: the A and B each track was last hit with, and bit `t` set once track `t` has
    /// been hit. The view's bytes 60 to 63 show the chosen sound's. Not saved: the moment's.
    pub(crate) hit: [[u16; 2]; TRACKS],
    pub(crate) hit_any: u16,
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
            voices: Voices::new(),
            keys: Keys::new(),
            fires: [0; TRACKS],
            bus: Bus::new(),
            hit: [[0; 2]; TRACKS],
            hit_any: 0,
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
        self.voices.set_sample_rate(sample_rate);
    }

    pub fn process(
        &mut self,
        frames: u32,
        cmds: &[Cmd],
        events: &mut [Event],
        mut audio: Option<&mut [f32]>,
        channels: usize,
    ) -> u32 {
        if frames == 0 {
            return 0;
        }
        let thr = 625 * self.sample_rate as u64;
        let last = frames - 1;
        let mut out = Out::new(events, self.fires);
        let mut next = 0;
        // §18: what is heard changes only by a command or a tick (and by a load, between
        // calls), so it is read again only on a frame that has one. The same value as reading
        // it every frame, for a comparison on the frames that have neither.
        let mut effect = 0u8;
        let mut stale = true;

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
                stale = true;
            }
            let Engine { clock, seq, pat, rng, generation, keys, .. } = self;
            let write = keys.lane_write;
            clock.frame(thr, &mut |k| {
                out.ticks += 1;
                if seq.tick(k, pat, rng, &mut out, write) {
                    *generation = generation.wrapping_add(1); // §17: the lane is in the snapshot ⚠
                }
            });

            // §20: what each track that fired on this frame is hit with, sound or no sound,
            // so the view says the same either way. Then (§11) whatever fired on this frame,
            // by an edge or by the clock, sounds from this frame. One comparison on a frame
            // where nothing fired. With no audio buffer the voices do not run at all.
            let fired = out.fired;
            if fired != 0 {
                self.hits(fired, out.stepped, &out.col);
                if audio.is_some() {
                    self.voices.trigger(fired, &self.hit, self.sample_rate);
                }
            }
            if let Some(audio) = audio.as_deref_mut() {
                let at = f as usize * channels;
                // §18: what is heard, as of this frame's ticks. Idle (no sound effect heard,
                // the ramp at 0) costs a comparison in `advance` and one in the mix.
                if stale || out.ticks != 0 {
                    let heard = self.heard();
                    effect = if is_sound_effect(heard) { heard } else { 0 };
                    stale = false;
                }
                self.bus.advance(effect, out.ticks, self.sample_rate);
                if let Some(frame) = audio.get_mut(at..at + channels) {
                    // §13: the master volume, read on each frame, so a key changes it at once.
                    self.voices.render(frame, self.keys.gain(), &mut self.bus, self.pat.fx_sounds);
                }
            }
            out.fired = 0;
            out.ticks = 0;
        }

        self.fires = out.fires;
        self.dropped = self.dropped.saturating_add(out.dropped);
        out.len()
    }

    /// §20's table: a tap plays its sound's own A and B; a step from the sequencer, or a
    /// repeated hit, what its column keeps, or the sound's own if it keeps nothing. Read at
    /// the end of the frame's commands, as a slider always was (§11), so a voice that is
    /// sounding is never moved (D56).
    #[inline(never)]
    fn hits(&mut self, fired: u16, stepped: u16, col: &[u8; TRACKS]) {
        for t in 0..TRACKS {
            if fired >> t & 1 == 1 {
                let s = col[t] as usize & 15;
                self.hit[t] = if stepped >> t & 1 == 1 && self.pat.keep[t] >> s & 1 == 1 {
                    self.pat.kept[t][s]
                } else {
                    self.voices.params[t]
                };
            }
        }
        self.hit_any |= fired;
    }

    pub(crate) fn apply(&mut self, c: &Cmd, out: &mut Out) {
        let (a, b, v) = (c.a as usize, c.b as usize, c.value);
        let changed = match c.kind {
            CMD_CLOCK => {
                let Engine { clock, seq, pat, rng, generation, keys, .. } = self;
                let write = keys.lane_write;
                clock.edge(&mut |k| {
                    out.ticks += 1;
                    if seq.tick(k, pat, rng, out, write) {
                        *generation = generation.wrapping_add(1);
                    }
                });
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
                // §20: off forgets what the step kept; on keeps nothing by itself.
                let forgot = v == 0 && self.pat.forget(a, b);
                self.pat.on[a] != old || forgot
            }
            // §20: that step keeps these A (high sixteen bits) and B (low) from now on.
            CMD_KEEP if a < TRACKS && b < STEPS => {
                let ab = [(v >> 16) as u16, v as u16];
                let bit = 1u16 << b;
                let old = (self.pat.keep[a] & bit != 0, self.pat.kept[a][b]);
                self.pat.keep[a] |= bit;
                self.pat.kept[a][b] = ab;
                old != (true, ab)
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
            // A track's two sliders. In snapshot version 2 (§15), so a change moves the
            // generation. (Until Session 11 they were in no snapshot and moved nothing: D44.)
            CMD_SOUND if a < TRACKS && b < 2 => {
                let p = v.min(65_535) as u16;
                let old = core::mem::replace(&mut self.voices.params[a][b], p);
                old != p
            }
            // A tap: the track fires now, playing or stopped, as if its step had come round.
            // The pattern is not touched (D45).
            CMD_FIRE if a < TRACKS => {
                out.trig(self.clock.now(), a as u8, self.seq.step(), false);
                false
            }
            // Which a track plays when it fires: 0 its code voice, 1 its sample (D50). In
            // snapshot version 2 with the sliders (§15).
            CMD_VOICE if a < TRACKS => {
                let old = self.voices.sampled;
                let bit = 1u16 << a;
                self.voices.sampled = if v != 0 { old | bit } else { old & !bit };
                self.voices.sampled != old
            }
            // §17: the lane's entry for a step. A value past 16 is ignored, as an index is.
            CMD_FX if a < STEPS && v <= FX_MAX as u32 => {
                let old = core::mem::replace(&mut self.pat.fx[a], v as u8);
                old != v as u8
            }
            // §17: whether a sound goes through the effects.
            CMD_FXSOUND if a < TRACKS => {
                let old = self.pat.fx_sounds;
                let bit = 1u16 << a;
                self.pat.fx_sounds = if v != 0 { old | bit } else { old & !bit };
                self.pat.fx_sounds != old
            }
            CMD_LENGTH => {
                let l = v.clamp(1, STEPS as u32) as u8;
                let old = core::mem::replace(&mut self.pat.length, l);
                old != l
            }
            // §13: what a finger did. Each becomes edits through this same function, which
            // count their own changes, so nothing is counted here.
            CMD_KEY_DOWN => {
                self.key_down(a, out);
                false
            }
            CMD_KEY_UP => {
                self.key_up(a, out);
                false
            }
            CMD_PARAM => {
                self.param(a, v, out);
                false
            }
            // Anything else is unknown, and ignored.
            _ => false,
        };
        if changed {
            self.generation = self.generation.wrapping_add(1);
        }
    }
}
