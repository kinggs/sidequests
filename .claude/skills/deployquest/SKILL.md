---
name: deployquest
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

**Try the live URL first.** Poll until the served page contains the new version string (Pages usually takes 20–90 seconds):

```bash
for i in $(seq 1 12); do
  if curl -sL "$URL?nocache=$RANDOM" | grep -q "APP_VERSION = \"$NEW_VERSION\""; then echo LIVE; break; fi
  sleep 10
done
```

### If the fetch is blocked, don't give up — verify the other way

Cloud sessions often sit behind an egress allowlist that doesn't include `*.github.io`. You'll see `http=000`, an empty body, or a proxy note saying `connect_rejected` / `403 to CONNECT`. That is a network policy, not a broken deploy, and no permission prompt will lift it — `curl` and `WebFetch` both go through the same gate.

Pages serves `main` from the repo root with no build step, so these two facts together prove the same thing:

**a. The new version is on `main`.** `raw.githubusercontent.com` is usually reachable when `github.io` isn't:

```bash
RAW=https://raw.githubusercontent.com/<owner>/sidequests/main/<app-id>
curl -s "$RAW/index.html" | grep -o 'APP_VERSION = "[0-9.]*"'
curl -s "$RAW/sw.js"      | grep -o '<app-id>-v[0-9.]*'
```

Both must show the new number, and they must match each other.

**b. Pages published that exact commit.** Find the `pages build and deployment` run whose `head_sha` is your commit and check it concluded `success` — use the GitHub MCP tools (`actions_list` with `list_workflow_runs`, then `actions_get` with `get_workflow_run`). A run that is still `queued` or `in_progress` isn't proof yet; re-check it before reporting.

If **a** and **b** both hold, say it's live. The only thing this misses that a direct fetch would catch is CDN cache propagation, which lands on the phone the same way either way — so mention that the phone may need a moment, not that the deploy is unverified.

### If neither route works

Say so plainly. Give the commit SHA, whether it's on `main`, and what the Pages run said. Suggest checking Settings → Pages in the repo. Don't claim it's live if you couldn't confirm it — and don't claim it failed either, if all you know is that you couldn't reach it.

## 5. Report

One or two lines: the URL and the version now live. If the phone was already open on the app, remind the owner to pull-to-refresh or close and reopen the home-screen app, since the service worker fetches the new build on the next load.
