import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  getLinkPath,
  orderBetween,
  type Scene,
  type Element,
  type Link,
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
  width: 80,
  height: 60,
});

const buildScene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 0)).scene;
  s = addElement(s, rect("b", 300, 120)).scene;
  const e: Link = {
    id: linkId("L"),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    routing: "orthogonal",
    order: orderBetween(null, null),
    style: { stroke: "#000" },
  };
  return addLink(s, e).scene;
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

const orthogonal = (path: readonly { x: number; y: number }[]) => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (!(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6)) return false;
  }
  return true;
};

describe("elbow reroute pass (editor fills routedPoints)", () => {
  it("fills routedPoints for orthogonal links and the path is axis-aligned", () => {
    const editor = new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene() });
    editor.forceRender();
    const link = [...editor.scene.links.values()][0]!;
    expect(link.routedPoints).toBeDefined();
    const path = getLinkPath(editor.scene, link)!;
    expect(orthogonal(path)).toBe(true);
  });

  it("re-routes when a bound shape moves", () => {
    const editor = new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene() });
    editor.forceRender();
    const before = JSON.stringify([...editor.scene.links.values()][0]!.routedPoints);

    // Move B far away → route inputs change → reroute.
    editor.selectAll();
    editor.moveSelectionBy({ x: 0, y: 400 });
    editor.forceRender();

    const after = [...editor.scene.links.values()][0]!;
    expect(JSON.stringify(after.routedPoints)).not.toBe(before);
    expect(orthogonal(getLinkPath(editor.scene, after)!)).toBe(true);
  });
});
