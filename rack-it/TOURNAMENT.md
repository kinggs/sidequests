# Rack It: tournaments — spec and build plan

A tournament in Rack It: one person starts it, picks the format, fills it from their friends or
with a QR, and the bracket runs itself as results come in. The organiser can enter every result;
players can enter their own. It reuses what Rack It has: the same accounts, the same QR, the same
players, the same matches and ratings.

**Status:** Session 1 done (2.27.2, 2026-11-18): `bracket.js` is built and tested; nothing on screen yet.
This is also pre-work for the Sessions app (`SESSIONS-MIGRATION.md` at the repo root): the
bracket logic and the data shape are written to be lifted out.

**Start every session with:** "Read `rack-it/TOURNAMENT.md` and do Session N." Then read
`CLAUDE.md`, `rack-it/SPEC.md` (§5 setup, §6.1 and §6.2 confirming and the scorer, §8.1 Connect,
§9 data), `shared/CONNECT.md`, `shared/DESIGN.md` and `shared/KIT.md`. Each session ends
deployed, ticks its boxes here, writes a handover note at the bottom, and moves what it built
into `rack-it/SPEC.md`.

---

## 0. Decisions for the owner

Each has a default the build follows unless the owner says otherwise. **The owner settled 1, 2 and 5
on 2026-11-18** (the Answer column); the rest stand at their defaults.

| # | Question | Answer | Why |
|---|---|---|---|
| 1 | Does a result typed in ("I won 3–1") move ratings? | **Yes: every tournament result is rated**, however it got in (the owner, 2026-11-18: "it is the one place where ratings really count"; subtler later). Not a walkover (no racks), not a match with a guest (guests play friendlies only). Ratings move **when the tournament finishes** (§3.7). | In the race games Zargo scores each rack 1 or 0 at weight 0.5 and sums them, so the order of the racks never matters: a typed 3–1 moves ratings exactly as four scored racks would. |
| 2 | Does the opponent have to confirm a typed result? | **No** (confirmed). It stands at once, marked "entered by Kenny". The opponent gets **Not right**, which flags it for the organiser to settle. | A bracket that waits on confirmations stalls a club night. This is how Challonge and Cuescore work. |
| 3 | Which formats first? | Single and double elimination. Round robin next (§9). | The ask. Round robin suits four to six players and is cheap to add after. |
| 4 | Double elimination's final | **One final.** A toggle offers "play a decider if the losers' side wins" (the bracket reset). | Most club nights play one final; purists want the reset. |
| 5 | Can guests (no phone) enter? | **Yes** (confirmed). The organiser picks them from their known guests or adds a new one, exactly as "Who's playing" does now, and enters their results. | A club night always has someone without the app. |
| 6 | How many players? | 3 to 32. | A phone shows 32 comfortably round by round; the document stays small. |
| 7 | Handicaps | **Off** in v1. Parked: Rack It's race chart per match (§9). | Keep the first version to a plain race. |

---

## 1. Concepts and words

| Concept | Definition |
|---|---|
| **Tournament** | One event: a game, a format, a race, its players, the draw and the results. |
| **Organiser** | Whoever started it. Runs the draw, may enter or correct any result, may play in it. |
| **Entrant** | A player in it: the organiser's friend, someone who scanned the Tournament QR, or a guest. |
| **Draw** | The seeded order of entrants, fixed when the organiser starts play. Everything else follows from it. |
| **Fixture** | One pairing in the bracket, with a key (`W1-1`, `L2-3`, `F`). Its players come from the draw and earlier results. |
| **Result** | A fixture's score in racks, e.g. 3–1, or a walkover. |
| **Bye** | A first-round fixture with one player, who goes through without playing. |
| **Winners' side / Losers' side** | Double elimination's two brackets. Lose once and you drop to the losers' side; lose twice and you're out. |

Words on screen: **tournament**, **draw**, **round**, **match** (a fixture reads as a match to
players), **race to 3**, **bye**, **walkover**, **Winners' side**, **Losers' side**, **Final**.
Never "bracket reset" (say "decider"), "fixture", "seed" (say "drawn 3rd"), "host" or "session".

## 2. What a tournament is set up with

Standard options, from what pool tournaments usually ask, and what v1 does with each:

| Option | v1 | Notes |
|---|---|---|
| **Game** | Trad-Eight or Trad-Nine | The two games where one rack is one rack, so a result is a race. The points games wait (§9). |
| **Format** | Single elimination · Double elimination | Round robin, groups then knockout, and Swiss are §9. |
| **Race** | Race to 1–15, default 3 | One number for the whole tournament, plus two optional overrides: **Losers' side** (often one shorter) and **Final** (often longer). |
| **Final** (double only) | One final · Decider if the losers' side wins | Decision 4. |
| **Third place** (single only) | Off · Play-off | Off by default. |
| **Draw** | Random · By rating | By rating puts the highest Zargo first and keeps the top two apart until the final. Guests and unrated players count as 500. **Redraw** until play starts. A manual order is §9. |
| **Byes** | Automatic | The bracket is the next power of two; the top of the draw gets the byes. |
| **Break** | Not set by the tournament | Players lag, as now. A match scored in Rack It asks as usual. |
| **Name** | "Kenny's tournament" by default, editable | 40 characters. |

Not in v1, and listed so nobody thinks they were forgotten: entry fees and prize splits, table
assignment, a schedule or clock, handicaps, late entry after the draw, teams and doubles.

## 3. The flow

### 3.1 Starting one (the organiser)

**Play** gains a **Tournaments** row above the Game card. It opens the Tournaments page: a card
for each tournament you organise or are in (newest first, live ones on top) and **Start a
tournament** (76px).

Start a tournament is one page, like match setup, defaults first:

1. **Name**, **Game**, **Format**, **Race** (and its folds: Losers' side, Final, Third place),
   **Draw**. Each a row on one settings card, as setup's Length and Handicap are.
2. **Who's in**: the same chips as "Who's playing" (`people.players()`): you, recent opponents,
   friends, guests, then **Show QR** and **+ Add a guest**. Tap to add, tap again to remove.
   No limit of two; a count reads "7 in". You are in by default; step yourself out to organise
   without playing.
3. **Open for entries** saves it (`status: "open"`) and shows the lobby.

### 3.2 The lobby (entries open)

The tournament's page while `open`: its settings in one line ("Trad-Eight · double elimination ·
race to 3"), the entrants as rows with avatars, and for the organiser:

- **Show QR**: the Tournament QR, "Join Kenny's tournament" (`connect.showQR` with
  `game: { id: "t_<id>", title }`, so the link is `…/rack-it/?g=t_<id>&i=<code>`). It stays up
  and says who joined ("Greg joined · 8 in"), as a Game QR does.
- **Add players**: the chips again, for friends and guests.
- A row's `⋯` → **Hold to remove**.
- **Draw and start** (76px), enabled from three entrants. It shows the draw first ("Round 1:
  Kenny v Greg, Mel v Rolf, Ann has a bye") with **Redraw** and **Start**. Start fixes the draw
  (`seeds`, `status: "live"`).

Settings stay editable until Start.

### 3.3 Joining (an entrant)

Scanning the Tournament QR opens Rack It, connects you to the organiser exactly as My QR does
(signed out: "Join Kenny's tournament", Sign in with Google), then adds you as an entrant and
shows the lobby: "You're in. Waiting for Kenny to start." A friend the organiser picked needs
no scan. Either way the tournament is a card at the top of Play from then on ("Kenny's
tournament · you're in"), as a match you're in is. There are no notifications; the card is the
invite.

Joining after the draw says "This tournament has started. Ask Kenny." (Late entry is §9.)

### 3.4 Playing: the tournament page (live)

On a phone a bracket tree is unreadable, so the page is **round by round**:

- **Your match**, on top, when you're an entrant with a fixture ready: "You v Greg · Winners'
  side, round 2 · race to 3", with **Enter the result** (76px) and **Score it in Rack It**. With
  nothing ready: "Waiting for Mel v Rolf", or "You're out · finished 5th", or "You won".
- **Rounds**: a segmented control of the rounds ("Round 1 · Quarter-finals · Semi-finals ·
  Final"), with **Winners' side | Losers' side** above it in double elimination. Each fixture is
  a row: both avatars and names, the score in large figures once it's in, the winner in the
  accent, and its state in words: "to play", "waiting for the winner of Mel v Rolf", "bye",
  "walkover", "entered by Greg", "Greg says not right".
- **Standings** once it's done (and a running "still in / out" list before): 1st, 2nd, 3rd,
  then ties by the round people went out in ("5th–6th").

It updates live on every phone in it (one watched document).

### 3.5 Results

Three ways a result gets in. All three write the same thing (§5).

1. **The organiser enters it.** Tap any fixture with both players known: two steppers, one a
   player, 0 to the race; **Save** is enabled when exactly one has reached the race. Also
   **Walkover to Kenny** / **Walkover to Greg** (the other didn't show or withdrew).
2. **A player enters their own** (Session 3). The same sheet, from **Your match**. It stands at
   once and reads "entered by Kenny" on every phone. The opponent's **Your match** card shows
   "Kenny entered 3–1 to Kenny" with **Not right**, which flags it: the row turns amber, "Greg
   says not right", and only the organiser can then change or clear it. A player can correct
   their own entry until the next match that depends on it has a result.
3. **Scored in Rack It** (Session 4). **Score it in Rack It** opens match setup with the game,
   both players and the race filled in and locked; the match carries `tournament` and `fixture`.
   When it's saved, its racks become the fixture's result with a link to the summary. The match
   is saved as a friendly with no confirm step, and no Rated tick is shown: like every
   tournament result it is rated when the tournament finishes (§3.7), so it must never be rated
   twice. The bracket moves on when the match is saved.

**Correcting.** The organiser may change or **Hold to clear** any result, unless a later fixture
that depends on it already has a result: clear that one first. This keeps the bracket honest
without a confirm step.

**Finishing.** When the last fixture has a result the tournament is `done` and the page leads
with the winner. The organiser's `⋯` has **Hold to end early** (done as it stands) and, in the
lobby, **Hold to discard**.

### 3.7 Ratings (decision 1, Session 3)

Every result between two accounts counts, typed or scored, apart from walkovers. They are
rated **together when the tournament finishes** (the last result, or Hold to end early), not one
by one as they come in. While it's live, results get changed, cleared and disputed (Not right);
rating at the finish means none of that ever has to be unpicked from the ratings. A discarded
tournament rates nothing.

- At the finish, each counted result becomes an ordinary rated match in `matches/` (game, both
  players, `racks` as `a` wins and `b` losses, `tournament`, `fixture`, `entered: true` when
  typed, `playedAt` from the result's `at`), so the Matches tab, Rebuild ratings and Export all
  see it with no new code. A result scored in Rack It (Session 4) already has its match: that
  match is marked rated instead of making a second one.
- Ratings then move as a confirmation does (§6.1 of the spec), in the order the results were
  entered, from the ratings as they stand at the finish, and the summary reads "rated as part of
  Kenny's tournament". Each of those matches gets `ratedAt` = the finish, so **Rebuild ratings
  replays them at the finish too**, never back where they were played.
- **Only the tournament's own games wait** (the owner, 2026-11-18). A match a player plays outside
  the tournament while it's live moves ratings as usual, at once; the tournament's results then
  start from those ratings when it finishes. Nothing about a rating is frozen during a tournament.
- **The open question for Session 3:** who may write the ratings. Today the opponent's phone
  writes both `ratings/` documents on Confirm. For a tournament it would be the organiser's
  phone writing everyone's, which needs a rule (a ratings write that names a `done` tournament
  you organised, and a match in it). If that rule proves too loose, the fallback is that the
  finish writes the rated matches and the ratings catch up at the owner's next **Rebuild
  ratings** (§3.2 of the spec), which already replays every rated match correctly.

### 3.6 Leaving and removing

Before the draw an entrant may leave (**Leave**), and the organiser may remove anyone. After the
draw nobody leaves the document: a player who goes home is walked over, match by match, by the
organiser.

## 4. The bracket (pure logic)

All of it lives in one browser-free module, `rack-it/bracket.js`, with `rack-it/bracket.test.mjs`
(`node --test`). **CLAUDE.md rule 1 allows one such module an app and Rack It has `zargo.js`:
Session 1 amends the rule to "its pure logic in modules beside `index.html`" in the same
commit, and adds `bracket.js` to `sw.js`'s shell.**

**The bracket is derived, never stored.** The document holds the draw (`seeds`) and the
results by fixture key. Who plays in every later fixture is worked out from those two, the same
way on every phone. So entering a result is one small write, two phones can't disagree about who
went through, and correcting a result fixes everything after it.

```js
import { build, state, standings, canClear, validResult } from "./bracket.js";

build({ format, n, final, third })     // → fixtures: [{ key, side: "W"|"L"|"F", round, slot,
                                       //     from: [src, src] }]   src: { seed: 3 } | { winner: key }
                                       //     | { loser: key } | { bye: true }
state(tournament)                      // → fixtures with players: [{ …, a, b, result, status }]
                                       //     status: "bye" | "waiting" | "ready" | "done"
standings(tournament)                  // → [{ id, place, placeTo }]  ("5th–6th": place 5, placeTo 6)
canClear(tournament, key)              // false while a fixture fed by it has a result
validResult(tournament, key, result)   // the race reached by exactly one side, or a walkover
draw(ids, { seeding, ratings, rand })  // → seeds; "rating": highest first; rand injectable for tests
```

Rules the module follows, each with tests:

- **Size.** The bracket has `2^k ≥ n` places. Seeds sit in the standard positions (1 v 16, 8 v 9,
  …) so the top of the draw meets late and byes go to seeds 1, 2, 3… in order.
- **Byes** resolve themselves: a fixture with one player is `bye` and its player is in the next
  fixture at once. A fixture both of whose feeders are empty is skipped entirely. This matters
  most on the losers' side, where first-round byes leave holes.
- **Single elimination.** Rounds named from the end: Final, Semi-finals, Quarter-finals, then
  "Round N". `third: true` adds `T`, the semi-finals' losers.
- **Double elimination.** The winners' side as above (`W<round>-<slot>`). Losers drop to
  `L<round>-<slot>` in the standard pattern: alternating rounds of losers' side survivors
  playing each other and playing the newest drops, with drops cross-seeded so a rematch comes
  as late as possible. `F` is the winners' side winner against the losers' side winner. With
  `final: "reset"`, `F2` exists only if the losers' side winner takes `F`.
- **The race** for a fixture: `race.f` for `F`, `F2` and `T` when set, else `race.l` on the
  losers' side when set, else `race.w`.
- **A result that doesn't fit is ignored**, not trusted: wrong players for that fixture (its
  `ids` don't match the derived pair), nobody at the race, both at the race. `state` reports it
  as `ignored` so the organiser's page can show and clear it. This is the safety net behind the
  rules (§6), which can't work the bracket out.
- **Standings.** Elimination places by the round a player went out in; 1st and 2nd from the
  final; 3rd from `T` when played, else shared.

Tests cover at least: every `n` from 3 to 32 in both formats builds, plays to the end with random
results and places everyone exactly once; byes at 3, 5, 6, 7 and 9; the reset final both ways;
a cleared result re-deriving later players; ignored results; `canClear`.

## 5. Data

`sidequests/rack-it/tournaments/<id>`, through `shared/cloud.js`. One document a tournament.

```
tournaments/<id>
  name
  game: "eight" | "standard"
  format: "single" | "double"
  final: "one" | "reset"            // double only
  third: true | false               // single only
  race: { w, l?, f? }               // racks; l and f only when they differ
  seeding: "random" | "rating"
  by: uid, byName                   // the organiser
  status: "open" | "live" | "done" | "discarded"
  createdAt, startedAt, endedAt
  players: [id, …]                  // entrants as shared/people.js gives them: a uid or g_<id>
  names: [name, …]                  // beside players, the names then (people.names)
  uids: [uid, …]                    // the accounts among them (people.uidsOf): who may read it
  seeds: [id, …] | null             // the draw; null until Draw and start
  results: {
    "<key>": {                      // "W1-1", "L2-3", "F", "F2", "T": no dots, they're field paths
      ids: [idA, idB]               // who played, as derived when it was entered
      a, b                          // racks
      w: "a" | "b"
      wo: true                      // a walkover (a and b are 0)
      by: uid, at: ms               // who entered it
      match: <matches id>           // scored in Rack It (Session 4)
      wrongBy: uid                  // the opponent's Not right (Session 3)
    }
  }
  venue: "sessions"                 // parked (§9): only the club's staff may set it
```

A match scored for a fixture is an ordinary `matches/<id>` with two more fields,
`tournament: <id>` and `fixture: <key>` (and `entered: true` for a typed result rated at the
finish, §3.7). Nothing else about a match changes.

- **Writes** are field-path patches (`cloud.patch`, `results.<key>`), so two results entered at
  once on two phones both land. No chain is needed: no write depends on another's value.
- **Lists.** A phone runs two queries, as Matches does for a scorer: `where uids
  array-contains me`, and `where by == me` (an organiser who isn't playing).
- **Export/Import** (rule 9): the owner's export gains `tournaments`; a player's export gains
  the ones they're in. Import merges by id.
- **Size.** 32 players in double elimination is 62 results of about 150 bytes: under 15 KB.

## 6. Rules (`shared/firestore.rules`, cases first in `shared/rules-check.mjs`)

A new block for `sidequests/rack-it/tournaments/{id}`, and its copy in `shared/cloud-memory.js`.
The owner reaches everything, as in the rest of Rack It.

| Who | May |
|---|---|
| Anyone signed in | **Create** one as `by`, `status: "open"`, `seeds: null`, no results, every account in `uids` being themselves or someone they're connected to (the same test as starting a match), at most 32 players. |
| The organiser (`by`) | Read it. Update anything except `by`. Delete it while `open`. |
| An entrant (in `uids`) | Read it; list with the `uids` filter. |
| The organiser's friend | **Get** it by id while `open` (never list): the Tournament QR, as a live match's Game QR. |
| The organiser's friend, joining | While `open`: add exactly their own uid to `players` and `uids` and one name to `names`, nothing else. Or take exactly themselves out again. |
| An entrant, entering a result (Session 3) | While `live`: change exactly one key of `results`, and only to an entry with `by` themselves and themselves in its `ids`; over nothing, or over an entry that was their own with no `wrongBy`. Or add only `wrongBy: <themselves>` to an entry they're in and didn't enter. |
| A player starting a fixture's match (Session 4) | Start a match carrying `tournament`, against another account in that tournament's `uids`, without being connected to them (`fixtureStarts()`, beside `outsiderStarts()`), and read the opponent's rating by id as now. |

**What the rules can't check, and what covers it.** They can't work out the bracket, so an
entrant could write a result for a fixture they aren't really in, or the wrong score. Three
things cover it: `bracket.js` ignores a result whose `ids` aren't that fixture's derived pair;
every result names who entered it; and the organiser can change or clear anything. That is the
same trust Rack It already gives a player scoring their own match.

Cases to write before the rules: each row above allowed; and refused: joining a `live` one,
adding someone else, a stranger reading, an entrant changing settings, `seeds` or two results at
once, overwriting the organiser's or the opponent's result, clearing a `wrongBy`, anyone but the
organiser deleting, signed out anything.

## 7. Fitting the app and the look

- Build from `shared/theme.css` and `shared/ui.js` parts (rows, chips, sheets, `ui.hold`,
  `.resume` cards, segmented controls). CSS only for the fixture row and the stepper.
- 18px base, nothing under 15px (caps labels 14px), targets 60px, the main button 76px, dark,
  taps on `pointerup`, nothing destructive on a plain tap.
- People are `people.avatar(id, size)`. Teal and lilac stay the two sides of a match; in a
  fixture row neither player is coloured, and the winner is marked by weight and a tick, with
  the accent only on the score.
- Check at 390×844 and 360×640: a fixture row with two long names, a 32-player round 1 (16
  rows, scrolls), the result sheet with the keyboard down (steppers, not typing).
- `?mock` proof (`shared/proofs/rack-it-tournament.mjs`): the owner starts one, Ann and Ben join
  by QR link, a guest is added, the draw, results entered by the organiser and by Ann, Ben's Not
  right, a clear, the final, standings; no page errors.

## 8. The sessions

Each ends deployed, with `make verify` green, `APP_VERSION` and `CACHE` bumped together, the
spec updated, and a handover note below.

### Session 1 — the bracket module (no change on screen)

- [x] `rack-it/bracket.js` and `bracket.test.mjs` as §4; CLAUDE.md rule 1 amended; `sw.js` shell.
- [x] Single and double elimination, byes, both finals, third place, races, standings,
      `canClear`, `validResult`, `draw`.
- [x] The property test: every size 3–32, both formats, random results, everyone placed once.

### Session 2 — a tournament the organiser runs (a minor version)

- [ ] The rules block, its cases and the mock's copy, for create, read, join and the organiser.
- [ ] Tournaments row on Play, the Tournaments page, Start a tournament, the lobby.
- [ ] The Tournament QR (`?g=t_<id>`), joining, the "you're in" card on Play.
- [ ] Draw and start; the round-by-round page; the organiser enters, corrects and clears
      results and walkovers; done and standings; end early; discard.
- [ ] Export and Import; the `?mock` proof; `rack-it/SPEC.md` gains a Tournaments section.

A club night can run on this session alone.

### Session 3 — players enter their own results, and ratings

- [ ] Ratings at the finish (§3.7): the rated matches, the ratings write and its rule cases,
      "rated as part of Kenny's tournament". Settle the open question there first.
- [ ] The entrant's rule rows and cases; **Your match** with **Enter the result**; "entered by";
      **Not right** and the organiser settling it; a player correcting their own.
- [ ] The proof grows: two players' phones, a dispute, a stale entry ignored.

### Session 4 — score it in Rack It

- [ ] `fixtureStarts()` and its cases; match setup opened from a fixture, filled and locked;
      a player who isn't a friend shown from the tournament's `names` (the setup and summary
      already read `names` from the match; the picker and `people.resolve` must not be needed).
- [ ] The saved match's racks become the result, linked; the summary says "Kenny's tournament ·
      Winners' side, round 2" with **Back to the tournament**.
- [ ] No Rated tick and no confirm (it's rated at the finish, §3.7, by marking this match rated);
      a discarded match leaves the fixture to play.

This is the riskiest session: it touches the live screen's start and the match rules. Read
`shared/proofs/table-session.mjs` first; the club match link (`?club=`) is the nearest thing
already built.

## 9. Parked (in rough order of wanting)

- **Round robin**, then **groups into a knockout**: `build` gains a format; standings by wins,
  then rack difference, then the match between them.
- **Handicapped races**: Rack It's race chart per fixture from the two ratings (spec §4).
- **The points games** (11-Point-Nine, Golden-Nine, Ten-Point-Eight): a fixture decided by a
  match in Rack It only, since their results aren't a race in racks.
- **At the club**: `venue: "sessions"` set by staff from the loyalty app, points for entering
  and for placing, a tournament QR on the club's screen.
- A manual draw order; late entry after the draw (into a bye); Swiss; table assignment; entry
  fees and a prize split; a guest taking their place by QR ("Which one are you?", as Game QR
  seats); doubles; a public read-only page for spectators; darts (501 legs) once Sessions has it.

## 10. Handover

(Each session writes its note here: what shipped, at which version, what it left.)

### Session 1 — 2.27.2, 2026-11-18

**Shipped.** `rack-it/bracket.js` and `rack-it/bracket.test.mjs` (18 tests; `make verify` green).
Nothing on screen changes; `sw.js` caches the module so Session 2 works offline from day one.
CLAUDE.md rule 1 now allows an app's pure logic in *modules* (each tested, each in the shell).

**The API, as built** (§4, plus three small extras Session 2 will want):

- `state(t)` leaves out fixtures that are skipped entirely (both feeders empty) and leaves out
  `F2` until the losers' side winner takes `F`. Each fixture carries `name` (the round's words),
  `race`, `a`, `b` (an id, or null while unknown or for a bye's missing side), `result`,
  `status` (`bye` · `waiting` · `ready` · `done`), `winner`, `loser`, and `ignored` (the stored
  result) when a result is there but doesn't fit. Before the draw (`seeds: null`) every fixture
  is `waiting` with no players, so the lobby could show the shape.
- Extras: `finished(t)` (every fixture done or a bye), `ignored(t)` (the keys being ignored,
  including a decider nobody needs), `raceFor(t, fixture)`, `positions(size)`.
- `standings(t)` lists every entrant: `place`/`placeTo` once they're out (known the moment they
  lose, since byes depend only on n), `null` while still in, still-in first.
- `canClear(t, key)` is false with no result to clear; true for an ignored result; otherwise
  walks everything downstream (through byes) and refuses if any of it has a result. Use it for
  **changing** a result as well as clearing one.
- `validResult` wants `ids` in the derived order (`[a, b]`) and `w` to agree with the score.

**Round names.** Single: Final, Semi-finals, Quarter-finals, Round N. Double: Round N on both
sides, then "Winners' side final", "Losers' side final", "Final", "Decider"; "Third place" for
`T`. Session 2 may rename; they're one function each.

**Cross-seeding.** Drops come reversed, then halves swapped, then straight, repeating. A test
proves the first drop never pairs you with the player who just beat you (8 and up); at 4 it's
unavoidable. Later rounds aren't proven rematch-free, only "as late as the pattern allows".

**Left for Session 2.** The owner settled decisions 1, 2 and 5 after this session (§0): every
tournament result is rated, at the finish (§3.7, built in Session 3); no confirm step; guests
from the known guests or added new. Session 2 is unchanged by them and starts with the rules
cases (§6).
