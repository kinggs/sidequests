//! Session 29, the idle cost: a quiet engine (every voice and sample silent) does not ask its
//! voices for a frame (`Voices::quiet`). Nothing a host hears or sees may change, so an engine
//! taking that path is held, frame by frame and bit for bit, to one made to ask every voice on
//! every frame: the same events, view and audio, in every layout, over a long run stopped with
//! taps, then a beat played with effects and stopped again, the clock counting throughout (§4).

use super::*;
use crate::voice::{LOOP, LOOP_SLIDERS};

/// Two engines, the same commands and inputs, a frame at a time; `long` is put back on the
/// long way round before every frame. Returns how many frames `short` began quiet.
fn same(rate: u32, channels: usize, frames: u64, cmds: &[(u64, Cmd)]) -> u64 {
    let (short, long) = (Host::new(rate, 7), Host::new(rate, 7));
    // A short decaying buzz for two tracks' samples (D50), so samples go quiet too.
    let data: Vec<i16> = (0..3000i32).map(|i| ((i * 37 % 200 - 100) * (3000 - i) / 12) as i16).collect();
    for h in [&short, &long] {
        for t in [0u32, 5] {
            assert_eq!(unsafe { pi_set_sample(h.e, t, data.as_ptr(), data.len() as u32) }, 1);
        }
    }
    let (mut next, mut quiet) = (0usize, 0u64);
    let mut ins = vec![0f32; channels];
    for f in 0..frames {
        if f == frames / 2 {
            // A rate change half way: the voices retune, the clock rescales (§4).
            for h in [&short, &long] {
                unsafe { pi_set_sample_rate(h.e, rate * 2) };
            }
        }
        let mut these = Vec::new();
        while next < cmds.len() && cmds[next].0 == f {
            these.push(cmds[next].1);
            next += 1;
        }
        // What is patched in: two returned sounds, FX RETURN and the sliders, each moving in
        // some stretches and silent in others. Written over in the layouts that do not read it.
        for (i, x) in ins.iter_mut().enumerate() {
            let on = (f / 7000 + i as u64) % 3 == 1;
            *x = if channels >= LOOP && on { ((f * 31 + i as u64 * 17) % 1000) as f32 / 1000.0 - 0.5 } else { 0.0 };
        }
        let (mut a, mut b) = (ins.clone(), ins.clone());
        unsafe { (*long.e).voices.quiet = false };
        quiet += unsafe { (*short.e).voices.quiet } as u64;
        let (mut ea, mut eb) = ([Event::default(); CAP], [Event::default(); CAP]);
        let (na, nb) = unsafe {
            (
                pi_process(short.e, 1, these.as_ptr(), these.len() as u32, ea.as_mut_ptr(), CAP as u32, a.as_mut_ptr(), channels as u32),
                pi_process(long.e, 1, these.as_ptr(), these.len() as u32, eb.as_mut_ptr(), CAP as u32, b.as_mut_ptr(), channels as u32),
            )
        };
        let ev = |e: &[Event]| e.iter().map(|x| format!("{} {}", x.frame, line(x))).collect::<String>();
        assert_eq!(ev(&ea[..na as usize]), ev(&eb[..nb as usize]), "{channels} channels, frame {f}: the events");
        let bits = |v: &[f32]| v.iter().map(|x| x.to_bits()).collect::<Vec<_>>();
        assert_eq!(bits(&a), bits(&b), "{channels} channels, frame {f}: the audio");
        assert_eq!(short.view(), long.view(), "{channels} channels, frame {f}: the view");
    }
    assert_eq!(short.save(), long.save(), "{channels} channels: the snapshot");
    quiet
}

/// Stopped, with taps of every kind, then a beat with an effect lane played and stopped, then
/// taps again, with silences between, where the quiet path is taken.
fn run() -> Vec<(u64, Cmd)> {
    let mut c = vec![
        (0, cmd(CMD_VOICE, 0, 0, 1)),  // tracks 1 and 6 play their samples
        (0, cmd(CMD_VOICE, 5, 0, 1)),
        (0, cmd(CMD_ROUTE, 0, 0, 0x0003)), // §19: sounds 1 and 2 come back on the loop layouts
        (0, cmd(CMD_ROUTE, 2, 0, 0x00f0)), // and the A of sounds 5 to 8, the B of 9 to 16
        (0, cmd(CMD_ROUTE, 3, 0, 0xff00)),
    ];
    // Stopped: a tap of each track in turn, some on top of another's tail, some two at once.
    for i in 0..24u64 {
        let f = 500 + i * 1_300 + (i % 5) * 211;
        c.push((f, cmd(CMD_FIRE, (i * 5 % 16) as u8, 0, 0)));
        if i % 7 == 3 {
            c.push((f, cmd(CMD_FIRE, (i * 3 % 16) as u8, 0, 0)));
        }
    }
    c.push((20_000, cmd(CMD_PARAM, 0, 0, 9_000))); // a slider moved: the next taps change
    c.push((31_000, cmd(CMD_KEY_DOWN, 2, 0, 0))); // a grid key tapped: its sound plays
    c.push((31_400, cmd(CMD_KEY_UP, 2, 0, 0)));
    c.push((45_000, cmd(CMD_VOICE, 5, 0, 0))); // a sample switched off mid-tail
    // Played: the minimum beat with effects on the lane, then stopped; the ramp goes out.
    for s in [0u8, 4, 8, 12] {
        c.push((90_000, cmd(CMD_STEP, 0, s, 1)));
    }
    for s in [2u8, 6, 10, 14] {
        c.push((90_000, cmd(CMD_STEP, 2, s, 1)));
    }
    // ABI 14: effect 1 on steps 2, 3 and 9 to 11, the voices slowed (§18, designed
    // 2026-11-25): quiet then waits for every slowed sound's line to be +0 too.
    for (s, fx) in [(0u8, 2u32), (1, 2), (2, 1), (3, 1), (4, 11), (5, 11), (8, 6), (9, 1), (10, 1), (11, 1), (12, 14)] {
        c.push((90_000, cmd(CMD_FX, s, 0, fx)));
    }
    c.push((90_000, cmd(CMD_PLAY, 0, 0, 1)));
    c.push((150_000, cmd(CMD_PLAY, 0, 0, 0)));
    for i in 0..10u64 {
        c.push((165_000 + i * 2_900, cmd(CMD_FIRE, (i * 7 % 16) as u8, 0, 0)));
    }
    c.sort_by_key(|x| x.0); // stable: a frame's commands keep their order
    c
}

#[test]
fn a_quiet_engine_skipping_its_voices_is_the_same_bits_as_one_asking_them_every_frame() {
    let cmds = run();
    for (rate, channels) in [(48_000, 1), (44_100, 16), (48_000, 17), (24_000, LOOP), (48_000, LOOP_SLIDERS)] {
        let quiet = same(rate, channels, 200_000, &cmds);
        // Not a test of nothing: the silences (about 33 000 frames before the beat, and its
        // tail and the taps' after) take the short way.
        assert!(quiet > 40_000, "{channels} channels: quiet on only {quiet} frames of 200 000");
    }
}

#[test]
fn quiet_from_the_start_and_again_once_the_last_voice_ends() {
    let h = Host::new(48_000, 1);
    let quiet = || unsafe { (*h.e).voices.quiet };
    assert!(quiet(), "a fresh engine is quiet");
    let mut out = [0f32; 1];
    let mut ev = [Event::default(); CAP];
    let fire = [cmd(CMD_FIRE, 0, 0, 0)];
    unsafe { pi_process(h.e, 1, fire.as_ptr(), 1, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 1) };
    assert!(!quiet(), "a hit is not quiet");
    let mut n = 0;
    while !quiet() {
        unsafe { pi_process(h.e, 1, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 1) };
        n += 1;
        assert!(n < 48_000, "the kick ends within a second and the engine is quiet again");
    }
    assert_eq!(out[0].to_bits(), 0, "the first quiet frame follows a frame of +0");
}

/// What `quiet` rests on: once every voice says it is silent, each gives +0 until its next hit.
/// Asked of each sound alone, at three lengths (slider B), as code and as a sample: a voice
/// whose `silent` is wrong would be cut off by the short way. Only a frame of sixteen +0s asks
/// the voices (`Voices::sound`), which a sounding voice rarely gives, so the long run above
/// cannot be relied on to meet a wrong one (Session 29: two planted faults showed it).
#[test]
fn once_every_voice_says_silent_each_gives_nothing_until_its_next_hit() {
    let data: Vec<i16> = (0..3000i32).map(|i| ((i * 37 % 200 - 100) * (3000 - i) / 12) as i16).collect();
    for t in 0..16u8 {
        for b in [0u32, 32_768, 65_535] {
            for sampled in [false, true] {
                let h = Host::new(48_000, 1);
                if sampled {
                    assert_eq!(unsafe { pi_set_sample(h.e, t as u32, data.as_ptr(), data.len() as u32) }, 1);
                }
                let hit = [cmd(CMD_VOICE, t, 0, sampled as u32), cmd(CMD_SOUND, t, 1, b), cmd(CMD_FIRE, t, 0, 0)];
                let mut out = [0f32; 16];
                let mut ev = [Event::default(); CAP];
                unsafe { pi_process(h.e, 1, hit.as_ptr(), 3, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 16) };
                let (mut said, mut last) = (None, 0);
                for f in 1..96_000 {
                    let silent = unsafe { (*h.e).voices.silent() };
                    if silent && said.is_none() {
                        said = Some(f);
                    }
                    unsafe { pi_process(h.e, 1, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 16) };
                    if out[t as usize].to_bits() != 0 {
                        last = f;
                    }
                    if let Some(s) = said {
                        assert!(silent, "sound {t}, B {b}, sampled {sampled}: silent at {s}, not at {f}");
                    }
                }
                let s = said.unwrap_or_else(|| panic!("sound {t}, B {b}, sampled {sampled}: never silent in two seconds"));
                assert!(last < s, "sound {t}, B {b}, sampled {sampled}: said silent at frame {s}, sounded at {last}");
            }
        }
    }
}

/// §18, designed 2026-11-25 (ABI 14): under effect 1 quiet may be set only on a frame where
/// every channel is +0 **and** every slowed sound's `from` and `to` are +0, since a line can
/// cross zero between two values that are not. The tour above never lands a line exactly on
/// zero (a planted fault that forgot `from` and `to` went through it, Session 32), so here one
/// is put there by hand: every voice silent, effect 1 slowing all sixteen, and the tone's line
/// set to run from `a` to 1.0 with `a` chosen so the frame's value is exactly +0. The frame
/// after must still be on the line, not the +0 of a quiet engine.
#[test]
fn quiet_waits_for_a_slowed_line_that_crosses_zero() {
    let h = Host::new(48_000, 1);
    let lane: Vec<Cmd> = (0..16u8).map(|s| cmd(CMD_FX, s, 0, 1)).chain([cmd(CMD_PLAY, 0, 0, 1)]).collect();
    let e = h.e;
    let mut out = [0f32; 16];
    let frame = |c: &[Cmd], out: &mut [f32; 16]| unsafe {
        let mut ev = [Event::default(); CAP];
        pi_process(e, 1, c.as_ptr(), c.len() as u32, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 16);
    };
    frame(&lane, &mut out); // frame 0: effect 1 from idle, every sound slowed, the grid at 0
    frame(&[], &mut out); // frame 1
    assert_eq!(unsafe { (*h.e).bus.slowed }, 0xFFFF);
    // Frames 2 and 3 are not fresh at 48 kHz; mu is 93 750 and 140 625 times 1 / 192 000.
    let inv = 1.0f32 / 192_000.0;
    let (mu2, mu3) = (93_750.0f32 * inv, 140_625.0f32 * inv);
    let mut a = -mu2 / (1.0 - mu2);
    let line = |a: f32, mu: f32| a + (1.0 - a) * mu;
    let mut tries = 0;
    while line(a, mu2).to_bits() != 0 {
        a = f32::from_bits(if line(a, mu2) > 0.0 { a.to_bits() + 1 } else { a.to_bits() - 1 });
        tries += 1;
        assert!(tries < 1000, "no a puts the line on +0");
    }
    unsafe {
        (*h.e).bus.from[14] = a;
        (*h.e).bus.to[14] = 1.0;
        (*h.e).voices.quiet = false;
    }
    frame(&[], &mut out); // frame 2: the tone's line is exactly +0, as is every other channel
    assert!(out.iter().all(|x| x.to_bits() == 0), "frame 2 is sixteen +0s");
    assert!(!unsafe { (*h.e).voices.quiet }, "not quiet: the tone's line is not +0 at its ends");
    frame(&[], &mut out); // frame 3: still on the line
    assert_eq!(out[14].to_bits(), line(a, mu3).to_bits(), "frame 3 is on the line, {} against {}", out[14], line(a, mu3));
}
