---
name: deletequest
description: Permanently delete an app from this repo and the live site. Use when the owner says to delete, remove, kill, or retire an app. Destructive — always confirm by name before touching anything.
---

# Delete a sidequest

Removes an app for good. This is the one skill that must **pause and confirm**: name the app
back to the owner and ask once — *"Delete `<app-id>` for good? Code and live URL go now; I'll
also tell you what happens to its cloud data."* Only proceed on a clear yes.

## 1. Check

- The folder `<app-id>/` exists and is an app (has `index.html`). Never delete `shared/`,
  `_template/`, `.claude/` or the repo root.
- If the owner's wording was ambiguous about which app, ask.

## 2. Remove the code

```bash
git rm -r "<app-id>"
```

Remove its `<li>` from the root `index.html` list. Commit (`Delete <app-id>`) and push `main`.

## 3. Verify it's gone

Poll `https://<owner>.github.io/sidequests/<app-id>/` until it returns 404 (Pages takes up to
a couple of minutes), and check the landing page no longer lists it.

## 4. Cloud data

The app's data lives under `sidequests/<app-id>/` in Firestore and does not vanish with the code.

- **Desktop CLI** (Firebase login available): offer to wipe it —
  ```bash
  firebase firestore:delete "sidequests/<app-id>" --recursive --force --project kennys-sidequests
  ```
- **Cloud/phone session** (no Firebase login): say the data remains — it's harmless, rules
  still protect it, and it means the app could be restored from git history with its data
  intact. It can be wiped later from the desktop with the command above.

Skip the wipe entirely if the owner hints they might want the app back.

## 5. Report

Two lines: the URL now 404s, and whether the cloud data was wiped or kept.
