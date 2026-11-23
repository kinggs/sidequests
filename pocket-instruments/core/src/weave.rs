//! §16 (D53; drawn in Session 14 as a first attempt, D84). The display's animation: a cloth
//! being woven, as a grid of 1 mm cells. A pure function of a view block: no engine, no
//! state, no floats. Both hosts paint these cells and neither holds a drawing rule, so a
//! change to the look is a change here, once.
//!
//! The loom, left to right: the cloth (it grows to the right), the beater at its edge, then
//! the bare warp, which the shuttle crosses. `design/DESIGN.md`, "The animation", has the
//! seven rules; each is marked below where it is drawn. Every number in "THE DRAWING" is a
//! first value, for the owner's eye.

use crate::clock::TICKS_PER_STEP;
use crate::keys::{FLAG_PLAYING, FLAG_STEP, VIEW_SIZE};

/// The weave's area on the display in whole mm (`design/loom/frames.html`: 468 by 92 px at
/// 6 px a mm).
pub const W: usize = 78;
pub const H: usize = 15;
pub const CELLS: usize = W * H;

/// `flags` bit 0: reduced motion. The shuttle jumps; nothing flashes.
pub const REDUCED: u32 = 1;

// The palette: `design/DESIGN.md`'s tokens by number. 0 to 4 are §16's; 5 and 6 were added
// with the drawing (D84), because the designed picture's cloth is tile and madder.
pub const DISPLAY: u8 = 0;
pub const THREAD: u8 = 1;
pub const ECRU: u8 = 2;
pub const WHITE: u8 = 3;
pub const OCHRE: u8 = 4;
pub const TILE: u8 = 5;
pub const MADDER: u8 = 6;

// ---- THE DRAWING: first values (D84) ----

/// Rule 1: a diamond is a beat, four steps, a quarter of it a step. 16 cells: a diamond 15
/// wide and one cell of plain cloth before the next.
const BEAT: usize = 16;
const QUARTER: usize = BEAT / 4;
/// The diamond's middle cell inside its beat, and the cloth's middle row.
const MID_X: i32 = 7;
const MID_Y: i32 = (H / 2) as i32;
/// Rule 2: the cloth shows this many beats, the one being woven last; then it scrolls.
const BEATS: usize = 4;
/// Rule 3: the diamond's reach from its middle cell, by how many of the beat's four steps
/// had a sound set: none, the centre stitch alone; all four, the whole height.
const REACH: [i32; 5] = [0, 2, 4, 6, 7];
/// The diamond's bands, from the middle out: ecru to here, ochre to here, madder beyond.
const ECRU_TO: i32 = 2;
const OCHRE_TO: i32 = 4;
/// Rule 4: the beater is 1 cell on a silent step and a cell more for each sound, to 4.
const BEATER_MAX: usize = 4;
/// The warp: a thread on every third row (five of them, the middle row one), from the
/// cloth's edge to the right. Every other row was tried first and read as a wall of stripes.
const WARP_EVERY: usize = 3;
const WARP_FROM: usize = 1;
/// Rule 5: the shuttle, 3 by 4 cells, its middle column this far right of the cloth's edge
/// (clear of the widest beater), trailing a thread one cell wide.
const SHUTTLE_AT: usize = 7;
const SHUTTLE_H: usize = 4;
/// Rule 6: with two sounds or more on the step, this many of the newest rows go white, for
/// this many ticks from the tick the step's sounds fire on (a quarter of a step: D84).
const FLASH_ROWS: usize = 3;
const FLASH_TICKS: u32 = TICKS_PER_STEP / 4;
const FLASH_FROM: u8 = 2;

#[inline(never)]
pub fn weave(v: &[u8; VIEW_SIZE], flags: u32, out: &mut [u8; CELLS]) {
    let tick = u32::from_le_bytes([v[0], v[1], v[2], v[3]]);
    let woven = u32::from_le_bytes([v[48], v[49], v[50], v[51]]);
    let wove = u16::from_le_bytes([v[52], v[53]]);
    // Rule 7: stopped (or playing with no step yet, on an outside clock) nothing below may
    // read the tick, which keeps counting, or the firings.
    let moving = v[24] & FLAG_PLAYING != 0 && v[24] & FLAG_STEP != 0 && woven != 0;
    let fired = if moving { v[54] } else { 0 };
    let reduced = flags & REDUCED != 0;
    let phase = tick % TICKS_PER_STEP;

    // Rules 1 and 2: where the cloth's edge is. The beat being woven is the last one shown;
    // `before` whole beats stand to its left, three at most, so past the fourth beat the
    // cloth has scrolled left a diamond a beat.
    let (before, quarters) = match woven {
        0 => (0, 0),
        n => ((((n - 1) / 4) as usize).min(BEATS - 1), ((n - 1) % 4) as usize + 1),
    };
    let edge = before * BEAT + quarters * QUARTER;

    // Rule 3: each beat's diamond reaches as far as its density says, as far as the beat is
    // known. The steps of a beat among the last sixteen woven: the newest beat has
    // `quarters` of them (bits 0 up), each beat before it the four bits above.
    let mut reach = [0i32; BEATS];
    for (slot, r) in reach.iter_mut().enumerate().take(before + 1) {
        let (shift, count) = if slot == before { (0, quarters) } else { (quarters + 4 * (before - slot - 1), 4) };
        let steps = (wove >> shift) & ((1 << count) - 1);
        *r = REACH[(steps.count_ones() as usize).min(4)];
    }

    // Rule 6: the newest rows flash white as two or more sounds fire together. A swung
    // step's sounds fire late (§5), so the flash starts with them.
    let swung = if (tick / TICKS_PER_STEP) & 1 == 1 { v[29] as u32 } else { 0 };
    let flash = moving && !reduced && fired >= FLASH_FROM && phase >= swung && phase - swung < FLASH_TICKS;

    // Rule 4: the beater, at the cloth's edge.
    let beater = (1 + fired as usize).min(BEATER_MAX);

    // Rules 5 and 7: the shuttle. Stopped, it rests at the top. Moving, it crosses once a
    // step: down on the cloth's odd steps and back on its even ones, trailing its thread
    // from the side it left. With reduced motion it is at the far side for the whole step.
    let travel = (H - SHUTTLE_H) as u32;
    let (mut top, mut trail) = (0, 0..0);
    if moving {
        let gone = if reduced { travel } else { phase * (travel + 1) / TICKS_PER_STEP };
        let down = woven & 1 == 1;
        top = if down { gone } else { travel - gone } as usize;
        trail = if down { 0..top } else { top + SHUTTLE_H..H };
    }

    for (i, cell) in out.iter_mut().enumerate() {
        let (x, y) = (i % W, i / W);
        *cell = if x < edge {
            // The cloth: plain ground, and a diamond a beat.
            let d = ((x % BEAT) as i32 - MID_X).abs() + (y as i32 - MID_Y).abs();
            if flash && x + FLASH_ROWS >= edge {
                WHITE
            } else if d > reach[(x / BEAT) & (BEATS - 1)] {
                TILE
            } else if d <= ECRU_TO {
                ECRU
            } else if d <= OCHRE_TO {
                OCHRE
            } else {
                MADDER
            }
        } else if x < edge + beater {
            OCHRE
        } else {
            // The bare warp, and the shuttle crossing it.
            let dx = x - edge;
            let body = dx + 1 >= SHUTTLE_AT && dx <= SHUTTLE_AT + 1 && y >= top && y < top + SHUTTLE_H;
            if body || (dx == SHUTTLE_AT && trail.contains(&y)) {
                ECRU
            } else if y % WARP_EVERY == WARP_FROM {
                THREAD
            } else {
                DISPLAY
            }
        };
    }
}
