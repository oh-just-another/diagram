import type { Vec2 } from "@oh-just-another/types";
import type { AnchorRef, NamedAnchor, StandardAnchor } from "./edge.js";
import type { ShapeBase } from "./shape.js";
import { getShapeLocalBounds } from "./shape.js";

/**
 * The 9 canonical named anchors every built-in shape exposes. They map to
 * the local bounding box of a shape — four corners, four edge centres, and
 * the geometric centre.
 *
 *   top-left ─── top ─── top-right
 *       │         │          │
 *      left ─── center ─── right
 *       │         │          │
 *  bottom-left ─ bottom ─ bottom-right
 *
 * `top` / `right` / `bottom` / `left` are the edge centres; `top-left` etc.
 * are the corners. Hosts may add custom anchors per shape via the
 * `anchors` field on `ShapeBase`.
 */
export const STANDARD_ANCHOR_RATIOS: Readonly<Record<StandardAnchor, Vec2>> = {
  "top-left": { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  right: { x: 1, y: 0.5 },
  "bottom-right": { x: 1, y: 1 },
  bottom: { x: 0.5, y: 1 },
  "bottom-left": { x: 0, y: 1 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
};

/** All 9 standard anchor names, in clockwise-from-top-left order. */
export const STANDARD_ANCHORS: readonly StandardAnchor[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "center",
];

/**
 * Resolve a named anchor to its *local-space* position inside the shape's
 * bounding box. Returns `undefined` if the name isn't a standard anchor
 * and isn't declared in the shape's own `anchors` map.
 *
 * Hosts looking up an `AnchorRef` should call `getAnchorLocal` /
 * `getAnchorWorld` instead — those handle every `AnchorRef` kind.
 */
export const getNamedAnchorLocal = (shape: ShapeBase, name: NamedAnchor): Vec2 | undefined => {
  const custom = shape.anchors?.[name];
  if (custom !== undefined) return resolveAnchorRefLocal(shape, custom);
  const standard = STANDARD_ANCHOR_RATIOS[name as StandardAnchor];
  if (!standard) return undefined;
  const b = getShapeLocalBounds(shape);
  return { x: b.x + b.width * standard.x, y: b.y + b.height * standard.y };
};

/**
 * Resolve any `AnchorRef` to a point in the shape's local coordinate
 * space (before `position` / `rotation` / `scale`). Throws on an unknown
 * named anchor — callers either pass a `ratio` / `absolute` ref or use a
 * registered standard / custom name.
 */
export const getAnchorLocal = (shape: ShapeBase, anchor: AnchorRef): Vec2 => {
  return resolveAnchorRefLocal(shape, anchor);
};

/**
 * Resolve any `AnchorRef` to a world-space point. Applies the shape's
 * `position` + `rotation` + `scale` to the local resolution from
 * `getAnchorLocal`.
 */
export const getAnchorWorld = (shape: ShapeBase, anchor: AnchorRef): Vec2 => {
  const local = getAnchorLocal(shape, anchor);
  const sx = local.x * shape.scale.x;
  const sy = local.y * shape.scale.y;
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  return {
    x: shape.position.x + (sx * cos - sy * sin),
    y: shape.position.y + (sx * sin + sy * cos),
  };
};

/**
 * Materialise the full anchor table for a shape — every standard anchor
 * plus every custom one declared in `shape.anchors`. Custom entries with
 * the same name as a standard anchor override the standard placement.
 * Returns *local-space* coordinates.
 *
 * Renderers that draw port-dots use this to enumerate the dots once per
 * frame instead of resolving each name individually.
 */
export const listAnchorsLocal = (shape: ShapeBase): ReadonlyMap<string, Vec2> => {
  const out = new Map<string, Vec2>();
  const b = getShapeLocalBounds(shape);
  for (const name of STANDARD_ANCHORS) {
    const ratio = STANDARD_ANCHOR_RATIOS[name];
    out.set(name, { x: b.x + b.width * ratio.x, y: b.y + b.height * ratio.y });
  }
  if (shape.anchors) {
    for (const [name, ref] of Object.entries(shape.anchors)) {
      out.set(name, resolveAnchorRefLocal(shape, ref));
    }
  }
  return out;
};

// --- internal ---

const resolveAnchorRefLocal = (shape: ShapeBase, anchor: AnchorRef): Vec2 => {
  switch (anchor.kind) {
    case "named": {
      const point = lookupNamed(shape, anchor.name);
      if (!point) {
        throw new Error(
          `Unknown anchor "${anchor.name}" on shape ${shape.id} (type ${shape.type}). ` +
            `Standard names: ${STANDARD_ANCHORS.join(", ")}; custom anchors live on shape.anchors.`,
        );
      }
      return point;
    }
    case "ratio": {
      const b = getShapeLocalBounds(shape);
      return { x: b.x + b.width * anchor.position.x, y: b.y + b.height * anchor.position.y };
    }
    case "absolute": {
      const b = getShapeLocalBounds(shape);
      return { x: b.x + anchor.offset.x, y: b.y + anchor.offset.y };
    }
  }
};

const lookupNamed = (shape: ShapeBase, name: NamedAnchor): Vec2 | undefined => {
  const custom = shape.anchors?.[name];
  if (custom !== undefined) {
    // Custom entry — resolve recursively (custom may itself be a ratio /
    // absolute ref). Recursion is bounded: anchors don't reference each
    // other by name (`kind: "named"` chains are not followed here).
    if (custom.kind === "named") return lookupNamed(shape, custom.name);
    return resolveAnchorRefLocal(shape, custom);
  }
  const standard = STANDARD_ANCHOR_RATIOS[name as StandardAnchor];
  if (!standard) return undefined;
  const b = getShapeLocalBounds(shape);
  return { x: b.x + b.width * standard.x, y: b.y + b.height * standard.y };
};
