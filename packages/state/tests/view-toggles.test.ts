/**
 * View toggles: hidden links are neither painted nor pressable (and drop
 * their selection); hidden comment pins are neither painted nor
 * hit-testable. Both are editor state — the scene is untouched.
 */
import { describe, expect, it, vi } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { getAnnotationWorldPosition } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";
import { actionToggleComments, actionToggleConnectors } from "../src/actions/index.js";

installBuiltinRenderers();

const makeTarget = () => {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_t, prop) => {
      if (prop === "size") return { width: 800, height: 600 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        if (prop === "measureText")
          return { width: typeof args[0] === "string" ? args[0].length * 7 : 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as never, calls };
};

const host = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: {},
} as never;

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

/** Two rectangles joined by a straight point-to-point link across the gap. */
const linkedScene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 100)).scene;
  s = addElement(s, rect("b", 400)).scene;
  const link: Link = {
    id: linkId("ab"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    style: {},
    from: { kind: "point", position: { x: 150, y: 125 } },
    to: { kind: "point", position: { x: 400, y: 125 } },
  };
  return addLink(s, link).scene;
};

const mount = () => {
  const main = makeTarget();
  const overlay = makeTarget();
  const editor = new Editor({
    host,
    mainTarget: main.target,
    overlayTarget: overlay.target,
    initialScene: linkedScene(),
  });
  editor.setViewportSize(800, 600);
  return { editor, main, overlay };
};

const paint = (editor: Editor, t: { calls: string[] }): string[] => {
  t.calls.length = 0;
  editor.forceRender();
  return [...t.calls];
};

describe("connectors view toggle", () => {
  it("hides the link from the main pass and restores it", () => {
    const { editor, main } = mount();
    const count = (calls: string[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const c of calls) out[c] = (out[c] ?? 0) + 1;
      return out;
    };
    const shown = count(paint(editor, main));
    editor.setShowConnectors(false);
    expect(editor.showConnectors).toBe(false);
    const hidden = count(paint(editor, main));
    // The link pass is its own save / setTransform / restore bracket on the
    // main target — hiding links drops exactly that bracket.
    expect(hidden.save).toBe((shown.save ?? 0) - 1);
    expect(hidden.setTransform).toBe((shown.setTransform ?? 0) - 1);
    editor.setShowConnectors(true);
    expect(count(paint(editor, main))).toEqual(shown);
    editor.dispose();
  });

  it("makes the link body unpressable and drops a selected link", () => {
    const { editor } = mount();
    const onBody = { x: 275, y: 125 };
    expect(editor.hitTest(onBody)).toEqual({ kind: "link", id: linkId("ab") });
    editor.selectLink(linkId("ab"));
    expect(editor.selectedLink).toBe(linkId("ab"));
    editor.setShowConnectors(false);
    expect(editor.hitTest(onBody)).toEqual({ kind: "empty" });
    expect(editor.selectedLink).toBeNull();
    // The scene itself is untouched.
    expect(editor.scene.links.size).toBe(1);
    editor.dispose();
  });

  it("is exposed as a view-mode toggle action without a default hotkey", () => {
    const { editor } = mount();
    expect(actionToggleConnectors.viewMode).toBe(true);
    expect(actionToggleConnectors.hotkey).toBeUndefined();
    actionToggleConnectors.perform({ editor } as never);
    expect(editor.showConnectors).toBe(false);
    expect(actionToggleConnectors.checked?.({ editor } as never)).toBe(false);
    editor.dispose();
  });
});

describe("comments view toggle", () => {
  it("hides annotation pins from the overlay, their hit-test and the selection", () => {
    const { editor, overlay } = mount();
    const id = editor.addAnnotation({ position: { x: 10, y: 10 }, elementId: elementId("a") });
    editor.setSelectedAnnotation(id);
    const pos = getAnnotationWorldPosition(editor.scene, editor.scene.annotations.get(id)!);
    expect(editor.hitAnnotation(pos)).toBe(id);
    const shown = paint(editor, overlay).length;
    editor.setShowComments(false);
    expect(editor.showComments).toBe(false);
    expect(editor.hitAnnotation(pos)).toBeNull();
    expect(editor.selectedAnnotation).toBeNull();
    expect(paint(editor, overlay).length).toBeLessThan(shown);
    expect(editor.scene.annotations.size).toBe(1);
    actionToggleComments.perform({ editor } as never);
    expect(editor.showComments).toBe(true);
    editor.dispose();
  });
});
