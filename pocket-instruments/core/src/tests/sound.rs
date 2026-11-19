//! §11: sound. What a render must be, whatever the host. P7's bar itself (native against
//! WebAssembly) is `make render`; these are the rules a render obeys on one machine.

use super::*;

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
    let peak = out[..2000].iter().fold(0f32, |m, s| m.max(s.abs()));
    assert!(peak > 0.5 && peak <= 1.0, "peak {peak}");
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
