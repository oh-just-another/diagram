import {
  addElement,
  addLink,
  getElement,
  getElementAt,
  getElementLocalBounds,
  orderForTop,
  updateElement,
  worldToLocal,
  type Element,
  type ImageCrop,
  type Link,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import { DEFAULT_EDGE_STYLE } from "@oh-just-another/tokens";
import type { Color, ElementId, LinkId, Vec2 } from "@oh-just-another/types";
import {
  DEFAULT_LINK_ARROWHEAD,
  DEFAULT_LINK_ROUTING,
  SPAWN_CONNECTED_GAP_PX,
} from "../../constants.js";

// ---------------------------------------------------------------------------
// F8 — Eyedropper: pick a colour from a shape on the canvas.
// ---------------------------------------------------------------------------

/**
 * The style colour of the top-most shape under `point`, or `null` when the
 * point is empty. `role` chooses which channel to sample: `"fill"` (default)
 * falls back to the stroke when there is no fill, and `"stroke"` the other way
 * round — so clicking a stroke-only outline still yields a usable colour.
 */
export const pickColorAt = (
  scene: Scene,
  point: Vec2,
  role: "fill" | "stroke" = "fill",
): Color | null => {
  const el = getElementAt(scene, point);
  if (el === undefined) return null;
  const { fill, stroke } = el.style;
  const primary = role === "fill" ? fill : stroke;
  const secondary = role === "fill" ? stroke : fill;
  return primary ?? secondary ?? null;
};

// ---------------------------------------------------------------------------
// F9 — Convert element type (rectangle ↔ ellipse ↔ diamond/polygon).
// ---------------------------------------------------------------------------

/** Target types accepted by {@link computeConvertType}. `"polygon"` = diamond. */
export type ConvertTarget = "rectangle" | "ellipse" | "polygon";

/** The convertible built-in types (share a width×height footprint). */
const CONVERTIBLE = new Set(["rectangle", "ellipse", "polygon"]);

/** Diamond corner points inscribed in a `w × h` box, anchored at the origin. */
const diamondPoints = (w: number, h: number): readonly Vec2[] => [
  { x: w / 2, y: 0 },
  { x: w, y: h / 2 },
  { x: w / 2, y: h },
  { x: 0, y: h / 2 },
];

/**
 * Convert every convertible shape in `ids` to `target`, preserving
 * position / rotation / scale / style and the on-canvas footprint. rectangle
 * and ellipse carry `width` × `height`; `"polygon"` renders a diamond
 * inscribed in that box. Shapes already of the target type, and non-convertible
 * types (text, image, …), are skipped. One undo step (batched for 2+). Returns
 * `null` when nothing changed.
 */
export const computeConvertType = (
  scene: Scene,
  ids: Iterable<ElementId>,
  target: ConvertTarget,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  let s = scene;
  const patches: Patch[] = [];
  for (const id of ids) {
    const el = getElement(s, id);
    if (el === undefined || !CONVERTIBLE.has(el.type) || el.type === target) continue;
    const local = getElementLocalBounds(el);
    const w = local.width;
    const h = local.height;
    const r = updateElement(s, id, (sh) => {
      // Drop the source-shape-specific geometry fields so the result is a
      // clean shape of the target type (no stale `points` / `width`).
      const {
        width: _w,
        height: _h,
        points: _p,
        ...rest
      } = sh as unknown as Record<string, unknown>;
      void _w;
      void _h;
      void _p;
      const next =
        target === "polygon"
          ? { ...rest, type: "polygon", points: diamondPoints(w, h) }
          : { ...rest, type: target, width: w, height: h };
      return next as unknown as typeof sh;
    });
    s = r.scene;
    patches.push(r.patch);
  }
  const first = patches[0];
  if (first === undefined) return null;
  return { scene: s, patch: patches.length === 1 ? first : { kind: "batch", patches } };
};

// ---------------------------------------------------------------------------
// F10 — Image crop model helpers.
// ---------------------------------------------------------------------------

/** Clamp a crop rect into the valid `[0,1]` normalised range (non-empty). */
export const clampCrop = (crop: ImageCrop): ImageCrop => {
  const x = Math.min(Math.max(crop.x, 0), 1);
  const y = Math.min(Math.max(crop.y, 0), 1);
  const width = Math.min(Math.max(crop.width, 0), 1 - x);
  const height = Math.min(Math.max(crop.height, 0), 1 - y);
  return { x, y, width, height };
};

/** True when two optional crops describe the same region (or both absent). */
const sameCrop = (a: ImageCrop | undefined, b: ImageCrop | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
};

/**
 * Set (or clear, with `null`) the normalised crop of the image `id`. No-op
 * (returns `null`) when the shape is missing or not an image, or when the
 * crop is unchanged. Setting a full-image crop (`0,0,1,1`) clears the field.
 */
export const computeSetImageCrop = (
  scene: Scene,
  id: ElementId,
  crop: ImageCrop | null,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const el = getElement(scene, id);
  if (el?.type !== "image") return null;
  let next: ImageCrop | undefined;
  if (crop !== null) {
    const c = clampCrop(crop);
    const isFull = c.x === 0 && c.y === 0 && c.width === 1 && c.height === 1;
    next = isFull ? undefined : c;
  }
  const current = (el as { readonly crop?: ImageCrop }).crop;
  if (sameCrop(next, current)) {
    return null;
  }
  const r = updateElement(scene, id, (sh) => {
    const { crop: _drop, ...rest } = sh as unknown as Record<string, unknown>;
    void _drop;
    return (next === undefined ? rest : { ...rest, crop: next }) as unknown as typeof sh;
  });
  return { scene: r.scene, patch: r.patch };
};

/**
 * Normalised crop rect covering the whole image. Equivalent to no crop.
 */
export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

/**
 * Map a two-point world-space drag to a normalised crop rect for `image`,
 * clamped to `[0,1]`. Points are projected into the image's local frame
 * (honouring rotation / scale) and divided by the element's `width` × `height`.
 */
export const cropRectFromWorldDrag = (image: Element, a: Vec2, b: Vec2): ImageCrop => {
  const box = getElementLocalBounds(image);
  const la = worldToLocal(image, a);
  const lb = worldToLocal(image, b);
  const w = box.width || 1;
  const h = box.height || 1;
  const nx0 = (la.x - box.x) / w;
  const ny0 = (la.y - box.y) / h;
  const nx1 = (lb.x - box.x) / w;
  const ny1 = (lb.y - box.y) / h;
  return clampCrop({
    x: Math.min(nx0, nx1),
    y: Math.min(ny0, ny1),
    width: Math.abs(nx1 - nx0),
    height: Math.abs(ny1 - ny0),
  });
};

// ---------------------------------------------------------------------------
// F11 — Flowchart auto-generation: spawn a connected node in a direction.
// ---------------------------------------------------------------------------

export type SpawnDirection = "left" | "right" | "up" | "down";

/**
 * Create a clone of `sourceId` offset by {@link SPAWN_CONNECTED_GAP_PX} in
 * `direction`, plus a link from the source to the new node. The clone keeps the
 * source's type, size, style and rotation. Returns the next scene, both patches
 * (element add + link add), and the new ids; `null` when the source is missing.
 */
export const computeSpawnConnectedNode = (
  scene: Scene,
  sourceId: ElementId,
  direction: SpawnDirection,
  newElementId: ElementId,
  newLinkId: LinkId,
): {
  readonly scene: Scene;
  readonly patches: readonly Patch[];
  readonly newElementId: ElementId;
  readonly linkId: LinkId;
} | null => {
  const source = getElement(scene, sourceId);
  if (source === undefined) return null;
  const local = getElementLocalBounds(source);
  const w = local.width * source.scale.x;
  const h = local.height * source.scale.y;
  const dx =
    direction === "right"
      ? w + SPAWN_CONNECTED_GAP_PX
      : direction === "left"
        ? -(w + SPAWN_CONNECTED_GAP_PX)
        : 0;
  const dy =
    direction === "down"
      ? h + SPAWN_CONNECTED_GAP_PX
      : direction === "up"
        ? -(h + SPAWN_CONNECTED_GAP_PX)
        : 0;
  const order = orderForTop(
    [...scene.elements.values()].filter((e) => e.layerId === source.layerId).map((e) => e.order),
  );
  // Clone the source, detaching any group / frame membership so the spawned
  // node is free-standing.
  const { parentId: _p, frameId: _f, ...bare } = source;
  void _p;
  void _f;
  const clone = {
    ...bare,
    id: newElementId,
    position: { x: source.position.x + dx, y: source.position.y + dy },
    order,
  } as Element;
  const addEl = addElement(scene, clone);
  const link: Link = {
    id: newLinkId,
    layerId: source.layerId,
    from: { kind: "floating", elementId: sourceId },
    to: { kind: "floating", elementId: newElementId },
    order: orderForTop(
      [...addEl.scene.links.values()]
        .filter((e) => e.layerId === source.layerId)
        .map((e) => e.order),
    ),
    routing: DEFAULT_LINK_ROUTING,
    style: { ...DEFAULT_EDGE_STYLE },
    arrowheads: { to: DEFAULT_LINK_ARROWHEAD },
  };
  const addEdge = addLink(addEl.scene, link);
  return {
    scene: addEdge.scene,
    patches: [addEl.patch, addEdge.patch],
    newElementId,
    linkId: newLinkId,
  };
};
