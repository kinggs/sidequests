# Rules for a Rack module

**Status:** read from VCV's manual on 2026-11-19 (R33, R34, R35). Not yet tried in Rack.

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

## The code

| | Rule | Source |
|---|---|---|
| should | Name a port in code without the words input or output: the tooltip adds them | R35 |
| ours | On the audio thread, store to an atomic with `memory_order_relaxed`, and only when the value changed. A default store is a full barrier on x86, every sample | Measured, `LEARNINGS.md` Session 13 |
| ours | Call nothing from libm, and divide by nothing, on a frame where its input has not changed; skip an output that is not patched | Measured, `LEARNINGS.md` Session 13 |

⚠ R35 also says static text may be written on an SVG panel. R33 says it must be outlined. We
follow R33.

## Where an instrument's own answers go

Each instrument's `design/DESIGN.md` has a table of these rules against that design. Loom's
is under "What VCV's manual asks, and where this stands".
