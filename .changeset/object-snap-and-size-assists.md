---
"@oh-just-another/state": minor
"@oh-just-another/renderer-core": patch
---

Object snapping and size assists. Move / resize gestures snap to the edges and centres of nearby shapes (alignment guides on the overlay, `snapObjects` preference), resizing can snap to a nearby shape's width / height with that shape highlighted (`suggestObjectSize`), and a `W × H` readout shows under the shape being resized (`showObjectSize`). `Editor.snapGuides` / `sizeReadout` / `sizeMatch` expose the per-tick state; `snapMoveDeltaToObjects` / `snapResizeDeltaToObjects` are the pure helpers. Guides use the reference look: a dashed alignment line overshooting both shapes, plus ticked distance segments (labelled when `showObjectSize` is on) for the gap between the shapes and for a matched width / height. `buildRoundedRectPath` is exported from `@oh-just-another/renderer-core`. Participation follows the reference: brush strokes never snap (as targets or movers), targets must sit on the 90° grid and be at least `OBJECT_SNAP_MIN_SIZE_PX` on screen, moves pair edge-to-edge / centre-to-centre only, and a multi-selection snaps by its frame edges.
