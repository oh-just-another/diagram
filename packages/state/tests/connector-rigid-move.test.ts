import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  getLink,
  orderBetween,
  type Scene,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import {
  linkMovesRigidly,
  translateLinkGeometry,
} from "../src/editor/applies/link-move.js";

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

// Link floating-bound to both rects, carrying a straight waypoint.
const linkWith = (over: Partial<Link>): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "floating", elementId: elementId("a") },
  to: { kind: "floating", elementId: elementId("b") },
  routing: "straight",
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...over,
});

const sceneWith = (link: Link): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0)).scene;
  s = addElement(s, rect("b", 200)).scene;
  s = addLink(s, link).scene;
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

const pointer = (type: string, x: number, y: number, shift = false) => ({
  type, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: shift, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0, preventDefault: () => {},
});

describe("connector rigid move — pure helpers", () => {
  const moved = new Set([elementId("a"), elementId("b")]);

  it("linkMovesRigidly only when BOTH endpoints are bound to moved elements", () => {
    expect(linkMovesRigidly(linkWith({}), moved)).toBe(true);
    // one endpoint free (point) → not rigid
    expect(
      linkMovesRigidly(linkWith({ to: { kind: "point", position: { x: 1, y: 1 } } }), moved),
    ).toBe(false);
    // one endpoint bound to an element outside the moved set → not rigid
    expect(linkMovesRigidly(linkWith({}), new Set([elementId("a")]))).toBe(false);
  });

  it("translateLinkGeometry shifts waypoints by delta", () => {
    const out = translateLinkGeometry(linkWith({ waypoints: [{ x: 50, y: 60 }] }), { x: 10, y: 20 });
    expect(out?.waypoints).toEqual([{ x: 60, y: 80 }]);
  });

  it("translateLinkGeometry shifts fixedSegments per-axis (h: pos=Y/at=X, v: pos=X/at=Y)", () => {
    const h = translateLinkGeometry(
      linkWith({ fixedSegments: [{ axis: "h", pos: 100, at: 50 }] }),
      { x: 10, y: 20 },
    );
    expect(h?.fixedSegments).toEqual([{ axis: "h", pos: 120, at: 60 }]);
    const v = translateLinkGeometry(
      linkWith({ fixedSegments: [{ axis: "v", pos: 100, at: 50 }] }),
      { x: 10, y: 20 },
    );
    expect(v?.fixedSegments).toEqual([{ axis: "v", pos: 110, at: 70 }]);
  });

  it("translateLinkGeometry returns null for a pure auto-routed link (no movable geometry)", () => {
    expect(translateLinkGeometry(linkWith({}), { x: 10, y: 20 })).toBeNull();
  });
});

describe("connector rigid move — keyboard nudge", () => {
  const setup = (link: Link) => {
    const { host } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(link),
    });
    return editor;
  };

  it("nudging both connected elements translates the link's waypoints", () => {
    const editor = setup(linkWith({ waypoints: [{ x: 50, y: 60 }] }));
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.moveSelectionBy({ x: 10, y: 20 });
    expect(getLink(editor.scene, linkId("L"))?.waypoints).toEqual([{ x: 60, y: 80 }]);
  });

  it("nudging only ONE connected element leaves the link geometry untouched", () => {
    const editor = setup(linkWith({ waypoints: [{ x: 50, y: 60 }] }));
    editor.setSelection([elementId("a")]);
    editor.moveSelectionBy({ x: 10, y: 20 });
    expect(getLink(editor.scene, linkId("L"))?.waypoints).toEqual([{ x: 50, y: 60 }]);
  });
});

describe("connector rigid move — pointer drag (press-time snapshot)", () => {
  it("dragging both elements translates fixedSegments without compounding", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(
        linkWith({ routing: "orthogonal", fixedSegments: [{ axis: "h", pos: 100, at: 50 }] }),
      ),
    });
    // rect A occupies world (0,0)-(40,40); select both via clicks.
    const tap = (x: number, y: number, shift = false) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y, shift));
      handlers.get("pointerup")!(pointer("pointerup", x, y, shift));
    };
    tap(20, 20); // A
    tap(220, 20, true); // B (at x 200..240)
    expect(editor.selection.size).toBe(2);

    // Drag the selection body by (30, 40) in two moves — the cumulative
    // delta must not compound (snapshot is taken once at press).
    handlers.get("pointerdown")!(pointer("pointerdown", 20, 20));
    handlers.get("pointermove")!(pointer("pointermove", 35, 40));
    handlers.get("pointermove")!(pointer("pointermove", 50, 60));
    handlers.get("pointerup")!(pointer("pointerup", 50, 60));

    const seg = getLink(editor.scene, linkId("L"))?.fixedSegments?.[0];
    // delta = (30,40): h-seg pos(Y) += 40 → 140, at(X) += 30 → 80.
    expect(seg).toEqual({ axis: "h", pos: 140, at: 80 });
  });
});
