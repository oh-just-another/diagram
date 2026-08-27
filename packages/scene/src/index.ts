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
} from "./text/style.js";
export { getCornerRadius, strokeOutsideExtent } from "./text/style.js";
export { pickTextPlaceholder } from "./text/placeholder.js";
export type { TextRun } from "./text/text-runs.js";
export { runsToText, normalizeRuns, sliceRuns, applyStyleToRange } from "./text/text-runs.js";
export {
  paragraphCount,
  paragraphRangeForOffsets,
  paragraphAt,
  normalizeParagraphs,
  remapParagraphsForTextChange,
  listMarkers,
} from "./text/paragraphs.js";
export { ADAPTIVE_CORNER_RADIUS, PROPORTIONAL_CORNER_RADIUS } from "./constants.js";
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
  TextParagraph,
  ShapeLabel,
  StickyElement,
  EmojiElement,
  ImageElement,
  ImageCrop,
  ImageMask,
  TemplateElement,
  GroupElement,
  FrameElement,
  BlockArrowElement,
  BrushElement,
  BrushPoint,
  ElementBounder,
} from "./shapes/shape.js";
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
} from "./edges/edge.js";
export { isAnchorRef, endpointElementId } from "./edges/edge.js";
export {
  getLinkEndpointWorld,
  getLinkPath,
  findLinkAt,
  getElbowSegmentHandles,
  getLinkCurvePoints,
  getLinkCurveSegments,
  linkLabelBounds,
  getLinkWaypointMidpoints,
  getSelfLoopSpec,
  straightElbowFallback,
} from "./edges/edge-geometry.js";
export {
  estimateLinkLabelBox,
  linkLabelAnchor,
  linkLabelBoundsForPath,
  nudgeHandleOffLabel,
  pointAlongPath,
  projectPointToPathT,
} from "./edges/edge-label.js";
export {
  catmullRomBeziers,
  cubicWithEndTangents,
  flattenSegments,
  type BezierSegment,
} from "./edges/edge-curve.js";
export type { Layer } from "./model/layer.js";
export type { Viewport, GridStyle, StartView } from "./model/viewport.js";
export type { Scene } from "./model/scene.js";
export type { Patch } from "./model/patch.js";
export type { OperationResult } from "./model/operations.js";

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
  canCarryLabel,
  isSticky,
  isEmoji,
  brushBodyColor,
  registerBounder,
  getBounder,
  getElementLocalBounds,
  getElementWorldBounds,
} from "./shapes/shape.js";
export { brushOutline } from "./shapes/brush-outline.js";
export {
  registerRenderOverflow,
  getElementRenderBounds,
  type RenderOverflow,
} from "./shapes/render-bounds.js";
export {
  setTextMeasurer,
  getTextMeasurer,
  type TextMeasurer,
  type TextMeasureOpts,
} from "./text/text-measure.js";

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
} from "./geometry/anchors.js";

// Snap engine + built-in contributors
export type { SnapCandidate, SnapContext, SnapContributor } from "./geometry/snap.js";
export { SnapEngine, gridSnapper, anchorSnapper, outlineSnapper } from "./geometry/snap.js";

// Outline samplers + helpers
export type { OutlineSampler } from "./geometry/outline.js";
export {
  registerOutlineSampler,
  getOutlineSampler,
  getOutlinePoint,
  findNearestOutlinePoint,
} from "./geometry/outline.js";

// Viewport helpers
export {
  DEFAULT_VIEWPORT,
  getWorldToScreen,
  getScreenToWorld,
  panBy,
  zoomAt,
  resize,
  resolveSnapSpacing,
  isSnapToGridEnabled,
} from "./model/viewport.js";

// Scene constructor + apply + ordering helpers
export {
  DEFAULT_LAYER_ID,
  DEFAULT_SCENE,
  emptyScene,
  apply,
  orderForTop,
  orderForBottom,
  orderBetween,
  orderBetweenMany,
  addBinaryFile,
  removeBinaryFile,
  getBinaryFile,
} from "./model/scene.js";
export type { FractionalIndex } from "fractional-keys";

// Z-order comparators.
export { byOrderAsc, byOrderDesc } from "./model/order.js";

// Scene defaults: hydration / dehydration + per-key persistence scope
export { hydrateScene, dehydrateScene, VIEWPORT_SCOPE } from "./model/hydrate.js";
export type { SettingScope, SceneSettings, HydrateInput } from "./model/hydrate.js";

// Binary file registry.
export type { BinaryFile } from "./model/file.js";
export { createBinaryFile, sniffBinaryFileMime } from "./model/file.js";

// Patch utilities
export { invert, batch, isNoop } from "./model/patch.js";

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
} from "./model/operations.js";

// Annotations
export type { Annotation, Comment } from "./annotations/annotation.js";
export { getAnnotationWorldPosition } from "./annotations/annotation-geometry.js";

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
  getElementOutline,
  registerElementOutline,
  type ElementOutlineProvider,
  getRootSelf,
  getDescendantsOf,
  isElementLocked,
  isElementHidden,
} from "./query/queries.js";

// Spatial index (the class itself, for advanced uses)
export { SpatialGrid } from "./query/spatial.js";

// Accessibility helpers
export type { AccessibleNameResolver } from "./a11y.js";
export { getElementAccessibleName, registerAccessibleName } from "./a11y.js";

// Layout helpers (pure functions returning patches)
export type {
  LayoutFn,
  LayoutSpec,
  GridLayoutSpec,
  StackLayoutSpec,
  WrapLayoutSpec,
  TreeLayoutSpec,
  AutoLayoutSpec,
} from "./layout/layout.js";
export {
  gridLayout,
  stackLayout,
  wrapLayout,
  measureWrap,
  treeLayout,
  getAutoLayoutSpec,
  runAutoLayout,
} from "./layout/layout.js";
export type { LayoutKindEntry } from "./layout/layout-registry.js";
export {
  registerLayoutKind,
  unregisterLayoutKind,
  getLayoutKind,
  listLayoutKinds,
} from "./layout/layout-registry.js";

// Tunable thresholds.
export {
  SNAP_PROBE_CULL_RADIUS,
  DEFAULT_GRID_SPACING,
  ELBOW_OBSTACLE_MARGIN,
  ELBOW_OBSTACLE_INTERIOR_EPSILON,
  FRAME_HEADER_HEIGHT,
  FRAME_HEADER_PADDING_X,
  FRAME_HEADER_FONT_SIZE,
  FALLBACK_SCENE_WIDTH,
  FALLBACK_SCENE_HEIGHT,
  LINK_LABEL_DEFAULT_POSITION,
  LINK_LABEL_DEFAULT_FONT_SIZE,
  LINK_LABEL_MAX_WIDTH,
  LINK_LABEL_PAD_X,
  LINK_LABEL_PAD_Y,
  LINK_LABEL_LINE_HEIGHT,
  LINK_LABEL_END_CLEARANCE,
  LINK_LABEL_CHAR_WIDTH_FACTOR,
  IMAGE_MASK_POLYGON_PRESETS,
  TEXT_PLACEHOLDERS,
  type TextPlaceholder,
} from "./constants.js";

// Elbow router — A*-based obstacle-avoiding 90° routing.
export { elbowRoute, type ElbowRouteOptions } from "./edges/elbow-router.js";
export { routeElbowLink, routeElbowPreview } from "./edges/elbow-link.js";
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
  headingForEdgePoint,
} from "./edges/heading.js";

// Scene-level shape diff (added / removed / modified) for diff
// visualisation and merge.
export type { SceneElementDiff } from "./model/diff.js";
export { diffSceneElements } from "./model/diff.js";

// Three-way merge (the Y.Doc subdoc runtime remains in @collab).
export type {
  ConflictResolutionInput,
  ThreeWayMergeConflict,
  ThreeWayMergeOptions,
  ThreeWayMergeReport,
} from "./model/three-way-merge.js";
export { mergeScenesThreeWay, applyConflictResolutions } from "./model/three-way-merge.js";

// Shape local↔world transform helpers.
export { localToWorld, worldToLocal } from "./shapes/shape-transform.js";

// Container / drop-zone protocol.
export {
  isContainer,
  getContainerSpec,
  getDropZoneWorld,
  findContainerAt,
  expandDropZoneToFit,
  containerSizeForZone,
  registerContainerResolver,
  getDropZonesWorld,
  registerContainerZonesResolver,
  type ContainerSpec,
  type ContainerResolver,
  type ContainerZonesResolver,
} from "./shapes/container.js";
