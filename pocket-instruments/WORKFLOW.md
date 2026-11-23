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

The sixteen sounds, by kind only (ours are in `VOICES.md`): two bass and snare drums, two
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

## What the first build does (Session 9, 2026-11-20)

Every **in** row above is in the first build (D52), with a tap in play mode playing that
key's sound. Built into the core in Session 10 (`core/src/keys.rs`); nothing can be pressed
yet, because no host has a face until Session 12. Exactly what each press does is `ENGINE.md` §13. Where the guide and the search
are silent, it takes these readings (D57), each one line to change:

| ⚠ | Reading built | The question it guesses at |
|---|---|---|
| ☐ | Choosing a sound plays it | not asked above |
| ☐ | bpm changes the preset when it is let go, and only if nothing else was done while it was held; so changing the volume or the swing never changes the tempo | not asked above |
| ☐ | A tempo change is at once | 6 |
| ☐ | Play always starts from step 1 | 7 |
| ☐ | Write turns on at the press, not the release | will be asked again with live record |
| ☐ | Clear empties every sound's steps | not asked above |
| ☐ | Swing: the slider's bottom is none, its top is 48 of 96 ticks | 5 |
| ☐ | Fine tempo moves in whole bpm, 60 to 240 | not asked above |

## What a search found (2026-11-19)

Second-hand answers to the questions above, from R26 to R28. They replace a guess with a
report; only the hardware replaces a report with a fact.

| Question | Found | How sure |
|---|---|---|
| 1. A tap in play mode | **Key *n* plays sound *n*:** the sixteen keys are sixteen sounds. Choosing one to program still takes sound + key. Whether a plain tap also chooses it: not found | Two sources agree (R26, R27) |
| Live record (a row above) | Hold write and tap: each key records **its own** sound, whichever sound is chosen | One review (R27). It changes the row above: live record is not "the chosen sound" |
| 2. Removing a step | A second tap in write mode | One third-party sheet (R28) ⚠ |
| 3. The lights | Write mode: the lit keys are the pattern. Playing: a light chases the steps and keys flash as their sounds fire. While sound or pattern is held: not found | R26, R27 |
| 4. The knobs | A is pitch and B is length for the drums; each sound is shaped on its own. Absolute or not: not found | R27; R28 ⚠ |
| A second way to lock | In write mode, hold a step and turn a knob: that step alone gets the value | R26, R28 |
| 5. Swing range | Not found | |
| 6, 7. Tempo at once; play from step 1 | Not found | |
| 8. Step repeat | Hold the step + bpm, in write mode; bpm again to cycle | R28 agrees with the guide's text, not its diagram ⚠ |
| 9. Effects nine and ten | Stutter 4, stutter 3 | R28, likely copied from the guide ⚠ |
| 10. Positions | Top row: sound, pattern, bpm, then the two knobs. Right-hand column of four: function at the top (under knob B), write at the bottom; fx and play between, order not found | R26, R27 |
| 11. Size | Retailers disagree: about 60 by 102 to 105 mm | ⚠ |
| Clear the pattern (a row above) | R28 says fx + pattern; the guide says function + pattern | Conflict. The guide is the maker's |
| Sync pulse | Two a quarter note, the Korg convention | One forum post ⚠. Not used (D24) |

**The expensive one is question 1.** If each key is a sound, an instrument with four sounds
has twelve dead keys in play mode, and the thing D22 wants learned (which key is which drum)
is not there to learn. Settled by D30: sixteen tracks from the start.

### What an open-source emulation does (R30)

Read on 2026-11-19, outside this repo. It is one fan's reading of the hardware, and it leaves
out the knobs' effect on sound, swing, fine tempo, effects, chains and locks, so it is silent
on questions 4 to 6, 8 and 9. Where it speaks:

| Question | What it does | Agrees with |
|---|---|---|
| 1. A tap in play mode | Plays sound *n*. Does **not** change the chosen sound | R26, R27 on the first half; the second half is new |
| 2. Write mode | A tap puts the chosen sound on that step; a second tap takes it off | R28 |
| 3. The lights | Write: the chosen sound's steps are lit. Playing: the current step is brightest, and keys whose sounds are firing flash for half a step. Sound held: every key lit, the chosen one brighter. Pattern held: non-empty patterns lit, the chosen one brighter | R26, R27 |
| 7. Play and stop | Stop returns to step 1; play always starts there | new |
| Changing pattern while playing | Waits for the end of the bar | new |
| 10. Positions | Right-hand column, top to bottom: function, fx, play, write | R26, R27; settles the middle two |

It also latches the sound and pattern keys on a click, as D23 does, and maps the grid to a
four-by-four block of the keyboard (1234, qwer, asdf, zxcv), as D28 proposes. Both are
evidence the idea works, from someone who has shipped it.

Two checks on the hardware, about three minutes, settle what the search could not:

1. Write off. Tap keys 1, 2, 3: three different drums? Then hold sound + 1, let go, tap key
   5, press write, tap a step. Which drum landed on the step: 1 or 5? Note which keys are lit
   in write mode.
2. Hold sound + 1 and turn A fully one way. Hold sound + 2 and turn A fully the other way.
   Hold sound + 1 again and tap key 1 without touching the knob: is its pitch where you left
   it? Now nudge A a hair: does the pitch jump?

## Deliberate differences from the hardware

D22 asks for every one to be listed and explained. So far:

| Difference | Why |
|---|---|
| Sliders where the hardware has knobs | D20, D21: the look must be our own. They work the same way if question 4 is "absolute" |
| ~~In Rack, a click on a function key latches it~~ With a mouse, in Rack and on the page, Ctrl+click (Cmd on a Mac) latches sound, pattern, bpm, function or fx; a click is a real hold | D23: a mouse is one finger. D60, D61 replaced the click latch (built in Rack in Session 13) |
| ~~In Rack the tempo preset is two clicks on bpm: one latches it, one lets it go~~ The tempo preset is one click on bpm, with a mouse as with a finger | D57 made it two clicks; D60 made the click a hold again |
| In Rack each sound's trigger and its audio go out on sixteen channels, and come back in through RETURN to take that sound's place in the mix | D62: the module's showpiece. Rack has cables; the hardware does not |
| The slider caps move by themselves to the chosen sound's settings, and to swing and tempo while bpm is held | D54: what is seen is what is heard. A knob cannot; a drawn slider can |
| While bpm is held the grid shows the volume as a row of lit keys | D51: glowing keys can say it; ⚠ what the hardware shows is not known |
| Probability on a step | not on the hardware; the brief asks for it. It needs a gesture that does not collide with anything above. Open |
| A length under sixteen | same |
| One pattern at first | D12: the tiny rhythm machine comes first. Sixteen sounds from the start (D30) |
| Our own sixteen sounds, in the same roles on the same keys | D31: synthesised by us, close in character, never sampled. (Since D35 and D50: or a public-domain sample, per key. Still nothing from the hardware) |
| No sync modes, clock, alarm or battery | hardware business |
