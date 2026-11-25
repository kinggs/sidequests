//! ENGINE.md §4, "designed 2026-11-25: one edge a beat", and §14, "designed 2026-11-25: the
//! tempo measured from the edges" (ABI 15; D64 item 2, D65 item 2, D100). Written from the two
//! sections' words and their hand-worked rows before the code (Session 34): every number below
//! is the section's, or worked by hand from its pseudo-code in the comment beside it.

use super::*;

const SR: u32 = 48_000;
const BEATS: u32 = 2; // `SOURCE` 2, `PI_SOURCE_BEATS`
const EDGES: u32 = 1;

fn steps(ev: &[(u64, Event)]) -> Vec<(u64, u32, u8)> {
    ev.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, e)| (*f, e.tick, e.step)).collect()
}

fn clock() -> Cmd {
    cmd(CMD_CLOCK, 0, 0, 0)
}

/// Frame 0: the stored tempo, `source`, a reset and play; then an edge on each frame of `at`.
fn edges_from_a_reset(mbpm: u32, source: u32, at: &[u64]) -> Vec<(u64, Cmd)> {
    let mut c = vec![
        (0, cmd(CMD_TEMPO, 0, 0, mbpm)),
        (0, cmd(CMD_SOURCE, 0, 0, source)),
        (0, cmd(CMD_RESET, 0, 0, 0)),
        (0, cmd(CMD_PLAY, 0, 0, 1)),
    ];
    c.extend(at.iter().map(|f| (*f, clock())));
    c.sort_by_key(|x| x.0);
    c
}

fn ext(h: &Host) -> u16 {
    let v = h.view();
    u16::from_le_bytes([v[30], v[31]])
}

// ---- §4: one edge a beat ----

#[test]
fn the_three_rows_of_section_4_by_the_frame_of_each_step() {
    // 48 kHz, a reset, then an edge every 24 000 frames (120 bpm), frames counted from the
    // first edge: the frame each step's tick 0 falls on, steps 0 to 8 (§4's table).
    let rows: [(u32, [u64; 9]); 3] = [
        // The guess is 24 000 frames: tick t at ceil(t × 24 000 / 384).
        (120_000, [0, 6_000, 12_000, 18_000, 24_000, 30_000, 36_000, 42_000, 48_000]),
        // The guess is 48 000: step 1 at 12 000; the second edge flushes ticks 192 to 383, so
        // steps 2 and 3 fire with step 4.
        (60_000, [0, 12_000, 24_000, 24_000, 24_000, 30_000, 36_000, 42_000, 48_000]),
        // The guess is 12 000: the clock holds at tick 383 from frame 11 969 to the edge.
        (240_000, [0, 3_000, 6_000, 9_000, 24_000, 30_000, 36_000, 42_000, 48_000]),
    ];
    for (mbpm, want) in rows {
        for block in [1u32, 128, 512] {
            let mut h = Host::new(SR, 1);
            let ev = h.run(48_001, block, &edges_from_a_reset(mbpm, BEATS, &[0, 24_000, 48_000]));
            let want: Vec<(u64, u32, u8)> = want.iter().enumerate().map(|(n, f)| (*f, 96 * n as u32, n as u8)).collect();
            assert_eq!(steps(&ev), want, "stored tempo {mbpm}, block {block}");
            assert_eq!(h.dropped(), 0);
        }
    }
}

#[test]
fn at_240_the_first_beat_holds_at_tick_383_from_frame_11_969() {
    // Frame f has `since` = f: want = min(383, f × 384 / 12 000). 11 968 × 384 / 12 000 =
    // 382.98; 11 969 × 384 / 12 000 = 383.0. The view's tick is the latest emitted.
    let c = edges_from_a_reset(240_000, BEATS, &[0, 24_000]);
    let mut h = Host::new(SR, 1);
    h.run(11_969, 128, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 382, "frames 0 to 11 968");
    h.run(1, 128, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 383, "frame 11 969");
    h.run(24_000 - 11_970, 512, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 383, "held to the edge");
}

#[test]
fn source_1_keeps_its_rule_the_first_step_has_no_period() {
    // One edge a step: no guess (D100 item 2). Edges at 0 and 6 000 with swing 48: the first
    // step's ticks 1 to 95 wait for the second edge, as §4 had it.
    let mut c = edges_from_a_reset(60_000, EDGES, &[0, 6_000]);
    c.insert(0, (0, cmd(CMD_SWING, 0, 0, 48)));
    c.insert(0, (0, cmd(CMD_STEP, 0, 1, 1)));
    let mut h = Host::new(SR, 1);
    let ev = h.run(5_999, 128, &c);
    assert_eq!(steps(&ev), [(0, 0, 0)]);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 0, "no tick past the edge's");
}

#[test]
fn a_reset_mid_beat_keeps_the_guess() {
    // Stored tempo 60 (a beat of 48 000 frames); edges at 0, 24 000 and 48 000 measure 24 000.
    // A reset at 50 000 (mid-beat) clears `measured` and the period and keeps `guess`: the
    // edge at 72 000 starts step 0 and its beat runs at 24 000, the measured beat, not the
    // stored tempo's 48 000 (which would put step 1 at 84 000 and flush 2 and 3 at 96 000).
    let mut c = edges_from_a_reset(60_000, BEATS, &[0, 24_000, 48_000, 72_000, 96_000]);
    c.push((50_000, cmd(CMD_RESET, 0, 0, 0)));
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(72_001, 128, &c);
    // Before the reset: row 60's steps, then step 9 is not reached (it would be at 54 000).
    assert_eq!(
        steps(&ev),
        [
            (0, 0, 0), (12_000, 96, 1), (24_000, 192, 2), (24_000, 288, 3), (24_000, 384, 4),
            (30_000, 480, 5), (36_000, 576, 6), (42_000, 672, 7), (48_000, 768, 8), (72_000, 0, 0),
        ]
    );
    assert_eq!(ext(&h), 0, "measured is cleared by the reset: no tempo before the second edge");
    let ev = h.run(24_000, 128, &c);
    assert_eq!(steps(&ev), [(78_000, 96, 1), (84_000, 192, 2), (90_000, 288, 3), (96_000, 384, 4)]);
    // 600 × 48 000 = 28 800 000; (28 800 000 + 12 000) / 24 000 = 1 200.5: 1 200.
    assert_eq!(ext(&h), 1_200);
}

#[test]
fn a_switch_off_a_beat_flushes_to_the_next_beat() {
    // The table at 120 bpm (a tick every 62.5 frames) to frame 9 000, inside grid step 1:
    // frames 0 to 8 999 emit ticks 0 to 143. The switch to beats emits nothing; the edge at
    // 9 500 flushes ticks 144 to 383 and emits 384: steps 2, 3 and 4 at once. The switch
    // cleared the guess, so the beat after runs at the stored tempo's, 24 000 frames: step 5
    // at 9 500 + 6 000.
    let mut c: Vec<(u64, Cmd)> = (0..16).map(|s| (0, cmd(CMD_STEP, 0, s, 1))).collect();
    c.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    c.push((9_000, cmd(CMD_SOURCE, 0, 0, BEATS)));
    c.push((9_500, clock()));
    let mut h = Host::new(SR, 1);
    let ev = h.run(15_501, 128, &c);
    assert_eq!(steps(&ev), [(0, 0, 0), (6_000, 96, 1), (9_500, 192, 2), (9_500, 288, 3), (9_500, 384, 4), (15_500, 480, 5)]);
}

#[test]
fn a_switch_from_edges_to_beats_clears_the_guess_and_measured() {
    // Edges a step at 6 000 apart measure a period of 6 000. The switch to beats at 13 000
    // clears `have_edge`, `period`, `measured` and `guess`: its first edge (at 15 000) runs at
    // the stored tempo's beat, 60 bpm, 48 000 frames, so step 1 of the beat is 12 000 later.
    let mut c = edges_from_a_reset(60_000, EDGES, &[0, 6_000, 12_000]);
    c.push((13_000, cmd(CMD_SOURCE, 0, 0, BEATS)));
    c.push((15_000, clock()));
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(27_001, 128, &c);
    // The third edge is tick 192; frame 12 999 has since 999, want 999 × 96 / 6 000 = 15, so
    // E is 208 at the switch, which emits nothing (frames 13 000 to 14 999 have no period).
    // The edge at 15 000 flushes ticks 208 to 383 and emits 384 (steps 3 and 4), then step 5
    // (tick 480) at 15 000 + ceil(96 × 48 000 / 384) = 27 000.
    assert_eq!(steps(&ev), [(0, 0, 0), (6_000, 96, 1), (12_000, 192, 2), (15_000, 288, 3), (15_000, 384, 4), (27_000, 480, 5)]);
    assert_eq!(ext(&h), 0, "measured cleared by the switch; one edge since");
}

#[test]
fn the_view_says_edges_for_beats_too_and_beats_are_not_saved() {
    let mut h = Host::new(SR, 1);
    let before = h.save();
    let g = h.generation();
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, BEATS)]);
    assert_eq!(h.view()[24] >> 2 & 1, 1, "flag 2: the source is edges");
    assert_eq!(h.save(), before, "the source is not saved");
    assert_eq!(h.generation(), g);
    // A value that is neither of the three sources is ignored.
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, 3)]);
    assert_eq!(h.view()[24] >> 2 & 1, 1, "3 is no source: still beats");
    // `pi_init` starts on the table.
    assert_eq!(Host::new(SR, 1).view()[24] >> 2 & 1, 0);
}

#[test]
fn on_beats_nothing_ticks_before_the_first_edge_and_the_edge_is_tick_0() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, BEATS), cmd(CMD_PLAY, 0, 0, 1)]);
    let ev = h.run(10, 1, &[]);
    assert!(steps(&ev).is_empty(), "no tick before the first edge");
    let ev: Vec<(u64, Event)> = h.block(1, &[clock()]).into_iter().map(|e| (0, e)).collect();
    assert_eq!(steps(&ev).len(), 1, "the edge is tick 0");
}

// ---- §14: the tempo measured from the edges ----

#[test]
fn ext_is_the_section_s_four_numbers() {
    // An edge a step every 6 000 frames at 48 kHz: (150 × 48 000 + 3 000) / 6 000 = 1 200.5.
    let mut h = Host::new(SR, 1);
    h.run(6_001, 128, &edges_from_a_reset(120_000, EDGES, &[0, 6_000]));
    assert_eq!(ext(&h), 1_200);

    // An edge a beat every 23 415 frames (123 bpm): (600 × 48 000 + 11 707) / 23 415 = 1 230.47.
    let mut h = Host::new(SR, 1);
    h.run(23_416, 128, &edges_from_a_reset(120_000, BEATS, &[0, 23_415]));
    assert_eq!(ext(&h), 1_230);

    // At 44.1 kHz an edge a step every 5 512 or 5 513 frames: (6 615 000 + 2 756) / 5 512 =
    // 1 200.6, and / 5 513 = 1 200.4.
    let at = [0u64, 5_512, 11_025, 16_537];
    let mut h = Host::new(44_100, 1);
    let c = edges_from_a_reset(120_000, EDGES, &at);
    h.run(5_513, 128, &c);
    assert_eq!(ext(&h), 1_200, "period 5 512");
    h.run(5_513, 128, &c);
    assert_eq!(ext(&h), 1_200, "period 5 513");
    h.run(5_512, 128, &c);
    assert_eq!(ext(&h), 1_200, "period 5 512 again");
}

#[test]
fn ext_is_0_on_the_table_and_before_the_second_edge() {
    let mut h = Host::new(SR, 1);
    h.run(30_000, 128, &[(0, cmd(CMD_PLAY, 0, 0, 1))]);
    assert_eq!(ext(&h), 0, "the table");
    for source in [EDGES, BEATS] {
        let mut h = Host::new(SR, 1);
        let c = edges_from_a_reset(120_000, source, &[0, 6_000]);
        h.run(5_999, 128, &c);
        assert_eq!(ext(&h), 0, "source {source}: one edge");
        h.run(2, 128, &c);
        assert_ne!(ext(&h), 0, "source {source}: two edges");
    }
}

#[test]
fn ext_is_0_once_an_edge_is_a_whole_period_late() {
    // Edges a step at 0 and 6 000 at 48 kHz. After a block ending on frame e, `since` is the
    // frames from the last edge to e, counting the edge's own frame: the view after frames 0
    // to 17 999 has since = 12 000 = 2 × period, still shown; one frame more, 12 001: 0.
    let c = edges_from_a_reset(120_000, EDGES, &[0, 6_000]);
    let mut h = Host::new(SR, 1);
    h.run(18_000, 128, &c);
    assert_eq!(ext(&h), 1_200, "since = 2 × period");
    h.run(1, 128, &c);
    assert_eq!(ext(&h), 0, "since = 2 × period + 1: a stopped clock");
    // And the same on beats: edges at 0 and 24 000, shown to 72 000 frames, then 0.
    let c = edges_from_a_reset(120_000, BEATS, &[0, 24_000]);
    let mut h = Host::new(SR, 1);
    h.run(72_000, 512, &c);
    assert_eq!(ext(&h), 1_200);
    h.run(1, 512, &c);
    assert_eq!(ext(&h), 0);
    // And back when the clock comes back: two edges on, measured again.
    let mut c = c;
    c.extend([(80_000, clock()), (86_000, clock())]);
    h.run(86_001 - 72_001, 512, &c);
    // The edge at 80 000 measured 56 000 (late), the one at 86 000 6 000: a beat of 6 000
    // frames is 480 bpm, (28 800 000 + 3 000) / 6 000 = 4 800.5.
    assert_eq!(ext(&h), 4_800);
}

#[test]
fn ext_is_held_to_65_535() {
    // An edge a step on every frame: a period of 1, (7 200 000 + 0) / 1, held to 65 535.
    let c = edges_from_a_reset(120_000, EDGES, &[0, 1, 2]);
    let mut h = Host::new(SR, 1);
    h.run(3, 1, &c);
    assert_eq!(ext(&h), 65_535);
}

#[test]
fn ext_is_left_out_of_the_text_and_the_tempo_stays_the_stored_one() {
    let c = edges_from_a_reset(97_500, EDGES, &[0, 6_000]);
    let mut h = Host::new(SR, 1);
    h.run(6_001, 128, &c);
    let v = h.view();
    assert_eq!(u32::from_le_bytes(v[4..8].try_into().unwrap()), 97_500, "bytes 4 to 7: the stored tempo");
    assert_ne!(ext(&h), 0);
    assert!(view_text(&v).contains(" tempo=97500 "));
    let mut z = v;
    z[30] = 0;
    z[31] = 0;
    assert_eq!(view_text(&v), view_text(&z), "the text leaves bytes 30 and 31 out");
}

#[test]
fn on_beats_the_play_key_sends_play_alone_as_on_edges() {
    // ⚠ Session 34's reading (§13: "on edges, `PLAY 1` alone (step 1 at the next edge)"; the
    // design does not name `SOURCE` 2). Edges a beat at 0 and 24 000, stopped; play pressed at
    // 31 000 (mid-step, mid-beat): no reset, so the clock keeps its count and its period, and the
    // pattern starts at the next step boundary the edges bring: tick 576 at 36 000. (First
    // written with the press at 30 000, which is step 5's own frame: a command lands before
    // the frame's ticks, so the pattern started there. The test was wrong, not the core.)
    let mut c = edges_from_a_reset(120_000, BEATS, &[0, 24_000]);
    c.retain(|(_, x)| x.kind != CMD_PLAY);
    c.push((31_000, cmd(CMD_KEY_DOWN, 21, 0, 0)));
    c.push((31_001, cmd(CMD_KEY_UP, 21, 0, 0)));
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(36_001, 128, &c);
    assert_eq!(steps(&ev), [(36_000, 576, 0)]);
}
