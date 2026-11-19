//! §8. The snapshot, version 1: 316 bytes, little-endian. Written and read only here.

use crate::abi::{ERR_CRC, ERR_MAGIC, ERR_SIZE, ERR_VERSION, OK};
use crate::clock::{MBPM_MAX, MBPM_MIN};
use crate::crc::crc32;
use crate::engine::Engine;
use crate::seq::{STEPS, SWING_MAX, TRACKS};

pub const SIZE: usize = 316;
const MAGIC: [u8; 4] = *b"PKIN";
const VERSION: u16 = 1;
const KIND_RHYTHM: u16 = 1;
const PAYLOAD: u32 = 300;
const HEADER: usize = 12;
const CRC_AT: usize = SIZE - 4;

fn u16_at(b: &[u8; SIZE], at: usize) -> u16 {
    u16::from_le_bytes([b[at], b[at + 1]])
}

fn u32_at(b: &[u8; SIZE], at: usize) -> u32 {
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
    put(b, 8, &PAYLOAD.to_le_bytes());
    put(b, 12, &e.seed.to_le_bytes());
    put(b, 16, &e.clock.mbpm.to_le_bytes());
    b[20] = e.pat.length;
    b[21] = e.pat.swing;
    for t in 0..TRACKS {
        put(b, 24 + 2 * t, &e.pat.on[t].to_le_bytes());
        put(b, 56 + STEPS * t, &e.pat.prob[t]);
    }
    let crc = crc32(&b[..CRC_AT]);
    put(b, CRC_AT, &crc.to_le_bytes());
}

/// Checks everything before it changes anything. A longer buffer is read as its first 316
/// bytes. Values a correct core never writes (a length of 0, a probability of 200) are
/// clamped, as the same values are in a command.
pub fn load(e: &mut Engine, buf: &[u8]) -> i32 {
    if buf.len() < HEADER {
        return ERR_SIZE;
    }
    if buf[..4] != MAGIC {
        return ERR_MAGIC;
    }
    let version = u16::from_le_bytes([buf[4], buf[5]]);
    if version != VERSION {
        // Newer than this core, or 0, which no core has written.
        return ERR_VERSION;
    }
    let Some(b) = buf.first_chunk::<SIZE>() else {
        return ERR_SIZE;
    };
    if u16_at(b, 6) != KIND_RHYTHM {
        return ERR_MAGIC;
    }
    if u32_at(b, 8) != PAYLOAD {
        return ERR_SIZE;
    }
    if u32_at(b, CRC_AT) != crc32(&b[..CRC_AT]) {
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
    e.generation = e.generation.wrapping_add(1);
    OK
}
