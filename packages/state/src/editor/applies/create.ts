import {
 addEdge,
 addShape,
 orderForBottom,
 orderForTop,
 type Edge,
 type EdgeEndpoint,
 type Scene,
 type Shape,
 type Patch,
} from "@oh-just-another/scene";
import { DEFAULT_EDGE_STYLE, DEFAULT_SHAPE_STYLES } from "@oh-just-another/tokens";
import type {
 Bounds,
 EdgeId,
 LayerId,
 ShapeId,
} from "@oh-just-another/types";

/**
 * Defaults used by `buildShapeForCreate` — sourced from
 * `@oh-just-another/tokens` so the editor and the templates package
 * agree on a fresh shape's look. A host wanting to recolour can
 * either patch the tokens package or fork `buildShapeForCreate`;
 * theme-aware overrides are a concern.
 */
const DEFAULT_RECT_STYLE = DEFAULT_SHAPE_STYLES.rectangle;
const DEFAULT_ELLIPSE_STYLE = DEFAULT_SHAPE_STYLES.ellipse;

/**
 * Pure: build the `Shape` object for a CREATE_SHAPE emit. Doesn't
 * touch the scene — caller threads it through `addShape`.
 *
 * Frames go to the bottom of their layer so the children inside
 * them still receive clicks; rect / ellipse go to the top of the
 * stack as usual.
 */
export const buildShapeForCreate = (
 scene: Scene,
 kind: "rect" | "ellipse" | "frame",
 bounds: Bounds,
 id: ShapeId,
 layerId: LayerId,
 nextFrameName: () => string,
): Shape => {
 const orders = Array.from(scene.shapes.values())
  .filter((s) => s.layerId === layerId)
  .map((s) => s.order);
 const order = kind === "frame" ? orderForBottom(orders) : orderForTop(orders);
 const common = {
  id,
  layerId,
  position: { x: bounds.x, y: bounds.y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order,
  width: bounds.width,
  height: bounds.height,
 };
 if (kind === "rect") {
  return { ...common, type: "rectangle", style: { ...DEFAULT_RECT_STYLE } };
 }
 if (kind === "ellipse") {
  return { ...common, type: "ellipse", style: { ...DEFAULT_ELLIPSE_STYLE } };
 }
 // Frame: empty style (renderer hard-codes the dashed look), auto-numbered name.
 return { ...common, type: "frame", style: {}, name: nextFrameName() };
};

/**
 * Pure: build the `Edge` object for a CREATE_EDGE emit. Endpoints
 * are pre-resolved (snapped) by the caller — we just compose them
 * with the layer / order / style boilerplate.
 */
export const buildEdgeForCreate = (
 scene: Scene,
 from: EdgeEndpoint,
 to: EdgeEndpoint,
 id: EdgeId,
 layerId: LayerId,
): Edge => {
 const order = orderForTop(
  Array.from(scene.edges.values())
   .filter((e) => e.layerId === layerId)
   .map((e) => e.order),
 );
 return {
  id,
  layerId,
  from,
  to,
  order,
  style: { ...DEFAULT_EDGE_STYLE },
  arrowheads: { to: "triangle" },
 };
};

/**
 * Composite helper for `applyCreate` — builds the shape and runs
 * `addShape` against the scene. Returns the scene + patch so the
 * Editor can `_history.push(patch)` and clear/notify.
 *
 * `void bounds` — the bounds is part of the shape via `position` +
 * `width` / `height`; the parameter is kept on the signature only
 * to document intent at the call site.
 */
export const computeCreateShape = (
 scene: Scene,
 kind: "rect" | "ellipse" | "frame",
 bounds: Bounds,
 id: ShapeId,
 layerId: LayerId,
 nextFrameName: () => string,
): { readonly scene: Scene; readonly patch: Patch; readonly shapeId: ShapeId } => {
 const shape = buildShapeForCreate(scene, kind, bounds, id, layerId, nextFrameName);
 const result = addShape(scene, shape);
 return { scene: result.scene, patch: result.patch, shapeId: id };
};

/**
 * Composite helper for `applyCreateEdge` — combines `buildEdge` and
 * `addEdge`. Endpoint snapping is caller responsibility (delegated
 * to the snap engine in Editor); pre-resolved `from`/`to` are
 * threaded in as parameters.
 */
export const computeCreateEdge = (
 scene: Scene,
 from: EdgeEndpoint,
 to: EdgeEndpoint,
 id: EdgeId,
 layerId: LayerId,
): { readonly scene: Scene; readonly patch: Patch; readonly edgeId: EdgeId } => {
 const edge = buildEdgeForCreate(scene, from, to, id, layerId);
 const result = addEdge(scene, edge);
 return { scene: result.scene, patch: result.patch, edgeId: id };
};

/** Generate a unique shape id with the per-editor `nextId` counter. */
export const newShapeId = (next: number): ShapeId =>
 `shape-${next}-${Date.now().toString(36)}` as ShapeId;

/** Generate a unique edge id with the per-editor `nextId` counter. */
export const newEdgeId = (next: number): EdgeId =>
 `edge-${next}-${Date.now().toString(36)}` as EdgeId;
