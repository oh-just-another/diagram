import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  getElement,
  isText,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Patch,
  type Scene,
  type TextElement,
} from "@oh-just-another/scene";
import { TextEditController, type TextEditHost } from "../src/editor/text-edit.js";

const textElement = (id: string, text = "hello"): TextElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text,
  fontFamily: "Arial",
  fontSize: 14,
});

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

interface Harness {
  host: TextEditHost;
  c: TextEditController;
  patches: Patch[];
  notify: ReturnType<typeof vi.fn>;
  clearSelectionFor: ReturnType<typeof vi.fn>;
}

const makeHarness = (scene: Scene, locked = false): Harness => {
  const patches: Patch[] = [];
  const notify = vi.fn();
  const clearSelectionFor = vi.fn();
  const host: TextEditHost = {
    scene,
    pushHistory: (p) => patches.push(p),
    notify,
    isLayerLocked: () => locked,
    clearSelectionFor,
    // Fixed-advance measure (7 px per char) so caret geometry is predictable.
    mainTarget: {
      setFont: () => {},
      measureText: (s: string) => ({ width: s.length * 7 }),
    },
  };
  return { host, c: new TextEditController(host), patches, notify, clearSelectionFor };
};

const A = elementId("a");

describe("TextEditController", () => {
  it("begin() sets the edited shape with a collapsed caret at the end", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    expect(h.c.editingElement).toBe(A);
    expect(h.c.selection).toEqual({ start: 5, end: 5, dir: "forward" });
    expect(h.c.caret).toBe(5);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("begin() is a no-op on a non-text shape", () => {
    const h = makeHarness(sceneWith(rect("a")));
    h.c.begin(A);
    expect(h.c.editingElement).toBeNull();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("begin() is a no-op on a locked layer", () => {
    const h = makeHarness(sceneWith(textElement("a")), true);
    h.c.begin(A);
    expect(h.c.editingElement).toBeNull();
  });

  it("setText() mutates the scene live WITHOUT a history entry", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setText("hey", 3, 3);
    const shape = getElement(h.host.scene, A);
    expect(shape !== undefined && isText(shape) && shape.text).toBe("hey");
    expect(h.patches).toHaveLength(0);
    expect(h.c.selection).toEqual({ start: 3, end: 3, dir: "forward" });
  });

  it("caret is the moving end of a backward selection", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setSelection(1, 4, "backward");
    expect(h.c.caret).toBe(1);
    h.c.setSelection(1, 4, "forward");
    expect(h.c.caret).toBe(4);
  });

  it("commit() of an edited text records ONLY the text delta as one patch", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setText("world", 5, 5);
    h.c.commit();
    expect(h.c.editingElement).toBeNull();
    expect(h.patches).toHaveLength(1);
    const p = h.patches[0];
    expect(p?.kind).toBe("element");
    if (p?.kind === "element") {
      expect(p.before !== null && isText(p.before) && p.before.text).toBe("hello");
      expect(p.after !== null && isText(p.after) && p.after.text).toBe("world");
    }
  });

  it("commit() with unchanged text records nothing", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.commit();
    expect(h.patches).toHaveLength(0);
  });

  it("commit(next) applies the explicit text before committing", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.commit("typed");
    const shape = getElement(h.host.scene, A);
    expect(shape !== undefined && isText(shape) && shape.text).toBe("typed");
    expect(h.patches).toHaveLength(1);
  });

  it("commit() of whitespace-only text removes the shape and records the removal", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setText("   ", 3, 3);
    h.c.commit();
    expect(getElement(h.host.scene, A)).toBeUndefined();
    expect(h.patches).toHaveLength(1);
    const p = h.patches[0];
    if (p?.kind === "element") {
      expect(p.before !== null && isText(p.before) && p.before.text).toBe("hello");
      expect(p.after).toBeNull();
    }
    expect(h.clearSelectionFor).toHaveBeenCalledWith(A);
  });

  it("pending creation: non-empty commit records a single add patch", () => {
    const h = makeHarness(sceneWith(textElement("a", "")));
    h.c.markPendingCreate(A);
    h.c.begin(A);
    h.c.setText("new", 3, 3);
    h.c.commit();
    expect(h.patches).toHaveLength(1);
    const p = h.patches[0];
    if (p?.kind === "element") {
      expect(p.before).toBeNull();
      expect(p.after !== null && isText(p.after) && p.after.text).toBe("new");
    }
  });

  it("pending creation: empty commit removes the shape silently (no history)", () => {
    const h = makeHarness(sceneWith(textElement("a", "")));
    h.c.markPendingCreate(A);
    h.c.begin(A);
    h.c.commit();
    expect(getElement(h.host.scene, A)).toBeUndefined();
    expect(h.patches).toHaveLength(0);
    expect(h.clearSelectionFor).toHaveBeenCalledWith(A);
  });

  it("cancel() reverts the text to the origin with no history entry", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setText("scrap", 5, 5);
    h.c.cancel();
    const shape = getElement(h.host.scene, A);
    expect(shape !== undefined && isText(shape) && shape.text).toBe("hello");
    expect(h.patches).toHaveLength(0);
    expect(h.c.editingElement).toBeNull();
  });

  it("cancel() of a pending creation removes the shape entirely", () => {
    const h = makeHarness(sceneWith(textElement("a", "")));
    h.c.markPendingCreate(A);
    h.c.begin(A);
    h.c.setText("scrap", 5, 5);
    h.c.cancel();
    expect(getElement(h.host.scene, A)).toBeUndefined();
    expect(h.patches).toHaveLength(0);
  });

  it("begin() on another shape commits the in-flight edit first", () => {
    const h = makeHarness(sceneWith(textElement("a", "one"), textElement("b", "two")));
    h.c.begin(A);
    h.c.setText("changed", 7, 7);
    h.c.begin(elementId("b"));
    expect(h.patches).toHaveLength(1); // the "a" edit was committed
    expect(h.c.editingElement).toBe(elementId("b"));
  });

  it("caretIndexAtWorldPoint() maps points beyond the ends to 0 / length", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    expect(h.c.caretIndexAtWorldPoint({ x: 10_000, y: 7 })).toBe(5);
    expect(h.c.caretIndexAtWorldPoint({ x: -10_000, y: 7 })).toBe(0);
  });

  it("caretIndexAtWorldPoint() is null when not editing", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    expect(h.c.caretIndexAtWorldPoint({ x: 0, y: 0 })).toBeNull();
  });

  it("drag-select: setCaretFromPoint anchors, extendSelectionToPoint grows, endDragSelect clears", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    h.c.begin(A);
    h.c.setCaretFromPoint({ x: 10_000, y: 7 }); // caret at end (5)
    expect(h.c.isDragging).toBe(true);
    expect(h.c.selection).toEqual({ start: 5, end: 5, dir: "forward" });
    h.c.extendSelectionToPoint({ x: -10_000, y: 7 }); // back to 0
    expect(h.c.selection).toEqual({ start: 0, end: 5, dir: "backward" });
    h.c.endDragSelect();
    expect(h.c.isDragging).toBe(false);
  });

  it("overlay() returns caret + selection geometry while editing, null otherwise", () => {
    const h = makeHarness(sceneWith(textElement("a", "hello")));
    expect(h.c.overlay()).toBeNull();
    h.c.begin(A);
    h.c.setSelection(0, 5, "forward");
    const ov = h.c.overlay();
    expect(ov).not.toBeNull();
    expect(ov?.caret).not.toBeNull(); // blink starts solid
    expect(ov?.selectionRects.length).toBeGreaterThan(0);
    // 5 chars × 7 px fixed advance
    expect(ov?.selectionRects[0]?.width).toBe(35);
  });
});
