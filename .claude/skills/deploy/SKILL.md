---
name: deploy
description: Ship changes to the live site. Use this whenever the owner says deploy, publish, push, ship, "make it live", "update the app", or after finishing any change to an app in this repo — even if they didn't explicitly ask to deploy, finishing an edit means deploying it. Handles version bump, commit, push and verification that GitHub Pages is serving the new build.
---

# Deploy

GitHub Pages serves `main`. Deploying is a push, plus proof that it landed.

## 1. Work out which app changed

```bash
git status --porcelain
```

Each top-level folder with changes is one app. If only `shared/` changed, every app is affected but no app version needs bumping unless its behaviour changed.

## 2. Bump the version (skip on a brand-new app still at 0.1.0)

In each changed `<app-id>/index.html`, find `const APP_VERSION = "x.y.z"` and bump it: patch for fixes, minor for features. Then set `CACHE` in `<app-id>/sw.js` to `"<app-id>-vx.y.z"` with the same number. **Both must change together** or phones keep the stale build.

## 3. Commit and push

```bash
git add -A
git commit -m "<app-id>: <plain English summary of what changed>"
git push origin main
```

If push is rejected because `main` moved, `git pull --rebase origin main` and push again. Do not open a pull request unless the owner asks for one.

## 4. Verify it's live

Work out the URL: `https://<owner>.github.io/sidequests/<app-id>/` where `<owner>` comes from `git remote get-url origin`.

Poll until the served page contains the new version string (Pages usually takes 20–90 seconds):

```bash
for i in $(seq 1 12); do
  if curl -sL "$URL?nocache=$RANDOM" | grep -q "APP_VERSION = \"$NEW_VERSION\""; then echo LIVE; break; fi
  sleep 10
done
```

If it never appears after two minutes, say so plainly and suggest checking Settings → Pages in the repo. Don't claim it's live if you couldn't confirm it.

## 5. Report

One or two lines: the URL and the version now live. If the phone was already open on the app, remind the owner to pull-to-refresh or close and reopen the home-screen app, since the service worker fetches the new build on the next load.
