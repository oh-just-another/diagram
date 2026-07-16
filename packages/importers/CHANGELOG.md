# @oh-just-another/importers

## 0.59.2

### Patch Changes

- Updated dependencies [ac128db]
  - @oh-just-another/tokens@0.58.0

## 0.59.1

### Patch Changes

- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/scene@0.61.0

## 0.59.0

### Minor Changes

- 1d6c289: Add `.excalidraw` import (`importExcalidraw`) and export (`exportExcalidraw`, round-trippable) and JSON Canvas import (`importJsonCanvas`). Shapes, text, freedraw strokes, images, frames, groups and connectors are mapped to the corresponding scene elements; unknown element types are skipped instead of failing.
- dda2e56: Add a `<Minimap>` component (react-ui) — a small overview canvas that renders the whole scene with a frame for the current viewport; click / drag to pan the main view. Add `exportMermaid(scene)` (importers) — writes a `flowchart TD` string (inverse of `importMermaid`), round-tripping node + edge structure and emitting `%% skipped: <type>` comments for non-graph elements.

### Patch Changes

- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0

## 0.58.0

### Minor Changes

- db6fa48: Renamed the `LinkDirection` type to `EdgeDirection`, matching the package's graph vocabulary (`GraphEdge`, `GraphNode`).

### Patch Changes

- b474d70: Harden the drawio importer against two issues flagged by static analysis. The
  attribute parser no longer backtracks polynomially on a long run of name
  characters with no `=` (the name is matched atomically), and entity decoding no
  longer double-unescapes: `&amp;lt;` now decodes once to the literal `&lt;`
  instead of `<`, via a single left-to-right pass.
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
  - @oh-just-another/tokens@0.57.0
  - @oh-just-another/types@0.57.0
