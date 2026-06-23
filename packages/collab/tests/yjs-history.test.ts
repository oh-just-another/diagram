import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { SceneDoc } from "../src/scene-doc";
import { CollabHistory } from "../src/yjs-history";

const rect = (id: string, x = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const seed = (): Scene => {
  let s = emptyScene();
  ({ scene: s } = addElement(s, rect("a")));
  return s;
};

describe("CollabHistory", () => {
  it("canUndo/canRedo reflect Y.UndoManager state", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);

    h.push({ kind: "element", id: elementId("b"), before: null, after: rect("b") });
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo returns a patch that reverses the last push", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);

    const addB: Patch = { kind: "element", id: elementId("b"), before: null, after: rect("b") };
    h.push(addB);
    expect(sceneDoc.elements.has("b")).toBe(true);

    const inverse = h.undo();
    expect(inverse).not.toBeNull();
    // Applying the inverse to the post-push scene must yield a
    // scene without "b".
    const after = apply(sceneDoc.snapshot(), inverse!);
    expect(after.elements.has(elementId("b"))).toBe(false);
  });

  it("redo replays the previously-undone change", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);
    h.push({ kind: "element", id: elementId("b"), before: null, after: rect("b") });
    h.undo();
    expect(sceneDoc.elements.has("b")).toBe(false);
    const replay = h.redo();
    expect(replay).not.toBeNull();
    expect(sceneDoc.elements.has("b")).toBe(true);
  });

  it("clear empties the undo stack", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);
    h.push({ kind: "element", id: elementId("b"), before: null, after: rect("b") });
    h.clear();
    expect(h.canUndo).toBe(false);
  });

  it("transaction.commit coalesces pushes into one undo step", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);

    const tx = h.transaction();
    tx.add({ kind: "element", id: elementId("b"), before: null, after: rect("b") });
    tx.add({ kind: "element", id: elementId("c"), before: null, after: rect("c", 100) });
    tx.commit();

    expect(h.size).toBe(1);
    h.undo();
    // Both b and c rolled back together.
    expect(sceneDoc.elements.has("b")).toBe(false);
    expect(sceneDoc.elements.has("c")).toBe(false);
  });

  it("transaction.cancel discards buffered patches", () => {
    const sceneDoc = new SceneDoc();
    sceneDoc.replace(seed());
    const h = new CollabHistory(sceneDoc);
    const tx = h.transaction();
    tx.add({ kind: "element", id: elementId("b"), before: null, after: rect("b") });
    tx.cancel();
    expect(h.size).toBe(0);
    expect(sceneDoc.elements.has("b")).toBe(false);
  });
});
