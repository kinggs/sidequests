# Connect and shared games

How inviting, joining and playing one game on several phones work in the sidequests, as built in
Session 8 (`KIT-PLAN.md`, `KIT-HISTORY.md`). It started as the design pack's
`design_handoff/shared/CONNECT.md`; where they differ, this file says what was built and why.
The look is `DESIGN.md`; the parts are `KIT.md`.

## 1. One gesture, two QRs

A phone shows a QR; the other phone's camera opens the app. Both QRs are `connect.showQR`, the
same screen with a different headline. Each holds the screen on and has **Copy link**.

- **My QR** connects two people: `…/<app>/?i=<code>`. The code lasts 24 hours and renews itself.
- **Game QR** ("Join Kenny's match"): `…/<app>/?g=<game id>&i=<code>`, from the play screen's
  `⋯` → **Invite to this game**. The scan makes the friendship first, exactly as My QR does,
  then opens the game. The screen stays up and the app says who joined ("Rolf joined · lilac
  side", `qr.say`). Only the game's starter shows it: a seat is taken only by someone connected
  to the starter.
- **League QR**: not built (Parked in `KIT-PLAN.md`). It needs a code that outlives a day.

`connect.handleInvite` keeps `?i=` and `?g=` through the Google sign-in redirect. Signed out, the
card reads "Join Kenny's match" for a Game QR. Once the friendship is made, or was already
there, it hands the app `onDone({ uid, name, game })` and the app shows the game.

## 2. Where inviting lives

- **Setup**: "Who's playing" is `.chips`: you, whoever played lately, then friends and guests,
  then **Show QR** (My QR: whoever scans is picked) and **+ Add a guest**. A friend picked here
  is in the game's `uids`, so their phone's Home shows a `.resume` card, "Kenny's match · you're
  in", with **Open**. There are no notifications; the card is the invite.
- **In play**: the `⋯` sheet's **Invite to this game** (the starter's phone).
- **Friends** live in the account sheet.

## 3. Joining: seats

The join card lists the game's guest seats: "Which one are you?", "I'm Dan · lilac side". Taking
one is `seatSwap()` in the rules: exactly one player id that starts `g_` becomes the joiner's
uid, `uids` gains exactly that uid, and nothing else changes. `names` keeps "Dan": it's who sat
there then. A game with no guest seat left says it's full. A seat taken mid-game leaves it a
friendly, since a guest's game was one. Someone already in `uids` just opens the game.

The starter's phone remembers which of its live games' sides were its guests. When one is taken,
it says so and, once it isn't scoring, asks "Rolf took Dan's seat. That was Rolf?" for Dan's
other games.

**That was them** (`people.claim`): on a guest's page, or the account sheet's **Your guests**,
pick the friend and hold. Every record you started with that guest becomes the friend's, through
the same `seatSwap()`. The guest points at the friend (`claimedBy`), so `people.resolve` leads
there, and each app follows on its next open. In the open rule, score maps keyed by the guest's
id move with the seat (any player may change scores); `by` and `names` stay.

## 4. One game, many phones

Every phone in a game watches the same document and shows the same screen. In a table game (Rack
It) **anyone in the game may tap anything**.

- **The chain, not last-write-wins.** The pack had the last write win. Rack It saves the match
  as it stands, so a phone that was offline would rewind the game with its late writes. Instead
  every write carries `rev: { n, key, was }`, the next link: one more than the last `n` the phone
  knows, built on that `key`. The rules refuse a write built on a link that's gone. A plain
  counter isn't enough: a stale phone's third queued write would match it by luck
  (`shared/proofs/rev-probe.mjs`).
- **Catching up.** A phone whose write was refused, or that sees another phone's link, rebuilds
  the game from the document. One lost tap against one change of theirs is put back if what it
  touched is as it was. Otherwise: "Your tap didn't count: the other phone got there first."
- **The echo strip** (`.echo`): another phone changed the game in the last five seconds,
  "Melanie · 7 to Gareth", with **Undo**, which undoes their change as an ordinary write. A run of
  changes reads "3 changes while you were away", with no Undo. `log.<n>` records who made every
  change.
- **Light presence** (`.presence`), not the pack's heartbeat: `phones.<uid>.at`, stamped on
  open, on hide and with every score. Avatars under the match bar, "Melanie last seen 3 min
  ago". No "looking", no stale dot, no Nudge, no Remove. Why: six tables of three phones for
  three hours of 15-second heartbeats is about 13,000 writes and 39,000 reads, against free
  limits of 20,000 and 50,000 a day.
- **No watchers.** A game holds its players and at most one scorer.

**Turn games** (Zombie Dice, Session 9): only the current player's phone and the starter's are
live; everyone else gets the same screen dimmed (`.mirror`), and a `.done` moment says "Your
turn, Melanie" when it becomes theirs.

## 5. Scoring for someone else

Melanie scores Kenny against Rolf: she starts the match and isn't one of the players, so she's
its `scorer` (never in `uids`, which the ratings rule trusts to be the players). Her phone shows
a banner, "Scoring for Kenny and Rolf" (`.livestrip`). She scores and ends it, and may
**Withdraw**; she never confirms.

**Both sign.** A rated match needs every player who didn't end it to confirm. The first Confirm
adds only that player's key to `confirms`; the last is the one batch that moves both ratings and
finishes the match. Either player's **Not right** makes it a friendly at once. The players'
strip: "Kenny 5–3 You · rated · scored by Melanie". The scorer's: "Waiting for Kenny and Rolf to
confirm", then "Waiting for Rolf".

## 6. Signal

Everyone carries on. Writes queue in Firestore's cache and land, in order, when the signal
returns. A phone scoring alone offline loses nothing. A phone that comes back to a game that
moved on is refused its stale writes, catches up, and says what it missed. Nothing blocks a game
in a pub.

## 7. Words

"Show QR", "Join Kenny's match", "Copy link", "Rolf joined · lilac side", "I'm Dan", "Kenny's
match · you're in", "Melanie · 7 to Gareth · Undo", "3 changes while you were away", "last seen 3
min ago", "Scoring for Kenny and Rolf", "scored by Melanie", "Your turn". Never "sync",
"session", "lock", "host" or "client" on screen.

## 8. For the agent

- Invite: `const qr = connect.showQR({ app, game: { id, title } }); qr.say("Rolf joined")`.
  Join: `connect.handleInvite({ app, appName, onDone: r => r && r.game && join(r.game) })`.
- A record a seat may move into names its players and `uids`; the rules' `seatSwap()` checks the
  move (`rackSwap()` for Rack It's `playerA`/`playerB`, `openSwap()` for an open app's
  `players`).
- A live game's writes: `rev`, `log.<n>`, `phones.<uid>`, as Rack It's `send()` and `linkFields()`.
  The rules' `nextLink()` and `myPhone()` check them. Test with two `?mock` tabs and
  `cloud.network(false)` for the one that goes offline (`shared/proofs/rack-it-two-phones.mjs`).
- Parts: `.presence`, `.echo`, `.mirror`, `.livestrip`, `.livestrip.pend`, `.resume`. Session 9
  moves the echo strip and presence out of Rack It into `connect.js` or `ui.js` for Zombie Dice.
