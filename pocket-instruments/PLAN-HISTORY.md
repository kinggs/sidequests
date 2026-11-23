# Pocket Instruments — the sessions that are done

The record behind `PLAN.md`: every finished session's list as it was ticked, and every
Handover note but the latest two. Moved here word for word on 2026-11-20, after Session 10,
so that a session starting work loads the plan and not its history. Nothing in this file is
an instruction any more. Read a part of it when a line elsewhere points you here.

How it grows: a session that finishes moves its own ticked list here, and the Handover
note before the last one, without rewording either (`PLAN.md`, "Keeping this file short").

Session 9's "How the pieces join" and "Rules for Sessions 10 to 14" were written under its
list. They are still in force, so they stayed in `PLAN.md`.

---

# What the plan's top used to say

"Read first, every session", until 2026-11-20, when it was narrowed so a session reads the
parts it needs and not every document whole:

1. `README.md` in this folder: the doc map and the rules.
2. `DECISIONS.md`: what is decided, proposed and open.
3. `PROOFS.md`: the proof this session runs, and its pass bar. Do not change a pass bar to make
   it pass; record the failure.
4. The **last note of the Handover** at the bottom of this doc, and your session's own
   list. The earlier notes are the record of how it got here: read one when a line points
   you to it, not all of them.
5. From Session 10 on: "Rules for Sessions 10 to 14", above Session 10's list.

# The lists

## Where the code will go (from the plan's top, written before Session 1)

(Written before any of it existed, and it went there. `README.md`'s table is the map now.)

```
pocket-instruments/
  ENGINE.md     the engine interface: time base, commands, events, snapshot (Session 1)
  core/         the Rust crate: no_std, C ABI
  fixtures/     language-neutral test vectors (JSON) and their expected traces
  harness/      the C++ harness and the Node test that run the fixtures
  rack/         the VCV Rack plugin (Session 3)
  web/          the browser page and worklet (Session 3; the phones in Session 4)
```

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

## The listening page (build, Opus; done 2026-11-20)

- [x] `web/listen.html`: every key as code or sample, sliders, in turn, a beat; `make listen`
      drives it in both browsers. Details: Handover, "The listening page".

## Session 8 — a sample or the code voice, per key (build, Opus; done 2026-11-20)

D50, agreed by the owner in four points. Details: Handover, "Session 8".

- [x] The pack as the engine reads it (`samples/raw/`, `tracks.txt`, `make-raw.py`).
- [x] A sample voice beside each code voice; `pi_set_sample` and `VOICE` (ABI 3, ENGINE.md §12).
- [x] Both render harnesses, the worklet, the listening page and the Rack Probe use it.
- [x] Every number that shapes a sample in one block; `VOICES.md` "Tuning a sample".
- [x] The engine is 2 328 bytes: every fixed room is 4 KiB (it was 2 KiB after Session 7).

## Session 9 — the instrument, planned (design, Fable; done 2026-11-20)

Everything the instrument is built from existed: sixteen voices or samples, the sequencer,
`FIRE`, edits, snapshots, both hosts, a draft workflow. This session designed the join. No
code. The owner ruled on six questions, all as recommended (D51 to D56); what was settled
without asking is D57, proposed.

- [x] Where keys are interpreted: in the core, which also says what to light (D51).
- [x] Snapshot version 2, and how version 1 loads into it (D55).
- [x] A slider and a sounding voice: it waits for the next hit (D56).
- [x] The first scope: every "in" row (D52). The display: plain first, the weave after, drawn
      once in the core (D53). The slider caps follow the chosen sound (D54).
- [x] The contract: `ENGINE.md` §13 keys, §14 the view, §15 snapshot version 2, §16 the weave.
- [x] The readings taken where nobody knows the hardware: `WORKFLOW.md`, "What the first
      build does".
- [x] The build sessions: 10 to 14, below.

(Its two subsections are in `PLAN.md`.)

## Session 10 — the workflow in the core: keys and the view (build, Fable; done 2026-11-20)

Recommended on Fable, not Opus (Session 9's advice): this is where a contract that has
never run first meets code, as Sessions 2 and 3 were. A gap in §13 or §14 found here can be
ruled on in the session and written into `ENGINE.md`, marked, as D42 was; on Opus the rule
is to stop. (It ran on Fable. The gaps are D59: eight, none of which moved a fixture.)

ABI 4. `ENGINE.md` §13 and §14. No host gains a face yet.

- [x] **Fixture format 2** in `fixtures/README.md`: format 1 plus `key_down`, `key_up`
      (`key`) and `param` (`slider`, `value`), and `views`: `{"at": n, "view": "…"}`, §14's
      text line. A key or slider lands **one frame after** its step's boundary, after that
      frame's other commands, so anything it fires carries that step's tick 0 on both clock
      sources and at every rate. A view is read where run step `at` ends: the harness ends
      a block at `F(at + 1)` and calls `pi_view`. A fixture that changes the tempo fires
      nothing and is not played (its trace is empty): `F` stays true to `mbpm`.
      **A fixture starts and stops with the `play` edit, never the play key:** the key
      restarts the table clock and cannot restart an external one (§13), so the two runs
      would rightly give two traces. The play key is a rule test on each source instead.
      Added to it in the session: the view's text is the table run's, and the edges run
      expects `edges=1` (D59).
- [x] **Three fixtures by hand, before the code:**
      `keys-write-a-beat` (choose sounds, write on, set and remove steps, with the `play`
      edit at step 0; views in write mode show field and stitch);
      `keys-tap-and-choose` (write off: taps fire and do not choose; sound + key chooses
      and fires; the bar; `fires` counting);
      `keys-bpm-family` (stopped: a clean release steps 120, 140, 80; bpm + B sets a fine
      tempo and does not step; bpm + A swing; bpm + key volume and the field row;
      function + pattern clears; a `PARAM` equal to the shown value changes nothing).
      Committed alone (`0eb2ac0`) before `keys.rs` existed. All three passed at the first
      run on all three harnesses; nothing in them was edited.
- [x] `core/src/keys.rs`, `pi_view`, the volume on the mix. The header: `PI_ABI_VERSION` 4,
      `PI_VIEW_SIZE`, the three commands no longer "reserved". Also in the header: each
      view field's offset (`PI_VIEW_*`) and the flags, for Sessions 12 and 13.
- [x] Rust rule tests, one for each row of §13's tables and §14's "what the grid shows",
      plus: a repeated `KEY_DOWN` and a stray `KEY_UP` do nothing; `PARAM` with every shown
      value (49 swings, 181 tempos) is a no-op; a tap, a hold, play and write leave
      `pi_generation` alone; volume 16 renders the bytes volume had no say in, and volume 8
      is a quarter of them. 35 tests in `core/src/tests/keys.rs` (103 in all). 83 faults
      planted in the core one at a time: each failed a test.
- [x] All three harnesses run format 2: `cargo test`, Node on the `.wasm`, C++. One report:
      168 runs each. Faults planted in each harness and in the fixtures were each caught.
- [x] `harness/race.cpp`: keys and sliders among its messages; still clean. It also hands
      a view between the threads, with a sixth planted fault for it.
- [x] Every host on ABI 4: the worklet, the Probe, `web/pi_core.wasm` rebuilt. `make test`,
      `make p4`, `make listen`, `make -C rack selftest` pass. The four fixtures and the 114
      render pairs: the same bytes as before this session. (The Probe and the P4 page stay
      on the four format 1 fixtures: neither has keys.)

---

## Session 11 — snapshot version 2, and voices with the mix (build, Opus; done 2026-11-20)

ABI 5. `ENGINE.md` §15. The list was checked against the code after Session 10
(2026-11-20): what was added is marked "added".

- [x] **First, before any change:** save each fixture's version 1 snapshot from today's core
      into `fixtures/snapshots-v1.txt` (name and hex; the Node report already prints them).
      They are the proof that every version ever written still loads. Seven fixtures now.
      (Added: a fixture's snapshot holds its step-0 edits and nothing a key did, so
      `keys-write-a-beat`'s is the empty pattern. The four older ones carry the swing,
      length and probabilities worth loading.)
      Done: one line a fixture, the same at every rate and source, from the Rust report.
- [x] Version 2 in `core/src/snapshot.rs`: save, load both versions, the clamps.
      `PI_SNAPSHOT_SIZE` 388, `PI_SNAPSHOT_SIZE_V1` 316.
- [x] Tests: each version 1 snapshot loads and gives its fixture's trace, and has the
      starting values in every new field; save, load into a fresh engine, the same view and
      the same render; a flipped bit in each new field is refused; a version 3 is refused;
      a version 2 cut to 316 bytes is refused; the generation moves on each new saved thing
      and only when its value changes.
      Done: `core/src/tests/snapshot.rs` (seven tests) and, for the fixtures' own version 1
      snapshots, `every_version_1_snapshot_ever_written…` in `fixtures.rs`: each is loaded
      into an engine whose new fields were all moved first. The flipped bits are the old
      every-byte test, now over 388 bytes, and a new one over version 1's 316.
- [x] Added: **the generation's rule test changes with it.**
      `the_generation_moves_exactly_when…` in `core/src/tests/keys.rs` has two halves. The
      random half ("it moves exactly when the snapshot's bytes change") should pass as it
      is. The first half lists presses that leave it alone: the volume, sound + key and
      `param` lines there become movers. Then strike `ENGINE.md` §13's "In ABI 4 that is
      snapshot version 1 (D59)" as overtaken, leaving the words.
      Done as written: the random half passed unchanged.
- [x] Added: **a loaded volume is clamped to 1 to 16, and tested.** The view's volume row is
      `(1 << volume) - 1`; a 17 would overflow it.
- [x] Every fixed 316 and every fixed room. Search, do not remember (`LEARNINGS.md`,
      Session 8). As of Session 10 the literal 316s are in `harness/trace.test.mjs` and in
      `core/src/tests/` (`mod.rs`, `fixtures.rs`, `rules.rs`, `keys.rs`). `harness.cpp`,
      `race.cpp` and the Probe use `PI_SNAPSHOT_SIZE` and follow the header;
      `rack/check-patch.mjs` passes the length it read; the worklet holds no snapshot yet.
      Node's snapshot buffer has 512 bytes before the view's (`SNAP`, `VIEW`): 388 fits.
      Found beside the list: `race.cpp`'s `enter()` set only what version 1 held, so the
      churn's sliders, volume and choice leaked into its snapshots and P6's last check
      failed. It now sets every field version 2 holds, by keys and edits.
      Six tests pinned "sliders, switch, volume and choice are not saved" on purpose; each
      now says what version 2 holds, with the old reading noted.
- [x] `PI_AUDIO_BOTH`, 17 channels. A render scenario holds channels 0 to 15 to layout 16's
      bytes and channel 16 to layout 1's, natively and from the `.wasm`.
      Added, what it needs: `pi_process` in `core/src/abi.rs` takes only 1 or 16 channels;
      both render harnesses write the mix alone, so each needs a way to render a layout
      and write one file a layout; and Node's audio buffer is 768 floats (`AUDIO_MAX`),
      where a block of 128 frames at 17 channels is 2 176: move it or render in smaller
      blocks. The mix channel is after the master volume, the sixteen before it (§13).
      Done: `harness/render-both.json` (render-all with the volume moved by keys) names
      `"layouts": [1, 16, 17]`; each harness renders all three, holds 17 to the other two
      itself, and writes `-16ch` and `-17ch` files that `make test` pairs. Node's audio room
      grew to 2 176 floats and the commands moved after it. A Rust test does the same at
      three block sizes.
- [x] The Probe loads a patch saved before this session (a version 1 snapshot in it):
      headless, "1 loaded".
      Added: it will not, as written. `Probe.cpp` takes a saved snapshot only if it is at
      least `PI_SNAPSHOT_SIZE` bytes and copies exactly that many, so at 388 it drops a
      316-byte one before `pi_load` sees it. Its `Snap` needs a length: take 316 or more,
      pass what was read. A patch to test with: `rack/selftest.sh` writes each probe's
      `data` itself and gives it no snapshot today, so add `"snapshot"` to one probe: a
      line of `fixtures/snapshots-v1.txt`, hex to base64. Show it fails first, with the
      size check as it is now.
      Done: it failed first ("0 loaded, 0 refused"), then passed at three rates.

---

## Session 12 — the page: playable on a phone (build, Opus; done 2026-11-23)

`web/rhythm.html`, in the Loom look (`design/DESIGN.md`, "The phone"; `design/loom/phone.html`
is the picture). Finishes P6. This is the first build the owner can play.

- [x] The worklet: `KEY_DOWN`, `KEY_UP`, `PARAM` by message; the view posted back (§14's
      rule for when); the snapshot posted when the generation moves, a few times a second
      at most; a load by message, between blocks.
      Done: `web/worklet.js` behind a new `instrument` option, so the P4 and listening
      pages run as before. Views when bytes 4 to 63 change and every sixtieth of a second
      while playing; a snapshot at most every quarter second; a load queued with the keys
      (§8). Beside each view and snapshot, the count of queue entries taken (§8's "count of
      the messages taken"), so a page knows when one holds everything it sent.
- [x] The face: the plain display (tempo, `bpm`, the write mark, the step number, sixteen
      step marks; the weave's area left as bare display), sixteen keys, seven function
      keys, two sliders. Everything lit from the view; the page keeps no copy of the
      workflow. Pointer events with capture, several at once; nothing latches.
      Done. A key is down while any finger, pointer or computer key holds it. Readings
      built on are in `design/DESIGN.md`'s "Not done" (⚠): the slider drag, the bar's
      colour, the white under reduced motion, the sheet's lit sample.
- [x] Sound starts on the first touch, and that touch counts as a press.
      Done: the context and the worklet exist before any touch; the touch resumes the
      context and its press waits in the queue. `make play` suspends the context first.
- [x] Computer keys (D57 item 5).
      Done, by the key's place (`event.code`). Repeats ignored. Losing focus lets go of the
      computer keys; a hidden page lets go of everything.
- [x] The beat is kept in the browser (the snapshot, base64) and is there after a reload.
      Done: `localStorage` `pocket-instruments/rhythm/beat`, loaded before the first block
      by the length read.
- [x] Below the instrument: the sixteen code-or-sample switches with All code and All
      samples (from `listen.html`), and the credits (D7, and the README's second paragraph).
      Done. The switches are lit from the view's `sampled` mask. The credits link Teenage
      Engineering's own page (no affiliate link), and name the samples (CC0) and the font (OFL).
- [x] Reduced motion respected; nothing under 16 px; every state without hue, as
      `loom/states.html` shows.
      Done: no transition or animation anywhere, and the media query forbids one; type is
      16 to 42 px; the states are `states.html`'s, checked by eye in a screenshot.
- [x] `make play` (`web/play.mjs`, both desktop browsers, as `listen.mjs` does): enter
      `straight-sixteenths`' pattern by keys while stopped, press play, and the worklet's
      trace is that fixture's (the play key resets, so ticks start at 0); press
      `keys-bpm-family`'s keys and the last view, as text, is the fixture's last; every
      key's drawn state equals the view it was drawn from; two pointers held at once choose
      a sound; a reload brings the beat back. Each fails once on a planted fault.
      Done: passed in Chromium 155 and Firefox 158. Added: the first touch, with the
      context suspended, must start sound and turn write on. Eight faults planted in
      Chromium, each failed: seven at their own line; the eighth (a new touch lets go of the
      other fingers) during the pattern entry, which needs two fingers to choose a sound,
      so the two-pointer line never ran (`LEARNINGS.md`). Sliders are moved through the
      page's own `slide()`: a drag cannot aim at 40000.
- [x] **P6's browser half:** enter a P2 fixture's pattern by keys while it plays, take the
      saved snapshot from the page, load it in `target/harness`: that fixture's trace.
      Fill in `PROOFS.md` P6.
      (Noted 2026-11-20: `target/harness` has no such mode yet. Either add one, or do as
      `harness/race.sh` does and look for the page's bytes among the report's "snapshot"
      labels. Keys cannot set a probability or a length, so the fixture is
      `straight-sixteenths`; the page's seed must be 1 and its tempo 120.)
      Done the second way, inside `make play`: both browsers' bytes are a label. P6 is
      still running: a dropout by ear on a phone is left.
- [x] Not built: a link that carries a beat, an offline shell, the weave.
- [ ] For the owner after it: play it on the phone beside the PO-12 and start P8's list;
      tick or correct `WORKFLOW.md`'s readings, and D59's (stopped, no key shows the
      playhead).

# The Handover notes

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

(Annotated 2026-11-20: the limiter is D48; the workflow is drafted and built from as it
stands (D29); the rest is Session 9's to plan.)

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
- **Waits for the owner, blocking nothing:** ~~whether slider A on the tones is in semitones~~
  (answered 2026-11-20: yes, D49); which keys become samples (D35), which needs a
  sample path the core does not have.
- **Hear it:** no patch plays all sixteen yet. Rack's Probe plays whatever its fixture
  steps, so `Sound.vcv` is still the beat.
- **Next build, from Session 3's list:** edits from a UI, once the workflow's rows say
  what a press does; or a patch and a page to hear all sixteen.

### The listening page (2026-11-20)

- **Built:** `web/listen.html`, to hear all sixteen voices and choose by ear which keys
  become samples (D35). Each key plays its code sound or its sample, by a switch; the
  chosen key's sliders A and B move the code sound; "Compare in turn" plays each key's code
  then its sample; a beat runs in the engine while the sliders move. Samples are scaled so
  their peak is the voice level (0.5, D48). Live at
  `https://kinggs.github.io/sidequests/pocket-instruments/web/listen.html`.
- **Checked:** `make listen` (`web/listen.mjs`) drives the page in headless Chromium and
  Firefox: all sixteen samples load, every key sounds and falls silent, at least 14
  different voices sit behind the keys, and slider B reaches the engine. Both browsers pass
  with the same loudest sample on every key. Four planted faults were caught: every key on
  one track, sliders not sent, a misnamed sample, a key that fires nothing.
- **Changed beside it:** the worklet reports the loudest sample since its last report, so
  the check can see each key. P4 passes again (24 of 24 in both browsers).
- **Waits for the owner:** listen, then say which keys switch to samples. That answer
  scopes the sample path's plan (`DECISIONS.md` D35).

### Session 8: a sample or the code voice, per key (2026-11-20)

The owner asked for an easy switch between the code voices and the samples, defaulting to
whatever the PO-12 uses. The PO-12 mixes both and does not say which keys are which (R45),
so every key starts on code. The owner agreed the plan in four points (D50) and asked that
the numbers stay easy to tweak.

- **Built:** `samples/raw/` (the pack as the engine reads it, from `samples/make-raw.py`)
  and `samples/tracks.txt`; a sample voice beside each code voice in the core, with
  `pi_set_sample` and command 22 (ABI 3, ENGINE.md §12); both render harnesses load the
  pack; the worklet takes it from the page; the listening page sets each key to code or
  sample, with All code and All samples, kept in the browser; the Rack Probe loads the pack
  from inside the plugin and has a Sounds menu, saved with the patch.
- **Easy to tweak:** every number that shapes a sample is in one marked block of
  `core/src/voice.rs`; `VOICES.md` "Tuning a sample" says what each moves and what to run
  after. Slider B's middle plays a sample whole (a side agent showed that the proposed
  range would have cut half the samples short by default).
- **Proven:** 12 new Rust tests (68 in all); `harness/render-samples.json` with every track
  on its sample, the same bytes natively and from the `.wasm` (114 render pairs in all);
  the 108 renders from before, the same bytes as the previous commit's core; `make listen`
  in Chromium and Firefox (every key as code, then as a sample, then back); `make p4` 24 of
  24 in both; `make -C rack selftest` at three rates with one probe on samples; the archive
  check now wants the pack inside the plugin. Every new check failed once on a planted
  fault: 15 in all. Three first plants were caught by nothing, and each taught something
  (LEARNINGS.md).
- **Changed beside it, because it broke or was wrong:** the engine is 2 328 bytes; every
  host's room is 4 KiB. `rack/check-patch.mjs` loaded its snapshot 1 KiB in, inside the
  engine since Session 7: now past it. `make listen`'s server did not serve the new files.
- **Not done:** the cost of a sample voice was not measured, natively or on a phone; P4 on
  iOS still waits.
- **Waits for the owner, blocking nothing:** which keys to switch to samples, by ear, on
  the page or in Rack; whether any first setting in "Tuning a sample" is wrong.
- **Hear it:** the listening page (live); in Rack, `Sound.vcv`, then the Probe's right-click
  menu, Sounds. The Probe plays the four drums only.
- **Next build:** carry on with the rest (Session 3's list): edits from a UI once
  `WORKFLOW.md` says what a press does; or the instrument's own panel.

### After Session 9: the instrument, planned (2026-11-20)

- **Designed, nothing built.** Keys go into the core and the core tells both hosts what to
  light (D51). The contract is `ENGINE.md` §13 to §16; the sessions are 10 to 14 above.
- **The owner ruled on six questions,** all as recommended: D51 to D56. D46's annotation is
  closed: the slider waits for the next hit (D56) and snapshot version 2 is laid out (D55).
- **D57 was proposed and is now accepted (D58, the same day):** eight things settled without asking, among them the
  readings of the hardware nobody could check. The ones the owner would feel: choosing a
  sound plays it; the tempo preset changes when bpm is let go; in Rack that is two clicks.
- **Not verified, because nothing ran:** the view's 64 bytes and the snapshot's 388 are laid
  out on paper. Session 10's first job, fixtures by hand, is where a mistake in §13 or §14
  shows. The weave's cell size is to be read off `frames.html` in Session 14.
- **Next: Session 10.** Nothing waits on the owner. Fable is recommended for 10 and 14,
  Opus for 11, 12 and 13 (the reasons are under each heading).

### After Session 10: the workflow in the core (2026-11-20)

- **Built: ABI 4.** `KEY_DOWN`, `KEY_UP` and `PARAM` do what `ENGINE.md` §13 says, `pi_view`
  writes §14's 64 bytes, and the master volume is on the mix. No host has a face: nothing
  can be pressed or seen yet. That is Session 12 (the phone) and Session 13 (Rack).
- **The contract held.** The three fixtures were worked out by hand, committed, and only
  then run: all three passed at the first run on all three harnesses, no trace and no view
  edited. Where §13 and §14 were silent is **D59: eight rulings, built on, for the owner to
  overrule cheaply.** The one a player would see: stopped, no key shows the playhead.
- **Proven:** `make test` (103 Rust tests; seven fixtures, 168 runs a harness, one report;
  114 render pairs; the race harness with keys and views, six planted faults caught),
  `make p4` (24 of 24 in Chromium and Firefox, ABI 4), `make listen` (both), `make -C rack
  selftest` (three rates). Nothing older moved: the four fixtures' 96 report sections and
  every render file are the same bytes as before the session.
- **Every new check failed once on purpose:** 83 faults planted in the core, each failing a
  named test (one by aborting the run); 4 in the fixtures and 4 in each harness, each
  caught by the harness it was in. Two things that taught something are in `LEARNINGS.md`:
  a plant script that reported every fault caught when cargo had never run, and a rule
  missing from the rule tests that only a fixture caught.
- **Fixed beside it:** `rack/Makefile` built the Probe's fixtures with one `jq` over every
  file, whose exit status is the last file's alone. A fixture it refused was dropped and
  the build went on. Found when CI went green past three such errors; now one `jq` a file.
- **Sizes:** the engine is 2 352 bytes (was 2 328), inside the hosts' 4 KiB. The `.wasm` is
  26 998 bytes (was 23 692).
- **For Session 11 (Opus), what will bite:**
  - `the_generation_moves_exactly_when…` in `core/src/tests/keys.rs` has two halves. The
    random half holds "the generation moves exactly when the snapshot's bytes change" and
    should pass unchanged on version 2. The first half lists presses that leave the
    generation alone: the volume, sound + key and `param` lines there become movers
    (§15), so move them out of that list and say so.
  - The view's volume row is `(1 << volume) - 1`: a volume past 16 from a loaded snapshot
    would overflow it. §15's clamp (1 to 16) is what keeps it true; test the clamp.
  - `Host::save` in `core/src/tests/mod.rs` is a fixed 316, with the rest the plan lists.
  - `rack/fixtures.jq` leaves format 2 out, and `web/desktop.mjs` counts format 1 only.
    A new format 1 fixture still reaches both; a format 2 one reaches neither.
- **Not done, on purpose:** a view in the worklet or the Probe (Sessions 12 and 13); the
  weave's three fields, which stay zero (Session 14).
- **Waits for the owner, blocking nothing:** a look at D59. Still open from before: P4 on
  an iPhone, P5's loads ~~and VCV's reply~~ (answered 2026-11-23, R46), which keys become samples.
- **Next: Session 11,** on Opus.
