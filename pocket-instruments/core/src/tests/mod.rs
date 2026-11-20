//! Tests need the standard library; the crate does not. Everything here goes through the C
//! functions, the way a host does, in memory the test owns.

mod fixtures;
mod json;
mod keys;
mod rules;
mod samples;
mod sound;

use crate::abi::*;
use crate::engine::Engine;

pub const CAP: usize = 256;

/// An engine in caller-owned memory, driven through the ABI.
pub struct Host {
    _mem: Vec<u64>,
    pub e: *mut Engine,
    /// Frames processed so far: turns an event's block offset into an absolute frame.
    pub now: u64,
}

impl Host {
    pub fn new(sample_rate: u32, seed: u32) -> Host {
        let words = (pi_size() as usize).div_ceil(8);
        let mut mem = vec![0u64; words];
        let e = unsafe { pi_init(mem.as_mut_ptr().cast(), (words * 8) as u32, sample_rate, seed) };
        assert!(!e.is_null());
        Host { _mem: mem, e, now: 0 }
    }

    /// One block. Events come back with absolute frames.
    pub fn block(&mut self, frames: u32, cmds: &[Cmd]) -> Vec<Event> {
        let mut ev = [Event::default(); CAP];
        let n = unsafe {
            pi_process(self.e, frames, cmds.as_ptr(), cmds.len() as u32, ev.as_mut_ptr(), CAP as u32, core::ptr::null_mut(), 0)
        };
        let out = ev[..n as usize].iter().map(|x| Event { frame: x.frame, ..*x }).collect();
        self.now += frames as u64;
        out
    }

    /// Runs `frames` frames in blocks of `block`, with commands at absolute frames.
    /// Returns (absolute frame, event).
    pub fn run(&mut self, frames: u64, block: u32, cmds: &[(u64, Cmd)]) -> Vec<(u64, Event)> {
        let end = self.now + frames;
        let mut out = Vec::new();
        let mut next = cmds.iter().position(|c| c.0 >= self.now).unwrap_or(cmds.len());
        while self.now < end {
            let start = self.now;
            let n = (end - start).min(block as u64) as u32;
            let mut these = Vec::new();
            while next < cmds.len() && cmds[next].0 < start + n as u64 {
                these.push(Cmd { frame: (cmds[next].0 - start) as u32, ..cmds[next].1 });
                next += 1;
            }
            for ev in self.block(n, &these) {
                out.push((start + ev.frame as u64, ev));
            }
        }
        out
    }

    pub fn dropped(&self) -> u32 {
        unsafe { pi_dropped(self.e) }
    }

    pub fn generation(&self) -> u32 {
        unsafe { pi_generation(self.e) }
    }

    /// §14: the view block, as a host reads it.
    pub fn view(&self) -> [u8; 64] {
        let mut b = [0u8; 64];
        assert_eq!(unsafe { pi_view(self.e, b.as_mut_ptr(), 64) }, 64);
        b
    }

    pub fn save(&self) -> [u8; 316] {
        let mut b = [0u8; 316];
        assert_eq!(unsafe { pi_save(self.e, b.as_mut_ptr(), 316) }, 316);
        b
    }

    pub fn load(&mut self, b: &[u8]) -> i32 {
        unsafe { pi_load(self.e, b.as_ptr(), b.len() as u32) }
    }
}

pub fn cmd(kind: u8, a: u8, b: u8, value: u32) -> Cmd {
    Cmd { frame: 0, kind, a, b, slot: 0, value }
}

pub fn line(ev: &Event) -> String {
    match ev.kind {
        EV_STEP => format!("{} step {}\n", ev.tick, ev.step),
        EV_TRIG => format!("{} trig {} {}\n", ev.tick, ev.track, ev.step),
        k => panic!("unknown event type {k}"),
    }
}

pub fn trace(events: &[(u64, Event)]) -> String {
    events.iter().map(|(_, e)| line(e)).collect()
}

/// §14's text line for a view block: what a fixture holds. The tick and bytes 48 to 63 are
/// left out.
pub fn view_text(b: &[u8; 64]) -> String {
    let u16_at = |i: usize| u16::from_le_bytes([b[i], b[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]);
    let flag = |bit: u8| b[24] >> bit & 1;
    let step = if flag(3) == 1 { b[25].to_string() } else { "-".to_string() };
    let fires: Vec<String> = b[32..48].iter().map(|n| n.to_string()).collect();
    format!(
        "view play={} write={} edges={} sounds={} step={} sel={} vol={} tempo={} len={} swing={} held={:06x} field={:04x} stitch={:04x} bar={:04x} sampled={:04x} a={} b={} fires={}",
        flag(0), flag(1), flag(2), flag(4), step, b[26], b[27], u32_at(4), b[28], b[29],
        u32_at(8), u16_at(12), u16_at(14), u16_at(16), u16_at(18), u16_at(20), u16_at(22), fires.join(","),
    )
}
