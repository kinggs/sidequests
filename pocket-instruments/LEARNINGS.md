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
