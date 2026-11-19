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
  web/          the browser page and worklet (Session 3; the phones in Session 4)
```

## Machine state (checked 2026-11-18)

- Present: g++ 16, clang 23, make, node 26, mise, VCV Rack Free 2.6.6
  (`~/.local/opt/Rack2Free-2.6.6`, user folder `~/.local/share/Rack2`).
- Since Session 2 (2026-11-19): Rust 1.100.0 through mise, with `wasm32-unknown-unknown`.
  It resolves only inside this folder (`mise.toml`); there is no global Rust.
- Since 2026-11-19, after Session 2: the Rack SDK 2.6.6 for Linux, at
  `~/.local/opt/Rack-SDK-2.6.6` (from vcvrack.com; the zip's sha256 began `420da245`). A blank
  plugin built against it with g++ in one `make`. `RACK_DIR` is not set in any shell file:
  give the plugin's Makefile that path as its default. clang's ThreadSanitizer reports a
  planted race, so P6's harness can run here.
- Missing: cmake (the SDK does not need it), Playwright, MinGW, lld, any macOS SDK, `xxd`,
  `/usr/bin/time`. Chromium 155 is present, and Firefox 158 (found at the start of Session 3;
  this line used to say it was missing).
- Since Session 3: rustup also holds `x86_64-pc-windows-gnu`, `x86_64-apple-darwin` and
  `aarch64-apple-darwin` (for `make targets`). The plugin is installed in
  `~/.local/share/Rack2/plugins-lin-x64/`. Rack runs headless: `rack/selftest.sh` (R40).
- ⚠ In Rack's Audio module use the PulseAudio driver, not ALSA. On ALSA Rack takes the
  Scarlett whole and the desktop loses it until its profile is switched off and on again
  (it happened during P3's ten minutes; the fix is in `~/.dotfiles/docs/kenny-archy.md`).
  `rack/patch/patch.json` names no driver, so Rack picks; choose by hand.
- Found in Session 6: Docker is installed but the user is not in the `docker` group, so
  `rack/ci-linux.sh` cannot be rehearsed here. CI runs it; nothing local needs it.

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
- [x] `ENGINE.md`: the tick resolution; what a clock edge means; swing on an external clock
      (O4); the command records; the event records; reset; pattern length; the snapshot
      layout and versioning (O5); what the "table" clock owns in the browser.
- [x] The C header, as the contract both hosts link. Design only. `core/include/pi_engine.h`;
      it compiles as C and C++, natively and for wasm32, with the record sizes asserted.
- [x] The fixture format, and three fixtures written by hand with their expected traces:
      straight sixteenths, swing with a length change, probability with a fixed seed.
- [x] Decide D16, D17, D18 and D20 with the owner. D17, D18, D20 decided (D27); D16 waits for
      the measurements.
- [x] How combinations work with one pointer in Rack: function keys latch (D23).
- [x] Decide D23's proposal: keyboard and MIDI mapping for the keys, per host. D28.
- [x] Read Teenage Engineering's published PO-12 guide for the workflow and write it down in
      our own words: `WORKFLOW.md` (R23).
- [ ] Owner: confirm each row of `WORKFLOW.md` on the hardware and answer its eleven
      questions. This replaces the two owner items above; it is the same hour.
- [x] Owner, in Claude Design: the look, from D21's three blocks and D20's avoid list. Export
      to `pocket-instruments/design/`. Done 2026-11-19: Loom (D36), `design/DESIGN.md`.
- [x] Re-check Phona's Library submission (R16a, O2). Not submitted yet: R16b.

## Session 2 — P1 and P2: one crate, same trace (build; done 2026-11-19)

Phase 1's first critical step. No Rack, no browser, no sound.

- [x] Install Rust through mise, pinned by a `rust-toolchain.toml` in this folder (stable, with
      the `wasm32-unknown-unknown` target). Add `target/` to `.gitignore`.
- [x] `core/`: `no_std`, no `alloc`, `panic = "abort"`, the C ABI in `core/include/pi_engine.h`.
      Build it from `ENGINE.md`: a clock module and a sequencer module, the snapshot, and the
      CRC. Sequencing only. Keys and sliders are ignored (D26).
- [x] Build both targets with one command. Record sizes. **P1.** `make build`.
- [x] Add a fourth fixture, a reset in the middle of a bar, with `fixtures/README.md`'s rule
      for it. Work its trace out from `ENGINE.md` before running the core, not after.
- [x] A snapshot test: save, load into a fresh engine, same trace; a corrupted byte is refused.
- [x] `harness/`: run every fixture three ways: `cargo test`; the `.wasm` in Node with
      `node --test`; a C++ program linking the static library. Compare traces byte for byte,
      at three sample rates and three block sizes, on the table clock and on edges
      (`fixtures/README.md` says how). **P2.** If the core and a trace disagree, `ENGINE.md`
      decides which is wrong; never edit a trace to make the build pass.
- [x] Check the browser memory plan (`ENGINE.md` §8 ⚠): the Node harness grows the module's
      memory by a page and puts the engine and buffers there, with no glue.
- [x] Wire it into the repo's `make verify`, skipped with a message when cargo is missing (the
      Pocket Editor line is the pattern). The Node test must skip, not fail, when the `.wasm`
      has not been built.
- [x] Fill in P1 and P2 in `PROOFS.md`; write `LEARNINGS.md`; Handover.

## Session 3 — every proof that can still change the architecture (build, Fable)

Widened by the owner on 2026-11-19, before it started. It was P3 alone, on Opus, and
Session 4 was all of P4. Why widened: P3 to P7 can each still change the engine interface,
so they are front-loaded into one session and the sessions after it build without deciding.
In this order, which is by how much of the plan dies if one fails. If time runs short, drop
from the bottom, never the top, and say what was dropped. A failed proof is a result: write
it up and carry on, except P3 (D13: stop).

Rules that stand: each pass bar's check is written before it runs; no bar in `PROOFS.md`
changes; no trace is edited; every new check is shown to fail once on a fault put in on
purpose; stable Rust only; nothing visual (no panel art, nothing in `design/` or
`samples/`). Built on D42 as written, though it is still proposed.

- [x] Download the Rack SDK 2.6.6 for Linux outside the repo. Done 2026-11-19, ahead of the
      session: see Machine state.
- [x] **1. P3 in full.** Passed: the machine's half, then the owner's ten minutes the same afternoon.
      `rack/`: a blank-panel module, CLOCK in, RESET in, GATE out, the core
      called once per sample. `RACK_DIR` defaults to `~/.local/opt/Rack-SDK-2.6.6` in the
      Makefile. The Makefile builds the Rust library first, with Rack's CPU flags (R16), and
      links it as `harness/harness.cpp` does. Watch for `rust_eh_personality` at link
      (`PROOFS.md` P1 ⚠). The owner watches the scope for the ten minutes.
- [x] **2. P6, the ThreadSanitizer half.** Done, with a finding (D43). The save in Rack is the owner's.
      The C++ harness runs the core on one thread while
      another edits steps and takes snapshots, the way a host really would (`ENGINE.md` §8).
      If the interface cannot be used safely as written, that is the finding: propose the
      change. Then, in Rack: save a patch while it plays.
- [x] **3. P5, the half that needs no VCV.** Done; macOS 10.9 not met.
      Cross-compile the static library for the four Rack
      targets from this machine and check each against R16 (glibc 2.23, macOS 10.9, nehalem,
      MinGW). Write down exactly what the full proof still needs. P5 is not ticked.
- [x] **4. P7, the render half.** Done: the same bytes. D44.
      One drum voice in the core, the simplest in `VOICES.md`,
      rendered natively and in wasm, compared against the −80 dB bar. How sound crosses the
      ABI is a decision: the next free D number, proposed.
- [x] **5. P4, the desktop half.** Done: Chromium and Firefox. D45 added for the tap.
      `web/`: a bare page and worklet, the raw `.wasm`, no
      generated glue, the trace captured in the worklet and compared with P2. Chromium, and
      Firefox if present. P4 is not ticked.
- [x] Fill in `PROOFS.md` with measured numbers; half-run proofs are `running`, with what is
      left. Write `LEARNINGS.md`. The Handover lists what Opus can now build without deciding
      anything.

## Session 4 — what Session 3 leaves of P4 and P5 (the owner's hands)

Was all of P4 until Session 3 was widened; the desktop half moved there.

- [x] Serve `web/` from GitHub Pages. Nothing to do: it is plain files and the `.wasm` is
      committed (Session 3).
- [x] Owner, in Rack, ten minutes. Done 2026-11-19, the same afternoon as Session 3: P3 passed,
      and P6's Rack row is filled in.
- [ ] Owner, on each phone: Run the proof; Play for ten minutes; film the Tap pad. Fill in P4.
      Android Chrome's proof is done (2026-11-19). Left: iOS Safari, the ten minutes, the film.
- [x] P7's voice count on a phone. Done 2026-11-19: 1 024 copies held on a Galaxy S25 FE.
- [ ] P5: the four loads in Rack and VCV's answer (`PROOFS.md` P5, "What the full proof
      still needs"). The four links are CI's since Session 6.

## Session 5 — the minimum beat (build, Opus; done 2026-11-19)

The first job the last Handover named. Decide nothing; stop and write up what needs a ruling.

- [x] Bass drum, snare, closed hat and open hat in `core/src/voice.rs` under `ENGINE.md`
      §11. What each became: `VOICES.md`, "As built".
- [x] Each in a render scenario (`harness/render-{kick,snare,closed-hat,open-hat,beat}.json`);
      `make test` renders every `render-*.json` natively and from the `.wasm` and holds each
      pair to the same bytes (`compare.mjs --same`). All 36 pairs are the same bytes.
- [x] Rust tests for each drum: silent until its frame, exact zeros after its length,
      sliders A and B, the mix as the sum of the sixteen channels, block size, a rate change
      while sounding, a slider moved while sounding. Each new check failed once on a planted
      fault.
- [x] The Rack Probe plays the mix from a new AUDIO jack. `make selftest` now also fails a
      probe that is silent or sends a non-finite sample; it failed on a planted silent probe.
      `make -C rack sound` builds a patch to hear it.
- [x] Not built, written up instead: the hats cutting each other off (O13); keeping the mix
      in bounds (O14).

## Session 6 — CI for the four Rack targets (build, Opus; done 2026-11-19)

The job the last two Handovers named, so P5 has artefacts for whoever has a Mac or a
Windows machine.

- [x] `.github/workflows/pocket-instruments-rack.yml`: one job a platform, each linking the
      plugin with `make dist` on that platform's own toolchain, as Phona does (R16a). Linux
      inside Ubuntu 16.04 for glibc 2.23 (`rack/ci-linux.sh`); Windows on MSYS2's MinGW;
      both Macs on GitHub's Apple Silicon runner, Intel by `CROSS_COMPILE`. Each Rack SDK
      zip is pinned by its sha256.
- [x] `rack/check-dist.sh`: each finished `.vcvplugin` held to R16 for its platform. Each
      check failed once on a planted fault.
- [x] `check-link` in `rack/Makefile` works on all three systems, not only Linux.
- [x] The four artefacts, green, and `PROOFS.md` P5's items 1 and 2 answered.

## Session 7 — the other eleven voices (build, Opus; done 2026-11-19)

The first item of Session 3's "What Opus can now build". Recipes, as Session 5 built keys 1
to 4; D35's samples can still replace any of them by ear.

- [x] Keys 5 to 9 and 11 to 16 in `core/src/voice.rs`, from `VOICES.md`'s recipes. What
      each became: `VOICES.md`, "As built". The cymbal is the hats' source in a third
      setting; the toms and the tones share a struct each.
- [x] A scenario each (`harness/render-<name>.json`), and `render-all.json` with all
      sixteen. 108 pairs, all the same bytes. The five older voices did not change a bit.
- [x] Every generic rule test now runs on all sixteen; slider A is tested per voice (pitch,
      brightness, the clap's bursts, the tones' semitones). Each new check failed once on a
      planted fault.
- [x] The engine passed the hosts' 1 KiB (now 1 416 bytes): every fixed room is 2 KiB.

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

### After Session 1 (2026-11-19)

- Done: `ENGINE.md`, the C header, the fixture format and three fixtures, `WORKFLOW.md` as a
  draft from the guide. Decided with the owner: D17, D18, D20, and new D24 to D28. No code.
- The design in one line: a clock layer turns frames into ticks (96 a step) and the sequencer
  sees only ticks, so the trace cannot depend on the host. O4 and O5 are closed.
- The expected traces came from a throwaway model, not from an engine. It agreed with itself
  across both clock sources and three sample rates, and it found one fault in the first draft
  (`LEARNINGS.md`). It did not test block sizes, the snapshot, reset or a tempo change.
- Phona has not been submitted to the Library (R16b). O2 is as open as it was.
- **Waiting on the owner:** the look in Claude Design, from `design/PROMPT.md`, exported to
  `pocket-instruments/design/`. It does not block Session 2.
- **No longer waited for (D29):** the hour with the PO-12. `WORKFLOW.md` is built from as it
  stands and corrected as mismatches turn up. The three unticked owner items in Session 1's
  list stay open as things to do when there is time, not as gates.
- New open question O10: how probability and a short length are set by hand.
- Next: Session 2, on Opus, on the laptop. Rust is still not installed.

### Later the same day (2026-11-19)

- D29: the workflow is confirmed as mismatches are found, not in one sitting first.
- D30: **sixteen tracks**, not four. `ENGINE.md`, the header and the snapshot (now 316 bytes)
  are updated; the three fixtures did not change. Session 2 builds sixteen.
- D31 and `VOICES.md`: our own sixteen sounds in the hardware's roles. For P7, not Session 2.
- `WORKFLOW.md` now carries what a search (R26 to R29) and an open-source emulation (R30)
  answered. Still unknown: the swing range, whether the knobs are absolute, whether a tempo
  change is immediate. Two three-minute checks for the owner are written there.

### After the design session (2026-11-19)

- Done: the look. The owner chose Loom (D36). `design/DESIGN.md` holds the tokens, the key
  states, the panel in mm, the phone layout and the animation's rules; `design/panel.svg` is
  the static Rack panel. O9 is closed.
- **No longer waiting on the owner for the look.** It never blocked Session 2 and still does
  not: nothing in the engine changed.
- Decided: D37, what the grid shows with write on and off (accepted, D38).
- O12 is answered: the owner keeps weaving as the display's subject. The animation is no
  longer held.
- Not built: any widget, and the display animation. `DESIGN.md` lists what is not done.
- D35: a starter pack of sixteen CC0 samples is in `samples/`, with a page to hear it. Voices
  are samples first, recipes where a sample does not serve (D32). D33 (individual outputs on
  sixteen-channel jacks) and D34 (the player's own file on any key) are proposed. None of this
  is Session 2's work; it shapes P7.

### After Session 2 (2026-11-19)

- **P1 and P2 passed.** Numbers in `PROOFS.md`. The `.wasm` is 5 076 bytes; three harnesses
  give one report over 96 runs each. D13's third trigger has used one build session of two.
- Built: `core/` (clock, sequencer, snapshot, CRC, the C ABI), `harness/` (Node on the raw
  `.wasm`, C++ on the static library), a `Makefile`, a fourth fixture (`reset-mid-bar`).
  Sequencing only. Nothing in `design/`, `samples/` or `VOICES.md` was touched.
- To run it: `mise install` once, then `make test` here, or `make verify` at the repo root.
- The specification held: no trace was edited and no rule changed. Seven things it did not
  say are written into `ENGINE.md` and listed in **D42, which is proposed and waits for the
  owner.** The one to look at is item 7 (the tick counter's wrap).
- This session ran on Fable, not Opus, because the owner started it there.
- Not done, on purpose: a fixture with a tempo change (format 1 cannot hold one; the Rust
  rule tests cover it), ThreadSanitizer (P6), anything for Rack or the browser.
- The repo's smoke test was skipped on this machine (no Playwright). Nothing in `shared/` or
  any app changed.
- For Session 3: the C++ harness is the template for linking. Rack calls with one frame a
  block, which is the block size the fixtures already run at. The host must do two things
  the core does not: turn a voltage into an edge, and ignore clock edges for 1 ms after a
  reset (`ENGINE.md` §4). The gate out is the host's job too: a `TRIG` event is an instant.
- Next: Session 3, P3, in Rack. It needs the Rack SDK 2.6.6, which is still not downloaded.

### After Session 3 (2026-11-19)

- **Nothing failed. Nothing is fully passed either:** P3, P4, P5, P6 and P7 are each
  `running`, with the machine's half done and measured in `PROOFS.md`. Nothing was dropped
  from the list. This session ran on Fable on purpose.
- Built: `rack/` (the Probe module, `handoff.hpp`, a headless self-test), `harness/race.cpp`
  (ThreadSanitizer), `make targets` (four Rack targets), the click voice and ABI 2 in
  `core/`, `web/` (page and worklet). 39 Rust tests; `make verify` runs all but the
  real-time checks (`make targets`, `make p4`, `make -C rack selftest`).
- **Three decisions are proposed and built on, and wait for the owner, with D42:**
  D43 (how a host hands snapshots, edits and loads between threads: it corrects
  `ENGINE.md` §8), D44 (sound crosses as a buffer on `pi_process`: ABI 2), D45 (`FIRE`:
  a tap fires a track).
- **One bar is not met:** P5's macOS 10.9. rustc's floor is 10.12 (R38). Likely harmless,
  unproven.

**The owner's ten minutes in Rack (finishes P3 and P6's Rack row):**

1. Start Rack. Open `pocket-instruments/rack/build/P3.vcv` (if it is missing:
   `make -C pocket-instruments/rack patch`).
2. Choose the audio device on the Audio module. A quiet steady sine should sound: a
   dropout is a click in it.
3. Engine menu: turn on the CPU meter. Note each Probe's figure. The bar is under 1 %.
4. Watch the Scope for ten minutes. Left probe (clocked by the LFO; swing fixture, track
   2): a gate on every step, the offbeats late by a third of a step. Right probe (its own
   clock; straight sixteenths, track 0): one gate every four steps. Each light is green
   while every pass has matched, red once one has not.
5. In those ten minutes: change the sample rate once (Engine menu). Then File › Save As,
   while it plays.
6. Right-click each probe: the first line of its menu is the count. Write the counts, the
   CPU figures and whether anything clicked into `PROOFS.md` P3.
7. `cd pocket-instruments && make test && node rack/check-patch.mjs <the saved file>
   target/report-node.txt`. Its output is P6's Rack row.
   ⚠ The patch's wiring was never seen on a screen. The intent: LFO SQR to the left
   probe's top socket; each probe's bottom socket to the Scope; VCO SIN through 8vert to
   Audio.

**What Opus can now build without deciding anything:**

- **Any of the other fifteen voices,** in `core/src/voice.rs` beside the click: a struct
  with `trigger`, `next` and `tune`, one line each in `Voices::trigger`, `render` and
  `set_sample_rate`. The rules are `ENGINE.md` §11: only `+ − × ÷`, integers for pitch and
  time, exact zeros when silent. `make test` holds each to the same-bytes comparison once
  it is in `harness/render-click.json` or a scenario beside it. Recipes: `VOICES.md`.
- **A Rack module that plays sound:** call `pi_process` with a one-float buffer
  (`PI_AUDIO_MIX`) or sixteen (`PI_AUDIO_TRACKS`), multiply by 5 V. The Probe is the
  template for the clock, reset, gate and threads; `handoff.hpp` is the only way anything
  crosses threads.
- **Edits from a UI,** in either host: commands through `pi::Queue`, loads through the
  same queue, snapshots back through `pi::Latest`. `harness/race.cpp` is the worked example
  and stays the gate: add the new message to it.
- **A browser instrument's plumbing:** `web/worklet.js` already takes commands by message,
  renders the mix and posts events. A page sends `STEP`, `SOUND`, `FIRE`, `PLAY`.
- **CI for the four targets:** `make targets` is the build step; `rack/Makefile` already
  maps Rack's target to Rust's. What CI adds is the link and the artefact.
- **The phone page for P7's count:** N worklet nodes, or N engines in one, using the
  falling-behind figure the page already shows.

**What still needs a decision first (do not build past these):**

- ~~D42, D43, D44, D45: the owner's ruling.~~ All accepted the same day (D46), with
  macOS 10.12 as the floor on Intel Macs. Nothing here blocks a build now.
- Where the sliders live in snapshot version 2, and whether moving a slider changes a
  voice that is already sounding (D44's open list).
- Whether the mix is limited in the core or each host saturates (D44's open list).
- The workflow: what a key press does in each mode (`WORKFLOW.md`, D29). `FIRE` and the
  edits are what it will be built from.
- If VCV says no to Rust in the Library (O2): D13's fallback, or self-hosted releases.

- The repo's smoke test was skipped on this machine (no Playwright). Nothing in `shared/`
  or any app changed.
- Next: Session 4, which is mostly the owner's hands. Then a build session on Opus from
  the list above.

### Later the same day: the ten minutes in Rack (2026-11-19)

- **P3 passed.** The owner ran the patch for about fifteen minutes with a sound card: no
  click heard, 0.1 % CPU a probe, a change from 96 to 48 kHz while playing, 271 passes
  matched and none mismatched. Numbers in `PROOFS.md`. D13's first trigger is closed; its
  second (P5) is still open.
- **P6's Rack row is done** from Rack's own autosave, read while it played. P6 stays
  `running` for the browser.
- The list above headed "The owner's ten minutes in Rack" is kept as what was asked. What
  was needed in the end was less: leave it playing, listen, change the rate once. The
  autosave and the log carry the rest.
- How a plugin gets into Rack, since it was asked: `make install` in `rack/` puts a
  `.vcvplugin` in `~/.local/share/Rack2/plugins-lin-x64/`, and Rack unpacks it at its next
  start. Restart Rack after every rebuild.

### Later still: the rulings and the phone (2026-11-19)

- **D46:** the owner accepted D42 to D45 and set macOS 10.12 as the floor on Intel Macs.
  No decision now blocks a build session.
- **P7 passed.** A Samsung Galaxy S25 FE held 1 024 copies of the engine and its voice, in
  Chrome and in Firefox; the bar is 16. The caveats are in `PROOFS.md`.
- **P4: Android Chrome passed the trace.** Left: iOS Safari (no iPhone yet), a reported
  ten-minute Play, and tap latency filmed with a second device.
- **Left of the whole ladder before instruments:** P5 (four links, four loads, VCV's
  answer; the owner has no Windows machine or Mac yet) and P6's browser half, which comes
  with the instrument.
- The page changed after the first phone run: only one proof run ticks now, and it has a
  Count voices button.

### The end of the day (2026-11-19)

- **P4's ten minutes ran on the phone** (700 s). P4 is left with iOS Safari and tap latency.
- **VCV has been asked** (O2, P5's fourth item): the owner's email to support@vcvrack.com.
  When the reply comes, record it in `PROOFS.md` P5 and close or re-word O2.
- **Next: a build session on Opus.** Nothing waits on the owner. The first job is the
  showpiece's minimum beat (D19): bass drum, snare, closed hat and open hat in
  `core/src/voice.rs` under `ENGINE.md` §11, each in a render scenario; then the Rack Probe
  playing the mix. After that, CI for the four targets, so P5 has artefacts ready for
  whoever has a Mac or a Windows machine.

### After Session 5: the minimum beat (2026-11-19)

- **Built:** the bass drum, snare, closed hat and open hat (tracks 0 to 3), and the Probe
  playing the mix from an AUDIO jack. `make test`, `make p4` (Chromium and Firefox) and
  `make -C rack selftest` (three rates) pass; `make verify` passes with its smoke test
  skipped (no Playwright).
- **The same bytes, everywhere it was checked:** six scenarios × two clocks × three rates,
  native against `.wasm`. The click alone is unchanged from P7's record (`PROOFS.md` P7).
- **Two things wait for the owner, neither blocking the next build session:**
  - **O13:** do the hats cut each other off, and which way? Recommended: closed cuts open.
  - **O14:** the mix passes 1 (+6.6 dB). A level and limiter in the core, or each host?
    Recommended: a fixed master level in the core, each host saturating. The Probe uses
    tanh towards 10 V meanwhile, as its own stand-in.
- **Hear it:** restart Rack (the plugin is installed), open
  `pocket-instruments/rack/build/Sound.vcv`, choose PulseAudio on the Audio module. One
  probe plays straight-sixteenths: kick, snare on two and four, closed hats. ⚠ It cuts
  any drum still sounding at the end of each pass (a fresh engine a pass), and the patch's
  layout was checked headless (both cables kept), never on a screen. The sounds are first
  settings, not tuned by ear.
- **Changed beside the voices, because they broke:** the engine is 752 bytes (was 352).
  The page's Count voices now steps copies by `pi_size`; a test's 512-byte bound is now the
  hosts' 1 KiB.
- **Not done:** samples (D32, D35): the per-key choice of sample or recipe still stands and
  no sample path exists; the sliders in a snapshot; any drum on the phone count.
- **Next, from the last list:** CI for the four targets, so P5 has artefacts ready.

### Later the same day: the rulings, and the beat heard (2026-11-19)

- **The owner heard the beat in Rack** from `Sound.vcv` on the Scarlett: both cables as
  meant, the Probe's light green, 0.2 % CPU for the probe. The patch's ⚠ above (never seen
  on a screen) is closed.
- **D47:** the hats stay independent; a cut is a setting for later, not a rewrite.
- **D48 (provisional):** a fixed level of 0.5 in the core; each host bends past its own
  ceiling (tanh). Built: `voice::LEVEL`, the worklet's output, the Probe's comment. The
  Rack mix is now 6 dB quieter than the one heard: 3 to 4.8 V in the self-test, inside
  Rack's ±5 V. Restart Rack to get it.

### After Session 6: CI for the four Rack targets (2026-11-19)

- **Four plugins, built and checked by CI** on every push that touches the core, the
  fixtures or `rack/`: lin-x64, win-x64, mac-x64, mac-arm64. Run
  [44540561514](https://github.com/kinggs/sidequests/actions/runs/44540561514), Artifacts
  at the bottom of its page. Numbers in `PROOFS.md` P5. `make verify` and
  `make -C rack selftest` pass here; the smoke test skipped (no Playwright).
- **What the first run found:** Windows plugins import `libgcc_s_seh-1.dll`, which Rack
  ships beside `Rack.exe` (R44), so it is allowed. The macOS linker warns about the core's
  10.12 stamp and links (P5 item 2).
- **For the owner, when there is a Mac or a Windows machine:** download that platform's
  artefact (a zip holding the `.vcvplugin`), unzip it, put the `.vcvplugin` in Rack's
  user folder under `plugins-<platform>/`, restart Rack, add the Probe, and see its light
  go green. That is P5 item 3. ⚠ On a Mac, macOS may refuse a plugin downloaded from the
  web; it is signed ad hoc. If it does, that is a finding for `PROOFS.md`, not a fault in
  the build.
- **Not done:** a release on a tag (nothing to release yet); a headless load of each
  artefact in Rack on its runner, as Phona's CI does. The second would be the closest CI
  can come to item 3; whether it counts as the bar's "loaded once in Rack on its platform"
  is the owner's ruling, so it was not built.
- **Next build, from Session 3's list ("What Opus can now build"):** the other twelve
  voices, or edits from a UI. Both stay inside what is decided. The owner's open items are
  P4 on iOS, P5's loads and VCV's reply, a ruling on a headless load in CI, and the
  workflow's rows (`WORKFLOW.md`).

### After Session 7: all sixteen voices (2026-11-19)

- **Every track has a voice.** Built as recipes from `VOICES.md`; numbers in its "As
  built". `make test` (108 render pairs, all the same bytes), `make p4` (both browsers,
  24 of 24) and `make -C rack selftest` (three rates) pass.
- **Changed beside the voices, because they broke:** the engine is 1 416 bytes, past the
  hosts' 1 KiB. Probe's buffer, the Node harness's layout and the test's bound are 2 KiB;
  the worklet now refuses an engine that does not fit before its events. A test gave the
  engine a 1 KiB buffer and would have written past it: it now sizes from `pi_size`.
- **Built inside the recipes, without a ruling:** key 5's noise is shorter than its body
  ("short noise"); key 15 is a triangle and key 16 a low-passed square ("a square or
  triangle"). Every number is a first setting, for the owner's ear at P8.
- **Waits for the owner, blocking nothing:** whether slider A on the tones is in semitones
  (⚠ the recipe's guess, built as one); which keys become samples (D35), which needs a
  sample path the core does not have.
- **Hear it:** no patch plays all sixteen yet. Rack's Probe plays whatever its fixture
  steps, so `Sound.vcv` is still the beat.
- **Next build, from Session 3's list:** edits from a UI, once the workflow's rows say
  what a press does; or a patch and a page to hear all sixteen.
