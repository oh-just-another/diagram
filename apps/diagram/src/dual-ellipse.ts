import {
  registerElementRenderer,
  type ElementRenderer,
} from "@oh-just-another/renderer-core";
import {
  registerBounder,
  registerElementOutline,
  type ElementBase,
  type Element,
  type Style,
} from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import { defaultRegistry } from "@oh-just-another/templates";

/**
 * Demo of a single composite element whose visual is two
 * visually-disconnected figures (two ellipses, no background box). It
 * exercises the multi-loop selection halo: one element, two separate
 * contours. With a registered outline provider (below) the halo hugs
 * each ellipse instead of falling back to the bounding box — see
 * `getElementOutline` / `registerElementOutline`.
 */
export const DUAL_ELLIPSE_TYPE = "demo.dual-ellipse";

interface DualEllipseElement extends ElementBase {
  readonly type: typeof DUAL_ELLIPSE_TYPE;
  readonly width: number;
  readonly height: number;
  readonly style: Style;
}

const DEFAULT_WIDTH = 170;
const DEFAULT_HEIGHT = 70;
/** Each ellipse spans ~45% of the width; the ~10% middle gap keeps them apart. */
const RADIUS_RATIO = 0.225;
const LEFT_CENTER_RATIO = 0.225;
const RIGHT_CENTER_RATIO = 0.775;
const OUTLINE_SAMPLES = 48;

const asDual = (shape: ElementBase): DualEllipseElement => shape as DualEllipseElement;

const ellipseLoop = (cx: number, cy: number, rx: number, ry: number): Vec2[] => {
  const pts: Vec2[] = [];
  for (let i = 0; i < OUTLINE_SAMPLES; i++) {
    const a = (i / OUTLINE_SAMPLES) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
};

const draw: ElementRenderer<DualEllipseElement> = (shape, target) => {
  const rx = shape.width * RADIUS_RATIO;
  const ry = shape.height / 2;
  const fill = shape.style.fill ?? "#dbeafe";
  const stroke = shape.style.stroke ?? "#3b82f6";
  const strokeWidth = shape.style.strokeWidth ?? 2;
  for (const cxRatio of [LEFT_CENTER_RATIO, RIGHT_CENTER_RATIO]) {
    const cx = shape.width * cxRatio;
    target.setFill(fill);
    target.beginPath();
    target.ellipse(cx, ry, rx, ry);
    target.fill();
    target.setStroke(stroke);
    target.setStrokeWidth(strokeWidth);
    target.beginPath();
    target.ellipse(cx, ry, rx, ry);
    target.stroke();
  }
};

let installed = false;

/**
 * Register the dual-ellipse renderer, bounder, multi-loop outline provider
 * and a palette preset. Idempotent — safe to call on every mount.
 */
export const installDualEllipse = (): void => {
  if (installed) return;
  installed = true;

  registerElementRenderer<DualEllipseElement>(DUAL_ELLIPSE_TYPE, draw);

  registerBounder<DualEllipseElement>(DUAL_ELLIPSE_TYPE, (shape) => ({
    x: 0,
    y: 0,
    width: shape.width,
    height: shape.height,
  }));

  // Two separate contour loops → the selection halo wraps each ellipse
  // instead of drawing one bounding box around both.
  registerElementOutline(DUAL_ELLIPSE_TYPE, (shape) => {
    const s = asDual(shape);
    const rx = s.width * RADIUS_RATIO;
    const ry = s.height / 2;
    return [
      ellipseLoop(s.width * LEFT_CENTER_RATIO, ry, rx, ry),
      ellipseLoop(s.width * RIGHT_CENTER_RATIO, ry, rx, ry),
    ];
  });

  defaultRegistry.register({
    id: DUAL_ELLIPSE_TYPE,
    name: "Two circles",
    category: "custom",
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="12" r="5"/><circle cx="18" cy="12" r="5"/></svg>',
    tags: ["two", "circles", "ellipses", "pair", "disconnected", "composite"],
    factory: (ctx): Element =>
      ({
        id: ctx.id,
        layerId: ctx.layerId,
        position: ctx.position,
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: ctx.order,
        type: DUAL_ELLIPSE_TYPE,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        style: { fill: "#dbeafe", stroke: "#3b82f6", strokeWidth: 2 },
      }) as Element,
  });
};
