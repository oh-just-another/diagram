# @oh-just-another/renderer-svg

## 0.58.2

### Patch Changes

- Updated dependencies [0846934]
  - @oh-just-another/scene@0.63.0
  - @oh-just-another/renderer-core@0.61.2

## 0.58.1

### Patch Changes

- Updated dependencies [8f0ec5d]
  - @oh-just-another/renderer-core@0.61.1

## 0.58.0

### Minor Changes

- 3543dc7: `RenderTarget` gained `clip(rule?)`: intersect the clip region with the current path, scoped by `save()`/`restore()` (nested pairs intersect). Canvas2D uses native `ctx.clip`, SVG emits `<clipPath>` + a `<g clip-path>` wrapper, WebGL2 rasterises the flattened path into the stencil buffer (aliased edge, like Canvas2D clips); the offscreen recording/replay codec carries the new op.

### Patch Changes

- Updated dependencies [76463dd]
- Updated dependencies [e0e4ea9]
- Updated dependencies [e66a8a5]
- Updated dependencies [06a0625]
- Updated dependencies [e2ff8df]
- Updated dependencies [5f08d13]
- Updated dependencies [3019bc7]
- Updated dependencies [2e2a9e7]
- Updated dependencies [350c6d3]
- Updated dependencies [518a6d1]
- Updated dependencies [3543dc7]
- Updated dependencies [2cd199e]
- Updated dependencies [745d7a9]
- Updated dependencies [586b7ed]
- Updated dependencies [d4c2c2f]
- Updated dependencies [993b46a]
- Updated dependencies [ef7388f]
- Updated dependencies [e15fa56]
- Updated dependencies [8163681]
  - @oh-just-another/renderer-core@0.61.0
  - @oh-just-another/scene@0.62.0

## 0.57.5

### Patch Changes

- @oh-just-another/renderer-core@0.60.1

## 0.57.4

### Patch Changes

- Updated dependencies [762dd8a]
- Updated dependencies [05707ed]
- Updated dependencies [20af638]
- Updated dependencies [84450bc]
  - @oh-just-another/scene@0.61.0
  - @oh-just-another/renderer-core@0.60.0

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
