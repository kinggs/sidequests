# The sixteen voices

**Status:** written 2026-11-19 (D30, D31) as a starting sheet. All sixteen voices are built
in `core/src/voice.rs` as recipes: key 10 (P7), keys 1 to 4 (the minimum beat), and the
other eleven (Session 7), all 2026-11-19. What each became is under **As built**. Since
Session 8 (D50) any key can play its D35 sample instead, set per key, code by default: see
**Tuning a sample**.

Key *n* plays track *n*. The roles and their order follow the hardware, so that what a
player learns here (which key is which drum) carries over (D22). The sounds are synthesised
by us, in the core, from the recipes below, or played from public-domain samples where that
sounds better (D32; built as D50). Nothing comes from the hardware or from anyone's recordings
of it (README rule 6).

Slider A is pitch and slider B is length for the drums (R27). For the two tones slider A
moves in semitones (D49); what the hardware does there is still not checked.

## Roles and recipes

Recipes are the reviewer's proposals: ordinary drum synthesis, cheap enough for P7's bar of
sixteen voices on a phone. Every one uses only a sine or square oscillator, white noise, a
one-pole or two-pole filter and exponential envelopes.

| Key | Role | Recipe | A (pitch) | B (length) |
|---|---|---|---|---|
| 1 | Bass drum | sine, pitch falling fast from about three times the base; a click at the start | base 40 to 90 Hz | decay 100 to 600 ms |
| 2 | Snare drum | two sines near 180 and 330 Hz plus band-passed noise | body pitch | noise decay 50 to 250 ms |
| 3 | Closed hat | six detuned squares through a high-pass near 7 kHz | filter pitch | 10 to 60 ms |
| 4 | Open hat | the same source as 3 | filter pitch | 100 to 500 ms |
| 5 | Synth snare | one sine with a fast fall, plus short noise | pitch | 20 to 150 ms |
| 6 | Sticks | a very short sine burst near 750 Hz with a click | pitch | 10 to 40 ms |
| 7 | Cymbal | the hat source, wider band, slow decay | filter pitch | 200 to 1200 ms |
| 8 | Noise | white noise through a low-pass | filter pitch | 50 to 600 ms |
| 9 | Hand clap | band-passed noise near 2 kHz, three quick bursts then a tail | band pitch | tail 50 to 300 ms |
| 10 | Click | a few milliseconds of sine near 1 kHz | pitch | 5 to 40 ms |
| 11 | Low tom | sine with a small fall | base 60 to 120 Hz | 150 to 600 ms |
| 12 | High tom | the same as 11 | base 120 to 250 Hz | 100 to 400 ms |
| 13 | Cow bell | two squares, about 540 and 800 Hz, band-passed | pitch of both | 30 to 300 ms |
| 14 | Blip | a short high sine with a fast rise in pitch | pitch | 20 to 100 ms |
| 15 | Tone | a square or triangle held at one pitch | pitch, in semitones (D49) | 50 to 500 ms |
| 16 | Bass tone | the same as 15, two octaves down, low-passed | pitch, in semitones (D49) | 50 to 500 ms |

Hats 3 and 4 share a source, and 4 should cut 3 off when both fire, as a real hat does.
⚠ Whether the hardware does this is not known. ⚠ Not built: on a real hat it is the other
way round (closing the hat cuts the open one off). The owner's ruling: neither, for now,
and keep it a switch (D47).

## As built

Every number below is the builder's first setting, chosen to sit inside the recipe and
the rough measurements, not by ear. The owner's ear moves them at P8 (D31). Slider B is
always the time to fall 60 dB; a voice is cut to exact zeros at -80 dB (`ENGINE.md` §11).
Every one is held to the same bytes natively and in WebAssembly by a scenario in
`harness/render-<name>.json`.

| Key | Built as | A | B | Fixed inside it |
|---|---|---|---|---|
| 1 | Sine, pitch from 3× the base falling by e every 20 ms; a click of white noise, 3 ms | base 40 to 90 Hz | 100 to 600 ms | body level 0.85, click 0.2 |
| 2 | Two sines, the upper 11/6 of the lower (180 and 330 Hz at the middle), and white noise through a band-pass | lower sine 130 to 230 Hz | the noise, 50 to 250 ms | the body falls 60 dB in 120 ms; band 4.5 kHz, Q 1; body 0.35 a sine, noise 0.8 |
| 3 | Six squares at 263, 333, 401, 487, 571 and 827 Hz, half starting low, through a two-pole high-pass | corner 5 to 10 kHz | 10 to 60 ms | Q 1.4; level 0.4 |
| 4 | The same as 3, as a second voice of its own | corner 5 to 10 kHz | 100 to 500 ms | the same |
| 5 | Sine falling from 2× its pitch (by e in 8 ms), plus white noise high-passed at 2 kHz with its own, shorter envelope | 200 to 460 Hz | the body, 20 to 150 ms; the noise a third of it | body 0.6, noise 0.5 |
| 6 | Sine, with a click of white noise, 2 ms | 500 Hz to 1 kHz | 10 to 40 ms | body 0.75, click 0.25 |
| 7 | The hats' six squares, high-passed lower and without the ring | corner 3 to 7 kHz | 200 to 1200 ms | Q 0.7; level 0.3 |
| 8 | White noise through a two-pole low-pass | corner 500 Hz to 8.5 kHz | 50 to 600 ms | Q 0.7; level 0.9 |
| 9 | White noise through a band-pass; three bursts 10 ms apart, each 60 dB down in 10 ms; a tail from the third | band 1 to 3 kHz | the tail, 50 to 300 ms | Q 1.5; tail 0.6; gain 1.2 |
| 10 | Sine (P7) | 500 Hz to 2 kHz | 5 to 40 ms | |
| 11 | Sine falling from 1.5× its base (by e in 40 ms) | base 60 to 120 Hz | 150 to 600 ms | level 0.9 |
| 12 | The same as 11 | base 120 to 250 Hz | 100 to 400 ms | the same |
| 13 | Two squares, the upper 40/27 of the lower (540 and 800 Hz at the middle), through a band-pass an octave above the lower | lower 400 to 680 Hz | 30 to 300 ms | Q 1; level 0.45 |
| 14 | Sine rising to an octave above its start (by e in 10 ms) | start 1 to 3 kHz | 20 to 100 ms | level 0.8 |
| 15 | Triangle, from 0 and rising: no step at the start | A2 to A4 in 25 semitones, A3 (220 Hz) at the middle (D49) | 50 to 500 ms | level 0.8 |
| 16 | Square two octaves below 15, low-passed two octaves above its own pitch | A0 to A2 in semitones, A1 (55 Hz) at the middle (D49) | 50 to 500 ms | Q 0.7; level 0.7 |

- **Noise** is a xorshift generator of each voice's own, restarted on every hit, so a hit
  depends only on its sliders and the rate. It never touches the sequencer's generator.
- **The filter** is a two-pole state-variable filter whose coefficient is made from the
  polynomial sine and one division: no maths library (D44).
- **The six squares** are our own set, chosen to be uneven, not taken from any machine.
- **Levels:** inside the voice, one hit peaks at about 0.8 to 1.0 (a hat a little lower,
  the open hat at its darkest a little higher). The core then halves every voice (D48), so
  the four together sit near 1.0.
- **The hats do not cut each other off** (D47); a switch for it later.
- **The tones are in tune by integers:** a table of the twelve semitones from A2 in
  thousandths of a hertz, shifted by octaves, so a note is exact and the same everywhere.
  Slider A in semitones for 15 and 16 was the recipe's guess; the owner confirmed it (D49).
- **Key 5's noise is shorter than its body,** as the recipe's "short noise" says; a first
  build with one envelope for both sounded as long as it was bright, and its pitch could
  not be measured under the noise.
- **The clap's three bursts and its tail overlap,** so its envelope reaches 1.6; the gain
  keeps a hit under 1 at every rate (band-passed noise peaks differently at each).
- **All sixteen at once** peak at 1.7 with every slider moved (`harness/render-all.json`):
  past 1, as D48 allows; each host softens past its own ceiling.

## How close, and how we judge it

Close in role and character, not a copy. The judge is the owner's ears, with the hardware
beside the prototype, at P8. A sound that is recognisably "the snare on key 2" passes; a
waveform match is not the aim and would be the wrong thing to chase (D31).

## Rough measurements, for a first setting

From the sixteen samples in an open-source emulation (R30), measured in a scratch folder and
not kept. ⚠ Their origin is not stated; they look trimmed (several stop dead at 25 to 60 ms)
and they do not all match the role the guide gives the same number. Use them to pick a
starting point for the sliders' middle, and nothing more.

| Key | Length | Strongest pitch | Brightness (centroid) | Note |
|---|---|---|---|---|
| 1 | 400 ms | 55 Hz, from about 190 | 0.7 kHz | a clear falling sine |
| 2 | 120 ms | 370 Hz | 6.6 kHz | mostly noise |
| 3 | 25 ms | 6.7 kHz | 10 kHz | |
| 4 | 180 ms | 4.6 kHz | 7.7 kHz | |
| 5 | 30 ms | 330 Hz | 7.5 kHz | |
| 6 | 25 ms | 770 Hz | 3.0 kHz | |
| 7 | 50 ms | none | 9.1 kHz | too short for a cymbal: trimmed ⚠ |
| 8 | 320 ms | 275 Hz | 4.2 kHz | |
| 9 | 110 ms | 2.0 kHz | 6.3 kHz | |
| 10 | 30 ms | 1.0 kHz | 5.5 kHz | |
| 11 | 430 ms | 62 Hz, from about 290 | 0.4 kHz | |
| 12 | 260 ms | 162 Hz | 0.4 kHz | the purest tone of the set |
| 13 | 60 ms | 750 Hz | 6.1 kHz | |
| 14 | 60 ms | none clear | 9.2 kHz | |
| 15 | 110 ms | 171 Hz | 4.7 kHz | |
| 16 | 95 ms | 154 Hz, strong partial at 615 | 0.8 kHz | |

## Tuning a sample (D50)

Each key plays its code voice or its sample, set per key (the listening page; the Rack
Probe's Sounds menu). How a sample plays is a few numbers in one marked block of
`core/src/voice.rs`, "TUNING SAMPLES". Each is a first setting, there to be moved by ear:

| To change | Edit | Now |
|---|---|---|
| How short slider B at 0 makes a key's sample | `SHORTEST_US`, that key's entry | each key's shortest code length |
| Where on slider B the whole sample is reached | `WHOLE_FROM` | the middle |
| The fade after slider B's length | `FADE_US` | 10 ms for 60 dB |
| Slider A's reach | `RATIOS` (25 semitones) | an octave either way |
| A key's sample itself | a file in `samples/`, its row in `samples/README.md` and `samples/tracks.txt`, then `python3 samples/make-raw.py` | the starter pack (D35) |

After an edit: `make test` (a test that pins the old number fails and says which; change it
with the reason), `make web` so the page gets the new core, and `make listen`. The code
voices' own numbers are in the "As built" table above and their structs in the same file.

## Samples instead of recipes, for some voices (D32, proposed)

(Annotated 2026-11-20: done as D50, for every key at once. The candidates below were
chosen as `samples/`, D35; the reasoning stands as written.)

Sonic Pi ships about two hundred drum and percussion samples, every one public domain (CC0),
each traced to its Freesound original (R31). They are heard by a very large number of people
and have been packaged by Debian, which checks licences. Candidates, to be chosen by ear:

| Key | Role | Candidate | Size (FLAC) | Otherwise |
|---|---|---|---|---|
| 1 | Bass drum | `bd_haus` (the Sonic Pi kick), or `bd_tek` | 19 KB | recipe |
| 2 | Snare drum | `drum_snare_hard`, or `sn_dolf` | 30 KB | recipe |
| 3 | Closed hat | `drum_cymbal_closed` | 21 KB | recipe |
| 4 | Open hat | `drum_cymbal_open` | 119 KB | recipe |
| 5 | Synth snare | `elec_snare` | 18 KB | recipe |
| 6 | Sticks | `elec_wood` | 25 KB | recipe |
| 7 | Cymbal | `drum_cymbal_hard` | 92 KB | recipe |
| 8 | Noise | none: noise is one line of code | | recipe |
| 9 | Hand clap | none in the set ⚠. Synthesise, or find a CC0 clap | | recipe |
| 10 | Click | `elec_tick` | 9 KB | recipe |
| 11 | Low tom | `drum_tom_lo_hard` | 44 KB | recipe |
| 12 | High tom | `drum_tom_hi_hard` | 35 KB | recipe |
| 13 | Cow bell | `drum_cowbell` | 18 KB | recipe |
| 14 | Blip | `elec_blip` | 16 KB | recipe |
| 15, 16 | Tone, bass tone | none: they must play in tune across the slider | | recipe |

**The pack is chosen (D35): `samples/README.md` lists the sixteen files, and
`samples/index.html` plays them.** The table above was the first shortlist; where the two
differ, the pack is right. Measuring the candidates moved several picks to shorter, more
electronic sounds, and found tones for keys 15 and 16 after all.

What samples change:

- **The sliders still work.** A is playback speed, B is the length of a fade.
- **Both hosts can be bit-identical.** Playing a sample back needs only adding and
  multiplying, which give the same answer everywhere (`REVIEW.md` F12). Synthesis needs sine
  and exponent, which do not. P7's bar gets easier for sampled voices.
- **The samples are data, not code.** The host loads them and hands the core a pointer, so
  the core stays small and allocation-free. About half a megabyte for the set, decoded.
- **Every file gets a line in a manifest**: its name, its Freesound page, its author, CC0.
  ⚠ CC0 is the uploader's word. `bd_808` is named after a machine; names like that are
  avoided here, whatever the licence says.
- **They move us away from the hardware's sound**, which is synthetic. (Annotated 2026-11-20: partly. Retail copy says the PO-12 mixes synthesised and sampled sounds, without saying which keys are which: R45.) The `drum_` files are
  an acoustic kit; the `bd_`, `elec_` and `hat_` files are electronic. D31's "close in
  character" is still the aim, and the owner's ear still decides.

## Individual outputs in Rack (D33, proposed)

Each sound can leave on its own, so key 1 can drive a dedicated kick module.

- **Triggers out need nothing new in the core.** It already reports every firing as a `TRIG`
  event with its track (`ENGINE.md` §7). The Rack module turns each into a pulse.
- **No expander is needed to start.** A Rack cable carries up to sixteen channels, and we
  have sixteen tracks. One TRIGGERS jack on the main panel carries all sixteen; Rack's own
  Split module fans them out. The same for one VOICES jack carrying each sound's audio.
- **The expander, when it comes, is sixteen plain jacks** for people who want one cable per
  drum, and one rule borrowed from classic drum machines: a sound whose own audio jack is
  patched leaves the main mix.
- **One thing to design in at P7:** the core must render each track to its own buffer, or
  take a mute mask, so the host can route or silence a voice. Cheap if planned, awkward if
  bolted on.
- In the browser none of this applies: there is one output.

## Order of building

Not all sixteen at once. P7 needs one voice (the bass drum: it tests pitch sweep and the
envelope). The showpiece (D19) wants at least keys 1 to 4 and 9 to make a beat worth hearing.
A track with no voice yet is silent; its key still sequences and lights. (Every track has
one since Session 7.)
