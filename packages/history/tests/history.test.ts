import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Element,
} from "@oh-just-another/scene";
import { History } from "../src/index";

const rect = (id: string, x = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

const addShapePatch = (s: Element): Patch => ({ kind: "shape", id: s.id, before: null, after: s });

describe("History — basic stack", () => {
  it("push adds to undo stack", () => {
    const h = new History();
    h.push(addShapePatch(rect("a")));
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo pops the latest patch and returns its inverse", () => {
    const h = new History();
    const a = rect("a");
    h.push(addShapePatch(a));
    const inverse = h.undo();
    expect(inverse).toEqual({ kind: "shape", id: a.id, before: a, after: null });
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it("redo returns the original patch", () => {
    const h = new History();
    const a = rect("a");
    const p = addShapePatch(a);
    h.push(p);
    h.undo();
    const replayed = h.redo();
    expect(replayed).toEqual(p);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo→redo→undo applied to scene returns to the original", () => {
    const h = new History();
    const a = rect("a");
    const p = addShapePatch(a);
    let scene = apply(emptyScene(), p);
    h.push(p);
    scene = apply(scene, h.undo()!);
    expect(scene.shapes.size).toBe(0);
    scene = apply(scene, h.redo()!);
    expect(scene.shapes.size).toBe(1);
    scene = apply(scene, h.undo()!);
    expect(scene.shapes.size).toBe(0);
  });

  it("new push clears the redo stack", () => {
    const h = new History();
    h.push(addShapePatch(rect("a")));
    h.push(addShapePatch(rect("b")));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(addShapePatch(rect("c")));
    expect(h.canRedo).toBe(false);
  });

  it("noop patches are skipped on push", () => {
    const h = new History();
    const a = rect("a");
    h.push({ kind: "shape", id: a.id, before: a, after: a });
    expect(h.size).toBe(0);
  });

  it("undo / redo on empty history return null", () => {
    const h = new History();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("limit drops oldest entries", () => {
    const h = new History({ limit: 2 });
    h.push(addShapePatch(rect("a")));
    h.push(addShapePatch(rect("b")));
    h.push(addShapePatch(rect("c")));
    expect(h.size).toBe(2);
    // The oldest 'a' should be gone; undoing twice leaves us at 'a' state.
    expect(h.undo()).not.toBeNull();
    expect(h.undo()).not.toBeNull();
    expect(h.undo()).toBeNull();
  });

  it("clear empties both stacks", () => {
    const h = new History();
    h.push(addShapePatch(rect("a")));
    h.undo();
    h.clear();
    expect(h.size).toBe(0);
    expect(h.redoSize).toBe(0);
  });
});

describe("History — transactions", () => {
  it("commit with one patch pushes a single record", () => {
    const h = new History();
    const tx = h.transaction();
    tx.add(addShapePatch(rect("a")));
    tx.commit();
    expect(h.size).toBe(1);
  });

  it("commit with multiple patches collapses by entity", () => {
    const h = new History();
    const tx = h.transaction();
    const a0 = rect("a", 0);
    const a1 = rect("a", 10);
    const a2 = rect("a", 20);
    tx.add({ kind: "shape", id: a0.id, before: a0, after: a1 });
    tx.add({ kind: "shape", id: a0.id, before: a1, after: a2 });
    tx.commit();
    // After merge: a single shape patch with before=a0, after=a2.
    expect(h.size).toBe(1);
    const inverse = h.undo();
    expect(inverse).toEqual({ kind: "shape", id: a0.id, before: a2, after: a0 });
  });

  it("commit with patches across entities pushes a batch", () => {
    const h = new History();
    const tx = h.transaction();
    tx.add(addShapePatch(rect("a")));
    tx.add(addShapePatch(rect("b")));
    tx.commit();
    expect(h.size).toBe(1);
    const inverse = h.undo();
    expect(inverse?.kind).toBe("batch");
  });

  it("cancel discards everything without pushing", () => {
    const h = new History();
    const tx = h.transaction();
    tx.add(addShapePatch(rect("a")));
    tx.cancel();
    expect(h.size).toBe(0);
  });

  it("empty commit is a no-op", () => {
    const h = new History();
    h.transaction().commit();
    expect(h.size).toBe(0);
  });

  it("opening a transaction while another is open throws", () => {
    const h = new History();
    h.transaction();
    expect(() => h.transaction()).toThrow(/already open/);
  });

  it("add after commit throws", () => {
    const h = new History();
    const tx = h.transaction();
    tx.commit();
    expect(() => tx.add(addShapePatch(rect("a")))).toThrow();
  });

  it("hasOpenTransaction reflects the state", () => {
    const h = new History();
    expect(h.hasOpenTransaction()).toBe(false);
    const tx = h.transaction();
    expect(h.hasOpenTransaction()).toBe(true);
    tx.commit();
    expect(h.hasOpenTransaction()).toBe(false);
  });

  it("record routes through open transaction or pushes directly", () => {
    const h = new History();
    const tx = h.transaction();
    h.record(addShapePatch(rect("a")), { transaction: tx });
    tx.commit();
    expect(h.size).toBe(1);
    h.record(addShapePatch(rect("b")));
    expect(h.size).toBe(2);
  });
});

describe("History — mergeTransactions: false", () => {
  it("keeps every patch when merge is disabled", () => {
    const h = new History({ mergeTransactions: false });
    const tx = h.transaction();
    const a0 = rect("a", 0);
    const a1 = rect("a", 10);
    tx.add({ kind: "shape", id: a0.id, before: a0, after: a1 });
    tx.add({ kind: "shape", id: a0.id, before: a1, after: rect("a", 20) });
    tx.commit();
    const inverse = h.undo();
    expect(inverse?.kind).toBe("batch");
    if (inverse?.kind === "batch") {
      expect(inverse.patches).toHaveLength(2);
    }
  });
});

describe("layerId import — workaround for vitest tree-shaking", () => {
  it("uses layerId so the helper is not dropped", () => {
    expect(typeof layerId).toBe("function");
  });
});
