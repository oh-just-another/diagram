import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { emptyScene } from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, DrawingPanel } from "../src/index";

installBuiltinRenderers();

const mountEditor = (): Editor => {
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

const renderPanel = (editor: Editor) =>
  render(
    <DiagramProvider editor={editor}>
      <DrawingPanel />
    </DiagramProvider>,
  );

describe("DrawingPanel", () => {
  afterEach(() => cleanup());

  it("renders nothing outside brush / eraser mode", () => {
    const editor = mountEditor();
    editor.setActiveTool("select");
    const { container } = renderPanel(editor);
    expect(container.querySelector(".du-drawing-panel")).toBeNull();
    editor.dispose();
  });

  it("shows stroke / fill / opacity / width controls in brush mode", () => {
    const editor = mountEditor();
    act(() => editor.setActiveTool("brush"));
    const { container } = renderPanel(editor);
    expect(container.querySelector(".du-drawing-panel")).not.toBeNull();
    expect(container.querySelector('input[aria-label="Brush opacity"]')).not.toBeNull();
    const width = container.querySelector('input[aria-label="Brush width"]') as HTMLInputElement;
    expect(width).not.toBeNull();
    // Dragging the width slider writes through to the editor's brush settings.
    fireEvent.change(width, { target: { value: "24" } });
    expect(editor.brushSettings.width).toBe(24);
    editor.dispose();
  });

  it("shows only the radius (width) control in eraser mode", () => {
    const editor = mountEditor();
    act(() => editor.setActiveTool("erase"));
    const { container } = renderPanel(editor);
    expect(container.querySelector(".du-drawing-panel")).not.toBeNull();
    // Eraser exposes the shared width as "radius", and hides brush-only paint.
    expect(container.querySelector('input[aria-label="Eraser radius"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Brush opacity"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Brush width"]')).toBeNull();
    editor.dispose();
  });
});
