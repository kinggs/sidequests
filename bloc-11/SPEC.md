# Bloc 11 — Spec

A phone-first bouldering log for Kenny, and anyone he climbs with at Bloc 11. It answers
two questions: *what did we climb tonight?* and *are we getting better?*

## Purpose

Log each route as it's climbed — who, what grade, sent or still projecting, an optional note
about which route it was — and see each person's progress over time. Zero faff at the wall:
tap a name, tap a grade, tap **Sent it**.

## Who uses it

Anyone signed in with Google (the open rule, `shared/KIT-PLAN.md` Session 9). A stranger gets an
empty log of their own. You log for yourself and for your **guests**: someone with no phone, a
typed name only you see (**Add a guest**). One phone at the wall still works: log for your guest,
and when they're on Connect later, **That was them** hands their climbs over.

Each person sees only the climbs they're in. **The owner** (`/members` role `owner`) is the one
admin: sees every climb. Everyone else, Melanie included, is a climber like anyone, and so is the
owner when logging: you and your guests (0.9.0, KIT-PLAN Session 9: the household list is the
owner's in Rack It alone; the owner's phone reads it here once more, only until its backfill has
run).

## The grading system

Bloc 11 grades routes 1 to 6, then two harder tiers above that:

| Stored value | Shown as | Meaning |
|---|---|---|
| 1 – 6 | 1 … 6 | The numbered grades |
| 7 | 🌶️ Chilli | Harder than a 6 |
| 8 | 💀 Skull | Harder than a chilli |

Storing the grade as a number 1–8 keeps "hardest send" and the chart's y-axis a simple sort.
Labels live in one `GRADES` table so renaming or adding a tier is one edit.

## Screens

One page, top to bottom:

1. **Log a climb** — climber chips (single select: you, first and chosen, and your guests),
   **Add a guest**, an 8-tile grade grid, an optional note ("the 5 in the cave"), a date that
   defaults to today, and two big buttons: **Sent it** and **Projecting**. Either one saves.
2. **Progress** — pick a climber (anyone you log for, or whose climbs you can see). Three tiles (hardest send, hardest grade being projected
   above that, total sends with this month's count), then a timeline: one bubble per
   grade per session (filled = sent, hollow = projecting), grade on the y-axis, date on the
   x-axis. A bubble grows with the number of climbs it stands for and maxes out at six, so
   six 3s in one session is the biggest bubble; rings sit under filled bubbles so a grade
   that was both sent and projected reads as overlapping circles. A line runs through the
   hardest send of each session. Tap a session to see its climbs grouped and counted under
   the chart ("3× Sent a 3 · the cave one"). Below that, sends per grade as horizontal bars.
3. **Recent** — the latest climbs you can see, newest first. Each row's `⋯` opens a sheet: **Add
   a note** / **Edit note** (anyone in the climb), and **Hold to delete** (whoever logged it, or
   the owner).
4. **Your avatar** (top right) opens the account sheet: Profile, My QR, Friends, Your guests (with
   That was them), Export, Import (the owner's), Install on this phone, Sign out.

**Look.** `shared/theme.css` (dark system v3, `shared/DESIGN.md`). Climbers show as avatars on
chips. Amber is the app's accent and only marks data: sends in Recent,
on the chart, the hardest-send tile and line, the grade bars. Sky, the second, marks projecting:
the grade in Recent and the hollow rings on the chart. Picking a climber or a grade is a neutral
light fill.

## Data model

Climbers live in the shared people list, `sidequests/_shared/people/<id>`, via
`shared/people.js`. Everything else is under `sidequests/bloc-11/` via `shared/cloud.js`.

- `state/main` — `{ climbers: { <id>: { name, email, createdAt, deleted } } }` from before
  people were shared. The app no longer writes it; on first run people.js adopted these into
  the shared list under the same ids (Kenny matched by email to the Kenny another app already
  had). Removal is a soft delete so old climbs keep their name.
- `climbs/<id>` — one document per route climbed:
  `{ climber, players: [climber], names: [name], uids, by: <uid>, grade: 1–8, result: "sent"|"project", note: "", at: <epoch ms> }`
  `climber` is a uid, a guest's `g_<id>` or a household person's id, always read through
  `people.resolve`. `players`, `names`, `uids` and `by` are the open rule's: `uids` is the
  climber's account, or, for a guest or a household person with no account, whoever logged it,
  so the climb stays theirs to see.
- **The backfill.** Climbs from before 0.8.0 named the climber by a household id and `by` by email.
  The owner's phone rewrites them once with `players`, `names`, `uids` (the climber's account, or
  none) and `by` as a uid, and says how many are for people with no account: those stay visible to
  the owner alone, by name.

`at` is stored at 20:00 local on the chosen day (same convention as Beer O'Clock) so a
day's climbs sort sensibly and sessions group by calendar day.

Climbs are watched live (the owner's whole list; everyone else's with their uid in `uids`), so a
climb logged on one phone appears on the others immediately. `state/main` is the owner's alone.
Offline logging works through Firestore's persistent cache and syncs later.

## On the phone

Installs as a real app, not a browser shortcut: the manifest ships PNG icons (192, 512 and a
maskable 512 drawn from `icon.svg`), an id, portrait orientation, and asks for `fullscreen`
with `standalone` behind it. Without the PNGs Chrome quietly makes a plain shortcut that
opens in a tab with the URL bar showing — and then never offers the real install again, which
is why the account sheet has **Install on this phone**. It comes from
`shared/phone.js`, along with fullscreen and the wake lock, so every app here behaves the
same way. An older home-screen shortcut has to be removed and re-added to pick this up.

## Out of scope

- Attempt counts, flashes, route setters, wall sectors, colours of holds. The note field
  covers all of that in plain words.
- Photos.
- Comparing climbers against each other on one chart — progress is per person.
- Anything that needs a server (push reminders, sharing to social).

## Decisions (assumed, not specified)

- The gym is named "Bloc 11" (the Cape Town bouldering gym); the app id is `bloc-11`.
- Two outcomes only: sent, or projecting. Sending a route you were projecting is a new
  "sent" entry, not an edit of the old one — the timeline shows both.
- A climber needn't sign in: they're your guest. Logging for a friend's account isn't offered;
  they log their own.
- **You are a climber by default**: your account, named and pictured by your profile. The log
  form points at you until you tap a guest.
- Deleting a climb is a hold in the row's sheet, not an undo.
