import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  getElementWorldBounds,
  linkLabelBounds,
  orderBetween,
  type Link,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { vec2 } from "@oh-just-another/math";
import { cursorForHandle, handlePosition, shapeSelectionFrame } from "../src/interaction/handle.js";

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

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
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
  size: { width: 400, height: 400 },
} as never;

const makeHost = () => {
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return host;
};

const makeEditor = (...els: Element[]): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(...els),
  });

const cursorOf = (e: Editor): string =>
  (e as unknown as { host: { style: { cursor: string } } }).host.style.cursor;

describe("cursorForHandle", () => {
  it("follows the frame rotation: at 45° a corner handle sits on an axis", () => {
    const q = Math.PI / 4;
    // nw rotated 45° clockwise (screen) points straight up → ns arrow.
    expect(cursorForHandle("nw", q)).toBe("ns-resize");
    // n rotated 45° points north-east → nesw arrow.
    expect(cursorForHandle("n", q)).toBe("nesw-resize");
    // A quarter turn swaps the axes.
    expect(cursorForHandle("e", Math.PI / 2)).toBe("ns-resize");
    expect(cursorForHandle("n", Math.PI / 2)).toBe("ew-resize");
    // Full turn is a no-op; negative angles work too.
    expect(cursorForHandle("ne", Math.PI * 2)).toBe("nesw-resize");
    expect(cursorForHandle("nw", -q)).toBe("ew-resize");
  });

  it("maps handles to the resize-axis arrow", () => {
    expect(cursorForHandle("nw")).toBe("nwse-resize");
    expect(cursorForHandle("se")).toBe("nwse-resize");
    expect(cursorForHandle("ne")).toBe("nesw-resize");
    expect(cursorForHandle("sw")).toBe("nesw-resize");
    expect(cursorForHandle("n")).toBe("ns-resize");
    expect(cursorForHandle("s")).toBe("ns-resize");
    expect(cursorForHandle("e")).toBe("ew-resize");
    expect(cursorForHandle("w")).toBe("ew-resize");
  });
});

describe("context cursor", () => {
  it("draw tools show crosshair / text", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setActiveTool("draw-rect");
    expect(cursorOf(e)).toBe("crosshair");
    e.setActiveTool("draw-text");
    expect(cursorOf(e)).toBe("text");
    e.setActiveTool("draw-edge");
    expect(cursorOf(e)).toBe("crosshair");
  });

  it("hand mode shows grab", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setActiveTool("hand");
    expect(cursorOf(e)).toBe("grab");
  });

  it("empty canvas hover is default", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.refreshCursor({ x: 1000, y: 1000 });
    expect(cursorOf(e)).toBe("default");
  });

  it("hovering a resize handle of the single selection shows the resize arrow", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setSelection([elementId("a")]);
    const bounds = getElementWorldBounds(e.scene.elements.get(elementId("a"))!);
    const se = handlePosition("se", bounds, e.scene.viewport.zoom);
    e.refreshCursor(se);
    expect(cursorOf(e)).toBe("nwse-resize");
  });

  it("hovering a link-start dot of the selected element shows crosshair", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setSelection([elementId("a")]);
    // The right-edge start dot sits just outside the right edge, mid-height.
    const b = getElementWorldBounds(e.scene.elements.get(elementId("a"))!);
    const rightDot = { x: b.x + b.width + 20, y: b.y + b.height / 2 };
    e.refreshCursor(rightDot);
    expect(cursorOf(e)).toBe("crosshair");
  });

  it("custom cursor override (DPR-aware image-set) wins for its role", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setCursorOverride("draw", {
      url: "a.png",
      url2x: "a@2x.png",
      hotspot: { x: 6, y: 6 },
      fallback: "crosshair",
    });
    e.setActiveTool("draw-rect"); // role "draw"
    expect(cursorOf(e)).toBe('image-set(url("a.png") 1x, url("a@2x.png") 2x) 6 6, crosshair');
    // Clearing restores the keyword.
    e.setCursorOverride("draw", null);
    expect(cursorOf(e)).toBe("crosshair");
  });

  it("override without @2x emits a plain url()", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setCursorOverride("draw", { url: "a.png", hotspot: { x: 2, y: 3 } });
    e.setActiveTool("draw-rect");
    expect(cursorOf(e)).toBe('url("a.png") 2 3, crosshair');
  });

  it("a rotated shape's handle shows the arrow for where the handle is on screen", () => {
    const e = makeEditor({ ...rect("a", 100, 100), rotation: Math.PI / 4 });
    e.setSelection([elementId("a")]);
    // Locate the "nw" handle exactly as the hit-test does: frame coordinates,
    // then rotated about the frame pivot.
    const frame = shapeSelectionFrame(e.scene.elements.get(elementId("a"))!);
    const inFrame = handlePosition("nw", frame.bounds, e.scene.viewport.zoom);
    e.refreshCursor(vec2.rotateAround(inFrame, frame.pivot, frame.rotation));
    expect(cursorOf(e)).toBe(cursorForHandle("nw", Math.PI / 4));
    expect(cursorOf(e)).toBe("ns-resize");
  });

  it("dragging a caption keeps the plain arrow (only panning grabs)", () => {
    const e = makeEditor(rect("a", 0, 0));
    const edge: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "point", position: { x: 100, y: 300 } },
      to: { kind: "point", position: { x: 300, y: 300 } },
      order: orderBetween(null, null),
      style: { stroke: "#000" },
      routing: "straight",
      label: { text: "hello" },
    };
    e.loadScene(addLink(e.scene, edge).scene);
    e.selectLink(linkId("L"));
    e.beginLabelDrag(linkId("L"));
    e.refreshCursor({ x: 200, y: 300 });
    expect(cursorOf(e)).toBe("default");
    e.endLabelDrag();
  });

  it("hovering the selected link's caption shows the I-beam", () => {
    const e = makeEditor(rect("a", 0, 0));
    const edge: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "point", position: { x: 100, y: 300 } },
      to: { kind: "point", position: { x: 300, y: 300 } },
      order: orderBetween(null, null),
      style: { stroke: "#000" },
      routing: "straight",
      label: { text: "hello" },
    };
    e.loadScene(addLink(e.scene, edge).scene);
    const pill = linkLabelBounds(e.scene, e.scene.links.get(linkId("L"))!)!;
    const centre = { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 };
    // Unselected: no caption affordance.
    e.refreshCursor(centre);
    expect(cursorOf(e)).toBe("default");
    e.selectLink(linkId("L"));
    e.refreshCursor(centre);
    expect(cursorOf(e)).toBe("text");
  });

  it("rubber-band selection shows a crosshair", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.lassoPreview = { x: 10, y: 10, width: 50, height: 50 };
    e.refreshCursor({ x: 30, y: 30 });
    expect(cursorOf(e)).toBe("crosshair");
    e.lassoPreview = null;
    e.refreshCursor({ x: 1000, y: 1000 });
    expect(cursorOf(e)).toBe("default");
  });

  it("a read-only board behaves like the hand tool", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setReadOnly(true);
    e.refreshCursor({ x: 1000, y: 1000 });
    expect(cursorOf(e)).toBe("grab");
    e.refreshCursor({ x: 20, y: 20 }); // over the shape too
    expect(cursorOf(e)).toBe("grab");
  });
});
