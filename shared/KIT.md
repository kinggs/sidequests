# The kit — shared features a sidequest opts into

Every sidequest is one `index.html`. What they have in common lives in `shared/`, as parts
an app picks when it's made: the shopping cart. `/sidequest` asks which parts a new app
wants (from `KIT-PLAN.md` Session 8). Adding a part to an existing app later is one import
and one mount call.

Status and build order: `shared/KIT-PLAN.md`.

## The parts

| Part | File | Gives the app | Needs | Status |
| --- | --- | --- | --- | --- |
| **Storage** | `cloud.js` | Data under `sidequests/<app>/`, offline cache, `?mock` | — | ✓ |
| **Phone** | `phone.js` | Install button, fullscreen, keep awake | — | ✓ |
| **Theme** | `theme.css` | The shared look | — | ✓ |
| **Sign-in** | `cloud.js` | Google sign-in, an account (uid) with a name and photo | Storage | ✓ (photo upload: Session 2) |
| **Connect** | `connect.js` | My QR, scan to connect, friends list with note, met and tags | Sign-in | QR, scan, Friends ✓; the card: Session 2 |
| **Players** | `people.js` | Pick who's playing: a friend, a QR scan, or a guest | Connect | Sessions 3–4 |
| **Household** | `cloud.js` | The `/members` allowlist and owner role | Sign-in | ✓ |

## Sign-in and accounts

- Everyone who signs in has an **account**, keyed by Firebase `uid`, never by email. Other
  sign-in methods (email link, Apple, phone) can then be added later without moving data.
- An account has a **profile**: full name (from Google, editable) and a photo (Google's, or
  one taken in the app, shrunk to a 192 px JPEG and stored in the profile document).
  ⚠ Firebase Storage would need the paid Blaze plan, so the photo stays in Firestore.
- **The household** is the allowlist: an account whose email is in `/members`. A household
  member reads everything under `/sidequests/`, so only people who live here go on it.
  Playing in an app is never a reason to add someone; that's what Connect is for.

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
  **claimed** later: once they're on Connect, you tap "that was them" and their guest games
  become theirs;
- for household members, **a household person**: the list every app shares today. It stays
  as it is, and nothing is migrated.

**Ids.** An account is its `uid`. A guest is `g_<id>`. A household person with no account
keeps their person id. `people.resolve(id)` leads any id an app ever stored to the current
one, so a household person who signs in becomes their uid without a record being rewritten.

**What an app stores.** Beside the player ids, every record keeps `names` (a snapshot, so
it reads without the household list) and `uids` (the accounts in it, which is what the
rules check). Get them from `people.names(ids)` and `people.uidsOf(ids)`.

## Privacy

| Data | Who can read it |
| --- | --- |
| Your name and photo | Anyone signed in who has your uid (your friends, the people you play with). Profiles can't be listed. |
| The name on your QR | Anyone holding the QR within its 24 hours, so the welcome screen can say who it's from |
| That two people are friends | Those two only |
| Your notes, tags, met, guests | You only. Your friends can't see your friends. |
| An app's records | The household sees all of them. An outsider sees only the records with their uid in `uids`, in apps that have opened up (Rack It, Session 6). |
| A Rack It rating | Anyone signed in who has that player's id, one at a time. Only the household can list them. |

Email addresses are never in a profile, a friendship or a record's `names`.

## Data

Accounts are top-level collections, outside `/sidequests/`, on purpose. The rule on
`/sidequests/{appId}/**` lets every household member read everything under it, so a friends
list stored there wouldn't be private.

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
