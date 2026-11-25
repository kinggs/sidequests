# Rules for a Rack module

**Status:** read from VCV's manual on 2026-11-19 (R33, R34, R35). Tried in Rack since
Session 13 (the Rhythm module); the lines marked **ours** are what building it taught, the
latest from Session 18 (thirteen jacks in two rows, sound in, 2026-11-23).

What every module we make for VCV Rack is held to. Each line is the rule in our words; the
fact and its source are in `REFERENCES.md` under the number given. Re-read the source before
leaning on a line that is old.

**must** is something Rack will not draw or run correctly without. **should** is VCV's advice.
**ours** is what we measured ourselves (PLAN.md: efficient, measured).

## The panel

| | Rule | Why | Source |
|---|---|---|---|
| must | Draw the panel as an SVG in mm, 128.5 mm tall and a multiple of 5.08 mm wide | Rack reads no other unit; 5.08 mm is 1 HP | R33 |
| must | Turn all lettering into outlines | Rack's SVG reader draws no text | R33 |
| must | Use flat fills. No CSS, no filters, no gradient beyond a plain two-colour linear one | The reader supports little else | R33 |
| must | Keep keys, sockets, lights and displays off the panel; they are widgets | The panel is the part that never changes | R33 |
| should | Put a placeholder for each widget on a hidden layer named `components`: param red, input green, output blue, light magenta, custom widget yellow | Rack's helper script reads it and writes the module's first C++ | R33 |
| should | Design as if for hardware | It is the look Rack users read fastest | R33 |
| should | Leave room for a thumb between controls and sockets | Cables and fingers share the space | R33 |
| should | Put outputs on an inverted background | It is how a Rack user tells an output from an input | R33 |
| should | Keep text readable at 100% zoom on an ordinary monitor: about 2.95 px to the mm | Many users never zoom in | R33 |
| should | Keep labels short, and near the density and type size of VCV's own modules | The same | R33 |
| should | Put a socket's label above it, not below | A plugged cable hangs over what is below | R36 ⚠ |
| must | Use nobody else's artwork, names or marks without permission | VCV's rule, and ours (README rule 6) | R33 |
| ours | Give each output its own patch of inverted ground when inputs and outputs are grouped by what they carry and not by side. Two outputs side by side may share one | An output is told by its plate, wherever it sits | D76 item 3, Session 18 |
| ours | Group jacks by what they carry: an output beside the input that answers it, a loop reading left to right as it is patched | The patch can be read off the panel | D76 |
| ours | Check the drawing by arithmetic before looking at it: no label within 1 mm of its neighbour's, nothing a jack draws within 0.5 mm of the next jack's, nothing past the margin. `design/make_panel.py --check` | At 2.6 mm a word of eight letters is 13 mm wide: wider than a socket's 11.67 mm pitch. D76's first positions overlapped twice | Session 18, D80 items 16 and 17 |
| ours | A label too wide for its pitch goes on two lines over its socket, the group's name first (FX over SEND). Do not shrink the type | 2.6 mm is what 100% zoom needs | Session 18 |
| ours | Look at the face in Rack's screenshot mode at 100% zoom before anything is built on a panel (`PLAN.md`, Machine state), unlit and with a face filled by hand | A headless Rack draws nothing | Sessions 13 and 18 |

The manual gives no numbers for type size, spacing or colour. Where a line above has a
number, it is ours.

A dark panel needs no second, dark variant (R35).

## The voltages

| | Rule | Source |
|---|---|---|
| should | Audio out at about ±5 V. Never beyond ±12 V. Saturate, do not hard clip | R34 |
| should | A trigger out is 10 V for 1 ms. A gate is 10 V while it is on | R34 |
| should | A trigger in is a Schmitt trigger: low about 0.1 V, high about 1 to 2 V | R34 |
| should | After a RESET, ignore CLOCK for 1 ms | R34 |
| should | A cable carries up to sixteen channels. A module with such a socket takes the `Polyphonic` tag | R34 |
| must | Never send NaN or infinity down a cable: send 0 | R34 |
| ours | A voltage that stands for a control's travel is 0 to 10 V (A OUT, B OUT, A IN, B IN: a slider). Turn it back to a number to the nearest, never down: a float does not survive × 10 and ÷ 10 exactly | D76 item 4; D80 item 7, measured |
| ours | A gate that says what is playing is 10 V on its own channel of a sixteen-channel output for as long as it plays (FX GATES) | R34, R59, D68 |
| ours | A sixteen-channel input cannot tell a silent channel from a missing one: take the channels the cable carries by default, and let the menu tick them one by one. A one-channel input reads the cable's first channel | R58, D62 item 3, D80 item 10 |
| ours | Sound that comes back in is the engine's to mix, not the module's: the module turns volts to numbers and back and nothing else. Only then do the engine's effects reach a returned sound | D68 item 3, `ENGINE.md` §19 |

## The code

| | Rule | Source |
|---|---|---|
| should | Name a port in code without the words input or output: the tooltip adds them | R35 |
| ours | On the audio thread, store to an atomic with `memory_order_relaxed`, and only when the value changed. A default store is a full barrier on x86, every sample | Measured, `LEARNINGS.md` Session 13 |
| ours | Call nothing from libm, and divide by nothing, on a frame where its input has not changed; skip an output that is not patched | Measured, `LEARNINGS.md` Session 13 |
| must | A new port goes after the old ones in its enum, never between them, and no port is ever removed or reordered | Rack ties a cable to a port's number: an old patch's cables would land on other jacks (D76 item 2) |
| ours | A jack that is not patched costs nothing: ask the engine only for the channels the patched jacks need, and write an output only while it is patched | Measured with perf before and after, `LEARNINGS.md` Session 18 |
| ours | An unpatched output keeps no channel count (`setChannels` does nothing while it is 0), but its voltages can still be written and read: a self-test holds the volts | Found in Session 18 |
| ours | When several parameters change on one audio frame, send a held (function) key's press before the keys it modifies, and its release after them | Two parameters set by one gesture can land on one frame (D80 item 13) |
| ours | Read the keys and sliders on every 16th frame, as VCV's own modules read their parameters, and send a change on the frame it is read; read CLOCK, RESET, the menu's queue, the routes and the jacks on every frame. A fixture self-test reads every frame, so its views hold to the frame. ⚠ A press shorter than 16 frames (0.36 ms at 44.1 kHz) can fall between two reads and is not seen; no hand can make one. More changes now share a frame, so the row above matters more | D99; Session 29's perf (the 23 keys' compare was 29% of `Rhythm::process` stopped); built in Session 33 (`pi::scans`, `jacks.hpp`) |
| ours | Whatever must match the engine's bits is tested with the plugin's own compiler flags (`rack/math.mk`); a volt in and a volt out is a division, and `-funsafe-math-optimizations` would make it a multiplication | `LEARNINGS.md` Session 13 |

⚠ R35 also says static text may be written on an SVG panel. R33 says it must be outlined. We
follow R33.

## Where an instrument's own answers go

Each instrument's `design/DESIGN.md` has a table of these rules against that design. Loom's
is under "What VCV's manual asks, and where this stands".
