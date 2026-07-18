import type { Transform } from "@oh-just-another/types";
import { compileShader, glReq, linkProgram } from "./webgl-helpers.js";

/**
 * Fragment-shader SDF ellipse pipeline for `WebGL2Target`. Renders an
 * ellipse as a single textured quad (4 vertices, 2 triangles)
 * regardless of radius — the fragment shader does an inside/outside
 * test against the unit circle in normalised local coordinates.
 *
 * Vertex layout (static, interleaved):
 *   aPos    aLocal
 *   0,0     -1,-1
 *   1,0      1,-1
 *   0,1     -1, 1
 *   1,1      1, 1
 *
 * `uTransform` maps `aPos` (unit square [0,1]²) through:
 *   1. scale to ellipse bbox (2*rx, 2*ry)
 *   2. translate to (cx-rx, cy-ry)
 *   3. apply caller's world→screen affine
 *   4. pixel→clip-space (NDC)
 *
 * The fragment shader gets `vLocal` interpolated across the quad:
 *   inside the ellipse → dot(vLocal, vLocal) < 1
 *   on the boundary    → dot(vLocal, vLocal) = 1
 *   outside            → dot(vLocal, vLocal) > 1
 *
 * `smoothstep(1+fwidth, 1-fwidth, r²)` gives sub-pixel AA at the
 * boundary independent of zoom.
 */

/**
 * Module-level scratch mat3 — same reuse pattern as the earcut / stroke
 * scratch buffers in webgl2-target/webgl2-stroke. `uniformMatrix3fv`
 * copies the values into GL state synchronously, so one shared buffer
 * avoids a Float32Array allocation per ellipse fill.
 */
const scratchMat3 = new Float32Array(9);

export class EllipsePipeline {
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uTransform: WebGLUniformLocation | null;
  private readonly uColor: WebGLUniformLocation | null;
  private readonly uOpacity: WebGLUniformLocation | null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC, "Ellipse");
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC, "Ellipse");
    this.program = linkProgram(gl, vert, frag, "Ellipse");
    const aPos = gl.getAttribLocation(this.program, "aPos");
    const aLocal = gl.getAttribLocation(this.program, "aLocal");
    this.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.uColor = gl.getUniformLocation(this.program, "uColor");
    this.uOpacity = gl.getUniformLocation(this.program, "uOpacity");
    // Static interleaved buffer — never re-uploaded. The attribute
    // layout is recorded into a VAO once; per draw the pipeline just
    // binds the VAO (no bufferData, no pointer re-declaration).
    this.vbo = glReq(gl.createBuffer());
    this.vao = glReq(gl.createVertexArray());
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, -1, -1, 1, 0, 1, -1, 0, 1, -1, 1, 1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aLocal);
    gl.vertexAttribPointer(aLocal, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  /**
   * Draw a filled ellipse. `cx, cy` — centre in caller's coordinate
   * system. `rx, ry` — radii. The caller's affine `transform` combines
   * with the unit-square → bbox mapping into a single uniform matrix.
   *
   * Degenerate cases (`rx ≤ 0`, `ry ≤ 0`, `opacity ≤ 0`) early-return.
   */
  draw(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: readonly [number, number, number],
    opacity: number,
    transform: Transform,
    surfaceSize: { width: number; height: number },
  ): void {
    if (opacity <= 0 || rx <= 0 || ry <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const w = 2 * rx;
    const h = 2 * ry;
    const left = cx - rx;
    const top = cy - ry;
    const sx = 2 / surfaceSize.width;
    const sy = -2 / surfaceSize.height;
    // Combined matrix: (aPos.x, aPos.y) ∈ [0,1]² → clip-space NDC.
    // Steps folded into one column-major mat3:
    //   scaleSq = (aPos.x * w, aPos.y * h)
    //   inWorld = transform · (scaleSq + (left, top))
    //   inClip  = pixel→clip(inWorld)
    const t = transform;
    scratchMat3[0] = t.a * w * sx;
    scratchMat3[1] = t.b * w * sy;
    scratchMat3[2] = 0;
    scratchMat3[3] = t.c * h * sx;
    scratchMat3[4] = t.d * h * sy;
    scratchMat3[5] = 0;
    scratchMat3[6] = (t.a * left + t.c * top + t.e) * sx - 1;
    scratchMat3[7] = (t.b * left + t.d * top + t.f) * sy + 1;
    scratchMat3[8] = 1;
    gl.uniformMatrix3fv(this.uTransform, false, scratchMat3);
    gl.uniform3f(this.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.uOpacity, opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Reset to the default VAO so this pipeline's attribute state can't
    // leak into other pipelines (matches the rect-batch discipline).
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteProgram(this.program);
  }
}

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
in vec2 aLocal;
uniform mat3 uTransform;
out vec2 vLocal;
void main() {
  vec3 p = uTransform * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vLocal = aLocal;
}`;

/**
 * SDF circle test in normalised local space (-1..1 over ellipse bbox).
 *   r² = dot(vLocal, vLocal) — squared distance from centre.
 *   Inside circle: r² < 1. Outside: r² > 1. Boundary: r² = 1.
 *
 * `fwidth(r²)` gives the screen-space rate of change of r²; it sets the
 * smoothstep width so the boundary stays a 1-screen-pixel band
 * regardless of zoom.
 *
 * Output premultiplied (rgb·a, a) to match the context's
 * `premultipliedAlpha: true` + `blendFunc(ONE, 1 - SRC_ALPHA)`.
 */
const FRAGMENT_SRC = `#version 300 es
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
in vec2 vLocal;
out vec4 fragColor;
void main() {
  float r2 = dot(vLocal, vLocal);
  float dr = fwidth(r2);
  float coverage = smoothstep(1.0 + dr, 1.0 - dr, r2);
  if (coverage <= 0.0) discard;
  float a = coverage * uOpacity;
  fragColor = vec4(uColor * a, a);
}`;
