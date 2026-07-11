---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
"@oh-just-another/state": minor
---

Brush capture pipeline upgrade: input streamlining (low-pass with commit-time catch-up), speed-simulated pressure for mouse/touch (slow = thick, fast = thin) with rate-limited pen pressure, sample decimation with a soft point cap, and end tapering. `BrushElement` gains an optional regeneration payload (`pressures`, `simulatePressure`, `baseWidth`) carried through serialization; `Editor.beginBrushStroke` accepts a `pointerType` argument to pick the pressure source. The live preview runs the same pipeline as the commit.
