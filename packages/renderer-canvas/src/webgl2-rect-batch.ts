import { compileShader, glReq, linkProgram } from "./webgl-helpers.js";
import { INITIAL_RECT_BATCH_INSTANCES } from "./constants.js";

/**
 * Floats per instance in a {@link RectBatch}:
 *   [m0x, m0y,  m1x, m1y,  tx, ty,  r, g, b, a]
 *
 * The first six carry the rect's already-projected clip-space affine
 * (unit-quad → NDC) as two column vectors + a translation — the same
 * matrix the non-batched rect-fill path feeds `uniformMatrix3fv`, minus
 * the constant `[0, 0, 1]` third column the vertex shader reconstructs.
 * The last four carry the fill colour with `a` = effective alpha
 * (`opacity * fillAlpha`); the shader premultiplies to match the
 * `blendFunc(ONE, 1-SRC_ALPHA)` contract.
 */
export const RECT_INSTANCE_FLOATS = 10;

/**
 * CPU-side accumulator for instanced sharp-rect fills — the pure,
 * GL-free half of the batcher. {@link WebGL2Target} queues one instance
 * per axis-aligned `rect()` + `fill()` and drains the queue via
 * {@link flush} whenever a non-batchable draw intervenes or the frame
 * ends, so draw order (z-order) is preserved: every rect queued before
 * an interrupting op is emitted, in submission order, before that op.
 *
 * Kept free of any `WebGLRenderingContext` reference so the flush /
 * ordering / packing logic is unit-testable in Node — the GL upload +
 * `drawArraysInstanced` live in {@link RectInstancePipeline}, injected as
 * the {@link flush} sink.
 *
 * Capacity ratchets up to the next power of two on demand and never
 * shrinks; single-threaded WebGL serialises all pushes so no locking is
 * needed.
 */
export class RectBatch {
  private data: Float32Array;
  private instanceCount = 0;

  constructor(initialInstances: number = INITIAL_RECT_BATCH_INSTANCES) {
    this.data = new Float32Array(Math.max(1, initialInstances) * RECT_INSTANCE_FLOATS);
  }

  /** Number of instances queued since the last flush. */
  get pending(): number {
    return this.instanceCount;
  }

  /**
   * Queue one rect-fill instance. `m0*` / `m1*` / `t*` are the projected
   * clip-space affine columns (see {@link RECT_INSTANCE_FLOATS}); `r,g,b`
   * are the fill colour in 0–1 and `a` the effective alpha.
   */
  add(
    m0x: number,
    m0y: number,
    m1x: number,
    m1y: number,
    tx: number,
    ty: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    const need = (this.instanceCount + 1) * RECT_INSTANCE_FLOATS;
    if (need > this.data.length) {
      let cap = this.data.length;
      while (cap < need) cap *= 2;
      const next = new Float32Array(cap);
      next.set(this.data);
      this.data = next;
    }
    const base = this.instanceCount * RECT_INSTANCE_FLOATS;
    this.data[base] = m0x;
    this.data[base + 1] = m0y;
    this.data[base + 2] = m1x;
    this.data[base + 3] = m1y;
    this.data[base + 4] = tx;
    this.data[base + 5] = ty;
    this.data[base + 6] = r;
    this.data[base + 7] = g;
    this.data[base + 8] = b;
    this.data[base + 9] = a;
    this.instanceCount++;
  }

  /**
   * Drain the queue through `sink` (one instanced draw) and reset. No-op
   * when empty. Returns whether a draw was issued. `sink` receives the
   * backing buffer (which may be longer than `count * stride` — read only
   * the first `count` instances) and the instance count.
   */
  flush(sink: (data: Float32Array, instanceCount: number) => void): boolean {
    if (this.instanceCount === 0) return false;
    sink(this.data, this.instanceCount);
    this.instanceCount = 0;
    return true;
  }

  /** Drop queued instances without drawing (context loss / dispose). */
  reset(): void {
    this.instanceCount = 0;
  }
}

/**
 * GL half of the sharp-rect batcher: owns the instanced program, a VAO
 * binding a static unit-quad (per-vertex) to a growable per-instance
 * buffer, and issues one `drawArraysInstanced` per flush.
 *
 * One draw call renders the whole queued run regardless of instance
 * count — the win over the per-rect `drawArrays` path that motivated the
 * batcher (B19). Instances draw in submission order with blending on and
 * depth off, so later rects blend over earlier ones exactly as
 * sequential draws would.
 */
export class RectInstancePipeline {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly unitQuadVbo: WebGLBuffer;
  private readonly instanceVbo: WebGLBuffer;
  /** Byte capacity currently allocated on `instanceVbo`. */
  private instanceBytes = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC, "RectInstance");
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC, "RectInstance");
    this.program = linkProgram(gl, vert, frag, "RectInstance");

    const aPos = gl.getAttribLocation(this.program, "aPos");
    const aM0 = gl.getAttribLocation(this.program, "aM0");
    const aM1 = gl.getAttribLocation(this.program, "aM1");
    const aTrans = gl.getAttribLocation(this.program, "aTrans");
    const aColor = gl.getAttribLocation(this.program, "aColor");

    this.vao = glReq(gl.createVertexArray());
    this.unitQuadVbo = glReq(gl.createBuffer());
    this.instanceVbo = glReq(gl.createBuffer());

    gl.bindVertexArray(this.vao);

    // Per-vertex unit quad, TRIANGLE_STRIP order [0,0]→[1,1].
    gl.bindBuffer(gl.ARRAY_BUFFER, this.unitQuadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aPos, 0);

    // Per-instance interleaved attributes on the growable buffer.
    const stride = RECT_INSTANCE_FLOATS * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.enableVertexAttribArray(aM0);
    gl.vertexAttribPointer(aM0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aM0, 1);
    gl.enableVertexAttribArray(aM1);
    gl.vertexAttribPointer(aM1, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aM1, 1);
    gl.enableVertexAttribArray(aTrans);
    gl.vertexAttribPointer(aTrans, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(aTrans, 1);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(aColor, 1);

    gl.bindVertexArray(null);
  }

  /**
   * Upload the first `instanceCount` instances of `data` and draw them
   * in one instanced call. Leaves the default VAO bound so the caller's
   * non-VAO solid-program plumbing keeps working.
   */
  draw(data: Float32Array, instanceCount: number): void {
    if (instanceCount === 0) return;
    const gl = this.gl;
    const used = data.subarray(0, instanceCount * RECT_INSTANCE_FLOATS);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    // Grow the GPU buffer in place; re-spec with orphaning only when it
    // must enlarge, otherwise sub-update the live storage.
    const neededBytes = used.byteLength;
    if (neededBytes > this.instanceBytes) {
      gl.bufferData(gl.ARRAY_BUFFER, used, gl.DYNAMIC_DRAW);
      this.instanceBytes = neededBytes;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, used);
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.unitQuadVbo);
    this.gl.deleteBuffer(this.instanceVbo);
    this.gl.deleteProgram(this.program);
  }
}

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
in vec2 aM0;
in vec2 aM1;
in vec2 aTrans;
in vec4 aColor;
out vec4 vColor;
void main() {
  // Reconstruct the clip-space position from the projected affine
  // columns: p = M0 * x + M1 * y + T (unit quad x,y in [0,1]).
  vec2 p = aM0 * aPos.x + aM1 * aPos.y + aTrans;
  gl_Position = vec4(p, 0.0, 1.0);
  vColor = aColor;
}`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  // Premultiplied output (rgb*a, a) — matches premultipliedAlpha:true +
  // blendFunc(ONE, 1-SRC_ALPHA).
  fragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}`;
