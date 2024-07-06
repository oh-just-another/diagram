import type { Bounds, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import { bounds as B } from "@oh-just-another/math";
import type { Style, TextStyle } from "./style";

/**
 * Fields shared by every shape variant. `order` is a fractional-index string
 * used for z-ordering within the parent layer — insertions are O(1) and never
 * require renumbering neighbors, which keeps history small and is conflict-free
 * under concurrent edits.
 */
export interface ShapeBase {
  readonly id: ShapeId;
  readonly layerId: LayerId;
  /** Discriminator. Built-in shapes use the literal types declared below. */
  readonly type: string;
  /** Local-space origin. The shape is rotated/scaled around this point. */
  readonly position: Vec2;
  /** Rotation in radians, counter-clockwise. */
  readonly rotation: number;
  readonly scale: Vec2;
  /** Z-order key within `layerId`. */
  readonly order: FractionalIndex;
  readonly style: Style;
  /** Free-form metadata for plugins; the kernel never reads from here. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RectangleShape extends ShapeBase {
  readonly type: "rectangle";
  readonly width: number;
  readonly height: number;
}

export interface EllipseShape extends ShapeBase {
  readonly type: "ellipse";
  readonly width: number;
  readonly height: number;
}

export interface PolygonShape extends ShapeBase {
  readonly type: "polygon";
  /** Closed polygon in local coordinates (origin = `position`). */
  readonly points: readonly Vec2[];
}

export type PathCommand =
  | { readonly kind: "M"; readonly to: Vec2 }
  | { readonly kind: "L"; readonly to: Vec2 }
  | { readonly kind: "Q"; readonly control: Vec2; readonly to: Vec2 }
  | { readonly kind: "C"; readonly control1: Vec2; readonly control2: Vec2; readonly to: Vec2 }
  | { readonly kind: "Z" };

export interface PathShape extends ShapeBase {
  readonly type: "path";
  /** Commands in local coordinates. */
  readonly commands: readonly PathCommand[];
}

export interface TextShape extends ShapeBase {
  readonly type: "text";
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  /** Width budget for wrapping; `undefined` = single line. */
  readonly maxWidth?: number;
  readonly style: TextStyle;
}

export interface ImageShape extends ShapeBase {
  readonly type: "image";
  /** URL or data-URI. The kernel does not load the resource. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export type BuiltinShape =
  | RectangleShape
  | EllipseShape
  | PolygonShape
  | PathShape
  | TextShape
  | ImageShape;

/**
 * Open shape type. `Shape` accepts any `ShapeBase` extension, which lets plugins
 * register their own types without amending this union. The kernel treats
 * unknown shape types via the bounder registry — see `registerBounder`.
 */
export type Shape = BuiltinShape | ShapeBase;

// --- type guards ---

export const isRectangle = (s: ShapeBase): s is RectangleShape => s.type === "rectangle";
export const isEllipse = (s: ShapeBase): s is EllipseShape => s.type === "ellipse";
export const isPolygon = (s: ShapeBase): s is PolygonShape => s.type === "polygon";
export const isPath = (s: ShapeBase): s is PathShape => s.type === "path";
export const isText = (s: ShapeBase): s is TextShape => s.type === "text";
export const isImage = (s: ShapeBase): s is ImageShape => s.type === "image";

// --- bounder registry ---

/**
 * Computes the *local* bounds of a shape — its AABB in local coordinates,
 * before `position`/`rotation`/`scale` are applied. The world AABB lives in
 * `getShapeWorldBounds`.
 */
export type ShapeBounder<S extends ShapeBase = ShapeBase> = (shape: S) => Bounds;

const bounderRegistry = new Map<string, ShapeBounder>();

/**
 * Register a bounder for a custom shape type. Plugins call this once at module
 * load. The kernel ships bounders for every `BuiltinShape`.
 */
export const registerBounder = <S extends ShapeBase>(
  type: S["type"],
  bounder: ShapeBounder<S>,
): void => {
  bounderRegistry.set(type, bounder as ShapeBounder);
};

/** Look up a registered bounder. Returns `undefined` for unknown shape types. */
export const getBounder = (type: string): ShapeBounder | undefined => bounderRegistry.get(type);

/**
 * Local AABB for any shape with a registered bounder. Throws on unknown types
 * — callers should either register a bounder or filter unknown shapes out.
 */
export const getShapeLocalBounds = (shape: ShapeBase): Bounds => {
  const bounder = bounderRegistry.get(shape.type);
  if (!bounder) {
    throw new Error(`No bounder registered for shape type: ${shape.type}`);
  }
  return bounder(shape);
};

/**
 * World-space AABB after `position`/`rotation`/`scale`. This is the conservative
 * AABB of the rotated/scaled local box, suitable for spatial-index keys.
 */
export const getShapeWorldBounds = (shape: ShapeBase): Bounds => {
  const local = getShapeLocalBounds(shape);
  // Transform 4 corners then re-AABB.
  const corners: readonly Vec2[] = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x, y: local.y + local.height },
    { x: local.x + local.width, y: local.y + local.height },
  ];
  const sin = Math.sin(shape.rotation);
  const cos = Math.cos(shape.rotation);
  const transformed = corners.map((p) => {
    const sx = p.x * shape.scale.x;
    const sy = p.y * shape.scale.y;
    return {
      x: shape.position.x + (sx * cos - sy * sin),
      y: shape.position.y + (sx * sin + sy * cos),
    };
  });
  return B.fromPoints(transformed);
};

// --- built-in bounders ---

registerBounder<RectangleShape>("rectangle", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<EllipseShape>("ellipse", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<PolygonShape>("polygon", (s) => B.fromPoints(s.points));

registerBounder<PathShape>("path", (s) => {
  const points: Vec2[] = [];
  let cursor: Vec2 = { x: 0, y: 0 };
  for (const cmd of s.commands) {
    switch (cmd.kind) {
      case "M":
      case "L":
        points.push(cmd.to);
        cursor = cmd.to;
        break;
      case "Q":
        points.push(cmd.control, cmd.to);
        cursor = cmd.to;
        break;
      case "C":
        points.push(cmd.control1, cmd.control2, cmd.to);
        cursor = cmd.to;
        break;
      case "Z":
        // closes the subpath, no new points
        break;
    }
  }
  // suppress unused-var warning
  void cursor;
  return B.fromPoints(points);
});

registerBounder<TextShape>("text", (s) => {
  // Rough estimate without a layout engine: width = max chars × font width, height
  // = lines × line-height. Renderers provide a precise box during layout.
  const approxCharWidth = s.fontSize * 0.6;
  const width = s.maxWidth ?? s.text.length * approxCharWidth;
  const lines = s.maxWidth
    ? Math.max(1, Math.ceil((s.text.length * approxCharWidth) / s.maxWidth))
    : 1;
  return { x: 0, y: 0, width, height: lines * s.fontSize * 1.2 };
});

registerBounder<ImageShape>("image", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));
