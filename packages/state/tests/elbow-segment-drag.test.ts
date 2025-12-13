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
  s = addElement(s, rect("b", 320, 200)).scene;
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

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => true,
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

const orthogonal = (path: readonly { x: number; y: number }[]) => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (!(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6)) return false;
  }
  return true;
};

describe("elbow segment drag", () => {
  it("dragging an interior segment moves it perpendicular and pins it", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene(),
    });
    editor.forceRender(); // fill routedPoints

    const path = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    expect(path.length).toBeGreaterThanOrEqual(4); // has at least one interior segment

    // First interior segment (k = 1).
    const k = 1;
    const a = path[k]!;
    const b = path[k + 1]!;
    const axis: "h" | "v" = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));

    down(mid.x, mid.y); up(mid.x, mid.y); // select the link
    expect(editor.selectedLink).toBe(linkId("L"));

    // Drag the interior segment perpendicular by +40.
    const target = axis === "h" ? { x: mid.x, y: mid.y + 40 } : { x: mid.x + 40, y: mid.y };
    down(mid.x, mid.y);
    move(target.x, target.y);
    up(target.x, target.y);
    editor.forceRender(); // reroute honoring the pin

    const link = [...editor.scene.links.values()][0]!;
    expect(link.fixedSegments && link.fixedSegments.length).toBeGreaterThan(0);

    const newPath = getLinkPath(editor.scene, link)!;
    expect(orthogonal(newPath)).toBe(true);
    // A segment now sits at the dragged perpendicular coordinate.
    const wanted = axis === "h" ? mid.y + 40 : mid.x + 40;
    const found =
      axis === "h"
        ? newPath.some((p, i) => i > 0 && Math.abs(p.y - wanted) < 1 && Math.abs(newPath[i - 1]!.y - wanted) < 1)
        : newPath.some((p, i) => i > 0 && Math.abs(p.x - wanted) < 1 && Math.abs(newPath[i - 1]!.x - wanted) < 1);
    expect(found).toBe(true);
  });

  it("a pinned segment survives a shape move (matched by axis + position)", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene(),
    });
    editor.forceRender();
    const path = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    const k = 1;
    const a = path[k]!;
    const b = path[k + 1]!;
    const axis: "h" | "v" = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
    down(mid.x, mid.y); up(mid.x, mid.y);
    const target = axis === "h" ? { x: mid.x, y: mid.y + 40 } : { x: mid.x + 40, y: mid.y };
    down(mid.x, mid.y); move(target.x, target.y); up(target.x, target.y);
    editor.forceRender();
    const wanted = axis === "h" ? mid.y + 40 : mid.x + 40;

    // Move shape "a" a little; the pinned segment must stay at `wanted`.
    editor.setSelection([elementId("a")]);
    editor.moveSelectionBy({ x: 0, y: -30 });
    editor.forceRender();

    const link = [...editor.scene.links.values()][0]!;
    expect(link.fixedSegments && link.fixedSegments.length).toBeGreaterThan(0);
    const p2 = getLinkPath(editor.scene, link)!;
    const stillPinned =
      axis === "h"
        ? p2.some((p, i) => i > 0 && Math.abs(p.y - wanted) < 1 && Math.abs(p2[i - 1]!.y - wanted) < 1)
        : p2.some((p, i) => i > 0 && Math.abs(p.x - wanted) < 1 && Math.abs(p2[i - 1]!.x - wanted) < 1);
    expect(stillPinned).toBe(true);
    expect(orthogonal(p2)).toBe(true);
  });

  it("dragging a straight elbow bends it (terminal insert)", () => {
    // Aligned shapes → the elbow collapses to a single straight segment.
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene;
    s = addElement(s, rect("b", 300, 0)).scene; // same y → straight line
    const e: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      routing: "orthogonal",
      order: orderBetween(null, null),
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;

    const { host, handlers } = makeHost();
    const editor = new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: s });
    editor.forceRender();
    const path = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    expect(path.length).toBe(2); // straight: [from, to]
    const a = path[0]!;
    const b = path[1]!;
    expect(Math.abs(a.y - b.y) < 1e-6).toBe(true); // horizontal
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
    down(mid.x, mid.y); up(mid.x, mid.y); // select
    down(mid.x, mid.y); move(mid.x, mid.y + 60); up(mid.x, mid.y + 60); // bend down
    editor.forceRender();

    const p2 = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    expect(orthogonal(p2)).toBe(true);
    expect(p2.length).toBeGreaterThan(2); // it bent
    // A horizontal segment now sits at the dragged y.
    const wanted = mid.y + 60;
    const bent = p2.some(
      (p, i) => i > 0 && Math.abs(p.y - wanted) < 1 && Math.abs(p2[i - 1]!.y - wanted) < 1,
    );
    expect(bent).toBe(true);
  });

  it("double-clicking a pinned segment handle drops the pin (back to auto route)", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: buildScene(),
    });
    editor.forceRender();

    const path = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    const k = 1; // first interior segment
    const a = path[k]!;
    const b = path[k + 1]!;
    const axis: "h" | "v" = Math.abs(a.y - b.y) < 1e-6 ? "h" : "v";
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));

    down(mid.x, mid.y); up(mid.x, mid.y); // select
    // Pin the interior segment by dragging it +40 perpendicular.
    const tgt = axis === "h" ? { x: mid.x, y: mid.y + 40 } : { x: mid.x + 40, y: mid.y };
    down(mid.x, mid.y); move(tgt.x, tgt.y); up(tgt.x, tgt.y);
    editor.forceRender();
    expect([...editor.scene.links.values()][0]!.fixedSegments!.length).toBeGreaterThan(0);

    // The pinned segment now sits at the dragged coord — find its handle.
    const pinned = getLinkPath(editor.scene, [...editor.scene.links.values()][0]!)!;
    const wanted = axis === "h" ? mid.y + 40 : mid.x + 40;
    let hx = 0;
    let hy = 0;
    for (let i = 1; i < pinned.length; i++) {
      const p = pinned[i - 1]!;
      const q = pinned[i]!;
      const perp = axis === "h" ? p.y : p.x;
      const perp2 = axis === "h" ? q.y : q.x;
      if (Math.abs(perp - wanted) < 1 && Math.abs(perp2 - wanted) < 1) {
        hx = (p.x + q.x) / 2;
        hy = (p.y + q.y) / 2;
        break;
      }
    }

    // Double-click that handle → pin removed.
    down(hx, hy); up(hx, hy);
    down(hx, hy); up(hx, hy);
    editor.forceRender();
    const fixed = [...editor.scene.links.values()][0]!.fixedSegments ?? [];
    expect(fixed.length).toBe(0);
  });
});
