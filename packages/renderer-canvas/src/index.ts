export { Canvas2DTarget } from "./canvas2d/canvas-target.js";
export { Canvas2DTextShaper } from "./canvas2d/canvas-text-shaper.js";
export { WebGL2Target, type WebGL2TargetOptions } from "./webgl2/webgl2-target.js";
export { renderViaTiles, type RenderViaTilesOptions } from "./surface/tile-compositor.js";
export { setupHiDpi, cappedDpr } from "./canvas2d/hi-dpi.js";
export { LayeredCanvas, type LayeredCanvasOptions } from "./canvas2d/layered-canvas.js";
export {
  supportsOffscreenCanvas,
  createOffscreenCanvas2DTarget,
  transferCanvasToWorker,
} from "./offscreen/offscreen.js";
export { createRenderWorker } from "./offscreen/worker-factory.js";
export { WorkerPool, LayerWorkerPool } from "@oh-just-another/renderer-workers";
export {
  RecordingTarget,
  replayCommands,
  type RenderCommand,
} from "./offscreen/recording-target.js";
export {
  createLayeredSurface,
  createLayeredSurfaceWithFallback,
  type LayeredSurface,
  type RendererBackend,
  type CreateLayeredSurfaceOptions,
} from "./surface/layered-surface.js";
export {
  isWebGPUAvailable,
  isWebGL2Available,
  pickAvailableBackend,
} from "./webgl2/webgpu-detect.js";
export { LARGE_SCENE_WORKER_THRESHOLD, MAX_DEVICE_PIXEL_RATIO } from "./constants.js";

export { installBuiltinRenderers, wrapText } from "@oh-just-another/renderer-core";
export type { WrapOptions, WrappedLine } from "@oh-just-another/renderer-core";

// `installBuiltinRenderers()` must be called once before built-in shapes
// can be drawn. It is not auto-invoked so this package stays
// `sideEffects: false` and tree-shakeable. Hosts typically call it in
// their entry file.
