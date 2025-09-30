import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { captureFromEditor, restoreSnapshot, SnapshotStore, versionId } from "../src/index";

const author = { id: "u1", name: "Alice" };

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

const makeStubEditor = (initial: Scene) => {
  let scene = initial;
  return {
    get scene() {
      return scene;
    },
    loadScene(next: Scene) {
      scene = next;
    },
  };
};

describe("editor bridge", () => {
  it("captureFromEditor stores the editor's scene", () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, rect("a")));
    const editor = makeStubEditor(scene);
    const store = new SnapshotStore();
    const snap = captureFromEditor(store, editor, { message: "first", author });
    expect(snap.scene).toBe(scene);
    expect(store.list()).toHaveLength(1);
  });

  it("restoreSnapshot replaces editor scene", () => {
    let original = emptyScene();
    ({ scene: original } = addElement(original, rect("a")));
    const editor = makeStubEditor(original);
    const store = new SnapshotStore();
    const snap = captureFromEditor(store, editor, { message: "v1", author });

    // Mutate editor: drop the shape locally.
    editor.loadScene(emptyScene());
    expect(editor.scene.shapes.size).toBe(0);

    // Restore.
    const ok = restoreSnapshot(store, editor, snap.id);
    expect(ok).toBe(true);
    expect(editor.scene.shapes.size).toBe(1);
  });

  it("restoreSnapshot returns false for unknown id", () => {
    const editor = makeStubEditor(emptyScene());
    const store = new SnapshotStore();
    expect(restoreSnapshot(store, editor, versionId("none"))).toBe(false);
  });
});
