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
  BRUSH_SMOOTH_SEGMENTS,
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
  points: BrushPoint[];
}

export const beginBrushStroke = (
  world: Vec2,
  pressure: number,
  maxWidth: number = MAX_BRUSH_WIDTH,
): BrushStrokeState => ({
  points: [{ x: 0, y: 0, width: pressureToWidth(pressure, maxWidth) }],
  origin: world,
});

export const extendBrushStroke = (
  stroke: BrushStrokeState,
  world: Vec2,
  pressure: number,
  maxWidth: number = MAX_BRUSH_WIDTH,
): void => {
  const o = stroke.origin;
  stroke.points.push({
    x: world.x - o.x,
    y: world.y - o.y,
    width: pressureToWidth(pressure, maxWidth),
  });
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
  const shape: Element = {
    id: newElementId,
    layerId: activeLayerId,
    type: "brush",
    position: stroke.origin,
    rotation: 0,
    scale: { x: 1, y: 1 },
    order,
    style,
    points: smoothBrushPoints(stroke.points),
  };
  const r = addElement(scene, shape);
  return { scene: r.scene, patch: r.patch, elementId: newElementId };
};

/** Generate a fresh brush shape id with the editor's nextId counter. */
export const newBrushId = (next: number): ElementId =>
  castElementId(`brush-${next}-${Date.now().toString(36)}`);
