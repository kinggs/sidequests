//! §8, §15, §17 and §20. The snapshot: version 4, 1464 bytes, little-endian. Written and read
//! only here. This core writes version 4 and loads all four versions it has ever written.

use crate::abi::{ERR_CRC, ERR_MAGIC, ERR_SIZE, ERR_VERSION, OK};
use crate::clock::{MBPM_MAX, MBPM_MIN};
use crate::crc::crc32;
use crate::engine::Engine;
use crate::keys::VOLUME_MAX;
use crate::seq::{FX_MAX, STEPS, SWING_MAX, TRACKS};
use crate::voice::PARAM_DEFAULT;

/// What this core writes: version 4 (§20).
pub const SIZE: usize = 1464;
/// Versions 3 (§17), 2 (§15) and 1 (§8), which it still loads.
pub const SIZE_V3: usize = 408;
pub const SIZE_V2: usize = 388;
pub const SIZE_V1: usize = 316;
const MAGIC: [u8; 4] = *b"PKIN";
const VERSION: u16 = 4;
const KIND_RHYTHM: u16 = 1;
const HEADER: usize = 12;
/// The payload size field counts what is between the header and the CRC: 300, 372, 392 and 1448.
const fn payload(size: usize) -> u32 {
    (size - HEADER - 4) as u32
}

/// Each version this core has written: its size. The CRC is always the last four bytes.
fn size_of_version(version: u16) -> Option<usize> {
    match version {
        1 => Some(SIZE_V1),
        2 => Some(SIZE_V2),
        3 => Some(SIZE_V3),
        4 => Some(SIZE),
        _ => None, // newer than this core, or 0, which no core has written
    }
}

fn u16_at(b: &[u8], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}

fn u32_at(b: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]])
}

fn put(b: &mut [u8; SIZE], at: usize, bytes: &[u8]) {
    let mut i = 0;
    while i < bytes.len() && at + i < SIZE {
        b[at + i] = bytes[i];
        i += 1;
    }
}

pub fn save(e: &Engine, b: &mut [u8; SIZE]) {
    *b = [0; SIZE];
    put(b, 0, &MAGIC);
    put(b, 4, &VERSION.to_le_bytes());
    put(b, 6, &KIND_RHYTHM.to_le_bytes());
    put(b, 8, &payload(SIZE).to_le_bytes());
    put(b, 12, &e.seed.to_le_bytes());
    put(b, 16, &e.clock.mbpm.to_le_bytes());
    b[20] = e.pat.length;
    b[21] = e.pat.swing;
    for t in 0..TRACKS {
        put(b, 24 + 2 * t, &e.pat.on[t].to_le_bytes());
        put(b, 56 + STEPS * t, &e.pat.prob[t]);
        // §15: each track's sliders, A then B.
        put(b, 312 + 4 * t, &e.voices.params[t][0].to_le_bytes());
        put(b, 314 + 4 * t, &e.voices.params[t][1].to_le_bytes());
    }
    put(b, 376, &e.voices.sampled.to_le_bytes());
    b[378] = e.keys.volume;
    b[379] = e.keys.sel;
    // 380: the hat cut, 0 until D47 has a setting. 381 to 383: zero.
    // §17: the lane, a byte a step, and the sounds that go through the effects. 402, 403: zero.
    put(b, 384, &e.pat.fx);
    put(b, 400, &e.pat.fx_sounds.to_le_bytes());
    // §20: which steps keep values, then the values, A then B; zero where nothing is kept.
    for t in 0..TRACKS {
        put(b, 404 + 2 * t, &e.pat.keep[t].to_le_bytes());
        for s in 0..STEPS {
            if e.pat.keep[t] >> s & 1 == 1 {
                let at = 436 + 4 * (STEPS * t + s);
                put(b, at, &e.pat.kept[t][s][0].to_le_bytes());
                put(b, at + 2, &e.pat.kept[t][s][1].to_le_bytes());
            }
        }
    }
    let crc = crc32(&b[..SIZE - 4]);
    put(b, SIZE - 4, &crc.to_le_bytes());
}

/// Checks everything before it changes anything, in §8's order, with the size and the
/// CRC's place taken from the version. A longer buffer is read as its first `size` bytes.
/// Values a correct core never writes (a length of 0, a volume of 0) are clamped, as the
/// same values are in a command. What an older version does not hold gets `pi_init`'s values.
pub fn load(e: &mut Engine, buf: &[u8]) -> i32 {
    if buf.len() < HEADER {
        return ERR_SIZE;
    }
    if buf[..4] != MAGIC {
        return ERR_MAGIC;
    }
    let version = u16_at(buf, 4);
    let Some(size) = size_of_version(version) else {
        return ERR_VERSION;
    };
    if buf.len() < size {
        return ERR_SIZE;
    }
    let b = &buf[..size];
    if u16_at(b, 6) != KIND_RHYTHM {
        return ERR_MAGIC;
    }
    if u32_at(b, 8) != payload(size) {
        return ERR_SIZE;
    }
    if u32_at(b, size - 4) != crc32(&b[..size - 4]) {
        return ERR_CRC;
    }

    e.reseed(u32_at(b, 12));
    e.clock.mbpm = u32_at(b, 16).clamp(MBPM_MIN, MBPM_MAX);
    e.pat.length = b[20].clamp(1, STEPS as u8);
    e.pat.swing = b[21].min(SWING_MAX as u8);
    for t in 0..TRACKS {
        e.pat.on[t] = u16_at(b, 24 + 2 * t);
        for s in 0..STEPS {
            e.pat.prob[t][s] = b[56 + STEPS * t + s].min(100);
        }
    }
    if version == 1 {
        e.voices.params = [[PARAM_DEFAULT; 2]; TRACKS];
        e.voices.sampled = 0;
        e.keys.volume = VOLUME_MAX;
        e.keys.sel = 0;
    } else {
        for t in 0..TRACKS {
            e.voices.params[t] = [u16_at(b, 312 + 4 * t), u16_at(b, 314 + 4 * t)];
        }
        e.voices.sampled = u16_at(b, 376);
        // The view's volume row is (1 << volume) - 1: past 16 it would overflow (§14).
        e.keys.volume = b[378].clamp(1, VOLUME_MAX);
        e.keys.sel = b[379].min(TRACKS as u8 - 1);
        // 380, the hat cut: nothing to set while no core writes anything but 0 (§15).
    }
    if version < 3 {
        e.pat.fx = [0; STEPS];
        e.pat.fx_sounds = 0xFFFF;
    } else {
        for s in 0..STEPS {
            let v = b[384 + s];
            e.pat.fx[s] = if v > FX_MAX { 0 } else { v }; // §17: past 16 loads as 0
        }
        e.pat.fx_sounds = u16_at(b, 400);
        // 402 and 403 are not read, like 381 to 383 ⚠ (§15's reading carried on).
    }
    // §20. An older version: every step that is on keeps its sound's own A and B (D75 item
    // 6), so the hand cannot change an old beat. Version 4: what it says, no more; values
    // where the keep bit is clear are not read.
    for t in 0..TRACKS {
        e.pat.keep[t] = if version < 4 { e.pat.on[t] } else { u16_at(b, 404 + 2 * t) };
        for s in 0..STEPS {
            let at = 436 + 4 * (STEPS * t + s);
            e.pat.kept[t][s] = match (e.pat.keep[t] >> s & 1 == 1, version < 4) {
                (false, _) => [0; 2],
                (true, true) => e.voices.params[t],
                (true, false) => [u16_at(b, at), u16_at(b, at + 2)],
            };
        }
    }
    e.generation = e.generation.wrapping_add(1);
    OK
}
