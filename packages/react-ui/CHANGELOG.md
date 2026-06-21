# @oh-just-another/react-ui

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
