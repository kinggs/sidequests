# Three attempts at the core's cost a frame (2026-11-25)

One brief, three models, each alone in a scratch worktree of `877b010` (Session 34's build):
make `pi_process` cheaper with the same bytes out. Then every build read together, ten rounds
interleaved on CPU 2 (`harness/pairs.sh`), nanoseconds a frame:

| Case | Before Session 32 | `877b010` | Codex | Opus | Antigravity |
|---|---|---|---|---|---|
| idle | 6.0 | 6.0 | 3.7 | 3.6 | 3.0 |
| beat | 31.5 | 36.4 | 14.3 | 13.9 | 9.5 |
| all | 50.8 | 54.8 | 46.8 | 35.2 | 29.3 |
| both | 33.6 | 37.5 | 14.8 | 14.4 | 10.0 |
| repeat | 36.9 | 41.9 | 22.6 | 21.1 | 18.5 |
| fx 1 | 39.2 | 34.1 | 19.6 | 20.7 | 12.7 |
| fx 1/0 | | 37.2 | 17.4 | 17.9 | 11.5 |
| fx 2 | 39.2 | 43.7 | 18.7 | 16.6 | 11.2 |
| fx 3 | 41.0 | 44.7 | 22.8 | 17.6 | 12.7 |
| fx 4 | 41.0 | 44.2 | 19.7 | 17.4 | 11.2 |
| fx 5 | 39.7 | 44.2 | 21.0 | 17.1 | 11.8 |
| fx 14 | 42.5 | 45.6 | 21.5 | 18.6 | 13.3 |
| loop | 41.9 | 45.5 | 18.6 | 20.2 | 12.5 |
| loop in | 43.7 | 47.2 | 19.9 | 22.1 | 13.2 |
| sliders | 37.0 | 40.0 | 21.1 | 18.4 | 12.6 |
| the `.wasm`, bytes | | 49 689 | 47 861 | 49 689 | 48 944 |
| the diff, lines added | | | 110 | about 250 | 1 212 |

All three passed `make test` untouched, and `harness/fuzz.cpp` found no differing byte in
10 000 seeds against `877b010`. Each was read by a reviewer who did not write it.

| Patch | Model | Ruled (Fable, D102) |
|---|---|---|
| `codex.patch` (deleted: built) | `gpt-6.2-sol`, high effort | **Adopted whole, built in Session 36** (applied as written; its comments rewritten with Session 36's own `make pairs`, a guard and six rule tests added; `PLAN-HISTORY.md`, Session 36). Two files; one idea (a mask of the sounds that may be sounding, so a silent voice is not asked) and three small ones; both hosts gain; a reviewer found no input that moves a bit |
| `antigravity.patch` | Gemini 4 Neon, XHigh | **Not adopted whole; a design pass first (Session 37).** The fastest, and no byte differs, but §18's mix is written five times, each hot voice has a second copy that is only right while a mask is, the fast paths are for tracks 0 to 3 (the bench's), and the paths production takes have no direct test. Its review names the parts to take as they are | **Designed in, 2026-11-25 (Session 37, D105):** taken as written, each measured alone: `Clock::advance`, `clear`, the cold handlers, the hats' and toms' tables, the `Tone` and bass split, `base_inc`, the squares in integers, the cached volume, the steady bus (with a guard), the no-audio split (its first half written once). Not taken: `step()`, `code_active` and `sample_active`, the five mixes, the paths for tracks 0 to 3; in their place one list that asks a voice, the zeros' arithmetic in one type, the mix once (Sessions 41 and 42)
| `opus.patch` | Claude Opus 5.5 | **Not adopted.** Native builds only (`cfg(not(wasm32))`), so the phone gains nothing and the two hosts run different code. It found the cause of Session 32's 4 ns: `Voices::ask` is a second caller of every voice's `next`, so LLVM stopped inlining `Snare::next` and `SynthSnare::next` into the frame loop. Its integer count of the hat's six squares and its per-track `sound` are ideas for Session 37 |

The patches are against `877b010`. A session that uses one deletes it here.
