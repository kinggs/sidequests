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
