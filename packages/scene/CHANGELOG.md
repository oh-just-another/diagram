# @oh-just-another/scene

## 0.64.0

### Minor Changes

- 47221cc: Binary files no longer outlive the shapes that reference them: deleting (or erasing / cutting) the last shape pointing at a file drops its `scene.files` entry in the same undoable step, so a host store mirroring `scene.files` stops growing with every removed image or video. Undo restores the entry with the shape, and the clipboard carries the bytes so a cut image still pastes. `referencedFileIds(scene)` / `unreferencedFileIds(scene)` are exported from `scene` for hosts that prune their own store.

## 0.63.2

### Patch Changes

- 20fc326: Tunables that lived as file-local literals are now named exports: `SPATIAL_GRID_CELL_SIZE` (default `SpatialGrid` / `buildSpatialIndex` cell), `LINK_HIT_THRESHOLD` (default `findLinkAt` tolerance) and `MAX_PARENT_DEPTH` (parent-chain walk bound). Values unchanged.

## 0.63.1

### Patch Changes

- 7f26f79: `getElementAccessibleName` appends a labelled shape's label (`Rectangle "Item 3"`), truncated at `ACCESSIBLE_NAME_MAX_CHARS`.

## 0.63.0

### Minor Changes

- 0846934: Canvas paper colour per scene: `viewport.background` (serialised, additive; `DEFAULT_CANVAS_BACKGROUND` / `canvasBackgroundOf` in `scene`), `Editor.setCanvasBackground(color | null)` / `Editor.canvasBackground` with undo, a Board › Background color submenu (`CANVAS_BACKGROUND_PRESETS`) that also drives the editor root's `--du-canvas-bg`, and "with background" PNG exports plus headless `renderToPng` that paint the scene colour by default.

## 0.62.0

### Minor Changes

- e66a8a5: Canvas-menu backing APIs. `Editor.preferences` / `setPreferences` (`snapObjects`, `showObjectSize`, `suggestObjectSize`, `wheelMode`) seeded via `EditorOptions.preferences`; `wheelMode` (`auto` / `mouse` / `trackpad`) routes plain wheel events to zoom or pan. `Editor.unlockAll()`, `Editor.createStickyAt(point)`. Saved start view: `Viewport.startView` (exported with the scene, applied when a document loads), `Editor.setCurrentViewAsStart()` / `goToStartView()` / `clearStartView()` / `startView`.
- 06a0625: Recover media dropped with a generic MIME. A file handed over with an empty `File.type` (some drag sources / extension-less downloads) was stored as `application/octet-stream`, and rehydration — which routes image-vs-video decoding by mime — sent it to the wrong decoder, so the shape reloaded blank. Persistence now infers the mime from the filename extension (`inferFileMime`), and rehydration falls back to magic-byte sniffing (`sniffBinaryFileMime` in scene: mp4/webm/ogg/png/jpeg/gif/webp/svg) for already-stored generic entries.
- e2ff8df: Image file tools. The image toolbar (single selection) gained a file-name input (renames the backing `BinaryFile`, undoable), Replace image (swaps the bytes while keeping position / size / crop), Download (original bytes with stored name / mime) and an Alt-text editor backed by the new `ImageElement.alt` field (serialized; surfaced to hosts for accessibility). New editor APIs: `renameBinaryFile`, `setImageAlt`, `replaceImageFile`.
- 5f08d13: Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
- 350c6d3: Locked elements are now click-through: the pointer hit-test skips locked (and hidden) shapes and picks whatever lies beneath, instead of letting them shadow the shapes below. Locking a selection drops it. Unlocking moved to the right-click context menu ("Unlock", backed by the new `Editor.lockedElementAt` / `Editor.unlockElement`), and the selection toolbar gained a Lock button plus a "Lock" context-menu entry. `getElementAt` / `getElementAtIndexed` accept an optional `accept` predicate that skips rejected shapes and keeps scanning beneath them.
- 745d7a9: Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.
- d4c2c2f: Sticky notes and emoji elements. New plugin-style scene types: `sticky` (rounded card, background from `style.fill`, text via the shared embedded label with double-click editing, optional author-name strip) and `emoji` (single glyph at a given size). Both render on every backend, serialize through the custom-element schema, and are created from the shape library ("Sticky note" now produces a real sticky; new "Emoji" entry). The selection toolbar gained dedicated branches: sticky — S/M/L size presets, background color/opacity, Show-author toggle; emoji — a glyph picker. New editor APIs: `setStickySize`, `toggleStickyAuthor`, `setEmojiGlyph`.
- 993b46a: Text highlight color. New `TextStyle.highlight` paints a marker-style line-height stripe behind the glyphs on every backend, works per styled run (inline-edit range selection highlights just those characters) and round-trips through serialization. The text toolbar gained a Highlight control next to the text color.
- ef7388f: Text lists. Text elements gained per-paragraph attributes (`paragraphs`: bulleted / numbered kind + nesting level) that survive serialization. The layout engine indents list paragraphs, shrinks their wrap budget and keeps caret / click / selection geometry in lockstep; renderers draw derived markers ("•", auto-numbering per nesting level) on every backend. New editor APIs `setParagraphList` / `indentParagraphs` target the inline-edit selection's paragraphs while editing (whole element otherwise); typing keeps attributes aligned (Enter continues a list, deleting a line drops its attrs); Tab / Shift+Tab change nesting during editing. The text toolbar gained a two-row List dropdown (bulleted / ordered + indent ±).
- e15fa56: Empty text elements show a grey placeholder prompt while being written ("Type something", "Place for text", …): `TEXT_PLACEHOLDERS` (weighted list, a few jokes at low odds) and `pickTextPlaceholder(id)` (deterministic per element id, so the prompt never changes under the caret) live in `@oh-just-another/scene`; the text bounder sizes an empty element by its prompt, so the selection box wraps it and the dirty rect covers it. `TEXT_PLACEHOLDER_COLOR` is exported from renderer-core. Drawn only when `RenderSceneOptions.textPlaceholders` / `ElementRenderContext.textPlaceholders` is set — the editor sets it outside view mode; exports and headless rendering keep empty text blank.

### Patch Changes

- 2e2a9e7: Second review pass on shape labels and stickies. Label text is now strictly contained: when not even one line fits the padded body nothing paints outside the shape (no more tile artifacts after growing the font). Double-click places the caret at the click point instead of jumping to the (possibly clipped) text end. Cmd/Ctrl+A inside the inline editor is handled explicitly, removing a race with the selection mirror that made select-all intermittently need a second press. Labels are real rich text: styling with an active selection applies to just that range (styled runs) rather than the whole label. Stickies lost the folded corner (plain sheet with the bottom drop shadow), and emoji reactions became per-user toggles — your own click adds and then removes YOUR reaction (`toggleStickyReaction`, `reactions[].users`), so counters only grow through other collaborators.
- 586b7ed: Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
- 8163681: First review pass on the toolbar redesign. Locked elements are no longer captured by marquee selection. Embedded shape labels clip to the shape's padded body (extra lines aren't painted), the inline-edit caret sits exactly on its line, and shapes with a label show the full set of text controls (font, size, style, alignment, color, highlight) writing through the new `updateLabelStyle` / `updateLabelProps`. Replacing an image refits the shape's height to the new file's aspect ratio, image resize never mirrors on overshoot, and the crop button matches the toolbar style. Sticky notes look like paper (drop shadow, folded corner), support tags (toolbar editor + on-card pills) and emoji reactions with counters via a bottom-left reaction bar (`StickyReactions` overlay, `setStickyTags` / `addStickyReaction`). The hide-frame feature was removed.

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
