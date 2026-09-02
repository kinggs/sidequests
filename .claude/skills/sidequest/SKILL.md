---
name: sidequest
description: Scaffold, build and deploy a brand-new app in this repo from a plain-language description. Use this whenever the owner says they want a new app, tool, tracker, scorer, calculator, list, timer, or "something that does X" — even if they don't say the word "app". Also use it when they paste or describe a spec for something that doesn't have a folder here yet.
---

# New app

Turn a description into a live URL in one pass. Don't ask permission at each step; do the whole thing and report at the end.

## 1. Decide the identity

- `APP_ID`: short, lowercase, hyphenated, from the description (`fair-nine`, `braai-timer`, `shopping-list`). Must not already exist as a folder.
- `APP_NAME`: human name for the header and home screen (`Fair Nine`).
- `NEEDS_CLOUD`: true if anything should survive a reload or be seen from another phone. Default true. If false, don't call `cloud.init`, but keep the import so it's one line to switch on later.

Only ask the owner something if the description is too thin to name the app.

## 2. Scaffold

```bash
cp -r _template "$APP_ID"
cd "$APP_ID"
sed -i "s/__APP_ID__/$APP_ID/g; s/__APP_NAME__/$APP_NAME/g; s/__APP_INITIAL__/${APP_NAME:0:1}/g" index.html sw.js manifest.json icon.svg
```

## 3. Write `SPEC.md`

Capture the brief before building. Short is fine, but it must cover: purpose, who uses it, screens, data model (what gets stored and where under `sidequests/<APP_ID>/`), and anything explicitly out of scope. If the owner gave a detailed spec, save it verbatim and add a "Decisions" section for anything you had to assume.

## 4. Build

Replace the `<main>` and the `start()` function in `index.html` with the actual app. Follow every rule in `CLAUDE.md` — especially: one file, `cloud.js` for all storage, big touch targets, `pointerup` not `click`, version stamp in the footer.

Sanity-check the file: balanced tags, no `localStorage` (use `cloud.js` or in-memory state), the module script has no top-level errors you can spot.

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
2. One line on how to add it to the home screen (Share → Add to Home Screen on iOS; ⋮ → Add to Home screen on Android).
3. Any assumption you made that the owner might want to reverse.

Nothing else. No walkthrough of the code.
