import {
  containerSizeForZone,
  expandDropZoneToFit,
  getContainerSpec,
  getDropZoneWorld,
  getShape,
  getShapeWorldBounds,
  isContainer,
  orderForTop,
  updateShape,
  type Scene,
  type Shape,
  type Patch,
} from "@oh-just-another/scene";
import { bounds as B } from "@oh-just-another/math";
import type { Bounds, ElementId } from "@oh-just-another/types";
import { CONTAINER_KEEP_THRESHOLD } from "../constants.js";
import type { HandleId } from "../handle.js";
import { hasWidthHeight } from "./shape-traits.js";

/**
 * Pure: fraction of `child`'s area that lies inside `zone`.
 * Returns 0 when either bbox is degenerate or they don't
 * intersect. Used by the container drop handler to decide between
 * "child still belongs to the lane" and "user dragged it out".
 */
export const coverageRatio = (child: Bounds, zone: Bounds): number => {
  const area = child.width * child.height;
  if (area <= 0) return 0;
  const ix = Math.max(child.x, zone.x);
  const iy = Math.max(child.y, zone.y);
  const ix2 = Math.min(child.x + child.width, zone.x + zone.width);
  const iy2 = Math.min(child.y + child.height, zone.y + zone.height);
  const iw = ix2 - ix;
  const ih = iy2 - iy;
  if (iw <= 0 || ih <= 0) return 0;
  return (iw * ih) / area;
};

/**
 * Pure: union of every direct child's world-space AABB. Returns
 * `null` when the container has no children. Only direct children
 * are constrained because container resize doesn't cascade into
 * nested containers (the inner one self-constrains via its own
 * clamp call).
 */
export const childrenWorldUnion = (scene: Scene, containerId: ElementId): Bounds | null => {
  let acc: Bounds | null = null;
  for (const s of scene.shapes.values()) {
    if (s.parentId !== containerId) continue;
    const b = getShapeWorldBounds(s);
    acc = acc ? B.union(acc, b) : b;
  }
  return acc;
};

/**
 * Pure: floor the proposed container bounds to whatever is
 * required to keep every child fully inside the drop-zone. The
 * expansion is applied at the edges touched by `handle`, so the
 * dragged corner / side keeps controlling direction — the shape
 * just refuses to go smaller than the children mandate.
 *
 * Works for any shape with a `ContainerSpec` (template-driven or
 * static metadata). Returns `raw` unchanged when the shape has no
 * children or isn't a container.
 */
export const clampContainerToChildren = (
  scene: Scene,
  shape: Shape,
  raw: Bounds,
  handle: HandleId,
): Bounds => {
  if (!isContainer(shape) || !hasWidthHeight(shape)) return raw;
  const childrenBox = childrenWorldUnion(scene, shape.id);
  if (!childrenBox) return raw;
  // Compose a hypothetical container with the proposed bounds, then
  // ask the resolver where the drop-zone lands at that size. Chrome
  // (header / margin / padding) stays constant across resize, so a
  // single-pass expansion is sound for typical templates.
  const hypothetical = {
    ...shape,
    position: { x: raw.x, y: raw.y },
    width: raw.width,
    height: raw.height,
  } as Shape;
  const dropZoneWorld = getDropZoneWorld(hypothetical);
  if (!dropZoneWorld) return raw;

  let { x, y, width, height } = raw;
  const dx0 = dropZoneWorld.x;
  const dy0 = dropZoneWorld.y;
  const dx1 = dropZoneWorld.x + dropZoneWorld.width;
  const dy1 = dropZoneWorld.y + dropZoneWorld.height;
  const cx0 = childrenBox.x;
  const cy0 = childrenBox.y;
  const cx1 = childrenBox.x + childrenBox.width;
  const cy1 = childrenBox.y + childrenBox.height;

  if (handle.includes("e") && dx1 < cx1) {
    width += cx1 - dx1;
  }
  if (handle.includes("s") && dy1 < cy1) {
    height += cy1 - dy1;
  }
  if (handle.includes("w") && dx0 > cx0) {
    const shift = dx0 - cx0;
    x -= shift;
    width += shift;
  }
  if (handle.includes("n") && dy0 > cy0) {
    const shift = dy0 - cy0;
    y -= shift;
    height += shift;
  }
  return { x, y, width, height };
};

/**
 * Narrow editor surface used by `ContainerController`. The
 * controller writes patches back through `applyPatch` and the
 * gesture-transaction callbacks instead of carrying its own
 * scene / history references — keeps the call sites local to
 * Editor (and the transaction model untouched).
 */
export interface ContainerOpsRef {
  readonly scene: Scene;
  readonly dragShapeId: ElementId | null;
  readonly containerHover: { readonly id: ElementId } | null;
  /** Apply the patch to the editor's scene + record into the open gesture tx. */
  applyPatch(patch: Patch, nextScene: Scene): void;
}

/**
 * End-of-drag container hookup: reparent into hovered container,
 * grow the parent to fit the dropped child, or drag-out when the
 * coverage check fails. All patches go through the same gesture
 * transaction so the reparent + auto-grow land in one undo step.
 *
 * Rules:
 *  - hovering a container that's NOT the current parent → reparent
 *    + bump to top z-order of the layer, then grow zone to fit;
 *  - hovering the same container that IS the current parent →
 *    auto-grow if the child overflowed during the drag;
 *  - no hover but had a parent → coverage check; ≥ keep threshold
 *    stays parented (with grow), else drag-out (remove parentId).
 *  - `group` parents are special: logical wrappers, never drag-out.
 *
 * `_worldPoint` is unused; kept on the signature for the exact
 * release coordinates.
 */
export const applyContainerDrop = (
  ref: ContainerOpsRef,
  _worldPoint: unknown,
): void => {
  const dragId = ref.dragShapeId;
  if (!dragId) return;
  const shape = getShape(ref.scene, dragId);
  if (!shape) return;

  const hover = ref.containerHover;
  if (hover && hover.id !== shape.parentId) {
    // Reparent into hovered container. Bump the dropped shape to
    // top z-order of its layer so it lands ABOVE the container's
    // visual body (otherwise the container's fill obscures it).
    const topOrder = orderForTop(
      [...ref.scene.shapes.values()]
        .filter((s) => s.layerId === shape.layerId && s.id !== dragId)
        .map((s) => s.order),
    );
    const r = updateShape(ref.scene, dragId, (s) => ({
      ...s,
      parentId: hover.id,
      order: topOrder,
    }));
    ref.applyPatch(r.patch, r.scene);
    maybeGrowContainer(ref, hover.id, dragId);
    return;
  }

  if (hover && hover.id === shape.parentId) {
    // Drag-within: cursor still over the same parent. If the
    // child's bounds overflow the drop-zone, grow the parent.
    maybeGrowContainer(ref, shape.parentId, dragId);
    return;
  }

  if (shape.parentId) {
    const parent = getShape(ref.scene, shape.parentId);
    // Group parents have no drop-zone — they're logical wrappers,
    // not spatial containers. The drag-out / coverage logic is for
    // proper containers (swimlane, frame, template); a group child
    // must stay parented to its group regardless of its world bounds.
    if (parent?.type === "group") return;
    // hover = null: cursor left the parent's zone, but the child
    // itself may still be mostly inside. Coverage check decides:
    //   ≥ CONTAINER_KEEP_THRESHOLD → keep parent + grow zone to fit.
    //   < threshold → un-parent (drag-out).
    const parentZone = parent ? getDropZoneWorld(parent) : null;
    const childBounds = getShapeWorldBounds(shape);
    const coverage = parentZone ? coverageRatio(childBounds, parentZone) : 0;
    if (parentZone && coverage >= CONTAINER_KEEP_THRESHOLD) {
      maybeGrowContainer(ref, shape.parentId, dragId);
      return;
    }
    const r = updateShape(ref.scene, dragId, (s) => {
      const next: Shape = { ...s };
      delete (next as { parentId?: ElementId }).parentId;
      return next;
    });
    ref.applyPatch(r.patch, r.scene);
  }
};

/**
 * If `childId` no longer fits inside `containerId`'s drop-zone,
 * expand the zone + the container's outer size. Single patch
 * added through `ref.applyPatch` (and therefore into the running
 * gesture transaction). Skips no-op cases (already fits,
 * container has no width/height field, no container spec).
 */
export const maybeGrowContainer = (
  ref: ContainerOpsRef,
  containerId: ElementId,
  childId: ElementId,
): void => {
  const container = getShape(ref.scene, containerId);
  const child = getShape(ref.scene, childId);
  if (!container || !child) return;
  const spec = getContainerSpec(container);
  if (!spec) return;
  const childWorld = getShapeWorldBounds(child);
  const expanded = expandDropZoneToFit(container, childWorld);
  if (!expanded) return;

  if (hasWidthHeight(container)) {
    const sized = containerSizeForZone(
      { width: container.width, height: container.height, spec },
      expanded,
    );
    const r = updateShape(ref.scene, containerId, (s) => ({
      ...s,
      position: {
        x: s.position.x + sized.positionOffset.x,
        y: s.position.y + sized.positionOffset.y,
      },
      width: sized.width,
      height: sized.height,
      metadata: {
        ...(s.metadata ?? {}),
        container: { ...spec, dropZone: expanded },
      },
    }) as Shape);
    ref.applyPatch(r.patch, r.scene);
    // Children are stored in absolute world coords — translating
    // the container's `position` does NOT visually move them, so
    // no compensating patch is needed.
    return;
  }
  const r = updateShape(ref.scene, containerId, (s) => ({
    ...s,
    metadata: {
      ...(s.metadata ?? {}),
      container: { ...spec, dropZone: expanded },
    },
  }));
  ref.applyPatch(r.patch, r.scene);
};
