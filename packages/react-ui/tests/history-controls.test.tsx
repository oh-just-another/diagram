import { describe, expect, it } from "vitest";
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
import { DiagramProvider, HistoryControls, TooltipProvider } from "../src/index";

const rect: Element = {
  id: elementId("a"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 40,
} as unknown as Element;

const mountEditor = (): Editor => {
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
    initialScene: emptyScene(),
  });
};

const renderControls = (editor: Editor) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>
        <HistoryControls />
      </DiagramProvider>
    </TooltipProvider>,
  );

const button = (c: HTMLElement, prefix: string): HTMLButtonElement =>
  c.querySelector<HTMLButtonElement>(`[aria-label^="${prefix}"]`)!;

describe("HistoryControls", () => {
  it("disables both buttons on an empty history, then undoes and redoes", () => {
    const editor = mountEditor();
    const { container } = renderControls(editor);
    expect(button(container, "Undo").disabled).toBe(true);
    expect(button(container, "Redo").disabled).toBe(true);
    act(() => {
      editor.loadScene(addElement(editor.scene, rect).scene);
      editor.setSelection([rect.id]);
      editor.deleteSelected();
    });
    expect(editor.scene.elements.size).toBe(0);
    expect(button(container, "Undo").disabled).toBe(false);
    act(() => {
      fireEvent.click(button(container, "Undo"));
    });
    expect(editor.scene.elements.size).toBe(1);
    expect(button(container, "Redo").disabled).toBe(false);
    act(() => {
      fireEvent.click(button(container, "Redo"));
    });
    expect(editor.scene.elements.size).toBe(0);
  });

  it("disables in read-only mode even with history", () => {
    const editor = mountEditor();
    editor.loadScene(addElement(editor.scene, rect).scene);
    editor.setSelection([rect.id]);
    editor.deleteSelected();
    editor.setReadOnly(true);
    const { container } = renderControls(editor);
    expect(button(container, "Undo").disabled).toBe(true);
  });
});
