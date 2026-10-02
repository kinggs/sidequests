# The kit — finished sessions

Sessions 0 to 8 of `shared/KIT-PLAN.md`, moved here verbatim on 2026-10-02 so the plan stays
short. Read a session's Handover note here when a later session builds on it; the plan says
which. Nothing in this file is still to do.

---

## Session 0 — Safety net

No app changes. `?mock` gives every fake user full access, so it can't show the bug outsiders
will hit: a permission error that only appears in production. This session closes that gap.

### `shared/cloud-memory.js`

- [x] `?mock&as=<name>`: this tab is a different fake user (uid `mock-<name>`, email
  `<name>@example.com`, **not** on `/members`), held in `sessionStorage`. Signed-out state
  is per user. The store stays shared across tabs. `&role=owner|member` still makes one a
  household member.
- [x] **Model the tiers, not the field rules.** A user who isn't on `/members` gets
  `permission-denied` on every read, write and list under `sidequests/`. That is production
  today. Later sessions open paths by adding rows to one table at the top of the file; the
  header comment says a rules change that opens a path adds its row.

### `shared/smoke.mjs`

- [x] A Node script, found the way `make-icons.mjs` finds Playwright. It serves the repo,
  opens every app folder at `?mock=reset` then `?mock`, and again at `?mock&as=stranger`.
  It fails on a page error or `console.error`, and prints one line an app. With no
  Playwright it exits 2 and says so.
- [x] `/deployquest` runs it before the push when `shared/` changed, and reports a skip
  plainly.

### Rules check

- [x] `shared/rules-check.mjs`: `node:test` cases on `@firebase/rules-unit-testing` for the
  rules as they are: a member reads and writes; a non-member is refused; only the owner
  deletes a Rack It match. The name avoids `*.test.mjs` on purpose, so a bare `node --test`
  doesn't try to run it without the emulator.
- [x] `deploy-rules.yml`: before the deploy step, `npm i --no-save
  @firebase/rules-unit-testing firebase`, then `npx firebase-tools emulators:exec --only
  firestore --project demo-sidequests "node --test shared/rules-check.mjs"`. Add the file to
  the workflow's `paths`. No `package.json` is committed. ⚠ Unproven here: check the first
  run's log, and that a deliberately broken case fails the job and stops the deploy.
- [x] (Not needed: it ran.) If the emulator won't run in the Action, stop: leave the deploy step as it was, write
  what broke in Handover, and finish the rest of the session. The owner decides what next.
- [x] `/deployquest`: after a push that touches the rules, wait for the `deploy-rules` run
  and report its result.
- [x] `CLAUDE.md`: the testing bullet gains `&as=`, the smoke script and the rules check.

### Done when

`rack-it/?mock&as=stranger` shows Rack It's "hasn't been invited" screen, the smoke script
is green, and the Action ran the rules check before deploying.

✓ except the smoke script: green for every app as the owner, red for four as a stranger
(Handover, Session 0).

---

## Session 1 — Accounts and Connect

This session adds no new app. Rack It gains **My QR** and **Friends**. Its players, matches
and ratings don't change.

### Rules (`shared/firestore.rules`)

- [x] Add, above the catch-all, with cases in `rules-check.mjs` for each line of "Must
  refuse" below:

```
function signedIn() { return request.auth != null; }
function me(uid)    { return signedIn() && request.auth.uid == uid; }
function invite(code) { return get(/databases/$(database)/documents/invites/$(code)).data; }

// Accounts: anyone signed in. Readable one at a time by uid, never listed.
match /profiles/{uid} {
  allow get: if signedIn();
  allow create, update: if me(uid)
    && request.resource.data.keys().hasOnly(['name', 'photo', 'googlePhoto', 'createdAt', '_updatedAt'])
    && request.resource.data.name is string && request.resource.data.name.size() <= 60
    && request.resource.data.get('photo', '').size() <= 60000;
  allow delete: if me(uid);
  // Yours alone: private/main (your live code), friends/<uid> (note, tags, met), guests/<id>.
  match /{sub}/{doc} {
    allow read, write: if me(uid) && sub in ['private', 'friends', 'guests'];
  }
}

// The QR's code. Anyone holding it may read who it's from. It dies after a day.
match /invites/{code} {
  allow get: if true;
  allow create: if signedIn()
    && request.resource.data.keys().hasOnly(['uid', 'name', 'expires', '_updatedAt'])
    && request.resource.data.uid == request.auth.uid
    && request.resource.data.name is string && request.resource.data.name.size() <= 60
    && request.resource.data.expires is timestamp
    && request.resource.data.expires <= request.time + duration.value(25, 'h');
  allow delete: if signedIn() && resource.data.uid == request.auth.uid;
}

// A friendship: one document for the pair, id "<lower uid>_<higher uid>". Made only by one
// of the two, carrying the other's live code. Either may end it. Nobody edits it.
match /friendships/{pair} {
  allow read: if signedIn() && request.auth.uid in resource.data.uids;
  allow create: if signedIn()
    && request.resource.data.keys().hasOnly(['uids', 'since', 'via', 'app', '_updatedAt'])
    && request.resource.data.uids.size() == 2
    && request.resource.data.uids[0] < request.resource.data.uids[1]
    && pair == request.resource.data.uids[0] + '_' + request.resource.data.uids[1]
    && request.auth.uid in request.resource.data.uids
    && invite(request.resource.data.via).uid in request.resource.data.uids
    && invite(request.resource.data.via).uid != request.auth.uid
    && invite(request.resource.data.via).expires > request.time;
  allow delete: if signedIn() && request.auth.uid in resource.data.uids;
}
```

- [x] **Must refuse:** a friendship with no code, an expired code, a deleted code, your own
  code, or a code belonging to a third person; reading a friendship you aren't in; listing
  `/profiles`; reading anyone else's `private`, `friends` or `guests`; a profile with an
  extra key; an invite for another uid or one that lasts over 25 hours.
- [x] Update the header comment to name both tiers. Cost: one `get()` per connection.

### `shared/cloud.js`: an `account` section

- [x] Uid-keyed, beside `shared` and the members calls. The header comment lists them.
  - `account.me()`, `account.watchMe(cb)`: your profile, or null.
  - `account.saveMe(fields)`: name and photo. First sign-in creates the profile from
    Google's `displayName` and `photoURL`.
  - `account.profile(uid)`: anyone's `{ name, photo }`, cached in memory.
  - `account.invite()`: your live code. Reads `private/main`; when there's none, or it
    expires within an hour, mints 12 random characters, writes `/invites/<code>`
    `{ uid, name, expires }` (a Firestore `Timestamp`, now + 24 h) and `private/main`
    `{ invite, expires }`, and deletes the code it replaces.
  - `account.lookupInvite(code)`: `{ uid, name }`, or null when missing or expired. Works
    before sign-in.
  - `account.accept(code, app)`: your own code returns `{ self: true }`. If the pair
    document exists, `{ uid, name, already: true }`. Otherwise create it
    `{ uids, since, via, app }`, then your private card `friends/<them>` `{ metAt }`.
  - `account.watchFriends(cb)`: the pairs where `uids` `array-contains` you, joined to your
    private cards: `[{ uid, since, app, note, tags, metAt, metPlace }]`.
  - `account.saveFriend(uid, fields)`: your card only.
  - `account.unfriend(uid)`: deletes the pair and your card.

### `shared/cloud-memory.js`

- [x] Mirror `account`, with its refusals: wrong, expired or own code; reading a pair you
  aren't in; someone else's `private`, `friends`, `guests`. Two tabs test the whole scan:
  - Tab A: `rack-it/?mock`, opening My QR. Copy its link.
  - Tab B: `rack-it/?mock&as=waiter&i=<code>`, which connects, and both Friends lists
    update.

### `shared/connect.js`: the Connect part

A module like `people.js`: its own sheets and styles, built from `theme.css` parts.

- [x] `connect.handleInvite({ app, onDone })`, called first at startup:
  - It saves `?i=<code>` to `localStorage` before anything else, so the code survives the
    Google redirect, then clears it from the URL.
  - **Signed out**: `lookupInvite`, then a full-screen card: "Connect with Kenny Inggs" and
    **Sign in with Google**.
  - **Signed in**: `accept`, then "You're connected with Kenny Inggs" with their avatar.
  - **Dead code**: "This QR has expired. Ask them to show it again."
- [x] `connect.showQR({ app })`: name, avatar and a large QR of `…/<app>/?i=<code>`.
  `phone.keepAwake` while it's open, `phone.fullscreen()` on the way in. It closes with
  "Connected with …" when a new pair arrives while it's open.
- [x] The QR library is vendored: one MIT file (e.g. `qrcode-generator`) at
  `shared/vendor/qrcode.js`, its licence in the file. ⚠ It ships as a classic script; add
  the `export` line or load it as a script. Don't use a CDN: the service worker only caches
  same-origin files.
- [x] `connect.showFriends()`: avatar and full name, newest first, with a search box. Tap a
  row for **Remove** (confirmed). The card's note, tags and place are Session 2.
- [x] `connect.avatar(uid, size)`: the profile photo in a neutral ring, or the initial.
  Same look as `people.avatar`.

### Rack It (minor bump, from 2.4.0)

- [x] Call `connect.handleInvite({ app: "rack-it" })` before `people.start`.
- [x] **Outsiders**: when `cloud.role()` is null, don't start the Rack It watchers. Show a
  simple screen: their avatar and name, **My QR**, **Friends**, **Install on this phone**,
  **Sign out**, and "Rack It opens up to friends soon." Session 6 replaces it.
- [x] Members: **My QR** and **Friends** under More, beside Invites.
- [x] `rack-it/SPEC.md`: a short section on Connect, plus a §13 line.
- [ ] Test the two-tab scan in `?mock`, at 390×844 and 360×640. Then for real, with a Google
  account that isn't on `/members`: once on Android with Rack It installed, once in a plain
  browser. ⚠ Redirect sign-in can fail where the browser blocks third-party storage
  (`github.io` and `firebaseapp.com` are different sites); if the stranger's sign-in loops,
  that's why. Record what happened in Handover.
  (`?mock` part done at both sizes; the real phones are pending: Handover, Session 1.)

### Done when

The owner opens My QR in Rack It. A stranger scans it, signs in and lands in Rack It,
connected. Both Friends lists show each other. Yesterday's QR is refused.

---

## Session 2 — The friend card, your profile, leaving

- [x] **Friend card** in `connect.showFriends()`, all private to you: **Note**; **Met**
  (date and time stamped at connect; a typed place that defaults to the last one used, kept
  in `localStorage`); **Tags** as chips offered from the tags you've used, and tag chips
  that filter the list.
- [x] `connect.showProfile()`: edit your name. **Take or pick a photo**
  (`<input type=file accept=image/* capture=user>`) shrinks to a 192 px JPEG in a canvas.
  ⚠ Check the base64 stays under the rule's 60,000 characters; lower the quality if not.
  **Use my Google photo** goes back.
- [x] `account.exportMe()` and `account.importMe(json)`: profile, friends' cards, guests.
  Import restores your cards only; it can't remake a friendship. Rack It's Export carries
  it.
- [x] **Delete my account**, at the bottom of the profile sheet, a hold then a typed
  confirm: deletes your pairs, cards, guests, live invite, `private/main` and profile, then
  signs out. Each document is deleted one by one (Firestore doesn't cascade). ⚠ Matches you
  played keep your name and uid (Session 6); only the owner can remove those.
- [x] Rack It: **Profile** under More and on the outsider screen. SPEC and version bump.

### Done when

A note, a tag and a photo survive a reload on another phone. A deleted account leaves no
document under `/profiles/<uid>`, `/friendships` or `/invites`.

---

## Session 3 — One id per person; ratings in their own documents

Household only, and nothing changes on screen. It's the migration the later sessions stand
on, kept apart so that a wrong number has one possible cause. **Before deploying, the owner
exports Rack It.**

### `shared/people.js`

- [x] `resolve(id)` follows `mergedInto`, then returns the person's `uid` when they've
  claimed. An account's id is its uid from here on.
- [x] `get(uid)`, `nameOf`, `colourOf`, `avatar`, `isMe` accept a uid and find the claimed
  person. `active()` and `meId()` return uids for claimed people.
- [x] **Unclaim goes.** A record stored under a uid would be orphaned by it. (A wrong claim
  is fixed by the owner editing the person document in the console; see Parked.)
- [x] Smoke test with a seed holding claimed, unclaimed and merged people: every app shows
  the same names and tallies as before. Bloc 11, Around the Clock and Zombie Dice already
  read ids through `resolve`, so they need no edits. ⚠ Grep each for an id compared without
  `resolve` before trusting that.

### Rack It

- [x] Ratings move from `state/main.players` to `ratings/<id>`
  `{ zargo, robustness, sessions }`, keyed by the resolved id. Watched as a list (household).
- [x] Migration, on the owner's phone, once: when `ratings` is empty and
  `state/main.players` isn't, write each player to `ratings/<resolve(id)>`, then delete
  `state/main.players`. `starters/<id>` are read through `resolve` and left where they are.
- [x] Saving a match writes the two rating documents. Rebuild writes `ratings/*`.
- [x] Rules: `ratings/{id}` writable by the household (the generic read already covers it).
  A case in `rules-check.mjs`.
- [x] Export writes `ratings`; Import reads both the old `state.players` and `ratings`.
- [x] `node --test`. Then, against a seed of the owner's export if it's on hand (never
  commit it: it holds emails), Ratings shows the same numbers before and after, and
  **Rebuild ratings** proposes no change.
- [x] SPEC §8, §9 and §13.

### Done when

Every rating matches the export taken before the deploy, and a new match moves two
`ratings/` documents.

✓ in `?mock` on a seed of the owner's export (Handover, Session 3). The live move happens on
the owner's first open of 2.7.0.

---

## Session 4 — Players

`people.js` becomes Players: the same calls for the apps, new sources behind them.

### `shared/people.js`

- [x] Sources, merged and de-duplicated by resolved id:
  - **household**: `/sidequests/_shared/people`, watched only when `cloud.role()` isn't
    null;
  - **friends**: `account.watchFriends`, named and pictured by `account.profile(uid)`;
  - **guests**: `/profiles/<me>/guests/<g_id>` `{ name, createdAt }`.
- [x] `get(id)` returns `{ id, name, photo, colour, kind }`, `kind` being `"account"`,
  `"guest"` or `"household"`. A household person's own name and colour win over their
  profile's. Anyone with no colour gets the hashed one `colourOf` already gives.
- [x] `people.pick({ title, exclude, recent })` → an id, or null. A sheet: recent first
  (the app passes the ids), then everyone by name, a search box once there are more than
  eight, and two buttons at the bottom:
  - **Scan a new player** opens `connect.showQR`; the pair that arrives is picked.
  - **Add a guest** asks for a name and makes a guest.
- [x] `people.names(ids)` and `people.uidsOf(ids)`: what an app stores beside player ids.
- [x] `people.edit(null)` no longer asks for a Gmail and no longer calls `cloud.addMember`.
  It adds a household person (household members only). Invites is the only way onto
  `/members`.
- [x] `cloud-memory.js` mirrors guests. `KIT.md` and `CLAUDE.md` rule 3 describe Players.

### Rack It

- [x] Setup's two columns become two slots filled from `people.pick`. You're on teal by
  default, the last opponent is offered first, and the swap and break behaviour stay.
- [x] A new match stores `playerA`, `playerB` (resolved ids), `names: { a, b }`, `uids`
  (the accounts in it, zero to two), and `by` (the scorer's uid). Summaries and lists fall
  back to `names` when `people.get` finds nobody.
- [x] **Add player** on Ratings becomes the same Scan or Guest choice, with the starter
  estimate after it. Rack It's own Gmail field and its `addMember` call go.
- [x] Ratings lists the household's people, your friends who have a rating, and your guests.
- [x] SPEC §5, §7, §8, §9, §13.

### Done when

The owner starts a match against a friend made by QR and against a typed guest, and both
save, with `names` and `uids` on the documents. Nobody new appears on Invites.

✓ in `?mock` with two tabs (Handover, Session 4). Real phones pending.

---

## Session 5 — Rated matches and confirming

Household only; Session 6 puts rules behind it. Ratings stop moving on every match.

- [x] Setup gains a **Rated** tick, off by default. It's offered only when both players are
  accounts. The match stores `rated: true | false`. **A stored match with no `rated` field
  is rated**: every match before this session moved ratings.
- [x] **Friendly:** Save sets `status: "done"` and writes no rating. The handicap still
  comes from the ratings. The result card and summary say "Friendly · ratings unchanged".
- [x] **Rated:** Save sets `status: "pending"` and `endedBy: <uid>`, and moves nothing. The
  opponent's phone shows a strip above the tabs: "Kenny 5–3 You · rated" with **Confirm**
  and **Not right**. The scorer sees "Waiting for Melanie to confirm" and **Withdraw**.
  - **Confirm** works the result out from the two ratings as they stand now and writes, in
    one batch: both `ratings/` documents (each with `match: <id>`), and the match
    `{ status: "done", zargoBefore, zargoAfter, ratedAt, confirmedBy }`.
  - **Not right** or **Withdraw** writes `{ status: "done", rated: false }` with
    `declinedBy` or `withdrawnBy`. It stands as a friendly.
- [x] `cloud.batch([{ save | patch | delete: path, data }])`, atomic, in `cloud.js` and
  `cloud-memory.js`.
- [x] `zargo.js` `replay` takes only rated, finished matches, ordered by
  `ratedAt || endedAt`; friendlies add nothing to robustness or matches played. A test for
  each. Existing tests pass untouched.
- [x] Matches and summaries show pending and friendly plainly. ⚠ The win record on a
  person's page counts friendlies too; say so in Handover so the owner can rule on it.
- [x] SPEC §3, §5, §6, §7, §9, §13; `ZARGO.md` where it says what moves a rating.

### Done when

A friendly leaves both ratings alone. A rated match moves them only after the second phone
confirms, and **Rebuild ratings** then proposes no change.

✓ in `?mock` with two household tabs (Handover, Session 5). Real phones pending.

---

## Session 6 — Outsiders play in Rack It

### Rules

- [x] In `shared/firestore.rules`, proved in `rules-check.mjs` before the app is touched.
  ⚠ This is a sketch: `let`, the ternary and `getAfter()` must each be shown to work in the
  emulator. The uid check goes first so a player's own writes cost no `/members` lookup.

```
function uid() { return request.auth.uid; }
function connected(a, b) {
  return exists(/databases/$(database)/documents/friendships/$(a < b ? a + '_' + b : b + '_' + a));
}

match /sidequests/rack-it/matches/{id} {
  allow read: if (signedIn() && uid() in resource.data.get('uids', [])) || isFamily();
  // An outsider starts a match they are in, alone with a guest or against a friend.
  allow create: if isFamily() || (signedIn()
    && request.resource.data.by == uid() && uid() in request.resource.data.uids
    && request.resource.data.status == 'live'
    && (request.resource.data.uids.size() == 1
        || (request.resource.data.uids.size() == 2
            && connected(request.resource.data.uids[0], request.resource.data.uids[1]))));
  // A player scores it while it's live or pending, and can't change who is in it.
  allow update: if isOwner()
    || (isFamily() && resource.data.get('status', '') != 'done')
    || (signedIn() && uid() in resource.data.get('uids', [])
        && resource.data.status in ['live', 'pending']
        && !request.resource.data.diff(resource.data).affectedKeys()
              .hasAny(['uids', 'by', 'playerA', 'playerB'])
        // endedBy is written once, as yourself, when a live match ends.
        && (request.resource.data.get('endedBy', null) == resource.data.get('endedBy', null)
            || (resource.data.status == 'live' && request.resource.data.endedBy == uid()))
        // rated only ever turns off.
        && (request.resource.data.get('rated', false) == resource.data.get('rated', false)
            || request.resource.data.rated == false)
        // A rated match is finished only from pending, by the player who didn't end it.
        && (!(request.resource.data.status == 'done' && request.resource.data.get('rated', false))
            || (resource.data.status == 'pending' && uid() != resource.data.endedBy)));
  allow delete: if isOwner();
}

// A rating is read one at a time by whoever has the id. Only the household lists them.
match /sidequests/rack-it/ratings/{pid} {
  allow get: if signedIn();
  allow write: if isFamily()
    || confirming(pid)
    || (signedIn() && resource == null
        && exists(/databases/$(database)/documents/profiles/$(uid())/guests/$(pid)));
}
// An outsider moves a rating only in the same batch that confirms a rated match which that
// player is in, and only as the player who didn't end it.
function confirming(pid) {
  let path = /databases/$(database)/documents/sidequests/rack-it/matches/$(request.resource.data.match);
  let was = get(path).data;
  return signedIn() && was.status == 'pending' && was.rated == true
    && getAfter(path).data.status == 'done'
    && uid() in was.uids && uid() != was.endedBy && pid in was.uids;
}
match /sidequests/rack-it/state/main {
  allow get: if signedIn();       // config only, once Session 3 has moved the ratings out
}
```

- [x] Write the update rule's cases first: Save on a rated match (live to pending, `endedBy`
  set to yourself), Confirm, Not right and Withdraw must pass; each "Must refuse" must fail.
- [x] **Must refuse:** a match against someone you aren't connected to; a match you aren't
  in; changing `uids` or the players; confirming your own result, by any route (finishing it
  yourself, or rewriting `endedBy`); turning a friendly into a rated match; a rating written outside
  a confirmation; a rating for a player who isn't in that match; listing `ratings` or
  `matches` without the `uids` filter; anything else under `/sidequests/`.
- [x] ⚠ What the rules can't check is the arithmetic: the confirming phone works out the
  new ratings. The owner's **Rebuild ratings** corrects a wrong one from the matches.

### `shared/cloud.js` and the mock

- [x] `cloud.list` and `cloud.watchList` take `where: [field, op, value]`. **No `orderBy`
  together with `where`**: that needs a composite index, which needs a deploy and a wider
  role for the service account. Sort on the phone.
- [x] `cloud-memory.js` opens the same paths in its table: a non-member reads a match only
  when their uid is in `uids`, lists only with the `uids` filter (Firestore refuses the
  query otherwise, so the mock must), gets `ratings/<id>` and `state/main`.

### Rack It

- [x] When `cloud.role()` is null the app runs in **friend mode** instead of the Session 1
  screen:
  - **Play**: the same setup, picking from friends and guests.
  - **Ratings**: you and your friends who have a rating, each read by id. No club list.
  - **Matches**: `where: ["uids", "array-contains", <uid>]`, newest first.
  - **More**: My QR, Friends, Profile, Export (your matches), Install, About Zargo, Sign
    out. No Invites, Import or Rebuild.
- [x] A player with no rating document starts at `config.startZargo`. A guest's starter
  estimate is written to `ratings/<g_id>` by the account that made the guest.
- [x] First open in friend mode shows, once: "Kenny's household can see the matches you
  score here."
- [x] Test in `?mock` with three tabs (owner, `&as=ann`, `&as=ben`): Ann and Ben connect and
  play a rated match; Ben confirms; the owner sees it; a fourth tab `&as=cat` sees nothing.
  Then for real, with the non-member Google account. (Real phones pending: Handover.)
- [x] SPEC §7, §8, §9, §11, §13. `KIT.md` privacy table.

### Done when

A pool friend who isn't on Invites scans, plays a friendly and a rated match against the
owner, confirms, and sees only their own matches. `rack-it/?mock&as=cat` can't read
another pair's match.

✓ in `?mock` with four tabs, and the rules on the emulator and in the Action (Handover,
Session 6). Real phones pending.

---

## Session 6b — One admin, everyone else a player (Rack It)

Owner, 2026-10-02: "A family member is just another member. We remove the notion of a family
member for now; rather the idea of an admin, and Kenny is the only admin." Rack It only; the
other apps keep `/members` until Session 8. Prerequisite done: real phones checked on 2.10.0.

### Rules (`shared/firestore.rules`), cases first

- [x] Rack It drops `isFamily()` everywhere; `isOwner()` takes its place:
  - the generic `/sidequests/{appId}/**` read becomes `isFamily() && appId != 'rack-it'`, so
    the household no longer reads Rack It through it;
  - `matches`: read `uid in uids || isOwner()`; create `outsiderStarts() || isOwner()`; update
    `playerScores() || isOwner()`; delete `isOwner()`. The household branch (and its
    `ratedOnlyTurnsOff` guard) goes;
  - `ratings`: get `signedIn()`, list only through `isOwner()`; write `confirming() ||
    guestStarter() || isOwner()`;
  - `starters`: owner only, create included. `state/main`: get `signedIn()`, write `isOwner()`.
- [x] **Must refuse**, for a member who isn't the owner (Melanie, `MEMBER` in the check):
  - reading or listing a match she isn't in;
  - listing ratings or starters;
  - writing `state/main`, a starter, or any rating outside a confirmation;
  - changing a saved match.

  Each guard turns its own case red when removed (Session 6's mutation script, in Handover).
- [x] **Must pass**:
  - the owner reads, lists and rewrites every match, and lists ratings;
  - Melanie reads and lists her own matches with the `uids` filter, and plays, saves, confirms,
    declines and withdraws exactly as an outsider does.
- [x] `/members`, Invites and the other apps don't change.

### Rack It (minor bump)

- [x] `role === "owner"` runs today's household path; anything else, `"member"` included,
  runs friend mode. `people.start` gets the household list for the owner only (an option, so
  the other apps keep reading it as members).
- [x] **Backfill, once, on the owner's phone** (like the 2.7.0 ratings move): every match with
  no `uids` gets `uids` from `people.uidsOf` of its resolved players, plus `names` if missing.
  Nothing else in the match changes. Without it Melanie loses every match before 2.8.0.
  Wait for `people.ready`, as the ratings move does.
- [x] Remove the "Before you play" note and its `localStorage` key.
- [ ] Owner, before deploying: you and Melanie connect with My QR once. The create rule needs a
  friendship to start a match between two accounts. (Not done at deploy: only Melanie starting a
  match against the owner needs it. Handover, Session 6b.)
- [x] ⚠ The order matters. A phone still on 2.10.x is refused its unfiltered matches list once
  the rules land, and shows no matches until reopened. Ship the app and the rules in one push,
  and tell Melanie to reopen.
- [x] SPEC §7, §7.1, §8.2, §9; `KIT.md` privacy table ("An app's records: the players in them
  and the admin"); the CLAUDE.md Firebase section, where it says the household reads everything.

### Done when

In `?mock`, with tabs for the owner, `&as=mel&role=member` and `&as=ann`:
- Melanie sees her matches with the owner, including the backfilled pre-2.8.0 ones on a seed of
  the owner's export, and not Ann's matches with the owner;
- the owner sees all of them;
- Rebuild on that seed gives the same numbers before and after;
- the Session 6 outsider test still passes.

Then on the two real phones.

✓ in `?mock`, and the rules on the emulator and in the Action (Handover, Session 6b). Real
phones pending.


---

## Session 7 — The look, and friends in the games

### Step 1 — The shared look and the test harness (no app changes)

- [x] **Review, then install** `design_handoff/shared/theme.css` (v3), `ui.js` and `DESIGN.md`
  into `shared/`. v3 keeps every v2 class the apps use; `.arm`, `.user`, `.you` and `.js` go,
  so grep the apps for those four first and keep any that are used until its app is visited.
  In `ui.js`, before it lands: move the Sign in button's inline style into the theme; `sheet`
  closes on Escape and returns focus to what opened it.
- [x] `shared/fonts/` and every `sw.js` shell list: `ui.js` is cached like `theme.css`. Bump
  every app's patch version, since their cached `theme.css` changes.
- [x] `CLAUDE.md` rule 7 points at `shared/DESIGN.md` and says 60px; the layout block lists
  `ui.js`, `DESIGN.md`, `KIT-HISTORY.md`. `.claude/skills/sidequest/SKILL.md` §4 as
  `CHANGES.md` says. `_template/index.html`: the `.me` header and the `ui` import.
  `rack-it/design/DESIGN.md` gets one line at the top: history, see `shared/DESIGN.md`.
- [x] **`shared/proofs/`** (not `test/`: a bare `node --test` runs every file under a folder of
  that name): commit the multi-tab `?mock` runner (owner, `&as=<name>`,
  `&role=member`, a seed) and the rules guard-mutation script that Sessions 6 and 6b rewrote
  from scratch. Found the way `smoke.mjs` finds Playwright; neither runs under a bare
  `node --test`.
- [x] `smoke.mjs` gains a **signed-out pass**: `?mock&signedout` starts with no user, and each
  app must show Sign in with no error (the 2.10.0 bug).

**Done when:** every app loads on v3 with nothing changed in its `index.html` but the version,
smoke is green as owner, stranger and signed out, and the owner has looked at each app on the
phone. Stop and fix before step 2 if any app looks broken.

### Step 2 — The launcher

- [x] `index.html` becomes the tile grid (frame 2a): icon, name, one line, each tile in its
  app's accent-soft. The install text goes; each app's account sheet has Install.

### Step 3 — Rack It on v3 (minor bump)

- [x] `connect.js` and `people.js` drop their own `tap`, `armed`, `hold` and `overlay` for
  `ui.tap`, `ui.hold` and `ui.sheet`. Every two-tap "Sure?" becomes a hold.
- [x] `ui.account` in the header, as overridden above: Profile, My QR, Friends, Export, Import,
  Install, Sign out. The More tab keeps the rest.
- [x] `CHANGES.md` § rack-it: drop the duplicated parts, `--a/--b` alias the accents, the
  Zargo figure 30px, the live row. **The live screen changes greys only.**
- [x] SPEC where it names a moved control.

**Done when:** the Session 6 and 6b `?mock` proofs pass from `shared/proofs/`, and a scored
11-Point-Nine match on 2.11.0 and on this build give the same documents.

### Step 4 — The open rule, and Zombie Dice (rules + minor bump, one push)

- [x] **Rules, cases first.** One block for every app named in an `open` list; Rack It keeps
  its own block. A record in an open app carries `players` (ids, at most 8), `names`, `uids`
  and `by`:
  - read: `uid in uids`, or the owner. Lists carry the `uids` filter, as in Rack It;
  - create: `by` is you, you're in `uids`, and you're connected to every other account in
    `uids` (unrolled `exists()`, at most 7);
  - update: you're in `uids`; never `uids`, `by` or `players` (step 8.2 opens seats);
  - delete: `by`, or the owner.

  The generic `/sidequests/{appId}/**` household rule skips every app in the list.
  **Must refuse:** a stranger reading, listing or changing a record they aren't in; creating
  one that names an account they aren't connected to; a member who isn't the owner listing
  bare. The mock gets the same tier.
- [x] `people.start({ household: false })` for everyone but the owner, as Rack It does.
- [x] **Zombie Dice**: `people.pick` in setup (frame 8a's chips: friends, Show QR, Add a
  guest), records store `players`, `names`, `uids`, `by`; My QR and Friends in the account
  sheet; the look as `CHANGES.md` § zombie-dice (frame 5a). The dice and their motion don't
  change.
- [x] **Backfill, once, on the owner's phone**, as Rack It 2.11.0 did (History, 6b note 6):
  every old game gets `names`, `by`, and `uids` for the players who have an account.
- [x] SPEC: who uses it, people, data.

**Done when:** in `?mock`, the owner sees every game, `&as=mel&role=member` sees only hers,
`&as=ann` starts a game with a friend and a guest and sees only that, and the old games on a
seed of the owner's export read the same before and after.

### Step 5 — Around the Clock (minor bump, rules in the same push)

- [x] Add it to the `open` list, with its cases. Players, backfill, account sheet and SPEC as
  step 4. The look as `CHANGES.md` § around-the-clock (frame 4a): Undo left of Miss, Abandon
  behind a hold.

**Done when:** as step 4, for Around the Clock.

---

## Session 8 — One match, many phones (Rack It)

Read `design_handoff/shared/CONNECT.md` §1 to §4 and frames 8a to 8d, with the overrides
above. Each step is rules and app in one push.

### Step 1 — Claiming a guest

- [x] On a guest: **That was them** → pick a friend. It rewrites that guest's records where
  you are `by`: the player id becomes the friend's uid and `uids` gains it. The guest document
  gets `claimedBy`, so `people.resolve` leads there. Guests play friendlies only, so no rating
  is replayed: if the friend has no rating document, the guest's starter becomes theirs.
- [x] **One rule shape, `seatSwap()`**, used here and in step 2: exactly one player id that
  starts `g_` becomes an account's uid, `uids` gains exactly that uid, and nothing else
  changes (`names` stays: History, Session 6 note 5). Here the writer is `by` and is connected
  to the uid. In Rack It it checks `playerA`/`playerB`; in the open rule, `players[0..7]`
  unrolled. Cases first.
- [x] It reaches every app already on the open rule (Zombie Dice, Around the Clock).

### Step 2 — Seats and the Game QR

- [x] `connect.showQR({ app, game })`: the same screen as My QR with the headline "Join
  Kenny's match" and **Copy link**. Link `…/rack-it/?g=<matchId>&i=<code>`; `i` is your live
  code, so the scan makes the friendship first, as today. `handleInvite` reads `?g=`.
- [x] **A player already in `uids`** (a friend picked at setup) needs no write: the link opens
  the match. Their Home shows a `.resume` card, "Kenny's match · you're in", from the live
  matches query they already run. The card is the notification.
- [x] **A guest's seat.** Rule: a live match is readable (`get`, never `list`) by an account
  connected to `by`. The join card lists the open guest seats, "Which one are you?", and the
  choice is a `seatSwap()` written by the joiner, who must be connected to `by`. The starter's
  phone then stamps `claimedBy` on its guest and offers **That was them** for earlier games.
  A seat taken mid-match leaves it a friendly: `rated` only ever turns off.
- [x] Setup's "Who's playing" as frame 8a: chips of recent players and friends, **Show QR**,
  **Add a guest**. Whoever scans appears as a chip, chosen. The `⋯` sheet in play gains
  "Invite to this game".
- [x] **Must refuse:** claiming a seat held by an account; claiming in a match whose starter
  you aren't connected to; claiming two seats; reading a finished match that way.

### Step 3 — Two phones score one match

- [x] ⚠ **Probe first**, on the emulator and in `?mock`: a `rev` field that every score write
  must raise by exactly one (rule: `now.rev == was.get('rev', 0) + 1` on a live match's score
  fields). A phone that was offline, or lost a race, gets its write refused, re-reads, and
  re-applies its tap if it still makes sense; otherwise it says what it missed ("3 changes
  while you were away"). Why not plain last-write-wins: Rack It saves match state, so a stale
  phone's late write would rewind the game. If the probe shows a queued offline write can't be
  refused cleanly, stop and write it up for the owner.
- [x] Score writes become patches of what changed, carrying `by` and `at`; the log records
  `by` for every change. A phone scoring alone and offline still queues and lands in order.
- [x] **The echo strip** (`.echo`): another phone changed the match in the last five seconds →
  "Melanie · 7 to Gareth · Undo". Undo undoes their change, as a normal write.
- [x] **Light presence** (`.presence`): `phones.<uid>.at`, patched on open, on hide and with a
  score. Avatars under the panels; the sheet says "last seen 3 min ago". A presence write
  touches only your own `phones` entry and not `rev`.
- [x] Words as CONNECT §6. Never "sync", "session", "lock", "host" or "client" on screen.

**Done when:** two tabs score one 11-Point-Nine match alternately and the result equals the
same taps on one phone; a tab held offline for five changes comes back without rewinding
anything; a solo match is unchanged against the build before.

### Step 4 — A scorer, and both sign

- [x] A match may carry `scorer: <uid>`, someone who isn't playing. `uids` stays the players
  only, because the ratings rule trusts it. **The scorer is whoever starts the match**: a new
  create branch where `by` and `scorer` are you, you're not in `uids`, and you're connected to
  each player. The scorer reads and scores like a player, ends it (`endedBy` is the scorer),
  and may Withdraw. The scorer never confirms. Their Matches lists what they scored (a second
  query, `scorer == uid`).
- [x] The scorer's banner: "Scoring for Kenny and Rolf" (`.livestrip`). The players' phones
  get the Home card and the full screen, and may tap too.
- [x] **Both sign.** The rule becomes "every player who didn't end it has confirmed". A
  player's Confirm on a scorer-ended match adds them to `confirms` (pending stays pending,
  only that key moves, only your own uid). The last Confirm is today's batch: both ratings and
  the match to `done`. The rule for `done` and rated: every uid in `uids` other than `endedBy`
  and the writer is already in `confirms`. Either player's **Not right** makes it a friendly
  at once. The scorer sees "Waiting for Kenny and Rolf", then "Waiting for Rolf".
- [x] **Must refuse:** the scorer confirming, or writing a rating; a player confirming twice
  to stand in for the other; `confirms` naming anyone but the writer; a scorer who is also in
  `uids`; every route in History Session 6's list, re-run.
- [x] SPEC §5, §6.1, §7, §9; `KIT.md` (Shared games); install `CONNECT.md` into `shared/`,
  rewritten to what was built.

**Done when:** in `?mock`, Mel scores a rated match for the owner and Ann; ratings don't move
after one Confirm and move after the second, in one write; Rebuild then proposes no change.
Then on three real phones.

✓ in `?mock`, and the rules on the emulator and in the Action (Handover, Session 8). Three real
phones pending.

---

## Handover

### Architecture review, 2026-10-01 (Fable)

Replaced the old Session 2 (design). What changed and why:

- **Friendships are one document a pair**, and the live code moved out of the profile. The
  first draft's rules let anyone with your uid read your code and friend you, and let a
  removed friend re-add themselves.
- **Ratings stay on the phone, Blaze stays off.** Matches are the record and ratings are
  rebuilt from them. Only a confirmed rated match moves one, and the rule ties that write
  to the confirmation.
- **Session 0 is new.** `?mock` modelled no permissions, so outsider bugs would only have
  shown in production.
- **Session 1 was split in two**, and the ratings migration (Session 3) was pulled out of
  Players so it ships alone.
- **Nothing folds.** The household list stays for the household; there's no migration of
  people into friends or guests.

Ruled by the owner, 2026-10-02:

1. After **Delete my account**, the matches that person played keep their name and uid.
   **No "forget this player" action**: matches are the record.
2. A person's win record **counts every finished match**, friendlies, Not right and
   Withdrawn included: it's what happened at the table; the rating is what's rated.

### Session 0, 2026-10-01 (Opus)

Shipped: `?mock&as=<name>` and the two tiers in `cloud-memory.js`, `shared/smoke.mjs`, and
`shared/rules-check.mjs` running in `deploy-rules` before the deploy. `node --test` passes
(25).

Proved:

- `rack-it/?mock&as=stranger` shows "this account hasn't been invited yet"; it survives a
  reload; a second tab at `?mock` is still the owner. `&as=ben&role=member` is a member;
  Ann signing out leaves the owner signed in.
- Rules check: 14 cases. Run 36883214524 ran them (14 pass) at 15:19:17, then deployed at
  15:19:24. A deliberately wrong case (run 36883406744) failed the job with 13 pass, 1 fail,
  and **Deploy rules** was skipped. Reverted; run 36883562301 is green.

Not green: **the smoke test fails four apps as a stranger.** Around the Clock, Bloc 11,
Photo Coach and Zombie Dice log "Uncaught Error in snapshot listener: permission-denied".
They call `cloud.watch`/`watchList`, and `cloud.js` passes Firestore no error callback, so
the SDK logs it with `console.error`. An outsider opening those apps in production gets the
same. Rack It and Fair Nine pass. Not fixed, as briefed. The likely fix is one change in
`cloud.js` (an `onError` on `watch`/`watchList` that warns by default), plus a "not
invited" screen in each app; the owner decides when. Until then `/deployquest` stops on a
red smoke unless the owner says the failure is known.

What the plan got wrong, or didn't say:

1. **`cloud.role()` doesn't return null for an outsider; it throws.** The rules let only
   the household read `/members`, so the read of your own entry is refused. Session 1 says
   "when `cloud.role()` is null": make `cloud.js` return null on `permission-denied` first.
   The mock now throws too, as production does. Rack It already catches it.
2. **Rack It's "hasn't been invited" screen has no Sign out.** A stranger is stuck there.
   Session 1's outsider screen replaces it.
3. The emulator needs **Java 21**, so the Action gained `setup-java` (Temurin 21) and
   `setup-node` (22) steps before the check.
4. `.claude/skills/sidequest/make-icons.mjs` looks for `chrome-linux/chrome`; Playwright's
   current Chromium is at `chrome-linux64/chrome`. The smoke script looks for both;
   make-icons isn't changed.
5. This desktop has Chromium but no Playwright package and no Java. The smoke script takes
   `PLAYWRIGHT=<path to playwright-core/index.mjs>` for a copy installed elsewhere.
6. Running the check locally leaves `node_modules/` and `firestore-debug.log`; neither is
   in `.gitignore`. Worth adding.
7. In the mock, `&role=` given with `&as=` writes that user onto `/members` in the shared
   store, so it sticks until `?mock=reset`.

### Session 1, 2026-10-01 (Opus)

Shipped (Rack It 2.5.0, live): the account rules, `cloud.account` and its mock,
`shared/connect.js` with `shared/vendor/qrcode.js`, and in Rack It **My QR** and **Friends**
under More and an outsider screen. First, two fixes in `cloud.js` and the mock: `role()` is
null for an outsider, and `watch`/`watchList` take an `onError` and warn without one.

Proved:

- Smoke test green for all six apps, owner and stranger (it was red for four). `node --test`
  passes (25).
- Rules: 22 new cases, written first and red until the rules went in. Each guard was removed in
  turn on a local emulator and its own case went red. Run 36885880782 ran 36 tests (36 pass)
  at 15:39:36, then released the rules at 15:39:43.
- Two-tab scan in `?mock` at 390×844 and 360×640, no console errors: both Friends lists
  update, My QR closes with "Connected with Waiter", a signed-out scanner gets the sign-in card
  and is connected after it, an expired code is refused, reopening My QR mints a fresh code
  and deletes the old one, Remove empties both lists.
- `rack-it/?mock&as=stranger` shows the outsider screen; Sign out returns to sign-in.

Real phones, 2026-10-02 (owner): the basics work, and a second Google account of the
owner's, not on `/members`, connected. One fault: on Play the tab bar sat below the screen, so
More was unreachable. Reproduced in Chromium by making the page taller than the screen (the tab
bar at 995–1055 on an 844px screen); fixed in 2.5.1 by pinning the page with `position: fixed`
instead of `100dvh`. ⚠ The cause on the phone is a guess (a stale `dvh` after My QR's
fullscreen); the owner confirmed More is reachable on 2.5.1. Still to report: which runs were the installed app
and which a plain browser, whether redirect sign-in looped, and yesterday's code being refused.
To rerun the scan, both sides use Friends → tap the row → Remove (two taps); a code still in its
24 hours connects again. Deleting the test account entirely is Session 2.
A scored 11-Point-Nine match wasn't replayed by hand; no scoring code changed and the Zargo
tests pass.

What the plan got wrong, or didn't say:

1. **The friendship read rule refused `accept`.** Checking "already connected" reads a pair
   that may not exist, and `resource.data.uids` on a missing document is refused. Either of the
   two may now read a missing pair (`request.auth.uid in pair.split('_')`; uids never hold
   `_`). Someone outside the pair is still refused either way, so it reveals nothing.
2. **Where the profile is made** wasn't said. `cloud.js` makes it on sign-in, in every app,
   and refreshes the Google photo. One read a sign-in.
3. **A code must be spent when its outcome shows, not when the card is closed.** Otherwise a
   phone closed on "expired" shows it again on every open. The smoke-style test caught it.
4. `qrcode-generator` ships an ES-module build (`dist/qrcode.mjs`), so no `export` line was
   needed; the full MIT text is in the header.
5. Added **Copy link** on My QR (for sending a code by message, and the two-tab test).
6. The mock's `ACCESS` rows can now be checks on the path and data, not only tiers. Its
   refusals for someone else's cards or pair can't be reached through `account` (every call
   targets your own paths), so they guard against a future bug rather than being tested.
7. The four apps that were red as a stranger now load without errors, but show an empty app
   rather than a "not invited" screen. The owner decides whether each gets one.
8. The rules check runs locally with `mise exec java@temurin-21 -- npx firebase-tools
   emulators:exec …` from a scratch folder holding the npm packages, so nothing lands in the repo.

### Session 2, 2026-10-02 (Opus)

Shipped (Rack It 2.6.0, live): the friend card (note, met, tags) and tag filters in
`connect.showFriends`, `connect.showProfile` (name, photo, Use my Google photo, Delete my
account), `account.exportMe`, `importMe` and `deleteMe` in `cloud.js` and the mock, and
**Profile** in Rack It's More and on the outsider screen. Rack It's Export carries `account`.

Proved in `?mock`, at 390×844 and 360×640, no console errors:

- A card's note, place and two tags survive a reload; a tag chip narrows two friends to one
  and clears again. The owner's card for a new friend is stamped with the time and the last
  place typed.
- A 2400×1800 noise photo (JPEG's worst case) shrinks to about 6,200 characters, far under
  60,000. Friends see the new name.
- Export, then a wiped card, then Import: the card is back. Someone else's export is refused
  (`wrong-account`).
- A 300ms press doesn't arm Delete; a full hold and "delete" (any case) does. Afterwards no
  document of that user is left under `/profiles/<uid>`, `/friendships` or `/invites`
  (including a live code), the other side's Friends empties, and the app is back at sign-in.
- Rules: three cases pin down the delete path and the photo limit; no rule changed. Run
  36978336900: 39 pass, then deployed. `node --test` 25 pass; smoke green.

Real phones, 2026-10-02: the owner checked 2.6.0 on the phones and reported "looks good".
Which steps that covered (the photo on the other phone, the real delete) wasn't itemised.

What the plan got wrong, or didn't say:

1. **Only the scanner got a card.** Session 1 makes `friends/<them>` for the one who scanned.
   The owner's card is now stamped when "Connected with …" shows on an open My QR; a friend
   who arrives while it's closed has no card until the first Save, and Met falls back to the
   pair's `since`.
2. **Your friend's card about you outlives your account.** It's theirs, under their profile,
   so `deleteMe` can't touch it. It no longer shows (no pair), but it's there. The plan's
   promise "removes … notes" holds for your own notes only.
3. **Delete leaves the Firebase Auth user.** Signing in again makes a fresh profile under the
   same uid. Deleting the Auth user needs a recent sign-in (`user.delete()`); not done.
4. Import restores the account part only from your own export, gated on `uid`, so a
   household member importing someone else's Rack It file doesn't overwrite their name.
5. The mock's seed skips an export's `account` key; before, it became a collection.
6. These rules cases were green on first run, since the Session 1 rules already allowed it;
   they record the behaviour rather than drive a new rule.

### Session 3, 2026-10-02 (Opus)

Shipped (Rack It 2.7.0, live): in `people.js` a claimed person's id is their uid (`resolve`,
`get`, `active`, `meId` return it; every call accepts it or the document id), and Unclaim is
gone. `cloud.deleteFields` in `cloud.js` and the mock. Rack It keeps ratings in
`ratings/<resolved id>`, watched as a list; the owner's phone moves `state/main.players` there
once, then deletes it. Rules: `ratings/{id}` writable by the household.

Proved:

- Rules: three cases, written first (two red on the old rules). Run 36979614158 ran them (42
  pass) at 07:39:04, then released the rules at 07:39:10.
- On a seed of the owner's export (13 people: 2 claimed, 2 merged, 6 deleted; 8 ratings; 39
  matches), old build against new: Ratings, all five person pages and the Rebuild card are
  identical. All 8 rows land in `ratings/` with the same Zargo, robustness and matches,
  Kenny's and Melanie's under their uids, and `state/main` keeps only `config`.
- The same 11-Point-Nine match scored on both builds gives the same match document (bar ids
  and times) and the same new ratings, and moves exactly two `ratings/` documents.
- Bloc 11, Around the Clock and Zombie Dice on a seed with claimed, unclaimed, merged and a
  deleted claimed person: the same page text and avatar colours, and no record rewritten. A
  grep of each found no id compared without `resolve` (ids in `localStorage` are game ids).
- Claiming: an unclaimed person's rating follows them to their uid. Export carries `ratings`;
  Replace with the 2.6.0 file and Merge of a 2.7.0 export both leave the ratings identical.
- `node --test` 25 pass; smoke green for all six apps.

Real phones, 2026-10-02 (owner): updated to 2.7.0, tested, and applied **Rebuild ratings**, so
the drift in note 1 below is gone (expected Kenny 505, Melanie 332). Which checks that covered
(the numbers before the rebuild, the two `ratings/` documents a match moves) wasn't itemised.

What the plan got wrong, or didn't say:

1. **Rebuild ratings doesn't propose "no change", before or after.** The live data already
   proposes Kenny 507 → 505, Melanie 331 → 332 and one match record. Match `rfmz5…` was
   started on 29 Sept and saved on 1 Oct, 26 seconds after another Kenny–Melanie match; saving
   rated it from the start-time ratings, but `replay` puts it after the other one. The
   migration proposes exactly the same change it did before. Not applied; the owner decides.
   Session 5's `ratedAt || endedAt` order has the same gap for any match left open across
   another.
2. **"When ratings is empty" was too narrow.** A member on 2.7.0 who saves a match before the
   owner opens would make `ratings/` non-empty and skip the migration. It runs while
   `state/main.players` exists instead, and never overwrites a field already in `ratings/`.
   Until it runs, every phone reads the old map through `resolve`.
3. **It must wait for the people list from the server** (`people.ready`), or `resolve` would
   key everyone by their old person id.
4. **A tab still running 2.6.0** saves into `state/main.players` and moves no `ratings/`
   document; Rebuild fixes it, and the next migration pass clears the field. Phones were told
   to reopen.
5. **Merge now hands a claimed spare's uid to an unclaimed survivor**, so records under the
   uid keep their person without a rekey.
6. A rekey (a claim or a merge) copies the rating to the new id and leaves the old document,
   unread, as `state/main` did.
7. A person with no colour is still hashed from the document id, so claiming doesn't change it.
8. Owner data: Amelie's Gmail is `@gkail.com`, so she can't claim herself until it's fixed.

### Session 4, 2026-10-02 (Opus)

Shipped (Rack It 2.8.0, live): Players in `people.js`, with three sources (household, friends and
guests), `get(id).kind`, `players()`, `pick()`, `addPlayer()`, `names()` and `uidsOf()`.
`cloud.account.watchGuests`/`addGuest` in `cloud.js` and the mock. `connect.showQR` takes
`onFriend` and `onClose`. Adding a person no longer asks for a Gmail or calls `addMember`. In Rack
It, setup's columns become two slots filled from the picker; a new match stores `names`, `uids`
and `by`; Add player is Scan or Guest, then the starter; lists and summaries fall back to
`names`. SPEC, `KIT.md` and CLAUDE.md rule 3 are updated.

Proved:

- Rules: no rule changed. Four cases record that guests and the new match fields fit the
  rules as they stand, and that outsiders stay shut out of matches until Session 6. Each
  refusal goes red when flipped. Run 36984030285 ran 46 tests (46 pass) at 08:27:10, then
  released the rules at 08:27:16.
- Two tabs in `?mock`, at 390×844 and 360×640, with no console errors. Lilac slot → Scan a
  new player; `?mock&as=ann` opens the link and Ann fills the slot. That match saved
  `names {Kenny, Ann}`, `uids [mock-uid, mock-ann]` and `by`. Against a typed guest "Dan":
  `uids [mock-uid]`. `/members` and Invites are unchanged. Ann lands on the outsider screen.
- The same 11-Point-Nine match scored on 2.7.0 and 2.8.0 gives an identical result card, match
  document and ratings, apart from the three new fields.
- Bloc 11, Around the Clock and Zombie Dice, old build against new, on a seed with claimed,
  unclaimed, merged and deleted people: identical page text (23–36k characters each) and
  avatar colours.
- The last opponent, stored under a merged id, is offered first. Picking the other side's
  player swaps and the break stays with Kenny. A guest added from Ratings gets the 9–5
  estimate (420) in `starters/` and `ratings/`. Bloc 11's add sheet is name and colour only,
  and adds nobody to `/members`.
- `make verify`: 25 tests pass, and the smoke test is green for all six apps.

Not done: the real-phone check (a second Google account scanning from setup's lilac slot).

What the plan got wrong, or didn't say:

1. **No rule was needed.** Guests already sit under the Session 1 `guests` rule, and the
   household writes any match field. The cases record that behaviour rather than drive a rule.
2. **`active()` stays the household only; `players()` is new.** Merging friends and guests
   into `active()` would have put them in Bloc 11's and the others' pickers before those apps
   store `names` and `uids` (Session 8).
3. **`people.js` loads `connect.js` only when Scan is tapped.** A static import would make
   every app's offline start depend on a file its `sw.js` may not have cached.
4. **Scan only picks a new friend.** Someone already connected who scans again makes no new
   pair, so the QR waits; pick them from the list. Worth a line on the QR screen if it confuses.
5. **Guests are private to their maker**, as KIT.md says. Melanie's picker and Ratings don't
   show the owner's guests or friends; her Matches read their `names`, and she can resume or
   watch those matches (`P()` falls back to the match's names).
6. **A friend picked straight in setup gets no starter document.** They play from 500, and
   Rebuild takes their first match's `zargoBefore`. Add player writes one.
7. **`people.start` reads `cloud.role()`**: one extra read per app start. In return, an outsider
   no longer triggers a refused listener on the household list.
8. Editing a household person keeps an optional Gmail, so claiming by email still works.
   Rack It's "no Gmail" labels went with the requirement.
9. A friend's name and photo are read once per session (`account.profile` caches them), so a
   rename shows after a reload.
10. The owner sets a friend's or guest's starter through Edit on their page; nobody else sees
    Edit there.

### Session 5, 2026-10-02 (Opus)

Shipped (Rack It 2.9.0, live): a **Rated** tick in setup, off by default, offered only when both
players have an account. A friendly saves as `done` and moves nothing. A rated match saves as
`pending` with `endedBy`; the other player's phone shows an amber strip ("Kenny 6–5 You · rated",
**Confirm**, **Not right**) and the scorer's shows "Waiting for Melanie to confirm" with **Withdraw**.
Confirm writes both `ratings/` documents (each with `match`) and the match (`done`, `zargoBefore`,
`zargoAfter`, `ratedAt`, `confirmedBy`) in one `cloud.batch`, which is new in `cloud.js` and the
mock. `zargo.js` gains `isRated` and `ratedOrder`; `replay` takes only rated, finished matches,
ordered by `ratedAt || endedAt`. SPEC §3, §3.2, §5, §6.1 (new), §7, §9, §13 and `ZARGO.md` updated.

Proved:

- Rules: no rule changed. Three cases record the household confirm path: pending, then a confirm
  batch holding two ratings; Not right and Withdraw; and a member turning a saved friendly into a
  rated match refused, with nothing from that batch landing. That refusal goes red when the update
  rule is loosened. Run 36986470207 ran 49 tests (49 pass) at 08:52:39, then released the rules at
  08:52:44.
- Two tabs in `?mock` (owner, and `&as=mel&role=member`), at 390×844 and 360×640, with no console
  errors bar the scratch server's favicon 404:
  - A rated match: `ratings/` untouched while pending. Mel's Confirm reached the owner's tab as
    **one** write, changing exactly `ratings/mock-uid`, `ratings/mock-mel` and the match.
  - A friendly: `done`, `rated: false`, `zargoAfter` null, and `ratings/` byte-identical.
  - Not right and Withdraw: each `done`, `rated: false`, with `declinedBy` or `withdrawnBy`, and
    ratings untouched. Withdraw clears Mel's strip.
  - Rebuild: no change for anyone and 0 match records. After it had written the starters once, a
    second confirmed match left it at "Nothing to change".
- The same 11-Point-Nine match on 2.8.0 and on 2.9.0, rated and confirmed: the same match document
  apart from `rated`, `endedBy`, `ratedAt` and `confirmedBy`, and the same ratings to full precision.
- The owner's 2026-10-02 export as a seed, 2.8.0 against 2.9.0: the same Ratings page, the same
  Rebuild proposal (Kenny 507 → 505, Melanie 331 → 332: the Session 3 drift, already fixed live),
  the same 8 ratings after Apply, then "Nothing to change" on both. Only Rebuild's sentence differs.
- `node --test` 31 pass: the 25 existing tests untouched, plus 6 for replay. Smoke green for all six
  apps (`make verify`, with `PLAYWRIGHT=` pointed at a copy elsewhere).

Not done: the real-phone check (the owner rates a match and Melanie confirms it on her phone).

For the owner to rule on: **does a person's win record count friendlies?** Today it counts every
finished match (friendlies, declined and withdrawn included), as before; pending ones aren't
counted. In the test, Mel's 11-Point-Nine record read "won 0, lost 4" that way, against "won 0,
lost 1" for rated matches only. One line in `renderPerson` either way.

What the plan got wrong, or didn't say:

1. **No rule was needed for the household.** A member already writes any match that isn't `done`
   and any rating. Session 6's rules are what stop a player confirming their own result.
2. **`ratedAt || endedAt` leaves the old gap where it was.** No stored match has `ratedAt`, so every
   one replays exactly as before. A match from before 2.9.0 left open across another still replays
   after it (Session 3, note 1; a test pins it down). A confirmed match can't drift: it's rated
   from the ratings at confirmation and replayed at `ratedAt`.
3. **"Both players are accounts" means both have a uid.** A claimed household person's `kind` is
   `"household"`, not `"account"`, so the check is the uid, not `people.get(id).kind`.
4. **Who confirms when a third member scored?** Not said. Either player with an account who didn't
   end it may confirm; the scorer sees "Waiting for Kenny or Melanie".
5. **A live match at deploy has no `rated` field.** Resumed on 2.9.0, it saves as rated (pending)
   when both have accounts, else as a friendly. A phone still on 2.8.0 saves the old way and moves
   ratings at once, with no field; replay counts it as rated, so Rebuild agrees.
6. **Rebuild's derived starters now follow the ratings a match was rated on**: `ratedAt`, else
   `startedAt`, as before 2.9.0. Only rated matches feed them.
7. **Matches played now counts rated matches only**, so a guest who plays only friendlies stays
   "not played yet" on Ratings. That's the plan's rule, but it shows on screen.
8. The result card of a rated match previews the movement from the ratings as they stand, since
   that's what Confirm will use, rather than the ratings the match started on.
9. Rebuild still offers **Apply** after a first rated match when players have no starter document:
   it writes the derived 500s, as before. The numbers and match records show no change.

### Session 6, 2026-10-02 (Opus)

Shipped (Rack It 2.10.0, live): friend mode replaces the outsider screen. An account outside the
household gets the four tabs over what the rules let it reach: its own matches (one `uids`
query, no `orderBy`), ratings read one at a time by id, and the config. It can't see Invites,
Import or Rebuild, and the first open says "Kenny's household can see the matches you score
here." `cloud.list`/`watchList` take `where`. The mock models Rack It's outsider rules and the
household's match rule, with `getAfter` in its batch. In `people.js` you're a player when you
aren't household. SPEC §7, §8.2 (new), §9, §11, §13, `KIT.md` and CLAUDE.md's `&as=` line are
updated.

Proved:

- `let` (inside a function), the ternary and `getAfter()` each worked in an emulator probe before
  the rules used them. `get()` reads the state before the batch and `getAfter()` the state after.
- Rules: 27 new cases, written first. On the old rules 11 were red: every "may do" case, and the
  household's friendly-to-rated refusal. On the new rules all 76 pass. Each of the 24 guards was
  removed in turn on a local emulator, and its own case went red. Run 36995144305 ran 76 tests
  (76 pass) at 10:23:47, then released the rules at 10:23:53.
- Four tabs in `?mock` (owner, `&as=ann`, `&as=ben`, `&as=cat`): 58 checks, no page errors,
  console errors or refusal warnings.
  - Ann and Ben connect. Ann scores a rated match and Ben confirms: both ratings move, each
    naming the match. The owner's Matches lists it; Cat's is empty.
  - Cat is refused reading that match, listing bare, listing Ann's, and listing ratings. She can
    get one rating by id.
  - Ben is refused all six routes to confirming his own result: a confirm batch, finishing it,
    `endedBy` to Ann, reopening it, a rating alone, rewriting the score. No rating moved.
  - Not right and Withdraw stand as friendlies.
  - Ann, Ben and a household member can't make a live or saved friendly rated.
  - Ann's guest gets a starter in `ratings/g_…` and no `starters/` document. Rated isn't offered
    against a guest, and that match's `uids` is Ann's alone.
  - Ann's export holds her matches only.
  - Every matches query each outsider's phone ran was `where uids array-contains <uid>` with no
    `orderBy`, and none of them ever listed ratings.
- 2.9.0 against 2.10.0, with the same steps on each, identical apart from ids and times:
  - the Session 5 two-tab proof for two household members (friendly, rated + confirm, Not
    right, Withdraw, then Rebuild "no change" with 0 match records);
  - the scored 11-Point-Nine match: the same documents and ratings to full precision;
  - Rebuild on the owner's 2026-10-02 export: the same proposal (Kenny 507 → 505, Melanie
    331 → 332, the Session 3 drift already applied live), then no change after Apply.
- `make verify`: 31 tests pass, with `zargo.js` and its tests untouched. Smoke is green for all
  six apps.

Not done: the real-phone check, which the owner ruled comes next, before Session 7. On 2.10.0,
your second Google account plays a friendly and a rated match against you; confirm from each
side in turn; check it sees only its own matches. Sessions 4 and 5's phone checks are still
open too.

What the plan got wrong, or didn't say:

1. **The sketch let a player confirm their own result in three ways.** (a) Create the match with
   `endedBy` set to the other player, then move it to pending. (b) Move it live → pending with
   no `endedBy`, since `uid != endedBy` holds when it's missing. (c) Reopen pending → live, then
   re-pend under the other name. Now a new match carries no end or confirm fields; going to
   pending stamps `endedBy` as you; a pending match only goes to done, touching only the
   confirmation's fields; and a match with no `endedBy` can't be confirmed.
2. **The sketch let the confirmer rewrite the score before confirming** (pending was writable
   like live). That's closed by the same "pending only finishes" rule.
3. **`rated` must default to true, not false.** A stored match with no field is rated (Session
   5). With `get('rated', false)` the rules would have read every old match as a friendly.
4. **Some of the sketch's guards in `confirming()` could never fail on their own.** "The writer
   is in the match" and "the writer didn't end it" are already enforced by the match update that
   must sit in the same batch. They were dropped, so every guard left has a case that goes red
   without it. "Still rated after" was kept: without it, a rating can ride in a Withdraw batch.
5. **`names` is frozen too.** The plan froze `uids`, `by` and the players; a renamed side would
   misname the match. Session 7's claim rule will need to allow it explicitly.
6. **An outsider wasn't in their own picker.** `people.players()` had no "you" without the
   household list. Also, `people.js`'s `sync()` would have added an outsider to the household
   list on `poke()`, which the rules refused. Both are fixed.
7. **The household gained one guard:** a member who isn't the owner can no longer turn a friendly
   into a rated match, as the owner asked. The app never did it, and the 2.9.0 comparison is
   identical. The owner still can, as with any saved match.
8. **Confirm in friend mode reads both ratings fresh** (`cloud.load`), since it watches them one
   by one and a stale one would be written back.
9. **A missing match is refused, not null, for an outsider**, because the rule reads
   `resource.data`. Watch stops cleanly on that error. The mock does the same.
10. **The mock's `patch` checked permission with no document**, which read as a delete and
    refused every player. Fixed, and the mock's batch now checks each write against the state
    the whole batch leaves (`getAfter`).
11. A friend added from Ratings in friend mode gets no starter form: only a guest's starter is
    the outsider's to write. The friend plays from their own rating, or from 500.
12. "Kenny's household" is written into the page; an outsider can't read who the owner is.

After the deploy, the same day:

- **Real phones, 2026-10-02 (owner):** a full invite and a game played through on 2.10.0; "looks
  good".
- **2.10.1 fixes a 2.10.0 bug:** a signed-out visitor got a blank screen instead of Sign in.
  `handleUser(null)` runs before the rest of the script, and it read `friendMode` before its
  `let`. The declarations now sit above `handleUser`. The smoke test missed it because it never
  opens an app signed out (Parked). The invite card scanned while signed out still showed,
  since it runs first.
- **2.10.1 also names the app on the invite card:** "Sign in to Rack It, and you'll be in each
  other's Friends." `connect.handleInvite` takes `appName`.
- **The owner ruled on the family tier.** Rack It will have one admin and players, and the
  "Before you play" note goes with it. That's Session 6b, planned above.

### Session 6b, 2026-10-02 (Opus)

Shipped (Rack It 2.11.0, live): one admin. The owner runs the household path and sees every
match; everyone else, a household member included, runs friend mode. The rules drop `isFamily()`
from Rack It: the generic read skips `rack-it`, and the owner alone lists matches, ratings and
starters and writes `state/main`, starters and ratings outside a confirmation. `people.start`
takes `household: false`, which Rack It passes for everyone but the owner. The owner's phone
backfills old matches once. The "Before you play" note and its flags are gone. The mock has an
`owner` tier for Rack It. SPEC §6.1, §7, §7.1, §8.2, §9, §13, `KIT.md` and CLAUDE.md are updated.

Proved:

- Rules: 12 new cases, written first. On the old rules 4 of the 5 "Must refuse" cases for a
  member were red; the fifth (changing a saved match) was already refused there. Six old cases
  that had the member writing Rack It as household moved to the owner, or to a match she's in.
  All 88 pass. Each of the 12 guards was loosened in turn on a local emulator (back to
  `isFamily()`, the household update branch restored, or the owner's grant dropped), and its own
  case went red. Run 37002090013 ran 88 tests (88 pass) at 11:39:39, then released the rules at
  11:39:46.
- The owner's 2026-10-02 export as a seed, with the two claimed uids mapped to mock users,
  2.10.1 against 2.11.0:
  - The backfill touched all 39 matches. They gained `uids`, `names`, `playerA` and `playerB`,
    and nothing else changed.
  - The 38 Kenny–Melanie matches got both uids and their players' uids, each side kept. Kenny v
    Squirge got Kenny's uid, and Squirge kept his person id.
  - Melanie, as a member, lists her 17 finished matches with Kenny, not the Squirge one. Her
    own page shows the same record and matches as on 2.10.1 (11-Point-Nine won 8, lost 6).
  - Ratings and Rebuild are identical: the same proposal (Kenny 507 → 505, Melanie 331 → 332,
    the Session 3 drift already applied live), the same `ratings/` after Apply to full
    precision, then "Nothing to change".
- Three tabs in `?mock` (owner, `&as=mel&role=member`, `&as=ann`), 51 checks with the seed run
  and the other apps, no page errors, console errors or refusal warnings:
  - No note for either player.
  - Melanie's picker holds herself and her friends, and Rack It never adds her to the
    household list. Her More has no Invites, Import or Rebuild; the owner's keeps them.
  - The owner rates a match against her, and she confirms it from her strip.
  - Melanie sees her two matches with the owner and not Ann's. The owner sees all three, and
    Ann sees hers.
  - Melanie is refused 11 routes: listing ratings, starters or bare matches, listing newest
    first, reading Ann's match, writing `state/main`, a starter or a rating, and changing or
    deleting a saved match, hers or Ann's. Every matches query her phone ran carried her uid
    filter.
  - Signed out, Sign in shows.
- Bloc 11, Around the Clock, Zombie Dice and Photo Coach, as `&as=mel&role=member`, 2.10.1
  against 2.11.0: role `member`, their own data readable, the same household list, and
  identical page text.
- The Session 6 outsider proof re-run on 2.11.0: 56 checks pass (its note checks now say the
  note is absent).
- `make verify`: 31 tests pass with `zargo.js` untouched; smoke is green for all six apps.

Not done: the owner and Melanie connecting with My QR, and the real-phone check. Melanie must
close and reopen Rack It: a phone on 2.10.x is refused its unfiltered match list now.

What the plan got wrong, or didn't say:

1. **"Nothing else in the match changes" left Melanie's own page empty of old matches.** They
   named her by her person id, which friend mode can't resolve without the household list. Her
   Matches tab listed them (by `names`), but her page and win record didn't. The owner ruled to
   rewrite `playerA`/`playerB` to the resolved ids too. Rebuild reads ids through `resolve`, so
   it's unchanged.
2. **The friendship isn't a prerequisite for the deploy.** The owner starts matches through
   `isOwner()`, and confirming needs no friendship. Only Melanie starting a match against the
   owner (and the owner showing on her Ratings) waits for it.
3. **Melanie loses more than the note.** In Rack It she no longer has Amelie, Rolf and Isla in
   her picker (they're guests to her now), Invites, Import, or her own Cuescore link. Other apps
   are unchanged.
4. **The owner's reads had to be spelled out.** With the generic read gone from Rack It, the
   owner needs `starters` read and `ratings` list rules of their own; the plan named only writes
   for those.
5. **A role that can't be read now means friend mode**, not the household path. It's what the
   rules allow anyone, so it can't show an error; an offline owner sees only their own matches
   until the next open.
6. **The backfill runs once per owner per phone** (`localStorage` `rack-it.uids-backfill.<uid>`),
   and again after an Import, which can bring old matches back. One listing of every match,
   then batches of up to 400.
7. **The scratch harness doesn't survive a reboot.** `/tmp` was cleared mid-session, taking this
   session's runner and Session 6's test scripts with it; both were rewritten. Worth
   committing the Playwright harness and the mutation script somewhere outside the apps (e.g.
   `shared/test/`) if sessions keep reaching for them. The owner decides.

### Session 7, 2026-10-02 (Opus)

Shipped, all live: the v3 look in `shared/` (`theme.css`, `ui.js`, `DESIGN.md`) with every app
patch-bumped, the launcher, Rack It 2.12.0 on v3 with the account sheet, the open rule with
Zombie Dice 0.3.0 and Around the Clock 0.8.0 on it, and `shared/proofs/` (the Session 6 and 6b
proofs, one for each open app, the rules runner and the guard-mutation script with its list).
Smoke gained a signed-out pass.

Proved:

- Before the theme landed, every element of every app's screens was compared, v2 against v3
  (computed styles, 20 screens): only greys, type sizes and the header changed, bar two clashes,
  fixed (below).
- Rules: 19 new cases, written first and red on the old rules. 107 pass. Each of the 14 new
  guards and 12 of the old ones was loosened in turn on a local emulator
  (`node shared/proofs/mutate.mjs`) and its own case went red. An eight-player game with seven
  friends passes: seven `exists()` are within the limit (design-merge note 4).
  Run 37010075608 checked and deployed the open rule for Zombie Dice.
- Rack It: the Session 6 proof (56) and 6b proof (50, with the owner's seed against 2.11.0) pass
  on 2.12.0; `rack-it-same-match.mjs` scores one 11-Point-Nine match on 2.11.1 and on 2.12.0:
  the same match document, ratings and result card.
- Zombie Dice (27) and Around the Clock (14) on a seed of old-shape games (`proofs/seeds/`):
  Recent and the Leaderboard read the same on the old build and the new; the backfill resolves
  ids and stamps names, uids and by; the owner sees every game, Mel as a member only hers, Ann
  plays with a friend and a guest and sees only that; the refusals hold.
- `make verify` green throughout: 31 tests, smoke as owner, stranger and signed out.

Not done: the owner hasn't looked at each app on the phone yet (Step 1's "Done when"). The
real-phone checks of Sessions 4 to 6b, and the owner and Melanie connecting with My QR, are
still open. A seed of the owner's real Zombie Dice and Around the Clock exports was never
tried: the backfill runs once on the owner's phone the next time each app opens.

What the plan got wrong, or didn't say:

1. **`shared/test/` became `shared/proofs/`.** A bare `node --test` runs every file under a
   folder called `test`, and the plan wanted these kept out of it.
2. **v3 shared two names with apps' own CSS.** Rack It's ball rack was a `.row` (v3's
   `.row>button{flex:1}` spread the balls) and Zombie Dice's scoreboard chips were `.pl`. Both
   apps were then visited, and their lines went. A "v2" block at the end of `theme.css` still
   keeps `.user`, `.rows .you`, `.rows button` and `.arm` for Bloc 11 and Photo Coach; Session 9
   removes it.
3. **`ui.sheet` only listed actions**, and `people.js`'s picker and edit sheet are forms. It gained
   `body(close)`, `cancel: false` and `dismiss: false`. `ui.tap` gained `{ slop }` and `ui.hold`
   `{ tap, holding }` (Rack It's End is Stop watching on a plain tap), so Rack It dropped its own.
   `ui.account` takes `name` and `avatar` (the plan's override). The pack shortened a hold to
   150ms under reduced motion; it stays 600ms, only the fill is instant. `tap` fires on Enter.
4. **`connect.js` keeps its full-screen pages.** The pack draws My QR as a page (frame 8b), not
   a sheet; only its taps, holds and the two-tap Remove moved to `ui`.
5. **Rack It's live screen isn't greys only:** `--a`/`--b` alias the ramp, so teal (#23D3B0 →
   #2FD4B3) and lilac (#B49BFF → #C0A5FF) are a shade lighter. Its 40px tap slop stays, and Undo,
   Next rack and Break stay on `click`. `.prow` and `.hrow.live` stay Rack It's own (the theme has
   no `.prow`); they use the theme's tokens. More keeps one line saying what moved.
6. **The open rule names each app's record collection** (`openApps()`: app → collection). The rest
   of an open app is the owner's alone, so Around the Clock's `state/main` (its old player list
   and the direction) is owner-only and the direction moved to each phone's `localStorage`.
7. **The owner may create any record in an open app**, as in Rack It: you and Melanie aren't
   connected yet, and the household path names her by her uid.
8. **Old games said `by` with an email.** The backfill makes it the uid of the household person
   with that email who has claimed, else the owner's. Around the Clock's one-player games are
   rewritten in today's shape.
9. **Every `?mock` tab shares one `localStorage`,** so "this phone's game" leaks between tabs in a
   proof (the owner's tab reopened Ann's game). Real phones don't share one; the proof clears it.
10. Zombie Dice's game screen is taller than a 360×640 phone, as it was on 0.2.1 (664px against
    669px before for two players; 748 against 771 for eight). The panels go to one line each on a
    short screen or with five or more players.
11. The **Share link** buttons went from Zombie Dice and Around the Clock: anyone can sign in now,
    and a friend joins with My QR or Show QR. Setup's chips are you, friends and guests, then
    **Show QR** and **Add a guest** (`people.scan`, `people.addGuest`). The household list moved to
    the bottom of Home, owner only.
12. The pack's launcher tile "Ask for a new one" leads nowhere, so it was left out.
13. Steps 3 to 5 changed `people.js`, `connect.js` and `ui.js` without bumping Bloc 11 and Photo
    Coach: their service workers fetch network-first, so the new files arrive on the next open.

### Session 8, 2026-10-02 (Opus)

Shipped, all live, one push a step, each with its rules: That was them in Rack It 2.13.0, Zombie
Dice 0.4.0 and Around the Clock 0.9.0 (rules run 37014350018); seats and the Game QR in Rack It
2.14.0 (37016570746); two phones scoring one match, 2.15.0 (37020126726); a scorer and both
sign, 2.16.0 (37024822755). `shared/CONNECT.md` is the design as built. The loyalty app landed on
`main` in parallel twice; both rebases were clean bar one appended-cases conflict in
`rules-check.mjs`, kept both sides.

Proved:

- Rules: 43 new cases, written first and red on the rules before them, then 162 pass (the
  loyalty app's 12 included). The mutation check ran in full after steps 3 and 4: every guard
  has a case that goes red without it (44 new guards). Six of Session 6's "may do" cases now
  carry a link, as the app's writes do.
- The probe (`shared/proofs/rev-probe.mjs`), on the emulator with the real SDK: Ann offline taps
  five times, Ben online taps twice, Ann reconnects. With the plan's counter (`n == was.n + 1`),
  Ann's writes 1–2 were refused and 3–5 **landed**, rewinding Ben's; with the chain (`was` must
  be the stored `key`), all five were refused and Ann's phone came back showing Ben's score.
- `?mock` proofs, all with no page errors, console errors or refusal warnings:
  - `claim-guest.mjs` (18): Ann claims Dan as Cat from his page; the match, Dan's starter, and
    on their next open Zombie Dice and Around the Clock follow; names stay; refusals hold.
  - `rack-it-seats.mjs` (22): the chips, the Game QR from `⋯`, Cat takes Dan's seat, Ann's QR
    says "Cat joined · lilac side", Ben (a stranger who scans) is connected but finds it full,
    That was them offered once Ann saves, the Home card, a finished match unreadable that way.
  - `rack-it-two-phones.mjs` (17): two tabs score one 11-Point-Nine match alternately and it
    saves the same racks and totals as the same taps on one tab; Cat held offline while Ann
    makes five changes comes back to "5 changes while you were away" with nothing rewound; a
    one-tap race puts Cat's tap back; the echo strip's Undo; presence on both phones.
  - `rack-it-scorer.mjs` (25): Mel scores a rated match for the owner and Ann; no rating moves
    after Ann's Confirm; the owner's moves both in one write; Rebuild moves no rating and changes
    no match; Mel can't confirm or stand in, Ann can't confirm twice.
  - Re-run on each step: `rack-it-same-match.mjs` (a solo match saves the same documents as the
    build before, bookkeeping fields aside), the Session 6 outsider proof (56, every route in its
    list), the open-rule proofs for Zombie Dice and Around the Clock.
- `make verify` green throughout: 41 node tests, smoke on seven apps as owner, stranger and
  signed out.

Not done: the three real phones (step 4's "Done when"), and the owner and Melanie connecting with
My QR. ⚠ A phone still on 2.14.0 or older that is mid-match when 2.15.0's rules land has its
writes refused (they carry no link): it must reopen Rack It, then Resume.

What the plan got wrong, or didn't say:

1. **A `rev` counter can't refuse a queued offline write cleanly.** The probe above: once the
   server has moved on, a stale phone's later queued writes match the counter by luck. Each
   write names the link it built on (`rev: { n, key, was }`); the counter stays for counting
   ("5 changes while you were away").
2. **The open rule's records key scores by player id** (Zombie Dice `scores`, `seats`; Around the
   Clock `throws`, `scores`), so a claim there can't leave "nothing else" unchanged. The rules
   police who's in it (one guest seat to the newcomer, positional, `by` and `names` kept) and let
   the score maps move, which any player may already do. Rack It's `rackSwap()` does freeze
   everything else.
3. **A claim made in one app must reach the others.** The guest is account-wide, so every app
   rewrites its own records of a claimed guest on its next open (`healClaims`, one rewrite a
   guest at a time: the claim and the heal raced in the first run).
4. **Only the starter can show a useful Game QR**: the seat rule asks that the joiner be
   connected to `by`, and the QR connects the scanner to whoever shows it. The `⋯` shows only on
   the starter's phone.
5. **The starter's phone stamps `claimedBy` only on the hold**, not when the seat is taken:
   `claimedBy` now rewrites the guest's games everywhere, so the starter confirms it.
6. **Score writes stay one rack record a write**, not field patches. With the chain refusing
   stale writes, the rack is safe as a unit, and it keeps 11-Point-Nine's documents identical.
7. **A friend of the starter can get any of their live matches by id.** Session 6's case
   "reading a match you aren't in" moved from Cat (Ann's friend) to Eve. Ids are random; the Game
   QR is the only way to one.
8. **The owner keeps to the chain on a live match** (a match from before 2.8.0 and a seat
   changing hands aside): the owner is the likeliest scorer, and their stale phone would rewind a
   game as anyone's would.
9. **The owner scoring two others now needs both to confirm**, not either: they're its scorer.
10. **"Rebuild proposes no change"**: a first Rebuild on fresh data still offers to record the
    starters it took from first matches. The proof checks what matters: no rating moves, no
    match changes.
11. **Setup re-picked you** whenever both sides were empty, so you couldn't step out to score.
    It stops once you've touched a side.
12. Rack It's top-level-await trap again (2.10.1): signed out, `handleUser(null)` paints before
    the rest of the script, so the seat-offer state is declared beside `friendMode`.
13. `rack-it-one-admin.mjs`'s two checks of Zombie Dice and Around the Clock as a member fail on
    the tree before this session too: Session 7 opened those apps, so "reads its data" is now
    refused by design. The checks are stale, not fixed here.
14. Playwright isn't installed in this repo; the proofs ran with `PLAYWRIGHT=` pointing at a copy
    elsewhere on the machine (`shared/proofs/README.md`).
15. ⚠ A claimed guest's starter becomes the friend's when they have none, and a guest's starter
    is whatever its maker typed. Low stakes (the friend's first rated match moves it, and
    Rebuild remakes it), but it is a number someone else chose.

For Session 9 step 3: the echo strip, presence, `send()`/`linkFields()` and `followLive()` live
in Rack It's page. Zombie Dice needs them moved to `connect.js` or `ui.js` first; the rules'
`nextLink()` and `myPhone()` are written for Rack It's match block and want an open-rule twin.
