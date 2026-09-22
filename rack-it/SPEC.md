# Rack It — spec

A phone-first scorer for five cue games — three nine-ball, two 8-ball — between any two
players, with one rating across all of them (**Zargo**) and handicaps that keep a mismatched
pair close. Matches sync to the cloud, so any invited phone can score, resume or watch.
Invite-only: members sign in with Google.

This spec is the app as it is (2.2.0). The rating's reasoning is in [`ZARGO.md`](ZARGO.md); the
build sessions and their handovers are in [`V3-PLAN.md`](V3-PLAN.md); the look (dark system v2)
is in [`design/DESIGN.md`](design/DESIGN.md).

**Files.** `index.html` (the app), `zargo.js` (the rating engine, pure), `zargo.test.mjs` (its
tests: `node --test` from the repo root), `sw.js`, `manifest.json`, icons. The shared look,
tokens and the Space Grotesk fonts (self-hosted so they work with no signal) come from
`shared/theme.css` and `shared/fonts/`; `index.html` keeps only Rack It's own parts. `design/`
is reference only.

---

## 1. Concepts

| Concept | Definition |
|---|---|
| **Player** | A person on the household's shared list (`shared/people.js`): name, colour, Gmail, photo. Rack It adds their numbers. |
| **Zargo** | One rating per player: odds on a rack. 100 apart, the stronger player expects to win two racks for every one. Starts at 500. |
| **Robustness** | How many racks' worth of evidence sits behind a Zargo. Under 30 the rating is **provisional**. |
| **Starter rating** | Where a player's Zargo begins before any match: 500, an estimate, or an override. |
| **Match** | One sitting between two players in one game: one or more racks, a length, a handicap, a result. |
| **Group** | 8-ball only: a player's set of seven, **solids** (1–7) or **stripes** (9–15). A rules word: since 2.4.0 the app doesn't track which is whose. |
| **Rack** | One game on the table. What it records depends on the game (§2). |
| **Handicap** | **Off**, **Scoring** (point quotas) or **Racks** (a race chart). Never enters the rating. |

Words: **match**, never session; **Tied**, never "dead level"; **Invites** for the members list.

## 2. The games

Five, in one dropdown, in this order everywhere: **Trad-Nine · Golden-Nine · 11-Point-Nine**,
then **Trad-Eight · Ten-Point-Eight**. Stored as `"standard"`, `"golden"`, `"league"`,
`"eight"` and `"tenpoint"`; a match without `game` is 11-Point-Nine.

| | Trad-Nine | Golden-Nine | 11-Point-Nine | Trad-Eight | Ten-Point-Eight |
|---|---|---|---|---|---|
| A rack records | winner, win kind, fouls, ball drop, breaker | the same | the state of balls 1–9, breaker | winner, win kind, fouls, breaker | the same, plus the loser's balls left |
| Scoring | one rack is one rack | 10 / 7 / 4 to the winner; fouls give 1, 1, 2 | 1 a ball, the 9 is 3 | one rack is one rack | 10 to the winner; the loser 1 a ball of their own group that's down, 0–7 |
| A rack ends | a win tap | a win tap, or a third foul | all nine balls resolved | a win tap, or a hold on Foul (lost it on the 8) | the same |
| Length | race to 3, 5 (default), 7 or N (1–30) | 5 fixed racks (default), race to 35 or N points (1–200) | race (default, about 5 racks), fixed racks or open | race to 3, 5 (default), 7 or N | 5 fixed racks (default), race to 50 or N points |
| Break | alternate | winner breaks | alternate | alternate | alternate |
| Handicap levers | Off (default), Racks | Off, Scoring (default), Racks | Off, Scoring (default), Racks | Off (default), Racks | Off, Scoring (default), Racks |

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

### 2.4 The two 8-ball games

Both play the same rack; only the scoring differs, the way organised 8-ball splits into
one-rack-one-win leagues (WPA, CSI/BCAPL, APA, every Fargo-rated league) and points-per-rack
ones (VNEA, USAPL). The rules the app assumes:

- Clear your group, then the 8 in a called pocket. Win kinds: **Break & run** and **Win**.
- **Losing on the 8** — pocketing it early, in the wrong pocket, on a foul, scratching with it,
  or driving it off the table (WPA §3.8) — hands the rack to the other player. It's a **hold on
  Foul** on the player who did it, confirmed, kind `foul8`.
- **The 8 on the break is spotted and play goes on** (WPA and CSI), so there's no button for it
  and a scratch while making it is just a foul. `config.games.<game>.eightOnBreak: "win"` brings
  a third button, **8 on the break**, back for a house that plays it APA's way.
- Fouls are counted per player per rack and never score; ball in hand happens on the table.
- **Alternate break.** (Winner breaks, APA's way, is a later option.)
- **Ten-Point-Eight** takes the one input every points system takes beyond the winner: how many
  of the loser's own group are down, 0 to 7, whoever potted them. The winner always gets 10.
  `config.games.tenpoint.points: { winner: 10, ball: 1, left: 0 }` — VNEA and CSI's 10-point
  system. `left: 1` makes it CSI's 17-point "ball count"; `winner: 14` makes it USAPL's. One
  edit, no migration.
- **The count is taken once, at the end of the rack** (§6), the way it's easiest to get right:
  the balls **left on the table** are the ones you can see and count, so a rack stores
  `left: 0–7` and the points are the other side of it, `7 − left`. `null` means nobody has said
  yet, and the rack-end card won't move on until somebody has.
- **Groups** aren't recorded. Which seven were whose doesn't change anybody's score once the
  loser's count is known, and asking cost a question a rack. Racks scored before 2.4.0 have
  `groups: { a: "solids" | "stripes" | null }` and a ball drop instead, and are still read that
  way: their loser's balls come off the drop, the group guessed from who potted what.

## 3. Zargo

The full definition, the per-game weights and the known challenges are in
[`ZARGO.md`](ZARGO.md). The code is `zargo.js`. In short:

- `pA = 1 / (1 + 2^((Zb − Za) / 100))`, A's chance of winning one rack.
- Every counted rack gives A a result `r` and a weight `w`. **11-Point-Nine:** `r` is A's share
  of the rack's live points and `w = 1`, spread over the match by live points
  (`w_i = live_i / mean`), so a rack mostly lost to dead balls says less and the weights still
  sum to the rack count. **Every other game, 8-ball and 9-ball alike:** `r` is 1 or 0 by rack
  winner, `w = 0.5`. Points, fouls, the loser's balls and the kind of win never enter it, which
  is how FargoRate pools 8-ball and 9-ball into one number (ZARGO.md).
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
**Off** plays level and the plain score decides it. Scoring isn't offered for Trad-Nine or
Trad-Eight (no points to share). Racks isn't offered for an open 11-Point-Nine match or a race
to points; choosing it turns any other match into a **race in racks**, Length becomes Race to
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

**Ten-Point-Eight's quota is a spot, not a share**, because the loser of a rack keeps their own
balls and so has a floor. Expected points a rack are linear in `pA` instead
(`zargo.js` `expectedEightPoints`):

```
eA = 10 × pA + L̄ × (1 − pA)      eB = 10 × (1 − pA) + L̄ × pA      L̄ = config meanLoserBalls
```

(In general `win = winner + left × (7 − L̄)` and `lose = ball × L̄`, so the 17- and 14-point
configs work too.) Over fixed racks the quotas are `round(racks × eA)` and `round(racks × eB)`,
shown under each score as "31 of 42" from rack one, and the winner is whoever finishes further
past their own: `lead = (pointsB − quotaB) − (pointsA − quotaA)`. **The quota that decides the
match covers the racks actually played, not the racks planned** — the panels show the whole
match because that is what you are playing for, but a match ended early is judged on what was
played. Judging it on the planned racks inverts the result: both players fall short of a quota
meant for more racks, the bigger quota falls short by more, and the match goes to whoever was
spotted the most however badly they lost. Over a race to points the
favourite races to N and the other to `round(N × eUnderdog / eFavourite)`, editable. At a
160-point gap (`pA` 0.75) that's 8.4 points a rack to 5.1, quotas of 42 and 26 over five racks,
and a race to 50 against 30. ⚠ `meanLoserBalls: 3.5` is a guess until 50 racks are stored; every
rack holds its count, so it can then be measured.

**Off.** An 11-Point-Nine race is both to `round(11 × racks / 2)`; a Golden-Nine or
Ten-Point-Eight race to points is both to N; Trad-Nine and Trad-Eight race level, and
Ten-Point-Eight over fixed racks is decided by plain points.

**The lead** shows twice: the lead rail under the scores fills from the centre towards whoever
is ahead, in their colour, and the match bar names them with the gap ("Melanie +26%"). With a quota it reads the gap between the two players'
progress towards their own quota, as a share of the match ("MEL +26%"), capped at +100%; full
swing at a quarter of the match clear, damped by how much has been played, so an underdog's
first ball doesn't lurch it. **Ten-Point-Eight's scoring handicap is the exception:** its bar is
the quota spot in points ("KENNY +1 point"), over the racks played, because that is the number
that decides the match — a bar reading a share while the result reads a spot can name a
different leader than the final card, and then neither is believable. In a race it pegs at **target met**; "ahead" means closest to your
own target. A head start reads as the shorter target it equals. Off shows a plain lead: racks
in Trad-Nine ("MEL +1 rack"), points in the games scored by points ("KENNY +6 points"), full
swing at the race size, or at the winner's points per rack over the match's racks. Level leaves both empty.

**Who wins.** Scoring: the adjusted lead `pointsB − pointsA / H`, `H = pA / (1 − pA)`, or
Ten-Point-Eight's quota spot above. Off: the plain difference. A race: whoever met their target (racks in a race in racks, points otherwise).
The Racks lever ended early: whoever is further through their own race. Golden-Nine: a second
intentional foul loses the match whatever the score.

## 5. Play: setup

One page, defaults first, **Start** pinned below it and naming what's missing ("Pick two
players", "Set the length first"). The page above Start scrolls when an open fold needs the
room, and opening a fold scrolls it into view.

1. **Game**, a dropdown row like Length and Handicap: the chosen game's name on the row, and
   under it two sentences on what the game is and how it scores, so 11-Point-Nine, Golden-Nine
   and Ten-Point-Eight tell themselves apart without opening anything. Open, it lists all five
   in order, a line each ("Nine-ball · every ball scores, 11 a rack"), and all five fit a phone
   screen; picking one closes it. The last game picked is remembered per phone (`localStorage`
   `rack-it.game`).
2. **Players:** Teal side and Lilac side columns with avatars. You're pre-selected on teal; the
   lilac column lists the teal player's most recent opponents first, then everyone by name.
   Tapping the player who's on the other side swaps the two, and the break stays with whoever
   had it.
3. **Length**, **Handicap** and **Break**: one settings card, a row each showing the current
   choice. Length and Handicap open on tap; Break flips on tap (teal breaks first by default).
4. The handicap row shows the proposal and, open, the targets, both editable. The odds sentence
   sits above **Start** at all times: how many racks (or points, in 11-Point-Nine) the favourite
   expects for each one of the other's, "Near-level ratings, so an even match" when close, and
   with Racks the chance the higher-rated player wins the race as set. Ten-Point-Eight reads as
   points a rack instead ("Kenny expects 8.4 points a rack to Melanie's 5.1"), since its loser
   scores too.

The handicap isn't remembered: each game starts at its default. A repeat of last night is Game,
two names, Start. Play keeps your picks while you look at another tab and starts fresh after a
match has begun.

## 6. The live screen

Full-bleed: no tab bar. The screen holds a wake lock and asks for fullscreen (`shared/phone.js`).

**Shared chrome**, top to bottom:
- A 5px **turn bar** in the shooter's colour.
- The **score head**: two panels, teal left and lilac right. The shooter's panel fills with their
  colour and shows a dot by the name; **tap a panel to make that player the shooter**. Turn
  always shows three ways at once: turn bar, filled panel, and the screen's ground tint. Under
  each score, the run-in to a race target ("needs 4 of 7", "target met") or the racks won.
- The 8px **lead rail** (§4).
- The **match bar**: "Rack 3" (and "of 5" when fixed, "· 1 dead" in 11-Point-Nine, "· 12–9 pts"
  when racing in racks), the lead in the leader's colour, and the **break chip** ("Break ⇄ G",
  the breaker's initial), which flips on tap. "Table clear" takes the lead's place when all
  nine are down.
- Controls, three sizes so they can't be confused by feel: **Undo** (everything in the current
  rack, up to 60 steps), **Next rack** (11-Point-Nine only; elsewhere Undo takes its room), and
  **End**, which you **hold for 600ms** (a fill rises; let go to cancel; a buzz when it lands).

**11-Point-Nine.** The diamond rack of balls 1–9, sized by height as well as width. Tap a ball:
untouched → the shooter's; the shooter's → dead; dead → untouched; the other player's → the
shooter's. Claimed balls go flat in the player's colour; dead balls go grey with the number
struck through. Dark balls (2, 4, 7, 8) carry a hairline ring so their edge shows.
**Long-press** clears a ball. When all nine are resolved the rack-end card shows the 11-point
check with **Start rack N** (or **Declare the result**), or the odd-total warning (§2.1).

**Every other game.** The rack area becomes a row of two **Foul** buttons (that rack's count,
and in Golden-Nine what it gave away; amber once there's a foul), then a column per player
captioned "Gareth wins it", with its win buttons (Golden-Nine: Big Golden +10, Small Golden +7,
Win +4; Trad-Nine: Break & run, 9 on the break, Win; the 8-ball games: Break & run, Win, and
**8 on the break** only where `eightOnBreak` is `"win"`). A foul passes the shot to the
opponent. A win tap, or a third Golden-Nine foul, ends the rack and shows the
card with **Start rack N** and **Undo that**. A **hold on Foul**, confirmed, is Golden-Nine's
intentional foul and the 8-ball games' **lost it on the 8**. After the last scheduled Golden-Nine
or Ten-Point-Eight rack a tie offers **Play a deciding rack** (adds one to `racksPlanned`) or
**Call it a tie**.

**Ten-Point-Eight's rack-end card** asks the count before anything else: "Break & run. Count
Melanie's own balls still on the table", and eight numbers, 0 to 7, in two rows. **Start rack N**
is hidden until one is tapped, since that count is the loser's score. Tapped, the card reads
"Kenny 10 · Melanie 4 — 3 of Melanie's left, 4 down. Match 24–18, racks 3–1", and another number
re-answers it. Nothing is preset: a break and run can still leave the loser's balls down, because
both groups drop on the break.

**Golden-Nine's scoring handicap, live.** Over fixed racks there is no target to run in to, so
the underdog's panel shows their points times the favourite's odds instead ("×3.4 = 38", or
"counts ×3.4" before they score), and the match bar's lead is in those points ("Melanie +20").
That is the comparison that decides the match (§4, Who wins). Near-level ratings show nothing
extra. A Golden-Nine race to points shows "needs N of M", as 11-Point-Nine does.

**The ball drop** (Trad-Nine and Golden-Nine), above the controls under a hairline, as on a
stream: balls 1–5 over 6–9, a log for replays and never the score — potting the 9 wins nothing.
Tap a ball and it's potted by the shooter; its slot stays empty, and tapping the slot puts it
back. The shooter doesn't change, taps after the rack has a winner are ignored, a new rack
starts full, and Undo covers it.

**The 8-ball games have no drop.** Fourteen cells and a group label a row asked a scorer to keep
up with a rack ball by ball, which nobody does while playing, and a half-tapped drop scored
Ten-Point-Eight wrong. Both games show the foul and win buttons alone, taller for the room. The
one thing a scorer has to say is said once, when the rack is over and the table can be counted:
**Ten-Point-Eight's rack-end card asks how many of the loser's own balls are still on the
table** — eight numbers, 0 to 7, one tap — and holds back **Start rack N** until one is tapped,
because that count *is* the loser's points (`7 − left`). It can be re-tapped while the card is
up, and Undo covers it. Trad-Eight asks nothing: one rack is one rack.

**End.** A complete rack still counts. 11-Point-Nine: an untouched rack is dropped silently; a
part-played or odd rack asks, dropped by default with **Count rack N, then end** offered.
Every other game: a rack without a winner is dropped, and End says so if fouls had given points. Then the result card: winner, racks, score line, Zargo movement ("calibrating"
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
the live screen: labels in caps, the selected tab in teal with a bar above it. The app always
opens on **Play** (owner's call, 2.0.1). While a match is live and this phone isn't scoring or
watching it, a **live strip** above the tabs shows "Live · Kenny 14–9 Melanie" with **Resume**
and **Watch**. The newest 300 matches are watched as one live list, so the strip, Matches, a
person's page and a summary update without a reload.

**Ratings.** Everyone, ranked by Zargo, one card each: rank, avatar, name ("you"), and the Zargo
right-aligned in large figures. Under the name, robustness in words: "41 racks behind it", or in
amber "provisional · 22 racks", "provisional · no Gmail" or "no Gmail". People who haven't played
go last, by name, unranked, "not played yet", their number dimmed. **Add player** under the
list. Tap a row for their page.

**A person's page.** 72px avatar, Zargo with robustness, one line on what the number means
("Against someone on 497, Kenny would expect to win two racks for every one"), **Edit** (name,
Gmail, colour, the shared sheet, and for the owner the starter rating override and **Hold to
delete player**; anyone else sees one line saying those are the owner's), Cuescore (read-only;
Add or Change on your own page), the win record per game (finished matches, in picker order) and their matches.

**Matches.** Live (last 24 hours) first, then newest. Each row: names and score (racks in a race
in racks, head start included) with the winner's name in bold, then a caps line with game,
length and handicap, and when (a time today, else a date), or "tied". A live row is tinted teal
and reads "Live · 11-Point-Nine · rack 3". Discarded matches don't show. No Delete in the list:
a live row resumes; a finished one opens its summary.

**Summary.** Winner, game, length, when, the score line, the Zargo movement, the racks that
counted, **Copy for Cuescore** (§10), and for the owner **Hold to delete match** (anyone else
sees why it isn't there).

**More.** Invites, Export and Import, Rebuild ratings (owner), Install on this phone, About
Zargo, Sign out, the version; the account shows in the header. A member sees one line naming
the owner's actions instead of Rebuild. **Invites** is the members allowlist: add a Gmail,
remove one (owner only, two taps, never yourself), **Share this app**; rows show whose Gmail it
is. Import's **Replace everything** is the owner's too.

### 7.1 The owner

One member is the **owner**: `members/<email>.role: "owner"`, set by hand in the Firebase console.
Only the owner deletes a match, changes a saved match (so only the owner rebuilds ratings or
replaces everything on import), changes or deletes a starter rating, deletes a player, and
removes an invite. `shared/firestore.rules` enforces the Firestore writes; the app hides the
buttons from everyone else, with a line saying why. Any member still scores, saves, adds a
player (with a starter estimate) and invites. ⚠ People documents stay writable by any member.

**Hold to confirm.** End, deleting a match and deleting a player are a 600ms hold with a
rising fill, never a dialog. Under reduced motion the fill appears at once.

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
- **Deleting** a player (owner only) is soft and shared by every app: they leave every list and
  picker, their matches keep their name. You can't delete yourself.
- ⚠ Any member can write any person; the Cuescore rule below is enforced in the app only.

## 9. Data

All under `sidequests/rack-it/` in Firestore, via `shared/cloud.js`. Members-only by
`shared/firestore.rules`, with the owner's writes in §7.1. `cloud.role()` reads your own
`members` document.

```
state/main
  players: { <personId>: { zargo, robustness, sessions } }     // sessions = matches played
  config:  { games: { league: { points: { low, nine }, w }, golden: { points: { big, small,
             win, foul: [1, 1, 2], intentional }, w }, standard: { w },
             eight: { w, eightOnBreak: "spot" | "win" },
             tenpoint: { points: { winner, ball, left }, meanLoserBalls, w, eightOnBreak } },
             K: 8, provisionalRacks: 30, startZargo: 500 }       // old config.points still read

starters/<personId>
  zargo, setAt, setBy                                           // an email, or "rebuild"

matches/<id>
  game: "standard" | "golden" | "league" | "eight" | "tenpoint"  // missing = league
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
    "1": { winner, kind: "run" | "win" | "eight" | "foul8", fouls,
           left: 0–7 | null,                    // Ten-Point-Eight: the loser's own balls still up
           balls: {}, pottedAt: {}, groups: { a: null },      // empty since 2.4.0; see below
           breaker, at }                                                                   // 8-ball
  }
  totals: { a, b, racksA, racksB, dead, lead, winner }
```

- In Trad-Nine and Trad-Eight `a` and `b` are racks. An 11-Point-Nine rack counts to whoever took
  more of its live points (an equal split counts for nobody). `racksA/racksB` include any head
  start.
- **Counted racks.** Every game but 11-Point-Nine: racks with a winner. 11-Point-Nine: every rack
  but a last one that End dropped (no balls at all, or points not in `totals`).
- A Ten-Point-Eight rack's points are derived, never stored per rack: the loser gets one for each
  of their own balls that's down, which is `7 − left` (`zargo.js` `loserBalls`). A rack from
  before 2.4.0 has no `left`, so it's read the way it was entered instead — the loser's own
  group's balls in `balls`, the group from `groups` or guessed from who potted what, capped at 7.
  Both paths are tested; nothing needs rebuilding.
- Writes: racks with `cloud.patch` per rack; `state/main` and `starters` with `cloud.save`.
- Offline: Firestore's persistent cache is on; `sw.js` caches the shell (`index.html`,
  `zargo.js`, `shared/theme.css` and the two fonts, manifest, icons), network first.

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

**Testing.** `?mock` runs against `shared/cloud-memory.js` (CLAUDE.md): a fake owner, fake data.
`?mock&role=member` makes the fake user a plain member. The rules aren't modelled there.

## 10. Cuescore

Cuescore is where Sessions Billiard Club keeps leagues, rankings and challenge matches. Its
[API](https://api.cuescore.com/) is read-only; challenges are entered by hand in a logged-in
account, so a static app can't upload results.

- A person can carry a `cuescoreId`: paste a profile link and the trailing number is kept. Only
  you set your own, never on Add player; anyone else's shows read-only ("Player 1234567", not a
  link, since a URL built from the number alone is unverified).
- **Copy for Cuescore** on a summary: one line with the score in racks, since Cuescore records
  frames, e.g. `Kenny 5–0 Melanie · 9-Ball · race to 5 · Sep 16, 2026`. Golden-Nine and
  11-Point-Nine say "9-Ball (Golden Nine)" and "9-Ball (11-Point-Nine)" and add the points;
  Trad-Eight says "8-Ball" and Ten-Point-Eight "8-Ball (10-point)", with the points. The
  race reads "race to 7 v 4", adds "Melanie started 3 up", or gives points or a rack count. With
  no clipboard the line is selected instead. **Open Cuescore challenges** links to
  cuescore.com/challenges/. ⚠ Check the shape against Cuescore's real challenge form.

## 11. Fitting the phone

- **Never scrolls while scoring.** Turn bar 5, score head 136, lead rail 8, match bar 48 and
  controls 76 (+16) are fixed; the rack takes what's left. Ball size:
  `clamp(52px, min(23vw, (100dvh − 349px − safe areas) / 5), 96px)`, `dvh` because it tracks
  Chrome's URL bar (90px on a 390×844 phone). Under 700px tall the score head drops to 116 (score
  52px), the match bar to 44 and the controls to 64, and the win area tightens. On a narrow
  phone the match bar's label and lead each take a second line rather than lose words.
- **Ball drop sizing** (nine-ball only). Two rows, so every target is a fifth of the width by
  60px (56 on a short phone), balls at 46px.
- **The 8-ball live screen** has the foul row and the win buttons and nothing else, so each win
  button may grow to 148px instead of 104 and the column centres what's left rather than leaving
  a hole above Undo. The rack-end card's eight numbers are a four-wide grid, 60px tall.
- **House minimums.** 18px base; nothing under 15px except tracked caps labels at 14px (owner's
  call, 2.1.0); targets 56px or more (60 on every page but the live screen's balls, 76 for the
  primary controls); dark; greys at 7:1 or better for anything read while playing and 4.5:1
  elsewhere, never dimmed with opacity; `touch-action: manipulation`; `prefers-reduced-motion`
  respected; taps on `pointerup`. Type is in `rem` off an 18px root so the phone's text size
  applies, except on the live screen, which stays in px.
- **Colour.** Teal is side A and lilac side B, and a player's colour only ever means that
  player. Amber only ever means careful or incomplete. No state rests on colour alone.
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
- Club grouping; Golden-Nine's shot clock, time limit, early finish.
- Heyball (Trad-Eight's shape, with its own win kinds, when wanted); a winner-breaks option for
  the 8-ball games; average points a rack on a person's page.
- Whether the loser's balls in Ten-Point-Eight predict anything the rack winner doesn't
  (ZARGO.md challenge 11): the counts are stored so it can be tested later.

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
| 2.1.0 | Dark system v2 from claude.ai/design: the two player sides, Space Grotesk figures, the live screen's chrome down from 335px to 273px. Caps labels may be 14px. |
| 2.1.0 | End, delete match and delete player are holds, not dialogs. Delete leaves the Matches list for the summary. |
| 2.1.0 | An owner role: only the owner deletes or rewrites history, sets starters after the fact, or removes an invite. |
| 2.1.0 | Golden-Nine's scoring handicap shows live, as the underdog's handicapped points. |
| 2.2.0 | Two 8-ball games beside the three nine-ball ones: Trad-Eight (one rack is one rack) and Ten-Point-Eight (VNEA and CSI's 10-point system). Not 17- or 14-point. |
| 2.2.0 | The rack winner is all that rates, in every game, at `w = 0.5` — Fargo's way. Point share was rejected: the Ten-Point-Eight winner always has 10, so a share would only grade how badly the loser lost. |
| 2.2.0 | The 8 on the break is spotted and play goes on (WPA, CSI), and losing on the 8 is a hold on Foul. Alternate break in both games. |
| 2.2.0 | The 8-ball drop is fourteen balls in two rows with a group label each, and in Ten-Point-Eight it is the score. Cells may be 52px (51 on a 360 phone). |
| 2.2.0 | Ten-Point-Eight's scoring handicap is a quota spot, not a share, because the loser of a rack keeps their own balls. |
| 2.2.1 | Side B is lilac, not coral: coral read as an alarm colour next to amber `--warn`. Colour tokens only, no behaviour. |
| 2.2.2 | Setup scrolls when a fold is open, instead of the settings card being squeezed and clipping its own options under Start. Opening a fold scrolls it into view. |
| 2.2.3 | Ten-Point-Eight's quota is measured over the racks played, not the racks planned, so a match ended early no longer goes to the player who won nothing. Its lead bar is the same spot, in points. |
| 2.2.4 | End asks first when the match still has racks in it, and the result card offers **Back to the match** until you Save. 11-Point-Nine's End is unchanged. |
| 2.3.0 | Game is a dropdown with the two sentences that say what it is and how it scores, not five buttons: with five games the names alone stopped being enough. |
| 2.4.0 | The 8-ball drop is gone. Nobody taps fourteen balls mid-rack, and a half-tapped drop scored Ten-Point-Eight wrong; the rack-end card asks for the loser's balls *left on the table* instead, one tap, and the rack stores that count. |
