import type { Bounds, Color, Transform, Vec2 } from "@oh-just-another/types";

export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";
export type TextAlign = "left" | "center" | "right";
export type TextBaseline = "top" | "middle" | "bottom";
export type FillRule = "nonzero" | "evenodd";

/**
 * Optional bold / italic for {@link RenderTarget.setFont}. Omitted →
 * normal weight & upright. Backends realise these differently: Canvas2D
 * folds them into the `ctx.font` shorthand; WebGL2 selects the matching
 * MSDF atlas font (faux-shear / weight where a variant is unavailable).
 */
export interface FontStyleOptions {
  readonly weight?: "normal" | "bold";
  readonly style?: "normal" | "italic";
}

/**
 * Backend-agnostic drawing surface. Both `renderer-canvas` (Canvas2D) and
 * `renderer-svg` (SVG string-builder) implement this interface. Keeping the
 * surface low-level lets shape renderers stay backend-agnostic without losing
 * fidelity — the methods map 1:1 to native Canvas2D primitives.
 */
export interface RenderTarget {
  // --- Style ---
  setFill(color: Color | null): void;
  setStroke(color: Color | null): void;
  setStrokeWidth(width: number): void;
  setOpacity(alpha: number): void;
  setLineCap(cap: LineCap): void;
  setLineJoin(join: LineJoin): void;
  setDashArray(dash: readonly number[] | null): void;
  setFont(fontFamily: string, fontSize: number, options?: FontStyleOptions): void;
  setTextAlign(align: TextAlign): void;
  setTextBaseline(baseline: TextBaseline): void;

  // --- State stack ---
  save(): void;
  restore(): void;

  // --- Transform ---
  translate(dx: number, dy: number): void;
  rotate(radians: number): void;
  scale(sx: number, sy: number): void;
  setTransform(t: Transform): void;
  resetTransform(): void;

  // --- Path primitives ---
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  ellipse(cx: number, cy: number, rx: number, ry: number): void;

  // --- Fill / stroke ---
  fill(rule?: FillRule): void;
  stroke(): void;

  // --- Text ---
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };

  // --- Images ---
  /**
   * Draw an image. The accepted `image` type depends on the backend:
   * Canvas2D expects a `CanvasImageSource`; SVG accepts a URL string;
   * Node-side targets can accept any backend-specific image handle.
   * The kernel does not load images — it just hands the source through.
   *
   * `dynamic` signals an animated source (GIF `<img>`, `<video>`)
   * whose pixels change between frames. Backends that cache an
   * uploaded copy (WebGL2 textures) MUST re-upload the current frame
   * when `dynamic` is true; backends that read the source live every
   * draw (Canvas2D) ignore it. Default `false` — static image.
   */
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    dynamic?: boolean,
  ): void;

  // --- Surface control ---
  /** Erase a region. Without bounds, erases everything. */
  clear(bounds?: Bounds): void;
  /** Current intrinsic surface size in CSS pixels (pre-DPR). */
  readonly size: { readonly width: number; readonly height: number };

  /**
   * Mark a screen-space rectangle as dirty for the *current* frame.
   * Optional hook — backends that don't need per-pass dirty tracking
   * can implement it as a no-op. Renderers call this after a draw
   * operation that paints outside the shape's intrinsic bbox (anti-
   * aliased stroke fuzz, drop shadows, oversized arrowheads) so the
   * host's next `clear()` can cover the actual painted area, not
   * just the geometric bbox.
   *
   * The bounds are in *screen pixels* (post-projection), matching
   * `clear(bounds)`.
   */
  markDirty?(bounds: Bounds): void;
}

/**
 * Convenience type for code that produces low-level draw calls without doing
 * any transform math itself.
 */
export type DrawPoint = Vec2;
