import {
  addElement,
  addLink,
  getElement,
  getElementAt,
  getElementLocalBounds,
  localToWorld,
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
import type { Bounds, Color, ElementId, LinkId, Vec2 } from "@oh-just-another/types";
import {
  CROP_MIN_SIZE,
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

// --- Excalidraw-style handle cropping (virtual full-image geometry) --------

/** The 8 crop-frame handles: 4 corners + 4 edge midpoints. */
export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Ordered so corner handles win a tie against the adjacent edge midpoints. */
export const CROP_HANDLES: readonly CropHandle[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];

const clampNum = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Local-space rect the WHOLE (uncropped) bitmap would occupy, aligned so its
 * current crop-window equals the element's box `{0,0,width,height}`. The
 * element currently shows the sub-rectangle `crop` of this virtual full image.
 * Used to draw the crop ghost and to clamp handle drags to the image extent.
 */
export const cropFullImageLocalRect = (el: Element, crop: ImageCrop): Bounds => {
  const box = getElementLocalBounds(el);
  const cw = crop.width || 1;
  const ch = crop.height || 1;
  const fullW = box.width / cw;
  const fullH = box.height / ch;
  return {
    x: box.x - crop.x * fullW,
    y: box.y - crop.y * fullH,
    width: fullW,
    height: fullH,
  };
};

/**
 * World-space positions of the 8 crop handles for the element's current box
 * `{0,0,width,height}` (the visible crop window). Honours rotation / scale via
 * `localToWorld`. The window always equals the element bounds, so the crop
 * fraction is not needed here — pass the (pending) element whose `width` /
 * `height` / `position` describe the window.
 */
export const cropHandleWorldPoints = (el: Element): Record<CropHandle, Vec2> => {
  const box = getElementLocalBounds(el);
  const { x, y, width: w, height: h } = box;
  const L = (lx: number, ly: number): Vec2 => localToWorld(el, { x: lx, y: ly });
  return {
    nw: L(x, y),
    n: L(x + w / 2, y),
    ne: L(x + w, y),
    e: L(x + w, y + h / 2),
    se: L(x + w, y + h),
    s: L(x + w / 2, y + h),
    sw: L(x, y + h),
    w: L(x, y + h / 2),
  };
};

const edgesOf = (
  handle: CropHandle,
): { west: boolean; east: boolean; north: boolean; south: boolean } => ({
  west: handle === "nw" || handle === "w" || handle === "sw",
  east: handle === "ne" || handle === "e" || handle === "se",
  north: handle === "nw" || handle === "n" || handle === "ne",
  south: handle === "sw" || handle === "s" || handle === "se",
});

/**
 * Result of a crop handle / body drag: the pending normalised `crop` plus the
 * element's new world `position` and local `width` × `height`. Rotation / scale
 * are unchanged, so the caller keeps them.
 */
export interface CropDragResult {
  readonly crop: ImageCrop;
  readonly position: Vec2;
  readonly width: number;
  readonly height: number;
}

/**
 * Drag one crop handle to `worldPoint`. Moves the window edge(s) that handle
 * controls (the opposite edge stays fixed), clamped so the window stays inside
 * the virtual full image and never shrinks below {@link CROP_MIN_SIZE}. The
 * source is never stretched: shrinking the window hides pixels rather than
 * scaling them. `el` must be the ORIGINAL (unmutated) element so the reference
 * frame stays stable across a multi-move drag.
 */
export const computeCropHandleDrag = (
  el: Element,
  crop: ImageCrop,
  handle: CropHandle,
  worldPoint: Vec2,
): CropDragResult => {
  const full = cropFullImageLocalRect(el, crop);
  const box = getElementLocalBounds(el);
  const p = worldToLocal(el, worldPoint);
  // Current window edges (window == element box in the original local frame).
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  const { west, east, north, south } = edgesOf(handle);
  const fullRight = full.x + full.width;
  const fullBottom = full.y + full.height;
  if (west) left = clampNum(p.x, full.x, right - CROP_MIN_SIZE);
  if (east) right = clampNum(p.x, left + CROP_MIN_SIZE, fullRight);
  if (north) top = clampNum(p.y, full.y, bottom - CROP_MIN_SIZE);
  if (south) bottom = clampNum(p.y, top + CROP_MIN_SIZE, fullBottom);
  const win = { x: left, y: top, width: right - left, height: bottom - top };
  const nextCrop = clampCrop({
    x: (win.x - full.x) / full.width,
    y: (win.y - full.y) / full.height,
    width: win.width / full.width,
    height: win.height / full.height,
  });
  return {
    crop: nextCrop,
    position: localToWorld(el, { x: win.x, y: win.y }),
    width: win.width,
    height: win.height,
  };
};

/**
 * Pan the source under a FIXED window: the element's box (position / size) is
 * unchanged; only which region of the bitmap shows moves. `worldDelta` from
 * `dragStartWorld` → `worldPoint` is projected into local space and converted
 * to a crop shift, clamped so the window stays inside the image. `el` must be
 * the ORIGINAL element and `crop` its ORIGINAL crop (drag-start snapshot).
 */
export const computeCropBodyPan = (
  el: Element,
  crop: ImageCrop,
  dragStartWorld: Vec2,
  worldPoint: Vec2,
): { readonly crop: ImageCrop } => {
  const full = cropFullImageLocalRect(el, crop);
  const start = worldToLocal(el, dragStartWorld);
  const now = worldToLocal(el, worldPoint);
  const dx = now.x - start.x;
  const dy = now.y - start.y;
  return {
    crop: {
      x: clampNum(crop.x - dx / full.width, 0, 1 - crop.width),
      y: clampNum(crop.y - dy / full.height, 0, 1 - crop.height),
      width: crop.width,
      height: crop.height,
    },
  };
};

/** True when a crop rect is (within `eps`) the whole image — clears the field. */
const isFullCrop = (c: ImageCrop, eps = 1e-4): boolean =>
  Math.abs(c.x) < eps &&
  Math.abs(c.y) < eps &&
  Math.abs(c.width - 1) < eps &&
  Math.abs(c.height - 1) < eps;

/**
 * Commit a pending crop drag: write the normalised `crop` AND the new element
 * `position` / `width` / `height` in a single patch (one undo step). A crop
 * that covers the whole image is stored as no crop (field cleared). No-op
 * (`null`) for a missing / non-image shape or when nothing changed.
 */
export const computeCommitImageCrop = (
  scene: Scene,
  id: ElementId,
  next: CropDragResult,
): { readonly scene: Scene; readonly patch: Patch } | null => {
  const el = getElement(scene, id);
  if (el?.type !== "image") return null;
  const c = clampCrop(next.crop);
  const cropField = isFullCrop(c) ? undefined : c;
  const current = (el as { readonly crop?: ImageCrop }).crop;
  const unchanged =
    sameCrop(cropField, current) &&
    el.position.x === next.position.x &&
    el.position.y === next.position.y &&
    (el as { readonly width: number }).width === next.width &&
    (el as { readonly height: number }).height === next.height;
  if (unchanged) return null;
  const r = updateElement(scene, id, (sh) => {
    const { crop: _drop, ...rest } = sh as unknown as Record<string, unknown>;
    void _drop;
    const base = {
      ...rest,
      position: next.position,
      width: next.width,
      height: next.height,
    };
    return (cropField === undefined ? base : { ...base, crop: cropField }) as unknown as typeof sh;
  });
  return { scene: r.scene, patch: r.patch };
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

/**
 * Pure geometry for a flowchart CREATE session: `count` clones of `sourceId`,
 * each linked source→clone (floating). Does NOT mutate `scene` or history —
 * returns the pending `elements` + `links` for a PREVIEW; the caller commits
 * them later. Placement matches Excalidraw's `addNewNodes`:
 *
 * - `left` / `right` — the `count` siblings stack vertically, centred on the
 *   source (step = source height + {@link SPAWN_CONNECTED_GAP_PX}), all offset
 *   by one source-width + gap along the axis.
 * - `up` / `down` — siblings spread horizontally, centred on the source
 *   (step = source width + gap), all offset by one source-height + gap.
 *
 * `count === 1` reproduces {@link computeSpawnConnectedNode}'s single placement
 * (zero perpendicular offset). Returns empty arrays when the source is missing.
 */
export const computeSpawnConnectedNodes = (
  scene: Scene,
  sourceId: ElementId,
  direction: SpawnDirection,
  count: number,
  makeElementId: () => ElementId,
  makeLinkId: () => LinkId,
): { readonly elements: Element[]; readonly links: Link[] } => {
  const source = getElement(scene, sourceId);
  if (source === undefined || count < 1) return { elements: [], links: [] };
  const local = getElementLocalBounds(source);
  const w = local.width * source.scale.x;
  const h = local.height * source.scale.y;
  const horizontal = direction === "left" || direction === "right";
  // Along-axis offset: one source extent + gap in the spawn direction.
  const alongX =
    direction === "right"
      ? w + SPAWN_CONNECTED_GAP_PX
      : direction === "left"
        ? -(w + SPAWN_CONNECTED_GAP_PX)
        : 0;
  const alongY =
    direction === "down"
      ? h + SPAWN_CONNECTED_GAP_PX
      : direction === "up"
        ? -(h + SPAWN_CONNECTED_GAP_PX)
        : 0;
  // Perpendicular step used to fan the siblings out, centred on the source.
  const step = horizontal ? h + SPAWN_CONNECTED_GAP_PX : w + SPAWN_CONNECTED_GAP_PX;
  const baseOrder = orderForTop(
    [...scene.elements.values()].filter((e) => e.layerId === source.layerId).map((e) => e.order),
  );
  const baseLinkOrder = orderForTop(
    [...scene.links.values()].filter((e) => e.layerId === source.layerId).map((e) => e.order),
  );
  // Detach any group / frame membership so spawned nodes are free-standing.
  const { parentId: _p, frameId: _f, ...bare } = source;
  void _p;
  void _f;
  const elements: Element[] = [];
  const links: Link[] = [];
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * step;
    const dx = alongX + (horizontal ? 0 : spread);
    const dy = alongY + (horizontal ? spread : 0);
    const cloneId = makeElementId();
    elements.push({
      ...bare,
      id: cloneId,
      position: { x: source.position.x + dx, y: source.position.y + dy },
      order: baseOrder,
    });
    links.push({
      id: makeLinkId(),
      layerId: source.layerId,
      from: { kind: "floating", elementId: sourceId },
      to: { kind: "floating", elementId: cloneId },
      order: baseLinkOrder,
      routing: DEFAULT_LINK_ROUTING,
      style: { ...DEFAULT_EDGE_STYLE },
      arrowheads: { to: DEFAULT_LINK_ARROWHEAD },
    });
  }
  return { elements, links };
};
