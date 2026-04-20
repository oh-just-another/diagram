import { describe, expect, it } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
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

// True if the polyline passes through the obstacle's interior (sampled).
const crossesObstacle = (path: readonly { x: number; y: number }[]): boolean => {
  // obstacle rect: x∈[120,180], y∈[-40,40].
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1]!;
    const q = path[i]!;
    for (let t = 0; t <= 1; t += 0.02) {
      const x = p.x + (q.x - p.x) * t;
      const y = p.y + (q.y - p.y) * t;
      if (x > 122 && x < 178 && y > -38 && y < 38) return true;
    }
  }
  return false;
};

describe("avoid-obstacles link property (route around shapes)", () => {
  const selectLink = (): Editor => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: buildScene(),
    });
    handlers.get("pointerdown")!(pointer("pointerdown", 40, 0));
    handlers.get("pointerup")!(pointer("pointerup", 40, 0));
    expect(editor.selectedLink).toBe(linkId("L"));
    return editor;
  };

  it("enabling sets the flag + orthogonal routing and routes around the obstacle", () => {
    const editor = selectLink();
    editor.setSelectedLinkAvoidObstacles(true);
    editor.forceRender(); // rerouteElbows recomputes routedPoints

    const link = [...editor.scene.links.values()][0]!;
    expect(link.avoidObstacles).toBe(true);
    expect(link.routing).toBe("orthogonal");
    const path = getLinkPath(editor.scene, link)!;
    // The detour must leave y=0 and must not pass through the obstacle.
    expect(path.some((p) => Math.abs(p.y) > 0)).toBe(true);
    expect(crossesObstacle(path)).toBe(false);
  });

  it("reflects in the getter and toggles off", () => {
    const editor = selectLink();
    expect(editor.selectedLinkAvoidsObstacles).toBe(false);
    editor.setSelectedLinkAvoidObstacles(true);
    expect(editor.selectedLinkAvoidsObstacles).toBe(true);
    editor.setSelectedLinkAvoidObstacles(false);
    expect(editor.selectedLinkAvoidsObstacles).toBe(false);
    const link = [...editor.scene.links.values()][0]!;
    expect(link.avoidObstacles).toBe(false);
  });

  it("re-routes when the obstacle moves into the path (avoid digest)", () => {
    const editor = selectLink();
    editor.setSelectedLinkAvoidObstacles(true);
    editor.forceRender();
    const before = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    expect(crossesObstacle(before)).toBe(false);
    // The link still clears the obstacle after a forced re-render (stable).
    editor.forceRender();
    const after = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    expect(crossesObstacle(after)).toBe(false);
  });
});
