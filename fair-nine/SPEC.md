# Fair Nine — Spec v2

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

This is **not** standard nine-ball. In standard rules the game ends when the 9 is legally pocketed. In this household's league variant:

- Play continues until **all nine balls are off the table**. Sinking the 9 early ends nothing.
- Balls 1–8 score **1 point** each; the 9 scores **3**. Every rack is worth **11 live points**.
- A ball pocketed on a foul or scratch is **dead**: it stays down, scores for nobody, and the shooter loses their turn.
- A rack is complete when all nine balls have a state. `pointsA + pointsB + deadPoints === 11` should hold for a complete rack, and normally does. Surface a **soft warning** at rack end when it doesn't — it's nearly always a mis-tap — but let the rack be banked as it stands, because real racks sometimes go odd (a ball off the table, a ball nobody saw drop). Going back to fix it is the default action; banking anyway is the clearly-labelled second option.
- Who breaks is recorded per rack (default: alternate; the app pre-fills and the user can flip it).

Point values live in config (`{ low: 1, nine: 3 }`) so the 10-point APA-style variant is one edit.

---

## 3. Zargo ratings and handicap

Zargo borrows FargoRate's scale and its trust measure, and swaps what's being measured. Fargo rates **game wins** in races; this league scores **point share** within racks, so Zargo rates point share. A Zargo 500 and a Fargo 500 are unrelated numbers and the app's About text says so.

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
    <playerId>: { name, colour, zargo, robustness, sessions, createdAt }
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
without it.

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
  jumping all the way on session 1, half on 2, a third on 3) while the known player's rating
  holds as the anchor; two settling players use the standard formula boosted 4×/3×/2× with a
  ±120 clamp. From 3 sessions the spec-3.3 formula applies as written.
- **Players can be deleted** (edit form, confirmed). Soft delete: they leave every list and
  picker but their sessions keep their name in History.
