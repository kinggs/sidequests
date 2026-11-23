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
}

impl Model {
    pub(super) fn new() -> Self {
        Model { on: 0, heard: 0, w: 0.0, acc: 0, held: 0.0, s1: 0.0, s2: 0.0, cutoff: 0.0, swept: 0 }
    }

    /// One frame: what is heard (an effect the core sounds, or 0), the ticks the frame had,
    /// the sixteen voices, which go through the effects, and the volume. The mix.
    fn frame(&mut self, effect: u8, ticks: u32, rate: u32, v: &[f32], sounds: u16, volume: u8) -> f32 {
        self.frame_looped(effect, ticks, rate, v, sounds, volume, 0.0)
    }

    /// The same with §19's one addition (Session 18; `tests/route.rs` drives it): an effect
    /// whose number carries 0x80 is heard from outside, so its output is `back`, what the
    /// loop's channel 17 brought; it has no state here, and the ramp is the same ramp.
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
                }
                self.on = effect;
                self.swept = 0;
                self.cutoff = [0.0, 0.0, 0.0, 0.0, 0.0, 600.0, 8000.0, 2000.0, 100.0].get(effect as usize).copied().unwrap_or(0.0);
            } else if self.on == 6 || self.on == 8 {
                for _ in 0..ticks {
                    self.swept += 1;
                    if self.swept == 1536 {
                        self.swept = 0;
                        self.cutoff = if self.on == 6 { 8000.0 } else { 100.0 };
                    } else {
                        self.cutoff *= if self.on == 6 { 0.997_601_27 } else { 1.002_404_5 };
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
        if self.on == 0 {
            let mut sum = v[0];
            for s in &v[1..] {
                sum += *s;
            }
            return sum * gain;
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
            e if e & 0x80 != 0 => back,
            1 => {
                self.acc += 6000;
                if self.acc >= rate {
                    self.acc -= rate;
                    self.held = b;
                }
                self.held
            }
            2 => {
                let x = 6.0 * b;
                let s = if x < -3.0 {
                    -1.0
                } else if x > 3.0 {
                    1.0
                } else {
                    x * (27.0 + x * x) / (27.0 + 9.0 * x * x)
                };
                s * 0.7
            }
            3 => (12.0 * b) as i32 as f32 / 12.0,
            _ => {
                let pi = core::f64::consts::PI;
                let mut f = self.cutoff / rate as f32;
                if f > 0.3 {
                    f = 0.3;
                }
                let a = (0.326_f32 as f64 * pi * pi * pi) as f32;
                let c = (0.1823_f32 as f64 * pi * pi * pi * pi * pi) as f32;
                let g = f * (pi as f32 + f * f * (a + c * (f * f)));
                let r = 0.5;
                let h = 1.0 / (1.0 + r * g + g * g);
                let hp = (b - r * self.s1 - g * self.s1 - self.s2) * h;
                let bp = g * hp + self.s1;
                self.s1 = g * hp + bp;
                let lp = g * bp + self.s2;
                self.s2 = g * bp + lp;
                if self.on <= 6 { lp } else { hp }
            }
        };
        (rest + b + self.w * (wet - b)) * gain
    }
}

/// Runs `cmds` a frame at a time at `rate` in layout 17 and holds every frame's mix to the
/// model's, which is given the frame's sixteen voices and what the view says. Returns how
/// many frames had an effect running.
fn hold_to_model(rate: u32, cmds: &[(u64, Cmd)], frames: u64) -> usize {
    let h = Host::new(rate, 1);
    let mut m = Model::new();
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
        let effect = if SEVEN.contains(&(heard as u32)) { heard } else { 0 };
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

#[test]
fn the_mix_is_the_model_s_bit_for_bit_at_three_rates() {
    for rate in [44_100u32, 48_000, 96_000] {
        let step = rate as u64 / 8; // 120 bpm
        let running = hold_to_model(rate, &tour(step), 32 * step);
        assert!(running as u64 > 10 * step, "rate {rate}: effects ran on {running} frames");
    }
}

#[test]
fn the_mix_is_the_model_s_on_edges_too() {
    // The same, on an external clock, an edge a step: the sweeps move by ticks, so they
    // follow the edges, a burst at each.
    let mut c = tour(STEP);
    c.insert(0, (0, cmd(CMD_SOURCE, 0, 0, 1)));
    for s in 0..32 {
        c.push((s * STEP, cmd(CMD_CLOCK, 0, 0, 0)));
    }
    c.sort_by_key(|x| x.0); // stable: each frame's commands keep their order
    hold_to_model(SR, &c, 32 * STEP);
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
        assert!(same_bits(&mix(&lane, SR, 2 * STEP as usize), &mix(&kick, SR, 2 * STEP as usize)), "effect {effect}: alone");

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
fn every_effect_on_silence_is_exact_silence() {
    for effect in SEVEN {
        let lane: Vec<Cmd> = (0..16).map(|s| fx(s, effect)).collect();
        let out = mix(&lane, SR, 2 * STEP as usize);
        assert!(out.iter().all(|x| x.to_bits() == 0), "effect {effect}");
    }
}

/// The mix of the beat with an effect on every step, from the frame the ramp is full.
fn full_wet(effect: u32, rate: u32) -> Vec<f32> {
    let mut edits = beat();
    edits.extend((0..16).map(|s| fx(s, effect)));
    let out = mix(&edits, rate, rate as usize * 2);
    out[rate as usize / 100..].to_vec()
}

#[test]
fn effect_1_holds_at_6_khz_at_every_rate() {
    for rate in [44_100u32, 48_000, 96_000] {
        let out = full_wet(1, rate);
        let second = &out[..rate as usize];
        // `bus + w (wet - bus)` at w = 1 is the held sample to within a rounding, so a new
        // sample is a step larger than one.
        assert_holds_at_6_khz(second, rate);
    }
}

/// A second of effect 1 at full ramp: new samples come no closer than the hold's period and
/// no more than 6000 of them (fewer where the beat is silent and a new sample is the old).
/// `bus + w (wet - bus)` at w = 1 is the held sample to within a rounding, so a new sample
/// is a step larger than one.
fn assert_holds_at_6_khz(second: &[f32], rate: u32) {
    let at: Vec<usize> = (1..second.len()).filter(|&f| (second[f] - second[f - 1]).abs() > 1e-6).collect();
    let gap = at.windows(2).map(|w| w[1] - w[0]).min().unwrap();
    assert!((5_000..=6_000).contains(&at.len()), "rate {rate}: {} new samples in a second", at.len());
    assert_eq!(gap, rate as usize / 6000, "rate {rate}: new samples {gap} frames apart at the closest");
}

#[test]
fn effect_2_is_soft_clipped_under_0_7_and_effect_3_is_twelve_levels_a_unit() {
    let out = full_wet(2, SR);
    let peak = out.iter().fold(0f32, |m, x| m.max(x.abs()));
    assert!(peak <= 0.7 && peak > 0.6, "effect 2 peaks at {peak}");
    for x in full_wet(3, SR) {
        let k = x * 12.0;
        assert_eq!(k, k.trunc(), "effect 3: {x} is not a twelfth");
    }
}

#[test]
fn the_lowpass_takes_the_hats_away_and_the_hipass_the_drum() {
    // Effects 5 and 7 against the dry beat: the energy above and below.
    let dry = full_wet(0, SR);
    let diff = |o: &[f32]| o.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f32>();
    let level = |o: &[f32]| o.iter().map(|x| x.abs()).sum::<f32>();
    assert!(diff(&full_wet(5, SR)) < diff(&dry) / 4.0, "the lowpass at 600 Hz leaves little that moves fast");
    assert!(level(&full_wet(7, SR)) < level(&dry) / 2.0, "the hipass at 2 kHz takes the drum's weight");
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
fn a_sweep_moves_by_ticks_the_same_on_both_clocks_and_starts_again_after_sixteen_steps() {
    for (effect, from) in [(6u32, 8000.0f32), (8, 100.0)] {
        // Edges come a step at a time, so compare at step boundaries: tick 96 n.
        for steps in [1u64, 5, 15] {
            let (t, e) = (cutoff_after(effect, steps * 96, false), cutoff_after(effect, steps * 96, true));
            assert_eq!(t.to_bits(), e.to_bits(), "effect {effect}, {steps} steps: {t} on the table, {e} on edges");
        }
        let near_end = cutoff_after(effect, 1535, false);
        let (lo, hi) = if effect == 6 { (195.0, 205.0) } else { (3900.0, 4100.0) };
        assert!(near_end > lo && near_end < hi, "effect {effect}: {near_end} Hz after 1535 ticks");
        assert_eq!(cutoff_after(effect, 1536, false), from, "effect {effect}: again from the top");
        assert_eq!(cutoff_after(effect, 0, false), from, "effect {effect}: where it starts");
    }
}

#[test]
fn a_sweep_starts_again_with_each_run() {
    // Effect 6 on steps 1 and 3, not 2: at step 3 it is back at 8 kHz; on steps 1 and 2 held
    // over both, it is not.
    let at = |lane: &[(u8, u32)], frames: u64| {
        let mut h = Host::new(SR, 1);
        let edits: Vec<Cmd> = lane.iter().map(|(s, e)| fx(*s, *e)).collect();
        render(&mut h, frames as usize, 128, 1, &at_zero(&edits));
        bus(&h).probe().2
    };
    assert_eq!(at(&[(1, 6), (3, 6)], 3 * STEP + 1), 8000.0);
    assert!(at(&[(1, 6), (2, 6), (3, 6)], 3 * STEP + 1) < 7000.0);
    // A punch of 6 over a lane of 6 is still 6 heard: no new run.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6), fx(2, 6), fx(3, 6)]);
    c.extend([(2 * STEP + 1, down(FX)), (2 * STEP + 1, down(5))]);
    render(&mut h, 3 * STEP as usize + 1, 128, 1, &c);
    assert!(bus(&h).probe().2 < 7000.0);
    // Heard 6, then none, then 6 again a millisecond later, while the first is still ramping
    // out: heard became 6 again, so the sweep starts again, though the bus never went idle.
    let mut h = Host::new(SR, 1);
    let mut c = at_zero(&[fx(1, 6)]);
    c.extend([(2 * STEP + 48, down(FX)), (2 * STEP + 48, down(5))]);
    render(&mut h, 2 * STEP as usize + 49, 128, 1, &c);
    let (on, w, cutoff, ..) = bus(&h).probe();
    assert!(on == 6 && w > 0.0 && w < 1.0, "still ramping: {on} at {w}");
    assert_eq!(cutoff, 8000.0);
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
        assert_eq!((on, cutoff), (7, 2000.0));
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
fn a_rate_change_mid_effect_keeps_the_hold_at_6_khz() {
    let mut h = Host::new(SR, 1);
    let mut edits = beat();
    edits.extend((0..16).map(|s| fx(s, 1)));
    render(&mut h, STEP as usize, 128, 1, &at_zero(&edits));
    unsafe { pi_set_sample_rate(h.e, 96_000) };
    let out = render(&mut h, 96_000, 128, 1, &[]).0;
    assert_holds_at_6_khz(&out, 96_000);
}
