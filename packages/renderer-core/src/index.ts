export type {
  RenderTarget,
  LineCap,
  LineJoin,
  TextAlign,
  TextBaseline,
  FillRule,
  DrawPoint,
} from "./render-target";
export type { ShapeRenderer } from "./shape-renderer";
export type { LayerName } from "./layers";
export type { RenderSceneOptions } from "./scene-renderer";

export { registerShapeRenderer, getShapeRenderer, hasShapeRenderer } from "./shape-renderer";
export { LAYER_ORDER } from "./layers";
export { renderScene } from "./scene-renderer";

// Backend-agnostic shape renderers for the 6 built-in `BuiltinShape` types.
// `installBuiltinRenderers()` registers them via `registerShapeRenderer` and
// is safe to call multiple times.
export { installBuiltinRenderers } from "./built-in-renderers";
export type { WrapOptions, WrappedLine } from "./text-layout";
export { wrapText } from "./text-layout";
