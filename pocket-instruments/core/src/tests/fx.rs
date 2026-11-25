//! §17 (ABI 6; D66, D67 item 1): the lane, the fx key and the four repeats. A test for each
//! row and bullet of §17, in its order. The fixtures `fx-repeat-punch` and `fx-repeat-swing`
//! hold the same rules as a player would meet them; these hold each alone.

use super::sound::render;
use super::*;
use crate::crc::crc32;

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames, a tick 62.5
const STEP: u64 = 6000;

const SOUND: u8 = 16;
const PATTERN: u8 = 17;
const BPM: u8 = 18;
const FUNCTION: u8 = 19;
const FX: u8 = 20;
const PLAY: u8 = 21;
const WRITE: u8 = 22;

fn down(key: u8) -> Cmd {
    cmd(CMD_KEY_DOWN, key, 0, 0)
}
fn up(key: u8) -> Cmd {
    cmd(CMD_KEY_UP, key, 0, 0)
}
fn fx(step: u8, effect: u32) -> Cmd {
    cmd(CMD_FX, step, 0, effect)
}
fn fxsound(track: u8, on: u32) -> Cmd {
    cmd(CMD_FXSOUND, track, 0, on)
}
fn on(track: u8, step: u8) -> Cmd {
    cmd(CMD_STEP, track, step, 1)
}
fn play() -> Cmd {
    cmd(CMD_PLAY, 0, 0, 1)
}

/// (tick, track, step) of every firing.
fn trigs(ev: &[(u64, Event)]) -> Vec<(u32, u8, u8)> {
    ev.iter().filter(|(_, e)| e.kind == EV_TRIG).map(|(_, e)| (e.tick, e.track, e.step)).collect()
}

fn steps_of(ev: &[(u64, Event)]) -> Vec<(u64, u32, u8)> {
    ev.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, e)| (*f, e.tick, e.step)).collect()
}

fn lane(h: &Host) -> [u8; 16] {
    h.save()[384..400].try_into().unwrap()
}

fn heard(h: &Host) -> u8 {
    h.view()[55]
}

/// A frame `n` steps in, plus one: where a key lands in a fixture (fixtures/README.md).
fn after(n: u64) -> u64 {
    n * STEP + 1
}

/// A fresh engine sent these edits and play at frame 0, run for `frames`: the events from
/// tick 0 on.
fn from_zero(edits: &[Cmd], frames: u64) -> (Host, Vec<(u64, Event)>) {
    let mut h = Host::new(SR, 1);
    let mut cmds: Vec<(u64, Cmd)> = edits.iter().map(|c| (0, *c)).collect();
    cmds.push((0, play()));
    let ev = h.run(frames, 128, &cmds);
    (h, ev)
}

/// An engine playing from frame 0 on the table clock, with these edits first. Frame 0, and
/// tick 0's events, are behind it.
fn playing(edits: &[Cmd]) -> Host {
    let mut h = Host::new(SR, 1);
    let mut c = edits.to_vec();
    c.push(play());
    h.block(1, &c);
    h
}

// ---- Commands ----

#[test]
fn fx_sets_a_step_of_the_lane_and_moves_the_generation_only_when_it_changes() {
    let mut h = Host::new(SR, 1);
    for (c, moves, want3) in [(fx(3, 10), true, 10), (fx(3, 10), false, 10), (fx(3, 16), true, 16), (fx(3, 17), false, 16), (fx(3, 255), false, 16), (fx(16, 4), false, 16), (fx(255, 4), false, 16), (fx(3, 0), true, 0)] {
        let g = h.generation();
        h.block(1, &[c]);
        assert_eq!(h.generation() != g, moves, "FX {} {}", c.a, c.value);
        assert_eq!(lane(&h)[3], want3, "FX {} {}", c.a, c.value);
    }
    assert_eq!(lane(&h), [0; 16], "a step or a value out of range touched nothing");
}

#[test]
fn fxsound_switches_a_sound_and_moves_the_generation_only_when_it_changes() {
    let mut h = Host::new(SR, 1);
    let sounds = |h: &Host| u16::from_le_bytes([h.save()[400], h.save()[401]]);
    assert_eq!(sounds(&h), 0xFFFF, "all sixteen at pi_init");
    for (c, moves, want) in [(fxsound(4, 0), true, 0xFFEF), (fxsound(4, 0), false, 0xFFEF), (fxsound(4, 7), true, 0xFFFF), (fxsound(4, 1), false, 0xFFFF), (fxsound(16, 0), false, 0xFFFF), (fxsound(15, 0), true, 0x7FFF)] {
        let g = h.generation();
        h.block(1, &[c]);
        assert_eq!(h.generation() != g, moves, "FXSOUND {} {}", c.a, c.value);
        assert_eq!(sounds(&h), want, "FXSOUND {} {}", c.a, c.value);
    }
}

// ---- Keys ----

#[test]
fn fx_and_a_key_punch_no_sound_and_no_step_whether_write_is_on_or_off() {
    for write in [false, true] {
        let mut h = playing(&[]);
        if write {
            h.block(1, &[down(WRITE), up(WRITE)]);
        }
        let (snap, g) = (h.save(), h.generation());
        let ev = h.run(10, 1, &[(h.now, down(FX)), (h.now + 1, down(9))]);
        assert!(trigs(&ev).is_empty(), "write {write}: no sound");
        assert_eq!((h.save(), h.generation()), (snap, g), "write {write}: no step, nothing saved yet");
        assert_eq!(heard(&h), 10, "write {write}: key 10 is effect 10, heard at once");
    }
}

#[test]
fn of_keys_held_the_last_wins_and_letting_it_go_brings_the_one_before_back() {
    let mut h = playing(&[]);
    h.block(1, &[down(FX), down(2)]);
    assert_eq!(heard(&h), 3);
    h.block(1, &[down(7)]);
    assert_eq!(heard(&h), 8, "the last wins");
    h.block(1, &[down(12)]);
    assert_eq!(heard(&h), 13);
    h.block(1, &[up(7)]);
    assert_eq!(heard(&h), 13, "letting go of one before the last changes nothing");
    h.block(1, &[up(12)]);
    assert_eq!(heard(&h), 3, "the one before comes back");
    h.block(1, &[up(2)]);
    assert_eq!(heard(&h), 0, "none left");
    h.block(1, &[down(5), up(5), down(6)]);
    assert_eq!(heard(&h), 7);
}

#[test]
fn letting_fx_go_ends_every_punch_and_a_grid_key_still_down_is_not_a_press() {
    let mut h = playing(&[on(4, 0)]);
    h.block(1, &[down(FX), down(4), down(9)]);
    assert_eq!(heard(&h), 10);
    h.block(1, &[up(FX)]);
    assert_eq!(heard(&h), 0, "nothing punched");
    // Fx again, with keys 5 and 10 still down from before: they are not punched by being down.
    let ev = h.run(3, 1, &[(h.now, down(FX)), (h.now + 1, up(9)), (h.now + 2, up(4))]);
    assert_eq!(heard(&h), 0);
    assert!(trigs(&ev).is_empty(), "letting the keys go plays nothing");
    h.block(1, &[up(FX)]);
}

#[test]
fn fx_down_alone_is_only_held() {
    let mut h = playing(&[on(0, 0)]);
    let (snap, g) = (h.save(), h.generation());
    let ev = h.run(1, 1, &[(h.now, down(FX))]);
    assert!(trigs(&ev).is_empty());
    assert_eq!((h.save(), h.generation()), (snap, g));
    assert_eq!(h.view()[8..12], (1u32 << FX).to_le_bytes(), "it shows pressed");
}

#[test]
fn bpm_and_sound_come_before_fx_and_fx_before_pattern_and_function() {
    // bpm held: the volume, not a punch.
    let mut h = playing(&[]);
    h.block(1, &[down(FX), down(BPM), down(3)]);
    assert_eq!((heard(&h), h.view()[27]), (0, 4));
    // sound held: the chosen sound, and it plays; not a punch.
    let mut h = playing(&[]);
    let ev = h.run(1, 1, &[(h.now, down(FX)), (h.now, down(SOUND)), (h.now, down(6))]);
    assert_eq!((heard(&h), h.view()[26]), (0, 6));
    assert_eq!(trigs(&ev).len(), 1);
    // pattern or function held: still a punch.
    for k in [PATTERN, FUNCTION] {
        let mut h = playing(&[]);
        h.block(1, &[down(FX), down(k), down(1)]);
        assert_eq!(heard(&h), 2, "key {k} held");
    }
}

#[test]
fn stopped_nothing_is_heard_and_nothing_is_written() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[down(FX), down(10)]);
    assert_eq!(heard(&h), 0, "stopped");
    let ev = h.run(20 * STEP, 128, &[]);
    assert!(ev.is_empty());
    assert_eq!(lane(&h), [0; 16], "the clock counted steps; none was written");
    // Play with the punch still held: from the first step it is heard and written.
    let ev = h.run(2 * STEP, 128, &[(h.now, down(PLAY))]);
    assert_eq!(steps_of(&ev).len(), 2);
    assert_eq!(heard(&h), 11);
    assert_eq!(lane(&h)[..2], [11, 11]);
}

#[test]
fn clear_empties_the_lane_and_keeps_the_sounds_switches() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[fx(0, 3), fx(15, 12), fxsound(2, 0), on(1, 1)]);
    let g = h.generation();
    h.block(1, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]);
    assert_eq!(h.generation(), g + 1, "one change");
    let s = h.save();
    assert_eq!(s[384..400], [0; 16]);
    assert_eq!(s[400..402], 0xFFFBu16.to_le_bytes());
    // A lane alone is something to clear.
    h.block(1, &[fx(5, 1)]);
    let g = h.generation();
    h.block(1, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]);
    assert_eq!((h.generation(), lane(&h)), (g + 1, [0; 16]));
}

// ---- The lane is written by the steps that arrive ----

#[test]
fn each_step_arriving_with_a_punch_takes_it_and_the_step_being_played_does_not() {
    // A sound effect (key 2, effect 3): the step being played is not recorded (D66 item 3).
    let mut h = playing(&[]);
    let cmds = [(after(2), down(FX)), (after(2), down(2)), (after(5), up(2)), (after(5), up(FX))];
    h.run(8 * STEP, 128, &cmds);
    let mut want = [0u8; 16];
    want[3..6].fill(3);
    assert_eq!(lane(&h), want, "steps 3, 4 and 5 arrived with the punch; 2 was being played; 6 after");
}

#[test]
fn a_repeat_punched_mid_step_records_the_step_being_played_too() {
    // D97: a repeat (key 10, effect 11) is recorded where its key came down, step 2, on the
    // punch's frame, moving the generation; then 3, 4 and 5 as they arrive.
    let mut h = playing(&[]);
    h.run(after(2) - 1, 128, &[]);
    let g = h.generation();
    h.run(100, 1, &[(after(2), down(FX)), (after(2), down(10))]);
    let mut want = [0u8; 16];
    want[2] = 11;
    assert_eq!((lane(&h), h.generation()), (want, g + 1), "step 2 recorded mid-step, a tick after the press");
    let n = h.now;
    h.run(6 * STEP, 128, &[(n + 3 * STEP, up(10)), (n + 3 * STEP, up(FX))]);
    want[3..6].fill(11);
    assert_eq!(lane(&h), want);
}

#[test]
fn fx_alone_empties_each_step_that_arrives() {
    let mut h = playing(&(0..16).map(|s| fx(s, 5)).collect::<Vec<_>>());
    h.run(9 * STEP, 128, &[(after(3), down(FX)), (after(6), up(FX))]);
    let mut want = [5u8; 16];
    want[4..7].fill(0);
    assert_eq!(lane(&h), want);
}

#[test]
fn nothing_is_written_between_boundaries_and_write_mode_plays_no_part() {
    for write in [false, true] {
        let mut h = playing(&[]);
        if write {
            h.block(1, &[down(WRITE), up(WRITE)]);
        }
        let g = h.generation();
        h.run(STEP - 10, 128, &[(h.now, down(FX)), (h.now, down(0))]);
        assert_eq!((lane(&h), h.generation()), ([0; 16], g), "write {write}: inside step 0");
        h.run(20, 1, &[]);
        let mut want = [0u8; 16];
        want[1] = 1;
        assert_eq!(lane(&h), want, "write {write}: step 1 arrived");
        assert_eq!(h.generation(), g + 1, "write {write}: the lane is in the snapshot, so it moves");
        assert_eq!(h.save()[24..56], [0; 32], "write {write}: no step was set");
    }
}

#[test]
fn heard_is_nothing_until_a_step_then_the_punch_then_the_lane() {
    // On edges, play waits for the next edge: a punch is not heard before that step.
    let mut h = Host::new(SR, 1);
    h.block(1, &[cmd(CMD_SOURCE, 0, 0, 1), fx(0, 4), fx(1, 6), down(PLAY), down(FX), down(2)]);
    assert_eq!(heard(&h), 0, "no step since play");
    h.block(1, &[cmd(CMD_CLOCK, 0, 0, 0)]);
    assert_eq!(heard(&h), 3, "the punch, from the step; step 0 now holds it");
    h.block(1, &[up(2)]);
    assert_eq!(heard(&h), 3, "let go: the playhead's step holds it by then");
    h.block(1, &[up(FX), cmd(CMD_CLOCK, 0, 0, 0)]);
    assert_eq!(heard(&h), 6, "the lane");
    h.block(1, &[up(PLAY), down(PLAY)]);
    assert_eq!(heard(&h), 0, "stopped");
}

#[test]
fn a_repeat_punched_in_the_middle_of_a_step_begins_with_the_next_step_and_repeats_the_one_it_came_down_on() {
    let mut h = playing(&[on(0, 1), on(0, 2)]);
    let ev = h.run(4 * STEP - 2, 128, &[(after(1) + 2000, down(FX)), (after(1) + 2000, down(10))]);
    // Step 1 fires once, plainly, at 96; the run begins at step 2's boundary, 192, every 48
    // ticks. Since Session 30 (D95 item 1) it repeats step 1, where the key came down; step
    // 2's own note is silent under it. (Session 16 to 29: step 2's column.)
    assert_eq!(trigs(&ev), [(96, 0, 1), (192, 0, 1), (240, 0, 1), (288, 0, 1), (336, 0, 1)]);
}

// ---- The four repeats ----

#[test]
fn the_four_repeats_hit_four_three_eight_and_six_times_a_beat() {
    for (effect, period, in_a_beat) in [(9u32, 96u32, 4usize), (10, 128, 3), (11, 48, 8), (12, 64, 6)] {
        // Steps 4 to 7, one beat, hold the repeat; track 0 is on step 4 only.
        let mut h = playing(&[on(0, 4), fx(4, effect), fx(5, effect), fx(6, effect), fx(7, effect)]);
        let ev = h.run(16 * STEP, 128, &[]);
        let got = trigs(&ev);
        assert_eq!(got.len(), in_a_beat, "effect {effect}");
        let want: Vec<(u32, u8, u8)> = (0..in_a_beat as u32).map(|i| (384 + i * period, 0, 4)).collect();
        assert_eq!(got, want, "effect {effect}");
    }
}

#[test]
fn a_run_keeps_the_step_it_began_on_and_its_own_grid_across_its_steps() {
    // Effect 10 on steps 2 to 5: three even hits a beat, not one a step; each from column 2.
    let mut h = playing(&[on(3, 2), on(3, 3), on(3, 4), on(3, 5), fx(2, 10), fx(3, 10), fx(4, 10), fx(5, 10)]);
    let ev = h.run(8 * STEP, 128, &[]);
    assert_eq!(trigs(&ev), [(192, 3, 2), (320, 3, 2), (448, 3, 2)]);
}

#[test]
fn a_sound_in_the_effects_does_not_play_its_own_steps_and_one_outside_plays_on() {
    // Tracks 0 and 1 on every step; 1 is out of the effects. Effect 11 on step 1 to 2.
    let mut edits: Vec<Cmd> = (0..16).flat_map(|s| [on(0, s), on(1, s)]).collect();
    edits.extend([fxsound(1, 0), fx(1, 11), fx(2, 11)]);
    let (_, ev) = from_zero(&edits, 4 * STEP - 2);
    assert_eq!(
        trigs(&ev),
        [(0, 0, 0), (0, 1, 0), (96, 0, 1), (96, 1, 1), (144, 0, 1), (192, 0, 1), (192, 1, 2), (240, 0, 1), (288, 0, 3), (288, 1, 3)]
    );
}

#[test]
fn a_repeated_hit_is_not_swung_and_takes_a_draw_from_the_run_s_column() {
    // Swing 30. Track 0 on step 1 at 70; track 1, out of the effects, on step 1 at 70.
    // Effect 12 on steps 1 and 2: track 0's hits at 96, 160 and 224 (288 is the next step).
    let (_, ev) = from_zero(
        &[cmd(CMD_SWING, 0, 0, 30), on(0, 1), cmd(CMD_PROB, 0, 1, 70), on(0, 2), on(1, 1), cmd(CMD_PROB, 1, 1, 70), fxsound(1, 0), fx(1, 12), fx(2, 12)],
        3 * STEP - 2,
    );
    // From seed 1, draws % 100: 69, 89, 61, 95. Track 0 at 96, not swung to 126, takes 69:
    // it fires. Track 1's own step 1, swung, at 126 takes 89: no. Track 0 at 160 takes 61:
    // it fires; at 224, 95: no. Its own step 2 (on, at 100) never plays.
    assert_eq!(trigs(&ev), [(96, 0, 1), (160, 0, 1)]);
    // Probability 0 takes its draw and never fires: effect 9 on step 1 is one hit, which
    // takes 69. Track 2's steps 2 and 3 at 70 then take 89 (no) and 61 (yes). Had the
    // repeat taken no draw, step 2 would have taken 69 and fired.
    let (_, ev) = from_zero(&[on(0, 1), cmd(CMD_PROB, 0, 1, 0), on(2, 2), cmd(CMD_PROB, 2, 2, 70), on(2, 3), cmd(CMD_PROB, 2, 3, 70), fx(1, 9)], 4 * STEP - 2);
    assert_eq!(trigs(&ev), [(288, 2, 3)]);
}

#[test]
fn every_repeated_hit_draws_once_in_track_order() {
    // Tracks 0 and 2 on step 0 at 70, effect 11 for one step: two hits, four draws, in order
    // track 0, track 2, track 0, track 2: 69 (yes), 89 (no), 61 (yes), 95 (no).
    let (_, ev) = from_zero(&[on(0, 0), cmd(CMD_PROB, 0, 0, 70), on(2, 0), cmd(CMD_PROB, 2, 0, 70), fx(0, 11)], STEP - 2);
    assert_eq!(trigs(&ev), [(0, 0, 0), (48, 0, 0)]);
}

#[test]
fn a_repeated_hit_carries_its_column_and_the_order_in_a_tick_is_step_then_rising_track() {
    let (_, ev) = from_zero(&[on(5, 0), on(2, 2), fxsound(2, 0), on(9, 0), fx(0, 9), fx(1, 9), fx(2, 9)], 3 * STEP - 2);
    let lines: Vec<String> = ev.iter().map(|(_, e)| line(e)).collect();
    assert_eq!(
        lines.concat(),
        "0 step 0\n0 trig 5 0\n0 trig 9 0\n96 step 1\n96 trig 5 0\n96 trig 9 0\n192 step 2\n192 trig 2 2\n192 trig 5 0\n192 trig 9 0\n"
    );
}

#[test]
fn the_playhead_and_step_are_untouched_by_a_run() {
    let edits: Vec<Cmd> = (0..16).map(|s| on(0, s)).collect();
    let mut with = playing(&[edits.clone(), (3..9).map(|s| fx(s, 11)).collect()].concat());
    let mut without = playing(&edits);
    let (a, b) = (with.run(30 * STEP - 2, 128, &[]), without.run(30 * STEP - 2, 128, &[]));
    assert_eq!(steps_of(&a), steps_of(&b));
    assert_eq!(trigs(&a)[..3], trigs(&b)[..3]);
    assert_eq!(trigs(&a)[trigs(&a).len() - 3..], trigs(&b)[trigs(&b).len() - 3..], "the beat comes back in place");
}

#[test]
fn a_new_run_begins_when_the_repeat_changes_or_comes_back_and_after_play_or_reset() {
    // 10 on steps 0 and 1, then 11 on 2: a new run at 192 from column 2.
    let (_, ev) = from_zero(&[on(0, 0), on(0, 2), fx(0, 10), fx(1, 10), fx(2, 11)], 3 * STEP - 2);
    assert_eq!(trigs(&ev), [(0, 0, 0), (128, 0, 0), (192, 0, 2), (240, 0, 2)]);
    // A gap: 12 on 0, none on 1, 12 on 2: two runs, the second from column 2.
    let (_, ev) = from_zero(&[on(0, 0), on(0, 2), fx(0, 12), fx(2, 12)], 3 * STEP - 2);
    assert_eq!(trigs(&ev), [(0, 0, 0), (64, 0, 0), (192, 0, 2), (256, 0, 2)]);
    // Length 1 and 10 on its one step: one long run, every 128 ticks.
    let (mut h, ev) = from_zero(&[on(0, 0), cmd(CMD_LENGTH, 0, 0, 1), fx(0, 10)], 4 * STEP - 2);
    assert_eq!(trigs(&ev).iter().map(|t| t.0).collect::<Vec<_>>(), [0, 128, 256]);
    // Stopped and played again by the key (a reset, on the table clock): a new run from that
    // boundary. Tick 384 comes first, two frames on.
    let n = h.now;
    let ev = h.run(2 * STEP, 128, &[(n + 10, down(PLAY)), (n + 11, up(PLAY)), (n + 20, down(PLAY)), (n + 21, up(PLAY))]);
    assert_eq!(trigs(&ev).iter().map(|t| t.0).collect::<Vec<_>>(), [384, 0, 128]);
    // A reset while playing, at tick 223: a new run from tick 0; the old one's 256 never comes.
    let n = h.now;
    let ev = h.run(2 * STEP, 128, &[(n + 2000, cmd(CMD_RESET, 0, 0, 0))]);
    assert_eq!(trigs(&ev).iter().map(|t| t.0).collect::<Vec<_>>(), [0, 128]);
}

// ---- §17, Session 30: a repeat holds the step its run begins on (D95 item 1) ----
// The hardware's rule (R74), back in place of D91's look behind. Session 26's nine tests of
// that walk went with it; these hold the rule that replaced it, one a bullet of §17's
// "Built (Session 30)". Each expectation was worked by hand before it ran. From play at
// frame 0 a step is 96 ticks; draws % 100 from seed 1: 69, 89, 61, 95, 33.

/// A fresh engine sent `edits` and play at frame 0, then `later` at their frames.
fn with_later(edits: &[Cmd], later: &[(u64, Cmd)], frames: u64) -> Vec<(u32, u8, u8)> {
    let mut h = Host::new(SR, 1);
    let mut cmds: Vec<(u64, Cmd)> = edits.iter().map(|c| (0, *c)).collect();
    cmds.push((0, play()));
    cmds.extend_from_slice(later);
    trigs(&h.run(frames, 128, &cmds))
}

#[test]
fn an_empty_step_repeats_as_silence_with_notes_behind_and_ahead() {
    // Track 0 on steps 2 and 6; track 1, out of the effects, on step 4. Effect 11 on steps 4
    // and 5: the run holds step 4, where no sound in the effects is on, and is silent for
    // both steps. Track 1 plays its own step. D91 would have repeated step 2 at 384 to 528.
    let got = with_later(&[on(0, 2), on(0, 6), on(1, 4), fxsound(1, 0), fx(4, 11), fx(5, 11)], &[], 7 * STEP - 2);
    assert_eq!(got, [(192, 0, 2), (384, 1, 4), (576, 0, 6)]);
}

#[test]
fn a_silent_run_takes_no_draw() {
    // Track 0 on step 2 at 0; track 1, out of the effects, on step 7 at 90; effect 11 on
    // step 5 alone. Step 2 draws 69 (no). The run from step 5 has no note and draws nothing,
    // so track 1 at 672 draws 89: under 90, it fires. (D91 held step 2 here and its two hits
    // drew 89 and 61, leaving 95 for track 1.)
    let got = with_later(&[on(0, 2), cmd(CMD_PROB, 0, 2, 0), on(1, 7), cmd(CMD_PROB, 1, 7, 90), fxsound(1, 0), fx(5, 11)], &[], 8 * STEP - 2);
    assert_eq!(got, [(672, 1, 7)]);
}

#[test]
fn a_tap_gives_an_empty_step_nothing_to_repeat() {
    // Track 2 on step 1; effect 11 on step 5. Sound 0 tapped on step 5 just before the run's
    // second hit, write off: it fires once, as a tap, and is not repeated at 528.
    let got = with_later(&[on(2, 1), fx(5, 11)], &[(after(5) + 10, down(0)), (after(5) + 20, up(0))], 6 * STEP - 2);
    assert_eq!(got.iter().filter(|t| t.1 == 2).copied().collect::<Vec<_>>(), [(96, 2, 1)]);
    assert_eq!(got.iter().filter(|t| t.1 == 0).count(), 1, "the tap sounded once");
}

#[test]
fn the_run_keeps_its_step_and_an_edit_elsewhere_moves_nothing() {
    // Track 0 on step 4; effect 11 on steps 4, 5 and 6: hits every 48 ticks from 384, all
    // column 4. In step 5 track 1 is put on step 3 and track 5 is switched out of the effects:
    // nothing moves (track 1's step 3 is behind the playhead).
    let later = [(after(5) + 100, on(1, 3)), (after(5) + 100, fxsound(5, 0))];
    let got = with_later(&[on(0, 4), fx(4, 11), fx(5, 11), fx(6, 11)], &later, 8 * STEP - 2);
    assert_eq!(got, [(384, 0, 4), (432, 0, 4), (480, 0, 4), (528, 0, 4), (576, 0, 4), (624, 0, 4)]);
}

#[test]
fn what_the_run_s_step_holds_is_read_at_each_hit() {
    // As above, but in step 5 (after its hit at 480) track 0's note on step 4 is taken off:
    // the run falls silent. In step 6 (after 576) track 3 is put on step 4: it sounds at 624.
    let later = [(after(5), cmd(CMD_STEP, 0, 4, 0)), (after(6), on(3, 4))];
    let got = with_later(&[on(0, 4), fx(4, 11), fx(5, 11), fx(6, 11)], &later, 8 * STEP - 2);
    assert_eq!(got, [(384, 0, 4), (432, 0, 4), (480, 0, 4), (624, 3, 4)]);
}

#[test]
fn a_run_begun_on_an_empty_step_sounds_once_a_note_is_put_there() {
    // Track 1, out of the effects, on step 2. Effect 11 on steps 4 and 5 holds step 4,
    // silent, until track 0 is put on step 4 just after its first hit: 432, 480 and 528.
    let got = with_later(&[on(1, 2), fxsound(1, 0), fx(4, 11), fx(5, 11)], &[(after(4), on(0, 4))], 6 * STEP - 2);
    assert_eq!(got, [(192, 1, 2), (432, 0, 4), (480, 0, 4), (528, 0, 4)]);
}

#[test]
fn a_second_repeat_straight_after_the_first_holds_its_own_step() {
    // ⚠ Session 30's reading of D95 item 1 ("the step the key came down on"), not measured
    // on the PO-12: a new repeat is a new run, from its own first step, as before D91.
    // Track 0 on step 2, track 1 on step 4. 11 on steps 2 and 3 repeats step 2; 12 straight
    // after, on 4 and 5, repeats step 4. Keeping the first run's step would repeat track 0.
    let got = with_later(&[on(0, 2), on(1, 4), fx(2, 11), fx(3, 11), fx(4, 12), fx(5, 12)], &[], 6 * STEP - 2);
    assert_eq!(got, [(192, 0, 2), (240, 0, 2), (288, 0, 2), (336, 0, 2), (384, 1, 4), (448, 1, 4), (512, 1, 4)]);
    // And when the second begins on an empty step it is silent: nothing is carried over.
    let got = with_later(&[on(0, 2), fx(2, 11), fx(3, 11), fx(4, 12), fx(5, 12)], &[], 6 * STEP - 2);
    assert_eq!(got, [(192, 0, 2), (240, 0, 2), (288, 0, 2), (336, 0, 2)]);
}

#[test]
fn a_punch_on_a_boundary_s_frame_came_down_on_the_step_arriving() {
    // Track 0 on step 1, track 1 on step 2. fx goes down in step 1 (a change of what steps
    // take, seen there); key 10 (effect 11) on the frame of tick 192 and before it (an edit
    // lands before the clock moves): step 2 takes the punch and the run repeats step 2, not
    // step 1.
    let mut h = playing(&[on(0, 1), on(1, 2)]);
    let ev = h.run(3 * STEP - 2, 128, &[(after(1) + 2000, down(FX)), (2 * STEP, down(10))]);
    assert_eq!(trigs(&ev), [(96, 0, 1), (192, 1, 2), (240, 1, 2)]);
}

#[test]
fn a_new_repeat_key_inside_a_run_repeats_the_step_it_came_down_on() {
    // Track 0 on step 1, track 1 on step 3. fx and key 10 (11) in step 1: from 192 the run
    // repeats step 1. Key 11 (12) goes down in step 3 and is the last down, so it is the
    // punch: from 384 a new run every 64 ticks repeats step 3, where its key came down.
    let mut h = playing(&[on(0, 1), on(1, 3)]);
    let ev = h.run(6 * STEP - 2, 128, &[(after(1) + 2000, down(FX)), (after(1) + 2000, down(10)), (after(3) + 2000, down(11))]);
    assert_eq!(
        trigs(&ev),
        [(96, 0, 1), (192, 0, 1), (240, 0, 1), (288, 0, 1), (336, 0, 1), (384, 1, 3), (448, 1, 3), (512, 1, 3)]
    );
}

#[test]
fn the_lane_replayed_repeats_what_the_push_did() {
    // D97. Length 4; track 0 on step 1, track 1 on step 2. Punched in step 1 and let go in
    // step 3: live, steps 2 and 3 repeat step 1. The lane holds 1 to 3, so the next pass's
    // run begins on step 1, a step earlier, and repeats step 1 too; track 1 is silent under
    // both. (Before D97 the replay began on step 2 and repeated track 1.)
    let mut h = playing(&[cmd(CMD_LENGTH, 0, 0, 4), on(0, 1), on(1, 2)]);
    let keys = [(after(1) + 2000, down(FX)), (after(1) + 2000, down(10)), (after(3) + 2000, up(10)), (after(3) + 2000, up(FX))];
    let ev = h.run(8 * STEP - 2, 128, &keys);
    assert_eq!(
        trigs(&ev),
        [(96, 0, 1), (192, 0, 1), (240, 0, 1), (288, 0, 1), (336, 0, 1), (480, 0, 1), (528, 0, 1), (576, 0, 1), (624, 0, 1), (672, 0, 1), (720, 0, 1)]
    );
}

#[test]
fn a_punch_held_through_play_repeats_the_first_step() {
    // Punched while stopped, played by the edit mid-step on the table clock: the punch's
    // change is seen before any step has arrived, so no step is "where it came down". The
    // run from the first step after play (tick 96, step 0) repeats that step, track 2.
    let mut h = Host::new(SR, 1);
    let ev = h.run(2 * STEP - 2, 128, &[(0, on(2, 0)), (0, on(0, 3)), (1, down(FX)), (1, down(10)), (100, play())]);
    assert_eq!(trigs(&ev), [(96, 2, 0), (144, 2, 0)]);
    // Again with the playhead left on step 3 (track 0's) when stopped: still step 0, from the
    // first boundary after play (tick 384 on the table clock), through two steps.
    let mut h = playing(&[on(2, 0), on(0, 3)]);
    h.run(3 * STEP + 100, 128, &[]);
    let n = h.now;
    let ev = h.run(2 * STEP, 128, &[(n, cmd(CMD_PLAY, 0, 0, 0)), (n + 1, down(FX)), (n + 1, down(10)), (n + 100, play())]);
    assert_eq!(trigs(&ev), [(384, 2, 0), (432, 2, 0), (480, 2, 0)]);
    // D97: no step was being played when the punch was seen, so none is recorded for it; the
    // lane holds only the steps that arrived with it, 0 and 1. Step 3 stays empty.
    let mut want = [0u8; 16];
    want[0..2].fill(11);
    assert_eq!(lane(&h), want);
    // And a punch held across the stop, put down in step 3 while playing: the step it came
    // down on is forgotten at the stop, and the run after play repeats step 0.
    let mut h = playing(&[on(2, 0), on(0, 3)]);
    let ev = h.run(3 * STEP + 200, 128, &[(after(3) + 100, down(FX)), (after(3) + 100, down(10))]);
    assert_eq!(trigs(&ev).last(), Some(&(288, 0, 3)), "step 3 plays plainly, as the key comes down after it");
    let n = h.now;
    let ev = h.run(2 * STEP, 128, &[(n, cmd(CMD_PLAY, 0, 0, 0)), (n + 100, play())]);
    assert_eq!(trigs(&ev), [(384, 2, 0), (432, 2, 0), (480, 2, 0)]);
}

#[test]
fn a_repeat_waits_for_the_first_step_after_play() {
    // ⚠ A reading: §17 says the sequencer reads the lane at a boundary; between a play and
    // the first boundary after it, nothing has been read since play. Stopped mid-run and
    // played again by the edit, mid-step on the table clock: the old run's grid (a hit at
    // 64) is not heard; the new run begins at the next step, 96.
    let mut h = playing(&[on(0, 0), cmd(CMD_LENGTH, 0, 0, 1), fx(0, 12)]);
    h.run(STEP / 2, 128, &[]);
    let n = h.now;
    let ev = h.run(2 * STEP, 128, &[(n, cmd(CMD_PLAY, 0, 0, 0)), (n + 100, play())]);
    assert_eq!(trigs(&ev).iter().map(|t| t.0).collect::<Vec<_>>(), [96, 160, 224]);
}

// ---- §17, designed 2026-11-24: effect 13, a note plays as another sound (ABI 13; D93) ----
// One test a bullet. Each expectation was worked by hand from the section before it ran. A
// note of track `s` sounds as track `(s + 12) & 15`. Draws % 100 from seed 1: 69, 89, 61.

#[test]
fn under_13_every_sound_plays_as_the_one_twelve_keys_on() {
    // Track t on step t; 13 on every step: step s sounds as (s + 12) & 15, one hit a step,
    // on the step's own tick. 1 as 13 (the trace's 0 as 12), 5 as 1 (4 as 0), 16 as 12.
    let mut edits: Vec<Cmd> = (0..16).map(|t| on(t, t)).collect();
    edits.extend((0..16).map(|s| fx(s, 13)));
    let (h, ev) = from_zero(&edits, 16 * STEP - 2);
    let want: Vec<(u32, u8, u8)> = (0..16u8).map(|s| (96 * s as u32, (s + 12) & 15, s)).collect();
    assert_eq!(trigs(&ev), want);
    // The view's fires say what was heard: one each, every sound.
    assert_eq!(h.view()[32..48], [1u8; 16]);
}

#[test]
fn thirteen_punched_in_the_middle_of_a_step_begins_with_the_next_step() {
    // Swing 48: step 1's note fires at 144. fx + 13 go down a frame after tick 96, before
    // that firing: it is still the plain one, (0, 1). Step 2 arrives with the punch: 12.
    let got = with_later(&[cmd(CMD_SWING, 0, 0, 48), on(0, 1), on(0, 2)], &[(after(1), down(FX)), (after(1), down(12))], 3 * STEP - 2);
    assert_eq!(got, [(144, 0, 1), (192, 12, 2)]);
    // Found by a planted fault (Session 28: "13 read off the lane at the firing" passed): a
    // punch writes no lane, so an edit is needed. The lane's step 1 set to 13 a frame after
    // its boundary, before its swung firing: still the plain note. And the other way: 13 on
    // step 2 emptied a frame after its boundary: still shuffled.
    let got = with_later(&[cmd(CMD_SWING, 0, 0, 48), on(0, 1), on(0, 3), fx(3, 13)], &[(after(1), fx(1, 13)), (after(3), fx(3, 0))], 4 * STEP - 2);
    assert_eq!(got, [(144, 0, 1), (336, 12, 3)]);
}

#[test]
fn under_13_a_note_stays_on_its_step_swung_and_a_sound_out_of_the_effects_plays_its_own() {
    // Swing 30, step 1 odd: its notes fire at 126. Track 0 (in) plays as 12; track 1 (out)
    // plays its own, and is not taken by track 13 (whose note would be (1 + 4) & 15 = 5's).
    let got = with_later(&[cmd(CMD_SWING, 0, 0, 30), on(0, 1), on(1, 1), fxsound(1, 0), fx(1, 13)], &[], 2 * STEP - 2);
    assert_eq!(got, [(126, 1, 1), (126, 12, 1)]);
}

#[test]
fn under_13_two_notes_on_one_sound_draw_twice_its_own_first_and_trig_once() {
    // Step 0: track 1 out of the effects at 80, track 5 in at 65 and played as 1. Track 1's
    // own takes 69 (passes), track 5's takes 89 (does not): one trig 1. Drawn the other way
    // round neither would pass. Both draws are taken: track 2's step 1 at 70 then takes 61
    // and fires (had the second been skipped, it would take 89 and not).
    let (h, ev) = from_zero(
        &[on(1, 0), cmd(CMD_PROB, 1, 0, 80), on(5, 0), cmd(CMD_PROB, 5, 0, 65), fxsound(1, 0), fx(0, 13), on(2, 1), cmd(CMD_PROB, 2, 1, 70)],
        2 * STEP - 2,
    );
    assert_eq!(trigs(&ev), [(0, 1, 0), (96, 2, 1)]);
    // `TRIG`'s track is the sound that sounds: the view's fires count 1, never 5.
    assert_eq!((h.view()[32 + 1], h.view()[32 + 5]), (1, 0));
    // Found by a planted fault (Session 28: "a TRIG for each draw" passed): both notes at 100,
    // both pass, and still one trigger.
    let (_, ev) = from_zero(&[on(1, 0), on(5, 0), fxsound(1, 0), fx(0, 13)], STEP - 2);
    assert_eq!(trigs(&ev), [(0, 1, 0)]);
}

#[test]
fn a_tap_under_13_is_its_own_sound() {
    let mut edits: Vec<Cmd> = (0..16).map(|s| fx(s, 13)).collect();
    edits.push(fxsound(0, 1));
    let got = with_later(&edits, &[(after(1), down(0)), (after(1) + 10, up(0))], 2 * STEP - 2);
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].1, 0, "sound 1 tapped is sound 1, not 13");
}

#[test]
fn under_13_a_and_b_are_the_sounding_sound_s_own_or_what_its_step_keeps() {
    let mark = |h: &Host| {
        let v = h.view();
        (u16::from_le_bytes([v[60], v[61]]), u16::from_le_bytes([v[62], v[63]]))
    };
    let sound = |t: u8, slider: u8, v: u32| cmd(CMD_SOUND, t, slider, v);
    let keep = |t: u8, s: u8, a: u16, b: u16| cmd(CMD_KEEP, t, s, (a as u32) << 16 | b as u32);
    // Sound 13 chosen (choosing hits it with its own: 32768, 32768), then its own set to
    // (300, 400). Track 0's note on step 0 keeps (7, 8) and plays as 12: sound 13 is hit with
    // its own, (300, 400), not the note's (7, 8).
    let choose = [down(SOUND), down(12), up(12), up(SOUND)];
    let mut h = Host::new(SR, 1);
    h.block(1, &choose);
    h.block(1, &[sound(12, 0, 300), sound(12, 1, 400), on(0, 0), keep(0, 0, 7, 8), fx(0, 13)]);
    assert_eq!(mark(&h), (32768, 32768));
    h.block(1, &[play()]);
    h.run(STEP, 128, &[]);
    assert_eq!(mark(&h), (300, 400), "the sounding sound's own");
    // Sound 13's own step 0 keeps (1111, 2222), with no note of its own there: that is used.
    let mut h = Host::new(SR, 1);
    h.block(1, &choose);
    h.block(1, &[sound(12, 0, 300), sound(12, 1, 400), on(0, 0), keep(0, 0, 7, 8), keep(12, 0, 1111, 2222), fx(0, 13)]);
    h.block(1, &[play()]);
    h.run(STEP, 128, &[]);
    assert_eq!(mark(&h), (1111, 2222), "what the sounding sound's step keeps");
}

#[test]
fn a_repeat_straight_to_13_and_back_is_the_repeat_s_rule_and_13_is_not_a_run() {
    // Track 0 on steps 1 to 4. 11 on step 1: hits at 96 and 144 from column 1. 13 on step 2:
    // one hit, as 12. 11 again on step 3: a new run from column 3, at 288 and 336. Step 4
    // has no effect: plain.
    let got = with_later(&[on(0, 1), on(0, 2), on(0, 3), on(0, 4), fx(1, 11), fx(2, 13), fx(3, 11)], &[], 5 * STEP - 2);
    assert_eq!(got, [(96, 0, 1), (144, 0, 1), (192, 12, 2), (288, 0, 3), (336, 0, 3), (384, 0, 4)]);
}

#[test]
fn thirteen_named_in_route_1_still_shuffles() {
    // D88 item 3: a named sequencer effect is still the sequencer's.
    let got = with_later(&[cmd(CMD_ROUTE, 1, 0, 1 << 12), on(0, 0), fx(0, 13)], &[], STEP - 2);
    assert_eq!(got, [(0, 12, 0)]);
}

#[test]
fn effects_the_core_does_not_sound_yet_change_nothing_but_the_lane_and_heard() {
    // Every effect but the four repeats and §18's seven, on every step: the same events and
    // the same sound. (Session 16 held 1 to 8 here too, "until §18 is built"; Session 17
    // built it, and `the_seven_sound_effects_change_the_mix_and_nothing_else` holds them.)
    // Session 28 took 13 out (D93: it shuffles; `fx-shuffle` and the shuffle tests hold it).
    let beat: Vec<Cmd> = (0..16).flat_map(|t| [on(t, t), on(t, (t + 5) % 16)]).collect();
    for effect in [4u32, 14, 15, 16] {
        let mut lane: Vec<Cmd> = beat.clone();
        lane.extend((0..16).map(|s| fx(s, effect)));
        let mut cmds: Vec<(u64, Cmd)> = lane.iter().map(|c| (0, *c)).collect();
        cmds.push((0, play()));
        let mut plain: Vec<(u64, Cmd)> = beat.iter().map(|c| (0, *c)).collect();
        plain.push((0, play()));
        let (mut a, mut b) = (Host::new(SR, 1), Host::new(SR, 1));
        let (x, tx) = render(&mut a, 17 * STEP as usize, 128, 17, &cmds);
        let (y, ty) = render(&mut b, 17 * STEP as usize, 128, 17, &plain);
        assert_eq!(tx, ty, "effect {effect}");
        assert!(x.iter().zip(&y).all(|(p, q)| p.to_bits() == q.to_bits()), "effect {effect}: the same samples");
        assert_eq!(heard(&a), effect as u8);
        // A punch of it, too.
        let mut c = Host::new(SR, 1);
        let mut punched: Vec<(u64, Cmd)> = plain.clone();
        punched.extend([(STEP + 1, down(FX)), (STEP + 1, down(effect as u8 - 1))]);
        let (z, tz) = render(&mut c, 17 * STEP as usize, 128, 17, &punched);
        assert_eq!(tz, ty, "effect {effect} punched");
        assert!(z.iter().zip(&y).all(|(p, q)| p.to_bits() == q.to_bits()), "effect {effect} punched: the same samples");
    }
}

#[test]
fn the_seven_sound_effects_change_the_mix_and_nothing_else() {
    // §18: the same events, the same sixteen track channels (direct outputs, D57) but under
    // effect 1 (ABI 14), and a mix that is not the plain one.
    let beat: Vec<Cmd> = (0..16).flat_map(|t| [on(t, t), on(t, (t + 5) % 16)]).collect();
    let mut plain: Vec<(u64, Cmd)> = beat.iter().map(|c| (0, *c)).collect();
    plain.push((0, play()));
    let mut b = Host::new(SR, 1);
    let (y, ty) = render(&mut b, 17 * STEP as usize, 128, 17, &plain);
    for effect in [1u32, 2, 3, 5, 6, 7, 8] {
        let mut cmds: Vec<(u64, Cmd)> = beat.iter().chain(&(0..16).map(|s| fx(s, effect)).collect::<Vec<_>>()).map(|c| (0, *c)).collect();
        cmds.push((0, play()));
        let mut a = Host::new(SR, 1);
        let (x, tx) = render(&mut a, 17 * STEP as usize, 128, 17, &cmds);
        assert_eq!(tx, ty, "effect {effect}: the same events");
        let (mut tracks_same, mut mix_differs) = (true, 0);
        for f in 0..x.len() / 17 {
            tracks_same &= x[f * 17..f * 17 + 16].iter().zip(&y[f * 17..f * 17 + 16]).all(|(p, q)| p.to_bits() == q.to_bits());
            mix_differs += (x[f * 17 + 16].to_bits() != y[f * 17 + 16].to_bits()) as usize;
        }
        // ABI 14 (D98 item 7): effect 1 slows the voices themselves, so the track channels
        // carry them slowed; every other sound effect leaves them as they are.
        assert_eq!(tracks_same, effect != 1, "effect {effect}: the sixteen tracks untouched but by 1");
        assert!(mix_differs > x.len() / 17 / 2, "effect {effect}: the mix differs on {mix_differs} frames");
        assert_eq!(heard(&a), effect as u8);
    }
}

// ---- The view ----

#[test]
fn the_view_says_heard_the_lane_and_the_sounds_and_the_grid_does_not_change() {
    let edits = [on(0, 0), on(3, 2), fx(1, 7), fx(9, 16), fxsound(4, 0), fxsound(12, 0)];
    let mut with = playing(&edits);
    let mut without = playing(&edits[..2]);
    for (i, keys) in [vec![], vec![down(WRITE), up(WRITE)], vec![down(SOUND)], vec![down(PATTERN)], vec![down(BPM)]].into_iter().enumerate() {
        for h in [&mut with, &mut without] {
            h.block(1, &keys);
            h.block(1, &[down(FX), down(5)]);
        }
        let (a, b) = (with.view(), without.view());
        assert_eq!(a[..48], b[..48], "the grid, case {i}");
        assert_eq!(a[56..58], (1u16 << 1 | 1 << 9).to_le_bytes());
        assert_eq!(a[58..60], (0xFFFFu16 & !(1 << 4) & !(1 << 12)).to_le_bytes());
        // §20 (Session 21): 60 to 63 are no longer zero but the second mark; it too is the
        // same with and without the lane.
        assert_eq!(a[60..], b[60..], "the second mark, case {i}");
        for h in [&mut with, &mut without] {
            h.block(1, &[up(5), up(FX), up(SOUND), up(PATTERN), up(BPM)]);
        }
    }
    // Heard, in byte 55: the punch, here key 6.
    with.block(1, &[down(FX), down(5)]);
    assert_eq!(with.view()[55], 6);
}

// ---- Snapshot version 3 ----

#[test]
fn version_3_holds_the_lane_and_the_sounds_after_version_2_s_fields() {
    let mut h = Host::new(SR, 1);
    h.block(1, &[fx(0, 1), fx(7, 9), fx(15, 16), fxsound(0, 0), fxsound(13, 0), down(FX), down(4)]);
    let s = h.save();
    // Since Session 21 the core writes version 4 (§20), which keeps version 3's bytes here.
    assert_eq!(s.len(), SNAP);
    assert_eq!(s[4..12], [4, 0, 1, 0, 0xa8, 5, 0, 0], "version 4, kind 1, payload 1448");
    let mut want = [0u8; 16];
    (want[0], want[7], want[15]) = (1, 9, 16);
    assert_eq!(s[384..400], want);
    assert_eq!(s[400..402], (0xFFFFu16 & !1 & !(1 << 13)).to_le_bytes());
    assert_eq!(s[402..404], [0, 0]);
    assert_eq!(s[SNAP - 4..], crc32(&s[..SNAP - 4]).to_le_bytes());
    // The punch is the moment's: not saved.
    h.block(1, &[up(4), up(FX)]);
    assert_eq!(h.save(), s);
    // Loaded into a fresh engine: the same bytes, the same view of them.
    let mut b = Host::new(SR, 9);
    assert_eq!(b.load(&s), OK);
    assert_eq!(b.save(), s);
    assert_eq!(b.view()[55..60], h.view()[55..60]);
}

#[test]
fn an_older_snapshot_empties_the_lane_and_puts_every_sound_through() {
    let mut src = Host::new(SR, 1);
    src.block(1, &[on(2, 2)]);
    let v3 = src.save();
    let mut v2 = [0u8; SNAP_V2];
    v2[..384].copy_from_slice(&v3[..384]);
    v2[4] = 2;
    v2[8..12].copy_from_slice(&372u32.to_le_bytes());
    let crc = crc32(&v2[..384]);
    v2[384..].copy_from_slice(&crc.to_le_bytes());
    let mut h = Host::new(SR, 1);
    h.block(1, &[fx(3, 3), fxsound(1, 0)]);
    let g = h.generation();
    assert_eq!(h.load(&v2), OK);
    assert_ne!(h.generation(), g);
    // Today's bytes for that pattern, the lane empty and every sound in; and since §20 the
    // one step that is on keeps its sound's own A and B (D75 item 6), which an edit's
    // `STEP` does not.
    let t = h.save();
    assert_eq!(t[..404], v3[..404], "the lane empty, every sound in: today's bytes for that pattern");
    assert_eq!(t[404 + 4..404 + 6], (1u16 << 2).to_le_bytes(), "track 2 keeps step 2");
    let at = 436 + 4 * (16 * 2 + 2);
    assert_eq!(t[at..at + 4], [0, 0x80, 0, 0x80]);
}

#[test]
fn a_lane_byte_past_16_loads_as_0_and_402_403_are_not_read() {
    let mut s = Host::new(SR, 1).save();
    s[384..400].copy_from_slice(&[0, 1, 16, 17, 255, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200]);
    s[402..404].copy_from_slice(&[7, 7]);
    let crc = crc32(&s[..SNAP - 4]);
    s[SNAP - 4..].copy_from_slice(&crc.to_le_bytes());
    let mut h = Host::new(SR, 1);
    assert_eq!(h.load(&s), OK);
    let t = h.save();
    assert_eq!(t[384..400], [0, 1, 16, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert_eq!(t[402..404], [0, 0]);
}

// ---- Generation, over many presses ----

#[test]
fn the_generation_moves_exactly_when_the_snapshot_does_over_20_000_presses_with_fx() {
    // As keys.rs's test, with fx and its edits in it and time passing while playing, so
    // the lane is written by arriving steps. A command goes in a block of its own frame;
    // then a stretch with no command; each is checked alone.
    let mut h = Host::new(SR, 1);
    let mut x = 0x1234_5679u32;
    let mut rnd = move |n: u32| {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        x % n
    };
    let (mut moved, mut still, mut by_time) = (0, 0, 0);
    for i in 0..20_000 {
        let c = match rnd(10) {
            0..=2 => down(rnd(24) as u8),
            3..=4 => up(rnd(24) as u8),
            5 => down([FX, FX, FX, PLAY, FUNCTION, PATTERN, SOUND, BPM, WRITE][rnd(9) as usize]),
            6 => up(FX),
            7 => fx(rnd(17) as u8, rnd(18)),
            8 => fxsound(rnd(17) as u8, rnd(2)),
            _ => cmd(CMD_PARAM, rnd(2) as u8, 0, rnd(65_536)),
        };
        let (snap, g) = (h.save(), h.generation());
        h.block(1, &[c]);
        let changed = h.save() != snap;
        assert_eq!(h.generation() != g, changed, "command {i}: type {} a {} value {}", c.kind, c.a, c.value);
        if changed { moved += 1 } else { still += 1 }

        let (snap, g) = (h.save(), h.generation());
        h.run(rnd(3000) as u64 + 1, 128, &[]);
        let changed = h.save() != snap;
        assert_eq!(h.generation() != g, changed, "the stretch after command {i}");
        by_time += changed as u32;
    }
    assert!(moved > 500 && still > 500 && by_time > 100, "{moved} moved, {still} did not, {by_time} by arriving steps");
}

#[test]
fn a_sound_outside_the_effects_stays_swung_through_a_run() {
    // Swing 24; track 1 out of the effects, on step 1; effect 11 on step 1. Its own step plays
    // at 120, as without the run (planting "not swung during a run" was first caught only by
    // fx-repeat-swing; LEARNINGS.md, Session 10: a fixture should not hold a rule alone).
    let (_, ev) = from_zero(&[cmd(CMD_SWING, 0, 0, 24), on(1, 1), fxsound(1, 0), on(0, 1), fx(1, 11)], 2 * STEP - 2);
    assert_eq!(trigs(&ev), [(96, 0, 1), (120, 1, 1), (144, 0, 1)]);
}
