# Zombie Dice — Spec

A version of **Zombie Dice** (Steve Jackson Games) to play round the table on one phone or
several. You're a zombie; each turn you roll for brains and push your
luck until you stop or get shot. First to 13 brains ends it.

## Who uses it

Anyone with a Google account, around the table, on one phone or several (since 0.3.0, the open
rule: `shared/KIT-PLAN.md` Session 7; several phones since 0.5.0, Session 9). One signed-in phone
is enough to play: pass it round. A friend picked at setup can play their turns on their own
phone instead (see **Several phones** below).

- **Players** (`shared/people.js`, Players in `shared/KIT.md`): you, your Connect friends and
  your guests, for everyone. Since 0.6.0 (KIT-PLAN Session 9) the household list is
  gone from this app, the owner's too: the owner's phone reads it once more, only until its
  one-time backfill has run.
- **That was them** (0.4.0, KIT-PLAN Session 8): your account sheet's **Your guests** lists the
  guests you've made; tap one who has since joined, pick the friend, hold. Each game you started
  with that guest becomes the friend's: their id replaces the guest's everywhere in it (seats,
  scores), `uids` gains them, and `names` keeps the name as it was. A guest claimed in another
  app is followed here the next time this app opens.
- **Who sees what.** A game is reached by the accounts in it (`uids`) and by the owner, who
  is the one admin and sees every game. A stranger signs in to an empty app of their own.
  Anyone else sees only the games they're in.
- **Old games.** The owner's phone backfills them once: ids resolved (a claimed person's
  becomes their uid), `names`, `uids` for the players with an account, and `by` as a uid.
  A person with no account keeps their person id and is read by `names`.

## Several phones (0.5.0, `shared/CONNECT.md` §4)

Every phone in a game watches the one game document, so each shows the same dice as they're
rolled and turned over.

- **Joining.** A friend picked at setup finds the game on Home: a card, "Kenny's game · you're
  in", with **Open**. Someone at the table who isn't in it yet scans the starter's **Game QR**
  (the game's `⋯` → **Invite to this game**, the starter's phone only): the scan connects them to
  the starter, then asks "Which one are you?" over the game's guest seats. "I'm Dan" puts them in
  Dan's seat, his score with it (the rules' `openSwap()`), and the starter's phone says "Rolf
  joined", then, from Home, offers **That was them** for Dan's other games.
- **Whose phone plays a turn.** A player's own phone, once they've opened the game on it;
  otherwise the starter's, so a guest, or a friend whose phone isn't out, still gets played. The
  starter's phone is always live. Every other phone shows the same screen with its controls dimmed
  (`.mirror`); the dice say whose they are ("Kenny's"), and nothing on it can be tapped but `⋯`.
- **Your turn.** When the turn comes round to a phone, it gets the full-screen moment: the last
  turn's result and **Your turn · Melanie**, **Go**. The phone that ended a turn says where the next
  one is: **Your turn**, **Pass the phone to Dan**, or **Melanie's turn · on their own phone**.
  With one phone alone, the cards read exactly as before.
- **The echo strip** (`ui.echo`): another phone's last move, "Kenny · Brain", "Mel · banked 3", for
  five seconds, over the presence row; "3 changes while you were away" after a gap. No Undo: a
  roll is a roll.
- **Presence** (`ui.presence`): an avatar for each other phone in the game and when it was last
  seen, stamped on open, on hide and with every write. No heartbeat.
- **Who wins a race.** Only a live phone writes the game, so two writers are rare (the starter's
  and the current player's). The newest write is the truth and every phone takes it. Nothing is
  rated, so the rules don't police whose turn it is (KIT-PLAN Session 9).

## The game

The dice (real set: 13 dice in a cup):

| Die | How many | Brains | Feet | Shotguns |
|---|---|---|---|---|
| Green | 6 | 3 | 2 | 1 |
| Yellow | 4 | 2 | 2 | 2 |
| Red | 3 | 1 | 2 | 3 |

A turn:

1. **Roll** takes dice from the cup until you hold three, then rolls them. The cup is
   random; you don't choose which colours you get. The dice land **face down**, and the
   player **taps each one** to turn it over and count it — a brain chomps into the Eaten
   pile, a shotgun kicks into the Shot pile, feet hop and stay to be rolled again. Roll and
   Stop wake up only once all three are counted. A third shotgun ends the turn on the tap
   that reveals it (the rest turn over by themselves).
2. **Brains** are eaten — set aside and counted for this turn. **Shotguns** are set aside.
   **Feet** mean the victim ran: those dice stay in your hand and are rolled again next time.
3. **Three shotguns** (across the whole turn) and you're shot: the turn ends and you lose
   every brain from it.
4. Otherwise **Stop** banks this turn's brains onto your score, or **Roll** again: your feet
   dice plus new ones from the cup, back up to three.
5. If the cup runs short for the next roll, the eaten brain dice all go back in the cup
   (shotguns stay out) — you keep the count. A "Cup's empty!" card says so, and the Eaten
   pile shows "+N kept from before the refill".

### Hunk & Hottie (Zombie Dice 2: Double Feature)

A toggle on the home screen, remembered on the phone. Two yellow dice come out of the cup
and two black heroes go in:

| Die | Faces |
|---|---|
| Hunk (white ring) | 2 feet, 2 shotguns, 1 **double shotgun**, 1 **double brain** |
| Hottie (pink ring) | 3 feet, 2 shotguns, 1 brain |

Double brain counts 2, double shotgun counts 2. **They rescue each other:** when one of them
comes up shotgun while the other is in your brain pile — eaten earlier or on the same roll —
the other is rescued: out of the pile, back in the cup, and its brains come off your turn.
A pink card with floating hearts says "The Hunk saves the Hottie!". A hero whose brain die
went back in the cup at a refill can't be rescued any more.

Unlike Yahtzee there's no choosing which dice to keep: brains and shotguns always stay out
and feet always get rerolled. The only choice is **roll again or stop**.

End: when anyone reaches **13** at the end of their turn, the round is played out so everyone
has had the same number of turns (the round starts with the first player picked). Most
brains wins. A tie at the top is played off: the tied players take one more round each,
again and again until one leads.

## Look

`shared/theme.css` (dark system v3, `shared/DESIGN.md`). Lime (`--accent`) marks the data
only: whose turn it is and the brains count. Coral (`--accent-2`) is a shot and a bust. The dice are drawn like the real ones — green, yellow and
red dice, each face a cream disc with a pink **brain**, dark **footprints** or an orange
**shotgun blast** — with the face's name under it ("Brain", "Ran", "Shot") so nobody has
to learn the icons. Players show as `people.avatar`.

## Screens

1. **Home** — your avatar top right opens your sheet: Profile, My QR, Friends, Export, Import
   (the owner's), Install on this phone, Sign out. Player chips (you, friends, guests); tap
   names in playing order (up to 8), tap again to drop. **Show QR** (whoever scans joins the
   lineup and your Friends) and **Add a guest**. A line spells out the order. **Start**. A
   **Resume** row for any unfinished game. **How to play** (collapsed). **Leaderboard** (wins
   and games per person). **Recent** games; a row's `⋯` holds **Hold to delete** for whoever
   started it, or the owner.
2. **Game** — fixed to the screen, header hidden, screen held awake. Top: a scoreboard of
   every player with avatar, name and score, the thrower lit. Then whose turn it is, a
   banner in the final round or a play-off, and three figures: brains this turn, shotguns
   (three slots), dice left in the cup (coloured dots). The tray: the three dice just
   rolled, big, tumbling in face down and nudging to be tapped; each flips over on its tap
   with a little chomp, kick or hop (all still for reduced motion). Under it the brains and shotguns set aside this
   turn as small dice. Bottom: **Stop · bank N** and a big **Roll**, and one quiet `⋯`
   that opens **Home**, and for whoever started the game **Invite to this game** and **Hold to
   abandon the game**. With other phones in the game: their avatars under the scoreboard, the
   echo strip, and the controls dimmed while it isn't this phone's turn. The scoreboard is the theme's player
   panels (`.pl`), one line each with five or more players or on a short phone.
3. **Hand-over** — when a turn ends, a full-screen moment (`.done`) says what happened ("Banked 5 — Kenny's on 9",
   or "Shot! Lost 4 brains") and **Pass to Melanie**, whose tap starts their turn. That's
   the pass-the-phone moment. With several phones it says where the next turn is (above), and a
   phone whose turn it becomes gets its own **Your turn** moment.
4. **Finish** — the winner, everyone ranked with their score, **Play again** (same players,
   same order) and **Done**.

A game in progress is saved after every roll, so a reload picks it up where it was. The
phone remembers which game it was playing and drops straight back in.

## Data model

Under `sidequests/zombie-dice/` via `shared/cloud.js`; people at `sidequests/_shared/people/`.

- `games/<id>` — `{ game: "zombie-dice", players: [personId…], seats: [personId…] (who
  plays this round — everyone, or the tied players in a play-off), hh: Hunk & Hottie on,
  scores: { personId: n }, turn: <index into seats>, round, phase: "play"|"final"|"playoff",
  t: { cup: ["g"|"y"|"r"|"h"|"t"…], hand: [runner dice], brainDice: [{ c, v }],
  shotDice: [{ c, n }], brains, shots, rolls, refills, rescues,
  last: [{ c, f: "B"|"D"|"F"|"S"|"X", done }] }, turns: [{ p, brains, bust, rolls, rescues,
  total }], winner, status: "live"|"done", seq, at, endedAt, by: <uid>, names: [name…] (beside
  players), uids: [the accounts among players], rev: { n, key, by, at, say } (the last write:
  whose phone, and what it did, for the echo strip), phones: { <uid>: { at } } (presence) }`

  The rules (`openApps()` in `shared/firestore.rules`): you start a game only as yourself, in
  it, with at most 8 players, and only naming accounts you're connected to; a player in it plays
  on but never changes `uids`, `players` or `by`; whoever started it deletes it. Someone connected
  to whoever started a live game may get it by id (never list it) and take one guest's seat. The
  owner reaches everything.

  A roll is decided when Roll is tapped and saved with every die `done: false`; each tap
  flips one to `done` and applies it, so a reload mid-roll keeps the unrevealed dice.

Stored ids are read back through `people.resolve`.

## Out of scope (for now)

- Watching a game you aren't in, removing a phone, a heartbeat or a Nudge (KIT-PLAN Parked).
- Santa and the other expansions.

## Decisions (assumed, not specified)

- Target 13, and the official end: finish the round, play off ties.
- One player can play alone (practice: how few turns to 13?).
- Abandon deletes the unfinished game; it doesn't count anywhere.
- The share link went in 0.3.0: anyone can sign in now, and a friend joins with My QR.
- No undo: a roll is a roll, and Stop sits well away from Roll.
