import type { LineCap, LineJoin } from "@oh-just-another/renderer-core";
import { req, type Transform, type Vec2 } from "@oh-just-another/types";

/**
 * GPU-side stroke pipeline for the WebGL2 backend. Builds a single
 * triangle list per call (joins + caps included), uploads once, and
 * draws via the host's solid-color program. Independent of the
 * fill / text / image pipelines — they each manage their own VBO.
 *
 * Supports the full Canvas2D / SVG join + cap matrix:
 *   joins: "miter" (default), "bevel", "round"
 *   caps:  "butt" (default),  "square", "round"
 *
 * One TRIANGLES list rather than a strip + extra primitives: round
 * joins / caps need fan triangles glued on top of the strip, and a
 * single TRIANGLES list avoids re-binding the buffer per join while
 * keeping heterogeneous join geometry easy to author.
 */

/** Two-vertex pair per polyline vertex (left + right side of the band). */
interface SideOffset {
  ox: number;
  oy: number;
}

/**
 * Maximum miter overshoot, in units of stroke width. Past this the
 * miter falls back to a bevel — matches Canvas2D's `miterLimit` default
 * of 10 and SVG's spec default.
 */
const MITER_LIMIT = 10;

/** Round-join / round-cap fan segments per pi radians. 12 keeps each
 *  segment ≈ 15°, smooth at any sensible zoom. */
const ROUND_SEGMENTS_PER_PI = 12;

/**
 * Module-level scratch buffers — reused across every
 * `drawPolylineStroke` invocation so the hot path allocates zero
 * `Float32Array`s per frame after warmup.
 *
 * Safe because WebGL is single-threaded and `drawPolylineStroke` is
 * called serially from `WebGL2Target.stroke()`; multiple canvases on
 * the same page share these buffers, which is fine.
 *
 * Initial caps cover a typical small stroke (≤32 segments) without a
 * grow. `ensureNCapacity` / `ensureTrisCapacity` upsize to the next
 * power of 2 on demand; capacity only ratchets up.
 */
let scratchNx = new Float32Array(64);
let scratchNy = new Float32Array(64);
let scratchTris = new Float32Array(1024);
let scratchTrisLen = 0;

const ensureNCapacity = (n: number): void => {
  if (scratchNx.length >= n) return;
  let cap = scratchNx.length;
  while (cap < n) cap *= 2;
  scratchNx = new Float32Array(cap);
  scratchNy = new Float32Array(cap);
};

const ensureTrisCapacity = (n: number): void => {
  if (scratchTris.length >= n) return;
  let cap = scratchTris.length;
  while (cap < n) cap *= 2;
  const next = new Float32Array(cap);
  // Carry over any values already pushed before the grow.
  next.set(scratchTris.subarray(0, scratchTrisLen));
  scratchTris = next;
};

const trisPush = (x: number, y: number): void => {
  if (scratchTrisLen + 2 > scratchTris.length) {
    ensureTrisCapacity(scratchTrisLen + 2);
  }
  scratchTris[scratchTrisLen++] = x;
  scratchTris[scratchTrisLen++] = y;
};

export interface StrokeStyle {
  readonly width: number;
  readonly color: readonly [number, number, number];
  readonly opacity: number;
  readonly join: LineJoin;
  readonly cap: LineCap;
}

/**
 * Compute one miter offset at the hinge between two unit normals.
 * Returns `{ ox, oy }` along the bisector, clamped to MITER_LIMIT.
 * Exported so `webgl2-target.ts` can reuse it for closed-polyline seam
 * vertices.
 */
export const miterOffset = (
  n1x: number,
  n1y: number,
  n2x: number,
  n2y: number,
  half: number,
): SideOffset => {
  let bx = n1x + n2x;
  let by = n1y + n2y;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-6) {
    return { ox: n1x * half, oy: n1y * half };
  }
  bx /= blen;
  by /= blen;
  const cos = bx * n1x + by * n1y;
  const miterLen = cos > 1e-6 ? half / cos : half;
  const clamped = Math.min(miterLen, half * MITER_LIMIT);
  return { ox: bx * clamped, oy: by * clamped };
};

/**
 * Build the stroke geometry for a polyline + style, upload to the
 * caller's dynamic VBO, and draw. Identity uTransform — vertices are
 * pre-projected into clip space here.
 *
 * The caller passes its solid program + cached `aPos` attribute
 * location + its dynamic VBO. This function binds & sets up the
 * attribute itself so it's self-contained — no implicit dependency on
 * the previous draw's GL state.
 */
export const drawPolylineStroke = (
  gl: WebGL2RenderingContext,
  polyline: readonly Vec2[],
  style: StrokeStyle,
  transform: Transform,
  size: { width: number; height: number },
  program: WebGLProgram,
  uTransformLoc: WebGLUniformLocation | null,
  uColorLoc: WebGLUniformLocation | null,
  uOpacityLoc: WebGLUniformLocation | null,
  dynamicVbo: WebGLBuffer,
  aPosLoc: number,
  identityMat3: Float32Array,
): void => {
  if (style.width <= 0 || polyline.length < 2) return;
  const half = style.width / 2;

  const segCount = polyline.length - 1;
  // Reuse the module-level scratch nx/ny buffers — grow on demand.
  ensureNCapacity(segCount);
  const nx = scratchNx;
  const ny = scratchNy;
  for (let i = 0; i < segCount; i++) {
    const a = req(polyline[i]);
    const b = req(polyline[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / len;
    ny[i] = dx / len;
  }

  const first = req(polyline[0]);
  const last = req(polyline[polyline.length - 1]);
  const closed = polyline.length >= 3 && first.x === last.x && first.y === last.y;

  // Reset the scratch vertex stream length — world-space (x, y) pairs
  // are pushed into `scratchTris` via `trisPush`, then projected
  // in-place to clip space before the bufferData call.
  scratchTrisLen = 0;
  const push = trisPush;

  // Render the segment band between vertex i and i+1 as two triangles.
  // Both endpoints use the same side-offset; join geometry stitches the
  // next segment on.
  const band = (
    ax: number,
    ay: number,
    anx: number,
    any: number,
    bx: number,
    by: number,
    bnx: number,
    bny: number,
  ): void => {
    // Vertices:
    //   A_left  = (ax + anx, ay + any)
    //   A_right = (ax - anx, ay - any)
    //   B_left  = (bx + bnx, by + bny)
    //   B_right = (bx - bnx, by - bny)
    push(ax + anx, ay + any);
    push(ax - anx, ay - any);
    push(bx + bnx, by + bny);
    push(bx + bnx, by + bny);
    push(ax - anx, ay - any);
    push(bx - bnx, by - bny);
  };

  // Per-segment side offsets (the polyline endpoint offset, no
  // bisector — joins add their own geometry between adjacent bands).
  const segLeft = (i: number): SideOffset => ({ ox: req(nx[i]) * half, oy: req(ny[i]) * half });

  // Emit the rect bands for every segment.
  for (let i = 0; i < segCount; i++) {
    const a = req(polyline[i]);
    const b = req(polyline[i + 1]);
    const o = segLeft(i);
    band(a.x, a.y, o.ox, o.oy, b.x, b.y, o.ox, o.oy);
  }

  // Emit join geometry at every interior vertex (and at the seam for
  // closed polylines).
  const emitJoin = (
    vertexX: number,
    vertexY: number,
    n1x: number,
    n1y: number,
    n2x: number,
    n2y: number,
  ): void => {
    if (style.join === "miter") {
      const { ox, oy } = miterOffset(n1x, n1y, n2x, n2y, half);
      // Outside-of-bend wedge: tip = vertex + offset on outer side.
      // Outer side comes from the cross-product sign.
      const cross = n1x * n2y - n1y * n2x;
      if (Math.abs(cross) < 1e-9) return; // colinear — no join needed
      // Outer normal direction = cross < 0 → +offset; cross > 0 → -offset.
      const sign = cross < 0 ? 1 : -1;
      const outerTipX = vertexX + sign * ox;
      const outerTipY = vertexY + sign * oy;
      const innerNormal1X = sign * n1x * half;
      const innerNormal1Y = sign * n1y * half;
      const innerNormal2X = sign * n2x * half;
      const innerNormal2Y = sign * n2y * half;
      // Triangle: vertex, end of seg-1 outer-side, miter tip.
      push(vertexX, vertexY);
      push(vertexX + innerNormal1X, vertexY + innerNormal1Y);
      push(outerTipX, outerTipY);
      // Triangle: vertex, miter tip, start of seg-2 outer-side.
      push(vertexX, vertexY);
      push(outerTipX, outerTipY);
      push(vertexX + innerNormal2X, vertexY + innerNormal2Y);
    } else if (style.join === "bevel") {
      const cross = n1x * n2y - n1y * n2x;
      if (Math.abs(cross) < 1e-9) return;
      const sign = cross < 0 ? 1 : -1;
      const a1x = vertexX + sign * n1x * half;
      const a1y = vertexY + sign * n1y * half;
      const a2x = vertexX + sign * n2x * half;
      const a2y = vertexY + sign * n2y * half;
      // Single triangle fills the bevel gap.
      push(vertexX, vertexY);
      push(a1x, a1y);
      push(a2x, a2y);
    } else {
      // round join: fan triangles between the two outer-side offsets.
      const cross = n1x * n2y - n1y * n2x;
      if (Math.abs(cross) < 1e-9) return;
      const sign = cross < 0 ? 1 : -1;
      const startAngle = Math.atan2(sign * n1y, sign * n1x);
      const endAngle = Math.atan2(sign * n2y, sign * n2x);
      // Pick the shortest angular sweep.
      let delta = endAngle - startAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const segs = Math.max(2, Math.ceil((Math.abs(delta) / Math.PI) * ROUND_SEGMENTS_PER_PI));
      let prevX = vertexX + Math.cos(startAngle) * half;
      let prevY = vertexY + Math.sin(startAngle) * half;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const angle = startAngle + delta * t;
        const x = vertexX + Math.cos(angle) * half;
        const y = vertexY + Math.sin(angle) * half;
        push(vertexX, vertexY);
        push(prevX, prevY);
        push(x, y);
        prevX = x;
        prevY = y;
      }
    }
  };

  for (let i = 1; i < segCount; i++) {
    const p = req(polyline[i]);
    emitJoin(p.x, p.y, req(nx[i - 1]), req(ny[i - 1]), req(nx[i]), req(ny[i]));
  }
  if (closed) {
    const p = req(polyline[0]);
    emitJoin(p.x, p.y, req(nx[segCount - 1]), req(ny[segCount - 1]), req(nx[0]), req(ny[0]));
  }

  // Caps on open polylines (closed shapes don't have caps).
  if (!closed) {
    const capFirst = req(polyline[0]);
    const second = req(polyline[1]);
    emitCap(
      push,
      capFirst.x,
      capFirst.y,
      second.x,
      second.y,
      req(nx[0]),
      req(ny[0]),
      half,
      style.cap,
      true,
    );
    const lastVx = req(polyline[polyline.length - 1]);
    const prevVx = req(polyline[polyline.length - 2]);
    emitCap(
      push,
      lastVx.x,
      lastVx.y,
      prevVx.x,
      prevVx.y,
      req(nx[segCount - 1]),
      req(ny[segCount - 1]),
      half,
      style.cap,
      false,
    );
  }

  if (scratchTrisLen === 0) return;

  // Project all triangle vertices into clip space in-place: read world
  // (x, y) first, then overwrite the same indices with clip-space
  // values.
  const sx = 2 / size.width;
  const sy = -2 / size.height;
  for (let i = 0; i < scratchTrisLen; i += 2) {
    const x = req(scratchTris[i]);
    const y = req(scratchTris[i + 1]);
    const wx = transform.a * x + transform.c * y + transform.e;
    const wy = transform.b * x + transform.d * y + transform.f;
    scratchTris[i] = wx * sx - 1;
    scratchTris[i + 1] = wy * sy + 1;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicVbo);
  // subarray gives a view into the live scratch buffer — no copy.
  gl.bufferData(gl.ARRAY_BUFFER, scratchTris.subarray(0, scratchTrisLen), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix3fv(uTransformLoc, false, identityMat3);
  gl.uniform3f(uColorLoc, style.color[0], style.color[1], style.color[2]);
  gl.uniform1f(uOpacityLoc, style.opacity);
  gl.drawArrays(gl.TRIANGLES, 0, scratchTrisLen / 2);
};

/**
 * Emit a cap at one endpoint of an open polyline. `start` indicates
 * whether this is the leading (first) cap — the outward tangent
 * direction reverses for the trailing cap.
 *   `butt`   → nothing (the rect band already squared off the end).
 *   `square` → extend the rect band by `half` along the tangent.
 *   `round`  → half-circle fan.
 */
const emitCap = (
  push: (x: number, y: number) => void,
  vx: number,
  vy: number,
  otherX: number,
  otherY: number,
  nrmX: number,
  nrmY: number,
  half: number,
  cap: LineCap,
  start: boolean,
): void => {
  if (cap === "butt") return;
  // Outward tangent direction: from vertex away from the polyline's
  // interior. For `start`, it's vertex → -other (extending backward);
  // for the trailing cap, it's vertex → +other (extending forward).
  // Both point away from the next-vertex along the segment direction.
  const dx = otherX - vx;
  const dy = otherY - vy;
  const len = Math.hypot(dx, dy) || 1;
  const tx = -dx / len; // outward tangent
  const ty = -dy / len;
  // `start` cap points outward by reversing; the trailing cap already
  // points outward (other is the previous vertex).
  const sign = start ? 1 : -1;
  const outX = sign * tx;
  const outY = sign * ty;
  if (cap === "square") {
    // Extend the band by `half` along the outward tangent.
    const A = { x: vx + nrmX * half, y: vy + nrmY * half };
    const B = { x: vx - nrmX * half, y: vy - nrmY * half };
    const Aext = { x: A.x + outX * half, y: A.y + outY * half };
    const Bext = { x: B.x + outX * half, y: B.y + outY * half };
    push(A.x, A.y);
    push(Aext.x, Aext.y);
    push(B.x, B.y);
    push(B.x, B.y);
    push(Aext.x, Aext.y);
    push(Bext.x, Bext.y);
    return;
  }
  // round cap: half-circle fan starting from +normal, sweeping through
  // the outward tangent, ending at -normal.
  const startAngle = Math.atan2(nrmY, nrmX);
  const segs = ROUND_SEGMENTS_PER_PI;
  // Sweep π radians in the outward direction. The sweep direction
  // (CW vs CCW) depends on which side `out` is relative to the normal —
  // use the cross-product sign.
  const cross = nrmX * outY - nrmY * outX;
  const sweepSign = cross >= 0 ? 1 : -1;
  let prevX = vx + Math.cos(startAngle) * half;
  let prevY = vy + Math.sin(startAngle) * half;
  for (let s = 1; s <= segs; s++) {
    const t = s / segs;
    const angle = startAngle + sweepSign * Math.PI * t;
    const x = vx + Math.cos(angle) * half;
    const y = vy + Math.sin(angle) * half;
    push(vx, vy);
    push(prevX, prevY);
    push(x, y);
    prevX = x;
    prevY = y;
  }
};
