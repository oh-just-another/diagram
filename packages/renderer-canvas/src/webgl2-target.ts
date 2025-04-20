import type {
  Bounds,
  Color,
  Transform,
  Vec2,
} from "@oh-just-another/types";
import type {
  FillRule,
  LineCap,
  LineJoin,
  RenderTarget,
  TextAlign,
  TextBaseline,
} from "@oh-just-another/renderer-core";
import { getActiveRasterizer, getActiveTextShaper } from "@oh-just-another/renderer-core";
import { GlyphAtlas, type MsdfShaper } from "@oh-just-another/glyph-atlas";
import { parseWebGL2Color } from "./webgl2-color.js";
import { MsdfTextPipeline } from "./webgl2-msdf-text.js";

/**
 * WebGL2 RenderTarget. Implements clear, transform/state stack, path
 * primitives (rect / polyline / ellipse / Bezier), fill, stroke, text
 * (MSDF or OffscreenCanvas-bitmap fallback), and image drawing.
 */
export class WebGL2Target implements RenderTarget {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly uTransformLoc: WebGLUniformLocation;
  private readonly uColorLoc: WebGLUniformLocation;
  private readonly uOpacityLoc: WebGLUniformLocation;
  private readonly _size: { width: number; height: number };

  private fillColor: [number, number, number] = [0, 0, 0];
  private fillAlpha = 1;
  private strokeColor: [number, number, number] = [0, 0, 0];
  private strokeAlpha = 1;
  private fillColorString: string = "#000";
  private strokeWidth = 1;
  private opacity = 1;
  private currentPath: Bounds | null = null;
  // Text state — kept in sync with Canvas2D semantics and replayed into
  // the hidden text bitmap canvas per fillText call.
  private fontFamily = "sans-serif";
  private fontSize = 14;
  private textAlign: TextAlign = "left";
  private textBaseline: TextBaseline = "top";
  /**
   * Polyline path being assembled by moveTo / lineTo. Cleared on
   * `beginPath()`; pushed to GPU on `stroke()`. Bezier curves still
   * throw NotImplemented — see `notImpl()`.
   */
  private currentPolyline: Vec2[] = [];
  private transform: MutableTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private readonly stack: MutableTransform[] = [];

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, width: number, height: number) {
    // `preserveDrawingBuffer: true` is required for an editor surface:
    // the spec permits the browser to clear the drawing buffer after
    // each composite when this flag is false, which makes shapes
    // disappear in the steady state. Trading a small copy at composite
    // time for visual correctness is the right call.
    //
    // Try with antialiasing first; some integrated GPUs deny the
    // context when MSAA isn't available. Retry plain on failure so
    // WebGL2 isn't lost entirely for a stylistic preference.
    let gl = (canvas as HTMLCanvasElement).getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      gl = (canvas as HTMLCanvasElement).getContext("webgl2", {
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
      });
    }
    if (!gl) {
      throw new Error(
        "WebGL2 unavailable in this environment (probably hit the per-page GL context cap; " +
          "Chrome allows ~16). LayeredSurface will fall back to canvas2d.",
      );
    }
    this.gl = gl as WebGL2RenderingContext;
    this._size = { width, height };

    const vert = compile(
      this.gl,
      this.gl.VERTEX_SHADER,
      VERTEX_SHADER,
    );
    const frag = compile(
      this.gl,
      this.gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );
    this.program = link(this.gl, vert, frag);
    this.gl.useProgram(this.program);

    // Single quad shared across every fill — vertex shader applies
    // the per-call transform to scale + translate it into place.
    this.vbo = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
    const aPos = this.gl.getAttribLocation(this.program, "aPos");
    this.gl.enableVertexAttribArray(aPos);
    this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);

    this.uTransformLoc = this.gl.getUniformLocation(this.program, "uTransform")!;
    this.uColorLoc = this.gl.getUniformLocation(this.program, "uColor")!;
    this.uOpacityLoc = this.gl.getUniformLocation(this.program, "uOpacity")!;

    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // Initial viewport — must match the canvas drawing buffer size. The
    // WebGL spec defaults to the canvas's initial size, but if the
    // canvas was resized via setupHiDpiNoContext after creation the
    // viewport stays at the first size, so set it explicitly.
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  get size(): { readonly width: number; readonly height: number } {
    return this._size;
  }

  /**
   * Update the recorded CSS-pixel size after the host resizes the
   * underlying canvas. Callers handle `setupHiDpi` / `gl.viewport`
   * updates on the actual canvas; this keeps the target's `size` getter
   * in sync so downstream renderers see the new dimensions.
   */
  resize(width: number, height: number): void {
    this._size.width = width;
    this._size.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Free the underlying WebGL context immediately. Browsers cap the
   * number of live WebGL contexts per page (~16 in Chrome); without
   * `WEBGL_lose_context`, GC can take a while to collect old surfaces
   * and runtime backend switches quickly hit the cap.
   */
  dispose(): void {
    if (this.msdfPipeline) {
      this.msdfPipeline.dispose();
      this.msdfPipeline = null;
    }
    if (this.glyphAtlas) {
      this.glyphAtlas.dispose(this.gl);
      this.glyphAtlas = null;
      this.glyphAtlasShaper = null;
    }
    const lose = this.gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
  }

  // --- Style ---

  setFill(color: Color | null): void {
    const parsed = parseWebGL2Color(color);
    this.fillColor = [parsed[0], parsed[1], parsed[2]];
    this.fillAlpha = parsed[3];
    this.fillColorString = color ?? "transparent";
  }

  setOpacity(alpha: number): void {
    this.opacity = alpha;
  }

  // --- State stack ---

  save(): void {
    this.stack.push({ ...this.transform });
  }

  restore(): void {
    const next = this.stack.pop();
    if (next) this.transform = next;
  }

  // --- Transform ---

  setTransform(t: Transform): void {
    this.transform = {
      a: t.a,
      b: t.b,
      c: t.c,
      d: t.d,
      e: t.e,
      f: t.f,
    };
  }

  resetTransform(): void {
    this.transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  translate(dx: number, dy: number): void {
    this.transform.e += this.transform.a * dx + this.transform.c * dy;
    this.transform.f += this.transform.b * dx + this.transform.d * dy;
  }

  rotate(radians: number): void {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const { a, b, c: tc, d } = this.transform;
    this.transform.a = a * c + tc * s;
    this.transform.b = b * c + d * s;
    this.transform.c = a * -s + tc * c;
    this.transform.d = b * -s + d * c;
  }

  scale(sx: number, sy: number): void {
    this.transform.a *= sx;
    this.transform.b *= sx;
    this.transform.c *= sy;
    this.transform.d *= sy;
  }

  // --- Path primitives ---

  beginPath(): void {
    this.currentPath = null;
    this.currentPolyline = [];
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.currentPath = { x, y, width, height };
  }

  moveTo(x: number, y: number): void {
    this.currentPolyline = [{ x, y }];
  }

  lineTo(x: number, y: number): void {
    this.currentPolyline.push({ x, y });
  }

  closePath(): void {
    if (this.currentPolyline.length > 1) {
      this.currentPolyline.push({ ...this.currentPolyline[0]! });
    }
  }

  /**
   * Stash the analytic ellipse — `fill()` draws it via the fragment-SDF
   * `EllipsePipeline` (1 quad, perfect curve at any zoom). The polyline
   * and polygon path are not populated up front; `stroke()` builds the
   * polyline lazily if it's needed, saving the 24-512 vertex allocation
   * when callers only fill.
   */
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    const scale = Math.hypot(this.transform.a, this.transform.b);
    const screenRadius = Math.max(rx, ry) * (Number.isFinite(scale) && scale > 0 ? scale : 1);
    // π · r · 2 / chord_length — pick enough segments that the
    // chord length stays under ~1 screen px.
    const segments = Math.max(
      ELLIPSE_MIN_SEGMENTS,
      Math.min(ELLIPSE_MAX_SEGMENTS, Math.ceil(Math.PI * screenRadius * 0.7)),
    );
    this.currentPolyline = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      this.currentPolyline.push({
        x: cx + rx * Math.cos(t),
        y: cy + ry * Math.sin(t),
      });
    }
    // Also expose as `currentPath` so a subsequent fill() picks the
    // polygon up via the same triangle-fan path.
    this.currentPath = null;
  }

  /**
   * Quadratic Bezier — flattened to a polyline. When the host has
   * installed an active `Rasterizer` (WASM flatten via
   * `setActiveRasterizer`), uses adaptive subdivision through the
   * registered rasterizer for tighter accuracy on long curves;
   * otherwise falls back to the bundled fixed-16-sample JS path.
   */
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const start = this.currentPolyline[this.currentPolyline.length - 1] ?? { x: cx, y: cy };
    const tolerance = this.currentFlattenTolerance();
    const r = getActiveRasterizer();
    if (r) {
      const pts = r.flatten(
        [
          { kind: "M", to: start },
          { kind: "Q", control: { x: cx, y: cy }, to: { x, y } },
        ],
        tolerance,
      );
      for (let i = 1; i < pts.length; i++) this.currentPolyline.push(pts[i]!);
      return;
    }
    // Fallback: pick a sample count so the chord-to-curve error is
    // similar to the WASM path's tolerance. Scaled with the curve's
    // bbox so short curves don't get an over-tessellated polygon.
    const count = Math.max(8, Math.min(128, Math.ceil(curveLengthEstimate(start, { x, y }) / tolerance)));
    const samples = sampleQuadratic(start, { x: cx, y: cy }, { x, y }, count);
    for (let i = 1; i < samples.length; i++) this.currentPolyline.push(samples[i]!);
  }

  /** Cubic Bezier — same dual JS-or-WASM flatten path as quadratic. */
  bezierCurveTo(
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): void {
    const start = this.currentPolyline[this.currentPolyline.length - 1] ?? { x, y };
    const tolerance = this.currentFlattenTolerance();
    const r = getActiveRasterizer();
    if (r) {
      const pts = r.flatten(
        [
          { kind: "M", to: start },
          {
            kind: "C",
            control1: { x: c1x, y: c1y },
            control2: { x: c2x, y: c2y },
            to: { x, y },
          },
        ],
        tolerance,
      );
      for (let i = 1; i < pts.length; i++) this.currentPolyline.push(pts[i]!);
      return;
    }
    const count = Math.max(12, Math.min(192, Math.ceil(curveLengthEstimate(start, { x, y }) / tolerance)));
    const samples = sampleCubic(start, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x, y }, count);
    for (let i = 1; i < samples.length; i++) this.currentPolyline.push(samples[i]!);
  }

  /**
   * World-unit tolerance that maps to ~`SCREEN_TOLERANCE_PX` on screen
   * at the current transform. Used by every curve-flatten call so the
   * polyline density tracks the zoom.
   */
  private currentFlattenTolerance(): number {
    // Linear scale factor of the affine (length of the transformed
    // unit x-axis). `transform.a/b` are the matrix's first column;
    // uniform scale (no shear) holds for every path Editor sends.
    // Guard against zero / NaN.
    const scale = Math.hypot(this.transform.a, this.transform.b);
    if (!Number.isFinite(scale) || scale <= 0) return SCREEN_TOLERANCE_PX;
    return SCREEN_TOLERANCE_PX / scale;
  }

  /**
   * Image rendering — uploads `image` to a freshly-created GL texture
   * on first call, caches it by reference for subsequent frames. Drawn
   * as a textured quad via a dedicated program created lazily on the
   * first image call.
   */
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    const tex = this.textureFor(image as TexImageSource);
    if (!tex) return;
    if (!this.imageProgram) this.imageProgram = createImageProgram(this.gl);
    const ip = this.imageProgram;
    this.gl.useProgram(ip.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      // unit-quad pos + tex coords interleaved
      new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1]),
      this.gl.DYNAMIC_DRAW,
    );
    this.gl.enableVertexAttribArray(ip.aPos);
    this.gl.vertexAttribPointer(ip.aPos, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(ip.aUV);
    this.gl.vertexAttribPointer(ip.aUV, 2, this.gl.FLOAT, false, 16, 8);

    // Project the drawn region through transform + viewport.
    const projected = applyImageMat(
      {
        a: this.transform.a * dw,
        b: this.transform.b * dw,
        c: this.transform.c * dh,
        d: this.transform.d * dh,
        e: this.transform.e + this.transform.a * dx + this.transform.c * dy,
        f: this.transform.f + this.transform.b * dx + this.transform.d * dy,
      },
      this._size.width,
      this._size.height,
    );
    this.gl.uniformMatrix3fv(ip.uTransform, false, projected);
    this.gl.uniform1f(ip.uOpacity, this.opacity);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.uniform1i(ip.uTex, 0);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    // Restore the solid-colour program for subsequent fills /
    // strokes.
    this.gl.useProgram(this.program);
    const aPos = this.gl.getAttribLocation(this.program, "aPos");
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
    this.gl.enableVertexAttribArray(aPos);
    this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
  }

  /** Lazy image program (created on the first drawImage call). */
  private imageProgram: ImageProgram | null = null;
  private readonly textures = new WeakMap<object, WebGLTexture>();

  private textureFor(src: TexImageSource): WebGLTexture | null {
    if (!src || typeof src !== "object") return null;
    const cached = this.textures.get(src as object);
    if (cached) return cached;
    const tex = this.gl.createTexture();
    if (!tex) return null;
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      src,
    );
    this.textures.set(src as object, tex);
    return tex;
  }

  fill(_rule?: FillRule): void {
    void _rule;
    const effectiveAlpha = this.opacity * this.fillAlpha;
    if (effectiveAlpha <= 0) return; // transparent fill — nothing to draw

    // Rect path — uses the bundled unit-quad VBO + uTransform
    // pre-multiplied to map [0,1]² onto the rect bounds. Cheapest path;
    // most shape backgrounds (rectangles) hit it.
    if (this.currentPath) {
      const r = this.currentPath;
      const projected = applyMat({
        a: this.transform.a * r.width,
        b: this.transform.b * r.width,
        c: this.transform.c * r.height,
        d: this.transform.d * r.height,
        e: this.transform.e + this.transform.a * r.x + this.transform.c * r.y,
        f: this.transform.f + this.transform.b * r.x + this.transform.d * r.y,
      }, this._size.width, this._size.height);
      this.restoreSolidProgram(); // ensure the solid VBO+attrib is live
      this.gl.uniformMatrix3fv(this.uTransformLoc, false, projected);
      this.gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
      this.gl.uniform1f(this.uOpacityLoc, effectiveAlpha);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // Polygon path — assembled via moveTo / lineTo / bezierCurveTo.
    // Most editor shapes that hit this branch (ellipse, rounded
    // rectangle, container outline, edge connectors) are convex
    // or near-convex, so a triangle fan from the first vertex is
    // sufficient and orders-of-magnitude cheaper than running an
    // earcut triangulator per fill. Concave polygons render with
    // an outline-correct silhouette but a slightly off interior
    // fill — fine for now; if we ever ship a star / lightning-bolt
    // shape we'll swap this for earcut here without touching any
    // caller.
    if (this.currentPolyline.length >= 3) {
      this.fillPolygonFan(this.currentPolyline, effectiveAlpha);
    }
  }

  /**
   * Emit one big triangle-fan for the polygon and draw it through
   * the solid program. Vertices are pre-projected into clip space
   * so the program's `uTransform` stays identity for this call.
   */
  private fillPolygonFan(polyline: readonly Vec2[], effectiveAlpha: number): void {
    // Skip the implicitly-closed duplicate last vertex if the
    // caller already issued `closePath` — saves one redundant
    // triangle in the fan.
    const n =
      polyline.length >= 4 &&
      polyline[0]!.x === polyline[polyline.length - 1]!.x &&
      polyline[0]!.y === polyline[polyline.length - 1]!.y
        ? polyline.length - 1
        : polyline.length;
    if (n < 3) return;
    const sx = 2 / this._size.width;
    const sy = -2 / this._size.height;
    const verts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = polyline[i]!;
      const wx = this.transform.a * p.x + this.transform.c * p.y + this.transform.e;
      const wy = this.transform.b * p.x + this.transform.d * p.y + this.transform.f;
      verts[i * 2] = wx * sx - 1;
      verts[i * 2 + 1] = wy * sy + 1;
    }
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(this.uTransformLoc, false, IDENTITY_MAT3);
    gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
    gl.uniform1f(this.uOpacityLoc, effectiveAlpha);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, n);
  }

  /**
   * Clear the canvas. With no `bounds` does a full backbuffer wipe; with
   * `bounds` wipes only the rectangle the editor's dirty-rect pass
   * identified. Honouring `bounds` is mandatory — when the scene
   * reference doesn't change, the editor sends a zero-area dirty rect
   * and expects the previous frame to survive untouched.
   * `preserveDrawingBuffer: true` carries the persistent frame across
   * composites.
   *
   * For bounded clears the implementation flips on a scissor box so the
   * clear is confined to the dirty rect, mirroring Canvas2D's
   * partial-clear semantics. The scissor box is in DPR-bitmap pixels
   * with bottom-left origin (GL convention), translated from the
   * caller's top-left CSS-pixel rect.
   */
  clear(bounds?: Bounds): void {
    const bitmapW = (this.gl.canvas as HTMLCanvasElement).width;
    const bitmapH = (this.gl.canvas as HTMLCanvasElement).height;
    if (bounds) {
      // Editor's "nothing changed" sentinel is a zero/negative-area rect.
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const dprX = this._size.width > 0 ? bitmapW / this._size.width : 1;
      const dprY = this._size.height > 0 ? bitmapH / this._size.height : 1;
      const x = Math.floor(bounds.x * dprX);
      const w = Math.ceil(bounds.width * dprX);
      const h = Math.ceil(bounds.height * dprY);
      // GL scissor origin is bottom-left; the editor speaks top-left.
      const y = Math.floor(bitmapH - (bounds.y + bounds.height) * dprY);
      this.gl.viewport(0, 0, bitmapW, bitmapH);
      this.gl.enable(this.gl.SCISSOR_TEST);
      this.gl.scissor(x, y, w, h);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.gl.disable(this.gl.SCISSOR_TEST);
      return;
    }
    this.gl.viewport(0, 0, bitmapW, bitmapH);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  // --- Stroke pipeline ---

  setStroke(color: Color | null): void {
    const parsed = parseWebGL2Color(color);
    this.strokeColor = [parsed[0], parsed[1], parsed[2]];
    this.strokeAlpha = parsed[3];
  }

  setStrokeWidth(width: number): void {
    this.strokeWidth = Math.max(0, width);
  }

  stroke(): void {
    if (this.currentPath) {
      // Rect outline → 4 corners as a closed polyline.
      const r = this.currentPath;
      this.currentPolyline = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
        { x: r.x, y: r.y },
      ];
    }
    if (this.currentPolyline.length < 2) return;
    const effectiveAlpha = this.opacity * this.strokeAlpha;
    if (effectiveAlpha <= 0) return; // transparent stroke — nothing to draw
    drawPolylineStroke(
      this.gl,
      this.currentPolyline,
      this.strokeWidth,
      this.strokeColor,
      effectiveAlpha,
      this.transform,
      this._size,
      this.uTransformLoc,
      this.uColorLoc,
      this.uOpacityLoc,
      this.vbo,
    );
  }

  // --- Stubs — text / curves / images remain Canvas2D fallback ---
  setLineCap(_cap: LineCap): void {
    void _cap;
  }
  setLineJoin(_join: LineJoin): void {
    void _join;
  }
  setDashArray(_dash: readonly number[] | null): void {
    void _dash;
  }
  setFont(family: string, size: number): void {
    this.fontFamily = family;
    this.fontSize = size;
  }
  setTextAlign(align: TextAlign): void {
    this.textAlign = align;
  }
  setTextBaseline(baseline: TextBaseline): void {
    this.textBaseline = baseline;
  }

  /**
   * Text rendering with two paths:
   *
   *   1. MSDF (preferred) — when an `MsdfShaper`-compatible TextShaper
   *      is registered. Builds per-glyph quads against a shared
   *      `GlyphAtlas`, draws them with the bundled MSDF program so
   *      letters stay crisp at any zoom (no bitmap re-rasterisation
   *      when the user scales the view).
   *
   *   2. OffscreenCanvas fallback — used when no MSDF-capable shaper is
   *      registered (older module, Safari without bundled wasm, etc.).
   */
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    if (text.length === 0) return;
    void maxWidth;
    const atlas = this.ensureGlyphAtlas();
    if (!this.loggedTextPath && typeof console !== "undefined") {
      this.loggedTextPath = true;
      const shaper = getActiveTextShaper();
      // eslint-disable-next-line no-console
      console.log(
        "[WebGL2Target.fillText] path:",
        atlas ? "MSDF" : "OffscreenCanvas fallback",
        "shaper:",
        shaper ? shaper.constructor.name : "none",
        "shaper has glyphMetrics:",
        !!(shaper && typeof (shaper as { glyphMetrics?: unknown }).glyphMetrics === "function"),
      );
    }
    if (atlas) {
      this.fillTextMSDF(text, x, y, atlas);
      return;
    }
    const bitmap = this.rasteriseString(text);
    if (!bitmap) return;
    const m = this.textMetrics(text);
    let px = x;
    if (this.textAlign === "center") px -= m.width / 2;
    else if (this.textAlign === "right") px -= m.width;
    let py = y;
    if (this.textBaseline === "middle") py -= this.fontSize / 2;
    else if (this.textBaseline === "bottom") py -= this.fontSize;
    this.drawImage(bitmap, px, py, m.width, this.fontSize * 1.4);
  }

  private msdfPipeline: MsdfTextPipeline | null = null;
  private glyphAtlas: GlyphAtlas | null = null;
  private glyphAtlasShaper: MsdfShaper | null = null;
  private loggedTextPath = false;

  /**
   * Lazy-acquire the MSDF atlas — only when there's an
   * `MsdfShaper`-compatible TextShaper registered via
   * `setActiveTextShaper`. Held for the lifetime of the WebGL2Target;
   * cleared on dispose.
   *
   * Re-creates the atlas if a different shaper instance gets registered
   * later. Same shaper instance → reuses the existing cache, so
   * steady-state cost is one map lookup.
   */
  private ensureGlyphAtlas(): GlyphAtlas | null {
    const shaper = getActiveTextShaper();
    if (!shaper) return null;
    if (!isMsdfShaper(shaper)) return null;
    if (this.glyphAtlas && this.glyphAtlasShaper === shaper) return this.glyphAtlas;
    if (this.glyphAtlas) this.glyphAtlas.dispose(this.gl);
    this.glyphAtlas = new GlyphAtlas(shaper);
    this.glyphAtlasShaper = shaper;
    return this.glyphAtlas;
  }

  /**
   * MSDF path for `fillText`. Honours textAlign / textBaseline by
   * measuring the string width upfront and shifting the cursor. Width
   * measurement walks the atlas (advance from cached metrics), so it
   * doesn't round-trip the WASM measure().
   */
  private fillTextMSDF(text: string, x: number, y: number, atlas: GlyphAtlas): void {
    if (!this.msdfPipeline) this.msdfPipeline = new MsdfTextPipeline(this.gl);
    // Compute width by walking the cached glyphs (avoids a measure
    // round-trip; falls back to 0 if a glyph isn't bakeable so the
    // text still positions at the cursor).
    let widthPx = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      const glyph = atlas.getOrRasterize(cp);
      if (!glyph) break;
      widthPx += (glyph.advance * this.fontSize) / glyph.unitsPerEm;
    }
    let px = x;
    if (this.textAlign === "center") px -= widthPx / 2;
    else if (this.textAlign === "right") px -= widthPx;
    let py = y;
    // Editor convention: baseline=top means y is the top of the text
    // box. The MSDF quad math places the glyph relative to its font
    // baseline, so shift y down by one font size for the "top" baseline
    // (gets the visible bbox into [y, y+fontSize]).
    if (this.textBaseline === "top") py += this.fontSize;
    else if (this.textBaseline === "middle") py += this.fontSize / 2;
    // baseline=bottom uses py as-is (cursor sits on the baseline).
    this.msdfPipeline.drawText(
      text,
      px,
      py,
      this.fontSize,
      atlas,
      {
        opacity: this.opacity,
        color: this.fillColor,
        transform: this.transform,
      },
      this._size,
    );
    // The MSDF pipeline left its own program active; restore the
    // solid-fill program + VBO state so the next rect / polyline draw
    // uses the correct shader.
    this.restoreSolidProgram();
  }

  private restoreSolidProgram(): void {
    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
    const aPos = this.gl.getAttribLocation(this.program, "aPos");
    this.gl.enableVertexAttribArray(aPos);
    this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
  }
  measureText(text: string): { width: number } {
    return this.textMetrics(text);
  }

  // --- Glyph atlas (per-string fallback path) ---

  /** Hidden Canvas2D context for measureText + bitmap rasterisation. */
  private textCtx: CanvasRenderingContext2D | null = null;
  /** Per-string cache; reused by `drawImage`'s texture WeakMap. */
  private readonly textBitmaps = new Map<string, OffscreenCanvas>();

  private ensureTextCtx(): CanvasRenderingContext2D | null {
    if (this.textCtx) return this.textCtx;
    if (typeof OffscreenCanvas === "undefined") return null;
    const tmp = new OffscreenCanvas(1, 1);
    const ctx = tmp.getContext("2d");
    if (!ctx) return null;
    // OffscreenCanvasRenderingContext2D is structurally compatible with
    // the methods used here (font / measureText / fillText / textAlign /
    // textBaseline).
    this.textCtx = ctx as unknown as CanvasRenderingContext2D;
    return this.textCtx;
  }

  private textFontSpec(): string {
    return `${this.fontSize}px ${this.fontFamily}`;
  }

  private textMetrics(text: string): { width: number } {
    const ctx = this.ensureTextCtx();
    if (!ctx) return { width: text.length * this.fontSize * 0.55 };
    ctx.font = this.textFontSpec();
    return { width: ctx.measureText(text).width };
  }

  private rasteriseString(text: string): OffscreenCanvas | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const key = `${text}|${this.textFontSpec()}|${this.fillColorString}`;
    const cached = this.textBitmaps.get(key);
    if (cached) return cached;
    const m = this.textMetrics(text);
    // Pad height by 40% — covers font ascent/descent fuzz without
    // requiring per-font TextMetrics support.
    const w = Math.max(1, Math.ceil(m.width));
    const h = Math.max(1, Math.ceil(this.fontSize * 1.4));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = this.textFontSpec();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = this.fillColorString;
    ctx.fillText(text, 0, 0);
    this.textBitmaps.set(key, canvas);
    return canvas;
  }
}

/** Mutable mirror of `Transform` for the internal matrix book-keeping. */
type MutableTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

/**
 * Triangulate `polyline` into a single continuous triangle strip
 * with **miter joins** at every interior vertex, and draw it via
 * the solid-colour program. Each polyline vertex contributes one
 * pair of side vertices (offset on the bisector of the two
 * adjacent segments); the strip is uploaded once and drawn in a
 * single `drawArrays(TRIANGLE_STRIP)` call.
 *
 * Why one strip + miters instead of per-segment quads:
 *   • Per-segment quads leave visible gaps at every bend — at
 *     high zoom the user sees the curve as a sequence of
 *     disconnected rectangles. Continuous strip removes the gaps.
 *   • Miter offsets keep the outer / inner edge straight through
 *     the bend (matches what Canvas2D `stroke` does by default).
 *   • Strip with `TRIANGLE_STRIP` halves the vertex count vs.
 *     independent quads — fewer transform / project calls per
 *     pixel of stroke.
 *
 * Miter limit: when two segments meet at a very sharp angle, the
 * miter offset blows up (1/sin(angle/2)). Past `MITER_LIMIT × width`
 * we clamp to the average normal — visually equivalent to a bevel
 * join and prevents pixel-spike artefacts.
 */
const drawPolylineStroke = (
  gl: WebGL2RenderingContext,
  polyline: readonly Vec2[],
  width: number,
  color: readonly [number, number, number],
  opacity: number,
  transform: MutableTransform,
  size: { width: number; height: number },
  uTransformLoc: WebGLUniformLocation,
  uColorLoc: WebGLUniformLocation,
  uOpacityLoc: WebGLUniformLocation,
  vbo: WebGLBuffer,
): void => {
  if (width <= 0 || polyline.length < 2) return;
  const half = width / 2;

  // Pre-compute the unit normal for every segment so the bend at
  // each interior vertex can be evaluated cheaply.
  const segCount = polyline.length - 1;
  const nx = new Float32Array(segCount);
  const ny = new Float32Array(segCount);
  for (let i = 0; i < segCount; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / len;
    ny[i] = dx / len;
  }

  // Build the side offsets per polyline vertex:
  //   v0     → uses segment 0's normal directly.
  //   v[i]   → bisector of segments i-1 and i, scaled by miter
  //            length so the *outer* edges of the two side bands
  //            stay straight through the bend.
  //   v[N-1] → uses segment N-2's normal directly.
  const sideX = new Float32Array(polyline.length);
  const sideY = new Float32Array(polyline.length);
  sideX[0] = nx[0]! * half;
  sideY[0] = ny[0]! * half;
  const last = polyline.length - 1;
  sideX[last] = nx[segCount - 1]! * half;
  sideY[last] = ny[segCount - 1]! * half;
  for (let i = 1; i < last; i++) {
    const n1x = nx[i - 1]!;
    const n1y = ny[i - 1]!;
    const n2x = nx[i]!;
    const n2y = ny[i]!;
    // Bisector direction = (n1 + n2) normalised.
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
      // 180° turn — bisector ill-defined. Use a perpendicular
      // offset to whichever segment normal so the strip still
      // closes; visually equivalent to a butt cap mid-line.
      sideX[i] = n1x * half;
      sideY[i] = n1y * half;
      continue;
    }
    bx /= blen;
    by /= blen;
    // Miter length: half / cos(angle/2) = half / (b · n1)
    const cos = bx * n1x + by * n1y;
    const miterLen = cos > 1e-6 ? half / cos : half;
    const clamped = Math.min(miterLen, half * MITER_LIMIT);
    sideX[i] = bx * clamped;
    sideY[i] = by * clamped;
  }

  // Project every (left, right) vertex pair into clip space.
  const vertices = new Float32Array(polyline.length * 2 * 2);
  let writeOffset = 0;
  const sx = 2 / size.width;
  const sy = -2 / size.height;
  for (let i = 0; i < polyline.length; i++) {
    const p = polyline[i]!;
    const ox = sideX[i]!;
    const oy = sideY[i]!;
    // Left side (p + offset).
    const lx = p.x + ox;
    const ly = p.y + oy;
    const lwx = transform.a * lx + transform.c * ly + transform.e;
    const lwy = transform.b * lx + transform.d * ly + transform.f;
    vertices[writeOffset++] = lwx * sx - 1;
    vertices[writeOffset++] = lwy * sy + 1;
    // Right side (p - offset).
    const rx = p.x - ox;
    const ry = p.y - oy;
    const rwx = transform.a * rx + transform.c * ry + transform.e;
    const rwy = transform.b * rx + transform.d * ry + transform.f;
    vertices[writeOffset++] = rwx * sx - 1;
    vertices[writeOffset++] = rwy * sy + 1;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
  gl.uniformMatrix3fv(uTransformLoc, false, IDENTITY_MAT3);
  gl.uniform3f(uColorLoc, color[0], color[1], color[2]);
  gl.uniform1f(uOpacityLoc, opacity);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, polyline.length * 2);
};

/**
 * Maximum miter overshoot, in units of stroke width. Past this
 * the join falls back to a bevel-like average-normal offset so
 * sharp angles don't produce pixel-spike artefacts. 10 is the SVG
 * default and matches Canvas2D's `miterLimit`.
 */
const MITER_LIMIT = 10;

/**
 * Lower / upper bounds on the polygon approximation of an ellipse. The
 * minimum keeps small ellipses from collapsing to a hexagon at far zoom;
 * the maximum caps GPU work for huge ellipses where the marginal
 * pixel-error improvement is invisible.
 */
const ELLIPSE_MIN_SEGMENTS = 24;
const ELLIPSE_MAX_SEGMENTS = 512;

const IDENTITY_MAT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * Flatten tolerance, computed per-call: 0.5 / zoom in screen pixels.
 * The active screen-space scale is read off the current transform and
 * divided so the chord-to-curve error stays roughly half a pixel on
 * screen regardless of zoom.
 */
const SCREEN_TOLERANCE_PX = 0.5;

/**
 * Duck-type check for whether a TextShaper exposes the two methods
 * GlyphAtlas needs (`glyphMetrics` + `rasterizeGlyphMSDF`). The
 * `MsdfShaper` interface is structural, so any shaper that implements
 * them — including `WasmTextShaper` — qualifies. Shapers without these
 * methods return false and the renderer falls back to the
 * OffscreenCanvas bitmap path.
 */
const isMsdfShaper = (shaper: unknown): shaper is MsdfShaper => {
  const candidate = shaper as Partial<MsdfShaper>;
  return (
    typeof candidate.glyphMetrics === "function" &&
    typeof candidate.rasterizeGlyphMSDF === "function"
  );
};

/**
 * Cheap polyline-length stand-in for the curve length — an upper bound
 * proportional to it, used to pick a JS-fallback sample count
 * commensurate with the tolerance.
 */
const curveLengthEstimate = (a: Vec2, b: Vec2): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Sample a quadratic Bezier curve at `count` evenly-spaced t values. */
const sampleQuadratic = (
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  count: number,
): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
};

/** Sample a cubic Bezier curve at `count` evenly-spaced t values. */
const sampleCubic = (
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  count: number,
): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    out.push({
      x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
      y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
    });
  }
  return out;
};

/** Same projection as `applyMat` but emitted from drawImage. */
const applyImageMat = (t: MutableTransform, w: number, h: number): Float32Array => {
  const sx = 2 / w;
  const sy = -2 / h;
  return new Float32Array([
    t.a * sx, t.b * sy, 0,
    t.c * sx, t.d * sy, 0,
    t.e * sx - 1, t.f * sy + 1, 1,
  ]);
};

interface ImageProgram {
  readonly program: WebGLProgram;
  readonly aPos: number;
  readonly aUV: number;
  readonly uTransform: WebGLUniformLocation;
  readonly uTex: WebGLUniformLocation;
  readonly uOpacity: WebGLUniformLocation;
}

const createImageProgram = (gl: WebGL2RenderingContext): ImageProgram => {
  const vert = compile(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
in vec2 aPos;
in vec2 aUV;
uniform mat3 uTransform;
out vec2 vUV;
void main() {
  vec3 p = uTransform * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUV = aUV;
}`,
  );
  const frag = compile(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  vec4 t = texture(uTex, vUV);
  fragColor = vec4(t.rgb, t.a * uOpacity);
}`,
  );
  const program = link(gl, vert, frag);
  return {
    program,
    aPos: gl.getAttribLocation(program, "aPos"),
    aUV: gl.getAttribLocation(program, "aUV"),
    uTransform: gl.getUniformLocation(program, "uTransform")!,
    uTex: gl.getUniformLocation(program, "uTex")!,
    uOpacity: gl.getUniformLocation(program, "uOpacity")!,
  };
};

const notImpl = (method: string): never => {
  throw new Error(
    `WebGL2Target: ${method}() is out of MVP scope. Fall back to Canvas2DTarget for this draw call.`,
  );
};


/**
 * Build a 3×3 column-major matrix that maps a unit quad [0,0]–[1,1]
 * through the supplied 2D affine + a screen-to-clip conversion
 * (pixels → NDC).
 */
const applyMat = (t: Transform, w: number, h: number): Float32Array => {
  // Pixel-space → clip-space: x' = (x / w) * 2 - 1; y' = 1 - (y / h) * 2.
  const sx = 2 / w;
  const sy = -2 / h;
  return new Float32Array([
    t.a * sx, t.b * sy, 0,
    t.c * sx, t.d * sy, 0,
    t.e * sx - 1, t.f * sy + 1, 1,
  ]);
};

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
uniform mat3 uTransform;
void main() {
  vec3 p = uTransform * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, uOpacity);
}`;

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
};

const link = (
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram => {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
};
