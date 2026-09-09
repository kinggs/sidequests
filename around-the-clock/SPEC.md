# Around the Clock — Spec

A phone-first darts scorer, starting with the **180 Around the Clock** drill. It answers one
question for now: *am I getting better?* Players and a rating system come later; the shape
of the data is chosen so they can.

## Purpose

Log a drill dart by dart with as few taps as possible, keep every game, and show each
player's scores over time. Zero faff at the oche: look at the number, throw three darts,
tap three buttons.

## Who uses it

Kenny, mostly on his own as a practice drill, with room to add other people. Everyone
signs in with Google and sees the same live data. Anyone can log for anyone (one phone at
the board is normal), and anyone can add a player.

## The game: 180 Around the Clock

- Go **up** (1 → 20) or **down** (20 → 1). Pick before starting; the app remembers the last
  choice.
- Three darts at each number. Only that number scores: **single 1, double 2, treble 3**,
  anything else **0**. Twenty numbers × three darts × three points = **180**, the max.
- After the third dart the app moves to the next number by itself. After the twentieth
  number the game is over and is saved with its score.

## Screens

One page, two states.

1. **Home** — player chips (the signed-in person first and selected by default), an
   up/down toggle, and a big **Start** button. Below: **Progress** for a chosen player
   (best, last, average of the last ten; a line of scores over time; the last few games),
   **Recent** games with an armed two-tap delete, **Players** (add with name + optional
   Gmail, remove, Share link), and **Export / Import**.
2. **Game** — fixed to the screen, never scrolls. Top: the running total, large, with the
   player's name and "dart n of 60". Middle: the current number, huge, and three slots that
   fill with 0/1/2/3 as the darts go in; under them the previous number's three darts and
   what they added, so a slip is easy to spot. Bottom: five buttons in two rows. **S1 · D1 ·
   T1** across the top, in that order, labelled with the number you're on — S20 D20 T20 when
   you're on the 20 — because that's how every other darts app lays it out and the muscle
   memory should carry over. Underneath, **Undo** on the left (steps back one dart, across
   number boundaries, all the way to the first) and **Miss** on the right. A quiet armed
   **Abandon** sits below them. When the sixtieth dart lands, a finish panel shows the score
   against the player's best and average, the band it falls in, and the full guide, with
   **Play again** and **Done**.

A game in progress is written to the cloud after every dart, so a reload — or another
phone — picks it back up exactly where it was. The phone that was playing it also remembers
which game that was, so reopening the app (screen off, app killed, reload) drops straight
back into the game with no tap. A game started on another phone is offered through the
**Resume** banner instead. Done or Abandon forgets it.

## On the phone

- **Installs as a real app, fullscreen.** The manifest asks for `fullscreen` (falling back
  to `standalone`), portrait, and ships PNG icons (192, 512, maskable 512) as well as the
  SVG — without real PNGs Chrome makes a plain shortcut that opens in a browser tab, which
  is why an earlier install showed the URL bar. An older shortcut has to be removed and
  re-added to pick this up. As a belt and braces, the Start and Resume taps ask the browser
  for fullscreen themselves when the app isn't already in it, so a tab or an old shortcut
  still gets a clean game screen.
- **The screen stays awake** while the app is open (Screen Wake Lock), re-taken whenever
  the app comes back to the foreground. Nothing breaks if the phone refuses it.

## Guide to your performance

The finish panel puts the score in a band and says how far the next one is, then lists all
seven so the whole ladder is visible with the achieved one picked out:

| Score | Band |
|---|---|
| 130+ | Professional territory |
| 110–129 | County standard |
| 90–109 | Strong league player |
| 75–89 | Regular player |
| 60–74 | Solid club standard |
| 45–59 | Finding the numbers |
| 0–44 | Building the round |

The two anchors are the ones this drill is always quoted with: 60 is a single on every dart,
and a club player aims at 75–80. The rest are spaced out from there and are a guide, not
gospel — they live in one `BANDS` list at the top of the script, so changing them is a
one-line edit. Note this app scores a double 2 where some versions of the drill score it 1,
so scores here run slightly higher than a table written for that version.

## Data model

Everything under `sidequests/around-the-clock/` via `shared/cloud.js`.

- `state/main` — `{ players: { <id>: { name, email, createdAt, deleted } }, direction: "up"|"down" }`
  Removal is a soft delete so old games keep their name.
- `games/<id>` — one document per game:
  `{ game: "atc180", player: <playerId>, direction: "up"|"down", darts: [0-3 …], score, at: <epoch ms>, endedAt, status: "live"|"done", by: <email> }`

`darts` is the whole record; `score` is stored too so lists and charts don't have to add
it up. `game` names the drill so other games can share the collection later.

## Out of scope (for now)

- Other games (501, cricket), and the rating system. The `game` field and per-player
  documents are there so they slot in.
- Head-to-head play. One player per game.
- Per-dart timing, checkout stats, anything that needs a server.

## Decisions (assumed, not specified)

- A fourth button, **Miss**, for a dart that doesn't hit the number. Without it there's no
  way to log a zero.
- The app auto-advances after three darts rather than waiting for a "next" tap, as asked;
  the previous number's darts stay visible underneath so you can check what went in.
- Undo is one dart at a time, unlimited depth, and works across number boundaries.
- Players are people, not accounts, exactly as in Bloc 11: on sign-in you're matched to a
  player by email, then by first name, or added fresh, and the chips point at you until you
  tap someone else.
- Deleting a finished game is a two-tap arm-and-confirm; abandoning a live game is the same.
