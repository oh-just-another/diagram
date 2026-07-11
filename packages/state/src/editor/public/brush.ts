import {
  addElement,
  orderForTop,
  type BrushPoint,
  type Scene,
  type Element,
  type Patch,
  type Style,
} from "@oh-just-another/scene";
import type { LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import {
  BRUSH_CLOSE_DISTANCE,
  BRUSH_SMOOTH_SEGMENTS,
  BRUSH_STREAMLINE,
  DEFAULT_BRUSH_COLOR,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_WIDTH,
  MAX_BRUSH_WIDTH,
} from "../../constants.js";
import { smoothStrokePoints } from "./stroke-smoothing.js";

/**
 * Host-tunable brush paint settings — what the drawing panel edits and what
 * {@link commitBrushStroke} bakes into a new stroke. `stroke` is the line
 * colour; `fill` is the colour of the enclosed area of a CLOSED stroke (null =
 * no fill, and unused until stroke-closing lands); `opacity` scales both; `width`
 * is the base half-width the pressure curve scales toward.
 */
export interface BrushSettings {
  readonly stroke: string;
  readonly fill: string | null;
  readonly opacity: number;
  readonly width: number;
}

/** Defaults matching the pre-settings hard-coded brush (a dark line at full alpha). */
export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  stroke: DEFAULT_BRUSH_COLOR,
  fill: null,
  opacity: DEFAULT_BRUSH_OPACITY,
  width: MAX_BRUSH_WIDTH,
};

/** Build the `Style` a committed brush stroke carries from its paint settings. */
export const brushStyleFromSettings = (settings: BrushSettings): Style => ({
  stroke: settings.stroke,
  ...(settings.fill !== null ? { fill: settings.fill } : {}),
  ...(settings.opacity !== 1 ? { opacity: settings.opacity } : {}),
});

/**
 * Convert `PointerEvent.pressure` (0–1) to a brush half-width in local pixels,
 * scaling toward `maxWidth` (the current brush width). Devices without pressure
 * (most mice on Chromium) report 0.5 by spec; zero pressure (some Windows touch)
 * falls back to a minimum so a stroke is still visible.
 */
const pressureToWidth = (pressure: number, maxWidth: number): number => {
  if (pressure <= 0) return DEFAULT_BRUSH_WIDTH;
  return Math.max(0.5, pressure * maxWidth);
};

/**
 * Mutable in-progress stroke state. Editor owns one instance and
 * delegates all four lifecycle calls (begin / extend / commit /
 * cancel) through this container.
 */
export interface BrushStrokeState {
  origin: Vec2;
  /** Streamlined (low-pass filtered) points — what the preview and commit use. */
  points: BrushPoint[];
  /**
   * The last RAW input point (local coords, un-streamlined). The low-pass
   * filter makes `points` trail the cursor by a fraction of each move, so the
   * commit appends this catch-up point — the stroke ends exactly where the
   * pointer was released, not a half-step behind it.
   */
  lastRaw: BrushPoint;
}

export const beginBrushStroke = (
  world: Vec2,
  pressure: number,
  maxWidth: number = MAX_BRUSH_WIDTH,
): BrushStrokeState => {
  const first = { x: 0, y: 0, width: pressureToWidth(pressure, maxWidth) };
  return { points: [first], lastRaw: first, origin: world };
};

export const extendBrushStroke = (
  stroke: BrushStrokeState,
  world: Vec2,
  pressure: number,
  maxWidth: number = MAX_BRUSH_WIDTH,
): void => {
  const o = stroke.origin;
  const raw: BrushPoint = {
    x: world.x - o.x,
    y: world.y - o.y,
    width: pressureToWidth(pressure, maxWidth),
  };
  // Streamline: pull the stored point only part of the way toward the raw
  // input (exponential moving average). Raw pointer-move samples carry hand
  // jitter and sensor noise; the low-pass turns them into a steady line. The
  // trailing gap this leaves at the cursor is closed on commit via `lastRaw`.
  const prev = stroke.points[stroke.points.length - 1] ?? raw;
  const t = 1 - BRUSH_STREAMLINE;
  stroke.points.push({
    x: prev.x + (raw.x - prev.x) * t,
    y: prev.y + (raw.y - prev.y) * t,
    width: raw.width,
  });
  stroke.lastRaw = raw;
};

/**
 * The commit-ready polyline of an in-progress stroke: the streamlined points
 * plus the raw catch-up point (when the filter left a trailing gap at the
 * cursor), resampled by the shared Catmull-Rom smoother. Used by BOTH
 * `commitBrushStroke` and the live overlay preview so what is drawn while the
 * button is down is exactly what lands in the scene.
 */
export const brushCommitPoints = (stroke: {
  readonly points: readonly BrushPoint[];
  readonly lastRaw: BrushPoint;
}): BrushPoint[] => {
  const pts = stroke.points;
  const last = pts[pts.length - 1];
  const raw = stroke.lastRaw;
  const trailing =
    last !== undefined && (Math.abs(last.x - raw.x) > 1e-3 || Math.abs(last.y - raw.y) > 1e-3);
  return smoothBrushPoints(trailing ? [...pts, raw] : pts);
};

/**
 * Resample a captured brush polyline into a smooth, dense point list by fitting
 * a Catmull-Rom spline through the vertices (shared {@link smoothStrokePoints}
 * resampler), interpolating each point's `width` across its span. Strokes with
 * fewer than three points pass through unchanged.
 */
export const smoothBrushPoints = (
  points: readonly BrushPoint[],
  perSegment: number = BRUSH_SMOOTH_SEGMENTS,
): BrushPoint[] =>
  smoothStrokePoints(points, perSegment, (a, b, pos, u) => ({
    x: pos.x,
    y: pos.y,
    width: a.width + (b.width - a.width) * u,
  }));

/**
 * Decide whether a committed stroke should auto-close (and thus be filled).
 * True only when a fill colour is set AND there are at least three points AND
 * the first and last smoothed points are within {@link BRUSH_CLOSE_DISTANCE}.
 * Uses squared distance to avoid a `sqrt`.
 */
const isClosedStroke = (points: readonly BrushPoint[], style: Style): boolean => {
  if (style.fill === undefined || points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return false;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  return dx * dx + dy * dy <= BRUSH_CLOSE_DISTANCE * BRUSH_CLOSE_DISTANCE;
};

/**
 * Produce the shape + scene patch for committing a brush stroke. The captured
 * polyline is smoothed (Catmull-Rom) before it enters the scene so the stored
 * stroke reads as a fluid line, not a chain of angular segments. Caller pushes
 * the patch into history and clears the stroke state. Returns `null` for empty
 * strokes (zero points or no stroke at all).
 */
export const commitBrushStroke = (
  scene: Scene,
  stroke: BrushStrokeState | null,
  activeLayerId: LayerId,
  newElementId: ElementId,
  style: Style = brushStyleFromSettings(DEFAULT_BRUSH_SETTINGS),
): { readonly scene: Scene; readonly patch: Patch; readonly elementId: ElementId } | null => {
  if (!stroke || stroke.points.length === 0) return null;
  const order = orderForTop(
    [...scene.elements.values()].filter((s) => s.layerId === activeLayerId).map((s) => s.order),
  );
  const points = brushCommitPoints(stroke);
  const shape: Element = {
    id: newElementId,
    layerId: activeLayerId,
    type: "brush",
    position: stroke.origin,
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    style,
    points,
    // Auto-close only when a fill colour is chosen and the stroke loops back on
    // itself — the enclosed area is filled with `style.fill` by the renderer.
    // Omit the field for open strokes to keep serialized scenes clean.
    ...(isClosedStroke(points, style) ? { closed: true } : {}),
  };
  const r = addElement(scene, shape);
  return { scene: r.scene, patch: r.patch, elementId: newElementId };
};

/** Generate a fresh brush shape id with the editor's nextId counter. */
export const newBrushId = (next: number): ElementId =>
  castElementId(`brush-${next}-${Date.now().toString(36)}`);
