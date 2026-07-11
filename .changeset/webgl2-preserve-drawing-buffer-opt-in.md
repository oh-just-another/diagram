---
"@oh-just-another/renderer-canvas": minor
---

Make the `webgl2` backend's `preserveDrawingBuffer` configurable via a new
`preserveDrawingBuffer` option on `createLayeredSurface` /
`CreateLayeredSurfaceOptions` and `WebGL2Target` (`WebGL2TargetOptions`). It
still defaults to `true` — the incremental dirty-rect renderer needs the
previous frame to survive between composites. Hosts that redraw the whole frame
every time can pass `false` to drop a Safari/iOS full-recomposite-per-swap cost.
Export/screenshots are unaffected (they use a separate offscreen Canvas2D
target).
