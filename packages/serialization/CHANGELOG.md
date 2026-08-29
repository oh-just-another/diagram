# @oh-just-another/serialization

## 0.61.2

### Patch Changes

- Updated dependencies [7f26f79]
  - @oh-just-another/scene@0.63.1

## 0.61.1

### Patch Changes

- 0846934: Canvas paper colour per scene: `viewport.background` (serialised, additive; `DEFAULT_CANVAS_BACKGROUND` / `canvasBackgroundOf` in `scene`), `Editor.setCanvasBackground(color | null)` / `Editor.canvasBackground` with undo, a Board › Background color submenu (`CANVAS_BACKGROUND_PRESETS`) that also drives the editor root's `--du-canvas-bg`, and "with background" PNG exports plus headless `renderToPng` that paint the scene colour by default.
- Updated dependencies [0846934]
  - @oh-just-another/scene@0.63.0

## 0.61.0

### Minor Changes

- e66a8a5: Canvas-menu backing APIs. `Editor.preferences` / `setPreferences` (`snapObjects`, `showObjectSize`, `suggestObjectSize`, `wheelMode`) seeded via `EditorOptions.preferences`; `wheelMode` (`auto` / `mouse` / `trackpad`) routes plain wheel events to zoom or pan. `Editor.unlockAll()`, `Editor.createStickyAt(point)`. Saved start view: `Viewport.startView` (exported with the scene, applied when a document loads), `Editor.setCurrentViewAsStart()` / `goToStartView()` / `clearStartView()` / `startView`.
- 0ed2288: Embed binary files in scene file exports. `serializeScene` / `stringifyScene` accept `{ includeFiles: true }` to inline `Scene.files` (base64) into the document, and `parseScene` / `deserializeScene` restore them — so a saved scene with images / GIFs / videos is self-contained and renders on any machine. The editor's Save action (Cmd+S) now embeds files; autosave documents still omit them (bytes stay in the host's binary store).
- 5f08d13: Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
- 745d7a9: Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.

### Patch Changes

- e2ff8df: Image file tools. The image toolbar (single selection) gained a file-name input (renames the backing `BinaryFile`, undoable), Replace image (swaps the bytes while keeping position / size / crop), Download (original bytes with stored name / mime) and an Alt-text editor backed by the new `ImageElement.alt` field (serialized; surfaced to hosts for accessibility). New editor APIs: `renameBinaryFile`, `setImageAlt`, `replaceImageFile`.
- 3019bc7: Inline label editing behaves like a proper text box. The label's visible line window now scrolls to follow the caret (transient `metadata.labelScrollLines`, stripped on commit/cancel and on save), so arrowing to the end of a long label keeps the edited line on screen; selection highlight and the caret are clipped to the shape body. Double-click places a collapsed caret without arming a drag-select (no more accidental part-selection). Emoji now survive the WebGL2 backend: strings containing pictographs take the rasterised-bitmap text path instead of the monochrome MSDF atlas that cannot shape them.
- 68f1e02: Accept `lineKind` / `blockArrow` link fields in the wire schema. Scenes saved with a block-arrow connector previously failed strict validation on load and were dropped by hosts as unparseable.
- 586b7ed: Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
- 993b46a: Text highlight color. New `TextStyle.highlight` paints a marker-style line-height stripe behind the glyphs on every backend, works per styled run (inline-edit range selection highlights just those characters) and round-trips through serialization. The text toolbar gained a Highlight control next to the text color.
- ef7388f: Text lists. Text elements gained per-paragraph attributes (`paragraphs`: bulleted / numbered kind + nesting level) that survive serialization. The layout engine indents list paragraphs, shrinks their wrap budget and keeps caret / click / selection geometry in lockstep; renderers draw derived markers ("•", auto-numbering per nesting level) on every backend. New editor APIs `setParagraphList` / `indentParagraphs` target the inline-edit selection's paragraphs while editing (whole element otherwise); typing keeps attributes aligned (Enter continues a list, deleting a line drops its attrs); Tab / Shift+Tab change nesting during editing. The text toolbar gained a two-row List dropdown (bulleted / ordered + indent ±).
- Updated dependencies [e66a8a5]
- Updated dependencies [06a0625]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [2e2a9e7]
- Updated dependencies [350c6d3]
- Updated dependencies [745d7a9]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [8163681]
  - @oh-just-another/scene@0.62.0

## 0.60.0

### Minor Changes

- 762dd8a: Brush capture pipeline upgrade: input streamlining (low-pass with commit-time catch-up), speed-simulated pressure for mouse/touch (slow = thick, fast = thin) with rate-limited pen pressure, sample decimation with a soft point cap, and end tapering. `BrushElement` gains an optional regeneration payload (`pressures`, `simulatePressure`, `baseWidth`) carried through serialization; `Editor.beginBrushStroke` accepts a `pointerType` argument to pick the pressure source. The live preview runs the same pipeline as the commit.

### Patch Changes

- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/scene@0.61.0

## 0.59.0

### Minor Changes

- 783749e: Brush strokes can now be closed and filled. When a fill colour is set in the drawing panel and a stroke's end is drawn back near its start (within `BRUSH_CLOSE_DISTANCE`), the committed `BrushElement` gets `closed: true` and the renderer fills the enclosed area with `style.fill` under the variable-width stroke body. Open strokes and strokes drawn without a fill colour are unchanged. `BrushElement.closed` is serialized.
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

- 672b557: Add `sceneJsonSchema()` — JSON Schema (draft-07) of the scene wire document, generated on the fly from the zod schema. For LLM structured output and external validators.
- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0

## 0.58.0

### Minor Changes

- 9673846: Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
  shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
  at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
  on/off now lives on the scene viewport and persists with it. Scene documents
  migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
  ships gridless by default; hosts enable the grid per scene.

### Patch Changes

- d44348a: Mark `migrations-builtin` as having side effects so tree-shaking bundlers keep the built-in scene migrations. Previously a `sideEffects: false` package flag let aggressive bundlers drop the migration registration, so an older scene document wouldn't upgrade on load.
- Updated dependencies [9673846]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/scene@0.59.0

## 0.57.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/types@0.57.0
