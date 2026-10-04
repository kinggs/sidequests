# The kit — what's next

Sidequests opened beyond the family in Sessions 0 to 9 (2026-10-01 to 2026-10-03): accounts,
Connect, Players, rated matches, the v3 look, one game on several phones, and one admin with
everyone else an account. That plan is finished; how it went, step by step, is
`shared/KIT-HISTORY.md`. What every part does now is `shared/KIT.md`.

This file keeps the decisions behind it, **Session 10** (the last loose ends, then Sessions Loyalty
meets Rack It), and **Parked**.

**Every step**, as before: `make verify` passes (`node --test` and the smoke test), one scored
11-Point-Nine match is unchanged, the app and any rules it needs ship in **one push**, and it ends
with `/deployquest`. **Every rules change:** its cases are written first, and each guard turns its
own case red when removed (`shared/proofs/`, and `shared/proofs/README.md` for running them).

## Decisions

Owner interviews, 2026-10-01. The second block is the architecture review (Fable) of the
same day; where it changes an earlier row, the earlier row says so.

| Question | Decision |
| --- | --- |
| Who can sign in after a scan | Anyone. They get an account and friends, never family data, and they can't see the inviter's friends. |
| Accepting | Mutual and automatic: the QR is the consent. |
| Friend card | Private note, when and where you met, tags. |
| Where the QR lands | In the app it was opened from (`…/rack-it/?i=<code>`). The friendship is account-wide, so it shows in every app with Connect. |
| How players are chosen | No fixed player list: a friend, a QR scan on the spot, or a guest. |
| Guests (no phone) | A typed name, claimable later: once they're on Connect, their guest games become theirs. |
| Today's family people | ~~Fold into friends.~~ Changed below: nothing folds. |
| What an outsider sees in Rack It | Only the matches they played in. |
| Pilot | Connect lives inside Rack It first. There's no separate Connect app yet. |
| New apps | A menu of kit parts (`KIT.md`) that `/sidequest` offers. |
| Offline | A nice-to-have, not a requirement. The pool hall has signal. |
| **Review** | |
| Blaze | **No.** No card, no server code. Ratings are a cache that can be rebuilt from matches. Triggers to reopen it are in Parked. |
| QR lifetime | **24 hours.** Opening My QR mints a fresh code when the last is over a day old. No **New code** button. |
| A friendship | **One document per pair**, `/friendships/<uidA>_<uidB>`, created only with the other side's live code. Not two lists. Why: it can't be half-made or forged, and a rule can ask "are these two connected?" with one `exists()`. |
| Your live code | Private (`/profiles/<uid>/private/main`), never in the profile. Why: the profile is readable by anyone who has your uid, so a code there lets them friend you unseen. |
| What moves a rating | Only a match ticked **Rated**, and only once the opponent confirms on their own phone. A friendly uses ratings for the handicap and never moves them. This is for the social leagues. |
| Guests and ratings | A guest plays friendlies only. Their rating is a starter estimate. |
| What an outsider sees on Ratings | Themselves and their friends. Nobody outside the household can list the club. |
| What the household sees | Everything in Rack It, as today, including matches between two friends. The outsider is told so on first open. |
| Invites today | Household only (owner, 2026-10-01). Adding a player stops adding them to Invites (Session 4). |
| Player ids | An account is its `uid`, a guest is `g_<id>`, a household person with no account keeps their person id. `people.resolve()` leads every old id to the current one. |
| Today's family people | Nothing folds. A household member's picker shows the household list plus their friends plus their guests. Household people with no account stay where they are, shared by the household. |
| Records name their players | Every record that names a player also stores `names` (a snapshot) and `uids` (the accounts in it). Why: an outsider can't read the household list, and `uids` is what the rules check. |
| Rules are tested | `shared/rules-check.mjs` runs in the `deploy-rules` Action before the deploy. A failing check blocks the rules deploy, never an app. Each rule's cases are written before the rule (owner, 2026-10-01). |
| QR library | Vendored at `shared/vendor/`, not a CDN. Why: each `sw.js` only caches same-origin files, so a CDN copy fails offline. |
| Family | Stays, keyed by email, as "the household": owner role, and the apps that haven't adopted Players. Not moved to uid. |
| **2026-10-02 (owner)** | |
| An admin, not a family | **In Rack It there is no family tier.** The owner is the one admin and sees every match; everyone else, Melanie included, is a player who sees only matches they're in. Other apps keep `/members` until they're visited (Sessions 7 and 9). Session 6b. |
| The "Before you play" note | Goes in 6b: once only the players and the admin can read a match, there's nothing to warn about. |
| Household data worth keeping | Only the owner's and Melanie's matches and ratings. The other household people may be dropped and re-invited. |
| The invite card | Names the app it was opened in ("Sign in to Rack It, …"), not "every sidequests app". 2.10.1. |
| **2026-10-02, the design merge (owner, interviewed by Fable)** | |
| Order | **One visit per app.** The look lands in `shared/` first with no app changes; then each app gets its new look and Players in the same step; then shared games. |
| One admin everywhere | **Every app follows Rack It**: the owner is the one admin and sees everything; everyone else sees only the records they're in. `/members` shrinks to the owner role. This replaces "Family stays" above for every app once it's visited. |
| Who can use an app | **Anyone signed in.** A stranger gets an empty app of their own and sees nothing of anyone else's. No allowlist. App Check stays in Parked as the quota safeguard. |
| Old records in the other apps | Keep the owner's and Melanie's. The owner's phone stamps `names`, `uids` and `by` once; a person with no account isn't recreated as a guest. Nothing is deleted: the admin still sees those records, named from `names`. |
| Bloc 11 | Stays, with the full treatment. |
| Who is in a shared game | **Players, plus at most one scorer who isn't playing.** No watchers. |
| Presence | **Light.** Who has joined, and when each phone was last seen (stamped on open, on hide and on a score). No heartbeat, no "looking", no Nudge, no Remove. |
| Signing off a rated match | **Every player who didn't end it confirms.** A player ends it: the other confirms, as today. A scorer ends it: both players confirm. |
| A guest who scans the Game QR | May take their seat ("I'm Rolf"): the guest becomes their account in that game. **That was them** stays, for past games. |
| Shared-game scope | Rack It (co-scoring, a scorer, both sign) and Zombie Dice (turns across phones). Leagues and Around the Clock on several phones are Parked. |
| The plan doc | Finished sessions live in `KIT-HISTORY.md`. Three sessions remain (owner: no time for more). |
| Test harness | Committed in `shared/proofs/`: the multi-tab `?mock` runner and the rules guard-mutation script. |
| **2026-10-03 (owner, end of Session 9)** | |
| One more session | The outstanding work is structured into **Session 10**, run from the phone. |
| **2026-10-04 (owner, start of Session 10)** | |
| Parked, re-read | **Four items move in**, as Step 5: a pending rated match expires; a scorer who joins a match under way by Game QR; a chain for turn games; My QR wears the app's look. The rest stays Parked. |
| A club connection | **Only a pair made by the loyalty app** (`app: "sessions-loyalty"`). A staff member's Rack It QR makes an ordinary friend. |
| The staff badge | **Yes**: the member's phone stamps a `staff` tag on the friend card. |
| Rack It on the loyalty card | **A link** to the player's Rack It page. The loyalty app never reads `ratings/`. |
| The household backfills | The owner has opened Around the Clock, Zombie Dice and Bloc 11 since Session 9, so their backfill code goes (Step 1). |

## Where this ends

| | Anyone signed in | The admin |
| --- | --- | --- |
| Who | any Google account | the `/members` document with `role: "owner"` |
| Sees | their profile, friends and guests; in every app, the records with their uid in `uids` | every record in every app |
| Can't | list profiles, ratings or anyone else's records | — |

There is no household tier after Session 9. The household people list
(`sidequests/_shared/people/`) becomes the admin's alone: only Rack It's admin path reads it,
so nothing in it migrates.

## Where the plan overrides the pack

The pack was drawn without the rules in view. Its look is taken whole; its Connect design is
taken with these changes.

| The pack says | The plan does |
| --- | --- |
| "Nothing here changes … the rules, or the plan" (README) | Seats, a scorer, both-sign and the open rule are all rules changes. Cases first, as ever. |
| Watchers with a grey ring; the host may Remove (CONNECT §3) | No watchers and no Remove. Parked. |
| Each phone writes `phones[uid]` every 15s; "looking"; stale dot at 20s; Nudge | Light presence (Decisions). ⚠ Why: 6 tables × 3 phones × 3 hours of heartbeats is about 13,000 writes and 39,000 reads, against free limits of 20,000 and 50,000 a day. `.presence` shows avatars and "last seen"; drop `.stale`'s 20s meaning and `.watch`. |
| "Last write wins" for two scorers | A `rev` counter, so a stale phone's late write is refused instead of rewinding the game (Session 8, step 3). On screen it reads the same. |
| League QR, League row in setup, the league page (CONNECT §5, frame 8f) | Parked. Setup keeps the **Rated** tick. |
| Turn games: Zombie Dice and Around the Clock | Zombie Dice only. Around the Clock is Parked. |
| `ui.account` shows Google's photo and name | It shows the account's profile (`people.avatar`), and its sheet holds My QR, Friends and Profile as well as Export, Import, Install and Sign out. |
| Targets 60px and 76px | Adopted. CLAUDE.md rule 7's 56px becomes 60px in Session 7. |
| `design_handoff/` stays in the repo | Session 7 installs its `shared/` files; Session 9 deletes the folder, bar the reference page, which moves to `shared/design/`. |

## The road

| Session | Visible change |
| --- | --- |
| 0–6b | Accounts, Connect, Players, rated matches, one admin in Rack It |
| 7 | The v3 look, the launcher, Rack It on v3, the open rule in Zombie Dice and Around the Clock |
| 8 | That was them, the Game QR and seats, two phones scoring one match, a scorer and both sign |
| 9 | Bloc 11 and Photo Coach on the open rule, Zombie Dice on several phones, the household tier gone |

| **10** Loose ends, then the club | 1 loose ends · 2 `connect.scan()` · 3 club connections and the staff badge · 4 a table session · 5 four from Parked | Fair Nine gone; scan in-app; staff log a match at the club; a pending match expires, a late scorer, a turn chain, My QR in the app's look |

Sessions 0 to 9 are done (`KIT-HISTORY.md`). Don't build ahead of the owner: ideas go in **Parked**.

**Owner, outside any session:** you and Melanie connect with My QR once (from 6b); the real-phone
checks in the Handover notes (Session 8: three phones on one Rack It match; Session 9: Zombie
Dice on several phones); and open Around the Clock, Zombie Dice and Bloc 11 once each on your phone,
so their one-time backfills run (Bloc 11 then tells you how many climbs are for people with no
account).

---

## Session 10 — Loose ends, then Sessions Loyalty meets Rack It

**Start with:** "Read `shared/KIT-PLAN.md` and do Session 10." Built to run from the phone (a
cloud session): read `CLAUDE.md`, `shared/KIT.md`, `shared/CONNECT.md`, and Session 9's Handover
in `shared/KIT-HISTORY.md` first.

⚠ A cloud session may have no Java (the rules emulator) or Playwright (smoke and the proofs). Then
the `deploy-rules` Action is the rules check (it blocks a failing push from deploying the rules,
never the app), `make verify` runs `node --test` and reports "Smoke test skipped", and the step's
proofs are written and committed for the next desktop session to run. Say so in each step's report.

**First, one question to the owner** (one `AskUserQuestion`, four questions, recommended option
first), then record the answers in **Decisions** below before building:

1. Parked, re-read (Session 9 step 4's last box): anything to move into this session? Default: no.
2. A club connection: only a pair made by the loyalty app (`app: "sessions-loyalty"`), or also a
   staff member's Rack It QR? Default: only the loyalty app's.
3. The staff badge in Rack It: a `staff` tag on the friend card, stamped by the member's phone?
   Default: yes.
4. Rack It on the loyalty card: a link to the player's Rack It page (default), or the loyalty app
   reads `ratings/<uid>` (crosses rule 3; the owner blesses that one read)?

Each step ends deployed (`/deployquest`) with its boxes ticked, as ever. Stop at a step boundary if
the session runs out of room, and write the Handover note in `KIT-HISTORY.md`.

### Step 1 — Loose ends (patch bumps; no rules)

- [ ] **Fair Nine**: on or after 2026-10-16, `/deletequest fair-nine` (it confirms by name with the
  owner; the launcher tile, if any, goes too). Before that date, leave this box and say so.
- [x] **Bloc 11, frame 3a's date line**: the When field becomes one `.note` line, "Today. Tap the
  date to change it.", which opens the date picker (`input.showPicker()`, the input kept hidden)
  and then reads "Wed 1 Oct. Tap to change it." Stored `at` unchanged (20:00 local).
- [x] **The household list's last visits**: if the owner says they've opened Around the Clock,
  Zombie Dice and Bloc 11 since Session 9, remove each app's `backfillDue()` path (the household
  watch, `legacy`, the `state/main` watch and the backfill itself), so `people.start` there is
  never `household: true`. Otherwise leave it, and say so.
- [x] `KIT.md` and the SPECs where they mention any of the above. (Bloc 11 0.9.1, Around the
  Clock 0.10.1, Zombie Dice 0.6.1. Fair Nine waits for 2026-10-16. The open-rule proofs start
  from `seeds/<app>-backfilled.json`, the old seeds as the backfill left them.)

### Step 2 — `connect.scan()` (minor bumps; no rules)

- [x] Move the in-app QR scanner (`BarcodeDetector`, with the paste fallback) out of
  `sessions-loyalty/index.html` into `connect.js` as `connect.scan({ app })` → a scanned code, or
  null. Sessions Loyalty uses it unchanged on screen.
- [x] `people.pick`'s **Scan a new player** and setup's **Show QR** gain "or scan theirs": the
  other person shows My QR, this phone scans it and the friendship is made from their code, as a
  link would (`cloud.account.accept`). Unparks "An in-app scanner". Built as My QR's **Or scan theirs**, so
  both get it, and so does every app's My QR (Rack It 2.18.0, Sessions Loyalty 0.2.0, the rest a
  patch; `shared/proofs/connect-scan.mjs`, 16 checks).
- [x] Proof: two `?mock` tabs, Ann shows My QR, Ben's `connect.scan` is fed the code (the paste
  fallback), they're connected and Ben's pick has Ann.

### Step 3 — Club connections and the staff badge (minor bumps; no rules)

- [x] Rack It's Friends and `people.pick` group friends by the pair's `app`: the club's
  (per the owner's answer 2) folded under their own heading, "Sessions", below the people you play
  with.
- [x] Per answer 3: the member's phone stamps `tags: ["staff", …]` on the friend card of a friend
  who is on `sessions-loyalty/staff/` (one `get` each, at most once a day per friend); Rack It shows
  the tag as "staff" on the row. No rule change: the card is yours, and the staff list is gettable.
- [x] SPECs (Rack It §8, Sessions Loyalty), `KIT.md` (Connect). (Rack It 2.19.0, the rest a
  patch; `shared/proofs/club-friends.mjs`, 12 checks. The fold is in `connect.showFriends`, so
  every app's Friends has it. A tag the phone stamped carries `staffAt`, and goes when they
  leave the list; one you typed stays.)

### Step 4 — A table session (rules + minor bumps, one push)

Read "Sessions Loyalty meets Rack It" below first, and Rack It's scorer flow (`CONNECT.md` §5).

- [x] **Cases first**, then the rules: a Rack It match may carry `venue: "sessions"`, set only at
  create by a scorer who is staff; a loyalty entry may carry `match: <id>`, written by staff.
- [x] From a member's page, staff start a Rack It match for two members (the staff member is the
  scorer, the players confirm, as in Session 8 step 4). The spend logged in the same sitting
  carries `match`, and Rack It's summary shows "Logged at Sessions".
- [x] **Points for playing**: a rated match at the club earns XP, logged by the scorer's phone as an
  `earn` entry with `item: "rack-it"`, once, when the last player confirms.
- [x] Per answer 4, Rack It on the loyalty card.
- [x] Proof: `?mock`, staff (the owner) scores a rated club match for Ann and Ben; both confirm;
  ratings move once; one earn entry each; Rebuild points and Rebuild ratings change nothing.
  (`shared/proofs/table-session.mjs`, 25 checks. Rack It 2.20.0, Sessions Loyalty 0.3.0. 8 new
  rules cases, 199 in all; 6 new guards. The loyalty app starts the match with its own id and
  logs the points itself, reading the match by id (`cloud.clubMatch`), so neither app writes the
  other's data. The way to earn is `earns/rack-it`, 50 points, made the first time.)

### Step 5 — Four from Parked (owner, 2026-10-04)

Each its own push, cases first where the rules change.

- [x] **A pending rated match expires.** A week after it ended, the first phone in it (a player's
  or the scorer's) makes it a friendly, `expired: true`: "Nobody confirmed in a week, so it counts
  as a friendly." Until then the strips say the days left. (Built differently from the first
  draft: anyone in it could already Withdraw or say Not right, so the rule only allows `expired`,
  on a friendly, once `endedAt` is a week old. Rack It 2.21.0; 5 cases, 4 guards;
  `shared/proofs/rack-it-expiry.mjs`, 9 checks.)
- [x] **A late scorer by Game QR.** A match under way with no `scorer`: someone who scans its Game
  QR and isn't playing may **Score this match** (beside any guest seat left). Rule: `scorer` goes
  from absent to the joiner, who is connected to `by`; nothing else changes. Both players then
  confirm a rated result, as for any scorer. (Rack It 2.22.0; 4 cases, 6 guards;
  `shared/proofs/rack-it-late-scorer.mjs`, 10 checks.)
- [x] **A chain for turn games.** The open twin of `nextLink()`, for open-rule records that carry
  `rev`: Zombie Dice's writes become links, and a phone whose queued writes land after the game
  moved on is refused and catches up. (Zombie Dice 0.7.0; `openLink()`, the owner's live records
  included; 7 cases, 4 guards. The proof is its own file, `shared/proofs/zombie-dice-chain.mjs`, 7
  checks.)
- [ ] **My QR wears the app's look.** `connect.showQR` takes `icon` and `colour`: the app's icon in
  the middle at error-correction level H, rounded dots, a frame. The code stays square, dark on
  light, with its quiet zone. Proof: every app's code decodes in the browser; the owner checks it
  scans first time on both real phones at the pool hall, and it comes out if it doesn't.

**Done when:** Fair Nine is gone (or dated), a friend is made by scanning in-app, a staff member
shows as staff in Rack It, a club match scored by staff moves ratings and points once each, and
Step 5's four are live.

---

## Sessions Loyalty meets Rack It (the background to Session 10)

Sessions Loyalty (`sessions-loyalty/`, 2026-10-02) is the club's loyalty app: members show a
QR, staff scan it, log spend and award points (`sessions-loyalty/SPEC.md`). It shipped on its
own so the design could settle first; this is what joining it to Rack It would take. Nothing
here is built. The owner picks which steps become a
Session 10.

What is already true, with no Rack It change: the member's QR **is** My QR, so a Rack It QR
scanned by the club app reads the same code; a scan by staff makes a real friendship with
`app: "sessions-loyalty"` on the pair (owner, 2026-10-02: "staff being real connections on
some level"); the club's staff list is `staff/<uid>`, gettable by any account.

- [ ] **Club connections as their own group.** Rack It's Friends and `people.pick` group a
  friend by the pair's `app`: "Sessions" connections folded under their own heading, below the
  people you play with, so a staff member who plays isn't buried in the whole club. Decide with
  the owner whether a club connection made in Rack It (a staff member's Rack It QR) should also
  count: today it carries `app: "rack-it"`.
- [ ] **A staff badge.** Whether a friend who is Sessions staff shows as such in Rack It. The
  loyalty app's `staff/<uid>` is gettable by any account, but reading it from Rack It crosses
  an app's namespace (CLAUDE.md rule 3). The cleaner way is a `tags` convention on the friend
  card (`staff`), stamped by the member's phone when the pair's `app` is `sessions-loyalty`.
  Owner's call.
- [ ] **`connect.scan()`.** The in-app QR scanner (`BarcodeDetector`, with the paste fallback)
  moves from `sessions-loyalty/index.html` into `connect.js`, and `people.pick`'s **Scan a new
  player** offers "or scan theirs". Unparks the scanner item below.
- [ ] **A table session.** From a member's page, staff start a Rack It match for two members
  at the club (Session 8 step 4's scorer flow: staff is the scorer, the members confirm), with
  `venue: "sessions"` on the match; the spend logged in the same sitting carries
  `match: <id>`, and Rack It's summary shows "Logged at Sessions". Needs Session 8 first.
- [ ] **Rack It on the loyalty card.** The member page shows their Zargo. `ratings/<uid>` is
  gettable by anyone signed in, but it is Rack It's data (rule 3): either the owner blesses that
  one read, or the page links to Rack It's person page instead.
- [ ] **Points for playing.** A rated match at the club earns XP, logged by the scorer's phone
  as an `earn` entry with `item: "rack-it"`. Only once a table session exists.

## Parked

- **Blaze.** Reopen when one of these happens: a rating is tampered with and Rebuild isn't
  enough; push notifications are wanted ("confirm your match"); automatic backups are
  wanted (Firestore's scheduled backups need Blaze but no code). Until then the backup is
  each app's Export.
- **Leagues** (Rack It): the owner's, with a name, venue, season, its own QR and a table; a
  League row in setup makes the match rated. Designed: the pack's `CONNECT.md` §5 and frame 8f. Needs a
  code that outlives 24 hours, which is the Groups item below.
- **Watching** a game you aren't in, and the host removing a phone (CONNECT §3).
- **Full presence**: a heartbeat, "looking", Nudge. Move it to a document per phone first, and
  see the quota sum in "Where the plan overrides the pack".
- **Around the Clock on several phones**: the turn-game parts from Session 9 step 3.
- **Leftover `/members` documents.** Melanie's and the other household entries mean nothing since
  Session 9. The owner may delete them in the Firebase console; nothing needs them.
- Other sign-in methods: email link, Apple, phone. The uid keying makes them additive.
- Firebase anonymous sign-in, for someone with a phone but no Google account.
- Groups: "connect me to everyone at the club", a group QR. The 24-hour code rules out a
  printed QR until this exists.
- Blocking. Remove now holds, because the old code has expired by the next day.
- Moving a claimed household person to a different Google account (what Unclaim did).
- **App Check**, if strangers' sign-ups ever threaten the free quota (50,000 reads and 20,000
  writes a day, 1 GiB stored). Every app is open to any account from Session 9.
- A standalone Connect app at `connect/`, for people who only want the QR.
- iPhone: the home-screen app and Safari keep separate sign-ins, so an iPhone scan always
  lands in Safari. Note it and leave it.
- **Maybe:** My QR wears the app's look, e.g. Rack It's code on a 9-ball's white circle.
  `connect.showQR` takes an icon and a colour: the icon in the middle at error-correction level
  H, rounded dots, and a frame around the code. Keep the code itself square, dark on light, with
  its quiet zone. Only if it scans first time on both real phones in the pool hall.

## Handover

Every session's note, the design merge's and Session 9's included, is in `shared/KIT-HISTORY.md`
under Handover. Start there before a new session.
