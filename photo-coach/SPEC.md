# Photo Coach — Spec

A personal photography coach for Kenny. After a walk through Cape Town, pick a handful of the
day's shots, get honest, specific feedback on each from an AI (ChatGPT, Claude or Gemini), and
keep that feedback so the patterns show: *what am I consistently getting wrong, and what should
I practise on the next walk?*

## The brief, as given

> At the end of a walk, when I move through town in Cape Town, upload some photos that I've
> taken. I want constructive, challenging feedback on specifically photography ideas, like
> composition, framing, leading lines — I'm vaguely aware of them but don't really understand
> them. I want a way to curate some shots, because I can't do it on all my photos, where I
> select some of my photos from Google Drive to be up for consideration. Then I want a prompt I
> can give to GPT, Claude or Gemini to say "guide me on this". I want to save that guidance as
> markdown documents so every now and again we can work through them and challenge me: "you're
> not so great at finding these views, try more of this". Including some extreme ideas: "this
> could have looked like this if the moon was in the background, or there was a leading line,
> or the foreground was different." It starts with a library of my photos, with individual
> prompts and responses from AIs, coaching and grading.

## Who uses it

Kenny, on his phone, signed in with Google. The data is behind the family allowlist like every
sidequest, but this app has no notion of "who" — it's one person's practice log.

## The loop

1. **Curate.** *Add photos* opens Android's own picker, which already browses Google Drive and
   Google Photos. Pick the few worth a look. They're filed under a walk ("Sea Point, 23 Sep").
   Each photo is shrunk on the phone (1400px long edge) before it's stored.
2. **Ask.** Open a photo, optionally jot what you were going for, pick a kind of feedback and
   tap **Send to an AI**. The phone's share sheet sends the photo *and* the prompt together to
   the ChatGPT, Claude or Gemini app. (Fallback: copy the prompt, save the photo.)
3. **Keep.** Paste the AI's reply back in. It's saved as a markdown note on that photo, with the
   AI's scores pulled out of it, plus an optional link back to the chat.
   - **Wrap-up.** The app can't read a ChatGPT/Claude/Gemini conversation (none of them let an
     app in). So after a longer back-and-forth, *Copy wrap-up prompt* goes into the same chat and
     asks for the whole conversation — critique, ideas, follow-ups, any images — as one
     standalone markdown note with SCORES and FOCUS for the original photo. That's saved as a
     "Wrap-up".
   - **Reimagined images.** When an AI makes an improved version, save it to the phone and *Add
     the AI's image*. Up to six per photo; a Yours / Idea 1 / Idea 2 switch above the photo
     compares them.
4. **Quick-grade a batch.** On or after a walk, tap *Quick-grade a batch*, tap 5–10 photos
   (numbered in order), *Send N to an AI*. The share sheet sends all the photos with one
   prompt asking for a loose grade per photo and a pick of the batch — mainly *what am I
   getting right*. Paste the reply; each photo gets a "Quick grade" note with its scores, the
   pick gets a ★, and the whole reply is kept on the Coach tab.
5. **Review.** Every few walks, the Coach tab builds one prompt from all the feedback since the
   last review. The reply — patterns, weak spots, a brief for the next walk — is saved as a
   markdown coaching review, and its challenges sit at the top of the app until the next one.

## Kinds of feedback (the prompts)

Every prompt tells the AI who Kenny is (a learner, phone camera, walking Cape Town, knows the
names of ideas but not how to use them), asks it to be challenging rather than polite, to name
each principle it uses and explain it in a sentence, and to end with two machine-readable lines:

```
SCORES: composition=6, light=5, subject=7, moment=4, creativity=5, overall=6
FOCUS: leading lines — one sentence on what to practise
```

- **Critique** — first read, what works, what doesn't (by principle), how to reshoot it on the
  spot (step left, crouch, wait for…), one thing to practise.
- **Wild ideas** — three to five bold reimaginings: the moon behind it, a different foreground,
  a reflection, another time of day, a radically different angle. Explained by principle.
- **Reimagine** — asks the AI to *make an image*: the same place, improved the way a better
  photographer would (or boldly: the moon behind it), then explain each change by principle and
  whether it's a shot Kenny could actually get. Ends with FOCUS only — no SCORES, since the
  image isn't his.
- **Grade me** — a short, strict grade against each skill with one line of evidence each.

The batch prompt asks for, per photo:

```
PHOTO 1: composition=6, light=5, subject=6, moment=4, creativity=5, overall=6 — one sentence
PICK: 3 — why it's the strongest
```

The prompt also carries the photo's note, the walk, and the current weakest skills and last
coaching brief, so the feedback is about Kenny's journey, not a stranger's photo.

## Screens

- **Library** — the current brief (from the latest review), *Add photos*, then photos grouped
  by walk as a thumbnail grid. A badge on a thumbnail = it has feedback (latest overall score,
  ★ if it was a batch's pick). *Quick-grade a batch* turns taps on the grid into picking.
- **Photo** — the photo large (with Yours / Idea switch when there are reimagined images), walk
  and note, *Send to an AI* (kind of feedback + share), *Bring it back* (wrap-up prompt, paste,
  chat link; the save button says what the reply is saved as — the last prompt copied),
  *Reimagined* images, and every saved reply rendered as markdown, newest first, with its scores.
  Delete a reply or the photo (tap twice).
- **Coach** — tiles (photos, with feedback, average overall), a bar per skill (average score,
  weakest first), *Build a review prompt*, past reviews as markdown, quick-grade batches, and
  **The ideas**: a
  plain-English glossary of the principles the prompts name.
- **More** — Export everything as JSON (photos included), export all feedback as one markdown
  file, import JSON, install.

## Data (Firestore, under `sidequests/photo-coach/`)

| Path | What |
|---|---|
| `photos/<id>` | `{ walk, takenAt, addedAt, note, thumb (data URL, ~400px), pick?, critiques: [{ id, kind, ai, reply (markdown), scores {skill: n}, focus, at, link?, batch?, pick? }], alts: [{ id, at, ai, thumb }] }` |
| `images/<id>` | `{ data }` — a 1400px JPEG as a data URL (a photo's own, or a reimagined one's under its alt id), kept apart so the library only loads thumbnails |
| `batches/<id>` | `{ at, ai, photoIds (in the order sent), reply, pick: { n, why } }` |
| `reviews/<id>` | `{ at, ai, reply (markdown), photoCount, since }` |

Skills scored: composition, light, subject, moment, creativity, and overall — 1 to 10.

## Out of scope (for now)

- Calling an AI directly from the app (needs a key and a server; the share sheet does it free).
- Reading the AI chat itself. The wrap-up prompt brings its content back instead.
- Browsing Google Drive inside the app (the Android picker already does).
- Reading EXIF / location. `takenAt` is the file's date.

## Decisions

- One person's log; no `shared/people.js`.
- Photos live in Firestore as shrunk JPEGs (well under the 1 MB document limit) rather than
  adding Firebase Storage to `cloud.js`. Fine for hundreds of photos; revisit if it grows.
- Accent is a Cape Town sky blue (`#6CC4FF`) and marks only data: scores, the feedback dot. (Not gold: amber already means "careful" in the shared theme.)
- Reply kinds are `critique`, `wild`, `reimagine`, `grade` (first prompts), `wrap` (wrap-up of a
  chat) and `quick` (one line from a batch). Every scored kind counts toward the skill averages,
  quick grades included.
- A batch in progress (which photos, whether it's been sent, a half-pasted reply) is kept in the
  phone's localStorage, because Android may close the app while you're in ChatGPT.
