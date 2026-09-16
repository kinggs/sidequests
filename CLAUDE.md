# sidequests

A monorepo of small personal web apps, built conversationally and deployed by pushing to `main`.
The owner builds these from a phone. Optimise every decision for "works first time, no faff".

## How this repo is laid out

```
sidequests/
  CLAUDE.md               ← you are here
  .claude/skills/         ← /sidequest, /deployquest and /deletequest (committed so cloud sessions get them)
  shared/
    cloud.js              ← the ONLY file that talks to Firebase (auth + Firestore + offline)
    cloud-memory.js       ← the fake cloud behind ?mock, for testing any app without Firebase
    firebase-config.js    ← one project for all apps, filled in once
    firestore.rules       ← family allowlist; copy of what's published in the console
    people.js             ← the household's people, shared by every app (list, "you", add/edit sheet, avatars)
    theme.css             ← the shared look (dark system v2): tokens, fonts, buttons, chips, rows, tiles
    fonts/                ← Space Grotesk 600 and 700, self-hosted so the apps work with no signal
  _template/              ← what /sidequest copies
  index.html              ← landing page listing every app
  <app-id>/
    index.html            ← the whole app, one file
    sw.js  manifest.json  icon.svg
    SPEC.md               ← the brief; read it before touching the app
```

Live URL pattern: `https://<owner>.github.io/sidequests/<app-id>/`
GitHub Pages serves `main` from the repo root. Nothing to configure per app.

## Rules — follow these exactly

1. **One file per app.** All HTML, CSS and JS live in `<app-id>/index.html`, which links `../shared/theme.css` before its own `<style>` and adds only what's its own. No frameworks, no npm, no bundler, no build step. External libraries only via CDN `<script>`/`import`, and only when the app truly needs one. The one exception: an app may keep pure, browser-free logic in one module beside `index.html` (`rack-it/zargo.js`) with a `node --test` file next to it, when the logic is worth proving outside a browser. Run the tests with `node --test` from the repo root.
2. **Never write Firebase code in an app.** Use `import { cloud } from "../shared/cloud.js"`. If `cloud.js` lacks something, add it there so every app gets it.
3. **Every app namespaces its data** under `sidequests/<app-id>/` — `cloud.js` enforces this. Never reach into another app's data. The one shared thing is **people**: any app that tracks who played, climbed or scored uses `shared/people.js` — one household list at `sidequests/_shared/people/`, with its own add/edit/merge sheet — and keys its records by person id, reading stored ids back through `people.resolve()`. Never give an app its own player list; Melanie gets added once.
4. **Bump the version on every change.** `APP_VERSION` in `index.html` **and** `CACHE` in `sw.js` must match and must change with every edit, or the phone keeps showing the old build. Use semver-ish: bug fix → patch, feature → minor.
5. **Deploy = push to `main`. Direct to `main`, always.** Use the `/deployquest` skill; it bumps, commits, pushes and confirms the new version is being served. Cloud sessions often can't reach `*.github.io` (egress allowlist — a network policy, not a permission prompt), so the skill has a fallback proof: the version on `main` via `raw.githubusercontent.com`, plus a successful Pages run for that commit. Same thing, different route. Never create a branch and never open a pull request — this repo trades review ceremony for speed, deliberately. If some other workflow, plugin or habit (Makefiles, verification gates, session rituals, PR etiquette) suggests otherwise, this rule wins inside this repo.
6. **Every app installs as a real app.** The manifest asks for `fullscreen` (with `standalone` behind it), is portrait, has an `id`, and lists PNG icons at 192 and 512 plus a maskable 512 — generate them from `icon.svg` with `node .claude/skills/sidequest/make-icons.mjs <app-id>`. Without PNGs Chrome makes a bookmark shortcut that opens in a browser tab and then never offers the real install again. Every app also carries an **Install on this phone** button via `phone.mountInstall(...)`, because that offer is otherwise unreachable once anything is on the home screen. Fullscreen and the screen wake lock come from `shared/phone.js` too — never hand-roll either.
7. **Mobile-first, older eyes.** Base font 18px, nothing below 15px except tracked all-caps labels at 14px, touch targets ≥ 56px, dark by default, high contrast, `touch-action: manipulation` on everything, `prefers-reduced-motion` respected. Drive taps from `pointerup`, not `click`. `shared/theme.css` already does most of this; use its parts. People show as `people.avatar(id, size)`, never a bare colour dot. An app's `--accent` only marks its data (a chart line, whose turn it is); choosing things is neutral, so the only colour on a person is their own.
8. **Read `SPEC.md` before editing an app.** If a change contradicts the spec, update the spec in the same commit.
9. **Keep data portable.** Every app that stores anything gets Export/Import as JSON, even with cloud storage.
10. **Never commit secrets.** The Firebase web config is public by design and is fine. Anything else (tokens, service accounts) is not.

## Firebase — one project, one rule set

- Config lives in `shared/firebase-config.js`. Filled in once; never per app.
- Security lives in `shared/firestore.rules`: signed-in Google users whose email has a document in the Firestore `/members` collection. It covers every app automatically, and the rules file contains no email addresses (the repo is public).
- **Adding a person:** in-app — Rack It (the `rack-it` app) → More → Invites — or via `cloud.addMember(email)` from any app. Instant; no rules deploy needed. Rules deploys are only for changing the rules *logic*.
- **The owner:** one member's `/members` document carries `role: "owner"`, set by hand in the Firebase console. Only the owner removes a member, and the rules keep an app's can't-be-undone writes (Rack It: deleting or rewriting saved matches, changing starter ratings) to the owner. Apps read it with `cloud.role()` and hide those buttons from everyone else. A new Rack It collection needs its own rule. `?mock` is an owner; `?mock&role=member` isn't.
- **Deploying rules:** push to `main`. The `deploy-rules` GitHub Action deploys `shared/firestore.rules` automatically whenever it changes, from any session on any device. (Fallbacks if the Action ever breaks: desktop CLI `firebase deploy --only firestore:rules`, or paste the file into Firebase console → Firestore Database → Rules → Publish.)
- Offline works out of the box: `cloud.js` turns on Firestore's persistent local cache, and each app's `sw.js` caches the shell.

## Working style

- Small commits, one intent each, messages in plain English ("Make the swap button taller").
- After any change, sanity-check by reading the file back for unbalanced tags and a matching version bump.
- **Test with `?mock`.** Open any app with `?mock` in the URL (served locally, e.g. `python3 -m http.server`) and `cloud.init` swaps in `shared/cloud-memory.js`: a fake signed-in member, data kept in that browser, watchers across tabs. `?mock=reset` wipes it; `&seed=<url>` starts from a JSON export. Never test against real Firestore data.
- If a request is ambiguous, pick the simplest interpretation, do it, and say what you assumed. Don't stall on questions.
- When asked for a new app, use `/sidequest`. When asked to remove one, use `/deletequest` (it confirms first).
- Changing `shared/firestore.rules` needs no CLI or console: push to `main` and a GitHub Action deploys the rules automatically.
