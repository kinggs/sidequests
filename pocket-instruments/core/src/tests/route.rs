//! §19 (ABI 9; D68, D76 item 4; built in Session 18): sound in. The returns and the effects
//! loop (`PI_AUDIO_LOOP`, 18 channels, read and written in place), `ROUTE`, and the sliders
//! out and in (`PI_AUDIO_LOOP_SLIDERS`, 50 channels).
//!
//! `rack/test/jacks.cpp`'s cases from Session 13 are here as core tests, as §19's "Proven
//! when built by" asks: unpatched is the mix bit for bit; a sound's own voice returned is
//! the mix (bit for bit here, where no volt is in the way); a silent return takes the sound
//! out bit for bit; a return that is not a number is silence. Then a test for each rule of
//! §19, and §18's model (`tests/bus.rs`), given what came back, held bit for bit on every
//! frame of a tour through every kind of change, at three rates and on edges.

use super::bus::{Model, at_zero, beat, down, fx, fxsound, on, play, tour, up};
use super::*;
use crate::engine::slider_in;

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames
const STEP: u64 = 6000;
const FX: u8 = 20;
const BPM: u8 = 18;
const MIX: usize = 16;
const SEND: usize = 17;
const LOOP: usize = 18;
const SLIDERS: usize = 50;
const A_OUT: usize = 18;
const B_OUT: usize = 34;

fn route(what: u8, mask: u32) -> Cmd {
    cmd(CMD_ROUTE, what, 0, mask)
}
fn sound(track: u8, slider: u8, v: u32) -> Cmd {
    cmd(CMD_SOUND, track, slider, v)
}
fn fire(track: u8) -> Cmd {
    cmd(CMD_FIRE, track, 0, 0)
}

/// One frame of any layout: `io` is the frame, filled by the caller with what comes in.
fn frame(h: &Host, cmds: &[Cmd], io: &mut [f32]) -> Vec<Event> {
    let mut ev = [Event::default(); CAP];
    let n = unsafe { pi_process(h.e, 1, cmds.as_ptr(), cmds.len() as u32, ev.as_mut_ptr(), CAP as u32, io.as_mut_ptr(), io.len() as u32) };
    ev[..n as usize].to_vec()
}

/// The commands of `cmds` that land on frame `f`, in order.
fn at(cmds: &[(u64, Cmd)], f: u64) -> Vec<Cmd> {
    cmds.iter().filter(|c| c.0 == f).map(|c| c.1).collect()
}

fn bits(a: &[f32]) -> Vec<u32> {
    a.iter().map(|x| x.to_bits()).collect()
}

/// The volume by its keys (§13): bpm held, grid key `volume - 1`.
fn volume(v: u8) -> Vec<Cmd> {
    vec![down(BPM), down(v - 1), up(v - 1), up(BPM)]
}

/// `rack/test/jacks.cpp`'s beat: four drums, a tone, a sample on track 6, at 132 bpm; the
/// bass drum on every beat, or not at all.
fn jacks_beat(bass_drum: bool, vol: u8) -> Vec<(u64, Cmd)> {
    let mut c = vec![cmd(CMD_TEMPO, 0, 0, 132_000)];
    for s in 0..16u8 {
        if bass_drum && s % 4 == 0 {
            c.push(on(0, s));
        }
        if s % 8 == 4 {
            c.push(on(1, s));
        }
        c.push(on(2, s));
        if s % 4 == 2 {
            c.push(on(3, s));
        }
        if s % 3 == 0 {
            c.push(on(14, s));
        }
        if s % 5 == 1 {
            c.push(on(6, s));
        }
    }
    c.push(cmd(CMD_VOICE, 6, 0, 1));
    if vol != 16 {
        c.extend(volume(vol));
    }
    at_zero(&c)
}

/// An engine with a sample on track 6: any data, so long as every engine in a test has it.
/// The data is leaked: it must outlive the engine (§12), and a test's memory goes with it.
fn with_sample() -> Host {
    let h = Host::new(SR, 1);
    let data: &'static [i16] = Vec::leak((0..2000).map(|i| ((i * 37) % 20_000 - 10_000) as i16).collect());
    assert_eq!(unsafe { pi_set_sample(h.e, 6, data.as_ptr(), data.len() as u32) }, 1);
    h
}

const TWO_SECONDS: u64 = 2 * SR as u64; // past a bar at 132 bpm

// ---- rack/test/jacks.cpp's cases, in the core ----

#[test]
fn nothing_routed_and_nothing_punched_channel_16_is_layout_17_s_mix_bit_for_bit() {
    // Both loop layouts against PI_AUDIO_BOTH, at volume 16 and at 11. What is on the inputs
    // does not matter: with nothing routed nothing is read, not even a NaN.
    for vol in [16u8, 11] {
        let cmds = jacks_beat(true, vol);
        let (both, looped, sliders) = (with_sample(), with_sample(), with_sample());
        let mut sounding = 0;
        for f in 0..TWO_SECONDS {
            let c = at(&cmds, f);
            let mut a = [0f32; 17];
            let mut b = [f32::NAN; LOOP];
            let mut s = [7.5f32; SLIDERS];
            let ev = frame(&both, &c, &mut a);
            assert_eq!(frame(&looped, &c, &mut b), ev, "volume {vol}, frame {f}: the events");
            assert_eq!(frame(&sliders, &c, &mut s), ev, "volume {vol}, frame {f}: the events");
            assert_eq!(bits(&b[..17]), bits(&a), "volume {vol}, frame {f}: 18 channels against 17");
            assert_eq!(bits(&s[..17]), bits(&a), "volume {vol}, frame {f}: 50 channels against 17");
            sounding += (a[MIX] != 0.0) as u64;
        }
        assert!(sounding > TWO_SECONDS / 4, "the beat barely sounds");
    }
}

#[test]
fn unrouted_the_loop_s_mix_is_layout_17_s_through_every_effect_too() {
    // §18's tour (every effect from idle, effect to effect, a punch, a sound switched out,
    // the volume down), with nothing routed: the same bits, effects and all.
    let cmds = tour(STEP);
    let (both, looped) = (Host::new(SR, 1), Host::new(SR, 1));
    for f in 0..32 * STEP {
        let c = at(&cmds, f);
        let mut a = [0f32; 17];
        let mut b = [f32::NAN; LOOP];
        frame(&both, &c, &mut a);
        frame(&looped, &c, &mut b);
        assert_eq!(bits(&b[..17]), bits(&a), "frame {f}");
    }
}

#[test]
fn a_sound_s_own_voice_returned_is_the_mix_bit_for_bit() {
    // Sound 1 alone, then all sixteen, each returned as its own voice of the same frame (a
    // third engine in layout 16 says what that is). In the core's own units nothing is
    // rounded on the way, so it is the same bits; through Rack's volts it is within a
    // rounding (rack/test/jacks.cpp).
    for mask in [1u32, 0xffff] {
        let cmds = jacks_beat(true, 11);
        let (plain, voices, looped) = (with_sample(), with_sample(), with_sample());
        frame(&looped, &[route(0, mask)], &mut [0f32; LOOP]);
        frame(&plain, &[], &mut [0f32; 17]);
        frame(&voices, &[], &mut [0f32; 16]);
        for f in 0..TWO_SECONDS {
            let c = at(&cmds, f);
            let mut a = [0f32; 17];
            let mut v = [0f32; 16];
            frame(&plain, &c, &mut a);
            frame(&voices, &c, &mut v);
            let mut io = [0f32; LOOP];
            io[..16].copy_from_slice(&v);
            frame(&looped, &c, &mut io);
            assert_eq!(io[MIX].to_bits(), a[MIX].to_bits(), "mask {mask:04x}, frame {f}");
        }
    }
}

#[test]
fn a_silent_return_takes_the_sound_out_bit_for_bit_and_its_voice_and_trigger_stay() {
    // Silence returned on sound 1: the mix is a second engine's that never had the bass
    // drum's steps. The sixteen voice channels and the events are as they were.
    let (with, without) = (jacks_beat(true, 13), jacks_beat(false, 13));
    let (plain, silenced, other) = (with_sample(), with_sample(), with_sample());
    frame(&silenced, &[route(0, 1)], &mut [0f32; LOOP]);
    frame(&plain, &[], &mut [0f32; 17]);
    frame(&other, &[], &mut [0f32; 17]);
    let (mut drum, mut trigs, mut removed) = (0, 0, 0);
    for f in 0..TWO_SECONDS {
        let mut p = [0f32; 17];
        let mut s = [0f32; LOOP]; // channel 1 carries silence
        let mut o = [0f32; 17];
        let ev = frame(&plain, &at(&with, f), &mut p);
        assert_eq!(frame(&silenced, &at(&with, f), &mut s), ev, "frame {f}: the events");
        frame(&other, &at(&without, f), &mut o);
        assert_eq!(s[MIX].to_bits(), o[MIX].to_bits(), "frame {f}: the mix of the beat without the bass drum");
        assert_eq!(bits(&s[..16]), bits(&p[..16]), "frame {f}: the voices");
        drum += (s[0] != 0.0) as u32;
        trigs += ev.iter().filter(|e| e.kind == EV_TRIG && e.track == 0).count();
        removed += (s[MIX].to_bits() != p[MIX].to_bits()) as u32;
    }
    assert!(drum > 0 && trigs > 0, "the bass drum never sounded or never fired");
    assert!(removed > 0, "the mix did not change when the bass drum was returned silent");
}

#[test]
fn a_return_that_is_not_a_number_is_silence_for_its_own_sound_alone() {
    // A NaN on sound 1, an infinity on 2 and the other infinity on 3, held to silence on the
    // three; and a NaN on channel 17 while an outside effect is heard, held to silence there.
    let mut cmds = jacks_beat(true, 16);
    cmds.insert(0, (0, route(0, 7)));
    cmds.insert(0, (0, route(1, 1 << 3)));
    cmds.push((3000, down(FX)));
    cmds.push((3000, down(3))); // effect 4, from outside
    let (bad, zero) = (with_sample(), with_sample());
    let mut sounding = 0;
    for f in 0..SR as u64 / 4 {
        let mut x = [0f32; LOOP];
        let mut z = [0f32; LOOP];
        (x[0], x[1], x[2], x[SEND]) = (f32::NAN, f32::INFINITY, f32::NEG_INFINITY, f32::NAN);
        frame(&bad, &at(&cmds, f), &mut x);
        frame(&zero, &at(&cmds, f), &mut z);
        assert!(x.iter().all(|s| s.is_finite()), "frame {f}: something not finite came out");
        assert_eq!(bits(&x), bits(&z), "frame {f}");
        sounding += (x[MIX] != 0.0) as u32;
    }
    assert!(sounding > 0, "nothing but the returned sounds was playing");
}

// ---- §19's rules, each alone ----

#[test]
fn a_returned_sound_in_fx_sounds_is_in_the_bus_and_one_outside_it_is_not() {
    // Two sounds that play nothing of their own, each returned as a steady 0.25: sound 6 is
    // switched into the effects and sound 10 is not. FX SEND carries the first alone. With
    // the crush held (twelve levels: 0.25 is exactly three of them, so the crush leaves it
    // and the ramp shows nothing), then the distortion: only the one in the bus is bent.
    let h = Host::new(SR, 1);
    let setup = [route(0, 1 << 5 | 1 << 9), fxsound(9, 0), play()];
    let mut io = [0f32; LOOP];
    let give = |io: &mut [f32; LOOP]| (io[5], io[9]) = (0.25, 0.25);
    give(&mut io);
    frame(&h, &setup, &mut io);
    assert_eq!((io[SEND], io[MIX]), (0.25, 0.5), "the bus holds sound 6 alone; the mix holds both");
    assert_eq!((io[5], io[9]), (0.0, 0.0), "a returned sound's output channel is still its own voice");
    give(&mut io);
    frame(&h, &[down(FX), down(1)], &mut io); // effect 2
    let mut last = 0.0;
    for _ in 0..200 {
        give(&mut io);
        frame(&h, &[], &mut io);
        last = io[MIX];
        assert_eq!(io[SEND], 0.25, "the send is before the effect");
    }
    // Ramped in: the bus is SoftLimit(6 x 0.25) x 0.7 and the rest is the plain 0.25.
    let x = 1.5f32;
    let wet = x * (27.0 + x * x) / (27.0 + 9.0 * x * x) * 0.7;
    assert_eq!(last.to_bits(), (0.25 + 0.25 + 1.0 * (wet - 0.25)).to_bits());
    // The other way round: sound 10 in, sound 6 out. The same number, from the other sound.
    give(&mut io);
    frame(&h, &[fxsound(9, 1), fxsound(5, 0)], &mut io);
    assert_eq!(io[MIX].to_bits(), last.to_bits());
    // Neither in: the effect has nothing to act on, and both pass.
    give(&mut io);
    frame(&h, &[fxsound(9, 0)], &mut io);
    assert_eq!((io[SEND], io[MIX]), (0.0, 0.5));
}

#[test]
fn an_outside_effect_s_wet_is_the_input_ramped_in_and_out_over_2_ms() {
    // Nothing sounds, so the bus is silence, and effect 4 (which the core has no sound for)
    // is marked as from outside: the mix is channel 17's input times the ramp, 500 / rate a
    // frame up and the same down, and the plain mix before and after.
    for rate in [44_100u32, 48_000, 96_000] {
        let h = Host::new(rate, 1);
        let run = |cmds: &[Cmd]| {
            let mut io = [0f32; LOOP];
            io[SEND] = 0.5;
            frame(&h, cmds, &mut io);
            io[MIX]
        };
        assert_eq!(run(&[route(1, 1 << 3), play()]), 0.0);
        for _ in 0..50 {
            assert_eq!(run(&[]), 0.0, "rate {rate}: nothing is heard until the punch");
        }
        let step = 500.0 / rate as f32;
        let mut w = 0.0f32;
        let mut first = vec![down(FX), down(3)];
        let full = rate as usize / 500;
        for k in 0..2 * full {
            w = if w + step > 1.0 { 1.0 } else { w + step };
            let got = run(&first);
            first.clear();
            assert_eq!(got.to_bits(), (0.0f32 + 0.0 + w * (0.5 - 0.0)).to_bits(), "rate {rate}: frame {k} of the ramp in");
        }
        assert_eq!(w, 1.0, "rate {rate}: full after 2 ms");
        let mut last = vec![up(3)];
        let mut frames = 0;
        loop {
            w -= step;
            let got = run(&last);
            last.clear();
            frames += 1;
            if w <= 0.0 {
                assert_eq!(got, 0.0, "rate {rate}: idle again");
                break;
            }
            assert_eq!(got.to_bits(), (0.0f32 + 0.0 + w * (0.5 - 0.0)).to_bits(), "rate {rate}: frame {frames} of the ramp out");
        }
        assert!(frames >= full && frames <= full + 1, "rate {rate}: out in {frames} frames");
        assert_eq!(unsafe { &(*h.e).bus }.probe().0, 0, "rate {rate}: the bus is idle");
    }
}

#[test]
fn an_effect_the_core_sounds_is_heard_from_outside_when_route_marks_it_and_an_unmarked_one_is_not() {
    // A steady 0.25 returned as sound 1. Effect 2 unmarked is the core's own distortion;
    // marked, its wet is channel 17 and no distortion runs. Effect 4 unmarked is nothing.
    let x = 1.5f32;
    let clip = x * (27.0 + x * x) / (27.0 + 9.0 * x * x) * 0.7;
    for (mark, key, want) in [(0u32, 1u8, clip), (1 << 1, 1, 0.125), (0, 3, 0.25), (1 << 3, 3, 0.125)] {
        let h = Host::new(SR, 1);
        let mut out = 0.0;
        for f in 0..300 {
            let mut io = [0f32; LOOP];
            (io[0], io[SEND]) = (0.25, 0.125);
            let c = if f == 0 { vec![route(0, 1), route(1, mark), play(), down(FX), down(key)] } else { vec![] };
            frame(&h, &c, &mut io);
            out = io[MIX];
        }
        assert_eq!(out.to_bits(), (0.0f32 + 0.25 + 1.0 * (want - 0.25)).to_bits(), "effect {} marked {mark:04x}", key + 1);
    }
}

#[test]
fn the_send_is_the_bus_before_any_effect_and_before_the_volume() {
    // The minimum beat with the snare switched out, at volume 5, the lowpass on every step:
    // channel 17 is the plain sum, in track order, of the sounds switched in.
    let mut edits = beat();
    edits.push(fxsound(1, 0));
    edits.extend((0..16).map(|s| fx(s, 5)));
    edits.extend(volume(5));
    let cmds = at_zero(&edits);
    let h = Host::new(SR, 1);
    let (mut sounding, mut differs) = (0, 0);
    for f in 0..8 * STEP {
        let mut io = [0f32; LOOP];
        frame(&h, &at(&cmds, f), &mut io);
        let mut bus = 0.0f32;
        for t in (0..16).filter(|t| *t != 1) {
            bus += io[t];
        }
        assert_eq!(io[SEND].to_bits(), bus.to_bits(), "frame {f}");
        sounding += (bus != 0.0) as u32;
        differs += (io[MIX] != io[SEND]) as u32;
    }
    assert!(sounding > 1000 && differs > 1000, "the send and the mix must both sound, and differ");
}

#[test]
fn route_is_the_patch_s_not_saved_no_generation_kept_by_a_load_and_gone_with_init() {
    let mut h = Host::new(SR, 1);
    let before = h.save();
    let listen = |h: &Host| {
        let mut io = [0f32; LOOP];
        io[0] = 0.25;
        frame(h, &[], &mut io);
        io[MIX]
    };
    assert_eq!(listen(&h), 0.0);
    frame(&h, &[route(0, 1), route(1, 0xffff), route(2, 0xffff), route(3, 0xffff)], &mut [0f32; LOOP]);
    assert_eq!(h.generation(), 0, "ROUTE moves no generation");
    assert_eq!(h.save(), before, "ROUTE is in no snapshot");
    assert_eq!(listen(&h), 0.25, "sound 1 comes from the input");
    assert_eq!(h.load(&before), 0);
    assert_eq!(listen(&h), 0.25, "a load leaves the routes: the cables did not move");
    frame(&h, &[route(4, 0xffff), route(255, 1)], &mut [0f32; LOOP]);
    assert_eq!(listen(&h), 0.25, "an `a` past 3 is ignored");
    frame(&h, &[route(0, 0x1_0000)], &mut [0f32; LOOP]);
    assert_eq!(listen(&h), 0.0, "bits past the sixteenth are not a sound");
    let fresh = Host::new(SR, 1);
    assert_eq!(listen(&fresh), 0.0, "a new engine routes nothing");
}

#[test]
fn in_the_other_three_layouts_nothing_is_read_in_and_route_changes_nothing_heard() {
    // Every route set and effect 4 (marked) punched for two steps: layouts 1, 16 and 17 give
    // the bits they give with no route at all, whatever the buffer held before the call.
    let mut cmds = at_zero(&beat());
    cmds.extend([(STEP + 1, down(FX)), (STEP + 1, down(3)), (3 * STEP + 1, up(3)), (3 * STEP + 1, up(FX))]);
    let mut routed = cmds.clone();
    for a in 0..4 {
        routed.insert(0, (0, route(a, 0xffff)));
    }
    for channels in [1usize, 16, 17] {
        let (plain, with) = (Host::new(SR, 1), Host::new(SR, 1));
        for f in 0..5 * STEP {
            let mut a = vec![0f32; channels];
            let mut b = vec![0.9f32; channels];
            let ev = frame(&plain, &at(&cmds, f), &mut a);
            assert_eq!(frame(&with, &at(&routed, f), &mut b), ev);
            assert_eq!(bits(&a), bits(&b), "{channels} channels, frame {f}");
        }
        assert_eq!(plain.view(), with.view(), "{channels} channels: the view");
    }
}

#[test]
fn a_loop_changes_no_event_and_no_view_whatever_comes_in() {
    // §11's rule for sound holds for sound in: the trace, the view and the snapshot are the
    // same with every sound returned and an outside effect held as with no buffer at all.
    // (The slider inputs are the exception §19 names: they show in bytes 60 to 63.)
    let mut cmds = tour(STEP);
    cmds.insert(0, (0, route(0, 0xffff)));
    cmds.insert(0, (0, route(1, 0xffff)));
    let (mut silent, looped) = (Host::new(SR, 1), Host::new(SR, 1));
    for f in 0..20 * STEP {
        let c = at(&cmds, f);
        let mut io = [0f32; LOOP];
        for (t, x) in io.iter_mut().enumerate() {
            *x = ((f as usize * (t + 3)) % 97) as f32 / 97.0 - 0.5;
        }
        assert_eq!(frame(&looped, &c, &mut io), silent.block(1, &c), "frame {f}");
    }
    assert_eq!(looped.view(), silent.view());
    assert_eq!(looped.save(), silent.save());
    assert_eq!(looped.generation(), silent.generation());
}

#[test]
fn eighteen_channels_are_written_and_no_more_and_fifty_are_all_written() {
    let h = Host::new(SR, 1);
    let mut buf = [7.0f32; 2 * LOOP + 8];
    let mut ev = [Event::default(); CAP];
    unsafe { pi_process(h.e, 2, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, buf.as_mut_ptr(), LOOP as u32) };
    assert!(buf[..2 * LOOP].iter().all(|x| *x == 0.0), "two frames of eighteen, silent");
    assert!(buf[2 * LOOP..].iter().all(|x| *x == 7.0), "nothing past them");
    let mut buf = [7.0f32; 2 * SLIDERS + 8];
    unsafe { pi_process(h.e, 2, core::ptr::null(), 0, ev.as_mut_ptr(), CAP as u32, buf.as_mut_ptr(), SLIDERS as u32) };
    assert!(buf[..2 * SLIDERS].iter().all(|x| *x != 7.0), "two frames of fifty, every channel written");
    assert!(buf[2 * SLIDERS..].iter().all(|x| *x == 7.0), "nothing past them");
}

// ---- The model: §18's, given what came back (§19) ----

/// What a test feeds the inputs on frame `f`, from the frame before's outputs: sound 1 as its
/// own voice a frame late and halved (a cable and a quiet module); sound 6, which the beat
/// never plays, as a slow ramp; sound 10 as its own voice a frame late; the rest garbage that
/// must not be read; and channel 17 as the send a frame late, turned over and quartered.
fn come_back(f: u64, before: &[f32; LOOP]) -> [f32; LOOP] {
    let mut io = [f32::NAN; LOOP];
    io[0] = before[0] * 0.5;
    io[5] = (f % 480) as f32 / 4800.0 - 0.05;
    io[9] = before[9];
    io[SEND] = before[SEND] * -0.25;
    io
}

/// Runs `cmds` a frame at a time in the 18-channel loop and holds every frame's mix and send
/// to the model's, which is told what came in, what `ROUTE` said and what the view says.
/// Returns the frames an outside effect ran on, and the frames one of the core's own did.
fn hold_loop_to_model(rate: u32, cmds: &[(u64, Cmd)], frames: u64) -> (usize, usize) {
    let h = Host::new(rate, 1);
    let mut m = Model::new();
    let mut routes = [0u32; 4];
    let mut before = [0f32; LOOP];
    let mut e_before = 0u32;
    let (mut outside, mut inside) = (0, 0);
    for f in 0..frames {
        let these = at(cmds, f);
        for c in these.iter().filter(|c| c.kind == CMD_ROUTE) {
            routes[c.a as usize] = c.value;
        }
        let input = come_back(f, &before);
        let mut io = input;
        frame(&h, &these, &mut io);
        let v = h.view();
        let tick = u32::from_le_bytes([v[0], v[1], v[2], v[3]]);
        let ticks = if f == 0 { 0 } else { tick.wrapping_sub(e_before) };
        e_before = tick;
        let heard = v[55];
        let sounds = u16::from_le_bytes([v[58], v[59]]);
        // §19: a returned sound takes its own voice's place; an effect ROUTE marks is heard
        // from channel 17, whether or not the core has a sound for it.
        let mut mixed = [0f32; 16];
        for t in 0..16 {
            // What is not a number is silence.
            mixed[t] = if routes[0] >> t & 1 == 0 { io[t] } else if input[t].is_finite() { input[t] } else { 0.0 };
        }
        let effect = if heard != 0 && routes[1] >> (heard - 1) & 1 == 1 {
            0x80 | heard
        } else if [1, 2, 3, 5, 6, 7, 8].contains(&heard) {
            heard
        } else {
            0
        };
        let back = if input[SEND].is_finite() { input[SEND] } else { 0.0 };
        let want = m.frame_looped(effect, ticks, rate, &mixed, sounds, v[27], back);
        assert_eq!(io[MIX].to_bits(), want.to_bits(), "rate {rate}, frame {f}: the mix {} against the model's {}", io[MIX], want);
        let mut send = 0.0f32;
        for t in (0..16).filter(|t| sounds >> t & 1 == 1) {
            send += mixed[t];
        }
        assert_eq!(io[SEND].to_bits(), send.to_bits(), "rate {rate}, frame {f}: the send");
        outside += (m.on & 0x80 != 0) as usize;
        inside += (m.on != 0 && m.on & 0x80 == 0) as usize;
        before = io;
    }
    (outside, inside)
}

/// §18's tour with §19's changes laid over it: three sounds returned from the start, one of
/// them (the snare's neighbour, sound 10) not; effects 4 and 13 from outside by default, then
/// the distortion and a sweep marked too while they are held, then nothing marked; the
/// returns changed mid-bar and taken away.
fn loop_tour(step: u64) -> Vec<(u64, Cmd)> {
    let mut c = tour(step);
    c.insert(0, (0, fx(12, 4)));
    c.insert(0, (0, fx(14, 13)));
    c.insert(0, (0, fx(15, 4)));
    c.insert(0, (0, route(0, 1 | 1 << 5 | 1 << 9)));
    c.insert(0, (0, route(1, 1 << 3 | 1 << 12)));
    c.push((3 * step + 40, route(1, 1 << 3 | 1 << 12 | 1 << 1))); // the distortion, while it is heard
    c.push((7 * step + 9, route(1, 1 << 3 | 1 << 5)));            // a sweep, while it is heard
    c.push((8 * step + 9, route(1, 1 << 3)));                     // and back to the core's, mid-sweep
    c.push((10 * step, route(0, 1 << 5)));
    c.push((12 * step + 30, route(1, 0)));                        // an outside effect unmarked while heard
    c.push((14 * step, route(1, 1 << 3 | 1 << 12)));
    c.push((20 * step, route(0, 0xffff & !(1 << 3))));
    c.push((26 * step, route(0, 0)));
    c.sort_by_key(|x| x.0);
    c
}

#[test]
fn the_loop_s_mix_and_send_are_the_model_s_bit_for_bit_at_three_rates() {
    for rate in [44_100u32, 48_000, 96_000] {
        let step = rate as u64 / 8; // 120 bpm
        let (outside, inside) = hold_loop_to_model(rate, &loop_tour(step), 32 * step);
        assert!(outside as u64 > 3 * step && inside as u64 > 6 * step, "rate {rate}: {outside} frames outside, {inside} inside");
    }
}

#[test]
fn the_loop_s_mix_and_send_are_the_model_s_on_edges_too() {
    let mut c = loop_tour(STEP);
    c.insert(0, (0, cmd(CMD_SOURCE, 0, 0, 1)));
    for s in 0..32 {
        c.push((s * STEP, cmd(CMD_CLOCK, 0, 0, 0)));
    }
    c.sort_by_key(|x| x.0);
    hold_loop_to_model(SR, &c, 32 * STEP);
}

// ---- §19's addition: the sliders out and in ----

fn unit(v: u16) -> f32 {
    v as f32 / 65_535.0
}
fn mark(h: &Host) -> (u16, u16) {
    let v = h.view();
    (u16::from_le_bytes([v[60], v[61]]), u16::from_le_bytes([v[62], v[63]]))
}

#[test]
fn the_slider_outputs_say_what_each_sound_was_last_hit_with_and_its_own_until_then() {
    // Sound 10 (the click) at 1000 and 2000, with step 2 keeping 111 and 222. Before any
    // hit every channel shows its sound's own; a tap shows the sound's own; the step shows
    // what it keeps; a slider moved afterwards shows only on a sound not yet hit.
    let h = Host::new(SR, 1);
    let mut io = [0f32; SLIDERS];
    // Play goes with the first frame, where the clock's first step boundary is (§5).
    frame(&h, &[sound(9, 0, 1000), sound(9, 1, 2000), on(9, 1), cmd(CMD_KEEP, 9, 1, 111 << 16 | 222), play()], &mut io);
    assert_eq!((io[A_OUT + 9], io[B_OUT + 9]), (unit(1000), unit(2000)), "not yet hit: its own");
    assert_eq!((io[A_OUT], io[B_OUT + 15]), (unit(32_768), unit(32_768)), "pi_init's middles");
    frame(&h, &[fire(9)], &mut io);
    assert_eq!((io[A_OUT + 9], io[B_OUT + 9]), (unit(1000), unit(2000)), "a tap: its own, from the frame of the hit");
    frame(&h, &[sound(9, 0, 5000), sound(3, 0, 6000)], &mut io);
    assert_eq!(io[A_OUT + 9], unit(1000), "held until its next hit");
    assert_eq!(io[A_OUT + 3], unit(6000), "a sound not yet hit follows its own");
    for _ in 3..STEP {
        frame(&h, &[], &mut io);
        assert_eq!(io[A_OUT + 9], unit(1000));
    }
    frame(&h, &[], &mut io); // frame 6000: step 2 arrives
    assert_eq!((io[A_OUT + 9], io[B_OUT + 9]), (unit(111), unit(222)), "a step: what it keeps");
    assert_eq!((unit(0), unit(65_535)), (0.0, 1.0), "0 to 1");
}

#[test]
fn a_slider_input_is_read_on_the_hit_and_only_for_a_sound_route_names() {
    // Inputs on every channel, A at a quarter and B at three quarters. Only sound 10's A is
    // routed: a tap of it plays A from the input and B its own, bit for bit the voice of an
    // engine whose slider was set to that value; sound 3, not routed, plays its own.
    let (h, want) = (Host::new(SR, 1), Host::new(SR, 1));
    let given = |io: &mut [f32; SLIDERS]| {
        io[A_OUT..B_OUT].fill(0.25);
        io[B_OUT..].fill(0.75);
    };
    let mut io = [0f32; SLIDERS];
    let mut ref_io = [0f32; SLIDERS];
    given(&mut io);
    frame(&h, &[route(2, 1 << 9), fire(9), fire(2)], &mut io);
    frame(&want, &[sound(9, 0, 16_384), fire(9), fire(2)], &mut ref_io);
    frame(&h, &[cmd(CMD_KEY_DOWN, 16, 0, 0), cmd(CMD_KEY_DOWN, 9, 0, 0)], &mut [0f32; 1]); // choose sound 10 (it plays, with no input in this layout)
    assert_eq!(mark(&h), (32_768, 32_768), "in a layout with no slider channels nothing is read");
    frame(&want, &[cmd(CMD_KEY_DOWN, 16, 0, 0), cmd(CMD_KEY_DOWN, 9, 0, 0)], &mut [0f32; 1]);
    given(&mut io);
    frame(&h, &[fire(9)], &mut io);
    frame(&want, &[fire(9)], &mut ref_io);
    assert_eq!(mark(&h), (16_384, 32_768), "the view shows what was used: A from the input, B its own");
    assert_eq!(mark(&want), (16_384, 32_768));
    for f in 0..2000 {
        // The input moves after the hit: nothing follows it until the next hit (D56).
        io[A_OUT..B_OUT].fill(0.9);
        frame(&h, &[], &mut io);
        frame(&want, &[], &mut ref_io);
        assert_eq!(bits(&io[..17]), bits(&ref_io[..17]), "frame {f}: the sound of slider A at 16384");
    }
    assert_eq!(mark(&h), (16_384, 32_768));
    // B routed as well, for sounds 10 and 3.
    given(&mut io);
    frame(&h, &[route(3, 1 << 9 | 1 << 2), fire(9)], &mut io);
    assert_eq!(mark(&h), (16_384, 49_151), "0.75 is 49151.25: to the nearest");
}

#[test]
fn a_slider_output_is_the_value_before_the_input_replaced_it() {
    // Out, through anything, and back in cannot hold itself: the output goes on saying the
    // instrument's own reckoning (the sound's own for a tap, what the step keeps for a step).
    let h = Host::new(SR, 1);
    let mut io = [0f32; SLIDERS];
    io[A_OUT + 9] = 1.0;
    frame(&h, &[route(2, 0xffff), route(3, 0xffff), sound(9, 0, 1000), on(9, 1), cmd(CMD_KEEP, 9, 1, 111 << 16 | 222), fire(9), play()], &mut io);
    assert_eq!(io[A_OUT + 9], unit(1000), "the output: the sound's own");
    frame(&h, &[cmd(CMD_KEY_DOWN, 16, 0, 0), cmd(CMD_KEY_DOWN, 9, 0, 0), cmd(CMD_KEY_UP, 9, 0, 0), cmd(CMD_KEY_UP, 16, 0, 0)], &mut [0f32; SLIDERS]);
    io[A_OUT + 9] = 1.0;
    io[B_OUT + 9] = 0.5;
    frame(&h, &[fire(9)], &mut io);
    assert_eq!(mark(&h), (65_535, 32_768), "the view: the input, 0.5 being 32767.5 and so 32768");
    assert_eq!((io[A_OUT + 9], io[B_OUT + 9]), (unit(1000), unit(32_768)));
    for _ in 3..=STEP {
        // To frame 6000, where step 2 arrives.
        io[A_OUT + 9] = 0.5;
        io[B_OUT + 9] = 0.0;
        frame(&h, &[], &mut io);
    }
    assert_eq!(mark(&h), (32_768, 0), "a step's hit takes the input whatever the step keeps");
    assert_eq!((io[A_OUT + 9], io[B_OUT + 9]), (unit(111), unit(222)), "and the output says what the step keeps");
}

#[test]
fn a_slider_input_is_held_to_0_to_1_and_what_is_not_a_number_is_0() {
    assert_eq!([slider_in(-3.0), slider_in(0.0), slider_in(1.0), slider_in(12.0)], [0, 0, 65_535, 65_535]);
    assert_eq!([slider_in(f32::NAN), slider_in(f32::INFINITY), slider_in(f32::NEG_INFINITY), slider_in(-0.0)], [0, 65_535, 0, 0]);
}

#[test]
fn a_slider_output_read_back_in_is_the_same_value_plainly_and_through_rack_s_volts() {
    // Every value a slider can hold: out as 0 to 1, and in again; and out as Rack's 0 to 10 V
    // and back. §19's first wording was "rounded down": plainly that loses none, but through
    // the volts 5 116 of the 65 536 come back one less, which is why it is to the nearest (D80).
    let mut down = 0;
    for v in 0..=65_535u16 {
        assert_eq!(slider_in(unit(v)), v, "plainly");
        let volts = core::hint::black_box(10.0 * unit(v));
        assert_eq!(slider_in(volts / 10.0), v, "through volts");
        down += ((volts / 10.0 * 65_535.0) as u16 != v) as u32;
    }
    assert_eq!(down, 5116, "what rounding down would have lost through the volts");
}

#[test]
fn split_into_other_blocks_a_loop_gives_the_same_fifty_channels() {
    // §3's rule, for the layout that is read as well as written: the same frames, commands
    // and inputs in blocks of 1, 7 and 128 give the same bits on every channel.
    let mut cmds = loop_tour(STEP);
    cmds.insert(0, (0, route(2, 0x0f0f)));
    cmds.insert(0, (0, route(3, 0x00ff)));
    cmds.push((2 * STEP + 5, sound(0, 0, 9000)));
    cmds.push((5 * STEP + 77, cmd(CMD_PARAM, 1, 0, 50_000)));
    cmds.sort_by_key(|x| x.0);
    let frames = 12 * STEP as usize;
    let input = |f: usize, c: usize| ((f * 31 + c * 17) % 201) as f32 / 200.0 - 0.25;
    let run = |block: usize| {
        let h = Host::new(SR, 1);
        let mut out = vec![0f32; frames * SLIDERS];
        for (i, x) in out.iter_mut().enumerate() {
            *x = input(i / SLIDERS, i % SLIDERS);
        }
        let mut start = 0;
        while start < frames {
            let n = block.min(frames - start);
            let these: Vec<Cmd> = cmds
                .iter()
                .filter(|c| (c.0 as usize) >= start && (c.0 as usize) < start + n)
                .map(|c| Cmd { frame: (c.0 as usize - start) as u32, ..c.1 })
                .collect();
            let mut ev = [Event::default(); CAP];
            unsafe {
                pi_process(h.e, n as u32, these.as_ptr(), these.len() as u32, ev.as_mut_ptr(), CAP as u32, out[start * SLIDERS..].as_mut_ptr(), SLIDERS as u32)
            };
            start += n;
        }
        (out, h.view())
    };
    let (one, view) = run(1);
    assert!(one.chunks(SLIDERS).any(|f| f[A_OUT] != f[A_OUT + 1]), "the slider outputs must move in this run");
    for block in [7, 128] {
        let (other, v) = run(block);
        assert_eq!(bits(&other), bits(&one), "blocks of {block}");
        assert_eq!(v, view);
    }
}

#[test]
fn a_load_shows_on_the_slider_outputs_of_the_sounds_not_yet_hit() {
    // A snapshot with sound 3's sliders at 111 and 222, loaded into an engine where sound 10
    // has been hit: sound 3's outputs follow the load, sound 10's stay at its last hit.
    let mut from = Host::new(SR, 1);
    from.block(1, &[sound(2, 0, 111), sound(2, 1, 222), sound(9, 0, 333)]);
    let snap = from.save();
    let mut h = Host::new(SR, 1);
    let mut io = [0f32; SLIDERS];
    frame(&h, &[sound(9, 0, 1000), fire(9)], &mut io);
    assert_eq!(h.load(&snap), 0);
    frame(&h, &[], &mut io);
    assert_eq!((io[A_OUT + 2], io[B_OUT + 2]), (unit(111), unit(222)), "not yet hit: the loaded sound's own");
    assert_eq!(io[A_OUT + 9], unit(1000), "hit before the load: what it was hit with");
}

#[test]
fn a_host_that_leaves_the_loop_while_an_outside_effect_ramps_out_hears_the_bus_as_it_is() {
    // Effect 4 from outside, held, with 0.5 on channel 17, and the click sounding. Then the
    // host asks for layout 17 (its cables were pulled): nothing can come back, so for the 2 ms
    // the effect takes to go, the mix is a twin's that never had the effect, bit for bit.
    let (h, twin) = (Host::new(SR, 1), Host::new(SR, 1));
    let start = [cmd(CMD_STEP, 9, 0, 1), play()];
    let mut io = [0f32; LOOP];
    io[SEND] = 0.5;
    frame(&h, &[route(1, 1 << 3), start[0], start[1], down(FX), down(3)], &mut io);
    frame(&twin, &start, &mut [0f32; 17]);
    for _ in 0..200 {
        io[SEND] = 0.5;
        frame(&h, &[], &mut io);
        frame(&twin, &[], &mut [0f32; 17]);
    }
    assert_eq!(unsafe { &(*h.e).bus }.probe(), (0x84, 1.0, 100.0, 0.0, 0.0), "effect 4, outside, full");
    let (mut ramping, mut sounding) = (0, 0);
    for f in 0..300 {
        let (mut a, mut b) = ([0f32; 17], [0f32; 17]);
        frame(&h, &[], &mut a);
        frame(&twin, &[], &mut b);
        assert_eq!(bits(&a), bits(&b), "frame {f}");
        ramping += (unsafe { &(*h.e).bus }.probe().0 != 0) as u32;
        sounding += (a[MIX] != 0.0) as u32;
    }
    assert!(ramping > 90 && ramping < 100 && sounding > 200, "{ramping} frames ramping out, {sounding} sounding");
}
