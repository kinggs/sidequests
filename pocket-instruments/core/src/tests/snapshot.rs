//! §15: snapshot version 2 (D55). What it holds beyond version 1, that version 1 still loads,
//! and that the generation follows what a snapshot holds. The fixtures' own version 1 and 2
//! snapshots (`fixtures/snapshots-v1.txt`, `-v2.txt`) are loaded in `fixtures.rs`, against
//! their traces. Version 3 (§17) has its own tests in `fx.rs`; since it is what the core
//! writes, the ones here read version 2's fields at the same places in it.

use super::sound::render;
use super::*;
use crate::crc::crc32;

const SR: u32 = 48_000;
const BPM: u8 = 18;
const SOUND: u8 = 16;

fn down(key: u8) -> Cmd {
    cmd(CMD_KEY_DOWN, key, 0, 0)
}
fn up(key: u8) -> Cmd {
    cmd(CMD_KEY_UP, key, 0, 0)
}

/// Everything version 2 adds, away from its starting value: sliders on three tracks, two
/// tracks on samples, volume 5, key 8 chosen. Stopped, and nothing ever rendered, so no
/// voice is sounding.
fn dressed(seed: u32) -> Host {
    let mut h = Host::new(SR, seed);
    h.block(
        1,
        &[
            cmd(CMD_STEP, 2, 3, 1),
            cmd(CMD_SWING, 0, 0, 11),
            cmd(CMD_SOUND, 0, 0, 1),
            cmd(CMD_SOUND, 0, 1, 65535),
            cmd(CMD_SOUND, 7, 1, 4660),
            cmd(CMD_SOUND, 15, 0, 0),
            cmd(CMD_VOICE, 3, 0, 1),
            cmd(CMD_VOICE, 15, 0, 1),
            down(BPM),
            down(4),
            up(4),
            up(BPM),
            down(SOUND),
            down(7),
            up(7),
            up(SOUND),
        ],
    );
    h
}

/// Puts a snapshot's CRC right after a byte was changed on purpose.
fn recrc(s: &mut [u8]) {
    let n = s.len() - 4;
    let crc = crc32(&s[..n]);
    s[n..].copy_from_slice(&crc.to_le_bytes());
}

/// The version 1 snapshot an ABI 4 core would have written for the same pattern: version 2's
/// first 312 bytes, called version 1, with version 1's payload size and its own CRC.
fn as_v1(v2: &[u8; SNAP]) -> [u8; SNAP_V1] {
    let mut s = [0u8; SNAP_V1];
    s[..312].copy_from_slice(&v2[..312]);
    s[4..6].copy_from_slice(&1u16.to_le_bytes());
    s[8..12].copy_from_slice(&300u32.to_le_bytes());
    recrc(&mut s);
    s
}

#[test]
fn version_2_holds_the_sliders_the_switches_the_volume_and_the_chosen_sound() {
    let s = dressed(1).save();
    assert_eq!(s[4..12], [4, 0, 1, 0, 0xa8, 5, 0, 0], "version 4 (since §20), kind 1, payload 1448");
    let mut sliders = [0u8; 64];
    for t in 0..16 {
        sliders[4 * t..4 * t + 4].copy_from_slice(&[0x00, 0x80, 0x00, 0x80]); // 32768, 32768
    }
    sliders[0..4].copy_from_slice(&[1, 0, 0xff, 0xff]);
    sliders[4 * 7 + 2..4 * 7 + 4].copy_from_slice(&4660u16.to_le_bytes());
    sliders[4 * 15..4 * 15 + 2].copy_from_slice(&[0, 0]);
    assert_eq!(s[312..376], sliders);
    assert_eq!(s[376..378], ((1u16 << 3) | (1 << 15)).to_le_bytes());
    assert_eq!((s[378], s[379]), (5, 7), "volume 5, key 8 chosen");
    assert_eq!(s[380..384], [0, 0, 0, 0], "the hat cut, then zero");
    assert_eq!(s[1460..1464], crc32(&s[..1460]).to_le_bytes());
    // And at pi_init: the middles, all code, volume 16, key 1.
    let s = Host::new(SR, 1).save();
    assert!(s[312..376].chunks(2).all(|v| v == [0x00, 0x80]));
    assert_eq!(s[376..384], [0, 0, 16, 0, 0, 0, 0, 0]);
}

#[test]
fn save_then_load_into_a_fresh_engine_gives_the_same_view_and_the_same_sound() {
    let pack: Vec<Vec<i16>> = (0..16i64).map(|t| (0..3000i64).map(|i| ((i * (t + 3)) % 4000 - 2000) as i16 * 8).collect()).collect();
    let give = |h: &Host| {
        for (t, d) in pack.iter().enumerate() {
            assert_eq!(unsafe { pi_set_sample(h.e, t as u32, d.as_ptr(), d.len() as u32) }, 1);
        }
    };
    let mut a = dressed(1);
    give(&a);
    let snap = a.save();
    let mut b = Host::new(SR, 999);
    give(&b);
    assert_eq!(b.load(&snap), OK);
    assert_eq!(b.save(), snap, "it saves what it loaded");
    // The tick and the firing counts belong to the engine's past, not to the snapshot (§14):
    // choosing key 8 fired it once in `a`. Everything between is the same.
    assert_eq!(a.view()[4..32], b.view()[4..32]);

    // Every track on two steps, playing; both layouts at once, the tracks and the mix.
    let mut cmds: Vec<(u64, Cmd)> = (0..16u8).flat_map(|t| [(0, cmd(CMD_STEP, t, t % 4, 1)), (0, cmd(CMD_STEP, t, 8 + t % 5, 1))]).collect();
    cmds.extend([(0, cmd(CMD_RESET, 0, 0, 0)), (0, cmd(CMD_PLAY, 0, 0, 1))]);
    let (x, tx) = render(&mut a, 2 * 16 * 6000, 128, 17, &cmds);
    let (y, ty) = render(&mut b, 2 * 16 * 6000, 128, 17, &cmds);
    assert_eq!(tx, ty);
    assert!(x.iter().zip(&y).all(|(p, q)| p.to_bits() == q.to_bits()), "the same samples");
    // The loaded settings are heard: volume 5 is not the mix at 16.
    let mut plain = Host::new(SR, 999);
    give(&plain);
    let (z, _) = render(&mut plain, 2 * 16 * 6000, 128, 17, &cmds);
    assert!(x.chunks(17).zip(z.chunks(17)).any(|(p, q)| p[16] != q[16]));
}

#[test]
fn a_version_1_snapshot_loads_with_pi_init_s_values_in_every_new_field() {
    let v1 = as_v1(&dressed(1).save());
    let mut h = dressed(5); // every new field away from its starting value
    let g = h.generation();
    assert_eq!(h.load(&v1), OK);
    assert_ne!(h.generation(), g);
    let s = h.save();
    assert_eq!(s[12..312], v1[12..312], "the pattern, tempo, seed, length and swing it holds");
    assert_eq!(s[..384], {
        let mut want = Host::new(SR, 1);
        assert_eq!(want.load(&v1), OK);
        want.save()
    }[..384], "the same as into a fresh engine");
    assert!(s[312..376].chunks(2).all(|v| v == [0x00, 0x80]), "sliders at their middles");
    assert_eq!(s[376..380], [0, 0, 16, 0], "every key on code, volume 16, key 1 chosen");
    // Longer than version 1 is the host's business: still only the first 316 bytes are read.
    let mut long = v1.to_vec();
    long.extend([0xEE; 72]);
    assert_eq!(h.load(&long), OK);
    assert_eq!(h.save(), s);
}

#[test]
fn every_corrupted_byte_of_a_version_1_snapshot_is_refused_and_changes_nothing() {
    let v1 = as_v1(&dressed(1).save());
    let mut h = dressed(5);
    let (before, g) = (h.save(), h.generation());
    for i in 0..SNAP_V1 {
        for bit in [0x01u8, 0x80] {
            let mut bad = v1;
            bad[i] ^= bit;
            let want = match i {
                0..4 | 6..8 => ERR_MAGIC,
                4..6 => ERR_VERSION,
                8..12 => ERR_SIZE,
                _ => ERR_CRC,
            };
            assert_eq!(h.load(&bad), want, "byte {i} bit {bit:#x}");
        }
    }
    for len in [0, 11, 12, 315] {
        assert_eq!(h.load(&v1[..len]), ERR_SIZE, "length {len}");
    }
    assert_eq!((h.save(), h.generation()), (before, g));
}

#[test]
fn a_version_4_is_refused_short_and_a_version_5_or_0_is_refused_however_good() {
    // (Until Session 16 this held version 2 and refused 3; until Session 21, version 3 and 4.)
    let s = dressed(1).save();
    let mut h = Host::new(SR, 1);
    let before = h.save();
    // Cut to an older version's size, with every byte there right: version 4 is longer.
    assert_eq!(h.load(&s[..SNAP_V1]), ERR_SIZE);
    assert_eq!(h.load(&s[..SNAP_V2]), ERR_SIZE);
    assert_eq!(h.load(&s[..SNAP_V3]), ERR_SIZE);
    assert_eq!(h.load(&s[..SNAP - 1]), ERR_SIZE);
    // A version 4 that says it is version 1, 2 or 3 is read as that version, and its payload
    // size is wrong for it.
    for older in [1u8, 2, 3] {
        let mut lied = s;
        lied[4] = older;
        assert_eq!(h.load(&lied), ERR_SIZE, "the payload size is version 4's, not {older}'s");
    }
    for version in [0u16, 5, 0xffff] {
        let mut t = s;
        t[4..6].copy_from_slice(&version.to_le_bytes());
        recrc(&mut t);
        assert_eq!(h.load(&t), ERR_VERSION, "version {version}");
    }
    assert_eq!(h.save(), before);
}

#[test]
fn values_no_core_writes_in_the_new_fields_are_clamped_on_load() {
    let base = dressed(1).save();
    for (volume, sel, want) in [(0u8, 16u8, (1u8, 15u8)), (17, 255, (16, 15)), (255, 15, (16, 15)), (1, 0, (1, 0)), (16, 9, (16, 9))] {
        let mut s = base;
        s[378] = volume;
        s[379] = sel;
        s[380] = 9; // a hat cut nobody writes yet
        s[381..384].copy_from_slice(&[1, 2, 3]); // zero in every snapshot written
        recrc(&mut s);
        let mut h = Host::new(SR, 1);
        assert_eq!(h.load(&s), OK, "volume {volume} sel {sel}");
        let t = h.save();
        assert_eq!((t[378], t[379]), want, "volume {volume} sel {sel}");
        assert_eq!(t[380..384], [0, 0, 0, 0], "the hat cut loads as 0, the rest is not read");
        // The view agrees, and its volume row did not overflow (§14: (1 << volume) - 1).
        h.block(1, &[down(BPM)]);
        let v = h.view();
        assert_eq!((v[27], v[26]), want);
        assert_eq!(u16::from_le_bytes([v[12], v[13]]) as u32, (1u32 << want.0) - 1);
    }
    // Every slider value and every switch is one a core can write, so they load as they are.
    let mut s = base;
    s[312..376].fill(0xff);
    s[376..378].fill(0xff);
    recrc(&mut s);
    let mut h = Host::new(SR, 1);
    assert_eq!(h.load(&s), OK);
    assert_eq!(h.save()[312..378], s[312..378]);
}

#[test]
fn the_generation_moves_on_each_new_saved_thing_and_only_when_its_value_changes() {
    let mut h = Host::new(SR, 1);
    // Each line: what to send, and whether the value it sets is new.
    let lines: Vec<(Vec<Cmd>, bool, &str)> = vec![
        (vec![cmd(CMD_SOUND, 4, 0, 100)], true, "a slider"),
        (vec![cmd(CMD_SOUND, 4, 0, 100)], false, "the same slider value"),
        (vec![cmd(CMD_SOUND, 4, 1, 32768)], false, "slider B at its middle already"),
        (vec![cmd(CMD_SOUND, 4, 1, 1 << 20)], true, "slider B, clamped to 65535"),
        (vec![cmd(CMD_SOUND, 4, 1, 65535)], false, "65535 again"),
        (vec![cmd(CMD_VOICE, 9, 0, 1)], true, "a switch to the sample"),
        (vec![cmd(CMD_VOICE, 9, 0, 7)], false, "the sample again"),
        (vec![cmd(CMD_VOICE, 9, 0, 0)], true, "back to code"),
        (vec![cmd(CMD_VOICE, 10, 0, 0)], false, "code, already"),
        (vec![down(BPM), down(2), up(2)], true, "the volume"),
        (vec![down(2), up(2)], false, "the same volume"),
        (vec![up(BPM)], false, "letting bpm go after using it"),
        (vec![down(SOUND), down(6), up(6)], true, "the chosen sound"),
        (vec![down(6), up(6)], false, "the same sound again"),
        (vec![up(SOUND)], false, "letting sound go"),
        // Since §20 a PARAM is a SOUND on each of the sixteen: it moves the generation once
        // for each sound whose value changes. Sound 4's A is 100 here, the rest 32768.
        (vec![cmd(CMD_PARAM, 0, 0, 500)], true, "a slider by PARAM, on every sound"),
        (vec![cmd(CMD_PARAM, 0, 0, 500)], false, "the value it shows"),
    ];
    for (cmds, moves, what) in lines {
        let (snap, g) = (h.save(), h.generation());
        h.block(1, &cmds);
        let by = if what.contains("on every sound") { 16 } else { 1 };
        assert_eq!(h.generation().wrapping_sub(g), if moves { by } else { 0 }, "{what}");
        assert_eq!(h.save() != snap, moves, "{what}: the snapshot's bytes change exactly then");
    }
}
