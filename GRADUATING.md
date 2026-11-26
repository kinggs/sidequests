# Graduating a sidequest

How a sidequest that grew up leaves for its own repository, and what each move taught.
Started 2026-11-26, when the owner ruled that Pocket Instruments goes first
(D110, now `docs/DECISIONS.md` in its repository). Sessions may be next (`SESSIONS-MIGRATION.md`).

**State: one graduate.** Pocket Instruments left on 2026-11-26. The steps below held, with
one change made after it (step 1's last line, and "Did the steps hold?" at the end). Since
the same day the procedure is a skill, `/graduatequest` (`.claude/skills/graduatequest/`):
that is how to do it; this file is what each move taught. A move that finds a step wrong
changes the skill in the same commit.

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
   backlog written as a list of issues. The owner reads the drafts, or says to go
   straight on (reviewing agents then read them against the record).
2. **Make it:** two sessions. One here carries the history and writes a handoff; one
   opened in the new folder commits, pushes and opens the issues. Creating a public
   repository is outward-facing: the owner says yes first.
3. **Prove the new place** before touching the old: the gate, CI, the site, an install.
4. **Only then, here:** the folder becomes a pointer, its workflow and its part of
   `make verify` go, `CLAUDE.md`'s map is corrected, and the landing page lists it under
   **Graduates**.
5. **Write what it taught,** below.

## Graduates

| Sidequest | Left for | When |
|---|---|---|
| Pocket Instruments | [github.com/kinggs/pocket-instruments](https://github.com/kinggs/pocket-instruments), played at [kinggs.github.io/pocket-instruments](https://kinggs.github.io/pocket-instruments/) | 2026-11-26 |

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
- ~~**Still to do here for Pocket Instruments** (step 4 above): the folder to a pointer, its
  workflow and its part of `make verify` removed, `CLAUDE.md`'s map, "Graduates" on the
  landing page. Only once the new repository builds, passes CI and serves the page.~~
  Done the same day, once all three were checked.

From the session that finished the move in the new repository, 2026-11-26:

- **A path-filtered workflow does not run on a new repository's first push.** Start it by
  hand (`gh workflow run`); give every such workflow a `workflow_dispatch`.
- **The headless page checks cannot test the deployed site:** the harness reads results
  POSTed to its own origin. Check the live page by playing it in a browser.
- **Dependabot opens pull requests within a minute of the first push.** Expect them before
  the ruleset.
- **Read a drafted backlog once more before creating it:** two of 82 were duplicates, one
  answered (the new repository's D111) while the list was being drafted.
- **Freeze the folder once its history is split, or diff it before the pointer replaces
  it.** A same-day note to `PLAN.md` landed after the split and had to be carried by hand.
- **The admin bypass on a ruleset is set to "pull requests only".** Agents act with the
  owner's credentials, so a full bypass would let them push straight to `main`.
- **Two sessions, as planned, worked.** The handoff file and the issue list in
  `~/.cache/<name>/graduation/` carried everything across.

From the session that closed it here, 2026-11-26:

- **Check the new place yourself before removing the old.** This session read the
  repository, its CI runs and the three site addresses, and compared every tracked file
  here against the new `main`: all 208 were there, 17 had moved on there, none was newer
  here.
- **`git rm -r` leaves build output behind.** Ignored files (1.8 GB of `target/` here) and
  empty folders stay on disk; `git clean -ndX <folder>` shows them before `-fdX` removes them.
- **A graduate is not an app of this site.** On the landing page it sits outside the app
  list and its count, linking out.

From the retro of the day, 2026-11-26:

- **Try one changing command in the new folder before fanning out.** Thirteen agents had
  drafted for nearly twenty minutes before the first `git mv` met the guard. One probe at
  the start would have shaped the plan as two sessions from the beginning.
- **The guard stops shell commands, not file writes.** Agents wrote the kit into the new
  checkout with the Write and Edit tools unhindered, and only `git` was refused. The rule
  is still the rule: say plainly when work crossed it.
- **`make verify` ran half a gate all day.** With no Playwright package it skips the smoke
  test and every Rack It proof, and still exits 0. Chromium was installed; only the package
  was missing. Read the skip lines, not the exit code, before saying "verified".
- **Fixed the same day:** Playwright is now installed here (`CLAUDE.md`, "Working style", has
  the one command and its trap), and the full gate passed: all 7 apps and all 14 proofs.
- **A pointer is not a redirect.** This site serves no README, so the old addresses were
  404s for a few minutes after the first push. Check an old address before pushing.

## Did the steps hold?

Yes, in order and in substance: design, make, prove the new place, only then change the
old, write it down. What happened differently:

- **Steps 1 and 2 ran as one,** at the owner's word, without the read of drafts between
  them. Nothing was lost by it: every file in a repository can be changed afterwards, and
  two reviewing agents read the drafts against the record. So the owner's read is now
  optional in step 1, and the yes before a public repository is created stays.
- **Step 2 took two sessions,** not one, because of the first lesson above. The steps now
  say so.
