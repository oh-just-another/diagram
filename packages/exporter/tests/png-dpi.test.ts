import { describe, expect, it } from "vitest";
import { setPngDpi } from "../src/png-dpi";

// Smallest valid PNG: 1×1 transparent — assembled by hand so the test has
// no dependency on a real renderer.
const tinyPng = (): Uint8Array => {
  // Pre-computed by encoding new Uint8Array(1×1×4) with zlib + the standard
  // PNG header. Sourced from the W3C PNG spec example, ~70 bytes.
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
};

const PHYS_TAG = [0x70, 0x48, 0x59, 0x73];

const findPhys = (buf: Uint8Array): number => {
  for (let i = 8; i < buf.length - 4; i++) {
    if (PHYS_TAG.every((b, k) => buf[i + k] === b)) return i;
  }
  return -1;
};

const readUint32 = (b: Uint8Array, i: number): number =>
  (b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!;

describe("setPngDpi", () => {
  it("inserts a pHYs chunk at 300 dpi", () => {
    const out = setPngDpi(tinyPng(), 300);
    const phys = findPhys(out);
    expect(phys).toBeGreaterThan(0);
    // ppmX = 300 * 39.37 ≈ 11811
    const ppmX = readUint32(out, phys + 4);
    expect(ppmX).toBeCloseTo(300 * 39.3700787, 0);
  });

  it("replaces an existing pHYs chunk on re-write", () => {
    const a = setPngDpi(tinyPng(), 96);
    const b = setPngDpi(a, 300);
    // Should still have exactly one pHYs occurrence.
    const occurrences: number[] = [];
    for (let i = 8; i < b.length - 4; i++) {
      if (PHYS_TAG.every((bt, k) => b[i + k] === bt)) occurrences.push(i);
    }
    expect(occurrences).toHaveLength(1);
  });

  it("rejects non-PNG input", () => {
    expect(() => setPngDpi(new Uint8Array([1, 2, 3, 4]), 96)).toThrow(/not a PNG/);
  });
});
