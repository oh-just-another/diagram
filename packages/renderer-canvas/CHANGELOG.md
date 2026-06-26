# @oh-just-another/renderer-canvas

## 0.59.0

### Minor Changes

- 1c7cc6c: New package `@oh-just-another/fonts` bundles the editor's fonts (Roboto, PT Serif, Roboto Mono) as web fonts, and the Canvas2D / offscreen backends now draw with them via `resolveBundledFamily`. Text is consistent across renderers instead of WebGL2 using the embedded font while Canvas2D fell back to a system font. `<Editor>` loads the fonts on mount and redraws once they're ready.
- e1fd495: The offscreen worker backend no longer re-ships an `ImageBitmap` on every frame. `RecordingTarget` now interns bitmaps by identity to a stable id: the first draw emits a `defineImage` carrying the pixels, later draws of the same bitmap emit only a small `drawImage` referencing the id. The worker keeps a same-capacity LRU mirror (closing evicted clones), so animated GIF / video frames held across several rAF ticks cost one tiny command instead of a full structured-clone copy. `replayCommands` takes an optional image-cache argument the worker owns across replays.
- 8f00738: Images (static and animated GIF) now render on the OffscreenCanvas worker backend, matching the Canvas2D / WebGL2 backends. The offscreen command stream now carries `drawImage` as an `ImageBitmap`, and static images are loaded as `ImageBitmap` so they cross the worker boundary. `insertImage` now accepts an `ImageBitmap` handle in addition to `HTMLImageElement`.

### Patch Changes

- 1c7cc6c: WebGL2 text now derives its baseline from the same browser font metrics Canvas2D uses (measured via `fontBoundingBox`), so text sits at the same vertical position — and reads the same line spacing — as the Canvas2D and offscreen backends.
- 1c7cc6c: `RecordingTarget.measureText` now measures on a hidden 2D context with the active font instead of returning a rough character-count estimate. On the offscreen backend this makes caret / selection geometry line up with the text the worker actually draws.
- Updated dependencies [1c7cc6c]
- Updated dependencies [9673846]
- Updated dependencies [ff90a95]
- Updated dependencies [3152317]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/fonts@0.1.0
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/math@0.58.0
  - @oh-just-another/curve-mesh@0.57.1

## 0.58.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/renderer-core@0.57.1

## 0.58.0

### Minor Changes

- 8515093: Introduce `@oh-just-another/editor` — a drop-in `<Editor>` React component that
  auto-detects renderer / WASM / worker capabilities and exposes a programmatic
  editor handle via `ref`. The editor was extracted out of the demo app so it can
  be consumed as a standalone package (`Diagram` is kept as a back-compat alias).

  `@oh-just-another/renderer-canvas` now exports `createRenderWorker()`, so the
  offscreen render worker is constructed through a normal package import instead
  of a cross-package relative path — correct for both source and published builds.

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/curve-mesh@0.57.0
  - @oh-just-another/glyph-atlas@0.57.0
  - @oh-just-another/math@0.57.0
  - @oh-just-another/renderer-core@0.57.0
  - @oh-just-another/renderer-workers@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/types@0.57.0
