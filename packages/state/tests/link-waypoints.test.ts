import { describe, expect, it } from "vitest";
import { linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// A straight horizontal link from (0,100) to (200,100) — single segment,
// midpoint (100,100).
const horizontalLink = (): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 100 } },
  to: { kind: "point", position: { x: 200, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
});

const sceneWith = (link: Link): Scene => addLink(emptyScene(), link).scene;

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

const setup = () => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host, mainTarget: noopTarget, overlayTarget: noopTarget,
    initialScene: sceneWith(horizontalLink()),
  });
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
  down(100, 100); up(100, 100); // select the link
  return { editor, down, move, up };
};

const waypointsOf = (editor: Editor) =>
  ([...editor.scene.links.values()][0]!.waypoints ?? []) as readonly { x: number; y: number }[];

describe("link waypoints (bend points)", () => {
  it("dragging a segment midpoint inserts a waypoint", () => {
    const { editor, down, move, up } = setup();
    expect(editor.selectedLink).not.toBeNull();
    down(100, 100); // grab the segment midpoint "add" handle
    move(100, 160); // drag down → insert + move
    up(100, 160);
    const wps = waypointsOf(editor);
    expect(wps.length).toBe(1);
    expect(wps[0]!.x).toBeCloseTo(100, 0);
    expect(wps[0]!.y).toBeCloseTo(160, 0);
  });

  it("dragging an existing waypoint moves it (one undo step)", () => {
    const { editor, down, move, up } = setup();
    down(100, 100); move(100, 160); up(100, 160); // add waypoint
    down(100, 160); move(140, 160); up(140, 160); // move it
    let wps = waypointsOf(editor);
    expect(wps.length).toBe(1);
    expect(wps[0]!.x).toBeCloseTo(140, 0);
    editor.undo(); // reverts the whole move in one step
    wps = waypointsOf(editor);
    expect(wps[0]!.x).toBeCloseTo(100, 0);
  });

  it("dropping a waypoint back onto the line removes it", () => {
    const { editor, down, move, up } = setup();
    down(100, 100); move(100, 160); up(100, 160); // add waypoint
    expect(waypointsOf(editor).length).toBe(1);
    down(100, 160); move(100, 104); up(100, 104); // drag onto the chord → collapse
    expect(waypointsOf(editor).length).toBe(0);
  });

  it("double-clicking a waypoint handle deletes it", () => {
    const { editor, down, move, up } = setup();
    down(100, 100); move(100, 160); up(100, 160); // add waypoint at (100,160)
    expect(waypointsOf(editor).length).toBe(1);
    // Two quick clicks on the waypoint handle → double-click → delete.
    down(100, 160); up(100, 160);
    down(100, 160); up(100, 160);
    expect(waypointsOf(editor).length).toBe(0);
  });
});
