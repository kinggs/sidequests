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
- A rack is complete when all nine balls have a state. `pointsA + pointsB + deadPoints === 11` always holds for a complete rack. This is a hard invariant, not a warning — surface it at rack end and don't let a rack be banked if it fails.
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

Display this as one plain sentence — *"Sarah ahead by 3"* — never as "adjusted points". Raw scores are shown alongside.

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

## 4. Session modes

1. **Race to target** — pick a rough length (default 5 racks). App proposes `targetA = round(11 × racks × expectedShareA)` and `targetB` likewise; both editable. When either player reaches their target, **finish the current rack**, then declare.
2. **Fixed racks** — play N racks, then declare.
3. **Open** — play until someone taps End, then declare.

---

## 5. Screens

### 5.1 Home
- Sign-in state (Google). If signed out, a single big Sign in button and nothing else.
- List of players with Zargo, robustness, and a provisional tag where relevant.
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
- The one-line lead sentence under the scores.
- Rack-end check: when all nine are resolved, show the 11-point check and a Next rack button; refuse to bank a rack that doesn't total 11.
- Live sync: the session document updates after every ball so a second phone can watch.

### 5.4 Session summary
- Winner sentence, raw scores, racks, dead balls.
- Zargo movement for both players: `512 → 519`.
- Save, or Discard (discarding never touches ratings).

### 5.5 History
Per player: reverse-chronological list of sessions — date, opponent, mode, score, result. No charts yet.

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
- S7 — Be told when the table's clear and whether the rack totals 11.
- S8 — End at any time and get a fair result.
- S9 — Watch a live session from a second phone.

**After**
- A1 — See a summary with Zargo movement.
- A2 — Discard a session.
- A3 — Browse history per player.

**Data**
- D1 — Sign in with Google; see nothing until signed in.
- D2 — Keep scoring offline; sync when back.
- D3 — Export and import JSON.

---

## 8. Edge cases

- Session with zero complete racks → discard silently; ratings untouched.
- Abandoned mid-rack → that rack is dropped; complete racks count.
- Two new players (both at 500) → equal targets, both provisional.
- Same player picked for both sides → block it.
- Rack that doesn't total 11 → cannot be banked; must be corrected.
- Signed-in user not on the family list → sign-in succeeds but reads fail; show *"Ask Kenny to add your email"* rather than a raw error.

---

## 9. Out of scope

- Charts and trend lines.
- Shot-level stats, safeties, break statistics beyond who broke.
- Cross-household leagues.
- Anything but nine-ball.

---

## 10. Build order

1. Players with Zargo and robustness in `state/main`; sign-in gate.
2. Session setup with proposed targets.
3. Wire the existing live scoring screen to a session document (names, lead sentence, rack-end check, per-rack `patch`).
4. Summary with Zargo update; History.
5. Export/Import.
6. Second-phone live view (mostly free once 3 is done).
