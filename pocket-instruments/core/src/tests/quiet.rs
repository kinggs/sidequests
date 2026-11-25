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
        unsafe { (*long.e).voices.ask_every_voice() };
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

// ---- Session 36 (D102): the sounds that may be sounding ----
//
// Codex's patch asks only the sounds whose bit is set in a mask of those that may be sounding:
// a hit sets a sound's bit, and the frame it gives +0 and says silent clears it. These tests
// were written before the patch, against the old core, which asks every voice on every frame
// that is not quiet, so they passed there: their job is to fail on a planted fault after. Each
// takes a way a sound starts, stops or changes off the normal path of a hit and its decay, and
// holds an engine taking the short ways round, frame by frame and bit for bit, to one made to
// ask every voice before every frame (`Voices::ask_every_voice`): the events, all seventeen or
// eighteen channels, the view, and the snapshot at the end.

/// A decaying buzz of `frames` frames, pitched by `k`, for a track's sample (D50). Leaked: it
/// must outlive the engines that play it (§12), and every engine in a test reads the same one.
fn buzz(frames: i32, k: i32) -> &'static [i16] {
    let v: Vec<i16> = (0..frames).map(|i| ((i * k % 200 - 100) * (frames - i) / (frames / 250).max(1)) as i16).collect();
    Box::leak(v.into_boxed_slice())
}

fn set_sample(h: &Host, track: u32, data: Option<&[i16]>) {
    let (p, n) = data.map_or((core::ptr::null(), 0), |d| (d.as_ptr(), d.len() as u32));
    unsafe { pi_set_sample(h.e, track, p, n) };
}

fn fire(track: u8) -> Cmd {
    cmd(CMD_FIRE, track, 0, 0)
}

/// Two engines, the same commands, inputs and calls between frames (`between`, given each host
/// before the frame `f`), a frame at a time in a layout of `channels`; `long` asks every voice
/// before every frame. Returns how many frames `short` began quiet.
fn held(rate: u32, channels: usize, frames: u64, cmds: &[(u64, Cmd)], mut between: impl FnMut(u64, &mut Host)) -> u64 {
    let (mut short, mut long) = (Host::new(rate, 7), Host::new(rate, 7));
    let (mut next, mut quiet) = (0usize, 0u64);
    let mut ins = vec![0f32; channels];
    for f in 0..frames {
        between(f, &mut short);
        between(f, &mut long);
        let mut these = Vec::new();
        while next < cmds.len() && cmds[next].0 == f {
            these.push(cmds[next].1);
            next += 1;
        }
        for (i, x) in ins.iter_mut().enumerate() {
            let on = (f / 5000 + i as u64) % 3 == 1;
            *x = if channels >= LOOP && on { ((f * 29 + i as u64 * 13) % 1000) as f32 / 1000.0 - 0.5 } else { 0.0 };
        }
        let (mut a, mut b) = (ins.clone(), ins.clone());
        unsafe { (*long.e).voices.ask_every_voice() };
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
        for (c, (x, y)) in a.iter().zip(&b).enumerate() {
            assert_eq!(x.to_bits(), y.to_bits(), "{channels} channels, frame {f}: channel {c}, {x} against asking every voice's {y}");
        }
        assert_eq!(short.view(), long.view(), "{channels} channels, frame {f}: the view");
    }
    assert_eq!(short.save(), long.save(), "{channels} channels: the snapshot");
    quiet
}

/// `pi_set_sample` stops a sounding sample at once (§12): a sample set again while it sounds,
/// a sample cleared while it sounds, the new one hit after, and one set on the very frame its
/// track is hit. The kick keeps something else sounding through some of it, not all.
#[test]
fn a_sample_set_again_or_cleared_while_it_sounds_is_the_same_bits_as_asking_every_voice() {
    let (a, b) = (buzz(20_000, 37), buzz(9_000, 53));
    let mut c = vec![
        (0, cmd(CMD_VOICE, 4, 0, 1)),
        (0, cmd(CMD_VOICE, 9, 0, 1)),
        (0, cmd(CMD_SOUND, 4, 1, 65_535)),
        (0, cmd(CMD_SOUND, 9, 1, 65_535)),
    ];
    for (f, t) in [(100, 4), (100, 9), (100, 0), (6_000, 4), (6_000, 9), (8_000, 4), (14_000, 9), (14_500, 4), (30_000, 4)] {
        c.push((f, fire(t)));
    }
    for (rate, channels) in [(48_000, 17), (44_100, LOOP)] {
        let quiet = held(rate, channels, 40_000, &c, |f, h| match f {
            0 => {
                set_sample(h, 4, Some(a));
                set_sample(h, 9, Some(a));
            }
            3_000 => {
                set_sample(h, 4, Some(b)); // sounding: stopped, the next hit plays b
                set_sample(h, 9, None); // sounding: stopped, the next hit plays its code voice
            }
            8_000 => set_sample(h, 4, Some(a)), // b sounding, and hit on this frame: a plays
            14_200 => set_sample(h, 9, Some(b)), // its code voice rings on; the sample is silent
            14_600 => set_sample(h, 4, Some(b)), // a sounding alone
            _ => {}
        });
        assert!(quiet > 1_000, "{channels} channels: quiet on only {quiet} frames");
    }
}

/// `VOICE` read at the hit (§12): after a switch the old sound's tail plays out under the new
/// one, so a track's code voice and its sample ring together. Switched with both ringing,
/// switched and hit on one frame, switched with nothing ringing, and switched to a sample a
/// track does not have (it plays its code voice).
#[test]
fn voice_switched_while_the_code_voice_and_the_sample_both_ring_is_the_same_bits_as_asking_every_voice() {
    let a = buzz(30_000, 41);
    let mut c = vec![(0, cmd(CMD_SOUND, 14, 1, 65_535)), (0, cmd(CMD_SOUND, 6, 1, 65_535)), (0, cmd(CMD_SOUND, 6, 0, 50_000))];
    for t in [14u8, 6] {
        c.extend([
            (100, fire(t)),                    // the code voice
            (500, cmd(CMD_VOICE, t, 0, 1)),    // switched, nothing hit
            (900, fire(t)),                    // the sample under the code voice's tail
            (1_300, cmd(CMD_VOICE, t, 0, 0)),  // switched back with both ringing
            (1_700, fire(t)),                  // the code voice again, the sample ringing
            (2_100, cmd(CMD_VOICE, t, 0, 1)),  // switched and hit on one frame
            (2_100, fire(t)),
            (2_400, cmd(CMD_VOICE, t, 0, 0)),
        ]);
    }
    c.extend([(30_000, cmd(CMD_VOICE, 11, 0, 1)), (31_000, cmd(CMD_VOICE, 3, 0, 1)), (31_500, fire(3)), (31_500, fire(11))]);
    c.sort_by_key(|x| x.0);
    for (rate, channels) in [(48_000, 17), (96_000, LOOP)] {
        let quiet = held(rate, channels, 150_000, &c, |f, h| {
            if f == 0 {
                set_sample(h, 14, Some(a));
                set_sample(h, 6, Some(a));
                set_sample(h, 11, Some(a));
            }
        });
        assert!(quiet > 1_000, "{channels} channels: quiet on only {quiet} frames");
    }
}

/// A rate change (§11, §12): a sounding voice keeps its pitch and length in seconds, and one
/// that is silent must stay so. Up and down while sounds ring, code and sample; while quiet;
/// and on the frame a track is hit.
#[test]
fn a_rate_change_while_some_sound_and_others_are_silent_is_the_same_bits_as_asking_every_voice() {
    let a = buzz(20_000, 29);
    let mut c = vec![(0, cmd(CMD_VOICE, 5, 0, 1)), (0, cmd(CMD_SOUND, 14, 1, 65_535))];
    for (f, t) in [(100, 0), (100, 5), (300, 14), (900, 12), (2_400, 2), (26_000, 9), (26_000, 5), (40_000, 1), (40_000, 15)] {
        c.push((f, fire(t)));
    }
    c.sort_by_key(|x| x.0);
    for channels in [17, LOOP] {
        let quiet = held(48_000, channels, 60_000, &c, |f, h| {
            let to = match f {
                0 => {
                    set_sample(h, 5, Some(a));
                    0
                }
                2_000 => 96_000,  // the kick, the sample, the tone and the cowbell ringing
                2_500 => 44_100,
                20_000 => 48_000, // quiet by now
                26_000 => 96_000, // on the frame two tracks are hit
                40_100 => 44_100,
                _ => 0,
            };
            if to != 0 {
                unsafe { pi_set_sample_rate(h.e, to) };
            }
        });
        assert!(quiet > 1_000, "{channels} channels: quiet on only {quiet} frames");
    }
}

/// Effect 1 (§18, designed 2026-11-25): a slowed sound is asked only on a fresh frame of the
/// grid, and comes on and goes off with sounds ringing. Some sounds out of the effects (so
/// some slowed and some not), the effects' sounds changed while 1 is heard, then all sixteen
/// slowed, a sample among them, and a rate change while slowed.
#[test]
fn effect_1_on_and_off_with_some_sounds_slowed_is_the_same_bits_as_asking_every_voice() {
    let a = buzz(20_000, 31);
    let step = 6_000u64; // 120 bpm at 48 kHz
    let mut edits = vec![cmd(CMD_VOICE, 5, 0, 1), cmd(CMD_SOUND, 14, 1, 65_535), cmd(CMD_FXSOUND, 1, 0, 0), cmd(CMD_FXSOUND, 2, 0, 0)];
    for s in [0u8, 4, 8, 12] {
        edits.push(cmd(CMD_STEP, 0, s, 1));
    }
    for s in [2u8, 6, 10, 14] {
        edits.extend([cmd(CMD_STEP, 2, s, 1), cmd(CMD_STEP, 1, s, 1)]);
    }
    for s in [1u8, 3, 9, 11] {
        edits.extend([cmd(CMD_STEP, 14, s, 1), cmd(CMD_STEP, 5, s, 1)]);
    }
    for s in [2u8, 3, 4, 9, 10, 13] {
        edits.push(cmd(CMD_FX, s, 0, 1));
    }
    let mut c: Vec<(u64, Cmd)> = edits.into_iter().map(|x| (0, x)).collect();
    c.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    c.extend([
        (3 * step + 700, cmd(CMD_FXSOUND, 1, 0, 1)),  // the snare slowed while 1 is heard
        (9 * step + 300, cmd(CMD_FXSOUND, 14, 0, 0)), // the tone, ringing, out while heard
        (16 * step, cmd(CMD_FXSOUND, 2, 0, 1)),       // the second bar: all sixteen slowed
        (16 * step, cmd(CMD_FXSOUND, 14, 0, 1)),
        (16 * step + 10, fire(7)),
        (18 * step + 111, fire(15)),
        (32 * step, cmd(CMD_PLAY, 0, 0, 0)),
    ]);
    c.sort_by_key(|x| x.0);
    for (rate_scale, channels) in [(1u64, 17), (1, LOOP), (2, 17)] {
        let c: Vec<(u64, Cmd)> = c.iter().map(|&(f, x)| (f * rate_scale, x)).collect();
        let (mut some, mut all) = (0u64, 0u64);
        let quiet = held(48_000 * rate_scale as u32, channels, (40 * step) * rate_scale, &c, |f, h| {
            let slowed = unsafe { (*h.e).bus.slowed };
            some += (slowed != 0 && slowed != 0xFFFF) as u64;
            all += (slowed == 0xFFFF) as u64;
            if f == 0 {
                set_sample(h, 5, Some(a));
            }
            if f == (19 * step + 4_000) * rate_scale {
                unsafe { pi_set_sample_rate(h.e, 44_100) }; // inside step 19's effect 1, all slowed
            }
        });
        assert!(quiet > 1_000, "{channels} channels: quiet on only {quiet} frames");
        // Both of `sound_slow`'s ways: some sounds slowed, and all sixteen.
        assert!(some > 3 * step && all > 3 * step, "{channels} channels: some slowed on {some} frames, all on {all}");
    }
}

/// Effect 1 with one sound left out of the effects, each of the sixteen in turn, every sound
/// hit now and then: the one left out is asked as a plain sound beside fifteen slowed lines,
/// and its bit is held to asking every voice whichever track it is. Written after a planted
/// fault (track 3 never asked on that path) passed every test (Session 36). This one cannot
/// catch that fault: both engines run the same planted code, so these tests hold the mask and
/// nothing else. The path itself is held to `tests/bus.rs`'s own model of the voices, which
/// gained the same sixteen cases for it (`effect_1_with_any_one_sound_out_...`).
#[test]
fn effect_1_with_any_one_sound_out_of_the_effects_is_the_same_bits_as_asking_every_voice() {
    for out in 0..16u8 {
        let mut c: Vec<(u64, Cmd)> = (0..16u8).map(|s| (0, cmd(CMD_FX, s, 0, 1))).collect();
        c.extend([(0, cmd(CMD_FXSOUND, out, 0, 0)), (0, cmd(CMD_PLAY, 0, 0, 1))]);
        for i in 0..24u64 {
            c.push((50 + i * 700, fire(((i * 5 + out as u64) % 16) as u8)));
            if i % 3 == 0 {
                c.push((50 + i * 700, fire(out)));
            }
        }
        c.sort_by_key(|x| x.0);
        let mut partial = 0u64;
        held(48_000, 17, 20_000, &c, |_, h| partial += (unsafe { (*h.e).bus.slowed } == !(1u16 << out)) as u64);
        assert!(partial > 30_000, "sound {out} out: fifteen slowed on {partial} frames of both engines' 40 000");
    }
}

/// A load (§15, §20) while playing and while sounds ring: the steps, the sliders and `VOICE`
/// change under them, and no voice is touched. Loaded twice while playing, once more stopped.
#[test]
fn a_load_while_playing_is_the_same_bits_as_asking_every_voice() {
    let a = buzz(20_000, 43);
    // Another beat to load: other steps, other sliders, tracks 3 and 5 on their samples.
    let other = {
        let mut h = Host::new(48_000, 3);
        let mut c = vec![cmd(CMD_VOICE, 3, 0, 1), cmd(CMD_VOICE, 5, 0, 1), cmd(CMD_SOUND, 9, 0, 60_000), cmd(CMD_SOUND, 3, 1, 65_535)];
        for s in 0..16u8 {
            c.push(cmd(CMD_STEP, (s * 3 % 16) as u8, s, 1));
        }
        c.push(cmd(CMD_PLAY, 0, 0, 1));
        h.block(1, &c);
        h.block(1_000, &[]);
        h.save()
    };
    let mut c = vec![(0, cmd(CMD_VOICE, 5, 0, 1)), (0, cmd(CMD_SOUND, 14, 1, 65_535))];
    for s in [0u8, 4, 8, 12] {
        c.push((0, cmd(CMD_STEP, 0, s, 1)));
        c.push((0, cmd(CMD_STEP, 5, s + 2, 1)));
        c.push((0, cmd(CMD_STEP, 14, s + 1, 1)));
    }
    c.extend([(0, cmd(CMD_PLAY, 0, 0, 1)), (60_000, cmd(CMD_PLAY, 0, 0, 0))]);
    for channels in [17, LOOP] {
        let snap = other;
        held(48_000, channels, 90_000, &c, |f, h| {
            if f == 0 {
                set_sample(h, 3, Some(a));
                set_sample(h, 5, Some(a));
            }
            if f == 13_000 || f == 40_007 || f == 61_000 {
                assert_eq!(h.load(&snap), 0, "frame {f}: the load");
            }
        });
    }
}

/// The frame a sound ends is the frame its bit is cleared (+0, and it says silent). Hit again
/// the frame before, on that frame, and the frame after; alone (the engine quiet between) and
/// with another sound ringing; code voices and a sample.
#[test]
fn a_sound_hit_again_on_the_frame_it_ends_is_the_same_bits_as_asking_every_voice() {
    let a = buzz(3_000, 47);
    for (t, sampled) in [(0u8, false), (9, false), (13, false), (14, false), (5, true)] {
        // The frame it ends: the first after which every voice says silent, hit alone.
        let end = {
            let h = Host::new(48_000, 7);
            if sampled {
                set_sample(&h, t as u32, Some(a));
            }
            let mut out = [0f32; 1];
            let mut ev = [Event::default(); CAP];
            let hit = [cmd(CMD_VOICE, t, 0, sampled as u32), fire(t)];
            unsafe { pi_process(h.e, 1, hit.as_ptr(), 2, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 1) };
            let mut f = 1u64;
            while !unsafe { (*h.e).voices.silent() } {
                unsafe { pi_process(h.e, 1, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, out.as_mut_ptr(), 1) };
                f += 1;
                assert!(f < 200_000, "sound {t} never ends");
            }
            assert!(f > 100, "sound {t} ends on frame {f}: too soon to be a sound");
            f - 1
        };
        for again in [end - 1, end, end + 1] {
            for other in [false, true] {
                let mut c = vec![(0, cmd(CMD_VOICE, t, 0, sampled as u32)), (0, fire(t)), (again, fire(t))];
                if other {
                    c.push((end - 50, cmd(CMD_SOUND, 15, 1, 65_535)));
                    c.push((end - 50, fire(15)));
                }
                c.sort_by_key(|x| x.0);
                held(48_000, 17, again + 4_000, &c, |f, h| {
                    if f == 0 && sampled {
                        set_sample(h, t as u32, Some(a));
                    }
                });
            }
        }
    }
}
