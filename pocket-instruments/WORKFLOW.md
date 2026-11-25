# The workflow

**Status:** a draft from the published guide (R23). Since 2026-11-23 partly checked on the
owner's PO-12: the effects (nine of thirteen checks), the lights with write off, and how
the knobs act; each such row says so. The rest is still not checked on the hardware. By D29 it is
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
| ☐ | Punch in an effect | while playing, hold fx + a grid key. It is recorded on the steps that pass, write on or off (R49, R53) | designed (D66; Session 16) |
| ☐ | Clear the effects | hold fx alone while it plays: each step that passes is emptied | designed (D66; Session 16) |
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
   (2026-11-23: the sibling guides say 4 and 3, R48. What the numbers count is still not
   known; the effects' own checks are in their section below.)
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

## What two videos and the owner's PO-12 showed (2026-11-23)

R53 is two videos of a PO-12 in use, read from their captions; the last column says what
is now a fact from the owner's own hardware. Where a row disagrees with what is built, it
is a mismatch (D29), listed until ruled on.

| What | Seen | Ours now |
|---|---|---|
| The lights with write off | **Fact (the owner, D71):** the chosen sound's steps are lit, steady, write on or off; choosing another sound shows that sound's steps; write changes only the display's mark and what a tap does. **While playing, every sound's key flashes as that sound fires, and the playhead's key flashes as it passes;** on one key the two are one flash | ~~**Mismatch.** D37: with write off no step is lit. D71 proposes following the hardware~~ **Closed (Session 20, 2026-11-23; D72 item 3, D82):** the chosen sound's steps are lit with write off as with write on; each key still goes white as its own sound fires (a lit one comes back lit) and the frame marks the playhead, so ours keeps the two flashes apart. No stitch with write off (D82 item 3) |
| Effects are recorded with write off | Both videos; four reviews (R49) | Designed so (D66) |
| Clearing effects | Hold fx through the steps; a whole pass clears all | Designed so |
| Effects belong to a pattern | Written across four chained patterns and cleared across them; a copied pattern given its own (R53) ⚠ | One pattern; the lane is saved with it |
| Effects only while playing | "the only way this works is while you're doing play" (R53) ⚠ | Stopped, a punch is heard on taps and writes nothing (D66 item 3) |
| Live record | Hold write + keys while playing; each key records its own sound, snapped to the grid | Later row; agrees with R27 |
| Recording a knob | Hold write and turn A or B while playing: the movement is kept over the sixteen steps | Later row |
| The tempo presets | bpm steps 140 (techno), 80 (hip hop), 120 (disco) | 80, 120, 140 rising: the same cycle |
| The step multiplier | Hold the step + bpm; shown cycling 2, 3, 4, 6, 8 and then none (R53); the guide says 2, 4, 8, 16 ⚠ | Later row. Question 8 is settled on the keys, not on the values |
| Removing a multiplier | Cycle round to none, or turn the step off and on | Later |
| Chains | Hold pattern, tap patterns in order, repeats allowed, up to sixteen | Later row; agrees |
| Copy a pattern | write + pattern + key | Later row; agrees |
| Battery | sound + bpm | never |

## The effects: what to check on the PO-12

`ENGINE.md` §17 and §18 are built on R48 to R54, which are second-hand on every point but
the maker's two sentences. Each line below is one ⚠ in the design. Play a pattern with a
kick and a hat.

| ☐ | Do | Look or listen for | It decides |
|---|---|---|---|
| ☑ | Write off. Hold fx + key 3 for four steps, let go. Wait a bar | **Yes** (owner, 2026-11-23): "The crush comes back in exactly the same step" | D66 item 2: recorded without write. Holds |
| ☑ | Punch key 3 between two hits | **At once** (owner): between two kicks with only kicks playing, nothing is heard, because nothing is sounding | §17: heard at once. Holds |
| ☑ | Press key 3 just after the snare on step 5, let go just after the hat on step 7; listen to the next bar | **The snare on 5 is not crushed; the hat on 7 is** (owner, 2026-11-23) | D66 item 3 holds: the step being played when the key lands is not written, and a step that arrives while it is held is |
| ☑ | Hold fx alone for half a bar | **Yes, cleared** (owner) | §17: the lane is written by arriving steps. Holds |
| ☑ | Hold fx + 3, add key 5 without letting 3 go; then let 5 go | **Only the last; and the first comes back** when the last is let go (owner) | One effect at a time (D66 item 1) holds. §17 first said letting go leaves none: corrected |
| ☑ | Stopped: hold fx + 3 | **Nothing** (owner) | D66 item 3 first let a punch sound while stopped: corrected |
| ☑ | fx held, playing | **No light does anything; the display's sewing machine sparks when an effect plays** (owner; as R51) | §17 first put a bar on the effect's key: removed. The display gets a mark of our own |
| ☑ | Punch 9, 10, 11 and 12 for a bar each | **Measured 2026-11-24 (R66).** 11 and 12 retrigger the last sound 8 and 6 times a beat, on through empty steps. 9 and 10 do not: with one kick on step 1 nothing repeats, which is what the owner heard on 2026-11-23 ("I don't hear any repeats"); on a fuller pattern 9 adds a hit a step after some hits and 10 puts hits 1.33 steps apart ⚠ rule not known | D67 item 1: the rates of 11 and 12 hold (8 and 6 a beat). Ours go silent on an empty step and the hardware does not: `ENGINE.md` §17, "Proposed after Session 22". 9 and 10 stay our own design ⚠ **Corrected 2026-11-25 (R74):** 11 and 12 repeat the step the key came down on, and an empty step repeats as silence; 9 and 10 are mutes (9: heard 0.44 of a step, silent to 1.0, heard to 1.44, then gone; 10: silent from 0.67 to 1.33). Our repeat's rule (D90) was ours; **ruled back to the hardware's 2026-11-25 (D95)**, **built in Session 30** (D96): a run repeats the step the key came down on, silent on an empty one, as the PO-12. A repeat punched mid-step is recorded on that step too, so the replay repeats what was heard (D97 ⚠ the PO-12 may not). 9 and 10 stay repeats. `ENGINE.md` §17, "Built (Session 30)" |
| ☑ | Mute nothing; punch a repeat over a bar with kick and hat | **Measured 2026-11-24 (R66): not all.** With 11 or 12 held only the kick repeats; the hats and the snare are gone ⚠ one pattern | D66 item 4 (all sounds in) is ours, not the hardware's. Kept until the owner rules (§17's proposal) |
| ☑ | Record an effect, then function + pattern, put a kick back | **Clear wipes the effects** (owner) | D66 item 7 holds |
| ☑ | Record an effect on a step, then take that step's note off and put it back | **The effect stays** (owner): "it basically applies it there, regardless of what I later program into those spots" | The lane is beside the steps. Holds |
| ☑ | Punch 4, 13, 14, 15 and 16 in turn | **Measured 2026-11-24 (R67):** 4 is one echo 175 ms on, nearly no feedback, heard past its step; 13 plays each note as a different sound ⚠; 14 builds and rings near 1 kHz; 15 and 16 wobble the pitch (6.5 Hz a little, 3.5 Hz a lot) ⚠. Whether 15 touches every sound is not answered | the effects not designed yet (D67 item 4) have a target each; 15 and 16 wait for take c **Read again 2026-11-25 (R75, R76):** 4's time is fixed (174.8 ms at 120 bpm too) and its line stands still in silence; 13's map is not settled; 15 is not understood; 16 reads as effect 1's slowed sounds with the rate wobbling |
| ☑ | Punch 6 or 8 over two bars | **Measured 2026-11-24 (R65): it runs on across steps, and goes both ways,** a cycle every 8.5 to 9 steps between about 200 Hz and 2.5 to 2.9 kHz ⚠ sparse | §18's sweeps (one way, over sixteen steps) are wrong in kind: §18, "Proposed after Session 22" **Corrected 2026-11-25 (R73):** a cycle of 6.0 steps, a triangle in octaves, 6 from the top down and 8 from the bottom up, starting when the key comes down |
| ☑ | Punch 1 over a pitched sound, and let go while a long one still sounds | **Measured 2026-11-25 (R72, take c): every sound at a quarter of its speed,** two octaves down and four times as long, no louder; nothing above 12 kHz. ⚠ **Not measured: the release** (take c's sounds had all ended by the bar the key went up: R77). To check: a long tom, fx + 1 held, let go mid-note: does the tom jump back up to its pitch, or finish slow? | §18's hold at 1 kHz was wrong in kind. **Designed 2026-11-25 (D98), built in Session 32 (ABI 14):** the voices in the effects retuned for 46 875 Hz and asked on a grid a quarter of it, a straight line between; a sounding note changes speed on the frame 1 comes on and goes off (D98 item 3, the ⚠ above); the track channels and VOICES carry it. Read beside the PO-12 on take c: 220 → 55 Hz, 3.85 times as long, +0.1 dB (`ENGINE.md` §18, "Built (Session 32)") |

## The sliders: what the hardware does, and what we do (D75)

Seen by the owner on the PO-12, 2026-11-23: "the knob positions *seem* to affect everything
regardless of which sound is selected", and they "seem to do pitch and release". R53's
second video (9:40 to 12:04) shows steps keeping the knob positions they were entered
with. ⚠ The owner's own unit did not behave as plainly as the video: "If I am just in write
mode, and move the knobs up and down in between recording a spot in the sequence, it feels
like it ignores me. However, when I re-select the sound, then move them, then e.g. switch
off and on one of the sounds, it records it in the new way." Not understood; not followed.

Ours, by D75: the sliders are where the hand left them, for every sound; a step keeps the
positions it was written with; nothing else. To look at again on the hardware when there
is time, none of it blocking:

| ☐ | Do | It would tell us |
|---|---|---|
| ☐ | Turn A down, enter a kick on step 1; turn A up, enter a kick on step 5; play, then sweep A without holding write | whether steps keep their positions, and whether the hand changes a written step |
| ☐ | The same, but choose the sound again (sound + 1) before each change of the knob | what "re-select the sound" does to the knobs |
| ☐ | Write on, hold a lit step and turn A | the hardware's way to change one step (not in our first build) |
| ☐ | Playing, hold write and turn A for a bar | recording a knob's movement (not in our first build) |

## Deliberate differences from the hardware

D22 asks for every one to be listed and explained. So far:

| Difference | Why |
|---|---|
| Sliders where the hardware has knobs | D20, D21: the look must be our own. They work the same way if question 4 is "absolute" |
| ~~In Rack, a click on a function key latches it~~ With a mouse, in Rack and on the page, Ctrl+click (Cmd on a Mac) latches sound, pattern, bpm, function or fx; a click is a real hold | D23: a mouse is one finger. D60, D61 replaced the click latch (built in Rack in Session 13) |
| ~~In Rack the tempo preset is two clicks on bpm: one latches it, one lets it go~~ The tempo preset is one click on bpm, with a mouse as with a finger | D57 made it two clicks; D60 made the click a hold again |
| In Rack each sound's trigger and its audio go out on sixteen channels, and come back in through RETURN to take that sound's place in the mix | D62: the module's showpiece. Rack has cables; the hardware does not |
| ~~The slider caps move by themselves to the chosen sound's settings, and to swing and tempo while bpm is held~~ The caps are the hand's, as knobs are, and move by themselves only to show swing and tempo while bpm is held, and to what a loaded beat holds (a knob cannot be moved by a load; a drawn slider can, and the beat's sound is then where the cap is). A second mark on each slider shows the value the chosen sound was last hit with. Built in Session 21, on the page and in Rack; the mark is a stand-in until `design/DESIGN.md` draws it ⚠ | D75 replaced D54 once the hardware was understood: the knobs act on every sound. The second mark is ours: a knob cannot show it (D40's idea from Surge XT) |
| A step's slider values can only be changed by taking the step off and putting it back; the hardware can also change one held step, and record a knob's movement | D75 item 3: the simple rule first. Built in Session 21 |
| A beat saved before Session 21 plays as it did: each step that is on keeps its sound's own values from the beat, so moving the sliders does not change it | D75 item 6. The hardware has no such thing to load |
| While bpm is held the grid shows the volume as a row of lit keys | D51: glowing keys can say it; ⚠ what the hardware shows is not known |
| Probability on a step | not on the hardware; the brief asks for it. It needs a gesture that does not collide with anything above. Open |
| A length under sixteen | same |
| One pattern at first | D12: the tiny rhythm machine comes first. Sixteen sounds from the start (D30) |
| Our own sixteen sounds, in the same roles on the same keys | D31: synthesised by us, close in character, never sampled. (Since D35 and D50: or a public-domain sample, per key. Still nothing from the hardware) |
| Each sound has a switch, through the effects or not; the hardware's effects are on everything (R50) | D66 item 4: the owner's "per channel". All in at the start, so untouched it is the hardware |
| In Rack the effect being heard goes out as a gate, and the effects' bus goes out and comes back | D68: so a punch can drive, or be, a Rack effect |
| ~~⚠ Not deliberate: with write off no step is lit; the hardware lights the chosen sound's steps in both modes~~ Closed in Session 20: with write off the chosen sound's steps are lit, as on the hardware | D37 guessed it; D71 had the fact; D72 item 3 and D82 decided it; built 2026-11-23 |
| A firing and the playhead are two lights (white and the frame), where the hardware flashes one key for either | D36's two lights; D72 item 3 keeps them apart with write off too |
| No sync modes, clock, alarm or battery | hardware business |
