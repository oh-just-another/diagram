import { describe, expect, it, vi } from "vitest";
import { WorkerPool } from "../src/worker-pool";

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
  }) as unknown as Worker;

describe("WorkerPool", () => {
  it("submits to the first idle worker", async () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const pool = new WorkerPool([w1, w2]);
    const a = pool.submit(async (w) => {
      expect(w).toBe(w1);
      return "a";
    });
    const b = pool.submit(async (w) => {
      expect(w).toBe(w2);
      return "b";
    });
    expect(pool.busyCount).toBeGreaterThanOrEqual(1);
    await Promise.all([a, b]);
    expect(pool.busyCount).toBe(0);
  });

  it("queues tasks when all workers are busy", async () => {
    const w = fakeWorker();
    const pool = new WorkerPool([w]);
    const order: number[] = [];
    const slow = pool.submit(async () => {
      await new Promise<void>((r) => setTimeout(r, 5));
      order.push(1);
      return 1;
    });
    const queued = pool.submit(async () => {
      order.push(2);
      return 2;
    });
    await Promise.all([slow, queued]);
    expect(order).toEqual([1, 2]);
  });

  it("releases the worker on rejection", async () => {
    const w = fakeWorker();
    const pool = new WorkerPool([w]);
    await expect(
      pool.submit(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(pool.busyCount).toBe(0);
  });
});
