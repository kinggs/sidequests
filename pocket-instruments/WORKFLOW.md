# The workflow

**Status:** a draft from the published guide (R23), not checked on the hardware. By D29 it is
built from as it stands: a row is ticked, or a mismatch added to the differences table, as
the owner meets it. P8 is judged against this file (D22).

Written in our own words. No text or pictures from the guide are in this repo (README rule 6).

How to read a row: **hold** means keep the key down; **+** means while holding.
Scope: **in** is the tiny rhythm machine (D12); **later** is the full homage; **never** is
hardware business with no meaning in software.

## What the guide says

| ✓ | To do this | Press | Scope |
|---|---|---|---|
| ☐ | Choose a sound | hold sound + a grid key | in |
| ☐ | Choose a pattern | hold pattern + a grid key. The active pattern's light blinks | later |
| ☐ | Start and stop | play | in |
| ☐ | Turn write mode on or off | write. A record mark shows on the display | in |
| ☐ | Put the chosen sound on a step | in write mode, a grid key | in |
| ☐ | Record live | while playing, hold write + grid keys. Notes snap to the grid | later |
| ☐ | Shape the chosen sound | turn A or B | in (with sound, after P7) |
| ☐ | Record a slider's movement into the steps | hold write + turn A or B | later |
| ☐ | Cycle the tempo: 80, 120, 140 | bpm | in |
| ☐ | Fine tempo, 60 to 240 | hold bpm + turn B | in |
| ☐ | Swing | hold bpm + turn A | in |
| ☐ | Master volume, sixteen levels | hold bpm + a grid key | in |
| ☐ | Repeat a step within itself (2, 4, 8, 16) | hold a grid key + bpm, again to cycle | later |
| ☐ | Punch in an effect | while playing, hold fx + a grid key | later |
| ☐ | Clear the effects | hold fx alone | later |
| ☐ | Chain patterns, up to sixteen, repeats allowed | hold pattern + grid keys in order | later |
| ☐ | Copy the pattern to another slot | hold write + pattern + a grid key | later |
| ☐ | Clear the pattern | function + pattern | in |
| ☐ | Change the sync mode | hold function + bpm | never (Rack has cables) |
| ☐ | Clock, alarm, battery, power off, factory reset | various | never |

The sixteen sounds, by kind only, for choosing our two to four: two bass and snare drums, two
hats, a cymbal, toms, a clap, sticks, a cowbell, noise, and three pitched tones.

## What the guide does not say

Guesses until someone trips on them (D29). Each one changes something we build; where the
instrument must choose first, it takes the plainest reading and says so below.

1. **What a tap on a grid key does in play mode** (write off). Does it play the chosen sound?
   Does it play sound *n*? This decides whether the instrument can be drummed live.
2. **How a step is removed.** A second tap in write mode, presumably. ⚠
3. **What the keys show.** Which lights are on in write mode (the chosen sound's steps?), in
   play mode, and while a function key is held. D21's glowing keys copy this.
4. **Are the knobs absolute?** Turn A, change sound, come back: does the sound jump to where
   the knob is, or keep its own value until the knob moves? D21 assumes absolute. ⚠
5. **The range of swing**, and whether the knob at rest is zero. The engine allows 0 to 48 of
   96 ticks (`ENGINE.md` §5): straight to dotted.
6. **Does a tempo press take effect at once** or on the next bar?
7. **Does play always start from step 1?** And after stop, does it resume or restart?
   The engine restarts.
8. **The step repeat:** the guide gives two different key combinations. Which is true?
9. **Effects nine and ten:** the guide lists them two ways (stutter 4 and 3, or 3 and 8).
10. **The key positions.** Which key sits where, row by row, for the keyboard mapping (D23).
11. **Sizes, for D16:** board width and height, key pitch, jack spacing.

## Deliberate differences from the hardware

D22 asks for every one to be listed and explained. So far:

| Difference | Why |
|---|---|
| Sliders where the hardware has knobs | D20, D21: the look must be our own. They work the same way if question 4 is "absolute" |
| In Rack, a click on a function key latches it | D23: a mouse is one finger |
| Probability on a step | not on the hardware; the brief asks for it. It needs a gesture that does not collide with anything above. Open |
| A length under sixteen | same |
| Two to four sounds, one pattern, at first | D12: the tiny rhythm machine is the first quarter of the homage |
| No sync modes, clock, alarm or battery | hardware business |
