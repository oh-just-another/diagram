import {
  findNearestAnchor,
  getEdge,
  getShape,
  getShapeAt,
  snapExcludedAnchors,
  updateEdge,
  type EdgeEndpoint,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { ShapeId, Vec2 } from "@oh-just-another/types";
import type { EdgeId } from "@oh-just-another/types";
import type { InteractionEmit } from "../../machine.js";

/**
 * Compute the visible (snapped) endpoints for an in-progress
 * draw-edge preview. Both ends snap to the nearest anchor on
 * the press-target / hovered shape; if no shape is involved the
 * raw world point is used.
 *
 * Pure — caller (Editor) writes the result to `edgePreview` and
 * fires notify.
 */
export const computeEdgePreviewEndpoints = (
  scene: Scene,
  fromShape: ShapeId | null,
  fromPoint: Vec2,
  toPoint: Vec2,
): { readonly from: Vec2; readonly to: Vec2 } => {
  let from = fromPoint;
  if (fromShape) {
    const shape = getShape(scene, fromShape);
    if (shape) {
      from = findNearestAnchor(shape, fromPoint, snapExcludedAnchors(shape)).world;
    }
  }
  let to = toPoint;
  const hovered = getShapeAt(scene, toPoint);
  if (hovered) {
    to = findNearestAnchor(hovered, toPoint, snapExcludedAnchors(hovered)).world;
  }
  return { from, to };
};

/**
 * Compute the scene + patch resulting from an UPDATE_EDGE_ENDPOINT
 * emit. Returns `null` when the edge no longer exists (cleared in
 * a parallel undo, etc.); caller treats `null` as "no-op, just
 * clear the drag state". Endpoint snapping is delegated to a
 * callback so this module doesn't pull in the snap engine.
 */
export const computeEdgeEndpointUpdate = (
  scene: Scene,
  emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  snap: (toShape: ShapeId | null, toPoint: Vec2) => EdgeEndpoint,
): { readonly scene: Scene; readonly patch: Patch; readonly edgeId: EdgeId } | null => {
  const edge = getEdge(scene, emit.edgeId);
  if (!edge) return null;
  const newEndpoint = snap(emit.toShape, emit.toPoint);
  const result = updateEdge(scene, edge.id, (e) => ({
    ...e,
    [emit.side]: newEndpoint,
  }));
  return { scene: result.scene, patch: result.patch, edgeId: edge.id };
};
