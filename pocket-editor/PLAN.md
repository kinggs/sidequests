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
- [ ] `sudo pacman -S rclone python python-pillow python-numpy ffmpeg` and HEIC support
      (`python-pillow-heif`, from the AUR if not in the repos). Record what was installed.
- [ ] `rclone config`: one remote named `gdrive` for the owner's Google Drive. This opens a
      browser to sign in, so the owner does it at the desktop.
- [ ] In Drive, create `Editor/Inbox/` and `Editor/Done/`.
- [ ] Prove the round trip: share three photos from the phone into `Editor/Inbox/test/`,
      `rclone copy gdrive:Editor/Inbox/test pocket-editor/photos/test`, and check each file's
      dimensions and size against the phone's original (SPEC open question 1).
- [ ] Confirm the owner can reach the desktop's Claude Code session from the phone.

## Session 1 — the engine

The deterministic half. No model calls.

- [ ] Decide the language. Recommended: Python with Pillow and numpy (the taste test's engine
      was this, about 60 lines). If so, add its tests to `make verify`.
- [ ] `recipe`: settle the JSON fields in SPEC and write the validator.
- [ ] `engine`: apply one recipe to one full-resolution photo. Crop, straighten, exposure,
      shadows and highlights on a blurred-luminance mask, temperature, contrast, vibrance,
      clarity, then the album style from `style.json`. Read JPEG and HEIC, honour EXIF
      orientation, keep EXIF dates on the output, write JPEG at high quality.
- [ ] Fix the taste test's known flaw: lifting shadows across the frame left faint halos at
      strong settings. Use an edge-aware mask.
- [ ] `contact-sheet`: every photo with its verdict; dropped ones marked with the reason.
- [ ] Tests on synthetic images: a crop lands where the recipe says, a neutral recipe changes
      nothing, EXIF dates survive, `keep_colour` leaves white balance alone.
- [ ] Seed `style.json` with Gentle punch (the table in SPEC).
- [ ] Add what Muted bronze needs (SPEC, "A second style to try"): a curve per channel from
      control points, a master curve, hue/saturation/luminance per colour band, the calibration
      primaries as a matrix. Seed `style-muted-bronze.json` from SPEC's numbers, with the
      flatten step at about a third strength for phone JPEGs. Tests: an identity curve changes
      nothing; the master curve maps 255 to 238; a pure green pixel moves toward yellow and
      darkens.
- [ ] Render the test photos in both styles, side by side, for the owner to pick.

**Done when:** a hand-written `recipes.json` for the three test photos renders an `edited/`
folder and a contact sheet.

## Session 2 — the skill, and the generative proof

- [ ] `.claude/skills/editalbum/SKILL.md`: fetch with rclone, judge every photo on a downscaled
      copy, write `recipes.json`, render, write `notes.md`, fill `share-these/`, copy videos
      through, push `Done/<album>/` back. Written to stand alone (no reliance on this repo's
      other skills) so it can be published elsewhere later.
- [ ] The judging prompt: the three verdicts, firm on drops, near-duplicates, the crop rules
      the taste test approved (crop to the people, keep hands and gestures, don't correct
      coloured light), the house style in words.
- [ ] Overrules: "keep 7", "warmer on 3" edit the recipe and re-render one photo.
- [ ] **Generative arm.** Start with Codex (the command is in SPEC, Models and cost). The
      owner signs in to `agy` so the same photos can go through Google's model. Build the tone
      transfer (generated image's low frequencies over the original's detail) and the face
      drift check. On five photos with a real problem (blown sky, dark face, mixed light),
      produce a four-way sheet: original, engine, generated, tone-transferred.
- [ ] Record the per-photo cost of the generative arm in SPEC.

**Done when:** the owner has looked at the four-way sheets on the phone and said whether the
generative arm stays, and in which form.

## Session 3 — the first real album: go or no-go

- [ ] The owner shares a full-quality album of 30 or more photos, with some videos.
- [ ] Run `/editalbum` end to end from the phone. Time it. Note every place it needed help.
- [ ] The owner judges the result against "would I have been happy paying a Fiverr editor for
      this?" Optionally send the same album to one for about £15 as a real comparison.
- [ ] Write the verdict in SPEC: keep building, or stop and use Fiverr.

## After that, one per session, in the order the owner picks

- [ ] Face-aware brightening.
- [ ] Auto-straighten.
- [ ] Best-of-burst.
- [ ] Video: the mechanical tidy with ffmpeg.
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

