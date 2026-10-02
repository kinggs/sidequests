# Handoff: Sidequests dark system v3 + Connect

> **Merged into `shared/KIT-PLAN.md` on 2026-10-02.** Where this pack and the plan disagree, the
> plan wins: see its "Where the plan overrides the pack". Build from the plan's sessions, not from
> the "Suggested order" or the prompt below.

For a Claude Code session in `kinggs/sidequests` (main). Drop this folder into the repo root as
`design_handoff/` and start with the prompt at the bottom.

## Overview
A design pass over every sidequest: one shared look (dark system v3, "warm ink") that an agent
adheres to by writing *less* CSS, plus the design for inviting people into games (QR), playing one
game on several phones, and leagues. Nothing here changes game logic, data shapes, `cloud.js`,
the rules, or the plan in `shared/KIT-PLAN.md`.

## About the design files
`Sidequests Design Pass.dc.html` is a **design reference**: static phone frames with inline
styles, built to be looked at, not shipped. It opens in a browser (keep `shared/fonts/` and the
`*/icon.svg` files beside it). The task is to apply what it shows to the real apps, which are
plain single-file HTML on `shared/theme.css` — so the three files under `shared/` here *are*
meant to be committed, after review:

- `shared/theme.css` — v3. Replaces the repo's `shared/theme.css`. Same class names as v2 where
  they existed; new parts added (see DESIGN.md §4 and CONNECT.md §7).
- `shared/ui.js` — new. `tap hold toast sheet menu account`.
- `shared/DESIGN.md` — the one page an agent reads. Replaces the look sections of CLAUDE.md
  rule 7 and `.claude/skills/sidequest/SKILL.md` §4; `rack-it/design/DESIGN.md` becomes history.
- `shared/CONNECT.md` — invites, shared games, leagues.
- `CHANGES.md` — per-app: what each `index.html` drops, swaps or gains, in commit order.

## Fidelity
High-fidelity for the system (tokens, type, parts, spacing, copy) and for the home / setup / list
screens. The play screens (Rack It live, Zombie Dice, Around the Clock) are shown to confirm the
inks and the shared-game chrome; their game objects are unchanged from the repo. The Connect
screens (8a–8f) are high-fidelity in look and copy; the data shape behind them is sketched in
CONNECT.md §7 and is the developer's to finalise against `KIT-PLAN.md`.

## Decisions taken by the owner (don't re-litigate)
- Evolve the look, not replace it. Dark only. Warm greys. Bigger figures.
- Navigation stays per app (scroll page / 4 tabs / segmented) but each model looks identical.
- One destructive gesture: 600ms hold. No "Sure?" taps, no `confirm()`.
- Delete lives inside the item's page; page-less rows get a `⋯` → bottom sheet → hold.
- Sign in / out behind the avatar (`.me` → `ui.account` sheet). No Sign out button on pages.
- Game screens: loose. The app owns its play screen as long as it uses the tokens.
- Read screens in rem (phone text size applies); play screens may be fixed px.
- Accents from a fixed 8-step ramp, two per app. Re-mapped: Rack It teal + lilac, Bloc 11
  amber + sky, Around the Clock sky, Zombie Dice lime + coral, Photo Coach pink + sky.
- Landing page becomes a launcher: a tile per app in its accent-soft, icon in its accent.
- Joining a game: Game QR, friend invite (card on Home), WhatsApp link; a scan also makes the
  friendship. Anyone in a table game may tap anything (last write wins, echo strip + Undo). In
  turn games only the current player's phone and the host's are live. Full mirror for everyone
  else. Presence: avatars, stale dot, "looking", Nudge, `by` in the log. Signal drops: carry on.
- A third party may score a league match; rated then needs both players to confirm.
- Leagues are Rack It's and the owner's: name, venue, season, own QR, table (wins · racks ·
  Zargo); League is a setup row that makes the match rated.

## Screens in the reference (ids are on the frames)
- 1a–1c System: the ramp and inks; the type scale; a row's `⋯` sheet with hold-to-delete; the
  account sheet.
- 2a Launcher: current list vs proposed tile grid.
- 3a Bloc 11 home, two scroll positions. 4a Around the Clock home + play. 5a Zombie Dice home +
  play. 6a Photo Coach library. 7a Rack It ratings + live. Each current vs proposed.
- 8a Setup with Who's playing (friends, Show QR, Add a guest) and a League row. 8b Game QR.
  8c the scanner's join card, and Home with an invite card + a Confirm strip. 8d a table game on
  two phones (scorer banner, presence, echo strip). 8e a turn game on two phones (live vs mirror,
  Nudge). 8f a league page.

## Design tokens (all in theme.css)
Inks `#0E0D0B / #1A1816 / #262320`, line `rgba(240,236,228,.10)`. Text `#F0ECE4`, text-2
`#CEC8BE`, dim `#AEA79C`, faint `#8E877B`, warn `#FFC14D`. Ramp (accent / ink / soft): teal
`#2FD4B3 #04271F #10281F`, green `#5FD68A #06240F #10251A`, lime `#B9DF57 #1A2406 #1F2614`, amber
`#F3B84B #2A1A03 #2A2214`, coral `#FF8C6B #2E1007 #2C1C17`, pink `#FF8AB8 #2E0A1A #2B1A22`, lilac
`#C0A5FF #1B0F33 #231E33`, sky `#7CC3FF #04213A #16222E`. Radii 12 / 14 / 18 / 24 (sheet).
Targets 60 / 76. Type: Space Grotesk 600/700 for figures and labels, system for reading; 72 / 44 /
40 / 30 / 28 / 18 / 14. Motion: rise 240ms `cubic-bezier(.2,.8,.2,1)`, fade 160ms, press scale .98;
all off under reduced motion.

## Suggested order (one commit each, minor bumps; `make verify` before each push)
1. `shared/theme.css` v3 + `shared/ui.js` + `shared/DESIGN.md` + `shared/CONNECT.md`; update
   CLAUDE.md rule 7 and SKILL.md §4 to point at DESIGN.md; `_template/index.html` to the new
   header (`.me`) and `ui` import. Smoke test: every app must still load on v3 before any app
   changes, since class names are compatible.
2. `index.html` → launcher.
3. One app per commit, following CHANGES.md: Bloc 11, Around the Clock, Zombie Dice, Photo
   Coach, Rack It (greys only on the live screen).
4. Connect, in `KIT-PLAN.md` order: Game QR + join card (`connect.showQR({ game })`,
   `handleInvite` reads `?g=`), Setup chips, presence + echo strip in Rack It, turn-game live /
   mirror in Zombie Dice, then leagues. Each step gets its rules cases first, as the plan says.

## Prompt to start the session
> Read CLAUDE.md, then design_handoff/README.md, then design_handoff/shared/DESIGN.md and
> CHANGES.md. Do step 1 of "Suggested order": install theme.css v3, ui.js, DESIGN.md and
> CONNECT.md under shared/, update CLAUDE.md rule 7, SKILL.md §4 and _template to match, run
> `make verify`, and deploy with /deployquest. Stop and report before touching any app.
