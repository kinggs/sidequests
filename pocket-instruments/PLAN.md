# Pocket Instruments — working doc for the sessions

The handover between sessions. Each session does its list, ticks its boxes, fills in results in
`PROOFS.md`, writes what surprised it in `LEARNINGS.md`, and leaves a Handover note at the
bottom of this file.

**Start every session with:** "Read `pocket-instruments/PLAN.md` and do Session N."
Design sessions run on Fable; build sessions on Opus, on the laptop (Arch, Omarchy).

## Read first, every session

1. `README.md` in this folder: the doc map and the rules.
2. `DECISIONS.md`: what is decided, proposed and open.
3. `PROOFS.md`: the proof this session runs, and its pass bar. Do not change a pass bar to make
   it pass; record the failure.
4. The **Handover** at the bottom of this doc.

## Ground rules

- No Teenage Engineering material in the repo: no samples, firmware, photos, traced art, logos.
- Nothing visual before P3 passes (D15). No framework before a second instrument (README rule 5).
- Stable Rust only. A nightly feature would block every reproducible build (R13).
- No secrets. Commit direct to `main`, small commits, `make verify` before a push.

## Where the code will go

```
pocket-instruments/
  ENGINE.md     the engine interface: time base, commands, events, snapshot (Session 1)
  core/         the Rust crate: no_std, C ABI
  fixtures/     language-neutral test vectors (JSON) and their expected traces
  harness/      the C++ harness and the Node test that run the fixtures
  rack/         the VCV Rack plugin (Session 3)
  web/          the browser page and worklet (Session 4)
```

## Machine state (checked 2026-11-18)

- Present: g++ 16, clang 23, make, node 26, mise, VCV Rack Free 2.6.6
  (`~/.local/opt/Rack2Free-2.6.6`, user folder `~/.local/share/Rack2`).
- Missing: Rust (rustc, cargo, the `wasm32-unknown-unknown` target), the Rack SDK 2.6.6, cmake.

---

## Session 0 — review and plan (done, 2026-11-18)

- [x] Brief brought in unchanged as `BRIEF-v0.1.md`.
- [x] Its references checked at source; own research on viability and IP (`REFERENCES.md`).
- [x] Critical review (`REVIEW.md`), decision log (`DECISIONS.md`), proof ladder (`PROOFS.md`).
- [x] Owner interviewed: D11 to D15 decided.

## Session 1 — the engine interface (design, Fable)

The one piece of design the build cannot start without (`REVIEW.md` F7). Output is `ENGINE.md`
and the first fixtures, not code.

- [x] Read the patent drawings (O1). Done 2026-11-18, ahead of the session: R4, R5, R6 and
      D20. It narrowed D11; it did not overturn it.
- [ ] Owner: measure the PO-12 (width, height, key pitch, jack spacing) for D16.
- [ ] Owner: list what a press does on the PO-12 in write mode and play mode, for the tiny
      rhythm machine's scope and for `REVIEW.md` F8. An hour with the hardware.
- [ ] `ENGINE.md`: the tick resolution; what a clock edge means; swing on an external clock
      (O4); the command records; the event records; reset; pattern length; the snapshot
      layout and versioning (O5); what the "table" clock owns in the browser.
- [ ] The C header, as the contract both hosts link. Design only.
- [ ] The fixture format, and three fixtures written by hand with their expected traces:
      straight sixteenths, swing with a length change, probability with a fixed seed.
- [ ] Decide D16, D17, D18 and D20 with the owner (now `proposed`).
- [ ] Re-check Phona's Library submission (R16a, O2).

## Session 2 — P1 and P2: one crate, same trace (build, Opus)

Phase 1's first critical step. No Rack, no browser, no sound.

- [ ] Install Rust through mise, pinned by a `rust-toolchain.toml` in this folder (stable, with
      the `wasm32-unknown-unknown` target). Add `target/` to `.gitignore`.
- [ ] `core/`: `no_std`, no `alloc`, `panic = "abort"`, the C ABI from `ENGINE.md`. Sequencing
      only: tracks of sixteen trigger steps, swing, probability, length, reset, external clock
      edges and the table clock.
- [ ] Build both targets with one command. Record sizes. **P1.**
- [ ] `harness/`: run every fixture three ways: `cargo test`; the `.wasm` in Node with
      `node --test`; a C++ program linking the static library. Compare traces byte for byte,
      at three sample rates and three block sizes. **P2.**
- [ ] Wire it into the repo's `make verify`, skipped with a message when cargo is missing (the
      Pocket Editor line is the pattern). The Node test must skip, not fail, when the `.wasm`
      has not been built.
- [ ] Fill in P1 and P2 in `PROOFS.md`; write `LEARNINGS.md`; Handover.

## Session 3 — P3: it runs in Rack (build, Opus)

- [ ] Download the Rack SDK 2.6.6 for Linux outside the repo; set `RACK_DIR`.
- [ ] `rack/`: a blank-panel module, CLOCK in, RESET in, GATE out, calling the core once per
      sample. The Makefile builds the Rust library first, with Rack's CPU flags (R16).
- [ ] Run P3's pass bar in Rack on this machine. The owner watches the scope.
- [ ] Fill in P3. If it fails, D13's fallback applies: stop and write it up.

## Session 4 — P4: it runs in a phone browser (build, Opus)

- [ ] `web/`: a bare page and worklet, raw `.wasm`, a click per step, the trace captured in
      the worklet. Served from GitHub Pages so the owner can open it on a phone.
- [ ] Run P4's pass bar on the browsers listed. Measure tap-to-sound latency.
- [ ] Fill in P4.

## After the gate

Decided when P1 to P4 are in, not before:

- The tiny rhythm machine (D12): one voice in the core first (P7), then the instrument.
- **The showpiece (D19):** the tiny rhythm machine, playable from a link on a phone, with its
  own look inside D20's limits and its own display animation. This is what Teenage Engineering
  is shown, with a Rack module beside it. It has to be good enough to be worth their time.
- The look's gate (P9), then the approach to Teenage Engineering.
- P5 (shipping) and P6 (editing while playing) before a second instrument.
- Extraction to a standalone repository: licence file, name (O3), contribution rules.

---

## Handover

### After Session 0 (2026-11-18)

- Done: the review and the documents. No code, no toolchain installed.
- The three findings that changed the plan: VCV's ethics rule and Teenage Engineering's
  registered rights ended the near-replica look (D11); Rust's shipping route is unproven, so it
  has kill criteria (D13); the first instrument became a tiny rhythm machine (D12).
- The patent drawings were read the same day (O1 closed). They claim the board's key and knob
  arrangement even without the display, and the display artwork separately. D20 turns that
  into what the look must avoid.
- The owner's stance is D19: open about the homage, ask permission, never commercial, and
  show Teenage Engineering something good first.
- D16, D17, D18 and D20 are the reviewer's proposals. The owner has not ruled on them.
- Next: Session 1, on Fable.
