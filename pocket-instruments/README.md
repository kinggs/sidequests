# Pocket Instruments

**Status:** P1 and P2 passed (2026-11-19): the core sequences, on both targets, and makes no
sound yet. Next is P3, in Rack. Started 2026-11-18.

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
| `fixtures/` | Test vectors and the traces they must produce (`fixtures/README.md`) | A trace is never edited to make a build pass |
| `harness/` | The same fixtures through the `.wasm` in Node and through C++ on the static library | Follows `fixtures/README.md` |
| `Makefile` | `make build`: both targets. `make test`: the three harnesses, compared. The repo's `make verify` runs it | |
| `rust-toolchain.toml`, `mise.toml` | The Rust this folder builds with. `mise install` once | The two must name one version; `make check-toolchain` fails if not |
| `VOICES.md` | The sixteen sounds: role, recipe, what the sliders do | Until each voice is built and passes by ear |
| `samples/` | The starter drum pack: sixteen CC0 files, their origins, and a page to hear them | A swap is a new file and a new manifest row |
| `WORKFLOW.md` | What each press does, in our words; the owner ticks each row on the hardware | Until P8 |
| `RACK-RULES.md` | What any module of ours for VCV Rack is held to: the panel, the voltages, the code | Re-read VCV's manual (R33 to R35) before leaning on an old line |
| `design/DESIGN.md` | The look (Loom): tokens, key states, the panel in mm, the phone layout | Changed by a decision; `design/panel.svg` is redrawn by its script |
| `PLAN.md` | The sessions, their checklists and the Handover note | Each session ticks its boxes and writes its Handover |

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
