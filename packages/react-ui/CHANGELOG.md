# @oh-just-another/react-ui

## 0.61.0

### Minor Changes

- ac128db: Dark theme now restyles the chrome only — the canvas always stays light. Scene colors are raw hex authored against light paper, so a dark canvas silently broke user content; `UI_SURFACE.dark.canvas` and `--du-canvas-bg` are light in every theme, and the bundled color picker always offers the light element palette. Canvas-drawn chrome (selection, handles, anchors, marquee, badges, minimap frame) is unified on the iris accent (`CANVAS_CHROME_ACCENT`, iris9 — the same accent the DOM chrome uses) instead of the ad-hoc `#1a73e8`/`#2563eb` blues. Undeclared CSS variables and stale accent fallbacks in the stylesheet now resolve to the real theme tokens, so the affected popovers follow the active theme.

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/tokens@0.58.0
  - @oh-just-another/state@0.62.0
  - @oh-just-another/renderer-core@0.60.1
  - @oh-just-another/templates@0.57.5
  - @oh-just-another/renderer-canvas@0.61.1
  - @oh-just-another/renderer-svg@0.57.5

## 0.60.0

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

- 4722388: Editable width for committed brush strokes. `style.strokeWidth` never
  affected brushes (their widths are baked per point), so the property panel's
  Thin/Medium/Thick control silently did nothing for them. A brush-only
  selection now gets a popover range slider driving the new
  `Editor.setBrushWidth(ids, width)`, which scales every baked point width by
  `newWidth / baseWidth` — the stroke keeps its exact pressure profile at the
  new thickness — and records the new `baseWidth`. Legacy strokes without a
  recorded base fall back to their widest point. One undo step.
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

- Updated dependencies [0548ab3]
- Updated dependencies [762dd8a]
- Updated dependencies [4722388]
- Updated dependencies [05707ed]
- Updated dependencies [50a2bd4]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
- Updated dependencies [acd01dc]
- Updated dependencies [da9d406]
- Updated dependencies [3c50ef1]
- Updated dependencies [f960332]
- Updated dependencies [99f9ab1]
- Updated dependencies [f9778a1]
- Updated dependencies [ea2f4e3]
  - @oh-just-another/state@0.61.0
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/renderer-core@0.60.0
  - @oh-just-another/renderer-canvas@0.61.0
  - @oh-just-another/renderer-svg@0.57.4
  - @oh-just-another/templates@0.57.4
  - @oh-just-another/versioning@0.57.4

## 0.59.0

### Minor Changes

- 1c4941e: New `<DrawingPanel>` — a floating tool-options panel that appears while the brush or eraser is active. It edits `editor.brushSettings` (via the new `useBrushSettings` hook): line colour, enclosed-fill colour, opacity and width for the brush; only the width (which doubles as the eraser radius) for the eraser. `<Diagram>` mounts it automatically top-right, hidden in zen mode; opt out with the new `hideDrawingPanel` prop. This is a functional scaffold intended for restyling.
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
- dda2e56: Add a `<Minimap>` component (react-ui) — a small overview canvas that renders the whole scene with a frame for the current viewport; click / drag to pan the main view. Add `exportMermaid(scene)` (importers) — writes a `flowchart TD` string (inverse of `importMermaid`), round-tripping node + edge structure and emitting `%% skipped: <type>` comments for non-graph elements.
- 70a08d8: Read-only chrome. `<DiagramRoot>` / `<DiagramCanvas>` accept a `readOnly` prop (applied on mount and synced on change), a new `useReadOnly()` hook exposes the flag reactively, and the `<Toolbar>` disables creation / mutation tools (draw modes, insert-image, tool-lock, undo/redo) in read-only while keeping select / hand live.
- 7f69f29: Add scene text search, a stats/dimensions overlay, and zen mode.
  - `state`: `searchScene(scene, query)` / `elementSearchText(element)` — a pure, case-insensitive substring index over text shapes, frame names, and edge labels; plus `Editor.selectLink(id)` to programmatically select a single connector.
  - `react-ui`: `<SearchOverlay>` (⌘F) finds and frames matching text with next/prev navigation; `<StatsPanel>` (⌥/) shows the selection's x/y/w/h/angle and scene totals; `<ZenModeProvider>` / `useZenMode` (⌥Z, Esc to exit) hides chrome for focused work. All three are wired into `<Editor>` from `@oh-just-another/editor`.

- cf8b735: Add styled text runs (rich text, phase 1): a `TextElement` can now carry an optional `runs` overlay — contiguous substrings each with a partial `TextStyle` (bold / italic / colour / decoration) over the element's base style. The flat `text` stays the source of truth (`runs.map(r => r.text).join("") === text`), so plain-text scenes render, serialise and round-trip byte-for-byte unchanged.
  - `scene`: `TextRun` type + `TextElement.runs?`; pure helpers `runsToText`, `normalizeRuns`, `sliceRuns`, and `applyStyleToRange(el, from, to, partial)` (splits/merges/coalesces runs, sheds the overlay when uniform).
  - `serialization`: additive optional `runs` in the text schema; legacy documents (no `runs`) round-trip unchanged.
  - `renderer-core`: the text renderer draws each visual line's style segments with per-run font + fill through the shared `RenderTarget`, so Canvas2D, WebGL2 and SVG all honour runs. Line breaking still uses the element's base metrics.
  - `state`: `Editor.applyTextStyleToRange(id, from, to, partial)` applies a style to a character range as one undo step.
  - `react-ui`: the text formatting controls (bold / italic / underline / strikethrough / colour) target the current inline-edit selection when one is active — styling just those characters — and fall back to whole-element styling otherwise.

  Full inline rich-text editing (per-run wrap metrics, caret-aware run editing) is a follow-up.

### Patch Changes

- a9558d9: Reworked flowchart keyboard model. Arrow-key bindings are reworked and disambiguated by modifier: `Arrow` nudges (unchanged); `Cmd/Ctrl+Arrow` grows a flowchart CREATE session (each press adds a pending connected sibling, previewed on the overlay, committed as one undo step when Cmd/Ctrl is released, cancelled on Escape); `Alt+Arrow` navigates to the adjacent node (graph neighbour, else spatially nearest); `Cmd/Ctrl+Shift+Arrow` aligns (moved off the old plain `Alt+Arrow`). The old `Cmd/Ctrl+Alt+Arrow` spawn binding is retired.

  New API: `editor.growFlowchart` / `commitFlowchart` / `cancelFlowchart` / `navigateFlowchart` / `flowchartPreview`, the pure `computeSpawnConnectedNodes`, and `endpointElementId` (scene). `<Diagram>` wires the keyup-commit / Escape-cancel lifecycle for you.

- 22b90f9: The keyboard-shortcuts help dialog now lists every real binding. The `arrange` category (align / flip / distribute) was missing from the dialog's category order and is now shown, and keyTest-driven bindings (nudge arrows, Enter edit/create, plus flowchart create/navigate) surface their chips via a new display-only `Action.displayHotkey` field instead of rendering as "—". `displayHotkey` is never dispatched (only `hotkey`/`keyTest`/`sequence` are), which also closes a latent hole where a display matcher could fire a Ctrl-modified combo the `keyTest` deliberately excluded.
- 34ddb22: The minimap now supports wheel zoom: scrolling over it zooms the main view into the world spot under the cursor (recentering there first, matching its click-to-pan), using the same delta→factor curve as the main canvas. The handler is a non-passive listener so it doesn't scroll the page, and doesn't interfere with click/drag panning. Tunable via `MINIMAP_WHEEL_ZOOM_SPEED` / `MINIMAP_WHEEL_ZOOM_MAX_STEP`.
- bd2e26c: Make read-only (view) mode a true guard. Every mutating `Editor` method reachable from the UI (`updateStyle`, `updateTextProps`, `deleteSelected`, `duplicateSelected`, group/ungroup, align/flip/distribute, z-order, `moveSelectionBy`, `setLink`, `convertSelection`, `clear`, etc.) is now a no-op while `readOnly` is set, backstopping direct panel/hotkey calls that previously bypassed the pointer-level gate. The overlay keeps the selection outline (halo) but no longer paints resize/rotate/group handles or link endpoint grips in read-only, and the property panel / selection floating panel / mutating context-menu entries are hidden. `copy` / `copy-style` are flagged view-safe so they stay live.
- 5d8a282: Fix the bold / italic / underline / strikethrough toggles in the text style popover never applying to an in-edit text selection. The toggle button was a component defined inside `TextDecorationControl`, so it got a fresh identity on every panel re-render; during inline text editing the panel re-renders continuously (caret blink), and a remount between `mousedown` and `mouseup` swallowed the synthesized `click`. Hoisted the toggle to a stable module-level component so the button persists across re-renders and the click fires. Colour was unaffected (it goes through a stable control).
- 71a6c8b: Fix the search bar (⌘F) jumping to a match the moment it opens, before the user types anything. The query was retained across close/open, so reopening re-ran the reveal effect against the stale query and framed the previous match. The query and active index are now reset on close, so the bar always opens empty and only navigates once the user types.
- 71a6c8b: Search navigation no longer blows a small match up to fill the whole canvas. Jumping to a match now centers it while preserving the current zoom, only zooming out when the match is too large to fit — a small element stays small and just lands in the center. Adds `Editor.revealSelection(padding)` and the pure `computeRevealBounds` helper (never zooms in, unlike `zoomToSelection`'s fit-to-fill).
- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [c58054b]
- Updated dependencies [b156869]
- Updated dependencies [0d3934e]
- Updated dependencies [0d3934e]
- Updated dependencies [b0a9f3b]
- Updated dependencies [571f13b]
- Updated dependencies [ca48e8a]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [bdc847e]
- Updated dependencies [511a22a]
- Updated dependencies [a9558d9]
- Updated dependencies [22b90f9]
- Updated dependencies [99b5bee]
- Updated dependencies [f381039]
- Updated dependencies [394d3ce]
- Updated dependencies [295f38b]
- Updated dependencies [bd2e26c]
- Updated dependencies [97de2fd]
- Updated dependencies [407f203]
- Updated dependencies [744f4b8]
- Updated dependencies [71a6c8b]
- Updated dependencies [7f69f29]
- Updated dependencies [dde8279]
- Updated dependencies [cec8f83]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [1975a9b]
- Updated dependencies [cf8b735]
- Updated dependencies [571f13b]
- Updated dependencies [f8302c3]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/state@0.60.0
  - @oh-just-another/renderer-core@0.59.0
  - @oh-just-another/renderer-canvas@0.60.0
  - @oh-just-another/renderer-svg@0.57.3
  - @oh-just-another/templates@0.57.3
  - @oh-just-another/versioning@0.57.3

## 0.58.0

### Minor Changes

- b4b252b: Arrange operations for the selection. **Flip** mirrors the selection about its bounding-box centre — horizontal (`Shift+H`) and vertical (`Shift+V`); a single shape flips about its own centre. **Align** flushes two or more shapes to the left / right / top / bottom edge or the horizontal / vertical centre of their bounding box (`Alt+←/→/↑/↓` for the four edges; centres via the panel / menu). **Distribute** evenly spaces three or more shapes so the gaps between them are equal, on the horizontal (`Alt+H`) or vertical (`Alt+V`) axis, keeping the outermost shapes fixed. All three are available from the selection property panel and the right-click menu. New engine API: `Editor.flipSelection(axis)`, `Editor.alignSelection(edge)`, and `Editor.distributeSelection(axis)`.
- 578e728: Clear the whole canvas with `Cmd/Ctrl+Delete` (or `Backspace`), from the command palette, or the right-click menu. Because it wipes every shape and isn't undoable, it always asks for confirmation first.
- d20d50a: Copy and paste a shape's visual style. `Cmd/Ctrl+Alt+C` captures the fill / stroke / dash / opacity of the selected shape into an in-editor buffer; `Cmd/Ctrl+Alt+V` applies it to the current selection (one undo step). Also available from the right-click menu. New engine API: `Editor.copySelectionStyle()` / `Editor.pasteSelectionStyle()` and the `hasStyleClipboard` flag.
- 09a096c: Add `PortalContainerProvider` / `usePortalContainer` — floating UI (tooltips, popovers, context menus, hover chips) now portals into a configurable container instead of always `document.body`. Defaults to `document.body`, so existing usage is unchanged; a host mounting the editor in a shadow root points it at a node inside the root so portaled content stays styled.

### Patch Changes

- 7217cac: The canvas surface no longer draws a focus ring on a mouse click. The surface
  takes focus on press (so keyboard shortcuts work right after clicking), which
  made it light up with an outline like a focused text input. The ring is now
  gated on `:focus-visible`, so it appears only for keyboard focus (Tab) and never
  for a pointer press.
- 60e315e: Fix the context menu (and any chrome reading the legacy `--menu-*` / `--panel` /
  `--text` aliases) ignoring an explicit app theme. The aliases forward to the
  `--du-*` theme variables via `var()`, but were declared only on `:root` — and a
  `var()` inside a custom property resolves on the element where it's declared. So
  under an OS dark preference the alias baked in `:root`'s dark value and inherited
  that frozen colour straight past a `[data-theme="light"]` override, leaving a
  dark menu on a light app. The aliases are now declared at every theme scope
  (`:root`, `[data-theme="light"]`, `[data-theme="dark"]`) so each re-resolves
  against the scoped `--du-*`.
- 60e315e: Fix floating chrome ignoring the app theme. The selection / property panel,
  popovers, tooltips and the right-click context menu portal out of the editor
  root, which also escaped the `data-theme` set there — so under an OS dark
  preference they showed a dark surface even when the app was set to light (and
  vice-versa). They now portal into a wrapper that mirrors the editor's theme, so
  they always match the app. The context menu additionally portals into that
  wrapper and its colours forward to the `--du-*` theme variables (no more
  hard-coded dark fallbacks / hover).
- Updated dependencies [b4b252b]
- Updated dependencies [1c7cc6c]
- Updated dependencies [d20d50a]
- Updated dependencies [0152ed6]
- Updated dependencies [938e7c8]
- Updated dependencies [9673846]
- Updated dependencies [f370dba]
- Updated dependencies [1c7cc6c]
- Updated dependencies [e1fd495]
- Updated dependencies [8f00738]
- Updated dependencies [1c7cc6c]
- Updated dependencies [ff90a95]
- Updated dependencies [da91d59]
- Updated dependencies [3152317]
- Updated dependencies [fc47ecc]
- Updated dependencies [8fc6b69]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
- Updated dependencies [edde5d0]
- Updated dependencies [1c7cc6c]
- Updated dependencies [c5be6e5]
  - @oh-just-another/state@0.59.0
  - @oh-just-another/renderer-canvas@0.59.0
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/math@0.58.0
  - @oh-just-another/renderer-svg@0.57.2
  - @oh-just-another/templates@0.57.2
  - @oh-just-another/versioning@0.57.2

## 0.57.3

### Patch Changes

- d1b96d9: Open the context menu solely from the editor's gesture channel
  (`editor.onLongPress`, fired by a clean right-click or touch long-press and
  scoped to the editor host) instead of a separate `contextmenu` DOM listener.
  The old listener defaulted to `window`, so a right-click anywhere on the page
  opened the diagram menu (and suppressed the native one) when the editor was
  embedded in a larger document. The redundant `<ContextMenu target>` prop is
  removed.
- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/state@0.58.0
  - @oh-just-another/history@0.57.1
  - @oh-just-another/renderer-canvas@0.58.1
  - @oh-just-another/renderer-core@0.57.1
  - @oh-just-another/renderer-svg@0.57.1
  - @oh-just-another/templates@0.57.1
  - @oh-just-another/versioning@0.57.1

## 0.57.2

### Patch Changes

- ac94614: Fix canvas flicker on container / window resize. The `ResizeObserver` callback
  now repaints synchronously (`editor.forceRender()`) instead of deferring to the
  next animation frame — `surface.resize()` clears the canvas immediately, so a
  deferred render let the cleared frame paint first, producing one blank frame per
  resize event.

## 0.57.1

### Patch Changes

- Updated dependencies [8515093]
  - @oh-just-another/renderer-canvas@0.58.0

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/history@0.57.0
  - @oh-just-another/math@0.57.0
  - @oh-just-another/renderer-canvas@0.57.0
  - @oh-just-another/renderer-core@0.57.0
  - @oh-just-another/renderer-svg@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/state@0.57.0
  - @oh-just-another/templates@0.57.0
  - @oh-just-another/tokens@0.57.0
  - @oh-just-another/types@0.57.0
  - @oh-just-another/versioning@0.57.0
