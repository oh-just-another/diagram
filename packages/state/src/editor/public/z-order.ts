import {
  getShape,
  orderBetweenMany,
  orderForBottom,
  orderForTop,
  updateEdge,
  updateShape,
  type FractionalIndex,
  type Scene,
  type Patch,
} from "@oh-just-another/scene";
import type { LayerId, ShapeId } from "@oh-just-another/types";

/**
 * Pick the target shape for a single-shape z-order command. Defaults
 * to the lone selected shape when `id` is omitted; null when neither
 * path resolves.
 */
const resolveTarget = (
  scene: Scene,
  id: ShapeId | undefined,
  selection: ReadonlySet<ShapeId>,
): ShapeId | null => {
  const target = id ?? (selection.size === 1 ? [...selection][0] ?? null : null);
  if (!target) return null;
  return scene.shapes.has(target) ? target : null;
};

/** Move a shape to the top of its layer. */
export const computeBringToFront = (
  scene: Scene,
  id: ShapeId | undefined,
  selection: ReadonlySet<ShapeId>,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const targetId = resolveTarget(scene, id, selection);
  if (!targetId) return null;
  const shape = getShape(scene, targetId);
  if (!shape) return null;
  const order = orderForTop(
    [...scene.shapes.values()]
      .filter((s) => s.layerId === shape.layerId && s.id !== shape.id)
      .map((s) => s.order),
  );
  if (order === shape.order) return null;
  const r = updateShape(scene, shape.id, (s) => ({ ...s, order }));
  return { scene: r.scene, patch: r.patch };
};

/** Move a shape to the bottom of its layer. */
export const computeSendToBack = (
  scene: Scene,
  id: ShapeId | undefined,
  selection: ReadonlySet<ShapeId>,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const targetId = resolveTarget(scene, id, selection);
  if (!targetId) return null;
  const shape = getShape(scene, targetId);
  if (!shape) return null;
  const order = orderForBottom(
    [...scene.shapes.values()]
      .filter((s) => s.layerId === shape.layerId && s.id !== shape.id)
      .map((s) => s.order),
  );
  if (order === shape.order) return null;
  const r = updateShape(scene, shape.id, (s) => ({ ...s, order }));
  return { scene: r.scene, patch: r.patch };
};

/**
 * Rewrite the `order` field of every entity in `entities` to the i-th
 * key of `orderBetweenMany(null, null, n)`. Returns the count of
 * entities whose order actually changed.
 *
 * `apply` is the side-effect callback — the caller threads scene + tx
 * through it.
 */
export const rewriteOrders = <T extends { readonly order: FractionalIndex }>(
  entities: readonly T[],
  apply: (entity: T, order: FractionalIndex) => void,
): number => {
  if (entities.length === 0) return 0;
  const sorted = [...entities].sort((a, b) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
  );
  const fresh = orderBetweenMany(null, null, sorted.length);
  let changed = 0;
  sorted.forEach((entity, i) => {
    const next = fresh[i]!;
    if (next === entity.order) return;
    apply(entity, next);
    changed++;
  });
  return changed;
};

/**
 * Run `rewriteOrders` over shapes + edges of every requested layer,
 * mutating the scene through the supplied `mutate` callback. Caller
 * owns transaction lifecycle and final notify.
 */
export const compactLayerZOrderPatches = (
  scene: Scene,
  layerIds: readonly LayerId[],
  mutate: (
    nextScene: Scene,
    patch: Patch,
  ) => void,
): number => {
  let s = scene;
  let touched = 0;
  for (const lid of layerIds) {
    touched += rewriteOrders(
      [...s.shapes.values()].filter((sh) => sh.layerId === lid),
      (shape, order) => {
        const r = updateShape(s, shape.id, (sh) => ({ ...sh, order }));
        s = r.scene;
        mutate(s, r.patch);
      },
    );
    touched += rewriteOrders(
      [...s.edges.values()].filter((e) => e.layerId === lid),
      (edge, order) => {
        const r = updateEdge(s, edge.id, (e) => ({ ...e, order }));
        s = r.scene;
        mutate(s, r.patch);
      },
    );
  }
  return touched;
};
