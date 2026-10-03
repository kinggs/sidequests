# The kit — working doc for the build sessions

Sidequests is opening beyond the family: pool friends, staff at the venues, people without
a phone. Sessions 0 to 6b built accounts, Connect, Players and rated matches, piloted in Rack
It, and Session 7 put every app's look on v3 and opened Zombie Dice and Around the Clock to
friends (`shared/KIT-HISTORY.md`). On 2026-10-02 the owner's design pass (`design_handoff/`) was
merged in. Session 8 put one Rack It match on several phones (`KIT-HISTORY.md`). **One session is
left**: the rest of the apps, and closing out.

**Start a session with:** "Read `shared/KIT-PLAN.md` and do Session N."

Each session is a run of **steps**. Every step ends deployed and working (`/deployquest`), with
its boxes ticked. A session that runs out of room stops at a step boundary, writes its Handover
note, and the next session starts at the first unticked step.

## Read first

1. `CLAUDE.md` — repo rules: direct to `main`, bump `APP_VERSION` and `CACHE` together,
   deploy with `/deployquest`, test with `?mock`.
2. `shared/KIT.md` — the parts, what Connect and Players do, privacy, data.
3. `design_handoff/README.md`, then `design_handoff/shared/DESIGN.md` and `CHANGES.md`.
   Session 9 also reads `shared/CONNECT.md` (the shared-game design as built in Session 8). **Where the pack and this plan
   disagree, this plan wins**: see "Where the plan overrides the pack" below.
4. `shared/firestore.rules`, `shared/cloud.js`, `shared/cloud-memory.js`, `shared/people.js`,
   `shared/connect.js`, in full.
5. For Rack It work, `rack-it/SPEC.md` (§3 Zargo, §6.1, §7, §8, §9), and **Ground rules** in
   `rack-it/V3-PLAN.md`: 11-Point-Nine must behave identically, and `node --test` must pass.
6. **Handover**, at the bottom. For how the rules got their shape, `shared/KIT-HISTORY.md`
   Sessions 6 and 6b ("What the plan got wrong").

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

| Session | Steps | Visible change |
| --- | --- | --- |
| 0–6b | Done (`KIT-HISTORY.md`) | Accounts, Connect, Players, rated matches, one admin in Rack It |
| 7 | Done (`KIT-HISTORY.md`) | The v3 look, the launcher, Rack It on v3, the open rule in Zombie Dice and Around the Clock |
| 8 | Done (`KIT-HISTORY.md`) | That was them, the Game QR and seats, two phones scoring one match, a scorer and both sign |
| **9** The rest, and closing out | 1 Bloc 11 · 2 Photo Coach · 3 Zombie Dice on several phones · 4 close-out | The household tier is gone; nothing is left on v2 |

Don't build ahead. Ideas go in **Parked**.

**Every step:** `make verify` passes (`node --test` and the smoke test), one scored
11-Point-Nine match is unchanged, the app and any rules it needs ship in **one push** (a phone
on the old build is refused the moment rules land: Session 6b), and it ends with `/deployquest`.
**Every rules change:** its cases are written first, and each guard turns its own case red when
removed (`shared/proofs/`).

**Owner, still open from 6b:** you and Melanie connect with My QR once; Melanie closes and
reopens Rack It.

---

## Session 9 — The rest, and closing out

### Step 1 — Bloc 11 (minor bump, rules in the same push)

- [x] On the `open` list. A climb's `players` is its one climber; you log for yourself and
  your guests. Backfill, account sheet, SPEC as Session 7 step 4. The look as `CHANGES.md`
  § bloc-11 (frame 3a): amber and sky, `⋯` → sheet → hold on Recent rows.
- [x] ⚠ Before the push, tell the owner how many climbs belong to people with no account.
  They stay visible to the admin by name, and nobody can log for them until they're added as
  a guest.

### Step 2 — Photo Coach (minor bump, rules in the same push)

- [x] On the `open` list; a photo's `players` is its owner. The look as `CHANGES.md`
  § photo-coach (frame 6a): the More tab's contents move into the account sheet.
- [x] ⚠ Photos are the biggest documents in the project and the door is now open to any
  account. Note the stored size per photo in Handover, so the App Check trigger in Parked has
  a number.

### Step 3 — Zombie Dice on several phones

Read CONNECT §3 "turn games" and frame 8e. No rules change beyond the open rule and
`seatSwap()`: nothing rated rides on a turn, so the rules don't police whose turn it is.

- [x] The game document carries `turn` and every roll and reveal, so each phone shows the same
  dice. Controls are live when `turn` is you, or you started the game (`by`), so a player with
  no phone is still scored. Everyone else gets the same screen with `.mirror`.
- [x] When your phone becomes live: a `.done` moment, "Your turn, Melanie".
- [x] Game QR, guest seats, the Home card, the echo strip and light presence: the parts from
  Session 8, moved into `connect.js` or `ui.js` if they were built inside Rack It.
- [x] SPEC: "one phone" becomes "one phone or several".

**Done when:** three tabs play a whole game, each taking its own turns, with the starter
scoring for a guest; one phone alone plays exactly as before.

### Step 4 — Close-out

- [ ] The generic household rule goes: every app is in its own block or on the open rule.
  `sidequests/_shared/people/` becomes owner-only. `/members` keeps only the owner's role;
  Rack It's Invites screen and `cloud.addMember` go. Cases first.
- [ ] `people.js`: the household path runs for the admin in Rack It and nowhere else. Remove
  what nothing calls.
- [ ] `/sidequest` works out which kit parts a new app wants and wires them; a new app starts
  on the open rule with one line added to the list.
- [ ] `CLAUDE.md`: rule 3, the Firebase section and "Beyond the family" describe one admin and
  players. `KIT.md`: statuses, privacy table, the two new parts (UI, Shared games).
- [ ] Delete `design_handoff/` (the reference page moves to `shared/design/`), and
  `fair-nine/` with `/deletequest` if its month is up (owner confirms).
- [ ] Every app passes `DESIGN.md` §7's checklist. Parked is re-read with the owner.

**Done when:** `grep -r isFamily shared/firestore.rules` finds nothing, and a new app made
with `/sidequest` comes out on v3 with friends, with no hand edits.

---

## Sessions Loyalty meets Rack It (proposed, not scheduled)

Sessions Loyalty (`sessions-loyalty/`, 2026-10-02) is the club's loyalty app: members show a
QR, staff scan it, log spend and award points (`sessions-loyalty/SPEC.md`). It shipped on its
own so the design could settle first; this is what joining it to Rack It would take. Nothing
here is built, and the three sessions above come first. The owner picks which steps become a
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
- A scorer who joins a match already under way, by Game QR.
- A pending rated match never expires. An expiry, or a reminder.
- Other sign-in methods: email link, Apple, phone. The uid keying makes them additive.
- Firebase anonymous sign-in, for someone with a phone but no Google account.
- An in-app scanner (`BarcodeDetector` on Android Chrome), to add a player without the
  camera app. Built inside Sessions Loyalty (2026-10-02); moving it to `connect.scan()` is in
  "Sessions Loyalty meets Rack It" above.
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

Sessions 0 to 8: `shared/KIT-HISTORY.md`. Session 9 reads Session 8's note there first: step 3
of Session 9 (Zombie Dice on several phones) starts by moving Rack It's echo strip, presence and
link-by-link writes into `connect.js` or `ui.js`, and the rules' `nextLink()` wants an open-rule
twin. `shared/CONNECT.md` is the design as built.

### The design merge, 2026-10-02 (Fable)

No code. The design pack landed in `design_handoff/` untouched, bar a note at the top of its
README and CONNECT.md pointing here. The old Sessions 7 (claiming a guest) and 8 (the kit menu,
other apps adopt Players) are now Session 8 step 1, and Session 7 steps 4 and 5 with Session 9
steps 1, 2 and 4.

What the next session should know:

1. **The three sessions are large**, at the owner's request. The step boundaries are the
   safety: finish a step, deploy, tick, then start the next. Don't start a step you can't
   finish.
2. **The pack's Connect design was drawn without the rules.** Today's rules freeze `uids`,
   cap a match at two accounts, need the starter to be a player, and let one player confirm.
   Seats, the scorer and both-sign each open one of those, which is why each has a "Must
   refuse" list.
3. ⚠ **`rev` is this plan's idea, not the pack's, and it's unproven.** Session 8 step 3 probes
   it before building on it.
4. ⚠ **The open rule's create check costs up to 7 `exists()` calls** (the limit is 10 a
   request). Check it on the emulator with an 8-player game before Zombie Dice relies on it.
5. The old records ruling ("keep the owner's and Melanie's") is met without deleting anything:
   records for people with no account stay admin-visible by name.
