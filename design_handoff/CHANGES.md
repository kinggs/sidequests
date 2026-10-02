# Design pass — what each app drops, swaps or gains

Order: do `shared/` first, then one app per commit. Each app is a minor bump.

## shared/
- `theme.css` → v3 (`proposed/shared/theme.css`). Adds the ramp, `.sect .row .big .wide .card
  .resume .grid .bars .me .sheet .scrim .done .pl .stage .controls`, warm greys, motion.
- `ui.js` → new (`proposed/shared/ui.js`): `tap hold toast sheet menu account`.
- `DESIGN.md` → new (`proposed/shared/DESIGN.md`). Replaces the look sections of CLAUDE.md rule 7
  and SKILL.md §4; `rack-it/design/DESIGN.md` becomes history.
- `.claude/skills/sidequest/SKILL.md` §4: "Read `shared/DESIGN.md`. Set two accents. Build from the
  parts. Write CSS only for the game object." `_template/index.html`: swap `userBox` for
  `<div class="me-host" id="meHost">`, import `ui`, delete the inline `tap` comment.

## index.html (landing → launcher)
- Becomes a grid of app tiles: icon, name, one line of what it's for, each tile in that app's
  accent-soft with the icon in the accent. Tap = open. Long row of text about installing moves
  into each app's account sheet ("Install on this phone").

## bloc-11
- Drop: `.sect .row .hint label .userbtn .gate p .tiles .rows .x .rows .x.arm`, `tap() armed()
  toast()`. Keep: `.grades` → use theme `.grid`; `.legend .session .brow` chart bits.
- Accent: `--amber` (sends), `--accent-2: --sky` (projecting). Grade in a row: `.fig` / `.fig.alt`.
- Recent rows: ✕ → `⋯` (`ui.menu`: Edit note, Hold to delete). Climbers rows: Edit stays.
- Header: avatar `.me`; Sign out moves into its sheet with Export / Import / Install.
- Tiles: figure 40px; hardest send in `--accent`.

## around-the-clock
- Drop: `.sect .hint .userbtn .gate p .row .resume .rows .score .rows .x`, helpers.
- Accent: `--sky` (score line, your band, the thrower). Single / double / treble keep their board
  colours. `.stage .on.who` loses weight 800 → Grotesk 600 `.fig`.
- Resume → theme `.resume` (sky-soft, 3px bar). Recent rows: ✕ → `⋯`.
- Game: `.pl` from theme (44px score); `.under` Undo moves to the left of Miss; Abandon → hold.
- Finish: `.finish .big` → `.fig-xl`; `.band` weight 800 → 700.

## zombie-dice
- Drop: `.sect .row .big .userbtn .gate p .rows .fig .rows .x`, helpers, `.ov .card` (→ `.done`).
- Accent: `--lime` (brains, whose turn). `--accent-2: --coral` (shot, bust, the shotgun pips).
- Dice, plates, faces, tumble / chomp / kick / hop: unchanged (the app's own).
- Game: `.pl` from theme; Stop / Roll keep their 84px; Home + Abandon → one `⋯` sheet with
  "Hold to abandon". Hand-over card → `.done` (rises).

## photo-coach
- Drop: `.userbtn .gate p .sect label textarea .row .wide .big .card`, `.brow` set, helpers,
  `.focus` left-border block → a `.card` with a `.lbl` "Practise next".
- Accent: `--pink` (scores, the dot). `--accent-2: --sky` (your pick ★ / the batch).
- Tabs: the `.seg` nav stays (three screens), but the "More" tab's contents move into the
  account sheet; the tab goes. Delete photo / delete feedback → holds (already close).

## rack-it
- Drop: `.card .overlay` (→ `.sheet` / `.done`), the inline `tapBind holdBind`, `.tabbar
  .livestrip .prow` (theme versions match), `.userbtn`.
- Accents: `--teal` + `--lilac` as today. `--a/--b` become aliases of `--accent/--accent-2`.
- Live screen: **unchanged** — it is already the reference for play screens. Only the greys move.
- Ratings: Zargo figure 26 → 30px (`.rows .fig`). Matches: live row → `.rows>li.live`.
- More: Sign out leaves the page for the avatar sheet; the rest stays.

## Numbers that moved, everywhere
- Greys: blue-grey → warm (`#0A0D11` → `#0E0D0B`, `#121821` → `#1A1816`, `#1B232E` → `#262320`).
- Title 26 → 28px. Tile figure 30 → 40px. Row figure 26 → 30px. Row min-height 72 → 76px.
- Overlay card in the middle → bottom sheet. Two-tap "Sure?" → hold. ✕ → ⋯.
