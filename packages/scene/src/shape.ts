import type { Bounds, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import { bounds as B } from "@oh-just-another/math";
import type { AnchorRef } from "./edge.js";
import type { Style, TextStyle } from "./style.js";

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

  /**
   * Interactive-resize size constraints in local pixels. The editor clamps
   * the shape's width/height into [min, max] after every resize gesture.
   * Omitted = no constraint on that axis.
   */
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;

  /**
   * If true, interactive resize is prevented from dragging through the
   * opposite edge — the shape cannot be mirrored by overshooting a handle.
   * `width` / `height` are clamped to a non-negative range (or `minWidth` /
   * `minHeight` if set). Defaults to `false` for backward compatibility.
   */
  readonly noFlip?: boolean;

  /**
   * Custom named connection points on this shape, on top of the 9 standard
   * anchors (`top-left` / `top` / `top-right` / `right` / `bottom-right` /
   * `bottom` / `bottom-left` / `left` / `center`). Entries with a standard
   * name override the standard placement; new names add fresh ports.
   *
   * Values are `AnchorRef`s — `ratio` keeps the point proportional to the
   * shape's bounds, `absolute` pins it at a fixed pixel offset. Resolving
   * an anchor is `getAnchorLocal` / `getAnchorWorld` in `./anchors.ts`.
   */
  readonly anchors?: Readonly<Record<string, AnchorRef>>;

  /**
   * Optional parent shape id. When set, the shape is considered part of
   * the parent's group: hit-test and drag operations promote selection
   * to the parent (grouped), and `moveSelectionBy` translates every
   * descendant in lockstep. The kernel does not enforce a particular
   * shape type for parents — `GroupShape` (type `"group"`) is just the
   * default zero-render container; custom shape types can also act as
   * parents.
   */
  readonly parentId?: ShapeId;

  /**
   * Frame membership — modern-style. Distinct from `parentId`
   * (which is for groups and containers). Children of a frame are
   * NOT nested in its `children` list; they're flat in the scene
   * but share `frameId === frame.id`. Move-by-drag of the frame
   * translates every shape with the matching frameId; export-by-
   * frame uses the frame's bounds as the crop region.
   */
  readonly frameId?: ShapeId;

  /**
   * Per-shape lock flag. Locked shapes ignore all interactive gestures
   * (hit-test pretends they're not there for clicks / drags / resize),
   * but still render and remain serialisable. Propagates to
   * descendants: if any ancestor in the `parentId` chain is locked,
   * the shape is effectively locked. Use `isShapeLocked(scene, shape)`
   * to consult the propagated state.
   *
   * Independent from `Layer.locked` — both gate interactions; either
   * one being true is enough to lock.
   */
  readonly locked?: boolean;

  /**
   * Per-shape visibility flag. Hidden shapes do not render and do not
   * receive interactions. Propagates to descendants like `locked`.
   * Use `isShapeHidden(scene, shape)` to consult the propagated state.
   *
   * Independent from `Layer.visible` — either being false hides the
   * shape.
   */
  readonly hidden?: boolean;
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

/**
 * Composite shape backed by a rich template (`@oh-just-another/templates`). The
 * scene stores only the binding (`templateId` + `data`) plus a fixed box
 * size — layout, hit-test and rendering live in the templates package.
 *
 * The kernel ships a basic bounder (uses `width` × `height`); the templates
 * package can re-register a tighter bounder that respects the layout engine.
 */
export interface TemplateShape extends ShapeBase {
  readonly type: "template";
  readonly templateId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly width: number;
  readonly height: number;
}

/**
 * Variable-width brush stroke. Each `BrushPoint` carries its own width
 * (typically derived from `PointerEvent.pressure × MAX_BRUSH_WIDTH`).
 * The renderer interpolates between consecutive widths along the path.
 *
 * Coordinates are local; the shape's `position` / `rotation` / `scale`
 * apply on top, same as any other shape variant.
 */
export interface BrushPoint {
  readonly x: number;
  readonly y: number;
  /** Stroke half-width in local pixels at this vertex. */
  readonly width: number;
}

export interface BrushShape extends ShapeBase {
  readonly type: "brush";
  readonly points: readonly BrushPoint[];
}

/**
 * Container shape that holds children via the shared `parentId` link.
 * Rendered as a no-op (the group itself has no visual); the editor's
 * overlay highlights the union AABB of the children when selected.
 */
export interface GroupShape extends ShapeBase {
  readonly type: "group";
}

/**
 * Frame element — modern-style visual container that groups
 * shapes via a separate `frameId` link (NOT `parentId`). Drawn as
 * a dashed rectangle with a header title; clicks pass through to
 * children. Move-by-drag translates every shape whose `frameId`
 * matches; the export pipeline can crop to the frame's bounds.
 *
 * Auto-numbering: the editor picks the next free "Frame N" on
 * create. Custom `name` overrides.
 */
export interface FrameShape extends ShapeBase {
  readonly type: "frame";
  readonly width: number;
  readonly height: number;
  /** Visible header label. */
  readonly name?: string;
}

/**
 * Filled arrow drawn as a single shape (body rectangle + triangular
 * head, optionally with a triangular tail). Distinct from an Edge:
 * edges connect anchors and re-route on shape move; a BlockArrowShape
 * is a free-standing element with a fixed silhouette like a block-arrow icon.
 */
export interface BlockArrowShape extends ShapeBase {
  readonly type: "block-arrow";
  readonly width: number;
  readonly height: number;
  /**
   * Where the arrow points. Default `"right"`. Rotation is still
   * applied on top via `ShapeBase.rotation` — this enum just picks
   * the head side in local coords so the user can quickly toggle
   * direction without typing a 90/180/270 deg angle.
   */
  readonly direction?: "right" | "left" | "up" | "down";
  /** Ratio of the head length over the total length (0..0.9). Default 0.4. */
  readonly headRatio?: number;
  /** Ratio of the body thickness over the perpendicular dimension. Default 0.5. */
  readonly bodyThickness?: number;
}

export type BuiltinShape =
  | RectangleShape
  | EllipseShape
  | PolygonShape
  | PathShape
  | TextShape
  | ImageShape
  | TemplateShape
  | GroupShape
  | FrameShape
  | BlockArrowShape
  | BrushShape;

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
export const isTemplate = (s: ShapeBase): s is TemplateShape => s.type === "template";
export const isGroup = (s: ShapeBase): s is GroupShape => s.type === "group";
export const isFrame = (s: ShapeBase): s is FrameShape => s.type === "frame";
export const isBlockArrow = (s: ShapeBase): s is BlockArrowShape =>
  s.type === "block-arrow";
export const isBrush = (s: ShapeBase): s is BrushShape => s.type === "brush";

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

// Built-in template bounder: uses the explicit `width` × `height` box. The
// templates package can re-register a tighter bounder driven by the layout
// engine when an instance is auto-sized.
registerBounder<TemplateShape>("template", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<BrushShape>("brush", (s) => {
  if (s.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    if (p.x - p.width < minX) minX = p.x - p.width;
    if (p.y - p.width < minY) minY = p.y - p.width;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.width > maxY) maxY = p.y + p.width;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
});

// Group shapes have no intrinsic geometry — their world AABB is empty.
// Callers that need the union of descendants must walk `parentId` via
// `getChildrenOf` and union the children's world bounds instead.
registerBounder<GroupShape>("group", () => ({ x: 0, y: 0, width: 0, height: 0 }));

registerBounder<FrameShape>("frame", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<BlockArrowShape>("block-arrow", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));
