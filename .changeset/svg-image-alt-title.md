---
"@oh-just-another/renderer-core": patch
"@oh-just-another/renderer-svg": patch
---

`RenderTarget.drawImage` takes an optional `alt` (the image element's accessible description); the SVG target emits it as a `<title>` child of the `<image>`. Raster targets ignore it.
