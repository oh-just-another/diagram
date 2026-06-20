import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Link,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// An anchored link (default elbow) switched to Straight, a waypoint added by
// gesture, then dragged back onto the line to delete it. Mirrors what the
// toolbar and pointer do.
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

const noopTarget = new Proxy(
  { size: { width: 800, height: 600 } },
  { get: (o: Record<string, unknown>, k: string) => (k in o ? o[k] : () => {}) },
) as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (ty: string, fn: (ev: unknown) => void) => handlers.set(ty, fn),
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};
const pe = (type: string, x: number, y: number) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  timeStamp: 0,
  preventDefault: () => {},
});

const scene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 80)).scene; // right edge ~ (40,100)
  s = addElement(s, rect("b", 200, 80)).scene; // left edge ~ (200,100)
  const link: Link = {
    id: linkId("L"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    style: { stroke: "#000" },
    routing: "orthogonal",
    arrowheads: { to: "triangle" },
  };
  return addLink(s, link).scene;
};

describe("waypoint delete on a straight (anchored) link — real flow", () => {
  it("switch to straight, add a waypoint, drop it back on the line → removed", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: scene(),
    });
    editor.setViewportSize(800, 600);
    const down = (x: number, y: number) => handlers.get("pointerdown")!(pe("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pe("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pe("pointerup", x, y));
    const L = () => [...editor.scene.links.values()][0]!;

    down(120, 100);
    up(120, 100); // select the link
    expect(editor.selectedLink).not.toBeNull();
    editor.updateSelectedLink((e) => ({ ...e, routing: "straight" }));

    down(120, 100);
    move(120, 160);
    up(120, 160); // add a waypoint (drag segment midpoint)
    expect((L().waypoints ?? []).length).toBe(1);

    down(120, 160);
    move(120, 103);
    up(120, 103); // drop back on the chord (y≈100) → collapse
    expect((L().waypoints ?? []).length).toBe(0);
  });
});
