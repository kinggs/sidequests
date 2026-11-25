# Sessions Loyalty — spec

A two-sided loyalty app for **Sessions**, the pool club: members show a QR and collect points;
the club's staff scan it, log what was spent, award points for tasks, redeem rewards and keep
notes. It replaces the paid, stand-alone loyalty app the club runs today (screenshots,
2026-10-02) with one that costs nothing and shares its QR with Rack It. The first sidequest built
on the v3 look (`shared/DESIGN.md`) from the start.

This spec is the app as it is (0.5.0). The points arithmetic is in `loyalty.js`, proved by
`loyalty.test.mjs` (`node --test` from the repo root).

**Files.** `index.html` (the app), `loyalty.js` (points, tiers, totals, the starting list),
`loyalty.test.mjs`, `sw.js`, `manifest.json`, icons.

---

## 1. Concepts

| Concept | Definition |
|---|---|
| **The club** | Sessions. One club per app; its name and rates are in **Settings**. |
| **Staff** | An account on the club's staff list (`staff/<uid>`), or the repo's owner. Staff see the **staff side**. |
| **Member** | Any other account. A member sees the **member side**: their card, their points, the rewards, the ways to earn, their history. A household member is a plain member here. |
| **Card** | The club's record of one member: name, member number, status, points, XP, member since. Made when they join (they scan a staff QR, or tap **Join**), or the first time staff scan them. |
| **Points** | Spendable. 1 a rand by default (`pointsPerRand`), plus what tasks award; rewards cost them. |
| **XP** | Never spent. 1 a rand by default (`xpPerRand`), plus what tasks award. It sets the tier. |
| **Tier** | Bronze, Silver, Gold by XP, thresholds in Settings. Bronze always starts at 0. |
| **Entry** | One line of a member's history: a **spend** (rands at the bar), an **earn** (a task done), a **redeem** (a reward taken, points negative) or an **adjust** (a staff correction). Voided entries count for nothing. |
| **Reward** | Something points buy, or something free with a condition ("Free lager · with a 2-hour booking"). It may have a **limit** (once per member, or once a year) and a **window** (only in the member's birthday week) (0.5.0). |
| **Birthday** | Day and month on the card, no year. The **birthday week** is Monday to Sunday around it, by the phone's clock; 29 February counts as the 28th in other years. |
| **Earn** | A task that awards points: refer a friend, a Google review, a follow. |

Words: **member**, never customer; **points** and **XP**; **log a spend**, **award**, **redeem**,
**void**. Never "transaction".

## 2. One app, two sides

It is one app, not two, because the club side and the member side are one set of data and
CLAUDE.md rule 3 keeps every app inside its own namespace. Which side you see is decided once
after sign-in: staff (your `staff/<uid>` document exists, or `cloud.role()` is `"owner"`) get the
staff side with its four tabs; everyone else gets the member side, which scrolls. The app watches
your `staff/<uid>` document, so being made staff (or taken off) changes sides at once, with a
toast and no reload (0.4.0). Staff can
**View as a member** (More, and the account sheet) to see their own card; **View as staff**, at the
top of that view and in the account sheet, brings them back.

**Loading.** Opening says "Opening…", then "Loading…" until the app knows which side you are
on and that side's first data is in, so it never shows the wrong side or "Nothing yet" before
the data arrives. A list that hasn't arrived says "Loading…". Offline on a first open, after
six seconds it shows what it has.

## 3. The QR

A member's QR is their Connect QR (`connect.showQR`, `shared/KIT.md`): the same 24-hour code as
Rack It's **My QR**, pointing at `…/sessions-loyalty/?i=<code>`. So a Rack It QR and a loyalty
QR are the same thing, read by either app.

Staff read it two ways:

- **Scan a member's QR** (the staff Home's big button): the phone's camera in the app
  (`connect.scan`, `BarcodeDetector` on Android Chrome; since 0.2.0 it lives in `shared/connect.js`). It reads any sidequests QR, whichever app the link names,
  and takes the code from it. Where the phone can't scan in the app, the same screen takes a
  pasted link or code, and says to use the camera app instead.
- **The camera app**: the link opens this app, and `connect.handleInvite` connects as in Rack
  It. Signed in as staff, **Done** opens that member's card.

Either way the scan **makes the Connect friendship** between that staff account and the member,
with `app: "sessions-loyalty"` on the pair (owner, 2026-10-02: staff are real connections; the
pair's `app` is how every app's Friends and picker fold club connections under **Sessions**,
and a member's phone tags a friend on `staff/` as **staff**: KIT-PLAN Session 10 step 3).
A code that has expired says so; your own says so. The first scan of someone makes their card.

**Sign up a new member** shows the staff member's own QR. The member scans it, signs in, and
taps Done: their phone makes their own empty card (**joining**, 0.4.0), and the staff phone opens
it, on the new friendship or, for someone already connected to that staff account, on the new
card appearing while the QR is up. Anyone arriving in this app through a QR link joins this way.

## 4. The member side (Home scrolls)

- **The card**: the club's name, your name, your tier, your points large, member since and your
  member number. With no card yet: "Not a member yet. Join now, then show your QR at the bar to
  collect points." and **Join Sessions** (76px), which makes your empty card with no QR at all.
- **Show my QR**, the one button you came for (76px).
- **Your Rack It rating and matches** (0.3.0): a link to your page in Rack It (`../rack-it/?p=<uid>`).
  This app never reads Rack It's ratings (owner, 2026-10-04).
- **Birthday** (0.5.0): on the card once set; until then **Add your birthday for a birthday
  treat** (day and month). A member sets it once; after that only staff change it.
- **Next reward**: "Your next reward is 250 points away", with a bar. Free rewards are never
  "away"; with everything affordable the line says so.
- **Rewards**: each with its picture (an emoji, or a photo staff added), title, blurb or
  condition, and its cost (or "Free"). A reward you can afford shows its cost in the accent;
  one you can't is dimmed. A limited reward says so ("Once per member", "Once a birthday") and,
  once used, shows **Taken**; the birthday reward is dimmed outside the birthday week. Tap one for
  the full text, why you can't take it yet, and **Show my QR**: staff redeem it.
- **Earn**: each task with its points. Tap one for how: do it, show your QR, staff add the
  points.
- **Recent**: your entries, newest first: "R90 at the bar", "Refer a friend", "Free cue rental
  (redeemed)", "Adjustment", with the date and the signed points. Voided ones are struck through.
- **The account sheet** (your avatar): My QR, Profile, Export, Install on this phone, Sign out;
  and **View as a member** or **View as staff** when you're staff.
- Signed out: Sign in with Google.

## 5. The staff side (four tabs: Scan · Members · Items · More)

**Scan** (Home). **Scan a member's QR** (76px) and **Sign up a new member**. Then **Today**:
visits, rands and points logged since midnight on this phone's clock, and **Recent**: the last
entries, each "Ann · R90 at the bar", with the time and the points; tap one for that member.

**Members.** Search, and every card newest activity first: avatar, name, "Bronze · 90 points ·
#7". Tap for the member page. **From your friends** lists your Connect friends who have no card
yet, to make one without a scan.

**A member's page.** Avatar, name (from their profile; the card keeps a snapshot), tier, points
large, "1,240 XP · Silver in 3,760". Then the four things staff do:

- **Log a spend** (76px): rands, an optional note, and the live line "= 90 points · 90 XP".
- **Award**: pick a way to earn; its points land.
- **Redeem**: pick a reward the member can take now; its cost comes off. Rewards they can't
  afford, have used up, or that wait for their birthday week aren't offered, and a line says how
  many of each ("2 need more points · 1 already taken · not their birthday week"). The limits
  count the member's redeems that aren't voided, so voiding one gives it back.
- **Adjust**: signed points and a reason (required).

Each writes **one batch**: the entry, and the card's cached `points`, `xp` and `lastAt`.

**A table session** (0.3.0, KIT-PLAN Session 10 step 4). **Start a match** picks who the member
plays: another member with a card who, like them, is connected to you (a scan made them your
friend). Rack It opens with both picked and you scoring (`../rack-it/?club=<a>.<b>&m=<id>`; the
id is chosen here), at `venue: "sessions"`, which only staff may set. This phone remembers the
match for the sitting (six hours): both members' pages say "At the table with …" with **Open Rack
It**, and a spend logged for either carries `match: <id>`. Rack It's summary says "Logged at
Sessions" and offers **Back to Sessions**, which opens the first player's page here. **Points for
playing**: once both players have confirmed a rated match on their phones, this phone logs each
one an earn entry, `item: "rack-it"`, worth the club's way to earn `earns/rack-it` ("A rated match
at the table", made with 50 points the first time; staff change it under Items). Once: the entry's
id is `rackit_<match>_<uid>`, and it's checked before it's written. It's logged when this phone
next opens or comes back to the app, or within half a minute while it's open. A friendly, or a
match a player said was Not right, earns nothing. Rack It is read one match at a time, by id
(`cloud.clubMatch`, the one read of Rack It this app makes); nothing here writes Rack It's data.
**Their Rack It page** links to the member's page in Rack It.

Then
**Details**: member number, status (Casual · Member · Lapsed), birthday (0.5.0), and the **staff note**, which the
member never reads. **This month**: visits, rands, points. **History**: every entry, with a `⋯`
that offers **Hold to void** (a voided entry stays, struck through, and the card is recomputed)
and, for the owner, **Hold to delete**. The owner's `⋯` at the top offers **Make staff** or
**Remove from staff**.

**Items.** Rewards | Earn. Each row has its picture, title, blurb, cost or points, and a `⋯`:
**Edit**, **Hide** / **Show** (hidden items stay in history), **Hold to delete**. **Add a
reward** / **Add a way to earn** opens the same sheet as Edit: title, blurb, cost (0 is free) and
condition for a reward, how often (Any · Once · Once a year) and when (Any time · Birthday
week), points for an earn, an emoji, and for a reward a photo (shrunk to a
320px JPEG kept in the document, under 100,000 characters). **The club's list** (`loyalty.js` `seedItems`, version `LIST`) is the team's of 2026-11-25:
thirteen rewards and nine ways to earn, each at a fixed id (`rewards/cue`, `earns/survey`). The
first staff phone to open a club that isn't on `LIST` brings it up to it, once, by itself: it
adds the items the club lacks, hides the old app's sixteen (by title, `OLD_TITLES`; history
keeps them) and sets `settings/main.itemsList`. Items staff made are left alone, and an item
staff edited keeps their edit. An empty list also offers **Start from the Sessions list**.

**More.** Settings (club name, points a rand, XP a rand, the three tier names and the Silver
and Gold thresholds), Staff (the owner only: the list, **Add staff** from a list of the newest members or by
scanning their QR, `⋯` → **Hold to remove**), Export, Import (owner), **Hold to rebuild points** (every card
recomputed from its entries), **View as a member**, and the version.

## 6. Data

Under `/sidequests/sessions-loyalty/`. Times are milliseconds.

```
settings/main   { name, pointsPerRand, xpPerRand, tiers: [{ name, xp }], updatedBy, itemsList }
staff/<uid>     { name, addedAt, addedBy }
rewards/<id>    { title, blurb, cost, condition, limit, window, emoji, photo, active, order, createdAt }
                                // limit: "" | "once" | "year"; window: "" | "birthday" (0.5.0)
earns/<id>      { title, blurb, points, emoji, active, order, createdAt }
cards/<uid>     { uid, name, since, memberNo, status, points, xp, lastAt, by, birthday? }   // "MM-DD"
notes/<uid>     { text, updatedAt, by }
entries/<id>    { kind, uid, name, by, byName, at, rands, points, xp, item, title, note,
                  match?, voided?, voidedBy?, voidedAt? }   // match: a Rack It match id (0.3.0)
```

**Who reads what** (`shared/firestore.rules`, cases in `shared/rules-check.mjs`):

| | A member | Staff | The owner |
|---|---|---|---|
| settings, rewards, earns | read | read, write | the same |
| staff/ | get their own | get, list | write |
| cards/ | get their own; create their own, empty, once (joining); add `birthday` to their own, once | get, list, write | the same |
| notes/ | — | read, write | the same |
| entries/ | their own: get, and list with `where uid == me` | all; create with `by` = me; void (only `voided*`) | also create in anyone's name (Import) and delete |

The rules can't check the arithmetic: a card's `points` and `xp` are a cache the staff's
**Rebuild points** remakes from the entries, as Rack It's ratings are. There is no household
tier (Session 9): an old `/members` document makes nobody more than a member, and the owner's reach
over the rest of `sidequests/` skips this app, so even the owner only voids an entry. `?mock` models all of it
(`shared/cloud-memory.js`): `?mock` is the owner (staff), `?mock&as=ann` a member;
Ann becomes staff when the owner adds her under More → Staff with her QR link.

**Export.** Staff: everything above as one JSON file; the owner's Import writes it back
(merged). A member: their card and entries.

## 7. Decisions

- **One app, two sides** (rule 3), not a club app and a member app.
- **A member joins by themselves** (0.4.0, owner 2026-11-18: one scan of the staff QR must be
  enough at the bar). The rules let an account create only its own card, only with 0 points and
  XP, casual, no member number; every later write is staff's.
- **The team's list, 2026-11-25** (0.5.0). The old app's "auto on download" rewards are free
  rewards with a limit (the cue rental and the sticker once each), not vouchers issued on join.
  Conditions like "with a 2-hour booking, in office hours or on Sundays" stay words staff judge:
  there's no booking system to check them against. The TV table and the competition table
  ("1625 TV / 1800 CT") are two rewards. The survey awards 200, as a follow does. (Owner.)
- **A member sets their birthday once** (0.5.0, owner 2026-11-25), so nobody moves it to take
  the birthday reward twice; staff correct it.
- **Staff redeem after a scan.** No member-side claim or pending state. (Owner, 2026-10-02.)
- **Points and XP with tiers**, as the old app. (Owner, 2026-10-02.)
- **A scan makes a real friendship**, tagged by the pair's `app`. (Owner, 2026-10-02: "staff
  being real connections on some level"; how Rack It shows them is in `KIT-PLAN.md`.)
- The scanner is `connect.scan()` (0.2.0, KIT-PLAN Session 10 step 2), shared with My QR's
  **Or scan theirs** in every app.
- Accents: **green** (points in, the balance) and **coral** (points out: a redeem).
- Rands are kept to the cent; points and XP round down.
- No photos of members: their avatar is their profile's, as everywhere.

## 8. Out of scope (for now)

**Challenges stay manual** (owner, 2026-11-25): staff check a follow, a tag, a review, a referral
or a survey and **Award** it. Worth considering later, in the Sessions app rather than here
(`SESSIONS-MIGRATION.md` §6): a link or QR per challenge, so the member opens the right page;
checking Instagram, Facebook and TikTok through their APIs; a Google review link with the review
noticed; referral codes that award both sides when the friend joins; a survey inside the app;
booking-linked free drinks, landing by themselves on a 2-hour booking; a birthday reminder.

Monthly stat pages, referrals tracked by code, push notifications, booking integration, a
member-side claim queue, printing a QR for the till (needs a code that outlives 24 hours:
`KIT-PLAN.md` Parked, Groups), and anything in Rack It: `KIT-PLAN.md`, "Sessions Loyalty meets
Rack It".
