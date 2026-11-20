# The look: Loom

**Status:** chosen by the owner on 2026-11-19 (D36) from three directions drawn in Claude
Design to `PROMPT.md`. Nothing here is built. ⚠ marks a proposal the owner has not ruled on.

The idea in one line: a pattern is a cloth. The grid is a tight woven swatch, the dividers are
stitches, the sliders are shuttles on a thread, and the display weaves as the pattern plays.

The owner's brief for it: dark, high contrast, easy to read with weak eyes.

## What is in this folder

| File | What it is |
|---|---|
| `PROMPT.md` | The prompt the three directions were drawn from |
| `loom/states.html` | Every key state, and the same states with the colour taken out |
| `loom/rack.html` | The Rack panel at 6 px per mm: write on, playing |
| `loom/rack-sound.html` | The same panel: write off, sound latched |
| `loom/phone.html` | The phone layout, 390 by 844 |
| `loom/frames.html` | Three frames of the display |
| `loom/tokens.html` | The colours and type, as swatches |
| `directions/` | The three directions the owner chose between. A and C were not taken |
| `panel.svg` | The static Rack panel, flat, in mm. Made by `make_panel.py` |
| `make_panel.py` | Draws `panel.svg` and prints the widget positions |

The `.html` files are pictures, not code to build from: open one in a browser. They are the
Claude Design artboards with the canvas wrapper removed. They load the typeface from Google
Fonts and fall back to the system monospace offline.

## Tokens

| Token | Value | Used for |
|---|---|---|
| `loom/ground` | `#14131F` | The body |
| `loom/tile` | `#2B2942` | An unlit key |
| `loom/display` | `#0B0A12` | The display glass |
| `loom/table` | `#07060C` | The phone's background; jack holes |
| `loom/ecru` | `#F2E8D0` | A lit field; all lettering |
| `loom/white` | `#FFFFFF` | A key that is sounding |
| `loom/ochre` | `#F0B429` | The playhead frame; the pattern key |
| `loom/madder` | `#F0654A` | The sound key |
| `loom/sky` | `#8FAAF7` | The bpm key |
| `loom/lilac` | `#C9C2DD` | Secondary lettering |
| `loom/thread` | `#6E6A92` | Unlit threads and step marks. Never lettering |

Contrast, by arithmetic and not measured ⚠: ecru on ground about 15:1, ecru on tile about
11:1, ground on ochre about 10:1, ground on sky about 8:1, ground on madder about 6:1.
Madder was lightened from the first sketch (`#D9482F`) because a dark label on it fell near
4:1.

Type is one family, JetBrains Mono, at weight 800. Why: its numerals cannot be mistaken for
each other, and one heavy weight survives small sizes.

| Token | Size on the Rack panel | Used for |
|---|---|---|
| `type/readout` | 10 mm | The tempo |
| `type/numeral` | 3.8 mm | Key numbers |
| `type/label` | 2.8 mm | Function key words, lower case |
| `type/jack` | 2.6 mm (AUDIO 2.8), tracked 0.04 em, capitals | CLOCK, RESET, TRIGGERS, VOICES, AUDIO |

On the phone nothing is under 16 px.

## The lighting

The keys are the lamps (D21): there is no separate light beside a key. Each key has two
lights.

- **The field** is the whole face. Lit means there is something here.
- **The frame** is a band round the edge, an eighth of the key wide. Lit means the playhead
  is here.
- **White** means this key is sounding now. Under a finger the white pulls in from the edge
  by the width of the frame; when the sequencer fires the key it stays full size.

No state depends on hue. Every state differs from every other by shape or by lightness, and
`loom/states.html` shows them in greyscale to prove it.

## Key states

Grid key:

| State | Field | Frame | Extra | When |
|---|---|---|---|---|
| off | dark | dark | pale numeral | |
| step | ecru | dark | dark numeral | The chosen sound has a step here |
| playing | dark | ochre | | The playhead is on this step |
| step + playing | ecru | ochre | a dark line between the two | |
| pressed | white, pulled in | ground | | A finger or the pointer is down |
| other sound | as it was | as it was | one stitch in the top right corner, ecru on dark, dark on ecru | Another sound has a step here |
| chosen | as it was | as it was | a bar along the bottom, in the held key's colour | The selected sound, or pattern |
| fired | white, full size | as it was | | This key's sound has just played |
| queued | dark | broken ecru frame | | This pattern plays next. Chaining is "later" in `WORKFLOW.md` |

Function key:

| State | Looks like |
|---|---|
| idle | Dark, with a band across the top: madder, ochre or sky for sound, pattern and bpm, ecru for the other four |
| pressed | White, pulled in, no band |
| latched | The whole face lit: in its own colour for the top three, ecru for the rest. Dark label |

Play is latched while the sequencer runs. Write is latched while write mode is on. In Rack a
click latches any function key until the next grid press or a second click (D23).

### What the grid shows, by mode (D37, accepted by D38)

| | Write on | Write off |
|---|---|---|
| The grid is | sixteen steps | sixteen sounds |
| Field | the chosen sound's steps | off |
| Stitch | other sounds' steps | off |
| Frame | the playhead | the playhead |
| White | a finger | a finger, or the key's sound firing |
| Bar | off | the chosen sound, while sound is held or latched |

While a function key is held the grid changes meaning, in either mode (D51; the core
decides it, `ENGINE.md` §14): **sound held**, the grid is sounds and the bar marks the chosen
one, fields off; **bpm held**, the fields of keys 1 to *n* are lit, *n* being the master
volume; **pattern held**, the bar is on key 1. The frame runs throughout.

This follows what a search found about the hardware (`WORKFLOW.md`, question 3: R26, R27),
not a check on it. D30 gives all sixteen keys a track, so every key can fire.

## The display

Left to right: the weave, then a column with the tempo, `bpm`, the write mark and the step
number. A row of sixteen step marks runs under the weave: the four beats stand taller, the
playing step is the tallest and is ochre.

The write mark is a solid ochre block with the word `write` in it. It is absent when write
is off, so its presence does not depend on colour.

### The animation ⚠ (proposed, not built)

The subject is a cloth being woven. Flat colour on a 1 mm weave grid: no gradients.

The owner keeps weaving as the subject (O12, answered 2026-11-19). The original's protected
display art shows a sewing machine and thread spools (R6): a different drawing, a
neighbouring subject, so it still goes to O7 and D19 at P9. If it has to move then, the rules
below are about a beat, a density and a loudness and carry over; the shuttle and thread are
the parts that would go.

1. **A diamond is a beat.** Four steps weave one diamond, a quarter of it per step. Four
   diamonds are a bar.
2. **The cloth grows to the right.** The bright bar at its edge is the beater. Once three
   diamonds are woven the cloth scrolls left one diamond a beat, so the edge stays in view.
3. **The diamond's size is the beat's density.** A beat with no steps set weaves only the
   centre stitch; one with all four set weaves the full diamond.
4. **The beater's width is the loudness of this step,** from 1 mm on a silent step to 4 mm
   when everything fires.
5. **The shuttle crosses once a step,** top to bottom on odd steps and back on even ones,
   trailing one pale thread.
6. **When two or more sounds fire together** the three newest rows flash white for a
   sixteenth of a step.
7. **Stopped,** the cloth holds still and the shuttle rests at the top.

With reduced motion asked for, rule 6 is off and the shuttle jumps instead of travelling.

`loom/frames.html` shows steps 1, 7 and 13.

## The Rack panel

24 HP: 121.92 mm wide, 128.5 mm tall. `panel.svg` holds only what never changes: the body,
the display's frame, the two stitched dividers, the slider threads, A and B, the jack labels,
the pale plate under the outputs with its marks, and the wordmark.

Everything else is a widget the module draws: the display, sixteen keys, seven function keys,
two slider caps, three sockets. Why: they change, and Rack's SVG reader draws no text, no
dashes and no filters. For the same reason `make_panel.py` turns lettering into outlines and
draws each stitch as its own rectangle.

Positions in mm from the top-left corner (`uv run pocket-instruments/design/make_panel.py --positions`):

| Widget | Centre x | Centre y | Width | Height |
|---|---|---|---|---|
| display (inside the frame) | 61.00 | 19.50 | 111.30 | 24.30 |
| key *n*, column *c* and row *r* from 0 | 11 + 12*c* | 44 + 12*r* | 11.70 | 11.70 |
| slider A (travel) | 60.00 | 59.50 | 5.00 | 43.00 |
| slider B (travel) | 70.00 | 59.50 | 5.00 | 43.00 |
| sound | 83.47 | 49.85 | 12.93 | 23.70 |
| pattern | 97.00 | 49.85 | 12.93 | 23.70 |
| bpm | 110.53 | 49.85 | 12.93 | 23.70 |
| function | 81.78 | 74.15 | 9.55 | 23.70 |
| fx | 91.93 | 74.15 | 9.55 | 23.70 |
| play | 102.08 | 74.15 | 9.55 | 23.70 |
| write | 112.23 | 74.15 | 9.55 | 23.70 |
| jack CLOCK (in) | 10.67 | 116.30 | | |
| jack RESET (in) | 22.33 | 116.30 | | |
| jack TRIGGERS (out, 16 channels) | 80.67 | 116.30 | | |
| jack VOICES (out, 16 channels) | 95.17 | 116.30 | | |
| jack AUDIO (out) | 109.67 | 116.30 | | |

### The jack row

Left to right: CLOCK and RESET in, then TRIGGERS, VOICES and AUDIO out (D33).

- **Two groups at a glance.** The inputs sit on the dark body at the left. The three outputs
  sit together on one pale plate at the right, with dark lettering. Why a plate: VCV's guide
  asks for an inverted background on output ports (R33).
- **Sixteen channels.** TRIGGERS and VOICES each have sixteen stitches round the socket, one
  for each key. AUDIO has none.
- **AUDIO is the main output.** It alone has a solid frame round its cell, and its label is a
  size larger.
- A first draft drew a stitched box round the outputs with a plate under AUDIO only. It left
  two outputs on the dark body, against R33, so it went.

Also to draw as widgets:

- **Slider cap:** 5 by 3 mm, ecru, with a dark slot across the middle.
- **Function key label:** runs up the key, read from the right.
- **Socket:** an ecru ring 8 mm across round a dark hole for the inputs; a dark ring round a
  pale hole for the outputs.
- **Screws:** Rack's own, at the four corners. The display starts 7 mm down to clear them.

⚠ `panel.svg` was outlined from the Bold cut (700), the only one installed. The design asks
for 800. Pass an ExtraBold file to `make_panel.py` to redo it.

## What VCV's manual asks, and where this stands

The rules themselves are in `../RACK-RULES.md`. This is Loom against them.

| The manual asks | Here |
|---|---|
| mm units; 128.5 mm tall; a multiple of 5.08 mm wide | Yes: 24 HP |
| All text as paths | Yes: `make_panel.py` outlines it |
| No complex gradients, no CSS | Yes: flat fills only |
| Component graphics off the panel, on a hidden `components` layer | Partly: the panel is static only, but it has no `components` layer. The positions table above stands in; the builder adds the layer if Rack's helper script is used |
| An inverted background for output ports | Yes, since the jack row was redrawn |
| Room for thumbs between knobs and ports | Sockets are 11.67 mm apart or more; keys are at 12 mm; the sliders are 10 mm apart (they were 7; the owner widened them, and the dividers closed in to make the room) |
| Text readable at 100% on an ordinary monitor | ⚠ Jack labels were raised to 2.6 mm for this, about 5.6 px of capital height at 100%. Rendered and read at that size here, not in Rack |
| Roughly the density and text sizes of VCV's own modules | ⚠ Not compared against one |
| Do not use others' intellectual property | D20's avoid list; O7 at P9 |
| A dark panel may be offered | Not needed: it is already dark |

For the build, not the look: labels in code leave out the words input and output (R35); the
module takes the `Polyphonic` tag; triggers are 10 V for 1 ms; RESET masks CLOCK for 1 ms;
audio is about ±5 V (R34).

## The phone

Portrait, 390 by 844, one instrument filling the screen (this answers O9). A stitched hem
round the body on a darker table. Top to bottom: the display, the grid, then the sliders and
the function keys side by side.

- Grid keys are 88 px square with a 2 px gap: the grid is as wide as the body.
- Both sliders sit on the left, 44 px wide over the full height of the bottom block. The
  function keys sit on the right: the top three 81 px wide, the bottom four 60 px, all
  151 px tall.

## Where this departs from the prompt

| Departure | Why |
|---|---|
| Function keys at 10 mm pitch on the Rack panel, not 12 | Four across at 12 mm do not fit beside a 48 mm grid and two sliders in 24 HP |
| Function keys are tall, with the label running up the key | A label under a 10 mm key can only be about 1.2 mm high. On the key it is 2.8 mm |
| On the phone both sliders are on the left | One at each edge left the bottom four keys under 60 px |
| The wordmark moved 14 mm left when the outputs became three | The brief said nothing else moves; three sockets with readable labels do not fit beside it where it was |
| Four grid states the prompt did not ask for: other sound, chosen, fired, queued | The owner kept the first, second and fourth (2026-11-19). Fired came from `WORKFLOW.md` afterwards ⚠ |

## Not done

- The keys, slider caps, sockets and display are not drawn as Rack widgets or web components.
- The animation is seven rules and three frames, not a running thing. Nobody has seen it move.
- Contrast is by arithmetic. Nobody has looked at it on a phone in daylight or in Rack at
  normal zoom.
- O3 (the name) and O7 (a lawyer's view of the mock-up) are as open as they were.
