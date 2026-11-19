//! §6 to §8: the records and the C functions. Only `u32`, `i32` and pointers cross.

use crate::engine::Engine;
use crate::snapshot;

pub const ABI_VERSION: u32 = 1;

pub const CMD_CLOCK: u8 = 1;
pub const CMD_RESET: u8 = 2;
pub const CMD_SOURCE: u8 = 3;
pub const CMD_TEMPO: u8 = 4;
pub const CMD_PLAY: u8 = 5;
pub const CMD_STEP: u8 = 16;
pub const CMD_PROB: u8 = 17;
pub const CMD_SWING: u8 = 18;
pub const CMD_LENGTH: u8 = 19;

pub const EV_STEP: u8 = 1;
pub const EV_TRIG: u8 = 2;

pub const OK: i32 = 0;
pub const ERR_SIZE: i32 = -1;
pub const ERR_MAGIC: i32 = -2;
pub const ERR_VERSION: i32 = -3;
pub const ERR_CRC: i32 = -4;

/// `pi_cmd`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Cmd {
    pub frame: u32,
    pub kind: u8,
    pub a: u8,
    pub b: u8,
    pub slot: u8,
    pub value: u32,
}

/// `pi_event`.
#[repr(C)]
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Event {
    pub frame: u32,
    pub tick: u32,
    pub kind: u8,
    pub track: u8,
    pub step: u8,
    pub slot: u8,
}

const _: () = assert!(size_of::<Cmd>() == 12 && align_of::<Cmd>() == 4);
const _: () = assert!(size_of::<Event>() == 12 && align_of::<Event>() == 4);

/// Where a block's events go. Full means dropped and counted, never written past the end.
pub struct Out<'a> {
    buf: &'a mut [Event],
    n: usize,
    pub frame: u32,
    pub dropped: u32,
}

impl<'a> Out<'a> {
    pub fn new(buf: &'a mut [Event]) -> Self {
        Out { buf, n: 0, frame: 0, dropped: 0 }
    }

    #[inline]
    pub fn push(&mut self, tick: u32, kind: u8, track: u8, step: u8) {
        match self.buf.get_mut(self.n) {
            Some(slot) => {
                *slot = Event { frame: self.frame, tick, kind, track, step, slot: 0 };
                self.n += 1;
            }
            None => self.dropped = self.dropped.saturating_add(1),
        }
    }

    pub fn len(&self) -> u32 {
        self.n as u32
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pi_abi_version() -> u32 {
    ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pi_size() -> u32 {
    size_of::<Engine>() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn pi_align() -> u32 {
    align_of::<Engine>() as u32
}

/// # Safety
/// `mem` is null or points to `size` writable bytes that outlive the engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_init(mem: *mut u8, size: u32, sample_rate: u32, seed: u32) -> *mut Engine {
    let engine = mem.cast::<Engine>();
    if mem.is_null() || (size as usize) < size_of::<Engine>() || !engine.is_aligned() || sample_rate == 0 {
        return core::ptr::null_mut();
    }
    // SAFETY: non-null, big enough and aligned, checked above; writable by the contract.
    unsafe { engine.write(Engine::new(sample_rate, seed)) };
    engine
}

/// # Safety
/// `engine` is null or came from `pi_init`. The same holds for every function below.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_set_sample_rate(engine: *mut Engine, sample_rate: u32) {
    // SAFETY: null or a live engine, by the contract; one thread, so no other reference.
    if let Some(e) = unsafe { engine.as_mut() } {
        e.set_sample_rate(sample_rate);
    }
}

/// # Safety
/// `cmds` is null or points to `ncmds` commands; `events` is null or points to room for
/// `cap` events. Neither overlaps the engine.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_process(
    engine: *mut Engine,
    frames: u32,
    cmds: *const Cmd,
    ncmds: u32,
    events: *mut Event,
    cap: u32,
) -> u32 {
    // SAFETY: as pi_set_sample_rate.
    let Some(e) = (unsafe { engine.as_mut() }) else {
        return 0;
    };
    let cmds: &[Cmd] = if cmds.is_null() || !cmds.is_aligned() {
        &[]
    } else {
        // SAFETY: non-null, aligned, and `ncmds` long by the contract.
        unsafe { core::slice::from_raw_parts(cmds, ncmds as usize) }
    };
    let events: &mut [Event] = if events.is_null() || !events.is_aligned() {
        &mut []
    } else {
        // SAFETY: non-null, aligned, and `cap` long by the contract.
        unsafe { core::slice::from_raw_parts_mut(events, cap as usize) }
    };
    e.process(frames, cmds, events)
}

/// # Safety
/// See `pi_set_sample_rate`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_dropped(engine: *const Engine) -> u32 {
    // SAFETY: null or a live engine.
    unsafe { engine.as_ref() }.map_or(0, |e| e.dropped)
}

/// # Safety
/// See `pi_set_sample_rate`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_generation(engine: *const Engine) -> u32 {
    // SAFETY: null or a live engine.
    unsafe { engine.as_ref() }.map_or(0, |e| e.generation)
}

/// # Safety
/// `buf` is null or points to `cap` writable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_save(engine: *const Engine, buf: *mut u8, cap: u32) -> u32 {
    // SAFETY: null or a live engine.
    let Some(e) = (unsafe { engine.as_ref() }) else {
        return 0;
    };
    if buf.is_null() || (cap as usize) < snapshot::SIZE {
        return 0;
    }
    // SAFETY: non-null and at least SIZE bytes, checked above; u8 has no alignment.
    let out = unsafe { &mut *buf.cast::<[u8; snapshot::SIZE]>() };
    snapshot::save(e, out);
    snapshot::SIZE as u32
}

/// # Safety
/// `buf` is null or points to `len` readable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_load(engine: *mut Engine, buf: *const u8, len: u32) -> i32 {
    // SAFETY: null or a live engine.
    let Some(e) = (unsafe { engine.as_mut() }) else {
        return ERR_SIZE;
    };
    if buf.is_null() {
        return ERR_SIZE;
    }
    // SAFETY: non-null and `len` bytes by the contract.
    let bytes = unsafe { core::slice::from_raw_parts(buf, len as usize) };
    snapshot::load(e, bytes)
}
