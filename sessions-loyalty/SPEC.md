# Sessions Loyalty — spec

A two-sided loyalty app for **Sessions**, the pool club: members show a QR and collect points;
the club's staff scan it, log what was spent, award points for tasks, redeem rewards and keep
notes. It replaces the paid, stand-alone loyalty app the club runs today (screenshots,
2026-10-02) with one that costs nothing and shares its QR with Rack It. The first sidequest built
on the v3 look (`shared/DESIGN.md`) from the start.

This spec is the app as it is (0.1.0). The points arithmetic is in `loyalty.js`, proved by
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
| **Card** | The club's record of one member: name, member number, status, points, XP, member since. Made the first time staff scan them. |
| **Points** | Spendable. 1 a rand by default (`pointsPerRand`), plus what tasks award; rewards cost them. |
| **XP** | Never spent. 1 a rand by default (`xpPerRand`), plus what tasks award. It sets the tier. |
| **Tier** | Bronze, Silver, Gold by XP, thresholds in Settings. Bronze always starts at 0. |
| **Entry** | One line of a member's history: a **spend** (rands at the bar), an **earn** (a task done), a **redeem** (a reward taken, points negative) or an **adjust** (a staff correction). Voided entries count for nothing. |
| **Reward** | Something points buy, or something free with a condition ("Free lager · with a 2-hour booking"). |
| **Earn** | A task that awards points: refer a friend, a Google review, a follow. |

Words: **member**, never customer; **points** and **XP**; **log a spend**, **award**, **redeem**,
**void**. Never "transaction".

## 2. One app, two sides

It is one app, not two, because the club side and the member side are one set of data and
CLAUDE.md rule 3 keeps every app inside its own namespace. Which side you see is decided once
after sign-in: staff (your `staff/<uid>` document exists, or `cloud.role()` is `"owner"`) get the
staff side with its four tabs; everyone else gets the member side, which scrolls. Staff can
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

**Sign up a new member** shows the staff member's own QR. The member scans it, signs in, and the
staff phone opens their new card the moment the friendship lands. If they were already connected
to that staff account, nothing lands: find them under **Members → From your friends** instead.

## 4. The member side (Home scrolls)

- **The card**: the club's name, your name, your tier, your points large, member since and your
  member number. With no card yet: "Not a member yet. Show your QR at the bar and they'll sign
  you up."
- **Show my QR**, the one button you came for (76px).
- **Next reward**: "Your next reward is 250 points away", with a bar. Free rewards are never
  "away"; with everything affordable the line says so.
- **Rewards**: each with its picture (an emoji, or a photo staff added), title, blurb or
  condition, and its cost (or "Free"). A reward you can afford shows its cost in the accent;
  one you can't is dimmed. Tap one for the full text and **Show my QR**: staff redeem it.
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
- **Redeem**: pick a reward the member can afford; its cost comes off. Rewards they can't afford
  aren't offered, and a line says how many need more points.
- **Adjust**: signed points and a reason (required).

Each writes **one batch**: the entry, and the card's cached `points`, `xp` and `lastAt`. Then
**Details**: member number, status (Casual · Member · Lapsed), and the **staff note**, which the
member never reads. **This month**: visits, rands, points. **History**: every entry, with a `⋯`
that offers **Hold to void** (a voided entry stays, struck through, and the card is recomputed)
and, for the owner, **Hold to delete**. The owner's `⋯` at the top offers **Make staff** or
**Remove from staff**.

**Items.** Rewards | Earn. Each row has its picture, title, blurb, cost or points, and a `⋯`:
**Edit**, **Hide** / **Show** (hidden items stay in history), **Hold to delete**. **Add a
reward** / **Add a way to earn** opens the same sheet as Edit: title, blurb, cost (0 is free) and
condition for a reward, points for an earn, an emoji, and for a reward a photo (shrunk to a
320px JPEG kept in the document, under 100,000 characters). An empty list offers **Start from
the Sessions list**: the club's eight rewards and eight ways to earn as they were on 2026-10-02
(`loyalty.js` `seedItems`).

**More.** Settings (club name, points a rand, XP a rand, the three tier names and the Silver
and Gold thresholds), Staff (the owner only: the list, **Add staff** by scanning their QR,
`⋯` → **Hold to remove**), Export, Import (owner), **Hold to rebuild points** (every card
recomputed from its entries), **View as a member**, and the version.

## 6. Data

Under `/sidequests/sessions-loyalty/`. Times are milliseconds.

```
settings/main   { name, pointsPerRand, xpPerRand, tiers: [{ name, xp }], updatedBy }
staff/<uid>     { name, addedAt, addedBy }
rewards/<id>    { title, blurb, cost, condition, emoji, photo, active, order, createdAt }
earns/<id>      { title, blurb, points, emoji, active, order, createdAt }
cards/<uid>     { uid, name, since, memberNo, status, points, xp, lastAt, by }
notes/<uid>     { text, updatedAt, by }
entries/<id>    { kind, uid, name, by, byName, at, rands, points, xp, item, title, note,
                  voided?, voidedBy?, voidedAt? }
```

**Who reads what** (`shared/firestore.rules`, cases in `shared/rules-check.mjs`):

| | A member | Staff | The owner |
|---|---|---|---|
| settings, rewards, earns | read | read, write | the same |
| staff/ | get their own | get, list | write |
| cards/ | get their own | get, list, write | the same |
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

Monthly stat pages, referrals tracked by code, push notifications, booking integration, a
member-side claim queue, printing a QR for the till (needs a code that outlives 24 hours:
`KIT-PLAN.md` Parked, Groups), and anything in Rack It: `KIT-PLAN.md`, "Sessions Loyalty meets
Rack It".
