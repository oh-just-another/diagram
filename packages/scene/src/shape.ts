import type { Bounds, FileId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import { bounds as B } from "@oh-just-another/math";
import type { AnchorRef } from "./edge.js";
import type { Style, TextStyle } from "./style.js";
import { TEXT_APPROX_CHAR_WIDTH_FACTOR, TEXT_LINE_HEIGHT_FACTOR } from "./constants.js";
import { getTextMeasurer } from "./text-measure.js";

/**
 * Fields shared by every shape variant. `order` is a fractional-index string
 * used for z-ordering within the parent layer — insertions are O(1) and never
 * require renumbering neighbors, which keeps history small and is conflict-free
 * under concurrent edits.
 */
export interface ElementBase {
  readonly id: ElementId;
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
   * `minHeight` if set). Defaults to `false`.
   */
  readonly noFlip?: boolean;

  /**
   * Custom named connection points on this shape, on top of the 9 standard
   * anchors (`top-left` / `top` / `top-right` / `right` / `bottom-right` /
   * `bottom` / `bottom-left` / `left` / `center`). Entries with a standard
   * name override the standard placement; new names add fresh ports.
   *
   * Values are `AnchorRef`s — `ratio` keeps the point proportional to the
   * shape's bounds, `absolute` pins it at a fixed pixel offset. Resolve
   * an anchor through `getAnchorLocal` / `getAnchorWorld`.
   */
  readonly anchors?: Readonly<Record<string, AnchorRef>>;

  /**
   * Optional parent shape id. When set, the shape is considered part of
   * the parent's group: hit-test and drag operations promote selection
   * to the parent (grouped), and `moveSelectionBy` translates every
   * descendant in lockstep. The kernel does not enforce a particular
   * shape type for parents — `GroupElement` (type `"group"`) is just the
   * default zero-render container; custom shape types can also act as
   * parents.
   */
  readonly parentId?: ElementId;

  /**
   * Frame membership — modern-style. Distinct from `parentId`
   * (which is for groups and containers). Children of a frame are
   * NOT nested in its `children` list; they're flat in the scene
   * but share `frameId === frame.id`. Move-by-drag of the frame
   * translates every shape with the matching frameId; export-by-
   * frame uses the frame's bounds as the crop region.
   */
  readonly frameId?: ElementId;

  /**
   * Per-shape lock flag. Locked shapes ignore all interactive gestures
   * (hit-test pretends they're not there for clicks / drags / resize),
   * but still render and remain serialisable. Propagates to
   * descendants: if any ancestor in the `parentId` chain is locked,
   * the shape is effectively locked. Use `isElementLocked(scene, shape)`
   * to consult the propagated state.
   *
   * Independent from `Layer.locked` — both gate interactions; either
   * one being true is enough to lock.
   */
  readonly locked?: boolean;

  /**
   * Per-shape visibility flag. Hidden shapes do not render and do not
   * receive interactions. Propagates to descendants like `locked`.
   * Use `isElementHidden(scene, shape)` to consult the propagated state.
   *
   * Independent from `Layer.visible` — either being false hides the
   * shape.
   */
  readonly hidden?: boolean;

  /**
   * Element-level hyperlink. Any shape — text, image,
   * rectangle — can carry one. The host opens it on Cmd/Ctrl-click or via
   * the hover link-popup. Stored verbatim; the host MUST validate the
   * scheme before navigating (only `http`/`https`/`mailto` — never
   * `javascript:`). Per-fragment links inside text are a separate
   * rich-text feature.
   */
  readonly href?: string;
}

export interface RectangleElement extends ElementBase {
  readonly type: "rectangle";
  readonly width: number;
  readonly height: number;
}

export interface EllipseElement extends ElementBase {
  readonly type: "ellipse";
  readonly width: number;
  readonly height: number;
}

export interface PolygonElement extends ElementBase {
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

export interface PathElement extends ElementBase {
  readonly type: "path";
  /** Commands in local coordinates. */
  readonly commands: readonly PathCommand[];
}

export interface TextElement extends ElementBase {
  readonly type: "text";
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  /** Width budget for wrapping; `undefined` = single line. */
  readonly maxWidth?: number;
  readonly style: TextStyle;
}

export interface ImageElement extends ElementBase {
  readonly type: "image";
  /**
   * URL or data-URI. Used for remote-host / SVG images that don't need
   * binary registration. Setting `fileId` instead points at a
   * `Scene.files` entry, which keeps scene.json small for large bitmaps.
   */
  readonly src: string;
  /**
   * Id of the `BinaryFile` in `Scene.files` that backs this image.
   * When present, hosts should resolve through the file registry
   * (creates an object-URL or ImageBitmap on demand); `src` stays
   * around as a fallback for the static renderer path.
   */
  readonly fileId?: FileId;
  readonly width: number;
  readonly height: number;
  /**
   * Animated-content hint (opt-in). When set, the
   * renderer's image path consults `getAnimationAdapter(kind)`
   * to fetch the current frame's image source instead of using
   * `src` directly. Hosts that don't register an adapter for the
   * kind get a static fallback (src as-is). The actual frame data
   * lives in `animationData` — opaque to the kernel, decoded by
   * the adapter.
   *
   * Built-in kinds: "gif" (host plugs `gifuct-js`), "lottie"
   * (host plugs `lottie-web`), "video" (host plugs an
   * `HTMLVideoElement`). No adapters ship in the kernel —
   * registration is per-host.
   */
  readonly animationKind?: string;
  readonly animationData?: unknown;
}

/**
 * Composite shape backed by a rich template (`@oh-just-another/templates`). The
 * scene stores only the binding (`templateId` + `data`) plus a fixed box
 * size — layout, hit-test and rendering live in the templates package.
 *
 * The kernel ships a basic bounder (uses `width` × `height`); the templates
 * package can re-register a tighter bounder that respects the layout engine.
 */
export interface TemplateElement extends ElementBase {
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

export interface BrushElement extends ElementBase {
  readonly type: "brush";
  readonly points: readonly BrushPoint[];
}

/**
 * Container shape that holds children via the shared `parentId` link.
 * Rendered as a no-op (the group itself has no visual); the editor's
 * overlay highlights the union AABB of the children when selected.
 */
export interface GroupElement extends ElementBase {
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
export interface FrameElement extends ElementBase {
  readonly type: "frame";
  readonly width: number;
  readonly height: number;
  /** Visible header label. */
  readonly name?: string;
}

/**
 * Filled arrow drawn as a single shape (body rectangle + triangular
 * head, optionally with a triangular tail). Distinct from an Link:
 * edges connect anchors and re-route on shape move; a BlockArrowElement
 * is a free-standing element with a fixed silhouette like a block-arrow icon.
 */
export interface BlockArrowElement extends ElementBase {
  readonly type: "block-arrow";
  readonly width: number;
  readonly height: number;
  /**
   * Where the arrow points. Default `"right"`. Rotation is still
   * applied on top via `ElementBase.rotation` — this enum just picks
   * the head side in local coords so the user can quickly toggle
   * direction without typing a 90/180/270 deg angle.
   */
  readonly direction?: "right" | "left" | "up" | "down";
  /** Ratio of the head length over the total length (0..0.9). Default 0.4. */
  readonly headRatio?: number;
  /** Ratio of the body thickness over the perpendicular dimension. Default 0.5. */
  readonly bodyThickness?: number;
}

export type BuiltinElement =
  | RectangleElement
  | EllipseElement
  | PolygonElement
  | PathElement
  | TextElement
  | ImageElement
  | TemplateElement
  | GroupElement
  | FrameElement
  | BlockArrowElement
  | BrushElement;

/**
 * Open shape type. `Element` accepts any `ElementBase` extension, which lets plugins
 * register their own types without amending this union. The kernel treats
 * unknown shape types via the bounder registry — see `registerBounder`.
 */
export type Element = BuiltinElement | ElementBase;

// --- type guards ---

export const isRectangle = (s: ElementBase): s is RectangleElement => s.type === "rectangle";
export const isEllipse = (s: ElementBase): s is EllipseElement => s.type === "ellipse";
export const isPolygon = (s: ElementBase): s is PolygonElement => s.type === "polygon";
export const isPath = (s: ElementBase): s is PathElement => s.type === "path";
export const isText = (s: ElementBase): s is TextElement => s.type === "text";
export const isImage = (s: ElementBase): s is ImageElement => s.type === "image";
export const isTemplate = (s: ElementBase): s is TemplateElement => s.type === "template";
export const isGroup = (s: ElementBase): s is GroupElement => s.type === "group";
export const isFrame = (s: ElementBase): s is FrameElement => s.type === "frame";
export const isBlockArrow = (s: ElementBase): s is BlockArrowElement => s.type === "block-arrow";
export const isBrush = (s: ElementBase): s is BrushElement => s.type === "brush";

// --- bounder registry ---

/**
 * Computes the *local* bounds of a shape — its AABB in local coordinates,
 * before `position`/`rotation`/`scale` are applied. The world AABB lives in
 * `getElementWorldBounds`.
 */
export type ElementBounder<S extends ElementBase = ElementBase> = (shape: S) => Bounds;

const bounderRegistry = new Map<string, ElementBounder>();

/**
 * Register a bounder for a custom shape type. Plugins call this once at module
 * load. The kernel ships bounders for every `BuiltinElement`.
 */
export const registerBounder = <S extends ElementBase>(
  type: S["type"],
  bounder: ElementBounder<S>,
): void => {
  bounderRegistry.set(type, bounder as ElementBounder);
};

/** Look up a registered bounder. Returns `undefined` for unknown shape types. */
export const getBounder = (type: string): ElementBounder | undefined => bounderRegistry.get(type);

/**
 * Local AABB for any shape with a registered bounder. Throws on unknown types
 * — callers should either register a bounder or filter unknown shapes out.
 */
export const getElementLocalBounds = (shape: ElementBase): Bounds => {
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
export const getElementWorldBounds = (shape: ElementBase): Bounds => {
  const local = getElementLocalBounds(shape);
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

registerBounder<RectangleElement>("rectangle", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<EllipseElement>("ellipse", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<PolygonElement>("polygon", (s) => B.fromPoints(s.points));

registerBounder<PathElement>("path", (s) => {
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

registerBounder<TextElement>("text", (s) => {
  // Width comes from the host measurer when installed (matches the
  // actually-rendered glyph advances), falling back to a geometric
  // estimate (`chars × fontSize × factor`) headless / in tests. Height
  // is line count × line-height; hard newlines honoured in both modes.
  const lineHeight = s.fontSize * TEXT_LINE_HEIGHT_FACTOR;
  const paragraphs = s.text.split("\n");
  const measurer = getTextMeasurer();
  // Pass weight/style so the measured width matches the rendered (bold /
  // italic) glyphs — otherwise the box wouldn't grow when text is bolded.
  const opts = {
    bold: s.style.fontWeight === "bold",
    italic: s.style.fontStyle === "italic",
  };
  const measureLine = (line: string): number => {
    if (measurer) {
      const w = measurer(line, s.fontFamily, s.fontSize, opts);
      if (w !== null) return w;
    }
    return line.length * s.fontSize * TEXT_APPROX_CHAR_WIDTH_FACTOR;
  };
  if (s.maxWidth === undefined) {
    // Auto-width: widest paragraph drives width, one visual line per
    // paragraph. Empty text keeps a caret-sized box so it stays
    // selectable / editable.
    let width = 0;
    for (const p of paragraphs) width = Math.max(width, measureLine(p));
    width = Math.max(width, s.fontSize * 0.5);
    return { x: 0, y: 0, width, height: Math.max(1, paragraphs.length) * lineHeight };
  }
  // Fixed-width: width is the budget; height ≈ wrapped line count.
  let lines = 0;
  for (const p of paragraphs) {
    lines += Math.max(1, Math.ceil(measureLine(p) / s.maxWidth));
  }
  return { x: 0, y: 0, width: s.maxWidth, height: Math.max(1, lines) * lineHeight };
});

registerBounder<ImageElement>("image", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

// Built-in template bounder: uses the explicit `width` × `height` box. The
// templates package can re-register a tighter bounder driven by the layout
// engine when an instance is auto-sized.
registerBounder<TemplateElement>("template", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<BrushElement>("brush", (s) => {
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
registerBounder<GroupElement>("group", () => ({ x: 0, y: 0, width: 0, height: 0 }));

registerBounder<FrameElement>("frame", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));

registerBounder<BlockArrowElement>("block-arrow", (s) => ({
  x: 0,
  y: 0,
  width: s.width,
  height: s.height,
}));
