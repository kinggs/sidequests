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
    // Session 34's reading (§13: "on edges, `PLAY 1` alone (step 1 at the next edge)"; the
    // design does not name `SOURCE` 2), kept by D101 item 1, which rules where that play
    // begins. Edges a beat at 0, 24 000 and 48 000, stopped; play pressed at 31 000 (mid-step,
    // mid-beat): no reset, so the clock keeps its count and its period.
    //
    // Worked again by hand in Session 35, by D101 item 1 ("play waits for the beat"), before
    // the code: the pattern starts on the next tick that is a multiple of 384, the edge at
    // 48 000 (frame 47 999 has since 23 999: 23 999 × 384 / 24 000 = 383.98, so tick 767 is
    // the last before the edge, and the edge emits tick 768). Session 34 held step 0 at tick
    // 576, frame 36 000, the next step boundary; that was its reading, replaced by the ruling.
    // (Session 34 first wrote the press at 30 000, which is step 5's own frame: a command lands
    // before the frame's ticks. The press stays at 31 000.)
    let mut c = edges_from_a_reset(120_000, BEATS, &[0, 24_000, 48_000]);
    c.retain(|(_, x)| x.kind != CMD_PLAY);
    c.push((31_000, cmd(CMD_KEY_DOWN, 21, 0, 0)));
    c.push((31_001, cmd(CMD_KEY_UP, 21, 0, 0)));
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(48_001, 128, &c);
    assert_eq!(steps(&ev), [(48_000, 768, 0)]);
}

// ---- §4, "Ruled 2026-11-25 after Session 34's review" (D101): written by hand from the
// ruling's words and cases before the code (Session 35). Each case below was worked from §4's
// pseudo-code with the ruling's change; the arithmetic is in the comment beside it. ----

/// The steps at or after frame `from`.
fn steps_from(ev: &[(u64, Event)], from: u64) -> Vec<(u64, u32, u8)> {
    steps(ev).into_iter().filter(|s| s.0 >= from).collect()
}

#[test]
fn ruling_1_on_beats_play_waits_for_the_beat() {
    // D101 item 1's case: 48 kHz, an edge every 24 000 frames, the stored tempo 120, `PLAY 1`
    // at frame 30 001. The edge at 0 is tick 0 (the guess 24 000: the stored tempo's beat), the
    // edge at 24 000 tick 384 (measured 24 000); frame 30 000 has since 6 000, want 96: tick
    // 480. Play lands at 30 001; the next tick that is a multiple of 384 is 768, emitted by the
    // edge at 48 000. Step 1 (tick 864) at 48 000 + ceil(96 × 24 000 / 384) = 54 000. (As
    // built: tick 576, frame 36 000.)
    for block in [1u32, 128, 512] {
        let mut c = edges_from_a_reset(120_000, BEATS, &[0, 24_000, 48_000]);
        c.retain(|(_, x)| x.kind != CMD_PLAY);
        c.push((30_001, cmd(CMD_PLAY, 0, 0, 1)));
        c.sort_by_key(|x| x.0);
        let mut h = Host::new(SR, 1);
        let ev = h.run(54_001, block, &c);
        assert_eq!(steps(&ev), [(48_000, 768, 0), (54_000, 864, 1)], "block {block}");
    }
}

#[test]
fn ruling_1_leaves_one_edge_a_step_and_the_table_starting_on_the_next_step() {
    // A guard that passes on the old core too: only `SOURCE` 2 waits for a beat. One edge a
    // step at 0, 6 000, 12 000, 18 000, `PLAY 1` at 7 000 (inside step 1): step 0 is tick 192,
    // the edge at 12 000. The table at 120 (a step every 6 000 frames), `PLAY 1` at 7 000: step
    // 0 is tick 192 on frame ceil(192 × 625 × 48 000 / 480 000) = 12 000.
    let mut c = edges_from_a_reset(120_000, EDGES, &[0, 6_000, 12_000, 18_000]);
    c.retain(|(_, x)| x.kind != CMD_PLAY);
    c.push((7_000, cmd(CMD_PLAY, 0, 0, 1)));
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(18_001, 128, &c);
    assert_eq!(steps(&ev), [(12_000, 192, 0), (18_000, 288, 1)], "one edge a step");

    let mut h = Host::new(SR, 1);
    let ev = h.run(18_001, 128, &[(7_000, cmd(CMD_PLAY, 0, 0, 1))]);
    assert_eq!(steps(&ev), [(12_000, 192, 0), (18_000, 288, 1)], "the table");
}

#[test]
fn ruling_2_an_edge_after_a_pause_runs_its_beat_at_the_guess() {
    // D101 item 2's case: the same clock (stored tempo 120, edges at 0 and 24 000, which
    // measure 24 000), then no edge for 120 000 frames. The clock holds at tick 767 from frame
    // 47 999. The edge at 144 000 has since 120 000 > 2 × 24 000: it does not measure; period
    // becomes the guess, 24 000, and `measured` is cleared. It emits tick 768 (step 8); the
    // three steps after it fall 6 000, 12 000 and 18 000 frames on; the edge at 168 000 is
    // step 12 and measures 24 000 again. (As built: period 120 000, step 9 due at 174 000, so
    // steps 9 to 12 fire together at 168 000.)
    let c = edges_from_a_reset(120_000, BEATS, &[0, 24_000, 144_000, 168_000]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(144_001, 128, &c);
    assert_eq!(steps_from(&ev, 144_000), [(144_000, 768, 8)]);
    assert_eq!(ext(&h), 0, "the edge after the pause did not measure");
    let ev = h.run(24_000, 128, &c);
    assert_eq!(steps(&ev), [(150_000, 864, 9), (156_000, 960, 10), (162_000, 1_056, 11), (168_000, 1_152, 12)]);
    // 600 × 48 000 / 24 000 = 1 200.
    assert_eq!(ext(&h), 1_200, "the next edge measures again");
}

#[test]
fn ruling_2_the_guess_is_the_last_beat_measured_not_the_stored_tempo() {
    // Stored tempo 60 (a beat of 48 000 frames), so the guess and the stored tempo differ:
    // edges at 0 and 24 000 measure 24 000 (the guess). The edge at 144 000 (since 120 000 >
    // 48 000) takes period = guess = 24 000: steps 9, 10, 11 at 150 000, 156 000, 162 000
    // (the stored tempo's beat would put them 12 000 apart; as built, 30 000 apart).
    let c = edges_from_a_reset(60_000, BEATS, &[0, 24_000, 144_000]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(162_001, 128, &c);
    assert_eq!(steps_from(&ev, 144_000), [(144_000, 768, 8), (150_000, 864, 9), (156_000, 960, 10), (162_000, 1_056, 11)]);
}

#[test]
fn ruling_2_with_no_guess_the_beat_after_a_pause_is_the_stored_tempo_s() {
    // Stored tempo 120, one edge at 0 (its beat at the stored tempo's, 24 000: nothing
    // measured, so the guess stays 0), then the next at 60 000: since 60 000 > 2 × 24 000. The
    // guess is 0, so the period is the stored tempo's beat, 24 000: steps 5, 6, 7 at 66 000,
    // 72 000, 78 000. `guess` is left at 0 and `measured` cleared. (As built: period 60 000,
    // step 5 at 75 000.)
    let c = edges_from_a_reset(120_000, BEATS, &[0, 60_000]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(78_001, 128, &c);
    assert_eq!(
        steps(&ev),
        [
            (0, 0, 0), (6_000, 96, 1), (12_000, 192, 2), (18_000, 288, 3),
            (60_000, 384, 4), (66_000, 480, 5), (72_000, 576, 6), (78_000, 672, 7),
        ]
    );
    assert_eq!(ext(&h), 0);
}

#[test]
fn ruling_2_the_bar_is_more_than_twice_the_period() {
    // Edges at 0 and 24 000 (stored 120: period 24 000). An edge at 72 000 has since 48 000 =
    // 2 × period, not more: it measures 48 000, and its beat's steps are 12 000 apart. One frame
    // later, 72 001, since 48 001 is a pause: period 24 000, steps 6 000 apart.
    let c = edges_from_a_reset(120_000, BEATS, &[0, 24_000, 72_000]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(84_001, 128, &c);
    assert_eq!(steps_from(&ev, 72_000), [(72_000, 768, 8), (84_000, 864, 9)], "since = 2 × period measures");
    let c = edges_from_a_reset(120_000, BEATS, &[0, 24_000, 72_001]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(84_002, 128, &c);
    assert_eq!(steps_from(&ev, 72_001), [(72_001, 768, 8), (78_001, 864, 9), (84_001, 960, 10)], "one frame more is a pause");
}

#[test]
fn ruling_2_leaves_one_edge_a_step_measuring_a_pause() {
    // A guard that passes on the old core too (D101 item 4). One edge a step at 0, 6 000 and
    // 30 000 (since 24 000 > 2 × 6 000): it measures 24 000 as it always has. `ext` is
    // 150 × 48 000 / 24 000 = 300.
    let c = edges_from_a_reset(120_000, EDGES, &[0, 6_000, 30_000]);
    let mut h = Host::new(SR, 1);
    h.run(30_001, 128, &c);
    assert_eq!(ext(&h), 300);
}

#[test]
fn ruling_3_a_reset_after_48_to_96_khz_runs_the_first_beat_at_the_guess_rescaled() {
    // D101 item 3's case. At 48 kHz edges at 0 and 24 000 measure a beat of 24 000 (the guess).
    // Between blocks, after frame 29 999, the rate goes to 96 kHz: the guess becomes 24 000 ×
    // 96 000 / 48 000 = 48 000. Frames are counted on across the change. A reset at 40 000 and
    // an edge on the same frame: the first beat's period is the guess, 48 000, so its steps are
    // ceil(96 × 48 000 / 384) = 12 000 frames apart. Two stored tempos: at 120 the stored beat at
    // 96 kHz is also 48 000; at 60 it is 96 000, so a guess lost to 0 would show (steps 24 000
    // apart). (As built: the guess stays 24 000, steps 6 000 apart.)
    for mbpm in [120_000, 60_000] {
        let mut c = edges_from_a_reset(mbpm, BEATS, &[0, 24_000]);
        c.push((40_000, cmd(CMD_RESET, 0, 0, 0)));
        c.push((40_000, clock()));
        let mut h = Host::new(SR, 1);
        h.run(30_000, 128, &c);
        unsafe { pi_set_sample_rate(h.e, 96_000) };
        let ev = h.run(76_001 - 30_000, 128, &c);
        assert_eq!(
            steps_from(&ev, 40_000),
            [(40_000, 0, 0), (52_000, 96, 1), (64_000, 192, 2), (76_000, 288, 3)],
            "stored tempo {mbpm}"
        );
    }
}

#[test]
fn ruling_3_a_rate_change_mid_beat_carries_the_period_and_the_frames_since() {
    // 48 kHz, stored 120, edges at 0 and 24 000 (period 24 000). Frame 30 000 has since 6 000:
    // tick 480 (step 5). After it since is 6 001; the rate goes to 96 kHz: since 6 001 × 2 =
    // 12 002, period 48 000. Frame f after has since 12 002 + (f − 30 001); tick 576 wants
    // since × 384 / 48 000 ≥ 192, since ≥ 24 000: frame 41 999 (in time: 5 999 frames at
    // 48 kHz left to the step, 11 998 at 96). (As built: 36 000. The period alone rescaled: at
    // once, 30 001. The frames since alone: 48 000, past the step.)
    let c = edges_from_a_reset(120_000, BEATS, &[0, 24_000]);
    let mut h = Host::new(SR, 1);
    let ev = h.run(30_001, 128, &c);
    assert_eq!(steps_from(&ev, 24_000), [(24_000, 384, 4), (30_000, 480, 5)]);
    unsafe { pi_set_sample_rate(h.e, 96_000) };
    let ev = h.run(41_998 - 30_000, 128, &c);
    assert!(steps(&ev).is_empty(), "nothing to frame 41 998");
    let ev = h.run(1, 128, &c);
    assert_eq!(steps(&ev), [(41_999, 576, 6)]);
}

#[test]
fn ruling_3_a_period_or_guess_that_was_not_0_is_held_to_at_least_1() {
    // 96 kHz, stored 120, edges a beat at frames 0, 1 and 2: the edges at 1 and 2 measure a
    // period of 1 (since 1, not over 2 × the period before), the guess 1, and flush to tick
    // 768. After frame 2 since is 1. The rate goes to 48 kHz: since 1 × 48 000 / 96 000 = 0,
    // period and guess 0, held to 1. Frame 3: since 0, want 0. Frame 4: since 1, want
    // min(383, 384): ticks 769 to 1 151, steps 9, 10, 11. A reset and an edge at frame 5: tick
    // 0, the period the guess, 1; frame 6: steps 1, 2, 3. (As built: frame 3 for 9 to 11. A
    // period of 0 would hold at tick 768; a guess of 0 would put step 1 at 5 + 6 000.)
    let mut c = edges_from_a_reset(120_000, BEATS, &[0, 1, 2]);
    c.push((5, cmd(CMD_RESET, 0, 0, 0)));
    c.push((5, clock()));
    let mut h = Host::new(96_000, 1);
    h.run(3, 1, &c);
    unsafe { pi_set_sample_rate(h.e, SR) };
    let ev = h.run(4, 1, &c);
    assert_eq!(
        steps(&ev),
        [(4, 864, 9), (4, 960, 10), (4, 1_056, 11), (5, 0, 0), (6, 96, 1), (6, 192, 2), (6, 288, 3)]
    );
}

#[test]
fn ruling_3_leaves_one_edge_a_step_unscaled() {
    // A guard that passes on the old core too: `SOURCE` 1 does not move. Edges a step at 0 and
    // 6 000 at 48 kHz; after frame 8 999 since is 3 000 and the view's tick 143 (2 999 × 96 /
    // 6 000 = 47.98). The rate goes to 96 kHz and nothing is rescaled: tick 145 wants since ≥
    // 3 062.5, frame 9 063. (Rescaled, since 6 000 and period 12 000 would want 6 125: 9 125.)
    let c = edges_from_a_reset(120_000, EDGES, &[0, 6_000]);
    let mut h = Host::new(SR, 1);
    h.run(9_000, 128, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 143);
    unsafe { pi_set_sample_rate(h.e, 96_000) };
    h.run(63, 1, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 144, "to frame 9 062");
    h.run(1, 1, &c);
    assert_eq!(u32::from_le_bytes(h.view()[0..4].try_into().unwrap()), 145, "frame 9 063");
}

// ---- Added after the first round of planted faults (Session 34): three plants got through. ----

#[test]
fn the_guess_follows_the_rate_at_44_1_and_96_khz() {
    // A plant that gave the first beat's guess 48 kHz's rate got through the rows, which are
    // at 48 kHz. Stored tempo 120, an edge every half second. 44.1 kHz: the guess is 44 100 ×
    // 60 000 / 120 000 = 22 050 frames: steps at ceil(96 n × 22 050 / 384) = 5 513, 11 025,
    // 16 538, then the measured beat (22 050) from the edge at 22 050: 27 563, 33 075, 38 588.
    // 96 kHz: the guess is 48 000: a step every 12 000.
    let rows: [(u32, [u64; 9]); 2] = [
        (44_100, [0, 5_513, 11_025, 16_538, 22_050, 27_563, 33_075, 38_588, 44_100]),
        (96_000, [0, 12_000, 24_000, 36_000, 48_000, 60_000, 72_000, 84_000, 96_000]),
    ];
    for (rate, want) in rows {
        let half = rate as u64 / 2;
        let mut h = Host::new(rate, 1);
        let ev = h.run(2 * half + 1, 128, &edges_from_a_reset(120_000, BEATS, &[0, half, 2 * half]));
        let want: Vec<(u64, u32, u8)> = want.iter().enumerate().map(|(n, f)| (*f, 96 * n as u32, n as u8)).collect();
        assert_eq!(steps(&ev), want, "rate {rate}");
    }
}

#[test]
fn a_switch_away_from_beats_and_back_forgets_the_measured_beat() {
    // A plant that kept `guess` over a switch got through: the switch test measured on one edge
    // a step, which sets no guess. 48 kHz, stored tempo 60 (a beat of 48 000 frames). Beats:
    // edges at 0 and 24 000 measure 24 000 (row 60's steps 0 to 4). Frames 24 000 to 29 999
    // interpolate to tick 479 (29 999 has since 5 999: 5 999 × 384 / 24 000 = 95.98). A switch
    // to one edge a step at 30 000 (before tick 480's frame advance), and back to beats at
    // 31 000: the guess is cleared, so the edge at 40 000 flushes ticks 480 to 767, emits 768,
    // and its beat runs at the stored tempo's 48 000: step 9 (tick 864) at 40 000 + 12 000.
    // (Keeping the guess would put it at 46 000.)
    let mut c = edges_from_a_reset(60_000, BEATS, &[0, 24_000, 40_000]);
    c.extend([(30_000, cmd(CMD_SOURCE, 0, 0, EDGES)), (31_000, cmd(CMD_SOURCE, 0, 0, BEATS))]);
    c.sort_by_key(|x| x.0);
    let mut h = Host::new(SR, 1);
    let ev = h.run(52_001, 128, &c);
    assert_eq!(
        steps(&ev),
        [
            (0, 0, 0), (12_000, 96, 1), (24_000, 192, 2), (24_000, 288, 3), (24_000, 384, 4),
            (40_000, 480, 5), (40_000, 576, 6), (40_000, 672, 7), (40_000, 768, 8), (52_000, 864, 9),
        ]
    );
}

#[test]
fn a_source_past_2_is_ignored_on_the_table_too() {
    // A plant that took 3 as a source got through: the view test sent 3 while on beats, where
    // flag 2 is set either way. From the table, 3 leaves the table running.
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, 3), cmd(CMD_PLAY, 0, 0, 1)]);
    assert_eq!(h.view()[24] >> 2 & 1, 0, "still the table");
    let ev = h.run(6_001, 128, &[]);
    assert_eq!(steps(&ev).len(), 1, "the table's next step, with no edge");
}
