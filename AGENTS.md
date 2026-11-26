# Agent instructions

Read `CLAUDE.md` — it is the single source of truth for how to work in this repo,
whatever agent or harness you are.

The two-line version while you get there:

- **Commit directly to `main`. Never create a branch, never open a PR.** Deploy = push.
- This repo is deliberately faff-free: no build step and no review ceremony. Do not import
  those habits from other projects. It has one gate, `make verify`, run before a push.
  (Corrected 2026-11-26: this line said "no Makefile, no verification gates", which stopped
  being true when `make verify` arrived.)
- **A sidequest that has left is not worked on from here.** `CLAUDE.md`, "Graduates", says
  where each one lives and how to work it; its rules are its own.
