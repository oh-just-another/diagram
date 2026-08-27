# @oh-just-another/renderer-core

## 0.61.0

### Minor Changes

- 76463dd: Sticky reaction pills and the "+" add-reaction button are now painted by the canvas renderer (single visual source that tracks the shape 1:1 while dragging; pills also reach PNG / SVG exports); the DOM overlay only lays transparent click zones over the same rects (`stickyReactionLayout`) and hosts the emoji picker. Pills keep a constant on-screen size across zoom (low-zoom clamp `STICKY_REACTION_MIN_ZOOM`) and wrap onto new rows inline-block style instead of being dropped. The "+" button is hover-only chrome: shown for the sticky under the idle cursor (`Editor.hoveredStickyId` → `RenderSceneOptions.hoveredElement`), excluded from exports and read-only views. Static exports gained content switches (`RenderSceneOptions.content`, defaults in `EXPORT_CONTENT_DEFAULTS`) toggling sticky reactions / tags / author, wired to "Include in export" checkboxes in the Export… menu and to `downloadPng` / `downloadSvg` / `exportSceneToPng`.
- 5f08d13: Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
- 3543dc7: `RenderTarget` gained `clip(rule?)`: intersect the clip region with the current path, scoped by `save()`/`restore()` (nested pairs intersect). Canvas2D uses native `ctx.clip`, SVG emits `<clipPath>` + a `<g clip-path>` wrapper, WebGL2 rasterises the flattened path into the stencil buffer (aliased edge, like Canvas2D clips); the offscreen recording/replay codec carries the new op.
- 2cd199e: Level of detail is decided per element from its size on screen, not from the zoom level. `LodOptions` is now `{ placeholderMaxScreenPx, minTextScreenPx }` (the zoom thresholds `placeholder` / `hideText` are gone): a shape whose longer side is below `placeholderMaxScreenPx` (default 8 px) on screen becomes a flat AABB fill; text — standalone and embedded shape labels, on the resolved font size — below `minTextScreenPx` (default 6 px) is skipped. A huge shape or a giant heading therefore stays fully drawn at 1 % while small ones degrade first. Helpers `screenSizeOf` / `isTextBelowLod` and the `LOD_*_SCREEN_PX` constants are exported. `MIN_ZOOM` drops from 5 % to 1 %.
- 745d7a9: Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.
- 586b7ed: Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
- d4c2c2f: Sticky notes and emoji elements. New plugin-style scene types: `sticky` (rounded card, background from `style.fill`, text via the shared embedded label with double-click editing, optional author-name strip) and `emoji` (single glyph at a given size). Both render on every backend, serialize through the custom-element schema, and are created from the shape library ("Sticky note" now produces a real sticky; new "Emoji" entry). The selection toolbar gained dedicated branches: sticky — S/M/L size presets, background color/opacity, Show-author toggle; emoji — a glyph picker. New editor APIs: `setStickySize`, `toggleStickyAuthor`, `setEmojiGlyph`.
- 993b46a: Text highlight color. New `TextStyle.highlight` paints a marker-style line-height stripe behind the glyphs on every backend, works per styled run (inline-edit range selection highlights just those characters) and round-trips through serialization. The text toolbar gained a Highlight control next to the text color.
- ef7388f: Text lists. Text elements gained per-paragraph attributes (`paragraphs`: bulleted / numbered kind + nesting level) that survive serialization. The layout engine indents list paragraphs, shrinks their wrap budget and keeps caret / click / selection geometry in lockstep; renderers draw derived markers ("•", auto-numbering per nesting level) on every backend. New editor APIs `setParagraphList` / `indentParagraphs` target the inline-edit selection's paragraphs while editing (whole element otherwise); typing keeps attributes aligned (Enter continues a list, deleting a line drops its attrs); Tab / Shift+Tab change nesting during editing. The text toolbar gained a two-row List dropdown (bulleted / ordered + indent ±).
- e15fa56: Empty text elements show a grey placeholder prompt while being written ("Type something", "Place for text", …): `TEXT_PLACEHOLDERS` (weighted list, a few jokes at low odds) and `pickTextPlaceholder(id)` (deterministic per element id, so the prompt never changes under the caret) live in `@oh-just-another/scene`; the text bounder sizes an empty element by its prompt, so the selection box wraps it and the dirty rect covers it. `TEXT_PLACEHOLDER_COLOR` is exported from renderer-core. Drawn only when `RenderSceneOptions.textPlaceholders` / `ElementRenderContext.textPlaceholders` is set — the editor sets it outside view mode; exports and headless rendering keep empty text blank.

### Patch Changes

- e0e4ea9: Stop rendering after dispose. Async completions (image decode, font load) resolving after a runtime backend switch could schedule a frame onto disposed targets; on WebGL2 the lazy pipeline rebuild then recompiled shaders on the lost context and threw "Ellipse shader compile failed: null" from a promise chain. `Editor` no longer schedules renders once disposed, and `WebGL2Target` draw calls become no-ops after `dispose()`.

  Also make the "skipped a non-drawable image source" warning signal-only: the image element renderer now silently skips shapes whose handle is dead but rehydratable (`fileId` present — the transient first paint after a scene restore), and rehydration itself reports missing `Scene.files` bytes or decode failures. The renderer warning now fires only when an image really will stay blank.

- 3019bc7: Inline label editing behaves like a proper text box. The label's visible line window now scrolls to follow the caret (transient `metadata.labelScrollLines`, stripped on commit/cancel and on save), so arrowing to the end of a long label keeps the edited line on screen; selection highlight and the caret are clipped to the shape body. Double-click places a collapsed caret without arming a drag-select (no more accidental part-selection). Emoji now survive the WebGL2 backend: strings containing pictographs take the rasterised-bitmap text path instead of the monochrome MSDF atlas that cannot shape them.
- 2e2a9e7: Second review pass on shape labels and stickies. Label text is now strictly contained: when not even one line fits the padded body nothing paints outside the shape (no more tile artifacts after growing the font). Double-click places the caret at the click point instead of jumping to the (possibly clipped) text end. Cmd/Ctrl+A inside the inline editor is handled explicitly, removing a race with the selection mirror that made select-all intermittently need a second press. Labels are real rich text: styling with an active selection applies to just that range (styled runs) rather than the whole label. Stickies lost the folded corner (plain sheet with the bottom drop shadow), and emoji reactions became per-user toggles — your own click adds and then removes YOUR reaction (`toggleStickyReaction`, `reactions[].users`), so counters only grow through other collaborators.
- 518a6d1: Object snapping and size assists. Move / resize gestures snap to the edges and centres of nearby shapes (alignment guides on the overlay, `snapObjects` preference), resizing can snap to a nearby shape's width / height with that shape highlighted (`suggestObjectSize`), and a `W × H` readout shows under the shape being resized (`showObjectSize`). `Editor.snapGuides` / `sizeReadout` / `sizeMatch` expose the per-tick state; `snapMoveDeltaToObjects` / `snapResizeDeltaToObjects` are the pure helpers. Guides use the reference look: a dashed alignment line overshooting both shapes, plus ticked distance segments (labelled when `showObjectSize` is on) for the gap between the shapes and for a matched width / height. `buildRoundedRectPath` is exported from `@oh-just-another/renderer-core`. Participation follows the reference: brush strokes never snap (as targets or movers), targets must sit on the 90° grid and be at least `OBJECT_SNAP_MIN_SIZE_PX` on screen, moves pair edge-to-edge / centre-to-centre only, and a multi-selection snaps by its frame edges.
- 8163681: First review pass on the toolbar redesign. Locked elements are no longer captured by marquee selection. Embedded shape labels clip to the shape's padded body (extra lines aren't painted), the inline-edit caret sits exactly on its line, and shapes with a label show the full set of text controls (font, size, style, alignment, color, highlight) writing through the new `updateLabelStyle` / `updateLabelProps`. Replacing an image refits the shape's height to the new file's aspect ratio, image resize never mirrors on overshoot, and the crop button matches the toolbar style. Sticky notes look like paper (drop shadow, folded corner), support tags (toolbar editor + on-card pills) and emoji reactions with counters via a bottom-left reaction bar (`StickyReactions` overlay, `setStickyTags` / `addStickyReaction`). The hide-frame feature was removed.
- Updated dependencies [e66a8a5]
- Updated dependencies [06a0625]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [2e2a9e7]
- Updated dependencies [350c6d3]
- Updated dependencies [3f45f83]
- Updated dependencies [745d7a9]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [8163681]
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/tokens@0.58.1

## 0.60.1

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/tokens@0.58.0

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
