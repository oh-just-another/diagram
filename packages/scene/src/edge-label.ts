import { req, type Bounds, type Vec2 } from "@oh-just-another/types";
import type { Link, LinkLabel } from "./edge.js";
import {
  LINK_LABEL_CHAR_WIDTH_FACTOR,
  LINK_LABEL_DEFAULT_FONT_SIZE,
  LINK_LABEL_DEFAULT_POSITION,
  LINK_LABEL_END_CLEARANCE,
  LINK_LABEL_LINE_HEIGHT,
  LINK_LABEL_MAX_WIDTH,
  LINK_LABEL_PAD_X,
  LINK_LABEL_PAD_Y,
} from "./constants.js";

/**
 * Label geometry shared by the renderer (pill placement), hit-testing and
 * bounds/culling — one source of truth so the drawn pill, the clickable area
 * and the dirty-rect all agree.
 */

/** Point at fractional arc length `t` (0..1) along a polyline. */
export const pointAlongPath = (path: readonly Vec2[], t: number): Vec2 => {
  if (path.length === 2) {
    const [a, b] = path as [Vec2, Vec2];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const cur = req(path[i]);
    const prev = req(path[i - 1]);
    const len = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    lengths.push(len);
    total += len;
  }
  let remaining = total * t;
  for (let i = 0; i < lengths.length; i++) {
    const segLen = req(lengths[i]);
    if (remaining <= segLen) {
      const a = req(path[i]);
      const b = req(path[i + 1]);
      const r = segLen === 0 ? 0 : remaining / segLen;
      return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
    }
    remaining -= segLen;
  }
  return req(path[path.length - 1]);
};

/** Total polyline length. */
const pathLength = (path: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = req(path[i - 1]);
    const b = req(path[i]);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
};

/**
 * World anchor point of a link's label on `path`.
 *
 * - Explicit `label.position` → fractional arc length, clamped so the pill
 *   keeps {@link LINK_LABEL_END_CLEARANCE} away from either end (arrowheads).
 * - No explicit position on an orthogonal (elbow) link → the midpoint of the
 *   LONGEST segment: it never sits on a corner and stays put when re-routing
 *   re-flows the shorter segments.
 * - Otherwise → clamped arc-length midpoint.
 */
export const linkLabelAnchor = (path: readonly Vec2[], edge: Link): Vec2 => {
  const explicit = edge.label?.position;
  if (explicit === undefined && (edge.routing ?? "straight") === "orthogonal" && path.length > 2) {
    let bestLen = -1;
    let mid: Vec2 = req(path[0]);
    for (let i = 1; i < path.length; i++) {
      const a = req(path[i - 1]);
      const b = req(path[i]);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    return mid;
  }
  const total = pathLength(path);
  const clearance = total > 0 ? Math.min(0.5, LINK_LABEL_END_CLEARANCE / total) : 0;
  const t = Math.min(1 - clearance, Math.max(clearance, explicit ?? LINK_LABEL_DEFAULT_POSITION));
  return pointAlongPath(path, t);
};

/**
 * Conservative size estimate of the label pill (world px at zoom 1) for
 * hit-testing and dirty-rect / culling bounds. Mirrors the renderer's
 * measured word-wrap with a per-glyph advance of
 * {@link LINK_LABEL_CHAR_WIDTH_FACTOR} × fontSize — deliberately a little
 * generous so the drawn pill always fits inside the estimated box.
 */
export const estimateLinkLabelBox = (
  label: LinkLabel,
): { readonly width: number; readonly height: number } => {
  const fontSize = label.fontSize ?? LINK_LABEL_DEFAULT_FONT_SIZE;
  const charW = fontSize * LINK_LABEL_CHAR_WIDTH_FACTOR;
  const maxChars = Math.max(1, Math.floor(LINK_LABEL_MAX_WIDTH / charW));

  let lines = 0;
  let widest = 0;
  for (const paragraph of label.text.split("\n")) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (candidate.length <= maxChars || current === "") {
        current = candidate;
      } else {
        widest = Math.max(widest, current.length);
        lines += 1;
        current = word;
      }
    }
    widest = Math.max(widest, current.length);
    lines += 1;
  }

  return {
    width: Math.min(widest * charW, LINK_LABEL_MAX_WIDTH) + LINK_LABEL_PAD_X * 2,
    height: lines * fontSize * LINK_LABEL_LINE_HEIGHT + LINK_LABEL_PAD_Y * 2,
  };
};

/**
 * Estimated world AABB of a link's label pill on `path` (the drawn polyline —
 * see `getLinkCurvePoints`), or `null` when the link has no label. Centred on
 * {@link linkLabelAnchor}. The scene-aware convenience is
 * `linkLabelBounds` in `edge-geometry.ts`.
 */
export const linkLabelBoundsForPath = (path: readonly Vec2[], edge: Link): Bounds | null => {
  if (!edge.label || edge.label.text === "" || path.length < 2) return null;
  const anchor = linkLabelAnchor(path, edge);
  const box = estimateLinkLabelBox(edge.label);
  return {
    x: anchor.x - box.width / 2,
    y: anchor.y - box.height / 2,
    width: box.width,
    height: box.height,
  };
};
