export type {
  RenderTarget,
  LineCap,
  LineJoin,
  TextAlign,
  TextBaseline,
  FillRule,
  FontStyleOptions,
  DrawPoint,
} from "./render-target.js";
export type { ElementRenderer } from "./shape-renderer.js";
export type { LayerName } from "./layers.js";
export type { RenderSceneOptions, LodOptions } from "./scene-renderer.js";
export type { RenderLinksOptions } from "./edge-renderer.js";
export type { RenderGridOptions } from "./grid-renderer.js";

export { registerElementRenderer, getElementRenderer, hasElementRenderer } from "./shape-renderer.js";
export { LAYER_ORDER } from "./layers.js";
export { renderScene } from "./scene-renderer.js";
export { renderLinks, strokeRoundedPolyline } from "./edge-renderer.js";
export { renderGrid } from "./grid-renderer.js";

// Backend-agnostic shape renderers for the built-in `BuiltinElement` types.
// `installBuiltinRenderers()` registers them via `registerElementRenderer` and
// is safe to call multiple times.
export { installBuiltinRenderers } from "./built-in-renderers.js";
export type { WrapOptions, WrappedLine } from "./text-layout.js";
export { wrapText } from "./text-layout.js";
export type {
  LaidOutLine,
  EditableTextLayout,
  MeasureText,
  LayoutTextOptions,
  CaretGeometry,
  SelectionRect,
} from "./text-editing.js";
export {
  layoutText,
  caretGeometry,
  pointToCaretIndex,
  selectionRects,
  DEFAULT_LINE_HEIGHT_FACTOR,
} from "./text-editing.js";

export { ElementCache, sharedBoundsCache, cachedWorldBounds } from "./shape-cache.js";
export type { ElementBitmapCache } from "./shape-cache-bitmap.js";
export { InMemoryElementBitmapCache, zoomBucket } from "./shape-cache-bitmap.js";
export type { LinkBitmapCache } from "./edge-cache-bitmap.js";
export { InMemoryLinkBitmapCache } from "./edge-cache-bitmap.js";
export type { LayerCompositeCache } from "./layer-cache-composite.js";
export { InMemoryLayerCompositeCache } from "./layer-cache-composite.js";

// Animated content adapter registry.
export type { AnimatedSourceAdapter } from "./animation-adapter.js";
export {
  registerAnimationAdapter,
  unregisterAnimationAdapter,
  getAnimationAdapter,
  listAnimationKinds,
  resolveImageSource,
  setAnimationClock,
  resetAnimationClock,
  onAnimationContentReady,
  notifyAnimationContentReady,
} from "./animation-adapter.js";

// Pluggable text-shaper and rasterizer interfaces.
export type { TextShaper, ShaperFont, ShapedGlyph } from "./text-shaper.js";
export { setActiveTextShaper, getActiveTextShaper } from "./text-shaper.js";
export type { Rasterizer } from "./rasterizer.js";
export { setActiveRasterizer, getActiveRasterizer } from "./rasterizer.js";
export { jsRasterizer } from "./js-rasterizer.js";
export type {
  WorkerRenderMessage,
  WorkerRenderResponse,
} from "./worker-render.js";
export { WORKER_AUTO_THRESHOLD } from "./worker-render.js";
export type { TileKey, TileCache, TileCacheEntry } from "./tile-renderer.js";
export {
  TILE_SIZE,
  MAX_TILE_CACHE_BYTES,
  LOD_THRESHOLD,
  InMemoryTileCache,
} from "./tile-renderer.js";
export {
  LinkBoundsCache,
  computeLinkWorldBounds,
  sharedLinkBoundsCache,
} from "./edge-cache.js";

export {
  DEFAULT_LOD,
  DEFAULT_PLACEHOLDER_FILL,
  VIEWPORT_CULL_PADDING_RATIO,
  LINK_CORNER_RADIUS,
} from "./constants.js";
