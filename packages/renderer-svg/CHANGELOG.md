# @oh-just-another/renderer-svg

## 0.57.3

### Patch Changes

- 99b5bee: Image `crop` now renders in the WebGL2 and SVG backends, matching Canvas2D. WebGL2 applies the normalised crop rect as a UV sub-rect via `uUvOffset`/`uUvScale` uniforms; SVG oversizes the `<image>` to the virtual full image and clips it to the destination box with a generated `<clipPath>` (`preserveAspectRatio="none"` to keep the stretch semantics). Previously both backends ignored `crop` and drew the whole image. Covered by a new cropped-image golden scene and WebGL2 uniform tests.
- Updated dependencies [783749e]
- Updated dependencies [c189261]
- Updated dependencies [c189261]
- Updated dependencies [641842b]
- Updated dependencies [c189261]
- Updated dependencies [0d3934e]
- Updated dependencies [bdc847e]
- Updated dependencies [a9558d9]
- Updated dependencies [295f38b]
- Updated dependencies [cf8b735]
  - @oh-just-another/scene@0.60.0
  - @oh-just-another/renderer-core@0.59.0

## 0.57.2

### Patch Changes

- Updated dependencies [9673846]
- Updated dependencies [ff90a95]
- Updated dependencies [3152317]
- Updated dependencies [f98730f]
- Updated dependencies [904cc09]
  - @oh-just-another/scene@0.59.0
  - @oh-just-another/renderer-core@0.58.0
  - @oh-just-another/math@0.58.0

## 0.57.1

### Patch Changes

- Updated dependencies [d1b96d9]
  - @oh-just-another/scene@0.58.0
  - @oh-just-another/renderer-core@0.57.1

## 0.57.0

### Minor Changes

- Version bump just for publishing.

### Patch Changes

- Updated dependencies
  - @oh-just-another/math@0.57.0
  - @oh-just-another/renderer-core@0.57.0
  - @oh-just-another/scene@0.57.0
  - @oh-just-another/types@0.57.0
