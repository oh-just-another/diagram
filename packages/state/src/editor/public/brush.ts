import {
  addElement,
  orderForTop,
  type BrushPoint,
  type Scene,
  type Element,
  type Patch,
  type Style,
} from "@oh-just-another/scene";
import { req, type LayerId, type ElementId, type Vec2 } from "@oh-just-another/types";
import { elementId as castElementId } from "@oh-just-another/types";
import {
  BRUSH_CLOSE_DISTANCE,
  BRUSH_MIN_POINT_DIST_PX,
  BRUSH_PRESSURE_SMOOTHING,
  BRUSH_SIM_PRESSURE_MAX,
  BRUSH_SIM_PRESSURE_MIN,
  BRUSH_SIM_PRESSURE_START,
  BRUSH_SIM_THIN_DIST_PX,
  BRUSH_SMOOTH_SEGMENTS,
  BRUSH_STREAMLINE,
  BRUSH_TAPER_LENGTH_FACTOR,
  BRUSH_TAPER_MIN,
  DEFAULT_BRUSH_COLOR,
  DEFAULT_BRUSH_OPACITY,
  DEFAULT_BRUSH_WIDTH,
  MAX_BRUSH_POINTS,
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

/** A captured vertex: rendered geometry plus the raw pressure it derives from. */
type WeightedPoint = BrushPoint & { readonly pressure: number };

/**
 * Mutable in-progress stroke state. Editor owns one instance and
 * delegates all four lifecycle calls (begin / extend / commit /
 * cancel) through this container.
 */
export interface BrushStrokeState {
  origin: Vec2;
  /** Streamlined (low-pass filtered) points — what the preview and commit use. */
  points: BrushPoint[];
  /** Input pressure (0–1) per stored point, parallel to `points`. */
  pressures: number[];
  /**
   * True when the device has no real pressure channel (mouse / touch) and
   * pressure is synthesised from pointer speed — slow = thick, fast = thin.
   */
  simulatePressure: boolean;
  /** Base half-width the pressure curve scales toward (`brushSettings.width` at begin). */
  baseWidth: number;
  /**
   * The last RAW input point (local coords, un-streamlined). The low-pass
   * filter makes `points` trail the cursor by a fraction of each move, so the
   * commit appends this catch-up point — the stroke ends exactly where the
   * pointer was released, not a half-step behind it.
   */
  lastRaw: WeightedPoint;
  /**
   * RAW position that produced the last STORED point — the decimation anchor.
   * A new point is stored only once the raw input has moved at least
   * `BRUSH_MIN_POINT_DIST_PX` screen pixels away from it, so a slow drag
   * doesn't spam near-duplicate vertices.
   */
  lastStoredRaw: Vec2;
}

export const beginBrushStroke = (
  world: Vec2,
  pressure: number,
  maxWidth: number = MAX_BRUSH_WIDTH,
  simulatePressure = false,
): BrushStrokeState => {
  const p0 = simulatePressure ? BRUSH_SIM_PRESSURE_START : pressure;
  const first: WeightedPoint = { x: 0, y: 0, width: pressureToWidth(p0, maxWidth), pressure: p0 };
  return {
    points: [first],
    pressures: [p0],
    simulatePressure,
    baseWidth: maxWidth,
    lastRaw: first,
    lastStoredRaw: { x: 0, y: 0 },
    origin: world,
  };
};

/**
 * Halve a stroke's interior points (keep both endpoints) when the capture
 * exceeds {@link MAX_BRUSH_POINTS} — bounds memory and render cost on very
 * long strokes while the stroke keeps following the pointer. Each halving
 * doubles the remaining capacity, so the cap is soft, not a hard stop.
 */
const thinStroke = (stroke: BrushStrokeState): void => {
  const keep = (i: number, len: number): boolean => i === 0 || i === len - 1 || i % 2 === 0;
  stroke.points = stroke.points.filter((_, i, a) => keep(i, a.length));
  stroke.pressures = stroke.pressures.filter((_, i, a) => keep(i, a.length));
};

export const extendBrushStroke = (
  stroke: BrushStrokeState,
  world: Vec2,
  pressure: number,
  zoom = 1,
): void => {
  const o = stroke.origin;
  const rawX = world.x - o.x;
  const rawY = world.y - o.y;
  const prevP = stroke.pressures[stroke.pressures.length - 1] ?? BRUSH_SIM_PRESSURE_START;
  let p: number;
  if (stroke.simulatePressure) {
    // No pressure channel: synthesise it from pointer speed — the distance the
    // RAW input travelled since the last sample, in SCREEN pixels (world dist ×
    // zoom) so the feel doesn't change with the zoom level. Standing still
    // targets full pressure (thick); at BRUSH_SIM_THIN_DIST_PX per sample the
    // target bottoms out (thin). The smoothing lerp rate-limits the change, and
    // the result is clamped to [MIN, MAX] — the width-multiplier band a
    // simulated stroke can span (a slow stroke converges to MAX × base width).
    const dist = Math.hypot(rawX - stroke.lastRaw.x, rawY - stroke.lastRaw.y) * zoom;
    const target = 1 - Math.min(1, dist / BRUSH_SIM_THIN_DIST_PX);
    p = prevP + (target - prevP) * BRUSH_PRESSURE_SMOOTHING;
    p = Math.min(BRUSH_SIM_PRESSURE_MAX, Math.max(BRUSH_SIM_PRESSURE_MIN, p));
  } else {
    // Real pressure channel: follow the device but rate-limit spikes (a pen
    // lifting off can emit a single outlier sample) with the same lerp.
    p = prevP + (pressure - prevP) * BRUSH_PRESSURE_SMOOTHING;
  }
  const raw: WeightedPoint = {
    x: rawX,
    y: rawY,
    width: pressureToWidth(stroke.simulatePressure ? p : pressure, stroke.baseWidth),
    pressure: stroke.simulatePressure ? p : pressure,
  };
  // Decimation: store a new point only once the raw input has moved at least
  // BRUSH_MIN_POINT_DIST_PX screen pixels (world dist × zoom) from the raw
  // position that produced the last stored point. Skipped samples still
  // advance `lastRaw`, so the commit catch-up keeps the stroke ending under
  // the cursor.
  const sdx = (rawX - stroke.lastStoredRaw.x) * zoom;
  const sdy = (rawY - stroke.lastStoredRaw.y) * zoom;
  if (sdx * sdx + sdy * sdy < BRUSH_MIN_POINT_DIST_PX * BRUSH_MIN_POINT_DIST_PX) {
    stroke.lastRaw = raw;
    return;
  }
  // Streamline: pull the stored point only part of the way toward the raw
  // input (exponential moving average). Raw pointer-move samples carry hand
  // jitter and sensor noise; the low-pass turns them into a steady line. The
  // trailing gap this leaves at the cursor is closed on commit via `lastRaw`.
  const prev = stroke.points[stroke.points.length - 1] ?? raw;
  const t = 1 - BRUSH_STREAMLINE;
  stroke.points.push({
    x: prev.x + (raw.x - prev.x) * t,
    y: prev.y + (raw.y - prev.y) * t,
    width: pressureToWidth(p, stroke.baseWidth),
  });
  stroke.pressures.push(p);
  stroke.lastRaw = raw;
  stroke.lastStoredRaw = { x: rawX, y: rawY };
  if (stroke.points.length > MAX_BRUSH_POINTS) thinStroke(stroke);
};

/**
 * Taper a stroke's widths toward both ends: within the taper zone (arc length
 * `BRUSH_TAPER_LENGTH_FACTOR × baseWidth` from each tip, capped at half the
 * stroke so short strokes stay symmetric) the width eases down to
 * `BRUSH_TAPER_MIN` of its captured value — the natural pen-lift look instead
 * of full-width round discs at the ends. Positions are untouched.
 */
export const taperBrushPoints = (
  points: readonly BrushPoint[],
  baseWidth: number,
): BrushPoint[] => {
  const n = points.length;
  if (n < 3) return points.slice();
  // Cumulative arc length from the start.
  const cum = new Array<number>(n);
  cum[0] = 0;
  for (let i = 1; i < n; i++) {
    const a = req(points[i - 1]);
    const b = req(points[i]);
    cum[i] = req(cum[i - 1]) + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = req(cum[n - 1]);
  const taperLen = Math.min(baseWidth * BRUSH_TAPER_LENGTH_FACTOR, total / 2);
  if (taperLen <= 0) return points.slice();
  return points.map((pt, i) => {
    const fromTip = Math.min(req(cum[i]), total - req(cum[i]));
    if (fromTip >= taperLen) return pt;
    const u = fromTip / taperLen;
    // Ease-out (u·(2−u)): the width sheds fastest right at the tip.
    const f = BRUSH_TAPER_MIN + (1 - BRUSH_TAPER_MIN) * u * (2 - u);
    return { x: pt.x, y: pt.y, width: pt.width * f };
  });
};

/**
 * The commit-ready geometry of an in-progress stroke: the streamlined points
 * plus the raw catch-up point (when the filter left a trailing gap at the
 * cursor), resampled by the shared Catmull-Rom smoother with pressure carried
 * across the resample, then end-tapered (unless the stroke qualifies as
 * closed for `style` — a filled loop keeps its full-width seam). Used by BOTH
 * `commitBrushStroke` and the live overlay preview so what is drawn while the
 * button is down is exactly what lands in the scene.
 */
export const brushCommitPoints = (
  stroke: {
    readonly points: readonly BrushPoint[];
    readonly pressures: readonly number[];
    readonly baseWidth: number;
    readonly lastRaw: WeightedPoint;
  },
  style?: Style,
): { points: BrushPoint[]; pressures: number[] } => {
  const zipped: WeightedPoint[] = stroke.points.map((pt, i) => ({
    ...pt,
    pressure: stroke.pressures[i] ?? BRUSH_SIM_PRESSURE_START,
  }));
  const last = zipped[zipped.length - 1];
  const raw = stroke.lastRaw;
  if (last !== undefined && (Math.abs(last.x - raw.x) > 1e-3 || Math.abs(last.y - raw.y) > 1e-3)) {
    zipped.push(raw);
  }
  const smoothed = smoothStrokePoints(zipped, BRUSH_SMOOTH_SEGMENTS, (a, b, pos, u) => ({
    x: pos.x,
    y: pos.y,
    width: a.width + (b.width - a.width) * u,
    pressure: a.pressure + (b.pressure - a.pressure) * u,
  }));
  const points: BrushPoint[] = smoothed.map(({ x, y, width }) => ({ x, y, width }));
  const closed = style !== undefined && isClosedStroke(points, style);
  return {
    points: closed ? points : taperBrushPoints(points, stroke.baseWidth),
    pressures: smoothed.map((pt) => pt.pressure),
  };
};

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
  const { points, pressures } = brushCommitPoints(stroke, style);
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
    // Regeneration payload: the raw pressures behind the baked widths, whether
    // they were speed-simulated, and the base width they scaled toward — enough
    // to re-derive `width` with different thinning / size later.
    pressures,
    baseWidth: stroke.baseWidth,
    ...(stroke.simulatePressure ? { simulatePressure: true } : {}),
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
