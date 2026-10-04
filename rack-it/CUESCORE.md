# Rack It reads Cuescore: your next league game and your results

**Status:** spec, 2026-10-04. Not built. The first step towards leagues (`shared/KIT-PLAN.md`,
Parked): before Rack It runs a league, it shows the one you already play on Cuescore.

## Goal

Open Rack It and see your next Cuescore league fixture and your recent league results, with no
typing at the table. Read-only: Rack It never writes to Cuescore, and Cuescore results never
touch Zargo (`ZARGO.md` decision 10).

## What Cuescore allows (probed 2026-10-04)

| Fact | Evidence |
| --- | --- |
| `api.cuescore.com` is a public, read-only JSON beta with no key and no docs beyond its index page. | `GET https://api.cuescore.com/` |
| **The browser can call it**: every response carries `access-control-allow-origin: *`. So no server and no Blaze plan. | headers on `/participant/` and `/tournament/` |
| `/participant/?id=<player>` is profile only: name, photo, country. **No matches, no rating.** | `?id=1090753` |
| A league is a Cuescore "tournament". `/tournament/?id=<id>` returns every match: `playerA`/`playerB` (with `playerId`, `name`), `scoreA`/`scoreB`, `raceTo`, `roundName`, `starttime`, `matchstatus` (`waiting` = to play, `finished`), `discipline`. | `?id=73592347`: 380 matches, 115 `waiting` |
| **There's no call for "a player's matches" or "a player's leagues."** Cuescore's own player pages have them, but those pages are HTML with no CORS, so a phone can't read them. | `cuescore.com/player/…/matches` |
| A league document is big: 4.1 MB for 380 matches. | `?id=73592347` |

⚠ `ZARGO.md` decision 10 assumes the API gives a player's rating. It doesn't (the participant has
no rating field). That note is wrong and should be corrected when this is built.

## The design

1. **You.** Your Cuescore player number, as Rack It already stores it: your own **Add your
   Cuescore link** on your page (`people.edit(id, { cuescore: true })` → `cuescoreId`).
2. **Your leagues.** Because Cuescore can't list them, you paste a league's link once (More →
   **Cuescore leagues** → **Add a league**: `cuescore.com/tournament/<name>/<id>`). Kept on this
   phone (`localStorage`), so no rules change. Remove from the same list.
3. **Fetch.** On open, and at most once an hour, Rack It reads each league's
   `/tournament/?id=`, keeps only the matches with your `playerId` on either side, and caches
   those (small) on the phone. The 4 MB is read and dropped, never stored.
4. **Next up**: a card on the Play tab above Who's playing: "Next · Players Singles Div 2 · you v
   Nick Baldwin · Round 14 · race to 15 · Mon 31 Aug, 20:35". The earliest `waiting` match. Tap:
   **Open on Cuescore** (the league's page).
5. **Your results**: on your person page, under Cuescore: your last 10 `finished` league
   matches, newest first, "Won 15–9 v Nick Baldwin · Round 12 · 31 Aug". Read-only, no Zargo.
6. **Offline / no signal:** the cached copy, with "As of Mon 20:00". A failed fetch keeps the
   cache and says nothing unless there's no cache at all.

## Not in this step

Writing to Cuescore; Cuescore ratings (none to read); challenge matches (no list call); someone
else's fixtures; turning a fixture into a Rack It match (the next step: **Score this match**
prefilled from the fixture, the opponent as a guest named from Cuescore, until leagues proper).

## Questions for the owner before building

1. Which league(s)? Singles, or team leagues (a team league's `playerA` may be a team)?
2. Is history league-only fine, given challenge matches can't be listed?
3. On Play or on your page, or both, for Next up?

## Done when

With your Cuescore number set and one league pasted, the Play tab shows your next fixture and
your page your last results; airplane mode shows the cached copy; `?mock` serves a canned league
JSON (`shared/proofs/seeds/`) so the proof runs without the network.
