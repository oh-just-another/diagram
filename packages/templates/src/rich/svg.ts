/**
 * Tiny SVG parser + painter for rich-template `Icon` nodes.
 *
 * Scope: just enough to render the icon strings the demo and built-in
 * templates produce. **Not** a complete SVG implementation — there's no
 * CSS, no nested `<defs>`/`<use>`, no gradients, no text, no images, and
 * the parser uses regex over the raw markup rather than a real XML
 * tokenizer. For richer icons hosts can register a custom shape renderer.
 *
 * Pure: no DOMParser, runs in Node and the browser the same way.
 */

import type { RenderTarget } from "@oh-just-another/renderer-core";

interface Paint {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
}

type Cmd =
  | { kind: "move"; x: number; y: number }
  | { kind: "line"; x: number; y: number }
  | { kind: "quad"; cx: number; cy: number; x: number; y: number }
  | { kind: "cubic"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { kind: "close" };

interface PathEl {
  kind: "path";
  commands: readonly Cmd[];
  paint: Paint;
}

interface PolygonEl {
  kind: "polygon" | "polyline";
  points: readonly { x: number; y: number }[];
  paint: Paint;
}

interface ShapeEl {
  kind: "rect" | "circle" | "ellipse" | "line";
  /** Raw attributes — interpreted by the painter. */
  attrs: Readonly<Record<string, number>>;
  paint: Paint;
}

type Element = PathEl | PolygonEl | ShapeEl;

export interface SvgIcon {
  /** Source-coordinate viewport. Painter scales these into target bounds. */
  readonly viewBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly elements: readonly Element[];
}

/**
 * Parse an SVG markup string. Returns `null` if the input is unrecognisable.
 * `currentColor` in `fill` / `stroke` is replaced with `defaultColor` so the
 * painter doesn't need to track context.
 */
export const parseSvg = (markup: string, defaultColor = "#222"): SvgIcon | null => {
  const svgMatch = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/i.exec(markup);
  if (!svgMatch) return null;
  const svgAttrs = parseAttrs(svgMatch[1] ?? "");
  const viewBox = parseViewBox(svgAttrs.viewBox) ?? { x: 0, y: 0, width: 24, height: 24 };
  const rootPaint: Paint = {
    fill: normaliseColor(svgAttrs.fill ?? null, defaultColor),
    stroke: normaliseColor(svgAttrs.stroke ?? null, defaultColor),
    strokeWidth: toNumber(svgAttrs["stroke-width"], 1),
  };
  const body = svgMatch[2] ?? "";
  const elements: Element[] = [];
  collect(body, rootPaint, elements, defaultColor);
  return { viewBox, elements };
};

const collect = (body: string, inherit: Paint, out: Element[], defaultColor: string): void => {
  // Walk top-level elements with a regex that captures self-closing and
  // open-close pairs (for `<g>`). Order matters because nested `<g>` need
  // their own paint inheritance applied first.
  const elRe =
    /<(g|path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/gi;
  let m: RegExpExecArray | null;
  while ((m = elRe.exec(body)) !== null) {
    const tag = m[1]!.toLowerCase();
    const attrs = parseAttrs(m[2] ?? "");
    const paint = mergePaint(inherit, attrs, defaultColor);
    if (tag === "g") {
      const inner = m[4] ?? "";
      collect(inner, paint, out, defaultColor);
      continue;
    }
    if (tag === "path") {
      const commands = parsePathData(attrs.d ?? "");
      if (commands.length > 0) out.push({ kind: "path", commands, paint });
      continue;
    }
    if (tag === "polygon" || tag === "polyline") {
      const points = parsePoints(attrs.points ?? "");
      if (points.length > 0) out.push({ kind: tag, points, paint });
      continue;
    }
    // Primitive shapes (rect/circle/ellipse/line). Keep numeric attrs only.
    const numericAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(attrs)) {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) numericAttrs[k] = n;
    }
    out.push({ kind: tag as ShapeEl["kind"], attrs: numericAttrs, paint });
  }
};

/**
 * Paint a parsed icon into the given bounds. The painter scales the viewBox
 * uniformly with `slice` semantics — preserving aspect ratio and centering.
 */
export const paintSvgIcon = (
  icon: SvgIcon,
  bounds: { x: number; y: number; width: number; height: number },
  target: RenderTarget,
): void => {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const sx = bounds.width / icon.viewBox.width;
  const sy = bounds.height / icon.viewBox.height;
  const s = Math.min(sx, sy);
  const offsetX = bounds.x + (bounds.width - icon.viewBox.width * s) / 2;
  const offsetY = bounds.y + (bounds.height - icon.viewBox.height * s) / 2;

  target.save();
  target.translate(offsetX, offsetY);
  target.scale(s, s);
  target.translate(-icon.viewBox.x, -icon.viewBox.y);

  for (const el of icon.elements) {
    paintElement(el, target);
  }

  target.restore();
};

const paintElement = (el: Element, target: RenderTarget): void => {
  switch (el.kind) {
    case "path":
      paintPath(el, target);
      return;
    case "polygon":
    case "polyline":
      paintPolygon(el, target);
      return;
    case "rect":
      paintRect(el, target);
      return;
    case "circle":
      paintCircle(el, target);
      return;
    case "ellipse":
      paintEllipse(el, target);
      return;
    case "line":
      paintLine(el, target);
      return;
  }
};

const paintPath = (el: PathEl, target: RenderTarget): void => {
  applyPaint(el.paint, target);
  target.beginPath();
  for (const c of el.commands) {
    switch (c.kind) {
      case "move":
        target.moveTo(c.x, c.y);
        break;
      case "line":
        target.lineTo(c.x, c.y);
        break;
      case "quad":
        target.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
        break;
      case "cubic":
        target.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y);
        break;
      case "close":
        target.closePath();
        break;
    }
  }
  if (el.paint.fill) target.fill();
  if (el.paint.stroke) target.stroke();
};

const paintPolygon = (el: PolygonEl, target: RenderTarget): void => {
  if (el.points.length === 0) return;
  applyPaint(el.paint, target);
  target.beginPath();
  target.moveTo(el.points[0]!.x, el.points[0]!.y);
  for (let i = 1; i < el.points.length; i++) target.lineTo(el.points[i]!.x, el.points[i]!.y);
  if (el.kind === "polygon") target.closePath();
  if (el.paint.fill) target.fill();
  if (el.paint.stroke) target.stroke();
};

const paintRect = (el: ShapeEl, target: RenderTarget): void => {
  const x = el.attrs.x ?? 0;
  const y = el.attrs.y ?? 0;
  const w = el.attrs.width ?? 0;
  const h = el.attrs.height ?? 0;
  applyPaint(el.paint, target);
  target.beginPath();
  target.rect(x, y, w, h);
  if (el.paint.fill) target.fill();
  if (el.paint.stroke) target.stroke();
};

const paintCircle = (el: ShapeEl, target: RenderTarget): void => {
  const cx = el.attrs.cx ?? 0;
  const cy = el.attrs.cy ?? 0;
  const r = el.attrs.r ?? 0;
  applyPaint(el.paint, target);
  target.beginPath();
  target.ellipse(cx, cy, r, r);
  if (el.paint.fill) target.fill();
  if (el.paint.stroke) target.stroke();
};

const paintEllipse = (el: ShapeEl, target: RenderTarget): void => {
  const cx = el.attrs.cx ?? 0;
  const cy = el.attrs.cy ?? 0;
  const rx = el.attrs.rx ?? 0;
  const ry = el.attrs.ry ?? 0;
  applyPaint(el.paint, target);
  target.beginPath();
  target.ellipse(cx, cy, rx, ry);
  if (el.paint.fill) target.fill();
  if (el.paint.stroke) target.stroke();
};

const paintLine = (el: ShapeEl, target: RenderTarget): void => {
  const x1 = el.attrs.x1 ?? 0;
  const y1 = el.attrs.y1 ?? 0;
  const x2 = el.attrs.x2 ?? 0;
  const y2 = el.attrs.y2 ?? 0;
  applyPaint(el.paint, target);
  target.beginPath();
  target.moveTo(x1, y1);
  target.lineTo(x2, y2);
  if (el.paint.stroke) target.stroke();
};

const applyPaint = (paint: Paint, target: RenderTarget): void => {
  if (paint.fill) target.setFill(paint.fill);
  if (paint.stroke) target.setStroke(paint.stroke);
  target.setStrokeWidth(paint.strokeWidth);
};

// --- Helpers ---

const parseAttrs = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out[m[1]!] = m[2]!;
  return out;
};

const parseViewBox = (
  value: string | undefined,
): { x: number; y: number; width: number; height: number } | null => {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
};

const parsePoints = (value: string): { x: number; y: number }[] => {
  const nums = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

const mergePaint = (
  inherit: Paint,
  attrs: Record<string, string>,
  defaultColor: string,
): Paint => ({
  fill: attrs.fill !== undefined ? normaliseColor(attrs.fill, defaultColor) : inherit.fill,
  stroke: attrs.stroke !== undefined ? normaliseColor(attrs.stroke, defaultColor) : inherit.stroke,
  strokeWidth:
    attrs["stroke-width"] !== undefined
      ? toNumber(attrs["stroke-width"], inherit.strokeWidth)
      : inherit.strokeWidth,
});

const normaliseColor = (raw: string | null, defaultColor: string): string | null => {
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  if (v === "none") return null;
  if (v === "currentcolor") return defaultColor;
  return raw;
};

const toNumber = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
};

// --- Path data parser ---

/**
 * Parse SVG path `d` attribute into our command sequence. Supports M/L/H/V/
 * C/Q/Z and their relative forms (m/l/h/v/c/q/z). Repeated coordinate sets
 * after M default to L (per the SVG spec). Arc (`A/a`), smooth cubics
 * (`S/s`) and smooth quads (`T/t`) are **not** supported — they return
 * an incomplete command stream rather than throwing, which is enough for
 * editor-style icons.
 */
const parsePathData = (d: string): Cmd[] => {
  const out: Cmd[] = [];
  // Tokenize: command letter or number.
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens) return out;

  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const take = (n: number): number[] => {
    const r: number[] = [];
    for (let k = 0; k < n; k++) r.push(parseFloat(tokens[i++]!));
    return r;
  };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (!/^[MLHVCSQTAZmlhvcsqtaz]$/.test(t)) {
      // Numeric without a preceding command: skip.
      i++;
      continue;
    }
    const cmd = t;
    i++;

    while (i < tokens.length && /^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(tokens[i]!)) {
      switch (cmd) {
        case "M":
        case "m": {
          const [dx, dy] = take(2) as [number, number];
          if (cmd === "M") {
            cx = dx;
            cy = dy;
          } else {
            cx += dx;
            cy += dy;
          }
          startX = cx;
          startY = cy;
          out.push({ kind: "move", x: cx, y: cy });
          break;
        }
        case "L":
        case "l": {
          const [dx, dy] = take(2) as [number, number];
          if (cmd === "L") {
            cx = dx;
            cy = dy;
          } else {
            cx += dx;
            cy += dy;
          }
          out.push({ kind: "line", x: cx, y: cy });
          break;
        }
        case "H":
        case "h": {
          const [dx] = take(1) as [number];
          cx = cmd === "H" ? dx : cx + dx;
          out.push({ kind: "line", x: cx, y: cy });
          break;
        }
        case "V":
        case "v": {
          const [dy] = take(1) as [number];
          cy = cmd === "V" ? dy : cy + dy;
          out.push({ kind: "line", x: cx, y: cy });
          break;
        }
        case "C":
        case "c": {
          const [c1x, c1y, c2x, c2y, x, y] = take(6) as [
            number,
            number,
            number,
            number,
            number,
            number,
          ];
          const rel = cmd === "c";
          const C1x = rel ? cx + c1x : c1x;
          const C1y = rel ? cy + c1y : c1y;
          const C2x = rel ? cx + c2x : c2x;
          const C2y = rel ? cy + c2y : c2y;
          const X = rel ? cx + x : x;
          const Y = rel ? cy + y : y;
          out.push({ kind: "cubic", c1x: C1x, c1y: C1y, c2x: C2x, c2y: C2y, x: X, y: Y });
          cx = X;
          cy = Y;
          break;
        }
        case "Q":
        case "q": {
          const [c1x, c1y, x, y] = take(4) as [number, number, number, number];
          const rel = cmd === "q";
          const CX = rel ? cx + c1x : c1x;
          const CY = rel ? cy + c1y : c1y;
          const X = rel ? cx + x : x;
          const Y = rel ? cy + y : y;
          out.push({ kind: "quad", cx: CX, cy: CY, x: X, y: Y });
          cx = X;
          cy = Y;
          break;
        }
        case "Z":
        case "z":
          out.push({ kind: "close" });
          cx = startX;
          cy = startY;
          // Z takes no operands; the outer `while` will see the next token
          // as a command letter (or end-of-input) and re-dispatch.
          break;
        case "S":
        case "s":
        case "T":
        case "t":
        case "A":
        case "a":
          // Unsupported — skip remaining numbers as best we can.
          // S/s = 4 nums, T/t = 2, A/a = 7.
          {
            const skip = cmd === "S" || cmd === "s" ? 4 : cmd === "T" || cmd === "t" ? 2 : 7;
            take(skip);
          }
          break;
        default:
          i++;
      }
      if (cmd === "Z" || cmd === "z") break;
    }
  }

  return out;
};
