/**
 * F9 convert-type + F10 crop entry controls in the property panel.
 * - A rectangle selection surfaces a "Shape type" segmented control whose
 *   segments convert the shape in place.
 * - A single image selection surfaces a "Crop image" button that enters
 *   crop mode.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  isEllipse,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "@oh-just-another/state";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { DiagramProvider, PropertyPanel, TooltipProvider } from "../src/index";

installBuiltinRenderers();

const rect: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 60,
  height: 40,
};

const image: Element = {
  id: elementId("img1"),
  layerId: DEFAULT_LAYER_ID,
  type: "image",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  src: "data:,",
  width: 100,
  height: 80,
} as unknown as Element;

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

describe("PropertyPanel convert-type control (F9)", () => {
  it("converts a rectangle to an ellipse on segment click", () => {
    const editor = mountEditor(rect);
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor);
    const group = container.querySelector('[role="group"][aria-label="Switch type"]');
    expect(group).not.toBeNull();
    const ellipseBtn = group!.querySelector('button[aria-label="Ellipse"]');
    expect(ellipseBtn).not.toBeNull();
    fireEvent.click(ellipseBtn!);
    expect(isEllipse(editor.scene.elements.get(rect.id)!)).toBe(true);
    editor.dispose();
  });
});

describe("PropertyPanel crop control (F10)", () => {
  it("enters crop mode when the Crop button is clicked", () => {
    const editor = mountEditor(image);
    editor.setSelection([image.id]);
    const { container } = renderPanel(editor);
    const cropBtn = container.querySelector('button[aria-label="Crop image"]');
    expect(cropBtn).not.toBeNull();
    fireEvent.click(cropBtn!);
    expect(editor.activeTool.type).toBe("crop");
    expect(editor.imageCropSession?.id).toBe(image.id);
    editor.dispose();
  });
});
