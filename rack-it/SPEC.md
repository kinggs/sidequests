# Rack It — spec

A phone-first scorer for three cue games between any two players, with one rating across all
of them (**Zargo**) and handicaps that keep a mismatched pair close. Matches sync to the cloud,
so any invited phone can score, resume or watch. Invite-only: members sign in with Google.

This spec is the app as it is (2.0.1). The rating's reasoning is in [`ZARGO.md`](ZARGO.md); the
build sessions and their handovers are in [`V3-PLAN.md`](V3-PLAN.md); the redesign to come is in
[`design/`](design/DESIGN.md).

**Files.** `index.html` (the app), `zargo.js` (the rating engine, pure), `zargo.test.mjs` (its
tests: `node --test` from the repo root), `sw.js`, `manifest.json`, icons. `design/` is reference only.

---

## 1. Concepts

| Concept | Definition |
|---|---|
| **Player** | A person on the household's shared list (`shared/people.js`): name, colour, Gmail, photo. Rack It adds their numbers. |
| **Zargo** | One rating per player: odds on a rack. 100 apart, the stronger player expects to win two racks for every one. Starts at 500. |
| **Robustness** | How many racks' worth of evidence sits behind a Zargo. Under 30 the rating is **provisional**. |
| **Starter rating** | Where a player's Zargo begins before any match: 500, an estimate, or an override. |
| **Match** | One sitting between two players in one game: one or more racks, a length, a handicap, a result. |
| **Rack** | One game on the table. What it records depends on the game (§2). |
| **Handicap** | **Off**, **Scoring** (point quotas) or **Racks** (a race chart). Never enters the rating. |

Words: **match**, never session; **Tied**, never "dead level"; **Invites** for the members list.

## 2. The games

Labelled **Trad-Nine · Golden-Nine · 11-Point-Nine**, in that order everywhere. Stored as
`"standard"`, `"golden"` and `"league"`; a match without `game` is 11-Point-Nine.

| | Trad-Nine | Golden-Nine | 11-Point-Nine |
|---|---|---|---|
| A rack records | winner, win kind, fouls, ball drop, breaker | the same | the state of balls 1–9, breaker |
| Scoring | one rack is one rack | 10 / 7 / 4 to the winner; fouls give 1, 1, 2 | 1 a ball, the 9 is 3 |
| A rack ends | a win tap | a win tap, or a third foul | all nine balls resolved |
| Length | race to 3, 5 (default), 7 or N (1–30) | 5 fixed racks (default), race to 35 or N points (1–200) | race (default, about 5 racks), fixed racks or open |
| Break | alternate | winner breaks | alternate |
| Handicap levers | Off (default), Racks | Off, Scoring (default), Racks | Off, Scoring (default), Racks |

### 2.1 11-Point-Nine, the house variant

- Play continues until **all nine balls are off the table**. Sinking the 9 early ends nothing.
- Balls 1–8 score **1**, the 9 scores **3**: every rack is worth **11 live points**.
- A ball pocketed on a foul is **dead**: it stays down and scores for nobody.
- A rack should total 11 (`a + b + dead`). When it doesn't, the rack-end card warns (usually a
  mis-tap) and offers **Back to the rack** first and **Bank it anyway** second, since real racks
  sometimes go odd.
- Point values live in `config.games.league.points`, so a 10-point variant is one edit.

### 2.2 Golden-Nine

From the DUYA Legends Tour standard rules
([English rules page](https://alison-chang.com/duya-legends-tour-golden-nine-standard-rules/)):

- **Big Golden** (break and run) **10**. **Small Golden** (table run) **7**: a legal 9 on the
  break, the breaker pocketing the 9 by combination in their inning, or a player who takes over
  with the 1 and 9 on the table and clears. Any other win **4**.
- A player's first and second foul in a rack give the opponent **1** each; the third gives **2**
  and loses the rack. Rack It plays the 1 + 1 + 2 as *being* the win (kind `"fouls"`, worth 4),
  one config value if a club plays it differently.
- An **intentional foul** loses the rack and gives the opponent **10**; a second one loses the
  match, whatever the score.
- Matches are a scheduled number of racks; a tie after the last is settled by one more rack.
  Winner breaks. Balls stay off the table; only the 9 is respotted. Ball in hand after a foul.
- In practice (Sept 2026) organisers pair a rack count with a time limit, e.g. 35 racks or 210
  minutes. Rack It keeps fixed racks as the default and offers a **race to points** as a house
  option.

### 2.3 Trad-Nine

WPA nine-ball as played at Sessions Billiard Club: one rack is one rack, a race, alternate
break. Fouls are counted per player per rack so every game's screen looks the same; they never
score. Win kinds: **Break & run**, **9 on the break**, **Win**.

## 3. Zargo

The full definition, the per-game weights and the known challenges are in
[`ZARGO.md`](ZARGO.md). The code is `zargo.js`. In short:

- `pA = 1 / (1 + 2^((Zb − Za) / 100))`, A's chance of winning one rack.
- Every counted rack gives A a result `r` and a weight `w`. **11-Point-Nine:** `r` is A's share
  of the rack's live points and `w = 1`, spread over the match by live points
  (`w_i = live_i / mean`), so a rack mostly lost to dead balls says less and the weights still
  sum to the rack count. **Golden-Nine and Trad-Nine:** `r` is 1 or 0 by rack winner, `w = 0.5`.
- A match moves ratings in one of three regimes, by matches played (`sessions` in the data):
  - **Calibration.** A player under 3 matches against one with 3 or more: solve the Zargo the
    observed mean `r` implies (`gap = 100 × log2(s / (1 − s))`, capped ±250) anchored on the
    known player, and move all of the way there on match 1, half on 2, a third on 3. The known
    player doesn't move.
  - **Settling.** Both under 3: the standard update boosted 4×, 3×, 2×, clamped ±120.
  - **Known.** `delta = K × Σ w_i × (r_i − pA)`, `K = 8`, clamped ±40. A's share is weighted by
    `2 × robustnessB / (robustnessA + robustnessB)`, and B's the other way round, so the
    better-established player moves less.
- `robustness += Σ w`. Under **30** the rating is provisional: still used, but it moves quickly.
- **Handicap never enters the update.** The racks are what happened.
- A discarded match never touches ratings; one with no complete rack is discarded silently.
- It isn't Fargo, and it isn't Cuescore's rating: About Zargo (More) says so in plain words.

### 3.1 Starter ratings

- New players start at **500** (`config.startZargo`).
- **Add player** offers an estimate: pick a player who has played, and a likely race-to-9
  score; the new rating is `their Zargo − 100 × log2(theirScore / newScore)`, between 100 and
  900. Untouched, it's 500.
- Editing a player allows a **starter rating override**, confirmed. Both write
  `starters/<personId>` and `state/main`, so the number shows at once.

### 3.2 Rebuild ratings

More → **Rebuild ratings** replays every saved match in the order it ended (`zargo.js`
`replay`), from each player's starter rating, with the running matches played and robustness,
exactly as saving did. It shows the change per player first ("Kenny 505 → 507") and the number
of match records that change; **Apply** writes `state/main.players` and each match's
`zargoBefore` and `zargoAfter`.

- A player with no starter document starts from their first match's `zargoBefore`, or, if
  they've never played, from their current rating. Apply writes those down
  (`setBy: "rebuild"`).
- Old matches' player ids are read through `people.resolve`, so merges carry history.
- **Deleting a saved match rebuilds ratings straight away**, so it leaves no movement behind.
- Saving a match still updates the two players directly, so a rebuild normally changes nothing.

## 4. Handicap and the lead bar

**Scoring** gives each player a quota. **Racks** makes the match a race in racks with a chart.
**Off** plays level and the plain score decides it. Scoring isn't offered for Trad-Nine (no
points to share). Racks isn't offered for an open 11-Point-Nine match or a Golden-Nine race to
points; choosing it turns any other match into a **race in racks**, Length becomes Race to
3 · 5 · 7 · N (N 1–15), and leaving Racks resets Length to the game's default.

**Race chart.** The favourite races to N; the underdog's target is the one from 1 to N whose
race-win probability (a dynamic programme over `pA`) is nearest 50%, ties to the longer race.
At `pA` 0.65 a race to 7 becomes 7 against 4. Setup shows two readings and plays the one picked:
- **Targets:** `targets: { a: 7, b: 4 }`, `start: { a: 0, b: 0 }`.
- **Head start:** `targets: { a: 7, b: 7 }`, `start: { a: 0, b: 3 }`; the underdog's racks
  begin at 3. `totals.racksA/racksB` include the head start; points never do.

**Scoring quotas.** 11-Point-Nine race: `round(11 × racks × share)` each, editable. Fixed: each
player's expected share of the live points over the planned racks. Open: the same over the
racks played, floored at 5 racks. Golden-Nine fixed: the expected share of the points scored so
far, floored at 4 points a planned rack. Golden-Nine race to points: the pair's `2N` split
`a = round(2N × pA)`, `b = 2N − a`, editable. ⚠ That split assumes point share ≈ rack-win share;
check it against real matches. Setup warns when an 11-Point-Nine race target is under **8
points** (one rack could decide it) and suggests a length; it doesn't block.

**Off.** An 11-Point-Nine race is both to `round(11 × racks / 2)`; a Golden-Nine race to points
is both to N; Trad-Nine races level.

**The lead bar** sits under the scores: a green fill from the centre towards whoever is ahead,
their name and the gap in large type. With a quota it reads the gap between the two players'
progress towards their own quota, as a share of the match ("MEL +26%"), capped at +100%; full
swing at a quarter of the match clear, damped by how much has been played, so an underdog's
first ball doesn't lurch it. In a race it pegs at **target met**; "ahead" means closest to your
own target. A head start reads as the shorter target it equals. Off shows a plain lead: racks
in Trad-Nine ("MEL +1 rack"), points in the games scored by points ("KENNY +6 points"), full
swing at the race size or half the match's points. Level reads **Tied** with an empty bar.

**Who wins.** Scoring: the adjusted lead `pointsB − pointsA / H`, `H = pA / (1 − pA)`. Off: the
plain difference. A race: whoever met their target (racks in a race in racks, points otherwise).
The Racks lever ended early: whoever is further through their own race. Golden-Nine: a second
intentional foul loses the match whatever the score.

## 5. Play: setup

One page, defaults first, **Start** pinned below it and naming what's missing ("Pick two
players", "Set the length first"):

1. **Game** chips. The last game picked is remembered per phone (`localStorage` `rack-it.game`).
2. **Players:** Blue side and Amber side columns with avatars. You're pre-selected on blue; the
   amber column lists the blue player's most recent opponents first, then everyone by name. The
   same player can't be on both sides.
3. **Length**, **Handicap** and **Break**: one row each showing the current choice. Length and
   Handicap open on tap; Break flips on tap (blue breaks first by default).
4. The handicap row shows the proposal in one line and the targets, both editable. The hint
   says how many racks (or points, in 11-Point-Nine) the favourite expects for each one of the
   other's, "Near-level ratings, so an even match" when close, and with Racks the chance the
   higher-rated player wins the race as set.

The handicap isn't remembered: each game starts at its default. A repeat of last night is Game,
two names, Start. Play keeps your picks while you look at another tab and starts fresh after a
match has begun.

## 6. The live screen

Full-bleed: no tab bar. The screen holds a wake lock and asks for fullscreen (`shared/phone.js`).

**Shared chrome.** Two score panels with names (blue left, amber right); **tap a panel to make
that player the shooter**, and the whole screen tints to their colour. Under each score, the
run-in to a race target ("needs 4 of 7", "target met") or the racks won. The lead bar. A meta
strip: rack number (and "of N" when fixed), dead balls in 11-Point-Nine, the rack's points when
racing in racks, and **break: name**, which flips on tap. Controls: **Undo** (everything in the
current rack, up to 60 steps), **Next rack** (11-Point-Nine only), **End**.

**11-Point-Nine.** The diamond rack of balls 1–9, sized by height as well as width. Tap a ball:
untouched → the shooter's; the shooter's → dead; dead → untouched; the other player's → the
shooter's. Claimed balls fill with the player's colour; dead balls go grey with a cross.
**Long-press** clears a ball. When all nine are resolved the rack-end card shows the 11-point
check with **Start rack N** (or **Declare the result**), or the odd-total warning (§2.1).

**Golden-Nine and Trad-Nine.** The rack area becomes a column under each player: **Foul** (that
rack's count, and in Golden-Nine what it gave away) and three win buttons (Golden-Nine: Big
Golden +10, Small Golden +7, Win +4; Trad-Nine: Break & run, 9 on the break, Win). A foul passes
the shot to the opponent. A win tap, or a third Golden-Nine foul, ends the rack and shows the
card with **Start rack N** and **Undo that**. Golden-Nine's intentional foul is a long-press on
Foul, confirmed. After the last scheduled Golden-Nine rack a tie offers **Play a deciding rack**
(adds one to `racksPlanned`) or **Call it a tie**.

**The ball drop** (Golden-Nine and Trad-Nine): balls 1–5 over 6–9 above the controls, as on a
stream. Tap a ball and it's potted by the shooter; its slot stays empty, and tapping the slot
puts it back. It's a log for replays, never the score: potting the 9 wins nothing, the shooter
doesn't change, taps after the rack has a winner are ignored, and a new rack starts full. Undo
covers it.

**End.** A complete rack still counts. 11-Point-Nine: an untouched rack is dropped silently; a
part-played or odd rack asks, dropped by default with **Count rack N, then end** offered.
Golden-Nine and Trad-Nine: a rack without a winner is dropped, and End says so if fouls had
given points. Then the result card: winner, racks, score line, Zargo movement ("calibrating"
when it applies), **Save match** or **Discard**. Saving opens the match's summary; discarding
goes to Ratings.

**Sync, Resume, Watch.** The match document is the record: every tap patches the current rack
(`cloud.patch("matches/<id>", { "racks.N": … })`) with `turn` and running totals, so two phones
never overwrite each other and offline scoring syncs later. **Resume** rebuilds the match from
the document on any phone: racks below the highest are banked, the highest is in progress, undo
history doesn't survive. A match whose player has been deleted or merged into the other can't
be resumed. **Watch** is the same screen read-only, updating live, with **Stop watching**; it
says when the match is saved or discarded. Deleting the match a phone is scoring or watching
drops it out cleanly.

## 7. The four tabs

**Play · Ratings · Matches · More**, 60px tall, along the bottom of every page but sign-in and
the live screen. The app always opens on **Play** (owner's call, 2.0.1). While a match is live and this phone isn't scoring or watching
it, a **live strip** above the tabs shows "Kenny v Melanie · Trad-Nine" with **Resume** and
**Watch**. The newest 300 matches are watched as one live list, so the strip, Matches, a
person's page and a summary update without a reload.

**Ratings.** Everyone, ranked by Zargo: rank, avatar, name ("(you)"), "No Gmail" where missing,
Zargo, robustness, provisional. People who haven't played go last, by name, unranked, "not
played yet". **Add player** under the list. Tap a row for their page.

**A person's page.** 72px avatar, Zargo with robustness, one line on what the number means
("Against someone on 497, Kenny would expect to win two racks for every one"), **Edit** (name,
Gmail, colour, starter rating override, delete, and the shared sheet), Cuescore (read-only;
Add or Change on your own page), the win record per game (finished matches) and their matches.

**Matches.** Live (last 24 hours) first, then newest. Each row: when (a time today, else a date),
game, length and handicap, names and score (racks in a race in racks, head start included), and
who won. Discarded matches don't show. **Delete** is two taps within five seconds; the list isn't
redrawn while one is armed. A live row resumes; a finished one opens its summary.

**Summary.** Winner, game, length, when, the score line, the Zargo movement, the racks that
counted, and **Copy for Cuescore** (§10).

**More.** Invites, Export and Import, Rebuild ratings, Install on this phone, About Zargo, Sign
out, the version; the account shows in the header. **Invites** is the members allowlist: add a
Gmail, remove one (two taps, never yourself), **Share this app**; rows show whose Gmail it is.

## 8. People, Gmail and claiming

Players are the household's shared people (`shared/people.js`, `/sidequests/_shared/people/`),
the same list Around the Clock and Bloc 11 use. Rack It keeps only its numbers, keyed by person
id. Stored ids are read through `people.resolve`, so a merge in any app carries history with it.

- **Gmail is required** to add or save a player: they sign in with it and it claims the player.
  Saving a new one invites it. A Gmail already on someone else is refused. Older players
  without one show **No Gmail** and can't be saved until they have one. Adding a name that's
  already on the list asks first.
- **Claiming.** On sign-in the account links to the person with its `uid`, else its email, and
  stamps `uid`, `claimedAt` and the Google `photoURL` (refreshed every sign-in). With no match,
  **Which player are you?** lists the unclaimed people (no Gmail first); picking one writes your
  email over theirs. **I'm not on the list** adds you under your Google first name. With nobody
  unclaimed you're added without asking.
- A claimed player's Gmail is locked ("Claimed by …"). **Unclaim** (two taps) clears `uid`,
  `claimedAt`, `photoURL` and the Gmail, so the right person can claim them.
- **Avatar** (`people.avatar(id, size)`): the photo in a 3px ring of the player's colour with a
  2px dark gap, or their initial on their colour. 36px in lists, 72px on a person's page.
- **Deleting** a player is soft and shared by every app: they leave every list and picker, their
  matches keep their name. You can't delete yourself.
- ⚠ Any member can write any person; the Cuescore rule below is enforced in the app only.

## 9. Data

All under `sidequests/rack-it/` in Firestore, via `shared/cloud.js`. Members-only by
`shared/firestore.rules`.

```
state/main
  players: { <personId>: { zargo, robustness, sessions } }     // sessions = matches played
  config:  { games: { league: { points: { low, nine }, w }, golden: { points: { big, small,
             win, foul: [1, 1, 2], intentional }, w }, standard: { w } },
             K: 8, provisionalRacks: 30, startZargo: 500 }       // old config.points still read

starters/<personId>
  zargo, setAt, setBy                                           // an email, or "rebuild"

matches/<id>
  game: "standard" | "golden" | "league"                        // missing = league
  handicap: "off" | "scoring" | "racks"                         // missing = scoring
  playerA, playerB                                              // person ids when started
  mode: "race" | "fixed" | "open"
  targets: { a, b } | null         // points, or racks in a race in racks
  start: { a, b }                  // Racks lever only: the head start
  racksPlanned: n | null           // fixed racks
  startedAt, endedAt, status: "live" | "done" | "discarded", turn: "a" | "b"
  zargoBefore: { a, b }, zargoAfter: { a, b } | null
  racks: {
    "1": { balls: { "1": "a", …, "9": "dead" }, breaker, at }                     // 11-Point-Nine
    "1": { winner, kind: "big" | "small" | "win" | "fouls" | "intentional",
           fouls: { a, b }, balls: { "3": "a" }, pottedAt: { "3": <ms> }, breaker, at }  // Golden-Nine
    "1": { winner, kind: "run" | "nine" | "win", fouls, balls, pottedAt, breaker, at }    // Trad-Nine
  }
  totals: { a, b, racksA, racksB, dead, lead, winner }
```

- In Trad-Nine `a` and `b` are racks. An 11-Point-Nine rack counts to whoever took more of its
  live points (an equal split counts for nobody). `racksA/racksB` include any head start.
- **Counted racks.** Golden-Nine and Trad-Nine: racks with a winner. 11-Point-Nine: every rack
  but a last one that End dropped (no balls at all, or points not in `totals`).
- Writes: racks with `cloud.patch` per rack; `state/main` and `starters` with `cloud.save`.
- Offline: Firestore's persistent cache is on; `sw.js` caches the shell (`index.html`,
  `zargo.js`, manifest, icons), network first.

**Export** downloads one JSON file: `app: "rack-it"`, `state`, `people`, `starters`, `matches`.
It holds email addresses, so it never goes in the repo. **Import** accepts `app` `"rack-it"` or
`"fair-nine"` (1.x exports, whose matches sit under `sessions`), keeps document ids, and asks:
**Merge** adds what's missing and never overwrites; **Replace** (confirmed) wipes matches,
starters and `state/main` first. People go to the shared list by adoption, never removed.

**The move from Fair Nine.** Until 1.5.0 the app lived at `fair-nine/` with data at
`sidequests/fair-nine/{state,sessions}`. 2.0.0 starts empty at `rack-it/`; the owner imports the
1.5.0 export with Replace, then runs Rebuild ratings once. The old Firestore data stays where
it was. `fair-nine/` now holds only a "Rack It has moved" page and a service worker that
clears Fair Nine's caches, unregisters itself and reloads its windows.

**Testing.** `?mock` runs against `shared/cloud-memory.js` (CLAUDE.md): fake member, fake data.

## 10. Cuescore

Cuescore is where Sessions Billiard Club keeps leagues, rankings and challenge matches. Its
[API](https://api.cuescore.com/) is read-only; challenges are entered by hand in a logged-in
account, so a static app can't upload results.

- A person can carry a `cuescoreId`: paste a profile link and the trailing number is kept. Only
  you set your own, never on Add player; anyone else's shows read-only ("Player 1234567", not a
  link, since a URL built from the number alone is unverified).
- **Copy for Cuescore** on a summary: one line with the score in racks, since Cuescore records
  frames, e.g. `Kenny 5–0 Melanie · 9-Ball · race to 5 · Sep 16, 2026`. Golden-Nine and
  11-Point-Nine say "9-Ball (Golden Nine)" and "9-Ball (11-Point-Nine)" and add the points. The
  race reads "race to 7 v 4", adds "Melanie started 3 up", or gives points or a rack count. With
  no clipboard the line is selected instead. **Open Cuescore challenges** links to
  cuescore.com/challenges/. ⚠ Check the shape against Cuescore's real challenge form.

## 11. Fitting the phone

- **Never scrolls while scoring.** Panels, lead bar, meta strip and controls are fixed; the rack
  takes what's left. Ball size: `clamp(46px, min(21vw, (100dvh − 396px) / 5), 92px)`, `dvh`
  because it tracks Chrome's URL bar. Under 700px tall the shooter cue goes (the tint already
  says it), the score and controls shrink, and the Golden-Nine and Trad-Nine win area tightens.
- **Ball drop sizing.** Two rows, so every target is a fifth of the width by 56px (74×56 on a
  390px phone), balls at 44px. The win buttons give up the height, down to their 56px minimum
  on a 640px-tall screen.
- **House minimums.** 18px base, nothing under 15px, targets 56px or more, dark, high contrast,
  `touch-action: manipulation`, `prefers-reduced-motion` respected, taps on `pointerup`.
- **Installing.** The manifest asks for `fullscreen` then `standalone`, portrait, id
  `/sidequests/rack-it/`, with PNG icons at 192, 512 and maskable 512; without PNGs Chrome makes
  a shortcut that opens in a tab. More carries **Install on this phone**. Chrome can't move an
  installed app to a new id, so everyone reinstalled once at 2.0.0.
- **Sign-in** shows its button only once the auth state is known, so it never flashes. An
  account that isn't invited sees "Ask Kenny to add your Gmail under Invites".

## 12. Out of scope

- Charts and trend lines; shot-level stats beyond who broke and the ball drop.
- A per-game rating, and an 11-Point-Nine point-share-to-rack-odds mapping (ZARGO.md ⚠).
- Uploading to Cuescore, and Cuescore ratings as starter hints.
- Club grouping; owner-only actions (Session 6); Golden-Nine's shot clock, time limit, early finish.
- WPA 8-ball and Heyball (same shape as Trad-Nine when wanted).

## 13. Decisions log

| When | Decision |
|---|---|
| v2 | Any two players, one Zargo each; Firestore; members allowlist managed in the app. |
| v2 | Ratings settle fast for players under 3 matches. Players are the shared people list. |
| 1.0.0 | Named Rack It. The per-rack update, with 11-Point-Nine weights spread by live points so old results are unchanged. |
| 1.1.0 | Golden-Nine and Trad-Nine as games in the same app, not new apps. Three-foul racks are the win. |
| 1.3.0 | One-screen setup; Off · Scoring · Racks; Racks makes a race in racks; favourite races to N. |
| 1.3.0 | Gmail required; claiming by uid or email, else a "Which player are you?" card; unclaim clears the Gmail. |
| 1.4.0 | Ball drop logged for replays, never scored. |
| 1.5.0 | Four tabs; live row resumes, Watch lives on the strip; summaries in racks for Cuescore. |
| 2.0.0 | Moved to `rack-it/` with data under `matches/`; the move is Export and Import. |
| 2.0.0 | Rating engine is a pure tested module (CLAUDE.md rule 1's exception). |
| 2.0.0 | Starter ratings get documents; ratings can be rebuilt; deleting a saved match rebuilds. |
| 2.0.1 | The app opens on Play, not Ratings. |
