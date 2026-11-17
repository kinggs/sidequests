# Pocket Editor — Spec

An editor in the owner's pocket: hand it an album of phone photos from an event, get back the
same album culled, cropped and colour-corrected, the way a hired editor would return it. The
alternative it has to beat is paying someone on Fiverr about £15–50 an album and waiting a day
or two.

Status: **designed, not built.** Decisions below were made in a planning conversation on
2026-11-17, with a taste test on seven real photos. `PLAN.md` holds the build sessions.

## The brief, as given

> I'm not a good photographer. I'm just snapping pics on my phone. I want to send an album to
> something and get a magical album back that's edited: cropped better, colour corrected, HDR
> corrected, whatever we can get the AI to do. It applies some judgment, which is why Lightroom
> with a preset doesn't do it. The closest thing is: I send this to a guy on Fiverr and say,
> please edit this album for me.

## Who uses it, and how often

The owner, about once a month, after an event (a festival, a trip). Roughly 12 albums a year.
That volume justifies a small tool and not a polished product.

## What it is, and is not

It is a **desktop tool with a skill**, run by Claude Code on the office desktop (Arch Linux,
Omarchy) and steered from the phone. It is not a Sidequests web app yet: there is no
`index.html`, nothing is deployed to Pages, and the smoke test skips this folder. A phone page
for reviewing may come later (see Later).

**No photos ever enter this repo.** The repo is public and the photos are of real people.
Working files live in `pocket-editor/photos/` (gitignored) or outside the repo. Tests use
synthetic images only.

## The flow

1. **Phone:** select photos (and videos) in Google Photos, share them to a Google Drive folder
   `Editor/Inbox/<album>/`.
2. **Trigger:** from the phone, tell the Claude Code session on the desktop "edit `<album>`"
   (the `/editalbum <album>` skill).
3. **Fetch:** the skill pulls that Drive folder down with `rclone copy`. No sync daemon, no
   Tailscale for the files.
4. **Judge:** Claude looks at every photo (a downscaled copy) and writes one recipe per photo:
   a verdict, a crop, and the corrections.
5. **Render:** the engine applies each recipe to the full-resolution original.
6. **Return:** the skill pushes `Editor/Done/<album>/` back to Drive with `rclone copy`. The
   owner opens it on the phone.
7. **Overrule:** the owner replies in the same chat ("keep number 7", "that one's too warm");
   the skill edits the recipe and re-renders that photo.

## What comes back

```
Editor/Done/<album>/
  edited/          every kept photo, full resolution, EXIF dates preserved (dropped ones stay in Inbox)
  share-these/     the top five or so, and a cover
  dropped/         nothing; dropped photos stay only in Inbox (never deleted)
  videos/          passed through untouched (v1)
  contact-sheet.jpg  every photo with its verdict; dropped ones marked, with the reason
  notes.md         the editor's notes (see below)
  recipes.json     what was done to each photo, so any edit can be redone or adjusted
```

## The two engines

The central decision. A generative image model redraws every pixel: it can subtly change
faces, invent detail and return a smaller image. So the default path never lets a model touch
pixels.

**1. Judgment plus engine (the default).** A vision model decides; a deterministic script
applies. Faces and resolution are untouched. Proven in the taste test.

**2. Light-touch generative (to be proven in Session 2).** The owner wants this tested from the
start, with the emphasis on *light touch*. It is for what sliders cannot do: a sky the camera
blew out, a face lost in shadow, mixed light. Guardrails, all of them:

- The prompt forbids changing composition, people, faces, objects or adding anything.
- **Tone transfer, not replacement:** take only the colour and light from the generated image
  (its low frequencies) and lay them over the original's own detail. The original's pixels,
  and so its faces and resolution, survive. The plain generated image is kept beside it for
  comparison during the proof, and is never the default output.
- Faces are compared against the original; if the result drifts, that photo falls back to
  engine 1.
- It is opt-in per photo: the judge asks for it only when the recipe says engine 1 cannot fix
  the problem.

Removing people or objects, replacing skies and stylised looks are out of scope.

## The recipe

One JSON object per photo, written by the judge, applied by the engine. A sketch; the build
session settles the exact fields:

```json
{
  "file": "20261114_163012.jpg",
  "verdict": "great | fine | drop",
  "reason": "Best of the set: faces and stage both readable.",
  "duplicate_of": null,
  "crop": [0.0, 0.04, 1.0, 1.0],
  "straighten_deg": 0,
  "adjust": { "ev": 0.1, "shadows": 0.4, "highlights": 0.25, "temp": 0.02, "contrast": 0 },
  "keep_colour": false,
  "generative": null,
  "share": true
}
```

`crop` is fractions of the frame (x0, y0, x1, y1). `keep_colour` tells the engine not to
correct white balance, for scenes where coloured light is the point (a dance floor).

## The cull

Every photo gets **great**, **fine** or **drop**, with a one-line reason. Dropped photos are
left out of `edited/` by default and shown on the contact sheet, so the owner can overrule.
Nothing is ever deleted. Near-duplicates collapse to the best one (eyes open, sharpest).
In the taste test the owner agreed with all seven verdicts and wants the "suggest dropping"
call made firmly.

## The house style: Gentle punch

Chosen in the taste test from eight candidates. In words: a moderate contrast lift, colours a
little more vivid without neon skin, slight local clarity, skies pulled down and shadows
lifted (the HDR-style balance). Rejected: the full-strength punchy and moody looks (too
harsh), soft film (too washed), heavy warmth.

Starting values, as deltas on top of each photo's own corrections, in the test engine's units:

| contrast | vibrance | clarity | highlights | shadows |
|---|---|---|---|---|
| +0.25 | +0.22 | +0.20 | +0.15 (pull down) | +0.10 (lift) |

One grade per album: night and day shots are treated differently but feel like one set. The
style lives in `style.json` so it can drift with the owner's taste.

## Editor's notes

`notes.md` ends each album with two or three plain lines on what would have made the photos
better ("four shots were backlit: turn so the sun is on faces"). The owner is not a
photographer and this is how the albums improve. Photo Coach (`photo-coach/`) covers
deliberate practice; these notes are the passing remark from the editor, and may feed it later.

## Video

- **v1: pass through.** Videos are copied to `Done/<album>/videos/` untouched.
- **Next: mechanical tidy** with ffmpeg on the desktop: the same grade, stabilise, even out
  audio. No model credits.
- **Later: judged trims** (a few sampled frames per clip) and a **highlights reel**.
- **Never: generative video editing.** That is where the cost is.

## Models and cost

- **Judging:** the frontier model in the Claude Code session on the desktop, on the owner's
  subscription. About nothing per album beyond usage limits.
- **Building:** Opus, on the desktop.
- **Generative arm:** needs an image-editing model, which Claude is not. Session 2 picks one
  and checks current prices; expect pennies to tens of pence per photo, and only on the few
  photos that ask for it. Whether Codex on a subscription can do this headlessly is unknown;
  otherwise it is an API key kept in the desktop's environment, never in the repo.
- **Codex is not used for judging.** One engine is simpler to keep working.

## Decisions

| Question | Decision |
|---|---|
| Build or Fiverr | Build, small. Fiverr stays the benchmark and the fallback. |
| What "edited" means | Crop, light, colour, HDR-style balance. No removing people. |
| Pixels | Engine by default; generative only light touch, with tone transfer. |
| Cull | Yes, firm, three verdicts, nothing deleted. |
| Review | The cull, on a contact sheet. No per-photo approval of edits. |
| Crops | The judge's crops were approved as they were. |
| Input | A Drive folder. No Google Photos link (the API no longer allows reading an album). |
| Style | Gentle punch. |
| Where it runs | The office desktop, Arch Linux, Claude Code. |
| Where the code lives | This folder. The skill in `.claude/skills/editalbum/`, written to stand alone so it can be published elsewhere later. |
| Phone app | Not in v1. Drive is the gallery, the chat is the remote. |

## Open questions

1. Does sharing from Google Photos to Drive send the full-quality original? Believed so; the
   first real run checks file sizes and dimensions.
2. Which image model for the generative arm, and how it is paid for.
3. Phone photo formats: the engine must read HEIC as well as JPEG.
4. Should the edited album go back into Google Photos automatically? The API allows an app to
   create and fill its own album. v1 leaves it in Drive.

## Later

Face-aware brightening (the biggest gap between the taste test and a human editor),
auto-straighten, best-of-burst, the video tidy, a phone page for swiping through the cull,
publishing the skill for use outside this repo.
