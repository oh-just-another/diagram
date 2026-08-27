/**
 * Canvas context menu (empty selection): the canvas-only rows, their check
 * marks bound to grid / preference state, the wheel-mode radio submenu, and
 * their absence when something is selected.
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

const rect = (id: string, locked = false): Element => ({
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
  ...(locked ? { locked: true } : {}),
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

const Opener = () => {
  const controller = useContextMenuController();
  useEffect(() => {
    controller?.open({ screenPoint: { x: 0, y: 0 }, worldPoint: { x: 500, y: 500 } });
  }, [controller]);
  return null;
};

const open = (editor: Editor) =>
  render(
    <DiagramProvider editor={editor}>
      <ContextMenuControllerProvider>
        <ContextMenu items={DEFAULT_CONTEXT_MENU} />
        <Opener />
      </ContextMenuControllerProvider>
    </DiagramProvider>,
  );

const rows = () =>
  [...document.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map((b) =>
    (b.textContent ?? "").replace(/[✓›]/g, "").trim(),
  );

describe("canvas context menu", () => {
  it("lists the canvas rows with check marks bound to state", () => {
    const editor = mountEditor(rect("a", true));
    editor.setGridVisible(true);
    const { unmount } = open(editor);
    const labels = rows();
    for (const expected of [
      "Paste",
      "Unlock all",
      "Add text",
      "Add sticky note",
      "Add comment",
      "Set current view as start",
      "Show gridG",
      "Snap to grid",
      "Snap objects",
      "Show object size",
      "Suggest object size",
      "Mouse or trackpad",
    ]) {
      expect(
        labels.some((l) => l.startsWith(expected)),
        expected,
      ).toBe(true);
    }
    // No start view saved yet → no "Set start view" row.
    expect(labels.some((l) => l === "Set start view")).toBe(false);
    const grid = document.querySelector('[role="menuitemcheckbox"][aria-checked="true"]');
    expect(grid?.textContent).toContain("Show grid");
    // Toggling a preference row flips the editor preference and closes the menu.
    const snap = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find((b) =>
      b.textContent?.includes("Snap objects"),
    )!;
    expect(snap.getAttribute("aria-checked")).toBe("true");
    act(() => {
      fireEvent.click(snap);
    });
    expect(editor.preferences.snapObjects).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    unmount();
    editor.dispose();
  });

  it("wheel-mode submenu is a radio group over the preference", () => {
    const editor = mountEditor();
    const { unmount } = open(editor);
    const trigger = [...document.querySelectorAll('[aria-haspopup="menu"]')].find((b) =>
      b.textContent?.includes("Mouse or trackpad"),
    )!;
    act(() => {
      fireEvent.mouseEnter(trigger);
    });
    const panel = document.querySelector('[role="menu"][aria-label="Mouse or trackpad"]')!;
    const checked = panel.querySelector('[aria-checked="true"]');
    expect(checked?.textContent).toContain("Auto-detect");
    const trackpad = [...panel.querySelectorAll('[role="menuitemcheckbox"]')].find((b) =>
      b.textContent?.includes("Trackpad"),
    )!;
    act(() => {
      fireEvent.click(trackpad);
    });
    expect(editor.preferences.wheelMode).toBe("trackpad");
    unmount();
    editor.dispose();
  });

  it("hides the canvas rows when something is selected", () => {
    const editor = mountEditor(rect("a"));
    editor.setSelection([elementId("a")]);
    const { unmount } = open(editor);
    const labels = rows();
    for (const absent of [
      "Add text",
      "Add sticky note",
      "Show grid",
      "Mouse or trackpad",
      "Show all",
    ]) {
      expect(
        labels.some((l) => l.startsWith(absent)),
        absent,
      ).toBe(false);
    }
    unmount();
    editor.dispose();
  });
});
