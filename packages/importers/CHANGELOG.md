# @oh-just-another/importers

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
