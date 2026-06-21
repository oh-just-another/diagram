# @oh-just-another/react-ui

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
