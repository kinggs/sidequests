//! §13 and §14 (ABI 4; D51). The workflow: what a press does, and what to light.
//!
//! A host sends what a finger did (`KEY_DOWN`, `KEY_UP`, `PARAM`) and draws the view. Every
//! press becomes the edits and `FIRE` the engine already had, through `Engine::apply`, so a
//! key can do nothing an edit cannot. WORKFLOW.md is the list of presses; each line marked
//! ⚠ below is a reading of the hardware nobody has checked (D29, D57), kept to one line so
//! it is cheap to change.

use crate::abi::*;
use crate::clock::SOURCE_EDGES;
use crate::engine::Engine;
use crate::seq::{STEPS, TRACKS};

pub const KEYS: usize = 23;
pub const KEY_SOUND: usize = 16;
pub const KEY_PATTERN: usize = 17;
pub const KEY_BPM: usize = 18;
pub const KEY_FUNCTION: usize = 19;
pub const KEY_FX: usize = 20;
pub const KEY_PLAY: usize = 21;
pub const KEY_WRITE: usize = 22;

pub const VOLUME_MAX: u8 = 16;
pub const VIEW_SIZE: usize = 64;

/// The bpm key's presets, rising, in thousandths of a bpm.
const PRESETS: [u32; 3] = [80_000, 120_000, 140_000];
/// Fine tempo, bpm + slider B: whole bpm from `FINE_MIN`, over `FINE_SPAN`.
const FINE_MIN: u32 = 60;
const FINE_SPAN: u32 = 180;
const SWING_SPAN: u32 = 48;
const FULL: u32 = 65_535;

pub const FLAG_PLAYING: u8 = 1;
pub const FLAG_WRITE: u8 = 2;
pub const FLAG_EDGES: u8 = 4;
pub const FLAG_STEP: u8 = 8;
pub const FLAG_SOUNDS: u8 = 16;

/// What the keys add to an engine. None of it is in snapshot version 1.
pub struct Keys {
    /// Bit `k`: key `k` is down.
    pub held: u32,
    pub write: bool,
    /// The chosen sound: the track write mode edits and the sliders move.
    pub sel: u8,
    /// 1 to 16. The mix is multiplied by `(volume / 16)²`.
    pub volume: u8,
    /// Something has used the bpm key since it went down, so letting go is not a press.
    bpm_used: bool,
}

impl Keys {
    pub const fn new() -> Self {
        Keys { held: 0, write: false, sel: 0, volume: VOLUME_MAX, bpm_used: false }
    }

    fn down(&self, key: usize) -> bool {
        self.held >> key & 1 == 1
    }

    /// The master gain. Exact: a whole number of 256ths, so volume 16 is × 1 and leaves
    /// every bit of the mix as it was before ABI 4.
    #[inline]
    pub fn gain(&self) -> f32 {
        (self.volume as u32 * self.volume as u32) as f32 / 256.0
    }
}

impl Engine {
    /// An edit, exactly as a host's command would make it: one path, so "as `STEP` would"
    /// and "as `FIRE` does" (§13) cannot drift from the commands themselves.
    fn edit(&mut self, kind: u8, a: usize, b: usize, value: u32, out: &mut Out) {
        self.apply(&Cmd { frame: 0, kind, a: a as u8, b: b as u8, slot: 0, value }, out);
    }

    pub(crate) fn key_down(&mut self, key: usize, out: &mut Out) {
        if key >= KEYS || self.keys.down(key) {
            return; // not a key, or a keyboard repeating one already down
        }
        self.keys.held |= 1 << key;
        match key {
            KEY_PLAY => {
                if self.seq.playing() {
                    self.edit(CMD_PLAY, 0, 0, 0, out);
                } else {
                    // On its own clock the beat starts on this frame, from step 1 ⚠. An
                    // external clock cannot be reset from here: step 1 is its next edge.
                    if self.clock.source() != SOURCE_EDGES {
                        self.edit(CMD_RESET, 0, 0, 0, out);
                    }
                    self.edit(CMD_PLAY, 0, 0, 1, out);
                }
            }
            KEY_WRITE => self.keys.write = !self.keys.write, // on the press, not the release ⚠
            KEY_PATTERN if self.keys.down(KEY_FUNCTION) => self.clear(),
            KEY_BPM => self.keys.bpm_used = false,
            KEY_SOUND | KEY_PATTERN | KEY_FUNCTION | KEY_FX => {} // only held
            n => self.grid_down(n, out),
        }
    }

    /// §13's table for a grid key: the first row that applies.
    fn grid_down(&mut self, n: usize, out: &mut Out) {
        if self.keys.down(KEY_BPM) {
            self.keys.volume = n as u8 + 1;
            self.keys.bpm_used = true;
        } else if self.keys.down(KEY_SOUND) {
            self.keys.sel = n as u8;
            self.edit(CMD_FIRE, n, 0, 0, out); // choosing a sound plays it ⚠
        } else if self.keys.down(KEY_PATTERN) || self.keys.down(KEY_FX) || self.keys.down(KEY_FUNCTION) {
            // Later rows of WORKFLOW.md: patterns, effects.
        } else if self.keys.write {
            let sel = self.keys.sel as usize;
            let on = self.pat.on[sel] >> n & 1;
            self.edit(CMD_STEP, sel, n, 1 - on as u32, out); // a second tap takes it off ⚠
        } else {
            self.edit(CMD_FIRE, n, 0, 0, out); // a tap plays key n's sound and chooses nothing
        }
    }

    /// Function + pattern. Every step off, every probability back to 100 ⚠. Length, swing,
    /// tempo, sliders and volume stay.
    fn clear(&mut self) {
        let mut changed = false;
        for t in 0..TRACKS {
            changed |= self.pat.on[t] != 0 || self.pat.prob[t] != [100; STEPS];
            self.pat.on[t] = 0;
            self.pat.prob[t] = [100; STEPS];
        }
        if changed {
            self.generation = self.generation.wrapping_add(1);
        }
    }

    pub(crate) fn key_up(&mut self, key: usize, out: &mut Out) {
        if key >= KEYS || !self.keys.down(key) {
            return;
        }
        self.keys.held &= !(1 << key);
        if key == KEY_BPM && !self.keys.bpm_used {
            // A clean press: the next preset, on the release and at once ⚠.
            let now = self.clock.mbpm;
            let next = PRESETS.iter().copied().find(|p| *p > now).unwrap_or(PRESETS[0]);
            self.edit(CMD_TEMPO, 0, 0, next, out);
        }
    }

    pub(crate) fn param(&mut self, slider: usize, value: u32, out: &mut Out) {
        if slider > 1 {
            return;
        }
        let v = value.min(FULL);
        // What the cap already shows is not a move: a host can set its slider from the view
        // and nothing comes back (D54). It does not count as using bpm either.
        if v == self.shown(slider) as u32 {
            return;
        }
        if self.keys.down(KEY_BPM) {
            self.keys.bpm_used = true;
            if slider == 0 {
                self.edit(CMD_SWING, 0, 0, (v * SWING_SPAN + FULL / 2) / FULL, out);
            } else {
                let bpm = FINE_MIN + (v * FINE_SPAN + FULL / 2) / FULL; // whole bpm ⚠
                self.edit(CMD_TEMPO, 0, 0, bpm * 1000, out);
            }
        } else {
            self.edit(CMD_SOUND, self.keys.sel as usize, slider, v, out);
        }
    }

    /// §14: where slider `slider`'s cap should sit. With bpm held, swing and the tempo;
    /// otherwise the chosen sound's own.
    fn shown(&self, slider: usize) -> u16 {
        if !self.keys.down(KEY_BPM) {
            return self.voices.params[self.keys.sel as usize & 15][slider & 1];
        }
        if slider == 0 {
            return (self.pat.swing as u32 * FULL / SWING_SPAN) as u16;
        }
        // The tempo in whole bpm, rounded down, and held to the slider's own range.
        let bpm = (self.clock.mbpm / 1000).clamp(FINE_MIN, FINE_MIN + FINE_SPAN);
        ((bpm - FINE_MIN) * FULL / FINE_SPAN) as u16
    }

    /// §14: everything a host draws. Reads only.
    pub fn view(&self, b: &mut [u8; VIEW_SIZE]) {
        *b = [0; VIEW_SIZE];
        let k = &self.keys;
        let sel = k.sel as usize & 15;

        // What the grid shows: the first row of §14's table that applies.
        let (mut field, mut stitch, mut bar, mut sounds) = (0u16, 0u16, 0u16, false);
        if k.down(KEY_BPM) {
            field = (((1u32 << k.volume) - 1) & 0xFFFF) as u16;
        } else if k.down(KEY_SOUND) {
            bar = 1 << sel;
            sounds = true;
        } else if k.down(KEY_PATTERN) {
            bar = 1; // the one pattern
        } else if k.write {
            field = self.pat.on[sel];
            for t in (0..TRACKS).filter(|t| *t != sel) {
                stitch |= self.pat.on[t];
            }
        } else {
            sounds = true;
        }

        let mut flags = 0;
        for (on, bit) in [
            (self.seq.playing(), FLAG_PLAYING),
            (k.write, FLAG_WRITE),
            (self.clock.source() == SOURCE_EDGES, FLAG_EDGES),
            (self.seq.started(), FLAG_STEP),
            (sounds, FLAG_SOUNDS),
        ] {
            if on {
                flags |= bit;
            }
        }

        b[0..4].copy_from_slice(&self.clock.now().to_le_bytes());
        b[4..8].copy_from_slice(&self.clock.mbpm.to_le_bytes());
        b[8..12].copy_from_slice(&k.held.to_le_bytes());
        b[12..14].copy_from_slice(&field.to_le_bytes());
        b[14..16].copy_from_slice(&stitch.to_le_bytes());
        b[16..18].copy_from_slice(&bar.to_le_bytes());
        b[18..20].copy_from_slice(&self.voices.sampled.to_le_bytes());
        b[20..22].copy_from_slice(&self.shown(0).to_le_bytes());
        b[22..24].copy_from_slice(&self.shown(1).to_le_bytes());
        b[24] = flags;
        b[25] = self.seq.step();
        b[26] = k.sel;
        b[27] = k.volume;
        b[28] = self.pat.length;
        b[29] = self.pat.swing;
        b[32..48].copy_from_slice(&self.fires);
        // 48 to 63: zero until the weave (§16).
    }
}
