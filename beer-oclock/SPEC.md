# Beer O'Clock — Spec

A two-person nudge tracker. It answers one question: *when did we last do this, and are we overdue?*

## Purpose

Kenny and Sergio keep meaning to go for a beer, keep meaning to play pool, keep meaning to see
a band, and keep letting months slide. The app tracks three habits, shows how long it's been,
and shouts when one is overdue.

## Who uses it

Kenny and Sergio. Both sign in with Google; both see the same data live (Firestore). Anyone
else in the family allowlist can open it too — the app doesn't gate by name.

## The three habits

| id | Name | Default interval |
|---|---|---|
| `beer` | Beer | every 7 days |
| `pool` | Pool | every 14 days |
| `music` | Live music | every 30 days |

Intervals are editable in the app and shared between both phones.

## Screens

One screen, top to bottom:

1. **Verdict banner** — the single most urgent habit. Either "🍺 Beer — 3 days overdue" with a
   Log it button, or "Next up: 🎱 Pool, in 4 days" when nothing is due.
2. **Three cards** — one per habit: emoji, name, how long since the last one, a bar filling
   toward the interval, a big **Log it** button and a **Remind** button.
3. **Recent** — the last 20 entries, newest first: what, when, who was there, any note.
   Each row has a delete button.
4. **How often** — a −/+ stepper per habit, in days.
5. **Export / Import** — the whole thing as JSON.

## Reminders

Real background push needs a server this repo doesn't have, so **Remind** downloads a calendar
invite (`.ics`) for the next due date at 18:00, with a 30-minute alarm. The phone's own calendar
does the reminding. Tapping it again after logging gets a fresh date.

## Data model

Everything under `sidequests/beer-oclock/` via `shared/cloud.js`.

- `state/settings` — `{ intervals: { beer, pool, music } }`
- `log/<id>` — one document per outing:
  `{ activity: "beer"|"pool"|"music", at: <epoch ms>, who: ["Kenny","Sergio"], note: "", by: <email> }`

`at` is stored at 20:00 local on the chosen day, so a day's entries sort sensibly and "days ago"
is a calendar-day count, not a 24-hour one.

Both are watched live, so logging on one phone updates the other immediately.

## Out of scope

- Push notifications, geofencing, anything that needs a backend.
- Photos, ratings, venue lists, costs, units drunk. It is a nudge, not a diary.
- More than the three habits — adding a fourth is a code edit, deliberately.
- Per-person streaks or scoring. Fair Nine already does competitive.

## Decisions (assumed, not specified)

- Names are hard-coded as Kenny and Sergio; "who was there" defaults to both.
- Third-party names (venues, bands) go in the free-text note; there's no separate field.
- Logging is retrospective-friendly: the date picker defaults to today but takes any past date.
