//! Session 40 (D105 item 10): the model, written apart from the engine, given every layout, and
//! a seeded tour that drives it through every short way the engine takes today.
//!
//! `tests/quiet.rs` holds the engine to itself: a planted fault in a path both of its engines
//! run passes it (Session 36's escape, `LEARNINGS.md`). This holds every channel of every frame
//! to `Model` and `Voicing` (`tests/bus.rs`), which share nothing with the engine's mix, masks
//! or layouts: they ask each voice through its own `next`, sum in plain loops over sixteen, and
//! know no mask, no quiet frame and no short way. What the model is given is what a host knows
//! (the commands it sent, the inputs it filled, the rate, the line it lent) and what the engine
//! says it did (the view's tick, what is heard, which sounds are in the effects, the volume, and
//! the events that fired). What each frame's channels should be is never read from the engine.
//!
//! The frame each layout writes, from §15 and §19's words:
//!
//! - 1: the mix. 16: the sixteen sounds, before the volume and any effect. 17: the sixteen,
//!   then the mix.
//! - 18 (`PI_AUDIO_LOOP`), read and written: a sound `ROUTE` 0 names takes its input channel in
//!   its voice's place in the bus or the rest (not a number: silence); channel 17 in, FX
//!   RETURN, is added last, before the volume, and not at all when it is exactly 0. Out: the
//!   sixteen voices as they are, the mix, and the bus before any effect and before the volume.
//!   An effect `ROUTE` 1 names is the host's: with `ROUTE` 4 too it is an insert, silence for
//!   its sound; alone, no effect.
//! - 50 (`PI_AUDIO_LOOP_SLIDERS`): the eighteen, then the thirty-two slider outputs, each what
//!   its sound was last hit with as 0 to 1, or its own until its first hit; and at a hit, for a
//!   sound `ROUTE` 2 (A) or 3 (B) names, the input, held to 0 to 1 and to the nearest of 0 to
//!   65 535, in that slider's place. The output is the value before the input took its place.
//!
//! Where those sections are silent the build is the baseline (no byte moved in Session 40), and
//! the model says what it does with ⚠: `ENGINE.md` §19, "As built, Session 40".
//!
//! The tour counts the frames that took each of today's short ways, from the engine's own
//! fields read before the frame (counting may read them; what a frame should be may not), and
//! each count must not be 0: a gate the tour never opens holds nothing.

use super::bus::{Model, Voicing, fired_in};
use super::*;

const KEY_FX: u8 = 20;
const KEY_BPM: u8 = 18;
const RATES: [u32; 3] = [44_100, 48_000, 96_000];
const LOOP: usize = 18;
const SLIDERS: usize = 50;
/// `pi_init`'s slider, the middle: 32 768 of 65 535.
const MIDDLE: u16 = 32_768;

// ---- A seeded choice ----

/// splitmix64: every choice of the tour from the seed, none from anything the engine returns.
struct Prng(u64);

impl Prng {
    fn new(seed: u64) -> Self {
        Prng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0x5EED_0040)
    }
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// 0 to `n` − 1.
    fn below(&mut self, n: u64) -> u64 {
        if n == 0 { 0 } else { self.next() % n }
    }
    fn chance(&mut self, p: f64) -> bool {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64 <= p
    }
    fn mask(&mut self) -> u16 {
        match self.below(4) {
            0 => 0,
            1 => 0xffff,
            _ => self.next() as u16,
        }
    }
}

// ---- The tour ----

/// What comes in on the loop layouts' inputs, a style at a time.
#[derive(Clone, Copy, PartialEq)]
enum Style {
    Zeros,
    MinusZeros,
    /// A slow ramp and a sine-ish wobble, never −0, never past ±1.
    Moving,
    /// Moving, with not-numbers among them: NaN, +∞ and −∞.
    NotNumbers,
    /// Each channel its own of the four, changing every frame.
    Mixed,
    /// Moving on one sound's channel (and on channel 17 and the sliders), exact zeros on the
    /// other sounds' (Session 42: each four alone).
    Only(u8),
}

/// Something the host does before a frame: a command into that frame, or a call between frames.
#[derive(Clone, Copy)]
enum Item {
    Cmd(Cmd),
    /// `pi_set_sample_rate`.
    Rate(u32),
    /// `pi_set_delay` with a fresh line for the rate of the moment.
    Lend,
    /// `pi_set_delay` with nothing: refused, and the line forgotten.
    Unlend,
    Input(Style),
    /// The channel count the host asks for from this frame.
    Layout(usize),
}

/// One seed's run: what is set up before the first frame, and what comes when.
struct Tour {
    rate: u32,
    layout: usize,
    /// The tracks given a sample before the first frame.
    samples: u16,
    lend: bool,
    frames: u64,
    items: Vec<(u64, Item)>,
}

/// Which parts a tour may hold: all of them, or (the low rates) effects 1 and 14 alone.
#[derive(Clone, Copy, PartialEq)]
enum Parts {
    All,
    OneAndFourteen,
}

fn c(kind: u8, a: u8, b: u8, value: u32) -> Item {
    Item::Cmd(cmd(kind, a, b, value))
}

/// The tour for `seed`: about `seconds` of hits on all sixteen tracks (taps and a pattern),
/// samples given to some and switched to and from, sounds switched in and out of the effects,
/// every effect 1 to 16 held and let go, `ROUTE` 0 to 4 (none, some, all), loop inputs of zeros,
/// −0, moving values and not-numbers, a line lent and not, rate changes with sounds ringing (to
/// any of `rates`), and silences long enough to go quiet.
fn tour(seed: u64, rate: u32, layout: usize, rates: &[u32], parts: Parts, seconds: f64) -> Tour {
    let mut r = Prng::new(seed);
    let mut items: Vec<(u64, Item)> = Vec::new();
    let samples = r.next() as u16 & r.next() as u16 | 1 << r.below(16);
    let lend = r.chance(0.8);
    // Set-up on frame 0: a tempo, a pattern on some tracks, a lane, some voices on samples,
    // the routes, and play.
    items.push((0, c(CMD_TEMPO, 0, 0, 90_000 + r.below(150_000) as u32)));
    for t in 0..16u8 {
        if r.chance(0.5) {
            for s in 0..16u8 {
                if r.chance(0.25) {
                    items.push((0, c(CMD_STEP, t, s, 1)));
                }
            }
        }
        if samples >> t & 1 == 1 && r.chance(0.6) {
            items.push((0, c(CMD_VOICE, t, 0, 1)));
        }
    }
    for s in 0..16u8 {
        if r.chance(0.3) {
            let e = if parts == Parts::All { r.below(17) as u32 } else { [0, 1, 14][r.below(3) as usize] };
            items.push((0, c(CMD_FX, s, 0, e)));
        }
    }
    for a in 0..5u8 {
        let mut m = r.mask();
        if a == 1 || a == 4 {
            m &= r.next() as u16; // most effects stay the core's
        }
        items.push((0, c(CMD_ROUTE, a, 0, m as u32)));
    }
    items.push((0, Item::Input(Style::Moving)));
    items.push((0, c(CMD_PLAY, 0, 0, 1)));

    let ms = |r: &mut Prng, lo: u64, hi: u64, rate: u32| (lo + r.below(hi - lo + 1)) * rate as u64 / 1000;
    let mut now = 1u64;
    let mut cur = rate;
    let end = (seconds * rate as f64) as u64;
    // Every tour holds effect 1 over all sixteen, over all but one, and over some, early, so
    // each short way of `sound_slow` and Session 36's escape are met by every seed.
    let mut firsts: Vec<u64> = vec![100, 101, 102];
    while now < end {
        let kind = firsts.pop().unwrap_or_else(|| r.below(100));
        let len = ms(&mut r, 40, 220, cur).max(4);
        let at = |r: &mut Prng| now + r.below(len);
        match kind {
            // Taps on any of the sixteen, two at once now and then.
            0..=11 => {
                for _ in 0..1 + r.below(12) {
                    let f = at(&mut r);
                    items.push((f, c(CMD_FIRE, r.below(16) as u8, 0, 0)));
                    if r.chance(0.2) {
                        items.push((f, c(CMD_FIRE, r.below(16) as u8, 0, 0)));
                    }
                }
            }
            // The pattern: steps on and off, the lane, a tempo, play.
            12..=19 => {
                for _ in 0..r.below(10) {
                    items.push((at(&mut r), c(CMD_STEP, r.below(16) as u8, r.below(16) as u8, r.chance(0.7) as u32)));
                }
                if r.chance(0.5) {
                    let e = if parts == Parts::All { r.below(17) as u32 } else { [0, 1, 14][r.below(3) as usize] };
                    items.push((at(&mut r), c(CMD_FX, r.below(16) as u8, 0, e)));
                }
                if r.chance(0.3) {
                    items.push((at(&mut r), c(CMD_TEMPO, 0, 0, 60_000 + r.below(200_000) as u32)));
                }
                items.push((now, c(CMD_PLAY, 0, 0, 1)));
            }
            // An effect held and let go, maybe straight to another and back, taps under it.
            20..=44 => {
                let e = if parts == Parts::All { r.below(16) as u8 } else { [0, 13][r.below(2) as usize] };
                items.push((now, c(CMD_KEY_DOWN, KEY_FX, 0, 0)));
                items.push((now, c(CMD_KEY_DOWN, e, 0, 0)));
                for _ in 0..r.below(10) {
                    items.push((at(&mut r), c(CMD_FIRE, r.below(16) as u8, 0, 0)));
                }
                if r.chance(0.4) {
                    let e2 = if parts == Parts::All { r.below(16) as u8 } else { 13 - e };
                    if e2 != e {
                        let a = now + 1 + r.below(len / 2);
                        items.push((a, c(CMD_KEY_DOWN, e2, 0, 0)));
                        items.push((a + 1 + r.below(len / 3), c(CMD_KEY_UP, e2, 0, 0)));
                    }
                }
                items.push((now + len - 1, c(CMD_KEY_UP, e, 0, 0)));
                items.push((now + len - 1, c(CMD_KEY_UP, KEY_FX, 0, 0)));
            }
            // Effect 1 over every sound, every sound but one, or some, with the one left out
            // and others hit under it (kinds 100 to 102 are the same, chosen for every tour).
            45..=54 | 100..=102 => {
                let fxs: u16 = match kind {
                    100 => 0xffff,
                    101 => !(1 << r.below(16)),
                    102 => r.next() as u16 | 1,
                    _ => [0xffff, !(1u16 << r.below(16)), r.next() as u16][r.below(3) as usize],
                };
                for t in 0..16u8 {
                    items.push((now, c(CMD_FXSOUND, t, 0, (fxs >> t & 1) as u32)));
                }
                items.push((now, c(CMD_KEY_DOWN, KEY_FX, 0, 0)));
                items.push((now, c(CMD_KEY_DOWN, 0, 0, 0)));
                for i in 0..4 + r.below(12) {
                    let t = if i % 3 == 0 && fxs != 0xffff { (!fxs).trailing_zeros() as u8 } else { r.below(16) as u8 };
                    items.push((at(&mut r), c(CMD_FIRE, t, 0, 0)));
                }
                items.push((now + len - 1, c(CMD_KEY_UP, 0, 0, 0)));
                items.push((now + len - 1, c(CMD_KEY_UP, KEY_FX, 0, 0)));
            }
            // Sounds in and out of the effects: none, some, all.
            55..=61 => {
                let fxs = r.mask();
                for t in 0..16u8 {
                    items.push((now + r.below(3), c(CMD_FXSOUND, t, 0, (fxs >> t & 1) as u32)));
                }
            }
            // The routes: none, some, all, each of the five.
            62..=69 => {
                let a = r.below(5) as u8;
                let mut m = r.mask();
                if (a == 1 || a == 4) && r.chance(0.5) {
                    m &= r.next() as u16;
                }
                items.push((at(&mut r), c(CMD_ROUTE, a, 0, m as u32)));
            }
            // A sound to its sample or back to its code voice; a slider moved.
            70..=74 => {
                items.push((at(&mut r), c(CMD_VOICE, r.below(16) as u8, 0, r.chance(0.5) as u32)));
                let v = match r.below(4) {
                    0 => 0,
                    1 => 65_535,
                    _ => r.below(65_536) as u32,
                };
                items.push((at(&mut r), c(CMD_SOUND, r.below(16) as u8, r.below(2) as u8, v)));
            }
            // A rate change with sounds ringing, and the line lent again for it, or not.
            75..=79 => {
                for _ in 0..3 {
                    items.push((now, c(CMD_FIRE, r.below(16) as u8, 0, 0)));
                }
                let new = rates[r.below(rates.len() as u64) as usize];
                let f = now + 1 + r.below(len / 2);
                items.push((f, Item::Rate(new)));
                if r.chance(0.7) {
                    items.push((f + r.below(len / 2), Item::Lend));
                }
                cur = new;
            }
            // A line lent, or taken away.
            80..=82 => {
                items.push((at(&mut r), if r.chance(0.7) { Item::Lend } else { Item::Unlend }));
            }
            // A silence long enough to go quiet: stopped, nothing hit, nothing coming in.
            83..=89 => {
                let quiet = ms(&mut r, 600, 1500, cur);
                items.push((now, c(CMD_PLAY, 0, 0, 0)));
                items.push((now, Item::Input(Style::Zeros)));
                now += quiet;
                items.push((now, Item::Input(Style::Moving)));
                items.push((now, c(CMD_PLAY, 0, 0, r.chance(0.7) as u32)));
                continue;
            }
            // What comes in changes.
            90..=95 => {
                let s = [Style::Zeros, Style::MinusZeros, Style::Moving, Style::NotNumbers, Style::Mixed][r.below(5) as usize];
                items.push((at(&mut r), Item::Input(s)));
            }
            // The volume by its keys (§13): bpm held, a grid key.
            96..=97 => {
                let f = at(&mut r);
                let v = 4 + r.below(13) as u8;
                items.push((f, c(CMD_KEY_DOWN, KEY_BPM, 0, 0)));
                items.push((f, c(CMD_KEY_DOWN, v - 1, 0, 0)));
                items.push((f, c(CMD_KEY_UP, v - 1, 0, 0)));
                items.push((f, c(CMD_KEY_UP, KEY_BPM, 0, 0)));
            }
            // The host asks for another layout for a while (a cable pulled), then back.
            _ => {
                let others = [1usize, 16, 17, LOOP, SLIDERS];
                items.push((now, Item::Layout(others[r.below(5) as usize])));
                items.push((now + len - 1, Item::Layout(layout)));
            }
        }
        now += len;
    }
    // Stable: the commands of a frame keep the order they were made in.
    items.sort_by_key(|x| x.0);
    Tour { rate, layout, samples, lend, frames: now, items }
}

// ---- The driver ----

/// Frames that took each of today's short ways, counted from the engine's fields read before
/// the frame, a buffer given.
#[derive(Default, Debug)]
struct Counts {
    frames: u64,
    /// `Bus::mix` (layouts 1 and 17, an effect running): every sound in the effects, and not.
    mix_all: u64,
    mix_some: u64,
    /// `Bus::looped`: every sound returned, some, none.
    returned_all: u64,
    returned_some: u64,
    returned_none: u64,
    /// `sound_slow`: every sound slowed, and some.
    slowed_all: u64,
    slowed_some: u64,
    /// `Voices::render` with `quiet` set: no voice asked.
    quiet: u64,
}

/// §19's slider input, from its words: held to 0 to 1 (not a number: 0), to the nearest of
/// 0 to 65 535 (D80 item 7).
fn slider_in(x: f32) -> u16 {
    let x = if x.is_nan() { 0.0 } else { x.clamp(0.0, 1.0) };
    (x * 65_535.0 + 0.5) as u16
}

fn clean(x: f32) -> f32 {
    if x.is_finite() { x } else { 0.0 }
}

/// A sample for a track: a short decaying buzz, different a track. Leaked: it must outlive the
/// engine (§12), and a test's memory goes with it.
fn sample_for(t: usize) -> &'static [i16] {
    let n = 800 + t * 150;
    let v: Vec<i16> = (0..n as i32).map(|i| ((i * (31 + t as i32) % 400 - 200) * (n as i32 - i) / (n as i32 / 60)) as i16).collect();
    Box::leak(v.into_boxed_slice())
}

/// One input value of `style` for channel `ch` on frame `f`.
fn input(style: Style, f: u64, ch: usize, r: &mut Prng) -> f32 {
    let moving = |f: u64, ch: usize| {
        let x = ((f * (7 + ch as u64) + ch as u64 * 131) % 2000) as f32 / 1000.0 - 1.0;
        if x == 0.0 { 0.001 } else { x * 0.9 }
    };
    match style {
        Style::Zeros => 0.0,
        Style::MinusZeros => -0.0,
        Style::Moving => moving(f, ch),
        Style::NotNumbers => match (f + ch as u64) % 5 {
            0 => f32::NAN,
            1 => f32::INFINITY,
            2 => f32::NEG_INFINITY,
            _ => moving(f, ch),
        },
        Style::Mixed => {
            let s = [Style::Zeros, Style::MinusZeros, Style::Moving, Style::NotNumbers][r.below(4) as usize];
            input(s, f, ch, r)
        }
        Style::Only(t) => if ch < 16 && ch != t as usize { 0.0 } else { moving(f, ch) },
    }
}

/// Runs `tour` a frame at a time, one frame a call, and holds every channel of every frame to
/// the model, bit for bit. `seed` names the failure.
fn drive(seed: u64, tour: &Tour, counts: &mut Counts) {
    let mut rate = tour.rate;
    let mut layout = tour.layout;
    let h = Host::new(rate, (seed as u32).wrapping_mul(2_654_435_761) | 1);
    for t in 0..16 {
        if tour.samples >> t & 1 == 1 {
            let d = sample_for(t);
            assert_eq!(unsafe { pi_set_sample(h.e, t as u32, d.as_ptr(), d.len() as u32) }, 1);
        }
    }
    let mut m = Model::new();
    let mut vm = Voicing::of(&h);
    // Every line ever lent stays alive until the engine is gone.
    let mut lines: Vec<Vec<f32>> = Vec::new();
    fn lend(h: &Host, m: &mut Model, rate: u32, lines: &mut Vec<Vec<f32>>) {
        let mut line = vec![7.0f32; pi_delay_frames(rate) as usize];
        assert_eq!(unsafe { pi_set_delay(h.e, line.as_mut_ptr(), line.len() as u32) }, 1);
        lines.push(line);
        m.lend(pi_delay_frames(rate));
    }
    if tour.lend {
        lend(&h, &mut m, rate, &mut lines);
    }
    // What the host knows from what it sent.
    let mut params = [[MIDDLE; 2]; 16];
    let mut sampled = 0u16;
    let mut routes = [0u16; 5];
    let mut outs = [MIDDLE as f32 / 65_535.0; 32];
    let mut hit_any = 0u16;
    let mut style = Style::Zeros;
    let mut r = Prng::new(seed ^ 0xA5A5);
    let mut next = 0usize;
    let mut e_before = 0u32;
    let mut io = vec![0f32; SLIDERS];
    for f in 0..tour.frames {
        let mut cmds = Vec::new();
        while next < tour.items.len() && tour.items[next].0 == f {
            match tour.items[next].1 {
                Item::Cmd(k) => cmds.push(k),
                Item::Rate(new) => {
                    unsafe { pi_set_sample_rate(h.e, new) };
                    if new != rate {
                        rate = new;
                        vm.rerate(rate);
                        m.forget();
                    }
                }
                Item::Lend => lend(&h, &mut m, rate, &mut lines),
                Item::Unlend => {
                    assert_eq!(unsafe { pi_set_delay(h.e, core::ptr::null_mut(), 0) }, 0);
                    m.forget();
                }
                Item::Input(s) => style = s,
                Item::Layout(l) => layout = l,
            }
            next += 1;
        }
        for k in &cmds {
            let (a, b, v) = (k.a as usize, k.b as usize, k.value);
            match k.kind {
                CMD_SOUND if a < 16 && b < 2 => {
                    params[a][b] = v.min(65_535) as u16;
                    if hit_any >> a & 1 == 0 {
                        outs[a] = params[a][0] as f32 / 65_535.0;
                        outs[16 + a] = params[a][1] as f32 / 65_535.0;
                    }
                }
                CMD_VOICE if a < 16 => sampled = if v != 0 { sampled | 1 << a } else { sampled & !(1 << a) },
                CMD_ROUTE if a < 5 => routes[a] = v as u16,
                _ => {}
            }
        }
        let looped = layout >= LOOP;
        // What comes in: the inputs in a loop layout (channel 16 is not read: garbage); in the
        // others garbage the engine must write over.
        for (ch, x) in io[..layout].iter_mut().enumerate() {
            *x = if looped && ch != 16 { input(style, f, ch, &mut r) } else { f32::NAN };
        }
        let input_seen: Vec<f32> = io[..layout].to_vec();

        // Counted from the engine's fields as they are before the frame.
        {
            let e = unsafe { &*h.e };
            let running = e.bus.probe().0 != 0;
            counts.frames += 1;
            if e.voices.quiet {
                counts.quiet += 1;
            } else if e.bus.slowed == 0xffff {
                counts.slowed_all += 1;
            } else if e.bus.slowed != 0 {
                counts.slowed_some += 1;
            }
            if (layout == 1 || layout == 17) && running {
                if e.pat.fx_sounds == 0xffff {
                    counts.mix_all += 1;
                } else {
                    counts.mix_some += 1;
                }
            }
            if looped {
                match e.bus.route[0] {
                    0xffff => counts.returned_all += 1,
                    0 => counts.returned_none += 1,
                    _ => counts.returned_some += 1,
                }
            }
        }

        let mut ev = [Event::default(); CAP];
        let n = unsafe { pi_process(h.e, 1, cmds.as_ptr(), cmds.len() as u32, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), layout as u32) };
        let ev = &ev[..n as usize];
        let v = h.view();
        let tick = u32::from_le_bytes([v[0], v[1], v[2], v[3]]);
        let ticks = if f == 0 { 0 } else { tick.wrapping_sub(e_before) };
        e_before = tick;
        let heard = v[55];
        let sounds = u16::from_le_bytes([v[58], v[59]]);
        let volume = v[27];

        // §20 and §19's addition: each sound that fired is hit with its own A and B (no step
        // here keeps any), the outputs say so, and a routed input takes a slider's place.
        let fired = fired_in(ev);
        let mut hit = [[0u16; 2]; 16];
        for t in (0..16).filter(|t| fired >> t & 1 == 1) {
            outs[t] = params[t][0] as f32 / 65_535.0;
            outs[16 + t] = params[t][1] as f32 / 65_535.0;
            hit_any |= 1 << t;
            hit[t] = params[t];
            if layout == SLIDERS {
                for ab in 0..2 {
                    if routes[2 + ab] >> t & 1 == 1 {
                        hit[t][ab] = slider_in(input_seen[LOOP + ab * 16 + t]);
                    }
                }
            }
        }

        // What the core sounds: §18's table, and in a loop layout §19's (ABI 11).
        let named = |mask: u16| heard != 0 && heard <= 16 && mask >> (heard - 1) & 1 == 1;
        let own = |e: u8| matches!(e, 1 | 2 | 3 | 5 | 6 | 7 | 8) || (matches!(e, 4 | 14) && m.has_line());
        let effect = if looped && named(routes[1]) {
            if named(routes[4]) { 0x80 | heard } else { 0 }
        } else if own(heard) {
            heard
        } else {
            0
        };
        m.looped = looped;
        vm.reconcile(effect, sounds, rate, &mut m);
        vm.hits(fired, &hit, sampled, rate);
        m.advance(effect, ticks, rate);
        let voices = vm.sound(&m);

        let mut want = vec![0f32; layout];
        match layout {
            1 => want[0] = m.mixed(rate, &voices, sounds, volume, 0.0),
            16 => want.copy_from_slice(&voices),
            17 => {
                want[..16].copy_from_slice(&voices);
                want[16] = m.mixed(rate, &voices, sounds, volume, 0.0);
            }
            _ => {
                let mut mixed = voices;
                for (t, x) in mixed.iter_mut().enumerate() {
                    if routes[0] >> t & 1 == 1 {
                        *x = clean(input_seen[t]);
                    }
                }
                want[..16].copy_from_slice(&voices);
                want[16] = m.mixed(rate, &mixed, sounds, volume, clean(input_seen[17]));
                let mut send = 0.0f32;
                for (t, x) in mixed.iter().enumerate() {
                    if sounds >> t & 1 == 1 {
                        send += *x;
                    }
                }
                want[17] = send;
                if layout == SLIDERS {
                    want[LOOP..].copy_from_slice(&outs);
                }
            }
        }
        for ch in 0..layout {
            assert_eq!(
                io[ch].to_bits(),
                want[ch].to_bits(),
                "seed {seed}, layout {layout}, rate {rate}, frame {f}: channel {ch} is {} where the model says {} (heard {heard}, effect {effect:#x}, in the effects {sounds:#06x}, slowed {:#06x}, routes {routes:04x?})",
                io[ch],
                want[ch],
                vm.slowed
            );
        }
        // The effect running, which the model and the bus each keep.
        assert_eq!(unsafe { (*h.e).bus.probe().0 }, m.on, "seed {seed}, layout {layout}, rate {rate}, frame {f}: the effect running");
    }
}

/// The seeds of one layout: at least thirteen, over the three rates.
fn layout_tour(layout: usize) -> Counts {
    let mut counts = Counts::default();
    let at = [1usize, 16, 17, LOOP, SLIDERS].iter().position(|&l| l == layout).unwrap() as u64;
    for i in 0..13u64 {
        let seed = 1 + at * 1000 + i;
        let rate = RATES[(i % 3) as usize];
        let t = tour(seed, rate, layout, &RATES, Parts::All, 2.5);
        drive(seed, &t, &mut counts);
    }
    counts
}

fn not_0(name: &str, counts: &Counts, which: &[(&str, u64)]) {
    for (what, n) in which {
        assert!(*n > 0, "{name}: no frame took the short way '{what}' ({counts:?})");
    }
}

#[test]
fn the_tour_in_layout_1_is_the_model_s_bit_for_bit() {
    let k = layout_tour(1);
    not_0("layout 1", &k, &[("every sound in the effects", k.mix_all), ("some sounds in the effects", k.mix_some), ("every sound slowed", k.slowed_all), ("some slowed", k.slowed_some), ("quiet", k.quiet)]);
}

#[test]
fn the_tour_in_layout_16_is_the_model_s_bit_for_bit() {
    let k = layout_tour(16);
    not_0("layout 16", &k, &[("every sound slowed", k.slowed_all), ("some slowed", k.slowed_some), ("quiet", k.quiet)]);
}

#[test]
fn the_tour_in_layout_17_is_the_model_s_bit_for_bit() {
    let k = layout_tour(17);
    not_0("layout 17", &k, &[("every sound in the effects", k.mix_all), ("some sounds in the effects", k.mix_some), ("every sound slowed", k.slowed_all), ("some slowed", k.slowed_some), ("quiet", k.quiet)]);
}

#[test]
fn the_tour_in_layout_18_is_the_model_s_bit_for_bit() {
    let k = layout_tour(LOOP);
    not_0("layout 18", &k, &[("every sound returned", k.returned_all), ("some returned", k.returned_some), ("none returned", k.returned_none), ("every sound slowed", k.slowed_all), ("some slowed", k.slowed_some), ("quiet", k.quiet)]);
}

#[test]
fn the_tour_in_layout_50_is_the_model_s_bit_for_bit() {
    let k = layout_tour(SLIDERS);
    not_0("layout 50", &k, &[("every sound returned", k.returned_all), ("some returned", k.returned_some), ("none returned", k.returned_none), ("every sound slowed", k.slowed_all), ("some slowed", k.slowed_some), ("quiet", k.quiet)]);
}

/// The tour's effect 1 and effect 14 parts at 8 000 Hz and at 100 Hz, and rate changes between
/// them: under 11 719 Hz the grid wraps more than once a frame (4 × rate < 46 875), and nothing
/// else here runs under 44.1 kHz. Today's `%` passes; Session 41's subtraction must.
#[test]
fn effects_1_and_14_at_8_khz_and_100_hz_are_the_model_s_bit_for_bit() {
    let mut counts = Counts::default();
    for i in 0..8u64 {
        let seed = 9000 + i;
        let rate = if i % 2 == 0 { 8_000 } else { 100 };
        let layout = [1usize, 17, LOOP, SLIDERS][(i / 2) as usize];
        let t = tour(seed, rate, layout, &[8_000, 100], Parts::OneAndFourteen, 6.0);
        drive(seed, &t, &mut counts);
    }
    not_0("low rates", &counts, &[("every sound slowed", counts.slowed_all), ("some slowed", counts.slowed_some)]);
}

/// Session 42 (D105 item 8's two options, a four left out of the mask when its values are all
/// exact +0): each four met alone. One sound in tracks 4 to 7, then 8 to 11, then 12 to 15, each
/// track of each in turn, every hit and step of a tour moved to it, and in a loop layout the
/// inputs exact zeros on every other sound's channel: the other fours stay +0 while it rings
/// under effect 1 and while it is returned. Over layouts 1, 17, 18 and 50 and the three rates.
#[test]
fn each_four_alone_through_the_tour_is_the_model_s_bit_for_bit() {
    let mut counts = Counts::default();
    for t in 4..16u8 {
        let seed = 7000 + t as u64;
        let rate = RATES[(t % 3) as usize];
        let layout = [1usize, 17, LOOP, SLIDERS][(t % 4) as usize];
        let mut tour = tour(seed, rate, layout, &RATES, Parts::All, 2.0);
        for (_, item) in tour.items.iter_mut() {
            match item {
                Item::Cmd(k) if k.kind == CMD_FIRE || k.kind == CMD_STEP => k.a = t,
                Item::Input(_) => *item = Item::Input(Style::Only(t)),
                _ => {}
            }
        }
        tour.samples &= 1 << t;
        drive(seed, &tour, &mut counts);
    }
    not_0("each four alone", &counts, &[("every sound slowed", counts.slowed_all), ("every sound returned", counts.returned_all), ("quiet", counts.quiet)]);
}
