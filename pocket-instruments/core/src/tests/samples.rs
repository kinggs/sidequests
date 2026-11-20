//! D50: a track's sample in place of its code voice. The rules a sample obeys on one
//! machine; `harness/render-samples.json` holds it to the same bytes natively and in
//! WebAssembly.

use super::sound::render;
use super::*;
use crate::voice::{LEVEL, SAMPLE_RATE};

const CYMBAL: u8 = 6; // slider B holds it 200 to 1200 ms: longer than any data below
const KICK: u8 = 0; // 100 to 600 ms

fn give(h: &Host, track: u8, data: &[i16]) -> u32 {
    unsafe { pi_set_sample(h.e, track as u32, data.as_ptr(), data.len() as u32) }
}

/// One hit of `track` on frame 0 with sliders `a` and `b`, switched to its sample.
fn hit(h: &mut Host, track: u8, a: u32, b: u32, frames: usize) -> Vec<f32> {
    let cmds = [
        (0, cmd(CMD_VOICE, track, 0, 1)),
        (0, cmd(CMD_SOUND, track, 0, a)),
        (0, cmd(CMD_SOUND, track, 1, b)),
        (0, cmd(CMD_FIRE, track, 0, 0)),
    ];
    render(h, frames, 128, 1, &cmds).0
}

fn last_sound(out: &[f32]) -> usize {
    out.iter().rposition(|&s| s != 0.0).map_or(0, |i| i + 1)
}

fn bits(v: &[f32]) -> Vec<u32> {
    v.iter().map(|s| s.to_bits()).collect()
}

#[test]
fn at_its_own_rate_and_slider_a_s_middle_a_sample_is_its_data_frame_for_frame() {
    let data: Vec<i16> = (0..1000).map(|i| ((i * 37) % 2001 - 1000) as i16 * 32).collect();
    let mut h = Host::new(SAMPLE_RATE, 1);
    assert_eq!(give(&h, CYMBAL, &data), 1);
    let out = hit(&mut h, CYMBAL, 32768, 65535, 3000);
    for (f, &d) in data.iter().enumerate() {
        assert_eq!(out[f].to_bits(), (d as f32 / 32768.0 * LEVEL).to_bits(), "frame {f}");
    }
    assert!(out[1000..].iter().all(|&s| s == 0.0), "silent, exactly, once the data ends");
}

#[test]
fn slider_a_moves_it_by_semitones_an_octave_either_way() {
    // A tenth of a second of steady level, at 48 kHz: 4 800 frames as recorded.
    let data = vec![16384i16; SAMPLE_RATE as usize / 10];
    let length = |a: u32| {
        let mut h = Host::new(48000, 1);
        give(&h, CYMBAL, &data);
        last_sound(&hit(&mut h, CYMBAL, a, 65535, 20000))
    };
    let (down, middle, up) = (length(0), length(32768), length(65535));
    assert!((4799..=4801).contains(&middle), "{middle} frames at the middle");
    assert!((9598..=9602).contains(&down), "an octave down plays twice as long: {down}");
    assert!((2399..=2401).contains(&up), "an octave up plays half as long: {up}");
    // One semitone up: 2^(1/12) faster. Slider A's 25 steps span 0 to 65535.
    let semi = length(32768 + 65535 / 24 + 1);
    let want = 4800.0 / 2f64.powf(1.0 / 12.0);
    assert!((semi as f64 - want).abs() <= 2.0, "{semi} frames a semitone up, {want:.0} expected");
}

#[test]
fn slider_b_plays_it_whole_from_the_middle_up_and_shorter_below() {
    let data = vec![16384i16; SAMPLE_RATE as usize]; // a whole second
    let at = |b: u32| {
        let mut h = Host::new(48000, 1);
        give(&h, KICK, &data);
        let out = hit(&mut h, KICK, 32768, b, 60000);
        (last_sound(&out), out)
    };
    let ((short, s), (quarter, _), (middle, _), (top, _)) = (at(0), at(16384), at(32768), at(65535));
    // At 0, the kick's shortest code length, 100 ms, then 60 dB in 10 ms; the cut at -80 dB
    // is a third later.
    assert!((4800 + 600..=4800 + 700).contains(&short), "{short} frames at B 0 %");
    assert!(s[..4800].iter().all(|&v| v == 0.5 * LEVEL), "untouched until the fade");
    // A quarter: halfway from 100 ms to the whole second, 550 ms, then the fade.
    assert!((26400 + 600..=26400 + 700).contains(&quarter), "{quarter} frames at B 25 %");
    // A second is 48 000 frames; the step through the data is rounded down, so the last
    // stored frame can be read one output frame later.
    assert!((48000..=48001).contains(&middle), "the whole sample at the middle: {middle}");
    assert_eq!(top, middle, "and above it");
}

#[test]
fn a_track_switched_to_a_sample_it_does_not_have_plays_its_code_voice() {
    for t in 0..16u8 {
        let mut plain = Host::new(48000, 1);
        let want = render(&mut plain, 30000, 128, 1, &[(0, cmd(CMD_FIRE, t, 0, 0))]).0;
        let mut switched = Host::new(48000, 1);
        let got = hit(&mut switched, t, 32768, 32768, 30000);
        assert_eq!(bits(&got), bits(&want), "track {t}");
    }
}

#[test]
fn samples_given_but_not_chosen_leave_every_code_voice_s_bits_alone() {
    let data = vec![12345i16; 4410];
    let fire: Vec<(u64, Cmd)> = (0..16).map(|t| (0, cmd(CMD_FIRE, t, 0, 0))).collect();
    let mut plain = Host::new(48000, 1);
    let want = render(&mut plain, 48000, 128, 16, &fire).0;
    let mut given = Host::new(48000, 1);
    for t in 0..16 {
        give(&given, t, &data);
    }
    let got = render(&mut given, 48000, 128, 16, &fire).0;
    assert_eq!(bits(&got), bits(&want));
}

#[test]
fn the_switch_is_taken_at_the_next_hit_and_a_tail_plays_out() {
    let data = vec![16384i16; SAMPLE_RATE as usize / 2];
    let mut h = Host::new(48000, 1);
    give(&h, CYMBAL, &data);
    let first = hit(&mut h, CYMBAL, 32768, 65535, 4800); // the sample, 100 ms in
    assert!(first.iter().all(|&s| s == 0.5 * LEVEL));
    // Back to code and hit again: the sample's last 400 ms rings under the code voice.
    let cmds = [(0, cmd(CMD_VOICE, CYMBAL, 0, 0)), (0, cmd(CMD_FIRE, CYMBAL, 0, 0))];
    let both = render(&mut h, 4800, 128, 16, &cmds).0;
    let mut code_only = Host::new(48000, 1);
    let code = render(&mut code_only, 4800, 128, 16, &[(0, cmd(CMD_SOUND, CYMBAL, 1, 65535)), (0, cmd(CMD_FIRE, CYMBAL, 0, 0))]).0;
    for f in 0..4800 {
        let (got, want) = (both[f * 16 + CYMBAL as usize], code[f * 16 + CYMBAL as usize]);
        assert_eq!(got.to_bits(), (want + 0.5 * LEVEL).to_bits(), "frame {f}: the code voice plus the tail");
    }
}

#[test]
fn a_sample_sounding_across_a_rate_change_keeps_its_pitch_and_length_in_seconds() {
    let data = vec![16384i16; SAMPLE_RATE as usize / 5]; // 200 ms
    let mut h = Host::new(48000, 1);
    give(&h, CYMBAL, &data);
    let first = hit(&mut h, CYMBAL, 32768, 65535, 960); // 20 ms
    assert!(first.iter().all(|&s| s != 0.0));
    unsafe { pi_set_sample_rate(h.e, 96000) };
    let rest = render(&mut h, 96000, 128, 1, &[]).0;
    let whole = 0.02 + last_sound(&rest) as f64 / 96000.0;
    assert!((whole - 0.2).abs() < 0.0002, "{whole} s across the change, 0.2 s recorded");
}

#[test]
fn the_switch_and_the_samples_are_not_in_the_snapshot() {
    let data = vec![1i16; 100];
    let mut h = Host::new(48000, 1);
    let (g, saved) = (h.generation(), h.save());
    give(&h, 3, &data);
    h.block(1, &[cmd(CMD_VOICE, 3, 0, 1)]);
    assert_eq!(h.generation(), g, "not in snapshot version 1, like the sliders (D44)");
    assert_eq!(h.save(), saved);
}

#[test]
fn bad_samples_are_refused_and_clearing_one_stops_it() {
    let data = vec![16384i16; 4410];
    let mut h = Host::new(48000, 1);
    unsafe {
        assert_eq!(pi_set_sample(h.e, 16, data.as_ptr(), 4410), 0, "no track 16");
        assert_eq!(pi_set_sample(h.e, 0, data.as_ptr().cast::<u8>().add(1).cast(), 4400), 0, "misaligned");
        assert_eq!(pi_set_sample(h.e, 0, data.as_ptr(), 0), 0, "empty");
        assert_eq!(pi_set_sample(core::ptr::null_mut(), 0, data.as_ptr(), 4410), 0, "no engine");
    }
    give(&h, KICK, &data);
    let sounding = hit(&mut h, KICK, 32768, 65535, 100);
    assert!(sounding.iter().all(|&s| s != 0.0));
    unsafe { pi_set_sample(h.e, KICK as u32, core::ptr::null(), 0) };
    // Cleared mid-sound: silent from the next frame, and the track's next hit is code.
    let after = render(&mut h, 100, 128, 1, &[]).0;
    assert!(after.iter().all(|&s| s == 0.0));
    let mut plain = Host::new(48000, 1);
    // The same sliders as the hit above: B at 100 %.
    let want = render(&mut plain, 9000, 128, 1, &[(0, cmd(CMD_SOUND, KICK, 1, 65535)), (0, cmd(CMD_FIRE, KICK, 0, 0))]).0;
    let got = render(&mut h, 9000, 128, 1, &[(0, cmd(CMD_FIRE, KICK, 0, 0))]).0;
    assert_eq!(bits(&got), bits(&want));
}

#[test]
fn the_starter_pack_is_sixteen_samples_each_at_full_scale() {
    // samples/make-raw.py's contract: raw/<name>.s16, mono, its loudest point 32767.
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../samples/raw");
    let mut n = 0;
    for entry in std::fs::read_dir(&dir).unwrap() {
        let bytes = std::fs::read(entry.unwrap().path()).unwrap();
        assert_eq!(bytes.len() % 2, 0);
        let peak = bytes.chunks(2).map(|b| i16::from_le_bytes([b[0], b[1]]).unsigned_abs()).max().unwrap();
        assert!(peak == 32767 || peak == 32768, "peak {peak}");
        n += 1;
    }
    assert_eq!(n, 16);
}

#[test]
fn a_sample_replaced_while_it_sounds_stops_and_the_new_one_waits_for_a_hit() {
    // The host may free the old data once pi_set_sample returns, so nothing may read on from
    // it, and the new data must not start part-way through.
    let (old, new) = (vec![16384i16; 44100], vec![-8192i16; 44100]);
    let mut h = Host::new(48000, 1);
    give(&h, CYMBAL, &old);
    assert!(hit(&mut h, CYMBAL, 32768, 65535, 480).iter().all(|&s| s == 0.5 * LEVEL));
    give(&h, CYMBAL, &new);
    assert!(render(&mut h, 4800, 128, 1, &[]).0.iter().all(|&s| s == 0.0), "silent until the next hit");
    let again = render(&mut h, 480, 128, 1, &[(0, cmd(CMD_FIRE, CYMBAL, 0, 0))]).0;
    assert!(again.iter().all(|&s| s == -0.25 * LEVEL), "then the new data from its start");
}
