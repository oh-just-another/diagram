import { describe, expect, it, vi } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type LinkRouting,
  type Link,
  type Element,
  type Vec2,
} from "@oh-just-another/scene";
import { renderLinks } from "../src/index";

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 20,
  height: 20,
});

const sceneWith = (routing: LinkRouting, waypoints?: Vec2[]) => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 0)).scene; // right edge at (20,10)
  s = addElement(s, rect("b", 200, 0)).scene; // left edge at (200,10) — same y
  const edge: Link = {
    id: linkId("e1"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    style: { stroke: "#000" },
    routing,
    ...(waypoints ? { waypoints } : {}),
  };
  return addLink(s, edge).scene;
};

const stubTarget = () => ({
  save: vi.fn(), restore: vi.fn(), setFill: vi.fn(), setStroke: vi.fn(),
  setStrokeWidth: vi.fn(), setOpacity: vi.fn(), setLineCap: vi.fn(), setLineJoin: vi.fn(),
  setDashArray: vi.fn(), setFont: vi.fn(), setTextAlign: vi.fn(), setTextBaseline: vi.fn(),
  translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), setTransform: vi.fn(), resetTransform: vi.fn(),
  beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(), rect: vi.fn(), ellipse: vi.fn(),
  fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(), clear: vi.fn(), size: { width: 800, height: 600 },
});

describe("curved (bezier) link rendering", () => {
  it("a straight 2-point bezier span draws a visible arc (bezierCurveTo, not a straight lineTo)", () => {
    const target = stubTarget();
    renderLinks(sceneWith("bezier"), target as never);
    // The arc is emitted as cubic beziers, not flat line segments.
    expect(target.bezierCurveTo).toHaveBeenCalled();
    // Pull the mid control geometry: for an axis-aligned (same-y) span the
    // curve must leave the chord — at least one bezier control / end point
    // has a y clearly off the chord's y (=10).
    const offChord = target.bezierCurveTo.mock.calls.some((c) =>
      [c[1], c[3], c[5]].some((y) => Math.abs((y as number) - 10) > 2),
    );
    expect(offChord).toBe(true);
  });

  it("straight routing on the same span stays a flat line (no bezier)", () => {
    const target = stubTarget();
    renderLinks(sceneWith("straight"), target as never);
    expect(target.bezierCurveTo).not.toHaveBeenCalled();
    expect(target.lineTo).toHaveBeenCalled();
  });

  it("a waypointed bezier flows through the waypoint as a spline (multiple beziers, no polyline lineTo)", () => {
    const target = stubTarget();
    // Waypoint bows the path up; the spline should pass smoothly through it.
    renderLinks(sceneWith("bezier", [{ x: 110, y: 80 }]), target as never);
    // [from, wp, to] → 2 spline segments → ≥2 bezierCurveTo, and the curve
    // body is NOT drawn as straight lineTo segments.
    expect(target.bezierCurveTo.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(target.lineTo).not.toHaveBeenCalled();
  });
});
