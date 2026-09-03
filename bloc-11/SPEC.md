# Bloc 11 — Spec

A phone-first bouldering log for Kenny and the friends he climbs with at Bloc 11. It answers
two questions: *what did we climb tonight?* and *are we getting better?*

## Purpose

Log each route as it's climbed — who, what grade, sent or still projecting, an optional note
about which route it was — and see each person's progress over time. Zero faff at the wall:
tap a name, tap a grade, tap **Sent it**.

## Who uses it

Kenny and two or three regular climbing partners, with room for more. Everyone signs in with
Google and sees the same live data. Anyone can log for anyone (one phone at the wall is
normal), and anyone can add a climber.

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

1. **Log a climb** — climber chips (single select; the signed-in person is first and selected
   by default, tap anyone else to log for them), an 8-tile grade grid, an optional note ("the 5 in the cave"), a date that
   defaults to today, and two big buttons: **Sent it** and **Projecting**. Either one saves.
2. **Progress** — pick a climber. Three tiles (hardest send, hardest grade being projected
   above that, total sends with this month's count), then a timeline: one bubble per
   grade per session (filled = sent, hollow = projecting), grade on the y-axis, date on the
   x-axis. A bubble grows with the number of climbs it stands for and maxes out at six, so
   six 3s in one session is the biggest bubble; rings sit under filled bubbles so a grade
   that was both sent and projected reads as overlapping circles. A line runs through the
   hardest send of each session. Tap a session to see its climbs grouped and counted under
   the chart ("3× Sent a 3 · the cave one"). Below that, sends per grade as horizontal bars.
3. **Recent** — the latest climbs, newest first, each with an armed two-tap delete.
4. **Climbers** — the list, an add form (name + optional Gmail), remove, and a Share button
   for the app link. Giving a Gmail also adds it to the family allowlist so that person can
   sign in straight away.
5. **Export / Import** — everything as one JSON file.

## Data model

Everything under `sidequests/bloc-11/` via `shared/cloud.js`.

- `state/main` — `{ climbers: { <id>: { name, email, createdAt, deleted } } }`
  Removal is a soft delete so old climbs keep their name.
- `climbs/<id>` — one document per route climbed:
  `{ climber: <climberId>, grade: 1–8, result: "sent"|"project", note: "", at: <epoch ms>, by: <email> }`

`at` is stored at 20:00 local on the chosen day (same convention as Beer O'Clock) so a
day's climbs sort sensibly and sessions group by calendar day.

Both are watched live, so a climb logged on one phone appears on the others immediately.
Offline logging works through Firestore's persistent cache and syncs later.

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
- Climbers are people, not accounts: a climber can be logged for without ever signing in.
- **You are a climber by default.** On sign-in the app looks for a climber with your email;
  failing that, a climber with your first name and no email gets your email attached (so a
  "Rolf" added from Kenny's phone becomes Rolf's own row the first time he signs in); failing
  that, you're added under your Google first name. The log form then points at you until you
  tap someone else. It waits a moment for the climber list before adding anyone, so a fresh
  phone doesn't create a duplicate.
- Deleting a climb is a two-tap arm-and-confirm, not an undo.
