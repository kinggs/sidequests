# Rack It: tournaments — spec and build plan

A tournament in Rack It: one person starts it, picks the format, fills it from their friends or
with a QR, and the bracket runs itself as results come in. The organiser can enter every result;
players can enter their own. It reuses what Rack It has: the same accounts, the same QR, the same
players, the same matches and ratings.

**Status:** Sessions 1 to 7 done (2.33.0, 2026-11-19): every session in §8, round robin (§3.9) and
groups into a knockout (§3.10); 2.33.1 (2026-11-20) fixed single elimination's Final race;
Session 8 (2.34.0, 2026-11-20) built handicapped races (§3.11). What's next is §9.
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
| 3 | Which formats first? | Single and double elimination; round robin added in Session 6 (§3.9). | The ask. Round robin suits four to six players and is cheap to add after. |
| 4 | Double elimination's final | **One final.** A toggle offers "play a decider if the losers' side wins" (the bracket reset). | Most club nights play one final; purists want the reset. |
| 5 | Can guests (no phone) enter? | **Yes** (confirmed). The organiser picks them from their known guests or adds a new one, exactly as "Who's playing" does now, and enters their results. | A club night always has someone without the app. |
| 6 | How many players? | 3 to 32. | A phone shows 32 comfortably round by round; the document stays small. |
| 7 | Handicaps | **Off** in v1. Then (the owner, 2026-11-20): a tournament-wide **Race chart** switch, ratings frozen at Start, the underdog's race shorter, two targets (§3.11, built in Session 8, 2.34.0). | Keep the first version to a plain race. |

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
| **Format** | Single elimination · Double elimination · Round robin (3 to 12, §3.9) · Groups, then a knockout (6 to 32, §3.10) | Swiss is §9. |
| **Race** | Race to 1–15, default 3 | One number for the whole tournament, plus two optional overrides: **Losers' side** (often one shorter) and **Final** (often longer). |
| **Handicap** (Session 8) | Off · Race chart | §3.11: from the ratings frozen at Start; the favourite races to the set race. |
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

(Session 5 replaces the round list with **Your path** and **Whole draw**, §3.8. This section
stays as the record of what Sessions 2 to 4 ship, and of why a tree was ruled out.)

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
- **Who writes the ratings (settled in Session 3): the organiser's phone.** It claims the finish
  once (`ratedAt`, `ratedBy`), then writes each rated match with its two ratings in one batch,
  within a day of the claim. The rule is no looser than Confirm's, where the confirming phone
  writes both players' numbers unchecked; the one claim stops two phones rating it twice, and
  the day bounds it. The fallback (matches only, ratings at the owner's next Rebuild) wasn't
  needed. A disputed result holds the finish until the organiser settles it, so nothing
  disputed is ever rated. Once rated, the results are fixed (the owner can still delete a match
  and Rebuild).

### 3.6 Leaving and removing

Before the draw an entrant may leave (**Leave**), and the organiser may remove anyone. After the
draw nobody leaves the document: a player who goes home is walked over, match by match, by the
organiser.

### 3.8 The bracket view: Your path, then the whole draw (designed 2026-11-19, Session 5)

**Why.** §3.4's round list says who plays whom, but not who goes where next: you can't follow
a winner into the next round, and "the whole tournament at a glance" is missing. Three ways to
fit a tree on a phone were drawn at 8 and 32 players, single and double:

| Option | Verdict |
| --- | --- |
| A. One canvas, drag and pinch, Jump to my match | Fine at 8. At 32, fit-to-screen is 24%, so a 17px name is 4px; zoomed in you see five matches of 31. Pinching needs two hands; one holds a cue. Double elimination needs a mini-map. |
| B. Landscape full draw | Only 8 players, single elimination, fits. The manifest is portrait (rule 6), 360px of height drops the state words, and 32 still scrolls both ways. |
| **C. Your path, then the draw** | **Chosen.** The same size and words at 3 players or 32, single or double. Costs: you never see every match at once, and round 1 of 32 is 16 cards down. |

The drawings are in `rack-it/design/bracket/` (`00-overview.png` first; `07` to `09` are the
option boards). This section wins over the PNGs. The live canvas is the owner's, at
`claude.ai/artifact/Vd6j2FbbH5FPREU8Th6FBK` (private).

**Two views.** A `.seg` under the tournament's line: **Your path | Whole draw**. It opens on
Your path when you're an entrant, on Whole draw otherwise, and remembers the choice in
`tourView`. The standings list stays under both.

**Your path** (`01`, `05`) replaces the **Your match** card. It answers the first question a
player has: who do I play, and who's next?

- One step for each match you've been in, top to bottom, then the one you're in, then **one**
  step ahead, labelled "if you win". No "if you lose" branch: the sheet says where the loser
  goes, and a second line would make the path a tree again.
- A step is a caps title ("Quarter-final", or "Losers' side · round 2" in double elimination)
  over the match card. Its dot is filled for played, the accent for now, hollow for ahead.
- The step you're in carries **Enter the result** (76px) for whoever may enter it
  (`mayEnter()`, Session 3); otherwise "Kenny enters the result".
- Dropping to the losers' side is just the next step. Nothing announces it.
- It ends "You're out · finished 5th–6th" or "You won". It opens scrolled to the step you're in.

**Whole draw** (`02`, `06`) replaces the round buttons.

- **One round across the screen, the next peeking in** by about 90px from the right, joined to
  it by lines. That peek and its lines are what say who goes where.
- A round row replaces the round `.seg`: `‹` and `›` (60px each) either side of "Round 1 of 4"
  with "then the quarter-finals" under it. Swiping sideways does the same. (This retires
  Session 2's number buttons past four rounds; the row names the round in full instead.)
- In double elimination the side `.seg` stays as it is, two buttons, with the Final and the
  Decider closing the Winners' side. The Decider's card reads "decider · if needed".
- A next-round card sits midway between its two feeders where the round halves, and level
  with its one feeder where it doesn't (the losers' side rounds that take a drop-in).
- Lines are 2px in a quiet grey. The line from your match to your next one is the accent:
  your route is the app's data.
- **Your match**, a floating button with your avatar, shows whenever your match is off screen
  and brings the draw back to it. After a result is saved the draw moves to the next match to
  play, as now.
- A third-place match is a last column after the Final, with no lines into it.

**The match card** is the same in both views (`00-overview.png` shows every state):

- A caps label, then a row a player: `people.avatar`, the name, and the score in Grotesk.
- Words: "played", "to play" (the accent), "waiting", "bye", "walkover". Your own match to
  play reads "to play · you" and is the only card with an accent outline.
- The winner is bold with a tick; the winning score is the accent, the losing score dim.
- An unknown player is `slotWords()` as now ("Winner of Mel v Rolf") beside a dashed circle.
  A bye's empty row reads "No opponent".
- "Waiting" is dim, not `--warn`: most of a draw is waiting, and amber on all of it would be
  noise. `--warn` stays for "Greg says not right" and a result that no longer fits.
- "entered by Greg" moves off the card into the sheet; the card is narrower than the old row.

**Tapping a match** (`03`, `04`). Today only the organiser can tap a row. Now anyone can:

- A sheet rises: the round and race, both players with how each got here ("beat Greg 3–1"),
  the score or the state, then two lines: **The winner plays** … and **The loser** … ("is out,
  3rd–4th", or "drops to the Losers' side, round 2").
- **The winner plays** is a row. Tapping it closes the sheet, moves the draw to that match and
  pulses it once. Tapping a "Winner of Mel v Rolf" name on a card goes back to that match the
  same way.
- Whoever may enter the result gets **Enter the result** and **Score it in Rack It** (Session
  4); on a played match, the score large, "entered by Greg", **Change** and **Hold to clear**.
  Everyone else reads.
- A waiting match says what it waits for ("Waiting for Lisa v Bev", one tap away). A bye has
  no sheet.
- **Settled in Session 5, as recommended:** for someone who may enter a match that's ready,
  tapping it opens the steppers sheet directly, with the two where-next lines at its top. Every
  other tap opens the read sheet, which carries **Change**, **Hold to clear** and **Not right**
  for whoever may use them.

**Pure logic first.** `bracket.js` gains, with tests:

- `B.next(t, key)` → `{ winner, loser }`: the keys this match feeds (or `null`), read from the
  fixtures' `from`. The sheet's two lines and the draw's connectors both come from it.
- `B.path(t, id)` → that player's fixtures in order: played, the one they're in, and the one
  `next().winner` leads to. Cases: a bye first, double elimination after a loss, out, won.

**Building it.** Columns sit in one horizontal scroll-snap row, each the page's width less the
peek; the page still scrolls down. Card height is fixed in `rem` (about 5.4rem), so line
positions are worked out, not measured, and a phone set to huge text still lines up. Lines are
plain positioned elements. CSS only for the card, the lines, the path's rail and the round row
(§7). The pulse and the smooth scroll are off under `prefers-reduced-motion`.

**Not doing:** pinch-zoom, a landscape layout, a mini-map. The table above is why.

### 3.9 Round robin (Session 6, 2.32.0)

Everyone plays everyone once. The defaults the build took, each easy to change:

- **3 to 12 players** (`B.ROBIN_MAX`): 12 is 66 matches, a long club night already. Start and
  the lobby say so and offer an elimination format past it; joining by QR stops at 12.
- **The schedule** is fixed by the draw with the circle method: the first in the draw stays put,
  the rest turn a place a round, so nobody plays twice in a round. An odd number means one player
  sits out each round, once each; the draw sheet says who sits out round 1. There are no bye
  matches. Keys `R<round>-<slot>`, side `"R"`, all ready from the start.
- **The table**, from the first result: wins, then rack difference (a walkover is a win with no
  racks), then the match between exactly two still level. Three or more level, or two who
  haven't met, share the place ("2nd–3rd"). Each row reads "2 won · 1 lost · +3 racks".
- **Settings** lose Final, Third place and the final's race: none of them apply. Draw by rating
  still orders the schedule.
- **The page** is the same two views: Your path lists your played matches, then the first still
  to play ("now") and the one after ("next", not "if you win"). The whole draw is a round a
  column with no lines, since no match feeds another. The match sheet has no where-next lines.
  It finishes, and rates, like the others; "Ann and Ben share first" if the top is level.

Not done: Swiss (§9).

### 3.10 Groups, then a knockout (Session 7, 2.33.0)

Round robin groups, whose top two go into a single elimination knockout. Defaults the build took:

- **6 to 32 players; 2, 4 or 8 groups** (`B.groupCount`): 2 up to 12 players, 4 up to 24, 8
  beyond, so a group is 3 to 6 and the knockout is 4, 8 or 16 with no byes. Start and the lobby
  say "2 groups of 3, then a knockout of 4".
- **The groups come from the draw in a snake** (A B C D D C B A …), so by rating the top of the
  draw is spread across them. The draw sheet lists each group rather than round 1.
- **Two go through from each group**, by its table (§3.9's order). A tie the table can't split
  goes to whoever is higher in the draw: deterministic, and easy to change to a lag or a
  play-off. A group's qualifiers are known only once every match in it is played.
- **The knockout's first round** puts each group's winner against another group's runner-up,
  and a group's two in opposite halves, so they can meet only in the final. Its matches name
  where their players come from ("Winner of group A", "Runner-up of group B").
- **Settings:** Third place (in the knockout) and the Final's race apply; the Final's race is
  the knockout's final. That last part exposed a bug in single elimination, below (fixed in 2.33.1).
- **Changing a group result** is blocked once a knockout match it decides has a result (clear
  that first), as `canClear` does for any later match.
- **Places:** the knockout's as single elimination, then everyone out in the groups by where
  they finished in their group (all the groups' 3rds sharing the next places, then the 4ths).
- **The page:** the whole draw gets **Groups | Knockout** (a group a column, then the knockout's
  rounds); each group's table sits above the standings, with "through" in the accent once it's
  done. Your path is your group's matches (now, next), then the knockout once you're through.

**Found on the way, fixed in 2.33.1:** in single elimination the Final's race override was
offered in settings, and shown on the tournament ("race to 3 · final 5"), but never used:
`raceFor` gave `race.f` only to `F`, `F2` and `T`, and a single elimination final is `W<k>-1`.
Session 7 left it, because fixing it alone would make an already-entered single elimination
final "not fit" if its race differed, and drop it. 2.33.1 gives `race.f` to any fixture named
"Final", and keeps the old results: `oldRace` lets a stored `W…` final count at `race.w` too.
A new entry plays to `race.f` (`validResult`), so the allowance only reads what's there. The
groups knockout's final (`K…`) never played to `race.w`, so it gets no allowance.

### 3.11 Handicapped races (designed 2026-11-20, Session 8)

A tournament-wide switch: every match is a race in racks with Rack It's race chart (spec §4),
from the two players' ratings. The owner settled the four questions on 2026-11-20, each as
recommended:

| Question | Answer | Why |
|---|---|---|
| When is a match's handicap fixed? | **At Draw and start.** Each entrant's rating is frozen into the tournament. | Every phone works out the same targets from the document alone, with no ratings to read (an opponent may be no friend). Targets never shift under a match being played, so a result once entered keeps fitting. Ratings move during a tournament (§3.7), so live ratings would. |
| A player with no rating? | **500**, as Draw by rating does, **shown at the draw.** | The draw sheet lists every frozen number, so the organiser sees a wrong one and fixes the guest's estimate (Players) before Start. |
| Which race does the chart shorten? | **The underdog's.** The higher-rated player races to the set race, the other to `raceChart`'s target. | Rack It's chart as it stands (`zargo.js`), no new function. "Race to 3" still means the longest race anyone plays. |
| Two targets or a head start? | **Two targets only**, never a head start. | A result stays racks actually won: the steppers, the stored result, a scored match's racks and the rating all use the same two numbers. |

**Settings.** Start's settings card gains **Handicap**, under Race: **Off** (the default) ·
**Race chart** ("from the ratings at the start"). One switch for the whole tournament, with no
per-match override. It stays editable until Start, as every setting is, and works with every
format. The race and its folds (Losers' side, Final) still set the favourite's race in each
match. The tournament's line reads "Trad-Eight · double elimination · race to 3 · handicapped".

**Freezing.** Start writes `zargos: { "<id>": 612, … }` beside `seeds`: every entrant, rounded,
from `statsOf()` on the organiser's phone (the same numbers Draw by rating uses), 500 for anyone
without one. A Redraw reads them again; after Start they never change. With the handicap on, the
draw sheet shows each entrant's number ("Greg 498", "Ann 500 · no rating yet") and round 1's
targets ("Kenny 5 v Greg 3").

**The targets** (`bracket.js`). `raceFor(t, f)` is unchanged: the set race for that match.
`derive` gives every fixture with both players known `targets: { a, b }`, in the fixture's own
order:

- handicap off: `{ a: race, b: race }`;
- on: `raceChart(expectedShareA(za, zb), race)` from the two frozen ratings, imported from
  `./zargo.js`. Equal ratings come out level.
- A fixture still waiting has `targets: null`.

`fits(r, a, b, ta, tb)` takes the two targets: each side between 0 and its own target, exactly
one side at its own target, and `w` that side. **Results already stored keep fitting**: with the
handicap off both targets are the race, so every check is the one made today, and a tournament
with no `handicap` field is off. `oldRace` (2.33.1's allowance) applies only with the handicap
off; no handicapped tournament predates it. `validResult` checks against `targets`.

**The result shape doesn't change**: `{ ids, a, b, w, wo }`, racks won. The targets are derived
from the frozen ratings, never stored on the result, so there is one source and nothing to drift.
A walkover stays 0–0.

**On screen.** Every reader of `f.race` in `index.html` moves to `f.targets` (14 places today:
`grep -n 'f\.race\|\.race\b'`).

- **The steppers sheet**: each stepper runs 0 to its own player's target. The hint reads "Kenny
  races to 5, Greg to 3. Racks each, then Save." Save reads "First to 5 v 3" until exactly one
  player is at their own target, then "Save · 5–2".
- **The match sheet** (the read sheet's caps line): "Race to 5 v 3" where it said "Race to 3".
  Level targets read as before. (The match card never showed the race, so it is unchanged.)
- "Nobody reached 3" (a scored match nobody won) says "their target" when the two differ.

**Score it in Rack It.** `scoreFixture` puts the fixture's targets on `setup.tour` and sets
`setup.handicap = "racks"`, `mode: "race"`, `raceTo` the longer target, with those exact targets.
`proposeTargets()` must not recompute them from today's ratings while `setup.tour` holds targets:
the frozen ones win. The setup card reads "Kenny's tournament · Final · Trad-Eight · race to 5 v 3
· handicapped · rated when it finishes" (or "no handicap" when off). The live screen already plays
a race in racks with two targets. `resultFromMatch` counts the racks each side won, as now, and
`validResult` checks them against the targets. A match ended before anyone reached their own
target isn't a result, as now.

**Ratings at the finish.** Nothing about the rating changes. Spec §3: "Handicap never enters the
update. The racks are what happened." Zargo rates each rack 1 or 0 at weight 0.5, so a
handicapped 5–2 rates exactly as a level 5–2. `rateResult` keeps its synthetic racks; the match it
writes says what was played: `handicap: "racks"`, `targets: { a: ta, b: tb }` (today: `"off"`, the
race twice), so its summary reads "race to 5 v 3". A scored match already carries both.

**Round robin and groups tables.** Unchanged: wins, then rack difference. ⚠ With a handicap,
rack difference leans on the targets (a favourite winning 5–1 is +4; an underdog winning 3–0 is
+3). It is only a tie-break after wins, so it stays. If it looks wrong on a club night, the next
step is the match between the two, then a shared place.

**Rules: no change.** `handicap` and `zargos` are written by the organiser, who may change any
field but `by` (`tourOrganises()`), and only before Start, which the app enforces as it does for
every setting. A result's keys don't change, so `tourOwnEntry`'s list stands. `tourRated`,
`tourMarks` and `fixtureStarts` don't read a match's handicap or targets. The existing case
"an entrant changing settings" covers an entrant writing `zargos`. No new cases.

**Not doing:** a per-match override; a head start; ratings read live when a match is ready;
handicaps for the points games (they aren't in tournaments yet, §9).

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
  losers' side when set, else `race.w`. (2.33.1: `race.f` for any match named "Final". Session
  8: with the handicap on, each side gets its own target from that race, §3.11.)
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
  handicap: "racks" | "off"         // Session 8 (§3.11); missing = off
  zargos: { "<id>": 612, … }        // Session 8: every entrant's rating, frozen at Start (500 if none)
  seeding: "random" | "rating"
  by: uid, byName                   // the organiser
  status: "open" | "live" | "done"  // Hold to discard deletes an open one (Session 2)
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
| An entrant, entering a result (Session 3) | While `live`: change exactly one key of `results`, the one the write names in `entry` (a rule can't list a map's changed keys), and only to an entry with `by` themselves and themselves in its `ids`, no walkover; over nothing, or over an entry that was their own with no `wrongBy`. Or add only `wrongBy: <themselves>` to an entry they're in and didn't enter. |
| The organiser, marking a scored match (Session 4) | Within a day of their claim: turn a done friendly carrying `tournament` and `fixture` rated, changing only `rated`, `ratedAt`, `zargoBefore` and `zargoAfter`, when that fixture's result names it (`match`) between the same two accounts (`tourMarks()`). |
| The organiser, at the finish (Session 3) | Claim it once: `live` to `done` with `ratedAt` (within an hour of now) and `ratedBy` themselves. After that only `name` and the `rated` note change, and `rated` only grows. Within a day of the claim, the claimer creates `matches/tour_<id>_<key>` for a counted result and writes the two players' `ratings/` naming it. |
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

- [x] The rules block, its cases and the mock's copy, for create, read, join and the organiser.
- [x] Tournaments row on Play, the Tournaments page, Start a tournament, the lobby.
- [x] The Tournament QR (`?g=t_<id>`), joining, the "you're in" card on Play.
- [x] Draw and start; the round-by-round page; the organiser enters, corrects and clears
      results and walkovers; done and standings; end early; discard.
- [x] Export and Import; the `?mock` proof; `rack-it/SPEC.md` gains a Tournaments section.

A club night can run on this session alone.

### Session 3 — players enter their own results, and ratings

- [x] Ratings at the finish (§3.7): the rated matches, the ratings write and its rule cases,
      "rated as part of Kenny's tournament". Settle the open question there first.
- [x] The entrant's rule rows and cases; **Your match** with **Enter the result**; "entered by";
      **Not right** and the organiser settling it; a player correcting their own.
- [x] The proof grows: two players' phones, a dispute, a stale entry ignored.

### Session 4 — score it in Rack It

- [x] `fixtureStarts()` and its cases; match setup opened from a fixture, filled and locked;
      a player who isn't a friend shown from the tournament's `names` (the setup and summary
      already read `names` from the match; the picker and `people.resolve` must not be needed).
- [x] The saved match's racks become the result, linked; the summary says "Kenny's tournament ·
      Winners' side, round 2" with **Back to the tournament**.
- [x] No Rated tick and no confirm (it's rated at the finish, §3.7, by marking this match rated);
      a discarded match leaves the fixture to play.

This is the riskiest session: it touches the live screen's start and the match rules. Read
`shared/proofs/table-session.mjs` first; the club match link (`?club=`) is the nearest thing
already built.

### Session 5 — the bracket view: Your path and the whole draw (a minor version)

The design is §3.8; read it and look at `rack-it/design/bracket/` first. It depends only on
Session 2, so it can come before Sessions 3 and 4.

- [x] `B.next` and `B.path` in `bracket.js`, with their tests.
- [x] The match card, replacing `fixtureRow()`'s `.fx` row; every state in §3.8.
- [x] **Your path | Whole draw**; Your path replacing the **Your match** card in
      `paintBracket()`.
- [x] Whole draw: the round row, the swipe, the peeking column, the lines, your route in the
      accent, the **Your match** button. The round `.seg` goes.
- [x] The match sheet for everyone, with the where-next lines and the jump. Settle §3.8's open
      point on the organiser's extra tap first.
- [x] Check at 360×640 and 390×844: 3, 8, 13 and 32 players, both formats, two long names, the
      phone's text size at its largest, reduced motion.
- [x] The `?mock` proof grows: an entrant opens on Your path, an organiser who isn't playing
      on Whole draw; the winner-plays jump; the draw moving on after a save.
- [x] `rack-it/SPEC.md`'s Tournaments section updated; §3.4 here left as the record.

### Session 6 — round robin (a minor version)

Not in the first plan: §9's first item, asked for on 2026-11-19. Design in §3.9.

- [x] `build({ format: "robin" })`, `sitsOut`, the table in `standings`, `next` and `path` for
      it, with tests; `ROBIN_MAX`.
- [x] Start and the lobby offer it, cap it at 12, and drop the elimination rows; the draw sheet.
- [x] The table, Your path's "next", the draw without lines, no where-next lines.
- [x] The proofs grow: a 4-player round robin played out; round robin at 3, 8 and 12 in the sizes.

### Session 7 — groups, then a knockout (a minor version)

§9's next item, asked for on 2026-11-19. Design in §3.10.

- [x] `build({ format: "groups" })`, `groupCount`, `groups(t)`, qualifiers as a `{ qual }`
      source, the knockout's crossover, places, `canClear`, `next` and `path` for it, with tests.
- [x] Start, the lobby and the draw sheet offer it; **Groups | Knockout**; the group tables.
- [x] The proofs grow: six players through two groups and a knockout; groups at 6, 13 and 32.

### Session 8 — handicapped races (a minor version, 2.34.0)

§9's first item, asked for on 2026-11-20. Design in §3.11. No rules change. Don't run
`make verify` while another session works in `pocket-instruments/`; run `node --test`,
`node shared/smoke.mjs` and the `shared/proofs/rack-it-*.mjs` proofs instead.
(Note, 2026-11-26: Pocket Instruments has since left for its own repository, and `make verify`
no longer builds it. The line above is as it was written.)

- [x] `bracket.js`: `targets` on each fixture from `handicap` and `zargos` (importing
      `raceChart` and `expectedShareA` from `./zargo.js`), `fits` with two targets,
      `validResult` against them, `oldRace` only when off. Tests first: level targets when off
      (every existing test still green, unchanged); a favourite as `a` and as `b`; equal ratings
      level; a missing rating at 500; a result fitting the targets but not the plain race, and
      the other way round; the 2.33.1 final allowance off when handicapped; the property test at
      every size and format with the handicap on and random ratings, played to the end.
- [x] Start and the lobby: the **Handicap** row, the tournament line "· handicapped".
- [x] Draw and start: `zargos` written with `seeds`; the draw sheet's numbers, "no rating yet"
      and round 1's targets.
- [x] Every `f.race` reader to `f.targets`: the steppers sheet, the match sheet and card, Your
      path, the stale-result and "Nobody reached" words.
- [x] Score it in Rack It: `setup.tour.targets`, `handicap: "racks"`, `proposeTargets()` leaving
      the frozen targets alone, the setup card's words.
- [x] `rateResult`: `handicap: "racks"` and the targets on the match it writes.
- [x] Proofs: `rack-it-tournament.mjs` grows a handicapped tournament (starter ratings set far
      enough apart for uneven targets: 650 against 450 is 3 v 1 at race to 3): the draw sheet's numbers and
      targets; a typed result fitting the targets that wouldn't fit the plain race; a scored
      match locked to the targets; the finish rating it as racks. `rack-it-bracket-sizes.mjs` at
      8 and 32 with the handicap on (the caps label "race to 5 v 3" at 360px, largest text).
- [x] `rack-it/SPEC.md` §5.1 gains the handicap; §0 decision 7 and §9 here updated; a handover
      note.

## 9. Parked (in rough order of wanting)

- ~~Handicapped races~~: designed in §3.11, built in Session 8.
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

### Session 2 — 2.28.0, 2026-11-18

**Shipped.** A club night runs on it: Play's Tournaments row and cards, the Tournaments page,
Start a tournament, the lobby, the Tournament QR and joining, Draw and start (with Redraw), the
round-by-round page, the organiser entering, changing and clearing results and walkovers, done
with standings, Hold to end early and Hold to discard. Export and Import carry `tournaments`.
`rack-it/SPEC.md` §5.1 is the as-built description.

**Rules** (`shared/firestore.rules`, cases in `shared/rules-check.mjs`, copy in
`shared/cloud-memory.js`). All 284 cases pass on the emulator, run in this session (Java is in
the cloud container: `npm i --no-save @firebase/rules-unit-testing firebase firebase-tools`,
then the command at the top of `rules-check.mjs`). Two things differ from §6's table:

- **A new tournament holds only its organiser as an account** (or nobody). A rule can't check
  32 friendships in one write (it may make 10 lookups), so the app saves the tournament and then
  adds each friend with a write of its own, in order; `tourOrganises()` lets an organiser's
  write add one account at a time, the last in `uids`, someone they're connected to.
- **Discard deletes it** instead of a `discarded` status: nothing is lost (it never started) and
  nobody's lists fill with dead lobbies.

**Choices made on the way** (change freely):

- The final and a decider close the **winners' side's** rounds ("Round 1 · Side final · Final"),
  so the side switch is two buttons that fit a 360px phone. Past four rounds the round buttons
  are numbers, with the full name as the heading under them.
- After the organiser saves a result, the page moves to the next match waiting to be played.
  A side opens on its round with a match to play.
- `bracket.js` gained `empty` on each fixture (which side is a bye's hole for good), so a row says
  "bye" rather than "Winner of …" for a slot nobody will fill. Tested.
- A Tournament QR is a Game QR with id `t_<id>`; `shared/connect.js` says "tournament" instead of
  "match" for those ids.
- The lobby puts **who's in** first (with Show QR and Add players), the settings card under it:
  on a phone the six settings rows would otherwise hide the people. Play shows two tournament
  cards at most, so match setup stays in reach.
- Everyone sees **Your match** (or what they wait for, or where they finished). In this version
  only the organiser has **Enter the result** on it; others read "Kenny enters the result".

**Proof.** `node shared/proofs/rack-it-tournament.mjs`: 40 checks, a random draw each run (run
ten times here, all green, about 30 seconds each). Screenshots go to `SHOTS`. A proof with several
tabs must `bringToFront()` the one that acts: Chromium starves background tabs of animation
frames, and every click there waits seconds for "stable" (this one took 3 minutes without it).
Checked by eye at 360×640 and 390×844 with 32 players and two long names.

**Left for Session 3** (players enter their own results, and ratings at the finish, §3.7):
the entrant's result rule rows (§6), **Enter the result** on Your match for entrants, "entered by",
**Not right**, and the rated matches written at the finish. `openResult()` in `index.html` is the
sheet to reuse; `runsTour()` is where "may enter this result" widens.

### Session 3 — 2.29.0, 2026-11-19

**Shipped.** Players enter their own results (Your match's **Enter the result**, or their match's
row), change their own until it's disputed or a later match depends on it, and say **Not right**
to one they didn't enter. The organiser gets a **Settle** card for each: **It stands**, change
it, or clear it. The finish rates the tournament (§3.7): each result between two accounts that
isn't a walkover becomes a rated match, `tour_<id>_<key>`, with its two ratings, in entered
order. `rack-it/SPEC.md` §5.1 is the as-built description.

**The open question, settled:** the organiser's phone writes the ratings (§3.7 says why). How:

- **One claim.** Finishing is one write, live to done with `ratedAt` and `ratedBy`, which the
  rules allow once. Two phones (the owner's and the organiser's) can't both rate it.
- **A batch a result**: the match, both ratings and `rated.<key>` on the tournament, all or
  nothing. `maybeFinish()` carries on from `rated` the next time the claimer's phone sees it, for
  a day. The ids make a second copy of a match impossible: creating it again is an update, and
  the organiser may not update a match.
- **Only the organiser's phone finishes.** A player who enters the last result leaves it live,
  "Every match is in. It finishes, and ratings move, when Kenny next opens Rack It." Any page
  that watches the tournaments list counts (Play's cards), not only the tournament's own page.
- **A Not right holds the finish.** Hold to end early says "Settle the Not right first".
- Each match's `ratedAt` is the finish plus its index in entered order, so Rebuild replays them
  at the finish in the same order (zargo.js `ratedOrder`).

**Choices made on the way** (change freely):

- **`entry`.** An entrant's write names the result it touches in a top-level `entry` field.
  Firestore rules can't list a map's changed keys, so this is how the rule knows which one to
  check; the organiser's writes set it too, harmlessly.
- Walkovers and clearing stay the organiser's: a player can't walk an opponent over or erase a
  result.
- Not right shows on the card only while nothing downstream has a result; after that the row's
  sheet still offers it. The organiser can let a disputed result stand even when a later match
  depends on it.
- A tournament done before 2.29.0 stays unrated: the claim only happens from live.
- Owner mode: a result counts only when both its players are in `uids`, so a household person
  without an account plays unrated, as a guest does.

**Also fixed.** `shared/cloud-memory.js`'s `deleteFields` checked the write as a whole-document
delete, so under `?mock` a non-owner organiser couldn't clear a result; it now checks the
document as the write leaves it, as Firestore does.

**Proof.** `node shared/proofs/rack-it-tournament.mjs`: 67 checks (27 new), green. A third
tournament: Ann enters hers, Ben says Not right, the owner lets it stand, Ann corrects hers,
Ben's stale result for the final is ignored and cleared, Ann enters the final, the owner's
phone finishes and rates the two account matches once (not the guest's), and nobody can
dispute a rated result. Rules: 295 cases pass on the emulator (11 new). Checked by eye at 390px:
the flagged card, the Settle card, the rated page. ⚠ Not checked at 360×640 or by a real
Firestore write: the first real finish should be watched (Matches shows the rated matches).
On this machine the proof needs `PLAYWRIGHT=<playwright-core index.mjs>` (it isn't installed
here; a copy in a scratch folder works with the cached Chromium), and the emulator needs
`mise x java@temurin-21.0.12+101.0.LTS --` in front of `npx firebase-tools`.

**Left for Session 4** (score it in Rack It): a match scored for a fixture is already a match,
so at the finish `rateResult()` must mark it rated instead of writing a second one; `tourRated`
then needs a sibling rule for that update. Results entered with `match` will need `match` added to
`tourOwnEntry`'s allowed keys. Session 5 (the bracket view) is independent of both.

### Session 5 — 2.30.0, 2026-11-19

**Shipped.** The tournament page is **Your path | Whole draw** (§3.8), with one match card and
one match sheet for everyone. Session 4 hadn't been built, so there is no **Score it in Rack It**
yet; Session 4 adds it to both sheets. `rack-it/SPEC.md` §5.1 is the as-built description.

- `bracket.js`: `B.next(t, key)` → `{ winner, loser, out, top, decider }` (where the players go,
  the places a loser out of it shares, 1st or 3rd for a winner with nowhere to go, and `"F2"` on
  a final with a decider) and `B.path(t, id)`. Both are structural: `next` doesn't skip through
  byes, so a path shows a bye as its own step, as the drawing does. `standings` now shares its
  place sums with `next` (`stagePlaces`). 4 new tests, one a property: every player's path, at
  every size 3 to 32 in both formats, ends where the standings put them.
- The open point (the organiser's extra tap) is settled as recommended, above.

**How the draw is built** (change freely):

- **Two columns, re-laid on each round change.** The round on screen stacks from the top; the
  next one sits beside it, each card midway between its two feeders, level with one, or below
  the card before. A swipe or an arrow re-renders with the next round on screen, so cards never
  drift down the page as rounds go on. Swipes are pointer events on the draw (`touch-action:
  pan-y`); `ui.tap` already ignores a moved finger, so a swipe never opens a card.
- **Geometry in rem** (cards 6rem, gaps .75rem), the lines plain positioned elements in a 28px
  gutter; the peek is 90px. `rack-it-bracket-sizes.mjs` measures it: every line meets a card's
  middle, at every round of both sides, at 3, 8, 13 and 32 players, at 360 and 390 wide, at
  normal and the largest text.
- **The decider before it's needed** is a placeholder card, "decider · if needed", with no sheet.
- **Your match** is a button over the page (`#tFab`), shown while your match is off screen (its
  column isn't the one on screen, or an IntersectionObserver says it's scrolled away). It's
  checked after the page attaches its new nodes: checked during painting, it never finds the card.
- The route accent is the line from the match you're in to the next one, when both are on screen.
- Unknown slots name the match: "Winner of semi-final 2", "Winner of round 3, match 1", "Loser of
  the winners' side final".
- The Session 3 cards (your last result's Not right or Change, the organiser's Settle) stay above
  the two views.

**Proof.** `rack-it-tournament.mjs`: 82 checks, 15 new for Session 5 (Your path for an entrant,
the whole draw for an organiser not playing, the round row and peek, the sheet's where-next and its
jump with a pulse, the draw moving on after a save, Ann's path, her Your match button, a reader's
sheet without Change). `rack-it-bracket-sizes.mjs`: 98 checks, new. Both green, no page errors.
Screens checked by eye at 360 and 390, normal and largest text.

**Left for Session 4**: **Score it in Rack It** in the steppers sheet and the read sheet, beside
**Enter the result** (`openResult()` and `openMatch()`); everything else in Session 4 as written.

### Session 4 — 2.31.0, 2026-11-19

**Shipped.** **Score it in Rack It**, on the steppers sheet and under **Enter the result** on Your
path, for whoever may enter a ready match they play in (or the organiser). It closes the
tournament and opens match setup locked to the fixture: a card on top ("Kenny's tournament ·
Final · Trad-Eight · race to 3 · no handicap · rated when it finishes", with **Not now**), both
players filled in, and the game, Who's playing, Length, Handicap and the Rated tick set aside.
The match is an ordinary friendly carrying `tournament`, `fixture`, `tournamentName` and `round`.
Saved, its racks become the fixture's result with `match` naming it, entered by whoever saved
it, with no confirm. Its summary reads "… · Kenny's tournament · Final", "Counts for Kenny's
tournament: rated when it finishes", and has **Back to the tournament**. At the finish that
match is marked rated (one batch with the two ratings, as for a typed result); no second match is
written. Discarded, it leaves the fixture to play.

**Rules** (300 cases on the emulator, 5 new): `fixtureStarts()` (§6), `tourMarks()` (§6), and
`match` allowed in an entrant's own result. `fixtureStarts` asks `rated: false` outright, and
`ratedOnlyTurnsOff` already stops a player turning it rated later, so the finish is the only way
it's ever rated.

**Choices made on the way** (change freely):

- **The opponent's name** comes from the tournament (`setup.tour.names`, read by `SP()` wherever
  setup asks for a side's player), and its accounts from the tournament's `uids`: this phone may
  not know them. Their rating is read by id before setup opens.
- **The organiser not playing** scores as an ordinary scorer (`scorerStarts`), since everyone
  they added or who joined by QR is connected to them. Guests are never accounts, so a match
  with a guest needs nothing new.
- **A result that's already in wins.** If someone entered the result while the match was played,
  the saved match stays a friendly and says so; the tournament keeps the typed result. A match
  ended before anyone reached the race isn't a result either: "Nobody reached 3 … enter it on
  the tournament's page."
- **One scored match at a time:** a live match for the fixture turns the path's button into
  **Being scored in Rack It**, which opens it.
- Not offered on a match holding a stale result (`ignored`): clear that first.
- The numbers at the finish come from the result's racks (a and b), not from reading the match:
  in the race games they're the same (§0, decision 1), and an organiser not playing can't read it.

**Proof.** `rack-it-tournament.mjs`: 94 checks, 12 new. Ann scores the final against Ben (not
connected): setup filled and locked, a first go discarded leaves it to play, the second saved is
the result with no confirm, the finish marks that match rated with no second one, her rating moves
once, Back to the tournament. The proof's owner tab rates it almost at once, so its checks accept
either side of that. Also green: the match proofs this touches (`rack-it-outsiders`, `-scorer`,
`-two-phones`, `-count-rated`), the bracket sizes, the smoke test, 160 node tests. ⚠ Not tried:
Ben's own phone watching the live match, or a real Firestore start between two unconnected
accounts (the emulator cases cover the rule).

**What's left** is §9: round robin first, then handicapped races and the points games.

### Session 6 — round robin, 2.32.0, 2026-11-19

**Shipped.** Round robin (§3.9), from Start's Format row. No rules change: the rules never read
`format`, and `bracket.js` ignores a result that doesn't fit its match, as before.

- `bracket.js`: `robin(n)` by the circle method, `sitsOut(n)`, `table(t)` behind `standings` for
  a round robin (rows carry `played`, `won`, `lost`, `rf`, `ra`), `next` returning nothing for
  it, `path` as played, now, next. 6 new tests (28 in all): the schedule at every size 3 to 12
  (each pair once, nobody twice a round, one sitting out when odd), the table's three tie-breaks
  and a shared place, a walkover, `next`, `canClear`, the path.
- `index.html`: `isRobin`, `tourMax`, `winnerWords` (a shared first); the elimination-only rows
  and race fold hidden; the lobby counts the matches; the table's record sits under each name.
  A round row now says "then round 2" rather than "then the round 2", for elimination too.

**Proof.** `rack-it-tournament.mjs`: 104 checks, 10 new (a 4-player round robin set up, drawn,
played out by the organiser, the table, done and rated). `rack-it-bracket-sizes.mjs`: 134 checks,
round robin at 3, 8 and 12 added; it found the table's first layout (a record column) running off
a 360px phone at the largest text, so the record moved under the name. Node tests, smoke green.

**Left:** groups into a knockout (§9) builds on this: groups are round robins, and the table's
top two seed a single elimination draw.

### Session 7 — groups, then a knockout, 2.33.0, 2026-11-19

**Shipped.** Groups, then a knockout (§3.10). No rules change, as for round robin.

- `bracket.js`: `groupCount`, `groupSeeds` (the snake), `groupsBuild` (each group a `robin`, then
  `build({ format: "single", n: 2G })` with keys `W` → `K` and its seeds turned into
  `{ qual: { group, place } }`), `derive` resolving a qualifier once its group is done, `rank`
  (the table, now shared by round robin and groups), `groups(t)`, places for groups, `canClear`
  seeing that a group's results feed its qualifiers, `next` and `path` for group matches.
  7 new tests (35 in all), one a property: every size 6 to 32 played at random to the end, every
  place from 1 to n held, shared ranges held by as many as they span. Writing it caught the
  first crossover rule ("the group half-way round") putting a group's two in the same half at 8
  groups; the rule now pairs each group with one whose winner is in the other half.
- `index.html`: `isGroups`, `tourMin` (6), `groupsWords`, `sideWord` (Groups, Knockout), group
  columns in the draw, the group tables (record "2–0 · +3 racks · through", short enough for a
  390px phone), qualifier slots and "won group A" in the match sheet.

**Proof.** `rack-it-tournament.mjs`: 115 checks, 11 new (six players: the groups in the draw
sheet, Groups | Knockout, both groups done with two through each, the draw moving to the
knockout, each semi-final a winner against the other group's runner-up, done, the groups' 3rds
sharing 5th–6th). `rack-it-bracket-sizes.mjs`: 170 checks, groups at 6, 13 and 32 added. Node
tests (173) and smoke green.

**For the owner:** the single elimination Final race bug in §3.10 (fixed in 2.33.1, below).

### 2.33.1 — single elimination's Final race, 2026-11-20

**Shipped.** The fix in §3.10: `raceFor` by name, `oldRace` for finals already entered. One
test (36 in `bracket.test.mjs`): the final at `race.f`, earlier rounds at `race.w`, a stored
`race.w` final still done and finished, a score fitting neither race ignored, and no allowance for
the groups knockout. Node tests (186), smoke and `rack-it-tournament.mjs` (115) green.

### Session 8 — handicapped races, 2.34.0, 2026-11-20

**Shipped.** §3.11 as designed: Start's **Handicap** row (Off · Race chart), the line's
"· handicapped", the ratings frozen into `zargos` at Start and listed on the draw sheet with round
1's targets, the steppers to each side's own target, Score it in Rack It locked to Racks with the
frozen targets, and the finish's rated match carrying `handicap: "racks"` and its targets. No rules
change. `rack-it/SPEC.md` §5.1 is the as-built description.

- `bracket.js` imports `raceChart` and `expectedShareA` from `./zargo.js` (both in the shell
  already). New: `targetsFor(t, race, a, b)`, `NO_RATING` (500), `targets` on every fixture with
  both players known (null while waiting). `fits` takes two targets; `oldRace` is off when
  handicapped. 4 new tests (40 in all), one a property: every format and size, random ratings,
  played to the end at random, the favourite always at the set race. Every earlier test passes
  unchanged; the test helpers now play to `targets`.
- `index.html`: `isHcp`, `targetsOf`, `level`, `raceWords`. The Handicap sheet writes `"racks"` or
  `"off"`; a new tournament saves `handicap` only when on. `proposeTargets()` returns the frozen
  targets while `setup.tour.targets` is set, so today's ratings never change them.

**Choices made on the way** (change freely):

- The stepper hint uses first names, or full names when the two share one ("Player 4", "Player
  8"), as the walkover buttons do.
- A handicapped match between equal ratings is level, and its rated match says `handicap: "off"`.
- §3.11 said the match card's caps label shows the race; it never did, so only the read sheet's
  line changed. §3.11 is corrected.

**Proof.** `rack-it-tournament.mjs`: 130 checks, 15 new. Ann (650) v Ben (450) is 3 v 1; the
organiser's steppers say so; Ann scores it in Rack It, locked to 3 v 1 with no head start, and
Ben's 1–1 win is the result; the final is Ben 2 v the owner 3; the finish rates both, the scored
match marked rated with no second one. `rack-it-bracket-sizes.mjs`: 176 checks, 6 new (handicapped
8 single and 32 double at 360×640, largest text). Node tests and the smoke test green. Checked by
eye: the handicapped setup card and the steppers sheet at the largest text. `make verify` not run:
a parallel session builds in `pocket-instruments/`.

⚠ Left as they are: the Start sheet's odds sentence in a scored handicapped match reads today's
ratings, not the frozen ones, so it can disagree slightly with the targets if a rating moved since
Start. And the round robin tie-break on rack difference under a handicap (§3.11). Neither is
checked on a real club night yet.
