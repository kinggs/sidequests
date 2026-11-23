//! §20 (ABI 8; D75): the sliders are the hand's, and a step keeps what it was written with.
//! A test for each row and bullet of §20, in its order. The fixture
//! `keeps-what-it-was-written-with` holds the same rules as a player would meet them, and
//! `harness/render-keep.json` the sound of it, native against WebAssembly; these hold each
//! rule alone. The rules §20 changed in §13 and §14 (a slider sets every sound; choosing a
//! sound moves no cap) are also held in `keys.rs`.

use super::sound::render;
use super::*;
use crate::crc::crc32;

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames
const STEP: u64 = 6000;
const CLICK: u8 = 9; // a sine whose pitch is slider A: the plainest to hear a value by

const SOUND: u8 = 16;
const PATTERN: u8 = 17;
const BPM: u8 = 18;
const FUNCTION: u8 = 19;
const FX: u8 = 20;
const WRITE: u8 = 22;

fn down(key: u8) -> Cmd {
    cmd(CMD_KEY_DOWN, key, 0, 0)
}
fn up(key: u8) -> Cmd {
    cmd(CMD_KEY_UP, key, 0, 0)
}
fn param(slider: u8, value: u32) -> Cmd {
    cmd(CMD_PARAM, slider, 0, value)
}
fn keep(track: u8, step: u8, a: u16, b: u16) -> Cmd {
    cmd(CMD_KEEP, track, step, (a as u32) << 16 | b as u32)
}
fn step(track: u8, s: u8, v: u32) -> Cmd {
    cmd(CMD_STEP, track, s, v)
}
fn sound(track: u8, slider: u8, v: u32) -> Cmd {
    cmd(CMD_SOUND, track, slider, v)
}
fn play() -> Cmd {
    cmd(CMD_PLAY, 0, 0, 1)
}

fn fresh() -> Host {
    Host::new(SR, 1)
}

/// What step `s` of track `t` keeps, read from the snapshot as a host would.
fn kept(h: &Host, t: usize, s: usize) -> Option<(u16, u16)> {
    let b = h.save();
    let keep = u16::from_le_bytes([b[404 + 2 * t], b[405 + 2 * t]]);
    let at = 436 + 4 * (16 * t + s);
    let ab = (u16::from_le_bytes([b[at], b[at + 1]]), u16::from_le_bytes([b[at + 2], b[at + 3]]));
    if keep >> s & 1 == 1 {
        Some(ab)
    } else {
        assert_eq!(ab, (0, 0), "zero where nothing is kept");
        None
    }
}

/// The view's caps (bytes 20 to 23) and the second mark (60 to 63).
fn caps(h: &Host) -> (u16, u16) {
    let v = h.view();
    (u16::from_le_bytes([v[20], v[21]]), u16::from_le_bytes([v[22], v[23]]))
}
fn mark(h: &Host) -> (u16, u16) {
    let v = h.view();
    (u16::from_le_bytes([v[60], v[61]]), u16::from_le_bytes([v[62], v[63]]))
}

fn same_bits(a: &[f32], b: &[f32]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

fn crossings(out: &[f32]) -> usize {
    out.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count()
}

/// Puts a snapshot's CRC right after a byte was changed on purpose.
fn recrc(s: &mut [u8]) {
    let n = s.len() - 4;
    let crc = crc32(&s[..n]);
    s[n..].copy_from_slice(&crc.to_le_bytes());
}

// ---- Commands and keys ----

#[test]
fn keep_gives_a_step_its_values_and_moves_the_generation_only_when_it_changes_something() {
    let mut h = fresh();
    let g = h.generation();
    h.block(1, &[keep(2, 5, 1000, 2000)]);
    assert_eq!(kept(&h, 2, 5), Some((1000, 2000)), "A in the high sixteen bits, B in the low");
    assert_eq!(h.generation(), g + 1);
    h.block(1, &[keep(2, 5, 1000, 2000)]);
    assert_eq!(h.generation(), g + 1, "the same values again: nothing changed");
    h.block(1, &[cmd(CMD_KEEP, 2, 5, 0xFFFF_0000)]);
    assert_eq!(kept(&h, 2, 5), Some((65535, 0)));
    assert_eq!(h.generation(), g + 2);
    // Kept, though the step is off: a KEEP is an edit like any other, and STEP 1 later
    // plays it. (§20 says nothing of the step's state; the plain reading.)
    assert_eq!(h.save()[24 + 4..24 + 6], [0, 0], "track 2 has no step on");
    // Kept as (0, 0) is still kept: the bit says so, not the values.
    h.block(1, &[keep(4, 0, 0, 0)]);
    assert_eq!(kept(&h, 4, 0), Some((0, 0)));
    assert_eq!(h.generation(), g + 3);
    // An index out of range is ignored (§3).
    let (snap, g) = (h.save(), h.generation());
    h.block(1, &[cmd(CMD_KEEP, 16, 0, 7), cmd(CMD_KEEP, 0, 16, 7), cmd(CMD_KEEP, 255, 255, 7)]);
    assert_eq!((h.save(), h.generation()), (snap, g));
}

#[test]
fn step_0_forgets_and_step_1_keeps_nothing_by_itself() {
    let mut h = fresh();
    h.block(1, &[step(3, 7, 1)]);
    assert_eq!(kept(&h, 3, 7), None, "a host's edit is not a hand");
    h.block(1, &[keep(3, 7, 11, 22)]);
    let g = h.generation();
    h.block(1, &[step(3, 7, 1)]);
    assert_eq!((kept(&h, 3, 7), h.generation()), (Some((11, 22)), g), "on again: nothing changes");
    h.block(1, &[step(3, 7, 0)]);
    assert_eq!(kept(&h, 3, 7), None);
    assert_eq!(h.generation(), g + 1, "one edit, one move");
    // A step that is off but keeps: STEP 0 forgets, and that alone is a change.
    h.block(1, &[keep(3, 8, 1, 2)]);
    let g = h.generation();
    h.block(1, &[step(3, 8, 0)]);
    assert_eq!((kept(&h, 3, 8), h.generation()), (None, g + 1));
    h.block(1, &[step(3, 8, 0)]);
    assert_eq!(h.generation(), g + 1, "nothing left to forget");
}

#[test]
fn with_bpm_held_a_slider_is_swing_and_tempo_and_no_sound_s_value_moves() {
    let mut h = fresh();
    let before = h.save();
    h.block(1, &[down(BPM), param(0, 20_000), param(1, 40_000), up(BPM)]);
    let s = h.save();
    assert_eq!((s[21], u32::from_le_bytes(s[16..20].try_into().unwrap())), (15, 170_000));
    assert_eq!(s[312..376], before[312..376], "every sound's own A and B as they were");
}

#[test]
fn a_write_mode_key_that_turns_a_step_on_keeps_the_chosen_sound_s_own_as_they_are_on_that_frame() {
    let mut h = fresh();
    // The hand at A 10000; sound 4's own B set apart by an edit.
    h.block(1, &[param(0, 10_000), sound(3, 1, 777), down(SOUND), down(3), up(3), up(SOUND), down(WRITE), up(WRITE)]);
    h.block(1, &[down(6), up(6)]);
    assert_eq!(kept(&h, 3, 6), Some((10_000, 777)), "the chosen sound's own, B and all");
    // On that frame: a move before the key in the same frame counts, one after does not.
    h.block(1, &[param(0, 5), down(7), up(7), down(8), param(0, 6), up(8)]);
    assert_eq!(kept(&h, 3, 7), Some((5, 777)));
    assert_eq!(kept(&h, 3, 8), Some((5, 777)));
    // Moving the sliders afterwards does not change a written step.
    h.block(1, &[param(0, 60_000), param(1, 100)]);
    assert_eq!(kept(&h, 3, 6), Some((10_000, 777)));
    // Off is STEP 0: it forgets. On again keeps what the hand says now.
    h.block(1, &[down(6), up(6)]);
    assert_eq!(kept(&h, 3, 6), None);
    h.block(1, &[down(6), up(6)]);
    assert_eq!(kept(&h, 3, 6), Some((60_000, 100)));
    // Only the chosen sound's step: no other track keeps anything.
    for t in (0..16).filter(|t| *t != 3) {
        assert!((0..16).all(|s| kept(&h, t, s).is_none()), "track {t}");
    }
}

#[test]
fn a_grid_key_that_writes_nothing_keeps_nothing() {
    // Write off (a tap), or with sound, fx, pattern, function or bpm held: no step, no keep.
    for held in [None, Some(SOUND), Some(FX), Some(PATTERN), Some(FUNCTION), Some(BPM)] {
        let mut h = fresh();
        let mut c = vec![param(0, 4242)];
        if let Some(k) = held {
            c.extend([down(WRITE), up(WRITE), down(k)]);
        }
        c.extend([down(2), up(2)]);
        h.block(1, &c);
        assert!((0..16).all(|t| h.save()[404 + 2 * t] == 0 && h.save()[405 + 2 * t] == 0), "{held:?}");
    }
}

#[test]
fn clear_forgets_every_step_s_values() {
    let mut h = fresh();
    h.block(1, &[down(WRITE), up(WRITE), param(1, 9), down(0), up(0), down(15), up(15), keep(12, 3, 4, 5)]);
    assert!(kept(&h, 0, 0).is_some() && kept(&h, 12, 3).is_some());
    let g = h.generation();
    h.block(1, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]);
    assert_ne!(h.generation(), g);
    assert!(h.save()[404..1460].iter().all(|b| *b == 0), "every keep bit and value gone");
    // A keep on a step that is off is forgotten too, and that alone moves the generation.
    h.block(1, &[keep(1, 1, 1, 1)]);
    let g = h.generation();
    h.block(1, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]);
    assert_eq!((kept(&h, 1, 1), h.generation()), (None, g + 1));
}

#[test]
fn choosing_a_sound_sets_nothing_and_moves_nothing() {
    let mut h = fresh();
    h.block(1, &[param(0, 1234), param(1, 4321), keep(5, 5, 9, 9)]);
    let (before, caps_before) = (h.save(), caps(&h));
    h.block(1, &[down(SOUND), down(5), up(5), up(SOUND)]);
    assert_eq!(caps(&h), caps_before, "no cap moves");
    let after = h.save();
    for (i, (x, y)) in before.iter().zip(after.iter()).enumerate() {
        if !(i == 379 || i >= SNAP - 4) {
            assert_eq!(x, y, "byte {i}: only the chosen sound (379) and the CRC change");
        }
    }
}

// ---- Which values a hit uses ----

/// The click on these steps, keeping these values, with these own values; played from frame
/// 0 for `steps` steps. The mix.
fn click(own: (u16, u16), steps: &[(u8, Option<(u16, u16)>)], extra: &[(u64, Cmd)], n: u64) -> (Vec<f32>, Host) {
    let mut h = fresh();
    let mut c = vec![(0, sound(CLICK, 0, own.0 as u32)), (0, sound(CLICK, 1, own.1 as u32))];
    for (s, k) in steps {
        c.push((0, step(CLICK, *s, 1)));
        if let Some((a, b)) = k {
            c.push((0, keep(CLICK, *s, *a, *b)));
        }
    }
    c.push((0, play()));
    c.extend_from_slice(extra);
    c.sort_by_key(|x| x.0);
    let out = render(&mut h, (n * STEP) as usize, 128, 1, &c).0;
    (out, h)
}

#[test]
fn a_step_plays_what_it_keeps_or_its_sound_s_own_if_it_keeps_nothing() {
    // Step 0 keeps (60000, 20000); step 4 keeps nothing. The sound's own is (1000, 32768).
    let (kept_run, _) = click((1000, 32768), &[(0, Some((60_000, 20_000))), (4, None)], &[], 8);
    // The same, said with the sound's own values: (60000, 20000) for step 0's hit, then
    // (1000, 32768) set before step 4's. A sounding voice is not moved by the edit (D56).
    let set = [(3 * STEP, sound(CLICK, 0, 1000)), (3 * STEP, sound(CLICK, 1, 32768))];
    let (own_run, _) = click((60_000, 20_000), &[(0, None), (4, None)], &set, 8);
    assert!(same_bits(&kept_run, &own_run));
    assert!(kept_run.iter().any(|s| *s != 0.0));
    // And it is not what the sound's own would have played on step 0.
    let (plain, _) = click((1000, 32768), &[(0, None), (4, None)], &[], 8);
    assert!(!same_bits(&kept_run[..4 * STEP as usize], &plain[..4 * STEP as usize]));
    assert!(same_bits(&kept_run[4 * STEP as usize..], &plain[4 * STEP as usize..]), "step 4 is the sound's own in both");
}

#[test]
fn a_tap_and_fire_play_the_sound_s_own_whatever_a_step_keeps() {
    // Stopped. Step 0 keeps (60000, 20000), but a tap at frame 100 and a FIRE at 9000 both
    // play the sound's own (1000, 32768): the same bits as with nothing kept.
    let taps = |keeps: bool| {
        let mut h = fresh();
        let mut c = vec![(0, sound(CLICK, 0, 1000)), (0, step(CLICK, 0, 1))];
        if keeps {
            c.push((0, keep(CLICK, 0, 60_000, 20_000)));
        }
        c.extend([(100, down(CLICK)), (101, up(CLICK)), (9000, cmd(CMD_FIRE, CLICK, 0, 0))]);
        let out = render(&mut h, 20_000, 128, 1, &c).0;
        (out, h)
    };
    let ((with, h), (without, _)) = (taps(true), taps(false));
    assert!(same_bits(&with, &without));
    assert!(with[100..].iter().any(|s| *s != 0.0));
    assert_eq!(h.view()[32 + CLICK as usize], 2, "two hits");
}

#[test]
fn a_repeated_hit_plays_what_its_run_step_keeps() {
    // Effect 11 (a hit every 48 ticks) on steps 1 to 3: every hit of the run is from column
    // 1, which keeps (60000, 20000). The sound's own is (1000, 32768).
    let lane = [(0, cmd(CMD_FX, 1, 0, 11)), (0, cmd(CMD_FX, 2, 0, 11)), (0, cmd(CMD_FX, 3, 0, 11))];
    let (kept_run, h) = click((1000, 32768), &[(1, Some((60_000, 20_000)))], &lane, 6);
    let (own_run, _) = click((60_000, 20_000), &[(1, None)], &lane, 6);
    assert!(same_bits(&kept_run, &own_run));
    assert_eq!(h.view()[32 + CLICK as usize], 6, "six hits in the run: three steps, two a step");
    // A sound out of the effects plays its own step on as usual: that step's keep.
    let mut out_lane = lane.to_vec();
    out_lane.push((0, cmd(CMD_FXSOUND, CLICK, 0, 0)));
    let (kept_plain, _) = click((1000, 32768), &[(1, Some((60_000, 20_000)))], &out_lane, 6);
    let (own_plain, _) = click((60_000, 20_000), &[(1, None)], &out_lane, 6);
    assert!(same_bits(&kept_plain, &own_plain));
}

#[test]
fn a_hit_is_read_once_and_never_moves_a_voice_that_is_sounding() {
    // A long click (B high) from step 0's keep; the hand and the sound's own move while it
    // sounds, and a later KEEP on the same step too. Nothing it plays changes until a hit.
    let moves = [
        (500, param(0, 0)),
        (600, param(1, 0)),
        (700, keep(CLICK, 0, 1, 1)),
    ];
    let (moved, _) = click((1000, 32768), &[(0, Some((40_000, 65_535)))], &moves, 4);
    let (still, _) = click((1000, 32768), &[(0, Some((40_000, 65_535)))], &[], 4);
    assert!(same_bits(&moved, &still));
}

// ---- The view ----

#[test]
fn the_second_mark_is_the_chosen_sound_s_last_hit_and_its_own_until_then() {
    let mut h = fresh();
    assert_eq!(mark(&h), (32768, 32768), "pi_init: its own");
    h.block(1, &[param(0, 500)]);
    assert_eq!(mark(&h), (500, 32768), "not hit yet: its own follows the hand");
    // Sound 1 on step 0, kept at (7, 8); played from the next step boundary (frame 6000):
    // until then nothing is hit; then the mark is what it was hit with.
    h.block(1, &[step(0, 0, 1), keep(0, 0, 7, 8), play()]);
    assert_eq!(mark(&h), (500, 32768));
    h.run(STEP, 128, &[]);
    assert_eq!(mark(&h), (7, 8));
    assert_eq!(caps(&h), (500, 32768), "the cap is the hand's");
    // The hand moves: the cap follows, the mark does not.
    h.block(1, &[param(0, 900)]);
    assert_eq!((caps(&h), mark(&h)), ((900, 32768), (7, 8)));
    // Another sound's hit does not move the chosen sound's mark.
    h.block(1, &[cmd(CMD_FIRE, 4, 0, 0)]);
    assert_eq!(mark(&h), (7, 8));
    // A tap of the chosen sound: its own, the hand's.
    h.block(1, &[down(0), up(0)]);
    assert_eq!(mark(&h), (900, 32768));
    // Choosing sound 5, which was hit by that FIRE with its own (900, 32768), and is fired
    // again by choosing it (§13 ⚠): the mark is that sound's last hit.
    h.block(1, &[param(1, 3), down(SOUND), down(4), up(4), up(SOUND)]);
    assert_eq!(mark(&h), (900, 3));
}

#[test]
fn choosing_a_sound_shows_that_sound_s_last_hit_or_its_own() {
    // Choosing plays the sound (§13 ⚠), so a sound chosen by the keys has always just been
    // hit with its own. A load chooses without a hit: there the mark is the sound's last
    // hit, kept, and a sound never hit shows its own.
    let mut a = fresh();
    a.block(1, &[step(6, 0, 1), keep(6, 0, 111, 222), play()]); // sound 7 hit with (111, 222)
    let mut src = fresh();
    src.block(1, &[down(SOUND), down(6), up(6), up(SOUND), sound(6, 0, 5)]);
    assert_eq!(a.load(&src.save()), OK);
    assert_eq!(a.view()[26], 6, "sound 7 chosen by the load");
    assert_eq!(mark(&a), (111, 222), "its last hit, not its own of the load (5, 32768)");
    assert_eq!(caps(&a), (5, 32768), "the cap is the loaded own");
    let mut b = fresh();
    assert_eq!(b.load(&src.save()), OK);
    assert_eq!(mark(&b), (5, 32768), "never hit: its own");
}

#[test]
fn sound_or_no_sound_the_view_is_the_same() {
    let c: Vec<(u64, Cmd)> = vec![
        (0, param(0, 300)),
        (0, step(0, 0, 1)),
        (0, step(0, 4, 1)),
        (0, keep(0, 4, 4444, 5555)),
        (0, cmd(CMD_FX, 4, 0, 9)),
        (0, play()),
        (100, down(0)),
        (101, up(0)),
    ];
    for end in [STEP, 4 * STEP + 10, 5 * STEP + 3000, 7 * STEP] {
        let mut quiet = fresh();
        quiet.run(end, 128, &c);
        let mut loud = fresh();
        render(&mut loud, end as usize, 128, 1, &c);
        assert_eq!(quiet.view(), loud.view(), "frame {end}");
    }
    let mut h = fresh();
    h.run(4 * STEP + 10, 128, &c);
    assert_eq!(mark(&h), (4444, 5555), "step 4's keep, as the repeat begins");
}

// ---- Snapshot version 4 ----

#[test]
fn version_4_holds_which_steps_keep_and_their_values_after_version_3_s_fields() {
    let mut h = fresh();
    h.block(1, &[keep(0, 0, 0x0102, 0x0304), keep(15, 15, 0xfffe, 0x8001), keep(7, 9, 0, 0), step(3, 3, 1)]);
    let s = h.save();
    assert_eq!(s.len(), 1464);
    assert_eq!(s[4..12], [4, 0, 1, 0, 0xa8, 5, 0, 0], "version 4, kind 1, payload 1448");
    let mut keeps = [0u8; 32];
    keeps[0] = 1; // track 0, step 0
    keeps[2 * 7 + 1] = 1 << 1; // track 7, step 9
    keeps[2 * 15 + 1] = 1 << 7; // track 15, step 15
    assert_eq!(s[404..436], keeps);
    let mut values = [0u8; 1024];
    values[0..4].copy_from_slice(&[0x02, 0x01, 0x04, 0x03]);
    values[1020..1024].copy_from_slice(&[0xfe, 0xff, 0x01, 0x80]);
    assert_eq!(s[436..1460], values, "A then B, a u16 each, zero where nothing is kept");
    assert_eq!(s[1460..1464], crc32(&s[..1460]).to_le_bytes());
    // Loaded into a fresh engine: the same bytes.
    let mut b = Host::new(SR, 9);
    assert_eq!(b.load(&s), OK);
    assert_eq!(b.save(), s);
}

#[test]
fn a_version_4_load_keeps_what_it_says_and_no_value_whose_bit_is_clear() {
    let mut src = fresh();
    src.block(1, &[step(2, 2, 1), step(2, 3, 1), keep(2, 3, 10, 20)]);
    let mut s = src.save();
    // Garbage where step 2 of track 2 keeps nothing (it is on, but this is version 4). Whether
    // the core reads such a value at all cannot be seen: with its bit clear it is never used
    // and never saved (a plant of "it is read" was not a fault, LEARNINGS.md Session 21).
    let at = 436 + 4 * (16 * 2 + 2);
    s[at..at + 4].copy_from_slice(&[9, 9, 9, 9]);
    recrc(&mut s);
    let mut h = fresh();
    h.block(1, &[keep(5, 5, 1, 1)]);
    assert_eq!(h.load(&s), OK);
    assert_eq!(kept(&h, 2, 2), None, "on, but version 4 says it keeps nothing");
    assert_eq!(kept(&h, 2, 3), Some((10, 20)));
    assert_eq!(kept(&h, 5, 5), None, "what was kept before the load is gone");
}

/// Today's snapshot as an older version would have written it: its first bytes, that
/// version's number and payload size, and its own CRC.
fn as_older(s: &[u8; SNAP], version: u8) -> Vec<u8> {
    let size = [0, SNAP_V1, SNAP_V2, SNAP_V3][version as usize];
    let mut b = s[..size].to_vec();
    b[4] = version;
    b[8..12].copy_from_slice(&((size - 16) as u32).to_le_bytes());
    recrc(&mut b); // version 1 has no sliders: they load at their middles
    b
}

#[test]
fn an_older_version_s_load_keeps_for_every_step_that_is_on_its_sound_s_own() {
    let mut src = fresh();
    src.block(1, &[step(0, 0, 1), step(0, 9, 1), step(6, 15, 1), sound(0, 0, 1111), sound(0, 1, 2222), sound(6, 1, 7)]);
    let today = src.save();
    for version in [1u8, 2, 3] {
        let old = as_older(&today, version);
        let mut h = fresh();
        h.block(1, &[keep(4, 4, 1, 1), keep(0, 1, 5, 5)]);
        assert_eq!(h.load(&old), OK, "version {version}");
        let (zero, six) = if version == 1 { ((32768, 32768), (32768, 32768)) } else { ((1111, 2222), (32768, 7)) };
        assert_eq!(kept(&h, 0, 0), Some(zero), "version {version}");
        assert_eq!(kept(&h, 0, 9), Some(zero), "version {version}");
        assert_eq!(kept(&h, 6, 15), Some(six), "version {version}");
        assert_eq!(kept(&h, 0, 1), None, "version {version}: a step that is off keeps nothing");
        assert_eq!(kept(&h, 4, 4), None, "version {version}");
        let keeps = &h.save()[404..436];
        assert_eq!(keeps.iter().map(|b| b.count_ones()).sum::<u32>(), 3, "version {version}: exactly the three steps");
        // So the hand cannot change an old beat: a move of A leaves its steps as they were.
        h.block(1, &[param(0, 60_000)]);
        assert_eq!(kept(&h, 0, 0), Some(zero), "version {version}");
    }
}

// ---- Two positions, two pitches ----

#[test]
fn two_steps_of_one_sound_written_at_two_slider_positions_sound_at_two_pitches() {
    // As a player: write on, A low, key 1; A high, key 9; play. The click's pitch is A.
    let c = vec![
        (0, down(SOUND)),
        (0, down(CLICK)),
        (0, up(CLICK)),
        (0, up(SOUND)),
        (0, down(WRITE)),
        (0, up(WRITE)),
        (0, param(0, 2000)),
        (0, down(0)),
        (0, up(0)),
        (0, param(0, 63_000)),
        (0, down(8)),
        (0, up(8)),
        (0, param(0, 30_000)), // and the hand somewhere else again
        (10, play()),
    ];
    let mut h = fresh();
    let (out, trigs) = render(&mut h, (16 * STEP + 10) as usize, 128, 1, &c);
    let hits: Vec<u64> = trigs.iter().copied().filter(|f| *f >= 10).collect();
    assert_eq!(hits.len(), 2, "the choosing tap at 0, then steps 1 and 9: {trigs:?}");
    let window = |at: u64| &out[at as usize..at as usize + 1000];
    let (low, high) = (crossings(window(hits[0])), crossings(window(hits[1])));
    assert!(high > 2 * low, "two pitches: {low} and {high} crossings in 1000 frames");
}

// ---- The generation ----

#[test]
fn the_generation_moves_exactly_when_the_snapshot_does_over_20_000_edits_and_keys() {
    let mut h = fresh();
    let mut x = 0x0bad_5eedu32;
    let mut rnd = move |n: u32| {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        x % n
    };
    h.block(1, &[down(WRITE), up(WRITE)]);
    let (mut moved, mut still) = (0, 0);
    for i in 0..20_000 {
        let small = |r: u32| r as u8 & 3; // few tracks and steps, so they meet often
        let c = match rnd(9) {
            0 => keep(small(rnd(4)), small(rnd(4)), rnd(3) as u16, rnd(3) as u16),
            1 => step(small(rnd(4)), small(rnd(4)), rnd(2)),
            2 => sound(small(rnd(4)), rnd(2) as u8, rnd(3) * 30_000),
            3 => param(rnd(2) as u8, rnd(3) * 30_000),
            4..=5 => down(small(rnd(4))),
            6 => up(small(rnd(4))),
            7 => [down(SOUND), up(SOUND), down(WRITE), up(WRITE), down(FUNCTION), up(FUNCTION)][rnd(6) as usize],
            _ => [down(PATTERN), up(PATTERN)][rnd(2) as usize],
        };
        let (snap, g) = (h.save(), h.generation());
        h.block(1, &[c]);
        let changed = h.save() != snap;
        assert_eq!(h.generation() != g, changed, "command {i}: type {} a {} b {} value {}", c.kind, c.a, c.b, c.value);
        if changed { moved += 1 } else { still += 1 }
    }
    assert!(moved > 2000 && still > 2000, "the sequence tried both: {moved} moved, {still} did not");
}
