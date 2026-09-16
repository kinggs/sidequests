# Rack It v3 — working doc for the build sessions

Fair Nine became **Rack It**: three cue games, one Zargo rating, a phone-first layout that
holds a club. This doc is the handover between consecutive Claude Code sessions. Each
session ends with the app **deployed and working**, then ticks its boxes and writes its
handover note below, so the next session starts from the truth.

**Start every session with:** "Read `rack-it/V3-PLAN.md` and do Session N."

## Read first, every session

1. `CLAUDE.md` — the repo rules. Direct to `main`, one file per app (plus `zargo.js`), bump
   `APP_VERSION` and `CACHE` together, deploy with `/deployquest`, test with `?mock`.
2. `rack-it/SPEC.md` — the app as it is, in one document. Update it in the same commit when a
   decision here changes it.
3. `rack-it/ZARGO.md` — the rating across games: definition, per-game `r` and `w`, the
   update, the handicap levers, the known challenges.
4. The **Handover** section at the bottom of this doc, for what the previous session left.
5. `rack-it/index.html` itself. Read the whole file before changing it (about 3,000 lines);
   the rating engine is `rack-it/zargo.js`. The live scoring screen is a prototype the owner
   likes, so extend it, never rebuild it. **Session 6 retires this rule:** the redesign may
   change the live screen's interaction, within the list of behaviours that must survive.

## Ground rules for every session

- **The 11-Point-Nine game must behave identically after every session.** Same taps, same
  numbers. `node --test` from the repo root must pass, and a change to ratings adds a test.
- **Deploy at the end of the session, not the start of the next.** A session that can't
  finish its list deploys what works and writes the rest into Handover.
- **Version:** Session 5 landed `2.0.0` (the move to `rack-it/`), Session 6 lands `2.1.0`.
- **No new files in the app folder** except what the spec names. No frameworks.
- **Don't build ahead.** Each session's list is the whole of that session. Ideas go in
  "Parked".
- **Test in the harness:** serve the repo locally and open `rack-it/?mock` (CLAUDE.md). Never
  test against real Firestore data.
- Ask the owner nothing that the spec, ZARGO.md or this doc already answers. If something is
  genuinely open, pick the simplest reading, do it, and say so in Handover.

---

## Sessions 1 to 4 — what shipped

**Session 1 (1.0.0) — the name, games in the data, Zargo per rack.** The app became Rack It
and "session" became "match" on screen. Every match document carries `game` and `handicap`
(old ones read as 11-Point-Nine with Scoring), `state/main.config.games` holds each game's
points and `w`, and the rating update became per rack, with 11-Point-Nine weights spread by
live points so old results are numerically identical. People gained a Cuescore link.

**Session 2 (1.1.0) — Golden-Nine and Trad-Nine.** A game picker in setup; a live screen for
both games with a Foul button and three win buttons per player; Golden-Nine scoring with
fouls, three-foul racks, intentional fouls and a deciding rack; rack records, resume, Watch
and Export for the new shapes; ratings from rack winners at `w = 0.5`. Then 1.1.1 renamed the
games Trad-Nine · Golden-Nine · 11-Point-Nine, 1.2.0 added Race to 3 and N for Trad-Nine, and
1.2.1 renamed Family to Invites.

**Session 3 (1.3.0) — handicap levers and the one-screen setup.** Setup fits one screen with
Start pinned; Off · Scoring · Racks with an exact race chart and a head-start reading; a
Golden-Nine race to points; players need a Gmail, get claimed on sign-in and show their
Google photo in a ring of their colour (in `shared/people.js`, so every app has it). Then
1.4.0 and 1.4.1 added the ball drop for Golden-Nine and Trad-Nine.

**Session 4 (1.5.0) — tabs, person pages, Matches, More, Cuescore.** Four tabs (Play ·
Ratings · Matches · More) with a live strip; a person's page with Zargo, records and matches;
Matches newest first with two-tap delete; a match summary with Copy for Cuescore; More with
Invites, Export, Import, Install, About Zargo and Sign out.

---

## Session 5 — Foundation: Rack It moves home, replayable ratings, a test harness

**Goal:** the app lives at `rack-it/` in every sense (URL, manifest id, Firestore, code),
its rating engine is a pure module with tests, every Zargo can be rebuilt from the match
history, the spec describes the app as it is, and the browser stand-in used for testing is
committed instead of rebuilt each session. Nothing about scoring or the screens changes.

**Before the session (owner): done.** The 1.5.0 export is at
`~/Downloads/rack-it-2026-09-16.json` on the owner's laptop (18 matches, 9 people, the
ratings). It holds email addresses, so it never goes in the repo. It is the migration. The old
data also stays untouched at `sidequests/fair-nine/` in Firestore, and 1.5.0 stays in git, so
nothing is lost if the import goes wrong.

- [x] **The move.** `git mv fair-nine rack-it`, then the runbook below: `APP_ID`, manifest
      `id`, `CACHE`, the `localStorage` key, the landing page, CLAUDE.md, the skills' examples,
      and every path in the docs.
- [x] **`matches/`, not `sessions/`.** New matches are written to `matches/<id>`. Import
      writes there too, keeping document ids. Code names may follow (`startMatch`,
      `finishMatch`) where the rename is mechanical; don't chase every variable.
- [x] **Export/Import is the migration.** Export writes `app: "rack-it"`. Import accepts
      `app` of `"fair-nine"` or `"rack-it"`, and Replace mode is what the owner uses once.
      Test it against a synthetic export in the harness, then the owner imports the real
      file on the phone.
- [x] **The stub.** `fair-nine/` keeps only `index.html` and `sw.js`. The page says Rack It
      has moved, links to `../rack-it/`, and tells the reader to remove the old icon and tap
      Install on the new page. The worker deletes every cache, unregisters itself and
      reloads its clients. No manifest, no icons. `/deletequest fair-nine` a month later.
- [x] **`rack-it/zargo.js`.** A pure ES module, no DOM, no `cloud`: `expectedShareA`,
      `rackResults(game, points, cfg)`, `weightOf`, `zargoOutcome(before, results, cfg)`
      taking `{ za, zb, sessionsA, sessionsB, robustnessA, robustnessB }` instead of reading
      `live` and `P()`, `raceWin`, `raceChart`, and `replay(matches, starters, cfg)`.
      `index.html` imports it. CLAUDE.md rule 1 gains the exception (runbook).
- [x] **`rack-it/zargo.test.mjs`**, run with `node --test` (see Handover: not `rack-it/`).
      Fixtures are synthetic: no export of real data goes in the repo. Cover the hand-worked
      numbers already in this doc (Trad-Nine 5–2: 597.3 → 598.3 and 508 → 505.4; an
      11-Point-Nine match at −0.364), an 11-Point-Nine match with dead balls, calibration,
      and a replay of a six-match fixture whose end state is computed by hand.
- [x] **Starter ratings get their own document.** `starters/<personId>: { zargo, setAt,
      setBy }`. Add player's starter and the person page's override write it, and still
      write `state/main` so the number shows at once. A replay starts everyone from their
      starter, else `config.startZargo`.
- [x] **Rebuild ratings.** `replay()` orders `done` matches by `endedAt`, runs
      `zargoOutcome` per match with the running sessions and robustness, and returns the
      players' end state plus each match's before/after. More → **Rebuild ratings** shows
      the diff per player first ("Kenny 505 → 507"), then Apply writes `state/main.players`
      and each match's `zargoBefore`/`zargoAfter`. Deleting a match rebuilds afterwards, so
      a deleted match no longer leaves its movement behind (update SPEC §5.5's sentence).
      ⚠ The first rebuild will move numbers a little: Session 1 found one stored match that
      no history reproduces. The owner reads the diff and accepts it.
- [x] **`shared/cloud-memory.js`.** The in-memory stand-in Sessions 2 to 4 each rebuilt,
      committed: the same surface as `cloud.js` including `shared` and the members calls,
      watchers that fire on every write, a fake signed-in user, and optional seeding from a
      JSON export. `cloud.init` switches to it when the URL has `?mock`, so no app code
      changes and any app can be tried with fake data. Say in `CLAUDE.md` that `?mock` is
      how sessions test.
- [x] **Spec consolidation.** Rewrite `SPEC.md` as Rack It as it is: concepts, the three
      games, Zargo (pointing at ZARGO.md), setup, the live screen, the four tabs, people and
      claiming, data, Cuescore, fitting the phone, out of scope, and a short decisions log.
      Drop v2's screens, modes, build order and "changes from v1". Every "as built" fact
      that still holds moves into its section as plain present tense. Under 400 lines.
      Sessions 1 to 4 in this doc collapse to one "What shipped" paragraph each; their
      handovers keep only what is still true and not in the spec.
- [x] Version `2.0.0` in `index.html` and `sw.js`. `/deployquest`. Handover.
- [ ] **Owner:** import the JSON, reinstall from the new URL, play one real match of each
      game against Firestore, and rebuild ratings once. Tick this here. Four sessions have
      shipped without this step; it's the one that matters. The steps, in order, are in the
      Session 5 handover.

**Done when:** the phone shows Rack It at `/sidequests/rack-it/`, the old icon leads to the
stub, `node --test` passes, Rebuild ratings reproduces the live numbers to within the noted
drift, and SPEC.md reads as one document.

---

## Session 6 — The design, and an owner

**Goal:** the claude.ai/design redesign is the app, on every screen including the live
screen, and the things that must not be casually undone (matches, starter ratings, members)
need the owner.

**Read:** `rack-it/design/DESIGN.md` first (its note at the top says where the plan overrides
it, and §7 Legibility overrides the rest), then the PNGs beside it, the consolidated SPEC, `shared/phone.js`. DESIGN.md §6 gives
the commit order; follow it.

- [x] **Owner decision, before starting:** 13px all-caps labels (DESIGN.md) or the 15px
      floor (CLAUDE.md rule 7). **Decided: 14px tracked all-caps labels**, as the design's
      legibility pass proposes; everything else 15px or more. Recorded in rule 7 and in
      DESIGN.md's note.
- [ ] **Tokens first.** Colours, type scale, spacing and radii from DESIGN.md replace the
      `:root` block. Every component follows: buttons, chips, rows, panels, tab bar, avatar
      ring, lead bar, balls. Check the house minimums survive: 18px base, nothing under
      15px, 56px targets, contrast, `prefers-reduced-motion`.
- [ ] **Screens** in the order a player meets them: sign-in, Ratings, setup, live, rack
      end, summary, person page, Matches, More, Invites. One commit per screen where that
      is natural.
- [ ] **The live screen may change its interaction.** This retires "extend, never rebuild"
      (ground rules). What must survive, whatever it looks like: tap awards a ball to the
      shooter, dead balls, long-press to clear, match-wide undo, the shooter tint, the
      foul and three win buttons, the ball drop, a per-rack `cloud.patch`, Resume, Watch,
      never scrolling (SPEC "Fitting the phone"), wake lock and fullscreen from
      `shared/phone.js`. Test each in the harness at 390×844, then on the phone.
- [ ] **Owner role.** `members/<email>.role: "owner"`, set once in the Firebase console for
      the owner's address. `firestore.rules` gains `isOwner()`. Owner only: delete a match,
      update a match whose `status` is already `done` (which makes Rebuild owner-only),
      write `starters/*`, delete a member. Any member still adds a member and writes live
      matches. ⚠ People documents stay writable by any member; protecting `uid` and `email`
      by rule is possible but fiddly, so it's a later step. Push deploys the rules.
- [ ] Every app's Invites list hides Remove from non-owners. Rack It hides Delete, the
      starter override and Rebuild from them, with one line saying why.
- [ ] Version `2.1.0`. `/deployquest`. Handover. Owner plays one real match on the phone.

**Done when:** the phone looks like the artboards, a new club member can score a match but
can't delete one, and the owner can.

---

## Rename runbook (Session 5, done)

Chrome can't move an installed app to a new manifest URL, so everyone reinstalls once.
Three phones today; do it before the club installs.

| What | From | To |
|---|---|---|
| Folder and URL | `fair-nine/` | `rack-it/` |
| `APP_ID`, `cloud.init` | `"fair-nine"` | `"rack-it"` |
| Firestore | `sidequests/fair-nine/{state,sessions}` | `sidequests/rack-it/{state,matches,starters}` |
| Manifest `id` | `/sidequests/fair-nine/` | `/sidequests/rack-it/` |
| `CACHE` | `fair-nine-v1.5.0` | `rack-it-v2.0.0` |
| `localStorage` | `fair-nine.game` | `rack-it.game` |
| Export `app` | `fair-nine` | `rack-it` (Import accepts both) |
| Landing page | `./fair-nine/` | `./rack-it/` |
| CLAUDE.md | "Rack It (the `fair-nine` app)" | `rack-it`; rule 1 gains the module exception; `?mock` noted |
| Skills | examples naming `fair-nine` | `rack-it` |
| These docs | every `fair-nine/` path | `rack-it/` |

Unchanged: the people list at `_shared/people/`, person ids, the stored `game` values
(`"league"`, `"golden"`, `"standard"`), the icon.

---

## Design handoff

**Landed 2026-09-16** in `rack-it/design/` (moved from `fair-nine/design/` in Session 5):
`DESIGN.md`, an implementation spec with tokens, live-screen redlines and a commit order, and
390×844 artboards at 2x. A second export the same afternoon added §7 Legibility (higher-contrast
greys, 14px smallest type, bigger targets) and `02-legibility.png`, and renumbered the
artboards `01`, `02`, `04`–`08`. The redesign lives in a regular claude.ai/design project, not a
design-system project, so Claude Code's sync tool can't read it; further exports go the same
way, by hand into that folder. The folder is reference only: `sw.js` doesn't cache it and the
app never links to it.

Opus translates the artboards into the one-file app; it does not copy their markup. Pixel
agreement matters less than every token and every component reading the same everywhere.

---

## Parked (not in any session)

- Shot clock for Golden-Nine (45 s + one 30 s extension per rack).
- WPA 8-ball and Heyball: same shape as Trad-Nine, add a game entry and a win-kind list.
- Club grouping of people.
- Protecting `uid` and `email` on people documents by rule (Session 6 ⚠).
- A shared `shared/theme.css` if the other two apps ever take Rack It's design.
- Cuescore rating as a starter hint via `api.cuescore.com` (⚠ CORS from a static page is
  untested).
- Fitting the 11-Point-Nine point-share-to-rack-odds mapping (ZARGO.md challenge 1).
- Golden-Nine match time limit. DUYA pairs every rack count with a time limit (e.g. 35 racks
  or 210 minutes, whichever comes first; a tie at time plays one more rack). Would need a
  match clock on the live screen and a time field in setup.
- End a fixed-rack Golden-Nine match early once the trailing player can't catch up, as
  reported from DUYA broadcasts. Simple with handicap off (points behind > 10 × racks left,
  plus fouls); with the scoring handicap it has to be worked out on quotas.
- Avatars in Around the Clock and Bloc 11 (their lists keep colour dots).
- The lead bar in a plain race still shows the lead ("+16 points") after a target is met,
  where the scoring bar says "target met".
- The 11-Point-Nine live controls wrap "Next rack" onto two lines at 390px wide.
- The live strip and Matches redraw on every scoring write from another phone. Fine at
  household size; throttle it if a club watches.
- Match rows are centred text.
- The Golden-Nine points-race split (point share ≈ rack-win share) and Copy for Cuescore's
  line against the real challenge form both still need checking with real matches.
- `shared/firestore.rules` still says "Fair Nine → Family" in a comment. Left alone so a
  comment doesn't trigger a rules deploy; Session 6 edits that file anyway.

## Handover

Each session appends a short note here: what shipped (version), what was skipped and why,
anything the next session must know. Sessions 1 to 4 keep only what is still true and not in
the spec.

### Sessions 1 to 4, still true

- **Stored ratings don't all reproduce.** Session 1 replayed the 8 stored matches of the time:
  7 were reproduced exactly by some history, the 12 Sep one by none. Expect the first Rebuild
  to move numbers a little (Session 5 ⚠).
- **Cuescore link is opt-in per app:** `people.edit(id, { cuescore: true })`. Rack It passes
  it for everyone and `people.js` makes it editable only on your own entry; the other apps
  don't pass it.
- **Code names still say session** in places (`db.players[id].sessions` is matches played,
  `SETTLE` counts them). `live.rack` is `{ winner, kind, fouls, balls, pottedAt }` for
  Golden-Nine and Trad-Nine, `live.balls` for 11-Point-Nine; `live.banked` is `newBanked()`.
  `plannedMatch()` is the single source of what Start plays; `matchResult(t, r)` decides every
  winner; `scoreLine(match, nA, nB, totals)` writes a result line.
- `bankRack()` writes the rack before moving it into `banked`, so a watcher never sees it
  counted twice.

### After Session 5

**Shipped 2.0.0.** Everything on the list is done except the owner's step. SPEC.md is
rewritten as one document (399 lines).

- **Owner, in this order, before anyone plays at the new address** (Replace wipes anything
  scored there first):
  1. On the phone, open `https://<owner>.github.io/sidequests/rack-it/` and sign in. Ratings
     shows everyone at 500 until the import.
  2. More → Import → `rack-it-2026-09-16.json` → **Replace everything**.
  3. More → **Rebuild ratings**. Read the diff; Apply it if the drift looks small.
  4. Remove the old Rack It icon. Opening it now shows the "moved" page. On the new page,
     More → **Install on this phone**. The other two phones do the same.
  5. Play one real match of each game, then tick the Owner box above.
  6. From 2026-10-16: `/deletequest fair-nine`.
- **Testing.** All against the harness, never Firestore:
  - `node --test`: 15 tests. They include the plan's hand-worked numbers, dead balls,
    calibration and its cap, settling, the ±40 clamp, counted racks, the race chart, and the
    six-match replay.
  - The 1.5.0 functions and `zargo.js` gave identical results on 20,000 random matches
    (every game, all three regimes; largest difference 0).
  - In headless Chromium at 390×844 against `?mock`, starting from a synthetic 1.5.0 export
    (Import with Replace, a match stored under a merged id, a discarded match):
    - Rebuild's diff, Apply, and a second rebuild with nothing to change.
    - An 11-Point-Nine fixed rack, a Trad-Nine race with a reload and Resume, and a
      Golden-Nine rack with a foul and the ball drop. Each moved Zargo exactly as `zargo.js`
      predicts.
    - Watch from a second tab, and deleting a saved match (state equals a replay without it).
    - Export then Merge adds nothing. Add player writes a starter; the override writes one.
  - The stub: an old 1.5.0 install with its worker and cache, then the stub deployed over
    it. The update check swapped workers, deleted `fair-nine-v1.5.0`, unregistered and
    reloaded onto the moved page.
  - Around the Clock and Bloc 11 load under `?mock` with no errors.
  - ⚠ Not yet run on the phone against Firestore.
- **Choices I made where the plan was open.**
  - `node --test rack-it/` runs nothing on Node 26: a folder argument is read as a file. Use
    `node --test` from the repo root, or name the test file.
  - A player with no starter document starts from their first saved match's `zargoBefore`,
    or, never having played, their current rating. Otherwise every starter estimate made
    before 2.0.0 would reset to 500. Apply writes those as starters with `setBy: "rebuild"`,
    and the diff card lists them.
  - Deleting a saved match rebuilds and applies at once, with no diff card. Deleting a live
    or discarded match doesn't rebuild.
  - The stub worker deletes only `fair-nine-*` caches, not every cache: the other apps share
    the origin. The stub page also unregisters the worker and clears those caches itself.
  - Export writes `matches` and `starters`; Import reads `matches` or `sessions`.
  - Counted racks now also drop an empty last 11-Point-Nine rack (End after "Start rack N").
    Before, the summary listed it as a 0–0 rack, and a replay would have counted it.
  - `zargo.js` also holds the rack scoring that `replay` needs to read a stored match:
    `rackOf`, `gameRackPoints`, `leagueRackPoints`, `bankInto`, `countedRacks`,
    `matchPoints`. `index.html` wraps them with its config.
  - Replay skips a match whose two ids now resolve to one person, and a saved match with no
    counted racks.
  - The stand-in keeps its data in `localStorage`, not memory, so a reload can resume and a
    second tab can watch. `?mock=reset` wipes it; `&seed=<url>` loads an export when empty.
  - The override's confirm now says it sets the starter rating and that Rebuild replays from it.
- **Code shape for Session 6.** `import * as Z from "./zargo.js"`; `index.html` keeps thin
  wrappers (`rackResults`, `zargoOutcome(results)`, `countedRacks`, `leagueRackPoints`, …) so
  the live code reads as before. `startMatch`, `endMatch`, `finishMatch` and `resumeMatch`
  replaced the `…Session` names. `planRebuild()` and `applyRebuild(plan)` are the owner-only
  pieces for Session 6; `saveStarter(id, zargo)` is the only starter write.

Parked: the `firestore.rules` comment (above).
