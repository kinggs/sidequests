# Connect — working doc for the build sessions

Connect is the first app that opens sidequests beyond the family: an **account** tier that
anyone with Google can join, beside the family **member** tier that exists today. This doc
is the handover between sessions. Each build session ends deployed and working, ticks its
boxes and writes a Handover note.

**Start a session with:** "Read `connect/PLAN.md` and do Session N."

## Read first

1. `CLAUDE.md` — repo rules: direct to `main`, one file per app, bump `APP_VERSION` and
   `CACHE` together, deploy with `/deployquest`, test with `?mock`.
2. `connect/SPEC.md` — what the app does, the privacy table, the data.
3. `shared/firestore.rules`, `shared/cloud.js`, `shared/cloud-memory.js`, in full.
4. **Handover**, at the bottom.

## Decisions (owner interview, 2026-10-01)

- **Anyone who scans can sign in.** They get a profile and friends, never family data. They
  can't see the inviter's friends.
- **Connections are mutual and automatic.** Scanning is the consent; there's no accept step.
- **The card carries a private note, when and where you met, and tags.**
- **Every friend will become a person** in the people list that the other apps use, because
  sidequests now reaches past the family. How that works is Session 2's design, not
  Session 1's build.
- **Plan first, then build.**

## The two tiers

| | Account | Member (unchanged) |
| --- | --- | --- |
| Who | anyone signed in | email in `/members` |
| Keyed by | `uid` | email |
| Reaches | `/profiles`, `/invites` | `/sidequests/**`, `/members` |

A member is also an account. Session 1 doesn't touch the member rules at all, so every
existing app behaves identically.

---

## Session 1 — Connect 0.1.0: accounts, QR, friends

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
          && request.resource.data.keys().hasOnly(['since', 'via', '_updatedAt'])
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
  - `account.profile(uid)`: anyone's `{ name, photo }`.
  - `account.invite()`: your code, creating one if it's missing. Use a 12-character random
    id (`newId()` sliced is fine) so codes can't be guessed. Write `/invites/<code>`
    `{ uid, name }` and `profile.invite`.
  - `account.resetInvite()`: a new code; delete the old invite.
  - `account.lookupInvite(code)`: `{ uid, name }` or null. Works before sign-in.
  - `account.accept(code)`: for your own code, return `{ self: true }`. Otherwise write
    your side `{ since, via: code, metAt }`, then theirs `{ since, via: code }`. If theirs
    already exists, skip it (that's an update and the rule refuses it). Return
    `{ uid, name, already }`.
  - `account.watchFriends(cb)`: `[{ uid, since, note, tags, metAt, metPlace }]`. Names and
    photos come from `profile(uid)`, cached in memory.
  - `account.saveFriend(uid, fields)` and `account.unfriend(uid)`, which deletes both
    sides.
- [ ] The comment block at the top of `cloud.js` lists them.

### `shared/cloud-memory.js`

- [ ] Mirror `account`. Add `?mock&as=<name>`: this tab is a different fake user (uid
  `mock-<name>`), held in `sessionStorage`. The store is shared across tabs, so two tabs
  test the whole scan:
  - Tab A: `connect/?mock`, which shows the QR. Copy its link.
  - Tab B: `connect/?mock&as=waiter&i=<code>`, which connects, and both lists update.
- [ ] Model the `accept` refusals (wrong code, other side already present), so the flow is
  tested honestly. That's the one rule here worth faking.

### The app (`/sidequest` scaffold, app id `connect`)

- [ ] **Opening with `?i=<code>`**: save the code to `localStorage` before anything else,
  so it survives the Google redirect, then clear it from the URL.
  - **Signed out**: run `lookupInvite` and show the inviter's name: "Connect with Kenny
    Inggs", with **Sign in with Google** below.
  - **Signed in**: `accept`, then a "You're connected" card with their avatar and name.
    For a brand-new profile, offer **Add a photo** and **Install on this phone**.
  - **Bad or retired code**: "This QR is no longer active. Ask them to show it again."
- [ ] **Home**: **Show my QR** is the big primary action. The friends list sits below,
  with search and tag chips.
- [ ] **My QR screen**: name, avatar, a large QR, and **New code** (quiet, behind a
  confirm). It holds the screen on (`phone.keepAwake`) and goes fullscreen. QR library: a
  CDN build (for example `qrcode-generator`). Add its URL to `sw.js`'s cache list and keep
  the code in `localStorage`, so the QR shows with no signal.
- [ ] **Friend card**: avatar, full name, met (date and place), note, tag chips, Remove
  (behind a confirm). The place defaults to the last one used (in `localStorage`).
- [ ] **Profile**: edit your name. **Take or pick a photo** (`<input type=file
  accept=image/* capture=user>`) shrinks it to 256 px JPEG in a canvas and saves it with
  `saveMe({ photo })`. **Use my Google photo** goes back.
- [ ] **Avatars**: `people.avatar` reads the people list, which outsiders can't reach. Use
  a small local avatar in the same style: photo in a neutral ring, or the initial. Moving
  `avatar` onto profiles is Session 2.
- [ ] **Export and Import** (rule 9) under More.
- [ ] `--accent` marks only "new" (a friend made today). Everything else stays neutral.
- [ ] Test the whole two-tab scan in `?mock`. Then test once for real: owner's phone plus
  a second Google account that isn't on `/members`. Confirm the second account can't read
  `/sidequests/rack-it/state/main`, by checking the error in the console.
- [ ] Landing page link. `/deployquest`.

### Done when

The owner shows the QR at the pool hall. A stranger scans it, signs in and sees "You're
connected with Kenny Inggs". Both lists show each other. Neither can see the other's
friends. Rack It and the other apps are untouched.

---

## Session 2 — Design (Fable): friends as people, outsiders in apps

This is a design session with no code. It answers the following and writes Session 3 here.

1. **Whose people list.** Today `/sidequests/_shared/people` is one household list that
   every member sees. If every friend becomes a person, either the waiter shows in the
   family's Rack It picker, or the list becomes per viewer (you + your friends + the
   household). Which, and how does `people.js` change?
2. **Person ↔ account.** A claimed person already carries `uid`. Should person ids become
   uids for account-backed people, or should profiles point at person ids? And how does
   `people.resolve()` keep old ids working?
3. **Outsiders in an app.** A pool friend who isn't family wants to score in Rack It. Does
   access become per app (a Rack It "club" list) instead of `isFamily()`? Who can see which
   matches?
4. **One photo.** `people.avatar` should prefer the profile photo over Google's.
5. **Members by uid.** Move `/members` from email to uid keying, so non-Google sign-in can
   reach family apps too.
6. **Groups.** "Connect me to everyone at the club" — a group QR?

## Parked

- Other sign-in methods: email link, Apple, phone. The uid keying makes them additive.
- An in-app scanner (`BarcodeDetector` on Android Chrome).
- Blocking. Today Remove plus **New code** covers it.
- iPhone: the home-screen app and Safari keep separate sign-ins, so an iPhone scan always
  lands in Safari. Note it in Session 1's report and leave it.

## Handover

*(Each session writes here.)*
