//! §18 (ABI 7; D67 items 2 and 3): the bus and the seven sound effects. A test for each rule
//! of §18, and one model of the whole section, written from ENGINE.md's words, that the mix
//! must equal bit for bit, frame by frame. The render pairs (`harness/render-fx-*.json`) hold
//! the same to the `.wasm`.

use super::sound::render;
use super::*;
use crate::bus::Bus;

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
    acc: u32,
    held: f32,
    s1: f32,
    s2: f32,
    cutoff: f32,
    swept: u32,
    /// Effect 4 (ABI 12): the model's own line, as long as the core's is used; the head;
    /// whether it has gone round. Empty: no line lent, and the driver never sends 4.
    line: Vec<f32>,
    head: usize,
    full: bool,
}

impl Model {
    pub(super) fn new() -> Self {
        Model { on: 0, heard: 0, w: 0.0, acc: 0, held: 0.0, s1: 0.0, s2: 0.0, cutoff: 0.0, swept: 0, line: Vec::new(), head: 0, full: false }
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
        let gain = (volume as u32 * volume as u32) as f32 / 256.0;
        let filter = |e: u8| (5..=8).contains(&e);
        if effect != 0 || self.on != 0 {
            if effect != 0 && effect != self.heard {
                // Cleared from idle; the filter kept from one filter effect to the next; and
                // (the ⚠ reading) the hold cleared whenever effect 1 starts from another.
                let same = self.on != 0 && (self.on == effect || (filter(self.on) && filter(effect)));
                if !same {
                    if effect == 1 {
                        self.acc = 0;
                        self.held = 0.0;
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
                }
                self.on = effect;
                self.swept = 0;
                // §18, designed 2026-11-24: 5 at 300 Hz, 6 from 3 240 (2 500 as designed; Session 26's
                // comparison moved it), 7 at 1 800, 8 from 220.
                self.cutoff = [0.0, 0.0, 0.0, 0.0, 0.0, 300.0, 3240.0, 1800.0, 220.0].get(effect as usize).copied().unwrap_or(0.0);
            } else if self.on == 6 || self.on == 8 {
                // The sweep's pseudo-code, exactly: each tick one of four cases, in its order.
                let (start, end, out, back) = if self.on == 6 { (3240.0, 190.0, 0.993_456, 1.006_587_1) } else { (220.0, 2900.0, 1.005_987_4, 0.994_048_24) };
                for _ in 0..ticks {
                    self.swept += 1;
                    if self.swept == 864 {
                        self.swept = 0;
                        self.cutoff = start;
                    } else if self.swept == 432 {
                        self.cutoff = end;
                    } else if self.swept < 432 {
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
        }
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
            1 => {
                self.acc += 1000;
                if self.acc >= rate {
                    self.acc -= rate;
                    self.held = b;
                }
                self.held
            }
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
                // `r` goes with the output: 0.5 for 5 and 6, 1/6 for 7 and 8.
                let r = if self.on <= 6 { 0.5 } else { 1.0 / 6.0 };
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
    let h = Host::new(rate, 1);
    let _keep = if line { lend(&h, rate) } else { Vec::new() };
    let mut m = if line { Model::lent(pi_delay_frames(rate)) } else { Model::new() };
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
        unsafe { pi_process(h.e, 1, these.as_ptr(), these.len() as u32, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 17) };
        let v = h.view();
        // The view's tick is the last one emitted: the ticks this frame are its difference.
        let tick = u32::from_le_bytes([v[0], v[1], v[2], v[3]]);
        let ticks = if f == 0 { 0 } else { tick.wrapping_sub(e_before) };
        e_before = tick;
        let heard = v[55];
        let effect = if SEVEN.contains(&(heard as u32)) || (heard == 4 && line) { heard } else { 0 };
        let sounds = u16::from_le_bytes([v[58], v[59]]);
        let want = m.frame(effect, ticks, rate, &out[..16], sounds, v[27]);
        assert_eq!(out[16].to_bits(), want.to_bits(), "rate {rate}, frame {f}: the mix {} against the model's {}", out[16], want);
        running += (m.on != 0) as usize;
        assert_eq!(bus(&h).probe().0, m.on, "rate {rate}, frame {f}: the effect running");
    }
    running
}

/// Two bars of the minimum beat with every kind of change §18 names: each effect from idle,
/// one effect straight to another (a filter to a filter, a filter from another kind, the hold
/// from another kind), a sweep held over two steps and restarted, a punch over the lane, a
/// sound switched out and the volume down.
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

#[test]
fn the_mix_is_the_model_s_bit_for_bit_at_three_rates() {
    for rate in [44_100u32, 48_000, 96_000] {
        let step = rate as u64 / 8; // 120 bpm
        let running = hold_to_model(rate, &tour(step), 32 * step, false);
        assert!(running as u64 > 10 * step, "rate {rate}: effects ran on {running} frames");
        // ABI 12: with a line lent, effect 4 echoes in the tour.
        let running = hold_to_model(rate, &tour_with_echo(step), 32 * step, true);
        assert!(running as u64 > 13 * step, "rate {rate}, a line lent: effects ran on {running} frames");
    }
}

#[test]
fn the_mix_is_the_model_s_on_edges_too() {
    // The same, on an external clock, an edge a step: the sweeps move by ticks, so they
    // follow the edges, a burst at each. With a line lent, and effect 4 in the tour.
    let mut c = tour_with_echo(STEP);
    c.insert(0, (0, cmd(CMD_SOURCE, 0, 0, 1)));
    for s in 0..32 {
        c.push((s * STEP, cmd(CMD_CLOCK, 0, 0, 0)));
    }
    c.sort_by_key(|x| x.0); // stable: each frame's commands keep their order
    hold_to_model(SR, &c, 32 * STEP, true);
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
        assert!(same_bits(&a[back..], &b[back..]), "effect {effect}: from 2 ms after it");
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

#[test]
fn effect_1_holds_at_1_khz_at_every_rate() {
    for rate in [44_100u32, 48_000, 96_000] {
        let out = full_wet(1, rate);
        let second = &out[..rate as usize];
        assert_holds_at_1_khz(second, rate);
    }
}

/// A second of effect 1 at full ramp: new samples come no closer than the hold's period and
/// no more than 1000 of them (fewer where the beat is silent and a new sample is the old).
/// `bus + w (wet - bus)` at w = 1 is the held sample to within a rounding, so a new sample
/// is a step larger than one. (Until ABI 12, 6 000: §18, designed 2026-11-24.)
fn assert_holds_at_1_khz(second: &[f32], rate: u32) {
    let at: Vec<usize> = (1..second.len()).filter(|&f| (second[f] - second[f - 1]).abs() > 1e-6).collect();
    let gap = at.windows(2).map(|w| w[1] - w[0]).min().unwrap();
    assert!((833..=1_000).contains(&at.len()), "rate {rate}: {} new samples in a second", at.len());
    assert_eq!(gap, rate as usize / 1000, "rate {rate}: new samples {gap} frames apart at the closest");
}

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
fn the_filter_s_r_goes_with_the_output_one_sixth_for_7_and_8_a_half_for_5_and_6() {
    // `h = 1 / (1 + r g + g²)`, made again when the effect changes: 5, 7, 6, 8 straight on,
    // a step each. Kept from one filter effect to the next, the states carry across (as the
    // test below holds); only `r` follows the effect.
    let mut h = Host::new(SR, 1);
    let mut edits = beat();
    edits.extend([fx(1, 5), fx(2, 7), fx(3, 6), fx(4, 8)]);
    render(&mut h, STEP as usize + 100, 128, 1, &at_zero(&edits));
    for (effect, r) in [(5u8, 0.5f32), (7, 1.0 / 6.0), (6, 0.5), (8, 1.0 / 6.0)] {
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
    assert!(diff(&full_wet(5, SR)) < diff(&dry) / 4.0, "the lowpass at 300 Hz leaves little that moves fast");
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
fn a_sweep_turns_at_432_ticks_is_back_at_864_exactly_and_is_the_same_on_both_clocks() {
    // Replaces "starts again after sixteen steps" (D91 item 3): out over 432 ticks, back over
    // 432, each end set exactly. 431 multiplies of 6 reach 191.25 Hz, 431 back 3 218.8 Hz
    // (from 3 240 since Session 26's comparison; from 2 500 as designed, 191.1 and 2 485); of
    // 8, 2 883 Hz and 221.3 Hz (§18, designed 2026-11-24).
    for (effect, from, to, back) in [(6u32, 3240.0f32, 190.0f32, 1.006_587_1f32), (8, 220.0, 2900.0, 0.994_048_24)] {
        // Edges come a step at a time, so compare at step boundaries: tick 96 n.
        for steps in [1u64, 5, 9, 15] {
            let (t, e) = (cutoff_after(effect, steps * 96, false), cutoff_after(effect, steps * 96, true));
            assert_eq!(t.to_bits(), e.to_bits(), "effect {effect}, {steps} steps: {t} on the table, {e} on edges");
        }
        assert_eq!(cutoff_after(effect, 0, false), from, "effect {effect}: where it starts");
        let (near_far, near_back) = if effect == 6 { (191.25f32, 3218.8f32) } else { (2883.0, 221.3) };
        let a = cutoff_after(effect, 431, false);
        assert!((a - near_far).abs() < 1.0, "effect {effect}: {a} Hz after 431 ticks");
        assert_eq!(cutoff_after(effect, 432, false), to, "effect {effect}: the far end, exactly");
        assert_eq!(cutoff_after(effect, 433, false).to_bits(), (to * back).to_bits(), "effect {effect}: turned");
        let b = cutoff_after(effect, 863, false);
        assert!((b - near_back).abs() < 1.0, "effect {effect}: {b} Hz after 863 ticks");
        assert_eq!(cutoff_after(effect, 864, false), from, "effect {effect}: back at its start, exactly");
        assert_eq!(cutoff_after(effect, 2 * 864, false), from, "effect {effect}: and again");
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
    assert_eq!(at(&[(1, 6), (3, 6)], 3 * STEP + 1), 3240.0);
    assert!(at(&[(1, 6), (2, 6), (3, 6)], 3 * STEP + 1) < 3000.0);
    // A punch of 6 over a lane of 6 is still 6 heard: no new run.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6), fx(2, 6), fx(3, 6)]);
    c.extend([(2 * STEP + 1, down(FX)), (2 * STEP + 1, down(5))]);
    render(&mut h, 3 * STEP as usize + 1, 128, 1, &c);
    assert!(bus(&h).probe().2 < 3000.0);
    // Heard 6, then none, then 6 again a millisecond later, while the first is still ramping
    // out: heard became 6 again, so the sweep starts again, though the bus never went idle.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6)]);
    c.extend([(2 * STEP + 48, down(FX)), (2 * STEP + 48, down(5))]);
    render(&mut h, 2 * STEP as usize + 49, 128, 1, &c);
    let (on, w, cutoff, ..) = bus(&h).probe();
    assert!(on == 6 && w > 0.0 && w < 1.0, "still ramping: {on} at {w}");
    assert_eq!(cutoff, 3240.0);
}

#[test]
fn the_repeats_and_the_effects_not_built_leave_the_mix_the_plain_sum() {
    // §18's seven only: with 4 and 9 to 16 on every step the bus never runs, and the mix is
    // the sum of the sixteen channels in track order, bit for bit.
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

#[test]
fn a_rate_change_mid_effect_keeps_the_hold_at_1_khz() {
    let mut h = Host::new(SR, 1);
    let mut edits = beat();
    edits.extend((0..16).map(|s| fx(s, 1)));
    render(&mut h, STEP as usize, 128, 1, &at_zero(&edits));
    unsafe { pi_set_sample_rate(h.e, 96_000) };
    let out = render(&mut h, 96_000, 128, 1, &[]).0;
    assert_holds_at_1_khz(&out, 96_000);
}

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
