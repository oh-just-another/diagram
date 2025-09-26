import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { sceneForFrame } from "../src/region";

const frame = (id: string, x: number, y: number, w: number, h: number, name = "Frame 1"): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "frame",
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: w,
    height: h,
    name,
  } as Element);

const rect = (id: string, parent?: string, x = 0, y = 0): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 40,
    height: 40,
    ...(parent ? { frameId: elementId(parent) } : {}),
  } as Element);

const sceneWith = (...shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addShape(s, sh).scene;
  return s;
};

describe("sceneForFrame", () => {
  it("returns null for unknown frame id", () => {
    const out = sceneForFrame(sceneWith(rect("a")), elementId("missing"));
    expect(out).toBeNull();
  });

  it("returns null when the id resolves to a non-frame shape", () => {
    const out = sceneForFrame(sceneWith(rect("a")), elementId("a"));
    expect(out).toBeNull();
  });

  it("keeps only shapes whose frameId matches", () => {
    const s = sceneWith(
      frame("f1", 100, 100, 200, 200),
      rect("a", "f1"),
      rect("b", "f1", 50),
      rect("orphan"),
      rect("c", "other-frame"),
    );
    const out = sceneForFrame(s, elementId("f1"))!;
    expect([...out.shapes.keys()].sort()).toEqual(["a", "b"]);
  });

  it("shifts the viewport so the frame's top-left lands at (0,0)", () => {
    const s = sceneWith(frame("f1", 100, 50, 200, 150));
    const out = sceneForFrame(s, elementId("f1"))!;
    expect(out.viewport.pan).toEqual({ x: -100, y: -50 });
    expect(out.viewport.size).toEqual({ width: 200, height: 150 });
  });

  it("never includes the frame shape itself in the clipped scene", () => {
    const s = sceneWith(frame("f1", 0, 0, 100, 100), rect("a", "f1"));
    const out = sceneForFrame(s, elementId("f1"))!;
    expect(out.shapes.has(elementId("f1"))).toBe(false);
  });
});
