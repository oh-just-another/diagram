import { describe, expect, it } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x: number, y: number, w: number, h: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

// A link straight across y=0 from (0,0) to (300,0), with an obstacle rect
// sitting right on that line.
const buildScene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("obstacle", 120, -40, 60, 80)).scene;
  const edge: Link = {
    id: linkId("L"),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "point", position: { x: 0, y: 0 } },
    to: { kind: "point", position: { x: 300, y: 0 } },
    order: orderBetween(null, null),
    style: { stroke: "#000" },
  };
  s = addLink(s, edge).scene;
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

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number) => ({
  type, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0, preventDefault: () => {},
});

describe("auto-route link around obstacles", () => {
  it("produces obstacle-avoiding waypoints and switches to orthogonal", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: buildScene(),
    });
    // Select the link by tapping its body before the obstacle.
    handlers.get("pointerdown")!(pointer("pointerdown", 40, 0));
    handlers.get("pointerup")!(pointer("pointerup", 40, 0));
    expect(editor.selectedLink).toBe(linkId("L"));

    editor.autoRouteSelectedLink();

    const link = [...editor.scene.links.values()][0]!;
    expect(link.routing).toBe("orthogonal");
    expect((link.waypoints ?? []).length).toBeGreaterThan(0);
    // The detour must leave y=0 (go around the obstacle that straddles it).
    expect((link.waypoints ?? []).some((p) => Math.abs(p.y) > 0)).toBe(true);
  });
});
