# Pocket Instruments

**Status:** design review. No code yet. Started 2026-11-18.

Small calculator-format musical instruments, free and open source, playable as VCV Rack modules
and in a browser, from one shared engine. An affectionate, credited homage to Teenage
Engineering's Pocket Operators. Not affiliated with Teenage Engineering.

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
