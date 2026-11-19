//! Pocket Instruments: the engine. `ENGINE.md` beside this crate is the specification and
//! `include/pi_engine.h` is the same contract in C. Section numbers below are ENGINE.md's.
//!
//! One engine is one clock feeding one sequencer, in memory the host provides. No standard
//! library, no allocator, no floats, no globals. SPDX-License-Identifier: MIT
#![cfg_attr(not(test), no_std)]
#![deny(unsafe_op_in_unsafe_fn)]

mod abi;
mod clock;
mod crc;
mod engine;
mod seq;
mod snapshot;

#[cfg(test)]
mod tests;

pub use abi::*;

/// Nothing in the core is meant to panic: every index is checked or masked and every
/// division has a guard. If one ever does, it must not unwind into C (P1), so it stops.
#[cfg(not(test))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    #[cfg(target_arch = "wasm32")]
    core::arch::wasm32::unreachable();
    #[cfg(not(target_arch = "wasm32"))]
    {
        unsafe extern "C" {
            fn abort() -> !;
        }
        // SAFETY: abort takes nothing and never returns; every native host has a libc.
        unsafe { abort() }
    }
}
