# Learnings

A dated notebook. Newest at the bottom. Write what surprised us, what broke and why; a result
belongs in `PROOFS.md`, a change of course in `DECISIONS.md`, an outside fact in `REFERENCES.md`.

## 2026-11-18 — the first review

- **A second AI's brief reads as verified when it is not.** The brief cited the VCV licensing
  page and missed the ethics rule on the same page that blocks its headline decision. Lesson:
  open every cited source; a link in a brief is a claim, not a check.
- **Precedent cut the other way.** The three Rack ports offered as precedent all had the
  owner's permission. "It exists in the Library" told us permission was given, not that none
  was needed.
- **"Feasible" and "shippable" are different proofs.** Rust linking into one Rack plugin on one
  machine says nothing about four platforms or the Library's build server. They became separate
  proofs (P3, P5).
- **The first milestone was chosen for being easy to build, not for what it would teach.**
  Asking "what would this still leave unknown?" moved the first instrument from a keypad to a
  small rhythm machine.
- **Two searches found two different design patents.** D738,348 and D741,282 share a filing
  date and title. One search would have looked complete. Neither has had its drawings read.
- **A hint I gave a research agent was wrong.** I told it US design patents last 15 years; for
  applications filed before 13 May 2015 it is 14. The agent corrected it from the source.
  Lesson: give agents questions, not answers.

## 2026-11-18 — reading the patent drawings

- **Ten minutes with the drawings beat an afternoon of inference.** Three sources described
  the patents without anyone opening the figures. The figures are public and one page each.
- **Solid and broken lines are the whole story in a design patent.** The two "Synthesizer"
  patents look identical until you see that one draws the display and hanger dashed. That one
  is the broader: it covers the board and keys under any display.
- **"Same format, own look" was looser than I thought when I recommended it.** The format's
  most recognisable part, the key and knob arrangement on a bare board, is exactly what is
  claimed. The decision stood but needed a sharper brief (D20).

## 2026-11-19 — Session 1, the engine interface

- **A ninety-line model found a fault the prose hid.** The first draft started the table
  clock's accumulator one increment short of a tick, so tick 0 would fire on the first frame.
  Setting the tempo after reset then left the phase wrong, and one sample rate in three gave
  two extra events. Reading the draft did not show it; running it at three rates did. The fix
  is a flag (`ENGINE.md` §4). Lesson: a timing rule is not designed until something has run it.
- **The trace is the same everywhere because the sequencer never sees a frame,** not because
  the arithmetic is careful. Once every tick is emitted exactly once and in order, the hosts
  can only differ in *when*, and the trace does not record when.
- **External swing came down to one question: what happens to ticks the clock never reached?**
  Flush them at the next edge and every event still fires once. Drop them and a clock that
  speeds up loses notes, differently at each sample rate.
- **"Submitted" was "intends to submit".** R16a recorded Phona as submitted to the Library.
  The posts say the author must be verified first. A date on a forum post is not the date of
  the thing it promises (R16b).
- **The published guide contradicts itself in two places** and is silent on the things a
  player learns in the first minute (what a tap does in play mode, what the lights mean).
  The hour with the hardware is not optional; `WORKFLOW.md` lists what to look for.
- **Rack's own MIDI mapping is controllers only, as far as the manual says.** D23 hoped notes
  would reach the keys for free. They do not (R24).

## 2026-11-19 — searching for what the guide left out

- **The dearest unknown turned out to be a scope question, not a detail.** Two sources say
  each grid key plays its own sound. That makes "two to four sounds" (D12) a difference a
  player meets on the first tap, and it changes what the keys must show (O11).
- **A tidy cheat sheet was the guide again.** It looked like a second source and repeated the
  guide's own inconsistency. Agreement between a document and its summary is not
  corroboration (R28).
- **A review answered what the manual did not.** Reviewers describe what happens when you
  press things; manuals list combinations.

## 2026-11-19 — reading an open-source emulation

- **Source code answers "what happens when" better than any document,** but only for what
  its author built. This one settled four workflow questions and was silent on every question
  about the knobs, because its knobs do nothing.
- **An emulation is a witness, not the hardware.** It agrees with the reviews where they
  overlap, which raises confidence; where it stands alone (a tap does not change the chosen
  sound, stop returns to step 1) it is still one person's reading.
- **Its samples were worse evidence than its code.** Several are cut off at 25 to 60 ms and
  do not match the roles the guide gives. Measured for rough numbers, trusted for little.
- **The same repo is the clearest picture of what our look must not be**: the original's
  display scene, wording and outline, redrawn. Useful to know before any of it reaches a
  design tool by accident.

## 2026-11-19 — Session 2, the core (P1 and P2)

- **The specification held.** The core was written from `ENGINE.md` without looking at the
  traces, and all four matched on the first run, on both clock sources, at every rate and
  block size. The reset trace had been written by hand and committed before any engine code.
  No trace was edited; no fault was found in `ENGINE.md`'s rules.
- **What was wrong was my own tests, four of them, and `ENGINE.md` settled each.** I expected
  a tempo change halfway through a step to land the next step on frame 15 000; the core said
  15 001. The rule says a command lands before its frame's advance, and that advance is the
  stretch from the frame before. So the core was right and a tempo change costs up to one
  frame of phase, once. The same slip in the sample-rate test, a miscounted tick in the
  source-switch test, and one malformed assertion. Each wrong expectation is kept as a
  comment beside the right one. Lesson: when the test and the code disagree, read the rule
  before touching either.
- **The text was ambiguous in seven places a model never meets.** A model's author knows what
  they meant; a second implementer has only the words. The sharpest: does `SOURCE table` on a
  clock already on the table count as "switching"? If it did, every fixture run would lose
  tick 0's frame. All seven are D42.
- **A harness that passes is not evidence until it has failed.** Three faults were put into
  the core on purpose. My first check of the C++ harness reported "0 failed" on a broken
  core: the script had rebuilt the library and not relinked the program. Second lesson from
  the same hour: no fixture catches an edge clock that stops interpolating at tick 47,
  because no fixture swings past 47 and the flush at the next edge repairs the trace. The
  trace proves order, not timing; timing needs tests that look at frames, and the Rust ones
  now do.
- **"No allocator" is better checked on the object than promised in the source.** The static
  library's own object asks for `memcpy` and `memset` and nothing else: not even `abort`, so
  no panic path survived. `make test` checks that list on every run.
- **The static library is 5 MB and 9 KB of it is ours.** The rest is Rust's precompiled
  `compiler_builtins`. A linker takes only what is asked for, so it costs nothing, but
  thirteen of those members want `rust_eh_personality`. ⚠ If the core ever uses 128-bit
  arithmetic, Rack's link will meet that symbol. `Clock::rescale` avoids a 128-bit product
  for this reason as much as for the WebAssembly size.
- **A `no_std` crate cannot have integration tests of the usual kind.** The library carries
  the panic handler, and a test program that links it beside `std` gets two. The tests live
  inside the crate (`core/src/tests/`), where `cfg(test)` leaves the handler out, and call
  the C functions as a host would.
- **mise and `rust-toolchain.toml` are two pins, and mise's wins.** mise sets
  `RUSTUP_TOOLCHAIN`, which rustup obeys over the file, so the file's `targets` line is not
  acted on either. The Makefile checks the two agree and adds the wasm target itself.
- **Options on a mise tool line cost a `mise trust` in every fresh clone.**
  `rust = { version = …, targets = … }` made a new clone refuse to run until trusted;
  `rust = "1.100.0"` does not. Trust is once per folder per machine, so it is survivable,
  but the bare line needs nothing. Found only because the clean-checkout bar was run in a
  real second clone rather than with `cargo clean`.
- **Testing a version mismatch by editing `mise.toml` installs that version.** mise fetched
  Rust 1.99.0 the moment a shim ran. It was removed. Test such a check on a copy.
- **The build is reproducible across folders**: the same `.wasm` bytes from a clone in
  another path. Worth knowing before P5.

## 2026-11-19 — Session 3, the proofs that could still change the architecture

- **Rust in Rack was the non-event the brief feared most.** The plugin built, linked and
  ran on the first try, in under two seconds from clean. The risk was never the link on one
  machine; it is the other three machines (P5), and that is still open.
- **Rack runs headless, and that turned an eyeball proof into a counted one.**
  `Rack -h -u <folder>` loads a patch and steps the engine with no screen and no sound card.
  So the module was made to check itself: it plays a fixture, compares every pass with the
  fixture's trace, and Rack's log carries the count. What is left for a person is only what
  needs a person: a dropout, a meter, a scope.
- **The warning I wrote in Session 2 was wrong.** I said 128-bit arithmetic would make the
  Rack link ask for `rust_eh_personality`. Tried on purpose: it took `__udivti3` and nothing
  else. A warning nobody has tested is a guess with a ⚠ on it. It is now a check that runs.
- **The interface held and the recipe beside it did not.** `ENGINE.md` said "two buffers and
  an atomic index" in passing, as if it were obviously safe. It is a textbook race.
  ThreadSanitizer found it in a second; a million ordinary reads never showed a torn
  snapshot. Both facts matter: it would have shipped, and it would have failed once a year
  on someone else's machine.
- **A sanitizer cannot see into Rust on stable.** ThreadSanitizer for Rust is nightly only.
  The harness touches one plain byte around every call into the core, so two threads inside
  it race where the sanitizer looks. Worth knowing before trusting "clean".
- **A flat-out test thread hides the bugs a real one shows.** With the audio thread
  spinning, a load on its own channel never once swapped with the edit behind it. With the
  thread idle between blocks, as a real callback is, it went wrong in most rounds. And the
  idle had to go before the block, not in the middle of it: my first placement hid it
  again. The shape of the test thread is part of the test.
- **`pi_process` with no frames does nothing, and that has a cost.** A load that arrives
  behind edits in the same block cannot have them applied first, so it waits a block. Fine
  for a host; it is the kind of thing only writing the host finds.
- **Bit-identical sound was a design choice, not a hope.** Native and WebAssembly agree to
  the last bit because the voice never calls a maths library. The moment a voice wants a
  real `sin` or `exp`, the −80 dB bar starts to matter. Until then it is not a tolerance,
  it is an equality, and a far stronger gate.
- **A fault that is too small proves the bar, not the check.** My first planted error
  measured −90.9 dB and the comparison passed, correctly. I had to plant a bigger one to
  see it fail. Then, restoring the file with `git checkout` did nothing, because the file
  was new and untracked: the fault was still in until I noticed. Restore from a copy, and
  check the restore.
- **macOS found a symbol the other three did not.** The same Rust, filling sixteen pairs of
  slider values, became a call to `memset_pattern16` on macOS only. Harmless (it is in
  every macOS), but the check caught it the moment the voice landed. A check on one
  platform says little about another.
- **rustc has a floor under Rack's.** Rack builds for macOS 10.9; rustc will not stamp
  below 10.12. Asked for 10.9 it warns and carries on. Nothing in the core can need 10.12,
  but nobody has watched a macOS linker take it.
- **The trace cannot see timing, again.** A worklet that put every command a frame late
  would still pass P4, by design. What P4 on a desktop proves is that the engine in a
  worklet makes the right events. Whether they are on time is the phone's half.
- **No Playwright was needed.** The page posts its own result to the little server that
  served it. Two browsers, no protocol, forty lines.
- **A safety check stopped a command that deleted nothing,** because a script in it used
  shell forms the checker could not read. The fix was to make the edits with the file tools.
  Long inline scripts are the wrong tool for editing files in any case.
- **Tools assumed, not present:** `/usr/bin/time` and `xxd`. Each failed silently inside a
  pipe and the output looked like a result. The repo's hook that refuses a gate piped into
  `tail` caught a third. Read exit codes, not tails.

## 2026-11-19 — Session 5, the minimum beat

- **The rule held without effort.** Two filters, three noise sources, a pitch sweep and a
  float-to-integer step a frame, and native and WebAssembly still gave the same bytes the
  first time. `+ − × ÷` and nothing else is not a burden for drum synthesis: a filter's
  tangent is two calls to the polynomial sine and a division.
- **Six squares starting together are a step, and a high-pass passes a step whole.** The
  first hats peaked at 1.8, from one tick at the trigger louder than the hat. Starting half
  of them low makes the sum start at 0. Measure peaks per voice, rate and slider before
  trusting a level.
- **The engine outgrew a number nobody had written down as a limit.** At 752 bytes it
  broke the browser's voice count, which packed copies 512 bytes apart, and a test's sanity
  bound of 512. Neither was in `ENGINE.md`; both were the hosts' guesses. Hosts should ask
  `pi_size`, and the ones with fixed room are now named in the test.
- **A recipe's own words can disagree with the thing it names.** `VOICES.md` says the open
  hat cuts the closed one "as a real hat does"; a real hat does the reverse. Built neither
  way, written up (O13).
- **A scenario written for one voice silently became a test of two.** `render-click.json`
  stepped track 2 when it was silent. Its recorded hashes changed the day track 2 got a
  hat. A scenario should name only the tracks it means to sound.

## 2026-11-19 — Session 6, CI for the four Rack targets

- **The Macs passed first time; the two platforms that looked simplest did not.** Linux
  failed on my own script (a `rustc` asked outside the folder that pins it: with rustup's
  `--default-toolchain none` there is no Rust anywhere else). Windows failed on a check
  that was stricter than Rack.
- **Check what the host ships before calling a dependency missing.** The SDK links Windows
  plugins with `-static-libstdc++` only, so every one imports `libgcc_s_seh-1.dll`. That
  looked fatal until Rack's own Makefile showed it copies that DLL beside `Rack.exe`. The
  first version of the check refused it; the record of why it now allows it is R44.
- **An object's stamp is not the plugin's.** The core is built for macOS 10.12, the plugin
  is stamped 10.9, and the linker only warns. A version check on the finished file says
  10.9 and is wrong about what it contains.
- **Small tool differences break portable scripts.** LLVM's `lipo -archs` ends its line
  with a space and Apple's does not; macOS's `tar` and `sed` are BSD. Running the check
  here on the downloaded artefacts, with LLVM's tools standing in for Apple's, found the
  first; reading for BSD forms found the others before they ran.
- **Docker was installed but not usable** (no `docker` group), so CI was the only place to
  test the Linux build. Two runs of about two minutes each was cheaper than changing the
  machine.

## 2026-11-19 — Session 7, the other eleven voices

- **A test that sized its own buffer was one engine away from writing past it.** It gave
  `pi_init` a fixed 1 KiB and the engine became 1 416 bytes. It refused nothing wrong only
  because the refusals ran first, each for being too small rather than for the reason it
  named. Size test memory from `pi_size`, and give each refusal enough room that only its
  own reason applies.
- **A recipe's adjective mattered.** "Plus short noise": built with one envelope, the synth
  snare's noise lasted as long as its body and buried the pitch the test was counting.
  The test was right and the voice was wrong.
- **A planted fault has to be a fault.** Moving the noise's corner over a narrower range
  still made it brighter, and the brightness test rightly passed. A plant that ignores the
  slider is the fair one. A malformed plant (a reversed range) told me nothing either way.
- **The refactor was proven, not assumed:** the previous commit, built in a scratch
  worktree, rendered the five older voices and the beat to the same bytes as this one.
  Adding exact zeros to a sum leaves it alone, except `-0.0 + 0.0`, which is why the old
  test's partial sum became the full one.

## Session 8: samples per key (2026-11-20)

- **An empty sample is silent anyway, so "clearing stops it" proved nothing.** The read is
  bounds-checked, so a cleared sample was silent whether or not it was stopped. The case
  that matters is a sample replaced while it sounds: the old pointer may already be freed.
  The test now replaces it and checks nothing plays until the next hit.
- **A plant that changes nothing at the slider's middle is not a fault there.** "Whole only
  at the top" gives the same length as "whole from the middle" at the middle. The fair plant
  breaks the lower half, which a quarter-way reading catches.
- **A check with slack hides exactly the fault it was for.** "At least 14 keys differ, peak
  over 0.3" let a missing sample through: the key fell back to its code voice, which peaked
  at 0.34. All sixteen differ in practice, so all sixteen are required.
- **A check's own server is part of the check.** The listening check timed out, not
  failed: its server did not serve `.s16` or `.txt`, so the engine never started and the
  page waited four seconds a key. The page now reports at once when it has no engine.
- **A fixed offset hides until the thing before it grows.** `check-patch.mjs` put the
  snapshot 1 KiB into the host's page; the engine passed 1 KiB in Session 7, and nothing
  failed because `pi_load` reads before it writes. Search for every fixed room when a size
  bound moves, not only the ones you remember.
- **Read the files before deciding their format.** The plan said 48 kHz; the pack is 44.1
  kHz, and storing it at its own rate removed a resampling step.

## Session 10: keys and the view in the core (2026-11-20)

- **The contract ran as written.** Three fixtures were worked out by hand from `ENGINE.md`
  §13 and §14, committed, and then run: all passed first time, in Rust, C++ and Node. The
  cost of Session 9 writing every row as a table was repaid here: the code is the table.
  What the text did not say (D59) was all at the edges: rounding, a flag's exact life, what
  counts as "using" a key.
- **A check of the checks needs its own proof that it ran.** The script that plants faults
  reported 83 of 83 caught. Not one test had run: outside this folder the `cargo` shim has
  no toolchain, so every run failed, and "failed" was read as "caught". It now runs the
  unplanted copy first and requires it to pass, and counts a plant as caught only when a
  failing test is named. The same trap again by hand: a C++ plant that did not compile left
  the previous plant's binary in place, which failed for its own reason.
- **Four of the new rule tests were wrong before the core was.** A rounding boundary off by
  one (65 353 is the first value that gives 240 bpm, not the last that gives 239); a test
  that set the volume to 1 and then expected 16; a stop sent a frame after the step it was
  meant to prevent; and a "busy passage" that held its keys down, so most presses were
  repeats and it produced 37 events. In each case `ENGINE.md` decided, and it was the test.
- **A fixture caught what the rule tests had no test for.** "A new press of bpm starts
  unused" failed only `keys-bpm-family`. The rule is now in the rule tests too. A fixture
  is a walk through the workflow; it should not be the only thing holding a rule.
- **A key in its step's own frame is early on the table too,** not only on edges. Planted
  in each harness, it gave `95 trig` where 96 was due: a command lands before the clock
  moves on its frame (§3). The fixtures README said this was about the edges run alone
  until the plant showed otherwise.
- **Three reports that agree prove less than they seem to.** Each harness writes the views
  it got and checks them against the fixture itself; the three reports are then compared
  with each other. A harness that stopped checking would still agree with the other two.
  That was already true of traces. What holds it up is that a wrong view in a fixture
  failed all three harnesses when planted.
- **Planting "keys 23 to 31 are keys" aborted the test run** rather than failing a test: a
  grid key numbered 23 shifts a 16-bit word by 23. The guard is one comparison, and several
  lines trust it. Session 11's clamp on a loaded volume is the same kind of guard for
  `1 << volume` in the view.
- **A guard that only looks at the last file.** The fixtures-only commit reached CI early
  (another session's push carried it), and the Rack build went green with three
  `jq: error … not fixture format 1` lines in its log. Given several files, `jq` exits with
  the last file's status, and the last fixture was a good one. So the Probe's "a command I
  do not know" guard had never been able to stop a build unless the bad fixture sorted
  last. `rack/Makefile` now runs `jq` once a file; a planted unknown command in
  `reset-mid-bar` stops the build. Read a green run's log when you expected red.


## Session 11: snapshot version 2 and both layouts (2026-11-20)

- **Saving the old snapshots before touching the code paid for itself.** Seven version 1
  snapshots went into `fixtures/snapshots-v1.txt` from the ABI 4 report first. Every later
  claim that version 1 still loads is held to bytes an old core wrote, not to a version 1
  that today's code builds for its own test, which would agree with itself whatever it got
  wrong.
- **"Payload size" was ambiguous only to the code.** §8's 300 for 316 bytes means the
  payload excludes the header and the CRC; the first version 2 draft counted the CRC
  (376, not §15's 372). The layout test caught it at once. Read a size field off the old
  table's numbers, not off its name.
- **A planting script's copy kept the files' old times, and cargo trusted them.**
  `shutil.copytree` copies modification times. A restored, unplanted copy looked older
  than the last plant's build, so cargo reused the planted binary and the "unplanted"
  run failed. Session 10's guard (the unplanted copy must pass first) is what caught it.
  Copy without metadata (`copy_function=shutil.copy`).
- **A plant aimed by text can land on the wrong line.** `old != p` appears in both `PROB`
  and `SOUND`; the first plant hit `PROB`, failed a different test, and looked like a
  miss. Aim each plant with enough context to be unique, and assert it is.
- **A panic inside `pi_load` aborts the run, not a test.** Planting "check the length
  against version 1's size" let a short version 2 reach a slice, which panics inside an
  `extern "C"` function and aborts (P1's rule, working as meant). Rerun alone with one test
  thread to name the test it aborted in.
- **A harness check written for one snapshot version silently assumed it.** `race.cpp`'s
  last step entered each fixture's pattern "over whatever is there", which was enough while
  the snapshot held only the pattern. With version 2 the churn's slider moves, volume and
  choice leaked into the saved bytes and the check failed. Every place that builds a
  "known" snapshot by hand has to set every field the snapshot holds.
- **The Probe's fixed-size copy was the real compatibility bug, and only a host test could
  show it.** The core loaded version 1 from the first build; Rack would still have dropped
  an old patch's beat unread, because `Probe.cpp` copied exactly `PI_SNAPSHOT_SIZE` bytes or
  none. The self-test failed on "0 loaded" first, as the plan asked, then passed.

## Session 12: the page on a phone (2026-11-23)

- **A check that compares two missing values passes.** `web/play.mjs` first read
  `p.bpm.last` where the phase had reported `p.bpm.bpm.last`. `undefined !== undefined` is
  false, so the keys-bpm-family line passed with nothing checked; only the reload line,
  which tested a value as well, showed the slip. Every comparison now also demands its
  expected side exists, and the planted faults are run after any change to a judge.
- **Plant faults at the line, and say when an earlier line catches one.** A page that let go
  of every other finger on a new touch failed during the pattern entry, because choosing a
  sound already needs two fingers at once. The two-pointer line never ran. That still
  proves the fault is caught, but not that the line itself can fail; the record says which.
- **`aspect-ratio` with a `max-height` narrows the box, it does not shorten it.** On a
  360 × 640 screen the grid keys kept square and shrank sideways, leaving gaps. The height is
  now `clamp(60px, min(column width, room / 4), 200px)`, with no aspect ratio. Seen only in
  a screenshot at that size: the checks read classes, not geometry.
- **A virtual-time screenshot does not run an AudioWorklet.** Headless Chromium's
  `--virtual-time-budget` drew the page before any view arrived. To see the lit states, a
  scratch copy set `rhythm.latest.view` to a hand-made view and redrew. The checks never need
  that; a look does.
- **`pkill -f` with a pattern also in its own command line kills the shell running it.**
  The pattern matched the bash that ran `pkill`, which died with exit 144 before the next
  command. Stop a server by its port or by the PID taken at its start.
- **A light the page owns is drawn a frame after the press; the view's lights come with
  the view.** The latch's lit face is the page's state, not the core's, so a check that
  reads it straight after the view arrives reads the frame before (Chromium saw it still
  lit, Firefox not yet lit). Wait two animation frames before reading a page-owned light.
- **Firefox reports `AudioContext.state` as "running" a moment after audio has run.** The
  first view had already come from the worklet while the state still said "suspended".
  Judge "sound started" by what the worklet sent, or wait for the state, not both at once.
- **A sample chosen by measurement has to be measured against its code voice's range.**
  Key 16's "bass tone" sample, picked without ears in Session 8 as "a low tone near 310 Hz",
  sat 1½ to 2½ octaves above anything the code voice plays (A0 to A2), and slider A moves a
  sample only an octave either way. The owner heard no bass. Swapped for Sonic Pi's
  `bass_voxy_hit_c` (C2). An autocorrelation read the old file at 157 Hz, the README said
  310: one of them is an octave out, which is why a pitch from a script is a guess (⚠)
  and the ear decides.

## Session 13: the Rack module (2026-11-23)

- **Rack's own compiler flags change floating-point bits.** The SDK's `compile.mk` builds
  every plugin with `-funsafe-math-optimizations`. That lets the compiler regroup a sum and
  turn `x / 5` into `x * 0.2`. RETURN rebuilds the core's mix in the core's order, so it needs
  neither. The test only caught it because it was built with the plugin's own flags, not
  the harness's `-O2`. Per compiler: gcc 16 changed nothing with either flag alone; clang 23
  (macOS's compiler) broke the silence check without `-fno-associative-math`. Both flags
  are now in `rack/math.mk`, shared by the plugin and its test. Any C++ that must match the
  core's bits gets built with what ships.
- **"5 V to 1.0" out and back is not the same float.** VOICES is `5 × x` and RETURN divides
  by 5. In floats that does not always give `x` back, so "RETURN carrying a sound's own
  channel gives the same mix" can only hold to within rounding: 1.2e-7 at worst here, under
  the test's 1e-6 bound. Through a real cable it is a frame late as well. Silence, a return
  of exactly 0, is still bit for bit.
- **A parameter cannot press a key twice in one frame.** A fixture's `key_down` and
  `key_up` of one key in one `at` are two changes of one Rack parameter. On one frame the
  audio thread would see no change at all. The self-test makes its presses one a frame, from
  the frame after the step's boundary. That holds the fixture's ticks only while a step's
  presses all land inside its first tick (57 frames at 120 bpm and 44.1 kHz). So the
  edges runs use an 8 Hz LFO, not the Probe's 256 Hz, where a tick is two frames. Planting
  "presses in the boundary frame" showed the other side: a tap there carries the step
  before's tick 95, as `fixtures/README.md` says.
- **A safety net can hide the fault it sits behind.** The first not-finite test returned NaN
  on every channel. A NaN let into the sum was then cleaned to 0 by the last line before the
  jack, which the test also expected, so the plant passed. Returning NaN on one channel, and
  holding the mix to the same frame with silence there, tells the two apart.
- **A check comparing a value with itself, through two compilations, is a check of the
  compiler.** The test's own `10 tanh(5 m / 10)` and the header's were compiled differently
  under unsafe maths. Compare the mix before the shaping. The shaping check is now its own
  named check, so a failure there cannot pass for a wrong mix.
- **What a headless Rack cannot tell.** No widget is made with `-h`, so nothing drawn and
  nothing pressed by hand was seen this session: not the panel, the keys, the latch, the
  computer keys (R25), the double-click or MIDI-Map. The self-test covers everything below
  the parameters. The face is the owner's to look at.
- **A locally built plugin fails `check-dist.sh` on glibc, and that is expected.** Arch's
  toolchain brings in `_dl_find_object` (2.35) from libgcc and, now that the module holds
  a `std::shared_ptr` (Rack's font), `__libc_single_threaded` (2.32). CI builds Linux in
  Ubuntu 16.04 for glibc 2.23. The local run checks the archive's contents; CI checks the
  rest.
- **Profiled with perf (later the same day), the biggest cost was one line nobody would
  guess.** `notFinite = jacks.notFinite` was a default (sequentially consistent) store to an
  atomic, every frame. On x86 that compiles to `xchg`, a full memory barrier per sample. It
  took about 43% of `Rhythm::process`'s samples, with `dropped = pi_dropped(e)` the same.
  The hand timing with the cycle counter had put the cost in the jacks section and missed
  it, because the barrier's cost lands on the instructions after it. Per-frame stores are now
  relaxed and made only on a change. `freshWanted.exchange(false)` every frame was another
  barrier; it now loads first.
- **The rest of the profile, and what moved it.** Four modules playing, 20 s, one sample
  every 200 000 cycles. Before: plugin and libm 8 291 samples, `Rhythm::process` 3 812,
  `pi_process` 2 635, `pi_view` 837, `tanhf` 655, `lroundf` 168. After: 5 688 in all
  (−31%), `Rhythm::process` 2 481, `pi_view` 44, `tanhf` 227, `lroundf` none. The fixes:
  the view is read only on a frame where a command, an event or a load could have moved it,
  in a self-test, or every 16th frame. A slider is rounded only when its float changes; the
  rate only when Rack's changes. `tanh` is skipped on exact silence. An unpatched VOICES or
  TRIGGERS is not written. Two divisions a frame (`r / 1000`, `r / 60`) became values set on
  a rate change. The engine is now about half of the module's time; the next real gain is in
  the core, and that one would also speed up the phone.
- **perf here: user space only, and no call graphs.** `perf_event_paranoid` is 2, so
  `cycles:u` works and `-g` (any call-graph mode) fails with "Failure to open any events".
  Flat samples, then `perf annotate` and `objdump -dl` on the unstripped `plugin.so`, were
  enough. Rack must load the unstripped `plugin.so`: the installed `.vcvplugin` is stripped,
  so copy `plugin.so`, `plugin.json` and `res/` into a scratch user folder's plugin directory.
- **One self-test run in 32 failed, and the evidence went with it.** At 96 kHz, a Rhythm
  module on the 8 Hz LFO ran its whole 12 s on its table clock, with one pass cut short, as
  if its CLOCK cable never connected. Its two siblings on the same LFO were clean, and 31
  other runs were too. `selftest.sh` deleted Rack's log on exit, so the cause is not known
  (⚠ a guess: the order Rack loads modules and cables in). It now keeps the log as
  `rack/build/selftest-<rate>.log` when it fails. Read that log first if it happens again.


## Session 15: the effects, researched and designed (2026-11-23)

- **The owner's brief had one thing the sources do not support, and research first is what
  caught it.** The brief says the PO-12's effects have "FX triggers that are very specific
  per channel". Three reviews say the opposite: one effect over the whole mix (R50). What
  is per sound on the hardware is the step multiplier. Designing from the brief alone
  would have built sixteen lanes. What the brief wants is still met, two ways the hardware
  does not have: a switch a sound, and repeats that go out on each sound's TRIGGERS channel.
- **A text extraction hid the guide's contradiction; the page's own HTML showed where it
  comes from.** Read with `curl` and stripped to text, the guide prints the effects list
  twice. The 2015 printed manual has "stutter 3, stutter 8" in both; the web page's
  overview was later changed to "stutter 4, stutter 3" and its section 4 was not (R48).
  Session 1's extraction (R23) saw only "it contradicts itself".
- **A video's captions are a cheap second witness.** `yt-dlp --skip-download
  --write-auto-subs` and twenty lines of Python gave two tutorials as text with time marks
  in a minute. They showed effects being recorded with write off on a real unit, which
  every written source had only asserted, and one thing nobody was looking for: the
  lights with write off (D71). The captions are the authors' words and are not kept here;
  R53 is our summary with the time marks.
- **One sentence from the owner's hardware overturned a decision three sessions had built
  on.** D37 guessed that with write off the grid shows no steps; the PO-12 shows them in
  both modes. The guess was marked as one, so the cost is a known list (§14's table, three
  fixtures' views, two hosts), not a hunt. That is D29 working as meant: build on the
  plainest reading, mark it, change it when the hardware speaks.
- **Writing the lane so that only arriving steps are written came from working the fixture
  by hand.** The first rule wrote the step being played when the key landed. Working the
  trace showed the replay then starts a repeat one step earlier than the performance did,
  because the sequencer had already read that step: the bug a PO-28 owner reports on the
  hardware (R49's forum thread). With "only arriving steps", the second pass of
  `fx-repeat-punch` is the first pass 768 ticks later, line for line.
- **Ten minutes with the hardware corrected two rulings an hour old.** The owner tried
  eight checks while the design was being written. Five readings held (recorded with write
  off, heard at once, cleared by the steps that pass, one effect at a time, the display
  marks it). Two rulings were wrong: letting go of the last of two keys brings the first
  back, and stopped does nothing. A third guess, a bar on the effect's key, went too: no
  key lights. All three were changed in `ENGINE.md` §17 and the hand-worked fixture before
  any code existed, which is the cheapest a wrong ruling can ever be. The lesson for the
  next design loop: write the checks for the hardware first and hand them over early,
  while the design is still text.
- **The effects need sound to come into the core.** D62 kept the core unchanged by
  rebuilding the mix in the module. An effect on a returned sound cannot work that way:
  the module would need the core's filter. So §19 moves the returns in. The earlier choice
  was right for what it knew; the record of why it changes is D68 item 3.
- **CI's image: tag by content, build in the job that needs it.** The first sketch was a
  second workflow that builds the image when its files change; the build job would then
  race it on the same push and need a fallback. Hashing the three files the image is made
  from into its tag, and building in the Linux job when that tag is missing, has no race
  and no stale image. Measured: 727 s to build it once, then 11 s to pull and 11 s to
  build the plugin, against 76 s of setup and build on a good day and 14 min 33 s on a bad
  one. The package is private by default; the job logs in with its own token.
- **Licences were the trap in the libraries, not the code.** The obvious names are the
  unusable ones: Surge's effects and filters are GPL-3 though its Rack helper is MIT;
  DaisySP is MIT but its bitcrush, reverb and compressor sit in an LGPL repository; the
  one engine already written in four-operation arithmetic is MPL. What ports cleanly is a
  few dozen lines of Émilie Gillet's (R56).

## Session 16: the lane and the repeats, in the core (2026-11-23)

- **Both hand-worked fixtures passed at the first run.** `fx-repeat-punch` (Session 15)
  and `fx-repeat-swing` (this session, committed before any §17 code) were moved up as
  renames with no change, then run: Rust, C++ and Node, both sources, three rates, three
  block sizes, and from a version 3 snapshot. Writing §17 as pseudo-code with the order of
  every comparison paid for itself again: the code is that pseudo-code. Working the second
  fixture by hand took longer than writing the sequencer.
- **The race harness failed for a reason the design created, not a bug.** With fx in its
  random keys, 289 of 4 809 rounds had a snapshot that was not the model's: held while the
  engine played, fx let arriving steps write the lane at the audio thread's pace, and the
  model (one frame an edit) never reached those steps. The lane is the first thing a
  snapshot holds that time writes, not a command. That is also why the generation now
  moves on a tick (a ⚠ reading, `ENGINE.md` §17). Fixed in the harness: no fx key in the
  churn, `FX` edits instead. Predicted before the run, which is how it was told apart from
  a real fault.
- **The planting guard caught the plant script, again.** The first unplanted copy failed:
  one test reads `samples/`, which the copy left out. Session 10's rule (the unplanted copy
  must pass first) stopped 24 "caught" faults that would have meant nothing.
- **One plant was caught only by a fixture.** "A sound outside the effects is not swung
  during a run" failed `fx-repeat-swing` and no rule test: every rule test ran with swing
  0 or drew the same numbers either way. A rule test was added and the plant re-run (Session
  10's lesson, met again: a fixture is a walk, not the holder of a rule). 24 of 24 caught.
- **Checking the first draft of the rule tests by hand, before running them, found five
  wrong expectations; the core then passed all of them at the first run.** Each was the
  test missing something `ENGINE.md` already says: tick 0's events land in the block that
  sends play, so a helper that plays first hides them; a run of `n` steps' frames also
  reaches the next step's tick 0 on its last frame. The helpers now say which.
- **Measured (`make bench`, new; best of five, 10 s at 48 kHz, the mix, release build;
  three runs each, the range):** before the change, idle 26.1 to 27.0 ns a frame, the
  minimum beat 28.3 to 29.5, all sixteen 41.7 to 42.7. After, with an empty lane: idle 25.5
  to 26.0, beat 27.9 to 29.4, all sixteen 42.3 to 44.8 (one run's 44.8 against 42.3 and
  42.5 the others). An empty lane costs nothing the bench can see: the runs overlap.
  With effect 11 on every step ("repeat", all sixteen sounds): 30.9 to 31.7, less than
  "all" because only one column sounds. The engine grew from 2 352 to 2 400 bytes; the
  `.wasm` from 28 216 to 30 381.
- **Idle is 26 ns a frame, almost all of it the voices.** A stopped engine with nothing
  sounding costs as much as the minimum beat playing. That is the "Later: efficiency"
  idle row, now with a number, and the bench is where to see it move.

## Session 17: the bus and seven sound effects (2026-11-23)

- **Idle cost a frame at first, and the bench saw it.** Wired the plain way (read what is
  heard every frame, the bus inline), idle went from 25.7–25.9 to 27.2–28.2 ns a frame.
  Reading what is heard only on a frame with a command or a tick (the only things that can
  change it) was not enough: 27.1–27.4. Moving the bus's working path out of line
  (`#[inline(never)]` on `Bus::frame` and `Bus::mix`) so the frame loop keeps only two
  comparisons brought it back: run back to back against a build of the previous commit,
  25.6–26.4 against 25.5–25.9. Lesson: an unused branch still costs when it is inlined into
  the hottest loop; measure against the old build in the same minute, not against
  yesterday's numbers.
- **Measured (`make bench`, best of five, 10 s at 48 kHz, the mix; three runs each, the
  range).** Before: idle 25.7–25.9 ns a frame, the minimum beat 28.4–29.2, all sixteen
  42.0–42.6, repeat 30.0–31.3. After: idle 25.9–26.5, beat 27.8–29.4, all 42.7–44.1, repeat
  31.1–32.6. Each effect on every step of the beat: 1, 34.1–34.7; 2, 33.7–34.0; 3, 33.8–34.9;
  5, 34.1–34.7; 6, 34.5–35.3; 7, 34.6–35.0; 8, 34.4–34.5. So an effect costs about 6 ns a
  frame over the dry beat, nearly the same for all seven: the split of sixteen voices into
  the bus and the rest, not the effect, is most of it. The engine grew from 2 400 to 2 448
  bytes; the `.wasm` from 30 381 to 32 783.
- **A model written from ENGINE.md's words, held bit for bit, did most of the proving.** One
  test runs two bars a frame at a time through every kind of change (each effect from idle,
  effect to effect, a sweep held and restarted, a punch over the lane, a sound switched out,
  the volume down) and holds the core's mix to a plain re-statement of §18. It passed at the
  first run and was among the failing tests for at least 18 of the 25 planted faults (the
  script names three a plant). The rest needed tests of their own: the clip's ±3, the
  sweep's length, a sweep counted by frames instead of ticks (only an edge's burst shows
  it), effect 4 sounding, and the two below.
- **Two plants missed at first, and each named a hole in the tests, not the code.** "A
  sweep does not restart with a run" survived because a run separated by a whole step has
  always ramped out by then; only heard-again-within-2 ms tells the two apart. "A repeat
  also runs the bus" survived because the only test of 9 to 12 compared events. Each got a
  test, and all 25 were run again from an unplanted copy that passed first: 25 of 25.
- **`bus + w (wet − bus)` at `w` = 1 is not `wet`.** The first test of the hold counted
  frames whose bits changed and found 9 984 a second at 44.1 kHz, not 6 000: the rounding of
  that expression changes every frame. Then 5 692 by a threshold, because the beat is silent
  between hits and a new sample of silence is the old one. The test now holds the closest
  gap between new samples to `rate / 6000` and the count to at most 6 000.
- **The listening page proves itself by a fixed number.** A bar of the beat is the same every
  time (the voices restart on each hit and the hold's 3 000 samples a bar at 48 kHz fall in
  the same places), so the dry beat's loudest sample over a bar is a constant, 0.9037 in
  both browsers, and each effect gives its own. Effect 6 is the closest, 0.9039. A planted
  wrong command number on the page made all seven give 0.9037 and `make listen` failed.

## Session 21: the sliders are the hand's; a step keeps what it was written with (2026-11-23)

- **A view changed by a decision is worked by hand first, then the build agrees or does
  not.** `keys-tap-and-choose`'s six changed lines (`a=` and `b=` only) were worked from
  §20 and committed before any code; the core then gave those lines at the first run, and
  every trace and every other view line was the same as before the session. The report
  differed from the day's start in exactly 144 lines (six a run, 24 runs) plus the
  snapshot labels' hex: checked by a script that names each changed line, not by eye.
- **The designed fixture passed at its first run,** moved up as a pure rename: the third
  time a fixture worked by hand in a design session has done so (Sessions 16 and 21).
- **A decision about keys can break a check about edits.** P6's browser check looked for
  the page's snapshot among the report's labels. The page enters its beat by keys, and since
  D75 a key keeps the sliders, so the page's bytes were no longer any edit-made snapshot's.
  Seen before building the page, by asking what each host saves; the fix was to give every
  harness a run from the snapshot keys would make (`fixtures/README.md`, "From a kept
  snapshot"), not to loosen the check. `make play` then found the page's bytes there in
  both browsers.
- **A planted fault has to be visible to be a fault (Session 7's lesson, met again).** "A
  version 4 load reads a value whose keep bit is clear" survived every test, rightly: such a
  value is never used and never saved, so nothing can see it. The test that claimed to hold
  it was renamed for what it can see. 23 real faults planted in the core, the unplanted copy
  passing first: 23 caught, each by a named test. Two planted on the page (caps that follow
  the chosen sound, as D54 had them; the mark drawn from bytes 20 to 23): `make play` failed
  on each. One in the C++ harness's view text and one in the Node harness's command number:
  each failed (30 mismatched runs; the reports differed). One in Rack's view text: the
  self-test failed on the format 4 fixture. A plugin without the MIT notice: `check-dist.sh`
  refused it.
- **Every host's fixed room was checked, and two were too small.** The engine grew from
  2 448 to 3 568 bytes, inside every 4 KiB room (the worklet, the Node harness, the Probe,
  the Rhythm module, `jacks.cpp`). The snapshot grew from 408 to 1 464: the worklet's room
  for it was 448 bytes and the Node harness's 512, so both layouts moved (the commands start
  at 9 216 in the worklet; the view, events and audio moved up in the harness). The C++
  hosts size theirs by `PI_SNAPSHOT_SIZE` and needed nothing; base64 in a patch and in the
  browser's storage has no fixed size.
- **Measured (`make bench`, best of five, 10 s at 48 kHz, the mix, ns a frame).** Before,
  three runs: idle 26.2–27.0, beat 27.8–29.0, all sixteen 43.4–45.1, repeat 31.5–32.2.
  After, three runs: idle 26.2–27.4, beat 28.4–29.7, all 41.7–42.4, repeat 30.5–30.8. Back
  to back with a build of the session's first commit (Session 17's lesson), six pairs: idle
  old 25.0–26.9 against new 26.2–26.8; beat 27.5–29.7 against 28.4–29.4; all 43.0–44.0
  against 41.9–43.6; repeat 31.3–32.5 against 30.3–32.9. Within the bench's noise, but the
  new idle never went under 26.2 where the old reached 25.0: perhaps half a nanosecond (2%),
  the bigger engine or the new comparison; the hit itself is reckoned out of line
  (`#[inline(never)]`), only on a frame where something fired, and the voices' own check of
  that was folded into it. The `.wasm` grew from 32 783 to 36 963 bytes.

## Session 18: Rack's jacks, sound in, the panel in two rows (2026-11-23)

- **Where the sixteen voices sit in memory is worth more than a nanosecond a frame.** The
  first build of §19 kept `ROUTE`'s four masks as a field of the engine. Nothing on the
  unpatched path read it, yet "all sixteen" went from 42.4 to 44.0 ns and idle moved too.
  The eight bytes had pushed the voices from offset 80 to 88 of the engine. With the
  masks (and the slider outputs) inside the bus's own block, the voices are back at 80 and
  every case reads a shade *faster* than the old build. Found by printing `offset_of!` for
  the old and new engine after three rewrites of the code had each moved the number the
  wrong way. Before blaming a branch, check what the change did to the layout.
- **Three ways to write thirty-two slider outputs, measured.** A call after the sound,
  taken only in the 50-channel layout: +1.4 ns on "all" in every layout (the frame's slice
  had to stay live across sixteen inlined voices). Written in runs, up to the next command
  or hit: idle +1.6 ns (the command loop grew). Kept as ready floats in the bus and copied
  by the loop's own out-of-line mix: nothing the bench can see. The values change only on
  a hit, a `SOUND` or a load, so that is where the division is done.
- **Measured (`make bench`, best of five, 10 s at 48 kHz, ns a frame).** Before, three
  runs: idle 26.5–26.9, beat 29.0–29.8, all sixteen 42.8–43.7, repeat 31.5–31.7. After,
  three runs: idle 25.5–27.5, beat 27.8–29.0, all 41.1–42.1, repeat 30.1–30.9. Back to back
  with a build of the session's first commit, ten pairs, the lowest and the middle of each:
  idle old 25.2 and 26.1, new 24.9 and 25.6; beat 27.7 and 28.6 against 27.3 and 28.3; all
  42.4 and 42.7 against 41.3 and 41.8; repeat 31.2 and 32.3 against 30.2 and 30.8. Ten
  pairs, because three could not tell a real 1.4 ns from the machine's mood. New cases:
  the beat in 17 channels (what the unpatched module asks for) 27.8–28.5; in the
  18-channel loop with every sound returned 36.0–37.2; the same with effect 4 heard from
  the input 37.5–38.3; in 50 channels with every slider from its input 31.6–31.8. So RETURN
  with all sixteen costs about 9 ns a frame and the slider jacks about 4, only while
  patched. The loop's mix is plain code (a branch a sound); it is where to look if that
  matters. The engine grew from 3 568 to 3 704 bytes, the `.wasm` from 36 963 to 39 836.
- **Profiled with perf, as Session 13 did** (four Rhythm modules playing a beat, nothing
  patched, 20 s, one sample every 200 000 cycles; a scratch build pressed play). Before,
  two runs: `pi_process` 3 272 and 3 320, `Rhythm::process` 2 726 and 2 806, `tanhf` 277
  and 301. After, four runs: `pi_process` 3 144 to 3 518, `Rhythm::process` 2 516 to 2 655,
  `tanhf` 241 to 374. Unpatched, the seven new jacks cost nothing that can be measured:
  the runs overlap, and `Rhythm::process` was lower in all four (5 to 9%), which fits the
  keys now being compared in one pass that writes nothing; a run's spread is as large.
- **"Rounded down" was right on paper and wrong through a cable.** §19 turned a slider's
  input to 0 to 65535 rounded down. An output read straight back is exact that way: all
  65 536 values. Through Rack's volts (× 10 out, ÷ 10 in) 5 116 of them come back one less;
  with the compiler's reciprocal (× 0.1) 1 539. To the nearest, none, either way. My first
  test asserted the plain case lost some, and failed: the number was only found by
  measuring both.
- **A second engine given the module's own outputs cannot see a wrong output.** The loop
  self-tests run a shadow engine on what the module wrote to its jacks the frame before,
  and hold the module's frame to it. FX SEND planted to carry the mix came back, was taken,
  and matched: both engines were fed the same wrong signal. The outputs are now held to
  the shadow's own channels as well. 18 faults planted in the module and its jacks, the
  unplanted tree passing first: 17 caught at once, that one after the check was added.
- **30 faults planted in the core, 30 caught, each by a named test**, the unplanted copy
  passing first. Two tests were written before planting because nothing could have seen
  the fault: a load not showing on the slider outputs, and a host leaving the loop while
  an outside effect ramps out. The second is also the only test that catches "an effect is
  heard from outside in every layout": in the mix it is invisible by design (the bus
  crosses to itself), so the test reads the bus's state.
- **The self-test caught the session's worst bug in one run.** Sending a frame's key
  changes in three passes (function keys down, grid keys, function keys up) sent a function
  key down in the first pass and straight back up in the third. Every format 2 fixture
  failed at once, with one snapshot a frame. A fixture that presses real parameters is
  worth more than a model of them.
- **Three of the first five failing core tests were the tests' own mistakes.** Play sent
  on frame 3 starts at the *next* step boundary, 6 000 frames on, because the clock counts
  from `pi_init` (§5); the model fed a NaN the core rightly drops; and the rounding claim
  above. Session 16's habit (read the test against `ENGINE.md` before believing its
  failure) held again.
- **D76's positions were arithmetic, and the arithmetic left out the lettering.** At the
  2.6 mm the guide's 100% zoom needs, a letter is 1.66 mm: TRIGGERS is 13.3 mm, wider than
  the 11.67 mm between sockets, and FX SEND and FX RETURN overlapped by 1.5 mm.
  `make_panel.py --check` now works out every label, plate and stitch and refuses a
  drawing where two touch, so the next move of a jack is checked before it is looked at.
- **Rack, small things.** `setChannels` does nothing on an unpatched output (its count
  stays 0), though its voltages can be written and read: a self-test holds the volts.
  Screenshot mode does not write over a screenshot that exists: delete the folder first.
  `-t 2` gives 200%. gcc 16 warns about an array bound inside the SDK's own `setChannels`,
  once a call; it is the SDK's loop, not ours.
- **Found, not decided: A OUT through a module to A IN is one hit late.** The output says
  what the sound was last hit with; the input is read at the next hit. With steps written
  at different slider positions the values arrive shifted by one hit. It is §19 as
  designed, and the self-test's "the loop was heard" counts exactly those frames. For the
  owner (D80, "Left open").

## Session 19: the page's effects, and the display's effect block and lane (2026-11-23)

- **A brief can name a fact wrongly; build what it names and ask.** D81 asks for madder,
  "the fx key's own colour", but the fx key's band and latched face are ecru (madder is the
  sound key's). Madder is named twice in D81, so that is what was built; the mismatch is a
  question in the Handover, not a ruling.
- **A fixture's views can be held on the page without frame timing, if nothing in it hangs
  on the frame.** fx-repeat-punch's keys land "a frame after" a step begins; on the page they
  land a few milliseconds after the view says the step began, which is the same run step,
  and no punch makes a sound of its own. Counting run steps from the views (a new one each
  time the playhead moves) and keeping the last view of each gave all four of its views and
  its 43-line trace in both browsers at the first run. The trace's ticks are counted from
  its first line: the play edit starts at the next step boundary of a clock that has run
  since the page loaded (§5).
- **A gesture that sends nothing cannot be checked from the view.** D78's Ctrl+click on fx
  must send nothing at all, and a click must send fx down *before* the key. Neither is in a
  view (both orders punch the same), so the page now hands each message to `rhythm.onPost`
  and `make play` holds the commands. The planted "fx up before the key" failed only there.
- **Read a drawing's look, not only its class.** A tick with the class but no colour is a
  lane nobody can see; the lane's check reads the computed background as well, and the
  planted "ticks not madder" was caught by it. Fifteen faults planted in the page, the
  unplanted copy passing first: fifteen caught, by the drawing check (six), the switch's
  check (two, each a timeout and a named line), D78's checks (five) and the computer keys'
  (one, which also failed fx-repeat-punch's views).
- **The Rack display has no checker.** Its two new drawings were only seen, in screenshot
  mode, from a scratch build that fills `Face` by hand when the module is null and lights fx
  as latched. The scratch lines were kept out of the tree by copying the real file aside
  first and back after, then `make install` again; `grep SCRATCH` is the check.
- **Four things fit the page's display column at 1.2 line height.** Tempo, step, the effect
  block and the write mark are about 99 of the column's 104 px; at the body's 1.3 they did not.
- **No audio path changed:** the page's main thread and Rack's drawing thread only, so there
  is no frame cost to measure (the ground rule). The report, all 408 render files and the
  `.wasm` are the same bytes as before the session.
