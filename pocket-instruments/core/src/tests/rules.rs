//! The rules in ENGINE.md that no fixture reaches, one test a rule. Session 1's model never
//! ran a tempo change, a reset inside a step, a block boundary or the snapshot.

use super::*;
use crate::crc::crc32;
use crate::seq::Rng;

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames, a tick 62.5

/// Track 0 on every step, playing from frame 0.
fn four_on_the_floor(extra: &[Cmd]) -> Vec<(u64, Cmd)> {
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, cmd(CMD_STEP, 0, s, 1))).collect();
    c.extend(extra.iter().map(|x| (0, *x)));
    c.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    c
}

fn steps(ev: &[(u64, Event)]) -> Vec<(u64, u32, u8)> {
    ev.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, e)| (*f, e.tick, e.step)).collect()
}

fn trigs(ev: &[(u64, Event)]) -> Vec<(u64, u32, u8)> {
    ev.iter().filter(|(_, e)| e.kind == EV_TRIG).map(|(f, e)| (*f, e.tick, e.step)).collect()
}

#[test]
fn the_records_and_the_engine_have_the_sizes_the_header_says() {
    assert_eq!(pi_abi_version(), 8);
    assert_eq!(size_of::<Cmd>(), 12);
    assert_eq!(size_of::<Event>(), 12);
    // The upper bound is the hosts' fixed room for one engine: 4 KiB before the snapshot in
    // harness/trace.test.mjs and before the events in web/worklet.js, and Probe.cpp's buffer.
    // It was 512 until the drums (752 bytes), 1 KiB until all sixteen voices (1 416), and
    // 2 KiB until each track had a sample beside its voice (D50). Session 21 (§20: what
    // each step keeps, about 1 KiB) took it from 2 448 to the number in ENGINE.md §8.
    assert!(pi_size() >= 316 - 16 && pi_size() <= 4096, "pi_size is {}", pi_size());
    assert!(pi_align() <= 8);
}

#[test]
fn init_refuses_bad_memory() {
    // Room for the engine and one more word, so each refusal below is for its own reason and
    // not for size. (It was a fixed 1 KiB, which the engine outgrew with all sixteen voices.)
    let size = pi_size();
    let mut mem = vec![0u64; size as usize / 8 + 2];
    let p = mem.as_mut_ptr().cast::<u8>();
    unsafe {
        assert!(pi_init(core::ptr::null_mut(), size, SR, 1).is_null());
        assert!(pi_init(p, size - 1, SR, 1).is_null());
        assert!(pi_init(p.add(1), size, SR, 1).is_null(), "misaligned");
        assert!(pi_init(p, size, 0, 1).is_null(), "no sample rate");
        assert!(!pi_init(p, pi_size(), SR, 1).is_null());
    }
}

#[test]
fn xorshift_gives_the_draws_the_spec_lists() {
    let mut r = Rng::new(1);
    assert_eq!([r.draw(), r.draw(), r.draw(), r.draw()], [270369, 67634689, 2647435461, 307599695]);
}

#[test]
fn a_seed_of_zero_is_replaced() {
    let h = Host::new(SR, 0);
    assert_eq!(h.save()[12..16], 0x9E37_79B9u32.to_le_bytes());
}

#[test]
fn it_starts_stopped_and_play_waits_for_the_next_step() {
    let mut h = Host::new(SR, 1);
    let mut cmds: Vec<(u64, Cmd)> = (0..16).map(|s| (0, cmd(CMD_STEP, 0, s, 1))).collect();
    cmds.push((9000, cmd(CMD_PLAY, 0, 0, 1))); // halfway through grid step 1
    cmds.push((9001, cmd(CMD_PLAY, 0, 0, 1))); // already playing: nothing
    let ev = h.run(18_001, 128, &cmds);
    // Grid step 2 is the first boundary after the press; the pattern starts from step 0 there.
    assert_eq!(steps(&ev), [(12_000, 192, 0), (18_000, 288, 1)]);
}

#[test]
fn a_tempo_change_keeps_the_phase() {
    let mut h = Host::new(SR, 1);
    let mut cmds = four_on_the_floor(&[]);
    cmds.push((9000, cmd(CMD_TEMPO, 0, 0, 60_000))); // halfway through step 1; a step is now 12000
    let ev = h.run(27_002, 128, &cmds);
    // 15 001, not 15 000. A command at frame f lands before the clock's advance for f (§3),
    // and that advance is the stretch of time from f - 1 to f. So the last 2999 frames of
    // step 1 were at the old tempo, not 3000, and 3001 old frames are 6002 new ones. The
    // first cut of this test expected 15 000; §4's rule decides, and the cost is under one
    // frame, once, for each tempo change. (LEARNINGS, Session 2.)
    assert_eq!(steps(&ev), [(0, 0, 0), (6000, 96, 1), (15_001, 192, 2), (27_001, 288, 3)]);
}

#[test]
fn tempo_set_after_a_reset_in_the_same_frame_starts_on_the_grid() {
    // The fault Session 1's model found in the first draft (§4, `primed`).
    for rate in [44_100u32, 48_000, 96_000] {
        let mut h = Host::new(rate, 1);
        let mut cmds = vec![(0, cmd(CMD_RESET, 0, 0, 0)), (0, cmd(CMD_TEMPO, 0, 0, 97_300))];
        cmds.extend(four_on_the_floor(&[]));
        let f = |n: u64| (n * rate as u64 * 15_000).div_ceil(97_300);
        let ev = h.run(f(8) + 1, 512, &cmds);
        let want: Vec<(u64, u32, u8)> = (0..=8).map(|n| (f(n), n as u32 * 96, n as u8)).collect();
        assert_eq!(steps(&ev), want, "{rate}");
    }
}

#[test]
fn tempo_is_clamped() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_TEMPO, 0, 0, 1)]);
    assert_eq!(h.save()[16..20], 30_000u32.to_le_bytes());
    h.block(1, &[cmd(CMD_TEMPO, 0, 0, u32::MAX)]);
    assert_eq!(h.save()[16..20], 300_000u32.to_le_bytes());
}

#[test]
fn a_sample_rate_change_keeps_the_phase() {
    let mut h = Host::new(SR, 1);
    let cmds = four_on_the_floor(&[]);
    let mut ev = h.run(9000, 128, &cmds); // halfway through step 1
    unsafe { pi_set_sample_rate(h.e, 96_000) }; // half a step is now 6000 frames
    ev.extend(h.run(18_002, 128, &[]));
    // 15 001 for the same reason as the tempo change above: frames 0 to 8999 are 8999
    // advances, so 3001 frames of step 1 were left at the old rate, 6002 at the new one.
    assert_eq!(steps(&ev), [(0, 0, 0), (6000, 96, 1), (15_001, 192, 2), (27_001, 288, 3)]);
    unsafe { pi_set_sample_rate(h.e, 0) }; // ignored
    assert_eq!(steps(&h.run(12_000, 128, &[])), [(39_001, 384, 4)]);
}

#[test]
fn reset_inside_a_step_cancels_the_pending_trigger_and_restarts_at_once() {
    let mut h = Host::new(SR, 1);
    let mut cmds = four_on_the_floor(&[cmd(CMD_SWING, 0, 0, 48)]);
    // Grid step 1 starts at 6000 and its trigger is due at tick 144, frame 9000.
    cmds.push((7000, cmd(CMD_RESET, 0, 0, 0)));
    let ev = h.run(13_001, 128, &cmds);
    assert_eq!(steps(&ev), [(0, 0, 0), (6000, 96, 1), (7000, 0, 0), (13_000, 96, 1)]);
    // Step 1's trigger never fires; step 0 fires again on the reset's own frame.
    assert_eq!(trigs(&ev), [(0, 0, 0), (7000, 0, 0)]);
}

#[test]
fn stop_cancels_a_pending_trigger_and_play_starts_from_step_0() {
    let mut h = Host::new(SR, 1);
    let mut cmds = four_on_the_floor(&[cmd(CMD_SWING, 0, 0, 48)]);
    cmds.push((7000, cmd(CMD_PLAY, 0, 0, 0)));
    cmds.push((7001, cmd(CMD_PLAY, 0, 0, 1)));
    let ev = h.run(18_001, 128, &cmds);
    // The grid kept running: the restart is on grid step 2, tick 192, and grid step 3 swings.
    assert_eq!(steps(&ev), [(0, 0, 0), (6000, 96, 1), (12_000, 192, 0), (18_000, 288, 1)]);
    assert_eq!(trigs(&ev), [(0, 0, 0), (12_000, 192, 0)]);
}

#[test]
fn swing_is_read_at_the_boundary_and_the_step_when_it_fires() {
    let mut h = Host::new(SR, 1);
    let mut cmds = four_on_the_floor(&[cmd(CMD_SWING, 0, 0, 48)]);
    cmds.push((6500, cmd(CMD_SWING, 0, 0, 0))); // too late for grid step 1
    cmds.push((7000, cmd(CMD_STEP, 0, 1, 0))); // step 1 turned off before it fires
    cmds.push((7500, cmd(CMD_STEP, 3, 1, 1))); // and another track turned on
    let ev = h.run(12_000, 128, &cmds);
    let t: Vec<(u64, u32, u8, u8)> =
        ev.iter().filter(|(_, e)| e.kind == EV_TRIG).map(|(f, e)| (*f, e.tick, e.track, e.step)).collect();
    assert_eq!(t, [(0, 0, 0, 0), (9000, 144, 3, 1)]);
}

#[test]
fn commands_keep_array_order_whatever_their_frames_say() {
    let mut h = Host::new(SR, 1);
    // PLAY carries a frame past the block: it lands on the last frame, and so after tick 0.
    let late = Cmd { frame: 99, ..cmd(CMD_PLAY, 0, 0, 1) };
    // The frame of this STEP is lower than its neighbour's: it lands with the neighbour.
    let back = Cmd { frame: 0, ..cmd(CMD_STEP, 0, 1, 1) };
    assert!(h.block(4, &[late, back]).is_empty());
    assert_eq!(h.generation(), 1, "the STEP was applied");
    let ev = h.run(12_000, 512, &[]);
    assert_eq!(steps(&ev), [(6000, 96, 0), (12_000, 192, 1)]);
    assert_eq!(trigs(&ev), [(12_000, 192, 1)]);
}

#[test]
fn unknown_reserved_and_out_of_range_commands_are_ignored() {
    let mut h = Host::new(SR, 1);
    let before = h.save();
    h.block(
        8,
        &[
            cmd(0, 0, 0, 1),
            cmd(200, 1, 2, 3),
            // 32 to 34 were reserved until ABI 4 made them keys. A tap of key 6 and a slider
            // sent the value it shows change nothing saved. (Until Session 11 the PARAM here
            // was 40 000, which moved nothing only because no snapshot held a slider.)
            cmd(32, 5, 0, 0),          // KEY_DOWN
            cmd(33, 5, 0, 0),          // KEY_UP
            cmd(34, 0, 0, 32_768),     // PARAM, at slider A's shown value
            cmd(CMD_STEP, 16, 0, 1),   // no such track
            cmd(CMD_STEP, 0, 16, 1),   // no such step
            cmd(CMD_PROB, 255, 0, 50), // no such track
            cmd(CMD_SOURCE, 0, 0, 7),  // no such source
            cmd(CMD_CLOCK, 0, 0, 0),   // an edge while on the table
        ],
    );
    assert_eq!(h.save(), before);
    assert_eq!(h.generation(), 0);
}

#[test]
fn magnitudes_are_clamped() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_SWING, 0, 0, 90), cmd(CMD_LENGTH, 0, 0, 0), cmd(CMD_PROB, 2, 3, 900), cmd(CMD_STEP, 2, 3, 7)]);
    let s = h.save();
    assert_eq!((s[20], s[21]), (1, 48));
    assert_eq!(s[56 + 16 * 2 + 3], 100);
    assert_eq!(u16::from_le_bytes([s[24 + 4], s[24 + 5]]), 1 << 3);
    h.block(1, &[cmd(CMD_LENGTH, 0, 0, 99)]);
    assert_eq!(h.save()[20], 16);
}

#[test]
fn generation_moves_only_when_a_snapshot_would_differ() {
    let mut h = Host::new(SR, 1);
    let mut g = h.generation();
    let mut moved = |h: &mut Host, c: Cmd| {
        h.block(1, &[c]);
        let now = h.generation();
        let m = now != g;
        g = now;
        m
    };
    assert!(moved(&mut h, cmd(CMD_STEP, 1, 1, 1)));
    assert!(!moved(&mut h, cmd(CMD_STEP, 1, 1, 1)), "already on");
    assert!(moved(&mut h, cmd(CMD_PROB, 1, 1, 40)));
    assert!(!moved(&mut h, cmd(CMD_PROB, 1, 1, 40)));
    assert!(moved(&mut h, cmd(CMD_SWING, 0, 0, 10)));
    assert!(moved(&mut h, cmd(CMD_LENGTH, 0, 0, 5)));
    assert!(moved(&mut h, cmd(CMD_TEMPO, 0, 0, 90_000)));
    assert!(!moved(&mut h, cmd(CMD_TEMPO, 0, 0, 90_000)));
    for c in [cmd(CMD_PLAY, 0, 0, 1), cmd(CMD_RESET, 0, 0, 0), cmd(CMD_SOURCE, 0, 0, 1), cmd(CMD_CLOCK, 0, 0, 0)] {
        assert!(!moved(&mut h, c), "command {} is not saved", c.kind);
    }
}

#[test]
fn a_full_event_buffer_drops_and_counts() {
    let h = Host::new(SR, 1);
    let mut cmds: Vec<Cmd> = (0..16).map(|t| cmd(CMD_STEP, t, 0, 1)).collect();
    cmds.push(cmd(CMD_PLAY, 0, 0, 1));
    let mut ev = [Event::default(); 4];
    let n = unsafe { pi_process(h.e, 1, cmds.as_ptr(), cmds.len() as u32, ev.as_mut_ptr(), 4, core::ptr::null_mut(), 0) };
    assert_eq!(n, 4); // STEP and three of the sixteen triggers
    assert_eq!((ev[0].kind, ev[3].kind, ev[3].track), (EV_STEP, EV_TRIG, 2));
    assert_eq!(h.dropped(), 13);
    // No buffer at all is the same thing with room for none.
    let n = unsafe { pi_process(h.e, 6000, core::ptr::null(), 0, core::ptr::null_mut(), 64, core::ptr::null_mut(), 0) };
    assert_eq!((n, h.dropped()), (0, 14));
}

// ---- external edges (§4) ----

fn on_edges(swing: u32) -> Vec<(u64, Cmd)> {
    let mut c = vec![(0, cmd(CMD_SOURCE, 0, 0, 1))];
    c.extend(four_on_the_floor(&[cmd(CMD_SWING, 0, 0, swing)]));
    c
}

fn edges(cmds: &mut Vec<(u64, Cmd)>, at: &[u64]) {
    cmds.extend(at.iter().map(|f| (*f, cmd(CMD_CLOCK, 0, 0, 0))));
    cmds.sort_by_key(|c| c.0);
}

#[test]
fn on_edges_tick_0_is_the_edge_and_the_rest_are_interpolated() {
    let mut h = Host::new(SR, 1);
    let mut cmds = on_edges(32);
    edges(&mut cmds, &[10, 1010, 2010, 3010]);
    let ev = h.run(4000, 128, &cmds);
    assert_eq!(steps(&ev), [(10, 0, 0), (1010, 96, 1), (2010, 192, 2), (3010, 288, 3)]);
    // Tick t falls ceil(t * period / 96) frames after the edge: 32 * 1000 / 96 = 333.3.
    assert_eq!(trigs(&ev), [(10, 0, 0), (1344, 128, 1), (2010, 192, 2), (3344, 320, 3)]);
}

#[test]
fn an_early_edge_flushes_in_order() {
    let mut h = Host::new(SR, 1);
    let mut cmds = on_edges(48);
    // Period 1000, then the third edge comes 300 frames after the second: grid step 1's
    // trigger (tick 144, due 500 frames in) has not fired. It fires with the new step, first.
    edges(&mut cmds, &[0, 1000, 1300]);
    let ev = h.run(1301, 128, &cmds);
    let all: Vec<(u64, String)> = ev.iter().map(|(f, e)| (*f, line(e))).collect();
    let want = [(0, "0 step 0\n"), (0, "0 trig 0 0\n"), (1000, "96 step 1\n"), (1300, "144 trig 0 1\n"), (1300, "192 step 2\n"), (1300, "192 trig 0 2\n")];
    assert_eq!(all, want.map(|(f, s)| (f, s.to_string())));
}

#[test]
fn a_late_clock_holds_and_a_stopped_one_fires_nothing() {
    let mut h = Host::new(SR, 1);
    let mut cmds = on_edges(48);
    edges(&mut cmds, &[0, 1000, 50_000]);
    let ev = h.run(60_000, 512, &cmds);
    // Grid step 1 interpolates at the old period and then waits at tick 95 for 48 000 frames.
    assert_eq!(steps(&ev), [(0, 0, 0), (1000, 96, 1), (50_000, 192, 2)]);
    assert_eq!(trigs(&ev), [(0, 0, 0), (1500, 144, 1), (50_000, 192, 2)]);
}

#[test]
fn on_edges_a_reset_waits_for_the_next_edge_and_forgets_the_period() {
    let mut h = Host::new(SR, 1);
    let mut cmds = on_edges(48);
    edges(&mut cmds, &[0, 1000, 2000, 2600, 3600, 4600]);
    cmds.push((2300, cmd(CMD_RESET, 0, 0, 0)));
    cmds.sort_by_key(|c| c.0);
    let ev = h.run(5200, 128, &cmds);
    assert_eq!(steps(&ev), [(0, 0, 0), (1000, 96, 1), (2000, 192, 2), (2600, 0, 0), (3600, 96, 1), (4600, 192, 2)]);
    // After the reset, grid step 1's swing is on time from the new period (1000).
    assert_eq!(
        trigs(&ev),
        [(0, 0, 0), (1500, 144, 1), (2000, 192, 2), (2600, 0, 0), (4100, 144, 1), (4600, 192, 2)]
    );
}

#[test]
fn switching_source_keeps_the_tick_count() {
    let mut h = Host::new(SR, 1);
    let mut cmds = four_on_the_floor(&[]);
    cmds.push((9000, cmd(CMD_SOURCE, 0, 0, 1))); // inside grid step 1
    cmds.push((9500, cmd(CMD_CLOCK, 0, 0, 0))); // finishes step 1, starts step 2
    cmds.push((10_000, cmd(CMD_SOURCE, 0, 0, 0))); // back: the table carries on from tick 193
    let ev = h.run(22_000, 128, &cmds);
    // The edge emitted tick 192, so the table starts at 193 with nothing accumulated and
    // step 3 (tick 288) is 96 ticks on: 6000 advances, the first of them frame 10 000's own.
    // The switch itself emits nothing. (The first cut of this test counted 95 ticks.)
    assert_eq!(steps(&ev), [(0, 0, 0), (6000, 96, 1), (9500, 192, 2), (15_999, 288, 3), (21_999, 384, 4)]);
}

// ---- the snapshot (§8) ----

fn busy() -> Host {
    let mut h = Host::new(SR, 77);
    h.block(
        1,
        &[
            cmd(CMD_TEMPO, 0, 0, 133_700),
            cmd(CMD_LENGTH, 0, 0, 11),
            cmd(CMD_SWING, 0, 0, 17),
            cmd(CMD_STEP, 0, 0, 1),
            cmd(CMD_STEP, 15, 15, 1),
            cmd(CMD_STEP, 3, 9, 1),
            cmd(CMD_PROB, 15, 15, 1),
            cmd(CMD_PROB, 0, 1, 99),
        ],
    );
    h
}

#[test]
fn crc32_is_the_zip_one() {
    assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    assert_eq!(crc32(b""), 0);
}

#[test]
fn the_snapshot_has_the_layout_the_spec_gives() {
    let s = busy().save();
    assert_eq!(&s[0..4], b"PKIN");
    assert_eq!(s[4..12], [4, 0, 1, 0, 0xa8, 5, 0, 0]); // version 4, kind 1, payload 1448 (§20)
    assert_eq!(s[12..16], 77u32.to_le_bytes());
    assert_eq!(s[16..20], 133_700u32.to_le_bytes());
    assert_eq!(s[20..24], [11, 17, 0, 0]);
    let mut steps = [0u8; 32];
    steps[0] = 1; // track 0, step 0
    steps[2 * 3 + 1] = 1 << 1; // track 3, step 9
    steps[2 * 15 + 1] = 1 << 7; // track 15, step 15
    assert_eq!(s[24..56], steps);
    let mut prob = [100u8; 256];
    prob[1] = 99;
    prob[255] = 1;
    assert_eq!(s[56..312], prob);
    // 312 to 383, what version 2 adds, and 384 to 403, what version 3 adds, are held in
    // tests/snapshot.rs; 404 to 1459, version 4's, in tests/keep.rs.
    assert_eq!(s[1460..1464], crc32(&s[..1460]).to_le_bytes());
}

#[test]
fn save_needs_room() {
    let h = busy();
    let mut b = [0u8; SNAP];
    assert_eq!(unsafe { pi_save(h.e, b.as_mut_ptr(), SNAP as u32 - 1) }, 0);
    assert_eq!(b, [0u8; SNAP]);
}

#[test]
fn load_replaces_the_pattern_and_leaves_the_playhead() {
    let snap = busy().save();
    let mut h = Host::new(SR, 1);
    let ev = h.run(9000, 128, &four_on_the_floor(&[]));
    assert_eq!(steps(&ev).len(), 2);
    let g = h.generation();
    assert_eq!(h.load(&snap), OK);
    assert_ne!(h.generation(), g);
    assert_eq!(h.save(), snap, "it saves what it loaded");
    // Still playing, still inside grid step 1; the next step is 2, at the loaded tempo's pace.
    let ev = h.run(3000 * 120_000 / 133_700 + 2, 128, &[]);
    assert_eq!(steps(&ev).iter().map(|s| (s.1, s.2)).collect::<Vec<_>>(), [(192, 2)]);
    // Longer than a snapshot is fine: the rest is the host's wrapper.
    let mut long = snap.to_vec();
    long.extend([9, 9, 9]);
    assert_eq!(h.load(&long), OK);
}

#[test]
fn every_corrupted_byte_is_refused_and_changes_nothing() {
    let snap = busy().save();
    let mut h = Host::new(SR, 5);
    h.block(1, &[cmd(CMD_STEP, 7, 7, 1)]);
    let before = h.save();
    let g = h.generation();
    for i in 0..SNAP {
        for bit in [0x01u8, 0x80] {
            let mut bad = snap;
            bad[i] ^= bit;
            let r = h.load(&bad);
            let want = match (i, bit) {
                // Until Session 21, version 3 with its low bit flipped said 2, a version this
                // core wrote, and was refused by version 2's payload size (§8's order).
                // Version 4 with it flipped says 5, which no core wrote.
                (0..4 | 6..8, _) => ERR_MAGIC,
                (4..6, _) => ERR_VERSION,
                (8..12, _) => ERR_SIZE,
                _ => ERR_CRC,
            };
            assert_eq!(r, want, "byte {i} bit {bit:#x}");
        }
    }
    for len in [0, 11, 12, 100, 315, SNAP_V1, SNAP_V2, SNAP_V3, SNAP - 1] {
        assert_eq!(h.load(&snap[..len]), ERR_SIZE, "length {len}");
    }
    assert_eq!(unsafe { pi_load(h.e, core::ptr::null(), SNAP as u32) }, ERR_SIZE);
    assert_eq!(h.save(), before);
    assert_eq!(h.generation(), g);
}

#[test]
fn a_newer_version_is_refused_even_with_a_good_checksum() {
    let mut s = busy().save();
    s[4] = 5;
    let crc = crc32(&s[..SNAP - 4]);
    s[SNAP - 4..].copy_from_slice(&crc.to_le_bytes());
    assert_eq!(Host::new(SR, 1).load(&s), ERR_VERSION);
}

#[test]
fn values_no_core_writes_are_clamped_on_load() {
    let mut s = busy().save();
    s[16..20].copy_from_slice(&5u32.to_le_bytes()); // tempo
    s[20] = 0; // length
    s[21] = 200; // swing
    s[56] = 255; // a probability
    s[12..16].copy_from_slice(&0u32.to_le_bytes()); // seed
    let crc = crc32(&s[..SNAP - 4]);
    s[SNAP - 4..].copy_from_slice(&crc.to_le_bytes());
    let mut h = Host::new(SR, 1);
    assert_eq!(h.load(&s), OK);
    let t = h.save();
    assert_eq!(t[16..20], 30_000u32.to_le_bytes());
    assert_eq!((t[20], t[21], t[56]), (1, 48, 100));
    assert_eq!(t[12..16], 0x9E37_79B9u32.to_le_bytes());
}
