import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
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

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
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
  preventDefault: () => undefined,
});

// a.right = (40,20), b.left = (200,20). Link L anchored a.right → b.left.
// c is a free target shape at (500,500,40,40): centre (520,520), left = (500,520).
const scene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 0, 40, 40)).scene;
  s = addElement(s, rect("b", 200, 0, 40, 40)).scene;
  s = addElement(s, rect("c", 500, 500, 40, 40)).scene;
  // d is large so a point mid-edge is far (>snapThreshold) from any anchor dot.
  s = addElement(s, rect("d", 500, 800, 200, 80)).scene;
  const link: Link = {
    id: linkId("L"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    routing: "straight",
    style: { stroke: "#000" },
  };
  return addLink(s, link).scene;
};

const harness = () => {
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
  const linkTo = () => [...editor.scene.links.values()][0]!.to;
  // Select the link by clicking its body (empty space between the two rects).
  down(120, 20);
  up(120, 20);
  return { editor, down, move, up, linkTo };
};

describe("link endpoint rebind drag", () => {
  it("re-points the dragged end LIVE in the scene (whole link follows the cursor)", () => {
    const { editor, down, move, linkTo } = harness();
    expect(editor.selectedLink).not.toBeNull();
    down(200, 20); // grab the 'to' endpoint handle (b.left)
    move(400, 400); // drag to empty space
    // Before release, the scene endpoint is already a point at the cursor —
    // so getLinkPath (and thus the rendered line) follows it.
    expect(linkTo()).toEqual({ kind: "point", position: { x: 400, y: 400 } });
  });

  it("Escape mid-drag reverts the endpoint to its original binding", () => {
    const { editor, down, move, linkTo } = harness();
    down(200, 20);
    move(400, 400);
    expect(linkTo().kind).toBe("point"); // live re-point in flight
    editor.cancelInteraction(); // Escape
    expect(linkTo()).toEqual({
      kind: "anchor",
      elementId: elementId("b"),
      anchor: { kind: "named", name: "left" },
    });
  });

  it("commits as a single undo step (undo restores the original binding)", () => {
    const { editor, down, move, up, linkTo } = harness();
    down(200, 20);
    move(400, 400);
    up(400, 400);
    expect(linkTo()).toEqual({ kind: "point", position: { x: 400, y: 400 } });
    editor.undo();
    expect(linkTo()).toEqual({
      kind: "anchor",
      elementId: elementId("b"),
      anchor: { kind: "named", name: "left" },
    });
  });

  it("dropping on an element body attaches as floating", () => {
    const { down, move, up, linkTo } = harness();
    down(200, 20); // grab the 'to' endpoint
    move(520, 520); // onto c's body (centre, far from any anchor dot)
    up(520, 520);
    expect(linkTo()).toEqual({ kind: "floating", elementId: elementId("c") });
  });

  it("dropping on an element's anchor attaches as a fixed anchor", () => {
    const { down, move, up, linkTo } = harness();
    down(200, 20);
    move(500, 520); // c's left edge midpoint anchor
    up(500, 520);
    const to = linkTo();
    expect(to.kind).toBe("anchor");
    expect((to as { elementId: string }).elementId).toBe(elementId("c"));
  });

  it("dropping on an arbitrary edge point attaches to the outline (not the centre)", () => {
    const { down, move, up, linkTo } = harness();
    down(200, 20); // grab 'to'
    // d's top edge (y=800), x=560 — 40px from top-centre, 60px from a corner,
    // well beyond the 12px snap threshold, so it's an EDGE point, not a dot.
    move(560, 800);
    up(560, 800);
    const to = linkTo();
    expect(to.kind).toBe("outline");
    expect((to as { elementId: string }).elementId).toBe(elementId("d"));
    expect(typeof (to as { ratio: number }).ratio).toBe("number");
  });

  it("highlights the attach target during the drag (shared with draw-edge)", () => {
    const { editor, down, move, up } = harness();
    down(200, 20);
    // Over empty space → nothing highlighted.
    move(400, 400);
    expect(editor.linkAttachTarget).toBeNull();
    // Over c's body → highlight c as a float target.
    move(520, 520);
    expect(editor.linkAttachTarget).toEqual({ elementId: elementId("c"), mode: "element" });
    // Over c's anchor dot → highlight as a fixed (point) target.
    move(500, 520);
    expect(editor.linkAttachTarget).toEqual({ elementId: elementId("c"), mode: "point" });
    // Release clears the highlight.
    up(500, 520);
    expect(editor.linkAttachTarget).toBeNull();
  });
});
