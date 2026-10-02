# Sidequests — the look (dark system v3, "warm ink")

The one page an agent reads before building or touching a screen. `shared/theme.css` holds every
rule below as CSS; `shared/ui.js` holds the five behaviours. If you find yourself writing CSS for
something on this page, stop: it's already there.

## 1. The deal

A sidequest is one `index.html` that links `../shared/theme.css`, imports `ui` from
`../shared/ui.js`, sets **two accents**, and writes CSS only for the thing that is its own: the
balls, the dice, the board. Home, setup, lists, stats, sheets, sign-in and More come from the theme
and look the same in every app. That sameness is the point: the owner's household should never
have to learn an app.

```html
<link rel="stylesheet" href="../shared/theme.css">
<style>
  :root{ --accent:var(--amber); --accent-ink:var(--amber-ink); --accent-soft:var(--amber-soft);
         --accent-2:var(--sky);  --accent-2-ink:var(--sky-ink);  --accent-2-soft:var(--sky-soft) }
  /* only what is this app's own below */
</style>
```

## 2. Colour — four rules, and they are the whole system

1. **A person's colour only ever means that person.** Their avatar ring (`people.avatar`). Never a
   bare dot, never reused for anything else.
2. **`--accent` only ever marks the app's data.** A score, a send, whose turn it is, the line on a
   chart. Choosing things is neutral: the chosen chip, segment or grade is a light fill with dark
   text. Primary buttons are the same light fill. **Never colour a button with the accent.**
3. **`--accent-2` marks the app's second state.** Projecting vs sent, side B, shot vs brain. If the
   app has no second state, don't set it.
4. **`--warn` only ever means careful or not finished.** A hold in progress, a provisional rating,
   something waiting on someone else. Never success, never decoration.

Pick both accents from the ramp. Same lightness and chroma, pre-cut with an ink (text on it) and a
soft (a tinted ground for a live row or strip):

| name | accent | use it for |
| --- | --- | --- |
| teal | `--teal` | Rack It (side A) |
| green | `--green` | free |
| lime | `--lime` | Zombie Dice |
| amber | `--amber` | Bloc 11 |
| coral | `--coral` | free (Zombie Dice's second: a shot) |
| pink | `--pink` | Photo Coach |
| lilac | `--lilac` | Rack It's second (side B) |
| sky | `--sky` | Around the Clock (Bloc 11's second: projecting) |

A new app takes a free one. Two apps never share a first accent: the launcher lines them up.

Greys are warm (`--ink-0/1/2`, `--text`, `--text-2`, `--dim`, `--faint`) and never dimmed with
opacity. `--faint` is for ranks and disabled, never for body text. Floor is 7:1 for anything read
while playing, 4.5:1 for everything else.

## 3. Type — figures are the hero

Two faces. The system face for anything you **read**; Space Grotesk 600/700 for anything you
**glance at**: scores, grades, counts, caps labels, titles.

| role | class | size |
| --- | --- | --- |
| the number the screen is about | `.fig-xl` | 72px |
| a player's score, a tile figure | `.fig-lg` / `.tile b` | 44px / 40px |
| a figure in a list row | `.rows .fig` | 30px |
| page title | `.apphead h1` | 28px |
| body | — | 18px, line 1.5 |
| caps label | `.lbl` | 14px, tracked. The only type under 15px. |

Read screens are in `rem` off an 18px root, so a phone set to huge text gets huge text, and the
layout must flow (no fixed heights on anything holding text). A **play screen** may be in `px` and
fixed to the screen height, because the whole game has to stay on one screen. That is the only
place the phone's text size is ignored.

## 4. The screens an app has

Every app is made of these, and only these. Each is a theme part. (Where `shared/KIT-PLAN.md`
overrides the design pack, it wins: the avatar is your profile's, `people.avatar`, not Google's
photo.)

- **Home** (`main.page`): `.apphead` with the title and your avatar (`.me`); sections headed by
  `.lbl.sect`; the first section is the thing you came to do (pick players, pick a grade, add a
  photo) ending in one `.primary.big` button. Then Progress, Recent, People, and the data row
  (Export / Import, Install).
- **Setup** is Home's first section. Choices are `.chips` (people), `.seg` (two to four options) or
  `.grid` (numbers). Never a dropdown for fewer than six.
- **Play** (the app's own): `.pl` panels across the top, the `.stage` in the middle, `.controls`
  at the bottom with **Undo always left**, the primary action widest, and the careful one (End,
  Abandon) on the right **behind a hold**. `phone.keepAwake(true)` on the way in.
- **A moment** (`.done`): rack complete, pass the phone, you won. Full-screen, one primary button.
- **A row's sheet** (`ui.menu`): a card row carries at most one action, a `⋯` (`.rows .more`) that
  opens a bottom sheet with what you can do to it. **Delete lives in the sheet, behind a hold.**
  An item with its own page puts the hold at the bottom of that page instead.
- **The account sheet** (`ui.account`): tapping your avatar shows your name, Sign out, and anything
  the app adds: My QR, Friends and Profile in an app with Connect, then Export, Import and Install
  (`phone.mountInstall`). There is no Sign out button on the page.
- **Tabs** (`.tabbar`) only when an app has four or more screens. Otherwise Home scrolls.

## 5. Touch and motion

- Every target is **60px** or more (`--tap`); the one you came for is **76px** (`--tap-lg`).
  14px between adjacent controls; nothing important within 12px of an edge.
- Taps come off `pointerup` (`ui.tap`), so a scroll never fires one.
- **Nothing destructive is a plain tap.** `ui.hold`: 600ms with a fill rising from the bottom and a
  buzz when it lands; let go early to cancel. No "Sure?" buttons, no `confirm()`.
- Motion is two things: sheets and toasts **rise** (`--snap`, 240ms) and overlays **fade** (160ms).
  Buttons scale to .98 on press. The game object may animate as it likes (dice tumble). All of it
  is off under `prefers-reduced-motion`.
- Haptics: 16ms for a turn change or a landed hold, 9ms for undo, a triple for a shot or a bust.

## 6. Words

Plain English, as the owner talks: "Nothing logged yet", "Hold to delete", "Carry on". Sentence
case everywhere except `.lbl`. Numbers are tabular. A state is never colour alone: say
"provisional", show the count, write "live".

## 7. Checklist before you push

- [ ] `theme.css` linked first; the app's `<style>` holds only its own object.
- [ ] Two accents from the ramp, no hex in the app.
- [ ] No `.sect`, `.row`, `.big`, `.card`, `.userbtn`, `tap()`, `armed()`, `toast()` in the app.
- [ ] No ✕ on rows. `⋯` → sheet → hold.
- [ ] Avatar in the header; Sign out in its sheet.
- [ ] Figures in Grotesk, big. Caps labels 14px, nothing else under 15px.
- [ ] Targets 60px; the main button 76px.
- [ ] Read screens in rem; the play screen may be px.
- [ ] `APP_VERSION` and `CACHE` bumped.
