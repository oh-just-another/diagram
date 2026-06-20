/**
 * Tests for the HistoryProvider interface and the History class that
 * implements it. HistoryProvider is a pure TypeScript interface (no runtime
 * code), so these tests verify structural compliance with the contract.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, orderBetween, type Element, type Patch } from "@oh-just-another/scene";
import type { HistoryProvider } from "../src/provider.js";
import { History } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const addPatch = (id: string): Patch => {
  const el = rect(id);
  return { kind: "element", id: el.id, before: null, after: el };
};

// ---------------------------------------------------------------------------
// Type-level check: History satisfies HistoryProvider
// ---------------------------------------------------------------------------

describe("HistoryProvider interface — structural compliance of History", () => {
  it("History instance is assignable to HistoryProvider", () => {
    const h: HistoryProvider = new History();
    expect(h).toBeDefined();
  });

  it("exposes canUndo as boolean", () => {
    const h: HistoryProvider = new History();
    expect(typeof h.canUndo).toBe("boolean");
  });

  it("exposes canRedo as boolean", () => {
    const h: HistoryProvider = new History();
    expect(typeof h.canRedo).toBe("boolean");
  });

  it("exposes size as number", () => {
    const h: HistoryProvider = new History();
    expect(typeof h.size).toBe("number");
  });

  it("exposes push(), undo(), redo(), clear() as functions", () => {
    const h: HistoryProvider = new History();
    expect(typeof h.push).toBe("function");
    expect(typeof h.undo).toBe("function");
    expect(typeof h.redo).toBe("function");
    expect(typeof h.clear).toBe("function");
  });

  it("exposes transaction() as a function", () => {
    const h: HistoryProvider = new History();
    expect(typeof h.transaction).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Optional stack inspection fields (undoStack / redoStack)
// ---------------------------------------------------------------------------

describe("HistoryProvider — optional undoStack / redoStack", () => {
  it("History exposes undoStack as a readonly array", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    expect(Array.isArray(h.undoStack)).toBe(true);
    expect(h.undoStack).toHaveLength(1);
  });

  it("History exposes redoStack as a readonly array", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.undo();
    expect(Array.isArray(h.redoStack)).toBe(true);
    expect(h.redoStack).toHaveLength(1);
  });

  it("undoStack is empty initially", () => {
    const h: HistoryProvider = new History();
    expect(h.undoStack).toHaveLength(0);
  });

  it("redoStack is empty initially", () => {
    const h: HistoryProvider = new History();
    expect(h.redoStack).toHaveLength(0);
  });

  it("undoStack grows with each push", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.push(addPatch("b"));
    expect(h.undoStack).toHaveLength(2);
  });

  it("redoStack shrinks when redo is called", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.push(addPatch("b"));
    h.undo();
    h.undo();
    expect(h.redoStack).toHaveLength(2);
    h.redo();
    expect(h.redoStack).toHaveLength(1);
  });

  it("undoStack and redoStack are empty after clear()", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.undo();
    h.clear();
    expect(h.undoStack).toHaveLength(0);
    expect(h.redoStack).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HistoryProvider contract behaviour
// ---------------------------------------------------------------------------

describe("HistoryProvider — contract behaviour via History", () => {
  it("push increases size and enables canUndo", () => {
    const h: HistoryProvider = new History();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
    h.push(addPatch("a"));
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
  });

  it("undo returns non-null when history is non-empty and moves patch to redo", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    const inv = h.undo();
    expect(inv).not.toBeNull();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it("undo returns null on empty history", () => {
    const h: HistoryProvider = new History();
    expect(h.undo()).toBeNull();
  });

  it("redo returns non-null after undo", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.undo();
    expect(h.redo()).not.toBeNull();
    expect(h.canRedo).toBe(false);
  });

  it("redo returns null with nothing to redo", () => {
    const h: HistoryProvider = new History();
    expect(h.redo()).toBeNull();
  });

  it("clear resets canUndo and canRedo", () => {
    const h: HistoryProvider = new History();
    h.push(addPatch("a"));
    h.undo();
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.size).toBe(0);
  });

  it("transaction().commit() pushes a single logical entry", () => {
    const h: HistoryProvider = new History();
    const tx = h.transaction();
    tx.add(addPatch("a"));
    tx.add(addPatch("b"));
    tx.commit();
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
  });

  it("transaction().cancel() leaves history unchanged", () => {
    const h: HistoryProvider = new History();
    const tx = h.transaction();
    tx.add(addPatch("a"));
    tx.cancel();
    expect(h.size).toBe(0);
    expect(h.canUndo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Simulated alternative implementation (mock)
// ---------------------------------------------------------------------------

describe("HistoryProvider — custom implementation satisfies interface", () => {
  /**
   * A minimal in-memory implementation to confirm the interface is
   * implementation-agnostic and doesn't require the History class.
   */
  class SimpleHistory implements HistoryProvider {
    private _undo: Patch[] = [];
    private _redo: Patch[] = [];

    get canUndo() {
      return this._undo.length > 0;
    }
    get canRedo() {
      return this._redo.length > 0;
    }
    get size() {
      return this._undo.length;
    }

    push(patch: Patch): void {
      this._undo.push(patch);
      this._redo = [];
    }

    undo(): Patch | null {
      const p = this._undo.pop();
      if (!p) return null;
      this._redo.push(p);
      return p; // intentionally NOT inverting — mock only
    }

    redo(): Patch | null {
      const p = this._redo.pop();
      if (!p) return null;
      this._undo.push(p);
      return p;
    }

    clear(): void {
      this._undo = [];
      this._redo = [];
    }

    transaction() {
      const patches: Patch[] = [];
      return {
        add: (p: Patch) => patches.push(p),
        commit: () => {
          if (patches.length > 0) {
            this._undo.push({ kind: "batch", patches });
            this._redo = [];
          }
        },
        cancel: () => {
          /* discard */
        },
        isOpen: () => true,
      };
    }

    // Optional fields deliberately omitted — interface allows undefined
  }

  it("SimpleHistory satisfies HistoryProvider", () => {
    const h: HistoryProvider = new SimpleHistory();
    h.push(addPatch("a"));
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.redo();
    h.clear();
    expect(h.size).toBe(0);
  });

  it("SimpleHistory.undoStack is undefined (optional field)", () => {
    const h: HistoryProvider = new SimpleHistory();
    expect(h.undoStack).toBeUndefined();
  });

  it("SimpleHistory.redoStack is undefined (optional field)", () => {
    const h: HistoryProvider = new SimpleHistory();
    expect(h.redoStack).toBeUndefined();
  });

  it("SimpleHistory transaction commits a batch", () => {
    const h = new SimpleHistory();
    const tx = h.transaction();
    tx.add(addPatch("a"));
    tx.add(addPatch("b"));
    tx.commit();
    expect(h.size).toBe(1);
    expect(h.canUndo).toBe(true);
  });
});
