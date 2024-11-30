import type { ShapeId, Vec2 } from "@oh-just-another/types";
import type { Scene } from "./scene.js";
import type { Shape } from "./shape.js";
import { getShape, getShapesInLayer } from "./queries.js";
import { updateShape, type OperationResult } from "./operations.js";
import { batch, type Patch } from "./patch.js";

/**
 * Pure layout function. Computes new positions for a subset of shapes
 * and returns a single batched patch (or null when nothing changed).
 *
 * Built-in layouts: `gridLayout`, `stackLayout`. Hosts can register
 * their own via the same signature; integrate with `Editor` through
 * a custom command.
 */
export interface LayoutSpec {
  readonly shapeIds: readonly ShapeId[];
  readonly origin?: Vec2;
}

export type LayoutFn<S extends LayoutSpec = LayoutSpec> = (scene: Scene, spec: S) => Patch | null;

export interface GridLayoutSpec extends LayoutSpec {
  readonly cols: number;
  /** Cell gap, world units. */
  readonly gap?: number;
}

/**
 * Position shapes on a regular grid. Each cell size = max shape
 * width/height in its column/row + gap. Stable order: by `shape.order`.
 */
export const gridLayout: LayoutFn<GridLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0 || spec.cols < 1) return null;
  const gap = spec.gap ?? 16;
  const origin = spec.origin ?? { x: 0, y: 0 };
  const shapes: Shape[] = [];
  for (const id of spec.shapeIds) {
    const s = getShape(scene, id);
    if (s) shapes.push(s);
  }
  shapes.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  const cellW = shapes.reduce(
    (m, s) => Math.max(m, "width" in s && typeof s.width === "number" ? s.width : 0),
    0,
  );
  const cellH = shapes.reduce(
    (m, s) => Math.max(m, "height" in s && typeof s.height === "number" ? s.height : 0),
    0,
  );
  const stride = { x: cellW + gap, y: cellH + gap };

  const patches: Patch[] = [];
  let working = scene;
  shapes.forEach((shape, i) => {
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    const target = { x: origin.x + col * stride.x, y: origin.y + row * stride.y };
    if (shape.position.x === target.x && shape.position.y === target.y) return;
    const r: OperationResult = updateShape(working, shape.id, (s) => ({ ...s, position: target }));
    working = r.scene;
    patches.push(r.patch);
  });
  if (patches.length === 0) return null;
  return batch(patches);
};

export interface StackLayoutSpec extends LayoutSpec {
  readonly direction: "horizontal" | "vertical";
  readonly gap?: number;
}

/** Position shapes top-to-bottom or left-to-right without wrapping. */
export const stackLayout: LayoutFn<StackLayoutSpec> = (scene, spec) => {
  if (spec.shapeIds.length === 0) return null;
  const gap = spec.gap ?? 16;
  const origin = spec.origin ?? { x: 0, y: 0 };
  const shapes: Shape[] = [];
  for (const id of spec.shapeIds) {
    const s = getShape(scene, id);
    if (s) shapes.push(s);
  }
  shapes.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  const patches: Patch[] = [];
  let working = scene;
  let cursor = { x: origin.x, y: origin.y };
  for (const shape of shapes) {
    const w = "width" in shape && typeof shape.width === "number" ? shape.width : 0;
    const h = "height" in shape && typeof shape.height === "number" ? shape.height : 0;
    if (shape.position.x !== cursor.x || shape.position.y !== cursor.y) {
      const target = cursor;
      const r = updateShape(working, shape.id, (s) => ({ ...s, position: target }));
      working = r.scene;
      patches.push(r.patch);
    }
    if (spec.direction === "horizontal") cursor = { x: cursor.x + w + gap, y: cursor.y };
    else cursor = { x: cursor.x, y: cursor.y + h + gap };
  }
  if (patches.length === 0) return null;
  return batch(patches);
};

/**
 * Convenience: list all shape ids in a layer in z-order, suitable
 * as `LayoutSpec.shapeIds`.
 */
export const allShapesInLayer = (scene: Scene, layerId: Scene["layers"] extends ReadonlyMap<infer K, unknown> ? K : never): readonly ShapeId[] =>
  getShapesInLayer(scene, layerId).map((s) => s.id);

// --- auto-layout container ---

/**
 * Declarative auto-layout spec stored on a parent shape's
 * `metadata.autoLayout`. Children of the parent (via `parentId`)
 * are arranged whenever the children set changes — see
 * `Editor.runLayout` for the host-side hook.
 *
 * Adding more layout kinds (tree, radial) means widening this union
 * and matching it in `runAutoLayout`. Hosts can ignore the union and
 * call `gridLayout` / `stackLayout` directly with custom spec.
 */
export type AutoLayoutSpec =
  | { readonly kind: "grid"; readonly cols: number; readonly gap?: number }
  | { readonly kind: "stack"; readonly direction: "horizontal" | "vertical"; readonly gap?: number };

/**
 * Parse and validate the `metadata.autoLayout` field on a shape.
 * Returns `null` when the shape has no auto-layout configured or the
 * stored payload doesn't match a known kind / required fields are
 * missing. Callers should treat `null` as "not an auto-layout
 * container — leave its children alone".
 */
export const getAutoLayoutSpec = (shape: Shape): AutoLayoutSpec | null => {
  const m = shape.metadata?.autoLayout;
  if (!m || typeof m !== "object") return null;
  const raw = m as { kind?: string; cols?: number; gap?: number; direction?: string };
  if (raw.kind === "grid") {
    if (typeof raw.cols !== "number" || raw.cols < 1) return null;
    return {
      kind: "grid",
      cols: raw.cols,
      ...(typeof raw.gap === "number" ? { gap: raw.gap } : {}),
    };
  }
  if (raw.kind === "stack") {
    if (raw.direction !== "horizontal" && raw.direction !== "vertical") return null;
    return {
      kind: "stack",
      direction: raw.direction,
      ...(typeof raw.gap === "number" ? { gap: raw.gap } : {}),
    };
  }
  return null;
};

/**
 * Run the parent shape's declared auto-layout against its direct
 * children. Returns a batched patch (or `null` when nothing
 * changed). Children are anchored at the parent's `position` —
 * containers with a richer drop-zone can compose this with a
 * custom origin.
 */
export const runAutoLayout = (scene: Scene, parentId: ShapeId): Patch | null => {
  const parent = getShape(scene, parentId);
  if (!parent) return null;
  const spec = getAutoLayoutSpec(parent);
  if (!spec) return null;
  const children: ShapeId[] = [];
  for (const s of scene.shapes.values()) {
    if (s.parentId === parentId) children.push(s.id);
  }
  if (children.length === 0) return null;
  const origin = parent.position;
  if (spec.kind === "grid") {
    return gridLayout(scene, {
      shapeIds: children,
      origin,
      cols: spec.cols,
      ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
    });
  }
  return stackLayout(scene, {
    shapeIds: children,
    origin,
    direction: spec.direction,
    ...(spec.gap !== undefined ? { gap: spec.gap } : {}),
  });
};
