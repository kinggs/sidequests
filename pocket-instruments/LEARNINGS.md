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
