//! §18 (ABI 7; D67 items 2 and 3): the bus and the seven sound effects. A test for each rule
//! of §18, and one model of the whole section, written from ENGINE.md's words, that the mix
//! must equal bit for bit, frame by frame. The render pairs (`harness/render-fx-*.json`) hold
//! the same to the `.wasm`.

use super::sound::render;
use super::*;
use crate::bus::Bus;
use crate::voice::{LEVEL, Voices};

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames, a tick 62.5
const STEP: u64 = 6000;
const FX: u8 = 20;
const BPM: u8 = 18;

pub(super) fn down(key: u8) -> Cmd {
    cmd(CMD_KEY_DOWN, key, 0, 0)
}
pub(super) fn up(key: u8) -> Cmd {
    cmd(CMD_KEY_UP, key, 0, 0)
}
pub(super) fn fx(step: u8, effect: u32) -> Cmd {
    cmd(CMD_FX, step, 0, effect)
}
pub(super) fn fxsound(track: u8, on: u32) -> Cmd {
    cmd(CMD_FXSOUND, track, 0, on)
}
pub(super) fn on(track: u8, step: u8) -> Cmd {
    cmd(CMD_STEP, track, step, 1)
}
pub(super) fn play() -> Cmd {
    cmd(CMD_PLAY, 0, 0, 1)
}

fn bus(h: &Host) -> &Bus {
    unsafe { &(*h.e).bus }
}

/// The minimum beat: bass drum on the beat, snare on two and four, closed hats on the
/// eighths, open hats on the last eighth of each half.
pub(super) fn beat() -> Vec<Cmd> {
    let mut c = Vec::new();
    for s in 0..16u8 {
        if s % 4 == 0 {
            c.push(on(0, s));
        }
        if s % 8 == 4 {
            c.push(on(1, s));
        }
        if s % 2 == 0 && s % 8 != 6 {
            c.push(on(2, s));
        }
        if s % 8 == 6 {
            c.push(on(3, s));
        }
    }
    c
}

/// Edits at frame 0, then play: the commands for `render`.
pub(super) fn at_zero(edits: &[Cmd]) -> Vec<(u64, Cmd)> {
    let mut c: Vec<(u64, Cmd)> = edits.iter().map(|c| (0, *c)).collect();
    c.push((0, play()));
    c
}

/// `frames` of the mix alone.
fn mix(edits: &[Cmd], rate: u32, frames: usize) -> Vec<f32> {
    let mut h = Host::new(rate, 1);
    render(&mut h, frames, 128, 1, &at_zero(edits)).0
}

fn same_bits(a: &[f32], b: &[f32]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

const SEVEN: [u32; 7] = [1, 2, 3, 5, 6, 7, 8];

// ---- The model: §18 as written, beside the core ----

/// §18 in the plainest code, from ENGINE.md's text and table: kept apart from `bus.rs` so
/// that a slip in either shows as a difference.
pub(super) struct Model {
    pub(super) on: u8,
    heard: u8,
    w: f32,
    /// §18, designed 2026-11-25 (ABI 14; D98): effect 1's grid, its phase in 64 bits, and
    /// what it said this frame: `fresh` (a slowed sound is asked) and `mu` (how far past the
    /// grid's last point). `Voicing` reads both, and sets `acc` to 0 when a sound becomes
    /// slowed. (Until ABI 14, `acc` and a held sample were the hold at 1 kHz.)
    pub(super) acc: u64,
    pub(super) fresh: bool,
    pub(super) mu: f32,
    s1: f32,
    s2: f32,
    cutoff: f32,
    swept: u32,
    /// Effect 4 (ABI 12): the model's own line, as long as the core's is used; the head;
    /// whether it has gone round. Empty: no line lent, and the driver never sends 4.
    line: Vec<f32>,
    head: usize,
    full: bool,
    /// Effect 14 (ABI 13): frames of exact zero on the bus, counted with no ceiling.
    still: u64,
    /// The rate the last frame that ran was at, 0 before any: a ruling of 2026-11-25 on
    /// Session 32's question 3 (Fable): when the rate changes, `acc` wraps to the new rate,
    /// `acc mod 4 × rate`, so `mu` never passes 1.
    rate: u32,
}

impl Model {
    pub(super) fn new() -> Self {
        Model { on: 0, heard: 0, w: 0.0, acc: 0, fresh: false, mu: 0.0, s1: 0.0, s2: 0.0, cutoff: 0.0, swept: 0, line: Vec::new(), head: 0, full: false, still: 0, rate: 0 }
    }

    /// With a line of `delay` frames lent, as `pi_delay_frames` gives.
    pub(super) fn lent(delay: u32) -> Self {
        Model { line: vec![0.0; delay as usize], ..Model::new() }
    }

    /// One frame: what is heard (an effect the core sounds, or 0), the ticks the frame had,
    /// the sixteen voices, which go through the effects, and the volume. The mix.
    fn frame(&mut self, effect: u8, ticks: u32, rate: u32, v: &[f32], sounds: u16, volume: u8) -> f32 {
        self.frame_looped(effect, ticks, rate, v, sounds, volume, 0.0)
    }

    /// The same with §19's additions (`tests/route.rs` drives it). As designed 2026-11-24
    /// (D88, ABI 11): an effect whose number carries 0x80 is an insert, an effect whose sound
    /// is silence: its output is 0, it has no state here, and the ramp is the same ramp. And
    /// `back`, what the loop's channel 17 brought, is added last, before the volume:
    /// `(dry + back) × gain`, where `dry` is the mix before the volume; when `back` is exactly
    /// 0 nothing is added. (Session 18's model gave an outside effect `back` as its output, the
    /// crossing over; D87 and D88 replaced that rule, and this model with it.)
    #[allow(clippy::too_many_arguments)]
    pub(super) fn frame_looped(&mut self, effect: u8, ticks: u32, rate: u32, v: &[f32], sounds: u16, volume: u8, back: f32) -> f32 {
        self.advance(effect, ticks, rate);
        self.mixed(rate, v, sounds, volume, back)
    }

    /// The frame's state: what runs, the sweep, the ramp, and (ABI 14) effect 1's grid. A
    /// driver that models the voices too (`Voicing`) calls this, asks the voices, then `mixed`.
    pub(super) fn advance(&mut self, effect: u8, ticks: u32, rate: u32) {
        let filter = |e: u8| (5..=8).contains(&e);
        if effect != 0 || self.on != 0 {
            // The ruling of 2026-11-25 (Session 34's list): the grid wrapped to a new rate on
            // the first frame that runs at it, before anything else.
            if rate != self.rate {
                self.rate = rate;
                self.acc %= 4 * rate as u64;
            }
            if effect != 0 && effect != self.heard {
                // Cleared from idle; the filter kept from one filter effect to the next; and
                // (the ⚠ reading) the hold cleared whenever effect 1 starts from another.
                let same = self.on != 0 && (self.on == effect || (filter(self.on) && filter(effect)));
                if !same {
                    // §18, designed 2026-11-25: the grid starts at 0 from idle or another kind.
                    if effect == 1 {
                        self.acc = 0;
                    }
                    if filter(effect) {
                        self.s1 = 0.0;
                        self.s2 = 0.0;
                    }
                    // Effect 4: `head` and `full` cleared from idle or another kind.
                    if effect == 4 {
                        self.head = 0;
                        self.full = false;
                    }
                    // Effect 14 (ABI 13): `head`, `full`, the filter's two states and `still`.
                    if effect == 14 {
                        self.head = 0;
                        self.full = false;
                        self.s1 = 0.0;
                        self.s2 = 0.0;
                        self.still = 0;
                    }
                }
                self.on = effect;
                self.swept = 0;
                // §18, Session 30 (D95 item 4, R73): 5 at 210 Hz (300 before), 6 from 2 700 (3 240
                // before), 7 at 1 800, 8 from 220.
                self.cutoff = [0.0, 0.0, 0.0, 0.0, 0.0, 210.0, 2700.0, 1800.0, 220.0].get(effect as usize).copied().unwrap_or(0.0);
            } else if self.on == 6 || self.on == 8 {
                // The sweep's pseudo-code, exactly: each tick one of four cases, in its order.
                // Session 30: six steps round (288 ticks each way), 6 to 165 Hz, 8 to 3 300 Hz.
                let (start, end, out, back) = if self.on == 6 { (2700.0, 165.0, 0.990_341_84, 1.009_752_3) } else { (220.0, 3300.0, 1.009_447_3, 0.990_641_1) };
                for _ in 0..ticks {
                    self.swept += 1;
                    if self.swept == 576 {
                        self.swept = 0;
                        self.cutoff = start;
                    } else if self.swept == 288 {
                        self.cutoff = end;
                    } else if self.swept < 288 {
                        self.cutoff *= out;
                    } else {
                        self.cutoff *= back;
                    }
                }
            }
            self.heard = effect;
            let step = 500.0 / rate as f32;
            if effect != 0 {
                self.w = if self.w + step > 1.0 { 1.0 } else { self.w + step };
            } else {
                self.w -= step;
                if self.w <= 0.0 {
                    self.w = 0.0;
                    self.on = 0;
                }
            }
            // §18, designed 2026-11-25: once a frame while the bus runs effect 1, through its
            // ramp out too. `fresh = acc < 46 875`; `mu = acc × inv`, `inv = 1 / (4 × rate)`
            // as an f32; `acc = (acc + 46 875) mod (4 × rate)`, in 64 bits.
            if self.on == 1 {
                let inv = 1.0f32 / (4 * rate as u64) as f32;
                self.fresh = self.acc < 46_875;
                self.mu = self.acc as f32 * inv;
                self.acc = (self.acc + 46_875) % (4 * rate as u64);
            }
        }
    }

    /// The mix of a frame `advance` has moved: the sixteen voices, which go through the
    /// effects, the volume, and what came back on channel 17.
    pub(super) fn mixed(&mut self, rate: u32, v: &[f32], sounds: u16, volume: u8, back: f32) -> f32 {
        let gain = (volume as u32 * volume as u32) as f32 / 256.0;
        let with_back = |dry: f32| if back == 0.0 { dry * gain } else { (dry + back) * gain };
        if self.on == 0 {
            let mut sum = v[0];
            for s in &v[1..] {
                sum += *s;
            }
            return with_back(sum);
        }
        let (mut rest, mut b) = (0.0f32, 0.0f32);
        for (t, s) in v.iter().enumerate() {
            if sounds >> t & 1 == 1 {
                b += *s;
            } else {
                rest += *s;
            }
        }
        let wet = match self.on {
            e if e & 0x80 != 0 => 0.0,
            // §18, designed 2026-11-25: effect 1 is in the voices; its wet is the bus itself.
            1 => b,
            // Three times the bus, held to ±0.88 (±1 as designed; Session 26's comparison).
            2 => {
                let x = 3.0 * b;
                if x > 0.88 {
                    0.88
                } else if x < -0.88 {
                    -0.88
                } else {
                    x
                }
            }
            // §18's frame of effect 4, as its pseudo-code.
            4 => {
                let echo = if self.full { self.line[self.head] } else { 0.0 };
                self.line[self.head] = b;
                self.head += 1;
                if self.head == self.line.len() {
                    self.head = 0;
                    self.full = true;
                }
                b + 0.15 * echo
            }
            // §18, designed 2026-11-24: effect 14's frame, as its pseudo-code. The loop is the
            // first `comb` floats of the line, 858 / 46 875 s; the bus's filter, band output,
            // at 1 093 Hz and `r` 2; 2.05 round (2.24 as designed; Session 28's comparison), held to ±0.25; still after 1 ms of exact zero.
            14 => {
                self.still = if b == 0.0 { self.still + 1 } else { 0 };
                if self.still * 1000 >= rate as u64 {
                    b
                } else {
                    let comb = ((rate as u64 * 858 + 23_437) / 46_875) as usize;
                    let back = if self.full { self.line[self.head] } else { 0.0 };
                    let pi = core::f64::consts::PI;
                    let f = 1093.0f32 / rate as f32;
                    let a = (0.326_f32 as f64 * pi * pi * pi) as f32;
                    let c = (0.1823_f32 as f64 * pi * pi * pi * pi * pi) as f32;
                    let g = f * (pi as f32 + f * f * (a + c * (f * f)));
                    let r = 2.0f32;
                    let h = 1.0 / (1.0 + r * g + g * g);
                    let hp = (back - r * self.s1 - g * self.s1 - self.s2) * h;
                    let bp = g * hp + self.s1;
                    self.s1 = g * hp + bp;
                    let lp = g * bp + self.s2;
                    self.s2 = g * bp + lp;
                    let mut fb = 2.05 * bp;
                    if fb > 0.25 {
                        fb = 0.25;
                    } else if fb < -0.25 {
                        fb = -0.25;
                    }
                    self.line[self.head] = b + fb;
                    self.head += 1;
                    if self.head == comb {
                        self.head = 0;
                        self.full = true;
                    }
                    b + fb
                }
            }
            // `(floor(4.6 × bus) + 0.5) / 4.6`, the floor by a cast and a compare (4 as designed;
            // Session 26's comparison).
            3 => {
                let y = 4.6 * b;
                let mut t = (y as i32) as f32;
                if t > y {
                    t -= 1.0;
                }
                (t + 0.5) / 4.6
            }
            _ => {
                let pi = core::f64::consts::PI;
                let mut f = self.cutoff / rate as f32;
                if f > 0.3 {
                    f = 0.3;
                }
                let a = (0.326_f32 as f64 * pi * pi * pi) as f32;
                let c = (0.1823_f32 as f64 * pi * pi * pi * pi * pi) as f32;
                let g = f * (pi as f32 + f * f * (a + c * (f * f)));
                // `r` by the effect (Session 30, D95 item 4): 1/3 for 5 (Q 3), 1/6 for 7 (Q 6),
                // 1/4.5 for both sweeps (Q 4.5). Was 0.5 for 5 and 6, 1/6 for 7 and 8.
                let r = match self.on { 5 => 1.0 / 3.0, 7 => 1.0 / 6.0, _ => 1.0 / 4.5 };
                let h = 1.0 / (1.0 + r * g + g * g);
                let hp = (b - r * self.s1 - g * self.s1 - self.s2) * h;
                let bp = g * hp + self.s1;
                self.s1 = g * hp + bp;
                let lp = g * bp + self.s2;
                self.s2 = g * bp + lp;
                if self.on <= 6 { lp } else { hp }
            }
        };
        with_back(rest + b + self.w * (wet - b))
    }
}

/// §18, designed 2026-11-25 (ABI 14; D98): effect 1 is the voices slowed, so the model holds
/// voices of its own: a copy of the engine's taken before its first frame, hit as the engine's
/// are, asked and retuned one track at a time by the section's words. Beside `Model`, whose
/// grid (`fresh`, `mu`, `acc`) it reads. Kept apart from `voice.rs`'s own paths (`slow`,
/// `sound_slow`, the mask in `trigger`), so a slip in either shows as a difference.
pub(super) struct Voicing {
    v: Voices,
    /// While the effect the core sounds is 1, `fx_sounds`; otherwise 0.
    pub(super) slowed: u16,
    from: [f32; 16],
    to: [f32; 16],
}

/// The slow rate: 46 875 Hz (R69), whatever the host's.
pub(super) const SLOW: u32 = 46_875;

impl Voicing {
    /// From `h`'s engine as it is: call before its first frame.
    pub(super) fn of(h: &Host) -> Self {
        Voicing { v: unsafe { (*h.e).voices }, slowed: 0, from: [0.0; 16], to: [0.0; 16] }
    }

    /// One sound's next value: its code voice's, and its sample's if that is sounding, times
    /// the level (§11, as `sound` sums them).
    fn ask(&mut self, t: usize) -> f32 {
        let code = self.v.code_next(t);
        let s = &mut self.v.samples[t];
        (if s.sounding() { code + s.next() } else { code }) * LEVEL
    }

    /// A sound's code voice retuned, and its sample if it is sounding.
    fn tune(&mut self, t: usize, rate: u32) {
        self.v.code_tune(t, rate);
        if self.v.samples[t].sounding() {
            self.v.samples[t].retune(rate);
        }
    }

    /// What is slowed, read after the frame's commands and ticks and before its hits: each
    /// sound whose bit changed retuned (46 875 Hz if now slowed, the host's rate if not); each
    /// that became slowed asked once, `from = to =` that value; and if any became slowed, the
    /// grid starts again, so this frame is fresh with `mu` 0.
    pub(super) fn reconcile(&mut self, effect: u8, sounds: u16, rate: u32, m: &mut Model) {
        let now = if effect == 1 { sounds } else { 0 };
        for t in 0..16 {
            if (now ^ self.slowed) >> t & 1 == 1 {
                self.tune(t, if now >> t & 1 == 1 { SLOW } else { rate });
            }
        }
        let became = now & !self.slowed;
        for t in 0..16 {
            if became >> t & 1 == 1 {
                let x = self.ask(t);
                self.from[t] = x;
                self.to[t] = x;
            }
        }
        if became != 0 {
            m.acc = 0;
        }
        self.slowed = now;
    }

    /// The frame's hits, each with the A and B it was hit with: a slowed sound tuned for
    /// 46 875 Hz, any other for the host's rate. Its sample if switched to one that is given.
    pub(super) fn hits(&mut self, fired: u16, hit: &[[u16; 2]; 16], sampled: u16, rate: u32) {
        self.v.sampled = sampled;
        for t in 0..16 {
            if fired >> t & 1 == 1 {
                let r = if self.slowed >> t & 1 == 1 { SLOW } else { rate };
                if sampled >> t & 1 == 1 && self.v.samples[t].loaded() {
                    self.v.samples[t].trigger(hit[t], r);
                } else {
                    self.v.code_trigger(t, hit[t], r);
                }
            }
        }
    }

    /// The sixteen: a slowed sound on the grid's line (on a fresh frame `from = to`, `to =`
    /// its next value; on every frame `from + (to − from) × mu`), any other asked.
    pub(super) fn sound(&mut self, m: &Model) -> [f32; 16] {
        let mut out = [0f32; 16];
        for (t, o) in out.iter_mut().enumerate() {
            *o = if self.slowed >> t & 1 == 1 {
                if m.fresh {
                    self.from[t] = self.to[t];
                    self.to[t] = self.ask(t);
                }
                self.from[t] + (self.to[t] - self.from[t]) * m.mu
            } else {
                self.ask(t)
            };
        }
        out
    }
}

/// The tracks that fired in a frame's events.
pub(super) fn fired_in(ev: &[Event]) -> u16 {
    ev.iter().filter(|e| e.kind == EV_TRIG).fold(0, |m, e| m | 1 << (e.track & 15))
}

/// What the engine hit each track with, and which tracks play their samples.
pub(super) fn hit_of(h: &Host) -> ([[u16; 2]; 16], u16) {
    unsafe { ((*h.e).hit, (*h.e).voices.sampled) }
}

/// A line for effect 4 at `rate`, full of junk (never to be heard), lent to `h`'s engine. The
/// caller keeps it alive for as long as the engine runs.
pub(super) fn lend(h: &Host, rate: u32) -> Vec<f32> {
    let mut line = vec![7.0f32; pi_delay_frames(rate) as usize];
    assert_eq!(unsafe { pi_set_delay(h.e, line.as_mut_ptr(), line.len() as u32) }, 1);
    line
}

/// Runs `cmds` a frame at a time at `rate` in layout 17 and holds every frame's mix to the
/// model's, which is given the frame's sixteen voices and what the view says, and (ABI 12) a
/// line for effect 4 when the engine is lent one. Returns how many frames had an effect
/// running.
fn hold_to_model(rate: u32, cmds: &[(u64, Cmd)], frames: u64, line: bool) -> usize {
    hold_to_model_keeping(rate, cmds, frames, line, &mut Vec::new())
}

/// The same, keeping every frame's seventeen channels in `kept`.
fn hold_to_model_keeping(rate: u32, cmds: &[(u64, Cmd)], frames: u64, line: bool, kept: &mut Vec<[f32; 17]>) -> usize {
    hold_to_model_with(rate, cmds, frames, line, kept, |_| {})
}

/// The same, with `setup` given the engine before its first frame (a sample lent, say: the
/// model's voices are a copy of the engine's taken after it).
fn hold_to_model_with(rate: u32, cmds: &[(u64, Cmd)], frames: u64, line: bool, kept: &mut Vec<[f32; 17]>, setup: impl Fn(&Host)) -> usize {
    let h = Host::new(rate, 1);
    setup(&h);
    let _keep = if line { lend(&h, rate) } else { Vec::new() };
    let mut m = if line { Model::lent(pi_delay_frames(rate)) } else { Model::new() };
    let mut vm = Voicing::of(&h);
    let mut next = 0;
    let mut e_before = 0u32;
    let mut running = 0;
    for f in 0..frames {
        let mut these = Vec::new();
        while next < cmds.len() && cmds[next].0 == f {
            these.push(cmds[next].1);
            next += 1;
        }
        let mut out = [0f32; 17];
        let mut ev = [Event::default(); CAP];
        let n = unsafe { pi_process(h.e, 1, these.as_ptr(), these.len() as u32, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 17) };
        let v = h.view();
        // The view's tick is the last one emitted: the ticks this frame are its difference.
        let tick = u32::from_le_bytes([v[0], v[1], v[2], v[3]]);
        let ticks = if f == 0 { 0 } else { tick.wrapping_sub(e_before) };
        e_before = tick;
        let heard = v[55];
        let effect = if SEVEN.contains(&(heard as u32)) || ((heard == 4 || heard == 14) && line) { heard } else { 0 };
        let sounds = u16::from_le_bytes([v[58], v[59]]);
        // ABI 14: the voices too, the model's own, slowed by §18's words (D98 item 7: the
        // sixteen track channels carry a slowed voice slowed).
        let (hit, sampled) = hit_of(&h);
        vm.reconcile(effect, sounds, rate, &mut m);
        vm.hits(fired_in(&ev[..n as usize]), &hit, sampled, rate);
        m.advance(effect, ticks, rate);
        let voices = vm.sound(&m);
        for t in 0..16 {
            assert_eq!(out[t].to_bits(), voices[t].to_bits(), "rate {rate}, frame {f}: track {t} {} against the model's {} (slowed {:#06x})", out[t], voices[t], vm.slowed);
        }
        let want = m.mixed(rate, &voices, sounds, v[27], 0.0);
        assert_eq!(out[16].to_bits(), want.to_bits(), "rate {rate}, frame {f}: the mix {} against the model's {}", out[16], want);
        running += (m.on != 0) as usize;
        assert_eq!(bus(&h).probe().0, m.on, "rate {rate}, frame {f}: the effect running");
        kept.push(out);
    }
    running
}

/// Two bars of the minimum beat with every kind of change §18 names: each effect from idle,
/// one effect straight to another (a filter to a filter, a filter from another kind, the hold
/// from another kind), a sweep held over two steps and restarted, a punch over the lane, a
/// sound switched out and the volume down.
///
/// ABI 14 (§18, designed 2026-11-25: effect 1, the voices slowed): on step 28 effect 1 is
/// punched while 5 ramps out (from another kind), let go and heard again inside its ramp out;
/// the tone is hit under it and hit again while it sounds; the bass drum, sounding, is switched
/// out of the effects (it speeds up) and back in (slowed again, the grid started again); the
/// closed hat is hit again while it sounds; and on step 29 1 goes off with the tone sounding.
pub(super) fn tour(step: u64) -> Vec<(u64, Cmd)> {
    let mut edits = beat();
    edits.extend([on(9, 3), on(9, 11), fxsound(1, 0)]);
    for (s, e) in [(1, 1), (2, 1), (3, 2), (4, 3), (5, 2), (6, 5), (7, 6), (8, 6), (9, 7), (10, 8), (11, 5), (13, 7)] {
        edits.push(fx(s, e));
    }
    let mut c = at_zero(&edits);
    c.insert(0, (0, up(BPM)));
    c.insert(0, (0, up(11)));
    c.insert(0, (0, down(11)));
    c.insert(0, (0, down(BPM))); // volume 12
    for (s, cmds) in [(17, vec![down(FX), down(0)]), (18, vec![down(6)]), (20, vec![up(6)]), (22, vec![up(0), up(FX)])] {
        for k in cmds {
            c.push((s * step + 1, k));
        }
    }
    let fire = |t: u8| cmd(CMD_FIRE, t, 0, 0);
    for (at, k) in [
        (1, down(FX)),
        (1, down(0)),
        (41, up(0)),
        (81, down(0)),
        (100, fire(14)),
        (500, fxsound(0, 0)),
        (2000, fxsound(0, 1)),
        (3000, fire(2)),
        (4000, fire(14)),
        (step + 1, up(0)),
        (step + 1, up(FX)),
    ] {
        c.push((28 * step + at, k));
    }
    c
}

/// The tour with effect 4 on steps 14, 15 and 0 (ABI 12): from idle at play for one step,
/// then from another kind (7) for three, long enough to echo (a step is 125 ms at 120 bpm,
/// the echo 174.76 ms), then into effect 1. `tour` itself is shared with `route.rs`, whose
/// loop tour sets those steps its own way.
fn tour_with_echo(step: u64) -> Vec<(u64, Cmd)> {
    let mut c = tour(step);
    let at = c.iter().position(|x| x.1.kind == CMD_PLAY).unwrap();
    for s in [14, 15, 0] {
        c.insert(at, (0, fx(s, 4)));
    }
    c
}

/// The echo's tour with effect 14 on steps 12 and 15 (ABI 13): from a filter (5 on step
/// 11) and straight to another (7 on 13); then from 4 (step 14) and straight to 4 (step 0).
fn tour_with_feedback(step: u64) -> Vec<(u64, Cmd)> {
    let mut c = tour_with_echo(step);
    let at = c.iter().position(|x| x.1.kind == CMD_PLAY).unwrap();
    for s in [12, 15] {
        c.insert(at, (0, fx(s, 14)));
    }
    c
}

/// A sparse beat for effect 14 (ABI 13): the kick on step 1 and the snare on step 11, 14 on
/// every step. Between them the bus is exact zero for long stretches: the loop stands still.
fn sparse_feedback() -> Vec<Cmd> {
    let mut edits = vec![on(0, 0), on(1, 10)];
    edits.extend((0..16).map(|s| fx(s, 14)));
    edits
}

#[test]
fn the_mix_is_the_model_s_bit_for_bit_at_three_rates() {
    for rate in [44_100u32, 48_000, 96_000] {
        let step = rate as u64 / 8; // 120 bpm
        let running = hold_to_model(rate, &tour(step), 32 * step, false);
        assert!(running as u64 > 10 * step, "rate {rate}: effects ran on {running} frames");
        // ABI 12: with a line lent, effect 4 echoes in the tour.
        let running = hold_to_model(rate, &tour_with_echo(step), 32 * step, true);
        assert!(running as u64 > 13 * step, "rate {rate}, a line lent: effects ran on {running} frames");
        // ABI 13: and effect 14 feeds back in it, and over a sparse beat stands still.
        let running = hold_to_model(rate, &tour_with_feedback(step), 32 * step, true);
        assert!(running as u64 > 15 * step, "rate {rate}, 14 in the tour: effects ran on {running} frames");
        let running = hold_to_model(rate, &at_zero(&sparse_feedback()), 32 * step, true);
        assert!(running as u64 > 31 * step, "rate {rate}, 14 over a sparse beat: effects ran on {running} frames");
    }
}

#[test]
fn the_mix_is_the_model_s_on_edges_too() {
    // The same, on an external clock, an edge a step: the sweeps move by ticks, so they
    // follow the edges, a burst at each. With a line lent, and effect 4 in the tour.
    // ABI 13: the tour with effect 14 in it.
    let mut c = tour_with_feedback(STEP);
    c.insert(0, (0, cmd(CMD_SOURCE, 0, 0, 1)));
    for s in 0..32 {
        c.push((s * STEP, cmd(CMD_CLOCK, 0, 0, 0)));
    }
    c.sort_by_key(|x| x.0); // stable: each frame's commands keep their order
    hold_to_model(SR, &c, 32 * STEP, true);
}

/// Session 36 (D102): with effect 1 slowing all but one sound, the one left out is asked as a
/// plain sound beside fifteen lines (`sound_slow`'s second way). Each of the sixteen in turn,
/// every sound hit now and then, held to the model's own voices. Added after a planted fault
/// (track 3 never asked on that path) passed every test: the tour leaves out only the snare and
/// the bass drum, and `tests/quiet.rs` holds the engine to itself, planted code and all.
#[test]
fn effect_1_with_any_one_sound_out_of_the_effects_is_the_model_s_bit_for_bit() {
    for out in 0..16u8 {
        let mut c: Vec<(u64, Cmd)> = (0..16u8).map(|s| (0, fx(s, 1))).collect();
        c.extend([(0, fxsound(out, 0)), (0, play())]);
        for i in 0..24u64 {
            c.push((50 + i * 700, cmd(CMD_FIRE, ((i * 5 + out as u64) % 16) as u8, 0, 0)));
            if i % 3 == 0 {
                c.push((50 + i * 700, cmd(CMD_FIRE, out, 0, 0)));
            }
        }
        c.sort_by_key(|x| x.0);
        let running = hold_to_model(SR, &c, 20_000, false);
        assert!(running > 15_000, "sound {out} out: effect 1 ran on {running} frames");
    }
}

// ---- The rules, each alone ----

#[test]
fn idle_is_the_plain_mix_and_after_an_effect_ramps_out_it_is_again() {
    // An effect on step 1 only: before it, and from 2 ms after it ends, the mix is the same
    // bits as the beat with no effect at all.
    for effect in SEVEN {
        let mut with = beat();
        with.push(fx(1, effect));
        let (a, b) = (mix(&with, SR, 4 * STEP as usize), mix(&beat(), SR, 4 * STEP as usize));
        assert!(same_bits(&a[..STEP as usize], &b[..STEP as usize]), "effect {effect}: before it");
        let back = 2 * STEP as usize + 96;
        if effect == 1 {
            // ABI 14 (§18, designed 2026-11-25; D98 item 3): effect 1 slows the voices, and a
            // sound sounding when it goes off carries on from where it is (and a noise voice
            // asked fewer times is elsewhere in its noise), so the beat after it is not the
            // beat that never had it. What holds is the rule itself: from 2 ms after, the bus
            // is idle and the mix is the plain sum of the sixteen track channels.
            let mut h = Host::new(SR, 1);
            let both = render(&mut h, 4 * STEP as usize, 128, 17, &at_zero(&with)).0;
            for f in back..4 * STEP as usize {
                let fr = &both[f * 17..f * 17 + 17];
                let mut sum = fr[0];
                for x in &fr[1..16] {
                    sum += *x;
                }
                assert_eq!(fr[16].to_bits(), sum.to_bits(), "effect 1: frame {f}, from 2 ms after it, the plain sum");
            }
            assert_eq!(bus(&h).probe().0, 0, "effect 1: idle after");
        } else {
            assert!(same_bits(&a[back..], &b[back..]), "effect {effect}: from 2 ms after it");
        }
        assert!(!same_bits(&a[STEP as usize..2 * STEP as usize], &b[STEP as usize..2 * STEP as usize]), "effect {effect}: heard");
    }
}

#[test]
fn the_ramp_is_two_milliseconds_in_and_out() {
    for rate in [44_100u32, 48_000, 96_000] {
        let step = rate as u64 / 8;
        let mut h = Host::new(rate, 1);
        let mut edits = beat();
        edits.push(fx(1, 3));
        render(&mut h, step as usize, 128, 1, &at_zero(&edits));
        let frames = |ms: u64| (rate as u64 * ms / 1000) as usize;
        let mut ws = Vec::new();
        for _ in 0..2 * step {
            render(&mut h, 1, 1, 1, &[]);
            ws.push(bus(&h).probe().1);
        }
        let first = ws.iter().position(|w| *w > 0.0).unwrap();
        assert!(ws[first] < 0.02, "rate {rate}: the first heard frame is one step in");
        let full = ws[first..].iter().position(|w| *w == 1.0).unwrap() + 1;
        assert!(full >= frames(2) && full <= frames(2) + 1, "rate {rate}: 1 after {full} frames");
        let end = first + ws[first..].iter().position(|w| *w < 1.0 && *w > 0.0 && ws[first + full..].contains(w)).unwrap_or(0);
        let fall = ws[end..].iter().position(|w| *w == 0.0).unwrap() + 1;
        assert!(fall >= frames(2) && fall <= frames(2) + 1, "rate {rate}: 0 after {fall} frames");
        assert_eq!(bus(&h).probe().0, 0, "rate {rate}: idle again");
    }
}

#[test]
fn a_sound_switched_out_of_the_effects_is_the_same_in_the_mix_with_and_without_one() {
    // The bass drum out, alone: every bit the same. Then with the rest of the beat in the
    // bus: the mix with the drum less the mix without it is the drum, to a float's rounding.
    for effect in SEVEN {
        let kick: Vec<Cmd> = (0..16).step_by(2).map(|s| on(0, s)).chain([fxsound(0, 0)]).collect();
        let mut lane = kick.clone();
        lane.extend((0..16).map(|s| fx(s, effect)));
        let (with, without) = (mix(&lane, SR, 2 * STEP as usize), mix(&kick, SR, 2 * STEP as usize));
        if effect != 3 {
            assert!(same_bits(&with, &without), "effect {effect}: alone");
        } else {
            // Effect 3 on a silent bus is half a step times the ramp (D91 item 7), heard from
            // frame 0: the drum, plus that, to a float's rounding.
            let (step, mut w) = (500.0 / SR as f32, 0.0f32);
            for f in 0..with.len() {
                w = if w + step > 1.0 { 1.0 } else { w + step };
                assert!((with[f] - without[f] - w * (0.5f32 / 4.6)).abs() < 1e-6, "effect 3 alone, frame {f}");
            }
        }

        let rest: Vec<Cmd> = beat().into_iter().filter(|c| c.a != 0).chain((0..16).map(|s| fx(s, effect))).collect();
        let mut all = rest.clone();
        all.extend(kick.iter().copied());
        let (with, without) = (mix(&all, SR, 2 * STEP as usize), mix(&rest, SR, 2 * STEP as usize));
        let mut h = Host::new(SR, 1);
        let drum = render(&mut h, 2 * STEP as usize, 128, 1, &at_zero(&kick)).0;
        for f in 0..with.len() {
            assert!((with[f] - without[f] - drum[f]).abs() < 1e-6, "effect {effect}, frame {f}");
        }
    }
}

#[test]
fn the_sixteen_track_channels_are_never_touched() {
    let mut edits = beat();
    edits.extend((0..16).map(|s| fx(s, 2)));
    let mut a = Host::new(SR, 1);
    let mut b = Host::new(SR, 1);
    let x = render(&mut a, 2 * STEP as usize, 128, 16, &at_zero(&edits)).0;
    let y = render(&mut b, 2 * STEP as usize, 128, 16, &at_zero(&beat())).0;
    assert!(same_bits(&x, &y));
}

#[test]
fn every_effect_on_silence_is_exact_silence_but_3_which_is_an_eighth_ramped() {
    // Replaces "every effect on silence is exact silence" (D91 item 7): 1, 2 and 5 to 8 still
    // are, and 4 with a line lent; effect 3 rests half a step off zero, so silence is half a
    // step (0.5 / 4.6 since Session 26's comparison; 1/8 as designed) times the ramp, exactly.
    for effect in [1u32, 2, 3, 4, 5, 6, 7, 8] {
        let lane: Vec<Cmd> = (0..16).map(|s| fx(s, effect)).collect();
        let mut h = Host::new(SR, 1);
        let _line = lend(&h, SR);
        let out = render(&mut h, 2 * STEP as usize, 128, 1, &at_zero(&lane)).0;
        if effect == 4 {
            assert_eq!(bus(&h).probe().0, 4, "effect 4 ran");
        }
        if effect != 3 {
            assert!(out.iter().all(|x| x.to_bits() == 0), "effect {effect}");
            continue;
        }
        // Heard from frame 0 (tick 0 is in it): w goes up 500 / rate a frame, held at 1.
        let (step, mut w) = (500.0 / SR as f32, 0.0f32);
        for (f, x) in out.iter().enumerate() {
            w = if w + step > 1.0 { 1.0 } else { w + step };
            assert_eq!(x.to_bits(), (w * (0.5f32 / 4.6)).to_bits(), "effect 3, frame {f}");
        }
    }
}

/// A steady `x` returned as sound 1 in the loop layout, `effect` on every step, for 1 000
/// frames: the mix of the last, the ramp long full. The bus is `x` exactly and the rest 0,
/// so the mix is `x + (wet − x)` at the volume's gain of 1.
fn steady(effect: u32, x: f32) -> f32 {
    let h = Host::new(SR, 1);
    let mut cmds: Vec<Cmd> = vec![cmd(CMD_ROUTE, 0, 0, 1)];
    cmds.extend((0..16).map(|s| fx(s, effect)));
    cmds.push(play());
    let mut io = [0f32; 18];
    for f in 0..1000 {
        io = [0.0; 18];
        io[0] = x;
        let c: &[Cmd] = if f == 0 { &cmds } else { &[] };
        let mut ev = [Event::default(); CAP];
        unsafe { pi_process(h.e, 1, c.as_ptr(), c.len() as u32, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), 18) };
    }
    io[16]
}

/// The mix of the beat with an effect on every step, from the frame the ramp is full.
fn full_wet(effect: u32, rate: u32) -> Vec<f32> {
    let mut edits = beat();
    edits.extend((0..16).map(|s| fx(s, effect)));
    let out = mix(&edits, rate, rate as usize * 2);
    out[rate as usize / 100..].to_vec()
}

// `effect_1_holds_at_1_khz_at_every_rate` went with the hold (ABI 14; §18, designed
// 2026-11-25): effect 1 is the voices slowed. The rules that replaced it are in that section's
// tests below, from `effect_1_s_grid_...` on.

#[test]
fn effect_2_is_three_times_the_bus_under_the_ceiling_and_never_past_it() {
    // Replaces "effect 2 is soft clipped under 0.7" (D90 item 2, D91 item 7). The ceiling is
    // 0.88 since Session 26's comparison (±1 as designed). Values whose sums are exact.
    for (x, want) in [(0.25f32, 0.75f32), (-0.25, -0.75), (0.28125, 0.84375), (-0.28125, -0.84375), (0.5, 0.88), (-1.0, -0.88), (1.0, 0.88)] {
        assert_eq!(steady(2, x), want, "effect 2 on a bus of {x}");
    }
    let out = full_wet(2, SR);
    let peak = out.iter().fold(0f32, |m, x| m.max(x.abs()));
    assert!(peak <= 0.88 + 1e-6 && peak > 0.8, "effect 2 on the beat peaks at {peak}");
}

#[test]
fn effect_3_sits_on_half_steps_and_silence_is_plus_half_a_step() {
    // Replaces "effect 3 is twelve levels a unit" (D91 item 7): `(floor(L bus) + 0.5) / L`,
    // L = 4.6 since Session 26's comparison (4 as designed). Level k is (k + 0.5) / L. Just
    // under zero is level −1, not 0: a floor, not a cast towards zero. Silence is exact.
    assert_eq!(steady(3, 0.0), 0.5f32 / 4.6);
    for (x, k) in [(-1.0f32 / 1024.0, -1i32), (0.3, 1), (-0.3, -2), (0.25, 1), (-0.25, -2), (0.9, 4), (-0.9, -5)] {
        let want = (k as f32 + 0.5) / 4.6;
        let got = steady(3, x);
        assert!((got - want).abs() < 1e-6, "effect 3 on a bus of {x}: {got}, not level {k} ({want})");
    }
    for x in full_wet(3, SR) {
        let h = x * 4.6 * 2.0;
        assert!((h - h.round()).abs() < 1e-4 && h.round() as i32 % 2 != 0, "effect 3: {x} is not on a half step");
    }
}

#[test]
fn the_filter_s_r_goes_with_the_effect_a_third_for_5_a_sixth_for_7_and_1_over_4_5_for_the_sweeps() {
    // `h = 1 / (1 + r g + g²)`, made again when the effect changes: 5, 7, 6, 8 straight on,
    // a step each. Kept from one filter effect to the next, the states carry across (as the
    // test below holds); only `r` follows the effect.
    let mut h = Host::new(SR, 1);
    let mut edits = beat();
    edits.extend([fx(1, 5), fx(2, 7), fx(3, 6), fx(4, 8)]);
    render(&mut h, STEP as usize + 100, 128, 1, &at_zero(&edits));
    for (effect, r) in [(5u8, 1.0f32 / 3.0), (7, 1.0 / 6.0), (6, 1.0 / 4.5), (8, 1.0 / 4.5)] {
        let (on, ..) = bus(&h).probe();
        let (g, hh) = bus(&h).tuning();
        assert_eq!(on, effect);
        assert_eq!(hh.to_bits(), (1.0 / (1.0 + r * g + g * g)).to_bits(), "effect {effect}: r {r}");
        render(&mut h, STEP as usize, 128, 1, &[]);
    }
}

#[test]
fn the_lowpass_takes_the_hats_away_and_the_hipass_the_drum() {
    // Effects 5 and 7 against the dry beat: the energy above and below.
    let dry = full_wet(0, SR);
    let diff = |o: &[f32]| o.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f32>();
    let level = |o: &[f32]| o.iter().map(|x| x.abs()).sum::<f32>();
    assert!(diff(&full_wet(5, SR)) < diff(&dry) / 4.0, "the lowpass at 210 Hz leaves little that moves fast");
    assert!(level(&full_wet(7, SR)) < level(&dry) / 2.0, "the hipass at 1.8 kHz takes the drum's weight");
}

/// The cutoff after `steps` steps of `effect` on every step, playing from frame 0, on the
/// table clock or on edges.
fn cutoff_after(effect: u32, ticks: u64, edges: bool) -> f32 {
    let h = Host::new(SR, 1);
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, fx(s, effect))).collect();
    if edges {
        c.insert(0, (0, cmd(CMD_SOURCE, 0, 0, 1)));
    }
    c.push((0, play()));
    if edges {
        // An edge a step, at an uneven 4000 frames: the ticks between are spread by the
        // clock's own measure, then an edge finishes the step.
        for s in 0..=ticks / 96 + 1 {
            c.push((s * 4000, cmd(CMD_CLOCK, 0, 0, 0)));
        }
        c.sort_by_key(|x| x.0);
    }
    // Run until exactly `ticks` ticks have passed since the first (the tick heard began).
    let mut next = 0;
    let mut f = 0u64;
    loop {
        let mut these = Vec::new();
        while next < c.len() && c[next].0 == f {
            these.push(c[next].1);
            next += 1;
        }
        let mut out = [0f32; 1];
        let mut ev = [Event::default(); CAP];
        unsafe { pi_process(h.e, 1, these.as_ptr(), these.len() as u32, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 1) };
        let v = h.view();
        if u32::from_le_bytes([v[0], v[1], v[2], v[3]]) as u64 >= ticks {
            assert_eq!(u32::from_le_bytes([v[0], v[1], v[2], v[3]]) as u64, ticks, "a frame landed past the tick");
            return bus(&h).probe().2;
        }
        f += 1;
    }
}

#[test]
fn a_sweep_turns_at_288_ticks_is_back_at_576_exactly_and_is_the_same_on_both_clocks() {
    // Session 30 (D95 item 4, R73): six steps round, out over 288 ticks, back over 288, each
    // end set exactly. 287 multiplies of 6 reach 166.6 Hz, 287 back 2 673.9 Hz; of 8,
    // 3 269.2 Hz and 222.1 Hz (worked off the engine in f32). Was nine steps (432 and 864),
    // 6 from 3 240 to 190 Hz, 8 from 220 to 2 900 Hz.
    for (effect, from, to, back) in [(6u32, 2700.0f32, 165.0f32, 1.009_752_3f32), (8, 220.0, 3300.0, 0.990_641_1)] {
        // Edges come a step at a time, so compare at step boundaries: tick 96 n.
        for steps in [1u64, 5, 9, 15] {
            let (t, e) = (cutoff_after(effect, steps * 96, false), cutoff_after(effect, steps * 96, true));
            assert_eq!(t.to_bits(), e.to_bits(), "effect {effect}, {steps} steps: {t} on the table, {e} on edges");
        }
        assert_eq!(cutoff_after(effect, 0, false), from, "effect {effect}: where it starts");
        let (near_far, near_back) = if effect == 6 { (166.6f32, 2673.9f32) } else { (3269.2, 222.1) };
        let a = cutoff_after(effect, 287, false);
        assert!((a - near_far).abs() < 1.0, "effect {effect}: {a} Hz after 287 ticks");
        assert_eq!(cutoff_after(effect, 288, false), to, "effect {effect}: the far end, exactly");
        assert_eq!(cutoff_after(effect, 289, false).to_bits(), (to * back).to_bits(), "effect {effect}: turned");
        let b = cutoff_after(effect, 575, false);
        assert!((b - near_back).abs() < 1.0, "effect {effect}: {b} Hz after 575 ticks");
        assert_eq!(cutoff_after(effect, 576, false), from, "effect {effect}: back at its start, exactly");
        assert_eq!(cutoff_after(effect, 2 * 576, false), from, "effect {effect}: and again");
    }
}

#[test]
fn a_sweep_starts_again_with_each_run() {
    // Effect 6 on steps 1 and 3, not 2: at step 3 it is back at its start; on steps 1 and 2
    // held over both, it is not.
    let at = |lane: &[(u8, u32)], frames: u64| {
        let mut h = Host::new(SR, 1);
        let edits: Vec<Cmd> = lane.iter().map(|(s, e)| fx(*s, *e)).collect();
        render(&mut h, frames as usize, 128, 1, &at_zero(&edits));
        bus(&h).probe().2
    };
    assert_eq!(at(&[(1, 6), (3, 6)], 3 * STEP + 1), 2700.0);
    assert!(at(&[(1, 6), (2, 6), (3, 6)], 3 * STEP + 1) < 2000.0);
    // A punch of 6 over a lane of 6 is still 6 heard: no new run.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6), fx(2, 6), fx(3, 6)]);
    c.extend([(2 * STEP + 1, down(FX)), (2 * STEP + 1, down(5))]);
    render(&mut h, 3 * STEP as usize + 1, 128, 1, &c);
    assert!(bus(&h).probe().2 < 2000.0);
    // Heard 6, then none, then 6 again a millisecond later, while the first is still ramping
    // out: heard became 6 again, so the sweep starts again, though the bus never went idle.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6)]);
    c.extend([(2 * STEP + 48, down(FX)), (2 * STEP + 48, down(5))]);
    render(&mut h, 2 * STEP as usize + 49, 128, 1, &c);
    let (on, w, cutoff, ..) = bus(&h).probe();
    assert!(on == 6 && w > 0.0 && w < 1.0, "still ramping: {on} at {w}");
    assert_eq!(cutoff, 2700.0);
}

#[test]
fn the_repeats_and_the_effects_not_built_leave_the_mix_the_plain_sum() {
    // §18's seven only: with 4 and 9 to 16 on every step the bus never runs, and the mix is
    // the sum of the sixteen channels in track order, bit for bit. Session 28 (ABI 13) kept 13
    // and 14 here, though §17 said both would go: 13 is the sequencer's, as 9 to 12 are (it
    // moves which voices sound, never the mix's sum), and 14 with no line lent is the plain
    // sum, as 4 is (§18's own table: "keeps 14 with no line, as it keeps 4").
    for effect in [4u32, 9, 10, 11, 12, 13, 14, 15, 16] {
        let mut edits = beat();
        edits.extend((0..16).map(|s| fx(s, effect)));
        let mut h = Host::new(SR, 1);
        let out = render(&mut h, 2 * STEP as usize, 128, 17, &at_zero(&edits)).0;
        for f in out.chunks(17) {
            let mut sum = f[0];
            for x in &f[1..16] {
                sum += *x;
            }
            assert_eq!(f[16].to_bits(), sum.to_bits(), "effect {effect}");
        }
        assert_eq!(bus(&h).probe().0, 0, "effect {effect}: the bus never ran");
    }
}

#[test]
fn the_filter_is_cleared_from_idle_and_kept_from_one_filter_effect_to_the_next() {
    // 5 then 7 on the next step: at 7's first frame the filter still holds 5's state.
    // The same bus into both: one engine ran 5 on step 1, the other nothing (so 7 starts from
    // idle there). At 7's first frame their filters must differ: 5's state was kept.
    let first_of_7 = |lane: &[Cmd]| {
        let mut h = Host::new(SR, 1);
        let mut edits = beat();
        edits.extend(lane.iter().copied());
        render(&mut h, 2 * STEP as usize + 1, 128, 1, &at_zero(&edits));
        let (on, _, cutoff, s1, s2) = bus(&h).probe();
        assert_eq!((on, cutoff), (7, 1800.0));
        (s1, s2)
    };
    assert_ne!(first_of_7(&[fx(1, 5), fx(2, 7)]), first_of_7(&[fx(2, 7)]), "kept from 5 to 7");
    // Now from idle: a fresh run of 7 after the ramp has gone out starts from zero, so its
    // first frames are those of an engine that never ran an effect.
    let mut a = beat();
    a.extend([fx(1, 5), fx(3, 7)]);
    let mut b = beat();
    b.push(fx(3, 7));
    let (x, y) = (mix(&a, SR, 4 * STEP as usize), mix(&b, SR, 4 * STEP as usize));
    assert!(same_bits(&x[3 * STEP as usize..], &y[3 * STEP as usize..]), "from idle the filter starts clean");
}

#[test]
fn one_effect_straight_to_another_starts_at_once_with_the_ramp_as_it_is() {
    let mut h = Host::new(SR, 1);
    let mut edits = beat();
    edits.extend([fx(1, 2), fx(2, 3)]);
    render(&mut h, 2 * STEP as usize, 128, 1, &at_zero(&edits));
    assert_eq!(bus(&h).probe().0, 2, "effect 2 to the end of step 1");
    assert_eq!(bus(&h).probe().1, 1.0);
    render(&mut h, 1, 1, 1, &[]);
    let (on, w, ..) = bus(&h).probe();
    assert_eq!((on, w), (3, 1.0), "3 at once, the ramp still full");
}

#[test]
fn sound_changes_no_event_no_snapshot_and_no_generation() {
    for effect in SEVEN {
        let mut edits = beat();
        edits.extend((0..16).map(|s| fx(s, effect)));
        let cmds = at_zero(&edits);
        let mut a = Host::new(SR, 1);
        let mut b = Host::new(SR, 1);
        let ea = a.run(2 * STEP, 128, &cmds);
        let (_, tb) = render(&mut b, 2 * STEP as usize, 128, 1, &cmds);
        assert_eq!(ea.iter().filter(|(_, e)| e.kind == EV_TRIG).map(|(f, _)| *f).collect::<Vec<_>>(), tb);
        assert_eq!((a.save(), a.generation()), (b.save(), b.generation()), "effect {effect}");
    }
}

// `a_rate_change_mid_effect_keeps_the_hold_at_1_khz` went with the hold (ABI 14): replaced by
// `a_rate_change_while_slowed_leaves_the_slowed_voices_tuning`, below.

// ---- §18, designed 2026-11-24: effect 4, the delay in a lent line (ABI 12; D91 items 4, 5) ----

/// Runs a fresh engine (`line`: lent one of `pi_delay_frames + extra` floats, the last
/// `extra` a guard) in the 18-channel loop with `xs[f]` returned as sound 1 on frame `f` and
/// `cmds` on frame 0. The mix of each frame, and the line.
fn looped_with(rate: u32, cmds: &[Cmd], xs: &[f32], line: bool, extra: usize) -> (Vec<f32>, Vec<f32>, Host) {
    let h = Host::new(rate, 1);
    let mut l = vec![7.0f32; pi_delay_frames(rate) as usize + extra];
    for g in l.iter_mut().rev().take(extra) {
        *g = -12_345.0;
    }
    if line {
        assert_eq!(unsafe { pi_set_delay(h.e, l.as_mut_ptr(), l.len() as u32) }, 1);
    }
    let mut first: Vec<Cmd> = vec![cmd(CMD_ROUTE, 0, 0, 1)];
    first.extend_from_slice(cmds);
    let mut out = Vec::with_capacity(xs.len());
    for (f, x) in xs.iter().enumerate() {
        let mut io = [0f32; 18];
        io[0] = *x;
        let c: &[Cmd] = if f == 0 { &first } else { &[] };
        let mut ev = [Event::default(); CAP];
        unsafe { pi_process(h.e, 1, c.as_ptr(), c.len() as u32, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), 18) };
        out.push(io[16]);
    }
    (out, l, h)
}

/// A bus that moves on every frame and is never −0: −1 to 1 in thousandths.
fn moving(n: usize) -> Vec<f32> {
    (0..n).map(|f| ((f * 7919) % 2000) as f32 / 1000.0 - 1.0 + 0.0005).collect()
}

#[test]
fn pi_delay_frames_is_the_nearest_frame_to_174_76_ms() {
    assert_eq!([pi_delay_frames(44_100), pi_delay_frames(48_000), pi_delay_frames(96_000)], [7_707, 8_389, 16_777]);
    assert_eq!(pi_delay_frames(46_875), 8_192);
    assert_eq!(pi_delay_frames(u32::MAX), ((u32::MAX as u64 * 8192 + 23_437) / 46_875) as u32);
}

#[test]
fn pi_set_delay_refuses_null_misaligned_and_short_and_then_holds_no_line() {
    let h = Host::new(SR, 1);
    let need = pi_delay_frames(SR);
    let mut room = vec![0f32; need as usize + 2];
    let ok = |p: *mut f32, n: u32| unsafe { pi_set_delay(h.e, p, n) };
    assert_eq!(ok(room.as_mut_ptr(), need), 1, "exactly long enough");
    assert!(bus(&h).lent());
    assert_eq!(ok(core::ptr::null_mut(), need), 0, "null");
    assert!(!bus(&h).lent(), "a refusal leaves no line");
    assert_eq!(ok(room.as_mut_ptr(), need + 1), 1, "longer is taken");
    let odd = unsafe { room.as_mut_ptr().cast::<u8>().add(2).cast::<f32>() };
    assert_eq!(ok(odd, need), 0, "misaligned");
    assert!(!bus(&h).lent());
    assert_eq!(ok(room.as_mut_ptr(), need - 1), 0, "short");
    assert!(!bus(&h).lent());
    assert_eq!(unsafe { pi_set_delay(core::ptr::null_mut(), room.as_mut_ptr(), need) }, 0, "no engine");
    // With no line effect 4 is no effect of the core's: the mix is the bus as it came in.
    let lane: Vec<Cmd> = (0..16).map(|s| fx(s, 4)).chain([play()]).collect();
    let xs = moving(2 * STEP as usize);
    let (a, _, ha) = looped_with(SR, &lane, &xs, false, 0);
    assert_eq!(bus(&ha).probe().0, 0, "effect 4 with no line: the bus never ran");
    assert!(same_bits(&a, &xs), "the plain sum");
}

#[test]
fn with_a_line_4_is_the_bus_for_pi_delay_frames_then_the_bus_and_0_15_of_it_that_far_back() {
    // §18's frame: echo = line[head] once full; at w the mix is `0 + bus + w (wet − bus)`,
    // `wet = bus + 0.15 echo`. Heard from frame 0 (tick 0 is in it), so the run's first
    // frame is 0. The line was full of junk (7.0) when lent and is never heard; a guard after
    // its `pi_delay_frames` floats is never written. At three rates, bit for bit.
    for rate in [44_100u32, 48_000, 96_000] {
        let d = pi_delay_frames(rate) as usize;
        let xs = moving(3 * d + 500);
        let lane: Vec<Cmd> = (0..16).map(|s| fx(s, 4)).chain([play()]).collect();
        let (out, line, h) = looped_with(rate, &lane, &xs, true, 3);
        let (step, mut w) = (500.0 / rate as f32, 0.0f32);
        for (f, got) in out.iter().enumerate() {
            w = if w + step > 1.0 { 1.0 } else { w + step };
            let echo = if f >= d { xs[f - d] } else { 0.0 };
            let x = xs[f];
            let want = (0.0f32 + x + w * ((x + 0.15 * echo) - x)) * 1.0;
            assert_eq!(got.to_bits(), want.to_bits(), "rate {rate}, frame {f}: {got} against {want}");
        }
        assert_eq!(line[d..], [-12_345.0; 3], "rate {rate}: written past its length");
        assert_eq!(bus(&h).echo_state(), ((out.len() % d) as u32, true), "rate {rate}");
    }
}

#[test]
fn the_line_is_forgotten_on_a_rate_change_and_on_pi_init_and_kept_over_a_load_and_the_same_rate() {
    let mut h = Host::new(SR, 1);
    assert!(!bus(&h).lent(), "pi_init starts with none");
    let _line = lend(&h, SR);
    unsafe { pi_set_sample_rate(h.e, SR) };
    assert!(bus(&h).lent(), "the same rate changes nothing");
    let mut snap = [0u8; SNAP];
    unsafe { pi_save(h.e, snap.as_mut_ptr(), SNAP as u32) };
    assert_eq!(unsafe { pi_load(h.e, snap.as_ptr(), SNAP as u32) }, 0);
    assert!(bus(&h).lent(), "kept over a load");
    unsafe { pi_set_sample_rate(h.e, 96_000) };
    assert!(!bus(&h).lent(), "forgotten on a rate change");
    // And effect 4 is then no effect of the core's: on every step, the bus never runs.
    let lane: Vec<Cmd> = (0..16).map(|s| fx(s, 4)).collect();
    render(&mut h, 96_000 / 4, 128, 1, &at_zero(&lane));
    assert_eq!(bus(&h).probe().0, 0);
    // pi_init again on the same memory: no line.
    let _again = lend(&h, 96_000);
    let mem = h._mem.as_mut_ptr().cast::<u8>();
    let e = unsafe { pi_init(mem, (h._mem.len() * 8) as u32, 96_000, 1) };
    assert_eq!(e, h.e);
    assert!(!bus(&h).lent(), "forgotten on pi_init");
}

#[test]
fn the_echo_is_cleared_from_idle_and_from_another_kind_and_kept_when_heard_again_inside_the_ramp() {
    // From idle and from effect 2, a run of 4 on steps 4 and 5 sounds as it does in an
    // engine whose line never held anything: what steps 1 and 2 wrote is not heard.
    let xs = moving(6 * STEP as usize);
    for (name, gap) in [("idle", vec![]), ("effect 2", vec![fx(3, 2)])] {
        let a: Vec<Cmd> = [vec![fx(1, 4), fx(2, 4)], gap.clone(), vec![fx(4, 4), fx(5, 4), play()]].concat();
        let b: Vec<Cmd> = [gap.clone(), vec![fx(4, 4), fx(5, 4), play()]].concat();
        let (x, _, _) = looped_with(SR, &a, &xs, true, 0);
        let (y, _, _) = looped_with(SR, &b, &xs, true, 0);
        let from = 4 * STEP as usize;
        assert!(same_bits(&x[from..], &y[from..]), "from {name}: steps 4 and 5");
        let two = 2 * STEP as usize..3 * STEP as usize;
        assert!(!same_bits(&x[two.clone()], &y[two]), "from {name}: steps 1 and 2 echoed");
    }
    // Heard again 1 ms after it ends, while still ramping out: the line goes on, full.
    let mut h = Host::new(SR, 1);
    let _line = lend(&h, SR);
    let mut c = at_zero(&[fx(1, 4), fx(2, 4)]);
    c.extend([(3 * STEP + 48, down(FX)), (3 * STEP + 48, down(3))]);
    render(&mut h, 3 * STEP as usize + 49, 128, 1, &c);
    let (on, w, ..) = bus(&h).probe();
    assert!(on == 4 && w > 0.0 && w < 1.0, "still ramping: {on} at {w}");
    assert_eq!(bus(&h).echo_state(), (((2 * STEP + 49) % pi_delay_frames(SR) as u64) as u32, true), "kept");
}

#[test]
fn no_echo_outlives_the_ramp_and_a_line_lent_changes_nothing_without_effect_4() {
    // The beat with 4 on steps 1 to 3 and a line: from 2 ms after step 4 begins, the plain
    // beat, bit for bit. And a line lent with no 4 in the lane: the plain beat throughout.
    let plain = mix(&beat(), SR, 6 * STEP as usize);
    let mut edits = beat();
    edits.extend([fx(1, 4), fx(2, 4), fx(3, 4)]);
    let mut h = Host::new(SR, 1);
    let _line = lend(&h, SR);
    let with = render(&mut h, 6 * STEP as usize, 128, 1, &at_zero(&edits)).0;
    let back = 4 * STEP as usize + 97;
    assert!(same_bits(&with[back..], &plain[back..]), "an echo after the ramp");
    assert!(!same_bits(&with[3 * STEP as usize..4 * STEP as usize], &plain[3 * STEP as usize..4 * STEP as usize]), "echoed in step 3");
    assert!(same_bits(&with[..STEP as usize], &plain[..STEP as usize]));
    let mut h = Host::new(SR, 1);
    let _line = lend(&h, SR);
    assert!(same_bits(&render(&mut h, 6 * STEP as usize, 128, 1, &at_zero(&beat())).0, &plain), "lent, no 4");
}

#[test]
fn a_line_lent_again_mid_run_is_never_heard_before_it_is_written() {
    // Found by a planted fault (Session 26: "lending keeps where the echo was" passed every
    // other test). Effect 4 on every step with a line that has gone round; then, between two
    // blocks, a second line full of junk is lent. For `pi_delay_frames` frames after it the
    // mix is the bus as it comes in (`bus + w (bus − bus)` at w = 1, the bus exactly), as it
    // was in the first run's own first stretch: the old place in the line is not carried over.
    let d = pi_delay_frames(SR) as usize;
    let xs = moving(4 * d);
    let lane: Vec<Cmd> = (0..16).map(|s| fx(s, 4)).chain([play()]).collect();
    let (_, _, h) = looped_with(SR, &lane, &xs[..2 * d], true, 0);
    assert_eq!(bus(&h).echo_state().1, true, "the first line has gone round");
    let mut junk = vec![123.0f32; d];
    assert_eq!(unsafe { pi_set_delay(h.e, junk.as_mut_ptr(), d as u32) }, 1);
    for (f, x) in xs[2 * d..3 * d].iter().enumerate() {
        let mut io = [0f32; 18];
        io[0] = *x;
        let mut ev = [Event::default(); CAP];
        unsafe { pi_process(h.e, 1, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), 18) };
        assert_eq!(io[16].to_bits(), (0.0f32 + x + (x - x)).to_bits(), "frame {f} after the second line was lent");
    }
    assert_eq!(bus(&h).echo_state(), (0, true), "the second line has gone round once");
}

// ---- §18, designed 2026-11-24: effect 14, the bus fed back (ABI 13; D93 items 5 to 8) ----
// One test a row of "Proven when built by". The model's tours (above) hold the frame bit for
// bit; these hold each rule alone.

/// Effect 14's loop at `rate`, as §18's table gives it.
fn comb(rate: u32) -> usize {
    crate::bus::comb_frames(rate) as usize
}

/// A fresh engine, lent `pi_delay_frames + extra` floats of junk (7.0, the last `extra` a
/// guard) if `line`, in the 18-channel loop: `xs[f]` returned as sound 1 on frame `f`, and
/// `cmds` at their frames. The mix of each frame, the line and the engine.
fn looped_at(rate: u32, cmds: &[(u64, Cmd)], xs: &[f32], line: bool) -> (Vec<f32>, Vec<f32>, Host) {
    let h = Host::new(rate, 1);
    let mut l = vec![7.0f32; pi_delay_frames(rate) as usize];
    if line {
        assert_eq!(unsafe { pi_set_delay(h.e, l.as_mut_ptr(), l.len() as u32) }, 1);
    }
    let mut out = Vec::with_capacity(xs.len());
    for (f, x) in xs.iter().enumerate() {
        let mut io = [0f32; 18];
        io[0] = *x;
        let mut c: Vec<Cmd> = if f == 0 { vec![cmd(CMD_ROUTE, 0, 0, 1)] } else { vec![] };
        c.extend(cmds.iter().filter(|c| c.0 == f as u64).map(|c| c.1));
        let mut ev = [Event::default(); CAP];
        unsafe { pi_process(h.e, 1, c.as_ptr(), c.len() as u32, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), 18) };
        out.push(io[16]);
    }
    (out, l, h)
}

/// 14 on every step and play, at frame 0.
fn all_14() -> Vec<(u64, Cmd)> {
    (0..16).map(|s| (0, fx(s, 14))).chain([(0, play())]).collect()
}

#[test]
fn the_first_comb_frames_of_14_are_the_bus_and_comb_is_807_879_and_1757() {
    assert_eq!([comb(44_100), comb(48_000), comb(96_000)], [807, 879, 1757]);
    assert_eq!(comb(46_875), 858);
    // Heard from frame 0: for `comb` frames nothing has come round, so `wet` is the bus and
    // the mix `0 + bus + w (bus − bus)`. On frame `comb` the first of it comes back.
    for rate in [44_100u32, 48_000, 96_000] {
        let n = comb(rate);
        let xs = moving(n + 50);
        let (out, ..) = looped_at(rate, &all_14(), &xs, true);
        let (step, mut w) = (500.0 / rate as f32, 0.0f32);
        for (f, got) in out.iter().enumerate().take(n) {
            w = if w + step > 1.0 { 1.0 } else { w + step };
            let x = xs[f];
            assert_eq!(got.to_bits(), ((0.0f32 + x + w * (x - x)) * 1.0).to_bits(), "rate {rate}, frame {f}");
        }
        assert!(out[n..].iter().zip(&xs[n..]).any(|(o, x)| o != x), "rate {rate}: something came round at {n}");
    }
}

#[test]
fn what_goes_round_is_never_past_a_quarter_whatever_is_played() {
    // render-all's pattern (every sound on four steps of its own, the loudest there is), 14
    // on every step, four bars: the mix less the dry mix, frame by frame, inside ±0.25 × the
    // volume's gain (1 at 16), but for the rounding of two sums in different orders. And it
    // gets there: the ceiling is reached.
    let all = json::parse(include_str!("../../../harness/render-all.json"));
    let edits: Vec<Cmd> = all.arr("commands").iter().filter(|c| c.str("cmd") == "step" && c.num("at") == 0).map(|c| on(c.num("track") as u8, c.num("step") as u8)).collect();
    assert_eq!(edits.len(), 63);
    let frames = 64 * STEP as usize;
    let mut a = Host::new(SR, 1);
    let _line = lend(&a, SR);
    let mut lane = edits.clone();
    lane.extend((0..16).map(|s| fx(s, 14)));
    let wet = render(&mut a, frames, 128, 1, &at_zero(&lane)).0;
    let dry = mix(&edits, SR, frames);
    let most = wet.iter().zip(&dry).map(|(w, d)| (w - d).abs()).fold(0.0f32, f32::max);
    assert!(most <= 0.25 + 1e-6, "{most}");
    assert!(most > 0.249, "the ceiling is reached: {most}");
}

#[test]
fn it_builds_a_click_comes_round_comb_frames_apart_and_grows_until_the_clip() {
    // A made bus (`Bus::mix` directly), at 48 kHz: one click of 0.5, then a steady 0.000 001 so
    // it never stands still. Against the model, bit for bit. Round 0 is the bus itself; the
    // click comes back at `comb` frames and every `comb` after. ⚠ Not "louder each time" from
    // the first round, as §18 says: a click is broadband, and the band output loses what is
    // off its centre first, so it falls for some rounds (two at 2.24, more at 2.05). From its
    // lowest round each round is louder than the one before, until the clip holds it at 0.25 (round 30 at the
    // designed gain of 2.24; at 2.05, Session 28's, lowest at round 11 and clipped from 172).
    let n = comb(SR);
    let mut line = vec![0f32; pi_delay_frames(SR) as usize];
    let mut b = Bus::new();
    b.lend(line.as_mut_ptr(), line.len() as u32);
    let mut m = Model::lent(pi_delay_frames(SR));
    let mut v = [0f32; 16];
    let mut energy = Vec::new();
    let mut peaks = Vec::new();
    for round in 0..400 {
        let (mut e, mut p) = (0f64, 0f32);
        for i in 0..n {
            let f = round * n + i;
            v[0] = if f == 0 { 0.5 } else { 0.000_001 };
            b.advance(14, 0, SR);
            let got = b.mix(&v, 0xffff, 1.0);
            let want = m.frame(14, 0, SR, &v, 0xffff, 16);
            assert_eq!(got.to_bits(), want.to_bits(), "frame {f}");
            let d = got - v[0];
            if f > 0 {
                e += d as f64 * d as f64;
                p = p.max(d.abs());
            }
        }
        energy.push(e);
        peaks.push(p);
    }
    assert_eq!(peaks[0], 0.0, "round 0: nothing has come round");
    assert!(peaks[1] > 0.1, "round 1: the click is back");
    let clipped = peaks.iter().position(|p| *p == 0.25).expect("the clip holds it");
    assert!(clipped > 10 && peaks[clipped..].iter().all(|p| *p == 0.25), "{peaks:?}");
    // It falls while what is off the centre dies, to one lowest round, then rises every round.
    let lowest = (1..clipped).min_by(|x, y| energy[*x].total_cmp(&energy[*y])).unwrap();
    for r in 1..lowest {
        assert!(energy[r + 1] < energy[r], "round {}: falling, {} after {}", r + 1, energy[r + 1], energy[r]);
    }
    for r in lowest..clipped {
        assert!(energy[r + 1] > energy[r], "round {}: {} after {}", r + 1, energy[r + 1], energy[r]);
    }
}

/// The kick alone on step 1 of each bar, 14 on every step, a line lent: (the 17 channels of
/// each frame, the engine), rendered up to `frames`, then on to `more` in a second render.
fn sparse_kick(frames: usize) -> (Vec<f32>, Host, Vec<f32>) {
    let mut h = Host::new(SR, 1);
    let line = lend(&h, SR);
    let mut lane = vec![on(0, 0)];
    lane.extend((0..16).map(|s| fx(s, 14)));
    let out = render(&mut h, frames, 128, 17, &at_zero(&lane)).0;
    (out, h, line)
}

#[test]
fn after_a_millisecond_of_exact_zero_it_stands_still_and_the_next_sound_brings_it_back() {
    // The kick ends at exact zero long before step 9 (frame 48 000). From 1 ms after it ends
    // the mix is exact zero, and nothing moves: not the head, not the filter's states. The
    // next kick, on bar 2's first frame, brings back what the loop held: the mix is not the
    // dry kick from that first frame, where a fresh loop is the dry kick for `comb` frames.
    let (out, mut h, _line) = sparse_kick(8 * STEP as usize);
    let quiet = out.chunks(17).rposition(|f| f[..16].iter().any(|x| *x != 0.0)).unwrap() + 1;
    assert!(quiet + 48 < 8 * STEP as usize, "the kick ends inside the first half bar: {quiet}");
    for (f, frame) in out.chunks(17).enumerate().skip(quiet + 48) {
        assert_eq!(frame[16], 0.0, "frame {f}: still");
    }
    let (head, (_, _, _, s1, s2)) = (bus(&h).echo_state(), bus(&h).probe());
    let out2 = render(&mut h, 8 * STEP as usize, 128, 17, &[]).0;
    assert!(out2.chunks(17).all(|f| f[16] == 0.0));
    assert_eq!(bus(&h).echo_state(), head, "the head does not move");
    let (.., t1, t2) = bus(&h).probe();
    assert_eq!((t1.to_bits(), t2.to_bits()), (s1.to_bits(), s2.to_bits()), "nor the filter");
    assert!(head.1, "it had gone round before it stood still");
    // Bar 2: from the kick's first frame the loop gives back what it held.
    let bar2 = render(&mut h, 200, 128, 17, &[]).0;
    let first = bar2.chunks(17).position(|f| f[0] != 0.0).unwrap();
    let differs = bar2.chunks(17).skip(first).take(comb(SR)).any(|f| f[16] != f[0]);
    assert!(differs, "the next sound brings back what the loop held");
    let (fresh, ..) = sparse_kick(200);
    let first_fresh = fresh.chunks(17).position(|f| f[0] != 0.0).unwrap();
    assert!(fresh.chunks(17).skip(first_fresh).all(|f| f[16] == f[0]), "a fresh loop is the dry kick at first");
}

#[test]
fn a_zero_for_less_than_a_millisecond_does_not_stop_it() {
    // A made bus at 48 kHz: three rounds of a moving bus, then 47 frames of exact zero (1 ms is
    // 48): the head moves on each and what comes round is heard. Then the bus moves again, and
    // after 48 zeros the 48th frame stands still: the head does not move on it.
    let n = comb(SR);
    let mut line = vec![0f32; pi_delay_frames(SR) as usize];
    let mut b = Bus::new();
    b.lend(line.as_mut_ptr(), line.len() as u32);
    let mut v = [0f32; 16];
    let xs = moving(3 * n);
    for x in &xs {
        v[0] = *x;
        b.advance(14, 0, SR);
        b.mix(&v, 0xffff, 1.0);
    }
    v[0] = 0.0;
    let mut heard = 0;
    for i in 0..47 {
        let before = b.echo_state().0;
        b.advance(14, 0, SR);
        heard += (b.mix(&v, 0xffff, 1.0) != 0.0) as usize;
        assert_eq!(b.echo_state().0, (before + 1) % n as u32, "zero {}: the loop runs", i + 1);
    }
    assert!(heard > 40, "what came round is heard through the gap: {heard} of 47");
    v[0] = 0.25;
    b.advance(14, 0, SR);
    b.mix(&v, 0xffff, 1.0);
    v[0] = 0.0;
    for i in 0..48 {
        let before = b.echo_state().0;
        b.advance(14, 0, SR);
        let got = b.mix(&v, 0xffff, 1.0);
        if i < 47 {
            assert_eq!(b.echo_state().0, (before + 1) % n as u32, "zero {}", i + 1);
        } else {
            assert_eq!(b.echo_state().0, before, "the 48th zero: still");
            assert_eq!(got, 0.0);
        }
    }
    // Found by a planted fault (Session 28: "near zero counts as zero" passed): only exact zero
    // counts. A bus of 1e-30 for 100 frames is a sound: the loop runs on every one.
    v[0] = 1e-30;
    for i in 0..100 {
        let before = b.echo_state().0;
        b.advance(14, 0, SR);
        b.mix(&v, 0xffff, 1.0);
        assert_eq!(b.echo_state().0, (before + 1) % n as u32, "1e-30, frame {}", i + 1);
    }
}

#[test]
fn fourteen_heard_again_while_it_stands_still_keeps_standing_still() {
    // Found by a planted fault (Session 28: "still forgotten when heard again" passed). A made
    // bus: 14 builds on a moving bus, then the bus is exact zero for 60 frames (it stands
    // still), 14 is let go for 10 frames (ramping out) and heard again. `still` is kept with
    // the rest of its state, so the loop goes on standing still: the head never moves.
    let n = comb(SR);
    let mut line = vec![0f32; pi_delay_frames(SR) as usize];
    let mut b = Bus::new();
    b.lend(line.as_mut_ptr(), line.len() as u32);
    let mut v = [0f32; 16];
    for x in moving(3 * n) {
        v[0] = x;
        b.advance(14, 0, SR);
        b.mix(&v, 0xffff, 1.0);
    }
    v[0] = 0.0;
    for _ in 0..60 {
        b.advance(14, 0, SR);
        b.mix(&v, 0xffff, 1.0);
    }
    let head = b.echo_state();
    for f in 0..70 {
        b.advance(if (0..10).contains(&f) { 0 } else { 14 }, 0, SR);
        assert_eq!(b.mix(&v, 0xffff, 1.0), 0.0, "frame {f}");
        assert_eq!(b.echo_state(), head, "frame {f}: the head moved");
    }
    assert_eq!(b.probe().0, 14);
}

#[test]
fn fourteen_is_cleared_from_idle_and_from_another_kind_and_nothing_of_4_is_heard_in_it_or_of_it_in_4() {
    // As the echo's test: a run on steps 4 and 5 sounds as it does in an engine whose line
    // never held anything. From idle (a dry step 3), from effect 4 (14 straight after 4), and
    // 4 straight after 14. The returned bus moves on every frame, so 14 never stands still.
    let xs = moving(6 * STEP as usize);
    let lanes = |e: &[(u8, u32)]| -> Vec<(u64, Cmd)> { e.iter().map(|(s, x)| (0, fx(*s, *x))).chain([(0, play())]).collect() };
    for (name, a, b) in [
        ("14 from idle", lanes(&[(1, 14), (2, 14), (4, 14), (5, 14)]), lanes(&[(4, 14), (5, 14)])),
        ("14 from 4", lanes(&[(1, 14), (2, 14), (3, 4), (4, 14), (5, 14)]), lanes(&[(3, 4), (4, 14), (5, 14)])),
        ("4 from 14", lanes(&[(1, 4), (2, 4), (3, 14), (4, 4), (5, 4)]), lanes(&[(3, 14), (4, 4), (5, 4)])),
        ("14 from a filter", lanes(&[(1, 14), (2, 14), (3, 5), (4, 14), (5, 14)]), lanes(&[(3, 5), (4, 14), (5, 14)])),
    ] {
        let (x, ..) = looped_at(SR, &a, &xs, true);
        let (y, ..) = looped_at(SR, &b, &xs, true);
        let from = 4 * STEP as usize;
        assert!(same_bits(&x[from..], &y[from..]), "{name}: steps 4 and 5");
        let two = 2 * STEP as usize..3 * STEP as usize;
        assert!(!same_bits(&x[two.clone()], &y[two]), "{name}: the first run was heard");
    }
}

#[test]
fn fourteen_heard_again_inside_its_ramp_keeps_its_place() {
    // 14 on steps 1 and 2, heard from frame 6 000; let go at 18 000, heard again by a punch
    // 48 frames later, still ramping out. The loop ran on every one of those frames.
    let xs = moving(3 * STEP as usize + 49);
    let mut c: Vec<(u64, Cmd)> = vec![(0, fx(1, 14)), (0, fx(2, 14)), (0, play())];
    c.extend([(3 * STEP + 48, down(FX)), (3 * STEP + 48, down(13))]);
    let (_, _, h) = looped_at(SR, &c, &xs, true);
    let (on, w, ..) = bus(&h).probe();
    assert!(on == 14 && w > 0.0 && w < 1.0, "still ramping: {on} at {w}");
    assert_eq!(bus(&h).echo_state(), (((2 * STEP + 49) % comb(SR) as u64) as u32, true), "kept");
}

#[test]
fn a_lend_clears_fourteen_s_place_and_what_was_in_the_line_is_never_heard() {
    // 14 on every step until the loop has gone round twice; then a second line, full of junk,
    // is lent. Its head and `full` are cleared (§18: "`head` and `full` when a line is lent";
    // the filter's states are not, and ring down). Two engines with the same history, lent
    // different junk, give the same bits for three rounds: the junk is never read.
    let n = comb(SR);
    let xs = moving(5 * n);
    let after = |junk: f32| {
        let (_, _, h) = looped_at(SR, &all_14(), &xs[..2 * n + 5], true);
        assert!(bus(&h).echo_state().1);
        let mut room = vec![junk; pi_delay_frames(SR) as usize];
        assert_eq!(unsafe { pi_set_delay(h.e, room.as_mut_ptr(), room.len() as u32) }, 1);
        assert_eq!(bus(&h).echo_state(), (0, false));
        let mut out = Vec::new();
        for x in &xs[2 * n + 5..] {
            let mut io = [0f32; 18];
            io[0] = *x;
            let mut ev = [Event::default(); CAP];
            unsafe { pi_process(h.e, 1, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), 18) };
            out.push(io[16]);
        }
        out
    };
    assert!(same_bits(&after(123.0), &after(-55.0)));
}

#[test]
fn fourteen_never_writes_past_comb() {
    // A line of junk; 14 runs ten rounds at each rate: nothing from `comb` on is touched.
    for rate in [44_100u32, 48_000, 96_000] {
        let n = comb(rate);
        let (_, line, h) = looped_at(rate, &all_14(), &moving(10 * n + 3), true);
        assert!(bus(&h).echo_state().1);
        assert!(line[n..].iter().all(|x| *x == 7.0), "rate {rate}: written at or past {n}");
        assert!(line[..n].iter().all(|x| *x != 7.0), "rate {rate}: the loop's own floats all written");
    }
}

#[test]
fn under_200_hz_the_mix_with_14_is_the_dry_mix_to_within_a_decibel() {
    // The kick alone on every beat, 14 held two bars, against the same with no effect: both
    // through a one-pole low-pass at 200 Hz in the test (a multiply and an add a frame), the
    // level over the two bars within 1 dB. The band output is 0 at 0 Hz: the lows do not go
    // round, and the dry sound passes whole. Session 28: at the designed gain of 2.24 this read
    // +1.15 dB and failed (a one-pole falls only 6 dB an octave, so the 1 kHz ring, 40 dB and
    // more over the dry there, came through it ~15 dB down), and +0.62 dB at 100 Hz; the test
    // was held at 100 Hz until the comparison moved the gain to 2.05. Now +0.44 dB at 200 Hz.
    let kick: Vec<Cmd> = (0..16).filter(|s| s % 4 == 0).map(|s| on(0, s)).collect();
    let frames = 32 * STEP as usize;
    let mut lane = kick.clone();
    lane.extend((0..16).map(|s| fx(s, 14)));
    let mut h = Host::new(SR, 1);
    let _line = lend(&h, SR);
    let wet = render(&mut h, frames, 128, 1, &at_zero(&lane)).0;
    let dry = mix(&kick, SR, frames);
    let low = |xs: &[f32]| {
        let a = (-2.0 * core::f64::consts::PI * 200.0 / SR as f64).exp();
        let (mut y, mut e) = (0f64, 0f64);
        for x in xs {
            y = (1.0 - a) * *x as f64 + a * y;
            e += y * y;
        }
        e
    };
    let db = 10.0 * (low(&wet) / low(&dry)).log10();
    assert!(db.abs() < 1.0, "{db} dB");
    assert!(!same_bits(&wet, &dry), "and 14 was heard");
}

// ---- §18, designed 2026-11-25: effect 1, the sounds at a quarter of the rate (ABI 14; D98) ----
//
// Written from the section's words before the code (Session 32), as its "Proven when built by"
// table asks. The models above (`Model`'s grid, `Voicing`) hold the mix and the sixteen track
// channels through every kind of change in the tours; these hold each rule alone.

const TONE: u8 = 14;

/// §18's line from the section's words alone: effect 1 from frame 0 (`acc` 0), the host at
/// `rate(f)` on frame `f` (`acc` wrapped to a new rate on its first frame: the ruling below), a sound hit on each frame of `hits` (silent before the first), whose
/// values at 46 875 Hz from a hit are `bs`. On a fresh frame `from = to`, `to =` the next value;
/// every frame `from + (to − from) × mu`. Returns the frames' values, the fresh frames and `mu`.
fn on_the_line(bs: &[f32], rate: impl Fn(usize) -> u32, frames: usize, hits: &[usize]) -> (Vec<f32>, Vec<usize>, Vec<f32>) {
    let (mut acc, mut k, mut hit) = (0u64, 0usize, false);
    let (mut from, mut to) = (0f32, 0f32);
    let (mut out, mut fresh, mut mus) = (Vec::new(), Vec::new(), Vec::new());
    for f in 0..frames {
        let four = 4 * rate(f) as u64;
        // The ruling of 2026-11-25 on Session 32's question 3 (Fable), written here before the
        // code (Session 34): when the rate changes, `acc` wraps to the new rate, `acc mod 4 ×
        // rate`, so `mu` never passes 1. (Session 32's model took the code's formula, which
        // let `mu` run to 2 on the frame of a fall, and so approved it.)
        if f > 0 && rate(f) != rate(f - 1) {
            acc %= four;
        }
        let is_fresh = acc < 46_875;
        let mu = acc as f32 * (1.0f32 / four as f32);
        acc = (acc + 46_875) % four;
        if hits.contains(&f) {
            (hit, k) = (true, 0); // one voice a sound: it starts again
        }
        if is_fresh {
            from = to;
            to = if hit { bs[k] } else { 0.0 };
            k += hit as usize;
            fresh.push(f);
        }
        out.push(from + (to - from) * mu);
        mus.push(mu);
    }
    (out, fresh, mus)
}

/// The data for a sample: a falling buzz, any data, so long as both engines have it. Leaked:
/// it must outlive the engines (§12).
fn buzz() -> &'static [i16] {
    let data: Vec<i16> = (0..30_000i32).map(|i| ((i * 37 % 200 - 100) * (30_000 - i) / 120) as i16).collect();
    Box::leak(data.into_boxed_slice())
}

/// Track `t` alone, hit on each frame of `hits`, in an engine at 46 875 Hz played dry: its
/// track channel, `n` frames. With `sample`, the track plays a sample.
fn dry_at_46_875(t: u8, sample: Option<&'static [i16]>, n: usize) -> Vec<f32> {
    let mut b = Host::new(SLOW, 1);
    let mut c = vec![(0, cmd(CMD_SOUND, t, 1, 65_535)), (0, cmd(CMD_FIRE, t, 0, 0))];
    if let Some(d) = sample {
        assert_eq!(unsafe { pi_set_sample(b.e, t as u32, d.as_ptr(), d.len() as u32) }, 1);
        c.insert(0, (0, cmd(CMD_VOICE, t, 0, 1)));
    }
    let out = render(&mut b, n, 128, 16, &c).0;
    out.chunks(16).map(|fr| fr[t as usize]).collect()
}

/// Effect 1 on every step of the lane from frame 0, track `t` (slider B at its longest) hit on
/// each frame of `hits`, at `rate`: the sixteen track channels for `frames`, then the engine.
fn slowed_run(rate: u32, t: u8, sample: Option<&'static [i16]>, hits: &[usize], frames: usize) -> (Vec<f32>, Host) {
    let mut a = Host::new(rate, 1);
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, fx(s, 1))).collect();
    c.push((0, cmd(CMD_SOUND, t, 1, 65_535)));
    if let Some(d) = sample {
        assert_eq!(unsafe { pi_set_sample(a.e, t as u32, d.as_ptr(), d.len() as u32) }, 1);
        c.push((0, cmd(CMD_VOICE, t, 0, 1)));
    }
    c.push((0, play()));
    for &f in hits {
        c.push((f as u64, cmd(CMD_FIRE, t, 0, 0)));
    }
    c.sort_by_key(|x| x.0);
    let out = render(&mut a, frames, 128, 16, &c).0;
    (out, a)
}

fn track(out: &[f32], t: u8) -> Vec<f32> {
    out.chunks(16).map(|fr| fr[t as usize]).collect()
}

/// Holds track `t`'s channel, slowed, to the line through a dry engine's values at 46 875 Hz.
fn assert_on_the_line(rate: u32, t: u8, sample: Option<&'static [i16]>, hits: &[usize], frames: usize) {
    let bs = dry_at_46_875(t, sample, frames * 46_875 / (4 * rate as usize) + 64);
    let (out, _) = slowed_run(rate, t, sample, hits, frames);
    let (want, ..) = on_the_line(&bs, |_| rate, frames, hits);
    let got = track(&out, t);
    for f in 0..frames {
        assert_eq!(got[f].to_bits(), want[f].to_bits(), "rate {rate}, track {t}, sample {}: frame {f}, {} against the line's {}", sample.is_some(), got[f], want[f]);
    }
    assert!(got.iter().any(|x| *x != 0.0), "rate {rate}, track {t}: it sounded");
    for u in (0..16u8).filter(|u| *u != t) {
        assert!(track(&out, u).iter().all(|x| x.to_bits() == 0), "rate {rate}: track {u} silent");
    }
}

#[test]
fn effect_1_s_grid_is_fresh_on_the_frames_section_18_lists_by_hand_with_mu_as_it_lists() {
    // §18's lists, worked by hand: frame 0, then ceil(k × 4 × rate / 46 875).
    let lists: [(u32, &[usize]); 3] = [
        (48_000, &[0, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 46, 50]),
        (44_100, &[0, 4, 8, 12, 16, 19, 23]),
        (96_000, &[0, 9, 17, 25, 33, 41, 50]),
    ];
    for (rate, want) in lists {
        let (_, fresh, mu) = on_the_line(&[0.0; 4], |_| rate, 2000, &[]);
        assert_eq!(&fresh[..want.len()], want, "rate {rate}");
        for (k, f) in fresh.iter().enumerate() {
            assert_eq!(*f as u64, (k as u64 * 4 * rate as u64).div_ceil(46_875), "rate {rate}, fresh frame {k}");
        }
        if rate == 48_000 {
            for (f, m) in [0.0f32, 0.2441, 0.4883, 0.7324, 0.9766, 0.2207].iter().enumerate() {
                assert!((mu[f] - m).abs() < 5e-5, "48 kHz: mu on frame {f} is {}, the section's {m}", mu[f]);
            }
        }
        // And the engine is on that grid: the tone hit as effect 1 starts, bit for bit.
        assert_on_the_line(rate, TONE, None, &[0], rate as usize / 5);
    }
}

#[test]
fn a_slowed_voice_s_grid_values_are_an_engine_s_at_46_875_hz_played_dry_with_the_line_between() {
    // In order, none skipped or given twice, at three host rates, a code voice and a sample,
    // on the track channel, bit for bit against the line through the dry engine's values.
    let data = buzz();
    for rate in [44_100u32, 48_000, 96_000] {
        assert_on_the_line(rate, TONE, None, &[0], rate as usize / 2);
        assert_on_the_line(rate, 0, None, &[0], rate as usize / 2); // the bass drum, its pitch falling
        assert_on_the_line(rate, 6, Some(data), &[0], rate as usize / 2);
    }
}

#[test]
fn a_slowed_sound_hit_again_starts_again_as_dry_and_a_hit_waits_for_the_grid() {
    // One voice a sound: hit again under 1 it starts again from its first value, asked on the
    // grid's next fresh frame (frames 9 001 and 12 345 are not fresh at 48 kHz, nor 10 001 at
    // 44.1 kHz; the line runs from what the sound last gave).
    let data = buzz();
    for (rate, hits) in [(48_000u32, [0usize, 9_001, 12_345]), (44_100, [0, 10_001, 10_002])] {
        assert_on_the_line(rate, TONE, None, &hits, 20_000);
        assert_on_the_line(rate, 6, Some(data), &hits, 20_000);
    }
}

#[test]
fn a_rate_change_while_slowed_leaves_the_slowed_voices_tuning() {
    // The tone hit under 1 at 48 kHz, then the host's rate doubled mid-sound, then halved
    // again: the grid and `inv` follow each new rate from the next frame, the tone stays tuned
    // for 46 875 Hz, so its grid values go on as the dry engine's, none skipped.
    let bs = dry_at_46_875(TONE, None, 20_000);
    let (n1, n2, end) = (10_007usize, 40_000usize, 60_000usize);
    let rate = |f: usize| if (n1..n2).contains(&f) { 96_000 } else { 48_000 };
    let (want, ..) = on_the_line(&bs, rate, end, &[0]);
    let mut a = Host::new(48_000, 1);
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, fx(s, 1))).collect();
    c.extend([(0, cmd(CMD_SOUND, TONE, 1, 65_535)), (0, play()), (0, cmd(CMD_FIRE, TONE, 0, 0))]);
    let mut got = track(&render(&mut a, n1, 128, 16, &c).0, TONE);
    unsafe { pi_set_sample_rate(a.e, 96_000) };
    got.extend(track(&render(&mut a, n2 - n1, 128, 16, &[]).0, TONE));
    unsafe { pi_set_sample_rate(a.e, 48_000) };
    got.extend(track(&render(&mut a, end - n2, 128, 16, &[]).0, TONE));
    for f in 0..end {
        assert_eq!(got[f].to_bits(), want[f].to_bits(), "frame {f} ({} Hz)", rate(f));
    }
}

#[test]
fn a_sound_outside_fx_sounds_is_the_same_bytes_with_and_without_effect_1() {
    // D66 item 4: no effect reaches a sound switched out, so it is never slowed. The tone out
    // of the effects, alone and over the beat in the bus: its track channel the same bytes,
    // and alone the mix too.
    for with_beat in [false, true] {
        let mut edits = vec![fxsound(TONE, 0), on(TONE, 0), on(TONE, 9)];
        if with_beat {
            edits.extend(beat());
        }
        let mut lane = edits.clone();
        lane.extend((0..16).map(|s| fx(s, 1)));
        let (mut a, mut b) = (Host::new(SR, 1), Host::new(SR, 1));
        let x = render(&mut a, 3 * STEP as usize, 128, 17, &at_zero(&lane)).0;
        let y = render(&mut b, 3 * STEP as usize, 128, 17, &at_zero(&edits)).0;
        for f in 0..3 * STEP as usize {
            assert_eq!(x[f * 17 + TONE as usize].to_bits(), y[f * 17 + TONE as usize].to_bits(), "beat {with_beat}, frame {f}: the tone");
            if !with_beat {
                assert_eq!(x[f * 17 + 16].to_bits(), y[f * 17 + 16].to_bits(), "frame {f}: the mix");
            }
        }
        if with_beat {
            assert!(!same_bits(&x, &y), "and the beat was slowed");
        }
    }
}

/// Zero crossings a second of `x` over `range`.
fn crossings(x: &[f32], range: core::ops::Range<usize>, rate: u32) -> f32 {
    let n = range.len();
    let c = x[range].windows(2).filter(|w| (w[0] < 0.0) != (w[1] < 0.0)).count();
    c as f32 * rate as f32 / n as f32
}

#[test]
fn a_sound_sounding_when_1_comes_on_falls_two_octaves_and_when_1_goes_off_comes_back_up() {
    // The tone (slider B at its longest, 500 ms) hit dry; 1 punched mid-note and let go: on
    // the frame each time, nothing cut. A punch is recorded on the steps that arrive under it
    // (§17), so let go at 490 ms 1 is heard on to the step at 500 ms, where the lane is empty.
    // Held to the models frame by frame through both changes, at three rates, and its pitch
    // read: 220 Hz, a quarter, then 220 again.
    for rate in [44_100u32, 48_000, 96_000] {
        let ms = |m: u64| (m * rate as u64 / 1000) as usize;
        let (on1, release) = (ms(100) + 3, ms(490) + 7);
        let mut c = vec![(0, cmd(CMD_SOUND, TONE, 1, 65_535)), (0, play()), (0, cmd(CMD_FIRE, TONE, 0, 0))];
        c.extend([(on1 as u64, down(FX)), (on1 as u64, down(0)), (release as u64, up(0)), (release as u64, up(FX))]);
        let mut kept = Vec::new();
        hold_to_model_keeping(rate, &c, ms(700) as u64, false, &mut kept);
        let tone: Vec<f32> = kept.iter().map(|fr| fr[TONE as usize]).collect();
        let dry = crossings(&tone, ms(5)..on1, rate);
        let slow = crossings(&tone, on1 + ms(5)..ms(495), rate);
        let back = crossings(&tone, ms(505)..ms(650), rate);
        assert!((dry / 440.0 - 1.0).abs() < 0.05, "rate {rate}: dry {dry} crossings a second");
        assert!((slow * 4.0 / dry - 1.0).abs() < 0.05, "rate {rate}: under 1 {slow}, a quarter of {dry}");
        assert!((back / dry - 1.0).abs() < 0.05, "rate {rate}: after 1 {back}, as dry {dry}");
        // Nothing cut: no jump at either change is more than two of the voice's own steps
        // (§18: "a step of at most two of the voice's own").
        let step = |f: usize| (tone[f] - tone[f - 1]).abs();
        let near = |f: usize| f.abs_diff(on1) <= 2 || f.abs_diff(ms(500)) <= 2;
        let biggest = (1..tone.len()).filter(|f| !near(*f)).map(step).fold(0.0, f32::max);
        let at_changes = (1..tone.len()).filter(|f| near(*f)).map(step).fold(0.0, f32::max);
        assert!(at_changes <= 2.0 * biggest, "rate {rate}: a jump of {at_changes} at a change, {biggest} elsewhere");
    }
}

// ---- Two rulings on Session 32's questions (Fable, 2026-11-25) and the three tests its review
// asked for (Session 34's list). Written before the code. ----

/// Effect 1 on every step from frame 0, the tone (slider B at its longest) hit at frame 0, run
/// one frame at a time at `rates[i].1` from frame `rates[i].0`: what the bus's grid said each
/// frame, `(fresh, mu)`.
fn grid_across(rates: &[(usize, u32)], frames: usize) -> Vec<(bool, f32)> {
    let mut h = Host::new(rates[0].1, 1);
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, fx(s, 1))).collect();
    c.extend([(0, cmd(CMD_SOUND, TONE, 1, 65_535)), (0, play()), (0, cmd(CMD_FIRE, TONE, 0, 0))]);
    let mut out = Vec::new();
    for f in 0..frames {
        if let Some((_, r)) = rates.iter().find(|(at, _)| *at == f && f > 0) {
            unsafe { pi_set_sample_rate(h.e, *r) };
        }
        let these: Vec<(u64, Cmd)> = if f == 0 { c.clone() } else { Vec::new() };
        render(&mut h, 1, 1, 16, &these);
        out.push((bus(&h).fresh, bus(&h).mu));
    }
    out
}

#[test]
fn a_rate_falling_96_to_48_khz_while_slowed_wraps_the_grid_as_the_ruling_has_it_by_hand() {
    // By hand. Five frames at 96 kHz from `acc` 0: acc = 5 × 46 875 = 234 375 (under 4 × 96 000
    // = 384 000). The rate falls to 48 kHz: 4 × rate = 192 000, and the ruling wraps first:
    // 234 375 mod 192 000 = 42 375. Frame 5: fresh (42 375 < 46 875), mu = 42 375 / 192 000 =
    // 0.220703125. Then acc 89 250, 136 125, 183 000 (mu 0.46484375, 0.708984375, 0.953125,
    // none fresh), then 229 875 mod 192 000 = 37 875: frame 9 fresh, mu 0.197265625. (Unwrapped,
    // frame 5 was not fresh and its mu 234 375 / 192 000 = 1.2207: the line ran past its end.)
    let got = grid_across(&[(0, 96_000), (5, 48_000)], 10);
    let want = [
        (true, 0.0),
        (false, 46_875.0 / 384_000.0),
        (false, 93_750.0 / 384_000.0),
        (false, 140_625.0 / 384_000.0),
        (false, 187_500.0 / 384_000.0),
        (true, 0.220_703_125),
        (false, 0.464_843_75),
        (false, 0.708_984_375),
        (false, 0.953_125),
        (true, 0.197_265_625),
    ];
    for (f, ((gf, gm), (wf, wm))) in got.iter().zip(want).enumerate() {
        assert_eq!(*gf, wf, "frame {f}: fresh");
        assert!((gm - wm).abs() < 1e-6, "frame {f}: mu {gm}, by hand {wm}");
    }
}

#[test]
fn mu_never_passes_1_across_a_rate_change() {
    // Every change between the three rates, each made on many phases of the grid (frames 1 to
    // 40, then back on 41 to 80, ...): mu stays in [0, 1) on every frame. Session 32's
    // rate-change test took the code's own formula into its model, so it approved the overshoot.
    for (a, b) in [(96_000u32, 48_000u32), (96_000, 44_100), (48_000, 44_100), (44_100, 96_000), (48_000, 96_000)] {
        let mut rates = vec![(0usize, a)];
        for k in 1..60 {
            rates.push((k * 7 + k % 5, if k % 2 == 1 { b } else { a }));
        }
        for (f, (_, mu)) in grid_across(&rates, 440).iter().enumerate() {
            assert!((0.0..1.0).contains(mu), "{a} and {b}: mu {mu} on frame {f}");
        }
    }
}

#[test]
fn a_rate_change_while_some_sounds_are_slowed_still_retunes_the_ones_that_are_not() {
    // The tone switched out of the effects, the bass drum in; effect 1 on every step; both hit
    // at frame 0; the rate doubled mid-sound and halved again. The tone's channel is the same
    // bytes as the same run with no effect at all (retuned with every rate change, as any voice
    // not slowed is), and the bass drum, slowed, stays on the line through the dry engine's
    // values at 46 875 Hz. (Session 32's test slowed all sixteen, so it could not tell.)
    let (n1, n2, end) = (7_003usize, 19_001usize, 30_000usize);
    let rate = |f: usize| if (n1..n2).contains(&f) { 96_000 } else { 48_000 };
    let run = |lane: bool| {
        let mut a = Host::new(48_000, 1);
        let mut c: Vec<(u64, Cmd)> = if lane { (0..16).map(|s| (0, fx(s, 1))).collect() } else { Vec::new() };
        c.extend([
            (0, fxsound(TONE, 0)),
            (0, cmd(CMD_SOUND, TONE, 1, 65_535)),
            (0, cmd(CMD_SOUND, 0, 1, 65_535)),
            (0, play()),
            (0, cmd(CMD_FIRE, TONE, 0, 0)),
            (0, cmd(CMD_FIRE, 0, 0, 0)),
        ]);
        let mut out = render(&mut a, n1, 128, 16, &c).0;
        unsafe { pi_set_sample_rate(a.e, 96_000) };
        out.extend(render(&mut a, n2 - n1, 128, 16, &[]).0);
        unsafe { pi_set_sample_rate(a.e, 48_000) };
        out.extend(render(&mut a, end - n2, 128, 16, &[]).0);
        out
    };
    let (slowed, dry) = (run(true), run(false));
    let (tone, tone_dry) = (track(&slowed, TONE), track(&dry, TONE));
    assert!(tone[n2 - 10..n2].iter().any(|x| *x != 0.0), "the tone still sounds at the second change");
    for f in 0..end {
        assert_eq!(tone[f].to_bits(), tone_dry[f].to_bits(), "frame {f} ({} Hz): the tone, not slowed", rate(f));
    }
    let bs = dry_at_46_875(0, None, 20_000);
    let (want, ..) = on_the_line(&bs, rate, end, &[0]);
    let kick = track(&slowed, 0);
    for f in 0..end {
        assert_eq!(kick[f].to_bits(), want[f].to_bits(), "frame {f} ({} Hz): the bass drum, slowed", rate(f));
    }
    assert!(!same_bits(&kick, &track(&dry, 0)), "and the bass drum was slowed");
}

#[test]
fn a_sample_sounding_when_1_comes_on_and_when_it_goes_off_is_the_model_s_frame_by_frame() {
    // Track 6 playing a sample (no tour loads one), hit dry; 1 punched mid-sample and let go
    // while it still sounds: held to the models frame by frame through both changes, at three
    // rates. The sample (30 000 values, 0.68 s dry at 44.1 kHz) is a quarter as fast from 100 ms,
    // so it sounds on past the release at 500 ms and after.
    let data = buzz();
    for rate in [44_100u32, 48_000, 96_000] {
        let ms = |m: u64| (m * rate as u64 / 1000) as usize;
        let (on1, release) = (ms(100) + 3, ms(490) + 7);
        let mut c = vec![(0, cmd(CMD_VOICE, 6, 0, 1)), (0, play()), (0, cmd(CMD_FIRE, 6, 0, 0))];
        c.extend([(on1 as u64, down(FX)), (on1 as u64, down(0)), (release as u64, up(0)), (release as u64, up(FX))]);
        let mut kept = Vec::new();
        hold_to_model_with(rate, &c, ms(700) as u64, false, &mut kept, |h| {
            assert_eq!(unsafe { pi_set_sample(h.e, 6, data.as_ptr(), data.len() as u32) }, 1);
        });
        let s: Vec<f32> = kept.iter().map(|fr| fr[6]).collect();
        assert!(s[on1 - ms(5)..on1].iter().any(|x| *x != 0.0), "rate {rate}: sounding as 1 comes on");
        assert!(s[ms(500)..ms(505)].iter().any(|x| *x != 0.0), "rate {rate}: sounding as 1 goes off");
        assert!(s[ms(600)..].iter().any(|x| *x != 0.0), "rate {rate}: and after");
    }
}
