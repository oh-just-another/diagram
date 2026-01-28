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

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

const noopTarget = {
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  clear: () => {},
  setFill: () => {},
  setStroke: () => {},
  setStrokeWidth: () => {},
  setOpacity: () => {},
  setLineCap: () => {},
  setLineJoin: () => {},
  setDashArray: () => {},
  setFont: () => {},
  setTextAlign: () => {},
  setTextBaseline: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  resetTransform: () => {},
  size: { width: 800, height: 600 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number) => ({
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

// Minimal rectangle factory matching the TemplateContext shape.
const rectFactory = (ctx: {
  id: ReturnType<typeof elementId>;
  layerId: typeof DEFAULT_LAYER_ID;
  position: { x: number; y: number };
  order: ReturnType<typeof orderBetween>;
}): Element => ({
  id: ctx.id,
  layerId: ctx.layerId,
  type: "rectangle",
  position: ctx.position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: ctx.order,
  style: { fill: "#fff" },
  width: 120,
  height: 80,
});

const dropOnEmpty = (editor: Editor, handlers: Map<string, (ev: unknown) => void>) => {
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
  down(20, 20);
  up(20, 20); // select A
  down(60, 20); // press A's right dot (edge 40 + LINK_START_ANCHOR_OUTSET 20)
  move(400, 400); // drag to empty canvas
  up(400, 400);
};

describe("link dropped on empty canvas → shape-picker", () => {
  it("opens a pending shape menu at the drop point with a free-ended link", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0, 40, 40)),
    });
    dropOnEmpty(editor, handlers);

    const menu = editor.linkDropMenu;
    expect(menu).not.toBeNull();
    expect(menu!.side).toBe("to");
    expect(menu!.world.x).toBeCloseTo(400, 0);
    const link = [...editor.scene.links.values()][0]!;
    expect(link.to.kind).toBe("point"); // free end until a shape is picked
  });

  it("picking a shape creates it and re-points the link to float against it", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0, 40, 40)),
    });
    dropOnEmpty(editor, handlers);
    const elsBefore = editor.scene.elements.size;

    editor.placeShapeAtLinkDrop(rectFactory);

    expect(editor.scene.elements.size).toBe(elsBefore + 1);
    expect(editor.linkDropMenu).toBeNull();
    const link = [...editor.scene.links.values()][0]!;
    expect(link.to.kind).toBe("floating");
    const newId = (link.to as { elementId: string }).elementId;
    expect([...editor.selection]).toEqual([newId]); // new shape selected
    // one undo step reverts both the element and the re-point
    editor.undo();
    const after = [...editor.scene.links.values()][0]!;
    expect(after.to.kind).toBe("point");
    expect(editor.scene.elements.size).toBe(elsBefore);
  });

  it("dismissing leaves the free-ended link on the canvas", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0, 40, 40)),
    });
    dropOnEmpty(editor, handlers);
    editor.dismissLinkDropMenu();
    expect(editor.linkDropMenu).toBeNull();
    const link = [...editor.scene.links.values()][0]!;
    expect(link.to.kind).toBe("point");
  });
});
