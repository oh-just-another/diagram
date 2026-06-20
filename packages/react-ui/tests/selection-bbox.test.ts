/**
 * Pin-test for `computeSelectionWorldBbox` — the helper that
 * `<SelectionFloatingPanel>` uses to derive a virtual-element rect
 * for floating-ui. Pure scene-coords math, no React, no DOM.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { _computeSelectionWorldBboxForTesting as computeBbox } from "../src/selection-floating-panel.js";

installBuiltinRenderers();

const rect = (id: string, x: number, y: number, w = 50, h = 30): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

const mkEditor = (...elements: Element[]): Editor => {
  let scene = emptyScene();
  for (const s of elements) ({ scene } = addElement(scene, s));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    }),
  });
  const noopTarget = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({
    host: host as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
};

describe("computeSelectionWorldBbox", () => {
  it("returns null when nothing is selected", () => {
    const editor = mkEditor(rect("a", 10, 20));
    expect(computeBbox(editor)).toBeNull();
    editor.dispose();
  });

  it("returns the bbox of a single selected shape", () => {
    const editor = mkEditor(rect("a", 10, 20, 50, 30));
    editor.setSelection([elementId("a")]);
    expect(computeBbox(editor)).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    editor.dispose();
  });

  it("returns the union when multiple shapes are selected", () => {
    // a at (0,0) 50×30, b at (100,100) 40×20 → union (0,0,140,120).
    const editor = mkEditor(rect("a", 0, 0, 50, 30), rect("b", 100, 100, 40, 20));
    editor.setSelection([elementId("a"), elementId("b")]);
    expect(computeBbox(editor)).toEqual({ x: 0, y: 0, width: 140, height: 120 });
    editor.dispose();
  });

  it("ignores selected ids that no longer exist in the scene", () => {
    const editor = mkEditor(rect("a", 5, 5, 10, 10));
    editor.setSelection([elementId("a"), elementId("ghost")]);
    expect(computeBbox(editor)).toEqual({ x: 5, y: 5, width: 10, height: 10 });
    editor.dispose();
  });

  // Group bounder returns 0×0 (scene/src/shape.ts:458). Without
  // descendant union, selecting a group anchors the floating panel
  // at a zero-pixel point so it appears nowhere.
  it("returns the union of descendants for a selected group", () => {
    // Two rects parented to a group. Group at (50, 50), children at
    // their own world positions (groups don't move children).
    const editor = mkEditor(rect("c1", 0, 0, 80, 40), rect("c2", 200, 100, 60, 30), {
      id: elementId("g"),
      layerId: DEFAULT_LAYER_ID,
      type: "group",
      position: { x: 50, y: 50 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
    } as Element);
    // Reparent children to the group.
    const apply = (id: string) => {
      const s = editor.scene.elements.get(elementId(id))!;
      const next = { ...s, parentId: elementId("g") } as Element;
      editor["_scene"] = (
        editor as unknown as {
          _scene: typeof editor.scene;
        }
      )._scene = ((scene) => {
        const map = new Map(scene.elements);
        map.set(next.id, next);
        return { ...scene, elements: map };
      })(editor.scene);
    };
    apply("c1");
    apply("c2");
    editor.setSelection([elementId("g")]);
    // Union of c1 (0,0,80,40) and c2 (200,100,60,30) → (0, 0, 260, 130).
    expect(computeBbox(editor)).toEqual({ x: 0, y: 0, width: 260, height: 130 });
    editor.dispose();
  });
});
