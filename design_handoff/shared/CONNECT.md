# Connect and shared games — the design

> **Merged into `shared/KIT-PLAN.md` on 2026-10-02.** Where this pack and the plan disagree, the
> plan wins: see its "Where the plan overrides the pack". Build from the plan's sessions, not from
> the "Suggested order" or the prompt below.

How inviting, joining, playing one game on several phones, and leagues work in every sidequest.
Companion to `DESIGN.md`. Builds on what Connect already does (My QR, friends, Rated + Confirm).

## 1. Two QRs, one gesture

The owner's phone shows a QR; the other phone's camera opens the app. That is the only gesture
anyone learns. Three codes sit behind it, all on the same screen (`connect.showQR`) with a
different headline:

- **My QR** connects two people (exists). "My QR". Lasts a day.
- **Game QR** seats a phone in *this* game: "Join Kenny's match". Scanning it also connects
  you if you weren't, so a stranger at the table becomes a friend and a player in one scan.
  Lasts while the game is live. Link `…/rack-it/?g=<gameId>&i=<code>`; the same link is what
  **Copy link** puts on WhatsApp.
- **League QR** joins a league: "Join Tuesday Nine at Zargo's". Lasts the season.

Big white QR on the app ground, your avatar and name above, one line under, Copy link below.
It holds the screen on. Whoever scans appears live on the host's screen ("Gareth joined").

## 2. Where inviting lives

- **Setup** (Home's first section): "Who's playing" is `.chips` of recent players and friends,
  then two chips that look the same: **Show QR** and **Add a guest**. Someone who scans appears
  as a chip, already chosen. Tapping a friend chip who isn't here also *invites* them: the next
  time they open the app, Home shows a `.resume` card "Kenny's match · you're in" with **Open**.
  There is no notification system (Parked); the card is the notification.
- **In play**: the `⋯` sheet has "Invite to this game" (Game QR) and "Who's here".
- **Friends** and **Leagues** live in the account sheet (avatar → Friends / Leagues), not on the
  page. A league also appears as a row in Setup once you're in one.

## 3. One game, many phones

Every phone in a game watches the same document and shows the same screen: the **full mirror**,
dice tumbling and all. The rules for who may tap are two sentences:

- **Table games** (Rack It): **anyone in the game may tap anything.** Last write wins. A tap
  lands at once on your phone; the document carries `by` and `at` for the last change.
- **Turn games** (Zombie Dice, Around the Clock match): **only the current player's phone is
  live**; the host's phone (whoever started the game) is always live too, so a player with no
  phone, or a flat battery, still gets scored. Everyone else is a mirror.

A mirror keeps every control in place, dimmed to `--faint` and not tappable (`.mirror`), so the
layout never jumps when it becomes live. When it becomes live, a `.done` moment says "Your turn,
Melanie" with the one button they need.

### The echo strip
When another phone changed the game in the last five seconds, a strip under the player panels
says what happened: **"Melanie · 7 to Gareth · Undo"** (`.echo`, in `--accent-2-soft`). Undo on
it undoes *their* change. It is how two scorers notice each other; there is no lock and no
countdown. If both tap within a second, the second tap wins and the first phone's echo strip
shows the override; Undo puts it right. The match log records `by` for every change.

### Presence
`.presence`, under the panels: an avatar per phone in the game. The one being looked at right
now is full colour with "looking" in its sheet; a phone not heard from for 20s has a `--warn`
dot; a watcher (not a player) has a grey ring. Tapping an avatar opens a sheet: name, "looking" /
"last seen 3 min ago", **Nudge** (buzz their phone, once a minute), and for the host, **Remove**.

### Scoring for someone else
Melanie scores Kenny vs Rolf. Her phone shows a banner over the panels: **"Scoring for Kenny and
Rolf"** (`.livestrip`, neutral). Nothing else changes. If the match is rated, **both** players
confirm on their own phones; the scorer sees "Waiting for Kenny and Rolf" with **Withdraw**. The
existing pending strip does this, now a theme part (`.livestrip.pend`).

## 4. Signal

- Everyone carries on. Writes queue in Firestore's cache and land when the signal returns.
- A phone that reconnects and finds the game moved on shows its echo strip with what it missed
  ("3 changes while you were away"), then catches up. A stale phone's taps still land; they are
  simply late, and the echo strips on the other phones say so.
- Nothing ever blocks a game in a pub.

## 5. Leagues (Rack It)

A league is the owner's: a name, a venue, a season (start and end), and its own QR. Players join
by scanning it (or from the account sheet, Leagues → Join). At setup, **League** is a row in the
settings card, offered when both players are in the same league; picking it makes the match
rated. The league page is a `.rows` table: rank, avatar, name, then `wins · racks` as the
sub-line and the Zargo as the row figure, with a `.lbl` strip of the season under the title and
the recent confirmed matches below.

## 6. Words

"Show QR", "Join Kenny's match", "Copy link", "Gareth joined", "Watching", "Your turn", "Melanie ·
7 to Gareth · Undo", "looking", "last seen 3 min ago", "Scoring for Kenny and Rolf", "Nudge".
Never "sync", "session", "lock", "host" or "client" on screen.

## 7. For the agent

- Invite: `connect.showQR({ app, game })` or `({ league })`. Join: `connect.handleInvite` already
  runs at load; it reads `?g=` and `?l=` beside `?i=`.
- The game document carries `phones: { uid: { seenAt, looking } }`, `by`, `at`, and for turn
  games `turn`. Every phone writes its own `phones[uid]` every 15s while the screen is open.
- A turn game enables controls when `turn === me || host === me`. A table game always.
- Parts: `.presence`, `.echo`, `.mirror`, `.livestrip` (scoring for), `.livestrip.pend`
  (confirm). Behaviours: `ui.echo(change)`, `ui.presence(hostEl, phones)`.
