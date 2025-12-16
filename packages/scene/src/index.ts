// Types
export type {
  Style,
  TextStyle,
  LineCap,
  LineJoin,
  TextAlign,
  TextBaseline,
  FontWeight,
  FontStyle,
  TextDecoration,
  StrokeAlign,
  Roundness,
} from "./style.js";
export { getCornerRadius } from "./style.js";
export {
  ADAPTIVE_CORNER_RADIUS,
  PROPORTIONAL_CORNER_RADIUS,
} from "./constants.js";
export type {
  Element,
  ElementBase,
  BuiltinElement,
  RectangleElement,
  EllipseElement,
  PolygonElement,
  PathElement,
  PathCommand,
  TextElement,
  ImageElement,
  TemplateElement,
  GroupElement,
  FrameElement,
  BlockArrowElement,
  BrushElement,
  BrushPoint,
  ElementBounder,
} from "./shape.js";
export type {
  Link,
  LinkEndpoint,
  LinkRouting,
  LinkArrowheads,
  LinkLabel,
  ArrowheadStyle,
  AnchorRef,
  NamedAnchor,
  StandardAnchor,
} from "./edge.js";
export {
  getLinkEndpointWorld,
  getLinkPath,
  findLinkAt,
  getLinkCurvePoints,
  getLinkCurveSegments,
} from "./edge-geometry.js";
export {
  catmullRomBeziers,
  cubicWithEndTangents,
  flattenSegments,
  type BezierSegment,
} from "./edge-curve.js";
export type { Layer } from "./layer.js";
export type { Viewport, GridStyle } from "./viewport.js";
export type { Scene } from "./scene.js";
export type { Patch } from "./patch.js";
export type { OperationResult } from "./operations.js";

// Element helpers + bounder registry
export {
  isRectangle,
  isEllipse,
  isPolygon,
  isPath,
  isText,
  isImage,
  isTemplate,
  isGroup,
  isFrame,
  isBlockArrow,
  isBrush,
  registerBounder,
  getBounder,
  getElementLocalBounds,
  getElementWorldBounds,
} from "./shape.js";
export {
  setTextMeasurer,
  getTextMeasurer,
  type TextMeasurer,
  type TextMeasureOpts,
} from "./text-measure.js";

// Anchor helpers
export {
  STANDARD_ANCHORS,
  STANDARD_ANCHOR_RATIOS,
  CARDINAL_ANCHORS,
  getNamedAnchorLocal,
  getAnchorLocal,
  getAnchorWorld,
  getAnchorOutwardNormal,
  listAnchorsLocal,
  geometryDefaultAnchorsLocal,
  findNearestAnchor,
  snapExcludedAnchors,
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
  orderBetweenMany,
  addBinaryFile,
  removeBinaryFile,
  getBinaryFile,
} from "./scene.js";
export type { FractionalIndex } from "fractional-keys";

// Binary file registry.
export type { BinaryFile } from "./file.js";
export { createBinaryFile } from "./file.js";

// Patch utilities
export { invert, batch, isNoop } from "./patch.js";

// Operations (return { scene, patch })
export {
  addElement,
  removeElement,
  updateElement,
  moveElement,
  addLink,
  removeLink,
  updateLink,
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
  getElement,
  getLink,
  getLayer,
  getLayersInOrder,
  getElementsInLayer,
  getLinksInLayer,
  getElementsInBounds,
  getElementsCoveredByBounds,
  getElementAt,
  buildSpatialIndex,
  queryByIndex,
  getElementAtIndexed,
  getChildrenOf,
  getRootSelf,
  getDescendantsOf,
  isElementLocked,
  isElementHidden,
} from "./queries.js";

// Spatial index (the class itself, for advanced uses)
export { SpatialGrid } from "./spatial.js";

// Accessibility helpers
export type { AccessibleNameResolver } from "./a11y.js";
export { getElementAccessibleName, registerAccessibleName } from "./a11y.js";

// Layout helpers (pure functions returning patches)
export type {
  LayoutFn,
  LayoutSpec,
  GridLayoutSpec,
  StackLayoutSpec,
  TreeLayoutSpec,
  AutoLayoutSpec,
} from "./layout.js";
export {
  gridLayout,
  stackLayout,
  treeLayout,
  allElementsInLayer,
  getAutoLayoutSpec,
  runAutoLayout,
} from "./layout.js";
export type { LayoutKindEntry } from "./layout-registry.js";
export {
  registerLayoutKind,
  unregisterLayoutKind,
  getLayoutKind,
  listLayoutKinds,
} from "./layout-registry.js";

// Tunable thresholds.
export {
  SNAP_PROBE_CULL_RADIUS,
  ELBOW_OBSTACLE_MARGIN,
  ELBOW_OBSTACLE_INTERIOR_EPSILON,
} from "./constants.js";

// Elbow router — A*-based obstacle-avoiding 90° routing.
export { elbowRoute, type ElbowRouteOptions } from "./elbow-router.js";
export { routeElbowLink, routeElbowPreview } from "./elbow-link.js";
export {
  type Heading,
  HEADING_RIGHT,
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_UP,
  headingIsHorizontal,
  headingsEqual,
  flipHeading,
  vectorToHeading,
  headingForPoint,
  headingForPointFromElement,
} from "./heading.js";

// Scene-level shape diff (added / removed / modified) for diff
// visualisation and merge.
export type { SceneElementDiff } from "./diff.js";
export { diffSceneElements } from "./diff.js";

// Three-way merge (the Y.Doc subdoc runtime remains in @collab).
export type {
  ConflictResolutionInput,
  ThreeWayMergeConflict,
  ThreeWayMergeOptions,
  ThreeWayMergeReport,
} from "./three-way-merge.js";
export { mergeScenesThreeWay, applyConflictResolutions } from "./three-way-merge.js";

// Container / drop-zone protocol.
export {
  isContainer,
  getContainerSpec,
  getDropZoneWorld,
  findContainerAt,
  expandDropZoneToFit,
  containerSizeForZone,
  registerContainerResolver,
  type ContainerSpec,
  type ContainerResolver,
} from "./container.js";
