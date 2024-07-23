// Types
export type { Style, TextStyle, LineCap, LineJoin, TextAlign, TextBaseline } from "./style";
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
} from "./shape";
export type { Edge, EdgeEndpoint, AnchorRef, NamedAnchor, StandardAnchor } from "./edge";
export type { Layer } from "./layer";
export type { Viewport } from "./viewport";
export type { Scene } from "./scene";
export type { Patch } from "./patch";
export type { OperationResult } from "./operations";

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
} from "./shape";

// Viewport helpers
export {
  DEFAULT_VIEWPORT,
  getWorldToScreen,
  getScreenToWorld,
  panBy,
  zoomAt,
  resize,
} from "./viewport";

// Scene constructor + apply + ordering helpers
export {
  DEFAULT_LAYER_ID,
  emptyScene,
  apply,
  orderForTop,
  orderForBottom,
  orderBetween,
} from "./scene";

// Patch utilities
export { invert, batch, isNoop } from "./patch";

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
} from "./operations";

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
} from "./queries";

// Spatial index (the class itself, for advanced uses)
export { SpatialGrid } from "./spatial";
