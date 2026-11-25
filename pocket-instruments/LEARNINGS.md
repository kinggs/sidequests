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

## Session 20: the grid's lights, as the hardware has them (2026-11-23)

- **"The three key fixtures" was four fixtures, and two of them format 3.** PLAN's list named
  the three key fixtures; its heading said to check every fixture. A script listed every view
  of every fixture with the row it takes (write off, and none of bpm, sound or pattern held):
  sixteen lines in four fixtures, `fx-repeat-punch` and `fx-repeat-swing` among them, twelve
  of which change. Four take the row with a chosen sound that has no steps and stay
  `field=0000`. Listing by the rule, not by the fixture's name, is what found them.
- **The worked views passed at the first run,** as Session 21's did: the core gave all twelve
  lines, the report differed from the morning's in exactly 360 lines (twelve a fixture run,
  30 runs a fixture), each checked by a script to differ only in `field=`, and every trace and
  all 408 render files were the same bytes. No hand-worked line disagreed with the build.
- **A planted fault survived the first tests:** the field masked to the pattern's length
  with write off. Nothing had a step past the length, so nothing could see it. The fix was a
  test that holds D82's "in both modes" itself (write off lights exactly what write on
  lights, over 400 random patterns, lengths and choices, and a step past a length of 4),
  not a test of the masking: which is right past the length is §14's, and §14 says the same
  words in both rows. 7 faults planted in the core, the unplanted copy passing first: 7
  caught by named tests, one only after that test. One in each of the C++ and Node
  harnesses' view text (120 of 300 runs failed; the Node fixture test failed on
  `fx-repeat-punch`'s first view). One in Rack's view text: the self-test failed on four
  fixtures' views. Three on the page (the field drawn only with write on; a lit key never
  going white; the lit colour winning over white in the CSS): `make play` failed on each.
- **`make play` read the field already; it never read the white.** Every drawing's `on`
  classes were held to the field since Session 12, so the new field was checked the moment
  the `.wasm` changed. D82 item 4 (a lit key goes white and comes back lit) had no check at
  all on any host. Now every drawn key's colour is held to §14's rule for white, from the
  checker's own record of when each count moved, and the punch phase (write off, sound 1
  lit) must show a lit key white and then lit again: 26 and 7 in Chromium, 27 and 7 in
  Firefox. A drawing within 15 ms of a white's end is not judged: the page and the check read
  the clock a moment apart.
- **Neither host needed a change.** Both lit keys from the field whatever the row, and both
  draw a firing's white over the field and drop back to it. The decision cost one line of
  the core; the session's work was the fixtures, the checks and the record.
- **Measured.** `pi_process` did not change (`make bench` does not call `pi_view`). `pi_view`
  alone, a scratch bench against a build of the session's first commit, three runs of best
  of seven times twenty million: write off 6.56 to 6.82 ns old, 6.48 to 6.53 new; write on
  12.77 to 12.98 old, 12.89 to 12.90 new. No difference to see; Rack calls it at most every
  16th frame. The `.wasm` is 39 832 bytes (from 39 836).

## Session 14, a first attempt: the weave (2026-11-23)

- **A rule can ask for something a screen cannot show.** Rule 6 flashes "for a sixteenth of
  a step": 6 ticks, 7.8 ms at 120 bpm, less than one frame at 60 Hz. Built as written it
  would have shown on some steps and not others, and looked like a fault. Working a rule
  out in milliseconds at an ordinary tempo, before drawing it, found this in a minute. Built
  as a quarter of a step and ruled (D84 item 11); the rule's own words are kept, annotated.
- **The designed picture and the designed interface disagreed, and only drawing found it.**
  §16 names five palette numbers; `frames.html`'s cloth is tile with madder diamonds. Seven
  were needed. Likewise the picture's beater for one kick is 3 mm and for a hat 1 mm, which
  is loudness, and the view carries only a count. A picture is not a specification until
  someone tries to produce it from the inputs.
- **Printing the cells as text was the first look, and enough to judge a lot.** A test
  writes every view's cells as digits; turned into characters in a terminal it showed the
  loom before any host painted it, and the same file is what the three harnesses compare.
- **A thread every other row read as a wall of stripes once painted;** as text it had
  looked fine. A cell is a whole mm and a thin line cannot be a cell. Five threads now.
  The look was judged from a host's screenshot, not from the text.
- **`make bench` moved 3.5 ns a frame with no change on the audio path.** After `weave.rs`
  was rewritten as one pass (to save 3 KB of `.wasm`: 44 192 bytes to 41 154), every bench
  case was 3 to 4 ns slower, idle too, steadily, though the first build with the same
  sequencer changes had measured the same as before. Marking `weave` `#[inline(never)]`
  brought every case back. With one codegen unit and LTO, a new function elsewhere moves
  where `pi_process`'s loops land. So: a bench difference of a few ns is not evidence about
  the lines that changed until the old and new binaries are run back to back more than
  once, and a difference that appears in the idle case from a change idle never runs is
  layout. The kept old binary (`target/bench` copied aside before the first change) is what
  made the comparison possible. ⚠ The Rack build has its own flags and layout; not measured.
- **The first version of `weave.rs` cost 4.4 KB of `.wasm`, the second 1.3 KB,** for the
  same cells (the three reports' hash did not change): the first filled the grid, then
  drew each part over it through a bounds-checked `put`; the second works each cell's
  colour out in one loop. P1's bar is 50 KB and the module is at 41.
- **`spawnSync` of a browser from the process that serves it the page hangs both.** A
  scratch script served the folder and launched Chromium synchronously; the server could
  not answer while it waited, and Chromium wrote a white screenshot or none. An async
  `spawn` fixed it. (`web/play.mjs` already does this; the scratch script did not.)
- **To see the page draw a hand-made view without touching the tree:** a scratch server
  that serves the folder and adds one `<script type="module">` to `rhythm.html` on the way
  out, setting `rhythm.latest.view` and firing `resize`. Chromium's
  `--virtual-time-budget` then screenshots it (no AudioWorklet runs, as Session 12 found).
- **Reading a canvas back by colour holds a painting to its cells.** One pixel a cell,
  two fifths of the way in, turned to a palette number from the tokens written out in the
  checker. It caught all seven planted page faults: a wrong palette entry, a cell a column
  out, a stale view, the flag not passed, painting when nothing changed, not painting when
  something did. "Painted if and only if the cells changed" is checked from one drawing to
  the next, so it needs no count from the page's start.
- **Both browsers can be launched asking for reduced motion:** Chromium
  `--force-prefers-reduced-motion`, Firefox the pref `ui.prefersReducedMotion` 1. So the
  media query itself was tested, not only the page's hook.
- **Planted:** 22 in the core, the unplanted copy passing first, 22 caught by named tests
  at the first run (no test had to be added); one each in the C++ and Node harnesses'
  weave; 7 on the page. A script planted each, ran its check, recorded the failing names
  and put the file back.
- **The Rack display still has no checker.** It was seen in screenshot mode from scratch
  builds that fill the face by hand, five moments; the script copies the real file aside,
  plants one marked line, builds into a scratch user folder, and restores on exit.
  Screenshot mode shows the real build's bare loom, since the display now weaves an
  all-zero view when it has none.

## The day of eight sessions, from the chair that ran them (2026-11-23 and 24)

Sessions 16, 17, 21, 18, 19, 20 and 14's first attempt were each run by a fresh builder
(Opus, or Fable where the plan says so) from the plan's one start line, with the session
that designed them verifying each before starting the next. Each builder's own notes are
above; these are what only the chain showed.

- **The start line and a short brief were enough.** "Read `PLAN.md` and do Session N", plus
  the rules that bite and what to report. No builder needed the conversation that led to
  its list: the list, `ENGINE.md` and the decisions carried it. Where they did not, the
  builder marked a reading ⚠ and asked, which is the rule working.
- **Verify the claim, not the report.** After each session the gate was run again here, CI
  was read for the commit that changed code, and the diff of the fixtures was read for any
  line of trace. Nothing was found wrong in seven sessions. The check is still worth its
  two minutes: a builder's "all passed" is model output until someone runs it.
- **Design writing collides with a builder in one working tree.** Decisions and plan edits
  made while a builder ran were left uncommitted until it finished, and each builder was
  told to stage only its own files. It worked, but twice a builder's commit and the
  designer's edits touched the same file. A worktree for each builder would remove the
  care this needed.
- **A session killed mid-build lost nothing.** The parent process was closed by accident
  during Session 16. The work was on disk, two commits were local, and the builder resumed
  from its own transcript; the one instruction that mattered was to re-check the tree for
  a planted fault left in by a cut-off command.
- **The owner's "it does nothing" in Rack had two causes, neither a bug.** With RETURN
  patched the module rebuilt the mix after the core's effects (Session 18 fixed it); and a
  quick click on a key with fx latched is too short for a repeat, which starts at the next
  step (D78 fixed it). The owner's own patch file, read from Rack's autosave, showed the
  first in a minute. Read the patch before reading the code.
- **A new plugin does nothing until Rack restarts.** `make install` drops a package; Rack
  unpacks it at start. A builder's install during a session reaches the owner's Rack only
  then, and it may be a build from the middle of a session.
- **A wrong fact in a ruling was caught by the builder who had to draw it.** D81 called
  madder "the fx key's own colour"; it is the sound key's. Session 19 built what was
  written, said so, and asked. Rulings made without the owner get the same ⚠ and the same
  question as anything else.
- **What the hardware in hand was worth:** two rounds of checks by the owner, about fifteen
  minutes in all, corrected three rulings before any code (two keys held, stopped, the
  lights), overturned one decision three sessions old (the lights with write off, D37),
  and replaced another (the sliders following the chosen sound, D54). Every one of those
  had been marked as a guess. None would have been found by more reading.

## Session 22: the hardware's effects, measured (2026-11-24)

- **Three guesses from the names were wrong in kind, not in size.** The sweeps go both ways
  on their own clock; the low sample rate is not one rate; 9 and 10 are not slower 11 and
  12. No amount of tuning the constants would have found these. Measure before tuning.
- **The owner's ear was right and the design was wrong.** "It just feels like it mutes
  things": the hardware's repeats carry on through empty steps and ours go silent (R66).
- **Instructions for a take are written for the hands, not the engineer.** Drum names
  failed (the keys have numbers); "bar" failed (is it sixteen steps?). What worked: sound
  numbers, steps 1 to 16, and "a pass" for one round of the sixteen. Say how long to hold
  in passes, and say it twice.
- **One long take was too much to hold in the head.** The plan asked for one file. Three
  short ones (a, b, c), each checked before the next, caught a clipped input and a
  one-pass-not-two mistake while they were cheap. After about forty minutes the owner said
  so: "I'm losing focus a little, so it's getting easier to screw up". Stop there.
- **Check the level again after the first effect, not only dry.** The dry pattern peaked at
  -4.8 dBFS and effects 2 and 16 hit 0.0. The hardware's effects are up to 9.5 dB louder
  than its dry sound: leave 12 dB.
- **A script written before the first real file assumed the pattern was already looping.**
  Real takes open on silence; it took a half-silent pass as its dry reference and found no
  effect anywhere. Its 103 self-tests all passed, on files it had made itself. Fixed by
  anchoring on the first sound; the lesson is to run on a real take before trusting it.
- **Time goes missing in the takes, in whole buffers of 1024, and it is not explained**
  (R68). The dry pattern recorded clean three times with Rack closed. Do not record a
  measurement take with Rack open until this is known.
- **A kick's tail is a low sine, so matching by lag is ambiguous on it.** A sliding-window
  lag search for the lost time gave several answers a hit. Onsets were the better clock.
- **`pkill -f` with a pattern that matches your own shell's command line kills the shell.**
- **Patching by hand before building paid for itself in an hour** (D86 item 2, D87): it
  showed the menu's ticks were a trap, that the insert cuts a reverb's tail, and that the
  owner's favourite patch does not use FX RETURN at all. None of that was in the proposal.

## Session 23: FX SEND and FX RETURN designed, a channel an effect (2026-11-24)

- **Measure the design's fork before designing either branch.** The list asked where the
  send's ramp is made. Three scratch copies of the core (as it is; the return summed and an
  insert; those plus a 34-channel layout with sixteen ramps), one bench, two interleaved
  runs each, about ten minutes. Nanoseconds a frame, best of five:

  | Case | As it is | Return summed, insert | Plus the 34 channels |
  |---|---|---|---|
  | idle (the mix) | 26.0, 25.9 | 26.9, 27.6 | 27.2, 26.8 |
  | beat (the mix) | 27.9, 28.6 | 28.8, 30.3 | 29.2, 29.5 |
  | all | 42.2, 44.2 | 42.3, 44.3 | 44.0, 45.6 |
  | both, 17 channels | 28.9, 28.6 | 29.2, 30.6 | 28.3, 30.2 |
  | loop, every sound returned | 36.0, 36.5 | 36.4, 37.9 | 36.3, 37.5 |
  | loop, effect 4 on every step ("loop fx": crossing over; then beside the dry) | 38.4, 38.8 | 36.3, 38.0 | 36.9, 37.1 |
  | the same, in place of the dry | | 37.2, 38.7 | 36.9, 38.0 |
  | loop, nothing returned or heard | | 32.2, 32.8 | 31.8, 34.0 |
  | 34 channels, nothing heard | | | 35.6, 34.5 |
  | 34 channels, effect 4 beside the dry | | | 39.6, 39.9 |

  The wider layout is 2 to 3 ns a frame for as long as FX SEND is patched. The same ramps
  in the module, with a mask of the gains that are not 0, timed alone: 2.33 ns a frame of
  harness with nothing heard, 2.43 with one effect held, 2.49 with a new one every step.
  So about 0.1 ns. The scratch copies are not kept; the patch was thirty lines.
- **An insert is an effect whose sound is silence, and a send is no effect at all.** Seen
  only once the return was taken out of the crossover: `bus + w × (0 − bus)` is the ramp
  that was already there. The owner's two switches became one mask and no new path.
- ⚠ **One more u16 in the bus moved idle and the beat by about 1 ns,** in the layouts that
  never touch it, in four runs of four. Session 18 found the same of the voices' place in
  memory. The scratch copy grew `route` from four to five; Session 24 has to hold idle and
  the beat, and may need to keep the fifth mask somewhere else.
- **A recommendation written before the measurement can be stale by the next box.** The
  list recommended default ticks on the effects with no sound of ours. With every send
  live and the return summed, those ticks change nothing heard, so the default is "all
  Ours" and the trap D87 named is gone, not moved.
- **Three questions, each with a recommended answer, took the owner one screen.** The
  rest (twelve points) were ruled by the session and listed as the owner's to overrule.


## Session 24: FX SEND and FX RETURN built, a channel an effect (2026-11-24)

- **The fifth mask cost nothing, because it took room that was already there.** Session 23
  saw one more u16 in the bus move idle and the beat by about 1 ns. Before measuring, the
  build narrowed the sweep's tick counter (`Bus::swept`) from u32 to u16 (a sweep counts to
  1 536, held by a compile-time assert), and `route` grew from four masks to five in the two
  bytes that freed. The bus, and the engine round it, kept their size (`pi_size` 3 712 before
  and after), so nothing moved in memory. The variant that grows the bus was not measured
  again: Session 23's four runs of four stand for it.
- **Measured (`make bench`, best of five, ns a frame, the old build's library kept and run
  interleaved with the new, ten pairs; medians).** Idle 26.35 old, 26.75 new (old alone
  spans 25.3 to 26.8); beat 29.1 and 29.0; all 42.0 and 42.5; both 29.4 and 29.25; loop
  (every sound returned) 37.2 and 37.5 over three pairs. "Loop fx" (effect 4 on every step)
  was the crossing over at 38.9 to 40.5 and is beside the dry now at 36.8 to 38.1; the new
  "loop in" (in place of the dry) 38.0 to 39.7, what the crossing over cost. As Session 23's
  scratch copy said: beside the dry is 1 to 2 ns cheaper, because the bus stays idle.
- **Profiled with perf, the module with FX SEND patched** (four modules playing the minimum
  beat with effect 4 on steps 1 to 4 and effect 2 on 9 to 12, each FX SEND into a
  Fundamental Sum, 20 s at 48 kHz, one sample every 200 000 cycles; a scratch build pressed
  play). Old, four runs: `Rhythm::process` 3 193 to 3 485, `pi_process` 2 187 to 2 521,
  `Bus::looped` 1 076 to 1 148. New, two runs interleaved: 3 234 and 3 350; 2 438 and 2 523;
  1 168 and 1 286. The sixteen send ramps do not show against the one send they replaced.
  `Bus::looped` grew by about 100 samples in 20 s over four modules, about 1 ns a frame: it
  now reads and sums FX RETURN on every frame, as designed. The three together stay inside
  the old build's own spread.
- **Tests that never meant channel 17 fed it junk, and the new rule read it.** Four core
  tests and one case of `rack/test/jacks.cpp` filled a loop frame with 7.0, 7.5, 3.0 or the
  last frame's own send, because until ABI 11 channel 17 was read only while an outside
  effect ran. Each failed on its input, not its claim; each was given "nothing back" (0) on
  channel 17 and its expectation left alone. An input "not read" by today's rule is still a
  dependency of the test.
- **The first repeat test ran into the owner's complaint.** Effect 11 on steps 2 to 5 of the
  minimum beat gave 3 hits in eight steps: a repeat re-fires the step its run began on, step
  2 is empty, so the run is silent (§17 as designed; Session 22's proposal changes it). The
  test moved to steps 1 to 4 and its count was worked by hand: 8 re-fires of two sounds,
  then four hits, 20.
- **Two of the first failures were the tests' own,** as in Sessions 16 and 18: a guessed hit
  count (40), and a send channel expected at 0 V before its effect was first heard, where the
  rule is that it is not visited at all. Read the test against the text first.
- **An index past the end aborts the test run, and names no test.** Planting "`ROUTE` takes
  `a` 5" made `route[5]` panic inside `pi_process`, an `extern "C"` function, so the whole
  test binary aborted: a fault that "built and failed", but not by a named test, so it does
  not count. What it showed was a real gap: nothing held that an `a` past 4 does not alias
  onto a mask. A test was added for that, and the fault planted again as an alias.
- **The self-test checks itself for free.** Effect 4 Ours and effect 2 beside the dry gave
  the same numbers in the self-test (frames, frames heard, peak), as they must: in both the
  core's bus stays idle and the send and return are the same cable.
- **C++11 and gcc 16, small things.** A struct with default member values cannot be
  brace-initialised in C++11 (Rack builds C++11): `pi::FxSettings{a, b}` failed, plain
  assignments work. gcc 16 warned `-Wnonnull` on `c = ct = {...}` for two vectors, inside
  the standard library; two arrays and pointers did the same job.
- **31 faults planted, the unplanted tree passing first; 30 count.** 16 in the core (the
  table's three rows each way, `ROUTE` 4 alone, the return after the volume, added when 0,
  not cleaned, only while an effect runs, on channel 17 out, on a track, through the effect;
  an insert that ducks nothing; `Bus::mix` ducking; the sweep's narrowed counter) and 14 in
  `jacks.hpp` (the ramp's rate, clamp, zero and visiting; FX RETURN's channels and scale;
  each mask; the old patch's reading; the repeats' menu; `clearSend`). The first run caught
  28 of 30 by name. Of the two left, one aborted the run (above) and one, "in place without
  Rack's is an insert", cannot happen through the menu but can from a patch's JSON, which
  is read in as it is. Each got a test (`a_route_past_4_aliases_onto_no_mask`; the mask
  case `stray`), and each was planted again and caught. The aborting fault is not counted.

## Session 25: the repeat's rule, the retune and the delay, designed (2026-11-24)

- **The reports held more than the references took from them.** R64's "not silent on
  silence" was read as a property of the quantiser and ruled on (D90: "do not rest at
  zero"). A histogram of take b's levels, a step at a time, showed a mid-rise quantiser at
  rest half a step off zero and not one jump for thirteen steps: the "30 dB under" was the
  AC-coupled capture settling. The same pass found the crush's step to be a quarter of the
  distortion's ceiling, and effect 1 making the kick three times longer (R69). Twenty
  minutes with numpy on a file already recorded. Before designing from a measured row,
  read the report behind it, and then the samples behind the report.
- **Measure against the sound's own peak.** "A step of the dry peak / 2.42" (take a) and
  "/ 1.90" (take b) are the same step: one peak is a kick with a hat on it. Tied to the
  clip's ceiling both become a quarter.
- **"The level made up" was a ruling on a reading that did not hold.** Peak and level over
  a run are different numbers; only the level was in R64. The design gives effect 1 no
  gain and says why (D91 item 6), rather than build what was ruled from a wrong premise.
- **The delay's memory, measured before choosing** (scratch copies, `harness/bench.cpp`
  with a case "fx 4", runs interleaved; medians of six to eight, ns a frame):

  | Case | As it is | Lent, echo inlined in `wet` | Lent, echo out of line, asked for before `wet` | Inside the engine (16 777 floats) |
  |---|---|---|---|---|
  | `pi_size` | 3 712 | 3 728 | 3 728 | 70 832 |
  | idle | 26.4 | 27.8 | 25.3 | 26.1 |
  | beat | 28.8 | 30.2 | 28.7 | 29.7 |
  | all | 42.2 | 46.6 | 44.2 | 43.8 |
  | fx 2 | 34.0 | 36.8 | 35.4 | 34.5 |
  | both | 29.6 | 31.9 | 29.6 | 29.4 |
  | loop | 37.5 | 57.7 | 37.9 | 54.1 |
  | loop fx | 38.0 | 57.5 | 37.2 | 54.7 |
  | loop in | 39.6 | 62.6 | 39.0 | 59.9 |
  | fx 4, a line lent | | 36.8 | 35.3 | 34.4 |

  ⚠ "all" reads 1 to 2 ns over the old build in every variant, inside one run's spread
  (41.8 to 43.4 for the old build alone) but always the same way: Session 26 looks again.
- **Twenty nanoseconds from where six lines sit.** With the echo's read and write inlined
  into `Bus::wet`, the loop layouts cost 20 ns a frame more with no effect running, lent or
  held alike. Out of line (`#[inline(never)]`) they came back; called from inside `wet`
  that way, idle and the beat still read 2 ns high; asked for before `wet` in `mix` and
  `looped`, everything held. ⚠ The cause was not looked for (a store through a pointer the
  compiler cannot tell from the frame is the likely one). Sessions 17, 18 and 24 each met
  this from another side: bench every arrangement, against the old library, in the same
  minute.
- **A fixture worked by hand can still be checked before it is committed.** The new rule is
  twenty lines; a scratch core with it in ran the hand-worked trace (passed at the first
  run) and the whole suite (233 passed: no test held the old silence, so the build has no
  test to replace for the repeats). The core as it is failed the fixture, so the fixture
  does tell the two rules apart.
- **One question went to the owner** (the sweeps, as the list asked); the rest were ruled
  and listed (D91, O22). The owner added a step unasked: compare ours with the hardware by
  the same script, and tweak. It is the measurement Session 22 built, pointed the other way.

## Session 26: the repeat's rule, the retune and the delay, built and compared (2026-11-24)

- **Designing to the line paid again.** The hand-worked fixture passed at the first run; so
  did the nine repeat tests, the retune's model (written from §18's text before the code)
  and both models once given a line. The four failures the retune met were all numbers the
  decision changed (effect 2's old curve in two route tests and `jacks.cpp`; an outside
  effect's leftover cutoff; effect 3's +½ step on a silent bus), not claims.
- **The bench at this size reads where code lands.** Ten interleaved pairs, old build and
  new, after the session: idle, both and the loops inside the old build's spread; the beat
  0.9 ns and all 2.6 ns over. Bisected by commit, with each build's library and bench
  interleaved (medians, ns a frame):

  | Build | idle | beat | all | loop | `pi_process` mod 64 |
  |---|---|---|---|---|---|
  | old (ABI 11) | 26.8 | 28.7 | 42.3 | 37.2 | 16 |
  | + the repeat | 25.0 | 27.2 | 41.3 | 35.1 | 0 |
  | + the retune | 27.6 | 30.4 | 44.7 | 37.5 | 32 |
  | + the delay (echo before `wet`) | 30.4 | 32.8 | 46.2 | 39.8 | 48 |

  The repeat's and the retune's builds have `pi_process` the same size; only its address
  moved. Built with `-C llvm-args=-align-all-functions=6`, all four line up differently:
  old 24.4 idle, the repeat 27.6, the retune 27.5, the delay 28.4. Code that never runs
  while stopped cannot cost 3 ns a stopped frame, so these are placement, not work. ⚠ Not
  chased further: the list said to try Session 25's two arrangements and stop. Asked for
  before `wet` (the design) every case read 1 to 2 ns more than called from inside `wet`
  out of line, so the second is built. A future efficiency session could pin the hot loop's
  alignment, or measure in Rack with perf, where the plugin's own layout decides.
- **Measured, final (ten pairs, medians, the old build's range in brackets).** Idle 27.4
  (old 26.6, 25.0 to 28.1); beat 29.8 (28.9, 28.1 to 29.5); all 44.5 (41.9, 41.5 to 43.2);
  both 29.8 (29.0); loop 36.8 (37.0); loop fx 36.7 (37.0); loop in 38.5 (39.0); fx 4 with a
  line 37.0. The engine is 3 728 bytes natively and in WebAssembly (3 712 before); the
  `.wasm` 42 177 bytes (41 255).
- **30 faults planted, the unplanted copy passing first; 29 caught at the first run.** The
  missed one, "lending keeps where the echo was", named a real hole: nothing lent a second
  line mid-run. A test was added and the plant caught. Seven were §17's (the walk without
  its wrap, a sound out of the effects counting, looking again at every boundary, a step
  under 100 not counting, the run's own step not first, none anywhere holding step 0, the
  wrap at 16 not the length) and 23 §18's (each constant, `trunc` for `floor`, the crush at
  zero, `r`, the sweep's turn and both exact ends, and eleven on the line). "An echo
  outlives the ramp" was caught by the clearing test, not by "no echo outlives the ramp":
  with every sound in the bus, the plain sum and the bus's sum are the same bits.
- **Ours, read by the hardware's script, beside the PO-12's** (`ENGINE.md` §18, "Compared
  with the hardware", has the table and what moved). The reports' numbers, side by side:

  | Effect | PO-12 (R64 to R69) | Ours as designed | Ours after the moves |
  |---|---|---|---|
  | 1 | hold 1.5 ms mean; kick peak −0.9 dB (b), +4.1 (a) | hold 1.0 ms; −0.3 dB (b), −1.7 (a) | the same |
  | 2 | gain 2.93; ceiling 2.12 × the kick's peak | 2.99; 2.41 | 2.99; 2.12 |
  | 3 | step = kick's peak / 1.90; half steps | / 1.65; half steps | / 1.91 |
  | 4 | 174.8 ms; 0.09 to 0.25 | 174.77 ms; 0.14 (b), 0.15 (a) | the same |
  | 5 | 233 to 344 Hz; +7 dB | 308 Hz; Q 2.03 (+6.1 dB) | the same |
  | 6 | 190 Hz to 2.5 kHz; 8.5 to 9 steps | 186 to 1 930 Hz; 9 | 190 to 2 383 Hz; 9 |
  | 7 | 1 796 Hz; +15.5 dB | 1 799 Hz; Q 5.98 | the same |
  | 8 | 220 Hz to 2.9 kHz; 8.5 to 9 | 252 to 2 701 Hz; 9 | (bottom unread) to 2 728 Hz |
  | 11, 12 | 7.94; 5.97 a beat | 8.00; 6.00 | the same |

  Two constants were the design's own guesses at our level (the ceiling at "a sound of ours
  peaks near 0.5", where our kick peaks at 0.41). Measuring ours the way the hardware was
  measured found them in one round. The sweep's ends move the readings, not the true ends:
  the script reads a sweep every half step where the pattern sounds, and both devices were
  read that way.
- **A script's guard met our own render.** `hardware-fx.py` refuses any take inside the repo
  (rule 6, for recordings of the hardware). The list said `target/ours/`; ours was written
  outside the repo instead and the script left alone.

## Session 27: effects 13 and 14, designed (2026-11-24)

- **A sentence in the references was a guess wearing a number.** R67 had effect 14 as
  "rings at 1041 Hz", and the proposal built on it was "a short delay (about 1 ms) fed back
  hard": 1 041 Hz is 45 device samples. The takes say otherwise. A line spectrum of a held
  ring shows lines 54.64 Hz apart, so the loop is 18.30 ms, twenty times longer, and 1 041
  was a pitch tracker choosing among them. Session 25 wrote this lesson for effect 3 ("read
  the report behind the row, then the samples behind the report"); it held again. A build
  from R67 would have made a 1 kHz comb that no reading of the hardware supports.
- **Two bands of level every 4 ms said more than any transform.** Take b, the kick alone:
  under 200 Hz the wet bars are the dry bar to a decibel; over 400 Hz bursts come round and
  grow; and everything stops on the frame the kick's voice ends. That one table gave "the
  lows do not go round", "over 1 a round" and "silent when nothing sounds".
- **The hardware stops its effects when its voices stop.** Effect 14 is silent on every
  step the dry beat is, and starts the next bar louder: the loop is kept, not run. Probably
  the device not computing sound while nothing plays. Worth remembering for 15 and 16 and
  for effect 1's long kick (R69): what looks like an effect's own gate may be the mixer's.
- **Not everything measured has to be modelled.** The same takes show the 174.76 ms echo
  inside effect 14, lags in pairs L and 8 192 − L, and bursts 37 and 47 ms apart in turn.
  An afternoon would not have explained them from two takes. The design takes the four
  things that are firm (the lows, the loop, the build, the silence) and says what it leaves.
- **A model off the engine before a number goes in the plan.** Effect 14 as forty lines of
  numpy in f32, on stand-in drums laid out as takes a and b (a decaying sine, filtered
  noise), read the way the script reads a take:

  | Filter `r`, gain, ceiling | Level over dry (a; b) | Peak (a; b) | At 1 kHz (a; b) |
  |---|---|---|---|
  | the PO-12 | +5.0; +0.5 dB | +4.4; +3.9 dB | +29; +18 dB |
  | 2, 2.24, 0.4 | +9.2; +1.3 | +5.2; +1.7 | +37; +41 |
  | **2, 2.24, 0.25** (designed) | +6.1; +1.1 | +3.6; +1.7 | +33; +40 |
  | 2, 2.0, 0.4 (under 1 a round) | +0.7; +0.4 | +0.1; +0.5 | +14; +16 |
  | 1, 1.12, 0.4 (a narrower filter) | +9.1; +0.6 | +4.8; +0.0 | +35; +39 |
  | 2, 2.6, 0.3 | +8.5; +3.9 | +3.8; +4.4 | +37; +48 |

  ⚠ The drums are stand-ins, so only the order of the rows means anything: a loop under 1
  does not build at all, and the ceiling sets the level. Silent frames wet were silent
  frames dry to within a millisecond a hit. Session 28 reads the real thing.
- **Effect 13 was all in the report.** Sixteen hits in two bars, each with a pitch, a
  decay and a likeness to every dry hit: three sounds each swapped for one other, the same
  every time. No audio was opened for it. A quick script to name the sounds from take c's
  false start put its grid two steps out and told nothing; it was dropped, not fixed. The
  map (twelve keys on) stays a reading until a take plays sounds 13 to 16 dry.
- **The scratch core again:** the fixture written by hand first, then twenty lines of
  `seq.rs` in a copy. It passed at the first run, and one old test failed: the one that
  lists the effects with no sound. That is how the build list knows which tests the
  decision changes before Opus meets them.

## Session 28: effects 13 and 14, built and compared (2026-11-24)

- **Designing to the line paid a fourth time.** The hand-worked `fx-shuffle` passed at the
  first run on every harness, in Rack and on the page; the eight shuffle tests and both models
  given 14 (written from §18's pseudo-code before the code) matched the code at the first run.
  Every failure the build met was a number or a reading in a test, not a claim of the design.
- **Where the code sits cost more than the code.** Effect 14's loop called from inside `wet`,
  as the echo is, stopped `wet` being inlined into `looped`, and the four loop layouts read 13
  to 19 ns a frame slower with no effect running (52.9 against 40.0). Effect 13's commit alone
  read faster than the old build, which is how it was pinned on 14 (a scratch build of the
  first commit, benched beside both). Asked for before `wet` (`if on == 14 { feedback } else
  { wet }` in `mix` and `looped`), `wet` inlined again and every case came back. Session 26
  found the opposite for the echo (inside `wet` read 1 to 2 ns better). Lesson: the arrangement
  is not a rule; read `nm -S` for which functions are outlined, and bench both.
- **Measured, final (ten pairs interleaved, medians, the old build's range in brackets).** Idle
  28.4 (30.1, 29.1 to 31.0); beat 30.7 (32.6, 32.2 to 34.1); all 46.3 (46.6, 46.0 to 47.8); both
  32.0 (32.5); loop 39.2 (40.0); loop fx 39.2 (40.3); loop in 40.6 (42.2); sliders 35.4 (36.0);
  fx 4 37.9 (38.4); fx 14, new, 40.7. Effect 3 read 0.2 ns over its spread (38.8; 36.8 to 38.6).
  This machine read 3 to 4 ns slower all day than Session 26's numbers: only pairs mean
  anything. The engine stays 3 728 bytes (`comb` in `acc`, `still` in `swept`); the `.wasm`
  42 177 → 43 222 bytes.
- **27 faults planted, the unplanted copy passing first; 23 caught at the first run.** Each of
  the four missed named a hole in the tests, not the code: a `TRIG` for each draw (no test had
  both draws pass), 13 read off the lane at the firing (a punch writes no lane; only an edit
  between a boundary and its swung firing shows it), near zero counted as zero (no test fed a
  tiny bus), and `still` forgotten when 14 is heard again (no test re-heard it while still).
  Four tests added; 27 of 27. The gain and ceiling planted again after the gain moved: 4 of 4.
- **Two readings of the design did not hold, and the tests now hold what is true.** A click
  falls for some rounds before it builds (the band output loses what is off its centre first),
  so "louder each time" holds from its lowest round on. A lend clears `head` and `full`, not the
  filter, as §18 says; so the junk-is-never-heard test compares two engines lent different
  junk, not the mix against the bare bus.
- **A test's filter decided a pass.** "Under 200 Hz within 1 dB" read +1.15 dB through a
  one-pole at 200 Hz at the designed gain, and +0.62 at 100 Hz: a one-pole falls 6 dB an
  octave, and the ring was 40 dB over dry at 1 kHz. The test was held at 100 Hz until the
  comparison moved the gain; at 2.05 it reads +0.44 dB at 200 Hz, the design's own corner. (A
  side agent flagged the 100 Hz reading as a pass bar moved; it was, until the move made it
  unnecessary. Both readings are in the test's comment.)
- **The page's clock is not a fixture's.** `make play` met `fx-shuffle`'s swing: the page's
  clock has counted since it loaded, swing goes by the grid step's parity, so the first step
  can land odd and play late. `fx-repeat-punch` has no swing and never showed it. The phase
  sends a reset first, as a fresh engine is at tick 0.
- **Ours, read by the hardware's script, beside the PO-12's** (`ENGINE.md` §18, "Compared with
  the hardware (Session 28)", has the full table). A grid of 17 builds in scratch copies, gain
  by ceiling, each read on takes a and b:

  | Gain, ceiling | Level; peak (a) | Level; peak (b) | 1 kHz (a; b) |
  |---|---|---|---|
  | the PO-12 | +5.0; +4.4 | +0.5; +3.9 | +29; +18 |
  | 2.24, 0.25 (designed) | +9.7; +3.2 | +4.4; +2.7 | +47; +40 |
  | 2.12, 0.25 | +8.0; +2.5 | +0.9; +0.4 | +44; +29 |
  | 2.08, 0.25 | +5.7; +2.2 | +0.4; +0.2 | +41; +25 |
  | 2.06, 0.25 (and 0.35, 0.45) | +3.1; +0.5 | +0.4; +0.1 | +35; +23 |
  | **2.05, 0.25** (built; 0.45 the same) | +1.9; +0.1 | +0.3; +0.0 | +30; +22 |
  | 2.04, 0.25 (and 0.45) | +1.2; +0.1 | +0.3; −0.0 | +25; +21 |
  | 2.0, 0.25 (and 0.45) | +0.7; −0.0 | +0.3; −0.1 | +13; +18 |

  Session 27's model off the engine (stand-in drums) had the order right and the size wrong: it
  read 2.24 at +33 dB at 1 kHz where ours read +47. Near 1 a round the loop is on a knife edge:
  2.04 to 2.10 crosses from fading to ringing on these patterns, so the readings jump, and the
  ceiling stops mattering below about 2.08. Effect 13: 2.00 onsets a beat on the dry steps, as
  the PO-12's; each hit our own 13, 14 and 15 (268, 1 331 and 220 Hz) where the PO-12's read 841,
  1 841 and 74 Hz.

## Session 29: the bench made to read work, then the idle cost (2026-11-24)

- **The bench had two noises, not one, and the bigger was the machine.** This laptop's Ryzen 9
  7950X3D has two dies: one with the stacked cache at a lower clock, one faster. A bench run
  lands on either, so every case is bimodal run to run (about 30 or 32 ns on "both", 37 or 39
  on "loop", in every build). Turning off address randomisation (`setarch -R`) changed
  nothing; pinning to one core (`taskset -c 2`) collapsed each case's ten readings to a few
  tenths. `make bench` and `make pairs` now pin (`BENCH_CPU`, 2 by default). Core 2 is on the
  cached die and reads about 2 ns slower than core 10, and steadier.
- **Then placement, which pinning alignment does take out.** Three builds whose differences
  never run in the listed cases (`0465202`, `4e37617`, `main`), ten interleaved rounds each,
  medians in ns a frame, the spread between the three:

  | Setting | Unpinned CPU | Core 2 | Core 10 |
  |---|---|---|---|
  | none | 2.9 idle, 3.4 beat, 4.0 all, 3.3 both, 3.4 loop | 3.2, 2.9, 3.7, 3.6, 3.4 | 2.3, 2.3, 4.1, 3.3, 3.7 |
  | `-align-all-functions=6` | 0.2 to 1.5 (both and loop bimodal) | **0.3, 0.0, 0.0, 0.1, 0.5** | 0.3, 0.9, 0.3, 0.3, 0.3 |
  | that and `-align-all-nofallthru-blocks=6` | 3.1 idle, 2.5 beat | 3.5, 3.4, 1.9, 3.0, 3.6 | — |
  | that and `-align-loops=64` | 3.1 idle, 2.9 beat | 2.9, 2.3, 3.3, 2.7, 3.3 | — |

  So functions on a 64-byte line pass the list's bar (within 0.5 ns) on core 2 and come close
  on core 10 (beat 0.9 ⚠). With it `pi_process` is the same 2 227 instructions in all three
  builds, at the same offset in its line; what is left is address bits above 64 bytes
  (branch prediction, pages) and noise. Aligning blocks as well made the two older builds
  about 5 ns faster when idle and `main` not, because `main` has an outlined `Bus::frame`: a
  layout that suits one build, not a pin. Pinned, against the old library on core 2: every
  case from 0.5 faster to 0.2 slower. It costs nothing, so it is in `make build` and `make
  rack-lib`, given after `--` so it reaches our crate only and survives `rack-lib`'s
  `RUSTFLAGS`; all four Rack targets take it (every function 64-aligned in each); the
  `.wasm` is left as it was (no addresses to align; its bytes did not move).
- **`make targets` had been failing, unseen.** aarch64-apple-darwin's object calls plain
  `bzero` (x86 macOS spells it `__bzero`, which the list had); the unpinned library failed the
  same, so it predates this session. `make targets` is not in `make verify`. Admitted as the
  same libSystem routine the rule already allows.
- **Where the idle frame went, in Rack (perf, user space, 20 s at 48 kHz, Rack pinned to core
  2, two runs each).** One Rhythm module, stopped, nothing patched: `pi_process` 1 345 and
  1 334 samples, `Rhythm::process` 1 708 and 1 604, `Hat::next` 69 and 65; SEQ-3 alone, 795
  and 715. Inside `pi_process` most samples sat in the sixteen voices' calls (a jump table
  over the tracks, a float test each), then the sum. Every voice was asked every frame, each
  to say it had nothing.
- **The fix was a cached fact, not a new rule.** Every voice's silent branch returns 0 and
  changes nothing, so a flag that is only ever true when all are silent lets `render` skip
  them for the same bits. A trigger clears it; it is set again only on a frame of sixteen +0
  bits, and then only if every voice says so. `make bench`, ten pairs, core 2: idle 29.5 →
  6.1; beat 33.0 → 31.6; all 51.4 → 50.7; both 35.3 → 33.6; loop 43.3 → 41.6; loop fx 43.3 →
  41.7; loop in 44.8 → 43.5; sliders 39.1 → 36.8; repeat 37.8 → 36.9; fx 1 to 14 0.1 to 1.3
  under, fx 3 the same (41.6, 41.5). Engine 3 728 bytes (the flag fits in padding); `.wasm`
  43 222 → 43 725.
- **The arrangement mattered again (Sessions 26 and 28 said so).** The zero test first written
  as a fold after the voice loop read idle 4.4 but all +2.8 and repeat +3.2 over the old build;
  folded into the voice loop it reads idle 6.1 and nothing over. Out of line, every case lost.
- **A slip of mine, caught by a warning.** Inserting each voice's `silent` above `fn next` left
  `next`'s `#[inline]` on `silent` and `next` without one; rustc warned "unused attribute"
  only because two stacked. The bench of that build was thrown away and read again.
- **In Rack after (same runs):** `pi_process` 326 and 303 samples (−76%); `Hat::next` gone;
  the module in all 2 366 and 2 325 against 3 220 and 3 110 (−26%), and with AUDIO patched
  −33%. As a meter, samples × 200 000 cycles over 20 s × 48 000 frames, at about 5.25 GHz
  (⚠ the clock is assumed): the module about 0.60% before (the owner read 0.6%), about 0.45%
  after; SEQ-3 about 0.16% (the owner read 0.2%). Rack's own meter cannot be read headless:
  no widget is made with `-h` (Session 13).
- **What is left is the host's.** `Rhythm::process` is now about 1 900 samples, 2.4 × SEQ-3's
  whole module, and 29% of it is one line: the 23 key parameters compared every frame
  (`Rhythm.cpp`, the `changed |=` scan). That is "Later: efficiency"'s open question for the
  owner (read the parameters every 16 or 32 frames), now with a number.
- **The tests:** an engine taking the short way held frame by frame, bit for bit, to one put
  back on the long way before every frame (events, audio, view, snapshot), 200 000 frames in
  each of the five layouts, stopped with taps, a beat with effects played and stopped, a rate
  change; it was quiet on 68 000 to 100 000 of them. Nine faults planted, the unplanted copy
  first: 7 caught at the first run. The two missed (the snare's wires and the clap's test in
  `silent`) named a hole: `silent` is asked only on a frame of sixteen +0s, which a sounding
  voice almost never gives, so the long run never met a wrong one. A third test holds each
  voice's `silent` to its sound directly (every track, three lengths, code and sample). All
  nine again from fresh copies of the final code, and a tenth (the snare says silent early):
  10 of 10, each caught by a named `quiet::` test.

## Session 22, the takes left: the PO-12 read on a second pattern (2026-11-25)

- **A second pattern overturned what one pattern had "measured".** Takes a and b (a kick, a
  snare, hats) gave R66's "11 and 12 retrigger the last sound, on through empty steps", and
  D90 was ruled on it. Take c (two sounds, four notes a bar, long silences) shows the rule
  is "the step the key came down on, and silence if it is empty": on take b the key had
  landed on the kick. One take cannot tell a rule from the press that happened. What would
  have caught it yesterday: holding the same effect from two different steps.
- **A swelling sound defeats "the first sound is step 1".** Sound 8 here rises for two steps;
  the script's first sound over a tenth of the loudest was sound 15 on step 5, so every bar
  was laid four steps late and the report was nonsense that still looked like a report
  (fifteen of sixteen effects "seen"). The level every 25 ms over the first three seconds
  showed it in one look. `--first` now says where bar 0 begins. Look at the opening of a
  take before believing a layout.
- **A sound that is the same sample for sample is the best probe.** Sound 8 repeats to
  0.9996, bar to bar. So held less dry is the effect alone: the delay's echo was read as a
  residual (the tone, 80 ms into the next sound), and the filters as held over dry every
  quarter step, which gave the sweeps 28 points where a kick and hats had given a handful.
  The cost: a retrigger and a loop of the same sound look alike.
- **The tone's waveform is a bad clock.** Sound 15's oscillator does not start again with
  each note, so matching its waveform drifts by a period (2.3 ms) and by nine periods; the
  first timing read off it showed losses that were not there. Onsets by level are the clock.
- **Lost time has a size, and the size names the owner.** Whole 512s of samples at 48 kHz
  (10.67 ms), not of the PO-12's 46 875 Hz, about 30.7 s apart, in dry bars as well as held
  ones: the laptop's capture. Yesterday's "each in or beside a held effect" was true only
  because most of a take is a held effect. ⚠ Why every 30 s is not found.
- **My change to a default broke a self-test, and the self-test was right.** Making pass c's
  effects 1 to 16 by default turned "the effect that was not punched is warned of" from
  true to false (102 of 103). Put back; the real take is read with `--effects 1-16`.
- **An effect named for what it does to a sample player.** "Low sample rate" is the sounds
  played at a quarter of the rate, as on a sampler, not a hold on the mix: 440.2 Hz became
  109.9. R64's "irregular holds, 2 to 70 ticks" and R69's "three times as long and lower"
  were both this, read on a kick whose pitch falls. A pitched, steady sound in the first
  take would have said so in one line.
- **Asked for one effect, got its neighbour.** The 120 bpm take holds 13 where 14 was asked
  for: the kick reads as R70's 841 Hz sound to the hertz. A check that would have caught
  it at the desk: the level a pass (14 on a kick is not 16 dB down).
- **A bug report mid-session (the owner): 1.650 V steady on AUDIO, stopped.** Not found.
  The core's only resting level is effect 3's half step (0.109 of a unit, 0.54 V), and 14
  returns the bus untouched while still, so the core alone does not make 1.65 V; FX RETURN
  is summed before the volume. Left as a test for the owner in `PLAN.md`.

## Session 30: the repeat back to the hardware's rule; the sweeps and 5 retuned (2026-11-25)

- **"The step the key came down on" and "the step the run begins on" are different steps
  here.** Our lane is written by the steps that arrive, so a run begins one step after the
  press. `run_step = cur`, which the plan named, would repeat the step after the kick and
  bring back the mute the owner disliked. A side agent caught it mid-session; the owner chose
  the PO-12's behaviour (D96). Before building a hardware rule, check which moment the
  hardware counts from and which moment our sequencer acts on.
- **A rule that mends can hide a harness bug.** `ours-take.cpp` had played every key a third
  of a step early since Session 26 (half a second of lead is 2.67 steps, and the table clock
  starts its first step at the next boundary). D91's look-back found the note anyway; the
  hardware's rule repeated the empty step 16 and read as silence. Hold a harness's timing to
  the trace (`step` events), not to its comment.
- **My plant script mistook `error: test failed` for a build failure.** Cargo prints that
  line whenever a test fails. Look for `could not compile`.
- **A planted fault in state that play and reset clear got through** (K5: not clearing the
  key's step at play) until a test held a punch across a stop. State with a reset path needs
  a test that crosses it.
- **Two hand workings were wrong, not the core:** `after(n)` is a frame *after* tick 96 n,
  and play by edit mid-step waits for the next boundary on the table clock. Read the
  helpers before working a trace by hand.
- **A loosened check can go vacuous under a retune.** "Held over two steps, under 3 000 Hz"
  passed for any sweep once 6 started at 2 700. It is now 2 000, worked (about 420 Hz).
- **The model-first order held again:** seven tests failed on the old bus, all passed on the
  new one at the first run, bit for bit.

## Session 31: effect 1 designed (2026-11-25)

- **The model changed the design before anything was built.** The first design held each
  slowed value to the next grid point, because R72 said the PO-12 does. A stand-in model of
  it, read by `hardware-fx.py` beside take c, matched on pitch, length and level and missed
  by 29 dB above 10 kHz (R77): a hold mirrors the sound round the grid's rate. The design
  now draws a straight line between grid values. A reference's sentence is a reading; model
  it and read the model the same way before a build list quotes it.
- **The measuring script does not say "held four samples" for any signal.** On a held model
  it reports the period of the 4-and-5 frame pattern (40.96 frames at 48 kHz); on take c,
  no hold. Know what a reading looks like on a signal you made before trusting it on one
  you did not.
- **The voices' `tune` was already the mechanism.** Built for a host's rate change (§11), it
  slows a sounding voice to a quarter with no change inside any of the sixteen: tune for
  46 875 Hz, ask on a grid a quarter of that.
- **Take c cannot test the release:** every sound has ended by the bar the key goes up. A
  take with a long sound across the release would.


## Session 32: effect 1 built, the voices slowed (2026-11-25)

- **The model-first order held a fifth time, at a larger size.** The bus's model given the
  grid, and a model of the voices themselves (`Voicing`: a copy of the engine's voices taken
  before the first frame, hit, asked and retuned one track at a time by the section's words),
  were committed failing on the old core (ten tests) and matched the new one bit for bit at
  the first run, on every track channel and the mix, through both tours. The only failures the
  build met were two tests the decision changed (the ABI number; "the track channels are never
  touched", which effect 1 now does, D98 item 7) and one of my own tests.
- **My test was wrong, not the core: a punch is recorded.** The edge test let go of fx + 1 a
  few frames after the step at 500 ms arrived, so step 4 had been written with 1 and the tone
  stayed slow to 625 ms; the pitch "after" read 165 crossings a second, between the two. The
  models agreed with the core frame by frame, which is how it was found to be the test. Let go
  before a step arrives when a test means "1 goes off here".
- **The `.wasm` has a size bar, and voice code is most of it.** P1 holds the `.wasm` under
  50 000 bytes. As first built it was 57 920: a sound's next value (`ask`, a match over the
  sixteen voices' `next`) inlined at three places, and the reconcile's loops unrolled sixteen
  times with a sixteen-way `tune` in each. `ask` and `retune` out of line: 50 217; the loops
  walking set bits (`trailing_zeros`): 49 198. `nm -S --size-sort` on the static library
  names the culprits in one look. 802 bytes are left.
- **The bench read placement again, and this time it would not come back.** Ten pairs, core
  2, against the old build: every playing case without effect 1 read 3 to 5 ns a frame slower
  (beat 31.6 → 36.8), fx 1 5 ns faster (39.2 → 34.1), idle and fx 1/0 the same. Scratch builds
  (medians, ns a frame; old, new, then each variant):

  | Build | beat | all | both | repeat | loop | fx 2 | fx 1 | fx 1/0 |
  |---|---|---|---|---|---|---|---|---|
  | old | 31.6 | 50.9 | 33.8 | 37.0 | 42.0 | 39.2 | 39.4 | 36.7 |
  | new, as built | 36.7 | 54.8 | 36.9 | 41.6 | 44.9 | 42.7 | 34.0 | 36.5 |
  | `render` without the `slowed` test | 32.4 | 51.5 | 34.4 | 37.8 | 42.1 | 39.9 | 39.0 | 36.9 |
  | `trigger` without the mask | 33.6 | 52.2 | 33.3 | 37.9 | 42.0 | 39.1 | 34.1 | 34.4 |
  | no `slow` call (the read still before the hits) | 34.3 | 52.5 | 34.5 | 39.2 | 42.8 | 39.8 | 39.7 | 36.8 |
  | slowed hits out of line (`.wasm` 51 970) | 33.5 | 52.2 | 33.5 | 38.3 | 41.7 | 39.5 | 34.0 | 34.5 |
  | every hit at the host's rate, slowed ones retuned after | 38.3 | 56.3 | 38.6 | 42.1 | 46.3 | 44.3 | 33.8 | 38.0 |

  The last two rows are from their own runs (old and new read in each, within 0.4 ns of the
  rows above). Each of the three small things the design adds to the dry frame, taken away alone, gives
  back most of the cost; adding a different small thing loses more. That is placement, not
  work (none of them is 3 ns of instructions). The list said to stop on it and leave the
  layout as designed; done. `ask` and `retune` inlined (the 57 920-byte build) left
  `pi_process` the same size, so the size fixes are not the cause.
- **Two planted faults no test can catch, and why.** The design resets the grid twice on the
  frame 1 starts (`clear`, and the reconcile when a sound becomes slowed), and keeps it running
  through the ramp out, where nothing is slowed. Removing either changed no output of any
  engine. A plant that survives every test is a hole in the tests or a line that does
  nothing: here, the second. A third (quiet ignoring a line's ends) did name a hole: a line
  landing exactly on +0 never happens in a tour, so a test puts one there by hand.
- **One plant of mine did nothing** (the trigger's mask zeroed while `stale`): `stale` is
  already false by then, because the read moved before the hits. Run each plant's diff past
  the code's order before counting it.
- **Our sounds are not the PO-12's, so read per sound.** Take c's pattern through ours: the
  tone falls exactly two octaves (220.0 → 55.0 Hz) and lasts 3.85 times as long, no louder.
  The level over the run (+6.0 against +7.2 dB) and the "peak" (+0.1 against +3.5) are our
  noise against the PO-12's swelling sound 8. Above 10 kHz against the whole sound ours reads
  −46.0 dB beside the PO-12's −47.9, which looked like a match until the dry bars were read:
  ours has 9 dB less up there to begin with. Against dry, ours loses 19 dB above 10 kHz and the
  PO-12 30. A figure against the whole sound compares the sounds as much as the effect.
- **The script's pitch tracker reads a triangle at 55 Hz as its third harmonic** (164.8 Hz in
  the harmonics line). The spectrum's peak between 25 and 150 Hz gave 55.0. Know a reading's
  range before believing it on a low note.

## Session 33: Rack reads the keys and sliders every 16 frames (2026-11-25)

- **The scan was the cost Session 29 said it was, and it went.** perf, one Rhythm module
  stopped and unpatched, 20 s at 48 kHz, Rack pinned to core 2, before and after interleaved:
  the 23 keys' compare 479 to 534 samples of `Rhythm::process`'s 1 701 to 1 907 (28 to 29%)
  before, 32 to 43 after (a sixteenth). (After: four runs of the scan's commit and two of
  the final one, with the latch test's slider; they read alike.) `Rhythm::process` 1 807 → 1 227 (means of six runs,
  −32%); the module 2 237 → 1 801 (−19%), about 0.43% → 0.34% of a core at an assumed 5.25 GHz.
- **`pi_process` read more after, in every after build: 319 → 456 (+43%).** The library is
  the same bytes and is given the same inputs on every non-scan frame. Not where it landed:
  two scratch builds that moved it by a further 64 and 128 bytes read 423 to 461 the same. Not
  found ⚠. Without call graphs (`perf_event_paranoid` 2) the likeliest reading is that the
  scan's work used to overlap `pi_process`'s stalls, and the samples now land on the stalls;
  the module's total still fell by 436.
- **What is now `Rhythm::process`'s largest part: `jacks.frame`**, about 670 to 690 of its
  1 210 to 1 290 samples (54%): sixteen VOICES channels times 5 with a finite test each, and
  sixteen trigger counters, worked out every frame whether VOICES and TRIGGERS are patched or
  not (only the writing is skipped). RACK-RULES says an unpatched jack should cost nothing;
  this one costs the most. The next step if the idle cost is wanted lower.
- **A planted fault no test caught named a hole, and a test closed it.** With the sliders read
  only in a fixture self-test, every self-test passed: the fixtures are the only tests that
  moved a slider, and they scan every frame. The latch loop test now moves slider A on the
  module's parameter at step 12 and holds the view at step 13. A second plant (the frame
  count never stepped, so every frame scans) changes nothing any test can see: it is the old
  module, only slower. perf is its test.
- **Rack `-h` exits at once when its stdin is at end of file.** It prints "Press enter to
  exit." and reads stdin; two of my perf runs ended after 0.02 s with 5 and 8 samples and had
  to be thrown away (two earlier runs from the same script had run their 20 s; why stdin
  differed is not known). `sleep 25 | perf record ... timeout -s INT 20 ./Rack -h` holds it
  open. Read the sample count before reading a profile.
- **`git checkout <file>` to undo a plant also undoes the work not yet committed in that
  file.** It cost me the latch test's first draft, written again from the same text. Commit
  before planting, as Session 32's plants did in scratch copies.
