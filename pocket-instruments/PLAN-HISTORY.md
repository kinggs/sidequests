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

## Session 13 — the Rack module (build, Opus; done 2026-11-23)

`rack/src/Rhythm.cpp`, 24 HP, on `design/panel.svg`, at `design/DESIGN.md`'s positions. The
Probe is its template and stays as it is.

- [x] The module: every key and both sliders are Rack parameters; `process` turns a
      parameter's change into `KEY_DOWN`, `KEY_UP` or `PARAM` on that frame. CLOCK patched:
      edges; unpatched: the table clock. RESET, with CLOCK ignored for 1 ms after.
      `PI_AUDIO_BOTH`: VOICES sixteen channels at 5 V to 1.0; AUDIO the mix, bent by tanh
      towards 10 V as the Probe does; TRIGGERS 10 V for 1 ms a firing, sixteen channels.
      Never a non-finite sample (`RACK-RULES.md`).
- [x] **RETURN (D62), the showpiece:** a sixteen-channel input; channel *n* takes sound
      *n*'s place in AUDIO's mix, master volume and tanh still applied; by default the
      channels the cable carries, or the menu's ticks. A test in the module's self-test or
      a unit test beside it: unpatched, AUDIO is the core's mix bit for bit; RETURN carrying
      sound 1's own VOICES channel back gives the same mix; a return of silence on channel
      1 removes the bass drum from AUDIO and leaves VOICES and TRIGGERS as they were. Each
      fails once on a planted fault.
      Done: `rack/src/jacks.hpp`, held by `rack/test/jacks.cpp` in `make test`. "The same
      mix" holds to within rounding (1.2e-7), not bit for bit: VOICES is `5x` and RETURN
      divides by 5 (`LEARNINGS.md`). Silence is bit for bit. Nine planted faults, each caught.
- [x] The panel's sixth jack (D62 item 4): `design/make_panel.py` redrawn, `panel.svg`
      regenerated, `design/DESIGN.md`'s positions table and jack row updated.
- [x] The view to the drawing thread through `pi::Latest`; the snapshot saved and loaded as
      the Probe does (D43). The starter pack loaded as the Probe does.
- [x] The widgets, drawn from the view: keys with field, frame, white, stitch and bar;
      function keys idle, pressed, latched; slider caps that follow the shown value unless
      held; sockets; the plain display. JetBrains Mono ExtraBold in `res/`, with its
      licence (OFL).
- [x] The latch, by D60 and D61: Ctrl+click (Cmd on a Mac), as the page does; right-click
      keeps Rack's parameter menu. It supersedes D57 item 4. And the computer keys while the
      pointer is over the module (D57 item 5). ⚠ R25: whether Rack reports several keys held at once is found out here.
- [x] Double-click on a slider (D63): the middle, or with bpm held swing 0 and 120 bpm, as
      the page does; not Rack's fixed default.
- [x] The menu: each key's code or sample, All code, All samples; and D62's "Sound *n* from
      RETURN" ticks with "As the cable carries".
- [x] **A self-test in Rack itself:** a patch that names a format 2 fixture makes the module
      press its own parameters (and send the fixture's `play` edit) and hold its events and
      views to the fixture, with a light, as the Probe does. `rack/selftest.sh` runs it
      headless at three rates. (Noted 2026-11-20: `rack/fixtures.jq` leaves format 2 out
      on purpose, for the Probe. This needs its own filter and its own `.inc`, built one
      `jq` a file as the Probe's now is.)
      Done: `rack/rhythm.jq`, `build/rhythm-fixtures.inc`; the three fixtures on the table and
      on an 8 Hz LFO, at three rates, views and caps held. Nine planted faults, each caught.
- [x] `rack/check-dist.sh` and CI still green on all four platforms. (`check-dist.sh` now
      also wants the panel, the font and its licence. CI: see the Handover.)
- [x] Not built: sliders under CV, the neighbour connection (D40), the tempo-voltage clock,
      a player's own samples (D34), the expander.
- [ ] For the owner after it (in "Still the owner's hands"): the look in Rack at 100% (the ⚠ rows of `DESIGN.md`'s table);
      the latch by hand; MIDI-Map on a slider (D54's ⚠); the round trip by ear: a sound out
      through a Rack module and back through RETURN (D62).

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

### After Session 11: snapshot version 2 (2026-11-20)

- **Built: ABI 5.** `pi_save` writes §15's 388 bytes: version 1 plus each track's sliders,
  the code-or-sample switches, the volume and the chosen sound. `pi_load` takes both
  versions. Those four now move the generation, each only when its value changes.
  `PI_AUDIO_BOTH` (17 channels) gives the sixteen tracks and the mix from one call, for
  Session 13. Nothing a player can touch yet; that is still Session 12.
- **An old beat still loads, proven three ways.** The seven fixtures' version 1 snapshots
  were saved from the ABI 4 core before any change (`fixtures/snapshots-v1.txt`). Each
  loads into an engine whose new fields were all moved, sets them back to `pi_init`'s
  values, and gives its fixture's trace. In Rack, a patch carrying one is loaded by the
  Probe ("1 loaded"); it failed first with the old fixed-size copy, as planned.
- **Nothing older moved:** the report is the same line for line apart from the 42 snapshot
  hex labels, and all 240 earlier render files are the same bytes. 132 render pairs now
  (18 new, `render-both`), every one the same bytes natively and from the `.wasm`.
- **Proven:** `make test` (112 Rust tests; seven fixtures, 168 runs a harness, one
  report; 132 render pairs; the race harness, six planted faults caught), `make p4` (24 of
  24 in Chromium and Firefox, ABI 5), `make listen` (both), `make -C rack selftest` (three
  rates), the repo's `make verify` (its smoke test skips: no Playwright).
- **Every new check failed once on purpose:** 25 faults planted in the core, each built and
  failed a named test (one by aborting inside that test). One core fault caught by both
  harnesses' own layout check; one flipped sample caught by `compare.mjs`. What that
  taught (a copy's old file times fooled cargo; a plant aimed at the wrong line) is in
  `LEARNINGS.md`.
- **Found beside the list:** `harness/race.cpp`'s `enter()` built its "known" snapshot by
  setting only what version 1 held; it now sets every field version 2 holds.
- **Sizes:** the engine is 2 352 bytes (unchanged). The `.wasm` is 28 216 bytes (was 26 998).
- **For the owner, blocking nothing (Opus decided nothing):** two readings where §15 is
  silent, built on and marked ⚠: a loaded chosen sound past 15 becomes 15; bytes 381 to 383
  are not read. Either is one line in `core/src/snapshot.rs`.
- **For Session 12 (Opus), what will bite:**
  - The worklet holds no snapshot yet. Give it 388 bytes, and always pass `pi_load` the
    length read, not `PI_SNAPSHOT_SIZE`: a beat saved in the browser before ABI 5 does not
    exist, but a version 1 can come from anywhere a link carries one later.
  - `pi_generation` now moves on a slider, a switch, the volume and a chosen sound, so the
    page will post snapshots more often than Session 10's core would have. §8's "a few a
    second at most" still holds the rate.
  - P6's browser half: `straight-sixteenths`' saved snapshot now also holds the starting
    sliders, volume and choice. Entering its pattern by keys from a fresh page gives those,
    so the bytes should match the report's label. A page that moved a slider first will not.
- **Next: Session 12,** on Opus.

### After Session 12: the page on a phone (2026-11-23)

- **Built: `web/rhythm.html`, the first thing the owner can play.** Live, after the push,
  at `https://kinggs.github.io/sidequests/pocket-instruments/web/rhythm.html`. The Loom face,
  lit only from the core's view; several fingers at once; computer keys; the beat kept in
  the browser; the sounds sheet and the credits below it. The core did not change: ABI 5.
- **Proven:** `make play` passed in Chromium and Firefox: the worklet's trace is
  `straight-sixteenths`' after its pattern went in by keys and play was pressed;
  `keys-bpm-family`'s last view is the fixture's; about 250 drawings a browser read back
  off the face, each equal to its view; two fingers choose a sound and nothing stays held;
  a reload brings the beat back; the first touch starts sound and counts. `make p4` (24 of
  24, both) and `make listen` (both) still pass on the changed worklet. The repo's
  `make verify` passes. The report and all 276 render files: the same bytes as before.
- **P6's browser half passed its saved-pattern bar:** the snapshot saved while it played
  is bytes the wasm host ran `straight-sixteenths` from. P6 stays running for one thing,
  a dropout by ear on a phone while editing (below).
- **Every check failed once on purpose:** eight planted faults. One judge bug was found
  that way first: the keys-bpm-family line compared two missing values and passed
  (`LEARNINGS.md`).
- **Opus decided nothing; four readings were built on and marked ⚠** in `design/DESIGN.md`'s
  "Not done": a slider drags from where its cap shows (a touch alone moves nothing); the
  bar is ochre with pattern held, madder otherwise; a firing key stays white with reduced
  motion asked for; the sheet lights a sampled key as a step is lit. Each is a line or
  two of `web/rhythm.html`. Also: the font comes from Google Fonts, so offline it falls
  back to the system monospace, which belongs with the offline shell.
- **For the owner, blocking nothing:** play it on the phone (P8's start), with the PO-12
  beside it if it is to hand. While it plays, enter steps and move sliders for a few
  minutes and listen for a dropout: that closes P6. Then the readings above, and D59's
  (stopped, no key shows the playhead).
- **For Session 13 (Opus), what will bite:**
  - The page's checks press keys and read views through the core, so most of what Rack
    needs is already proven once; what is Rack's own is the latch (D57 item 4) and the
    parameters. Keep the Probe's `handoff.hpp` scheme: the page's equivalent, a count of
    queue entries taken beside each view and snapshot, was what made its checks exact
    rather than timed.
  - The view's white needs a host-side "last fires seen" per track, not a flag; the page
    keeps one array and a timer for when the next white goes out.
  - `rack/fixtures.jq` still leaves format 2 out; Session 13's own filter is in its list.
- **Later the same day, with the owner (D60, D61):** a mouse latches by **Ctrl+click** (Cmd
  on a Mac) on sound, pattern, bpm, function and fx; a plain click is a real hold; the next
  press of any key lets a latch go, a slider move does not. Session 13 builds the same in
  Rack, which keeps right-click for its own parameter menu (R47). The sounds sheet now
  plays what it sets: a name plays its sound, the switch changes it and plays it. `make
  play` has a fourth phase for both; three more planted faults, each caught.
- **Next: Session 13,** on Opus.

## Session 15 — effects: the PO-12's, ours, and Rack's (design loop, Fable 5.2; next, D65)

(Done 2026-11-23. The heading is as it stood in `PLAN.md`; the list is as written, ticked.
Its last box became Sessions 16 to 19 there. Its Handover is in `PLAN.md` until two later
notes push it here.)

- [x] **First, small (D65 item 4): CI's Linux image.** A Docker image with Ubuntu 16.04 and
      what `rack/ci-linux.sh` installs (build-essential, curl, ca-certificates, jq, zstd
      1.5.6, rustup), pushed to GitHub's container registry and used by the workflow, so
      `apt-get update` (12 of 13 minutes) runs once, not every push. Keep glibc 2.23 and
      gcc 5.4 exactly; `check-dist.sh` still holds the result. Measure the job's time before
      and after.

The owner's brief, 2026-11-23, in their words: "I think we should possibly have three sets of
sends and returns? But I really don't quite know yet. At the least triggers out, with voices
back (like we have now), since that is the main way to get voices out. Additionally we need a
good way to process those voices with *either* the internal FX or the external FX. But the
challenge is that we haven't built the internal FX engine to match the PO yet. So we need to
first-and-foremost make sure we understand those. [...] It's then partly a problem of needing
to build a *start* of fx processing in our own model (again loosely inspired by the PO
processing / FX layers for now), and making sure we can take that *workflow* into Rack. The
thing is that it's a performative workflow. So it sort-of layers the FX effects, and has FX
triggers that are very specific per channel as well. So we would need to take out the FX
triggers plus the voices inside of VCV Rack." And: "go into an FX-specific design and
implementation loop on Fable 5.2". O15.

A design loop, then builds: Fable rules where the brief is silent, as in Sessions 9 and 10.
Order against Session 14 is the owner's call; neither needs the other.

- [x] **Research first, written to `REFERENCES.md` with sources and dates:** Teenage
      Engineering's PO-12 guide (R23) on fx: the sixteen effects, punch-in (fx + key while
      playing), clearing (fx alone), whether effects are recorded per step (parameter
      locks) and per sound or on the master. Other written guides and manuals. Open-source
      PO-12 clones and how they built effects: `ulnd/po-12` (R30, MIT, already read once:
      re-read for fx) and any other. Facts, intentions and guesses kept apart (⚠). No
      Teenage Engineering material copied (README rule 6).
- [x] **What the PO-12's fx does, as a workflow:** which effects layer, which are
      performance (held) and which are written into the pattern, and what "per channel" means
      there. Questions the hardware hour must answer go into `WORKFLOW.md`.
- [x] **Our first fx in the core, loosely inspired:** a small set, `+ − × ÷` only and the same
      bits everywhere (ENGINE.md §11's rule); per sound or on the mix; how the fx key and a
      grid key drive it; what the view shows; what the snapshot keeps. ENGINE.md sections, a
      D-number, fixtures worked by hand.
- [x] **Rack, the routing:** what stays (TRIGGERS and VOICES out, RETURN in, D62), and what is
      added so each sound can be processed by *either* the internal fx *or* a Rack effect.
      The candidates sketched on 2026-11-23: a send and return per bus (the owner wondered
      about three sets); fx + key as per-channel gates or triggers out, so the
      performance drives Rack effects; or both. The fx triggers per channel go out beside the
      voices. The panel's room (24 HP, six jacks) is part of the answer, as is D33's expander.
- [x] **The same workflow on the page,** where there is no external fx: what the internal fx
      covers there.
- [x] Build sessions, planned with lists like Sessions 10 to 13, each efficient and measured
      (Ground rules).

### After Session 13: the Rack module (2026-11-23)

- **Built: the Rhythm module,** `rack/src/Rhythm.cpp`, 24 HP, on the redrawn panel. Every
  key and both sliders are Rack parameters; the face is drawn from the core's view; CLOCK,
  RESET and the table clock; TRIGGERS, VOICES and AUDIO; the starter pack; the snapshot
  saved and loaded as the Probe does. The latch (Ctrl+click), the computer keys, D63's
  double-click, and the menu: Sounds, RETURN, and Self-test. The core did not change: ABI 5.
- **RETURN (D62),** `rack/src/jacks.hpp`, held by `rack/test/jacks.cpp`, which `make test`
  now runs. Unpatched, AUDIO is the core's mix bit for bit. A return of silence on channel
  1 gives the mix of the same beat with no bass drum, bit for bit, with VOICES and TRIGGERS
  unchanged. A sound's own VOICES channel returned gives the same mix **to within 1.2e-7,
  not bit for bit**: `5x / 5` is not always `x` in floats. To hold the core's order, the
  plugin is now built with `-fno-associative-math -fno-reciprocal-math` after Rack's
  `-funsafe-math-optimizations` (`rack/math.mk`). clang, which builds the macOS plugin,
  regrouped the sum without them.
- **The panel's sixth jack:** `design/make_panel.py` draws RETURN at 34 mm with ecru
  stitches. The wordmark moved right and, by D62 item 4, dropped to 3.0 mm: at 3.5 mm it
  is 37.8 mm wide and the room is 33.4 mm. It is outlined from ExtraBold now
  (`design/fonts/`, with the OFL), which closes DESIGN.md's old ⚠ about the Bold cut.
- **Proven:** `make test` (the report and all 276 render files the same bytes as before
  the session); `make -C rack selftest` at 44.1, 48 and 96 kHz: the four probes as before,
  and six Rhythm modules, the three format 2 fixtures each on the table and on an 8 Hz LFO.
  Each pressed its own parameters, one a frame from the frame after each boundary
  (`LEARNINGS.md` says why one a frame and why 8 Hz). Every pass matched its trace, every
  view its text, and both slider caps the view. One played through its own RETURN; a
  Rhythm instrument loaded an old patch's version 1 snapshot. Nine faults planted in the
  module and nine in `jacks.hpp`, each caught by a named check (two only after the test
  was tightened; `LEARNINGS.md`). The repo's `make verify`: see below.
- **Seen, not only counted:** Rack's screenshot mode draws the face on this desktop (Machine
  state). It found one bug no headless run could: the sliders were placed by centring a
  widget whose size Rack starts at infinity, so their position was NaN and they were never
  drawn. A scratch build with a hand-made view showed every lit state as DESIGN.md has it.
  Nothing has been pressed by hand.
- **Opus decided nothing. Nine readings built on, each ⚠, each a line or two:**
  1. The menu's per-key sample switch also plays the sound, as the page's sheet does (D60
     item 4 carried to Rack's menu).
  2. A key that a patch saved as held starts held, and is not a press. Rack saves parameter
     values; the module reads the first frame's as where things start.
  3. A slider drags at Rack's own knob speed (its settings apply), not one to one with the
     43 mm travel. One line: `speed` in `RhythmSlider`.
  4. Rack's Initialize empties the beat (a fresh engine) and sets RETURN back to "As the
     cable carries".
  5. Ticking one sound in RETURN's menu while on "As the cable carries" starts from the
     sounds the cable carries now.
  6. "RETURN carrying sound 1's own VOICES channel back gives the same mix" read as to within
     rounding (above).
  7. VOICES is not bent by tanh: one voice peaks near 2.5 V. Only AUDIO is.
  8. In a self-test the weave's area shows the fixture, its count and a green or madder
     square. Green is not a Loom token; it marks a test, not the instrument.
  9. The display's and keys' sizes measured off `loom/rack.html` and the page (DESIGN.md,
     "Not done").
- **CI and `make verify`:** the repo's `make verify` passed before the push (the smoke test
  and the Rack It proofs skip: no Playwright). CI run 45153314152: all four platforms built
  and passed `check-dist.sh`, which now also wants the panel, the font and its licence. So
  `glfwGetKey` links on Windows and macOS too. ⚠ The first Linux attempt hung for 11
  minutes before compiling anything: Ubuntu 16.04's archive was slow, and `ci-linux.sh`
  hides apt's output and the job has no `timeout-minutes`, so a stall is silent for up to six
  hours. Cancelled and re-run; the re-run passed in 14 minutes (usually 1.5). Recommended: a
  timeout on the job and apt's progress shown. Not done; it is the owner's call.
- **For Session 14:** the Rack display's weave area is `RhythmDisplay::draw`; the view
  reaches it through `Face` every frame, so painting cells is a loop there. `harness/race.cpp`
  and `keys.rs` still hold bytes 48 to 63 to zero (Session 14's list). The screenshot route
  (Machine state) is how to see the weave in Rack without a person.
- **Later the same day, with the owner in Rack.** The owner played the module and is happy
  with the Rack side. Two findings: a Clocked ×1 clock runs the beat at a quarter of the
  speed, and the tempo readout keeps the stored tempo on an external clock. Both inputs
  were tested and work (a scratch build, headless: 95 edges gave 95 steps; 8 resets gave
  8 returns to step 1). The owner ruled D64: one edge a step stays, as SEQ-3's, and the menu
  will offer one edge a beat. The readout from the edges is proposed in D64 item 3. Then
  perf: the module's time fell 31% (above, and `LEARNINGS.md`), and efficiency, measured,
  is a ground rule. CI's Linux job now has a 30-minute limit and says which setup step it
  is in. Questions still open: the nine readings above, the parameter reading rate, and how
  the fx key should reach Rack modules: now Session 15, a design loop on Fable 5.2 with the
  owner's whole brief in it (O15). Session 14 or Session 15 first is the owner's call.
- **Then the owner's rulings, D65:** effects first (Session 15); D64's measured tempo with
  "ext" decided; the nine readings accepted; CI's Linux image as Session 15's first small
  task. The idle CPU (0.6% stopped) is in "Later: efficiency".
- **Next: Session 15, on Fable 5.2:** the effects design loop, research first, with CI's
  image as its small first task. Then Session 14 (the weave), which should also plan D64.

## Session 16 — the lane and the repeats, in the core (build, Opus; done 2026-11-23)

`ENGINE.md` §17; D66; D67 item 1. No sound path changes: this session is the sequencer.

- [x] Before any change: `target/report-rust.txt` and a `sha256sum` of `target/render-*.f32`
      kept; `fixtures/snapshots-v2.txt` written by today's core (each fixture's version 2
      snapshot, as `snapshots-v1.txt` was in Session 11) and committed.
- [x] `make bench`, new: nanoseconds a frame of `pi_process` for an idle engine, the minimum
      beat and all sixteen sounds, a release build, the best of five. Run it before the
      change; the number goes in `LEARNINGS.md`.
- [x] A second fixture by hand, before code, into `fixtures/designed/`: effect 10 (128
      ticks) over four steps with swing on and one step at a probability under 100, so the
      run's own grid, the unswung repeats and the draw order are each in a trace.
- [x] Commands 23 `FX` and 24 `FXSOUND`; the lane and `fx_sounds` in the pattern; clear
      empties the lane.
- [x] The keys: fx + key punches; the last key held wins and the one before comes back;
      fx let go ends them all; stopped, nothing (§17).
- [x] The sequencer: the lane written by arriving steps; `eff`; the four repeats.
- [x] The view's bytes 55 to 59 (the grid's table does not change). `harness/race.cpp`'s `look()` and
      `the_view_follows_edits…` in `core/src/tests/keys.rs` hold bytes 48 to 63 to zero:
      now 48 to 54 and 60 to 63.
- [x] Snapshot version 3; versions 1 and 2 still load (the two files of old snapshots).
- [x] Fixture format 3 in the three harnesses; both designed fixtures moved up unchanged
      and run. A disagreement is settled in `ENGINE.md`, not in the trace.
- [x] A rule test for each row and bullet of §17; the 20 000-press generation test with fx
      in it. Planted faults.
- [x] `core/include/pi_engine.h`; the page's worklet and the Rack module still build and
      pass their checks. Nothing is drawn yet, but fx + 9 to 12 already repeats on both,
      because the keys reach the core: say so in the Handover so the owner can try it.
- [x] `make bench` again: an empty lane costs nothing measurable, or the Handover says what.

## Session 17 — the bus and seven sound effects (build, Opus, then the owner's ear; done 2026-11-23)

`ENGINE.md` §18; D67 items 2 and 3.

- [x] Before: the report, the render hashes, `make bench`.
- [x] The bus and the rest; idle is today's path, the same bytes (all 276 render files).
- [x] The ramp; effects 1, 2, 3; the filter and effects 5 to 8, the sweeps in ticks.
      The stmlib and Plaits notices in the file's header; a credits line on the page and in
      the plugin's manifest (D67 item 3).
- [x] Render pairs, native and `.wasm` the same bytes: each effect punched over the minimum
      beat, at three rates. A sound switched out of the effects is the same in the mix with
      and without one.
- [x] `web/listen.html` gains the seven, each over the beat, so the owner can hear them
      beside the dry beat. Every constant in §18's table is a first value: the owner's ear
      moves them, as it did the voices.
- [x] `make bench`: idle, and each effect on. Planted faults.

### After Session 15: the effects, researched and designed (2026-11-23)

- **CI's Linux image is in, measured.** `rack/ci-linux.Dockerfile` (Ubuntu 16.04 by digest)
  and `rack/ci-linux-setup.sh`; the workflow pulls
  `ghcr.io/kinggs/sidequests/pi-rack-linux:<hash of the three files it is made from>`, or
  builds and pushes it once if that tag is not there. The Linux job: 78 s on a good day and
  14 min 35 s that morning before; 12 min 18 s the one run that built the image (727 s of
  it apt); **28 s after** (pull 11 s, build 11 s; run 45170623935). `ci-linux.sh` now
  refuses any gcc but 5.4 and any glibc but 2.23, and still works in a bare `ubuntu:16.04`.
  `check-dist.sh` passed on all four as before.
- **Researched, with sources, in `REFERENCES.md` R48 to R62:** the PO-12's effects (the
  maker's two sentences; reviews; the sibling guides; two videos read from their captions);
  open-source effects engines and what may be ported; Rack's conventions for sends,
  returns and gates; MixMaster.
- **What the research changed in the brief:** the PO-12's effects are on the whole mix,
  not a channel (R50), and they are always recorded, a step at a time, with write off
  (R49, R53). No open-source clone implements them (R55).
- **Designed, as proposals for the owner (O16):** D66, a lane a pattern, written by the
  steps that arrive, and a switch a sound for "per channel"; D67, four repeats in the
  sequencer (they go out on TRIGGERS) and seven sound effects on one bus, the filter and
  two more ported from stmlib and Plaits (MIT) with credit; D68, Rack: FX GATES out and FX
  SEND and FX RETURN round the bus, with the returns moved into the core so a returned
  sound takes the effects too; D69, the page. `ENGINE.md` §17 to §19.
- **A fixture worked by hand before any code:** `fixtures/designed/fx-repeat-punch.json`,
  format 3 (`fixtures/README.md`). No harness reads `designed/`. `make verify` passes with
  it there.
- **From the owner's PO-12, the same day (D71):** the chosen sound's steps are lit whether
  write is on or off. Ours lights none with write off (D37). A fact; the change is
  proposed, as Session 20.
- **MixMaster (D70, parked):** one cable cannot reach sixteen tracks. Today VCV Split and
  sixteen cables; one gesture needs a breakout expander with sixteen jacks.
- **Not done, and why:** nothing was built in the core (a design session). The delay and
  feedback (4, 14) and effects 13, 15 and 16 are not designed: the first two need a ruling
  on stored sound, the rest need the hardware (`WORKFLOW.md`, "The effects: what to check
  on the PO-12"). The panel with nine jacks is a claim from arithmetic (D68 item 5 ⚠), not
  drawn.
- **Checked on the owner's PO-12 the same day,** six of the thirteen rows in
  `WORKFLOW.md`: recorded with write off, heard at once, cleared by the steps that pass,
  the last of two keys wins and the first comes back, stopped does nothing, no key lights
  and the display marks it. The last three corrected the design before anything was built
  (`ENGINE.md` §17 says where; `LEARNINGS.md`). Then three more held: the pressed step is
  not recorded, clear wipes the lane, an effect outlives its note. **Not confirmed: the
  repeats.** Effect 9 gave no repeat the owner could hear, so Session 16's four repeats
  are ours, under the hardware's names, until that is known.
- **For the owner:** the four checks left in `WORKFLOW.md`.
- **For Session 16 (Opus), what will bite:**
  - The fixture's keys land a frame after a boundary, so a punch never writes its own
    step: read `fixtures/README.md`'s notes on it before the code.
  - `seq.tick` needs to know whether fx is held and what is punched: pass them in, do not
    reach into the keys from the sequencer.
  - The punched keys are kept in the order they went down (the last still held wins, and
    the one before comes back): sixteen keys at most, so a small fixed array.
  - A repeat fires on ticks that are not a step's tick 0. On an external clock those ticks
    come in a burst when an edge is early (§4): the trace is the same, the frames are not.
  - There is no bench yet; the list starts by making one.
- **Ruled the same day: D72.** All accepted; the jacks on the panel; D71 yes; D70 later.
- **Next: Session 16,** on Opus.

## Session 21 — the sliders are the hand's; a step keeps what it was written with (build, Opus; D75; done 2026-11-23)

`ENGINE.md` §20; D75. After Session 17. Small in the core; it changes what three fixtures'
views say, by decision, so the order below matters.

- [x] Before any change: the report, the render hashes, `make bench`;
      `fixtures/snapshots-v3.txt` written by today's core and committed.
- [x] By hand, before code: `keys-tap-and-choose`'s views worked again from §20 (a slider
      now shows the same for every sound), and any other view line that §20 changes, each
      explained in `fixtures/README.md`. A view changed by a decision is not a trace edited
      to pass a build; say which lines and why. No trace changes.
- [x] Command 26 `KEEP`; `STEP` 0 forgets; `PARAM` sets all sixteen; a write-mode key that
      turns a step on keeps the sliders; clear forgets all.
- [x] A step's hit, and a repeated hit, use what the step keeps.
- [x] The view's bytes 60 to 63; fixture format 4 in the three harnesses;
      `fixtures/designed/keeps-what-it-was-written-with.json` moved up unchanged and run.
- [x] Snapshot version 4; versions 1 to 3 load, each step that is on keeping its sound's
      own values.
- [x] A render pair: two steps of one sound written at two slider positions sound at two
      pitches, native and `.wasm` the same bytes. Every existing render file unchanged.
- [x] The page and the Rack module: the cap is the hand and moves by itself only with bpm
      held or after a load; the second mark from bytes 60 to 63, drawn as
      `design/DESIGN.md` says (⚠ if it does not say yet, draw a thin thread-coloured line
      across the slider's track at that value, mark it ⚠ in DESIGN.md's "Not done", and
      ask in the Handover). `make play` and the Rack self-test hold both.
- [x] D77 item 5: the stmlib and Plaits MIT notice as a file in the plugin's `res/`,
      beside the font's OFL; `check-dist.sh` holds it there; CI green on all four.
- [x] `WORKFLOW.md`'s deliberate differences brought up to date. Rule tests; planted
      faults; `make bench` after.

Later, not planned: holding a step and moving a slider; holding write to record a
slider's movement; live record of notes (D75 item 3). The sliders out and back in Rack
are in Session 18 (D76).

### After Session 16: the lane and the repeats, in the core (2026-11-23)

- **Built, ABI 6 (`ENGINE.md` §17, now marked built):** commands 23 `FX` and 24 `FXSOUND`;
  the lane and the sounds' fx switches in the pattern; clear empties the lane; fx + a grid
  key punches (the last held wins, the one before comes back, fx let go ends them all,
  stopped nothing is heard or written); the lane written by the steps that arrive; `eff`;
  the four repeats (9: every 96 ticks, 10: 128, 11: 48, 12: 64), each run on its own grid
  from the step it began on, unswung, a draw a hit, out on `TRIG`; the view's bytes 55 to
  59; snapshot version 3 (408 bytes), loading versions 1 and 2 with the lane empty and
  every sound in; `pi_engine.h`. `make bench`, new (`harness/bench.cpp`).
- **Proven:** `fixtures/snapshots-v2.txt` written by the ABI 5 core and committed first;
  then `fx-repeat-swing` worked by hand and committed before any §17 code. Both format 3
  fixtures moved up unchanged and passed at the first run in all three harnesses (216
  runs each, the three reports the same bytes). The seven older fixtures' traces and views
  are the same lines and all 276 render files the same bytes as before the session (only
  the 42 snapshot labels' hex differs). 143 Rust tests, 30 of them §17's in
  `core/src/tests/fx.rs`, the 20 000-press generation test with fx among them; every v1
  and v2 snapshot ever written loads to its fixture's trace. 24 faults planted in the core,
  the unplanted copy passing first: 24 caught, each by a named test; a wrong format 3 view
  planted fails the C++ harness (24 mismatches) and the Node test. `make test` (with P6's
  race and its six plants), `make play`, `make p4`, `make listen`, and Rack's `make
  install` and `make selftest` at 44.1, 48 and 96 kHz all passed.
- **Measured (`LEARNINGS.md`):** ns a frame, best of five, three runs each, before → after:
  idle 26.1–27.0 → 25.5–26.0; the minimum beat 28.3–29.5 → 27.9–29.4; all sixteen
  41.7–42.7 → 42.3–44.8. An empty lane costs nothing the bench can see.
- **Opus decided nothing. Three readings built on, each ⚠ in `ENGINE.md` §17, each a line
  or two to change:**
  1. A step that writes the lane moves the generation (§8 says "a command"); so a host
     saves a performance as it saves an edit.
  2. A repeat waits for the first step after play: play from stopped and reset clear `eff`,
     so the old run's grid never fires between a play and the next boundary.
  3. Bytes 402 and 403 of a version 3 snapshot are not read, as 381 to 383 are not.
- **Harness changes, not readings:** `harness/race.cpp`'s churn no longer presses fx (the
  lane would be written at the audio thread's pace, which its model cannot keep; the lane
  goes in by `FX`), and its `look()` holds 48 to 54 and 60 to 63 to zero and 55 to at most
  16. Rack's self-tests leave format 3 out until Session 18 (`rack/*.jq`).
- **For the owner to try now:** nothing is drawn yet, but both hosts carry ABI 6, so on
  the page and in Rack, while playing, hold fx and press key 9, 10, 11 or 12: the steps
  that arrive repeat (and record into the lane; fx alone wipes them as they pass). In Rack
  the repeats go out on TRIGGERS. Effects 1 to 8 and 13 to 16 punch and record but make no
  sound until Session 17. With a mouse (page or Rack): Ctrl+click fx, then hold the mouse
  down on a grid key; both let go when the button is released (D60). On a phone, two
  fingers; in Rack, the computer keys held together also work.
- **Next: Session 17,** the bus and seven sound effects (Opus). The bench is there to say
  what each costs; idle is the number to watch.

## Session 18 — Rack: the loop, the gates, the sliders' voltages, the panel (build, Fable; done 2026-11-23)

(Moved from `PLAN.md` when it was done, word for word, its boxes ticked. It sat under
"Sessions 16 to 19 — the effects, built". Its Handover is "After Session 18".)

On Fable because a contract first meets code (the returns move into the core) and the
panel is drawn by eye. `ENGINE.md` §19 with its addition; D68, D76. After Session 21: the
slider jacks carry what §20 makes.

- [x] `PI_AUDIO_LOOP` and `ROUTE` in the core; `rack/test/jacks.cpp`'s cases become core
      tests; `jacks.hpp` shrinks to volts in and out. Unpatched, AUDIO is still the mix
      bit for bit.
- [x] FX GATES, FX SEND, FX RETURN; the menu's tick an effect, with its default (D68 item
      2); the Sounds menu's "through fx" tick a sound.
- [x] D78 in the module: the fx latch stays on and holds fx only while a grid key is down.
- [x] A OUT, A IN, B OUT, B IN (D76 item 4; §19's addition): out is the value before an
      input replaces it; an input is read on the hit; the menu's ticks as RETURN's.
- [x] The panel redrawn by `design/make_panel.py` in two rows, thirteen jacks, grouped as
      D76 item 1 proposes; each output on its own patch of inverted ground. Seen in Rack's
      screenshot mode (Machine state) and by the owner before anything else is built on
      it: D76's positions are arithmetic. The existing jacks keep their port numbers, so
      old patches keep their cables.
- [x] The self-test plays the format 3 and 4 fixtures and holds FX GATES to each view's
      `fx`. One module plays through its own FX SEND and FX RETURN; one through A OUT to
      A IN.
- [x] perf, before and after, as Session 13's profile (Machine state): unpatched, the new
      jacks cost nothing measurable.
- [x] `RACK-RULES.md` and `design/DESIGN.md`'s jack table brought up to date.

### After Session 17: the bus and seven sound effects, in the core (2026-11-23)

- **Built, ABI 7 (`ENGINE.md` §18, now marked built):** `core/src/bus.rs`. The sounds in
  the effects are summed into a bus; effects 1 (a hold at 6 kHz), 2 (soft clip), 3 (crush),
  5 and 7 (a lowpass at 600 Hz, a hipass at 2 kHz) and 6 and 8 (the sweeps, by ticks) act on
  it and come in and out over a 2 ms ramp. The sixteen track channels are untouched. Idle,
  the mix is the old one. The filter, its tan, the soft clip and the hold are ported from
  Émilie Gillet's stmlib and Plaits, her MIT notice in the file's header; the credits on
  `web/rhythm.html` and in the Rhythm module's description in `rack/plugin.json`. No call,
  command, view byte or snapshot byte changed; the ABI is 7 by the rule for Sessions 16
  to 19. Every constant is in one marked block at the top of `bus.rs`, "TUNING THE EFFECTS".
- **Proven:** the report and all 276 render files the same bytes as before the session.
  Seven new render pairs (`harness/render-fx-*.json`: each effect punched over the
  minimum beat at step 1, let go at step 9, then replayed by the lane in bar 2; both
  clocks, three rates), 42 pairs native against `.wasm`, the same bytes. 161 Rust tests
  (17 of them §18's in `core/src/tests/bus.rs`, among them a model of §18 the mix equals bit
  for bit on every frame, at three rates and on edges; and that a sound switched out is the
  same in the mix with and without an effect). 25 faults planted in the core, the unplanted
  copy passing first: 25 caught, each by a named test (two only after a test was added for
  them, `LEARNINGS.md`); a wrong command number planted on the listening page failed `make
  listen`. `make test` (216 runs a harness, P6's race and its six plants), `make play`,
  `make p4`, `make listen`, and Rack's `make install` and `make selftest` at 44.1, 48 and
  96 kHz all passed. The core still needs no libm (`check-p1`) and the `.wasm` imports
  nothing.
- **Measured (`LEARNINGS.md`):** ns a frame, best of five, three runs each, before → after:
  idle 25.7–25.9 → 25.9–26.5 (back to back with the old build, 25.5–25.9 against
  25.6–26.4: within the bench's noise); the minimum beat 28.4–29.2 → 27.8–29.4; all sixteen
  42.0–42.6 → 42.7–44.1. Each effect on every step of the beat: 33.7 to 35.3, about 6 ns a
  frame over the dry beat. The first wiring cost idle 1.5 ns; moving the bus's working path
  out of line took it back.
- **Opus decided nothing. Four readings built on, each ⚠ in `ENGINE.md` §18, each a line or
  two to change:**
  1. What is cleared: each effect's state when it starts from idle or from another kind
     (the four filters one kind). So the hold starts at 0 and a filter after 1, 2 or 3
     starts clean. §18 names only the filter, from idle.
  2. "Damping 0.5" is stmlib's `r` (1 / Q, so Q = 2), as `voice.rs` uses the word; as a
     damping ratio it would be `r` = 1. The hipass sweep peaks about 1 dB over the dry beat.
  3. A sweep's place counts the ticks after the frame heard became the effect: a tick on
     that same frame is not counted (one tick at most).
  4. Heard again within 2 ms of ending (still ramping out) starts a sweep again, the filter
     keeping its state.
- **Questions for the owner:**
  1. The plugin's manifest has no credits field, so the credit is a sentence in the Rhythm
     module's description ⚠. Should the plugin also ship stmlib's MIT notice as a file in
     `res/`, as it ships the font's OFL? (MIT asks for the notice in copies of the
     software; the source has it, the built plugin does not.) Recommended: yes, a small
     change to `rack/Makefile` and `check-dist.sh`.
  2. The four readings above: accept as built?
- **Not done:** the bus is not heard in Rack with RETURN patched: the module then rebuilds
  AUDIO from the sixteen channels, which are before the effects (D62). Session 18 moves the
  returns into the core and fixes it. With RETURN unpatched, Rack plays the effects.
- **For the owner to try now:** `make hear` (in `pocket-instruments/`) and open the address
  it prints, or the live page `pocket-instruments/web/listen.html`: "Effects over the
  minimum beat", each of the seven beside "Dry beat"; "Dry, then wet" plays steps 1 to 8
  dry and 9 to 16 through the effect, so each bar compares them. In Rack and on
  `rhythm.html`, while playing, hold fx and press key 1, 2, 3, 5, 6, 7 or 8. The numbers to
  move are the "TUNING THE EFFECTS" block of `core/src/bus.rs`; then `make test` (a test
  that pins the old number fails and says which), `make web`, and listen.
- **Next:** Session 18 (Fable), or the owner's ear on the seven first.
