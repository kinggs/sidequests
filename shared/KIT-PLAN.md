# The kit — working doc for the build sessions

Sidequests is opening beyond the family: pool friends, staff at the venues, people without
a phone. This plan builds the shared parts that make that work (`shared/KIT.md`), using
**Rack It as the pilot**. Each build session ends deployed and working, ticks its boxes and
writes a Handover note.

**Start a session with:** "Read `shared/KIT-PLAN.md` and do Session N."

## Read first

1. `CLAUDE.md` — repo rules: direct to `main`, bump `APP_VERSION` and `CACHE` together,
   deploy with `/deployquest`, test with `?mock`.
2. `shared/KIT.md` — the parts, what Connect and Players do, privacy, data.
3. `shared/firestore.rules`, `shared/cloud.js`, `shared/cloud-memory.js`,
   `shared/people.js`, in full.
4. For Rack It work, `rack-it/SPEC.md` (§8 People, §9 Data), and **Ground rules** in
   `rack-it/V3-PLAN.md`: 11-Point-Nine must behave identically, and `node --test` must pass.
5. **Handover**, at the bottom.

## Decisions (owner interviews, 2026-10-01)

| Question | Decision |
| --- | --- |
| Who can sign in after a scan | Anyone. They get an account and friends, never family data, and they can't see the inviter's friends. |
| Accepting | Mutual and automatic: the QR is the consent. |
| Friend card | Private note, when and where you met, tags. |
| Where the QR lands | In the app it was opened from (`…/rack-it/?i=<code>`). The friendship is account-wide, so it shows in every app with Connect. |
| How players are chosen | No fixed player list: a friend, a QR scan on the spot, or a guest. |
| Guests (no phone) | A typed name, claimable later: once they're on Connect, their guest games merge into their account. |
| Today's family people | Fold into friends. Family people with an account become friends; people without one become guests. |
| What an outsider sees in Rack It | Only the matches they played in. |
| Pilot | Connect lives inside Rack It first. There's no separate Connect app yet. |
| New apps | A menu of kit parts (`KIT.md`) that `/sidequest` offers. |
| Offline | A nice-to-have, not a requirement. The pool hall has signal. |

## The two tiers

| | Account | Family (unchanged until Session 4) |
| --- | --- | --- |
| Who | anyone signed in | email in `/members` |
| Keyed by | `uid` | email |
| Reaches | `/profiles`, `/invites` | `/sidequests/**`, `/members` |

A family member is also an account.

## The road

| Session | Kind | Lands | Visible change |
| --- | --- | --- | --- |
| 1 | build | Accounts and Connect in the kit, mounted in Rack It | My QR and Friends in Rack It; anyone can scan and connect |
| 2 | design (Fable) | Players and outsiders in Rack It, written as Sessions 3–4 | none |
| 3 | build | Players: pick a friend, scan, or add a guest; family folds in | Rack It's setup picks from friends |
| 4 | build | Outsiders play in Rack It and see their own matches | A pool friend uses Rack It |
| 5 | build | The kit menu in `/sidequest`; other apps adopt Connect and Players | Bloc 11 and the rest get friends |

Don't build ahead. Ideas go in **Parked**.

---

## Session 1 — Accounts and Connect, piloted in Rack It

This session adds no new app. Rack It gains **My QR** and **Friends**. Its players, matches
and ratings don't change.

### Rules (`shared/firestore.rules`)

- [ ] Add, above the catch-all:

```
function signedIn() { return request.auth != null; }
function me(uid)    { return signedIn() && request.auth.uid == uid; }

// Accounts: anyone signed in. Readable one at a time by uid, never listed.
match /profiles/{uid} {
  allow get: if signedIn();
  allow create, update: if me(uid) && request.resource.data.keys().hasOnly(
    ['name', 'photo', 'googlePhoto', 'invite', 'createdAt', '_updatedAt']);
  allow delete: if me(uid);

  match /friends/{other} {
    // Your own list: only you read it and only you edit your note, tags and met.
    allow read, update, delete: if me(uid);
    allow create: if me(uid)
      // ...or the person scanning your QR adds themselves, carrying your live invite code.
      || (me(other)
          && request.resource.data.keys().hasOnly(['since', 'via', 'app', '_updatedAt'])
          && get(/databases/$(database)/documents/invites/$(request.resource.data.via)).data.uid == uid);
    // Either side may end it.
    allow delete: if me(other);
  }
}

// Invites: the QR's code. Anyone holding the QR may read who it's from.
match /invites/{code} {
  allow get: if true;
  allow create: if signedIn() && request.resource.data.uid == request.auth.uid;
  allow delete: if signedIn() && resource.data.uid == request.auth.uid;
}
```

- [ ] Update the header comment to name both tiers. Pushing the file deploys it (the
  `deploy-rules` Action).

### `shared/cloud.js`: an `account` section

- [ ] Uid-keyed, beside `shared` and the members calls:
  - `account.me()` and `account.watchMe(cb)`: your profile, or null.
  - `account.saveMe(fields)`: name and photo. On first sign-in it creates the profile from
    Google's `displayName` and `photoURL`.
  - `account.profile(uid)`: anyone's `{ name, photo }`, cached in memory.
  - `account.invite()`: your code, creating one if it's missing. Use 12 random characters
    so codes can't be guessed. Write `/invites/<code>` `{ uid, name }` and
    `profile.invite`.
  - `account.resetInvite()`: a new code; delete the old invite.
  - `account.lookupInvite(code)`: `{ uid, name }` or null. Works before sign-in.
  - `account.accept(code, app)`: for your own code, return `{ self: true }`. Otherwise
    write your side `{ since, via, app, metAt }`, then theirs `{ since, via, app }`. If
    theirs already exists, skip it (that's an update and the rule refuses it). Return
    `{ uid, name, already }`.
  - `account.watchFriends(cb)`: `[{ uid, since, app, note, tags, metAt, metPlace }]`.
  - `account.saveFriend(uid, fields)` and `account.unfriend(uid)`, which deletes both
    sides.
- [ ] The comment block at the top of `cloud.js` lists them.

### `shared/cloud-memory.js`

- [ ] Mirror `account`. Add `?mock&as=<name>`: this tab is a different fake user (uid
  `mock-<name>`, not on `/members`), held in `sessionStorage`. The store is shared across
  tabs, so two tabs test the whole scan:
  - Tab A: `rack-it/?mock`, opening My QR. Copy its link.
  - Tab B: `rack-it/?mock&as=waiter&i=<code>`, which connects, and both Friends lists
    update.
- [ ] Model the `accept` refusals (wrong code, other side already present), so the flow is
  tested honestly. That's the one rule here worth faking.

### `shared/connect.js`: the Connect part

A module like `people.js`: its own sheets and styles, built from `theme.css` parts. An app
mounts it and adds two buttons.

- [ ] `connect.handleInvite({ app, onDone })`, called first at startup:
  - It saves `?i=<code>` to `localStorage` before anything else, so the code survives the
    Google redirect, then clears it from the URL.
  - **Signed out**: `lookupInvite`, then a full-screen card: "Connect with Kenny Inggs" and
    **Sign in with Google**.
  - **Signed in**: `accept`, then "You're connected with Kenny Inggs" with their avatar.
    For a new profile, offer **Add a photo**.
  - **Retired code**: "This QR is no longer active. Ask them to show it again."
- [ ] `connect.showQR({ app })`: name, avatar and a large QR of `…/<app>/?i=<code>`.
  `phone.keepAwake` while it's open, `phone.fullscreen()` on the way in. **New code** is
  quiet and sits behind a confirm. QR library from a CDN (e.g. `qrcode-generator`), added
  to the app's `sw.js` cache list.
- [ ] `connect.showFriends()`: the list (search, tag chips) and the friend card (met date
  and place, note, tags, Remove behind a confirm). The place defaults to the last one
  used, kept in `localStorage`.
- [ ] `connect.showProfile()`: edit your name. **Take or pick a photo**
  (`<input type=file accept=image/* capture=user>`) shrinks it to 256 px JPEG in a canvas;
  **Use my Google photo** goes back.
- [ ] `connect.avatar(uid, size)`: the profile photo in a neutral ring, or the initial.
  Same look as `people.avatar`.
- [ ] Export and Import of profile plus friends, for the app's existing Export screen.

### Rack It (minor bump, from 2.4.0)

- [ ] Call `connect.handleInvite({ app: "rack-it" })` before `people.start`.
- [ ] **Outsiders**: Rack It today assumes a member, so a non-member would hit permission
  errors. When `cloud.role()` is null, don't start the Rack It watchers. Show a simple
  screen instead: their avatar and name, **My QR**, **Friends**, and "Rack It opens up to
  friends soon." Session 4 replaces it.
- [ ] Members: **My QR** and **Friends** under More, beside Invites.
- [ ] `rack-it/SPEC.md`: a short section on Connect, plus a §13 line. Export carries the
  profile and friends.
- [ ] Test the two-tab scan in `?mock`, at 390×844 and 360×640. Then once for real: the
  owner's phone plus a Google account that isn't on `/members`. Confirm that account
  connects, sees only its own friends, and gets the outsider screen.
- [ ] `node --test`, one scored 11-Point-Nine match unchanged. `/deployquest`.

### Done when

The owner opens My QR in Rack It. A stranger scans it, signs in and lands in Rack It,
connected. Both Friends lists show each other. Players, matches and ratings are untouched.

---

## Session 2 — Design (Fable): Players, and outsiders in Rack It

This is a design session with no code. It writes Sessions 3 and 4 into this doc, in the
same checklist style. Questions to settle:

1. **Player ids.** Should a player who has an account be stored by `uid`, and a guest by a
   `g_<id>`? How do today's person ids resolve forward, through `people.resolve()` and
   `mergedInto` pointers to the uid?
2. **Folding the family in.** Each family member, on sign-in, writes friend documents for
   every claimed family person, so the other side appears when that person signs in. No
   special rule is needed: each side writes only its own list. Unclaimed people become
   guests owned by whom: the owner, or every family member?
3. **Where guests live.** Under the account that created them, or per app? Who can claim
   one: only the creator tapping "that was them", or the guest scanning a QR on the
   creator's phone?
4. **Matches for outsiders.** Each match carries a `uids` array of its players' accounts.
   Then: `allow read: if isFamily() || request.auth.uid in resource.data.uids`, list
   queries filtered with `array-contains`, and `cloud.list` gains a `where`. Who may
   create or score a match: any player in it?
5. **Ratings.** All ratings sit in `state/main.players`, rebuilt by replaying every match.
   An outsider needs their own rating and their opponent's for the handicap, without
   seeing the whole club. Per-player rating documents? Who writes them when an outsider
   finishes a match?
6. **Does "family" survive?** Once Rack It runs on Players and `uids`, `/members` may only
   matter for the owner role and the older apps. Should it move to uid keying, or retire?
7. **Blaze (pay-as-you-go).** If the ratings in question 5 need trusted server code, that
   means a Cloud Function, which needs the Blaze plan: a card on file, likely $0 a month at
   our scale, and a deploy step for the function (a GitHub Action, like the rules). Decide
   here. Nothing before Session 3 needs it.
8. **The setup picker.** Friends filtered by a `pool` tag? Recent opponents first? Where
   do **Scan a new player** and **Add a guest** sit?

## Session 5 — outline (finalised after Session 4)

- The menu: `/sidequest` asks which parts a new app wants and wires them; `_template`
  gains commented-out mounts.
- Bloc 11, Around the Clock and Zombie Dice adopt Connect and Players.
- Perhaps a thin standalone Connect app at `connect/`, for people who only want the QR.

## Parked

- Other sign-in methods: email link, Apple, phone. The uid keying makes them additive.
- Firebase anonymous sign-in, for someone with a phone but no Google account.
- An in-app scanner (`BarcodeDetector` on Android Chrome), to add a player without the
  camera app.
- Groups: "connect me to everyone at the club", a group QR.
- Blocking. Remove plus **New code** covers it for now.
- iPhone: the home-screen app and Safari keep separate sign-ins, so an iPhone scan always
  lands in Safari. Note it and leave it.

## Handover

*(Each session writes here.)*
