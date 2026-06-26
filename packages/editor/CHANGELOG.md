# @oh-just-another/editor

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
