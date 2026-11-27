---
name: editalbum
description: Edit an album of phone photos the way a hired editor would - cull, crop, colour-correct - and hand it back. Use when Kenny says "edit <album>", "edit my photos", drops a zip or folder of photos to be edited, or replies to an edited album with a change ("keep 7", "warmer on 3", "that one's too dark").
---

# Edit an album

You are the editor. You look at every photo and decide; `pocket-editor/engine.py` applies your
decisions to the full-resolution originals. You never edit pixels yourself and the originals
are never changed or deleted.

Everything runs from the repo root with `uv run pocket-editor/engine.py <command>` (uv fetches
the Python libraries itself). An album is a folder: `pocket-editor/photos/<album>/`, which is
gitignored. **No photo, sheet or thumbnail ever goes into git.**

## 1. Bring the photos in

Kenny gives a zip (a Google Photos download, usually in `~/Downloads`) or a folder.

```bash
uv run pocket-editor/engine.py inbox ~/Downloads/Photos-1-001.zip pocket-editor/photos/<album>
uv run pocket-editor/engine.py small pocket-editor/photos/<album>
```

Name the album after the event, in one lowercase word. `inbox` copies photos and videos and
skips everything else; `small` writes numbered 1100 px copies to `small/` for you to look at,
and for each video a strip of five frames (`v01_...jpg`).

## 2. Look at every photo

Read the files in `small/`. Read each one yourself; do not judge from a filename, and do not
hand this to a subagent that only reports back in words. A montage of six is fine for a first
pass, but look at a photo on its own before you give it a crop or face boxes.

## 3. Write `recipes.json`

One entry per file in `inbox/`, in filename order (which is time order):

```json
{ "album": "<album>", "photos": [
  { "file": "20261114_115046.jpg",
    "verdict": "great",
    "reason": "The two of you at the stage. Faces lifted against the bright background.",
    "crop": [0.0, 0.05, 1.0, 1.0],
    "straighten_deg": 0,
    "adjust": { "shadows": 0.35, "highlights": 0.25 },
    "faces": [ { "box": [0.27, 0.53, 0.47, 0.75], "lift": 0.2, "calm": 0.1 } ],
    "light": "day",
    "keep_colour": false,
    "share": true,
    "cover": true }
] }
```

Only `file`, `verdict` and `reason` are needed; leave out what you are not changing.

### The verdict

- **great**: you would show it to someone. About a third of a good album.
- **fine**: belongs in the album.
- **drop**: left out. Always with a reason Kenny can read in five words. Be firm: Kenny
  asked for firm. Drop blur, a blocked or turned-away subject, an accident, and every
  near-duplicate but the best one (eyes open, sharpest, cleanest edges). Set `duplicate_of`.
- **as-is**: not a photograph. A poster, a line-up, a ticket, a map, a screenshot. It goes into
  the album byte for byte: never cropped, never graded, never dropped as a duplicate.

Nothing is deleted: a dropped photo stays in `inbox/` and shows on the contact sheet, dimmed.

### The crop

`[x0, y0, x1, y1]` as fractions of the upright photo. Crop for a reason and not by habit:

- Crop to the people. Take out a stranger at the edge, empty ground, a thumb, a car bonnet.
- Keep hands, feet and gestures whole. Never cut at a wrist, an ankle or through a face.
- Keep the place when the place is the photo. A landscape usually needs no crop.
- `straighten_deg` only for a horizon or a building that is plainly tilted. Positive turns the
  picture anticlockwise.

### The corrections (`adjust`)

The album's style is added on top of these by the engine, so correct only what is wrong with
this photo. Most photos need two fields or none.

| Field | Range | Use it for |
|---|---|---|
| `ev` | -3..3 stops | The whole photo too dark or bright. Usually within ±0.3. |
| `shadows` | -1..1 | Faces or foreground dark against a bright background: 0.3 to 0.4. |
| `highlights` | -1..1 | A bright sky or sunlit ground to hold back: 0.15 to 0.3. |
| `temp` | -0.5..0.5 | Too blue (positive warms) or too orange. Rarely past ±0.05. |
| `tint`, `contrast`, `vibrance`, `clarity`, `saturation` | -1..1 | Seldom. The style sets these. |
| `glow`, `fade`, `grain` | 0..1 | Night only, and the night style sets them. |

- **Coloured light is the point of a dance floor.** Under stage lights, UV or neon set
  `"keep_colour": true` and do not correct it to neutral.
- **Night:** set `"light": "night"` for anything lit by lamps, stage lights or fire. The style
  has gentler night values, with grain and glow.

### Faces

For a face that is too dark, or flushed and red, mark it. The engine cannot find faces; you can.

- `box`: the face (or a sunburnt chest), as fractions of the **whole upright photo**, before
  any crop. Go from hairline to chin, ear to ear. It is feathered, so near enough is fine.
- `lift` (0..1): brighten. 0.1 is a nudge, 0.25 is a face in shade, past 0.4 looks lit by a torch.
- `calm` (0..1): take the red out. 0.2 for a flush, 0.4 for sunburn.

Mark only faces that need it. Lift a dark-skinned face in shade a little less than you think:
the aim is that it reads, not that it matches the person beside it.

### Share and cover

`"share": true` on the five to seven Kenny would post. `"cover": true` on one.

### Videos

Beside `"photos"`, a `"videos"` list. Read each strip in `small/` and give every clip an entry:

```json
"videos": [
  { "file": "20261113_150520.mp4", "light": "day", "reason": "The DJ, then round to the pool." },
  { "file": "20261113_204157.mp4", "light": "night", "trim_end": 1.5, "reason": "Walking in at dusk." },
  { "file": "20261112_173933.mp4", "verdict": "drop", "reason": "Removed by Kenny." }
]
```

- The render tidies every kept clip: the album style, steadying (daylight only), sound brought
  to one level, and the trims. It takes about 15 seconds a clip.
- `light`: `night` for anything lit by stage lights, lamps or fire, and for dusk that is mostly
  dark. Night clips keep their coloured light and are not steadied.
- `trim_start` and `trim_end` are seconds to cut from each end. `verdict` is `keep` (the
  default), `drop` or `as-is` (copied untouched).
- **Keep videos unless there is a reason.** You see five frames and hear nothing, so you cannot
  judge a clip the way you judge a photo. Drop one only if it is plainly an accident (the
  ground, a pocket, a few black frames).
- **You cannot tell what is private.** A voice message or a personal remark is in the sound.
  When Kenny says a clip or part of one is personal, drop or trim it, do a full render,
  and check it has gone from `done/videos/` before saying so.
- `"stabilise": false` if Kenny says a daylight clip looks swimmy; `"adjust"` works as for
  photos, though only `ev`, `temp`, `contrast` and `saturation` do much on video.

## 4. Render

```bash
uv run pocket-editor/engine.py render pocket-editor/photos/<album>
```

This checks the recipes, then writes `done/`: `edited/` (full resolution, EXIF dates kept),
`share-these/` with `cover.jpg` (copies of files in `edited/`, so the album is whole without
them), `videos/` (tidied, recording time kept), `contact-sheet.jpg` and `recipes.json`.
Photos and videos keep their dates, so Google Photos sorts them as the originals; an `as-is`
graphic with no date in it sorts by upload time, which is worth one line to Kenny. Look at the contact sheet and at three or four of the edits before you say
anything to Kenny. If one looks wrong, change its recipe and render again. Then consider
the AI edit for a few photos (its own section, below) before writing the notes.

## 5. Write `notes.md`

In the album folder, before the last render (the render copies it into `done/`). Short and
plain, to someone who is not a photographer:

- What you kept and dropped, in one line.
- Anything you were unsure of.
- **Two or three things that would have made the photos better**, drawn from what you saw:
  "four were backlit: turn so the sun is on the faces", "at night, use the flash when people
  are the subject". This is how the albums get better.

## 6. Hand it back

**Kenny looks at one thing: the contact sheet.** Kenny found comparing versions and
approving edits photo by photo exhausting. So never send comparison sheets, never ask "which do you prefer", and never list
what you did to each photo. Make the calls yourself and say them in `notes.md`.

Tell Kenny, in five lines or fewer: how many kept and dropped, where the contact sheet is,
anything you were unsure of, and the notes. Send it
to their phone only when they ask or have said to always do so:

```bash
rclone copy pocket-editor/photos/<album>/done kenny:Editor/Done/<album> --progress
```

(`kenny` is the rclone remote. It can only reach what rclone itself uploaded, so it cannot
fetch photos from Drive; that is why photos come in as a zip.)

## Overrules

Kenny replies by number, as on the contact sheet. Edit that recipe and render one photo:

```bash
uv run pocket-editor/engine.py render pocket-editor/photos/<album> --only 20261114_115046.jpg
```

| They say | You change |
|---|---|
| "keep 7" | verdict `drop` to `fine`, take out `duplicate_of`; then a full render |
| "drop 12" | verdict to `drop`, with their reason; then a full render |
| "warmer on 3" | `adjust.temp` +0.03 |
| "3 is too dark" | `adjust.ev` +0.2, or `shadows` +0.15 if only part of it is |
| "his face is red" | a `faces` box with `calm` 0.3 |
| "crop tighter on 5" | the crop, keeping hands and feet whole |
| "remove that video" / "cut the end of it" | `verdict: drop`, or `trim_end` in seconds; a full render |
| "too much" / "flat" | halve what you did / look again at `highlights` and `shadows` |

A change to a verdict needs a full render (without `--only`), which rebuilds `edited/` cleanly.
Do not argue with an overrule, and do not re-judge photos they did not mention.

## The AI edit, for a few photos

An image model (Codex, on Kenny's ChatGPT subscription) has better taste in light than the
sliders do: it balanced hard dappled sun and warmed a flat evening sky better than the engine,
and Kenny preferred it on three of four daylight photos. It also redraws what it is given:
on a night selfie it replaced both faces with invented ones. So its picture is never the
output. The engine takes its light, colour, contrast and richness and puts them on the
original's own pixels ("tone transfer"): full resolution, the real faces.

Use it on a few photos an album, chosen by you. Kenny is not asked.

**Which photos.** After the first render, pick from the kept daylight photos:

1. the cover and the `share` picks;
2. any other photo with light the sliders handle badly: faces in shade against a bright
   background, hard dappled sun, a flat, grey or hazy sky.

About a quarter of the kept photos, and no more than eight (each takes a minute or two).

**Never** on: night or coloured light (`light: night`, `keep_colour`), `as-is`, a drop, or a
photo that is already good. On night photos it strips the colour that is the point.

**Run it, then look.**

```bash
uv run pocket-editor/engine.py generate pocket-editor/photos/<album> <file> --via codex
uv run pocket-editor/engine.py fourway pocket-editor/photos/<album>
```

`generate` prints an **alignment** score; `fourway` writes a sheet per photo to `fourway/`:
original, engine, as generated, tone transfer. Read each sheet and choose between **engine** and
**tone transfer**. Never choose "as generated". Take tone transfer when it is plainly better,
and turn it down when:

- alignment is under 0.6 (the model reframed or redrew; its light would land in the wrong place);
- it changed the time of day or the weather into something that was not there (a little warmth
  in an evening sky is what Kenny likes; noon turned to sunset is not);
- skin has gone orange, grey or waxy;
- you cannot tell the two apart. Then the engine version stays: it matches the rest of the album.

**To use it**, replace that recipe's `adjust` with:

```json
"generative": { "file": "gen/<stem>/codex.png", "strength": 1.0 }
```

and render. A recipe with `generative` skips the album style (the model's edit is already a
finished look); crop and `faces` still apply, and `adjust` if you add any. Halve any face
`lift` you had: the model has already opened the faces. `strength` 0.7 if it is a bit much.
Say in `notes.md` which photos took the AI edit.

**A second opinion, for the cover only.** `--via codex agy` also asks Google's model. It did the
best job on one portrait, but it takes three minutes, and it cannot return anything wider than
16:9, so a wide phone photo comes back reframed (alignment will say so). Worth it for the cover
when the photo is 4:3 or 3:4; otherwise Codex alone.

`--look "..."` changes the brief sent to the model. The default is Kenny's own: Leica
colouring, gentle HDR, skies a little richer than life.

## The style

`pocket-editor/style.json` is the album style (Punch and olive): bright, a vivid sky, olive
trees, deep darks, skin left natural. What Kenny has said about looks, to judge by: likes
Leica colouring, gentle HDR and skies a little richer than life; dislikes washed-out or grey
skin, red faces, a dull sky, and anything pushed so far it looks unnatural. Kenny changes it by saying
so ("less contrast overall"); it is data, with no look built into the engine. `--style
style-muted-bronze.json` or `style-gentle-punch.json` renders another, and
`engine.py compare <album> --styles A.json B.json` puts them side by side.
