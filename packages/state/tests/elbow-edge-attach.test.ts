import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 100,
  height: 100,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } },
  { get: (o, k: string) => (k in o ? (o as Record<string, unknown>)[k] : () => undefined) },
) as never;

const makeEditor = (...els: Element[]): Editor => {
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(...els),
  });
};

describe("elbow endpoint binds to an edge dot dropped outside the body", () => {
  it("a drop on a side dot (outside the body, hit-test = empty) binds the endpoint", () => {
    // Rect A at x∈[0,100], rect B at x∈[300,400]; both y∈[0,100].
    const editor = makeEditor(rect("a", 0), rect("b", 300));
    // Draw an edge from A's right anchor to B's LEFT side dot. The dot sits a
    // few px outside B's left edge (x=300), so the release hit-test finds no
    // element (toElement = null).
    editor.applyEmit({
      type: "CREATE_EDGE",
      fromElement: elementId("a"),
      toElement: null,
      fromPoint: { x: 100, y: 50 }, // A right edge midpoint
      toPoint: { x: 295, y: 50 }, // ~5px outside B's left edge → within snap threshold
    });
    const link = [...editor.scene.links.values()][0]!;
    // The `to` end must be bound to B (anchor or outline), NOT a free point.
    expect(link.to.kind === "anchor" || link.to.kind === "outline").toBe(true);
    if (link.to.kind === "anchor" || link.to.kind === "outline") {
      expect(link.to.elementId).toBe(elementId("b"));
    }
  });

  it("a drop on truly empty canvas (far from any shape) stays a free point", () => {
    const editor = makeEditor(rect("a", 0));
    editor.applyEmit({
      type: "CREATE_EDGE",
      fromElement: elementId("a"),
      toElement: null,
      fromPoint: { x: 100, y: 50 },
      toPoint: { x: 600, y: 400 }, // nowhere near a shape
    });
    const link = [...editor.scene.links.values()][0]!;
    expect(link.to.kind).toBe("point");
  });
});
