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
    const trigger = container.querySelector('button[aria-label="Switch type"]');
    expect(trigger).not.toBeNull();
    // Targets are hidden behind the trigger until it is clicked.
    expect(document.querySelector('[role="menuitemradio"][aria-label="Ellipse"]')).toBeNull();
    fireEvent.click(trigger!);
    const rectRow = document.querySelector('[role="menuitemradio"][aria-label="Rectangle"]');
    expect(rectRow?.getAttribute("aria-checked")).toBe("true");
    const ellipseRow = document.querySelector('[role="menuitemradio"][aria-label="Ellipse"]');
    expect(ellipseRow).not.toBeNull();
    fireEvent.click(ellipseRow!);
    expect(isEllipse(editor.scene.elements.get(rect.id)!)).toBe(true);
    // Menu closes after a pick.
    expect(document.querySelector('[role="menuitemradio"][aria-label="Ellipse"]')).toBeNull();
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

describe("SelectionFilterControl (mixed selections)", () => {
  const sticky: Element = {
    id: elementId("s1"),
    layerId: DEFAULT_LAYER_ID,
    type: "sticky",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 160,
    height: 160,
  } as unknown as Element;

  it("mixed selection shows the Filter; picking a bucket narrows the selection", () => {
    const editor = mountEditor(rect, image, sticky);
    editor.setSelection([rect.id, image.id, sticky.id]);
    const { container, getByRole } = renderPanel(editor);
    // Mixed → per-type controls are gone, Filter present.
    expect(container.querySelector('[aria-label="Switch type"]')).toBeNull();
    const trigger = container.querySelector('button[aria-label="Filter selection by type"]');
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);
    // Menu lists buckets with counts.
    const stickyRow = getByRole("menuitem", { name: "Select only Sticky notes" });
    expect(stickyRow.textContent).toContain("1");
    fireEvent.click(stickyRow);
    expect([...editor.selection]).toEqual([sticky.id]);
  });

  it("uniform selection shows no Filter", () => {
    const editor = mountEditor(rect);
    editor.setSelection([rect.id]);
    const { container } = renderPanel(editor);
    expect(container.querySelector('button[aria-label="Filter selection by type"]')).toBeNull();
  });
});

describe("PropertyPanel control groups", () => {
  it("wraps controls in groups (separators are CSS between non-empty groups) and renders no divider elements", () => {
    const sticky: Element = {
      ...rect,
      id: elementId("s1"),
      type: "sticky",
      style: {},
      width: 160,
      height: 160,
    } as unknown as Element;
    for (const shape of [rect, image, sticky]) {
      const editor = mountEditor(shape);
      editor.setSelection([shape.id]);
      const { container, unmount } = renderPanel(editor);
      const panel = container.querySelector(".du-sel-panel")!;
      expect(panel.querySelector(".du-sel-divider")).toBeNull();
      const groups = [...panel.children];
      expect(groups.length).toBeGreaterThan(1);
      expect(groups.every((g) => g.classList.contains("du-sel-group"))).toBe(true);
      unmount();
      editor.dispose();
    }
  });
});

describe("PropertyPanel text controls for label-capable shapes", () => {
  it("a rectangle without text still shows the text controls (defaults)", () => {
    const editor = mountEditor(rect);
    editor.setSelection([rect.id]);
    const { container, unmount } = renderPanel(editor);
    expect(container.querySelector('[aria-label^="Font family"]')).not.toBeNull();
    expect(container.querySelector('[aria-label^="Font size"]')).not.toBeNull();
    unmount();
    editor.dispose();
  });
});
