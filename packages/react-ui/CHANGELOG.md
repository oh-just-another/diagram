# @oh-just-another/react-ui

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
