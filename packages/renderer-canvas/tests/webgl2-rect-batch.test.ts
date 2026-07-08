import { describe, expect, it } from "vitest";
import { RectBatch, RECT_INSTANCE_FLOATS } from "../src/webgl2-rect-batch";

/**
 * A recording sink standing in for the GL pipeline — captures each flush
 * as a snapshot of the drawn instances so tests can assert flush
 * boundaries and submission order without a WebGLRenderingContext.
 */
const recorder = () => {
  const flushes: { count: number; firstColor: number; instances: number[][] }[] = [];
  const sink = (data: Float32Array, count: number): void => {
    const instances: number[][] = [];
    for (let i = 0; i < count; i++) {
      instances.push(
        Array.from(data.subarray(i * RECT_INSTANCE_FLOATS, (i + 1) * RECT_INSTANCE_FLOATS)),
      );
    }
    flushes.push({ count, firstColor: data[6] as number, instances });
  };
  return { flushes, sink };
};

/** Queue an instance whose colour red-channel doubles as an order stamp. */
const addStamped = (batch: RectBatch, stamp: number): void => {
  batch.add(1, 0, 0, 1, 0, 0, stamp, 0, 0, 1);
};

describe("RectBatch — flush logic & ordering", () => {
  it("starts empty and does not flush", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    expect(batch.pending).toBe(0);
    expect(batch.flush(sink)).toBe(false);
    expect(flushes).toHaveLength(0);
  });

  it("coalesces a run of adds into a single flush", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    addStamped(batch, 1);
    addStamped(batch, 2);
    addStamped(batch, 3);
    expect(batch.pending).toBe(3);
    expect(batch.flush(sink)).toBe(true);
    expect(flushes).toHaveLength(1);
    expect(flushes[0]?.count).toBe(3);
    // Resets after a flush.
    expect(batch.pending).toBe(0);
    expect(batch.flush(sink)).toBe(false);
    expect(flushes).toHaveLength(1);
  });

  it("preserves submission order within a batch", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    addStamped(batch, 10);
    addStamped(batch, 20);
    addStamped(batch, 30);
    batch.flush(sink);
    const stamps = flushes[0]?.instances.map((row) => row[6]);
    expect(stamps).toEqual([10, 20, 30]);
  });

  it("splits into ordered batches when interleaved with flushes (z-order)", () => {
    // Models: rectA, rectB, <stroke → flush>, rectC, <present → flush>.
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    addStamped(batch, 1); // A
    addStamped(batch, 2); // B
    batch.flush(sink); // stroke interrupts → draw {A,B}
    addStamped(batch, 3); // C
    batch.flush(sink); // present → draw {C}
    expect(flushes.map((f) => f.count)).toEqual([2, 1]);
    // Global draw order across batches is A, B, C — never reordered.
    const order = flushes.flatMap((f) => f.instances.map((row) => row[6]));
    expect(order).toEqual([1, 2, 3]);
  });

  it("packs the projected affine columns and colour in layout order", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    batch.add(0.5, -0.25, 0.1, 0.2, -1, 0.75, 0.4, 0.6, 0.8, 0.9);
    batch.flush(sink);
    // Values round-trip through a Float32Array, so compare per element.
    const packed = flushes[0]?.instances[0];
    const expected = [0.5, -0.25, 0.1, 0.2, -1, 0.75, 0.4, 0.6, 0.8, 0.9];
    expect(packed).toHaveLength(expected.length);
    expected.forEach((v, i) => {
      expect(packed?.[i]).toBeCloseTo(v, 5);
    });
  });

  it("grows past the initial capacity without dropping or reordering", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch(2); // tiny initial capacity forces a grow
    const n = 50;
    for (let i = 0; i < n; i++) addStamped(batch, i);
    expect(batch.pending).toBe(n);
    batch.flush(sink);
    expect(flushes[0]?.count).toBe(n);
    const stamps = flushes[0]?.instances.map((row) => row[6]);
    expect(stamps).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it("reset() drops queued instances without drawing", () => {
    const { flushes, sink } = recorder();
    const batch = new RectBatch();
    addStamped(batch, 1);
    addStamped(batch, 2);
    batch.reset();
    expect(batch.pending).toBe(0);
    expect(batch.flush(sink)).toBe(false);
    expect(flushes).toHaveLength(0);
  });
});
