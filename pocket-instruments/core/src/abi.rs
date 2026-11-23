//! §6 to §8, §11, §14, §16, §17 and §20: the records and the C functions. Only `u32`, `i32` and pointers cross.
//! Sound crosses as a pointer to the host's floats, never as a float argument (D44).

use crate::engine::Engine;
use crate::keys;
use crate::seq::TRACKS;
use crate::voice::{LOOP, LOOP_SLIDERS};
use crate::snapshot;
use crate::weave;

pub const ABI_VERSION: u32 = 10;

pub const CMD_CLOCK: u8 = 1;
pub const CMD_RESET: u8 = 2;
pub const CMD_SOURCE: u8 = 3;
pub const CMD_TEMPO: u8 = 4;
pub const CMD_PLAY: u8 = 5;
pub const CMD_STEP: u8 = 16;
pub const CMD_PROB: u8 = 17;
pub const CMD_SWING: u8 = 18;
pub const CMD_LENGTH: u8 = 19;
pub const CMD_SOUND: u8 = 20;
pub const CMD_FIRE: u8 = 21;
pub const CMD_VOICE: u8 = 22;
pub const CMD_FX: u8 = 23;
pub const CMD_FXSOUND: u8 = 24;
pub const CMD_ROUTE: u8 = 25;
pub const CMD_KEEP: u8 = 26;
pub const CMD_KEY_DOWN: u8 = 32;
pub const CMD_KEY_UP: u8 = 33;
pub const CMD_PARAM: u8 = 34;

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
    /// Bit `t`: track `t` fired since this was last cleared. Set even when the event itself
    /// found no room: a full event buffer must not silence a voice.
    pub fired: u16,
    /// §14: how many times each track has fired, wrapping. The engine's count, carried
    /// through the block and handed back at its end. Counted like `fired`: room or not.
    pub fires: [u8; TRACKS],
    /// §18: ticks the clock emitted on this frame, by an edge or by the table. A sweep moves
    /// by them. Cleared each frame, like `fired`.
    pub ticks: u32,
    /// §20: bit `t`, track `t`'s latest firing came from the sequencer (a step or a repeat),
    /// from column `col[t]`, so it plays what that step keeps; clear, a tap or `FIRE`, which
    /// plays the sound's own. Read only for the tracks in `fired`, so never cleared.
    pub stepped: u16,
    pub col: [u8; TRACKS],
    /// §16: bit `t`, track `t` has fired since the last step arrived, by the sequencer or a
    /// tap. The engine's, carried through the block like `fires`. The view's byte 54 counts it.
    pub on_step: u16,
}

impl<'a> Out<'a> {
    pub fn new(buf: &'a mut [Event], fires: [u8; TRACKS], on_step: u16) -> Self {
        Out { buf, n: 0, frame: 0, dropped: 0, fired: 0, fires, ticks: 0, stepped: 0, col: [0; TRACKS], on_step }
    }

    #[inline]
    pub fn push(&mut self, tick: u32, kind: u8, track: u8, step: u8) {
        if kind == EV_TRIG {
            self.fired |= 1 << (track & 15);
            self.on_step |= 1 << (track & 15);
            let count = &mut self.fires[track as usize & 15];
            *count = count.wrapping_add(1);
        } else if kind == EV_STEP {
            self.on_step = 0; // §16: a new step; its own firings come after this event
        }
        match self.buf.get_mut(self.n) {
            Some(slot) => {
                *slot = Event { frame: self.frame, tick, kind, track, step, slot: 0 };
                self.n += 1;
            }
            None => self.dropped = self.dropped.saturating_add(1),
        }
    }

    /// §20: a firing, and where its A and B come from. `column` is a step of the pattern
    /// when `from_seq` (the sequencer's, or a repeat's `run_step`), and the event's step.
    #[inline]
    pub fn trig(&mut self, tick: u32, track: u8, column: u8, from_seq: bool) {
        let t = track as usize & 15;
        if from_seq {
            self.stepped |= 1 << t;
            self.col[t] = column;
        } else {
            self.stepped &= !(1 << t);
        }
        self.push(tick, EV_TRIG, track, column);
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
/// `cap` events; `audio` is null or points to room for `frames * channels` floats. None
/// overlaps the engine or another.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_process(
    engine: *mut Engine,
    frames: u32,
    cmds: *const Cmd,
    ncmds: u32,
    events: *mut Event,
    cap: u32,
    audio: *mut f32,
    channels: u32,
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
    // Sound is asked for with a buffer and a layout this core knows: 1 (the mix), one
    // channel a track, or both, the tracks then the mix (§15); or a loop (§19), which is also
    // read: 18 channels, or 50 with the sliders. Anything else is no sound at all, and the
    // voices do not run.
    let len = (frames as usize).checked_mul(channels as usize);
    let c = channels as usize;
    let known = c == 1 || c == TRACKS || c == TRACKS + 1 || c == LOOP || c == LOOP_SLIDERS;
    let audio: Option<&mut [f32]> = match len {
        Some(len) if !audio.is_null() && audio.is_aligned() && known => {
            // SAFETY: non-null, aligned, and `frames * channels` long by the contract.
            Some(unsafe { core::slice::from_raw_parts_mut(audio, len) })
        }
        _ => None,
    };
    e.process(frames, cmds, events, audio, channels as usize)
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

/// §14: everything a host draws, as one block. Returns `VIEW_SIZE` (64), or 0 if `cap` is
/// too small. Moves nothing: not the generation, not a counter.
///
/// # Safety
/// `engine` as `pi_set_sample_rate`. `buf` is null or points to `cap` writable bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_view(engine: *const Engine, buf: *mut u8, cap: u32) -> u32 {
    // SAFETY: null or a live engine.
    let Some(e) = (unsafe { engine.as_ref() }) else {
        return 0;
    };
    if buf.is_null() || (cap as usize) < keys::VIEW_SIZE {
        return 0;
    }
    // SAFETY: non-null and at least VIEW_SIZE bytes, checked above; u8 has no alignment.
    e.view(unsafe { &mut *buf.cast::<[u8; keys::VIEW_SIZE]>() });
    keys::VIEW_SIZE as u32
}

/// D50: track `track`'s sample, `frames` 16-bit mono frames at 44.1 kHz. Null or 0 frames
/// clears it. Returns 1 if the sample was taken, 0 if cleared or refused (a track past 15,
/// or data not aligned to 2 bytes). A sample that was sounding stops.
///
/// # Safety
/// `engine` as `pi_set_sample_rate`. `data` is null or points to `frames` readable i16s that
/// stay readable and unchanged until this track's sample is set again, or the engine is
/// re-initialised or dropped. The only pointer the core keeps.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_set_sample(engine: *mut Engine, track: u32, data: *const i16, frames: u32) -> u32 {
    // SAFETY: null or a live engine, by the contract.
    let Some(e) = (unsafe { engine.as_mut() }) else {
        return 0;
    };
    let Some(s) = e.voices.samples.get_mut(track as usize) else {
        return 0;
    };
    if data.is_null() || frames == 0 || !data.is_aligned() {
        s.set(core::ptr::null(), 0);
        return 0;
    }
    s.set(data, frames);
    1
}

/// §16: the display's weave, as cells. A pure function of a view block: no engine, so §8's
/// one-thread rule does not reach it and any thread may call it. `view` is `len` bytes of a
/// view (at least `VIEW_SIZE`); `flags` bit 0 is reduced motion. Writes `WEAVE_W × WEAVE_H`
/// palette numbers to `out`, row by row from the top left, and returns that count; 0, and
/// nothing written, if a pointer is null, `len` is short or `cap` is too small.
///
/// # Safety
/// `view` is null or points to `len` readable bytes; `out` is null or points to `cap`
/// writable bytes; they do not overlap.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pi_weave(view: *const u8, len: u32, flags: u32, out: *mut u8, cap: u32) -> u32 {
    if view.is_null() || out.is_null() || (len as usize) < keys::VIEW_SIZE || (cap as usize) < weave::CELLS {
        return 0;
    }
    // SAFETY: non-null and at least VIEW_SIZE readable bytes, checked above.
    let view = unsafe { &*view.cast::<[u8; keys::VIEW_SIZE]>() };
    // SAFETY: non-null and at least CELLS writable bytes, checked above; u8 has no alignment.
    let out = unsafe { &mut *out.cast::<[u8; weave::CELLS]>() };
    weave::weave(view, flags, out);
    weave::CELLS as u32
}
