# Rack It — dark system v2

> **Read with `V3-PLAN.md`.** claude.ai/design wrote this spec against 1.5.0; Session 6 applies
> it to `rack-it/`. The second export (2026-09-16, 14:51) added §7 Legibility and
> `02-legibility.png`, updated `01`, and renumbered the rest. Where this doc and the plan
> disagree, the plan wins:
>
> - Paths now say `rack-it/`: Session 5 moved the app there and made the app id `rack-it`.
> - The `.dc.html` mockups named below were not exported; the PNGs beside this file are the
>   reference render.
> - **§7 wins over §1–§6.** Every "13px" label below is 14px, and the greys are §7's.
>   `04`–`08` still show the earlier greys and 13px labels.
> - **Owner decision (Session 6): tracked all-caps labels may be 14px.** Everything else stays
>   at 15px or more. CLAUDE.md rule 7 says the same.
> - Delete on a match summary and on a player is owner-only from Session 6, behind the hold
>   described here. Rebuild ratings (Session 5) is owner-only too.
> - Named new files for CLAUDE.md rule 1: `design/` (reference, never cached by `sw.js`) and
>   the two `space-grotesk-*.woff2` files if the numerals are kept.
> - ⚠ The renders truncate names ("GARE…") and wrap sub-lines ("needs 5 of 14"). Fit first
>   names and sub-lines on one line at 390px before accepting the 62px score.

Implementation guidance for `rack-it/index.html` (app id `rack-it`; product name is
**Rack It**). Mockups: `Rack It.dc.html` (new, options 1a–1e) and `Rack It — Current.dc.html`
(today, for comparison).

Scope: the whole `:root` palette, the live screen's layout, and the setup/ratings/matches chrome.
No change to scoring logic, Zargo, data shape, `shared/*`, or the four-tab structure.

Honour the repo rules while doing it: one file, no build step, bump `APP_VERSION` **and** `CACHE`
in `sw.js`, base font 18px, nothing below 15px except tracked all-caps labels at 13px, targets
≥ 56px, `pointerup` taps, `prefers-reduced-motion` respected.

---

## 1. Tokens

Replace the whole `:root` block. Names are new; old names (`--felt-deep`, `--chalk`, `--ochre`,
`--bone`, `--bone-dim`, `--panel`) can stay as aliases for one commit if that makes the diff
smaller, but delete them before the next change.

```css
:root{
  /* ground: OLED-cheap, one step per surface, no shadows */
  --ink-0:#0A0D11;      /* app ground, tab bar, match bar */
  --ink-1:#121821;      /* rows, cards, inactive score panel */
  --ink-2:#1B232E;      /* inputs, secondary buttons, chips */
  --line:rgba(232,237,243,.10);

  /* turn grounds — the body tint while that player shoots */
  --ground-a:#07201C;
  --ground-b:#23100B;

  /* ink */
  --text:#E8EDF3;       /* 15.4:1 on ink-0 */
  --dim:#90A0B2;        /* 6.2:1 — safe for body copy */
  --faint:#5E6B79;      /* 13px tracked labels and disabled only */

  /* players */
  --a:#23D3B0;  --a-ink:#032721;  --a-soft:#0F2A26;
  --b:#FF6B52;  --b-ink:#2B0A03;  --b-soft:#2A130E;

  --warn:#FFC14D;       /* fouls, hold-to-confirm, provisional */

  --r-chip:12px; --r-ctl:14px; --r-card:18px;
  --tap:56px;           /* minimum */
  --tap-lg:72px;        /* primary actions */
  --rack-gap:clamp(6px, 1.4vh, 12px);
  --bs:clamp(52px, min(23vw, (100dvh - 302px) / 5), 96px);
}
```

Two colour rules, and they are the whole system:

1. **A player's colour only ever means that player.** Teal = side A, coral = side B. The lead
   indicator, a claimed ball, a chosen win button, a live-match strip: all take the colour of the
   player they belong to. Nothing else is coloured.
2. **Amber (`--warn`) only ever means "careful or incomplete"** — a foul on the board, a
   hold-to-confirm in progress, a provisional rating, a short-race warning. Green is retired.

Ball colours (`COLOURS` in the script) are real 9-ball colours and do not change. A **claimed**
ball takes `--a`/`--b` with `--a-ink`/`--b-ink` for the number; a **dead** ball becomes
`--ink-2` with a 2px `--line` inset ring, the number at `rgba(144,160,178,.45)`, and a 3px bar
across the middle instead of the `×` glyph (the glyph reads as a close button).

### Type

Two faces. System stack for everything you read; **Space Grotesk 600/700** for everything you
glance at — scores, ratings, all-caps labels, page titles.

Ship it as one self-hosted `space-grotesk-600.woff2` (plus 700) in `rack-it/`, `@font-face` in
the `<style>` block, and add both files to the `sw.js` cache list. No CDN — the app has to work
in a pub with no signal. If you'd rather not add files, `system-ui` at the same sizes is an
acceptable fallback; nothing else depends on it.

| role | face | size / weight | notes |
|---|---|---|---|
| score | Grotesk | 62 / 600, `-.03em`, line 1 | `font-variant-numeric: tabular-nums` |
| figure (Zargo, scores in lists) | Grotesk | 26 / 600, `-.02em` | right-aligned in lists |
| page title | Grotesk | 26 / 600, `-.02em` | replaces `.apphead h1` at 22 |
| row title | system | 19 / 600 | |
| body | system | 18 / 1.5 | base |
| score sub-line | system | 16 / 600 | "needs 8 of 22" |
| label | Grotesk | 13 / 700, `.1em`, uppercase | the only type below 15px |

---

## 2. The live screen

This is the whole point of the redesign. Today the fixed chrome is **335px** on a 390×844
phone — score panels 164, lead block 56, meta 33, controls 82 — leaving 82px balls. New chrome
is **242px**, so `--bs` reaches 92–96px.

```
 4   turn bar        full-bleed, active player's colour
136  score head      two panels, gap 2px on --ink-0
 6   lead rail       track --ink-1, fill = leader's colour, centre notch
 48  match bar       rack/dead · numeric lead · break
 ─   rack            flex:1, 5 rows, --rack-gap
 88  controls        72px row + 16px bottom padding (+ safe area)
```

### Turn bar (new, 4px)
`background: var(--a)` or `var(--b)`. Peripheral, unmissable, costs nothing. The `body` tint
(`--ground-a`/`--ground-b`) stays and keeps its `.18s` transition.

### Score head (136px, was ~164)
`display:flex; gap:2px; background:var(--ink-0)`. Each panel `padding:14px 16px 12px`, B
right-aligned. **Delete the `.cue` line** ("shooting" / "tap to shoot") — it is the third
redundant turn signal and it costs 25px. Instead:

- **Active panel:** `background:var(--a)`, all text `var(--a-ink)`; name 14px Grotesk 700 `.1em`
  caps with a 7px `--a-ink` dot beside it; score 62px; sub-line `rgba(3,39,33,.75)`.
- **Inactive panel:** `background:var(--ink-1)`; name `--dim`; score `#7E8B99`; sub-line
  `#7E8B99`. No border, no `::after` bar — the fill is the state.

Both panels stay full tap targets for `setTurn`, unchanged.

### Lead rail (6px, replaces the 56px `.leadwrap`)
Keep `leadState()` exactly as it is. Drop `.leadhead`, `.leadname`, `.leadnum`, `.leadbar`,
`.leadmid`. Render the bar full-bleed at 6px: track `--ink-1`, fill from the 50% centre out to
`Math.max(3, |pos| * 50)%`, `background` = the leader's colour (not green), centre notch 2px
`rgba(232,237,243,.28)`. Keep the `.25s` left/width transition.

### Match bar (48px, replaces `.meta`)
One row, `padding:0 12px`, `background:var(--ink-0)`, three zones:

- left — `RACK 3` as a 13px Grotesk label in `--dim`; append ` · 1 DEAD` only when dead > 0
  (11-Point-Nine only), and ` · 12–9 PTS` in place of today's `#audit` when a race is in racks.
- centre — the numeric lead: `Gareth +12%` / `+6` / `target met`, 15px 700 in the **leader's
  colour**. Empty when tied.
- right — the break flip as a `--ink-2` chip, 44px tall, `BREAK ⇄ G` (initial only), 13px label.
  Same `breakFlip` handler.

`table clear` (today's `.ok` span) becomes the centre zone in `--text`, replacing the lead for
that moment.

### Rack
Unchanged structure (`ROWS = [[1],[2,3],[4,9,5],[6,7],[8]]`), unchanged long-press-to-clear.
Ball shadow tightened one step: `inset -6px -9px 16px rgba(0,0,0,.5), inset 5px 6px 11px
rgba(255,255,255,.26), 0 3px 6px rgba(0,0,0,.45)`. Claimed ball: flat player colour, `0 0 0 2px
rgba(10,13,17,.7)` ring, number 40px Grotesk in the player's ink.

### Controls (72px)
`padding:0 12px 16px; gap:14px`. Three fixed sizes, deliberately unequal so they can't be
confused by feel:

| | size | style |
|---|---|---|
| Undo | `flex:0 0 100px` × 72 | `--ink-2`, 1px `--line`, 17px 700 |
| Next rack | `flex:1` × 72 | `--text` fill, `--ink-0` text, 19px 700 |
| End | `flex:0 0 84px` × 72, `margin-left:6px` | transparent, 1px `rgba(255,193,77,.4)`, `--warn`, 15px 700 + 12px "hold" |

In Golden-Nine and Trad-Nine `Next rack` is hidden (it already is), so Undo takes `flex:1`.

**End becomes hold-to-confirm.** 600ms `pointerdown`, a `linear-gradient` fill rising from the
bottom as it goes, `navigator.vibrate(16)` on commit, release early cancels. That removes the
mis-tap risk without adding a modal. Under `prefers-reduced-motion` the fill jumps in one step.
`Next rack` needs no confirmation — Undo covers it.

Apply the same hold to **Delete** on a match summary and on a player.

### Short-phone rules (`@media (max-height: 700px)`)
Score head → 116px (score 52px, sub-line 15px), controls → 64px, match bar → 44px,
`--bs` floor 52px. Nothing else changes; there is no longer a `.cue` to hide.

---

## 3. Golden-Nine / Trad-Nine area

Today: two unlabelled columns of four near-identical buttons plus nine drop cells — 17 targets of
roughly equal weight, and you have to map a column back to the score head to know whose it is.

1. **Fouls out of the columns, into one row above them** — two 56px buttons, `gap:12px`.
   `--ink-2` + `--line` + `--dim` at zero; `rgba(255,193,77,.12)` + `rgba(255,193,77,.55)` +
   `--warn` once there's a foul on the board, with the count and (Golden-Nine) `1 · gave 1`.
2. **Caption each win column with the player's name** — 13px Grotesk label in that player's
   colour, `Gareth wins it` / `Melanie wins it`, right-aligned over column B.
3. **Win buttons**: `flex:1 1 0; min-height:64px`, `--a-soft`/`--b-soft` ground with a 2px inset
   ring in the player's colour, label 18px 700, points 14px Grotesk in the player's colour.
   Chosen = solid player colour with player ink.
4. **Ball drop**: keep two rows of 5 + 4, cells 56px, ball 46px, and add a 1px `--line` divider
   above the block. A potted ball stays an empty ring — that reads correctly.

---

## 4. Other screens

**Header.** `.apphead` loses its `rgba(0,0,0,.25)` plate: `padding:18px 16px 14px`, title 26px
Grotesk 600 on the page ground. A right-hand hint (`ZARGO`, the signed-in avatar) is a 13px
Grotesk label in `--faint`.

**Setup.** The three separate `.fold` cards (Length, Handicap, Break) become **one `--ink-1`
card, `--r-card`, with 1px `--line` dividers** and 64px rows. Game selector becomes a segmented
control: 4px `--ink-1` trough, active pill `--text` fill with `--ink-0` text, 52px. Side headings
become `TEAL SIDE` / `CORAL SIDE` in the player colours. Move the odds sentence
(`#setupHint`) permanently above `Start` in the footer at 15px `--dim` — it is the reason to open
Handicap at all, and it should not be hidden inside it. `#setupWarn` stays in the footer in
`--warn`. `Start` is 72px, `--text` fill, `--ink-0` text, `--r-card`.

**Ratings.** 72px rows, `--ink-1`, `--r-card`. Rank in 15px Grotesk `--faint`, avatar 40px, name
19px 600, and the **Zargo right-aligned at 26px Grotesk** so the column scans. Robustness
becomes plain English underneath at 13px: `41 racks behind it`, or
`provisional · 22 racks` in `--warn`, or `not played yet` in `--faint`. The whole rating goes
`--faint` for someone who hasn't played.

**Matches.** 76px rows, score line 19px with the figures in Grotesk, meta as a 13px Grotesk caps
label. A live row: `--a-soft` ground, 3px `--a` left border, `LIVE · 11-POINT · RACK 3`.
**Remove the per-row Delete button** — it is one mis-tap from losing a match, and it doubles the
targets in the list. Delete moves to the match summary, behind the hold.

**Live strip.** `--a-soft` ground, `inset 0 1px 0 rgba(35,211,176,.3)`, an 8px `--a` dot,
`Live · Gareth 14–9 Melanie`, Resume as a 52px `--a` fill with `--a-ink` text, Watch as a 52px
outline.

**Tab bar.** Keep four tabs — Play / Ratings / Matches / More is right, and the cost of changing
it is not worth paying. Restyle: 60px, `--ink-0`, labels 13px Grotesk 700 `.1em` caps, selected
= `--a` text plus a 3px `--a` bar at the top inset to 30%, unselected `--faint`.

**Overlays.** `.overlay` ground `rgba(10,13,17,.94)`; `.card` `--ink-1`, 1px `--line`,
`--r-card`, inputs `--ink-2` with 1px `--line`. Drop `--pk-card` to `#121821` so the shared
people sheet matches.

---

## 5. Interaction and state rules

- **Turn** is signalled three ways at once and never fewer: the 4px turn bar, the filled score
  panel, the body ground tint. All three move together on `setTurn`, `.18s ease`.
- **Every state change a tap causes is visible without moving your eyes** — a claimed ball takes
  the shooter's colour, and the shooter's panel is that colour.
- **Colour never carries meaning alone.** The provisional badge says "provisional"; a foul button
  shows its count; the lead shows a number as well as a direction.
- **Hold to confirm, don't ask.** End match, delete match, delete player: 600ms hold with a
  rising fill. No confirm dialogs on the live screen.
- **Undo is always reachable and always the left-most control.** It never moves or resizes
  between games.
- **Transitions**: colour `.18s ease`, lead rail `.25s ease`, ball press `transform scale(.9)
  .09s`. Nothing else animates. All of it off under `prefers-reduced-motion`.
- **Haptics** as today: 16ms on turn change, 9ms on undo, `[12,40,12]` on a long-press clear,
  16ms on a completed hold.
- Keep `phone.keepAwake` and `phone.fullscreen` on the live screen; the darker ground is what
  pays for the always-on screen.

---

## 6. Suggested commit order

1. Tokens + type + `.apphead`, everything else left alone. One commit, whole-app change, easy to
   eyeball. `APP_VERSION` minor bump.
2. Live screen: turn bar, score head (drop `.cue`), lead rail, match bar, `--bs`. The big one.
3. Controls: sizes, hold-to-confirm End, and the same hold on the two Deletes.
4. Golden/Trad: foul row, column captions, win button treatment.
5. Setup: one settings card, segmented game picker, odds sentence in the footer.
6. Ratings / Matches / live strip / tab bar.
7. Self-hosted Grotesk + `sw.js` cache list, if you want the numerals.
8. The legibility pass in §7 — greys, sizes, targets. Safe to do first if you prefer.

Update `rack-it/SPEC.md` in the same commits where behaviour changes: §12.3 (win area),
§13.1 (tabs), §13.3 (setup), and add the hold-to-confirm rule.

---

## 7. Legibility — for eyes past 40, without an accessibility mode

Nothing in this section changes the layout. The greys move up, the smallest sizes go away, the
targets grow.

### Greys, re-cut

```css
--text:#E8EDF3;    /* 15.4:1 — unchanged */
--text-2:#C3CEDA;  /* 11.0:1 — idle score, chip text (was #7E8B99 at 3.3) */
--dim:#A8B6C4;     /*  8.0:1 — sub-lines, meta (was #90A0B2 at 6.2) */
--faint:#8D9BAA;   /*  5.6:1 — ranks, disabled (was #5E6B79 at 3.1) */
```

Floor: **7:1 for anything read while playing**, 4.5:1 for everything else — one notch above
WCAG AA across the board, which is roughly what a 45-year-old eye in a dim room needs to match a
25-year-old's AA. `--faint` is never used for body text again.

### Sizes and targets

- Smallest type in the app is **14px** tracked caps (was 13). Body stays 18.
- Score sub-lines 16 → **17px**, weight 700 when on a colour fill.
- Match-bar lead 15 → **17px**; score-head names 14 → **15px**.
- Turn bar 4 → **5px**; lead rail 6 → **8px**; centre notch to 40% white.
- Controls 72 → **76px**, Undo 104 wide; every other target ≥ **60px**.
- 14px between adjacent controls; nothing important within 12px of a screen edge.

### Rules

1. **No state is colour-only** — ball states differ in shape, the lead shows a number, a
   provisional rating says "provisional", a foul shows its count.
2. **No text below full opacity.** Dim means a dim colour, never `opacity` — opacity on text over
   a tinted ground is where contrast quietly dies.
3. **No text on a gradient or photo.**
4. **Respect the system text size** everywhere except the live screen: size type in `rem` off an
   18px root so OS font scaling works. The live screen stays fixed — it already carries the
   largest type in the app, and its layout is height-critical.
5. **Numerals are always tabular** (`font-variant-numeric: tabular-nums`) so a changing score
   doesn't shift on the page.

