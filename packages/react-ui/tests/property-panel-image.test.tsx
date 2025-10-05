/**
 * Image shapes carry their pixels as content — a fill/background or
 * stroke/border control makes no sense for them. The floating panel hides
 * Fill / Stroke for an image-only selection while still offering opacity.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
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
import { DiagramProvider, PropertyPanel, TooltipProvider } from "../src/index";

installBuiltinRenderers();

const image: Element = {
  id: elementId("img1"),
  layerId: DEFAULT_LAYER_ID,
  type: "image",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  // Even with a stray fill/stroke set, the panel must not surface the
  // controls for an image.
  style: { fill: "#abc", stroke: "#000", strokeWidth: 2 },
  src: "data:,",
  width: 50,
  height: 50,
} as unknown as Element;

const rect: Element = {
  id: elementId("r1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc", stroke: "#000" },
  width: 50,
  height: 50,
};

const mountEditor = (...elements: Element[]): Editor => {
  let scene = emptyScene();
  for (const s of elements) ({ scene } = addElement(scene, s));
  const host = document.createElement("div");
  Object.defineProperty(host, "getBoundingClientRect", {
    value: () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });
  const noop = new Proxy({} as Record<string, unknown>, {
    get: (_, key) =>
      key === "size"
        ? { width: 800, height: 600 }
        : key === "measureText"
          ? () => ({ width: 0 })
          : () => {},
  }) as never;
  return new Editor({ host: host as never, mainTarget: noop, overlayTarget: noop, initialScene: scene });
};

const renderPanel = (editor: Editor) =>
  render(
    <TooltipProvider>
      <DiagramProvider editor={editor}>
        <PropertyPanel />
      </DiagramProvider>
    </TooltipProvider>,
  );

describe("PropertyPanel for image shapes", () => {
  it("hides Fill and Stroke controls for an image-only selection", () => {
    const editor = mountEditor(image);
    editor.setSelection([image.id]);
    const { container } = renderPanel(editor);
    expect(container.querySelector('button[aria-label="Fill color"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Stroke color"]')).toBeNull();
    // Opacity is still meaningful for an image.
    expect(container.querySelector('button[aria-label^="Opacity"]')).not.toBeNull();
    editor.dispose();
  });

  it("still shows Fill / Stroke for a rectangle selection", () => {
    const editor = mountEditor(rect);
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor);
    expect(container.querySelector('button[aria-label="Fill color"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Stroke color"]')).not.toBeNull();
    editor.dispose();
  });
});
