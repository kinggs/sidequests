//! §13 and §14: the keys and the view. One test for each row of §13's tables and of §14's
//! "what the grid shows", and the rules beside them. The fixtures (`keys-*.json`) hold the
//! same workflow as a player would use it; these hold each rule alone.

use super::sound::render;
use super::*;

const SR: u32 = 48_000; // at 120 bpm a step is 6000 frames
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
fn param(slider: u8, value: u32) -> Cmd {
    cmd(CMD_PARAM, slider, 0, value)
}

/// One frame with these commands. Returns the events.
fn send(h: &mut Host, cmds: &[Cmd]) -> Vec<Event> {
    h.block(1, cmds)
}

fn fresh() -> Host {
    Host::new(SR, 1)
}

/// The view's fields by name, for tests to read.
struct V([u8; 64]);

impl V {
    fn of(h: &Host) -> V {
        V(h.view())
    }
    fn u16(&self, i: usize) -> u16 {
        u16::from_le_bytes([self.0[i], self.0[i + 1]])
    }
    fn u32(&self, i: usize) -> u32 {
        u32::from_le_bytes([self.0[i], self.0[i + 1], self.0[i + 2], self.0[i + 3]])
    }
    fn tick(&self) -> u32 {
        self.u32(0)
    }
    fn tempo(&self) -> u32 {
        self.u32(4)
    }
    fn held(&self) -> u32 {
        self.u32(8)
    }
    fn field(&self) -> u16 {
        self.u16(12)
    }
    fn stitch(&self) -> u16 {
        self.u16(14)
    }
    fn bar(&self) -> u16 {
        self.u16(16)
    }
    fn sampled(&self) -> u16 {
        self.u16(18)
    }
    fn a(&self) -> u16 {
        self.u16(20)
    }
    fn b(&self) -> u16 {
        self.u16(22)
    }
    fn flag(&self, bit: u8) -> bool {
        self.0[24] >> bit & 1 == 1
    }
    fn playing(&self) -> bool {
        self.flag(0)
    }
    fn write(&self) -> bool {
        self.flag(1)
    }
    fn edges(&self) -> bool {
        self.flag(2)
    }
    fn stepped(&self) -> bool {
        self.flag(3)
    }
    fn sounds(&self) -> bool {
        self.flag(4)
    }
    fn step(&self) -> u8 {
        self.0[25]
    }
    fn sel(&self) -> u8 {
        self.0[26]
    }
    fn volume(&self) -> u8 {
        self.0[27]
    }
    fn length(&self) -> u8 {
        self.0[28]
    }
    fn swing(&self) -> u8 {
        self.0[29]
    }
    fn fires(&self) -> &[u8] {
        &self.0[32..48]
    }
    /// What the grid shows: field, stitch, bar, and whether it is sounds.
    fn grid(&self) -> (u16, u16, u16, bool) {
        (self.field(), self.stitch(), self.bar(), self.sounds())
    }
}

fn trig_tracks(ev: &[Event]) -> Vec<u8> {
    ev.iter().filter(|e| e.kind == EV_TRIG).map(|e| e.track).collect()
}

// ---- §13: KEY_DOWN on a grid key, row by row ----

#[test]
fn bpm_held_a_grid_key_sets_the_volume_and_uses_bpm() {
    let mut h = fresh();
    assert_eq!(V::of(&h).volume(), 16, "volume starts at 16");
    for n in [0u8, 7, 15, 3] {
        let ev = send(&mut h, &[down(BPM), down(n), up(n), up(BPM)]);
        assert!(ev.is_empty(), "a volume key fires nothing");
        let v = V::of(&h);
        assert_eq!(v.volume(), n + 1);
        assert_eq!(v.tempo(), 120_000, "the hold was used, so letting go is not a preset step");
        assert_eq!(v.sel(), 0);
    }
    // It comes before every other row: sound held and write on as well, still the volume.
    let before = h.save();
    let ev = send(&mut h, &[down(WRITE), up(WRITE), down(SOUND), down(BPM), down(9), up(9), up(BPM), up(SOUND)]);
    assert!(ev.is_empty());
    let v = V::of(&h);
    assert_eq!((v.volume(), v.sel()), (10, 0));
    // Version 1's part of the snapshot: no step was written. (The whole snapshot until
    // Session 11; version 2 holds the volume too, at byte 378.)
    assert_eq!(h.save()[..312], before[..312], "no step was written");
}

#[test]
fn sound_held_a_grid_key_chooses_that_sound_and_fires_it() {
    let mut h = fresh();
    h.run(2 * STEP + 10, 128, &[]); // stopped; the clock has reached grid step 2
    let ev = send(&mut h, &[down(SOUND), down(6)]);
    assert_eq!(ev.len(), 1);
    assert_eq!((ev[0].kind, ev[0].track, ev[0].tick / 96, ev[0].step), (EV_TRIG, 6, 2, 0), "as FIRE does");
    assert_eq!(V::of(&h).sel(), 6);
    // Before write: with write on it still chooses, and writes no step.
    let before = h.save();
    let ev = send(&mut h, &[up(6), up(SOUND), down(WRITE), up(WRITE), down(SOUND), down(11), up(11), up(SOUND)]);
    assert_eq!(trig_tracks(&ev), [11]);
    assert_eq!(V::of(&h).sel(), 11);
    assert_eq!(h.save()[..312], before[..312], "no step written; version 2 holds the choice (byte 379)");
    // And before pattern, fx and function.
    let ev = send(&mut h, &[down(PATTERN), down(FX), down(FUNCTION), down(SOUND), down(2)]);
    assert_eq!(trig_tracks(&ev), [2]);
    assert_eq!(V::of(&h).sel(), 2);
}

#[test]
fn pattern_fx_or_function_held_a_grid_key_does_nothing() {
    for holder in [PATTERN, FX, FUNCTION] {
        for write in [false, true] {
            let mut h = fresh();
            if write {
                send(&mut h, &[down(WRITE), up(WRITE)]);
            }
            let (snap, generation) = (h.save(), h.generation());
            let ev = send(&mut h, &[down(holder), down(5), up(5), up(holder)]);
            assert!(ev.is_empty(), "key {holder} held, write {write}: nothing fires");
            assert_eq!(h.save(), snap, "key {holder} held, write {write}: nothing is written");
            assert_eq!(h.generation(), generation);
            let v = V::of(&h);
            assert_eq!((v.sel(), v.volume(), v.write()), (0, 16, write));
        }
    }
}

#[test]
fn write_on_a_grid_key_flips_that_step_of_the_chosen_sound_in_silence() {
    let mut h = fresh();
    send(&mut h, &[down(SOUND), down(3), up(3), up(SOUND), down(WRITE), up(WRITE)]);
    let g = h.generation();
    let ev = send(&mut h, &[down(9), up(9)]);
    assert!(ev.is_empty(), "no sound");
    assert_eq!(V::of(&h).field(), 1 << 9);
    // Two edits, each a change: the step, and since §20 the values it keeps.
    assert_eq!(h.generation(), g + 2, "a step and what it keeps are in the snapshot");
    // Exactly what the STEP edit would have done, and (§20) KEEP with the chosen sound's
    // own A and B. (Sound 4 chosen in both: version 2 holds the choice.)
    let chosen = [down(SOUND), down(3), up(3), up(SOUND)];
    let mut by_edit = fresh();
    send(&mut by_edit, &chosen);
    let unwritten = by_edit.save();
    send(&mut by_edit, &[cmd(CMD_STEP, 3, 9, 1), cmd(CMD_KEEP, 3, 9, 32768 << 16 | 32768)]);
    assert_eq!(h.save(), by_edit.save());
    // A second press takes it off, and forgets what it kept: one edit.
    send(&mut h, &[down(9), up(9)]);
    assert_eq!(V::of(&h).field(), 0);
    assert_eq!(h.save(), unwritten);
    assert_eq!(h.generation(), g + 3);
    // It flips on the press: the release does nothing more.
    send(&mut h, &[down(4)]);
    assert_eq!(V::of(&h).field(), 1 << 4);
    send(&mut h, &[up(4)]);
    assert_eq!(V::of(&h).field(), 1 << 4);
}

#[test]
fn otherwise_a_grid_key_fires_its_own_track_and_chooses_nothing() {
    let mut h = fresh();
    send(&mut h, &[down(SOUND), down(3), up(3), up(SOUND)]);
    let (snap, generation) = (h.save(), h.generation());
    for n in 0..16u8 {
        let ev = send(&mut h, &[down(n), up(n)]);
        assert_eq!(trig_tracks(&ev), [n]);
    }
    let v = V::of(&h);
    assert_eq!(v.sel(), 3, "a tap does not choose");
    assert_eq!(h.save(), snap);
    assert_eq!(h.generation(), generation, "a tap is not in the snapshot");
}

// ---- §13: KEY_DOWN on a function key ----

#[test]
fn play_on_the_table_clock_starts_on_that_frame_from_step_1_with_the_ticks_at_0() {
    let mut h = fresh();
    let mut cmds: Vec<(u64, Cmd)> = (0..16).map(|s| (0, cmd(CMD_STEP, 0, s, 1))).collect();
    // The clock has run two and a bit steps, stopped, when play goes down mid-step.
    let at = 2 * STEP + 1234;
    cmds.push((at, down(PLAY)));
    cmds.push((at + 10, up(PLAY)));
    let ev = h.run(at + 3 * STEP - 50, 128, &cmds); // to just before step 3
    let got: Vec<(u64, u32, u8, u8)> = ev.iter().map(|(f, e)| (*f, e.tick, e.kind, e.step)).collect();
    assert_eq!(
        got,
        [
            (at, 0, EV_STEP, 0),
            (at, 0, EV_TRIG, 0),
            (at + STEP, 96, EV_STEP, 1),
            (at + STEP, 96, EV_TRIG, 1),
            (at + 2 * STEP, 192, EV_STEP, 2),
            (at + 2 * STEP, 192, EV_TRIG, 2),
        ],
        "RESET then PLAY: this frame, tick 0, step 0"
    );
    let v = V::of(&h);
    assert!(v.playing() && v.stepped());

    // Playing: the same key stops it, at once.
    let stop = h.now + 10;
    let ev = h.run(4 * STEP, 128, &[(stop, down(PLAY)), (stop + 5, up(PLAY))]);
    assert!(ev.is_empty(), "nothing after the stop: {:?}", trace(&ev));
    let v = V::of(&h);
    assert!(!v.playing() && !v.stepped());

    // And again: from step 1, not from where it stopped.
    let again = h.now + 77;
    let ev = h.run(STEP, 128, &[(again, down(PLAY))]);
    assert_eq!((ev[0].0, ev[0].1.tick, ev[0].1.kind, ev[0].1.step), (again, 0, EV_STEP, 0));
}

#[test]
fn play_on_edges_waits_for_the_next_edge_and_does_not_reset_the_clock() {
    let mut h = fresh();
    let mut cmds: Vec<(u64, Cmd)> = vec![(0, cmd(CMD_SOURCE, 0, 0, 1)), (0, cmd(CMD_STEP, 0, 0, 1))];
    for n in 0..6u64 {
        cmds.push((n * STEP, cmd(CMD_CLOCK, 0, 0, 0)));
    }
    cmds.sort_by_key(|c| c.0); // stable: commands of one frame keep their order
    let at = 2 * STEP + 1234;
    let i = cmds.iter().position(|c| c.0 > at).unwrap();
    cmds.insert(i, (at, down(PLAY)));
    let ev = h.run(6 * STEP, 128, &cmds);
    let got: Vec<(u64, u32, u8, u8)> = ev.iter().map(|(f, e)| (*f, e.tick, e.kind, e.step)).collect();
    assert_eq!(
        got[..2],
        [(3 * STEP, 3 * 96, EV_STEP, 0), (3 * STEP, 3 * 96, EV_TRIG, 0)],
        "PLAY alone: step 0 at the next edge, and the tick count carries on"
    );
    assert_eq!(got[2], (4 * STEP, 4 * 96, EV_STEP, 1));
    // Between the press and the edge it is playing, with no step to show yet.
    let mut h = fresh();
    send(&mut h, &[cmd(CMD_SOURCE, 0, 0, 1), cmd(CMD_CLOCK, 0, 0, 0), down(PLAY)]);
    let v = V::of(&h);
    assert!(v.playing() && v.edges() && !v.stepped());
    send(&mut h, &[cmd(CMD_CLOCK, 0, 0, 0)]);
    assert!(V::of(&h).stepped());
}

#[test]
fn write_flips_write_mode_on_each_press() {
    let mut h = fresh();
    assert!(!V::of(&h).write(), "off at pi_init");
    send(&mut h, &[down(WRITE)]);
    assert!(V::of(&h).write(), "on at the press");
    send(&mut h, &[up(WRITE)]);
    assert!(V::of(&h).write(), "the release changes nothing");
    send(&mut h, &[down(WRITE), up(WRITE)]);
    assert!(!V::of(&h).write());
    // Whatever else is held.
    send(&mut h, &[down(BPM), down(SOUND), down(FUNCTION), down(WRITE)]);
    assert!(V::of(&h).write());
}

#[test]
fn function_and_pattern_clear_the_steps_and_probabilities_and_nothing_else() {
    let mut h = fresh();
    let mut setup = vec![
        cmd(CMD_STEP, 0, 0, 1),
        cmd(CMD_STEP, 7, 15, 1),
        cmd(CMD_PROB, 2, 3, 40),
        cmd(CMD_LENGTH, 0, 0, 12),
        cmd(CMD_SWING, 0, 0, 20),
        cmd(CMD_TEMPO, 0, 0, 97_000),
        cmd(CMD_SOUND, 0, 0, 1111),
        cmd(CMD_SOUND, 0, 1, 2222),
    ];
    setup.extend([down(BPM), down(4), up(4), up(BPM)]); // volume 5
    send(&mut h, &setup);
    let g = h.generation();

    // Pattern alone is only held.
    let before = h.save();
    send(&mut h, &[down(PATTERN), up(PATTERN)]);
    assert_eq!(h.save(), before);
    // Function first, then pattern: the order the workflow gives.
    assert!(send(&mut h, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]).is_empty());
    assert_eq!(h.generation(), g + 1, "one change, however many steps");

    let mut want = fresh();
    send(&mut want, &[cmd(CMD_LENGTH, 0, 0, 12), cmd(CMD_SWING, 0, 0, 20), cmd(CMD_TEMPO, 0, 0, 97_000)]);
    // Version 2 holds the sliders and the volume as well: they stay too.
    send(&mut want, &[cmd(CMD_SOUND, 0, 0, 1111), cmd(CMD_SOUND, 0, 1, 2222), down(BPM), down(4), up(4), up(BPM)]);
    assert_eq!(h.save(), want.save(), "steps off, probabilities 100; length, swing, tempo, sliders and volume stay");
    let v = V::of(&h);
    assert_eq!((v.volume(), v.a(), v.b()), (5, 1111, 2222), "volume and sliders stay");

    // Clearing an empty pattern changes nothing, so the generation stays.
    send(&mut h, &[down(FUNCTION), down(PATTERN), up(PATTERN), up(FUNCTION)]);
    assert_eq!(h.generation(), g + 1);
    // Pattern first, then function, is not the gesture.
    send(&mut h, &[cmd(CMD_STEP, 1, 1, 1), down(PATTERN), down(FUNCTION), up(FUNCTION), up(PATTERN)]);
    assert_ne!(h.save(), want.save(), "the step is still there");
}

#[test]
fn sound_bpm_function_and_fx_are_only_held_on_the_press() {
    let mut h = fresh();
    send(&mut h, &[cmd(CMD_STEP, 0, 0, 1)]);
    let (snap, g) = (h.save(), h.generation());
    for key in [SOUND, BPM, FUNCTION, FX, PATTERN] {
        let ev = send(&mut h, &[down(key)]);
        assert!(ev.is_empty());
        let v = V::of(&h);
        assert_eq!(v.held(), 1 << key);
        assert_eq!((v.sel(), v.volume(), v.write(), v.playing()), (0, 16, false, false));
        assert_eq!((h.save(), h.generation()), (snap, g), "key {key} down changes nothing saved");
        if key != BPM {
            send(&mut h, &[up(key)]);
            assert_eq!((h.save(), h.generation()), (snap, g), "nor does letting key {key} go");
        } else {
            send(&mut h, &[down(15), up(15), up(key)]); // used (volume 16 again), so its release is not a preset step
        }
        assert_eq!(V::of(&h).held(), 0);
    }
}

// ---- §13: KEY_UP ----

#[test]
fn a_clean_press_of_bpm_steps_the_preset_when_it_is_let_go() {
    let mut h = fresh();
    for want in [140_000, 80_000, 120_000, 140_000] {
        let g = h.generation();
        send(&mut h, &[down(BPM)]);
        assert_ne!(V::of(&h).tempo(), want, "not on the press");
        send(&mut h, &[up(BPM)]);
        assert_eq!(V::of(&h).tempo(), want);
        assert_eq!(h.generation(), g + 1, "the tempo is in the snapshot");
    }
    // From anywhere: the lowest preset above the tempo now, or 80 if there is none.
    for (from, to) in [(30_000, 80_000), (79_999, 80_000), (80_000, 120_000), (97_500, 120_000), (139_999, 140_000), (140_000, 80_000), (300_000, 80_000)] {
        send(&mut h, &[cmd(CMD_TEMPO, 0, 0, from), down(BPM), up(BPM)]);
        assert_eq!(V::of(&h).tempo(), to, "from {from}");
    }
    // A hold that was used leaves nothing behind: the next clean press steps again.
    send(&mut h, &[cmd(CMD_TEMPO, 0, 0, 120_000), down(BPM), down(15), up(15), up(BPM)]);
    assert_eq!(V::of(&h).tempo(), 120_000, "used: no step");
    send(&mut h, &[down(BPM), up(BPM)]);
    assert_eq!(V::of(&h).tempo(), 140_000, "clean again");
    // Other keys held with it are not a use.
    send(&mut h, &[cmd(CMD_TEMPO, 0, 0, 120_000), down(FUNCTION), down(BPM), down(FX), up(FX), up(BPM), up(FUNCTION)]);
    assert_eq!(V::of(&h).tempo(), 140_000);
}

#[test]
fn the_new_tempo_is_at_once() {
    // Playing at 120, a clean press lands mid-bar: the very next step is 140 bpm long.
    let mut h = fresh();
    let at = 2 * STEP + 1; // a frame after grid step 2
    let ev = h.run(5 * STEP, 128, &[(0, down(PLAY)), (5, up(PLAY)), (at, down(BPM)), (at, up(BPM))]);
    let frames: Vec<u64> = ev.iter().filter(|(_, e)| e.kind == EV_STEP).map(|(f, _)| *f).collect();
    assert_eq!(frames[..3], [0, STEP, 2 * STEP]);
    // 140 bpm at 48 kHz is 36000/7 frames a step, about 5142.9; the step under way had one
    // frame at the old tempo.
    let step3 = frames[3] - frames[2];
    assert!((5143..=5144).contains(&step3), "step 2 lasted {step3} frames");
    assert_eq!(frames[4] - frames[3], 5143);
}

#[test]
fn letting_go_a_key_only_stops_it_being_held() {
    let mut h = fresh();
    send(&mut h, &[cmd(CMD_STEP, 0, 0, 1)]);
    for key in (0..23u8).filter(|k| *k != BPM) {
        send(&mut h, &[down(SOUND), down(key)]); // sound held, so no step is written
        let (snap, g, sel) = (h.save(), h.generation(), V::of(&h).sel());
        let write = V::of(&h).write();
        let ev = send(&mut h, &[up(key), up(SOUND)]);
        assert!(ev.is_empty(), "key {key}");
        let v = V::of(&h);
        assert_eq!((h.save(), h.generation(), v.sel(), v.write(), v.held()), (snap, g, sel, write, 0), "key {key}");
    }
}

// ---- §13: total behaviour ----

#[test]
fn a_repeated_key_down_a_stray_key_up_and_a_key_past_22_do_nothing() {
    let mut h = fresh();
    // A keyboard repeats: one tap, one firing.
    let ev = send(&mut h, &[down(4), down(4), down(4)]);
    assert_eq!(trig_tracks(&ev), [4]);
    assert!(send(&mut h, &[down(4)]).is_empty(), "still down in a later block");
    send(&mut h, &[up(4)]);
    assert_eq!(trig_tracks(&send(&mut h, &[down(4), up(4)])), [4], "down again after an up is a new press");
    // Write does not flip twice, play does not stop what it started.
    send(&mut h, &[down(WRITE), down(WRITE), down(PLAY), down(PLAY)]);
    let v = V::of(&h);
    assert!(v.write() && v.playing());
    send(&mut h, &[up(WRITE), up(PLAY)]);

    // A stray KEY_UP: nothing, and in particular no preset step from a bpm that was not down.
    let (snap, g, view) = (h.save(), h.generation(), h.view()[4..].to_vec());
    assert!(send(&mut h, &[up(BPM), up(3), up(PLAY), up(WRITE), up(SOUND)]).is_empty());
    assert_eq!((h.save(), h.generation(), h.view()[4..].to_vec()), (snap, g, view.clone()));

    // Keys that are not keys.
    for key in [23u8, 24, 31, 32, 100, 255] {
        assert!(send(&mut h, &[down(key), up(key)]).is_empty(), "key {key}");
        assert_eq!((h.save(), h.generation(), h.view()[4..].to_vec()), (snap, g, view.clone()), "key {key}");
    }
    // A slider that is not a slider.
    send(&mut h, &[param(2, 5), param(255, 5)]);
    assert_eq!((h.save(), h.generation(), h.view()[4..].to_vec()), (snap, g, view));
}

// ---- §13: PARAM ----

// Until Session 21 (D54) this test was `a_slider_moves_the_chosen_sound_s_own_value`: key 6
// chosen showed its own 32768, and key 1 chosen again its 1000 and 2000. D75 (§20) made the
// sliders the hand's, for every sound, and choosing a sound moves no cap.
#[test]
fn a_slider_moves_that_value_for_every_sound_and_choosing_moves_nothing() {
    let mut h = fresh();
    send(&mut h, &[param(0, 1000), param(1, 2000)]);
    let v = V::of(&h);
    assert_eq!((v.a(), v.b()), (1000, 2000));
    send(&mut h, &[down(SOUND), down(5), up(5), up(SOUND)]);
    let v = V::of(&h);
    assert_eq!((v.a(), v.b()), (1000, 2000), "key 6 chosen: the hand's, not its own of before");
    send(&mut h, &[param(0, 70_000), param(1, 0)]);
    let v = V::of(&h);
    assert_eq!((v.a(), v.b()), (65535, 0), "clamped to 65535");
    send(&mut h, &[down(SOUND), down(0), up(0), up(SOUND)]);
    let v = V::of(&h);
    assert_eq!((v.a(), v.b()), (65535, 0), "and key 1's moved with it");
    let s = h.save();
    for t in 0..16 {
        assert_eq!(s[312 + 4 * t..316 + 4 * t], [0xff, 0xff, 0, 0], "sound {t}'s own A and B are the hand's");
    }
    // An edit still sets one sound apart; the view shows it while that sound is chosen, and
    // the next move of the hand sets all sixteen again.
    send(&mut h, &[cmd(CMD_SOUND, 0, 0, 500)]);
    assert_eq!(V::of(&h).a(), 500);
    send(&mut h, &[down(SOUND), down(5), up(5), up(SOUND)]);
    assert_eq!(V::of(&h).a(), 65535);
    send(&mut h, &[param(0, 600)]);
    let s = h.save();
    assert!((0..16).all(|t| s[312 + 4 * t..314 + 4 * t] == 600u16.to_le_bytes()), "all sixteen at 600");

    // It is the SOUND edit on the chosen track: the next hit is the same sound, bit for bit.
    let hit = |by_param: bool| {
        let mut h = fresh();
        let mut cmds = vec![(0, down(SOUND)), (0, down(9)), (0, up(9)), (0, up(SOUND))];
        cmds.push((10, if by_param { param(0, 60_000) } else { cmd(CMD_SOUND, 9, 0, 60_000) }));
        cmds.push((4000, cmd(CMD_FIRE, 9, 0, 0)));
        render(&mut h, 8000, 128, 1, &cmds).0
    };
    let (a, b) = (hit(true), hit(false));
    assert!(a[4001..].iter().any(|s| *s != 0.0));
    assert!(a.iter().zip(&b).all(|(x, y)| x.to_bits() == y.to_bits()));
    let mut plain = fresh();
    let untouched = render(&mut plain, 8000, 128, 1, &[(0, cmd(CMD_FIRE, 9, 0, 0)), (4000, cmd(CMD_FIRE, 9, 0, 0))]).0;
    assert!(a[4001..].iter().zip(&untouched[4001..]).any(|(x, y)| x != y), "and it is not the default sound");
}

#[test]
fn bpm_held_slider_a_is_swing_and_slider_b_is_the_tempo_in_whole_bpm() {
    let mut h = fresh();
    send(&mut h, &[down(BPM)]);
    // (value × 48 + 32767) / 65535: the nearest of 49 swings.
    for (value, swing) in [(1, 0), (682, 0), (683, 1), (20_000, 15), (32_768, 24), (64_852, 47), (64_853, 48), (65_535, 48), (1 << 20, 48)] {
        send(&mut h, &[param(0, value)]);
        assert_eq!(V::of(&h).swing(), swing, "slider A at {value}");
    }
    send(&mut h, &[param(0, 1)]);
    assert_eq!(V::of(&h).swing(), 0);
    // 60 + (value × 180 + 32767) / 65535: the nearest of 181 tempos, 60 to 240.
    for (value, bpm) in [(0, 60), (182, 60), (183, 61), (21_845, 120), (40_000, 170), (65_352, 239), (65_353, 240), (65_535, 240), (1 << 20, 240)] {
        send(&mut h, &[param(1, value)]);
        assert_eq!(V::of(&h).tempo(), bpm * 1000, "slider B at {value}");
    }
    // Each is the edit: the generation moves when the value does, and only then.
    let g = h.generation();
    send(&mut h, &[param(0, 30_000)]);
    assert_eq!(h.generation(), g + 1);
    send(&mut h, &[param(0, 30_001)]);
    assert_eq!(h.generation(), g + 1, "the same swing again");
    // A used hold: letting go is not a preset step. The chosen sound's sliders did not move.
    send(&mut h, &[up(BPM)]);
    let v = V::of(&h);
    assert_eq!((v.tempo(), v.a(), v.b()), (240_000, 32768, 32768));
}

#[test]
fn param_with_every_shown_value_changes_nothing_and_does_not_use_bpm() {
    // 49 swings: hold bpm, send slider A the value the view shows for it.
    for swing in 0..=48u32 {
        let mut h = fresh();
        send(&mut h, &[cmd(CMD_SWING, 0, 0, swing), down(BPM)]);
        let (shown, snap, g) = (V::of(&h).a(), h.save(), h.generation());
        assert_eq!(shown as u32, swing * 65535 / 48);
        send(&mut h, &[param(0, shown as u32)]);
        assert_eq!((V::of(&h).a(), h.save(), h.generation()), (shown, snap, g), "swing {swing}");
        send(&mut h, &[up(BPM)]);
        assert_eq!(V::of(&h).tempo(), 140_000, "swing {swing}: the hold was not used, so it stepped the preset");
    }
    // 181 tempos.
    for bpm in 60..=240u32 {
        let mut h = fresh();
        send(&mut h, &[cmd(CMD_TEMPO, 0, 0, bpm * 1000), down(BPM)]);
        let (shown, snap, g) = (V::of(&h).b(), h.save(), h.generation());
        assert_eq!(shown as u32, (bpm - 60) * 65535 / 180);
        send(&mut h, &[param(1, shown as u32)]);
        assert_eq!((V::of(&h).b(), h.save(), h.generation()), (shown, snap, g), "{bpm} bpm");
        send(&mut h, &[up(BPM)]);
        let next = [80, 120, 140].into_iter().find(|p| *p > bpm).unwrap_or(80);
        assert_eq!(V::of(&h).tempo(), next * 1000, "{bpm} bpm: the hold was not used");
        // And the two directions agree: one more than shown is a move, to the same tempo.
        let mut h = fresh();
        send(&mut h, &[cmd(CMD_TEMPO, 0, 0, bpm * 1000), down(BPM), param(1, (shown as u32 + 1).min(65535)), up(BPM)]);
        if shown < 65535 {
            assert_eq!(V::of(&h).tempo(), bpm * 1000, "{bpm} bpm: a move that lands where it was, and uses the hold");
        }
    }
    // A tempo between whole bpm, or outside the slider's range, shows as the whole bpm
    // below it, held to 60 to 240; sending that back leaves the tempo alone.
    for (mbpm, shown) in [(97_500, 37 * 65535 / 180), (30_000, 0), (300_000, 65535), (60_999, 0)] {
        let mut h = fresh();
        send(&mut h, &[cmd(CMD_TEMPO, 0, 0, mbpm), down(BPM)]);
        assert_eq!(V::of(&h).b() as u32, shown, "{mbpm}");
        send(&mut h, &[param(1, shown)]);
        assert_eq!(V::of(&h).tempo(), mbpm);
    }
    // Without bpm: the chosen sound's own value, sent back, is nothing either.
    let mut h = fresh();
    send(&mut h, &[param(0, 123)]);
    let view = h.view()[4..].to_vec();
    send(&mut h, &[param(0, 123), param(1, 32768)]);
    assert_eq!(h.view()[4..].to_vec(), view);
}

// ---- §13: generation ----

#[test]
fn the_generation_moves_exactly_when_a_key_changes_what_a_snapshot_holds() {
    // A tap, a hold, play and write leave it alone.
    let mut h = fresh();
    let g = h.generation();
    let quiet = [
        down(3), up(3), down(PLAY), up(PLAY), down(WRITE), up(WRITE), down(WRITE), up(WRITE), down(FX), up(FX),
        down(FUNCTION), up(FUNCTION), down(PATTERN), up(PATTERN), down(SOUND), up(SOUND), down(PLAY), up(PLAY),
    ];
    for c in quiet {
        send(&mut h, &[c]);
        assert_eq!(h.generation(), g, "command {} on key {}", c.kind, c.a);
    }
    assert_eq!(h.save(), fresh().save());
    // Until Session 11 this list also held a sound chosen, a volume set and both sliders
    // moved, which snapshot version 1 did not hold (D59 item 1). Version 2 holds them (§15),
    // so each now moves it once.
    // Since §20 a slider is a SOUND edit on each of the sixteen: sixteen changes.
    let movers = [
        (vec![down(SOUND), down(5), up(5), up(SOUND)], 1),
        (vec![down(BPM), down(2), up(2), up(BPM)], 1),
        (vec![param(0, 9)], 16),
        (vec![param(1, 9)], 16),
    ];
    for (i, (cmds, by)) in movers.iter().enumerate() {
        let g = h.generation();
        send(&mut h, cmds);
        assert_eq!(h.generation(), g + by, "mover {i}");
    }

    // Any sequence at all: the generation moves on exactly the commands that change the
    // snapshot's bytes.
    let mut h = fresh();
    let mut x = 0x2545_F491u32;
    let mut rnd = move |n: u32| {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        x % n
    };
    let (mut moved, mut still) = (0, 0);
    for i in 0..20_000 {
        let c = match rnd(8) {
            0..=2 => down(rnd(24) as u8),
            3..=5 => up(rnd(24) as u8),
            6 => param(rnd(2) as u8, rnd(65_536)),
            _ => down([SOUND, PATTERN, BPM, FUNCTION, WRITE][rnd(5) as usize]),
        };
        let (snap, g) = (h.save(), h.generation());
        send(&mut h, &[c]);
        let changed = h.save() != snap;
        assert_eq!(h.generation() != g, changed, "command {i}: type {} key {} value {}", c.kind, c.a, c.value);
        if changed { moved += 1 } else { still += 1 }
    }
    assert!(moved > 500 && still > 500, "the sequence tried both: {moved} moved, {still} did not");
}

// ---- §13: volume ----

#[test]
fn volume_16_is_the_mix_untouched_and_volume_8_is_a_quarter_of_it() {
    // A beat on four tracks, every voice overlapping.
    let beat = |volume_key: Option<u8>, channels: usize| {
        let mut h = fresh();
        let mut cmds: Vec<(u64, Cmd)> = Vec::new();
        if let Some(k) = volume_key {
            cmds.extend([(0, down(BPM)), (0, down(k)), (0, up(k)), (0, up(BPM))]);
        }
        for (track, step) in [(0, 0), (1, 0), (2, 0), (14, 0), (0, 1), (3, 1), (15, 1), (2, 2), (9, 2)] {
            cmds.push((0, cmd(CMD_STEP, track, step, 1)));
        }
        cmds.push((0, cmd(CMD_PLAY, 0, 0, 1)));
        render(&mut h, 3 * STEP as usize, 128, channels, &cmds).0
    };
    // The bytes volume had no say in: the sixteen direct outputs, summed in track order.
    let tracks = beat(None, 16);
    let sum: Vec<f32> = tracks.chunks(16).map(|f| f[1..].iter().fold(f[0], |a, s| a + *s)).collect();
    assert!(sum.iter().any(|s| s.abs() > 0.5));

    let full = beat(None, 1);
    assert!(full.iter().zip(&sum).all(|(a, b)| a.to_bits() == b.to_bits()), "volume 16 at pi_init: the sum, bit for bit");
    let sixteen = beat(Some(15), 1);
    assert!(sixteen.iter().zip(&sum).all(|(a, b)| a.to_bits() == b.to_bits()), "volume 16 by key: the same");

    let half = beat(Some(7), 1);
    assert!(half.iter().zip(&sum).all(|(a, b)| a.to_bits() == (b * 0.25).to_bits()), "volume 8: (8 / 16)² of it, exactly");
    let one = beat(Some(0), 1);
    assert!(one.iter().zip(&sum).all(|(a, b)| a.to_bits() == (b / 256.0).to_bits()), "volume 1: 1 / 256 of it");

    // The direct outputs are before the master: not scaled.
    let quiet_tracks = beat(Some(0), 16);
    assert!(quiet_tracks.iter().zip(&tracks).all(|(a, b)| a.to_bits() == b.to_bits()));
}

#[test]
fn the_volume_changes_on_the_frame_of_its_key() {
    let mut h = fresh();
    let at = 2000u64;
    let cmds = [(0, cmd(CMD_FIRE, 15, 0, 0)), (at, down(BPM)), (at, down(7)), (at, up(7)), (at, up(BPM))];
    let loud = render(&mut fresh(), 6000, 128, 1, &cmds[..1]).0;
    let got = render(&mut h, 6000, 128, 1, &cmds).0;
    assert!(loud[at as usize..].iter().any(|s| s.abs() > 0.05), "the bass tone is still sounding");
    for (f, (a, b)) in got.iter().zip(&loud).enumerate() {
        let want = if f < at as usize { *b } else { b * 0.25 };
        assert_eq!(a.to_bits(), want.to_bits(), "frame {f}");
    }
}

// ---- §14: what the grid shows, row by row ----

/// Steps on three tracks, key 3 (track 2) chosen.
fn patterned() -> Host {
    let mut h = fresh();
    send(
        &mut h,
        &[cmd(CMD_STEP, 2, 0, 1), cmd(CMD_STEP, 2, 5, 1), cmd(CMD_STEP, 0, 5, 1), cmd(CMD_STEP, 9, 15, 1), down(SOUND), down(2), up(2), up(SOUND)],
    );
    h
}
const MINE: u16 = 1 << 0 | 1 << 5;
const OTHERS: u16 = 1 << 5 | 1 << 15;

// Until Session 20 this was `write_off_the_grid_is_sounds_and_nothing_is_lit`, holding the
// row to (0, 0, 0, true) as D37 had it. D71 and D82 changed the row: the field is the chosen
// sound's steps in both modes.
#[test]
fn write_off_the_field_is_the_chosen_sound_s_steps_with_no_stitch_and_the_grid_is_sounds() {
    let mut h = patterned();
    assert_eq!(V::of(&h).grid(), (MINE, 0, 0, true), "no stitch, though tracks 0 and 9 have steps");
    // The same field as with write on: write changes what a tap does, not the lights.
    send(&mut h, &[down(WRITE), up(WRITE)]);
    assert_eq!(V::of(&h).field(), MINE);
    send(&mut h, &[down(WRITE), up(WRITE)]);
    assert_eq!(V::of(&h).grid(), (MINE, 0, 0, true));
    // It follows the choice, and an edit, like any other change.
    send(&mut h, &[down(SOUND), down(9), up(9), up(SOUND)]);
    assert_eq!(V::of(&h).grid(), (1 << 15, 0, 0, true), "track 9 chosen");
    send(&mut h, &[cmd(CMD_STEP, 9, 3, 1)]);
    assert_eq!(V::of(&h).grid(), (1 << 15 | 1 << 3, 0, 0, true));
    send(&mut h, &[down(SOUND), down(4), up(4), up(SOUND)]);
    assert_eq!(V::of(&h).grid(), (0, 0, 0, true), "a sound with no steps lights nothing");
    // fx and function held take this row too: nothing lights for them.
    let mut h = patterned();
    for key in [FX, FUNCTION] {
        send(&mut h, &[down(key)]);
        assert_eq!(V::of(&h).grid(), (MINE, 0, 0, true), "key {key} held");
        send(&mut h, &[up(key)]);
    }
    // A tap fires its own sound and changes no light: the white is the host's, from `fires`.
    send(&mut h, &[down(5), up(5)]);
    assert_eq!(V::of(&h).grid(), (MINE, 0, 0, true));
    assert_eq!(V::of(&h).fires()[5], 1);
}

/// D82 item 2, "lit in both modes": whatever the pattern, its length and the chosen sound,
/// write off lights exactly the field write on lights. A step past a short length too, as
/// the write-on row has always shown it (§14 names the same steps in both rows).
#[test]
fn the_field_is_the_same_with_write_off_as_with_write_on() {
    let mut h = patterned();
    send(&mut h, &[cmd(CMD_LENGTH, 0, 0, 4)]);
    assert_eq!(V::of(&h).field(), MINE, "step 6 lit past a length of 4");
    let mut rng = 0x2545_f491u32;
    for round in 0..400 {
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        let (t, s) = ((rng & 15) as u8, (rng >> 4 & 15) as u8);
        match rng >> 8 & 3 {
            0 => send(&mut h, &[cmd(CMD_STEP, t, s, rng >> 12 & 1)]),
            1 => send(&mut h, &[down(SOUND), down(t), up(t), up(SOUND)]),
            2 => send(&mut h, &[cmd(CMD_LENGTH, 0, 0, 1 + s as u32)]),
            _ => send(&mut h, &[]),
        };
        let off = V::of(&h);
        send(&mut h, &[down(WRITE), up(WRITE)]);
        let on = V::of(&h);
        send(&mut h, &[down(WRITE), up(WRITE)]);
        assert!(!off.write() && on.write());
        assert_eq!(off.field(), on.field(), "round {round}: length {}, sound {}", off.length(), off.sel());
    }
}

#[test]
fn write_on_the_field_is_the_chosen_sound_s_steps_and_the_stitch_every_other_sound_s() {
    let mut h = patterned();
    send(&mut h, &[down(WRITE), up(WRITE)]);
    assert_eq!(V::of(&h).grid(), (MINE, OTHERS, 0, false), "a key can carry both: step 5");
    // An edit shows like any other change.
    send(&mut h, &[cmd(CMD_STEP, 2, 5, 0), cmd(CMD_STEP, 3, 1, 1)]);
    assert_eq!(V::of(&h).grid(), (1, OTHERS | 2, 0, false));
    // The chosen sound's own steps are never its stitch.
    let mut h = fresh();
    send(&mut h, &[cmd(CMD_STEP, 0, 7, 1), down(WRITE)]);
    assert_eq!(V::of(&h).grid(), (1 << 7, 0, 0, false));
}

#[test]
fn pattern_held_the_bar_is_on_key_1() {
    for write in [false, true] {
        let mut h = patterned();
        if write {
            send(&mut h, &[down(WRITE), up(WRITE)]);
        }
        send(&mut h, &[down(PATTERN)]);
        assert_eq!(V::of(&h).grid(), (0, 0, 1, false), "write {write}");
        send(&mut h, &[up(PATTERN)]);
        assert_eq!(V::of(&h).grid().2, 0);
    }
}

#[test]
fn sound_held_the_grid_is_sounds_with_the_bar_on_the_chosen_one() {
    for write in [false, true] {
        let mut h = patterned();
        if write {
            send(&mut h, &[down(WRITE), up(WRITE)]);
        }
        send(&mut h, &[down(SOUND)]);
        assert_eq!(V::of(&h).grid(), (0, 0, 1 << 2, true), "write {write}");
        send(&mut h, &[down(12)]);
        assert_eq!(V::of(&h).grid(), (0, 0, 1 << 12, true), "the bar follows the choice");
        // Before the pattern row.
        send(&mut h, &[down(PATTERN)]);
        assert_eq!(V::of(&h).grid(), (0, 0, 1 << 12, true));
    }
}

#[test]
fn bpm_held_the_fields_show_the_volume() {
    for write in [false, true] {
        let mut h = patterned();
        if write {
            send(&mut h, &[down(WRITE), up(WRITE)]);
        }
        send(&mut h, &[down(BPM)]);
        assert_eq!(V::of(&h).grid(), (0xFFFF, 0, 0, false), "write {write}: volume 16 is every key");
        for n in [0u8, 1, 8, 14, 15] {
            send(&mut h, &[down(n), up(n)]);
            assert_eq!(V::of(&h).field() as u32, (1u32 << (n + 1)) - 1, "keys 1 to {}", n + 1);
        }
        // Before the sound and pattern rows.
        send(&mut h, &[down(SOUND), down(PATTERN)]);
        assert_eq!(V::of(&h).grid(), (0xFFFF, 0, 0, false));
        send(&mut h, &[up(BPM)]);
        assert_eq!(V::of(&h).grid(), (0, 0, 1 << 2, true), "and the sound row once bpm is let go");
    }
}

// ---- §14: the rest of the block ----

#[test]
fn the_view_at_pi_init() {
    let h = fresh();
    let mut want = [0u8; 64];
    want[4..8].copy_from_slice(&120_000u32.to_le_bytes());
    want[20..22].copy_from_slice(&32768u16.to_le_bytes());
    want[22..24].copy_from_slice(&32768u16.to_le_bytes());
    want[24] = 16; // stopped, write off, the table clock, no step yet, the grid is sounds
    want[27] = 16; // volume
    want[28] = 16; // length
    want[58..60].copy_from_slice(&0xFFFFu16.to_le_bytes()); // §17: every sound through the effects
    want[60..62].copy_from_slice(&32768u16.to_le_bytes()); // §20: no hit yet, so its own
    want[62..64].copy_from_slice(&32768u16.to_le_bytes());
    assert_eq!(h.view(), want);
    assert_eq!(
        view_text(&h.view()),
        "view play=0 write=0 edges=0 sounds=1 step=- sel=0 vol=16 tempo=120000 len=16 swing=0 held=000000 field=0000 stitch=0000 bar=0000 sampled=0000 a=32768 b=32768 fires=0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"
    );
}

#[test]
fn the_view_follows_edits_as_well_as_keys() {
    let mut h = fresh();
    send(
        &mut h,
        &[
            cmd(CMD_TEMPO, 0, 0, 97_500),
            cmd(CMD_LENGTH, 0, 0, 12),
            cmd(CMD_SWING, 0, 0, 33),
            cmd(CMD_VOICE, 3, 0, 1),
            cmd(CMD_VOICE, 15, 0, 1),
            cmd(CMD_SOUND, 0, 0, 77),
            cmd(CMD_SOUND, 0, 1, 88),
            cmd(CMD_SOURCE, 0, 0, 1),
        ],
    );
    let v = V::of(&h);
    assert_eq!((v.tempo(), v.length(), v.swing(), v.sampled(), v.a(), v.b()), (97_500, 12, 33, 1 << 3 | 1 << 15, 77, 88));
    assert!(v.edges());
    assert_eq!(v.0[30..32], [0, 0]);
    // Session 16: 55 to 59 are §17's (held in tests/fx.rs). Since Session 21, 60 to 63 are
    // §20's: no hit yet, so the chosen sound's own, set by edit. Since Session 14, 48 to 54
    // are the weave's (§16; held in tests/weave.rs): nothing has played, so nothing is woven.
    assert_eq!(v.0[48..55], [0; 7], "no cloth before any play");
    assert_eq!(v.0[55..60], [0, 0, 0, 0xff, 0xff], "nothing heard, an empty lane, every sound in");
    assert_eq!(v.0[60..], [77, 0, 88, 0], "the second mark: its own until hit");
}

#[test]
fn held_is_every_key_that_is_down() {
    let mut h = fresh();
    let mut want = 0u32;
    for key in 0..23u8 {
        // Sound first, so no grid key writes or sets the volume on the way.
        send(&mut h, &[down(if key == 0 { SOUND } else { key })]);
        want |= 1 << if key == 0 { SOUND } else { key };
        assert_eq!(V::of(&h).held(), want);
    }
    send(&mut h, &[down(0)]);
    assert_eq!(V::of(&h).held(), 0x7F_FFFF);
    for key in 0..23u8 {
        send(&mut h, &[up(key)]);
    }
    assert_eq!(V::of(&h).held(), 0);
}

#[test]
fn the_playhead_shows_from_the_first_step_until_stop() {
    let mut h = fresh();
    let v = V::of(&h);
    assert!(!v.playing() && !v.stepped());
    // The PLAY edit: playing from its frame; the step arrives with the clock's tick, in the
    // same frame on the table.
    h.run(1, 1, &[(0, cmd(CMD_PLAY, 0, 0, 1))]);
    let v = V::of(&h);
    assert!(v.playing() && v.stepped());
    assert_eq!(v.step(), 0);
    h.run(5 * STEP, 128, &[]);
    assert_eq!(V::of(&h).step(), 5);
    let now = h.now;
    h.run(1, 1, &[(now, cmd(CMD_PLAY, 0, 0, 0))]);
    let v = V::of(&h);
    assert!(!v.playing() && !v.stepped(), "stopped: no playhead");
    assert_eq!(view_text(&v.0).split(' ').nth(5), Some("step=-"));

    // On edges a reset leaves no step to show until the next edge.
    let mut h = fresh();
    send(&mut h, &[cmd(CMD_SOURCE, 0, 0, 1), cmd(CMD_PLAY, 0, 0, 1), cmd(CMD_CLOCK, 0, 0, 0)]);
    send(&mut h, &[cmd(CMD_CLOCK, 0, 0, 0)]);
    let v = V::of(&h);
    assert!(v.stepped());
    assert_eq!(v.step(), 1);
    send(&mut h, &[cmd(CMD_RESET, 0, 0, 0)]);
    let v = V::of(&h);
    assert!(v.playing() && !v.stepped());
    send(&mut h, &[cmd(CMD_CLOCK, 0, 0, 0)]);
    let v = V::of(&h);
    assert!(v.stepped());
    assert_eq!(v.step(), 0);
}

#[test]
fn the_tick_is_the_latest_tick_emitted() {
    let mut h = fresh();
    assert_eq!(V::of(&h).tick(), 0);
    h.run(STEP + 1, 128, &[]); // grid step 1 fell on frame 6000
    assert_eq!(V::of(&h).tick(), 96);
    h.run(STEP / 2, 128, &[]); // 62.5 frames a tick: half a step on is tick 48
    assert_eq!(V::of(&h).tick(), 96 + 48);
}

#[test]
fn fires_counts_every_firing_and_wraps_at_256() {
    let mut h = fresh();
    // The sequencer's and a tap's, on their own tracks.
    let mut cmds: Vec<(u64, Cmd)> = (0..16).map(|s| (0, cmd(CMD_STEP, 3, s, 1))).collect();
    cmds.push((0, cmd(CMD_PLAY, 0, 0, 1)));
    cmds.push((100, down(7)));
    cmds.push((200, down(SOUND)));
    cmds.push((300, down(3)));
    h.run(4 * STEP, 128, &cmds);
    let v = V::of(&h);
    let mut want = [0u8; 16];
    want[3] = 4 + 1;
    want[7] = 1;
    assert_eq!(v.fires(), want);
    // A step that is on and draws no firing is not counted.
    let mut h = fresh();
    h.run(3 * STEP, 128, &[(0, cmd(CMD_STEP, 1, 0, 1)), (0, cmd(CMD_STEP, 1, 1, 1)), (0, cmd(CMD_PROB, 1, 1, 0)), (0, cmd(CMD_PLAY, 0, 0, 1))]);
    assert_eq!(V::of(&h).fires()[1], 1);
    // It wraps, and reading clears nothing.
    let mut h = fresh();
    for i in 0..300u32 {
        send(&mut h, &[cmd(CMD_FIRE, 12, 0, 0)]);
        assert_eq!(V::of(&h).fires()[12] as u32, (i + 1) % 256);
        assert_eq!(V::of(&h).fires()[12] as u32, (i + 1) % 256, "a second look is the same");
    }
    // Neither a reset nor play starts the count again: a host that missed a view loses nothing.
    send(&mut h, &[cmd(CMD_RESET, 0, 0, 0), down(PLAY), up(PLAY), down(PLAY), up(PLAY)]);
    assert_eq!(V::of(&h).fires()[12], 44);
}

#[test]
fn a_firing_is_counted_even_when_its_event_found_no_room() {
    let h = fresh();
    let cmds: Vec<Cmd> = (0..16).map(|t| cmd(CMD_FIRE, t, 0, 0)).collect();
    let mut ev = [Event::default(); 4];
    let got = unsafe { pi_process(h.e, 1, cmds.as_ptr(), 16, ev.as_mut_ptr(), 4, core::ptr::null_mut(), 0) };
    assert_eq!((got, h.dropped()), (4, 12));
    assert_eq!(V::of(&h).fires(), [1; 16]);
    // With no event buffer at all.
    unsafe { pi_process(h.e, 1, cmds.as_ptr(), 16, core::ptr::null_mut(), 0, core::ptr::null_mut(), 0) };
    assert_eq!(V::of(&h).fires(), [2; 16]);
}

#[test]
fn pi_view_moves_nothing_and_refuses_a_buffer_that_is_too_small() {
    let mut h = patterned();
    h.run(STEP, 128, &[(0, down(PLAY))]);
    let (snap, g, dropped) = (h.save(), h.generation(), h.dropped());
    let first = h.view();
    for _ in 0..10 {
        assert_eq!(h.view(), first);
    }
    assert_eq!((h.save(), h.generation(), h.dropped()), (snap, g, dropped));
    // The engine carries on exactly as one that was never looked at.
    let mut other = patterned();
    other.run(STEP, 128, &[(0, down(PLAY))]);
    assert_eq!(trace(&h.run(4 * STEP, 128, &[])), trace(&other.run(4 * STEP, 128, &[])));

    let mut small = [0xAAu8; 64];
    unsafe {
        assert_eq!(pi_view(h.e, small.as_mut_ptr(), 63), 0);
        assert_eq!(small, [0xAA; 64], "and writes nothing");
        assert_eq!(pi_view(h.e, core::ptr::null_mut(), 64), 0);
        assert_eq!(pi_view(core::ptr::null(), small.as_mut_ptr(), 64), 0);
        // A bigger one is written to 64 bytes and no further.
        let mut big = [0xAAu8; 80];
        assert_eq!(pi_view(h.e, big.as_mut_ptr(), 80), 64);
        assert_eq!(big[64..], [0xAA; 16]);
        assert_eq!(big[..64], h.view());
    }
}

// ---- keys obey §3 like every other command ----

#[test]
fn the_block_size_does_not_change_what_keys_do() {
    // A busy passage: every kind of press, at frames that fall anywhere in a block.
    let mut x = 0x1234_5678u32;
    let mut rnd = move |n: u32| {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        x % n
    };
    let mut cmds: Vec<(u64, Cmd)> = vec![(0, down(PLAY)), (3, up(PLAY))];
    let mut at = 10u64;
    for _ in 0..600 {
        at += rnd(400) as u64;
        let key = rnd(16) as u8;
        let hold = 1 + rnd(300) as u64; // some presses overlap the next one
        match rnd(10) {
            0..=3 => cmds.extend([(at, down(key)), (at + hold, up(key))]),
            4 => cmds.extend([(at, down(SOUND)), (at, down(key)), (at + hold, up(key)), (at + hold, up(SOUND))]),
            5 => cmds.extend([(at, down(WRITE)), (at + hold, up(WRITE))]),
            6 => cmds.extend([(at, down(BPM)), (at + 1, down(key)), (at + hold, up(key)), (at + hold, up(BPM))]),
            7 => cmds.extend([(at, down(BPM)), (at + hold, up(BPM))]),
            8 => cmds.extend([(at, down(BPM)), (at + 1, param(rnd(2) as u8, rnd(65_536))), (at + hold, up(BPM))]),
            _ => cmds.push((at, param(rnd(2) as u8, rnd(65_536)))),
        }
    }
    cmds.sort_by_key(|c| c.0); // stable: commands of one frame keep their order
    let frames = at + 2 * STEP;
    let runs: Vec<(String, [u8; 64], [u8; SNAP])> = [1u32, 7, 128, 512, 4096]
        .iter()
        .map(|block| {
            let mut h = fresh();
            let ev = h.run(frames, *block, &cmds);
            assert_eq!(h.dropped(), 0);
            let with_frames: String = ev.iter().map(|(f, e)| format!("{f} {}", line(e))).collect();
            (with_frames, h.view(), h.save())
        })
        .collect();
    let lines = runs[0].0.lines().count();
    assert!(lines > 200 && runs[0].0.contains(" step ") && runs[0].0.contains(" trig "), "the passage fired and stepped: {lines} lines");
    for r in &runs[1..] {
        assert!(r.0 == runs[0].0, "the same events on the same frames");
        assert_eq!(r.1, runs[0].1, "the same view");
        assert_eq!(r.2, runs[0].2, "the same snapshot");
    }
}

#[test]
fn a_step_written_ahead_of_a_swung_playhead_fires_when_the_step_does() {
    // §5: a step's contents are read when it fires. On a swung step that is after its
    // boundary, so a key pressed between the two is heard this time round.
    let mut h = fresh();
    let cmds = [
        (0, cmd(CMD_SWING, 0, 0, 48)),
        (0, down(WRITE)),
        (0, down(PLAY)),
        (STEP + 100, down(1)), // step 1 began at 6000 and fires half a step late, at 9000
    ];
    let ev = h.run(2 * STEP, 128, &cmds);
    let trigs: Vec<(u64, u32, u8)> = ev.iter().filter(|(_, e)| e.kind == EV_TRIG).map(|(f, e)| (*f, e.tick, e.step)).collect();
    assert_eq!(trigs, [(STEP + STEP / 2, 96 + 48, 1)]);
}
