import { bench, describe } from "vitest";
import { RectBatch } from "../src/webgl2-rect-batch";

/**
 * Micro-bench for the CPU-side hot path of the sharp-rect batcher:
 * packing 5k instances into the growable buffer and draining them. This
 * is the per-frame cost the instanced pipeline adds over an
 * already-warm buffer; the GL upload + `drawArraysInstanced` are not
 * exercisable in Node and are measured manually in the browser.
 */
const N = 5000;

/** Pre-grown batch so the bench measures steady-state packing, not grows. */
const warm = new RectBatch(N);
const noop = (): void => {
  /* discard — we measure packing + drain, not GL */
};

describe("RectBatch — instance packing (5k)", () => {
  bench("pack 5k + flush (warm buffer)", () => {
    for (let i = 0; i < N; i++) {
      warm.add(1, 0, 0, 1, i, i, i / N, 0.5, 0.25, 1);
    }
    warm.flush(noop);
  });

  bench("pack 5k + flush (cold buffer, grows)", () => {
    const cold = new RectBatch(1);
    for (let i = 0; i < N; i++) {
      cold.add(1, 0, 0, 1, i, i, i / N, 0.5, 0.25, 1);
    }
    cold.flush(noop);
  });
});
