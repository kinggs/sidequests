# The kit — shared features a sidequest opts into

Every sidequest is one `index.html`. What they have in common lives in `shared/`, as parts
an app picks when it's made: the shopping cart. `/sidequest` asks which parts a new app
wants (from `KIT-PLAN.md` Session 5). Adding a part to an existing app later is one import
and one mount call.

Status and build order: `shared/KIT-PLAN.md`.

## The parts

| Part | File | Gives the app | Needs | Status |
| --- | --- | --- | --- | --- |
| **Storage** | `cloud.js` | Data under `sidequests/<app>/`, offline cache, `?mock` | — | ✓ |
| **Phone** | `phone.js` | Install button, fullscreen, keep awake | — | ✓ |
| **Theme** | `theme.css` | The shared look | — | ✓ |
| **Sign-in** | `cloud.js` | Google sign-in, an account (uid) with a name and photo | Storage | partly |
| **Connect** | `connect.js` | My QR, scan to connect, friends list with note, met and tags | Sign-in | Session 1 |
| **Players** | `people.js` | Pick who's playing: a friend, a QR scan, or a guest | Connect | Session 3 |
| **Family** | `cloud.js` | The `/members` allowlist and owner role | Sign-in | ✓ (shrinking) |

## Sign-in and accounts

- Everyone who signs in has an **account**, keyed by Firebase `uid`, never by email. Other
  sign-in methods (email link, Apple, phone) can then be added later without moving data.
- An account has a **profile**: full name (from Google, editable) and a photo (Google's, or
  one taken in the app, shrunk to a 256 px JPEG and stored in the profile document).
  ⚠ Firebase Storage would need the paid Blaze plan, so the photo stays in Firestore.
- **Family** is the old allowlist: an account whose email is in `/members`. It still gates
  the apps that haven't moved to Players.

## Connect

Meet someone, show your QR, and you're connected in every sidequest that has Connect.

- **My QR**: a big QR with your name and photo above it. It holds the screen on.
  **New code** retires the old QR. The link points into the app you opened it from, e.g.
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
  - **Remove**: takes you out of each other's lists.
- **Export / Import** of your profile and friends as JSON. Import restores your side only.
- **Offline is a nice-to-have.** The QR shows from the cache when the app has been opened
  before. Connecting needs a signal.

## Players (design in Session 2)

This replaces the fixed household player list. A player is:

- **a friend**, picked from your friends list;
- **someone new**, who scans your QR there and then and is added as a friend and a player
  in one go;
- **a guest**: a typed name for someone with no phone. A guest can be **claimed** later:
  once they're on Connect, you tap "that was them", and their guest games become theirs
  (the `mergedInto` pointers `people.js` already uses).

Today's family people **fold into friends**. Each family person with an account becomes a
friend of each family member, and each person without an account becomes a guest.

## Privacy

| Data | Who can read it |
| --- | --- |
| Your name and photo | Anyone signed in who has your uid (your friends, the people you play with). Profiles can't be listed. |
| The name on your invite | Anyone holding your QR, so the welcome screen can say who it's from |
| Your friends, notes, tags, met | You only. Your friends can't see your friends. |
| An app's records | Decided per app. Rack It: an outsider sees only the matches they played in (Session 4). |

## Data

These are top-level collections, outside `/sidequests/`, on purpose. The rule on
`/sidequests/{appId}/**` lets every family member read everything under it, so a friends
list stored there wouldn't be private.

```
/profiles/{uid}                 { name, photo, googlePhoto, invite, createdAt }
/profiles/{uid}/friends/{uid2}  { since, via, app, note, tags[], metAt, metPlace }  — owner-only
/invites/{code}                 { uid, name, createdAt }
```
