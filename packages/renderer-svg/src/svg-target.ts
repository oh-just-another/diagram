import type { Bounds, Color, Transform, Vec2 } from "@oh-just-another/types";
import { matrix } from "@oh-just-another/math";
import type {
  FillRule,
  LineCap,
  LineJoin,
  RenderTarget,
  TextAlign,
  TextBaseline,
} from "@oh-just-another/renderer-core";
import { approxTextWidth } from "./measure-text.js";

/**
 * `RenderTarget` implementation that builds an SVG-string snapshot of the
 * scene. No DOM is touched, so it runs identically in Node and the browser.
 *
 * - Coordinates are pre-baked into the path data: every `moveTo` / `lineTo` is
 *   multiplied by the current transform before being written, so the emitted
 *   SVG has no nested `<g transform>` elements.
 * - Path elements are flushed on `fill()` / `stroke()`. Multiple fills or
 *   strokes against the same subpath emit duplicate `<path>` elements with
 *   different paint attributes, matching Canvas2D semantics.
 * - `clear()` resets the element list when called without bounds; bounded
 *   clears emit a white-filled rectangle.
 */
export class SvgTarget implements RenderTarget {
  readonly size: { readonly width: number; readonly height: number };

  /** Optional custom measurer; defaults to the char-ratio approximation. */
  private readonly measure: (text: string, fontFamily: string, fontSize: number) => number;

  // --- Style state ---
  private fillColor: Color | null = null;
  private strokeColor: Color | null = null;
  private strokeWidth = 1;
  private opacity = 1;
  private lineCap: LineCap = "butt";
  private lineJoin: LineJoin = "miter";
  private dashArray: readonly number[] | null = null;
  private fontFamily = "system-ui, sans-serif";
  private fontSize = 14;
  private fontWeight: "normal" | "bold" = "normal";
  private fontStyle: "normal" | "italic" = "normal";
  private textAlign: TextAlign = "left";
  private textBaseline: TextBaseline = "top";

  // --- Transform state ---
  private currentTransform: Transform = matrix.IDENTITY;

  // --- Path buffer ---
  private pathSegments: string[] = [];
  private pathCursor: Vec2 | null = null;

  // --- Output ---
  private readonly elements: string[] = [];

  // --- State stack ---
  private readonly stack: SavedState[] = [];

  constructor(options: {
    width: number;
    height: number;
    measureText?: (text: string, fontFamily: string, fontSize: number) => number;
  }) {
    this.size = { width: options.width, height: options.height };
    this.measure = options.measureText ?? approxTextWidth;
  }

  /**
   * Serialise the accumulated drawing into a self-contained SVG document
   * string. Safe to call multiple times.
   */
  toSvg(): string {
    const w = this.size.width;
    const h = this.size.height;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      this.elements.join("") +
      `</svg>`
    );
  }

  // --- Style ---

  setFill(color: Color | null): void {
    this.fillColor = color;
  }
  setStroke(color: Color | null): void {
    this.strokeColor = color;
  }
  setStrokeWidth(width: number): void {
    this.strokeWidth = width;
  }
  setOpacity(alpha: number): void {
    this.opacity = alpha;
  }
  setLineCap(cap: LineCap): void {
    this.lineCap = cap;
  }
  setLineJoin(join: LineJoin): void {
    this.lineJoin = join;
  }
  setDashArray(dash: readonly number[] | null): void {
    this.dashArray = dash;
  }
  setFont(
    fontFamily: string,
    fontSize: number,
    options?: { weight?: "normal" | "bold"; style?: "normal" | "italic" },
  ): void {
    this.fontFamily = fontFamily;
    this.fontSize = fontSize;
    this.fontWeight = options?.weight ?? "normal";
    this.fontStyle = options?.style ?? "normal";
  }
  setTextAlign(align: TextAlign): void {
    this.textAlign = align;
  }
  setTextBaseline(baseline: TextBaseline): void {
    this.textBaseline = baseline;
  }

  // --- State stack ---

  save(): void {
    this.stack.push({
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      opacity: this.opacity,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      dashArray: this.dashArray,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      transform: this.currentTransform,
    });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (!prev) return;
    this.fillColor = prev.fillColor;
    this.strokeColor = prev.strokeColor;
    this.strokeWidth = prev.strokeWidth;
    this.opacity = prev.opacity;
    this.lineCap = prev.lineCap;
    this.lineJoin = prev.lineJoin;
    this.dashArray = prev.dashArray;
    this.fontFamily = prev.fontFamily;
    this.fontSize = prev.fontSize;
    this.fontWeight = prev.fontWeight;
    this.fontStyle = prev.fontStyle;
    this.textAlign = prev.textAlign;
    this.textBaseline = prev.textBaseline;
    this.currentTransform = prev.transform;
  }

  // --- Transform ---

  translate(dx: number, dy: number): void {
    this.currentTransform = matrix.multiply(this.currentTransform, matrix.translation(dx, dy));
  }
  rotate(radians: number): void {
    this.currentTransform = matrix.multiply(this.currentTransform, matrix.rotation(radians));
  }
  scale(sx: number, sy: number): void {
    this.currentTransform = matrix.multiply(this.currentTransform, matrix.scaling(sx, sy));
  }
  setTransform(t: Transform): void {
    this.currentTransform = t;
  }
  resetTransform(): void {
    this.currentTransform = matrix.IDENTITY;
  }

  // --- Path primitives ---

  beginPath(): void {
    this.pathSegments = [];
    this.pathCursor = null;
  }

  closePath(): void {
    this.pathSegments.push("Z");
  }

  moveTo(x: number, y: number): void {
    const p = this.apply(x, y);
    this.pathSegments.push(`M${fmt(p.x)} ${fmt(p.y)}`);
    this.pathCursor = p;
  }

  lineTo(x: number, y: number): void {
    const p = this.apply(x, y);
    this.pathSegments.push(`L${fmt(p.x)} ${fmt(p.y)}`);
    this.pathCursor = p;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const c = this.apply(cx, cy);
    const p = this.apply(x, y);
    this.pathSegments.push(`Q${fmt(c.x)} ${fmt(c.y)} ${fmt(p.x)} ${fmt(p.y)}`);
    this.pathCursor = p;
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const c1 = this.apply(c1x, c1y);
    const c2 = this.apply(c2x, c2y);
    const p = this.apply(x, y);
    this.pathSegments.push(
      `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p.x)} ${fmt(p.y)}`,
    );
    this.pathCursor = p;
  }

  rect(x: number, y: number, width: number, height: number): void {
    // Decompose into a 4-segment poly: lets the rest of the pipeline treat
    // every fillable shape as a single `<path>`.
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    // Approximate an ellipse with 4 cubic Bezier curves (kappa = 0.5522847498).
    const kappa = 0.5522847498307936;
    const ox = rx * kappa;
    const oy = ry * kappa;
    this.moveTo(cx + rx, cy);
    this.bezierCurveTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry);
    this.bezierCurveTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy);
    this.bezierCurveTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry);
    this.bezierCurveTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy);
    this.closePath();
  }

  // --- Fill / stroke ---

  fill(rule: FillRule = "nonzero"): void {
    if (this.pathSegments.length === 0) return;
    const d = this.pathSegments.join(" ");
    const attrs = [
      `d="${d}"`,
      `fill="${this.fillColor ?? "none"}"`,
      rule === "evenodd" ? `fill-rule="evenodd"` : "",
      this.opacity !== 1 ? `fill-opacity="${this.opacity}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    this.elements.push(`<path ${attrs}/>`);
  }

  stroke(): void {
    if (this.pathSegments.length === 0) return;
    if (this.strokeColor === null || this.strokeWidth <= 0) return;
    const d = this.pathSegments.join(" ");
    const dash =
      this.dashArray && this.dashArray.length > 0
        ? `stroke-dasharray="${this.dashArray.join(" ")}"`
        : "";
    const attrs = [
      `d="${d}"`,
      `fill="none"`,
      `stroke="${this.strokeColor}"`,
      `stroke-width="${this.strokeWidth}"`,
      this.lineCap !== "butt" ? `stroke-linecap="${this.lineCap}"` : "",
      this.lineJoin !== "miter" ? `stroke-linejoin="${this.lineJoin}"` : "",
      dash,
      this.opacity !== 1 ? `stroke-opacity="${this.opacity}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    this.elements.push(`<path ${attrs}/>`);
  }

  // --- Text ---

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    if (!text) return;
    const p = this.apply(x, y);
    // SVG's text anchor matches Canvas's `textAlign`.
    const anchor =
      this.textAlign === "center" ? "middle" : this.textAlign === "right" ? "end" : "start";
    // SVG's `dominant-baseline` mapping for our 3 supported baselines.
    const baseline =
      this.textBaseline === "middle"
        ? "central"
        : this.textBaseline === "bottom"
          ? "alphabetic"
          : "hanging";
    const attrs = [
      `x="${fmt(p.x)}"`,
      `y="${fmt(p.y)}"`,
      `font-family="${escapeAttr(this.fontFamily)}"`,
      `font-size="${this.fontSize}"`,
      this.fontWeight === "bold" ? `font-weight="bold"` : "",
      this.fontStyle === "italic" ? `font-style="italic"` : "",
      `fill="${this.fillColor ?? "#000"}"`,
      `text-anchor="${anchor}"`,
      `dominant-baseline="${baseline}"`,
      this.opacity !== 1 ? `fill-opacity="${this.opacity}"` : "",
      maxWidth !== undefined ? `textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    this.elements.push(`<text ${attrs}>${escapeText(text)}</text>`);
  }

  measureText(text: string): { width: number } {
    return { width: this.measure(text, this.fontFamily, this.fontSize) };
  }

  // --- Images ---

  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    if (typeof image !== "string" || image === "") return;
    const p = this.apply(dx, dy);
    // Note: this is a 1:1 axis-aligned blit. Rotated/skewed transforms are
    // not preserved on the `<image>` element. For richer cases the caller
    // should compose with a `<g transform>` themselves.
    this.elements.push(
      `<image x="${fmt(p.x)}" y="${fmt(p.y)}" width="${dw}" height="${dh}" href="${escapeAttr(image)}"/>`,
    );
  }

  // --- Surface control ---

  clear(bounds?: Bounds): void {
    if (!bounds) {
      this.elements.length = 0;
      return;
    }
    // Bounded clear → white rect (mirrors what a canvas `clearRect` would do
    // visually on a default white background).
    const p1 = this.apply(bounds.x, bounds.y);
    const p2 = this.apply(bounds.x + bounds.width, bounds.y + bounds.height);
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    this.elements.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${w}" height="${h}" fill="#fff"/>`,
    );
  }

  // --- Internal ---

  private apply(x: number, y: number): Vec2 {
    return matrix.applyToPoint(this.currentTransform, { x, y });
  }
}

interface SavedState {
  fillColor: Color | null;
  strokeColor: Color | null;
  strokeWidth: number;
  opacity: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  dashArray: readonly number[] | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: TextAlign;
  textBaseline: TextBaseline;
  transform: Transform;
}

/** Trim trailing zeros from numeric attributes to keep the output compact. */
const fmt = (n: number): string => {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
};

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
