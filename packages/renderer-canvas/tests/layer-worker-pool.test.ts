import { describe, expect, it, vi } from "vitest";
import { layerId as castLayerId } from "@oh-just-another/types";
import { LayerWorkerPool } from "../src/layer-worker-pool";

const fakeWorker = (): Worker =>
  ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onmessage: null,
    onmessageerror: null,
    onerror: null,
  } as unknown as Worker);

describe("LayerWorkerPool", () => {
  it("assigns each new layer to the least-loaded worker", () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const pool = new LayerWorkerPool([w1, w2]);

    const a = pool.workerFor(castLayerId("a"));
    const b = pool.workerFor(castLayerId("b"));
    expect(a).toBe(w1);
    expect(b).toBe(w2);
    expect(pool.assignedLayerCount).toBe(2);
  });

  it("pins the same worker for repeat lookups of the same layer", () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const pool = new LayerWorkerPool([w1, w2]);
    const id = castLayerId("layerX");
    const first = pool.workerFor(id);
    const second = pool.workerFor(id);
    expect(second).toBe(first);
  });

  it("routes submitForLayer back to the pinned worker", async () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const pool = new LayerWorkerPool([w1, w2]);
    const id = castLayerId("L");
    const pinned = pool.workerFor(id);
    const received = await pool.submitForLayer(id, async (w) => w);
    expect(received).toBe(pinned);
  });

  it("releaseLayer frees the slot for a new layer", () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const pool = new LayerWorkerPool([w1, w2]);
    const a = castLayerId("a");
    const b = castLayerId("b");
    pool.workerFor(a); // w1
    pool.workerFor(b); // w2
    pool.releaseLayer(a);
    const c = pool.workerFor(castLayerId("c"));
    // After releasing a (which was on w1), w1 has load 0 and w2 has load 1,
    // so the new layer should go to w1.
    expect(c).toBe(w1);
  });

  it("terminate clears all assignments", () => {
    const w1 = fakeWorker();
    const pool = new LayerWorkerPool([w1]);
    pool.workerFor(castLayerId("x"));
    pool.terminate();
    expect(pool.assignedLayerCount).toBe(0);
    expect(w1.terminate).toHaveBeenCalled();
  });
});
