# The prompt given to Claude Design

Written 2026-11-19 from D20 (what to avoid), D21 (the three blocks) and D16 (jacks on the
panel). The export goes in this folder. Do not attach photographs of the original as
reference (README rule 6; a design tool copies what it is shown).

```
Design the face of a small software drum machine. It will exist in two places:
as a module in VCV Rack (a virtual Eurorack synthesiser) and as a page on a
phone. Same parts, same behaviour, two arrangements.

It is an open, credited homage to pocket-sized calculator-format drum machines.
It must NOT look like any existing product. The brief in one line: a
sixteen-step pocket instrument that nobody could mistake for another maker's
at a glance. Give it a visual identity of its own.

THE PARTS (the same in both places)

1. The grid. Sixteen keys, four by four, numbered 1 to 16. The keys
   themselves light up; there are no separate little lamps beside them.
2. Two sliders, called A and B. Vertical. Not knobs.
3. Seven function keys in two rows:
     top:     sound, pattern, bpm
     bottom:  function, fx, play, write
   The top three must be clearly different colours from each other.
   Labels are lower-case words.
4. A display. Small, lively, animated. It shows the tempo, a mark when
   write mode is on, and which step is playing, and it has room for a
   small animation that reacts to the music. Invent the animation's
   subject and drawing style from scratch.

KEY STATES TO DESIGN (show all on one sheet)

A grid key can be: off; holding a step for the selected sound; the step
playing right now; both at once; pressed. When the instrument is being
played rather than programmed, each key is one drum sound and flashes
when its sound fires. A function key can be: idle;
pressed; latched (held down by a click, and glowing until released).
These must be tellable apart at arm's length and by someone colour-blind.

ARRANGEMENT 1: THE RACK MODULE

A panel 128.5 mm tall and 121.92 mm wide (24 HP). Left to right, in three
blocks with a divider between each: the grid, the two sliders, the
function keys. The display runs across the top. A row of jack sockets
runs along the bottom: CLOCK in and RESET in at the left, AUDIO out at
the right, 3.5 mm sockets with labels. Leave a mounting-screw margin at
the four corners. Keys at roughly 12 mm pitch.
Constraints of the format: the panel is a flat SVG; gradients must be
simple linear or radial; no blur, no drop shadows, no filters.

ARRANGEMENT 2: THE PHONE

Portrait, one thumb each side, dark background. The same three blocks
stacked in a column: display at the top, then the grid, then the sliders
and function keys below. Every key at least 60 px square; the grid as
large as the width allows. It should feel like an object lying on a
table, not like an app form.

MUST AVOID (these are firm)

- A bare circuit board as the body, or exposed round tact switches as keys.
- A portrait card with a row of three keys and two knobs above a
  five-by-four key grid.
- A hanger tab or hook at the top; rows of pins around the display;
  battery clips at the sides; any of these as decoration either.
- Segmented-LCD cartoon scenes in the style of handheld games.
- Any brand name, logo, or model number other than the working title
  "Pocket Instruments".

WHAT I WANT BACK

- Three distinct directions first, as small Rack panels side by side,
  each with a one-line idea behind it. I will pick one.
- Then, for the chosen one: the Rack panel at full size, the phone
  layout, the key-states sheet, three frames of the display animation,
  and the colour and type choices as named tokens.
```

## Addendum, 2026-11-19: two more jacks (D33)

Sent to Claude Design after the first export:

```
One change to the Rack panel. The bottom row of jack sockets gains two
outputs, so it now reads, left to right:

  CLOCK in, RESET in   (inputs, at the left, as now)
  TRIGGERS out, VOICES out, AUDIO out   (outputs, grouped at the right)

TRIGGERS and VOICES each carry sixteen channels on one cable, one per
key. Mark those two sockets as multi-channel in a way that fits the
design, and make the inputs and the outputs read as two groups at a
glance. AUDIO stays the main output and should be the most prominent
of the three. Nothing else on the panel moves. The phone layout has no
jacks and does not change.
```
