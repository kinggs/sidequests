//! §16: the weave. The view's three fields (bytes 48 to 54) as the sequencer fills them, and
//! `pi_weave`'s rules. These are tests of the rules (`design/DESIGN.md`, "The animation"),
//! not of a picture: no test here says which cell a diamond lights, only what must hold of
//! any drawing. `fixtures/weave-views.txt` is the set of views every harness weaves.

use super::*;
use crate::keys::VIEW_SIZE;
use crate::weave::{CELLS, DISPLAY, ECRU, H, MADDER, OCHRE, REDUCED, THREAD, TILE, W, WHITE};

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames
const STEP: u64 = 6000;
const PLAY: u8 = 21;

fn on(track: u8, step: u8) -> Cmd {
    cmd(CMD_STEP, track, step, 1)
}
fn down(key: u8) -> Cmd {
    cmd(CMD_KEY_DOWN, key, 0, 0)
}
fn up(key: u8) -> Cmd {
    cmd(CMD_KEY_UP, key, 0, 0)
}
/// The three fields: steps woven, which of the last sixteen had a sound set, tracks fired.
fn cloth(h: &Host) -> (u32, u16, u8) {
    let v = h.view();
    (u32::from_le_bytes([v[48], v[49], v[50], v[51]]), u16::from_le_bytes([v[52], v[53]]), v[54])
}
/// Play pressed on the table clock: step 1 arrives in that frame.
fn play(h: &mut Host) {
    h.block(1, &[down(PLAY), up(PLAY)]);
}

// ---- The view's bytes 48 to 54 ----

#[test]
fn woven_counts_the_steps_since_play_and_holds_when_stopped() {
    let mut h = Host::new(SR, 1);
    assert_eq!(cloth(&h), (0, 0, 0), "before any play");
    play(&mut h);
    assert_eq!(cloth(&h).0, 1, "step 1 arrives in the frame of play");
    h.run(STEP * 5 - 1, 128, &[]);
    assert_eq!(cloth(&h).0, 5, "the frame before step 6");
    h.block(1, &[]);
    assert_eq!(cloth(&h).0, 6);
    h.run(STEP * 30, 512, &[]);
    assert_eq!(cloth(&h).0, 36, "past a bar: the count does not wrap with the pattern");
    play(&mut h); // stop
    let held = cloth(&h);
    h.run(STEP * 9, 128, &[cmd(CMD_FIRE, 3, 0, 0)].map(|c| (h.now + 50, c)));
    assert_eq!(cloth(&h), (held.0, held.1, 0), "stopped, the cloth holds; a tap is not counted");
    play(&mut h);
    assert_eq!(cloth(&h).0, 1, "play starts a new cloth");
}

#[test]
fn on_an_outside_clock_the_cloth_is_empty_from_play_until_the_first_edge() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, 1), on(0, 0), cmd(CMD_PLAY, 0, 0, 1)]);
    h.run(1000, 128, &[]);
    assert_eq!(cloth(&h), (0, 0, 0), "0 at play");
    h.block(1, &[cmd(CMD_CLOCK, 0, 0, 0)]);
    assert_eq!(cloth(&h), (1, 1, 1));
}

#[test]
fn a_reset_while_playing_starts_a_new_cloth_and_a_reset_while_stopped_leaves_it() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[on(0, 0), on(0, 1), on(0, 2)]);
    play(&mut h);
    h.run(STEP * 6, 128, &[]);
    assert_eq!(cloth(&h).0, 7);
    h.block(1, &[cmd(CMD_RESET, 0, 0, 0)]);
    // On the table clock step 1 arrives again in the frame of the reset.
    assert_eq!((cloth(&h).0, cloth(&h).1), (1, 1), "a new cloth, its first step woven");
    h.run(STEP * 2, 128, &[]);
    play(&mut h); // stop
    let held = cloth(&h);
    assert_eq!(held.0, 3);
    h.block(1, &[cmd(CMD_RESET, 0, 0, 0)]);
    h.run(STEP * 3, 128, &[]);
    assert_eq!(cloth(&h), (held.0, held.1, 0), "stopped, a reset does not move the cloth");
}

#[test]
fn wove_says_which_of_the_last_sixteen_steps_had_a_sound_set_as_each_arrived() {
    let mut h = Host::new(SR, 1);
    // Steps 1 and 3 on the kick, step 4 on another sound, step 6 at probability 0.
    h.block(1, &[on(0, 0), on(0, 2), on(5, 3), on(9, 5), cmd(CMD_PROB, 9, 5, 0)]);
    play(&mut h);
    let mut want = 0u16;
    for s in 0..40u32 {
        let set = matches!(s % 16, 0 | 2 | 3 | 5);
        want = want << 1 | set as u16;
        assert_eq!((cloth(&h).0, cloth(&h).1), (s + 1, want), "at step {}", s + 1);
        h.run(STEP, 128, &[]);
    }
    // Set, not fired: the step at probability 0 counted above. And as it was woven: taking
    // a step off afterwards does not unpick the cloth.
    let before = cloth(&h).1;
    h.block(1, &[cmd(CMD_STEP, 0, 0, 0), cmd(CMD_STEP, 0, 2, 0)]);
    assert_eq!(cloth(&h).1, before);
}

#[test]
fn wove_follows_a_short_length() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[on(2, 0), cmd(CMD_LENGTH, 0, 0, 3)]);
    play(&mut h);
    h.run(STEP * 8, 128, &[]);
    // Steps 1 2 3 1 2 3 1 2 3: nine woven, the newest in bit 0.
    assert_eq!((cloth(&h).0, cloth(&h).1), (9, 0b100100100));
}

#[test]
fn fired_counts_the_tracks_that_have_fired_on_this_step_taps_included() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[on(0, 0), on(1, 0), on(2, 1)]);
    play(&mut h);
    assert_eq!(cloth(&h).2, 2, "two sounds on step 1");
    h.block(1, &[cmd(CMD_FIRE, 7, 0, 0)]);
    assert_eq!(cloth(&h).2, 3, "a tap is counted");
    h.block(1, &[cmd(CMD_FIRE, 7, 0, 0), cmd(CMD_FIRE, 0, 0, 0)]);
    assert_eq!(cloth(&h).2, 3, "tracks, not firings: the same two again add nothing");
    h.run(STEP - 3, 128, &[]);
    assert_eq!(cloth(&h).2, 3, "held to the step's last frame");
    h.block(1, &[]);
    assert_eq!(cloth(&h).2, 1, "step 2 starts again from nothing: its one sound");
    h.run(STEP, 128, &[]);
    assert_eq!(cloth(&h).2, 0, "step 3 is silent");
    // A tap by a key (write off) counts as any firing does.
    h.block(1, &[down(4), up(4)]);
    assert_eq!(cloth(&h).2, 1);
}

#[test]
fn fired_on_a_swung_step_is_nothing_until_the_step_fires() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[on(0, 1), on(1, 1), cmd(CMD_SWING, 0, 0, 48)]);
    play(&mut h);
    h.run(STEP + 10, 128, &[]); // step 2 has arrived; its sounds are half a step late
    assert_eq!((cloth(&h).0, cloth(&h).2), (2, 0));
    h.run(STEP / 2, 128, &[]);
    assert_eq!((cloth(&h).0, cloth(&h).2), (2, 2));
}

#[test]
fn every_one_of_sixteen_sounds_on_a_step_is_counted() {
    let mut h = Host::new(SR, 1);
    let all: Vec<Cmd> = (0..16).map(|t| on(t, 0)).collect();
    h.block(1, &all);
    play(&mut h);
    assert_eq!(cloth(&h).2, 16);
}

// ---- pi_weave ----

const F_PLAYING: u8 = 1;
const F_STEP: u8 = 8;

/// A view with only what the weave reads set.
fn view(tick: u32, flags: u8, swing: u8, woven: u32, wove: u16, fired: u8) -> [u8; VIEW_SIZE] {
    let mut v = [0u8; VIEW_SIZE];
    v[0..4].copy_from_slice(&tick.to_le_bytes());
    v[24] = flags;
    v[29] = swing;
    v[48..52].copy_from_slice(&woven.to_le_bytes());
    v[52..54].copy_from_slice(&wove.to_le_bytes());
    v[54] = fired;
    v
}
fn playing(tick: u32, woven: u32, wove: u16, fired: u8) -> [u8; VIEW_SIZE] {
    view(tick, F_PLAYING | F_STEP, 0, woven, wove, fired)
}
fn cells(v: &[u8; VIEW_SIZE], flags: u32) -> Vec<u8> {
    let mut out = vec![0xEEu8; CELLS];
    assert_eq!(unsafe { pi_weave(v.as_ptr(), 64, flags, out.as_mut_ptr(), CELLS as u32) }, CELLS as u32);
    out
}
fn at(c: &[u8], x: usize, y: usize) -> u8 {
    c[y * W + x]
}
/// The columns that are one colour from top to bottom.
fn whole_columns(c: &[u8], colour: u8) -> Vec<usize> {
    (0..W).filter(|x| (0..H).all(|y| at(c, *x, y) == colour)).collect()
}
/// The cloth's width: the columns left of the beater. The beater is the leftmost whole
/// ochre column (a diamond's ochre never fills a column).
fn edge(c: &[u8]) -> usize {
    whole_columns(c, OCHRE)[0]
}
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> u32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0
    }
    /// Any view at all: every byte random, then the flags as asked.
    fn view(&mut self, flags: Option<u8>) -> [u8; VIEW_SIZE] {
        let mut v = [0u8; VIEW_SIZE];
        v.iter_mut().for_each(|b| *b = self.next() as u8);
        if self.next() % 2 == 0 {
            v[49..52].fill(0); // as often a short cloth as a long one
            v[48] %= 40;
        }
        v[29] %= 49;
        v[54] %= 17;
        if let Some(f) = flags {
            v[24] = f;
        }
        v
    }
}

#[test]
fn the_header_and_the_core_agree_on_the_size_and_every_cell_is_a_palette_number() {
    assert_eq!((W, H), (78, 15));
    let mut r = Rng(7);
    for _ in 0..2000 {
        let v = r.view(None);
        for flags in [0, REDUCED] {
            assert!(cells(&v, flags).iter().all(|c| *c <= MADDER));
        }
    }
}

#[test]
fn pi_weave_refuses_a_short_view_or_too_little_room_and_writes_nothing() {
    let v = playing(0, 5, 3, 1);
    let mut out = vec![0xEEu8; CELLS];
    unsafe {
        assert_eq!(pi_weave(core::ptr::null(), 64, 0, out.as_mut_ptr(), CELLS as u32), 0);
        assert_eq!(pi_weave(v.as_ptr(), 63, 0, out.as_mut_ptr(), CELLS as u32), 0);
        assert_eq!(pi_weave(v.as_ptr(), 64, 0, core::ptr::null_mut(), CELLS as u32), 0);
        assert_eq!(pi_weave(v.as_ptr(), 64, 0, out.as_mut_ptr(), CELLS as u32 - 1), 0);
    }
    assert!(out.iter().all(|b| *b == 0xEE));
}

#[test]
fn the_weave_reads_only_the_tick_the_flags_the_swing_and_its_own_seven_bytes() {
    let mut r = Rng(11);
    for _ in 0..500 {
        let v = r.view(None);
        let mut other = r.view(None);
        other[0..4].copy_from_slice(&v[0..4]);
        other[24] = other[24] & !(F_PLAYING | F_STEP) | v[24] & (F_PLAYING | F_STEP);
        other[29] = v[29];
        other[48..55].copy_from_slice(&v[48..55]);
        assert_eq!(cells(&v, 0), cells(&other, 0));
        assert_eq!(cells(&v, REDUCED), cells(&other, REDUCED));
        assert_eq!(cells(&v, 0), cells(&v, 0xFFFF_FFFE), "only bit 0 of the flags is read");
    }
}

/// Rule 7.
#[test]
fn stopped_the_cells_do_not_depend_on_the_tick_or_on_what_fired() {
    let mut r = Rng(3);
    for _ in 0..500 {
        // Stopped; and playing with no step yet (an outside clock before its first edge).
        for flags in [0, F_STEP, F_PLAYING] {
            let v = r.view(Some(flags));
            let mut later = v;
            later[0..4].copy_from_slice(&r.next().to_le_bytes());
            later[54] = r.next() as u8;
            later[29] = (r.next() % 49) as u8;
            for f in [0, REDUCED] {
                let c = cells(&v, f);
                assert_eq!(c, cells(&later, f));
                assert!(!c.contains(&WHITE), "nothing flashes while stopped");
            }
        }
    }
}

/// Rule 7.
#[test]
fn stopped_the_shuttle_rests_at_the_top_with_no_thread_behind_it() {
    for woven in [0u32, 1, 6, 16, 37] {
        let c = cells(&view(4321, 0, 0, woven, 0, 0), 0);
        let e = edge(&c);
        // Right of the beater: ecru is the shuttle alone, and all of it is in the top rows.
        let ecru: Vec<(usize, usize)> = (0..H).flat_map(|y| (e + 1..W).map(move |x| (x, y))).filter(|(x, y)| at(&c, *x, *y) == ECRU).collect();
        assert!(!ecru.is_empty());
        let rows = ecru.iter().map(|p| p.1).max().unwrap() + 1;
        assert!(ecru.iter().any(|p| p.1 == 0) && rows <= 5, "woven {woven}: the shuttle is at the top");
        assert_eq!(ecru.len() % rows, 0, "a block, with no thread trailing");
    }
}

/// Rule 4.
#[test]
fn the_beater_is_one_cell_wide_at_no_firings_and_four_at_sixteen() {
    for woven in 1..=40u32 {
        let mut last = 0;
        for fired in 0..=16u8 {
            // No sound set in the cloth, so the only ochre is the beater.
            let c = cells(&playing((woven - 1) * 96 + 50, woven, 0, fired), 0);
            let width = whole_columns(&c, OCHRE).len();
            assert_eq!(c.iter().filter(|x| **x == OCHRE).count(), width * H, "the beater is whole columns");
            assert!(width >= last, "more sounds never narrow it");
            assert!((1..=4).contains(&width));
            if fired == 0 {
                assert_eq!(width, 1);
            }
            if fired == 16 {
                assert_eq!(width, 4);
            }
            last = width;
        }
    }
}

/// Rule 3.
#[test]
fn a_beat_with_nothing_set_weaves_one_stitch() {
    for beats in 1..=4usize {
        let c = cells(&playing(50, beats as u32 * 4, 0, 0), 0);
        let e = edge(&c);
        assert_eq!(e % beats, 0);
        let beat = e / beats;
        for b in 0..beats {
            let block: Vec<u8> = (0..H).flat_map(|y| (b * beat..(b + 1) * beat).map(move |x| (x, y))).map(|(x, y)| at(&c, x, y)).collect();
            assert_eq!(block.iter().filter(|x| **x != TILE).count(), 1, "beat {b} of {beats}: one stitch on plain cloth");
        }
    }
}

/// Rule 3.
#[test]
fn the_more_of_a_beats_steps_are_set_the_bigger_its_diamond_and_four_fill_the_height() {
    let mut sizes = Vec::new();
    for steps in [0u16, 0b1, 0b101, 0b1101, 0b1111] {
        let c = cells(&playing(50, 4, steps, 0), 0);
        let e = edge(&c);
        let lit = (0..H).flat_map(|y| (0..e).map(move |x| (x, y))).filter(|(x, y)| at(&c, *x, *y) != TILE).count();
        sizes.push(lit);
        if steps == 0b1111 {
            assert!((0..e).any(|x| at(&c, x, 0) != TILE) && (0..e).any(|x| at(&c, x, H - 1) != TILE), "the full diamond reaches top and bottom");
        }
    }
    assert!(sizes.windows(2).all(|w| w[0] < w[1]), "{sizes:?}");
    // Which steps are set does not matter, only how many.
    let (a, b) = (cells(&playing(50, 4, 0b0011, 0), 0), cells(&playing(50, 4, 0b1100, 0), 0));
    assert_eq!(a, b);
}

/// Rules 1 and 2.
#[test]
fn the_cloth_grows_a_quarter_of_a_diamond_a_step_then_scrolls_a_diamond_a_beat() {
    let quarter = edge(&cells(&playing(0, 1, 0, 0), 0));
    assert!(quarter >= 1);
    let mut r = Rng(5);
    for woven in 1..=200u32 {
        let wove = r.next() as u16;
        let c = cells(&playing((woven - 1) * 96, woven, wove, 0), 0);
        let e = edge(&c);
        // The edge stays in view, with room past it for the widest beater and the shuttle.
        assert!(e + 4 < W, "woven {woven}");
        if woven <= 16 {
            assert_eq!(e, woven as usize * quarter, "a quarter a step");
        } else {
            assert_eq!(e, (12 + (woven as usize - 1) % 4 + 1) * quarter, "three diamonds and the one being woven");
        }
        // Left of the edge is cloth, with no bare warp in it.
        assert!((0..e).all(|x| (0..H).all(|y| ![DISPLAY, THREAD].contains(&at(&c, x, y)))));
        // Once it scrolls, a finished beat is the same diamond one place to the left a beat later.
        if woven >= 16 && woven % 4 == 0 {
            let next = cells(&playing((woven + 3) * 96, woven + 4, wove << 4 | (r.next() as u16 & 15), 0), 0);
            let beat = 4 * quarter;
            for y in 0..H {
                for x in beat..4 * beat {
                    assert_eq!(at(&c, x, y), at(&next, x - beat, y), "woven {woven} at {x},{y}");
                }
            }
        }
    }
}

/// The shuttle's cells: ecru right of the beater.
fn shuttle_rows(c: &[u8]) -> (usize, usize) {
    let e = whole_columns(c, OCHRE).into_iter().max().unwrap();
    // The widest ecru run in a row is the shuttle's body; the thread is one cell wide.
    let wide: Vec<usize> = (0..H).filter(|y| (e + 1..W).filter(|x| at(c, *x, *y) == ECRU).count() > 1).collect();
    (wide[0], *wide.last().unwrap())
}

/// Rule 5.
#[test]
fn the_shuttle_crosses_once_a_step_down_on_odd_steps_and_back_on_even_ones() {
    for woven in 1..=9u32 {
        let base = (woven - 1) * 96;
        let rows: Vec<(usize, usize)> = (0..96).map(|p| shuttle_rows(&cells(&playing(base + p, woven, 0, 0), 0))).collect();
        let (first, last) = (rows[0], rows[95]);
        if woven % 2 == 1 {
            assert_eq!((first.0, last.1), (0, H - 1), "step {woven}: from the top to the bottom");
            assert!(rows.windows(2).all(|w| w[0].0 <= w[1].0), "and never back");
        } else {
            assert_eq!((first.1, last.0), (H - 1, 0), "step {woven}: from the bottom to the top");
            assert!(rows.windows(2).all(|w| w[0].0 >= w[1].0));
        }
        // It trails one thread from the side it left: one cell wide, in every row behind it.
        let c = cells(&playing(base + 48, woven, 0, 0), 0);
        let e = edge(&c);
        let (top, bottom) = shuttle_rows(&c);
        let behind: Vec<usize> = if woven % 2 == 1 { (0..top).collect() } else { (bottom + 1..H).collect() };
        let ahead: Vec<usize> = if woven % 2 == 1 { (bottom + 1..H).collect() } else { (0..top).collect() };
        assert!(!behind.is_empty() && !ahead.is_empty());
        for y in behind {
            assert_eq!((e + 1..W).filter(|x| at(&c, *x, y) == ECRU).count(), 1, "a thread behind");
        }
        for y in ahead {
            assert_eq!((e + 1..W).filter(|x| at(&c, *x, y) == ECRU).count(), 0, "none ahead");
        }
    }
}

/// Rule 6.
#[test]
fn two_sounds_together_flash_the_newest_rows_white_and_one_sound_does_not() {
    for woven in 1..=20u32 {
        let base = (woven - 1) * 96;
        for fired in 0..=16u8 {
            let c = cells(&playing(base, woven, 0xFFFF, fired), 0);
            let white = whole_columns(&c, WHITE);
            if fired < 2 {
                assert!(!c.contains(&WHITE), "fired {fired}");
                continue;
            }
            // The newest rows: whole columns, together, ending at the beater.
            assert_eq!(c.iter().filter(|x| **x == WHITE).count(), white.len() * H);
            assert_eq!(white.len(), 3);
            assert_eq!(*white.last().unwrap() + 1, edge(&c));
            assert!(white.windows(2).all(|w| w[0] + 1 == w[1]));
        }
        // It is a flash: over well before the step is.
        let whites: Vec<bool> = (0..96).map(|p| cells(&playing(base + p, woven, 0, 2), 0).contains(&WHITE)).collect();
        let n = whites.iter().filter(|w| **w).count();
        assert!(whites[0] && n >= 1 && n <= 48 && whites[..n].iter().all(|w| *w), "{n} ticks");
    }
}

/// Rule 6, with §5's swing: a swung step's sounds fire late, and the flash is theirs.
#[test]
fn on_a_swung_step_the_flash_starts_when_the_sounds_fire() {
    // Step 2 of the clock (ticks 96 to 191) is swung by 40 ticks.
    let at_tick = |p: u32, fired: u8| cells(&view(96 + p, F_PLAYING | F_STEP, 40, 2, 3, fired), 0).contains(&WHITE);
    assert!(!at_tick(0, 2) && !at_tick(39, 2), "not before they fire");
    assert!(at_tick(40, 2), "as they fire");
    assert!(!at_tick(95, 2));
    // Step 1 (ticks 0 to 95) is not swung, whatever the swing.
    assert!(cells(&view(0, F_PLAYING | F_STEP, 40, 1, 1, 2), 0).contains(&WHITE));
}

/// Reduced motion: rule 6 is off and the shuttle jumps.
#[test]
fn reduced_motion_never_draws_white_rows() {
    let mut r = Rng(9);
    for _ in 0..3000 {
        let v = r.view(None);
        assert!(!cells(&v, REDUCED).contains(&WHITE));
    }
    for woven in 1..=20u32 {
        for fired in 0..=16u8 {
            for p in 0..96 {
                assert!(!cells(&playing((woven - 1) * 96 + p, woven, 0xFFFF, fired), REDUCED).contains(&WHITE));
            }
        }
    }
}

#[test]
fn with_reduced_motion_nothing_moves_inside_a_step_and_the_shuttle_jumps_side_to_side() {
    let mut r = Rng(13);
    for woven in 1..=12u32 {
        let (wove, fired, swing) = (r.next() as u16, (r.next() % 17) as u8, (r.next() % 49) as u8);
        let base = (woven - 1) * 96;
        let first = cells(&view(base, F_PLAYING | F_STEP, swing, woven, wove, fired), REDUCED);
        for p in 1..96 {
            assert_eq!(first, cells(&view(base + p, F_PLAYING | F_STEP, swing, woven, wove, fired), REDUCED), "tick {p}");
        }
        let (top, bottom) = shuttle_rows(&first);
        assert!(if woven % 2 == 1 { bottom == H - 1 } else { top == 0 }, "at the side it was going to");
    }
}

/// Natively and from the `.wasm`, the same bytes for a set of views: this writes what the
/// Rust build weaves from `fixtures/weave-views.txt`; the C++ and Node harnesses write
/// theirs, and the Makefile compares the three.
#[test]
fn the_set_of_views_weaves() {
    let path = format!("{}/../fixtures/weave-views.txt", env!("CARGO_MANIFEST_DIR"));
    let mut report = String::new();
    let mut n = 0;
    for l in std::fs::read_to_string(path).unwrap().lines().filter(|l| !l.starts_with('#') && !l.is_empty()) {
        let f: Vec<&str> = l.split(' ').collect();
        let (name, flags, hex) = (f[0], f[1].parse::<u32>().unwrap(), f[2]);
        assert_eq!(hex.len(), 128, "{name}");
        let mut v = [0u8; VIEW_SIZE];
        for (i, b) in v.iter_mut().enumerate() {
            *b = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap();
        }
        let c = cells(&v, flags);
        report += &format!("# {name} {flags}\n");
        for row in c.chunks(W) {
            report += &row.iter().map(|x| (b'0' + x) as char).collect::<String>();
            report.push('\n');
        }
        n += 1;
    }
    assert!(n >= 40, "the set is {n} views");
    if let Ok(path) = std::env::var("PI_WEAVE") {
        std::fs::write(path, report).unwrap();
    }
}
