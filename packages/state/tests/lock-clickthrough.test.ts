/**
 * Locked-element interaction semantics: locked shapes are click-through
 * (the hit-test skips them and picks whatever lies beneath), the context
 * menu reaches them through the dedicated `lockedElementAt` lookup, and
 * `unlockElement` releases the closest flag-carrying ancestor.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (
  id: string,
  opts: { x?: number; y?: number; locked?: boolean; parentId?: string } = {},
): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: opts.x ?? 0, y: opts.y ?? 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
  ...(opts.locked ? { locked: true } : {}),
  ...(opts.parentId !== undefined ? { parentId: elementId(opts.parentId) } : {}),
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

describe("locked hit-test click-through", () => {
  it("hitTest skips a locked shape and picks the shape beneath it", () => {
    // b sits on top of a (same bounds, added later → higher order).
    const e = editorWith(sceneWith(rect("a"), rect("b", { locked: true })));
    const target = e.hitTest({ x: 25, y: 25 });
    expect(target).toMatchObject({ kind: "element", id: elementId("a") });
  });

  it("hitTest reports empty when the only shape under the point is locked", () => {
    const e = editorWith(sceneWith(rect("a", { locked: true })));
    expect(e.hitTest({ x: 25, y: 25 }).kind).toBe("empty");
  });

  it("group lock propagates: a child of a locked group is click-through too", () => {
    const group: Element = {
      id: elementId("g"),
      layerId: DEFAULT_LAYER_ID,
      type: "group",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      locked: true,
    };
    const e = editorWith(sceneWith(group, rect("child", { parentId: "g" })));
    expect(e.hitTest({ x: 25, y: 25 }).kind).toBe("empty");
  });
});

describe("lasso vs locked", () => {
  it("marquee selection skips locked shapes", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b", { locked: true })));
    (
      e as unknown as {
        applySelectByBounds(
          b: { x: number; y: number; width: number; height: number },
          m: string,
        ): void;
      }
    ).applySelectByBounds({ x: -10, y: -10, width: 200, height: 200 }, "replace");
    expect([...e.selection]).toEqual([elementId("a")]);
  });
});

describe("lockedElementAt / unlockElement", () => {
  it("finds the topmost locked shape that normal hit-testing skips", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b", { locked: true })));
    expect(e.lockedElementAt({ x: 25, y: 25 })?.id).toBe(elementId("b"));
    // Outside every shape → null.
    expect(e.lockedElementAt({ x: 500, y: 500 })).toBeNull();
    // No locked shape at the point (only unlocked "a") → null.
    e.unlockElement(elementId("b"));
    expect(e.lockedElementAt({ x: 25, y: 25 })).toBeNull();
  });

  it("unlockElement clears the flag, selects the shape and is undoable", () => {
    const e = editorWith(sceneWith(rect("a", { locked: true })));
    e.unlockElement(elementId("a"));
    expect(e.scene.elements.get(elementId("a"))?.locked).not.toBe(true);
    expect([...e.selection]).toEqual([elementId("a")]);
    e.undo();
    expect(e.scene.elements.get(elementId("a"))?.locked).toBe(true);
  });

  it("unlockElement on a locked group's child releases the ancestor carrying the flag", () => {
    const group: Element = {
      id: elementId("g"),
      layerId: DEFAULT_LAYER_ID,
      type: "group",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      locked: true,
    };
    const e = editorWith(sceneWith(group, rect("child", { parentId: "g" })));
    e.unlockElement(elementId("child"));
    expect(e.scene.elements.get(elementId("g"))?.locked).not.toBe(true);
    expect([...e.selection]).toEqual([elementId("g")]);
  });

  it("unlockElement is a no-op on unlocked shapes and in read-only mode", () => {
    const e = editorWith(sceneWith(rect("a"), rect("b", { locked: true })));
    e.unlockElement(elementId("a")); // not locked → no-op
    expect(e.selection.size).toBe(0);
    e.setReadOnly(true);
    e.unlockElement(elementId("b"));
    expect(e.scene.elements.get(elementId("b"))?.locked).toBe(true);
  });
});
