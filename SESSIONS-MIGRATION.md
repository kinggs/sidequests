# Sessions migration

The running notebook for moving what the sidequests have learned into **one Sessions app**, built
in the club's own repository on the club's own backend. When the owner says "Sessions migration",
this is where it goes: add to the right section, date it, keep it short.

Started 2026-11-18. Nothing here is built yet.

## 1. The plan as it stands

- **One app for Sessions** (the billiards club) that combines **loyalty**, **scorekeeping**,
  **tournaments**, **pool and darts**, and probably **table booking**, so it feels like one
  thing and not a set of apps. (Owner, 2026-11-18.)
- **Not a sidequest.** Its own source repository and its own backend, for the club. Target: a
  start in about two weeks (early December 2026).
- **The current sidequests stay as they are** and keep being used and demoed. They are the
  learnings and inputs: Sessions Loyalty, Rack It, and the shared kit (accounts, QR, friends).
- **Testing now:** two people at the club are trying Sessions Loyalty from 2026-11-18. What they
  find goes in §5.
- **Push notifications belong to the Sessions app, not the sidequests.** (Owner, 2026-11-25.)
  Sending one needs a server holding a secret key, so it needs Blaze (Cloud Functions with
  Firebase Cloud Messaging) or the club's own backend. Expect to move to Blaze, or its
  equivalent, when the proper app is built. Phones are ready: Android Chrome, and iPhones on
  iOS 16.4 or later once the app is on the home screen.
- **Pre-work in the sidequests:** tournaments in Rack It (`rack-it/TOURNAMENT.md`), planned so
  its bracket logic and data shape can be lifted out.

## 2. What exists today, and where to read it

| Piece | Where | What the new app takes from it |
|---|---|---|
| Accounts, My QR, friends, guests | `shared/KIT.md`, `shared/CONNECT.md`, `shared/connect.js`, `shared/people.js` | One QR for a person everywhere. A scan is the consent. Guests for people with no phone, claimed later. |
| Loyalty: cards, points, XP, tiers, rewards, ways to earn, staff | `sessions-loyalty/SPEC.md`, `loyalty.js` (tested) | The whole model, and the two sides (member, staff) in one app. |
| Scoring: five cue games, live screen, two phones on one match, a scorer | `rack-it/SPEC.md` | The live screen and the games. The chain that stops a stale phone rewinding a match. |
| Ratings (Zargo), handicaps, rated matches both players confirm | `rack-it/ZARGO.md`, `rack-it/zargo.js` (tested) | The rating engine as a module, unchanged. |
| A table session: staff start a match from a member's card, points for playing | `sessions-loyalty/SPEC.md` §5, `shared/proofs/table-session.mjs` | The first join between loyalty and scoring; the shape of "at the club". |
| Tournaments | `rack-it/TOURNAMENT.md` (planned) | `bracket.js` and the tournament document. |
| The look | `shared/DESIGN.md`, `shared/theme.css` | Dark, large type, 60px targets, built for older eyes in a dim room. |
| Cuescore | `rack-it/CUESCORE.md`, `rack-it/SPEC.md` §10 | Where the club keeps leagues today; read-only API. |

Not built anywhere yet: **darts**, **table booking**, tournaments (planned), leagues, payments,
notifications.

## 3. Learnings to carry over

Things the sidequests found out the hard way. Each should be a decision in the new app, not a
rediscovery.

- **Joining must be one scan.** Until 0.4.0 a member existed only once staff had scanned them,
  and someone already connected to the staff member could scan the club's QR and nothing
  happened. Now scanning a staff QR (or tapping Join) makes your own empty card. In the new app:
  a member can always join by themselves; staff only ever add value on top. (2026-11-18)
- **Roles must apply live.** Someone made staff had to close and reopen the app to see the staff
  side. Watch the role, don't read it once. (2026-11-18)
- **Appointing staff shouldn't need a scan.** Pick from the members; a scan is the fallback.
  (2026-11-18)
- **iPhones can't scan a QR inside a web app** (no `BarcodeDetector` in Safari). Every flow
  needs the "they scan mine with their camera" direction to work on its own. A native shell, or
  a JS decoder, would fix it properly.
- **Connections are per person, not per club.** Today staff must be personally connected to a
  member to start their match, so a member signed up by one barman is a stranger to the next.
  The new app wants club membership as its own thing: staff act for the club.
- **Confirmation steps stall a room.** Rated matches wait for both players' phones; points for
  playing wait on that. Fine between friends, slow at a club. Decide per feature who is trusted
  (staff, the organiser) so things land at once.
- **With no server, the phone does the arithmetic.** Points, XP and ratings are worked out on a
  phone and the security rules can't check them; "Rebuild" buttons exist to repair drift. On
  their own backend: compute points, ratings and brackets on the server.
- **The free tier shaped the design.** No server code, no push notifications, photos kept inside
  documents, presence without heartbeats. None of these limits need carry over.
- **Pure logic in tested modules travels.** `zargo.js`, `loyalty.js` and soon `bracket.js` have
  no browser or database in them. They are the parts to lift as they are.
- **A 24-hour personal QR can't be printed.** A code for the till or a poster needs one that
  doesn't expire (parked in `shared/KIT-PLAN.md`).

## 4. Open questions for the new app

- The backend and stack (theirs to choose): what the club already runs, who maintains it.
- Sign-in: Google only today. Phone number or email link for members without Google?
- Does existing data move (cards, points, matches, ratings, friendships), or does it start fresh?
  Every sidequest has a JSON export, so moving is possible.
- Web app, installed web app, or native (scanning, notifications)?
- Darts: which games (501, cricket), and does it share the rating idea or get its own?
- Table booking: is there a system now? Does a booking start a table session?
- Tournaments at the club: entry fees, prizes, loyalty points for entering and placing.
- Cuescore: keep feeding it, read from it, or replace it?
- One club or many: is "Sessions" a single venue, or should a second venue be possible?
- Who owns what: the club's data, the accounts, the code.

## 5. Notes from testing (newest first)

- 2026-11-18: Sessions Loyalty 0.4.0 demoed at the club; join-by-QR, add staff from the list
  and the live change to the staff side all worked for the owner. Two testers start today.

## 6. Dump

Anything said about the migration that doesn't have a home yet. Sort it later.

- The club team's description of the old loyalty app (2026-11-25), now matched in Sessions
  Loyalty 0.5.0 (`sessions-loyalty/SPEC.md` §5, §7): free on joining (cue rental and Sessions
  Icon sticker once each; a lager, or a coffee or tea in office hours or on Sundays, with a
  2-hour booking; a birthday-week 2 hours of table time and a drink); bought (drink 700, an hour
  of table time 1000, meal 1500, TV table 1625, competition table 1800, cap 3000 once, PNS glove
  4000, club shirt 10000); challenges (socials, Google review 1000, refer a friend 1250, survey).
  Staff check the challenges by hand today. For the new app, consider: challenges that verify
  themselves (social APIs, a review link, referral codes, an in-app survey), and booking-linked
  rewards that land on a booking.

- "Combine loyalty, table booking, and scorekeeping, and potentially tournaments into one app …
  an integrated set of apps." (Owner, 2026-11-18)
- Shortcuts are fine for demos in the sidequests in the meantime. (Owner, 2026-11-18)
