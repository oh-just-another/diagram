# @oh-just-another/scene

## 0.61.0

### Minor Changes

- 762dd8a: Brush capture pipeline upgrade: input streamlining (low-pass with commit-time catch-up), speed-simulated pressure for mouse/touch (slow = thick, fast = thin) with rate-limited pen pressure, sample decimation with a soft point cap, and end tapering. `BrushElement` gains an optional regeneration payload (`pressures`, `simulatePressure`, `baseWidth`) carried through serialization; `Editor.beginBrushStroke` accepts a `pointerType` argument to pick the pressure source. The live preview runs the same pipeline as the commit.
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

- 05707ed: Drag the caption pill along its link. With the link selected, dragging the
  pill slides the label along the drawn path (the cursor is projected back onto
  the polyline — new `projectPointToPathT` in scene); within a few pixels of
  the arc-length middle it snaps back to the default placement
  (`label.position` removed, so elbow links regain longest-segment
  auto-placement). One undo step, Escape reverts, double-click still opens the
  inline text editor, and handle dots keep pointer priority over the pill.
  Tunable snap radius: `LINK_LABEL_DRAG_SNAP_PX`.
- 20af638: Fix: the caption pill no longer fights the bend/segment handles. The
  "add waypoint" and elbow segment handles slide out from under the label pill
  along their own span (`getLinkWaypointMidpoints` is label-aware; new shared
  `getElbowSegmentHandles` keeps the drawn dot and the grab point identical), so
  a click on the pill selects the link and a double-click opens the inline
  caption editor. Visible handle dots keep pointer priority — an existing
  waypoint dot sitting inside the pill is still grabbable (dots draw above the
  pill).

## 0.60.0

### Minor Changes

- 783749e: Brush strokes can now be closed and filled. When a fill colour is set in the drawing panel and a stroke's end is drawn back near its start (within `BRUSH_CLOSE_DISTANCE`), the committed `BrushElement` gets `closed: true` and the renderer fills the enclosed area with `style.fill` under the variable-width stroke body. Open strokes and strokes drawn without a fill colour are unchanged. `BrushElement.closed` is serialized.
- c189261: The live brush-stroke preview now paints in the chosen palette colour and opacity instead of a hardcoded dark-grey fill, so it matches the committed stroke. The brush body colour resolution is now a single shared `brushBodyColor(style)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the preview, so the two can't drift.
- c189261: Brush strokes now render as a single closed outline polygon filled once, instead of a chain of per-segment quads plus a disc at every joint. The old approach overlapped itself, so at `opacity < 1` the joins double-blended into dark blotches; the single fill paints every pixel exactly once. Round joins/caps are preserved (arc points on convex corners, mitered concave corners clamped to stay a simple, non-self-intersecting polygon). The outline geometry is a new shared `brushOutline(points)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the live preview.
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

- a9558d9: Reworked flowchart keyboard model. Arrow-key bindings are reworked and disambiguated by modifier: `Arrow` nudges (unchanged); `Cmd/Ctrl+Arrow` grows a flowchart CREATE session (each press adds a pending connected sibling, previewed on the overlay, committed as one undo step when Cmd/Ctrl is released, cancelled on Escape); `Alt+Arrow` navigates to the adjacent node (graph neighbour, else spatially nearest); `Cmd/Ctrl+Shift+Arrow` aligns (moved off the old plain `Alt+Arrow`). The old `Cmd/Ctrl+Alt+Arrow` spawn binding is retired.

  New API: `editor.growFlowchart` / `commitFlowchart` / `cancelFlowchart` / `navigateFlowchart` / `flowchartPreview`, the pure `computeSpawnConnectedNodes`, and `endpointElementId` (scene). `<Diagram>` wires the keyup-commit / Escape-cancel lifecycle for you.

- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

## 0.59.0

### Minor Changes

- 9673846: Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
  shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
  at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
  on/off now lives on the scene viewport and persists with it. Scene documents
  migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
  ships gridless by default; hosts enable the grid per scene.
- f98730f: Removed the unused `allElementsInLayer` export. Build the same list with `getElementsInLayer(scene, layerId).map((s) => s.id)`.
- 904cc09: Export `FALLBACK_SCENE_WIDTH` / `FALLBACK_SCENE_HEIGHT` — the default canvas dimensions for a scene with no explicit viewport size. Shared by the import and export adapters.

### Patch Changes

- Updated dependencies [3152317]
  - @oh-just-another/math@0.58.0

## 0.58.0

### Minor Changes

- d1b96d9: Couple snap-to-grid to grid visibility, and turn the grid on by default.

  Snapping is now active only while a grid is actually displayed — the toggle is
  on (`gridVisible`) AND the scene has a positive `gridSize`, the same condition
  `renderGrid` paints under. Snapping to an invisible grid is gone: no grid → no
  snap, always.

  `DEFAULT_VIEWPORT` now ships `gridSize: DEFAULT_GRID_SPACING` (tune it in scene
  `constants.ts`), so a fresh scene has a visible grid and snapping on. Pass a
  scene with `gridSize: 0` (or omit it on a custom viewport) for a gridless,
  snap-free canvas.

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/math@0.57.0
  - @oh-just-another/types@0.57.0
