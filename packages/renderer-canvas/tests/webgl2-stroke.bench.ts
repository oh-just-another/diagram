import { bench, describe } from "vitest";
import { drawPolylineStroke, type StrokeStyle } from "../src/webgl2-stroke";
import { dashPolyline } from "../src/webgl2-target";
import type { Transform, Vec2 } from "@oh-just-another/types";

/**
 * Micro-bench for the CPU side of the WebGL2 stroke pipeline: building
 * the triangle list (segment bands + joins + caps) and projecting it to
 * clip space, plus the dash split (`dashPolyline`) that feeds the same
 * pipeline per on-run. GL upload + `drawArrays` are not exercisable in
 * Node — the GL context is a no-op stub — and are measured manually in
 * the browser.
 */
const noop = (): void => {
  /* GL excluded — geometry generation only */
};

const glStub = {
  ARRAY_BUFFER: 0x8892,
  DYNAMIC_DRAW: 0x88e8,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  useProgram: noop,
  bindVertexArray: noop,
  bindBuffer: noop,
  bufferData: noop,
  uniformMatrix3fv: noop,
  uniform3f: noop,
  uniform1f: noop,
  drawArrays: noop,
} as unknown as WebGL2RenderingContext;

const program = {} as WebGLProgram;
const vbo = {} as WebGLBuffer;
const vao = {} as WebGLVertexArrayObject;
const identityMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const transform: Transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const size = { width: 1920, height: 1080 };

const style = (join: StrokeStyle["join"], cap: StrokeStyle["cap"]): StrokeStyle => ({
  width: 4,
  color: [0.2, 0.4, 0.6],
  opacity: 1,
  join,
  cap,
});

/** Zigzag open polyline (every interior vertex bends → joins emit). */
const zigzag = (points: number): Float64Array => {
  const xy = new Float64Array(points * 2);
  for (let i = 0; i < points; i++) {
    xy[i * 2] = i * 10;
    xy[i * 2 + 1] = (i % 2) * 20;
  }
  return xy;
};

const xy64 = zigzag(64);
const xy1024 = zigzag(1024);
const miterButt = style("miter", "butt");
const roundRound = style("round", "round");

const stroke = (xy: Float64Array, points: number, s: StrokeStyle): void => {
  drawPolylineStroke(
    glStub,
    xy,
    points,
    s,
    transform,
    size,
    program,
    null,
    null,
    null,
    vbo,
    vao,
    identityMat3,
  );
};

// Pre-warm so module-level scratch buffers are already grown — the
// benches measure steady-state geometry generation, not grows.
stroke(xy1024, 1024, roundRound);

/** Vec2 view of the 1024-pt polyline for the dash split. */
const pts1024: Vec2[] = [];
for (let i = 0; i < 1024; i++) {
  pts1024.push({ x: xy1024[i * 2] ?? 0, y: xy1024[i * 2 + 1] ?? 0 });
}
const dashPattern = [8, 4] as const;
/** Scratch for flattening each on-run, as `WebGL2Target.stroke()` does. */
const dashRunXY = new Float64Array(2048);

describe("webgl2-stroke — CPU geometry generation", () => {
  bench("solid 64-pt polyline (miter + butt)", () => {
    stroke(xy64, 64, miterButt);
  });

  bench("solid 1024-pt polyline (miter + butt)", () => {
    stroke(xy1024, 1024, miterButt);
  });

  bench("solid 1024-pt polyline (round joins + round caps)", () => {
    stroke(xy1024, 1024, roundRound);
  });

  bench("dashed 1024-pt polyline [8, 4] (split + stroke each run)", () => {
    for (const run of dashPolyline(pts1024, dashPattern)) {
      if (run.length < 2) continue;
      for (let i = 0; i < run.length; i++) {
        const p = run[i];
        if (!p) continue;
        dashRunXY[i * 2] = p.x;
        dashRunXY[i * 2 + 1] = p.y;
      }
      stroke(dashRunXY, run.length, miterButt);
    }
  });
});
