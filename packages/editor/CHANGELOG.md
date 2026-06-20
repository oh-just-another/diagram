# @oh-just-another/editor

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
