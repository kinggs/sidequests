---
name: sidequest
description: Scaffold, build and deploy a brand-new app in this repo from a plain-language description. Use this whenever the owner says they want a new app, tool, tracker, scorer, calculator, list, timer, or "something that does X" — even if they don't say the word "app". Also use it when they paste or describe a spec for something that doesn't have a folder here yet.
---

# New app

Turn a description into a live URL in one pass. Don't ask permission at each step; do the whole thing and report at the end.

## 1. Decide the identity

- `APP_ID`: short, lowercase, hyphenated, from the description (`rack-it`, `braai-timer`, `shopping-list`). Must not already exist as a folder.
- `APP_NAME`: human name for the header and home screen (`Rack It`).
- `NEEDS_CLOUD`: true if anything should survive a reload or be seen from another phone. Default true. If false, don't call `cloud.init`, but keep the import so it's one line to switch on later.

Only ask the owner something if the description is too thin to name the app.

## 2. Scaffold

```bash
cp -r _template "$APP_ID"
cd "$APP_ID"
sed -i "s/__APP_ID__/$APP_ID/g; s/__APP_NAME__/$APP_NAME/g; s/__APP_INITIAL__/${APP_NAME:0:1}/g" index.html sw.js manifest.json icon.svg
```

## 2b. Draw the icon, then make the PNGs

Edit `icon.svg` into something that reads at thumbnail size: a filled rounded rect in the
card colour (`#121821`), then one simple shape in the app's accent. No text, no fine lines.

Then make the PNGs the manifest points at — **this step is not optional**:

```bash
node .claude/skills/sidequest/make-icons.mjs "$APP_ID"
```

Chrome only builds a real installed app (fullscreen, no URL bar) when the manifest offers
PNG icons. With an SVG-only manifest it silently makes a bookmark shortcut that opens in a
browser tab, and once that shortcut is on the home screen it stops offering the real
install. If the script says Playwright isn't available, don't skip it quietly: say so in
the report so the owner knows the app will install as a shortcut until someone runs it.

## 3. Write `SPEC.md`

Capture the brief before building. Short is fine, but it must cover: purpose, who uses it, screens, data model (what gets stored and where under `sidequests/<APP_ID>/`), and anything explicitly out of scope. If the owner gave a detailed spec, save it verbatim and add a "Decisions" section for anything you had to assume.

## 4. Build

Replace the `<main>` and the `start()` function in `index.html` with the actual app. Follow every rule in `CLAUDE.md` — especially: one file, `cloud.js` for all storage, big touch targets, `pointerup` not `click`, version stamp in the footer.

The look comes from `shared/theme.css`, which the template already links. Pick the app's
`--accent` and use it only for the app's data. Build from the theme's parts before writing
new CSS: `.apphead`, `.lbl` headings, `.primary` and `.quiet` buttons, `.seg`, `.chips`
(with `people.avatar(id, 40)`), `.rows` card rows, `.tiles`, `.chart`, inputs, `.toast`,
`.note`. Big figures take `font-family: var(--grot)`.

Keep the phone kit the template gives you:

- `<div id="installHere"></div>` stays on the main screen, with its `phone.mountInstall(...)`.
  It hides itself once the app is installed, and it's the only way back to the install offer
  once anything is on the home screen.
- If the app has a screen you stare at while doing something else — scoring, timing, counting
  — hold the screen on for it: `phone.keepAwake(true)` on the way in, `false` on the way out.
  Don't hold it for a screen that's just a list.
- Call `phone.fullscreen()` from the tap that opens that screen. The manifest already covers
  the installed app; this is the fallback for a browser tab or an old shortcut.

Sanity-check the file: balanced tags, the module script has no top-level errors you can spot,
and storage goes through `cloud.js`. `localStorage` is fine for per-device scraps that would
be wrong to share — which game this phone was playing, a collapsed section — never for data.

## 5. Add it to the landing page

Insert a link in the root `index.html` list, keeping alphabetical order:

```html
<li><a href="./APP_ID/">APP_NAME</a></li>
```

## 6. Deploy

Run the `/deployquest` skill. It bumps nothing on a first build (version is already `0.1.0`), commits, pushes, and verifies the live URL.

## 7. Report

Reply with, in this order:
1. The live URL.
2. One line on how to install it: open the app and tap **Install on this phone**. Mention
   that an older shortcut for the same app has to be removed first, since Chrome won't offer
   the real install while one is on the home screen.
3. Any assumption you made that the owner might want to reverse.

Nothing else. No walkthrough of the code.
