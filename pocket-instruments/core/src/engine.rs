//! §3. One engine: commands in, the clock advanced a frame at a time, events out.

use crate::abi::*;
use crate::bus::{Bus, OUTSIDE, is_sound_effect};
use crate::clock::Clock;
use crate::keys::Keys;
use crate::seq::{FX_MAX, Pattern, Rng, SWING_MAX, STEPS, Seq, TRACKS};
use crate::voice::{LOOP, LOOP_SLIDERS};
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
    /// §16: bit `t`, track `t` has fired on the playhead's step so far. Not saved.
    pub(crate) on_step: u16,
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
            on_step: 0,
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
        // §18, designed 2026-11-25: a slowed voice stays tuned for 46 875 Hz.
        self.voices.set_sample_rate(sample_rate, self.bus.slowed);
        // §18, designed 2026-11-24: the line was sized for the old rate. The host lends again.
        self.bus.forget();
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
        let mut out = Out::new(events, self.fires, self.on_step);
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
            let span = clock.span();
            clock.frame(thr, &mut |k| {
                out.ticks += 1;
                if seq.tick(k, pat, rng, &mut out, write, span) {
                    *generation = generation.wrapping_add(1); // §17: the lane is in the snapshot ⚠
                }
            });

            // §18: what is heard, as of this frame's ticks, and (ABI 14) what effect 1 slows,
            // read before this frame's hits sound (§18, designed 2026-11-25: a frame's
            // commands, then its ticks, then this, then its hits). Idle (no sound effect heard,
            // the ramp at 0) costs a comparison in `advance` and one in the mix.
            if audio.is_some() && (stale || out.ticks != 0) {
                let heard = self.heard();
                // §19 (ABI 11; D88): an effect `ROUTE` 1 names is the host's, so the core
                // does not sound it. Named in `ROUTE` 4 too, it takes the dry's place: an
                // insert, an effect whose sound is silence. Named in 1 alone it is no
                // effect, and the bus stays idle. Only a loop layout has a host's effect.
                let host = |mask: u16| heard != 0 && mask >> (heard - 1) & 1 == 1;
                effect = if channels >= LOOP && host(self.bus.route[1]) {
                    if host(self.bus.route[4]) { OUTSIDE | heard } else { 0 }
                } else if is_sound_effect(heard, self.bus.lent()) {
                    heard
                } else {
                    0
                };
                // Effect 1 slows the sounds in the effects while the core sounds it (D98 item 2).
                let slowed = if effect == 1 { self.pat.fx_sounds } else { 0 };
                if slowed != self.bus.slowed {
                    self.voices.slow(slowed, &mut self.bus, self.sample_rate);
                }
                stale = false;
            }

            // §20: what each track that fired on this frame is hit with, sound or no sound,
            // so the view says the same either way. Then (§11) whatever fired on this frame,
            // by an edge or by the clock, sounds from this frame (a slowed one from the grid's
            // next frame: §18, designed 2026-11-25). One comparison on a frame where nothing
            // fired. With no audio buffer the voices do not run at all.
            let fired = out.fired;
            let at = f as usize * channels;
            if fired != 0 {
                // §19's addition: the slider inputs are this frame's channels 18 to 49, read
                // here, on the hit, before this frame's outputs are written over them.
                let ins = if channels == LOOP_SLIDERS { audio.as_deref().and_then(|a| a.get(at + LOOP..at + LOOP_SLIDERS)) } else { None };
                self.hits(fired, out.stepped, &out.col, ins);
                if audio.is_some() {
                    self.voices.trigger(fired, &self.hit, self.sample_rate, self.bus.slowed);
                }
            }
            if let Some(audio) = audio.as_deref_mut() {
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
        self.on_step = out.on_step;
        self.dropped = self.dropped.saturating_add(out.dropped);
        out.len()
    }

    /// §20's table: a tap plays its sound's own A and B; a step from the sequencer, or a
    /// repeated hit, what its column keeps, or the sound's own if it keeps nothing. Read at
    /// the end of the frame's commands, as a slider always was (§11), so a voice that is
    /// sounding is never moved (D56).
    ///
    /// §19's addition: `ins` is the frame's thirty-two slider inputs (A for sounds 1 to 16,
    /// then B) in the layout that has them. For a sound `ROUTE` names, the input takes that
    /// slider's place for this hit, whatever the step keeps. The outputs (`Bus::outs`) are
    /// given the value from before, so out and back in cannot latch.
    #[inline(never)]
    fn hits(&mut self, fired: u16, stepped: u16, col: &[u8; TRACKS], ins: Option<&[f32]>) {
        for t in 0..TRACKS {
            if fired >> t & 1 == 1 {
                let s = col[t] as usize & 15;
                let own = if stepped >> t & 1 == 1 && self.pat.keep[t] >> s & 1 == 1 {
                    self.pat.kept[t][s]
                } else {
                    self.voices.params[t]
                };
                self.bus.outs[t] = slider_out(own[0]);
                self.bus.outs[TRACKS + t] = slider_out(own[1]);
                let mut used = own;
                if let Some(ins) = ins {
                    for (ab, slot) in used.iter_mut().enumerate() {
                        if self.bus.route[2 + ab] >> t & 1 == 1 {
                            if let Some(x) = ins.get(ab * TRACKS + t) {
                                *slot = slider_in(*x);
                            }
                        }
                    }
                }
                self.hit[t] = used;
            }
        }
        self.hit_any |= fired;
    }

    pub(crate) fn apply(&mut self, c: &Cmd, out: &mut Out) {
        let (a, b, v) = (c.a as usize, c.b as usize, c.value);
        let changed = match c.kind {
            CMD_CLOCK => {
                let Engine { clock, seq, pat, rng, generation, keys, sample_rate, .. } = self;
                let write = keys.lane_write;
                let span = clock.span();
                clock.edge(*sample_rate, &mut |k| {
                    out.ticks += 1;
                    if seq.tick(k, pat, rng, out, write, span) {
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
                self.own_out(a);
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
            // §19: which inputs are taken, and (ABI 11) which effects are the host's and which
            // of those take the dry's place. The patch's, so nothing a snapshot holds changes.
            CMD_ROUTE if a < 5 => {
                self.bus.route[a] = v as u16;
                false
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

impl Engine {
    /// §19's addition: a sound not yet hit shows its own A and B on the slider outputs, so
    /// they follow whatever sets them: `SOUND` (and so a slider), and a load.
    pub(crate) fn own_out(&mut self, t: usize) {
        if self.hit_any >> t & 1 == 0 {
            self.bus.outs[t] = slider_out(self.voices.params[t][0]);
            self.bus.outs[TRACKS + t] = slider_out(self.voices.params[t][1]);
        }
    }
}

/// §19's addition: a slider as an output says it, 0 to 1.
#[inline]
pub(crate) fn slider_out(v: u16) -> f32 {
    v as f32 / 65_535.0
}

/// §19's addition: a slider input, held to 0 to 1 and turned to 0 to 65535, to the nearest
/// ⚠ (§19 said "rounded down"; D80 says why not: an output read back in would lose one).
/// Anything not a number is 0.
#[inline]
pub(crate) fn slider_in(x: f32) -> u16 {
    let x = if x > 0.0 { if x < 1.0 { x } else { 1.0 } } else { 0.0 };
    (x * 65_535.0 + 0.5) as u16
}
