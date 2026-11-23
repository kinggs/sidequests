# The look: Loom

**Status:** chosen by the owner on 2026-11-19 (D36) from three directions drawn in Claude
Design to `PROMPT.md`. The phone is built (`web/rhythm.html`, Session 12), and the Rack module
(`rack/src/Rhythm.cpp`, Session 13), both without the animation. ⚠ marks a proposal the owner has not ruled on.

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
| `make_panel.py` | Draws `panel.svg`, prints the widget positions, and (`--check`) holds every jack's label, plate and stitches clear of its neighbour's |
| `rack-face-unlit-100.png` | The Rhythm module as Rack draws it, from Rack's own screenshot mode at 100% zoom (360 px wide: what a player sees without zooming). Nothing lit: no module runs in that mode. Taken in Session 18, with the two jack rows |
| `rack-face-unlit-200.png` | The same at 200%, to judge the lettering and the plates |
| `rack-face-lit-100.png`, `rack-face-lit-200.png` | The same from a scratch build whose face was filled by hand (never shipped): playing on step 5 with write on, steps 1, 5, 7, 9, 11 and 13 lit, key 10 pressed, the stitch on key 3, the bar on key 1, fx latched (D78: its face lit like play and write), and each slider's second mark at 20000 and 50000. Taken again in Session 19 with effect 3 heard (the madder `fx 3` block above `write`) and the lane on steps 6, 7, 8 and 13 (four madder ticks over the step marks) |

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

Play is latched while the sequencer runs. Write is latched while write mode is on. ~~In Rack a
click latches any function key until the next grid press or a second click (D23).~~ With a
mouse, in Rack and on the page, a click is a real hold and Ctrl+click (Cmd on a Mac) latches
sound, pattern, bpm, function or fx until a press of any key ends (D60, D61). Since Session 19
fx keeps its latch until it is Ctrl+clicked again, and is down only while a grid key is (D78),
on the page as in Rack.

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

### The effects on the display (D81; a stand-in for the owner's eye, ⚠)

Drawn in Session 19 on the page and in Rack, from the same view bytes. No key lights for an
effect (D66 item 3), and there is no picture of a machine and no spark (D81 item 3).

- **The effect heard** (byte 55): a solid madder block the size of the write mark, with `fx`
  and the number in it in ground (`fx 3`, `fx 11`). It sits just above the write mark's place
  in the column and keeps that place whether write is on or off; absent when nothing is
  heard, so, like the write mark, its presence does not depend on colour. Rack: 11 by 3.6 mm,
  0.8 mm above the write mark. Phone: the write mark's width (five characters and 8 px each
  side), directly above it.
- **The lane** (bytes 56 and 57): a madder tick over the step mark of each step that holds an
  effect, the mark's width, on one line clear of the tallest mark, so the marks themselves do
  not change. Rack: 0.67 mm tall, 0.6 mm above the tallest mark. Phone: 4 px tall, 4 px above.
- Neither moves, so reduced motion changes nothing (D81 item 4).

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
the pale plate under each output with its marks, and the wordmark.

Everything else is a widget the module draws: the display, sixteen keys, seven function keys,
two slider caps, thirteen sockets (six until Session 18). Why: they change, and Rack's SVG reader draws no text, no
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
| jack CLOCK (in) | 12.40 | 97.50 | | |
| jack RESET (in) | 25.40 | 97.50 | | |
| jack A OUT (out, 16 channels) | 40.00 | 97.50 | | |
| jack A IN (in, 16 channels) | 51.67 | 97.50 | | |
| jack B OUT (out, 16 channels) | 63.33 | 97.50 | | |
| jack B IN (in, 16 channels) | 75.00 | 97.50 | | |
| jack FX GATES (out, 16 channels) | 90.00 | 97.50 | | |
| jack TRIGGERS (out, 16 channels) | 12.40 | 116.30 | | |
| jack VOICES (out, 16 channels) | 25.40 | 116.30 | | |
| jack RETURN (in, 16 channels) | 38.40 | 116.30 | | |
| jack FX SEND (out) | 84.00 | 116.30 | | |
| jack FX RETURN (in) | 96.00 | 116.30 | | |
| jack AUDIO (out) | 109.67 | 116.30 | | |

Until Session 18 there were six, in one row at y 116.30: CLOCK 10.67, RESET 22.33, RETURN
34.00, TRIGGERS 80.67, VOICES 95.17, AUDIO 109.67. Every one but AUDIO moved (D76 item 2);
a patch keeps its cables, because Rack ties a cable to a port's number, and the numbers
did not change.

### The jack rows

Two rows, thirteen jacks, grouped by what they carry (D76, the owner: "inputs and outputs
for the same kinds of things close together"). Drawn in Session 18, and "accepted for now":
judged in use, with cables in.

```
upper row, y 97.5 (voltages that steer):
  CLOCK  RESET  |  A OUT  A IN  B OUT  B IN  |  FX GATES
lower row, y 116.3 (triggers and sound):
  TRIGGERS  VOICES  RETURN  |  wordmark  |  FX SEND  FX RETURN  |  AUDIO
```

| Jack | Carries |
|---|---|
| CLOCK, RESET (in) | one edge a step; reset to step 1 |
| A OUT, B OUT (out, 16 channels) | 0 to 10 V: the slider each sound was last hit with, by the instrument's own reckoning (the hand's, or what the step keeps) |
| A IN, B IN (in, 16 channels) | 0 to 10 V: channel *n*'s voltage at sound *n*'s hit takes that slider's place. Which sounds: the channels the cable carries, or the menu's ticks |
| FX GATES (out, 16 channels) | 10 V on channel *n* while effect *n* is heard, punched or replayed |
| TRIGGERS (out, 16 channels) | 10 V for 1 ms as each sound fires |
| VOICES (out, 16 channels) | each sound alone, 5 V to 1.0, before the effects and the volume |
| RETURN (in, 16 channels) | channel *n* takes sound *n*'s place in the mix and, if that sound is switched in, in the effects |
| FX SEND (out) | the sounds switched into the effects, before any effect and before the volume |
| FX RETURN (in) | what an effect ticked in the menu is heard from, while it is held |
| AUDIO (out) | the mix |

- **Each group reads as it is patched.** The sounds' loop left to right: TRIGGERS out,
  VOICES out, RETURN in. Each slider a pair: out, then in. The effects one column group at
  the right: FX GATES over FX SEND and FX RETURN. The clock top left, where a patch starts;
  AUDIO bottom right, where it ends.
- **An output is told by its plate, not by its side:** each has its own patch of the pale
  ground with dark lettering, as wide as its stitches or its label (R33 asks for an
  inverted background on outputs). TRIGGERS' and VOICES' meet and read as one. An input
  sits on the dark body with pale lettering.
- **Sixteen channels:** eight of the thirteen have sixteen stitches round the socket, one
  for each key, dark on a plate and pale on the body. CLOCK, RESET, FX SEND, FX RETURN and
  AUDIO have none.
- **AUDIO is the main output.** It alone has a solid frame inside its plate, and its label
  is a size larger.
- **FX SEND and FX RETURN have FX on a line of its own** over the word. Why: on one line,
  at 2.6 mm, the two labels are 11.5 and 14.8 mm wide and overlapped.
- **What moved from D76's proposal, and why** (D80 items 16 to 18): the left three columns
  from 10.67, 22.33 and 34.00 to 12.4, 25.4 and 38.4 (TRIGGERS' lettering touched
  VOICES'); FX SEND and FX RETURN from 80.67 and 92.33 to 84.0 and 96.0, and FX GATES from
  86.5 to 90.0 to stay over them; the rest as proposed. `make_panel.py --check` prints
  every clearance: the tightest are 0.87 mm from a slider output's plate to the next
  input's stitches, and 1.2 mm each side of the wordmark, which keeps its 3.0 mm.
- The single row it replaced (Session 13): three inputs on the dark body at the left, the
  three outputs on one plate at the right, the wordmark between at 0.5 mm clear. RETURN was
  drawn then with sixteen pale stitches, as the two sixteen-channel outputs had dark ones,
  and by D62 item 4 the wordmark dropped from 3.5 to 3.0 mm: at 3.5 mm it is 37.8 mm wide
  and the room was 33.4 mm. A first
  draft of that had a stitched box round the outputs with a plate under AUDIO only; it left
  two outputs on the dark body, against R33, so it went.

Also to draw as widgets:

- **Slider cap:** 5 by 3 mm, ecru, with a dark slot across the middle. Since Session 21
  (D75) the cap is the hand's: it moves by itself only while bpm is held or after a load.
- ⚠ **The second mark** (D75 item 4; `ENGINE.md` §20): not designed yet. Built in Session 21
  as PLAN.md's stand-in, below in "Not done".
- **Function key label:** runs up the key, read from the right.
- **Socket:** an ecru ring 8 mm across round a dark hole for the inputs; a dark ring round a
  pale hole for the outputs.
- **Screws:** Rack's own, at the four corners. The display starts 7 mm down to clear them.

~~⚠ `panel.svg` was outlined from the Bold cut (700), the only one installed. The design asks
for 800. Pass an ExtraBold file to `make_panel.py` to redo it.~~ Since Session 13 the
ExtraBold cut is in `fonts/` with its licence (OFL), `make_panel.py` outlines from it, and the
Rack module draws its lettering in the same file.

## What VCV's manual asks, and where this stands

The rules themselves are in `../RACK-RULES.md`. This is Loom against them.

| The manual asks | Here |
|---|---|
| mm units; 128.5 mm tall; a multiple of 5.08 mm wide | Yes: 24 HP |
| All text as paths | Yes: `make_panel.py` outlines it |
| No complex gradients, no CSS | Yes: flat fills only |
| Component graphics off the panel, on a hidden `components` layer | Partly: the panel is static only, but it has no `components` layer. The positions table above stands in; the builder adds the layer if Rack's helper script is used |
| An inverted background for output ports | Yes: each output on its own plate (Session 18; one plate under all three before) |
| Room for thumbs between knobs and ports | Sockets are 11.67 mm apart or more (12, 13 and 13.67 in the lower row); the two rows are 18.8 mm apart; keys are at 12 mm; the sliders are 10 mm apart (they were 7; the owner widened them, and the dividers closed in to make the room) |
| Text readable at 100% on an ordinary monitor | ⚠ Jack labels were raised to 2.6 mm for this, about 5.6 px of capital height at 100%. Read at that size in Rack's own screenshot in Session 18 (`rack-face-unlit-100.png`): every label reads; TRIGGERS and VOICES, 1.5 mm apart, are the closest. The owner's eye has not judged it |
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
| The wordmark moved right again and down to 3.0 mm for RETURN | D62 item 4: an input sits on the dark body, beside RESET, and only 33.4 mm is left |
| Four grid states the prompt did not ask for: other sound, chosen, fired, queued | The owner kept the first, second and fourth (2026-11-19). Fired came from `WORKFLOW.md` afterwards ⚠ |

## Not done

- ~~The keys, slider caps, sockets and display are not drawn as Rack widgets or web
  components.~~ On the phone they are (Session 12, `web/rhythm.html`, plain CSS); in Rack
  too (Session 13, `rack/src/Rhythm.cpp`, NanoVG). Nobody has looked at them in Rack yet:
  the build machine ran Rack headless only.
- In Rack, readings the design did not settle (Session 13, ⚠), each measured off
  `loom/rack.html` at 6 px a mm or the page: the frame an eighth of a key (1.46 mm); the
  dark line between a lit field and the frame 0.66 mm; the stitch 1.83 mm square, 1.33 mm
  in from the corner; the bar 1.6 mm tall; a function key's band 1.67 mm; the cap's slot
  0.7 mm; a socket's hole 3.5 mm across. The display's sizes are the picture's: tempo 10 mm,
  `bpm` 2.5 mm in lilac, the write mark and the step number 2.67 mm. A Ctrl+click latch
  lights the face in the key's own colour, as on the page. In a self-test the weave's area
  shows the fixture's name, its count and a square, green while every pass has matched
  (green is not a Loom token: it marks a test, not the instrument). The screws are Rack's
  own (`ThemedScrew`).
- On the phone, readings the design did not settle (Session 12, ⚠): a slider is dragged
  from where its cap shows, so a touch alone moves nothing; the bar is ochre while pattern
  is held and madder otherwise; a key whose sound fires stays white with reduced motion
  asked for, because it is a state and not movement; the sounds sheet's switch is lit
  as a step is lit (ecru face, dark letters) when it plays the sample, and a name goes white
  when its sound fires. A Ctrl+click latch (D61) lights the whole face in the key's colour,
  as `states.html`'s "latched". Below 720 px tall the
  function keys' words drop from 18 to 16 px to fit up the key.
- ⚠ The slider's second mark (D75 item 4: "a second, thinner mark at the value the chosen
  sound was last hit with", the view's bytes 60 to 63) is not designed. Session 21 drew
  PLAN.md's stand-in on both hosts: a thin line in `loom/thread` across the slider's track
  where the cap's middle would be at that value, drawn over the cap and always shown, bpm
  held or not. In Rack 6 mm by 0.35 mm (the cap's 5 mm and half a millimetre each side); on
  the phone 36 by 2 px across the 6 px track. Seen in Rack's screenshot mode with a face
  filled by hand (A at 20000, B at 50000, the caps in the middle): visible on the ecru
  thread and on the cap. To be drawn with the owner's eye (Surge XT's way of showing a
  modulated value is the idea, D40; none of theirs).
- ⚠ The two jack rows (Session 18) are drawn and seen only in Rack's screenshot mode,
  never with cables in. D76 says the grouping is judged in use. For the owner's eye: the
  plates of three heights in the lower row (TRIGGERS and VOICES one line of label, FX SEND
  and AUDIO two); FX over SEND and over RETURN; the empty corner right of FX GATES; whether
  0.87 mm between a slider output's plate and the next input's stitches is enough.
- ⚠ The display's effect block and the lane's ticks (Session 19, "The effects on the
  display" above) are D81's stand-in, built on both hosts and not yet seen by the owner. The
  readings built on: the block sits just above the write mark's place, keeping it whether or
  not write is on ("beside the write mark in the display's column"); the ticks sit on one
  line above the tallest mark rather than on each mark's own top; the sizes are the
  builder's. ⚠ **Madder:** D81 calls madder "the fx key's own colour", but the fx key's band
  and latched face are ecru here (madder is the sound key's). Built in madder, as D81 names
  it twice; the owner's to rule. Seen on the phone in a headless screenshot and in Rack's
  screenshot mode (`rack-face-lit-*.png`), never on a real screen.
- ⚠ The sounds sheet's "through fx" switch (D69, Session 19): a third button in each row,
  120 px wide, always reading `through fx`, lit as the sample switch is (ecru face, dark
  letters) while the sound goes through the effects. A tap sends `FXSOUND` and plays nothing
  (D60 item 4's "and plays the result" is the sample switch's; D69 is silent). On a 360 px
  screen the longest names wrap to two lines inside the 64 px row.
- The animation is seven rules and three frames, not a running thing. Nobody has seen it move.
- Contrast is by arithmetic. Nobody has looked at it on a phone in daylight or in Rack at
  normal zoom.
- O3 (the name) and O7 (a lawyer's view of the mock-up) are as open as they were.
