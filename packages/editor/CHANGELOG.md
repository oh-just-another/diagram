# @oh-just-another/editor

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
