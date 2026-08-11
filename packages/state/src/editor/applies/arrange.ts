import { bounds as B } from "@oh-just-another/math";
import {
  getElement,
  getElementWorldBounds,
  isGroup,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
import { arrangeUnits, translateUnit, unitsBounds } from "./arrange-units.js";

export type FlipAxis = "horizontal" | "vertical";

/** Which edge / centre line the selection aligns to within its bounding box. */
export type AlignEdge = "left" | "h-center" | "right" | "top" | "v-center" | "bottom";

/** Axis along which the selection is evenly distributed. */
export type DistributeAxis = "horizontal" | "vertical";

/** Press-time snapshot for a rotate gesture: each element's pristine pose. */
export type RotateOrigin = ReadonlyMap<ElementId, { position: Vec2; rotation: number }>;

/** World-space AABB enclosing every element in `elements` (assumed non-empty). */
const enclosingBounds = (elements: readonly Element[]): Bounds =>
  elements.map((el) => getElementWorldBounds(el)).reduce((acc, b) => B.union(acc, b));

/**
 * Pure: mirror the selection about its combined centre on the given axis.
 * Every visible member of every unit (a selected group mirrors as a whole:
 * its descendants reflect about the shared centre) has its position
 * reflected across the centre and its scale sign flipped on that axis, so
 * the content mirrors in place; size is unchanged. Mirroring a single
 * element flips it about its own centre. Edges bound to the moved elements
 * re-route from their endpoints; free links are left untouched.
 */
export const computeFlipPatches = (
  scene: Scene,
  ids: Iterable<ElementId>,
  axis: FlipAxis,
): Patch[] => {
  const units = arrangeUnits(scene, ids);
  if (units.length === 0) return [];
  const box = unitsBounds(units);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const horizontal = axis === "horizontal";

  const patches: Patch[] = [];
  const elements = units.flatMap((u) => u.members).filter((el) => !isGroup(el));
  for (const el of elements) {
    const after: Element = horizontal
      ? {
          ...el,
          position: { x: 2 * cx - el.position.x, y: el.position.y },
          scale: { x: -el.scale.x, y: el.scale.y },
        }
      : {
          ...el,
          position: { x: el.position.x, y: 2 * cy - el.position.y },
          scale: { x: el.scale.x, y: -el.scale.y },
        };
    patches.push({ kind: "element", id: el.id, before: el, after });
  }
  return patches;
};

/**
 * Pure: align every unit of the selection (a selected group counts as one
 * unit and moves as a whole) to the given edge / centre line of the
 * combined bounding box (e.g. `left` moves each unit so its left edge meets
 * the box's left edge; `h-center` lines up horizontal centres). Only the
 * relevant axis moves; sizes are unchanged. A no-op below two units.
 */
export const computeAlignPatches = (
  scene: Scene,
  ids: Iterable<ElementId>,
  edge: AlignEdge,
): Patch[] => {
  const units = arrangeUnits(scene, ids);
  if (units.length < 2) return [];
  const box = unitsBounds(units);

  const patches: Patch[] = [];
  for (const unit of units) {
    const b = unit.bounds;
    let dx = 0;
    let dy = 0;
    switch (edge) {
      case "left":
        dx = box.x - b.x;
        break;
      case "right":
        dx = box.x + box.width - (b.x + b.width);
        break;
      case "h-center":
        dx = box.x + box.width / 2 - (b.x + b.width / 2);
        break;
      case "top":
        dy = box.y - b.y;
        break;
      case "bottom":
        dy = box.y + box.height - (b.y + b.height);
        break;
      case "v-center":
        dy = box.y + box.height / 2 - (b.y + b.height / 2);
        break;
    }
    patches.push(...translateUnit(unit, dx, dy));
  }
  return patches;
};

/**
 * Pure: evenly space the selection's units along the given axis so the gaps
 * between adjacent units are equal (a selected group is one unit). The
 * outermost two stay put; the rest shift to balance the gaps (accounting for
 * differing sizes). A no-op below three units.
 */
export const computeDistributePatches = (
  scene: Scene,
  ids: Iterable<ElementId>,
  axis: DistributeAxis,
): Patch[] => {
  const units = arrangeUnits(scene, ids);
  if (units.length < 3) return [];
  const horizontal = axis === "horizontal";
  const start = (b: Bounds): number => (horizontal ? b.x : b.y);
  const size = (b: Bounds): number => (horizontal ? b.width : b.height);

  const sorted = units
    .map((unit) => ({ unit, b: unit.bounds }))
    .sort((p, q) => start(p.b) - start(q.b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const span = start(last.b) + size(last.b) - start(first.b);
  const totalSize = sorted.reduce((acc, p) => acc + size(p.b), 0);
  const gap = (span - totalSize) / (sorted.length - 1);

  const patches: Patch[] = [];
  let cursor = start(first.b) + size(first.b) + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const p = sorted[i];
    if (!p) continue;
    const delta = cursor - start(p.b);
    patches.push(...translateUnit(p.unit, horizontal ? delta : 0, horizontal ? 0 : delta));
    cursor += size(p.b) + gap;
  }
  return patches;
};

/**
 * Pure: rotate the snapshotted elements by `delta` radians about `pivot`. Each
 * element orbits the pivot (its `position` rotates around it) and its own
 * `rotation` advances by `delta`, so the whole selection turns rigidly. Driven
 * from a press-time {@link RotateOrigin} so the cumulative angle never drifts.
 */
export const computeRotatePatches = (
  scene: Scene,
  origin: RotateOrigin,
  pivot: Vec2,
  delta: number,
): Patch[] => {
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const patches: Patch[] = [];
  for (const [id, snap] of origin) {
    const el = getElement(scene, id);
    if (!el) continue;
    const dx = snap.position.x - pivot.x;
    const dy = snap.position.y - pivot.y;
    const after: Element = {
      ...el,
      position: { x: pivot.x + (dx * cos - dy * sin), y: pivot.y + (dx * sin + dy * cos) },
      rotation: snap.rotation + delta,
    };
    patches.push({ kind: "element", id, before: el, after });
  }
  return patches;
};

/** Centre of the world AABB enclosing `elements` — the natural rotation pivot. */
export const selectionCenter = (elements: readonly Element[]): Vec2 => {
  const box = enclosingBounds(elements);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
