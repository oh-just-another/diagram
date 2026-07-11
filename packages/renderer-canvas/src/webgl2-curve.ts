import { CurveTriangleBatch, type Point } from "@oh-just-another/curve-mesh";
import type { Transform } from "@oh-just-another/types";
import { WEBGL2_CURVE_TRIANGULATION_CACHE_CAP } from "./constants.js";
import { compileShader, glReq, linkProgram } from "./webgl-helpers.js";

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
  private readonly uTransform: WebGLUniformLocation | null;
  private readonly uColor: WebGLUniformLocation | null;
  private readonly uOpacity: WebGLUniformLocation | null;
  private readonly aPos: number;
  private readonly aUVW: number;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC, "Loop-Blinn");
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC, "Loop-Blinn");
    this.program = linkProgram(gl, vert, frag, "Loop-Blinn");
    this.vbo = glReq(gl.createBuffer());
    this.uvBuf = glReq(gl.createBuffer());
    this.aPos = gl.getAttribLocation(this.program, "aPos");
    this.aUVW = gl.getAttribLocation(this.program, "aUVW");
    this.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.uColor = gl.getUniformLocation(this.program, "uColor");
    this.uOpacity = gl.getUniformLocation(this.program, "uOpacity");
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
    const { positions, uvs } = triangulateCached(curves);
    if (positions.length === 0) return;
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

/**
 * Module-level scratch for `affineToClipMat3` — same reuse pattern as
 * the earcut / stroke / `applyMat` scratch buffers in webgl2-target.
 * Consumed synchronously by `uniformMatrix3fv` (which copies the values
 * into GL state), so one shared buffer avoids a Float32Array allocation
 * per curve draw.
 */
const scratchClipMat3 = new Float32Array(9);

const affineToClipMat3 = (t: Transform, w: number, h: number): Float32Array => {
  const sx = 2 / w;
  const sy = -2 / h;
  scratchClipMat3[0] = t.a * sx;
  scratchClipMat3[1] = t.b * sy;
  scratchClipMat3[2] = 0;
  scratchClipMat3[3] = t.c * sx;
  scratchClipMat3[4] = t.d * sy;
  scratchClipMat3[5] = 0;
  scratchClipMat3[6] = t.e * sx - 1;
  scratchClipMat3[7] = t.f * sy + 1;
  scratchClipMat3[8] = 1;
  return scratchClipMat3;
};

// --- Triangulation cache ---

/**
 * Packed triangle data for one curve list. `positions` / `uvs` are
 * owned by the cache entry (copied out of the shared batch), so they
 * stay valid across frames.
 */
interface CurveMeshEntry {
  /** Flat control-point key this entry was computed from (collision guard). */
  readonly key: Float64Array;
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
}

/**
 * Content-keyed LRU cache of Loop-Blinn triangulations, shared by all
 * `LoopBlinnCurvePipeline` instances (the data is GL-independent).
 *
 * Renderers emit paths in element-local coordinates and `draw()` gets
 * the view transform separately (applied in the vertex shader), so:
 *   - identical geometry (every same-size rounded rect) shares one entry;
 *   - pan / zoom / drag never invalidate an entry;
 *   - no scale bucket is needed — triangulation is scale-independent
 *     (fixed cubic subdivision count, no screen-space adaptivity).
 *
 * The `curves` array is rebuilt by `WebGL2Target` on every
 * `beginPath()`, so there is no stable object identity to key a WeakMap
 * on; instead the key is the flat list of segment kinds +
 * control-point coordinates, addressed by a 32-bit FNV-1a hash with a
 * full float comparison on hit (hash collisions fall back to
 * recompute + replace). `Map` insertion order gives LRU: hits re-insert
 * at the tail, overflow evicts the head.
 */
const curveMeshCache = new Map<number, CurveMeshEntry>();

/** Scratch for building the flat key without per-draw allocation. */
let scratchKey = new Float64Array(64);
const ensureKeyCapacity = (n: number): void => {
  if (scratchKey.length >= n) return;
  let cap = scratchKey.length;
  while (cap < n) cap *= 2;
  scratchKey = new Float64Array(cap);
};

/** Views over one float64 for hashing its bit pattern. */
const hashFloatBuf = new Float64Array(1);
const hashFloatBits = new Uint32Array(hashFloatBuf.buffer);

/** Shared zero-allocation triangulation sink (see `CurveTriangleBatch`). */
const sharedBatch = new CurveTriangleBatch();

/**
 * Flatten `curves` into `scratchKey` (kind marker + control points per
 * segment) and return the used length.
 */
const buildKey = (curves: readonly CurveSegment[]): number => {
  // Worst case per segment: 1 kind marker + 4 points × 2 coords.
  ensureKeyCapacity(curves.length * 9);
  const key = scratchKey;
  let off = 0;
  for (const seg of curves) {
    key[off++] = seg.kind === "q" ? 1 : 2;
    for (const p of seg.points) {
      key[off++] = p.x;
      key[off++] = p.y;
    }
  }
  return off;
};

/** FNV-1a over the bit patterns of `key[0..len)`. */
const hashKey = (key: Float64Array, len: number): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < len; i++) {
    hashFloatBuf[0] = key[i] ?? 0;
    h = Math.imul(h ^ (hashFloatBits[0] ?? 0), 0x01000193);
    h = Math.imul(h ^ (hashFloatBits[1] ?? 0), 0x01000193);
  }
  return h >>> 0;
};

const keysEqual = (a: Float64Array, b: Float64Array, len: number): boolean => {
  if (a.length !== len) return false;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/** Triangulate `curves` through the shared batch into a fresh entry. */
const triangulate = (curves: readonly CurveSegment[], keyLen: number): CurveMeshEntry => {
  sharedBatch.reset();
  for (const seg of curves) {
    if (seg.kind === "q") {
      const [p0, p1, p2] = seg.points;
      if (!p0 || !p1 || !p2) continue;
      sharedBatch.addQuadratic(p0, p1, p2);
    } else {
      const [p0, p1, p2, p3] = seg.points;
      if (!p0 || !p1 || !p2 || !p3) continue;
      sharedBatch.addCubic(p0, p1, p2, p3);
    }
  }
  return {
    key: scratchKey.slice(0, keyLen),
    // Copy out of the shared batch — entries outlive the next batch use.
    positions: new Float32Array(sharedBatch.positions),
    uvs: new Float32Array(sharedBatch.uvs),
  };
};

/**
 * Cached triangulation lookup. Returns per-entry packed buffers —
 * valid until the entry is evicted, which can't happen before the
 * caller's synchronous `bufferData` upload.
 *
 * Exported for tests only — not part of the package's public API.
 */
export const triangulateCached = (
  curves: readonly CurveSegment[],
): { positions: Float32Array; uvs: Float32Array } => {
  const keyLen = buildKey(curves);
  const hash = hashKey(scratchKey, keyLen);
  const cached = curveMeshCache.get(hash);
  if (cached && keysEqual(cached.key, scratchKey, keyLen)) {
    // Touch — re-insert at the tail so LRU eviction picks colder entries.
    curveMeshCache.delete(hash);
    curveMeshCache.set(hash, cached);
    return cached;
  }
  // Miss or hash collision — recompute and (re)place the slot.
  const entry = triangulate(curves, keyLen);
  curveMeshCache.delete(hash);
  curveMeshCache.set(hash, entry);
  while (curveMeshCache.size > WEBGL2_CURVE_TRIANGULATION_CACHE_CAP) {
    const oldest = curveMeshCache.keys().next().value;
    if (oldest === undefined) break;
    curveMeshCache.delete(oldest);
  }
  return entry;
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
