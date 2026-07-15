/**
 * Brush width in the property panel: a brush-only selection gets a popover
 * range slider (the Thin/Medium/Thick `style.strokeWidth` segments have no
 * effect on baked brush widths) that re-bases the stroke via
 * `editor.setBrushWidth`.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type BrushElement,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, PropertyPanel, TooltipProvider } from "../src/index";

installBuiltinRenderers();

const brush: BrushElement = {
  id: elementId("b1"),
  layerId: DEFAULT_LAYER_ID,
  type: "brush",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  points: [
    { x: 0, y: 0, width: 3 },
    { x: 10, y: 0, width: 4.2 },
    { x: 20, y: 0, width: 1.8 },
  ],
  baseWidth: 6,
};

const mountEditor = (...elements: Element[]): Editor => {
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

const renderPanel = (editor: Editor) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>
        <PropertyPanel />
      </DiagramProvider>
    </TooltipProvider>,
  );

describe("PropertyPanel brush width control", () => {
  it("a brush selection shows the slider popover instead of the segmented widths", () => {
    const editor = mountEditor(brush);
    editor.setSelection([brush.id]);
    const { container } = renderPanel(editor);
    // No Thin/Medium/Thick group for brushes…
    expect(container.querySelector('[role="group"][aria-label="Stroke width"]')).toBeNull();
    // …but the popover trigger is there.
    const trigger = container.querySelector('button[aria-label="Brush width"]');
    expect(trigger).not.toBeNull();
    editor.dispose();
  });

  it("dragging the slider re-bases the baked widths", () => {
    const editor = mountEditor(brush);
    editor.setSelection([brush.id]);
    const { container } = renderPanel(editor);
    fireEvent.click(container.querySelector('button[aria-label="Brush width"]')!);
    const slider = document.querySelector('input[aria-label="Brush width"]');
    expect(slider).not.toBeNull();
    fireEvent.change(slider!, { target: { value: "12" } });
    const el = editor.scene.elements.get(brush.id) as BrushElement;
    expect(el.points.map((p) => p.width)).toEqual([6, 8.4, 3.6]);
    expect(el.baseWidth).toBe(12);
    editor.dispose();
  });
});
