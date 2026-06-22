# @oh-just-another/renderer-canvas

L2 Canvas2D backend for the diagram renderer. Implements `RenderTarget` from `@oh-just-another/renderer-core`, ships built-in shape renderers for every built-in shape type in `@oh-just-another/scene`, and provides DOM helpers for hi-DPI and multi-layer composition.

Browser-only — depends on `CanvasRenderingContext2D`, `HTMLCanvasElement` and `window.devicePixelRatio`. For headless rendering (Node), use `@oh-just-another/renderer-svg`.

## Quick start

```ts
import { renderScene } from "@oh-just-another/renderer-core";
import { LayeredCanvas, installBuiltinRenderers } from "@oh-just-another/renderer-canvas";

// Once per app: tell renderer-core how to draw each built-in shape type.
installBuiltinRenderers();

const host = document.getElementById("stage")!;
const layered = new LayeredCanvas(host, 1000, 600);
renderScene(scene, layered.get("main"));
```

## API

| Name                              | Purpose                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Canvas2DTarget`                  | `RenderTarget` over `CanvasRenderingContext2D`. CSS-pixel coordinate space.                            |
| `setupHiDpi(canvas, w, h, dpr?)`  | Configures bitmap size, CSS size and context transform for hi-DPI.                                     |
| `LayeredCanvas`                   | Manages stacked `<canvas>` per `LayerName` (`background`/`main`/`overlay`).                            |
| `wrapText(text, target, options)` | Greedy word-wrap by `measureText`. Returns `{ lines, lineHeight }`.                                    |
| `installBuiltinRenderers()`       | Registers Canvas2D renderers for rectangle, ellipse, polygon, path, text, image. Call once at startup. |

## Design notes

- **Auto-install is intentionally absent.** Calling `installBuiltinRenderers()` is a single line in the host app entry. In exchange the package keeps `sideEffects: false` and tree-shaking stays predictable.
- **DPR handled at the canvas level**, not on every draw. `setupHiDpi` scales the bitmap and sets a transform once; `Canvas2DTarget` operates entirely in CSS pixels.
- **One canvas per logical layer.** Background and main canvases have `pointer-events: none`; the overlay receives input. This keeps static content cached even when the overlay re-paints every frame.
- **Image source is opaque (`unknown`).** The renderer hands `shape.metadata.image ?? shape.src` to `ctx.drawImage` — the host app is responsible for loading and caching `HTMLImageElement`s ahead of time.
