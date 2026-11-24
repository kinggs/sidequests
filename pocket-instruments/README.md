# Pocket Instruments

**Status (2026-11-24):** it plays, on a phone (`web/rhythm.html`) and in VCV Rack (the
Rhythm module). Sixteen sounds, each built in code or a public-domain sample; the hardware's
workflow for writing a beat; effects punched in and recorded as they are played, with four
repeats and seven sound effects; sliders that are the hand's, with steps that keep what
they were written with; a display that weaves. In Rack, thirteen jacks: every sound's
trigger, audio and slider voltages go out and come back, and an effect can be a Rack
module. The engine is at ABI 10 with snapshot version 4; CI builds the plugin for all four
Rack platforms. Proofs P1, P2, P3 and P7 passed; P4, P5 and P6 are part-run and wait for an
iPhone and other machines (`PROOFS.md`).

Not finished: most of what was built on 2026-11-23 has not been seen or heard by the owner,
and every look in it is a stand-in until then; the effects are first guesses from the
hardware's names, untuned, and now measured against the owner's PO-12 (R64 to R68;
proposals in `ENGINE.md` §17 and §18, not built); five of the sixteen effects are not
designed. Designed and not built: FX SEND and FX RETURN as sixteen channels, a channel an
effect, with what comes back always in the mix (D87, D88). What is next is
`PLAN.md`, "Next, in order". How it got here, session by session, is `PLAN.md`'s "Done so
far" and `PLAN-HISTORY.md`. Started 2026-11-18.

Small calculator-format musical instruments, free and open source, playable as VCV Rack modules
and in a browser, from one shared engine. An affectionate, credited homage to Teenage
Engineering's Pocket Operators. Not affiliated with Teenage Engineering.

Also inspired by the Surge Synth Team's Surge XT modules for VCV Rack: how they show
modulation on a control, and how their modules connect to their neighbours. No code or
artwork of theirs is used; their MIT helper library will be, with thanks (D40, D41). Not
affiliated with them either.

This folder is an incubator. Once the proofs in `PROOFS.md` pass, it moves out of sidequests
into its own repository.

## Where things are

| File | What it holds | How it changes |
|---|---|---|
| `BRIEF-v0.1.md` | The original brief, as written with ChatGPT | Frozen. Never edited |
| `REVIEW.md` | The critical review of the brief: findings, evidence, what to change | A new review is a new section, dated |
| `DECISIONS.md` | Every decision, its state and why | Append only. A decision is superseded, not rewritten |
| `PROOFS.md` | What must be proven, the pass bar, the result | Pass bar written before the experiment; result after |
| `REFERENCES.md` | Outside facts we rely on, with source and date checked | Re-check before relying on an old entry |
| `LEARNINGS.md` | Dated notebook: what surprised us, what broke, why | Append only |
| `ENGINE.md` | The engine interface: time, the clock, commands, events, the snapshot | Changed by a decision; the header and fixtures change with it |
| `core/include/pi_engine.h` | The same contract in C, for both hosts | Follows `ENGINE.md` |
| `core/` | The engine: one Rust crate, `no_std`, no allocator, no dependencies. Its tests are in `core/src/tests/` | Built from `ENGINE.md`; a disagreement is settled there first |
| `fixtures/` | Test vectors and the traces they must produce (`fixtures/README.md`); `snapshots-v1.txt` to `snapshots-v3.txt`, the old snapshots that must still load; `designed/`, fixtures worked by hand for a core not built yet, which no harness reads; `weave-views.txt`, the set of views every harness weaves (§16) | A trace is never edited to make a build pass |
| `harness/` | The same fixtures through the `.wasm` in Node and through C++ on the static library; `bench.cpp`, what a frame of `pi_process` costs, the loop layouts too (`make bench`); the ThreadSanitizer harness (`race.cpp`, P6); the render comparison (`compare.mjs`, P7); the four-target check (`targets.sh`, P5) | Follows `fixtures/README.md` |
| `rack/` | The Rack plugin: the Rhythm module, the instrument (`src/Rhythm.cpp`; its jacks' volts in and out in `src/jacks.hpp`, tested by `test/jacks.cpp`; the mix is the core's since Session 18), and the Probe, which plays the format 1 fixtures and checks itself (P3). `handoff.hpp` is how a host moves things between its threads. `math.mk` holds the maths flags the plugin and its test share. `check-dist.sh` holds a finished `.vcvplugin` to Rack's rules (P5); `ci-linux.sh` is CI's Linux build, in the image `ci-linux.Dockerfile` and `ci-linux-setup.sh` make | `make install`; `make selftest` runs Rack headless (the Probe on format 1; the Rhythm module on formats 2, 3 and 4, through its own cables held to a second engine, and D78's latch); `make sound` is a patch to hear it. CI (`.github/workflows/pocket-instruments-rack.yml`) builds all four platforms on every push that touches the core or `rack/` |
| `web/` | `rhythm.html`, the instrument on a phone (Loom); the bare page and worklet on the raw `.wasm` (P4); `listen.html`: all sixteen voices beside the starter samples. `pi_core.wasm` is committed so Pages can serve it | `make web` after the core changes; `make play`, `make p4` and `make listen` run both desktop browsers |
| `Makefile` | `make build`: both targets. `make test`: the three harnesses compared, the weave's cells the same from all three, the Rack module's jacks held to the core (`rack/test/jacks.cpp`), the render comparison, the race harness. The repo's `make verify` runs it. `make targets`, `make p4`, `make listen`, `make play`: the slower checks | |
| `rust-toolchain.toml`, `mise.toml` | The Rust this folder builds with. `mise install` once | The two must name one version; `make check-toolchain` fails if not |
| `VOICES.md` | The sixteen sounds: role, recipe, what the sliders do, and what each was built as | Until each voice passes by ear |
| `samples/` | The starter drum pack: sixteen CC0 files, their origins, a page to hear them, and `raw/` + `tracks.txt`, the pack as the engine reads it (D50) | A swap is a new file, a new manifest row and a line in `tracks.txt`, then `python3 samples/make-raw.py` |
| `WORKFLOW.md` | What each press does, in our words; the owner ticks each row on the hardware | Until P8 |
| `RACK-RULES.md` | What any module of ours for VCV Rack is held to: the panel, the voltages, the code | Re-read VCV's manual (R33 to R35) before leaning on an old line |
| `design/DESIGN.md` | The look (Loom): tokens, key states, the panel in mm, the phone layout. `design/fonts/` holds JetBrains Mono ExtraBold and its licence (OFL), for the panel and the Rack module | Changed by a decision; `design/panel.svg` is redrawn by its script |
| `PLAN.md` | What a session needs: the rules, the machine, the lists not yet done, the latest two Handover notes. Its top says what else to read, and how little | Each session ticks its boxes and writes its Handover |
| `PLAN-HISTORY.md` | Every finished session's list and every older Handover note, word for word | A finishing session moves its list and the note before last here. Not read at the start of a session |

## Rules of this folder

1. **The brief is frozen.** Disagree with it in `REVIEW.md`; change course in `DECISIONS.md`.
   Why: the record of what we first thought, and why it changed, must survive.
2. **Facts, intentions and guesses stay distinct.** A fact has a source in `REFERENCES.md`.
   ⚠ marks anything unverified.
3. **A proof has a pass bar before it runs.** Why: a bar written afterwards always passes.
4. **A failed proof is a result.** Write it up; do not quietly change the experiment.
5. **Nothing generic until a second instrument needs it.** Why: the brief's own top risk is
   building a framework before one fun instrument.
6. **No Teenage Engineering material enters this repo.** No samples, firmware, photographs,
   traced artwork or logos. Why: `REVIEW.md` §IP.

## How it differs from the other sidequests

It is not a one-file web app. The repo rules on one file per app, no build step, version bumps,
Firebase and `shared/DESIGN.md` do not apply here. These still do: commit direct to `main`,
small commits, no secrets, `make verify` before a push. There is no `index.html` at this level,
so the smoke test skips the folder and the landing page does not list it.

## Starting a session

"Read `pocket-instruments/PLAN.md` and do Session N."
