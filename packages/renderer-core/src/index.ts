export type {
  RenderTarget,
  LineCap,
  LineJoin,
  TextAlign,
  TextBaseline,
  FillRule,
  DrawPoint,
} from "./render-target.js";
export type { ShapeRenderer } from "./shape-renderer.js";
export type { LayerName } from "./layers.js";
export type { RenderSceneOptions } from "./scene-renderer.js";
export type { RenderEdgesOptions } from "./edge-renderer.js";

export { registerShapeRenderer, getShapeRenderer, hasShapeRenderer } from "./shape-renderer.js";
export { LAYER_ORDER } from "./layers.js";
export { renderScene } from "./scene-renderer.js";
export { renderEdges } from "./edge-renderer.js";

// Backend-agnostic shape renderers for the 6 built-in `BuiltinShape` types.
// `installBuiltinRenderers()` registers them via `registerShapeRenderer` and
// is safe to call multiple times.
export { installBuiltinRenderers } from "./built-in-renderers.js";
export type { WrapOptions, WrappedLine } from "./text-layout.js";
export { wrapText } from "./text-layout.js";
