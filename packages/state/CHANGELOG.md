# @oh-just-another/state

## 0.60.0

### Minor Changes

- 783749e: Brush strokes can now be closed and filled. When a fill colour is set in the drawing panel and a stroke's end is drawn back near its start (within `BRUSH_CLOSE_DISTANCE`), the committed `BrushElement` gets `closed: true` and the renderer fills the enclosed area with `style.fill` under the variable-width stroke body. Open strokes and strokes drawn without a fill colour are unchanged. `BrushElement.closed` is serialized.
- 641842b: Brush strokes now carry host-controlled paint settings instead of a hard-coded colour. `editor.brushSettings` / `editor.setBrushSettings({ stroke, fill, opacity, width })` set the line colour, enclosed-fill colour (for a future closed-stroke fill), opacity, and base width; a committed stroke bakes them into its style, and the width drives the pressure curve. The brush renderer now paints the line from `style.stroke` (falling back to `style.fill` for strokes authored before the split), so old strokes are unchanged. Fixes the previously hard-coded `#222` brush colour.
- 0d3934e: Eraser gains Alt-restore. While sweeping the eraser, holding Alt un-marks shapes you drag back over — rescuing them before the delete commits on pointer-up (`extendEraseStroke(world, restore)` / `beginEraseStroke(world, restore)`). Marked-for-erase shapes now preview at a dedicated `ERASE_DIM_OPACITY` (0.2 — a clear "about to delete") instead of the gentler group-isolation dim.
- 571f13b: The eraser now shows a dedicated cursor instead of the generic crosshair: a grey ring that follows the pointer, sized to the panel's eraser width (`brushSettings.width`), plus a short fading grey trail while you drag. The OS cursor is hidden in erase mode (`cursor: none`) and the ring/trail are painted on the overlay so any radius composites cleanly. The laser and eraser trails now share one `drawFadingTrail` renderer. New `CursorRole` `"erase"`.
- ca48e8a: Add two interaction tools: an eraser (mode `erase`, hotkey `E`) and a laser pointer (mode `laser`, hotkey `K`).
  - Eraser: press-and-drag sweeps shapes under the cursor into a pending set (previewed dimmed) and deletes them all in one undo step on release. Attached links are removed with their shapes, like a Delete-key delete.
  - Laser pointer: press-and-drag paints an ephemeral red trail that fades over a couple of seconds. Nothing is written to the scene or history — it lives purely on the overlay. Available in read-only mode. Collab replication of trails is a follow-up.

  Both tools appear in the default toolbar (`DEFAULT_TOOLBAR` / `DEFAULT_VERTICAL_TOOLBAR`) and are registered as `mode-erase` / `mode-laser` actions. TTL, colour and width of the laser trail are tunable via `state/constants.ts`.

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

- 511a22a: The eyedropper is no longer a standalone toolbar tool (its palette button and the `Alt+I` hotkey / `mode-eyedropper` action are removed). Instead, every colour picker (`ColorSwatchPicker`) gains an optional pipette button via a new `onEyedrop` prop: clicking it arms `Editor.beginEyedropperPick(onPick)` and the next canvas click samples the colour of the shape under the cursor straight into that swatch — without changing the current tool mode. New editor API: `beginEyedropperPick` and the `isEyedropperArmed` flag; the cursor shows a crosshair while armed.
- a9558d9: Reworked flowchart keyboard model. Arrow-key bindings are reworked and disambiguated by modifier: `Arrow` nudges (unchanged); `Cmd/Ctrl+Arrow` grows a flowchart CREATE session (each press adds a pending connected sibling, previewed on the overlay, committed as one undo step when Cmd/Ctrl is released, cancelled on Escape); `Alt+Arrow` navigates to the adjacent node (graph neighbour, else spatially nearest); `Cmd/Ctrl+Shift+Arrow` aligns (moved off the old plain `Alt+Arrow`). The old `Cmd/Ctrl+Alt+Arrow` spawn binding is retired.

  New API: `editor.growFlowchart` / `commitFlowchart` / `cancelFlowchart` / `navigateFlowchart` / `flowchartPreview`, the pure `computeSpawnConnectedNodes`, and `endpointElementId` (scene). `<Diagram>` wires the keyup-commit / Escape-cancel lifecycle for you.

- 295f38b: Thread the animated-content playback clock as a per-instance render provider instead of a process-global singleton. `RenderSceneOptions` gains an optional `clock`, forwarded to each shape renderer via `ElementRenderContext.clock` (new `AnimationClock` type export). `Editor` now passes its own per-shape playback clock through the render snapshot, so two editors on one page drive independent GIF playback and no longer overwrite a shared module global every frame. The module-global `setAnimationClock` remains as a documented process-global fallback for context-less paths (headless SVG / worker / PNG export and the tile compositor); behaviour is unchanged when no per-instance clock is supplied. Additive and backwards-compatible.
- 7f69f29: Add scene text search, a stats/dimensions overlay, and zen mode.
  - `state`: `searchScene(scene, query)` / `elementSearchText(element)` — a pure, case-insensitive substring index over text shapes, frame names, and edge labels; plus `Editor.selectLink(id)` to programmatically select a single connector.
  - `react-ui`: `<SearchOverlay>` (⌘F) finds and frames matching text with next/prev navigation; `<StatsPanel>` (⌥/) shows the selection's x/y/w/h/angle and scene totals; `<ZenModeProvider>` / `useZenMode` (⌥Z, Esc to exit) hides chrome for focused work. All three are wired into `<Editor>` from `@oh-just-another/editor`.

- cec8f83: Add read-only / view mode. `EditorOptions.readOnly`, `editor.readOnly`, `editor.setReadOnly()` and `editor.toggleReadOnly()` gate every scene-mutating pointer path (create / move / resize / rotate / annotation / edge edits) at the `applyEmit` choke point and in the pointer-down handlers, while pan / zoom / click + marquee select stay live. The action registry now honours each action's `viewMode` flag — in read-only only `viewMode` actions dispatch (zoom, pan, grid, select-all, cancel, and the new `toggle-read-only` action bound to `⌥R`).
- 1975a9b: Stroke-eraser: holding Shift while erasing cuts brush strokes into fragments instead of deleting the whole element. Each brush point within the eraser capsule (radius = the on-screen eraser ring in world units, widened by the point's own half-width) is removed; surviving points split into fragment strokes (a lone kept point becomes a dot), links bound to a cut brush are detached, and it all lands in one undo step. A live preview shows the cut while you drag (touched originals hidden, fragments shown). Without Shift the eraser still deletes whole elements; non-brush shapes under Shift fall back to whole-element erase.
- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

### Patch Changes

- c189261: The live brush-stroke preview is now Catmull-Rom-smoothed with the same resampler `commitBrushStroke` applies on release, so a stroke reads smooth as it's drawn instead of snapping from an angular polyline to a curve only when the pointer is lifted.
- c189261: The live brush-stroke preview now paints in the chosen palette colour and opacity instead of a hardcoded dark-grey fill, so it matches the committed stroke. The brush body colour resolution is now a single shared `brushBodyColor(style)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the preview, so the two can't drift.
- c189261: Brush strokes now render as a single closed outline polygon filled once, instead of a chain of per-segment quads plus a disc at every joint. The old approach overlapped itself, so at `opacity < 1` the joins double-blended into dark blotches; the single fill paints every pixel exactly once. Round joins/caps are preserved (arc points on convex corners, mitered concave corners clamped to stay a simple, non-self-intersecting polygon). The outline geometry is a new shared `brushOutline(points)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the live preview.
- c58054b: Brush strokes are now smoothed on commit: the sparsely-captured pointer polyline is resampled through a Catmull-Rom spline (interpolating per-point width) before it enters the scene, so a freehand line reads as a fluid curve instead of a chain of angular segments. Shares one spline resampler (`smoothStrokePoints`) with the laser trail. Tunable via `BRUSH_SMOOTH_SEGMENTS`.
- b156869: Rework image cropping to a handle interaction. The crop frame is now the image's visible box: double-click an image to enter crop mode, then drag the 8 edge/corner handles to hide pixels (opposite edge stays fixed, the source is never stretched) or drag the image body to pan the source under the frame. A faint full-image ghost is drawn behind the frame so the hidden regions stay visible. Enter/click-outside commits (one undo step), Escape cancels. Replaces the previous rubber-band "draw a rectangle over the image" model.

  New pure geometry in `tool-ops` (`computeCropHandleDrag`, `computeCropBodyPan`, `computeCommitImageCrop`, `cropFullImageLocalRect`, `cropHandleWorldPoints`, `CropHandle`) and Editor methods (`cropHandleAtWorld`, `beginImageCropHandle`, `beginImageCropBody`); `imageCropSession` now exposes the pending `{crop, position, width, height}`. The normalised `ImageCrop` data model is unchanged. Removed `cropRectFromWorldDrag`.

- b0a9f3b: The eraser cursor disc is now filled solid in the trail colour (fully opaque), with the ring on top — a clear, high-contrast aim target that matches the eraser wake.
- 1975a9b: The stroke-eraser no longer eats more of a line than the cursor ring shows. A brush point was erased when the eraser capsule reached the stroke's outer EDGE (`radius + point.width`); now it's erased when the ring covers the point's centre (`radius`), which equals the visible cursor ring at every zoom. The eraser removes exactly the centreline it passes over.
- 1975a9b: Fix the eraser cursor freezing when you pause mid-drag (button held) and then resume. The fading trail could empty during the pause, and the resumed move then had neither an active trail nor an object change, so it never triggered a repaint — the cursor stuck until release, when the whole cut applied at once. The eraser now always repaints on move (so the ring follows the pointer) and restarts the trail if it had faded.
- 22b90f9: The keyboard-shortcuts help dialog now lists every real binding. The `arrange` category (align / flip / distribute) was missing from the dialog's category order and is now shown, and keyTest-driven bindings (nudge arrows, Enter edit/create, plus flowchart create/navigate) surface their chips via a new display-only `Action.displayHotkey` field instead of rendering as "—". `displayHotkey` is never dispatched (only `hotkey`/`keyTest`/`sequence` are), which also closes a latent hole where a display matcher could fire a Ctrl-modified combo the `keyTest` deliberately excluded.
- f381039: Clicking a drawn line's (brush stroke's) link-start dot no longer clone-creates a connected element — duplicating a freehand line as a "node" made no sense. The start dots and dragging a real link from a brush stroke are unchanged; only the click-to-clone (and its hover ghost) is suppressed for brush sources. Other shapes keep the spawn-connected-node behaviour.
- bd2e26c: Make read-only (view) mode a true guard. Every mutating `Editor` method reachable from the UI (`updateStyle`, `updateTextProps`, `deleteSelected`, `duplicateSelected`, group/ungroup, align/flip/distribute, z-order, `moveSelectionBy`, `setLink`, `convertSelection`, `clear`, etc.) is now a no-op while `readOnly` is set, backstopping direct panel/hotkey calls that previously bypassed the pointer-level gate. The overlay keeps the selection outline (halo) but no longer paints resize/rotate/group handles or link endpoint grips in read-only, and the property panel / selection floating panel / mutating context-menu entries are hidden. `copy` / `copy-style` are flagged view-safe so they stay live.
- 97de2fd: Hide the link-creation overlay entirely in read-only mode. Hovering an element no longer shows connection anchor dots, and hovering a dot no longer previews a ghost element/connector — read-only never creates links, so the whole port/ghost overlay is now gated off. Editable behaviour is unchanged.
- 71a6c8b: Search navigation no longer blows a small match up to fill the whole canvas. Jumping to a match now centers it while preserving the current zoom, only zooming out when the match is too large to fit — a small element stays small and just lands in the center. Adds `Editor.revealSelection(padding)` and the pure `computeRevealBounds` helper (never zooms in, unlike `zoomToSelection`'s fit-to-fill).
- dde8279: Perf: memoize the overlay-options bag per overlay target and reuse it across frames whose overlay inputs are identity-unchanged (idle / animation / peer-update frames), rebuilding only on a real state change; GIF "play" badges are still recomputed every frame. Feed the persistent spatial index (shared with the hit-test path) to the tile compositor so large-scene tile rasterisation queries the index instead of scanning every shape per tile. Group isolation (dim) / per-element hide now correctly fall back to the full `renderScene` path when the tile cache is enabled, instead of silently dropping the dim/hide effect. Behaviour is unchanged when no tile cache is used and when no isolation/hide is active.
- 1975a9b: Two stroke-eraser fixes. (1) No more freeze on a slow or stopped cursor: the whole-scene repaint forced while erasing now happens only on frames that actually mark or cut something, not on every eraser move — a slow/idle cursor generates many pointer events per unit distance, each of which was re-rendering the entire scene. (2) Cutting a stroke no longer leaves isolated single-point dots: lone kept points (a survivor with both neighbours erased) are dropped instead of kept as stray discs.
- 1975a9b: The stroke-eraser (Shift + erase over a brush) now cuts the stroke's **geometry by arc length** instead of dropping whole vertices. A large eraser that merely grazes a line — or one passing between two far-apart points on a fast/short stroke — removes exactly the span it covers, with the fragment edges pinned to the eraser ring. This fixes the eraser ignoring sparsely-sampled or short strokes and eating a gap unrelated to the disc size.
- 1975a9b: Stroke-eraser no longer freezes on longer drags. The live cut was recomputed against the entire eraser path every frame (O(points × path length)), so the main thread saturated as the path grew — the cursor froze and the whole cut applied at once on release. Erased points are now accumulated incrementally (each move tests only the new segment, skipping already-erased points), making the per-move cost O(points) and the preview smooth throughout the drag.
- 571f13b: The laser and eraser trails now render as one filled comet shape per stroke instead of a stack of alpha-blended segments. The smoothed centreline is offset into a single ribbon whose half-width tapers from the head to a pointed tail, filled once at a single opacity that fades by the freshest point's age. This removes the overlapping round-cap "beads" at every joint that made the trail look like a chain of little lasers.
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
  - @oh-just-another/history@0.57.3

## 0.59.0

### Minor Changes

- b4b252b: Arrange operations for the selection. **Flip** mirrors the selection about its bounding-box centre — horizontal (`Shift+H`) and vertical (`Shift+V`); a single shape flips about its own centre. **Align** flushes two or more shapes to the left / right / top / bottom edge or the horizontal / vertical centre of their bounding box (`Alt+←/→/↑/↓` for the four edges; centres via the panel / menu). **Distribute** evenly spaces three or more shapes so the gaps between them are equal, on the horizontal (`Alt+H`) or vertical (`Alt+V`) axis, keeping the outermost shapes fixed. All three are available from the selection property panel and the right-click menu. New engine API: `Editor.flipSelection(axis)`, `Editor.alignSelection(edge)`, and `Editor.distributeSelection(axis)`.
- d20d50a: Copy and paste a shape's visual style. `Cmd/Ctrl+Alt+C` captures the fill / stroke / dash / opacity of the selected shape into an in-editor buffer; `Cmd/Ctrl+Alt+V` applies it to the current selection (one undo step). Also available from the right-click menu. New engine API: `Editor.copySelectionStyle()` / `Editor.pasteSelectionStyle()` and the `hasStyleClipboard` flag.
- 938e7c8: Increase / decrease the font size of the selected text with `Cmd/Ctrl+Shift+>` and `Cmd/Ctrl+Shift+<`. Each shape steps by a gentle ~10 % (at least 1 px) from its own size, so a mixed selection keeps its relative sizing, clamped to the usable range. New engine API: `Editor.adjustSelectionFontSize(direction)`.
- 9673846: Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
  shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
  at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
  on/off now lives on the scene viewport and persists with it. Scene documents
  migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
  ships gridless by default; hosts enable the grid per scene.
- 8f00738: Images (static and animated GIF) now render on the OffscreenCanvas worker backend, matching the Canvas2D / WebGL2 backends. The offscreen command stream now carries `drawImage` as an `ImageBitmap`, and static images are loaded as `ImageBitmap` so they cross the worker boundary. `insertImage` now accepts an `ImageBitmap` handle in addition to `HTMLImageElement`.
- 3152317: The single-shape selection box now turns with the element: its outline, resize
  handles and rotate grip are drawn on an oriented frame that hugs the rotated
  body instead of its axis-aligned bounding box, and handle hit-testing inverse-
  rotates the cursor into the frame so grabs stay precise. The rotate grip moved
  from above the top edge to the bottom-left corner, just outside the shape.

  Its placement is now defined per element type as an `AnchorRef` — the same
  vocabulary that positions a shape's custom connection points — via the new
  `registerRotateAnchor(type, anchor)` / `getRotateAnchor(type)` API (default:
  the bottom-left corner). Groups and multi-selections keep their axis-aligned
  box, with the grip likewise at the bottom-left corner.

  New math helper `vec2.rotateAround(point, pivot, radians)`.

- fc47ecc: Resizing a rotated shape now works correctly. Dragging a handle on a rotated
  element resizes it in the element's own (un-rotated) frame and keeps the corner
  opposite the dragged handle fixed in world — the same "the other side stays put"
  feel as for an unrotated shape. Aspect-lock (Shift) and resize-from-centre (Alt)
  are honoured in the rotated frame too. Previously a rotated shape jumped because
  the resize math assumed an axis-aligned box.
- 8fc6b69: Rotate shapes interactively. A rotate grip floats above the selection (single shape or group); dragging it turns the selection about its bounding-box centre, and holding **Shift** snaps the angle to 15° steps. The engine API `Editor.rotateSelection(angle)` drives the same maths programmatically. Element rotation was already modelled and rendered — this adds the handle, the gesture, and the hit-testing (the grip takes priority over the link-start anchors it overlaps).
- edde5d0: Add `bindEditorHotkeys(editor, options?)` — a reusable, framework-agnostic keyboard-shortcut binding driven by the action registry. Returns an unbind function, leaves text fields alone (except `Escape`), and reads `composedPath()[0]` so the editable-target check stays correct across a shadow-root boundary. Re-exported from `@oh-just-another/editor`.
- c5be6e5: Transform modifier keys during pointer gestures: hold **Alt** to resize symmetrically about the element's centre, **Shift** to lock the aspect ratio while resizing, and **Shift** to constrain a move to a single axis (Cmd/Ctrl already pulls a shape off the grid for one gesture). `<Editor>` mirrors the modifiers from keyboard events automatically; headless hosts can drive them via `Editor.setTransformModifiers({ alt, shift })`. Applies to single shapes, multi-selection / group resizes, and text.

### Patch Changes

- 0152ed6: The canvas surface now takes keyboard focus on pointer-down. The press handler
  calls `preventDefault()` (to suppress text selection / native scroll), which also
  suppressed the browser's default focus-on-click — so clicking the canvas left it
  unfocused and keyboard shortcuts (or a clean blur of a previously-focused panel
  input) only worked after tabbing to it, reading as "the first click did nothing".
  The handler now focuses the host explicitly, skipping the case where the press
  lands on an in-canvas text field so editing keeps its own focus.
- f370dba: `normalizeHref` no longer backtracks polynomially on a crafted email-like input:
  the bare-email check matches domain labels linearly. As a side effect it is
  stricter about what counts as an email — a domain with empty labels (consecutive
  dots, e.g. `a@b..c`) is treated as a URL and gets `https://`, not `mailto:`.
- da91d59: Polish the rotate grip: it now renders as a clockwise circular-arrow glyph (a
  `rotate-cw` icon) instead of a plain circle, and the connector line back to the
  shape is gone. Hovering the grip shows a `grab` cursor; the cursor switches to
  `grabbing` while a rotate gesture is in flight (overridable via the new
  `rotate` cursor role).
- 1c7cc6c: Fix inline text editing on a scaled text element: the caret and selection highlight now apply the element's `scale`, so they line up with the rendered text instead of trailing behind it. Clicking to place the caret divides the point back through `scale` to hit the right glyph.
- Updated dependencies [9673846]
- Updated dependencies [ff90a95]
- Updated dependencies [3152317]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/math@0.58.0
  - @oh-just-another/history@0.57.2

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

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/history@0.57.1
  - @oh-just-another/renderer-core@0.57.1

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/events@0.57.0
  - @oh-just-another/history@0.57.0
  - @oh-just-another/math@0.57.0
  - @oh-just-another/renderer-core@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/tokens@0.57.0
  - @oh-just-another/types@0.57.0
