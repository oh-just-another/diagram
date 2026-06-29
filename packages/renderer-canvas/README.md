# @oh-just-another/renderer-canvas

[![npm version](https://img.shields.io/npm/v/@oh-just-another/renderer-canvas.svg)](https://www.npmjs.com/package/@oh-just-another/renderer-canvas)

Canvas2D and WebGL2 backends for the diagram render kernel.

L2 package. Implements `RenderTarget` from `@oh-just-another/renderer-core` over `CanvasRenderingContext2D` and WebGL2, plus DOM helpers for hi-DPI, multi-layer composition, tiling, command recording, and offscreen/worker rendering. Browser-only — depends on `HTMLCanvasElement`, `OffscreenCanvas` and `window.devicePixelRatio`. For headless rendering (Node), use `@oh-just-another/renderer-svg`.

## Quick start

```ts
import { renderScene } from "@oh-just-another/renderer-core";
import { createLayeredSurface, installBuiltinRenderers } from "@oh-just-another/renderer-canvas";

// Once per app: tell renderer-core how to draw each built-in shape type.
installBuiltinRenderers();

const host = document.getElementById("stage")!;
const surface = createLayeredSurface(host, 1000, 600);
renderScene(scene, surface.get("main"));
```

## API

### Render targets

| Name              | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `Canvas2DTarget`  | `RenderTarget` over `CanvasRenderingContext2D`. CSS-pixel coordinate space.       |
| `WebGL2Target`    | `RenderTarget` backed by a WebGL2 context.                                        |
| `RecordingTarget` | `RenderTarget` that captures draw calls as `RenderCommand[]` instead of painting. |
| `replayCommands`  | Replays a recorded `RenderCommand[]` against another `RenderTarget`.              |
| `RenderCommand`   | Serializable record of a single captured draw call.                               |

### Layered surface

| Name                               | Purpose                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `createLayeredSurface`             | Builds a `LayeredSurface` over the chosen `RendererBackend` (`CreateLayeredSurfaceOptions`).        |
| `createLayeredSurfaceWithFallback` | Same, falling back to an available backend when the preferred one is unsupported.                   |
| `LayeredSurface`                   | Stacked `<canvas>` per `LayerName` (`background`/`main`/`overlay`); `get(name)` returns its target. |
| `LayeredCanvas`                    | Lower-level Canvas2D-only layer manager (`LayeredCanvasOptions`).                                   |

### Tiling and hi-DPI

| Name             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `renderViaTiles` | Renders a scene in tiles and composites them (`RenderViaTilesOptions`). |
| `setupHiDpi`     | Configures bitmap size, CSS size and context transform for hi-DPI.      |

### Backend detection

| Name                      | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `isWebGPUAvailable`       | Reports whether the runtime exposes WebGPU.                    |
| `isWebGL2Available`       | Reports whether a WebGL2 context can be created.               |
| `pickAvailableBackend`    | Chooses a supported `RendererBackend` for the current runtime. |
| `supportsOffscreenCanvas` | Reports whether `OffscreenCanvas` is available.                |

### Workers and offscreen

| Name                             | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| `createRenderWorker`             | Worker entry point that renders an offscreen canvas off the main thread.   |
| `createOffscreenCanvas2DTarget`  | Wraps an `OffscreenCanvas` as a `Canvas2DTarget`.                          |
| `transferCanvasToWorker`         | Transfers a canvas's control to a worker via `transferControlToOffscreen`. |
| `WorkerPool` / `LayerWorkerPool` | Re-exported from `@oh-just-another/renderer-workers`.                      |

### Shapes and text

| Name                      | Purpose                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `installBuiltinRenderers` | Registers renderers for built-in shape types. Call once at startup. Re-exported from `@oh-just-another/renderer-core`.  |
| `wrapText`                | Greedy word-wrap by `measureText` (`WrapOptions` → `WrappedLine[]`). Re-exported from `@oh-just-another/renderer-core`. |
| `Canvas2DTextShaper`      | Measures and shapes text via a `CanvasRenderingContext2D`.                                                              |

## Design notes

- **Auto-install is intentionally absent.** Calling `installBuiltinRenderers()` is a single line in the host entry. In exchange the package keeps `sideEffects: false` and tree-shaking stays predictable.
- **DPR handled at the canvas level**, not on every draw. `setupHiDpi` scales the bitmap and sets a transform once; `Canvas2DTarget` operates entirely in CSS pixels.
- **One canvas per logical layer.** Background and main canvases have `pointer-events: none`; the overlay receives input, keeping static content cached even when the overlay re-paints every frame.
- **Backend choice is explicit but guarded.** Pick a `RendererBackend` directly, or let `createLayeredSurfaceWithFallback` / `pickAvailableBackend` select one supported by the runtime.
- **Scenes above `LARGE_SCENE_WORKER_THRESHOLD`** are good candidates for offscreen/worker rendering via `createRenderWorker` and the `WorkerPool` re-exports.
