# Connect — spec

Meet someone, show your QR, and you're connected. Their name and face are on your phone from
then on. Connect is also the front door for sidequests beyond the family. It is where an
account starts and where friendships form, and other apps build on both.

Status: **planned, not built.** The build is `connect/PLAN.md` Session 1.

## Who uses it

- **The owner and the family**: sign in, set a photo, show a QR, keep a list of friends.
- **Anyone they meet**: pool friends, the waiter at the pool hall, the person who helped.
  They scan the QR with the phone camera, sign in with Google, and are connected. They
  don't need to be on the family allowlist (`/members`), and Connect never shows them
  family data.

## What it does

1. **Sign in** with Google. Everything is keyed by the Firebase `uid`, not the email, so
   other sign-in methods can be added later without moving data.
2. **My profile**: full name (from Google, editable) and a photo. The photo defaults to the
   Google one, or you take or pick a new one.
3. **My QR**: a big QR of `https://kinggs.github.io/sidequests/connect/?i=<code>`, with
   your name and photo above it. It works with no signal, because the pool hall has none.
   **New code** retires the old QR.
4. **Scan to connect**: the other person points their camera at the QR.
   - **Connect is installed (Android)**: the link opens the installed app, which is
     already signed in, and the connection happens at once.
   - **Not installed, or iPhone**: the link opens the browser and shows "Connect with
     Kenny Inggs" and **Sign in with Google**. After sign-in the connection happens, they
     add a photo if they want, and they're offered **Install on this phone**.
   - Both sides then have each other in their friends list. It's mutual and automatic: the
     QR is the consent, so there's no request to accept.
5. **Friends list**: avatar and full name, newest first, searchable, filterable by tag.
6. **Friend card**, all private to you. The friend never sees any of it.
   - **Note**: free text, e.g. "Waiter, Tuesdays. Likes Liverpool."
   - **Met**: date and time stamped automatically. You can type the place, and it
     defaults to the last place you used, so ten people at one venue take no typing.
   - **Tags**: chips such as `pool`, `staff` or `climbing`, offered from the tags you've
     used before. Other apps will filter friends by tag.
   - **Remove**: takes you out of each other's lists.
7. **Export / Import** of your profile and friends (with your notes) as JSON. Import
   restores your side only.

## Privacy

| Data | Who can read it |
| --- | --- |
| Your name and photo | Anyone signed in who has your uid: your friends, and later the people you play with. Nobody can list profiles. |
| The name on your invite | Anyone holding your QR, so the welcome screen can say who it's from |
| Your friends list, notes, tags, met | You only. Your friends can't see your friends. |
| Family data (Rack It and the rest) | `/members` only, unchanged |

## Data

These are top-level collections, outside `/sidequests/`, on purpose. The rule on
`/sidequests/{appId}/**` lets every family member read everything under it, so a friends
list stored there wouldn't be private.

```
/profiles/{uid}                 { name, photo, googlePhoto, invite, createdAt }
/profiles/{uid}/friends/{uid2}  { since, via, note, tags[], metAt, metPlace }  — owner-only
/invites/{code}                 { uid, name, createdAt }
```

- `photo` is a resized JPEG data URL (256 px, about 30 KB), stored in the profile document.
  ⚠ Firebase Storage would need the paid Blaze plan, so the photo stays in Firestore.
- `invite` is the current code. Resetting it deletes the old `/invites` document.

## Out of scope for v0.1

- Other sign-in methods (the uid keying leaves room for them).
- An in-app scanner. The phone camera already opens links.
- Friends appearing as players in Rack It and the other apps. That needs design first:
  `PLAN.md` Session 2.
- Groups ("everyone at the club"), blocking, and messaging.
