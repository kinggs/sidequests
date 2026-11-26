---
name: graduatequest
description: Move a sidequest that has outgrown this repo into its own GitHub repository, with its history, a proper open-source kit and its backlog as issues, then leave a pointer here. Use when the owner says a sidequest should graduate, move out, get its own repo, or go open source. Outward-facing and partly destructive - confirm the name, the new repository's name and public or private before creating anything.
---

# Graduate a sidequest

A sidequest that grew up leaves for a repository of its own. The record of each move, and
what it taught, is `GRADUATING.md` at the repo root: **read it first**, and add to it last.
This skill is the procedure; that file is the experience behind it.

Done once so far (Pocket Instruments, 2026-11-26: an incubator with its own build, not a
one-file app). ⚠ Step 6's cloud-data part has never been run.

## The rule that shapes everything

**A session can change only the repository it was opened in.** So a graduation is two
sessions: one here that prepares and hands off, one opened in the new folder that commits,
pushes and opens the issues. Then a short third visit here to leave the pointer. Do not work
round the guard. **Probe it first:** before any drafting, try one changing command in
the new folder (`git tag probe && git tag -d probe` will do: it leaves nothing behind). If it is refused, plan the handoff
from the start. The guard stops shell commands, not the Write and Edit tools, so agents can
still draft files there: say so in the report when they do.

## 1. Confirm (pause here)

Ask once, with a recommended answer each:

- Which sidequest, and the new repository's name.
- Public or private. Creating a public repository is outward-facing: get a clear yes.
- Does the owner want to read the drafts before the push, or go straight on? (Straight on
  is fine: everything in a repository can be changed afterwards. Reviewing agents then
  read the drafts against the record.)
- What the backlog is: a plan file, a spec's open list, or nothing.

## 2. Carry the history (here)

```bash
git subtree split -P <folder> -b graduate-<name>      # nothing to install
mkdir ../<name> && git -C ../<name> init -q -b main    # then, in that folder:
git pull /path/to/sidequests graduate-<name>
git branch -D graduate-<name>                          # back here
```

Check the commit count against `git log --oneline -- <folder> | wc -l`.

**From this moment the folder here is frozen.** Anything written to it afterwards must be
carried across by hand, so write notes elsewhere (`GRADUATING.md`, the handoff).

## 3. Design the new place

Decide and write down, before drafting:

- **The layout:** a table from every path of today to its new one. Move as little as
  possible; put long design documents under `docs/`.
- **What goes across frozen:** the plan and session history as they stood, under
  `docs/history/`, each with a dated note at the top. The record of why must survive.
  Annotate; never rewrite.
- **What breaks by leaving:** grep code, scripts, Makefiles and CI for `../`, the folder's
  own name as a path, and this site's address. The old CI workflow lives in this repo's
  `.github/workflows/` and must be ported, not just copied.
- **How it is served:** Pages from the new `main`, and whether pages fetch sibling folders.

## 4. Draft the kit and the backlog

These can be drafted in parallel by agents. Give each agent **the old folder as its stable
copy to read from**, because another agent is moving files in the new one, and give each a
list of the files it alone may write.

- **The kit:** README (use it first, then why it exists, what it is not, inspirations
  linked, layout, build and test), LICENSE, CREDITS, CONTRIBUTING, a code of conduct by
  reference, SECURITY using GitHub's private reporting, `AGENTS.md` with `CLAUDE.md`
  pointing to it, issue forms, one pull request template, CI on pull requests.
- **The backlog as issues:** one for each piece of work, each task only the owner can do,
  each open question. A title, a body, labels, an order. Write them to a JSON file.
- **Then review:** one agent checks every claim, licence, path and command against the
  record; one follows the README as a newcomer and runs what it says; one asks what work
  has no issue. A last agent applies the findings.

Hold the kit to this repo's values: facts, intentions and guesses kept apart (⚠); every
source credited by name and link; nothing whose licence does not allow it; no email
addresses; no secrets.

## 5. Hand off

Keep the handoff outside both repositories, in `~/.cache/<name>/graduation/`: the scratchpad
does not survive a reboot.

- `HANDOFF.md`: the state of the new tree, the steps left in order, the owner's
  authorisation quoted, and what is unverified (⚠).
- `issues.json`: the issue list.

The session opened in the new folder then does, in order: the file moves; the gate, which
must pass before anything is pushed; commit; create the repository and push; Pages,
private vulnerability reporting, squash merges; **start any path-filtered workflow by hand**
(it does not run on a first push); watch CI to green; check the live page **by playing it in
a browser**; labels, then issues (read the list once more for duplicates first); a ruleset
on `main` last, with the admin bypass set to pull requests only. Expect Dependabot's pull
requests within a minute of the first push.

It ends by writing a prompt for the last visit here, and an issue in the new repository
that the visit closes.

## 6. Leave the pointer (here, only once the new place is proven)

**Check it yourself; do not take the handoff's word.** The repository answers, CI is green
on `main`, the site serves, and every tracked file of the old folder exists there:
compare them, and stop if anything here is newer.

Then, in one commit:

- `git clean -ndX <folder>` to see ignored build output, then `-fdX`; `git rm -r <folder>`;
  remove the empty folders left behind.
- A pointer `README.md` in the folder: it moved, when, where, that its history went with it.
- **Forwarding pages at every address people used.** This site serves no README, so
  without them an old link or a page saved on a phone lands on a 404. Keep them out of the
  folder's root `index.html` unless the smoke test can open it cleanly.
- Its workflow in `.github/workflows/`, its part of `make verify`, its `.gitignore` lines.
- `CLAUDE.md`'s map, and any other document that names it. A mention that is history gets
  a dated note, never a rewrite.
- The landing page: remove its tile if it had one, and add it under **Graduates**, which
  sits outside the app list and its count.
- ⚠ **Cloud data, for an app that stores any** (never yet done): its data under
  `sidequests/<app-id>/` in Firestore does not move with the code, and its rules live in
  `shared/firestore.rules`. Decide with the owner before the pointer goes in: export it,
  where it goes, and when the rule is retired. `SESSIONS-MIGRATION.md` is the notebook for
  the first app that will face this.

`make verify` (read its skip lines: without Playwright it runs no browser check), push,
then confirm on the live site: the landing page shows the graduate and
an old address forwards.

## 7. Close the loop

- Comment on the new repository's issue with the commits and what was checked, and close it.
- Add to `GRADUATING.md`: the row in its Graduates table, what this move taught, and
  whether these steps held. If they did not, change this skill in the same commit.
- Ask the owner before deleting `~/.cache/<name>/graduation/`.

## Report

Lead with where it lives now and that the old addresses forward. Then what the owner must
decide, then what was checked and what was skipped.
