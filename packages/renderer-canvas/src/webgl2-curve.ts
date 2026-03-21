import {
  cubicToTriangles,
  packCurveTriangles,
  quadraticToTriangle,
  type CurveTriangle,
  type Point,
} from "@oh-just-another/curve-mesh";
import type { Transform } from "@oh-just-another/types";

/**
 * Loop-Blinn curve rendering for WebGL2Target. Owns the dedicated
 * shader program (vertex (x, y, u, v, w) → fragment `(u² - v) * w`
 * inside / outside test) and the buffer plumbing.
 *
 * Curves stay vector-perfect at any zoom (no facets at high zoom, no
 * over-tessellated triangle counts at 1×), and packing all curve
 * triangles into one buffer means one draw per `fill()` regardless of
 * curve count.
 *
 * A curve triangle covers the convex hull of the three control points,
 * and the fragment test discards the side that lies outside the
 * parabola. So a curve that bulges outward from the polygon needs its
 * triangle added on top of the polygon fill; a curve bulging inward
 * needs the triangle subtracted. The sign field `w` in each vertex's UV
 * encodes which side to keep.
 */
export interface CurveSegment {
  readonly kind: "q" | "c";
  readonly points: readonly Point[]; // q: 3 pts, c: 4 pts
}

export class LoopBlinnCurvePipeline {
  private readonly program: WebGLProgram;
  private readonly vbo: WebGLBuffer;
  private readonly uvBuf: WebGLBuffer;
  private readonly uTransform: WebGLUniformLocation;
  private readonly uColor: WebGLUniformLocation;
  private readonly uOpacity: WebGLUniformLocation;
  private readonly aPos: number;
  private readonly aUVW: number;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    this.program = link(gl, vert, frag);
    this.vbo = glReq(gl.createBuffer());
    this.uvBuf = glReq(gl.createBuffer());
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aUVW = gl.getAttribLocation(this.program, "aUVW");
    this.uTransform = glReq(gl.getUniformLocation(this.program, "uTransform"));
    this.uColor = glReq(gl.getUniformLocation(this.program, "uColor"));
    this.uOpacity = glReq(gl.getUniformLocation(this.program, "uOpacity"));
  }

  /**
   * Triangulate every segment in `curves`, batch the triangles into one
   * draw, and emit them through the Loop-Blinn fragment test. No-op when
   * `curves` is empty.
   */
  draw(
    curves: readonly CurveSegment[],
    color: readonly [number, number, number],
    opacity: number,
    transform: Transform,
    surfaceSize: { width: number; height: number },
  ): void {
    if (curves.length === 0 || opacity <= 0) return;
    const triangles: CurveTriangle[] = [];
    for (const seg of curves) {
      if (seg.kind === "q") {
        const [p0, p1, p2] = seg.points;
        if (!p0 || !p1 || !p2) continue;
        const tri = quadraticToTriangle(p0, p1, p2);
        if (tri) triangles.push(tri);
      } else {
        const [p0, p1, p2, p3] = seg.points;
        if (!p0 || !p1 || !p2 || !p3) continue;
        for (const tri of cubicToTriangles(p0, p1, p2, p3)) triangles.push(tri);
      }
    }
    if (triangles.length === 0) return;

    const { positions, uvs } = packCurveTriangles(triangles);
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.aUVW);
    gl.vertexAttribPointer(this.aUVW, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(
      this.uTransform,
      false,
      affineToClipMat3(transform, surfaceSize.width, surfaceSize.height),
    );
    gl.uniform3f(this.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.uOpacity, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteBuffer(this.uvBuf);
    this.gl.deleteProgram(this.program);
  }
}

const affineToClipMat3 = (t: Transform, w: number, h: number): Float32Array => {
  const sx = 2 / w;
  const sy = -2 / h;
  return new Float32Array([
    t.a * sx, t.b * sy, 0,
    t.c * sx, t.d * sy, 0,
    t.e * sx - 1, t.f * sy + 1, 1,
  ]);
};

/**
 * Vertex shader passes through the Loop-Blinn (u, v, w) coordinates as
 * a varying; the fragment shader runs the inside / outside test.
 */
const VERTEX_SRC = `#version 300 es
in vec2 aPos;
in vec3 aUVW;
uniform mat3 uTransform;
out vec3 vUVW;
void main() {
  vec3 p = uTransform * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUVW = aUVW;
}`;

/**
 * Loop-Blinn implicit Bezier test:
 *   procedural = u² - v
 *   discard if `procedural * w > 0` — `w` encodes which side of the
 *   parabola is the "filled" region. `fwidth(procedural)` gives the
 *   screen-pixel derivative used to feather the edge for AA.
 */
const FRAGMENT_SRC = `#version 300 es
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
in vec3 vUVW;
out vec4 fragColor;

void main() {
  float u = vUVW.x;
  float v = vUVW.y;
  float w = vUVW.z;
  float p = u * u - v;
  float dp = fwidth(p);
  // Signed distance to the curve in procedural units; multiplied by w
  // so the "outside" side discards regardless of curve orientation.
  // smoothstep antialiases the edge over one screen pixel of
  // procedural-space.
  float coverage = smoothstep(dp, -dp, p * w);
  if (coverage <= 0.0) discard;
  // Premultiplied output to match the context's premultipliedAlpha
  // contract + blendFunc(ONE, 1-SRC_ALPHA).
  float a = coverage * uOpacity;
  fragColor = vec4(uColor * a, a);
}`;

/**
 * Asserts a WebGL resource handle is non-null. `gl.createBuffer` /
 * `getUniformLocation` / `createShader` are typed non-null but return
 * `null` on context loss; this surfaces that as a throw.
 */
const glReq = <T>(v: T | null): T => {
  if (v === null) throw new Error("packages/renderer-canvas: WebGL resource creation failed");
  return v;
};

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const sh = glReq(gl.createShader(type));
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Loop-Blinn shader compile failed: ${log}`);
  }
  return sh;
};

const link = (
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram => {
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Loop-Blinn program link failed: ${log}`);
  }
  return program;
};
