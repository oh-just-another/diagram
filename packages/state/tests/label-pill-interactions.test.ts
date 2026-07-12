/**
 * Regression: the caption pill sits at the path midpoint — exactly where the
 * "add waypoint" handle used to be. A press inside the pill must belong to the
 * caption (select / double-click-edit), while the bend handle slides out from
 * under the pill and keeps working from its new spot.
 */
import { describe, expect, it } from "vitest";
import { linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  getLinkWaypointMidpoints,
  linkLabelBounds,
  orderBetween,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const link = (label: string | null): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 100, y: 100 } },
  to: { kind: "point", position: { x: 500, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  routing: "straight",
  ...(label !== null ? { label: { text: label } } : {}),
});

const sceneWith = (l: Link): Scene => addLink(emptyScene(), l).scene;

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

const harness = (label: string | null) => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(link(label)),
  });
  editor.setViewportSize(800, 600);
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pe("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pe("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pe("pointerup", x, y));
  const click = (x: number, y: number) => {
    down(x, y);
    up(x, y);
  };
  return { editor, down, move, up, click };
};

// The pill centre of a straight 100→500 link: the label anchor (midpoint).
const PILL_CENTRE = { x: 300, y: 100 } as const;

describe("caption pill vs bend handles", () => {
  it("double-click on the pill opens the caption editor (link selected first)", () => {
    const { editor, click } = harness("hello");
    click(PILL_CENTRE.x, PILL_CENTRE.y);
    expect(editor.selectedLink).toBe(linkId("L"));
    click(PILL_CENTRE.x, PILL_CENTRE.y);
    expect(editor.editingLinkCaption).toBe(linkId("L"));
  });

  it("a press inside the pill does not add a waypoint", () => {
    const { editor, down, move, up } = harness("hello");
    // Select the link first, then drag from the pill centre.
    down(PILL_CENTRE.x, PILL_CENTRE.y);
    up(PILL_CENTRE.x, PILL_CENTRE.y);
    down(PILL_CENTRE.x, PILL_CENTRE.y);
    move(300, 200);
    up(300, 200);
    const edge = editor.scene.links.get(linkId("L"))!;
    expect(edge.waypoints ?? []).toHaveLength(0);
  });

  it("the add-waypoint handle slides out of the pill and still works", () => {
    const { editor, down, move, up } = harness("hello");
    down(PILL_CENTRE.x, PILL_CENTRE.y);
    up(PILL_CENTRE.x, PILL_CENTRE.y); // select the link
    const edge = editor.scene.links.get(linkId("L"))!;
    const pill = linkLabelBounds(editor.scene, edge)!;
    const mid = getLinkWaypointMidpoints(editor.scene, edge)![0]!;
    // The handle is on the line but outside the pill.
    expect(mid.y).toBe(100);
    expect(mid.x < pill.x || mid.x > pill.x + pill.width).toBe(true);
    // Grabbing it inserts a bend point.
    down(mid.x, mid.y);
    move(mid.x, 200);
    up(mid.x, 200);
    const after = editor.scene.links.get(linkId("L"))!;
    expect(after.waypoints).toHaveLength(1);
  });

  it("without a label the add handle stays at the exact midpoint (unchanged)", () => {
    const { editor, down, move, up } = harness(null);
    down(PILL_CENTRE.x, PILL_CENTRE.y);
    up(PILL_CENTRE.x, PILL_CENTRE.y); // select
    down(PILL_CENTRE.x, PILL_CENTRE.y); // midpoint handle press
    move(300, 220);
    up(300, 220);
    const after = editor.scene.links.get(linkId("L"))!;
    expect(after.waypoints).toHaveLength(1);
  });
});
