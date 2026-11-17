# Pocket Editor — working doc for the build sessions

The handover between Claude Code sessions, the `family-tree/PLAN.md` pattern: each session does
its list, ticks its boxes and writes its Handover note at the bottom.

**Start every session with:** "Read `pocket-editor/PLAN.md` and do Session N."
Sessions run on the office desktop (Arch Linux, Omarchy), on Opus. Session 0 was planning, in a
cloud session, and is done.

## Read first, every session

1. `CLAUDE.md` — the repo rules. Direct to `main`, small commits, `make verify` before a push.
2. `pocket-editor/SPEC.md` — what this is, every decision, the open questions. Update it in the
   same commit when a decision changes.
3. The **Handover** section at the bottom of this doc.

## Ground rules

- **No photos in this repo, ever.** Not an original, an edit, a contact sheet or a screenshot.
  `pocket-editor/photos/` is gitignored; tests make their own synthetic images.
- **Originals are never modified or deleted.** The engine reads from Inbox and writes elsewhere.
- **No secrets in the repo.** rclone's token and any image-model key live on the desktop.
- **The engine has tests**, and `make verify` runs them.
- **Don't build ahead.** Each session ends with something the owner can look at on the phone.

## Desktop setup (once, at the start of Session 1)

- [ ] Clone this repo on the desktop if it is not there.
- [x] Python libraries: none to install. `uv run pocket-editor/engine.py` fetches Pillow, numpy
      and pillow-heif itself (uv is on the desktop through mise). ffmpeg and libheif were there.
- [x] rclone v1.75.2, remote `kenny` (not `gdrive`), own client ID, scope `drive.file`.
- [ ] `rclone config`: one remote named `gdrive` for the owner's Google Drive. This opens a
      browser to sign in, so the owner does it at the desktop.
- [ ] In Drive, create `Editor/Inbox/` and `Editor/Done/`.
- [ ] Prove the round trip: share three photos from the phone into `Editor/Inbox/test/`,
      `rclone copy gdrive:Editor/Inbox/test pocket-editor/photos/test`, and check each file's
      dimensions and size against the phone's original (SPEC open question 1).
- [ ] Confirm the owner can reach the desktop's Claude Code session from the phone.

## Session 1 — the engine (done, 2026-11-17)

- [x] Python, Pillow and numpy, in `engine.py`; 18 tests in `test_engine.py`, run by `make verify`.
- [x] `validate()` for recipes; the fields are in SPEC.
- [x] `render`: crop, straighten, exposure, shadows and highlights, temperature, contrast,
      vibrance, clarity, then the style. EXIF orientation honoured, dates kept, JPEG out.
- [x] The halo: shadows and highlights work off an edge-aware mask (a guided filter), tested.
- [x] Contact sheet, `share-these/` with a cover, videos copied through, `as-is` for non-photos.
- [x] `style.json` (Gentle punch) and `style-muted-bronze.json`, each with a `night` block.
      Curves per channel, a master curve, colour bands, calibration, glow, fade, grain.
- [x] `compare`: original and each style side by side, one image per photo.
- [x] The first album (Summercamp Elemental: 20 photos, a poster, 17 videos) judged by hand in
      the session and rendered in both styles.
- [x] The owner's verdict: mostly Gentle punch, with parts of Muted bronze. Built as
      `style-punch-olive.json` (SPEC has the reasoning), with skin held back in vibrance.
- [x] The owner confirmed Punch and olive; it is `style.json`.
- [ ] HEIC: read path written, never run on a real file.

## Session 2 — the skill, and the generative proof (done, 2026-11-17)

- [x] `.claude/skills/editalbum/SKILL.md`, standing alone: bring in, look, write recipes,
      render, notes, hand back, overrules, the generative arm.
- [x] The judging rules in the skill: verdicts, firm drops, near-duplicates, crop rules, night
      and coloured light, faces, share and cover.
- [x] Overrules: a table of what the owner says and what changes; `render --only`.
- [x] `engine.py inbox`: a zip or a folder into an album.
- [x] Faces: `faces` in the recipe, `lift` and `calm`. (Moved up from "after Session 3".)
- [x] Generative arm: `generate` (Codex, or agy), `tone_transfer`, `alignment`, `fourway`.
      Five photos; findings and the rule in SPEC.
- [x] Cost recorded in SPEC: no money, 63 to 94 seconds a photo, Codex usage allowance.
- [x] The owner looked at the four-way sheets: "rare-ish", and preferred the AI edit on four of
      five. The rule, the stronger tone transfer and the skin fix that followed are in SPEC
      ("The owner's verdict on the sheets").

## Session 3 — the first real album: go or no-go

- [x] A first full-quality album (Elemental: 20 photos, a poster, 17 videos) edited, but by the
      session that built the tools, so it proves the engine and not the skill.
- [ ] A second album of 30 or more, with `/editalbum` run cold in a fresh session, from the
      phone. Time it. Note every place it needed help, and fix the skill.
- [ ] The owner judges the result against "would I have been happy paying a Fiverr editor for
      this?" Optionally send the same album to one for about £15 as a real comparison.
- [ ] Write the verdict in SPEC: keep building, or stop and use Fiverr.

## After that, one per session, in the order the owner picks

- [ ] Auto-straighten.
- [ ] Best-of-burst.
- [x] Video: the mechanical tidy with ffmpeg (2026-11-17; SPEC, Video).
- [ ] A phone page for swiping through the cull (this is when it becomes a Sidequests app:
      `/sidequest`, `index.html`, the landing page).
- [ ] Put the edited album back into Google Photos (SPEC open question 4).
- [ ] Publish the skill outside this repo.

## Handover

### Session 0 (planning, cloud session, 2026-11-17)

- Taste test on seven of the owner's photos, forwarded copies of mixed quality. The owner
  agreed with every cull verdict and every crop, and chose Gentle punch from eight looks.
- The test engine was a throwaway script in the session's scratch space and is gone. Its
  parameters and their meaning are in SPEC (the house style table and the recipe sketch).
  Units, for whoever rebuilds it: `ev` in stops; `temp` scales red up and blue down by that
  fraction; `shadows` and `highlights` are gains weighted by the cube of blurred darkness and
  brightness; `contrast` blends toward a smoothstep curve; `vibrance` boosts saturation in
  proportion to how unsaturated a pixel is; `clarity` adds back the difference from a
  large-radius blur of luminance.
- Per-photo corrections that worked: faces dark against a bright background took shadows
  +0.35 to +0.4 and highlights +0.2 to +0.3; the dance-floor shot took contrast only.
- Nothing is installed on the desktop yet. Start with Desktop setup.

### Session 0b (the look and the pixel editor, desktop, 2026-11-17, on Fable)

- No code. Two findings, both written into SPEC.
- **Muted bronze:** the style the owner likes, read from the Lightroom settings embedded in a
  reference gallery's JPEGs. A preset plus a per-photo exposure pass. To read such settings
  from any Lightroom export: the `crs:` attributes and `crs:ToneCurvePV2012*` lists in the
  file's XMP packet.
- **Codex edits pixels headlessly on the ChatGPT subscription.** Tested on a synthetic image
  only: it proves the plumbing, not that faces survive. Google's `agy` is installed (mise
  fetched antigravity-cli 1.5.10 when the shim first ran) and needs the owner to sign in.
- The desktop has ImageMagick but not Pillow or numpy yet. Desktop setup still stands.

### Session 1 (the engine, desktop, 2026-11-17, on Fable)

- Built and run on a real album; see the ticked list above. Commands:
  `uv run pocket-editor/engine.py small|render|compare <album>` (the docstring has the flags).
  An album is a folder with `inbox/` and `recipes.json`; this one is `photos/elemental/`.
- The album came as a Google Photos zip in `~/Downloads`, not through Drive. rclone is still
  not installed (sudo). Until it is, the results stay on the desktop.
- Judging was done by reading 1100 px copies (`small`), six to a sheet. 4 of 20 dropped: two
  near-duplicate sets and one bad frame. The recipes are in `photos/elemental/recipes.json`,
  which is a worked example for the Session 2 judging prompt.
- Muted bronze needed tuning away from the photographer's numbers (SPEC, "As shipped"). Expect
  the same for any look copied from raw-file settings.
- A full-resolution photo takes about 2 seconds to render; the compare sheets, 90 seconds an album.
- Known gaps: no face-aware brightening (shadows are lifted by region, so a dark face in a
  dark area gets the same lift as its surroundings); `keep_colour` still lets the style's
  colour bands mute coloured light at night; the videos are copied, which doubles their disk use.
- Next: the owner picks the style, then Session 2 (the skill and the generative proof). `agy`
  is signed in now, so both Codex and Google can be tried.

### Session 2 (the skill and the generative proof, desktop, 2026-11-17, on Fable)

- Done in the same sitting as Session 1; see the ticked list. 24 engine tests.
- The Elemental album is rendered in `photos/elemental/done/` in Punch and olive, with face
  boxes on the three people photos and `notes.md`. **Not uploaded**: the owner asked for the
  sessions first. To send it: `rclone copy pocket-editor/photos/elemental/done kenny:Editor/Done/elemental`.
- The skill has not been run cold. Its rules are what worked here, written down; the first
  fresh session to use it is the real test (Session 3).
- Face boxes were placed by eye from 1100 px copies and were good enough, because the mask is a
  soft oval reaching past the box. One lift was too strong at 0.2 and was eased to 0.12: start low.
- `codex exec` can sit a short while after saving its picture; `generate` waits up to ten
  minutes. A run of four is about five minutes.
- Known gaps: `keep_colour` still lets the style's colour bands mute coloured light a little at
  night; the videos are copied, which doubles their disk use; HEIC untested.
- After the owner's verdict the album was rendered again: four photos take the AI edit by tone
  transfer (1, 4 and 8 from Codex, 20 from agy), the rest the engine. Still not uploaded.
- A lesson for whoever tunes tone transfer: check it with numbers against the generated image
  (mean, 5th percentile, saturation), not only by eye. The eye said "close"; the 5th percentile
  said the blacks had not moved.

### Video tidy (desktop, 2026-11-17, on Fable)

- `render` now tidies the videos (SPEC, Video). 28 tests; the video ones make their own clips
  with ffmpeg and are skipped where there is no ffmpeg.
- The owner asked for one clip removed and the last 1.5 s of another cut, both personal
  messages. They are `"verdict": "drop"` and `"trim_end": 1.5` in the album's recipes. A
  dropped clip is removed from `done/videos/` on the next full render (tested), and the
  originals stay in `inbox/`, which never leaves the desktop.
- vid.stab aborts on any pixel format but yuv420p (one of the phone's clips is yuvj420p), so
  the filter chain converts first.
- Two settings were wrong on the first pass and found by measuring: steadying at 25 frames
  cropped about a sixth of the frame (now 13 frames, about 4%), and −16 LUFS made the clips
  5 dB quieter than the phone's own (now −14).
- Not done: watching a clip. Frames, durations, dates and loudness were checked; motion was not.

