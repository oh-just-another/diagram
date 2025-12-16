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

// A above B (stacked); both linked from their RIGHT anchors → a curved link
// exits +x from each end and bows out to the right (a C-curve), so the curve
// clearly leaves the straight chord. (A right→left same-row pair would now be
// straight, which is the whole point of the edge-normal exit.)
const sceneWith = (routing: LinkRouting, waypoints?: Vec2[]) => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 0)).scene; // right edge at (20,10)
  s = addElement(s, rect("b", 0, 200)).scene; // right edge at (20,210)
  const edge: Link = {
    id: linkId("e1"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "right" } },
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
  it("a no-waypoint bezier exits along the edge normal and bows off the chord", () => {
    const target = stubTarget();
    renderLinks(sceneWith("bezier"), target as never);
    // The curve is emitted as a cubic bezier, not flat line segments.
    expect(target.bezierCurveTo).toHaveBeenCalled();
    // Both ends exit +x (right anchors), so the control points sit clearly to
    // the right of the chord (x = 20) — proves the edge-normal exit / bow.
    const offChord = target.bezierCurveTo.mock.calls.some((c) =>
      [c[0], c[2]].some((x) => (x as number) > 30),
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
    // Waypoint to the right; the spline should pass smoothly through it.
    renderLinks(sceneWith("bezier", [{ x: 140, y: 110 }]), target as never);
    // [from, wp, to] → 2 spline segments → ≥2 bezierCurveTo, and the curve
    // body is NOT drawn as straight lineTo segments.
    expect(target.bezierCurveTo.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(target.lineTo).not.toHaveBeenCalled();
  });
});
