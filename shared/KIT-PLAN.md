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
4. For Rack It work, `rack-it/SPEC.md` (§3 Zargo, §8 People, §9 Data), and **Ground rules**
   in `rack-it/V3-PLAN.md`: 11-Point-Nine must behave identically, and `node --test` must
   pass.
5. **Handover**, at the bottom.

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

## The two tiers

| | Account | Household (`/members`) |
| --- | --- | --- |
| Who | anyone signed in | email in `/members` |
| Keyed by | `uid` | email |
| Reaches | `/profiles`, `/invites`, `/friendships`, and app records that carry their uid in `uids` (Session 6) | all of `/sidequests/**`, `/members` |

A household member is also an account.

## The road

| Session | Lands | Visible change |
| --- | --- | --- |
| 0 | Safety net: `?mock&as=`, a smoke test, a rules check | none |
| 1 | Accounts and Connect: My QR, scan, Friends | Anyone can scan and connect in Rack It |
| 2 | Friend card, your profile and photo, export, delete my account | Notes, tags and photos |
| 3 | One id per person; ratings in their own documents | none |
| 4 | Players: pick a friend, scan, or add a guest | Rack It's setup picks from friends |
| 5 | Rated matches and confirming | A **Rated** tick; friendlies stop moving ratings |
| 6 | Outsiders play in Rack It | A pool friend uses Rack It |
| 7 | Claiming a guest | "That was them" |
| 8 | The kit menu in `/sidequest`; other apps adopt Players | Bloc 11 and the rest get friends |

Sessions 1 and 2, and Session 3, don't depend on each other. Don't build ahead. Ideas go in
**Parked**.

**Every session:** `node --test` passes, `node shared/smoke.mjs` passes (from Session 0), one
scored 11-Point-Nine match is unchanged, and it ends with `/deployquest`.

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

- [ ] Add, above the catch-all, with cases in `rules-check.mjs` for each line of "Must
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

- [ ] **Must refuse:** a friendship with no code, an expired code, a deleted code, your own
  code, or a code belonging to a third person; reading a friendship you aren't in; listing
  `/profiles`; reading anyone else's `private`, `friends` or `guests`; a profile with an
  extra key; an invite for another uid or one that lasts over 25 hours.
- [ ] Update the header comment to name both tiers. Cost: one `get()` per connection.

### `shared/cloud.js`: an `account` section

- [ ] Uid-keyed, beside `shared` and the members calls. The header comment lists them.
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

- [ ] Mirror `account`, with its refusals: wrong, expired or own code; reading a pair you
  aren't in; someone else's `private`, `friends`, `guests`. Two tabs test the whole scan:
  - Tab A: `rack-it/?mock`, opening My QR. Copy its link.
  - Tab B: `rack-it/?mock&as=waiter&i=<code>`, which connects, and both Friends lists
    update.

### `shared/connect.js`: the Connect part

A module like `people.js`: its own sheets and styles, built from `theme.css` parts.

- [ ] `connect.handleInvite({ app, onDone })`, called first at startup:
  - It saves `?i=<code>` to `localStorage` before anything else, so the code survives the
    Google redirect, then clears it from the URL.
  - **Signed out**: `lookupInvite`, then a full-screen card: "Connect with Kenny Inggs" and
    **Sign in with Google**.
  - **Signed in**: `accept`, then "You're connected with Kenny Inggs" with their avatar.
  - **Dead code**: "This QR has expired. Ask them to show it again."
- [ ] `connect.showQR({ app })`: name, avatar and a large QR of `…/<app>/?i=<code>`.
  `phone.keepAwake` while it's open, `phone.fullscreen()` on the way in. It closes with
  "Connected with …" when a new pair arrives while it's open.
- [ ] The QR library is vendored: one MIT file (e.g. `qrcode-generator`) at
  `shared/vendor/qrcode.js`, its licence in the file. ⚠ It ships as a classic script; add
  the `export` line or load it as a script. Don't use a CDN: the service worker only caches
  same-origin files.
- [ ] `connect.showFriends()`: avatar and full name, newest first, with a search box. Tap a
  row for **Remove** (confirmed). The card's note, tags and place are Session 2.
- [ ] `connect.avatar(uid, size)`: the profile photo in a neutral ring, or the initial.
  Same look as `people.avatar`.

### Rack It (minor bump, from 2.4.0)

- [ ] Call `connect.handleInvite({ app: "rack-it" })` before `people.start`.
- [ ] **Outsiders**: when `cloud.role()` is null, don't start the Rack It watchers. Show a
  simple screen: their avatar and name, **My QR**, **Friends**, **Install on this phone**,
  **Sign out**, and "Rack It opens up to friends soon." Session 6 replaces it.
- [ ] Members: **My QR** and **Friends** under More, beside Invites.
- [ ] `rack-it/SPEC.md`: a short section on Connect, plus a §13 line.
- [ ] Test the two-tab scan in `?mock`, at 390×844 and 360×640. Then for real, with a Google
  account that isn't on `/members`: once on Android with Rack It installed, once in a plain
  browser. ⚠ Redirect sign-in can fail where the browser blocks third-party storage
  (`github.io` and `firebaseapp.com` are different sites); if the stranger's sign-in loops,
  that's why. Record what happened in Handover.

### Done when

The owner opens My QR in Rack It. A stranger scans it, signs in and lands in Rack It,
connected. Both Friends lists show each other. Yesterday's QR is refused.

---

## Session 2 — The friend card, your profile, leaving

- [ ] **Friend card** in `connect.showFriends()`, all private to you: **Note**; **Met**
  (date and time stamped at connect; a typed place that defaults to the last one used, kept
  in `localStorage`); **Tags** as chips offered from the tags you've used, and tag chips
  that filter the list.
- [ ] `connect.showProfile()`: edit your name. **Take or pick a photo**
  (`<input type=file accept=image/* capture=user>`) shrinks to a 192 px JPEG in a canvas.
  ⚠ Check the base64 stays under the rule's 60,000 characters; lower the quality if not.
  **Use my Google photo** goes back.
- [ ] `account.exportMe()` and `account.importMe(json)`: profile, friends' cards, guests.
  Import restores your cards only; it can't remake a friendship. Rack It's Export carries
  it.
- [ ] **Delete my account**, at the bottom of the profile sheet, a hold then a typed
  confirm: deletes your pairs, cards, guests, live invite, `private/main` and profile, then
  signs out. Each document is deleted one by one (Firestore doesn't cascade). ⚠ Matches you
  played keep your name and uid (Session 6); only the owner can remove those.
- [ ] Rack It: **Profile** under More and on the outsider screen. SPEC and version bump.

### Done when

A note, a tag and a photo survive a reload on another phone. A deleted account leaves no
document under `/profiles/<uid>`, `/friendships` or `/invites`.

---

## Session 3 — One id per person; ratings in their own documents

Household only, and nothing changes on screen. It's the migration the later sessions stand
on, kept apart so that a wrong number has one possible cause. **Before deploying, the owner
exports Rack It.**

### `shared/people.js`

- [ ] `resolve(id)` follows `mergedInto`, then returns the person's `uid` when they've
  claimed. An account's id is its uid from here on.
- [ ] `get(uid)`, `nameOf`, `colourOf`, `avatar`, `isMe` accept a uid and find the claimed
  person. `active()` and `meId()` return uids for claimed people.
- [ ] **Unclaim goes.** A record stored under a uid would be orphaned by it. (A wrong claim
  is fixed by the owner editing the person document in the console; see Parked.)
- [ ] Smoke test with a seed holding claimed, unclaimed and merged people: every app shows
  the same names and tallies as before. Bloc 11, Around the Clock and Zombie Dice already
  read ids through `resolve`, so they need no edits. ⚠ Grep each for an id compared without
  `resolve` before trusting that.

### Rack It

- [ ] Ratings move from `state/main.players` to `ratings/<id>`
  `{ zargo, robustness, sessions }`, keyed by the resolved id. Watched as a list (household).
- [ ] Migration, on the owner's phone, once: when `ratings` is empty and
  `state/main.players` isn't, write each player to `ratings/<resolve(id)>`, then delete
  `state/main.players`. `starters/<id>` are read through `resolve` and left where they are.
- [ ] Saving a match writes the two rating documents. Rebuild writes `ratings/*`.
- [ ] Rules: `ratings/{id}` writable by the household (the generic read already covers it).
  A case in `rules-check.mjs`.
- [ ] Export writes `ratings`; Import reads both the old `state.players` and `ratings`.
- [ ] `node --test`. Then, against a seed of the owner's export if it's on hand (never
  commit it: it holds emails), Ratings shows the same numbers before and after, and
  **Rebuild ratings** proposes no change.
- [ ] SPEC §8, §9 and §13.

### Done when

Every rating matches the export taken before the deploy, and a new match moves two
`ratings/` documents.

---

## Session 4 — Players

`people.js` becomes Players: the same calls for the apps, new sources behind them.

### `shared/people.js`

- [ ] Sources, merged and de-duplicated by resolved id:
  - **household**: `/sidequests/_shared/people`, watched only when `cloud.role()` isn't
    null;
  - **friends**: `account.watchFriends`, named and pictured by `account.profile(uid)`;
  - **guests**: `/profiles/<me>/guests/<g_id>` `{ name, createdAt }`.
- [ ] `get(id)` returns `{ id, name, photo, colour, kind }`, `kind` being `"account"`,
  `"guest"` or `"household"`. A household person's own name and colour win over their
  profile's. Anyone with no colour gets the hashed one `colourOf` already gives.
- [ ] `people.pick({ title, exclude, recent })` → an id, or null. A sheet: recent first
  (the app passes the ids), then everyone by name, a search box once there are more than
  eight, and two buttons at the bottom:
  - **Scan a new player** opens `connect.showQR`; the pair that arrives is picked.
  - **Add a guest** asks for a name and makes a guest.
- [ ] `people.names(ids)` and `people.uidsOf(ids)`: what an app stores beside player ids.
- [ ] `people.edit(null)` no longer asks for a Gmail and no longer calls `cloud.addMember`.
  It adds a household person (household members only). Invites is the only way onto
  `/members`.
- [ ] `cloud-memory.js` mirrors guests. `KIT.md` and `CLAUDE.md` rule 3 describe Players.

### Rack It

- [ ] Setup's two columns become two slots filled from `people.pick`. You're on teal by
  default, the last opponent is offered first, and the swap and break behaviour stay.
- [ ] A new match stores `playerA`, `playerB` (resolved ids), `names: { a, b }`, `uids`
  (the accounts in it, zero to two), and `by` (the scorer's uid). Summaries and lists fall
  back to `names` when `people.get` finds nobody.
- [ ] **Add player** on Ratings becomes the same Scan or Guest choice, with the starter
  estimate after it. Rack It's own Gmail field and its `addMember` call go.
- [ ] Ratings lists the household's people, your friends who have a rating, and your guests.
- [ ] SPEC §5, §7, §8, §9, §13.

### Done when

The owner starts a match against a friend made by QR and against a typed guest, and both
save, with `names` and `uids` on the documents. Nobody new appears on Invites.

---

## Session 5 — Rated matches and confirming

Household only; Session 6 puts rules behind it. Ratings stop moving on every match.

- [ ] Setup gains a **Rated** tick, off by default. It's offered only when both players are
  accounts. The match stores `rated: true | false`. **A stored match with no `rated` field
  is rated**: every match before this session moved ratings.
- [ ] **Friendly:** Save sets `status: "done"` and writes no rating. The handicap still
  comes from the ratings. The result card and summary say "Friendly · ratings unchanged".
- [ ] **Rated:** Save sets `status: "pending"` and `endedBy: <uid>`, and moves nothing. The
  opponent's phone shows a strip above the tabs: "Kenny 5–3 You · rated" with **Confirm**
  and **Not right**. The scorer sees "Waiting for Melanie to confirm" and **Withdraw**.
  - **Confirm** works the result out from the two ratings as they stand now and writes, in
    one batch: both `ratings/` documents (each with `match: <id>`), and the match
    `{ status: "done", zargoBefore, zargoAfter, ratedAt, confirmedBy }`.
  - **Not right** or **Withdraw** writes `{ status: "done", rated: false }` with
    `declinedBy` or `withdrawnBy`. It stands as a friendly.
- [ ] `cloud.batch([{ save | patch | delete: path, data }])`, atomic, in `cloud.js` and
  `cloud-memory.js`.
- [ ] `zargo.js` `replay` takes only rated, finished matches, ordered by
  `ratedAt || endedAt`; friendlies add nothing to robustness or matches played. A test for
  each. Existing tests pass untouched.
- [ ] Matches and summaries show pending and friendly plainly. ⚠ The win record on a
  person's page counts friendlies too; say so in Handover so the owner can rule on it.
- [ ] SPEC §3, §5, §6, §7, §9, §13; `ZARGO.md` where it says what moves a rating.

### Done when

A friendly leaves both ratings alone. A rated match moves them only after the second phone
confirms, and **Rebuild ratings** then proposes no change.

---

## Session 6 — Outsiders play in Rack It

### Rules

- [ ] In `shared/firestore.rules`, proved in `rules-check.mjs` before the app is touched.
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

- [ ] Write the update rule's cases first: Save on a rated match (live to pending, `endedBy`
  set to yourself), Confirm, Not right and Withdraw must pass; each "Must refuse" must fail.
- [ ] **Must refuse:** a match against someone you aren't connected to; a match you aren't
  in; changing `uids` or the players; confirming your own result, by any route (finishing it
  yourself, or rewriting `endedBy`); turning a friendly into a rated match; a rating written outside
  a confirmation; a rating for a player who isn't in that match; listing `ratings` or
  `matches` without the `uids` filter; anything else under `/sidequests/`.
- [ ] ⚠ What the rules can't check is the arithmetic: the confirming phone works out the
  new ratings. The owner's **Rebuild ratings** corrects a wrong one from the matches.

### `shared/cloud.js` and the mock

- [ ] `cloud.list` and `cloud.watchList` take `where: [field, op, value]`. **No `orderBy`
  together with `where`**: that needs a composite index, which needs a deploy and a wider
  role for the service account. Sort on the phone.
- [ ] `cloud-memory.js` opens the same paths in its table: a non-member reads a match only
  when their uid is in `uids`, lists only with the `uids` filter (Firestore refuses the
  query otherwise, so the mock must), gets `ratings/<id>` and `state/main`.

### Rack It

- [ ] When `cloud.role()` is null the app runs in **friend mode** instead of the Session 1
  screen:
  - **Play**: the same setup, picking from friends and guests.
  - **Ratings**: you and your friends who have a rating, each read by id. No club list.
  - **Matches**: `where: ["uids", "array-contains", <uid>]`, newest first.
  - **More**: My QR, Friends, Profile, Export (your matches), Install, About Zargo, Sign
    out. No Invites, Import or Rebuild.
- [ ] A player with no rating document starts at `config.startZargo`. A guest's starter
  estimate is written to `ratings/<g_id>` by the account that made the guest.
- [ ] First open in friend mode shows, once: "Kenny's household can see the matches you
  score here."
- [ ] Test in `?mock` with three tabs (owner, `&as=ann`, `&as=ben`): Ann and Ben connect and
  play a rated match; Ben confirms; the owner sees it; a fourth tab `&as=cat` sees nothing.
  Then for real, with the non-member Google account.
- [ ] SPEC §7, §8, §9, §11, §13. `KIT.md` privacy table.

### Done when

A pool friend who isn't on Invites scans, plays a friendly and a rated match against the
owner, confirms, and sees only their own matches. `rack-it/?mock&as=cat` can't read
another pair's match.

---

## Session 7 — Claiming a guest

- [ ] On a guest: **That was them** → pick a friend. It rewrites that guest's matches (the
  scorer's own, found by `by`): the player id becomes the friend's uid and `uids` gains it.
  The guest document gets `claimedBy`. Guests only play friendlies, so no rating is replayed:
  if the friend has no rating document, the guest's starter becomes theirs.
- [ ] A rule for exactly that write: the scorer (`by`), on their own match, changing only
  `playerA`/`playerB`, `uids` and `names`, to a uid they're connected to. Cases first.
- [ ] A household person with no account who gets one: the owner claims them the same way
  (the owner may already rewrite saved matches), and the person document gets the `uid`.
- [ ] ⚠ Other apps' records for that guest aren't rewritten here. Session 8 decides how.

---

## Session 8 — outline (finalised after Session 6)

- `/sidequest` works out which parts a new app wants from the description, wires them, and
  reports what it chose. It asks only when it can't tell. `_template` gains commented-out
  mounts.
- Bloc 11, Around the Clock and Zombie Dice move from player chips to `people.pick`, store
  `names` and `uids`, and get My QR and Friends.
- A generic rule so an app needs one line, not a block: records in an app named in an
  `open` list are readable by the accounts in their `uids`.
- Claims reach every app's records.

## Parked

- **Blaze.** Reopen when one of these happens: a rating is tampered with and Rebuild isn't
  enough; push notifications are wanted ("confirm your match"); automatic backups are
  wanted (Firestore's scheduled backups need Blaze but no code). Until then the backup is
  each app's Export.
- Leagues: a group with its own table, which is what **Rated** is for.
- A pending rated match never expires. An expiry, or a reminder.
- Other sign-in methods: email link, Apple, phone. The uid keying makes them additive.
- Firebase anonymous sign-in, for someone with a phone but no Google account.
- An in-app scanner (`BarcodeDetector` on Android Chrome), to add a player without the
  camera app.
- Groups: "connect me to everyone at the club", a group QR. The 24-hour code rules out a
  printed QR until this exists.
- Blocking. Remove now holds, because the old code has expired by the next day.
- Moving a claimed household person to a different Google account (what Unclaim did).
- App Check, if strangers' sign-ups ever threaten the free quota (50,000 reads a day).
- Household membership as a custom claim, to save the `/members` lookup on every request.
  Needs server code.
- A standalone Connect app at `connect/`, for people who only want the QR.
- iPhone: the home-screen app and Safari keep separate sign-ins, so an iPhone scan always
  lands in Safari. Note it and leave it.

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

Still open, for the owner:

1. After **Delete my account**, the matches that person played keep their name and uid.
   Decide before Session 6 whether the owner should have a "forget this player" action.
2. Whether a person's win record counts friendlies (Session 5).

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
