# References

Outside facts this project relies on. Every entry was read on the date shown; web pages,
licences and registrations change, so re-check an entry before acting on it. ⚠ marks a claim
that was not confirmed at its primary source.

All entries below were checked on **2026-11-18**.

## Rules and rights

| # | Fact | Source |
|---|---|---|
| R1 | VCV plugin ethics guidelines forbid cloning a product's "brand name, model name, logo, panel design, or layout of components" without the owner's permission; required for the VCV Library and for a commercial plugin licence. A free plugin may use any licence, MIT included, under the non-commercial exception; copying significant Rack code forces GPLv3 | https://vcvrack.com/manual/PluginLicensing |
| R2 | VCV refused a plugin whose panels resembled Serge and Buchla modules (31 Dec 2023, closed 18 Aug 2024): "Typically we don't allow clones of component layouts or panel designs without permission from the owner" | https://github.com/VCVRack/library/issues/780 |
| R3 | VCV asked a developer "Do you have permission from Mannequins to make this port?"; permission confirmed, plugin stayed. Later submissions declare permission up front (#845, #970) | https://github.com/VCVRack/library/issues/691 |
| R4 | US design patent D738,348 "Synthesizer", Teenage Engineering AB, inventor Jesper Kouthoofd, filed 21 Oct 2014, issued 8 Sep 2015, application 29/506,831. **Drawings read 2026-11-18:** Fig. 3 (front) shows the whole Pocket Operator in solid lines, so all of it is claimed: hanger, board outline, display with its two pin rows, a top row of three keys and two knobs, a grid of five columns by four rows of exposed tact switches, the side battery clips | https://patents.justia.com/patent/D738348 |
| R5 | US design patent D741,282 "Synthesizer", same owner and inventor, filed 21 Oct 2014, granted 20 Oct 2015, listed active with expiry 20 Oct 2029. **Drawings read 2026-11-18:** Fig. 3 (front) puts the hanger and the display in broken lines (not claimed) and claims the rest: the rounded portrait board outline, the top row of three keys and two knobs, and the five-by-four grid of exposed tact switches. This is the broader of the two: it covers that board and key arrangement whatever the display shows | https://patents.google.com/patent/USD741282S1/en |
| R6 | US design patent D789,955 "Display screen or portion thereof with graphical user interface", filed 4 May 2015, granted 20 Jun 2017, with continuations D820874, D845334, D889495. **Drawing read 2026-11-18:** it claims the display artwork itself (a sewing machine, a figure in a hat, thread spools, a metronome, a dashed step row) with the whole device in broken lines. So the display art is protected separately from the board. ⚠ Continuations not viewed; they likely cover other models' artwork. ⚠ Term: filed before 13 May 2015, so 14 years from grant, to June 2031 (reviewer's reading) | https://patents.google.com/patent/USD789955S1/en |
| R7 | US trademark POCKET OPERATOR, serial 88789533, registration 6647101, registered 15 Feb 2022, live, Class 9, "POCKET" disclaimed, first use 22 Jan 2015. ⚠ Earlier registration 4967053 cancelled (aggregator only). ⚠ EU and UK registers not searched | https://tsdr.uspto.gov/statusview/sn88789533 |
| R8 | Teenage Engineering and Google released "Pocket Operator for Pixel", a free app, in June 2022 | https://www.musicradar.com/news/teenage-engineering-pocket-operator-google-pixel |
| R9 | Teenage Engineering's IP page protects the "material" in its products (samples, sound files, patterns, "image data"), forbids redistributing it raw, discourages reverse engineering of firmware, and is silent on product design, lookalikes and emulators. ⚠ Terms of service quotes came through a summarising fetch | https://teenage.engineering/ip-rights-te-products · https://teenage.engineering/terms-of-service |

## Precedents

| # | Fact | Source |
|---|---|---|
| R10 | Audible Instruments: panel graphics "used and distributed with permission" of Mutable Instruments, whose originals are open (MIT, GPL3, CC BY-SA). Befaco: panels used with permission, source GPLv3. Erica Synths: published by the brand itself | https://github.com/VCVRack/AudibleInstruments · https://github.com/VCVRack/Befaco · https://library.vcvrack.com/EricaCopies |
| R11 | Browser clones. `ulnd/po-12`: MIT, active 2026, 16 samples of unstated origin. `franeklubi/pocket-operator-simulator`: MIT on code, artwork reproduces the PO-20 face with Teenage Engineering and Cheap Monday logos. `jjbenson85/po-33`: no LICENSE file. `padraigfl/music-sequencer`: no LICENSE file. `mjoslyn/seqbaby`: no licence. `bnjreece/awesome-te`: CC0, links only | the repositories named |
| R11a | No Teenage Engineering takedown, cease-and-desist or public comment on a fan clone was found, and no praise either. ⚠ Absence of evidence. GitHub's DMCA archive has no hit for either name | https://github.com/github/dmca |
| R11b | Klon's trademark and trade-dress suit against Behringer's parent over a pedal lookalike was dismissed after the product was renamed and restyled. ⚠ Settlement inferred by the press, no ruling | https://www.musicradar.com/guitars/klon-centaur-bill-finnegan-behringer-lawsuit-dismissed |
| R11c | A VCV recreation of the OP-Z exists on GitHub (MIT, created Oct 2026, disclaims affiliation). ⚠ Library status not checked | https://github.com/un1tz3r0/vcvopxyz |
| R11d | Press report (9 Oct 2026) that Teenage Engineering's founder plans to stop making synthesizers. ⚠ Unconfirmed by the company | https://cdm.link/end-of-teenage-synths/ |

## Rust in Rack

| # | Fact | Source |
|---|---|---|
| R12 | `dbonel/potential`: MIT, Rack 2, Rust `staticlib` bridged with the `cxx` crate, last commit 2024-06-29, "not in the VCV Rack library" | https://github.com/dbonel/potential |
| R13 | `Miff-Real/DanTCrusti`: GPL-3.0, Rust `staticlib` with a plain C ABI, pinned to nightly Rust, last commit 2025-11-29 | https://github.com/Miff-Real/DanTCrusti |
| R14 | Windows linking failed for two authors; the 2023 fix was to add the output of `cargo rustc -- --print native-static-libs` to the linker flags. ⚠ A community member says Rack 3 moves to a pure C plugin API (second-hand) | https://community.vcvrack.com/t/adventures-in-plugin-development-in-rust/19979 · https://community.vcvrack.com/t/using-rust-for-vcv-rack-modules/25294 |
| R15 | VCV's founder, 2020: "You can compile Rust code that exposes a C interface and call that interface from C++." No staff statement on Rust in Library builds was found | https://community.vcvrack.com/t/rust-rack-interop/9496/2 |
| R16 | VCV's plugin toolchain has no Rust or cargo. Linux sysroot glibc 2.23; Windows MinGW-w64; macOS SDK 12.3; Rack SDK 2.6.6. Rust needs glibc 2.17+, macOS 10.12+ (11.0 on arm64); Rack targets macOS 10.9 and `nehalem` | https://github.com/VCVRack/rack-plugin-toolchain · https://doc.rust-lang.org/nightly/rustc/platform-support.html |
| R16a | Phona: MIT, Rust `staticlib` plus C header, working cross-platform Makefile, CI on native runners. Author wrote on 2026-11-17 that it was submitted to the Library. ⚠ Outcome unknown: **re-check this one** | https://github.com/millxing/Phona · https://community.vcvrack.com/t/phona-voice-simulation-using-chimera-engine-prototype/26377 |
| R17 | Cardinal is a GPLv3+ build of Rack with a web target; it loads only bundled GPL-compatible modules. ⚠ Web build details checked lightly | https://github.com/DISTRHO/Cardinal |
| R18 | Rack panels are 128.5 mm high and a multiple of 5.08 mm wide; SVG, no text, only simple gradients. Expander messages have one sample of latency. A parameter is one float; `dsp::RingBuffer` is single-producer single-consumer | https://vcvrack.com/manual/Panel · https://vcvrack.com/manual/PluginGuide |

## WebAssembly in an AudioWorklet

| # | Fact | Source |
|---|---|---|
| R19 | AudioWorkletGlobalScope has no TextEncoder or TextDecoder (spec issue open since 2022). wasm-bindgen's glue changed behaviour here in Sep and Oct 2025; its official worklet example needs nightly Rust, atomics and isolation headers | https://github.com/WebAudio/web-audio-api/issues/2499 · https://github.com/wasm-bindgen/wasm-bindgen/issues/2367 |
| R20 | `davenull/birdsynth` (BSD-3): raw `wasm32-unknown-unknown` with a C ABI, zero imports, bytes fetched on the main thread and passed in `processorOptions`, message passing, no shared memory. `chaosprint/glicol` (MIT): wasm-bindgen with the same hand-off | https://github.com/davenull/birdsynth · https://github.com/chaosprint/glicol |
| R21 | SharedArrayBuffer needs a cross-origin-isolated page. GitHub Pages cannot set the headers; the `coi-serviceworker` workaround is reported to conflict with an app's own service worker | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer · https://github.com/orgs/community/discussions/13309 |
| R22 | ⚠ No credible measured figure for Web Audio output latency on Android Chrome was found. One open WebKit bug (Oct 2026) reports crackle on iOS 27 with an echo-cancelled microphone open | https://bugs.webkit.org/show_bug.cgi?id=326286 |

## Checked 2026-11-19 (Session 1)

| # | Fact | Source |
|---|---|---|
| R16b | **Re-check of R16a: Phona has not been submitted.** The author's posts (14 to 16 Nov 2026) say the Library toolchain does not build Rust, that he builds each platform himself (Mac signed, others not), and that he must be identity-verified by VCV before he can submit. The README says "not in the VCV Library yet"; the Library search lists no Phona. R16a's "submitted on 2026-11-17" was wrong: it was an intention. ⚠ Only the thread's first page was read. Still the one live test of O2 | https://community.vcvrack.com/t/phona-voice-simulation-using-chimera-engine-prototype/26377 · https://github.com/millxing/Phona |
| R23 | Teenage Engineering's PO-12 guide: the key names (sound, pattern, bpm, function, fx, play, write, knobs A and B), the combinations, three tempo presets (80, 120, 140), fine tempo 60 to 240, sixteen patterns, chains of up to sixteen, sixteen effects, six sync modes. Our own summary is `WORKFLOW.md`. Silent on: the swing range, the sync pulse rate, what a grid key does in play mode, what the lights show, what the knobs do per sound. It contradicts itself on effects 9 and 10 and on the step-repeat keys. ⚠ Read through a text extraction; key positions did not survive it | https://teenage.engineering/guides/po-12/en |
| R24 | Rack's MIDI-Map module "controls parameters of other Rack modules via a hardware MIDI CC controller". The manual does not mention notes for it. MIDI-Gate turns held notes into gates on ports, not parameters. The computer keyboard is offered only as a MIDI note driver | https://vcvrack.com/manual/Core |
| R25 | A Rack widget gets `onHoverKey`, which "occurs when a key is pressed, released, or repeated while the mouse is hovering a Widget". ⚠ Whether several held keys are all reported is not stated; try it at P8 | https://vcvrack.com/docs-v2/structrack_1_1widget_1_1Widget |

| R26 | Teenage Engineering's Pocket Operator FAQ (all models): "press buttons [1-16] to play different sounds"; in write mode the keys "place triggers in the corresponding grid positions" and the pattern is shown by lit LEDs; hold a step and turn knob A to change that step's pitch; write is at the lower right, function at the top right under knob B; six sync modes | https://teenage.engineering/guides/po-faq/en |
| R27 | Sound On Sound review (June 2016): the PO-12's sixteen sounds "are previewed by hitting the step keys"; sound + key selects one to program; with write held, each key taps in its own sound "irrespective of selection"; in playback the LEDs chase and flash "to show which sounds are being triggered"; the knobs set pitch and length of each drum voice; three buttons along the top, four down the right | https://www.soundonsound.com/reviews/teenage-engineering-pocket-operators |
| R28 | A third-party PO-12 cheat sheet (dated 2026-04-09). Adds: a key in write mode enters or removes a step; hold key + bpm in write mode for the step repeat; "knobs A+B shape each sound independently". ⚠ It says it is condensed from the guide, repeats one of the guide's two versions of effects 9 and 10, and gives fx + pattern for clearing a pattern where the guide gives function + pattern. Treat as a reading of R23, not a second witness | https://dbroesch.github.io/cheat-sheets/po12-cheatsheet.pdf |
| R29 | The Pocket Operator sync pulse is reported as two per quarter note, the Korg convention. ⚠ One forum post; nothing from the maker | https://forum.conductivelabs.com/printthread.php?tid=1282 |

| R30 | `ulnd/po-12` (MIT, commit f269d7f of 2026-07-06) cloned and read outside this repo. It implements: sixteen sample players, one per key; tap to play in play mode without selecting; write mode toggling the chosen sound on a step; sound and pattern keys that latch on a click; a pattern change that waits for the bar's end; three tempo presets; a keyboard block for the grid. It does not implement: any effect of the knobs on sound (its own tour says so), swing, fine tempo, effects, chains, locks. Its sixteen WAV files carry no statement of origin. Its face reproduces the original's display scene, wording and outline: it is an example of what D20 rules out, and must not be given to a design tool as reference | https://github.com/ulnd/po-12 |

| R31 | Sonic Pi's bundled samples (206 FLAC files): its own README says those prefixed `arovane_` were donated under CC0 and all others are from Freesound and "placed in the public domain via the Creative Commons 0 License", and links each to its original. Debian's copyright file for the package lists them as CC0 file by file. No hand clap in the set. ⚠ Individual Freesound pages not opened | https://github.com/sonic-pi-net/sonic-pi/blob/dev/etc/samples/README.md · https://metadata.ftp-master.debian.org/changelogs/main/s/sonic-pi/sonic-pi_3.2.2~repack-8_copyright |

| R32 | Freesound's API: every call needs an API credential (token); previews can be fetched with a token; downloading an original file needs OAuth2, a signed-in user. Requests are throttled. ⚠ Read from a search summary of the official pages, not the pages themselves; the limits were not confirmed | https://freesound.org/docs/api/authentication.html · https://www.freesound.org/docs/api/overview.html |

Patent drawings are read from the Google Patents pages and are not stored in this repo (README rule 6).

## Not yet checked

- EUIPO and UK registered designs and trade marks for Teenage Engineering AB.
- The drawings of the continuations of R6 (D820874, D845334, D889495).
- Whether "Pocket Instruments" is free as a name in any trademark register.
- A Pocket Operator's exact dimensions (measure the hardware).
