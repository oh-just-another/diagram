import type { Bounds, Color, Transform, Vec2 } from "@oh-just-another/types";
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
import earcut from "earcut";
import { parseWebGL2Color } from "./webgl2-color.js";
import { WEBGL2_IMAGE_TEXTURE_CACHE_CAP, WEBGL2_TEXT_BITMAP_CACHE_CAP } from "./constants.js";
import { MsdfTextPipeline } from "./webgl2-msdf-text.js";
import { drawPolylineStroke as drawPolylineStrokeImpl } from "./webgl2-stroke.js";
import { LoopBlinnCurvePipeline, type CurveSegment } from "./webgl2-curve.js";
import { EllipsePipeline } from "./webgl2-ellipse.js";
import { isDrawableImageSource, warnSkippedImage } from "./image-source.js";
import { compileShader, glReq, linkProgram } from "./webgl-helpers.js";

/**
 * WebGL2 RenderTarget. Implements clear, transform/state stack, path
 * primitives (rect / polyline / ellipse / Bezier), fill, stroke, text
 * (MSDF or OffscreenCanvas-bitmap fallback), and image drawing.
 */
export class WebGL2Target implements RenderTarget {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  /**
   * Static unit-quad VBO ([0,0]–[1,1]) — used by every solid-fill rect
   * draw. Filled once in the constructor with `STATIC_DRAW` and never
   * re-written; the rect's world-space placement is done entirely via
   * `uTransform`.
   */
  private readonly vbo: WebGLBuffer;
  /**
   * Per-frame scratch VBO for polygon / triangle-fan / stroke vertex
   * streams. Re-uploaded each draw with `DYNAMIC_DRAW`. Kept separate
   * from `vbo` so the static unit quad never gets stomped.
   */
  private readonly dynamicVbo: WebGLBuffer;
  private readonly uTransformLoc: WebGLUniformLocation | null;
  private readonly uColorLoc: WebGLUniformLocation | null;
  private readonly uOpacityLoc: WebGLUniformLocation | null;
  /**
   * Cached attribute location for the solid program. `getAttribLocation`
   * is a string-keyed driver lookup; repeating it per draw is a real
   * per-frame cost on integrated GPUs. Locations are stable once the
   * program is linked, so they're read once in the constructor.
   */
  private readonly aPosLoc: number;
  private readonly _size: { width: number; height: number };

  private fillColor: [number, number, number] = [0, 0, 0];
  private fillAlpha = 1;
  private strokeColor: [number, number, number] = [0, 0, 0];
  private strokeAlpha = 1;
  private fillColorString = "#000";
  private strokeWidth = 1;
  private lineCap: LineCap = "butt";
  private lineJoin: LineJoin = "miter";
  /** Dash pattern in WORLD units (matches Canvas2D, which dashes in the
   *  world-space ctx transform). `null` = solid. */
  private dashArray: readonly number[] | null = null;
  private opacity = 1;
  private currentPath: Bounds | null = null;
  // Text state — kept in sync with Canvas2D semantics and replayed into
  // the hidden text bitmap canvas per fillText call.
  private fontFamily = "sans-serif";
  private fontSize = 14;
  private fontWeight: "normal" | "bold" = "normal";
  private fontStyle: "normal" | "italic" = "normal";
  private textAlign: TextAlign = "left";
  private textBaseline: TextBaseline = "top";
  /**
   * Polyline path being assembled by moveTo / lineTo. Cleared on
   * `beginPath()`; pushed to GPU on `stroke()`.
   */
  private currentPolyline: Vec2[] = [];
  /**
   * Curve segments collected since the last `beginPath()`. Quadratic
   * and cubic Bezier `*CurveTo` calls push here in addition to pushing
   * the curve endpoint into `currentPolyline` — the polyline forms the
   * polygon hull for `fill()` triangulation, and the curve list adds
   * Loop-Blinn fragment-tested triangles on top so curve regions stay
   * perfectly smooth at any zoom.
   */
  private currentCurves: CurveSegment[] = [];
  /**
   * Ellipse parameters set by `ellipse()` — drives the fragment-SDF
   * `EllipsePipeline` on `fill()`. Separate from the polygon path so
   * `fill()` can skip the earcut pipeline entirely for ellipses (1 quad
   * vs 24-512 segments). `stroke()` falls back to building a polyline
   * lazily.
   */
  private currentEllipse: { cx: number; cy: number; rx: number; ry: number } | null = null;
  private transform: MutableTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  /**
   * save() / restore() snapshot stack. Mirrors Canvas2D's `ctx.save/
   * restore` contract: the full paint + text state is saved, not just
   * the transform — otherwise `opacity` / fill / stroke set inside a
   * save()…restore() block would leak onto everything drawn afterwards.
   * The current PATH is excluded — Canvas2D's save/restore doesn't
   * snapshot the path either.
   */
  private readonly stack: GfxState[] = [];

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
    gl ??= (canvas as HTMLCanvasElement).getContext("webgl2", {
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error(
        "WebGL2 unavailable in this environment (probably hit the per-page GL context cap; " +
          "Chrome allows ~16). LayeredSurface will fall back to canvas2d.",
      );
    }
    this.gl = gl;
    this._size = { width, height };

    const vert = compileShader(this.gl, this.gl.VERTEX_SHADER, VERTEX_SHADER, "WebGL2");
    const frag = compileShader(this.gl, this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER, "WebGL2");
    this.program = linkProgram(this.gl, vert, frag, "WebGL2");
    this.gl.useProgram(this.program);

    // Single quad shared across every solid-fill rect — the vertex
    // shader applies the per-call transform to scale + translate it
    // into place.
    this.vbo = glReq(this.gl.createBuffer());
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
    // Dynamic buffer for polygon / stroke / fan vertex streams. Created
    // empty — each draw bind + bufferData fills it.
    this.dynamicVbo = glReq(this.gl.createBuffer());

    this.aPosLoc = this.gl.getAttribLocation(this.program, "aPos");
    this.gl.enableVertexAttribArray(this.aPosLoc);
    this.gl.vertexAttribPointer(this.aPosLoc, 2, this.gl.FLOAT, false, 0, 0);

    this.uTransformLoc = this.gl.getUniformLocation(this.program, "uTransform");
    this.uColorLoc = this.gl.getUniformLocation(this.program, "uColor");
    this.uOpacityLoc = this.gl.getUniformLocation(this.program, "uOpacity");

    this.gl.enable(this.gl.BLEND);
    // Premultiplied-alpha blending. The context was created with
    // `premultipliedAlpha: true` — that's the contract with the browser
    // compositor, which treats the framebuffer RGB as
    // already-multiplied-by-A. So both the blend func and every
    // fragment shader speak premul: shader writes `(rgb*a, a)`, blend
    // func uses `(ONE, ONE_MINUS_SRC_ALPHA)`.
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

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
    if (this.indexBuffer) {
      this.gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }
    if (this.curvePipeline) {
      this.curvePipeline.dispose();
      this.curvePipeline = null;
    }
    if (this.ellipsePipeline) {
      this.ellipsePipeline.dispose();
      this.ellipsePipeline = null;
    }
    this.gl.deleteBuffer(this.dynamicVbo);
    if (this.imageQuadVbo) {
      this.gl.deleteBuffer(this.imageQuadVbo);
      this.imageQuadVbo = null;
    }
    // Release every uploaded image texture. `loseContext` below would
    // also drop them, but explicit deletes make the resource lifecycle
    // obvious.
    for (const tex of this.textures.values()) {
      this.gl.deleteTexture(tex);
    }
    this.textures.clear();
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
    this.stack.push({
      transform: { ...this.transform },
      fillColor: [this.fillColor[0], this.fillColor[1], this.fillColor[2]],
      fillAlpha: this.fillAlpha,
      strokeColor: [this.strokeColor[0], this.strokeColor[1], this.strokeColor[2]],
      strokeAlpha: this.strokeAlpha,
      fillColorString: this.fillColorString,
      strokeWidth: this.strokeWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      dashArray: this.dashArray,
      opacity: this.opacity,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    });
  }

  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.transform = s.transform;
    this.fillColor = s.fillColor;
    this.fillAlpha = s.fillAlpha;
    this.strokeColor = s.strokeColor;
    this.strokeAlpha = s.strokeAlpha;
    this.fillColorString = s.fillColorString;
    this.strokeWidth = s.strokeWidth;
    this.lineCap = s.lineCap;
    this.lineJoin = s.lineJoin;
    this.dashArray = s.dashArray;
    this.opacity = s.opacity;
    this.fontFamily = s.fontFamily;
    this.fontSize = s.fontSize;
    this.fontWeight = s.fontWeight;
    this.fontStyle = s.fontStyle;
    this.textAlign = s.textAlign;
    this.textBaseline = s.textBaseline;
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
    this.currentCurves = [];
    this.currentEllipse = null;
  }

  rect(x: number, y: number, width: number, height: number): void {
    // Reuse one mutable rect — `fill()` / `stroke()` read it
    // synchronously right after and never retain the reference, so a
    // fresh object per rect would be waste.
    this._pathRect.x = x;
    this._pathRect.y = y;
    this._pathRect.width = width;
    this._pathRect.height = height;
    this.currentPath = this._pathRect;
  }
  private readonly _pathRect = { x: 0, y: 0, width: 0, height: 0 };

  moveTo(x: number, y: number): void {
    this.currentPolyline = [{ x, y }];
  }

  lineTo(x: number, y: number): void {
    this.currentPolyline.push({ x, y });
  }

  closePath(): void {
    const start = this.currentPolyline[0];
    if (this.currentPolyline.length > 1 && start !== undefined) {
      this.currentPolyline.push({ ...start });
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
    this.currentEllipse = { cx, cy, rx, ry };
    this.currentPolyline = [];
    this.currentPath = null;
  }

  /**
   * Build a polyline approximation of `currentEllipse` for the stroke
   * pipeline. Zoom-adaptive segment count keeps chord-to-arc error
   * sub-pixel at any scale.
   */
  private buildEllipseStrokePolyline(e: { cx: number; cy: number; rx: number; ry: number }): void {
    const scale = Math.hypot(this.transform.a, this.transform.b);
    const screenRadius = Math.max(e.rx, e.ry) * (Number.isFinite(scale) && scale > 0 ? scale : 1);
    const segments = Math.max(
      ELLIPSE_MIN_SEGMENTS,
      Math.min(ELLIPSE_MAX_SEGMENTS, Math.ceil(Math.PI * screenRadius * 0.7)),
    );
    this.currentPolyline = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      this.currentPolyline.push({
        x: e.cx + e.rx * Math.cos(t),
        y: e.cy + e.ry * Math.sin(t),
      });
    }
  }

  /**
   * Quadratic Bezier. Pushed twice:
   *   1. As a single `CurveSegment` into `currentCurves` for the
   *      Loop-Blinn fill pass — a perfect curve edge at any zoom (one
   *      fragment-tested triangle, no faceting).
   *   2. As the curve endpoint into `currentPolyline` — keeps the
   *      polygon hull intact so `fill()`'s earcut triangulation and
   *      `stroke()`'s polyline math both see the chord.
   *
   * Strokes flatten to chord segments via the registered rasterizer
   * (sub-pixel zoom-aware).
   */
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const start = this.currentPolyline[this.currentPolyline.length - 1] ?? { x: cx, y: cy };
    this.currentCurves.push({
      kind: "q",
      points: [start, { x: cx, y: cy }, { x, y }],
    });
    // Stroke / hull representation: flatten to a polyline so the
    // existing stroke + polygon-fan math still works.
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
      for (let i = 1; i < pts.length; i++) this.currentPolyline.push(req(pts[i]));
      return;
    }
    const count = Math.max(
      8,
      Math.min(128, Math.ceil(curveLengthEstimate(start, { x, y }) / tolerance)),
    );
    const samples = sampleQuadratic(start, { x: cx, y: cy }, { x, y }, count);
    for (let i = 1; i < samples.length; i++) this.currentPolyline.push(req(samples[i]));
  }

  /** Cubic Bezier — same dual-track approach as quadratic. */
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const start = this.currentPolyline[this.currentPolyline.length - 1] ?? { x, y };
    this.currentCurves.push({
      kind: "c",
      points: [start, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x, y }],
    });
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
      for (let i = 1; i < pts.length; i++) this.currentPolyline.push(req(pts[i]));
      return;
    }
    const count = Math.max(
      12,
      Math.min(192, Math.ceil(curveLengthEstimate(start, { x, y }) / tolerance)),
    );
    const samples = sampleCubic(start, { x: c1x, y: c1y }, { x: c2x, y: c2y }, { x, y }, count);
    for (let i = 1; i < samples.length; i++) this.currentPolyline.push(req(samples[i]));
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
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    dynamic?: boolean,
  ): void {
    const tex = this.textureFor(image as TexImageSource, dynamic ?? false);
    if (!tex) return;
    if (!this.imageProgram) {
      this.imageProgram = createImageProgram(this.gl);
      // Lazily create the image quad VBO too — interleaved
      // (pos.xy, uv.xy) for a TRIANGLE_STRIP unit quad. Static — never
      // re-uploaded; the per-call placement goes through `uTransform`.
      this.imageQuadVbo = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageQuadVbo);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1]),
        this.gl.STATIC_DRAW,
      );
    }
    const ip = this.imageProgram;
    this.gl.useProgram(ip.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.imageQuadVbo);
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

    // Restore the solid-colour program for subsequent fills / strokes.
    this.restoreSolidProgram();
  }

  /** Lazy image program + its static unit quad+UV VBO. */
  private imageProgram: ImageProgram | null = null;
  private imageQuadVbo: WebGLBuffer | null = null;
  /**
   * `TexImageSource` → uploaded `WebGLTexture` cache. A plain `Map`
   * with LRU eviction + explicit `gl.deleteTexture` (see
   * `evictImageTexturesIfOverCap`) so the GPU texture is released
   * deterministically rather than waiting for GC.
   *
   * `Map` preserves insertion order, so the head is least-recently
   * used. `textureFor` touches a hit by delete + set (moves to tail).
   */
  private readonly textures = new Map<object, WebGLTexture>();

  private textureFor(src: TexImageSource, dynamic: boolean): WebGLTexture | null {
    // Reject non-drawable handles: a restored scene's `metadata.image`
    // is `{}` (a live `<img>` serialises to an empty object), which
    // passes a bare `typeof object` check but throws "overload
    // resolution failed" inside `texImage2D`. `isDrawableImageSource`
    // verifies it's an actual HTMLImageElement / canvas / bitmap / etc.
    if (!isDrawableImageSource(src)) {
      warnSkippedImage(src);
      return null;
    }
    const key = src as object;
    const cached = this.textures.get(key);
    if (cached) {
      // Touch — re-insert at the tail so LRU eviction below picks colder
      // entries first.
      this.textures.delete(key);
      this.textures.set(key, cached);
      // Animated source (GIF `<img>`, `<video>`) — the source's pixels
      // advanced since last frame, so re-upload them onto the existing
      // texture handle. Static images skip this. Re-using the handle
      // avoids leaking a fresh texture per frame.
      if (dynamic) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, cached);
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          src,
        );
      }
      return cached;
    }
    const tex = this.gl.createTexture();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- createTexture typed non-null but returns null on context loss
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
    this.textures.set(key, tex);
    this.evictImageTexturesIfOverCap();
    return tex;
  }

  /**
   * Trim `textures` down to `WEBGL2_IMAGE_TEXTURE_CACHE_CAP` entries by
   * dropping least-recently-used keys and explicitly releasing the GPU
   * texture for each evicted entry.
   *
   * Skips entries also held by `textBitmaps` — those are evicted through
   * `evictTextBitmapsIfOverCap` instead, which already deletes the
   * texture. Skipping here keeps the two cache layers from
   * double-`gl.deleteTexture`'ing the same handle.
   */
  private evictImageTexturesIfOverCap(): void {
    while (this.textures.size > WEBGL2_IMAGE_TEXTURE_CACHE_CAP) {
      const oldestKey = this.textures.keys().next().value;
      if (oldestKey === undefined) break;
      // Don't evict a texture that's currently backing a live
      // text-bitmap cache entry — `evictTextBitmapsIfOverCap` owns those
      // handles. Move it to the tail so the LRU pointer advances and the
      // next-oldest entry is tried.
      if (isTextBitmapBacked(this.textBitmaps, oldestKey)) {
        const tex = this.textures.get(oldestKey);
        if (tex === undefined) continue;
        this.textures.delete(oldestKey);
        this.textures.set(oldestKey, tex);
        continue;
      }
      const tex = this.textures.get(oldestKey);
      this.textures.delete(oldestKey);
      if (tex) this.gl.deleteTexture(tex);
    }
  }

  fill(_rule?: FillRule): void {
    void _rule;
    const effectiveAlpha = this.opacity * this.fillAlpha;
    if (effectiveAlpha <= 0) return; // transparent fill — nothing to draw

    // Ellipse path — single fragment-SDF quad regardless of radius.
    // Vector-perfect at any zoom; 4 vertices instead of 24-512.
    if (this.currentEllipse) {
      this.ellipsePipeline ??= new EllipsePipeline(this.gl);
      const e = this.currentEllipse;
      this.ellipsePipeline.draw(
        e.cx,
        e.cy,
        e.rx,
        e.ry,
        this.fillColor,
        effectiveAlpha,
        this.transform,
        this._size,
      );
      this.restoreSolidProgram();
      return;
    }

    // Rect path — uses the bundled unit-quad VBO + uTransform
    // pre-multiplied to map [0,1]² onto the rect bounds. Cheapest path;
    // most shape backgrounds (rectangles) hit it.
    if (this.currentPath) {
      const r = this.currentPath;
      const projected = applyMat(
        {
          a: this.transform.a * r.width,
          b: this.transform.b * r.width,
          c: this.transform.c * r.height,
          d: this.transform.d * r.height,
          e: this.transform.e + this.transform.a * r.x + this.transform.c * r.y,
          f: this.transform.f + this.transform.b * r.x + this.transform.d * r.y,
        },
        this._size.width,
        this._size.height,
      );
      this.restoreSolidProgram(); // ensure the solid VBO+attrib is live
      this.gl.uniformMatrix3fv(this.uTransformLoc, false, projected);
      this.gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
      this.gl.uniform1f(this.uOpacityLoc, effectiveAlpha);
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // Polygon path — assembled via moveTo / lineTo / bezierCurveTo.
    // Triangulated through earcut so concave shapes (arrows, stars,
    // lightning bolts) fill correctly. Earcut is dependency-free and
    // handles holes too if ever needed.
    if (this.currentPolyline.length >= 3) {
      this.fillPolygonEarcut(this.currentPolyline, effectiveAlpha);
    }

    // Loop-Blinn curve overlay. Adds fragment-tested quadratic / cubic
    // triangles on top of the polygon fill so curve regions
    // (rounded-rect corners, ellipse quadrants, glyph outlines) stay
    // vector-perfect at any zoom. `w` per vertex flips inside / outside,
    // so curves bulging outward from the polygon hull paint more pixels
    // and curves bulging inward paint fewer (the polygon fill already
    // covered the inward area).
    //
    // The Loop-Blinn triangle is always added. For shapes whose curves
    // bulge inward (concave silhouettes) this can over-paint a thin
    // sliver; a knockout pass that erases the inward-curve area inside
    // the polygon fill would need stencil buffer plumbing the kernel
    // doesn't have. The artefact is invisible at 1× zoom and tiny even
    // at 20×.
    if (this.currentCurves.length > 0) {
      this.curvePipeline ??= new LoopBlinnCurvePipeline(this.gl);
      this.curvePipeline.draw(
        this.currentCurves,
        this.fillColor,
        effectiveAlpha,
        this.transform,
        this._size,
      );
      this.restoreSolidProgram();
    }
  }
  private curvePipeline: LoopBlinnCurvePipeline | null = null;
  private ellipsePipeline: EllipsePipeline | null = null;

  /**
   * Triangulate the polygon via earcut and emit one TRIANGLES draw.
   * Vertices are pre-projected into clip space so the program's
   * `uTransform` stays identity. Falls back to a triangle-fan when
   * earcut returns an empty index list (degenerate self-intersecting
   * polygon).
   */
  private fillPolygonEarcut(polyline: readonly Vec2[], effectiveAlpha: number): void {
    // Skip the implicitly-closed duplicate last vertex if the caller
    // already issued `closePath` — earcut would treat it as a degenerate
    // sliver.
    const polyFirst = polyline[0];
    const polyLast = polyline[polyline.length - 1];
    const n =
      polyline.length >= 4 &&
      polyFirst !== undefined &&
      polyFirst.x === polyLast?.x &&
      polyFirst.y === polyLast.y
        ? polyline.length - 1
        : polyline.length;
    if (n < 3) return;

    // earcut wants a flat [x0, y0, x1, y1, ...] in world coords. Reuse
    // the module-level scratch buffers — earcut accepts any array-like
    // with [i] + length, so a Float64Array view works.
    ensureEarcutVertexCapacity(n);
    const flat = scratchEarcutFlat;
    for (let i = 0; i < n; i++) {
      const p = req(polyline[i]);
      flat[i * 2] = p.x;
      flat[i * 2 + 1] = p.y;
    }
    // Pass only the populated prefix — `subarray` is a view, no copy.
    const indices = earcut(flat.subarray(0, n * 2));
    if (indices.length === 0) {
      // Pathological polygon — fall back to a fan so something renders.
      this.drawTriangleFan(polyline, n, effectiveAlpha);
      return;
    }

    // Project once into clip space, then index-draw. Shares the earcut
    // vertex-count budget — `ensureEarcutVertexCapacity` above already
    // grew `scratchEarcutVerts` if needed.
    const sx = 2 / this._size.width;
    const sy = -2 / this._size.height;
    const verts = scratchEarcutVerts;
    for (let i = 0; i < n; i++) {
      const p = req(polyline[i]);
      const wx = this.transform.a * p.x + this.transform.c * p.y + this.transform.e;
      const wy = this.transform.b * p.x + this.transform.d * p.y + this.transform.f;
      verts[i * 2] = wx * sx - 1;
      verts[i * 2 + 1] = wy * sy + 1;
    }

    // Copy earcut's `number[]` indices into the scratch Uint16Array.
    // earcut returns its own JS array; the copy lets us pass a sized
    // TypedArray view to bufferData with no further allocation.
    ensureEarcutIndexCapacity(indices.length);
    for (let i = 0; i < indices.length; i++) {
      scratchEarcutIndices[i] = req(indices[i]);
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    // Use the dynamic VBO — leaves the static unit-quad VBO untouched so
    // subsequent rect fills don't pay for a re-upload.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 2), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(this.uTransformLoc, false, IDENTITY_MAT3);
    gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
    gl.uniform1f(this.uOpacityLoc, effectiveAlpha);
    // Lazy IBO — earcut returns 16-bit indices for ≤65535 verts (the
    // realistic ceiling for any one polygon).
    this.indexBuffer ??= gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      scratchEarcutIndices.subarray(0, indices.length),
      gl.DYNAMIC_DRAW,
    );
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    // Restore solid program's attribute binding to the static unit-quad
    // VBO so the next rect fill picks up the right vertex stream.
    this.restoreSolidProgram();
  }
  private indexBuffer: WebGLBuffer | null = null;

  /**
   * Convex / fallback path — triangle fan from polyline[0]. Renders
   * convex polygons correctly; concave ones get a wrong silhouette (the
   * earcut path handles those instead).
   */
  private drawTriangleFan(polyline: readonly Vec2[], n: number, effectiveAlpha: number): void {
    const sx = 2 / this._size.width;
    const sy = -2 / this._size.height;
    // Share the module-level scratch verts with `fillPolygonEarcut`.
    ensureEarcutVertexCapacity(n);
    const verts = scratchEarcutVerts;
    for (let i = 0; i < n; i++) {
      const p = req(polyline[i]);
      const wx = this.transform.a * p.x + this.transform.c * p.y + this.transform.e;
      const wy = this.transform.b * p.x + this.transform.d * p.y + this.transform.f;
      verts[i * 2] = wx * sx - 1;
      verts[i * 2 + 1] = wy * sy + 1;
    }
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynamicVbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, n * 2), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(this.uTransformLoc, false, IDENTITY_MAT3);
    gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
    gl.uniform1f(this.uOpacityLoc, effectiveAlpha);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, n);
    this.restoreSolidProgram();
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
    // Ellipse outline — lazily generate the polyline approximation here
    // so callers that only fill don't pay for the 24-512 vertex
    // allocation. EllipsePipeline owns the fill path; stroke still goes
    // through the polygon stroke pipeline.
    if (this.currentEllipse && this.currentPolyline.length < 2) {
      this.buildEllipseStrokePolyline(this.currentEllipse);
    }
    if (this.currentPolyline.length < 2) return;
    const effectiveAlpha = this.opacity * this.strokeAlpha;
    if (effectiveAlpha <= 0) return; // transparent stroke — nothing to draw
    // Dashed: split the polyline into "on" sub-polylines in world units
    // (Canvas2D dashes in the world-space ctx transform, so this
    // matches it), then stroke each through the same pipeline. Solid →
    // one call.
    const runs = this.dashArray
      ? dashPolyline(this.currentPolyline, this.dashArray)
      : [this.currentPolyline];
    for (const run of runs) {
      if (run.length < 2) continue;
      drawPolylineStrokeImpl(
        this.gl,
        run,
        {
          width: this.strokeWidth,
          color: this.strokeColor,
          opacity: effectiveAlpha,
          join: this.lineJoin,
          cap: this.lineCap,
        },
        this.transform,
        this._size,
        this.program,
        this.uTransformLoc,
        this.uColorLoc,
        this.uOpacityLoc,
        this.dynamicVbo,
        this.aPosLoc,
        IDENTITY_MAT3,
      );
    }
    // Stroke wrote into the dynamic VBO; rebind the static unit-quad VBO
    // so the next solid rect fill picks up the right vertex stream.
    this.restoreSolidProgram();
  }

  // --- Stroke style state (consumed by stroke()) ---
  setLineCap(cap: LineCap): void {
    this.lineCap = cap;
  }
  setLineJoin(join: LineJoin): void {
    this.lineJoin = join;
  }
  setDashArray(dash: readonly number[] | null): void {
    this.dashArray = dash && dash.length > 0 ? dash : null;
  }
  setFont(
    family: string,
    size: number,
    options?: { weight?: "normal" | "bold"; style?: "normal" | "italic" },
  ): void {
    this.fontFamily = family;
    this.fontSize = size;
    this.fontWeight = options?.weight ?? "normal";
    this.fontStyle = options?.style ?? "normal";
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
    this.msdfPipeline ??= new MsdfTextPipeline(this.gl);
    // Pick the embedded font for the current family + weight/style.
    const fontId = atlas.resolveFontId(
      this.fontFamily,
      this.fontWeight === "bold",
      this.fontStyle === "italic",
    );
    // Horizontal alignment is handled inside `drawText` (single walk —
    // it measures the run and shifts via the transform), so no separate
    // width-measuring pass here.
    const alignFactor = this.textAlign === "center" ? 0.5 : this.textAlign === "right" ? 1 : 0;
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
      x,
      py,
      this.fontSize,
      atlas,
      {
        opacity: this.opacity,
        color: this.fillColor,
        transform: this.transform,
      },
      this._size,
      alignFactor,
      fontId,
    );
    // The MSDF pipeline left its own program active; restore the
    // solid-fill program + VBO state so the next rect / polyline draw
    // uses the correct shader.
    this.restoreSolidProgram();
  }

  /**
   * Rebind the solid program + static unit-quad VBO + cached aPos
   * pointer. Three GL calls, no allocation, no upload, no string-keyed
   * driver lookup. Called after any draw that switched program or
   * rebound the buffer (image, MSDF text, curves, polygon fill, triangle
   * fan).
   */
  private restoreSolidProgram(): void {
    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.enableVertexAttribArray(this.aPosLoc);
    this.gl.vertexAttribPointer(this.aPosLoc, 2, this.gl.FLOAT, false, 0, 0);
  }
  measureText(text: string): { width: number } {
    return this.textMetrics(text);
  }

  // --- Glyph atlas (per-string fallback path) ---

  /** Hidden Canvas2D context for measureText + bitmap rasterisation. */
  private textCtx: CanvasRenderingContext2D | null = null;
  /**
   * Per-string OffscreenCanvas cache for the fallback text path (no MSDF
   * shaper registered). Keyed by `text|font|color`. Capped via
   * `WEBGL2_TEXT_BITMAP_CACHE_CAP` LRU eviction.
   *
   * `Map` preserves insertion order, so the oldest entry is the iterator
   * head. `rasteriseString` "touches" a hit by delete + set, which moves
   * it to the tail.
   */
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
    // When the MSDF path is active, measure with the same atlas glyph
    // advances the renderer uses (`fillTextMSDF` walks `glyph.advance *
    // fontSize / unitsPerEm`). Otherwise `measureText` would report the
    // system-font width (a different, usually wider font) and callers —
    // caret geometry, selection bounds — would drift from what's drawn.
    const atlas = this.ensureGlyphAtlas();
    if (atlas) {
      const fontId = atlas.resolveFontId(
        this.fontFamily,
        this.fontWeight === "bold",
        this.fontStyle === "italic",
      );
      let w = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        const glyph = atlas.getOrRasterize(cp, fontId);
        if (!glyph) continue;
        w += (glyph.advance * this.fontSize) / glyph.unitsPerEm;
      }
      return { width: w };
    }
    // Fallback (no MSDF shaper): Canvas2D system-font measurement, which
    // matches the Canvas2D bitmap text path used in that case.
    const ctx = this.ensureTextCtx();
    if (!ctx) return { width: text.length * this.fontSize * 0.55 };
    ctx.font = this.textFontSpec();
    return { width: ctx.measureText(text).width };
  }

  private rasteriseString(text: string): OffscreenCanvas | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const key = `${text}|${this.textFontSpec()}|${this.fillColorString}`;
    const cached = this.textBitmaps.get(key);
    if (cached) {
      // Touch — re-insert at the tail so the LRU eviction below picks
      // colder entries first.
      this.textBitmaps.delete(key);
      this.textBitmaps.set(key, cached);
      return cached;
    }
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
    this.evictTextBitmapsIfOverCap();
    return canvas;
  }

  /**
   * Trim `textBitmaps` down to `WEBGL2_TEXT_BITMAP_CACHE_CAP` entries by
   * dropping least-recently-used keys. For each evicted OffscreenCanvas
   * the associated GPU texture (uploaded lazily via `drawImage` →
   * `textureFor`) is also deleted, otherwise the VRAM stays held until
   * JS GC collects the canvas.
   */
  private evictTextBitmapsIfOverCap(): void {
    while (this.textBitmaps.size > WEBGL2_TEXT_BITMAP_CACHE_CAP) {
      const oldestKey = this.textBitmaps.keys().next().value;
      if (oldestKey === undefined) break;
      const oldCanvas = this.textBitmaps.get(oldestKey);
      this.textBitmaps.delete(oldestKey);
      if (oldCanvas) {
        const tex = this.textures.get(oldCanvas);
        if (tex) {
          this.gl.deleteTexture(tex);
          this.textures.delete(oldCanvas);
        }
      }
    }
  }
}

/**
 * Scan the text-bitmap LRU for an OffscreenCanvas reference matching the
 * given object. Used by `evictImageTexturesIfOverCap` to avoid
 * double-evicting a texture that's still held by the text-bitmap cache —
 * `evictTextBitmapsIfOverCap` owns those `gl.deleteTexture` calls.
 *
 * Linear scan is fine: text bitmap cache size ≤ 256, called only on
 * texture LRU eviction (rare).
 */
const isTextBitmapBacked = (
  textBitmaps: Map<string, OffscreenCanvas>,
  candidate: object,
): boolean => {
  for (const canvas of textBitmaps.values()) {
    if (canvas === candidate) return true;
  }
  return false;
};

/** Mutable mirror of `Transform` for the internal matrix book-keeping. */
interface MutableTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Split a polyline into the "on" dash runs for `pattern` ([on, off, on, …]),
 * lengths in the polyline's own (world) units. Walks each segment, toggling
 * on/off as the running distance crosses each pattern element, and emits the
 * point lists of the drawn runs. Used by WebGL2 `stroke()` to render dashed /
 * dotted lines (Canvas2D gets this for free from `ctx.setLineDash`).
 */
export const dashPolyline = (pts: readonly Vec2[], pattern: readonly number[]): Vec2[][] => {
  const runs: Vec2[][] = [];
  let idx = 0;
  let remaining = pattern[0] ?? 0;
  let drawing = true;
  let cur: Vec2[] = [];
  if (remaining <= 0) return [pts.slice()]; // degenerate pattern → solid
  for (let i = 0; i < pts.length - 1; i++) {
    const a = req(pts[i]);
    const b = req(pts[i + 1]);
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1e-9) continue;
    const dx = (b.x - a.x) / segLen;
    const dy = (b.y - a.y) / segLen;
    let pos = { x: a.x, y: a.y };
    let left = segLen;
    if (drawing && cur.length === 0) cur.push(pos);
    while (left > 1e-9) {
      const step = Math.min(left, remaining);
      const next = { x: pos.x + dx * step, y: pos.y + dy * step };
      if (drawing) cur.push(next);
      pos = next;
      left -= step;
      remaining -= step;
      if (remaining <= 1e-9) {
        if (drawing && cur.length >= 2) runs.push(cur);
        drawing = !drawing;
        idx = (idx + 1) % pattern.length;
        remaining = pattern[idx] ?? 0;
        cur = drawing ? [{ x: pos.x, y: pos.y }] : [];
        if (remaining <= 0) remaining = 1e-6; // avoid stall on zero-length element
      }
    }
  }
  if (drawing && cur.length >= 2) runs.push(cur);
  return runs;
};

/**
 * Full graphics-state snapshot pushed by `save()` and popped by
 * `restore()` — transform plus all paint + text state, matching
 * Canvas2D's `ctx.save/restore` contract. Excludes the current path
 * (Canvas2D doesn't snapshot it either).
 */
interface GfxState {
  transform: MutableTransform;
  fillColor: [number, number, number];
  fillAlpha: number;
  strokeColor: [number, number, number];
  strokeAlpha: number;
  fillColorString: string;
  strokeWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  dashArray: readonly number[] | null;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: TextAlign;
  textBaseline: TextBaseline;
}

/**
 * Module-level scratch buffers for the polygon-fill path
 * (`fillPolygonEarcut` + `drawTriangleFan`). Reused across every fill so
 * steady-state cost is zero `Float64Array` / `Float32Array` /
 * `Uint16Array` allocations.
 *
 * Initial caps cover a typical polygon (≤64 vertices, ≤128 indices)
 * without a grow. Capacity ratchets up to the next power of 2 on demand
 * and never shrinks; safe for single-threaded WebGL (fill calls are
 * serialised through the editor's render path).
 */
let scratchEarcutFlat = new Float64Array(128);
let scratchEarcutVerts = new Float32Array(128);
let scratchEarcutIndices = new Uint16Array(256);

const ensureEarcutVertexCapacity = (vertexCount: number): void => {
  const needed = vertexCount * 2;
  if (scratchEarcutFlat.length >= needed) return;
  let cap = scratchEarcutFlat.length;
  while (cap < needed) cap *= 2;
  scratchEarcutFlat = new Float64Array(cap);
  scratchEarcutVerts = new Float32Array(cap);
};

const ensureEarcutIndexCapacity = (n: number): void => {
  if (scratchEarcutIndices.length >= n) return;
  let cap = scratchEarcutIndices.length;
  while (cap < n) cap *= 2;
  scratchEarcutIndices = new Uint16Array(cap);
};

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
const curveLengthEstimate = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Sample a quadratic Bezier curve at `count` evenly-spaced t values. */
const sampleQuadratic = (p0: Vec2, p1: Vec2, p2: Vec2, count: number): Vec2[] => {
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
const sampleCubic = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, count: number): Vec2[] => {
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
    t.a * sx,
    t.b * sy,
    0,
    t.c * sx,
    t.d * sy,
    0,
    t.e * sx - 1,
    t.f * sy + 1,
    1,
  ]);
};

interface ImageProgram {
  readonly program: WebGLProgram;
  readonly aPos: number;
  readonly aUV: number;
  readonly uTransform: WebGLUniformLocation | null;
  readonly uTex: WebGLUniformLocation | null;
  readonly uOpacity: WebGLUniformLocation | null;
}

const createImageProgram = (gl: WebGL2RenderingContext): ImageProgram => {
  const vert = compileShader(
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
    "WebGL2",
  );
  const frag = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  // The texture is uploaded with UNPACK_PREMULTIPLY_ALPHA_WEBGL=true,
  // so t.rgb is already premultiplied by t.a. Output stays
  // premultiplied for blendFunc(ONE, 1-SRC_ALPHA) — scale both
  // channels by the per-call opacity.
  vec4 t = texture(uTex, vUV);
  fragColor = vec4(t.rgb * uOpacity, t.a * uOpacity);
}`,
    "WebGL2",
  );
  const program = linkProgram(gl, vert, frag, "WebGL2");
  return {
    program,
    aPos: gl.getAttribLocation(program, "aPos"),
    aUV: gl.getAttribLocation(program, "aUV"),
    uTransform: gl.getUniformLocation(program, "uTransform"),
    uTex: gl.getUniformLocation(program, "uTex"),
    uOpacity: gl.getUniformLocation(program, "uOpacity"),
  };
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
    t.a * sx,
    t.b * sy,
    0,
    t.c * sx,
    t.d * sy,
    0,
    t.e * sx - 1,
    t.f * sy + 1,
    1,
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
  // Output premultiplied (rgb*a, a) — matches the context's
  // premultipliedAlpha:true contract + blendFunc(ONE, 1-SRC_ALPHA).
  fragColor = vec4(uColor * uOpacity, uOpacity);
}`;

/** Asserts an array index is in range (loop bounds guarantee it). */
const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/renderer-canvas: index out of range");
  return v;
};
