# The kit — finished sessions

Sessions 0 to 6b of `shared/KIT-PLAN.md`, moved here verbatim on 2026-10-02 so the plan stays
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
