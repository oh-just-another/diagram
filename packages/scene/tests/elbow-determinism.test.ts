import { describe, expect, it } from "vitest";
import { elbowRoute, type Vec2 } from "../src/index";

// Routing is a PURE function of the inputs (no history): the same geometry
// always yields the same route, and it always terminates.
const sig = (p: readonly Vec2[]) => p.map((v) => `${Math.round(v.x)},${Math.round(v.y)}`).join(" ");

describe("elbowRoute is deterministic and terminating", () => {
  const obstacles = [
    { x: 0, y: 0, width: 200, height: 200 },
    { x: 260, y: 0, width: 200, height: 200 },
  ];
  const opts = { startHeading: { x: 0, y: 1 }, endHeading: { x: 0, y: -1 } } as const;

  it("same inputs → identical route, repeatably", () => {
    const from: Vec2 = { x: 100, y: 230 };
    const to: Vec2 = { x: 360, y: -30 };
    const a = elbowRoute(from, to, obstacles, opts)!;
    const b = elbowRoute(from, to, obstacles, opts)!;
    const c = elbowRoute(from, to, obstacles, opts)!;
    expect(sig(a)).toBe(sig(b));
    expect(sig(b)).toBe(sig(c));
  });

  it("terminates across a fine 2D sweep incl. sub-pixel offsets (no hang)", () => {
    let calls = 0;
    for (let dx = -8; dx <= 8; dx += 1) {
      for (let dyq = 0; dyq < 7; dyq++) {
        const from: Vec2 = { x: 100 + dx * 0.37, y: 230 };
        const to: Vec2 = { x: 360 + dx * 0.37, y: -30 - dyq * 0.41 };
        expect(elbowRoute(from, to, obstacles, opts), `null at dx=${dx},dyq=${dyq}`).not.toBeNull();
        calls++;
      }
    }
    expect(calls).toBeGreaterThan(100);
  });
});
