# @oh-just-another/importers

## 0.60.1

### Patch Changes

- Updated dependencies [c738f81]
  - @oh-just-another/state@0.64.0

## 0.60.0

### Minor Changes

- e202058: Drop any importable diagram file onto the canvas. `@oh-just-another/importers` now owns the formats table (`DIAGRAM_FORMATS`, `IMPORT_FORMATS`, `EXPORT_FORMATS`, `importSceneFrom`, `exportSceneAs`, `importFormatForFile`) and ships `diagramFileDropHandler` — native JSON, Excalidraw, Mermaid, JSON Canvas, Graphviz DOT and draw.io files are parsed and inserted at the drop point; the `Editor` component registers it by default (listed as "Diagrams" in the drop overlay). New `Editor.insertScene(fragment, worldPoint)` merges a scene fragment — elements, links and binary files, ids remapped, one undo step — into the current scene without replacing it.

### Patch Changes

- Updated dependencies [98070d8]
- Updated dependencies [f12caa8]
- Updated dependencies [76463dd]
- Updated dependencies [2942fb9]
- Updated dependencies [d0eb799]
- Updated dependencies [e202058]
- Updated dependencies [e0e4ea9]
- Updated dependencies [d658680]
- Updated dependencies [e66a8a5]
- Updated dependencies [10eac46]
- Updated dependencies [0ed2288]
- Updated dependencies [3e5d81f]
- Updated dependencies [a6fe14d]
- Updated dependencies [06a0625]
- Updated dependencies [09bc11a]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [f46e3da]
- Updated dependencies [350c6d3]
- Updated dependencies [58c944b]
- Updated dependencies [518a6d1]
- Updated dependencies [3f45f83]
- Updated dependencies [b1e08de]
- Updated dependencies [e6057d1]
- Updated dependencies [2cd199e]
- Updated dependencies [68f1e02]
- Updated dependencies [745d7a9]
- Updated dependencies [67b98bb]
- Updated dependencies [7d15a0c]
- Updated dependencies [59695d7]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [24c33b3]
- Updated dependencies [8f8846b]
- Updated dependencies [22c0f48]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [22ecd4b]
- Updated dependencies [8163681]
- Updated dependencies [d8bf8c1]
  - @oh-just-another/state@0.63.0
  - @oh-just-another/scene@0.62.0
  - @oh-just-another/serialization@0.61.0
  - @oh-just-another/tokens@0.58.1

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
