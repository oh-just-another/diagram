import { bench, describe } from "vitest";
import { triangulateCached, type CurveSegment } from "../src/webgl2-curve";

/**
 * Micro-bench for the CPU side of the WebGL2 Loop-Blinn curve pipeline:
 * `triangulateCached` — key build + FNV-1a hash + LRU lookup on the hit
 * path, plus full cubic subdivision / triangulation on the miss path.
 * GL upload + `drawArrays` (the rest of `LoopBlinnCurvePipeline.draw`)
 * are not exercisable in Node and are measured manually in the browser.
 */

/** Mutable point aliases so the cold benches can produce unique keys
 *  per iteration without allocating fresh segment arrays. */
interface MutablePoint {
  x: number;
  y: number;
}

const cubicPath = (segments: number): { curves: CurveSegment[]; first: MutablePoint } => {
  const curves: CurveSegment[] = [];
  const first: MutablePoint = { x: 0, y: 0 };
  for (let i = 0; i < segments; i++) {
    const x = i * 40;
    curves.push({
      kind: "c",
      points: [
        i === 0 ? first : { x, y: 0 },
        { x: x + 10, y: 30 },
        { x: x + 30, y: -30 },
        { x: x + 40, y: 0 },
      ],
    });
  }
  return { curves, first };
};

const small = cubicPath(8);
const large = cubicPath(64);

// Pre-warm: grow the key scratch + shared batch buffers, and seed the
// cache entries the hit benches touch — steady state, no cold grows.
triangulateCached(small.curves);
triangulateCached(large.curves);

/** Counter driving unique control-point content for the miss benches. */
let cold = 0;

describe("triangulateCached — Loop-Blinn triangulation cache", () => {
  bench("cache hit, 8 cubic segments", () => {
    triangulateCached(small.curves);
  });

  bench("cache hit, 64 cubic segments", () => {
    triangulateCached(large.curves);
  });

  bench("cache miss (unique content), 8 cubic segments", () => {
    small.first.y = ++cold;
    triangulateCached(small.curves);
  });

  bench("cache miss (unique content), 64 cubic segments", () => {
    large.first.y = ++cold;
    triangulateCached(large.curves);
  });
});
