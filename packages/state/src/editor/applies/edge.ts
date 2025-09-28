import {
  findNearestAnchor,
  getLink,
  getShape,
  getShapeAt,
  snapExcludedAnchors,
  updateLink,
  type LinkEndpoint,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";
import type { LinkId } from "@oh-just-another/types";
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
export const computeLinkPreviewEndpoints = (
  scene: Scene,
  fromShape: ElementId | null,
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
export const computeLinkEndpointUpdate = (
  scene: Scene,
  emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>,
  snap: (toShape: ElementId | null, toPoint: Vec2) => LinkEndpoint,
): { readonly scene: Scene; readonly patch: Patch; readonly linkId: LinkId } | null => {
  const edge = getLink(scene, emit.linkId);
  if (!edge) return null;
  const newEndpoint = snap(emit.toShape, emit.toPoint);
  const result = updateLink(scene, edge.id, (e) => ({
    ...e,
    [emit.side]: newEndpoint,
  }));
  return { scene: result.scene, patch: result.patch, linkId: edge.id };
};
