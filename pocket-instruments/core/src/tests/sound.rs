//! §11: sound. What a render must be, whatever the host. P7's bar itself (native against
//! WebAssembly) is `make render`; these are the rules a render obeys on one machine.

use super::*;
use crate::voice::LEVEL;

const CLICK: u8 = 9;

/// Runs `frames` frames in blocks of `block` with sound, commands at absolute frames.
/// Returns the samples and the frame of every TRIG.
fn render(h: &mut Host, frames: usize, block: usize, channels: usize, cmds: &[(u64, Cmd)]) -> (Vec<f32>, Vec<u64>) {
    let mut out = vec![f32::NAN; frames * channels];
    let mut trigs = Vec::new();
    let (mut start, mut next) = (0usize, 0usize);
    while start < frames {
        let n = block.min(frames - start);
        let mut these = Vec::new();
        while next < cmds.len() && cmds[next].0 < (start + n) as u64 {
            these.push(Cmd { frame: (cmds[next].0 as usize - start) as u32, ..cmds[next].1 });
            next += 1;
        }
        let mut ev = [Event::default(); CAP];
        let got = unsafe {
            pi_process(
                h.e,
                n as u32,
                these.as_ptr(),
                these.len() as u32,
                ev.as_mut_ptr(),
                CAP as u32,
                out[start * channels..].as_mut_ptr(),
                channels as u32,
            )
        };
        for e in &ev[..got as usize] {
            if e.kind == EV_TRIG {
                trigs.push(start as u64 + e.frame as u64);
            }
        }
        start += n;
    }
    (out, trigs)
}

/// The click on steps 0, 4, 8 and 12 at 120 bpm, playing from frame 0.
fn four_clicks() -> Vec<(u64, Cmd)> {
    let mut c: Vec<(u64, Cmd)> = [0, 4, 8, 12].iter().map(|&s| (0, cmd(CMD_STEP, CLICK, s, 1))).collect();
    c.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    c
}

#[test]
fn silent_until_a_trigger_and_it_starts_on_the_trigger_s_frame() {
    let mut h = Host::new(48000, 1);
    // The first click is swung off frame 0 by putting it on step 1 with swing.
    let cmds = vec![(0, cmd(CMD_STEP, CLICK, 1, 1)), (0, cmd(CMD_SWING, 0, 0, 24)), (0, cmd(CMD_PLAY, 0, 0, 1))];
    let (out, trigs) = render(&mut h, 12000, 128, 1, &cmds);
    let at = trigs[0] as usize;
    assert_eq!(at, 6000 + 1500, "step 1 at 120 bpm and 48 kHz, a quarter of a step late");
    assert!(out[..=at].iter().all(|&s| s == 0.0), "nothing before, and a sine starts from zero");
    assert!(out[at + 1] != 0.0, "the voice is sounding one frame after its trigger");
    assert!(out.iter().all(|s| s.is_finite()));
}

#[test]
fn a_click_is_loud_then_decays_to_exactly_nothing() {
    let mut h = Host::new(48000, 1);
    let (out, _) = render(&mut h, 20000, 128, 1, &four_clicks());
    let peak = out[..2000].iter().fold(0f32, |m, s| m.max(s.abs())) / LEVEL;
    assert!(peak > 0.5 && peak <= 1.0, "peak {peak}, before the core's level");
    // Default length: 22.5 ms to fall 60 dB, 30 ms to the -80 dB cut. Well before 40 ms.
    assert!(out[1920..24000 / 4].iter().all(|&s| s == 0.0), "silent, not merely quiet, after 40 ms");
}

#[test]
fn the_block_size_does_not_change_a_sample() {
    let cmds = four_clicks();
    let (want, _) = render(&mut Host::new(44100, 1), 30000, 1, 1, &cmds);
    for block in [128, 512, 4096] {
        let (got, _) = render(&mut Host::new(44100, 1), 30000, block, 1, &cmds);
        assert!(got.iter().zip(&want).all(|(a, b)| a.to_bits() == b.to_bits()), "block {block}");
    }
}

#[test]
fn sixteen_channels_carry_the_click_on_its_own_track_and_the_mix_is_the_same() {
    let cmds = four_clicks();
    let (mix, _) = render(&mut Host::new(48000, 1), 9000, 128, 1, &cmds);
    let (tracks, _) = render(&mut Host::new(48000, 1), 9000, 128, 16, &cmds);
    for f in 0..9000 {
        for t in 0..16 {
            let want = if t == CLICK as usize { mix[f] } else { 0.0 };
            assert_eq!(tracks[f * 16 + t].to_bits(), want.to_bits(), "frame {f} track {t}");
        }
    }
}

#[test]
fn the_sliders_change_pitch_and_length() {
    let crossings = |out: &[f32]| out.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
    let sounding = |out: &[f32]| out.iter().rposition(|&s| s != 0.0).unwrap();
    let with = |a: u32, b: u32| {
        let mut cmds = vec![(0, cmd(CMD_SOUND, CLICK, 0, a)), (0, cmd(CMD_SOUND, CLICK, 1, b))];
        cmds.extend(four_clicks());
        render(&mut Host::new(48000, 1), 5000, 128, 1, &cmds).0
    };
    let (low, high) = (with(0, 65535), with(65535, 65535));
    // 500 Hz and 2 kHz over the same 53 ms: four times the cycles, give or take the ends.
    let (lo, hi) = (crossings(&low), crossings(&high));
    assert!((25..=27).contains(&lo) && (104..=107).contains(&hi), "{lo} and {hi} cycles");
    let (short, long) = (sounding(&with(32768, 0)), sounding(&with(32768, 65535)));
    // 5 ms and 40 ms to -60 dB; the cut is at -80 dB, a third later: 320 and 2560 frames.
    assert!((300..=340).contains(&short) && (2500..=2620).contains(&long), "{short} and {long} frames");
    // Out of range is clamped or ignored, as for every other command.
    let _ = with(1 << 30, 1 << 30);
    let mut h = Host::new(48000, 1);
    h.block(1, &[cmd(CMD_SOUND, 16, 0, 1), cmd(CMD_SOUND, 0, 2, 1)]);
}

#[test]
fn sound_changes_no_event_and_no_snapshot() {
    let cmds = four_clicks();
    let mut quiet = Host::new(48000, 1);
    let want = trace(&quiet.run(50000, 128, &cmds));
    let mut loud = Host::new(48000, 1);
    let (_, trigs) = render(&mut loud, 50000, 128, 1, &cmds);
    assert_eq!(trigs.len(), want.lines().filter(|l| l.contains("trig")).count());
    let g = loud.generation();
    loud.block(1, &[cmd(CMD_SOUND, CLICK, 0, 1000)]);
    assert_eq!(loud.generation(), g, "a slider is not in snapshot version 1");
    assert_eq!(loud.save(), quiet.save());
}

#[test]
fn a_layout_this_core_does_not_know_is_no_sound_and_writes_nothing() {
    let h = Host::new(48000, 1);
    let mut out = [7.0f32; 64];
    let c = four_clicks().into_iter().map(|c| c.1).collect::<Vec<_>>();
    for channels in [0u32, 2, 17, u32::MAX] {
        unsafe { pi_process(h.e, 4, c.as_ptr(), c.len() as u32, core::ptr::null_mut(), 0, out.as_mut_ptr(), channels) };
        assert!(out.iter().all(|&s| s == 7.0), "channels {channels}");
    }
    assert!(h.dropped() > 0, "the events had nowhere to go, and that is still counted");
}

#[test]
fn a_full_event_buffer_does_not_silence_a_voice() {
    let h = Host::new(48000, 1);
    let c = four_clicks().into_iter().map(|c| c.1).collect::<Vec<_>>();
    let mut out = [0f32; 256];
    unsafe { pi_process(h.e, 256, c.as_ptr(), c.len() as u32, core::ptr::null_mut(), 0, out.as_mut_ptr(), 1) };
    assert!(out.iter().any(|&s| s != 0.0));
}

#[test]
fn fire_sounds_a_track_on_its_frame_stopped_or_playing_and_changes_nothing_else() {
    let mut h = Host::new(48000, 1);
    let before = h.save();
    let (out, trigs) = render(&mut h, 4000, 128, 1, &[(1000, cmd(CMD_FIRE, CLICK, 0, 0)), (1001, cmd(CMD_FIRE, 16, 0, 0))]);
    assert_eq!(trigs, [1000], "stopped: one TRIG, on the frame of the command; track 16 is ignored");
    assert!(out[..=1000].iter().all(|&s| s == 0.0) && out[1001] != 0.0);
    assert_eq!(h.save(), before, "the pattern is untouched");

    // Playing: the fired TRIG sits among the pattern's own, and those are not disturbed.
    let mut cmds = four_clicks();
    let mut quiet = Host::new(48000, 1);
    let want = trace(&quiet.run(30000, 128, &cmds));
    cmds.push((9000, cmd(CMD_FIRE, 3, 0, 0)));
    let mut tapped = Host::new(48000, 1);
    let got = trace(&tapped.run(30000, 128, &cmds));
    let extra: Vec<&str> = got.lines().filter(|l| !want.lines().any(|w| w == *l)).collect();
    // Tick 144 falls on frame 9000, and I first expected 144 here. But a command lands before
    // its frame's ticks (§3), so the latest tick when the tap lands is 143. The core was right.
    assert_eq!(extra, ["143 trig 3 1"], "9000 frames in, the latest tick is 143, on pattern step 1");
    assert_eq!(got.lines().filter(|l| *l != "143 trig 3 1").collect::<Vec<_>>(), want.lines().collect::<Vec<_>>());
}

// ---- the beat: bass drum, snare, closed hat, open hat (VOICES.md keys 1 to 4) ----

const KICK: u8 = 0;
const SNARE: u8 = 1;
const CLOSED: u8 = 2;
const OPEN: u8 = 3;
const DRUMS: [u8; 4] = [KICK, SNARE, CLOSED, OPEN];

/// One hit of `track` on frame 0 with its sliders at `a` and `b`, stopped, as a tap would.
fn hit(track: u8, a: u32, b: u32, rate: u32, frames: usize) -> Vec<f32> {
    let cmds = [(0, cmd(CMD_SOUND, track, 0, a)), (0, cmd(CMD_SOUND, track, 1, b)), (0, cmd(CMD_FIRE, track, 0, 0))];
    render(&mut Host::new(rate, 1), frames, 128, 1, &cmds).0
}

/// The last frame that is not exactly zero.
fn last_sound(out: &[f32]) -> usize {
    out.iter().rposition(|&s| s != 0.0).unwrap()
}

fn peak(out: &[f32]) -> f32 {
    out.iter().fold(0f32, |m, s| m.max(s.abs()))
}

fn crossings(out: &[f32]) -> usize {
    out.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count()
}

/// How long each voice lasts, 60 dB down, in milliseconds: slider B's range (VOICES.md).
/// The snare's B is its wires; its body falls 60 dB in 120 ms whatever B says.
fn length_ms(track: u8, b: u32) -> f64 {
    let (lo, hi) = match track {
        KICK => (100.0, 600.0),
        SNARE => (50.0, 250.0),
        CLOSED => (10.0, 60.0),
        _ => (100.0, 500.0),
    };
    let b = lo + b as f64 * (hi - lo) / 65535.0;
    if track == SNARE { b.max(120.0) } else { b }
}

/// A sixteen-step beat: kick on the beat, snare on two and four, closed hats on the
/// eighths, open hats on the last eighth of each half.
fn beat() -> Vec<(u64, Cmd)> {
    let mut c = Vec::new();
    for s in 0..16u8 {
        if s % 4 == 0 {
            c.push((0, cmd(CMD_STEP, KICK, s, 1)));
        }
        if s % 8 == 4 {
            c.push((0, cmd(CMD_STEP, SNARE, s, 1)));
        }
        if s % 2 == 0 && s % 8 != 6 {
            c.push((0, cmd(CMD_STEP, CLOSED, s, 1)));
        }
        if s % 8 == 6 {
            c.push((0, cmd(CMD_STEP, OPEN, s, 1)));
        }
    }
    c.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    c
}

#[test]
fn each_drum_is_loud_from_its_trigger_then_exactly_silent_within_its_length() {
    for rate in [44100, 48000, 96000] {
        for t in DRUMS {
            let out = hit(t, 32768, 32768, rate, rate as usize);
            let p = peak(&out);
            assert!(p > 0.3 * LEVEL && p <= LEVEL, "track {t} at {rate}: peak {p}, at the core's level");
            assert!(out.iter().all(|s| s.is_finite()));
            // Loud at the start; still sounding at 90 % of its 60 dB time; nothing at all by
            // 150 %, however it is cut (the -80 dB cut comes a third later, or a little more
            // for a voice that starts above 1).
            let len = length_ms(t, 32768) * rate as f64 / 1000.0;
            assert!(peak(&out[..(len * 0.2) as usize]) == p, "track {t}: the peak is at the start");
            let last = last_sound(&out);
            assert!(last as f64 > len * 0.9 && (last as f64) < len * 1.5, "track {t} at {rate}: last sound at {last}, length {len}");
        }
    }
}

#[test]
fn slider_b_sets_each_drum_s_length() {
    for t in DRUMS {
        for b in [0, 65535] {
            let out = hit(t, 32768, b, 48000, 48000);
            let len = length_ms(t, b) * 48.0;
            let last = last_sound(&out) as f64;
            assert!(last > len * 0.9 && last < len * 1.5, "track {t} b {b}: last sound at {last}, length {len}");
        }
    }
}

#[test]
fn slider_a_sets_the_kick_s_base_pitch() {
    // After the sweep has died (by 150 ms it is 1 part in 2 000), count cycles over 200 ms:
    // 40 Hz and 90 Hz give 8 and 18.
    let cycles = |a| crossings(&hit(KICK, a, 65535, 48000, 48000)[7200..16800]);
    let (low, high) = (cycles(0), cycles(65535));
    assert!((7..=9).contains(&low) && (17..=19).contains(&high), "{low} and {high} cycles");
    // And it starts high: three times the base. The first 10 ms at 40 Hz hold more than the
    // 0.4 of a cycle a steady 40 Hz would.
    let start = crossings(&hit(KICK, 0, 65535, 48000, 4800));
    assert!(start >= 1, "the sweep starts above the base: {start} cycles in 100 ms");
}

#[test]
fn slider_a_sets_the_snare_s_body_pitch() {
    // With the wires at their shortest (50 ms, cut by 70), only the body sounds from 75 ms
    // to its own cut near 140. Its two sines are 130 and 238 Hz at A = 0, 230 and 422 at the
    // top: the counts scale by 230 / 130.
    let cycles = |a| crossings(&hit(SNARE, a, 0, 48000, 48000)[3600..6480]);
    let (low, high) = (cycles(0) as f64, cycles(65535) as f64);
    assert!(low > 0.0 && (1.5..2.1).contains(&(high / low)), "{low} and {high} cycles");
}

#[test]
fn slider_a_moves_the_hats_filter() {
    // A higher corner keeps less of the low partials: more crossings, a brighter hat.
    for t in [CLOSED, OPEN] {
        let (dark, bright) = (crossings(&hit(t, 0, 65535, 48000, 2400)), crossings(&hit(t, 65535, 65535, 48000, 2400)));
        assert!(bright > dark, "track {t}: {dark} crossings at 5 kHz, {bright} at 10 kHz");
    }
}

#[test]
fn the_beat_s_mix_is_the_sum_of_its_tracks_and_each_track_is_alone_in_its_channel() {
    let cmds = beat();
    let (mix, _) = render(&mut Host::new(48000, 1), 48000, 128, 1, &cmds);
    let (tracks, _) = render(&mut Host::new(48000, 1), 48000, 128, 16, &cmds);
    for f in 0..48000 {
        let ch = |t: usize| tracks[f * 16 + t];
        let sum = ch(0) + ch(1) + ch(2) + ch(3) + ch(9);
        assert_eq!(mix[f].to_bits(), sum.to_bits(), "frame {f}");
        for t in (4..16).filter(|&t| t != 9) {
            assert_eq!(ch(t).to_bits(), 0, "frame {f} track {t}");
        }
    }
    for t in DRUMS {
        let solo: Vec<f32> = (0..48000).map(|f| tracks[f * 16 + t as usize]).collect();
        assert!(peak(&solo) > 0.3 * LEVEL, "track {t} sounds in its own channel");
    }
}

#[test]
fn the_core_s_level_keeps_the_whole_beat_near_full_scale() {
    // D48: the four drums together, every slider at its middle, sit near 1.0. Not a ceiling:
    // a host still softens what passes its own.
    let (mix, _) = render(&mut Host::new(48000, 1), 96000, 128, 1, &beat());
    let p = peak(&mix);
    assert!(p > 0.5 && p < 1.2, "the beat peaks at {p}");
}

#[test]
fn the_block_size_does_not_change_a_sample_of_the_beat() {
    let cmds = beat();
    let (want, _) = render(&mut Host::new(44100, 1), 44100, 1, 1, &cmds);
    for block in [128, 512, 4096] {
        let (got, _) = render(&mut Host::new(44100, 1), 44100, block, 1, &cmds);
        assert!(got.iter().zip(&want).all(|(a, b)| a.to_bits() == b.to_bits()), "block {block}");
    }
}

#[test]
fn a_drum_sounding_across_a_rate_change_keeps_its_length_in_seconds() {
    for t in DRUMS {
        let whole = last_sound(&hit(t, 32768, 65535, 48000, 48000)) as f64 / 48000.0;
        // The same hit, with the rate doubled 20 ms in.
        let mut h = Host::new(48000, 1);
        let fire = [(0, cmd(CMD_SOUND, t, 1, 65535)), (0, cmd(CMD_FIRE, t, 0, 0))];
        let (first, _) = render(&mut h, 960, 128, 1, &fire);
        assert!(first.iter().any(|&s| s != 0.0));
        unsafe { pi_set_sample_rate(h.e, 96000) };
        let (rest, _) = render(&mut h, 96000, 128, 1, &[]);
        let split = 0.02 + last_sound(&rest) as f64 / 96000.0;
        assert!((split - whole).abs() < 0.002, "track {t}: {whole} s at one rate, {split} s across the change");
    }
}

#[test]
fn a_slider_moved_while_a_drum_sounds_waits_for_its_next_hit() {
    // §11: a value is read when the voice is next triggered, and a rate change does not
    // read it either.
    for t in DRUMS {
        let fire = [(0, cmd(CMD_SOUND, t, 1, 0)), (0, cmd(CMD_FIRE, t, 0, 0))];
        let mut moved = Host::new(48000, 1);
        let (a, _) = render(&mut moved, 240, 128, 1, &fire);
        let (b, _) = render(&mut moved, 24000, 128, 1, &[(0, cmd(CMD_SOUND, t, 1, 65535))]);
        unsafe { pi_set_sample_rate(moved.e, 44100) };
        let mut still = Host::new(48000, 1);
        let (c, _) = render(&mut still, 240, 128, 1, &fire);
        let (d, _) = render(&mut still, 24000, 128, 1, &[]);
        assert_eq!([a, b].concat().iter().map(|s| s.to_bits()).collect::<Vec<_>>(), [c, d].concat().iter().map(|s| s.to_bits()).collect::<Vec<_>>(), "track {t}");
    }
}
