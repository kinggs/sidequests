# The kit — shared features a sidequest opts into

Every sidequest is one `index.html`. What they have in common lives in `shared/`, as parts
an app picks when it's made: the shopping cart. `/sidequest` works out which parts a new app
wants and wires them from `_template/`, which has them all (its SKILL.md §4). Adding a part to an
existing app later is one import and one mount call.

How it was built: `shared/KIT-HISTORY.md` (Sessions 0 to 9). What's proposed next, and Parked:
`shared/KIT-PLAN.md`.

## The parts

| Part | File | Gives the app | Needs | Status |
| --- | --- | --- | --- | --- |
| **Storage** | `cloud.js` | Data under `sidequests/<app>/`, offline cache, `?mock` | — | ✓ |
| **Phone** | `phone.js` | Install button, fullscreen, keep awake | — | ✓ |
| **Theme** | `theme.css` | The shared look | — | ✓ |
| **Sign-in** | `cloud.js` | Google sign-in, an account (uid) with a name and photo | Storage | ✓ |
| **Connect** | `connect.js` | My QR, scan to connect, friends list with note, met and tags | Sign-in | ✓ |
| **Players** | `people.js` | Pick who's playing: you, a friend, a QR scan, or a guest; That was them | Connect | ✓ every app that names players |
| **UI** | `ui.js` | Tap, hold-to-confirm, toast, bottom sheet, row menu, the account sheet, the echo strip, presence (`DESIGN.md`) | Theme | ✓ every app |
| **Open rule** | the rules (`openApps()`) | Anyone signed in uses the app; each record reached by the accounts in it, the owner by all | Sign-in | ✓ every app bar Rack It and Sessions Loyalty, which have their own blocks |
| **Shared games** | `connect.js`, `ui.js`, the rules | A Game QR, guest seats, one game on several phones (`CONNECT.md`); in Rack It also a scorer and both sign | Players | ✓ Rack It (table game), Zombie Dice (turn game) |
| **Owner** | `cloud.js` | `cloud.role()`: the one admin | Sign-in | ✓ |

## Sign-in and accounts

- Everyone who signs in has an **account**, keyed by Firebase `uid`, never by email. Other
  sign-in methods (email link, Apple, phone) can then be added later without moving data.
- An account has a **profile**: full name (from Google, editable) and a photo (Google's, or
  one taken in the app, shrunk to a 192 px JPEG and stored in the profile document).
  ⚠ Firebase Storage would need the paid Blaze plan, so the photo stays in Firestore.
- **One admin.** The owner (the `/members` document with `role: "owner"`, set in the Firebase
  console) sees every record in every app and keeps the household people list. There is no
  household tier and no allowlist (Session 9): everyone else, Melanie included, is an account that
  reaches the records it's in. A leftover `/members` document without the role means nothing.

## Connect

Meet someone, show your QR, and you're connected in every sidequest that has Connect.

- **My QR**: a big QR with your name and photo above it. It holds the screen on. The code
  lasts **24 hours** and renews itself when you open My QR, so a photo of it or a forwarded
  link stops working overnight. The link points into the app you opened it from, e.g.
  `…/sidequests/rack-it/?i=<code>`, so the person scanning lands in Rack It. The friendship
  itself belongs to the account, not to Rack It, so it appears in every app.
- **Scanning**: the other person points their phone camera at the QR.
  - **The app is installed (Android)**: the link opens it, already signed in, and you're
    connected at once.
  - **Not installed, or iPhone**: the browser shows "Connect with Kenny Inggs" and
    **Sign in with Google**. After sign-in you're connected, they can add a photo, and
    they're offered **Install on this phone**.
  - It's mutual and automatic. The QR is the consent, so there's no request to accept.
- **Friends list**: avatar and full name, newest first, searchable, filterable by tag.
- **Friend card**, all private to you:
  - **Note**: e.g. "Waiter, Tuesdays".
  - **Met**: the date and time are stamped automatically. You can type the place, and it
    defaults to the last one you used.
  - **Tags**: chips such as `pool` or `staff`, offered from the tags you've used. Apps
    filter friends by tag.
  - **Remove**: takes you out of each other's lists. They can't re-add themselves: the
    code they scanned has expired.
- **Export / Import** of your profile, friend cards and guests as JSON. Import restores
  your notes; it can't remake a friendship.
- **Delete my account** removes your profile, photo, friendships, notes and guests.
- **Offline is a nice-to-have.** The QR shows from the cache when the app has been opened
  before. Connecting needs a signal.

## Players

`people.js`, with the same calls the apps use today and new sources behind them. A player
is:

- **a friend**, picked from your friends list;
- **someone new**, who scans your QR there and then and is added as a friend and a player
  in one go;
- **a guest**: a typed name for someone with no phone, private to you. A guest can be
  **claimed** later: once they're on Connect, you tap **That was them** (`people.claim`, from a
  guest's page or the account sheet's **Your guests**) and the games you started with them become
  theirs, in every app, through one rule shape (`seatSwap()` in the rules). The guest keeps a
  pointer (`claimedBy`), so `people.resolve` leads there;
- **you**: your own account, named and pictured by your profile;
- for the owner in Rack It only, **a household person**: the owner's old list
  (`sidequests/_shared/people/`), started with `household: true`. Nothing in it migrates; old
  records naming a household person with no account read by their `names`.

**Ids.** An account is its `uid`. A guest is `g_<id>`. A household person with no account
keeps their person id. `people.resolve(id)` leads any id an app ever stored to the current
one, so a household person who signs in becomes their uid without a record being rewritten.

**What an app stores.** Beside the player ids (`players`), every record keeps `names` (a
snapshot, so it reads on any phone), `uids` (the accounts in it, which is what the rules check)
and `by` (whoever made it). Get them from `people.names(ids)` and `people.uidsOf(ids)`. Every list
carries `where: ["uids", "array-contains", uid]`.

**The calls.** `people.pick({ title, recent, app })` is the sheet for one player slot: the
`recent` ids first, then everyone by name, a search past eight, then **Scan a new player**
(My QR; whoever scans is picked) and **Add a guest**. `people.addPlayer()` is those two
buttons alone. `people.players()` lists every source; `people.active()` is the household only
(Rack It's admin). `people.get(id)` gives `{ id, name, photo, colour, kind }`, `kind` being
`"household"`, `"account"` or `"guest"`.

## Shared games

One game on several phones. The design and what was built: `shared/CONNECT.md`. In short:

- **Game QR**: `connect.showQR({ app, game: { id, title } })`, the My QR screen headed "Join
  Kenny's match", link `…/<app>/?g=<id>&i=<code>`. The scan makes the friendship first, then
  `connect.handleInvite`'s `onDone({ …, game })` hands the app the game. Only the starter shows
  it: a seat is taken only by someone connected to the starter.
- **Seats**: a guest's seat becomes the joiner's uid (`seatSwap()` in the rules); `names` keeps
  the name. **That was them** gives a guest's other games to the account (`people.claim`).
- **Several phones scoring** (Rack It, a table game): every write is the next link of a chain
  (`rev`), so a stale phone's write is refused, never rewinds the game. The echo strip
  (`ui.echo`) says what another phone just did, with Undo; light presence (`ui.presence`,
  `phones.<uid>.at`) says when each was last seen.
- **Taking turns** (Zombie Dice, a turn game): a turn is played on its player's phone, or the
  starter's; every other phone is a mirror (`.mirror`) and gets "Your turn" when it comes round.
  No chain: only a live phone writes, and nothing rated rides on a turn.
- **A scorer**: whoever starts a game they don't play in; never in `uids`, never confirms. A
  rated result then needs every player who didn't end it to confirm (`confirms`).

## Privacy

| Data | Who can read it |
| --- | --- |
| Your name and photo | Anyone signed in who has your uid (your friends, the people you play with). Profiles can't be listed. |
| The name on your QR | Anyone holding the QR within its 24 hours, so the welcome screen can say who it's from |
| That two people are friends | Those two only |
| Your notes, tags, met, guests | You only. Your friends can't see your friends. |
| A live game (a Rack It match, a Zombie Dice game) | Also anyone connected to its starter, one game by id (the Game QR), never a list. A Rack It match's scorer reads it too. |
| An app's records | The accounts in them (`uids`) and the admin, in every app. Nobody else, whoever they are. |
| The household people list | The owner only. |
| A Rack It rating | Anyone signed in who has that player's id, one at a time. Only the owner can list them. |
| A Sessions Loyalty card and its entries | That member, and the club's staff. The staff note on a member: staff only. The club's rewards and ways to earn: anyone signed in. (`sessions-loyalty/SPEC.md` §6) |

Email addresses are never in a profile, a friendship or a record's `names`.

## Data

Accounts are top-level collections, outside `/sidequests/`, on purpose: an app's records and
someone's friends never share a rule, and the owner's reach over `/sidequests/` doesn't extend to
anyone's friends.

```
/profiles/{uid}                  { name, photo, googlePhoto, createdAt }      — get by uid
/profiles/{uid}/private/main     { invite, expires }                          — owner-only
/profiles/{uid}/friends/{uid2}   { note, tags[], metAt, metPlace }            — owner-only
/profiles/{uid}/guests/{g_id}    { name, createdAt, claimedBy }               — owner-only
/invites/{code}                  { uid, name, expires }                       — get by code
/friendships/{uidA}_{uidB}       { uids: [uidA, uidB], since, via, app }      — those two
```

A friendship is one document for the pair (lower uid first), created by one of them with the
other's live code. It is the only proof two accounts are connected: a rule checks it with
one `exists()`. The card under `friends/` is only your notes about them.

No server code and no paid plan: `KIT-PLAN.md` Decisions, and Parked for what would reopen
that.
