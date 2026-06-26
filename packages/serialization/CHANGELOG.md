# @oh-just-another/serialization

## 0.58.0

### Minor Changes

- 9673846: Grid model rework. The viewport's `gridSize` (spacing that doubled as a hidden/
  shown toggle) is replaced by an explicit `gridEnabled` boolean; spacing is fixed
  at `DEFAULT_GRID_SPACING`. The runtime `gridVisible` flag is removed — grid
  on/off now lives on the scene viewport and persists with it. Scene documents
  migrate v1 → v2 automatically (`gridSize > 0` → `gridEnabled: true`). `<Editor>`
  ships gridless by default; hosts enable the grid per scene.

### Patch Changes

- d44348a: Mark `migrations-builtin` as having side effects so tree-shaking bundlers keep the built-in scene migrations. Previously a `sideEffects: false` package flag let aggressive bundlers drop the migration registration, so an older scene document wouldn't upgrade on load.
- Updated dependencies [9673846]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/scene@0.59.0

## 0.57.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/types@0.57.0
