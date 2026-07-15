# @oh-just-another/renderer-core

## 0.60.0

### Minor Changes

- 84450bc: Link captions: measured rounded pill, multiline, correct placement and hit-testing.
  - `scene`: new shared label geometry (`linkLabelAnchor`, `estimateLinkLabelBox`,
    `linkLabelBounds`, `pointAlongPath`) — one source of truth for the renderer,
    hit-testing and culling. `findLinkAt` now also hits inside the caption pill.
    Elbow links place an unpositioned label on the longest segment's midpoint;
    explicit `label.position` is clamped away from the arrowheads. Tunables in
    `constants.ts` (`LINK_LABEL_MAX_WIDTH`, paddings, clearance).
  - `renderer-core`: the caption is a rounded pill sized by real `measureText`
    word-wrap (multiline, `\n` breaks) instead of a square estimated box; it
    rides the drawn geometry (flattened curve for bezier, not the chord), and
    `computeLinkWorldBounds` unions the pill so dirty-rect / viewport culling
    never clip it. `LABEL_POSITION` / `LABEL_FONT_SIZE` constants moved to
    `scene` as `LINK_LABEL_DEFAULT_POSITION` / `LINK_LABEL_DEFAULT_FONT_SIZE`.
  - `state`: `linkLabelWorld` uses the shared anchor, so the inline editor opens
    exactly over the pill (including bezier and elbow links).
  - `react-ui`: the inline caption editor is a multiline textarea — Enter
    commits, Shift+Enter inserts a newline, Escape cancels.

### Patch Changes

- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/scene@0.61.0

## 0.59.0

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

- 295f38b: Thread the animated-content playback clock as a per-instance render provider instead of a process-global singleton. `RenderSceneOptions` gains an optional `clock`, forwarded to each shape renderer via `ElementRenderContext.clock` (new `AnimationClock` type export). `Editor` now passes its own per-shape playback clock through the render snapshot, so two editors on one page drive independent GIF playback and no longer overwrite a shared module global every frame. The module-global `setAnimationClock` remains as a documented process-global fallback for context-less paths (headless SVG / worker / PNG export and the tile compositor); behaviour is unchanged when no per-instance clock is supplied. Additive and backwards-compatible.
- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

### Patch Changes

- 783749e: Brush strokes can now be closed and filled. When a fill colour is set in the drawing panel and a stroke's end is drawn back near its start (within `BRUSH_CLOSE_DISTANCE`), the committed `BrushElement` gets `closed: true` and the renderer fills the enclosed area with `style.fill` under the variable-width stroke body. Open strokes and strokes drawn without a fill colour are unchanged. `BrushElement.closed` is serialized.
- c189261: Committed brush strokes now honour `style.opacity`. `drawBrush` paints its fills directly rather than through the shared `applyStyle` helper, so it never applied the stroke's opacity — a translucent brush drew opaque once committed, and the opacity seen while drawing vanished on release. It now sets opacity up front (covering both the enclosed-area fill and the body).
- c189261: The live brush-stroke preview now paints in the chosen palette colour and opacity instead of a hardcoded dark-grey fill, so it matches the committed stroke. The brush body colour resolution is now a single shared `brushBodyColor(style)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the preview, so the two can't drift.
- 641842b: Brush strokes now carry host-controlled paint settings instead of a hard-coded colour. `editor.brushSettings` / `editor.setBrushSettings({ stroke, fill, opacity, width })` set the line colour, enclosed-fill colour (for a future closed-stroke fill), opacity, and base width; a committed stroke bakes them into its style, and the width drives the pressure curve. The brush renderer now paints the line from `style.stroke` (falling back to `style.fill` for strokes authored before the split), so old strokes are unchanged. Fixes the previously hard-coded `#222` brush colour.
- c189261: Brush strokes now render as a single closed outline polygon filled once, instead of a chain of per-segment quads plus a disc at every joint. The old approach overlapped itself, so at `opacity < 1` the joins double-blended into dark blotches; the single fill paints every pixel exactly once. Round joins/caps are preserved (arc points on convex corners, mitered concave corners clamped to stay a simple, non-self-intersecting polygon). The outline geometry is a new shared `brushOutline(points)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the live preview.
- 0d3934e: Fix `renderScene`'s `dimElements` dim so it applies to shapes that carry their own `style.opacity`. The dim alpha (`dimOpacity`) was set before the shape renderer ran, so a renderer applying the shape's opacity called `setOpacity` absolutely and overwrote the dim — meaning the eraser's "about to delete" fade (and group-isolation dim) silently vanished for any shape with an explicit opacity. Dimmed shapes now draw through a wrapper that multiplies the two: a plain shape stays at `dimOpacity`, one with `opacity` renders at `opacity × dimOpacity` — dimmed and semi-transparent.
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
- ff90a95: Export the `ElementRenderContext` type, so custom `ElementRenderer` authors can name their renderer's third argument.

### Patch Changes

- Updated dependencies [9673846]
- Updated dependencies [3152317]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/math@0.58.0

## 0.57.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/math@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/tokens@0.57.0
  - @oh-just-another/types@0.57.0
