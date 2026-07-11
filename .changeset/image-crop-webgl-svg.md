---
"@oh-just-another/renderer-canvas": patch
"@oh-just-another/renderer-svg": patch
---

Image `crop` now renders in the WebGL2 and SVG backends, matching Canvas2D. WebGL2 applies the normalised crop rect as a UV sub-rect via `uUvOffset`/`uUvScale` uniforms; SVG oversizes the `<image>` to the virtual full image and clips it to the destination box with a generated `<clipPath>` (`preserveAspectRatio="none"` to keep the stretch semantics). Previously both backends ignored `crop` and drew the whole image. Covered by a new cropped-image golden scene and WebGL2 uniform tests.
