# sidequests

A monorepo of small personal web apps, built conversationally and deployed by pushing to `main`.
The owner builds these from a phone. Optimise every decision for "works first time, no faff".

## How this repo is laid out

```
sidequests/
  CLAUDE.md               ← you are here
  .claude/skills/         ← /new-app and /deploy (committed so cloud sessions get them)
  shared/
    cloud.js              ← the ONLY file that talks to Firebase (auth + Firestore + offline)
    firebase-config.js    ← one project for all apps, filled in once
    firestore.rules       ← family allowlist; copy of what's published in the console
  _template/              ← what /new-app copies
  index.html              ← landing page listing every app
  <app-id>/
    index.html            ← the whole app, one file
    sw.js  manifest.json  icon.svg
    SPEC.md               ← the brief; read it before touching the app
```

Live URL pattern: `https://<owner>.github.io/sidequests/<app-id>/`
GitHub Pages serves `main` from the repo root. Nothing to configure per app.

## Rules — follow these exactly

1. **One file per app.** All HTML, CSS and JS live in `<app-id>/index.html`. No frameworks, no npm, no bundler, no build step. External libraries only via CDN `<script>`/`import`, and only when the app truly needs one.
2. **Never write Firebase code in an app.** Use `import { cloud } from "../shared/cloud.js"`. If `cloud.js` lacks something, add it there so every app gets it.
3. **Every app namespaces its data** under `sidequests/<app-id>/` — `cloud.js` enforces this. Never reach into another app's data.
4. **Bump the version on every change.** `APP_VERSION` in `index.html` **and** `CACHE` in `sw.js` must match and must change with every edit, or the phone keeps showing the old build. Use semver-ish: bug fix → patch, feature → minor.
5. **Deploy = push to `main`.** Use the `/deploy` skill; it bumps, commits, pushes and confirms the live site is serving the new version. Do not open pull requests unless asked.
6. **Mobile-first, older eyes.** Base font 18px, nothing below 15px, touch targets ≥ 56px, dark by default, high contrast, `touch-action: manipulation` on everything, `prefers-reduced-motion` respected. Drive taps from `pointerup`, not `click`.
7. **Read `SPEC.md` before editing an app.** If a change contradicts the spec, update the spec in the same commit.
8. **Keep data portable.** Every app that stores anything gets Export/Import as JSON, even with cloud storage.
9. **Never commit secrets.** The Firebase web config is public by design and is fine. Anything else (tokens, service accounts) is not.

## Firebase — one project, one rule set

- Config lives in `shared/firebase-config.js`. Filled in once; never per app.
- Security lives in `shared/firestore.rules`: signed-in Google users whose email is on the family list. It covers every app automatically.
- **Adding a person:** add their Gmail address to the list in `shared/firestore.rules`, commit, then tell the owner: *"Paste `shared/firestore.rules` into Firebase console → Firestore Database → Rules → Publish."* Sessions can't publish rules themselves; that one paste is the owner's job.
- Offline works out of the box: `cloud.js` turns on Firestore's persistent local cache, and each app's `sw.js` caches the shell.

## Working style

- Small commits, one intent each, messages in plain English ("Make the swap button taller").
- After any change, sanity-check by reading the file back for unbalanced tags and a matching version bump.
- If a request is ambiguous, pick the simplest interpretation, do it, and say what you assumed. Don't stall on questions.
- When asked for a new app, use `/new-app`.
