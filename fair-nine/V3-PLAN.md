# Rack It v3 — working doc for four build sessions

Fair Nine becomes **Rack It**: three cue games, one Zargo rating, a phone-first layout that
holds a club. This doc is the handover between four consecutive Claude Code sessions. Each
session ends with the app **deployed and working**, then ticks its boxes and writes its
handover note below, so the next session starts from the truth.

**Start every session with:** "Read `fair-nine/V3-PLAN.md` and do Session N."

## Read first, every session

1. `CLAUDE.md` — the repo rules. Direct to `main`, one file per app, bump `APP_VERSION` and
   `CACHE` together, deploy with `/deployquest`.
2. `fair-nine/SPEC.md` — §1 to §11 is the app as it stands; **§12** is the three-game plan,
   **§13** the new information architecture. Update the spec in the same commit when a
   decision here changes it.
3. `fair-nine/ZARGO.md` — the rating across games: definition, per-game `r` and `w`, the
   session update, the handicap levers, the known challenges.
4. The **Handover** section at the bottom of this doc, for what the previous session left.
5. `fair-nine/index.html` itself. Read the whole file before changing it. It is one file
   (about 1,800 lines); the live scoring screen is a prototype the owner likes, so extend it,
   never rebuild it.

## Ground rules for all four sessions

- **The 11-Point-Nine game must behave identically after every session.** Same taps, same numbers.
  Before touching ratings, Export a JSON and keep it in the scratchpad; after, Import it
  into a scratch check or recompute one old session and confirm the Zargo movement matches.
- **Deploy at the end of the session, not the start of the next.** A session that can't
  finish its list deploys what works and writes the rest into Handover.
- **Version:** Session 1 lands `1.0.0` (the rename). Later sessions bump minor.
- **No new files in the app folder** except what the spec names. No frameworks.
- **Don't build ahead.** Each session's list is the whole of that session. Ideas go in
  Handover under "Parked".
- Ask the owner nothing that the spec, ZARGO.md or this doc already answers. If something is
  genuinely open, pick the simplest reading, do it, and say so in Handover.

---

## Session 1 — Foundation: the name, games in the data, Zargo per rack

**Goal:** the app is called Rack It, every match knows which game it is, and the rating
update is the per-rack, weighted formula from ZARGO.md. Nothing visible changes except the
name and the word "match". 11-Point-Nine results and ratings are numerically identical.

**Read:** SPEC §12.1, §12.5, §12.8, §13.2; ZARGO.md "The definition" and "Challenges" 5 and 8.

- [x] Rename: `<title>`, the `<h1>`, footer, share text, export filename and the "not a Fair
      Nine export" check accept both names. `manifest.json` `name` and `short_name` become
      "Rack It"; **`id` and `start_url` stay `/sidequests/fair-nine/`**. Landing page
      `index.html` at the repo root lists "Rack It". Folder, URL, `APP_ID` and Firestore
      paths do not change. Icon: keep the shape, change the lettering only if trivial.
- [x] "Session" becomes "match" in every label the user sees. Code names can stay.
- [x] `game` on every session document: `"league" | "golden" | "standard"`. Reading a
      document without one treats it as 11-Point-Nine. New matches write `"league"`.
- [x] `handicap` on every session document: `"off" | "scoring" | "racks"`. Existing
      documents read as `"scoring"` (that is what they were). Setup still writes `"scoring"`.
- [x] `state/main.config.games`: `{ league: { points: { low: 1, nine: 3 }, w: 1 },
      golden: { points: { big: 10, small: 7, win: 4, foul: [1, 1, 2], intentional: 10 },
      w: 0.5 }, standard: { w: 0.5 } }`. Migrate the old `config.points` into
      `games.league.points` and keep reading either.
- [x] Rating update rewritten per rack: `delta = K × Σ w_i × (r_i − pA)`, clamp ±40,
      `robustness += Σ w_i`. For 11-Point-Nine `r_i` is the rack's live point share and `w = 1`, so
      the result equals the old formula. Prove it: recompute the Zargo movement for three
      stored 11-Point-Nine sessions and compare with their stored `zargoBefore`/`zargoAfter`.
- [x] Settling (SPEC §11 "Ratings settle fast") uses observed mean `r` instead of observed
      point share. Same numbers for 11-Point-Nine.
- [x] `shared/people.js`: a `cuescoreId` field, editable in the shared add/edit sheet as
      "Cuescore profile link": paste the URL, the app keeps the trailing number. Bump
      nothing in other apps unless the sheet's layout changed for them.
- [x] Version `1.0.0` in `index.html` and `sw.js`. `/deployquest`.
- [x] Handover written.

**Done when:** the phone shows "Rack It", an 11-Point-Nine match scores and rates exactly as before,
and Export shows `game` and `handicap` on every session.

---

## Session 2 — Golden-Nine and Trad-Nine

**Goal:** all three games can be played end to end, with the existing scoring handicap where
it applies. Setup grows a game picker; the live screen gains the shared simpler layout.

**Read:** SPEC §12.2, §12.3, §12.5; ZARGO.md "The definition".

- [x] Setup: **Game** chips above the players — 11-Point-Nine · Golden-Nine · Trad-Nine. Remembered
      in `localStorage`. Length defaults per game: 11-Point-Nine 5 racks (as now), Golden-Nine
      fixed 5 racks, Trad-Nine race to 5 racks (7 offered). Break default: 11-Point-Nine and Trad-Nine
      alternate, Golden-Nine winner breaks.
- [x] Live screen for Golden-Nine and Trad-Nine, built from the existing pieces (panels, tint,
      lead bar, meta strip, controls) with the rack area replaced by: a **Foul** button under
      each player showing that rack's foul count and what it gave away, and three **win**
      buttons for each side. Golden-Nine: Big Golden 10 · Small Golden 7 · Win 4. Trad-Nine:
      Break & run · 9 on the break · Win. Tapping a win button ends the rack for that side.
- [x] Golden-Nine scoring: fouls give the opponent 1, 1, then 2 and the rack (kind
      `"fouls"`, worth 4 in total, no extra win points). Intentional foul from a long-press
      on Foul: rack lost, opponent +10, kind `"intentional"`; a second one ends the match.
      Trad-Nine: fouls counted, never scored.
- [x] Rack records as SPEC §12.5. Written with `cloud.patch` per rack like 11-Point-Nine. Undo
      covers foul taps and win taps.
- [x] Rack end: no 11-point check for the new games; straight to "Start rack N". Golden
      Nine fixed racks: if tied after the last rack, offer one more.
- [x] Lead bar: Golden-Nine scoring handicap uses quotas = expected rack-win share × the
      match's points so far (fixed) or the race targets (race). Trad-Nine shows racks won and
      the race targets; with handicap off both games show plain scores and a lead of racks.
- [x] Match summary and History rows show the game. Totals gain `racksA`, `racksB`.
- [x] Rating update per rack for both games: `r ∈ {0, 1}` by rack winner, `w = 0.5`.
      Resume and Watch work for both games.
- [x] Export/Import round-trips the new rack shapes.
- [x] Version bump, `/deployquest`, Handover.

**Done when:** one full Golden-Nine match and one Trad-Nine race can be scored on the phone,
saved, seen in History, and move Zargo by the amount ZARGO.md predicts.

---

## Session 3 — Handicap levers and the one-screen setup

**Goal:** setup fits one screen with Start pinned, and the three handicap levers work for
every game that supports them.

**Read:** SPEC §13.3; ZARGO.md "Handicap levers".

- [x] Setup layout as §13.3: Game, Players ("you" pre-selected on blue, recent opponents
      first on amber), then Length, Handicap and Break each as a single row showing its
      default, expanding on tap. Start pinned to the bottom; the page above it scrolls.
- [x] **Handicap chips: Off · Scoring · Racks.** Scoring is unavailable for Trad-Nine; Racks
      is available for every game with a rack count or race.
- [x] **Race chart:** given `pA`, find the pair of targets (each 1 to 15) whose race-win
      probability is nearest to even, by a small dynamic programme over racks. Show it two
      ways: "Kenny to 7, Melanie to 4" and "Melanie starts 3 up in a race to 7". Both
      numbers editable, both stored. In a race, the head-start form pre-loads `racksB`.
- [x] 11-Point-Nine **Racks** lever: race in racks, not points, with the chart; the 11-point rack
      is decided by live points.
- [x] Handicap off: no quotas, no targets beyond the plain race; the lead bar shows a plain
      lead. Ratings still update from raw results (ZARGO.md: handicap never enters the
      update). Confirm by playing one match each way.
- [x] The §3.6 "enough points to be a contest" warning still fires for 11-Point-Nine scoring.
- [x] **Golden-Nine race to a points target** as a Length option beside fixed racks (fixed
      racks stays the default, as in the DUYA rules; SPEC §12.2). Chips as Trad-Nine's: a
      default of **Race to 35** plus Race to N typed in (1 to 200). Handicap off: both race
      to N. Scoring: split the pair's combined `2N` by expected rack-win share, e.g. Kenny
      `round(2N × pA)` vs Melanie `round(2N × (1 − pA))`, both editable, both stored in
      `targets`. Racks: not offered for a points race. A target reached mid-rack (foul
      points) finishes the rack first, as in an 11-Point-Nine race; the lead bar and
      `matchResult` already handle a Golden-Nine race. ⚠ The split assumes point share ≈
      rack-win share (ZARGO.md), so check it against a few real matches.
- [x] **Players carry a Gmail, get claimed, show their photo** (owner: important). All of
      SPEC §13.8, mostly in `shared/people.js`:
  - [x] Gmail **required** on Add player and in the shared people sheet; saving invites.
        Existing players without one show "No Gmail" and can't be saved without it.
  - [x] Claim on first sign-in: `uid` and `claimedAt` on the person. Email match links
        silently; otherwise a **"Which player are you?"** card lists unclaimed players plus
        "I'm not on the list". Remove the first-name guess in `ensureMe()`. A claimed player
        can't be claimed by another account; the edit sheet offers Unclaim, confirmed.
  - [x] Write the Google `photoURL` to the claimed person on every sign-in.
  - [x] `people.avatar(id, size)`: photo in a circle inside a 3px ring of the player's
        colour, with a 2px dark gap; no photo or a failed load → colour circle with their
        initial. Replace every colour dot (Home list, pickers, Invites) with it.
  - [x] Cuescore link: editable only when editing yourself, never on Add player; read-only
        on anyone else. Rack It's "Gmail, Cuescore link, or merge" button passes
        `cuescore: true` only for you.
  - [x] `people.js` behaviour changes for every app: bump Around the Clock and Bloc 11
        versions too, and check their add sheets still work.
- [x] Version bump, `/deployquest`, Handover.

**Done when:** a repeat of last night's match is Game, two names, Start; each lever
produces the numbers ZARGO.md describes; a new player can't be added without a Gmail, signs
in, claims themselves, and shows their photo in their colour ring.

---

## Session 4 — Tabs, people pages, Matches, More, Cuescore

**Goal:** the §13 information architecture. Nothing about scoring changes.

**Read:** SPEC §13.1, §13.2, §13.4 to §13.7, §12.6.

- [x] Bottom bar with four tabs: **Play · Ratings · Matches · More**, 56px targets, safe-area
      padding. Opens on Ratings, or on Play when a match is live. A slim live-match bar
      above the tabs on every screen with Resume and Watch.
- [x] **Ratings**: the ranked list. Tap a row → **person page**: Zargo with robustness and
      one sentence on what it means, win record per game, their matches, Edit (the shared
      people sheet plus starter rating; Cuescore link on your own page only). Delete stays
      there, confirmed. Avatars from Session 3 on every row and the page header.
- [x] **Matches**: live first, then newest; row shows names, score, game, when, winner.
      Two-tap delete as today. A finished match opens its summary.
- [x] **Summary** gains **Copy for Cuescore**: both names, discipline, race and score as
      one line, plus a link to `https://cuescore.com/challenges/`.
- [x] **More**: Invites (was Family, renamed in 1.2.1, same mechanism), Export, Import, Install on this
      phone, About Zargo (SPEC §3 in plain words, and that it is not Fargo), Sign out.
- [x] Remove the old Home button pile and the History chips. Every old path still reaches
      its screen from one of the four tabs.
- [x] Wake lock, fullscreen and install unchanged; check on the phone that the bar does not
      overlap the live screen's controls (the live screen is full-bleed and hides the bar).
- [x] Version bump, `/deployquest`, Handover.

**Done when:** the owner can do everything they could before from the four tabs, in fewer
taps, and a new club member can be added, rated and matched without a word of explanation.

---

## Parked (not in any session)

- Shot clock for Golden-Nine (45 s + one 30 s extension per rack).
- WPA 8-ball and Heyball: same shape as Trad-Nine, add a game entry and a win-kind list.
- Club grouping of people.
- Cuescore rating as a starter hint via `api.cuescore.com` (⚠ CORS from a static page is
  untested).
- Fitting the 11-Point-Nine point-share-to-rack-odds mapping (ZARGO.md challenge 1).
- Golden-Nine match time limit. DUYA pairs every rack count with a time limit (e.g. 35 racks
  or 210 minutes, whichever comes first; a tie at time plays one more rack). Would need a
  match clock on the live screen and a time field in setup.
- End a fixed-rack Golden-Nine match early once the trailing player can't catch up, as
  reported from DUYA broadcasts. Simple with handicap off (points behind > 10 × racks left,
  plus fouls); with the scoring handicap it has to be worked out on quotas.

## Handover

Each session appends a short note here: what shipped (version), what was skipped and why,
anything the next session must know.

### After Session 1
**Shipped 1.0.0.** Everything on the list is done. Things the next session must know:

- **11-Point-Nine weights.** An 11-Point-Nine rack's `w` is spread over the match by live points
  (`w × live_i / mean`), not a flat 1 per rack. A flat 1 only equals the old formula when every
  rack has 11 live points; with dead balls it drifts. The spread version is exact. See SPEC §12.9.
  Golden-Nine and Trad-Nine use `w` as it stands, per rack.
- **Proof.** I replayed the 8 stored `done` matches in the signed-in browser (read-only). For 7,
  a search found the history values (matches played and robustness at the time) that reproduce
  the stored `zargoAfter`. From the same inputs, the new function gave identical numbers
  (difference 0). The 8th (12 Sep) isn't reproduced by any history in the search range, which
  says nothing about the formula. The ground rule's JSON export was **not** kept in the
  scratchpad: the Claude Code safety check blocks copying the data out of the browser. The owner
  says the data isn't critical (3 players: Kenny ≈505, Melanie ≈325, Squirge ≈490).
- **Code shape for Session 2.** `rackResults(game, points)` returns `[{ r, w }]` per complete rack
  and is the only place a new game hooks into the rating; it returns `[]` for Golden-Nine and Trad-Nine
  today. `zargoOutcome(results)` and `weightOf(results)` are game-agnostic. `live.banked.points`
  holds `{ a, b }` per banked 11-Point-Nine rack, rebuilt on resume. `live.game` and `live.handicap` are
  set on start and resume.
- **Data.** `gameOf(doc)`, `handicapOf(doc)` and `withMatchFields(doc)` default old documents.
  Export and Import fill the fields in; Firestore documents are not backfilled. `config.games` is
  merge-saved into `state/main` on first load; `config.points` is left in place.
- **Cuescore link** is opt-in in `shared/people.js`: `people.edit(id, { cuescore: true })`. The
  other apps don't pass it, so their sheet is unchanged and needed no version bump. It's reached
  from Edit player → "Gmail, Cuescore link, or merge a double entry"; Session 4 moves it to the
  person page.
- **Icon** kept as the yellow 9-ball; no lettering change.
- Import now also rejects a file whose `app` isn't `fair-nine` (e.g. a Bloc 11 export).

Parked: nothing new.

### After Session 2
**Shipped 1.1.0.** Everything on the list is done. SPEC §12.10 records the decisions. Things
the next session must know:

- **Testing.** I played every path in a local copy with an in-memory stand-in for `cloud.js`,
  so no real data or rating was touched: a full Golden-Nine match (fouls, three-foul rack,
  Undo that, winner breaks), intentional fouls including the second one that ends the match,
  a tie and its deciding rack, End during a rack, a Trad-Nine race to 5 with a resume from the
  document part-way, Watch from a second tab, Export then Import (Merge), and an 11-Point-Nine match
  for regression. Zargo moved exactly as ZARGO.md predicts: Trad-Nine 5–2, Kenny 597.3 → 598.3
  and Mel 508 → 505.4. 11-Point-Nine unchanged (−0.364 = 8 × (5/11 − 0.5)). ⚠ Not yet played on
  the phone against Firestore.
- **Choices I made where the plan was open.** Golden-Nine quotas have a floor of 4 points per
  planned rack (the plan said "points so far", which reads +100% after the first rack).
  A foul passes the shot to the opponent. Golden-Nine isn't offered as a race yet; the lead
  bar and `matchResult` already handle one. 11-Point-Nine `racksA`/`racksB` count by live points.
- **Code shape for Session 3.** `live.rack` is `{ winner, kind, fouls }` for the new games;
  `live.banked` is `newBanked()` with `racksA`, `racksB` and `points: [{ a, b, winner, kind }]`.
  `bankInto()` is used by both banking and resume. `matchResult(t)` decides the winner for
  every game. `leadState` sends `handicap: "off"` to `plainLead(ctx)`, which needs
  `ctx.racks`. Trad-Nine writes `targets: { a, b }`, so a Racks lever only has to write unequal
  targets, or pre-load `racksB` for a head start (`racksWon()` and resume would need to
  include it).
- **Setup.** `setup.game`, `setup.raceTo` (chips 3, 5, 7, or N typed into `#raceN` with `setup.raceOther`; since 1.2.0) and `applyGameDefaults()`. The
  11-Point-Nine "expected to score" hint now names the stronger player in both halves of the sentence
  (it used to name A twice when B was stronger).
- `bankRack()` now writes the rack before moving it into `banked`. Before, a watcher briefly
  saw that rack counted twice.

Parked: nothing new.

**1.1.1 (owner request):** the games are renamed on screen to **Trad-Nine · Golden-Nine ·
11-Point-Nine**, in that chip order, and these docs use the new names. Stored `game` values
(`"standard"`, `"golden"`, `"league"`) and all code names are unchanged.

**1.2.0 (owner request):** Trad-Nine setup offers Race to 3, 5, 7 and N. N shows a number box
(1 to 30) and Start stays disabled until it holds a valid number. The setup hint now calls
near-level ratings even, instead of "1.0 racks for each 1".

**1.2.1 (owner request):** Family is now **Invites** on every label (screen, button, sign-in
error, share text). Its list rows were squashed to a letter per line: `.plist button`'s
full-width rule also hit the Remove button, so it now gets `width: auto` like History's.

### After Session 3
**Shipped 1.3.0** (Around the Clock 0.5.0 and Bloc 11 0.6.0 for the shared people changes).
Everything on the list is done. SPEC §12.11 records every decision. Things the next session
must know:

- **Testing.** As in Session 2: a scratch copy of the site with an in-memory stand-in for
  `cloud.js`, no real data touched. Played an 11-Point-Nine race with the Racks lever as a head
  start (Kenny to 7, Melanie 3 up), with a reload and resume part-way, a watcher and a save.
  Also a Golden-Nine race to 20 with handicap off, a Trad-Nine race with Racks (5 vs 3), a
  Golden-Nine race in racks, and a fixed 11-Point-Nine match with handicap off. Every Zargo
  movement matched a hand calculation: the handicap never entered the update. The race-chart
  DP matched a Monte Carlo run (0.5593 vs 0.5589). Claiming: email match, the card (pick
  someone, and "I'm not on the list"), Unclaim, a broken photo link falling back to the
  initial. The Gmail rule in Rack It's forms, the shared sheet and Around the Clock's add
  sheet. Checked setup and the live meta strip at 390px wide. ⚠ Not yet played on the phone
  against Firestore, and no real Google photo seen yet.
- **Choices I made where the plan was open.**
  - The Racks lever turns any game's match into a race in racks. A racks handicap on fixed
    racks has no clear winner rule, so a fixed-rack Golden-Nine match switches to a race.
  - The favourite races to the chosen length, and the chart searches only the underdog's
    target.
  - The head start is played only when its chip is picked. The targets reading is the default.
  - The plan says Rack It passes `cuescore: true` only for you. It passes it for everyone
    instead, and `people.js` allows editing only on your own entry, so anyone else's link
    shows read-only as §13.8 describes.
  - Unclaim also clears the Gmail. Otherwise the same account re-claims by email on its next
    sign-in.
  - The claim card lists every unclaimed person, including those whose Gmail isn't yours.
    Picking one overwrites that Gmail.
  - "I'm not on the list" adds you under your Google first name, as before, not the full name.
  - Handicap off shows a plain points lead in 11-Point-Nine and Golden-Nine, since points
    decide those games. Session 2's "lead of racks" stays for Trad-Nine.
- **Code shape for Session 4.** `plannedMatch()` is the single source of what Start plays.
  `racesRacks(ctx)`, `startOf(ctx)`, `racksWon(bank)` and `bankedRacks()` carry the head start.
  `matchResult(t, r)` now takes racks too. `scoreLine(match, nA, nB, totals)` takes the match,
  not the game. People rows can use `people.avatar(id, 72)` for the person page.
  `P(id)` now carries `email` and `uid`.

Parked:
- Avatars in Around the Clock and Bloc 11. Their people lists and pickers keep colour dots;
  only "No Gmail" was added.
- The lead bar in a plain race still shows the lead ("+16 points") after a target is met,
  where the scoring bar says "target met".
- The 11-Point-Nine live controls wrap "Next rack" onto two lines at 390px wide. This predates
  Session 3.

**1.4.0 (owner request):** Golden-Nine and Trad-Nine have a ball drop: balls 1 to 9 across the
bottom of the live screen. A tap pots a ball for the shooter; tapping its slot puts it back.
It's logged to the rack as `balls` and `pottedAt` for replays, and it's optional: it never
touches the score or ends a rack. SPEC §12.12. Tap targets are a ninth of the screen wide,
under the 56px rule, to keep one row.

**1.4.1 (owner request):** the ball drop is two rows, 1 to 5 over 6 to 9, so every target is
56px tall and a fifth of the screen wide. It fits down to a 640px-tall screen.

### After Session 4
**Shipped 1.5.0.** Everything on the list is done. SPEC §13.9 records the decisions.

- **Testing.** Same scratch copy with an in-memory `cloud.js`, at 390px wide. Checked landing
  on Ratings, and on Play after a reload mid-match with the live strip on every tab. Played a
  Trad-Nine race resumed from the strip, then saved it, which opened its summary. Also the
  person page (your own and someone else's), keeping picks across tabs, Matches with a
  two-tap delete, About, Invites and back, Add player, and Watch from a second frame with Stop
  returning to Matches. An 11-Point-Nine match ended with a dropped part-rack left the rack
  out of the summary. Sign out and back in. ⚠ Not yet played on the phone against Firestore,
  and Copy for Cuescore hasn't been pasted into Cuescore.
- **Choices I made where the plan was open.**
  - Tapping a live row resumes it; Watch lives on the strip.
  - Discarding a match goes to Ratings; saving one opens its summary.
  - The summary's scores are racks, since Cuescore records frames.
  - Discipline is "9-Ball" for all three games, with the variant in brackets.
  - People who haven't played go last and unranked.
  - A Cuescore id shows as "Player 1234567", not a link: a URL built from the number alone
    is unverified.

Parked:
- The live strip and Matches redraw on every scoring write from another phone. That's fine
  at household size; throttle it if a club watches.
- Match rows are centred text, as History's were.
- Carried from earlier: avatars in the other apps, the "target met" label in plain races,
  the Golden-Nine split check, and Next rack wrapping at 390px.
