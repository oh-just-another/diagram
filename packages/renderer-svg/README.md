# @oh-just-another/renderer-svg

Second rendering backend — turns a `Scene` into an SVG-string snapshot. Pure TS, no DOM, runs identically in Node and the browser. Designed for headless rendering, file export (Phase 9), and pixel-parity testing against the Canvas backend.

## Quick start

```ts
import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
import { writeFile } from "node:fs/promises";

await writeFile("diagram.svg", renderSceneToSvg(scene));
```

For lower-level access — composing several scenes, controlling each draw call — instantiate `SvgTarget` directly and call `renderScene(scene, target)` followed by `target.toSvg()`.

```ts
import { SvgTarget } from "@oh-just-another/renderer-svg";
import { installBuiltinRenderers, renderScene } from "@oh-just-another/renderer-core";

installBuiltinRenderers();
const target = new SvgTarget({ width: 800, height: 600 });
renderScene(scene, target);
const svg = target.toSvg();
```

## API

| Name                                          | Purpose                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SvgTarget`                                   | `RenderTarget` implementation backed by a string buffer.                                          |
| `renderSceneToSvg(scene, options?)`           | One-shot helper: instantiates `SvgTarget`, runs `renderScene`, returns the SVG string.            |
| `RenderSceneToSvgOptions`                     | Options: `width`, `height`, `measureText`, `skipInstall`, plus the standard `RenderSceneOptions`. |
| `approxTextWidth(text, fontFamily, fontSize)` | Char-ratio-based text measurer for environments without a text engine.                            |

## Design notes

- **Coordinates are pre-baked into path data.** Every `moveTo` / `lineTo` / `quadraticCurveTo` / `bezierCurveTo` call is multiplied by the current transform before being written. The emitted SVG has no nested `<g transform>` elements — output is flat, smaller, and easier to diff.
- **Path elements are flushed on `fill()` / `stroke()`.** A single subpath can be both filled and stroked — those emit two `<path>` elements with different paint attributes, mirroring Canvas2D semantics.
- **`ellipse()` decomposes into 4 cubic Bezier curves** (kappa ≈ 0.5523). SVG's native `<ellipse>` would be more compact, but every other shape goes through `<path>` already; the uniformity is worth the few extra bytes.
- **Text measurement is pluggable.** Default `approxTextWidth` ratios match a system-ui sans-serif at 16px and are decent for ASCII; pixel-perfect callers supply their own measurer (typically wrapped around `node-canvas` or `opentype.js`).
- **`clear()` without bounds wipes the element buffer** (matches "erase the surface" semantics); bounded clears emit a white `<rect>` so callers don't have to special-case the backend.

