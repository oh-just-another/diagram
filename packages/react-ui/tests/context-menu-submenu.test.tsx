/**
 * Submenu rows in the context menu: hovering "Arrange" opens a child panel
 * with the z-order entries; picking one dispatches the action and closes.
 */
import { describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act, fireEvent, render } from "@testing-library/react";
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
import {
  ContextMenu,
  ContextMenuControllerProvider,
  DEFAULT_CONTEXT_MENU,
  DiagramProvider,
  useContextMenuController,
} from "../src/index";

installBuiltinRenderers();

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 40,
});

const mountEditor = (...elements: Element[]): Editor => {
  let scene = emptyScene();
  for (const s of elements) ({ scene } = addElement(scene, s));
  const host = document.createElement("div");
  const noop = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({
    host: host as never,
    mainTarget: noop,
    overlayTarget: noop,
    initialScene: scene,
  });
};

/** Opens the menu at (0,0) on mount through the controller channel. */
const Opener = () => {
  const controller = useContextMenuController();
  useEffect(() => {
    controller?.open({ screenPoint: { x: 0, y: 0 }, worldPoint: { x: 0, y: 0 } });
  }, [controller]);
  return null;
};

describe("ContextMenu submenu", () => {
  it("opens Arrange on hover and dispatches a nested z-order action", () => {
    const editor = mountEditor(rect("a"), rect("b"));
    editor.setSelection([elementId("a")]);
    const orderBefore = editor.scene.elements.get(elementId("a"))!.order;
    const { unmount } = render(
      <DiagramProvider editor={editor}>
        <ContextMenuControllerProvider>
          <ContextMenu items={DEFAULT_CONTEXT_MENU} />
          <Opener />
        </ContextMenuControllerProvider>
      </DiagramProvider>,
    );
    const arrange = document.querySelector('[role="menuitem"][aria-haspopup="menu"]');
    expect(arrange?.textContent).toContain("Arrange");
    // Z-order rows are not at the top level.
    expect(document.querySelector('[role="menu"][aria-label="Arrange"]')).toBeNull();
    act(() => {
      fireEvent.mouseEnter(arrange!);
    });
    const panel = document.querySelector('[role="menu"][aria-label="Arrange"]');
    expect(panel).not.toBeNull();
    const front = [...panel!.querySelectorAll('[role="menuitem"]')].find((b) =>
      b.textContent?.includes("Bring to front"),
    );
    expect(front).not.toBeNull();
    act(() => {
      fireEvent.click(front!);
    });
    expect(editor.scene.elements.get(elementId("a"))!.order).not.toBe(orderBefore);
    // Picking an item closes the whole menu.
    expect(document.querySelector('[role="menu"]')).toBeNull();
    unmount();
    editor.dispose();
  });
});
