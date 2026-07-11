---
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": minor
---

Thread the animated-content playback clock as a per-instance render provider instead of a process-global singleton. `RenderSceneOptions` gains an optional `clock`, forwarded to each shape renderer via `ElementRenderContext.clock` (new `AnimationClock` type export). `Editor` now passes its own per-shape playback clock through the render snapshot, so two editors on one page drive independent GIF playback and no longer overwrite a shared module global every frame. The module-global `setAnimationClock` remains as a documented process-global fallback for context-less paths (headless SVG / worker / PNG export and the tile compositor); behaviour is unchanged when no per-instance clock is supplied. Additive and backwards-compatible.
