import {
  findNearestAnchor,
  getLink,
  getElement,
  getElementAt,
  getElementWorldBounds,
  snapExcludedAnchors,
  updateLink,
  type Link,
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
  fromElement: ElementId | null,
  fromPoint: Vec2,
  toPoint: Vec2,
): { readonly from: Vec2; readonly to: Vec2 } => {
  let from = fromPoint;
  if (fromElement) {
    const shape = getElement(scene, fromElement);
    if (shape) {
      from = findNearestAnchor(shape, fromPoint, snapExcludedAnchors(shape)).world;
    }
  }
  let to = toPoint;
  const hovered = getElementAt(scene, toPoint);
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
  snap: (toElement: ElementId | null, toPoint: Vec2) => LinkEndpoint,
): { readonly scene: Scene; readonly patch: Patch; readonly linkId: LinkId } | null => {
  const edge = getLink(scene, emit.linkId);
  if (!edge) return null;
  const newEndpoint = snap(emit.toElement, emit.toPoint);
  const result = updateLink(scene, edge.id, (e) => ({
    ...e,
    [emit.side]: newEndpoint,
  }));
  return { scene: result.scene, patch: result.patch, linkId: edge.id };
};

/**
 * Per-link signature of the inputs that determine an elbow route (endpoint refs
 * + bound-shape bounds + fixedSegments). When unchanged between frames the A*
 * route is reused. Avoid-obstacles links also fold a digest of every shape's
 * bbox in, so their route invalidates when any obstacle moves.
 */
export const elbowSignature = (scene: Scene, edge: Link): string => {
  const part = (ep: LinkEndpoint): string => {
    if (ep.kind === "point") return `p:${ep.position.x},${ep.position.y}`;
    const s = getElement(scene, ep.elementId);
    const b = s ? getElementWorldBounds(s) : null;
    const ref =
      ep.kind === "anchor"
        ? JSON.stringify(ep.anchor)
        : ep.kind === "outline"
          ? `o:${ep.ratio}`
          : "f";
    return `${ep.kind}:${ep.elementId}:${ref}:${b ? `${b.x},${b.y},${b.width},${b.height}` : "x"}`;
  };
  const base = `${part(edge.from)}|${part(edge.to)}|${JSON.stringify(edge.fixedSegments ?? null)}`;
  if (edge.avoidObstacles === true) {
    let digest = "|avoid:";
    for (const el of scene.elements.values()) {
      const bb = getElementWorldBounds(el);
      digest += `${el.id},${bb.x},${bb.y},${bb.width},${bb.height};`;
    }
    return base + digest;
  }
  return base;
};
