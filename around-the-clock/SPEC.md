# Around the Clock — Spec

A phone-first darts scorer, starting with the **180 Around the Clock** drill. It answers one
question for now: *am I getting better?* One player practises on their own, or two to four
take turns at the board. A rating system comes later; the shape of the data is chosen so it
can.

## Purpose

Log a drill dart by dart with as few taps as possible, keep every game, and show each
player's scores over time. Zero faff at the oche: look at the number, throw three darts,
tap three buttons.

## Who uses it

Kenny, mostly on his own as a practice drill, and with Melanie or friends as a match. Since
0.8.0 anyone with a Google account (the open rule, `shared/KIT-PLAN.md` Session 7). One phone
at the board logs for everyone in the game.

- **Players** (`shared/people.js`): you, your Connect friends and your guests. The owner's
  picker also holds the household list, which only the owner keeps (**The household** at the
  bottom of Home).
- **That was them** (0.9.0, KIT-PLAN Session 8): your account sheet's **Your guests** lists the
  guests you've made; tap one who has since joined, pick the friend, hold. Each game you started
  with that guest becomes the friend's: their id replaces the guest's everywhere in it (seats,
  scores), `uids` gains them, and `names` keeps the name as it was. A guest claimed in another
  app is followed here the next time this app opens.
- **Who sees what.** A game is reached by the accounts in it (`uids`) and by the owner, who
  sees every game. A stranger signs in to an empty app of their own; anyone else, a household
  member included, sees only the games they're in.
- **Old games.** The owner's phone backfills them once, in today's shape: ids resolved,
  `names`, `uids` and `by` as a uid. A person with no account keeps their person id, read by
  `names`.

## The game: 180 Around the Clock

- Go **up** (1 → 20) or **down** (20 → 1). Pick before starting; the app remembers the last
  choice. Everyone in a match goes the same way.
- Three darts at each number, aiming at the treble. Only that number scores: **single 1,
  double 1, treble 3**, anything else **0**. A double is a poor throw at the treble, so it
  scores the same as a single ([darts501](https://darts501.com/180AroundtheClock.html), and the
  [Portsmouth Darts Academy rules sheet](https://portsmouthdartsacademy.co.uk/wp-content/uploads/2019/02/180-Around-the-Clock.pdf)).
  Twenty numbers × three darts × three points = **180**, the max.
- After the third dart the app moves to the next number by itself. After the twentieth
  number that player is done; the game is over and saved when everyone is.
- **In a match** the third dart also passes the darts on: the next player throws their three
  at their own number, and so on round the table. Each player works through their own 1–20.

## Look

`shared/theme.css` (dark system v3, `shared/DESIGN.md`). Players show as avatars (their photo
in a ring of their colour, or their initial) on chips, in the household list, on the game
panels (the theme's `.pl`; avatar hidden when three or four are playing) and in match results.
Sky is the app's accent
and only marks data: the thrower's panel and name, the next dart's slot, the score line, the
band you landed in. Picking players and the direction is a neutral light fill. Single, double
and treble keep their own colours.

## Screens

One page, three states.

1. **Home** — player chips (the signed-in person first and selected by default). Tap more
   names to make a match, in throwing order, up to four; the chips show the order and a line
   underneath spells it out ("Kenny, then Melanie — three darts each…"). Tap a picked name to
   drop it. Then an up/down toggle and a big **Start** ("Start · 2 players" for a match).
   Below: **Progress** for a chosen player (best, last, average of the last ten; a line of
   scores over time) counting their solo games and matches alike, **Recent** games with an
   a `⋯` that holds **Hold to delete** for whoever started it, or the owner (a match reads
   "Melanie 87 · Kenny 84"), and for the owner **The household** (the shared sheet: name,
   colour, optional Gmail, merge, remove from every app). Setup offers **Show QR** (whoever
   scans joins the lineup and your Friends) and **Add a guest**. Your avatar top right opens
   Profile, My QR, Friends, Export, Import (the owner's), Install on this phone, Sign out.
2. **Game** — fixed to the screen, never scrolls; the app header is hidden to give it room.
   Top: one panel per player with their avatar, name and running total, large; in a
   match each panel also says the number that player is on, the thrower's panel is lit in
   the accent colour, and **tapping another player's panel hands them the darts** (for a
   throw out of turn or a scorer's slip — it never skips anyone who has finished). Under the
   panels, "dart n of 60" for the thrower and the direction. Middle: in a match, the
   thrower's name in large accent type; then the current number, huge, and three slots that
   fill with each dart's points (0, 1 or 3) in the colour of what it hit as the darts go in; under them the last complete visit and what it
   added, so a slip is easy to spot — on your own, your previous number; in a match, the
   visit just thrown by whoever handed over, until the next player starts. Bottom: five
   buttons in two rows. **S1 · D1 · T1** across the top, in that order, labelled with the
   number you're on — S20 D20 T20 when you're on the 20 — because that's how every other
   darts app lays it out and the muscle memory should carry over. Underneath, **Undo** on
   the left (steps back one dart at a time, across numbers and across players, all the way
   to the first — and hands the darts back to whoever threw it) and **Miss** on the right.
   **Hold to abandon** sits below them.
3. **Finish** — when the last dart lands. On your own: the score against your best and
   average, the band it falls in, how far the next band is, and the full guide. In a match:
   who won (or "Tied on 84"), then each player ranked with their score, their band and a new
   best if it is one, and the guide with every player's band picked out and named. **Play
   again** (same players, same order, same direction) and **Done**.

A game in progress is written to the cloud after every dart, turn included, so a reload — or
another phone — picks it back up exactly where it was. The phone that was playing it also
remembers which game that was, so reopening the app (screen off, app killed, reload) drops
straight back into the game with no tap. A game started on another phone is offered through
the **Resume** banner instead. Done or Abandon forgets it.

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
- A turn passing buzzes differently from a dart landing, so the scorer feels the hand-over.

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
one-line edit.

## Data model

Players live in the shared people list, `sidequests/_shared/people/<id>`, via
`shared/people.js`. Everything else is under `sidequests/around-the-clock/` via
`shared/cloud.js`.

- `state/main` — the owner's alone since 0.8.0: `players` from before people were shared
  (`{ <id>: { name, email, createdAt, deleted } }`), which people.js adopted into the shared
  list under the same ids, and an old `direction`. The direction is now each phone's own
  (`localStorage`).
- `games/<id>` — one document per game, solo or match:
  `{ game: "atc180", players: [<personId> …], throws: { <personId>: [0-3 …] } (what each dart hit: 0 miss, 1 single, 2 double, 3 treble; points come from `POINTS`), scores: { <personId>: n }, turn: <index into players>, log: [<player index per dart, in throwing order>], direction, at: <epoch ms>, endedAt, status: "live"|"done", by: <uid>, names: [name…] (beside players), uids: [the accounts among players] }`

  The rules (`openApps()` in `shared/firestore.rules`): you start a game only as yourself, in
  it, with at most 8 players, naming only accounts you're connected to; a player plays on but
  never changes `uids`, `players` or `by`; whoever started it deletes it. The owner reaches all.

`throws` is the whole record; `scores` is stored too so lists don't have to add it up. `log`
is what lets Undo step back across players. Games from before multiplayer have
`{ player, darts: [...], score }` instead and read as a one-player game; the owner's backfill
(0.8.0) writes them in today's shape. Every stored player id is read through `people.resolve`, so a player who was
adopted or merged still finds all their games. `game` names the drill so other games can
share the collection later.

## Out of scope (for now)

- Other games (501, cricket), and the rating system. The `game` field and per-player
  scores are there so they slot in.
- Handicaps in a match; more than four players.
- Per-dart timing, checkout stats, anything that needs a server.

## Decisions (assumed, not specified)

- **A double scores 1** (0.7.0), as the published drill has it. Until then the app scored it
  2. Darts are stored as what they hit, not their points, so every past game was rescored
  at once; scores with doubles in them dropped by one per double.
- A fourth button, **Miss**, for a dart that doesn't hit the number. Without it there's no
  way to log a zero.
- The app auto-advances after three darts rather than waiting for a "next" tap, as asked;
  the previous visit stays visible underneath so you can check what went in.
- Undo is one dart at a time, unlimited depth, and works across number and player boundaries.
- Players are people, not accounts, and shared across the apps: on sign-in you're matched to
  a person by email, then by first name, or added fresh, and the chips point at you until you
  tap someone else.
- Tapping a name adds it to the lineup (it used to switch to that player). One name picked
  is a solo game, exactly as before.
- Adding a player drops them straight into the lineup, since they're usually about to throw.
- Play again keeps the order; nobody rotates to throw first.
- The finish panel shows before the save reaches the cloud, so it appears even with no signal.
- Deleting a game and abandoning a live one are 600ms holds (0.8.0; they were two taps).
