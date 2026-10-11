# A research run

Start a Claude Code session on the laptop, in this repo, with `family-tree/data` cloned, and say:
"Read `family-tree/tools/research/RUN.md` and do a research run." A run is 10 briefs, then it
stops: that's the cost ceiling (owner, 2026-10-11). The design is `family-tree/PLAN.md`,
Session 5; the agent's rules are [AGENT.md](AGENT.md). Nothing here touches the app or Firestore.

1. **Consent.** If the owner has an Export newer than `data/research/export.json`, save it there
   (it carries `consent/`, from Session 7). Without it, nobody living is briefed.
2. **Root.** `data/research/config.json` holds `{ "root": "<the owner's own id in the tree>" }`.
   If it's missing, ask the owner which record is them, once, and write it.
3. **Briefs.** `node family-tree/tools/gaps.mjs` ranks every gap and writes the next 10 to
   `data/research/briefs/`, one a person. Note its counts for the report.
4. **Agents.** The run number is one more than the last in `data/research/runs.json` (1 if none).
   Start one `general-purpose` agent per brief, all at once, each told: "Read
   `family-tree/tools/research/AGENT.md`, then research
   `family-tree/data/research/briefs/<brief id>.json`. This is run <n>." Wait for all of them.
   Note each agent's token use and the run's wall-clock time.
5. **Check.** `node family-tree/tools/research.mjs check`. A rejected finding moves to
   `findings/rejected/` with its reasons. Read each reason: a fault in the agent's file that is
   plainly a slip (a missing quote it had) may be fixed by hand and checked again; a rule broken
   stays rejected.
6. **Pack.** `node family-tree/tools/research.mjs pack` → `data/seed/family-tree-research.json`,
   every checked finding (the app skips any it already has). Then
   `node family-tree/tools/research.mjs lookups` → `data/research/lookups.html`, the searches to do
   by hand, grouped by site.
7. **Report.** `data/research/runs/<YYYY-MM-DD>.md`: the briefs, each finding's claims in a line,
   what was dropped as already known, what was rejected and why, the lookups by site, the time and
   the tokens. Append `{ run, date, briefs, findings, claims, rejected, lookups, tokens, minutes }`
   to `data/research/runs.json`.
8. **Hand over.** Tell the owner: Import the pack from the app's account sheet (once Session 7
   ships), open `lookups.html` for the hand searches, and commit the data repo from a session
   opened in `family-tree/data` (a session in this repo can't).

To redo a brief, the owner deletes its finding; the next run's finding for it is
`<brief id>.<run>`.
