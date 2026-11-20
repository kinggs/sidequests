# The starter drum pack

Sixteen sounds, one for each key, in the hardware's roles (D31, D32). All sixteen are from
Sonic Pi's bundled samples (R31), which are public domain under CC0. The files are byte for
byte as Sonic Pi ships them (commit on its `dev` branch, fetched 2026-11-19), names unchanged.

**To hear them:** open `index.html` in this folder. On the live site:
`https://<owner>.github.io/sidequests/pocket-instruments/samples/`

Chosen without ears: by measuring length, pitch and brightness against each role, preferring
short electronic sounds. The owner's ear overrides any row; a swap is a new file, a new row
and a line in `LEARNINGS.md` if it taught something. 377 KB in all.

| Key | Role | File | Freesound author | Original | Why this one | SHA-256, first 12 |
|---|---|---|---|---|---|---|
| 1 | Bass drum | `bd_haus.flac` | Rodrigo The Mad | http://freesound.org/people/Rodrigo%20The%20Mad/sounds/137722/ | clean, 55 Hz, 215 ms | `b9aa2aa81a8c` |
| 2 | Snare drum | `sn_dolf.flac` | Dolfeus | http://freesound.org/people/Dolfeus/sounds/57534/ | body near 200 Hz, bright, 140 ms | `88d04c0cf427` |
| 3 | Closed hat | `hat_bdu.flac` | bdu | https://freesound.org/people/bdu/sounds/802/ | 54 ms | `b6335e7f423c` |
| 4 | Open hat | `hat_cats.flac` | TheEndOfACycle | https://freesound.org/people/TheEndOfACycle/sounds/674293/ | 250 ms | `df3c99c42156` |
| 5 | Synth snare | `elec_hi_snare.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13125/ | electronic, 160 ms | `73dca64f3c99` |
| 6 | Sticks | `elec_pop.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13134/ | short knock near 500 Hz | `c7cd99162f0a` |
| 7 | Cymbal | `elec_cymbal.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13143/ | electronic, 390 ms | `00d18c8b6a81` |
| 8 | Noise | `hat_noiz.flac` | medetix | https://freesound.org/people/medetix/sounds/177909/ | a noise burst, 185 ms | `bf1912d692ee` |
| 9 | Hand clap | `perc_snap.flac` | SoundCollectah | http://www.freesound.org/people/SoundCollectah/sounds/109400/ | a finger snap standing in: the set has no clap | `09d5cc75cd9e` |
| 10 | Click | `elec_tick.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13113/ | 11 ms near 1 kHz | `ac3fa3c78f8a` |
| 11 | Low tom | `drum_tom_lo_hard.flac` | menegass | http://www.freesound.org/people/menegass/sounds/100064/ | 91 Hz, acoustic | `e8caf199618d` |
| 12 | High tom | `drum_tom_hi_hard.flac` | menegass | http://www.freesound.org/people/menegass/sounds/100062/ | 153 Hz, acoustic | `18d53d2dac65` |
| 13 | Cow bell | `drum_cowbell.flac` | Neotone | http://freesound.org/people/Neotone/sounds/75338/ | 1.6 kHz, 250 ms | `e2ee5f732b67` |
| 14 | Blip | `elec_blip.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13121/ | 1.8 kHz, 150 ms | `6d082528d45f` |
| 15 | Tone | `elec_ping.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13119/ | a pure tone near 880 Hz; slider A will tune it | `3a9d36527116` |
| 16 | Bass tone | `elec_bong.flac` | looppool | http://www.freesound.org/people/looppool/sounds/13137/ | a low tone near 310 Hz; slider A will tune it | `e4f76c4bff74` |

## As the engine reads them (D50)

`raw/<name>.s16` is each file as the engine plays it: mono, 16-bit little-endian, 44.1 kHz,
its loudest point at full scale. `tracks.txt` lists them in key order, one name a line;
every host reads it. Both are made and committed by `python3 samples/make-raw.py` (needs
ffmpeg; the same bytes every run). After a swap, run it again and commit both.

## Licence

Creative Commons Zero 1.0: https://creativecommons.org/publicdomain/zero/1.0/

Sonic Pi's README for these files says they are "from http://freesound.org and have also
been placed in the public domain via the Creative Commons 0 License", and that many were
trimmed for Sonic Pi. ⚠ CC0 is each uploader's own declaration; the Freesound pages above
were not opened one by one. No credit is required; the authors are listed because it is right.

## Not from here

Nothing in this folder comes from Teenage Engineering's hardware or from a recording of it
(README rule 6).
