# Rack It (was Fair Nine) — Spec v2, v3 in progress

**v3 session 1 (1.0.0) shipped:** the name Rack It, "match" in every label, `game` and
`handicap` on match documents, `config.games`, the per-rack Zargo update, and a Cuescore link
on people. See §12.9. Code and Firestore paths still say "session".
**v3 session 2 (1.1.0) shipped:** Golden-Nine and Trad-Nine, end to end. See §12.10.
**1.1.1:** the games are now called Trad-Nine, Golden-Nine and 11-Point-Nine (§13.2).
**1.2.0:** Trad-Nine also offers Race to 3 and Race to N (§12.10).

A phone-first scorer for social nine-ball between any two players in a household, with a self-correcting handicap (the **Zargo** rating) so mismatched players stay evenly matched. Scores sync to the cloud so any family phone can score or review.

**Status:** ready to build. The live scoring screen already exists as a prototype in `index.html` in this folder — keep its interaction design and extend it; don't rebuild it.

**Changes from v1:** no "owner" — any two players; per-player **Zargo** ratings (Fargo-style scale) replace per-pairing paces; racks play out to the last ball (league variant); storage moved from `localStorage` to Firestore via `shared/cloud.js`; older-eyes typography baked in.

---

## 1. Concepts

| Concept | Definition |
|---|---|
| **Player** | Anyone in the household. Has a name, a colour, and a rating. Unlimited. |
| **Zargo** | One rating per player on a Fargo-style scale: 100 points apart = the stronger player scores twice the points. Driven by point share, not win/loss. Starts at 500. |
| **Robustness** | Number of racks that have fed a player's Zargo. Below 30 the rating is provisional. |
| **Session** | One sitting between two players. One or more racks. Has a mode and an outcome. |
| **Rack** | One game. Every one of balls 1–9 ends up in exactly one state. |
| **Ball state** | `untouched`, `a` (player A pocketed it), `b`, or `dead` (pocketed on a foul; scores for nobody). |

---

## 2. Rules of the house variant

This is **not** standard nine-ball. In standard rules the game ends when the 9 is legally pocketed. In this household's 11-Point-Nine variant:

- Play continues until **all nine balls are off the table**. Sinking the 9 early ends nothing.
- Balls 1–8 score **1 point** each; the 9 scores **3**. Every rack is worth **11 live points**.
- A ball pocketed on a foul or scratch is **dead**: it stays down, scores for nobody, and the shooter loses their turn.
- A rack is complete when all nine balls have a state. `pointsA + pointsB + deadPoints === 11` should hold for a complete rack, and normally does. Surface a **soft warning** at rack end when it doesn't — it's nearly always a mis-tap — but let the rack be banked as it stands, because real racks sometimes go odd (a ball off the table, a ball nobody saw drop). Going back to fix it is the default action; banking anyway is the clearly-labelled second option.
- Who breaks is recorded per rack (default: alternate; the app pre-fills and the user can flip it).

Point values live in config (`{ low: 1, nine: 3 }`) so the 10-point APA-style variant is one edit.

---

## 3. Zargo ratings and handicap

Zargo borrows FargoRate's scale and its trust measure, and swaps what's being measured. Fargo rates **game wins** in races; this 11-Point-Nine scores **point share** within racks, so Zargo rates point share. A Zargo 500 and a Fargo 500 are unrelated numbers and the app's About text says so.

### 3.1 Expected share

For players A and B with Zargo `Za`, `Zb`:

```
expectedShareA = 1 / (1 + 2 ^ ((Zb − Za) / 100))
H = expectedShareA / (1 − expectedShareA)        // A scores H points for each 1 of B's
```

100 points apart → A scores twice B's points. 200 apart → four times. A 2.5 : 1 handicap is a gap of about 132.

### 3.2 Deciding a session

Always by adjusted comparison, so a session can stop at any moment and still be fair:

```
lead = pointsB − pointsA / H     // in B's units; positive means B is ahead
```

Display this as a **lead bar**, not as "adjusted points": a green fill running from the centre of the bar out towards whoever is ahead — left for player A, right for player B — under the leader's name and the gap in large type ("MEL  +26%"). Every mode reads the same way. Each player has a **quota**; the bar is driven by the gap between the two players' progress fractions towards their own quota, and the big number states that gap as a share of the session. In a **race** the quotas are the targets, and the bar pegs once someone meets theirs ("target met"). In **fixed** the quotas are each player's expected share of the live points over the planned racks. In **open** they are the same over the racks played so far, with a floor at the default five so an early whitewash reads +40% (as it would in a five-rack race) rather than +200%; from the sixth rack on the number shrinks a little at each new rack because the session it's a share of has grown. In fixed and open the gap is the adjusted `lead` divided by a positive constant, so the player shown ahead is always the one who would win if the session stopped now. Full swing at a quarter of the session clear, **damped by how much of the session has been played**. The damping matters: with a big handicap the underdog's quota is short, so their first ball is a large slice of it — true, but it proves little, and an undamped bar lurches on it. The number is capped at +100%. A lead too small to see keeps a visible sliver. Level reads "Tied" with an empty bar. Raw scores sit above it in the two panels.

### 3.3 Updating after a session

Only live points count (dead balls excluded):

```
actualShareA = pointsA / (pointsA + pointsB)
delta        = K × racks × (actualShareA − expectedShareA)      // K = 8
delta        = clamp(delta, −40, +40)
Za += delta;  Zb −= delta
robustnessA += racks;  robustnessB += racks
```

The `racks` factor means a five-rack session moves ratings five times as much as a one-rack one. The clamp stops one freak night from wrecking a rating. Fargo weights moves by each player's robustness (a well-established player moves less than a newcomer); a simple version of that is welcome if it stays under ten lines: scale a player's share of the delta by `otherRobustness / (ownRobustness + otherRobustness)`.

### 3.4 Robustness and provisional ratings

Every player shows their Zargo and robustness (`Sarah · 468 · robustness 42`). Below **30 racks** the rating is labelled provisional. It is still used; it just shouldn't look authoritative. Fargo's own threshold is 200 games, but a rack of point share carries far more information than a single win/loss, so 30 is honest here.

### 3.5 Starter rating and override

New players start at **500**. A player's Zargo can be edited directly from their profile (with a confirmation) as a starter guess for someone obviously strong or weak — Fargo does the same thing. Any session's targets can be edited before starting without touching ratings.

### 3.6 Races need enough points to be a contest

A race target is only as fine-grained as its own size. At an 8:1 handicap over five racks the
underdog races to 6, so one ball is a sixth of their session and a single rack can settle it —
the handicap is right but the resolution is wrong. Setup warns when either proposed target
falls below **8 points**, names the player it affects, and says roughly how many racks would
give both players room. It's a nudge, not a block: targets and rack count stay editable.

## 4. Session modes

1. **Race to target** — pick a rough length (default 5 racks). App proposes `targetA = round(11 × racks × expectedShareA)` and `targetB` likewise; both editable. When either player reaches their target, **finish the current rack**, then declare.
2. **Fixed racks** — play N racks, then declare.
3. **Open** — play until someone taps End, then declare.

---

## 5. Screens

### 5.1 Home
- Sign-in state (Google). If signed out, a single big Sign in button and nothing else.
- List of players with Zargo, robustness, and a provisional tag where relevant.
- If a session is live, a bar above the buttons offers **Resume scoring** (pick it back up on this phone) and **Watch** (read-only second-phone view).
- **New session** (primary), Add player, History, Export/Import.

### 5.2 Session setup
- Pick player A and player B (two big tiles each; A is the left/blue side, B is right/amber).
- Mode picker. Suggested targets or rack count, editable.
- Who breaks first.
- Start.

### 5.3 Live scoring — keep the prototype
Everything in the existing `index.html` stays: diamond rack, whole-screen tint for the shooter, tap the score panel to change shooter, claimed balls fill with the player's colour, dead balls grey with a cross, long-press to clear, session-wide undo, wake lock, `pointerup`-driven taps, large type.

Add:
- Player names in the panels instead of "You / Opponent".
- The lead bar under the scores (§3.2).
- Rack-end check: when all nine are resolved, show the 11-point check and a Next rack button; warn about a rack that doesn't total 11, and offer Bank it anyway alongside Back to the rack.
- Live sync: the session document updates after every ball so a second phone can watch.

### 5.4 Session summary
- Winner sentence, raw scores, racks, dead balls.
- Zargo movement for both players: `512 → 519`.
- Save, or Discard (discarding never touches ratings).

### 5.5 History
Per player: reverse-chronological list of sessions — date, opponent, mode, score, result. No charts yet.

A live session is tappable to resume it. Every row has a **Delete** button: one tap arms it, a second within five seconds removes the session document for good. Deleting is a tidy-up, not an undo — Zargo movement already applied when the session was saved stays applied.

---

## 6. Data (Firestore, via `shared/cloud.js`)

All under `sidequests/fair-nine/`.

```
state/main
  players: {
    <personId>: { zargo, robustness, sessions }   // name and colour live in the shared people list (§11)
  }
  config: { points: { low: 1, nine: 3 }, K: 8, provisionalRacks: 30, startZargo: 500 }

sessions/<sessionId>
  playerA, playerB            // playerIds
  mode: "race" | "fixed" | "open"
  targets: { a, b } | racksPlanned | null
  startedAt, endedAt
  status: "live" | "done" | "discarded"
  zargoBefore: { a, b }
  zargoAfter:  { a, b }       // set on save
  racks: {
    "1": { balls: { "1":"a", ... "9":"dead" }, breaker: "a", at: <timestamp> },
    ...
  }
  totals: { a, b, dead, lead, winner }
```

Write racks with `cloud.patch(sessionPath, { "racks.3": rack })` so two phones scoring the same session don't overwrite each other. Write `state/main` with `cloud.save` (merge).

Offline: Firestore's persistent cache is on; scoring works with no signal and syncs later.

**Export/Import** stays: Export downloads everything above as one JSON file; Import merges by session id or replaces (asks which; warns before replace).

---

## 7. User stories

**Players**
- P1 — Add a player with a name and colour.
- P2 — Edit a player; delete with confirmation (their sessions remain, marked with the deleted name).
- P3 — See each player's Zargo, robustness, and whether it's provisional.
- P4 — Manually set a Zargo (starter rating), with confirmation.

**Sessions**
- S1 — Start a session between any two players in any of three modes.
- S2 — See proposed targets and edit them.
- S3 — Record who broke each rack.
- S4 — Tap a ball to award it to the shooter; tap the score panel to change shooter.
- S5 — Mark a ball dead; long-press to clear; undo anything in the session.
- S6 — See raw scores and one sentence saying who's ahead.
- S7 — Be told when the table's clear and whether the rack totals 11; bank an odd total anyway if it's genuinely what happened.
- S8 — End at any time and get a fair result, choosing whether a part-played rack counts.
- S9 — Watch a live session from a second phone.
- S10 — Resume a live session after a reload, or from another phone. The session document is the record, so `live` is rebuilt from it: every rack below the highest rack number is banked, the highest is the rack in progress. Undo history doesn't survive.

**After**
- A1 — See a summary with Zargo movement.
- A2 — Discard a session.
- A3 — Browse history per player.
- A4 — Delete a session outright, live or finished, from History.

**Data**
- D1 — Sign in with Google; see nothing until signed in.
- D2 — Keep scoring offline; sync when back.
- D3 — Export and import JSON.

---

## 8. Edge cases

- Session with zero complete racks → discard silently; ratings untouched.
- Abandoned mid-rack → the rack is dropped by default, but if anything was scored in it, End asks first and offers to count it. Complete racks always count.
- Two new players (both at 500) → equal targets, both provisional.
- Same player picked for both sides → block it.
- Rack that doesn't total 11 → warned about, correctable, but bankable as-is if the scorer says so.
- Resume a session whose player has since been deleted → refuse and say so; the record stays for History.
- Delete the session this phone is scoring or watching → drop out of it cleanly rather than scoring into a hole.
- Signed-in user not on the family list → sign-in succeeds but reads fail; show *"Ask Kenny to add your email"* rather than a raw error.

---

## 8b. Fitting the phone

The live screen never scrolls: score panels, lead bar, meta strip and controls are fixed, and
the rack takes what's left. Ball size is therefore driven by **height as well as width** —
`clamp(46px, min(21vw, (100dvh - 396px) / 5), 92px)` — so the controls stay on screen instead
of being pushed off the bottom. `dvh`, not `%` or `vh`, because it tracks the real visible
area as Chrome's URL bar shows and hides. Under 700px tall a media query drops the shooter cue
(the panel tint already says whose shot it is), shrinks the score and the controls, and
re-budgets the ball size against the smaller chrome.

**Installing.** The manifest is `display: standalone` with PNG icons at 192 and 512 plus a
maskable 512 — Chrome needs real PNG icons to build a WebAPK, and without one it offers only
a bookmark-style shortcut, which always opens in a tab with the URL bar showing. A shortcut
added before those icons existed stays a shortcut: remove it and install again.

**Wake lock.** The app holds exactly one screen wake lock, taken when the scoring screen opens
and released when it closes. Android drops the lock whenever the tab is hidden, so the
sentinel's `release` event and `visibilitychange` re-take it. Failure is silent — scoring works
without it. That logic now lives in `shared/phone.js` and is called with `keepAwake(on)`, so
Around the Clock and anything later get the identical behaviour.

## 8c. On the phone

Installs as a real app, not a browser shortcut: the manifest ships PNG icons (192, 512 and a
maskable 512 drawn from `icon.svg`), an id, portrait orientation, and asks for `fullscreen`
with `standalone` behind it. Without the PNGs Chrome quietly makes a plain shortcut that
opens in a tab with the URL bar showing — and then never offers the real install again, which
is why there's an **Install on this phone** button on the home screen. It comes from
`shared/phone.js`, along with fullscreen and the wake lock, so every app here behaves the
same way. An older home-screen shortcut has to be removed and re-added to pick this up.

## 9. Out of scope

- Charts and trend lines.
- Shot-level stats, safeties, break statistics beyond who broke.
- Cross-household leagues.
- Anything but nine-ball.

---

## 10. Build order

1. Players with Zargo and robustness in `state/main`; sign-in gate.
2. Session setup with proposed targets.
3. Wire the existing live scoring screen to a session document (names, lead bar, rack-end check, per-rack `patch`).
4. Summary with Zargo update; History.
5. Export/Import.
6. Second-phone live view (mostly free once 3 is done).

---

## 11. Post-v2 decisions

- **Family allowlist moved to Firestore.** `shared/firestore.rules` no longer lists emails; it
  checks `exists(/members/<email>)`. The list is managed in-app (Home → Family): any family
  member can add or remove a Gmail address, effect is instant, no rules deploy. You can't
  remove your own address. A Share button sends the app link.
- **Starter rating estimate.** Adding a player offers an optional hint: pick an existing player
  and a likely race-to-9 score; the gap is `100 × log2(theirScore / newScore)` off the reference
  rating. Untouched, new players still start at 500.
- **No gate flash.** The Sign in button renders only after Firebase reports the auth state, so
  signed-in users no longer see it flicker on load.
- **"Tied", not "Dead level"** — "dead" is reserved for dead balls.
- **The lead bar talks quotas, in every mode.** In a race, "ahead" means closest to your own
  target, since that decides the session and can disagree with the adjusted lead once targets
  are rounded or edited. The bar is driven by the gap between the two progress fractions and the
  big number states it as a share of the session — one definition for both sides, where stating
  it in the leader's own target points made the same bar position read "+1" one way and "+4"
  the other. Fixed and open used to show the adjusted lead in points ("+3"), which read
  differently from the race percentage; they now use the same progress-fraction gap, with each
  player's quota being their expected share of the session's live points (§3.2). Each race
  panel carries that player's run-in ("needs 8 of 25", or "target met").
- **Ratings settle fast.** Under 3 sessions a player is "settling": against a known player
  (3+ sessions) their Zargo is solved directly from the observed point share (capped ±250,
  jumping all the way on session 1, half on 2, a third on 3; since v3 "observed mean `r`",
  which for 11-Point-Nine is the same number) while the known player's rating
  holds as the anchor; two settling players use the standard formula boosted 4×/3×/2× with a
  ±120 clamp. From 3 sessions the spec-3.3 formula applies as written.
- **Players can be deleted** (edit form, confirmed). Soft delete: they leave every list and
  picker but their sessions keep their name in History.
- **Players are the household's shared people.** Names and colours come from one list in
  `shared/people.js` (`/sidequests/_shared/people/`), the same list Around the Clock and
  Bloc 11 use, so Melanie is added once for every app. `state/main.players` now keeps only
  Fair Nine's own numbers — zargo, robustness, sessions — keyed by the person's id. Everyone
  on the shared list shows here, at the starter rating until they play. On first run the old
  Fair Nine players were adopted into the list: matched by name to someone another app
  already had (their rating follows them to that id) or added as they were. Sessions keep
  the ids they started with and are read through `people.resolve`, so merges in any app
  carry History with them. Deleting a player removes them from every app, and you can't
  delete yourself. Adding a name that's already on the list asks first. The starter-rating
  hint only offers players who have a rating to measure against.

---

## 12. Planned v3 — three games, one app

**Status:** being built; §12.9 and §12.10 record what has shipped. This section supersedes "Anything but nine-ball"
in §9. The rating side of the plan is in [`ZARGO.md`](ZARGO.md); the build is split into four
sessions in [`V3-PLAN.md`](V3-PLAN.md).

### 12.1 Why modes, not a new app

Golden-Nine and Trad-Nine differ from the 11-Point-Nine game in what a rack records and how
it scores. Everything around the rack — players, session document, live sync, resume, watch,
History, Export, the quota-driven lead bar — is the same, so they become **games** inside Fair
Nine. Every session carries `game: "league" | "golden" | "standard"`; stored sessions without
one are 11-Point-Nine. The app id and URL stay `fair-nine` because renaming breaks installs.

### 12.2 The games

| | 11-Point-Nine | Golden-Nine | Trad-Nine |
|---|---|---|---|
| A rack records | state of balls 1–9 | winner, win kind, fouls per player, breaker | winner, win kind, fouls per player, breaker |
| Points | 1 each, 9 is 3 | 10 / 7 / 4 to the winner, 1, 1, 2 for fouls | one rack |
| Rack ends | all nine balls resolved | winner tapped, or a third foul | winner tapped |
| Default length | 5 racks | fixed racks, extra rack on a tie | race to 5 (3, 7 or a typed N offered) |
| Default break | alternate | winner breaks | alternate |
| Handicap levers | scoring, racks | scoring, racks | racks |

**Golden-Nine, as the DUYA Legends Tour standard rules state it** (the source is the
[English rules page](https://alison-chang.com/duya-legends-tour-golden-nine-standard-rules/)):

- Break and run, "Big Golden": **10**. Table run, "Small Golden": **7** — a legal 9 on the
  break, the breaker pocketing the 9 by combination during their inning, or a player who takes
  over with the 1 and the 9 still on the table and clears (a combination on the 9 doesn't count).
  Any other win: **4**.
- A player's first and second foul in a rack give the opponent **1 point each**. The third
  gives **2 points** and the rack is lost. The rules don't say whether the opponent also
  gets the 4-point win; we play the 1 + 1 + 2 = 4 as *being* the win, so a three-foul rack
  is worth 4 to the winner, the same as a normal win. One config value if a club plays it
  differently.
- Intentional fouls are forbidden: the first loses the rack and gives the opponent **10**,
  the second loses the match. The app records this from a long-press menu, not a big button.
- Matches are a scheduled number of racks; a tie after the last rack is settled by one more.
  Winner breaks. A 45-second shot clock with one 30-second extension per rack exists in the
  rules; the app leaves the clock out of v3.
- Other balls off the table stay off; only the 9 is respotted. Ball in hand after a foul.

**Trad-Nine:** WPA scoring, one rack is one rack, race to 5 (or 3, 7, or any N) with alternate
break, as played at Sessions. Fouls can be recorded per player per rack for the same look as
Golden-Nine, and never affect the result.

### 12.3 The live screen per game

The 11-Point-Nine screen is unchanged. Golden-Nine and Trad-Nine share one simpler screen built from
the same pieces: two score panels with the shooter tint, the lead bar, a **foul** tap under
each player (a small counter showing the points it gave away), and at rack end three big
**how did you win** buttons under the winner's side. Golden-Nine: Big Golden, Small Golden,
Win. Trad-Nine: Break and run, 9 on the break, Win. The same three-button pattern in both games
is deliberate. Undo, resume, watch and per-rack `patch` writes work as they do today.

### 12.4 Setup changes

- A **game** picker above the players. The app remembers the last game.
- **Handicap: off / scoring / racks.** With racks, setup shows the race chart from `ZARGO.md`
  as "race to 7 vs race to 4" and as a head start, both editable. With scoring, quotas as
  today. Off still feeds ratings.
- Length: racks (with the tie-break extra rack for Golden-Nine) or race to N.
- Who breaks first, with the game's default pre-filled.

### 12.5 Data

```
sessions/<id>
  game: "league" | "golden" | "standard"
  handicap: "off" | "scoring" | "racks"
  racks: {
    "1": { balls: {...}, breaker, at }                                   // 11-Point-Nine
    "1": { winner: "a", kind: "big" | "small" | "win" | "fouls" | "intentional",
           fouls: { a: 0, b: 2 }, breaker, at }                          // golden
    "1": { winner: "a", kind: "run" | "nine" | "win", fouls: { a, b }, breaker, at }  // standard
  }
  totals: { a, b, racksA, racksB, dead, lead, winner }

state/main.config.games.<game>: { points, w, defaults }
```

Built in 1.0.0: `game` and `handicap` are written on new matches and filled in on Export and
Import; documents without them read as `"league"` and `"scoring"`, and nothing is backfilled in
Firestore. `config.games` is merge-saved beside the old `config.points`, which stays readable.

### 12.6 Cuescore

Cuescore is where Sessions Billiard Club already lives: leagues, rankings and challenge
matches. Its [API](https://api.cuescore.com/) is read-only and in beta; challenges are created
and scored by hand inside a logged-in account, and no write or import path is documented. A
static app can't hold a Cuescore session, and automating it would mean a backend with stored
credentials and screen-scraping. So, in v3:

- Each person can carry a `cuescoreId`. Built in 1.0.0 as "Cuescore profile link" in the shared
  people sheet: paste the profile URL and the trailing number is kept. The sheet shows the
  field only when an app asks (`people.edit(id, { cuescore: true })`), so the darts and
  climbing apps are unchanged. Finding it by name through the read API is a later option.
- Session summary gets **Copy for Cuescore**: the two names, discipline, race and score in
  the shape the challenge form wants, plus a link to Cuescore's challenges page.
- A new player's starter Zargo can be hinted from their Cuescore rating (ZARGO.md, item 10).
- Automatic upload stays out until Cuescore offers a write API. ⚠ Worth an email to their
  support asking whether one is planned.

### 12.7 Beyond the household

The app stays invite-only. The Family screen already does what a club needs: any member can
add another member's Gmail, and only members can read anything. If club members join, the
shared people list becomes the club's list too: one flat list, no grouping. Club grouping is
a possible later change, not a v3 one.

### 12.8 Name

The app is called **Rack It** from v3. The folder, URL, manifest id and Firestore namespace
stay `fair-nine`, because changing any of them breaks installed copies or orphans the data.
The rating keeps its own name, **Zargo**, and the app says so wherever a rating is shown.

### 12.9 11-Point-Nine racks are weighted by their live points

ZARGO.md gives an 11-Point-Nine rack `w = 1`. Taken literally, per-rack shares averaged with equal weight
differ from §3.3's pooled share whenever racks carry different live points (dead balls). So
1.0.0 spreads the 11-Point-Nine `w` over a match's racks in proportion to each rack's live points:
`w_i = w × live_i / mean live per rack`. The weights still sum to `w × racks`, so robustness
and the update equal §3.3 exactly, and a rack mostly lost to dead balls says less. Checked
against seven stored matches (several with dead balls): identical to floating-point precision.

### 12.10 Golden-Nine and Trad-Nine as built (1.1.0)

- **Setup.** Game chips above the players, remembered per phone in `localStorage`
  (`fair-nine.game`). 11-Point-Nine keeps its race / fixed / open picker unchanged. Golden-Nine is
  fixed racks (default 5) with the scoring handicap. Trad-Nine is a level race to 3, 5, 7 or a typed N (1 to 30) with
  `handicap: "off"`: it has no points to share, and the Racks lever is Session 3.
- **Live screen.** The diamond rack is swapped for a Foul button and three win buttons under
  each player. Foul shows that rack's count and, in Golden-Nine, the points it gave away. A
  foul passes the shot to the opponent (ball in hand). Golden-Nine's intentional foul is a
  long-press on Foul and asks first. Next rack is hidden, since a win tap ends the rack.
- **Rack end.** A win tap, or a third Golden-Nine foul, shows the rack card with **Start rack
  N** and **Undo that**. Golden-Nine: the rack winner breaks next. After the last scheduled
  rack a tie offers **Play a deciding rack** (adds one to `racksPlanned`, written to the
  match) or **Call it a tie**. A second intentional foul by one player ends the match for the
  other, whatever the score. End during a rack with no winner drops that rack, and says so
  if fouls had already given points.
- **Who wins.** Handicap scoring: the adjusted lead, as 11-Point-Nine. Handicap off: the plain
  difference. A Golden-Nine or Trad-Nine race goes to whoever met their own target.
- **Lead bar.** Golden-Nine's quotas are the expected rack-win share of the points scored so
  far, floored at 4 points per planned rack, so a first rack reads +40% as it does in 11-Point-Nine
  rather than +100%. Handicap off shows the plain lead in racks ("MEL +1 rack"), full swing
  at a lead the size of the race.
- **Totals** carry `racksA` and `racksB` in every game. An 11-Point-Nine rack counts to whoever took
  more of its live points. In Trad-Nine `a` and `b` are racks.
- **Rating.** Golden-Nine and Trad-Nine racks give `r = 1` or `0` by winner, with the game's `w`
  (0.5). Checked in a test build against hand-worked ZARGO.md numbers for both games.

---

## 13. Planned v3 — information architecture

A phone-first pass over how the app is organised, done before v3 is built so the new games
land in a shape that already fits them. Today Home is a player list above six equal buttons,
setup is one long page, and History is one list for everyone. That works for a household and
one game. It won't for three games, a handicap choice, and a club's worth of people.

### 13.1 Four places, one bar

A bottom bar with four tabs, each a thumb-reach 56px target, replaces the button pile:

| Tab | What it is | First thing you see |
|---|---|---|
| **Play** | start a match, or get back to the one that's on | the live match if there is one, else setup |
| **Ratings** | everyone, ranked by Zargo | the list; tap a name for their page |
| **Matches** | every match, newest first, live ones on top | the list; tap a row to resume, watch or review |
| **More** | everything that isn't playing | Members, Export, Import, Install, About Zargo, Sign out |

The app opens on **Ratings** when nothing is live and on **Play** when something is. A live
match also shows as a slim bar above the tabs on every screen, with Resume and Watch, so the
scorer's phone and a watcher's phone both get back in one tap.

### 13.2 Words

- **Match**, not session. Nobody at a table says session.
- **Members**, not Family, once the list holds people from the club. The CLAUDE.md name for
  the mechanism doesn't change; only the label does.
- **Zargo** is always shown with its robustness and, on the person's page, one sentence on
  what it means and how it moves. "Provisional" stays as the word for under 30.
- The three games are labelled **Trad-Nine**, **Golden-Nine** and **11-Point-Nine**, in that
  order (renamed in 1.1.1 from 9-ball, Golden Nine and League). Stored `game` values stay
  `"standard"`, `"golden"` and `"league"`.

### 13.3 Play: setup that fits one screen

One page, defaults first, Start pinned to the bottom so it never scrolls away:

1. **Game** — three chips. The last game played is pre-selected.
2. **Players** — the two columns as today, "you" pre-selected on the blue side, most recent
   opponents first on the amber side. Beyond about eight people the columns become a
   searchable list; not needed yet.
3. **Length** — one field with the game's default (11-Point-Nine 5 racks, Golden-Nine 5 racks with
   a tie-break, Trad-Nine race to 5). Tapping shows the alternatives (race, fixed, open; 5 or 7).
4. **Handicap** — chips: **Off · Scoring · Racks**, with the proposal underneath in one line
   ("Kenny to 7, Melanie to 4" or "Melanie starts 2 up"), editable by tapping it.
5. **Break** — one button, the game's default pre-filled.
6. **Start**.

Steps 3 to 5 sit behind their defaults: each is a single row until tapped, so a repeat of
last night's match is Game, two names, Start.

### 13.4 Ratings and a person's page

The Ratings list is the old Home list, ranked, with the same row: name, colour, Zargo,
robustness, provisional tag. Tapping a row opens **their page**: Zargo with the one-line
explanation, win records per game, their matches, and Edit (name, colour, starter rating,
Gmail, Cuescore id, merge, delete). This replaces the History chips and the edit-only path
to a rating.

### 13.5 Matches

One list, live first, then newest first. Each row: the two names and score, game, when, and
who won. Filtering by person lives on the person's page, not here. Delete stays the two-tap
arm-and-confirm on the row. Tapping a finished match opens its summary: result, racks, Zargo
movement, and **Copy for Cuescore**.

### 13.6 Live match

The 11-Point-Nine screen is unchanged. Golden-Nine and Trad-Nine share the simpler screen in §12.3.
The screen chrome is the same in all three: names and scores in the two panels, lead bar,
rack strip, controls. Rack end and the match summary are one design for every game.

### 13.7 More

Members (add by Gmail, remove, share the app link), Export, Import, Install on this phone,
About Zargo (the §3 maths in plain words), and Sign out. Nothing here is needed to play, so
it can live one tap away.
