import type { Bounds, ShapeId, Vec2 } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import type { Scene } from "./scene.js";
import type { Shape, ShapeBase } from "./shape.js";
import { getLayersInOrder, getShapesInLayer } from "./queries.js";
import { getShapeWorldBounds } from "./shape.js";

/**
 * Container behaviour spec. Carried on a shape via
 * `shape.metadata.container`. Any shape marked with this object becomes
 * a container: a dragged child landing in its drop-zone is attached via
 * `parentId`, moving the container moves children in lockstep, and a
 * drop expands the container if the child goes past the zone.
 *
 * `dropZone` is stored in local coordinates (relative to
 * `shape.position`). The helpers below convert to world and back.
 *
 * `padding` is the inset for auto-grow expansion: when the zone grows,
 * the new edge is added with this margin.
 */
export interface ContainerSpec {
  readonly dropZone: Bounds;
  readonly padding?: number;
}

/**
 * Live resolver that computes the current `ContainerSpec` for a shape
 * — typically by re-running the template's layout against its current
 * `width` / `height` so the drop-zone stays in sync after the user
 * resizes the container. Returns `null` when the resolver doesn't
 * handle this shape; the next resolver in the chain (or the static
 * `metadata.container` fallback) is tried.
 *
 * Registered by `@templates` so kernel packages stay UI-agnostic.
 */
export type ContainerResolver = (shape: ShapeBase) => ContainerSpec | null;

const resolvers: ContainerResolver[] = [];

/**
 * Plug in a resolver. Called in registration order — first non-null
 * wins. Idempotent: a duplicate function reference is ignored so
 * hot-reload doesn't double-register.
 */
export const registerContainerResolver = (resolver: ContainerResolver): void => {
  if (!resolvers.includes(resolver)) resolvers.push(resolver);
};

/** True when a shape is declared a container — via resolver or metadata. */
export const isContainer = (s: ShapeBase): boolean => getContainerSpec(s) !== null;

/**
 * Resolve the current `ContainerSpec` for `s`. Tries every registered
 * resolver first (live, layout-aware path for templates), then falls
 * back to a static `metadata.container` spec. Returns `null` if
 * shape is not a container.
 */
export const getContainerSpec = (s: ShapeBase): ContainerSpec | null => {
  for (const resolver of resolvers) {
    const spec = resolver(s);
    if (spec) return spec;
  }
  const m = s.metadata?.container;
  if (!m || typeof m !== "object") return null;
  const obj = m as { dropZone?: Bounds; padding?: number };
  if (!obj.dropZone) return null;
  const spec: ContainerSpec = obj.padding !== undefined
    ? { dropZone: obj.dropZone, padding: obj.padding }
    : { dropZone: obj.dropZone };
  return spec;
};

/**
 * World-coord drop-zone rect for the given container shape. Returns
 * `null` when the shape is not a container.
 */
export const getDropZoneWorld = (s: ShapeBase): Bounds | null => {
  const spec = getContainerSpec(s);
  if (!spec) return null;
  return {
    x: s.position.x + spec.dropZone.x,
    y: s.position.y + spec.dropZone.y,
    width: spec.dropZone.width,
    height: spec.dropZone.height,
  };
};

/**
 * Topmost container shape whose drop-zone contains `worldPoint`.
 * Walks layers top-down + shapes within layer top-down so the visually
 * topmost container wins. `exclude` lets the caller skip shapes being
 * dragged (a container can't drop onto itself / its own children).
 *
 * Nested containers: returns the innermost match — the deepest
 * container whose dropZone contains the point.
 */
export const findContainerAt = (
  scene: Scene,
  worldPoint: Vec2,
  exclude: ReadonlySet<ShapeId> = new Set(),
): Shape | null => {
  const layers = getLayersInOrder(scene);
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    if (!layer.visible) continue;
    const shapes = getShapesInLayer(scene, layer.id);
    for (let j = shapes.length - 1; j >= 0; j--) {
      const s = shapes[j]!;
      if (exclude.has(s.id)) continue;
      const zone = getDropZoneWorld(s);
      if (!zone) continue;
      if (B.contains(zone, worldPoint)) return s;
    }
  }
  return null;
};

/**
 * Compute the new local-space drop-zone bounds that fit `childWorld`.
 * Returns `null` when the child is already internal — no change needed.
 *
 * The returned rect is in local coordinates (relative to
 * `shape.position`), suitable to write back into `metadata.container`.
 * Padding inflates the new edge but is never subtracted from existing
 * edges — the zone only grows, never shrinks.
 */
export const expandDropZoneToFit = (
  container: ShapeBase,
  childWorld: Bounds,
): Bounds | null => {
  const spec = getContainerSpec(container);
  if (!spec) return null;
  const padding = spec.padding ?? 0;
  // Convert child world to container-local.
  const childLocal: Bounds = {
    x: childWorld.x - container.position.x,
    y: childWorld.y - container.position.y,
    width: childWorld.width,
    height: childWorld.height,
  };
  const z = spec.dropZone;
  const minX = Math.min(z.x, childLocal.x - padding);
  const minY = Math.min(z.y, childLocal.y - padding);
  const maxX = Math.max(z.x + z.width, childLocal.x + childLocal.width + padding);
  const maxY = Math.max(z.y + z.height, childLocal.y + childLocal.height + padding);
  if (
    minX === z.x &&
    minY === z.y &&
    maxX === z.x + z.width &&
    maxY === z.y + z.height
  ) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Required shape-level `width` / `height` (when present) that match
 * the new local drop-zone. Used by the editor after `expandDropZoneToFit`
 * to sync the container's visual with the expanded zone.
 * Preserves the existing dropZone offset within the shape — if the
 * dropZone didn't start at (0,0), the shape grows by exactly the amount
 * added to the dropZone, without shifting the offset.
 */
export const containerSizeForZone = (
  current: { width: number; height: number; spec: ContainerSpec },
  nextZone: Bounds,
): { width: number; height: number; positionOffset: Vec2 } => {
  const z = current.spec.dropZone;
  // The amount added on the left/top shifts the container's position,
  // and the dropZone moves back by the same amount so the shape-to-zone
  // offset stays the same.
  const dxLeft = z.x - nextZone.x;
  const dyTop = z.y - nextZone.y;
  const dxRight = nextZone.x + nextZone.width - (z.x + z.width);
  const dyBottom = nextZone.y + nextZone.height - (z.y + z.height);
  return {
    width: current.width + dxLeft + dxRight,
    height: current.height + dyTop + dyBottom,
    positionOffset: { x: -dxLeft, y: -dyTop },
  };
};
