export { Canvas2DTarget } from "./canvas-target.js";
export { Canvas2DTextShaper } from "./canvas-text-shaper.js";
export { WebGL2Target } from "./webgl2-target.js";
export { renderViaTiles, type RenderViaTilesOptions } from "./tile-compositor.js";
export { setupHiDpi } from "./hi-dpi.js";
export { LayeredCanvas, type LayeredCanvasOptions } from "./layered-canvas.js";
export {
  supportsOffscreenCanvas,
  createOffscreenCanvas2DTarget,
  transferCanvasToWorker,
} from "./offscreen.js";
// WorkerPool / LayerWorkerPool live in @oh-just-another/renderer-workers
// (backend-neutral primitives don't belong in the Canvas-specific package).
// Re-export to keep existing imports working.
export { WorkerPool, LayerWorkerPool } from "@oh-just-another/renderer-workers";
export {
  RecordingTarget,
  replayCommands,
  type RenderCommand,
} from "./recording-target.js";
export {
  createLayeredSurface,
  createLayeredSurfaceWithFallback,
  type LayeredSurface,
  type RendererBackend,
  type CreateLayeredSurfaceOptions,
} from "./layered-surface.js";
export {
  isWebGPUAvailable,
  isWebGL2Available,
  pickAvailableBackend,
} from "./webgpu-detect.js";
export { LARGE_SCENE_WORKER_THRESHOLD } from "./constants.js";

// `installBuiltinRenderers` and `wrapText` live in
// `@oh-just-another/renderer-core` so the SVG / headless backends can share them.
// These re-exports keep existing imports working.
export { installBuiltinRenderers, wrapText } from "@oh-just-another/renderer-core";
export type { WrapOptions, WrappedLine } from "@oh-just-another/renderer-core";

// `installBuiltinRenderers()` must be called once before `renderScene`
// from `@oh-just-another/renderer-core` knows how to draw built-in shapes. It is
// not auto-invoked so that this package stays `sideEffects: false` and tree-
// shakeable. Hosts typically call it in their entry file.
