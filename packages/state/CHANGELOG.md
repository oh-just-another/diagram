# @oh-just-another/state

## 0.63.0

### Minor Changes

- f12caa8: "Back to content" jumps to the element nearest the camera instead of fitting the whole scene: new `Editor.revealNearestContent(padding = 80)` (pure `computeRevealNearest` / `nearestElementBounds` in `zoom-pan`) centres that element at the current zoom, zooming out only when it does not fit — a lone small shape is no longer blown up to full screen and a large board is no longer shrunk to a speck. `ResetToContentButton` calls it.
- 76463dd: Sticky reaction pills and the "+" add-reaction button are now painted by the canvas renderer (single visual source that tracks the shape 1:1 while dragging; pills also reach PNG / SVG exports); the DOM overlay only lays transparent click zones over the same rects (`stickyReactionLayout`) and hosts the emoji picker. Pills keep a constant on-screen size across zoom (low-zoom clamp `STICKY_REACTION_MIN_ZOOM`) and wrap onto new rows inline-block style instead of being dropped. The "+" button is hover-only chrome: shown for the sticky under the idle cursor (`Editor.hoveredStickyId` → `RenderSceneOptions.hoveredElement`), excluded from exports and read-only views. Static exports gained content switches (`RenderSceneOptions.content`, defaults in `EXPORT_CONTENT_DEFAULTS`) toggling sticky reactions / tags / author, wired to "Include in export" checkboxes in the Export… menu and to `downloadPng` / `downloadSvg` / `exportSceneToPng`.
- e202058: Drop any importable diagram file onto the canvas. `@oh-just-another/importers` now owns the formats table (`DIAGRAM_FORMATS`, `IMPORT_FORMATS`, `EXPORT_FORMATS`, `importSceneFrom`, `exportSceneAs`, `importFormatForFile`) and ships `diagramFileDropHandler` — native JSON, Excalidraw, Mermaid, JSON Canvas, Graphviz DOT and draw.io files are parsed and inserted at the drop point; the `Editor` component registers it by default (listed as "Diagrams" in the drop overlay). New `Editor.insertScene(fragment, worldPoint)` merges a scene fragment — elements, links and binary files, ids remapped, one undo step — into the current scene without replacing it.
- e66a8a5: Canvas-menu backing APIs. `Editor.preferences` / `setPreferences` (`snapObjects`, `showObjectSize`, `suggestObjectSize`, `wheelMode`) seeded via `EditorOptions.preferences`; `wheelMode` (`auto` / `mouse` / `trackpad`) routes plain wheel events to zoom or pan. `Editor.unlockAll()`, `Editor.createStickyAt(point)`. Saved start view: `Viewport.startView` (exported with the scene, applied when a document loads), `Editor.setCurrentViewAsStart()` / `goToStartView()` / `clearStartView()` / `startView`.
- 10eac46: Drop overlay: while an OS file is dragged over the canvas the editor shows a dashed frame, a drop glyph with "DROP" and a chip per accepted file kind. `FileDropHandler` gains presentation metadata — `label`, `kind` (`image` · `video` · `scene` · `text` · `data` · `file`) and `formats` — the built-in image and video handlers ship theirs; `Editor.getFileDropHandlers()` lists the registry. New `FileDropOverlay` component and `usePalettePlacement({ onFileDrag })` for hosts composing their own canvas.
- a6fe14d: Frame size presets. The frame toolbar gained a size-preset dropdown (A4, Letter, 16:9, 4:3, 1:1, Phone, Tablet, Browser — `FRAME_SIZE_PRESETS`, applied via the new `Editor.applyFramePreset`).
- e2ff8df: Image file tools. The image toolbar (single selection) gained a file-name input (renames the backing `BinaryFile`, undoable), Replace image (swaps the bytes while keeping position / size / crop), Download (original bytes with stored name / mime) and an Alt-text editor backed by the new `ImageElement.alt` field (serialized; surfaced to hosts for accessibility). New editor APIs: `renameBinaryFile`, `setImageAlt`, `replaceImageFile`.
- 5f08d13: Image shape masks: `ImageElement.mask` clips the drawn box to an ellipse, rounded rect (normalised `radius`) or arbitrary normalised polygon (presets in `IMAGE_MASK_POLYGON_PRESETS`), applied after `crop` and reaching every backend and PNG / SVG exports through the new `RenderTarget.clip`. `Editor.setImageMask(ids, mask | null)` sets/clears it (undoable); the image toolbar gained a mask picker next to Crop: aspect presets (Custom / Original / Circle / Square / Portrait / Landscape / Wide via `Editor.setImageAspectPreset` — centre-crop to the ratio, box refit, Circle adds an ellipse mask) plus shape tiles with a corner-radius slider.
- 350c6d3: Locked elements are now click-through: the pointer hit-test skips locked (and hidden) shapes and picks whatever lies beneath, instead of letting them shadow the shapes below. Locking a selection drops it. Unlocking moved to the right-click context menu ("Unlock", backed by the new `Editor.lockedElementAt` / `Editor.unlockElement`), and the selection toolbar gained a Lock button plus a "Lock" context-menu entry. `getElementAt` / `getElementAtIndexed` accept an optional `accept` predicate that skips rejected shapes and keeps scanning beneath them.
- 518a6d1: Object snapping and size assists. Move / resize gestures snap to the edges and centres of nearby shapes (alignment guides on the overlay, `snapObjects` preference), resizing can snap to a nearby shape's width / height with that shape highlighted (`suggestObjectSize`), and a `W × H` readout shows under the shape being resized (`showObjectSize`). `Editor.snapGuides` / `sizeReadout` / `sizeMatch` expose the per-tick state; `snapMoveDeltaToObjects` / `snapResizeDeltaToObjects` are the pure helpers. Guides use the reference look: a dashed alignment line overshooting both shapes, plus ticked distance segments (labelled when `showObjectSize` is on) for the gap between the shapes and for a matched width / height. `buildRoundedRectPath` is exported from `@oh-just-another/renderer-core`. Participation follows the reference: brush strokes never snap (as targets or movers), targets must sit on the 90° grid and be at least `OBJECT_SNAP_MIN_SIZE_PX` on screen, moves pair edge-to-edge / centre-to-centre only, and a multi-selection snaps by its frame edges.
- b1e08de: "Replace image" is now "Replace media": `Editor.replaceImageFile` accepts GIFs and videos in addition to static images. The shape keeps its position and width (height refits to the new aspect — videos measure via a hidden looping `<video>`, same as the drop handler); animation fields (`animationKind` / `animationData` / `metadata.animated`) are rewritten to match the new media kind, and the crop resets when the media kind changes. The toolbar control's file picker accepts `image/*,video/*`.
- e6057d1: Double-clicking the rotate grip resets the selection's rotation to 0 (each element about its own centre, one undo step). New `Editor.resetSelectionRotation()`.
- 2cd199e: Level of detail is decided per element from its size on screen, not from the zoom level. `LodOptions` is now `{ placeholderMaxScreenPx, minTextScreenPx }` (the zoom thresholds `placeholder` / `hideText` are gone): a shape whose longer side is below `placeholderMaxScreenPx` (default 8 px) on screen becomes a flat AABB fill; text — standalone and embedded shape labels, on the resolved font size — below `minTextScreenPx` (default 6 px) is skipped. A huge shape or a giant heading therefore stays fully drawn at 1 % while small ones degrade first. Helpers `screenSizeOf` / `isTextBelowLod` and the `LOD_*_SCREEN_PX` constants are exported. `MIN_ZOOM` drops from 5 % to 1 %.
- 745d7a9: Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.
- 67b98bb: "Shapes and lines" toolbar button (reference behaviour): replaces the separate rectangle / ellipse / connector buttons with one trigger opening a flyout beside the toolbar — Line / Arrow / Elbow arrow (connector presets: routing + arrowhead, applied to new links AND the live preview via `Editor.armLineTool`), Rectangle / Oval / Rhombus / Triangle (`Editor.armShapeTool` — diamond and triangle draw as inscribed polygons through the same rubber-band gesture), and "More shapes" opening the template library (the standalone library toggle is gone from the dock — "More shapes" is now its only toolbar entry point; `hideLibraryButton` removes that row). Hotkeys R / O / L keep arming the stock tools; any tool switch resets the armed variant.
- 586b7ed: Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
- d4c2c2f: Sticky notes and emoji elements. New plugin-style scene types: `sticky` (rounded card, background from `style.fill`, text via the shared embedded label with double-click editing, optional author-name strip) and `emoji` (single glyph at a given size). Both render on every backend, serialize through the custom-element schema, and are created from the shape library ("Sticky note" now produces a real sticky; new "Emoji" entry). The selection toolbar gained dedicated branches: sticky — S/M/L size presets, background color/opacity, Show-author toggle; emoji — a glyph picker. New editor APIs: `setStickySize`, `toggleStickyAuthor`, `setEmojiGlyph`.
- 24c33b3: Switch type now covers the full matrix: shape kinds (rectangle / ellipse / diamond) ↔ text ↔ sticky, any to any, bulk on multi-selection. The user text transplants between carriers (`TextElement.text` ↔ embedded `label`); converting INTO a sticky snaps the fill to the nearest colour of the new `STICKY_PALETTE` (a text's font colour never becomes the card colour); converting FROM a sticky drops its reactions / tags / author. The toolbar's type control gained Text and Sticky targets and now also appears for text and sticky selections.
- ef7388f: Text lists. Text elements gained per-paragraph attributes (`paragraphs`: bulleted / numbered kind + nesting level) that survive serialization. The layout engine indents list paragraphs, shrinks their wrap budget and keeps caret / click / selection geometry in lockstep; renderers draw derived markers ("•", auto-numbering per nesting level) on every backend. New editor APIs `setParagraphList` / `indentParagraphs` target the inline-edit selection's paragraphs while editing (whole element otherwise); typing keeps attributes aligned (Enter continues a list, deleting a line drops its attrs); Tab / Shift+Tab change nesting during editing. The text toolbar gained a two-row List dropdown (bulleted / ordered + indent ±).
- d8bf8c1: Zoom menu: clicking the zoom percentage in the bottom bar opens a view menu — Enter / Exit full screen, Hide / Show minimap (`M`), Grid › (None / Dot grid / Line grid), an Object dimensions switch, Fit to screen and zoom presets (50 % … 2000 %). `Editor.setZoom(level)` sets an absolute zoom about the viewport centre. react-ui adds the `Switch` primitive, the `useFullscreen` hook, and `MainMenu` options `ariaLabel` / `placement` / `triggerClassName` / `triggerStyle` plus `MainMenu.Item` `trailing`. The `minimap` prop now seeds the runtime-toggleable minimap.

### Patch Changes

- 98070d8: Multi-element commands treat a selected group as one unit: Arrange as grid, Stack, Align, Distribute, Flip and Rotate move / mirror / turn a group's whole subtree together (its footprint is the union of its members) instead of scattering the children or ignoring them. New `ARRANGE_LAYOUT_GAP` constant.
- 2942fb9: Clicking a link-start dot now spawns a clone with only the source's base look (kind, size, style): the embedded label and sticky reactions / tags / author no longer carry over into the new shape (the hover ghost matches).
- d0eb799: A right-click / touch long-press now routes the selection before `onLongPress` listeners fire: on empty canvas it clears the selection (the menu is the canvas menu), on an unselected element or link it selects that one, and on a selected element it keeps the current selection.
- e0e4ea9: Stop rendering after dispose. Async completions (image decode, font load) resolving after a runtime backend switch could schedule a frame onto disposed targets; on WebGL2 the lazy pipeline rebuild then recompiled shaders on the lost context and threw "Ellipse shader compile failed: null" from a promise chain. `Editor` no longer schedules renders once disposed, and `WebGL2Target` draw calls become no-ops after `dispose()`.

  Also make the "skipped a non-drawable image source" warning signal-only: the image element renderer now silently skips shapes whose handle is dead but rehydratable (`fileId` present — the transient first paint after a scene restore), and rehydration itself reports missing `Scene.files` bytes or decode failures. The renderer warning now fires only when an image really will stay blank.

- d658680: Selected shapes no longer get a translucent contour halo under the body — the selection frame + handles are the only selection chrome. `paintElementSelectionHalo` / `ElementHalo` are removed (links keep their halo).
- 3e5d81f: Floating chrome appears in place, instantly: `floatPanel` keeps a panel invisible until its first position resolves (menus, submenus, popovers no longer paint at the corner and jump), and the selection toolbar reveals with `visibility` instead of a fade. A library drag-to-place is now an element gesture — `Editor.placementId` is set from `beginPlacement` until commit / cancel — so the selection toolbar stays hidden and the minimap defers its repaint while the shape is being dragged in.
- 06a0625: Recover media dropped with a generic MIME. A file handed over with an empty `File.type` (some drag sources / extension-less downloads) was stored as `application/octet-stream`, and rehydration — which routes image-vs-video decoding by mime — sent it to the wrong decoder, so the shape reloaded blank. Persistence now infers the mime from the filename extension (`inferFileMime`), and rehydration falls back to magic-byte sniffing (`sniffBinaryFileMime` in scene: mp4/webm/ogg/png/jpeg/gif/webp/svg) for already-stored generic entries.
- 09bc11a: Resize handles are now centred exactly on the selection frame's corners and edge midpoints (`HANDLE_OUTSET` defaults to 0). Group resize / rotate chrome is no longer hit-testable or drawn when nothing in the selection is manipulable (e.g. a locked group).
- 3019bc7: Inline label editing behaves like a proper text box. The label's visible line window now scrolls to follow the caret (transient `metadata.labelScrollLines`, stripped on commit/cancel and on save), so arrowing to the end of a long label keeps the edited line on screen; selection highlight and the caret are clipped to the shape body. Double-click places a collapsed caret without arming a drag-select (no more accidental part-selection). Emoji now survive the WebGL2 backend: strings containing pictographs take the rasterised-bitmap text path instead of the monochrome MSDF atlas that cannot shape them.
- 2e2a9e7: Second review pass on shape labels and stickies. Label text is now strictly contained: when not even one line fits the padded body nothing paints outside the shape (no more tile artifacts after growing the font). Double-click places the caret at the click point instead of jumping to the (possibly clipped) text end. Cmd/Ctrl+A inside the inline editor is handled explicitly, removing a race with the selection mirror that made select-all intermittently need a second press. Labels are real rich text: styling with an active selection applies to just that range (styled runs) rather than the whole label. Stickies lost the folded corner (plain sheet with the bottom drop shadow), and emoji reactions became per-user toggles — your own click adds and then removes YOUR reaction (`toggleStickyReaction`, `reactions[].users`), so counters only grow through other collaborators.
- f46e3da: Rubber-band (lasso) selection picks whole groups: a grouped child inside the marquee selects its group root (respecting an entered group), like a click does — so Arrange / Align / Distribute and friends never scatter a group's children.
- 58c944b: The minimap's viewport frame follows a drag-pan: `Editor.endPanGesture` now notifies subscribers, so idle-gated observers that skip every notify while `panGesture` is set get the trailing change and repaint once the gesture ends.
- 7d15a0c: The Shapes and lines flyout marks the armed tool: the row matching the current shape kind or line preset is `menuitemradio` + `aria-checked` with the tonal selected style (stock `draw-edge` reads as Elbow arrow). `armShapeTool` / `armLineTool` notify subscribers once more after the variant is set, so listeners never observe the reset value.
- 59695d7: Snap the live draw preview to the grid. The rubber-band shown while drawing a rect / ellipse / frame followed the raw cursor and only the final shape snapped on release, so drawing looked like grid snapping was off. The preview now goes through the same snap helper as the final CREATE, matching how move / resize snap live during the gesture.

  Also restore the live preview for the frame tool: `isDrawingPhase` didn't include `draw-frame`, so no rubber-band appeared while drawing a frame. The frame preview renders as the real frame element (auto-numbered name included), WYSIWYG like rect / ellipse.

- 8f8846b: The selection toolbar shows the text controls for every shape type that can carry text (rectangle, ellipse, polygon, block arrow, sticky) even before it has any — they display the defaults the first text will take. `updateLabelStyle` / `updateLabelProps` / `setLabelAutoFit` seed the label on a labelable shape that has none (create-on-write); the inline editor and the style APIs share one `seedLabel`.
- 22c0f48: Caret and selection highlight now rotate with a rotated text element (or label) while editing, and canvas clicks map to the right glyph through the element rotation. `editingTextOverlay()` exposes the new `EditingTextOverlay` type with `rotation` + `pivot`.
- e15fa56: Empty text elements show a grey placeholder prompt while being written ("Type something", "Place for text", …): `TEXT_PLACEHOLDERS` (weighted list, a few jokes at low odds) and `pickTextPlaceholder(id)` (deterministic per element id, so the prompt never changes under the caret) live in `@oh-just-another/scene`; the text bounder sizes an empty element by its prompt, so the selection box wraps it and the dirty rect covers it. `TEXT_PLACEHOLDER_COLOR` is exported from renderer-core. Drawn only when `RenderSceneOptions.textPlaceholders` / `ElementRenderContext.textPlaceholders` is set — the editor sets it outside view mode; exports and headless rendering keep empty text blank.
- 22ecd4b: Switching to a drawing, ink, eraser or laser tool clears the selection (so the selection toolbar goes away with it); `select`, `hand` and `crop` keep it. Leaving crop for another tool abandons the pending crop box.
- 8163681: First review pass on the toolbar redesign. Locked elements are no longer captured by marquee selection. Embedded shape labels clip to the shape's padded body (extra lines aren't painted), the inline-edit caret sits exactly on its line, and shapes with a label show the full set of text controls (font, size, style, alignment, color, highlight) writing through the new `updateLabelStyle` / `updateLabelProps`. Replacing an image refits the shape's height to the new file's aspect ratio, image resize never mirrors on overshoot, and the crop button matches the toolbar style. Sticky notes look like paper (drop shadow, folded corner), support tags (toolbar editor + on-card pills) and emoji reactions with counters via a bottom-left reaction bar (`StickyReactions` overlay, `setStickyTags` / `addStickyReaction`). The hide-frame feature was removed.
- Updated dependencies [76463dd]
- Updated dependencies [e0e4ea9]
- Updated dependencies [e66a8a5]
- Updated dependencies [06a0625]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [350c6d3]
- Updated dependencies [518a6d1]
- Updated dependencies [3f45f83]
- Updated dependencies [3543dc7]
- Updated dependencies [2cd199e]
- Updated dependencies [745d7a9]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [8163681]
  - @oh-just-another/renderer-core@0.61.0
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/tokens@0.58.1
  - @oh-just-another/history@0.57.5

## 0.62.0

### Minor Changes

- ac128db: Dark theme now restyles the chrome only — the canvas always stays light. Scene colors are raw hex authored against light paper, so a dark canvas silently broke user content; `UI_SURFACE.dark.canvas` and `--du-canvas-bg` are light in every theme, and the bundled color picker always offers the light element palette. Canvas-drawn chrome (selection, handles, anchors, marquee, badges, minimap frame) is unified on the iris accent (`CANVAS_CHROME_ACCENT`, iris9 — the same accent the DOM chrome uses) instead of the ad-hoc `#1a73e8`/`#2563eb` blues. Undeclared CSS variables and stale accent fallbacks in the stylesheet now resolve to the real theme tokens, so the affected popovers follow the active theme.

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/tokens@0.58.0
  - @oh-just-another/renderer-core@0.60.1

## 0.61.0

### Minor Changes

- 0548ab3: Unify the active tool into a single `editor.activeTool` value object (breaking).
  - `state`: `editor.activeTool: ActiveTool` (`{ type, locked, lastActiveTool }`)
    replaces `editor.mode` and `editor.toolLocked`; `setActiveTool(type)` replaces
    `setMode`. `EditorOptions.initialMode` → `initialTool`. The typed `mode` event
    is now `tool` and fires with the `ActiveTool` object on a type switch or a
    lock flip. The action category `"mode"` is now `"tool"`. The vestigial
    `"eyedropper"` mode is removed from `Mode` — colour sampling is armed from
    the colour picker (`beginEyedropperPick`) and never was a toolbar tool.
  - `react-ui`: `useMode()` → `useActiveTool(): ActiveTool`;
    `DiagramRoot`/`DiagramCanvas` prop `initialMode` → `initialTool`.
  - `editor`: `EditorAPI.getMode/setMode` → `getActiveTool/setActiveTool`;
    `initialMode` prop → `initialTool`; re-exports `ActiveTool`.
  - `diagram` (+ vue/svelte/angular wrappers): element methods and controller
    `getMode/setMode` → `getActiveTool/setActiveTool`.

  Tool ids are unchanged (`"select"`, `"draw-rect"`, …). There are no visible
  behaviour changes — this is an API refactor establishing one source of truth
  for "which tool is active".

- 762dd8a: Brush capture pipeline upgrade: input streamlining (low-pass with commit-time catch-up), speed-simulated pressure for mouse/touch (slow = thick, fast = thin) with rate-limited pen pressure, sample decimation with a soft point cap, and end tapering. `BrushElement` gains an optional regeneration payload (`pressures`, `simulatePressure`, `baseWidth`) carried through serialization; `Editor.beginBrushStroke` accepts a `pointerType` argument to pick the pressure source. The live preview runs the same pipeline as the commit.
- 4722388: Editable width for committed brush strokes. `style.strokeWidth` never
  affected brushes (their widths are baked per point), so the property panel's
  Thin/Medium/Thick control silently did nothing for them. A brush-only
  selection now gets a popover range slider driving the new
  `Editor.setBrushWidth(ids, width)`, which scales every baked point width by
  `newWidth / baseWidth` — the stroke keeps its exact pressure profile at the
  new thickness — and records the new `baseWidth`. Legacy strokes without a
  recorded base fall back to their widest point. One undo step.
- 05707ed: Drag the caption pill along its link. With the link selected, dragging the
  pill slides the label along the drawn path (the cursor is projected back onto
  the polyline — new `projectPointToPathT` in scene); within a few pixels of
  the arc-length middle it snaps back to the default placement
  (`label.position` removed, so elbow links regain longest-segment
  auto-placement). One undo step, Escape reverts, double-click still opens the
  inline text editor, and handle dots keep pointer priority over the pill.
  Tunable snap radius: `LINK_LABEL_DRAG_SNAP_PX`.
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

- 50a2bd4: Fix: with a creation tool active (draw-edge, draw-rect, …) a press on a
  selected shape's edge no longer grabs the shape's resize/rotate handle — it
  starts the new link / element as expected. Selection chrome (resize, rotate,
  group and selected-link endpoint handles) is now pressable only under the
  select tool, and the overlay stops drawing the handles while a creation tool
  is active (outlines stay; the hand tool keeps the chrome visible).
- 20af638: Fix: the caption pill no longer fights the bend/segment handles. The
  "add waypoint" and elbow segment handles slide out from under the label pill
  along their own span (`getLinkWaypointMidpoints` is label-aware; new shared
  `getElbowSegmentHandles` keeps the drawn dot and the grab point identical), so
  a click on the pill selects the link and a double-click opens the inline
  caption editor. Visible handle dots keep pointer priority — an existing
  waypoint dot sitting inside the pill is still grabbable (dots draw above the
  pill).
- 3c50ef1: Tile cache honours per-element hide (B12, hide half). `renderViaTiles` accepts
  `hideElements`: tiles bake with the set applied, and an element entering or
  leaving the set invalidates only the tiles it touches — so the stroke-eraser
  preview and per-element visibility no longer drop very large scenes off the
  tile-cache path into a full re-render every frame. Group-isolation dim still
  takes the full path (dimming almost everything would re-rasterise most tiles
  anyway).
- f960332: Fix: mp4 shapes survive a page reload. The video file-drop handler never
  persisted the bytes into `Scene.files`, so a restored scene had only a dead
  `blob:` URL and nothing to rehydrate from (the "dead-blob-url" renderer
  warning) on every backend. The handler now stores the file (`fileId` on the
  shape), and scene rehydration grew a video branch: it rebuilds the hidden,
  muted, looping `<video>` element from the persisted bytes (shared
  `createHiddenLoopingVideo` factory with the drop handler) and resumes
  playback best-effort. Videos dropped BEFORE this fix have no stored bytes and
  still won't restore — re-add them once.
- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/renderer-core@0.60.0
  - @oh-just-another/history@0.57.4

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
