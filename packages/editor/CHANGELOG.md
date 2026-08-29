# @oh-just-another/editor

## 0.62.3

### Patch Changes

- Updated dependencies [8f0ec5d]
- Updated dependencies [6924e11]
- Updated dependencies [fc09e7c]
  - @oh-just-another/renderer-core@0.61.1
  - @oh-just-another/state@0.66.0
  - @oh-just-another/renderer-canvas@0.62.1
  - @oh-just-another/raster-wasm@0.57.7
  - @oh-just-another/react-ui@0.63.2
  - @oh-just-another/renderer-svg@0.58.1
  - @oh-just-another/templates@0.58.1
  - @oh-just-another/text-wasm@0.57.7
  - @oh-just-another/importers@0.60.3

## 0.62.2

### Patch Changes

- Updated dependencies [e28d529]
  - @oh-just-another/state@0.65.0
  - @oh-just-another/importers@0.60.2
  - @oh-just-another/react-ui@0.63.1

## 0.62.1

### Patch Changes

- Updated dependencies [c738f81]
- Updated dependencies [c738f81]
  - @oh-just-another/react-ui@0.63.0
  - @oh-just-another/state@0.64.0
  - @oh-just-another/importers@0.60.1

## 0.62.0

### Minor Changes

- b8f70d6: Brand cell of the top bar shows the product logo. New `logo` prop on `Diagram` (default: the built-in `BrandLogo`, also exported; `null` drops the cell). The light / dark artwork lives in `packages/editor/assets/logo.svg` and `logo-dark.svg`, inlined by `scripts/gen-logo.mjs` (`pnpm gen:logo`, part of `build`); CSS (`.du-brand-logo-light/-dark`, `--du-brand-h`) shows the variant matching the theme. The `⌗` glyph and the playground's "Diagram" heading are gone.
- c989c1c: Canvas context menu (right-click on empty canvas): Paste, Unlock all, Add text / Add sticky note / Add comment, Set start view / Set current view as start, check rows for Show grid, Snap to grid, Snap objects, Show object size, Suggest object size, a "Mouse or trackpad" radio submenu, and Show all. `ContextMenuItem` actions gain `checked` (rendered as a leading check mark, `role="menuitemcheckbox"`). `<Diagram persistPreferences>` keeps `EditorPreferences` in `localStorage` (`bindPreferencesPersistence` / `loadPreferences` exported for hand-composed shells).
- 76463dd: Sticky reaction pills and the "+" add-reaction button are now painted by the canvas renderer (single visual source that tracks the shape 1:1 while dragging; pills also reach PNG / SVG exports); the DOM overlay only lays transparent click zones over the same rects (`stickyReactionLayout`) and hosts the emoji picker. Pills keep a constant on-screen size across zoom (low-zoom clamp `STICKY_REACTION_MIN_ZOOM`) and wrap onto new rows inline-block style instead of being dropped. The "+" button is hover-only chrome: shown for the sticky under the idle cursor (`Editor.hoveredStickyId` → `RenderSceneOptions.hoveredElement`), excluded from exports and read-only views. Static exports gained content switches (`RenderSceneOptions.content`, defaults in `EXPORT_CONTENT_DEFAULTS`) toggling sticky reactions / tags / author, wired to "Include in export" checkboxes in the Export… menu and to `downloadPng` / `downloadSvg` / `exportSceneToPng`.
- 66481cd: Context menu rows "Copy as PNG", "Copy as SVG" and "Copy as text" copy the selection to the clipboard (transparent retina PNG; fitted SVG markup as text; text / labels one per line). New editor exports `copySelectionAsPng` / `copySelectionAsSvg` / `copySelectionAsText`, `selectionText`, `sceneToSvgMarkup`, `subsetScene`, `sceneBounds`, `fitViewportTo`, registered as `copy-as-png` / `copy-as-svg` / `copy-as-text` actions. The react-ui context menu shows the rows when the host registered those actions.
- e202058: Drop any importable diagram file onto the canvas. `@oh-just-another/importers` now owns the formats table (`DIAGRAM_FORMATS`, `IMPORT_FORMATS`, `EXPORT_FORMATS`, `importSceneFrom`, `exportSceneAs`, `importFormatForFile`) and ships `diagramFileDropHandler` — native JSON, Excalidraw, Mermaid, JSON Canvas, Graphviz DOT and draw.io files are parsed and inserted at the drop point; the `Editor` component registers it by default (listed as "Diagrams" in the drop overlay). New `Editor.insertScene(fragment, worldPoint)` merges a scene fragment — elements, links and binary files, ids remapped, one undo step — into the current scene without replacing it.
- c25cb4e: `Diagram` gains `renderExportMenuExtras` — extra rows inside Board › Export after the built-in PNG / SVG entries, so hosts add their export formats to the same submenu instead of a second "Export as".
- 7318742: The main menu is compact and nested: Board › (Open, Save as JSON, Copy as image, Export ›, Start view, Set current view as start, Reset canvas), Edit › (Undo/Redo, Cut/Copy/Paste, Select all, Delete, Commands ⌘K, Find ⌘F), View › (Grid › None / Line grid / Dot grid + Snap to grid switch, Object dimensions, Minimap, Theme ›, Enter full screen), Preferences › (Mouse or trackpad ›, Snap objects, Suggest object size), with Hotkeys and GitHub as top-level rows. Zoom entries moved out (the zoom menu has them); segmented toggles became radio rows and switches. New `<Diagram renderBoardMenuExtras>` slot renders host rows inside Board › (the playground's Import / Export formats live there now).
- d8bf8c1: Zoom menu: clicking the zoom percentage in the bottom bar opens a view menu — Enter / Exit full screen, Hide / Show minimap (`M`), Grid › (None / Dot grid / Line grid), an Object dimensions switch, Fit to screen and zoom presets (50 % … 2000 %). `Editor.setZoom(level)` sets an absolute zoom about the viewport centre. react-ui adds the `Switch` primitive, the `useFullscreen` hook, and `MainMenu` options `ariaLabel` / `placement` / `triggerClassName` / `triggerStyle` plus `MainMenu.Item` `trailing`. The `minimap` prop now seeds the runtime-toggleable minimap.

### Patch Changes

- bb08cc6: Every chrome control is now 40px — grouped toolbar buttons, the selection floating panel, panel headers, dialog and sidebar buttons — matching the menu row height (`--du-button-size-sm` is an alias of `--du-control-size`). Glyphs scale with them through shared icon presets exported from `@oh-just-another/react-ui`: `CONTROL_ICON` (20px, inside controls), `ROW_ICON` (16px, menu / list rows), `MARK_ICON` (14px checks / chevrons), `BADGE_ICON` (12px chips). Inputs grow to 36px, small inline controls to 28px, colour swatches to 32px, help-dialog key pills to 24px.
- 2105693: Crisp glyphs: icon presets moved to pixel-aligned lucide sizes — `CONTROL_ICON` 24 / 2 (the native grid, 2-px strokes), `ROW_ICON` and `MARK_ICON` 16 / 1.5 (1-px strokes), `BADGE_ICON` 12 / 2; `--du-icon-size` is 24. The vertical tool dock now sits on a whole-pixel offset (`top: round(50%, 1px); translate: 0 round(-50%, 1px)` on the new `.du-dock` wrapper) instead of a `translateY(-50%)` that landed on half pixels whenever the free space was odd and blurred every glyph in the dock.
- 8233dd1: Design tokens for the static chrome. The `:root` block of `styles.css` is now one documented token sheet grouped by type — colour (surfaces, text, accent, inverse), elevation, radius, spacing scale, control sizing, typography, layout (`--du-bar-height`, `--du-bar-clear`, `--du-side-panel-w`), menus, popovers, modals, toasts, tooltip, z-index scale and motion. Every hard-coded value in the mode toolbars, zoom controls, minimap, top bars, help / merge dialogs, `Modal`, `Toast`, `Tooltip`, `BottomSheet` and the tool-options dock now reads a token; their inline styles moved to classes (`du-modal-title/-subtitle/-close/-footer`, `du-toast*`, `du-sheet-*`, `du-minimap-dock`, `du-tool-options-dock`, `du-zoom-*`, `du-toolbar-divider`, `du-brand`). Removed the unused `TOOLBAR_SEPARATOR_HEIGHT` export — the separator height is `--du-icon-size`.
- 1b80b66: `<Diagram>`'s chrome shell no longer re-renders on every scene change: the whole-scene subscription (menus, toolbars, dialogs re-rendered on every frame of a drag, making element moves sluggish) is narrowed to the Grid / Snap toggle values only.
- 10eac46: Drop overlay: while an OS file is dragged over the canvas the editor shows a dashed frame, a drop glyph with "DROP" and a chip per accepted file kind. `FileDropHandler` gains presentation metadata — `label`, `kind` (`image` · `video` · `scene` · `text` · `data` · `file`) and `formats` — the built-in image and video handlers ship theirs; `Editor.getFileDropHandlers()` lists the registry. New `FileDropOverlay` component and `usePalettePlacement({ onFileDrag })` for hosts composing their own canvas.
- 0ed2288: Embed binary files in scene file exports. `serializeScene` / `stringifyScene` accept `{ includeFiles: true }` to inline `Scene.files` (base64) into the document, and `parseScene` / `deserializeScene` restore them — so a saved scene with images / GIFs / videos is self-contained and renders on any machine. The editor's Save action (Cmd+S) now embeds files; autosave documents still omit them (bytes stay in the host's binary store).
- 1a9bf66: Elements carrying a safe `href` now show a persistent link badge at their top-right corner (new `LinkBadges` overlay, mounted by the editor shell). Clicking the badge opens the link; the hover popup and Cmd/Ctrl-click behaviour are unchanged. Badges track pan/zoom and also render in read-only mode.
- f7cc2c0: `MainMenu.Item` gains `checked` — the row renders as `menuitemcheckbox` with a decorative trailing switch instead of nesting a `Switch` button inside the row button (invalid HTML, React warned on every open). `Switch` gains `presentational` for the same purpose.
- 64e97b9: Distance tokens for the chrome: `--du-dock-inset` (14px, canvas edge → vertical tool dock), `--du-flyout-gap` (14px, a bar → the menu / flyout it opens: Shapes and lines, main and zoom menus) and `--du-submenu-gap` (10px, parent menu column → nested menu). Nested menus no longer overlap their parent column after the tighter menu inset; the context-menu submenu reads its alignment from the live panel instead of a hard-coded 7px; the dock clears an open library by its real inset + width instead of a stale 12px constant.
- b90174d: One spacing system for every menu surface. New `--du-menu-*` tokens (panel padding 6, min-width 220, row height 36 = button size, row padding 10, icon / check gutter 20, gap 8, font 13 / shortcut 11, separator 6) and `--du-modal-*` tokens (16×20 padding, radius 14, gap 12), with shared `.du-menu-panel` / `.du-menu-row` / `.du-menu-gutter` / `.du-menu-shortcut` / `.du-menu-sep` / `.du-menu-group-title` / `.du-modal-header` / `.du-modal-body` classes. The context menu, `MainMenu` (main and zoom menus), the Shapes and lines flyout, popover list rows and the Help dialog all use them, so rows, gutters and separators line up across the UI. The zoom-percentage trigger is flat like its neighbours.
- 4df12dd: Style tokens aligned with the reference: radii 4 (items) / 8 (toolbars, dropdowns) / 12 (panels, dialogs); one elevation shadow for every floating surface; typography tokens `--du-font-size` 14 / `--du-font-size-sm` 12 / `--du-line-height` 20 used throughout; 40-px tool buttons with 4-px item radius inside 8-px groups; 16-px screen inset; menu rows 44 px high with 16-px padding, 24-px icon gutter and 240-px panels. The minimap container uses the same tokens.
- 67b98bb: "Shapes and lines" toolbar button (reference behaviour): replaces the separate rectangle / ellipse / connector buttons with one trigger opening a flyout beside the toolbar — Line / Arrow / Elbow arrow (connector presets: routing + arrowhead, applied to new links AND the live preview via `Editor.armLineTool`), Rectangle / Oval / Rhombus / Triangle (`Editor.armShapeTool` — diamond and triangle draw as inscribed polygons through the same rubber-band gesture), and "More shapes" opening the template library (the standalone library toggle is gone from the dock — "More shapes" is now its only toolbar entry point; `hideLibraryButton` removes that row). Hotkeys R / O / L keep arming the stock tools; any tool switch resets the armed variant.
- 321c4a3: Toolbar action buttons and the zoom controls no longer re-render on every editor change: action buttons re-render only when their pressed/disabled state actually flips, and the zoom pill subscribes to the zoom value alone — a whole-editor subscription re-rendered them on every frame of an element drag.
- 8163681: First review pass on the toolbar redesign. Locked elements are no longer captured by marquee selection. Embedded shape labels clip to the shape's padded body (extra lines aren't painted), the inline-edit caret sits exactly on its line, and shapes with a label show the full set of text controls (font, size, style, alignment, color, highlight) writing through the new `updateLabelStyle` / `updateLabelProps`. Replacing an image refits the shape's height to the new file's aspect ratio, image resize never mirrors on overshoot, and the crop button matches the toolbar style. Sticky notes look like paper (drop shadow, folded corner), support tags (toolbar editor + on-card pills) and emoji reactions with counters via a bottom-left reaction bar (`StickyReactions` overlay, `setStickyTags` / `addStickyReaction`). The hide-frame feature was removed.
- Updated dependencies [98070d8]
- Updated dependencies [f12caa8]
- Updated dependencies [b8f70d6]
- Updated dependencies [c989c1c]
- Updated dependencies [a1ea1b2]
- Updated dependencies [76463dd]
- Updated dependencies [bb08cc6]
- Updated dependencies [c26b729]
- Updated dependencies [2942fb9]
- Updated dependencies [ef7a237]
- Updated dependencies [9e12fca]
- Updated dependencies [ab5af20]
- Updated dependencies [2e9c5c5]
- Updated dependencies [d0eb799]
- Updated dependencies [66481cd]
- Updated dependencies [2105693]
- Updated dependencies [8233dd1]
- Updated dependencies [e202058]
- Updated dependencies [e0e4ea9]
- Updated dependencies [d658680]
- Updated dependencies [e66a8a5]
- Updated dependencies [10eac46]
- Updated dependencies [0ed2288]
- Updated dependencies [3e5d81f]
- Updated dependencies [a6fe14d]
- Updated dependencies [06a0625]
- Updated dependencies [3ff16ab]
- Updated dependencies [09bc11a]
- Updated dependencies [b965236]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [f46e3da]
- Updated dependencies [ab44aa8]
- Updated dependencies [da647fc]
- Updated dependencies [1a9bf66]
- Updated dependencies [350c6d3]
- Updated dependencies [9b3bc01]
- Updated dependencies [129c8b5]
- Updated dependencies [f7cc2c0]
- Updated dependencies [64e97b9]
- Updated dependencies [0a4264b]
- Updated dependencies [b90174d]
- Updated dependencies [58c944b]
- Updated dependencies [6ca5ec9]
- Updated dependencies [5ffb5cc]
- Updated dependencies [518a6d1]
- Updated dependencies [3086875]
- Updated dependencies [3f45f83]
- Updated dependencies [26abd0c]
- Updated dependencies [3b994bc]
- Updated dependencies [1bbb5f9]
- Updated dependencies [4df12dd]
- Updated dependencies [3543dc7]
- Updated dependencies [b1e08de]
- Updated dependencies [e6057d1]
- Updated dependencies [8947a84]
- Updated dependencies [2cd199e]
- Updated dependencies [1abaca1]
- Updated dependencies [68f1e02]
- Updated dependencies [745d7a9]
- Updated dependencies [67b98bb]
- Updated dependencies [7d15a0c]
- Updated dependencies [59695d7]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [24c33b3]
- Updated dependencies [0767227]
- Updated dependencies [8f8846b]
- Updated dependencies [22c0f48]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [ea5c6a3]
- Updated dependencies [22ecd4b]
- Updated dependencies [c22fb63]
- Updated dependencies [1b806ed]
- Updated dependencies [31ace39]
- Updated dependencies [321c4a3]
- Updated dependencies [8163681]
- Updated dependencies [97daf50]
- Updated dependencies [4c2b27b]
- Updated dependencies [d8bf8c1]
  - @oh-just-another/state@0.63.0
  - @oh-just-another/react-ui@0.62.0
  - @oh-just-another/renderer-core@0.61.0
  - @oh-just-another/importers@0.60.0
  - @oh-just-another/renderer-canvas@0.62.0
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/serialization@0.61.0
  - @oh-just-another/renderer-svg@0.58.0
  - @oh-just-another/templates@0.58.0
  - @oh-just-another/raster-wasm@0.57.6
  - @oh-just-another/text-wasm@0.57.6

## 0.61.1

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/react-ui@0.61.0
  - @oh-just-another/state@0.62.0
  - @oh-just-another/renderer-core@0.60.1
  - @oh-just-another/templates@0.57.5
  - @oh-just-another/raster-wasm@0.57.5
  - @oh-just-another/renderer-canvas@0.61.1
  - @oh-just-another/renderer-svg@0.57.5
  - @oh-just-another/text-wasm@0.57.5

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
  - @oh-just-another/react-ui@0.60.0
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/serialization@0.60.0
  - @oh-just-another/renderer-core@0.60.0
  - @oh-just-another/renderer-canvas@0.61.0
  - @oh-just-another/raster-wasm@0.57.4
  - @oh-just-another/renderer-svg@0.57.4
  - @oh-just-another/templates@0.57.4
  - @oh-just-another/text-wasm@0.57.4

## 0.60.0

### Minor Changes

- 179bad8: Add a built-in `minimap` prop to `<Diagram>`/`<Editor>`. When set, the minimap docks bottom-right above the zoom controls and is hidden in zen mode along with the rest of the chrome (it reads the editor from context). Previously hosts had to mount `<Minimap>` themselves, which sat outside the zen-gated chrome and overlapped the zoom pill. Off by default.
- 1c4941e: New `<DrawingPanel>` — a floating tool-options panel that appears while the brush or eraser is active. It edits `editor.brushSettings` (via the new `useBrushSettings` hook): line colour, enclosed-fill colour, opacity and width for the brush; only the width (which doubles as the eraser radius) for the eraser. `<Diagram>` mounts it automatically top-right, hidden in zen mode; opt out with the new `hideDrawingPanel` prop. This is a functional scaffold intended for restyling.
- 6d184ad: Add `defineShape()` — one-call facade for registering a custom shape type (bounder, renderer, optional interactive hit-tester and rotate anchor). Re-export `registerInteractiveHitTester` / `registerRotateAnchor` and plugin types (`ElementBase`, `ElementBounder`, `ElementRenderer`, `RenderTarget`, `InteractiveHitTester`, `AnchorRef`).
- 2fbc079: Add editor file operations as registry actions + hotkeys: Save as JSON (`⌘S`), Open… (`⌘O`), Export PNG (`⌘⇧E`) and Copy as image to the system clipboard (`⇧⌥C`, PNG blob via the async Clipboard API). Exposed via `registerFileActions()` / `fileActions` and the `downloadScene` / `openSceneFile` / `downloadPng` / `downloadSvg` / `copySceneAsImage` helpers (`setFileActionNotifier` routes errors to a host toast). `<Editor>` registers them on mount and adds a "Copy as image" File-menu item with shortcut hints. All built on the existing serialization + exporter pipelines.
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

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [c58054b]
- Updated dependencies [b156869]
- Updated dependencies [0d3934e]
- Updated dependencies [1c4941e]
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
- Updated dependencies [dda2e56]
- Updated dependencies [34ddb22]
- Updated dependencies [f381039]
- Updated dependencies [394d3ce]
- Updated dependencies [295f38b]
- Updated dependencies [70a08d8]
- Updated dependencies [bd2e26c]
- Updated dependencies [97de2fd]
- Updated dependencies [407f203]
- Updated dependencies [744f4b8]
- Updated dependencies [5d8a282]
- Updated dependencies [71a6c8b]
- Updated dependencies [71a6c8b]
- Updated dependencies [7f69f29]
- Updated dependencies [672b557]
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
  - @oh-just-another/serialization@0.59.0
  - @oh-just-another/state@0.60.0
  - @oh-just-another/renderer-core@0.59.0
  - @oh-just-another/react-ui@0.59.0
  - @oh-just-another/renderer-canvas@0.60.0
  - @oh-just-another/renderer-svg@0.57.3
  - @oh-just-another/raster-wasm@0.57.3
  - @oh-just-another/templates@0.57.3
  - @oh-just-another/text-wasm@0.57.3

## 0.59.0

### Minor Changes

- 1c7cc6c: New package `@oh-just-another/fonts` bundles the editor's fonts (Roboto, PT Serif, Roboto Mono) as web fonts, and the Canvas2D / offscreen backends now draw with them via `resolveBundledFamily`. Text is consistent across renderers instead of WebGL2 using the embedded font while Canvas2D fell back to a system font. `<Editor>` loads the fonts on mount and redraws once they're ready.
- 86c5b61: `<Editor>` accepts granular scene-settings props — `grid` (`{ enabled, style }`)
  and `snap` — merged over the defaults. A persisted `initialScene` still wins over
  them (user data over host config).
- 34fc660: `<Editor>` now registers a built-in GIF animation adapter by default, so dropped / pasted animated GIFs play out of the box (previously the host had to wire up a decoder). The `gifuct-js` decoder is lazy-loaded on first GIF decode, so apps that never show a GIF don't pay for it. A host `animationAdapters` entry with `kind: "gif"` still overrides the built-in. Also exports `installGifAnimationAdapter` for explicit / component-free use.
- 9673846: Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
  shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
  at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
  on/off now lives on the scene viewport and persists with it. Scene documents
  migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
  ships gridless by default; hosts enable the grid per scene.
- edde5d0: Add `bindEditorHotkeys(editor, options?)` — a reusable, framework-agnostic keyboard-shortcut binding driven by the action registry. Returns an unbind function, leaves text fields alone (except `Escape`), and reads `composedPath()[0]` so the editable-target check stays correct across a shadow-root boundary. Re-exported from `@oh-just-another/editor`.
- c5be6e5: Transform modifier keys during pointer gestures: hold **Alt** to resize symmetrically about the element's centre, **Shift** to lock the aspect ratio while resizing, and **Shift** to constrain a move to a single axis (Cmd/Ctrl already pulls a shape off the grid for one gesture). `<Editor>` mirrors the modifiers from keyboard events automatically; headless hosts can drive them via `Editor.setTransformModifiers({ alt, shift })`. Applies to single shapes, multi-selection / group resizes, and text.

### Patch Changes

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
- Updated dependencies [7217cac]
- Updated dependencies [578e728]
- Updated dependencies [d20d50a]
- Updated dependencies [0152ed6]
- Updated dependencies [938e7c8]
- Updated dependencies [9673846]
- Updated dependencies [60e315e]
- Updated dependencies [f370dba]
- Updated dependencies [1c7cc6c]
- Updated dependencies [e1fd495]
- Updated dependencies [8f00738]
- Updated dependencies [09a096c]
- Updated dependencies [1c7cc6c]
- Updated dependencies [ff90a95]
- Updated dependencies [da91d59]
- Updated dependencies [3152317]
- Updated dependencies [fc47ecc]
- Updated dependencies [8fc6b69]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
- Updated dependencies [d44348a]
- Updated dependencies [edde5d0]
- Updated dependencies [1c7cc6c]
- Updated dependencies [60e315e]
- Updated dependencies [c5be6e5]
  - @oh-just-another/state@0.59.0
  - @oh-just-another/react-ui@0.58.0
  - @oh-just-another/fonts@0.1.0
  - @oh-just-another/renderer-canvas@0.59.0
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/serialization@0.58.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/raster-wasm@0.57.2
  - @oh-just-another/renderer-svg@0.57.2
  - @oh-just-another/templates@0.57.2
  - @oh-just-another/text-wasm@0.57.2

## 0.58.2

### Patch Changes

- Updated dependencies [d1b96d9]
- Updated dependencies [d1b96d9]
  - @oh-just-another/react-ui@0.57.3
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/state@0.58.0
  - @oh-just-another/raster-wasm@0.57.1
  - @oh-just-another/renderer-canvas@0.58.1
  - @oh-just-another/renderer-core@0.57.1
  - @oh-just-another/renderer-svg@0.57.1
  - @oh-just-another/serialization@0.57.1
  - @oh-just-another/templates@0.57.1
  - @oh-just-another/text-wasm@0.57.1

## 0.58.1

### Patch Changes

- Updated dependencies [ac94614]
  - @oh-just-another/react-ui@0.57.2

## 0.58.0

### Minor Changes

- 8515093: Introduce `@oh-just-another/editor` — a drop-in `<Editor>` React component that
  auto-detects renderer / WASM / worker capabilities and exposes a programmatic
  editor handle via `ref`. The editor was extracted out of the demo app so it can
  be consumed as a standalone package (`Diagram` is kept as a back-compat alias).

  `@oh-just-another/renderer-canvas` now exports `createRenderWorker()`, so the
  offscreen render worker is constructed through a normal package import instead
  of a cross-package relative path — correct for both source and published builds.

### Patch Changes

- Updated dependencies [8515093]
  - @oh-just-another/renderer-canvas@0.58.0
  - @oh-just-another/react-ui@0.57.1
