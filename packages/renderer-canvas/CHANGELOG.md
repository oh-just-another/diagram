# @oh-just-another/renderer-canvas

## 0.60.0

### Minor Changes

- bdc847e: Add four editor tools:
  - **Eyedropper** — new `eyedropper` mode (toolbar button, `Alt+I`). Click a
    shape to sample its fill/stroke and apply it to the selection.
    `Editor.pickColorAt` / `applyEyedropperAt` + pure `pickColorAt`.
  - **Convert element type** — `Editor.convertSelection(target)` and pure
    `computeConvertType` switch rectangle ↔ ellipse ↔ diamond (polygon) in place,
    preserving position/size/style. New "Shape type" property-panel control.
  - **Image crop** — optional normalised `crop` rect on `ImageElement` (additive,
    serialised). New `crop` mode entered by double-clicking an image or the
    property-panel Crop button: drag a frame, `Enter` to apply, `Esc` to cancel.
    Canvas2D renders the cropped source region (`RenderTarget.drawImage` gains an
    optional `crop` arg). `Editor.beginImageCrop` / `commitImageCrop` /
    `cancelImageCrop` + pure `computeSetImageCrop` / `cropRectFromWorldDrag`.
  - **Flowchart auto-generate** — `Cmd/Ctrl+Alt+Arrow` spawns a connected node
    from the selected node in that direction. `Editor.spawnConnectedNode` + pure
    `computeSpawnConnectedNode`.

  Also exposes `worldToLocal` from `@oh-just-another/scene`.

- 407f203: WebGL2Target: instanced batching of axis-aligned rect fills. Consecutive same-frame sharp `rect()` + `fill()` calls now coalesce into one `drawArraysInstanced` (unit quad + per-instance projected affine + RGBA), replacing one `drawArrays` per rect. Any intervening non-batchable draw (stroke, ellipse / polygon / curve fill, image, text) and every surface op (`clear`, `resize`, frame `present`) drain the queue first, so draw order (z-order) is unchanged. `LayeredSurface.present()` flushes the batch at frame end. Rounded rects (curve path) and stroked outlines are unaffected. Transparent — no `RenderTarget` API change.
- 744f4b8: Perf: two hot-path optimizations.
  - `renderViaTiles` accepts an optional `index` (`SpatialGrid`) in `RenderViaTilesOptions`. When supplied, per-tile element selection queries the index instead of scanning every shape in every layer (`O(shapes + Σtiles·candidates)` vs `O(tiles×shapes)`); draw order is preserved. Omitting it falls back to the full scan, unchanged. Micro-bench (10k shapes × 169 tiles): ~299 → ~7 ms/frame (~42×), including a per-frame draw-order rebuild.
  - MSDF width measurement is now single-pass and memoized per atlas: `measureText`/`textMetrics` share one `advance/unitsPerEm` walk with the layout pass, so a measure after the same run was drawn (caret/selection geometry) is O(1). Measured and drawn widths stay identical.

- f8302c3: Make the `webgl2` backend's `preserveDrawingBuffer` configurable via a new
  `preserveDrawingBuffer` option on `createLayeredSurface` /
  `CreateLayeredSurfaceOptions` and `WebGL2Target` (`WebGL2TargetOptions`). It
  still defaults to `true` — the incremental dirty-rect renderer needs the
  previous frame to survive between composites. Hosts that redraw the whole frame
  every time can pass `false` to drop a Safari/iOS full-recomposite-per-swap cost.
  Export/screenshots are unaffected (they use a separate offscreen Canvas2D
  target).

### Patch Changes

- 99b5bee: Image `crop` now renders in the WebGL2 and SVG backends, matching Canvas2D. WebGL2 applies the normalised crop rect as a UV sub-rect via `uUvOffset`/`uUvScale` uniforms; SVG oversizes the `<image>` to the virtual full image and clips it to the destination box with a generated `<clipPath>` (`preserveAspectRatio="none"` to keep the stretch semantics). Previously both backends ignored `crop` and drew the whole image. Covered by a new cropped-image golden scene and WebGL2 uniform tests.
- 394d3ce: Offscreen backend: skip re-posting layers whose command stream is unchanged. `RecordingTarget` now folds each recorded command into a rolling content signature (exposed via `lastSignature`), and `OffscreenLayeredSurface.present()` compares it against the last stream shipped to each layer's worker — an identical frame (e.g. a static grid / overlay while only the main layer's GIF advances) is not cloned across the worker boundary nor replayed. Pixel output is unchanged; the worker retains its previous frame.
- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [0d3934e]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [295f38b]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/renderer-core@0.59.0

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
