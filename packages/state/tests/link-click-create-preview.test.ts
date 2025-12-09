import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

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

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 800, height: 600 },
} as never;

const host = {
  addEventListener: () => {}, removeEventListener: () => {},
  setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => true,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: { cursor: "" },
} as never;

describe("previewClickCreate (ghost of click-creates-element)", () => {
  it("ghost element is offset in the dot direction; connector links them", () => {
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0)),
    });
    // Right dot → ghost to the right of A (40 wide + gap), same size.
    const p = editor.previewClickCreate(elementId("a"), "right")!;
    expect(p).not.toBeNull();
    expect(p.bounds.width).toBe(40);
    expect(p.bounds.height).toBe(40);
    expect(p.bounds.x).toBeGreaterThan(40); // strictly to the right of A's right edge
    expect(p.bounds.y).toBeCloseTo(0, 0);
    // Connector: from A's right edge midpoint to the ghost's facing (left) edge.
    expect(p.path.length).toBe(2);
    expect(p.path[0]!.x).toBeCloseTo(40, 0);
    expect(p.path[0]!.y).toBeCloseTo(20, 0);
    expect(p.path[1]!.x).toBeCloseTo(p.bounds.x, 0); // ghost left edge
    expect(p.path[1]!.y).toBeCloseTo(20, 0);
    // The would-be element is a same-kind clone shifted to the ghost bounds —
    // the overlay renders THIS through the real renderer so the ghost matches
    // the source shape (an ellipse ghosts as an ellipse), not a bounding rect.
    expect(p.element.type).toBe("rectangle");
    expect(p.element.position.x).toBeCloseTo(p.bounds.x, 0);
    expect(p.element.position.y).toBeCloseTo(p.bounds.y, 0);
    // The ghost scene carries the would-be connector as a REAL link (so the
    // overlay renders it through the actual link renderer — same routing /
    // arrowhead it'll get on create — instead of a dashed preview line).
    const ghostLink = p.ghostScene.links.get(p.ghostLinkId)!;
    expect(ghostLink).toBeDefined();
    expect(ghostLink.arrowheads?.to).toBeDefined(); // has the default arrowhead
    expect(p.ghostScene.links.size).toBe(1); // only the ghost link is rendered
    // Both endpoints resolve (source + ghost element present in the scene).
    expect(p.ghostScene.elements.size).toBeGreaterThanOrEqual(2);
  });

  it("returns null for a missing element", () => {
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: emptyScene(),
    });
    expect(editor.previewClickCreate(elementId("nope"), "right")).toBeNull();
  });
});
