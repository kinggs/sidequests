//! Session 42 (D105 item 3): `Sum`, the frame's sums with the tracks a mask leaves out skipped,
//! held to plain loops written here. Each of its three facts (`bus.rs`, `Sum`'s doc) is checked
//! bit for bit: every combination of ten values over six tracks, and sixteen tracks by a seeded
//! draw, with the mask the non-zero tracks, all sixteen, and random supersets of the first.

use crate::bus::Sum;
use crate::seq::TRACKS;

/// ±0, ±1, the smallest denormals, ±3e38 (two of which overflow), 0.1, 2²⁴ (where adding 1
/// is lost, so the order of addition shows).
const VALUES: [f32; 10] = [
    0.0,
    -0.0,
    1.0,
    -1.0,
    f32::from_bits(1),
    f32::from_bits(0x8000_0001),
    3e38,
    -3e38,
    0.1,
    16_777_216.0,
];

/// The plain mix, §13's: from track 0, in track order.
fn plain_loop(v: &[f32; TRACKS]) -> f32 {
    let mut sum = v[0];
    for s in &v[1..] {
        sum += *s;
    }
    sum
}

/// §18's `rest` and `bus`: each from +0, in track order, a bit of `fx` choosing which.
fn split_loop(v: &[f32; TRACKS], fx: u16) -> (f32, f32) {
    let (mut rest, mut bus) = (0.0f32, 0.0f32);
    for (t, s) in v.iter().enumerate() {
        if fx >> t & 1 == 1 {
            bus += *s;
        } else {
            rest += *s;
        }
    }
    (rest, bus)
}

/// The tracks whose value is not exactly +0 (a −0 is in it).
fn nonzero(v: &[f32; TRACKS]) -> u16 {
    (0..TRACKS).filter(|&t| v[t].to_bits() != 0).fold(0, |m, t| m | 1 << t)
}

/// splitmix64, from the seed alone.
struct Prng(u64);

impl Prng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

/// Every fact for one frame and one mask, against every `fx` given. `mask` must hold every
/// track that is not +0 (the facts' condition).
fn check(v: &[f32; TRACKS], mask: u16, fxs: &[u16]) {
    assert_eq!(nonzero(v) & !mask, 0, "the test's own mask left out a track that is not +0");
    let sum = Sum::over(v, mask);
    // Sum::over is start and add, track by track: the same as calling them here.
    let mut by_hand = Sum::start(mask);
    for t in 0..TRACKS {
        if mask >> t & 1 == 1 {
            by_hand.add(v[t]);
        }
    }
    assert_eq!(sum.plain().to_bits(), by_hand.plain().to_bits(), "over is not start and add: {v:?} mask {mask:#06x}");
    // (a)
    let plain = plain_loop(v);
    assert_eq!(sum.plain().to_bits(), plain.to_bits(), "(a) plain: {v:?} mask {mask:#06x}");
    // (c)
    let (rest_all, bus_all) = split_loop(v, u16::MAX);
    assert_eq!(rest_all.to_bits(), 0, "(c) rest with every sound in the effects is +0");
    assert_eq!(sum.bus_all().to_bits(), bus_all.to_bits(), "(c) bus_all: {v:?} mask {mask:#06x}");
    // (b), and (c) through split too
    for &fx in fxs.iter().chain(&[0, u16::MAX]) {
        let (rest, bus) = Sum::split(v, mask, fx);
        let (want_rest, want_bus) = split_loop(v, fx);
        assert_eq!(
            (rest.to_bits(), bus.to_bits()),
            (want_rest.to_bits(), want_bus.to_bits()),
            "(b) split: {v:?} mask {mask:#06x} fx {fx:#06x}"
        );
    }
}

/// Supersets of `mask`, drawn: `mask` with some of the other bits set.
fn supersets(mask: u16, rng: &mut Prng, n: usize) -> Vec<u16> {
    (0..n).map(|_| mask | rng.next() as u16).collect()
}

#[test]
fn every_combination_of_ten_values_over_six_tracks_is_the_plain_loops() {
    // Six tracks spread over the sixteen, the first and the last among them; the other ten +0.
    const AT: [usize; 6] = [0, 2, 5, 9, 12, 15];
    let mut rng = Prng(0x5u64 << 40 | 42);
    let mut cases = 0u64;
    for n in 0..10u32.pow(6) {
        let mut v = [0.0f32; TRACKS];
        let mut k = n;
        for &t in &AT {
            v[t] = VALUES[(k % 10) as usize];
            k /= 10;
        }
        let fxs = [rng.next() as u16, rng.next() as u16];
        let m = nonzero(&v);
        check(&v, m, &fxs);
        check(&v, u16::MAX, &fxs);
        for s in supersets(m, &mut rng, 2) {
            check(&v, s, &fxs);
        }
        cases += 4;
    }
    assert_eq!(cases, 4_000_000);
}

#[test]
fn sixteen_tracks_by_a_seeded_draw_are_the_plain_loops() {
    let mut rng = Prng(0x5u64 << 40 | 0x16);
    let mut all_negative_zero = 0;
    for _ in 0..200_000 {
        // Each frame draws from a few of the ten values, so frames of all −0, all ±0 and a
        // single sound among zeros come up often, not one in 10¹⁶.
        let pool: Vec<f32> = (0..1 + rng.next() % 3).map(|_| VALUES[(rng.next() % 10) as usize]).collect();
        let zeros = rng.next() % 4; // 0: none forced; else a share of the tracks forced to +0
        let mut v = [0.0f32; TRACKS];
        for s in v.iter_mut() {
            *s = if zeros != 0 && rng.next() % 4 < zeros { 0.0 } else { pool[(rng.next() % pool.len() as u64) as usize] };
        }
        if v.iter().all(|s| s.to_bits() == (-0.0f32).to_bits()) {
            all_negative_zero += 1;
        }
        let fxs = [rng.next() as u16, rng.next() as u16, rng.next() as u16];
        let m = nonzero(&v);
        check(&v, m, &fxs);
        check(&v, u16::MAX, &fxs);
        for s in supersets(m, &mut rng, 2) {
            check(&v, s, &fxs);
        }
    }
    assert!(all_negative_zero > 100, "the draw met a frame of sixteen −0s only {all_negative_zero} times");
    // And the frame the plant asks for, by hand: sixteen −0s, all sixteen in the mask.
    check(&[-0.0; TRACKS], u16::MAX, &[0x0F0F]);
    assert_eq!(Sum::over(&[-0.0; TRACKS], u16::MAX).plain().to_bits(), (-0.0f32).to_bits());
}

#[test]
fn a_group_left_out_is_left_out_of_the_mask_never_subtotalled() {
    // D105 item 3's example: −2²⁴, …, 2²⁴, 1 is 1 in track order and 0 summed by groups.
    let mut v = [0.0f32; TRACKS];
    v[0] = -16_777_216.0;
    v[4] = 16_777_216.0;
    v[5] = 1.0;
    for mask in [0x0031u16, 0x00F1, 0xFFFF, 0x0F31] {
        assert_eq!(Sum::over(&v, mask).plain(), 1.0);
        assert_eq!(Sum::split(&v, mask, 0).0, 1.0);
        assert_eq!(Sum::split(&v, mask, u16::MAX).1, 1.0);
    }
    let by_groups = (v[0] + v[1] + v[2] + v[3]) + (v[4] + v[5] + v[6] + v[7]);
    assert_eq!(by_groups, 0.0, "the example no longer shows the difference");
}
