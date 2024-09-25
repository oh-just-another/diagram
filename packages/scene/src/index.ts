// Types
export type { Style, TextStyle, LineCap, LineJoin, TextAlign, TextBaseline } from "./style.js";
export type {
  Shape,
  ShapeBase,
  BuiltinShape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  PathShape,
  PathCommand,
  TextShape,
  ImageShape,
  TemplateShape,
  ShapeBounder,
} from "./shape.js";
export type {
  Edge,
  EdgeEndpoint,
  EdgeRouting,
  EdgeArrowheads,
  EdgeLabel,
  ArrowheadStyle,
  AnchorRef,
  NamedAnchor,
  StandardAnchor,
} from "./edge.js";
export { getEdgeEndpointWorld, getEdgePath, findEdgeAt } from "./edge-geometry.js";
export type { Layer } from "./layer.js";
export type { Viewport } from "./viewport.js";
export type { Scene } from "./scene.js";
export type { Patch } from "./patch.js";
export type { OperationResult } from "./operations.js";

// Shape helpers + bounder registry
export {
  isRectangle,
  isEllipse,
  isPolygon,
  isPath,
  isText,
  isImage,
  isTemplate,
  registerBounder,
  getBounder,
  getShapeLocalBounds,
  getShapeWorldBounds,
} from "./shape.js";

// Anchor helpers
export {
  STANDARD_ANCHORS,
  STANDARD_ANCHOR_RATIOS,
  getNamedAnchorLocal,
  getAnchorLocal,
  getAnchorWorld,
  listAnchorsLocal,
  findNearestAnchor,
} from "./anchors.js";

// Snap engine + built-in contributors
export type { SnapCandidate, SnapContext, SnapContributor } from "./snap.js";
export { SnapEngine, gridSnapper, anchorSnapper, outlineSnapper } from "./snap.js";

// Outline samplers + helpers
export type { OutlineSampler } from "./outline.js";
export {
  registerOutlineSampler,
  getOutlineSampler,
  getOutlinePoint,
  findNearestOutlinePoint,
} from "./outline.js";

// Viewport helpers
export {
  DEFAULT_VIEWPORT,
  getWorldToScreen,
  getScreenToWorld,
  panBy,
  zoomAt,
  resize,
} from "./viewport.js";

// Scene constructor + apply + ordering helpers
export {
  DEFAULT_LAYER_ID,
  emptyScene,
  apply,
  orderForTop,
  orderForBottom,
  orderBetween,
} from "./scene.js";

// Patch utilities
export { invert, batch, isNoop } from "./patch.js";

// Operations (return { scene, patch })
export {
  addShape,
  removeShape,
  updateShape,
  moveShape,
  addEdge,
  removeEdge,
  updateEdge,
  addLayer,
  removeLayer,
  updateLayer,
  setViewport,
  addAnnotation,
  removeAnnotation,
  updateAnnotation,
} from "./operations.js";

// Annotations
export type { Annotation, Comment } from "./annotation.js";
export { getAnnotationWorldPosition } from "./annotation-geometry.js";

// Queries
export {
  getShape,
  getEdge,
  getLayer,
  getLayersInOrder,
  getShapesInLayer,
  getEdgesInLayer,
  getShapesInBounds,
  getShapeAt,
  buildSpatialIndex,
  queryByIndex,
  getShapeAtIndexed,
} from "./queries.js";

// Spatial index (the class itself, for advanced uses)
export { SpatialGrid } from "./spatial.js";

// Accessibility helpers
export type { AccessibleNameResolver } from "./a11y.js";
export { getShapeAccessibleName, registerAccessibleName } from "./a11y.js";

// Layout helpers (pure functions returning patches)
export type {
  LayoutFn,
  LayoutSpec,
  GridLayoutSpec,
  StackLayoutSpec,
} from "./layout.js";
export { gridLayout, stackLayout, allShapesInLayer } from "./layout.js";

// Tunable thresholds.
export { SNAP_PROBE_CULL_RADIUS } from "./constants.js";
