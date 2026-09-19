# Rack It v3 — working doc for the build sessions

Fair Nine became **Rack It**: three cue games, one Zargo rating, a phone-first layout that
holds a club. This doc is the handover between consecutive Claude Code sessions. Each
session ends with the app **deployed and working**, then ticks its boxes and writes its
handover note below, so the next session starts from the truth.

**Start every session with:** "Read `rack-it/V3-PLAN.md` and do Session N."
Sessions 1 to 7 have shipped. There is no Session 8 yet: the next one starts from a fresh goal,
and the ideas waiting for it are under "Parked".

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
- **Version:** Session 5 landed `2.0.0` (the move to `rack-it/`), Session 6 landed `2.1.0`,
  Session 7 landed `2.2.0`, then `2.2.1` for the lilac side.
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
- [x] **Tokens first.** Colours, type scale, spacing and radii from DESIGN.md replace the
      `:root` block. Every component follows: buttons, chips, rows, panels, tab bar, avatar
      ring, lead bar, balls. Check the house minimums survive: 18px base, nothing under
      15px, 56px targets, contrast, `prefers-reduced-motion`.
- [x] **Screens** in the order a player meets them: sign-in, Ratings, setup, live, rack
      end, summary, person page, Matches, More, Invites. One commit per screen where that
      is natural.
- [x] **The live screen may change its interaction.** This retires "extend, never rebuild"
      (ground rules). What must survive, whatever it looks like: tap awards a ball to the
      shooter, dead balls, long-press to clear, match-wide undo, the shooter tint, the
      foul and three win buttons, the ball drop, a per-rack `cloud.patch`, Resume, Watch,
      never scrolling (SPEC "Fitting the phone"), wake lock and fullscreen from
      `shared/phone.js`. Test each in the harness at 390×844, then on the phone.
- [x] **Owner role.** `members/<email>.role: "owner"`, set once in the Firebase console for
      the owner's address. `firestore.rules` gains `isOwner()`. Owner only: delete a match,
      update a match whose `status` is already `done` (which makes Rebuild owner-only),
      write `starters/*`, delete a member. Any member still adds a member and writes live
      matches. ⚠ People documents stay writable by any member; protecting `uid` and `email`
      by rule is possible but fiddly, so it's a later step. Push deploys the rules.
- [x] Every app's Invites list hides Remove from non-owners. Rack It hides Delete, the
      starter override and Rebuild from them, with one line saying why.
- [x] Version `2.1.0`. `/deployquest`. Handover.
- [ ] **Owner:** set your `role: "owner"` in the Firebase console (Handover, step 1), then play
      one real match on the phone.

**Done when:** the phone looks like the artboards, a new club member can score a match but
can't delete one, and the owner can.

---

## Session 7 — 8-ball: Trad-Eight and Ten-Point-Eight

**Goal:** two 8-ball games beside the three nine-ball games, scored the two ways organised
8-ball is scored — one rack is one rack, and a rack worth points that also score the loser's
balls — with the same levers (Off · Scoring · Racks), the same live-screen shape as Trad-Nine
and Golden-Nine, and one Zargo across all five games, the way FargoRate pools 8-ball and 9-ball
into one number. 11-Point-Nine doesn't change. Lands `2.2.0`.

**Status:** shipped in 2.2.0 on 2026-09-19. The design below is what was built; where the build
differs, the Session 7 handover says so.

### 7.1 Research: how 8-ball is scored

Two families, and every league is one or the other.

**One rack, one win.** WPA, CSI/BCAPL, APA, TAP, every Fargo-rated league, Heyball and UK
blackball. The rack: clear your group, then the 8 in a called pocket. You lose the rack on the
8 four ways (WPA §3.8): a foul while pocketing it, pocketing it early, the wrong pocket, or
driving it off the table. Fouls give ball in hand and score nothing.
- **8 on the break** is the one rule that splits the world. WPA and CSI/BCAPL: not a win, the
  breaker spots the 8 or re-breaks (a scratch with it hands that choice to the opponent). APA,
  TAP, VNEA "option 1" and most bar and pub play: a win, and a scratch while making it is a
  loss. VNEA's own championships play option 2 (spot or re-rack).
- **Break:** WPA's standard is alternate; CSI singles alternate; APA and TAP play winner breaks.
- **Length:** race to 3, 5 or 7 in leagues; the 2025 WPA women's worlds raced to 7, 8 and 9.
- **Handicap:** APA's games-must-win chart (skill levels 2–7; a 4 against a 6 races 3 to 5).
  FargoRate's FairMatch sets the race from the rating gap alone, Hot/Medium/Mild: a 100-point
  gap turns a race to 7 into 7 against 4, which is what our race chart already computes.
- Heyball and blackball score frames only; Cuescore records any 8-ball match as frames too
  (discipline, race to N, a frame score), never points.

**Points per rack.** VNEA (Valley), the systems CSI documents for its leagues, and USAPL, CSI's
Fargo-powered league. Every one of them takes the same single input beyond the winner: how
many of the loser's balls were off the table, 0 to 7. Fouls score nothing in any of them.

| System | Winner | Loser | Rack total |
|---|---|---|---|
| **VNEA / CSI 10-point** | 10, always: a break-and-run is 10, an 8 on the break is 10 | 1 a ball of their group down, max 7 | 10 to 17 |
| CSI 17-point ("ball count") | 10 plus 1 for each of the loser's balls still up | 1 a ball, max 7 | always 17 |
| USAPL 14-point | 14 (7 balls, 7 for the 8) | 1 a ball, max 7 | 14 to 21 |

VNEA rates players by average points a game (13 handicap levels) and spots the difference of
team averages; CSI's leagues handicap the point systems from Fargo ratings; Fargo itself takes
only the rack winner from any of them (§7.2). TAP records balls made on the break for stats
and races in racks.

Sources: [WPA rules](https://wpapool.com/wp-content/uploads/2025/09/2025.09.15-WPA-Rules.pdf)
§3; [CSI/BCAPL 8-ball differences](https://blueridgebcapl.com/8-Ball-BCApl-Differences/);
[APA games-must-win](https://rules.poolplayers.com/the-equalizer-handicap-system/games-must-win-charts/);
[VNEA rules](https://www.vnea.com/rules); CSI on the
[1-point](https://www.playcsipool.com/csinews/how-fargorate-improves-the-1-point-scoring-system-for-pool-leagues),
[10-point](https://www.playcsipool.com/csinews/how-fargorate-improves-the-10-point-scoring-system)
and [17-point](https://www.playcsipool.com/csinews/how-fargorate-improves-the-17-point-system)
systems; [Fargo races](https://playingpool.substack.com/p/fargo-races);
[Heyball rules](https://wpapool.com/wp-content/uploads/2025/08/250816-Rules-of-Heyball.pdf).
⚠ The session's proxy blocked the source sites, so these come from search extracts of those
pages, not full reads; VNEA's scoring of a loss on the 8 (loser keeps their balls) is inferred
from "the winner always gets 10", not seen stated.

### 7.2 Research: how Fargo rates across 8-ball and 9-ball

- **One rating, every game.** 8-ball, 9-ball, 10-ball and one pocket on 7- to 10-foot tables
  all feed one number; there is no per-game rating and no per-game race chart.
- **One game is one rack won or lost.** Ball counts, points, margins, race lengths and match
  scores never enter. A USAPL 14-point league sends Fargo its rack winners and keeps the points
  for its own handicap.
- **Does mixing games blur the number?** Mike Page tested it on Corey Deuel: an 8-ball-only fit
  and a 9-ball-only fit each land within a couple of points of his pooled rating, and across
  players "actual differences, when they exist at all, are smaller than many people expect".
  A player's record naturally reflects the game they play most, which the system takes as
  their true skill.
- **Method.** Not Elo increments: every day Fargo re-solves everyone's rating jointly as the
  maximum-likelihood fit to all games ever, older games weighted less, so a rating can move
  without you playing. Under robustness 200 the shown rating blends a starter prior linearly
  (at 40 games, 80% starter). Robustness is games counted; 200 is "established".
- **Break format.** Fargo's look at 10,000 matches: winner-breaks against alternate "makes a
  small difference in the statistics of match scores but probably not enough to worry about";
  alternate-break events give tighter ratings, and winner-breaks packages break the
  independence its race odds assume.

Sources: [FargoRate FAQ](https://fargorate.com/); [Mixing games: Corey Deuel and
8-ball](https://www.fargorate.com/fargorateblog/archive/mixing-games-in-fargorate-a-look-at-corey-deuel-and-8-ball/);
[Behind the curtain](https://www.fargorate.com/fargorateblog/archive/behindthecurtain/);
[Starter ratings explained](https://www.playcsipool.com/fargorate-starter-ratings-explained.html);
[Match odds, do they work](https://www.fargorate.com/fargorateblog/archive/fargorate-match-odds-do-they-work/);
[FairMatch](https://fairmatch.fargorate.com/). ⚠ Same caveat: read as search extracts.

**What Zargo takes from it.** The two 8-ball games are Trad-Nine to the rating: a rack is a
rack, `r` is 1 or 0 by winner, `w` is 0.5, and nothing about points, balls, fouls or the kind of
win enters. The race chart is already Fargo's chart, so it covers 8-ball unchanged. Alternate
break is the default. What Zargo does *not* take: the daily re-fit and the linear starter
blend. Our calibration and settling regimes do that job at household size and every stored
rating stays put; ZARGO.md's table already had this row waiting.

### 7.3 The design

**Five games, one picker.** The segmented control becomes two rows, a discipline each:
**Trad-Nine · Golden-Nine · 11-Point** over **Trad-Eight · Ten-Point-Eight**. Same 56px rows,
60px more setup height, Start still pinned. Stored `"eight"` and `"tenpoint"`; the per-phone
memory of the last game just works. Cuescore disciplines "8-Ball" and "8-Ball (10-point)".
(If the owner picks the 17- or 14-point system in §7.4, the name follows: "17-Point-Eight".)

| | Trad-Eight | Ten-Point-Eight |
|---|---|---|
| A rack records | winner, win kind, fouls, the ball drop (14 balls), groups, breaker | the same |
| Scoring | one rack is one rack | 10 to the winner; the loser 1 a ball of their group that's down, 0–7 |
| A rack ends | a win tap (Break & run, Win), or a hold on Foul (lost it on the 8) | the same |
| Length | race to 3, 5 (default), 7 or N | 5 fixed racks (default), race to N points (chip 50), or N racks |
| Break | alternate | alternate |
| Handicap levers | Off (default), Racks | Off, Scoring (default), Racks |

**The rack, both games.** The win column has two buttons: **Break & run** (`run`) and **Win**
(`win`). The 8 on the break is WPA's spot-and-play-on (§7.4): the rack goes on, a scratch
with it is a foul like any other, and there is no "8 on the break" button. Config
`eightOnBreak: "spot"`; `"win"` brings back a third button, **8 on the break** (`eight`), and
makes a scratch while making it a `foul8`, for a house that plays it that way.
Losing on the 8 (early, on a foul, wrong pocket, scratched, off the table) is a **hold on
Foul** on the player who did it, confirmed, exactly as Golden-Nine's intentional foul: kind
`foul8`, winner the other player. Fouls are counted per player per rack and never score; ball
in hand happens on the table. The Foul button passes the shot as it does today.

**The ball drop is 14 balls: solids 1–7 over stripes 9–15.** The 8 has no slot, because the
win buttons *are* the 8. Tap a ball and it's potted by the shooter; tap the slot to put it
back; a new rack starts full; Undo covers it. Each row carries a label, **Solids** and
**Stripes**, with the owner's initial once known: the app guesses from the pots (a player who
has only potted from one group owns it; the other player gets the rest) and a tap on the label
sets it by hand and locks it. Stored per rack as `groups: { a: "solids" | "stripes" | null }`.
In Trad-Eight the drop stays what it is today, a log for replays. In Ten-Point-Eight it is the
score: the loser's points are their group's balls down when the rack ends, so a scorer who
taps balls as they drop gets the score for nothing, and one who doesn't taps the count in on
the card. ⚠ Fourteen cells in two rows come out at 55px on a 390 phone and 51 on a 360; that's
under the 56 rule. Proposed: treat them like the live screen's balls (52 floor) and let a 360
phone have 51; the alternative is three rows of five with the 8 drawn dead in the middle,
which costs 60px the win buttons don't have on a short phone.

**Rack end, Ten-Point-Eight.** The card reads "Kenny 10 · Melanie 4 (4 stripes down)" with
**Start rack N** and **Undo that**. If the loser's group is still unknown (nobody tapped a
ball), two chips ask first: "Melanie had: Solids · Stripes", then a 0–7 stepper for her balls
down, default 0. End's rules follow Golden-Nine and Trad-Nine: a rack without a winner is
dropped, and End says so. After the last fixed rack a tie in points offers **Play a deciding
rack** or **Call it a tie**, as Golden-Nine does.

**Points config.** `games.tenpoint.points: { winner: 10, ball: 1, left: 0 }`. Winner gets
`winner + left × (7 − L)`, loser gets `ball × L`, `L` the loser's balls down. `left: 1` is
CSI's 17-point system; `winner: 14` is USAPL's; one edit, no migration, like Golden-Nine's.
The owner chose 10-point (§7.4), so the defaults above are the game.

**Handicap.** Trad-Eight is Trad-Nine: Off plays level, Racks gives the race chart. For
Ten-Point-Eight's Scoring lever a quota can't be a share of the points, as Golden-Nine's is,
because the loser has a floor: they keep their balls. Expected points a rack are linear in
`pA` instead:

```
eA = 10 × pA + L̄ × (1 − pA)        eB = 10 × (1 − pA) + L̄ × pA        L̄ = mean loser's balls
```

`L̄` lives in config as `meanLoserBalls: 3.5` ⚠ a guess until 50 racks are stored, then
measured (the racks hold every count). Fixed racks: quotas `round(racks × eA)` and
`round(racks × eB)`, shown as "31 of 42" under the scores from rack one, the lead bar the gap
in progress to quota, and the winner whoever finishes further past their own quota (a spot,
not Golden-Nine's ratio; the ratio is wrong once the loser scores). Race to N points: the
favourite races to N, the other to `round(N × eUnderdog / eFavourite)`, editable: at a
160-point gap (`pA` 0.75, 8.4 points a rack to 5.1) a race to 50 is 50 against 30, "needs
12 of 30", and 5 fixed racks give quotas of 42 and 25. Off: fixed racks, more points wins;
a race, both to N. Racks: a race in racks, as anywhere. The odds sentence says "Kenny
expects 8 points a rack to Melanie's 5".

**Zargo.** Both games take the non-league path of `rackResults`: `r` 1 or 0 by winner,
`w = 0.5` from `config.games.<game>.w`, robustness up by half a rack each. `gameRackPoints`
gains an `eight`/`tenpoint` branch (Trad-Eight: 1 to the winner; Ten-Point-Eight: the points
above), `countedRacks` counts racks with a winner, `replay` needs nothing new. The race chart
and the calibration, settling and known regimes are untouched. Two alternatives, considered
and not taken:
- *Point share as `r`*, 11-Point-Nine's way. Rejected: the winner always has 10, so the share
  would only grade how badly the loser lost, and ZARGO.md challenge 1 already shows share
  understates gaps. Fargo ignores margin for the same reason. The counts are stored, so once
  a hundred racks exist we can test whether the loser's balls predict anything (⚠ a challenge
  11 for ZARGO.md).
- *A heavier `w` for 8-ball* because a rack is longer and less lucky than a 9-ball rack.
  Fargo weights every game the same and finds the fits agree, so 0.5 it is; it's config.

**Everything else** follows the games that exist. Matches rows and the summary show points
for Ten-Point-Eight as they do for Golden-Nine; a person's page lists both games in the win
record; Copy for Cuescore writes racks ("Kenny 5–3 Melanie · 8-Ball · race to 5 · …") and adds
the points for Ten-Point-Eight; Resume and Watch read the new rack shape; Export and Import
carry the new `game` values with nothing to convert; no new collection, so `firestore.rules`
doesn't change.

### 7.4 Owner decisions (answered 2026-09-19)

| Question | Decision |
|---|---|
| Which points system | **10-point** (VNEA, CSI): winner always 10, loser 1 a ball. Not 17-point or USAPL's 14. |
| 8 on the break | **Spot it and play on** (WPA, CSI). No win button; a scratch with it is just a foul. `eightOnBreak: "spot"`. |
| What rates | **The rack winner only**, `w = 0.5`, Fargo's way. Point share rejected. The loser's balls are stored for a later look. |
| Break | **Alternate** in both games. A winner-breaks option is parked. |
| Names | **Trad-Eight · Ten-Point-Eight**, a second row of the picker. Stored `"eight"` and `"tenpoint"`. |
| The 14-ball drop | **Two rows of seven**, solids over stripes; cells treated like the live balls (52px floor, 51 on a 360 phone). |
| Where the plan lives | On `main`, per CLAUDE.md; the session branch was fast-forwarded into it. |

Still assumed, not asked (pick the simplest reading, say so in Handover): Ten-Point-Eight's
default length is 5 fixed racks like Golden-Nine, its points-race chip is 50, and
`meanLoserBalls` starts at 3.5.

### 7.5 The list

- [x] `zargo.js`: `DEFAULT_GAMES` gains `eight: { w: 0.5, eightOnBreak: "spot" }` and
      `tenpoint: { points: { winner: 10, ball: 1, left: 0 }, meanLoserBalls: 3.5, w: 0.5 }`;
      `withGames` merges them; `rackOf` reads balls 1–15 and `groups`; `loserBalls(rack)`;
      `gameRackPoints` for both; `expectedEightPoints(pA, cfg)` for the quotas.
- [x] `zargo.test.mjs`: rack points for each of the three systems by config; a Ten-Point-Eight
      match moves Zargo exactly as a Trad-Nine match with the same winners; a `foul8` rack; a
      replay with an 8-ball match in it; the quota numbers worked by hand.
- [x] Setup: the two-row picker; per-game defaults (`applyGameDefaults`, `applyLengthDefaults`,
      `hcpAllowed`); the odds sentence in expected points; quotas and targets from `eA`/`eB`;
      the points-race chip.
- [x] Live: `WIN_KINDS` and `KIND_LABEL` for both; hold on Foul for `foul8`; the 14-ball drop
      with group labels; `paintWinArea` shows "8 on the break" only under `eightOnBreak: "win"`; the rack-end card
      for Ten-Point-Eight with the group chips and stepper; the deciding rack; sub-lines "31 of
      42"; End's dropped-rack message.
- [x] Resume and Watch rebuild the new rack shape; `sync` patches `groups`.
- [x] Matches, summary, person records, `DISCIPLINE` and `cuescoreLine`, `scoreLine`.
- [x] SPEC.md: §2 gains two columns and a §2.4 for the 8-ball rules the app assumes, §4 the
      linear quota, §6 the 14-ball drop and the hold, §9 the rack shape and config, §10, §12
      loses 8-ball, §13 a 2.2.0 line. ZARGO.md: the table row names the two games; challenge
      11 (the loser's balls as evidence, untested).
- [x] Harness at 390×844 and 360×640: a Trad-Eight race with a `foul8` rack and Resume; a
      Ten-Point-Eight fixed match with the scoring handicap, a rack scored from the drop and
      one from the card, a tie and the deciding rack; Watch; Copy for Cuescore; Export then
      Merge adds nothing; 11-Point-Nine untouched (`node --test` and one scored match).
- [x] Version `2.2.0`. `/deployquest`. Handover.
- [x] Side B's colour tokens go from coral to lilac (owner's call after the deploy), shipped as
      `2.2.1`: tokens and the prose that names the colour only, no behaviour.
- [x] `2.2.2`: the setup screen's folds no longer clip under Start (owner reported it).
- [ ] **Owner:** play one real match of each 8-ball game on the phone.

**Done when:** a Trad-Eight race and a Ten-Point-Eight night can be scored, resumed and
watched from any phone, both move Zargo like Trad-Nine racks, the quotas show from rack one,
and 11-Point-Nine behaves identically.

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
- Heyball: Trad-Eight's shape (no called shots, a soft break loses the rack, 8 on the break by
  tournament rule): a game entry and a win-kind list.
- Measure `meanLoserBalls` from the stored racks once 50 Ten-Point-Eight racks exist; it starts
  at a guessed 3.5 and every rack holds its count.
- Whether the loser's balls predict anything the rack winner doesn't (ZARGO.md challenge 11),
  after a hundred 8-ball racks.
- Average points a rack in Ten-Point-Eight on a person's page (below), and a per-discipline
  split of the win record (8-ball v 9-ball) rather than one row a game.
- A winner-breaks option in setup for the 8-ball games (APA's way), if alternate break
  (Session 7's default) isn't how the house plays.
- Average points a rack in Ten-Point-Eight on a person's page, VNEA's own skill measure,
  for interest only.
- Club grouping of people.
- Protecting `uid` and `email` on people documents by rule (Session 6 ⚠).
- Cuescore rating as a starter hint via `api.cuescore.com` (⚠ CORS from a static page is
  untested).
- Fitting the 11-Point-Nine point-share-to-rack-odds mapping (ZARGO.md challenge 1).
- Golden-Nine match time limit. DUYA pairs every rack count with a time limit (e.g. 35 racks
  or 210 minutes, whichever comes first; a tie at time plays one more rack). Would need a
  match clock on the live screen and a time field in setup.
- End a fixed-rack Golden-Nine match early once the trailing player can't catch up, as
  reported from DUYA broadcasts. Simple with handicap off (points behind > 10 × racks left,
  plus fouls); with the scoring handicap it has to be worked out on quotas.
- The lead bar in a plain race still shows the lead ("+16 points") after a target is met,
  where the scoring bar says "target met".
- The live strip and Matches redraw on every scoring write from another phone. Fine at
  household size; throttle it if a club watches.
- The Golden-Nine points-race split (point share ≈ rack-win share) and Copy for Cuescore's
  line against the real challenge form both still need checking with real matches.
- ⚠ **A foul can meet a Golden-Nine points target mid-rack** (found in Session 6). The panel says
  "target met" but the rack plays on, and End drops the rack with its foul points. Needs a rules
  call: does reaching the target on a foul end the match there, or only a rack win? Until then
  it behaves as before.
- 11-Point-Nine over fixed racks or open with the scoring handicap still shows raw points and no
  quota live, as Golden-Nine did before 2.1.0. Left alone: 11-Point-Nine must not change.
- The design's hold on Delete could extend to Unclaim and Remove (both two taps today).

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

Parked: the `firestore.rules` comment (above). Done in Session 6.

### After Session 6

**Shipped 2.1.0.** The redesign is the app on every screen, and an owner role guards what can't
be undone. The owner step below comes first.

- **Owner, in this order:**
  1. Firebase console → Firestore Database → `members` → your own address → **Add field**
     `role` (string) = `owner`. Until then the new rules treat you as a member: no Delete, no
     Rebuild, no Replace on import, no starter override, no Remove. Nothing is lost; the
     buttons come back on the next open.
  2. If Session 5's import (Replace) and first Rebuild haven't happened yet, do them now, after
     step 1. Replace deletes matches, which is owner-only now.
  3. Open Rack It on the phone. It updates to 2.1.0 (More shows the version). Play one real
     match, ideally Golden-Nine with the scoring handicap, and tick the Owner box above.
- **The design import.** The second claude.ai/design export (`Rack-it design evolution (1).zip`)
  replaced `design/`: §7 Legibility, `02-legibility.png`, a new `01`, and the rest renumbered
  `04`–`08`. DESIGN.md keeps the plan's note at the top, now saying §7 wins over §1–§6.
- **Golden-Nine's handicap (owner's report).** The scoring handicap was applied correctly: the
  result and the lead bar already used the adjusted lead. It just didn't show on the panels,
  as 11-Point-Nine's targets do. Now, over fixed racks, the underdog's sub-line reads
  "×3.4 = 38" and the match bar's lead is in those points. A points race already showed
  "needs N of M". No scoring or rating code changed.
- **Testing.** All in the harness, headless Chromium at 390×844, plus 360×640, 375×667 and
  412×915:
  - `node --test`: 15 pass. Ratings code is untouched; a saved 11-Point-Nine match's
    `zargoAfter` equals `zargo.js` exactly.
  - Every survival item: tap to the shooter, dead, long-press clear, Undo, turn tint and bar,
    foul and three wins, ball drop, End by hold (early release cancels), Resume after a
    reload, Watch with Stop watching, and no scrolling at any of the four sizes.
  - As owner (`?mock`) and as member (`?mock&role=member`): Delete, override, Rebuild, Replace
    and Remove show or hide, each with its line.
  - `shared/firestore.rules` against the Firestore emulator: 29 cases, all pass (member v owner
    on members, matches live and done, starters, other apps, outsiders). The emulator ran from
    the scratchpad with a downloaded JRE; nothing was added to the repo.
  - Around the Clock and Bloc 11 load under `?mock` with no errors.
  - ⚠ Not yet run on the phone, and not against real Firestore.
- **Choices I made where the plan was open.**
  - **Legibility (§7) over §1–§6** throughout: greys `--text-2 #C3CEDA`, `--dim #A8B6C4`,
    `--faint #8D9BAA`; 14px caps; controls 76; other targets 60; turn bar 5; rail 8. The
    live-screen chrome is 273px (was 335), so balls are 90px on a 390×844 phone.
  - **Starters:** any member may *create* `starters/<id>` (so Add player's estimate still
    works); only the owner updates or deletes one.
  - **Members:** `addMember` now merges, so re-inviting the owner can't wipe `role`. The rules
    let a member re-invite (touching only `addedBy` and `addedAt`) but never set `role`.
  - **Rules shape:** the generic `/sidequests/{appId}` rule no longer writes to `rack-it`;
    Rack It's three collections have their own rules. A new Rack It collection needs one.
  - **Also owner-only in the app:** Delete player (the design says so) and Import's Replace (its
    deletes would fail anyway). Unclaim, in the shared people sheet, is unchanged.
  - **Dead ball:** the number struck through by a bar, as DESIGN.md says (the new `01` draws it
    under the number). Dark balls 2, 4, 7 and 8 get the hairline ring.
  - **Sub-lines on colour** are solid player ink at 700, not 75% opacity (§7 rule 2).
  - **Unselected tabs** are `--dim`, not `--faint`, since tab labels matter for older eyes.
  - **"11-Point"** in the game picker only, so the three segments fit; every other label keeps
    "11-Point-Nine".
  - **Match rows:** the winner's name is bold as well as bright, and a tie says "tied", so the
    result isn't colour-only.
  - **Match bar** at 360px: the rack label and the lead each wrap to a second line instead of
    truncating. Only a long name with a head-start race and dead balls still clips.
  - `?mock` is an owner by default; `&role=member` switches, and it persists in the fake data.
- **Code shape.** `holdBind(node, fn, { tap, holding })` is the hold; `paintTurn`, `paintOwn`,
  `paintLead(t, ctx, nA, nB, num)`, `paintMatchBar` and `breakLabel` paint the live chrome for
  both scoring and Watch. `golden9Handicap(ctx)` decides the Golden-Nine sub-line. `owner` and
  `paintOwner()` hold the role; `loadRole()` runs after `loadState()`. `deleteMatch(s)` replaced
  the per-row delete button.

### After Session 7

**Shipped 2.2.0.** Trad-Eight and Ten-Point-Eight are the fourth and fifth games, one Zargo
across all of them, and 11-Point-Nine is untouched. Everything on the list is done except the
owner's step.

- **Owner:** open Rack It on the phone (More shows v2.2.0) and play one real match of each
  8-ball game, then tick the box above. Nothing else to do: no rules change, no migration, no
  config to set. The 8-ball games appear as a second row of the game picker.
- **What's in the data.** A new `game` of `"eight"` or `"tenpoint"`; a rack that also carries
  `groups: { a: "solids" | "stripes" | null }` and balls up to 15. `config.games` gains `eight`
  and `tenpoint`; old documents need nothing, and `withGames()` fills the new games in for any
  config saved before today. Ten-Point-Eight's points are **derived** from `balls` and `groups`
  by `zargo.js` `loserBalls`, never stored per rack, so a corrected ball drop corrects the score.
- **Choices I made where the plan was open.**
  - **The rack-end card's stepper writes into the ball drop.** Rather than store a second number
    beside the drop, the − / + stepper marks that many of the loser's own group as potted, lowest
    first, and settles `groups.a` at the same time. One record of the rack, Undo covers it, and a
    scorer who taps balls as they drop never sees a number they have to confirm.
  - **The stepper shows on every Ten-Point-Eight rack-end card**, not only when nobody tapped a
    ball, so a mis-tap can be fixed where it's noticed. It starts at whatever the drop says.
  - **A break and run never asks for the group.** The plan's card asks whenever the loser's group
    is unknown, but with no ball down at all the loser scores 0 whichever group they had, so the
    card offers **Start rack N** straight away and the chips are there only in case some of their
    balls did drop. With balls already down and the group genuinely unclear (each player has
    potted from both groups), the chips are the only way on: the group *is* the score.
  - **Tapping a drop row's label cycles teal → lilac → back to the guess.** The plan says a tap
    "sets it by hand and locks it"; a cycle is what makes it correctable, and the third state
    hands it back to the guess. The label shows the owner's initial in their colour.
  - **`eightOnBreak` lives on both games** (`eight` and `tenpoint`), not just `eight`, so a house
    that plays the 8 on the break as a win sets it per game. Default `"spot"` in both, which
    hides the third win button.
  - **Five fixed racks at a 160-point gap give quotas of 42 and 26**, not the 42 and 25 in §7.3:
    `round(5 × 5.1123)` is 26. The plan's rule (`round(racks × eB)`) is what's built, and a test
    pins the numbers.
  - **The 8-ball drop spans the full width** with no side margin, which is what makes the plan's
    55px-on-a-390-phone and 51px-on-a-360 cells come out (measured: 56×52 and 51×48). Group
    labels are 24px tall (22 on a short phone) and take a 38px target from the space around them
    — under the 56px rule, deliberately, like the drop's own cells.
  - **Ten-Point-Eight's match bar** shows the points under the Racks lever, as Golden-Nine's
    does; over fixed racks and a points race the panels carry them, so it doesn't repeat them.
  - **Handicap off over fixed racks** reads as plain points, and the lead bar's full swing is the
    winner's 10 points a rack over the racks planned.
  - `paintDrop` and the `#doneExtra` row are the only new pieces of live-screen chrome;
    `resetExtra()` runs at the top of every card so no card inherits another's extra row.
- **Testing.** All in the harness (`?mock`), headless Chromium, never against Firestore:
  - `node --test`: **21 pass** (was 15). The six new ones cover the three points systems by
    config, the group guess and `loserBalls`, a Ten-Point-Eight match rating exactly as the
    Trad-Nine match with the same winners, a `foul8` rack, the quota numbers worked by hand, and
    a replay with an 8-ball match in it.
  - A full five-rack Ten-Point-Eight match with the scoring handicap (Kenny 660 v Melanie 500,
    quotas 42 and 26): a rack scored from the drop, one scored from the card's stepper, a rack
    lost on the 8 by a hold on Foul, and a 35–29 win for **Melanie** on the quota spot. Zargo
    660 → 648 and 500 → 512, exactly what `zargo.js` predicts.
  - A Trad-Eight race to 5 with a `foul8` rack, a reload and **Resume**, and **Watch** from a
    second tab following a rack including the group labels.
  - A Ten-Point-Eight tie over two fixed racks (13–13) offering the deciding rack, and the
    deciding rack played.
  - The Racks lever on Ten-Point-Eight (race 5 v 2, points in the match bar), **Rebuild ratings**
    reproducing an 8-ball match exactly ("no change"), and a person's record listing it.
  - **Copy for Cuescore**: `Kenny 3–2 Melanie · 8-Ball (10-point) · 5 racks (points 35–29) · Sep
    19, 2026`.
  - Export carries the new `game` values, `groups` and the new config; **Merge** back adds
    nothing. **Replace** with `eightOnBreak: "win"` brings the third win button back.
  - 11-Point-Nine: one scored match, same taps, same card, same Zargo (660 → 648 on a 4–7 rack).
  - No scrolling on the live screen at 360×640, 375×667, 390×844 or 412×915.
  - Around the Clock, Bloc 11 and the Fair Nine stub all still load under `?mock`.
  - ⚠ Not yet run on the phone, and not against real Firestore.
- **Known tightness.** A 360×640 phone with `eightOnBreak: "win"` (three win buttons) runs about
  13px short; the win area clips rather than scrolls. The default two-button rack fits everywhere.
- **SPEC.md is 541 lines**, past Session 5's "under 400" target: §2 now has five columns and a
  §2.4, and §4 carries the linear quota. Worth a consolidation pass if it grows again.

**Then 2.2.1 — side B is lilac.** The owner's call on 2026-09-19, after playing with 2.2.0:
coral read as an alarm colour sitting next to amber `--warn`, which is the one colour that is
only ever meant to say *careful or incomplete*. Lilac is the cool opposite of teal — maximum
hue separation, and nothing about it can read as a warning — and it is light enough to keep
dark ink on the filled panel, so no rule in DESIGN.md §1 or §7 had to bend.

- **What changed.** Four tokens in `rack-it/index.html`'s `:root` and nothing else:
  `--b:#B49BFF`, `--b-ink:#1A0F30`, `--b-soft:#221C36`, `--ground-b:#170F28`. Every side-B use
  in the app already went through those tokens, so there were no literals to chase and no
  behaviour to change; `--ground-b` still has exactly one user, `body.scoring[data-turn="b"]`.
  The prose that named the colour followed: the `<style>` comment, `shared/theme.css`'s header,
  SPEC.md, DESIGN.md (a header delta — §1's token block and the PNGs still show the coral) and
  the "Lilac side" heading and `"Lilac"` target fallback on screen.
- **Contrast, measured.** Every pair went up and every one now clears the 7:1 floor DESIGN.md
  §7 sets for anything read while playing — coral was under it on three of them:

  | Pair | Lilac | Was |
  |---|---|---|
  | Filled side-B panel, `--b-ink` on `--b` | 7.86:1 | 6.52:1 |
  | `.foldv .nb` / `.lead.b` / `.wincap`, `--b` on `--ink-0` | 8.41:1 | 6.93:1 |
  | The same over `--ground-b` while B shoots | 7.99:1 | 6.50:1 |
  | `.win` outline, `--b` on `--b-soft` | 7.05:1 | 6.24:1 |

- **Harness at 390×844**, `?mock`: the live screen with B shooting (filled panel, ground tint,
  win outlines, "MELANIE WINS IT"), a Ten-Point-Eight rack-end card, the setup picker's
  **LILAC SIDE** column, the Matches rows (neutral, as they should be), and the 8-ball drop's
  group labels — the owner's in lilac, the other in teal. `node --test`: 21 pass, unchanged —
  nothing rating-related moved.
**Then 2.2.2 — setup scrolls.** The owner hit it straight away: open **Length** on a new match
and the options land under the pinned Start, out of reach. It was not a z-index or a padding
problem. `.setupbody` is a scrolling flex column, and its children were free to shrink, so the
`.settings` card was squeezed to 161px when it wanted 341 — and because the card carries
`overflow:hidden` for its own rounded corners, the other 180px was clipped rather than
overflowed. The column's `scrollHeight` therefore never exceeded its `clientHeight`: there was
nothing to scroll to, on any phone. A 360×640 lost 387px that way.

- **The fix is two lines.** `.setupbody>*,.homebody>*{flex-shrink:0}` lets the content overflow
  so the column genuinely scrolls, and `revealFold()` scrolls a newly opened fold into view with
  `block:"nearest"` (honouring `prefers-reduced-motion`) so the options are on screen without
  hunting for them. Start stays pinned and reachable; nothing else moved.
- **It was latent on four more screens.** `.homebody` has the same shape, so More, the person
  page and a match summary were all being squeezed instead of scrolling. Measured after the fix,
  every scroll container reaches its last child: setup 180–461px of scroll depending on the fold
  and the phone, More 15, the person page 172, a summary 228, Matches 382.
- **Checked at 390×844 and 360×640**: both folds open with no option clipped, the summaries
  update from inside them ("Race to 7", "Racks · Kenny to 5, Melanie to 2"), Start still starts
  the match, the live screen still doesn't scroll, and Invites (which shares `.setupbody`) is
  unchanged. `node --test`: 21 pass.

**Then 2.2.3 — the Ten-Point-Eight result was wrong, and it mattered.** The owner played the
first real 8-ball match: Kenny 506 v Melanie 332, five fixed racks, scoring handicap. They
played one rack, Kenny won it 10–5, and ended the match. The card said **Melanie wins**.

- **The bug.** `matchResult` built the quota from `racksPlanned`, so a match that ended after
  one rack was judged against a quota for five: Kenny 10 against 43 is 33 short, Melanie 5
  against 25 is 20 short, so Melanie "finished further past her own" by 13 and won a match in
  which she won no racks and scored half the points. This is not a rounding error, it is an
  inversion, and it gets worse the bigger the handicap — the spot is what decides, and a spot
  measured over racks nobody played is all spot and no play.
- **The fix.** The quota that decides the match covers `banked.racks`, the racks actually
  played. Prorated to the one rack, the quotas are 9 and 5, and Kenny wins by 1. A match that
  runs its full length is unchanged, because there the racks played *are* the racks planned —
  checked in the harness: a full five-rack match still lands 35–35, Melanie on the spot.
  `eightQuota(pA, racks, cfg)` and `eightLead(t, quota)` moved into `zargo.js` so the rule is
  pure and tested rather than buried in a paint function.
- **The lead bar was reading a different number from the result.** It used the ratio
  `tA/quotaA` vs `tB/quotaB` while the match was decided on the spot, and the two genuinely
  disagree: at quotas 17 and 4 with 22–7, the ratio says B is ahead and the spot says A wins.
  The bar now shows the same spot, in points ("Kenny +1 point"), over the racks played, so the
  bar and the final card can never name different leaders.
- **The Zargo was right all along.** Only the rack winner rates (§7.2), so Kenny won the one
  rack and went 506 → 507 while Melanie went 332 → 331. It looked backwards only because the
  headline above it was wrong. Ratings never used the match winner, so nothing stored needs
  rebuilding — but a match saved before 2.2.3 keeps the wrong `totals.winner` in its document,
  since that is a stored field and not derived. There is one such match.
- **Not a bug: the match "finished after 2".** End is a hold that ends the *match* and drops
  the rack in progress, which is what happened at rack 2 of 5. Racks end with a win button.
  `targetReached` is false in fixed mode, so nothing auto-finished — verified by playing a full
  five-rack match, which declares only on the fifth.
- **Tests.** `node --test`: **24 pass** (was 21). The three new ones pin the owner's match
  against both quotas, the full-length spot including an exact tie, and that a quota is never
  zero. The harness replayed the owner's match exactly and now reads "Kenny wins", and all five
  games start and score with no page errors.

- **⚠ One thing to watch on the phone.** The 4 and the 13 are purple balls, and they now sit
  nearer side B's lilac than they did coral. They are darker and more saturated, they always
  carry their number, and a ball is never a person marker, so nothing reads as a state — but
  it's the one place the new hue has a neighbour. Coral had the same problem with amber, which
  is the reason for the swap.
