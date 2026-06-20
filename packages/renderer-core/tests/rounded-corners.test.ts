import { describe, expect, it, vi } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Link,
  type Element,
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
  width: 40,
  height: 40,
});

const stubTarget = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  setFill: vi.fn(),
  setStroke: vi.fn(),
  setStrokeWidth: vi.fn(),
  setOpacity: vi.fn(),
  setLineCap: vi.fn(),
  setLineJoin: vi.fn(),
  setDashArray: vi.fn(),
  setFont: vi.fn(),
  setTextAlign: vi.fn(),
  setTextBaseline: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(),
  clear: vi.fn(),
  size: { width: 800, height: 600 },
});

describe("rounded link corners", () => {
  it("an elbow bend is drawn with a quadratic arc, not a sharp lineTo corner", () => {
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene; // right edge (40,20)
    s = addElement(s, rect("b", 200, 200)).scene;
    const e: Link = {
      id: linkId("e1"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      routing: "orthogonal",
      // A pre-routed L: from (40,20) → corner (120,20) → (120,200)? use routedPoints.
      routedPoints: [
        { x: 120, y: 20 },
        { x: 120, y: 200 },
      ],
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;
    const target = stubTarget();
    renderLinks(s, target as never);
    // The interior corner(s) round → at least one quadratic arc emitted.
    expect(target.quadraticCurveTo).toHaveBeenCalled();
  });

  it("a straight 2-point link has no corners (no quadratic)", () => {
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene;
    s = addElement(s, rect("b", 200, 0)).scene;
    const e: Link = {
      id: linkId("e2"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      routing: "straight",
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;
    const target = stubTarget();
    renderLinks(s, target as never);
    expect(target.quadraticCurveTo).not.toHaveBeenCalled();
  });
});

describe("uniform corner radius", () => {
  it("all corners use the same radius even with segments of different lengths", () => {
    // routedPoints with a SHORT (>=2px) middle segment and longer ones.
    // [from,(40,0),(40,40),(60,40),(60,200),to] — segment (40,40)→(60,40) is
    // 20px (short), others longer; corners must all share one radius.
    let s = emptyScene();
    s = addElement(s, rect("a", 0, -20)).scene; // right edge ~ (40,0)
    s = addElement(s, rect("b", 40, 200)).scene;
    const e: Link = {
      id: linkId("u1"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      routing: "orthogonal",
      routedPoints: [
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 60, y: 40 },
        { x: 60, y: 200 },
      ],
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;

    // Ordered call log so we can pair each quadratic corner with its approach.
    const calls: { op: string; args: number[] }[] = [];
    const t = new Proxy(
      { size: { width: 800, height: 600 }, measureText: () => ({ width: 0 }) },
      {
        get: (o: Record<string, unknown>, k: string) =>
          k in o ? o[k] : (...args: number[]) => calls.push({ op: k, args }),
      },
    ) as never;
    renderLinks(s, t);

    // r at each corner = distance from the lineTo approach point to the
    // quadratic control point (the corner vertex).
    const radii: number[] = [];
    for (let i = 1; i < calls.length; i++) {
      if (calls[i]!.op === "quadraticCurveTo" && calls[i - 1]!.op === "lineTo") {
        const [cx, cy] = calls[i]!.args;
        const [ax, ay] = calls[i - 1]!.args;
        radii.push(Math.hypot(cx! - ax!, cy! - ay!));
      }
    }
    expect(radii.length).toBeGreaterThanOrEqual(2);
    for (const r of radii) expect(Math.abs(r - radii[0]!)).toBeLessThan(0.5);
  });
});
