# @oh-just-another/state

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
