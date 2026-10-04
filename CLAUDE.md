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
    firestore.rules       ← one admin, everyone else an account; openApps() lists the open apps
    rules-check.mjs       ← cases the rules must pass; the deploy-rules Action runs them first
    smoke.mjs             ← opens every app as the owner, a stranger and signed out; fails on any error
    proofs/               ← the multi-tab ?mock proofs and the rules guard check (proofs/README.md)
    KIT.md  KIT-PLAN.md   ← the shared parts an app opts into; what's proposed next, and Parked
    CONNECT.md            ← Connect and shared games: the Game QR, seats, several phones, a scorer
    KIT-HISTORY.md        ← the kit's finished sessions (0–9) and every Handover note (10 too)
    people.js             ← Players: you, your friends and your guests (picker, avatars, That was them)
    DESIGN.md             ← the look (dark system v3): read it before building or touching a screen
    theme.css             ← every part DESIGN.md names, as CSS: tokens, ramp, buttons, rows, sheets
    ui.js                 ← tap, hold, toast, sheet, menu (a row's ⋯), account (your avatar's sheet), echo, presence
    fonts/                ← Space Grotesk 600 and 700, self-hosted so the apps work with no signal
    design/               ← the v3 design pack's reference page (open design/index.html in a browser)
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

1. **One file per app.** All HTML, CSS and JS live in `<app-id>/index.html`, which links `../shared/theme.css` before its own `<style>` and adds only what's its own. No frameworks, no npm, no bundler, no build step. External libraries only via CDN `<script>`/`import`, and only when the app truly needs one. A library a shared part depends on is vendored as one file in `shared/vendor/` instead, because each `sw.js` only caches same-origin files and a CDN copy fails offline. The one exception: an app may keep pure, browser-free logic in one module beside `index.html` (`rack-it/zargo.js`) with a `node --test` file next to it, when the logic is worth proving outside a browser. Run the tests with `node --test` from the repo root.
2. **Never write Firebase code in an app.** Use `import { cloud } from "../shared/cloud.js"`. If `cloud.js` lacks something, add it there so every app gets it.
3. **Every app namespaces its data** under `sidequests/<app-id>/` — `cloud.js` enforces this. Never reach into another app's data. Every app is open to anyone signed in, on the **open rule** (one line in `openApps()` in `shared/firestore.rules`, naming its record collections) or, for Rack It and Sessions Loyalty, in its own block. A record names its players: `players` (the ids `shared/people.js` gives: a uid, a guest's `g_<id>`, or an old household person's id), `names`, `uids` (the accounts among them) and `by` (`people.names(ids)`, `people.uidsOf(ids)`); only the accounts in `uids` reach it, the owner reaches everything, and every list carries the `uids` filter. Pick players from you, your Connect friends and your guests (`people.players()`, `people.pick`), and read stored ids back through `people.resolve()`. Never give an app its own player list.
4. **Bump the version on every change.** `APP_VERSION` in `index.html` **and** `CACHE` in `sw.js` must match and must change with every edit, or the phone keeps showing the old build. Use semver-ish: bug fix → patch, feature → minor.
5. **Deploy = push to `main`. Direct to `main`, always.** Use the `/deployquest` skill; it bumps, commits, pushes and confirms the new version is being served. Cloud sessions often can't reach `*.github.io` (egress allowlist — a network policy, not a permission prompt), so the skill has a fallback proof: the version on `main` via `raw.githubusercontent.com`, plus a successful Pages run for that commit. Same thing, different route. Never create a branch and never open a pull request — this repo trades review ceremony for speed, deliberately. If some other workflow, plugin or habit (Makefiles, verification gates, session rituals, PR etiquette) suggests otherwise, this rule wins inside this repo.
6. **Every app installs as a real app.** The manifest asks for `fullscreen` (with `standalone` behind it), is portrait, has an `id`, and lists PNG icons at 192 and 512 plus a maskable 512 — generate them from `icon.svg` with `node .claude/skills/sidequest/make-icons.mjs <app-id>`. Without PNGs Chrome makes a bookmark shortcut that opens in a browser tab and then never offers the real install again. Every app also offers **Install on this phone** in its account sheet (`phone.install()`), because that offer is otherwise unreachable once anything is on the home screen. Fullscreen and the screen wake lock come from `shared/phone.js` too — never hand-roll either.
7. **Mobile-first, older eyes: follow `shared/DESIGN.md`.** Base font 18px, nothing below 15px except tracked all-caps labels at 14px, touch targets ≥ 60px (the main button 76px), dark only, high contrast, `prefers-reduced-motion` respected. Taps come off `pointerup` (`ui.tap`); nothing destructive is a plain tap (`ui.hold`). Build from the theme's parts and `shared/ui.js`, and write CSS only for the app's own object. People show as `people.avatar(id, size)`, never a bare colour dot. An app takes two accents from the ramp: `--accent` only marks its data (a score, whose turn it is); choosing things is neutral, so the only colour on a person is their own.
8. **Read `SPEC.md` before editing an app.** If a change contradicts the spec, update the spec in the same commit.
9. **Keep data portable.** Every app that stores anything gets Export/Import as JSON, even with cloud storage.
10. **Never commit secrets.** The Firebase web config is public by design and is fine. Anything else (tokens, service accounts) is not.

## Firebase — one project, one rule set

- Config lives in `shared/firebase-config.js`. Filled in once; never per app.
- Security lives in `shared/firestore.rules`: **one admin, and everyone else an account.** Anyone signed in with Google uses every app, and reaches only their own profile, friends and guests, and the records they're in. The rules file contains no email addresses (the repo is public). Nobody is invited: there's no allowlist.
- **The owner:** the one `/members` document with `role: "owner"`, set by hand in the Firebase console. The one admin: sees every record in every app, keeps the household people list (`sidequests/_shared/people/`, read only by Rack It's admin path), and alone does the can't-be-undone writes (Rack It: deleting or rewriting saved matches, changing starter ratings). Apps read it with `cloud.role()` and hide those buttons from everyone else. Any other `/members` document is left over from the household tier and means nothing. A new Rack It collection needs its own rule. `?mock` is the owner; `?mock&as=<name>` is anyone else.
- **Deploying rules:** push to `main`. The `deploy-rules` GitHub Action deploys `shared/firestore.rules` automatically whenever it changes, from any session on any device. (Fallbacks if the Action ever breaks: desktop CLI `firebase deploy --only firestore:rules`, or paste the file into Firebase console → Firestore Database → Rules → Publish.)
- **Beyond the family (done, Session 9).** Sidequests is open to people outside the household: pool friends, staff at the venues, guests without a phone. Shared features are a kit of parts each app opts into (`shared/KIT.md`; how it got here: `shared/KIT-HISTORY.md`). Accounts are keyed by `uid`, with data in top-level `/profiles`, `/invites` and `/friendships`, never under `/sidequests/`. Friends connect with My QR; a game on several phones is `shared/CONNECT.md`. **Sessions Loyalty has a staff list** (`staff/<uid>`, the owner appoints): staff see every card, everyone else only their own. No paid plan and no server code (decided 2026-10-01). Read `shared/KIT.md` before touching sign-in, `people.js` or the rules.
- Offline works out of the box: `cloud.js` turns on Firestore's persistent local cache, and each app's `sw.js` caches the shell.

## Working style

- Small commits, one intent each, messages in plain English ("Make the swap button taller").
- After any change, sanity-check by reading the file back for unbalanced tags and a matching version bump.
- **Test with `?mock`.** Open any app with `?mock` in the URL (served locally, e.g. `python3 -m http.server`) and `cloud.init` swaps in `shared/cloud-memory.js`: the owner, signed in, data kept in that browser, watchers across tabs. `?mock=reset` wipes it; `&seed=<url>` starts from a JSON export. `&as=<name>` makes that tab a different account, with what anyone signed in gets in production: the records they're in (`&as=` alone goes back). Never test against real Firestore data.
- **`make verify`** runs `node --test` then the smoke test: the gate before any push.
- **Smoke test after a `shared/` change:** `node shared/smoke.mjs` opens every app as the owner and as `?mock&as=stranger` and fails on any page error or `console.error`. It needs Playwright; without it, it exits 2 and `/deployquest` reports the skip.
- **Rules are tested before they deploy.** `shared/rules-check.mjs` holds the cases; the `deploy-rules` Action runs them on the emulator, and a failing case stops the deploy. A rules change adds its cases first.
- If a request is ambiguous, pick the simplest interpretation, do it, and say what you assumed. Don't stall on questions.
- When asked for a new app, use `/sidequest`. When asked to remove one, use `/deletequest` (it confirms first).
- Changing `shared/firestore.rules` needs no CLI or console: push to `main` and a GitHub Action checks and deploys the rules automatically.
