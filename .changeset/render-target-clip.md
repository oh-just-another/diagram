---
"@oh-just-another/renderer-core": minor
"@oh-just-another/renderer-canvas": minor
"@oh-just-another/renderer-svg": minor
---

`RenderTarget` gained `clip(rule?)`: intersect the clip region with the current path, scoped by `save()`/`restore()` (nested pairs intersect). Canvas2D uses native `ctx.clip`, SVG emits `<clipPath>` + a `<g clip-path>` wrapper, WebGL2 rasterises the flattened path into the stencil buffer (aliased edge, like Canvas2D clips); the offscreen recording/replay codec carries the new op.
