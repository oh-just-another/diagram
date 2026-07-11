import {
  getBounder,
  getElementLocalBounds,
  getLinkEndpointWorld,
  isBrush,
  isEllipse,
  isFrame,
  isGroup,
  isImage,
  isPolygon,
  isRectangle,
  isText,
  type ArrowheadStyle,
  type ElementBase,
  type Link,
  type Scene,
  type Style,
} from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import {
  DIAMOND_EPSILON,
  DOTTED_DASH_MAX,
  EXCALIDRAW_DEFAULT_STROKE,
  EXCALIDRAW_EXPORT_SOURCE,
  EXCALIDRAW_OPACITY_SCALE,
  FREEDRAW_WIDTH_PER_PRESSURE,
} from "./constants.js";

/**
 * Export a `Scene` as a `.excalidraw` JSON document (format version 2).
 *
 * Mapping:
 *   - `rectangle` / `ellipse` → the matching element type
 *   - `polygon`               → `diamond` when its 4 points sit on the bbox
 *                               edge midpoints, otherwise a closed `line`
 *   - `text`                  → `text`
 *   - `brush`                 → `freedraw` (per-point widths → pressures)
 *   - `image`                 → `image` + `files` entry (data-URL sources only)
 *   - `frame`                 → `frame` (children keep membership)
 *   - group membership        → `groupIds` (one level)
 *   - `Link`                  → `arrow` (anchored ends become bindings,
 *                               waypoints become interior points)
 *
 * Not carried over: `template`, `block-arrow`, `path` and unknown plugin
 * shapes, hidden elements, images with non-data URLs, link labels, and
 * orthogonal/bezier routing (all connectors flatten to point sequences).
 */
export const exportExcalidraw = (scene: Scene): string => {
  const out: Record<string, unknown>[] = [];
  const files: Record<string, unknown> = {};
  const boundArrows = new Map<string, { id: string; type: "arrow" }[]>();
  let seed = 1;
  const nextSeed = (): number => seed++;

  const elements = [...scene.elements.values()].sort(byOrder);
  for (const el of elements) {
    if (el.hidden === true || isGroup(el)) continue;
    if (getBounder(el.type) === undefined) continue; // unknown plugin shape
    const converted = convertElement(scene, el, nextSeed, files);
    if (converted) out.push(converted);
  }

  const links = [...scene.links.values()].sort(byOrder);
  for (const link of links) {
    const converted = convertLink(scene, link, nextSeed, boundArrows);
    if (converted) out.push(converted);
  }

  // Back-fill boundElements on shapes referenced by arrow bindings.
  for (const raw of out) {
    const bound = boundArrows.get(String(raw.id));
    if (bound) raw.boundElements = bound;
  }

  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: EXCALIDRAW_EXPORT_SOURCE,
      elements: out,
      appState: {},
      files,
    },
    null,
    2,
  );
};

// --- elements ---

const convertElement = (
  scene: Scene,
  el: ElementBase,
  nextSeed: () => number,
  files: Record<string, unknown>,
): Record<string, unknown> | null => {
  const box = worldBox(el);
  const base = baseFields(scene, el, box, nextSeed);

  if (isRectangle(el)) return { ...base, type: "rectangle" };
  if (isEllipse(el)) return { ...base, type: "ellipse" };
  if (isFrame(el)) {
    return { ...base, type: "frame", name: el.name ?? null, backgroundColor: "transparent" };
  }
  if (isPolygon(el)) {
    if (isDiamond(el.points)) return { ...base, type: "diamond" };
    const min = pointsMin(el.points);
    const rel = el.points.map((p) => [(p.x - min.x) * el.scale.x, (p.y - min.y) * el.scale.y]);
    const firstRel = rel[0];
    if (firstRel) rel.push([...firstRel]); // close the outline
    return { ...base, type: "line", points: rel };
  }
  if (isText(el)) {
    return {
      ...base,
      type: "text",
      text: el.text,
      fontSize: el.fontSize * el.scale.y,
      fontFamily: /mono/i.test(el.fontFamily) ? 3 : 2,
      textAlign: el.style.textAlign ?? "left",
      verticalAlign: "top",
      // Text colour lives in `fill` on our side, `strokeColor` on theirs.
      strokeColor: el.style.fill ?? EXCALIDRAW_DEFAULT_STROKE,
      backgroundColor: "transparent",
      containerId: null,
      lineHeight: 1.25,
    };
  }
  if (isBrush(el)) {
    if (el.points.length === 0) return null;
    const strokeWidth = el.style.strokeWidth ?? 1;
    const min = pointsMin(el.points);
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const points = el.points.map((p) => [(p.x - min.x) * el.scale.x, (p.y - min.y) * el.scale.y]);
    const pressures = el.points.map((p) =>
      clamp01(p.width / (strokeWidth * FREEDRAW_WIDTH_PER_PRESSURE)),
    );
    // Box from the centreline points (not the stroke-padded local bounds)
    // so `points` stay relative to the element's x/y.
    const centreBox = boxFrom(el, {
      x: min.x,
      y: min.y,
      width: maxX - min.x,
      height: maxY - min.y,
    });
    return { ...base, ...centreBox, type: "freedraw", points, pressures, simulatePressure: false };
  }
  if (isImage(el)) {
    if (!el.src.startsWith("data:")) return null; // external URLs don't embed
    const fileId = `file-${String(el.id)}`;
    const mime = /^data:([^;,]+)/.exec(el.src)?.[1] ?? "image/png";
    files[fileId] = { mimeType: mime, id: fileId, dataURL: el.src, created: 1 };
    return { ...base, type: "image", fileId, status: "saved", scale: [1, 1] };
  }
  // frame-less containers / templates / block arrows / paths: skipped.
  return null;
};

// --- links ---

const convertLink = (
  scene: Scene,
  link: Link,
  nextSeed: () => number,
  boundArrows: Map<string, { id: string; type: "arrow" }[]>,
): Record<string, unknown> | null => {
  const start = getLinkEndpointWorld(scene, link.from);
  const end = getLinkEndpointWorld(scene, link.to, start ?? undefined);
  if (!start || !end) return null;

  const world: Vec2[] = [start, ...(link.waypoints ?? []), end];
  const first = world[0];
  if (!first) return null;
  const points = world.map((p) => [p.x - first.x, p.y - first.y]);
  let maxX = 0;
  let maxY = 0;
  let minX = 0;
  let minY = 0;
  for (const [px = 0, py = 0] of points) {
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
  }

  const id = String(link.id);
  const binding = (endpoint: Link["from"]): Record<string, unknown> | null => {
    if (endpoint.kind === "point") return null;
    const boundId = String(endpoint.elementId);
    const list = boundArrows.get(boundId) ?? [];
    list.push({ id, type: "arrow" });
    boundArrows.set(boundId, list);
    return { elementId: boundId, focus: 0, gap: 1 };
  };

  return {
    id,
    type: "arrow",
    x: first.x,
    y: first.y,
    width: maxX - minX,
    height: maxY - minY,
    angle: 0,
    points,
    startBinding: binding(link.from),
    endBinding: binding(link.to),
    startArrowhead: headOut(link.arrowheads?.from),
    endArrowhead: headOut(link.arrowheads?.to),
    lastCommittedPoint: null,
    ...styleFields(link.style),
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
};

/** Our `ArrowheadStyle` → arrowhead vocabulary of the target format. */
const headOut = (style: ArrowheadStyle | undefined): string | null => {
  switch (style) {
    case undefined:
    case "none":
      return null;
    case "filledArrow":
      return "triangle";
    case "triangle":
      return "triangle_outline";
    case "circle":
      return "circle_outline";
    case "filledCircle":
      return "dot";
    case "rhombus":
    case "diamond":
      return "diamond_outline";
    case "filledRhombus":
      return "diamond";
    default:
      return "arrow";
  }
};

// --- shared helpers ---

interface WorldBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * World-space box in the target format's convention: unrotated bbox centred
 * on the shape's rotated centre, plus `angle` (our origin-based rotation maps
 * to their centre-based one by construction).
 */
const worldBox = (el: ElementBase): WorldBox => boxFrom(el, getElementLocalBounds(el));

const boxFrom = (
  el: ElementBase,
  lb: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): WorldBox => {
  const w = lb.width * el.scale.x;
  const h = lb.height * el.scale.y;
  const localCx = (lb.x + lb.width / 2) * el.scale.x;
  const localCy = (lb.y + lb.height / 2) * el.scale.y;
  const cos = Math.cos(el.rotation);
  const sin = Math.sin(el.rotation);
  const cx = el.position.x + localCx * cos - localCy * sin;
  const cy = el.position.y + localCx * sin + localCy * cos;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
};

const baseFields = (
  scene: Scene,
  el: ElementBase,
  box: WorldBox,
  nextSeed: () => number,
): Record<string, unknown> => {
  const parent = el.parentId !== undefined ? scene.elements.get(el.parentId) : undefined;
  const groupIds = parent && isGroup(parent) ? [String(parent.id)] : [];
  return {
    id: String(el.id),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    angle: el.rotation,
    ...styleFields(el.style),
    groupIds,
    frameId: el.frameId !== undefined ? String(el.frameId) : null,
    roundness: el.style.roundness?.type === "round" ? { type: 3 } : null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: el.href ?? null,
    locked: el.locked === true,
  };
};

const styleFields = (style: Style): Record<string, unknown> => {
  const dash = style.dashArray;
  const first = dash?.[0];
  return {
    strokeColor: style.stroke ?? EXCALIDRAW_DEFAULT_STROKE,
    backgroundColor: style.fill ?? "transparent",
    fillStyle: "solid",
    strokeWidth: style.strokeWidth ?? 1,
    strokeStyle: first === undefined ? "solid" : first <= DOTTED_DASH_MAX ? "dotted" : "dashed",
    roughness: 0,
    opacity: Math.round((style.opacity ?? 1) * EXCALIDRAW_OPACITY_SCALE),
  };
};

/** True when 4 points sit on the bbox edge midpoints (top/right/bottom/left). */
const isDiamond = (points: readonly Vec2[]): boolean => {
  if (points.length !== 4) return false;
  const min = pointsMin(points);
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const midX = (min.x + maxX) / 2;
  const midY = (min.y + maxY) / 2;
  const expected: readonly Vec2[] = [
    { x: midX, y: min.y },
    { x: maxX, y: midY },
    { x: midX, y: maxY },
    { x: min.x, y: midY },
  ];
  return expected.every((e) =>
    points.some(
      (p) => Math.abs(p.x - e.x) <= DIAMOND_EPSILON && Math.abs(p.y - e.y) <= DIAMOND_EPSILON,
    ),
  );
};

const pointsMin = (points: readonly { readonly x: number; readonly y: number }[]): Vec2 => {
  let x = Infinity;
  let y = Infinity;
  for (const p of points) {
    if (p.x < x) x = p.x;
    if (p.y < y) y = p.y;
  }
  return { x, y };
};

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);

const byOrder = (a: { order: string }, b: { order: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
