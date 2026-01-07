import { describe, expect, it } from "vitest";
import { elbowRoute, type Vec2 } from "../src/index";

// A* hysteresis: among EQUAL-cost routes, prefer the one overlapping the
// previous route, so the connector stays put instead of flickering.
const sig = (p: readonly Vec2[]) => p.map((v) => `${Math.round(v.x)},${Math.round(v.y)}`).join(" ");

describe("elbowRoute hysteresis (prefer previous route)", () => {
  // from→to with an obstacle straddling the straight line → two equal detours
  // (over the top vs under the bottom). Symmetric, so cost is identical.
  const from: Vec2 = { x: 0, y: 0 };
  const to: Vec2 = { x: 120, y: 0 };
  const obstacle = { x: 50, y: -30, width: 20, height: 60 }; // centered on the line

  it("picks the preferred equal-cost route (over the top vs under the bottom)", () => {
    const base = elbowRoute(from, to, [obstacle])!;
    expect(base).not.toBeNull();
    // Prefer a route that detours OVER THE TOP (negative y).
    const top = elbowRoute(from, to, [obstacle], { prefer: [{ x: 0, y: 0 }, { x: 0, y: -60 }, { x: 120, y: -60 }, { x: 120, y: 0 }] })!;
    // Prefer a route UNDER THE BOTTOM (positive y).
    const bottom = elbowRoute(from, to, [obstacle], { prefer: [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 0 }] })!;
    // The two prefers must steer to opposite detours (hysteresis actually bites).
    const topMaxAbsY = Math.max(...top.map((p) => p.y));
    const bottomMaxAbsY = Math.max(...bottom.map((p) => p.y));
    expect(Math.min(...top.map((p) => p.y))).toBeLessThan(0); // top detour goes negative
    expect(bottomMaxAbsY).toBeGreaterThan(0); // bottom detour goes positive
    expect(sig(top)).not.toBe(sig(bottom));
    void base;
    void topMaxAbsY;
  });

  it("is sticky: re-routing with the previous route as prefer returns it unchanged", () => {
    const first = elbowRoute(from, to, [obstacle])!;
    const again = elbowRoute(from, to, [obstacle], { prefer: first })!;
    expect(sig(again)).toBe(sig(first));
  });
});
