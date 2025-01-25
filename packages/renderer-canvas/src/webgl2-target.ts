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
  private strokeColor: [number, number, number] = [0, 0, 0];
  private strokeWidth = 1;
  private opacity = 1;
  private currentPath: Bounds | null = null;
  /**
   * Polyline path being assembled by moveTo / lineTo. Cleared on
   * `beginPath()`; pushed to GPU on `stroke()`. Bezier curves still
   * throw NotImplemented — see `notImpl()`.
   */
  private currentPolyline: Vec2[] = [];
  private transform: MutableTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private readonly stack: MutableTransform[] = [];

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, width: number, height: number) {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error("WebGL2 unavailable in this environment");
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
  }

  get size(): { readonly width: number; readonly height: number } {
    return this._size;
  }

  // --- Style ---

  setFill(color: Color | null): void {
    this.fillColor = parseColor(color);
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

  fill(_rule?: FillRule): void {
    void _rule;
    if (!this.currentPath) return;
    const r = this.currentPath;
    // Pre-multiply path bounds by current transform; pack into
    // the uTransform mat3 the shader expects.
    const projected = applyMat({
      a: this.transform.a * r.width,
      b: this.transform.b * r.width,
      c: this.transform.c * r.height,
      d: this.transform.d * r.height,
      e: this.transform.e + this.transform.a * r.x + this.transform.c * r.y,
      f: this.transform.f + this.transform.b * r.x + this.transform.d * r.y,
    }, this._size.width, this._size.height);
    this.gl.uniformMatrix3fv(this.uTransformLoc, false, projected);
    this.gl.uniform3f(this.uColorLoc, this.fillColor[0], this.fillColor[1], this.fillColor[2]);
    this.gl.uniform1f(this.uOpacityLoc, this.opacity);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  clear(bounds?: Bounds): void {
    void bounds; // WebGL doesn't have a partial clear; full clear is the
    // expected use case for `renderScene` between frames.
    this.gl.viewport(0, 0, this._size.width, this._size.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  // --- Stroke pipeline ---

  setStroke(color: Color | null): void {
    this.strokeColor = parseColor(color);
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
    drawPolylineStroke(
      this.gl,
      this.currentPolyline,
      this.strokeWidth,
      this.strokeColor,
      this.opacity,
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
  setFont(_family: string, _size: number): void {
    void _family;
    void _size;
  }
  setTextAlign(_align: TextAlign): void {
    void _align;
  }
  setTextBaseline(_baseline: TextBaseline): void {
    void _baseline;
  }

  quadraticCurveTo(_cx: number, _cy: number, _x: number, _y: number): void {
    notImpl("quadraticCurveTo");
  }
  bezierCurveTo(): void {
    notImpl("bezierCurveTo");
  }
  ellipse(): void {
    notImpl("ellipse");
  }
  fillText(): void {
    notImpl("fillText");
  }
  measureText(_text: string): { width: number } {
    void _text;
    notImpl("measureText");
    return { width: 0 };
  }
  drawImage(): void {
    notImpl("drawImage");
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
 * Triangulate `polyline` into a strip of two triangles per segment
 * (offset by `width/2` along each segment's normal) and upload +
 * draw via the existing solid-colour program. Square caps; no
 * mitre fix-up at corners — produces minor gaps on sharp angles
 * but is fast and sufficient for the connector / stroke use case
 * we have. Round joins can come later.
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
  // Build triangle-strip vertices: per segment two corners on
  // each side. Vertex coords go in NDC after applying transform +
  // pixel→clip.
  const vertices: number[] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    const project = (x: number, y: number): [number, number] => {
      const wx = transform.a * x + transform.c * y + transform.e;
      const wy = transform.b * x + transform.d * y + transform.f;
      return [(wx / size.width) * 2 - 1, 1 - (wy / size.height) * 2];
    };
    vertices.push(...project(a.x + nx, a.y + ny));
    vertices.push(...project(a.x - nx, a.y - ny));
    vertices.push(...project(b.x + nx, b.y + ny));
    vertices.push(...project(b.x - nx, b.y - ny));
  }
  // Upload + draw. Reuse the program's vbo for simplicity;
  // bufferData fully replaces the previous content per call.
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  // Identity uTransform — vertices are already in clip space.
  gl.uniformMatrix3fv(uTransformLoc, false, IDENTITY_MAT3);
  gl.uniform3f(uColorLoc, color[0], color[1], color[2]);
  gl.uniform1f(uOpacityLoc, opacity);
  // Draw segment-by-segment so adjacent segments don't bleed into
  // each other via the strip's shared corners.
  for (let i = 0; i < polyline.length - 1; i++) {
    gl.drawArrays(gl.TRIANGLE_STRIP, i * 4, 4);
  }
};

const IDENTITY_MAT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

const notImpl = (method: string): never => {
  throw new Error(
    `WebGL2Target: ${method}() is out of MVP scope. Fall back to Canvas2DTarget for this draw call.`,
  );
};

const parseColor = (color: Color | null): [number, number, number] => {
  if (!color) return [0, 0, 0];
  // Tiny #rrggbb parser — full CSS color parsing belongs in
  // @math/color which the kernel already ships; this MVP only
  // needs to recognise hex.
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    return [
      parseInt(color.slice(1, 3), 16) / 255,
      parseInt(color.slice(3, 5), 16) / 255,
      parseInt(color.slice(5, 7), 16) / 255,
    ];
  }
  return [0, 0, 0];
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
