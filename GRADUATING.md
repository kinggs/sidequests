# Graduating a sidequest

How a sidequest that grew up leaves for its own repository, and what each move taught.
Started 2026-11-26, when the owner ruled that Pocket Instruments goes first
(`pocket-instruments/DECISIONS.md`, D110). Sessions may be next (`SESSIONS-MIGRATION.md`).

**State: nothing has graduated yet.** The steps below are the plan, not experience. Each
move writes what it learned under "Learned", the same day. Once one move is done, this
becomes a skill (`/graduatequest`) if the steps held.

## When a sidequest graduates

The owner decides. Signs so far: it has outgrown one file and no build step; it wants
contributors, issues and pull requests; it has its own CI, its own site or its own backend.

## What stays true after it leaves

The values go with it. They are the owner's, not this repository's.

- **The record of why survives.** Decisions, the plan as it stood and the history of
  sessions go across, frozen if no longer live. Annotate; never rewrite.
- **Facts, intentions and guesses stay distinct.** ⚠ marks anything unverified.
- **Verify by running it,** not by a file existing: the gate passes in the new place, CI
  is green, the site serves, before anything is removed here.
- **No secrets, small commits, plain English.**
- **Credit every inspiration by name and link.** Take nothing whose licence does not
  allow it; ask the author when the licence cannot be read.
- **Agents are first-class contributors:** an `AGENTS.md` at the root, with `CLAUDE.md`
  pointing to it.

## What changes

- **Direct to `main` becomes pull requests.** `sidequests` trades review for speed on
  purpose; a project that invites others cannot.
- **The plan file becomes issues.** One issue for each piece of work, each owner's task and
  each open question.

## The steps

1. **Design the move before making it** (a design session): where every path goes, how
   the history comes across, what CI and the site need, every community file drafted, the
   backlog written as a list of issues. The owner reads the drafts.
2. **Make it** (a build session). Creating a public repository is outward-facing: the
   owner says yes in that session.
3. **Prove the new place** before touching the old: the gate, CI, the site, an install.
4. **Only then, here:** the folder becomes a pointer, its workflow and its part of
   `make verify` go, `CLAUDE.md`'s map is corrected, and the landing page lists it under
   **Graduates**.
5. **Write what it taught,** below.

## Graduates

| Sidequest | Left for | When |
|---|---|---|
| Pocket Instruments | `kinggs/pocket-instruments` | under way since 2026-11-26; not yet pushed when this was written |

## Learned

From Pocket Instruments, 2026-11-26, while the move was still under way:

- **A session can change only the repository it was opened in** (the `cwd-guard` hook). The
  move was prepared from `sidequests` and had to be finished from a session opened in the
  new folder. Plan for two sessions: one here that carries the history and writes a
  handoff, one there that commits, pushes and opens the issues.
- **`git subtree split -P <folder> -b <branch>`** carries a folder's commits with nothing
  to install; a new repository then pulls that branch. `git filter-repo` was not on the
  machine.
- **Keep the handoff and the issue list outside both repositories** until the new one is
  pushed (`~/.cache/<name>/graduation/`): the scratchpad does not survive a reboot.
- **Agents drafting in parallel need a stable copy to read from.** One agent moved files
  while others read; the readers were pointed at the old folder, which did not move.
- **Still to do here for Pocket Instruments** (step 4 above): the folder to a pointer, its
  workflow and its part of `make verify` removed, `CLAUDE.md`'s map, "Graduates" on the
  landing page. Only once the new repository builds, passes CI and serves the page.
