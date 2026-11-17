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

## A second style to try: Muted bronze

On 2026-11-17 the owner pointed at a festival photographer's gallery and said "I really like
this editing style". The gallery's JPEGs carry their full Lightroom Classic settings in XMP, so
the look is known exactly and not guessed: 15 of 16 images sampled had them, and the settings
below were identical in all 15. It is a preset plus a per-photo exposure pass.

**The preset (the same on every photo):**

- **Flatten, then rebuild contrast with curves.** Highlights and Whites pulled far down,
  Shadows pushed far up, then an S-curve applied to red, green and blue alike: 46→19, 80→62,
  117→122, 179→200. That is deep darks and bright upper mids with the middle left alone.
- **Matte whites.** The master curve ends at 255→238 (202→194 on the way): nothing reaches pure
  white. This is most of the "film" feel.
- **Muted colour, selectively.** Saturation −10 to −20 with Vibrance +20. Then every hue band
  is desaturated: orange −27, red −25, magenta −27, purple −37, aqua −46, blue −15.
- **Bronze skin.** Orange luminance −30: skin goes darker and richer, not more saturated.
- **Olive foliage.** Green hue −21 (toward yellow), green luminance −35, green saturation −11
  to −68 depending on how much foliage is in the frame. Aqua hue +34 (toward blue).
- **Calibration:** red primary hue +25, sat −8; green primary hue +45, sat −15; blue primary
  hue −15, sat +15. The standard move that warms skin and pulls greens away from neon.
- Contrast +10, Clarity 0 to +14. No grain, no real vignette (−3), no split toning to speak of.

**Per photo (what the photographer's judgment adds):**

| Setting | Range seen | Note |
|---|---|---|
| Exposure | −0.45 to +1.00, mostly +0.35 to +0.70 | bright overall |
| Highlights | −18 to −100 | −80 or more in hard sun |
| Shadows | +72 to +100 | always high |
| White balance | 5200–7500 K by day | warm; daylight is about 5500 K |
| Green and yellow saturation | −1 to −68 | lower when trees fill the frame |
| Whites | −59 (−25 to −100 in three) | |

**Local work, on about a third:** a soft brush on faces (texture −35, clarity −15), a few
healed spots, and now and then a brush lifting a face by about a tenth of a stop.

**What will not carry over.** These are settings on raw files from a full-frame camera at
f/2.8. Two things in the gallery are the camera and not the edit: the blurred backgrounds, and
the room to lift shadows +100 without noise. A phone JPEG already has its shadows lifted and
its highlights pulled by the phone, so the flatten step must be far gentler; the curves, the
matte whites and the colour work carry over as they are.

**What the engine needs for it** (beyond the Gentle punch controls): a tone curve per channel
from control points, a master curve, hue/saturation/luminance per colour band, and the three
calibration primaries (a 3×3 matrix is close enough). `style.json` holds these, so a style is
data and the engine has no look built in.

Status: a candidate. Session 1 renders the test photos in both styles, side by side, and the
owner picks. The gallery's photos are the photographer's and are not kept: the numbers above
are the record.

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
- **Generative arm: Codex, on the owner's ChatGPT subscription.** Claude cannot edit pixels.
  Proven on the desktop on 2026-11-17 (codex-cli 0.169.0, signed in with ChatGPT, no API key):
  `codex exec --skip-git-repo-check --ephemeral -s workspace-write -C <dir> -i in.jpg -- "<prompt>"`
  edited a synthetic 3000×2000 image with its built-in `image_gen` tool in 44 seconds and
  saved a 1536×1024 PNG. Put `--` before the prompt, or `-i` swallows it. It costs Codex usage
  allowance and no money. The output is small, which does not matter: tone transfer takes only
  the colour and light from it and keeps the original's pixels.
- **Not yet tested: Google.** The owner also has a Gemini subscription. Antigravity CLI (`agy`,
  Google's newer agent CLI, on the desktop but not signed in) generates images itself on the
  subscription's quota; reports say a handful per five hours and 1024 px. Gemini CLI (0.68.0,
  signed in) was not tested. Session 2 runs the same five photos through `agy` once the owner
  has signed in, and keeps whichever holds faces better. An API key is the last resort.
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
| Style | Gentle punch, with Muted bronze as a candidate to compare in Session 1. |
| Generative model | Codex on the ChatGPT subscription first; Antigravity as the comparison. |
| Where it runs | The office desktop, Arch Linux, Claude Code. |
| Where the code lives | This folder. The skill in `.claude/skills/editalbum/`, written to stand alone so it can be published elsewhere later. |
| Phone app | Not in v1. Drive is the gallery, the chat is the remote. |

## Open questions

1. Does sharing from Google Photos to Drive send the full-quality original? Believed so; the
   first real run checks file sizes and dimensions.
2. Which image model for the generative arm: Codex works on the subscription (see Models and
   cost). Still open: whether it holds faces on real photos, and whether Google's does better.
3. Phone photo formats: the engine must read HEIC as well as JPEG.
4. Should the edited album go back into Google Photos automatically? The API allows an app to
   create and fill its own album. v1 leaves it in Drive.

## Later

Face-aware brightening (the biggest gap between the taste test and a human editor),
auto-straighten, best-of-burst, the video tidy, a phone page for swiping through the cull,
publishing the skill for use outside this repo.
